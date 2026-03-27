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
const OVERLAY_FADE_MS = 180;

// Overlay opacity configuration - increases with modal depth for visual hierarchy
const OVERLAY_BASE_OPACITY = 0.5; // Single modal backdrop
const OVERLAY_STACKED_INCREMENT = 0.1; // Additional darkness per nested modal
const OVERLAY_MAX_OPACITY = 0.8; // Cap to prevent complete blackout

const queueTask =
  typeof globalThis.queueMicrotask === 'function'
    ? globalThis.queueMicrotask
    : (cb) => Promise.resolve().then(cb);

const calculateStackTargetOpacity = (depth) => {
  if (depth <= 0) return 0;
  if (depth === 1) return OVERLAY_BASE_OPACITY;

  const additionalLayers = depth - 1;
  const target =
    OVERLAY_BASE_OPACITY + OVERLAY_STACKED_INCREMENT * additionalLayers;
  return Math.min(target, OVERLAY_MAX_OPACITY);
};

/**
 * Convert cumulative target opacity into per-layer opacity so each modal can
 * own its own backdrop while preserving progressive darkening.
 */
const calculateLayerOpacity = (depth) => {
  if (depth <= 0) return 0;

  const currentTarget = calculateStackTargetOpacity(depth);
  const previousTarget = calculateStackTargetOpacity(depth - 1);

  if (currentTarget <= previousTarget) return 0;

  const remainingVisibility = 1 - previousTarget;
  if (remainingVisibility <= 0) return 0;

  const layerOpacity = (currentTarget - previousTarget) / remainingVisibility;
  return Math.max(0, Math.min(layerOpacity, 1));
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
    // Reserve one z-index lane between modal wrappers for the shared overlay.
    // This guarantees: lower modal < overlay < top modal.
    const zIndex = this.getHighestZIndex() + 2;
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
    // Count modals that are not in closing state (used for topmost logic)
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

  getDepth(id) {
    if (!this.modals.has(id)) return 0;

    const orderedIds = [...this.modals.entries()]
      .sort((a, b) => a[1].zIndex - b[1].zIndex)
      .map(([modalId]) => modalId);

    return orderedIds.indexOf(id) + 1;
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
  const backdropAnimationRef = useRef(null);
  const [isTopmost, setIsTopmost] = useState(false);
  const [stackDepth, setStackDepth] = useState(0);
  const [isBackdropVisible, setIsBackdropVisible] = useState(false);
  const hasRegisteredRef = useRef(false);
  const lockedViewportHeightRef = useRef(null);
  const baseViewportHeightRef = useRef(null);
  const isNative = Capacitor.isNativePlatform();
  const shouldFullHeight = fullHeight && isNative;
  const sanitizedOverlayClassName = overlayClassName
    .split(/\s+/)
    .filter(Boolean)
    .filter((className) => !/^!?bg-/.test(className))
    .join(' ');

  // Register modal on open / unregister on close (useLayoutEffect for synchronous execution)
  useLayoutEffect(() => {
    if (!isOpen || hasRegisteredRef.current) return;

    const { id, zIndex } = modalStackManager.register(false);
    modalIdRef.current = id;
    zIndexRef.current = zIndex;
    hasRegisteredRef.current = true;
    setStackDepth(modalStackManager.getDepth(id));
    setIsBackdropVisible(false);

    backdropAnimationRef.current = requestAnimationFrame(() => {
      backdropAnimationRef.current = null;
      setIsBackdropVisible(true);
    });

    const overlayNode = overlayRef.current;
    if (overlayNode) {
      overlayNode.style.zIndex = String(zIndex);
    }

    // Lock scroll
    scrollLockManager.lock();

    return () => {
      if (backdropAnimationRef.current !== null) {
        cancelAnimationFrame(backdropAnimationRef.current);
        backdropAnimationRef.current = null;
      }

      if (modalIdRef.current !== null) {
        modalStackManager.unregister(modalIdRef.current);
        modalIdRef.current = null;
        hasRegisteredRef.current = false;
      }

      scrollLockManager.unlock();
      setStackDepth(0);
      setIsBackdropVisible(false);
    };
  }, [isOpen]);

  // Handle isClosing state changes
  useLayoutEffect(() => {
    if (modalIdRef.current !== null) {
      modalStackManager.setClosing(modalIdRef.current, isClosing);
    }
  }, [isClosing]);

  // Subscribe to stack changes for topmost calculation
  useEffect(() => {
    const updateStackState = () => {
      const myId = modalIdRef.current;
      if (myId === null) return;

      const { id: topId } = modalStackManager.getTopModal();
      setIsTopmost(myId === topId);
      setStackDepth(modalStackManager.getDepth(myId));
    };

    // Initial calculation
    updateStackState();

    // Subscribe to changes
    const unsubscribe = modalStackManager.subscribe(updateStackState);
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

  const layerOpacity = calculateLayerOpacity(stackDepth);
  const backdropOpacity = isBackdropVisible && !isClosing ? layerOpacity : 0;

  const overlay = (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      style={{
        isolation: 'isolate',
        backgroundColor: `rgb(0 0 0 / ${backdropOpacity})`,
        transition: `background-color ${OVERLAY_FADE_MS}ms ease-out`,
        willChange: 'background-color',
      }}
      className={`${sanitizedOverlayClassName} modal-overlay-wrapper fixed inset-0 !mt-0 bg-transparent flex justify-center ${
        shouldFullHeight ? 'items-stretch p-0' : 'items-center p-4'
      }`}
      onClick={handleOverlayClick}
    >
      <div
        ref={contentRef}
        className={`modal-content relative bg-surface overflow-y-auto scrollbar-thin scrollbar-thumb-[rgb(var(--border)/0.7)] scrollbar-track-[rgb(var(--surface)/1)] ${
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
    scrollLockManager.cleanup();
  });
}
