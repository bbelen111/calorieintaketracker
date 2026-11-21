import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionHeartRatePanel } from './SessionHeartRatePanel';
import {
  connectHeartRateSync,
  resetHeartRateSyncState,
} from '../../../services/heartRateSync';
import { useEnergyMapStore } from '../../../store/useEnergyMapStore';
import { CapacitorMock, HealthMock } from '../../../tests/mocks/capacitor.js';

const INITIAL_STORE = useEnergyMapStore.getState();

const sessionWindow = {
  startMs: new Date(2026, 2, 10, 7, 0).getTime(),
  endMs: new Date(2026, 2, 10, 7, 10).getTime(),
};

const samplesFrom = (sourceId, deviceType, bpm, everySeconds = 5) => {
  const samples = [];
  for (let t = 0; t <= 600; t += everySeconds) {
    samples.push({
      startDate: new Date(sessionWindow.startMs + t * 1000).toISOString(),
      value: bpm,
      sourceId,
      deviceType,
    });
  }
  return samples;
};

describe('SessionHeartRatePanel', () => {
  beforeEach(async () => {
    useEnergyMapStore.setState(INITIAL_STORE);
    resetHeartRateSyncState();
    CapacitorMock.isNativePlatform.mockReturnValue(true);
    CapacitorMock.getPlatform.mockReturnValue('android');
    HealthMock.isAvailable.mockResolvedValue({ available: true });
    HealthMock.requestAuthorization.mockResolvedValue({
      readAuthorized: ['heartRate', 'restingHeartRate', 'vo2Max', 'workouts'],
      writeAuthorized: [],
    });
    HealthMock.queryAggregated.mockResolvedValue({ samples: [] });
    HealthMock.readSamples.mockResolvedValue({ samples: [] });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await connectHeartRateSync();
    HealthMock.readSamples.mockReset();
  });

  it('fills the draft from ONE wearable source, time-weighted', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    HealthMock.readSamples.mockResolvedValue({
      // A denser watch and a sparser phone: the watch wins, never a blend.
      samples: [
        ...samplesFrom('watch', 'watch', 140, 5),
        ...samplesFrom('phone', 'phone', 90, 60),
      ],
    });

    render(
      <SessionHeartRatePanel
        kind="cardio"
        session={{ effortType: 'heartRate', averageHeartRate: '' }}
        onChange={onChange}
        dateKey="2026-03-10"
        window={sessionWindow}
        cardioTypes={{}}
      />
    );

    await user.click(screen.getByRole('button', { name: /use watch data/i }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(HealthMock.readSamples).toHaveBeenCalledWith(
      expect.objectContaining({
        dataType: 'heartRate',
        limit: 0,
        ascending: true,
      })
    );
    expect(onChange.mock.calls[0][0]).toMatchObject({
      effortType: 'heartRate',
      averageHeartRate: 140,
      maxHeartRate: 140,
      heartRateSource: 'healthConnect',
      heartRateCoverage: 1,
    });
  });

  it('reports honestly when the watch has nothing for the window', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    HealthMock.readSamples.mockResolvedValue({ samples: [] });

    render(
      <SessionHeartRatePanel
        kind="training"
        session={{ effortType: 'heartRate', averageHeartRate: 120 }}
        onChange={onChange}
        dateKey="2026-03-10"
        window={sessionWindow}
      />
    );

    await user.click(screen.getByRole('button', { name: /use watch data/i }));
    expect(await screen.findByText(/No heart rate found/)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('templates (favourites) get the zone chip but no watch / live actions', () => {
    render(
      <SessionHeartRatePanel
        kind="cardio"
        session={{ effortType: 'heartRate', averageHeartRate: 150 }}
        onChange={vi.fn()}
        dateKey="2026-03-10"
        window={sessionWindow}
        isFavouriteMode
        onRecordLive={vi.fn()}
      />
    );
    expect(
      screen.queryByRole('button', { name: /use watch data/i })
    ).toBeNull();
    expect(screen.queryByRole('button', { name: /record live/i })).toBeNull();
    expect(screen.getByText(/Z\d/)).toBeInTheDocument();
  });
});
