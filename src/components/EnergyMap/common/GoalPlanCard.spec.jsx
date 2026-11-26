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
      /^~.+ in 4 wk$/
    );
    // Trend and projection share one row, with no second icon.
    const projection = screen.getByTestId('goal-plan-projection');
    expect(projection.parentElement).toBe(
      screen.getByTestId('goal-plan-trend').parentElement
    );
    expect(projection.querySelector('svg')).toBeNull();
  });

  it('goal state: a long verdict is shortened to keep the line short', () => {
    renderCard({
      weightEntries: [
        { date: '2026-11-12', weight: 80 },
        { date: '2026-11-19', weight: 79.85 },
        { date: '2026-11-26', weight: 79.7 },
      ],
    });
    const trend = screen.getByTestId('goal-plan-trend');
    expect(trend).toHaveTextContent('Slow pace');
    expect(trend).not.toHaveTextContent('Slower than goal target');
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

  it('phase state: the tile shows the phase target and opens the phase', async () => {
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
    expect(card).not.toHaveTextContent('Tap to change');
    expect(screen.queryByTestId('goal-plan-day-badge')).not.toBeInTheDocument();
    expect(card).toHaveTextContent('Summer Cut');
    expect(card).toHaveTextContent('Day 18 of 56 · ends Jan 3');
    expect(screen.getByTestId('goal-plan-progress')).toHaveAttribute(
      'aria-valuenow',
      '32'
    );
    // No weigh-in or logged day in the phase yet: only the stored start.
    const startRow = screen.getByTestId('goal-plan-phase-start');
    expect(startRow).toHaveTextContent(/Start: 80(\.0)? ?kg · Nov 9, 2026/);
    expect(startRow).not.toHaveTextContent('Target');
    const currentRow = screen.getByTestId('goal-plan-phase-current');
    expect(currentRow).toHaveTextContent(/^Current: no weigh-in yet$/);
    expect(screen.queryByTestId('goal-plan-adherence')).not.toBeInTheDocument();
    expect(screen.getByTestId('goal-plan-lock-badge')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Start a phase/ })
    ).not.toBeInTheDocument();

    // The tile is the one way in.
    expect(screen.getAllByRole('button')).toHaveLength(1);
    const tile = screen.getByRole('button', { name: /Open phase/ });
    expect(tile).toBeEnabled();
    await user.click(tile);
    expect(handlers.onOpenActivePhase).toHaveBeenCalledTimes(1);
    expect(handlers.onGoalClick).not.toHaveBeenCalled();
  });

  it('phase state: weight against the target, and only the phase days', () => {
    renderCard({
      isGoalLocked: true,
      activePhase: {
        name: 'Summer Cut',
        startDate: '2026-11-24',
        endDate: '2027-01-03',
        targetWeight: 76,
        startingWeight: 80,
      },
      weightEntries: [{ date: '2026-11-25', weight: 79 }],
      dailySnapshots: {
        // Before the phase: not part of its adherence.
        '2026-11-23': snapshot('2026-11-23', 300),
        '2026-11-24': snapshot('2026-11-24', 320),
        '2026-11-25': snapshot('2026-11-25', 900),
      },
    });
    const startRow = screen.getByTestId('goal-plan-phase-start');
    expect(startRow).toHaveTextContent(/Start: 80(\.0)? ?kg · Nov 24, 2026/);
    expect(startRow).toHaveTextContent(/Target: 76(\.0)? ?kg/);
    expect(startRow).toHaveTextContent('Target -0.70 kg/wk');
    // One day of weigh-ins is a change, not yet a rate.
    const currentRow = screen.getByTestId('goal-plan-phase-current');
    expect(currentRow).toHaveTextContent(/Current: 79(\.0)? ?kg · -1\.0 ?kg/);
    expect(currentRow).toHaveTextContent('Rate after 7 days');
    expect(screen.getByTestId('goal-plan-adherence')).toHaveTextContent(
      '1 of 2 logged days on target'
    );
  });

  it('phase state: the current rate is judged against the phase plan', () => {
    renderCard({
      // The selected goal does not decide a phase's verdict.
      selectedGoal: 'maintenance',
      goalConfig: goals.maintenance,
      isGoalLocked: true,
      activePhase: {
        name: 'Summer Cut',
        goalType: 'cutting',
        startDate: '2026-11-09',
        endDate: '2027-01-03',
        targetWeight: 76,
        startingWeight: 80,
      },
      weightEntries: [
        { date: '2026-11-12', weight: 80 },
        { date: '2026-11-19', weight: 79.5 },
        { date: '2026-11-26', weight: 79 },
      ],
    });
    expect(screen.getByTestId('goal-plan-phase-current')).toHaveTextContent(
      'Current -0.50 kg/wk · On track'
    );
  });

  it('phase state: without a target weight the goal band is the target', () => {
    renderCard({
      isGoalLocked: true,
      activePhase: {
        name: 'Lean Bulk',
        goalType: 'bulking',
        startDate: '2026-11-05',
        endDate: null,
        targetBodyFat: 14.5,
        startingWeight: 74,
      },
      weightEntries: [
        { date: '2026-11-12', weight: 74 },
        { date: '2026-11-26', weight: 74.1 },
      ],
    });
    const startRow = screen.getByTestId('goal-plan-phase-start');
    expect(startRow).toHaveTextContent('Target: 14.5% BF');
    expect(startRow).toHaveTextContent('Target +0.25-0.45 kg/wk');
    expect(screen.getByTestId('goal-plan-phase-current')).toHaveTextContent(
      'Current +0.05 kg/wk · Off track'
    );
  });

  describe('phase facts layout', () => {
    // jsdom lays nothing out: give the card a width, and each measured
    // two-line candidate its own (widest first).
    const stubWidths = (frame, candidates) => {
      Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', {
        configurable: true,
        get: () => frame,
      });
      Object.defineProperty(window.HTMLElement.prototype, 'scrollWidth', {
        configurable: true,
        get() {
          const probe = this.parentElement;
          return probe?.getAttribute('aria-hidden') === 'true'
            ? candidates[[...probe.children].indexOf(this)]
            : 0;
        },
      });
    };
    afterEach(() => {
      delete window.HTMLElement.prototype.clientWidth;
      delete window.HTMLElement.prototype.scrollWidth;
    });

    const renderPhase = () =>
      renderCard({
        isGoalLocked: true,
        activePhase: {
          name: 'Summer Cut',
          goalType: 'cutting',
          startDate: '2026-11-09',
          endDate: '2027-01-03',
          targetWeight: 76,
          startingWeight: 80,
        },
        weightEntries: [
          { date: '2026-11-12', weight: 80 },
          { date: '2026-11-26', weight: 79 },
        ],
      });
    const layout = () =>
      screen.getByTestId('goal-plan-phase-facts').dataset.layout;
    const row = (id) => screen.getByTestId(`goal-plan-phase-${id}`);

    it('keeps the two full lines while they fit', () => {
      stubWidths(300, [300, 260]);
      renderPhase();
      expect(layout()).toBe('two-lines');
      expect(row('start')).toHaveTextContent('Target -0.51 kg/wk');
      expect(row('current')).toHaveTextContent('Current -0.50 kg/wk');
      expect(
        screen.queryByTestId('goal-plan-phase-target')
      ).not.toBeInTheDocument();
    });

    it('drops the repeated labels when that makes two lines fit', () => {
      stubWidths(300, [320, 290]);
      renderPhase();
      expect(layout()).toBe('two-lines-tight');
      expect(row('start')).toHaveTextContent('-0.51 kg/wk');
      expect(row('start')).not.toHaveTextContent('Target -0.51');
      expect(row('current')).toHaveTextContent('-0.50 kg/wk');
      expect(row('current')).not.toHaveTextContent('Current -0.50');
    });

    it('gives each fact its own line when two lines cannot fit', () => {
      stubWidths(300, [400, 360]);
      renderPhase();
      expect(layout()).toBe('short-lines');
      expect(row('start')).toHaveTextContent('Nov 9, 2026');
      expect(row('start')).not.toHaveTextContent('Target');
      expect(row('target')).toHaveTextContent(/Target: 76(\.0)? ?kg/);
      expect(row('target')).toHaveTextContent('-0.51 kg/wk');
    });
  });

  it('goal locked with no phase to open: the tile says so', () => {
    renderCard({ isGoalLocked: true });
    expect(
      screen.getByRole('button', { name: /Set by your phase/ })
    ).toBeDisabled();
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
    expect(card).toHaveTextContent('Lean Bulk');
    expect(card).toHaveTextContent('Day 7');
    expect(card).not.toHaveTextContent('ends');
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
