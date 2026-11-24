import React, { memo, useMemo } from 'react';
import { Info, LineChart, AlertCircle } from 'lucide-react';
import {
  calculateWeightTrend,
  createSparklinePoints,
  sortWeightEntries,
  formatWeight,
} from '../../../utils/measurements/weight';
import {
  calculateBodyFatTrend,
  createBodyFatSparklinePoints,
  sortBodyFatEntries,
  formatBodyFat,
} from '../../../utils/measurements/bodyFat';
import {
  calculateBMI,
  getBMICategory,
  calculateFFMI,
  getFFMICategory,
} from '../../../utils/calculations/calculations';
import {
  getGoalAlignedStyle,
  hasTrendData,
} from '../../../utils/calculations/goalAlignment';
import {
  TrendIcon,
  getTrendToneClass,
  getGoalAlignmentText,
  formatWeeklyRate,
  formatSnapshotDate,
  getOldDataWarningText,
} from '../../../utils/visuals/trackerHelpers';
import { shallow } from 'zustand/shallow';
import { Gauge, ChevronRight, BarChart3 } from 'lucide-react';
import { getTodayDateKey } from '../../../utils/data/dateKeys';
import {
  computeAdaptiveThermogenesis,
  resolveAdaptiveThermogenesisMode,
} from '../../../utils/calculations/adaptiveThermogenesis';
import {
  calculateRollingEnergyBalance,
  getDailyBalanceKind,
} from '../../../utils/calculations/rollingEnergyBalance';
import { useEnergyMapStore } from '../../../store/useEnergyMapStore';
import { RestingHeartRateCard } from '../common/RestingHeartRateCard';
import { InsightHeadline, InsightStatus } from '../common/InsightHeadline';

function AdaptiveCorrectionCard({ result, mode, goalDurationDays, onOpen }) {
  const insufficientData = Boolean(result?.insufficientData);
  const correction = Number(result?.correction ?? 0);
  const active = Boolean(result?.active);
  const isCut = correction < 0;
  const neutral = mode === 'off' || insufficientData || !active;

  const accent = neutral
    ? 'text-muted'
    : isCut
      ? 'text-accent-orange'
      : 'text-accent-blue';

  // The state words stand alone; a real correction gets a small "kcal/day"
  // unit beside the big number (see InsightHeadline).
  const hasCorrection = mode !== 'off' && !insufficientData && active;
  const headline =
    mode === 'off'
      ? 'Off'
      : insufficientData
        ? 'No data'
        : !active
          ? 'Inactive'
          : `${correction > 0 ? '+' : ''}${correction}`;

  const formatPressure = (value) => {
    const number = Number(value) || 0;
    return (number > 0 ? '+' : '') + Math.round(number * 100) / 100;
  };
  const crudePressure =
    mode === 'crude' ? formatPressure(result?.details?.balancePressure) : null;
  const isCrudeMaintenanceIdle =
    mode === 'crude' && !active && result?.details?.goalType === 'maintenance';
  const isSmartMaintenance =
    mode === 'smart' && result?.details?.reason === 'maintenance-goal';

  const subtitle =
    mode === 'off'
      ? 'Not enabled'
      : mode === 'crude'
        ? active
          ? `Crude mode · Pressure ${crudePressure}`
          : isCrudeMaintenanceIdle
            ? 'Crude mode · no adjustment at maintenance'
            : 'Crude mode · not yet active'
        : isSmartMaintenance
          ? 'Smart mode · paused at maintenance'
          : insufficientData
            ? 'Still collecting data'
            : !active
              ? 'No correction needed right now'
              : `Smart mode · ${Math.round((result?.confidence ?? 0) * 100)}% confidence`;

  const stats = [];
  if (mode === 'crude') {
    const milestone = result?.details?.milestone;
    const windowDays = Number(result?.details?.windowDays) || 0;
    stats.push(
      {
        label: 'Active stage',
        value: milestone
          ? `${milestone.kcal > 0 ? '+' : ''}${milestone.kcal} kcal`
          : isCrudeMaintenanceIdle
            ? 'None at maintenance'
            : 'Not reached yet',
      },
      {
        label: 'Snapshot days',
        value: `${windowDays} day${windowDays === 1 ? '' : 's'}`,
      }
    );
  } else if (isSmartMaintenance) {
    stats.push(
      { label: 'Days on goal', value: `${goalDurationDays ?? 0} days` },
      { label: 'Status', value: 'None at maintenance' }
    );
  } else if (mode === 'smart' && insufficientData) {
    const d = result?.details;
    stats.push(
      {
        label: 'Logged days',
        value: `${d?.validDays ?? 0} / ${d?.minValidDays ?? 14}`,
      },
      {
        label: 'Weigh-ins',
        value: `${d?.weightEntriesUsed ?? 0} / ${d?.minWeightEntries ?? 4}`,
      }
    );
  } else if (mode === 'smart') {
    stats.push(
      { label: 'Days on goal', value: `${goalDurationDays ?? 0} days` },
      {
        label: 'Observed rate',
        value: `${result?.details?.observedRateKgPerWeek ?? 0} kg/wk`,
      }
    );
  } else {
    stats.push(
      { label: 'Status', value: 'Inactive' },
      { label: 'Days on goal', value: `${goalDurationDays ?? 0} days` }
    );
  }

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-lg p-5 md:p-6">
      <button
        type="button"
        onClick={onOpen}
        className="w-full text-left rounded-xl transition-all group pressable-card focus-ring"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Gauge className="text-accent-blue" size={30} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-foreground">
              Adaptive Thermogenesis
            </h2>
            <p className="text-muted text-sm truncate">{subtitle}</p>
          </div>
          <div className="shrink-0 text-right">
            {hasCorrection ? (
              <InsightHeadline
                value={headline}
                unit="kcal/day"
                valueClass={accent}
              />
            ) : (
              <InsightStatus label={headline} />
            )}
            {active && (
              <span className="mt-1 block text-[11px] text-muted">
                applied to target
              </span>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl bg-surface-highlight/50 border border-border/50 px-3 py-2"
            >
              <p className="text-xs text-muted">{stat.label}</p>
              <p className="mt-0.5 text-sm font-semibold text-foreground truncate">
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-accent-blue/80">
            Tap to view the full breakdown
          </span>
          <ChevronRight size={16} className="text-muted" />
        </div>
      </button>
    </div>
  );
}
function RollingBalancePreviewCard({ summary, onOpen }) {
  const hasData = Boolean(summary?.hasData);
  const rolling = summary?.rollingBalance ?? 0;
  const kind = hasData ? getDailyBalanceKind(rolling) : null;
  const accent = !hasData
    ? 'text-muted'
    : kind === 'deficit'
      ? 'text-accent-red'
      : 'text-accent-green';

  const displayRolling = -rolling;
  const headline = `${displayRolling > 0 ? '+' : ''}${Math.round(displayRolling).toLocaleString()} kcal`;

  const subtitle = !hasData
    ? 'Log calories to track a rolling balance'
    : `7-day balance · ${summary.trackedDays} of ${summary.windowDays} days tracked`;

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-lg p-5 md:p-6">
      <button
        type="button"
        onClick={onOpen}
        className="w-full text-left rounded-xl transition-all group pressable-card focus-ring"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <BarChart3 className="text-accent-blue" size={30} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-foreground">
              Rolling Energy Balance
            </h2>
            <p className="text-muted text-sm truncate">{subtitle}</p>
          </div>
          <div className="shrink-0 text-right">
            {hasData ? (
              <span className={`block text-md font-bold ${accent}`}>
                {headline}
              </span>
            ) : (
              <InsightStatus label="No data" />
            )}
            {hasData && (
              <span className="text-[11px] text-muted">
                avg {Number(-summary?.averageDailyBalance).toFixed(0)} kcal/day
              </span>
            )}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-accent-blue/80">
            {hasData
              ? summary.insufficientData
                ? 'Partial window — tap for details'
                : 'Tap for the full N-day trend'
              : 'Tap to learn more'}
          </span>
          <ChevronRight size={16} className="text-muted" />
        </div>
      </button>
    </div>
  );
}

// Static category color classes for the BMI / FFMI chips (module scope —
// these literals used to be rebuilt on every render).
const BMI_COLOR_MAP = {
  blue: {
    text: 'text-accent-blue',
    border: 'border-accent-blue/50',
    bg: 'bg-accent-blue/20',
  },
  green: {
    text: 'text-accent-green',
    border: 'border-accent-green/50',
    bg: 'bg-accent-green/20',
  },
  yellow: {
    text: 'text-accent-yellow',
    border: 'border-accent-yellow/50',
    bg: 'bg-accent-yellow/20',
  },
  red: {
    text: 'text-accent-red',
    border: 'border-accent-red/50',
    bg: 'bg-accent-red/20',
  },
  slate: {
    text: 'text-accent-slate',
    border: 'border-accent-slate/50',
    bg: 'bg-accent-slate/20',
  },
};

const FFMI_COLOR_MAP = {
  blue: {
    text: 'text-accent-blue',
    border: 'border-accent-blue/50',
    bg: 'bg-accent-blue/20',
  },
  green: {
    text: 'text-accent-green',
    border: 'border-accent-green/50',
    bg: 'bg-accent-green/20',
  },
  emerald: {
    text: 'text-accent-emerald',
    border: 'border-accent-emerald/50',
    bg: 'bg-accent-emerald/20',
  },
  purple: {
    text: 'text-accent-purple',
    border: 'border-accent-purple/50',
    bg: 'bg-accent-purple/20',
  },
  amber: {
    text: 'text-accent-amber',
    border: 'border-accent-amber/50',
    bg: 'bg-accent-amber/20',
  },
  red: {
    text: 'text-accent-red',
    border: 'border-accent-red/50',
    bg: 'bg-accent-red/20',
  },
  slate: {
    text: 'text-accent-slate',
    border: 'border-accent-slate/50',
    bg: 'bg-accent-slate/20',
  },
};

/**
 * Footer row shared by the Body Composition snapshot cards: one accent-tinted
 * affordance label and the chevron. Extracted so the empty, insufficient-data
 * and full states of both cards cannot drift apart.
 */
const SnapshotCardFooter = ({ label }) => (
  <div className="mt-3 flex items-center justify-between">
    <span className="text-accent-blue/80 text-[10px] tracking-wide">
      {label}
    </span>
    <ChevronRight size={16} className="text-muted" />
  </div>
);

// Memoized: the orchestrator's local state churn (modal opens, drafts,
// pickers) re-renders its whole tree; the carousel screens receive stable
// props, so React.memo keeps unrelated screens from reconciling each time.
export const InsightsScreen = memo(function InsightsScreen({
  userData,
  selectedGoal,
  weightEntries,
  onOpenWeightTracker,
  bodyFatEntries,
  bodyFatTrackingEnabled,
  onOpenBodyFatTracker,
  onOpenBmiInfo,
  onOpenFfmiInfo,
  onOpenAdaptiveThermogenesis,
  onOpenRollingEnergyBalance,
  onOpenHeartRateTracker,
}) {
  const store = useEnergyMapStore(
    (state) => ({
      userData: state.userData,
      weightEntries: state.weightEntries ?? [],
      bodyFatEntries: state.bodyFatEntries ?? [],
      goalDurationDays: state.goalDurationDays ?? 0,
      goalDailyBalanceTarget: state.goalDailyBalanceTarget,
    }),
    shallow
  );

  const resolvedUserData = userData ?? store.userData;
  const resolvedWeightEntries = weightEntries ?? store.weightEntries;
  const resolvedBodyFatEntries = bodyFatEntries ?? store.bodyFatEntries;
  const resolvedBodyFatTrackingEnabled =
    typeof bodyFatTrackingEnabled === 'boolean'
      ? bodyFatTrackingEnabled
      : resolvedUserData.bodyFatTrackingEnabled;

  // Sort all entries — trend functions handle the 7-day time window internally
  const sortedEntries = useMemo(
    () => sortWeightEntries(resolvedWeightEntries ?? []),
    [resolvedWeightEntries]
  );

  // Use a proper 7-day calendar window (matches the modal's 7d mode exactly)
  const trend = useMemo(
    () => calculateWeightTrend(sortedEntries, 7),
    [sortedEntries]
  );
  const weightGoalAlignment = useMemo(
    () => getGoalAlignmentText(trend, selectedGoal, 'weight'),
    [trend, selectedGoal]
  );
  const sparkline = useMemo(
    () =>
      createSparklinePoints(sortedEntries, {
        width: 160,
        height: 56,
        padding: 6,
        limit: 7,
      }),
    [sortedEntries]
  );

  const latestEntry = useMemo(
    () =>
      sortedEntries.length ? sortedEntries[sortedEntries.length - 1] : null,
    [sortedEntries]
  );

  const sortedBodyFatEntries = useMemo(
    () => sortBodyFatEntries(resolvedBodyFatEntries ?? []),
    [resolvedBodyFatEntries]
  );

  const bodyFatTrend = useMemo(
    () => calculateBodyFatTrend(sortedBodyFatEntries, 7),
    [sortedBodyFatEntries]
  );
  const bodyFatGoalAlignment = useMemo(
    () => getGoalAlignmentText(bodyFatTrend, selectedGoal, 'bodyFat'),
    [bodyFatTrend, selectedGoal]
  );

  const bodyFatSparkline = useMemo(
    () =>
      createBodyFatSparklinePoints(sortedBodyFatEntries, {
        width: 160,
        height: 56,
        padding: 6,
        limit: 7,
      }),
    [sortedBodyFatEntries]
  );

  const latestBodyFatEntry = useMemo(
    () =>
      sortedBodyFatEntries.length
        ? sortedBodyFatEntries[sortedBodyFatEntries.length - 1]
        : null,
    [sortedBodyFatEntries]
  );

  // BMI calculation
  const bmi = useMemo(
    () =>
      calculateBMI(
        latestEntry?.weight ?? resolvedUserData.weight,
        resolvedUserData.height
      ),
    [latestEntry, resolvedUserData.height, resolvedUserData.weight]
  );
  const bmiCategory = useMemo(() => getBMICategory(bmi), [bmi]);

  // FFMI calculation (requires body fat)
  const ffmiData = useMemo(
    () =>
      calculateFFMI(
        latestEntry?.weight ?? resolvedUserData.weight,
        resolvedUserData.height,
        latestBodyFatEntry?.bodyFat
      ),
    [
      latestEntry,
      latestBodyFatEntry,
      resolvedUserData.height,
      resolvedUserData.weight,
    ]
  );
  const ffmiCategory = useMemo(
    () => getFFMICategory(ffmiData?.normalized, resolvedUserData.gender),
    [ffmiData, resolvedUserData.gender]
  );

  const currentWeight = formatWeight(latestEntry?.weight);
  const weightOldDataWarning = useMemo(
    () => getOldDataWarningText(latestEntry?.date),
    [latestEntry?.date]
  );

  const currentBodyFat = formatBodyFat(latestBodyFatEntry?.bodyFat);
  const bodyFatOldDataWarning = useMemo(
    () => getOldDataWarningText(latestBodyFatEntry?.date),
    [latestBodyFatEntry?.date]
  );

  // A trend only exists once two entries sit close enough together to describe
  // one. Until then the cards must not print a rate (0.0 kg/wk) or a goal
  // verdict — see `hasTrendData`.
  const weightEntryCount = sortedEntries.length;
  const hasWeightTrend = hasTrendData(trend);
  const weightTrendHint = trend?.isStaleFallback
    ? 'Your last two weigh-ins are too far apart — log a new one to refresh your trend.'
    : 'Add one more weigh-in to see your 7-day trend.';

  const bodyFatEntryCount = sortedBodyFatEntries.length;
  const hasBodyFatTrend = hasTrendData(bodyFatTrend);
  const bodyFatTrendHint = bodyFatTrend?.isStaleFallback
    ? 'Your last two readings are too far apart — log a new one to refresh your trend.'
    : 'Add one more reading to see your 7-day trend.';

  // Calculate goal-aligned visual styles for sparklines
  const weightVisualStyle = useMemo(
    () => getGoalAlignedStyle(trend, selectedGoal, 'weight'),
    [trend, selectedGoal]
  );

  const bodyFatVisualStyle = useMemo(
    () => getGoalAlignedStyle(bodyFatTrend, selectedGoal, 'bodyFat'),
    [bodyFatTrend, selectedGoal]
  );

  // Adaptive Thermogenesis preview (matches what the store applies today).
  // Deps are narrowed to the fields this computation actually reads: the
  // whole `resolvedUserData` object is replaced on EVERY store write, so
  // keying on its identity re-ran this 28-snapshot scan (plus the smart-mode
  // weight filter/sort/regression) on unrelated changes like theme toggles.
  // The AT-mode resolver is fed a narrow object on purpose — it only reads
  // the enabled/smartMode fields — so the memo never needs the full
  // `resolvedUserData` identity.
  const {
    goalChangedAt,
    dailySnapshots,
    adaptiveThermogenesisEnabled,
    adaptiveThermogenesisSmartMode,
    adaptiveThermogenesisSmoothingEnabled: adaptiveSmoothingEnabled,
    adaptiveThermogenesisSmoothingMethod: adaptiveSmoothingMethod,
    adaptiveThermogenesisSmoothingWindowDays: adaptiveSmoothingWindowDays,
  } = resolvedUserData ?? {};
  const adaptiveThermogenesis = useMemo(() => {
    const today = getTodayDateKey();
    const goalDurationDays = store.goalDurationDays ?? 0;
    const props = {
      selectedGoal,
      goalDurationDays,
      goalChangedAt,
      dateKey: today,
      dailySnapshots,
      weightEntries: resolvedWeightEntries,
      adaptiveSmoothingEnabled,
      adaptiveSmoothingMethod,
      adaptiveSmoothingWindowDays,
    };
    const mode = resolveAdaptiveThermogenesisMode({
      userData: {
        adaptiveThermogenesisEnabled,
        adaptiveThermogenesisSmartMode,
      },
    });
    return {
      mode,
      result: computeAdaptiveThermogenesis({ ...props, mode }),
      goalDurationDays,
    };
  }, [
    selectedGoal,
    store.goalDurationDays,
    resolvedWeightEntries,
    goalChangedAt,
    dailySnapshots,
    adaptiveThermogenesisEnabled,
    adaptiveThermogenesisSmartMode,
    adaptiveSmoothingEnabled,
    adaptiveSmoothingMethod,
    adaptiveSmoothingWindowDays,
  ]);
  // Rolling Energy Balance preview (7-day primary view)
  const rollingBalanceSummary = useMemo(
    () =>
      calculateRollingEnergyBalance({
        snapshots: resolvedUserData.dailySnapshots,
        windowDays: 7,
        asOfDate: getTodayDateKey(),
        goalDailyBalanceTarget: store.goalDailyBalanceTarget,
      }),
    [resolvedUserData.dailySnapshots, store.goalDailyBalanceTarget]
  );

  return (
    <div className="space-y-6 pb-10">
      <div className="bg-surface rounded-2xl border border-border shadow-lg p-5 md:p-6">
        <div className="flex items-center mb-4 gap-2">
          <LineChart className="text-accent-blue" size={18} />
          <h2 className="text-xl font-bold text-foreground">
            Body Composition
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* ── Weight card ── */}
          <button
            type="button"
            onClick={onOpenWeightTracker}
            className="group relative w-full text-left bg-surface-highlight/50 rounded-xl p-4 transition-all border border-border/50 active:scale-[0.99] pressable-card focus-ring md:hover:bg-surface-highlight md:hover:border-border/80"
          >
            <div className="flex items-start justify-between mb-2">
              <p className="font-semibold text-foreground text-base">
                Weight Snapshot
              </p>
              {weightGoalAlignment && (
                <p
                  className={`${weightGoalAlignment.color} text-xs font-medium text-right`}
                >
                  {weightGoalAlignment.text}
                </p>
              )}
            </div>
            {hasWeightTrend ? (
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p
                    className={`text-lg font-semibold flex items-center gap-1.5 ${getTrendToneClass(trend, selectedGoal, 'weight')}`}
                  >
                    <TrendIcon direction={trend.direction} size={16} />
                    {trend.label}
                  </p>
                  <p className="text-muted text-sm mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <span className="font-bold text-foreground whitespace-nowrap">
                      {currentWeight ? `${currentWeight} kg` : '—'}
                    </span>
                    <span className="whitespace-nowrap">
                      • {formatSnapshotDate(latestEntry.date)}
                    </span>
                    {weightOldDataWarning && (
                      <span className="inline-flex items-center gap-1 text-accent-yellow whitespace-nowrap">
                        <AlertCircle size={10} className="shrink-0" />
                        {weightOldDataWarning}
                      </span>
                    )}
                  </p>
                  <p className="text-muted text-sm mt-2">
                    <span className="font-bold text-foreground">
                      {formatWeeklyRate(trend.weeklyRate, 'weight')}
                    </span>{' '}
                    over last 7 days
                  </p>
                </div>
                {sparkline.pathData && (
                  <div className="w-36 h-16 relative mask-[linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
                    <svg
                      width="100%"
                      height="100%"
                      viewBox="0 0 160 56"
                      preserveAspectRatio="none"
                      className="overflow-visible"
                    >
                      <defs>
                        <linearGradient
                          id="weightSparklineGradient"
                          x1="0"
                          x2="0"
                          y1="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor={weightVisualStyle.color}
                            stopOpacity={weightVisualStyle.topOpacity}
                          />
                          <stop
                            offset="100%"
                            stopColor={weightVisualStyle.color}
                            stopOpacity={weightVisualStyle.bottomOpacity}
                          />
                        </linearGradient>
                        <linearGradient
                          id="weightSparklineStroke"
                          gradientUnits="userSpaceOnUse"
                          x1="0"
                          x2="0"
                          y1="0"
                          y2="56"
                        >
                          <stop
                            offset="0%"
                            stopColor={weightVisualStyle.color}
                            stopOpacity="1"
                          />
                          <stop
                            offset="100%"
                            stopColor={weightVisualStyle.color}
                            stopOpacity="0.8"
                          />
                        </linearGradient>
                      </defs>
                      {sparkline.areaPath && (
                        <path
                          d={sparkline.areaPath}
                          fill="url(#weightSparklineGradient)"
                        />
                      )}
                      <path
                        d={sparkline.pathData}
                        fill="none"
                        stroke="url(#weightSparklineStroke)"
                        strokeWidth={2.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      {sparkline.coordinates?.map((coord, index) => (
                        <circle
                          key={index}
                          cx={coord.x}
                          cy={coord.y}
                          r="2.5"
                          fill={weightVisualStyle.color}
                          className="drop-shadow-xs"
                        />
                      ))}
                    </svg>
                  </div>
                )}
              </div>
            ) : weightEntryCount === 0 ? (
              <div>
                <p className="font-semibold text-foreground">
                  No weigh-ins yet
                </p>
                <p className="text-muted text-sm mt-1">
                  Log your weight to track a 7-day trend and see how it compares
                  with your goal.
                </p>
              </div>
            ) : (
              <div>
                <p className="text-muted text-sm flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <span className="font-bold text-foreground whitespace-nowrap">
                    {currentWeight} kg
                  </span>
                  <span className="whitespace-nowrap">
                    • {formatSnapshotDate(latestEntry.date)}
                  </span>
                  {weightOldDataWarning && (
                    <span className="inline-flex items-center gap-1 text-accent-yellow whitespace-nowrap">
                      <AlertCircle size={10} className="shrink-0" />
                      {weightOldDataWarning}
                    </span>
                  )}
                </p>
                <p className="text-muted text-sm mt-2">{weightTrendHint}</p>
              </div>
            )}
            <SnapshotCardFooter label="Tap to open weight tracker" />
          </button>

          {/* ── Body Fat card ── */}
          {resolvedBodyFatTrackingEnabled && (
            <button
              type="button"
              onClick={onOpenBodyFatTracker}
              className="group relative w-full text-left bg-surface-highlight/50 rounded-xl p-4 transition-all border border-border/50 active:scale-[0.99] pressable-card focus-ring md:hover:bg-surface-highlight md:hover:border-border/80"
            >
              <div className="flex items-start justify-between mb-2">
                <p className="font-semibold text-foreground text-base">
                  Body Fat % Snapshot
                </p>
                {bodyFatGoalAlignment && (
                  <p
                    className={`${bodyFatGoalAlignment.color} text-xs font-medium text-right`}
                  >
                    {bodyFatGoalAlignment.text}
                  </p>
                )}
              </div>
              {hasBodyFatTrend ? (
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p
                      className={`text-lg font-semibold flex items-center gap-1.5 ${getTrendToneClass(bodyFatTrend, selectedGoal, 'bodyFat')}`}
                    >
                      <TrendIcon direction={bodyFatTrend.direction} size={16} />
                      {bodyFatTrend.label}
                    </p>
                    <p className="text-muted text-sm mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                      <span className="font-bold text-foreground whitespace-nowrap">
                        {currentBodyFat ? `${currentBodyFat}%` : '—'}
                      </span>
                      <span className="whitespace-nowrap">
                        • {formatSnapshotDate(latestBodyFatEntry.date)}
                      </span>
                      {bodyFatOldDataWarning && (
                        <span className="inline-flex items-center gap-1 text-accent-yellow whitespace-nowrap">
                          <AlertCircle size={10} className="shrink-0" />
                          {bodyFatOldDataWarning}
                        </span>
                      )}
                    </p>
                    <p className="text-muted text-sm mt-2">
                      <span className="font-bold text-foreground">
                        {formatWeeklyRate(bodyFatTrend.weeklyRate, 'bodyFat')}
                      </span>{' '}
                      over last 7 days
                    </p>
                  </div>
                  {bodyFatSparkline.pathData && (
                    <div className="w-36 h-16 relative mask-[linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
                      <svg
                        width="100%"
                        height="100%"
                        viewBox="0 0 160 56"
                        preserveAspectRatio="none"
                        className="overflow-visible"
                      >
                        <defs>
                          <linearGradient
                            id="bodyFatSparklineGradient"
                            x1="0"
                            x2="0"
                            y1="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor={bodyFatVisualStyle.color}
                              stopOpacity={bodyFatVisualStyle.topOpacity}
                            />
                            <stop
                              offset="100%"
                              stopColor={bodyFatVisualStyle.color}
                              stopOpacity={bodyFatVisualStyle.bottomOpacity}
                            />
                          </linearGradient>
                          <linearGradient
                            id="bodyFatSparklineStroke"
                            gradientUnits="userSpaceOnUse"
                            x1="0"
                            x2="0"
                            y1="0"
                            y2="56"
                          >
                            <stop
                              offset="0%"
                              stopColor={bodyFatVisualStyle.color}
                              stopOpacity="1"
                            />
                            <stop
                              offset="100%"
                              stopColor={bodyFatVisualStyle.color}
                              stopOpacity="0.8"
                            />
                          </linearGradient>
                        </defs>
                        {bodyFatSparkline.areaPath && (
                          <path
                            d={bodyFatSparkline.areaPath}
                            fill="url(#bodyFatSparklineGradient)"
                          />
                        )}
                        <path
                          d={bodyFatSparkline.pathData}
                          fill="none"
                          stroke="url(#bodyFatSparklineStroke)"
                          strokeWidth={2.5}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        {bodyFatSparkline.coordinates?.map((coord, index) => (
                          <circle
                            key={index}
                            cx={coord.x}
                            cy={coord.y}
                            r="2.5"
                            fill={bodyFatVisualStyle.color}
                            className="drop-shadow-xs"
                          />
                        ))}
                      </svg>
                    </div>
                  )}
                </div>
              ) : bodyFatEntryCount === 0 ? (
                <div>
                  <p className="font-semibold text-foreground">
                    No body fat readings yet
                  </p>
                  <p className="text-muted text-sm mt-1">
                    Log your body fat percentage to track a 7-day trend and see
                    how it compares with your goal.
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-muted text-sm flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <span className="font-bold text-foreground whitespace-nowrap">
                      {currentBodyFat}%
                    </span>
                    <span className="whitespace-nowrap">
                      • {formatSnapshotDate(latestBodyFatEntry.date)}
                    </span>
                    {bodyFatOldDataWarning && (
                      <span className="inline-flex items-center gap-1 text-accent-yellow whitespace-nowrap">
                        <AlertCircle size={10} className="shrink-0" />
                        {bodyFatOldDataWarning}
                      </span>
                    )}
                  </p>
                  <p className="text-muted text-sm mt-2">{bodyFatTrendHint}</p>
                </div>
              )}
              <SnapshotCardFooter label="Tap to open body fat tracker" />
            </button>
          )}

          {!resolvedBodyFatTrackingEnabled ? (
            <button
              type="button"
              onClick={onOpenBmiInfo}
              className="group relative w-full text-left bg-surface-highlight/50 rounded-xl p-4 transition-all border border-border/50 active:scale-[0.99] pressable-card focus-ring md:hover:bg-surface-highlight md:hover:border-border/80"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-foreground text-sm mb-1">
                    BMI
                  </p>
                  <p
                    className={`text-xl font-bold ${BMI_COLOR_MAP[bmiCategory.color]?.text || 'text-accent-slate'}`}
                  >
                    {bmi ? bmi.toFixed(1) : '—'}
                  </p>
                  <p
                    className={`text-xs mt-1 ${BMI_COLOR_MAP[bmiCategory.color]?.text || 'text-accent-slate'}`}
                  >
                    {bmiCategory.label}
                  </p>
                </div>
              </div>
              <div className="absolute top-2 right-2 p-1">
                <Info size={18} className="text-muted" />
              </div>
              <p className="text-accent-blue/80 text-[10px] tracking-wide mt-2">
                Tap for more info
              </p>
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:col-span-2">
              <button
                type="button"
                onClick={onOpenBmiInfo}
                className="group relative w-full text-left bg-surface-highlight/50 rounded-xl p-4 transition-all border border-border/50 active:scale-[0.99] pressable-card focus-ring md:hover:bg-surface-highlight md:hover:border-border/80"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground text-sm mb-1">
                    BMI
                  </p>
                  <p
                    className={`text-2xl font-bold ${BMI_COLOR_MAP[bmiCategory.color]?.text || 'text-accent-slate'}`}
                  >
                    {bmi ? bmi.toFixed(1) : '—'}
                  </p>
                  <p
                    className={`text-xs mt-1 leading-tight ${BMI_COLOR_MAP[bmiCategory.color]?.text || 'text-accent-slate'}`}
                  >
                    {bmiCategory.label}
                  </p>
                </div>
                <div className="absolute top-2 right-2 p-1">
                  <Info size={18} className="text-muted/80" />
                </div>
              </button>
              <button
                type="button"
                onClick={onOpenFfmiInfo}
                className="group relative w-full text-left bg-surface-highlight/50 rounded-xl p-4 transition-all border border-border/50 active:scale-[0.99] pressable-card focus-ring md:hover:bg-surface-highlight md:hover:border-border/80"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground text-sm mb-1">
                    FFMI
                  </p>
                  <p
                    className={`text-2xl font-bold ${ffmiData ? FFMI_COLOR_MAP[ffmiCategory.color]?.text || 'text-accent-slate' : 'text-muted'}`}
                  >
                    {ffmiData ? ffmiData.normalized.toFixed(1) : '—'}
                  </p>
                  <p
                    className={`text-xs mt-1 leading-tight ${ffmiData ? FFMI_COLOR_MAP[ffmiCategory.color]?.text || 'text-accent-slate' : 'text-muted'}`}
                  >
                    {ffmiData ? ffmiCategory.label : 'Requires body fat data'}
                  </p>
                </div>
                <div className="absolute top-2 right-2 p-1">
                  <Info size={18} className="text-muted/80" />
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      <RestingHeartRateCard onOpen={onOpenHeartRateTracker} />
      <AdaptiveCorrectionCard
        result={adaptiveThermogenesis.result}
        mode={adaptiveThermogenesis.mode}
        goalDurationDays={adaptiveThermogenesis.goalDurationDays}
        onOpen={onOpenAdaptiveThermogenesis}
      />
      <RollingBalancePreviewCard
        summary={rollingBalanceSummary}
        onOpen={onOpenRollingEnergyBalance}
      />
    </div>
  );
});
