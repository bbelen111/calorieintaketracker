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
      onEditReading={vi.fn()}
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

  it('stretches a lone reading into a flat line across the whole plot', () => {
    useEnergyMapStore.setState(INITIAL_STORE);
    useEnergyMapStore.getState().setManualRestingHeartRate(daysAgo(0), 58);
    const { baseElement } = renderModal();
    const svg = baseElement.querySelector(
      'svg[aria-label="Resting heart rate chart"]'
    );
    const width = Number(svg.getAttribute('width'));
    const linePath = [...svg.querySelectorAll('path')].find(
      (path) => path.getAttribute('fill') === 'none'
    );
    expect(linePath.getAttribute('d')).toMatch(
      new RegExp(`^M 0 [\\d.]+ L ${width} [\\d.]+$`)
    );
  });

  it('gives each day room to tap: 30d and 90d plots scroll instead of cramming', async () => {
    const user = userEvent.setup();
    seedReadings();
    const { baseElement } = renderModal();
    const plotWidth = () =>
      Number(
        baseElement
          .querySelector('svg[aria-label="Resting heart rate chart"]')
          .getAttribute('width')
      );
    // 30 slots x 24px, 90 slots x 20px — both wider than the viewport.
    expect(plotWidth()).toBe(720);
    await user.click(screen.getByRole('button', { name: '90 days' }));
    expect(plotWidth()).toBe(1800);
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

  it('tapping a day opens the card with an uncoloured vs-prev delta; re-tap edits its manual reading', async () => {
    const user = userEvent.setup();
    const onAddReading = vi.fn();
    const onEditReading = vi.fn();
    seedReadings();
    const { baseElement } = renderModal({ onAddReading, onEditReading });

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
    expect(onEditReading).toHaveBeenCalledWith(getTodayDateKey());
    expect(onAddReading).not.toHaveBeenCalled();
  });

  it('re-tapping a day that only has a watch reading adds a manual one instead', async () => {
    const user = userEvent.setup();
    const onAddReading = vi.fn();
    const onEditReading = vi.fn();
    seedReadings();
    // Today now holds only a watch reading (no manual one to edit)
    useEnergyMapStore
      .getState()
      .setManualRestingHeartRate(getTodayDateKey(), null);
    useEnergyMapStore
      .getState()
      .saveHeartRateEntries([
        { date: getTodayDateKey(), restingHr: 54, restingHrMethod: 'device' },
      ]);
    const { baseElement } = renderModal({ onAddReading, onEditReading });

    const hitTargets = baseElement.querySelectorAll(
      'svg[aria-label="Resting heart rate chart"] rect.cursor-pointer'
    );
    const last = hitTargets[hitTargets.length - 1];
    await user.click(last);
    await user.click(last);
    expect(onAddReading).toHaveBeenCalledWith(getTodayDateKey());
    expect(onEditReading).not.toHaveBeenCalled();
  });

  it('the log-resting bar always adds, even when today already has a manual reading', async () => {
    const user = userEvent.setup();
    const onAddReading = vi.fn();
    const onEditReading = vi.fn();
    seedReadings(); // includes a manual reading for today
    renderModal({ onAddReading, onEditReading });
    await user.click(screen.getByRole('button', { name: 'Log resting' }));
    expect(onAddReading).toHaveBeenCalledWith(getTodayDateKey());
    expect(onEditReading).not.toHaveBeenCalled();
  });
});
