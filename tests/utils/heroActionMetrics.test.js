import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_HERO_ACTION_METRIC,
  HERO_ACTION_CATEGORIES,
  HERO_ACTION_METRICS,
  HERO_ACTION_OPTIONS,
  HERO_SLOT_DEFAULTS,
  HERO_SLOT_FIELDS,
  assignHeroSlot,
  getHeroOptionGroupsForSlot,
  getHeroOptionsForSlot,
  normalizeHeroActionMetric,
  readHeroSlots,
  resolveHeroSlots,
} from '../../src/constants/appearance/heroAction.js';
import {
  HOME_LAYOUT_PAGE,
  SETTINGS_HOME_PAGE,
  getSettingsPageDepth,
  getSettingsParentPage,
  makeHomeSlotPickerPage,
  parseHomeSlotPickerPage,
} from '../../src/utils/settings/settingsNavigation.js';
import {
  buildHeroActionModel,
  getProgressPercent,
} from '../../src/utils/calculations/heroActionMetrics.js';

const fmt = (n) => Math.round(n).toLocaleString();
const TODAY = '2026-11-24';

const snapshot = (date, overrides = {}) => ({
  date,
  tdee: 2500,
  intake: 2000,
  deficit: 500,
  goalAtSnapshot: 'cut',
  goalTarget: 500,
  ...overrides,
});

const build = (metric, extra = {}) =>
  buildHeroActionModel({ metric, todayKey: TODAY, userData: {}, ...extra });

test('every option has a distinct key and a builder', () => {
  const keys = HERO_ACTION_OPTIONS.map((option) => option.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual([...keys].sort(), Object.values(HERO_ACTION_METRICS).sort());
  keys.forEach((metric) => {
    const model = build(metric);
    assert.equal(model.metric, metric, `${metric} builds its own model`);
    assert.ok(model.ariaLabel.length > 0);
    assert.ok(model.shortLabel.length > 0);
  });
});

test('the pill normalizer rejects unknown and tile-only values', () => {
  assert.equal(normalizeHeroActionMetric('steps'), 'steps');
  assert.equal(normalizeHeroActionMetric('nope'), DEFAULT_HERO_ACTION_METRIC);
  assert.equal(normalizeHeroActionMetric(null), DEFAULT_HERO_ACTION_METRIC);
  assert.equal(normalizeHeroActionMetric('weight'), DEFAULT_HERO_ACTION_METRIC);
  assert.equal(
    normalizeHeroActionMetric('bodyFat'),
    DEFAULT_HERO_ACTION_METRIC
  );
});

test('getHeroOptionsForSlot omits Weight and Body Fat from the pill only', () => {
  const pillKeys = getHeroOptionsForSlot('pill').map((option) => option.key);
  const leftKeys = getHeroOptionsForSlot('left').map((option) => option.key);
  const rightKeys = getHeroOptionsForSlot('right').map((option) => option.key);
  assert.ok(!pillKeys.includes('weight'));
  assert.ok(!pillKeys.includes('bodyFat'));
  assert.equal(pillKeys.length, HERO_ACTION_OPTIONS.length - 2);
  assert.equal(leftKeys.length, HERO_ACTION_OPTIONS.length);
  assert.equal(rightKeys.length, HERO_ACTION_OPTIONS.length);
});

test('getHeroOptionGroupsForSlot partitions every option once and filters tile-only metrics from the pill', () => {
  const categoryKeys = HERO_ACTION_CATEGORIES.flatMap((c) => c.metrics);
  assert.equal(new Set(categoryKeys).size, HERO_ACTION_OPTIONS.length);
  assert.deepEqual(
    [...categoryKeys].sort(),
    Object.values(HERO_ACTION_METRICS).sort()
  );

  const pillGroups = getHeroOptionGroupsForSlot('pill');
  const pillBody = pillGroups.find((g) => g.id === 'body');
  assert.deepEqual(
    pillBody.options.map((o) => o.key),
    ['restingHr']
  );

  const leftGroups = getHeroOptionGroupsForSlot('left');
  const leftBody = leftGroups.find((g) => g.id === 'body');
  assert.deepEqual(
    leftBody.options.map((o) => o.key),
    ['weight', 'bodyFat', 'restingHr']
  );
});

test('settingsNavigation routes Home & Tips slot pickers cleanly for back and depth', () => {
  assert.equal(makeHomeSlotPickerPage('pill'), 'homeLayout:pill');
  assert.equal(makeHomeSlotPickerPage('left'), 'homeLayout:left');
  assert.equal(makeHomeSlotPickerPage('right'), 'homeLayout:right');
  assert.equal(makeHomeSlotPickerPage('invalid'), 'homeLayout:pill');

  assert.equal(parseHomeSlotPickerPage('homeLayout:left'), 'left');
  assert.equal(parseHomeSlotPickerPage('homeLayout'), null);
  assert.equal(parseHomeSlotPickerPage('homeLayout:bogus'), null);
  assert.equal(parseHomeSlotPickerPage(null), null);

  assert.equal(getSettingsParentPage('homeLayout:right'), HOME_LAYOUT_PAGE);
  assert.equal(getSettingsParentPage(HOME_LAYOUT_PAGE), SETTINGS_HOME_PAGE);
  assert.equal(getSettingsParentPage('appearance'), SETTINGS_HOME_PAGE);
  assert.equal(getSettingsParentPage(SETTINGS_HOME_PAGE), null);

  assert.equal(getSettingsPageDepth(SETTINGS_HOME_PAGE), 0);
  assert.equal(getSettingsPageDepth(HOME_LAYOUT_PAGE), 1);
  assert.equal(getSettingsPageDepth('homeLayout:pill'), 2);
});

test('defaults keep Home as it always was: calories, Weight, Body Fat', () => {
  assert.deepEqual(resolveHeroSlots(), {
    pill: 'calories',
    left: 'weight',
    right: 'bodyFat',
  });
  assert.deepEqual(HERO_SLOT_DEFAULTS, resolveHeroSlots());
});

test('resolveHeroSlots: every slot valid, available and unique', () => {
  const all = Object.values(HERO_ACTION_METRICS);
  // Exhaustive over every pill/left/right combination, with and without
  // body fat tracking.
  [true, false].forEach((bodyFatTrackingEnabled) => {
    all.forEach((pill) => {
      all.forEach((left) => {
        all.forEach((right) => {
          const slots = resolveHeroSlots(
            { pill, left, right },
            { bodyFatTrackingEnabled }
          );
          const picked = [slots.pill, slots.left, slots.right];
          assert.equal(new Set(picked).size, 3, JSON.stringify(slots));
          picked.forEach((key) => assert.ok(all.includes(key)));
          assert.notEqual(slots.pill, 'weight');
          assert.notEqual(slots.pill, 'bodyFat');
          if (!bodyFatTrackingEnabled) {
            assert.ok(!picked.includes('bodyFat'));
          }
        });
      });
    });
  });
});

test('resolveHeroSlots: collisions and tile-only pill values settle cleanly', () => {
  // Earlier slots win: the pill keeps steps, the left tile moves to its default.
  assert.deepEqual(
    resolveHeroSlots({ pill: 'steps', left: 'steps', right: 'bodyFat' }),
    { pill: 'steps', left: 'weight', right: 'bodyFat' }
  );
  // Tile-only metrics on the pill fall back to the pill default.
  assert.deepEqual(
    resolveHeroSlots({ pill: 'weight', left: 'weight', right: 'bodyFat' }),
    { pill: 'calories', left: 'weight', right: 'bodyFat' }
  );
  assert.deepEqual(
    resolveHeroSlots({ pill: 'bodyFat', left: 'weight', right: 'bodyFat' }),
    { pill: 'calories', left: 'weight', right: 'bodyFat' }
  );
  // Corrupt keys fall back the same way.
  assert.deepEqual(resolveHeroSlots({ pill: 'nope', left: 42, right: null }), {
    pill: 'calories',
    left: 'weight',
    right: 'bodyFat',
  });
});

test('Body Fat steps aside while tracking is off, without being rewritten', () => {
  const stored = { pill: 'calories', left: 'weight', right: 'bodyFat' };
  assert.deepEqual(
    resolveHeroSlots(stored, { bodyFatTrackingEnabled: false }),
    { pill: 'calories', left: 'weight', right: 'steps' }
  );
  // Resolving never mutates what was stored, so tracking coming back restores it.
  assert.equal(stored.right, 'bodyFat');
  assert.equal(resolveHeroSlots(stored).right, 'bodyFat');
});

test('assignHeroSlot swaps allowed metrics and keeps Weight / Body Fat off the pill', () => {
  const slots = { pill: 'calories', left: 'weight', right: 'bodyFat' };

  assert.deepEqual(assignHeroSlot(slots, 'pill', 'steps'), {
    pill: 'steps',
    left: 'weight',
    right: 'bodyFat',
  });
  // Pill refuses tile-only Weight and Body Fat.
  assert.equal(assignHeroSlot(slots, 'pill', 'weight'), slots);
  assert.equal(assignHeroSlot(slots, 'pill', 'bodyFat'), slots);

  // When a tile holding a pill-allowed metric is taken by the pill, they swap.
  const withSteps = { pill: 'calories', left: 'steps', right: 'bodyFat' };
  assert.deepEqual(assignHeroSlot(withSteps, 'pill', 'steps'), {
    pill: 'steps',
    left: 'calories',
    right: 'bodyFat',
  });

  // When a tile holding Body Fat takes the pill's metric, the pill moves to a
  // free pill-allowed metric instead of inheriting Body Fat.
  assert.deepEqual(assignHeroSlot(slots, 'right', 'calories'), {
    pill: 'steps',
    left: 'weight',
    right: 'calories',
  });

  // Tiles swap freely with each other, including Weight and Body Fat.
  assert.deepEqual(assignHeroSlot(slots, 'left', 'bodyFat'), {
    pill: 'calories',
    left: 'bodyFat',
    right: 'weight',
  });

  // No-ops hand back the same object.
  assert.equal(assignHeroSlot(slots, 'pill', 'calories'), slots);
  assert.equal(assignHeroSlot(slots, 'pill', 'nope'), slots);
  assert.equal(assignHeroSlot(slots, 'nowhere', 'steps'), slots);
});

test('assignHeroSlot refuses Body Fat while tracking is off', () => {
  const slots = { pill: 'calories', left: 'weight', right: 'steps' };
  assert.equal(
    assignHeroSlot(slots, 'right', 'bodyFat', {
      bodyFatTrackingEnabled: false,
    }),
    slots
  );
});

test('readHeroSlots reads the stored fields and settles them', () => {
  const userData = {
    [HERO_SLOT_FIELDS.pill]: 'steps',
    [HERO_SLOT_FIELDS.left]: 'steps',
    [HERO_SLOT_FIELDS.right]: 'protein',
  };
  assert.deepEqual(readHeroSlots(userData), {
    pill: 'steps',
    left: 'weight',
    right: 'protein',
  });
  // A profile from before the feature has none of the fields: the defaults.
  assert.deepEqual(readHeroSlots({}), HERO_SLOT_DEFAULTS);
});

test('weight and body fat are plain readings with their staleness note', () => {
  const weight = build('weight', {
    weight: {
      display: '74',
      dateLabel: 'Tue, Nov 24, 2026',
      warning: '5d old',
    },
  });
  assert.equal(weight.value, '74');
  assert.equal(weight.unit, 'kg');
  assert.equal(weight.primary, '74 kg');
  assert.equal(weight.caption, 'Tue, Nov 24, 2026');
  assert.equal(weight.warning, '5d old');
  assert.equal(weight.progress, null);
  assert.equal(weight.shortLabel, 'Weight');

  const bodyFat = build('bodyFat', {
    bodyFat: { display: '21', dateLabel: 'Wed, Nov 25, 2026', warning: null },
  });
  assert.equal(bodyFat.primary, '21%');
  assert.equal(bodyFat.shortLabel, 'Body Fat %');
  assert.equal(bodyFat.warning, null);

  const empty = build('weight');
  assert.equal(empty.primary, '—');
  assert.equal(empty.caption, 'No entries yet');
});

test('getProgressPercent clamps and never divides by a bad goal', () => {
  assert.equal(getProgressPercent(0, 2000), 0);
  assert.equal(getProgressPercent(50, 200), 25);
  assert.equal(getProgressPercent(400, 200), 100);
  assert.equal(getProgressPercent(-10, 200), 0);
  assert.equal(getProgressPercent(100, 0), 0);
  assert.equal(getProgressPercent(100, null), 0);
  assert.equal(getProgressPercent(NaN, 200), 0);
});

test('calories: readout, progress and a missing goal', () => {
  const model = build('calories', { consumed: 1272, calorieTarget: 2545 });
  assert.equal(model.value, `${fmt(1272)} / ${fmt(2545)}`);
  assert.equal(model.unit, 'kcal');
  assert.equal(model.progress, (1272 / 2545) * 100);
  assert.equal(model.primary, fmt(1272));
  assert.equal(model.caption, `of ${fmt(2545)} kcal`);

  const noGoal = build('calories', { consumed: 800 });
  assert.equal(noGoal.value, `${fmt(800)} / —`);
  assert.equal(noGoal.progress, 0);
});

test('calories left: remaining, then over', () => {
  const under = build('caloriesLeft', { consumed: 447, calorieTarget: 2583 });
  assert.equal(under.primary, fmt(2136));
  assert.equal(under.unit, 'kcal left');

  const over = build('caloriesLeft', { consumed: 2900, calorieTarget: 2583 });
  assert.equal(over.primary, fmt(317));
  assert.equal(over.unit, 'kcal over');
  assert.equal(over.progress, 100);

  const noGoal = build('caloriesLeft', { consumed: 500 });
  assert.equal(noGoal.primary, '—');
});

test('protein: target comes from the macro engine, never zero-divided', () => {
  const userData = { weight: 80, height: 180, age: 30, gender: 'male' };
  const model = build('protein', {
    userData,
    proteinGrams: 80,
    calorieTarget: 2500,
  });
  assert.match(model.value, /^80 \/ \d/);
  assert.equal(model.unit, 'g');
  assert.ok(model.progress > 0 && model.progress <= 100);

  const noTarget = build('protein', { userData, proteinGrams: 80 });
  assert.equal(noTarget.value, '80 / —');
  assert.equal(noTarget.progress, 0);
});

test('steps: progress against the step goal', () => {
  const model = build('steps', { steps: 6420, stepGoal: 10000 });
  assert.equal(model.value, `${fmt(6420)} / ${fmt(10000)}`);
  assert.equal(model.unit, 'steps');
  assert.equal(model.progress, 64.2);
  assert.equal(build('steps', { steps: 100 }).progress, 0);
});

test('today’s balance: no verdict until something is eaten', () => {
  const none = build('deficit', {
    tdee: 2500,
    consumed: 0,
    goalDailyBalanceTarget: 500,
  });
  assert.equal(none.primary, '—');
  assert.equal(none.progress, null);
});

test('today’s balance: deficit toward a cut, surplus toward a bulk', () => {
  const cut = build('deficit', {
    tdee: 2500,
    consumed: 2188,
    goalDailyBalanceTarget: 500,
  });
  assert.equal(cut.primary, fmt(312));
  assert.equal(cut.unit, 'kcal deficit');
  assert.equal(cut.value, `${fmt(312)} / ${fmt(500)}`);
  assert.equal(cut.progress, (312 / 500) * 100);

  const bulk = build('deficit', {
    tdee: 2500,
    consumed: 2620,
    goalDailyBalanceTarget: -300,
  });
  assert.equal(bulk.unit, 'kcal surplus');
  assert.equal(bulk.primary, fmt(120));
  assert.equal(bulk.progress, (120 / 300) * 100);
});

test('today’s balance: moving against the goal is 0 %, maintenance has no ring', () => {
  const wrongWay = build('deficit', {
    tdee: 2500,
    consumed: 2700,
    goalDailyBalanceTarget: 500,
  });
  assert.equal(wrongWay.unit, 'kcal surplus');
  assert.equal(wrongWay.progress, 0);

  const maintenance = build('deficit', {
    tdee: 2500,
    consumed: 2300,
    goalDailyBalanceTarget: 0,
  });
  assert.equal(maintenance.progress, null);
  assert.equal(maintenance.primary, fmt(200));
});

test('7-day balance totals the window; no data reads a dash', () => {
  const snapshots = {};
  ['2026-11-18', '2026-11-19', '2026-11-20'].forEach((date) => {
    snapshots[date] = snapshot(date);
  });
  const model = build('balance7d', {
    userData: { dailySnapshots: snapshots },
    goalDailyBalanceTarget: 500,
  });
  assert.equal(model.primary, fmt(1500));
  assert.equal(model.unit, 'kcal deficit');
  assert.equal(model.progress, null);

  const empty = build('balance7d', { userData: { dailySnapshots: {} } });
  assert.equal(empty.primary, '—');
});

test('phase: day x of y, open-ended, not started, none', () => {
  const ranged = build('phase', {
    activePhase: { startDate: '2026-11-07', endDate: '2026-12-18' },
  });
  assert.equal(ranged.primary, 'Day 18');
  assert.equal(ranged.value, 'Day 18 / 42');
  assert.equal(ranged.caption, 'of 42 days');
  assert.equal(ranged.progress, (18 / 42) * 100);

  const open = build('phase', {
    activePhase: { startDate: '2026-11-07', endDate: null },
  });
  assert.equal(open.value, 'Day 18');
  assert.equal(open.progress, null);

  const finished = build('phase', {
    activePhase: { startDate: '2026-10-01', endDate: '2026-10-10' },
  });
  assert.equal(finished.value, 'Day 10 / 10');
  assert.equal(finished.progress, 100);

  const future = build('phase', {
    activePhase: { startDate: '2026-12-01', endDate: null },
  });
  assert.equal(future.primary, 'Not started');

  assert.equal(build('phase').primary, 'No phase');
});

test('streak: counts consecutive on-target days ending yesterday', () => {
  const snapshots = {
    '2026-11-21': snapshot('2026-11-21'),
    '2026-11-22': snapshot('2026-11-22'),
    '2026-11-23': snapshot('2026-11-23'),
  };
  const model = build('streak', {
    userData: {
      dailySnapshots: snapshots,
      selectedGoal: 'cut',
      onTargetToleranceKcal: 100,
    },
  });
  assert.equal(model.primary, '3');
  assert.equal(model.unit, 'day streak');

  const none = build('streak', { userData: { dailySnapshots: {} } });
  assert.equal(none.primary, '0');
});

test('resting HR and exercise burn are plain readouts', () => {
  const hr = build('restingHr', { restingHr: 61 });
  assert.equal(hr.primary, '61');
  assert.equal(hr.unit, 'bpm');
  assert.equal(hr.progress, null);
  assert.equal(build('restingHr').primary, '—');

  const burn = build('burn', { exerciseBurn: 340.4 });
  assert.equal(burn.primary, '340');
  assert.equal(burn.unit, 'kcal burned');
  assert.equal(burn.progress, null);
  assert.equal(build('burn').primary, '0');
});
