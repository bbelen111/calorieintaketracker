import { useEffect } from 'react';
import { App } from '@capacitor/app';
import { HealthConnectStatus } from '../constants/health/healthSources.js';
import {
  getHeartRateSyncState,
  initializeHeartRateSync,
  refreshHeartRateSync,
  suspendHeartRateSync,
} from '../services/heartRateSync.js';
import { isHealthPlatform } from '../services/healthBridge.js';

/**
 * Lifecycle driver for the heart-rate sync (mounted ONCE, in the
 * orchestrator, after store hydration). The sync state itself lives in
 * `services/heartRateSync.js` and is read anywhere via `useHeartRateSyncState`.
 *
 * - On hydration: resolve availability + permission and run the routine sync
 *   (or the first back-fill).
 * - On app foreground (native only): re-read yesterday + today, so a day that
 *   rolled over while backgrounded gets its finalized resting HR.
 * - While heart-rate tracking is off (`enabled: false`) nothing is read; turning
 *   it back on runs the hydration path again.
 *
 * @param {{ isLoaded: boolean, enabled?: boolean }} params
 */
export const useHeartRateSync = ({ isLoaded, enabled = true }) => {
  useEffect(() => {
    if (!isLoaded) {
      return;
    }
    if (!enabled) {
      suspendHeartRateSync();
      return;
    }
    initializeHeartRateSync().catch((error) =>
      console.warn('[HeartRate] Initialization failed:', error)
    );
  }, [enabled, isLoaded]);

  useEffect(() => {
    if (!isLoaded || !enabled || !isHealthPlatform()) {
      return undefined;
    }

    let handle = null;
    let isCancelled = false;
    App.addListener('appStateChange', ({ isActive }) => {
      if (
        isActive &&
        getHeartRateSyncState().status === HealthConnectStatus.CONNECTED
      ) {
        refreshHeartRateSync();
      }
    })
      .then((listenerHandle) => {
        if (isCancelled) {
          listenerHandle.remove();
        } else {
          handle = listenerHandle;
        }
      })
      .catch((error) =>
        console.warn('[HeartRate] Foreground listener failed:', error)
      );

    return () => {
      isCancelled = true;
      handle?.remove();
    };
  }, [enabled, isLoaded]);
};
