import { useState, useEffect, useCallback, useRef } from 'react';
import { App } from '@capacitor/app';
import { Health } from '@capgo/capacitor-health';
import { isAndroid, isIOS } from '../utils/platform.js';
import {
  HealthConnectStatus,
  getHealthSourceName,
} from '../constants/health/healthSources.js';
import {
  aggregateStepsBySource,
  buildHealthConnectFallbackReadWindow,
  buildHealthConnectStepReadWindow,
} from '../utils/healthConnectWindow.js';

/**
 * The plugin's read/write scope request for the current platform.
 *
 * Android asks for read + write: Health Connect reports real write denials, and
 * the connect flow has always requested both.
 *
 * iOS is READ-ONLY. `NSHealthUpdateUsageDescription` is deliberately absent from
 * `Info.plist` (least privilege) and nothing in the app writes health data on
 * iOS, so asking for write access would prompt for a capability the app cannot
 * use. Omitting the key is safe — the plugin's Swift side defaults a missing
 * array to `[]` for both `requestAuthorization` and `checkAuthorization`.
 */
const buildPermissionRequest = () =>
  isAndroid() ? { read: ['steps'], write: ['steps'] } : { read: ['steps'] };

/**
 * Hook for reading step data from the platform health store.
 *
 * Android → Health Connect (`@capgo/capacitor-health`).
 * iOS     → HealthKit, through the same plugin. Read-only on iOS.
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
   * Check if a usable health store exists on this device.
   *
   * Android → Health Connect (a separate Play Store app on older devices).
   * iOS     → HealthKit, which is present on iPhone but NOT on iPad.
   */
  const checkAvailability = useCallback(async () => {
    if (!isAndroid() && !isIOS()) {
      setStatus(HealthConnectStatus.UNAVAILABLE);
      return false;
    }

    try {
      const result = await Health.isAvailable();
      const available = result?.available;

      if (!available) {
        // Android: the provider app is missing and the user must install it.
        // iOS: HealthKit is not available on this device at all (iPad, or
        // restricted by a device-management profile) — nothing to install, so
        // this is UNAVAILABLE and the step card stays hidden.
        setStatus(
          isIOS()
            ? HealthConnectStatus.UNAVAILABLE
            : HealthConnectStatus.NOT_INSTALLED
        );
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
   * Check if steps access has already been granted.
   *
   * iOS SEMANTIC — this is the one place the two platforms genuinely differ, and
   * it is worth understanding before changing anything here: HealthKit never
   * reveals whether READ access was granted (deliberate Apple privacy design —
   * a denial must not itself be readable data). The plugin works around it with
   * `getRequestStatusForAuthorization`, which reports `.unnecessary` once the app
   * has already presented the request; the plugin maps that to `readAuthorized`.
   *
   * So on iOS this answers "has the user already been asked?", which is exactly
   * what `initialize()` needs — don't re-prompt on every launch, just read.
   *
   * Be honest about the consequence: a user who DENIED access in the sheet still
   * reads back as authorized on iOS, and the subsequent read returns zero samples
   * rather than an error (Android can distinguish the two). That is a HealthKit
   * limitation, not something to paper over here.
   */
  const checkAuthorization = useCallback(async () => {
    try {
      const result = await Health.checkAuthorization(buildPermissionRequest());

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
   * Request authorization and connect to the platform health store
   */
  const connect = useCallback(async () => {
    setIsLoading(true);
    setStatus(HealthConnectStatus.CONNECTING);
    setError(null);

    try {
      const result = await Health.requestAuthorization(
        buildPermissionRequest()
      );

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
        setError(
          `Permission denied. Please allow access to step data in ${getHealthSourceName()}.`
        );
      }
    } catch (err) {
      console.error('[HealthConnect] Connect failed:', err);
      setError(err.message || `Failed to connect to ${getHealthSourceName()}`);
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
   * Open the health-permission settings surface (Android only).
   *
   * `openHealthConnectSettings()` is documented as a no-op on iOS, and Capacitor
   * exposes no API for launching another app (`@capacitor/app` v8 has no
   * `openUrl`), so there is nothing meaningful to call on iOS. Return early and
   * log it rather than silently pretending: iOS users manage access inside the
   * Health app (Profile → Privacy → Apps), which the step card's copy points at.
   */
  const openSettings = useCallback(async () => {
    if (!isAndroid()) {
      console.info(
        '[HealthConnect] Permission settings can only be opened on Android; on iOS this is managed in the Health app.'
      );
      return;
    }

    try {
      await Health.openHealthConnectSettings();
    } catch (err) {
      console.warn('[HealthConnect] Failed to open settings:', err);
    }
  }, []);

  /**
   * Write test step data to the health store (debug helper, Android only).
   *
   * iOS is read-only by design: `saveSample` would need the HealthKit share
   * entitlement plus `NSHealthUpdateUsageDescription`, neither of which is
   * declared, so on iOS it would fail at the HealthKit layer with a confusing
   * error. Refuse explicitly instead.
   */
  const writeTestData = useCallback(async () => {
    if (!isAndroid()) {
      console.info('[HealthConnect] Writing test data is Android-only.');
      return false;
    }

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

  // Refresh when the app comes to the foreground. Both platforms emit
  // `appStateChange` from `@capacitor/app`, so gate on health-store support
  // rather than on "native" (which would also cover a platform with no store).
  useEffect(() => {
    if (!isAndroid() && !isIOS()) {
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
