import React from 'react';
import { AlertCircle, ScanBarcode } from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';

export const BarcodeEntryModal = ({
  isOpen,
  isClosing,
  value,
  error,
  isSubmitting,
  onValueChange,
  onSubmit,
  onClose,
}) => {
  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      contentClassName="w-full md:max-w-md p-5"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent-indigo/20 text-accent-indigo flex items-center justify-center">
            <ScanBarcode size={16} />
          </div>
          <div>
            <h3 className="text-foreground font-bold text-lg">Enter Barcode</h3>
            <p className="text-muted text-xs">
              Manual fallback for web and scan retries.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted" htmlFor="manual-barcode-input">
            UPC / EAN
          </label>
          <input
            id="manual-barcode-input"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={value}
            onChange={(event) => onValueChange?.(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                onSubmit?.();
              }
            }}
            placeholder="e.g. 012345678905"
            className="w-full bg-surface-highlight border border-border rounded-lg px-3 py-2.5 text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent-blue focus-ring"
          />
        </div>

        {error ? (
          <div className="bg-accent-red/10 border border-accent-red/30 rounded-lg px-3 py-2 text-accent-red text-xs flex items-start gap-2">
            <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-3 py-2 rounded-lg border border-border bg-surface-highlight text-foreground md:hover:bg-surface press-feedback focus-ring"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isSubmitting}
            className="flex-1 px-3 py-2 rounded-lg bg-accent-blue text-primary-foreground md:hover:brightness-110 press-feedback focus-ring disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Looking up…' : 'Find Food'}
          </button>
        </div>
      </div>
    </ModalShell>
  );
};
