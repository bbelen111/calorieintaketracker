import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_UNIT_PREFERENCES,
  applyUnitPreset,
  areUnitPreferencesEqual,
  matchUnitPreset,
  normalizeUnitPreferences,
} from '../../src/constants/units/units.js';
import {
  METRIC_UNITS,
  createUnitFormatter,
  kgToStoneParts,
  roundTo,
} from '../../src/utils/units/unitFormatter.js';
import { formatOne } from '../../src/utils/formatting/format.js';
import {
  clampWeight,
  formatSignedDelta,
  formatWeight,
  getPreviousEntryDelta,
  groupWeightEntriesByMonth,
} from '../../src/utils/measurements/weight.js';
import { sanitizeHeight } from '../../src/utils/measurements/profile.js';

const units = (overrides) =>
  createUnitFormatter({ ...DEFAULT_UNIT_PREFERENCES, ...overrides });

const range = (from, to, step) => {
  const values = [];
  for (let i = Math.round(from / step); i <= Math.round(to / step); i += 1) {
    values.push(roundTo(i * step, 2));
  }
  return values;
};

test('unit preferences fall back per key and accept any casing', () => {
  assert.deepEqual(
    normalizeUnitPreferences(undefined),
    DEFAULT_UNIT_PREFERENCES
  );
  assert.deepEqual(
    normalizeUnitPreferences({
      bodyWeight: 'LB',
      height: 'furlong',
      energy: 'kj',
    }),
    { ...DEFAULT_UNIT_PREFERENCES, bodyWeight: 'lb', energy: 'kJ' }
  );
  assert.equal(areUnitPreferencesEqual({}, DEFAULT_UNIT_PREFERENCES), true);
});

test('presets set the four body and food units and leave energy alone', () => {
  const custom = { ...DEFAULT_UNIT_PREFERENCES, energy: 'kJ' };
  const uk = applyUnitPreset(custom, 'uk');

  assert.deepEqual(uk, {
    bodyWeight: 'st',
    height: 'ft',
    distance: 'mi',
    foodWeight: 'g',
    energy: 'kJ',
  });
  assert.equal(matchUnitPreset(uk), 'uk');
  assert.equal(matchUnitPreset(custom), 'metric');
  assert.equal(matchUnitPreset({ ...uk, distance: 'km' }), null);
});

test('formatters are cached by preference object', () => {
  const preferences = { ...DEFAULT_UNIT_PREFERENCES, bodyWeight: 'lb' };
  assert.equal(
    createUnitFormatter(preferences),
    createUnitFormatter(preferences)
  );
  assert.equal(createUnitFormatter(undefined), METRIC_UNITS);
});

test('metric output matches the formatting used before units existed', () => {
  for (const kg of range(30, 210, 0.1)) {
    assert.equal(METRIC_UNITS.bodyWeight.format(kg), `${formatWeight(kg)} kg`);
  }
  assert.equal(
    METRIC_UNITS.bodyWeight.format(74.5, { space: false }),
    '74.5kg'
  );
  assert.equal(METRIC_UNITS.bodyWeight.format(74, { fixed: 1 }), '74.0 kg');
  for (const delta of [-2, -0.4, 0, 0.05, 1.25, 12]) {
    assert.equal(
      METRIC_UNITS.bodyWeight.formatDelta(delta),
      formatSignedDelta(delta, 'kg')
    );
  }
  assert.equal(METRIC_UNITS.bodyWeight.formatRate(0.254), '+0.25 kg/wk');
  assert.equal(METRIC_UNITS.bodyWeight.formatRate(-0.5), '-0.50 kg/wk');
  assert.equal(METRIC_UNITS.bodyWeight.formatRate(0), '0.0 kg/wk');
  assert.equal(METRIC_UNITS.height.format(168), '168 cm');
  assert.equal(METRIC_UNITS.distance.format(5.23), '5.2 km');
  for (const grams of [0, 1, 12.5, 174, 174.96, 1000]) {
    assert.equal(METRIC_UNITS.food.value(grams), formatOne(grams));
  }
  assert.equal(METRIC_UNITS.energy.format(2100), '2,100 kcal');
  assert.equal(
    METRIC_UNITS.energy.format(1200, { grouping: false }),
    '1200 kcal'
  );
  assert.equal(METRIC_UNITS.energy.value(350, { signed: true }), '+350');
  assert.equal(METRIC_UNITS.energy.compact(123.45), formatOne(123.45));
});

test('formatters never clamp and show a dash for missing values', () => {
  const lb = units({ bodyWeight: 'lb' });
  assert.equal(lb.bodyWeight.formatDelta(-2), '-4.4 lb');
  assert.equal(lb.bodyWeight.format(null), '—');
  assert.equal(lb.bodyWeight.formatDelta(undefined), '');
  assert.equal(METRIC_UNITS.energy.format(Number.NaN), '—');
});

test('every 0.1 lb entry survives storage and reads back unchanged', () => {
  const { bodyWeight } = units({ bodyWeight: 'lb' });
  const { min, max } = bodyWeight.pickerRange;
  assert.equal(min, 66.1);
  assert.equal(max, 463);

  for (const pounds of range(min, max, 0.1)) {
    const stored = clampWeight(bodyWeight.fromPicker(pounds));
    // The top of the wheel lands on the 210 kg limit.
    const expected = pounds === max ? bodyWeight.toPicker(210) : pounds;
    assert.equal(bodyWeight.toPicker(stored), expected, `${pounds} lb`);
  }
});

test('every half pound in stone mode survives storage', () => {
  const { bodyWeight } = units({ bodyWeight: 'st' });
  const { min, max } = bodyWeight.pickerRange;

  for (const pounds of range(min + 0.5, max - 0.5, 0.5)) {
    const stored = clampWeight(bodyWeight.fromPicker(pounds));
    assert.equal(bodyWeight.toPicker(stored), pounds, `${pounds} lb`);
  }
});

test('stone display carries into the next stone and reads changes in lb', () => {
  const { bodyWeight } = units({ bodyWeight: 'st' });
  // 167.96 lb rounds to 168.0 lb = 12 st exactly.
  assert.deepEqual(kgToStoneParts(167.96 * 0.45359237), {
    stone: 12,
    pounds: 0,
  });
  assert.equal(bodyWeight.format(74.5), '11 st 10.2 lb');
  assert.equal(bodyWeight.formatDelta(-1), '-2.2 lb');
  assert.equal(bodyWeight.formatRate(0.5), '+1.10 lb/wk');
  assert.equal(bodyWeight.formatTick(74.5), '11st 10');
});

test('opening a weight and saving it unchanged keeps the stored value', () => {
  for (const unit of ['kg', 'lb', 'st']) {
    const { bodyWeight } = units({ bodyWeight: unit });
    // 81.65 kg was entered in pounds; no picker shows all its decimals.
    const shown = bodyWeight.toPicker(81.65);
    assert.equal(bodyWeight.fromPicker(shown, 81.65), 81.65, unit);
    assert.notEqual(
      bodyWeight.fromPicker(shown + bodyWeight.pickerStep, 81.65),
      81.65,
      unit
    );
  }
});

test('whole inches round-trip through integer centimetres', () => {
  const { height } = units({ height: 'ft' });
  const { min, max } = height.inchRange;
  assert.equal(min, 47);
  assert.equal(max, 87);

  for (let inches = min; inches <= max; inches += 1) {
    const cm = sanitizeHeight(
      height.fromParts(Math.floor(inches / 12), inches % 12)
    );
    const parts = height.toParts(cm);
    assert.equal(parts.feet * 12 + parts.inches, inches, `${inches} in`);
  }
  assert.equal(height.format(168), '5′6″');
  // 182 cm shows 6′0″, which would convert to 183 cm: keep 182.
  assert.equal(height.fromParts(6, 0, 182), 182);
});

test('distance converts to miles', () => {
  const { distance } = units({ distance: 'mi' });
  assert.equal(distance.format(5.2), '3.2 mi');
});

test('every 0.1 oz food weight round-trips, and untouched grams stay', () => {
  const { food } = units({ foodWeight: 'oz' });
  for (const ounces of range(0.1, 35.2, 0.1)) {
    const grams = food.fromPicker(ounces);
    assert.equal(food.toPicker(grams), ounces, `${ounces} oz`);
  }
  assert.equal(food.toPicker(100), 3.5);
  assert.equal(food.fromPicker(3.5, 100), 100);
  assert.equal(food.format(170.1), '6 oz');
  assert.equal(food.basisLabel, 'per oz');
  assert.ok(Math.abs(food.perBasis(100) - 28.349523125) < 1e-9);
  assert.equal(food.formatPortionLabel('100g'), '3.5 oz');
  assert.equal(food.formatPortionLabel('1 cup'), '1 cup');
  assert.equal(METRIC_UNITS.food.formatPortionLabel('100g'), '100g');
});

test('every whole kJ round-trips through stored kcal', () => {
  const { energy } = units({ energy: 'kJ' });
  for (let kj = 0; kj <= 20920; kj += 1) {
    const kcal = energy.fromPicker(kj);
    assert.equal(energy.toPicker(kcal), kj, `${kj} kJ`);
  }
  assert.equal(energy.format(2100), '8,786 kJ');
  assert.equal(energy.noun, 'Energy');
  // An untouched kcal value is not re-derived from its rounded kJ.
  assert.equal(energy.fromPicker(energy.toPicker(250), 250), 250);
});

test('stored weights keep two decimals while kg displays keep one', () => {
  assert.equal(clampWeight(81.6466), 81.65);
  assert.equal(formatWeight(81.65), '81.7');
  assert.equal(formatWeight(80.001), '80');
});

test('weight deltas keep the requested precision', () => {
  const entries = [
    { date: '2026-01-01', weight: 81.64 },
    { date: '2026-01-02', weight: 81.6 },
  ];
  assert.equal(
    getPreviousEntryDelta(entries, '2026-01-02', 'weight').delta,
    -0
  );
  assert.equal(
    getPreviousEntryDelta(entries, '2026-01-02', 'weight', 2).delta,
    -0.04
  );
  assert.equal(groupWeightEntriesByMonth(entries, 2)[0].avg, 81.62);
});
