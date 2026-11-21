import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RestingHeartRateCard } from './RestingHeartRateCard';
import { resetHeartRateSyncState } from '../../../services/heartRateSync';
import { useEnergyMapStore } from '../../../store/useEnergyMapStore';
import { getTodayDateKey } from '../../../utils/data/dateKeys';

const INITIAL_STORE = useEnergyMapStore.getState();

const daysAgo = (count) => {
  const date = new Date(`${getTodayDateKey()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - count);
  return date.toISOString().slice(0, 10);
};

/**
 * The card follows the Adaptive Thermogenesis / Rolling Balance grammar: blue
 * icon + title + subtitle, the baseline as the headline, two stat tiles and a
 * blue "tap for details" footer. Default profile (age 21): Tanaka max HR 193,
 * Zone 2 = 60-70 % of max = 116-135 bpm.
 */
describe('RestingHeartRateCard', () => {
  beforeEach(() => {
    useEnergyMapStore.setState(INITIAL_STORE);
    resetHeartRateSyncState();
  });

  it('shows the baseline, how today was measured, max HR and Zone 2', () => {
    useEnergyMapStore
      .getState()
      .setManualRestingHeartRate(getTodayDateKey(), 61);
    render(<RestingHeartRateCard onOpen={vi.fn()} onLogReading={vi.fn()} />);

    expect(
      screen.getByRole('heading', { name: 'Resting Heart Rate' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('7-day average · today 61 (manual)')
    ).toBeInTheDocument();
    expect(screen.getByText('61')).toBeInTheDocument();
    // The big number is the shared Insights headline (same as the Adaptive
    // Thermogenesis card), with a small muted unit.
    const headline = screen.getByTestId('resting-hr-headline');
    expect(headline).toHaveClass('block', 'text-3xl', 'font-bold');
    expect(headline).toHaveTextContent('61bpm');
    expect(screen.getByText('Max HR')).toBeInTheDocument();
    expect(screen.getByText('193 bpm')).toBeInTheDocument();
    expect(screen.getByText('Zone 2')).toBeInTheDocument();
    expect(screen.getByText('116–135 bpm')).toBeInTheDocument();
    expect(
      screen.getByText('Trend after 7 readings — tap for details')
    ).toBeInTheDocument();
  });

  it('puts the uncoloured 28-day change in the footer once there are 7 readings', () => {
    const store = useEnergyMapStore.getState();
    // 9 daily readings falling 1 bpm per day (70 -> 62)
    for (let offset = 8; offset >= 0; offset -= 1) {
      store.setManualRestingHeartRate(daysAgo(offset), 62 + offset);
    }
    const { container } = render(
      <RestingHeartRateCard onOpen={vi.fn()} onLogReading={vi.fn()} />
    );

    const footer = screen.getByText(/over 28 days — tap for details/);
    expect(footer).toHaveTextContent(/^-\d+(\.\d)? bpm over 28 days/);
    // Deltas are never traffic-light coloured
    expect(footer.className).toContain('text-accent-blue/80');
    expect(screen.queryByText(/Trend after 7 readings/)).toBeNull();
    // The mockup has no sparkline: the chart lives in the tracker
    expect(container.querySelector('svg polyline')).toBeNull();
  });

  it('is one tap target that opens the tracker', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    useEnergyMapStore
      .getState()
      .setManualRestingHeartRate(getTodayDateKey(), 58);
    render(<RestingHeartRateCard onOpen={onOpen} onLogReading={vi.fn()} />);

    await user.click(screen.getByRole('button'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('offers a manual reading in the empty state, in the same card style', async () => {
    const user = userEvent.setup();
    const onLogReading = vi.fn();
    render(
      <RestingHeartRateCard onOpen={vi.fn()} onLogReading={onLogReading} />
    );

    expect(
      screen.getByRole('heading', { name: 'Resting Heart Rate' })
    ).toBeInTheDocument();
    expect(screen.getByText('Not tracked yet')).toBeInTheDocument();
    expect(screen.queryByText('Max HR')).toBeNull();

    await user.click(screen.getByRole('button', { name: /log a reading/i }));
    expect(onLogReading).toHaveBeenCalledTimes(1);
  });
});
