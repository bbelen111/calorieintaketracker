import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  alignScrollContainerToValue,
  createPickerScrollHandler,
} from '../../../utils/visuals/scroll';

const USER_DRIVEN_RESET_MS = 400;

const clamp = (value, min, max) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return min;
  }
  return Math.min(Math.max(numeric, min), max);
};

const resolveParts = (config, value) =>
  config.split(clamp(value, config.min, config.max));

const WheelColumn = ({
  scrollRef,
  onScroll,
  values,
  selected,
  format,
  onPick,
  isDisabled,
  label,
  className,
  insetClass,
}) => (
  <div className={className}>
    <div className="relative h-48 overflow-hidden rounded-xl bg-surface/80">
      <div className="absolute inset-0 pointer-events-none z-10">
        <div className="h-16 bg-linear-to-b from-surface to-transparent" />
        <div className="h-16 bg-transparent" />
        <div className="h-16 bg-linear-to-t from-surface to-transparent" />
      </div>
      <div
        className={`absolute ${insetClass} top-1/2 -translate-y-1/2 h-16 border-y-2 border-accent-blue/70 pointer-events-none z-10`}
      />

      <div
        ref={scrollRef}
        role="listbox"
        aria-label={label}
        className="h-full overflow-y-auto overflow-x-hidden scrollbar-hide touch-action-pan-y"
        onScroll={onScroll}
      >
        <div className="h-16" />
        {values.map((value) => {
          const disabled = isDisabled?.(value) ?? false;
          return (
            <div
              key={value}
              data-value={value}
              role="option"
              aria-selected={selected === value}
              aria-disabled={disabled || undefined}
              onClick={() => {
                if (!disabled) onPick(value);
              }}
              className={`h-16 flex items-center justify-center text-2xl font-bold snap-center cursor-pointer transition-all ${
                selected === value ? 'text-foreground scale-110' : 'text-muted'
              } ${disabled ? 'opacity-40 pointer-events-none' : ''}`}
            >
              {format(value)}
            </div>
          );
        })}
        <div className="h-16" />
      </div>
    </div>
  </div>
);

/**
 * Two scroll wheels that together pick one number: whole + tenth, stone + pound,
 * feet + inches, hundreds + units.
 *
 * `config` must be referentially stable (module constant or `useMemo`):
 * `{ min, max, majorValues, minorValues, split(value) -> { major, minor },
 * join(major, minor) -> value, formatMajor?, formatMinor?, majorLabel?,
 * minorLabel?, minorWide? }`. Values outside `min`..`max` are clamped, and the
 * minor rows that would leave the range are disabled.
 *
 * `value` re-aligns the wheels when it changes from outside; changes caused by
 * the user's own scrolling never fight the gesture (the scroll handler's settle
 * timeout snaps the wheels afterwards).
 */
export const DualWheel = ({ value, config, onChange }) => {
  const majorRef = useRef(null);
  const minorRef = useRef(null);
  const majorTimeoutRef = useRef(null);
  const minorTimeoutRef = useRef(null);
  const userDrivenTimeoutRef = useRef(null);
  const isUserDrivenRef = useRef(false);
  const hasAlignedRef = useRef(false);

  const [selection, setSelection] = useState(() => resolveParts(config, value));
  const selectionRef = useRef(selection);

  const markUserDriven = useCallback(() => {
    isUserDrivenRef.current = true;
    clearTimeout(userDrivenTimeoutRef.current);
    userDrivenTimeoutRef.current = setTimeout(() => {
      isUserDrivenRef.current = false;
    }, USER_DRIVEN_RESET_MS);
  }, []);

  useEffect(
    () => () => {
      clearTimeout(majorTimeoutRef.current);
      clearTimeout(minorTimeoutRef.current);
      clearTimeout(userDrivenTimeoutRef.current);
    },
    []
  );

  useEffect(() => {
    const behavior = hasAlignedRef.current ? 'smooth' : 'instant';
    hasAlignedRef.current = true;
    const parts = resolveParts(config, value);

    const frame = requestAnimationFrame(() => {
      selectionRef.current = parts;
      setSelection(parts);
      if (isUserDrivenRef.current) {
        return;
      }
      alignScrollContainerToValue(majorRef.current, parts.major, behavior);
      alignScrollContainerToValue(minorRef.current, parts.minor, behavior);
    });

    return () => cancelAnimationFrame(frame);
  }, [config, value]);

  /** Apply a pick, pulling an out-of-range combination back inside. */
  const commit = useCallback(
    (requested) => {
      markUserDriven();
      const raw = config.join(requested.major, requested.minor);
      const bounded = clamp(raw, config.min, config.max);
      const parts = bounded === raw ? requested : config.split(bounded);

      selectionRef.current = parts;
      setSelection(parts);
      if (parts.minor !== requested.minor) {
        alignScrollContainerToValue(minorRef.current, parts.minor, 'smooth');
      }
      onChange?.(bounded);
      return parts;
    },
    [config, markUserDriven, onChange]
  );

  const pick = useCallback(
    (requested) => {
      const parts = commit(requested);
      alignScrollContainerToValue(majorRef.current, parts.major, 'smooth');
      alignScrollContainerToValue(minorRef.current, parts.minor, 'smooth');
    },
    [commit]
  );

  const handleMajorScroll = (event) =>
    createPickerScrollHandler(majorRef, majorTimeoutRef, Number, (major) =>
      commit({ major, minor: selectionRef.current.minor })
    )(event);

  const handleMinorScroll = (event) =>
    createPickerScrollHandler(minorRef, minorTimeoutRef, Number, (minor) =>
      commit({ major: selectionRef.current.major, minor })
    )(event);

  const isMinorDisabled = (minor) => {
    const joined = config.join(selection.major, minor);
    return joined < config.min || joined > config.max;
  };

  const formatMajor = config.formatMajor ?? String;
  const formatMinor = config.formatMinor ?? String;

  return (
    <div className="flex gap-4">
      <WheelColumn
        scrollRef={majorRef}
        onScroll={handleMajorScroll}
        values={config.majorValues}
        selected={selection.major}
        format={formatMajor}
        onPick={(major) => pick({ major, minor: selectionRef.current.minor })}
        label={config.majorLabel}
        className="flex-1"
        insetClass="inset-x-4"
      />
      <WheelColumn
        scrollRef={minorRef}
        onScroll={handleMinorScroll}
        values={config.minorValues}
        selected={selection.minor}
        format={formatMinor}
        onPick={(minor) => pick({ major: selectionRef.current.major, minor })}
        isDisabled={isMinorDisabled}
        label={config.minorLabel}
        className={config.minorWide ? 'flex-1' : 'w-20 shrink-0'}
        insetClass="inset-x-2"
      />
    </div>
  );
};
