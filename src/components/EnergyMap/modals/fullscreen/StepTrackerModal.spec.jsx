import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { StepTrackerModal } from './StepTrackerModal';

const ENTRIES = [
  { date: '2026-01-01', steps: 9000 },
  { date: '2026-01-02', steps: 12500 },
];

const renderModal = (props = {}) =>
  render(
    <StepTrackerModal
      isOpen
      isClosing={false}
      entries={ENTRIES}
      stepGoal={10000}
      onClose={vi.fn()}
      {...props}
    />
  );

/**
 * The step tracker's detail surface is the same shared card, but read-only (the
 * modal has no edit/add flow): tapping an empty slot must do nothing rather than
 * open a card with no data, and the card is never a button.
 */
describe('StepTrackerModal selection card', () => {
  it('mounts a read-only shared card and no measured tooltip', () => {
    const { baseElement } = renderModal();

    const wrapper = baseElement
      .querySelector('[aria-label="Dismiss selection"]')
      .closest('[aria-hidden]');
    expect(wrapper).toHaveAttribute('aria-hidden', 'true');
    expect(wrapper.getAttribute('style')).toBeNull();
    expect(baseElement.querySelector('[class*="z-[1200]"]')).toBeNull();
  });

  it('shows the tapped day with distance and burn, tied by a guide line', async () => {
    const user = userEvent.setup();
    const { baseElement } = renderModal();

    const bars = baseElement.querySelectorAll('svg g.cursor-pointer');
    expect(bars.length).toBeGreaterThan(0);
    await user.click(bars[bars.length - 1]);

    const card = screen.getByRole('status', { name: 'Selected day steps' });
    expect(within(card).getByText('12,500 steps')).toBeInTheDocument();

    const guide = baseElement.querySelector('svg line[stroke-dasharray="3 4"]');
    expect(guide).not.toBeNull();
    expect(guide.getAttribute('x1')).toBe(guide.getAttribute('x2'));
  });

  it('ignores taps on days with no step data', async () => {
    const user = userEvent.setup();
    const { baseElement } = renderModal();

    // The 7d timeline pads empty days before the first entry; their labels are
    // still clickable, but a slot with no data must not become the selection.
    const labels = baseElement.querySelectorAll('div.absolute.cursor-pointer');
    expect(labels.length).toBeGreaterThan(ENTRIES.length);
    await user.click(labels[0]);

    const wrapper = baseElement
      .querySelector('[aria-label="Dismiss selection"]')
      .closest('[aria-hidden]');
    expect(wrapper).toHaveAttribute('aria-hidden', 'true');
  });
});
