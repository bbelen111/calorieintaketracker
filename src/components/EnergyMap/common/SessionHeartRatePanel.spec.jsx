import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { SessionHeartRatePanel } from './SessionHeartRatePanel';
import { useEnergyMapStore } from '../../../store/useEnergyMapStore';

const INITIAL_STORE = useEnergyMapStore.getState();

/**
 * Sessions are entered by hand, so the panel is display-only context under the
 * form's average-HR button: no "Use watch data", no "Record live", nothing to
 * press (importing a workout lives in `ImportWorkoutButton`).
 */
describe('SessionHeartRatePanel', () => {
  beforeEach(() => {
    useEnergyMapStore.setState(INITIAL_STORE);
  });

  it('shows the zone chip for a typed average, and nothing to press', () => {
    render(
      <SessionHeartRatePanel
        session={{
          effortType: 'heartRate',
          averageHeartRate: 150,
          heartRateSource: 'manual',
        }}
        dateKey="2026-03-10"
      />
    );
    expect(screen.getByText(/^Z\d/)).toBeInTheDocument();
    expect(screen.getByText('Entered')).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('shows provenance, peak, coverage and time-in-zone for an imported session', () => {
    render(
      <SessionHeartRatePanel
        session={{
          effortType: 'heartRate',
          averageHeartRate: 142,
          maxHeartRate: 171,
          heartRateSource: 'healthConnect',
          heartRateCoverage: 0.92,
          heartRateZoneSeconds: [0, 120, 900, 300, 0],
        }}
        dateKey="2026-03-10"
      />
    );
    expect(screen.getByText('From watch')).toBeInTheDocument();
    expect(screen.getByText('peak 171')).toBeInTheDocument();
    expect(screen.getByText('92% covered')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Time in heart-rate zones' })
    ).toBeInTheDocument();
  });

  it('renders nothing for an intensity session with no heart rate', () => {
    const { container } = render(
      <SessionHeartRatePanel
        session={{ effortType: 'intensity', averageHeartRate: '' }}
        dateKey="2026-03-10"
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
