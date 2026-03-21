import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { trainingTypes as baseTrainingTypes } from '../constants/trainingTypes';
import { cardioTypes as baseCardioTypes } from '../constants/cardioTypes';
import {
  calculateBMR,
  calculateCalorieBreakdown,
  calculateCardioCalories,
  calculateGoalCalories,
  getTotalCardioBurn,
  getTrainingCalories,
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
  PHASE_STATUS,
  convertLegacyPhasesToPhaseLogV2,
  convertPhaseLogV2ToLegacyPhases,
  normalizePhaseLogV2State,
  removePhaseLogV2DailyLog,
  upsertPhaseLogV2DailyLog,
} from '../utils/phaseLogV2';
import { hasNutritionEntriesForDate } from '../utils/phases';

const SAVE_DEBOUNCE_MS = 1000;

const resolveTrainingTypes = (userData) => {
  const overrides = userData.trainingTypeOverrides ?? {};
  const merged = Object.entries(baseTrainingTypes).reduce(
    (acc, [key, type]) => {
      acc[key] = {
        ...type,
        ...(overrides[key] ?? {}),
      };
      return acc;
    },
    {}
  );

  Object.keys(overrides).forEach((key) => {
    if (merged[key]) return;
    const override = overrides[key];
    merged[key] = {
      label: override.label ?? key,
      description: override.description ?? '',
      caloriesPerHour: override.caloriesPerHour ?? 0,
    };
  });

  return merged;
};

const resolveCardioTypes = (userData) => ({
  ...baseCardioTypes,
  ...(userData.customCardioTypes ?? {}),
});

const sortStepEntries = (entries) => {
  if (!Array.isArray(entries)) return [];
  return [...entries].sort((a, b) => a.date.localeCompare(b.date));
};

const getTodayDateKey = () => new Date().toISOString().slice(0, 10);

const normalizePhaseStateForUserData = (userData) => {
  const normalizedPhaseLogV2 = normalizePhaseLogV2State(userData.phaseLogV2);
  const { phases, activePhaseId, ...rest } = userData;
  return {
    ...rest,
    phaseLogV2: normalizedPhaseLogV2,
  };
};

const getLegacyPhaseView = (phaseLogV2) =>
  convertPhaseLogV2ToLegacyPhases(normalizePhaseLogV2State(phaseLogV2));

const initializePhaseLogV2 = (userData) => {
  const normalizedPhaseLogV2 = normalizePhaseLogV2State(userData.phaseLogV2);
  if (normalizedPhaseLogV2.phaseOrder.length > 0) {
    return normalizedPhaseLogV2;
  }

  if (!Array.isArray(userData.phases) || userData.phases.length === 0) {
    return normalizedPhaseLogV2;
  }

  return normalizePhaseLogV2State(
    convertLegacyPhasesToPhaseLogV2(
      userData.phases,
      userData.activePhaseId ?? null
    )
  );
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
  const phaseLogV2 = normalizePhaseLogV2State(userData.phaseLogV2);
  const legacyPhaseView = getLegacyPhaseView(phaseLogV2);
  const trainingTypes = resolveTrainingTypes(userData);
  const cardioTypes = resolveCardioTypes(userData);
  const bmr = calculateBMR(userData);
  const trainingCalories = getTrainingCalories(userData, trainingTypes);
  const totalCardioBurn = getTotalCardioBurn(userData, cardioTypes);
  const weightEntries = sortWeightEntries(userData.weightEntries ?? []);
  const bodyFatEntries = sortBodyFatEntries(userData.bodyFatEntries ?? []);
  const stepEntries = sortStepEntries(userData.stepEntries ?? []);
  const stepGoal = userData.stepGoal ?? 10000;

  return {
    trainingTypes,
    cardioTypes,
    bmr,
    trainingCalories,
    totalCardioBurn,
    weightEntries,
    bodyFatEntries,
    stepEntries,
    stepGoal,
    customCardioTypes: userData.customCardioTypes ?? {},
    cardioFavourites: userData.cardioFavourites ?? [],
    foodFavourites: userData.foodFavourites ?? [],
    nutritionData: userData.nutritionData ?? {},
    pinnedFoods: userData.pinnedFoods ?? [],
    cachedFoods: userData.cachedFoods ?? [],
    phases: legacyPhaseView.phases,
    phaseLogV2,
    activePhaseId: legacyPhaseView.activePhaseId,
    theme: userData.theme ?? 'dark',
  };
};

const updateUserData = (set, get, updater) => {
  set((state) => {
    const nextUserDataRaw =
      typeof updater === 'function' ? updater(state.userData) : updater;
    const nextUserData = normalizePhaseStateForUserData(nextUserDataRaw);

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
      const nextUserData = normalizePhaseStateForUserData({
        ...data,
        phaseLogV2: initializePhaseLogV2(data),
      });
      set({
        userData: nextUserData,
        ...deriveState(nextUserData),
        isLoaded: true,
      });
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
      updateUserData(set, get, (prev) => ({
        ...prev,
        cardioSessions: [
          ...prev.cardioSessions,
          { ...session, id: Date.now() },
        ],
      }));
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

      updateUserData(set, get, (prev) => ({
        ...prev,
        cardioSessions: prev.cardioSessions.map((session) =>
          session.id === id
            ? { ...session, ...updates, id: session.id }
            : session
        ),
      }));
    },

    removeCardioSession: (id) => {
      updateUserData(set, get, (prev) => ({
        ...prev,
        cardioSessions: prev.cardioSessions.filter(
          (session) => session.id !== id
        ),
      }));
    },

    removeCardioFavourite: (id) => {
      updateUserData(set, get, (prev) => ({
        ...prev,
        cardioFavourites: (prev.cardioFavourites ?? []).filter(
          (session) => session.id !== id
        ),
      }));
    },

    updateTrainingType: (key, { name, calories, description }) => {
      updateUserData(set, get, (prev) => {
        const numericCalories = Number(calories);
        const normalizedCalories = Number.isFinite(numericCalories)
          ? Math.max(0, numericCalories)
          : 0;
        const nextOverrides = {
          ...(prev.trainingTypeOverrides ?? {}),
          [key]: {
            label: name,
            description,
            caloriesPerHour: normalizedCalories,
          },
        };

        const nextState = {
          ...prev,
          trainingTypeOverrides: nextOverrides,
        };

        if (key === 'custom') {
          nextState.customTrainingName = name;
          nextState.customTrainingCalories = normalizedCalories;
          nextState.customTrainingDescription = description;
        }

        return nextState;
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
          phaseLogV2: clearBodyFatRefsForDate(
            prev.phaseLogV2,
            normalizedDate
          ),
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
        color: phaseData.color || '#3b82f6',
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

export const setupEnergyMapStore = () => {
  if (hasSetup) {
    return;
  }

  hasSetup = true;

  useEnergyMapStore.getState().initialize();

  useEnergyMapStore.subscribe(
    (state) => state.userData,
    (userData) => {
      if (!useEnergyMapStore.getState().isLoaded) {
        return;
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
