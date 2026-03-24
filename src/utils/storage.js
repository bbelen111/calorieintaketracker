import { Preferences } from '@capacitor/preferences';
import {
  clampCustomActivityMultiplier,
  DEFAULT_ACTIVITY_MULTIPLIERS,
} from '../constants/activityPresets.js';
import { cardioTypes as baseCardioTypes } from '../constants/cardioTypes.js';
import {
  deleteHistoryDocumentsFromDexie,
  loadAllHistoryDocuments,
  saveHistoryToDexie,
  saveHistoryDocumentsToDexie,
} from './historyDatabase.js';
import { normalizeDateKey, sortWeightEntries } from './weight.js';
import { clampBodyFat, sortBodyFatEntries } from './bodyFat.js';
import { sanitizeAge, sanitizeHeight } from './profile.js';
import { isStepBasedCardioType } from './steps.js';
import {
  createDefaultPhaseLogV2State,
  normalizePhaseLogV2State,
} from './phaseLogV2.js';

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
    toDocuments: (value) => {
      if (!value || typeof value !== 'object') {
        return [];
      }

      return Object.entries(value)
        .filter(([date]) => typeof date === 'string' && date.trim().length > 0)
        .map(([date, meals]) => ({
          key: date,
          payload: meals && typeof meals === 'object' ? meals : {},
        }));
    },
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
    toDocuments: (value) => {
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

          return {
            key: dateKey,
            payload: {
              date: dateKey,
              weight: weightValue,
            },
          };
        })
        .filter(Boolean);
    },
    fromDocuments: (documents) =>
      documents
        .map(({ payload }) => payload)
        .filter(
          (entry) => normalizeDateKey(entry?.date) && entry?.weight != null
        ),
  },
  bodyFatEntries: {
    prefix: 'bodyFatEntries:',
    toDocuments: (value) => {
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

          return {
            key: dateKey,
            payload: {
              date: dateKey,
              bodyFat: bodyFatValue,
            },
          };
        })
        .filter(Boolean);
    },
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
    toDocuments: (value) => {
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

          return {
            key: dateKey,
            payload: {
              date: dateKey,
              steps: Math.round(numericSteps),
              source: entry?.source ?? 'manual',
            },
          };
        })
        .filter(Boolean);
    },
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
    toDocuments: (value) => {
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
            payload: {
              ...session,
              id: sessionId,
              __order: index,
            },
          };
        })
        .filter(Boolean);
    },
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
    toDocuments: (value) => {
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
            payload: {
              ...session,
              id: sessionId,
              __order: index,
            },
          };
        })
        .filter(Boolean);
    },
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
    toDocuments: (value) => {
      const normalized = normalizeCachedFoodsForPersistence(value);
      if (!Array.isArray(normalized)) {
        return [];
      }

      return normalized
        .map((entry, index) => ({
          key: getFoodCacheIdentity(entry, index),
          payload: {
            entry,
            __order: index,
          },
        }))
        .filter((doc) => typeof doc.key === 'string' && doc.key.length > 0);
    },
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
    toDocuments: (value) => {
      const normalized = normalizePhaseLogV2State(value);
      const documents = [
        {
          key: 'meta',
          payload: {
            version: normalized.version,
            phaseOrder: normalized.phaseOrder,
            activePhaseId: normalized.activePhaseId,
          },
        },
      ];

      Object.entries(normalized.phasesById).forEach(([phaseId, phase]) => {
        documents.push({
          key: `phase:${phaseId}`,
          payload: phase,
        });
      });

      Object.entries(normalized.logsById).forEach(([logId, log]) => {
        documents.push({
          key: `log:${logId}`,
          payload: log,
        });
      });

      return documents;
    },
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
    toDocuments: (value) => {
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
            payload: {
              ...snapshot,
              date: normalizedDateKey,
            },
          };
        })
        .filter(Boolean);
    },
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
let lastSavedProfileSerialized = null;
let lastSavedHistorySerializedByField = new Map();
let lastSavedShardedDocIdsByField = new Map();
let lastSavedShardedDocSerializedByField = new Map();

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
  const shardDocSerializedByField = new Map(
    SHARDED_HISTORY_FIELDS.map((field) => [field, new Map()])
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
    shardDocSerializedByField
      .get(fieldName)
      ?.set(documentId, JSON.stringify(document.payload));
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
    shardDocSerializedByField,
  };
};

const getShardedFieldDocuments = (fieldName, fieldValue) => {
  const config = SHARDED_HISTORY_FIELD_CONFIG[fieldName];
  if (!config) {
    return [];
  }

  return config.toDocuments(fieldValue).map(({ key, payload }) => ({
    id: buildShardedDocumentId(config.prefix, key),
    payload,
  }));
};

const saveHistoryToDexieWithSharding = async (changedHistoryData = {}) => {
  const standardHistoryUpdates = {};
  const shardedDocsToSave = [];
  const shardedDocIdsToDelete = [];
  const nextShardedDocIdsByField = new Map();
  const nextShardedDocSerializedByField = new Map();

  Object.entries(changedHistoryData).forEach(([fieldName, fieldValue]) => {
    if (!SHARDED_HISTORY_FIELD_CONFIG[fieldName]) {
      standardHistoryUpdates[fieldName] = fieldValue;
      return;
    }

    const documents = getShardedFieldDocuments(fieldName, fieldValue);
    const nextDocIds = new Set(documents.map((document) => document.id));
    const nextDocSerializedMap = new Map(
      documents.map((document) => [
        document.id,
        JSON.stringify(document.payload),
      ])
    );

    const previousDocSerializedMap =
      lastSavedShardedDocSerializedByField.get(fieldName) ?? new Map();

    documents.forEach((document) => {
      const nextSerialized = nextDocSerializedMap.get(document.id);
      const previousSerialized = previousDocSerializedMap.get(document.id);
      if (nextSerialized !== previousSerialized) {
        shardedDocsToSave.push(document);
      }
    });

    const previousDocIds =
      lastSavedShardedDocIdsByField.get(fieldName) ?? new Set();

    previousDocIds.forEach((previousDocId) => {
      if (!nextDocIds.has(previousDocId)) {
        shardedDocIdsToDelete.push(previousDocId);
      }
    });

    nextShardedDocIdsByField.set(fieldName, nextDocIds);
    nextShardedDocSerializedByField.set(fieldName, nextDocSerializedMap);
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
    return true;
  }

  const writeResults = await Promise.all(writeOperations);
  const didSucceed = writeResults.every((result) => result === true);

  if (didSucceed) {
    nextShardedDocIdsByField.forEach((docIds, fieldName) => {
      lastSavedShardedDocIdsByField.set(fieldName, docIds);
    });
    nextShardedDocSerializedByField.forEach((docSerialized, fieldName) => {
      lastSavedShardedDocSerializedByField.set(fieldName, docSerialized);
    });
  }

  return didSucceed;
};

const getFoodCacheIdentity = (entry, index) => {
  if (!entry || typeof entry !== 'object') {
    return `index:${index}`;
  }

  const candidateKeys = [
    entry.id,
    entry.foodId,
    entry.food_id,
    entry.fatsecretId,
    entry.barcode,
  ];
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
  const seen = new Set();
  const dedupedNewestFirst = [];

  for (let index = recentWindow.length - 1; index >= 0; index -= 1) {
    const entry = recentWindow[index];
    const cacheIdentity = getFoodCacheIdentity(entry, index);

    if (seen.has(cacheIdentity)) {
      continue;
    }

    seen.add(cacheIdentity);
    dedupedNewestFirst.push(entry);
  }

  const dedupedChronological = dedupedNewestFirst.reverse();
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

  return {
    ...session,
    date,
    type,
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
    effortType: session?.effortType ?? 'intensity',
    intensity: session?.intensity ?? 'moderate',
  };
};

const sanitizeHistoryForPersistence = (historyData) => ({
  ...historyData,
  cachedFoods: normalizeCachedFoodsForPersistence(historyData.cachedFoods),
});

const createHistorySerializedMap = (historyData) => {
  const serializedByField = new Map();
  Object.entries(historyData).forEach(([field, payload]) => {
    serializedByField.set(field, JSON.stringify(payload));
  });
  return serializedByField;
};

const getChangedHistoryData = (historyData) => {
  const changedHistoryData = {};
  const serializedByField = createHistorySerializedMap(historyData);

  serializedByField.forEach((serialized, field) => {
    if (lastSavedHistorySerializedByField.get(field) !== serialized) {
      changedHistoryData[field] = historyData[field];
    }
  });

  return {
    changedHistoryData,
    serializedByField,
  };
};

export const loadEnergyMapData = async () => {
  try {
    // 1. Load profile from Capacitor Preferences
    const profileRes = await Preferences.get({ key: PROFILE_KEY });
    const profileData = parseJsonOrEmpty(profileRes.value);
    const lastSelectedCardioTypeRes = await Preferences.get({
      key: LAST_SELECTED_CARDIO_TYPE_KEY,
    });
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

    lastSavedShardedDocIdsByField = dexieResult.shardDocIdsByField ?? new Map();
    lastSavedShardedDocSerializedByField =
      dexieResult.shardDocSerializedByField ?? new Map();

    historyData = sanitizeHistoryForPersistence(historyData);

    if (
      Object.keys(profileData).length === 0 &&
      Object.keys(historyData).length === 0
    ) {
      return getDefaultEnergyMapData();
    }

    // 4. Merge everything into in-memory shape
    return mergeWithDefaults({
      ...profileData,
      ...historyData,
    });
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

    const normalizedHistoryData = sanitizeHistoryForPersistence(historyData);
    const profileSerialized = JSON.stringify(profileData);
    const { changedHistoryData, serializedByField } = getChangedHistoryData(
      normalizedHistoryData
    );
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
      lastSavedHistorySerializedByField = serializedByField;
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
  theme: 'auto', // 'auto' | 'dark' | 'light' | 'amoled_dark'
  selectedGoal: 'maintenance',
  goalChangedAt: Date.now(),
  smartTefEnabled: false,
  smartTefFoodTefBurnEnabled: true,
  smartTefQuickEstimatesTargetMode: true,
  smartTefLiveCardTargetMode: false,
  adaptiveThermogenesisEnabled: false,
  adaptiveThermogenesisSmartMode: false,
  selectedTrainingType: 'trainingtype_1',
  trainingDuration: 2,
  stepRanges: ['<10k', '10k', '12k', '14k', '16k', '18k', '20k', '>20k'],
  cardioSessions: [],
  trainingSessions: [],
  lastSelectedCardioType: 'treadmill_walk',
  cardioFavourites: [],
  foodFavourites: [],
  customCardioTypes: {},
  nutritionData: {},
  pinnedFoods: [],
  cachedFoods: [], // Foods fetched from online APIs (FatSecret, etc.)
  dailySnapshots: {}, // { 'YYYY-MM-DD': { date, tdee, intake, deficit, stepCount, ... } }
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

      acc[normalizedDateKey] = {
        ...snapshot,
        date: normalizedDateKey,
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
    adaptiveThermogenesisEnabled:
      normalizedInput.adaptiveThermogenesisEnabled ??
      defaults.adaptiveThermogenesisEnabled,
    adaptiveThermogenesisSmartMode:
      normalizedInput.adaptiveThermogenesisSmartMode ??
      defaults.adaptiveThermogenesisSmartMode,
    phaseLogV2: normalizedPhaseLogV2,
    pinnedFoods: Array.isArray(normalizedInput.pinnedFoods)
      ? normalizedInput.pinnedFoods
      : defaults.pinnedFoods,
    foodFavourites: Array.isArray(normalizedInput.foodFavourites)
      ? normalizedInput.foodFavourites
      : defaults.foodFavourites,
    cachedFoods: Array.isArray(normalizedInput.cachedFoods)
      ? normalizeCachedFoodsForPersistence(normalizedInput.cachedFoods)
      : defaults.cachedFoods,
    dailySnapshots: normalizeDailySnapshots(
      normalizedInput.dailySnapshots ?? defaults.dailySnapshots
    ),
  };
}
