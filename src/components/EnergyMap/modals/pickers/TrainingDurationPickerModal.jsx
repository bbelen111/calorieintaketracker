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
  alignScrollContainerToValue,
  createPickerScrollHandler,
} from '../../../../utils/scroll';
import {
  normalizeDurationHours,
  roundDurationHours,
} from '../../../../utils/time';

const MAX_HOURS = 12;
const MINUTE_STEP = 5;
const HOUR_VALUES = Array.from({ length: MAX_HOURS + 1 }, (_, index) => index);
const MINUTE_VALUES = Array.from(
  { length: Math.floor(60 / MINUTE_STEP) },
  (_, index) => index * MINUTE_STEP
);

const clampMinutes = (minutes) => {
  if (!Number.isFinite(minutes)) {
    return 0;
  }

  const clamped = Math.min(Math.max(minutes, 0), 60 - MINUTE_STEP);
  const snapped = Math.round(clamped / MINUTE_STEP) * MINUTE_STEP;
  return Math.min(Math.max(snapped, 0), 60 - MINUTE_STEP);
};

const convertDurationToParts = (duration) => {
  const normalized = normalizeDurationHours(duration);
  const totalMinutes = Math.round(normalized * 60);

  let hours = Math.floor(totalMinutes / 60);
  let minutes = totalMinutes - hours * 60;

  if (minutes % MINUTE_STEP !== 0) {
    const remainder = minutes % MINUTE_STEP;
    if (remainder >= MINUTE_STEP / 2) {
      minutes += MINUTE_STEP - remainder;
    } else {
      minutes -= remainder;
    }
  }

  if (minutes >= 60) {
    hours += 1;
    minutes -= 60;
  }

  if (hours > MAX_HOURS) {
    hours = MAX_HOURS;
    minutes = 0;
  }

  if (hours === MAX_HOURS) {
    minutes = 0;
  } else {
    minutes = clampMinutes(minutes);
  }

  return {
    hours,
    minutes,
  };
};

export const TrainingDurationPickerModal = ({
  isOpen,
  isClosing,
  title = 'Training Duration',
  initialDuration = 0,
  onCancel,
  onSave,
}) => {
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

  const applySelection = useCallback((hours, minutes, behavior = 'instant') => {
    const normalizedHours = Math.min(Math.max(hours, 0), MAX_HOURS);
    const normalizedMinutes =
      normalizedHours === MAX_HOURS ? 0 : clampMinutes(minutes);

    selectionRef.current = {
      hours: normalizedHours,
      minutes: normalizedMinutes,
    };
    setSelectedHours(normalizedHours);
    setSelectedMinutes(normalizedMinutes);

    if (hoursRef.current) {
      alignScrollContainerToValue(
        hoursRef.current,
        normalizedHours.toString(),
        behavior
      );
    }
    if (minutesRef.current) {
      alignScrollContainerToValue(
        minutesRef.current,
        normalizedMinutes.toString(),
        behavior
      );
    }
  }, []);

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

    const parts = convertDurationToParts(initialDuration);

    const frame = requestAnimationFrame(() => {
      selectionRef.current = { hours: parts.hours, minutes: parts.minutes };
      setSelectedHours(parts.hours);
      setSelectedMinutes(parts.minutes);
      if (hoursRef.current) {
        alignScrollContainerToValue(
          hoursRef.current,
          parts.hours.toString(),
          behavior
        );
      }
      if (minutesRef.current) {
        alignScrollContainerToValue(
          minutesRef.current,
          parts.minutes.toString(),
          behavior
        );
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [initialDuration, isOpen]);

  const handleHoursChange = useCallback((nextHours) => {
    const clampedHours = Math.min(Math.max(nextHours, 0), MAX_HOURS);
    const nextMinutes =
      clampedHours === MAX_HOURS ? 0 : selectionRef.current.minutes;

    selectionRef.current = {
      hours: clampedHours,
      minutes: nextMinutes,
    };

    setSelectedHours(clampedHours);
    setSelectedMinutes(nextMinutes);

    if (clampedHours === MAX_HOURS && minutesRef.current) {
      alignScrollContainerToValue(minutesRef.current, '0', 'smooth');
    }
  }, []);

  const handleMinutesChange = useCallback((nextMinutes) => {
    const sanitizedMinutes =
      selectionRef.current.hours === MAX_HOURS ? 0 : clampMinutes(nextMinutes);

    selectionRef.current = {
      hours: selectionRef.current.hours,
      minutes: sanitizedMinutes,
    };

    setSelectedMinutes(sanitizedMinutes);
  }, []);

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

  const decimalDuration = useMemo(() => {
    const totalMinutes = selectedHours * 60 + selectedMinutes;
    return roundDurationHours(totalMinutes / 60);
  }, [selectedHours, selectedMinutes]);

  const handleSave = useCallback(() => {
    onSave?.(decimalDuration);
  }, [onSave, decimalDuration]);

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
              {HOUR_VALUES.map((hour) => (
                <div
                  key={hour}
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
              {MINUTE_VALUES.map((minute) => {
                const isDisabled = selectedHours === MAX_HOURS && minute !== 0;
                return (
                  <div
                    key={minute}
                    data-value={minute}
                    onClick={() => {
                      if (isDisabled) return;
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
                    } ${isDisabled ? 'opacity-40 pointer-events-none' : ''}`}
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
          className="flex-1 bg-blue-600 active:bg-blue-700 text-white px-6 py-3 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-medium focus-ring press-feedback"
        >
          <Save size={20} />
          Save
        </button>
      </div>
    </ModalShell>
  );
};
