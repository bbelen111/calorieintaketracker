import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

let openModalCount = 0;
let originalBodyOverflow = '';
let originalBodyPaddingRight = '';

// Base z-index for modals; each modal instance increments this to stay on top.
const BASE_Z_INDEX = 1000;
// No shared overlay singleton. Each modal now renders its own dim layer when
// it is topmost so the implementation stays simple.

export const ModalShell = ({
  isOpen,
  isClosing,
  children,
  overlayClassName = '',
  contentClassName = '',
}) => {
  const modalIndexRef = useRef(0);
  const [zIndexValue, setZIndexValue] = useState(BASE_Z_INDEX);
  // track current global stack count so we can know which modal is topmost
  const [stackCount, setStackCount] = useState(openModalCount);
  // persist our assigned index in state (avoid reading ref.current during render)
  const [modalIndex, setModalIndex] = useState(0);

  // The effect uses module-scoped mutable values (openModalCount, BASE_Z_INDEX,
  // etc.) intentionally and must not include them as dependencies. We purposely
  // avoid listing those mutable module-scoped values in deps because they are
  // updated outside React's render lifecycle; keep this comment as rationale
  // for future maintainers.
  useEffect(() => {
    if (!isOpen) return undefined;

    const body = document.body;
    const scrollBarWidth =
      window.innerWidth - document.documentElement.clientWidth;

    openModalCount += 1;
    const myIndex = openModalCount;

    // capture this modal's stack index
    modalIndexRef.current = myIndex;

    // Update state immediately to avoid flicker
    // eslint-disable-next-line
    setModalIndex(myIndex);
    setZIndexValue(BASE_Z_INDEX + myIndex);

    // Notify other modals synchronously so they can update stack state
    try {
      if (
        typeof window !== 'undefined' &&
        typeof window.CustomEvent === 'function'
      ) {
        window.dispatchEvent(
          new window.CustomEvent('modalStackChange', {
            detail: { count: openModalCount },
          })
        );
      }
    } catch (err) {
      void err;
    }
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

      try {
        if (
          typeof window !== 'undefined' &&
          typeof window.CustomEvent === 'function'
        ) {
          window.dispatchEvent(
            new window.CustomEvent('modalStackChange', {
              detail: { count: openModalCount },
            })
          );
        }
      } catch (err) {
        void err;
      }
      if (openModalCount === 0) {
        body.style.overflow = originalBodyOverflow;
        body.style.paddingRight = originalBodyPaddingRight;
      }
    };
  }, [isOpen]);

  // Listen for global stack changes so that non-top modals can re-render and
  // adjust pointer-interaction and dimming state appropriately.
  // This effect listens for a global CustomEvent and reads the module-scoped
  // `openModalCount`. Adding those to deps is incorrect because they are
  // mutated outside React's render lifecycle. Keep this explanation here for
  // maintainers who may otherwise try to add internal module variables to the
  // deps array.
  useEffect(() => {
    const wrapped = (e) => {
      const count = e?.detail?.count ?? 0;
      // Update immediately for smooth nested modal transitions
      setStackCount(count);
    };

    window.addEventListener('modalStackChange', wrapped);
    // Initialize stack count
    // eslint-disable-next-line
    setStackCount(openModalCount);
    return () => window.removeEventListener('modalStackChange', wrapped);
  }, []);

  if (!isOpen) return null;

  const isTopmost = modalIndex === stackCount;

  const shouldDimContent = !isTopmost && stackCount > 0;

  const overlay = (
    <div
      style={{
        zIndex: zIndexValue,
        // Hint to browser that this layer will have z-index changes
        isolation: 'isolate',
      }}
      className={`modal-overlay-wrapper fixed inset-0 !mt-0 ${
        // Only the topmost modal should intercept pointer events and dim the
        // background. Underlying modals stay transparent and click-through.
        isTopmost ? 'bg-black/70' : 'bg-transparent pointer-events-none'
      } flex items-center justify-center p-4 ${overlayClassName}`}
    >
      <div
        className={`modal-content relative bg-slate-800 rounded-2xl border border-slate-700 max-h-[90vh] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800 transition-[height,max-height] duration-300 ease-in-out ${
          isClosing ? 'closing' : ''
        } ${contentClassName}`}
        style={{ willChange: isClosing ? 'transform, opacity' : 'auto' }}
      >
        {shouldDimContent ? (
          <div
            className="pointer-events-none absolute inset-0 rounded-2xl bg-black/50"
            style={{
              // Instant transition when becoming dimmed (nested modal opens)
              // Smooth transition when un-dimming (nested modal closes)
              transition: shouldDimContent ? 'none' : 'opacity 200ms ease-out',
              opacity: shouldDimContent ? 1 : 0,
            }}
          />
        ) : null}
        {children}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
};
