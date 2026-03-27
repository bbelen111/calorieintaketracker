import React from 'react';
import { Star } from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';
import { DateInput } from '../../common/DateInput';
import { goals } from '../../../../constants/goals';
const getGoalClasses = (key, selected) => {
  const goal = goals[key];
  if (!goal)
    return 'border-border bg-surface text-muted md:hover:border-accent-blue/50';
  if (!selected)
    return 'border-border bg-surface text-muted md:hover:border-accent-blue/50';
  // Use color for bg, white border, and text
  return `${goal.color} border-2 border-border text-primary-foreground`;
};

export const PhaseCreationModal = ({
  isOpen,
  isClosing,
  phaseName,
  startDate,
  endDate,
  goalType,
  targetWeight,
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
        <h3 className="text-foreground font-bold text-xl">Create New Phase</h3>
        <button
          type="button"
          onClick={onTemplatesClick}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-highlight px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-foreground transition-colors md:hover:border-accent-amber focus-ring pressable"
        >
          <Star size={14} />
          Templates
        </button>
      </div>

      <div className="space-y-4">
        {/* Phase Name */}
        <div>
          <label className="block text-foreground text-sm font-semibold mb-2">
            Phase Name <span className="text-accent-red">*</span>
          </label>
          <input
            type="text"
            value={phaseName}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="e.g., Winter Bulk 2025, Summer Shred"
            className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-foreground placeholder:text-muted focus:outline-none focus:border-accent-blue focus-ring"
            maxLength={50}
          />
        </div>

        {/* Date Range */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-foreground text-sm font-semibold mb-2">
              Start Date <span className="text-accent-red">*</span>
            </label>
            <DateInput
              value={startDate}
              onChange={(val) => onStartDateChange(val)}
              className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-foreground focus:outline-none focus:border-accent-blue focus-ring"
            />
          </div>

          <div>
            <label className="block text-foreground text-sm font-semibold mb-2">
              End Date{' '}
              <span className="text-muted text-xs font-normal">(optional)</span>
            </label>
            <DateInput
              value={endDate}
              onChange={(val) => onEndDateChange(val)}
              min={startDate}
              className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-foreground focus:outline-none focus:border-accent-blue focus-ring"
            />
          </div>
        </div>

        {/* Goal Type */}
        <div>
          <label className="block text-foreground text-sm font-semibold mb-2">
            Goal <span className="text-accent-red">*</span>
          </label>
          {/* DEBUG LOG: Remove after testing
          {process.env.NODE_ENV !== 'production' && (
            <div className="text-xs text-accent-yellow mb-2">
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
          <label className="block text-foreground text-sm font-semibold mb-2">
            Target Weight (kg){' '}
            <span className="text-muted text-xs font-normal">(optional)</span>
          </label>
          <input
            type="number"
            value={targetWeight}
            onChange={(e) => onTargetWeightChange(e.target.value)}
            placeholder="Leave empty for no specific target"
            min="30"
            max="210"
            step="0.1"
            className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-foreground placeholder:text-muted focus:outline-none focus:border-accent-blue focus-ring"
          />
          <p className="text-muted text-xs mt-1">
            Set a target weight to track your progress toward your goal
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-accent-red/15 border border-accent-red/50 rounded-lg p-3">
            <p className="text-accent-red text-sm">{error}</p>
          </div>
        )}

        {/* Info */}
        {/* <div className="bg-accent-blue/15 border border-accent-blue/50 rounded-lg p-3">
          <p className="text-accent-blue text-xs">
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
          className="flex-1 px-4 py-3 bg-surface-highlight md:hover:bg-surface text-foreground rounded-lg font-semibold transition-all focus-ring press-feedback"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          className="flex-1 px-4 py-3 bg-primary md:hover:brightness-110 text-primary-foreground rounded-lg font-semibold transition-all focus-ring press-feedback"
        >
          Create Phase
        </button>
      </div>
    </ModalShell>
  );
};
