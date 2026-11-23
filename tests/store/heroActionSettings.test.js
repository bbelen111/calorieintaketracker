import assert from 'node:assert/strict';
import test from 'node:test';

import {
  setupEnergyMapStore,
  useEnergyMapStore,
} from '../../src/store/useEnergyMapStore.js';
import { installWindowStorage } from '../helpers/capacitorShims.js';

const originalWindow = globalThis.window;
const originalConsoleWarn = console.warn;
installWindowStorage();
console.warn = () => {};

test.after(async () => {
  await new Promise((resolve) => setTimeout(resolve, 1100));
  console.warn = originalConsoleWarn;
  globalThis.window = originalWindow;
});

let setupCompleted = false;
const ensureStoreSetup = async () => {
  if (!setupCompleted) {
    setupEnergyMapStore();
    setupCompleted = true;
  }
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (useEnergyMapStore.getState().isLoaded) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail('store did not finish hydrating');
};

const change = (field, value) =>
  useEnergyMapStore.getState().handleUserDataChange(field, value);
const slots = () => {
  const { heroActionMetric, heroTileLeftMetric, heroTileRightMetric } =
    useEnergyMapStore.getState().userData;
  return {
    pill: heroActionMetric,
    left: heroTileLeftMetric,
    right: heroTileRightMetric,
  };
};
const reset = () => {
  change('bodyFatTrackingEnabled', true);
  change('heroActionMetric', 'calories');
  change('heroTileLeftMetric', 'weight');
  change('heroTileRightMetric', 'bodyFat');
};

test('defaults: calories, Weight, Body Fat', async () => {
  await ensureStoreSetup();
  reset();
  assert.deepEqual(slots(), {
    pill: 'calories',
    left: 'weight',
    right: 'bodyFat',
  });
});

test('picking a free metric changes only that slot', async () => {
  await ensureStoreSetup();
  reset();

  change('heroTileLeftMetric', 'steps');
  assert.deepEqual(slots(), {
    pill: 'calories',
    left: 'steps',
    right: 'bodyFat',
  });
});

test('picking a metric another slot shows swaps the two, never duplicates', async () => {
  await ensureStoreSetup();
  reset();

  // Put steps on the left tile, then take steps onto the pill: they swap.
  change('heroTileLeftMetric', 'steps');
  change('heroActionMetric', 'steps');
  assert.deepEqual(slots(), {
    pill: 'steps',
    left: 'calories',
    right: 'bodyFat',
  });

  // And from a tile onto a tile.
  change('heroTileRightMetric', 'calories');
  assert.deepEqual(slots(), {
    pill: 'steps',
    left: 'bodyFat',
    right: 'calories',
  });
});

test('Weight and Body Fat are refused on the pill and never swapped onto it', async () => {
  await ensureStoreSetup();
  reset();

  change('heroActionMetric', 'weight');
  change('heroActionMetric', 'bodyFat');
  assert.deepEqual(slots(), {
    pill: 'calories',
    left: 'weight',
    right: 'bodyFat',
  });

  // Moving calories onto the Weight tile moves the pill to a free pill metric
  // instead of putting Weight on the pill.
  change('heroTileLeftMetric', 'calories');
  assert.equal(slots().left, 'calories');
  assert.notEqual(slots().pill, 'weight');
  assert.notEqual(slots().pill, 'bodyFat');
  assert.equal(new Set(Object.values(slots())).size, 3);
});

test('Body Fat is refused while tracking is off, and returns with it', async () => {
  await ensureStoreSetup();
  reset();

  change('bodyFatTrackingEnabled', false);
  change('heroTileLeftMetric', 'bodyFat');
  assert.notEqual(slots().left, 'bodyFat');
  assert.notEqual(slots().right, 'bodyFat');

  change('bodyFatTrackingEnabled', true);
  change('heroTileRightMetric', 'bodyFat');
  assert.equal(slots().right, 'bodyFat');
});

test('unknown keys change nothing', async () => {
  await ensureStoreSetup();
  reset();

  change('heroActionMetric', 'nonsense');
  change('heroTileLeftMetric', 42);
  assert.deepEqual(slots(), {
    pill: 'calories',
    left: 'weight',
    right: 'bodyFat',
  });
});
