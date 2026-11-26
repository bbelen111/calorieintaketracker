import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ChevronRight,
  Flame,
  Lock,
  Minus,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useUnits } from '../../../hooks/useUnits';
import {
  describeActiveGoalTarget,
  describeGoal,
} from '../../../utils/units/goalDescription';
import { buildDayLedgerCardSummary } from '../../../utils/calculations/dayLedgerPresentation';
import {
  buildGoalPlanCardModel,
  GOAL_PLAN_NUDGE,
  GOAL_PLAN_STATE,
  GOAL_PLAN_STRIP_DAYS,
  PHASE_RATE_MIN_SPAN_DAYS,
  selectPhaseLedgerInput,
  shortenVerdict,
} from '../../../utils/calculations/goalPlanCard';
import {
  calculateWeightTrend,
  formatDateLabel,
} from '../../../utils/measurements/weight';
import { formatBodyFat } from '../../../utils/measurements/bodyFat';
import {
  getGoalAlignmentText,
  getGoalWeeklyTarget,
} from '../../../utils/visuals/trackerHelpers';
import { getTodayDateKey } from '../../../utils/data/dateKeys';
import { goals } from '../../../constants/goals/goals';
import { DayBalanceStrip } from './DayBalanceStrip';

// Goal colour (`goals[key].color`) -> its border, as the original card had it.
const GOAL_BORDER_CLASS_BY_BG = {
  'bg-accent-purple': 'border-accent-purple',
  'bg-accent-green': 'border-accent-green',
  'bg-accent-blue': 'border-accent-blue',
  'bg-accent-yellow': 'border-accent-yellow',
  'bg-accent-orange': 'border-accent-orange',
};

const SHORT_DATE = { month: 'short', day: 'numeric' };

const formatShortDate = (dateKey) => formatDateLabel(dateKey, SHORT_DATE);

const TrendIcon = ({ weeklyRate }) => {
  const iconProps = {
    size: 16,
    className: 'shrink-0 text-muted',
    'aria-hidden': true,
  };
  if (weeklyRate < -0.1) return <TrendingDown {...iconProps} />;
  if (weeklyRate > 0.1) return <TrendingUp {...iconProps} />;
  return <Minus {...iconProps} />;
};

const Nudge = ({ children, tone = 'amber' }) => (
  <p
    data-testid="goal-plan-nudge"
    className={`mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs text-left ${
      tone === 'orange'
        ? 'border-accent-orange/30 bg-accent-orange/10 text-accent-orange'
        : 'border-accent-amber/30 bg-accent-amber/10 text-accent-amber'
    }`}
  >
    <AlertCircle size={14} className="mt-px shrink-0" aria-hidden="true" />
    <span>{children}</span>
  </p>
);

const describeNudge = (nudge, goalLabel) => {
  switch (nudge?.kind) {
    case GOAL_PLAN_NUDGE.STALE_WEIGH_IN:
      return `No weigh-in for ${nudge.days} days. Log one to keep your trend current.`;
    case GOAL_PLAN_NUDGE.LONG_CUT:
      return `${nudge.weeks} weeks cutting. A week at maintenance can help you keep going.`;
    case GOAL_PLAN_NUDGE.GAINING_FAST:
      return `Gaining faster than a ${goalLabel} aims for. A smaller surplus keeps it lean.`;
    default:
      return null;
  }
};

/** "Day 18 of 56", "Day 18" (open-ended) or "Starts in 4 days". */
const describePhaseTiming = (model) => {
  if (model.startsInDays > 0) {
    return model.startsInDays === 1
      ? 'Starts tomorrow'
      : `Starts in ${model.startsInDays} days`;
  }
  if (model.totalDays !== null) {
    return `Day ${Math.min(model.dayNumber, model.totalDays)} of ${model.totalDays}`;
  }
  return `Day ${model.dayNumber}`;
};

const describePhaseEnd = (model) => {
  if (model.state === GOAL_PLAN_STATE.PHASE_OVERDUE) {
    return `Ended ${formatShortDate(model.endDate)}. Open it to mark it complete.`;
  }
  if (model.state === GOAL_PLAN_STATE.PHASE_ENDING) {
    const when =
      model.daysLeft === 0
        ? 'today'
        : model.daysLeft === 1
          ? 'tomorrow'
          : `in ${model.daysLeft} days`;
    return `Ends ${when}. Time to review how it went.`;
  }
  return null;
};

/** What tapping the goal tile does. */
const TILE_ACTION = Object.freeze({
  CHANGE_GOAL: 'changeGoal',
  OPEN_PHASE: 'openPhase',
  LOCKED: 'locked',
});

const TILE_ACTION_LABEL = Object.freeze({
  [TILE_ACTION.CHANGE_GOAL]: 'Change goal',
  [TILE_ACTION.OPEN_PHASE]: 'Set by your phase. Open phase',
  [TILE_ACTION.LOCKED]: 'Set by your phase',
});

/**
 * The original full-colour goal tile. Tapping it opens the goal modal, or the
 * active phase while one runs (a lock marks the goal the phase set); a locked
 * goal with no phase to open says so.
 */
const GoalTile = ({ goalConfig, description, action, dayInGoal, onClick }) => {
  const Icon = goalConfig.icon;
  const borderClass =
    GOAL_BORDER_CLASS_BY_BG[goalConfig.color] ?? 'border-primary-foreground';
  const locked = action === TILE_ACTION.LOCKED;
  return (
    <button
      onClick={locked ? undefined : onClick}
      type="button"
      disabled={locked}
      aria-label={`Goal: ${goalConfig.label}, ${description}. ${TILE_ACTION_LABEL[action]}`}
      className={`w-full p-4 rounded-xl border-2 transition-all relative ${goalConfig.color} ${borderClass} text-primary-foreground shadow-lg ${
        locked ? 'cursor-default' : 'md:hover:scale-[1.02] active:scale-[0.98]'
      } focus-ring pressable-card`}
    >
      {dayInGoal != null && (
        <span
          data-testid="goal-plan-day-badge"
          className="absolute top-3 right-3 rounded-full bg-background/25 px-2.5 py-0.5 text-xs font-semibold"
        >
          Day {dayInGoal}
        </span>
      )}
      {action === TILE_ACTION.OPEN_PHASE && (
        <span
          data-testid="goal-plan-lock-badge"
          className="absolute top-3 right-3 rounded-full bg-background/25 p-1.5"
        >
          <Lock size={14} className="block" aria-hidden="true" />
        </span>
      )}
      {Icon && <Icon className="mx-auto mb-2" size={32} aria-hidden="true" />}
      <p className="font-bold text-xl">{goalConfig.label}</p>
      <p className="text-sm opacity-90 mt-1">{description}</p>
      {action === TILE_ACTION.OPEN_PHASE ? (
        <p className="text-xs font-semibold mt-2 flex items-center justify-center gap-0.5">
          Open phase
          <ChevronRight size={14} aria-hidden="true" />
        </p>
      ) : (
        <p className="text-xs opacity-75 mt-2 flex items-center justify-center gap-1">
          {locked ? (
            <>
              <Lock size={12} aria-hidden="true" />
              Set by your phase
            </>
          ) : (
            'Tap to change'
          )}
        </p>
      )}
    </button>
  );
};

/** On-target count, streak and the 7-day strip. */
const Adherence = ({ ledger }) => (
  <div data-testid="goal-plan-adherence">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
      <span className="text-sm text-muted">
        {ledger.judgedDays > 0
          ? `${ledger.onTargetDays} of ${ledger.judgedDays} logged ${
              ledger.judgedDays === 1 ? 'day' : 'days'
            } on target`
          : `${ledger.loggedDays} of ${ledger.windowDays} days logged`}
      </span>
      {ledger.streak >= 2 && (
        <span className="inline-flex items-center gap-1 rounded-full border border-accent-orange/40 bg-accent-orange/15 px-2 py-0.5 text-[11px] font-semibold text-accent-orange">
          <Flame size={12} aria-hidden="true" />
          {ledger.streak}-day streak
        </span>
      )}
    </div>
    <DayBalanceStrip
      days={ledger.days}
      variant="flat"
      heightClass="h-2.5"
      testId="goal-plan-strip"
      ariaLabel={`${ledger.loggedDays} of ${ledger.windowDays} recent days logged`}
      getDayTitle={formatShortDate}
    />
  </div>
);

/** The weekly rate and verdict, with the projection beside it on one line. */
const TrendLine = ({ trend, projection, units }) => (
  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
    <p
      data-testid="goal-plan-trend"
      className="flex min-w-0 items-center gap-1.5 text-foreground"
    >
      <TrendIcon weeklyRate={trend.weeklyRate} />
      <span className="min-w-0">
        <span className="font-semibold">
          {units.bodyWeight.formatRate(trend.weeklyRate)}
        </span>
        {trend.alignment && (
          <span className={trend.alignment.color}>
            {' · '}
            {shortenVerdict(trend.alignment.text)}
          </span>
        )}
      </span>
    </p>
    {projection && (
      <p data-testid="goal-plan-projection" className="text-muted">
        {projection.isHolding && 'Holding '}
        <span className="font-semibold text-foreground">
          ~{units.bodyWeight.format(projection.weightKg)}
        </span>
        {!projection.isHolding && ` in ${projection.weeks} wk`}
      </p>
    )}
  </div>
);

const GoalStateBody = ({
  model,
  ledger,
  goalConfig,
  units,
  showPhasePrompt,
  onStartPhase,
}) => {
  const { trend, projection } = model;
  const hasLoggedDays = ledger.loggedDays > 0;
  const nudgeText = describeNudge(model.nudge, goalConfig.label);

  return (
    <>
      {/* Each section appears only once there is data behind it. */}
      {(hasLoggedDays || trend) && (
        <div className="mt-5 space-y-4">
          {hasLoggedDays && <Adherence ledger={ledger} />}
          {trend && (
            <TrendLine trend={trend} projection={projection} units={units} />
          )}
        </div>
      )}

      {nudgeText && <Nudge>{nudgeText}</Nudge>}

      {showPhasePrompt && (
        <button
          type="button"
          onClick={onStartPhase}
          className="mt-5 flex w-full items-center justify-between gap-2 border-t border-border/50 pt-4 text-left text-sm pressable-inline focus-ring"
        >
          <span className="text-muted">Give it an end date</span>
          <span className="inline-flex items-center gap-0.5 font-semibold text-accent-blue">
            Start a phase
            <ChevronRight size={16} aria-hidden="true" />
          </span>
        </button>
      )}
    </>
  );
};

const Value = ({ children }) => (
  <span className="font-semibold text-foreground">{children}</span>
);

/** One line of phase facts; `right` drops under when both cannot fit. */
const PhaseRow = ({ testId, left, right }) => (
  <div
    data-testid={testId}
    className="flex flex-wrap items-baseline justify-between gap-x-2"
  >
    <p>{left}</p>
    {right && <p className="ml-auto">{right}</p>}
  </div>
);

/**
 * The index of the first child of `probeRef` (each laid out at its natural
 * width) that fits inside `frameRef`, or the child count when none does.
 * Re-checked when any of them resizes, so it follows the screen width, the Text
 * size setting, the values and the units.
 */
const useFirstFit = () => {
  const frameRef = useRef(null);
  const probeRef = useRef(null);
  const [firstFit, setFirstFit] = useState(0);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const candidates = [...probeRef.current.children];
    const measure = () => {
      const index = candidates.findIndex(
        (candidate) => !(candidate.scrollWidth > frame.clientWidth)
      );
      setFirstFit(index === -1 ? candidates.length : index);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const observer = new ResizeObserver(measure);
    [frame, ...candidates].forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  return { frameRef, probeRef, firstFit };
};

/** Widest first: the two-line layouts, then one short line per fact. */
const PHASE_FACTS_LAYOUTS = ['two-lines', 'two-lines-tight', 'short-lines'];

/**
 * Start, target and current weight with the planned and measured weekly rate,
 * in the widest layout that fits: two lines (start and target, then current);
 * the same without the repeated "Target" / "Current" before the rates; else one
 * short line per fact, which holds up at the larger text sizes. A value with no
 * data behind it is left out or says why.
 */
const PhaseFacts = ({ model, goalType, units }) => {
  const { startKg, currentKg, changeKg, targetKg } = model.weight;
  const { plannedWeeklyRateKg, trend } = model.pace;

  const target =
    targetKg !== null
      ? units.bodyWeight.format(targetKg)
      : model.targetBodyFat !== null
        ? `${formatBodyFat(model.targetBodyFat)}% BF`
        : null;
  // Without a planned rate, the phase's goal band is both target and judge.
  const hasPlan = plannedWeeklyRateKg !== null;
  const targetRate = hasPlan
    ? units.bodyWeight.formatRate(plannedWeeklyRateKg)
    : Object.hasOwn(goals, goalType)
      ? getGoalWeeklyTarget(goalType, 'weight', units)
      : null;
  const verdict = hasPlan
    ? model.pace.verdict
    : trend && getGoalAlignmentText(trend, goalType);
  const { frameRef, probeRef, firstFit } = useFirstFit();

  const start = (
    <>
      Start:{' '}
      <Value>{startKg !== null ? units.bodyWeight.format(startKg) : '—'}</Value>
    </>
  );
  const startDate = formatDateLabel(model.startDate);
  const current =
    currentKg === null ? (
      'Current: no weigh-in yet'
    ) : (
      <>
        Current: <Value>{units.bodyWeight.format(currentKg)}</Value>
        {changeKg !== null && ` · ${units.bodyWeight.formatDelta(changeKg)}`}
      </>
    );
  const measuredRate = trend && (
    <>
      <Value>{units.bodyWeight.formatRate(trend.weeklyRate)}</Value>
      {verdict && (
        <span className={verdict.color}>
          {' · '}
          {shortenVerdict(verdict.text)}
        </span>
      )}
    </>
  );
  const ratePending =
    !trend && currentKg !== null
      ? `Rate after ${PHASE_RATE_MIN_SPAN_DAYS} days`
      : null;

  const twoLines = ({ isTight }) => [
    {
      id: 'start',
      left: (
        <>
          {start} · {startDate}
          {target && (
            <>
              <span className="mx-1 opacity-50" aria-hidden="true">
                |
              </span>
              Target: <Value>{target}</Value>
            </>
          )}
        </>
      ),
      // Without a target value beside it, the rate keeps its label.
      right: targetRate && (
        <>
          {!(isTight && target) && 'Target '}
          <Value>{targetRate}</Value>
        </>
      ),
    },
    {
      id: 'current',
      left: current,
      right: measuredRate ? (
        <>
          {!isTight && 'Current '}
          {measuredRate}
        </>
      ) : (
        ratePending
      ),
    },
  ];
  const twoLineLayouts = [
    twoLines({ isTight: false }),
    twoLines({ isTight: true }),
  ];
  // The row labels already say what the right-hand values are.
  const shortLines = [
    { id: 'start', left: start, right: startDate },
    (target || targetRate) && {
      id: 'target',
      left: (
        <>
          Target: <Value>{target ?? targetRate}</Value>
        </>
      ),
      right: target && targetRate && <Value>{targetRate}</Value>,
    },
    { id: 'current', left: current, right: measuredRate || ratePending },
  ].filter(Boolean);

  return (
    <div
      ref={frameRef}
      data-testid="goal-plan-phase-facts"
      data-layout={PHASE_FACTS_LAYOUTS[firstFit]}
      className="relative text-[11px] text-muted"
    >
      {/* The two-line layouts at their natural widths, measured to choose. */}
      <div
        ref={probeRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute inset-x-0 top-0 h-0 overflow-hidden whitespace-nowrap"
      >
        {twoLineLayouts.map((lines, index) => (
          <div key={PHASE_FACTS_LAYOUTS[index]} className="w-max">
            {lines.map((line) => (
              <PhaseRow key={line.id} left={line.left} right={line.right} />
            ))}
          </div>
        ))}
      </div>
      <div className="space-y-1.5">
        {(twoLineLayouts[firstFit] ?? shortLines).map((line) => (
          <PhaseRow
            key={line.id}
            testId={`goal-plan-phase-${line.id}`}
            left={line.left}
            right={line.right}
          />
        ))}
      </div>
    </div>
  );
};

const PhaseStateBody = ({ model, ledger, goalType, units }) => {
  const { progress } = model;
  const timing = describePhaseTiming(model);
  const endText = describePhaseEnd(model);
  // The ending / overdue nudge and "Starts in ..." already speak about dates.
  const showEndDate =
    model.state === GOAL_PLAN_STATE.PHASE &&
    model.endDate &&
    model.startsInDays === 0;

  return (
    <>
      <div data-testid="goal-plan-phase" className="mt-5 space-y-4">
        <div>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-bold text-foreground">
              {model.phaseName}
            </span>
            <span className="shrink-0 text-muted">
              {timing}
              {showEndDate && ` · ends ${formatShortDate(model.endDate)}`}
            </span>
          </div>
          {progress && (
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress.percent}
              aria-label={
                progress.kind === 'weight'
                  ? 'Progress toward target weight'
                  : 'Phase time elapsed'
              }
              data-testid="goal-plan-progress"
              className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-highlight"
            >
              <div
                className="h-full rounded-full bg-accent-blue"
                // A just-started phase still shows a dot, as in the design.
                style={{ width: `max(${progress.percent}%, 0.375rem)` }}
              />
            </div>
          )}
        </div>

        <PhaseFacts model={model} goalType={goalType} units={units} />

        {ledger.loggedDays > 0 && <Adherence ledger={ledger} />}
      </div>

      {endText && (
        <Nudge
          tone={
            model.state === GOAL_PLAN_STATE.PHASE_OVERDUE ? 'orange' : 'amber'
          }
        >
          {endText}
        </Nudge>
      )}
    </>
  );
};

/**
 * Home "Your Goal" card. The original full-colour goal tile stays on top;
 * under it, without a phase: how the goal is going (the last 7 finished days
 * against their targets, one line with the weight-trend verdict and a 4-week
 * projection, at most one nudge) and a "Start a phase" link (hideable in
 * Settings -> Home & Tips). With an active phase the tile shows the target the
 * phase set and opens the phase, and the phase's own detail sits under it:
 * name, day X of Y, a progress bar, start / target / current lines and the
 * adherence strip over the phase's days.
 * Numbers come from `buildGoalPlanCardModel` + `buildDayLedgerCardSummary`;
 * missing data is left out, never a zero.
 */
export const GoalPlanCard = ({
  selectedGoal,
  goalConfig,
  goalDurationDays,
  isGoalLocked,
  activePhase,
  balanceTarget,
  weightEntries,
  dailySnapshots,
  onTargetTolerance,
  onGoalClick,
  onOpenActivePhase,
  onStartPhase,
  showPhasePrompt = true,
}) => {
  const units = useUnits();
  const todayKey = getTodayDateKey();

  const weightTrend = useMemo(
    () => calculateWeightTrend(weightEntries),
    [weightEntries]
  );
  const alignment = useMemo(
    () => getGoalAlignmentText(weightTrend, selectedGoal),
    [weightTrend, selectedGoal]
  );
  const model = useMemo(
    () =>
      buildGoalPlanCardModel({
        selectedGoal,
        goalDurationDays,
        phase: activePhase,
        weightEntries,
        weightTrend,
        alignment,
        todayKey,
      }),
    [
      selectedGoal,
      goalDurationDays,
      activePhase,
      weightEntries,
      weightTrend,
      alignment,
      todayKey,
    ]
  );
  const isGoalState = model.state === GOAL_PLAN_STATE.GOAL;
  const ledger = useMemo(
    () =>
      buildDayLedgerCardSummary({
        ...(isGoalState
          ? { snapshots: dailySnapshots, todayKey }
          : selectPhaseLedgerInput({
              phase: activePhase,
              snapshots: dailySnapshots,
              todayKey,
            })),
        currentGoal: selectedGoal,
        tolerance: onTargetTolerance,
        windowDays: GOAL_PLAN_STRIP_DAYS,
      }),
    [
      isGoalState,
      activePhase,
      dailySnapshots,
      selectedGoal,
      onTargetTolerance,
      todayKey,
    ]
  );
  const tileAction = !isGoalState
    ? TILE_ACTION.OPEN_PHASE
    : isGoalLocked
      ? TILE_ACTION.LOCKED
      : TILE_ACTION.CHANGE_GOAL;

  if (!goalConfig) {
    return null;
  }

  // A phase can own a smart delta that differs from the goal's nominal one.
  const description = isGoalState
    ? describeGoal(selectedGoal, goalConfig, units)
    : describeActiveGoalTarget(selectedGoal, goalConfig, units, balanceTarget);

  return (
    <div
      data-testid="goal-plan-card"
      data-state={model.state}
      className="bg-surface rounded-2xl p-6 border border-border shadow-lg"
    >
      <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
        <Target className="text-accent-blue" size={24} aria-hidden="true" />
        Your Goal
      </h2>

      <GoalTile
        goalConfig={goalConfig}
        description={description}
        action={tileAction}
        dayInGoal={isGoalState ? model.dayInGoal : null}
        onClick={isGoalState ? onGoalClick : onOpenActivePhase}
      />

      <div key={model.state} className="tracker-graph-switch">
        {isGoalState ? (
          <GoalStateBody
            model={model}
            ledger={ledger}
            goalConfig={goalConfig}
            units={units}
            showPhasePrompt={showPhasePrompt}
            onStartPhase={onStartPhase}
          />
        ) : (
          <PhaseStateBody
            model={model}
            ledger={ledger}
            goalType={activePhase.goalType}
            units={units}
          />
        )}
      </div>
    </div>
  );
};
