import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CardioModal } from './CardioModal';
import { TrainingModal } from './TrainingModal';
import {
  connectHeartRateSync,
  resetHeartRateSyncState,
} from '../../../../services/heartRateSync';
import { useEnergyMapStore } from '../../../../store/useEnergyMapStore';
import { cardioTypes } from '../../../../constants/cardio/cardioTypes';
import {
  CapacitorMock,
  HealthMock,
} from '../../../../tests/mocks/capacitor.js';

const INITIAL_STORE = useEnergyMapStore.getState();

const noop = vi.fn();

const renderCardio = (props = {}) =>
  render(
    <CardioModal
      isOpen
      isClosing={false}
      cardioTypes={cardioTypes}
      customCardioTypes={{}}
      session={{
        date: '2026-03-10',
        type: 'treadmill_run',
        startTime: '07:00',
        duration: 30,
        effortType: 'heartRate',
        averageHeartRate: 150,
      }}
      onChange={noop}
      onCancel={noop}
      onSave={noop}
      onOpenFavourites={noop}
      showFavouritesButton
      {...props}
    />
  );

const renderTraining = (props = {}) =>
  render(
    <TrainingModal
      isOpen
      isClosing={false}
      session={{
        date: '2026-03-10',
        type: 'trainingtype_1',
        startTime: '07:00',
        durationHours: 1,
        effortType: 'heartRate',
        averageHeartRate: 150,
      }}
      onChange={noop}
      onCancel={noop}
      onSave={noop}
      onOpenFavourites={noop}
      showFavouritesButton
      {...props}
    />
  );

/**
 * Cardio and training sessions are entered by hand. The only watch affordance
 * is "Import" (a prefill), next to Favourites; "Use watch data" and "Record
 * live" are not part of the forms (live sessions are a later addition).
 */
describe.each([
  ['CardioModal', renderCardio],
  ['TrainingModal', renderTraining],
])('%s heart-rate affordances', (_name, renderForm) => {
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
  });

  it('has no "Use watch data" or "Record live" action, even with sync connected', async () => {
    await connectHeartRateSync();
    renderForm();
    expect(
      screen.queryByRole('button', { name: /use watch data/i })
    ).toBeNull();
    expect(screen.queryByRole('button', { name: /record live/i })).toBeNull();
  });

  it('puts Import right beside Favourites in the header row', async () => {
    await connectHeartRateSync();
    renderForm();

    const importButton = screen.getByRole('button', {
      name: 'Import workout from watch',
    });
    const favourites = screen.getByRole('button', { name: /favourites/i });
    expect(importButton.parentElement).toBe(favourites.parentElement);
    // Import comes first so Favourites keeps its long-standing right edge
    const siblings = Array.from(importButton.parentElement.children);
    expect(siblings.indexOf(importButton)).toBeLessThan(
      siblings.indexOf(favourites)
    );
  });

  it('hides Import while watch sync is not connected', () => {
    renderForm();
    expect(
      screen.queryByRole('button', { name: 'Import workout from watch' })
    ).toBeNull();
    // Favourites is unaffected
    expect(
      screen.getByRole('button', { name: /favourites/i })
    ).toBeInTheDocument();
  });

  it('does not offer Import when editing a favourite template', async () => {
    await connectHeartRateSync();
    renderForm({ mode: 'favourite' });
    expect(
      screen.queryByRole('button', { name: 'Import workout from watch' })
    ).toBeNull();
  });
});
