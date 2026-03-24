import React from 'react';
import {
  Info,
  TrendingUp,
  TrendingDown,
  Minus,
  X,
  CheckCircle2,
  AlertCircle,
  XCircle,
} from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';
import {
  calculateGoalAlignment,
  getGoalAlignedTextClass,
} from '../../../../utils/goalAlignment';
import { goals } from '../../../../constants/goals';

const TrendIcon = ({ direction }) => {
  if (direction === 'up') {
    return <TrendingUp size={20} />;
  }
  if (direction === 'down') {
    return <TrendingDown size={20} />;
  }
  return <Minus size={20} />;
};

const WEIGHT_GOAL_RANGES = {
  aggressive_bulk: '+0.5 to +1.0 kg/week',
  bulking: '+0.25 to +0.5 kg/week',
  maintenance: '-0.1 to +0.1 kg/week',
  cutting: '-0.5 to -0.25 kg/week',
  aggressive_cut: '-1.0 to -0.5 kg/week',
};

const getStatusVisual = (alignment) => {
  if (
    alignment === 'perfect' ||
    alignment === 'good' ||
    alignment === 'acceptable'
  ) {
    return {
      icon: <CheckCircle2 size={16} className="text-accent-green" />,
      textClass: 'text-accent-green',
    };
  }

  if (alignment === 'moderate') {
    return {
      icon: <AlertCircle size={16} className="text-accent-yellow" />,
      textClass: 'text-accent-yellow',
    };
  }

  if (alignment === 'poor') {
    return {
      icon: <AlertCircle size={16} className="text-accent-orange" />,
      textClass: 'text-accent-orange',
    };
  }

  if (alignment === 'very-poor') {
    return {
      icon: <XCircle size={16} className="text-accent-red" />,
      textClass: 'text-accent-red',
    };
  }

  return {
    icon: <Info size={16} className="text-accent-blue" />,
    textClass: 'text-muted',
  };
};

const toPrettyDescription = (description) => {
  if (!description) {
    return 'Track consistently to establish your trend.';
  }

  const lower = description.toLowerCase();
  if (lower.includes('opposite direction')) {
    return 'Moving in the opposite direction of your selected goal.';
  }
  if (lower.includes('too rapidly')) {
    return 'Progressing faster than target. Consider moderating calories.';
  }
  if (lower.includes('too slowly')) {
    return 'Progressing slower than target. Consider adjusting calories.';
  }
  if (lower.includes('just above target')) {
    return 'Slightly above target range.';
  }
  if (lower.includes('just below target')) {
    return 'Slightly below target range.';
  }

  return `${description}.`;
};

export const WeightTrendInfoModal = ({
  isOpen,
  isClosing,
  trend,
  selectedGoal = 'maintenance',
  onClose,
}) => {
  const safeTrend =
    trend && Number.isFinite(trend.weeklyRate)
      ? trend
      : {
          label: 'No data yet',
          weeklyRate: 0,
          direction: 'flat',
          sampleRange: [],
        };

  const getTrendColor = () => {
    if (
      safeTrend.label === 'Need more data' ||
      safeTrend.label === 'No data yet'
    ) {
      return 'text-foreground';
    }
    return getGoalAlignedTextClass(safeTrend, selectedGoal, 'weight');
  };

  const alignment = calculateGoalAlignment(
    safeTrend.weeklyRate,
    selectedGoal,
    'weight'
  );
  const statusVisual = getStatusVisual(alignment.alignment);
  const targetRate =
    WEIGHT_GOAL_RANGES[selectedGoal] || WEIGHT_GOAL_RANGES.maintenance;

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
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
              The trend compares the earliest and latest entries in the chosen
              window (anchored to your latest weigh-in) and converts that change
              into a{' '}
              <span className="text-accent-blue font-semibold">
                weekly rate of change
              </span>
              . If a window has fewer than two points, the app falls back to
              your latest two entries so a trend can still be shown. Longer
              windows are smoother; shorter windows emphasize recent changes.
            </p>
            <p>
              This is a trend estimate, not a day-to-day verdict—normal scale
              noise (water, food volume, glycogen) can mask real progress in the
              short term.
            </p>
          </div>
        </div>

        <div className="bg-accent-blue/15 border border-accent-blue/50 rounded-lg p-4">
          <p className="font-bold text-accent-blue mb-3">Your Current Trend:</p>
          <div className="flex items-center gap-3 mb-3">
            <span
              className={`${getTrendColor()} font-semibold text-lg flex items-center gap-2`}
            >
              <TrendIcon direction={safeTrend.direction} />
              {safeTrend.label}
            </span>
          </div>
          <div className="text-sm space-y-1">
            <p>
              Weekly Rate:{' '}
              <span className="text-foreground font-semibold">
                {safeTrend.weeklyRate >= 0 ? '+' : ''}
                {safeTrend.weeklyRate.toFixed(2)} kg/week
              </span>
            </p>
            <p>
              Data Points:{' '}
              <span className="text-foreground font-semibold">
                {safeTrend.sampleRange?.length || 0} entries
              </span>
            </p>
            {safeTrend.sampleRange && safeTrend.sampleRange.length >= 2 && (
              <p>
                Period:{' '}
                <span className="text-foreground font-semibold">
                  {safeTrend.sampleRange[0].date} to{' '}
                  {safeTrend.sampleRange[safeTrend.sampleRange.length - 1].date}
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
                {targetRate}
              </span>
            </p>
            <p>
              Your current rate:{' '}
              <span className={`${getTrendColor()} font-semibold`}>
                {safeTrend.weeklyRate >= 0 ? '+' : ''}
                {safeTrend.weeklyRate.toFixed(2)} kg/week
              </span>
            </p>
            <div className="mt-3 pt-3 border-t border-accent-emerald/30">
              <div className="flex items-center gap-3">
                <span className="flex-shrink-0">{statusVisual.icon}</span>
                <p className={statusVisual.textClass}>
                  {toPrettyDescription(alignment.description)}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-surface-highlight/80 border border-border rounded-lg p-4 space-y-2">
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
          <p className="text-accent-yellow font-semibold mb-2">
            Important Notes
          </p>
          <ul className="space-y-1 list-disc list-inside text-foreground/90">
            <li>
              Weight naturally fluctuates daily due to hydration, sodium, and
              food mass
            </li>
            <li>More data points produce more reliable trend estimates</li>
            <li>
              Compare your trend to your goal&apos;s target rate instead of
              single daily weigh-ins
            </li>
            <li>Very aggressive rates are often harder to sustain long-term</li>
          </ul>
        </div>

        <div className="rounded-lg border border-border bg-surface-highlight/40 px-3 py-2.5 text-xs md:text-sm">
          <span className="text-foreground font-semibold">Tip:</span> Track your
          weight at a consistent time and condition (e.g., morning, after
          bathroom, before food) for cleaner trends.
        </div>
      </div>

      <div className="mt-6">
        <button
          onClick={onClose}
          type="button"
          className="w-full bg-primary text-primary-foreground px-6 py-3 rounded-lg md:hover:brightness-110 transition-all press-feedback focus-ring"
        >
          Got it!
        </button>
      </div>
    </ModalShell>
  );
};
