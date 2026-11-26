import React, { useMemo } from 'react';
import {
  AlertCircle,
  CalendarClock,
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
} from '../../../utils/calculations/goalPlanCard';
import {
  calculateWeightTrend,
  formatDateLabel,
} from '../../../utils/measurements/weight';
import { getGoalAlignmentText } from '../../../utils/visuals/trackerHelpers';
import { getTodayDateKey } from '../../../utils/data/dateKeys';
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

const trendIconFor = (weeklyRate) => {
  if (weeklyRate < -0.1) return TrendingDown;
  if (weeklyRate > 0.1) return TrendingUp;
  return Minus;
};

const Row = ({ icon: Icon, children, testId }) => (
  <p
    data-testid={testId}
    className="flex items-center gap-2 text-sm text-foreground min-w-0"
  >
    <Icon size={16} className="shrink-0 text-muted" aria-hidden="true" />
    <span className="min-w-0">{children}</span>
  </p>
);

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

/**
 * The original full-colour goal tile, unchanged in look. Tapping it opens the
 * goal modal; while a phase owns the goal it is locked and says so.
 */
const GoalTile = ({ goalConfig, description, locked, dayInGoal, onClick }) => {
  const Icon = goalConfig.icon;
  const borderClass =
    GOAL_BORDER_CLASS_BY_BG[goalConfig.color] ?? 'border-primary-foreground';
  return (
    <button
      onClick={locked ? undefined : onClick}
      type="button"
      disabled={locked}
      aria-label={
        locked
          ? `Goal: ${goalConfig.label}, ${description}. Set by your phase`
          : `Goal: ${goalConfig.label}, ${description}. Change goal`
      }
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
      {Icon && <Icon className="mx-auto mb-2" size={32} aria-hidden="true" />}
      <p className="font-bold text-xl">{goalConfig.label}</p>
      <p className="text-sm opacity-90 mt-1">{description}</p>
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
    </button>
  );
};

const GoalStateBody = ({
  model,
  ledger,
  goalConfig,
  units,
  showPhasePrompt,
  onStartPhase,
}) => {
  const { trend, projection } = model;
  const TrendIcon = trend ? trendIconFor(trend.weeklyRate) : null;
  const hasLoggedDays = ledger.loggedDays > 0;
  const nudgeText = describeNudge(model.nudge, goalConfig.label);

  return (
    <>
      {/* Each section appears only once there is data behind it. */}
      {(hasLoggedDays || trend) && (
        <div className="mt-5 space-y-4">
          {hasLoggedDays && (
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
          )}

          {trend && (
            <div className="space-y-1.5">
              <Row icon={TrendIcon} testId="goal-plan-trend">
                <span className="font-semibold">
                  {units.bodyWeight.formatRate(trend.weeklyRate)}
                </span>
                {trend.alignment && (
                  <span className={trend.alignment.color}>
                    {' · '}
                    {trend.alignment.text}
                  </span>
                )}
              </Row>
              {projection && (
                <Row icon={CalendarClock} testId="goal-plan-projection">
                  {projection.isHolding ? (
                    <>
                      Holding around{' '}
                      <span className="font-semibold">
                        {units.bodyWeight.format(projection.weightKg)}
                      </span>
                    </>
                  ) : (
                    <>
                      In {projection.weeks} weeks:{' '}
                      <span className="font-semibold">
                        ~{units.bodyWeight.format(projection.weightKg)}
                      </span>
                    </>
                  )}
                </Row>
              )}
            </div>
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

const PhaseStateBody = ({ model, onOpenActivePhase }) => {
  const { progress } = model;
  const timing = describePhaseTiming(model);
  const endText = describePhaseEnd(model);

  return (
    <button
      type="button"
      onClick={onOpenActivePhase}
      aria-label={`${model.phaseName}, ${timing}. Open phase`}
      className="mt-5 block w-full text-left rounded-lg pressable-card focus-ring"
    >
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
          className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-highlight"
        >
          <div
            className="h-full rounded-full bg-accent-blue"
            // A just-started phase still shows a dot, as in the design.
            style={{ width: `max(${progress.percent}%, 0.375rem)` }}
          />
        </div>
      )}
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="min-w-0 truncate text-muted">
          <span className="font-bold text-foreground">{model.phaseName}</span>
          {' · '}
          {timing}
        </span>
        <span className="inline-flex shrink-0 items-center gap-0.5 font-semibold text-accent-blue">
          Open phase
          <ChevronRight size={16} aria-hidden="true" />
        </span>
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
    </button>
  );
};

/**
 * Home "Your Goal" card. The original full-colour goal tile stays on top;
 * under it, without a phase: how the goal is going (the last 7 finished days
 * against their targets, the weight-trend verdict, a 4-week projection, at
 * most one nudge) and a "Start a phase" link (hideable in Settings -> Home &
 * Tips). With an active phase the tile is
 * locked (it shows the target the phase set) and a glanceable phase row - a
 * progress bar, "Name · Day X of Y", "Open phase" - replaces the goal detail.
 * Numbers come from `buildGoalPlanCardModel` + `buildDayLedgerCardSummary`;
 * missing data is a hint, never a zero.
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
      isGoalState
        ? buildDayLedgerCardSummary({
            snapshots: dailySnapshots,
            currentGoal: selectedGoal,
            tolerance: onTargetTolerance,
            windowDays: GOAL_PLAN_STRIP_DAYS,
            todayKey,
          })
        : null,
    [isGoalState, dailySnapshots, selectedGoal, onTargetTolerance, todayKey]
  );

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
        locked={isGoalLocked || !isGoalState}
        dayInGoal={isGoalState ? model.dayInGoal : null}
        onClick={onGoalClick}
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
          <PhaseStateBody model={model} onOpenActivePhase={onOpenActivePhase} />
        )}
      </div>
    </div>
  );
};
