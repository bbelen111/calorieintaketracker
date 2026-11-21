import { useEffect } from 'react';
import { App } from '@capacitor/app';
import { HealthConnectStatus } from '../constants/health/healthSources.js';
import {
  getHeartRateSyncState,
  initializeHeartRateSync,
  refreshHeartRateSync,
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
 *
 * @param {{ isLoaded: boolean }} params
 */
export const useHeartRateSync = ({ isLoaded }) => {
  useEffect(() => {
    if (!isLoaded) {
      return;
    }
    initializeHeartRateSync().catch((error) =>
      console.warn('[HeartRate] Initialization failed:', error)
    );
  }, [isLoaded]);

  useEffect(() => {
    if (!isLoaded || !isHealthPlatform()) {
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
  }, [isLoaded]);
};
