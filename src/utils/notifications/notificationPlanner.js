/**
 * Pure, deterministic local notification planner for Energy Map.
 *
 * Consumes `userData`, store `derivedState`, and a reference `now` Date to
 * produce the exact list of local notifications that should be scheduled on
 * the OS over a rolling horizon (default 7 days), plus any one-shot immediate
 * events (e.g. Smart Adaptive Thermogenesis unlock).
 *
 * Design invariants:
 * - Zero Capacitor / browser side effects: fully testable in `node --test`.
 * - Reuses canonical calculation modules (`calculateRollingEnergyBalance`,
 *   `getAdaptiveThermogenesisSmartModeDataStatus`, `resolveCardioSessionEpoc`,
 *   `resolveTrainingSessionEpoc`) — never duplicates expenditure math.
 * - Caps scheduled notifications at `MAX_PENDING_LOCAL_NOTIFICATIONS` (60)
 *   sorted chronologically so iOS's 64-notification hard limit is never hit.
 * - Uses inexact scheduling (`allowWhileIdle: true`, no exact-alarm privilege).
 */
import {
  LIVE_HR_FORGOT_HOURS,
  MAX_PENDING_LOCAL_NOTIFICATIONS,
  NOTIFICATION_CHANNEL_IDS,
  NOTIFICATION_ID_RANGES,
  NOTIFICATION_ROUTES,
  normalizeNotificationSettings,
} from '../../constants/notifications/notificationConfig.js';
import { getAdaptiveThermogenesisSmartModeDataStatus } from '../calculations/adaptiveThermogenesis.js';
import { calculateRollingEnergyBalance } from '../calculations/rollingEnergyBalance.js';
import {
  resolveCardioSessionEpoc,
  resolveTrainingSessionEpoc,
} from '../calculations/epoc.js';
import {
  calculateCardioCalories,
  calculateTrainingSessionCalories,
} from '../calculations/calculations.js';
import { normalizeDateKey } from '../measurements/weight.js';
import { createUnitFormatter } from '../units/unitFormatter.js';
import { cardioTypes as baseCardioTypes } from '../../constants/cardio/cardioTypes.js';

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;
const MIN_SCHEDULE_LEAD_MS = 15_000;
const EPOC_REFUEL_OFFSET_MINUTES = 45;
const WORKOUT_OVERLAP_TOLERANCE_MS = 5 * MS_PER_MINUTE;

const toLocalDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseLocalDateKey = (dateKey) => {
  const normalized = normalizeDateKey(dateKey);
  if (!normalized) {
    return null;
  }
  const [year, month, day] = normalized.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
};

const shiftDateKey = (dateKey, deltaDays) => {
  const base = parseLocalDateKey(dateKey);
  if (!base) {
    return null;
  }
  base.setDate(base.getDate() + deltaDays);
  return toLocalDateKey(base);
};

const diffDateKeysInDays = (fromKey, toKey) => {
  const from = parseLocalDateKey(fromKey);
  const to = parseLocalDateKey(toKey);
  if (!from || !to) {
    return null;
  }
  const utcFrom = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const utcTo = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((utcTo - utcFrom) / MS_PER_DAY);
};

const parseTimeToMinutes = (timeStr, fallbackMinutes = 9 * 60) => {
  const match = String(timeStr ?? '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return fallbackMinutes;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return fallbackMinutes;
  }
  return hours * 60 + minutes;
};

const combineDateKeyAndTime = (dateKey, timeStr) => {
  const base = parseLocalDateKey(dateKey);
  if (!base) {
    return null;
  }
  const totalMinutes = parseTimeToMinutes(timeStr);
  base.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0);
  return base;
};

/**
 * Returns true if `minutesOfDay` (0..1439) falls inside `[start, end)` quiet
 * hours, correctly handling overnight spans such as `22:30` -> `07:00`.
 */
export const isWithinQuietHours = (minutesOfDay, quietHours) => {
  if (!quietHours?.enabled) {
    return false;
  }
  const start = parseTimeToMinutes(quietHours.start, 22 * 60 + 30);
  const end = parseTimeToMinutes(quietHours.end, 7 * 60);
  if (start === end) {
    return false;
  }
  if (start < end) {
    return minutesOfDay >= start && minutesOfDay < end;
  }
  // Overnight wrap (e.g., 22:30 -> 07:00)
  return minutesOfDay >= start || minutesOfDay < end;
};

/**
 * Shifts a target `Date` out of quiet hours to the end of the quiet window
 * (e.g. `07:00` the next morning) when quiet hours are enabled.
 */
export const applyQuietHours = (targetDate, quietHours) => {
  if (!(targetDate instanceof Date) || Number.isNaN(targetDate.getTime())) {
    return null;
  }
  if (!quietHours?.enabled) {
    return new Date(targetDate.getTime());
  }

  const minutesOfDay = targetDate.getHours() * 60 + targetDate.getMinutes();
  if (!isWithinQuietHours(minutesOfDay, quietHours)) {
    return new Date(targetDate.getTime());
  }

  const start = parseTimeToMinutes(quietHours.start, 22 * 60 + 30);
  const end = parseTimeToMinutes(quietHours.end, 7 * 60);
  const shifted = new Date(targetDate.getTime());

  // Overnight span and currently in the evening tail -> move to next day's end.
  if (start > end && minutesOfDay >= start) {
    shifted.setDate(shifted.getDate() + 1);
  }
  shifted.setHours(Math.floor(end / 60), end % 60, 0, 0);
  return shifted;
};

const hasEntriesOnDate = (entries, dateKey) =>
  Array.isArray(entries) &&
  entries.some((entry) => normalizeDateKey(entry?.date) === dateKey);

const countTodayLoggedMeals = (nutritionData, dateKey) => {
  const dayMeals = nutritionData?.[dateKey];
  if (!dayMeals || typeof dayMeals !== 'object') {
    return { loggedMealSlots: 0, totalItems: 0 };
  }
  let loggedMealSlots = 0;
  let totalItems = 0;
  Object.values(dayMeals).forEach((items) => {
    if (Array.isArray(items) && items.length > 0) {
      loggedMealSlots += 1;
      totalItems += items.length;
    }
  });
  return { loggedMealSlots, totalItems };
};

const getTodayIntakeCalories = (nutritionData, dateKey) => {
  const dayMeals = nutritionData?.[dateKey];
  if (!dayMeals || typeof dayMeals !== 'object') {
    return 0;
  }
  let total = 0;
  Object.values(dayMeals).forEach((items) => {
    if (!Array.isArray(items)) return;
    items.forEach((item) => {
      const cal = Number(item?.calories);
      if (Number.isFinite(cal) && cal > 0) {
        total += cal;
      }
    });
  });
  return Math.round(total);
};

const getTodaySteps = (stepEntries, dateKey) => {
  if (!Array.isArray(stepEntries)) {
    return 0;
  }
  const entry = stepEntries.find(
    (item) => normalizeDateKey(item?.date) === dateKey
  );
  const steps = Number(entry?.steps);
  return Number.isFinite(steps) && steps > 0 ? Math.round(steps) : 0;
};

const resolvePhasesList = (userData, derivedState) => {
  if (Array.isArray(derivedState?.phases) && derivedState.phases.length > 0) {
    return derivedState.phases;
  }
  const byId = userData?.phaseLogV2?.phasesById;
  const order = userData?.phaseLogV2?.phaseOrder;
  if (!byId || typeof byId !== 'object') {
    return [];
  }
  const ids = Array.isArray(order) && order.length ? order : Object.keys(byId);
  return ids.map((id) => byId[id]).filter(Boolean);
};

const createScheduledItem = ({
  id,
  title,
  body,
  at,
  channelId,
  route,
  payload = {},
  quietHours,
  nowMs,
  respectQuietHours = true,
}) => {
  if (!(at instanceof Date) || Number.isNaN(at.getTime())) {
    return null;
  }
  const resolvedAt = respectQuietHours ? applyQuietHours(at, quietHours) : at;
  if (!resolvedAt || resolvedAt.getTime() < nowMs + MIN_SCHEDULE_LEAD_MS) {
    return null;
  }
  return {
    id,
    title,
    body,
    channelId,
    isExactNotification: false,
    schedule: {
      at: resolvedAt,
      allowWhileIdle: true,
    },
    extra: {
      route,
      ...payload,
    },
  };
};

const formatSignedKcal = (value, energy) => {
  const rounded = Math.round(Number(value) || 0);
  if (rounded === 0) return `0 ${energy.unit}`;
  const sign = rounded > 0 ? '+' : '-';
  return `${sign}${energy.format(Math.abs(Number(value)))}`;
};

const buildWeeklyDigestBody = ({ userData, derivedState, todayKey }) => {
  const { energy } = createUnitFormatter(userData?.unitPreferences);
  const goalTarget = Number(derivedState?.goalDailyBalanceTarget);
  const summary = calculateRollingEnergyBalance({
    snapshots: userData?.dailySnapshots ?? {},
    windowDays: 7,
    asOfDate: todayKey,
    goalDailyBalanceTarget: Number.isFinite(goalTarget) ? goalTarget : null,
  });

  if (!summary.hasData || summary.averageDailyBalance == null) {
    return 'Review your 7-day rolling energy balance and TDEE trends.';
  }

  // Convert from balance convention (positive = deficit) to intuitive
  // deficit/surplus phrasing.
  const avg = Math.round(summary.averageDailyBalance);
  const avgPhrase =
    Math.abs(avg) <= 50
      ? 'near maintenance'
      : avg > 0
        ? `${energy.value(summary.averageDailyBalance)} ${energy.unit}/day deficit`
        : `${energy.value(Math.abs(summary.averageDailyBalance))} ${energy.unit}/day surplus`;

  const daysLabel = `${summary.trackedDays}/7 days logged`;
  if (Number.isFinite(goalTarget) && Math.abs(goalTarget) > 0) {
    const targetPhrase =
      goalTarget > 0
        ? `${energy.value(goalTarget)} deficit`
        : `${energy.value(Math.abs(goalTarget))} surplus`;
    return `7-day avg: ${avgPhrase} vs ${targetPhrase} target (${daysLabel}).`;
  }

  return `7-day avg: ${avgPhrase} (${daysLabel}). Tap to inspect trends.`;
};

const resolveSessionEndMs = (session, fallbackDateKey) => {
  const endTimestamp = Number(session?.endTimestamp);
  if (Number.isFinite(endTimestamp) && endTimestamp > 0) {
    return endTimestamp;
  }
  const dateKey = normalizeDateKey(session?.date) || fallbackDateKey;
  const start = combineDateKeyAndTime(dateKey, session?.startTime || '12:00');
  if (!start) {
    return null;
  }
  const durationMinutes = Math.max(1, Number(session?.duration) || 30);
  return start.getTime() + durationMinutes * MS_PER_MINUTE;
};

/**
 * Builds the full local notification schedule and immediate one-shot events.
 *
 * @param {{
 *   userData: object,
 *   derivedState?: object,
 *   now?: Date,
 *   horizonDays?: number,
 * }} params
 * @returns {{
 *   scheduled: Array<{ id: number, title: string, body: string, channelId: string, schedule: { at: Date, allowWhileIdle: boolean }, extra: object }>,
 *   immediateEvents: Array<{ key: string, id: number, title: string, body: string, channelId: string, extra: object }>,
 * }}
 */
export const buildNotificationPlan = ({
  userData = {},
  derivedState = {},
  now = new Date(),
  horizonDays = 7,
} = {}) => {
  const settings = normalizeNotificationSettings(userData?.notifications);
  if (!settings.enabled) {
    return { scheduled: [], immediateEvents: [] };
  }

  const nowDate = now instanceof Date ? now : new Date(now);
  const nowMs = nowDate.getTime();
  const todayKey = toLocalDateKey(nowDate);
  const safeHorizon = Math.min(Math.max(Math.round(horizonDays) || 7, 1), 14);
  const { quietHours, rules, meta } = settings;

  const weightEntries =
    derivedState?.weightEntries ?? userData?.weightEntries ?? [];
  const bodyFatEntries =
    derivedState?.bodyFatEntries ?? userData?.bodyFatEntries ?? [];
  const stepEntries = derivedState?.stepEntries ?? userData?.stepEntries ?? [];
  const nutritionData = userData?.nutritionData ?? {};
  const dailyNeatOverrides = userData?.dailyNeatOverrides ?? {};

  const candidates = [];
  const pushCandidate = (item) => {
    if (item) {
      candidates.push(item);
    }
  };

  // --- Tier 1: Daily Ritual Anchors ---

  // 1. Morning Weigh-in Reminder (smart-skip if logged today)
  if (rules.morningWeighIn.enabled) {
    const loggedWeightToday = hasEntriesOnDate(weightEntries, todayKey);
    for (let offset = 0; offset < safeHorizon; offset += 1) {
      if (
        offset === 0 &&
        rules.morningWeighIn.skipIfLogged &&
        loggedWeightToday
      ) {
        continue;
      }
      const dateKey = shiftDateKey(todayKey, offset);
      const at = combineDateKeyAndTime(dateKey, rules.morningWeighIn.time);
      pushCandidate(
        createScheduledItem({
          id: NOTIFICATION_ID_RANGES.MORNING_WEIGH_IN + offset,
          title: 'Morning weigh-in',
          body: 'Log your morning weight to keep your TDEE and trend curve accurate.',
          at,
          channelId: NOTIFICATION_CHANNEL_IDS.REMINDERS,
          route: NOTIFICATION_ROUTES.OPEN_WEIGHT_ENTRY,
          payload: { dateKey },
          quietHours,
          nowMs,
        })
      );
    }
  }

  // 1b. Body Fat Check-in (only when bodyFatTrackingEnabled is on)
  if (
    rules.bodyFatCheckIn.enabled &&
    Boolean(userData?.bodyFatTrackingEnabled)
  ) {
    const loggedBfToday = hasEntriesOnDate(bodyFatEntries, todayKey);
    for (let offset = 0; offset < safeHorizon; offset += 1) {
      const dateKey = shiftDateKey(todayKey, offset);
      const dateObj = parseLocalDateKey(dateKey);
      if (!dateObj || dateObj.getDay() !== rules.bodyFatCheckIn.dayOfWeek) {
        continue;
      }
      if (offset === 0 && loggedBfToday) {
        continue;
      }
      const at = combineDateKeyAndTime(dateKey, rules.bodyFatCheckIn.time);
      pushCandidate(
        createScheduledItem({
          id: NOTIFICATION_ID_RANGES.BODY_FAT_CHECK_IN + offset,
          title: 'Body fat check-in',
          body: 'Log a body fat reading to keep Katch-McArdle BMR and lean-mass trends current.',
          at,
          channelId: NOTIFICATION_CHANNEL_IDS.REMINDERS,
          route: NOTIFICATION_ROUTES.OPEN_BODY_FAT_ENTRY,
          payload: { dateKey },
          quietHours,
          nowMs,
        })
      );
    }
  }

  // 2. Smart Meal Logging Nudges (Breakfast / Lunch / Dinner)
  const mealConfigs = [
    {
      key: 'breakfast',
      label: 'Breakfast',
      idBase: NOTIFICATION_ID_RANGES.MEAL_BREAKFAST,
    },
    {
      key: 'lunch',
      label: 'Lunch',
      idBase: NOTIFICATION_ID_RANGES.MEAL_LUNCH,
    },
    {
      key: 'dinner',
      label: 'Dinner',
      idBase: NOTIFICATION_ID_RANGES.MEAL_DINNER,
    },
  ];

  mealConfigs.forEach(({ key, label, idBase }) => {
    const mealRule = rules.meals[key];
    if (!mealRule?.enabled) {
      return;
    }
    const loggedThisMealToday =
      Array.isArray(nutritionData?.[todayKey]?.[key]) &&
      nutritionData[todayKey][key].length > 0;

    for (let offset = 0; offset < safeHorizon; offset += 1) {
      if (offset === 0 && mealRule.skipIfLogged && loggedThisMealToday) {
        continue;
      }
      const dateKey = shiftDateKey(todayKey, offset);
      const at = combineDateKeyAndTime(dateKey, mealRule.time);
      pushCandidate(
        createScheduledItem({
          id: idBase + offset,
          title: `Log ${label.toLowerCase()}`,
          body: `No ${label.toLowerCase()} entries logged yet. Tap to add your meal.`,
          at,
          channelId: NOTIFICATION_CHANNEL_IDS.REMINDERS,
          route: NOTIFICATION_ROUTES.OPEN_FOOD_SEARCH,
          payload: { mealType: key, dateKey },
          quietHours,
          nowMs,
        })
      );
    }
  });

  // 3. Evening Ledger Close-Out
  if (rules.eveningLedger.enabled) {
    const { loggedMealSlots } = countTodayLoggedMeals(nutritionData, todayKey);
    const todayIntake = getTodayIntakeCalories(nutritionData, todayKey);
    const todaySnapshot = userData?.dailySnapshots?.[todayKey];
    const { energy } = createUnitFormatter(userData?.unitPreferences);
    const targetCalories = Number(
      derivedState?.goalCalories ?? todaySnapshot?.targetCalories ?? NaN
    );

    for (let offset = 0; offset < safeHorizon; offset += 1) {
      const dateKey = shiftDateKey(todayKey, offset);
      const at = combineDateKeyAndTime(dateKey, rules.eveningLedger.time);
      let body =
        'Review today’s intake, activity, and expenditure before midnight finalizes the ledger.';
      if (offset === 0) {
        if (loggedMealSlots === 0) {
          body =
            'No meals logged today yet. Close out your food log before midnight.';
        } else if (Number.isFinite(targetCalories) && targetCalories > 0) {
          const remaining = Math.round(targetCalories - todayIntake);
          const gapText =
            remaining > 0
              ? `${energy.format(remaining)} remaining vs target`
              : `${energy.format(Math.abs(remaining))} over target`;
          body = `${loggedMealSlots} ${loggedMealSlots === 1 ? 'meal' : 'meals'} logged (${energy.format(todayIntake)}) · ${gapText}.`;
        } else {
          body = `${loggedMealSlots} ${loggedMealSlots === 1 ? 'meal' : 'meals'} logged today (${energy.format(todayIntake)}). Review your ledger before midnight.`;
        }
      }
      pushCandidate(
        createScheduledItem({
          id: NOTIFICATION_ID_RANGES.EVENING_LEDGER + offset,
          title: 'Evening ledger close-out',
          body,
          at,
          channelId: NOTIFICATION_CHANNEL_IDS.REMINDERS,
          route: NOTIFICATION_ROUTES.OPEN_DAY_LEDGER,
          payload: { dateKey },
          quietHours,
          nowMs,
        })
      );
    }
  }

  // 4. Daily NEAT Override Check-in
  if (rules.dailyNeatCheckIn.enabled) {
    const hasTodayOverride = Boolean(dailyNeatOverrides?.[todayKey]);
    for (let offset = 0; offset < safeHorizon; offset += 1) {
      if (offset === 0 && hasTodayOverride) {
        continue;
      }
      const dateKey = shiftDateKey(todayKey, offset);
      const dateObj = parseLocalDateKey(dateKey);
      if (!dateObj) {
        continue;
      }
      const dayOfWeek = dateObj.getDay();
      if (
        rules.dailyNeatCheckIn.daysMode === 'weekends' &&
        dayOfWeek !== 0 &&
        dayOfWeek !== 6
      ) {
        continue;
      }
      const at = combineDateKeyAndTime(dateKey, rules.dailyNeatCheckIn.time);
      pushCandidate(
        createScheduledItem({
          id: NOTIFICATION_ID_RANGES.DAILY_NEAT + offset,
          title: 'Adjust today’s NEAT?',
          body: 'Different routine today? Set a one-day NEAT override so today’s TDEE stays honest.',
          at,
          channelId: NOTIFICATION_CHANNEL_IDS.REMINDERS,
          route: NOTIFICATION_ROUTES.OPEN_DAILY_NEAT,
          payload: { dateKey },
          quietHours,
          nowMs,
        })
      );
    }
  }

  // --- Tier 2: Metabolic & Phase Intelligence ---

  // 5. Phase Lifecycle Milestones
  if (rules.phaseMilestones.enabled) {
    const phases = resolvePhasesList(userData, derivedState);
    let phaseNotifOffset = 0;

    phases.forEach((phase) => {
      if (
        !phase ||
        phase.status === 'completed' ||
        phase.status === 'archived'
      ) {
        return;
      }
      const startKey = normalizeDateKey(phase.startDate);
      const endKey = normalizeDateKey(phase.endDate);
      const phaseName = String(phase.name || 'Your phase').trim();
      const milestones = [];

      if (startKey) {
        const eveKey = shiftDateKey(startKey, -1);
        if (eveKey) {
          milestones.push({
            dateKey: eveKey,
            time: '19:00',
            title: `${phaseName} starts tomorrow`,
            body: 'Review your calorie target and macro split before day 1 begins.',
          });
        }
      }

      if (startKey && endKey) {
        const spanDays = diffDateKeysInDays(startKey, endKey);
        if (spanDays != null && spanDays >= 8) {
          const midKey = shiftDateKey(startKey, Math.floor(spanDays / 2));
          if (midKey) {
            milestones.push({
              dateKey: midKey,
              time: '10:00',
              title: `Midpoint check-in: ${phaseName}`,
              body: 'You’re halfway through this phase. Inspect your weight trend and rolling energy balance.',
            });
          }
        }
        if (spanDays != null && spanDays >= 5) {
          const threeDaysLeftKey = shiftDateKey(endKey, -3);
          if (threeDaysLeftKey) {
            milestones.push({
              dateKey: threeDaysLeftKey,
              time: '10:00',
              title: `3 days left in ${phaseName}`,
              body: 'Finish strong and plan your next maintenance or transition target.',
            });
          }
        }
        milestones.push({
          dateKey: endKey,
          time: '19:00',
          title: `${phaseName} completes today`,
          body: 'Review your phase outcome, rolling balance, and next goal.',
        });
      }

      milestones.forEach((milestone) => {
        const daysAway = diffDateKeysInDays(todayKey, milestone.dateKey);
        if (daysAway == null || daysAway < 0 || daysAway > safeHorizon) {
          return;
        }
        const at = combineDateKeyAndTime(milestone.dateKey, milestone.time);
        const item = createScheduledItem({
          id: NOTIFICATION_ID_RANGES.PHASE_MILESTONES + phaseNotifOffset,
          title: milestone.title,
          body: milestone.body,
          at,
          channelId: NOTIFICATION_CHANNEL_IDS.INSIGHTS,
          route: NOTIFICATION_ROUTES.OPEN_PHASE_DETAIL,
          payload: { phaseId: phase.id },
          quietHours,
          nowMs,
        });
        if (item) {
          pushCandidate(item);
          phaseNotifOffset += 1;
        }
      });
    });
  }

  // 6. Smart Adaptive Thermogenesis Unlocked (one-shot immediate event)
  const immediateEvents = [];
  if (rules.atUnlockAlert.enabled && !meta.atUnlockNotified) {
    const atStatus = getAdaptiveThermogenesisSmartModeDataStatus({
      dateKey: todayKey,
      dailySnapshots: userData?.dailySnapshots ?? {},
      weightEntries,
    });
    if (atStatus?.isSufficient) {
      immediateEvents.push({
        key: 'at_smart_unlock',
        id: NOTIFICATION_ID_RANGES.AT_SMART_UNLOCK,
        title: 'Smart Adaptive Thermogenesis unlocked',
        body: 'You now have enough daily snapshots and weigh-ins to enable data-driven metabolic adaptation.',
        channelId: NOTIFICATION_CHANNEL_IDS.INSIGHTS,
        extra: {
          route: NOTIFICATION_ROUTES.OPEN_SETTINGS_PAGE,
          page: 'adjustments',
        },
      });
    }
  }

  // 7. Weekly Rolling Energy Balance Digest
  if (rules.weeklyDigest.enabled) {
    for (let offset = 0; offset < safeHorizon; offset += 1) {
      const dateKey = shiftDateKey(todayKey, offset);
      const dateObj = parseLocalDateKey(dateKey);
      if (!dateObj || dateObj.getDay() !== rules.weeklyDigest.dayOfWeek) {
        continue;
      }
      const at = combineDateKeyAndTime(dateKey, rules.weeklyDigest.time);
      const body = buildWeeklyDigestBody({ userData, derivedState, todayKey });
      pushCandidate(
        createScheduledItem({
          id: NOTIFICATION_ID_RANGES.WEEKLY_DIGEST + offset,
          title: 'Weekly energy balance digest',
          body,
          at,
          channelId: NOTIFICATION_CHANNEL_IDS.INSIGHTS,
          route: NOTIFICATION_ROUTES.OPEN_ROLLING_BALANCE,
          payload: { dateKey },
          quietHours,
          nowMs,
        })
      );
    }
  }

  // 8. Stale Weigh-in Warning (active phase OR Smart AT enabled)
  const hasActivePhase = resolvePhasesList(userData, derivedState).some(
    (phase) => phase?.status === 'active'
  );
  const needsFreshWeighIns =
    hasActivePhase || Boolean(userData?.adaptiveThermogenesisSmartMode);

  if (
    rules.staleWeighIn.enabled &&
    needsFreshWeighIns &&
    Array.isArray(weightEntries) &&
    weightEntries.length > 0
  ) {
    const sortedWeights = [...weightEntries]
      .filter((entry) => normalizeDateKey(entry?.date))
      .sort((a, b) =>
        normalizeDateKey(a.date).localeCompare(normalizeDateKey(b.date))
      );
    const latestWeight = sortedWeights[sortedWeights.length - 1];
    const latestDateKey = normalizeDateKey(latestWeight?.date);
    if (latestDateKey) {
      const dueDateKey = shiftDateKey(
        latestDateKey,
        rules.staleWeighIn.thresholdDays
      );
      const daysSinceLast = diffDateKeysInDays(latestDateKey, todayKey);
      const targetDateKey =
        dueDateKey && dueDateKey >= todayKey ? dueDateKey : todayKey;
      const daysUntilTarget = diffDateKeysInDays(todayKey, targetDateKey);

      if (daysUntilTarget != null && daysUntilTarget <= safeHorizon) {
        const at = combineDateKeyAndTime(
          targetDateKey,
          rules.staleWeighIn.time
        );
        const staleDays = Math.max(
          rules.staleWeighIn.thresholdDays,
          (daysSinceLast ?? 0) + Math.max(0, daysUntilTarget)
        );
        pushCandidate(
          createScheduledItem({
            id: NOTIFICATION_ID_RANGES.STALE_WEIGH_IN,
            title: 'Weigh-in trend is getting stale',
            body: `It’s been ${staleDays} days since your last weigh-in. Log one to keep phase pacing and trend smoothing accurate.`,
            at,
            channelId: NOTIFICATION_CHANNEL_IDS.INSIGHTS,
            route: NOTIFICATION_ROUTES.OPEN_WEIGHT_ENTRY,
            payload: { dateKey: targetDateKey },
            quietHours,
            nowMs,
          })
        );
      }
    }
  }

  // 9. EPOC Window / Post-Workout Refuel
  if (rules.epocRefuel.enabled && Boolean(userData?.epocEnabled ?? true)) {
    const resolvedTrainingTypes =
      derivedState?.resolvedTrainingTypes ?? userData?.trainingType ?? {};
    const resolvedCardioTypes = {
      ...baseCardioTypes,
      ...(userData?.customCardioTypes ?? {}),
    };
    const todayCardio = (userData?.cardioSessions ?? []).filter(
      (session) => normalizeDateKey(session?.date) === todayKey
    );
    const todayTraining = (userData?.trainingSessions ?? []).filter(
      (session) => normalizeDateKey(session?.date) === todayKey
    );

    let epocOffset = 0;

    const inspectSession = (session, kind) => {
      const endMs = resolveSessionEndMs(session, todayKey);
      if (!endMs) {
        return;
      }
      const exerciseCalories =
        kind === 'training'
          ? calculateTrainingSessionCalories(
              session,
              userData,
              resolvedTrainingTypes
            )
          : calculateCardioCalories(session, userData, resolvedCardioTypes);
      const epoc =
        kind === 'training'
          ? resolveTrainingSessionEpoc({
              session,
              exerciseCalories,
              trainingType: resolvedTrainingTypes?.[session?.type],
              userData,
            })
          : resolveCardioSessionEpoc({
              session,
              exerciseCalories,
              cardioType: resolvedCardioTypes?.[session?.type],
              userData,
            });

      if (
        !epoc ||
        epoc.totalCalories <= 0 ||
        epoc.windowMinutes <= 0 ||
        epoc.details?.intensity === 'light'
      ) {
        return;
      }

      const windowEndMs = endMs + epoc.windowMinutes * MS_PER_MINUTE;
      if (windowEndMs <= nowMs + MIN_SCHEDULE_LEAD_MS) {
        return;
      }

      // Prefer 45 min post-workout; if already past that, schedule at midpoint
      // of the remaining carryover window if at least 20 min left.
      let targetMs = endMs + EPOC_REFUEL_OFFSET_MINUTES * MS_PER_MINUTE;
      if (targetMs <= nowMs + MIN_SCHEDULE_LEAD_MS) {
        const remainingMs = windowEndMs - nowMs;
        if (remainingMs < 20 * MS_PER_MINUTE) {
          return;
        }
        targetMs = nowMs + Math.round(remainingMs * 0.5);
      }

      const item = createScheduledItem({
        id: NOTIFICATION_ID_RANGES.EPOC_REFUEL + epocOffset,
        title: 'Post-workout EPOC refuel window',
        body: `Your ${kind} session added ${formatSignedKcal(epoc.totalCalories, createUnitFormatter(userData?.unitPreferences).energy)} EPOC burn. Log your recovery meal while expenditure is elevated.`,
        at: new Date(targetMs),
        channelId: NOTIFICATION_CHANNEL_IDS.WORKOUTS,
        route: NOTIFICATION_ROUTES.OPEN_HOME,
        payload: { sessionId: session?.id ?? null, kind },
        quietHours,
        nowMs,
      });
      if (item) {
        pushCandidate(item);
        epocOffset += 1;
      }
    };

    todayTraining.forEach((session) => inspectSession(session, 'training'));
    todayCardio.forEach((session) => inspectSession(session, 'cardio'));
  }

  // --- Tier 3: Activity & Steps ---

  // 10. Step Goal Close-Out Nudge
  if (rules.stepCheckIn.enabled) {
    const stepGoal = Math.max(0, Math.round(Number(userData?.stepGoal) || 0));
    const todaySteps = getTodaySteps(stepEntries, todayKey);

    if (stepGoal > 0) {
      for (let offset = 0; offset < safeHorizon; offset += 1) {
        if (offset === 0 && todaySteps >= stepGoal) {
          continue;
        }
        const dateKey = shiftDateKey(todayKey, offset);
        const at = combineDateKeyAndTime(dateKey, rules.stepCheckIn.time);
        let body = `Check your step count toward your ${stepGoal.toLocaleString()} daily goal.`;
        if (offset === 0 && todaySteps > 0) {
          const remaining = stepGoal - todaySteps;
          body = `${remaining.toLocaleString()} steps left to hit your ${stepGoal.toLocaleString()} goal today.`;
        }
        pushCandidate(
          createScheduledItem({
            id: NOTIFICATION_ID_RANGES.STEP_CHECK_IN + offset,
            title: 'Step goal check-in',
            body,
            at,
            channelId: NOTIFICATION_CHANNEL_IDS.REMINDERS,
            route: NOTIFICATION_ROUTES.OPEN_STEP_TRACKER,
            payload: { dateKey },
            quietHours,
            nowMs,
          })
        );
      }
    }
  }

  // Sort chronologically and cap safely under iOS's 64-notification hard limit.
  const scheduled = candidates
    .sort((a, b) => a.schedule.at.getTime() - b.schedule.at.getTime())
    .slice(0, MAX_PENDING_LOCAL_NOTIFICATIONS);

  return { scheduled, immediateEvents };
};

/**
 * Pure detector for #11 (Unimported Health Workouts): finds synced health
 * workouts that do not match any already-logged cardio or training session and
 * have not already been notified.
 */
export const findUnimportedHealthWorkouts = ({
  workouts = [],
  cardioSessions = [],
  trainingSessions = [],
  notifiedIds = [],
} = {}) => {
  if (!Array.isArray(workouts) || workouts.length === 0) {
    return [];
  }

  const notifiedSet = new Set(Array.isArray(notifiedIds) ? notifiedIds : []);
  const allLogged = [
    ...(Array.isArray(cardioSessions) ? cardioSessions : []),
    ...(Array.isArray(trainingSessions) ? trainingSessions : []),
  ];

  const isAlreadyLogged = (workout) => {
    const workoutId = String(workout?.id ?? '').trim();
    const wStart = Number(workout?.startMs);
    const wEnd = Number(workout?.endMs);

    return allLogged.some((session) => {
      if (!session || typeof session !== 'object') {
        return false;
      }
      if (
        workoutId &&
        (session.healthWorkoutId === workoutId ||
          session.importedWorkoutId === workoutId)
      ) {
        return true;
      }
      const sStart = Number(session.timestamp ?? session.startTimestamp);
      const sEnd = Number(session.endTimestamp);
      if (
        Number.isFinite(wStart) &&
        Number.isFinite(wEnd) &&
        Number.isFinite(sStart) &&
        Number.isFinite(sEnd)
      ) {
        return (
          sStart <= wEnd + WORKOUT_OVERLAP_TOLERANCE_MS &&
          sEnd >= wStart - WORKOUT_OVERLAP_TOLERANCE_MS
        );
      }
      return false;
    });
  };

  return workouts.filter((workout) => {
    const id = String(workout?.id ?? '').trim();
    if (!id || notifiedSet.has(id)) {
      return false;
    }
    if ((Number(workout?.durationMinutes) || 0) < 5) {
      return false;
    }
    return !isAlreadyLogged(workout);
  });
};

/**
 * Pure builder for #12 (Live BLE Heart-Rate Recording Guard):
 * - Immediate ongoing status notification (sticky on Android)
 * - Scheduled forgot-to-stop alert 2.5 hours after recording started
 */
export const buildLiveHrGuardNotifications = ({
  startedAtMs,
  kind = 'cardio',
  nowMs = Date.now(),
} = {}) => {
  if (!Number.isFinite(startedAtMs) || startedAtMs <= 0) {
    return { ongoing: null, forgotAlert: null };
  }
  const label = kind === 'training' ? 'training' : 'cardio';
  const forgotAtMs = startedAtMs + LIVE_HR_FORGOT_HOURS * 60 * MS_PER_MINUTE;

  const ongoing = {
    id: NOTIFICATION_ID_RANGES.LIVE_HR_ONGOING,
    title: 'Recording live heart rate',
    body: `Active ${label} sensor recording. Tap to return to the live session.`,
    channelId: NOTIFICATION_CHANNEL_IDS.WORKOUTS,
    ongoing: true,
    autoCancel: false,
    foreground: true,
    isExactNotification: false,
    extra: {
      route: NOTIFICATION_ROUTES.OPEN_LIVE_HR,
      kind: label,
    },
  };

  const forgotAlert =
    forgotAtMs > nowMs + MIN_SCHEDULE_LEAD_MS
      ? {
          id: NOTIFICATION_ID_RANGES.LIVE_HR_FORGOT,
          title: 'Still recording heart rate?',
          body: `Your live ${label} recording has been running for over 2.5 hours. Tap to stop and save.`,
          channelId: NOTIFICATION_CHANNEL_IDS.WORKOUTS,
          foreground: true,
          isExactNotification: false,
          schedule: {
            at: new Date(forgotAtMs),
            allowWhileIdle: true,
          },
          extra: {
            route: NOTIFICATION_ROUTES.OPEN_LIVE_HR,
            kind: label,
          },
        }
      : null;

  return { ongoing, forgotAlert };
};
