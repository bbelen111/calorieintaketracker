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
  ['CardioModal', renderCardio, CardioModal],
  ['TrainingModal', renderTraining, TrainingModal],
])('%s heart-rate affordances', (name, renderForm, Form) => {
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

  describe('with heart rate tracking off', () => {
    const intensitySession = {
      date: '2026-03-10',
      type: name === 'CardioModal' ? 'treadmill_run' : 'trainingtype_1',
      startTime: '07:00',
      duration: 30,
      durationHours: 1,
      effortType: 'intensity',
      intensity: 'moderate',
    };

    beforeEach(() => {
      useEnergyMapStore
        .getState()
        .handleUserDataChange('heartRateTrackingEnabled', false);
    });

    it('offers intensity only, and no Import', async () => {
      await connectHeartRateSync();
      renderForm({ session: intensitySession });

      expect(screen.queryByText('Effort Tracking')).toBeNull();
      expect(screen.queryByText('Average Heart Rate')).toBeNull();
      expect(screen.getByText('Intensity')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Import workout from watch' })
      ).toBeNull();
    });

    it('keeps the choice for a session that already uses heart rate', () => {
      const { rerender } = renderForm();
      expect(screen.getByText('Effort Tracking')).toBeInTheDocument();
      expect(screen.getByText('150 bpm')).toBeInTheDocument();

      // Switching to intensity can still be undone while the form is open.
      rerender(
        <Form
          isOpen
          isClosing={false}
          cardioTypes={cardioTypes}
          customCardioTypes={{}}
          session={intensitySession}
          onChange={noop}
          onCancel={noop}
          onSave={noop}
        />
      );
      expect(screen.getByText('Effort Tracking')).toBeInTheDocument();
    });
  });

  it('does not offer Import when editing a favourite template', async () => {
    await connectHeartRateSync();
    renderForm({ mode: 'favourite' });
    expect(
      screen.queryByRole('button', { name: 'Import workout from watch' })
    ).toBeNull();
  });
});
