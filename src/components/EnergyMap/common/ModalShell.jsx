import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

let openModalCount = 0;
let originalBodyOverflow = '';
let originalBodyPaddingRight = '';

// Shared overlay singleton node and helpers. Using a single DOM node for the
// dimming backdrop avoids creating/removing multiple background layers when
// stacking modals which prevents cumulative darkening and flicker.
let sharedOverlayNode = null;
const OVERLAY_FADE_MS = 200;

function createSharedOverlay() {
  if (typeof document === 'undefined') return null;
  if (sharedOverlayNode) return sharedOverlayNode;

  const node = document.createElement('div');
  node.className = 'shared-modal-overlay fixed inset-0 bg-black';
  // start hidden
  node.style.opacity = '0';
  node.style.transition = `opacity ${OVERLAY_FADE_MS}ms ease`;
  node.style.pointerEvents = 'auto';
  document.body.appendChild(node);
  sharedOverlayNode = node;
  return node;
}

function showSharedOverlay(belowZIndex) {
  const node = createSharedOverlay();
  if (!node) return;
  // place it underneath the top modal
  node.style.zIndex = String(Math.max(0, (belowZIndex || BASE_Z_INDEX) - 1));
  // ensure it's visible (defer to next frame for transition)
  requestAnimationFrame(() => {
    node.style.opacity = '0.7';
  });
}

function updateSharedOverlayZ(belowZIndex) {
  if (!sharedOverlayNode) return;
  sharedOverlayNode.style.zIndex = String(
    Math.max(0, (belowZIndex || BASE_Z_INDEX) - 1)
  );
}

function hideSharedOverlayIfIdle() {
  if (!sharedOverlayNode) return;
  if (openModalCount > 0) {
    // still open modals, update z-index to current top
    updateSharedOverlayZ(BASE_Z_INDEX + openModalCount);
    return;
  }

  // fade out then remove
  sharedOverlayNode.style.opacity = '0';
  setTimeout(() => {
    if (sharedOverlayNode && openModalCount === 0) {
      try {
        sharedOverlayNode.remove();
      } catch (err) {
        void err;
      }
      sharedOverlayNode = null;
    }
  }, OVERLAY_FADE_MS + 20);
}

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
  // track current global stack count so we can know which modal is topmost
  const [stackCount, setStackCount] = useState(openModalCount);
  // persist our assigned index in state (avoid reading ref.current during render)
  const [modalIndex, setModalIndex] = useState(0);

  useEffect(() => {
    if (!isOpen) return undefined;

    const body = document.body;
    const scrollBarWidth =
      window.innerWidth - document.documentElement.clientWidth;

    openModalCount += 1;
    // capture this modal's stack index
    modalIndexRef.current = openModalCount;
    // schedule state update to avoid synchronous setState inside effect
    setTimeout(() => setModalIndex(openModalCount), 0);
    // update renderable z-index once we know our index
    setZIndexValue(BASE_Z_INDEX + modalIndexRef.current);

    // notify other modal instances about the new stack count so they can
    // re-render and hide their overlays if they are not topmost. We use a
    // CustomEvent so we don't need a global state library.
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

    // ensure the single shared overlay exists and sits underneath the new
    // topmost modal. This prevents multiple overlays stacking and reduces
    // flicker when opening/closing nested modals.
    showSharedOverlay(BASE_Z_INDEX + modalIndexRef.current);

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

      // update or hide the shared overlay now that one modal closed
      hideSharedOverlayIfIdle();

      if (openModalCount === 0) {
        body.style.overflow = originalBodyOverflow;
        body.style.paddingRight = originalBodyPaddingRight;
      }
    };
  }, [isOpen]);

  // Listen for global stack changes so that non-top modals can re-render and
  // avoid rendering an additional overlay that would otherwise darken the
  // background cumulatively.
  useEffect(() => {
    const wrapped = (e) => {
      const count = e?.detail?.count ?? 0;
      setStackCount(count);
      if (count > 0) updateSharedOverlayZ(BASE_Z_INDEX + count);
      else hideSharedOverlayIfIdle();
    };

    window.addEventListener('modalStackChange', wrapped);
    // initialize to current value (defer to avoid sync setState in effect)
    setTimeout(() => setStackCount(openModalCount), 0);
    return () => window.removeEventListener('modalStackChange', wrapped);
  }, []);

  if (!isOpen) return null;

  const isTopmost = modalIndex === stackCount;

  const overlay = (
    <div
      style={{ zIndex: zIndexValue }}
      className={`modal-overlay fixed inset-0 !mt-0 ${
        // visual dimming now comes from the shared overlay. Keep this
        // per-modal layer transparent. Only the topmost modal should
        // accept pointer events; underlying modals must not block them.
        isTopmost ? 'bg-transparent' : 'bg-transparent pointer-events-none'
      } flex items-center justify-center p-4 ${isClosing ? 'closing' : ''} ${overlayClassName}`}
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
