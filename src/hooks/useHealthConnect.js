import { useState, useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Health } from '@capgo/capacitor-health';
import {
  aggregateStepsBySource,
  buildHealthConnectFallbackReadWindow,
  buildHealthConnectStepReadWindow,
} from '../utils/healthConnectWindow.js';

/**
 * Connection status states
 * @type {Object}
 */
export const HealthConnectStatus = {
  UNAVAILABLE: 'unavailable', // Platform doesn't support Health Connect (web, old Android)
  NOT_INSTALLED: 'not_installed', // Health Connect app not installed
  DISCONNECTED: 'disconnected', // Health Connect available but not authorized
  CONNECTING: 'connecting', // Requesting permissions
  CONNECTED: 'connected', // Authorized and ready
  ERROR: 'error', // An error occurred
};

/**
 * Hook for integrating with Android Health Connect to read step data
 *
 * @returns {{
 *   status: string,
 *   steps: number | null,
 *   lastSynced: Date | null,
 *   isLoading: boolean,
 *   error: string | null,
 *   connect: () => Promise<void>,
 *   refresh: () => Promise<void>,
 *   disconnect: () => void,
 * }}
 */
export const useHealthConnect = () => {
  const [status, setStatus] = useState(HealthConnectStatus.UNAVAILABLE);
  const [steps, setSteps] = useState(null);
  const [lastSynced, setLastSynced] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const isInitializedRef = useRef(false);

  /**
   * Check if Health Connect is available on this device
   */
  const checkAvailability = useCallback(async () => {
    // Only supported on native Android
    if (
      !Capacitor.isNativePlatform() ||
      Capacitor.getPlatform() !== 'android'
    ) {
      setStatus(HealthConnectStatus.UNAVAILABLE);
      return false;
    }

    try {
      const result = await Health.isAvailable();
      const available = result?.available;

      if (!available) {
        setStatus(HealthConnectStatus.NOT_INSTALLED);
        return false;
      }

      return true;
    } catch (err) {
      console.warn('[HealthConnect] Availability check failed:', err);
      setStatus(HealthConnectStatus.UNAVAILABLE);
      return false;
    }
  }, []);

  /**
   * Check if we already have authorization
   */
  const checkAuthorization = useCallback(async () => {
    try {
      const result = await Health.checkAuthorization({
        read: ['steps'],
        write: ['steps'],
      });

      // Check if steps is in readAuthorized array
      const isAuthorized = result?.readAuthorized?.includes('steps') ?? false;
      return isAuthorized;
    } catch (err) {
      console.warn('[HealthConnect] Authorization check failed:', err);
      return false;
    }
  }, []);

  /**
   * Fetch steps from Health Connect for today
   *
   * The primary read uses the today-scoped window (local midnight -> now)
   * instead of the plugin's native default (rolling 24 hours), so steps from
   * previous days are never included in today's live count.
   */
  const fetchSteps = useCallback(async () => {
    const stepReadWindow = buildHealthConnectStepReadWindow();
    const fallbackReadWindow = buildHealthConnectFallbackReadWindow();

    if (!stepReadWindow) {
      throw new Error('Failed to build Health Connect step read window');
    }

    const readSteps = async (window = null) =>
      Health.readSamples({
        dataType: 'steps',
        ...(window
          ? {
              startDate: window.startDate,
              endDate: window.endDate,
            }
          : {}),
        limit: 1000,
        ascending: false,
      });

    // Primary path: today-scoped window (local midnight -> now) so steps from
    // previous days are never included in today's live count.
    let primaryError = null;
    try {
      const result = await readSteps(stepReadWindow);
      // Group by source to prevent double counting from multiple apps (e.g. Samsung Health + Google Fit)
      return Math.round(aggregateStepsBySource(result));
    } catch (err) {
      primaryError = err;
      console.warn('[HealthConnect] Today-scoped step read failed:', {
        error: err,
        startDate: stepReadWindow.startDate,
        endDate: stepReadWindow.endDate,
      });
    }

    // Degraded path: native default range (rolling 24h). Only used when the
    // explicit today window fails; logged so overcount risk stays visible.
    try {
      const result = await readSteps(null);
      return Math.round(aggregateStepsBySource(result));
    } catch (nativeErr) {
      console.warn('[HealthConnect] Native default step read failed:', {
        error: nativeErr,
      });
    }

    // Exact-midnight window-build edge case: retry with a rolling 24h fallback.
    const shouldRetryWithFallback =
      String(primaryError?.message ?? primaryError ?? '').includes(
        'startTime must be before endTime'
      ) ||
      String(primaryError?.message ?? primaryError ?? '').includes(
        'endDate must be greater than or equal to startDate'
      );

    if (shouldRetryWithFallback && fallbackReadWindow) {
      try {
        const fallbackResult = await readSteps(fallbackReadWindow);
        return Math.round(aggregateStepsBySource(fallbackResult));
      } catch {
        console.info('[HealthConnect] Fallback step read unavailable:', {
          startDate: fallbackReadWindow?.startDate ?? null,
          endDate: fallbackReadWindow?.endDate ?? null,
        });
      }
    }

    console.info(
      '[HealthConnect] Step read unavailable; using manual or cached steps.',
      {
        startDate: stepReadWindow?.startDate ?? null,
        endDate: null,
      }
    );
    return null;
  }, []);

  /**
   * Initialize the hook - check availability and authorization
   */
  const initialize = useCallback(async () => {
    if (isInitializedRef.current) {
      return;
    }

    isInitializedRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const isAvailable = await checkAvailability();
      if (!isAvailable) {
        setIsLoading(false);
        return;
      }

      const isAuthorized = await checkAuthorization();
      if (isAuthorized) {
        setStatus(HealthConnectStatus.CONNECTED);
        const stepCount = await fetchSteps();
        if (stepCount !== null) {
          setSteps(stepCount);
          setLastSynced(new Date());
        }
      } else {
        setStatus(HealthConnectStatus.DISCONNECTED);
      }
    } catch (err) {
      console.error('[HealthConnect] Initialization failed:', err);
      setError(err.message || 'Failed to initialize Health Connect');
      setStatus(HealthConnectStatus.ERROR);
    } finally {
      setIsLoading(false);
    }
  }, [checkAvailability, checkAuthorization, fetchSteps]);

  /**
   * Request authorization and connect to Health Connect
   */
  const connect = useCallback(async () => {
    setIsLoading(true);
    setStatus(HealthConnectStatus.CONNECTING);
    setError(null);

    try {
      const result = await Health.requestAuthorization({
        read: ['steps'],
        write: ['steps'],
      });

      // Check if steps is in readAuthorized array
      const authorized = result?.readAuthorized?.includes('steps') ?? false;

      if (authorized) {
        setStatus(HealthConnectStatus.CONNECTED);
        // Fetch steps after authorization
        const stepCount = await fetchSteps();
        if (stepCount !== null) {
          setSteps(stepCount);
          setLastSynced(new Date());
        }
      } else {
        setStatus(HealthConnectStatus.DISCONNECTED);
        setError('Permission denied. Please allow access to step data.');
      }
    } catch (err) {
      console.error('[HealthConnect] Connect failed:', err);
      setError(err.message || 'Failed to connect to Health Connect');
      setStatus(HealthConnectStatus.ERROR);
    } finally {
      setIsLoading(false);
    }
  }, [fetchSteps]);

  /**
   * Refresh step data from Health Connect
   */
  const refresh = useCallback(async () => {
    if (status !== HealthConnectStatus.CONNECTED) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const stepCount = await fetchSteps();
      if (stepCount !== null) {
        setSteps(stepCount);
        setLastSynced(new Date());
      }
    } catch (err) {
      console.error('[HealthConnect] Refresh failed:', err);
      setError(err.message || 'Failed to refresh step data');
    } finally {
      setIsLoading(false);
    }
  }, [status, fetchSteps]);

  /**
   * Disconnect (clear local state, user must revoke in Health Connect app)
   */
  const disconnect = useCallback(() => {
    setSteps(null);
    setLastSynced(null);
    setStatus(HealthConnectStatus.DISCONNECTED);
    setError(null);
  }, []);

  /**
   * Open Health Connect settings (useful if user needs to configure data sources)
   */
  const openSettings = useCallback(async () => {
    try {
      await Health.openHealthConnectSettings();
    } catch (err) {
      console.warn('[HealthConnect] Failed to open settings:', err);
    }
  }, []);

  /**
   * Write test step data to Health Connect (for debugging)
   * This helps verify the plugin is working correctly
   */
  const writeTestData = useCallback(async () => {
    try {
      // Write 1000 test steps
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

      await Health.saveSample({
        dataType: 'steps',
        value: 1000,
        startDate: fiveMinutesAgo.toISOString(),
        endDate: now.toISOString(),
      });

      // Read back and refresh
      const result = await Health.readSamples({
        dataType: 'steps',
        startDate: fiveMinutesAgo.toISOString(),
        endDate: now.toISOString(),
        limit: 10,
      });

      if (result?.samples?.length > 0) {
        await refresh();
        return true;
      }
      return false;
    } catch (err) {
      console.error('[HealthConnect] Failed to write test data:', err);
      setError(
        'Failed to write test data: ' + (err.message || 'Unknown error')
      );
      return false;
    }
  }, [refresh]);

  // Initialize on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Refresh when app comes to foreground
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    let appStateListener = null;

    const setupListener = async () => {
      appStateListener = await App.addListener(
        'appStateChange',
        ({ isActive }) => {
          if (isActive && status === HealthConnectStatus.CONNECTED) {
            refresh();
          }
        }
      );
    };

    setupListener();

    return () => {
      if (appStateListener) {
        appStateListener.remove();
      }
    };
  }, [status, refresh]);

  return {
    status,
    steps,
    lastSynced,
    isLoading,
    error,
    connect,
    refresh,
    disconnect,
    openSettings,
    writeTestData,
  };
};
