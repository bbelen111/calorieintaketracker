import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ImportWorkoutButton } from './ImportWorkoutButton';
import {
  connectHeartRateSync,
  resetHeartRateSyncState,
} from '../../../services/heartRateSync';
import { useEnergyMapStore } from '../../../store/useEnergyMapStore';
import { cardioTypes } from '../../../constants/cardio/cardioTypes';
import { CapacitorMock, HealthMock } from '../../../tests/mocks/capacitor.js';

const INITIAL_STORE = useEnergyMapStore.getState();

const START = new Date(2026, 2, 10, 7, 0).getTime();
const END = START + 30 * 60_000;

const workout = (overrides = {}) => ({
  workoutType: 'cycling',
  startDate: new Date(START).toISOString(),
  endDate: new Date(END).toISOString(),
  duration: 1800,
  totalEnergyBurned: 300,
  platformId: 'w1',
  sourceId: 'watch',
  sourceName: 'Galaxy Watch',
  ...overrides,
});

const watchSamples = (bpm) =>
  Array.from({ length: 31 }, (_, minute) => ({
    startDate: new Date(START + minute * 60_000).toISOString(),
    value: bpm,
    sourceId: 'watch',
    deviceType: 'watch',
  }));

const renderButton = (props = {}) =>
  render(
    <ImportWorkoutButton
      kind="cardio"
      session={{ type: 'treadmill_walk', effortType: 'intensity' }}
      onChange={vi.fn()}
      dateKey="2026-03-10"
      cardioTypes={cardioTypes}
      onNote={vi.fn()}
      {...props}
    />
  );

/**
 * Sessions stay manual: the button only PREFILLS a draft from a workout the
 * user picks. It exists only while watch sync is connected.
 */
describe('ImportWorkoutButton', () => {
  beforeEach(() => {
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
    HealthMock.queryWorkouts.mockReset().mockResolvedValue({
      workouts: [workout()],
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('renders nothing until watch sync is connected', () => {
    const { container } = renderButton();
    expect(container).toBeEmptyDOMElement();
  });

  it('prefills type, time, duration and the watch heart rate from the picked workout', async () => {
    await connectHeartRateSync();
    HealthMock.readSamples.mockReset().mockResolvedValue({
      samples: watchSamples(138),
    });
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onNote = vi.fn();
    renderButton({ onChange, onNote });

    await user.click(
      screen.getByRole('button', { name: 'Import workout from watch' })
    );
    await user.click(await screen.findByText('Cycling'));

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange.mock.calls[0][0]).toMatchObject({
      type: 'bike_outdoor',
      startTime: '07:00',
      duration: 30,
      healthWorkoutId: 'w1',
      effortType: 'heartRate',
      averageHeartRate: 138,
      heartRateSource: 'healthConnect',
    });
    // The watch's own calorie figure is never copied into the session
    expect(onChange.mock.calls[0][0]).not.toHaveProperty('calories');
    expect(onNote).toHaveBeenLastCalledWith(
      expect.stringMatching(/Imported · avg 138 bpm/)
    );
  });

  it('imports just the time and duration when no heart rate was recorded', async () => {
    await connectHeartRateSync();
    HealthMock.readSamples.mockReset().mockResolvedValue({ samples: [] });
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onNote = vi.fn();
    renderButton({ onChange, onNote });

    await user.click(
      screen.getByRole('button', { name: 'Import workout from watch' })
    );
    await user.click(await screen.findByText('Cycling'));

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange.mock.calls[0][0].averageHeartRate).toBeUndefined();
    expect(onNote).toHaveBeenLastCalledWith(
      expect.stringMatching(/no heart rate was recorded/)
    );
  });

  it('greys out a workout that was already imported', async () => {
    await connectHeartRateSync();
    useEnergyMapStore.setState({
      userData: {
        ...useEnergyMapStore.getState().userData,
        cardioSessions: [
          { id: 's1', date: '2026-03-10', healthWorkoutId: 'w1' },
        ],
      },
    });
    const user = userEvent.setup();
    renderButton();

    await user.click(
      screen.getByRole('button', { name: 'Import workout from watch' })
    );
    const row = (await screen.findByText('Cycling')).closest('button');
    expect(row).toBeDisabled();
    expect(screen.getByText('Imported')).toBeInTheDocument();
  });
});
