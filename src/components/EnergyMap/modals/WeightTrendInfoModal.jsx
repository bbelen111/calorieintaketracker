import React from 'react';
import { Info, TrendingUp, TrendingDown, Minus, X, CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';
import { getGoalAlignedTextClass } from '../../../utils/goalAlignment';
import { goals } from '../../../constants/goals';

// Move TrendIcon outside of component to avoid recreating during render
const TrendIcon = ({ direction }) => {
  if (direction === 'up') {
    return <TrendingUp size={20} />;
  }
  if (direction === 'down') {
    return <TrendingDown size={20} />;
  }
  return <Minus size={20} />;
};

export const WeightTrendInfoModal = ({ isOpen, isClosing, trend, selectedGoal = 'maintenance', onClose }) => {
  const getTrendColor = () => {
    if (!trend || trend.label === 'Need more data' || trend.label === 'No data yet') {
      return 'text-foreground';
    }
    return getGoalAlignedTextClass(trend, selectedGoal, 'weight');
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
          <Info size={28} className="text-accent-blue" />
          <h3 className="text-foreground font-bold text-xl">Weight Trends</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted md:hover:text-foreground transition-colors focus-ring"
        >
          <X size={20} />
        </button>
      </div>

      <div className="space-y-4 text-muted">
        <p>
          Your weight trend is calculated by analyzing your recent weight
          entries to determine the rate and direction of change over time.
        </p>

        <div className="bg-surface-highlight/50 rounded-lg p-4">
          <p className="font-bold text-foreground mb-2">
            How We Calculate Your Trend:
          </p>
          <div className="text-sm space-y-2">
            <p>
              We analyze your weight entries over a{' '}
              <span className="text-accent-blue font-semibold">
                selectable time window
              </span>{' '}
              (30 days, 90 days, 6 months, or all available data).
            </p>
            <p>
              The trend compares your earliest and latest weights in the
              selected window to calculate your{' '}
              <span className="text-accent-blue font-semibold">
                weekly rate of change
              </span>
              . Longer timeframes provide more stable trends, while shorter
              windows highlight recent progress.
            </p>
          </div>
        </div>

        <div className="bg-accent-blue/15 border border-accent-blue/50 rounded-lg p-4">
          <p className="font-bold text-accent-blue mb-3">Your Current Trend:</p>
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
                {trend.weeklyRate.toFixed(2)} kg/week
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

        <div className="bg-accent-emerald/15 border border-accent-emerald/50 rounded-lg p-4">
          <p className="font-bold text-accent-emerald mb-3">Goal Alignment:</p>
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
                  ? '+0.5 to +1.0 kg/week'
                  : selectedGoal === 'bulking'
                    ? '+0.25 to +0.5 kg/week'
                    : selectedGoal === 'maintenance'
                      ? '-0.1 to +0.1 kg/week'
                      : selectedGoal === 'cutting'
                        ? '-0.5 to -0.25 kg/week'
                        : '-1.0 to -0.5 kg/week'}
              </span>
            </p>
            <p>
              Your current rate:{' '}
              <span className={`${getTrendColor()} font-semibold`}>
                {trend.weeklyRate >= 0 ? '+' : ''}
                {trend.weeklyRate.toFixed(2)} kg/week
              </span>
            </p>
            <div className="mt-3 pt-3 border-t border-accent-emerald/30">
              <div className="flex items-center gap-3">
                <span className="flex-shrink-0">
                  {(() => {
                    const rate = trend.weeklyRate;
                    const absRate = Math.abs(rate);

                    if (selectedGoal === 'maintenance') {
                      if (absRate <= 0.1) return <CheckCircle2 size={16} className="text-accent-green" />;
                      if (absRate <= 0.25) return <AlertCircle size={16} className="text-accent-yellow" />;
                      return <XCircle size={16} className="text-accent-red" />;
                    }

                    const isGain = selectedGoal.includes('bulk');
                    const isCut = selectedGoal.includes('cut');
                    const movingRight = rate > 0.1;
                    const movingWrong = (isGain && rate < -0.1) || (isCut && rate > 0.1);

                    if (movingWrong) return <XCircle size={16} className="text-accent-red" />;

                    if (selectedGoal === 'aggressive_bulk') {
                      if (rate >= 0.5 && rate <= 1.0) return <CheckCircle2 size={16} className="text-accent-green" />;
                      if (rate < 0.5) return <AlertCircle size={16} className="text-accent-yellow" />;
                      return <AlertCircle size={16} className="text-accent-yellow" />;
                    }

                    if (selectedGoal === 'bulking') {
                      if (rate >= 0.25 && rate <= 0.5) return <CheckCircle2 size={16} className="text-accent-green" />;
                      if (rate < 0.25) return <AlertCircle size={16} className="text-accent-yellow" />;
                      return <AlertCircle size={16} className="text-accent-yellow" />;
                    }

                    if (selectedGoal === 'cutting') {
                      if (rate <= -0.25 && rate >= -0.5) return <CheckCircle2 size={16} className="text-accent-green" />;
                      if (rate > -0.25) return <AlertCircle size={16} className="text-accent-yellow" />;
                      return <AlertCircle size={16} className="text-accent-orange" />;
                    }

                    if (selectedGoal === 'aggressive_cut') {
                      if (rate <= -0.5 && rate >= -1.0) return <CheckCircle2 size={16} className="text-accent-green" />;
                      if (rate > -0.5) return <AlertCircle size={16} className="text-accent-yellow" />;
                      return <AlertCircle size={16} className="text-accent-orange" />;
                    }

                    return <AlertCircle size={16} className="text-accent-slate" />;
                  })()}
                </span>
                <p className={(() => {
                    const rate = trend.weeklyRate;
                    const absRate = Math.abs(rate);

                    if (selectedGoal === 'maintenance') {
                      if (absRate <= 0.1) return 'text-accent-green';
                      if (absRate <= 0.25) return 'text-accent-yellow';
                      return 'text-accent-red';
                    }

                    const isGain = selectedGoal.includes('bulk');
                    const isCut = selectedGoal.includes('cut');
                    const movingWrong = (isGain && rate < -0.1) || (isCut && rate > 0.1);

                    if (movingWrong) return 'text-accent-red';

                    if (selectedGoal === 'aggressive_bulk') {
                      if (rate >= 0.5 && rate <= 1.0) return 'text-accent-green';
                      if (rate < 0.5) return 'text-accent-yellow';
                      return 'text-accent-yellow';
                    }

                    if (selectedGoal === 'bulking') {
                      if (rate >= 0.25 && rate <= 0.5) return 'text-accent-green';
                      if (rate < 0.25) return 'text-accent-yellow';
                      return 'text-accent-yellow';
                    }

                    if (selectedGoal === 'cutting') {
                      if (rate <= -0.25 && rate >= -0.5) return 'text-accent-green';
                      if (rate > -0.25) return 'text-accent-yellow';
                      return 'text-accent-orange';
                    }

                    if (selectedGoal === 'aggressive_cut') {
                      if (rate <= -0.5 && rate >= -1.0) return 'text-accent-green';
                      if (rate > -0.5) return 'text-accent-yellow';
                      return 'text-accent-orange';
                    }

                    return 'text-muted';
                  })()}>
                  {(() => {
                    const rate = trend.weeklyRate;
                    const absRate = Math.abs(rate);

                    if (selectedGoal === 'maintenance') {
                      if (absRate <= 0.1) return 'Perfect! You\'re maintaining your weight.';
                      if (absRate <= 0.25) return 'Slightly off track, but close to maintenance.';
                      return 'Significant deviation from maintenance goal.';
                    }

                    const isGain = selectedGoal.includes('bulk');
                    const isCut = selectedGoal.includes('cut');
                    const movingRight = rate > 0.1;
                    const movingWrong = (isGain && rate < -0.1) || (isCut && rate > 0.1);

                    if (movingWrong) return 'Moving in the opposite direction of your goal.';

                    if (selectedGoal === 'aggressive_bulk') {
                      if (rate >= 0.5 && rate <= 1.0) return 'Perfectly on track for aggressive bulk!';
                      if (rate < 0.5) return 'Gaining slower than target. Consider increasing calories.';
                      return 'Gaining faster than target. May accumulate excess fat.';
                    }

                    if (selectedGoal === 'bulking') {
                      if (rate >= 0.25 && rate <= 0.5) return 'Perfectly on track for lean bulk!';
                      if (rate < 0.25) return 'Gaining slower than target. Consider increasing calories.';
                      return 'Gaining faster than target. May accumulate excess fat.';
                    }

                    if (selectedGoal === 'cutting') {
                      if (rate <= -0.25 && rate >= -0.5) return 'Perfectly on track for moderate cut!';
                      if (rate > -0.25) return 'Losing slower than target. Consider reducing calories.';
                      return 'Losing faster than target. Risk of muscle loss.';
                    }

                    if (selectedGoal === 'aggressive_cut') {
                      if (rate <= -0.5 && rate >= -1.0) return 'Perfectly on track for aggressive cut!';
                      if (rate > -0.5) return 'Losing slower than target. Consider reducing calories.';
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
          <p className="text-foreground font-semibold text-sm uppercase tracking-wide">
            Trend Classifications
          </p>
          <div className="grid gap-2 text-xs md:text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted">Stable</span>
              <span className="text-accent-blue font-semibold">
                &lt; 0.1 kg/week
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Gradual change</span>
              <span className="text-accent-green font-semibold">
                0.1 - 0.45 kg/week
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Moderate change</span>
              <span className="text-accent-yellow font-semibold">
                0.45 - 0.8 kg/week
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Aggressive change</span>
              <span className="text-accent-orange font-semibold">
                0.8 - 1.2 kg/week
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Severe change</span>
              <span className="text-accent-red font-semibold">
                &gt; 1.2 kg/week
              </span>
            </div>
          </div>
        </div>

        <div className="bg-accent-yellow/15 border border-accent-yellow/50 rounded-lg p-4 text-xs md:text-sm">
          <p className="text-accent-yellow font-semibold mb-2">Important Notes</p>
          <ul className="space-y-1 list-disc list-inside text-foreground/90">
            <li>
              Weight fluctuates daily due to water, food, and other factors
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
          Tip: Track your weight consistently at the same time of day (e.g.,
          morning after waking) for more accurate trends.
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
