import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  Settings,
  Edit3,
  Info,
  Dumbbell,
  Target,
  Calendar,
  Heart,
  Plus,
  Trash2,
} from 'lucide-react';
import { shallow } from 'zustand/shallow';
import { goals as baseGoals } from '../../../constants/goals';
import { useEnergyMapStore } from '../../../store/useEnergyMapStore';
import { calculateTrainingSessionCalories } from '../../../utils/calculations';
import {
  resolveCardioSessionEpoc,
  resolveTrainingSessionEpoc,
} from '../../../utils/epoc';

const GOAL_BORDER_CLASS_BY_BG = {
  'bg-accent-purple': 'border-accent-purple',
  'bg-accent-green': 'border-accent-green',
  'bg-accent-blue': 'border-accent-blue',
  'bg-accent-yellow': 'border-accent-yellow',
  'bg-accent-orange': 'border-accent-orange',
};

export const HomeScreen = ({
  userData,
  bmr,
  goals,
  selectedGoal,
  onGoalClick,
  onSettingsClick,
  onBodyFatClick,
  onHeightClick,
  onWeightClick,
  weightDisplay,
  bodyFatDisplay,
  onBmrClick,
  selectedDay,
  onTrainingDayClick,
  onRestDayClick,
  trainingCalories,
  trainingSessions,
  trainingTypes,
  cardioTypes,
  hasCardioSessions,
  onAddCardioClick,
  onEditCardioSession,
  cardioSessions,
  calculateCardioCalories,
  onRemoveCardioSession,
  totalCardioBurn,
  isSwiping,
}) => {
  const store = useEnergyMapStore(
    (state) => ({
      userData: state.userData,
      bmr: state.bmr,
      trainingCalories: state.trainingCalories,
      trainingSessions: state.trainingSessions ?? [],
      trainingTypes: state.trainingTypes ?? {},
      cardioTypes: state.cardioTypes,
      totalCardioBurn: state.totalCardioBurn,
      cardioSessions: state.userData.cardioSessions ?? [],
    }),
    shallow
  );

  const resolvedUserData = userData ?? store.userData;
  const resolvedBmr = bmr ?? store.bmr;
  const resolvedTrainingCalories = trainingCalories ?? store.trainingCalories;
  const resolvedTrainingSessions = trainingSessions ?? store.trainingSessions;
  const resolvedTrainingTypes = trainingTypes ?? store.trainingTypes;
  const resolvedCardioTypes = cardioTypes ?? store.cardioTypes;
  const toDateKey = (value) => {
    if (value == null) return null;
    const normalized = String(value).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
  };
  const now = new Date();
  const todayDateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const resolvedCardioSessions = (
    cardioSessions ?? store.cardioSessions
  ).filter((session) => toDateKey(session?.date) === todayDateKey);
  const resolvedTotalCardioBurn = totalCardioBurn ?? store.totalCardioBurn;
  const resolvedGoals = goals ?? baseGoals;
  const resolvedTodayTrainingSessions = resolvedTrainingSessions.filter(
    (session) => toDateKey(session?.date) === todayDateKey
  );
  const epocEnabled = resolvedUserData?.epocEnabled ?? true;
  const resolvedTrainingEpocTotal = epocEnabled
    ? resolvedTodayTrainingSessions.reduce((sum, session) => {
        const sessionCalories = calculateTrainingSessionCalories(
          session,
          resolvedUserData,
          resolvedTrainingTypes
        );
        const epoc = resolveTrainingSessionEpoc({
          session,
          exerciseCalories: sessionCalories,
          trainingType: resolvedTrainingTypes?.[session?.type],
          userData: resolvedUserData,
        });
        return sum + (Number(epoc?.totalCalories) || 0);
      }, 0)
    : 0;
  const resolvedCardioEpocTotal = epocEnabled
    ? resolvedCardioSessions.reduce((sum, session) => {
        const sessionCalories = calculateCardioCalories(session);
        const epoc = resolveCardioSessionEpoc({
          session,
          exerciseCalories: sessionCalories,
          cardioType: resolvedCardioTypes?.[session?.type],
          userData: resolvedUserData,
        });
        return sum + (Number(epoc?.totalCalories) || 0);
      }, 0)
    : 0;
  const resolvedHasCardioSessions =
    typeof hasCardioSessions === 'boolean'
      ? hasCardioSessions
      : resolvedCardioSessions.length > 0;

  const goalConfig = resolvedGoals[selectedGoal];
  const goalBorderClass =
    GOAL_BORDER_CLASS_BY_BG[goalConfig.color] ?? 'border-primary-foreground';
  const weightTileValue = weightDisplay ?? `${resolvedUserData.weight} kg`;
  const bodyFatTileValue = bodyFatDisplay ?? 'Set';

  return (
    <div className="space-y-6 pb-10">
      <div className="bg-surface rounded-2xl p-6 md:p-8 border border-border shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Activity className="text-accent-blue" size={32} />
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">
              Your Energy Map
            </h1>
          </div>
          <button
            onClick={onSettingsClick}
            type="button"
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg transition-all press-feedback focus-ring md:hover:brightness-110"
          >
            <Settings size={20} />
            <span className="hidden md:inline">Settings</span>
          </button>
        </div>
        {/* Quick Settings Tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <button
            onClick={onBodyFatClick}
            type="button"
            className="bg-surface-highlight/50 border border-border/50 md:hover:bg-surface-highlight rounded-lg p-3 transition-all text-left group shadow-lg shadow-background/20 pressable-card focus-ring"
          >
            <div className="flex items-center justify-between">
              <p className="text-muted">Body Fat %</p>
              <Edit3
                size={14}
                className="text-muted/70 md:group-hover:text-primary transition-colors"
              />
            </div>
            <p className="text-foreground font-semibold text-lg">
              {bodyFatTileValue}
            </p>
          </button>
          <button
            onClick={onWeightClick}
            type="button"
            className="bg-surface-highlight/50 border border-border/50 md:hover:bg-surface-highlight rounded-lg p-3 transition-all text-left group shadow-lg shadow-background/20 pressable-card focus-ring"
          >
            <div className="flex items-center justify-between">
              <p className="text-muted">Weight</p>
              <Edit3
                size={14}
                className="text-muted/70 md:group-hover:text-primary transition-colors"
              />
            </div>
            <p className="text-foreground font-semibold text-lg">
              {weightTileValue}
            </p>
          </button>
          <button
            onClick={onHeightClick}
            type="button"
            className="bg-surface-highlight/50 border border-border/50 md:hover:bg-surface-highlight rounded-lg p-3 transition-all text-left group shadow-lg shadow-background/20 pressable-card focus-ring"
          >
            <div className="flex items-center justify-between">
              <p className="text-muted">Height</p>
              <Edit3
                size={14}
                className="text-muted/70 md:group-hover:text-primary transition-colors"
              />
            </div>
            <p className="text-foreground font-semibold text-lg">
              {resolvedUserData.height} cm
            </p>
          </button>
          <button
            onClick={onBmrClick}
            type="button"
            className="bg-surface-highlight/50 border border-border/50 md:hover:bg-surface-highlight rounded-lg p-3 transition-all text-left group shadow-lg shadow-background/20 pressable-card focus-ring"
          >
            <div className="flex items-center justify-between">
              <p className="text-muted">BMR</p>
              <Info
                size={14}
                className="text-muted/70 md:group-hover:text-primary transition-colors"
              />
            </div>
            <p className="text-foreground font-semibold text-lg">
              {resolvedBmr} kcal
            </p>
          </button>
        </div>
      </div>

      <div className="bg-surface rounded-2xl p-6 border border-border shadow-lg">
        <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
          <Target className="text-accent-blue" size={18} />
          Your Goal
        </h2>
        <button
          onClick={onGoalClick}
          type="button"
          className={`w-full p-4 rounded-xl border-2 transition-all relative ${goalConfig.color} ${goalBorderClass} text-primary-foreground shadow-lg md:hover:scale-[1.02] active:scale-[0.98] focus-ring pressable-card`}
        >
          {(() => {
            const Icon = goalConfig.icon;
            return <Icon className="mx-auto mb-2" size={32} />;
          })()}
          <p className="font-bold text-xl">{goalConfig.label}</p>
          <p className="text-sm opacity-90 mt-1">{goalConfig.desc}</p>
          <p className="text-xs opacity-75 mt-2">Tap to change</p>
        </button>

        {goalConfig.warning && (
          <div className="mt-4 bg-accent-yellow/15 border-2 border-accent-yellow/60 rounded-xl p-4">
            <p className="text-accent-yellow text-sm font-medium">
              {goalConfig.warning}
            </p>
          </div>
        )}
      </div>

      <div className="bg-surface rounded-2xl p-6 border border-border shadow-lg">
        <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
          <Calendar className="text-accent-blue" size={18} />
          Day Type
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <motion.button
            onClick={onTrainingDayClick}
            type="button"
            className={`p-4 rounded-xl border-2 transition-all relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-purple/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
              selectedDay === 'training'
                ? 'bg-primary border-primary text-primary-foreground shadow-xl transform scale-105'
                : 'bg-surface-highlight/50 border-border/50 text-foreground/90 md:hover:border-primary/70 md:hover:shadow-lg md:hover:scale-[1.03]'
            }`}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          >
            <Dumbbell className="mx-auto mb-2" size={28} />
            <p className="font-bold text-lg">Training Day</p>
            <p className="text-[11px] opacity-70 mt-1">
              {resolvedTodayTrainingSessions.length > 0
                ? epocEnabled
                  ? `~${Math.round(resolvedTrainingCalories)} kcal + ${Math.round(resolvedTrainingEpocTotal)} EPOC`
                  : `~${Math.round(resolvedTrainingCalories)} kcal`
                : 'Tap to add session'}
            </p>
            <AnimatePresence initial={false}>
              {selectedDay === 'training' && (
                <motion.div
                  key="training-adjust"
                  initial={{ opacity: 0, height: 0, marginTop: 0 }}
                  animate={{ opacity: 0.85, height: 'auto', marginTop: 8 }}
                  exit={{ opacity: 0, height: 0, marginTop: 0 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="overflow-hidden"
                >
                  <p className="text-[11px] tracking-wide">
                    Tap again to adjust
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>
          <motion.button
            onClick={onRestDayClick}
            type="button"
            className={`p-4 rounded-xl border-2 transition-all grid grid-rows-[auto_auto_auto] place-items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-indigo/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
              selectedDay === 'rest'
                ? 'bg-accent-indigo border-accent-indigo/70 text-primary-foreground shadow-lg transform scale-105'
                : 'bg-surface-highlight/50 border-border/50 text-muted md:hover:border-muted'
            }`}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          >
            <Activity className="mb-2" size={28} />
            <p className="font-bold text-lg">Rest Day</p>
            <p className="text-xs md:text-sm opacity-80">No training</p>
          </motion.button>
        </div>
      </div>

      <motion.div
        className="bg-surface rounded-2xl p-6 border border-border shadow-lg"
        layout={!isSwiping}
        initial={false}
        transition={{ type: 'spring', stiffness: 120, damping: 18 }}
      >
        <AnimatePresence mode="wait" initial={false}>
          {resolvedHasCardioSessions ? (
            <motion.div
              key="cardio-list"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
            >
              <motion.div
                className="flex items-center justify-between mb-4"
                layout={isSwiping ? false : 'position'}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                <div className="flex items-center gap-2">
                  <Heart className="text-accent-blue" size={24} />
                  <h2 className="text-xl font-bold text-foreground">
                    Cardio Sessions
                  </h2>
                </div>
                <motion.button
                  onClick={onAddCardioClick}
                  type="button"
                  className="bg-primary text-primary-foreground px-4 py-2 rounded-lg flex items-center gap-2 transition-all press-feedback focus-ring md:hover:brightness-110"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <Plus size={20} />
                  Add
                </motion.button>
              </motion.div>

              <motion.div
                layout={!isSwiping}
                className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4"
              >
                <AnimatePresence initial={false}>
                  {resolvedCardioSessions.map((session) => {
                    const cardioType = resolvedCardioTypes[session.type];
                    const label = cardioType?.label ?? 'Unknown cardio type';
                    const durationValue = Number.isFinite(
                      Number(session.duration)
                    )
                      ? Number(session.duration)
                      : 0;
                    const calories = calculateCardioCalories(session);
                    const sessionEpoc = epocEnabled
                      ? resolveCardioSessionEpoc({
                          session,
                          exerciseCalories: calories,
                          cardioType: resolvedCardioTypes?.[session?.type],
                          userData: resolvedUserData,
                        })
                      : null;
                    const epocCalories =
                      Number(sessionEpoc?.totalCalories) || 0;
                    const effortType = session.effortType ?? 'intensity';
                    const heartRate = Number(session.averageHeartRate);
                    const hasHeartRate =
                      Number.isFinite(heartRate) && heartRate > 0;
                    const intensityLabel = session.intensity
                      ? `${session.intensity.charAt(0).toUpperCase()}${session.intensity.slice(1)}`
                      : 'Moderate';
                    const effortDisplay =
                      effortType === 'heartRate'
                        ? hasHeartRate
                          ? `${heartRate} bpm`
                          : 'N/A bpm'
                        : intensityLabel;
                    const showMissingTypeWarning = !cardioType;

                    return (
                      <motion.div
                        key={session.id}
                        layout={!isSwiping}
                        initial={{ opacity: 0, y: 12, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -12, scale: 0.95 }}
                        transition={{ duration: 0.25, ease: 'easeOut' }}
                        className="bg-surface-highlight/50 rounded-lg p-4 border border-border/50 flex justify-between items-start gap-4 shadow-lg shadow-background/20"
                      >
                        <div>
                          <p className="text-foreground font-semibold">
                            {label}
                          </p>
                          <p className="text-muted text-sm">
                            {durationValue} min • {effortDisplay} • ~{calories}{' '}
                            kcal
                            {epocEnabled &&
                              ` + ~${Math.round(epocCalories)} EPOC`}
                          </p>
                          {showMissingTypeWarning && (
                            <p className="text-accent-amber text-xs mt-1">
                              Cardio type removed; consider replacing this
                              session.
                            </p>
                          )}
                        </div>
                        <div className="flex items-end gap-6 pt-1">
                          <motion.button
                            onClick={() => onEditCardioSession?.(session.id)}
                            type="button"
                            className="text-foreground/80 transition-all pressable-inline focus-ring md:hover:text-foreground"
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                          >
                            <Edit3 size={22} />
                          </motion.button>
                          <motion.button
                            onClick={() => onRemoveCardioSession(session.id)}
                            type="button"
                            className="text-accent-red transition-all pressable-inline focus-ring md:hover:text-accent-red/80"
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                          >
                            <Trash2 size={22} />
                          </motion.button>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </motion.div>

              <motion.div
                layout={!isSwiping}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className="bg-accent-blue/30 border border-accent-blue rounded-lg p-3"
              >
                <p className="text-accent-blue font-semibold">
                  Total Cardio Burn: {resolvedTotalCardioBurn} calories
                  {epocEnabled &&
                    ` (+${Math.round(resolvedCardioEpocTotal)} EPOC)`}
                </p>
              </motion.div>
            </motion.div>
          ) : (
            <motion.div
              key="cardio-empty"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
            >
              <motion.button
                onClick={onAddCardioClick}
                type="button"
                className="w-full flex items-center justify-between p-4 rounded-xl transition-all group pressable-card focus-ring md:hover:bg-surface-highlight/50"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
              >
                <div className="flex items-center gap-3">
                  <Heart className="text-accent-blue" size={24} />
                  <div className="text-left">
                    <h2 className="text-lg font-bold text-foreground">
                      Add Cardio Session
                    </h2>
                    <p className="text-muted text-sm">
                      Track your cardio activities
                    </p>
                  </div>
                </div>
                <Plus
                  className="text-muted md:group-hover:text-primary transition-colors"
                  size={24}
                />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
