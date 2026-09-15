import React from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EnergyMapCalculator } from './EnergyMapCalculator';
import { useEnergyMapStore } from '../../store/useEnergyMapStore';
import { getTodayDateKey } from '../../utils/data/dateKeys';
import { PreferencesMock } from '../../tests/mocks/capacitor.js';

/**
 * Orchestrator integration tier.
 *
 * Mounts the real `EnergyMapCalculator` against the real store (Capacitor plugin
 * doubles from `src/tests/setup.js` provide the web-shaped platform), so these
 * specs cover what no unit spec can: the hydration gate, all five carousel
 * screens, tab→chrome wiring, store→screen propagation, and a lazy modal
 * open/close round trip through the shared modal stack.
 *
 * Behaviour only on purpose: jsdom has no layout or paint, so anything purely
 * geometric stays with the pure-math specs (`tests/utils/carouselLoop.test.js`)
 * rather than being asserted here.
 */
const INITIAL_STATE = useEnergyMapStore.getState();

const TODAY = getTodayDateKey();

const get = () => useEnergyMapStore.getState();

/** Cold-start hydration through the real `initialize()` path. */
const hydrateStore = async () => {
  await get().initialize();
  expect(get().isLoaded, 'store failed to hydrate').toBe(true);
};

describe('EnergyMapCalculator (orchestrator integration)', () => {
  beforeEach(async () => {
    // Restore the pre-hydration state so every test starts from a cold start...
    useEnergyMapStore.setState(INITIAL_STATE);
    // ...and drop anything a previous test's debounced save persisted, since the
    // Preferences double is module-scoped for the whole file.
    await PreferencesMock.clear();

    // The store's debounced save and absent IndexedDB log intentionally noisy
    // warnings in jsdom; keep the output readable.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Pin the one-time coach-mark flag. A pending debounced save from an earlier
   * test can land mid-run and be reloaded by the next `initialize()`, so tests
   * that depend on this flag set it explicitly rather than assuming a default.
   */
  const setSwipeHintSeen = async (seen) => {
    await act(async () => {
      useEnergyMapStore.setState({
        userData: { ...get().userData, hasSeenSwipeHint: seen },
      });
    });
  };

  const renderApp = () => render(<EnergyMapCalculator />);

  const findTabBar = () => screen.findByRole('navigation', { name: 'Screens' });

  const tapTab = async (user, label) => {
    await user.click(await screen.findByRole('button', { name: label }));
  };

  /**
   * The header's glanceable stat line. Scoped to the header zone on purpose:
   * screens render their own trend/summary copy, so a document-wide text query
   * would be ambiguous (and would not prove the header wiring).
   */
  const findHeaderStat = (matcher) =>
    waitFor(() => {
      const header = document.querySelector('header');
      expect(header, 'header zone not mounted').toBeTruthy();
      return within(header).getByText(matcher);
    });

  it('shows the loading state until the store hydrates', async () => {
    renderApp();

    expect(screen.getByText('Loading your data…')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Screens' })).toBeNull();

    await hydrateStore();

    // The gate opens once hydration lands — no flash of default data.
    await waitFor(() =>
      expect(
        screen.getByRole('navigation', { name: 'Screens' })
      ).toBeInTheDocument()
    );
    expect(screen.queryByText('Loading your data…')).toBeNull();
  });

  it('mounts all five screens exactly once behind the floating tab bar', async () => {
    renderApp();
    await hydrateStore();

    const tabBar = await findTabBar();
    expect(tabBar).toBeInTheDocument();

    // One slide per screen — the shell loops with per-slide transforms and never
    // clones slides.
    expect(document.querySelectorAll('.carousel-slide')).toHaveLength(5);

    for (const label of [
      'Logbook',
      'Tracker',
      'Home',
      'Calorie Map',
      'Insights',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('starts on Home and retires the swipe coach mark when it is tapped', async () => {
    const user = userEvent.setup();
    renderApp();
    await hydrateStore();
    await findTabBar();
    await setSwipeHintSeen(false);

    expect(screen.getByRole('button', { name: 'Home' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    // The coach mark is a one-time hint gated by the persisted store flag.
    const hintChip = await screen.findByRole('button', {
      name: /Swipe between screens/,
    });
    expect(get().userData.hasSeenSwipeHint).toBe(false);

    await user.click(hintChip);

    expect(get().userData.hasSeenSwipeHint).toBe(true);
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /Swipe between screens/ })
      ).toBeNull()
    );
    // …and the settings gear takes its place.
    expect(
      await screen.findByRole('button', { name: 'Open settings' })
    ).toBeInTheDocument();
  });

  it('drives the header stat line from the tab bar selection', async () => {
    const user = userEvent.setup();
    renderApp();
    await hydrateStore();
    await findTabBar();

    // Home
    expect(
      await findHeaderStat(/(Training day|Rest day) · ≈[\d,]+ kcal TDEE/)
    ).toBeInTheDocument();

    // Logbook
    await tapTab(user, 'Logbook');
    expect(
      await findHeaderStat('0 active · 0 completed phases')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Logbook' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    // Tracker
    await tapTab(user, 'Tracker');
    expect(await findHeaderStat(/[\d,]+ \/ [\d,]+ kcal/)).toBeInTheDocument();

    // Calorie Map
    await tapTab(user, 'Calorie Map');
    expect(await findHeaderStat(/[\d,]+ steps today/)).toBeInTheDocument();

    // Insights — data-honest with no weigh-ins yet
    await tapTab(user, 'Insights');
    expect(await findHeaderStat('No data yet')).toBeInTheDocument();
  });

  it('propagates a logged food into the Tracker’s rendered totals', async () => {
    const user = userEvent.setup();
    renderApp();
    await hydrateStore();
    await findTabBar();

    await tapTab(user, 'Tracker');
    expect(await findHeaderStat(/^0 \/ [\d,]+ kcal/)).toBeInTheDocument();

    await waitFor(() => {
      get().addFoodEntry(TODAY, 'lunch', {
        id: 'integration-entry',
        foodId: 'usda_171077',
        name: 'Chicken breast, raw',
        grams: 150,
        calories: 500,
        protein: 33.8,
        carbs: 0,
        fats: 3.9,
        timestamp: Date.now(),
      });
    });

    // Store mutation → orchestrator props → AppHeader → rendered stat.
    expect(await findHeaderStat(/^500 \/ [\d,]+ kcal/)).toBeInTheDocument();
  });

  it('opens and closes the lazy Settings modal through the modal stack', async () => {
    const user = userEvent.setup();
    renderApp();
    await hydrateStore();
    await findTabBar();
    // The settings gear shares the header slot with the one-time swipe coach
    // mark, so retire that hint first (its own interaction is covered above).
    await setSwipeHintSeen(true);

    await user.click(
      await screen.findByRole('button', { name: 'Open settings' })
    );

    // Lazy + Suspense: the fullscreen editor mounts on demand. Its Back control
    // is unique to that surface, so it doubles as the open/closed probe.
    expect(
      await screen.findByRole('button', { name: 'Back' })
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back' }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
    );
  });
});
