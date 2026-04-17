import React, {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Home, Map, BarChart3, ClipboardList, Target } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { shallow } from 'zustand/shallow';
import { goals } from '../../constants/goals/goals';
import {
  clampCustomActivityMultiplier,
  clampCustomActivityPercent,
  DEFAULT_ACTIVITY_MULTIPLIERS,
  getCustomActivityPercent,
} from '../../constants/activity/activityPresets';
import {
  setupEnergyMapStore,
  useEnergyMapStore,
} from '../../store/useEnergyMapStore';
import { useSwipeableScreens } from '../../hooks/useSwipeableScreens';
import { useAnimatedModal } from '../../hooks/useAnimatedModal';
import { useHardwareBackButton } from '../../hooks/useHardwareBackButton';
import {
  useHealthConnect,
  HealthConnectStatus,
} from '../../hooks/useHealthConnect';
import {
  getDefaultEnergyMapData,
  saveLastSelectedCardioType,
} from '../../utils/data/storage';
import { useScrollOffScreen } from '../../hooks/useScrollOffScreen';
import { ScreenTabs, FloatingScreenTabs } from './common/ScreenTabs';
import { LogbookScreen } from './screens/LogbookScreen';
import { TrackerScreen } from './screens/TrackerScreen';
import { HomeScreen } from './screens/HomeScreen';
import { CalorieMapScreen } from './screens/CalorieMapScreen';
import { InsightsScreen } from './screens/InsightsScreen';
import { PhaseDetailScreen } from './screens/PhaseDetailScreen';
import { GoalModal } from './modals/forms/GoalModal';
import { BmrInfoModal } from './modals/info/BmrInfoModal';
import { BmiInfoModal } from './modals/info/BmiInfoModal';
import { FfmiInfoModal } from './modals/info/FfmiInfoModal';
import { AgePickerModal } from './modals/pickers/AgePickerModal';
import { MEAL_TYPE_ORDER } from '../../constants/meal/mealTypes';
import { HeightPickerModal } from './modals/pickers/HeightPickerModal';
import { WeightPickerModal } from './modals/pickers/WeightPickerModal';
import { WeightEntryModal } from './modals/forms/WeightEntryModal';
import { BodyFatEntryModal } from './modals/forms/BodyFatEntryModal';
import { BodyFatPickerModal } from './modals/pickers/BodyFatPickerModal';
import { TrainingTypeEditorModal } from './modals/forms/TrainingTypeEditorModal';
import { StepRangesModal } from './modals/forms/StepRangesModal';
import { DurationPickerModal } from './modals/pickers/DurationPickerModal';
import { CardioFavouritesModal } from './modals/lists/CardioFavouritesModal';
import { TefInfoModal } from './modals/info/TefInfoModal';
import { AdaptiveThermogenesisInfoModal } from './modals/info/AdaptiveThermogenesisInfoModal';
import { EpocInfoModal } from './modals/info/EpocInfoModal';
import { TimePickerModal } from './modals/pickers/TimePickerModal';
import { EpocWindowPickerModal } from './modals/pickers/EpocWindowPickerModal';
import { DailyActivityModal } from './modals/forms/DailyActivityModal';
import { DailyActivityEditorModal } from './modals/forms/DailyActivityEditorModal';
import { DailyActivityCustomModal } from './modals/forms/DailyActivityCustomModal';
import { TemplatePickerModal } from './modals/pickers/TemplatePickerModal';
import { CalendarPickerModal } from './modals/pickers/CalendarPickerModal';
import { FoodEntryModal } from './modals/forms/FoodEntryModal';
import { MealTypePickerModal } from './modals/pickers/MealTypePickerModal';
import { FoodPortionModal } from './modals/pickers/FoodPortionModal';
import { StepGoalPickerModal } from './modals/pickers/StepGoalPickerModal';
import { MacroPickerModal } from './modals/pickers/MacroPickerModal';
import { NumericValuePickerModal } from './modals/pickers/NumericValuePickerModal';
import { CalorieTargetModal } from './modals/lists/CalorieTargetModal';
// ...existing code...
import { ConfirmActionModal } from './modals/common/ConfirmActionModal';
import {
  clampWeight,
  normalizeDateKey,
  formatWeight,
  formatDateLabel,
} from '../../utils/measurements/weight';
import { clampBodyFat } from '../../utils/measurements/bodyFat';
import { exportPhaseAsCSV, exportPhaseAsJSON } from '../../utils/export';
import {
  getNutritionTotalsForDate,
  hasNutritionEntriesForDate,
} from '../../utils/phases/phases';
import { isStepBasedCardioType } from '../../utils/calculations/steps';
import {
  deriveSessionTimestamps,
  getCurrentLocalTimeString,
  getTimeOfDayFromEpochMs,
  normalizeTimeOfDay,
} from '../../utils/formatting/time';
import { formatDateKeyUtc, getTodayDateKey } from '../../utils/data/dateKeys';
import { normalizeMacroRecommendationSplit } from '../../utils/calculations/macroRecommendations';
import { estimateRequiredDailyEnergyDelta } from '../../utils/calculations/phaseTargetPlanning';

const WeightTrackerModal = lazy(() =>
  import('./modals/fullscreen/WeightTrackerModal').then((module) => ({
    default: module.WeightTrackerModal,
  }))
);
const BodyFatTrackerModal = lazy(() =>
  import('./modals/fullscreen/BodyFatTrackerModal').then((module) => ({
    default: module.BodyFatTrackerModal,
  }))
);
const StepTrackerModal = lazy(() =>
  import('./modals/fullscreen/StepTrackerModal').then((module) => ({
    default: module.StepTrackerModal,
  }))
);
const SettingsModal = lazy(() =>
  import('./modals/fullscreen/SettingsModal').then((module) => ({
    default: module.SettingsModal,
  }))
);
const FoodSearchModal = lazy(() =>
  import('./modals/fullscreen/FoodSearchModal').then((module) => ({
    default: module.FoodSearchModal,
  }))
);
const CalorieBreakdownModal = lazy(() =>
  import('./modals/info/CalorieBreakdownModal').then((module) => ({
    default: module.CalorieBreakdownModal,
  }))
);
const TrainingModal = lazy(() =>
  import('./modals/forms/TrainingModal').then((module) => ({
    default: module.TrainingModal,
  }))
);
const CardioModal = lazy(() =>
  import('./modals/forms/CardioModal').then((module) => ({
    default: module.CardioModal,
  }))
);
const PhaseCreationModal = lazy(() =>
  import('./modals/forms/PhaseCreationModal').then((module) => ({
    default: module.PhaseCreationModal,
  }))
);
const DailyLogModal = lazy(() =>
  import('./modals/forms/DailyLogModal').then((module) => ({
    default: module.DailyLogModal,
  }))
);

const MODAL_CLOSE_DELAY = 180; // Match CSS animation duration (150ms) + buffer
const DEFAULT_TRAINING_EFFORT_TYPE = 'intensity';
const DEFAULT_TRAINING_INTENSITY = 'moderate';
const DEFAULT_TRAINING_TYPE_CATALOG =
  getDefaultEnergyMapData().trainingType ?? {};
const screenTabs = [
  { key: 'logbook', label: 'Logbook', icon: ClipboardList },
  { key: 'tracker', label: 'Tracker', icon: Target },
  { key: 'home', label: 'Home', icon: Home },
  { key: 'calorie-map', label: 'Calorie Map', icon: Map },
  { key: 'insights', label: 'Insights', icon: BarChart3 },
];

const homeIndex = screenTabs.findIndex((tab) => tab.key === 'home');
const trackerIndex = screenTabs.findIndex((tab) => tab.key === 'tracker');

const defaultCardioSession = {
  date: '',
  type: 'treadmill_walk',
  startTime: '12:00',
  duration: 30,
  intensity: 'moderate',
  effortType: 'intensity',
  averageHeartRate: '',
  stepOverlapEnabled: true,
};

const getDefaultCardioSessionForType = (typeKey, cardioTypes = {}) => {
  const normalizedTypeKey = String(typeKey ?? '').trim();
  const resolvedType = cardioTypes?.[normalizedTypeKey]
    ? normalizedTypeKey
    : defaultCardioSession.type;

  return {
    ...defaultCardioSession,
    date: getTodayDateString(),
    startTime: getCurrentLocalTimeString(),
    type: resolvedType,
    stepOverlapEnabled: isStepBasedCardioType(
      resolvedType,
      cardioTypes?.[resolvedType]
    )
      ? true
      : false,
  };
};

const sanitizeCardioDraft = (draft, cardioTypes = {}) => {
  if (!draft) {
    return null;
  }

  const normalizedDate = normalizeDateKey(draft.date);
  if (!normalizedDate) {
    return null;
  }

  const parsedDuration = Number.parseInt(draft.duration, 10);
  const duration = Number.isFinite(parsedDuration)
    ? Math.max(parsedDuration, 0)
    : 0;

  if (!duration) {
    return null;
  }

  const effortType = draft.effortType ?? 'intensity';
  const startTime = normalizeTimeOfDay(draft.startTime, '12:00');
  const timestamps = deriveSessionTimestamps({
    dateKey: normalizedDate,
    timeOfDay: startTime,
    durationMinutes: duration,
    fallbackStartedAt: draft?.startedAt,
  });
  const session = {
    ...defaultCardioSession,
    ...draft,
    date: normalizedDate,
    startTime,
    startedAt: timestamps.startedAt,
    endedAt: timestamps.endedAt,
    duration,
    intensity: draft.intensity ?? 'moderate',
    effortType,
  };

  if (effortType === 'heartRate') {
    const parsedHeartRate = Number.parseInt(draft.averageHeartRate, 10);
    const heartRate = Number.isFinite(parsedHeartRate)
      ? Math.max(parsedHeartRate, 0)
      : 0;

    if (!heartRate) {
      return null;
    }

    session.averageHeartRate = heartRate;
  } else if (session.averageHeartRate !== undefined) {
    delete session.averageHeartRate;
  }

  const selectedType = cardioTypes?.[session.type];
  const isStepBased = isStepBasedCardioType(session.type, selectedType);
  session.stepOverlapEnabled = isStepBased
    ? Boolean(session.stepOverlapEnabled ?? true)
    : false;

  if (session.id !== undefined) {
    delete session.id;
  }

  return session;
};

const getTodayDateString = () => getTodayDateKey();

const DEFAULT_PORTION_GRAMS = 100;
const FOOD_ENTRY_PICKER_FIELDS = {
  calories: {
    title: 'Calories',
    unitLabel: 'kcal',
    min: 0,
    max: 5000,
    step: 5,
  },
  protein: {
    title: 'Protein',
    unitLabel: 'grammes',
    min: 0,
    max: 500,
    step: 0.5,
  },
  carbs: {
    title: 'Carbs',
    unitLabel: 'grammes',
    min: 0,
    max: 500,
    step: 0.5,
  },
  fats: {
    title: 'Fats',
    unitLabel: 'grammes',
    min: 0,
    max: 500,
    step: 0.5,
  },
};

const getStepPrecision = (step) => {
  const normalized = String(step ?? 1);
  if (!normalized.includes('.')) {
    return 0;
  }

  return normalized.split('.')[1]?.length ?? 0;
};

const normalizePickerValue = (value, config) => {
  const { min = 0, max = 100, step = 1 } = config ?? {};
  const safeStep = Number.isFinite(step) && step > 0 ? step : 1;
  const precision = getStepPrecision(safeStep);
  const scale = 10 ** precision;

  const minInt = Math.round(min * scale);
  const maxInt = Math.round(max * scale);
  const stepInt = Math.max(1, Math.round(safeStep * scale));
  const numericValue = Number.isFinite(value) ? value : min;
  const valueInt = Math.round(
    Math.min(Math.max(numericValue, min), max) * scale
  );
  const steppedInt =
    minInt + Math.round((valueInt - minInt) / stepInt) * stepInt;
  const clampedInt = Math.min(Math.max(steppedInt, minInt), maxInt);

  return clampedInt / scale;
};

const formatPickerValueForState = (value, step) => {
  const precision = getStepPrecision(step);
  if (precision <= 0) {
    return String(Math.round(value));
  }

  return value
    .toFixed(precision)
    .replace(/\.0+$/, '')
    .replace(/(\.\d*?)0+$/, '$1');
};

const buildFallbackFoodFromEntry = (entry) => {
  const safeNumber = (value) => (Number.isFinite(value) ? value : 0);
  const name = String(entry?.name ?? '').trim() || 'Custom food';
  const grams =
    Number.isFinite(entry?.grams) && entry.grams > 0
      ? entry.grams
      : DEFAULT_PORTION_GRAMS;
  const scale = grams ? 100 / grams : 1;

  return {
    id: `manual_${entry?.id ?? Date.now()}`,
    name,
    category: 'supplements',
    per100g: {
      calories: Math.round(safeNumber(entry?.calories) * scale),
      protein: Math.round(safeNumber(entry?.protein) * scale * 10) / 10,
      carbs: Math.round(safeNumber(entry?.carbs) * scale * 10) / 10,
      fats: Math.round(safeNumber(entry?.fats) * scale * 10) / 10,
    },
    portions: [],
  };
};

const parseNullablePhaseNumber = (value) => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    return null;
  }

  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : null;
};

const createDefaultPhaseDraft = () => ({
  name: '',
  creationMode: 'goal',
  startDate: getTodayDateString(),
  endDate: '',
  goalType: 'maintenance',
  targetWeight: '',
  targetBodyFat: '',
});

export const EnergyMapCalculator = () => {
  useEffect(() => {
    setupEnergyMapStore();
  }, []);

  const {
    isLoaded,
    userData,
    weightEntries,
    bodyFatEntries,
    stepEntries,
    stepGoal,
    trainingTypes,
    cardioTypes,
    customCardioTypes,
    cardioFavourites,
    foodFavourites,
    phases,
    activePhase,
    isGoalLockedByActivePhase,
    bmr,
    trainingCalories,
    totalCardioBurn,
    trainingSessions,
    handleUserDataChange,
    setSelectedGoal,
    addStepRange,
    removeStepRange,
    addCardioSession,
    removeCardioSession,
    updateCardioSession,
    addTrainingSession,
    updateTrainingSession,
    removeTrainingSession,
    addCardioFavourite,
    removeCardioFavourite,
    updateTrainingType,
    addCustomCardioType,
    removeCustomCardioType,
    calculateTargetForGoal,
    calculateCardioSessionCalories,
    saveWeightEntry,
    deleteWeightEntry,
    saveBodyFatEntry,
    deleteBodyFatEntry,
    saveStepEntry,
    setStepGoal,
    nutritionData,
    pinnedFoods,
    cachedFoods,
    addFoodEntry,
    updateFoodEntry,
    deleteFoodEntry,
    deleteMeal,
    togglePinnedFood,
    addFoodFavourite,
    removeFoodFavourite,
    updateFoodFavourite,
    updateCachedFoods,
    createPhase,
    deletePhase,
    archivePhase,
    addDailyLog,
    updateDailyLog,
    deleteDailyLog,
  } = useEnergyMapStore(
    (state) => ({
      isLoaded: state.isLoaded,
      userData: state.userData,
      weightEntries: state.weightEntries,
      bodyFatEntries: state.bodyFatEntries,
      stepEntries: state.stepEntries,
      stepGoal: state.stepGoal,
      trainingTypes: state.trainingTypes,
      cardioTypes: state.cardioTypes,
      customCardioTypes: state.customCardioTypes,
      cardioFavourites: state.cardioFavourites,
      foodFavourites: state.foodFavourites,
      phases: state.phases,
      activePhase: state.activePhase,
      isGoalLockedByActivePhase: state.isGoalLockedByActivePhase,
      bmr: state.bmr,
      trainingCalories: state.trainingCalories,
      totalCardioBurn: state.totalCardioBurn,
      trainingSessions: state.trainingSessions,
      handleUserDataChange: state.handleUserDataChange,
      setSelectedGoal: state.setSelectedGoal,
      addStepRange: state.addStepRange,
      removeStepRange: state.removeStepRange,
      addCardioSession: state.addCardioSession,
      removeCardioSession: state.removeCardioSession,
      updateCardioSession: state.updateCardioSession,
      addTrainingSession: state.addTrainingSession,
      updateTrainingSession: state.updateTrainingSession,
      removeTrainingSession: state.removeTrainingSession,
      addCardioFavourite: state.addCardioFavourite,
      removeCardioFavourite: state.removeCardioFavourite,
      updateTrainingType: state.updateTrainingType,
      addCustomCardioType: state.addCustomCardioType,
      removeCustomCardioType: state.removeCustomCardioType,
      calculateTargetForGoal: state.calculateTargetForGoal,
      calculateCardioSessionCalories: state.calculateCardioSessionCalories,
      saveWeightEntry: state.saveWeightEntry,
      deleteWeightEntry: state.deleteWeightEntry,
      saveBodyFatEntry: state.saveBodyFatEntry,
      deleteBodyFatEntry: state.deleteBodyFatEntry,
      saveStepEntry: state.saveStepEntry,
      setStepGoal: state.setStepGoal,
      nutritionData: state.nutritionData,
      pinnedFoods: state.pinnedFoods,
      cachedFoods: state.cachedFoods,
      addFoodEntry: state.addFoodEntry,
      updateFoodEntry: state.updateFoodEntry,
      deleteFoodEntry: state.deleteFoodEntry,
      deleteMeal: state.deleteMeal,
      togglePinnedFood: state.togglePinnedFood,
      addFoodFavourite: state.addFoodFavourite,
      removeFoodFavourite: state.removeFoodFavourite,
      updateFoodFavourite: state.updateFoodFavourite,
      updateCachedFoods: state.updateCachedFoods,
      createPhase: state.createPhase,
      deletePhase: state.deletePhase,
      archivePhase: state.archivePhase,
      addDailyLog: state.addDailyLog,
      updateDailyLog: state.updateDailyLog,
      deleteDailyLog: state.deleteDailyLog,
    }),
    shallow
  );

  // Health Connect integration for live step tracking
  const healthConnect = useHealthConnect();

  const viewportRef = useRef(null);
  const screenTabsRef = useRef(null);
  const isTabsOffScreen = useScrollOffScreen(screenTabsRef);
  const {
    currentScreen,
    sliderStyle,
    setSliderElement,
    handlers,
    goToScreen,
    isSwiping,
  } = useSwipeableScreens(screenTabs.length, viewportRef, homeIndex);

  const selectedGoal = userData.selectedGoal ?? 'maintenance';
  const [tempSelectedGoal, setTempSelectedGoal] = useState('maintenance');
  const [tempAge, setTempAge] = useState(userData.age);
  const [tempHeight, setTempHeight] = useState(userData.height);
  const [tempTrainingType, setTempTrainingType] = useState(
    userData.selectedTrainingType
  );
  const [tempTrainingDuration, setTempTrainingDuration] = useState(
    userData.trainingDuration
  );
  const [tempTrainingEffortType, setTempTrainingEffortType] = useState(
    DEFAULT_TRAINING_EFFORT_TYPE
  );
  const [tempTrainingIntensity, setTempTrainingIntensity] = useState(
    DEFAULT_TRAINING_INTENSITY
  );
  const [tempTrainingHeartRate, setTempTrainingHeartRate] = useState('');
  const [tempTrainingStartTime, setTempTrainingStartTime] = useState(() =>
    getCurrentLocalTimeString()
  );
  const [trainingModalMode, setTrainingModalMode] = useState('session');
  const [editingTrainingSessionId, setEditingTrainingSessionId] =
    useState(null);
  const [editingTrainingType, setEditingTrainingType] = useState(null);
  const [tempPresetName, setTempPresetName] = useState('');
  const [tempPresetCalories, setTempPresetCalories] = useState(0);
  const [tempTimePickerValue, setTempTimePickerValue] = useState('12:00');
  const [timePickerTarget, setTimePickerTarget] = useState(null);
  const [tempEpocWindowValue, setTempEpocWindowValue] = useState(
    userData.epocCarryoverHours ?? 6
  );
  const [newStepRange, setNewStepRange] = useState('');
  const [selectedBreakdownRequest, setSelectedBreakdownRequest] =
    useState(null);
  const [cardioDraft, setCardioDraft] = useState(() =>
    getDefaultCardioSessionForType(
      userData?.lastSelectedCardioType,
      cardioTypes
    )
  );
  const [favouriteDraft, setFavouriteDraft] = useState(() =>
    getDefaultCardioSessionForType(
      userData?.lastSelectedCardioType,
      cardioTypes
    )
  );
  const [cardioModalMode, setCardioModalMode] = useState('add');
  const [activityEditorDay, setActivityEditorDay] = useState(null);
  const [customActivityPercent, setCustomActivityPercent] = useState(
    Math.round(DEFAULT_ACTIVITY_MULTIPLIERS.training * 100)
  );
  const [durationPickerValue, setDurationPickerValue] = useState(
    userData.trainingDuration
  );
  const [durationPickerTitle, setDurationPickerTitle] =
    useState('Training Duration');
  const durationPickerOnSaveRef = useRef(null);
  const [editingCardioId, setEditingCardioId] = useState(null);
  const [weightEntryDraft, setWeightEntryDraft] = useState(() => ({
    date: getTodayDateString(),
    weight: clampWeight(userData.weight) ?? userData.weight,
  }));
  const [weightEntryMode, setWeightEntryMode] = useState('add');
  const [weightEntryOriginalDate, setWeightEntryOriginalDate] = useState(null);
  const [isWeightDateLocked, setIsWeightDateLocked] = useState(false);
  const [weightEntryError, setWeightEntryError] = useState('');
  const [weightPickerValue, setWeightPickerValue] = useState(
    clampWeight(userData.weight) ?? userData.weight
  );

  const [bodyFatEntryDraft, setBodyFatEntryDraft] = useState(() => ({
    date: getTodayDateString(),
    bodyFat: clampBodyFat(18) ?? 18,
  }));
  const [bodyFatEntryMode, setBodyFatEntryMode] = useState('add');
  const [bodyFatEntryOriginalDate, setBodyFatEntryOriginalDate] =
    useState(null);
  const [isBodyFatDateLocked, setIsBodyFatDateLocked] = useState(false);
  const [bodyFatEntryError, setBodyFatEntryError] = useState('');
  const [bodyFatPickerValue, setBodyFatPickerValue] = useState(
    clampBodyFat(18) ?? 18
  );

  // Phase-related state
  const [phaseDraft, setPhaseDraft] = useState(createDefaultPhaseDraft);
  const [phaseError, setPhaseError] = useState('');
  const [selectedPhase, setSelectedPhase] = useState(null);

  const setPhaseDraftField = useCallback((field, value) => {
    setPhaseDraft((prev) => ({ ...prev, [field]: value }));
  }, []);

  const setPhaseCreationMode = useCallback((nextMode) => {
    const mode = nextMode === 'target' ? 'target' : 'goal';
    setPhaseDraft((prev) => ({
      ...prev,
      creationMode: mode,
      endDate: mode === 'goal' ? '' : prev.endDate,
    }));
  }, []);

  // Daily log state (reference-based)
  const [dailyLogDate, setDailyLogDate] = useState(getTodayDateString());
  const [dailyLogWeightRef, setDailyLogWeightRef] = useState('');
  const [dailyLogBodyFatRef, setDailyLogBodyFatRef] = useState('');
  const [dailyLogNutritionRef, setDailyLogNutritionRef] = useState('');
  const [dailyLogNotes, setDailyLogNotes] = useState('');
  const [dailyLogCompleted, setDailyLogCompleted] = useState(false);
  const [dailyLogMode, setDailyLogMode] = useState('add');
  const [dailyLogError, setDailyLogError] = useState('');
  const [dailyLogDateLocked, setDailyLogDateLocked] = useState(false);

  // Calendar picker state
  const [trackerSelectedDate, setTrackerSelectedDate] =
    useState(getTodayDateString());
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());

  // Food entry state
  const [foodEntryMode, setFoodEntryMode] = useState('add'); // 'add' or 'edit'
  const [editingFoodEntryId, setEditingFoodEntryId] = useState(null);
  const [editingMealType, setEditingMealType] = useState(null);
  const [editingManualFavouriteId, setEditingManualFavouriteId] =
    useState(null);
  const [foodMealType, setFoodMealType] = useState('');
  const [foodName, setFoodName] = useState('');
  const [foodCalories, setFoodCalories] = useState('');
  const [foodProtein, setFoodProtein] = useState('');
  const [foodCarbs, setFoodCarbs] = useState('');
  const [foodFats, setFoodFats] = useState('');
  const [foodNutrientPickerConfig, setFoodNutrientPickerConfig] =
    useState(null);
  const [selectedFoodForPortion, setSelectedFoodForPortion] = useState(null);
  const [editingPortionEntry, setEditingPortionEntry] = useState(null);
  const [portionInitialGrams, setPortionInitialGrams] = useState(null);
  const [trackerStepRange, setTrackerStepRange] = useState('12k');
  const [selectedCalorieTargetType, setSelectedCalorieTargetType] =
    useState('step_range');
  const [tempMacroRecommendationSplit, setTempMacroRecommendationSplit] =
    useState(() =>
      normalizeMacroRecommendationSplit(userData.macroRecommendationSplit)
    );
  const trackerSwitchTimeoutRef = useRef(null);

  const todayTrainingSessions = useMemo(
    () =>
      (trainingSessions ?? []).filter(
        (session) => normalizeDateKey(session?.date) === getTodayDateString()
      ),
    [trainingSessions]
  );

  const selectedDay = todayTrainingSessions.length > 0 ? 'training' : 'rest';

  // Confirm action state
  const [confirmActionTitle, setConfirmActionTitle] = useState('');
  const [confirmActionDescription, setConfirmActionDescription] = useState('');
  const [confirmActionLabel, setConfirmActionLabel] = useState('Confirm');
  const [confirmActionTone, setConfirmActionTone] = useState('danger');
  const [confirmActionCallback, setConfirmActionCallback] = useState(null);
  const confirmActionModal = useAnimatedModal();

  const handleConfirmAction = useCallback(() => {
    try {
      if (typeof confirmActionCallback === 'function') {
        confirmActionCallback();
      }
    } finally {
      confirmActionModal.requestClose();
    }
  }, [confirmActionCallback, confirmActionModal]);

  const handleCancelConfirmAction = useCallback(() => {
    confirmActionModal.requestClose();
  }, [confirmActionModal]);

  const goalModal = useAnimatedModal();
  const bmrModal = useAnimatedModal();
  const bmiModal = useAnimatedModal();
  const ffmiModal = useAnimatedModal();
  const ageModal = useAnimatedModal();
  const heightModal = useAnimatedModal();
  const weightTrackerModal = useAnimatedModal();
  const weightEntryModal = useAnimatedModal();
  const weightPickerModal = useAnimatedModal();
  const bodyFatTrackerModal = useAnimatedModal();
  const bodyFatEntryModal = useAnimatedModal();
  const bodyFatPickerModal = useAnimatedModal();
  const trainingTypeEditorModal = useAnimatedModal(false, MODAL_CLOSE_DELAY);
  const settingsModal = useAnimatedModal();
  const dailyActivityModal = useAnimatedModal();
  const dailyActivityEditorModal = useAnimatedModal();
  const dailyActivityCustomModal = useAnimatedModal(false, MODAL_CLOSE_DELAY);
  const stepRangesModal = useAnimatedModal();
  const trainingModal = useAnimatedModal();
  const durationPickerModal = useAnimatedModal();
  const cardioModal = useAnimatedModal();
  const cardioFavouritesModal = useAnimatedModal();
  const cardioFavouriteEditorModal = useAnimatedModal();
  const calorieBreakdownModal = useAnimatedModal();
  const tefInfoModal = useAnimatedModal();
  const adaptiveThermogenesisInfoModal = useAnimatedModal();
  const epocInfoModal = useAnimatedModal();
  const timePickerModal = useAnimatedModal();
  const epocWindowPickerModal = useAnimatedModal();
  const phaseCreationModal = useAnimatedModal();
  const templatePickerModal = useAnimatedModal();
  const dailyLogModal = useAnimatedModal();
  const calendarPickerModal = useAnimatedModal();
  const foodEntryModal = useAnimatedModal();
  const foodNutrientPickerModal = useAnimatedModal(false, MODAL_CLOSE_DELAY);
  const mealTypePickerModal = useAnimatedModal();
  const foodSearchModal = useAnimatedModal();
  const foodPortionModal = useAnimatedModal();
  const stepTrackerModal = useAnimatedModal();
  const stepGoalPickerModal = useAnimatedModal();
  const macroPickerModal = useAnimatedModal(false, MODAL_CLOSE_DELAY);
  const calorieTargetModal = useAnimatedModal(false, MODAL_CLOSE_DELAY);
  // ...existing code...

  const isAnyModalOpen = [
    confirmActionModal,
    foodPortionModal,
    foodEntryModal,
    foodNutrientPickerModal,
    foodSearchModal,
    mealTypePickerModal,
    calendarPickerModal,
    dailyLogModal,
    templatePickerModal,
    phaseCreationModal,
    adaptiveThermogenesisInfoModal,
    tefInfoModal,
    calorieBreakdownModal,
    cardioFavouriteEditorModal,
    cardioFavouritesModal,
    cardioModal,
    durationPickerModal,
    trainingModal,
    stepRangesModal,
    stepTrackerModal,
    stepGoalPickerModal,
    macroPickerModal,
    calorieTargetModal,
    dailyActivityCustomModal,
    dailyActivityEditorModal,
    dailyActivityModal,
    settingsModal,
    trainingTypeEditorModal,
    bodyFatPickerModal,
    bodyFatEntryModal,
    bodyFatTrackerModal,
    weightPickerModal,
    weightEntryModal,
    weightTrackerModal,
    heightModal,
    ageModal,
    ffmiModal,
    bmiModal,
    bmrModal,
    goalModal,
    timePickerModal,
    epocWindowPickerModal,
  ].some((modal) => modal?.isOpen || modal?.isClosing);

  const closeTopmostModal = useCallback(() => {
    const modalStack = [
      confirmActionModal,
      foodPortionModal,
      foodEntryModal,
      foodNutrientPickerModal,
      foodSearchModal,
      mealTypePickerModal,
      calendarPickerModal,
      dailyLogModal,
      templatePickerModal,
      phaseCreationModal,
      adaptiveThermogenesisInfoModal,
      tefInfoModal,
      calorieBreakdownModal,
      cardioFavouriteEditorModal,
      cardioFavouritesModal,
      cardioModal,
      durationPickerModal,
      trainingModal,
      stepRangesModal,
      stepTrackerModal,
      stepGoalPickerModal,
      macroPickerModal,
      calorieTargetModal,
      dailyActivityCustomModal,
      dailyActivityEditorModal,
      dailyActivityModal,
      settingsModal,
      trainingTypeEditorModal,
      bodyFatPickerModal,
      bodyFatEntryModal,
      bodyFatTrackerModal,
      weightPickerModal,
      weightEntryModal,
      weightTrackerModal,
      heightModal,
      ageModal,
      ffmiModal,
      bmiModal,
      bmrModal,
      goalModal,
      timePickerModal,
      epocWindowPickerModal,
      epocInfoModal,
    ];

    for (const modal of modalStack) {
      if (modal?.isOpen && !modal.isClosing) {
        modal.requestClose();
        return true;
      }
    }

    return false;
  }, [
    adaptiveThermogenesisInfoModal,
    ageModal,
    bmiModal,
    bmrModal,
    bodyFatEntryModal,
    bodyFatPickerModal,
    bodyFatTrackerModal,
    calorieBreakdownModal,
    calendarPickerModal,
    calorieTargetModal,
    cardioFavouriteEditorModal,
    cardioFavouritesModal,
    cardioModal,
    confirmActionModal,
    dailyActivityCustomModal,
    dailyActivityEditorModal,
    dailyActivityModal,
    dailyLogModal,
    durationPickerModal,
    epocInfoModal,
    epocWindowPickerModal,
    ffmiModal,
    foodEntryModal,
    foodNutrientPickerModal,
    foodPortionModal,
    foodSearchModal,
    goalModal,
    heightModal,
    mealTypePickerModal,
    macroPickerModal,
    phaseCreationModal,
    settingsModal,
    stepGoalPickerModal,
    stepRangesModal,
    stepTrackerModal,
    tefInfoModal,
    templatePickerModal,
    timePickerModal,
    trainingModal,
    trainingTypeEditorModal,
    weightEntryModal,
    weightPickerModal,
    weightTrackerModal,
  ]);

  const { showExitHint } = useHardwareBackButton({
    currentScreen,
    homeIndex,
    goToScreen,
    closeTopmostModal,
  });

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return undefined;
    }

    let appStateListener = null;

    const setup = async () => {
      appStateListener = await App.addListener(
        'appStateChange',
        ({ isActive }) => {
          if (!isActive) {
            return;
          }

          const store = useEnergyMapStore.getState();
          if (!store.isLoaded) {
            return;
          }

          const todayDateKey = getTodayDateString();
          const yesterdayDate = new Date(`${todayDateKey}T00:00:00Z`);
          yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
          const yesterdayDateKey = formatDateKeyUtc(yesterdayDate);

          store.upsertDailySnapshot(yesterdayDateKey);
          store.upsertDailySnapshot(todayDateKey);
        }
      );
    };

    setup();

    return () => {
      appStateListener?.remove?.();
    };
  }, []);

  useEffect(() => {
    setTempAge(userData.age);
  }, [userData.age]);

  useEffect(() => {
    setTempHeight(userData.height);
  }, [userData.height]);

  useEffect(() => {
    setTempTrainingType(userData.selectedTrainingType);
    setTempTrainingDuration(userData.trainingDuration);
  }, [userData.selectedTrainingType, userData.trainingDuration]);

  useEffect(() => {
    if (!durationPickerModal.isOpen) {
      durationPickerOnSaveRef.current = null;
    }
  }, [durationPickerModal.isOpen]);

  const latestWeightEntry = useMemo(
    () =>
      weightEntries.length ? weightEntries[weightEntries.length - 1] : null,
    [weightEntries]
  );

  const todayWeightEntry = useMemo(() => {
    const todayKey = getTodayDateString();
    return weightEntries.find((entry) => entry.date === todayKey) ?? null;
  }, [weightEntries]);

  const hasTodayWeightEntry = Boolean(todayWeightEntry);
  const weightDisplay = useMemo(() => {
    const resolved = latestWeightEntry?.weight ?? userData.weight;
    const formatted = formatWeight(resolved);
    if (formatted) {
      return `${formatted} kg`;
    }
    if (Number.isFinite(resolved)) {
      return `${Math.round(resolved)} kg`;
    }
    return '—';
  }, [latestWeightEntry?.weight, userData.weight]);

  const weightButtonSubtitle = useMemo(() => {
    if (hasTodayWeightEntry) {
      return 'Logged today';
    }
    if (latestWeightEntry?.date) {
      const formattedDate = formatDateLabel(latestWeightEntry.date, {
        month: 'short',
        day: 'numeric',
      });
      return formattedDate
        ? `Last entry ${formattedDate}`
        : 'Last entry recorded';
    }
    return 'Tap to start logging';
  }, [hasTodayWeightEntry, latestWeightEntry?.date]);
  const weightPrimaryActionLabel = hasTodayWeightEntry
    ? 'Edit Entry'
    : 'Add Entry';

  const latestBodyFatEntry = useMemo(
    () =>
      bodyFatEntries.length ? bodyFatEntries[bodyFatEntries.length - 1] : null,
    [bodyFatEntries]
  );

  const bodyFatDisplay = useMemo(() => {
    if (latestBodyFatEntry?.bodyFat) {
      return `${latestBodyFatEntry.bodyFat}%`;
    }
    return 'Set';
  }, [latestBodyFatEntry]);

  const openWeightTracker = useCallback(() => {
    setWeightEntryError('');
    weightTrackerModal.open();
  }, [weightTrackerModal]);

  const openBodyFatTracker = useCallback(() => {
    // Enable tracking implicitly if accessed via quick tile
    if (!userData.bodyFatTrackingEnabled) {
      // We'll just open it, the modal works without the setting being explicitly on,
      // or we could dispatch an update here.
      // For now, let's just open the tracker.
    }
    setBodyFatEntryError('');
    bodyFatTrackerModal.open();
  }, [bodyFatTrackerModal, userData.bodyFatTrackingEnabled]);

  const handleSwitchToBodyFat = useCallback(() => {
    weightTrackerModal.requestClose();
    if (trackerSwitchTimeoutRef.current) {
      clearTimeout(trackerSwitchTimeoutRef.current);
      trackerSwitchTimeoutRef.current = null;
    }
    trackerSwitchTimeoutRef.current = setTimeout(() => {
      openBodyFatTracker();
      trackerSwitchTimeoutRef.current = null;
    }, MODAL_CLOSE_DELAY + 20);
  }, [openBodyFatTracker, weightTrackerModal]);

  const handleSwitchToWeight = useCallback(() => {
    bodyFatTrackerModal.requestClose();
    if (trackerSwitchTimeoutRef.current) {
      clearTimeout(trackerSwitchTimeoutRef.current);
      trackerSwitchTimeoutRef.current = null;
    }
    trackerSwitchTimeoutRef.current = setTimeout(() => {
      openWeightTracker();
      trackerSwitchTimeoutRef.current = null;
    }, MODAL_CLOSE_DELAY + 20);
  }, [bodyFatTrackerModal, openWeightTracker]);

  useEffect(
    () => () => {
      if (trackerSwitchTimeoutRef.current) {
        clearTimeout(trackerSwitchTimeoutRef.current);
        trackerSwitchTimeoutRef.current = null;
      }
    },
    []
  );

  const openAddWeightEntryModal = useCallback(
    (prefillDate) => {
      const todayKey = prefillDate || getTodayDateString();
      const fallbackWeight =
        clampWeight(latestWeightEntry?.weight ?? userData.weight) ??
        userData.weight;

      setWeightEntryMode('add');
      setWeightEntryDraft({ date: todayKey, weight: fallbackWeight });
      setWeightEntryOriginalDate(null);
      setIsWeightDateLocked(false);
      setWeightEntryError('');
      setWeightPickerValue(fallbackWeight);
      weightEntryModal.open();
    },
    [latestWeightEntry, userData.weight, weightEntryModal]
  );

  const openAddBodyFatEntryModal = useCallback(
    (prefillDate) => {
      const todayKey = prefillDate || getTodayDateString();
      const fallbackBodyFat =
        clampBodyFat(latestBodyFatEntry?.bodyFat ?? 18) ?? 18;

      setBodyFatEntryMode('add');
      setBodyFatEntryDraft({ date: todayKey, bodyFat: fallbackBodyFat });
      setBodyFatEntryOriginalDate(null);
      setIsBodyFatDateLocked(false);
      setBodyFatEntryError('');
      setBodyFatPickerValue(fallbackBodyFat);
      bodyFatEntryModal.open();
    },
    [bodyFatEntryModal, latestBodyFatEntry?.bodyFat]
  );

  const openEditWeightEntryModal = useCallback(
    (entry) => {
      if (!entry) {
        return;
      }

      const dateKey = normalizeDateKey(entry.date);
      if (!dateKey) {
        return;
      }

      const fallbackWeight = clampWeight(entry.weight) ?? userData.weight;
      const isToday = dateKey === getTodayDateString();

      setWeightEntryMode('edit');
      setWeightEntryDraft({ date: dateKey, weight: fallbackWeight });
      setWeightEntryOriginalDate(dateKey);
      setIsWeightDateLocked(isToday);
      setWeightEntryError('');
      setWeightPickerValue(fallbackWeight);
      weightEntryModal.open();
    },
    [userData.weight, weightEntryModal]
  );

  const openEditBodyFatEntryModal = useCallback(
    (entry) => {
      if (!entry) {
        return;
      }

      const dateKey = normalizeDateKey(entry.date);
      if (!dateKey) {
        return;
      }

      const fallbackBodyFat = clampBodyFat(entry.bodyFat) ?? 18;
      const isToday = dateKey === getTodayDateString();

      setBodyFatEntryMode('edit');
      setBodyFatEntryDraft({ date: dateKey, bodyFat: fallbackBodyFat });
      setBodyFatEntryOriginalDate(dateKey);
      setIsBodyFatDateLocked(isToday);
      setBodyFatEntryError('');
      setBodyFatPickerValue(fallbackBodyFat);
      bodyFatEntryModal.open();
    },
    [bodyFatEntryModal]
  );

  const handleWeightEntrySave = useCallback(() => {
    const normalizedDate = normalizeDateKey(weightEntryDraft.date);
    if (!normalizedDate) {
      setWeightEntryError('Select a valid date.');
      return;
    }

    const normalizedWeight = clampWeight(weightEntryDraft.weight);
    if (normalizedWeight == null) {
      setWeightEntryError('Select a valid weight.');
      return;
    }

    const originalDateKey =
      weightEntryMode === 'edit' ? weightEntryOriginalDate : null;
    const hasConflict = weightEntries.some((entry) => {
      if (!entry?.date) {
        return false;
      }
      if (originalDateKey && entry.date === originalDateKey) {
        return false;
      }
      return entry.date === normalizedDate;
    });

    if (hasConflict) {
      setWeightEntryError(
        'An entry already exists for this date. Edit that entry instead.'
      );
      return;
    }

    saveWeightEntry(
      { date: normalizedDate, weight: normalizedWeight },
      originalDateKey
    );

    setWeightEntryError('');
    weightEntryModal.requestClose();
  }, [
    saveWeightEntry,
    weightEntries,
    weightEntryDraft.date,
    weightEntryDraft.weight,
    weightEntryMode,
    weightEntryOriginalDate,
    weightEntryModal,
  ]);

  const handleBodyFatEntrySave = useCallback(() => {
    const normalizedDate = normalizeDateKey(bodyFatEntryDraft.date);
    if (!normalizedDate) {
      setBodyFatEntryError('Select a valid date.');
      return;
    }

    const normalizedBodyFat = clampBodyFat(bodyFatEntryDraft.bodyFat);
    if (normalizedBodyFat == null) {
      setBodyFatEntryError('Select a valid body fat percentage.');
      return;
    }

    const originalDateKey =
      bodyFatEntryMode === 'edit' ? bodyFatEntryOriginalDate : null;
    const hasConflict = bodyFatEntries.some((entry) => {
      if (!entry?.date) {
        return false;
      }
      if (originalDateKey && entry.date === originalDateKey) {
        return false;
      }
      return entry.date === normalizedDate;
    });

    if (hasConflict) {
      setBodyFatEntryError(
        'An entry already exists for this date. Edit that entry instead.'
      );
      return;
    }

    saveBodyFatEntry(
      { date: normalizedDate, bodyFat: normalizedBodyFat },
      originalDateKey
    );

    setBodyFatEntryError('');
    bodyFatEntryModal.requestClose();
  }, [
    bodyFatEntries,
    bodyFatEntryDraft.bodyFat,
    bodyFatEntryDraft.date,
    bodyFatEntryMode,
    bodyFatEntryOriginalDate,
    bodyFatEntryModal,
    saveBodyFatEntry,
  ]);

  const handleWeightEntryDelete = useCallback(() => {
    const targetDate = normalizeDateKey(
      weightEntryOriginalDate ?? weightEntryDraft.date
    );
    if (!targetDate) {
      weightEntryModal.requestClose();
      return;
    }

    // Deletion confirmation should be handled by custom modal, not browser confirm
    deleteWeightEntry(targetDate);
    weightEntryModal.requestClose();
  }, [
    deleteWeightEntry,
    weightEntryDraft.date,
    weightEntryModal,
    weightEntryOriginalDate,
  ]);

  const handleBodyFatEntryDelete = useCallback(() => {
    const targetDate = normalizeDateKey(
      bodyFatEntryOriginalDate ?? bodyFatEntryDraft.date
    );
    if (!targetDate) {
      bodyFatEntryModal.requestClose();
      return;
    }

    deleteBodyFatEntry(targetDate);
    bodyFatEntryModal.requestClose();
  }, [
    bodyFatEntryDraft.date,
    bodyFatEntryModal,
    bodyFatEntryOriginalDate,
    deleteBodyFatEntry,
  ]);

  const handleWeightEntryFromListEdit = useCallback(
    (entry) => {
      openEditWeightEntryModal(entry);
    },
    [openEditWeightEntryModal]
  );

  const handleBodyFatEntryFromListEdit = useCallback(
    (entry) => {
      openEditBodyFatEntryModal(entry);
    },
    [openEditBodyFatEntryModal]
  );

  const handleWeightEntryDateChange = useCallback((value) => {
    setWeightEntryDraft((prev) => ({ ...prev, date: value }));
    setWeightEntryError('');
  }, []);

  const handleBodyFatEntryDateChange = useCallback((value) => {
    setBodyFatEntryDraft((prev) => ({ ...prev, date: value }));
    setBodyFatEntryError('');
  }, []);

  const openWeightPicker = useCallback(() => {
    const fallbackWeight =
      clampWeight(weightEntryDraft.weight) ?? userData.weight;
    setWeightPickerValue(fallbackWeight);
    weightPickerModal.open();
  }, [weightEntryDraft.weight, userData.weight, weightPickerModal]);

  const openBodyFatPicker = useCallback(() => {
    const fallbackBodyFat = clampBodyFat(bodyFatEntryDraft.bodyFat) ?? 18;
    setBodyFatPickerValue(fallbackBodyFat);
    bodyFatPickerModal.open();
  }, [bodyFatEntryDraft.bodyFat, bodyFatPickerModal]);

  const handleWeightPickerChange = useCallback((value) => {
    setWeightPickerValue(value);
  }, []);

  const handleBodyFatPickerChange = useCallback((value) => {
    setBodyFatPickerValue(value);
  }, []);

  const handleWeightPickerSave = useCallback(
    (value) => {
      const sanitized = clampWeight(value);
      if (sanitized == null) {
        weightPickerModal.requestClose();
        return;
      }

      setWeightEntryDraft((prev) => ({ ...prev, weight: sanitized }));
      setWeightPickerValue(sanitized);
      setWeightEntryError('');
      weightPickerModal.requestClose();
    },
    [weightPickerModal]
  );

  const handleBodyFatPickerSave = useCallback(
    (value) => {
      const sanitized = clampBodyFat(value);
      if (sanitized == null) {
        bodyFatPickerModal.requestClose();
        return;
      }

      setBodyFatEntryDraft((prev) => ({ ...prev, bodyFat: sanitized }));
      setBodyFatPickerValue(sanitized);
      setBodyFatEntryError('');
      bodyFatPickerModal.requestClose();
    },
    [bodyFatPickerModal]
  );

  const handleWeightPickerCancel = useCallback(() => {
    weightPickerModal.requestClose();
  }, [weightPickerModal]);

  const handleBodyFatPickerCancel = useCallback(() => {
    bodyFatPickerModal.requestClose();
  }, [bodyFatPickerModal]);

  useEffect(() => {
    if (weightEntryModal.isOpen || weightEntryModal.isClosing) {
      return;
    }

    const fallbackWeight = clampWeight(userData.weight) ?? userData.weight;

    setWeightEntryDraft({ date: getTodayDateString(), weight: fallbackWeight });
    setWeightEntryMode('add');
    setWeightEntryOriginalDate(null);
    setIsWeightDateLocked(false);
    setWeightEntryError('');
    setWeightPickerValue(fallbackWeight);
  }, [userData.weight, weightEntryModal.isClosing, weightEntryModal.isOpen]);

  useEffect(() => {
    if (bodyFatEntryModal.isOpen || bodyFatEntryModal.isClosing) {
      return;
    }

    const fallbackBodyFat =
      clampBodyFat(latestBodyFatEntry?.bodyFat ?? 18) ?? 18;

    setBodyFatEntryDraft({
      date: getTodayDateString(),
      bodyFat: fallbackBodyFat,
    });
    setBodyFatEntryMode('add');
    setBodyFatEntryOriginalDate(null);
    setIsBodyFatDateLocked(false);
    setBodyFatEntryError('');
    setBodyFatPickerValue(fallbackBodyFat);
  }, [
    bodyFatEntryModal.isClosing,
    bodyFatEntryModal.isOpen,
    latestBodyFatEntry?.bodyFat,
  ]);

  const handleTrainingDayClick = useCallback(() => {
    const latestTodaySession =
      todayTrainingSessions.length > 0
        ? todayTrainingSessions[todayTrainingSessions.length - 1]
        : null;

    if (latestTodaySession) {
      const normalizedEffortType = latestTodaySession.effortType ?? 'intensity';
      const durationMinutes = Number(latestTodaySession.duration);
      const durationHours =
        Number.isFinite(durationMinutes) && durationMinutes > 0
          ? Math.round((durationMinutes / 60) * 10) / 10
          : userData.trainingDuration;

      setTrainingModalMode('session');
      setEditingTrainingSessionId(latestTodaySession.id ?? null);
      setTempTrainingType(
        latestTodaySession.type ?? userData.selectedTrainingType
      );
      setTempTrainingDuration(durationHours);
      setTempTrainingEffortType(normalizedEffortType);
      setTempTrainingIntensity(
        latestTodaySession.intensity ?? DEFAULT_TRAINING_INTENSITY
      );
      setTempTrainingStartTime(
        normalizeTimeOfDay(
          latestTodaySession?.startTime,
          getTimeOfDayFromEpochMs(
            latestTodaySession?.startedAt,
            getCurrentLocalTimeString()
          )
        )
      );
      setTempTrainingHeartRate(
        normalizedEffortType === 'heartRate'
          ? (latestTodaySession.averageHeartRate ?? '')
          : ''
      );
      trainingModal.open();
      return;
    }

    setTrainingModalMode('session');
    setEditingTrainingSessionId(null);
    setTempTrainingType(userData.selectedTrainingType);
    setTempTrainingDuration(userData.trainingDuration);
    setTempTrainingEffortType(DEFAULT_TRAINING_EFFORT_TYPE);
    setTempTrainingIntensity(DEFAULT_TRAINING_INTENSITY);
    setTempTrainingStartTime(getCurrentLocalTimeString());
    setTempTrainingHeartRate('');
    trainingModal.open();
  }, [
    todayTrainingSessions,
    trainingModal,
    userData.trainingDuration,
    userData.selectedTrainingType,
    setTempTrainingStartTime,
  ]);

  const handleRestDayClick = useCallback(() => {
    if (todayTrainingSessions.length === 0) {
      return;
    }

    setConfirmActionTitle('Clear Training Session');
    setConfirmActionDescription(
      "Switching to Rest Day will remove today's training session. This cannot be undone."
    );
    setConfirmActionLabel('Clear Session');
    setConfirmActionTone('danger');
    setConfirmActionCallback(() => () => {
      todayTrainingSessions.forEach((session) => {
        if (session?.id != null) {
          removeTrainingSession(session.id);
        }
      });
    });
    confirmActionModal.open();
  }, [confirmActionModal, removeTrainingSession, todayTrainingSessions]);

  const openGoalModal = useCallback(() => {
    if (isGoalLockedByActivePhase) {
      return;
    }
    setTempSelectedGoal(selectedGoal);
    goalModal.open();
  }, [goalModal, isGoalLockedByActivePhase, selectedGoal]);

  const openAgeModal = useCallback(() => {
    setTempAge(userData.age);
    ageModal.open();
  }, [ageModal, userData.age]);

  const openHeightModal = useCallback(() => {
    setTempHeight(userData.height);
    heightModal.open();
  }, [heightModal, userData.height]);

  const resetTrainingTypeEditorState = useCallback(() => {
    setEditingTrainingType(null);
    setTempPresetName('');
    setTempPresetCalories(0);
  }, []);

  const closeTrainingTypeEditor = useCallback(() => {
    trainingTypeEditorModal.requestClose();
    setTimeout(resetTrainingTypeEditorState, MODAL_CLOSE_DELAY);
  }, [resetTrainingTypeEditorState, trainingTypeEditorModal]);

  const openTrainingTypeEditor = useCallback(
    (typeKey) => {
      const current = trainingTypes[typeKey] ??
        DEFAULT_TRAINING_TYPE_CATALOG[typeKey] ?? {
          label: typeKey,
          caloriesPerHour: 0,
        };

      const initialCalories = Number(current.caloriesPerHour ?? 0);

      setEditingTrainingType(typeKey);
      setTempPresetName(current.label ?? '');
      setTempPresetCalories(
        Number.isFinite(initialCalories) ? initialCalories : 0
      );
      trainingTypeEditorModal.open();
    },
    [trainingTypeEditorModal, trainingTypes]
  );

  const handleTrainingPresetSave = useCallback(() => {
    if (!editingTrainingType) {
      closeTrainingTypeEditor();
      return;
    }

    const fallback = DEFAULT_TRAINING_TYPE_CATALOG[editingTrainingType] ?? {
      label: editingTrainingType,
      caloriesPerHour: 0,
    };

    const nextName = tempPresetName.trim() || fallback.label;
    const sanitizedCalories = Number.isFinite(tempPresetCalories)
      ? Math.max(0, tempPresetCalories)
      : NaN;
    const nextCalories = Number.isFinite(sanitizedCalories)
      ? sanitizedCalories
      : fallback.caloriesPerHour;

    updateTrainingType(editingTrainingType, {
      name: nextName,
      calories: nextCalories,
    });

    if (editingTrainingType === tempTrainingType) {
      setTempTrainingType(editingTrainingType);
    }

    closeTrainingTypeEditor();
  }, [
    closeTrainingTypeEditor,
    editingTrainingType,
    tempPresetCalories,
    tempPresetName,
    tempTrainingType,
    updateTrainingType,
  ]);

  const openDailyActivitySettings = useCallback(() => {
    setActivityEditorDay(null);
    dailyActivityModal.open();
  }, [dailyActivityModal]);

  const handleDailyActivityModalClose = useCallback(() => {
    dailyActivityModal.requestClose();
    if (dailyActivityEditorModal.isOpen) {
      dailyActivityEditorModal.forceClose();
    }
    if (dailyActivityCustomModal.isOpen) {
      dailyActivityCustomModal.forceClose();
    }
    setActivityEditorDay(null);
  }, [dailyActivityCustomModal, dailyActivityEditorModal, dailyActivityModal]);

  const openDailyActivityEditor = useCallback(
    (dayType) => {
      setActivityEditorDay(dayType);
      dailyActivityEditorModal.open();
    },
    [dailyActivityEditorModal]
  );

  const closeDailyActivityEditor = useCallback(() => {
    dailyActivityEditorModal.requestClose();
    setTimeout(() => {
      if (!dailyActivityCustomModal.isOpen) {
        setActivityEditorDay(null);
      }
    }, MODAL_CLOSE_DELAY);
  }, [dailyActivityCustomModal.isOpen, dailyActivityEditorModal]);

  const handleDailyActivityPresetSelect = useCallback(
    (dayType, presetKey, multiplier) => {
      const nextPresets = {
        ...(userData.activityPresets ?? {
          training: 'default',
          rest: 'default',
        }),
        [dayType]: presetKey,
      };

      handleUserDataChange('activityPresets', nextPresets);

      if (presetKey === 'custom') {
        const existingCustom = userData.customActivityMultipliers?.[dayType];
        const fallback =
          userData.activityMultipliers?.[dayType] ??
          DEFAULT_ACTIVITY_MULTIPLIERS[dayType];
        const resolved = clampCustomActivityMultiplier(
          Number.isFinite(existingCustom) ? existingCustom : fallback
        );

        handleUserDataChange('customActivityMultipliers', {
          ...(userData.customActivityMultipliers ?? {
            training: DEFAULT_ACTIVITY_MULTIPLIERS.training,
            rest: DEFAULT_ACTIVITY_MULTIPLIERS.rest,
          }),
          [dayType]: resolved,
        });

        handleUserDataChange('activityMultipliers', {
          ...(userData.activityMultipliers ?? DEFAULT_ACTIVITY_MULTIPLIERS),
          [dayType]: resolved,
        });
      } else if (Number.isFinite(multiplier)) {
        handleUserDataChange('activityMultipliers', {
          ...(userData.activityMultipliers ?? DEFAULT_ACTIVITY_MULTIPLIERS),
          [dayType]: multiplier,
        });
      }
    },
    [handleUserDataChange, userData]
  );

  const handleDailyActivityCustomSelect = useCallback(
    (dayType, alreadySelected) => {
      const existingCustom = userData.customActivityMultipliers?.[dayType];
      const fallback =
        userData.activityMultipliers?.[dayType] ??
        DEFAULT_ACTIVITY_MULTIPLIERS[dayType];
      const resolvedMultiplier = clampCustomActivityMultiplier(
        Number.isFinite(existingCustom) ? existingCustom : fallback
      );

      handleDailyActivityPresetSelect(dayType, 'custom');

      const percentValue = getCustomActivityPercent(resolvedMultiplier);
      setActivityEditorDay(dayType);
      setCustomActivityPercent(percentValue);

      if (alreadySelected || !Number.isFinite(existingCustom)) {
        dailyActivityCustomModal.open();
      }
    },
    [dailyActivityCustomModal, handleDailyActivityPresetSelect, userData]
  );

  const handleCustomActivityCancel = useCallback(() => {
    dailyActivityCustomModal.requestClose();
  }, [dailyActivityCustomModal]);

  const handleCustomActivitySave = useCallback(
    (percentValue) => {
      if (!activityEditorDay) {
        dailyActivityCustomModal.requestClose();
        return;
      }

      const numericPercent = Number(percentValue ?? customActivityPercent);
      if (!Number.isFinite(numericPercent)) {
        return;
      }

      const clampedPercent = clampCustomActivityPercent(numericPercent);
      const multiplier = clampCustomActivityMultiplier(clampedPercent / 100);

      const nextCustoms = {
        ...(userData.customActivityMultipliers ?? {
          training: DEFAULT_ACTIVITY_MULTIPLIERS.training,
          rest: DEFAULT_ACTIVITY_MULTIPLIERS.rest,
        }),
        [activityEditorDay]: multiplier,
      };

      handleUserDataChange('customActivityMultipliers', nextCustoms);
      handleUserDataChange('activityPresets', {
        ...(userData.activityPresets ?? {
          training: 'default',
          rest: 'default',
        }),
        [activityEditorDay]: 'custom',
      });
      handleUserDataChange('activityMultipliers', {
        ...(userData.activityMultipliers ?? DEFAULT_ACTIVITY_MULTIPLIERS),
        [activityEditorDay]: multiplier,
      });

      setCustomActivityPercent(clampedPercent);
      dailyActivityCustomModal.requestClose();
    },
    [
      activityEditorDay,
      customActivityPercent,
      dailyActivityCustomModal,
      handleUserDataChange,
      userData,
    ]
  );

  const persistLastSelectedCardioType = useCallback(
    (typeKey) => {
      const normalizedTypeKey = String(typeKey ?? '').trim();
      if (!normalizedTypeKey) {
        return;
      }

      handleUserDataChange('lastSelectedCardioType', normalizedTypeKey);
      void saveLastSelectedCardioType(normalizedTypeKey);
    },
    [handleUserDataChange]
  );

  const handleCardioDraftChange = useCallback(
    (nextDraft) => {
      setCardioDraft((prevDraft) => {
        const resolvedNextDraft =
          typeof nextDraft === 'function' ? nextDraft(prevDraft) : nextDraft;

        if (!resolvedNextDraft || typeof resolvedNextDraft !== 'object') {
          return prevDraft;
        }

        const nextType = String(resolvedNextDraft.type ?? '').trim();
        const previousType = String(prevDraft?.type ?? '').trim();
        if (nextType && nextType !== previousType) {
          persistLastSelectedCardioType(nextType);
        }

        return resolvedNextDraft;
      });
    },
    [persistLastSelectedCardioType]
  );

  const handleFavouriteDraftChange = useCallback(
    (nextDraft) => {
      setFavouriteDraft((prevDraft) => {
        const resolvedNextDraft =
          typeof nextDraft === 'function' ? nextDraft(prevDraft) : nextDraft;

        if (!resolvedNextDraft || typeof resolvedNextDraft !== 'object') {
          return prevDraft;
        }

        const nextType = String(resolvedNextDraft.type ?? '').trim();
        const previousType = String(prevDraft?.type ?? '').trim();
        if (nextType && nextType !== previousType) {
          persistLastSelectedCardioType(nextType);
        }

        return resolvedNextDraft;
      });
    },
    [persistLastSelectedCardioType]
  );

  const lastSelectedCardioType = userData.lastSelectedCardioType;

  const openCardioModal = useCallback(() => {
    setEditingCardioId(null);
    setCardioDraft(
      getDefaultCardioSessionForType(lastSelectedCardioType, cardioTypes)
    );
    setCardioModalMode('add');
    cardioModal.open();
  }, [cardioModal, cardioTypes, lastSelectedCardioType]);

  const handleEditCardioSession = useCallback(
    (sessionId) => {
      const existing = userData.cardioSessions.find(
        (session) => session.id === sessionId
      );
      if (!existing) {
        return;
      }

      const normalizedEffortType = existing.effortType ?? 'intensity';
      const draft = {
        ...defaultCardioSession,
        ...existing,
        type: existing.type ?? defaultCardioSession.type,
        startTime: normalizeTimeOfDay(
          existing?.startTime,
          getTimeOfDayFromEpochMs(
            existing?.startedAt,
            getCurrentLocalTimeString()
          )
        ),
        duration: existing.duration ?? defaultCardioSession.duration,
        intensity: existing.intensity ?? defaultCardioSession.intensity,
        effortType: normalizedEffortType,
        averageHeartRate:
          normalizedEffortType === 'heartRate'
            ? (existing.averageHeartRate ?? '')
            : '',
        stepOverlapEnabled: isStepBasedCardioType(
          existing.type,
          cardioTypes?.[existing.type]
        )
          ? (existing.stepOverlapEnabled ?? true)
          : false,
      };

      setCardioDraft(draft);
      setEditingCardioId(sessionId);
      setCardioModalMode('edit');
      cardioModal.open();
    },
    [cardioModal, cardioTypes, userData.cardioSessions]
  );

  const handleRemoveCardioSession = useCallback(
    (sessionId) => {
      const existing = userData.cardioSessions.find(
        (session) => session.id === sessionId
      );
      if (!existing) {
        return;
      }

      const cardioLabel =
        cardioTypes?.[existing.type]?.label ?? 'this cardio session';
      const duration = Number.parseInt(existing.duration, 10);
      const durationText =
        Number.isFinite(duration) && duration > 0 ? ` (${duration} min)` : '';

      setConfirmActionTitle('Delete Cardio Session');
      setConfirmActionDescription(
        `Are you sure you want to delete ${cardioLabel}${durationText}? This action cannot be undone.`
      );
      setConfirmActionLabel('Delete');
      setConfirmActionTone('danger');
      setConfirmActionCallback(() => () => {
        removeCardioSession(sessionId);
      });
      confirmActionModal.open();
    },
    [
      cardioTypes,
      confirmActionModal,
      removeCardioSession,
      userData.cardioSessions,
    ]
  );

  const handleAddStepRange = useCallback(() => {
    const trimmed = newStepRange.trim();
    if (!trimmed) return;
    addStepRange(trimmed);
    setNewStepRange('');
  }, [addStepRange, newStepRange]);

  const todayDateKey = getTodayDateString();
  const macroTotalsByDate = useMemo(
    () => ({
      today: getNutritionTotalsForDate(nutritionData, todayDateKey),
      trackerSelected: getNutritionTotalsForDate(
        nutritionData,
        trackerSelectedDate
      ),
    }),
    [nutritionData, todayDateKey, trackerSelectedDate]
  );

  const useTargetModeForQuickEstimates =
    userData.smartTefQuickEstimatesTargetMode ?? true;
  const useTargetModeForLiveCard =
    useTargetModeForQuickEstimates &&
    (userData.smartTefLiveCardTargetMode ?? false);

  const quickEstimateTefContext = useMemo(
    () =>
      useTargetModeForQuickEstimates
        ? { mode: 'target' }
        : {
            mode: 'dynamic',
            totals: macroTotalsByDate.today,
          },
    [macroTotalsByDate.today, useTargetModeForQuickEstimates]
  );

  const liveCardTefContext = useMemo(
    () =>
      useTargetModeForLiveCard
        ? { mode: 'target' }
        : {
            mode: 'dynamic',
            totals: macroTotalsByDate.today,
          },
    [macroTotalsByDate.today, useTargetModeForLiveCard]
  );

  const defaultAdaptiveThermogenesisMode = useMemo(() => {
    if (!userData.adaptiveThermogenesisEnabled) {
      return 'off';
    }

    return userData.adaptiveThermogenesisSmartMode ? 'smart' : 'crude';
  }, [
    userData.adaptiveThermogenesisEnabled,
    userData.adaptiveThermogenesisSmartMode,
  ]);

  const openCalorieBreakdown = useCallback(
    (requestOrSteps) => {
      const normalizedRequest =
        requestOrSteps && typeof requestOrSteps === 'object'
          ? {
              ...requestOrSteps,
              tefContext: requestOrSteps.tefContext ?? quickEstimateTefContext,
              adaptiveThermogenesisContext:
                requestOrSteps.adaptiveThermogenesisContext ?? {
                  mode: defaultAdaptiveThermogenesisMode,
                },
            }
          : {
              steps: requestOrSteps,
              tefContext: quickEstimateTefContext,
              adaptiveThermogenesisContext: {
                mode: defaultAdaptiveThermogenesisMode,
              },
            };

      setSelectedBreakdownRequest(normalizedRequest);
      calorieBreakdownModal.open();
    },
    [
      calorieBreakdownModal,
      defaultAdaptiveThermogenesisMode,
      quickEstimateTefContext,
    ]
  );

  const closeCalorieBreakdown = useCallback(() => {
    calorieBreakdownModal.requestClose();
    setTimeout(() => {
      setSelectedBreakdownRequest(null);
    }, MODAL_CLOSE_DELAY);
  }, [calorieBreakdownModal]);

  const selectedRangeData = useMemo(() => {
    const selectedSteps = selectedBreakdownRequest?.steps;
    if (selectedSteps === null || selectedSteps === undefined) {
      return null;
    }

    return calculateTargetForGoal(
      selectedSteps,
      selectedDay === 'training',
      selectedGoal,
      {
        tefContext: selectedBreakdownRequest?.tefContext,
        adaptiveThermogenesisContext:
          selectedBreakdownRequest?.adaptiveThermogenesisContext,
      }
    );
  }, [
    calculateTargetForGoal,
    selectedBreakdownRequest,
    selectedDay,
    selectedGoal,
  ]);

  const getRangeDetails = useCallback(
    (steps) =>
      calculateTargetForGoal(steps, selectedDay === 'training', selectedGoal, {
        tefContext: quickEstimateTefContext,
        adaptiveThermogenesisContext: {
          mode: defaultAdaptiveThermogenesisMode,
        },
      }),
    [
      calculateTargetForGoal,
      defaultAdaptiveThermogenesisMode,
      quickEstimateTefContext,
      selectedDay,
      selectedGoal,
    ]
  );

  const isSelectedRange = useCallback(
    (range) =>
      calorieBreakdownModal.isOpen &&
      selectedBreakdownRequest?.steps === range &&
      (selectedBreakdownRequest?.tefContext?.mode ??
        quickEstimateTefContext.mode) === quickEstimateTefContext.mode,
    [
      calorieBreakdownModal.isOpen,
      quickEstimateTefContext.mode,
      selectedBreakdownRequest,
    ]
  );

  // Live step data from Health Connect
  const liveStepData = useMemo(() => {
    if (
      healthConnect.status !== HealthConnectStatus.CONNECTED ||
      healthConnect.steps === null
    ) {
      return null;
    }

    const stepCount = healthConnect.steps;
    const tefContext = liveCardTefContext;
    const details = calculateTargetForGoal(
      stepCount, // Pass raw step count instead of range string
      selectedDay === 'training',
      selectedGoal,
      { tefContext }
    );

    return {
      stepCount,
      breakdown: details.breakdown,
      targetCalories: details.targetCalories,
      difference: details.difference,
      lastSynced: healthConnect.lastSynced,
      tefContext,
    };
  }, [
    healthConnect.status,
    healthConnect.steps,
    healthConnect.lastSynced,
    calculateTargetForGoal,
    liveCardTefContext,
    selectedDay,
    selectedGoal,
  ]);

  const normalizedStepRanges = useMemo(
    () => (Array.isArray(userData.stepRanges) ? userData.stepRanges : []),
    [userData.stepRanges]
  );

  useEffect(() => {
    if (normalizedStepRanges.length === 0) {
      return;
    }

    if (!normalizedStepRanges.includes(trackerStepRange)) {
      setTrackerStepRange(normalizedStepRanges[0]);
    }
  }, [normalizedStepRanges, trackerStepRange]);

  useEffect(() => {
    if (
      selectedCalorieTargetType === 'live_steps' &&
      (healthConnect.status !== HealthConnectStatus.CONNECTED ||
        liveStepData == null)
    ) {
      setSelectedCalorieTargetType('step_range');
    }
  }, [healthConnect.status, liveStepData, selectedCalorieTargetType]);

  const trackerRangeData = useMemo(() => {
    if (!trackerStepRange) {
      return null;
    }

    return getRangeDetails(trackerStepRange);
  }, [getRangeDetails, trackerStepRange]);

  const selectedCalorieTargetData = useMemo(() => {
    if (selectedCalorieTargetType === 'live_steps' && liveStepData) {
      return {
        type: 'live_steps',
        id: 'live_steps',
        key: 'live_steps',
        steps: liveStepData.stepCount,
        label: `${liveStepData.stepCount.toLocaleString()} live steps`,
        targetCalories: liveStepData.targetCalories,
      };
    }

    if (!trackerStepRange || !trackerRangeData) {
      return {
        type: 'step_range',
        id: trackerStepRange ? `step_range:${trackerStepRange}` : null,
        key: trackerStepRange ? `step_range:${trackerStepRange}` : null,
        steps: trackerStepRange,
        label: trackerStepRange ? `${trackerStepRange} steps` : 'No target',
        targetCalories: 2500,
      };
    }

    return {
      type: 'step_range',
      id: `step_range:${trackerStepRange}`,
      key: `step_range:${trackerStepRange}`,
      steps: trackerStepRange,
      label: `${trackerStepRange} steps`,
      targetCalories: trackerRangeData.targetCalories ?? 2500,
    };
  }, [
    liveStepData,
    selectedCalorieTargetType,
    trackerRangeData,
    trackerStepRange,
  ]);

  const calorieTargetOptions = useMemo(() => {
    const stepRangeOptions = normalizedStepRanges.map((range) => {
      const details = getRangeDetails(range);
      return {
        id: `step_range:${range}`,
        key: `step_range:${range}`,
        type: 'step_range',
        label: 'Step Range',
        steps: range,
        targetCalories: details?.targetCalories ?? 0,
        tdee: details?.breakdown?.total ?? 0,
        difference: details?.difference ?? 0,
      };
    });

    if (!liveStepData) {
      return stepRangeOptions;
    }

    return [
      {
        id: 'live_steps',
        key: 'live_steps',
        type: 'live_steps',
        label: 'Live Steps',
        steps: liveStepData.stepCount,
        targetCalories: liveStepData.targetCalories ?? 0,
        tdee: liveStepData.breakdown?.total ?? 0,
        difference: liveStepData.difference ?? 0,
      },
      ...stepRangeOptions,
    ];
  }, [getRangeDetails, liveStepData, normalizedStepRanges]);

  // Auto-save step entries when Health Connect data updates
  useEffect(() => {
    if (
      healthConnect.status === HealthConnectStatus.CONNECTED &&
      healthConnect.steps != null &&
      healthConnect.steps > 0
    ) {
      const todayKey = getTodayDateString();
      saveStepEntry({
        date: todayKey,
        steps: healthConnect.steps,
        source: 'healthConnect',
      });
    }
  }, [healthConnect.status, healthConnect.steps, saveStepEntry]);

  const openStepTracker = useCallback(() => {
    stepTrackerModal.open();
  }, [stepTrackerModal]);

  const openStepGoalPicker = useCallback(() => {
    stepGoalPickerModal.open();
  }, [stepGoalPickerModal]);

  const handleStepGoalSave = useCallback(
    (newGoal) => {
      setStepGoal(newGoal);
      stepGoalPickerModal.requestClose();
    },
    [setStepGoal, stepGoalPickerModal]
  );

  const handleCardioSave = useCallback(() => {
    const sessionToSave = sanitizeCardioDraft(cardioDraft, cardioTypes);
    if (!sessionToSave) {
      return;
    }

    const todayDate = getTodayDateString();
    const normalizedDraftDate = normalizeDateKey(sessionToSave.date);
    if (!normalizedDraftDate || normalizedDraftDate !== todayDate) {
      return;
    }

    const todaySession = {
      ...sessionToSave,
      date: todayDate,
    };

    if (editingCardioId != null) {
      updateCardioSession(editingCardioId, todaySession);
    } else {
      addCardioSession(todaySession);
    }

    cardioModal.requestClose();
  }, [
    addCardioSession,
    cardioTypes,
    cardioDraft,
    cardioModal,
    editingCardioId,
    updateCardioSession,
  ]);

  const handleFavouriteSave = useCallback(() => {
    const favouriteToSave = sanitizeCardioDraft(favouriteDraft, cardioTypes);
    if (!favouriteToSave) {
      return;
    }

    addCardioFavourite(favouriteToSave);
    cardioFavouriteEditorModal.requestClose();
  }, [
    addCardioFavourite,
    cardioFavouriteEditorModal,
    cardioTypes,
    favouriteDraft,
  ]);

  const handleApplyFavourite = useCallback(
    (favourite) => {
      const sanitized = sanitizeCardioDraft(
        {
          ...favourite,
          date: getTodayDateString(),
        },
        cardioTypes
      );
      if (!sanitized) {
        return;
      }

      const effortType = sanitized.effortType ?? 'intensity';
      setCardioDraft({
        ...defaultCardioSession,
        ...sanitized,
        date: getTodayDateString(),
        startTime: normalizeTimeOfDay(
          sanitized?.startTime,
          getCurrentLocalTimeString()
        ),
        averageHeartRate:
          effortType === 'heartRate' ? (sanitized.averageHeartRate ?? '') : '',
      });

      if (cardioModalMode === 'edit' && editingCardioId != null) {
        updateCardioSession(editingCardioId, sanitized);
      } else {
        addCardioSession(sanitized);
      }

      persistLastSelectedCardioType(sanitized.type);

      cardioFavouritesModal.requestClose();
      cardioModal.requestClose();
    },
    [
      addCardioSession,
      cardioFavouritesModal,
      cardioModal,
      cardioModalMode,
      cardioTypes,
      editingCardioId,
      persistLastSelectedCardioType,
      updateCardioSession,
    ]
  );

  const handleOpenCardioFavourites = useCallback(() => {
    cardioFavouritesModal.open();
  }, [cardioFavouritesModal]);

  // Food Entry Handlers (following CardioSession pattern)
  const resetFoodEntryForm = useCallback(() => {
    setFoodName('');
    setFoodCalories('');
    setFoodProtein('');
    setFoodCarbs('');
    setFoodFats('');
    setEditingFoodEntryId(null);
    setEditingMealType(null);
    setEditingManualFavouriteId(null);
    setFoodEntryMode('add');
  }, []);

  // Begin meal entry flow by ensuring meal type is selected, then opening search
  const startMealEntryFlow = useCallback(
    (mealType = '') => {
      if (!mealType) {
        mealTypePickerModal.open();
        return;
      }

      setFoodMealType(mealType);
      resetFoodEntryForm();
      foodSearchModal.open();
    },
    [foodSearchModal, mealTypePickerModal, resetFoodEntryForm]
  );

  // Handle meal type selection from picker modal
  const handleMealTypeSelect = useCallback(
    (mealType) => {
      if (!mealType) {
        return;
      }

      setFoodMealType(mealType);
      // Open search immediately for snappier feel while picker closes
      startMealEntryFlow(mealType);
    },
    [startMealEntryFlow]
  );

  const openFoodSearchForMeal = useCallback(
    (mealType) => {
      startMealEntryFlow(mealType);
    },
    [startMealEntryFlow]
  );

  // Handle selecting a food from search - opens portion modal
  const handleSelectFoodFromSearch = useCallback(
    (food) => {
      // Reset editing state to ensure we're in "add" mode
      setEditingPortionEntry(null);
      setPortionInitialGrams(null);
      setSelectedFoodForPortion(food);
      foodPortionModal.open();
    },
    [foodPortionModal]
  );

  // Handle opening manual entry from search modal
  const handleOpenManualEntry = useCallback(() => {
    resetFoodEntryForm();
    setFoodEntryMode('add');
    foodEntryModal.open();
  }, [foodEntryModal, resetFoodEntryForm]);

  const openFoodNutrientPicker = useCallback(
    (fieldKey) => {
      const fieldConfig = FOOD_ENTRY_PICKER_FIELDS[fieldKey];
      if (!fieldConfig) {
        return;
      }

      let currentValue = 0;
      if (fieldKey === 'calories') {
        currentValue = Number.parseFloat(foodCalories);
      } else if (fieldKey === 'protein') {
        currentValue = Number.parseFloat(foodProtein);
      } else if (fieldKey === 'carbs') {
        currentValue = Number.parseFloat(foodCarbs);
      } else if (fieldKey === 'fats') {
        currentValue = Number.parseFloat(foodFats);
      }

      setFoodNutrientPickerConfig({
        ...fieldConfig,
        fieldKey,
        value: normalizePickerValue(currentValue, fieldConfig),
      });
      foodNutrientPickerModal.open();
    },
    [foodCalories, foodCarbs, foodFats, foodNutrientPickerModal, foodProtein]
  );

  const handleFoodNutrientPickerSave = useCallback(
    (nextValue) => {
      if (!foodNutrientPickerConfig?.fieldKey) {
        foodNutrientPickerModal.requestClose();
        return;
      }

      const normalizedValue = normalizePickerValue(
        Number(nextValue),
        foodNutrientPickerConfig
      );
      const formattedValue = formatPickerValueForState(
        normalizedValue,
        foodNutrientPickerConfig.step
      );

      if (foodNutrientPickerConfig.fieldKey === 'calories') {
        setFoodCalories(formattedValue);
      } else if (foodNutrientPickerConfig.fieldKey === 'protein') {
        setFoodProtein(formattedValue);
      } else if (foodNutrientPickerConfig.fieldKey === 'carbs') {
        setFoodCarbs(formattedValue);
      } else if (foodNutrientPickerConfig.fieldKey === 'fats') {
        setFoodFats(formattedValue);
      }

      foodNutrientPickerModal.requestClose();
    },
    [foodNutrientPickerConfig, foodNutrientPickerModal]
  );

  const handleFoodNutrientPickerCancel = useCallback(() => {
    foodNutrientPickerModal.requestClose();
  }, [foodNutrientPickerModal]);

  // Handle adding food from portion modal
  const handleAddFoodFromPortion = useCallback(
    (foodEntry, options = {}) => {
      const shouldClosePortionModal =
        options?.closePortionModal ?? options?.closeModal !== false;
      const shouldCloseSearchModal =
        options?.closeSearchModal ?? shouldClosePortionModal;

      if (editingPortionEntry) {
        const targetMealType = editingPortionEntry.mealType || foodMealType;
        if (!targetMealType) {
          return;
        }

        updateFoodEntry(trackerSelectedDate, targetMealType, {
          ...foodEntry,
          id: editingPortionEntry.id,
          timestamp: editingPortionEntry.timestamp ?? foodEntry.timestamp,
          foodId:
            foodEntry.foodId ??
            selectedFoodForPortion?.id ??
            editingPortionEntry.foodId,
        });

        if (shouldClosePortionModal) {
          foodPortionModal.requestClose();
        }
        return;
      }

      if (!foodMealType) {
        return;
      }

      addFoodEntry(trackerSelectedDate, foodMealType, foodEntry);

      if (shouldClosePortionModal) {
        foodPortionModal.requestClose();
      }

      if (shouldCloseSearchModal) {
        foodSearchModal.requestClose();
      }
    },
    [
      addFoodEntry,
      editingPortionEntry,
      foodMealType,
      foodPortionModal,
      foodSearchModal,
      selectedFoodForPortion?.id,
      trackerSelectedDate,
      updateFoodEntry,
    ]
  );

  // Edit food entry from TrackerScreen
  const handleEditFoodEntry = useCallback(
    async (mealType, entryId) => {
      const dateData = nutritionData[trackerSelectedDate] || {};
      const mealEntries = Array.isArray(dateData[mealType])
        ? dateData[mealType]
        : [];
      const existing = mealEntries.find((entry) => entry.id === entryId);
      if (!existing) {
        return;
      }

      // Check if this is a manual entry (no grams value)
      const isManualEntry =
        !Number.isFinite(existing.grams) || existing.grams <= 0;

      if (isManualEntry) {
        // Open FoodEntryModal for manual entries
        setFoodMealType(mealType);
        setEditingMealType(mealType);
        setEditingFoodEntryId(existing.id);
        setFoodName(existing.name || '');
        setFoodCalories(String(existing.calories || ''));
        setFoodProtein(String(existing.protein || ''));
        setFoodCarbs(String(existing.carbs || ''));
        setFoodFats(String(existing.fats || ''));
        setFoodEntryMode('edit');
        foodEntryModal.open();
        return;
      }

      // Open FoodPortionModal for entries with grams
      const { getFoodById: getFoodByIdFromCatalog } = await import(
        '../../services/foodCatalog'
      );
      const resolvedFoodFromCatalog = existing.foodId
        ? await getFoodByIdFromCatalog(existing.foodId)
        : null;
      const resolvedFood =
        resolvedFoodFromCatalog || buildFallbackFoodFromEntry(existing);

      setFoodMealType(mealType);
      setSelectedFoodForPortion(resolvedFood);
      setEditingPortionEntry({ ...existing, mealType });
      setPortionInitialGrams(existing.grams);
      foodPortionModal.open();
    },
    [nutritionData, trackerSelectedDate, foodPortionModal, foodEntryModal]
  );

  // Delete food entry from meal
  const handleFoodEntrySave = useCallback(
    (options = {}) => {
      const shouldClose = options?.closeModal !== false;

      // If editing a manual favourite, update the favourite AND add to tracker
      if (editingManualFavouriteId) {
        // Update the favourite
        updateFoodFavourite(editingManualFavouriteId, {
          calories: parseFloat(foodCalories) || 0,
          protein: parseFloat(foodProtein) || 0,
          carbs: parseFloat(foodCarbs) || 0,
          fats: parseFloat(foodFats) || 0,
        });

        // Also add to tracker if we have a meal type
        if (foodMealType) {
          const entry = {
            id: Date.now(),
            name: foodName.trim(),
            calories: parseFloat(foodCalories) || 0,
            protein: parseFloat(foodProtein) || 0,
            carbs: parseFloat(foodCarbs) || 0,
            fats: parseFloat(foodFats) || 0,
            grams: null,
            timestamp: new Date().toISOString(),
          };
          addFoodEntry(trackerSelectedDate, foodMealType, entry);
        }

        if (shouldClose) {
          foodEntryModal.requestClose();
          // Close search modal after editing favourite
          setTimeout(() => {
            foodSearchModal.requestClose();
          }, 250);
        }
        return;
      }

      const entry = {
        id: editingFoodEntryId || Date.now(),
        name: foodName.trim(),
        calories: parseFloat(foodCalories) || 0,
        protein: parseFloat(foodProtein) || 0,
        carbs: parseFloat(foodCarbs) || 0,
        fats: parseFloat(foodFats) || 0,
        // Manual entries do not have a measured gram amount by default.
        grams: null,
        timestamp: new Date().toISOString(),
      };

      if (editingFoodEntryId && editingMealType) {
        updateFoodEntry(trackerSelectedDate, editingMealType, entry);
      } else if (foodMealType) {
        addFoodEntry(trackerSelectedDate, foodMealType, entry);
      }

      if (shouldClose) {
        foodEntryModal.requestClose();
        // Close search modal after a short delay so nested modals finish closing
        if (!editingFoodEntryId) {
          setTimeout(() => {
            foodSearchModal.requestClose();
          }, 250);
        }
      }
    },
    [
      addFoodEntry,
      editingFoodEntryId,
      editingManualFavouriteId,
      editingMealType,
      foodCalories,
      foodCarbs,
      foodEntryModal,
      foodFats,
      foodMealType,
      foodName,
      foodProtein,
      foodSearchModal,
      trackerSelectedDate,
      updateFoodEntry,
      updateFoodFavourite,
    ]
  );

  const openCalorieTargetPicker = useCallback(() => {
    calorieTargetModal.open();
  }, [calorieTargetModal]);

  const handleCalorieTargetSelect = useCallback((option) => {
    if (!option) {
      return;
    }

    if (option.type === 'live_steps') {
      setSelectedCalorieTargetType('live_steps');
      return;
    }

    const optionSteps = String(option.steps ?? '').trim();
    if (!optionSteps) {
      return;
    }
    setTrackerStepRange(optionSteps);
    setSelectedCalorieTargetType('step_range');
  }, []);

  const handleMacroPickerChange = useCallback((nextSplit) => {
    setTempMacroRecommendationSplit(
      normalizeMacroRecommendationSplit(nextSplit)
    );
  }, []);

  const openMacroPickerModal = useCallback(() => {
    setTempMacroRecommendationSplit(
      normalizeMacroRecommendationSplit(userData.macroRecommendationSplit)
    );
    macroPickerModal.open();
  }, [macroPickerModal, userData.macroRecommendationSplit]);

  const handleMacroPickerSave = useCallback(
    (nextSplit) => {
      const normalized = normalizeMacroRecommendationSplit(nextSplit);
      setTempMacroRecommendationSplit(normalized);
      handleUserDataChange('macroRecommendationSplit', normalized);
      macroPickerModal.requestClose();
    },
    [handleUserDataChange, macroPickerModal]
  );

  useEffect(() => {
    if (foodEntryModal.isClosing) {
      const timer = setTimeout(() => {
        resetFoodEntryForm();
      }, MODAL_CLOSE_DELAY);
      return () => clearTimeout(timer);
    }
  }, [foodEntryModal.isClosing, resetFoodEntryForm]);

  useEffect(() => {
    if (foodNutrientPickerModal.isOpen || foodNutrientPickerModal.isClosing) {
      return;
    }

    setFoodNutrientPickerConfig(null);
  }, [foodNutrientPickerModal.isClosing, foodNutrientPickerModal.isOpen]);

  useEffect(() => {
    if (foodSearchModal.isClosing) {
      // No cleanup needed for this modal
    }
  }, [foodSearchModal.isClosing]);

  const handleFoodSearchCancel = useCallback(() => {
    foodSearchModal.requestClose();
  }, [foodSearchModal]);

  // Custom foods state (in-memory, added via AddCustomFoodModal)
  const [customFoods, setCustomFoods] = useState([]);

  // Handle adding a custom food - adds to customFoods list AND auto-favourites
  const handleAddCustomFood = useCallback(
    (customFood) => {
      // Add to custom foods list for search
      setCustomFoods((prev) => [...prev, customFood]);

      // Auto-add to favourites with proper structure
      const favourite = {
        foodId: customFood.id,
        name: customFood.name,
        category: customFood.category || 'custom',
        grams: 100, // Default to 100g since it's per 100g
        calories: customFood.per100g?.calories || 0,
        protein: customFood.per100g?.protein || 0,
        carbs: customFood.per100g?.carbs || 0,
        fats: customFood.per100g?.fats || 0,
        isCustom: true,
        source: 'user',
        per100g: customFood.per100g,
        portions: customFood.portions || [],
      };
      addFoodFavourite(favourite);
    },
    [addFoodFavourite]
  );

  // Food Favourites Handlers
  // When user clicks "Quick Add" on a favourite - instantly add to meal
  const handleSelectFoodFavourite = useCallback(
    (foodEntry, options = {}) => {
      if (!foodMealType) {
        // No meal type selected - can't add
        return;
      }

      addFoodEntry(trackerSelectedDate, foodMealType, foodEntry);

      if (options?.closeModal === false) {
        return;
      }

      // Close search modal after quick add
      foodSearchModal.requestClose();
    },
    [addFoodEntry, foodMealType, foodSearchModal, trackerSelectedDate]
  );

  // Check if a food with given name already exists in favourites
  const checkFoodExistsInFavourites = useCallback(
    (foodName) => {
      if (!foodName) return false;
      const lowerName = foodName.toLowerCase().trim();
      return foodFavourites.some(
        (fav) => fav.name?.toLowerCase().trim() === lowerName
      );
    },
    [foodFavourites]
  );

  // When user clicks "Edit" on a favourite - open portion modal to customize (or FoodEntryModal for manual)
  const handleEditFoodFavourite = useCallback(
    (displayFood, favourite) => {
      // For manual entries, open FoodEntryModal in edit mode
      if (favourite?.source === 'manual' || favourite?.category === 'manual') {
        setFoodName(favourite.name || '');
        setFoodCalories(String(favourite.calories || ''));
        setFoodProtein(String(favourite.protein || ''));
        setFoodCarbs(String(favourite.carbs || ''));
        setFoodFats(String(favourite.fats || ''));
        setFoodEntryMode('edit');
        setEditingManualFavouriteId(favourite.id);
        foodEntryModal.open();
        return;
      }

      // For other foods, open portion modal
      setSelectedFoodForPortion(displayFood);
      setPortionInitialGrams(favourite?.grams ?? DEFAULT_PORTION_GRAMS);
      foodPortionModal.open();
    },
    [foodPortionModal, foodEntryModal]
  );

  const handleDeleteFoodEntryFromSearch = useCallback(
    (mealType, entryId) => {
      if (!mealType || entryId == null) {
        return;
      }

      deleteFoodEntry(trackerSelectedDate, mealType, entryId);
    },
    [deleteFoodEntry, trackerSelectedDate]
  );

  // When user wants to create a new favourite from the current food/portion
  const handleCreateFoodFavourite = useCallback(
    (foodEntry, sourceFood) => {
      if (!foodEntry) return;

      // Determine source properly:
      // - 'usda'/'openfoodfacts' for cached online foods
      // - 'manual' for manual entries (from FoodEntryModal)
      // - 'user' for custom foods (from AddCustomFoodModal)
      // - null for local database foods
      const source = foodEntry.source || sourceFood?.source || null;
      const resolvedCategory =
        foodEntry.category ||
        sourceFood?.category ||
        (source ? 'cached' : 'custom');

      const favourite = {
        foodId: foodEntry.foodId || sourceFood?.id || null,
        name: foodEntry.name || sourceFood?.name || 'Custom Food',
        brand: sourceFood?.brand || foodEntry.brand || null,
        category: resolvedCategory,
        grams: foodEntry.grams,
        calories: foodEntry.calories || 0,
        protein: foodEntry.protein || 0,
        carbs: foodEntry.carbs || 0,
        fats: foodEntry.fats || 0,
        isCustom: !foodEntry.foodId && !sourceFood?.id && !source,
        source,
        per100g: sourceFood?.per100g || null,
        portions: sourceFood?.portions || [],
        // Smart portion info - remember what portion was selected
        ...(foodEntry.portionInfo && { portionInfo: foodEntry.portionInfo }),
      };

      addFoodFavourite(favourite);
    },
    [addFoodFavourite]
  );

  useEffect(() => {
    if (foodPortionModal.isClosing) {
      const timer = setTimeout(() => {
        setSelectedFoodForPortion(null);
        setEditingPortionEntry(null);
        setPortionInitialGrams(null);
      }, MODAL_CLOSE_DELAY + 50); // Slightly longer for nested modal
      return () => clearTimeout(timer);
    }
  }, [foodPortionModal.isClosing]);

  const handleCreateFavourite = useCallback(
    (template) => {
      const source = template ?? cardioDraft;
      const effortType = source?.effortType ?? 'intensity';
      const nextDraft = {
        ...defaultCardioSession,
        ...source,
        startTime: normalizeTimeOfDay(
          source?.startTime,
          getCurrentLocalTimeString()
        ),
        effortType,
        averageHeartRate:
          effortType === 'heartRate' ? (source?.averageHeartRate ?? '') : '',
      };
      if (nextDraft.id !== undefined) {
        delete nextDraft.id;
      }
      setFavouriteDraft(nextDraft);
      cardioFavouriteEditorModal.open();
    },
    [cardioDraft, cardioFavouriteEditorModal]
  );

  const handleRemoveFavourite = useCallback(
    (id) => {
      removeCardioFavourite(id);
    },
    [removeCardioFavourite]
  );

  const handleGoalSave = useCallback(() => {
    if (isGoalLockedByActivePhase) {
      goalModal.requestClose();
      return;
    }
    setSelectedGoal(tempSelectedGoal);
    goalModal.requestClose();
  }, [goalModal, isGoalLockedByActivePhase, setSelectedGoal, tempSelectedGoal]);

  const handleAgeSave = useCallback(
    (value) => {
      // Accept value from picker or fallback to temp state
      const age = value ?? tempAge;
      handleUserDataChange('age', age);
      ageModal.requestClose();
    },
    [ageModal, handleUserDataChange, tempAge]
  );

  const handleHeightSave = useCallback(
    (value) => {
      // Accept value from picker or fallback to temp state
      const height = value ?? tempHeight;
      handleUserDataChange('height', height);
      heightModal.requestClose();
    },
    [handleUserDataChange, heightModal, tempHeight]
  );

  const handleTimePickerSave = useCallback(
    (value) => {
      const normalizedValue = normalizeTimeOfDay(value, '12:00');
      setTempTimePickerValue(normalizedValue);

      if (timePickerTarget === 'training') {
        setTempTrainingStartTime(normalizedValue);
      } else if (timePickerTarget === 'cardio') {
        setCardioDraft((prev) => ({
          ...prev,
          startTime: normalizedValue,
        }));
      } else if (timePickerTarget === 'favourite-cardio') {
        setFavouriteDraft((prev) => ({
          ...prev,
          startTime: normalizedValue,
        }));
      }

      setTimePickerTarget(null);
      timePickerModal.requestClose();
    },
    [timePickerModal, timePickerTarget]
  );

  const handleTimePickerCancel = useCallback(() => {
    setTimeout(() => {
      setTempTimePickerValue('12:00');
    }, MODAL_CLOSE_DELAY);
    setTimePickerTarget(null);
    timePickerModal.requestClose();
  }, [timePickerModal]);

  const openTrainingStartTimePicker = useCallback(() => {
    setTempTimePickerValue(normalizeTimeOfDay(tempTrainingStartTime, '12:00'));
    setTimePickerTarget('training');
    timePickerModal.open();
  }, [tempTrainingStartTime, timePickerModal]);

  const openCardioStartTimePicker = useCallback(() => {
    setTempTimePickerValue(normalizeTimeOfDay(cardioDraft?.startTime, '12:00'));
    setTimePickerTarget('cardio');
    timePickerModal.open();
  }, [cardioDraft?.startTime, timePickerModal]);

  const openFavouriteCardioStartTimePicker = useCallback(() => {
    setTempTimePickerValue(
      normalizeTimeOfDay(favouriteDraft?.startTime, '12:00')
    );
    setTimePickerTarget('favourite-cardio');
    timePickerModal.open();
  }, [favouriteDraft?.startTime, timePickerModal]);

  const handleEpocWindowSave = useCallback(
    (value) => {
      const clamped = Math.min(Math.max(Math.round(value), 1), 24);
      handleUserDataChange('epocCarryoverHours', clamped);
      epocWindowPickerModal.requestClose();
    },
    [epocWindowPickerModal, handleUserDataChange]
  );

  const handleEpocWindowCancel = useCallback(() => {
    setTimeout(() => {
      setTempEpocWindowValue(userData.epocCarryoverHours ?? 6);
    }, MODAL_CLOSE_DELAY);
    epocWindowPickerModal.requestClose();
  }, [epocWindowPickerModal, userData.epocCarryoverHours]);
  const openEpocWindowPickerModal = useCallback(() => {
    setTempEpocWindowValue(userData.epocCarryoverHours ?? 6);
    epocWindowPickerModal.open();
  }, [epocWindowPickerModal, userData.epocCarryoverHours]);

  const handleTrainingSave = useCallback(() => {
    if (trainingModalMode === 'session') {
      const sessionDate = getTodayDateString();
      const durationHours = Number(tempTrainingDuration);
      const durationMinutes = Number.isFinite(durationHours)
        ? Math.round(durationHours * 60)
        : 0;

      if (durationMinutes <= 0) {
        return;
      }

      const timestamps = deriveSessionTimestamps({
        dateKey: sessionDate,
        timeOfDay: tempTrainingStartTime,
        durationMinutes,
      });

      const sessionPayload = {
        date: sessionDate,
        type: tempTrainingType,
        startTime: timestamps.startTime,
        startedAt: timestamps.startedAt,
        endedAt: timestamps.endedAt,
        duration: durationMinutes,
        effortType: tempTrainingEffortType,
        intensity: tempTrainingIntensity,
        averageHeartRate:
          tempTrainingEffortType === 'heartRate' ? tempTrainingHeartRate : '',
      };

      if (editingTrainingSessionId != null) {
        updateTrainingSession(editingTrainingSessionId, sessionPayload);
      } else {
        const existingTodaySession =
          todayTrainingSessions.length > 0
            ? todayTrainingSessions[todayTrainingSessions.length - 1]
            : null;

        if (existingTodaySession?.id != null) {
          updateTrainingSession(existingTodaySession.id, sessionPayload);
          setEditingTrainingSessionId(existingTodaySession.id);
        } else {
          addTrainingSession(sessionPayload);
        }
      }

      trainingModal.requestClose();
      return;
    }

    handleUserDataChange('selectedTrainingType', tempTrainingType);
    handleUserDataChange('trainingDuration', tempTrainingDuration);
    trainingModal.requestClose();
  }, [
    handleUserDataChange,
    trainingModal,
    tempTrainingDuration,
    tempTrainingStartTime,
    tempTrainingType,
    tempTrainingEffortType,
    tempTrainingIntensity,
    tempTrainingHeartRate,
    trainingModalMode,
    addTrainingSession,
    todayTrainingSessions,
    editingTrainingSessionId,
    updateTrainingSession,
  ]);

  const handleTrainingEffortTypeChange = useCallback(
    (nextType) => {
      if (nextType === tempTrainingEffortType) return;
      if (nextType === 'heartRate') {
        setTempTrainingEffortType('heartRate');
        return;
      }
      setTempTrainingEffortType('intensity');
      setTempTrainingHeartRate('');
    },
    [tempTrainingEffortType]
  );

  const handleTrainingIntensityChange = useCallback((level) => {
    setTempTrainingIntensity(level);
  }, []);

  const handleTrainingHeartRateChange = useCallback((event) => {
    const { value } = event.target;
    if (value === '') {
      setTempTrainingHeartRate('');
      return;
    }
    const parsed = Number.parseInt(value, 10);
    const sanitized = Number.isFinite(parsed) ? Math.max(parsed, 0) : 0;
    setTempTrainingHeartRate(sanitized);
  }, []);

  const openDurationPicker = useCallback(
    (initialValue, onConfirm, title = 'Training Duration') => {
      const sanitizedInitial = Number.isFinite(initialValue) ? initialValue : 0;
      setDurationPickerValue(sanitizedInitial);
      setDurationPickerTitle(title ?? 'Training Duration');
      durationPickerOnSaveRef.current = onConfirm;
      durationPickerModal.open();
    },
    [durationPickerModal]
  );

  const handleDurationPickerCancel = useCallback(() => {
    durationPickerOnSaveRef.current = null;
    durationPickerModal.requestClose();
  }, [durationPickerModal]);

  const handleDurationPickerSave = useCallback(
    (nextDuration) => {
      if (typeof durationPickerOnSaveRef.current === 'function') {
        durationPickerOnSaveRef.current(nextDuration);
      }
      durationPickerOnSaveRef.current = null;
      durationPickerModal.requestClose();
    },
    [durationPickerModal]
  );

  const handleSettingsSave = useCallback(() => {
    settingsModal.requestClose();
  }, [settingsModal]);

  // Phase handlers
  const openPhaseCreationModal = useCallback(() => {
    setPhaseDraft(createDefaultPhaseDraft());
    setPhaseError('');
    phaseCreationModal.open();
  }, [phaseCreationModal]);

  const handlePhaseCreationSave = useCallback(() => {
    const phaseName = phaseDraft.name;
    const phaseStartDate = phaseDraft.startDate;
    const phaseEndDate = phaseDraft.endDate;
    const phaseGoalType = phaseDraft.goalType;
    const phaseCreationMode =
      phaseDraft.creationMode === 'target' ? 'target' : 'goal';

    // Validation
    if (!phaseName.trim()) {
      setPhaseError('Please enter a phase name');
      return;
    }

    if (!phaseStartDate) {
      setPhaseError('Please select a start date');
      return;
    }

    if (phaseEndDate && phaseEndDate < phaseStartDate) {
      setPhaseError('End date must be after start date');
      return;
    }

    const targetWeight = parseNullablePhaseNumber(phaseDraft.targetWeight);
    if (targetWeight != null && (targetWeight < 30 || targetWeight > 210)) {
      setPhaseError('Target weight must be between 30 and 210 kg');
      return;
    }

    const isBodyFatTrackingEnabled = Boolean(userData.bodyFatTrackingEnabled);
    const targetBodyFat = isBodyFatTrackingEnabled
      ? parseNullablePhaseNumber(phaseDraft.targetBodyFat)
      : null;
    if (targetBodyFat != null && (targetBodyFat <= 0 || targetBodyFat >= 100)) {
      setPhaseError('Target body fat must be between 1 and 99%');
      return;
    }

    let resolvedGoalType = phaseGoalType;

    if (phaseCreationMode === 'target') {
      if (!phaseEndDate) {
        setPhaseError('Target mode requires an end date.');
        return;
      }

      if (targetWeight == null && targetBodyFat == null) {
        setPhaseError(
          isBodyFatTrackingEnabled
            ? 'Set a target weight or target body fat for target mode.'
            : 'Set a target weight for target mode.'
        );
        return;
      }

      const currentWeight = latestWeightEntry?.weight ?? userData.weight;
      const currentBodyFat = isBodyFatTrackingEnabled
        ? (latestBodyFatEntry?.bodyFat ?? null)
        : null;

      const targetPlan = estimateRequiredDailyEnergyDelta({
        startDate: phaseStartDate,
        endDate: phaseEndDate,
        startWeightKg: currentWeight,
        targetWeightKg: targetWeight,
        startBodyFatPercent: currentBodyFat,
        targetBodyFatPercent: targetBodyFat,
      });

      if (!targetPlan) {
        setPhaseError(
          'Unable to evaluate this target plan. Check your target values and date range.'
        );
        return;
      }

      if (targetPlan.aggressivenessBand === 'blocked') {
        setPhaseError(
          'Selected target/date pair is too aggressive. Choose a less aggressive pace or a longer timeline.'
        );
        return;
      }

      resolvedGoalType = targetPlan.recommendedGoalType;
    }

    if (
      phaseCreationMode === 'goal' &&
      !Object.prototype.hasOwnProperty.call(goals, phaseGoalType)
    ) {
      setPhaseError('Please select a valid goal.');
      return;
    }

    // Create phase
    createPhase({
      name: phaseName.trim(),
      startDate: phaseStartDate,
      endDate:
        phaseCreationMode === 'target' ? phaseEndDate : phaseEndDate || null,
      goalType: resolvedGoalType,
      creationMode: phaseCreationMode,
      targetWeight,
      targetBodyFat,
    });

    setPhaseError('');
    phaseCreationModal.requestClose();
  }, [
    createPhase,
    latestBodyFatEntry?.bodyFat,
    latestWeightEntry?.weight,
    phaseCreationModal,
    phaseDraft,
    userData.bodyFatTrackingEnabled,
    userData.weight,
  ]);

  const handleTemplateSelect = useCallback(
    (template) => {
      if (!template) return;

      const today = new Date();
      const startDate = getTodayDateKey();

      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() + template.suggestedDuration);

      let targetWeight = '';
      const currentWeight = latestWeightEntry?.weight ?? userData.weight;
      if (currentWeight && template.targetWeightChange !== 0) {
        const calculated = currentWeight + template.targetWeightChange;
        targetWeight = String(Math.max(30, Math.min(210, calculated)));
      }

      setPhaseDraft((prev) => ({
        ...prev,
        name: template.defaultName,
        creationMode: template.creationMode === 'goal' ? 'goal' : 'target',
        startDate,
        endDate: formatDateKeyUtc(endDate),
        goalType: template.goalType,
        targetWeight,
        targetBodyFat: '',
      }));
      setPhaseError('');
    },
    [latestWeightEntry, userData.weight]
  );

  const handlePhaseClick = useCallback((phase) => {
    setSelectedPhase(phase);
  }, []);

  const handleBackToLogbook = useCallback(() => {
    setSelectedPhase(null);
  }, []);

  // Daily log handlers (reference-based)
  const openDailyLogModal = useCallback(
    (date = null) => {
      const targetDate = date || getTodayDateString();
      setDailyLogDate(targetDate);
      setDailyLogWeightRef('');
      setDailyLogBodyFatRef('');
      setDailyLogNutritionRef(
        hasNutritionEntriesForDate(nutritionData, targetDate) ? targetDate : ''
      );
      setDailyLogNotes('');
      setDailyLogCompleted(false);
      setDailyLogMode('add');
      setDailyLogError('');
      setDailyLogDateLocked(false);
      dailyLogModal.open();
    },
    [dailyLogModal, nutritionData]
  );

  const openEditDailyLogModal = useCallback(
    (log) => {
      if (!log) return;

      setDailyLogDate(log.date);
      setDailyLogWeightRef(log.weightRef || '');
      setDailyLogBodyFatRef(log.bodyFatRef || '');
      setDailyLogNutritionRef(
        log.nutritionRef ||
          (hasNutritionEntriesForDate(nutritionData, log.date) ? log.date : '')
      );
      setDailyLogNotes(log.notes || '');
      setDailyLogCompleted(log.completed || false);
      setDailyLogMode('edit');
      setDailyLogError('');
      setDailyLogDateLocked(true);
      dailyLogModal.open();
    },
    [dailyLogModal, nutritionData]
  );

  const handleDailyLogSave = useCallback(() => {
    if (!selectedPhase) {
      setDailyLogError('No phase selected');
      return;
    }

    // Validate date
    if (!dailyLogDate) {
      setDailyLogError('Please select a date');
      return;
    }

    // Auto-set entry references to matching date where available
    const matchingWeight = weightEntries.find(
      (entry) => entry.date === dailyLogDate
    );
    const matchingBodyFat = bodyFatEntries.find(
      (entry) => entry.date === dailyLogDate
    );

    const finalWeightRef = matchingWeight
      ? matchingWeight.date
      : dailyLogWeightRef || null;
    const finalBodyFatRef = matchingBodyFat
      ? matchingBodyFat.date
      : dailyLogBodyFatRef || null;
    const finalNutritionRef = hasNutritionEntriesForDate(
      nutritionData,
      dailyLogDate
    )
      ? dailyLogDate
      : dailyLogNutritionRef || null;

    // Build log data with references
    const logData = {
      weightRef: finalWeightRef,
      bodyFatRef: finalBodyFatRef,
      nutritionRef: finalNutritionRef,
      notes: dailyLogNotes.trim(),
      completed: dailyLogCompleted,
    };

    if (dailyLogMode === 'add') {
      addDailyLog(selectedPhase.id, dailyLogDate, logData);
    } else {
      updateDailyLog(selectedPhase.id, dailyLogDate, logData);
    }

    setDailyLogError('');
    dailyLogModal.requestClose();
  }, [
    addDailyLog,
    bodyFatEntries,
    dailyLogBodyFatRef,
    dailyLogCompleted,
    dailyLogDate,
    dailyLogModal,
    dailyLogMode,
    dailyLogNotes,
    dailyLogWeightRef,
    dailyLogNutritionRef,
    selectedPhase,
    updateDailyLog,
    weightEntries,
    nutritionData,
  ]);

  const handleManageDailyLogNutrition = useCallback(() => {
    setTrackerSelectedDate(dailyLogDate || getTodayDateString());
    dailyLogModal.requestClose();
    if (trackerIndex >= 0) {
      goToScreen(trackerIndex);
    }
  }, [dailyLogDate, dailyLogModal, goToScreen]);

  const handleDailyLogDelete = useCallback(() => {
    if (!selectedPhase || !dailyLogDate) {
      dailyLogModal.requestClose();
      return;
    }

    deleteDailyLog(selectedPhase.id, dailyLogDate);
    dailyLogModal.requestClose();
  }, [dailyLogDate, dailyLogModal, deleteDailyLog, selectedPhase]);

  // Phase insights handlers
  // Phase insights modal removed

  const handleExportPhase = useCallback(
    (format = 'csv') => {
      if (!selectedPhase) return;

      if (format === 'json') {
        exportPhaseAsJSON(selectedPhase, weightEntries, nutritionData);
      } else {
        exportPhaseAsCSV(selectedPhase, weightEntries, nutritionData);
      }
    },
    [nutritionData, selectedPhase, weightEntries]
  );

  // Phase archive/delete handlers
  const handleArchivePhase = useCallback(() => {
    if (!selectedPhase) return;

    setConfirmActionTitle('Archive Phase');
    setConfirmActionDescription(
      `Are you sure you want to archive "${selectedPhase.name}"? You can still view it later, but it will be moved to completed phases.`
    );
    setConfirmActionLabel('Archive');
    setConfirmActionTone('success');
    setConfirmActionCallback(() => () => {
      archivePhase(selectedPhase.id);
      setSelectedPhase(null);
    });
    confirmActionModal.open();
  }, [selectedPhase, archivePhase, confirmActionModal]);

  const handleDeletePhase = useCallback(() => {
    if (!selectedPhase) return;

    setConfirmActionTitle('Delete Phase');
    setConfirmActionDescription(
      `Are you sure you want to permanently delete "${selectedPhase.name}"? This will remove all daily logs and cannot be undone.`
    );
    setConfirmActionLabel('Delete');
    setConfirmActionTone('danger');
    setConfirmActionCallback(() => () => {
      deletePhase(selectedPhase.id);
      setSelectedPhase(null);
    });
    confirmActionModal.open();
  }, [selectedPhase, deletePhase, confirmActionModal]);

  useEffect(() => {
    if (!dailyLogModal.isOpen && !dailyLogModal.isClosing) {
      setDailyLogDate(getTodayDateString());
      setDailyLogWeightRef('');
      setDailyLogBodyFatRef('');
      setDailyLogNutritionRef('');
      setDailyLogNotes('');
      setDailyLogCompleted(false);
      setDailyLogMode('add');
      setDailyLogError('');
      setDailyLogDateLocked(false);
    }
  }, [dailyLogModal.isClosing, dailyLogModal.isOpen]);

  useEffect(() => {
    if (!phaseCreationModal.isOpen && !phaseCreationModal.isClosing) {
      setPhaseDraft(createDefaultPhaseDraft());
      setPhaseError('');
    }
  }, [phaseCreationModal.isClosing, phaseCreationModal.isOpen]);

  // Sync selectedPhase with phases array to keep it up-to-date
  useEffect(() => {
    if (selectedPhase) {
      const updatedPhase = phases.find((p) => p.id === selectedPhase.id);
      if (updatedPhase) {
        setSelectedPhase(updatedPhase);
      }
    }
  }, [phases, selectedPhase?.id, selectedPhase]);

  useEffect(() => {
    if (!cardioModal.isOpen && !cardioModal.isClosing) {
      setCardioDraft(
        getDefaultCardioSessionForType(
          userData?.lastSelectedCardioType,
          cardioTypes
        )
      );
      setEditingCardioId(null);
      setCardioModalMode('add');
    }
  }, [
    cardioModal.isClosing,
    cardioModal.isOpen,
    cardioTypes,
    userData?.lastSelectedCardioType,
  ]);

  useEffect(() => {
    if (
      !cardioFavouriteEditorModal.isOpen &&
      !cardioFavouriteEditorModal.isClosing
    ) {
      setFavouriteDraft(
        getDefaultCardioSessionForType(
          userData?.lastSelectedCardioType,
          cardioTypes
        )
      );
    }
  }, [
    cardioFavouriteEditorModal.isClosing,
    cardioFavouriteEditorModal.isOpen,
    cardioTypes,
    userData?.lastSelectedCardioType,
  ]);

  const hasCardioSessions = userData.cardioSessions.some(
    (session) => normalizeDateKey(session?.date) === getTodayDateString()
  );
  const activityPresets = useMemo(
    () => ({
      training: userData.activityPresets?.training ?? 'default',
      rest: userData.activityPresets?.rest ?? 'default',
    }),
    [userData.activityPresets]
  );

  const activityMultipliers = useMemo(
    () => ({
      training:
        userData.activityMultipliers?.training ??
        DEFAULT_ACTIVITY_MULTIPLIERS.training,
      rest:
        userData.activityMultipliers?.rest ?? DEFAULT_ACTIVITY_MULTIPLIERS.rest,
    }),
    [userData.activityMultipliers]
  );

  const showFavouritesButton =
    cardioModalMode !== 'edit' && !cardioFavouriteEditorModal.isOpen;

  if (!isLoaded) {
    return (
      <div
        className="min-h-screen bg-gradient-to-br from-background via-surface to-background p-4 md:p-6 flex items-center justify-center"
        style={{
          paddingTop: 'calc(1rem + var(--sat))',
          paddingBottom: 'calc(1rem + var(--sab))',
          paddingLeft: 'calc(1rem + var(--sal))',
          paddingRight: 'calc(1rem + var(--sar))',
        }}
      >
        <div className="flex flex-col items-center gap-3 text-muted">
          <div className="h-10 w-10 rounded-full border-2 border-accent-blue border-t-transparent animate-spin" />
          <p className="text-sm">Loading your data…</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-background via-surface to-background p-4 md:p-6"
      style={{
        paddingTop: 'calc(1rem + var(--sat))',
        paddingBottom: 'calc(1rem + var(--sab))',
        paddingLeft: 'calc(1rem + var(--sal))',
        paddingRight: 'calc(1rem + var(--sar))',
      }}
    >
      {/* Status bar vignette overlay */}
      <div
        className={`status-bar-vignette ${isAnyModalOpen ? 'hidden' : ''}`}
        aria-hidden="true"
      />

      <AnimatePresence>
        {showExitHint && !isAnyModalOpen ? (
          <motion.div
            key="exit-hint"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            className="fixed inset-x-0 z-[1300] flex justify-center pointer-events-none"
            style={{ bottom: 'calc(var(--sab) + 1.75rem)' }}
            role="status"
            aria-live="polite"
          >
            <div className="rounded-full border border-border bg-surface/95 px-4 py-2 text-sm text-foreground shadow-xl backdrop-blur-sm">
              Swipe or tap again to exit
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Floating ScreenTabs - appears when original tabs scroll off screen */}
      <FloatingScreenTabs
        tabs={screenTabs}
        currentScreen={currentScreen}
        onSelect={goToScreen}
        isVisible={isTabsOffScreen}
      />

      <div className="max-w-6xl mx-auto space-y-6">
        <div className="relative">
          <ScreenTabs
            ref={screenTabsRef}
            tabs={screenTabs}
            currentScreen={currentScreen}
            onSelect={goToScreen}
          />

          <div
            ref={viewportRef}
            className={`overflow-hidden touch-pan-y ${isSwiping ? 'cursor-grabbing' : 'cursor-grab'}`}
            {...handlers}
          >
            <div
              ref={setSliderElement}
              className="flex w-full"
              style={{
                ...sliderStyle,
                willChange: isSwiping ? 'transform' : 'auto',
                backfaceVisibility: 'hidden',
              }}
            >
              <div className="w-full flex-shrink-0 px-2 sm:px-4 md:px-6">
                <div className="relative overflow-hidden">
                  <AnimatePresence mode="wait" initial={false}>
                    {selectedPhase ? (
                      <motion.div
                        key="phase-detail"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{
                          duration: 0.25,
                          ease: [0.4, 0, 0.2, 1],
                        }}
                      >
                        <PhaseDetailScreen
                          phase={selectedPhase}
                          weightEntries={weightEntries}
                          nutritionData={nutritionData}
                          onBack={handleBackToLogbook}
                          onAddLog={openDailyLogModal}
                          onEditLog={openEditDailyLogModal}
                          // onViewInsights removed
                          onExport={() => handleExportPhase('csv')}
                          onArchive={handleArchivePhase}
                          onDelete={handleDeletePhase}
                        />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="logbook"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{
                          duration: 0.25,
                          ease: [0.4, 0, 0.2, 1],
                        }}
                      >
                        <LogbookScreen
                          phases={phases}
                          weightEntries={weightEntries}
                          nutritionData={nutritionData}
                          onCreatePhase={openPhaseCreationModal}
                          onPhaseClick={handlePhaseClick}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <div className="w-full flex-shrink-0 px-2 sm:px-4 md:px-6">
                <TrackerScreen
                  nutritionData={nutritionData}
                  onAddMealEntry={startMealEntryFlow}
                  onAddFoodToMeal={openFoodSearchForMeal}
                  onEditFoodEntry={handleEditFoodEntry}
                  onDeleteFoodEntry={deleteFoodEntry}
                  onDeleteMeal={deleteMeal}
                  macroRecommendationSplit={userData.macroRecommendationSplit}
                  calendarModal={calendarPickerModal}
                  selectedDate={trackerSelectedDate}
                  onSelectedDateChange={setTrackerSelectedDate}
                  calorieTargetLabel={selectedCalorieTargetData.label}
                  calorieTargetCalories={
                    selectedCalorieTargetData.targetCalories
                  }
                  onOpenCalorieTargetModal={openCalorieTargetPicker}
                  isSwiping={isSwiping}
                />
              </div>

              <div className="w-full flex-shrink-0 px-2 sm:px-4 md:px-6">
                <HomeScreen
                  userData={userData}
                  bmr={bmr}
                  goals={goals}
                  selectedGoal={selectedGoal}
                  isGoalLocked={isGoalLockedByActivePhase}
                  goalLockPhaseName={activePhase?.name ?? ''}
                  onGoalClick={openGoalModal}
                  onSettingsClick={settingsModal.open}
                  onBodyFatClick={openBodyFatTracker}
                  onHeightClick={openHeightModal}
                  onWeightClick={openWeightTracker}
                  weightDisplay={weightDisplay}
                  bodyFatDisplay={bodyFatDisplay}
                  weightButtonLabel={weightPrimaryActionLabel}
                  weightButtonSubtitle={weightButtonSubtitle}
                  onBmrClick={bmrModal.open}
                  selectedDay={selectedDay}
                  onTrainingDayClick={handleTrainingDayClick}
                  onRestDayClick={handleRestDayClick}
                  trainingCalories={trainingCalories}
                  trainingSessions={trainingSessions}
                  trainingTypes={trainingTypes}
                  cardioTypes={cardioTypes}
                  hasCardioSessions={hasCardioSessions}
                  onAddCardioClick={openCardioModal}
                  onEditCardioSession={handleEditCardioSession}
                  cardioSessions={userData.cardioSessions}
                  calculateCardioCalories={calculateCardioSessionCalories}
                  onRemoveCardioSession={handleRemoveCardioSession}
                  totalCardioBurn={totalCardioBurn}
                  isSwiping={isSwiping}
                />
              </div>

              <div className="w-full flex-shrink-0 px-2 sm:px-4 md:px-6">
                <CalorieMapScreen
                  stepRanges={userData.stepRanges}
                  selectedGoal={selectedGoal}
                  selectedDay={selectedDay}
                  goals={goals}
                  onManageStepRanges={stepRangesModal.open}
                  onOpenBreakdown={openCalorieBreakdown}
                  getRangeDetails={getRangeDetails}
                  isSelectedRange={isSelectedRange}
                  liveStepData={liveStepData}
                  healthConnectStatus={healthConnect.status}
                  healthConnectLoading={healthConnect.isLoading}
                  healthConnectError={healthConnect.error}
                  onConnectHealth={healthConnect.connect}
                  onRefreshSteps={healthConnect.refresh}
                  onOpenStepTracker={openStepTracker}
                />
              </div>

              <div className="w-full flex-shrink-0 px-2 sm:px-4 md:px-6">
                <InsightsScreen
                  userData={userData}
                  selectedGoal={selectedGoal}
                  weightEntries={weightEntries}
                  onOpenWeightTracker={openWeightTracker}
                  bodyFatEntries={bodyFatEntries}
                  bodyFatTrackingEnabled={userData.bodyFatTrackingEnabled}
                  onOpenBodyFatTracker={openBodyFatTracker}
                  onOpenBmiInfo={bmiModal.open}
                  onOpenFfmiInfo={ffmiModal.open}
                  targetCalories={
                    selectedCalorieTargetData.targetCalories ?? 2500
                  }
                  onOpenMacroPicker={openMacroPickerModal}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {(calorieBreakdownModal.isOpen || calorieBreakdownModal.isClosing) && (
        <Suspense fallback={null}>
          <CalorieBreakdownModal
            isOpen={calorieBreakdownModal.isOpen}
            isClosing={calorieBreakdownModal.isClosing}
            stepRange={selectedBreakdownRequest?.steps ?? null}
            selectedDay={selectedDay}
            selectedGoal={selectedGoal}
            goals={goals}
            breakdown={selectedRangeData?.breakdown ?? null}
            targetCalories={selectedRangeData?.targetCalories ?? null}
            difference={selectedRangeData?.difference ?? null}
            onOpenBmrInfo={bmrModal.open}
            onOpenTefInfo={tefInfoModal.open}
            onOpenAdaptiveThermogenesisInfo={
              adaptiveThermogenesisInfoModal.open
            }
            onOpenEpocInfo={epocInfoModal.open}
            onClose={closeCalorieBreakdown}
          />
        </Suspense>
      )}

      <GoalModal
        isOpen={goalModal.isOpen}
        isClosing={goalModal.isClosing}
        goals={goals}
        tempSelectedGoal={tempSelectedGoal}
        onSelect={setTempSelectedGoal}
        onCancel={goalModal.requestClose}
        onSave={handleGoalSave}
      />

      <BmrInfoModal
        isOpen={bmrModal.isOpen}
        isClosing={bmrModal.isClosing}
        userData={userData}
        bmr={bmr}
        onClose={bmrModal.requestClose}
      />

      <TefInfoModal
        isOpen={tefInfoModal.isOpen}
        isClosing={tefInfoModal.isClosing}
        onClose={tefInfoModal.requestClose}
      />

      <AdaptiveThermogenesisInfoModal
        isOpen={adaptiveThermogenesisInfoModal.isOpen}
        isClosing={adaptiveThermogenesisInfoModal.isClosing}
        onClose={adaptiveThermogenesisInfoModal.requestClose}
      />

      <EpocInfoModal
        isOpen={epocInfoModal.isOpen}
        isClosing={epocInfoModal.isClosing}
        onClose={epocInfoModal.requestClose}
      />

      <BmiInfoModal
        isOpen={bmiModal.isOpen}
        isClosing={bmiModal.isClosing}
        userData={userData}
        onClose={bmiModal.requestClose}
      />

      <FfmiInfoModal
        isOpen={ffmiModal.isOpen}
        isClosing={ffmiModal.isClosing}
        userData={userData}
        onClose={ffmiModal.requestClose}
      />

      <AgePickerModal
        isOpen={ageModal.isOpen}
        isClosing={ageModal.isClosing}
        value={tempAge}
        onChange={setTempAge}
        onCancel={ageModal.requestClose}
        onSave={handleAgeSave}
      />

      <HeightPickerModal
        isOpen={heightModal.isOpen}
        isClosing={heightModal.isClosing}
        value={tempHeight}
        onChange={setTempHeight}
        onCancel={heightModal.requestClose}
        onSave={handleHeightSave}
      />

      {(weightTrackerModal.isOpen || weightTrackerModal.isClosing) && (
        <Suspense fallback={null}>
          <WeightTrackerModal
            isOpen={weightTrackerModal.isOpen}
            isClosing={weightTrackerModal.isClosing}
            entries={weightEntries}
            latestWeight={userData.weight}
            selectedGoal={selectedGoal}
            onClose={weightTrackerModal.requestClose}
            onAddEntry={openAddWeightEntryModal}
            onEditEntry={handleWeightEntryFromListEdit}
            canSwitchToBodyFat={userData.bodyFatTrackingEnabled}
            onSwitchToBodyFat={handleSwitchToBodyFat}
          />
        </Suspense>
      )}

      {userData.bodyFatTrackingEnabled &&
        (bodyFatTrackerModal.isOpen || bodyFatTrackerModal.isClosing) && (
          <Suspense fallback={null}>
            <BodyFatTrackerModal
              isOpen={bodyFatTrackerModal.isOpen}
              isClosing={bodyFatTrackerModal.isClosing}
              entries={bodyFatEntries}
              latestBodyFat={latestBodyFatEntry?.bodyFat}
              selectedGoal={selectedGoal}
              onClose={bodyFatTrackerModal.requestClose}
              onAddEntry={openAddBodyFatEntryModal}
              onEditEntry={handleBodyFatEntryFromListEdit}
              onSwitchToWeight={handleSwitchToWeight}
            />
          </Suspense>
        )}

      {(stepTrackerModal.isOpen || stepTrackerModal.isClosing) && (
        <Suspense fallback={null}>
          <StepTrackerModal
            isOpen={stepTrackerModal.isOpen}
            isClosing={stepTrackerModal.isClosing}
            entries={stepEntries}
            todaySteps={healthConnect.steps}
            stepGoal={stepGoal}
            onClose={stepTrackerModal.requestClose}
            onSetGoal={openStepGoalPicker}
          />
        </Suspense>
      )}

      <StepGoalPickerModal
        isOpen={stepGoalPickerModal.isOpen}
        isClosing={stepGoalPickerModal.isClosing}
        value={stepGoal}
        onCancel={stepGoalPickerModal.requestClose}
        onSave={handleStepGoalSave}
      />

      <MacroPickerModal
        isOpen={macroPickerModal.isOpen}
        isClosing={macroPickerModal.isClosing}
        value={tempMacroRecommendationSplit}
        onChange={handleMacroPickerChange}
        targetCalories={selectedCalorieTargetData.targetCalories ?? 2500}
        userData={userData}
        targetLabel={selectedCalorieTargetData.label}
        onOpenCalorieTargetModal={openCalorieTargetPicker}
        onCancel={macroPickerModal.requestClose}
        onSave={handleMacroPickerSave}
      />

      <CalorieTargetModal
        isOpen={calorieTargetModal.isOpen}
        isClosing={calorieTargetModal.isClosing}
        onClose={calorieTargetModal.requestClose}
        options={calorieTargetOptions}
        selectedKey={selectedCalorieTargetData.key}
        onSelect={handleCalorieTargetSelect}
        selectedGoal={selectedGoal}
        selectedDay={selectedDay}
        goals={goals}
      />

      <TimePickerModal
        isOpen={timePickerModal.isOpen}
        isClosing={timePickerModal.isClosing}
        title="Select Time"
        value={tempTimePickerValue}
        onCancel={handleTimePickerCancel}
        onSave={handleTimePickerSave}
      />

      <EpocWindowPickerModal
        isOpen={epocWindowPickerModal.isOpen}
        isClosing={epocWindowPickerModal.isClosing}
        title="Carryover Window"
        value={tempEpocWindowValue}
        min={1}
        max={24}
        unitLabel="Hours"
        onCancel={handleEpocWindowCancel}
        onSave={handleEpocWindowSave}
      />

      <NumericValuePickerModal
        isOpen={foodNutrientPickerModal.isOpen}
        isClosing={foodNutrientPickerModal.isClosing}
        title={foodNutrientPickerConfig?.title ?? 'Select Value'}
        value={foodNutrientPickerConfig?.value ?? 0}
        min={foodNutrientPickerConfig?.min ?? 0}
        max={foodNutrientPickerConfig?.max ?? 100}
        step={foodNutrientPickerConfig?.step ?? 1}
        unitLabel={foodNutrientPickerConfig?.unitLabel ?? ''}
        onCancel={handleFoodNutrientPickerCancel}
        onSave={handleFoodNutrientPickerSave}
      />

      <WeightEntryModal
        isOpen={weightEntryModal.isOpen}
        isClosing={weightEntryModal.isClosing}
        mode={weightEntryMode}
        date={weightEntryDraft.date}
        weight={weightEntryDraft.weight}
        isDateLocked={isWeightDateLocked}
        error={weightEntryError}
        onDateChange={handleWeightEntryDateChange}
        onRequestWeightPicker={openWeightPicker}
        onCancel={weightEntryModal.requestClose}
        onSave={handleWeightEntrySave}
        onDelete={
          weightEntryMode === 'edit' ? handleWeightEntryDelete : undefined
        }
      />

      {userData.bodyFatTrackingEnabled && (
        <BodyFatEntryModal
          isOpen={bodyFatEntryModal.isOpen}
          isClosing={bodyFatEntryModal.isClosing}
          mode={bodyFatEntryMode}
          date={bodyFatEntryDraft.date}
          bodyFat={bodyFatEntryDraft.bodyFat}
          isDateLocked={isBodyFatDateLocked}
          error={bodyFatEntryError}
          onDateChange={handleBodyFatEntryDateChange}
          onRequestBodyFatPicker={openBodyFatPicker}
          onCancel={bodyFatEntryModal.requestClose}
          onSave={handleBodyFatEntrySave}
          onDelete={
            bodyFatEntryMode === 'edit' ? handleBodyFatEntryDelete : undefined
          }
        />
      )}

      <WeightPickerModal
        isOpen={weightPickerModal.isOpen}
        isClosing={weightPickerModal.isClosing}
        value={weightPickerValue}
        onChange={handleWeightPickerChange}
        onCancel={handleWeightPickerCancel}
        onSave={handleWeightPickerSave}
      />

      {userData.bodyFatTrackingEnabled && (
        <BodyFatPickerModal
          isOpen={bodyFatPickerModal.isOpen}
          isClosing={bodyFatPickerModal.isClosing}
          value={bodyFatPickerValue}
          onChange={handleBodyFatPickerChange}
          onCancel={handleBodyFatPickerCancel}
          onSave={handleBodyFatPickerSave}
        />
      )}

      <TrainingTypeEditorModal
        isOpen={trainingTypeEditorModal.isOpen}
        isClosing={trainingTypeEditorModal.isClosing}
        typeKey={editingTrainingType}
        name={tempPresetName}
        calories={tempPresetCalories}
        onNameChange={setTempPresetName}
        onCaloriesChange={setTempPresetCalories}
        onCancel={closeTrainingTypeEditor}
        onSave={handleTrainingPresetSave}
      />

      {(settingsModal.isOpen || settingsModal.isClosing) && (
        <Suspense fallback={null}>
          <SettingsModal
            isOpen={settingsModal.isOpen}
            isClosing={settingsModal.isClosing}
            userData={userData}
            weightEntries={weightEntries}
            bodyFatEntries={bodyFatEntries}
            bodyFatTrackingEnabled={userData.bodyFatTrackingEnabled}
            bmr={bmr}
            actions={{
              onFieldChange: handleUserDataChange,
              openers: {
                agePicker: openAgeModal,
                heightPicker: openHeightModal,
                manageWeight: openWeightTracker,
                manageBodyFat: openBodyFatTracker,
                dailyActivity: openDailyActivitySettings,
                epocWindowPicker: openEpocWindowPickerModal,
              },
              info: {
                tef: tefInfoModal.open,
                adaptiveThermogenesis: adaptiveThermogenesisInfoModal.open,
                epoc: epocInfoModal.open,
              },
              lifecycle: {
                cancel: settingsModal.requestClose,
                save: handleSettingsSave,
              },
            }}
          />
        </Suspense>
      )}

      <DailyActivityModal
        isOpen={dailyActivityModal.isOpen}
        isClosing={dailyActivityModal.isClosing}
        activityPresets={activityPresets}
        activityMultipliers={activityMultipliers}
        onSelectDay={openDailyActivityEditor}
        onClose={handleDailyActivityModalClose}
      />

      <DailyActivityEditorModal
        isOpen={dailyActivityEditorModal.isOpen}
        isClosing={dailyActivityEditorModal.isClosing}
        dayType={activityEditorDay}
        currentPreset={
          activityEditorDay ? activityPresets[activityEditorDay] : 'default'
        }
        currentMultiplier={
          activityEditorDay ? activityMultipliers[activityEditorDay] : undefined
        }
        onSelectPreset={handleDailyActivityPresetSelect}
        onSelectCustom={handleDailyActivityCustomSelect}
        onClose={closeDailyActivityEditor}
      />

      <DailyActivityCustomModal
        isOpen={dailyActivityCustomModal.isOpen}
        isClosing={dailyActivityCustomModal.isClosing}
        dayType={activityEditorDay}
        value={customActivityPercent}
        onCancel={handleCustomActivityCancel}
        onSave={handleCustomActivitySave}
      />

      <StepRangesModal
        isOpen={stepRangesModal.isOpen}
        isClosing={stepRangesModal.isClosing}
        stepRanges={userData.stepRanges}
        newStepRange={newStepRange}
        onNewStepRangeChange={setNewStepRange}
        onAddRange={handleAddStepRange}
        onRemoveRange={removeStepRange}
        onClose={stepRangesModal.requestClose}
      />

      {(trainingModal.isOpen || trainingModal.isClosing) && (
        <Suspense fallback={null}>
          <TrainingModal
            isOpen={trainingModal.isOpen}
            isClosing={trainingModal.isClosing}
            mode={trainingModalMode}
            trainingTypes={trainingTypes}
            tempTrainingType={tempTrainingType}
            tempTrainingDuration={tempTrainingDuration}
            tempTrainingEffortType={tempTrainingEffortType}
            tempTrainingIntensity={tempTrainingIntensity}
            tempTrainingHeartRate={tempTrainingHeartRate}
            tempTrainingStartTime={tempTrainingStartTime}
            onTrainingTypeSelect={setTempTrainingType}
            onEditTrainingType={openTrainingTypeEditor}
            onDurationClick={() =>
              openDurationPicker(tempTrainingDuration, setTempTrainingDuration)
            }
            onEffortTypeChange={handleTrainingEffortTypeChange}
            onIntensityChange={handleTrainingIntensityChange}
            onHeartRateChange={handleTrainingHeartRateChange}
            onStartTimePickerClick={openTrainingStartTimePicker}
            onCancel={trainingModal.requestClose}
            onSave={handleTrainingSave}
          />
        </Suspense>
      )}

      <DurationPickerModal
        isOpen={durationPickerModal.isOpen}
        isClosing={durationPickerModal.isClosing}
        mode="hours"
        title={durationPickerTitle}
        initialDuration={durationPickerValue}
        onCancel={handleDurationPickerCancel}
        onSave={handleDurationPickerSave}
      />

      {(cardioModal.isOpen || cardioModal.isClosing) && (
        <Suspense fallback={null}>
          <CardioModal
            isOpen={cardioModal.isOpen}
            isClosing={cardioModal.isClosing}
            cardioTypes={cardioTypes}
            customCardioTypes={customCardioTypes}
            onAddCustomCardioType={addCustomCardioType}
            onDeleteCustomCardioType={removeCustomCardioType}
            session={cardioDraft}
            onChange={handleCardioDraftChange}
            onCancel={cardioModal.requestClose}
            onSave={handleCardioSave}
            userWeight={userData.weight}
            userAge={userData.age}
            userGender={userData.gender}
            onOpenFavourites={handleOpenCardioFavourites}
            onStartTimePickerClick={openCardioStartTimePicker}
            showFavouritesButton={showFavouritesButton}
            isEditing={cardioModalMode === 'edit'}
          />
        </Suspense>
      )}

      <CardioFavouritesModal
        isOpen={cardioFavouritesModal.isOpen}
        isClosing={cardioFavouritesModal.isClosing}
        favourites={cardioFavourites}
        cardioTypes={cardioTypes}
        currentSession={cardioDraft}
        onSelectFavourite={handleApplyFavourite}
        onCreateFavourite={handleCreateFavourite}
        onDeleteFavourite={handleRemoveFavourite}
        onClose={cardioFavouritesModal.requestClose}
        calculateCardioCalories={calculateCardioSessionCalories}
      />

      {(cardioFavouriteEditorModal.isOpen ||
        cardioFavouriteEditorModal.isClosing) && (
        <Suspense fallback={null}>
          <CardioModal
            isOpen={cardioFavouriteEditorModal.isOpen}
            isClosing={cardioFavouriteEditorModal.isClosing}
            cardioTypes={cardioTypes}
            customCardioTypes={customCardioTypes}
            onAddCustomCardioType={addCustomCardioType}
            onDeleteCustomCardioType={removeCustomCardioType}
            session={favouriteDraft}
            onChange={handleFavouriteDraftChange}
            onCancel={cardioFavouriteEditorModal.requestClose}
            onSave={handleFavouriteSave}
            userWeight={userData.weight}
            userAge={userData.age}
            userGender={userData.gender}
            onStartTimePickerClick={openFavouriteCardioStartTimePicker}
            showFavouritesButton={false}
            mode="favourite"
            isEditing={false}
          />
        </Suspense>
      )}

      {(phaseCreationModal.isOpen || phaseCreationModal.isClosing) && (
        <Suspense fallback={null}>
          <PhaseCreationModal
            isOpen={phaseCreationModal.isOpen}
            isClosing={phaseCreationModal.isClosing}
            phaseName={phaseDraft.name}
            creationMode={phaseDraft.creationMode}
            startDate={phaseDraft.startDate}
            endDate={phaseDraft.endDate}
            goalType={phaseDraft.goalType}
            targetWeight={phaseDraft.targetWeight}
            targetBodyFat={phaseDraft.targetBodyFat}
            currentWeight={latestWeightEntry?.weight || userData.weight}
            currentBodyFat={latestBodyFatEntry?.bodyFat ?? null}
            bodyFatTrackingEnabled={userData.bodyFatTrackingEnabled}
            onNameChange={(value) => setPhaseDraftField('name', value)}
            onCreationModeChange={setPhaseCreationMode}
            onStartDateChange={(value) =>
              setPhaseDraftField('startDate', value)
            }
            onEndDateChange={(value) => setPhaseDraftField('endDate', value)}
            onGoalTypeChange={(value) => setPhaseDraftField('goalType', value)}
            onTargetWeightChange={(value) =>
              setPhaseDraftField('targetWeight', value)
            }
            onTargetBodyFatChange={(value) =>
              setPhaseDraftField('targetBodyFat', value)
            }
            onTemplatesClick={() => {
              templatePickerModal.open();
            }}
            onCancel={phaseCreationModal.requestClose}
            onSave={handlePhaseCreationSave}
            error={phaseError}
          />
        </Suspense>
      )}

      <TemplatePickerModal
        isOpen={templatePickerModal.isOpen}
        isClosing={templatePickerModal.isClosing}
        selectedMode={phaseDraft.creationMode}
        onSelectTemplate={(template) => {
          handleTemplateSelect(template);
          templatePickerModal.requestClose();
        }}
        onClose={templatePickerModal.requestClose}
      />

      {(dailyLogModal.isOpen || dailyLogModal.isClosing) && (
        <Suspense fallback={null}>
          <DailyLogModal
            isOpen={dailyLogModal.isOpen}
            isClosing={dailyLogModal.isClosing}
            mode={dailyLogMode}
            date={dailyLogDate}
            weightRef={dailyLogWeightRef}
            bodyFatRef={dailyLogBodyFatRef}
            nutritionRef={dailyLogNutritionRef}
            notes={dailyLogNotes}
            completed={dailyLogCompleted}
            availableWeightEntries={weightEntries}
            availableBodyFatEntries={bodyFatEntries}
            availableNutritionData={nutritionData}
            onDateChange={setDailyLogDate}
            onWeightRefChange={setDailyLogWeightRef}
            onBodyFatRefChange={setDailyLogBodyFatRef}
            onNutritionRefChange={setDailyLogNutritionRef}
            onNotesChange={setDailyLogNotes}
            onCompletedChange={setDailyLogCompleted}
            onManageWeightClick={weightTrackerModal.open}
            onManageBodyFatClick={
              userData.bodyFatTrackingEnabled
                ? bodyFatTrackerModal.open
                : undefined
            }
            onManageNutritionClick={handleManageDailyLogNutrition}
            bodyFatTrackingEnabled={userData.bodyFatTrackingEnabled}
            onCancel={dailyLogModal.requestClose}
            onSave={handleDailyLogSave}
            onDelete={
              dailyLogMode === 'edit' ? handleDailyLogDelete : undefined
            }
            error={dailyLogError}
            isDateLocked={dailyLogDateLocked}
          />
        </Suspense>
      )}

      <CalendarPickerModal
        isOpen={calendarPickerModal.isOpen}
        isClosing={calendarPickerModal.isClosing}
        onClose={calendarPickerModal.requestClose}
        onSelectDate={setTrackerSelectedDate}
        nutritionData={nutritionData}
        selectedDate={trackerSelectedDate}
        currentMonth={calendarMonth}
        currentYear={calendarYear}
        onMonthChange={(month, year) => {
          setCalendarMonth(month);
          setCalendarYear(year);
        }}
      />
      <FoodEntryModal
        isOpen={foodEntryModal.isOpen}
        isClosing={foodEntryModal.isClosing}
        onClose={foodEntryModal.requestClose}
        onSave={handleFoodEntrySave}
        onSaveAsFavourite={(favourite) => {
          addFoodFavourite(favourite);
        }}
        onCheckFoodExists={checkFoodExistsInFavourites}
        foodName={foodName}
        setFoodName={setFoodName}
        calories={foodCalories}
        protein={foodProtein}
        carbs={foodCarbs}
        fats={foodFats}
        onOpenCaloriesPicker={() => openFoodNutrientPicker('calories')}
        onOpenProteinPicker={() => openFoodNutrientPicker('protein')}
        onOpenCarbsPicker={() => openFoodNutrientPicker('carbs')}
        onOpenFatsPicker={() => openFoodNutrientPicker('fats')}
        smartTefEnabled={
          userData.smartTefEnabled &&
          (userData.smartTefFoodTefBurnEnabled ?? true)
        }
        isEditing={foodEntryMode === 'edit'}
      />

      <MealTypePickerModal
        isOpen={mealTypePickerModal.isOpen}
        isClosing={mealTypePickerModal.isClosing}
        onClose={mealTypePickerModal.requestClose}
        onSelect={handleMealTypeSelect}
        selectedMealType={foodMealType}
        mealTypeItemCounts={(() => {
          const dateData = nutritionData[trackerSelectedDate] || {};
          const counts = {};
          for (const mealTypeId of MEAL_TYPE_ORDER) {
            counts[mealTypeId] = Array.isArray(dateData[mealTypeId])
              ? dateData[mealTypeId].length
              : 0;
          }
          return counts;
        })()}
      />

      {(foodSearchModal.isOpen || foodSearchModal.isClosing) && (
        <Suspense fallback={null}>
          <FoodSearchModal
            isOpen={foodSearchModal.isOpen}
            isClosing={foodSearchModal.isClosing}
            onClose={handleFoodSearchCancel}
            onSelectFood={handleSelectFoodFromSearch}
            onOpenManualEntry={handleOpenManualEntry}
            favourites={foodFavourites}
            onSelectFavourite={handleSelectFoodFavourite}
            onEditFavourite={handleEditFoodFavourite}
            onDeleteFavourite={removeFoodFavourite}
            pinnedFoods={pinnedFoods}
            onTogglePin={togglePinnedFood}
            cachedFoods={cachedFoods}
            onUpdateCachedFoods={updateCachedFoods}
            customFoods={customFoods}
            onAddCustomFood={handleAddCustomFood}
            onSaveAsFavourite={handleCreateFoodFavourite}
            selectedMealType={foodMealType}
            mealNutritionEntries={
              Array.isArray(
                nutritionData?.[trackerSelectedDate]?.[foodMealType]
              )
                ? nutritionData[trackerSelectedDate][foodMealType]
                : []
            }
            onSwitchMealType={setFoodMealType}
            onEditMealEntry={handleEditFoodEntry}
            onDeleteMealEntry={handleDeleteFoodEntryFromSearch}
          />
        </Suspense>
      )}

      <FoodPortionModal
        isOpen={foodPortionModal.isOpen}
        isClosing={foodPortionModal.isClosing}
        onClose={foodPortionModal.requestClose}
        onAddFood={handleAddFoodFromPortion}
        onSaveAsFavourite={handleCreateFoodFavourite}
        selectedFood={selectedFoodForPortion}
        initialGrams={portionInitialGrams ?? undefined}
        smartTefEnabled={
          userData.smartTefEnabled &&
          (userData.smartTefFoodTefBurnEnabled ?? true)
        }
        isEditing={Boolean(editingPortionEntry)}
        isFoodFavourited={
          selectedFoodForPortion
            ? foodFavourites.some(
                (fav) =>
                  // Check by foodId first for database foods
                  (selectedFoodForPortion.id &&
                    fav.foodId === selectedFoodForPortion.id) ||
                  // Check by name for all foods (prevents duplicates)
                  fav.name?.toLowerCase() ===
                    selectedFoodForPortion.name?.toLowerCase()
              )
            : false
        }
      />

      {/* PhaseInsightsModal removed */}

      <ConfirmActionModal
        isOpen={confirmActionModal.isOpen}
        isClosing={confirmActionModal.isClosing}
        title={confirmActionTitle}
        description={confirmActionDescription}
        confirmLabel={confirmActionLabel}
        tone={confirmActionTone}
        onConfirm={handleConfirmAction}
        onCancel={handleCancelConfirmAction}
      />
    </div>
  );
};
