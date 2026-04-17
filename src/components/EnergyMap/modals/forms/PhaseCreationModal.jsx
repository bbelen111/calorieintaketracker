import React, { useMemo } from 'react';
import { Star } from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';
import { DateInput } from '../../common/DateInput';
import { goals } from '../../../../constants/goals/goals';
import { formatDateKeyLocal } from '../../../../utils/data/dateKeys';
import {
  buildFeasibleDateBands,
  estimateRequiredDailyEnergyDelta,
} from '../../../../utils/calculations/phaseTargetPlanning';

const addDaysLocal = (dateKey, days) => {
  if (!dateKey) return null;
  const parsed = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setDate(parsed.getDate() + Math.trunc(days));
  return formatDateKeyLocal(parsed);
};

const getGoalClasses = (key, selected) => {
  const goal = goals[key];
  if (!goal)
    return 'border-border bg-surface text-muted md:hover:border-accent-blue/50';
  if (!selected)
    return 'border-border bg-surface text-muted md:hover:border-accent-blue/50';
  // Use color for bg, white border, and text
  return `${goal.color} border-2 border-border text-primary-foreground`;
};

const getModeButtonClass = (mode, activeMode) =>
  `w-full rounded-lg border px-3 py-1.5 text-sm transition-all focus-ring pressable-inline ${
    activeMode === mode
      ? 'bg-primary border-primary text-primary-foreground shadow-sm'
      : 'bg-surface-highlight text-muted border-border md:hover:border-accent-blue'
  }`;

export const PhaseCreationModal = ({
  isOpen,
  isClosing,
  phaseName,
  creationMode,
  startDate,
  endDate,
  goalType,
  targetWeight,
  targetBodyFat,
  currentWeight,
  currentBodyFat,
  onNameChange,
  onCreationModeChange,
  onStartDateChange,
  onEndDateChange,
  onGoalTypeChange,
  onTargetWeightChange,
  onTargetBodyFatChange,
  onTemplatesClick,
  onCancel,
  onSave,
  error,
}) => {
  const normalizedMode = creationMode === 'goal' ? 'goal' : 'target';
  const parsedTargetWeight = Number(targetWeight);
  const parsedTargetBodyFat = Number(targetBodyFat);
  const hasTargetWeight = Number.isFinite(parsedTargetWeight);
  const hasTargetBodyFat = Number.isFinite(parsedTargetBodyFat);
  const canEvaluateTarget =
    normalizedMode === 'target' &&
    startDate &&
    (hasTargetWeight || hasTargetBodyFat);

  const defaultDateWindow = useMemo(() => {
    if (!startDate) {
      return { minEndDate: '', maxEndDate: '' };
    }

    return {
      minEndDate: addDaysLocal(startDate, 7),
      maxEndDate: addDaysLocal(startDate, 365),
    };
  }, [startDate]);

  const feasibleBands = useMemo(() => {
    if (!canEvaluateTarget) {
      return {
        strictDateKeys: [],
        lenientDateKeys: [],
        blockedDateKeys: [],
        evaluations: [],
      };
    }

    return buildFeasibleDateBands({
      startDate,
      minEndDate: defaultDateWindow.minEndDate,
      maxEndDate: defaultDateWindow.maxEndDate,
      startWeightKg: currentWeight,
      targetWeightKg: hasTargetWeight ? parsedTargetWeight : null,
      startBodyFatPercent: currentBodyFat,
      targetBodyFatPercent: hasTargetBodyFat ? parsedTargetBodyFat : null,
    });
  }, [
    canEvaluateTarget,
    currentBodyFat,
    currentWeight,
    defaultDateWindow.maxEndDate,
    defaultDateWindow.minEndDate,
    hasTargetBodyFat,
    hasTargetWeight,
    parsedTargetBodyFat,
    parsedTargetWeight,
    startDate,
  ]);

  const allowedDateKeys = useMemo(() => {
    const merged = [
      ...feasibleBands.strictDateKeys,
      ...feasibleBands.lenientDateKeys,
    ];
    return [...new Set(merged)].sort();
  }, [feasibleBands.lenientDateKeys, feasibleBands.strictDateKeys]);

  const constrainedDateBounds = useMemo(() => {
    if (allowedDateKeys.length === 0) {
      return {
        min: defaultDateWindow.minEndDate,
        max: defaultDateWindow.maxEndDate,
      };
    }

    return {
      min: allowedDateKeys[0],
      max: allowedDateKeys[allowedDateKeys.length - 1],
    };
  }, [
    allowedDateKeys,
    defaultDateWindow.maxEndDate,
    defaultDateWindow.minEndDate,
  ]);

  const targetPlan = useMemo(() => {
    if (!canEvaluateTarget || !endDate) {
      return null;
    }

    return estimateRequiredDailyEnergyDelta({
      startDate,
      endDate,
      startWeightKg: currentWeight,
      targetWeightKg: hasTargetWeight ? parsedTargetWeight : null,
      startBodyFatPercent: currentBodyFat,
      targetBodyFatPercent: hasTargetBodyFat ? parsedTargetBodyFat : null,
    });
  }, [
    canEvaluateTarget,
    currentBodyFat,
    currentWeight,
    endDate,
    hasTargetBodyFat,
    hasTargetWeight,
    parsedTargetBodyFat,
    parsedTargetWeight,
    startDate,
  ]);

  const isEndDateFeasible = !endDate || allowedDateKeys.includes(endDate);
  const strictCount = feasibleBands.strictDateKeys.length;
  const lenientCount = feasibleBands.lenientDateKeys.length;

  const currentBandClass =
    targetPlan?.aggressivenessBand === 'strict'
      ? 'text-accent-green'
      : targetPlan?.aggressivenessBand === 'lenient'
        ? 'text-accent-amber'
        : 'text-accent-red';

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      contentClassName="w-full md:max-w-2xl p-4 md:p-6 max-h-[90vh] overflow-y-auto"
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
        <div>
          <label className="block text-foreground text-sm font-semibold mb-2">
            Creation Mode
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onCreationModeChange('goal')}
              className={getModeButtonClass('goal', normalizedMode)}
            >
              Goal mode
            </button>
            <button
              type="button"
              onClick={() => onCreationModeChange('target')}
              className={getModeButtonClass('target', normalizedMode)}
            >
              Target mode
            </button>
          </div>
          <p className="text-muted text-xs mt-2">
            Goal mode keeps your selected direction. Target mode computes a
            smart daily surplus/deficit to hit a date-bound outcome.
          </p>
        </div>

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

        {/* Start Date */}
        <div>
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
        </div>

        {normalizedMode === 'goal' ? (
          <div>
            <label className="block text-foreground text-sm font-semibold mb-2">
              Goal <span className="text-accent-red">*</span>
            </label>
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
        ) : (
          <div className="rounded-lg border border-border bg-surface-highlight/40 p-3">
            <p className="text-foreground text-sm font-semibold">
              Goal selection
            </p>
            <p className="text-muted text-xs mt-1">
              Hidden in target mode — goal direction is auto-derived from your
              target and timeline.
            </p>
          </div>
        )}

        {/* Target Mode Inputs */}
        {normalizedMode === 'target' ? (
          <div className="rounded-xl border border-border bg-surface-highlight/40 p-4 space-y-3">
            <p className="text-foreground text-sm font-semibold">
              Target outcomes
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-foreground text-sm font-semibold mb-2">
                  Target Weight (kg)
                </label>
                <input
                  type="number"
                  value={targetWeight}
                  onChange={(e) => onTargetWeightChange(e.target.value)}
                  placeholder="e.g. 78.5"
                  min="30"
                  max="210"
                  step="0.1"
                  className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-foreground placeholder:text-muted focus:outline-none focus:border-accent-blue focus-ring"
                />
              </div>
              <div>
                <label className="block text-foreground text-sm font-semibold mb-2">
                  Target Body Fat (%)
                </label>
                <input
                  type="number"
                  value={targetBodyFat}
                  onChange={(e) => onTargetBodyFatChange(e.target.value)}
                  placeholder="e.g. 14"
                  min="3"
                  max="60"
                  step="0.1"
                  className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-foreground placeholder:text-muted focus:outline-none focus:border-accent-blue focus-ring"
                />
              </div>
            </div>

            <p className="text-muted text-xs">
              At least one target metric is required (weight or body fat). End
              date must be feasible.
            </p>

            {canEvaluateTarget && (
              <div className="rounded-lg border border-border bg-surface p-3">
                <p className="text-foreground text-sm font-semibold mb-1">
                  Feasible end-date window
                </p>
                <p className="text-xs text-muted">
                  Strict: {strictCount} days • Lenient: {lenientCount} days
                </p>

                {targetPlan && (
                  <p
                    className={`text-xs mt-2 font-semibold ${currentBandClass}`}
                  >
                    Smart target:{' '}
                    {targetPlan.requiredDailyDeltaCalories > 0 ? '+' : ''}
                    {targetPlan.requiredDailyDeltaCalories} kcal/day (
                    {targetPlan.aggressivenessBand})
                  </p>
                )}

                {!isEndDateFeasible && endDate && (
                  <p className="text-xs text-accent-red mt-2">
                    Selected end date is outside the feasible window for this
                    target.
                  </p>
                )}
              </div>
            )}
          </div>
        ) : null}

        {/* End Date (always last) */}
        <div>
          <label className="block text-foreground text-sm font-semibold mb-2">
            End Date{' '}
            {normalizedMode === 'goal' ? (
              <span className="text-muted text-xs font-normal">(optional)</span>
            ) : (
              <span className="text-accent-red text-xs font-semibold">
                (required)
              </span>
            )}
          </label>
          <DateInput
            value={endDate}
            onChange={(val) => onEndDateChange(val)}
            min={
              normalizedMode === 'target'
                ? constrainedDateBounds.min
                : startDate
            }
            max={normalizedMode === 'target' ? constrainedDateBounds.max : null}
            className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-foreground focus:outline-none focus:border-accent-blue focus-ring"
          />
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
