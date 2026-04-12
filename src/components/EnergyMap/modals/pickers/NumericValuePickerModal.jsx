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

const clamp = (value, min, max) => {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
};

const getPrecisionFromStep = (step) => {
  const normalized = String(step ?? 1);
  if (!normalized.includes('.')) {
    return 0;
  }

  return normalized.split('.')[1]?.length ?? 0;
};

const normalizeToStep = (value, min, max, step) => {
  const safeStep = Number.isFinite(step) && step > 0 ? step : 1;
  const precision = getPrecisionFromStep(safeStep);
  const scale = 10 ** precision;

  const minInt = Math.round(min * scale);
  const maxInt = Math.round(max * scale);
  const stepInt = Math.max(1, Math.round(safeStep * scale));
  const valueInt = Math.round(clamp(value, min, max) * scale);

  const steppedInt =
    minInt + Math.round((valueInt - minInt) / stepInt) * stepInt;
  const clampedInt = Math.min(Math.max(steppedInt, minInt), maxInt);

  return clampedInt / scale;
};

const formatValue = (value, precision) => {
  if (!Number.isFinite(value)) {
    return '0';
  }

  if (precision <= 0) {
    return String(Math.round(value));
  }

  return value
    .toFixed(precision)
    .replace(/\.0+$/, '')
    .replace(/(\.\d*?)0+$/, '$1');
};

export const NumericValuePickerModal = ({
  isOpen,
  isClosing,
  title = 'Select Value',
  value = 0,
  min = 0,
  max = 100,
  step = 1,
  unitLabel = '',
  onCancel,
  onSave,
}) => {
  const scrollRef = useRef(null);
  const timeoutRef = useRef(null);
  const hasAlignedRef = useRef(false);

  const precision = useMemo(() => getPrecisionFromStep(step), [step]);

  const values = useMemo(() => {
    const safeStep = Number.isFinite(step) && step > 0 ? step : 1;
    const count = Math.floor((max - min) / safeStep) + 1;

    return Array.from({ length: Math.max(1, count) }, (_, index) =>
      normalizeToStep(min + index * safeStep, min, max, safeStep)
    );
  }, [max, min, step]);

  const normalizedValue = useMemo(
    () => normalizeToStep(Number(value), min, max, step),
    [max, min, step, value]
  );

  const [selectedValue, setSelectedValue] = useState(normalizedValue);
  const [handleScroll, setHandleScroll] = useState(() => () => {});

  const handleValueChange = useCallback(
    (nextValue) => {
      const normalized = normalizeToStep(nextValue, min, max, step);
      setSelectedValue(normalized);
    },
    [max, min, step]
  );

  useEffect(() => {
    setHandleScroll(() =>
      createPickerScrollHandler(
        scrollRef,
        timeoutRef,
        (rawValue) => Number.parseFloat(rawValue),
        handleValueChange
      )
    );
  }, [handleValueChange]);

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  useEffect(() => {
    if (!isOpen) {
      hasAlignedRef.current = false;
      return undefined;
    }

    const behavior = hasAlignedRef.current ? 'smooth' : 'instant';
    hasAlignedRef.current = true;

    const frame = requestAnimationFrame(() => {
      setSelectedValue(normalizedValue);
      if (scrollRef.current) {
        alignScrollContainerToValue(
          scrollRef.current,
          formatValue(normalizedValue, precision),
          behavior
        );
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [isOpen, normalizedValue, precision]);

  const handleItemClick = useCallback(
    (nextValue) => {
      const normalized = normalizeToStep(nextValue, min, max, step);
      setSelectedValue(normalized);

      if (scrollRef.current) {
        alignScrollContainerToValue(
          scrollRef.current,
          formatValue(normalized, precision),
          'smooth'
        );
      }
    },
    [max, min, precision, step]
  );

  const handleSave = useCallback(() => {
    onSave?.(selectedValue);
  }, [onSave, selectedValue]);

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
      {unitLabel ? (
        <p className="text-muted text-xs text-center mb-2 uppercase tracking-wide">
          {unitLabel}
        </p>
      ) : null}

      <div className="relative h-48 overflow-hidden rounded-xl bg-surface/80">
        <div className="absolute inset-0 pointer-events-none z-10">
          <div className="h-16 bg-gradient-to-b from-surface to-transparent" />
          <div className="h-16 bg-transparent" />
          <div className="h-16 bg-gradient-to-t from-surface to-transparent" />
        </div>
        <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 h-16 border-y-2 border-accent-blue/70 pointer-events-none z-10" />

        <div
          ref={scrollRef}
          className="h-full overflow-y-auto overflow-x-hidden scrollbar-hide touch-action-pan-y"
          onScroll={handleScroll}
        >
          <div className="h-16" />
          {values.map((option) => {
            const formatted = formatValue(option, precision);
            const isSelected = selectedValue === option;

            return (
              <div
                key={formatted}
                data-value={formatted}
                onClick={() => handleItemClick(option)}
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
          className="flex-1 bg-primary active:brightness-110 text-primary-foreground px-6 py-3 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-medium focus-ring press-feedback"
        >
          <Save size={20} />
          Save
        </button>
      </div>
    </ModalShell>
  );
};
