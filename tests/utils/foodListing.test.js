import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ONLINE_FOOD_CATEGORIES,
  appendUniqueFoodsById,
  buildLocalCategoryOptions,
  buildLocalFoodList,
  buildLocalSubcategories,
  buildOnlineFoodList,
  buildOnlineServingOptions,
  getFilterActiveClass,
  getSortLabel,
  mergeFoodsById,
  normalizeSearchText,
  scoreLocalNameRelevance,
} from '../../src/utils/food/foodListing.js';

const food = (id, name, extra = {}) => ({
  id,
  name,
  category: 'protein',
  per100g: { calories: 100, protein: 10, carbs: 5, fats: 2 },
  ...extra,
});

const ids = (list) => list.map((item) => item.id);

test('normalizeSearchText lowercases, strips punctuation and collapses spaces', () => {
  assert.equal(
    normalizeSearchText('  Chicken,  BREAST (raw)! '),
    'chicken breast raw'
  );
  assert.equal(normalizeSearchText(null), '');
});

test('scoreLocalNameRelevance ranks exact > prefix > word > substring > brand > category', () => {
  const rank = (query, item) => scoreLocalNameRelevance(query, item);

  const exact = rank('rice', food('a', 'Rice'));
  const prefix = rank('rice', food('b', 'Rice, white'));
  const word = rank('rice', food('c', 'Wild rice mix'));
  const substring = rank('rice', food('d', 'Licorice'));
  const brand = rank('rice', food('e', 'Sticky', { brand: 'Rice Co' }));
  const category = rank('protein', food('f', 'Beef'));

  assert.ok(exact > prefix && prefix > word && word > substring);
  assert.ok(substring > brand && brand > category && category > 0);
  assert.equal(rank('rice', food('g', 'Oats')), 0);
  assert.equal(rank('', food('h', 'Rice')), 0);
});

test('mergeFoodsById lets the LATER list win and drops rows without an id', () => {
  const merged = mergeFoodsById(
    [food('a', 'Old A'), food('b', 'B'), { name: 'no id' }],
    [food('a', 'New A')],
    undefined
  );

  assert.deepEqual(ids(merged), ['a', 'b']);
  assert.equal(merged.find((item) => item.id === 'a').name, 'New A');
});

test('appendUniqueFoodsById keeps the EXISTING row when a page repeats it', () => {
  const merged = appendUniqueFoodsById(
    [food('a', 'On screen')],
    [food('a', 'Repeat'), food('b', 'Fresh')]
  );

  assert.deepEqual(ids(merged), ['a', 'b']);
  assert.equal(merged[0].name, 'On screen');
  assert.deepEqual(appendUniqueFoodsById(undefined, undefined), []);
});

test('buildLocalCategoryOptions adds Cached only when something is cached', () => {
  const base = { protein: { label: 'Proteins', color: 'red' } };

  assert.deepEqual(Object.keys(buildLocalCategoryOptions(base, false)), [
    'protein',
  ]);
  assert.deepEqual(Object.keys(buildLocalCategoryOptions(base, true)), [
    'protein',
    'cached',
  ]);
  assert.deepEqual(Object.keys(base), ['protein'], 'must not mutate the base');
});

test('buildLocalFoodList sorts by name ascending and descending', () => {
  const foods = [food('b', 'Banana'), food('a', 'Apple'), food('c', 'Cherry')];

  assert.deepEqual(ids(buildLocalFoodList({ foods })), ['a', 'b', 'c']);
  assert.deepEqual(ids(buildLocalFoodList({ foods, sortOrder: 'desc' })), [
    'c',
    'b',
    'a',
  ]);
});

test('buildLocalFoodList sorts by a macro using per100g', () => {
  const foods = [
    food('low', 'Low', { per100g: { calories: 50 } }),
    food('high', 'High', { per100g: { calories: 400 } }),
    food('mid', 'Mid', { per100g: { calories: 200 } }),
  ];

  assert.deepEqual(
    ids(buildLocalFoodList({ foods, sortBy: 'calories', sortOrder: 'asc' })),
    ['low', 'mid', 'high']
  );
  assert.deepEqual(
    ids(buildLocalFoodList({ foods, sortBy: 'calories', sortOrder: 'desc' })),
    ['high', 'mid', 'low']
  );
});

test('buildLocalFoodList ranks a typed query by relevance, ignoring sort order', () => {
  const foods = [
    food('sub', 'Licorice'),
    food('word', 'Wild rice mix'),
    food('prefix', 'Rice, white'),
    food('exact', 'Rice'),
    food('miss', 'Oats'),
  ];

  const asc = buildLocalFoodList({ foods, query: 'rice' });
  const desc = buildLocalFoodList({ foods, query: 'rice', sortOrder: 'desc' });

  assert.deepEqual(ids(asc), ['exact', 'prefix', 'word', 'sub']);
  assert.deepEqual(ids(desc), ids(asc));
});

test('buildLocalFoodList matches the query against name, brand and category', () => {
  const foods = [
    food('name', 'Oat bar'),
    food('brand', 'Crunchy', { brand: 'Oatly' }),
    food('cat', 'Beef', { category: 'oat-ish' }),
    food('none', 'Rice'),
  ];

  assert.deepEqual(ids(buildLocalFoodList({ foods, query: 'OAT' })).sort(), [
    'brand',
    'cat',
    'name',
  ]);
});

test('buildLocalFoodList filters by category and subcategory', () => {
  const foods = [
    food('a', 'A', { category: 'carbs', subcategory: 'grains' }),
    food('b', 'B', { category: 'carbs', subcategory: 'fruit' }),
    food('c', 'C', { category: 'protein', subcategory: 'grains' }),
  ];

  assert.deepEqual(ids(buildLocalFoodList({ foods, category: 'carbs' })), [
    'a',
    'b',
  ]);
  assert.deepEqual(
    ids(
      buildLocalFoodList({ foods, category: 'carbs', subcategory: 'grains' })
    ),
    ['a']
  );
});

test('buildLocalFoodList puts pinned foods first and keeps order within each group', () => {
  const foods = [
    food('a', 'Apple'),
    food('b', 'Banana'),
    food('c', 'Cherry'),
    food('d', 'Date'),
  ];

  assert.deepEqual(ids(buildLocalFoodList({ foods, pinnedIds: ['d', 'b'] })), [
    'b',
    'd',
    'a',
    'c',
  ]);
  assert.deepEqual(
    ids(buildLocalFoodList({ foods, pinnedIds: ['d'], sortOrder: 'desc' })),
    ['d', 'c', 'b', 'a']
  );
});

test('buildLocalFoodList never mutates its input and tolerates bad input', () => {
  const foods = [food('b', 'B'), food('a', 'A')];
  const copy = [...foods];

  buildLocalFoodList({ foods });

  assert.deepEqual(foods, copy);
  assert.deepEqual(buildLocalFoodList({ foods: undefined }), []);
  assert.deepEqual(buildLocalFoodList({ foods: 'nope' }), []);
});

test('buildLocalSubcategories merges the catalog list with the foods and sorts', () => {
  const foods = [
    food('a', 'A', { category: 'carbs', subcategory: 'zeta' }),
    food('b', 'B', { category: 'protein', subcategory: 'ignored' }),
    food('c', 'C', { category: 'carbs', subcategory: 'alpha' }),
    food('d', 'D', { category: 'carbs' }),
  ];

  assert.deepEqual(
    buildLocalSubcategories({
      category: 'carbs',
      foods,
      catalogSubcategories: ['mid', 'alpha'],
    }),
    ['alpha', 'mid', 'zeta']
  );
  assert.deepEqual(buildLocalSubcategories({ category: null, foods }), []);
});

test('online helpers filter by type and serving, then sort', () => {
  const foods = [
    {
      id: 'a',
      name: 'Zed',
      type: 'Brand',
      previewMacros: { servingInfo: '1 bar', calories: 200 },
    },
    {
      id: 'b',
      name: 'Alpha',
      type: 'Brand',
      previewMacros: { servingInfo: '100 g', calories: 50 },
    },
    {
      id: 'c',
      name: 'Mid',
      type: 'Generic',
      previewMacros: { servingInfo: '100 g', calories: 120 },
    },
  ];

  assert.deepEqual(ids(buildOnlineFoodList({ foods })), ['b', 'c', 'a']);
  assert.deepEqual(ids(buildOnlineFoodList({ foods, category: 'Brand' })), [
    'b',
    'a',
  ]);
  assert.deepEqual(
    ids(
      buildOnlineFoodList({ foods, category: 'Brand', subcategory: '100 g' })
    ),
    ['b']
  );
  assert.deepEqual(
    ids(buildOnlineFoodList({ foods, sortBy: 'calories', sortOrder: 'desc' })),
    ['a', 'c', 'b']
  );
  assert.deepEqual(buildOnlineServingOptions({ category: 'Brand', foods }), [
    '1 bar',
    '100 g',
  ]);
  assert.deepEqual(buildOnlineServingOptions({ category: null, foods }), []);
  assert.deepEqual(Object.keys(ONLINE_FOOD_CATEGORIES), ['Brand', 'Generic']);
});

test('label helpers', () => {
  assert.equal(getSortLabel('calories', 'desc'), 'Calories ↓');
  assert.equal(getSortLabel('name', 'asc'), 'Name ↑');
  assert.equal(
    getFilterActiveClass('red'),
    'bg-accent-red text-primary-foreground'
  );
  assert.equal(
    getFilterActiveClass('nope'),
    'bg-accent-slate text-primary-foreground'
  );
});
