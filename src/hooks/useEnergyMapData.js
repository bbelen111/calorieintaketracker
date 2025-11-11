import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { loadEnergyMapData, saveEnergyMapData } from '../utils/storage';
import {
  clampWeight,
  normalizeDateKey,
  sortWeightEntries,
} from '../utils/weight';

export const useEnergyMapData = () => {
  const [userData, setUserData] = useState(() => loadEnergyMapData());

  useEffect(() => {
    saveEnergyMapData(userData);
  }, [userData]);

  const handleUserDataChange = useCallback((field, value) => {
    setUserData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const resolvedTrainingTypes = useMemo(() => {
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
  }, [userData.trainingTypeOverrides]);

  const resolvedCardioTypes = useMemo(
    () => ({
      ...baseCardioTypes,
      ...(userData.customCardioTypes ?? {}),
    }),
    [userData.customCardioTypes]
  );

  const bmr = useMemo(() => calculateBMR(userData), [userData]);
  const trainingCalories = useMemo(
    () => getTrainingCalories(userData, resolvedTrainingTypes),
    [resolvedTrainingTypes, userData]
  );
  const totalCardioBurn = useMemo(
    () => getTotalCardioBurn(userData, resolvedCardioTypes),
    [resolvedCardioTypes, userData]
  );

  const weightEntries = useMemo(
    () => sortWeightEntries(userData.weightEntries ?? []),
    [userData.weightEntries]
  );

  const calculateBreakdown = useCallback(
    (steps, isTrainingDay) =>
      calculateCalorieBreakdown({
        steps,
        isTrainingDay,
        userData,
        bmr,
        cardioTypes: resolvedCardioTypes,
        trainingTypes: resolvedTrainingTypes,
      }),
    [bmr, resolvedCardioTypes, resolvedTrainingTypes, userData]
  );

  const calculateTargetForGoal = useCallback(
    (steps, isTrainingDay, goalKey) => {
      const breakdown = calculateBreakdown(steps, isTrainingDay);
      const targetCalories = calculateGoalCalories(breakdown.total, goalKey);
      return {
        breakdown,
        targetCalories,
        difference: targetCalories - breakdown.total,
      };
    },
    [calculateBreakdown]
  );

  const addStepRange = useCallback((newStepRange) => {
    if (!newStepRange) return;
    setUserData((prev) => {
      if (prev.stepRanges.includes(newStepRange)) {
        return prev;
      }
      const nextRanges = [...prev.stepRanges, newStepRange].sort(
        (a, b) => getStepRangeSortValue(a) - getStepRangeSortValue(b)
      );
      return { ...prev, stepRanges: nextRanges };
    });
  }, []);

  const removeStepRange = useCallback((stepRange) => {
    setUserData((prev) => ({
      ...prev,
      stepRanges: prev.stepRanges.filter((range) => range !== stepRange),
    }));
  }, []);

  const addCardioSession = useCallback((session) => {
    setUserData((prev) => ({
      ...prev,
      cardioSessions: [...prev.cardioSessions, { ...session, id: Date.now() }],
    }));
  }, []);

  const addCardioFavourite = useCallback((session) => {
    setUserData((prev) => ({
      ...prev,
      cardioFavourites: [
        ...(prev.cardioFavourites ?? []),
        {
          ...session,
          id: Date.now(),
        },
      ],
    }));
  }, []);

  const updateCardioSession = useCallback((id, updates) => {
    if (id == null) {
      return;
    }

    setUserData((prev) => ({
      ...prev,
      cardioSessions: prev.cardioSessions.map((session) =>
        session.id === id ? { ...session, ...updates, id: session.id } : session
      ),
    }));
  }, []);

  const removeCardioSession = useCallback((id) => {
    setUserData((prev) => ({
      ...prev,
      cardioSessions: prev.cardioSessions.filter(
        (session) => session.id !== id
      ),
    }));
  }, []);

  const removeCardioFavourite = useCallback((id) => {
    setUserData((prev) => ({
      ...prev,
      cardioFavourites: (prev.cardioFavourites ?? []).filter(
        (session) => session.id !== id
      ),
    }));
  }, []);

  const updateTrainingType = useCallback(
    (key, { name, calories, description }) => {
      setUserData((prev) => {
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
    []
  );

  const calculateCardioSessionCalories = useCallback(
    (session) =>
      calculateCardioCalories(session, userData, resolvedCardioTypes),
    [resolvedCardioTypes, userData]
  );

  const addCustomCardioType = useCallback(({ label, met }) => {
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

    setUserData((prev) => ({
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
  }, []);

  const removeCustomCardioType = useCallback((key) => {
    if (!key) return;
    setUserData((prev) => {
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
  }, []);

  const saveWeightEntry = useCallback(({ date, weight }, originalDate) => {
    const normalizedDate = normalizeDateKey(date);
    const sanitizedWeight = clampWeight(weight);
    const normalizedOriginal = normalizeDateKey(originalDate);

    if (!normalizedDate || sanitizedWeight == null) {
      return;
    }

    setUserData((prev) => {
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
  }, []);

  const deleteWeightEntry = useCallback((date) => {
    const normalizedDate = normalizeDateKey(date);
    if (!normalizedDate) {
      return;
    }

    setUserData((prev) => {
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
  }, []);

  const createPhase = useCallback(
    (phaseData) => {
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

      setUserData((prev) => ({
        ...prev,
        phases: [...prev.phases, newPhase],
        activePhaseId: newPhase.id,
      }));

      return newPhase.id;
    },
    [weightEntries, userData.weight]
  );

  const updatePhase = useCallback((phaseId, updates) => {
    if (phaseId == null) {
      return;
    }

    setUserData((prev) => ({
      ...prev,
      phases: prev.phases.map((phase) =>
        phase.id === phaseId ? { ...phase, ...updates } : phase
      ),
    }));
  }, []);

  const deletePhase = useCallback((phaseId) => {
    if (phaseId == null) {
      return;
    }

    setUserData((prev) => {
      const nextPhases = prev.phases.filter((phase) => phase.id !== phaseId);
      const nextActiveId =
        prev.activePhaseId === phaseId ? null : prev.activePhaseId;

      return {
        ...prev,
        phases: nextPhases,
        activePhaseId: nextActiveId,
      };
    });
  }, []);

  const archivePhase = useCallback(
    (phaseId) => {
      updatePhase(phaseId, { status: 'completed' });
    },
    [updatePhase]
  );

  const setActivePhase = useCallback((phaseId) => {
    setUserData((prev) => ({
      ...prev,
      activePhaseId: phaseId,
    }));
  }, []);

  const addDailyLog = useCallback((phaseId, date, logData) => {
    if (!phaseId || !date) {
      return;
    }

    setUserData((prev) => ({
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
  }, []);

  const updateDailyLog = useCallback((phaseId, date, updates) => {
    if (!phaseId || !date) {
      return;
    }

    setUserData((prev) => ({
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
  }, []);

  const deleteDailyLog = useCallback((phaseId, date) => {
    if (!phaseId || !date) {
      return;
    }

    setUserData((prev) => ({
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
  }, []);

  const addFoodEntry = useCallback((date, mealType, entry) => {
    if (!date || !mealType || !entry) {
      return;
    }

    setUserData((prev) => {
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
  }, []);

  const updateFoodEntry = useCallback((date, mealType, updatedEntry) => {
    if (!date || !mealType || !updatedEntry) {
      return;
    }

    setUserData((prev) => {
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
  }, []);

  const deleteFoodEntry = useCallback((date, mealType, entryId) => {
    if (!date || !mealType || entryId == null) {
      return;
    }

    setUserData((prev) => {
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
  }, []);

  const deleteMeal = useCallback((date, mealType) => {
    if (!date || !mealType) {
      return;
    }

    setUserData((prev) => {
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
  }, []);

  const togglePinnedFood = useCallback((foodId) => {
    if (!foodId) return;

    setUserData((prev) => {
      const currentPinned = prev.pinnedFoods ?? [];
      const isPinned = currentPinned.includes(foodId);

      return {
        ...prev,
        pinnedFoods: isPinned
          ? currentPinned.filter((id) => id !== foodId)
          : [...currentPinned, foodId],
      };
    });
  }, []);

  return {
    userData,
    weightEntries,
    trainingTypes: resolvedTrainingTypes,
    cardioTypes: resolvedCardioTypes,
    customCardioTypes: userData.customCardioTypes ?? {},
    cardioFavourites: userData.cardioFavourites ?? [],
    nutritionData: userData.nutritionData ?? {},
    pinnedFoods: userData.pinnedFoods ?? [],
    phases: userData.phases ?? [],
    activePhaseId: userData.activePhaseId,
    bmr,
    trainingCalories,
    totalCardioBurn,
    handleUserDataChange,
    addStepRange,
    removeStepRange,
    addCardioSession,
    removeCardioSession,
    updateCardioSession,
    addCardioFavourite,
    removeCardioFavourite,
    updateTrainingType,
    addCustomCardioType,
    removeCustomCardioType,
    calculateBreakdown,
    calculateTargetForGoal,
    calculateCardioSessionCalories,
    saveWeightEntry,
    deleteWeightEntry,
    createPhase,
    updatePhase,
    deletePhase,
    archivePhase,
    setActivePhase,
    addDailyLog,
    updateDailyLog,
    deleteDailyLog,
    addFoodEntry,
    updateFoodEntry,
    deleteFoodEntry,
    deleteMeal,
    togglePinnedFood,
  };
};
