import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppHeader } from './AppHeader';

const SCREEN_COUNT = 5;

const baseProps = {
  activeScreen: 0,
  screenCount: SCREEN_COUNT,
  nutritionData: {},
  trackerSelectedDate: '2026-09-13',
  calorieTargetCalories: 2000,
  phases: [],
  weightEntries: [],
  todaySnapshot: null,
  showSwipeHint: false,
  onDismissSwipeHint: vi.fn(),
  onOpenSettings: vi.fn(),
};

const renderHeader = (props = {}) =>
  render(<AppHeader {...baseProps} {...props} />);

/**
 * AppHeader is the per-screen glanceable stat line + coach mark + swipe dots.
 * It is a thin display component: every string it shows must come from the
 * canonical helpers, and each screen index must map to its own stat.
 */
describe('AppHeader', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('greeting and date', () => {
    const freezeAt = (hour) => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.setSystemTime(new Date(2026, 8, 13, hour, 0, 0));
    };

    it('greets the morning', () => {
      freezeAt(9);
      renderHeader();
      expect(screen.getByText('Good morning')).toBeInTheDocument();
    });

    it('greets the afternoon', () => {
      freezeAt(14);
      renderHeader();
      expect(screen.getByText('Good afternoon')).toBeInTheDocument();
    });

    it('greets the evening', () => {
      freezeAt(21);
      renderHeader();
      expect(screen.getByText('Good evening')).toBeInTheDocument();
    });

    it('renders the long date', () => {
      freezeAt(9);
      renderHeader();
      expect(screen.getByText(/September 13/)).toBeInTheDocument();
    });
  });

  describe('per-screen stat line', () => {
    it('summarises phase progress on the Logbook', () => {
      renderHeader({
        activeScreen: 0,
        phases: [
          { status: 'active' },
          { status: 'completed' },
          { status: 'completed' },
        ],
      });

      expect(
        screen.getByText('1 active · 2 completed phases')
      ).toBeInTheDocument();
    });

    it('uses the singular phase label for a single phase', () => {
      renderHeader({ activeScreen: 0, phases: [{ status: 'active' }] });

      expect(
        screen.getByText('1 active · 0 completed phase')
      ).toBeInTheDocument();
    });

    it('shows intake against target on the Tracker', () => {
      renderHeader({
        activeScreen: 1,
        nutritionData: {
          '2026-09-13': {
            breakfast: [{ calories: 500, protein: 30, carbs: 40, fats: 20 }],
            lunch: [{ calories: 700, protein: 40, carbs: 60, fats: 25 }],
          },
        },
      });

      expect(screen.getByText('1,200 / 2,000 kcal')).toBeInTheDocument();
    });

    it('shows the day type and TDEE on Home', () => {
      renderHeader({
        activeScreen: 2,
        todaySnapshot: { isTrainingDay: true, tdee: 2400 },
      });

      expect(
        screen.getByText('Training day · ≈2,400 kcal TDEE')
      ).toBeInTheDocument();
    });

    it('shows a rest day on Home when not a training day', () => {
      renderHeader({
        activeScreen: 2,
        todaySnapshot: { isTrainingDay: false, tdee: 2100 },
      });

      expect(
        screen.getByText('Rest day · ≈2,100 kcal TDEE')
      ).toBeInTheDocument();
    });

    it('shows today’s steps on the Calorie Map', () => {
      renderHeader({
        activeScreen: 3,
        todaySnapshot: { stepCount: 8500 },
      });

      expect(screen.getByText('8,500 steps today')).toBeInTheDocument();
    });

    it('stays data-honest about an absent weight trend on Insights', () => {
      renderHeader({ activeScreen: 4, weightEntries: [] });

      expect(screen.getByText('No data yet')).toBeInTheDocument();
    });

    it('shows the weekly rate on Insights when a trend exists', () => {
      renderHeader({
        activeScreen: 4,
        weightEntries: [
          { date: '2026-09-07', weight: 80 },
          { date: '2026-09-13', weight: 79 },
        ],
      });

      // Reuses calculateWeightTrend — the header must never invent its own rate.
      expect(screen.getByText(/kg\/wk/)).toBeInTheDocument();
      expect(screen.queryByText('No data yet')).not.toBeInTheDocument();
    });
  });

  describe('right-hand slot', () => {
    it('shows the one-time swipe coach mark while unseen', async () => {
      const user = userEvent.setup();
      const onDismissSwipeHint = vi.fn();

      renderHeader({ showSwipeHint: true, onDismissSwipeHint });

      const chip = screen.getByRole('button', {
        name: /Swipe between screens/,
      });
      expect(
        screen.queryByRole('button', { name: 'Open settings' })
      ).toBeNull();

      await user.click(chip);
      expect(onDismissSwipeHint).toHaveBeenCalledTimes(1);
    });

    it('shows the settings gear once the hint is dismissed', async () => {
      const user = userEvent.setup();
      const onOpenSettings = vi.fn();

      renderHeader({ showSwipeHint: false, onOpenSettings });

      expect(
        screen.queryByRole('button', { name: /Swipe between screens/ })
      ).toBeNull();

      await user.click(screen.getByRole('button', { name: 'Open settings' }));
      expect(onOpenSettings).toHaveBeenCalledTimes(1);
    });
  });

  describe('swipe dots', () => {
    it('sizes the dot row from px geometry for the screen count', () => {
      const { container } = renderHeader({ screenCount: SCREEN_COUNT });

      // The dots row is the aria-hidden container sized in px (other aria-hidden
      // nodes in the header are icons/trackers), so locate it by its height.
      const dots = Array.from(
        container.querySelectorAll('div[aria-hidden="true"]')
      ).find((node) => node.style.height === '6px');

      expect(dots).toBeTruthy();
      // (count - 1) * 12px step + 6px dot — px-only so the app's rem-based root
      // font can never shift the dots out of alignment.
      expect(dots).toHaveStyle({ width: '54px', height: '6px' });
      // Static dots + the ring copies that track the live drag position.
      expect(dots.children).toHaveLength(SCREEN_COUNT + 3);
    });
  });
});
