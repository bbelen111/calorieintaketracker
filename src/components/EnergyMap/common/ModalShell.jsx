import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

let openModalCount = 0;
let originalBodyOverflow = '';
let originalBodyPaddingRight = '';

// base z-index for modals; each modal instance will add its index so newer
// modals get a higher z-index and appear on top.
const BASE_Z_INDEX = 1000;

export const ModalShell = ({
  isOpen,
  isClosing,
  children,
  overlayClassName = '',
  contentClassName = '',
}) => {
  const modalIndexRef = useRef(0);
  const [zIndexValue, setZIndexValue] = useState(BASE_Z_INDEX);

  useEffect(() => {
    if (!isOpen) return undefined;

    const body = document.body;
    const scrollBarWidth =
      window.innerWidth - document.documentElement.clientWidth;

    openModalCount += 1;
    // capture this modal's stack index
    modalIndexRef.current = openModalCount;
    // update renderable z-index once we know our index
    setZIndexValue(BASE_Z_INDEX + modalIndexRef.current);

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

  const overlay = (
    <div
      style={{ zIndex: zIndexValue }}
      className={`modal-overlay fixed inset-0 !mt-0 bg-black/70 flex items-center justify-center p-4 ${
        isClosing ? 'closing' : ''
      } ${overlayClassName}`}
    >
      <div
        className={`modal-content bg-slate-800 rounded-2xl border border-slate-700 max-h-[90vh] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800 transition-[height,max-height] duration-300 ease-in-out ${
          isClosing ? 'closing' : ''
        } ${contentClassName}`}
      >
        {children}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
};
