import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HeartRateTrackerModal } from './HeartRateTrackerModal';
import { useEnergyMapStore } from '../../../../store/useEnergyMapStore';
import { getTodayDateKey } from '../../../../utils/data/dateKeys';

const INITIAL_STORE = useEnergyMapStore.getState();

const daysAgo = (count) => {
  const date = new Date(`${getTodayDateKey()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - count);
  return date.toISOString().slice(0, 10);
};

const seedReadings = () => {
  useEnergyMapStore.setState(INITIAL_STORE);
  const store = useEnergyMapStore.getState();
  [
    [3, 60],
    [2, 58],
    [1, 57],
    [0, 55],
  ].forEach(([offset, bpm]) =>
    store.setManualRestingHeartRate(daysAgo(offset), bpm)
  );
};

const renderModal = (props = {}) =>
  render(
    <HeartRateTrackerModal
      isOpen
      isClosing={false}
      onClose={vi.fn()}
      onAddReading={vi.fn()}
      onOpenZonesInfo={vi.fn()}
      {...props}
    />
  );

describe('HeartRateTrackerModal', () => {
  beforeEach(() => {
    useEnergyMapStore.setState(INITIAL_STORE);
  });

  it('shows a guided empty state without readings', async () => {
    const user = userEvent.setup();
    const onAddReading = vi.fn();
    renderModal({ onAddReading });

    expect(screen.getByText('No resting heart rate yet')).toBeInTheDocument();
    expect(
      screen.getByText(/Three readings unlock personal heart-rate zones/)
    ).toBeInTheDocument();
    // No all-dash stat strip, window toggle or log bar — the empty state owns
    // the surface and the action.
    expect(screen.queryByText('Resting')).toBeNull();
    expect(screen.queryByText('Latest')).toBeNull();
    expect(screen.queryByText('28-day change')).toBeNull();
    expect(screen.queryByRole('button', { name: '30 days' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Log resting' })).toBeNull();

    await user.click(
      screen.getByRole('button', { name: 'Log a resting reading' })
    );
    expect(onAddReading).toHaveBeenCalledWith(getTodayDateKey());
  });

  it('charts readings, shows personal zones and the 7-day baseline', () => {
    seedReadings();
    const { baseElement } = renderModal();
    // Scoped to the chart: lucide icons elsewhere in the modal draw circles too
    expect(
      baseElement.querySelectorAll(
        'svg[aria-label="Resting heart rate chart"] circle'
      ).length
    ).toBe(4);
    expect(screen.getByText('Your zones')).toBeInTheDocument();
    // 4 readings within two weeks -> heart-rate reserve zones
    expect(screen.getByText(/^Reserve \d+ → \d+ bpm$/)).toBeInTheDocument();
  });

  it('keeps the zones list collapsed until the row is tapped', async () => {
    const user = userEvent.setup();
    seedReadings();
    renderModal();
    const toggle = screen.getByRole('button', { name: /your zones/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Zone 3')).toBeVisible();
  });

  it('tapping a day opens the card with an uncoloured vs-prev delta; re-tap edits', async () => {
    const user = userEvent.setup();
    const onAddReading = vi.fn();
    seedReadings();
    const { baseElement } = renderModal({ onAddReading });

    const hitTargets = baseElement.querySelectorAll(
      'svg[aria-label="Resting heart rate chart"] rect.cursor-pointer'
    );
    const last = hitTargets[hitTargets.length - 1];
    await user.click(last);

    const card = baseElement
      .querySelector('button[aria-label="Selected resting heart rate"]')
      .closest('[aria-hidden]');
    expect(card).toHaveAttribute('aria-hidden', 'false');
    expect(card).toHaveTextContent('vs prev');
    expect(card).toHaveTextContent('-2 bpm');

    await user.click(last);
    expect(onAddReading).toHaveBeenCalledWith(getTodayDateKey());
  });

  it('logs a reading for today from the log-resting bar once readings exist', async () => {
    const user = userEvent.setup();
    const onAddReading = vi.fn();
    seedReadings();
    renderModal({ onAddReading });
    await user.click(screen.getByRole('button', { name: 'Log resting' }));
    expect(onAddReading).toHaveBeenCalledWith(getTodayDateKey());
  });
});
