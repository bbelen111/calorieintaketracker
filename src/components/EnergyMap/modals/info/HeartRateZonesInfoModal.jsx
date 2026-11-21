import React from 'react';
import { HeartPulse } from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';

/**
 * Read-only explainer for the heart-rate model the calorie system uses.
 */
export const HeartRateZonesInfoModal = ({ isOpen, isClosing, onClose }) => (
  <ModalShell
    isOpen={isOpen}
    isClosing={isClosing}
    onClose={onClose}
    contentClassName="w-full md:max-w-lg p-6"
  >
    <div className="flex items-center gap-3 mb-4">
      <HeartPulse size={28} className="text-accent-red" />
      <h3 className="text-foreground font-bold text-xl">Heart-rate zones</h3>
    </div>

    <div className="space-y-4 text-sm text-foreground/90 leading-relaxed">
      <section>
        <p className="font-semibold text-foreground mb-1">Max heart rate</p>
        <p className="text-muted">
          Estimated from your age with the Tanaka formula (208 − 0.7 × age). If
          your recorded sessions show a higher peak, the higher value is used —
          peaks only ever raise it, because most people rarely reach their true
          maximum. You can also set it yourself in Settings.
        </p>
      </section>

      <section>
        <p className="font-semibold text-foreground mb-1">Personal zones</p>
        <p className="text-muted">
          Once you have 3 resting readings in two weeks, zones use your
          heart-rate reserve (Karvonen): resting + % × (max − resting). That
          makes the same heart rate count as harder work for someone with a high
          resting rate than for someone with a low one. Until then, zones are a
          plain percentage of max.
        </p>
      </section>

      <section>
        <p className="font-semibold text-foreground mb-1">
          How it changes your numbers
        </p>
        <ul className="text-muted list-disc pl-5 space-y-1">
          <li>
            EPOC (after-burn) intensity for heart-rate sessions: light below 40
            % of reserve, moderate 40–59 %, vigorous 60 % and up (ACSM). That is
            why a session can sit in Zone 1 yet count as moderate.
          </li>
          <li>
            New heart-rate lifting sessions: heart rate picks light / moderate /
            vigorous, and your training type keeps its kcal per hour. Straining
            spikes heart rate without burning matching energy, so lifting is not
            priced from heart rate directly.
          </li>
          <li>
            Heart-rate cardio uses the Keytel formula; with a VO2 max (from your
            watch or Settings) it uses Keytel&apos;s fitness-adjusted version.
          </li>
          <li>
            BMR and your daily activity (NEAT) are never changed by heart rate.
          </li>
        </ul>
      </section>

      <section>
        <p className="font-semibold text-foreground mb-1">Resting heart rate</p>
        <p className="text-muted">
          A lower resting rate is not automatically good news: a long calorie
          deficit, illness, alcohol, poor sleep and hard training all move it.
          The app shows changes without judging them.
        </p>
      </section>
    </div>

    <button
      type="button"
      onClick={onClose}
      className="mt-6 w-full bg-primary text-primary-foreground px-6 py-3 rounded-lg font-medium focus-ring press-feedback"
    >
      Got it
    </button>
  </ModalShell>
);
