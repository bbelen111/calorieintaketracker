import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CalorieBreakdownModal } from './CalorieBreakdownModal';
import { getTodayDateKey } from '../../../../utils/data/dateKeys';

const GOALS_FIXTURE = {
  cutting: {
    label: 'Cutting',
    desc: '-500 kcal deficit',
    color: 'bg-accent-yellow',
  },
};

// Minimal breakdown shaped like `calculateCalorieBreakdown` output.
const BREAKDOWN_FIXTURE = {
  total: 2631,
  baselineTotal: 2631,
  bmr: 1780,
  bmrDetails: { method: 'mifflin-st-jeor' },
  baseActivity: 391,
  activityMultiplier: 0.22,
  rawActivityMultiplier: 0.22,
  effectiveActivityMultiplier: 0.12,
  tefOffsetApplied: 0.1,
  tefMode: 'target',
  smartTefCalories: 264,
  smartTefDetails: { source: 'target-macros' },
  epocEnabled: false,
  epocCalories: 0,
  trainingEpoc: 0,
  cardioEpoc: 0,
  epocFromTodaySessions: 0,
  epocCarryInCalories: 0,
  adaptiveThermogenesisMode: 'off',
  adaptiveThermogenesisCorrection: 0,
  adaptiveThermogenesis: null,
  estimatedSteps: 8000,
  stepCalories: 196,
  stepDetails: { estimatedSteps: 8000 },
  trainingBurn: 0,
  cardioBurn: 0,
  trainingDuration: 0,
  trainingCaloriesPerHour: 0,
  cardioDetails: [],
};

const renderModal = (props = {}) =>
  render(
    <CalorieBreakdownModal
      isOpen
      isClosing={false}
      stepRange={8000}
      selectedDay="rest"
      selectedGoal="cutting"
      goals={GOALS_FIXTURE}
      breakdown={BREAKDOWN_FIXTURE}
      targetCalories={2131}
      difference={-500}
      onClose={vi.fn()}
      {...props}
    />
  );

describe('CalorieBreakdownModal', () => {
  it('renders the breakdown and total TDEE', () => {
    renderModal();

    expect(screen.getByText('Calorie Breakdown')).toBeInTheDocument();
    expect(screen.getByText('Total TDEE')).toBeInTheDocument();
    expect(screen.getByText(/2,631 kcal/)).toBeInTheDocument();
  });

  it('shows a date chip only when the breakdown is for a past day', () => {
    renderModal({ dateKey: '2020-01-01' });

    expect(screen.getByText(/2020/)).toBeInTheDocument();
  });

  it('hides the date chip for today and when no date is supplied', () => {
    const today = getTodayDateKey();

    const { unmount } = renderModal({ dateKey: today });
    expect(screen.queryByText(new RegExp(today.slice(0, 4)))).toBeNull();
    unmount();

    renderModal({ dateKey: null });
    expect(screen.queryByText(/2020/)).toBeNull();
  });

  it('surfaces the recorded TDEE when the recompute differs', () => {
    renderModal({ dateKey: '2020-01-01', recordedTdee: 2367 });

    expect(screen.getByText(/Recorded that day:/)).toBeInTheDocument();
    expect(screen.getByText(/2,367 kcal/)).toBeInTheDocument();
  });

  it('omits the recorded TDEE line when it matches the recompute', () => {
    renderModal({ dateKey: '2020-01-01', recordedTdee: 2631 });

    expect(screen.queryByText(/Recorded that day:/)).toBeNull();
  });

  it('renders nothing while closed', () => {
    renderModal({ isOpen: false });

    expect(screen.queryByText('Calorie Breakdown')).toBeNull();
  });
});
