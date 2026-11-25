import React from 'react';
import { Info, X } from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';
import { useUnits } from '../../../../hooks/useUnits';

/**
 * Read-only explainer for the heart-rate model the calorie system uses.
 */
export const HeartRateZonesInfoModal = ({ isOpen, isClosing, onClose }) => {
  const units = useUnits();

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      onClose={onClose}
      contentClassName="p-6 max-w-lg w-full"
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <Info size={28} className="text-accent-blue" />
          <h3 className="text-foreground font-bold text-xl">
            Heart-rate zones
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted md:hover:text-foreground transition-colors focus-ring"
          aria-label="Close heart-rate zones info"
        >
          <X size={20} />
        </button>
      </div>

      <div className="space-y-4 text-muted">
        <p>
          <span className="font-bold text-foreground">Heart-rate zones</span>{' '}
          describe how hard your heart is working. The app uses them to refine
          what it already estimates, never to invent an all-day burn.
        </p>

        <div className="bg-surface-highlight/50 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2 text-foreground font-bold">
            <Info size={18} className="text-accent-blue" />
            <span>Max heart rate</span>
          </div>
          <p className="text-sm">
            Estimated from your age with the Tanaka formula (208 − 0.7 × age).
            If your recorded sessions show a higher peak, the higher value is
            used — peaks only ever raise it, because most people rarely reach
            their true maximum. You can also set it yourself in Settings.
          </p>
        </div>

        <div className="bg-accent-blue/10 border border-accent-blue/30 rounded-lg p-4">
          <p className="font-bold text-accent-blue mb-2">Personal zones</p>
          <p className="text-sm">
            Once you have 3 resting readings in two weeks, zones use your
            heart-rate reserve (Karvonen):{' '}
            <span className="text-foreground font-semibold">
              resting + % × (max − resting)
            </span>
            . That makes the same heart rate count as harder work for someone
            with a high resting rate than for someone with a low one. Until
            then, zones are a plain percentage of max.
          </p>
        </div>

        <div className="bg-accent-blue/10 border border-accent-blue/30 rounded-lg p-4 space-y-2">
          <p className="font-bold text-accent-blue">
            How it changes your numbers
          </p>
          <div className="text-sm space-y-2">
            <p>
              <span className="text-foreground font-semibold">EPOC:</span>{' '}
              after-burn intensity for heart-rate sessions is light below 40 %
              of reserve, moderate 40–59 %, vigorous 60 % and up (ACSM). That is
              why a session can sit in Zone 1 yet count as moderate.
            </p>
            <p>
              <span className="text-foreground font-semibold">Lifting:</span>{' '}
              new heart-rate lifting sessions let heart rate pick light /
              moderate / vigorous, and your training type keeps its{' '}
              {units.energy.unit} per hour. Straining spikes heart rate without
              burning matching energy, so lifting is not priced from heart rate
              directly.
            </p>
            <p>
              <span className="text-foreground font-semibold">Cardio:</span>{' '}
              heart-rate cardio uses the Keytel formula; with a VO2 max (from
              your watch or Settings) it uses Keytel&apos;s fitness-adjusted
              version.
            </p>
            <p>
              <span className="text-foreground font-semibold">
                Never changed:
              </span>{' '}
              BMR and your daily activity (NEAT) are not changed by heart rate.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface-highlight/40 px-3 py-2.5 text-xs space-y-1">
          <p className="text-foreground font-semibold">Resting heart rate:</p>
          <p>
            A lower resting rate is not automatically good news: a long calorie
            deficit, illness, alcohol, poor sleep and hard training all move it.
            The app shows changes without judging them.
          </p>
        </div>
      </div>

      <div className="mt-6">
        <button
          type="button"
          onClick={onClose}
          className="w-full bg-primary text-primary-foreground px-6 py-3 rounded-lg transition-all press-feedback focus-ring font-medium md:hover:brightness-110"
        >
          Got it
        </button>
      </div>
    </ModalShell>
  );
};
