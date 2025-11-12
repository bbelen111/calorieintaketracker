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

export const HomeScreen = ({
  userData,
  bmr,
  goals,
  selectedGoal,
  onGoalClick,
  onSettingsClick,
  onAgeClick,
  onHeightClick,
  onWeightClick,
  weightDisplay,
  onBmrClick,
  selectedDay,
  onTrainingDayClick,
  onRestDayClick,
  trainingCalories,
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
  const goalConfig = goals[selectedGoal];
  const weightTileValue = weightDisplay ?? `${userData.weight} kg`;

  return (
    <div className="space-y-6 pb-10">
      <div className="bg-slate-800 rounded-2xl p-6 md:p-8 border border-slate-700 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Activity className="text-blue-400" size={32} />
            <h1 className="text-2xl md:text-3xl font-bold text-white">
              Your Energy Map
            </h1>
          </div>
          <button
            onClick={onSettingsClick}
            type="button"
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition-all"
          >
            <Settings size={20} />
            <span className="hidden md:inline">Settings</span>
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <button
            onClick={onAgeClick}
            type="button"
            className="bg-slate-700/50 border border-slate-600/50 hover:bg-slate-700 rounded-lg p-3 transition-all text-left group shadow-lg shadow-slate-900/20"
          >
            <div className="flex items-center justify-between">
              <p className="text-slate-400">Age</p>
              <Edit3
                size={14}
                className="text-slate-500 group-hover:text-blue-400 transition-colors"
              />
            </div>
            <p className="text-white font-semibold text-lg">
              {userData.age} years
            </p>
          </button>
          <button
            onClick={onWeightClick}
            type="button"
            className="bg-slate-700/50 border border-slate-600/50 hover:bg-slate-700 rounded-lg p-3 transition-all text-left group shadow-lg shadow-slate-900/20"
          >
            <div className="flex items-center justify-between">
              <p className="text-slate-400">Weight</p>
              <Edit3
                size={14}
                className="text-slate-500 group-hover:text-blue-400 transition-colors"
              />
            </div>
            <p className="text-white font-semibold text-lg">
              {weightTileValue}
            </p>
          </button>
          <button
            onClick={onHeightClick}
            type="button"
            className="bg-slate-700/50 border border-slate-600/50 hover:bg-slate-700 rounded-lg p-3 transition-all text-left group shadow-lg shadow-slate-900/20"
          >
            <div className="flex items-center justify-between">
              <p className="text-slate-400">Height</p>
              <Edit3
                size={14}
                className="text-slate-500 group-hover:text-blue-400 transition-colors"
              />
            </div>
            <p className="text-white font-semibold text-lg">
              {userData.height} cm
            </p>
          </button>
          <button
            onClick={onBmrClick}
            type="button"
            className="bg-slate-700/50 border border-slate-600/50 hover:bg-slate-700 rounded-lg p-3 transition-all text-left group shadow-lg shadow-slate-900/20"
          >
            <div className="flex items-center justify-between">
              <p className="text-slate-400">BMR</p>
              <Info
                size={14}
                className="text-slate-500 group-hover:text-blue-400 transition-colors"
              />
            </div>
            <p className="text-white font-semibold text-lg">{bmr} kcal</p>
          </button>
        </div>
      </div>

      <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-2xl">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Target className="text-blue-400" size={18} />
          Your Goal
        </h2>
        <button
          onClick={onGoalClick}
          type="button"
          className={`w-full p-4 rounded-xl border-2 transition-all relative ${goalConfig.color} border-white text-white shadow-lg hover:scale-[1.02] active:scale-[0.98]`}
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
          <div className="mt-4 bg-yellow-900/30 border-2 border-yellow-600 rounded-xl p-4">
            <p className="text-yellow-300 text-sm font-medium">
              {goalConfig.warning}
            </p>
          </div>
        )}
      </div>

      <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-2xl">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Calendar className="text-blue-400" size={18} />
          Day Type
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <motion.button
            onClick={onTrainingDayClick}
            type="button"
            className={`p-4 rounded-xl border-2 transition-all relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-800 ${
              selectedDay === 'training'
                ? 'bg-purple-600 border-white text-white shadow-xl transform scale-105'
                : 'bg-slate-700/50 border-slate-600/50 text-slate-200 hover:border-purple-400 hover:shadow-lg hover:scale-[1.03]'
            }`}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          >
            <AnimatePresence initial={false}>
              {selectedDay === 'training' && (
                <motion.span
                  key="training-edit"
                  initial={{ opacity: 0, scale: 0.6, y: -6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.6, y: -6 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="absolute top-2 right-2 text-white/80"
                >
                  <Edit3 size={14} />
                </motion.span>
              )}
            </AnimatePresence>
            <Dumbbell className="mx-auto mb-2" size={28} />
            <p className="font-bold text-lg">Training Day</p>
            <p className="text-xs md:text-sm opacity-80">
              {userData.trainingDuration}hrs{' '}
              {trainingTypes[userData.trainingType].label}
            </p>
            <p className="text-[11px] opacity-70 mt-1">
              ~{Math.round(trainingCalories)} kcal burn
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
            className={`p-4 rounded-xl border-2 transition-all grid grid-rows-[auto_auto_auto] place-items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-800 ${
              selectedDay === 'rest'
                ? 'bg-indigo-600 border-white text-white shadow-lg transform scale-105'
                : 'bg-slate-700/50 border-slate-600/50 text-slate-300 hover:border-slate-500'
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
        className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-2xl"
        layout={!isSwiping}
        initial={false}
        transition={{ type: 'spring', stiffness: 120, damping: 18 }}
      >
        <AnimatePresence mode="wait" initial={false}>
          {hasCardioSessions ? (
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
                  <Heart className="text-red-400" size={24} />
                  <h2 className="text-xl font-bold text-white">
                    Cardio Sessions
                  </h2>
                </div>
                <motion.button
                  onClick={onAddCardioClick}
                  type="button"
                  className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all"
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
                  {cardioSessions.map((session) => {
                    const cardioType = cardioTypes[session.type];
                    const label = cardioType?.label ?? 'Unknown cardio type';
                    const durationValue = Number.isFinite(
                      Number(session.duration)
                    )
                      ? Number(session.duration)
                      : 0;
                    const calories = calculateCardioCalories(session);
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
                        className="bg-slate-700/50 rounded-lg p-4 border border-slate-600/50 flex justify-between items-start gap-4 shadow-lg shadow-slate-900/20"
                      >
                        <div>
                          <p className="text-white font-semibold">{label}</p>
                          <p className="text-slate-400 text-sm">
                            {durationValue} min • {effortDisplay} • ~{calories}{' '}
                            kcal
                          </p>
                          {showMissingTypeWarning && (
                            <p className="text-amber-300 text-xs mt-1">
                              Cardio type removed; consider replacing this
                              session.
                            </p>
                          )}
                        </div>
                        <div className="flex items-end gap-6 pt-1">
                          <motion.button
                            onClick={() => onEditCardioSession?.(session.id)}
                            type="button"
                            className="text-slate-200 hover:text-white transition-all"
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                          >
                            <Edit3 size={22} />
                          </motion.button>
                          <motion.button
                            onClick={() => onRemoveCardioSession(session.id)}
                            type="button"
                            className="text-red-400 hover:text-red-300 transition-all"
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
                className="bg-red-900/30 border border-red-700 rounded-lg p-3"
              >
                <p className="text-red-300 font-semibold">
                  Total Cardio Burn: {totalCardioBurn} calories
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
                className="w-full flex items-center justify-between p-4 hover:bg-slate-700/50 rounded-xl transition-all group"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
              >
                <div className="flex items-center gap-3">
                  <Heart className="text-red-400" size={24} />
                  <div className="text-left">
                    <h2 className="text-lg font-bold text-white">
                      Add Cardio Session
                    </h2>
                    <p className="text-slate-400 text-sm">
                      Track your cardio activities
                    </p>
                  </div>
                </div>
                <Plus
                  className="text-slate-400 group-hover:text-red-400 transition-colors"
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
