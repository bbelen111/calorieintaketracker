import React from 'react';
import { Info, X } from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';

export const AdaptiveThermogenesisInfoModal = ({
  isOpen,
  isClosing,
  onClose,
}) => {
  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      contentClassName="p-6 max-w-lg w-full"
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <Info size={28} className="text-accent-blue" />
          <h3 className="text-foreground font-bold text-xl">
            Adaptive Thermogenesis
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted md:hover:text-foreground transition-colors focus-ring"
          aria-label="Close Adaptive Thermogenesis info"
        >
          <X size={20} />
        </button>
      </div>

      <div className="space-y-4 text-muted">
        <p>
          <span className="font-bold text-foreground">
            Adaptive Thermogenesis (AT)
          </span>{' '}
          applies a small correction to your final daily calorie estimate when
          your real-world response drifts from textbook expectations.
        </p>

        <div className="bg-surface-highlight/50 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2 text-foreground font-bold">
            <Info size={18} className="text-accent-blue" />
            <span>Where it applies</span>
          </div>
          <p className="text-sm">
            AT is applied at the{' '}
            <span className="text-foreground font-semibold">total TDEE</span>{' '}
            level only. It does not rewrite your BMR, cardio burn, or training
            burn inputs. Think of it as a calibration layer:
          </p>
          <p className="text-sm text-foreground font-semibold">
            baseline TDEE + AT correction = adjusted TDEE
          </p>
          <p className="text-xs">
            Corrections are bounded to keep things sane (up to ±300 kcal/day).
          </p>
        </div>

        <div className="bg-accent-blue/10 border border-accent-blue/30 rounded-lg p-4 space-y-2 text-sm">
          <p className="font-bold text-accent-blue">Crude mode (staged)</p>
          <p>
            Uses goal duration milestones with fixed corrections. It&apos;s
            fast, deterministic, and works even with sparse data.
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <span className="text-foreground font-semibold">Cut goals</span>{' '}
              increase adaptation over time (for example from about -50 toward
              larger negative corrections after multiple weeks).
            </li>
            <li>
              <span className="text-foreground font-semibold">
                Surplus goals
              </span>{' '}
              use smaller positive staged corrections.
            </li>
          </ul>
        </div>

        <div className="bg-accent-blue/10 border border-accent-blue/30 rounded-lg p-4 space-y-2 text-sm">
          <p className="font-bold text-accent-blue">Smart mode (data-driven)</p>
          <p>
            Compares expected body-mass change from recent energy balance vs the
            observed weight trend over roughly the last 28 days.
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Needs enough data before it activates (intake + weight logs).
            </li>
            <li>
              Small deviations are ignored via a noise floor so tiny daily
              fluctuations don&apos;t create noisy corrections.
            </li>
            <li>
              Includes confidence and quality checks before applying stronger
              adjustments.
            </li>
            <li>
              Optional smoothing can be enabled to stabilize noisy weight series
              before trend slope is calculated.
            </li>
          </ul>
        </div>

        <div className="bg-surface-highlight/50 rounded-lg p-4 text-sm space-y-2">
          <p className="text-foreground font-bold">Smart smoothing options</p>
          <p>
            When{' '}
            <span className="text-foreground font-semibold">
              Smooth weight signal
            </span>{' '}
            is enabled in Settings, Smart mode pre-processes weight points to
            reduce day-to-day noise.
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <span className="text-foreground font-semibold">EMA</span>{' '}
              (exponential) reacts faster to recent changes.
            </li>
            <li>
              <span className="text-foreground font-semibold">SMA</span>
              is steadier and more conservative.
            </li>
            <li>
              Window length is configurable from{' '}
              <span className="text-foreground font-semibold">3–14 days</span>.
            </li>
          </ul>
        </div>

        <div className="bg-surface-highlight/50 rounded-lg p-4 text-sm space-y-2">
          <p className="text-foreground font-bold">Practical guidance</p>
          <p>
            Use <span className="text-foreground font-semibold">Crude</span>{' '}
            when you want predictable behavior with minimal logging effort.
          </p>
          <p>
            Use <span className="text-foreground font-semibold">Smart</span>{' '}
            when you log consistently and want the model to adapt to your
            measured trend.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface-highlight/40 px-3 py-2.5 text-xs">
          <span className="text-foreground font-semibold">Note:</span> If your
          target changes after enabling AT, that&apos;s usually calibration
          doing its job—not random drift.
        </div>
      </div>

      <div className="mt-6">
        <button
          onClick={onClose}
          type="button"
          className="w-full bg-primary text-primary-foreground px-6 py-3 rounded-lg transition-all press-feedback focus-ring font-medium md:hover:brightness-110"
        >
          Got it
        </button>
      </div>
    </ModalShell>
  );
};
