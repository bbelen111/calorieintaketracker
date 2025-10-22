import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Home, Map, BarChart3 } from 'lucide-react';
import { goals } from '../../constants/goals';
import { trainingTypes as presetTrainingTypes } from '../../constants/trainingTypes';
import { useEnergyMapData } from '../../hooks/useEnergyMapData';
import { useSwipeableScreens } from '../../hooks/useSwipeableScreens';
import { useAnimatedModal } from '../../hooks/useAnimatedModal';
import { loadSelectedDay, saveSelectedDay } from '../../utils/storage';
import { ScreenTabs } from './common/ScreenTabs';
import { HomeScreen } from './screens/HomeScreen';
import { CalorieMapScreen } from './screens/CalorieMapScreen';
import { InsightsScreen } from './screens/InsightsScreen';
import { GoalModal } from './modals/GoalModal';
import { BmrInfoModal } from './modals/BmrInfoModal';
import { AgePickerModal } from './modals/AgePickerModal';
import { WeightPickerModal } from './modals/WeightPickerModal';
import { TrainingTypeModal } from './modals/TrainingTypeModal';
import { TrainingTypeEditorModal } from './modals/TrainingTypeEditorModal';
import { SettingsModal } from './modals/SettingsModal';
import { StepRangesModal } from './modals/StepRangesModal';
import { QuickTrainingModal } from './modals/QuickTrainingModal';
import { CardioModal } from './modals/CardioModal';
import { CalorieBreakdownModal } from './modals/CalorieBreakdownModal';

const MODAL_CLOSE_DELAY = 200;
const screenTabs = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'calorie-map', label: 'Calorie Map', icon: Map },
  { key: 'insights', label: 'Insights', icon: BarChart3 }
];

const defaultCardioSession = {
  type: 'treadmill_walk',
  duration: 30,
  intensity: 'moderate'
};

export const EnergyMapCalculator = () => {
  const {
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
    updateTrainingType,
    calculateBreakdown,
    calculateTargetForGoal,
    calculateCardioSessionCalories
  } = useEnergyMapData();

  const viewportRef = useRef(null);
  const { currentScreen, sliderStyle, handlers, goToScreen, isSwiping } = useSwipeableScreens(
    screenTabs.length,
    viewportRef
  );

  const [selectedGoal, setSelectedGoal] = useState('maintenance');
  const [tempSelectedGoal, setTempSelectedGoal] = useState('maintenance');
  const [selectedDay, setSelectedDayState] = useState(() => loadSelectedDay());
  const [tempAge, setTempAge] = useState(userData.age);
  const [tempWeight, setTempWeight] = useState(userData.weight);
  const [tempTrainingType, setTempTrainingType] = useState(userData.trainingType);
  const [tempTrainingDuration, setTempTrainingDuration] = useState(userData.trainingDuration);
  const [editingTrainingType, setEditingTrainingType] = useState(null);
  const [tempPresetName, setTempPresetName] = useState('');
  const [tempPresetCalories, setTempPresetCalories] = useState(0);
  const [tempPresetDescription, setTempPresetDescription] = useState('');
  const [newStepRange, setNewStepRange] = useState('');
  const [selectedStepRange, setSelectedStepRange] = useState(null);
  const [cardioDraft, setCardioDraft] = useState(defaultCardioSession);

  const goalModal = useAnimatedModal();
  const bmrModal = useAnimatedModal();
  const ageModal = useAnimatedModal();
  const weightModal = useAnimatedModal();
  const trainingTypeModal = useAnimatedModal();
  const trainingTypeEditorModal = useAnimatedModal(false, MODAL_CLOSE_DELAY);
  const settingsModal = useAnimatedModal();
  const stepRangesModal = useAnimatedModal();
  const quickTrainingModal = useAnimatedModal();
  const cardioModal = useAnimatedModal();
  const calorieBreakdownModal = useAnimatedModal();

  useEffect(() => {
    saveSelectedDay(selectedDay);
  }, [selectedDay]);

  useEffect(() => {
    setTempAge(userData.age);
  }, [userData.age]);

  useEffect(() => {
    setTempWeight(userData.weight);
  }, [userData.weight]);

  useEffect(() => {
    setTempTrainingType(userData.trainingType);
    setTempTrainingDuration(userData.trainingDuration);
  }, [userData.trainingDuration, userData.trainingType]);

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

  const openWeightModal = useCallback(() => {
    setTempWeight(userData.weight);
    weightModal.open();
  }, [weightModal, userData.weight]);

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

  const openCardioModal = useCallback(() => {
    setCardioDraft(defaultCardioSession);
    cardioModal.open();
  }, [cardioModal]);

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
    addCardioSession(cardioDraft);
    setCardioDraft(defaultCardioSession);
    cardioModal.requestClose();
  }, [addCardioSession, cardioDraft, cardioModal]);

  const handleGoalSave = useCallback(() => {
    setSelectedGoal(tempSelectedGoal);
    goalModal.requestClose();
  }, [goalModal, tempSelectedGoal]);

  const handleAgeSave = useCallback(() => {
    handleUserDataChange('age', tempAge);
    ageModal.requestClose();
  }, [ageModal, handleUserDataChange, tempAge]);

  const handleWeightSave = useCallback(() => {
    handleUserDataChange('weight', tempWeight);
    weightModal.requestClose();
  }, [handleUserDataChange, tempWeight, weightModal]);

  const handleTrainingTypeSave = useCallback(() => {
    handleUserDataChange('trainingType', tempTrainingType);
    trainingTypeModal.requestClose();
  }, [handleUserDataChange, tempTrainingType, trainingTypeModal]);

  const handleQuickTrainingSave = useCallback(() => {
    handleUserDataChange('trainingType', tempTrainingType);
    handleUserDataChange('trainingDuration', tempTrainingDuration);
    quickTrainingModal.requestClose();
  }, [handleUserDataChange, quickTrainingModal, tempTrainingDuration, tempTrainingType]);

  const handleSettingsSave = useCallback(() => {
    settingsModal.requestClose();
  }, [settingsModal]);

  const hasCardioSessions = userData.cardioSessions.length > 0;

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
                <HomeScreen
                  userData={userData}
                  bmr={bmr}
                  goals={goals}
                  selectedGoal={selectedGoal}
                  onGoalClick={openGoalModal}
                  onSettingsClick={settingsModal.open}
                  onAgeClick={openAgeModal}
                  onWeightClick={openWeightModal}
                  onBmrClick={bmrModal.open}
                  selectedDay={selectedDay}
                  onTrainingDayClick={handleTrainingDayClick}
                  onRestDayClick={handleRestDayClick}
                  trainingCalories={trainingCalories}
                  trainingTypes={trainingTypes}
                  cardioTypes={cardioTypes}
                  hasCardioSessions={hasCardioSessions}
                  onAddCardioClick={openCardioModal}
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
                <InsightsScreen userData={userData} selectedGoal={selectedGoal} />
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

      <WeightPickerModal
        isOpen={weightModal.isOpen}
        isClosing={weightModal.isClosing}
        value={tempWeight}
        onChange={setTempWeight}
        onCancel={weightModal.requestClose}
        onSave={handleWeightSave}
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
        trainingTypes={trainingTypes}
        trainingCalories={trainingCalories}
        onTrainingTypeClick={openTrainingTypeModal}
        onCancel={settingsModal.requestClose}
        onSave={handleSettingsSave}
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
        onDurationChange={setTempTrainingDuration}
        onCancel={quickTrainingModal.requestClose}
        onSave={handleQuickTrainingSave}
      />

      <CardioModal
        isOpen={cardioModal.isOpen}
        isClosing={cardioModal.isClosing}
        cardioTypes={cardioTypes}
        session={cardioDraft}
        onChange={setCardioDraft}
        onCancel={cardioModal.requestClose}
        onSave={handleCardioSave}
        userWeight={userData.weight}
      />
    </div>
  );
};
