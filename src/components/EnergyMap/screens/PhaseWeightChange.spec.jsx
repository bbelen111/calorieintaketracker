import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LogbookScreen } from './LogbookScreen';
import { PhaseDetailScreen } from './PhaseDetailScreen';
import { useEnergyMapStore } from '../../../store/useEnergyMapStore';
import { getDefaultEnergyMapData } from '../../../utils/data/storage';

const PHASE = {
  id: 1,
  name: 'Spring Cut',
  startDate: '2026-01-01',
  endDate: '2026-03-01',
  goalType: 'cutting',
  status: 'active',
  startingWeight: 80,
  dailyLogs: {},
};

// A 2 kg loss: far below the 30 kg floor `formatWeight` clamps to.
const WEIGHTS = [
  { date: '2026-01-01', weight: 80 },
  { date: '2026-02-01', weight: 78 },
];

const seed = () =>
  act(() => {
    useEnergyMapStore.setState({ userData: getDefaultEnergyMapData() });
  });

describe('phase weight change', () => {
  it('shows a small loss as a signed change on the Logbook card', () => {
    seed();
    render(
      <LogbookScreen
        phases={[PHASE]}
        weightEntries={WEIGHTS}
        nutritionData={{}}
        onCreatePhase={vi.fn()}
        onPhaseClick={vi.fn()}
        onOpenDayLedger={vi.fn()}
      />
    );

    expect(screen.getByText(/80 kg → -2\.0 kg/)).toBeInTheDocument();
    expect(screen.queryByText(/30 kg/)).not.toBeInTheDocument();
  });

  it('keeps the minus sign on Phase Detail', () => {
    seed();
    render(
      <PhaseDetailScreen
        phase={PHASE}
        weightEntries={WEIGHTS}
        nutritionData={{}}
        onBack={vi.fn()}
        onAddLog={vi.fn()}
        onEditLog={vi.fn()}
        onArchive={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByText('-2.0 kg')).toBeInTheDocument();
    expect(screen.queryByText('30 kg')).not.toBeInTheDocument();
  });
});
