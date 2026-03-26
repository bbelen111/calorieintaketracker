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

const clampHours = (value) => {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.min(Math.max(Math.round(value), 1), 12);
};

const clampMinutes = (value) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(Math.round(value), 0), 59);
};

const normalizeToAmPm = (value) => {
  const str = String(value ?? '')
    .trim()
    .toLowerCase();
  return str === 'pm' ? 'pm' : 'am';
};

const parseTimeString = (
  timeStr,
  fallback = { amPm: 'am', hours: 12, minutes: 0 }
) => {
  const str = String(timeStr ?? '')
    .trim()
    .toLowerCase();

  if (!str) return fallback;

  // Try to parse formats like "14:30", "2:30 pm", "2:30pm", etc.
  const match = str.match(/^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/i);
  if (!match) return fallback;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  let amPm = match[3]?.toLowerCase() ?? (hours >= 12 ? 'pm' : 'am');

  // If 24-hour format was provided, convert to 12-hour
  if (hours === 0) {
    hours = 12;
    amPm = 'am';
  } else if (hours > 12) {
    hours = hours - 12;
    amPm = 'pm';
  } else if (hours === 12) {
    amPm = 'pm';
  }

  return {
    amPm,
    hours: clampHours(hours),
    minutes: clampMinutes(minutes),
  };
};

const formatTimeString = (amPm, hours, minutes) => {
  const normalizedAmPm = normalizeToAmPm(amPm);
  const normalizedHours = clampHours(hours);
  const normalizedMinutes = clampMinutes(minutes);

  let hours24 = normalizedHours % 12;
  if (normalizedAmPm === 'pm') {
    hours24 += 12;
  }

  const h = String(hours24).padStart(2, '0');
  const m = String(normalizedMinutes).padStart(2, '0');
  return `${h}:${m}`;
};

export const TimePickerModal = ({
  isOpen,
  isClosing,
  title = 'Time',
  value = '12:00',
  onCancel,
  onSave,
}) => {
  const amPmRef = useRef(null);
  const hoursRef = useRef(null);
  const minutesRef = useRef(null);

  const amPmTimeoutRef = useRef(null);
  const hoursTimeoutRef = useRef(null);
  const minutesTimeoutRef = useRef(null);

  const selectionRef = useRef({ amPm: 'am', hours: 12, minutes: 0 });
  const hasAlignedRef = useRef(false);

  const initialParsed = useMemo(() => parseTimeString(value), [value]);

  const [selectedAmPm, setSelectedAmPm] = useState(initialParsed.amPm);
  const [selectedHours, setSelectedHours] = useState(initialParsed.hours);
  const [selectedMinutes, setSelectedMinutes] = useState(initialParsed.minutes);

  const amPmValues = useMemo(() => {
    return ['am', 'pm'];
  }, []);

  const hoursValues = useMemo(() => {
    const base = Array.from({ length: 12 }, (_, i) => i + 1);
    const repeated = [];
    for (let r = 0; r < REPEATS; r++) {
      for (const h of base) repeated.push(h);
    }
    return repeated;
  }, []);

  const minutesValues = useMemo(() => {
    const base = Array.from({ length: 60 }, (_, i) => i);
    const repeated = [];
    for (let r = 0; r < REPEATS; r++) {
      for (const m of base) repeated.push(m);
    }
    return repeated;
  }, []);

  const [handleAmPmScroll, setHandleAmPmScroll] = useState(() => () => {});
  const [handleHoursScroll, setHandleHoursScroll] = useState(() => () => {});
  const [handleMinutesScroll, setHandleMinutesScroll] = useState(
    () => () => {}
  );

  const applySelection = useCallback(
    (amPm, hours, minutes, behavior = 'instant') => {
      const normalizedAmPm = normalizeToAmPm(amPm);
      const normalizedHours = clampHours(hours);
      const normalizedMinutes = clampMinutes(minutes);

      selectionRef.current = {
        amPm: normalizedAmPm,
        hours: normalizedHours,
        minutes: normalizedMinutes,
      };

      setSelectedAmPm(normalizedAmPm);
      setSelectedHours(normalizedHours);
      setSelectedMinutes(normalizedMinutes);

      if (amPmRef.current) {
        alignToNearestValue(amPmRef.current, normalizedAmPm, behavior);
      }
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
          normalizedMinutes.toString().padStart(2, '0'),
          behavior
        );
      }
    },
    []
  );

  const handleAmPmChange = useCallback((nextAmPm) => {
    const normalized = normalizeToAmPm(nextAmPm);
    selectionRef.current = {
      ...selectionRef.current,
      amPm: normalized,
    };
    setSelectedAmPm(normalized);
  }, []);

  const handleHoursChange = useCallback((nextHours) => {
    const normalized = clampHours(nextHours);
    selectionRef.current = {
      ...selectionRef.current,
      hours: normalized,
    };
    setSelectedHours(normalized);
  }, []);

  const handleMinutesChange = useCallback((nextMinutes) => {
    const normalized = clampMinutes(nextMinutes);
    selectionRef.current = {
      ...selectionRef.current,
      minutes: normalized,
    };
    setSelectedMinutes(normalized);
  }, []);

  useEffect(() => {
    setHandleAmPmScroll(() =>
      createPickerScrollHandler(
        amPmRef,
        amPmTimeoutRef,
        (val) => normalizeToAmPm(val),
        handleAmPmChange
      )
    );
  }, [handleAmPmChange]);

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

  useEffect(() => {
    if (!isOpen) {
      hasAlignedRef.current = false;
      return undefined;
    }

    const behavior = hasAlignedRef.current ? 'smooth' : 'instant';
    hasAlignedRef.current = true;

    const parsed = parseTimeString(value);

    const frame = requestAnimationFrame(() => {
      selectionRef.current = {
        amPm: parsed.amPm,
        hours: parsed.hours,
        minutes: parsed.minutes,
      };

      setSelectedAmPm(parsed.amPm);
      setSelectedHours(parsed.hours);
      setSelectedMinutes(parsed.minutes);

      if (amPmRef.current) {
        alignToMiddleRepeat(amPmRef.current, parsed.amPm, behavior);
      }
      if (hoursRef.current) {
        alignToMiddleRepeat(
          hoursRef.current,
          parsed.hours.toString(),
          behavior
        );
      }
      if (minutesRef.current) {
        alignToMiddleRepeat(
          minutesRef.current,
          parsed.minutes.toString().padStart(2, '0'),
          behavior
        );
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [isOpen, value]);

  const handleItemClick = useCallback(
    (type, value) => {
      if (type === 'amPm') {
        applySelection(
          value,
          selectionRef.current.hours,
          selectionRef.current.minutes,
          'smooth'
        );
      } else if (type === 'hours') {
        applySelection(
          selectionRef.current.amPm,
          value,
          selectionRef.current.minutes,
          'smooth'
        );
      } else if (type === 'minutes') {
        applySelection(
          selectionRef.current.amPm,
          selectionRef.current.hours,
          value,
          'smooth'
        );
      }
    },
    [applySelection]
  );

  const handleSave = useCallback(() => {
    const timeStr = formatTimeString(
      selectedAmPm,
      selectedHours,
      selectedMinutes
    );
    onSave?.(timeStr);
  }, [onSave, selectedAmPm, selectedHours, selectedMinutes]);

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      overlayClassName="z-[85]"
      contentClassName="p-6 w-full max-w-sm"
    >
      <h3 className="text-foreground font-bold text-xl mb-4 text-center">
        {title}
      </h3>

      <div className="flex gap-2 mb-6">
        {/* Hours Column */}
        <div className="flex-1">
          <label className="text-muted text-xs text-center block mb-2 uppercase">
            Hours
          </label>
          <div className="relative h-48 overflow-hidden rounded-xl bg-surface/80">
            <div className="absolute inset-0 pointer-events-none z-10">
              <div className="h-16 bg-gradient-to-b from-surface to-transparent" />
              <div className="h-16 bg-transparent" />
              <div className="h-16 bg-gradient-to-t from-surface to-transparent" />
            </div>
            <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 h-16 border-y-2 border-accent-blue/70 pointer-events-none z-10" />

            <div
              ref={hoursRef}
              className="h-full overflow-y-auto overflow-x-hidden scrollbar-hide touch-action-pan-y"
              onScroll={handleHoursScroll}
            >
              <div className="h-16" />
              {hoursValues.map((hour, idx) => {
                const isSelected = hour === selectedHours;
                return (
                  <div
                    key={`${hour}-${idx}`}
                    data-value={hour}
                    onClick={() => handleItemClick('hours', hour)}
                    className={`h-16 flex items-center justify-center text-2xl font-semibold snap-center cursor-pointer transition-all ${
                      isSelected ? 'text-foreground scale-110' : 'text-muted'
                    }`}
                  >
                    {String(hour).padStart(2, '0')}
                  </div>
                );
              })}
              <div className="h-16" />
            </div>
          </div>
        </div>

        {/* Minutes Column */}
        <div className="flex-1">
          <label className="text-muted text-xs text-center block mb-2 uppercase">
            Minutes
          </label>
          <div className="relative h-48 overflow-hidden rounded-xl bg-surface/80">
            <div className="absolute inset-0 pointer-events-none z-10">
              <div className="h-16 bg-gradient-to-b from-surface to-transparent" />
              <div className="h-16 bg-transparent" />
              <div className="h-16 bg-gradient-to-t from-surface to-transparent" />
            </div>
            <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 h-16 border-y-2 border-accent-blue/70 pointer-events-none z-10" />

            <div
              ref={minutesRef}
              className="h-full overflow-y-auto overflow-x-hidden scrollbar-hide touch-action-pan-y"
              onScroll={handleMinutesScroll}
            >
              <div className="h-16" />
              {minutesValues.map((minute, idx) => {
                const isSelected = minute === selectedMinutes;
                const formatted = String(minute).padStart(2, '0');
                return (
                  <div
                    key={`${minute}-${idx}`}
                    data-value={formatted}
                    onClick={() => handleItemClick('minutes', minute)}
                    className={`h-16 flex items-center justify-center text-2xl font-semibold snap-center cursor-pointer transition-all ${
                      isSelected ? 'text-foreground scale-110' : 'text-muted'
                    }`}
                  >
                    {formatted}
                  </div>
                );
              })}
              <div className="h-16" />
            </div>
          </div>
        </div>

        {/* AM/PM Column */}
        <div className="flex-1">
          <label className="text-muted text-xs text-center block mb-2 uppercase">
            Period
          </label>
          <div className="relative h-48 overflow-hidden rounded-xl bg-surface/80">
            <div className="absolute inset-0 pointer-events-none z-10">
              <div className="h-16 bg-gradient-to-b from-surface to-transparent" />
              <div className="h-16 bg-transparent" />
              <div className="h-16 bg-gradient-to-t from-surface to-transparent" />
            </div>
            <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 h-16 border-y-2 border-accent-blue/70 pointer-events-none z-10" />

            <div
              ref={amPmRef}
              className="h-full overflow-y-auto overflow-x-hidden scrollbar-hide touch-action-pan-y"
              onScroll={handleAmPmScroll}
            >
              <div className="h-16" />
              {amPmValues.map((ap, idx) => {
                const isSelected = ap === selectedAmPm;
                return (
                  <div
                    key={`${ap}-${idx}`}
                    data-value={ap}
                    onClick={() => handleItemClick('amPm', ap)}
                    className={`h-16 flex items-center justify-center text-2xl font-semibold snap-center cursor-pointer transition-all ${
                      isSelected ? 'text-foreground scale-110' : 'text-muted'
                    }`}
                  >
                    {ap.toUpperCase()}
                  </div>
                );
              })}
              <div className="h-16" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
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
          className="flex-1 bg-accent-blue active:bg-accent-blue/90 text-primary-foreground px-6 py-3 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-medium focus-ring press-feedback"
        >
          <Save size={20} />
          Save
        </button>
      </div>
    </ModalShell>
  );
};
