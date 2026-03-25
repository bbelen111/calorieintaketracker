export const normalizeDurationHours = (value) => {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return value;
};

export const roundDurationHours = (value, decimals = 2) => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

export const formatDurationLabel = (value) => {
  const normalized = normalizeDurationHours(value);
  const totalMinutes = Math.round(normalized * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (hours > 0) {
    return `${hours}h`;
  }

  return `${minutes}m`;
};

export const splitDurationIntoParts = (value) => {
  const normalized = normalizeDurationHours(value);
  const totalMinutes = Math.round(normalized * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return {
    hours,
    minutes,
  };
};

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_OF_DAY_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MS_PER_MINUTE = 60 * 1000;

export const normalizeTimeOfDay = (value, fallback = null) => {
  const normalized = String(value ?? '').trim();
  if (TIME_OF_DAY_REGEX.test(normalized)) {
    return normalized;
  }

  return fallback;
};

export const getCurrentLocalTimeString = (date = new Date()) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '12:00';
  }

  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

export const getDateKeyFromEpochMs = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  const date = new Date(Math.round(numeric));
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getTimeOfDayFromEpochMs = (value, fallback = null) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }

  return getCurrentLocalTimeString(new Date(Math.round(numeric)));
};

export const getEpochMsFromDateAndTime = ({ dateKey, timeOfDay }) => {
  const normalizedDate = String(dateKey ?? '').trim();
  if (!DATE_KEY_REGEX.test(normalizedDate)) {
    return null;
  }

  const normalizedTime = normalizeTimeOfDay(timeOfDay, '12:00');
  if (!normalizedTime) {
    return null;
  }

  const dateTime = new Date(`${normalizedDate}T${normalizedTime}:00`);
  if (Number.isNaN(dateTime.getTime())) {
    return null;
  }

  return dateTime.getTime();
};

export const deriveSessionTimestamps = ({
  dateKey,
  timeOfDay,
  durationMinutes,
  fallbackStartedAt,
}) => {
  const duration = Number(durationMinutes);
  if (!Number.isFinite(duration) || duration <= 0) {
    return {
      startTime: normalizeTimeOfDay(timeOfDay, '12:00'),
      startedAt: null,
      endedAt: null,
    };
  }

  const resolvedDateKey =
    String(dateKey ?? '').trim() || getDateKeyFromEpochMs(fallbackStartedAt);
  const resolvedStartTime = normalizeTimeOfDay(
    timeOfDay,
    getTimeOfDayFromEpochMs(fallbackStartedAt, '12:00')
  );

  const startedAt = getEpochMsFromDateAndTime({
    dateKey: resolvedDateKey,
    timeOfDay: resolvedStartTime,
  });

  if (!Number.isFinite(startedAt)) {
    return {
      startTime: resolvedStartTime,
      startedAt: null,
      endedAt: null,
    };
  }

  const endedAt = Math.round(startedAt + duration * MS_PER_MINUTE);

  return {
    startTime: resolvedStartTime,
    startedAt,
    endedAt,
  };
};
