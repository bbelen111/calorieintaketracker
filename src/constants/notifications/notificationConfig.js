/**
 * Canonical constants, Android notification channels, deterministic ID ranges,
 * deep-link routes, and settings normalization for Energy Map's notification
 * subsystem (Layer 1 local notifications + Layer 2 remote push).
 *
 * Pure & dependency-free so both test tiers (`node --test` and Vitest) and
 * persistence (`storage.js`) can consume it directly.
 */

export const NOTIFICATION_CHANNEL_IDS = Object.freeze({
  REMINDERS: 'energy_map_reminders_v2',
  INSIGHTS: 'energy_map_insights_v2',
  WORKOUTS: 'energy_map_workouts_v2',
  ANNOUNCEMENTS: 'energy_map_announcements_v2',
});

// Note: omit `sound` on Android channels so Android uses the system default
// notification tone. Passing `sound: 'default'` tells Capacitor to look up
// `res/raw/default`, which does not exist and mutes/breaks channel alerts.
export const NOTIFICATION_CHANNELS = Object.freeze([
  {
    id: NOTIFICATION_CHANNEL_IDS.REMINDERS,
    name: 'Daily Reminders',
    description: 'Weigh-in, meal logging, evening ledger, and step reminders.',
    importance: 4, // high (enables heads-up banners on Samsung One UI / Android)
    visibility: 1, // public
    vibration: true,
  },
  {
    id: NOTIFICATION_CHANNEL_IDS.INSIGHTS,
    name: 'Metabolic & Phase Insights',
    description:
      'Phase milestones, weekly rolling balance digests, and adaptive thermogenesis unlocks.',
    importance: 4,
    visibility: 1,
    vibration: true,
  },
  {
    id: NOTIFICATION_CHANNEL_IDS.WORKOUTS,
    name: 'Workouts & Heart Rate',
    description:
      'Live heart-rate recording guard, EPOC post-workout refuel, and unimported health workouts.',
    importance: 4,
    visibility: 1,
    vibration: true,
  },
  {
    id: NOTIFICATION_CHANNEL_IDS.ANNOUNCEMENTS,
    name: 'App & Catalog Updates',
    description:
      'Optional announcements about Energy Map releases and food catalog updates.',
    importance: 3, // default
    visibility: 1,
    vibration: false,
  },
]);

/**
 * Deterministic numeric ID ranges (32-bit positive integers required by
 * Android NotificationManager). Every managed local notification falls inside
 * `[MANAGED_ID_MIN, MANAGED_ID_MAX]` so reconcile diffing never collides with
 * unrelated IDs.
 */
export const NOTIFICATION_ID_RANGES = Object.freeze({
  MORNING_WEIGH_IN: 1000,
  BODY_FAT_CHECK_IN: 1100,
  MEAL_BREAKFAST: 1200,
  MEAL_LUNCH: 1300,
  MEAL_DINNER: 1400,
  EVENING_LEDGER: 1500,
  DAILY_NEAT: 1600,
  PHASE_MILESTONES: 1700,
  WEEKLY_DIGEST: 1800,
  STALE_WEIGH_IN: 1900,
  EPOC_REFUEL: 2000,
  STEP_CHECK_IN: 2100,
  UNIMPORTED_WORKOUT: 2200,
  LIVE_HR_ONGOING: 2300,
  LIVE_HR_FORGOT: 2301,
  AT_SMART_UNLOCK: 2400,
  TEST_NOTIFICATION: 2900,
});

export const MANAGED_SCHEDULE_ID_MIN = 1000;
export const MANAGED_SCHEDULE_ID_MAX = 2199;

/** Safe ceiling under iOS's 64-pending-local-notification hard limit. */
export const MAX_PENDING_LOCAL_NOTIFICATIONS = 60;

/** Hours after which an active live BLE HR recording triggers a forgot-to-stop alert. */
export const LIVE_HR_FORGOT_HOURS = 2.5;

export const NOTIFICATION_ROUTES = Object.freeze({
  OPEN_HOME: 'open_home',
  OPEN_WEIGHT_ENTRY: 'open_weight_entry',
  OPEN_BODY_FAT_ENTRY: 'open_body_fat_entry',
  OPEN_FOOD_SEARCH: 'open_food_search',
  OPEN_DAY_LEDGER: 'open_day_ledger',
  OPEN_DAILY_NEAT: 'open_daily_neat',
  OPEN_PHASE_DETAIL: 'open_phase_detail',
  OPEN_ROLLING_BALANCE: 'open_rolling_balance',
  OPEN_STEP_TRACKER: 'open_step_tracker',
  OPEN_LIVE_HR: 'open_live_hr',
  OPEN_CARDIO_IMPORT: 'open_cardio_import',
  OPEN_SETTINGS_PAGE: 'open_settings_page',
});

export const PUSH_TOPICS = Object.freeze({
  ANNOUNCEMENTS: 'announcements',
});

export const WEEKDAY_OPTIONS = Object.freeze([
  { value: 0, shortLabel: 'Sun', label: 'Sunday' },
  { value: 1, shortLabel: 'Mon', label: 'Monday' },
  { value: 2, shortLabel: 'Tue', label: 'Tuesday' },
  { value: 3, shortLabel: 'Wed', label: 'Wednesday' },
  { value: 4, shortLabel: 'Thu', label: 'Thursday' },
  { value: 5, shortLabel: 'Fri', label: 'Friday' },
  { value: 6, shortLabel: 'Sat', label: 'Saturday' },
]);

export const STALE_WEIGH_IN_DAY_OPTIONS = Object.freeze([3, 4, 5, 7]);

export const DAILY_NEAT_DAYS_MODES = Object.freeze(['daily', 'weekends']);

const TIME_24H_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const normalizeNotificationTime = (value, fallback) => {
  const raw = String(value ?? '').trim();
  if (TIME_24H_PATTERN.test(raw)) {
    return raw;
  }
  const loose = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (loose) {
    const hours = Number(loose[1]);
    const minutes = Number(loose[2]);
    if (
      Number.isInteger(hours) &&
      hours >= 0 &&
      hours <= 23 &&
      Number.isInteger(minutes) &&
      minutes >= 0 &&
      minutes <= 59
    ) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
  }
  return fallback;
};

export const normalizeWeekday = (value, fallback = 0) => {
  const numeric = Number(value);
  if (Number.isInteger(numeric) && numeric >= 0 && numeric <= 6) {
    return numeric;
  }
  return fallback;
};

export const normalizeStaleWeighInDays = (value, fallback = 4) => {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    const rounded = Math.round(numeric);
    if (rounded >= 2 && rounded <= 14) {
      return rounded;
    }
  }
  return fallback;
};

export const createDefaultNotificationSettings = () => ({
  enabled: false,
  quietHours: {
    enabled: true,
    start: '22:30',
    end: '07:00',
  },
  rules: {
    morningWeighIn: {
      enabled: true,
      time: '07:30',
      skipIfLogged: true,
    },
    bodyFatCheckIn: {
      enabled: false,
      dayOfWeek: 0, // Sunday
      time: '08:00',
    },
    meals: {
      breakfast: {
        enabled: false,
        time: '09:00',
        skipIfLogged: true,
      },
      lunch: {
        enabled: true,
        time: '13:30',
        skipIfLogged: true,
      },
      dinner: {
        enabled: true,
        time: '19:30',
        skipIfLogged: true,
      },
    },
    eveningLedger: {
      enabled: true,
      time: '21:00',
    },
    dailyNeatCheckIn: {
      enabled: false,
      time: '18:30',
      daysMode: 'weekends', // 'daily' | 'weekends'
    },
    phaseMilestones: {
      enabled: true,
    },
    atUnlockAlert: {
      enabled: true,
    },
    weeklyDigest: {
      enabled: true,
      dayOfWeek: 0, // Sunday
      time: '20:00',
    },
    staleWeighIn: {
      enabled: true,
      thresholdDays: 4,
      time: '09:00',
    },
    epocRefuel: {
      enabled: false,
    },
    stepCheckIn: {
      enabled: true,
      time: '19:00',
    },
    unimportedWorkout: {
      enabled: true,
    },
    liveHrGuard: {
      enabled: true,
    },
  },
  remotePush: {
    announcementsEnabled: false,
  },
  meta: {
    atUnlockNotified: false,
  },
});

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Deeply normalizes persisted or imported notification settings against the
 * current schema. Missing or invalid fields fall back safely to defaults.
 */
export const normalizeNotificationSettings = (raw) => {
  const defaults = createDefaultNotificationSettings();
  if (!isPlainObject(raw)) {
    return defaults;
  }

  const rawQuiet = isPlainObject(raw.quietHours) ? raw.quietHours : {};
  const rawRules = isPlainObject(raw.rules) ? raw.rules : {};
  const rawMeals = isPlainObject(rawRules.meals) ? rawRules.meals : {};
  const rawRemote = isPlainObject(raw.remotePush) ? raw.remotePush : {};
  const rawMeta = isPlainObject(raw.meta) ? raw.meta : {};

  const normalizeMealRule = (mealKey) => {
    const def = defaults.rules.meals[mealKey];
    const src = isPlainObject(rawMeals[mealKey]) ? rawMeals[mealKey] : {};
    return {
      enabled: Boolean(src.enabled ?? def.enabled),
      time: normalizeNotificationTime(src.time, def.time),
      skipIfLogged: Boolean(src.skipIfLogged ?? def.skipIfLogged),
    };
  };

  const rawWeighIn = isPlainObject(rawRules.morningWeighIn)
    ? rawRules.morningWeighIn
    : {};
  const rawBodyFat = isPlainObject(rawRules.bodyFatCheckIn)
    ? rawRules.bodyFatCheckIn
    : {};
  const rawEvening = isPlainObject(rawRules.eveningLedger)
    ? rawRules.eveningLedger
    : {};
  const rawNeat = isPlainObject(rawRules.dailyNeatCheckIn)
    ? rawRules.dailyNeatCheckIn
    : {};
  const rawPhase = isPlainObject(rawRules.phaseMilestones)
    ? rawRules.phaseMilestones
    : {};
  const rawAtUnlock = isPlainObject(rawRules.atUnlockAlert)
    ? rawRules.atUnlockAlert
    : {};
  const rawDigest = isPlainObject(rawRules.weeklyDigest)
    ? rawRules.weeklyDigest
    : {};
  const rawStale = isPlainObject(rawRules.staleWeighIn)
    ? rawRules.staleWeighIn
    : {};
  const rawEpoc = isPlainObject(rawRules.epocRefuel) ? rawRules.epocRefuel : {};
  const rawSteps = isPlainObject(rawRules.stepCheckIn)
    ? rawRules.stepCheckIn
    : {};
  const rawUnimported = isPlainObject(rawRules.unimportedWorkout)
    ? rawRules.unimportedWorkout
    : {};
  const rawLiveHr = isPlainObject(rawRules.liveHrGuard)
    ? rawRules.liveHrGuard
    : {};

  const daysMode = DAILY_NEAT_DAYS_MODES.includes(rawNeat.daysMode)
    ? rawNeat.daysMode
    : defaults.rules.dailyNeatCheckIn.daysMode;

  return {
    enabled: Boolean(raw.enabled ?? defaults.enabled),
    quietHours: {
      enabled: Boolean(rawQuiet.enabled ?? defaults.quietHours.enabled),
      start: normalizeNotificationTime(
        rawQuiet.start,
        defaults.quietHours.start
      ),
      end: normalizeNotificationTime(rawQuiet.end, defaults.quietHours.end),
    },
    rules: {
      morningWeighIn: {
        enabled: Boolean(
          rawWeighIn.enabled ?? defaults.rules.morningWeighIn.enabled
        ),
        time: normalizeNotificationTime(
          rawWeighIn.time,
          defaults.rules.morningWeighIn.time
        ),
        skipIfLogged: Boolean(
          rawWeighIn.skipIfLogged ?? defaults.rules.morningWeighIn.skipIfLogged
        ),
      },
      bodyFatCheckIn: {
        enabled: Boolean(
          rawBodyFat.enabled ?? defaults.rules.bodyFatCheckIn.enabled
        ),
        dayOfWeek: normalizeWeekday(
          rawBodyFat.dayOfWeek,
          defaults.rules.bodyFatCheckIn.dayOfWeek
        ),
        time: normalizeNotificationTime(
          rawBodyFat.time,
          defaults.rules.bodyFatCheckIn.time
        ),
      },
      meals: {
        breakfast: normalizeMealRule('breakfast'),
        lunch: normalizeMealRule('lunch'),
        dinner: normalizeMealRule('dinner'),
      },
      eveningLedger: {
        enabled: Boolean(
          rawEvening.enabled ?? defaults.rules.eveningLedger.enabled
        ),
        time: normalizeNotificationTime(
          rawEvening.time,
          defaults.rules.eveningLedger.time
        ),
      },
      dailyNeatCheckIn: {
        enabled: Boolean(
          rawNeat.enabled ?? defaults.rules.dailyNeatCheckIn.enabled
        ),
        time: normalizeNotificationTime(
          rawNeat.time,
          defaults.rules.dailyNeatCheckIn.time
        ),
        daysMode,
      },
      phaseMilestones: {
        enabled: Boolean(
          rawPhase.enabled ?? defaults.rules.phaseMilestones.enabled
        ),
      },
      atUnlockAlert: {
        enabled: Boolean(
          rawAtUnlock.enabled ?? defaults.rules.atUnlockAlert.enabled
        ),
      },
      weeklyDigest: {
        enabled: Boolean(
          rawDigest.enabled ?? defaults.rules.weeklyDigest.enabled
        ),
        dayOfWeek: normalizeWeekday(
          rawDigest.dayOfWeek,
          defaults.rules.weeklyDigest.dayOfWeek
        ),
        time: normalizeNotificationTime(
          rawDigest.time,
          defaults.rules.weeklyDigest.time
        ),
      },
      staleWeighIn: {
        enabled: Boolean(
          rawStale.enabled ?? defaults.rules.staleWeighIn.enabled
        ),
        thresholdDays: normalizeStaleWeighInDays(
          rawStale.thresholdDays,
          defaults.rules.staleWeighIn.thresholdDays
        ),
        time: normalizeNotificationTime(
          rawStale.time,
          defaults.rules.staleWeighIn.time
        ),
      },
      epocRefuel: {
        enabled: Boolean(rawEpoc.enabled ?? defaults.rules.epocRefuel.enabled),
      },
      stepCheckIn: {
        enabled: Boolean(
          rawSteps.enabled ?? defaults.rules.stepCheckIn.enabled
        ),
        time: normalizeNotificationTime(
          rawSteps.time,
          defaults.rules.stepCheckIn.time
        ),
      },
      unimportedWorkout: {
        enabled: Boolean(
          rawUnimported.enabled ?? defaults.rules.unimportedWorkout.enabled
        ),
      },
      liveHrGuard: {
        enabled: Boolean(
          rawLiveHr.enabled ?? defaults.rules.liveHrGuard.enabled
        ),
      },
    },
    remotePush: {
      announcementsEnabled: Boolean(
        rawRemote.announcementsEnabled ??
        defaults.remotePush.announcementsEnabled
      ),
    },
    meta: {
      atUnlockNotified: Boolean(
        rawMeta.atUnlockNotified ?? defaults.meta.atUnlockNotified
      ),
    },
  };
};
