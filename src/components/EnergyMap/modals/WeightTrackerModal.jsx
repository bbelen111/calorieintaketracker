import React, { useMemo } from 'react';
import { Plus, TrendingUp, TrendingDown, Minus, Edit3, Trash2 } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';
import {
  calculateWeightTrend,
  createSparklinePoints,
  formatDateLabel,
  formatWeight,
  sortWeightEntries
} from '../../../utils/weight';

const CHART_WIDTH = 560;
const CHART_HEIGHT = 200;

const TrendIcon = ({ direction }) => {
  if (direction === 'up') {
    return <TrendingUp size={18} />;
  }
  if (direction === 'down') {
    return <TrendingDown size={18} />;
  }
  return <Minus size={18} />;
};

const getTrendToneClass = (direction) => {
  if (direction === 'down') {
    return 'text-emerald-300';
  }
  if (direction === 'up') {
    return 'text-amber-300';
  }
  return 'text-slate-300';
};

export const WeightTrackerModal = ({
  isOpen,
  isClosing,
  entries,
  latestWeight,
  hasTodayEntry,
  todayEntry,
  onClose,
  onPrimaryAction,
  primaryActionLabel,
  onAddEntry,
  onEditEntry,
  onDeleteEntry
}) => {
  const sortedEntries = useMemo(() => sortWeightEntries(entries ?? []), [entries]);
  const reversedEntries = useMemo(() => [...sortedEntries].reverse(), [sortedEntries]);
  const trend = useMemo(() => calculateWeightTrend(sortedEntries), [sortedEntries]);
  const chart = useMemo(
    () =>
      createSparklinePoints(sortedEntries, {
        width: CHART_WIDTH,
        height: CHART_HEIGHT,
        padding: 12,
        limit: 120
      }),
    [sortedEntries]
  );

  const currentWeightValue = sortedEntries.length
    ? sortedEntries[sortedEntries.length - 1].weight
    : latestWeight;
  const currentWeightDisplay = (() => {
    const formatted = formatWeight(currentWeightValue);
    return formatted ? `${formatted} kg` : '—';
  })();

  const totalChangeDisplay = (() => {
    if (!Number.isFinite(trend.delta) || trend.delta === 0) {
      return '0.0 kg';
    }
    const sign = trend.delta > 0 ? '+' : '';
    return `${sign}${trend.delta.toFixed(1)} kg`;
  })();

  const weeklyRateDisplay = (() => {
    if (!Number.isFinite(trend.weeklyRate) || trend.weeklyRate === 0) {
      return '0.0 kg/wk';
    }
    const sign = trend.weeklyRate > 0 ? '+' : '';
    return `${sign}${trend.weeklyRate.toFixed(2)} kg/wk`;
  })();

  const hasEntries = sortedEntries.length > 0;
  const PrimaryIcon = hasTodayEntry ? Edit3 : Plus;

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
  overlayClassName="!z-[80] fixed inset-0 bg-black/70 !p-0 !flex-none !items-stretch !justify-stretch"
      contentClassName="fixed inset-0 w-screen h-screen overflow-y-auto p-6 md:p-8 bg-slate-900 rounded-none border-none !max-h-none"
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <h3 className="text-white font-bold text-2xl">Weight Tracker</h3>
            <p className="text-slate-400 text-sm">
              Visualise your weight trend and manage daily logs.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onPrimaryAction?.()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-all"
            >
              <PrimaryIcon size={18} />
              {primaryActionLabel}
            </button>
            <button
              type="button"
              onClick={() => onAddEntry?.()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800 transition-all"
            >
              Add Entry for Another Day
            </button>
          </div>
        </div>

        <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-1 flex flex-col justify-between">
              <div>
                <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">Current Weight</p>
                <p className="text-white text-3xl font-bold">{currentWeightDisplay}</p>
              </div>
              <div className="mt-4 space-y-2 text-sm">
                <p className="text-slate-300">
                  <span className="text-slate-400 uppercase text-[11px] tracking-wide">Change</span>
                  <br />
                  {totalChangeDisplay}
                </p>
                <p className="text-slate-300">
                  <span className="text-slate-400 uppercase text-[11px] tracking-wide">Weekly Rate</span>
                  <br />
                  {weeklyRateDisplay}
                </p>
                <p className={`${getTrendToneClass(trend.direction)} font-semibold flex items-center gap-2`}>
                  <TrendIcon direction={trend.direction} />
                  {trend.label}
                </p>
              </div>
            </div>
            <div className="md:col-span-3">
              <div className="relative">
                <svg
                  width="100%"
                  height="100%"
                  viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                  className="w-full h-48"
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient id="weightLine" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.9" />
                      <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.2" />
                    </linearGradient>
                  </defs>
                  <rect width="100%" height="100%" className="fill-slate-900/40" />
                  {chart.points ? (
                    <polyline
                      points={chart.points}
                      fill="none"
                      stroke="url(#weightLine)"
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : (
                    <text x="50%" y="50%" textAnchor="middle" className="fill-slate-500 text-sm">
                      No weight data yet
                    </text>
                  )}
                </svg>
              </div>
              {chart.min != null && chart.max != null && (
                <div className="flex justify-between text-xs text-slate-400 mt-2">
                  <span>Min: {formatWeight(chart.min)} kg</span>
                  <span>Max: {formatWeight(chart.max)} kg</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-white font-semibold">Entries</p>
            <p className="text-slate-400 text-xs uppercase tracking-wide">One entry per day</p>
          </div>

          {hasEntries ? (
            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {reversedEntries.map((entry, index) => {
                const dateLabel = formatDateLabel(entry.date, { month: 'short', day: 'numeric', year: 'numeric' });
                const weightLabel = formatWeight(entry.weight);
                const prev = reversedEntries[index + 1];
                const delta = prev ? entry.weight - prev.weight : null;
                const deltaLabel = (() => {
                  if (delta == null || delta === 0) {
                    return null;
                  }
                  const sign = delta > 0 ? '+' : '';
                  return `${sign}${delta.toFixed(1)} kg`;
                })();

                const isToday = todayEntry?.date === entry.date;

                return (
                  <div
                    key={entry.date}
                    className={`flex items-center gap-4 rounded-lg border border-slate-700 px-4 py-3 bg-slate-900/40 ${
                      isToday ? 'border-blue-500/70 bg-blue-900/20' : ''
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold text-base leading-tight">
                        {weightLabel ? `${weightLabel} kg` : '—'}
                        {deltaLabel && (
                          <span className={`ml-2 text-xs ${delta > 0 ? 'text-amber-300' : 'text-emerald-300'}`}>
                            {deltaLabel}
                          </span>
                        )}
                      </p>
                      <p className="text-slate-400 text-sm">{dateLabel}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onEditEntry?.(entry)}
                        className="text-slate-300 hover:text-white transition-all"
                      >
                        <Edit3 size={18} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteEntry?.(entry)}
                        className="text-red-300 hover:text-red-200 transition-all"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center text-slate-400 text-sm py-10 border border-dashed border-slate-700 rounded-xl">
              No entries yet. Tap "Add Entry" to log your first weight.
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-700 text-white hover:bg-slate-600 transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </ModalShell>
  );
};
