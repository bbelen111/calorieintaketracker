import React from 'react';
import { ModalShell } from '../common/ModalShell';

const getConfirmStyles = (tone) => {
  if (tone === 'danger') {
    return 'bg-red-600 hover:bg-red-500 active:bg-red-700 text-white';
  }
  if (tone === 'success') {
    return 'bg-green-600 hover:bg-green-500 active:bg-green-700 text-white';
  }
  return 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white';
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
  onCancel
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
          <h3 className="text-white font-bold text-xl text-center">{title}</h3>
          {description ? (
            <p className="text-slate-300 text-sm text-center leading-relaxed">{description}</p>
          ) : null}
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-white px-4 py-3 rounded-lg transition-all active:scale-95"
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
