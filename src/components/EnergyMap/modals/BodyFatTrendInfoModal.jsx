import React from 'react';
import { Info, TrendingUp, TrendingDown, Minus, X } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';

const TrendIcon = ({ direction }) => {
  if (direction === 'up') {
    return <TrendingUp size={20} />;
  }
  if (direction === 'down') {
    return <TrendingDown size={20} />;
  }
  return <Minus size={20} />;
};

export const BodyFatTrendInfoModal = ({
  isOpen,
  isClosing,
  trend,
  onClose,
}) => {
  const getTrendColor = (label) => {
    if (label === 'Need more data' || label === 'No data yet') {
      return 'text-white';
    }
    if (label.includes('Severe')) {
      return 'text-red-500';
    }
    if (label.includes('Aggressive body fat loss')) {
      return 'text-orange-500';
    }
    if (label.includes('Aggressive body fat gain')) {
      return 'text-purple-500';
    }
    if (label.includes('Moderate body fat loss')) {
      return 'text-yellow-500';
    }
    if (label.includes('Moderate body fat gain')) {
      return 'text-green-500';
    }
    if (label.includes('Gradual body fat loss')) {
      return 'text-yellow-400';
    }
    if (label.includes('Gradual body fat gain')) {
      return 'text-green-400';
    }
    return 'text-blue-400';
  };

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      overlayClassName="bg-black/90 z-[85]"
      contentClassName="p-6 max-w-lg w-full"
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <Info size={28} className="text-blue-400" />
          <h3 className="text-white font-bold text-xl">Body Fat Trends</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 md:hover:text-white transition-colors focus-ring"
        >
          <X size={20} />
        </button>
      </div>

      <div className="space-y-4 text-slate-300">
        <p>
          Your body fat trend is calculated by analyzing your recent entries to
          determine the rate and direction of change over time.
        </p>

        <div className="bg-slate-700/50 rounded-lg p-4">
          <p className="font-bold text-white mb-2">
            How We Calculate Your Trend:
          </p>
          <div className="text-sm space-y-2">
            <p>
              We look at your body fat entries over the{' '}
              <span className="text-blue-400 font-semibold">last 30 days</span>{' '}
              (or all available data if you have less).
            </p>
            <p>
              The trend compares your earliest and latest entries in this window
              to calculate your{' '}
              <span className="text-blue-400 font-semibold">
                weekly rate of change
              </span>
              .
            </p>
          </div>
        </div>

        <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-4">
          <p className="font-bold text-blue-300 mb-3">Your Current Trend:</p>
          <div className="flex items-center gap-3 mb-3">
            <span
              className={`${getTrendColor(trend.label)} font-semibold text-lg flex items-center gap-2`}
            >
              <TrendIcon direction={trend.direction} />
              {trend.label}
            </span>
          </div>
          <div className="text-sm space-y-1">
            <p>
              Weekly Rate:{' '}
              <span className="text-white font-semibold">
                {trend.weeklyRate >= 0 ? '+' : ''}
                {trend.weeklyRate.toFixed(2)} %/week
              </span>
            </p>
            <p>
              Data Points:{' '}
              <span className="text-white font-semibold">
                {trend.sampleRange?.length || 0} entries
              </span>
            </p>
            {trend.sampleRange && trend.sampleRange.length >= 2 && (
              <p>
                Period:{' '}
                <span className="text-white font-semibold">
                  {trend.sampleRange[0].date} to{' '}
                  {trend.sampleRange[trend.sampleRange.length - 1].date}
                </span>
              </p>
            )}
          </div>
        </div>

        <div className="bg-slate-800/70 border border-slate-700 rounded-lg p-4 space-y-2">
          <p className="text-white font-semibold text-sm uppercase tracking-wide">
            Trend Classifications
          </p>
          <div className="grid gap-2 text-xs md:text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Stable</span>
              <span className="text-blue-400 font-semibold">
                &lt; 0.1 %/week
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Gradual change</span>
              <span className="text-green-400 font-semibold">
                0.1 - 0.45 %/week
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Moderate change</span>
              <span className="text-yellow-500 font-semibold">
                0.45 - 0.8 %/week
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Aggressive change</span>
              <span className="text-orange-500 font-semibold">
                0.8 - 1.2 %/week
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Severe change</span>
              <span className="text-red-500 font-semibold">
                &gt; 1.2 %/week
              </span>
            </div>
          </div>
        </div>

        <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-4 text-xs md:text-sm">
          <p className="text-yellow-200 font-semibold mb-2">Important Notes</p>
          <ul className="space-y-1 list-disc list-inside text-yellow-100/90">
            <li>
              Body fat estimates can vary based on measurement method and timing
            </li>
            <li>More data points provide more accurate trend analysis</li>
            <li>
              Compare your trend to your goal&apos;s target rate for best
              results
            </li>
            <li>Severe rates may not be sustainable or healthy long-term</li>
          </ul>
        </div>

        <p className="text-xs md:text-sm text-slate-400 italic">
          Tip: Track body fat with the same method and timing for the most
          consistent trends.
        </p>
      </div>

      <div className="mt-6">
        <button
          onClick={onClose}
          type="button"
          className="w-full bg-blue-600 active:bg-blue-700 text-white px-6 py-3 rounded-lg transition-all active:scale-95 font-medium"
        >
          Got it!
        </button>
      </div>
    </ModalShell>
  );
};
