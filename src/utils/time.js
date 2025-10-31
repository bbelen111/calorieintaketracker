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
