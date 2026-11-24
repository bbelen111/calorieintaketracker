import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AdaptiveThermogenesisModal } from './AdaptiveThermogenesisModal';
import { useEnergyMapStore } from '../../../../store/useEnergyMapStore';
import { getTodayDateKey } from '../../../../utils/data/dateKeys';

const todayKey = getTodayDateKey();

const addDays = (dateKey, days) => {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const seedStore = ({
  selectedGoal = 'maintenance',
  adaptiveThermogenesisEnabled = true,
  adaptiveThermogenesisSmartMode = false,
  dailySnapshots = {},
  weightEntries = [],
} = {}) => {
  useEnergyMapStore.setState((state) => ({
    ...state,
    goalDurationDays: 3,
    weightEntries,
    userData: {
      ...state.userData,
      selectedGoal,
      adaptiveThermogenesisEnabled,
      adaptiveThermogenesisSmartMode,
      dailySnapshots,
    },
  }));
};

const renderModal = (props = {}) =>
  render(
    <AdaptiveThermogenesisModal
      isOpen
      isClosing={false}
      onClose={vi.fn()}
      onOpenInfo={vi.fn()}
      onOpenRollingBalance={vi.fn()}
      {...props}
    />
  );

describe('AdaptiveThermogenesisModal', () => {
  it('explains why Crude maintenance stays at 0 kcal when there is no prior cut/surplus pressure', async () => {
    seedStore({
      selectedGoal: 'maintenance',
      dailySnapshots: {
        [todayKey]: {
          date: todayKey,
          goalAtSnapshot: 'maintenance',
        },
      },
    });
    const onOpenRollingBalance = vi.fn();
    const user = userEvent.setup();
    renderModal({ onOpenRollingBalance });

    await user.click(screen.getByRole('button', { name: 'Staged' }));

    expect(
      screen.getByText('Why maintenance stays at 0 kcal')
    ).toBeInTheDocument();
    expect(
      screen.getByText('How Staged mode responds by goal')
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        'Choose a cut or surplus goal to see an adaptation timeline.'
      )
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Residual pressure')).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: /Check Rolling Energy Balance/i })
    );
    expect(onOpenRollingBalance).toHaveBeenCalledTimes(1);
  });

  it('shows residual sub-milestone pressure decaying back to zero on Crude maintenance', async () => {
    seedStore({
      selectedGoal: 'maintenance',
      dailySnapshots: {
        [addDays(todayKey, -2)]: {
          date: addDays(todayKey, -2),
          goalAtSnapshot: 'cutting',
        },
        [addDays(todayKey, -1)]: {
          date: addDays(todayKey, -1),
          goalAtSnapshot: 'cutting',
        },
        [todayKey]: {
          date: todayKey,
          goalAtSnapshot: 'maintenance',
        },
      },
    });
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: 'Staged' }));

    expect(
      screen.getByText('Why maintenance stays at 0 kcal')
    ).toBeInTheDocument();
    expect(screen.getByText('Residual pressure')).toBeInTheDocument();
    expect(screen.getByText('-1.75')).toBeInTheDocument();
  });

  it('shows the active cut timeline with an unwinding note when maintenance still carries a milestone', async () => {
    const dailySnapshots = {};
    for (let offset = 6; offset >= 1; offset -= 1) {
      const key = addDays(todayKey, -offset);
      dailySnapshots[key] = { date: key, goalAtSnapshot: 'cutting' };
    }
    dailySnapshots[todayKey] = {
      date: todayKey,
      goalAtSnapshot: 'maintenance',
    };
    seedStore({ selectedGoal: 'maintenance', dailySnapshots });
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: 'Staged' }));

    expect(screen.getByText('Cut milestones')).toBeInTheDocument();
    expect(screen.getByText('Unwinding on maintenance')).toBeInTheDocument();
    expect(
      screen.queryByText('Why maintenance stays at 0 kcal')
    ).not.toBeInTheDocument();
  });

  it('shows the Smart maintenance explanation instead of zeroed comparison cards', () => {
    seedStore({
      selectedGoal: 'maintenance',
      adaptiveThermogenesisSmartMode: true,
    });
    renderModal();

    expect(
      screen.getByText('Why Smart mode pauses at maintenance')
    ).toBeInTheDocument();
    expect(
      screen.getByText('How Smart mode works on a cut or bulk')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Balance vs. scale trend')
    ).not.toBeInTheDocument();
  });

  it('renders the Smart readiness card while building a baseline on a cut', () => {
    seedStore({
      selectedGoal: 'cutting',
      adaptiveThermogenesisSmartMode: true,
      dailySnapshots: {
        [todayKey]: {
          date: todayKey,
          intake: 1900,
          baselineTdee: 2400,
          goalAtSnapshot: 'cutting',
        },
      },
      weightEntries: [{ date: todayKey, weight: 74 }],
    });
    renderModal();

    expect(screen.getByText('Building your baseline')).toBeInTheDocument();
    expect(screen.getByText('Smart mode readiness')).toBeInTheDocument();
    expect(screen.getByText('0 / 2 met')).toBeInTheDocument();
    expect(screen.getByText('1 / 14')).toBeInTheDocument();
    expect(screen.getByText('1 / 4')).toBeInTheDocument();
  });

  it('renders the active Smart comparison and confidence cards when sufficient cut data exists', () => {
    const dailySnapshots = {};
    for (let offset = 20; offset >= 0; offset -= 1) {
      const key = addDays(todayKey, -offset);
      dailySnapshots[key] = {
        date: key,
        intake: 1900,
        baselineTdee: 2400,
        goalAtSnapshot: 'cutting',
      };
    }
    const weightEntries = [
      { date: addDays(todayKey, -20), weight: 75.0 },
      { date: addDays(todayKey, -14), weight: 74.9 },
      { date: addDays(todayKey, -7), weight: 74.8 },
      { date: todayKey, weight: 74.7 },
    ];
    seedStore({
      selectedGoal: 'cutting',
      adaptiveThermogenesisSmartMode: true,
      dailySnapshots,
      weightEntries,
    });
    renderModal();

    expect(screen.getByText('Balance vs. scale trend')).toBeInTheDocument();
    expect(screen.getByText('Signal confidence')).toBeInTheDocument();
    expect(screen.getByText('Expected')).toBeInTheDocument();
    expect(screen.getByText('Observed')).toBeInTheDocument();
    expect(screen.getByText('21 logged days')).toBeInTheDocument();
    expect(screen.getByText('4 weigh-ins')).toBeInTheDocument();
  });
});
