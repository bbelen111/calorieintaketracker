import { useCallback, useRef, useState } from 'react';

const DEFAULT_DURATION = 200;

export const useAnimatedModal = (initiallyOpen = false, animationDuration = DEFAULT_DURATION) => {
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
    setIsClosing(false);
    setIsOpen(true);
  }, [clearCloseTimeout]);

  const requestClose = useCallback(() => {
    setIsClosing(true);
    clearCloseTimeout();
    closeTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
      closeTimeoutRef.current = null;
    }, animationDuration);
  }, [animationDuration, clearCloseTimeout]);

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
    forceClose
  };
};
