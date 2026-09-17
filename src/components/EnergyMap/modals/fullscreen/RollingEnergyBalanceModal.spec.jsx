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

/** The card's wrapper — found through the read-only body (the card has no X). */
const getCardWrapper = (baseElement) =>
  baseElement
    .querySelector('[role="status"][aria-label="Selected day energy balance"]')
    .closest('[aria-hidden]');

/**
 * The rolling balance surface is read-only analytics, so its shared card has no
 * action footer, only *tracked* days are selectable, and a tap on an untracked
 * day closes the card rather than opening one with nothing honest to show.
 */
describe('RollingEnergyBalanceModal selection card', () => {
  it('mounts a read-only card in the plot top slot, and no measured tooltip', () => {
    seedLedger();
    const { baseElement } = renderModal();
    const card = getCardWrapper(baseElement);

    expect(card).toHaveAttribute('aria-hidden', 'true');
    expect(card.style.top).toBe('8px');
    expect(card.style.left).toBe('');
    expect(baseElement.querySelector('[class*="z-[1200]"]')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Dismiss selection' })
    ).toBeNull();
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

  it('dismisses when an untracked day is tapped', async () => {
    seedLedger();
    const user = userEvent.setup();
    const { baseElement } = renderModal();

    const bars = baseElement.querySelectorAll('svg g.cursor-pointer');
    // Slot order is oldest → newest, so the last bar is today's snapshot.
    await user.click(bars[bars.length - 1]);
    expect(getCardWrapper(baseElement)).toHaveAttribute('aria-hidden', 'false');

    await user.click(bars[0]);

    const card = getCardWrapper(baseElement);
    expect(card).toHaveAttribute('aria-hidden', 'true');
    // The retained day keeps the content mounted through the fade.
    expect(within(card).getByText('2,600 kcal')).toBeInTheDocument();
  });
});
