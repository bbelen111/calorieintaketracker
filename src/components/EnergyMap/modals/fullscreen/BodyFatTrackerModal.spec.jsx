import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
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

/** The chart carousel — the modal's one horizontally scrollable container. */
const getCarousel = (baseElement) =>
  baseElement.querySelector('.overflow-x-auto');

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

  it('keeps an 8px gutter from the screen edges, y-axis still covered', () => {
    const { baseElement } = renderModal();

    const card = getCardWrapper(baseElement);
    expect(card.className).toContain('inset-x-2');
    expect(card.className).not.toContain('right-14');
  });

  it('adds signed deltas to the selected day', async () => {
    const user = userEvent.setup();
    const { baseElement } = renderModal();

    const points = baseElement.querySelectorAll('svg g.cursor-pointer');
    await user.click(points[points.length - 1]);

    const card = screen.getByRole('button', { name: 'Edit body fat entry' });
    // Change since the previous measurement (18 -> 17.6 the next day)...
    expect(within(card).getByText('vs prev')).toBeInTheDocument();
    expect(within(card).getByText('-0.4%')).toBeInTheDocument();
    // ...and how far the reading sits from its own 7-day trend (17.9% avg).
    expect(within(card).getByText('vs 7d avg')).toBeInTheDocument();
    expect(within(card).getByText('-0.3%')).toBeInTheDocument();
  });

  it('omits the deltas when there is nothing honest to compare', async () => {
    const user = userEvent.setup();
    const { baseElement } = renderModal();

    // The 7d timeline pads empty days before the first entry; they are selectable
    // through their axis label and carry no reading to compare against.
    const labels = baseElement.querySelectorAll('div.absolute.cursor-pointer');
    await user.click(labels[0]);

    const card = screen.getByRole('button', { name: 'Add body fat entry' });
    expect(within(card).getByText('No entry')).toBeInTheDocument();
    expect(within(card).queryByText('vs prev')).toBeNull();
    expect(within(card).queryByText('vs 7d avg')).toBeNull();
  });

  it('dismisses the card when the plot is panned', async () => {
    const user = userEvent.setup();
    const { baseElement } = renderModal();

    const points = baseElement.querySelectorAll('svg g.cursor-pointer');
    await user.click(points[points.length - 1]);
    expect(getCardWrapper(baseElement)).toHaveAttribute('aria-hidden', 'false');

    fireEvent.scroll(getCarousel(baseElement));

    const card = getCardWrapper(baseElement);
    expect(card).toHaveAttribute('aria-hidden', 'true');
    expect(within(card).getByText('17.6%')).toBeInTheDocument();
  });
});
