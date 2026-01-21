import { useCallback, useRef, useState } from 'react';

// Match the CSS animation duration for close (150ms) + small buffer
const DEFAULT_CLOSE_DURATION = 180;

export const useAnimatedModal = (
  initiallyOpen = false,
  animationDuration = DEFAULT_CLOSE_DURATION
) => {
  const [isOpen, setIsOpen] = useState(initiallyOpen);
  const [isClosing, setIsClosing] = useState(false);
  const closeTimeoutRef = useRef(null);

  const clearCloseTimeout = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  const open = useCallback(() => {
    clearCloseTimeout();
    // Ensure clean state before opening
    setIsClosing(false);
    setIsOpen(true);
  }, [clearCloseTimeout]);

  const requestClose = useCallback(() => {
    // Prevent double-close
    if (!isOpen || isClosing) return;

    setIsClosing(true);
    clearCloseTimeout();

    closeTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
      closeTimeoutRef.current = null;
    }, animationDuration);
  }, [animationDuration, clearCloseTimeout, isOpen, isClosing]);

  const forceClose = useCallback(() => {
    clearCloseTimeout();
    setIsOpen(false);
    setIsClosing(false);
  }, [clearCloseTimeout]);

  return {
    isOpen,
    isClosing,
    open,
    requestClose,
    forceClose,
  };
};
