import { useCallback, useEffect, useMemo, useState } from 'react';
import { trainingTypes as baseTrainingTypes } from '../constants/trainingTypes';
import { cardioTypes } from '../constants/cardioTypes';
import { calculateBMR, calculateCalorieBreakdown, calculateCardioCalories, calculateGoalCalories, getTotalCardioBurn, getTrainingCalories } from '../utils/calculations';
import { getStepRangeSortValue } from '../utils/steps';
import { loadEnergyMapData, saveEnergyMapData } from '../utils/storage';

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
    const merged = Object.entries(baseTrainingTypes).reduce((acc, [key, type]) => {
      acc[key] = {
        ...type,
        ...(overrides[key] ?? {})
      };
      return acc;
    }, {});

    Object.keys(overrides).forEach((key) => {
      if (merged[key]) return;
      const override = overrides[key];
      merged[key] = {
        label: override.label ?? key,
        description: override.description ?? '',
        caloriesPerHour: override.caloriesPerHour ?? 0
      };
    });

    return merged;
  }, [userData.trainingTypeOverrides]);

  const bmr = useMemo(() => calculateBMR(userData), [userData]);
  const trainingCalories = useMemo(
    () => getTrainingCalories(userData, resolvedTrainingTypes),
    [resolvedTrainingTypes, userData]
  );
  const totalCardioBurn = useMemo(() => getTotalCardioBurn(userData, cardioTypes), [userData]);

  const calculateBreakdown = useCallback(
    (steps, isTrainingDay) =>
      calculateCalorieBreakdown({
        steps,
        isTrainingDay,
        userData,
        bmr,
        cardioTypes,
        trainingTypes: resolvedTrainingTypes
      }),
    [bmr, resolvedTrainingTypes, userData]
  );

  const calculateTargetForGoal = useCallback(
    (steps, isTrainingDay, goalKey) => {
      const breakdown = calculateBreakdown(steps, isTrainingDay);
      const targetCalories = calculateGoalCalories(breakdown.total, goalKey);
      return {
        breakdown,
        targetCalories,
        difference: targetCalories - breakdown.total
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
      stepRanges: prev.stepRanges.filter((range) => range !== stepRange)
    }));
  }, []);

  const addCardioSession = useCallback((session) => {
    setUserData((prev) => ({
      ...prev,
      cardioSessions: [...prev.cardioSessions, { ...session, id: Date.now() }]
    }));
  }, []);

  const removeCardioSession = useCallback((id) => {
    setUserData((prev) => ({
      ...prev,
      cardioSessions: prev.cardioSessions.filter((session) => session.id !== id)
    }));
  }, []);

  const updateTrainingType = useCallback((key, { name, calories, description }) => {
    setUserData((prev) => {
      const numericCalories = Number(calories);
      const normalizedCalories = Number.isFinite(numericCalories) ? Math.max(0, numericCalories) : 0;
      const nextOverrides = {
        ...(prev.trainingTypeOverrides ?? {}),
        [key]: {
          label: name,
          description,
          caloriesPerHour: normalizedCalories
        }
      };

      const nextState = {
        ...prev,
        trainingTypeOverrides: nextOverrides
      };

      if (key === 'custom') {
        nextState.customTrainingName = name;
        nextState.customTrainingCalories = normalizedCalories;
        nextState.customTrainingDescription = description;
      }

      return nextState;
    });
  }, []);

  const calculateCardioSessionCalories = useCallback(
    (session) => calculateCardioCalories(session, userData, cardioTypes),
    [userData]
  );

  return {
    userData,
  trainingTypes: resolvedTrainingTypes,
    cardioTypes,
    bmr,
    trainingCalories,
    totalCardioBurn,
    handleUserDataChange,
    addStepRange,
    removeStepRange,
    addCardioSession,
    removeCardioSession,
    updateTrainingType,
    calculateBreakdown,
    calculateTargetForGoal,
    calculateCardioSessionCalories
  };
};
