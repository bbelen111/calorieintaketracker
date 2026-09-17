import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { RollingEnergyBalanceModal } from './RollingEnergyBalanceModal';
import { useEnergyMapStore } from '../../../../store/useEnergyMapStore';
import { getTodayDateKey } from '../../../../utils/data/dateKeys';

const todayKey = getTodayDateKey();

/** The card only renders over an existing ledger, so seed one snapshot. */
const seedLedger = () => {
  useEnergyMapStore.setState((state) => ({
    ...state,
    goalDailyBalanceTarget: 500,
    userData: {
      ...state.userData,
      dailySnapshots: {
        [todayKey]: {
          date: todayKey,
          tdee: 2600,
          intake: 2100,
          deficit: 500,
          stepCount: 9000,
          isTrainingDay: false,
          goalAtSnapshot: 'maintenance',
        },
      },
    },
  }));
};

const renderModal = (props = {}) =>
  render(
    <RollingEnergyBalanceModal
      isOpen
      isClosing={false}
      onClose={vi.fn()}
      {...props}
    />
  );

/**
 * The rolling balance surface is read-only analytics, so its shared card has no
 * action footer and only *tracked* days are selectable (an empty day must not be
 * able to open a card that would have nothing honest to show).
 */
describe('RollingEnergyBalanceModal selection card', () => {
  it('mounts a read-only card in the graph container and no measured tooltip', () => {
    seedLedger();
    const { baseElement } = renderModal();

    const wrapper = baseElement
      .querySelector('[aria-label="Dismiss selection"]')
      .closest('[aria-hidden]');
    expect(wrapper).toHaveAttribute('aria-hidden', 'true');
    expect(wrapper.getAttribute('style')).toBeNull();
    expect(baseElement.querySelector('[class*="z-[1200]"]')).toBeNull();
  });

  it('shows the tapped day balance, tied to it by a guide line', async () => {
    seedLedger();
    const user = userEvent.setup();
    const { baseElement } = renderModal();

    const bars = baseElement.querySelectorAll('svg g.cursor-pointer');
    expect(bars.length).toBeGreaterThan(0);
    await user.click(bars[bars.length - 1]);

    const card = screen.getByRole('status', {
      name: 'Selected day energy balance',
    });
    expect(within(card).getByText('2,600 kcal')).toBeInTheDocument();
    expect(within(card).getByText('2,100 kcal')).toBeInTheDocument();

    const guide = baseElement.querySelector('svg line[stroke-dasharray="3 4"]');
    expect(guide).not.toBeNull();
    expect(guide.getAttribute('x1')).toBe(guide.getAttribute('x2'));
  });

  it('ignores taps on days with no snapshot', async () => {
    seedLedger();
    const user = userEvent.setup();
    const { baseElement } = renderModal();

    const bars = baseElement.querySelectorAll('svg g.cursor-pointer');
    // Slot order is oldest → newest, so the first bar is an untracked day.
    await user.click(bars[0]);

    const wrapper = baseElement
      .querySelector('[aria-label="Dismiss selection"]')
      .closest('[aria-hidden]');
    expect(wrapper).toHaveAttribute('aria-hidden', 'true');
  });
});
