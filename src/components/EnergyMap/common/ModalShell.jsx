import React from 'react';

export const ModalShell = ({
  isOpen,
  isClosing,
  children,
  overlayClassName = '',
  contentClassName = ''
}) => {
  if (!isOpen) return null;

  return (
    <div
      className={`modal-overlay fixed inset-0 !mt-0 bg-black/70 flex items-center justify-center z-50 p-4 ${
        isClosing ? 'closing' : ''
      } ${overlayClassName}`}
    >
      <div
        className={`modal-content bg-slate-800 rounded-2xl border border-slate-700 max-h-[90vh] overflow-y-auto ${
          isClosing ? 'closing' : ''
        } ${contentClassName}`}
      >
        {children}
      </div>
    </div>
  );
};
