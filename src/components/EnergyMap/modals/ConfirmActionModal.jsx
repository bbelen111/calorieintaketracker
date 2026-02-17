import React from 'react';
import { ModalShell } from '../common/ModalShell';

const getConfirmStyles = (tone) => {
  if (tone === 'danger') {
    return 'bg-accent-red active:bg-accent-red/80 text-white press-feedback focus-ring md:hover:bg-accent-red/90';
  }
  if (tone === 'success') {
    return 'bg-accent-green active:bg-accent-green/80 text-white press-feedback focus-ring md:hover:bg-accent-green/90';
  }
  return 'bg-blue-600 active:bg-blue-700 text-white press-feedback focus-ring md:hover:bg-blue-500';
};

export const ConfirmActionModal = ({
  isOpen,
  isClosing,
  title = 'Confirm Action',
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  onConfirm,
  onCancel,
}) => {
  const confirmClasses = getConfirmStyles(tone);

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      overlayClassName="bg-black/80 z-[90]"
      contentClassName="p-6 w-full max-w-md"
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <h3 className="text-foreground font-bold text-xl text-center">
            {title}
          </h3>
          {description ? (
            <p className="text-muted text-sm text-center leading-relaxed">
              {description}
            </p>
          ) : null}
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 bg-surface-highlight active:bg-surface-highlight/80 text-foreground px-4 py-3 rounded-lg transition-all active:scale-95 press-feedback focus-ring md:hover:bg-surface-highlight"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 px-4 py-3 rounded-lg transition-all active:scale-95 ${confirmClasses}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </ModalShell>
  );
};
