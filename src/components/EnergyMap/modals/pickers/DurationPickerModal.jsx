import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Save } from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';
import {
  alignScrollContainerToElement,
  createPickerScrollHandler,
} from '../../../../utils/scroll';
import {
  normalizeDurationHours,
  roundDurationHours,
} from '../../../../utils/time';

const REPEATS = 20;

const alignToNearestValue = (container, value, behavior = 'smooth') => {
  if (!container) return;
  const elements = container.querySelectorAll(`[data-value="${value}"]`);
  if (elements.length === 0) return;

  const containerCenter = container.scrollTop + container.clientHeight / 2;
  let closest = null;
  let closestDist = Infinity;

  elements.forEach((el) => {
    const elCenter = el.offsetTop + el.offsetHeight / 2;
    const dist = Math.abs(containerCenter - elCenter);
    if (dist < closestDist) {
      closestDist = dist;
      closest = el;
    }
  });

  if (closest) {
    alignScrollContainerToElement(container, closest, behavior);
  }
};

const alignToMiddleRepeat = (container, value, behavior = 'smooth') => {
  if (!container) return;
  const elements = container.querySelectorAll(`[data-value="${value}"]`);
  if (elements.length === 0) return;

  const middleIdx = Math.floor(elements.length / 2);
  alignScrollContainerToElement(container, elements[middleIdx], behavior);
};

const clampMinutes = (minutes, step) => {
  if (!Number.isFinite(minutes)) {
    return 0;
  }

  const clamped = Math.min(Math.max(minutes, 0), 60 - step);
  const snapped = Math.round(clamped / step) * step;
  return Math.min(Math.max(snapped, 0), 60 - step);
};

const convertToPartsFromMinutes = (totalMinutes, maxHours, minuteStep) => {
  if (!Number.isFinite(totalMinutes)) {
    return { hours: 0, minutes: 0 };
  }

  const cappedMinutes = Math.min(Math.max(totalMinutes, 0), maxHours * 60);
  let hours = Math.floor(cappedMinutes / 60);
  let minutes = cappedMinutes - hours * 60;

  const remainder = minutes % minuteStep;
  if (remainder !== 0) {
    if (remainder >= minuteStep / 2) {
      minutes += minuteStep - remainder;
    } else {
      minutes -= remainder;
    }
  }

  if (minutes >= 60) {
    hours += 1;
    minutes -= 60;
  }

  if (hours > maxHours) {
    hours = maxHours;
    minutes = 0;
  }

  minutes = clampMinutes(minutes, minuteStep);

  return { hours, minutes };
};

const convertToPartsFromHours = (duration, maxHours, minuteStep) => {
  const normalized = normalizeDurationHours(duration);
  const totalMinutes = Math.round(normalized * 60);
  return convertToPartsFromMinutes(totalMinutes, maxHours, minuteStep);
};

/**
 * Unified duration picker modal.
 *
 * @param {'minutes' | 'hours'} mode
 *   - `'minutes'` — input via `minutes` prop (total minutes), saves total minutes.
 *   - `'hours'`   — input via `initialDuration` prop (decimal hours), saves decimal hours.
 * @param {number} maxHours      Maximum selectable hours (default 24 for minutes, 12 for hours).
 * @param {number} minuteStep    Step size for the minutes column (default 1 for minutes, 5 for hours).
 */
export const DurationPickerModal = ({
  isOpen,
  isClosing,
  title = 'Duration',
  mode = 'minutes',
  minutes: minutesProp = 0,
  initialDuration = 0,
  maxHours: maxHoursProp,
  minuteStep: minuteStepProp,
  onCancel,
  onSave,
}) => {
  const maxHours = maxHoursProp ?? (mode === 'hours' ? 12 : 24);
  const minuteStep = minuteStepProp ?? 1;

  const hourValues = useMemo(() => {
    const base = Array.from({ length: maxHours + 1 }, (_, i) => i);
    const repeated = [];
    for (let r = 0; r < REPEATS; r++) {
      for (const h of base) repeated.push(h);
    }
    return repeated;
  }, [maxHours]);

  const minuteValues = useMemo(() => {
    const base = Array.from(
      { length: Math.floor(60 / minuteStep) },
      (_, i) => i * minuteStep
    );
    const repeated = [];
    for (let r = 0; r < REPEATS; r++) {
      for (const m of base) repeated.push(m);
    }
    return repeated;
  }, [minuteStep]);

  const hoursRef = useRef(null);
  const minutesRef = useRef(null);
  const hoursTimeoutRef = useRef(null);
  const minutesTimeoutRef = useRef(null);
  const hasAlignedRef = useRef(false);
  const selectionRef = useRef({ hours: 0, minutes: 0 });

  const [selectedHours, setSelectedHours] = useState(0);
  const [selectedMinutes, setSelectedMinutes] = useState(0);

  const [handleHoursScroll, setHandleHoursScroll] = useState(() => () => {});
  const [handleMinutesScroll, setHandleMinutesScroll] = useState(
    () => () => {}
  );

  const applySelection = useCallback(
    (hours, minutesValue, behavior = 'instant') => {
      const normalizedHours = Math.min(Math.max(hours, 0), maxHours);
      const normalizedMinutes = clampMinutes(minutesValue, minuteStep);

      selectionRef.current = {
        hours: normalizedHours,
        minutes: normalizedMinutes,
      };

      setSelectedHours(normalizedHours);
      setSelectedMinutes(normalizedMinutes);

      if (hoursRef.current) {
        alignToNearestValue(
          hoursRef.current,
          normalizedHours.toString(),
          behavior
        );
      }
      if (minutesRef.current) {
        alignToNearestValue(
          minutesRef.current,
          normalizedMinutes.toString(),
          behavior
        );
      }
    },
    [maxHours, minuteStep]
  );

  useEffect(
    () => () => {
      clearTimeout(hoursTimeoutRef.current);
      clearTimeout(minutesTimeoutRef.current);
    },
    []
  );

  useEffect(() => {
    if (!isOpen) {
      hasAlignedRef.current = false;
      return undefined;
    }

    const behavior = hasAlignedRef.current ? 'smooth' : 'instant';
    hasAlignedRef.current = true;

    const parts =
      mode === 'hours'
        ? convertToPartsFromHours(initialDuration, maxHours, minuteStep)
        : convertToPartsFromMinutes(minutesProp, maxHours, minuteStep);

    const frame = requestAnimationFrame(() => {
      selectionRef.current = { hours: parts.hours, minutes: parts.minutes };
      setSelectedHours(parts.hours);
      setSelectedMinutes(parts.minutes);
      if (hoursRef.current) {
        alignToMiddleRepeat(hoursRef.current, parts.hours.toString(), behavior);
      }
      if (minutesRef.current) {
        alignToMiddleRepeat(
          minutesRef.current,
          parts.minutes.toString(),
          behavior
        );
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [isOpen, minutesProp, initialDuration, mode, maxHours, minuteStep]);

  const handleHoursChange = useCallback(
    (nextHours) => {
      const clampedHours = Math.min(Math.max(nextHours, 0), maxHours);

      selectionRef.current = {
        hours: clampedHours,
        minutes: selectionRef.current.minutes,
      };

      setSelectedHours(clampedHours);
    },
    [maxHours]
  );

  const handleMinutesChange = useCallback(
    (nextMinutes) => {
      const sanitizedMinutes = clampMinutes(nextMinutes, minuteStep);

      selectionRef.current = {
        hours: selectionRef.current.hours,
        minutes: sanitizedMinutes,
      };

      setSelectedMinutes(sanitizedMinutes);
    },
    [minuteStep]
  );

  useEffect(() => {
    setHandleHoursScroll(() =>
      createPickerScrollHandler(
        hoursRef,
        hoursTimeoutRef,
        (val) => parseInt(val, 10),
        handleHoursChange
      )
    );
  }, [handleHoursChange]);

  useEffect(() => {
    setHandleMinutesScroll(() =>
      createPickerScrollHandler(
        minutesRef,
        minutesTimeoutRef,
        (val) => parseInt(val, 10),
        handleMinutesChange
      )
    );
  }, [handleMinutesChange]);

  const outputValue = useMemo(() => {
    const totalMinutes = selectedHours * 60 + selectedMinutes;
    if (mode === 'hours') {
      return roundDurationHours(totalMinutes / 60);
    }
    return totalMinutes;
  }, [selectedHours, selectedMinutes, mode]);

  const canSave = outputValue > 0;

  const handleSave = useCallback(() => {
    if (outputValue <= 0) return;
    onSave?.(outputValue);
  }, [onSave, outputValue]);

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      contentClassName="p-6 w-full max-w-sm"
    >
      <h3 className="text-foreground font-bold text-xl mb-6 text-center">
        {title}
      </h3>

      <div className="flex gap-5">
        <div className="flex-1">
          <p className="text-muted text-xs text-center mb-2 uppercase tracking-wide">
            Hours
          </p>
          <div className="relative h-40 overflow-hidden rounded-xl bg-surface/80">
            <div className="absolute inset-0 pointer-events-none z-10">
              <div className="h-16 bg-gradient-to-b from-surface to-transparent" />
              <div className="h-16 bg-transparent" />
              <div className="h-16 bg-gradient-to-t from-surface to-transparent" />
            </div>
            <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 h-16 border-y-2 border-blue-400/70 pointer-events-none z-10" />

            <div
              ref={hoursRef}
              className="h-full overflow-y-auto overflow-x-hidden scrollbar-hide touch-action-pan-y"
              onScroll={handleHoursScroll}
            >
              <div className="h-16" />
              {hourValues.map((hour, index) => (
                <div
                  key={index}
                  data-value={hour}
                  onClick={() =>
                    applySelection(hour, selectionRef.current.minutes, 'smooth')
                  }
                  className={`h-16 flex items-center justify-center text-2xl font-bold snap-center cursor-pointer transition-all ${
                    selectedHours === hour
                      ? 'text-foreground scale-110'
                      : 'text-muted'
                  }`}
                >
                  {hour}
                </div>
              ))}
              <div className="h-16" />
            </div>
          </div>
        </div>

        <div className="flex-1">
          <p className="text-muted text-xs text-center mb-2 uppercase tracking-wide">
            Minutes
          </p>
          <div className="relative h-40 overflow-hidden rounded-xl bg-surface/80">
            <div className="absolute inset-0 pointer-events-none z-10">
              <div className="h-16 bg-gradient-to-b from-surface to-transparent" />
              <div className="h-16 bg-transparent" />
              <div className="h-16 bg-gradient-to-t from-surface to-transparent" />
            </div>
            <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 h-16 border-y-2 border-blue-400/70 pointer-events-none z-10" />

            <div
              ref={minutesRef}
              className="h-full overflow-y-auto overflow-x-hidden scrollbar-hide touch-action-pan-y"
              onScroll={handleMinutesScroll}
            >
              <div className="h-16" />
              {minuteValues.map((minute, index) => {
                return (
                  <div
                    key={index}
                    data-value={minute}
                    onClick={() => {
                      applySelection(
                        selectionRef.current.hours,
                        minute,
                        'smooth'
                      );
                    }}
                    className={`h-16 flex items-center justify-center text-2xl font-bold snap-center cursor-pointer transition-all ${
                      selectedMinutes === minute
                        ? 'text-foreground scale-110'
                        : 'text-muted'
                    }`}
                  >
                    {minute.toString().padStart(2, '0')}
                  </div>
                );
              })}
              <div className="h-16" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-3 mt-6">
        <button
          onClick={onCancel}
          type="button"
          className="flex-1 bg-surface-highlight active:bg-surface-highlight/80 text-foreground px-6 py-3 rounded-lg transition-all active:scale-95 font-medium focus-ring press-feedback"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          type="button"
          disabled={!canSave}
          className={`flex-1 text-white px-6 py-3 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-medium focus-ring press-feedback ${
            canSave
              ? 'bg-blue-600 active:bg-blue-700'
              : 'bg-blue-600/60 cursor-not-allowed opacity-70'
          }`}
        >
          <Save size={20} />
          Save
        </button>
      </div>
    </ModalShell>
  );
};

/** @deprecated Use DurationPickerModal with mode="minutes" instead */
export const CardioDurationPickerModal = (props) => (
  <DurationPickerModal {...props} mode="minutes" />
);

/** @deprecated Use DurationPickerModal with mode="hours" instead */
export const TrainingDurationPickerModal = (props) => (
  <DurationPickerModal {...props} mode="hours" />
);
