import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { BodyFatTrackerModal } from './BodyFatTrackerModal';

const ENTRIES = [
  { date: '2026-01-01', bodyFat: 18 },
  { date: '2026-01-02', bodyFat: 17.6 },
];

const renderModal = (props = {}) =>
  render(
    <BodyFatTrackerModal
      isOpen
      isClosing={false}
      entries={ENTRIES}
      latestBodyFat={17.6}
      selectedGoal="maintenance"
      onClose={vi.fn()}
      onAddEntry={vi.fn()}
      onEditEntry={vi.fn()}
      {...props}
    />
  );

/**
 * The card's positioned wrapper — found through the card body, since the card
 * has no close button (dismissal is a tap on the plot).
 */
const CARD_BODY_SELECTOR =
  'button[aria-label="Edit body fat entry"], button[aria-label="Add body fat entry"]';

const getCardWrapper = (baseElement) =>
  baseElement.querySelector(CARD_BODY_SELECTOR).closest('[aria-hidden]');

/**
 * Same selection-card contract as `WeightTrackerModal` (see that spec for the
 * full round trip): the shared card is always mounted in a fixed slot inside the
 * graph container, no measured `z-[1200]` tooltip exists, and the plot's own
 * handler dismisses it.
 */
describe('BodyFatTrackerModal selection card', () => {
  it('mounts the shared card and no measured tooltip', () => {
    const { baseElement } = renderModal();

    const wrapper = getCardWrapper(baseElement);
    expect(wrapper).toHaveAttribute('aria-hidden', 'true');
    // Constant plot-top, never measured geometry.
    expect(wrapper.style.top).toBe('8px');
    expect(wrapper.style.left).toBe('');
    expect(baseElement.querySelector('[class*="z-[1200]"]')).toBeNull();
  });

  it('shows the tapped day and ties it to the card with a guide line', async () => {
    const user = userEvent.setup();
    const { baseElement } = renderModal();

    const points = baseElement.querySelectorAll('svg g.cursor-pointer');
    expect(points.length).toBeGreaterThan(0);
    await user.click(points[points.length - 1]);

    const card = screen.getByRole('button', { name: 'Edit body fat entry' });
    expect(within(card).getByText('17.6%')).toBeInTheDocument();

    const guide = baseElement.querySelector('svg line[stroke-dasharray="3 4"]');
    expect(guide).not.toBeNull();
    expect(guide.getAttribute('x1')).toBe(guide.getAttribute('x2'));
  });

  it('dismisses when the plot is tapped', async () => {
    const user = userEvent.setup();
    const { baseElement } = renderModal();

    const points = baseElement.querySelectorAll('svg g.cursor-pointer');
    await user.click(points[points.length - 1]);
    expect(getCardWrapper(baseElement)).toHaveAttribute('aria-hidden', 'false');

    await user.click(getCardWrapper(baseElement).parentElement);

    const card = getCardWrapper(baseElement);
    expect(card).toHaveAttribute('aria-hidden', 'true');
    expect(within(card).getByText('17.6%')).toBeInTheDocument();
  });
});
