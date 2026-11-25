import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LogbookScreen } from './screens/LogbookScreen';
import { PhaseDetailScreen } from './screens/PhaseDetailScreen';
import { WeightTrackerModal } from './modals/fullscreen/WeightTrackerModal';
import { CalorieBreakdownModal } from './modals/info/CalorieBreakdownModal';
import { BmiInfoModal } from './modals/info/BmiInfoModal';
import { useEnergyMapStore } from '../../store/useEnergyMapStore';
import { getDefaultEnergyMapData } from '../../utils/data/storage';
import { DEFAULT_UNIT_PREFERENCES } from '../../constants/units/units';
import { calculateCalorieBreakdown } from '../../utils/calculations/calculations';
import { buildHeroActionModel } from '../../utils/calculations/heroActionMetrics';

const seed = (unitPreferences) =>
  act(() => {
    useEnergyMapStore.setState({
      userData: {
        ...getDefaultEnergyMapData(),
        unitPreferences: {
          ...DEFAULT_UNIT_PREFERENCES,
          ...unitPreferences,
        },
      },
    });
  });

const PHASE = {
  id: 1,
  name: 'Spring Cut',
  startDate: '2026-01-01',
  endDate: '2026-03-01',
  goalType: 'cutting',
  status: 'active',
  startingWeight: 80,
  targetWeight: 75,
  dailyLogs: {},
};

const WEIGHTS = [
  { date: '2026-01-01', weight: 80 },
  { date: '2026-02-01', weight: 78 },
];

afterEach(() => seed({}));

describe('body units on screen', () => {
  it('writes a phase in pounds on the Logbook card and Phase Detail', () => {
    seed({ bodyWeight: 'lb' });
    const props = { weightEntries: WEIGHTS, nutritionData: {} };
    const { unmount } = render(
      <LogbookScreen
        {...props}
        phases={[PHASE]}
        onCreatePhase={vi.fn()}
        onPhaseClick={vi.fn()}
        onOpenDayLedger={vi.fn()}
      />
    );
    expect(
      screen.getByText(/176\.4 lb → -4\.4 lb \(Target: 165\.3 lb\)/)
    ).toBeInTheDocument();
    unmount();

    render(
      <PhaseDetailScreen
        {...props}
        phase={PHASE}
        onBack={vi.fn()}
        onAddLog={vi.fn()}
        onEditLog={vi.fn()}
        onArchive={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByText('-4.4 lb')).toBeInTheDocument();
  });

  it('shows the weight tracker in stone with changes in pounds', async () => {
    seed({ bodyWeight: 'st' });
    const user = userEvent.setup();
    const { baseElement } = render(
      <WeightTrackerModal
        isOpen
        isClosing={false}
        entries={[
          { date: '2026-01-01', weight: 74 },
          { date: '2026-01-02', weight: 74.5 },
        ]}
        latestWeight={74.5}
        selectedGoal="maintenance"
        onClose={vi.fn()}
        onAddEntry={vi.fn()}
        onEditEntry={vi.fn()}
      />
    );

    expect(screen.getAllByText('11 st 10.2 lb').length).toBeGreaterThan(0);
    expect(screen.queryByText(/\bkg\b/)).not.toBeInTheDocument();

    const points = baseElement.querySelectorAll('svg g.cursor-pointer');
    await user.click(points[points.length - 1]);
    expect(screen.getAllByText('+1.1 lb').length).toBeGreaterThan(0);
  });

  it('shows BMI inputs in pounds and feet while keeping the SI formula', () => {
    seed({ bodyWeight: 'lb', height: 'ft' });
    render(
      <BmiInfoModal
        isOpen
        isClosing={false}
        userData={{ weight: 74.5, height: 168 }}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('164.2 lb')).toBeInTheDocument();
    expect(screen.getByText('5′6″')).toBeInTheDocument();
    expect(screen.getByText(/weight \(kg\)/)).toBeInTheDocument();
  });

  it.each([
    ['km', /steps\/km/],
    ['mi', /steps\/mi/],
  ])('writes the step calculation per %s', (distance, perUnit) => {
    seed({ distance });
    const userData = getDefaultEnergyMapData();
    const breakdown = calculateCalorieBreakdown({
      steps: 10000,
      isTrainingDay: false,
      userData,
      bmr: 1700,
      cardioTypes: {},
      trainingTypes: userData.trainingType,
    });
    render(
      <CalorieBreakdownModal
        isOpen
        isClosing={false}
        stepRange={10000}
        selectedDay="rest"
        selectedGoal="maintenance"
        breakdown={breakdown}
        targetCalories={breakdown.total}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText(perUnit)).toBeInTheDocument();
  });

  it('labels the Home weight tile in the chosen unit', () => {
    const model = buildHeroActionModel({
      metric: 'weight',
      userData: { unitPreferences: { bodyWeight: 'st' } },
      weight: { display: '11 st 10.2', dateLabel: 'Today' },
    });

    expect(model.primary).toBe('11 st 10.2 lb');
    expect(model.unit).toBe('lb');
  });
});
