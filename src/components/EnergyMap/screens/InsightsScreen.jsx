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
    return 'text-white';
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
    return { icon: 'help', text: 'Insufficient data', color: 'text-slate-400' };
  }

  const rate = trend.weeklyRate;

  if (selectedGoal === 'maintenance') {
    const absRate = Math.abs(rate);
    if (absRate <= 0.1) {
      return { icon: 'check', text: 'On target', color: 'text-green-400' };
    }
    if (absRate <= 0.25) {
      return { icon: 'warning', text: 'Near target', color: 'text-yellow-400' };
    }
    return { icon: 'error', text: 'Off target', color: 'text-orange-400' };
  }

  const isBulk = selectedGoal.includes('bulk');
  const isCut = selectedGoal.includes('cut');
  const movingRight = (isBulk && rate > 0.1) || (isCut && rate < -0.1) || false;

  if (!movingRight) {
    return { icon: 'error', text: 'Opposite trend', color: 'text-red-400' };
  }

  const absRate = Math.abs(rate);

  if (selectedGoal === 'aggressive_bulk') {
    if (absRate >= 0.5 && absRate <= 1.0) {
      return { icon: 'check', text: 'On target', color: 'text-green-400' };
    }
    if (absRate < 0.5) {
      return {
        icon: 'warning',
        text: 'Below target rate',
        color: 'text-yellow-400',
      };
    }
    return {
      icon: 'warning',
      text: 'Above target rate',
      color: 'text-yellow-400',
    };
  }

  if (selectedGoal === 'bulking') {
    if (absRate >= 0.25 && absRate <= 0.5) {
      return { icon: 'check', text: 'On target', color: 'text-green-400' };
    }
    if (absRate < 0.25) {
      return {
        icon: 'warning',
        text: 'Below target rate',
        color: 'text-yellow-400',
      };
    }
    return {
      icon: 'warning',
      text: 'Above target rate',
      color: 'text-yellow-400',
    };
  }

  if (selectedGoal === 'cutting') {
    if (absRate >= 0.25 && absRate <= 0.5) {
      return { icon: 'check', text: 'On target', color: 'text-green-400' };
    }
    if (absRate < 0.25) {
      return {
        icon: 'warning',
        text: 'Below target rate',
        color: 'text-yellow-400',
      };
    }
    return {
      icon: 'warning',
      text: 'Above target rate',
      color: 'text-orange-400',
    };
  }

  if (selectedGoal === 'aggressive_cut') {
    if (absRate >= 0.5 && absRate <= 1.0) {
      return { icon: 'check', text: 'On target', color: 'text-green-400' };
    }
    if (absRate < 0.5) {
      return {
        icon: 'warning',
        text: 'Below target rate',
        color: 'text-yellow-400',
      };
    }
    return {
      icon: 'warning',
      text: 'Above target rate',
      color: 'text-orange-400',
    };
  }

  return {
    icon: 'help',
    text: 'Track to assess',
    color: 'text-slate-400',
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

  const currentBodyFat = formatBodyFat(latestBodyFatEntry?.bodyFat);
  const bodyFatLoggedLabel = latestBodyFatEntry?.date
    ? formatDateLabel(latestBodyFatEntry.date, {
        month: 'short',
        day: 'numeric',
      })
    : 'No entries yet';

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
      text: 'text-blue-400',
      border: 'border-blue-500/50',
      bg: 'bg-blue-500/20',
    },
    green: {
      text: 'text-green-400',
      border: 'border-green-500/50',
      bg: 'bg-green-500/20',
    },
    yellow: {
      text: 'text-yellow-400',
      border: 'border-yellow-500/50',
      bg: 'bg-yellow-500/20',
    },
    red: {
      text: 'text-red-400',
      border: 'border-red-500/50',
      bg: 'bg-red-500/20',
    },
    slate: {
      text: 'text-slate-400',
      border: 'border-slate-500/50',
      bg: 'bg-slate-500/20',
    },
  };

  const ffmiColorMap = {
    blue: {
      text: 'text-blue-400',
      border: 'border-blue-500/50',
      bg: 'bg-blue-500/20',
    },
    green: {
      text: 'text-green-400',
      border: 'border-green-500/50',
      bg: 'bg-green-500/20',
    },
    emerald: {
      text: 'text-emerald-400',
      border: 'border-emerald-500/50',
      bg: 'bg-emerald-500/20',
    },
    purple: {
      text: 'text-purple-400',
      border: 'border-purple-500/50',
      bg: 'bg-purple-500/20',
    },
    amber: {
      text: 'text-amber-400',
      border: 'border-amber-500/50',
      bg: 'bg-amber-500/20',
    },
    red: {
      text: 'text-red-400',
      border: 'border-red-500/50',
      bg: 'bg-red-500/20',
    },
    slate: {
      text: 'text-slate-400',
      border: 'border-slate-500/50',
      bg: 'bg-slate-500/20',
    },
  };

  return (
    <div className="space-y-6 pb-10">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl p-5 md:p-6">
        <div className="flex items-center mb-4 gap-2">
          <LineChart className="text-blue-400" size={18} />
          <h2 className="text-xl font-bold text-white">Body Composition</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onOpenWeightTracker}
            className="group relative w-full text-left bg-slate-700/50 rounded-xl p-4 transition-all border border-slate-600/50 active:scale-[0.99] pressable-card focus-ring md:hover:bg-slate-600 md:hover:border-slate-500/80"
          >
            <div className="flex items-start justify-between mb-2">
              <p className="font-semibold text-white text-base">
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
                <p className="text-slate-300 text-sm mt-1">
                  <span className="font-bold text-white">
                    {currentWeight ? `${currentWeight} kg` : '—'}
                  </span>{' '}
                  • {lastLoggedLabel}
                </p>
                <p className="text-slate-300 text-sm mt-2">
                  <span className="font-bold text-white">
                    {formatWeeklyRate(trend.weeklyRate)}
                  </span>{' '}
                  over last 7 entries
                </p>
              </div>
              {sparkline.points && sortedEntries.length > 1 && (
                <div className="w-36 h-16 relative">
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
                  <div className="absolute left-0 top-0 bottom-0 w-3 bg-gradient-to-r from-slate-800/80 to-transparent pointer-events-none" />
                  <div className="absolute right-0 top-0 bottom-0 w-3 bg-gradient-to-l from-slate-800/80 to-transparent pointer-events-none" />
                </div>
              )}
            </div>
            <p className="text-blue-300 text-xs tracking-wide mt-3">
              Tap to open weight tracker
            </p>
          </button>

          {resolvedBodyFatTrackingEnabled && (
            <button
              type="button"
              onClick={onOpenBodyFatTracker}
              className="group relative w-full text-left bg-slate-700/50 rounded-xl p-4 transition-all border border-slate-600/50 active:scale-[0.99] pressable-card focus-ring md:hover:bg-slate-600 md:hover:border-slate-500/80"
            >
              <div className="flex items-start justify-between mb-2">
                <p className="font-semibold text-white text-base">
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
                  <p className="text-slate-300 text-sm mt-1">
                    <span className="font-bold text-white">
                      {currentBodyFat ? `${currentBodyFat}%` : '—'}
                    </span>{' '}
                    • {bodyFatLoggedLabel}
                  </p>
                  <p className="text-slate-300 text-sm mt-2">
                    <span className="font-bold text-white">
                      {formatBodyFatWeeklyRate(bodyFatTrend.weeklyRate)}
                    </span>{' '}
                    over last 7 entries
                  </p>
                </div>
                {bodyFatSparkline.points && sortedBodyFatEntries.length > 1 && (
                  <div className="w-36 h-16 relative">
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
                    <div className="absolute left-0 top-0 bottom-0 w-3 bg-gradient-to-r from-slate-800/80 to-transparent pointer-events-none" />
                    <div className="absolute right-0 top-0 bottom-0 w-3 bg-gradient-to-l from-slate-800/80 to-transparent pointer-events-none" />
                  </div>
                )}
              </div>
              <p className="text-blue-300 text-xs tracking-wide mt-3">
                Tap to open body fat tracker
              </p>
            </button>
          )}

          {!resolvedBodyFatTrackingEnabled ? (
            <button
              type="button"
              onClick={onOpenBmiInfo}
              className="group relative w-full text-left bg-slate-700/50 rounded-xl p-4 transition-all border border-slate-600/50 active:scale-[0.99] pressable-card focus-ring md:hover:bg-slate-600 md:hover:border-slate-500/80"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-white text-sm mb-1">BMI</p>
                  <p
                    className={`text-xl font-bold ${bmiColorMap[bmiCategory.color]?.text || 'text-slate-400'}`}
                  >
                    {bmi ? bmi.toFixed(1) : '—'}
                  </p>
                  <p
                    className={`text-xs mt-1 ${bmiColorMap[bmiCategory.color]?.text || 'text-slate-400'}`}
                  >
                    {bmiCategory.label}
                  </p>
                </div>
                <div
                  className={`p-2 rounded-lg ${bmiColorMap[bmiCategory.color]?.bg || 'bg-slate-500/20'}`}
                >
                  <Info
                    size={18}
                    className={
                      bmiColorMap[bmiCategory.color]?.text || 'text-slate-400'
                    }
                  />
                </div>
              </div>
              <p className="text-blue-300 text-[11px] tracking-wide mt-2">
                Tap for more info
              </p>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenFfmiInfo}
              className="group relative w-full text-left bg-slate-700/50 rounded-xl p-4 transition-all border border-slate-600/50 active:scale-[0.99] pressable-card focus-ring md:hover:bg-slate-600 md:hover:border-slate-500/80"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-white text-sm mb-1">FFMI</p>
                  <p
                    className={`text-xl font-bold ${ffmiData ? ffmiColorMap[ffmiCategory.color]?.text || 'text-slate-400' : 'text-slate-500'}`}
                  >
                    {ffmiData ? ffmiData.normalized.toFixed(1) : '—'}
                  </p>
                  <p
                    className={`text-xs mt-1 ${ffmiData ? ffmiColorMap[ffmiCategory.color]?.text || 'text-slate-400' : 'text-slate-500'}`}
                  >
                    {ffmiData ? ffmiCategory.label : 'Requires body fat data'}
                  </p>
                </div>
                <div
                  className={`p-2 rounded-lg ${ffmiData ? ffmiColorMap[ffmiCategory.color]?.bg || 'bg-slate-500/20' : 'bg-slate-500/20'}`}
                >
                  <Info
                    size={18}
                    className={
                      ffmiData
                        ? ffmiColorMap[ffmiCategory.color]?.text ||
                          'text-slate-400'
                        : 'text-slate-500'
                    }
                  />
                </div>
              </div>
              <p className="text-blue-300 text-[11px] tracking-wide mt-2">
                Tap for more info
              </p>
            </button>
          )}
        </div>
      </div>

      <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-2xl">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <PieChart className="text-blue-400" size={18} />
          Macro Recommendations
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-red-900/30 border border-red-700 rounded-xl p-4">
            <p className="text-red-400 font-bold mb-2">Protein</p>
            <p className="text-white text-2xl font-bold">
              {Math.round(resolvedUserData.weight * 2.0)}-
              {Math.round(resolvedUserData.weight * 2.4)}g
            </p>
            <p className="text-slate-400 text-sm">2.0-2.4g per kg bodyweight</p>
          </div>
          <div className="bg-yellow-900/30 border border-yellow-700 rounded-xl p-4">
            <p className="text-yellow-400 font-bold mb-2">Fats</p>
            <p className="text-white text-2xl font-bold">
              {Math.round(resolvedUserData.weight * 0.8)}-
              {Math.round(resolvedUserData.weight * 1.0)}g
            </p>
            <p className="text-slate-400 text-sm">0.8-1.0g per kg bodyweight</p>
          </div>
          <div className="bg-amber-900/30 border border-amber-700 rounded-xl p-4">
            <p className="text-amber-400 font-bold mb-2">Carbs</p>
            <p className="text-white text-lg font-bold">Remaining calories</p>
            <p className="text-slate-400 text-sm">
              Adjust based on energy needs
            </p>
          </div>
        </div>
        {selectedGoal === 'aggressive_cut' && (
          <div className="mt-4 bg-red-900/40 border border-red-600/80 rounded-xl p-4 flex items-start gap-3">
            <Info size={20} className="text-red-300 flex-shrink-0 mt-0.5" />
            <p className="text-red-100 text-sm">
              During an aggressive cut, push protein to the upper end of the{' '}
              {Math.round(resolvedUserData.weight * 2.4)}g+ range to help
              preserve lean mass. Consider exceeding this slightly if recovery
              or satiety suffer.
            </p>
          </div>
        )}
      </div>
      <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-2xl">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Lightbulb className="text-blue-400" size={18} />
          Tips
        </h2>
        <ul className="space-y-2 text-slate-300">
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-1">•</span>
            <span>
              Track your steps daily to use the accurate calorie target
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-1">•</span>
            <span>
              On training days, fuel your sessions properly with higher carbs
              pre-workout
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-1">•</span>
            <span>
              Cardio burns are calculated using MET values based on your weight
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-1">•</span>
            <span>
              Different training types burn calories at different rates - adjust
              accordingly
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-1">•</span>
            <span>
              Weigh yourself weekly and adjust if progress stalls for 2+ weeks
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-1">•</span>
            <span>
              For lean bulk: aim for 0.25-0.5kg gain per week. For aggressive
              bulk: 0.5-1kg per week
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-1">•</span>
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
