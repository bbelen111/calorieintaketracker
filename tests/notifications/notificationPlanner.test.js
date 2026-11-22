import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_PENDING_LOCAL_NOTIFICATIONS,
  NOTIFICATION_CHANNEL_IDS,
  NOTIFICATION_ID_RANGES,
  NOTIFICATION_ROUTES,
  createDefaultNotificationSettings,
  normalizeNotificationSettings,
} from '../../src/constants/notifications/notificationConfig.js';
import {
  applyQuietHours,
  buildLiveHrGuardNotifications,
  buildNotificationPlan,
  findUnimportedHealthWorkouts,
  isWithinQuietHours,
} from '../../src/utils/notifications/notificationPlanner.js';

const buildSettings = (overrides = {}) => {
  const base = createDefaultNotificationSettings();
  return normalizeNotificationSettings({
    ...base,
    enabled: true,
    ...overrides,
    quietHours: {
      ...base.quietHours,
      ...(overrides.quietHours ?? {}),
    },
    rules: {
      ...base.rules,
      ...(overrides.rules ?? {}),
      meals: {
        ...base.rules.meals,
        ...(overrides.rules?.meals ?? {}),
      },
    },
    remotePush: {
      ...base.remotePush,
      ...(overrides.remotePush ?? {}),
    },
    meta: {
      ...base.meta,
      ...(overrides.meta ?? {}),
    },
  });
};

test('normalizeNotificationSettings returns safe defaults and sanitizes invalid values', () => {
  const fromNull = normalizeNotificationSettings(null);
  assert.equal(fromNull.enabled, false);
  assert.equal(fromNull.quietHours.start, '22:30');
  assert.equal(fromNull.rules.morningWeighIn.time, '07:30');
  assert.equal(fromNull.rules.staleWeighIn.thresholdDays, 4);

  const sanitized = normalizeNotificationSettings({
    enabled: 1,
    quietHours: { enabled: true, start: '99:99', end: '6:15' },
    rules: {
      morningWeighIn: { enabled: true, time: '7:05', skipIfLogged: false },
      bodyFatCheckIn: { enabled: true, dayOfWeek: 99, time: 'bad' },
      dailyNeatCheckIn: { enabled: true, daysMode: 'mars', time: '18:00' },
      staleWeighIn: { enabled: true, thresholdDays: 999 },
    },
  });

  assert.equal(sanitized.enabled, true);
  assert.equal(sanitized.quietHours.start, '22:30');
  assert.equal(sanitized.quietHours.end, '06:15');
  assert.equal(sanitized.rules.morningWeighIn.time, '07:05');
  assert.equal(sanitized.rules.morningWeighIn.skipIfLogged, false);
  assert.equal(sanitized.rules.bodyFatCheckIn.dayOfWeek, 0);
  assert.equal(sanitized.rules.bodyFatCheckIn.time, '08:00');
  assert.equal(sanitized.rules.dailyNeatCheckIn.daysMode, 'weekends');
  assert.equal(sanitized.rules.staleWeighIn.thresholdDays, 4);
});

test('quiet hours detection and shifting handles overnight and daytime ranges', () => {
  const overnight = { enabled: true, start: '22:30', end: '07:00' };
  assert.equal(isWithinQuietHours(23 * 60, overnight), true);
  assert.equal(isWithinQuietHours(2 * 60, overnight), true);
  assert.equal(isWithinQuietHours(7 * 60, overnight), false);
  assert.equal(isWithinQuietHours(15 * 60, overnight), false);

  const lateNight = new Date(2026, 4, 10, 23, 15, 0, 0);
  const shiftedLate = applyQuietHours(lateNight, overnight);
  assert.equal(shiftedLate.getDate(), 11);
  assert.equal(shiftedLate.getHours(), 7);
  assert.equal(shiftedLate.getMinutes(), 0);

  const earlyMorning = new Date(2026, 4, 11, 5, 30, 0, 0);
  const shiftedEarly = applyQuietHours(earlyMorning, overnight);
  assert.equal(shiftedEarly.getDate(), 11);
  assert.equal(shiftedEarly.getHours(), 7);
  assert.equal(shiftedEarly.getMinutes(), 0);

  const disabled = { enabled: false, start: '22:30', end: '07:00' };
  assert.equal(applyQuietHours(lateNight, disabled).getHours(), 23);
});

test('returns empty plan when notifications master toggle is disabled', () => {
  const plan = buildNotificationPlan({
    userData: { notifications: { enabled: false } },
    now: new Date(2026, 4, 10, 6, 0, 0, 0),
  });
  assert.deepEqual(plan.scheduled, []);
  assert.deepEqual(plan.immediateEvents, []);
});

test('smart-skips today morning weigh-in and logged meal slots while keeping future days', () => {
  const now = new Date(2026, 4, 10, 6, 0, 0, 0); // Sun 2026-05-10 06:00
  const plan = buildNotificationPlan({
    now,
    horizonDays: 3,
    userData: {
      weightEntries: [{ date: '2026-05-10', weight: 75 }],
      nutritionData: {
        '2026-05-10': {
          lunch: [{ id: '1', name: 'Chicken', calories: 500 }],
          dinner: [],
        },
      },
      notifications: buildSettings({
        rules: {
          morningWeighIn: { enabled: true, time: '07:30', skipIfLogged: true },
          meals: {
            breakfast: { enabled: false, time: '09:00', skipIfLogged: true },
            lunch: { enabled: true, time: '13:30', skipIfLogged: true },
            dinner: { enabled: true, time: '19:30', skipIfLogged: true },
          },
          eveningLedger: { enabled: false },
          weeklyDigest: { enabled: false },
          stepCheckIn: { enabled: false },
          phaseMilestones: { enabled: false },
          staleWeighIn: { enabled: false },
          atUnlockAlert: { enabled: false },
        },
      }),
    },
  });

  const weighIns = plan.scheduled.filter(
    (item) => item.extra.route === NOTIFICATION_ROUTES.OPEN_WEIGHT_ENTRY
  );
  assert.equal(weighIns.length, 2); // skipped May 10, kept May 11 & 12
  assert.equal(weighIns[0].extra.dateKey, '2026-05-11');

  const lunches = plan.scheduled.filter(
    (item) =>
      item.extra.route === NOTIFICATION_ROUTES.OPEN_FOOD_SEARCH &&
      item.extra.mealType === 'lunch'
  );
  assert.equal(lunches.length, 2); // skipped May 10
  assert.equal(lunches[0].extra.dateKey, '2026-05-11');

  const dinners = plan.scheduled.filter(
    (item) =>
      item.extra.route === NOTIFICATION_ROUTES.OPEN_FOOD_SEARCH &&
      item.extra.mealType === 'dinner'
  );
  assert.equal(dinners.length, 3); // May 10 not logged -> included
  assert.equal(dinners[0].extra.dateKey, '2026-05-10');
});

test('evening ledger copy includes logged meals and remaining calorie gap for today', () => {
  const now = new Date(2026, 4, 10, 14, 0, 0, 0);
  const plan = buildNotificationPlan({
    now,
    horizonDays: 2,
    derivedState: { goalCalories: 2400 },
    userData: {
      nutritionData: {
        '2026-05-10': {
          breakfast: [{ id: 'a', calories: 600 }],
          lunch: [{ id: 'b', calories: 800 }],
        },
      },
      notifications: buildSettings({
        rules: {
          morningWeighIn: { enabled: false },
          meals: {
            breakfast: { enabled: false },
            lunch: { enabled: false },
            dinner: { enabled: false },
          },
          eveningLedger: { enabled: true, time: '21:00' },
          weeklyDigest: { enabled: false },
          stepCheckIn: { enabled: false },
          phaseMilestones: { enabled: false },
          staleWeighIn: { enabled: false },
          atUnlockAlert: { enabled: false },
        },
      }),
    },
  });

  const todayLedger = plan.scheduled.find(
    (item) => item.id === NOTIFICATION_ID_RANGES.EVENING_LEDGER
  );
  assert.ok(todayLedger);
  assert.match(todayLedger.body, /2 meals logged \(1,400 kcal\)/);
  assert.match(todayLedger.body, /1,000 kcal remaining vs target/);
});

test('body fat check-in respects bodyFatTrackingEnabled and daily NEAT respects weekends & today override', () => {
  const now = new Date(2026, 4, 10, 6, 0, 0, 0); // Sunday 2026-05-10
  const plan = buildNotificationPlan({
    now,
    horizonDays: 7,
    userData: {
      bodyFatTrackingEnabled: true,
      dailyNeatOverrides: {
        '2026-05-10': { multiplier: 0.3, label: 'Travel' },
      },
      notifications: buildSettings({
        rules: {
          morningWeighIn: { enabled: false },
          bodyFatCheckIn: { enabled: true, dayOfWeek: 0, time: '08:00' },
          dailyNeatCheckIn: {
            enabled: true,
            time: '18:30',
            daysMode: 'weekends',
          },
          meals: {
            breakfast: { enabled: false },
            lunch: { enabled: false },
            dinner: { enabled: false },
          },
          eveningLedger: { enabled: false },
          weeklyDigest: { enabled: false },
          stepCheckIn: { enabled: false },
          phaseMilestones: { enabled: false },
          staleWeighIn: { enabled: false },
          atUnlockAlert: { enabled: false },
        },
      }),
    },
  });

  const bodyFatItems = plan.scheduled.filter(
    (item) => item.extra.route === NOTIFICATION_ROUTES.OPEN_BODY_FAT_ENTRY
  );
  assert.equal(bodyFatItems.length, 1);
  assert.equal(bodyFatItems[0].extra.dateKey, '2026-05-10');

  // May 10 (Sun) skipped due to override; next weekend day in 7-day window is May 16 (Sat)
  const neatItems = plan.scheduled.filter(
    (item) => item.extra.route === NOTIFICATION_ROUTES.OPEN_DAILY_NEAT
  );
  assert.equal(neatItems.length, 1);
  assert.equal(neatItems[0].extra.dateKey, '2026-05-16');
});

test('schedules phase lifecycle milestones, weekly digest, stale weigh-in, and step check-in', () => {
  const now = new Date(2026, 4, 10, 6, 0, 0, 0); // Sun 2026-05-10
  const plan = buildNotificationPlan({
    now,
    horizonDays: 7,
    derivedState: {
      goalDailyBalanceTarget: 500,
      phases: [
        {
          id: 'phase-cut-1',
          name: 'Summer Cut',
          status: 'active',
          startDate: '2026-05-01',
          endDate: '2026-05-15',
        },
      ],
    },
    userData: {
      stepGoal: 10000,
      stepEntries: [{ date: '2026-05-10', steps: 7200 }],
      weightEntries: [{ date: '2026-05-05', weight: 76 }], // 5 days old -> stale!
      dailySnapshots: {
        '2026-05-08': { date: '2026-05-08', tdee: 2500, intake: 2000 },
        '2026-05-09': { date: '2026-05-09', tdee: 2600, intake: 2200 },
      },
      notifications: buildSettings({
        rules: {
          morningWeighIn: { enabled: false },
          meals: {
            breakfast: { enabled: false },
            lunch: { enabled: false },
            dinner: { enabled: false },
          },
          eveningLedger: { enabled: false },
          phaseMilestones: { enabled: true },
          weeklyDigest: { enabled: true, dayOfWeek: 0, time: '20:00' },
          staleWeighIn: { enabled: true, thresholdDays: 4, time: '09:00' },
          stepCheckIn: { enabled: true, time: '19:00' },
          atUnlockAlert: { enabled: false },
        },
      }),
    },
  });

  const phaseItems = plan.scheduled.filter(
    (item) => item.extra.route === NOTIFICATION_ROUTES.OPEN_PHASE_DETAIL
  );
  // 3 days left (May 12) + completes today (May 15)
  assert.equal(phaseItems.length, 2);
  assert.ok(phaseItems.some((item) => /3 days left/.test(item.title)));
  assert.ok(phaseItems.some((item) => /completes today/.test(item.title)));

  const digest = plan.scheduled.find(
    (item) => item.extra.route === NOTIFICATION_ROUTES.OPEN_ROLLING_BALANCE
  );
  assert.ok(digest);
  assert.match(digest.body, /450 kcal\/day deficit/);
  assert.match(digest.body, /2\/7 days logged/);

  const stale = plan.scheduled.find(
    (item) => item.id === NOTIFICATION_ID_RANGES.STALE_WEIGH_IN
  );
  assert.ok(stale);
  assert.match(stale.body, /5 days since your last weigh-in/);

  const todayStep = plan.scheduled.find(
    (item) => item.id === NOTIFICATION_ID_RANGES.STEP_CHECK_IN
  );
  assert.ok(todayStep);
  assert.match(todayStep.body, /2,800 steps left/);
});

test('emits one-shot Smart AT unlock immediate event when data sufficiency is reached', () => {
  const now = new Date(2026, 4, 25, 10, 0, 0, 0);
  const dailySnapshots = {};
  const weightEntries = [];
  for (let day = 5; day <= 25; day += 1) {
    const key = `2026-05-${String(day).padStart(2, '0')}`;
    dailySnapshots[key] = {
      date: key,
      tdee: 2500,
      intake: 2000,
      deficit: 500,
      stepCount: 9000,
    };
    weightEntries.push({ date: key, weight: 80 - day * 0.05 });
  }

  const plan = buildNotificationPlan({
    now,
    userData: {
      dailySnapshots,
      weightEntries,
      notifications: buildSettings({
        meta: { atUnlockNotified: false },
        rules: {
          atUnlockAlert: { enabled: true },
        },
      }),
    },
  });

  assert.equal(plan.immediateEvents.length, 1);
  assert.equal(plan.immediateEvents[0].key, 'at_smart_unlock');
  assert.equal(
    plan.immediateEvents[0].extra.route,
    NOTIFICATION_ROUTES.OPEN_SETTINGS_PAGE
  );

  // Already notified -> never repeats
  const repeatPlan = buildNotificationPlan({
    now,
    userData: {
      dailySnapshots,
      weightEntries,
      notifications: buildSettings({
        meta: { atUnlockNotified: true },
        rules: {
          atUnlockAlert: { enabled: true },
        },
      }),
    },
  });
  assert.equal(repeatPlan.immediateEvents.length, 0);
});

test('schedules EPOC post-workout refuel for moderate/vigorous sessions with remaining window', () => {
  const now = new Date(2026, 4, 10, 15, 0, 0, 0); // 15:00
  const sessionStart = new Date(2026, 4, 10, 14, 0, 0, 0).getTime();
  const sessionEnd = new Date(2026, 4, 10, 14, 50, 0, 0).getTime();

  const plan = buildNotificationPlan({
    now,
    horizonDays: 1,
    userData: {
      weight: 75,
      age: 28,
      height: 175,
      gender: 'male',
      epocEnabled: true,
      epocCarryoverHours: 6,
      cardioSessions: [
        {
          id: 'run-1',
          date: '2026-05-10',
          type: 'treadmill_run',
          duration: 50,
          intensity: 'vigorous',
          startTime: '14:00',
          timestamp: sessionStart,
          endTimestamp: sessionEnd,
        },
      ],
      notifications: buildSettings({
        rules: {
          morningWeighIn: { enabled: false },
          meals: {
            breakfast: { enabled: false },
            lunch: { enabled: false },
            dinner: { enabled: false },
          },
          eveningLedger: { enabled: false },
          weeklyDigest: { enabled: false },
          stepCheckIn: { enabled: false },
          phaseMilestones: { enabled: false },
          staleWeighIn: { enabled: false },
          atUnlockAlert: { enabled: false },
          epocRefuel: { enabled: true },
        },
      }),
    },
  });

  const epocNotif = plan.scheduled.find(
    (item) => item.id === NOTIFICATION_ID_RANGES.EPOC_REFUEL
  );
  assert.ok(epocNotif);
  assert.equal(epocNotif.channelId, NOTIFICATION_CHANNEL_IDS.WORKOUTS);
  assert.match(epocNotif.body, /EPOC burn/);
});

test('caps scheduled notifications at MAX_PENDING_LOCAL_NOTIFICATIONS (60) chronologically', () => {
  const now = new Date(2026, 4, 10, 5, 0, 0, 0);
  const plan = buildNotificationPlan({
    now,
    horizonDays: 14,
    userData: {
      stepGoal: 10000,
      notifications: buildSettings({
        rules: {
          morningWeighIn: { enabled: true, time: '07:30' },
          meals: {
            breakfast: { enabled: true, time: '09:00' },
            lunch: { enabled: true, time: '13:30' },
            dinner: { enabled: true, time: '19:30' },
          },
          eveningLedger: { enabled: true, time: '21:00' },
          dailyNeatCheckIn: { enabled: true, time: '18:00', daysMode: 'daily' },
          stepCheckIn: { enabled: true, time: '19:00' },
        },
      }),
    },
  });

  assert.equal(plan.scheduled.length, MAX_PENDING_LOCAL_NOTIFICATIONS);
  for (let i = 1; i < plan.scheduled.length; i += 1) {
    assert.ok(
      plan.scheduled[i].schedule.at.getTime() >=
        plan.scheduled[i - 1].schedule.at.getTime()
    );
  }
});

test('findUnimportedHealthWorkouts filters out already-logged, overlapping, short, and notified workouts', () => {
  const baseStart = new Date(2026, 4, 10, 10, 0, 0, 0).getTime();
  const workouts = [
    {
      id: 'w-logged-id',
      workoutType: 'running',
      startMs: baseStart,
      endMs: baseStart + 30 * 60_000,
      durationMinutes: 30,
    },
    {
      id: 'w-overlap',
      workoutType: 'cycling',
      startMs: baseStart + 120 * 60_000,
      endMs: baseStart + 150 * 60_000,
      durationMinutes: 30,
    },
    {
      id: 'w-already-notified',
      workoutType: 'rowing',
      startMs: baseStart + 240 * 60_000,
      endMs: baseStart + 260 * 60_000,
      durationMinutes: 20,
    },
    {
      id: 'w-too-short',
      workoutType: 'walking',
      startMs: baseStart + 300 * 60_000,
      endMs: baseStart + 303 * 60_000,
      durationMinutes: 3,
    },
    {
      id: 'w-new',
      workoutType: 'running',
      startMs: baseStart + 360 * 60_000,
      endMs: baseStart + 405 * 60_000,
      durationMinutes: 45,
    },
  ];

  const unimported = findUnimportedHealthWorkouts({
    workouts,
    cardioSessions: [
      { id: 'c1', healthWorkoutId: 'w-logged-id' },
      {
        id: 'c2',
        timestamp: baseStart + 122 * 60_000,
        endTimestamp: baseStart + 148 * 60_000,
      },
    ],
    trainingSessions: [],
    notifiedIds: ['w-already-notified'],
  });

  assert.equal(unimported.length, 1);
  assert.equal(unimported[0].id, 'w-new');
});

test('buildLiveHrGuardNotifications builds ongoing banner and 2.5h forgot-to-stop alert', () => {
  const startedAtMs = new Date(2026, 4, 10, 12, 0, 0, 0).getTime();
  const { ongoing, forgotAlert } = buildLiveHrGuardNotifications({
    startedAtMs,
    kind: 'training',
    nowMs: startedAtMs + 5_000,
  });

  assert.equal(ongoing.id, NOTIFICATION_ID_RANGES.LIVE_HR_ONGOING);
  assert.equal(ongoing.ongoing, true);
  assert.equal(ongoing.extra.route, NOTIFICATION_ROUTES.OPEN_LIVE_HR);
  assert.equal(ongoing.extra.kind, 'training');

  assert.equal(forgotAlert.id, NOTIFICATION_ID_RANGES.LIVE_HR_FORGOT);
  assert.equal(
    forgotAlert.schedule.at.getTime(),
    startedAtMs + 2.5 * 60 * 60_000
  );
});
