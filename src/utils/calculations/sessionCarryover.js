import {
  deriveSessionTimestamps,
  getDateKeyFromEpochMs,
  getEpochMsFromDateAndTime,
  normalizeTimeOfDay,
} from '../formatting/time.js';
import { MAX_EPOC_CARRYOVER_WINDOW_MINUTES } from './epoc.js';

const MS_PER_MINUTE = 60 * 1000;

const normalizeEpochMs = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return Math.round(numeric);
};

const resolveSessionWindowFromSession = (session) => {
  if (!session || typeof session !== 'object') {
    return null;
  }

  const durationMinutes = Number(session?.duration);
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return null;
  }

  const derived = deriveSessionTimestamps({
    dateKey: session?.date,
    timeOfDay: normalizeTimeOfDay(session?.startTime, null),
    durationMinutes,
    fallbackStartedAt: session?.startedAt,
  });

  const startedAt = normalizeEpochMs(session?.startedAt ?? derived.startedAt);
  if (!startedAt) {
    return null;
  }

  const fallbackEndedAt =
    startedAt + Math.round(durationMinutes * MS_PER_MINUTE);
  const endedAtRaw = normalizeEpochMs(session?.endedAt) ?? fallbackEndedAt;
  const endedAt = Math.max(endedAtRaw, fallbackEndedAt);

  return {
    startedAt,
    endedAt,
    durationMinutes,
    dateKey: session?.date ?? getDateKeyFromEpochMs(startedAt),
  };
};

const getDateBoundsFromDateKey = (dateKey) => {
  const dayStart = getEpochMsFromDateAndTime({ dateKey, timeOfDay: '00:00' });
  if (!Number.isFinite(dayStart)) {
    return null;
  }

  return {
    startMs: dayStart,
    endMs: dayStart + 24 * 60 * 60 * 1000,
  };
};

const getOverlapMs = (leftStart, leftEnd, rightStart, rightEnd) => {
  const overlapStart = Math.max(leftStart, rightStart);
  const overlapEnd = Math.min(leftEnd, rightEnd);
  return Math.max(0, overlapEnd - overlapStart);
};

export const allocateCarryoverByDate = ({
  anchorMs,
  windowMinutes,
  totalCalories,
}) => {
  const startMs = normalizeEpochMs(anchorMs);
  const durationMinutes = Number(windowMinutes);
  const calories = Number(totalCalories);

  if (
    !startMs ||
    !Number.isFinite(durationMinutes) ||
    durationMinutes <= 0 ||
    !Number.isFinite(calories) ||
    calories <= 0
  ) {
    return [];
  }

  const endMs = startMs + Math.round(durationMinutes * MS_PER_MINUTE);
  const totalWindowMs = endMs - startMs;
  if (totalWindowMs <= 0) {
    return [];
  }

  const allocations = [];
  let cursorDateKey = getDateKeyFromEpochMs(startMs);
  const endDateKey = getDateKeyFromEpochMs(endMs - 1);

  while (cursorDateKey) {
    const bounds = getDateBoundsFromDateKey(cursorDateKey);
    if (!bounds) {
      break;
    }

    const overlapMs = getOverlapMs(
      startMs,
      endMs,
      bounds.startMs,
      bounds.endMs
    );
    if (overlapMs > 0) {
      const ratio = overlapMs / totalWindowMs;
      allocations.push({
        dateKey: cursorDateKey,
        overlapMs,
        overlapMinutes: overlapMs / MS_PER_MINUTE,
        calories: Math.round(calories * ratio),
      });
    }

    if (cursorDateKey === endDateKey) {
      break;
    }

    cursorDateKey = getDateKeyFromEpochMs(bounds.endMs);
  }

  return allocations;
};

export const getCarryoverForDateFromSessions = ({
  dateKey,
  sessions,
  carryoverMinutesField = 'epocCarryoverMinutes',
  caloriesField = 'epocCalories',
  resolveCarryover,
}) => {
  const targetDateKey = String(dateKey ?? '').trim();
  if (!targetDateKey) {
    return {
      totalCalories: 0,
      sourceSessionsCount: 0,
      allocations: [],
    };
  }

  const list = Array.isArray(sessions) ? sessions : [];
  const allocations = [];

  // Date-distance pre-filter: a session's carryover window starts when the
  // session ENDS, so only sessions that ended before the target day's end
  // (window starts inside the day) and within a carryover window's reach of
  // the day's start can possibly allocate into it. Without this, every
  // breakdown iterated (and re-priced via resolveCarryover) EVERY session in
  // history — O(all sessions) per TDEE call, growing with app usage.
  //
  // The bound must cover both carryover sources:
  //  - the resolved EPOC window (clamped by epoc.js to
  //    MAX_EPOC_CARRYOVER_WINDOW_MINUTES), and
  //  - a session-provided carryoverMinutesField value (legacy/stored), which
  //    is taken verbatim — so it widens the per-session bound when present.
  const targetBounds = getDateBoundsFromDateKey(targetDateKey);

  list.forEach((session) => {
    const window = resolveSessionWindowFromSession(session);
    if (!window) {
      return;
    }

    if (targetBounds) {
      if (window.endedAt >= targetBounds.endMs) {
        return;
      }

      const sessionOwnMinutes = Number(session?.[carryoverMinutesField]);
      const reachMinutes =
        Number.isFinite(sessionOwnMinutes) && sessionOwnMinutes > 0
          ? Math.max(sessionOwnMinutes, MAX_EPOC_CARRYOVER_WINDOW_MINUTES)
          : MAX_EPOC_CARRYOVER_WINDOW_MINUTES;

      if (
        window.endedAt + reachMinutes * MS_PER_MINUTE <=
        targetBounds.startMs
      ) {
        return;
      }
    }

    const resolvedCarryover =
      typeof resolveCarryover === 'function' ? resolveCarryover(session) : null;
    const carryoverMinutes = Number(
      resolvedCarryover?.windowMinutes ?? session?.[carryoverMinutesField]
    );
    const totalCalories = Number(
      resolvedCarryover?.totalCalories ?? session?.[caloriesField]
    );

    const sessionAllocations = allocateCarryoverByDate({
      anchorMs: window.endedAt,
      windowMinutes: carryoverMinutes,
      totalCalories,
    });

    const dateAllocation = sessionAllocations.find(
      (item) => item.dateKey === targetDateKey
    );

    if (!dateAllocation) {
      return;
    }

    allocations.push({
      ...dateAllocation,
      sessionId: session?.id ?? null,
      sessionType: session?.type ?? null,
      sourceDate: window.dateKey ?? null,
      carryoverWindowMinutes: carryoverMinutes,
      sourceCalories: totalCalories,
    });
  });

  return {
    totalCalories: allocations.reduce(
      (sum, allocation) => sum + (Number(allocation?.calories) || 0),
      0
    ),
    sourceSessionsCount: allocations.length,
    allocations,
  };
};
