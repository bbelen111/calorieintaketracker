import React, { useState } from 'react';
import { Flame, Info, X } from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';
import { goals as baseGoals } from '../../../../constants/goals/goals';

const formatStepsLabel = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return `${value.toLocaleString()} steps`;
  return `${value} steps`;
};

const formatTdeeLabel = (tdee, difference) => {
  const resolvedTdee = Math.round(Number(tdee) || 0);
  const resolvedDifference = Math.round(Number(difference) || 0);

  if (resolvedDifference === 0) {
    return `TDEE: ${resolvedTdee.toLocaleString()}`;
  }

  const differencePrefix = resolvedDifference > 0 ? '+' : '';
  return `TDEE: ${resolvedTdee.toLocaleString()} (${differencePrefix}${resolvedDifference.toLocaleString()} cal)`;
};

export const CalorieTargetModal = ({
  isOpen,
  isClosing,
  onClose,
  options = [],
  selectedKey,
  onSelect,
  selectedGoal,
  selectedDay,
  goals,
}) => {
  const [isInfoOpen, setIsInfoOpen] = useState(false);

  const resolvedGoals = goals ?? baseGoals;
  const goalTextClasses = {
    aggressive_bulk: 'text-accent-purple',
    bulking: 'text-accent-green',
    maintenance: 'text-accent-blue/80',
    cutting: 'text-accent-yellow',
    aggressive_cut: 'text-accent-orange',
  };
  const resolvedGoalKey = selectedGoal ?? 'maintenance';
  const goalTextClass =
    goalTextClasses[resolvedGoalKey] ?? 'text-accent-blue/80';
  const isTrainingDay = selectedDay === 'training';
  const dayLabel = isTrainingDay ? 'Training Day' : 'Rest Day';
  const dayTextClass = isTrainingDay
    ? 'text-accent-blue'
    : 'text-accent-indigo';
  const goalLabel =
    resolvedGoals?.[resolvedGoalKey]?.label ??
    resolvedGoals?.maintenance?.label ??
    'Maintenance';

  const handleSelect = (option) => {
    onSelect?.(option);
    onClose?.();
  };

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      onClose={onClose}
      contentClassName="w-full md:max-w-md p-5"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <Flame className="text-accent-blue flex-shrink-0" size={28} />
          <div>
            <h3 className="text-foreground font-bold text-xl">
              Calorie Target
            </h3>
            <div>
              <span
                className={`${goalTextClass} text-xs tracking-widest font-semibold uppercase`}
              >
                {goalLabel}
              </span>
              <span className="text-muted text-sm font-normal mx-2">•</span>
              <span className={`${dayTextClass} text-sm font-semibold`}>
                {dayLabel}
              </span>
            </div>
          </div>
        </div>

        <div className="relative flex-shrink-0">
          <button
            type="button"
            onClick={() => setIsInfoOpen((prev) => !prev)}
            className={`h-8 w-8 rounded-full border transition-colors flex items-center justify-center focus-ring pressable-inline ${
              isInfoOpen
                ? 'border-accent-blue bg-accent-blue/15 text-accent-blue'
                : 'border-border bg-surface-highlight text-muted md:hover:text-foreground md:hover:border-muted/50'
            }`}
            aria-label="Show calorie target list info"
            aria-expanded={isInfoOpen}
          >
            <Info size={15} />
          </button>

          {isInfoOpen ? (
            <div className="absolute right-0 top-full mt-2 z-10 w-[min(20rem,calc(100vw-3rem))] rounded-xl border border-border bg-surface p-3 shadow-lg">
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="text-foreground text-sm font-semibold leading-tight">
                  How these targets are built
                </p>
                <button
                  type="button"
                  onClick={() => setIsInfoOpen(false)}
                  className="text-muted md:hover:text-foreground transition-colors focus-ring pressable-inline rounded"
                  aria-label="Close calorie target info"
                >
                  <X size={14} />
                </button>
              </div>

              <ul className="space-y-1.5 text-xs text-muted">
                <li>
                  • Each row pairs a{' '}
                  <span className="text-foreground font-medium">
                    step range
                  </span>{' '}
                  with today’s estimated{' '}
                  <span className="text-foreground font-medium">TDEE</span>.
                </li>
                <li>
                  • The bold number is your{' '}
                  <span className="text-foreground font-medium">
                    goal-adjusted calorie target
                  </span>{' '}
                  for that range.
                </li>
                <li>
                  • The TDEE line shows how far each option is from your current
                  baseline.
                </li>
              </ul>

              <div className="mt-3 rounded-lg bg-surface-highlight border border-border px-2.5 py-2">
                <p className="text-xs text-foreground font-medium">
                  Want to add/edit options?
                </p>
                <p className="text-xs text-muted mt-1">
                  Update your step ranges in Tracker settings. This list is
                  generated automatically from those ranges.
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-2 max-h-[60vh] overflow-y-auto">
        {options.map((option) => {
          const isSelected = option.key === selectedKey;

          return (
            <button
              key={option.key}
              type="button"
              onClick={() => handleSelect(option)}
              className={`w-full rounded-xl border px-3 py-3 text-left transition-all pressable-card focus-ring ${
                isSelected
                  ? 'border-primary bg-primary'
                  : 'border-border bg-surface-highlight md:hover:bg-surface-highlight/60'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-foreground font-semibold text-sm flex items-center gap-1.5">
                    <span>{option.label}</span>
                  </p>
                  <p
                    className={`text-xs mt-0.5 ${isSelected ? 'text-primary-foreground' : 'text-muted'}`}
                  >
                    {formatStepsLabel(option.steps)}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="text-right">
                    <p className="text-lg font-bold text-foreground">
                      {Math.round(option.targetCalories || 0).toLocaleString()}
                    </p>
                    <p
                      className={`text-xs mt-0.5 ${isSelected ? 'text-primary-foreground' : 'text-muted'}`}
                    >
                      {formatTdeeLabel(option.tdee, option.difference)}
                    </p>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        <button
          type="button"
          onClick={onClose}
          className="w-full px-4 py-3 rounded-lg bg-surface-highlight text-foreground transition-all press-feedback focus-ring md:hover:bg-surface"
        >
          Close
        </button>
      </div>
    </ModalShell>
  );
};
