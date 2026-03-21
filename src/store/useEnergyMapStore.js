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
  convertLegacyPhasesToPhaseLogV2,
  convertPhaseLogV2ToLegacyPhases,
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

const syncPhaseDomainFromLegacy = (nextUserData) => {
  const phaseLogV2 = convertLegacyPhasesToPhaseLogV2(
    nextUserData.phases ?? [],
    nextUserData.activePhaseId ?? null
  );
  const syncedLegacy = convertPhaseLogV2ToLegacyPhases(phaseLogV2);

  return {
    ...nextUserData,
    phases: syncedLegacy.phases,
    activePhaseId: syncedLegacy.activePhaseId,
    phaseLogV2,
  };
};

const clearWeightRefsForDate = (phases, dateKey) => {
  if (!Array.isArray(phases) || !dateKey) {
    return phases;
  }

  return phases.map((phase) => {
    if (!phase?.dailyLogs || typeof phase.dailyLogs !== 'object') {
      return phase;
    }

    let hasChanges = false;
    const nextLogs = Object.entries(phase.dailyLogs).reduce(
      (acc, [date, log]) => {
        if (!log || typeof log !== 'object') {
          acc[date] = log;
          return acc;
        }

        if (log.weightRef === dateKey) {
          hasChanges = true;
          acc[date] = {
            ...log,
            weightRef: '',
          };
          return acc;
        }

        acc[date] = log;
        return acc;
      },
      {}
    );

    return hasChanges
      ? {
          ...phase,
          dailyLogs: nextLogs,
        }
      : phase;
  });
};

const clearBodyFatRefsForDate = (phases, dateKey) => {
  if (!Array.isArray(phases) || !dateKey) {
    return phases;
  }

  return phases.map((phase) => {
    if (!phase?.dailyLogs || typeof phase.dailyLogs !== 'object') {
      return phase;
    }

    let hasChanges = false;
    const nextLogs = Object.entries(phase.dailyLogs).reduce(
      (acc, [date, log]) => {
        if (!log || typeof log !== 'object') {
          acc[date] = log;
          return acc;
        }

        if (log.bodyFatRef === dateKey) {
          hasChanges = true;
          acc[date] = {
            ...log,
            bodyFatRef: '',
          };
          return acc;
        }

        acc[date] = log;
        return acc;
      },
      {}
    );

    return hasChanges
      ? {
          ...phase,
          dailyLogs: nextLogs,
        }
      : phase;
  });
};

const syncNutritionRefsForDate = (phases, dateKey, hasNutritionForDate) => {
  if (!Array.isArray(phases) || !dateKey) {
    return phases;
  }

  return phases.map((phase) => {
    if (!phase?.dailyLogs || typeof phase.dailyLogs !== 'object') {
      return phase;
    }

    const targetLog = phase.dailyLogs[dateKey];
    if (!targetLog || typeof targetLog !== 'object') {
      return phase;
    }

    const currentRef =
      typeof targetLog.nutritionRef === 'string'
        ? targetLog.nutritionRef.trim()
        : '';

    if (hasNutritionForDate && currentRef === dateKey) {
      return phase;
    }

    if (!hasNutritionForDate && currentRef === '') {
      return phase;
    }

    return {
      ...phase,
      dailyLogs: {
        ...phase.dailyLogs,
        [dateKey]: {
          ...targetLog,
          nutritionRef: hasNutritionForDate ? dateKey : '',
        },
      },
    };
  });
};

const deriveState = (userData) => {
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
    phases: userData.phases ?? [],
    phaseLogV2: userData.phaseLogV2,
    activePhaseId: userData.activePhaseId,
    theme: userData.theme ?? 'dark',
  };
};

const updateUserData = (set, get, updater) => {
  set((state) => {
    const nextUserData =
      typeof updater === 'function' ? updater(state.userData) : updater;

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
      const syncedData = syncPhaseDomainFromLegacy(data);
      set({
        userData: syncedData,
        ...deriveState(syncedData),
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
          phases: clearWeightRefsForDate(prev.phases, normalizedDate),
        };

        return syncPhaseDomainFromLegacy(nextUserData);
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
          phases: clearBodyFatRefsForDate(prev.phases, normalizedDate),
        };

        return syncPhaseDomainFromLegacy(nextUserData);
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
        status: 'active',
        color: phaseData.color || '#3b82f6',
        dailyLogs: {},
        metrics: {
          totalDays: 0,
          activeDays: 0,
          avgCalories: 0,
          avgSteps: 0,
          weightChange: 0,
          avgWeeklyRate: 0,
        },
        createdAt: Date.now(),
      };

      updateUserData(set, get, (prev) =>
        syncPhaseDomainFromLegacy({
          ...prev,
          phases: [...prev.phases, newPhase],
          activePhaseId: newPhase.id,
        })
      );

      return newPhase.id;
    },

    updatePhase: (phaseId, updates) => {
      if (phaseId == null) {
        return;
      }

      updateUserData(set, get, (prev) => {
        const nextPhases = prev.phases.map((phase) =>
          phase.id === phaseId ? { ...phase, ...updates } : phase
        );

        const nextActiveId =
          updates?.status === 'active'
            ? phaseId
            : updates?.status === 'completed' && prev.activePhaseId === phaseId
              ? null
              : prev.activePhaseId;

        return syncPhaseDomainFromLegacy({
          ...prev,
          phases: nextPhases,
          activePhaseId: nextActiveId,
        });
      });
    },

    deletePhase: (phaseId) => {
      if (phaseId == null) {
        return;
      }

      updateUserData(set, get, (prev) => {
        const nextPhases = prev.phases.filter((phase) => phase.id !== phaseId);
        const nextActiveId =
          prev.activePhaseId === phaseId ? null : prev.activePhaseId;

        return syncPhaseDomainFromLegacy({
          ...prev,
          phases: nextPhases,
          activePhaseId: nextActiveId,
        });
      });
    },

    archivePhase: (phaseId) => {
      get().updatePhase(phaseId, { status: 'completed' });
    },

    setActivePhase: (phaseId) => {
      updateUserData(set, get, (prev) =>
        syncPhaseDomainFromLegacy({
          ...prev,
          activePhaseId: phaseId ?? null,
        })
      );
    },

    addDailyLog: (phaseId, date, logData) => {
      if (!phaseId || !date) {
        return;
      }

      updateUserData(set, get, (prev) => {
        const nextPhases = prev.phases.map((phase) => {
          if (phase.id !== phaseId) {
            return phase;
          }

          return {
            ...phase,
            dailyLogs: {
              ...phase.dailyLogs,
              [date]: { ...logData, date },
            },
          };
        });

        return syncPhaseDomainFromLegacy({
          ...prev,
          phases: nextPhases,
        });
      });
    },

    updateDailyLog: (phaseId, date, updates) => {
      if (!phaseId || !date) {
        return;
      }

      updateUserData(set, get, (prev) => {
        const nextPhases = prev.phases.map((phase) => {
          if (phase.id !== phaseId) {
            return phase;
          }

          const existingLog = phase.dailyLogs[date] || {};

          return {
            ...phase,
            dailyLogs: {
              ...phase.dailyLogs,
              [date]: { ...existingLog, ...updates, date },
            },
          };
        });

        return syncPhaseDomainFromLegacy({
          ...prev,
          phases: nextPhases,
        });
      });
    },

    deleteDailyLog: (phaseId, date) => {
      if (!phaseId || !date) {
        return;
      }

      updateUserData(set, get, (prev) => {
        const nextPhases = prev.phases.map((phase) => {
          if (phase.id !== phaseId) {
            return phase;
          }

          const nextLogs = { ...phase.dailyLogs };
          delete nextLogs[date];

          return {
            ...phase,
            dailyLogs: nextLogs,
          };
        });

        return syncPhaseDomainFromLegacy({
          ...prev,
          phases: nextPhases,
        });
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

        return syncPhaseDomainFromLegacy({
          ...prev,
          nutritionData: nextNutritionData,
          phases: syncNutritionRefsForDate(prev.phases, date, true),
        });
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

        return syncPhaseDomainFromLegacy({
          ...prev,
          nutritionData: nextNutritionData,
          phases: syncNutritionRefsForDate(prev.phases, date, true),
        });
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

        return syncPhaseDomainFromLegacy({
          ...prev,
          nutritionData: nextNutritionData,
          phases: syncNutritionRefsForDate(
            prev.phases,
            date,
            hasNutritionForDate
          ),
        });
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

        return syncPhaseDomainFromLegacy({
          ...prev,
          nutritionData: nextNutritionData,
          phases: syncNutritionRefsForDate(
            prev.phases,
            date,
            hasNutritionForDate
          ),
        });
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

      saveTimeoutId = setTimeout(() => {
        saveEnergyMapData(userData);
      }, SAVE_DEBOUNCE_MS);
    }
  );
};
