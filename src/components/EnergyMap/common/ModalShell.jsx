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
let overlayHideTimeout = null;
let overlayShowTimeout = null;

function createSharedOverlay() {
  if (typeof document === 'undefined') return null;
  if (sharedOverlayNode) return sharedOverlayNode;

  const node = document.createElement('div');
  node.className = 'shared-modal-overlay fixed inset-0 bg-black';
  // start hidden
  node.style.opacity = '0';
  node.style.transition = `opacity ${OVERLAY_FADE_MS}ms ease-out`;
  node.style.pointerEvents = 'none'; // never intercept clicks
  node.style.willChange = 'opacity'; // optimize animation
  node.style.backfaceVisibility = 'hidden'; // prevent flicker on some devices
  node.style.transform = 'translateZ(0)'; // force GPU acceleration
  document.body.appendChild(node);
  sharedOverlayNode = node;
  return node;
}

function showSharedOverlay(belowZIndex) {
  const node = createSharedOverlay();
  if (!node) return;

  // Clear any pending hide timeout
  if (overlayHideTimeout) {
    clearTimeout(overlayHideTimeout);
    overlayHideTimeout = null;
  }

  // Clear any pending show timeout
  if (overlayShowTimeout) {
    clearTimeout(overlayShowTimeout);
    overlayShowTimeout = null;
  }

  // Set z-index immediately to prevent flickering
  node.style.zIndex = String(Math.max(0, (belowZIndex || BASE_Z_INDEX) - 1));

  // If already visible, just ensure it stays visible - no animation retrigger
  if (node.style.opacity === '0.7') {
    return;
  }

  // If opacity is transitioning (between 0 and 0.7), force it to target immediately
  // to prevent flicker when opening nested modals rapidly
  const currentOpacity = parseFloat(node.style.opacity);
  if (currentOpacity > 0 && currentOpacity < 0.7) {
    node.style.opacity = '0.7';
    return;
  }

  // Use single rAF for faster response when opening nested modals
  requestAnimationFrame(() => {
    if (node) node.style.opacity = '0.7';
  });
}

function updateSharedOverlayZ(belowZIndex) {
  if (!sharedOverlayNode) return;
  // Only update z-index if we're not mid-animation
  const newZIndex = String(Math.max(0, (belowZIndex || BASE_Z_INDEX) - 1));
  if (sharedOverlayNode.style.zIndex !== newZIndex) {
    sharedOverlayNode.style.zIndex = newZIndex;
  }
}

function hideSharedOverlayIfIdle() {
  if (!sharedOverlayNode) return;

  // Clear any pending timeouts
  if (overlayHideTimeout) {
    clearTimeout(overlayHideTimeout);
    overlayHideTimeout = null;
  }

  if (openModalCount > 0) {
    // still open modals, ensure overlay stays visible at correct z-index
    updateSharedOverlayZ(BASE_Z_INDEX + openModalCount);
    // Make sure it's visible
    if (sharedOverlayNode.style.opacity !== '0.7') {
      sharedOverlayNode.style.opacity = '0.7';
    }
    return;
  }

  // fade out then remove - but only if no modals opened during fade
  sharedOverlayNode.style.opacity = '0';
  overlayHideTimeout = setTimeout(() => {
    if (sharedOverlayNode && openModalCount === 0) {
      try {
        sharedOverlayNode.remove();
      } catch (err) {
        void err;
      }
      sharedOverlayNode = null;
    }
    overlayHideTimeout = null;
  }, OVERLAY_FADE_MS + 50);
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
    const myIndex = openModalCount;

    // capture this modal's stack index
    modalIndexRef.current = myIndex;

    // Update state immediately to avoid flicker
    setModalIndex(myIndex);
    setZIndexValue(BASE_Z_INDEX + myIndex);

    // Notify other modals synchronously before showing overlay
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

    // Show overlay after state updates complete
    showSharedOverlay(BASE_Z_INDEX + myIndex);

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

      // Delay overlay update slightly to let closing animation start
      requestAnimationFrame(() => {
        hideSharedOverlayIfIdle();
      });

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
      // Update immediately for smooth nested modal transitions
      setStackCount(count);
      if (count > 0) updateSharedOverlayZ(BASE_Z_INDEX + count);
      else hideSharedOverlayIfIdle();
    };

    window.addEventListener('modalStackChange', wrapped);
    // Initialize stack count
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
        // visual dimming now comes from the shared overlay. Keep this
        // per-modal layer transparent. Only the topmost modal should
        // accept pointer events; underlying modals must not block them.
        isTopmost ? 'bg-transparent' : 'bg-transparent pointer-events-none'
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
