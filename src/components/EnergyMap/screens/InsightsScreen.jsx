import React, { useMemo } from 'react';
import {
  Info,
  PieChart,
  Lightbulb,
  LineChart,
  CheckCircle2,
  AlertCircle,
  XCircle,
  HelpCircle,
} from 'lucide-react';
import {
  calculateWeightTrend,
  createSparklinePoints,
  formatDateLabel,
  formatWeight,
} from '../../../utils/weight';
import {
  calculateBodyFatTrend,
  createBodyFatSparklinePoints,
  formatBodyFat,
} from '../../../utils/bodyFat';
import {
  calculateBMI,
  getBMICategory,
  calculateFFMI,
  getFFMICategory,
} from '../../../utils/calculations';
import {
  getGoalAlignedStyle,
  getGoalAlignedTextClass,
} from '../../../utils/goalAlignment';
import { shallow } from 'zustand/shallow';
import { useEnergyMapStore } from '../../../store/useEnergyMapStore';

const getTrendToneClass = (trend, selectedGoal, metricType) => {
  if (
    !trend ||
    trend.label === 'Need more data' ||
    trend.label === 'No data yet'
  ) {
    return 'text-foreground';
  }
  return getGoalAlignedTextClass(trend, selectedGoal, metricType);
};

const IconComponent = ({ icon }) => {
  if (icon === 'check') return <CheckCircle2 size={14} className="inline" />;
  if (icon === 'warning') return <AlertCircle size={14} className="inline" />;
  if (icon === 'error') return <XCircle size={14} className="inline" />;
  return <HelpCircle size={14} className="inline" />;
};

const getOnTrackStatus = (trend, selectedGoal) => {
  if (
    !trend ||
    trend.label === 'Need more data' ||
    trend.label === 'No data yet' ||
    !Number.isFinite(trend.weeklyRate)
  ) {
    return { icon: 'help', text: 'Insufficient data', color: 'text-muted' };
  }

  const rate = trend.weeklyRate;

  if (selectedGoal === 'maintenance') {
    const absRate = Math.abs(rate);
    if (absRate <= 0.1) {
      return { icon: 'check', text: 'On target', color: 'text-accent-green' };
    }
    if (absRate <= 0.25) {
      return {
        icon: 'warning',
        text: 'Near target',
        color: 'text-accent-yellow',
      };
    }
    return { icon: 'error', text: 'Off target', color: 'text-accent-orange' };
  }

  const isBulk = selectedGoal.includes('bulk');
  const isCut = selectedGoal.includes('cut');
  const movingRight = (isBulk && rate > 0.1) || (isCut && rate < -0.1) || false;

  if (!movingRight) {
    return { icon: 'error', text: 'Opposite trend', color: 'text-accent-red' };
  }

  const absRate = Math.abs(rate);

  if (selectedGoal === 'aggressive_bulk') {
    if (absRate >= 0.5 && absRate <= 1.0) {
      return { icon: 'check', text: 'On target', color: 'text-accent-green' };
    }
    if (absRate < 0.5) {
      return {
        icon: 'warning',
        text: 'Below target rate',
        color: 'text-accent-yellow',
      };
    }
    return {
      icon: 'warning',
      text: 'Above target rate',
      color: 'text-accent-yellow',
    };
  }

  if (selectedGoal === 'bulking') {
    if (absRate >= 0.25 && absRate <= 0.5) {
      return { icon: 'check', text: 'On target', color: 'text-accent-green' };
    }
    if (absRate < 0.25) {
      return {
        icon: 'warning',
        text: 'Below target rate',
        color: 'text-accent-yellow',
      };
    }
    return {
      icon: 'warning',
      text: 'Above target rate',
      color: 'text-accent-yellow',
    };
  }

  if (selectedGoal === 'cutting') {
    if (absRate >= 0.25 && absRate <= 0.5) {
      return { icon: 'check', text: 'On target', color: 'text-accent-green' };
    }
    if (absRate < 0.25) {
      return {
        icon: 'warning',
        text: 'Below target rate',
        color: 'text-accent-yellow',
      };
    }
    return {
      icon: 'warning',
      text: 'Above target rate',
      color: 'text-accent-orange',
    };
  }

  if (selectedGoal === 'aggressive_cut') {
    if (absRate >= 0.5 && absRate <= 1.0) {
      return { icon: 'check', text: 'On target', color: 'text-accent-green' };
    }
    if (absRate < 0.5) {
      return {
        icon: 'warning',
        text: 'Below target rate',
        color: 'text-accent-yellow',
      };
    }
    return {
      icon: 'warning',
      text: 'Above target rate',
      color: 'text-accent-orange',
    };
  }

  return {
    icon: 'help',
    text: 'Track to assess',
    color: 'text-muted',
  };
};

const formatWeeklyRate = (value) => {
  if (!Number.isFinite(value) || value === 0) {
    return '0.0 kg/wk';
  }
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)} kg/wk`;
};

const formatBodyFatWeeklyRate = (value) => {
  if (!Number.isFinite(value) || value === 0) {
    return '0.0 %/wk';
  }
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)} %/wk`;
};

const DATA_OLD_WARNING_DAYS = 1;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

const getDataAgeInDays = (dateKey) => {
  if (!dateKey) return null;

  const entryDate = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(entryDate.getTime())) {
    return null;
  }

  const now = new Date();
  const utcToday = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  const utcEntry = Date.UTC(
    entryDate.getUTCFullYear(),
    entryDate.getUTCMonth(),
    entryDate.getUTCDate()
  );

  return Math.max(0, Math.floor((utcToday - utcEntry) / MS_PER_DAY));
};

const getOldDataWarningText = (dateKey) => {
  const ageDays = getDataAgeInDays(dateKey);
  if (!Number.isFinite(ageDays) || ageDays < DATA_OLD_WARNING_DAYS) {
    return null;
  }

  const dayLabel = ageDays === 1 ? 'day' : 'days';
  return `${ageDays} ${dayLabel} old`;
};

export const InsightsScreen = ({
  userData,
  selectedGoal,
  weightEntries,
  onOpenWeightTracker,
  bodyFatEntries,
  bodyFatTrackingEnabled,
  onOpenBodyFatTracker,
  onOpenBmiInfo,
  onOpenFfmiInfo,
}) => {
  const store = useEnergyMapStore(
    (state) => ({
      userData: state.userData,
      weightEntries: state.weightEntries ?? [],
      bodyFatEntries: state.bodyFatEntries ?? [],
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

  // Only keep the last 7 entries
  const sortedEntries = useMemo(() => {
    if (!resolvedWeightEntries.length) return [];

    // Sort entries first
    const sorted = [...resolvedWeightEntries].sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    return sorted.slice(-7);
  }, [resolvedWeightEntries]);
  const trend = useMemo(
    () => calculateWeightTrend(sortedEntries),
    [sortedEntries]
  );
  const weightStatus = getOnTrackStatus(trend, selectedGoal, 'weight');
  const sparkline = useMemo(
    () =>
      createSparklinePoints(sortedEntries, {
        width: 160,
        height: 56,
        padding: 6,
        limit: 7, // Only show up to 7 entries
      }),
    [sortedEntries]
  );

  const latestEntry = useMemo(
    () =>
      sortedEntries.length ? sortedEntries[sortedEntries.length - 1] : null,
    [sortedEntries]
  );

  const sortedBodyFatEntries = useMemo(() => {
    if (!resolvedBodyFatEntries.length) return [];

    const sorted = [...resolvedBodyFatEntries].sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    return sorted.slice(-7);
  }, [resolvedBodyFatEntries]);

  const bodyFatTrend = useMemo(
    () => calculateBodyFatTrend(sortedBodyFatEntries),
    [sortedBodyFatEntries]
  );
  const bodyFatStatus = getOnTrackStatus(bodyFatTrend, selectedGoal, 'bodyFat');

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

  const currentWeight = formatWeight(
    latestEntry?.weight ?? resolvedUserData.weight
  );
  const lastLoggedLabel = latestEntry?.date
    ? formatDateLabel(latestEntry.date, { month: 'short', day: 'numeric' })
    : 'No entries yet';
  const weightOldDataWarning = useMemo(
    () => getOldDataWarningText(latestEntry?.date),
    [latestEntry?.date]
  );

  const currentBodyFat = formatBodyFat(latestBodyFatEntry?.bodyFat);
  const bodyFatLoggedLabel = latestBodyFatEntry?.date
    ? formatDateLabel(latestBodyFatEntry.date, {
        month: 'short',
        day: 'numeric',
      })
    : 'No entries yet';
  const bodyFatOldDataWarning = useMemo(
    () => getOldDataWarningText(latestBodyFatEntry?.date),
    [latestBodyFatEntry?.date]
  );

  // Calculate goal-aligned visual styles for sparklines
  const weightVisualStyle = useMemo(
    () => getGoalAlignedStyle(trend, selectedGoal, 'weight'),
    [trend, selectedGoal]
  );

  const bodyFatVisualStyle = useMemo(
    () => getGoalAlignedStyle(bodyFatTrend, selectedGoal, 'bodyFat'),
    [bodyFatTrend, selectedGoal]
  );

  const bmiColorMap = {
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

  const ffmiColorMap = {
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
          <button
            type="button"
            onClick={onOpenWeightTracker}
            className="group relative w-full text-left bg-surface-highlight/50 rounded-xl p-4 transition-all border border-border/50 active:scale-[0.99] pressable-card focus-ring md:hover:bg-surface-highlight md:hover:border-border/80"
          >
            <div className="flex items-start justify-between mb-2">
              <p className="font-semibold text-foreground text-base">
                Weight Snapshot
              </p>
              <span
                className={`text-xs font-semibold ${weightStatus.color} flex items-center gap-1.5`}
              >
                <IconComponent icon={weightStatus.icon} />
                {weightStatus.text}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p
                  className={`text-lg font-semibold ${getTrendToneClass(trend, selectedGoal, 'weight')}`}
                >
                  {trend.label}
                </p>
                <p className="text-muted text-sm mt-1">
                  <span className="font-bold text-foreground">
                    {currentWeight ? `${currentWeight} kg` : '—'}
                  </span>{' '}
                  <span className="inline-flex items-center gap-2">
                    <span>• {lastLoggedLabel}</span>
                    {weightOldDataWarning && (
                      <span className="inline-flex items-center gap-1 text-accent-yellow">
                        <AlertCircle size={10} className="shrink-0" />
                        {weightOldDataWarning}
                      </span>
                    )}
                  </span>
                </p>
                <p className="text-muted text-sm mt-2">
                  <span className="font-bold text-foreground">
                    {formatWeeklyRate(trend.weeklyRate)}
                  </span>{' '}
                  over last 7 entries
                </p>
              </div>
              {sparkline.points && sortedEntries.length > 1 && (
                <div className="w-36 h-16 relative [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
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
                        x1="0"
                        x2="0"
                        y1="0"
                        y2="1"
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
                    <polyline
                      points={sparkline.points}
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
                        className="drop-shadow-sm"
                      />
                    ))}
                  </svg>
                </div>
              )}
            </div>
            <p className="text-accent-blue/80 text-xs tracking-wide mt-3">
              Tap to open weight tracker
            </p>
          </button>

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
                <span
                  className={`text-xs font-semibold ${bodyFatStatus.color} flex items-center gap-1.5`}
                >
                  <IconComponent icon={bodyFatStatus.icon} />
                  {bodyFatStatus.text}
                </span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p
                    className={`text-lg font-semibold ${getTrendToneClass(bodyFatTrend, selectedGoal, 'bodyFat')}`}
                  >
                    {bodyFatTrend.label}
                  </p>
                  <p className="text-muted text-sm mt-1">
                    <span className="font-bold text-foreground">
                      {currentBodyFat ? `${currentBodyFat}%` : '—'}
                    </span>{' '}
                    <span className="inline-flex items-center gap-2">
                      <span>• {bodyFatLoggedLabel}</span>
                      {bodyFatOldDataWarning && (
                        <span className="inline-flex items-center gap-1 text-accent-yellow">
                          <AlertCircle size={10} className="shrink-0" />
                          {bodyFatOldDataWarning}
                        </span>
                      )}
                    </span>
                  </p>
                  <p className="text-muted text-sm mt-2">
                    <span className="font-bold text-foreground">
                      {formatBodyFatWeeklyRate(bodyFatTrend.weeklyRate)}
                    </span>{' '}
                    over last 7 entries
                  </p>
                </div>
                {bodyFatSparkline.points && sortedBodyFatEntries.length > 1 && (
                  <div className="w-36 h-16 relative [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
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
                          x1="0"
                          x2="0"
                          y1="0"
                          y2="1"
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
                      <polyline
                        points={bodyFatSparkline.points}
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
                          className="drop-shadow-sm"
                        />
                      ))}
                    </svg>
                  </div>
                )}
              </div>
              <p className="text-accent-blue/80 text-xs tracking-wide mt-3">
                Tap to open body fat tracker
              </p>
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
                    className={`text-xl font-bold ${bmiColorMap[bmiCategory.color]?.text || 'text-accent-slate'}`}
                  >
                    {bmi ? bmi.toFixed(1) : '—'}
                  </p>
                  <p
                    className={`text-xs mt-1 ${bmiColorMap[bmiCategory.color]?.text || 'text-accent-slate'}`}
                  >
                    {bmiCategory.label}
                  </p>
                </div>
                <div className="p-2 shrink-0">
                  <Info size={18} className="text-muted" />
                </div>
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
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground text-sm mb-1">
                      BMI
                    </p>
                    <p
                      className={`text-xl font-bold ${bmiColorMap[bmiCategory.color]?.text || 'text-accent-slate'}`}
                    >
                      {bmi ? bmi.toFixed(1) : '—'}
                    </p>
                    <p
                      className={`text-xs mt-1 leading-tight ${bmiColorMap[bmiCategory.color]?.text || 'text-accent-slate'}`}
                    >
                      {bmiCategory.label}
                    </p>
                  </div>
                  <div className="p-2 shrink-0">
                    <Info size={18} className="text-muted/80" />
                  </div>
                </div>
                <p className="text-accent-blue/80 text-[10px] tracking-wide mt-2">
                  Tap for more info
                </p>
              </button>
              <button
                type="button"
                onClick={onOpenFfmiInfo}
                className="group relative w-full text-left bg-surface-highlight/50 rounded-xl p-4 transition-all border border-border/50 active:scale-[0.99] pressable-card focus-ring md:hover:bg-surface-highlight md:hover:border-border/80"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground text-sm mb-1">
                      FFMI
                    </p>
                    <p
                      className={`text-xl font-bold ${ffmiData ? ffmiColorMap[ffmiCategory.color]?.text || 'text-accent-slate' : 'text-muted'}`}
                    >
                      {ffmiData ? ffmiData.normalized.toFixed(1) : '—'}
                    </p>
                    <p
                      className={`text-xs mt-1 leading-tight ${ffmiData ? ffmiColorMap[ffmiCategory.color]?.text || 'text-accent-slate' : 'text-muted'}`}
                    >
                      {ffmiData ? ffmiCategory.label : 'Requires body fat data'}
                    </p>
                  </div>
                  <div className="p-2 shrink-0">
                    <Info size={18} className="text-muted/80" />
                  </div>
                </div>
                <p className="text-accent-blue/80 text-[10px] tracking-wide mt-2">
                  Tap for more info
                </p>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="bg-surface rounded-2xl p-6 border border-border shadow-lg">
        <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
          <PieChart className="text-accent-blue" size={18} />
          Macro Recommendations
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-accent-red/15 border border-accent-red/50 rounded-xl p-4">
            <p className="text-accent-red font-bold mb-2">Protein</p>
            <p className="text-foreground text-2xl font-bold">
              {Math.round(resolvedUserData.weight * 2.0)}-
              {Math.round(resolvedUserData.weight * 2.4)}g
            </p>
            <p className="text-muted text-sm">2.0-2.4g per kg bodyweight</p>
          </div>
          <div className="bg-accent-yellow/15 border border-accent-yellow/50 rounded-xl p-4">
            <p className="text-accent-yellow font-bold mb-2">Fats</p>
            <p className="text-foreground text-2xl font-bold">
              {Math.round(resolvedUserData.weight * 0.8)}-
              {Math.round(resolvedUserData.weight * 1.0)}g
            </p>
            <p className="text-muted text-sm">0.8-1.0g per kg bodyweight</p>
          </div>
          <div className="bg-accent-amber/15 border border-accent-amber/50 rounded-xl p-4">
            <p className="text-accent-amber font-bold mb-2">Carbs</p>
            <p className="text-foreground text-lg font-bold">
              Remaining calories
            </p>
            <p className="text-muted text-sm">Adjust based on energy needs</p>
          </div>
        </div>
        {selectedGoal === 'aggressive_cut' && (
          <div className="mt-4 bg-accent-red/15 border border-accent-red/60 rounded-xl p-4 flex items-start gap-3">
            <Info size={20} className="text-accent-red flex-shrink-0 mt-0.5" />
            <p className="text-foreground text-sm">
              During an aggressive cut, push protein to the upper end of the{' '}
              {Math.round(resolvedUserData.weight * 2.4)}g+ range to help
              preserve lean mass. Consider exceeding this slightly if recovery
              or satiety suffer.
            </p>
          </div>
        )}
      </div>
      <div className="bg-surface rounded-2xl p-6 border border-border shadow-lg">
        <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
          <Lightbulb className="text-accent-blue" size={18} />
          Tips
        </h2>
        <ul className="space-y-2 text-muted">
          <li className="flex items-start gap-2">
            <span className="text-accent-blue mt-1">•</span>
            <span>
              Track your steps daily to use the accurate calorie target
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-accent-blue mt-1">•</span>
            <span>
              On training days, fuel your sessions properly with higher carbs
              pre-workout
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-accent-blue mt-1">•</span>
            <span>
              Cardio burns are calculated using MET values based on your weight
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-accent-blue mt-1">•</span>
            <span>
              Different training types burn calories at different rates - adjust
              accordingly
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-accent-blue mt-1">•</span>
            <span>
              Weigh yourself weekly and adjust if progress stalls for 2+ weeks
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-accent-blue mt-1">•</span>
            <span>
              For lean bulk: aim for 0.25-0.5kg gain per week. For aggressive
              bulk: 0.5-1kg per week
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-accent-blue mt-1">•</span>
            <span>
              For moderate cut: aim for 0.5kg loss per week. For aggressive cut:
              0.75-1kg per week
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
};
