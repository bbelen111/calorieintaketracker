import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { cardioTypes as baseCardioTypes } from '../constants/cardioTypes';
import {
  calculateBMR,
  calculateCalorieBreakdown,
  calculateCardioCalories,
  calculateGoalCalories,
  getTotalCardioBurnForDate,
  getTotalTrainingBurnForDate,
} from '../utils/calculations';
import { getStepRangeSortValue } from '../utils/steps';
import {
  getDefaultEnergyMapData,
  loadEnergyMapData,
  saveEnergyMapData,
} from '../utils/storage';
import {
  clampWeight,
  normalizeDateKey,
  sortWeightEntries,
} from '../utils/weight';
import { clampBodyFat, sortBodyFatEntries } from '../utils/bodyFat';
import { sanitizeAge, sanitizeHeight } from '../utils/profile';
import {
  areDailySnapshotsEquivalent,
  buildDailySnapshot,
  getPreviousDateKey,
} from '../utils/dailySnapshots';
import {
  PHASE_STATUS,
  deriveDailyLogStatus,
  LOG_COMPLETION_STATUS,
  normalizePhaseLogV2State,
  removePhaseLogV2DailyLog,
  upsertPhaseLogV2DailyLog,
} from '../utils/phaseLogV2';
import { hasNutritionEntriesForDate } from '../utils/phases';
import { getTodayDateKey } from '../utils/dateKeys';

const SAVE_DEBOUNCE_MS = 1000;
const DEFAULT_TRAINING_TYPE_CATALOG =
  getDefaultEnergyMapData().trainingType ?? {};
const trainingTypesCache = new WeakMap();
const cardioTypesCache = new WeakMap();
const weightEntriesSortCache = new WeakMap();
const bodyFatEntriesSortCache = new WeakMap();
const stepEntriesSortCache = new WeakMap();

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

const normalizePhaseStateForUserData = (userData) => {
  const normalizedPhaseLogV2 = getCachedNormalizedPhaseLogV2(
    userData?.phaseLogV2
  );

  if (userData?.phaseLogV2 === normalizedPhaseLogV2) {
    return userData;
  }

  const { ...rest } = userData;
  return {
    ...rest,
    phaseLogV2: normalizedPhaseLogV2,
  };
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
  const trainingTypes = resolveTrainingTypes(userData);
  const cardioTypes = resolveCardioTypes(userData);
  const todayDateKey = getTodayDateKey();
  const bmr = calculateBMR(userData);
  const trainingCalories = getTotalTrainingBurnForDate(
    userData,
    trainingTypes,
    todayDateKey
  );
  const totalCardioBurn = getTotalCardioBurnForDate(
    userData,
    cardioTypes,
    todayDateKey
  );
  const weightEntries = getCachedSortedWeightEntries(userData.weightEntries);
  const bodyFatEntries = getCachedSortedBodyFatEntries(userData.bodyFatEntries);
  const stepEntries = getCachedSortedStepEntries(userData.stepEntries);
  const stepGoal = userData.stepGoal ?? 10000;
  const selectedGoal = userData.selectedGoal ?? 'maintenance';
  const goalChangedAt = Number(userData.goalChangedAt) || Date.now();

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
    stepGoal,
    selectedGoal,
    goalChangedAt,
    goalDurationDays: getGoalDurationDays(goalChangedAt),
    customCardioTypes: userData.customCardioTypes ?? {},
    cardioFavourites: userData.cardioFavourites ?? [],
    foodFavourites: userData.foodFavourites ?? [],
    nutritionData: userData.nutritionData ?? {},
    pinnedFoods: userData.pinnedFoods ?? [],
    cachedFoods: userData.cachedFoods ?? [],
    dailySnapshots: userData.dailySnapshots ?? {},
    phases: phaseView.phases,
    phaseLogV2,
    activePhaseId: phaseView.activePhaseId,
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

export const useEnergyMapStore = create(
  subscribeWithSelector((set, get) => ({
    userData: getDefaultEnergyMapData(),
    isLoaded: false,
    ...deriveState(getDefaultEnergyMapData()),

    initialize: async () => {
      if (get().isLoaded) {
        return;
      }
      const data = await loadEnergyMapData();
      const nextUserData = normalizePhaseStateForUserData(data);
      set({
        userData: nextUserData,
        ...deriveState(nextUserData),
        isLoaded: true,
      });

      const todayDateKey = getTodayDateKey();
      const previousDateKey = getPreviousDateKey(todayDateKey);
      if (previousDateKey) {
        get().upsertDailySnapshot(previousDateKey, { onlyIfMissing: true });
      }
      get().upsertDailySnapshot(todayDateKey, { onlyIfMissing: true });
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

        return { ...prev, [field]: value };
      });
    },

    setSelectedGoal: (goalKey, changedAt = Date.now()) => {
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
      const requestedTefContext = options?.tefContext;
      const shouldResolveTargetCalories =
        requestedTefContext?.mode === 'target' &&
        !Number.isFinite(Number(requestedTefContext?.targetCalories));

      let breakdown = get().calculateBreakdown(steps, isTrainingDay, options);

      if (shouldResolveTargetCalories) {
        for (let pass = 0; pass < 2; pass += 1) {
          const targetCaloriesForTef = calculateGoalCalories(
            breakdown.total,
            goalKey
          );

          breakdown = get().calculateBreakdown(steps, isTrainingDay, {
            ...options,
            tefContext: {
              ...requestedTefContext,
              targetCalories: targetCaloriesForTef,
            },
          });
        }
      }

      const targetCalories = calculateGoalCalories(breakdown.total, goalKey);
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

    upsertDailySnapshot: (dateKey, options = {}) => {
      const normalizedDate = normalizeDateKey(dateKey);
      if (!normalizedDate) {
        return null;
      }

      const { userData, bmr, cardioTypes, trainingTypes } = get();
      const existingSnapshot = userData.dailySnapshots?.[normalizedDate];

      if (options.onlyIfMissing && existingSnapshot) {
        return existingSnapshot;
      }

      const nextSnapshot = buildDailySnapshot({
        dateKey: normalizedDate,
        userData,
        bmr,
        cardioTypes,
        trainingTypes,
        existingSnapshot,
      });

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

    createPhase: (phaseData) => {
      const { weightEntries, userData } = get();
      const latestEntry = weightEntries.length
        ? weightEntries[weightEntries.length - 1]
        : null;
      const startingWeight = latestEntry?.weight ?? userData.weight;

      const newPhase = {
        id: Date.now(),
        name: phaseData.name || 'New Phase',
        startDate: phaseData.startDate,
        endDate: phaseData.endDate || null,
        goalType: phaseData.goalType || 'maintenance',
        targetWeight: phaseData.targetWeight || null,
        startingWeight,
        status: PHASE_STATUS.ACTIVE,
        color: phaseData.color || 'bg-accent-blue',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      updateUserData(set, get, (prev) => {
        const phaseLogV2 = normalizePhaseLogV2State(prev.phaseLogV2);

        return {
          ...prev,
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

        const nextNutritionData = {
          ...prev.nutritionData,
          [date]: {
            ...dateData,
            [mealType]: [...mealEntries, entry],
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
        const currentPinned = prev.pinnedFoods ?? [];
        const isPinned = currentPinned.includes(foodId);

        return {
          ...prev,
          pinnedFoods: isPinned
            ? currentPinned.filter((id) => id !== foodId)
            : [...currentPinned, foodId],
        };
      });
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

    updateCachedFoods: (newCachedFoods) => {
      updateUserData(set, get, (prev) => ({
        ...prev,
        cachedFoods: newCachedFoods,
      }));
    },
  }))
);

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
        storeState.upsertDailySnapshot(lastObservedDateKey);
        storeState.upsertDailySnapshot(todayDateKey, { onlyIfMissing: true });
        lastObservedDateKey = todayDateKey;
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
