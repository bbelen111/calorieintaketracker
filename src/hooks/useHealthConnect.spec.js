import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HealthConnectStatus, useHealthConnect } from './useHealthConnect';
import {
  AppMock,
  CapacitorMock,
  HealthMock,
} from '../tests/mocks/capacitor.js';

/**
 * Health Connect bridge.
 *
 * The contract that matters (and is easy to regress):
 *  - platform/availability gating against `Capacitor` +
 *    `Health.isAvailable()`;
 *  - the **today-scoped** read window is the primary path, the plugin's rolling
 *    24h default is only a degraded fallback, and a total read failure degrades
 *    to `null` instead of throwing into the live UI;
 *  - step samples are deduped max-per-source, never summed.
 */
describe('useHealthConnect', () => {
  const silentConsole = () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
  };

  beforeEach(() => {
    CapacitorMock.isNativePlatform.mockReturnValue(true);
    CapacitorMock.getPlatform.mockReturnValue('android');

    HealthMock.isAvailable.mockReset().mockResolvedValue({ available: true });
    HealthMock.checkAuthorization
      .mockReset()
      .mockResolvedValue({ readAuthorized: ['steps'], writeAuthorized: [] });
    HealthMock.requestAuthorization
      .mockReset()
      .mockResolvedValue({ readAuthorized: ['steps'], writeAuthorized: [] });
    HealthMock.readSamples.mockReset().mockResolvedValue({ samples: [] });
    HealthMock.saveSample.mockReset().mockResolvedValue(undefined);
    HealthMock.openHealthConnectSettings
      .mockReset()
      .mockResolvedValue(undefined);
    AppMock.addListener.mockClear();

    silentConsole();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderHealth = () => renderHook(() => useHealthConnect());

  describe('availability gating', () => {
    it('starts unavailable', () => {
      const { result } = renderHealth();

      expect(result.current.status).toBe(HealthConnectStatus.UNAVAILABLE);
      expect(result.current.steps).toBeNull();
    });

    it('stays unavailable on web without touching the plugin', async () => {
      CapacitorMock.isNativePlatform.mockReturnValue(false);

      const { result } = renderHealth();

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.status).toBe(HealthConnectStatus.UNAVAILABLE);
      expect(HealthMock.isAvailable).not.toHaveBeenCalled();
      expect(HealthMock.readSamples).not.toHaveBeenCalled();
    });

    it('stays unavailable on non-Android native platforms', async () => {
      CapacitorMock.getPlatform.mockReturnValue('ios');

      const { result } = renderHealth();

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.status).toBe(HealthConnectStatus.UNAVAILABLE);
      expect(HealthMock.isAvailable).not.toHaveBeenCalled();
    });

    it('reports NOT_INSTALLED when Health Connect is missing', async () => {
      HealthMock.isAvailable.mockResolvedValue({ available: false });

      const { result } = renderHealth();

      await waitFor(() =>
        expect(result.current.status).toBe(HealthConnectStatus.NOT_INSTALLED)
      );
      expect(HealthMock.checkAuthorization).not.toHaveBeenCalled();
    });

    it('reports UNAVAILABLE when the availability probe throws', async () => {
      HealthMock.isAvailable.mockRejectedValue(new Error('bridge down'));

      const { result } = renderHealth();

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.status).toBe(HealthConnectStatus.UNAVAILABLE);
    });
  });

  describe('initial authorization', () => {
    it('connects and loads steps when already authorized', async () => {
      HealthMock.readSamples.mockResolvedValue({
        samples: [{ sourceId: 'com.samsung.health', value: 4213 }],
      });

      const { result } = renderHealth();

      await waitFor(() =>
        expect(result.current.status).toBe(HealthConnectStatus.CONNECTED)
      );
      expect(result.current.steps).toBe(4213);
      expect(result.current.lastSynced).toBeInstanceOf(Date);
      expect(result.current.error).toBeNull();
    });

    it('reports DISCONNECTED when step access was never granted', async () => {
      HealthMock.checkAuthorization.mockResolvedValue({
        readAuthorized: [],
        writeAuthorized: [],
      });

      const { result } = renderHealth();

      await waitFor(() =>
        expect(result.current.status).toBe(HealthConnectStatus.DISCONNECTED)
      );
      expect(result.current.steps).toBeNull();
      expect(HealthMock.readSamples).not.toHaveBeenCalled();
    });

    it('treats a failing authorization probe as not authorized', async () => {
      HealthMock.checkAuthorization.mockRejectedValue(new Error('nope'));

      const { result } = renderHealth();

      await waitFor(() =>
        expect(result.current.status).toBe(HealthConnectStatus.DISCONNECTED)
      );
    });

    it('initializes only once across re-renders', async () => {
      const { result, rerender } = renderHealth();

      await waitFor(() =>
        expect(result.current.status).toBe(HealthConnectStatus.CONNECTED)
      );
      rerender();
      rerender();

      expect(HealthMock.isAvailable).toHaveBeenCalledTimes(1);
      expect(HealthMock.checkAuthorization).toHaveBeenCalledTimes(1);
    });
  });

  describe('today-scoped step reads', () => {
    const firstReadOptions = () => HealthMock.readSamples.mock.calls[0][0];

    it('reads with the local-midnight window, not the rolling 24h default', async () => {
      HealthMock.readSamples.mockResolvedValue({
        samples: [{ sourceId: 'com.samsung.health', value: 3000 }],
      });

      const { result } = renderHealth();

      await waitFor(() =>
        expect(result.current.status).toBe(HealthConnectStatus.CONNECTED)
      );

      const options = firstReadOptions();
      expect(options).toMatchObject({
        dataType: 'steps',
        limit: 1000,
        ascending: false,
      });

      const start = new Date(options.startDate);
      const end = new Date(options.endDate);
      const now = new Date();
      const localMidnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      );

      // Starts at (or just after) local midnight: this is the discriminator
      // against the plugin's rolling 24h default, which would start ~24h
      // before "now" instead. The span therefore grows with the time of day,
      // so it only needs to stay within a day.
      expect(start.getTime()).toBeGreaterThanOrEqual(localMidnight.getTime());
      expect(start.getTime() - localMidnight.getTime()).toBeLessThan(5000);
      expect(end.getTime()).toBeGreaterThanOrEqual(start.getTime());
      expect(end.getTime() - start.getTime()).toBeLessThanOrEqual(
        24 * 60 * 60 * 1000
      );
    });

    it('dedupes overlapping sources by taking the max, never the sum', async () => {
      HealthMock.readSamples.mockResolvedValue({
        samples: [
          { sourceId: 'com.samsung.health', value: 4000 },
          { sourceId: 'com.samsung.health', value: 213 },
          { sourceId: 'com.google.android.apps.fitness', value: 3900 },
          { count: '1500' }, // unknown source, numeric string in `count`
        ],
      });

      const { result } = renderHealth();

      await waitFor(() => expect(result.current.steps).toBe(4213));
      // Summing every source would report 9613.
      expect(result.current.steps).not.toBe(9613);
    });

    it('falls back to the plugin default range when the today window fails', async () => {
      HealthMock.readSamples
        .mockRejectedValueOnce(new Error('window rejected'))
        .mockResolvedValueOnce({ samples: [{ value: 1234 }] });

      const { result } = renderHealth();

      await waitFor(() => expect(result.current.steps).toBe(1234));
      expect(HealthMock.readSamples).toHaveBeenCalledTimes(2);

      // The degraded read omits the window so the plugin uses its own range.
      const fallbackOptions = HealthMock.readSamples.mock.calls[1][0];
      expect(fallbackOptions.startDate).toBeUndefined();
      expect(fallbackOptions.endDate).toBeUndefined();
    });

    it('degrades to null when every read fails instead of throwing', async () => {
      HealthMock.readSamples.mockRejectedValue(new Error('bridge offline'));

      const { result } = renderHealth();

      await waitFor(() =>
        expect(result.current.status).toBe(HealthConnectStatus.CONNECTED)
      );
      await waitFor(() =>
        expect(HealthMock.readSamples).toHaveBeenCalledTimes(2)
      );

      expect(result.current.steps).toBeNull();
      expect(result.current.lastSynced).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });

    it('retries with a rolling 24h window on the exact-midnight error', async () => {
      HealthMock.readSamples
        .mockRejectedValueOnce(new Error('startTime must be before endTime'))
        .mockRejectedValueOnce(new Error('native default failed'))
        .mockResolvedValueOnce({ samples: [{ value: 777 }] });

      const { result } = renderHealth();

      await waitFor(() => expect(result.current.steps).toBe(777));
      expect(HealthMock.readSamples).toHaveBeenCalledTimes(3);

      const retryOptions = HealthMock.readSamples.mock.calls[2][0];
      const span =
        new Date(retryOptions.endDate).getTime() -
        new Date(retryOptions.startDate).getTime();
      expect(span).toBeGreaterThan(20 * 60 * 60 * 1000);
    });

    it('skips the rolling retry for an unrelated failure reason', async () => {
      HealthMock.readSamples.mockRejectedValue(new Error('permission revoked'));

      const { result } = renderHealth();

      await waitFor(() =>
        expect(result.current.status).toBe(HealthConnectStatus.CONNECTED)
      );
      await waitFor(() =>
        expect(HealthMock.readSamples).toHaveBeenCalledTimes(2)
      );

      expect(result.current.steps).toBeNull();
    });
  });

  describe('connect', () => {
    const renderDisconnected = async () => {
      HealthMock.checkAuthorization.mockResolvedValue({
        readAuthorized: [],
        writeAuthorized: [],
      });
      const rendered = renderHealth();
      await waitFor(() =>
        expect(rendered.result.current.status).toBe(
          HealthConnectStatus.DISCONNECTED
        )
      );
      return rendered;
    };

    it('connects and pulls steps after authorization', async () => {
      const { result } = await renderDisconnected();
      HealthMock.readSamples.mockResolvedValue({ samples: [{ value: 5000 }] });

      await act(async () => {
        await result.current.connect();
      });

      expect(result.current.status).toBe(HealthConnectStatus.CONNECTED);
      expect(result.current.steps).toBe(5000);
      expect(result.current.error).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });

    it('surfaces a denied permission request', async () => {
      const { result } = await renderDisconnected();
      HealthMock.requestAuthorization.mockResolvedValue({
        readAuthorized: [],
        writeAuthorized: [],
      });

      await act(async () => {
        await result.current.connect();
      });

      expect(result.current.status).toBe(HealthConnectStatus.DISCONNECTED);
      expect(result.current.error).toMatch(/Permission denied/i);
    });

    it('surfaces a plugin failure as an error state', async () => {
      const { result } = await renderDisconnected();
      HealthMock.requestAuthorization.mockRejectedValue(
        new Error('bridge exploded')
      );

      await act(async () => {
        await result.current.connect();
      });

      expect(result.current.status).toBe(HealthConnectStatus.ERROR);
      expect(result.current.error).toBe('bridge exploded');
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('refresh', () => {
    it('does nothing while not connected', async () => {
      HealthMock.checkAuthorization.mockResolvedValue({
        readAuthorized: [],
        writeAuthorized: [],
      });

      const { result } = renderHealth();
      await waitFor(() =>
        expect(result.current.status).toBe(HealthConnectStatus.DISCONNECTED)
      );

      await act(async () => {
        await result.current.refresh();
      });

      expect(HealthMock.readSamples).not.toHaveBeenCalled();
    });

    it('updates steps and the sync stamp while connected', async () => {
      HealthMock.readSamples.mockResolvedValue({ samples: [{ value: 1000 }] });

      const { result } = renderHealth();
      await waitFor(() => expect(result.current.steps).toBe(1000));
      const firstSynced = result.current.lastSynced;

      HealthMock.readSamples.mockResolvedValue({ samples: [{ value: 2500 }] });
      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.steps).toBe(2500);
      expect(result.current.lastSynced.getTime()).toBeGreaterThanOrEqual(
        firstSynced.getTime()
      );
    });
  });

  describe('disconnect, settings and test data', () => {
    it('clears local state on disconnect', async () => {
      HealthMock.readSamples.mockResolvedValue({ samples: [{ value: 900 }] });

      const { result } = renderHealth();
      await waitFor(() => expect(result.current.steps).toBe(900));

      act(() => {
        result.current.disconnect();
      });

      expect(result.current.status).toBe(HealthConnectStatus.DISCONNECTED);
      expect(result.current.steps).toBeNull();
      expect(result.current.lastSynced).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it('opens Health Connect settings and swallows plugin failures', async () => {
      HealthMock.checkAuthorization.mockResolvedValue({
        readAuthorized: [],
        writeAuthorized: [],
      });

      const { result } = renderHealth();
      await waitFor(() =>
        expect(result.current.status).toBe(HealthConnectStatus.DISCONNECTED)
      );

      await act(async () => {
        await result.current.openSettings();
      });
      expect(HealthMock.openHealthConnectSettings).toHaveBeenCalledTimes(1);

      HealthMock.openHealthConnectSettings.mockRejectedValue(
        new Error('no activity')
      );
      await act(async () => {
        await result.current.openSettings();
      });
      // Still usable: a settings failure must not become an error state.
      expect(result.current.status).toBe(HealthConnectStatus.DISCONNECTED);
    });

    it('writes and verifies test step data', async () => {
      HealthMock.readSamples.mockResolvedValue({ samples: [{ value: 1000 }] });

      const { result } = renderHealth();
      await waitFor(() =>
        expect(result.current.status).toBe(HealthConnectStatus.CONNECTED)
      );

      let written = null;
      await act(async () => {
        written = await result.current.writeTestData();
      });

      expect(written).toBe(true);
      expect(HealthMock.saveSample).toHaveBeenCalledTimes(1);
      expect(HealthMock.saveSample.mock.calls[0][0]).toMatchObject({
        dataType: 'steps',
        value: 1000,
      });
      expect(result.current.steps).toBe(1000);
    });

    it('reports false when the test write cannot be read back', async () => {
      HealthMock.readSamples.mockResolvedValue({ samples: [] });

      const { result } = renderHealth();
      await waitFor(() =>
        expect(result.current.status).toBe(HealthConnectStatus.CONNECTED)
      );

      let written = null;
      await act(async () => {
        written = await result.current.writeTestData();
      });

      expect(written).toBe(false);
    });

    it('reports false and an error when the test write throws', async () => {
      const { result } = renderHealth();
      await waitFor(() =>
        expect(result.current.status).toBe(HealthConnectStatus.CONNECTED)
      );

      HealthMock.saveSample.mockRejectedValue(new Error('write blocked'));

      let written = null;
      await act(async () => {
        written = await result.current.writeTestData();
      });

      expect(written).toBe(false);
      expect(result.current.error).toMatch(/Failed to write test data/);
    });
  });

  describe('foreground refresh', () => {
    const lastAppStateHandler = () =>
      AppMock.addListener.mock.calls
        .filter(([event]) => event === 'appStateChange')
        .at(-1)?.[1];

    it('registers a foreground listener on native platforms', async () => {
      const { result } = renderHealth();

      await waitFor(() =>
        expect(result.current.status).toBe(HealthConnectStatus.CONNECTED)
      );

      expect(lastAppStateHandler()).toBeTypeOf('function');
    });

    it('refreshes when the app becomes active while connected', async () => {
      HealthMock.readSamples.mockResolvedValue({ samples: [{ value: 1000 }] });

      const { result } = renderHealth();
      await waitFor(() => expect(result.current.steps).toBe(1000));

      HealthMock.readSamples.mockResolvedValue({ samples: [{ value: 4321 }] });
      await act(async () => {
        lastAppStateHandler()({ isActive: true });
      });

      await waitFor(() => expect(result.current.steps).toBe(4321));
    });

    it('ignores a background transition', async () => {
      const { result } = renderHealth();
      await waitFor(() =>
        expect(result.current.status).toBe(HealthConnectStatus.CONNECTED)
      );

      const before = HealthMock.readSamples.mock.calls.length;
      await act(async () => {
        lastAppStateHandler()({ isActive: false });
      });

      expect(HealthMock.readSamples).toHaveBeenCalledTimes(before);
    });

    it('does not refresh once disconnected', async () => {
      const { result } = renderHealth();
      await waitFor(() =>
        expect(result.current.status).toBe(HealthConnectStatus.CONNECTED)
      );

      act(() => {
        result.current.disconnect();
      });

      const before = HealthMock.readSamples.mock.calls.length;
      await act(async () => {
        lastAppStateHandler()({ isActive: true });
      });

      expect(HealthMock.readSamples).toHaveBeenCalledTimes(before);
    });
  });
});
