import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { StepTrackerModal } from './StepTrackerModal';

/**
 * Three consecutive tracked days inside the 7d window. That run matters: it is
 * what makes `weekBracketGroups` emit a bracket (>2 consecutive days), i.e. the
 * weekly-average band the selection card must not cover.
 */
const ENTRIES = [
  { date: '2026-01-01', steps: 9000 },
  { date: '2026-01-02', steps: 8000 },
  { date: '2026-01-03', steps: 12500 },
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

/** The card's wrapper — found through the read-only body (the card has no X). */
const getCardWrapper = (baseElement) =>
  baseElement
    .querySelector('[role="status"][aria-label="Selected day steps"]')
    .closest('[aria-hidden]');

/** The chart carousel — the modal's one horizontally scrollable container. */
const getCarousel = (baseElement) =>
  baseElement.querySelector('.overflow-x-auto');

/** The plot's own layer: the div wrapping the main (last) chart svg. */
const getPlotLayer = (baseElement) => {
  const svgs = baseElement.querySelectorAll('svg');
  return svgs[svgs.length - 1].parentElement;
};

/**
 * The step tracker's detail surface is the same shared card, but read-only (the
 * modal has no edit/add flow): tapping the card does nothing, tapping a day
 * selects it, and tapping a gap in the plot closes the card.
 */
describe('StepTrackerModal selection card', () => {
  it('mounts a read-only card in the plot top slot, and no measured tooltip', () => {
    const { baseElement } = renderModal();
    const card = getCardWrapper(baseElement);

    expect(card).toHaveAttribute('aria-hidden', 'true');
    expect(baseElement.querySelector('[class*="z-[1200]"]')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Dismiss selection' })
    ).toBeNull();
  });

  it('aligns the card to the plot top so the 7d week brackets stay visible', () => {
    const { baseElement } = renderModal();
    const card = getCardWrapper(baseElement);

    // Regression: the card used to sit at the container's top (8px), which in 7d
    // is exactly where the weekly-average bracket band lives.
    expect(card.style.top).toBe(getPlotLayer(baseElement).style.top);

    // WEEK_BRACKET_HEIGHT (32) at WEEK_BRACKET_TOP_PADDING (8): the band is
    // rendered in this fixture and ends above the card's top edge.
    const bracketSvg = baseElement.querySelector('svg[height="32"]');
    expect(bracketSvg).not.toBeNull();
    const bandBottom =
      parseFloat(bracketSvg.parentElement.style.top) +
      parseFloat(bracketSvg.getAttribute('height'));
    expect(parseFloat(card.style.top)).toBeGreaterThanOrEqual(bandBottom);
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

  it('dismisses when a gap in the plot is tapped', async () => {
    const user = userEvent.setup();
    const { baseElement } = renderModal();

    const bars = baseElement.querySelectorAll('svg g.cursor-pointer');
    await user.click(bars[bars.length - 1]);
    expect(getCardWrapper(baseElement)).toHaveAttribute('aria-hidden', 'false');

    // The 7d timeline pads empty days before the first entry. They carry no
    // step data, so the tap is not a selection — it falls through to the graph
    // container's dismiss handler instead of dead-ending.
    const labels = baseElement.querySelectorAll('div.absolute.cursor-pointer');
    expect(labels.length).toBeGreaterThan(ENTRIES.length);
    await user.click(labels[0]);

    const card = getCardWrapper(baseElement);
    expect(card).toHaveAttribute('aria-hidden', 'true');
    expect(within(card).getByText('12,500 steps')).toBeInTheDocument();
  });

  it('keeps an 8px gutter from the screen edges, y-axis still covered', () => {
    const { baseElement } = renderModal();

    const card = getCardWrapper(baseElement);
    expect(card.className).toContain('inset-x-2');
    expect(card.className).not.toContain('right-16');
  });

  it('dismisses the card when the plot is panned', async () => {
    const user = userEvent.setup();
    const { baseElement } = renderModal();

    const bars = baseElement.querySelectorAll('svg g.cursor-pointer');
    await user.click(bars[bars.length - 1]);
    expect(getCardWrapper(baseElement)).toHaveAttribute('aria-hidden', 'false');

    fireEvent.scroll(getCarousel(baseElement));

    const card = getCardWrapper(baseElement);
    expect(card).toHaveAttribute('aria-hidden', 'true');
    expect(within(card).getByText('12,500 steps')).toBeInTheDocument();
  });

  it('stays a plain step card — no weight / body fat delta chips', async () => {
    const user = userEvent.setup();
    const { baseElement } = renderModal();

    const bars = baseElement.querySelectorAll('svg g.cursor-pointer');
    await user.click(bars[bars.length - 1]);

    // The deltas are a Weight / Body Fat detail: steps have no "previous reading"
    // story to tell, and the card's Distance / Burned metrics are its detail.
    const card = getCardWrapper(baseElement);
    expect(within(card).queryByText('vs prev')).toBeNull();
    expect(within(card).queryByText('vs 7d avg')).toBeNull();
  });
});
