import React from 'react';
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  Info,
  Scale,
  X,
} from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';

export const RollingEnergyBalanceInfoModal = ({
  isOpen,
  isClosing,
  onClose,
}) => (
  <ModalShell
    isOpen={isOpen}
    isClosing={isClosing}
    contentClassName="p-6 max-w-lg w-full"
  >
    <div className="flex items-start justify-between gap-4 mb-4">
      <div className="flex items-center gap-3">
        <Info size={28} className="text-accent-blue" />
        <h3 className="text-foreground font-bold text-xl">
          Rolling Energy Balance
        </h3>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close Rolling Energy Balance info"
        className="text-muted md:hover:text-foreground transition-colors focus-ring"
      >
        <X size={20} />
      </button>
    </div>

    <div className="space-y-4 text-muted">
      <p>
        Rolling Energy Balance shows how your logged energy intake compares with
        your estimated total daily energy expenditure across a recent window. It
        helps reveal the pattern behind individual days.
      </p>

      <div className="rounded-lg bg-surface-highlight/50 p-4 space-y-3">
        <div className="flex items-center gap-2 text-foreground font-bold">
          <BarChart3 size={18} className="text-accent-blue" />
          <span>How the balance is calculated</span>
        </div>
        <p className="text-sm">
          Each valid day uses the snapshot values already calculated by the app:
        </p>
        <p className="rounded-md bg-background px-3 py-2 text-sm text-foreground font-semibold">
          TDEE - intake = daily balance
        </p>
        <p className="text-xs">
          A positive balance means a deficit (more energy burned than eaten). A
          negative balance means a surplus.
        </p>
      </div>

      <div className="rounded-lg border border-accent-blue/30 bg-accent-blue/10 p-4 space-y-2 text-sm">
        <div className="flex items-center gap-2 text-accent-blue font-bold">
          <CalendarDays size={17} />
          <span>Windows and missing days</span>
        </div>
        <p>
          Choose a 3, 7, 14, or 28-day window. The calculation keeps the most
          recent valid logged days up to that limit and excludes future dates.
        </p>
        <p>
          Days without a trustworthy snapshot are unavailable, not treated as
          zero intake or zero deficit. If fewer days are available than the
          selected window, the result is marked as incomplete.
        </p>
      </div>

      <div className="rounded-lg border border-accent-emerald/30 bg-accent-emerald/10 p-4 space-y-2 text-sm">
        <div className="flex items-center gap-2 text-accent-emerald font-bold">
          <Scale size={17} />
          <span>Reading the estimate</span>
        </div>
        <p>
          The total balance is also converted to an approximate weight change
          using 7,700 kcal per kilogram. This is a clearly labelled energy
          equivalent, not a prediction. Water, glycogen, food volume, and other
          factors affect scale weight.
        </p>
        <p>Near zero means a daily balance within 50 kcal of maintenance.</p>
      </div>

      <div className="rounded-lg border border-accent-yellow/40 bg-accent-yellow/10 p-4 text-xs md:text-sm">
        <div className="flex items-start gap-2">
          <AlertTriangle
            size={16}
            className="mt-0.5 shrink-0 text-accent-yellow"
          />
          <p>
            Treat the rolling view as a trend signal, not a verdict on one day.
            Consistent logging produces a more useful picture, and the goal
            comparison is only shown when a daily balance target exists.
          </p>
        </div>
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
