import React, { useMemo, useState } from 'react';
import {
  ChevronLeft,
  BarChart3,
  TrendingDown,
  TrendingUp,
  Minus,
  CalendarDays,
  Scale,
} from 'lucide-react';
import { shallow } from 'zustand/shallow';
import { ModalShell } from '../../common/ModalShell';
import { useEnergyMapStore } from '../../../../store/useEnergyMapStore';
import { getTodayDateKey } from '../../../../utils/data/dateKeys';
import {
  calculateRollingEnergyBalance,
  getDailyBalanceKind,
  ROLLING_BALANCE_WINDOWS,
  DEFAULT_ROLLING_BALANCE_WINDOW_DAYS,
} from '../../../../utils/calculations/rollingEnergyBalance';
import {
  calculateWeightTrend,
  formatDateLabel,
} from '../../../../utils/measurements/weight';
import { formatWeeklyRate } from '../../../../utils/visuals/trackerHelpers';

const WINDOW_LABELS = {
  3: '3D',
  7: '7D',
  14: '14D',
  28: '28D',
};

const KIND_META = {
  deficit: {
    label: 'Deficit',
    textClass: 'text-accent-red',
    fill: 'rgb(var(--accent-red))',
  },
  surplus: {
    label: 'Surplus',
    textClass: 'text-accent-green',
    fill: 'rgb(var(--accent-green))',
  },
  maintenance: {
    label: 'Maintenance',
    textClass: 'text-accent-slate',
    fill: 'rgb(var(--accent-slate))',
  },
};

const formatSignedKcal = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '—';
  }
  const rounded = Math.round(numeric);
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded.toLocaleString()} kcal`;
};

const formatKcal = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '—';
  }
  return `${Math.round(numeric).toLocaleString()} kcal`;
};

const formatAverage = (value) => {
  if (value == null || !Number.isFinite(Number(value))) {
    return '—';
  }
  const numeric = Number(value);
  const sign = numeric > 0 ? '+' : '';
  return `${sign}${numeric.toFixed(1)} kcal/day`;
};

const formatEstimateKg = (value) => {
  if (value == null || !Number.isFinite(Number(value))) {
    return '—';
  }
  const numeric = Number(value);
  const sign = numeric > 0 ? '+' : '';
  return `${sign}${Math.abs(numeric).toFixed(2)} kg`;
};

// ---------------------------------------------------------------------------
// Compact daily-balance bar chart (inline SVG, no extra dependency)
// ---------------------------------------------------------------------------

const CHART_SLOT = 34;
const CHART_WIDTH_RATIO = 0.62; // bar occupies this fraction of its slot
const CHART_VIEW_H = 128;
const CHART_MIDLINE_Y = 70;
const CHART_HALF_EXTENT = 48;

const DailyBalanceChart = ({ days }) => {
  const maxAbs = days.reduce(
    (max, day) => Math.max(max, Math.abs(day.balance)),
    1
  );
  const chartWidth = days.length * CHART_SLOT;

  const bars = days.map((day, index) => {
    const kind = getDailyBalanceKind(day.balance);
    const rawH = (Math.abs(day.balance) / maxAbs) * CHART_HALF_EXTENT;
    const barH = Math.max(rawH, 2);
    const x = index * CHART_SLOT + CHART_SLOT * ((1 - CHART_WIDTH_RATIO) / 2);
    const barWidth = CHART_SLOT * CHART_WIDTH_RATIO;
    const y = day.balance >= 0 ? CHART_MIDLINE_Y - barH : CHART_MIDLINE_Y;
    const dayNumber = day.date.slice(8, 10);
    return {
      key: day.date,
      x,
      y,
      barWidth,
      barH,
      kind,
      dayNumber,
      balance: day.balance,
    };
  });

  return (
    <svg
      viewBox={`0 0 ${chartWidth} ${CHART_VIEW_H}`}
      className="w-full h-auto"
      role="img"
      aria-label="Daily energy balance bars"
    >
      <line
        x1={0}
        y1={CHART_MIDLINE_Y}
        x2={chartWidth}
        y2={CHART_MIDLINE_Y}
        stroke="rgb(var(--accent-slate))"
        strokeWidth={1.5}
        strokeDasharray="3 3"
        opacity={0.6}
      />
      <text
        x={chartWidth - 2}
        y={CHART_MIDLINE_Y - 4}
        textAnchor="end"
        fontSize={9}
        fill="rgb(var(--accent-slate))"
        opacity={0.8}
      >
        0
      </text>
      {bars.map((bar) => (
        <g key={bar.key}>
          <rect
            className="tracker-bar-animated"
            x={bar.x}
            y={bar.y}
            width={bar.barWidth}
            height={bar.barH}
            rx={2}
            fill={KIND_META[bar.kind].fill}
            opacity={0.9}
          >
            <title>
              {formatDateLabel(bar.key)} —{' '}
              {`${KIND_META[bar.kind].label} ${formatSignedKcal(bar.balance)}`}
            </title>
          </rect>
          <text
            x={bar.x + bar.barWidth / 2}
            y={CHART_VIEW_H - 4}
            textAnchor="middle"
            fontSize={9}
            fill="rgb(var(--accent-slate))"
            opacity={0.75}
          >
            {bar.dayNumber}
          </text>
        </g>
      ))}
    </svg>
  );
};
// ---------------------------------------------------------------------------
// Small shared building blocks
// ---------------------------------------------------------------------------

const EmptyState = () => (
  <div className="bg-surface-highlight/50 border border-border/50 rounded-xl p-6 text-center">
    <BarChart3 size={28} className="text-muted mx-auto mb-2" />
    <p className="text-foreground font-semibold text-sm">No tracked days yet</p>
    <p className="text-muted text-xs mt-1 leading-snug">
      Log calories through the Tracker to start building up a rolling energy
      balance. Days with no log aren&apos;t counted as zero-intake days.
    </p>
  </div>
);

const Metric = ({ label, value }) => (
  <div className="bg-surface-highlight/50 border border-border/50 rounded-xl px-3 py-2">
    <p className="text-[11px] text-muted">{label}</p>
    <p className="mt-0.5 text-sm font-semibold text-foreground truncate">
      {value}
    </p>
  </div>
);

const DailyRow = ({ day }) => {
  const kind = getDailyBalanceKind(day.balance);
  const meta = KIND_META[kind];
  const isDeficit = day.balance >= 0;

  return (
    <div className="bg-surface-highlight/50 border border-border/50 rounded-xl px-4 py-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">
          {formatDateLabel(day.date, { month: 'short', day: 'numeric' })}
        </p>
        <p className={`text-xs font-bold ${meta.textClass}`}>
          {`${meta.label} ${formatSignedKcal(day.balance)}`}
        </p>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div className="bg-surface rounded-lg px-2 py-1.5">
          <span className="text-muted">TDEE </span>
          <span className="text-foreground font-semibold">
            {formatKcal(day.tdee)}
          </span>
        </div>
        <div className="bg-surface rounded-lg px-2 py-1.5">
          <span className="text-muted">Intake </span>
          <span className="text-foreground font-semibold">
            {formatKcal(day.intake)}
          </span>
        </div>
      </div>
      <p className="text-[11px] text-muted mt-1">
        {isDeficit ? 'Burned more than eaten' : 'Ate more than burned'}
      </p>
    </div>
  );
};
export const RollingEnergyBalanceModal = ({ isOpen, isClosing, onClose }) => {
  const [windowDays, setWindowDays] = useState(
    DEFAULT_ROLLING_BALANCE_WINDOW_DAYS
  );
  const [showBreakdown, setShowBreakdown] = useState(false);

  const store = useEnergyMapStore(
    (state) => ({
      dailySnapshots: state.userData?.dailySnapshots,
      weightEntries: state.weightEntries ?? [],
      goalDailyBalanceTarget: state.goalDailyBalanceTarget,
    }),
    shallow
  );

  const data = useMemo(
    () =>
      calculateRollingEnergyBalance({
        snapshots: store.dailySnapshots,
        windowDays,
        asOfDate: getTodayDateKey(),
        goalDailyBalanceTarget: store.goalDailyBalanceTarget,
      }),
    [store.dailySnapshots, windowDays, store.goalDailyBalanceTarget]
  );

  const weightTrend = useMemo(
    () => calculateWeightTrend(store.weightEntries ?? [], 7),
    [store.weightEntries]
  );

  const balanceTone =
    data.hasData && data.rollingBalance !== 0
      ? getDailyBalanceKind(data.rollingBalance) === 'deficit'
        ? 'text-accent-red'
        : 'text-accent-green'
      : 'text-muted';

  const hasExpected =
    data.expectedBalance != null && data.balanceVariance != null;
  const hasWeightTrend =
    Number.isFinite(Number(weightTrend?.weeklyRate)) &&
    weightTrend?.weeklyRate !== 0;

  return (
    <>
      <ModalShell
        isOpen={isOpen}
        isClosing={isClosing}
        overlayClassName="fixed inset-0 bg-surface/70 !p-0 !flex-none !items-stretch !justify-stretch z-[1000]"
        contentClassName="fixed inset-0 w-screen h-screen p-0 bg-background rounded-none border-none !max-h-none flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] z-[1001]"
      >
        {/* Header bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-background border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onClose?.()}
              aria-label="Back"
              className="text-muted md:hover:text-foreground transition-all pressable-inline focus-ring"
            >
              <ChevronLeft size={24} />
            </button>
            <div className="flex items-center gap-2">
              <h3 className="text-foreground font-bold text-xl">
                Rolling Energy Balance
              </h3>
            </div>
          </div>
        </div>

        {/* Main content area */}
        <div className="flex-1 bg-surface border-t border-border overflow-y-auto">
          {/* Window selector */}
          <div className="px-4 pt-3 pb-1 flex flex-col gap-3">
            <div className="relative flex items-center gap-1 p-1 bg-surface-highlight rounded-lg">
              {/* Sliding pill — p-1 (8px) + 3 gaps × gap-1 (4px) = 20px track inset */}
              <div
                className="absolute inset-y-1 rounded-md shadow-md bg-accent-blue"
                style={{
                  width: `calc((100% - 20px) / ${ROLLING_BALANCE_WINDOWS.length})`,
                  left: `calc(${ROLLING_BALANCE_WINDOWS.indexOf(windowDays)} * ((100% - 20px) / ${ROLLING_BALANCE_WINDOWS.length}) + ${4 + ROLLING_BALANCE_WINDOWS.indexOf(windowDays) * 4}px)`,
                  transition:
                    'left 0.28s cubic-bezier(0.32, 0.72, 0, 1), background-color 0.28s ease-out, box-shadow 0.28s ease-out',
                }}
              />
              {ROLLING_BALANCE_WINDOWS.map((window) => {
                const selected = window === windowDays;
                return (
                  <button
                    key={window}
                    type="button"
                    onClick={() => setWindowDays(window)}
                    className={`relative z-10 flex-1 flex items-center justify-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      selected
                        ? 'text-primary-foreground'
                        : 'text-muted md:hover:text-foreground'
                    }`}
                  >
                    {WINDOW_LABELS[window] ?? `${window}D`}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted">
              {`${windowDays}-day balance`}
              <span className="text-muted/70">
                {` · ${data.trackedDays} of ${data.windowDays} days tracked`}
              </span>
            </p>
          </div>

          <div
            key={`rolling-window-${windowDays}`}
            className="px-4 pt-2 pb-8 tracker-graph-switch"
          >
            {!data.hasData ? (
              <EmptyState />
            ) : (
              <>
                {/* Primary stat */}
                <div className="bg-surface-highlight/50 border border-border/50 rounded-xl p-4">
                  <p className="text-xs text-muted">Total balance</p>
                  <p className={`text-3xl font-bold mt-1 ${balanceTone}`}>
                    {formatSignedKcal(data.rollingBalance)}
                  </p>
                  <p className="text-sm text-muted mt-1">
                    Average{' '}
                    <span className="text-foreground font-semibold">
                      {formatAverage(data.averageDailyBalance)}
                    </span>
                  </p>
                  <p className="text-[11px] text-muted mt-1">
                    Positive = deficit · Negative = surplus
                  </p>
                </div>

                {/* Chart */}
                <div className="mt-3 bg-surface-highlight/50 border border-border/50 rounded-xl p-3">
                  <DailyBalanceChart days={data.days} />
                  <div className="flex items-center justify-center gap-4 pt-1 flex-wrap">
                    <span className="flex items-center gap-1 text-[11px] text-accent-red">
                      <TrendingDown size={12} /> Deficit
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-accent-green">
                      <TrendingUp size={12} /> Surplus
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-accent-slate">
                      <Minus size={12} /> Near zero
                    </span>
                  </div>
                </div>

                {data.insufficientData && (
                  <div className="mt-3 flex items-start gap-2 bg-accent-yellow/10 border border-accent-yellow/30 rounded-xl px-3 py-2">
                    <CalendarDays
                      size={16}
                      className="text-accent-yellow flex-shrink-0 mt-0.5"
                    />
                    <p className="text-xs text-muted">
                      {`Only ${data.trackedDays} of ${data.windowDays} days have data in this window. Missing days aren't counted as zero-intake days.`}
                    </p>
                  </div>
                )}
                {/* Planned vs actual */}
                {hasExpected && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <Metric
                      label="Expected"
                      value={formatSignedKcal(data.expectedBalance)}
                    />
                    <Metric
                      label="Actual"
                      value={formatSignedKcal(data.rollingBalance)}
                    />
                    <Metric
                      label="Variance"
                      value={formatSignedKcal(data.balanceVariance)}
                    />
                  </div>
                )}

                {/* Estimated weight change + observed trend */}
                <div className="mt-3 bg-surface-highlight/50 border border-border/50 rounded-xl p-3">
                  <div className="flex items-center gap-2">
                    <Scale
                      size={16}
                      className="text-accent-blue flex-shrink-0"
                    />
                    <p className="text-sm font-semibold text-foreground">
                      Rough energy-equivalent estimate
                    </p>
                  </div>
                  <p className="text-xs text-muted mt-1">
                    {`${formatEstimateKg(
                      data.estimatedWeightChangeKg
                    )} over this window, if all of it were stored as body energy. This is not an exact prediction.`}
                  </p>
                  {hasWeightTrend && (
                    <p className="text-xs text-muted mt-2">
                      Observed weight trend:{' '}
                      <span className="text-foreground font-semibold">
                        {formatWeeklyRate(weightTrend.weeklyRate, 'weight')}
                      </span>{' '}
                      · comparison only, not causation.
                    </p>
                  )}
                </div>

                {/* Daily breakdown */}
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => setShowBreakdown((value) => !value)}
                    className="w-full flex items-center justify-between bg-surface-highlight/50 border border-border/50 rounded-xl px-4 py-3 pressable-card focus-ring"
                    aria-expanded={showBreakdown}
                  >
                    <span className="text-sm font-semibold text-foreground">
                      Daily breakdown
                    </span>
                    <span className="text-xs text-muted">
                      {showBreakdown ? 'Hide' : 'Show'}
                    </span>
                  </button>
                  {showBreakdown && (
                    <div className="mt-2 space-y-2">
                      {data.days
                        .slice()
                        .reverse()
                        .map((day) => (
                          <DailyRow key={day.date} day={day} />
                        ))}
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-muted/80 mt-4 leading-snug">
                  Rolling balance is an analytical trend over the tracked days
                  in this window. A single day is not evidence that your plan is
                  succeeding or failing.
                </p>
              </>
            )}
          </div>
        </div>
      </ModalShell>
    </>
  );
};
