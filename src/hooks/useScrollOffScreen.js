import { useState, useEffect, useCallback } from 'react';

/**
 * Hook to detect when a ref element is scrolled off screen
 * Returns true when the element is no longer visible (scrolled above viewport)
 */
export const useScrollOffScreen = (elementRef) => {
  const [isOffScreen, setIsOffScreen] = useState(false);

  const checkVisibility = useCallback(() => {
    if (!elementRef?.current) return;

    const rect = elementRef.current.getBoundingClientRect();
    // Element is "off screen" when its bottom edge is above the viewport top
    // Add a small buffer (safe area + 8px) to account for status bar
    const threshold = 8;
    const isHidden = rect.bottom < threshold;

    setIsOffScreen(isHidden);
  }, [elementRef]);

  useEffect(() => {
    // Initial check
    checkVisibility();

    // Listen to scroll on window (captures all scroll events)
    window.addEventListener('scroll', checkVisibility, { passive: true });

    // Also listen to resize in case layout changes
    window.addEventListener('resize', checkVisibility, { passive: true });

    return () => {
      window.removeEventListener('scroll', checkVisibility);
      window.removeEventListener('resize', checkVisibility);
    };
  }, [checkVisibility]);

  return isOffScreen;
};
