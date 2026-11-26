import React, { memo, useMemo } from 'react';
import {
  ClipboardList,
  Plus,
  Calendar,
  CalendarRange,
  ChevronRight,
  TrendingUp,
  Target,
  Play,
  Archive,
  Flame,
} from 'lucide-react';
import { goals } from '../../../constants/goals/goals';
import { useUnits } from '../../../hooks/useUnits';
import { calculatePhaseMetrics } from '../../../utils/phases/phases';
import {
  buildDayLedgerCardSummary,
  DAY_LEDGER_BALANCE_META,
  formatSignedKcal,
} from '../../../utils/calculations/dayLedgerPresentation';
import { getDailyBalanceKind } from '../../../utils/calculations/rollingEnergyBalance';
import { InsightStatus } from '../common/InsightHeadline';
import { DayBalanceStrip } from '../common/DayBalanceStrip';
import { normalizeOnTargetTolerance } from '../../../constants/goals/onTarget';
import { shallow } from 'zustand/shallow';
import { useEnergyMapStore } from '../../../store/useEnergyMapStore';

const getPhaseStatusBadge = (status) => {
  switch (status) {
    case 'active':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-accent-green/15 border border-accent-green/50 rounded-md text-accent-green text-xs font-semibold">
          <span className="w-2 h-2 bg-accent-green rounded-full animate-pulse" />
          ACTIVE
        </span>
      );
    case 'completed':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-surface-highlight border border-border rounded-md text-muted text-xs font-semibold">
          <Archive size={12} />
          COMPLETED
        </span>
      );
    case 'paused':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-accent-yellow/15 border border-accent-yellow/50 rounded-md text-accent-yellow text-xs font-semibold">
          PAUSED
        </span>
      );
    default:
      return null;
  }
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T00:00:00Z');
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const calculatePhaseDays = (startDate, endDate) => {
  const start = new Date(startDate + 'T00:00:00Z');
  const end = endDate ? new Date(endDate + 'T00:00:00Z') : new Date();
  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

const calculateCurrentDay = (startDate) => {
  const start = new Date(startDate + 'T00:00:00Z');
  const now = new Date();
  const diffTime = Math.abs(now - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

const PhaseCard = ({ phase, onPhaseClick }) => {
  const { bodyWeight, energy } = useUnits();
  const goal = goals[phase.goalType] || goals.maintenance;
  // Helper for goal badge color classes
  const getGoalBadgeClass = () => {
    if (!goal || !goal.color)
      return 'bg-surface-highlight text-muted border-border';
    return `${goal.color} text-primary-foreground border-2 ${goal.color.replace('bg-', 'border-')}`;
  };
  const isActive = phase.status === 'active';
  const totalDays = phase.endDate
    ? calculatePhaseDays(phase.startDate, phase.endDate)
    : null;
  const currentDay = calculateCurrentDay(phase.startDate);

  const weightChange = phase.metrics?.weightChange || 0;
  const weightChangeDisplay =
    weightChange === 0 ? '—' : bodyWeight.formatDelta(weightChange);

  return (
    <button
      type="button"
      onClick={() => onPhaseClick(phase)}
      className={`w-full text-left p-5 rounded-xl border-2 transition-all md:hover:scale-[1.02] pressable-card focus-ring ${
        isActive
          ? 'bg-linear-to-br from-surface to-background border-accent-blue shadow-lg'
          : 'bg-surface-highlight/50 border border-border/50 md:hover:border-border'
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1">
          <h3 className="text-foreground font-bold text-lg mb-1">
            {phase.name}
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            {getPhaseStatusBadge(phase.status)}
            <span
              className={`px-2 py-1 rounded-md text-xs font-semibold ${getGoalBadgeClass()}`}
            >
              {goal.label}
            </span>
          </div>
        </div>
        <ClipboardList
          className={isActive ? 'text-accent-blue' : 'text-muted'}
          size={24}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted">
          <Calendar size={14} className="text-muted" />
          <span>
            {formatDate(phase.startDate)}
            {phase.endDate && ` - ${formatDate(phase.endDate)}`}
            {!phase.endDate && ' - Ongoing'}
          </span>
        </div>

        {isActive && totalDays && (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Target size={14} className="text-muted" />
            <span>
              Day {currentDay} of {totalDays}
            </span>
          </div>
        )}

        <div className="flex items-center gap-2 text-sm text-muted">
          <TrendingUp size={14} className="text-muted" />
          <span>
            {bodyWeight.format(phase.startingWeight)} → {weightChangeDisplay}
            {phase.targetWeight > 0 &&
              ` (Target: ${bodyWeight.format(phase.targetWeight)})`}
          </span>
        </div>

        {phase.metrics?.activeDays > 0 && (
          <div className="mt-3 pt-3 border-t border-border">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-muted">Logged Days:</span>
                <span className="ml-1 text-foreground font-semibold">
                  {phase.metrics.activeDays}
                </span>
              </div>
              {phase.metrics.avgCalories > 0 && (
                <div>
                  <span className="text-muted">Avg {energy.noun}:</span>
                  <span className="ml-1 text-foreground font-semibold">
                    {energy.value(phase.metrics.avgCalories, {
                      grouping: false,
                    })}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </button>
  );
};

const formatStripDay = (dateKey) =>
  formatDate(dateKey).replace(/,\s*\d{4}$/, '');

/** "Oct 3", or "Oct 3, 2025" when it is not this year. */
const formatSinceDate = (dateKey) => {
  const full = formatDate(dateKey);
  return dateKey.slice(0, 4) === String(new Date().getFullYear())
    ? full.replace(/,\s*\d{4}$/, '')
    : full;
};

/**
 * The card's big number: the count beside a two-line unit ("days / logged").
 * The unit column is centred against the number's height and keeps its two
 * lines tight (a small gap, not spread across the full block), so it reads as
 * one compact block at any text size (both scale with Text size).
 */
const LedgerHeadline = ({ value, singular }) => (
  <span
    data-testid="day-ledger-headline"
    className="flex items-stretch justify-end gap-1.5"
  >
    <span className="text-4xl font-bold leading-none text-foreground">
      {value}
    </span>
    <span
      aria-hidden="true"
      className="flex flex-col justify-center gap-1 text-left text-[11px] font-medium leading-none text-muted"
    >
      <span>{singular ? 'day' : 'days'}</span>
      <span>logged</span>
    </span>
  </span>
);

const LedgerTile = ({ label, children }) => (
  <div className="rounded-xl bg-surface-highlight/50 border border-border/50 px-3 py-2 min-w-0">
    <p className="text-xs text-muted">{label}</p>
    {children}
  </div>
);

/** One "7 days ........ +280" row inside the average tile. */
const LedgerAverageRow = ({ label, value }) => {
  const units = useUnits();
  const meta =
    value !== null ? DAY_LEDGER_BALANCE_META[getDailyBalanceKind(value)] : null;
  return (
    <p className="mt-0.5 flex items-baseline justify-between gap-2">
      <span className="text-[11px] text-muted">{label}</span>
      <span
        className={`text-base font-bold ${meta?.textClass ?? 'text-muted'}`}
      >
        {value !== null ? formatSignedKcal(value, units) : '—'}
      </span>
    </p>
  );
};

/**
 * Logbook entry point to the Daily Ledger: a live preview of the last two
 * weeks (one bar per finished day, coloured by balance kind exactly like the
 * ledger's calendar and sized by how far the day landed from maintenance;
 * bars that missed their goal target dim), how many of those days were on
 * target, the goal streak, yesterday against its target and the 7/14-day
 * average balance. Same card grammar as the Insights cards; the strip is the
 * signature element. All numbers come from `buildDayLedgerCardSummary` -
 * read-only snapshot projections; an unlogged day is a gap, never a zero.
 */
const DayLedgerCard = ({ dailySnapshots, selectedGoal, tolerance, onOpen }) => {
  const units = useUnits();
  const summary = useMemo(
    () =>
      buildDayLedgerCardSummary({
        snapshots: dailySnapshots,
        currentGoal: selectedGoal,
        tolerance,
      }),
    [dailySnapshots, selectedGoal, tolerance]
  );
  const {
    trackedDays,
    firstLoggedDate,
    days,
    yesterday,
    streak,
    judgedDays,
    onTargetDays,
    avgBalance7,
    avgBalance14,
  } = summary;
  const hasData = trackedDays > 0;

  const subtitle = firstLoggedDate
    ? `Tracking since ${formatSinceDate(firstLoggedDate)}`
    : 'Browse your day-by-day energy history';

  const yesterdayMeta = yesterday
    ? DAY_LEDGER_BALANCE_META[yesterday.kind]
    : null;

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-lg p-5 md:p-6">
      <button
        type="button"
        onClick={onOpen}
        aria-label={
          hasData
            ? `Daily Ledger, ${trackedDays} ${trackedDays === 1 ? 'day' : 'days'} logged. Open`
            : 'Daily Ledger. Open'
        }
        className="w-full text-left rounded-xl transition-all group pressable-card focus-ring"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <CalendarRange className="text-accent-blue" size={30} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-foreground">Daily Ledger</h2>
            <p className="text-muted text-sm truncate">{subtitle}</p>
          </div>
          <div className="shrink-0 text-right">
            {hasData ? (
              <LedgerHeadline
                value={trackedDays.toLocaleString()}
                singular={trackedDays === 1}
              />
            ) : (
              <InsightStatus label="No days yet" />
            )}
          </div>
        </div>

        {hasData ? (
          <>
            <div className="mt-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <span className="text-xs text-muted">
                  {judgedDays > 0
                    ? `${onTargetDays} of ${judgedDays} logged ${
                        judgedDays === 1 ? 'day' : 'days'
                      } on target`
                    : `Last ${summary.windowDays} days`}
                </span>
                {streak >= 2 && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-accent-orange/40 bg-accent-orange/15 px-2 py-0.5 text-[11px] font-semibold text-accent-orange">
                    <Flame size={12} />
                    {streak}-day {goals[summary.streakGoal]?.label ?? 'goal'}{' '}
                    streak
                  </span>
                )}
              </div>
              <DayBalanceStrip
                days={days}
                ariaLabel={`${summary.loggedDays} of ${summary.windowDays} recent days logged`}
                testId="day-ledger-strip"
                getDayTitle={formatStripDay}
              />
              <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted">
                <span>{formatStripDay(days[0].date)}</span>
                <span>Yesterday</span>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <LedgerTile label="Yesterday">
                {yesterday ? (
                  <>
                    <p
                      className={`mt-0.5 text-base font-bold truncate ${yesterdayMeta.textClass}`}
                    >
                      {formatSignedKcal(yesterday.balance, units)}
                      <span className="ml-1 text-[11px] font-medium text-muted">
                        {yesterdayMeta.label}
                      </span>
                    </p>
                    <p className="mt-0.5 text-[11px] truncate">
                      {yesterday.deviation === null ? (
                        <span className="text-muted">No target recorded</span>
                      ) : yesterday.onTarget ? (
                        <span className="font-semibold text-accent-green">
                          On target
                        </span>
                      ) : (
                        <span className="font-semibold text-accent-orange">
                          {formatSignedKcal(yesterday.deviation, units)} vs
                          target
                        </span>
                      )}
                      {yesterday.target !== null && (
                        <span className="text-muted">
                          {' · '}target{' '}
                          {formatSignedKcal(yesterday.target, units)}
                        </span>
                      )}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mt-0.5 text-base font-bold text-muted">
                      Not logged
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      Nothing eaten yesterday
                    </p>
                  </>
                )}
              </LedgerTile>
              <LedgerTile label="Average balance">
                <LedgerAverageRow label="7 days" value={avgBalance7} />
                <LedgerAverageRow label="14 days" value={avgBalance14} />
              </LedgerTile>
            </div>
          </>
        ) : (
          <p className="mt-3 text-muted text-sm">
            Log a day of food and it lands here: energy in, energy out, and the
            balance between them, one day at a time.
          </p>
        )}

        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-accent-blue/80">
            {hasData ? 'Tap to browse every day' : 'Tap to open the ledger'}
          </span>
          <ChevronRight
            size={16}
            className="text-muted transition-colors md:group-hover:text-primary"
          />
        </div>
      </button>
    </div>
  );
};

// Memoized: the orchestrator's local state churn (modal opens, drafts,
// pickers) re-renders its whole tree; the carousel screens receive stable
// props, so React.memo keeps unrelated screens from reconciling each time.
export const LogbookScreen = memo(function LogbookScreen({
  phases,
  weightEntries,
  nutritionData,
  onCreatePhase,
  onPhaseClick,
  onOpenDayLedger,
}) {
  const store = useEnergyMapStore(
    (state) => ({
      phases: state.phases ?? [],
      weightEntries: state.weightEntries ?? [],
      nutritionData: state.nutritionData ?? {},
      dailySnapshots: state.userData?.dailySnapshots ?? {},
      selectedGoal: state.selectedGoal,
      onTargetToleranceKcal: state.userData?.onTargetToleranceKcal,
    }),
    shallow
  );

  const resolvedPhases = phases ?? store.phases;
  const resolvedWeightEntries = weightEntries ?? store.weightEntries;
  const resolvedNutritionData = nutritionData ?? store.nutritionData;

  const phasesWithMetrics = useMemo(
    () =>
      resolvedPhases.map((phase) => ({
        ...phase,
        metrics: calculatePhaseMetrics(
          phase,
          resolvedWeightEntries,
          resolvedNutritionData
        ),
      })),
    [resolvedNutritionData, resolvedPhases, resolvedWeightEntries]
  );

  const activePhases = useMemo(
    () => phasesWithMetrics.filter((phase) => phase.status === 'active'),
    [phasesWithMetrics]
  );

  const completedPhases = useMemo(
    () => phasesWithMetrics.filter((phase) => phase.status === 'completed'),
    [phasesWithMetrics]
  );

  const hasPhases = phasesWithMetrics.length > 0;

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="bg-surface rounded-2xl p-6 border border-border shadow-lg">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ClipboardList className="text-accent-blue" size={32} />
            <h1 className="text-2xl md:text-3xl font-black text-foreground">
              Logbook
            </h1>
          </div>
          <button
            type="button"
            onClick={onCreatePhase}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-semibold transition-all flex items-center gap-2 press-feedback focus-ring md:hover:brightness-110"
          >
            <Plus size={20} />
            <span className="hidden sm:inline">New Phase</span>
          </button>
        </div>
      </div>

      {/* Empty State */}
      {!hasPhases && (
        <div className="bg-surface rounded-2xl p-8 md:p-12 border border-border text-center">
          <div className="max-w-md mx-auto">
            <div className="w-16 h-16 bg-surface-highlight rounded-full flex items-center justify-center mx-auto mb-4">
              <ClipboardList className="text-muted" size={32} />
            </div>
            <h3 className="text-foreground font-bold text-xl mb-2">
              No Phases Yet
            </h3>
            <p className="text-muted text-sm mb-6">
              Create your first phase to start organizing your fitness journey.
              Phases help you track specific goals like bulking, cutting, or
              maintaining over time.
            </p>
            <button
              type="button"
              onClick={onCreatePhase}
              className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-semibold transition-all inline-flex items-center gap-2 press-feedback focus-ring md:hover:brightness-110"
            >
              <Plus size={20} />
              Create Your First Phase
            </button>
          </div>
        </div>
      )}

      {/* Active Phases */}
      {activePhases.length > 0 && (
        <div className="bg-surface rounded-2xl p-5 border border-border shadow-lg">
          <h2 className="text-foreground font-bold text-lg mb-3 flex items-center gap-2">
            <Play className="text-accent-blue" size={18} />
            Active Phases
          </h2>
          <div className="space-y-3">
            {activePhases.map((phase) => (
              <PhaseCard
                key={phase.id}
                phase={phase}
                onPhaseClick={onPhaseClick}
              />
            ))}
          </div>
        </div>
      )}

      {/* Completed Phases */}
      {completedPhases.length > 0 && (
        <div className="bg-surface rounded-2xl p-5 border border-border shadow-lg">
          <h2 className="text-foreground font-bold text-lg mb-3 flex items-center gap-2">
            <Archive size={18} />
            Completed Phases
          </h2>
          <div className="space-y-3">
            {completedPhases.map((phase) => (
              <PhaseCard
                key={phase.id}
                phase={phase}
                onPhaseClick={onPhaseClick}
              />
            ))}
          </div>
        </div>
      )}

      {/* Daily Ledger entry card */}
      <DayLedgerCard
        dailySnapshots={store.dailySnapshots}
        selectedGoal={store.selectedGoal}
        tolerance={normalizeOnTargetTolerance(store.onTargetToleranceKcal)}
        onOpen={onOpenDayLedger}
      />
    </div>
  );
});
