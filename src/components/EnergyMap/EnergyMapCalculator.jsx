import React, {
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
import { setLightStatusBar } from '../../native/statusBar';
import { shallow } from 'zustand/shallow';
import { goals } from '../../constants/goals';
import { DEFAULT_ACTIVITY_MULTIPLIERS } from '../../constants/activityPresets';
import { trainingTypes as presetTrainingTypes } from '../../constants/trainingTypes';
import {
  setupEnergyMapStore,
  useEnergyMapStore,
} from '../../store/useEnergyMapStore';
import { useSwipeableScreens } from '../../hooks/useSwipeableScreens';
import { useAnimatedModal } from '../../hooks/useAnimatedModal';
import {
  useHealthConnect,
  HealthConnectStatus,
} from '../../hooks/useHealthConnect';
import { loadSelectedDay, saveSelectedDay } from '../../utils/storage';
import { useScrollOffScreen } from '../../hooks/useScrollOffScreen';
import { ScreenTabs, FloatingScreenTabs } from './common/ScreenTabs';
import { LogbookScreen } from './screens/LogbookScreen';
import { TrackerScreen } from './screens/TrackerScreen';
import { HomeScreen } from './screens/HomeScreen';
import { CalorieMapScreen } from './screens/CalorieMapScreen';
import { InsightsScreen } from './screens/InsightsScreen';
import { PhaseDetailScreen } from './screens/PhaseDetailScreen';
import { GoalModal } from './modals/GoalModal';
import { BmrInfoModal } from './modals/BmrInfoModal';
import { BmiInfoModal } from './modals/BmiInfoModal';
import { FfmiInfoModal } from './modals/FfmiInfoModal';
import { AgePickerModal } from './modals/AgePickerModal';
import { MEAL_TYPE_ORDER } from '../../constants/mealTypes';
import { FOOD_DATABASE } from '../../constants/foodDatabase';
import { HeightPickerModal } from './modals/HeightPickerModal';
import { WeightPickerModal } from './modals/WeightPickerModal';
import { WeightEntryModal } from './modals/WeightEntryModal';
import { WeightTrackerModal } from './modals/WeightTrackerModal';
import { BodyFatTrackerModal } from './modals/BodyFatTrackerModal';
import { BodyFatEntryModal } from './modals/BodyFatEntryModal';
import { BodyFatPickerModal } from './modals/BodyFatPickerModal';
import { TrainingTypeModal } from './modals/TrainingTypeModal';
import { TrainingTypeEditorModal } from './modals/TrainingTypeEditorModal';
import { SettingsModal } from './modals/SettingsModal';
import { StepRangesModal } from './modals/StepRangesModal';
import { QuickTrainingModal } from './modals/QuickTrainingModal';
import { TrainingDurationPickerModal } from './modals/TrainingDurationPickerModal';
import { CardioModal } from './modals/CardioModal';
import { CardioFavouritesModal } from './modals/CardioFavouritesModal';
import { CalorieBreakdownModal } from './modals/CalorieBreakdownModal';
import { DailyActivityModal } from './modals/DailyActivityModal';
import { DailyActivityEditorModal } from './modals/DailyActivityEditorModal';
import { DailyActivityCustomModal } from './modals/DailyActivityCustomModal';
import { DailyActivityTierModal } from './modals/DailyActivityTierModal';
import { PhaseCreationModal } from './modals/PhaseCreationModal';
import { TemplatePickerModal } from './modals/TemplatePickerModal';
import { DailyLogModal } from './modals/DailyLogModal';
import { CalendarPickerModal } from './modals/CalendarPickerModal';
import { FoodEntryModal } from './modals/FoodEntryModal';
import { MealTypePickerModal } from './modals/MealTypePickerModal';
import { FoodSearchModal } from './modals/FoodSearchModal';
import { FoodPortionModal } from './modals/FoodPortionModal';
import { StepTrackerModal } from './modals/StepTrackerModal';
import { StepGoalPickerModal } from './modals/StepGoalPickerModal';
// ...existing code...
import { ConfirmActionModal } from './modals/ConfirmActionModal';
import {
  clampWeight,
  normalizeDateKey,
  formatWeight,
  formatDateLabel,
} from '../../utils/weight';
import { clampBodyFat } from '../../utils/bodyFat';
import { exportPhaseAsCSV, exportPhaseAsJSON } from '../../utils/export';

const MODAL_CLOSE_DELAY = 180; // Match CSS animation duration (150ms) + buffer
const screenTabs = [
  { key: 'logbook', label: 'Logbook', icon: ClipboardList },
  { key: 'tracker', label: 'Tracker', icon: Target },
  { key: 'home', label: 'Home', icon: Home },
  { key: 'calorie-map', label: 'Calorie Map', icon: Map },
  { key: 'insights', label: 'Insights', icon: BarChart3 },
];

const homeIndex = screenTabs.findIndex((tab) => tab.key === 'home');

const defaultCardioSession = {
  type: 'treadmill_walk',
  duration: 30,
  intensity: 'moderate',
  effortType: 'intensity',
  averageHeartRate: '',
};

const sanitizeCardioDraft = (draft) => {
  if (!draft) {
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
  const session = {
    ...defaultCardioSession,
    ...draft,
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

  if (session.id !== undefined) {
    delete session.id;
  }

  return session;
};

const getTodayDateString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const DEFAULT_PORTION_GRAMS = 100;

const resolveFoodForEntry = (entry) => {
  if (!entry) {
    return null;
  }

  if (entry.foodId) {
    const byId = FOOD_DATABASE.find((food) => food.id === entry.foodId);
    if (byId) {
      return byId;
    }
  }

  const name = String(entry.name ?? '').trim();
  if (!name) {
    return null;
  }

  const normalized = name.toLowerCase();
  const exactMatch = FOOD_DATABASE.find(
    (food) => food.name.toLowerCase() === normalized
  );
  if (exactMatch) {
    return exactMatch;
  }

  return (
    FOOD_DATABASE.find((food) =>
      food.name.toLowerCase().includes(normalized)
    ) ?? null
  );
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
      bmr: state.bmr,
      trainingCalories: state.trainingCalories,
      totalCardioBurn: state.totalCardioBurn,
      handleUserDataChange: state.handleUserDataChange,
      addStepRange: state.addStepRange,
      removeStepRange: state.removeStepRange,
      addCardioSession: state.addCardioSession,
      removeCardioSession: state.removeCardioSession,
      updateCardioSession: state.updateCardioSession,
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
  const { currentScreen, sliderStyle, handlers, goToScreen, isSwiping } =
    useSwipeableScreens(screenTabs.length, viewportRef, homeIndex);

  const [selectedGoal, setSelectedGoal] = useState('maintenance');
  const [tempSelectedGoal, setTempSelectedGoal] = useState('maintenance');
  const [selectedDay, setSelectedDayState] = useState('training');
  const [isDayLoaded, setIsDayLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    loadSelectedDay().then((day) => {
      if (mounted) {
        setSelectedDayState(day);
        setIsDayLoaded(true);
      }
    });

    // Setup status bar styling for dark mode (light icons)
    // Using dynamic wrapper - call setLightStatusBar(true) for dark theme
    const setupStatusBar = async () => {
      if (!Capacitor.isNativePlatform()) {
        return;
      }

      try {
        // true = dark background, light/white icons (current app theme)
        await setLightStatusBar(true);
      } catch (error) {
        console.error('Failed to setup status bar:', error);
      }
    };

    setupStatusBar();

    return () => {
      mounted = false;
    };
  }, []);
  const [tempAge, setTempAge] = useState(userData.age);
  const [tempHeight, setTempHeight] = useState(userData.height);
  const [tempTrainingType, setTempTrainingType] = useState(
    userData.trainingType
  );
  const [tempTrainingDuration, setTempTrainingDuration] = useState(
    userData.trainingDuration
  );
  const [editingTrainingType, setEditingTrainingType] = useState(null);
  const [tempPresetName, setTempPresetName] = useState('');
  const [tempPresetCalories, setTempPresetCalories] = useState(0);
  const [tempPresetDescription, setTempPresetDescription] = useState('');
  const [newStepRange, setNewStepRange] = useState('');
  const [selectedStepRange, setSelectedStepRange] = useState(null);
  const [cardioDraft, setCardioDraft] = useState(defaultCardioSession);
  const [favouriteDraft, setFavouriteDraft] = useState(defaultCardioSession);
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
  const [phaseName, setPhaseName] = useState('');
  const [phaseStartDate, setPhaseStartDate] = useState(getTodayDateString());
  const [phaseEndDate, setPhaseEndDate] = useState('');
  const [phaseGoalType, setPhaseGoalType] = useState('maintenance');
  const [phaseTargetWeight, setPhaseTargetWeight] = useState('');
  const [phaseError, setPhaseError] = useState('');
  const [selectedPhase, setSelectedPhase] = useState(null);

  // Daily log state (reference-based)
  const [dailyLogDate, setDailyLogDate] = useState(getTodayDateString());
  const [dailyLogWeightRef, setDailyLogWeightRef] = useState('');
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
  const [selectedFoodForPortion, setSelectedFoodForPortion] = useState(null);
  const [editingPortionEntry, setEditingPortionEntry] = useState(null);
  const [portionInitialGrams, setPortionInitialGrams] = useState(null);
  const [trackerStepRange, setTrackerStepRange] = useState('12k');
  const [showTrackerCaloriePicker, setShowTrackerCaloriePicker] =
    useState(false);

  // Confirm action state
  const [confirmActionTitle, setConfirmActionTitle] = useState('');
  const [confirmActionDescription, setConfirmActionDescription] = useState('');
  const [confirmActionLabel, setConfirmActionLabel] = useState('Confirm');
  const [confirmActionTone, setConfirmActionTone] = useState('danger');
  const [confirmActionCallback, setConfirmActionCallback] = useState(null);

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
  const trainingTypeModal = useAnimatedModal();
  const trainingTypeEditorModal = useAnimatedModal(false, MODAL_CLOSE_DELAY);
  const settingsModal = useAnimatedModal();
  const dailyActivityModal = useAnimatedModal();
  const dailyActivityEditorModal = useAnimatedModal();
  const dailyActivityCustomModal = useAnimatedModal(false, MODAL_CLOSE_DELAY);
  const dailyActivityTierModal = useAnimatedModal();
  const stepRangesModal = useAnimatedModal();
  const quickTrainingModal = useAnimatedModal();
  const durationPickerModal = useAnimatedModal();
  const cardioModal = useAnimatedModal();
  const cardioFavouritesModal = useAnimatedModal();
  const cardioFavouriteEditorModal = useAnimatedModal();
  const calorieBreakdownModal = useAnimatedModal();
  const phaseCreationModal = useAnimatedModal();
  const templatePickerModal = useAnimatedModal();
  const dailyLogModal = useAnimatedModal();
  const calendarPickerModal = useAnimatedModal();
  const foodEntryModal = useAnimatedModal();
  const mealTypePickerModal = useAnimatedModal();
  const foodSearchModal = useAnimatedModal();
  const foodPortionModal = useAnimatedModal();
  const stepTrackerModal = useAnimatedModal();
  const stepGoalPickerModal = useAnimatedModal();
  // ...existing code...
  const confirmActionModal = useAnimatedModal();

  const isAnyModalOpen = useMemo(
    () =>
      [
        confirmActionModal,
        foodPortionModal,
        foodEntryModal,
        foodSearchModal,
        mealTypePickerModal,
        calendarPickerModal,
        dailyLogModal,
        templatePickerModal,
        phaseCreationModal,
        calorieBreakdownModal,
        cardioFavouriteEditorModal,
        cardioFavouritesModal,
        cardioModal,
        durationPickerModal,
        quickTrainingModal,
        stepRangesModal,
        stepTrackerModal,
        stepGoalPickerModal,
        dailyActivityCustomModal,
        dailyActivityEditorModal,
        dailyActivityModal,
        settingsModal,
        trainingTypeEditorModal,
        trainingTypeModal,
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
      ].some((modal) => modal?.isOpen || modal?.isClosing),
    [
      ageModal.isClosing,
      ageModal.isOpen,
      bmiModal.isClosing,
      bmiModal.isOpen,
      bmrModal.isClosing,
      bmrModal.isOpen,
      bodyFatEntryModal.isClosing,
      bodyFatEntryModal.isOpen,
      bodyFatPickerModal.isClosing,
      bodyFatPickerModal.isOpen,
      bodyFatTrackerModal.isClosing,
      bodyFatTrackerModal.isOpen,
      calorieBreakdownModal.isClosing,
      calorieBreakdownModal.isOpen,
      calendarPickerModal.isClosing,
      calendarPickerModal.isOpen,
      cardioFavouriteEditorModal.isClosing,
      cardioFavouriteEditorModal.isOpen,
      cardioFavouritesModal.isClosing,
      cardioFavouritesModal.isOpen,
      cardioModal.isClosing,
      cardioModal.isOpen,
      confirmActionModal.isClosing,
      confirmActionModal.isOpen,
      dailyActivityCustomModal.isClosing,
      dailyActivityCustomModal.isOpen,
      dailyActivityEditorModal.isClosing,
      dailyActivityEditorModal.isOpen,
      dailyActivityModal.isClosing,
      dailyActivityModal.isOpen,
      dailyLogModal.isClosing,
      dailyLogModal.isOpen,
      durationPickerModal.isClosing,
      durationPickerModal.isOpen,
      ffmiModal.isClosing,
      ffmiModal.isOpen,
      foodEntryModal.isClosing,
      foodEntryModal.isOpen,
      foodPortionModal.isClosing,
      foodPortionModal.isOpen,
      foodSearchModal.isClosing,
      foodSearchModal.isOpen,
      goalModal.isClosing,
      goalModal.isOpen,
      heightModal.isClosing,
      heightModal.isOpen,
      mealTypePickerModal.isClosing,
      mealTypePickerModal.isOpen,
      phaseCreationModal.isClosing,
      phaseCreationModal.isOpen,
      quickTrainingModal.isClosing,
      quickTrainingModal.isOpen,
      settingsModal.isClosing,
      settingsModal.isOpen,
      stepGoalPickerModal.isClosing,
      stepGoalPickerModal.isOpen,
      stepRangesModal.isClosing,
      stepRangesModal.isOpen,
      stepTrackerModal.isClosing,
      stepTrackerModal.isOpen,
      templatePickerModal.isClosing,
      templatePickerModal.isOpen,
      trainingTypeEditorModal.isClosing,
      trainingTypeEditorModal.isOpen,
      trainingTypeModal.isClosing,
      trainingTypeModal.isOpen,
      weightEntryModal.isClosing,
      weightEntryModal.isOpen,
      weightPickerModal.isClosing,
      weightPickerModal.isOpen,
      weightTrackerModal.isClosing,
      weightTrackerModal.isOpen,
    ]
  );

  // Keep a ref to the latest modal state so the back gesture handler never reads stale values
  const closeTopmostModalRef = useRef(() => false);

  // Update the ref every render with the current modal stack
  useEffect(() => {
    closeTopmostModalRef.current = () => {
      const modalStack = [
        confirmActionModal,
        foodPortionModal,
        foodEntryModal,
        foodSearchModal,
        mealTypePickerModal,
        calendarPickerModal,
        dailyLogModal,
        templatePickerModal,
        phaseCreationModal,
        calorieBreakdownModal,
        cardioFavouriteEditorModal,
        cardioFavouritesModal,
        cardioModal,
        durationPickerModal,
        quickTrainingModal,
        stepRangesModal,
        stepTrackerModal,
        stepGoalPickerModal,
        dailyActivityCustomModal,
        dailyActivityEditorModal,
        dailyActivityModal,
        settingsModal,
        trainingTypeEditorModal,
        trainingTypeModal,
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
      ];

      for (const modal of modalStack) {
        if (modal?.isOpen && !modal.isClosing) {
          modal.requestClose();
          return true;
        }
      }

      return false;
    };
  });

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return undefined;
    }

    let listener = null;

    const setup = async () => {
      listener = await App.addListener('backButton', ({ canGoBack }) => {
        const didCloseModal = closeTopmostModalRef.current?.() ?? false;
        if (didCloseModal) {
          return;
        }

        if (canGoBack) {
          window.history.back();
        } else {
          App.exitApp();
        }
      });
    };

    setup();

    return () => {
      listener?.remove?.();
    };
  }, []);

  useEffect(() => {
    if (isDayLoaded) {
      saveSelectedDay(selectedDay);
    }
  }, [selectedDay, isDayLoaded]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTempAge(userData.age);
  }, [userData.age]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTempHeight(userData.height);
  }, [userData.height]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTempTrainingType(userData.trainingType);
    setTempTrainingDuration(userData.trainingDuration);
  }, [userData.trainingDuration, userData.trainingType]);

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

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
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
    openBodyFatTracker();
  }, [openBodyFatTracker, weightTrackerModal]);

  const handleSwitchToWeight = useCallback(() => {
    bodyFatTrackerModal.requestClose();
    openWeightTracker();
  }, [bodyFatTrackerModal, openWeightTracker]);

  const openAddWeightEntryModal = useCallback(() => {
    const todayKey = getTodayDateString();
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
  }, [latestWeightEntry, userData.weight, weightEntryModal]);

  const openAddBodyFatEntryModal = useCallback(() => {
    const todayKey = getTodayDateString();
    const fallbackBodyFat =
      clampBodyFat(latestBodyFatEntry?.bodyFat ?? 18) ?? 18;

    setBodyFatEntryMode('add');
    setBodyFatEntryDraft({ date: todayKey, bodyFat: fallbackBodyFat });
    setBodyFatEntryOriginalDate(null);
    setIsBodyFatDateLocked(false);
    setBodyFatEntryError('');
    setBodyFatPickerValue(fallbackBodyFat);
    bodyFatEntryModal.open();
  }, [bodyFatEntryModal, latestBodyFatEntry?.bodyFat]);

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

  const handlePrimaryWeightEntry = useCallback(() => {
    if (todayWeightEntry) {
      openEditWeightEntryModal(todayWeightEntry);
    } else {
      openAddWeightEntryModal();
    }
  }, [openAddWeightEntryModal, openEditWeightEntryModal, todayWeightEntry]);

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

  const handleWeightEntryFromListDelete = useCallback(
    (entry) => {
      const dateKey = normalizeDateKey(entry?.date);
      if (!dateKey) {
        return;
      }

      // Deletion confirmation should be handled by custom modal, not browser confirm
      deleteWeightEntry(dateKey);
    },
    [deleteWeightEntry]
  );

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const updateSelectedDay = useCallback((day) => {
    setSelectedDayState(day);
  }, []);

  const handleTrainingDayClick = useCallback(() => {
    if (selectedDay === 'training') {
      setTempTrainingType(userData.trainingType);
      setTempTrainingDuration(userData.trainingDuration);
      quickTrainingModal.open();
    } else {
      updateSelectedDay('training');
    }
  }, [
    quickTrainingModal,
    selectedDay,
    updateSelectedDay,
    userData.trainingDuration,
    userData.trainingType,
  ]);

  const handleRestDayClick = useCallback(() => {
    updateSelectedDay('rest');
  }, [updateSelectedDay]);

  const openGoalModal = useCallback(() => {
    setTempSelectedGoal(selectedGoal);
    goalModal.open();
  }, [goalModal, selectedGoal]);

  const openAgeModal = useCallback(() => {
    setTempAge(userData.age);
    ageModal.open();
  }, [ageModal, userData.age]);

  const openHeightModal = useCallback(() => {
    setTempHeight(userData.height);
    heightModal.open();
  }, [heightModal, userData.height]);

  const openTrainingTypeModal = useCallback(() => {
    setTempTrainingType(userData.trainingType);
    trainingTypeModal.open();
  }, [trainingTypeModal, userData.trainingType]);

  const resetTrainingTypeEditorState = useCallback(() => {
    setEditingTrainingType(null);
    setTempPresetName('');
    setTempPresetDescription('');
    setTempPresetCalories(0);
  }, []);

  const closeTrainingTypeEditor = useCallback(() => {
    trainingTypeEditorModal.requestClose();
    setTimeout(resetTrainingTypeEditorState, MODAL_CLOSE_DELAY);
  }, [resetTrainingTypeEditorState, trainingTypeEditorModal]);

  const openTrainingTypeEditor = useCallback(
    (typeKey) => {
      const current = trainingTypes[typeKey] ??
        presetTrainingTypes[typeKey] ?? {
          label: typeKey,
          description: '',
          caloriesPerHour: 0,
        };

      const initialCalories = Number(current.caloriesPerHour ?? 0);

      setEditingTrainingType(typeKey);
      setTempPresetName(current.label ?? '');
      setTempPresetDescription(current.description ?? '');
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

    const fallback = presetTrainingTypes[editingTrainingType] ?? {
      label: editingTrainingType,
      description: '',
      caloriesPerHour: 0,
    };

    const nextName = tempPresetName.trim() || fallback.label;
    const nextDescription =
      tempPresetDescription.trim() || fallback.description;
    const sanitizedCalories = Number.isFinite(tempPresetCalories)
      ? Math.max(0, tempPresetCalories)
      : NaN;
    const nextCalories = Number.isFinite(sanitizedCalories)
      ? sanitizedCalories
      : fallback.caloriesPerHour;

    updateTrainingType(editingTrainingType, {
      name: nextName,
      description: nextDescription,
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
    tempPresetDescription,
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
        const resolved = Number.isFinite(existingCustom)
          ? existingCustom
          : fallback;

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
      const resolvedMultiplier = Number.isFinite(existingCustom)
        ? existingCustom
        : fallback;

      handleDailyActivityPresetSelect(dayType, 'custom');

      const percentValue = Math.round(resolvedMultiplier * 1000) / 10;
      setActivityEditorDay(dayType);
      setCustomActivityPercent(
        Number.isFinite(percentValue) ? percentValue : 0
      );

      if (alreadySelected || !Number.isFinite(existingCustom)) {
        dailyActivityCustomModal.open();
      }
    },
    [dailyActivityCustomModal, handleDailyActivityPresetSelect, userData]
  );

  const handleCustomActivityCancel = useCallback(() => {
    dailyActivityCustomModal.requestClose();
  }, [dailyActivityCustomModal]);

  const handleCustomActivitySave = useCallback(() => {
    if (!activityEditorDay) {
      dailyActivityCustomModal.requestClose();
      return;
    }

    const numericPercent = Number(customActivityPercent);
    if (!Number.isFinite(numericPercent)) {
      return;
    }

    const clampedPercent = Math.min(Math.max(numericPercent, 0), 100);
    const multiplier = Math.round((clampedPercent / 100) * 1000) / 1000;

    const nextCustoms = {
      ...(userData.customActivityMultipliers ?? {
        training: DEFAULT_ACTIVITY_MULTIPLIERS.training,
        rest: DEFAULT_ACTIVITY_MULTIPLIERS.rest,
      }),
      [activityEditorDay]: multiplier,
    };

    handleUserDataChange('customActivityMultipliers', nextCustoms);
    handleUserDataChange('activityPresets', {
      ...(userData.activityPresets ?? { training: 'default', rest: 'default' }),
      [activityEditorDay]: 'custom',
    });
    handleUserDataChange('activityMultipliers', {
      ...(userData.activityMultipliers ?? DEFAULT_ACTIVITY_MULTIPLIERS),
      [activityEditorDay]: multiplier,
    });

    setCustomActivityPercent(Math.round(clampedPercent * 10) / 10);
    dailyActivityCustomModal.requestClose();
  }, [
    activityEditorDay,
    customActivityPercent,
    dailyActivityCustomModal,
    handleUserDataChange,
    userData,
  ]);

  const openCardioModal = useCallback(() => {
    setEditingCardioId(null);
    setCardioDraft(defaultCardioSession);
    setCardioModalMode('add');
    cardioModal.open();
  }, [cardioModal]);

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
        duration: existing.duration ?? defaultCardioSession.duration,
        intensity: existing.intensity ?? defaultCardioSession.intensity,
        effortType: normalizedEffortType,
        averageHeartRate:
          normalizedEffortType === 'heartRate'
            ? (existing.averageHeartRate ?? '')
            : '',
      };

      setCardioDraft(draft);
      setEditingCardioId(sessionId);
      setCardioModalMode('edit');
      cardioModal.open();
    },
    [cardioModal, userData.cardioSessions]
  );

  const handleAddStepRange = useCallback(() => {
    const trimmed = newStepRange.trim();
    if (!trimmed) return;
    addStepRange(trimmed);
    setNewStepRange('');
  }, [addStepRange, newStepRange]);

  const openCalorieBreakdown = useCallback(
    (range) => {
      setSelectedStepRange(range);
      calorieBreakdownModal.open();
    },
    [calorieBreakdownModal]
  );

  const closeCalorieBreakdown = useCallback(() => {
    calorieBreakdownModal.requestClose();
    setTimeout(() => {
      setSelectedStepRange(null);
    }, MODAL_CLOSE_DELAY);
  }, [calorieBreakdownModal]);

  const selectedRangeData = useMemo(() => {
    // Check for null/undefined explicitly, not falsy (0 is a valid step count)
    if (selectedStepRange === null || selectedStepRange === undefined)
      return null;
    return calculateTargetForGoal(
      selectedStepRange,
      selectedDay === 'training',
      selectedGoal
    );
  }, [calculateTargetForGoal, selectedDay, selectedGoal, selectedStepRange]);

  const getRangeDetails = useCallback(
    (steps) =>
      calculateTargetForGoal(steps, selectedDay === 'training', selectedGoal),
    [calculateTargetForGoal, selectedDay, selectedGoal]
  );

  const isSelectedRange = useCallback(
    (range) => calorieBreakdownModal.isOpen && selectedStepRange === range,
    [calorieBreakdownModal.isOpen, selectedStepRange]
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
    const details = calculateTargetForGoal(
      stepCount, // Pass raw step count instead of range string
      selectedDay === 'training',
      selectedGoal
    );

    return {
      stepCount,
      breakdown: details.breakdown,
      targetCalories: details.targetCalories,
      difference: details.difference,
      lastSynced: healthConnect.lastSynced,
    };
  }, [
    healthConnect.status,
    healthConnect.steps,
    healthConnect.lastSynced,
    calculateTargetForGoal,
    selectedDay,
    selectedGoal,
  ]);

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
    const sessionToSave = sanitizeCardioDraft(cardioDraft);
    if (!sessionToSave) {
      return;
    }

    if (editingCardioId != null) {
      updateCardioSession(editingCardioId, sessionToSave);
    } else {
      addCardioSession(sessionToSave);
    }

    cardioModal.requestClose();
  }, [
    addCardioSession,
    cardioDraft,
    cardioModal,
    editingCardioId,
    updateCardioSession,
  ]);

  const handleFavouriteSave = useCallback(() => {
    const favouriteToSave = sanitizeCardioDraft(favouriteDraft);
    if (!favouriteToSave) {
      return;
    }

    addCardioFavourite(favouriteToSave);
    cardioFavouriteEditorModal.requestClose();
  }, [addCardioFavourite, cardioFavouriteEditorModal, favouriteDraft]);

  const handleApplyFavourite = useCallback(
    (favourite) => {
      const sanitized = sanitizeCardioDraft(favourite);
      if (!sanitized) {
        return;
      }

      const effortType = sanitized.effortType ?? 'intensity';
      setCardioDraft({
        ...defaultCardioSession,
        ...sanitized,
        averageHeartRate:
          effortType === 'heartRate' ? (sanitized.averageHeartRate ?? '') : '',
      });

      if (cardioModalMode === 'edit' && editingCardioId != null) {
        updateCardioSession(editingCardioId, sanitized);
      } else {
        addCardioSession(sanitized);
      }

      cardioFavouritesModal.requestClose();
      cardioModal.requestClose();
    },
    [
      addCardioSession,
      cardioFavouritesModal,
      cardioModal,
      cardioModalMode,
      editingCardioId,
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
      // Close picker with delay, then open search for the chosen meal
      setTimeout(() => {
        startMealEntryFlow(mealType);
      }, MODAL_CLOSE_DELAY);
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

  // Handle adding food from portion modal
  const handleAddFoodFromPortion = useCallback(
    (foodEntry) => {
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

        foodPortionModal.requestClose();
        return;
      }

      if (!foodMealType) {
        return;
      }

      addFoodEntry(trackerSelectedDate, foodMealType, foodEntry);

      // Close both modals simultaneously for faster UX
      foodPortionModal.requestClose();
      foodSearchModal.requestClose();
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

  // Edit food entry from TrackerScreen (legacy support)
  const handleEditFoodEntry = useCallback(
    (mealType, entryId) => {
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
      const resolvedFood =
        resolveFoodForEntry(existing) || buildFallbackFoodFromEntry(existing);

      setFoodMealType(mealType);
      setSelectedFoodForPortion(resolvedFood);
      setEditingPortionEntry({ ...existing, mealType });
      setPortionInitialGrams(existing.grams);
      foodPortionModal.open();
    },
    [nutritionData, trackerSelectedDate, foodPortionModal, foodEntryModal]
  );

  // Delete food entry from meal
  const handleFoodEntrySave = useCallback(() => {
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

      foodEntryModal.requestClose();
      // Close search modal after editing favourite
      setTimeout(() => {
        foodSearchModal.requestClose();
      }, 250);
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

    foodEntryModal.requestClose();
    // Close search modal after a short delay so nested modals finish closing
    if (!editingFoodEntryId) {
      setTimeout(() => {
        foodSearchModal.requestClose();
      }, 250);
    }
  }, [
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
  ]);

  const handleToggleTrackerCaloriePicker = useCallback(() => {
    setShowTrackerCaloriePicker((prev) => !prev);
  }, []);

  const handleTrackerStepRangeChange = useCallback((range) => {
    setTrackerStepRange(range);
    setShowTrackerCaloriePicker(false);
  }, []);

  useEffect(() => {
    if (foodEntryModal.isClosing) {
      const timer = setTimeout(() => {
        resetFoodEntryForm();
      }, MODAL_CLOSE_DELAY);
      return () => clearTimeout(timer);
    }
  }, [foodEntryModal.isClosing, resetFoodEntryForm]);

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
    (foodEntry) => {
      if (!foodMealType) {
        // No meal type selected - can't add
        return;
      }

      addFoodEntry(trackerSelectedDate, foodMealType, foodEntry);

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

  // When user wants to create a new favourite from the current food/portion
  const handleCreateFoodFavourite = useCallback(
    (foodEntry, sourceFood) => {
      if (!foodEntry) return;

      // Determine source properly:
      // - 'fatsecret' for cached online foods
      // - 'manual' for manual entries (from FoodEntryModal)
      // - 'user' for custom foods (from AddCustomFoodModal)
      // - null for local database foods
      const source = foodEntry.source || sourceFood?.source || null;

      const favourite = {
        foodId: foodEntry.foodId || sourceFood?.id || null,
        name: foodEntry.name || sourceFood?.name || 'Custom Food',
        brand: sourceFood?.brand || foodEntry.brand || null,
        category: sourceFood?.category || 'supplements',
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
    setSelectedGoal(tempSelectedGoal);
    goalModal.requestClose();
  }, [goalModal, tempSelectedGoal]);

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

  const handleTrainingTypeSave = useCallback(() => {
    handleUserDataChange('trainingType', tempTrainingType);
    trainingTypeModal.requestClose();
  }, [handleUserDataChange, tempTrainingType, trainingTypeModal]);

  const handleQuickTrainingSave = useCallback(() => {
    handleUserDataChange('trainingType', tempTrainingType);
    handleUserDataChange('trainingDuration', tempTrainingDuration);
    quickTrainingModal.requestClose();
  }, [
    handleUserDataChange,
    quickTrainingModal,
    tempTrainingDuration,
    tempTrainingType,
  ]);

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
    setPhaseName('');
    setPhaseStartDate(getTodayDateString());
    setPhaseEndDate('');
    setPhaseGoalType('maintenance');
    setPhaseTargetWeight('');
    setPhaseError('');
    phaseCreationModal.open();
  }, [phaseCreationModal]);

  const handlePhaseCreationSave = useCallback(() => {
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

    // Parse target weight if provided
    let targetWeight = null;
    if (phaseTargetWeight) {
      const parsed = Number(phaseTargetWeight);
      if (!Number.isFinite(parsed) || parsed < 30 || parsed > 210) {
        setPhaseError('Target weight must be between 30 and 210 kg');
        return;
      }
      targetWeight = parsed;
    }

    // Create phase
    createPhase({
      name: phaseName.trim(),
      startDate: phaseStartDate,
      endDate: phaseEndDate || null,
      goalType: phaseGoalType,
      targetWeight,
    });

    setPhaseError('');
    phaseCreationModal.requestClose();
  }, [
    createPhase,
    phaseCreationModal,
    phaseEndDate,
    phaseGoalType,
    phaseName,
    phaseStartDate,
    phaseTargetWeight,
  ]);

  const handleTemplateSelect = useCallback(
    (template) => {
      if (!template) return;

      const today = new Date();
      const startDate = today.toISOString().split('T')[0];

      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() + template.suggestedDuration);

      let targetWeight = '';
      const currentWeight = latestWeightEntry?.weight ?? userData.weight;
      if (currentWeight && template.targetWeightChange !== 0) {
        const calculated = currentWeight + template.targetWeightChange;
        targetWeight = String(Math.max(30, Math.min(210, calculated)));
      }

      setPhaseName(template.defaultName);
      setPhaseStartDate(startDate);
      setPhaseEndDate(endDate.toISOString().split('T')[0]);
      setPhaseGoalType(template.goalType);
      setPhaseTargetWeight(targetWeight);
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
      setDailyLogNutritionRef('');
      setDailyLogNotes('');
      setDailyLogCompleted(false);
      setDailyLogMode('add');
      setDailyLogError('');
      setDailyLogDateLocked(false);
      dailyLogModal.open();
    },
    [dailyLogModal]
  );

  const openEditDailyLogModal = useCallback(
    (log) => {
      if (!log) return;

      setDailyLogDate(log.date);
      setDailyLogWeightRef(log.weightRef || '');
      setDailyLogNutritionRef(log.nutritionRef || '');
      setDailyLogNotes(log.notes || '');
      setDailyLogCompleted(log.completed || false);
      setDailyLogMode('edit');
      setDailyLogError('');
      setDailyLogDateLocked(true);
      dailyLogModal.open();
    },
    [dailyLogModal]
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

    // Auto-set weightRef to matching date if weight entry exists
    const matchingWeight = weightEntries.find(
      (entry) => entry.date === dailyLogDate
    );
    const finalWeightRef = matchingWeight ? matchingWeight.date : null;

    // Build log data with references
    const logData = {
      weightRef: finalWeightRef,
      nutritionRef: dailyLogNutritionRef || null,
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
    dailyLogCompleted,
    dailyLogDate,
    dailyLogModal,
    dailyLogMode,
    dailyLogNotes,
    dailyLogNutritionRef,
    selectedPhase,
    updateDailyLog,
    weightEntries,
  ]);

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
        exportPhaseAsJSON(selectedPhase, weightEntries);
      } else {
        exportPhaseAsCSV(selectedPhase, weightEntries);
      }
    },
    [selectedPhase, weightEntries]
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
      confirmActionModal.requestClose();
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
      confirmActionModal.requestClose();
    });
    confirmActionModal.open();
  }, [selectedPhase, deletePhase, confirmActionModal]);

  useEffect(() => {
    if (!dailyLogModal.isOpen && !dailyLogModal.isClosing) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDailyLogDate(getTodayDateString());
      setDailyLogWeightRef('');
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
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhaseName('');
      setPhaseStartDate(getTodayDateString());
      setPhaseEndDate('');
      setPhaseGoalType('maintenance');
      setPhaseTargetWeight('');
      setPhaseError('');
    }
  }, [phaseCreationModal.isClosing, phaseCreationModal.isOpen]);

  // Sync selectedPhase with phases array to keep it up-to-date
  useEffect(() => {
    if (selectedPhase) {
      const updatedPhase = phases.find((p) => p.id === selectedPhase.id);
      if (updatedPhase) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSelectedPhase(updatedPhase);
      }
    }
  }, [phases, selectedPhase?.id, selectedPhase]);

  useEffect(() => {
    if (!cardioModal.isOpen && !cardioModal.isClosing) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCardioDraft(defaultCardioSession);
      setEditingCardioId(null);
      setCardioModalMode('add');
    }
  }, [cardioModal.isClosing, cardioModal.isOpen]);

  useEffect(() => {
    if (
      !cardioFavouriteEditorModal.isOpen &&
      !cardioFavouriteEditorModal.isClosing
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFavouriteDraft(defaultCardioSession);
    }
  }, [cardioFavouriteEditorModal.isClosing, cardioFavouriteEditorModal.isOpen]);

  const hasCardioSessions = userData.cardioSessions.length > 0;
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
          <div className="h-10 w-10 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
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
            className={`overflow-hidden ${isSwiping ? 'cursor-grabbing' : 'cursor-grab'}`}
            {...handlers}
          >
            <div className="flex w-full" style={sliderStyle}>
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
                  targetProtein={Math.round(userData.weight * 2)}
                  targetFats={Math.round(userData.weight * 0.8)}
                  stepRanges={userData.stepRanges}
                  selectedGoal={selectedGoal}
                  selectedDay={selectedDay}
                  getRangeDetails={getRangeDetails}
                  calendarModal={calendarPickerModal}
                  selectedDate={trackerSelectedDate}
                  onSelectedDateChange={setTrackerSelectedDate}
                  selectedStepRange={trackerStepRange}
                  onStepRangeChange={handleTrackerStepRangeChange}
                  showCalorieTargetPicker={showTrackerCaloriePicker}
                  onToggleCalorieTargetPicker={handleToggleTrackerCaloriePicker}
                  isSwiping={isSwiping}
                />
              </div>

              <div className="w-full flex-shrink-0 px-2 sm:px-4 md:px-6">
                <HomeScreen
                  userData={userData}
                  bmr={bmr}
                  goals={goals}
                  selectedGoal={selectedGoal}
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
                  trainingTypes={trainingTypes}
                  cardioTypes={cardioTypes}
                  hasCardioSessions={hasCardioSessions}
                  onAddCardioClick={openCardioModal}
                  onEditCardioSession={handleEditCardioSession}
                  cardioSessions={userData.cardioSessions}
                  calculateCardioCalories={calculateCardioSessionCalories}
                  onRemoveCardioSession={removeCardioSession}
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
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <CalorieBreakdownModal
        isOpen={calorieBreakdownModal.isOpen}
        isClosing={calorieBreakdownModal.isClosing}
        stepRange={selectedStepRange}
        selectedDay={selectedDay}
        selectedGoal={selectedGoal}
        goals={goals}
        breakdown={selectedRangeData?.breakdown ?? null}
        targetCalories={selectedRangeData?.targetCalories ?? null}
        difference={selectedRangeData?.difference ?? null}
        onClose={closeCalorieBreakdown}
      />

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

      <WeightTrackerModal
        isOpen={weightTrackerModal.isOpen}
        isClosing={weightTrackerModal.isClosing}
        entries={weightEntries}
        latestWeight={userData.weight}
        hasTodayEntry={hasTodayWeightEntry}
        todayEntry={todayWeightEntry}
        selectedGoal={selectedGoal}
        phases={phases}
        onClose={weightTrackerModal.requestClose}
        onPrimaryAction={handlePrimaryWeightEntry}
        primaryActionLabel={weightPrimaryActionLabel}
        onAddEntry={openAddWeightEntryModal}
        onEditEntry={handleWeightEntryFromListEdit}
        onDeleteEntry={handleWeightEntryFromListDelete}
        canSwitchToBodyFat={userData.bodyFatTrackingEnabled}
        onSwitchToBodyFat={handleSwitchToBodyFat}
      />

      {userData.bodyFatTrackingEnabled && (
        <BodyFatTrackerModal
          isOpen={bodyFatTrackerModal.isOpen}
          isClosing={bodyFatTrackerModal.isClosing}
          entries={bodyFatEntries}
          latestBodyFat={latestBodyFatEntry?.bodyFat}
          selectedGoal={selectedGoal}
          phases={phases}
          onClose={bodyFatTrackerModal.requestClose}
          onAddEntry={openAddBodyFatEntryModal}
          onEditEntry={handleBodyFatEntryFromListEdit}
          onSwitchToWeight={handleSwitchToWeight}
        />
      )}

      <StepTrackerModal
        isOpen={stepTrackerModal.isOpen}
        isClosing={stepTrackerModal.isClosing}
        entries={stepEntries}
        todaySteps={healthConnect.steps}
        stepGoal={stepGoal}
        onClose={stepTrackerModal.requestClose}
        onSetGoal={openStepGoalPicker}
      />

      <StepGoalPickerModal
        isOpen={stepGoalPickerModal.isOpen}
        isClosing={stepGoalPickerModal.isClosing}
        value={stepGoal}
        onCancel={stepGoalPickerModal.requestClose}
        onSave={handleStepGoalSave}
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

      <TrainingTypeModal
        isOpen={trainingTypeModal.isOpen}
        isClosing={trainingTypeModal.isClosing}
        trainingTypes={trainingTypes}
        tempTrainingType={tempTrainingType}
        onSelect={setTempTrainingType}
        onEditTrainingType={openTrainingTypeEditor}
        onCancel={trainingTypeModal.requestClose}
        onSave={handleTrainingTypeSave}
      />

      <TrainingTypeEditorModal
        isOpen={trainingTypeEditorModal.isOpen}
        isClosing={trainingTypeEditorModal.isClosing}
        typeKey={editingTrainingType}
        name={tempPresetName}
        calories={tempPresetCalories}
        description={tempPresetDescription}
        onNameChange={setTempPresetName}
        onCaloriesChange={setTempPresetCalories}
        onDescriptionChange={setTempPresetDescription}
        onCancel={closeTrainingTypeEditor}
        onSave={handleTrainingPresetSave}
      />

      <SettingsModal
        isOpen={settingsModal.isOpen}
        isClosing={settingsModal.isClosing}
        userData={userData}
        onChange={handleUserDataChange}
        onAgePickerClick={openAgeModal}
        onHeightPickerClick={openHeightModal}
        onManageWeightClick={openWeightTracker}
        onManageBodyFatClick={openBodyFatTracker}
        weightEntries={weightEntries}
        bodyFatEntries={bodyFatEntries}
        bodyFatTrackingEnabled={userData.bodyFatTrackingEnabled}
        bmr={bmr}
        trainingTypes={trainingTypes}
        trainingCalories={trainingCalories}
        onTrainingTypeClick={openTrainingTypeModal}
        onTrainingDurationClick={() =>
          openDurationPicker(userData.trainingDuration, (value) =>
            handleUserDataChange('trainingDuration', value)
          )
        }
        onDailyActivityClick={openDailyActivitySettings}
        onDefaultActivityTierClick={dailyActivityTierModal.open}
        onCancel={settingsModal.requestClose}
        onSave={handleSettingsSave}
      />

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
        onChange={setCustomActivityPercent}
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

      <QuickTrainingModal
        isOpen={quickTrainingModal.isOpen}
        isClosing={quickTrainingModal.isClosing}
        trainingTypes={trainingTypes}
        tempTrainingType={tempTrainingType}
        tempTrainingDuration={tempTrainingDuration}
        onTrainingTypeSelect={setTempTrainingType}
        onEditTrainingType={openTrainingTypeEditor}
        onDurationClick={() =>
          openDurationPicker(tempTrainingDuration, setTempTrainingDuration)
        }
        onCancel={quickTrainingModal.requestClose}
        onSave={handleQuickTrainingSave}
      />

      <TrainingDurationPickerModal
        isOpen={durationPickerModal.isOpen}
        isClosing={durationPickerModal.isClosing}
        title={durationPickerTitle}
        initialDuration={durationPickerValue}
        onCancel={handleDurationPickerCancel}
        onSave={handleDurationPickerSave}
      />

      <CardioModal
        isOpen={cardioModal.isOpen}
        isClosing={cardioModal.isClosing}
        cardioTypes={cardioTypes}
        customCardioTypes={customCardioTypes}
        onAddCustomCardioType={addCustomCardioType}
        onDeleteCustomCardioType={removeCustomCardioType}
        session={cardioDraft}
        onChange={setCardioDraft}
        onCancel={cardioModal.requestClose}
        onSave={handleCardioSave}
        userWeight={userData.weight}
        userAge={userData.age}
        userGender={userData.gender}
        onOpenFavourites={handleOpenCardioFavourites}
        showFavouritesButton={showFavouritesButton}
        isEditing={cardioModalMode === 'edit'}
      />

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

      <CardioModal
        isOpen={cardioFavouriteEditorModal.isOpen}
        isClosing={cardioFavouriteEditorModal.isClosing}
        cardioTypes={cardioTypes}
        customCardioTypes={customCardioTypes}
        onAddCustomCardioType={addCustomCardioType}
        onDeleteCustomCardioType={removeCustomCardioType}
        session={favouriteDraft}
        onChange={setFavouriteDraft}
        onCancel={cardioFavouriteEditorModal.requestClose}
        onSave={handleFavouriteSave}
        userWeight={userData.weight}
        userAge={userData.age}
        userGender={userData.gender}
        showFavouritesButton={false}
        mode="favourite"
        isEditing={false}
      />

      <PhaseCreationModal
        isOpen={phaseCreationModal.isOpen}
        isClosing={phaseCreationModal.isClosing}
        phaseName={phaseName}
        startDate={phaseStartDate}
        endDate={phaseEndDate}
        goalType={phaseGoalType}
        targetWeight={phaseTargetWeight}
        currentWeight={latestWeightEntry?.weight || userData.weight}
        onNameChange={setPhaseName}
        onStartDateChange={setPhaseStartDate}
        onEndDateChange={setPhaseEndDate}
        onGoalTypeChange={setPhaseGoalType}
        onTargetWeightChange={setPhaseTargetWeight}
        onTemplatesClick={() => {
          templatePickerModal.open();
        }}
        onCancel={phaseCreationModal.requestClose}
        onSave={handlePhaseCreationSave}
        error={phaseError}
      />

      <TemplatePickerModal
        isOpen={templatePickerModal.isOpen}
        isClosing={templatePickerModal.isClosing}
        onSelectTemplate={(template) => {
          handleTemplateSelect(template);
          templatePickerModal.requestClose();
        }}
        onClose={templatePickerModal.requestClose}
      />

      <DailyLogModal
        isOpen={dailyLogModal.isOpen}
        isClosing={dailyLogModal.isClosing}
        mode={dailyLogMode}
        date={dailyLogDate}
        weightRef={dailyLogWeightRef}
        nutritionRef={dailyLogNutritionRef}
        notes={dailyLogNotes}
        completed={dailyLogCompleted}
        availableWeightEntries={weightEntries}
        onDateChange={setDailyLogDate}
        onWeightRefChange={setDailyLogWeightRef}
        onNutritionRefChange={setDailyLogNutritionRef}
        onNotesChange={setDailyLogNotes}
        onCompletedChange={setDailyLogCompleted}
        onManageWeightClick={weightTrackerModal.open}
        onCancel={dailyLogModal.requestClose}
        onSave={handleDailyLogSave}
        onDelete={dailyLogMode === 'edit' ? handleDailyLogDelete : undefined}
        error={dailyLogError}
        isDateLocked={dailyLogDateLocked}
      />

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
        setCalories={setFoodCalories}
        protein={foodProtein}
        setProtein={setFoodProtein}
        carbs={foodCarbs}
        setCarbs={setFoodCarbs}
        fats={foodFats}
        setFats={setFoodFats}
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
      />

      <FoodPortionModal
        isOpen={foodPortionModal.isOpen}
        isClosing={foodPortionModal.isClosing}
        onClose={foodPortionModal.requestClose}
        onAddFood={handleAddFoodFromPortion}
        onSaveAsFavourite={handleCreateFoodFavourite}
        selectedFood={selectedFoodForPortion}
        initialGrams={portionInitialGrams ?? undefined}
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

      <DailyActivityTierModal
        isOpen={dailyActivityTierModal.isOpen}
        isClosing={dailyActivityTierModal.isClosing}
        currentTier={userData.defaultActivityTier || 'standing'}
        onSelectTier={(tier) => {
          handleUserDataChange('defaultActivityTier', tier);
          dailyActivityTierModal.requestClose();
        }}
        onClose={dailyActivityTierModal.requestClose}
      />

      <ConfirmActionModal
        isOpen={confirmActionModal.isOpen}
        isClosing={confirmActionModal.isClosing}
        title={confirmActionTitle}
        description={confirmActionDescription}
        confirmLabel={confirmActionLabel}
        tone={confirmActionTone}
        onConfirm={confirmActionCallback}
        onCancel={confirmActionModal.requestClose}
      />
    </div>
  );
};
