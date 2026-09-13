import { beforeEach, describe, expect, it } from 'vitest';

import { useEnergyMapStore } from './useEnergyMapStore';
import { getTodayDateKey } from '../utils/data/dateKeys';
import { getNutritionTotalsForDate } from '../utils/phases/phases';
import { clampCustomActivityMultiplier } from '../constants/activity/activityPresets';

/**
 * Store action contracts.
 *
 * These run in the UI tier (Vitest + jsdom) because the store pulls in
 * `@capacitor/preferences` through `utils/data/storage.js`; the plugin doubles in
 * `src/tests/setup.js` give it a working web-shaped backend.
 *
 * The store boots with `getDefaultEnergyMapData()` synchronously, so actions can
 * be exercised without `setupEnergyMapStore()`/`initialize()` — no hydration and
 * no 1s save debounce involved.
 */
const INITIAL_STATE = useEnergyMapStore.getState();

const TODAY = getTodayDateKey();

const ENTRY = {
  id: 'entry-1',
  foodId: 'usda_171077',
  name: 'Chicken breast, raw',
  grams: 150,
  calories: 180,
  protein: 33.8,
  carbs: 0,
  fats: 3.9,
  timestamp: 1_700_000_000_000,
};

const get = () => useEnergyMapStore.getState();

beforeEach(() => {
  useEnergyMapStore.setState(INITIAL_STATE);
});

describe('store - addFoodEntry', () => {
  it('creates the date/meal bucket on demand', () => {
    get().addFoodEntry(TODAY, 'lunch', ENTRY);

    const { nutritionData } = get().userData;
    expect(nutritionData[TODAY].lunch).toEqual([ENTRY]);
  });

  it('appends to an existing meal without disturbing siblings', () => {
    get().addFoodEntry(TODAY, 'lunch', ENTRY);
    const second = { ...ENTRY, id: 'entry-2', calories: 220 };
    get().addFoodEntry(TODAY, 'lunch', second);
    get().addFoodEntry(TODAY, 'breakfast', { ...ENTRY, id: 'entry-3' });

    const { nutritionData } = get().userData;
    expect(nutritionData[TODAY].lunch).toEqual([ENTRY, second]);
    expect(nutritionData[TODAY].breakfast).toEqual([
      { ...ENTRY, id: 'entry-3' },
    ]);
  });

  it('is reflected by the canonical nutrition totals helper', () => {
    get().addFoodEntry(TODAY, 'lunch', ENTRY);
    get().addFoodEntry(TODAY, 'lunch', { ...ENTRY, id: 'entry-2' });

    const totals = getNutritionTotalsForDate(
      get().userData.nutritionData,
      TODAY
    );
    expect(totals.calories).toBe(360);
    expect(totals.protein).toBeCloseTo(67.6, 5);
  });

  it('ignores calls with missing arguments', () => {
    const before = get().userData;

    get().addFoodEntry(null, 'lunch', ENTRY);
    get().addFoodEntry(TODAY, null, ENTRY);
    get().addFoodEntry(TODAY, 'lunch', null);

    expect(get().userData).toBe(before);
  });

  it('refreshes the daily snapshot for the written date', () => {
    get().addFoodEntry(TODAY, 'lunch', ENTRY);

    const snapshot = get().userData.dailySnapshots[TODAY];
    expect(snapshot).toBeTruthy();
    expect(snapshot.date).toBe(TODAY);
    expect(snapshot.intake).toBe(180);
  });
});

describe('store - updateFoodEntry', () => {
  it('replaces the matching entry only', () => {
    const sibling = { ...ENTRY, id: 'entry-2', calories: 90 };
    get().addFoodEntry(TODAY, 'lunch', ENTRY);
    get().addFoodEntry(TODAY, 'lunch', sibling);

    const updated = { ...ENTRY, grams: 200, calories: 240 };
    get().updateFoodEntry(TODAY, 'lunch', updated);

    const entries = get().userData.nutritionData[TODAY].lunch;
    expect(entries).toEqual([updated, sibling]);
  });

  it('leaves the meal untouched when no entry matches', () => {
    get().addFoodEntry(TODAY, 'lunch', ENTRY);
    const before = get().userData.nutritionData[TODAY].lunch;

    get().updateFoodEntry(TODAY, 'lunch', { ...ENTRY, id: 'nope', grams: 999 });

    expect(get().userData.nutritionData[TODAY].lunch).toEqual(before);
  });

  it('tolerates an unknown meal bucket by creating it empty', () => {
    get().updateFoodEntry(TODAY, 'dinner', ENTRY);

    expect(get().userData.nutritionData[TODAY].dinner).toEqual([]);
  });
});

describe('store - deleteFoodEntry', () => {
  it('removes only the matching entry', () => {
    const sibling = { ...ENTRY, id: 'entry-2' };
    get().addFoodEntry(TODAY, 'lunch', ENTRY);
    get().addFoodEntry(TODAY, 'lunch', sibling);

    get().deleteFoodEntry(TODAY, 'lunch', ENTRY.id);

    expect(get().userData.nutritionData[TODAY].lunch).toEqual([sibling]);
  });

  it('is a no-op for an unknown id', () => {
    get().addFoodEntry(TODAY, 'lunch', ENTRY);

    get().deleteFoodEntry(TODAY, 'lunch', 'missing');

    expect(get().userData.nutritionData[TODAY].lunch).toEqual([ENTRY]);
  });

  it('ignores calls with missing arguments', () => {
    const before = get().userData;

    get().deleteFoodEntry(null, 'lunch', ENTRY.id);
    get().deleteFoodEntry(TODAY, null, ENTRY.id);
    get().deleteFoodEntry(TODAY, 'lunch', null);

    expect(get().userData).toBe(before);
  });

  it('zeroes the day back out through the canonical totals helper', () => {
    get().addFoodEntry(TODAY, 'lunch', ENTRY);
    get().deleteFoodEntry(TODAY, 'lunch', ENTRY.id);

    const totals = getNutritionTotalsForDate(
      get().userData.nutritionData,
      TODAY
    );
    expect(totals.calories).toBe(0);
  });
});

describe('store - setSelectedGoal', () => {
  it('stores the goal and change timestamp', () => {
    get().setSelectedGoal('cutting', 1_700_000_000_000);

    expect(get().userData.selectedGoal).toBe('cutting');
    expect(get().userData.goalChangedAt).toBe(1_700_000_000_000);
  });

  it('falls back to now for a non-finite timestamp', () => {
    get().setSelectedGoal('cutting', 'not-a-number');

    expect(get().userData.selectedGoal).toBe('cutting');
    expect(Number.isFinite(get().userData.goalChangedAt)).toBe(true);
  });

  it('leaves the goal and its timestamp untouched when unchanged', () => {
    const before = get().userData;

    get().setSelectedGoal(before.selectedGoal, 1_700_000_000_000);

    // The goal fields are untouched; today's snapshot may still be refreshed,
    // so this asserts the action's own contract rather than whole-state identity.
    expect(get().userData.selectedGoal).toBe(before.selectedGoal);
    expect(get().userData.goalChangedAt).toBe(before.goalChangedAt);
    expect(get().userData.goalChangedAt).not.toBe(1_700_000_000_000);
  });

  it('stamps today’s snapshot so the new goal feeds the crude AT history', () => {
    get().setSelectedGoal('cutting');

    expect(get().userData.dailySnapshots[TODAY]?.goalAtSnapshot).toBe(
      'cutting'
    );
  });

  it('is refused while an active phase owns the goal delta', () => {
    // The derived lock flag is what HomeScreen consumes; the action must respect
    // it so a locked goal cannot be switched behind the phase's back.
    useEnergyMapStore.setState({ isGoalLockedByActivePhase: true });
    const before = get().userData;

    get().setSelectedGoal('aggressive_bulk');

    expect(get().userData).toBe(before);
  });
});

describe('store - markSwipeHintSeen', () => {
  it('flips the one-time flag', () => {
    expect(get().userData.hasSeenSwipeHint).toBe(false);

    get().markSwipeHintSeen();

    expect(get().userData.hasSeenSwipeHint).toBe(true);
  });

  it('short-circuits on repeat calls', () => {
    get().markSwipeHintSeen();
    const afterFirst = get().userData;

    get().markSwipeHintSeen();

    expect(get().userData).toBe(afterFirst);
  });
});

describe('store - setDailyNeatOverride', () => {
  it('ignores an invalid date key', () => {
    const before = get().userData;

    get().setDailyNeatOverride('not-a-date', { multiplier: 0.3 });

    expect(get().userData).toBe(before);
  });

  it('stores a clamped override with normalised metadata', () => {
    get().setDailyNeatOverride(TODAY, {
      multiplier: 0.3,
      presetKey: 'active',
      label: 'Highly Active',
    });

    const override = get().userData.dailyNeatOverrides[TODAY];
    expect(override.multiplier).toBe(0.3);
    expect(override.presetKey).toBe('active');
    expect(override.label).toBe('Highly Active');
    expect(Number.isFinite(override.updatedAt)).toBe(true);
  });

  it('clamps out-of-range multipliers through the canonical clamp helper', () => {
    get().setDailyNeatOverride(TODAY, { multiplier: 5 });
    expect(get().userData.dailyNeatOverrides[TODAY].multiplier).toBe(
      clampCustomActivityMultiplier(5)
    );

    get().setDailyNeatOverride(TODAY, { multiplier: 0.0001 });
    expect(get().userData.dailyNeatOverrides[TODAY].multiplier).toBe(
      clampCustomActivityMultiplier(0.0001)
    );
  });

  it('coerces blank preset metadata to null', () => {
    get().setDailyNeatOverride(TODAY, {
      multiplier: 0.25,
      presetKey: '   ',
      label: '',
    });

    const override = get().userData.dailyNeatOverrides[TODAY];
    expect(override.presetKey).toBeNull();
    expect(override.label).toBeNull();
  });

  it('ignores a non-numeric multiplier', () => {
    const before = get().userData;

    get().setDailyNeatOverride(TODAY, { multiplier: 'abc' });

    // The override map is untouched. (The action still refreshes the day's
    // snapshot afterwards, so this is not whole-state identity.)
    expect(get().userData.dailyNeatOverrides).toEqual(
      before.dailyNeatOverrides
    );
    expect(get().userData.dailyNeatOverrides[TODAY]).toBeUndefined();
  });

  it('clears the override when passed null', () => {
    get().setDailyNeatOverride(TODAY, { multiplier: 0.3 });
    expect(get().userData.dailyNeatOverrides[TODAY]).toBeTruthy();

    get().setDailyNeatOverride(TODAY, null);

    expect(get().userData.dailyNeatOverrides[TODAY]).toBeUndefined();
  });

  it('leaves the override map alone when clearing a date that has none', () => {
    const before = get().userData;

    get().setDailyNeatOverride(TODAY, null);

    expect(get().userData.dailyNeatOverrides).toEqual(
      before.dailyNeatOverrides
    );
  });

  it('only affects the requested date', () => {
    get().setDailyNeatOverride('2026-09-12', { multiplier: 0.3 });
    get().setDailyNeatOverride(TODAY, { multiplier: 0.35 });

    expect(get().userData.dailyNeatOverrides['2026-09-12'].multiplier).toBe(
      0.3
    );
    expect(get().userData.dailyNeatOverrides[TODAY].multiplier).toBe(0.35);
  });

  it('refreshes the daily snapshot for the overridden date', () => {
    get().setDailyNeatOverride(TODAY, { multiplier: 0.3 });

    expect(get().userData.dailySnapshots[TODAY]).toBeTruthy();
  });
});

describe('store - togglePinnedFood', () => {
  it('pins then unpins', () => {
    get().togglePinnedFood('usda_171077');
    expect(get().userData.pinnedFoods).toEqual(['usda_171077']);

    get().togglePinnedFood('usda_171077');
    expect(get().userData.pinnedFoods).toEqual([]);
  });

  it('ignores a blank id without changing the pinned list', () => {
    // A nullish id hits the action's early return; a whitespace-only id passes
    // that guard but resolves to no change in the list itself.
    const before = get().userData;

    get().togglePinnedFood(null);
    expect(get().userData).toBe(before);

    get().togglePinnedFood('   ');
    expect(get().userData.pinnedFoods).toEqual(before.pinnedFoods);
  });

  it('does not duplicate an existing pin', () => {
    get().togglePinnedFood('a');
    get().togglePinnedFood('b');
    get().togglePinnedFood('a');
    get().togglePinnedFood('a');

    expect(get().userData.pinnedFoods).toEqual(['b', 'a']);
  });
});
