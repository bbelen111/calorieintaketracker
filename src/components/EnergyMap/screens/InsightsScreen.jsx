import React, { useMemo } from 'react';
import { Info, LineChart } from 'lucide-react';
import {
  calculateWeightTrend,
  createSparklinePoints,
  formatDateLabel,
  formatWeight
} from '../../../utils/weight';

const getTrendToneClass = (direction, label) => {
  // If no meaningful data, show white
  if (label === 'Need more data' || label === 'No data yet') {
    return 'text-white';
  }
  
  // Severe states (most extreme) - Red
  if (label.includes('Severe')) {
    return 'text-red-500';
  }
  
  // Aggressive states
  if (label.includes('Aggressive weight loss')) {
    return 'text-orange-500'; // Matches aggressive_cut goal
  }
  if (label.includes('Aggressive weight gain')) {
    return 'text-purple-500'; // Matches aggressive_bulk goal
  }
  
  // Moderate states
  if (label.includes('Moderate weight loss')) {
    return 'text-yellow-500'; // Matches cutting goal
  }
  if (label.includes('Moderate weight gain')) {
    return 'text-green-500'; // Matches bulking/lean bulk goal
  }
  
  // Gradual states - use slightly muted versions
  if (direction === 'down') {
    return 'text-yellow-400'; // Gradual loss
  }
  if (direction === 'up') {
    return 'text-green-400'; // Gradual gain
  }
  
  return 'text-blue-400'; // Stable/maintenance
};

const formatDelta = (value) => {
  if (!Number.isFinite(value) || value === 0) {
    return '0.0 kg';
  }
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)} kg`;
};

const formatWeeklyRate = (value) => {
  if (!Number.isFinite(value) || value === 0) {
    return '0.0 kg/wk';
  }
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)} kg/wk`;
};

export const InsightsScreen = ({ userData, selectedGoal, weightEntries = [], onOpenWeightTracker }) => {
  // Only keep entries from the last 7 days
  const sortedEntries = useMemo(() => {
    if (!weightEntries.length) return [];
    const now = new Date();
    return weightEntries.filter(entry => {
      const entryDate = new Date(entry.date + 'T00:00:00');
      return (now - entryDate) / (1000 * 60 * 60 * 24) <= 7;
    });
  }, [weightEntries]);
  const trend = useMemo(() => calculateWeightTrend(sortedEntries), [sortedEntries]);
  const sparkline = useMemo(
    () =>
      createSparklinePoints(sortedEntries, {
        width: 160,
        height: 56,
        padding: 6,
        limit: 7 // Only show up to 7 entries
      }),
    [sortedEntries]
  );

  const latestEntry = useMemo(
    () => (sortedEntries.length ? sortedEntries[sortedEntries.length - 1] : null),
    [sortedEntries]
  );

  // ...existing code...

  const currentWeight = formatWeight(latestEntry?.weight ?? userData.weight);
  const lastLoggedLabel = latestEntry?.date
    ? formatDateLabel(latestEntry.date, { month: 'short', day: 'numeric' })
    : 'No entries yet';

  return (
    <div className="space-y-6 pb-10">
      <button
        type="button"
        onClick={onOpenWeightTracker}
        className="w-full bg-slate-800 rounded-2xl border border-blue-600/40 shadow-2xl p-5 md:p-6 text-left transition-all hover:border-blue-400/70 hover:bg-slate-800/90"
      >
        <div className="flex items-center justify-between gap-1">
          <div>
            <p className="text-slate-400 text-xs tracking-wide mb-2 flex items-center gap-2">
              <LineChart size={16} className="text-blue-300" />
              Weight Snapshot
            </p>
            <p className={`text-xl font-semibold ${getTrendToneClass(trend.direction, trend.label)}`}>{trend.label}</p>
            <p className="text-slate-300 text-sm mt-1">
              {currentWeight ? `${currentWeight} kg` : '—'} • {lastLoggedLabel}
            </p>
            <p className="text-slate-500 text-xs mt-3">
              {formatWeeklyRate(trend.weeklyRate)}
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
                  <linearGradient id="weightSparklineGradient" x1="0" x2="0" y1="0" y2="1">
                    {trend.label.includes('Severe') ? (
                      <>
                        <stop offset="0%" stopColor="#ef4444" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#ef4444" stopOpacity="0.05" />
                      </>
                    ) : trend.label.includes('Aggressive weight loss') ? (
                      <>
                        <stop offset="0%" stopColor="#f97316" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#f97316" stopOpacity="0.05" />
                      </>
                    ) : trend.label.includes('Aggressive weight gain') ? (
                      <>
                        <stop offset="0%" stopColor="#a855f7" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#a855f7" stopOpacity="0.05" />
                      </>
                    ) : trend.label.includes('Moderate weight loss') ? (
                      <>
                        <stop offset="0%" stopColor="#eab308" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#eab308" stopOpacity="0.05" />
                      </>
                    ) : trend.label.includes('Moderate weight gain') ? (
                      <>
                        <stop offset="0%" stopColor="#22c55e" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#22c55e" stopOpacity="0.05" />
                      </>
                    ) : trend.direction === 'down' ? (
                      <>
                        <stop offset="0%" stopColor="#eab308" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#eab308" stopOpacity="0.05" />
                      </>
                    ) : trend.direction === 'up' ? (
                      <>
                        <stop offset="0%" stopColor="#22c55e" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#22c55e" stopOpacity="0.05" />
                      </>
                    ) : (
                      <>
                        <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.05" />
                      </>
                    )}
                  </linearGradient>
                  <linearGradient id="weightSparklineStroke" x1="0" x2="0" y1="0" y2="1">
                    {trend.label.includes('Severe') ? (
                      <>
                        <stop offset="0%" stopColor="#ef4444" stopOpacity="1" />
                        <stop offset="100%" stopColor="#ef4444" stopOpacity="0.8" />
                      </>
                    ) : trend.label.includes('Aggressive weight loss') ? (
                      <>
                        <stop offset="0%" stopColor="#f97316" stopOpacity="1" />
                        <stop offset="100%" stopColor="#f97316" stopOpacity="0.8" />
                      </>
                    ) : trend.label.includes('Aggressive weight gain') ? (
                      <>
                        <stop offset="0%" stopColor="#a855f7" stopOpacity="1" />
                        <stop offset="100%" stopColor="#a855f7" stopOpacity="0.8" />
                      </>
                    ) : trend.label.includes('Moderate weight loss') ? (
                      <>
                        <stop offset="0%" stopColor="#eab308" stopOpacity="1" />
                        <stop offset="100%" stopColor="#eab308" stopOpacity="0.8" />
                      </>
                    ) : trend.label.includes('Moderate weight gain') ? (
                      <>
                        <stop offset="0%" stopColor="#22c55e" stopOpacity="1" />
                        <stop offset="100%" stopColor="#22c55e" stopOpacity="0.8" />
                      </>
                    ) : trend.direction === 'down' ? (
                      <>
                        <stop offset="0%" stopColor="#eab308" stopOpacity="0.8" />
                        <stop offset="100%" stopColor="#eab308" stopOpacity="0.6" />
                      </>
                    ) : trend.direction === 'up' ? (
                      <>
                        <stop offset="0%" stopColor="#22c55e" stopOpacity="0.8" />
                        <stop offset="100%" stopColor="#22c55e" stopOpacity="0.6" />
                      </>
                    ) : (
                      <>
                        <stop offset="0%" stopColor="#60a5fa" stopOpacity="1" />
                        <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.8" />
                      </>
                    )}
                  </linearGradient>
                </defs>
                {/* Area fill */}
                {sparkline.areaPath && (
                  <path
                    d={sparkline.areaPath}
                    fill="url(#weightSparklineGradient)"
                  />
                )}
                {/* Line */}
                <polyline
                  points={sparkline.points}
                  fill="none"
                  stroke="url(#weightSparklineStroke)"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Data points */}
                {sparkline.coordinates?.map((coord, index) => {
                  const fillColor = trend.label.includes('Severe')
                    ? '#ef4444'
                    : trend.label.includes('Aggressive weight loss')
                    ? '#f97316'
                    : trend.label.includes('Aggressive weight gain')
                    ? '#a855f7'
                    : trend.label.includes('Moderate weight loss')
                    ? '#eab308'
                    : trend.label.includes('Moderate weight gain')
                    ? '#22c55e'
                    : trend.direction === 'down' 
                    ? '#eab308' 
                    : trend.direction === 'up' 
                    ? '#22c55e' 
                    : '#60a5fa';
                  return (
                    <circle
                      key={index}
                      cx={coord.x}
                      cy={coord.y}
                      r="2.5"
                      fill={fillColor}
                      className="drop-shadow-sm"
                    />
                  );
                })}
              </svg>
              {/* Left fade */}
              <div className="absolute left-0 top-0 bottom-0 w-3 bg-gradient-to-r from-slate-800 to-transparent pointer-events-none" />
              {/* Right fade */}
              <div className="absolute right-0 top-0 bottom-0 w-3 bg-gradient-to-l from-slate-800 to-transparent pointer-events-none" />
            </div>
          )}
        </div>
        <p className="text-blue-300 text-xs tracking-wide mt-4">Tap to open weight tracker</p>
      </button>

      <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-2xl">
        <h2 className="text-xl font-bold text-white mb-4">Macro Recommendations</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-red-900/30 border border-red-700 rounded-xl p-4">
            <p className="text-red-400 font-bold mb-2">Protein</p>
            <p className="text-white text-2xl font-bold">
              {Math.round(userData.weight * 2.0)}-{Math.round(userData.weight * 2.4)}g
            </p>
            <p className="text-slate-400 text-sm">2.0-2.4g per kg bodyweight</p>
          </div>
          <div className="bg-yellow-900/30 border border-yellow-700 rounded-xl p-4">
            <p className="text-yellow-400 font-bold mb-2">Fats</p>
            <p className="text-white text-2xl font-bold">
              {Math.round(userData.weight * 0.8)}-{Math.round(userData.weight * 1.0)}g
            </p>
            <p className="text-slate-400 text-sm">0.8-1.0g per kg bodyweight</p>
          </div>
          <div className="bg-blue-900/30 border border-blue-700 rounded-xl p-4">
            <p className="text-blue-400 font-bold mb-2">Carbs</p>
            <p className="text-white text-lg font-bold">Remaining calories</p>
            <p className="text-slate-400 text-sm">Adjust based on energy needs</p>
          </div>
        </div>
        {selectedGoal === 'aggressive_cut' && (
          <div className="mt-4 bg-red-900/40 border border-red-600/80 rounded-xl p-4 flex items-start gap-3">
            <Info size={20} className="text-red-300 flex-shrink-0 mt-0.5" />
            <p className="text-red-100 text-sm">
              During an aggressive cut, push protein to the upper end of the {Math.round(userData.weight * 2.4)}g+ range to help preserve lean mass. Consider exceeding this slightly if recovery or satiety suffer.
            </p>
          </div>
        )}
      </div>
      <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-2xl">
        <h2 className="text-xl font-bold text-white mb-4">Tips</h2>
        <ul className="space-y-2 text-slate-300">
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-1">•</span>
            <span>Track your steps daily to use the accurate calorie target</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-1">•</span>
            <span>On training days, fuel your sessions properly with higher carbs pre-workout</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-1">•</span>
            <span>Cardio burns are calculated using MET values based on your weight</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-1">•</span>
            <span>Different training types burn calories at different rates - adjust accordingly</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-1">•</span>
            <span>Weigh yourself weekly and adjust if progress stalls for 2+ weeks</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-1">•</span>
            <span>For lean bulk: aim for 0.25-0.5kg gain per week. For aggressive bulk: 0.5-1kg per week</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-1">•</span>
            <span>For moderate cut: aim for 0.5kg loss per week. For aggressive cut: 0.75-1kg per week</span>
          </li>
        </ul>
      </div>
    </div>
  );
};
