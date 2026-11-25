import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createDefaultNotificationSettings,
  normalizeNotificationSettings,
} from '../../src/constants/notifications/notificationConfig.js';
import { DEFAULT_UNIT_PREFERENCES } from '../../src/constants/units/units.js';
import { buildNotificationPlan } from '../../src/utils/notifications/notificationPlanner.js';
import { searchBarcode } from '../../src/services/openFoodFacts.js';

const NOW = new Date(2026, 2, 10, 12, 0, 0);

const plan = (unitPreferences) => {
  const base = createDefaultNotificationSettings();
  return buildNotificationPlan({
    userData: {
      unitPreferences,
      notifications: normalizeNotificationSettings({
        ...base,
        enabled: true,
        rules: {
          ...base.rules,
          eveningLedger: { enabled: true, time: '21:00' },
        },
      }),
      nutritionData: {
        '2026-03-10': { lunch: [{ id: 1, calories: 500 }] },
      },
    },
    derivedState: { goalCalories: 2000 },
    now: NOW,
  });
};

const eveningBody = (unitPreferences) =>
  plan(unitPreferences).scheduled.find(
    (item) =>
      item.title === 'Evening ledger close-out' && item.body.includes('logged')
  )?.body;

test('the evening reminder writes energy in the chosen unit', () => {
  assert.match(
    eveningBody(undefined),
    /1 meal logged \(500 kcal\) · 1,500 kcal remaining vs target\./
  );
  assert.match(
    eveningBody({ ...DEFAULT_UNIT_PREFERENCES, energy: 'kJ' }),
    /1 meal logged \(2,092 kJ\) · 6,276 kJ remaining vs target\./
  );
});

const withProduct = async (nutriments, run) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      status: 1,
      product: { code: '1234567890123', product_name: 'Bar', nutriments },
    }),
  });
  try {
    run(await searchBarcode('1234567890123'));
  } finally {
    globalThis.fetch = originalFetch;
  }
};

test('a barcode product that only declares kilojoules still has energy', async () => {
  await withProduct({ 'energy-kj_100g': 846 }, (food) => {
    assert.equal(food.per100g.calories, 202.2);
  });
  await withProduct({ energy_100g: 418.4 }, (food) => {
    assert.equal(food.per100g.calories, 100);
  });
});

test('the declared kcal value wins, including a real zero', async () => {
  await withProduct(
    { 'energy-kcal_100g': 0, 'energy-kj_100g': 846 },
    (food) => {
      assert.equal(food.per100g.calories, 0);
    }
  );
  await withProduct({}, (food) => {
    assert.equal(food.per100g.calories, 0);
  });
});
