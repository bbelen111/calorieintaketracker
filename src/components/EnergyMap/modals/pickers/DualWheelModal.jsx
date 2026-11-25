import React, { useCallback, useState } from 'react';
import { Save } from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';
import { DualWheel } from '../../common/DualWheel';

// Mounted by `ModalShell` only while open, so the draft starts from `value` on
// every open.
const DualWheelBody = ({ value, config, preview, onCancel, onSave }) => {
  const toDraft = () => ({
    value,
    config,
    picked: Math.min(Math.max(Number(value) || 0, config.min), config.max),
  });
  const [state, setState] = useState(toDraft);
  // Render-phase reset when the owner hands in a different value.
  if (state.value !== value || state.config !== config) {
    setState(toDraft());
  }
  const draft = state.picked;
  const setDraft = useCallback(
    (picked) => setState((current) => ({ ...current, picked })),
    []
  );

  return (
    <>
      {preview ? (
        <p
          aria-live="polite"
          className="mb-2 text-center text-sm font-semibold text-foreground"
        >
          {preview(draft)}
        </p>
      ) : null}

      <DualWheel value={value} config={config} onChange={setDraft} />

      <div className="flex gap-3 mt-6">
        <button
          onClick={onCancel}
          type="button"
          className="flex-1 bg-surface-highlight active:bg-surface-highlight/80 text-foreground px-6 py-3 rounded-lg transition-all active:scale-95 font-medium focus-ring press-feedback"
        >
          Cancel
        </button>
        <button
          onClick={() => onSave?.(draft)}
          type="button"
          className="flex-1 bg-primary active:brightness-110 text-primary-foreground px-6 py-3 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-medium focus-ring press-feedback"
        >
          <Save size={20} />
          Save
        </button>
      </div>
    </>
  );
};

/**
 * A titled two-wheel picker sheet. `value` and the saved number are in the
 * units described by `config` (see `utils/units/wheelConfigs.js`).
 */
export const DualWheelModal = ({
  isOpen,
  isClosing,
  title,
  unitLabel,
  value,
  config,
  preview,
  onCancel,
  onSave,
}) => (
  <ModalShell
    isOpen={isOpen}
    isClosing={isClosing}
    onClose={onCancel}
    overlayClassName="z-85"
    contentClassName="p-6 w-full max-w-sm"
  >
    <h3 className="text-foreground font-bold text-xl mb-4 text-center">
      {title}
    </h3>
    {unitLabel ? (
      <p className="text-muted text-xs text-center mb-2 uppercase tracking-wide">
        {unitLabel}
      </p>
    ) : null}

    {config ? (
      <DualWheelBody
        value={value}
        config={config}
        preview={preview}
        onCancel={onCancel}
        onSave={onSave}
      />
    ) : null}
  </ModalShell>
);
