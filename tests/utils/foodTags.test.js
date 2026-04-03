import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FOOD_SOURCE_TYPES,
  getFoodSourceBadgeMeta,
  resolveFoodSourceType,
} from '../../src/utils/foodTags.js';
import { formatFoodDisplayName } from '../../src/utils/foodPresentation.js';

test('resolveFoodSourceType maps cached sources consistently', () => {
  assert.equal(
    resolveFoodSourceType({ source: 'fatsecret' }),
    FOOD_SOURCE_TYPES.CACHED
  );

  assert.equal(
    resolveFoodSourceType({ source: 'openfoodfacts' }),
    FOOD_SOURCE_TYPES.CACHED
  );

  assert.equal(
    resolveFoodSourceType({ id: 'fs_123' }),
    FOOD_SOURCE_TYPES.CACHED
  );
  assert.equal(
    resolveFoodSourceType({ id: 'off_789' }),
    FOOD_SOURCE_TYPES.CACHED
  );
  assert.equal(
    resolveFoodSourceType({ category: 'cached' }),
    FOOD_SOURCE_TYPES.CACHED
  );
});

test('resolveFoodSourceType distinguishes manual and custom paths', () => {
  assert.equal(
    resolveFoodSourceType({ source: 'manual' }),
    FOOD_SOURCE_TYPES.MANUAL
  );
  assert.equal(
    resolveFoodSourceType({ category: 'manual' }),
    FOOD_SOURCE_TYPES.MANUAL
  );

  assert.equal(
    resolveFoodSourceType({ source: 'user' }),
    FOOD_SOURCE_TYPES.CUSTOM
  );
  assert.equal(
    resolveFoodSourceType({ source: 'custom' }),
    FOOD_SOURCE_TYPES.CUSTOM
  );
  assert.equal(
    resolveFoodSourceType({ isCustom: true }),
    FOOD_SOURCE_TYPES.CUSTOM
  );
});

test('resolveFoodSourceType falls back to local for unclassified foods', () => {
  assert.equal(
    resolveFoodSourceType({ source: 'local' }),
    FOOD_SOURCE_TYPES.LOCAL
  );
  assert.equal(resolveFoodSourceType({}), FOOD_SOURCE_TYPES.LOCAL);
});

test('getFoodSourceBadgeMeta returns coherent label and color', () => {
  const meta = getFoodSourceBadgeMeta({ source: 'manual' });
  assert.equal(meta.sourceType, FOOD_SOURCE_TYPES.MANUAL);
  assert.equal(meta.label, 'Manual');
  assert.equal(meta.color, 'indigo');
});

test('formatFoodDisplayName composes brand prefix with dash', () => {
  assert.equal(
    formatFoodDisplayName({ name: 'Corn Flakes', brand: "Kellogg's" }),
    "Kellogg's - Corn Flakes"
  );
});

test('formatFoodDisplayName avoids duplicate brand prefixing', () => {
  assert.equal(
    formatFoodDisplayName({
      name: "Kellogg's - Corn Flakes",
      brand: "Kellogg's",
    }),
    "Kellogg's - Corn Flakes"
  );

  assert.equal(
    formatFoodDisplayName({ name: 'MyProtein Oats', brand: 'MyProtein' }),
    'MyProtein Oats'
  );
});

test('formatFoodDisplayName handles missing pieces gracefully', () => {
  assert.equal(formatFoodDisplayName({ name: 'Apple', brand: '' }), 'Apple');
  assert.equal(formatFoodDisplayName({ name: '', brand: 'Brand' }), 'Brand');
  assert.equal(formatFoodDisplayName({ name: '', brand: '' }), '');
});
