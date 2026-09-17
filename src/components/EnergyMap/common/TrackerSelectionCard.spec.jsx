import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  TrackerSelectionCard,
  TrackerCardMetric,
} from './TrackerSelectionCard';

const renderCard = (props = {}) =>
  render(
    <TrackerSelectionCard isOpen {...props}>
      <p>Thu, 1 Jan 2026</p>
      <p>74.2 kg</p>
    </TrackerSelectionCard>
  );

/**
 * The selection card replaced the four tracker modals' floating tooltips. It
 * owns the shared contract those modals must not re-implement: one fixed slot
 * inside the graph container, a pure crossfade instead of an unmount swap,
 * `aria-hidden` + inert while closed, a glass surface, and no close button —
 * dismissal belongs to the modal's "tap the graph" handler, which the card must
 * never let its own taps reach.
 */
describe('TrackerSelectionCard', () => {
  it('stays mounted and crossfades instead of unmounting', () => {
    const { container, rerender } = renderCard({ isOpen: false });

    expect(container.querySelector('.absolute')).toBeInTheDocument();
    expect(screen.getByText('74.2 kg')).toBeInTheDocument();
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
    expect(container.firstChild.className).toContain('opacity-0');

    rerender(
      <TrackerSelectionCard isOpen>
        <p>74.2 kg</p>
      </TrackerSelectionCard>
    );

    expect(container.firstChild).toHaveAttribute('aria-hidden', 'false');
    expect(container.firstChild.className).toContain('opacity-100');
  });

  it('sits in one fixed slot: a constant top, never measured geometry', () => {
    const { container } = renderCard({ className: 'left-0 right-14' });

    const wrapper = container.firstChild;
    // `className` replaces the default `inset-x-0`; the only inline geometry is
    // the constant plot-top the modal hands in (never a measurement, and never
    // a `left` — that is what made the old tooltip drift off its point).
    expect(wrapper.className).toContain('left-0');
    expect(wrapper.className).toContain('right-14');
    expect(wrapper.className).not.toContain('inset-x-0');
    expect(wrapper.getAttribute('style')).toBe('top: 8px;');
  });

  it('aligns to the plot top the modal passes', () => {
    // StepTrackerModal passes weekBracketAreaHeight + 8 in 7d so the card clears
    // the weekly-average bracket band instead of covering it.
    const { container } = renderCard({ topPx: 48 });

    expect(container.firstChild.style.top).toBe('48px');
    expect(container.firstChild.style.left).toBe('');
  });

  it('frosts the card over the chart', () => {
    const { container } = renderCard();
    const card = container.querySelector('.pointer-events-auto');

    expect(card.className).toContain('backdrop-blur-2xl');
    expect(card.className).toContain('backdrop-saturate-150');
    expect(card.className).toContain('border-border/40');
    expect(card.className).toContain('bg-surface/85');
    // Readable without blur on engines that lack backdrop-filter.
    expect(card.className).toContain(
      'supports-[backdrop-filter]:bg-surface/55'
    );
    // A plot-wide strip: it fills the wrapper the modal insets to the plot area,
    // rather than shrink-wrapping its content.
    expect(card.className).toContain('w-full');
    expect(card.className).not.toContain('w-auto');
  });

  it('pads its text to the modal gutter', () => {
    const { container } = renderCard();

    // px-4 matches the tracker modals' own content gutter, so the card's date sits
    // on the same vertical line as the stat labels above the chart.
    expect(container.querySelector('.px-4')).toBeInTheDocument();
  });

  it('has no close button — the graph owns dismissal', () => {
    renderCard({
      actionLabel: 'Tap to edit entry',
      onAction: vi.fn(),
      ariaLabel: 'Edit weight entry',
    });

    // The old X was a 21px tap target in the corner, which is unusable on a
    // phone: dismissal is a tap on the plot instead.
    expect(
      screen.queryByRole('button', { name: 'Dismiss selection' })
    ).toBeNull();
  });

  it('keeps its own taps away from the graph dismiss handler', async () => {
    const onGraphTap = vi.fn();

    render(
      <div onClick={onGraphTap}>
        <button type="button">plot</button>
        <TrackerSelectionCard isOpen ariaLabel="Selected day steps">
          <p>74.2 kg</p>
        </TrackerSelectionCard>
      </div>
    );

    // A tap on the card means "let me read this", not "close".
    await userEvent.click(screen.getByText('74.2 kg'));
    expect(onGraphTap).not.toHaveBeenCalled();

    // ...while the graph around it still reaches the modal's handler.
    await userEvent.click(screen.getByRole('button', { name: 'plot' }));
    expect(onGraphTap).toHaveBeenCalledTimes(1);
  });

  it('keeps the wrapper transparent to pointers but the card tappable', () => {
    const { container } = renderCard();

    expect(container.firstChild.className).toContain('pointer-events-none');
    expect(container.querySelector('.pointer-events-auto')).toBeInTheDocument();
  });

  it('renders the body as a button with the footer action label', async () => {
    const onAction = vi.fn();
    renderCard({
      actionLabel: 'Tap to edit entry',
      onAction,
      ariaLabel: 'Edit weight entry',
    });

    const body = screen.getByRole('button', { name: 'Edit weight entry' });
    expect(screen.getByText('Tap to edit entry')).toBeInTheDocument();

    await userEvent.click(body);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('renders read-only as a polite status without a footer action', () => {
    renderCard({ ariaLabel: 'Selected day steps' });

    expect(
      screen.getByRole('status', { name: 'Selected day steps' })
    ).toHaveAttribute('aria-live', 'polite');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('takes the closed card out of the tab order', () => {
    const { container } = renderCard({
      isOpen: false,
      actionLabel: 'Tap to edit entry',
      onAction: vi.fn(),
    });

    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(1);
    for (const button of buttons) {
      expect(button).toHaveAttribute('tabindex', '-1');
    }
  });

  it('formats metric pairs without a tile chrome', () => {
    render(<TrackerCardMetric label="7d" value="74.5 kg" />);

    expect(screen.getByText('7d')).toBeInTheDocument();
    expect(screen.getByText('74.5 kg')).toBeInTheDocument();
  });
});
