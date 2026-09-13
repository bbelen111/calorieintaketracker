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
import {
  BASE_Z_INDEX,
  OVERLAY_FADE_MS,
  ModalStackManager,
  calculateLayerOpacity,
  queueTask,
} from '../../../utils/visuals/modalStack.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const KEYBOARD_RESIZE_MIN_DELTA = 120;
const KEYBOARD_RESIZE_MAX_DELTA = 420;
const VIEWPORT_WIDTH_LAYOUT_DELTA = 80;

// ============================================================================
// MODAL STACK MANAGER - Tracks all open modals with stable ordering
// ============================================================================

// Singleton instance. Lane allocation + backdrop opacity math live in
// `utils/visuals/modalStack.js` so they stay unit-testable without a DOM.
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
  allowKeyboardViewportResize = false,
}) => {
  const modalIdRef = useRef(null);
  const zIndexRef = useRef(BASE_Z_INDEX);
  const overlayRef = useRef(null);
  const contentRef = useRef(null);
  const [isTopmost, setIsTopmost] = useState(false);
  const [stackDepth, setStackDepth] = useState(0);
  const hasRegisteredRef = useRef(false);
  const lockedViewportHeightRef = useRef(null);
  const baseViewportHeightRef = useRef(null);
  const baseViewportWidthRef = useRef(null);
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
    queueTask(() => {
      if (modalIdRef.current === id) {
        setStackDepth(modalStackManager.getDepth(id));
      }
    });

    const overlayNode = overlayRef.current;
    if (overlayNode) {
      overlayNode.style.zIndex = String(zIndex);
    }

    // Lock scroll
    scrollLockManager.lock();

    return () => {
      if (modalIdRef.current !== null) {
        modalStackManager.unregister(modalIdRef.current);
        modalIdRef.current = null;
        hasRegisteredRef.current = false;
      }

      scrollLockManager.unlock();
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
    const getViewportWidth = () =>
      Math.round(window.visualViewport?.width || window.innerWidth || 0);

    const initialHeight = getViewportHeight();
    const initialWidth = getViewportWidth();
    baseViewportHeightRef.current = initialHeight;
    baseViewportWidthRef.current = initialWidth;
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
      const currentWidth = getViewportWidth();
      const baseHeight = baseViewportHeightRef.current || currentHeight;
      const baseWidth = baseViewportWidthRef.current || currentWidth;
      const diff = Math.abs(currentHeight - baseHeight);
      const widthDiff = Math.abs(currentWidth - baseWidth);

      if (allowKeyboardViewportResize) {
        if (diff > 1 || widthDiff > 1) {
          baseViewportHeightRef.current = currentHeight;
          baseViewportWidthRef.current = currentWidth;
          lockedViewportHeightRef.current = currentHeight || null;
          applyHeight(currentHeight);
        }
        return;
      }

      // Ignore keyboard-driven viewport changes; only relock on true layout changes.
      const isKeyboardSizedDelta =
        diff >= KEYBOARD_RESIZE_MIN_DELTA && diff <= KEYBOARD_RESIZE_MAX_DELTA;
      const hasSignificantWidthChange =
        widthDiff >= VIEWPORT_WIDTH_LAYOUT_DELTA;
      const hasLargeHeightLayoutChange = diff > KEYBOARD_RESIZE_MAX_DELTA;

      if (hasSignificantWidthChange || hasLargeHeightLayoutChange) {
        baseViewportHeightRef.current = currentHeight;
        baseViewportWidthRef.current = currentWidth;
        lockedViewportHeightRef.current = currentHeight || null;
        applyHeight(currentHeight);
        return;
      }

      if (isKeyboardSizedDelta) {
        return;
      }
    };

    window.addEventListener('resize', handleResize);
    window.visualViewport?.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('resize', handleResize);
      baseViewportHeightRef.current = null;
      baseViewportWidthRef.current = null;
      lockedViewportHeightRef.current = null;
      if (overlayNode) {
        overlayNode.style.height = '';
      }
      if (contentNode) {
        contentNode.style.height = '';
        contentNode.style.maxHeight = '';
      }
    };
  }, [isOpen, isNative, shouldFullHeight, allowKeyboardViewportResize]);

  // Early return if not open
  if (!isOpen || typeof document === 'undefined') return null;

  const layerOpacity = calculateLayerOpacity(stackDepth);
  const backdropOpacity = !isClosing ? layerOpacity : 0;

  const overlay = (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      style={{
        isolation: 'isolate',
        backgroundColor: `rgb(var(--overlay-base) / ${backdropOpacity})`,
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
  allowKeyboardViewportResize: PropTypes.bool,
};

// ============================================================================
// CLEANUP ON MODULE UNLOAD (for HMR/Fast Refresh)
// ============================================================================

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    scrollLockManager.cleanup();
  });
}
