import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useLayoutEffect,
} from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { Capacitor } from '@capacitor/core';

// ============================================================================
// CONSTANTS
// ============================================================================

const BASE_Z_INDEX = 1000;
const OVERLAY_FADE_MS = 200;

// Overlay opacity configuration - increases with modal depth for visual hierarchy
const OVERLAY_BASE_OPACITY = 0.65; // Single modal backdrop
const OVERLAY_STACKED_INCREMENT = 0.12; // Additional darkness per nested modal
const OVERLAY_MAX_OPACITY = 0.92; // Cap to prevent complete blackout

const queueTask =
  typeof globalThis.queueMicrotask === 'function'
    ? globalThis.queueMicrotask
    : (cb) => Promise.resolve().then(cb);

/**
 * Calculate overlay opacity based on active modal count.
 * First modal gets base opacity, each additional modal increases darkness.
 */
const calculateOverlayOpacity = (activeCount) => {
  if (activeCount <= 0) return 0;
  if (activeCount === 1) return OVERLAY_BASE_OPACITY;

  // Progressive darkening: base + (increment * additional modals)
  const additionalModals = activeCount - 1;
  const calculatedOpacity =
    OVERLAY_BASE_OPACITY + OVERLAY_STACKED_INCREMENT * additionalModals;

  return Math.min(calculatedOpacity, OVERLAY_MAX_OPACITY);
};

// ============================================================================
// MODAL STACK MANAGER - Tracks all open modals with stable ordering
// ============================================================================

class ModalStackManager {
  constructor() {
    // Map of modalId -> { zIndex, isClosing }
    this.modals = new Map();
    this.nextId = 1;
    this.listeners = new Set();
  }

  register(isClosing = false) {
    const id = this.nextId++;
    // Calculate z-index based on current highest value to avoid duplicates
    const zIndex = this.getHighestZIndex() + 1;
    this.modals.set(id, { zIndex, isClosing });
    this.notifyListeners();
    return { id, zIndex };
  }

  unregister(id) {
    if (!this.modals.has(id)) return;
    this.modals.delete(id);
    this.notifyListeners();
  }

  setClosing(id, isClosing) {
    const modal = this.modals.get(id);
    if (modal) {
      modal.isClosing = isClosing;
      this.notifyListeners();
    }
  }

  getTopModal() {
    let topId = null;
    let topZIndex = 0;

    for (const [id, data] of this.modals) {
      // Only consider non-closing modals for "topmost" status
      if (!data.isClosing && data.zIndex > topZIndex) {
        topZIndex = data.zIndex;
        topId = id;
      }
    }

    return { id: topId, zIndex: topZIndex };
  }

  getActiveCount() {
    // Count modals that are not in closing state
    let count = 0;
    for (const data of this.modals.values()) {
      if (!data.isClosing) count++;
    }
    return count;
  }

  getTotalCount() {
    return this.modals.size;
  }

  getHighestZIndex() {
    let highest = BASE_Z_INDEX;
    for (const data of this.modals.values()) {
      if (data.zIndex > highest) highest = data.zIndex;
    }
    return highest;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyListeners() {
    // Use microtask to batch notifications
    queueTask(() => {
      this.listeners.forEach((listener) => listener());
    });
  }
}

// Singleton instance
const modalStackManager = new ModalStackManager();

// ============================================================================
// SHARED OVERLAY MANAGER - Single overlay element for all modals
// ============================================================================

class SharedOverlayManager {
  constructor() {
    this.overlayNode = null;
    this.targetOpacity = 0;
    this.currentZIndex = BASE_Z_INDEX;
    this.pendingUpdate = null;
    this.lastActiveCount = 0;
  }

  isServer() {
    return typeof document === 'undefined';
  }

  getOrCreateOverlay() {
    if (this.isServer()) return null;

    if (this.overlayNode && this.overlayNode.parentNode) {
      return this.overlayNode;
    }

    // Create fresh overlay
    const node = document.createElement('div');
    node.className = 'shared-modal-overlay';
    node.style.cssText = `
      position: fixed;
      inset: 0;
      background-color: black;
      opacity: 0;
      transition: opacity ${OVERLAY_FADE_MS}ms ease-out;
      pointer-events: none;
      z-index: ${this.currentZIndex};
      will-change: opacity;
    `;

    document.body.appendChild(node);
    this.overlayNode = node;
    return node;
  }

  update(activeModalCount, highestZIndex) {
    // Cancel any pending update
    if (this.pendingUpdate) {
      cancelAnimationFrame(this.pendingUpdate);
      this.pendingUpdate = null;
    }

    const newTargetOpacity = calculateOverlayOpacity(activeModalCount);
    const newZIndex = Math.max(BASE_Z_INDEX, highestZIndex - 1);

    // Batch DOM updates in a single rAF
    this.pendingUpdate = requestAnimationFrame(() => {
      this.pendingUpdate = null;

      if (activeModalCount > 0) {
        const node = this.getOrCreateOverlay();
        if (!node) return;

        // Update z-index immediately (no transition)
        if (this.currentZIndex !== newZIndex) {
          node.style.zIndex = String(newZIndex);
          this.currentZIndex = newZIndex;
        }

        // Update opacity with appropriate transition
        if (this.targetOpacity !== newTargetOpacity) {
          // Faster transition when adding modals (darkening), slower when removing
          const isGettingDarker = newTargetOpacity > this.targetOpacity;
          const transitionMs = isGettingDarker
            ? OVERLAY_FADE_MS * 0.75
            : OVERLAY_FADE_MS;
          node.style.transition = `opacity ${transitionMs}ms ease-out`;
          node.style.opacity = String(newTargetOpacity);
          this.targetOpacity = newTargetOpacity;
        }

        this.lastActiveCount = activeModalCount;
      } else {
        // No active modals - fade out
        if (this.overlayNode) {
          this.overlayNode.style.transition = `opacity ${OVERLAY_FADE_MS}ms ease-out`;
          this.overlayNode.style.opacity = '0';
          this.targetOpacity = 0;
        }
        this.lastActiveCount = 0;
      }
    });
  }

  cleanup() {
    if (this.pendingUpdate) {
      cancelAnimationFrame(this.pendingUpdate);
      this.pendingUpdate = null;
    }
    if (this.overlayNode) {
      try {
        this.overlayNode.remove();
      } catch {
        // Ignore removal errors
      }
      this.overlayNode = null;
    }
    this.targetOpacity = 0;
    this.currentZIndex = BASE_Z_INDEX;
    this.lastActiveCount = 0;
  }
}

// Singleton instance
const overlayManager = new SharedOverlayManager();

// ============================================================================
// BODY SCROLL LOCK MANAGER - Reference counted scroll lock
// ============================================================================

class BodyScrollLockManager {
  constructor() {
    this.lockCount = 0;
    this.originalStyles = null;
  }

  lock() {
    if (typeof document === 'undefined') return;

    this.lockCount++;

    if (this.lockCount === 1) {
      const body = document.body;
      const scrollBarWidth =
        window.innerWidth - document.documentElement.clientWidth;

      // Store original styles
      this.originalStyles = {
        overflow: body.style.overflow,
        paddingRight: body.style.paddingRight,
      };

      // Apply lock
      body.style.overflow = 'hidden';
      if (scrollBarWidth > 0) {
        body.style.paddingRight = `${scrollBarWidth}px`;
      }
    }
  }

  unlock() {
    if (typeof document === 'undefined') return;

    this.lockCount = Math.max(0, this.lockCount - 1);

    if (this.lockCount === 0 && this.originalStyles) {
      const body = document.body;
      body.style.overflow = this.originalStyles.overflow;
      body.style.paddingRight = this.originalStyles.paddingRight;
      this.originalStyles = null;
    }
  }

  cleanup() {
    if (typeof document === 'undefined') return;
    if (this.lockCount > 0 && this.originalStyles) {
      const body = document.body;
      body.style.overflow = this.originalStyles.overflow;
      body.style.paddingRight = this.originalStyles.paddingRight;
      this.originalStyles = null;
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
  fullHeight = false,
}) => {
  const modalIdRef = useRef(null);
  const zIndexRef = useRef(BASE_Z_INDEX);
  const overlayRef = useRef(null);
  const contentRef = useRef(null);
  const [isTopmost, setIsTopmost] = useState(false);
  const [shouldDimContent, setShouldDimContent] = useState(false);
  const hasRegisteredRef = useRef(false);
  const lockedViewportHeightRef = useRef(null);
  const baseViewportHeightRef = useRef(null);
  const isNative = Capacitor.isNativePlatform();
  const shouldFullHeight = fullHeight && isNative;

  // Register modal on mount (useLayoutEffect for synchronous execution)
  useLayoutEffect(() => {
    if (!isOpen || hasRegisteredRef.current) return;

    const { id, zIndex } = modalStackManager.register(isClosing);
    modalIdRef.current = id;
    zIndexRef.current = zIndex;
    hasRegisteredRef.current = true;
    if (overlayRef.current) {
      overlayRef.current.style.zIndex = String(zIndex);
    }

    // Lock scroll
    scrollLockManager.lock();

    // Update overlay
    const activeCount = modalStackManager.getActiveCount();
    const highestZ = modalStackManager.getHighestZIndex();
    overlayManager.update(activeCount, highestZ);

    return () => {
      if (modalIdRef.current !== null) {
        modalStackManager.unregister(modalIdRef.current);
        modalIdRef.current = null;
        hasRegisteredRef.current = false;
      }

      scrollLockManager.unlock();

      // Update overlay after unregister
      const newActiveCount = modalStackManager.getActiveCount();
      const newHighestZ = modalStackManager.getHighestZIndex();
      overlayManager.update(newActiveCount, newHighestZ);
    };
  }, [isOpen, isClosing]);

  // Handle isClosing state changes
  useLayoutEffect(() => {
    if (modalIdRef.current !== null) {
      modalStackManager.setClosing(modalIdRef.current, isClosing);

      // Update overlay when closing state changes
      const activeCount = modalStackManager.getActiveCount();
      const highestZ = modalStackManager.getHighestZIndex();
      overlayManager.update(activeCount, highestZ);
    }
  }, [isClosing]);

  // Subscribe to stack changes for topmost calculation
  useEffect(() => {
    const updateTopmostState = () => {
      const myId = modalIdRef.current;
      if (myId === null) return;

      const { id: topId } = modalStackManager.getTopModal();
      const amTopmost = myId === topId;

      setIsTopmost(amTopmost);
      setShouldDimContent(!amTopmost && modalStackManager.getActiveCount() > 1);
    };

    // Initial calculation
    updateTopmostState();

    // Subscribe to changes
    const unsubscribe = modalStackManager.subscribe(updateTopmostState);
    return unsubscribe;
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen || !closeOnEscape || !onClose) return;

    const handleEscape = (e) => {
      if (e.key === 'Escape' && isTopmost && !isClosing) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape, true);
    return () => document.removeEventListener('keydown', handleEscape, true);
  }, [isOpen, closeOnEscape, onClose, isTopmost, isClosing]);

  // Focus trap
  useEffect(() => {
    if (!isOpen || !contentRef.current || !isTopmost) return;

    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])';

    const getFocusableElements = () => {
      return contentRef.current?.querySelectorAll(focusableSelector) || [];
    };

    const handleTab = (e) => {
      if (e.key !== 'Tab' || !isTopmost) return;

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

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
    return () => document.removeEventListener('keydown', handleTab);
  }, [isOpen, isTopmost]);

  // Handle overlay click
  const handleOverlayClick = useCallback(
    (e) => {
      if (
        closeOnOverlayClick &&
        onClose &&
        isTopmost &&
        !isClosing &&
        e.target === e.currentTarget
      ) {
        onClose();
      }
    },
    [closeOnOverlayClick, onClose, isTopmost, isClosing]
  );

  // Lock viewport height on native to prevent keyboard resize squish
  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return undefined;
    if (!isNative) return undefined;

    const overlayNode = overlayRef.current;
    const contentNode = contentRef.current;

    const getViewportHeight = () =>
      Math.round(window.visualViewport?.height || window.innerHeight || 0);

    const initialHeight = getViewportHeight();
    baseViewportHeightRef.current = initialHeight;
    lockedViewportHeightRef.current = initialHeight || null;

    const applyHeight = (height) => {
      if (!overlayNode || !contentNode) return;
      overlayNode.style.height = height ? `${height}px` : '';

      if (shouldFullHeight) {
        contentNode.style.height = height ? `${height}px` : '';
        contentNode.style.maxHeight = '';
      } else {
        contentNode.style.height = '';
        contentNode.style.maxHeight = height
          ? `${Math.round(height * 0.9)}px`
          : '';
      }
    };

    applyHeight(initialHeight);

    const handleResize = () => {
      const currentHeight = getViewportHeight();
      const baseHeight = baseViewportHeightRef.current || currentHeight;
      const diff = Math.abs(currentHeight - baseHeight);

      // Ignore keyboard resize (usually ~250-350px), update on large changes
      if (diff > 320) {
        baseViewportHeightRef.current = currentHeight;
        lockedViewportHeightRef.current = currentHeight || null;
        applyHeight(currentHeight);
      }
    };

    window.addEventListener('resize', handleResize);
    window.visualViewport?.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('resize', handleResize);
      baseViewportHeightRef.current = null;
      lockedViewportHeightRef.current = null;
      if (overlayNode) {
        overlayNode.style.height = '';
      }
      if (contentNode) {
        contentNode.style.height = '';
        contentNode.style.maxHeight = '';
      }
    };
  }, [isOpen, isNative, shouldFullHeight]);

  // Early return if not open
  if (!isOpen || typeof document === 'undefined') return null;

  const overlay = (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      style={{
        isolation: 'isolate',
      }}
      className={`modal-overlay-wrapper fixed inset-0 !mt-0 bg-transparent flex justify-center ${
        shouldFullHeight ? 'items-stretch p-0' : 'items-center p-4'
      } ${overlayClassName}`}
      onClick={handleOverlayClick}
    >
      <div
        ref={contentRef}
        className={`modal-content relative bg-surface border border-border overflow-y-auto scrollbar-thin scrollbar-thumb-[rgb(var(--border)/0.7)] scrollbar-track-[rgb(var(--surface)/1)] ${
          isClosing ? 'closing' : ''
        } ${
          shouldFullHeight
            ? 'h-full w-full rounded-none border-0'
            : 'max-h-[90dvh] rounded-2xl'
        } ${contentClassName}`}
        style={{
          pointerEvents: isTopmost || isClosing ? 'auto' : 'none',
        }}
      >
        {shouldDimContent && !isClosing && (
          <div
            className="pointer-events-none absolute inset-0 rounded-2xl bg-black/50 z-30"
            style={{ transition: 'opacity 150ms ease-out' }}
            aria-hidden="true"
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
  fullHeight: PropTypes.bool,
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
