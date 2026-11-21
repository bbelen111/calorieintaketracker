/**
 * Heart-rate sync from the platform health store into `heartRateEntries`.
 *
 * A module singleton (not hook state) so any surface — Settings, the Insights
 * card, the HR tracker, the cardio/training forms — can read the connection
 * status (`useHeartRateSyncState`) and trigger connect/refresh without
 * threading props through the orchestrator. `hooks/useHeartRateSync.js`
 * drives the lifecycle (initialize after hydration, refresh on foreground).
 *
 * Sync rules:
 * - Pull-based (the plugin has no observers): on connect, on launch, on app
 *   foreground and on manual refresh. Never polls.
 * - Routine syncs re-read YESTERDAY + TODAY (Apple finalizes a day's resting
 *   HR after the day ends).
 * - The first sync back-fills 30 days on Android (Health Connect's read cap
 *   without the extra history permission, which the app does not request) and
 *   90 days on iOS.
 * - Readings are merged field-by-field by `saveHeartRateEntries` (a manual
 *   resting HR is never overwritten) and only EXISTING snapshots are refreshed.
 */
import { useSyncExternalStore } from 'react';
import {
  HealthConnectStatus,
  getHealthSourceName,
} from '../constants/health/healthSources.js';
import {
  checkHealthReadTypes,
  requestHealthReadTypes,
  resolveHealthAvailability,
} from './healthBridge.js';
import {
  HEART_RATE_READ_TYPES,
  readDailyHeartRate,
  readVo2MaxReadings,
} from './heartRateHealth.js';
import { mapWithConcurrencyLimit } from '../utils/concurrency.js';
import { toLocalDateKey } from '../utils/healthConnectWindow.js';
import { isIOS } from '../utils/platform.js';
import { useEnergyMapStore } from '../store/useEnergyMapStore.js';

export const HEART_RATE_BACKFILL_DAYS_ANDROID = 30;
export const HEART_RATE_BACKFILL_DAYS_IOS = 90;
export const HEART_RATE_ROUTINE_SYNC_DAYS = 2;
const VO2_MAX_LOOKBACK_DAYS = 180;
const READ_CONCURRENCY = 3;

const INITIAL_STATE = Object.freeze({
  status: HealthConnectStatus.UNAVAILABLE,
  isLoading: false,
  error: null,
  lastSynced: null,
  grantedTypes: [],
});

let state = INITIAL_STATE;
const listeners = new Set();

const setState = (patch) => {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
};

export const getHeartRateSyncState = () => state;

export const subscribeHeartRateSync = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** React binding for the shared sync state. */
export const useHeartRateSyncState = () =>
  useSyncExternalStore(
    subscribeHeartRateSync,
    getHeartRateSyncState,
    getHeartRateSyncState
  );

/** Test seam: back to the pristine module state. */
export const resetHeartRateSyncState = () => {
  state = INITIAL_STATE;
  syncPromise = null;
  listeners.forEach((listener) => listener());
};

const setSyncEnabled = (enabled) => {
  const store = useEnergyMapStore.getState();
  if (Boolean(store.userData?.heartRateSyncEnabled) !== enabled) {
    store.handleUserDataChange('heartRateSyncEnabled', enabled);
  }
};

const shiftLocalDateKey = (dateKey, days) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return toLocalDateKey(new Date(year, month - 1, day + days));
};

/** `count` local date keys ending at `endDateKey` (oldest first). */
export const buildSyncDateKeys = (endDateKey, count) => {
  const keys = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    keys.push(shiftLocalDateKey(endDateKey, -offset));
  }
  return keys;
};

/** True once any synced (non-manual) reading exists, i.e. back-fill ran. */
const hasSyncedHistory = () => {
  const entries = useEnergyMapStore.getState().heartRateEntries ?? [];
  return entries.some(
    (entry) =>
      entry.avgHr != null ||
      entry.maxHr != null ||
      entry.vo2Max != null ||
      (entry.restingHr != null && entry.restingHrMethod !== 'manual')
  );
};

/**
 * Logged cardio / training windows per local date, so the waking-hours HR
 * (advisory NEAT suggestion) leaves exercise out: sessions are priced by
 * their own formulas.
 */
export const buildSessionIntervalsByDate = (userData) => {
  const byDate = new Map();
  [
    ...(userData?.cardioSessions ?? []),
    ...(userData?.trainingSessions ?? []),
  ].forEach((session) => {
    const startMs = Number(session?.startedAt);
    const endMs = Number(session?.endedAt);
    if (
      !Number.isFinite(startMs) ||
      !Number.isFinite(endMs) ||
      endMs <= startMs
    ) {
      return;
    }
    const dateKey = toLocalDateKey(startMs);
    if (!byDate.has(dateKey)) {
      byDate.set(dateKey, []);
    }
    byDate.get(dateKey).push({ startMs, endMs });
  });
  return byDate;
};

let syncPromise = null;

/**
 * Reads the window and merges it into the store. Returns the dates whose
 * entries changed, or `null` when not connected / the read failed.
 *
 * @param {{ backfill?: boolean, now?: Date }} [options]
 */
export const runHeartRateSync = ({
  backfill = false,
  now = new Date(),
} = {}) => {
  if (state.status !== HealthConnectStatus.CONNECTED) {
    return Promise.resolve(null);
  }
  if (syncPromise) {
    return syncPromise;
  }

  syncPromise = (async () => {
    setState({ isLoading: true, error: null });
    try {
      const todayKey = toLocalDateKey(now);
      const days = backfill
        ? isIOS()
          ? HEART_RATE_BACKFILL_DAYS_IOS
          : HEART_RATE_BACKFILL_DAYS_ANDROID
        : HEART_RATE_ROUTINE_SYNC_DAYS;
      const granted = state.grantedTypes;
      // iOS cannot report a READ grant (a denial reads as "asked"); asking is
      // the best signal available, so iOS reads every type it asked for.
      const canRead = (type) => isIOS() || granted.includes(type);
      const sessionIntervalsByDate = buildSessionIntervalsByDate(
        useEnergyMapStore.getState().userData
      );

      const dailyReadings = await mapWithConcurrencyLimit(
        buildSyncDateKeys(todayKey, days),
        READ_CONCURRENCY,
        (dateKey) =>
          readDailyHeartRate(dateKey, {
            canReadResting: canRead('restingHeartRate'),
            now,
            sessionIntervals: sessionIntervalsByDate.get(dateKey) ?? [],
          })
      );
      const entriesByDate = new Map();
      dailyReadings.filter(Boolean).forEach((entry) => {
        entriesByDate.set(entry.date, { ...entry });
      });

      if (canRead('vo2Max')) {
        const vo2Readings = await readVo2MaxReadings({
          startDate: new Date(
            now.getTime() - VO2_MAX_LOOKBACK_DAYS * 86_400_000
          ),
          endDate: now,
        });
        vo2Readings.forEach(({ date, vo2Max }) => {
          entriesByDate.set(date, {
            ...(entriesByDate.get(date) ?? { date }),
            vo2Max,
          });
        });
      }

      const changed = useEnergyMapStore
        .getState()
        .saveHeartRateEntries(Array.from(entriesByDate.values()));
      setState({ isLoading: false, lastSynced: new Date() });
      return changed;
    } catch (error) {
      console.warn('[HeartRate] Sync failed:', error);
      setState({
        isLoading: false,
        error: `Could not read heart rate from ${getHealthSourceName()}.`,
      });
      return null;
    } finally {
      syncPromise = null;
    }
  })();

  return syncPromise;
};

/**
 * Launch-time check: connected only when the user enabled HR sync AND the
 * store still grants heart rate. Runs a routine sync (or the back-fill when
 * none has happened yet) once connected.
 */
export const initializeHeartRateSync = async () => {
  const { available, status } = await resolveHealthAvailability('[HeartRate]');
  if (!available) {
    setState({ status });
    return false;
  }

  if (!useEnergyMapStore.getState().userData?.heartRateSyncEnabled) {
    setState({ status: HealthConnectStatus.DISCONNECTED });
    return false;
  }

  const granted = await checkHealthReadTypes([...HEART_RATE_READ_TYPES]);
  if (!granted.includes('heartRate')) {
    setState({
      status: HealthConnectStatus.DISCONNECTED,
      grantedTypes: granted,
    });
    return false;
  }

  setState({
    status: HealthConnectStatus.CONNECTED,
    grantedTypes: granted,
    error: null,
  });
  await runHeartRateSync({ backfill: !hasSyncedHistory() });
  return true;
};

/** User-initiated connect: permission sheet, then the first back-fill. */
export const connectHeartRateSync = async () => {
  const { available, status } = await resolveHealthAvailability('[HeartRate]');
  if (!available) {
    setState({ status });
    return false;
  }

  setState({ status: HealthConnectStatus.CONNECTING, error: null });
  let granted;
  try {
    granted = await requestHealthReadTypes([...HEART_RATE_READ_TYPES]);
  } catch (error) {
    console.warn('[HeartRate] Authorization request failed:', error);
    setState({
      status: HealthConnectStatus.ERROR,
      error: `Could not connect to ${getHealthSourceName()}.`,
    });
    return false;
  }

  if (!granted.includes('heartRate')) {
    setState({
      status: HealthConnectStatus.DISCONNECTED,
      grantedTypes: granted,
      error: `Permission denied. Allow heart rate access in ${getHealthSourceName()}.`,
    });
    return false;
  }

  setSyncEnabled(true);
  setState({
    status: HealthConnectStatus.CONNECTED,
    grantedTypes: granted,
    error: null,
  });
  await runHeartRateSync({ backfill: !hasSyncedHistory() });
  return true;
};

/** Manual refresh (pull-to-refresh / button). */
export const refreshHeartRateSync = () => runHeartRateSync();

/**
 * Stops syncing. Already-synced readings stay (they are the user's history);
 * permissions can only be revoked in the platform's health settings.
 */
export const disconnectHeartRateSync = () => {
  setSyncEnabled(false);
  setState({
    status: HealthConnectStatus.DISCONNECTED,
    isLoading: false,
    error: null,
  });
};
