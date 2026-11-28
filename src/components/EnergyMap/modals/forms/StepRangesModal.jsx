import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  Check,
  ChevronsUpDown,
  Flame,
  Footprints,
  Info,
  Layers,
  Lock,
  Minus,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { shallow } from 'zustand/shallow';
import { ModalShell } from '../../common/ModalShell';
import { SegmentedToggle } from '../../common/SegmentedToggle';
import { SmoothHeight } from '../../common/SmoothHeight';
import { NumericValuePickerModal } from '../pickers/NumericValuePickerModal';
import { useEnergyMapStore } from '../../../../store/useEnergyMapStore';
import { useUnits } from '../../../../hooks/useUnits';
import { useAnimatedModal } from '../../../../hooks/useAnimatedModal';
import { useReducedMotionPreference } from '../../../../hooks/useMotionMode';
import {
  DEFAULT_STEP_RANGES,
  STEP_RANGE_MAX_STEPS,
  STEP_RANGE_MIN_STEPS,
  STEP_RANGE_NUDGE_INCREMENT,
  STEP_RANGE_PRESETS,
  STEP_RANGE_WHEEL_INCREMENT,
  buildStepRangeLabel,
  findActiveStepRangePreset,
  findMatchingStepRange,
  formatStepRangeEstimate,
  getNextSuggestedStepCount,
  getStepDetails,
  resolveClosestStepRange,
} from '../../../../utils/calculations/steps';

const ROW_EASE = [0.32, 0.72, 0, 1];

const BUILDER_MODES = [
  { id: 'exact', label: 'Exact' },
  { id: 'range', label: 'Range' },
  { id: 'under', label: 'Under' },
  { id: 'over', label: 'Over' },
];

const SINGLE_PREFIX_BY_MODE = {
  exact: '',
  under: '<',
  over: '>',
};

const clampStepCount = (
  value,
  min = STEP_RANGE_MIN_STEPS,
  max = STEP_RANGE_MAX_STEPS
) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return min;
  }
  const snapped =
    Math.round(numeric / STEP_RANGE_WHEEL_INCREMENT) *
    STEP_RANGE_WHEEL_INCREMENT;
  return Math.min(Math.max(snapped, min), max);
};

const formatWheelSteps = (value) => Math.round(Number(value)).toLocaleString();

export const StepRangesModal = ({
  isOpen,
  isClosing,
  stepRanges,
  activeStepRange = null,
  onSelectActiveRange,
  onOpenCalorieTargetModal,
  onAddRange,
  onRemoveRange,
  onReplaceRanges,
  onClose,
}) => {
  const units = useUnits();
  const reduceMotion = useReducedMotionPreference();
  const stepWheelModal = useAnimatedModal(false, 220);
  const highlightTimerRef = useRef(null);
  const rowRefs = useRef(new Map());

  const store = useEnergyMapStore(
    (state) => ({
      stepRanges: state.userData?.stepRanges ?? [],
      weight: state.userData?.weight,
      height: state.userData?.height,
      gender: state.userData?.gender,
      addStepRange: state.addStepRange,
      removeStepRange: state.removeStepRange,
      setStepRanges: state.setStepRanges,
    }),
    shallow
  );

  const resolvedStepRanges = useMemo(
    () =>
      Array.isArray(stepRanges)
        ? stepRanges
        : Array.isArray(store.stepRanges)
          ? store.stepRanges
          : [],
    [stepRanges, store.stepRanges]
  );

  const resolvedActiveStepRange =
    typeof activeStepRange === 'string' && activeStepRange.trim().length > 0
      ? activeStepRange.trim()
      : null;

  const resolvedAddRange = onAddRange ?? store.addStepRange;
  const resolvedRemoveRange = onRemoveRange ?? store.removeStepRange;
  const resolvedReplaceRanges = onReplaceRanges ?? store.setStepRanges;

  const userProfile = useMemo(
    () => ({
      weight: store.weight,
      height: store.height,
      gender: store.gender,
    }),
    [store.weight, store.height, store.gender]
  );

  const [activeView, setActiveView] = useState('ranges');
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [builderMode, setBuilderMode] = useState('exact');
  const [singleSteps, setSingleSteps] = useState(() =>
    getNextSuggestedStepCount(resolvedStepRanges)
  );
  const [rangeFromSteps, setRangeFromSteps] = useState(10000);
  const [rangeToSteps, setRangeToSteps] = useState(12000);
  const [wheelTarget, setWheelTarget] = useState('single');
  const [highlightedRange, setHighlightedRange] = useState(null);

  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (prevIsOpen !== isOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setActiveView('ranges');
      setIsInfoOpen(false);
      setHighlightedRange(null);
      setBuilderMode('exact');
      setSingleSteps(getNextSuggestedStepCount(resolvedStepRanges));
    } else if (isInfoOpen) {
      setIsInfoOpen(false);
    }
  }

  useEffect(() => {
    if (!isOpen) {
      stepWheelModal.forceClose();
    }
  }, [isOpen, stepWheelModal]);

  useEffect(
    () => () => {
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }
    },
    []
  );

  const flashRangeRow = useCallback((rangeLabel) => {
    setHighlightedRange(rangeLabel);
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
    }
    highlightTimerRef.current = setTimeout(() => {
      setHighlightedRange(null);
    }, 1600);

    requestAnimationFrame(() => {
      const node = rowRefs.current.get(rangeLabel);
      if (node && typeof node.scrollIntoView === 'function') {
        node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
  }, []);

  const rangeRows = useMemo(
    () =>
      resolvedStepRanges.map((range) => {
        const details = getStepDetails(range, userProfile);
        return {
          range,
          details,
          estimateLabel: formatStepRangeEstimate(
            details.parsedRange,
            details.estimatedSteps
          ),
          isActiveGoal:
            resolvedActiveStepRange != null &&
            range === resolvedActiveStepRange,
        };
      }),
    [resolvedActiveStepRange, resolvedStepRanges, userProfile]
  );

  const activePresetId = useMemo(
    () => findActiveStepRangePreset(resolvedStepRanges),
    [resolvedStepRanges]
  );

  const candidateLabel = useMemo(
    () =>
      buildStepRangeLabel({
        mode: builderMode,
        primarySteps: builderMode === 'range' ? rangeFromSteps : singleSteps,
        secondarySteps: rangeToSteps,
      }),
    [builderMode, rangeFromSteps, rangeToSteps, singleSteps]
  );

  const candidateDetails = useMemo(
    () => (candidateLabel ? getStepDetails(candidateLabel, userProfile) : null),
    [candidateLabel, userProfile]
  );

  const candidateEstimate = useMemo(
    () =>
      candidateDetails
        ? formatStepRangeEstimate(
            candidateDetails.parsedRange,
            candidateDetails.estimatedSteps
          )
        : '—',
    [candidateDetails]
  );

  const duplicateMatch = useMemo(
    () =>
      candidateLabel
        ? findMatchingStepRange(resolvedStepRanges, candidateLabel)
        : null,
    [candidateLabel, resolvedStepRanges]
  );

  const canAdd = Boolean(candidateLabel) && !duplicateMatch;

  const handleModeChange = (nextMode) => {
    setBuilderMode(nextMode);
    if (nextMode === 'under' && singleSteps === 15000) {
      setSingleSteps(8000);
    } else if (nextMode === 'over' && singleSteps <= 15000) {
      setSingleSteps(25000);
    }
  };

  const handleNudgeSingle = (delta) => {
    setSingleSteps((prev) => {
      const next =
        delta > 0
          ? Math.floor(prev / STEP_RANGE_NUDGE_INCREMENT) *
              STEP_RANGE_NUDGE_INCREMENT +
            STEP_RANGE_NUDGE_INCREMENT
          : Math.ceil(prev / STEP_RANGE_NUDGE_INCREMENT) *
              STEP_RANGE_NUDGE_INCREMENT -
            STEP_RANGE_NUDGE_INCREMENT;
      return clampStepCount(next);
    });
  };

  const openWheelFor = (target) => {
    setWheelTarget(target);
    stepWheelModal.open();
  };

  const handleWheelSave = (pickedValue) => {
    if (wheelTarget === 'from') {
      const nextFrom = clampStepCount(
        pickedValue,
        STEP_RANGE_MIN_STEPS,
        STEP_RANGE_MAX_STEPS - STEP_RANGE_WHEEL_INCREMENT
      );
      setRangeFromSteps(nextFrom);
      setRangeToSteps((prevTo) =>
        prevTo <= nextFrom
          ? clampStepCount(
              nextFrom + 2000,
              nextFrom + STEP_RANGE_WHEEL_INCREMENT
            )
          : prevTo
      );
    } else if (wheelTarget === 'to') {
      const nextTo = clampStepCount(
        pickedValue,
        STEP_RANGE_MIN_STEPS + STEP_RANGE_WHEEL_INCREMENT,
        STEP_RANGE_MAX_STEPS
      );
      setRangeToSteps(nextTo);
      setRangeFromSteps((prevFrom) =>
        prevFrom >= nextTo
          ? clampStepCount(
              nextTo - 2000,
              STEP_RANGE_MIN_STEPS,
              nextTo - STEP_RANGE_WHEEL_INCREMENT
            )
          : prevFrom
      );
    } else {
      setSingleSteps(clampStepCount(pickedValue));
    }
    stepWheelModal.requestClose();
  };

  const handleAdd = () => {
    if (!canAdd || !candidateLabel) {
      return;
    }
    resolvedAddRange?.(candidateLabel);
    if (activeView !== 'ranges') {
      setActiveView('ranges');
    }
    flashRangeRow(candidateLabel);
  };

  const handleRemove = (range) => {
    if (resolvedActiveStepRange != null && range === resolvedActiveStepRange) {
      return;
    }
    resolvedRemoveRange?.(range);
  };

  const handleApplyPreset = (preset) => {
    if (!preset) {
      return;
    }
    if (activePresetId === preset.id) {
      setActiveView('ranges');
      return;
    }
    const previousActiveRange = resolvedActiveStepRange;
    const nextActiveRange = previousActiveRange
      ? resolveClosestStepRange(preset.ranges, previousActiveRange)
      : null;
    const activeGoalChanged = Boolean(
      previousActiveRange &&
      nextActiveRange &&
      nextActiveRange !== previousActiveRange
    );

    resolvedReplaceRanges?.(preset.ranges);
    if (activeGoalChanged) {
      onSelectActiveRange?.(nextActiveRange);
    }
    setActiveView('ranges');

    if (activeGoalChanged && nextActiveRange) {
      flashRangeRow(nextActiveRange);
    }
  };

  const handleRestoreDefaults = () => {
    const nextActiveRange = resolvedActiveStepRange
      ? resolveClosestStepRange(DEFAULT_STEP_RANGES, resolvedActiveStepRange)
      : null;
    resolvedReplaceRanges?.(DEFAULT_STEP_RANGES);
    if (
      resolvedActiveStepRange &&
      nextActiveRange &&
      nextActiveRange !== resolvedActiveStepRange
    ) {
      onSelectActiveRange?.(nextActiveRange);
    }
    setActiveView('ranges');
  };

  const wheelConfig = useMemo(() => {
    if (wheelTarget === 'from') {
      return {
        title: 'From Steps',
        value: rangeFromSteps,
        min: STEP_RANGE_MIN_STEPS,
        max: STEP_RANGE_MAX_STEPS - STEP_RANGE_WHEEL_INCREMENT,
      };
    }
    if (wheelTarget === 'to') {
      return {
        title: 'To Steps',
        value: rangeToSteps,
        min: STEP_RANGE_MIN_STEPS + STEP_RANGE_WHEEL_INCREMENT,
        max: STEP_RANGE_MAX_STEPS,
      };
    }
    return {
      title:
        builderMode === 'under'
          ? 'Under Step Limit'
          : builderMode === 'over'
            ? 'Over Step Floor'
            : 'Step Count',
      value: singleSteps,
      min: STEP_RANGE_MIN_STEPS,
      max: STEP_RANGE_MAX_STEPS,
    };
  }, [builderMode, rangeFromSteps, rangeToSteps, singleSteps, wheelTarget]);

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

  const rowMotion = reduceMotion
    ? {
        initial: false,
        exit: undefined,
        transition: { duration: 0 },
      }
    : {
        initial: { height: 0, opacity: 0, scale: 0.98 },
        exit: { height: 0, opacity: 0, scale: 0.98 },
        transition: {
          height: { duration: 0.24, ease: ROW_EASE },
          opacity: { duration: 0.18, ease: 'easeOut' },
          scale: { duration: 0.2, ease: ROW_EASE },
        },
      };

  const emptyStateMotion = reduceMotion
    ? {
        initial: false,
        exit: undefined,
        transition: { duration: 0 },
      }
    : {
        initial: { opacity: 0, scale: 0.98 },
        exit: { opacity: 0, scale: 0.98 },
        transition: { duration: 0.18, ease: 'easeOut' },
      };

  const singlePrefix = SINGLE_PREFIX_BY_MODE[builderMode] ?? '';
  const duplicateLabel =
    duplicateMatch && candidateLabel && duplicateMatch !== candidateLabel
      ? `Covered by ${duplicateMatch}`
      : 'Already added';

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      onClose={onClose}
      overlayClassName="z-60"
      contentClassName="w-full max-w-lg md:max-w-xl p-5 md:p-6"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <Footprints
            size={22}
            className="text-accent-blue shrink-0"
            aria-hidden="true"
          />
          <h3 className="text-foreground font-bold text-xl leading-tight truncate">
            Step Ranges
          </h3>
        </div>

        <div className="ml-auto flex items-center gap-2 shrink-0">
          {typeof onOpenCalorieTargetModal === 'function' && (
            <button
              type="button"
              onClick={() => {
                setIsInfoOpen(false);
                onOpenCalorieTargetModal();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-highlight px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-foreground transition-colors press-feedback focus-ring md:hover:border-accent-blue"
            >
              <Flame
                size={14}
                className="text-accent-blue"
                aria-hidden="true"
              />
              <span className="hidden sm:inline">Calorie </span>Target
            </button>
          )}

          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setIsInfoOpen((prev) => !prev)}
              className={`relative z-20 h-8 w-8 rounded-full border transition-colors flex items-center justify-center focus-ring pressable-inline ${
                isInfoOpen
                  ? 'border-accent-blue bg-accent-blue/15 text-accent-blue'
                  : 'border-border bg-surface-highlight text-muted md:hover:text-foreground md:hover:border-muted/50'
              }`}
              aria-label="How step ranges are estimated"
              aria-expanded={isInfoOpen}
            >
              <Info size={15} aria-hidden="true" />
            </button>

            <AnimatePresence>
              {isInfoOpen && (
                <motion.div
                  key="step-ranges-info-backdrop"
                  data-testid="step-ranges-info-backdrop"
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
                  key="step-ranges-info-card"
                  role="region"
                  aria-label="How step ranges are estimated"
                  initial={popoverMotion.initial}
                  animate={popoverMotion.animate}
                  exit={popoverMotion.exit}
                  transition={popoverMotion.transition}
                  className="absolute right-0 top-full mt-2 z-20 origin-top-right w-[min(20rem,calc(100vw-4.5rem))] rounded-2xl border border-border/80 bg-surface/95 supports-[backdrop-filter]:bg-surface/90 backdrop-blur-xl p-3.5 shadow-2xl shadow-background/40"
                >
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <p className="text-foreground text-sm font-semibold leading-tight">
                      How ranges are estimated
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsInfoOpen(false)}
                      className="h-6 w-6 rounded-full text-muted md:hover:text-foreground md:hover:bg-surface-highlight transition-colors flex items-center justify-center focus-ring pressable-inline"
                      aria-label="Close step range info"
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </div>

                  <ul className="space-y-2 text-xs leading-relaxed text-muted">
                    <li className="flex items-start gap-2">
                      <Footprints
                        size={13}
                        className="text-accent-blue shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      <span>
                        <span className="text-foreground font-medium tabular-nums">
                          Exact (10k)
                        </span>{' '}
                        uses that exact step count, while{' '}
                        <span className="text-foreground font-medium tabular-nums">
                          Range (10k-12k)
                        </span>{' '}
                        uses the midpoint between both bounds.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Activity
                        size={13}
                        className="text-accent-indigo shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      <span>
                        <span className="text-foreground font-medium tabular-nums">
                          Under (&lt;10k)
                        </span>{' '}
                        estimates at 75% of the limit, and{' '}
                        <span className="text-foreground font-medium tabular-nums">
                          Over (&gt;20k)
                        </span>{' '}
                        estimates at 115% of the floor.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Flame
                        size={13}
                        className="text-accent-blue shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      <span>
                        Step burn (
                        <span className="text-foreground font-medium">
                          {units.energy.unit}
                        </span>
                        ) is calculated from your height, weight, and stride
                        length.
                      </span>
                    </li>
                  </ul>

                  <div className="mt-3 rounded-xl bg-surface-highlight/70 border border-border/70 px-3 py-2 text-xs">
                    <p className="text-foreground font-medium">
                      Active goal protection
                    </p>
                    <p className="text-muted mt-1 leading-relaxed">
                      Your active goal stays locked here — switch in{' '}
                      <span className="text-foreground font-medium">
                        Calorie Target
                      </span>{' '}
                      first if you want to remove it.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Section 1: Active Ranges or Presets */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted tabular-nums">
            {activeView === 'presets'
              ? 'Step Ladders'
              : `Active Ranges · ${resolvedStepRanges.length}`}
          </span>
          <button
            type="button"
            onClick={() =>
              setActiveView((prev) =>
                prev === 'presets' ? 'ranges' : 'presets'
              )
            }
            aria-pressed={activeView === 'presets'}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors focus-ring pressable-inline ${
              activeView === 'presets'
                ? 'border-accent-blue/40 bg-accent-blue/15 text-accent-blue'
                : 'border-border/60 bg-surface-highlight/60 text-muted md:hover:text-foreground md:hover:border-muted/50'
            }`}
          >
            <Layers size={12} aria-hidden="true" />
            {activeView === 'presets' ? 'Back to list' : 'Presets'}
          </button>
        </div>

        <SmoothHeight swapKey={activeView}>
          {activeView === 'presets' ? (
            <div className="space-y-2.5 min-h-[16.5rem] max-h-[42vh] md:min-h-[19rem] md:max-h-[46vh] overflow-y-auto pr-0.5 scrollbar-thin scrollbar-thumb-[rgb(var(--border)/0.7)] scrollbar-track-transparent">
              {STEP_RANGE_PRESETS.map((preset) => {
                const isActive = activePresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleApplyPreset(preset)}
                    className={`w-full rounded-xl border p-3.5 text-left transition-colors focus-ring pressable-card ${
                      isActive
                        ? 'border-accent-blue/60 bg-accent-blue/10'
                        : 'border-border/50 bg-surface-highlight/50 md:hover:border-accent-blue/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-foreground font-semibold text-sm">
                        {preset.label}
                      </span>
                      {isActive ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent-blue">
                          <Check size={13} aria-hidden="true" />
                          Active
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted tabular-nums">
                          {preset.ranges.length} ranges
                        </span>
                      )}
                    </div>
                    <p className="text-muted text-xs mt-0.5">
                      {preset.description}
                    </p>
                    <p className="text-foreground/75 text-[11px] tabular-nums mt-1.5 leading-relaxed">
                      {preset.ranges.join(' · ')}
                    </p>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="min-h-[16.5rem] max-h-[42vh] md:min-h-[19rem] md:max-h-[46vh] overflow-y-auto pr-0.5 scrollbar-thin scrollbar-thumb-[rgb(var(--border)/0.7)] scrollbar-track-transparent flex flex-col">
              {/* Rows expand in / collapse out as ranges are added or removed;
                  each row carries its own bottom gap inside the collapsing
                  wrapper so the list glides cleanly without jumping. */}
              <ul aria-label="Configured step ranges">
                <AnimatePresence initial={false}>
                  {rangeRows.map(
                    ({ range, details, estimateLabel, isActiveGoal }) => {
                      const isHighlighted = highlightedRange === range;
                      return (
                        <motion.li
                          key={range}
                          initial={rowMotion.initial}
                          animate={{ height: 'auto', opacity: 1, scale: 1 }}
                          exit={rowMotion.exit}
                          transition={rowMotion.transition}
                          style={{ overflow: 'hidden' }}
                          ref={(node) => {
                            if (node) {
                              rowRefs.current.set(range, node);
                            } else {
                              rowRefs.current.delete(range);
                            }
                          }}
                        >
                          <div className="pb-2">
                            <div
                              className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors ${
                                isHighlighted
                                  ? 'border-accent-blue/60 bg-accent-blue/10'
                                  : isActiveGoal
                                    ? 'border-accent-blue/40 bg-surface-highlight/50'
                                    : 'border-border/50 bg-surface-highlight/50'
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-foreground font-bold text-base tabular-nums truncate">
                                    {range}
                                  </span>
                                  {isActiveGoal && (
                                    <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-accent-blue/25 bg-accent-blue/10 text-accent-blue">
                                      Active goal
                                    </span>
                                  )}
                                </div>
                                <p className="text-muted text-xs tabular-nums mt-0.5">
                                  {estimateLabel}
                                </p>
                              </div>

                              <div className="flex items-center gap-2.5 shrink-0">
                                <span className="text-accent-green font-semibold text-xs tabular-nums whitespace-nowrap">
                                  {units.energy.format(details.calories, {
                                    signed: true,
                                  })}
                                </span>
                                {isActiveGoal ? (
                                  <span
                                    title="Switch active target to remove"
                                    aria-label={`${range} is the active goal and cannot be removed`}
                                    className="h-9 w-9 rounded-lg text-accent-blue/75 bg-accent-blue/10 flex items-center justify-center"
                                  >
                                    <Lock size={14} aria-hidden="true" />
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleRemove(range)}
                                    aria-label={`Remove ${range} step range`}
                                    className="h-9 w-9 rounded-lg text-muted md:hover:text-accent-red md:hover:bg-accent-red/10 active:text-accent-red active:bg-accent-red/10 flex items-center justify-center transition-colors focus-ring pressable-inline"
                                  >
                                    <Trash2 size={15} aria-hidden="true" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </motion.li>
                      );
                    }
                  )}
                </AnimatePresence>
              </ul>

              <AnimatePresence initial={false}>
                {rangeRows.length === 0 && (
                  <motion.div
                    key="step-ranges-empty"
                    initial={emptyStateMotion.initial}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={emptyStateMotion.exit}
                    transition={emptyStateMotion.transition}
                    className="flex-1 flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface-highlight/30 px-4 py-6 text-center"
                  >
                    <Footprints
                      size={22}
                      className="text-muted mb-2"
                      aria-hidden="true"
                    />
                    <p className="text-foreground text-sm font-semibold">
                      No step ranges yet
                    </p>
                    <p className="text-muted text-xs mt-1 max-w-[24ch]">
                      Build a custom range below, or restore the default ladder.
                    </p>
                    <button
                      type="button"
                      onClick={handleRestoreDefaults}
                      className="mt-3.5 inline-flex items-center gap-1.5 rounded-lg bg-accent-blue/15 px-3.5 py-2 text-xs font-semibold text-accent-blue md:hover:bg-accent-blue/25 focus-ring pressable-inline"
                    >
                      <RotateCcw size={14} aria-hidden="true" />
                      Restore defaults
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </SmoothHeight>
      </div>

      {/* Section 2: Structured Add Range Builder */}
      <div className="mt-4 pt-4 border-t border-border/50">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-2">
          Add Range
        </p>

        <SegmentedToggle
          ariaLabel="Step range type"
          options={BUILDER_MODES}
          value={builderMode}
          onChange={handleModeChange}
        />

        <div className="mt-3">
          <SmoothHeight swapKey={builderMode === 'range' ? 'range' : 'single'}>
            {builderMode === 'range' ? (
              <div className="flex items-end gap-2">
                <div className="flex-1 min-w-0">
                  <span className="block text-xs text-muted mb-1">From</span>
                  <button
                    type="button"
                    onClick={() => openWheelFor('from')}
                    aria-label="Select minimum steps"
                    className="w-full h-11 rounded-lg border border-border bg-surface-highlight px-3 flex items-center justify-between gap-2 text-left focus-ring pressable-inline md:hover:border-muted/50"
                  >
                    <span className="text-foreground font-bold text-base tabular-nums truncate">
                      {rangeFromSteps.toLocaleString()}
                    </span>
                    <ChevronsUpDown
                      size={15}
                      className="text-muted shrink-0"
                      aria-hidden="true"
                    />
                  </button>
                </div>

                <span
                  aria-hidden="true"
                  className="h-11 flex items-center text-muted font-semibold px-0.5 shrink-0"
                >
                  –
                </span>

                <div className="flex-1 min-w-0">
                  <span className="block text-xs text-muted mb-1">To</span>
                  <button
                    type="button"
                    onClick={() => openWheelFor('to')}
                    aria-label="Select maximum steps"
                    className="w-full h-11 rounded-lg border border-border bg-surface-highlight px-3 flex items-center justify-between gap-2 text-left focus-ring pressable-inline md:hover:border-muted/50"
                  >
                    <span className="text-foreground font-bold text-base tabular-nums truncate">
                      {rangeToSteps.toLocaleString()}
                    </span>
                    <ChevronsUpDown
                      size={15}
                      className="text-muted shrink-0"
                      aria-hidden="true"
                    />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleNudgeSingle(-STEP_RANGE_NUDGE_INCREMENT)}
                  disabled={singleSteps <= STEP_RANGE_MIN_STEPS}
                  aria-label="Decrease step count"
                  className="h-11 w-11 shrink-0 rounded-lg border border-border bg-surface-highlight text-foreground flex items-center justify-center transition-colors focus-ring pressable-inline md:hover:border-muted/50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Minus size={16} aria-hidden="true" />
                </button>

                <button
                  type="button"
                  onClick={() => openWheelFor('single')}
                  aria-label="Open step count wheel picker"
                  className="flex-1 min-w-0 h-11 rounded-lg border border-border bg-surface-highlight px-3.5 flex items-center justify-between gap-2 text-left transition-colors focus-ring pressable-inline md:hover:border-muted/50"
                >
                  <span className="flex items-baseline gap-1.5 min-w-0 truncate">
                    {singlePrefix && (
                      <span className="text-accent-blue font-bold text-base">
                        {singlePrefix}
                      </span>
                    )}
                    <span className="text-foreground font-bold text-base tabular-nums">
                      {singleSteps.toLocaleString()}
                    </span>
                    <span className="text-muted text-xs">steps</span>
                  </span>
                  <ChevronsUpDown
                    size={15}
                    className="text-muted shrink-0"
                    aria-hidden="true"
                  />
                </button>

                <button
                  type="button"
                  onClick={() => handleNudgeSingle(STEP_RANGE_NUDGE_INCREMENT)}
                  disabled={singleSteps >= STEP_RANGE_MAX_STEPS}
                  aria-label="Increase step count"
                  className="h-11 w-11 shrink-0 rounded-lg border border-border bg-surface-highlight text-foreground flex items-center justify-center transition-colors focus-ring pressable-inline md:hover:border-muted/50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus size={16} aria-hidden="true" />
                </button>
              </div>
            )}
          </SmoothHeight>
        </div>

        {/* Live Auditable Preview + Add Action */}
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-surface-highlight/60 px-3.5 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-foreground font-bold text-sm tabular-nums truncate">
                {candidateLabel ?? '—'}
              </span>
              {duplicateMatch && (
                <span className="text-[11px] font-medium text-accent-amber truncate">
                  · {duplicateLabel}
                </span>
              )}
            </div>
            <p className="text-muted text-xs tabular-nums mt-0.5 truncate">
              {candidateEstimate}
              {candidateDetails && (
                <>
                  {' · '}
                  <span className="text-accent-green font-semibold">
                    {units.energy.format(candidateDetails.calories, {
                      signed: true,
                    })}
                  </span>
                </>
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={handleAdd}
            disabled={!canAdd}
            className="shrink-0 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5 transition-all focus-ring press-feedback md:hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus size={16} aria-hidden="true" />
            Add
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-4">
        <button
          type="button"
          onClick={onClose}
          className="w-full bg-surface-highlight md:hover:bg-surface-highlight/80 text-foreground px-6 py-3 rounded-lg font-medium transition-all focus-ring press-feedback"
        >
          Done
        </button>
      </div>

      <NumericValuePickerModal
        isOpen={stepWheelModal.isOpen}
        isClosing={stepWheelModal.isClosing}
        title={wheelConfig.title}
        value={wheelConfig.value}
        min={wheelConfig.min}
        max={wheelConfig.max}
        step={STEP_RANGE_WHEEL_INCREMENT}
        unitLabel="Steps"
        formatOption={formatWheelSteps}
        onCancel={stepWheelModal.requestClose}
        onSave={handleWheelSave}
      />
    </ModalShell>
  );
};
