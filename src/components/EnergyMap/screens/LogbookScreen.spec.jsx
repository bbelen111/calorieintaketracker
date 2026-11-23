import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LogbookScreen } from './LogbookScreen';
import { useEnergyMapStore } from '../../../store/useEnergyMapStore';
import { getDefaultEnergyMapData } from '../../../utils/data/storage';
import { getTodayDateKey } from '../../../utils/data/dateKeys';

const addDays = (dateKey, days) => {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

// A logged day on a Moderate Cut (target +300 deficit).
const makeSnapshot = (date, deficit, overrides = {}) => ({
  date,
  tdee: 2500,
  intake: 2500 - deficit,
  deficit,
  goalAtSnapshot: 'cutting',
  goalTarget: 300,
  ...overrides,
});

const seed = (dailySnapshots, userDataOverrides = {}) =>
  act(() => {
    useEnergyMapStore.setState({
      selectedGoal: 'cutting',
      goalDailyBalanceTarget: 300,
      userData: {
        ...getDefaultEnergyMapData(),
        selectedGoal: 'cutting',
        dailySnapshots,
        ...userDataOverrides,
      },
    });
  });

const renderScreen = (props = {}) =>
  render(
    <LogbookScreen
      phases={[]}
      weightEntries={[]}
      nutritionData={{}}
      onCreatePhase={vi.fn()}
      onPhaseClick={vi.fn()}
      onOpenDayLedger={vi.fn()}
      {...props}
    />
  );

const yesterdayKey = () => addDays(getTodayDateKey(), -1);

describe('LogbookScreen Daily Ledger card', () => {
  afterEach(() =>
    act(() => {
      useEnergyMapStore.setState({
        selectedGoal: 'maintenance',
        goalDailyBalanceTarget: 0,
        userData: { ...getDefaultEnergyMapData(), dailySnapshots: {} },
      });
    })
  );

  it('invites the first entry when nothing is logged', () => {
    seed({});
    renderScreen();

    expect(screen.getByText('Daily Ledger')).toBeInTheDocument();
    expect(screen.getByText('No days yet')).toBeInTheDocument();
    expect(screen.queryByTestId('day-ledger-strip')).not.toBeInTheDocument();
  });

  it('explains the empty ledger in the subtitle', () => {
    seed({});
    renderScreen();

    expect(
      screen.getByText('Browse your day-by-day energy history')
    ).toBeInTheDocument();
  });

  it('anchors the headline with the first day logged', () => {
    const y = yesterdayKey();
    const first = addDays(y, -9);
    seed({
      [first]: makeSnapshot(first, 300),
      [y]: makeSnapshot(y, 300),
    });
    renderScreen();

    const expected = new Date(`${first}T00:00:00Z`).toLocaleDateString(
      'en-US',
      { month: 'short', day: 'numeric', timeZone: 'UTC' }
    );
    expect(screen.getByText(`Tracking since ${expected}`)).toBeInTheDocument();
  });

  it('stacks the unit beside the count and reads singular for one day', () => {
    const y = yesterdayKey();
    seed({ [y]: makeSnapshot(y, 300) });
    renderScreen();

    const headline = screen.getByTestId('day-ledger-headline');
    expect(headline).toHaveTextContent(/^1\s*day\s*logged$/);
    // Two separate lines, not one run-on "days logged" string.
    expect(within(headline).getByText('day')).toBeInTheDocument();
    expect(within(headline).getByText('logged')).toBeInTheDocument();
  });

  it('previews the strip, the on-target count, the goal streak and both tiles', () => {
    const y = yesterdayKey();
    seed({
      [y]: makeSnapshot(y, 340), // +40 vs target: on target
      [addDays(y, -1)]: makeSnapshot(addDays(y, -1), 290),
      [addDays(y, -2)]: makeSnapshot(addDays(y, -2), 310),
    });
    renderScreen();

    expect(screen.getByTestId('day-ledger-headline')).toHaveTextContent(
      /^3\s*days\s*logged$/
    );
    expect(screen.getByTestId('day-ledger-strip')).toHaveAttribute(
      'aria-label',
      '3 of 14 recent days logged'
    );
    expect(
      screen.getByText('3 of 3 logged days on target')
    ).toBeInTheDocument();
    expect(screen.getByText(/3-day Moderate Cut\s+streak/)).toBeInTheDocument();

    // Yesterday tile: the day's balance, its verdict and its target.
    expect(
      screen.getByText('Yesterday', { selector: 'p' })
    ).toBeInTheDocument();
    expect(screen.getByText('On target')).toBeInTheDocument();
    expect(screen.getByText(/target \+300/)).toBeInTheDocument();

    // Average tile: stacked 7 / 14 day rows.
    expect(screen.getByText('Average balance')).toBeInTheDocument();
    expect(screen.getByText('7 days')).toBeInTheDocument();
    expect(screen.getByText('14 days')).toBeInTheDocument();
  });

  it('flags a day that missed its target and dims its bar', () => {
    const y = yesterdayKey();
    seed({ [y]: makeSnapshot(y, 700) }); // +400 vs target
    renderScreen();

    expect(screen.getByText('+400 vs target')).toBeInTheDocument();
    expect(screen.queryByText(/-day Moderate Cut/)).not.toBeInTheDocument();
    const bars = screen
      .getByTestId('day-ledger-strip')
      .querySelectorAll('[data-on-target]');
    expect(bars).toHaveLength(1);
    expect(bars[0]).toHaveAttribute('data-on-target', 'false');
  });

  it('judges days against the on-target range from Settings', () => {
    const y = yesterdayKey();
    // +100 vs target: on target at +/-100 or wider, off at +/-50.
    seed({ [y]: makeSnapshot(y, 400) }, { onTargetToleranceKcal: 50 });
    const { unmount } = renderScreen();
    expect(screen.getByText('+100 vs target')).toBeInTheDocument();
    unmount();

    seed({ [y]: makeSnapshot(y, 400) }, { onTargetToleranceKcal: 100 });
    renderScreen();
    expect(screen.getByText('On target')).toBeInTheDocument();
  });

  it('does not count a launch-seeded day with nothing eaten', () => {
    const y = yesterdayKey();
    seed({
      [y]: makeSnapshot(y, 2500, { intake: 0 }),
    });
    renderScreen();

    expect(screen.getByText('No days yet')).toBeInTheDocument();
  });

  it('opens the ledger when tapped', () => {
    const y = yesterdayKey();
    seed({ [y]: makeSnapshot(y, 300) });
    const onOpenDayLedger = vi.fn();
    renderScreen({ onOpenDayLedger });

    fireEvent.click(screen.getByRole('button', { name: /^Daily Ledger,/ }));

    expect(onOpenDayLedger).toHaveBeenCalledTimes(1);
  });
});
