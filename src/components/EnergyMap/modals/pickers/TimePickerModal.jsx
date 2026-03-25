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

const REPEATS = 20;

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
  const h = String(clampHours(hours)).padStart(2, '0');
  const m = String(clampMinutes(minutes)).padStart(2, '0');
  return `${h}:${m} ${normalizeToAmPm(amPm).toUpperCase()}`;
};

export const TimePickerModal = ({
  isOpen,
  isClosing,
  title = 'Time',
  value = '12:00',
  onCancel,
  onSave,
}) => {
  const scrollRefsRef = useRef({ amPm: null, hours: null, minutes: null });
  const timeoutsRef = useRef({ amPm: null, hours: null, minutes: null });
  const hasAlignedRef = useRef(false);

  const initialParsed = useMemo(() => parseTimeString(value), [value]);

  const [selectedAmPm, setSelectedAmPm] = useState(initialParsed.amPm);
  const [selectedHours, setSelectedHours] = useState(initialParsed.hours);
  const [selectedMinutes, setSelectedMinutes] = useState(initialParsed.minutes);

  const amPmValues = useMemo(() => {
    const base = ['am', 'pm'];
    const repeated = [];
    for (let r = 0; r < REPEATS; r++) {
      for (const ap of base) repeated.push(ap);
    }
    return repeated;
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

  useEffect(() => {
    const refs = timeoutsRef.current;
    return () => {
      clearTimeout(refs.amPm);
      clearTimeout(refs.hours);
      clearTimeout(refs.minutes);
    };
  }, []);

  useEffect(() => {
    setHandleAmPmScroll(
      () =>
        createPickerScrollHandler(
          scrollRefsRef.current.amPm,
          timeoutsRef.current,
          (val) => val,
          (val) => setSelectedAmPm(normalizeToAmPm(val))
        ) || (() => {})
    );
  }, []);

  useEffect(() => {
    setHandleHoursScroll(
      () =>
        createPickerScrollHandler(
          scrollRefsRef.current.hours,
          timeoutsRef.current,
          (val) => parseInt(val, 10),
          (val) => setSelectedHours(clampHours(val))
        ) || (() => {})
    );
  }, []);

  useEffect(() => {
    setHandleMinutesScroll(
      () =>
        createPickerScrollHandler(
          scrollRefsRef.current.minutes,
          timeoutsRef.current,
          (val) => parseInt(val, 10),
          (val) => setSelectedMinutes(clampMinutes(val))
        ) || (() => {})
    );
  }, []);

  useEffect(() => {
    if (!isOpen) {
      hasAlignedRef.current = false;
      return undefined;
    }

    const behavior = hasAlignedRef.current ? 'smooth' : 'instant';
    hasAlignedRef.current = true;

    const frame = requestAnimationFrame(() => {
      if (scrollRefsRef.current.amPm) {
        alignScrollContainerToValue(
          scrollRefsRef.current.amPm,
          selectedAmPm,
          behavior
        );
      }
      if (scrollRefsRef.current.hours) {
        alignScrollContainerToValue(
          scrollRefsRef.current.hours,
          String(selectedHours),
          behavior
        );
      }
      if (scrollRefsRef.current.minutes) {
        alignScrollContainerToValue(
          scrollRefsRef.current.minutes,
          String(selectedMinutes).padStart(2, '0'),
          behavior
        );
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [isOpen, selectedAmPm, selectedHours, selectedMinutes]);

  const handleItemClick = useCallback((type, value) => {
    if (type === 'amPm') {
      setSelectedAmPm(normalizeToAmPm(value));
      if (scrollRefsRef.current.amPm) {
        alignScrollContainerToValue(
          scrollRefsRef.current.amPm,
          value,
          'smooth'
        );
      }
    } else if (type === 'hours') {
      const clamped = clampHours(value);
      setSelectedHours(clamped);
      if (scrollRefsRef.current.hours) {
        alignScrollContainerToValue(
          scrollRefsRef.current.hours,
          String(clamped),
          'smooth'
        );
      }
    } else if (type === 'minutes') {
      const clamped = clampMinutes(value);
      setSelectedMinutes(clamped);
      if (scrollRefsRef.current.minutes) {
        alignScrollContainerToValue(
          scrollRefsRef.current.minutes,
          String(clamped).padStart(2, '0'),
          'smooth'
        );
      }
    }
  }, []);

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
      <p className="text-muted text-xs text-center mb-4 uppercase tracking-wide">
        12-Hour Format
      </p>

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
            <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 h-16 border-y-2 border-blue-400/70 pointer-events-none z-10" />

            <div
              ref={(el) => {
                scrollRefsRef.current.hours = el;
              }}
              className="h-full overflow-y-auto overflow-x-hidden scrollbar-hide touch-action-pan-y"
              onScroll={handleHoursScroll}
            >
              <div className="h-16" />
              {hoursValues.map((hour) => {
                const isSelected = hour === selectedHours;
                return (
                  <div
                    key={`${hour}-${hoursValues.indexOf(hour)}`}
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
            <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 h-16 border-y-2 border-blue-400/70 pointer-events-none z-10" />

            <div
              ref={(el) => {
                scrollRefsRef.current.minutes = el;
              }}
              className="h-full overflow-y-auto overflow-x-hidden scrollbar-hide touch-action-pan-y"
              onScroll={handleMinutesScroll}
            >
              <div className="h-16" />
              {minutesValues.map((minute) => {
                const isSelected = minute === selectedMinutes;
                const formatted = String(minute).padStart(2, '0');
                return (
                  <div
                    key={`${minute}-${minutesValues.indexOf(minute)}`}
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
            <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 h-16 border-y-2 border-blue-400/70 pointer-events-none z-10" />

            <div
              ref={(el) => {
                scrollRefsRef.current.amPm = el;
              }}
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
          className="flex-1 bg-accent-blue active:bg-accent-blue/90 text-white px-6 py-3 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-medium focus-ring press-feedback"
        >
          <Save size={20} />
          Save
        </button>
      </div>
    </ModalShell>
  );
};
