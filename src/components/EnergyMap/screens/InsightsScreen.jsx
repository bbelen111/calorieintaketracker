import React, { useMemo } from 'react';
import {
  Info,
  PieChart,
  Lightbulb,
  LineChart,
  AlertCircle,
  SlidersHorizontal,
} from 'lucide-react';
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
import { getGoalAlignedStyle } from '../../../utils/calculations/goalAlignment';
import {
  TrendIcon,
  getTrendToneClass,
  getGoalAlignmentText,
  formatWeeklyRate,
  formatTooltipDate,
  getOldDataWarningText,
} from '../../../utils/visuals/trackerHelpers';
import {
  calculateMacroRecommendations,
  normalizeMacroRecommendationSplit,
} from '../../../utils/calculations/macroRecommendations';
import { shallow } from 'zustand/shallow';
import { useEnergyMapStore } from '../../../store/useEnergyMapStore';

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
  targetCalories = 2500,
  onOpenMacroPicker,
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
    () => getGoalAlignmentText(trend.weeklyRate, selectedGoal, 'weight'),
    [trend.weeklyRate, selectedGoal]
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
    () =>
      getGoalAlignmentText(bodyFatTrend.weeklyRate, selectedGoal, 'bodyFat'),
    [bodyFatTrend.weeklyRate, selectedGoal]
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

  const currentWeight = formatWeight(
    latestEntry?.weight ?? resolvedUserData.weight
  );
  const weightOldDataWarning = useMemo(
    () => getOldDataWarningText(latestEntry?.date),
    [latestEntry?.date]
  );

  const currentBodyFat = formatBodyFat(latestBodyFatEntry?.bodyFat);
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

  const macroSplit = useMemo(
    () =>
      normalizeMacroRecommendationSplit(
        resolvedUserData.macroRecommendationSplit
      ),
    [resolvedUserData.macroRecommendationSplit]
  );
  const macroRecommendation = useMemo(
    () =>
      calculateMacroRecommendations({
        targetCalories,
        macroSplit,
        userData: resolvedUserData,
      }),
    [macroSplit, resolvedUserData, targetCalories]
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
            <div className="flex items-start justify-between gap-3">
              <div>
                <p
                  className={`text-lg font-semibold flex items-center gap-1.5 ${getTrendToneClass(trend, selectedGoal, 'weight')}`}
                >
                  <TrendIcon direction={trend.direction} size={16} />
                  {trend.label}
                </p>
                <p className="text-muted text-sm mt-1">
                  <span className="font-bold text-foreground">
                    {currentWeight ? `${currentWeight} kg` : '—'}
                  </span>{' '}
                  <span className="inline-flex items-center gap-2">
                    <span>
                      •{' '}
                      {latestEntry?.date
                        ? formatTooltipDate(latestEntry.date)
                        : 'No entries yet'}
                    </span>
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
                    {formatWeeklyRate(trend.weeklyRate, 'weight')}
                  </span>{' '}
                  over last 7 days
                </p>
                <p className="text-accent-blue/80 text-[10px] tracking-wide mt-2">
                  Tap to open weight tracker
                </p>
              </div>
              {sparkline.pathData && sortedEntries.length > 1 && (
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
                        className="drop-shadow-sm"
                      />
                    ))}
                  </svg>
                </div>
              )}
            </div>
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
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p
                    className={`text-lg font-semibold flex items-center gap-1.5 ${getTrendToneClass(bodyFatTrend, selectedGoal, 'bodyFat')}`}
                  >
                    <TrendIcon direction={bodyFatTrend.direction} size={16} />
                    {bodyFatTrend.label}
                  </p>
                  <p className="text-muted text-sm mt-1">
                    <span className="font-bold text-foreground">
                      {currentBodyFat ? `${currentBodyFat}%` : '—'}
                    </span>{' '}
                    <span className="inline-flex items-center gap-2">
                      <span>
                        •{' '}
                        {latestBodyFatEntry?.date
                          ? formatTooltipDate(latestBodyFatEntry.date)
                          : 'No entries yet'}
                      </span>
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
                      {formatWeeklyRate(bodyFatTrend.weeklyRate, 'bodyFat')}
                    </span>{' '}
                    over last 7 days
                  </p>
                  <p className="text-accent-blue/80 text-[10px] tracking-wide mt-2">
                    Tap to open body fat tracker
                  </p>
                </div>
                {bodyFatSparkline.pathData &&
                  sortedBodyFatEntries.length > 1 && (
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
                            className="drop-shadow-sm"
                          />
                        ))}
                      </svg>
                    </div>
                  )}
              </div>
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
                <div className="absolute top-2 right-2 p-1">
                  <Info size={18} className="text-muted/80" />
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
                <div className="absolute top-2 right-2 p-1">
                  <Info size={18} className="text-muted/80" />
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
        <div className="flex items-center justify-between mb-4 gap-3">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <PieChart className="text-accent-blue" size={18} />
            Macro Balancer
          </h2>
          <button
            type="button"
            onClick={() => onOpenMacroPicker?.()}
            className="px-3 py-2 bg-primary text-primary-foreground rounded-lg font-semibold transition-all active:scale-95 flex items-center gap-2 press-feedback focus-ring md:hover:bg-surface"
            title="Edit macro recommendations"
            aria-label="Edit macro recommendations"
          >
            <SlidersHorizontal size={18} />
            <span className="hidden md:inline">Edit</span>
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-accent-red/15 border border-accent-red/50 rounded-xl p-4">
            <p className="text-accent-red font-bold mb-2">Protein</p>
            <p className="text-foreground text-2xl font-bold">
              {macroRecommendation.grams.protein}g
            </p>
            <p className="text-muted text-sm">Picked target</p>
          </div>
          <div className="bg-accent-yellow/15 border border-accent-yellow/50 rounded-xl p-4">
            <p className="text-accent-yellow font-bold mb-2">Fats</p>
            <p className="text-foreground text-2xl font-bold">
              {macroRecommendation.grams.fats}g
            </p>
            <p className="text-muted text-sm">Picked target</p>
          </div>
          <div className="bg-accent-amber/15 border border-accent-amber/50 rounded-xl p-4">
            <p className="text-accent-amber font-bold mb-2">Carbs</p>
            <p className="text-foreground text-2xl font-bold">
              {macroRecommendation.grams.carbs}g
            </p>
            <p className="text-muted text-sm">Picked target</p>
          </div>
        </div>
        {selectedGoal === 'aggressive_cut' && (
          <div className="mt-4 bg-accent-red/15 border border-accent-red/60 rounded-xl p-4 flex items-start gap-3">
            <Info size={20} className="text-accent-red flex-shrink-0 mt-0.5" />
            <p className="text-foreground text-sm">
              During an aggressive cut, keep protein at or above your selected
              target ({macroRecommendation.grams.protein}g) to help preserve
              lean mass. Consider increasing slightly if recovery or satiety
              suffers.
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
