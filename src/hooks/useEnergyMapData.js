import { useCallback, useEffect, useMemo, useState } from 'react';
import { trainingTypes } from '../constants/trainingTypes';
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

  const bmr = useMemo(() => calculateBMR(userData), [userData]);
  const trainingCalories = useMemo(() => getTrainingCalories(userData, trainingTypes), [userData]);
  const totalCardioBurn = useMemo(() => getTotalCardioBurn(userData, cardioTypes), [userData]);

  const calculateBreakdown = useCallback(
    (steps, isTrainingDay) =>
      calculateCalorieBreakdown({
        steps,
        isTrainingDay,
        userData,
        bmr,
        cardioTypes,
        trainingTypes
      }),
    [bmr, userData]
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

  const updateCustomTraining = useCallback(({ name, calories, description }) => {
    setUserData((prev) => ({
      ...prev,
      customTrainingName: name,
      customTrainingCalories: calories,
      customTrainingDescription: description
    }));
  }, []);

  const calculateCardioSessionCalories = useCallback(
    (session) => calculateCardioCalories(session, userData, cardioTypes),
    [userData]
  );

  return {
    userData,
    trainingTypes,
    cardioTypes,
    bmr,
    trainingCalories,
    totalCardioBurn,
    handleUserDataChange,
    addStepRange,
    removeStepRange,
    addCardioSession,
    removeCardioSession,
    updateCustomTraining,
    calculateBreakdown,
    calculateTargetForGoal,
    calculateCardioSessionCalories
  };
};
