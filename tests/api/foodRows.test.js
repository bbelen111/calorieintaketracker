import test from 'node:test';
import assert from 'node:assert/strict';

import { toCatalogPayloadRows, toLegacyFdcRows } from '../../api/foodRows.js';

test('toCatalogPayloadRows whitelists catalog keys and parses portions', () => {
  const rows = toCatalogPayloadRows([
    {
      id: 'usda_171077',
      name: 'Chicken breast, raw',
      brand: null,
      category: 'protein',
      subcategory: 'poultry',
      calories: 120,
      protein: 22.5,
      carbs: 0,
      fats: 2.62,
      fiber: 0,
      sodium: 45,
      saturated_fats: 0.56,
      sugars: 0,
      portions:
        '[{"id":"p_100g","label":"100g","grams":100},{"id":"portion_1","label":"1 serving (113g)","grams":113}]',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ]);

  assert.equal(rows.length, 1);
  const [row] = rows;
  assert.equal(row.id, 'usda_171077');
  assert.equal(row.name, 'Chicken breast, raw');
  assert.equal(row.brand, null);
  assert.equal(row.category, 'protein');
  assert.equal(row.subcategory, 'poultry');
  assert.equal(row.calories, 120);
  assert.equal(row.created_at, undefined); // whitelisted out
  assert.equal(row.updated_at, undefined);
  assert.deepEqual(row.portions, [
    { id: 'p_100g', label: '100g', grams: 100 },
    { id: 'portion_1', label: '1 serving (113g)', grams: 113 },
  ]);
});

test('toCatalogPayloadRows preserves NULL micro semantics and missing portions', () => {
  const [row] = toCatalogPayloadRows([
    { id: 'cloud_x', name: 'x', fiber: null, sodium: null },
  ]);
  assert.equal(row.fiber, null);
  assert.equal(row.sodium, null);
  assert.equal(row.portions, null); // absent portions stay null (client maps to [])
});

test('toLegacyFdcRows emits an FDC envelope the legacy mapper can parse', () => {
  const [legacy] = toLegacyFdcRows([
    {
      id: 'usda_171077',
      name: 'Chicken breast, raw',
      brand: null,
      category: 'protein',
      subcategory: 'poultry',
      calories: 120,
      protein: 22.5,
      carbs: 0,
      fats: 2.62,
      fiber: 0,
      sodium: 45,
      saturated_fats: 0.56,
      sugars: 0,
    },
  ]);

  assert.equal(legacy.fdcId, '171077');
  assert.equal(legacy.description, 'Chicken breast, raw');
  assert.equal(legacy.dataType, 'Generic');
  assert.equal(legacy.brandOwner, null);
  assert.equal(legacy.servingSize, 100);
  assert.equal(legacy.servingSizeUnit, 'g');
  assert.equal(legacy.foodNutrients.length, 8);

  const energy = legacy.foodNutrients.find((n) => n.nutrientId === 1008);
  assert.equal(energy.nutrientNumber, '208');
  assert.equal(energy.unitName, 'KCAL');
  assert.equal(energy.value, 120);

  const sodium = legacy.foodNutrients.find((n) => n.nutrientNumber === '307');
  assert.equal(sodium.unitName, 'MG');
  assert.equal(sodium.value, 45);
});

test('toLegacyFdcRows marks branded rows Branded and omits NULL micros', () => {
  const [legacy] = toLegacyFdcRows([
    {
      id: 'usda_999',
      name: 'Hershey Bar',
      brand: 'Hershey',
      calories: 530,
      protein: 7.7,
      carbs: 60,
      fats: 29,
      fiber: null,
      sodium: null,
      saturated_fats: null,
      sugars: null,
    },
  ]);

  assert.equal(legacy.dataType, 'Branded');
  assert.equal(legacy.brandOwner, 'Hershey');
  assert.deepEqual(
    legacy.foodNutrients.map((n) => n.nutrientId),
    [1008, 1003, 1005, 1004]
  );
});

test('toLegacyFdcRows keeps non-numeric ids for curated rows', () => {
  const [legacy] = toLegacyFdcRows([
    {
      id: 'curated_rice_jasmine_raw',
      name: 'Rice, jasmine, raw',
      calories: 356,
    },
  ]);

  assert.equal(legacy.fdcId, 'curated_rice_jasmine_raw');
  assert.equal(legacy.foodNutrients.length, 1);
});
