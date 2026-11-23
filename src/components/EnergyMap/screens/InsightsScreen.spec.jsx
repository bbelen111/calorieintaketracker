import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { InsightsScreen } from './InsightsScreen';
import { getDefaultEnergyMapData } from '../../../utils/data/storage';
import { getTodayDateKey } from '../../../utils/data/dateKeys';

const addDays = (dateKey, days) => {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const renderScreen = (props = {}) =>
  render(
    <InsightsScreen
      userData={getDefaultEnergyMapData()}
      selectedGoal="maintenance"
      weightEntries={[]}
      bodyFatEntries={[]}
      bodyFatTrackingEnabled
      onOpenWeightTracker={vi.fn()}
      onOpenBodyFatTracker={vi.fn()}
      onOpenBmiInfo={vi.fn()}
      onOpenFfmiInfo={vi.fn()}
      onOpenAdaptiveThermogenesis={vi.fn()}
      onOpenRollingEnergyBalance={vi.fn()}
      onOpenHeartRateTracker={vi.fn()}
      {...props}
    />
  );

/**
 * The Body Composition snapshot cards must never present a verdict without a
 * measurement. `calculateWeightTrend` reports `weeklyRate: 0` for "no entries"
 * and "genuinely stable" alike, so these specs pin the empty / insufficient /
 * usable states apart from each other.
 */
describe('InsightsScreen body composition empty states', () => {
  it('shows guidance instead of a goal verdict when nothing is logged', () => {
    renderScreen();

    expect(screen.getByText('No weigh-ins yet')).toBeInTheDocument();
    expect(screen.getByText('No body fat readings yet')).toBeInTheDocument();
    expect(
      screen.getByText(/Log your weight to track a 7-day trend/)
    ).toBeInTheDocument();

    // No invented trend, no invented alignment.
    expect(screen.queryByText('On track')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Not losing as expected/)
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/0\.0 kg\/wk/)).not.toBeInTheDocument();
    expect(screen.queryByText(/0\.0 %\/wk/)).not.toBeInTheDocument();
    // The profile weight is not a weigh-in and must not be shown as one.
    expect(screen.queryByText(/^74 kg$/)).not.toBeInTheDocument();
  });

  it('asks for one more entry instead of printing a zero rate', () => {
    const today = getTodayDateKey();
    renderScreen({
      weightEntries: [{ date: today, weight: 74 }],
      bodyFatEntries: [{ date: today, bodyFat: 18 }],
    });

    expect(screen.getByText('74 kg')).toBeInTheDocument();
    expect(screen.getByText('18%')).toBeInTheDocument();
    expect(
      screen.getByText('Add one more weigh-in to see your 7-day trend.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Add one more reading to see your 7-day trend.')
    ).toBeInTheDocument();
    expect(screen.queryByText('On track')).not.toBeInTheDocument();
    expect(screen.queryByText(/0\.0 kg\/wk/)).not.toBeInTheDocument();
  });

  it('explains stale entries instead of extrapolating a trend', () => {
    const today = getTodayDateKey();
    renderScreen({
      weightEntries: [
        { date: addDays(today, -30), weight: 80 },
        { date: today, weight: 74 },
      ],
    });

    expect(
      screen.getByText(/Your last two weigh-ins are too far apart/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/kg\/wk/)).not.toBeInTheDocument();
  });

  it('shows the rate and a real alignment chip once the trend is usable', () => {
    const today = getTodayDateKey();
    renderScreen({
      weightEntries: [
        { date: addDays(today, -2), weight: 74 },
        { date: today, weight: 74 },
      ],
    });

    // A real stable rate is a measurement: 0.0 kg/wk is correct here, and a
    // maintenance goal is genuinely on track.
    expect(screen.getByText('0.0 kg/wk')).toBeInTheDocument();
    expect(screen.getByText('On track')).toBeInTheDocument();
    expect(screen.queryByText('On track with goal')).not.toBeInTheDocument();
  });

  it('renders BMI instead of the body fat snapshot when tracking is off', () => {
    renderScreen({ bodyFatTrackingEnabled: false });

    expect(screen.getByText('BMI')).toBeInTheDocument();
    expect(screen.queryByText('Body Fat % Snapshot')).not.toBeInTheDocument();
    expect(
      screen.queryByText('No body fat readings yet')
    ).not.toBeInTheDocument();
  });
});
