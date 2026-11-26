import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GoalPlanCard } from './GoalPlanCard';
import { goals } from '../../../constants/goals/goals';

const TODAY = '2026-11-26';

const snapshot = (date, deficit, goalTarget = 300) => ({
  date,
  tdee: 2400,
  intake: 2400 - deficit,
  deficit,
  goalAtSnapshot: 'cutting',
  goalTarget,
});

const renderCard = (props = {}) => {
  const handlers = {
    onGoalClick: vi.fn(),
    onOpenActivePhase: vi.fn(),
    onStartPhase: vi.fn(),
  };
  render(
    <GoalPlanCard
      selectedGoal="cutting"
      goalConfig={goals.cutting}
      goalDurationDays={22}
      isGoalLocked={false}
      activePhase={null}
      weightEntries={[]}
      dailySnapshots={{}}
      onTargetTolerance={100}
      {...handlers}
      {...props}
    />
  );
  return handlers;
};

describe('GoalPlanCard', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${TODAY}T12:00:00`));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('goal state: the goal tile opens the goal modal and the footer starts a phase', async () => {
    const user = userEvent.setup();
    const handlers = renderCard();

    const card = screen.getByTestId('goal-plan-card');
    expect(card).toHaveAttribute('data-state', 'goal');
    expect(card).toHaveTextContent('Your Goal');
    expect(screen.getByTestId('goal-plan-day-badge')).toHaveTextContent(
      'Day 23'
    );
    expect(card).toHaveTextContent('-300 kcal deficit');
    expect(card).toHaveTextContent('Tap to change');

    await user.click(
      screen.getByRole('button', { name: /Goal: Moderate Cut.*Change goal/ })
    );
    expect(handlers.onGoalClick).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /Start a phase/ }));
    expect(handlers.onStartPhase).toHaveBeenCalledTimes(1);
  });

  it('goal state: no data hides the detail rows instead of showing hints', () => {
    renderCard();
    const card = screen.getByTestId('goal-plan-card');
    expect(screen.queryByTestId('goal-plan-adherence')).not.toBeInTheDocument();
    expect(screen.queryByTestId('goal-plan-strip')).not.toBeInTheDocument();
    expect(screen.queryByTestId('goal-plan-trend')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('goal-plan-projection')
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('goal-plan-nudge')).not.toBeInTheDocument();
    expect(card).not.toHaveTextContent('Log a few days');
    expect(card).not.toHaveTextContent('weigh-in');
    // The way forward stays.
    expect(
      screen.getByRole('button', { name: /Start a phase/ })
    ).toBeInTheDocument();
  });

  it('goal state: the phase prompt can be turned off', () => {
    renderCard({ showPhasePrompt: false });
    expect(screen.queryByText('Give it an end date')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Start a phase/ })
    ).not.toBeInTheDocument();
    // The goal itself stays.
    expect(
      screen.getByRole('button', { name: /Change goal/ })
    ).toBeInTheDocument();
  });

  it('goal state: a single weigh-in shows no trend row yet', () => {
    renderCard({ weightEntries: [{ date: TODAY, weight: 80 }] });
    expect(screen.queryByTestId('goal-plan-trend')).not.toBeInTheDocument();
  });

  it('goal state: logged days, a trend and a projection', () => {
    renderCard({
      dailySnapshots: {
        '2026-11-24': snapshot('2026-11-24', 320),
        '2026-11-25': snapshot('2026-11-25', 280),
      },
      weightEntries: [
        { date: '2026-11-12', weight: 80 },
        { date: '2026-11-19', weight: 79.6 },
        { date: '2026-11-26', weight: 79.2 },
      ],
    });
    expect(screen.getByTestId('goal-plan-strip')).toBeInTheDocument();
    expect(screen.getByTestId('goal-plan-adherence')).toHaveTextContent(
      '2 of 2 logged days on target'
    );
    expect(screen.getByTestId('goal-plan-adherence')).toHaveTextContent(
      '2-day streak'
    );
    expect(screen.getByTestId('goal-plan-trend')).toHaveTextContent('-0.40');
    expect(screen.getByTestId('goal-plan-trend')).toHaveTextContent('On track');
    expect(screen.getByTestId('goal-plan-projection')).toHaveTextContent(
      'In 4 weeks'
    );
  });

  it('goal state: a stale weigh-in is called out', () => {
    renderCard({
      weightEntries: [
        { date: '2026-11-01', weight: 80 },
        { date: '2026-11-10', weight: 79.4 },
      ],
    });
    expect(screen.getByTestId('goal-plan-nudge')).toHaveTextContent(
      'No weigh-in for 16 days'
    );
    expect(
      screen.queryByTestId('goal-plan-projection')
    ).not.toBeInTheDocument();
  });

  it('phase state: the tile locks to the phase target and a glance row opens the phase', async () => {
    const user = userEvent.setup();
    const handlers = renderCard({
      isGoalLocked: true,
      balanceTarget: 550,
      activePhase: {
        name: 'Summer Cut',
        startDate: '2026-11-09',
        endDate: '2027-01-03',
        targetWeight: null,
        startingWeight: 80,
      },
    });

    const card = screen.getByTestId('goal-plan-card');
    expect(card).toHaveAttribute('data-state', 'phase');
    expect(card).toHaveTextContent('Your Goal');
    // The phase's own smart delta, not the goal's nominal -300.
    expect(card).toHaveTextContent('-550 kcal deficit');
    expect(card).toHaveTextContent('Set by your phase');
    expect(card).not.toHaveTextContent('Tap to change');
    expect(screen.queryByTestId('goal-plan-day-badge')).not.toBeInTheDocument();
    expect(card).toHaveTextContent('Summer Cut · Day 18 of 56');
    expect(screen.getByTestId('goal-plan-progress')).toHaveAttribute(
      'aria-valuenow',
      '32'
    );
    // No goal detail, no "Start a phase" while one runs.
    expect(screen.queryByTestId('goal-plan-adherence')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Start a phase/ })
    ).not.toBeInTheDocument();

    const tile = screen.getByRole('button', { name: /Set by your phase/ });
    expect(tile).toBeDisabled();
    await user.click(tile);
    expect(handlers.onGoalClick).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Open phase/ }));
    expect(handlers.onOpenActivePhase).toHaveBeenCalledTimes(1);
  });

  it('phase state: an open-ended phase shows the day and no bar', () => {
    renderCard({
      isGoalLocked: true,
      activePhase: {
        name: 'Lean Bulk',
        startDate: '2026-11-20',
        endDate: null,
        startingWeight: 74,
      },
    });
    const card = screen.getByTestId('goal-plan-card');
    expect(card).toHaveTextContent('Lean Bulk · Day 7');
    expect(screen.queryByTestId('goal-plan-progress')).not.toBeInTheDocument();
  });

  it('phase overdue: asks to mark the phase complete', () => {
    renderCard({
      isGoalLocked: true,
      activePhase: {
        name: 'Autumn Cut',
        startDate: '2026-10-01',
        endDate: '2026-11-20',
        startingWeight: 80,
      },
    });
    expect(screen.getByTestId('goal-plan-card')).toHaveAttribute(
      'data-state',
      'phaseOverdue'
    );
    expect(screen.getByTestId('goal-plan-nudge')).toHaveTextContent(
      'mark it complete'
    );
  });
});
