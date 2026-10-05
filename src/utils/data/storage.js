import { Preferences } from '@capacitor/preferences';
import {
  clampCustomActivityMultiplier,
  DEFAULT_ACTIVITY_MULTIPLIERS,
} from '../../constants/activity/activityPresets.js';
import { cardioTypes as baseCardioTypes } from '../../constants/cardio/cardioTypes.js';
import {
  deleteHistoryDocumentsFromDexie,
  loadAllHistoryDocuments,
  saveHistoryToDexie,
  saveHistoryDocumentsToDexie,
} from './historyDatabase.js';
import { normalizeDateKey, sortWeightEntries } from '../measurements/weight.js';
import { clampBodyFat, sortBodyFatEntries } from '../measurements/bodyFat.js';
import { sanitizeAge, sanitizeHeight } from '../measurements/profile.js';
import { isStepBasedCardioType } from '../calculations/steps.js';
import {
  deriveSessionTimestamps,
  getTimeOfDayFromEpochMs,
  normalizeTimeOfDay,
} from '../formatting/time.js';
import {
  createDefaultPhaseLogV2State,
  normalizePhaseLogV2State,
} from './phaseLogV2.js';
import {
  DEFAULT_MACRO_RECOMMENDATION_SPLIT,
  EMPTY_MACRO_LOCKS,
  normalizeMacroLocks,
  normalizeMacroRecommendationSplit,
} from '../calculations/macroRecommendations.js';
import {
  NUTRIENT_KEYS,
  normalizeNutrientValue,
} from '../../constants/nutrients/nutrients.js';

// Split keys for performance
const PROFILE_KEY = 'energyMapData_profile'; // Settings, preferences, small lists
const LAST_SELECTED_CARDIO_TYPE_KEY = 'energyMapLastSelectedCardioType';

const SELECTED_DAY_KEY = 'energyMapSelectedDay';
const MAX_CACHED_FOODS = 500;

const HISTORY_FIELDS = [
  'weightEntries',
  'bodyFatEntries',
  'stepEntries',
  'nutritionData',
  'phaseLogV2',
  'cardioSessions',
  'trainingSessions',
  'cachedFoods',
  'dailySnapshots',
  'dailyNeatOverrides',
];

const buildPhaseLogV2Indexes = (phaseLogV2State) => {
  const logIdsByPhaseId = {};
  const logIdByPhaseDate = {};

  phaseLogV2State.phaseOrder.forEach((phaseId) => {
    logIdsByPhaseId[phaseId] = [];
    logIdByPhaseDate[phaseId] = {};
  });

  Object.values(phaseLogV2State.logsById ?? {}).forEach((log) => {
    if (!log || typeof log !== 'object') {
      return;
    }

    const phaseId = log.phaseId;
    if (phaseId == null || !phaseLogV2State.phasesById?.[phaseId]) {
      return;
    }

    if (!logIdsByPhaseId[phaseId]) {
      logIdsByPhaseId[phaseId] = [];
    }
    if (!logIdByPhaseDate[phaseId]) {
      logIdByPhaseDate[phaseId] = {};
    }

    logIdsByPhaseId[phaseId].push(log.id);
    if (typeof log.date === 'string' && log.date.trim().length > 0) {
      logIdByPhaseDate[phaseId][log.date] = log.id;
    }
  });

  Object.entries(logIdsByPhaseId).forEach(([, logIds]) => {
    logIds.sort((a, b) => {
      const logA = phaseLogV2State.logsById?.[a];
      const logB = phaseLogV2State.logsById?.[b];
      const dateA = typeof logA?.date === 'string' ? logA.date : '';
      const dateB = typeof logB?.date === 'string' ? logB.date : '';
      return dateA.localeCompare(dateB);
    });
  });

  return {
    logIdsByPhaseId,
    logIdByPhaseDate,
  };
};

const SHARDED_HISTORY_FIELD_CONFIG = {
  nutritionData: {
    prefix: 'nutritionData:',
    shardEntries: (value) => {
      if (!value || typeof value !== 'object') {
        return [];
      }

      return Object.entries(value)
        .filter(([date]) => typeof date === 'string' && date.trim().length > 0)
        .map(([date, meals]) => ({
          key: date,
          source: meals,
          sourceRef: meals,
          order: 0,
        }));
    },
    toPayload: ({ source }) =>
      source && typeof source === 'object' ? source : {},
    fromDocuments: (documents) => {
      const next = {};
      documents.forEach(({ key, payload }) => {
        if (!key) return;
        next[key] = payload && typeof payload === 'object' ? payload : {};
      });
      return next;
    },
  },
  weightEntries: {
    prefix: 'weightEntries:',
    shardEntries: (value) => {
      if (!Array.isArray(value)) {
        return [];
      }

      return value
        .map((entry) => {
          const dateKey = normalizeDateKey(entry?.date);
          const weightValue = Number(entry?.weight);
          if (!dateKey || !Number.isFinite(weightValue)) {
            return null;
          }

          return { key: dateKey, source: entry, sourceRef: entry, order: 0 };
        })
        .filter(Boolean);
    },
    toPayload: ({ key, source }) => ({
      date: key,
      weight: Number(source?.weight),
    }),
    fromDocuments: (documents) =>
      documents
        .map(({ payload }) => payload)
        .filter(
          (entry) => normalizeDateKey(entry?.date) && entry?.weight != null
        ),
  },
  bodyFatEntries: {
    prefix: 'bodyFatEntries:',
    shardEntries: (value) => {
      if (!Array.isArray(value)) {
        return [];
      }

      return value
        .map((entry) => {
          const dateKey = normalizeDateKey(entry?.date);
          const bodyFatValue = clampBodyFat(entry?.bodyFat);
          if (!dateKey || bodyFatValue == null) {
            return null;
          }

          return { key: dateKey, source: entry, sourceRef: entry, order: 0 };
        })
        .filter(Boolean);
    },
    toPayload: ({ key, source }) => ({
      date: key,
      bodyFat: clampBodyFat(source?.bodyFat),
    }),
    fromDocuments: (documents) =>
      documents
        .map(({ payload }) => payload)
        .filter(
          (entry) =>
            normalizeDateKey(entry?.date) &&
            clampBodyFat(entry?.bodyFat) != null
        ),
  },
  stepEntries: {
    prefix: 'stepEntries:',
    shardEntries: (value) => {
      if (!Array.isArray(value)) {
        return [];
      }

      return value
        .map((entry) => {
          const dateKey = normalizeDateKey(entry?.date);
          const numericSteps = Number(entry?.steps);
          if (!dateKey || !Number.isFinite(numericSteps) || numericSteps < 0) {
            return null;
          }

          return { key: dateKey, source: entry, sourceRef: entry, order: 0 };
        })
        .filter(Boolean);
    },
    toPayload: ({ key, source }) => ({
      date: key,
      steps: Math.round(Number(source?.steps)),
      source: source?.source ?? 'manual',
    }),
    fromDocuments: (documents) =>
      documents
        .map(({ payload }) => payload)
        .filter(
          (entry) =>
            normalizeDateKey(entry?.date) &&
            Number.isFinite(Number(entry?.steps)) &&
            Number(entry?.steps) >= 0
        ),
  },
  cardioSessions: {
    prefix: 'cardioSessions:',
    shardEntries: (value) => {
      if (!Array.isArray(value)) {
        return [];
      }

      return value
        .map((session, index) => {
          if (!session || typeof session !== 'object') {
            return null;
          }

          const sessionId =
            session.id != null ? String(session.id) : `fallback-${index}`;

          return {
            key: sessionId,
            source: session,
            sourceRef: session,
            order: index,
          };
        })
        .filter(Boolean);
    },
    toPayload: ({ key, source, order }) => ({
      ...source,
      id: key,
      __order: order,
    }),
    fromDocuments: (documents) =>
      documents
        .map(({ payload }) => payload)
        .filter(Boolean)
        .sort((a, b) => (a?.__order ?? 0) - (b?.__order ?? 0))
        .map((payload) => {
          const session = { ...payload };
          delete session.__order;
          return session;
        }),
  },
  trainingSessions: {
    prefix: 'trainingSessions:',
    shardEntries: (value) => {
      if (!Array.isArray(value)) {
        return [];
      }

      return value
        .map((session, index) => {
          if (!session || typeof session !== 'object') {
            return null;
          }

          const sessionId =
            session.id != null ? String(session.id) : `fallback-${index}`;

          return {
            key: sessionId,
            source: session,
            sourceRef: session,
            order: index,
          };
        })
        .filter(Boolean);
    },
    toPayload: ({ key, source, order }) => ({
      ...source,
      id: key,
      __order: order,
    }),
    fromDocuments: (documents) =>
      documents
        .map(({ payload }) => payload)
        .filter(Boolean)
        .sort((a, b) => (a?.__order ?? 0) - (b?.__order ?? 0))
        .map((payload) => {
          const session = { ...payload };
          delete session.__order;
          return session;
        }),
  },
  cachedFoods: {
    prefix: 'cachedFoods:',
    shardEntries: (value) => {
      const normalized = normalizeCachedFoodsForPersistence(value);
      if (!Array.isArray(normalized)) {
        return [];
      }

      return normalized
        .map((entry, index) => ({
          key: getFoodCacheIdentity(entry, index),
          source: entry,
          sourceRef: entry,
          order: index,
        }))
        .filter(
          (entry) => typeof entry.key === 'string' && entry.key.length > 0
        );
    },
    toPayload: ({ source, order }) => ({
      entry: source,
      __order: order,
    }),
    fromDocuments: (documents) =>
      documents
        .map(({ payload }) => payload)
        .filter(Boolean)
        .sort((a, b) => (a?.__order ?? 0) - (b?.__order ?? 0))
        .map((payload) => payload?.entry)
        .filter(Boolean),
  },
  phaseLogV2: {
    prefix: 'phaseLogV2:',
    // `normalizePhaseLogV2State` rebuilds fresh phase/log objects on every call,
    // so a moved reference does not prove the content changed — this is the one
    // field that keeps the previous payload to compare against. Every other field
    // relies on reference equality alone (see buildShardedFieldDiff), which is
    // what keeps the persistence layer from retaining a second copy of history.
    needsStructuralCompare: true,
    shardEntries: (value) => {
      const normalized = normalizePhaseLogV2State(value);
      const entries = [
        { key: 'meta', source: normalized, sourceRef: normalized, order: 0 },
      ];

      Object.entries(normalized.phasesById).forEach(([phaseId, phase]) => {
        entries.push({
          key: `phase:${phaseId}`,
          source: phase,
          sourceRef: phase,
          order: 0,
        });
      });

      Object.entries(normalized.logsById).forEach(([logId, log]) => {
        entries.push({
          key: `log:${logId}`,
          source: log,
          sourceRef: log,
          order: 0,
        });
      });

      return entries;
    },
    toPayload: ({ key, source }) =>
      key === 'meta'
        ? {
            version: source.version,
            phaseOrder: source.phaseOrder,
            activePhaseId: source.activePhaseId,
          }
        : source,
    fromDocuments: (documents) => {
      const phasesById = {};
      const logsById = {};
      let meta = null;

      documents.forEach(({ key, payload }) => {
        if (key === 'meta') {
          meta = payload;
          return;
        }

        if (typeof key !== 'string') {
          return;
        }

        if (key.startsWith('phase:')) {
          const phaseId = key.slice('phase:'.length);
          if (!phaseId) {
            return;
          }
          phasesById[phaseId] = payload;
          return;
        }

        if (key.startsWith('log:')) {
          const logId = key.slice('log:'.length);
          if (!logId) {
            return;
          }
          logsById[logId] = payload;
        }
      });

      const fallbackPhaseOrder = Object.keys(phasesById);
      const phaseOrder = Array.isArray(meta?.phaseOrder)
        ? meta.phaseOrder
        : fallbackPhaseOrder;

      const indexed = buildPhaseLogV2Indexes({
        phasesById,
        phaseOrder,
        logsById,
      });

      return normalizePhaseLogV2State({
        version: Number(meta?.version) || undefined,
        phasesById,
        phaseOrder,
        activePhaseId: meta?.activePhaseId ?? null,
        logsById,
        logIdsByPhaseId: indexed.logIdsByPhaseId,
        logIdByPhaseDate: indexed.logIdByPhaseDate,
      });
    },
  },
  dailySnapshots: {
    prefix: 'dailySnapshots:',
    shardEntries: (value) => {
      if (!value || typeof value !== 'object') {
        return [];
      }

      return Object.entries(value)
        .map(([dateKey, snapshot]) => {
          const normalizedDateKey = normalizeDateKey(dateKey);
          if (!normalizedDateKey || !snapshot || typeof snapshot !== 'object') {
            return null;
          }

          return {
            key: normalizedDateKey,
            source: snapshot,
            sourceRef: snapshot,
            order: 0,
          };
        })
        .filter(Boolean);
    },
    toPayload: ({ key, source }) => ({ ...source, date: key }),
    fromDocuments: (documents) => {
      const next = {};

      documents.forEach(({ key, payload }) => {
        const normalizedDateKey = normalizeDateKey(key);
        if (!normalizedDateKey || !payload || typeof payload !== 'object') {
          return;
        }

        next[normalizedDateKey] = {
          ...payload,
          date: normalizedDateKey,
        };
      });

      return next;
    },
  },
  dailyNeatOverrides: {
    prefix: 'dailyNeatOverrides:',
    shardEntries: (value) => {
      if (!value || typeof value !== 'object') {
        return [];
      }

      return Object.entries(value)
        .map(([dateKey, override]) => {
          const normalizedDateKey = normalizeDateKey(dateKey);
          if (
            !normalizedDateKey ||
            !override ||
            typeof override !== 'object' ||
            !Number.isFinite(Number(override?.multiplier))
          ) {
            return null;
          }

          return {
            key: normalizedDateKey,
            source: override,
            sourceRef: override,
            order: 0,
          };
        })
        .filter(Boolean);
    },
    toPayload: ({ source }) => source,
    fromDocuments: (documents) => {
      const next = {};

      documents.forEach(({ key, payload }) => {
        const normalizedDateKey = normalizeDateKey(key);
        if (
          !normalizedDateKey ||
          !payload ||
          typeof payload !== 'object' ||
          !Number.isFinite(Number(payload?.multiplier))
        ) {
          return;
        }

        next[normalizedDateKey] = payload;
      });

      return next;
    },
  },
};

const SHARDED_HISTORY_FIELDS = Object.keys(SHARDED_HISTORY_FIELD_CONFIG);

const ACTIVITY_DAY_TYPES = ['training', 'rest'];
const GOAL_KEYS = new Set([
  'aggressive_bulk',
  'bulking',
  'maintenance',
  'cutting',
  'aggressive_cut',
]);
const MIN_EPOC_CARRYOVER_HOURS = 1;
const MAX_EPOC_CARRYOVER_HOURS = 24;
const ADAPTIVE_THERMOGENESIS_SMOOTHING_METHODS = new Set(['ema', 'sma']);
const MIN_ADAPTIVE_SMOOTHING_WINDOW_DAYS = 3;
const MAX_ADAPTIVE_SMOOTHING_WINDOW_DAYS = 14;
const FOOD_SEARCH_DEFAULT_ENTRIES = new Set([
  'search_local',
  'search_online',
  'favourites',
  'chat',
  'manual_entry',
  'barcode',
]);
let lastSavedProfileSerialized = null;
// Identity-based persistence baselines. History fields are replaced immutably
// by the store, so a field only needs work when its reference moves, and a
// shard only needs re-reading when its own source reference / order moves.
// This replaces whole-field + whole-shard `JSON.stringify` diffing, which was
// O(entire history) on every debounced save (the data-scale lag).
let lastSavedHistoryRefByField = new Map();
let lastSavedShardIdentityByField = new Map();

const parseJsonOrEmpty = (value) => {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.warn('Failed to parse stored JSON payload', error);
    return {};
  }
};

const normalizeSelectedGoal = (value, fallback = 'maintenance') => {
  const normalized = String(value ?? '').trim();
  return GOAL_KEYS.has(normalized) ? normalized : fallback;
};

const normalizeGoalChangedAt = (value, fallback = Date.now()) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.round(parsed);
};

const normalizeTrainingTypeKey = (value) => {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return null;
  }

  return normalized;
};

const normalizeFoodSearchDefaultEntry = (value, fallback = 'search_local') => {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();

  return FOOD_SEARCH_DEFAULT_ENTRIES.has(normalized) ? normalized : fallback;
};

const normalizeStringArray = (value, fallback = []) => {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return value
    .map((entry) => String(entry ?? '').trim())
    .filter((entry) => entry.length > 0);
};

const normalizeTrainingTypeCatalog = (raw) => {
  const source =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};

  return Object.entries(source).reduce((acc, [typeKey, value]) => {
    if (!value || typeof value !== 'object') {
      return acc;
    }

    const normalizedTypeKey = normalizeTrainingTypeKey(typeKey);
    if (!normalizedTypeKey) {
      return acc;
    }

    const numericCalories = Number(value.caloriesPerHour);
    acc[normalizedTypeKey] = {
      label:
        typeof value.label === 'string' && value.label.trim().length > 0
          ? value.label.trim()
          : normalizedTypeKey,
      caloriesPerHour: Number.isFinite(numericCalories)
        ? Math.max(0, numericCalories)
        : 0,
    };

    return acc;
  }, {});
};

const resolveSelectedTrainingType = ({
  selectedTrainingType,
  trainingTypeCatalog,
  fallback,
}) => {
  const normalized = normalizeTrainingTypeKey(selectedTrainingType);
  if (normalized && trainingTypeCatalog[normalized]) {
    return normalized;
  }

  if (fallback && trainingTypeCatalog[fallback]) {
    return fallback;
  }

  const firstAvailable = Object.keys(trainingTypeCatalog)[0];
  return firstAvailable || fallback || 'trainingtype_1';
};

const encodeShardKey = (value) =>
  encodeURIComponent(String(value ?? '').trim());

const decodeShardKey = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const buildShardedDocumentId = (prefix, key) =>
  `${prefix}${encodeShardKey(key)}`;

const parseShardedDocument = (id) => {
  for (const fieldName of SHARDED_HISTORY_FIELDS) {
    const { prefix } = SHARDED_HISTORY_FIELD_CONFIG[fieldName];
    if (!String(id).startsWith(prefix)) {
      continue;
    }

    const encodedKey = String(id).slice(prefix.length);
    return {
      fieldName,
      key: decodeShardKey(encodedKey),
    };
  }

  return null;
};

export const reconstructHistoryFromDexieDocuments = (documents = []) => {
  const historyData = {};
  const shardedBuckets = new Map(
    SHARDED_HISTORY_FIELDS.map((field) => [field, []])
  );
  const shardDocIdsByField = new Map(
    SHARDED_HISTORY_FIELDS.map((field) => [field, new Set()])
  );

  documents.forEach((document) => {
    const documentId = document?.id;
    if (typeof documentId !== 'string') {
      return;
    }

    if (HISTORY_FIELDS.includes(documentId)) {
      historyData[documentId] = document.payload;
      return;
    }

    const parsedShardedDoc = parseShardedDocument(documentId);
    if (!parsedShardedDoc) {
      return;
    }

    const { fieldName, key } = parsedShardedDoc;
    shardedBuckets.get(fieldName)?.push({
      key,
      payload: document.payload,
    });
    shardDocIdsByField.get(fieldName)?.add(documentId);
  });

  SHARDED_HISTORY_FIELDS.forEach((fieldName) => {
    const bucket = shardedBuckets.get(fieldName) ?? [];
    if (bucket.length === 0) {
      return;
    }

    historyData[fieldName] =
      SHARDED_HISTORY_FIELD_CONFIG[fieldName].fromDocuments(bucket);
  });

  return {
    historyData,
    hasAnyHistory: Array.isArray(documents) && documents.length > 0,
    shardDocIdsByField,
  };
};

/**
 * Structural fallback for the rare case where a shard's source reference moved
 * but its payload is byte-identical (e.g. `normalizePhaseLogV2State` rebuilds
 * fresh objects on every call). Reference equality is checked first, so this
 * only ever runs for shards whose reference actually changed.
 */
const areShardPayloadsEqual = (previousPayload, nextPayload) => {
  if (previousPayload === nextPayload) {
    return true;
  }
  if (previousPayload == null || nextPayload == null) {
    return false;
  }
  try {
    return JSON.stringify(previousPayload) === JSON.stringify(nextPayload);
  } catch {
    return false;
  }
};

/**
 * Build the identity record for one shard. Only fields flagged
 * `needsStructuralCompare` retain the payload (for a later structural compare).
 * Everything else keeps just its source reference + order, so the persistence
 * layer never holds a second in-memory copy of the history.
 */
const buildIdentityEntry = (config, entry) => ({
  sourceRef: entry.sourceRef,
  order: entry.order,
  payload: config.needsStructuralCompare ? config.toPayload(entry) : undefined,
});

/**
 * Diff one sharded field against its last-persisted identity map, returning
 * only the documents that must be written or deleted. Unchanged shards are
 * skipped by reference equality (no payload build, no serialization), which is
 * what keeps a save O(changed) instead of O(entire history).
 */
const buildShardedFieldDiff = (config, previousIdentityMap, fieldValue) => {
  const entries = config.shardEntries(fieldValue);
  const nextIdentityMap = new Map();
  const documents = [];

  entries.forEach((entry) => {
    const id = buildShardedDocumentId(config.prefix, entry.key);
    const previous = previousIdentityMap.get(id);

    const referenceChanged =
      !previous ||
      previous.sourceRef !== entry.sourceRef ||
      previous.order !== entry.order;

    if (!referenceChanged) {
      // Reuse the previous identity object: no allocation, no payload rebuild.
      nextIdentityMap.set(id, previous);
      return;
    }

    const payload = config.toPayload(entry);

    if (config.needsStructuralCompare) {
      // A structural rebuild can re-create identical content, so keep the
      // payload to compare against next time (bounded: phases + daily logs).
      nextIdentityMap.set(id, {
        sourceRef: entry.sourceRef,
        order: entry.order,
        payload,
      });
      if (!previous || !areShardPayloadsEqual(previous.payload, payload)) {
        documents.push({ id, payload });
      }
      return;
    }

    // Reference/order equality is authoritative for the immutable store fields,
    // so a moved reference IS a content change. Retain only the reference so the
    // identity map stays O(shards) rather than a second copy of the history.
    nextIdentityMap.set(id, {
      sourceRef: entry.sourceRef,
      order: entry.order,
      payload: undefined,
    });
    documents.push({ id, payload });
  });

  const deletes = [];
  previousIdentityMap.forEach((_identity, id) => {
    if (!nextIdentityMap.has(id)) {
      deletes.push(id);
    }
  });

  return { documents, deletes, nextIdentityMap };
};

const saveHistoryToDexieWithSharding = async (changedHistoryData = {}) => {
  const standardHistoryUpdates = {};
  const shardedDocsToSave = [];
  const shardedDocIdsToDelete = [];
  const nextShardIdentityByField = new Map();

  Object.entries(changedHistoryData).forEach(([fieldName, fieldValue]) => {
    const config = SHARDED_HISTORY_FIELD_CONFIG[fieldName];
    if (!config) {
      standardHistoryUpdates[fieldName] = fieldValue;
      return;
    }

    const previousIdentityMap =
      lastSavedShardIdentityByField.get(fieldName) ?? new Map();
    const { documents, deletes, nextIdentityMap } = buildShardedFieldDiff(
      config,
      previousIdentityMap,
      fieldValue
    );

    documents.forEach((document) => shardedDocsToSave.push(document));
    deletes.forEach((id) => shardedDocIdsToDelete.push(id));
    nextShardIdentityByField.set(fieldName, nextIdentityMap);
  });

  const writeOperations = [];
  if (Object.keys(standardHistoryUpdates).length > 0) {
    writeOperations.push(saveHistoryToDexie(standardHistoryUpdates));
  }
  if (shardedDocsToSave.length > 0) {
    writeOperations.push(saveHistoryDocumentsToDexie(shardedDocsToSave));
  }
  if (shardedDocIdsToDelete.length > 0) {
    writeOperations.push(
      deleteHistoryDocumentsFromDexie(shardedDocIdsToDelete)
    );
  }

  if (writeOperations.length === 0) {
    // Field references moved but nothing actually changed on disk (e.g. a
    // structural rebuild produced identical payloads). Advance the baselines so
    // the next save skips them too.
    nextShardIdentityByField.forEach((identityMap, fieldName) => {
      lastSavedShardIdentityByField.set(fieldName, identityMap);
    });
    return true;
  }

  const writeResults = await Promise.all(writeOperations);
  const didSucceed = writeResults.every((result) => result === true);

  if (didSucceed) {
    nextShardIdentityByField.forEach((identityMap, fieldName) => {
      lastSavedShardIdentityByField.set(fieldName, identityMap);
    });
  }

  return didSucceed;
};

const getFoodCacheIdentity = (entry, index) => {
  if (!entry || typeof entry !== 'object') {
    return `index:${index}`;
  }

  const candidateKeys = [entry.id, entry.foodId, entry.food_id, entry.barcode];
  const primary = candidateKeys.find(
    (value) => typeof value === 'string' && value.trim().length > 0
  );

  if (primary) {
    return primary.trim().toLowerCase();
  }

  const name =
    typeof entry.name === 'string' ? entry.name.trim().toLowerCase() : '';
  const brand =
    typeof entry.brandName === 'string'
      ? entry.brandName.trim().toLowerCase()
      : '';

  if (name || brand) {
    return `${name}|${brand}`;
  }

  return `index:${index}`;
};

const normalizeCachedFoodsForPersistence = (
  cachedFoods,
  maxItems = MAX_CACHED_FOODS
) => {
  if (!Array.isArray(cachedFoods) || maxItems <= 0) {
    return [];
  }

  const recentWindow = cachedFoods.slice(-maxItems * 3);
  const dedupedNewestFirstByIdentity = new Map();

  for (let index = recentWindow.length - 1; index >= 0; index -= 1) {
    const entry = recentWindow[index];
    const cacheIdentity = getFoodCacheIdentity(entry, index);

    if (dedupedNewestFirstByIdentity.has(cacheIdentity)) {
      continue;
    }

    dedupedNewestFirstByIdentity.set(cacheIdentity, entry);
  }

  const dedupedChronological = Array.from(
    dedupedNewestFirstByIdentity.values()
  ).reverse();
  return dedupedChronological.slice(-maxItems);
};

const normalizeCardioSessionForLoad = (session, resolvedCardioTypes) => {
  if (!session || typeof session !== 'object') {
    return null;
  }

  const date = normalizeDateKey(session.date);
  if (!date) {
    return null;
  }

  const type =
    typeof session.type === 'string' && session.type.trim().length > 0
      ? session.type
      : null;
  if (!type) {
    return null;
  }

  const duration = Number(session.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    return null;
  }

  const normalizedStartTime = normalizeTimeOfDay(
    session?.startTime,
    getTimeOfDayFromEpochMs(session?.startedAt, '12:00')
  );
  const timestamps = deriveSessionTimestamps({
    dateKey: date,
    timeOfDay: normalizedStartTime,
    durationMinutes: duration,
    fallbackStartedAt: session?.startedAt,
  });

  return {
    ...session,
    date,
    type,
    duration,
    startTime: timestamps.startTime,
    startedAt: timestamps.startedAt,
    endedAt: timestamps.endedAt,
    effortType: session?.effortType ?? 'intensity',
    stepOverlapEnabled: isStepBasedCardioType(type, resolvedCardioTypes?.[type])
      ? Boolean(session?.stepOverlapEnabled ?? true)
      : false,
  };
};

const normalizeTrainingSessionForLoad = (session) => {
  if (!session || typeof session !== 'object') {
    return null;
  }

  const date = normalizeDateKey(session.date);
  if (!date) {
    return null;
  }

  const type = normalizeTrainingTypeKey(session.type);
  if (!type) {
    return null;
  }

  const duration = Number(session.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    return null;
  }

  return {
    ...session,
    date,
    type,
    duration,
    ...deriveSessionTimestamps({
      dateKey: date,
      timeOfDay: normalizeTimeOfDay(
        session?.startTime,
        getTimeOfDayFromEpochMs(session?.startedAt, '12:00')
      ),
      durationMinutes: duration,
      fallbackStartedAt: session?.startedAt,
    }),
    effortType: session?.effortType ?? 'intensity',
    intensity: session?.intensity ?? 'moderate',
  };
};

const sanitizeHistoryForPersistence = (historyData) => ({
  ...historyData,
  cachedFoods: normalizeCachedFoodsForPersistence(historyData.cachedFoods),
});

/**
 * Establish the persistence baselines from an in-memory `userData` object
 * WITHOUT writing anything. Used after a load (or import) so the first save
 * only touches what the user actually changes. The app's normalization is
 * deterministic and re-applied on every load, so a normalization-only
 * difference between the in-memory value and what is recorded on disk is
 * harmless until that field is next edited (then the shard diff writes it).
 */
export const primePersistenceBaseline = (userData) => {
  lastSavedHistoryRefByField = new Map();
  lastSavedShardIdentityByField = new Map();

  Object.entries(SHARDED_HISTORY_FIELD_CONFIG).forEach(
    ([fieldName, config]) => {
      const fieldValue = userData?.[fieldName];
      lastSavedHistoryRefByField.set(fieldName, fieldValue);

      const identityMap = new Map();
      config.shardEntries(fieldValue).forEach((entry) => {
        identityMap.set(
          buildShardedDocumentId(config.prefix, entry.key),
          buildIdentityEntry(config, entry)
        );
      });
      lastSavedShardIdentityByField.set(fieldName, identityMap);
    }
  );
};

/**
 * Pure, side-effect-free shard diff for a single history field. Used by tests
 * to assert the incremental contract (a no-op produces no documents; a
 * single-day edit produces exactly one document) without touching Dexie.
 */
export const diffShardedHistoryField = (
  fieldName,
  previousFieldValue,
  nextFieldValue
) => {
  const config = SHARDED_HISTORY_FIELD_CONFIG[fieldName];
  if (!config) {
    return { documents: [], deletes: [] };
  }

  const previousIdentityMap = new Map();
  config.shardEntries(previousFieldValue).forEach((entry) => {
    previousIdentityMap.set(
      buildShardedDocumentId(config.prefix, entry.key),
      buildIdentityEntry(config, entry)
    );
  });

  const { documents, deletes } = buildShardedFieldDiff(
    config,
    previousIdentityMap,
    nextFieldValue
  );

  return { documents, deletes };
};

/**
 * Drop every persistence baseline so the next save rewrites the full history.
 * Call this after an import or a data reset, where a wholesale replacement
 * means reference identity can no longer describe what changed.
 */
export const resetPersistenceTracking = () => {
  lastSavedProfileSerialized = null;
  lastSavedHistoryRefByField = new Map();
  lastSavedShardIdentityByField = new Map();
};

/**
 * Cheap diagnostic describing what the identity-diff layer is currently
 * tracking. Used to verify the incremental save path scales: the tracked shard
 * count should equal the number of real history documents, not the number of
 * entries, and should not grow per save.
 */
export const getPersistenceFootprint = () => {
  const shardsByField = {};
  let totalTrackedShards = 0;

  lastSavedShardIdentityByField.forEach((identityMap, fieldName) => {
    shardsByField[fieldName] = identityMap.size;
    totalTrackedShards += identityMap.size;
  });

  return {
    trackedFields: lastSavedHistoryRefByField.size,
    totalTrackedShards,
    shardsByField,
  };
};

/**
 * Identity gate: a history field only needs work when its object reference
 * moved. The store replaces history fields immutably, so an unchanged field
 * can never have a changed payload — letting us skip it entirely (no
 * normalization, no shard build, no serialization). This is what turns a save
 * from O(entire history) into O(changed fields).
 */
const collectChangedHistoryFields = (historyData) => {
  const changedHistoryData = {};

  Object.entries(historyData).forEach(([field, value]) => {
    if (lastSavedHistoryRefByField.get(field) !== value) {
      changedHistoryData[field] = value;
    }
  });

  return changedHistoryData;
};

export const loadEnergyMapData = async () => {
  try {
    // 1. Load profile from Capacitor Preferences
    const [profileRes, lastSelectedCardioTypeRes] = await Promise.all([
      Preferences.get({ key: PROFILE_KEY }),
      Preferences.get({ key: LAST_SELECTED_CARDIO_TYPE_KEY }),
    ]);
    const profileData = parseJsonOrEmpty(profileRes.value);
    const lastSelectedCardioType = String(
      lastSelectedCardioTypeRes?.value ?? ''
    ).trim();
    if (lastSelectedCardioType) {
      profileData.lastSelectedCardioType = lastSelectedCardioType;
    }

    // 2. Load history from Dexie (field docs + sharded docs)
    const dexieDocumentsResult = await loadAllHistoryDocuments();
    const dexieResult = reconstructHistoryFromDexieDocuments(
      dexieDocumentsResult.documents
    );
    let historyData = { ...(dexieResult.historyData ?? {}) };

    historyData = sanitizeHistoryForPersistence(historyData);

    if (
      Object.keys(profileData).length === 0 &&
      Object.keys(historyData).length === 0
    ) {
      const defaults = getDefaultEnergyMapData();
      primePersistenceBaseline(defaults);
      return defaults;
    }

    // 4. Merge everything into in-memory shape
    const merged = mergeWithDefaults({
      ...profileData,
      ...historyData,
    });

    // Record the loaded state as already-persisted so the first save after
    // launch only writes what the user actually changes (see the identity-diff
    // contract on `lastSavedHistoryRefByField`).
    primePersistenceBaseline(merged);

    return merged;
  } catch (error) {
    console.warn('Failed to load energy map data from storage', error);
    return getDefaultEnergyMapData();
  }
};

export const saveEnergyMapData = async (data) => {
  try {
    const profileData = {};
    const historyData = {};

    // Split data into profile (settings) and history (heavy logs)
    Object.keys(data).forEach((key) => {
      if (HISTORY_FIELDS.includes(key)) {
        historyData[key] = data[key];
      } else {
        profileData[key] = data[key];
      }
    });

    const profileSerialized = JSON.stringify(profileData);
    const changedHistoryData = collectChangedHistoryFields(historyData);
    const hasProfileChanges = profileSerialized !== lastSavedProfileSerialized;
    const hasHistoryChanges = Object.keys(changedHistoryData).length > 0;

    if (!hasProfileChanges && !hasHistoryChanges) {
      return;
    }

    const primaryResults = await Promise.allSettled([
      hasProfileChanges
        ? Preferences.set({
            key: PROFILE_KEY,
            value: profileSerialized,
          })
        : Promise.resolve('skipped-profile-write'),
      hasHistoryChanges
        ? saveHistoryToDexieWithSharding(changedHistoryData)
        : Promise.resolve(true),
    ]);

    const [, dexieResult] = primaryResults;
    const rejected = primaryResults.filter(
      (result) => result.status === 'rejected'
    );

    const dexieSucceeded =
      dexieResult?.status === 'fulfilled' && dexieResult.value === true;
    const hasExplicitFailureValue =
      hasHistoryChanges &&
      dexieResult?.status === 'fulfilled' &&
      dexieResult.value === false;

    const profileWriteSucceeded =
      !hasProfileChanges || primaryResults[0]?.status === 'fulfilled';
    const historyWriteSucceeded = !hasHistoryChanges || dexieSucceeded;

    if (profileWriteSucceeded) {
      lastSavedProfileSerialized = profileSerialized;
    }
    if (historyWriteSucceeded) {
      Object.keys(changedHistoryData).forEach((field) => {
        lastSavedHistoryRefByField.set(field, historyData[field]);
      });
    }

    const hasPersistenceRisk = rejected.length > 0 || hasExplicitFailureValue;

    if (hasPersistenceRisk) {
      console.warn('One or more storage save operations failed', {
        rejected,
        hasExplicitFailureValue,
      });
    }
  } catch (error) {
    console.warn('Failed to save energy map data to storage', error);
  }
};

export const loadSelectedDay = async () => {
  try {
    const { value } = await Preferences.get({ key: SELECTED_DAY_KEY });
    return value === 'rest' ? 'rest' : 'training';
  } catch (error) {
    console.warn('Failed to load selected day from storage', error);
    return 'training';
  }
};

export const saveSelectedDay = async (day) => {
  try {
    await Preferences.set({ key: SELECTED_DAY_KEY, value: day });
  } catch (error) {
    console.warn('Failed to save selected day to storage', error);
  }
};

export const saveLastSelectedCardioType = async (typeKey) => {
  const normalizedTypeKey = String(typeKey ?? '').trim();
  if (!normalizedTypeKey) {
    return;
  }

  try {
    await Preferences.set({
      key: LAST_SELECTED_CARDIO_TYPE_KEY,
      value: normalizedTypeKey,
    });
  } catch (error) {
    console.warn('Failed to save last selected cardio type', error);
  }
};

export const getDefaultEnergyMapData = () => ({
  age: 21,
  weight: 74,
  height: 168,
  weightEntries: [],
  bodyFatEntries: [],
  stepEntries: [], // { date: 'YYYY-MM-DD', steps: number, source: 'manual' | 'healthConnect' }
  stepGoal: 10000, // Daily step goal
  bodyFatTrackingEnabled: true,
  gender: 'male',
  theme: 'auto', // 'auto' | 'dark' | 'light' | 'amoled_dark' | 'forest' | 'dawn' | 'dusk' | 'midnight'
  selectedGoal: 'maintenance',
  goalChangedAt: Date.now(),
  hasSeenSwipeHint: false,
  phaseGoalCalorieDelta: null,
  phaseGoalCalorieDeltaSourcePhaseId: null,
  smartTefEnabled: false,
  smartTefFoodTefBurnEnabled: true,
  smartTefQuickEstimatesTargetMode: true,
  smartTefLiveCardTargetMode: false,
  foodSearchDefaultEntry: 'search_local',
  macroRecommendationSplit: {
    ...DEFAULT_MACRO_RECOMMENDATION_SPLIT,
  },
  macroLocks: {
    ...EMPTY_MACRO_LOCKS,
  },
  adaptiveThermogenesisEnabled: false,
  adaptiveThermogenesisSmartMode: false,
  adaptiveThermogenesisSmoothingEnabled: false,
  adaptiveThermogenesisSmoothingMethod: 'ema',
  adaptiveThermogenesisSmoothingWindowDays: 7,
  epocEnabled: true,
  epocCarryoverHours: 6,
  selectedTrainingType: 'trainingtype_1',
  trainingDuration: 2,
  stepRanges: ['<10k', '10k', '12k', '14k', '16k', '18k', '20k', '>20k'],
  cardioSessions: [],
  trainingSessions: [],
  lastSelectedCardioType: 'treadmill_walk',
  cardioFavourites: [],
  trainingFavourites: [],
  foodFavourites: [],
  customCardioTypes: {},
  nutritionData: {},
  pinnedFoods: [],
  pinnedCalorieTargets: [],
  pinnedCardioTypes: [],
  pinnedTrainingTypes: [],
  cachedFoods: [], // Foods fetched from the online catalog (food cloud, OpenFoodFacts barcode, etc.)
  dailySnapshots: {}, // { 'YYYY-MM-DD': { date, tdee, intake, deficit, stepCount, ... } }
  dailyNeatOverrides: {}, // { 'YYYY-MM-DD': { multiplier, presetKey, label, updatedAt } }
  // nutritionData structure: { 'YYYY-MM-DD': { mealType: [{ id, name, calories, protein, carbs, fats, timestamp }] } }
  trainingType: {
    trainingtype_1: {
      label: 'Bodybuilding',
      caloriesPerHour: 220,
    },
    trainingtype_2: {
      label: 'Powerlifting',
      caloriesPerHour: 180,
    },
    trainingtype_3: {
      label: 'Strongman',
      caloriesPerHour: 280,
    },
    trainingtype_4: {
      label: 'CrossFit',
      caloriesPerHour: 300,
    },
    trainingtype_5: {
      label: 'Calisthenics',
      caloriesPerHour: 240,
    },
    trainingtype_6: {
      label: 'My Training',
      caloriesPerHour: 220,
    },
  },
  activityPresets: {
    training: 'default',
    rest: 'default',
  },
  activityMultipliers: {
    ...DEFAULT_ACTIVITY_MULTIPLIERS,
  },
  customActivityMultipliers: {
    ...DEFAULT_ACTIVITY_MULTIPLIERS,
  },
  phaseLogV2: createDefaultPhaseLogV2State(),
});

function mergeWithDefaults(data) {
  const defaults = getDefaultEnergyMapData();
  const normalizedInput = { ...(data ?? {}) };
  delete normalizedInput.aiChatRagRolloutOverride;
  delete normalizedInput.aiChatRagRolloutPercentage;
  delete normalizedInput.aiChatRolloutUserId;
  const rawSelectedTrainingType = normalizedInput.selectedTrainingType;
  const rawTrainingTypeCatalog =
    normalizedInput.trainingType &&
    typeof normalizedInput.trainingType === 'object' &&
    !Array.isArray(normalizedInput.trainingType)
      ? normalizedInput.trainingType
      : null;

  const normalizedPhaseLogV2 = normalizePhaseLogV2State(
    normalizedInput.phaseLogV2 ?? defaults.phaseLogV2
  );

  const activityPresets = {
    ...defaults.activityPresets,
    ...(normalizedInput.activityPresets ?? {}),
  };
  const activityMultipliers = {
    ...defaults.activityMultipliers,
    ...(normalizedInput.activityMultipliers ?? {}),
  };
  const customActivityMultipliers = {
    ...defaults.customActivityMultipliers,
    ...(normalizedInput.customActivityMultipliers ?? {}),
  };
  const resolvedCardioTypes = {
    ...baseCardioTypes,
    ...(normalizedInput.customCardioTypes ?? {}),
  };

  ACTIVITY_DAY_TYPES.forEach((dayType) => {
    const fallbackCustom = Number.isFinite(customActivityMultipliers[dayType])
      ? customActivityMultipliers[dayType]
      : Number.isFinite(activityMultipliers[dayType])
        ? activityMultipliers[dayType]
        : defaults.customActivityMultipliers[dayType];

    customActivityMultipliers[dayType] =
      clampCustomActivityMultiplier(fallbackCustom);

    if (activityPresets[dayType] === 'custom') {
      activityMultipliers[dayType] = customActivityMultipliers[dayType];
    }
  });

  const normalizeNutritionData = (raw) => {
    if (!raw || typeof raw !== 'object') return defaults.nutritionData;

    const normalized = {};

    for (const [date, meals] of Object.entries(raw)) {
      normalized[date] = {};
      if (!meals || typeof meals !== 'object') continue;

      for (const [mealType, entries] of Object.entries(meals)) {
        normalized[date][mealType] = Array.isArray(entries)
          ? entries.map((entry) => {
              // Ensure a grams key exists so consumers can rely on the shape.
              if (!entry || typeof entry !== 'object') {
                return { ...entry, grams: null };
              }
              if (!('grams' in entry)) {
                return { ...entry, grams: null };
              }
              return entry;
            })
          : [];
      }
    }

    return normalized;
  };

  const normalizeDailySnapshots = (raw) => {
    if (!raw || typeof raw !== 'object') {
      return defaults.dailySnapshots;
    }

    return Object.entries(raw).reduce((acc, [dateKey, snapshot]) => {
      const normalizedDateKey = normalizeDateKey(dateKey);
      if (!normalizedDateKey || !snapshot || typeof snapshot !== 'object') {
        return acc;
      }

      // Legacy snapshots predate the micro-nutrient fields; default them so
      // consumers can always read `micros` / `microsCoverage` directly.
      const micros = {};
      const microsCoverage = {};
      NUTRIENT_KEYS.forEach((key) => {
        const value = snapshot?.micros?.[key];
        micros[key] =
          value == null || value === ''
            ? null
            : normalizeNutrientValue(value, key);
        microsCoverage[key] = Boolean(snapshot?.microsCoverage?.[key]);
      });

      acc[normalizedDateKey] = {
        ...snapshot,
        date: normalizedDateKey,
        micros,
        microsCoverage,
      };
      return acc;
    }, {});
  };

  const normalizeDailyNeatOverrides = (raw) => {
    if (!raw || typeof raw !== 'object') {
      return {};
    }

    return Object.entries(raw).reduce((acc, [dateKey, override]) => {
      const normalizedDateKey = normalizeDateKey(dateKey);
      if (
        !normalizedDateKey ||
        !override ||
        typeof override !== 'object' ||
        !Number.isFinite(Number(override?.multiplier))
      ) {
        return acc;
      }

      const rawPresetKey = String(override?.presetKey ?? '').trim();
      const rawLabel = String(override?.label ?? '').trim();

      acc[normalizedDateKey] = {
        multiplier: clampCustomActivityMultiplier(Number(override.multiplier)),
        presetKey: rawPresetKey.length > 0 ? rawPresetKey : null,
        label: rawLabel.length > 0 ? rawLabel : null,
        updatedAt: Number.isFinite(Number(override?.updatedAt))
          ? Math.round(Number(override.updatedAt))
          : undefined,
      };
      return acc;
    }, {});
  };

  const mergedTrainingTypeCatalog = {
    ...normalizeTrainingTypeCatalog(defaults.trainingType),
    ...normalizeTrainingTypeCatalog(rawTrainingTypeCatalog),
  };

  const selectedTrainingType = resolveSelectedTrainingType({
    selectedTrainingType: rawSelectedTrainingType,
    trainingTypeCatalog: mergedTrainingTypeCatalog,
    fallback: defaults.selectedTrainingType,
  });

  return {
    ...defaults,
    ...normalizedInput,
    age: sanitizeAge(normalizedInput.age, defaults.age),
    height: sanitizeHeight(normalizedInput.height, defaults.height),
    selectedGoal: normalizeSelectedGoal(
      normalizedInput.selectedGoal,
      defaults.selectedGoal
    ),
    goalChangedAt: normalizeGoalChangedAt(
      normalizedInput.goalChangedAt,
      defaults.goalChangedAt
    ),
    phaseGoalCalorieDelta: Number.isFinite(
      Number(normalizedInput.phaseGoalCalorieDelta)
    )
      ? Math.round(Number(normalizedInput.phaseGoalCalorieDelta))
      : null,
    phaseGoalCalorieDeltaSourcePhaseId: (() => {
      const rawValue = normalizedInput.phaseGoalCalorieDeltaSourcePhaseId;
      if (rawValue == null) {
        return null;
      }

      const numericValue = Number(rawValue);
      if (Number.isFinite(numericValue)) {
        return Math.round(numericValue);
      }

      const normalized = String(rawValue).trim();
      return normalized.length > 0 ? normalized : null;
    })(),
    nutritionData: normalizeNutritionData(
      normalizedInput.nutritionData ?? defaults.nutritionData
    ),
    selectedTrainingType,
    trainingType: mergedTrainingTypeCatalog,
    activityPresets,
    activityMultipliers,
    customActivityMultipliers,
    customCardioTypes: {
      ...defaults.customCardioTypes,
      ...(normalizedInput.customCardioTypes ?? {}),
    },
    stepRanges: Array.isArray(normalizedInput.stepRanges)
      ? normalizedInput.stepRanges
      : defaults.stepRanges,
    lastSelectedCardioType:
      typeof normalizedInput.lastSelectedCardioType === 'string' &&
      normalizedInput.lastSelectedCardioType.trim().length > 0
        ? normalizedInput.lastSelectedCardioType.trim()
        : defaults.lastSelectedCardioType,
    cardioSessions: Array.isArray(normalizedInput.cardioSessions)
      ? normalizedInput.cardioSessions
          .map((session) =>
            normalizeCardioSessionForLoad(session, resolvedCardioTypes)
          )
          .filter(Boolean)
      : defaults.cardioSessions,
    trainingSessions: Array.isArray(normalizedInput.trainingSessions)
      ? normalizedInput.trainingSessions
          .map((session) => normalizeTrainingSessionForLoad(session))
          .filter(Boolean)
      : defaults.trainingSessions,
    cardioFavourites: Array.isArray(normalizedInput.cardioFavourites)
      ? normalizedInput.cardioFavourites.map((session) => ({
          ...session,
          effortType: session?.effortType ?? 'intensity',
          stepOverlapEnabled: isStepBasedCardioType(
            session?.type,
            resolvedCardioTypes?.[session?.type]
          )
            ? Boolean(session?.stepOverlapEnabled ?? true)
            : false,
        }))
      : defaults.cardioFavourites,
    weightEntries: sortWeightEntries(
      normalizedInput.weightEntries ?? defaults.weightEntries
    ),
    bodyFatEntries: sortBodyFatEntries(
      normalizedInput.bodyFatEntries ?? defaults.bodyFatEntries
    ),
    stepEntries: Array.isArray(normalizedInput.stepEntries)
      ? normalizedInput.stepEntries.sort((a, b) => a.date.localeCompare(b.date))
      : defaults.stepEntries,
    bodyFatTrackingEnabled:
      normalizedInput.bodyFatTrackingEnabled ?? defaults.bodyFatTrackingEnabled,
    smartTefEnabled:
      normalizedInput.smartTefEnabled ?? defaults.smartTefEnabled,
    smartTefFoodTefBurnEnabled:
      normalizedInput.smartTefFoodTefBurnEnabled ??
      defaults.smartTefFoodTefBurnEnabled,
    smartTefQuickEstimatesTargetMode:
      normalizedInput.smartTefQuickEstimatesTargetMode ??
      defaults.smartTefQuickEstimatesTargetMode,
    smartTefLiveCardTargetMode:
      normalizedInput.smartTefLiveCardTargetMode ??
      defaults.smartTefLiveCardTargetMode,
    foodSearchDefaultEntry: normalizeFoodSearchDefaultEntry(
      normalizedInput.foodSearchDefaultEntry,
      defaults.foodSearchDefaultEntry
    ),
    macroRecommendationSplit: normalizeMacroRecommendationSplit(
      normalizedInput.macroRecommendationSplit ??
        defaults.macroRecommendationSplit
    ),
    macroLocks: normalizeMacroLocks(
      normalizedInput.macroLocks ?? defaults.macroLocks
    ),
    adaptiveThermogenesisEnabled:
      normalizedInput.adaptiveThermogenesisEnabled ??
      defaults.adaptiveThermogenesisEnabled,
    adaptiveThermogenesisSmartMode:
      normalizedInput.adaptiveThermogenesisSmartMode ??
      defaults.adaptiveThermogenesisSmartMode,
    adaptiveThermogenesisSmoothingEnabled:
      normalizedInput.adaptiveThermogenesisSmoothingEnabled ??
      defaults.adaptiveThermogenesisSmoothingEnabled,
    adaptiveThermogenesisSmoothingMethod: (() => {
      const normalized = String(
        normalizedInput.adaptiveThermogenesisSmoothingMethod ??
          defaults.adaptiveThermogenesisSmoothingMethod
      )
        .trim()
        .toLowerCase();

      return ADAPTIVE_THERMOGENESIS_SMOOTHING_METHODS.has(normalized)
        ? normalized
        : defaults.adaptiveThermogenesisSmoothingMethod;
    })(),
    adaptiveThermogenesisSmoothingWindowDays: (() => {
      const parsed = Number(
        normalizedInput.adaptiveThermogenesisSmoothingWindowDays
      );
      if (!Number.isFinite(parsed)) {
        return defaults.adaptiveThermogenesisSmoothingWindowDays;
      }

      return Math.min(
        Math.max(Math.round(parsed), MIN_ADAPTIVE_SMOOTHING_WINDOW_DAYS),
        MAX_ADAPTIVE_SMOOTHING_WINDOW_DAYS
      );
    })(),
    epocEnabled: normalizedInput.epocEnabled ?? defaults.epocEnabled,
    epocCarryoverHours: (() => {
      const parsed = Number(normalizedInput.epocCarryoverHours);
      if (!Number.isFinite(parsed)) {
        return defaults.epocCarryoverHours;
      }
      return Math.min(
        Math.max(Math.round(parsed), MIN_EPOC_CARRYOVER_HOURS),
        MAX_EPOC_CARRYOVER_HOURS
      );
    })(),
    phaseLogV2: normalizedPhaseLogV2,
    pinnedFoods: normalizeStringArray(
      normalizedInput.pinnedFoods,
      defaults.pinnedFoods
    ),
    pinnedCalorieTargets: normalizeStringArray(
      normalizedInput.pinnedCalorieTargets,
      defaults.pinnedCalorieTargets
    ),
    pinnedCardioTypes: normalizeStringArray(
      normalizedInput.pinnedCardioTypes,
      defaults.pinnedCardioTypes
    ),
    foodFavourites: Array.isArray(normalizedInput.foodFavourites)
      ? normalizedInput.foodFavourites
      : defaults.foodFavourites,
    cachedFoods: Array.isArray(normalizedInput.cachedFoods)
      ? normalizeCachedFoodsForPersistence(normalizedInput.cachedFoods)
      : defaults.cachedFoods,
    dailySnapshots: normalizeDailySnapshots(
      normalizedInput.dailySnapshots ?? defaults.dailySnapshots
    ),
    dailyNeatOverrides: normalizeDailyNeatOverrides(
      normalizedInput.dailyNeatOverrides ?? defaults.dailyNeatOverrides
    ),
  };
}
