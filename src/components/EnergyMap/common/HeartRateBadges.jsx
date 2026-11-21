import React from 'react';
import { Bluetooth, Watch } from 'lucide-react';
import { HEART_RATE_ZONE_CLASSES } from '../../../constants/health/heartRate';

/**
 * "Z3 · 68% HRR" chip. `zone` comes from getHeartRateZone(), `load` from
 * describeHeartRateLoad(); either may be null (the chip then shows what it has
 * or nothing at all).
 */
export const HeartRateZoneChip = ({ zone, load, className = '' }) => {
  if (!zone && !load) {
    return null;
  }
  const classes = zone ? HEART_RATE_ZONE_CLASSES[zone.key] : null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        classes
          ? `${classes.soft} ${classes.text}`
          : 'bg-surface-highlight text-muted'
      } ${className}`}
    >
      {zone ? `Z${zone.index}` : 'Below Z1'}
      {load && (
        <span className="font-medium opacity-90">
          · {load.percent}% {load.basis === 'HRR' ? 'HRR' : 'max'}
        </span>
      )}
    </span>
  );
};

/** Small glyph marking where a session's heart rate came from. */
export const HeartRateSourceGlyph = ({ source, size = 12, className = '' }) => {
  if (source === 'healthConnect') {
    return (
      <Watch
        size={size}
        aria-label="Heart rate from watch"
        className={`text-muted ${className}`}
      />
    );
  }
  if (source === 'ble') {
    return (
      <Bluetooth
        size={size}
        aria-label="Heart rate from sensor"
        className={`text-muted ${className}`}
      />
    );
  }
  return null;
};

/** Five stacked bars of time-in-zone (seconds per zone). */
export const HeartRateZoneBars = ({ zoneSeconds, className = '' }) => {
  if (!Array.isArray(zoneSeconds) || zoneSeconds.length !== 5) {
    return null;
  }
  const total = zoneSeconds.reduce(
    (sum, value) => sum + (Number(value) || 0),
    0
  );
  if (total <= 0) {
    return null;
  }
  return (
    <div
      className={`flex h-2 w-full overflow-hidden rounded-full bg-surface-highlight ${className}`}
      role="img"
      aria-label="Time in heart-rate zones"
    >
      {zoneSeconds.map((seconds, index) => {
        const share = (Number(seconds) || 0) / total;
        if (share <= 0) {
          return null;
        }
        const zoneKey = `z${index + 1}`;
        return (
          <span
            key={zoneKey}
            className={HEART_RATE_ZONE_CLASSES[zoneKey].bg}
            style={{ width: `${share * 100}%` }}
          />
        );
      })}
    </div>
  );
};
