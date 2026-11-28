import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, Flame, Info, Pin, X } from 'lucide-react';
import { shallow } from 'zustand/shallow';
import { ModalShell } from '../../common/ModalShell';
import { goals as baseGoals } from '../../../../constants/goals/goals';
import { normalizeOnTargetTolerance } from '../../../../constants/goals/onTarget';
import { useEnergyMapStore } from '../../../../store/useEnergyMapStore';
import { useUnits } from '../../../../hooks/useUnits';
import { useReducedMotionPreference } from '../../../../hooks/useMotionMode';
import {
  formatIntakeRange,
  judgeIntakeAgainstTarget,
} from '../../../../utils/calculations/dayLedgerPresentation';

const LONG_PRESS_DURATION = 650;

const formatStepsLabel = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return `${value.toLocaleString()} steps`;
  return `${value} steps`;
};

const formatTdeeLabel = (tdee, difference, energy) => {
  const total = energy.value(Number(tdee) || 0);

  if (Math.round(Number(difference) || 0) === 0) {
    return `TDEE: ${total}`;
  }

  const change = energy.value(difference, { signed: true });
  return `TDEE: ${total} (${change} ${energy.shortUnit})`;
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
  pinnedCalorieTargets,
  onTogglePinnedCalorieTarget,
  onTargetToleranceKcal,
}) => {
  const units = useUnits();
  const reduceMotion = useReducedMotionPreference();
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (prevIsOpen !== isOpen) {
    setPrevIsOpen(isOpen);
    if (!isOpen && isInfoOpen) {
      setIsInfoOpen(false);
    }
  }
  const [longPressingId, setLongPressingId] = useState(null);
  const longPressTimerRef = useRef(null);
  const skipNextClickRef = useRef(false);
  const {
    storePinnedCalorieTargets,
    togglePinnedCalorieTarget,
    storeOnTargetToleranceKcal,
  } = useEnergyMapStore(
    (state) => ({
      storePinnedCalorieTargets: state.pinnedCalorieTargets,
      togglePinnedCalorieTarget: state.togglePinnedCalorieTarget,
      storeOnTargetToleranceKcal: state.userData?.onTargetToleranceKcal,
    }),
    shallow
  );

  const resolvedTolerance = normalizeOnTargetTolerance(
    onTargetToleranceKcal ?? storeOnTargetToleranceKcal
  );

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

  const resolvedPinnedCalorieTargets =
    pinnedCalorieTargets ?? storePinnedCalorieTargets;
  const resolvedTogglePinnedCalorieTarget =
    onTogglePinnedCalorieTarget ?? togglePinnedCalorieTarget;

  const displayOptions = useMemo(() => {
    const pinned = Array.isArray(resolvedPinnedCalorieTargets)
      ? resolvedPinnedCalorieTargets
      : [];

    return [...options].sort((a, b) => {
      const aId = String(a?.id ?? a?.key ?? '').trim();
      const bId = String(b?.id ?? b?.key ?? '').trim();
      const aIsPinned = pinned.includes(aId);
      const bIsPinned = pinned.includes(bId);

      if (aIsPinned && !bIsPinned) return -1;
      if (!aIsPinned && bIsPinned) return 1;
      return 0;
    });
  }, [options, resolvedPinnedCalorieTargets]);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  const handlePressStart = (targetId, event) => {
    if (event?.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    setLongPressingId(targetId);
    skipNextClickRef.current = false;

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }

    longPressTimerRef.current = setTimeout(() => {
      resolvedTogglePinnedCalorieTarget?.(targetId);
      skipNextClickRef.current = true;
      setLongPressingId(null);
    }, LONG_PRESS_DURATION);
  };

  const handlePressEnd = (shouldResetSkip = false) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
    setLongPressingId(null);

    if (shouldResetSkip) {
      skipNextClickRef.current = false;
    }
  };

  const handleSelect = (option) => {
    if (skipNextClickRef.current) {
      skipNextClickRef.current = false;
      return;
    }

    setIsInfoOpen(false);
    onSelect?.(option);
    onClose?.();
  };

  const popoverMotion = reduceMotion
    ? {
        initial: false,
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: undefined,
        transition: { duration: 0 },
      }
    : {
        initial: { opacity: 0, scale: 0.94, y: -6 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.95, y: -4 },
        transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] },
      };

  const backdropMotion = reduceMotion
    ? {
        initial: false,
        animate: { opacity: 1 },
        exit: undefined,
        transition: { duration: 0 },
      }
    : {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.14 },
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
          <Flame className="text-accent-blue shrink-0" size={28} />
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

        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setIsInfoOpen((prev) => !prev)}
            className={`relative z-20 h-8 w-8 rounded-full border transition-colors flex items-center justify-center focus-ring pressable-inline ${
              isInfoOpen
                ? 'border-accent-blue bg-accent-blue/15 text-accent-blue'
                : 'border-border bg-surface-highlight text-muted md:hover:text-foreground md:hover:border-muted/50'
            }`}
            aria-label="Show calorie target list info"
            aria-expanded={isInfoOpen}
          >
            <Info size={15} />
          </button>

          <AnimatePresence>
            {isInfoOpen && (
              <motion.div
                key="calorie-target-info-backdrop"
                data-testid="calorie-target-info-backdrop"
                aria-hidden="true"
                initial={backdropMotion.initial}
                animate={backdropMotion.animate}
                exit={backdropMotion.exit}
                transition={backdropMotion.transition}
                onClick={() => setIsInfoOpen(false)}
                className="fixed inset-0 z-10"
              />
            )}
            {isInfoOpen && (
              <motion.div
                key="calorie-target-info-card"
                role="region"
                aria-label="Calorie target list info"
                initial={popoverMotion.initial}
                animate={popoverMotion.animate}
                exit={popoverMotion.exit}
                transition={popoverMotion.transition}
                className="absolute right-0 top-full mt-2 z-20 origin-top-right w-[min(20rem,calc(100vw-4.5rem))] rounded-2xl border border-border/80 bg-surface/95 supports-[backdrop-filter]:bg-surface/90 backdrop-blur-xl p-3.5 shadow-2xl shadow-background/40"
              >
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <p className="text-foreground text-sm font-semibold leading-tight">
                    How these targets work
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsInfoOpen(false)}
                    className="h-6 w-6 rounded-full text-muted md:hover:text-foreground md:hover:bg-surface-highlight transition-colors flex items-center justify-center focus-ring pressable-inline"
                    aria-label="Close calorie target info"
                  >
                    <X size={14} />
                  </button>
                </div>

                <ul className="space-y-2 text-xs leading-relaxed text-muted">
                  <li className="flex items-start gap-2">
                    <Flame
                      size={13}
                      className="text-accent-blue shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <span>
                      The bold figure is your goal-adjusted daily target; the{' '}
                      <span className="text-foreground font-medium">
                        ±{units.energy.format(resolvedTolerance)}
                      </span>{' '}
                      on-target range sits to its left.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Activity
                      size={13}
                      className="text-accent-indigo shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <span>
                      The{' '}
                      <span className="text-foreground font-medium">TDEE</span>{' '}
                      line shows today’s estimated burn for that step count (or{' '}
                      <span className="text-foreground font-medium">
                        Live Steps
                      </span>{' '}
                      when health sync is connected), plus your goal’s
                      adjustment.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Pin
                      size={13}
                      className="text-accent-blue shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <span>
                      <span className="text-foreground font-medium">
                        Press and hold
                      </span>{' '}
                      any row to pin or unpin it at the top of the list.
                    </span>
                  </li>
                </ul>

                <div className="mt-3 rounded-xl bg-surface-highlight/70 border border-border/70 px-3 py-2 text-xs">
                  <p className="text-foreground font-medium">
                    Customize in Settings
                  </p>
                  <p className="text-muted mt-1 leading-relaxed">
                    Edit step ranges in{' '}
                    <span className="text-foreground font-medium">
                      Activity &amp; Steps
                    </span>
                    , or change the on-target range in{' '}
                    <span className="text-foreground font-medium">
                      Food &amp; Macros
                    </span>
                    .
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="space-y-2 max-h-[60vh] overflow-y-auto">
        {displayOptions.map((option) => {
          const isSelected = option.key === selectedKey;
          const optionId = String(option.id ?? option.key ?? '').trim();
          const isPinned = resolvedPinnedCalorieTargets.includes(optionId);
          const isLongPressing = longPressingId === optionId;
          const baseSurfaceClass = isSelected
            ? 'border-primary bg-primary'
            : isPinned || isLongPressing
              ? 'border-accent-blue bg-surface-highlight md:hover:bg-surface-highlight/60'
              : 'border-border bg-surface-highlight md:hover:bg-surface-highlight/60';
          const { range: targetRange } = judgeIntakeAgainstTarget({
            targetCalories: option.targetCalories,
            tolerance: resolvedTolerance,
          });
          const targetRangeText = targetRange
            ? formatIntakeRange(targetRange, units)
            : null;

          return (
            <button
              key={option.key}
              type="button"
              onClick={() => handleSelect(option)}
              onPointerDown={(event) => handlePressStart(optionId, event)}
              onPointerUp={() => handlePressEnd(false)}
              onPointerLeave={() => handlePressEnd(true)}
              onPointerCancel={() => handlePressEnd(true)}
              className={`relative w-full rounded-xl border px-3 py-3 text-left transition-all focus-ring ${baseSurfaceClass} ${
                isLongPressing ? 'scale-[0.98]' : 'pressable-card'
              }`}
            >
              {isPinned && (
                <div
                  className={`absolute top-2 right-2 w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-primary-foreground' : 'bg-accent-blue'}`}
                />
              )}
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
                <div className="shrink-0 text-right">
                  <p className="flex items-baseline justify-end gap-1.5 whitespace-nowrap">
                    {targetRangeText && (
                      <span
                        data-testid="calorie-target-range"
                        className={`text-xs font-normal ${
                          isSelected
                            ? 'text-primary-foreground/85'
                            : 'text-muted'
                        }`}
                      >
                        ({targetRangeText})
                      </span>
                    )}
                    <span className="text-lg font-bold text-foreground">
                      {units.energy.value(option.targetCalories || 0)}
                    </span>
                  </p>
                  <p
                    className={`text-xs mt-0.5 ${isSelected ? 'text-primary-foreground' : 'text-muted'}`}
                  >
                    {formatTdeeLabel(
                      option.tdee,
                      option.difference,
                      units.energy
                    )}
                  </p>
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
