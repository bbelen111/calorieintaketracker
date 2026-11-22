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
} from '../../../../utils/visuals/scroll';
import {
  DEFAULT_SESSION_HEART_RATE_BPM,
  SESSION_HEART_RATE_MAX_BPM,
  SESSION_HEART_RATE_MIN_BPM,
} from '../../../../constants/health/heartRate';

const STEP = 1;

/**
 * Where the wheel opens. An unset value ('' / null / undefined / 0) opens at
 * the default rather than the floor: `Number('') === 0` used to clamp every
 * fresh form to 60 bpm, the least likely exercise average.
 */
export const resolveInitialHeartRate = (
  value,
  defaultValue = DEFAULT_SESSION_HEART_RATE_BPM
) => {
  const numeric = Number(value);
  if (
    value === '' ||
    value == null ||
    !Number.isFinite(numeric) ||
    numeric <= 0
  ) {
    return defaultValue;
  }
  return numeric;
};

const clampBpm = (value, min, max) => {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(Math.round(value), min), max);
};

const resolveWheelValue = (value, defaultValue, min, max) =>
  clampBpm(resolveInitialHeartRate(value, defaultValue), min, max);

/**
 * The heart-rate wheel on its own, so it can sit inside a larger modal (the
 * resting-HR entry modal) the way `BodyFatPicker` / `WeightPicker` do.
 * Defaults to the session-average range; callers pass their own `min` / `max` /
 * `defaultValue` (bounds from constants/health/heartRate.js).
 *
 * `onChange` fires for every scroll frame and click with the clamped bpm. The
 * wheel keeps its own live selection, and a `value` that merely echoes that
 * selection back is not re-aligned (that would fight the finger mid-gesture);
 * only a genuinely different `value` (e.g. a camera reading) moves the wheel.
 */
export const HeartRatePicker = ({
  value,
  onChange,
  min = SESSION_HEART_RATE_MIN_BPM,
  max = SESSION_HEART_RATE_MAX_BPM,
  defaultValue = DEFAULT_SESSION_HEART_RATE_BPM,
}) => {
  const scrollRef = useRef(null);
  const timeoutRef = useRef(null);
  const hasAlignedRef = useRef(false);

  const bpmValues = useMemo(
    () =>
      Array.from({ length: max - min + 1 }, (_, index) => min + index * STEP),
    [min, max]
  );

  const normalizedValue = useMemo(
    () => resolveWheelValue(value, defaultValue, min, max),
    [value, defaultValue, min, max]
  );

  const [selectedValue, setSelectedValue] = useState(normalizedValue);
  const selectedRef = useRef(normalizedValue);

  const commitSelection = useCallback(
    (nextValue) => {
      const clamped = clampBpm(nextValue, min, max);
      selectedRef.current = clamped;
      setSelectedValue(clamped);
      onChange?.(clamped);
    },
    [min, max, onChange]
  );

  // Built per event (cheap) so the refs are only touched inside the handler.
  const handleScroll = useCallback(
    (event) =>
      createPickerScrollHandler(
        scrollRef,
        timeoutRef,
        (val) => parseInt(val, 10),
        commitSelection
      )(event),
    [commitSelection]
  );

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  useEffect(() => {
    const isInitial = !hasAlignedRef.current;
    // Already there (the value is our own echo): leave the finger alone.
    if (!isInitial && selectedRef.current === normalizedValue) {
      return undefined;
    }

    const frame = requestAnimationFrame(() => {
      hasAlignedRef.current = true;
      selectedRef.current = normalizedValue;
      setSelectedValue(normalizedValue);
      if (scrollRef.current) {
        alignScrollContainerToValue(
          scrollRef.current,
          normalizedValue.toString(),
          isInitial ? 'instant' : 'smooth'
        );
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [normalizedValue]);

  const handleItemClick = useCallback(
    (bpm) => {
      commitSelection(bpm);
      if (scrollRef.current) {
        alignScrollContainerToValue(
          scrollRef.current,
          clampBpm(bpm, min, max).toString(),
          'smooth'
        );
      }
    },
    [commitSelection, min, max]
  );

  return (
    <div className="relative h-48 overflow-hidden rounded-xl bg-surface/80">
      <div className="absolute inset-0 pointer-events-none z-10">
        <div className="h-16 bg-linear-to-b from-surface to-transparent" />
        <div className="h-16 bg-transparent" />
        <div className="h-16 bg-linear-to-t from-surface to-transparent" />
      </div>
      <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 h-16 border-y-2 border-accent-blue/70 pointer-events-none z-10" />

      <div
        ref={scrollRef}
        className="h-full overflow-y-auto overflow-x-hidden scrollbar-hide touch-action-pan-y"
        onScroll={handleScroll}
      >
        <div className="h-16" />
        {bpmValues.map((bpm) => (
          <div
            key={bpm}
            data-value={bpm.toString()}
            onClick={() => handleItemClick(bpm)}
            className={`h-16 flex items-center justify-center text-2xl font-semibold snap-center cursor-pointer transition-all ${
              selectedValue === bpm ? 'text-foreground scale-110' : 'text-muted'
            }`}
          >
            {bpm}
          </div>
        ))}
        <div className="h-16" />
      </div>
    </div>
  );
};

/**
 * Stand-alone heart-rate picker sheet (session average HR, max HR). The
 * resting-HR entry modal embeds `HeartRatePicker` directly instead.
 */
export const HeartRatePickerModal = ({
  isOpen,
  isClosing,
  title = 'Average Heart Rate',
  value,
  min = SESSION_HEART_RATE_MIN_BPM,
  max = SESSION_HEART_RATE_MAX_BPM,
  defaultValue = DEFAULT_SESSION_HEART_RATE_BPM,
  helperText = null,
  onCancel,
  onSave,
}) => {
  // The sheet stays mounted while closed but ModalShell renders nothing, so
  // the wheel mounts fresh on every open; the draft only has to be cleared.
  const draftRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      draftRef.current = null;
    }
  }, [isOpen]);

  const handleChange = useCallback((bpm) => {
    draftRef.current = bpm;
  }, []);

  const handleSave = useCallback(() => {
    onSave?.(
      draftRef.current ?? resolveWheelValue(value, defaultValue, min, max)
    );
  }, [onSave, value, defaultValue, min, max]);

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      overlayClassName="z-85"
      contentClassName="p-6 w-full max-w-sm"
    >
      <h3 className="text-foreground font-bold text-xl mb-4 text-center">
        {title}
      </h3>
      <p className="text-muted text-xs text-center mb-2 uppercase tracking-wide">
        BPM
      </p>
      {helperText && (
        <p className="text-muted text-xs text-center mb-3">{helperText}</p>
      )}

      <HeartRatePicker
        value={value}
        onChange={handleChange}
        min={min}
        max={max}
        defaultValue={defaultValue}
      />

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
          className="flex-1 bg-accent-blue active:brightness-110 text-primary-foreground px-6 py-3 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-medium focus-ring press-feedback"
        >
          <Save size={20} />
          Save
        </button>
      </div>
    </ModalShell>
  );
};
