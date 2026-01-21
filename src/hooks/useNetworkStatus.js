/* eslint-disable no-undef */
import { useState, useEffect, useCallback } from 'react';

/**
 * Hook to track network connectivity status
 *
 * Uses navigator.onLine with online/offline event listeners
 * Also provides a manual refresh function for edge cases
 *
 * @returns {{ isOnline: boolean, lastChecked: number, refresh: () => void }}
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(() => {
    // SSR safety - default to true if navigator not available
    if (typeof navigator === 'undefined') return true;
    return navigator.onLine;
  });

  const [lastChecked, setLastChecked] = useState(() => Date.now());

  const refresh = useCallback(() => {
    if (typeof navigator !== 'undefined') {
      setIsOnline(navigator.onLine);
      setLastChecked(Date.now());
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setLastChecked(Date.now());
    };

    const handleOffline = () => {
      setIsOnline(false);
      setLastChecked(Date.now());
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Also check on visibility change (user returns to app)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refresh]);

  return { isOnline, lastChecked, refresh };
}

/**
 * Simple non-hook check for network status
 * Useful in callbacks or outside React components
 */
export function checkNetworkStatus() {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}
