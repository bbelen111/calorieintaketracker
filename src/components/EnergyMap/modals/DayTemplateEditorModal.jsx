import React, { useState, useMemo } from 'react';
import {
  Save,
  Edit3,
  Dumbbell,
  Clock,
  Zap,
  Heart,
  Plus,
  X,
  Trash2,
} from 'lucide-react';
import { ModalShell } from '../common/ModalShell';
import { formatDurationLabel, roundDurationHours } from '../../../utils/time';
import { shallow } from 'zustand/shallow';
import { useEnergyMapStore } from '../../../store/useEnergyMapStore';

const EFFORT_MODES = [
  { key: 'intensity', label: 'Intensity', icon: Zap },
  { key: 'heartRate', label: 'Heart Rate', icon: Heart },
];

const INTENSITY_LEVELS = [
  { key: 'light', label: 'Light', color: 'bg-green-600' },
  { key: 'moderate', label: 'Moderate', color: 'bg-yellow-600' },
  { key: 'vigorous', label: 'Vigorous', color: 'bg-red-600' },
];

export const DayTemplateEditorModal = ({
  isOpen,
  isClosing,
  template,
  trainingTypes,
  onTrainingTypeSelect,
  onEditTrainingType,
  onDurationClick,
  onOpenCardioModal,
  onCancel,
  onSave,
}) => {
  const store = useEnergyMapStore(
    (state) => ({
      trainingTypes: state.trainingTypes ?? {},
      userData: state.userData,
    }),
    shallow
  );
  const resolvedTrainingTypes = trainingTypes ?? store.trainingTypes;

  const [name, setName] = useState(template?.name || 'New Template');
  const [trainingEnabled, setTrainingEnabled] = useState(
    template?.trainingEnabled ?? false
  );
  const [trainingEffortType, setTrainingEffortType] = useState(
    template?.trainingEffortType ?? 'intensity'
  );
  const [trainingIntensity, setTrainingIntensity] = useState(
    template?.trainingIntensity ?? 'moderate'
  );
  const [trainingAverageHeartRate, setTrainingAverageHeartRate] = useState(
    template?.trainingAverageHeartRate ?? null
  );
  const [cardioSessions, setCardioSessions] = useState(
    template?.cardioSessions || []
  );

  const currentTrainingType = store.userData?.trainingType || 'bodybuilding';
  const currentTrainingDuration = store.userData?.trainingDuration || 2;
  const selectedTraining = resolvedTrainingTypes[currentTrainingType];
  const caloriesPerHour = selectedTraining?.caloriesPerHour ?? 0;

  // Calculate estimated training burn with effort scaling
  const trainingBurn = useMemo(() => {
    if (!trainingEnabled) return 0;

    if (trainingEffortType === 'heartRate' && trainingAverageHeartRate) {
      // Simplified HR estimation for display
      return Math.round(currentTrainingDuration * 200); // Rough estimate
    }

    const intensityMultipliers = { light: 0.75, moderate: 1.0, vigorous: 1.25 };
    const multiplier = intensityMultipliers[trainingIntensity] ?? 1.0;
    return Math.round(caloriesPerHour * currentTrainingDuration * multiplier);
  }, [
    trainingEnabled,
    trainingEffortType,
    trainingIntensity,
    trainingAverageHeartRate,
    caloriesPerHour,
    currentTrainingDuration,
  ]);

  // Calculate total cardio burn (simplified)
  const cardioBurn = useMemo(() => {
    return cardioSessions.reduce((sum, session) => {
      const duration = session.duration || 0;
      return sum + Math.round(duration * 8); // Rough estimate ~8 cal/min
    }, 0);
  }, [cardioSessions]);

  const totalBurn = trainingBurn + cardioBurn;

  const formattedDuration = formatDurationLabel(currentTrainingDuration);
  const roundedDuration = useMemo(
    () => roundDurationHours(currentTrainingDuration),
    [currentTrainingDuration]
  );

  const handleSave = () => {
    onSave({
      id: template?.id || Date.now(),
      name,
      trainingEnabled,
      trainingEffortType,
      trainingIntensity,
      trainingAverageHeartRate,
      cardioSessions,
    });
  };

  const handleAddCardio = () => {
    onOpenCardioModal((newSession) => {
      setCardioSessions([...cardioSessions, { ...newSession, id: Date.now() }]);
    });
  };

  const handleEditCardio = (sessionId) => {
    const session = cardioSessions.find((s) => s.id === sessionId);
    if (!session) return;

    onOpenCardioModal((updatedSession) => {
      setCardioSessions(
        cardioSessions.map((s) =>
          s.id === sessionId ? { ...updatedSession, id: sessionId } : s
        )
      );
    }, session);
  };

  const handleRemoveCardio = (sessionId) => {
    setCardioSessions(cardioSessions.filter((s) => s.id !== sessionId));
  };

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      contentClassName="p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
    >
      <h3 className="text-foreground font-bold text-xl mb-5 text-center">
        Day Template Editor
      </h3>

      {/* Template Name */}
      <div className="mb-5">
        <label className="text-muted text-sm block mb-2">Template Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border-2 border-border bg-surface text-foreground transition-all focus:border-blue-400 focus:outline-none"
          placeholder="e.g., Training Day, Rest Day"
        />
      </div>

      {/* Training Toggle */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Dumbbell size={20} className="text-accent-purple" />
            <label className="text-foreground text-base font-semibold">
              Training
            </label>
          </div>
          <button
            onClick={() => setTrainingEnabled(!trainingEnabled)}
            type="button"
            className={`w-14 h-8 rounded-full transition-all focus-ring ${
              trainingEnabled ? 'bg-purple-600' : 'bg-surface-highlight'
            }`}
          >
            <div
              className={`w-6 h-6 rounded-full bg-white transition-transform ${
                trainingEnabled ? 'translate-x-7' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {trainingEnabled && (
          <div className="space-y-4 pl-7">
            {/* Training Type Grid */}
            <div>
              <label className="text-muted text-sm block mb-2">
                Training Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(resolvedTrainingTypes).map(([key, type]) => {
                  const isActive = currentTrainingType === key;

                  return (
                    <button
                      key={key}
                      onClick={() => onTrainingTypeSelect(key)}
                      type="button"
                      className={`p-3 rounded-lg border-2 transition-all text-sm relative text-left focus-ring pressable ${
                        isActive
                          ? 'bg-purple-600 border-purple-400 text-white'
                          : 'bg-surface-highlight border-border text-muted md:hover:border-purple-400'
                      }`}
                    >
                      <span
                        onClick={(event) => {
                          event.stopPropagation();
                          onEditTrainingType(key);
                        }}
                        className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/10 md:hover:bg-white/20 transition-colors flex items-center justify-center cursor-pointer"
                      >
                        <Edit3 size={12} />
                      </span>
                      <div className="pr-10 space-y-1">
                        <div className="font-bold text-base leading-tight">
                          {type.label}
                        </div>
                        <div className="text-xs opacity-75 leading-tight">
                          {type.caloriesPerHour} kcal/hr
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Training Duration */}
            <div>
              <label className="text-muted text-sm block mb-2">
                Duration
              </label>
              <button
                onClick={onDurationClick}
                type="button"
                className="w-full px-3 py-2 rounded-lg border-2 bg-indigo-600 border-indigo-400 text-white transition-all active:scale-[0.98] flex items-center gap-3 focus-ring press-feedback"
              >
                <Clock size={18} />
                <span className="font-semibold text-sm">
                  {formattedDuration}
                </span>
                <span className="text-xs opacity-90">
                  ~{roundedDuration.toFixed(2)} hours
                </span>
              </button>
            </div>

            {/* Training Effort */}
            <div>
              <label className="text-muted text-sm block mb-2">
                Effort Tracking
              </label>
              <div className="flex gap-2 mb-3">
                {EFFORT_MODES.map((mode) => {
                  const Icon = mode.icon;
                  const isActive = trainingEffortType === mode.key;
                  return (
                    <button
                      key={mode.key}
                      onClick={() => setTrainingEffortType(mode.key)}
                      type="button"
                      className={`flex-1 px-3 py-2 rounded-lg border-2 transition-all flex items-center justify-center gap-2 focus-ring pressable ${
                        isActive
                          ? 'bg-blue-600 border-blue-400 text-white'
                          : 'bg-surface-highlight border-border text-muted md:hover:border-blue-400'
                      }`}
                    >
                      <Icon size={16} />
                      <span className="text-sm font-medium">{mode.label}</span>
                    </button>
                  );
                })}
              </div>

              {trainingEffortType === 'intensity' ? (
                <div className="flex gap-2">
                  {INTENSITY_LEVELS.map((level) => {
                    const isActive = trainingIntensity === level.key;
                    return (
                      <button
                        key={level.key}
                        onClick={() => setTrainingIntensity(level.key)}
                        type="button"
                        className={`flex-1 px-3 py-2 rounded-lg transition-all text-sm font-medium focus-ring pressable ${
                          isActive
                            ? `${level.color} text-white`
                            : 'bg-surface-highlight border border-border text-muted md:hover:brightness-110'
                        }`}
                      >
                        {level.label}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <input
                  type="number"
                  value={trainingAverageHeartRate || ''}
                  onChange={(e) =>
                    setTrainingAverageHeartRate(
                      e.target.value ? Number(e.target.value) : null
                    )
                  }
                  className="w-full px-3 py-2 rounded-lg border-2 border-border bg-surface text-foreground transition-all focus:border-blue-400 focus:outline-none"
                  placeholder="Average BPM (e.g., 145)"
                  min="60"
                  max="220"
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Cardio Sessions */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-3">
          <label className="text-foreground text-base font-semibold">
            Cardio Sessions
          </label>
          <button
            onClick={handleAddCardio}
            type="button"
            className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm flex items-center gap-1.5 transition-all press-feedback focus-ring"
          >
            <Plus size={16} />
            Add
          </button>
        </div>

        {cardioSessions.length > 0 ? (
          <div className="space-y-2">
            {cardioSessions.map((session) => (
              <div
                key={session.id}
                className="p-3 rounded-lg bg-surface-highlight border border-border flex items-center justify-between"
              >
                <div className="flex-1">
                  <p className="text-foreground text-sm font-medium">
                    {session.type || 'Cardio'}
                  </p>
                  <p className="text-muted text-xs mt-0.5">
                    {session.duration} min · {session.intensity || 'moderate'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleEditCardio(session.id)}
                    type="button"
                    className="p-2 rounded-lg bg-surface md:hover:bg-surface-highlight text-muted transition-all pressable-inline focus-ring"
                  >
                    <Edit3 size={14} />
                  </button>
                  <button
                    onClick={() => handleRemoveCardio(session.id)}
                    type="button"
                    className="p-2 rounded-lg bg-surface md:hover:bg-red-500/20 text-accent-red transition-all pressable-inline focus-ring"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted text-sm text-center py-4 bg-surface-highlight rounded-lg">
            No cardio sessions added
          </p>
        )}
      </div>

      {/* Estimated Total Burn */}
      <div className="bg-surface-highlight/50 rounded-lg p-4 mb-5">
        <p className="text-muted text-xs text-center mb-2">
          Estimated Total Burn:
        </p>
        <p className="text-foreground font-bold text-2xl text-center">
          ~{totalBurn} calories
        </p>
        <div className="flex justify-center gap-4 mt-3 text-xs text-muted">
          {trainingBurn > 0 && (
            <span>Training: {trainingBurn} kcal</span>
          )}
          {cardioBurn > 0 && <span>Cardio: {cardioBurn} kcal</span>}
        </div>
      </div>

      {/* Footer */}
      <div className="flex gap-3">
        <button
          onClick={onCancel}
          type="button"
          className="flex-1 bg-surface md:hover:bg-surface-highlight text-foreground px-6 py-3 rounded-lg transition-all press-feedback focus-ring"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          type="button"
          className="flex-1 bg-blue-600 md:hover:brightness-110 text-white px-6 py-3 rounded-lg flex items-center justify-center gap-2 transition-all press-feedback focus-ring"
        >
          <Save size={20} />
          Save Template
        </button>
      </div>
    </ModalShell>
  );
};
