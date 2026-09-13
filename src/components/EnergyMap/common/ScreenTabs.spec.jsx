import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ClipboardList, Flame, Target } from 'lucide-react';

import { ScreenTabs } from './ScreenTabs';
import {
  RING_COPY_OFFSETS,
  SCREEN_DRAG_DURATION_VAR,
  SCREEN_DRAG_PROGRESS_VAR,
} from '../../../utils/visuals/carouselLoop';

const TABS = [
  { key: 'logbook', label: 'Logbook', icon: ClipboardList },
  { key: 'tracker', label: 'Tracker', icon: Flame },
  { key: 'home', label: 'Home', icon: Target },
];

const renderTabs = (props = {}) =>
  render(
    <ScreenTabs tabs={TABS} activeScreen={0} onSelect={vi.fn()} {...props} />
  );

/**
 * The bottom bar is pure chrome driven entirely by CSS custom properties owned
 * by the swipe shell. It must expose accessible tab buttons, follow
 * `activeScreen` for the active treatment, and keep the ring copies reading the
 * live drag position (that is what makes a loop-seam crossing glide instead of
 * jumping).
 */
describe('ScreenTabs', () => {
  it('renders one accessible button per tab', () => {
    renderTabs();

    expect(
      screen.getByRole('navigation', { name: 'Screens' })
    ).toBeInTheDocument();

    for (const tab of TABS) {
      expect(
        screen.getByRole('button', { name: tab.label })
      ).toBeInTheDocument();
    }
  });

  it('marks only the active tab as pressed', () => {
    renderTabs({ activeScreen: 1 });

    expect(screen.getByRole('button', { name: 'Tracker' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Logbook' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.getByRole('button', { name: 'Home' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('gives the active tab the foreground treatment and leaves others muted', () => {
    renderTabs({ activeScreen: 2 });

    expect(screen.getByRole('button', { name: 'Home' })).toHaveClass(
      'text-primary-foreground'
    );
    expect(screen.getByRole('button', { name: 'Home' })).not.toHaveClass(
      'text-muted'
    );
    expect(screen.getByRole('button', { name: 'Logbook' })).toHaveClass(
      'text-muted'
    );
  });

  it('reports the tapped tab index', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    renderTabs({ onSelect });

    await user.click(screen.getByRole('button', { name: 'Tracker' }));
    expect(onSelect).toHaveBeenCalledWith(1);

    await user.click(screen.getByRole('button', { name: 'Home' }));
    expect(onSelect).toHaveBeenLastCalledWith(2);
  });

  it('renders one clipped ring copy per RING_COPY_OFFSETS entry, all reading the live position', () => {
    const { container } = renderTabs({ activeScreen: 2 });

    const tracker = container.querySelector('[aria-hidden="true"]');
    expect(tracker).toHaveClass('overflow-hidden', 'rounded-full');

    const copies = Array.from(tracker.children);
    expect(copies).toHaveLength(RING_COPY_OFFSETS.length);

    const tabSharePercent = 100 / TABS.length;

    copies.forEach((copy, index) => {
      const transform = copy.style.transform;

      // Every copy reads the same live position ...
      expect(transform).toContain(`var(${SCREEN_DRAG_PROGRESS_VAR}, 3)`);
      // ... and adds its own static, one-track-apart loop offset.
      expect(transform).toContain(
        `+ ${RING_COPY_OFFSETS[index] * TABS.length}) * ${tabSharePercent}%`
      );
      // Duration is owned by the shell, never hard-coded here.
      expect(copy.style.transition).toContain(
        `var(${SCREEN_DRAG_DURATION_VAR}, 0.35s)`
      );
    });
  });
});
