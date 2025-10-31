import React, { useEffect } from 'react';

let openModalCount = 0;
let originalBodyOverflow = '';
let originalBodyPaddingRight = '';

export const ModalShell = ({
  isOpen,
  isClosing,
  children,
  overlayClassName = '',
  contentClassName = '',
}) => {
  useEffect(() => {
    if (!isOpen) return undefined;

    const body = document.body;
    const scrollBarWidth =
      window.innerWidth - document.documentElement.clientWidth;

    openModalCount += 1;

    if (openModalCount === 1) {
      originalBodyOverflow = body.style.overflow;
      originalBodyPaddingRight = body.style.paddingRight;

      body.style.overflow = 'hidden';

      if (scrollBarWidth > 0) {
        body.style.paddingRight = `${scrollBarWidth}px`;
      }
    }

    return () => {
      openModalCount = Math.max(openModalCount - 1, 0);

      if (openModalCount === 0) {
        body.style.overflow = originalBodyOverflow;
        body.style.paddingRight = originalBodyPaddingRight;
      }
    };
  }, [isOpen]);

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
