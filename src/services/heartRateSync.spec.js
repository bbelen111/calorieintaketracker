import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  connectHeartRateSync,
  disconnectHeartRateSync,
  getHeartRateSyncState,
  initializeHeartRateSync,
  resetHeartRateSyncState,
  runHeartRateSync,
} from './heartRateSync';
import { useEnergyMapStore } from '../store/useEnergyMapStore';
import { HealthConnectStatus } from '../constants/health/healthSources';
import { CapacitorMock, HealthMock } from '../tests/mocks/capacitor.js';
import { getTodayDateKey } from '../utils/data/dateKeys';

const INITIAL_STORE = useEnergyMapStore.getState();
const get = () => useEnergyMapStore.getState();

const dayBucket = (average, min, max) => ({
  startDate: '2026-01-01T00:00:00.000Z',
  endDate: '2026-01-02T00:00:00.000Z',
  value: average,
  values: { average, min, max },
});

/**
 * Heart-rate sync contract:
 *  - read-only permission request for exactly the HR types,
 *  - one local day per aggregated read (DST-safe), back-fill on first connect,
 *  - synced readings merge without overwriting a manual resting HR,
 *  - a synced day the user never tracked never gets a snapshot.
 */
describe('heartRateSync', () => {
  beforeEach(() => {
    useEnergyMapStore.setState(INITIAL_STORE);
    resetHeartRateSyncState();
    CapacitorMock.isNativePlatform.mockReturnValue(true);
    CapacitorMock.getPlatform.mockReturnValue('android');
    HealthMock.isAvailable.mockReset().mockResolvedValue({ available: true });
    HealthMock.checkAuthorization.mockReset().mockResolvedValue({
      readAuthorized: ['heartRate', 'restingHeartRate', 'vo2Max', 'workouts'],
      writeAuthorized: [],
    });
    HealthMock.requestAuthorization.mockReset().mockResolvedValue({
      readAuthorized: ['heartRate', 'restingHeartRate', 'vo2Max', 'workouts'],
      writeAuthorized: [],
    });
    HealthMock.queryAggregated
      .mockReset()
      .mockImplementation(async ({ bucket }) =>
        bucket === 'day'
          ? { samples: [dayBucket(72, 48, 160)] }
          : { samples: [] }
      );
    HealthMock.readSamples
      .mockReset()
      .mockImplementation(async ({ dataType }) =>
        dataType === 'restingHeartRate'
          ? {
              samples: [
                {
                  value: 56,
                  startDate: '2026-01-01T06:00:00Z',
                  endDate: '2026-01-01T06:00:00Z',
                },
              ],
            }
          : { samples: [] }
      );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('connect asks read-only for the HR types, then back-fills 30 days on Android', async () => {
    await connectHeartRateSync();

    expect(HealthMock.requestAuthorization).toHaveBeenCalledWith({
      read: ['heartRate', 'restingHeartRate', 'vo2Max', 'workouts'],
    });
    expect(getHeartRateSyncState().status).toBe(HealthConnectStatus.CONNECTED);
    expect(get().userData.heartRateSyncEnabled).toBe(true);

    const dayReads = HealthMock.queryAggregated.mock.calls.filter(
      ([options]) => options.bucket === 'day'
    );
    expect(dayReads).toHaveLength(30);
    // Each read is exactly one local day (never a multi-day 24 h bucket)
    dayReads.forEach(([options]) => {
      const start = new Date(options.startDate);
      expect(start.getHours()).toBe(0);
      expect(start.getMinutes()).toBe(0);
      expect(options.aggregation).toEqual(['average', 'min', 'max']);
    });

    const today = get().userData.heartRateEntries.find(
      (entry) => entry.date === getTodayDateKey()
    );
    expect(today).toMatchObject({
      restingHr: 56,
      restingHrMethod: 'device',
      avgHr: 72,
      minHr: 48,
      maxHr: 160,
    });
    expect(get().userData.heartRateEntries).toHaveLength(30);
  });

  it('a routine sync re-reads only yesterday + today and keeps a manual resting HR', async () => {
    await connectHeartRateSync();
    const today = getTodayDateKey();
    get().setManualRestingHeartRate(today, 51);
    HealthMock.queryAggregated.mockClear();

    await runHeartRateSync();

    expect(
      HealthMock.queryAggregated.mock.calls.filter(
        ([options]) => options.bucket === 'day'
      )
    ).toHaveLength(2);
    const entry = get().userData.heartRateEntries.find(
      (item) => item.date === today
    );
    expect(entry.restingHr).toBe(51);
    expect(entry.restingHrMethod).toBe('manual');
  });

  it('never seeds a snapshot for a synced day the user did not track', async () => {
    const before = Object.keys(get().userData.dailySnapshots);
    await connectHeartRateSync();
    const after = Object.keys(get().userData.dailySnapshots);
    expect(after).toEqual(before);
  });

  it('a denied permission leaves sync disconnected with an explanation', async () => {
    HealthMock.requestAuthorization.mockResolvedValue({
      readAuthorized: [],
      writeAuthorized: [],
    });
    await connectHeartRateSync();
    expect(getHeartRateSyncState().status).toBe(
      HealthConnectStatus.DISCONNECTED
    );
    expect(getHeartRateSyncState().error).toMatch(/Permission denied/);
    expect(get().userData.heartRateSyncEnabled).toBe(false);
  });

  it('launch init stays disconnected unless the user enabled sync', async () => {
    await initializeHeartRateSync();
    expect(getHeartRateSyncState().status).toBe(
      HealthConnectStatus.DISCONNECTED
    );
    expect(HealthMock.queryAggregated).not.toHaveBeenCalled();

    get().handleUserDataChange('heartRateSyncEnabled', true);
    await initializeHeartRateSync();
    expect(getHeartRateSyncState().status).toBe(HealthConnectStatus.CONNECTED);
  });

  it('iOS without HealthKit is unavailable, never "not installed"', async () => {
    CapacitorMock.getPlatform.mockReturnValue('ios');
    HealthMock.isAvailable.mockResolvedValue({ available: false });
    await connectHeartRateSync();
    expect(getHeartRateSyncState().status).toBe(
      HealthConnectStatus.UNAVAILABLE
    );
  });

  it('falls back to an estimated resting HR when the device writes none', async () => {
    HealthMock.readSamples.mockResolvedValue({ samples: [] });
    HealthMock.queryAggregated.mockImplementation(
      async ({ bucket, startDate }) => {
        if (bucket === 'day') {
          return { samples: [dayBucket(70, 50, 150)] };
        }
        const base = new Date(startDate).getTime();
        return {
          samples: [61, 58, 64, 75, 80, 90].map((value, index) => ({
            startDate: new Date(base + index * 3_600_000).toISOString(),
            value,
          })),
        };
      }
    );
    get().handleUserDataChange('heartRateSyncEnabled', true);
    await initializeHeartRateSync();
    const entry = get().userData.heartRateEntries.find(
      (item) => item.date === getTodayDateKey()
    );
    expect(entry.restingHr).toBe(58);
    expect(entry.restingHrMethod).toBe('estimated');
  });

  it('disconnect stops syncing but keeps the synced history', async () => {
    await connectHeartRateSync();
    const count = get().userData.heartRateEntries.length;
    disconnectHeartRateSync();
    expect(getHeartRateSyncState().status).toBe(
      HealthConnectStatus.DISCONNECTED
    );
    expect(get().userData.heartRateSyncEnabled).toBe(false);
    expect(get().userData.heartRateEntries).toHaveLength(count);
    expect(await runHeartRateSync()).toBeNull();
  });
});
