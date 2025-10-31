import React from 'react';
import { Star } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';
import { goals } from '../../../constants/goals';
const getGoalClasses = (key, selected) => {
  const goal = goals[key];
  if (!goal)
    return 'border-slate-600 bg-slate-700 text-slate-300 hover:border-slate-500';
  if (!selected)
    return 'border-slate-600 bg-slate-700 text-slate-300 hover:border-slate-500';
  // Use color for bg, white border, and text
  return `${goal.color} border-2 border-white text-white`;
};

export const PhaseCreationModal = ({
  isOpen,
  isClosing,
  phaseName,
  startDate,
  endDate,
  goalType,
  targetWeight,
  currentWeight,
  onNameChange,
  onStartDateChange,
  onEndDateChange,
  onGoalTypeChange,
  onTargetWeightChange,
  onTemplatesClick,
  onCancel,
  onSave,
  error,
}) => {
  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      contentClassName="w-full md:max-w-2xl p-6 max-h-[90vh] overflow-y-auto"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-bold text-xl">Create New Phase</h3>
        <button
          type="button"
          onClick={onTemplatesClick}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-700 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-100 transition-colors hover:border-amber-400 hover:text-white"
        >
          <Star size={14} />
          Templates
        </button>
      </div>

      <div className="space-y-4">
        {/* Phase Name */}
        <div>
          <label className="block text-slate-300 text-sm font-semibold mb-2">
            Phase Name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={phaseName}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="e.g., Winter Bulk 2025, Summer Shred"
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            maxLength={50}
          />
        </div>

        {/* Date Range */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-slate-300 text-sm font-semibold mb-2">
              Start Date <span className="text-red-400">*</span>
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 text-sm font-semibold mb-2">
              End Date{' '}
              <span className="text-slate-400 text-xs font-normal">
                (optional)
              </span>
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
              min={startDate}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Goal Type */}
        <div>
          <label className="block text-slate-300 text-sm font-semibold mb-2">
            Goal <span className="text-red-400">*</span>
          </label>
          {/* DEBUG LOG: Remove after testing
          {process.env.NODE_ENV !== 'production' && (
            <div className="text-xs text-yellow-300 mb-2">
              <pre>{`goalType: ${goalType}`}</pre>
              <pre>{`goal keys: ${Object.keys(goals).join(', ')}`}</pre>
            </div>
          )} */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {Object.entries(goals).map(([key, goal]) => (
              <button
                key={key}
                type="button"
                onClick={() => onGoalTypeChange(key)}
                className={`p-3 rounded-lg transition-all text-left ${getGoalClasses(key, goalType === key)}`}
              >
                <div className="font-semibold text-sm">{goal.label}</div>
                <div className="text-xs opacity-80 mt-0.5">{goal.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Target Weight */}
        <div>
          <label className="block text-slate-300 text-sm font-semibold mb-2">
            Target Weight (kg){' '}
            <span className="text-slate-400 text-xs font-normal">
              (optional)
            </span>
          </label>
          <input
            type="number"
            value={targetWeight}
            onChange={(e) => onTargetWeightChange(e.target.value)}
            placeholder="Leave empty for no specific target"
            min="30"
            max="210"
            step="0.1"
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-slate-500 text-xs mt-1">
            Set a target weight to track your progress toward your goal
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-3">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        {/* Info */}
        {/* <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-3">
          <p className="text-blue-200 text-xs">
            Phases help you organize your fitness journey into specific time periods with dedicated goals.
            You can track daily calories, weight, and view unified insights for each phase.
          </p>
        </div> */}
      </div>

      {/* Actions */}
      <div className="flex gap-3 mt-6">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition-all"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition-all"
        >
          Create Phase
        </button>
      </div>
    </ModalShell>
  );
};
