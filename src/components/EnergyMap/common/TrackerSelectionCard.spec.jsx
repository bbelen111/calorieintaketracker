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
 * owns the shared contract those modals must not re-implement: one fixed
 * top-centre slot inside the graph container, a pure crossfade instead of an
 * unmount swap, `aria-hidden` + inert while closed, and an explicit X that is a
 * sibling of the body (never a nested button) so it cannot commit the action.
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

  it('positions itself in one fixed slot, never from the tapped point', () => {
    const { container } = renderCard({ className: 'left-0 right-14' });

    const wrapper = container.firstChild;
    // `className` replaces the default `inset-x-0`; no inline left/top is ever
    // written (that measurement is what made the old tooltip drift).
    expect(wrapper.className).toContain('left-0');
    expect(wrapper.className).toContain('right-14');
    expect(wrapper.className).toContain('top-2');
    expect(wrapper.className).not.toContain('inset-x-0');
    expect(wrapper.getAttribute('style')).toBeNull();
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

  it('dismisses from the X without committing the action', async () => {
    const onAction = vi.fn();
    const onDismiss = vi.fn();
    renderCard({ actionLabel: 'Tap to add entry', onAction, onDismiss });

    await userEvent.click(
      screen.getByRole('button', { name: 'Dismiss selection' })
    );

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onAction).not.toHaveBeenCalled();
  });

  it('takes the closed card out of the tab order', () => {
    const { container } = renderCard({
      isOpen: false,
      actionLabel: 'Tap to edit entry',
      onAction: vi.fn(),
      onDismiss: vi.fn(),
    });

    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(2);
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
