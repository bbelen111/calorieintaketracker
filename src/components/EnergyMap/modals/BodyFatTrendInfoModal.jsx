import React from 'react';
import { Info, TrendingUp, TrendingDown, Minus, X, CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';
import { getGoalAlignedTextClass } from '../../../utils/goalAlignment';
import { goals } from '../../../constants/goals';

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
  selectedGoal = 'maintenance',
  onClose,
}) => {
  const getTrendColor = () => {
    if (!trend || trend.label === 'Need more data' || trend.label === 'No data yet') {
      return 'text-white';
    }
    return getGoalAlignedTextClass(trend, selectedGoal, 'bodyFat');
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
          <h3 className="text-foreground font-bold text-xl">Body Fat Trends</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted md:hover:text-foreground transition-colors focus-ring"
        >
          <X size={20} />
        </button>
      </div>

      <div className="space-y-4 text-foreground/80">
        <p>
          Your body fat trend is calculated by analyzing your recent entries to
          determine the rate and direction of change over time.
        </p>

        <div className="bg-surface-highlight/50 rounded-lg p-4">
          <p className="font-bold text-foreground mb-2">
            How We Calculate Your Trend:
          </p>
          <div className="text-sm space-y-2">
            <p>
              We analyze your body fat entries over a{' '}
              <span className="text-blue-400 font-semibold">
                selectable time window
              </span>{' '}
              (30 days, 90 days, 6 months, or all available data).
            </p>
            <p>
              The trend compares your earliest and latest entries in the
              selected window to calculate your{' '}
              <span className="text-blue-400 font-semibold">
                weekly rate of change
              </span>
              . Longer timeframes provide more stable trends, while shorter
              windows highlight recent progress.
            </p>
          </div>
        </div>

        <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-4">
          <p className="font-bold text-blue-300 mb-3">Your Current Trend:</p>
          <div className="flex items-center gap-3 mb-3">
            <span
              className={`${getTrendColor()} font-semibold text-lg flex items-center gap-2`}
            >
              <TrendIcon direction={trend.direction} />
              {trend.label}
            </span>
          </div>
          <div className="text-sm space-y-1">
            <p>
              Weekly Rate:{' '}
              <span className="text-foreground font-semibold">
                {trend.weeklyRate >= 0 ? '+' : ''}
                {trend.weeklyRate.toFixed(2)} %/week
              </span>
            </p>
            <p>
              Data Points:{' '}
              <span className="text-foreground font-semibold">
                {trend.sampleRange?.length || 0} entries
              </span>
            </p>
            {trend.sampleRange && trend.sampleRange.length >= 2 && (
              <p>
                Period:{' '}
                <span className="text-foreground font-semibold">
                  {trend.sampleRange[0].date} to{' '}
                  {trend.sampleRange[trend.sampleRange.length - 1].date}
                </span>
              </p>
            )}
          </div>
        </div>

        <div className="bg-emerald-900/20 border border-emerald-700/50 rounded-lg p-4">
          <p className="font-bold text-emerald-300 mb-3">Goal Alignment:</p>
          <div className="text-sm space-y-2">
            <p>
              Your selected goal is{' '}
              <span className="text-foreground font-semibold">
                {goals[selectedGoal]?.label || 'Maintenance'}
              </span>
              .
            </p>
            <p>
              Target rate:{' '}
              <span className="text-foreground font-semibold">
                {selectedGoal === 'aggressive_bulk'
                  ? '+0.15 to +0.3 %/week'
                  : selectedGoal === 'bulking'
                    ? '+0.08 to +0.15 %/week'
                    : selectedGoal === 'maintenance'
                      ? '-0.1 to +0.1 %/week'
                      : selectedGoal === 'cutting'
                        ? '-0.15 to -0.08 %/week'
                        : '-0.3 to -0.15 %/week'}
              </span>
            </p>
            <p>
              Your current rate:{' '}
              <span className={`${getTrendColor()} font-semibold`}>
                {trend.weeklyRate >= 0 ? '+' : ''}
                {trend.weeklyRate.toFixed(2)} %/week
              </span>
            </p>
            <div className="mt-3 pt-3 border-t border-emerald-700/30">
              <div className="flex items-center gap-3">
                <span className="flex-shrink-0">
                  {(() => {
                    const rate = trend.weeklyRate;
                    const absRate = Math.abs(rate);

                    if (selectedGoal === 'maintenance') {
                      if (absRate <= 0.1) return <CheckCircle2 size={16} className="text-green-400" />;
                      if (absRate <= 0.15) return <AlertCircle size={16} className="text-yellow-400" />;
                      return <XCircle size={16} className="text-red-400" />;
                    }

                    const isGain = selectedGoal.includes('bulk');
                    const isCut = selectedGoal.includes('cut');
                    const movingWrong = (isGain && rate < -0.1) || (isCut && rate > 0.1);

                    if (movingWrong) return <XCircle size={16} className="text-red-400" />;

                    if (selectedGoal === 'aggressive_bulk') {
                      if (rate >= 0.15 && rate <= 0.3) return <CheckCircle2 size={16} className="text-green-400" />;
                      if (rate < 0.15) return <AlertCircle size={16} className="text-yellow-400" />;
                      return <AlertCircle size={16} className="text-yellow-400" />;
                    }

                    if (selectedGoal === 'bulking') {
                      if (rate >= 0.08 && rate <= 0.15) return <CheckCircle2 size={16} className="text-green-400" />;
                      if (rate < 0.08) return <AlertCircle size={16} className="text-yellow-400" />;
                      return <AlertCircle size={16} className="text-yellow-400" />;
                    }

                    if (selectedGoal === 'cutting') {
                      if (rate <= -0.08 && rate >= -0.15) return <CheckCircle2 size={16} className="text-green-400" />;
                      if (rate > -0.08) return <AlertCircle size={16} className="text-yellow-400" />;
                      return <AlertCircle size={16} className="text-orange-400" />;
                    }

                    if (selectedGoal === 'aggressive_cut') {
                      if (rate <= -0.15 && rate >= -0.3) return <CheckCircle2 size={16} className="text-green-400" />;
                      if (rate > -0.15) return <AlertCircle size={16} className="text-yellow-400" />;
                      return <AlertCircle size={16} className="text-orange-400" />;
                    }

                    return <AlertCircle size={16} className="text-muted" />;
                  })()}
                </span>
                <p className={(() => {
                    const rate = trend.weeklyRate;
                    const absRate = Math.abs(rate);

                    if (selectedGoal === 'maintenance') {
                      if (absRate <= 0.1) return 'text-emerald-200';
                      if (absRate <= 0.15) return 'text-yellow-300';
                      return 'text-red-300';
                    }

                    const isGain = selectedGoal.includes('bulk');
                    const isCut = selectedGoal.includes('cut');
                    const movingWrong = (isGain && rate < -0.1) || (isCut && rate > 0.1);

                    if (movingWrong) return 'text-red-300';

                    if (selectedGoal === 'aggressive_bulk') {
                      if (rate >= 0.15 && rate <= 0.3) return 'text-green-300';
                      if (rate < 0.15) return 'text-yellow-300';
                      return 'text-yellow-300';
                    }

                    if (selectedGoal === 'bulking') {
                      if (rate >= 0.08 && rate <= 0.15) return 'text-green-300';
                      if (rate < 0.08) return 'text-yellow-300';
                      return 'text-yellow-300';
                    }

                    if (selectedGoal === 'cutting') {
                      if (rate <= -0.08 && rate >= -0.15) return 'text-green-300';
                      if (rate > -0.08) return 'text-yellow-300';
                      return 'text-orange-300';
                    }

                    if (selectedGoal === 'aggressive_cut') {
                      if (rate <= -0.15 && rate >= -0.3) return 'text-green-300';
                      if (rate > -0.15) return 'text-yellow-300';
                      return 'text-orange-300';
                    }

                    return 'text-foreground/80';
                  })()}>
                  {(() => {
                    const rate = trend.weeklyRate;
                    const absRate = Math.abs(rate);

                    if (selectedGoal === 'maintenance') {
                      if (absRate <= 0.1) return 'Perfect! Your body fat is stable.';
                      if (absRate <= 0.15) return 'Slightly off track, but close to maintenance.';
                      return 'Significant deviation from maintenance goal.';
                    }

                    const isGain = selectedGoal.includes('bulk');
                    const isCut = selectedGoal.includes('cut');
                    const movingWrong = (isGain && rate < -0.1) || (isCut && rate > 0.1);

                    if (movingWrong) return 'Moving in the opposite direction of your goal.';

                    if (selectedGoal === 'aggressive_bulk') {
                      if (rate >= 0.15 && rate <= 0.3) return 'Perfectly on track for aggressive bulk!';
                      if (rate < 0.15) return 'Gaining slower than target. May need more calories.';
                      return 'Gaining faster than target. May be accumulating excess fat.';
                    }

                    if (selectedGoal === 'bulking') {
                      if (rate >= 0.08 && rate <= 0.15) return 'Perfectly on track for lean bulk!';
                      if (rate < 0.08) return 'Gaining slower than target. May need more calories.';
                      return 'Gaining faster than target. May be accumulating excess fat.';
                    }

                    if (selectedGoal === 'cutting') {
                      if (rate <= -0.08 && rate >= -0.15) return 'Perfectly on track for moderate cut!';
                      if (rate > -0.08) return 'Losing slower than target. May need larger deficit.';
                      return 'Losing faster than target. Risk of muscle loss.';
                    }

                    if (selectedGoal === 'aggressive_cut') {
                      if (rate <= -0.15 && rate >= -0.3) return 'Perfectly on track for aggressive cut!';
                      if (rate > -0.15) return 'Losing slower than target. May need larger deficit.';
                      return 'Losing faster than target. High risk of muscle loss.';
                    }

                    return 'Track consistently to establish your trend.';
                  })()}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-surface/70 border border-border rounded-lg p-4 space-y-2">
          <p className="text-white font-semibold text-sm uppercase tracking-wide">
            Trend Classifications
          </p>
          <div className="grid gap-2 text-xs md:text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted">Stable</span>
              <span className="text-blue-400 font-semibold">
                &lt; 0.1 %/week
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Gradual change</span>
              <span className="text-green-400 font-semibold">
                0.1 - 0.45 %/week
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Moderate change</span>
              <span className="text-yellow-500 font-semibold">
                0.45 - 0.8 %/week
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Aggressive change</span>
              <span className="text-orange-500 font-semibold">
                0.8 - 1.2 %/week
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Severe change</span>
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

        <p className="text-xs md:text-sm text-muted italic">
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
