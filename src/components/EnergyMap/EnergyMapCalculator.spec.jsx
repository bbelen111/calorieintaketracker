import React from 'react';
import {
  act,
  configure,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EnergyMapCalculator } from './EnergyMapCalculator';
import { useEnergyMapStore } from '../../store/useEnergyMapStore';
import { getTodayDateKey, getWindowDateKeys } from '../../utils/data/dateKeys';
import {
  AppMock,
  CapacitorMock,
  PreferencesMock,
} from '../../tests/mocks/capacitor.js';

// The orchestrator schedules an idle food-catalog warm-up a few seconds after
// hydration (hooks/useFoodCatalogWarmUp.js, covered by its own spec). Under
// jsdom it tries to load the sql.js WASM from a path that does not exist here,
// which (a) burns CPU in the middle of a test and (b) surfaces as an unhandled
// rejection that vitest warns "might cause false positive tests". Nothing in
// this file is about the warm-up, so it is stubbed out.
vi.mock('../../hooks/useFoodCatalogWarmUp', () => ({
  useFoodCatalogWarmUp: () => {},
}));

// Food Search and the recipe ingredient page query the food catalog / online
// service on open. Real queries would need the sql.js WASM and the network, so
// they return empty pages; nothing here is about what they return.
vi.mock('../../services/foodSearch', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    searchFoodsLocal: vi.fn(async () => ({
      results: [],
      nextOffset: 0,
      hasMoreLocal: false,
    })),
    searchFoodsOnline: vi.fn(async () => ({
      results: [],
      errorsBySource: {},
    })),
  };
});

// These tests mount the whole app (five screens, the store, lazily loaded
// modals) and drive real user events, so they are the slowest in the UI tier:
// the heaviest takes ~2.6s ALONE, against vitest's 5s default. In a full run
// dozens of jsdom workers compete for the CPU and that doubles, which made
// them fail intermittently in TWO different ways, so there are two ceilings:
//
//  - the whole test timing out ("confirms before overwriting a weight entry"
//    hit vitest's 5s limit): `testTimeout` below;
//  - an async query giving up before a lazily loaded modal had rendered
//    ("Unable to find heading 'Weight Tracker'" after Testing Library's 1s
//    default for `findBy*` / `waitFor`): `asyncUtilTimeout` below.
//
// Both are ceilings for a loaded machine, not expectations: a query returns the
// instant it matches, so passing tests are no slower, and a real regression
// (the element never appears) still fails with its element error - just after
// 5s instead of 1s, well inside the test limit.
vi.setConfig({ testTimeout: 20_000 });
configure({ asyncUtilTimeout: 5000 });

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
    CapacitorMock.isNativePlatform.mockReturnValue(false);
    CapacitorMock.getPlatform.mockReturnValue('web');
    AppMock.addListener.mockClear();
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
    await setSwipeHintSeen(false);
    await user.click(
      await screen.findByRole('button', { name: /Swipe between screens/ })
    );

    await user.click(
      await screen.findByRole('button', { name: 'Open settings' })
    );

    // Lazy + Suspense: the fullscreen editor mounts on demand.
    expect(
      await screen.findByRole('button', { name: 'Back' })
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back' }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
    );
  });

  it('routes Android back from a Settings subpage to the hub before closing', async () => {
    CapacitorMock.isNativePlatform.mockReturnValue(true);
    CapacitorMock.getPlatform.mockReturnValue('android');
    const user = userEvent.setup();
    renderApp();
    await hydrateStore();
    await findTabBar();
    await setSwipeHintSeen(false);
    await user.click(
      await screen.findByRole('button', { name: /Swipe between screens/ })
    );

    await user.click(
      await screen.findByRole('button', { name: 'Open settings' })
    );
    await user.click(
      await screen.findByRole('button', { name: 'Open Home & Tips' })
    );
    await user.click(await screen.findByRole('button', { name: /Shortcut:/ }));
    expect(
      screen.getByRole('heading', { name: 'Choose a metric' })
    ).toBeInTheDocument();

    const pressAndroidBack = async () => {
      let handler;
      await waitFor(() => {
        handler = AppMock.addListener.mock.calls.find(
          ([event]) => event === 'backButton'
        )?.[1];
        expect(handler).toBeTypeOf('function');
      });
      act(() => handler());
    };

    // Choose a metric -> Home & Tips
    await pressAndroidBack();
    expect(
      screen.getByRole('heading', { name: 'Home & Tips' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Choose a metric' })
    ).toBeNull();

    // Home & Tips -> Settings hub
    await pressAndroidBack();
    expect(
      screen.getByRole('navigation', { name: 'Settings categories' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Home & Tips' })).toBeNull();

    // Settings hub -> close
    await pressAndroidBack();
    await waitFor(() =>
      expect(
        screen.queryByRole('navigation', { name: 'Settings categories' })
      ).toBeNull()
    );
  });

  it('closes a Settings child picker before navigating out of its subpage', async () => {
    CapacitorMock.isNativePlatform.mockReturnValue(true);
    CapacitorMock.getPlatform.mockReturnValue('android');
    const user = userEvent.setup();
    renderApp();
    await hydrateStore();
    await findTabBar();
    await setSwipeHintSeen(false);
    await user.click(
      await screen.findByRole('button', { name: /Swipe between screens/ })
    );

    await user.click(
      await screen.findByRole('button', { name: 'Open settings' })
    );
    await user.click(
      await screen.findByRole('button', { name: 'Open Profile & Health' })
    );
    await user.click(
      await screen.findByRole('button', { name: 'Open age picker' })
    );
    expect(
      await screen.findByRole('heading', { name: 'Select Age' })
    ).toBeInTheDocument();

    const pressAndroidBack = async () => {
      let handler;
      await waitFor(() => {
        handler = AppMock.addListener.mock.calls.find(
          ([event]) => event === 'backButton'
        )?.[1];
        expect(handler).toBeTypeOf('function');
      });
      act(() => handler());
    };

    await pressAndroidBack();
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Select Age' })).toBeNull()
    );
    expect(
      screen.getByRole('heading', { name: 'Profile & Health' })
    ).toBeInTheDocument();
  });

  /**
   * Regression: modals opened from INSIDE another modal (the Add Custom Food
   * form over Food Search, the recipe ingredient page over that) were not in the
   * orchestrator's priority list, so Android back skipped them and closed the
   * whole Food Search page underneath. Back must peel the stack one layer at a
   * time, top first, whatever level each layer lives at.
   */
  it('peels Food Search child modals one layer per Android back press', async () => {
    CapacitorMock.isNativePlatform.mockReturnValue(true);
    CapacitorMock.getPlatform.mockReturnValue('android');
    const user = userEvent.setup();
    renderApp();
    await hydrateStore();
    await findTabBar();

    const pressAndroidBack = async () => {
      let handler;
      await waitFor(() => {
        handler = AppMock.addListener.mock.calls.find(
          ([event]) => event === 'backButton'
        )?.[1];
        expect(handler).toBeTypeOf('function');
      });
      act(() => handler());
    };
    const heading = (name) => screen.queryByRole('heading', { name });
    const gone = (name) => waitFor(() => expect(heading(name)).toBeNull());

    // Home pill -> meal type -> Food Search.
    await user.click(
      await screen.findByRole('button', {
        name: /^Calories today, 0 of \d+ kcal\. Add meal$/,
      })
    );
    await user.click(await screen.findByRole('button', { name: 'Lunch' }));
    expect(
      await screen.findByRole('heading', { name: 'Add Food' })
    ).toBeInTheDocument();

    // Layer 1: the Add Custom Food form.
    await user.click(screen.getByRole('button', { name: 'Add Food' }));
    expect(
      await screen.findByRole('heading', { name: 'Add Custom Food' })
    ).toBeInTheDocument();

    await pressAndroidBack();
    await gone('Add Custom Food');
    // The page underneath is still there: this is the reported bug.
    expect(heading('Add Food')).toBeInTheDocument();

    // Layers 2 and 3: the recipe form, then the ingredient page above it.
    await user.click(screen.getByRole('button', { name: 'Add Food' }));
    await user.click(await screen.findByRole('button', { name: 'Recipe' }));
    await user.click(
      await screen.findByRole('button', { name: /add ingredient/i })
    );
    expect(
      await screen.findByRole('heading', { name: 'Add ingredient' })
    ).toBeInTheDocument();

    await pressAndroidBack();
    await gone('Add ingredient');
    expect(heading('New Recipe')).toBeInTheDocument();
    expect(heading('Add Food')).toBeInTheDocument();

    await pressAndroidBack();
    await gone('New Recipe');
    expect(heading('Add Food')).toBeInTheDocument();

    // Only now does back reach the Food Search page itself.
    await pressAndroidBack();
    await gone('Add Food');
  });

  it('confirms before overwriting a weight entry while adding', async () => {
    const user = userEvent.setup();
    renderApp();
    await hydrateStore();
    await findTabBar();

    act(() => get().saveWeightEntry({ date: TODAY, weight: 75 }));
    await tapTab(user, 'Insights');
    await user.click(
      await screen.findByRole('button', { name: /Weight Snapshot/ })
    );
    expect(
      await screen.findByRole('heading', { name: 'Weight Tracker' })
    ).toBeInTheDocument();

    const emptyDate = getWindowDateKeys(TODAY, 7)[0];
    const emptySlot = document.querySelector('div.absolute.cursor-pointer');
    expect(emptySlot).toBeTruthy();
    await user.click(emptySlot);
    await user.click(
      await screen.findByRole('button', { name: 'Add weight entry' })
    );
    expect(
      await screen.findByRole('heading', { name: 'Add Weight Entry' })
    ).toBeInTheDocument();

    // Simulate the date becoming occupied while the add form is open.
    act(() => get().saveWeightEntry({ date: emptyDate, weight: 70 }));
    await user.click(screen.getByRole('button', { name: 'Save', exact: true }));

    expect(
      await screen.findByRole('heading', { name: 'Overwrite weight entry?' })
    ).toBeInTheDocument();
    expect(
      get().userData.weightEntries.find((entry) => entry.date === emptyDate)
        .weight
    ).toBe(70);

    const cancelButtons = screen.getAllByRole('button', {
      name: 'Cancel',
      exact: true,
    });
    await user.click(cancelButtons[cancelButtons.length - 1]);
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Overwrite weight entry?' })
      ).toBeNull()
    );
    expect(
      screen.getByRole('heading', { name: 'Add Weight Entry' })
    ).toBeInTheDocument();
    expect(
      get().userData.weightEntries.find((entry) => entry.date === emptyDate)
        .weight
    ).toBe(70);

    await user.click(screen.getByRole('button', { name: 'Save', exact: true }));
    await user.click(
      await screen.findByRole('button', { name: 'Overwrite', exact: true })
    );

    await waitFor(() =>
      expect(
        get().userData.weightEntries.find((entry) => entry.date === emptyDate)
          .weight
      ).toBe(75)
    );
  });

  it("shows today's calories in the Home meal pill and opens the meal flow", async () => {
    const user = userEvent.setup();
    renderApp();
    await hydrateStore();
    await findTabBar();

    // Home is the default screen. The pill is both the readout and the
    // add-meal action, so one labelled button proves the whole wiring.
    expect(
      await screen.findByRole('heading', { name: 'Energy Map' })
    ).toBeInTheDocument();
    const mealPill = await screen.findByRole('button', {
      name: /^Calories today, 0 of \d+ kcal\. Add meal$/,
    });
    expect(mealPill).toHaveTextContent(/0 \/ [\d,]+ kcal/);

    await user.click(mealPill);

    // First step of the canonical flow: the meal-type picker.
    expect(
      await screen.findByRole('heading', { name: 'Meal Type' })
    ).toBeInTheDocument();
  });

  it('drives the Home meal pill from the store', async () => {
    renderApp();
    await hydrateStore();
    await findTabBar();

    await waitFor(() => {
      get().addFoodEntry(TODAY, 'lunch', {
        id: 'home-pill-entry',
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

    // Store mutation -> orchestrator props -> HomeScreen -> the pill's readout.
    expect(
      await screen.findByRole('button', { name: /^Calories today, 500 of/ })
    ).toBeInTheDocument();
  });

  it('lets the Home pill show another metric without adding an extra add-meal button', async () => {
    const user = userEvent.setup();
    renderApp();
    await hydrateStore();
    await findTabBar();

    await screen.findByRole('button', { name: /^Calories today,/ });

    await act(async () => {
      get().handleUserDataChange('heroActionMetric', 'steps');
    });

    // The pill swaps cleanly to steps with no extra "+" tacked on beside it.
    const stepsPill = await screen.findByRole('button', {
      name: /^Steps today,.*Open step tracker$/,
    });
    expect(stepsPill).toHaveTextContent(/0 \/ [\d,]+ steps/);
    expect(
      screen.queryByRole('button', { name: /^Calories today,/ })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add meal' })
    ).not.toBeInTheDocument();

    // Tapping the pill opens its target tracker.
    await user.click(stepsPill);
    expect(
      await screen.findByRole('heading', { name: 'Step Tracker' })
    ).toBeInTheDocument();
  });

  it('makes both Home tiles replaceable: Weight and Body Fat are just two options', async () => {
    renderApp();
    await hydrateStore();
    await findTabBar();

    await act(async () => {
      get().handleUserDataChange('bodyFatTrackingEnabled', true);
      get().handleUserDataChange('heroActionMetric', 'calories');
      get().handleUserDataChange('heroTileLeftMetric', 'weight');
      get().handleUserDataChange('heroTileRightMetric', 'bodyFat');
    });

    // Out of the box Home looks as it always did.
    expect(
      await screen.findByRole('button', {
        name: /^Weight,.*Open weight tracker$/,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Body fat,.*Open body fat tracker$/ })
    ).toBeInTheDocument();

    // Replace the Weight tile with steps: Weight is simply gone from Home.
    await act(async () => {
      get().handleUserDataChange('heroTileLeftMetric', 'steps');
    });
    expect(
      await screen.findByRole('button', { name: /^Steps today,/ })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Weight,/ })
    ).not.toBeInTheDocument();

    // Pointing the pill at a metric a tile already shows swaps them instead of
    // repeating it: steps moves up, the tile takes calories.
    await act(async () => {
      get().handleUserDataChange('heroActionMetric', 'steps');
    });
    expect(
      await screen.findByRole('button', { name: /^Calories today,/ })
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: /^Steps today,/ })
    ).toHaveLength(1);
  });

  it('steps Body Fat aside while tracking is off and brings it back with tracking', async () => {
    renderApp();
    await hydrateStore();
    await findTabBar();

    await act(async () => {
      get().handleUserDataChange('bodyFatTrackingEnabled', true);
      get().handleUserDataChange('heroActionMetric', 'calories');
      get().handleUserDataChange('heroTileLeftMetric', 'weight');
      get().handleUserDataChange('heroTileRightMetric', 'bodyFat');
    });
    expect(
      await screen.findByRole('button', { name: /^Body fat,/ })
    ).toBeInTheDocument();

    await act(async () => {
      get().handleUserDataChange('bodyFatTrackingEnabled', false);
    });

    // No hole in the row: the slot shows the next free metric instead.
    expect(
      await screen.findByRole('button', { name: /^Steps today,/ })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Body fat,/ })
    ).not.toBeInTheDocument();
    // The stored pick is untouched, so it returns with tracking.
    expect(get().userData.heroTileRightMetric).toBe('bodyFat');

    await act(async () => {
      get().handleUserDataChange('bodyFatTrackingEnabled', true);
    });
    expect(
      await screen.findByRole('button', { name: /^Body fat,/ })
    ).toBeInTheDocument();
  });
});
