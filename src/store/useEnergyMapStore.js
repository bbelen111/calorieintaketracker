import { createWithEqualityFn } from 'zustand/traditional';
import { subscribeWithSelector } from 'zustand/middleware';
import { cardioTypes as baseCardioTypes } from '../constants/cardio/cardioTypes.js';
import {
  calculateBMR,
  calculateCalorieBreakdown,
  calculateCardioCalories,
  calculateGoalCalories,
  calculateGoalSeededBreakdown,
  calculateTrainingSessionCalories,
  getTotalCardioBurnForDate,
  getTotalTrainingBurnForDate,
  isGoalKey,
  resolveGoalCalorieDelta,
} from '../utils/calculations/calculations.js';
import { deriveTargetCreationModePayload } from '../utils/calculations/phaseTargetPlanning.js';
import { getStepRangeSortValue } from '../utils/calculations/steps.js';
import { clampCustomActivityMultiplier } from '../constants/activity/activityPresets.js';
import {
  getDefaultEnergyMapData,
  loadEnergyMapData,
  replaceEnergyMapData,
  saveEnergyMapData,
} from '../utils/data/storage.js';
import { applyDeviceBoundFields } from '../utils/data/fullExport.js';
import {
  clampWeight,
  normalizeDateKey,
  sortWeightEntries,
} from '../utils/measurements/weight.js';
import {
  clampBodyFat,
  sortBodyFatEntries,
} from '../utils/measurements/bodyFat.js';
import { sanitizeAge, sanitizeHeight } from '../utils/measurements/profile.js';
import {
  areDailySnapshotsEquivalent,
  buildDailySnapshot,
  getPreviousDateKey,
  reconcileSnapshotGoalsWithPhases,
} from '../utils/calculations/dailySnapshots.js';
import {
  PHASE_STATUS,
  deriveDailyLogStatus,
  LOG_COMPLETION_STATUS,
  normalizePhaseLogV2State,
  removePhaseLogV2DailyLog,
  upsertPhaseLogV2DailyLog,
} from '../utils/data/phaseLogV2.js';
import { hasNutritionEntriesForDate } from '../utils/phases/phases.js';
import { getTodayDateKey } from '../utils/data/dateKeys.js';
import {
  applyManualRestingHeartRate,
  mergeSyncedHeartRateEntry,
  sortHeartRateEntries,
} from '../utils/measurements/heartRate.js';
import { resolveHeartRateProfile } from '../utils/calculations/heartRate.js';
import {
  normalizeMaxHeartRate,
  normalizeVo2Max,
} from '../constants/health/heartRate.js';

import { normalizeOnTargetTolerance } from '../constants/goals/onTarget.js';
import {
  areUnitPreferencesEqual,
  normalizeUnitPreferences,
} from '../constants/units/units.js';
import { normalizeRecipe } from '../utils/food/recipe.js';
import {
  isSameScreenOrder,
  normalizeScreenOrder,
} from '../constants/navigation/screens.js';
import { collectDayEntryIds, resolveEntryId } from '../utils/food/entryIds.js';
import {
  HERO_SLOT_FIELDS,
  assignHeroSlot,
  readHeroSlots,
} from '../constants/appearance/heroAction.js';

const HERO_FIELD_TO_SLOT = Object.fromEntries(
  Object.entries(HERO_SLOT_FIELDS).map(([slot, field]) => [field, slot])
);

const SAVE_DEBOUNCE_MS = 1000;
const DEFAULT_TRAINING_TYPE_CATALOG =
  getDefaultEnergyMapData().trainingType ?? {};

/**
 * Resolve the active-phase calorie-delta override for a goal, mirroring the
 * rule `deriveState` uses for `goalDailyBalanceTarget`. Shared by
 * `calculateTargetForGoal` and the daily-snapshot builder so a locked phase
 * delta seeds the snapshot's target-mode TEF exactly like the live display.
 */
const resolveGoalDeltaOverride = (storeState, goalKey) => {
  const phaseGoalDelta = Number(storeState.userData?.phaseGoalCalorieDelta);
  const phaseGoalDeltaSourcePhaseId =
    storeState.userData?.phaseGoalCalorieDeltaSourcePhaseId;
  const shouldApplyPhaseDelta =
    storeState.isGoalLockedByActivePhase &&
    goalKey === storeState.selectedGoal &&
    phaseGoalDeltaSourcePhaseId != null &&
    phaseGoalDeltaSourcePhaseId === storeState.activePhaseId &&
    Number.isFinite(phaseGoalDelta);

  return shouldApplyPhaseDelta ? Math.round(phaseGoalDelta) : null;
};

const trainingTypesCache = new WeakMap();
const cardioTypesCache = new WeakMap();
const weightEntriesSortCache = new WeakMap();
const bodyFatEntriesSortCache = new WeakMap();
const stepEntriesSortCache = new WeakMap();

// Date-scoped session-burn caches for deriveState. `getTotal*BurnForDate`
// full-scans the sessions array and re-prices every matching session, which
// used to run on EVERY updateUserData — including profile-only writes like a
// theme or fontScale toggle that cannot affect burns. Keyed on the sessions
// array reference (replaced immutably by updateUserData — the same contract
// the persistence diff relies on), the resolved types reference, and the
// profile fields the burn formulas actually read (weight/age/height/gender,
// via normalizeCalculationProfile).
const EMPTY_SESSIONS = [];
const trainingBurnCache = new WeakMap();
const cardioBurnCache = new WeakMap();

// Burns also read heart-rate data (EPOC intensity via personal zones,
// HR-priced training, the VO2-max Keytel variant), and the cardio/training
// burns read EACH OTHER's sessions (observed max HR). Those are array
// references, so the string cache key carries a stable per-reference token.
const referenceTokens = new WeakMap();
let nextReferenceToken = 1;
const EMPTY_REFERENCE = {};
const getReferenceToken = (value) => {
  const ref = value && typeof value === 'object' ? value : EMPTY_REFERENCE;
  let token = referenceTokens.get(ref);
  if (!token) {
    token = nextReferenceToken;
    nextReferenceToken += 1;
    referenceTokens.set(ref, token);
  }
  return token;
};
const heartRateEntriesSortCache = new WeakMap();
const getCachedSortedHeartRateEntries = (entries) => {
  if (!Array.isArray(entries)) {
    return [];
  }
  const cached = heartRateEntriesSortCache.get(entries);
  if (cached) {
    return cached;
  }
  const sorted = sortHeartRateEntries(entries);
  heartRateEntriesSortCache.set(entries, sorted);
  return sorted;
};

const shiftDateKeyByDays = (dateKey, days) => {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/**
 * Dates whose snapshots a heart-rate change can move: a reading on D feeds the
 * as-of-date HR profile of every later day (resting baseline lookback, a VO2
 * max reading stays valid for months), so D .. today. Only EXISTING snapshots
 * are refreshed (see upsertDailySnapshots) — synced history must never seed a
 * day the user did not track — and unchanged rebuilds are skipped, so a
 * routine sync (yesterday + today) touches two days.
 */
const getHeartRateAffectedDateKeys = (changedDateKeys) => {
  if (!changedDateKeys.length) {
    return [];
  }
  const todayKey = getTodayDateKey();
  const start = [...changedDateKeys].sort()[0];
  if (start > todayKey) {
    return [];
  }
  const keys = [];
  for (let key = start; key <= todayKey; key = shiftDateKeyByDays(key, 1)) {
    keys.push(key);
  }
  return keys;
};

const getCachedDateBurn = ({
  cache,
  sessions,
  cacheKey,
  typesRef,
  compute,
}) => {
  const sessionsRef = Array.isArray(sessions) ? sessions : EMPTY_SESSIONS;
  const cached = cache.get(sessionsRef);

  if (cached && cached.key === cacheKey && cached.typesRef === typesRef) {
    return cached.value;
  }

  const value = compute();
  cache.set(sessionsRef, { key: cacheKey, typesRef, value });
  return value;
};

const normalizeTrainingTypeCatalog = (trainingTypeCatalog) =>
  Object.entries(trainingTypeCatalog).reduce((acc, [key, entry]) => {
    const numericCalories = Number(entry?.caloriesPerHour);
    acc[key] = {
      label: entry?.label ?? key,
      caloriesPerHour: Number.isFinite(numericCalories)
        ? Math.max(0, numericCalories)
        : 0,
    };
    return acc;
  }, {});

const DEFAULT_RESOLVED_TRAINING_TYPES = normalizeTrainingTypeCatalog(
  DEFAULT_TRAINING_TYPE_CATALOG
);

const resolveTrainingTypes = (userData) => {
  const customTrainingTypeCatalog = userData?.trainingType;

  if (
    !customTrainingTypeCatalog ||
    typeof customTrainingTypeCatalog !== 'object'
  ) {
    return DEFAULT_RESOLVED_TRAINING_TYPES;
  }

  const cached = trainingTypesCache.get(customTrainingTypeCatalog);
  if (cached) {
    return cached;
  }

  const trainingTypeCatalog = {
    ...DEFAULT_TRAINING_TYPE_CATALOG,
    ...customTrainingTypeCatalog,
  };

  const resolved = normalizeTrainingTypeCatalog(trainingTypeCatalog);
  trainingTypesCache.set(customTrainingTypeCatalog, resolved);
  return resolved;
};

const resolveCardioTypes = (userData) => {
  const customCardioTypes = userData?.customCardioTypes;

  if (!customCardioTypes || typeof customCardioTypes !== 'object') {
    return baseCardioTypes;
  }

  const cached = cardioTypesCache.get(customCardioTypes);
  if (cached) {
    return cached;
  }

  const resolved = {
    ...baseCardioTypes,
    ...customCardioTypes,
  };

  cardioTypesCache.set(customCardioTypes, resolved);
  return resolved;
};

const sortStepEntries = (entries) => {
  if (!Array.isArray(entries)) return [];
  return [...entries].sort((a, b) => a.date.localeCompare(b.date));
};

const getCachedSortedWeightEntries = (entries) => {
  if (!Array.isArray(entries)) {
    return [];
  }

  const cached = weightEntriesSortCache.get(entries);
  if (cached) {
    return cached;
  }

  const sorted = sortWeightEntries(entries);
  weightEntriesSortCache.set(entries, sorted);
  return sorted;
};

const getCachedSortedBodyFatEntries = (entries) => {
  if (!Array.isArray(entries)) {
    return [];
  }

  const cached = bodyFatEntriesSortCache.get(entries);
  if (cached) {
    return cached;
  }

  const sorted = sortBodyFatEntries(entries);
  bodyFatEntriesSortCache.set(entries, sorted);
  return sorted;
};

const getCachedSortedStepEntries = (entries) => {
  if (!Array.isArray(entries)) {
    return [];
  }

  const cached = stepEntriesSortCache.get(entries);
  if (cached) {
    return cached;
  }

  const sorted = sortStepEntries(entries);
  stepEntriesSortCache.set(entries, sorted);
  return sorted;
};

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const getGoalDurationDays = (goalChangedAt) => {
  const changedAt = Number(goalChangedAt);
  if (!Number.isFinite(changedAt) || changedAt <= 0) {
    return 0;
  }

  const now = Date.now();
  const elapsed = now - changedAt;
  if (!Number.isFinite(elapsed) || elapsed <= 0) {
    return 0;
  }

  return Math.floor(elapsed / MS_PER_DAY);
};

const normalizeSessionDate = (value) => normalizeDateKey(value);

const phaseLogV2NormalizationCache = new WeakMap();
const phaseViewCache = new WeakMap();

const getCachedNormalizedPhaseLogV2 = (phaseLogV2) => {
  if (!phaseLogV2 || typeof phaseLogV2 !== 'object') {
    return normalizePhaseLogV2State(phaseLogV2);
  }

  const cached = phaseLogV2NormalizationCache.get(phaseLogV2);
  if (cached) {
    return cached;
  }

  const normalized = normalizePhaseLogV2State(phaseLogV2);
  phaseLogV2NormalizationCache.set(phaseLogV2, normalized);

  if (normalized && typeof normalized === 'object') {
    phaseLogV2NormalizationCache.set(normalized, normalized);
  }

  return normalized;
};

/**
 * While a phase is active it sets the goal ("Set by your phase"), so its goal
 * type IS `selectedGoal`. Every reader of the goal - the Home tile's label,
 * today's snapshot (`goalAtSnapshot`), Staged AT, goal verdicts, ledger
 * streaks - then agrees with the phase and with the delta it applies. Without
 * this a bulk phase started from Maintenance read "Maintenance, +692 kcal
 * surplus", and a goal-mode phase never applied its goal at all (the lock then
 * kept the user from fixing it). Enforced here because every write (actions,
 * hydration, import) passes through it; an unknown goal type is left alone.
 * When the phase ends, its goal stays selected and the lock lifts.
 */
const syncSelectedGoalToActivePhase = (userData, phaseLogV2) => {
  const activePhaseId = phaseLogV2?.activePhaseId;
  const activePhase =
    activePhaseId != null ? phaseLogV2.phasesById?.[activePhaseId] : null;
  if (activePhase?.status !== PHASE_STATUS.ACTIVE) {
    return userData;
  }

  const goalKey = activePhase.goalType;
  if (!isGoalKey(goalKey) || goalKey === userData?.selectedGoal) {
    return userData;
  }

  return { ...userData, selectedGoal: goalKey, goalChangedAt: Date.now() };
};

const normalizePhaseStateForUserData = (userData) => {
  const normalizedPhaseLogV2 = getCachedNormalizedPhaseLogV2(
    userData?.phaseLogV2
  );

  const withPhaseLog =
    userData?.phaseLogV2 === normalizedPhaseLogV2
      ? userData
      : { ...userData, phaseLogV2: normalizedPhaseLogV2 };

  return syncSelectedGoalToActivePhase(withPhaseLog, normalizedPhaseLogV2);
};

/**
 * Hydration / import: the per-write phase normalization, plus the history
 * repair for days recorded before the goal followed the phase (see
 * `reconcileSnapshotGoalsWithPhases`). Load-time only: it scans every
 * snapshot, which the per-write path must never do.
 */
const normalizeLoadedUserData = (data) => {
  const userData = normalizePhaseStateForUserData(data);
  const dailySnapshots = reconcileSnapshotGoalsWithPhases(
    userData.dailySnapshots,
    Object.values(userData.phaseLogV2?.phasesById ?? {})
  );

  return dailySnapshots === userData.dailySnapshots
    ? userData
    : { ...userData, dailySnapshots };
};

/**
 * After hydration / import: seed yesterday + today when missing, and rebuild
 * today outright when loading moved the goal (today follows the live goal).
 */
const seedSnapshotsAfterLoad = (get, { goalChanged }) => {
  const todayDateKey = getTodayDateKey();
  const previousDateKey = getPreviousDateKey(todayDateKey);
  if (previousDateKey) {
    get().upsertDailySnapshot(previousDateKey, { onlyIfMissing: true });
  }
  get().upsertDailySnapshot(
    todayDateKey,
    goalChanged ? undefined : { onlyIfMissing: true }
  );
};

const buildPhaseViewFromV2 = (phaseLogV2) => {
  const normalized = getCachedNormalizedPhaseLogV2(phaseLogV2);

  const cached = phaseViewCache.get(normalized);
  if (cached) {
    return cached;
  }

  const phases = normalized.phaseOrder
    .map((phaseId) => {
      const phase = normalized.phasesById?.[phaseId];
      if (!phase) {
        return null;
      }

      const phaseLogIds = normalized.logIdsByPhaseId?.[phaseId] ?? [];
      const dailyLogs = {};

      phaseLogIds.forEach((logId) => {
        const log = normalized.logsById?.[logId];
        if (!log) {
          return;
        }

        const completionStatus = deriveDailyLogStatus(log);
        dailyLogs[log.date] = {
          date: log.date,
          weightRef: log.links?.weightEntryId ?? '',
          bodyFatRef: log.links?.bodyFatEntryId ?? '',
          nutritionRef: log.links?.nutritionDayKey ?? '',
          stepRef: log.links?.stepEntryId ?? '',
          trainingSessionIds: Array.isArray(log.links?.trainingSessionIds)
            ? log.links.trainingSessionIds
            : [],
          notes: log.notes ?? '',
          completed: completionStatus === LOG_COMPLETION_STATUS.COMPLETE,
        };
      });

      return {
        id: phase.id,
        name: phase.name,
        startDate: phase.startDate,
        endDate: phase.endDate,
        goalType: phase.goalType,
        targetWeight: phase.targetWeight,
        targetBodyFat: phase.targetBodyFat,
        startingWeight: phase.startingWeight,
        status: phase.status === PHASE_STATUS.ACTIVE ? 'active' : 'completed',
        color: phase.color,
        dailyLogs,
        metrics: {
          totalDays: 0,
          activeDays: 0,
          avgCalories: 0,
          avgSteps: 0,
          weightChange: 0,
          avgWeeklyRate: 0,
        },
        createdAt: phase.createdAt,
      };
    })
    .filter(Boolean);

  const nextPhaseView = {
    phases,
    activePhaseId: normalized.activePhaseId,
  };

  phaseViewCache.set(normalized, nextPhaseView);
  return nextPhaseView;
};

const mapPhaseLogs = (rawPhaseLogV2, updater) => {
  const normalized = normalizePhaseLogV2State(rawPhaseLogV2);
  let hasChanges = false;
  const nextLogsById = { ...normalized.logsById };

  Object.entries(normalized.logsById).forEach(([logId, log]) => {
    const nextLog = updater(log);
    if (nextLog !== log) {
      hasChanges = true;
      nextLogsById[logId] = nextLog;
    }
  });

  if (!hasChanges) {
    return normalized;
  }

  return {
    ...normalized,
    logsById: nextLogsById,
  };
};

const clearWeightRefsForDate = (phaseLogV2, dateKey) => {
  if (!dateKey) {
    return normalizePhaseLogV2State(phaseLogV2);
  }

  return mapPhaseLogs(phaseLogV2, (log) => {
    if (log?.links?.weightEntryId !== dateKey) {
      return log;
    }

    return {
      ...log,
      links: {
        ...log.links,
        weightEntryId: null,
      },
      updatedAt: Date.now(),
    };
  });
};

const clearBodyFatRefsForDate = (phaseLogV2, dateKey) => {
  if (!dateKey) {
    return normalizePhaseLogV2State(phaseLogV2);
  }

  return mapPhaseLogs(phaseLogV2, (log) => {
    if (log?.links?.bodyFatEntryId !== dateKey) {
      return log;
    }

    return {
      ...log,
      links: {
        ...log.links,
        bodyFatEntryId: null,
      },
      updatedAt: Date.now(),
    };
  });
};

const syncNutritionRefsForDate = (phaseLogV2, dateKey, hasNutritionForDate) => {
  if (!dateKey) {
    return normalizePhaseLogV2State(phaseLogV2);
  }

  const targetRef = hasNutritionForDate ? dateKey : null;

  return mapPhaseLogs(phaseLogV2, (log) => {
    if (log.date !== dateKey) {
      return log;
    }

    if ((log?.links?.nutritionDayKey ?? null) === targetRef) {
      return log;
    }

    return {
      ...log,
      links: {
        ...log.links,
        nutritionDayKey: targetRef,
      },
      updatedAt: Date.now(),
    };
  });
};

const deriveState = (userData) => {
  const phaseLogV2 = getCachedNormalizedPhaseLogV2(userData?.phaseLogV2);
  const phaseView = buildPhaseViewFromV2(phaseLogV2);
  const activePhase =
    phaseView.activePhaseId != null
      ? (phaseLogV2.phasesById?.[phaseView.activePhaseId] ?? null)
      : null;
  const trainingTypes = resolveTrainingTypes(userData);
  const cardioTypes = resolveCardioTypes(userData);
  const todayDateKey = getTodayDateKey();
  const bmr = calculateBMR(userData);
  // Every input the burn formulas read beyond the sessions array itself:
  // profile scalars, the HR settings, and the HR data + the OTHER session
  // array by reference (personal zones / observed max HR).
  const todayBurnProfileKey = `${todayDateKey}|${userData.weight}|${userData.age}|${userData.height}|${userData.gender}|${userData.maxHeartRateCustom}|${userData.vo2MaxCustom}|${getReferenceToken(userData.heartRateEntries)}|${getReferenceToken(userData.cardioSessions)}|${getReferenceToken(userData.trainingSessions)}`;
  const trainingCalories = getCachedDateBurn({
    cache: trainingBurnCache,
    sessions: userData.trainingSessions,
    cacheKey: todayBurnProfileKey,
    typesRef: trainingTypes,
    compute: () =>
      getTotalTrainingBurnForDate(userData, trainingTypes, todayDateKey),
  });
  const totalCardioBurn = getCachedDateBurn({
    cache: cardioBurnCache,
    sessions: userData.cardioSessions,
    cacheKey: todayBurnProfileKey,
    typesRef: cardioTypes,
    compute: () =>
      getTotalCardioBurnForDate(userData, cardioTypes, todayDateKey),
  });
  const weightEntries = getCachedSortedWeightEntries(userData.weightEntries);
  const bodyFatEntries = getCachedSortedBodyFatEntries(userData.bodyFatEntries);
  const stepEntries = getCachedSortedStepEntries(userData.stepEntries);
  const heartRateEntries = getCachedSortedHeartRateEntries(
    userData.heartRateEntries
  );
  const heartRateProfile = resolveHeartRateProfile(userData, todayDateKey);
  const stepGoal = userData.stepGoal ?? 10000;
  const selectedGoal = userData.selectedGoal ?? 'maintenance';
  const goalChangedAt = Number(userData.goalChangedAt) || Date.now();

  // Canonical daily goal balance target (positive = deficit) for analytics like
  // Rolling Energy Balance. Mirrors the phase-lock rule used by
  // `calculateTargetForGoal` so the UI never duplicates business logic.
  const activePhaseId = phaseView.activePhaseId;
  const phaseGoalDeltaSourcePhaseId =
    userData?.phaseGoalCalorieDeltaSourcePhaseId;
  const phaseGoalDelta = Number(userData?.phaseGoalCalorieDelta);
  const isPhaseDeltaOwned =
    phaseGoalDeltaSourcePhaseId != null &&
    phaseGoalDeltaSourcePhaseId === activePhaseId &&
    Number.isFinite(phaseGoalDelta);
  const goalDailyBalanceTarget =
    activePhase?.status === PHASE_STATUS.ACTIVE &&
    activePhase?.id != null &&
    isPhaseDeltaOwned
      ? -Math.round(phaseGoalDelta)
      : -resolveGoalCalorieDelta(selectedGoal);

  return {
    trainingTypes,
    cardioTypes,
    bmr,
    trainingCalories,
    totalCardioBurn,
    trainingSessions: userData.trainingSessions ?? [],
    weightEntries,
    bodyFatEntries,
    stepEntries,
    heartRateEntries,
    heartRateProfile,
    stepGoal,
    selectedGoal,
    goalChangedAt,
    goalDailyBalanceTarget,
    goalDurationDays: getGoalDurationDays(goalChangedAt),
    customCardioTypes: userData.customCardioTypes ?? {},
    cardioFavourites: userData.cardioFavourites ?? [],
    trainingFavourites: userData.trainingFavourites ?? [],
    foodFavourites: userData.foodFavourites ?? [],
    recipes: userData.recipes ?? [],
    nutritionData: userData.nutritionData ?? {},
    pinnedFoods: userData.pinnedFoods ?? [],
    pinnedCalorieTargets: userData.pinnedCalorieTargets ?? [],
    pinnedCardioTypes: userData.pinnedCardioTypes ?? [],
    pinnedTrainingTypes: userData.pinnedTrainingTypes ?? [],
    cachedFoods: userData.cachedFoods ?? [],
    dailySnapshots: userData.dailySnapshots ?? {},
    phases: phaseView.phases,
    phaseLogV2,
    activePhaseId: phaseView.activePhaseId,
    activePhase,
    isGoalLockedByActivePhase:
      activePhase?.status === PHASE_STATUS.ACTIVE && activePhase?.id != null,
    theme: userData.theme ?? 'dark',
  };
};

const updateUserData = (set, get, updater) => {
  set((state) => {
    const nextUserDataRaw =
      typeof updater === 'function' ? updater(state.userData) : updater;

    if (nextUserDataRaw === state.userData) {
      return state;
    }

    const nextUserData = normalizePhaseStateForUserData(nextUserDataRaw);

    if (nextUserData === state.userData) {
      return state;
    }

    return {
      userData: nextUserData,
      ...deriveState(nextUserData),
    };
  });
};

const togglePinnedValue = (values, nextValue) => {
  const normalizedValue = String(nextValue ?? '').trim();
  if (!normalizedValue) {
    return values ?? [];
  }

  const currentValues = Array.isArray(values) ? values : [];
  const isPinned = currentValues.includes(normalizedValue);

  return isPinned
    ? currentValues.filter((value) => value !== normalizedValue)
    : [...currentValues, normalizedValue];
};

export const useEnergyMapStore = createWithEqualityFn(
  subscribeWithSelector((set, get) => ({
    userData: getDefaultEnergyMapData(),
    isLoaded: false,
    ...deriveState(getDefaultEnergyMapData()),

    initialize: async () => {
      if (get().isLoaded) {
        return;
      }
      const data = await loadEnergyMapData();
      const nextUserData = normalizeLoadedUserData(data);
      set({
        userData: nextUserData,
        ...deriveState(nextUserData),
        isLoaded: true,
      });

      seedSnapshotsAfterLoad(get, {
        goalChanged: nextUserData.selectedGoal !== data?.selectedGoal,
      });
    },

    /**
     * Replaces ALL data with an imported export (`parseFullExportText` has
     * already validated the document). Persists first and swaps memory only on
     * success, so a failed write leaves the app exactly as it was. Device-bound
     * fields (paired sensor, health-sync opt-in) keep this device's values.
     *
     * @returns {Promise<boolean>} whether the import was applied.
     */
    importUserData: async (importedData) => {
      // A pending debounced save belongs to the state being replaced;
      // `replaceEnergyMapData` flushes that state itself before the swap.
      if (saveTimeoutId) {
        clearTimeout(saveTimeoutId);
        saveTimeoutId = null;
      }

      const currentData = get().userData;
      const persisted = await replaceEnergyMapData({
        currentData,
        importedData: applyDeviceBoundFields(importedData, currentData),
      });
      if (!persisted) {
        return false;
      }

      const nextUserData = normalizeLoadedUserData(persisted);
      set({ userData: nextUserData, ...deriveState(nextUserData) });

      seedSnapshotsAfterLoad(get, {
        goalChanged: nextUserData.selectedGoal !== persisted?.selectedGoal,
      });
      return true;
    },

    handleUserDataChange: (field, value) => {
      updateUserData(set, get, (prev) => {
        if (field === 'age') {
          return {
            ...prev,
            age: sanitizeAge(value, prev.age),
          };
        }

        if (field === 'height') {
          return {
            ...prev,
            height: sanitizeHeight(value, prev.height),
          };
        }

        // HR settings: out-of-range values clear the override (auto).
        if (field === 'maxHeartRateCustom') {
          const next = normalizeMaxHeartRate(value);
          return next === prev.maxHeartRateCustom
            ? prev
            : { ...prev, maxHeartRateCustom: next };
        }

        if (field === 'vo2MaxCustom') {
          const next = normalizeVo2Max(value);
          return next === prev.vo2MaxCustom
            ? prev
            : { ...prev, vo2MaxCustom: next };
        }

        // Home hero: the pill and the two tiles never show the same metric.
        // Picking a metric another slot already shows swaps the two; Body Fat
        // is refused while body fat tracking is off. The slots are settled
        // first so a stale stored pick can't be swapped into place.
        if (HERO_FIELD_TO_SLOT[field]) {
          const options = {
            bodyFatTrackingEnabled: prev.bodyFatTrackingEnabled !== false,
          };
          const current = readHeroSlots(prev, options);
          const next = assignHeroSlot(
            current,
            HERO_FIELD_TO_SLOT[field],
            value,
            options
          );
          const unchanged = Object.entries(HERO_SLOT_FIELDS).every(
            ([slot, slotField]) => prev[slotField] === next[slot]
          );
          if (unchanged) {
            return prev;
          }
          const updated = { ...prev };
          Object.entries(HERO_SLOT_FIELDS).forEach(([slot, slotField]) => {
            updated[slotField] = next[slot];
          });
          return updated;
        }

        if (field === 'onTargetToleranceKcal') {
          const next = normalizeOnTargetTolerance(value);
          return next === prev.onTargetToleranceKcal
            ? prev
            : { ...prev, onTargetToleranceKcal: next };
        }

        if (field === 'screenOrder') {
          const next = normalizeScreenOrder(value);
          return isSameScreenOrder(next, prev.screenOrder)
            ? prev
            : { ...prev, screenOrder: next };
        }

        if (field === 'unitPreferences') {
          return areUnitPreferencesEqual(value, prev.unitPreferences)
            ? prev
            : { ...prev, unitPreferences: normalizeUnitPreferences(value) };
        }

        return { ...prev, [field]: value };
      });

      // Max HR / VO2 max reprice today's HR sessions + EPOC; keep today's
      // snapshot (header TDEE, ledger) in step.
      if (field === 'maxHeartRateCustom' || field === 'vo2MaxCustom') {
        get().upsertDailySnapshot(getTodayDateKey());
      }
    },

    setSelectedGoal: (goalKey, changedAt = Date.now()) => {
      if (get().isGoalLockedByActivePhase) {
        return;
      }

      updateUserData(set, get, (prev) => {
        if (goalKey === prev.selectedGoal) {
          return prev;
        }

        return {
          ...prev,
          selectedGoal: goalKey,
          goalChangedAt: Number.isFinite(Number(changedAt))
            ? Math.round(Number(changedAt))
            : Date.now(),
        };
      });

      // Keep today's daily snapshot goal metadata in sync on an actual switch:
      // snapshots are the per-day goal history the Crude AT pressure
      // accumulator evaluates, so a same-day toggle must be reflected now
      // rather than waiting for app-resume/day-rollover refinalization.
      if (get().userData.selectedGoal === goalKey) {
        get().upsertDailySnapshot(getTodayDateKey());
      }
    },

    setFoodSearchDefaultEntry: (nextEntry) => {
      const normalizedEntry = String(nextEntry ?? '')
        .trim()
        .toLowerCase();

      updateUserData(set, get, (prev) => {
        if (
          !normalizedEntry ||
          prev.foodSearchDefaultEntry === normalizedEntry
        ) {
          return prev;
        }

        return {
          ...prev,
          foodSearchDefaultEntry: normalizedEntry,
        };
      });
    },

    addStepRange: (newStepRange) => {
      if (!newStepRange) return;
      updateUserData(set, get, (prev) => {
        if (prev.stepRanges.includes(newStepRange)) {
          return prev;
        }
        const nextRanges = [...prev.stepRanges, newStepRange].sort(
          (a, b) => getStepRangeSortValue(a) - getStepRangeSortValue(b)
        );
        return { ...prev, stepRanges: nextRanges };
      });
    },

    removeStepRange: (stepRange) => {
      updateUserData(set, get, (prev) => ({
        ...prev,
        stepRanges: prev.stepRanges.filter((range) => range !== stepRange),
      }));
    },

    addCardioSession: (session) => {
      const normalizedDate = normalizeSessionDate(session?.date);
      if (!normalizedDate) {
        return;
      }

      updateUserData(set, get, (prev) => ({
        ...prev,
        cardioSessions: [
          ...prev.cardioSessions,
          { ...session, date: normalizedDate, id: Date.now() },
        ],
      }));

      get().upsertDailySnapshot(normalizedDate);
    },

    addCardioFavourite: (session) => {
      updateUserData(set, get, (prev) => ({
        ...prev,
        cardioFavourites: [
          ...(prev.cardioFavourites ?? []),
          {
            ...session,
            id: Date.now(),
          },
        ],
      }));
    },

    addTrainingFavourite: (session) => {
      updateUserData(set, get, (prev) => ({
        ...prev,
        trainingFavourites: [
          ...(prev.trainingFavourites ?? []),
          {
            ...session,
            id: Date.now(),
          },
        ],
      }));
    },

    updateCardioSession: (id, updates) => {
      if (id == null) {
        return;
      }

      const previousSession = (get().userData.cardioSessions ?? []).find(
        (session) => session.id === id
      );
      const previousDate = normalizeSessionDate(previousSession?.date);

      if (Object.prototype.hasOwnProperty.call(updates ?? {}, 'date')) {
        const normalizedDate = normalizeSessionDate(updates?.date);
        if (!normalizedDate) {
          return;
        }
      }

      updateUserData(set, get, (prev) => ({
        ...prev,
        cardioSessions: prev.cardioSessions.map((session) =>
          session.id === id
            ? {
                ...session,
                ...updates,
                ...(updates?.date
                  ? { date: normalizeSessionDate(updates.date) }
                  : {}),
                id: session.id,
              }
            : session
        ),
      }));

      const nextDate = normalizeSessionDate(updates?.date ?? previousDate);
      if (previousDate) {
        get().upsertDailySnapshot(previousDate);
      }
      if (nextDate && nextDate !== previousDate) {
        get().upsertDailySnapshot(nextDate);
      }
    },

    addTrainingSession: (session) => {
      const normalizedDate = normalizeSessionDate(session?.date);
      if (!normalizedDate) {
        return;
      }

      updateUserData(set, get, (prev) => ({
        ...prev,
        trainingSessions: [
          ...(prev.trainingSessions ?? []),
          {
            ...session,
            date: normalizedDate,
            id: Date.now(),
          },
        ],
      }));

      get().upsertDailySnapshot(normalizedDate);
    },

    updateTrainingSession: (id, updates) => {
      if (id == null) {
        return;
      }

      const previousSession = (get().userData.trainingSessions ?? []).find(
        (session) => session.id === id
      );
      const previousDate = normalizeSessionDate(previousSession?.date);

      if (Object.prototype.hasOwnProperty.call(updates ?? {}, 'date')) {
        const normalizedDate = normalizeSessionDate(updates?.date);
        if (!normalizedDate) {
          return;
        }
      }

      updateUserData(set, get, (prev) => ({
        ...prev,
        trainingSessions: (prev.trainingSessions ?? []).map((session) =>
          session.id === id
            ? {
                ...session,
                ...updates,
                ...(updates?.date
                  ? { date: normalizeSessionDate(updates.date) }
                  : {}),
                id: session.id,
              }
            : session
        ),
      }));

      const nextDate = normalizeSessionDate(updates?.date ?? previousDate);
      if (previousDate) {
        get().upsertDailySnapshot(previousDate);
      }
      if (nextDate && nextDate !== previousDate) {
        get().upsertDailySnapshot(nextDate);
      }
    },

    removeTrainingSession: (id) => {
      const previousSession = (get().userData.trainingSessions ?? []).find(
        (session) => session.id === id
      );
      const previousDate = normalizeSessionDate(previousSession?.date);

      updateUserData(set, get, (prev) => ({
        ...prev,
        trainingSessions: (prev.trainingSessions ?? []).filter(
          (session) => session.id !== id
        ),
      }));

      if (previousDate) {
        get().upsertDailySnapshot(previousDate);
      }
    },

    removeCardioSession: (id) => {
      const previousSession = (get().userData.cardioSessions ?? []).find(
        (session) => session.id === id
      );
      const previousDate = normalizeSessionDate(previousSession?.date);

      updateUserData(set, get, (prev) => ({
        ...prev,
        cardioSessions: prev.cardioSessions.filter(
          (session) => session.id !== id
        ),
      }));

      if (previousDate) {
        get().upsertDailySnapshot(previousDate);
      }
    },

    removeCardioFavourite: (id) => {
      updateUserData(set, get, (prev) => ({
        ...prev,
        cardioFavourites: (prev.cardioFavourites ?? []).filter(
          (session) => session.id !== id
        ),
      }));
    },

    removeTrainingFavourite: (id) => {
      updateUserData(set, get, (prev) => ({
        ...prev,
        trainingFavourites: (prev.trainingFavourites ?? []).filter(
          (session) => session.id !== id
        ),
      }));
    },

    updateTrainingType: (key, { name, calories }) => {
      updateUserData(set, get, (prev) => {
        const numericCalories = Number(calories);
        const normalizedCalories = Number.isFinite(numericCalories)
          ? Math.max(0, numericCalories)
          : 0;
        const nextOverrides = {
          ...(prev.trainingType ?? {}),
          [key]: {
            label: name,
            caloriesPerHour: normalizedCalories,
          },
        };

        return {
          ...prev,
          trainingType: nextOverrides,
        };
      });
    },

    addCustomCardioType: ({ label, met }) => {
      const fallbackLabel = 'Custom Cardio';
      const sanitizedLabel = String(label ?? '').trim() || fallbackLabel;
      const parseMet = (value, fallback) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric <= 0) {
          return fallback;
        }
        return Math.round(numeric * 10) / 10;
      };
      const nextMet = {
        light: parseMet(met?.light, 3),
        moderate: parseMet(met?.moderate, 5),
        vigorous: parseMet(met?.vigorous, 7),
      };
      const key = `custom_cardio_${Date.now()}_${Math.round(Math.random() * 1000)}`;

      updateUserData(set, get, (prev) => ({
        ...prev,
        customCardioTypes: {
          ...(prev.customCardioTypes ?? {}),
          [key]: {
            label: sanitizedLabel,
            met: nextMet,
          },
        },
      }));

      return key;
    },

    removeCustomCardioType: (key) => {
      if (!key) return;
      updateUserData(set, get, (prev) => {
        const nextCustom = { ...(prev.customCardioTypes ?? {}) };
        if (!nextCustom[key]) {
          return prev;
        }
        delete nextCustom[key];

        const fallbackType = 'treadmill_walk';
        const nextSessions = prev.cardioSessions.map((session) =>
          session.type === key ? { ...session, type: fallbackType } : session
        );

        return {
          ...prev,
          customCardioTypes: nextCustom,
          cardioSessions: nextSessions,
        };
      });
    },

    removeTrainingType: (key) => {
      if (!key) return;
      updateUserData(set, get, (prev) => {
        const nextOverrides = { ...(prev.trainingType ?? {}) };
        if (!Object.prototype.hasOwnProperty.call(nextOverrides, key)) {
          return prev;
        }
        delete nextOverrides[key];

        const fallbackType = 'trainingtype_1';
        const nextSessions = (prev.trainingSessions ?? []).map((session) =>
          session.type === key ? { ...session, type: fallbackType } : session
        );

        return {
          ...prev,
          trainingType: nextOverrides,
          trainingSessions: nextSessions,
        };
      });
    },

    calculateBreakdown: (steps, isTrainingDay, options = {}) => {
      const { userData, bmr, cardioTypes, trainingTypes } = get();
      return calculateCalorieBreakdown({
        steps,
        isTrainingDay,
        userData,
        bmr,
        cardioTypes,
        trainingTypes,
        tefContext: options?.tefContext,
        adaptiveThermogenesisContext: options?.adaptiveThermogenesisContext,
        dateKey: options?.dateKey,
      });
    },

    calculateTargetForGoal: (steps, isTrainingDay, goalKey, options = {}) => {
      const storeState = get();
      const { userData, bmr, cardioTypes, trainingTypes } = storeState;
      const goalDeltaOverride = resolveGoalDeltaOverride(storeState, goalKey);

      // Shared with the daily-snapshot builder (see calculateGoalSeededBreakdown)
      // so the recorded snapshot TDEE and the live target breakdown cannot drift.
      const breakdown = calculateGoalSeededBreakdown({
        steps,
        isTrainingDay,
        userData,
        bmr,
        cardioTypes,
        trainingTypes,
        tefContext: options?.tefContext,
        adaptiveThermogenesisContext: options?.adaptiveThermogenesisContext,
        dateKey: options?.dateKey,
        goalKey,
        goalDeltaOverride,
      });

      const targetCalories = calculateGoalCalories(
        breakdown.total,
        goalKey,
        goalDeltaOverride
      );
      return {
        breakdown,
        targetCalories,
        difference: targetCalories - breakdown.total,
      };
    },

    calculateCardioSessionCalories: (session) => {
      const { userData, cardioTypes } = get();
      return calculateCardioCalories(session, userData, cardioTypes);
    },

    calculateTrainingSessionCalories: (session) => {
      const { userData, trainingTypes } = get();
      return calculateTrainingSessionCalories(session, userData, trainingTypes);
    },

    upsertDailySnapshot: (dateKey, options = {}) => {
      const normalizedDate = normalizeDateKey(dateKey);
      if (!normalizedDate) {
        return null;
      }

      const storeState = get();
      const { userData, bmr, cardioTypes, trainingTypes } = storeState;
      const existingSnapshot = userData.dailySnapshots?.[normalizedDate];

      if (options.onlyIfMissing && existingSnapshot) {
        return existingSnapshot;
      }

      const goalKey = userData?.selectedGoal;
      let nextSnapshot = null;
      try {
        nextSnapshot = buildDailySnapshot({
          dateKey: normalizedDate,
          userData,
          bmr,
          cardioTypes,
          trainingTypes,
          existingSnapshot,
          goalKey,
          goalDeltaOverride: resolveGoalDeltaOverride(storeState, goalKey),
        });
      } catch (error) {
        // A snapshot-build failure must never break the store's subscription
        // chain: the debounced save and the day-turnover rollover both run
        // through this action. Surface the error and keep the existing
        // snapshot so the app stays usable.
        console.error('Failed to build daily snapshot', {
          dateKey: normalizedDate,
          error,
        });
      }

      if (!nextSnapshot) {
        return existingSnapshot ?? null;
      }

      if (areDailySnapshotsEquivalent(existingSnapshot, nextSnapshot)) {
        return existingSnapshot ?? nextSnapshot;
      }

      updateUserData(set, get, (prev) => ({
        ...prev,
        dailySnapshots: {
          ...(prev.dailySnapshots ?? {}),
          [normalizedDate]: nextSnapshot,
        },
      }));

      return nextSnapshot;
    },

    saveWeightEntry: ({ date, weight }, originalDate) => {
      const normalizedDate = normalizeDateKey(date);
      const sanitizedWeight = clampWeight(weight);
      const normalizedOriginal = normalizeDateKey(originalDate);

      if (!normalizedDate || sanitizedWeight == null) {
        return;
      }

      updateUserData(set, get, (prev) => {
        const existingEntries = Array.isArray(prev.weightEntries)
          ? prev.weightEntries
          : [];

        const filtered = existingEntries.filter((entry) => {
          if (!entry || typeof entry !== 'object') {
            return false;
          }
          const entryDate = normalizeDateKey(entry.date);
          if (!entryDate) {
            return false;
          }
          if (entryDate === normalizedDate) {
            return false;
          }
          if (normalizedOriginal && entryDate === normalizedOriginal) {
            return false;
          }
          return true;
        });

        const nextEntries = sortWeightEntries([
          ...filtered,
          { date: normalizedDate, weight: sanitizedWeight },
        ]);

        const latestWeight = nextEntries.length
          ? nextEntries[nextEntries.length - 1].weight
          : prev.weight;

        return {
          ...prev,
          weight: latestWeight ?? prev.weight,
          weightEntries: nextEntries,
        };
      });
    },

    deleteWeightEntry: (date) => {
      const normalizedDate = normalizeDateKey(date);
      if (!normalizedDate) {
        return;
      }

      updateUserData(set, get, (prev) => {
        const existingEntries = Array.isArray(prev.weightEntries)
          ? prev.weightEntries
          : [];
        const filtered = existingEntries.filter(
          (entry) => normalizeDateKey(entry?.date) !== normalizedDate
        );

        if (filtered.length === existingEntries.length) {
          return prev;
        }

        const nextEntries = sortWeightEntries(filtered);
        if (nextEntries.length === 0) {
          return prev;
        }
        const latestWeight = nextEntries.length
          ? nextEntries[nextEntries.length - 1].weight
          : prev.weight;

        const nextUserData = {
          ...prev,
          weight: nextEntries.length ? latestWeight : prev.weight,
          weightEntries: nextEntries,
          phaseLogV2: clearWeightRefsForDate(prev.phaseLogV2, normalizedDate),
        };
        return nextUserData;
      });
    },

    saveBodyFatEntry: ({ date, bodyFat }, originalDate) => {
      const normalizedDate = normalizeDateKey(date);
      const sanitizedBodyFat = clampBodyFat(bodyFat);
      const normalizedOriginal = normalizeDateKey(originalDate);

      if (!normalizedDate || sanitizedBodyFat == null) {
        return;
      }

      updateUserData(set, get, (prev) => {
        const existingEntries = Array.isArray(prev.bodyFatEntries)
          ? prev.bodyFatEntries
          : [];

        const filtered = existingEntries.filter((entry) => {
          if (!entry || typeof entry !== 'object') {
            return false;
          }
          const entryDate = normalizeDateKey(entry.date);
          if (!entryDate) {
            return false;
          }
          if (entryDate === normalizedDate) {
            return false;
          }
          if (normalizedOriginal && entryDate === normalizedOriginal) {
            return false;
          }
          return true;
        });

        const nextEntries = sortBodyFatEntries([
          ...filtered,
          { date: normalizedDate, bodyFat: sanitizedBodyFat },
        ]);

        return {
          ...prev,
          bodyFatEntries: nextEntries,
        };
      });
    },

    deleteBodyFatEntry: (date) => {
      const normalizedDate = normalizeDateKey(date);
      if (!normalizedDate) {
        return;
      }

      updateUserData(set, get, (prev) => {
        const existingEntries = Array.isArray(prev.bodyFatEntries)
          ? prev.bodyFatEntries
          : [];
        const filtered = existingEntries.filter(
          (entry) => normalizeDateKey(entry?.date) !== normalizedDate
        );

        if (filtered.length === existingEntries.length) {
          return prev;
        }

        const nextEntries = sortBodyFatEntries(filtered);
        if (nextEntries.length === 0) {
          return prev;
        }

        const nextUserData = {
          ...prev,
          bodyFatEntries: nextEntries,
          phaseLogV2: clearBodyFatRefsForDate(prev.phaseLogV2, normalizedDate),
        };
        return nextUserData;
      });
    },

    saveStepEntry: ({ date, steps, source = 'healthConnect' }) => {
      const normalizedDate = normalizeDateKey(date);
      const sanitizedSteps =
        Number.isFinite(steps) && steps >= 0 ? Math.round(steps) : 0;

      if (!normalizedDate) {
        return;
      }

      updateUserData(set, get, (prev) => {
        const existingEntries = Array.isArray(prev.stepEntries)
          ? prev.stepEntries
          : [];

        // Remove any existing entry for the same date
        const filtered = existingEntries.filter(
          (entry) => normalizeDateKey(entry?.date) !== normalizedDate
        );

        const nextEntries = sortStepEntries([
          ...filtered,
          { date: normalizedDate, steps: sanitizedSteps, source },
        ]);

        return {
          ...prev,
          stepEntries: nextEntries,
        };
      });

      get().upsertDailySnapshot(normalizedDate);
    },

    setStepGoal: (goal) => {
      const sanitizedGoal =
        Number.isFinite(goal) && goal >= 0 ? Math.round(goal) : 10000;

      updateUserData(set, get, (prev) => ({
        ...prev,
        stepGoal: sanitizedGoal,
      }));
    },

    markSwipeHintSeen: () => {
      updateUserData(set, get, (prev) => {
        if (prev.hasSeenSwipeHint === true) {
          return prev;
        }
        return { ...prev, hasSeenSwipeHint: true };
      });
    },

    markMacroHintSeen: () => {
      updateUserData(set, get, (prev) => {
        if (prev.hasSeenMacroHint === true) {
          return prev;
        }
        return { ...prev, hasSeenMacroHint: true };
      });
    },

    markPinHintSeen: () => {
      updateUserData(set, get, (prev) => {
        if (prev.hasSeenPinHint === true) {
          return prev;
        }
        return { ...prev, hasSeenPinHint: true };
      });
    },

    setDailyNeatOverride: (dateKey, overrideOrNull) => {
      const normalizedDate = normalizeDateKey(dateKey);
      if (!normalizedDate) {
        return;
      }

      updateUserData(set, get, (prev) => {
        const nextOverrides = { ...(prev.dailyNeatOverrides ?? {}) };

        if (overrideOrNull == null) {
          if (!nextOverrides[normalizedDate]) {
            return prev;
          }
          delete nextOverrides[normalizedDate];
        } else {
          const numericMultiplier = Number(overrideOrNull?.multiplier);
          if (!Number.isFinite(numericMultiplier)) {
            return prev;
          }

          const rawPresetKey = String(overrideOrNull?.presetKey ?? '').trim();
          const rawLabel = String(overrideOrNull?.label ?? '').trim();

          nextOverrides[normalizedDate] = {
            multiplier: clampCustomActivityMultiplier(numericMultiplier),
            presetKey: rawPresetKey.length > 0 ? rawPresetKey : null,
            label: rawLabel.length > 0 ? rawLabel : null,
            updatedAt: Date.now(),
          };
        }

        return {
          ...prev,
          dailyNeatOverrides: nextOverrides,
        };
      });

      get().upsertDailySnapshot(normalizedDate);
    },

    /**
     * Rebuilds several snapshots in ONE store write (a 30-90 day health
     * backfill would otherwise cost one set() + deriveState per day).
     * `onlyIfExisting: true` refreshes days that already have a snapshot and
     * never seeds new ones: a seeded day the user did not track would carry
     * intake 0 and poison Rolling Energy Balance / smart AT.
     */
    upsertDailySnapshots: (dateKeys, options = {}) => {
      const storeState = get();
      const { userData, bmr, cardioTypes, trainingTypes } = storeState;
      const goalKey = userData?.selectedGoal;
      const goalDeltaOverride = resolveGoalDeltaOverride(storeState, goalKey);
      const updates = {};

      Array.from(new Set(Array.isArray(dateKeys) ? dateKeys : []))
        .map((dateKey) => normalizeDateKey(dateKey))
        .filter(Boolean)
        .forEach((normalizedDate) => {
          const existingSnapshot = userData.dailySnapshots?.[normalizedDate];
          if (options.onlyIfExisting && !existingSnapshot) {
            return;
          }
          let nextSnapshot = null;
          try {
            nextSnapshot = buildDailySnapshot({
              dateKey: normalizedDate,
              userData,
              bmr,
              cardioTypes,
              trainingTypes,
              existingSnapshot,
              goalKey,
              goalDeltaOverride,
            });
          } catch (error) {
            console.error('Failed to build daily snapshot', {
              dateKey: normalizedDate,
              error,
            });
          }
          if (
            nextSnapshot &&
            !areDailySnapshotsEquivalent(existingSnapshot, nextSnapshot)
          ) {
            updates[normalizedDate] = nextSnapshot;
          }
        });

      if (!Object.keys(updates).length) {
        return;
      }

      updateUserData(set, get, (prev) => ({
        ...prev,
        dailySnapshots: { ...(prev.dailySnapshots ?? {}), ...updates },
      }));
    },

    /**
     * Merges synced daily heart-rate readings (field-level; a manual resting
     * HR is never overwritten) and refreshes the existing snapshots they can
     * move. Returns the dates whose entries changed.
     */
    saveHeartRateEntries: (incomingEntries) => {
      if (!Array.isArray(incomingEntries) || !incomingEntries.length) {
        return [];
      }

      const changedDates = [];
      updateUserData(set, get, (prev) => {
        const byDate = new Map(
          (Array.isArray(prev.heartRateEntries) ? prev.heartRateEntries : [])
            .filter((entry) => normalizeDateKey(entry?.date))
            .map((entry) => [normalizeDateKey(entry.date), entry])
        );
        const now = Date.now();
        incomingEntries.forEach((incoming) => {
          const date = normalizeDateKey(incoming?.date);
          if (!date) {
            return;
          }
          const existing = byDate.get(date) ?? null;
          const merged = mergeSyncedHeartRateEntry(
            existing,
            { ...incoming, date },
            now
          );
          if (merged && merged !== existing) {
            byDate.set(date, merged);
            changedDates.push(date);
          }
        });

        if (!changedDates.length) {
          return prev;
        }
        return {
          ...prev,
          heartRateEntries: sortHeartRateEntries(Array.from(byDate.values())),
        };
      });

      if (changedDates.length) {
        get().upsertDailySnapshots(getHeartRateAffectedDateKeys(changedDates), {
          onlyIfExisting: true,
        });
      }
      return changedDates;
    },

    /** Sets (bpm) or clears (null) the manual morning resting HR for a date. */
    setManualRestingHeartRate: (dateKey, bpmOrNull) => {
      const normalizedDate = normalizeDateKey(dateKey);
      if (!normalizedDate) {
        return;
      }

      let changed = false;
      updateUserData(set, get, (prev) => {
        const entries = Array.isArray(prev.heartRateEntries)
          ? prev.heartRateEntries
          : [];
        const existing =
          entries.find(
            (entry) => normalizeDateKey(entry?.date) === normalizedDate
          ) ?? null;
        const next = applyManualRestingHeartRate(
          existing,
          normalizedDate,
          bpmOrNull
        );
        if (next === existing) {
          return prev;
        }
        changed = true;
        const others = entries.filter(
          (entry) => normalizeDateKey(entry?.date) !== normalizedDate
        );
        return {
          ...prev,
          heartRateEntries: sortHeartRateEntries(
            next ? [...others, next] : others
          ),
        };
      });

      if (!changed) {
        return;
      }
      get().upsertDailySnapshots(
        getHeartRateAffectedDateKeys([normalizedDate]),
        { onlyIfExisting: true }
      );
      if (normalizedDate === getTodayDateKey()) {
        get().upsertDailySnapshot(normalizedDate);
      }
    },

    createPhase: (phaseData) => {
      const { weightEntries, bodyFatEntries, userData } = get();
      const latestEntry = weightEntries.length
        ? weightEntries[weightEntries.length - 1]
        : null;
      const startingWeight = latestEntry?.weight ?? userData.weight;
      const latestBodyFatEntry = bodyFatEntries.length
        ? bodyFatEntries[bodyFatEntries.length - 1]
        : null;
      const startingBodyFat = Number(latestBodyFatEntry?.bodyFat);
      const creationMode =
        phaseData?.creationMode === 'target' ? 'target' : 'goal';
      // An empty target arrives as null, and `Number(null)` is 0.
      const targetWeight =
        Number(phaseData?.targetWeight) > 0
          ? Number(phaseData.targetWeight)
          : null;
      const targetBodyFat =
        Number(phaseData?.targetBodyFat) > 0
          ? Number(phaseData.targetBodyFat)
          : null;
      const targetPayload =
        creationMode === 'target'
          ? deriveTargetCreationModePayload({
              startDate: phaseData?.startDate,
              endDate: phaseData?.endDate,
              startWeightKg: startingWeight,
              targetWeightKg: targetWeight,
              startBodyFatPercent: Number.isFinite(startingBodyFat)
                ? startingBodyFat
                : null,
              targetBodyFatPercent: targetBodyFat,
            })
          : null;

      if (creationMode === 'target' && !targetPayload) {
        return null;
      }

      const targetMetric =
        targetPayload?.targetMetric ??
        (targetWeight != null && targetBodyFat != null
          ? 'weight_and_body_fat'
          : targetWeight != null
            ? 'weight'
            : targetBodyFat != null
              ? 'bodyFat'
              : null);

      const newPhase = {
        id: Date.now(),
        name: phaseData.name || 'New Phase',
        startDate: phaseData.startDate,
        endDate: phaseData.endDate || null,
        // A target phase's goal is the goal of the delta stored below
        // (`resolveGoalForDailyDelta`; phase normalization re-derives it from
        // the plan too), so the goal it selects (see
        // `syncSelectedGoalToActivePhase`) can never contradict that delta.
        goalType:
          (creationMode === 'target'
            ? targetPayload?.recommendedGoalType
            : null) ||
          phaseData.goalType ||
          'maintenance',
        creationMode,
        targetMetric,
        targetDateRequired: creationMode === 'target',
        targetAggressivenessBand:
          targetPayload?.smartCaloriePlan?.aggressivenessBand ?? null,
        targetWeight,
        targetBodyFat,
        smartCaloriePlan: targetPayload?.smartCaloriePlan ?? null,
        startingWeight,
        status: PHASE_STATUS.ACTIVE,
        color: phaseData.color || 'bg-accent-blue',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      updateUserData(set, get, (prev) => {
        const phaseLogV2 = normalizePhaseLogV2State(prev.phaseLogV2);
        const nextPhaseGoalDelta = Number(
          targetPayload?.smartCaloriePlan?.requiredDailyDeltaCalories
        );
        const shouldSetPhaseGoalDelta =
          creationMode === 'target' && Number.isFinite(nextPhaseGoalDelta);

        return {
          ...prev,
          phaseGoalCalorieDelta: shouldSetPhaseGoalDelta
            ? Math.round(nextPhaseGoalDelta)
            : null,
          phaseGoalCalorieDeltaSourcePhaseId: shouldSetPhaseGoalDelta
            ? newPhase.id
            : null,
          phaseLogV2: normalizePhaseLogV2State({
            ...phaseLogV2,
            phasesById: {
              ...phaseLogV2.phasesById,
              [newPhase.id]: newPhase,
            },
            phaseOrder: [...phaseLogV2.phaseOrder, newPhase.id],
            logIdsByPhaseId: {
              ...phaseLogV2.logIdsByPhaseId,
              [newPhase.id]: [],
            },
            logIdByPhaseDate: {
              ...phaseLogV2.logIdByPhaseDate,
              [newPhase.id]: {},
            },
            activePhaseId: newPhase.id,
          }),
        };
      });

      // A phase starting/ending/changing moves the goal lock and its smart
      // delta, i.e. today's `goalTarget`; keep today's snapshot in step (the
      // same refresh `setSelectedGoal` does). Past days keep their record.
      get().upsertDailySnapshot(getTodayDateKey());

      return newPhase.id;
    },

    updatePhase: (phaseId, updates) => {
      if (phaseId == null) {
        return;
      }

      updateUserData(set, get, (prev) => {
        const phaseLogV2 = normalizePhaseLogV2State(prev.phaseLogV2);
        const existingPhase = phaseLogV2.phasesById[phaseId];
        if (!existingPhase) {
          return prev;
        }

        const requestedStatus =
          updates?.status === 'active'
            ? PHASE_STATUS.ACTIVE
            : updates?.status === 'completed'
              ? PHASE_STATUS.COMPLETED
              : existingPhase.status;

        const nextActivePhaseId =
          requestedStatus === PHASE_STATUS.ACTIVE
            ? phaseId
            : phaseLogV2.activePhaseId === phaseId
              ? null
              : phaseLogV2.activePhaseId;

        return {
          ...prev,
          phaseLogV2: normalizePhaseLogV2State({
            ...phaseLogV2,
            phasesById: {
              ...phaseLogV2.phasesById,
              [phaseId]: {
                ...existingPhase,
                ...updates,
                status: requestedStatus,
                updatedAt: Date.now(),
              },
            },
            activePhaseId: nextActivePhaseId,
          }),
        };
      });

      // A phase starting/ending/changing moves the goal lock and its smart
      // delta, i.e. today's `goalTarget`; keep today's snapshot in step (the
      // same refresh `setSelectedGoal` does). Past days keep their record.
      get().upsertDailySnapshot(getTodayDateKey());
    },

    deletePhase: (phaseId) => {
      if (phaseId == null) {
        return;
      }

      updateUserData(set, get, (prev) => {
        const phaseLogV2 = normalizePhaseLogV2State(prev.phaseLogV2);
        if (!phaseLogV2.phasesById[phaseId]) {
          return prev;
        }

        const nextPhasesById = { ...phaseLogV2.phasesById };
        const nextLogsById = { ...phaseLogV2.logsById };
        const nextLogIdsByPhaseId = { ...phaseLogV2.logIdsByPhaseId };
        const nextLogIdByPhaseDate = { ...phaseLogV2.logIdByPhaseDate };

        (nextLogIdsByPhaseId[phaseId] ?? []).forEach((logId) => {
          delete nextLogsById[logId];
        });

        delete nextPhasesById[phaseId];
        delete nextLogIdsByPhaseId[phaseId];
        delete nextLogIdByPhaseDate[phaseId];

        return {
          ...prev,
          phaseLogV2: normalizePhaseLogV2State({
            ...phaseLogV2,
            phasesById: nextPhasesById,
            phaseOrder: phaseLogV2.phaseOrder.filter((id) => id !== phaseId),
            logsById: nextLogsById,
            logIdsByPhaseId: nextLogIdsByPhaseId,
            logIdByPhaseDate: nextLogIdByPhaseDate,
            activePhaseId:
              phaseLogV2.activePhaseId === phaseId
                ? null
                : phaseLogV2.activePhaseId,
          }),
        };
      });

      // A phase starting/ending/changing moves the goal lock and its smart
      // delta, i.e. today's `goalTarget`; keep today's snapshot in step (the
      // same refresh `setSelectedGoal` does). Past days keep their record.
      get().upsertDailySnapshot(getTodayDateKey());
    },

    archivePhase: (phaseId) => {
      get().updatePhase(phaseId, { status: 'completed' });
    },

    setActivePhase: (phaseId) => {
      updateUserData(set, get, (prev) => {
        const phaseLogV2 = normalizePhaseLogV2State(prev.phaseLogV2);

        if (phaseId == null) {
          const nextPhasesById = Object.fromEntries(
            Object.entries(phaseLogV2.phasesById).map(([id, phase]) => [
              id,
              phase.status === PHASE_STATUS.ACTIVE
                ? {
                    ...phase,
                    status: PHASE_STATUS.COMPLETED,
                    endDate: phase.endDate || getTodayDateKey(),
                    updatedAt: Date.now(),
                  }
                : phase,
            ])
          );

          return {
            ...prev,
            phaseLogV2: normalizePhaseLogV2State({
              ...phaseLogV2,
              phasesById: nextPhasesById,
              activePhaseId: null,
            }),
          };
        }

        if (!phaseLogV2.phasesById[phaseId]) {
          return prev;
        }

        return {
          ...prev,
          phaseLogV2: normalizePhaseLogV2State({
            ...phaseLogV2,
            activePhaseId: phaseId,
          }),
        };
      });

      // A phase starting/ending/changing moves the goal lock and its smart
      // delta, i.e. today's `goalTarget`; keep today's snapshot in step (the
      // same refresh `setSelectedGoal` does). Past days keep their record.
      get().upsertDailySnapshot(getTodayDateKey());
    },

    addDailyLog: (phaseId, date, logData) => {
      if (!phaseId || !date) {
        return;
      }

      updateUserData(set, get, (prev) => {
        return {
          ...prev,
          phaseLogV2: upsertPhaseLogV2DailyLog(
            prev.phaseLogV2,
            phaseId,
            date,
            logData
          ),
        };
      });
    },

    updateDailyLog: (phaseId, date, updates) => {
      if (!phaseId || !date) {
        return;
      }

      updateUserData(set, get, (prev) => {
        return {
          ...prev,
          phaseLogV2: upsertPhaseLogV2DailyLog(
            prev.phaseLogV2,
            phaseId,
            date,
            updates
          ),
        };
      });
    },

    deleteDailyLog: (phaseId, date) => {
      if (!phaseId || !date) {
        return;
      }

      updateUserData(set, get, (prev) => {
        return {
          ...prev,
          phaseLogV2: removePhaseLogV2DailyLog(prev.phaseLogV2, phaseId, date),
        };
      });
    },

    addFoodEntry: (date, mealType, entry) => {
      if (!date || !mealType || !entry) {
        return;
      }

      updateUserData(set, get, (prev) => {
        const dateData = prev.nutritionData[date] || {};
        const mealEntries = Array.isArray(dateData[mealType])
          ? dateData[mealType]
          : [];

        // Logging surfaces number entries from counters that restart on every
        // mount, so uniqueness within the day is settled here.
        const entryId = resolveEntryId(entry.id, collectDayEntryIds(dateData));
        const nextEntry =
          entryId === entry.id ? entry : { ...entry, id: entryId };

        const nextNutritionData = {
          ...prev.nutritionData,
          [date]: {
            ...dateData,
            [mealType]: [...mealEntries, nextEntry],
          },
        };

        return {
          ...prev,
          nutritionData: nextNutritionData,
          phaseLogV2: syncNutritionRefsForDate(prev.phaseLogV2, date, true),
        };
      });

      const normalizedDate = normalizeDateKey(date);
      if (normalizedDate) {
        get().upsertDailySnapshot(normalizedDate);
      }
    },

    updateFoodEntry: (date, mealType, updatedEntry) => {
      if (!date || !mealType || !updatedEntry) {
        return;
      }

      updateUserData(set, get, (prev) => {
        const dateData = prev.nutritionData[date] || {};
        const mealEntries = Array.isArray(dateData[mealType])
          ? dateData[mealType]
          : [];

        const nextNutritionData = {
          ...prev.nutritionData,
          [date]: {
            ...dateData,
            [mealType]: mealEntries.map((entry) =>
              entry.id === updatedEntry.id ? updatedEntry : entry
            ),
          },
        };

        return {
          ...prev,
          nutritionData: nextNutritionData,
          phaseLogV2: syncNutritionRefsForDate(prev.phaseLogV2, date, true),
        };
      });

      const normalizedDate = normalizeDateKey(date);
      if (normalizedDate) {
        get().upsertDailySnapshot(normalizedDate);
      }
    },

    deleteFoodEntry: (date, mealType, entryId) => {
      if (!date || !mealType || entryId == null) {
        return;
      }

      updateUserData(set, get, (prev) => {
        const dateData = prev.nutritionData[date] || {};
        const mealEntries = Array.isArray(dateData[mealType])
          ? dateData[mealType]
          : [];

        const nextNutritionData = {
          ...prev.nutritionData,
          [date]: {
            ...dateData,
            [mealType]: mealEntries.filter((entry) => entry.id !== entryId),
          },
        };

        const hasNutritionForDate = hasNutritionEntriesForDate(
          nextNutritionData,
          date
        );

        return {
          ...prev,
          nutritionData: nextNutritionData,
          phaseLogV2: syncNutritionRefsForDate(
            prev.phaseLogV2,
            date,
            hasNutritionForDate
          ),
        };
      });

      const normalizedDate = normalizeDateKey(date);
      if (normalizedDate) {
        get().upsertDailySnapshot(normalizedDate);
      }
    },

    deleteMeal: (date, mealType) => {
      if (!date || !mealType) {
        return;
      }

      updateUserData(set, get, (prev) => {
        const dateData = prev.nutritionData[date] || {};
        // eslint-disable-next-line no-unused-vars
        const { [mealType]: _, ...remainingMeals } = dateData;

        const nextNutritionData = {
          ...prev.nutritionData,
          [date]: remainingMeals,
        };

        const hasNutritionForDate = hasNutritionEntriesForDate(
          nextNutritionData,
          date
        );

        return {
          ...prev,
          nutritionData: nextNutritionData,
          phaseLogV2: syncNutritionRefsForDate(
            prev.phaseLogV2,
            date,
            hasNutritionForDate
          ),
        };
      });

      const normalizedDate = normalizeDateKey(date);
      if (normalizedDate) {
        get().upsertDailySnapshot(normalizedDate);
      }
    },

    togglePinnedFood: (foodId) => {
      if (!foodId) return;

      updateUserData(set, get, (prev) => {
        return {
          ...prev,
          pinnedFoods: togglePinnedValue(prev.pinnedFoods, foodId),
        };
      });
    },

    togglePinnedCalorieTarget: (targetId) => {
      if (!targetId) return;

      updateUserData(set, get, (prev) => ({
        ...prev,
        pinnedCalorieTargets: togglePinnedValue(
          prev.pinnedCalorieTargets,
          targetId
        ),
      }));
    },

    togglePinnedCardioType: (typeKey) => {
      if (!typeKey) return;

      updateUserData(set, get, (prev) => ({
        ...prev,
        pinnedCardioTypes: togglePinnedValue(prev.pinnedCardioTypes, typeKey),
      }));
    },

    togglePinnedTrainingType: (typeKey) => {
      if (!typeKey) return;

      updateUserData(set, get, (prev) => ({
        ...prev,
        pinnedTrainingTypes: togglePinnedValue(
          prev.pinnedTrainingTypes,
          typeKey
        ),
      }));
    },

    addFoodFavourite: (foodFavourite) => {
      if (!foodFavourite) return;

      updateUserData(set, get, (prev) => ({
        ...prev,
        foodFavourites: [
          ...(prev.foodFavourites ?? []),
          {
            ...foodFavourite,
            id: Date.now(),
          },
        ],
      }));
    },

    removeFoodFavourite: (id) => {
      if (id == null) return;

      updateUserData(set, get, (prev) => ({
        ...prev,
        foodFavourites: (prev.foodFavourites ?? []).filter(
          (fav) => fav.id !== id
        ),
      }));
    },

    updateFoodFavourite: (id, updates) => {
      if (id == null) return;

      updateUserData(set, get, (prev) => ({
        ...prev,
        foodFavourites: (prev.foodFavourites ?? []).map((fav) =>
          fav.id === id ? { ...fav, ...updates, id: fav.id } : fav
        ),
      }));
    },

    // Recipes: user-built foods (ingredients + yield). Per-100g values and the
    // "1 serving" portion are derived (`buildRecipeFood`), so only the recipe
    // itself is stored. Logged entries are denormalised snapshots, so editing
    // or deleting a recipe never rewrites history. All three return whether
    // the change was applied.
    addRecipe: (recipe) => {
      const normalized = normalizeRecipe(recipe);
      if (!normalized) return false;

      const now = Date.now();
      updateUserData(set, get, (prev) => ({
        ...prev,
        recipes: [
          ...(prev.recipes ?? []).filter((item) => item.id !== normalized.id),
          {
            ...normalized,
            createdAt: normalized.createdAt ?? now,
            updatedAt: now,
          },
        ],
      }));
      return true;
    },

    updateRecipe: (id, updates) => {
      if (!id || !updates || typeof updates !== 'object') return false;

      const existing = (get().userData.recipes ?? []).find(
        (item) => item.id === id
      );
      if (!existing) return false;

      // Re-normalise the merged recipe so an edit can never store an invalid
      // one; the id and creation time are not editable.
      const next = normalizeRecipe({
        ...existing,
        ...updates,
        id,
        createdAt: existing.createdAt,
        updatedAt: Date.now(),
      });
      if (!next) return false;

      updateUserData(set, get, (prev) => ({
        ...prev,
        recipes: (prev.recipes ?? []).map((item) =>
          item.id === id ? next : item
        ),
      }));
      return true;
    },

    removeRecipe: (id) => {
      if (!id) return false;
      if (!(get().userData.recipes ?? []).some((item) => item.id === id)) {
        return false;
      }

      updateUserData(set, get, (prev) => ({
        ...prev,
        recipes: (prev.recipes ?? []).filter((item) => item.id !== id),
      }));
      return true;
    },

    updateCachedFoods: (newCachedFoods) => {
      updateUserData(set, get, (prev) => ({
        ...prev,
        cachedFoods: newCachedFoods,
      }));
    },
  }))
);

/**
 * Midnight day-turnover snapshot maintenance: rebuilds (finalizes) the
 * previous day's snapshot — required so EPOC carryover and other
 * cross-midnight effects are reflected — and seeds the current day when
 * missing. Hardened with try/catch so a build failure can never break the
 * store subscription/save chain, and safe to call repeatedly (idempotent via
 * the snapshot equivalence check).
 */
export const runDayTurnoverSnapshots = (previousDateKey, todayDateKey) => {
  const storeState = useEnergyMapStore.getState();
  if (!storeState.isLoaded) {
    return;
  }

  try {
    if (previousDateKey) {
      storeState.upsertDailySnapshot(previousDateKey);
    }
    storeState.upsertDailySnapshot(todayDateKey, { onlyIfMissing: true });
  } catch (error) {
    console.error('Failed day-turnover snapshot update', error);
  }
};

/**
 * Native app-resume catch-up: finalizes the last observed day (which may now
 * be yesterday after a midnight turnover while the app was backgrounded) and
 * seeds today. Marks the observed day as current so the debounced-save
 * subscriber does not repeat the same rollover.
 */
export const runResumeDayTurnoverCatchUp = () => {
  const storeState = useEnergyMapStore.getState();
  if (!storeState.isLoaded) {
    return false;
  }

  const todayDateKey = getTodayDateKey();
  const previousDateKey =
    lastObservedDateKey && lastObservedDateKey !== todayDateKey
      ? lastObservedDateKey
      : getPreviousDateKey(todayDateKey);

  runDayTurnoverSnapshots(previousDateKey, todayDateKey);
  lastObservedDateKey = todayDateKey;
  return true;
};

let hasSetup = false;
let saveTimeoutId = null;
let lastObservedDateKey = getTodayDateKey();

export const setupEnergyMapStore = () => {
  if (hasSetup) {
    return;
  }

  hasSetup = true;
  lastObservedDateKey = getTodayDateKey();

  useEnergyMapStore.getState().initialize();

  useEnergyMapStore.subscribe(
    (state) => state.userData,
    (userData) => {
      const storeState = useEnergyMapStore.getState();
      if (!storeState.isLoaded) {
        return;
      }

      const todayDateKey = getTodayDateKey();
      if (todayDateKey !== lastObservedDateKey) {
        const previousDateKey = lastObservedDateKey;
        // Mark before deferring: the deferred upserts below synchronously
        // re-fire this subscriber, so the marker must already be current or
        // the rollover would re-enter on every nested invocation.
        lastObservedDateKey = todayDateKey;
        // Defer out of the subscriber: upsertDailySnapshot performs
        // synchronous nested state updates, which must never run while
        // zustand is notifying listeners (re-entrant set inside a listener
        // wedged the UI at the midnight turnover).
        setTimeout(() => {
          runDayTurnoverSnapshots(previousDateKey, todayDateKey);
        }, 0);
      }

      if (saveTimeoutId) {
        clearTimeout(saveTimeoutId);
      }

      saveTimeoutId = setTimeout(async () => {
        try {
          await saveEnergyMapData(userData);
        } catch (error) {
          console.error('Failed deferred energy map save', error);
        }
      }, SAVE_DEBOUNCE_MS);
    }
  );
};
