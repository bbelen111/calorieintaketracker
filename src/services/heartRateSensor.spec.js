import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CHECKPOINT_KEY,
  connectSensor,
  finishRecording,
  getHeartRateSensorState,
  readInterruptedRecording,
  resetHeartRateSensorState,
  startRecording,
} from './heartRateSensor';
import {
  BluetoothLeMock,
  CapacitorMock,
  KeepAwakeMock,
  PreferencesMock,
} from '../tests/mocks/capacitor.js';

const frame = (bpm) => new DataView(Uint8Array.from([0x00, bpm]).buffer);

/**
 * Live BLE recording: the service (not React state) owns the recording, the
 * plugin is reached only through the dynamic import, the screen is kept awake
 * while recording, and a checkpoint survives an app kill.
 */
describe('heartRateSensor', () => {
  beforeEach(() => {
    resetHeartRateSensorState();
    CapacitorMock.isNativePlatform.mockReturnValue(true);
    CapacitorMock.getPlatform.mockReturnValue('android');
    Object.values(BluetoothLeMock.BleClient).forEach((fn) => fn.mockClear());
    KeepAwakeMock.keepAwake.mockClear();
    KeepAwakeMock.allowSleep.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('connects, subscribes to 0x2A37 and reads the battery', async () => {
    const connected = await connectSensor({
      deviceId: 'strap-1',
      name: 'Polar H10',
    });
    expect(connected).toBe(true);
    expect(BluetoothLeMock.BleClient.initialize).toHaveBeenCalledWith({
      androidNeverForLocation: true,
    });
    expect(BluetoothLeMock.BleClient.startNotifications).toHaveBeenCalledWith(
      'strap-1',
      '0000180d-0000-1000-8000-00805f9b34fb',
      '00002a37-0000-1000-8000-00805f9b34fb',
      expect.any(Function)
    );
    expect(getHeartRateSensorState()).toMatchObject({
      connection: 'connected',
      deviceName: 'Polar H10',
      battery: 80,
    });
  });

  it('records beats into a session summary and keeps the screen on meanwhile', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date('2026-03-10T07:00:00'));
    await connectSensor({ deviceId: 'strap-1', name: 'Strap' });

    expect(startRecording({ kind: 'cardio' })).toBe(true);
    for (let second = 0; second <= 90; second += 1) {
      vi.setSystemTime(
        new Date(Date.parse('2026-03-10T07:00:00') + second * 1000)
      );
      BluetoothLeMock.__notify(frame(second < 45 ? 120 : 140));
    }
    expect(getHeartRateSensorState().currentBpm).toBe(140);
    await vi.waitFor(() => expect(KeepAwakeMock.keepAwake).toHaveBeenCalled());

    const summary = finishRecording();
    expect(summary).toMatchObject({
      kind: 'cardio',
      startTime: '07:00',
      averageHeartRate: 130,
      maxHeartRate: 140,
      durationMinutes: 2,
    });
    expect(getHeartRateSensorState().recording).toBeNull();
    await vi.waitFor(() => expect(KeepAwakeMock.allowSleep).toHaveBeenCalled());
  });

  it('recovers an interrupted recording from its checkpoint', async () => {
    const startedAt = Date.parse('2026-03-10T07:00:00');
    await PreferencesMock.set({
      key: CHECKPOINT_KEY,
      value: JSON.stringify({
        recording: {
          kind: 'training',
          startedAt,
          sampleCount: 600,
          areaBpmSeconds: 135 * 600,
          coveredSeconds: 600,
          minBpm: 100,
          maxBpm: 165,
          zoneSeconds: [0, 0, 600, 0, 0],
          lastSample: { timeMs: startedAt + 600_000, bpm: 140 },
        },
        deviceName: 'Strap',
        savedAt: startedAt + 600_000,
      }),
    });
    const summary = await readInterruptedRecording();
    expect(summary).toMatchObject({
      kind: 'training',
      averageHeartRate: 135,
      durationMinutes: 10,
      deviceName: 'Strap',
    });
  });
});
