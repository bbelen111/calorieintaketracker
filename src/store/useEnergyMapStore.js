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

const deriveState = (userData) => {
  const trainingTypes = resolveTrainingTypes(userData);
  const cardioTypes = resolveCardioTypes(userData);
  const bmr = calculateBMR(userData);
  const trainingCalories = getTrainingCalories(userData, trainingTypes);
  const totalCardioBurn = getTotalCardioBurn(userData, cardioTypes);
  const weightEntries = sortWeightEntries(userData.weightEntries ?? []);
  const bodyFatEntries = sortBodyFatEntries(userData.bodyFatEntries ?? []);

  return {
    trainingTypes,
    cardioTypes,
    bmr,
    trainingCalories,
    totalCardioBurn,
    weightEntries,
    bodyFatEntries,
    customCardioTypes: userData.customCardioTypes ?? {},
    cardioFavourites: userData.cardioFavourites ?? [],
    foodFavourites: userData.foodFavourites ?? [],
    nutritionData: userData.nutritionData ?? {},
    pinnedFoods: userData.pinnedFoods ?? [],
    cachedFoods: userData.cachedFoods ?? [],
    phases: userData.phases ?? [],
    activePhaseId: userData.activePhaseId,
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
      set({
        userData: data,
        ...deriveState(data),
        isLoaded: true,
      });
    },

    handleUserDataChange: (field, value) => {
      updateUserData(set, get, (prev) => ({ ...prev, [field]: value }));
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

    calculateBreakdown: (steps, isTrainingDay) => {
      const { userData, bmr, cardioTypes, trainingTypes } = get();
      return calculateCalorieBreakdown({
        steps,
        isTrainingDay,
        userData,
        bmr,
        cardioTypes,
        trainingTypes,
      });
    },

    calculateTargetForGoal: (steps, isTrainingDay, goalKey) => {
      const breakdown = get().calculateBreakdown(steps, isTrainingDay);
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

        return {
          ...prev,
          weight: nextEntries.length ? latestWeight : prev.weight,
          weightEntries: nextEntries,
        };
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

        return {
          ...prev,
          bodyFatEntries: nextEntries,
        };
      });
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

      updateUserData(set, get, (prev) => ({
        ...prev,
        phases: [...prev.phases, newPhase],
        activePhaseId: newPhase.id,
      }));

      return newPhase.id;
    },

    updatePhase: (phaseId, updates) => {
      if (phaseId == null) {
        return;
      }

      updateUserData(set, get, (prev) => ({
        ...prev,
        phases: prev.phases.map((phase) =>
          phase.id === phaseId ? { ...phase, ...updates } : phase
        ),
      }));
    },

    deletePhase: (phaseId) => {
      if (phaseId == null) {
        return;
      }

      updateUserData(set, get, (prev) => {
        const nextPhases = prev.phases.filter((phase) => phase.id !== phaseId);
        const nextActiveId =
          prev.activePhaseId === phaseId ? null : prev.activePhaseId;

        return {
          ...prev,
          phases: nextPhases,
          activePhaseId: nextActiveId,
        };
      });
    },

    archivePhase: (phaseId) => {
      get().updatePhase(phaseId, { status: 'completed' });
    },

    setActivePhase: (phaseId) => {
      updateUserData(set, get, (prev) => ({
        ...prev,
        activePhaseId: phaseId,
      }));
    },

    addDailyLog: (phaseId, date, logData) => {
      if (!phaseId || !date) {
        return;
      }

      updateUserData(set, get, (prev) => ({
        ...prev,
        phases: prev.phases.map((phase) => {
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
        }),
      }));
    },

    updateDailyLog: (phaseId, date, updates) => {
      if (!phaseId || !date) {
        return;
      }

      updateUserData(set, get, (prev) => ({
        ...prev,
        phases: prev.phases.map((phase) => {
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
        }),
      }));
    },

    deleteDailyLog: (phaseId, date) => {
      if (!phaseId || !date) {
        return;
      }

      updateUserData(set, get, (prev) => ({
        ...prev,
        phases: prev.phases.map((phase) => {
          if (phase.id !== phaseId) {
            return phase;
          }

          const nextLogs = { ...phase.dailyLogs };
          delete nextLogs[date];

          return {
            ...phase,
            dailyLogs: nextLogs,
          };
        }),
      }));
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

        return {
          ...prev,
          nutritionData: {
            ...prev.nutritionData,
            [date]: {
              ...dateData,
              [mealType]: [...mealEntries, entry],
            },
          },
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

        return {
          ...prev,
          nutritionData: {
            ...prev.nutritionData,
            [date]: {
              ...dateData,
              [mealType]: mealEntries.map((entry) =>
                entry.id === updatedEntry.id ? updatedEntry : entry
              ),
            },
          },
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

        return {
          ...prev,
          nutritionData: {
            ...prev.nutritionData,
            [date]: {
              ...dateData,
              [mealType]: mealEntries.filter((entry) => entry.id !== entryId),
            },
          },
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

        return {
          ...prev,
          nutritionData: {
            ...prev.nutritionData,
            [date]: remainingMeals,
          },
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

      saveTimeoutId = setTimeout(() => {
        saveEnergyMapData(userData);
      }, SAVE_DEBOUNCE_MS);
    }
  );
};
