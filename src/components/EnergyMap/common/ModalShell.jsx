import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';

// ============================================================================
// CONSTANTS
// ============================================================================

const BASE_Z_INDEX = 1000;
const OVERLAY_FADE_MS = 200;
const OVERLAY_FADE_BUFFER_MS = 50;
const OVERLAY_OPACITY = 0.7;
const OPACITY_COMPARISON_THRESHOLD = 0.01;

// ============================================================================
// MODAL STACK MANAGER (Replaces module-level state with a singleton class)
// ============================================================================

class ModalStackManager {
  constructor() {
    this.stack = new Set();
    this.nextIndex = 1;
    this.listeners = new Set();
  }

  register() {
    const index = this.nextIndex++;
    this.stack.add(index);
    this.notifyListeners();
    return index;
  }

  unregister(index) {
    this.stack.delete(index);
    this.notifyListeners();
  }

  getTopIndex() {
    return Math.max(...Array.from(this.stack), 0);
  }

  getCount() {
    return this.stack.size;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyListeners() {
    this.listeners.forEach((listener) => listener());
  }
}

// Singleton instance
const modalStackManager = new ModalStackManager();

// ============================================================================
// SHARED OVERLAY MANAGER
// ============================================================================

class SharedOverlayManager {
  constructor() {
    this.overlayNode = null;
    this.hideTimeoutId = null;
    this.showTimeoutId = null;
  }

  isServer() {
    return typeof document === 'undefined';
  }

  createOverlay() {
    if (this.isServer()) return null;
    if (this.overlayNode) return this.overlayNode;

    const node = document.createElement('div');
    node.className = 'shared-modal-overlay';
    node.style.cssText = `
      position: fixed;
      inset: 0;
      background-color: black;
      opacity: 0;
      transition: opacity ${OVERLAY_FADE_MS}ms ease-out;
      pointer-events: none;
      will-change: opacity;
      backface-visibility: hidden;
      transform: translateZ(0);
    `;

    document.body.appendChild(node);
    this.overlayNode = node;
    return node;
  }

  show(belowZIndex) {
    const node = this.createOverlay();
    if (!node) return;

    this.clearTimeouts();

    // Set z-index immediately
    node.style.zIndex = String(Math.max(0, belowZIndex - 1));

    const currentOpacity = parseFloat(node.style.opacity) || 0;

    // Already at target opacity
    if (
      Math.abs(currentOpacity - OVERLAY_OPACITY) < OPACITY_COMPARISON_THRESHOLD
    ) {
      return;
    }

    // Mid-transition - jump to target
    if (currentOpacity > 0 && currentOpacity < OVERLAY_OPACITY) {
      node.style.opacity = String(OVERLAY_OPACITY);
      return;
    }

    // Fade in
    requestAnimationFrame(() => {
      if (node) node.style.opacity = String(OVERLAY_OPACITY);
    });
  }

  updateZIndex(belowZIndex) {
    if (!this.overlayNode) return;
    const newZIndex = String(Math.max(0, belowZIndex - 1));
    if (this.overlayNode.style.zIndex !== newZIndex) {
      this.overlayNode.style.zIndex = newZIndex;
    }
  }

  hide(modalCount, topZIndex) {
    if (!this.overlayNode) return;

    this.clearTimeouts();

    if (modalCount > 0) {
      // Keep visible at correct z-index
      this.updateZIndex(topZIndex);
      const currentOpacity = parseFloat(this.overlayNode.style.opacity) || 0;
      if (
        Math.abs(currentOpacity - OVERLAY_OPACITY) >=
        OPACITY_COMPARISON_THRESHOLD
      ) {
        this.overlayNode.style.opacity = String(OVERLAY_OPACITY);
      }
      return;
    }

    // Fade out
    this.overlayNode.style.opacity = '0';

    this.hideTimeoutId = window.setTimeout(() => {
      if (this.overlayNode && modalCount === 0) {
        try {
          this.overlayNode.remove();
        } catch (err) {
          console.warn('Failed to remove overlay node:', err);
        }
        this.overlayNode = null;
      }
      this.hideTimeoutId = null;
    }, OVERLAY_FADE_MS + OVERLAY_FADE_BUFFER_MS);
  }

  clearTimeouts() {
    if (this.hideTimeoutId !== null) {
      clearTimeout(this.hideTimeoutId);
      this.hideTimeoutId = null;
    }
    if (this.showTimeoutId !== null) {
      clearTimeout(this.showTimeoutId);
      this.showTimeoutId = null;
    }
  }

  cleanup() {
    this.clearTimeouts();
    if (this.overlayNode) {
      try {
        this.overlayNode.remove();
      } catch (err) {
        console.warn('Failed to cleanup overlay node:', err);
      }
      this.overlayNode = null;
    }
  }
}

// Singleton instance
const overlayManager = new SharedOverlayManager();

// ============================================================================
// BODY SCROLL LOCK MANAGER
// ============================================================================

class BodyScrollLockManager {
  constructor() {
    this.lockCount = 0;
    this.originalOverflow = '';
    this.originalPaddingRight = '';
  }

  lock() {
    if (typeof document === 'undefined') return;

    this.lockCount++;

    if (this.lockCount === 1) {
      const body = document.body;
      const scrollBarWidth =
        window.innerWidth - document.documentElement.clientWidth;

      this.originalOverflow = body.style.overflow;
      this.originalPaddingRight = body.style.paddingRight;

      body.style.overflow = 'hidden';

      if (scrollBarWidth > 0) {
        body.style.paddingRight = `${scrollBarWidth}px`;
      }
    }
  }

  unlock() {
    if (typeof document === 'undefined') return;

    this.lockCount = Math.max(0, this.lockCount - 1);

    if (this.lockCount === 0) {
      const body = document.body;
      body.style.overflow = this.originalOverflow;
      body.style.paddingRight = this.originalPaddingRight;
    }
  }

  cleanup() {
    if (typeof document === 'undefined') return;
    if (this.lockCount > 0) {
      const body = document.body;
      body.style.overflow = this.originalOverflow;
      body.style.paddingRight = this.originalPaddingRight;
      this.lockCount = 0;
    }
  }
}

// Singleton instance
const scrollLockManager = new BodyScrollLockManager();

// ============================================================================
// MODAL SHELL COMPONENT
// ============================================================================

export const ModalShell = ({
  isOpen,
  isClosing = false,
  children,
  overlayClassName = '',
  contentClassName = '',
  onClose = null,
  closeOnEscape = true,
  closeOnOverlayClick = true,
}) => {
  const modalIndexRef = useRef(null);
  const overlayRef = useRef(null);
  const [isTopmost, setIsTopmost] = useState(false);
  const [shouldDimContent, setShouldDimContent] = useState(false);
  const contentRef = useRef(null);

  // Handle escape key
  useEffect(() => {
    if (!isOpen || !closeOnEscape || !onClose) return;

    const handleEscape = (e) => {
      if (e.key === 'Escape' && isTopmost) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, closeOnEscape, onClose, isTopmost]);

  // Focus trap
  useEffect(() => {
    if (!isOpen || !contentRef.current) return;

    const focusableElements = contentRef.current.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTab = (e) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          lastElement?.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === lastElement) {
          firstElement?.focus();
          e.preventDefault();
        }
      }
    };

    document.addEventListener('keydown', handleTab);

    // Focus first element after a brief delay to ensure modal is rendered
    const focusTimeout = setTimeout(() => {
      firstElement?.focus();
    }, 50);

    return () => {
      document.removeEventListener('keydown', handleTab);
      clearTimeout(focusTimeout);
    };
  }, [isOpen]);

  // Register modal and manage lifecycle
  useEffect(() => {
    if (!isOpen) return;

    const myIndex = modalStackManager.register();
    modalIndexRef.current = myIndex;

    const zIndex = BASE_Z_INDEX + myIndex;

    // Update z-index via direct DOM manipulation to avoid React render issues
    if (overlayRef.current) {
      overlayRef.current.style.zIndex = String(zIndex);
    }

    overlayManager.show(zIndex);
    scrollLockManager.lock();

    return () => {
      if (modalIndexRef.current !== null) {
        modalStackManager.unregister(modalIndexRef.current);
        modalIndexRef.current = null;
      }

      requestAnimationFrame(() => {
        const count = modalStackManager.getCount();
        const topIndex = modalStackManager.getTopIndex();
        overlayManager.hide(count, BASE_Z_INDEX + topIndex);
      });

      scrollLockManager.unlock();
    };
  }, [isOpen]);

  // Subscribe to modal stack changes
  useEffect(() => {
    const updateState = () => {
      const topIndex = modalStackManager.getTopIndex();
      const count = modalStackManager.getCount();
      const myIndex = modalIndexRef.current;

      if (myIndex !== null) {
        const amTopmost = myIndex === topIndex;
        setIsTopmost(amTopmost);
        setShouldDimContent(!amTopmost && count > 0);

        if (count > 0) {
          overlayManager.updateZIndex(BASE_Z_INDEX + topIndex);
        } else {
          overlayManager.hide(count, BASE_Z_INDEX + topIndex);
        }
      }
    };

    // Initial state
    updateState();

    // Subscribe to changes
    const unsubscribe = modalStackManager.subscribe(updateState);
    return unsubscribe;
  }, []);

  // Handle overlay click
  const handleOverlayClick = useCallback(
    (e) => {
      if (
        closeOnOverlayClick &&
        onClose &&
        isTopmost &&
        e.target === e.currentTarget
      ) {
        onClose();
      }
    },
    [closeOnOverlayClick, onClose, isTopmost]
  );

  if (!isOpen || typeof document === 'undefined') return null;

  const overlay = (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      style={{
        zIndex: BASE_Z_INDEX,
        isolation: 'isolate',
        pointerEvents: isTopmost ? 'auto' : 'none',
      }}
      className={`modal-overlay-wrapper fixed inset-0 !mt-0 bg-transparent flex items-center justify-center p-4 ${overlayClassName}`}
      onClick={handleOverlayClick}
    >
      <div
        ref={contentRef}
        className={`modal-content relative bg-slate-800 rounded-2xl border border-slate-700 max-h-[90vh] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800 transition-[height,max-height] duration-300 ease-in-out ${
          isClosing ? 'closing' : ''
        } ${contentClassName}`}
        style={{
          willChange: isClosing ? 'transform, opacity' : 'auto',
          pointerEvents: 'auto',
        }}
      >
        {shouldDimContent && (
          <div
            className="pointer-events-none absolute inset-0 rounded-2xl bg-black/50"
            style={{
              transition: shouldDimContent ? 'none' : 'opacity 200ms ease-out',
              opacity: shouldDimContent ? 1 : 0,
            }}
          />
        )}
        {children}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
};

ModalShell.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  isClosing: PropTypes.bool,
  children: PropTypes.node.isRequired,
  overlayClassName: PropTypes.string,
  contentClassName: PropTypes.string,
  onClose: PropTypes.func,
  closeOnEscape: PropTypes.bool,
  closeOnOverlayClick: PropTypes.bool,
};

// ============================================================================
// CLEANUP ON MODULE UNLOAD (for HMR/Fast Refresh)
// ============================================================================

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    overlayManager.cleanup();
    scrollLockManager.cleanup();
  });
}
