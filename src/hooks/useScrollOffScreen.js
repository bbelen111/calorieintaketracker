import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Hook to detect when a ref element is scrolled off screen
 * Returns true when the element is no longer visible (scrolled above viewport)
 */
export const useScrollOffScreen = (elementRef) => {
  const [isOffScreen, setIsOffScreen] = useState(false);
  const animationFrameIdRef = useRef(null);

  const checkVisibility = useCallback(() => {
    if (!elementRef?.current) return;

    const rect = elementRef.current.getBoundingClientRect();
    // Element is "off screen" when its bottom edge is above the viewport top
    // Add a small buffer (safe area + 8px) to account for status bar
    const threshold = 8;
    const isHidden = rect.bottom < threshold;

    setIsOffScreen((previous) => (previous === isHidden ? previous : isHidden));
  }, [elementRef]);

  const queueVisibilityCheck = useCallback(() => {
    if (animationFrameIdRef.current != null) {
      return;
    }

    animationFrameIdRef.current = window.requestAnimationFrame(() => {
      animationFrameIdRef.current = null;
      checkVisibility();
    });
  }, [checkVisibility]);

  useEffect(() => {
    // Initial check
    checkVisibility();

    // Listen to scroll on window (captures all scroll events)
    window.addEventListener('scroll', queueVisibilityCheck, { passive: true });

    // Also listen to resize in case layout changes
    window.addEventListener('resize', queueVisibilityCheck, { passive: true });

    return () => {
      window.removeEventListener('scroll', queueVisibilityCheck);
      window.removeEventListener('resize', queueVisibilityCheck);
      if (animationFrameIdRef.current != null) {
        window.cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    };
  }, [checkVisibility, queueVisibilityCheck]);

  return isOffScreen;
};
