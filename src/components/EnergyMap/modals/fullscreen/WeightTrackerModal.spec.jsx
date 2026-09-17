import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { WeightTrackerModal } from './WeightTrackerModal';

const ENTRIES = [
  { date: '2026-01-01', weight: 74 },
  { date: '2026-01-02', weight: 74.4 },
];

const renderModal = (props = {}) =>
  render(
    <WeightTrackerModal
      isOpen
      isClosing={false}
      entries={ENTRIES}
      latestWeight={74.4}
      selectedGoal="maintenance"
      onClose={vi.fn()}
      onAddEntry={vi.fn()}
      onEditEntry={vi.fn()}
      {...props}
    />
  );

/** Real chart points (one `<g>` tap target per entry). */
const getChartPoints = (baseElement) =>
  baseElement.querySelectorAll('svg g.cursor-pointer');

/** Axis label wrappers — the bigger tap target, and the only route to empty days. */
const getSlotLabels = (baseElement) =>
  baseElement.querySelectorAll('div.absolute.cursor-pointer');

/** The card's positioned wrapper (ModalShell portals its content to body). */
const getCardWrapper = (baseElement) =>
  baseElement
    .querySelector('[aria-label="Dismiss selection"]')
    .closest('[aria-hidden]');

/**
 * The tracker detail surface is a single card pinned to the top centre of the
 * plot, tied to the tapped slot by a guide line drawn inside the chart. The old
 * floating tooltip (measured onto the point, `fixed` + `z-[1200]`, dismissed by
 * an outside pointerdown listener) must not come back: it drifted on scroll,
 * escaped the modal z-lanes and rendered outside `ModalShell`.
 */
describe('WeightTrackerModal selection card', () => {
  it('mounts one hidden card in a fixed slot and no measured tooltip', () => {
    const { baseElement } = renderModal();

    const card = getCardWrapper(baseElement);
    expect(card).toHaveAttribute('aria-hidden', 'true');

    // No floating tooltip: no node escapes the ModalShell z-lanes...
    expect(baseElement.querySelector('[class*="z-[1200]"]')).toBeNull();
    // ...and the card is never positioned from the tapped point.
    expect(card.className).toContain('top-2');
    expect(card.getAttribute('style')).toBeNull();
  });

  it('shows the tapped day in the card, tied to it by a vertical guide line', async () => {
    const user = userEvent.setup();
    const { baseElement } = renderModal();

    const points = getChartPoints(baseElement);
    expect(points.length).toBeGreaterThan(0);
    await user.click(points[points.length - 1]);

    const card = screen.getByRole('button', { name: 'Edit weight entry' });
    expect(within(card).getByText('74.4 kg')).toBeInTheDocument();
    expect(within(card).getByText('Tap to edit entry')).toBeInTheDocument();
    expect(getCardWrapper(baseElement)).toHaveAttribute('aria-hidden', 'false');

    const guide = baseElement.querySelector('svg line[stroke-dasharray="3 4"]');
    expect(guide).not.toBeNull();
    expect(guide.getAttribute('x1')).toBe(guide.getAttribute('x2'));
  });

  it('commits the edit from the card body', async () => {
    const user = userEvent.setup();
    const onEditEntry = vi.fn();
    const { baseElement } = renderModal({ onEditEntry });

    const points = getChartPoints(baseElement);
    await user.click(points[points.length - 1]);
    await user.click(screen.getByRole('button', { name: 'Edit weight entry' }));

    expect(onEditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ date: '2026-01-02', weight: 74.4 })
    );
  });

  it('keeps the re-tap-to-edit gesture on the tapped point', async () => {
    const user = userEvent.setup();
    const onEditEntry = vi.fn();
    const { baseElement } = renderModal({ onEditEntry });

    const point = getChartPoints(baseElement)[1];
    await user.click(point);
    expect(onEditEntry).not.toHaveBeenCalled();

    await user.click(point);
    expect(onEditEntry).toHaveBeenCalledTimes(1);
  });

  it('offers the add flow for a day with no entry', async () => {
    const user = userEvent.setup();
    const onAddEntry = vi.fn();
    const { baseElement } = renderModal({ onAddEntry });

    // The 7d timeline pads empty days before the first entry; those slots are
    // selectable through their axis label (there is no data point to tap).
    const labels = getSlotLabels(baseElement);
    expect(labels.length).toBeGreaterThan(ENTRIES.length);
    await user.click(labels[0]);

    const card = screen.getByRole('button', { name: 'Add weight entry' });
    expect(within(card).getByText('No entry')).toBeInTheDocument();

    await user.click(card);
    expect(onAddEntry).toHaveBeenCalledWith(
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)
    );
  });

  it('dismisses with the X while keeping the last content mounted', async () => {
    const user = userEvent.setup();
    const { baseElement } = renderModal();

    const points = getChartPoints(baseElement);
    await user.click(points[points.length - 1]);
    await user.click(screen.getByRole('button', { name: 'Dismiss selection' }));

    const card = getCardWrapper(baseElement);
    expect(card).toHaveAttribute('aria-hidden', 'true');
    expect(within(card).getByText('74.4 kg')).toBeInTheDocument();
  });
});
