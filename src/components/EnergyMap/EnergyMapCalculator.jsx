import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Home, Map, BarChart3, ClipboardList, Target } from 'lucide-react';
import { goals } from '../../constants/goals';
import { DEFAULT_ACTIVITY_MULTIPLIERS } from '../../constants/activityPresets';
import { trainingTypes as presetTrainingTypes } from '../../constants/trainingTypes';
import { useEnergyMapData } from '../../hooks/useEnergyMapData';
import { useSwipeableScreens } from '../../hooks/useSwipeableScreens';
import { useAnimatedModal } from '../../hooks/useAnimatedModal';
import { loadSelectedDay, saveSelectedDay } from '../../utils/storage';
import { ScreenTabs } from './common/ScreenTabs';
import { LogbookScreen } from './screens/LogbookScreen';
import { TrackerScreen } from './screens/TrackerScreen';
import { HomeScreen } from './screens/HomeScreen';
import { CalorieMapScreen } from './screens/CalorieMapScreen';
import { InsightsScreen } from './screens/InsightsScreen';
import { GoalModal } from './modals/GoalModal';
import { BmrInfoModal } from './modals/BmrInfoModal';
import { AgePickerModal } from './modals/AgePickerModal';
import { HeightPickerModal } from './modals/HeightPickerModal';
import { WeightPickerModal } from './modals/WeightPickerModal';
import { WeightEntryModal } from './modals/WeightEntryModal';
import { WeightTrackerModal } from './modals/WeightTrackerModal';
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
import { clampWeight, normalizeDateKey, formatWeight, formatDateLabel } from '../../utils/weight';

const MODAL_CLOSE_DELAY = 200;
const screenTabs = [
  { key: 'logbook', label: 'Logbook', icon: ClipboardList },
  { key: 'tracker', label: 'Tracker', icon: Target },
  { key: 'home', label: 'Home', icon: Home },
  { key: 'calorie-map', label: 'Calorie Map', icon: Map },
  { key: 'insights', label: 'Insights', icon: BarChart3 }
];

const homeIndex = screenTabs.findIndex(tab => tab.key === 'home');

const defaultCardioSession = {
  type: 'treadmill_walk',
  duration: 30,
  intensity: 'moderate',
  effortType: 'intensity',
  averageHeartRate: ''
};

const sanitizeCardioDraft = (draft) => {
  if (!draft) {
    return null;
  }

  const parsedDuration = Number.parseInt(draft.duration, 10);
  const duration = Number.isFinite(parsedDuration) ? Math.max(parsedDuration, 0) : 0;

  if (!duration) {
    return null;
  }

  const effortType = draft.effortType ?? 'intensity';
  const session = {
    ...defaultCardioSession,
    ...draft,
    duration,
    intensity: draft.intensity ?? 'moderate',
    effortType
  };

  if (effortType === 'heartRate') {
    const parsedHeartRate = Number.parseInt(draft.averageHeartRate, 10);
    const heartRate = Number.isFinite(parsedHeartRate) ? Math.max(parsedHeartRate, 0) : 0;

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

export const EnergyMapCalculator = () => {
  const {
    userData,
    weightEntries,
    trainingTypes,
    cardioTypes,
    customCardioTypes,
    cardioFavourites,
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
    deleteWeightEntry
  } = useEnergyMapData();

  const viewportRef = useRef(null);
  const { currentScreen, sliderStyle, handlers, goToScreen, isSwiping } = useSwipeableScreens(
    screenTabs.length,
    viewportRef,
    homeIndex
  );

  const [selectedGoal, setSelectedGoal] = useState('maintenance');
  const [tempSelectedGoal, setTempSelectedGoal] = useState('maintenance');
  const [selectedDay, setSelectedDayState] = useState(() => loadSelectedDay());
  const [tempAge, setTempAge] = useState(userData.age);
  const [tempHeight, setTempHeight] = useState(userData.height);
  const [tempTrainingType, setTempTrainingType] = useState(userData.trainingType);
  const [tempTrainingDuration, setTempTrainingDuration] = useState(userData.trainingDuration);
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
  const [durationPickerValue, setDurationPickerValue] = useState(userData.trainingDuration);
  const [durationPickerTitle, setDurationPickerTitle] = useState('Training Duration');
  const durationPickerOnSaveRef = useRef(null);
  const [editingCardioId, setEditingCardioId] = useState(null);
  const [weightEntryDraft, setWeightEntryDraft] = useState(() => ({
    date: getTodayDateString(),
    weight: clampWeight(userData.weight) ?? userData.weight
  }));
  const [weightEntryMode, setWeightEntryMode] = useState('add');
  const [weightEntryOriginalDate, setWeightEntryOriginalDate] = useState(null);
  const [isWeightDateLocked, setIsWeightDateLocked] = useState(false);
  const [weightEntryError, setWeightEntryError] = useState('');
  const [weightPickerValue, setWeightPickerValue] = useState(clampWeight(userData.weight) ?? userData.weight);

  const goalModal = useAnimatedModal();
  const bmrModal = useAnimatedModal();
  const ageModal = useAnimatedModal();
  const heightModal = useAnimatedModal();
  const weightTrackerModal = useAnimatedModal();
  const weightEntryModal = useAnimatedModal();
  const weightPickerModal = useAnimatedModal();
  const trainingTypeModal = useAnimatedModal();
  const trainingTypeEditorModal = useAnimatedModal(false, MODAL_CLOSE_DELAY);
  const settingsModal = useAnimatedModal();
  const dailyActivityModal = useAnimatedModal();
  const dailyActivityEditorModal = useAnimatedModal();
  const dailyActivityCustomModal = useAnimatedModal(false, MODAL_CLOSE_DELAY);
  const stepRangesModal = useAnimatedModal();
  const quickTrainingModal = useAnimatedModal();
  const durationPickerModal = useAnimatedModal();
  const cardioModal = useAnimatedModal();
  const cardioFavouritesModal = useAnimatedModal();
  const cardioFavouriteEditorModal = useAnimatedModal();
  const calorieBreakdownModal = useAnimatedModal();

  useEffect(() => {
    saveSelectedDay(selectedDay);
  }, [selectedDay]);

  useEffect(() => {
    setTempAge(userData.age);
  }, [userData.age]);

  useEffect(() => {
    setTempHeight(userData.height);
  }, [userData.height]);

  useEffect(() => {
    setTempTrainingType(userData.trainingType);
    setTempTrainingDuration(userData.trainingDuration);
  }, [userData.trainingDuration, userData.trainingType]);

  useEffect(() => {
    if (!durationPickerModal.isOpen) {
      durationPickerOnSaveRef.current = null;
    }
  }, [durationPickerModal.isOpen]);

  const latestWeightEntry = useMemo(
    () => (weightEntries.length ? weightEntries[weightEntries.length - 1] : null),
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
      const formattedDate = formatDateLabel(latestWeightEntry.date, { month: 'short', day: 'numeric' });
      return formattedDate ? `Last entry ${formattedDate}` : 'Last entry recorded';
    }
    return 'Tap to start logging';
  }, [hasTodayWeightEntry, latestWeightEntry?.date]);
  const weightPrimaryActionLabel = hasTodayWeightEntry ? 'Edit Entry' : 'Add Entry';

  const openWeightTracker = useCallback(() => {
    setWeightEntryError('');
    weightTrackerModal.open();
  }, [weightTrackerModal]);

  const openAddWeightEntryModal = useCallback(() => {
    const todayKey = getTodayDateString();
    const fallbackWeight = clampWeight(latestWeightEntry?.weight ?? userData.weight) ?? userData.weight;

    setWeightEntryMode('add');
    setWeightEntryDraft({ date: todayKey, weight: fallbackWeight });
    setWeightEntryOriginalDate(null);
    setIsWeightDateLocked(false);
    setWeightEntryError('');
    setWeightPickerValue(fallbackWeight);
    weightEntryModal.open();
  }, [latestWeightEntry, userData.weight, weightEntryModal]);

  const openEditWeightEntryModal = useCallback((entry) => {
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
  }, [userData.weight, weightEntryModal]);

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

    const originalDateKey = weightEntryMode === 'edit' ? weightEntryOriginalDate : null;
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
      setWeightEntryError('An entry already exists for this date. Edit that entry instead.');
      return;
    }

    saveWeightEntry(
      { date: normalizedDate, weight: normalizedWeight },
      originalDateKey
    );

    setWeightEntryError('');
    weightEntryModal.requestClose();
  }, [saveWeightEntry, weightEntries, weightEntryDraft.date, weightEntryDraft.weight, weightEntryMode, weightEntryOriginalDate, weightEntryModal]);

  const handleWeightEntryDelete = useCallback(() => {
    const targetDate = normalizeDateKey(weightEntryOriginalDate ?? weightEntryDraft.date);
    if (!targetDate) {
      weightEntryModal.requestClose();
      return;
    }

    const shouldDelete = typeof window === 'undefined' ? true : window.confirm('Delete this weight entry?');
    if (!shouldDelete) {
      return;
    }

    deleteWeightEntry(targetDate);
    weightEntryModal.requestClose();
  }, [deleteWeightEntry, weightEntryDraft.date, weightEntryModal, weightEntryOriginalDate]);

  const handleWeightEntryFromListDelete = useCallback((entry) => {
    const dateKey = normalizeDateKey(entry?.date);
    if (!dateKey) {
      return;
    }

    const shouldDelete = typeof window === 'undefined' ? true : window.confirm('Delete this weight entry?');
    if (!shouldDelete) {
      return;
    }

    deleteWeightEntry(dateKey);
  }, [deleteWeightEntry]);

  const handleWeightEntryFromListEdit = useCallback((entry) => {
    openEditWeightEntryModal(entry);
  }, [openEditWeightEntryModal]);

  const handleWeightEntryDateChange = useCallback((value) => {
    setWeightEntryDraft((prev) => ({ ...prev, date: value }));
    setWeightEntryError('');
  }, []);

  const openWeightPicker = useCallback(() => {
    const fallbackWeight = clampWeight(weightEntryDraft.weight) ?? userData.weight;
    setWeightPickerValue(fallbackWeight);
    weightPickerModal.open();
  }, [weightEntryDraft.weight, userData.weight, weightPickerModal]);

  const handleWeightPickerChange = useCallback((value) => {
    setWeightPickerValue(value);
  }, []);

  const handleWeightPickerSave = useCallback((value) => {
    const sanitized = clampWeight(value);
    if (sanitized == null) {
      weightPickerModal.requestClose();
      return;
    }

    setWeightEntryDraft((prev) => ({ ...prev, weight: sanitized }));
    setWeightPickerValue(sanitized);
    setWeightEntryError('');
    weightPickerModal.requestClose();
  }, [weightPickerModal]);

  const handleWeightPickerCancel = useCallback(() => {
    weightPickerModal.requestClose();
  }, [weightPickerModal]);

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
  }, [quickTrainingModal, selectedDay, updateSelectedDay, userData.trainingDuration, userData.trainingType]);

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
      const current = trainingTypes[typeKey] ?? presetTrainingTypes[typeKey] ?? {
        label: typeKey,
        description: '',
        caloriesPerHour: 0
      };

      const initialCalories = Number(current.caloriesPerHour ?? 0);

      setEditingTrainingType(typeKey);
      setTempPresetName(current.label ?? '');
      setTempPresetDescription(current.description ?? '');
      setTempPresetCalories(Number.isFinite(initialCalories) ? initialCalories : 0);
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
      caloriesPerHour: 0
    };

    const nextName = tempPresetName.trim() || fallback.label;
    const nextDescription = tempPresetDescription.trim() || fallback.description;
    const sanitizedCalories = Number.isFinite(tempPresetCalories) ? Math.max(0, tempPresetCalories) : NaN;
    const nextCalories = Number.isFinite(sanitizedCalories) ? sanitizedCalories : fallback.caloriesPerHour;

    updateTrainingType(editingTrainingType, {
      name: nextName,
      description: nextDescription,
      calories: nextCalories
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
    updateTrainingType
  ]);

  const openQuickTrainingModal = useCallback(() => {
    setTempTrainingType(userData.trainingType);
    setTempTrainingDuration(userData.trainingDuration);
    quickTrainingModal.open();
  }, [quickTrainingModal, userData.trainingDuration, userData.trainingType]);

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
        ...(userData.activityPresets ?? { training: 'default', rest: 'default' }),
        [dayType]: presetKey
      };

      handleUserDataChange('activityPresets', nextPresets);

      if (presetKey === 'custom') {
        const existingCustom = userData.customActivityMultipliers?.[dayType];
        const fallback = userData.activityMultipliers?.[dayType] ?? DEFAULT_ACTIVITY_MULTIPLIERS[dayType];
        const resolved = Number.isFinite(existingCustom) ? existingCustom : fallback;

        handleUserDataChange('customActivityMultipliers', {
          ...(userData.customActivityMultipliers ?? {
            training: DEFAULT_ACTIVITY_MULTIPLIERS.training,
            rest: DEFAULT_ACTIVITY_MULTIPLIERS.rest
          }),
          [dayType]: resolved
        });

        handleUserDataChange('activityMultipliers', {
          ...(userData.activityMultipliers ?? DEFAULT_ACTIVITY_MULTIPLIERS),
          [dayType]: resolved
        });
      } else if (Number.isFinite(multiplier)) {
        handleUserDataChange('activityMultipliers', {
          ...(userData.activityMultipliers ?? DEFAULT_ACTIVITY_MULTIPLIERS),
          [dayType]: multiplier
        });
      }
    },
    [handleUserDataChange, userData]
  );

  const handleDailyActivityCustomSelect = useCallback(
    (dayType, alreadySelected) => {
      const existingCustom = userData.customActivityMultipliers?.[dayType];
      const fallback = userData.activityMultipliers?.[dayType] ?? DEFAULT_ACTIVITY_MULTIPLIERS[dayType];
      const resolvedMultiplier = Number.isFinite(existingCustom) ? existingCustom : fallback;

      handleDailyActivityPresetSelect(dayType, 'custom');

      const percentValue = Math.round(resolvedMultiplier * 1000) / 10;
      setActivityEditorDay(dayType);
      setCustomActivityPercent(Number.isFinite(percentValue) ? percentValue : 0);

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
        rest: DEFAULT_ACTIVITY_MULTIPLIERS.rest
      }),
      [activityEditorDay]: multiplier
    };

    handleUserDataChange('customActivityMultipliers', nextCustoms);
    handleUserDataChange('activityPresets', {
      ...(userData.activityPresets ?? { training: 'default', rest: 'default' }),
      [activityEditorDay]: 'custom'
    });
    handleUserDataChange('activityMultipliers', {
      ...(userData.activityMultipliers ?? DEFAULT_ACTIVITY_MULTIPLIERS),
      [activityEditorDay]: multiplier
    });

    setCustomActivityPercent(Math.round(clampedPercent * 10) / 10);
    dailyActivityCustomModal.requestClose();
  }, [activityEditorDay, customActivityPercent, dailyActivityCustomModal, handleUserDataChange, userData]);

  const openCardioModal = useCallback(() => {
    setEditingCardioId(null);
    setCardioDraft(defaultCardioSession);
    setCardioModalMode('add');
    cardioModal.open();
  }, [cardioModal]);

  const handleEditCardioSession = useCallback(
    (sessionId) => {
      const existing = userData.cardioSessions.find((session) => session.id === sessionId);
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
        averageHeartRate: normalizedEffortType === 'heartRate' ? existing.averageHeartRate ?? '' : ''
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
    if (!selectedStepRange) return null;
    return calculateTargetForGoal(selectedStepRange, selectedDay === 'training', selectedGoal);
  }, [calculateTargetForGoal, selectedDay, selectedGoal, selectedStepRange]);

  const getRangeDetails = useCallback(
    (steps) => calculateTargetForGoal(steps, selectedDay === 'training', selectedGoal),
    [calculateTargetForGoal, selectedDay, selectedGoal]
  );

  const isSelectedRange = useCallback(
    (range) => calorieBreakdownModal.isOpen && selectedStepRange === range,
    [calorieBreakdownModal.isOpen, selectedStepRange]
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
  }, [addCardioSession, cardioDraft, cardioModal, editingCardioId, updateCardioSession]);

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
        averageHeartRate: effortType === 'heartRate' ? sanitized.averageHeartRate ?? '' : ''
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
      updateCardioSession
    ]
  );

  const handleOpenCardioFavourites = useCallback(() => {
    cardioFavouritesModal.open();
  }, [cardioFavouritesModal]);

  const handleCreateFavourite = useCallback(
    (template) => {
      const source = template ?? cardioDraft;
      const effortType = source?.effortType ?? 'intensity';
      const nextDraft = {
        ...defaultCardioSession,
        ...source,
        effortType,
        averageHeartRate: effortType === 'heartRate' ? source?.averageHeartRate ?? '' : ''
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

  const handleAgeSave = useCallback(() => {
    handleUserDataChange('age', tempAge);
    ageModal.requestClose();
  }, [ageModal, handleUserDataChange, tempAge]);

  const handleHeightSave = useCallback(() => {
    handleUserDataChange('height', tempHeight);
    heightModal.requestClose();
  }, [handleUserDataChange, heightModal, tempHeight]);

  const handleTrainingTypeSave = useCallback(() => {
    handleUserDataChange('trainingType', tempTrainingType);
    trainingTypeModal.requestClose();
  }, [handleUserDataChange, tempTrainingType, trainingTypeModal]);

  const handleQuickTrainingSave = useCallback(() => {
    handleUserDataChange('trainingType', tempTrainingType);
    handleUserDataChange('trainingDuration', tempTrainingDuration);
    quickTrainingModal.requestClose();
  }, [handleUserDataChange, quickTrainingModal, tempTrainingDuration, tempTrainingType]);

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

  useEffect(() => {
    if (!cardioModal.isOpen && !cardioModal.isClosing) {
      setCardioDraft(defaultCardioSession);
      setEditingCardioId(null);
      setCardioModalMode('add');
    }
  }, [cardioModal.isClosing, cardioModal.isOpen]);

  useEffect(() => {
    if (!cardioFavouriteEditorModal.isOpen && !cardioFavouriteEditorModal.isClosing) {
      setFavouriteDraft(defaultCardioSession);
    }
  }, [cardioFavouriteEditorModal.isClosing, cardioFavouriteEditorModal.isOpen]);

  const hasCardioSessions = userData.cardioSessions.length > 0;
  const activityPresets = useMemo(
    () => ({
      training: userData.activityPresets?.training ?? 'default',
      rest: userData.activityPresets?.rest ?? 'default'
    }),
    [userData.activityPresets]
  );

  const activityMultipliers = useMemo(
    () => ({
      training: userData.activityMultipliers?.training ?? DEFAULT_ACTIVITY_MULTIPLIERS.training,
      rest: userData.activityMultipliers?.rest ?? DEFAULT_ACTIVITY_MULTIPLIERS.rest
    }),
    [userData.activityMultipliers]
  );

  const showFavouritesButton = cardioModalMode !== 'edit' && !cardioFavouriteEditorModal.isOpen;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="relative">
          <ScreenTabs tabs={screenTabs} currentScreen={currentScreen} onSelect={goToScreen} />

          <div
            ref={viewportRef}
            className={`overflow-hidden ${isSwiping ? 'cursor-grabbing' : 'cursor-grab'}`}
            {...handlers}
          >
            <div className="flex w-full" style={sliderStyle}>
              <div className="w-full flex-shrink-0 px-2 sm:px-4 md:px-6">
                <LogbookScreen />
              </div>

              <div className="w-full flex-shrink-0 px-2 sm:px-4 md:px-6">
                <TrackerScreen />
              </div>

              <div className="w-full flex-shrink-0 px-2 sm:px-4 md:px-6">
                <HomeScreen
                  userData={userData}
                  bmr={bmr}
                  goals={goals}
                  selectedGoal={selectedGoal}
                  onGoalClick={openGoalModal}
                  onSettingsClick={settingsModal.open}
                  onAgeClick={openAgeModal}
                  onHeightClick={openHeightModal}
                  onWeightClick={openWeightTracker}
                  weightDisplay={weightDisplay}
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
                />
              </div>

              <div className="w-full flex-shrink-0 px-2 sm:px-4 md:px-6">
                <InsightsScreen
                  userData={userData}
                  selectedGoal={selectedGoal}
                  weightEntries={weightEntries}
                  onOpenWeightTracker={openWeightTracker}
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
        onClose={weightTrackerModal.requestClose}
        onPrimaryAction={handlePrimaryWeightEntry}
        primaryActionLabel={weightPrimaryActionLabel}
        onAddEntry={openAddWeightEntryModal}
        onEditEntry={handleWeightEntryFromListEdit}
        onDeleteEntry={handleWeightEntryFromListDelete}
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
        onDelete={weightEntryMode === 'edit' ? handleWeightEntryDelete : undefined}
      />

      <WeightPickerModal
        isOpen={weightPickerModal.isOpen}
        isClosing={weightPickerModal.isClosing}
        value={weightPickerValue}
        onChange={handleWeightPickerChange}
        onCancel={handleWeightPickerCancel}
        onSave={handleWeightPickerSave}
      />

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
        weightEntries={weightEntries}
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
        currentPreset={activityEditorDay ? activityPresets[activityEditorDay] : 'default'}
        currentMultiplier={activityEditorDay ? activityMultipliers[activityEditorDay] : undefined}
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
        onDurationClick={() => openDurationPicker(tempTrainingDuration, setTempTrainingDuration)}
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
    </div>
  );
};
