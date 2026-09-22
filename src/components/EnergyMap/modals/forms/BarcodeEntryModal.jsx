import React from 'react';
import { ScanBarcode } from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';

export const BarcodeEntryModal = ({
  isOpen,
  isClosing,
  value,
  isSubmitting,
  onValueChange,
  onSubmit,
  onClose,
}) => {
  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      allowKeyboardViewportResize
      contentClassName="w-full md:max-w-md p-0 overflow-hidden"
    >
      <div className="flex flex-col max-h-[86dvh] md:max-h-[32rem]">
        <div className="px-4 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent-indigo/20 text-accent-indigo flex items-center justify-center">
              <ScanBarcode size={16} />
            </div>
            <div>
              <h3 className="text-foreground font-bold text-lg">
                Enter Barcode
              </h3>
              <p className="text-muted text-xs">
                Manual fallback for web and scan retries.
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
          <div className="space-y-2">
            <label
              className="text-xs text-muted"
              htmlFor="manual-barcode-input"
            >
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
        </div>

        <div className="flex gap-2 px-4 py-3 border-t border-border bg-surface pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
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
