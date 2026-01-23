import { useState, useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

// Dynamically import the health plugin to avoid build errors on web
let CapacitorHealth = null;

const loadHealthPlugin = async () => {
  if (CapacitorHealth) {
    return CapacitorHealth;
  }

  try {
    const module = await import('@capgo/capacitor-health');
    CapacitorHealth = module.CapacitorHealth;
    return CapacitorHealth;
  } catch (error) {
    console.warn('[HealthConnect] Failed to load health plugin:', error);
    return null;
  }
};

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

  const healthPluginRef = useRef(null);
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
      const plugin = await loadHealthPlugin();
      if (!plugin) {
        setStatus(HealthConnectStatus.UNAVAILABLE);
        return false;
      }

      healthPluginRef.current = plugin;

      // Check if Health Connect is available
      const { available } = await plugin.isAvailable();

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
    const plugin = healthPluginRef.current;
    if (!plugin) {
      return false;
    }

    try {
      const { authorized } = await plugin.isAuthorized({
        read: ['steps'],
        write: [],
      });

      return authorized;
    } catch (err) {
      console.warn('[HealthConnect] Authorization check failed:', err);
      return false;
    }
  }, []);

  /**
   * Fetch steps from Health Connect for today
   */
  const fetchSteps = useCallback(async () => {
    const plugin = healthPluginRef.current;
    if (!plugin) {
      return null;
    }

    try {
      const startDate = getStartOfToday();
      const endDate = new Date();

      const result = await plugin.queryAggregated({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        dataTypes: ['steps'],
        bucket: 'day',
      });

      // Extract step count from aggregated results
      // The structure can vary, so we handle multiple formats
      let totalSteps = 0;

      if (result?.steps !== undefined) {
        totalSteps = Number(result.steps) || 0;
      } else if (Array.isArray(result)) {
        // Some plugins return an array of buckets
        totalSteps = result.reduce((sum, bucket) => {
          const bucketSteps = bucket?.steps || bucket?.value || 0;
          return sum + Number(bucketSteps);
        }, 0);
      } else if (result?.data) {
        // Alternative format
        totalSteps = Array.isArray(result.data)
          ? result.data.reduce(
              (sum, item) => sum + (Number(item.steps) || 0),
              0
            )
          : Number(result.data.steps) || 0;
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
        // Fetch initial steps
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
    const plugin = healthPluginRef.current;
    if (!plugin) {
      setError('Health Connect is not available on this device');
      return;
    }

    setIsLoading(true);
    setStatus(HealthConnectStatus.CONNECTING);
    setError(null);

    try {
      const { authorized } = await plugin.requestAuthorization({
        read: ['steps'],
        write: [],
      });

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
  };
};
