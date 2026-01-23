import { useState, useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Health } from '@capgo/capacitor-health';

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
 * Get the start of today (midnight) as a Date object
 * @returns {Date}
 */
const getStartOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
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
   * Also tries to fetch last 7 days as a debug fallback
   */
  const fetchSteps = useCallback(async () => {
    try {
      const startDate = getStartOfToday();
      const endDate = new Date();

      const result = await Health.readSamples({
        dataType: 'steps',
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        limit: 1000,
        ascending: false,
      });

      // Sum up all step samples for today
      let totalSteps = 0;
      if (result?.samples && Array.isArray(result.samples)) {
        totalSteps = result.samples.reduce((sum, sample) => {
          // Health Connect may return steps in 'value' or 'count' field
          const stepValue = Number(sample.value) || Number(sample.count) || 0;
          return sum + stepValue;
        }, 0);
      }

      return Math.round(totalSteps);
    } catch (err) {
      console.warn('[HealthConnect] Failed to fetch steps:', err);
      throw err;
    }
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
