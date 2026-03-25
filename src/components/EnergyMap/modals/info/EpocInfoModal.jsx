import React from 'react';
import { Info, X } from 'lucide-react';
import {
  DEFAULT_CARRYOVER_HOURS,
  MAX_CARRYOVER_HOURS,
  CARRYOVER_HOURS_BY_INTENSITY,
} from '../../../../utils/epoc';
import { ModalShell } from '../../common/ModalShell';

export const EpocInfoModal = ({ isOpen, isClosing, onClose }) => {
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
            EPOC (Post-Exercise Burn)
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted md:hover:text-foreground transition-colors focus-ring"
          aria-label="Close EPOC info"
        >
          <X size={20} />
        </button>
      </div>

      <div className="space-y-4 text-muted">
        <p>
          <span className="font-bold text-foreground">
            EPOC (Excess Post-Exercise Oxygen Consumption)
          </span>
          is the extra energy your body burns for hours after exercise to
          recover and restore normal metabolic function. This
          &quot;afterburn&quot; effect adds to your daily calorie expenditure.
        </p>

        <div className="bg-surface-highlight/50 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2 text-foreground font-bold">
            <Info size={18} className="text-accent-blue" />
            <span>How it works</span>
          </div>
          <p className="text-sm">
            When EPOC is enabled, post-exercise calories are added to your TDEE
            on the day of the session. A portion also spills into the next
            day(s) based on the carryover window setting.
          </p>
          <p className="text-sm">
            The carryover window controls how long the EPOC effect can extend
            beyond the day of exercise, with higher values allowing longer
            afterburn contributions.
          </p>
        </div>

        <div className="bg-accent-blue/10 border border-accent-blue/30 rounded-lg p-4 space-y-2">
          <p className="font-bold text-accent-blue mb-2">
            Carryover intensity levels
          </p>
          <div className="text-sm space-y-2">
            <p>
              <span className="text-foreground font-semibold">Light</span>:{' '}
              {CARRYOVER_HOURS_BY_INTENSITY.light} hours baseline
            </p>
            <p>
              <span className="text-foreground font-semibold">Moderate</span>:{' '}
              {CARRYOVER_HOURS_BY_INTENSITY.moderate} hours baseline
            </p>
            <p>
              <span className="text-foreground font-semibold">Vigorous</span>:{' '}
              {CARRYOVER_HOURS_BY_INTENSITY.vigorous} hours baseline
            </p>
          </div>
          <p className="text-xs mt-3 pt-3 border-t border-accent-blue/20">
            The app starts with intensity-based carryover times, then adjusts
            based on session duration and your custom carryover window setting.
          </p>
        </div>

        <div className="bg-accent-blue/10 border border-accent-blue/30 rounded-lg p-4">
          <p className="font-bold text-accent-blue mb-2">
            Carryover window setting
          </p>
          <p className="text-sm">
            This setting (1–{MAX_CARRYOVER_HOURS} hours) acts as a cap on how
            long EPOC effects can carry forward. Higher values extend the
            afterburn period, while lower values limit it to just the day of
            exercise.
          </p>
          <p className="text-xs mt-2 text-foreground">
            Default: {DEFAULT_CARRYOVER_HOURS} hours
          </p>
        </div>

        <div className="bg-surface-highlight/50 rounded-lg p-4 text-sm space-y-2">
          <p className="text-foreground font-bold">Practical tips</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Use a lower value (1–3 hours) for conservative estimates.</li>
            <li>
              Use moderate values (6–12 hours) for typical training sessions.
            </li>
            <li>
              Use higher values (18–24 hours) if you do very intense or long
              sessions and want to account for extended recovery.
            </li>
          </ul>
        </div>

        <div className="rounded-lg border border-border bg-surface-highlight/40 px-3 py-2.5 text-xs space-y-1">
          <p className="text-foreground font-semibold">Note:</p>
          <p>
            EPOC is an estimate. Individual response varies based on fitness
            level, session intensity, duration, and recovery. Monitor your
            weight trends to see if this adjustment works for your situation.
          </p>
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
