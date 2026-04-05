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

const clampValue = (value, min, max) => {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
};

const determineDecimalPlaces = (step) => {
  const stepString = step.toString();
  const decimalPointIndex = stepString.indexOf('.');
  return decimalPointIndex === -1
    ? 0
    : stepString.length - decimalPointIndex - 1;
};

const formatValue = (value, decimals) => value.toFixed(decimals);

export const MetValuePickerModal = ({
  isOpen,
  isClosing,
  title,
  value,
  min = 0.5,
  max = 20,
  step = 0.1,
  unitLabel = 'METs',
  onCancel,
  onSave,
}) => {
  const scrollRef = useRef(null);
  const timeoutRef = useRef(null);
  const hasAlignedRef = useRef(false);

  const decimals = useMemo(() => determineDecimalPlaces(step), [step]);

  const normalizedValue = useMemo(() => {
    const numeric = Number(value);
    return clampValue(Number.isNaN(numeric) ? min : numeric, min, max);
  }, [max, min, value]);

  const [selectedValue, setSelectedValue] = useState(normalizedValue);

  const values = useMemo(() => {
    const count = Math.floor((max - min) / step) + 1;
    return Array.from({ length: count }, (_, index) => {
      const raw = min + index * step;
      return Number(formatValue(clampValue(raw, min, max), decimals));
    });
  }, [decimals, max, min, step]);

  const handleValueChange = useCallback(
    (nextValue) => {
      const clamped = clampValue(nextValue, min, max);
      setSelectedValue(clamped);
    },
    [min, max]
  );

  const [handleScroll, setHandleScroll] = useState(() => () => {});

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  useEffect(() => {
    setHandleScroll(() =>
      createPickerScrollHandler(
        scrollRef,
        timeoutRef,
        (val) => parseFloat(val),
        handleValueChange
      )
    );
  }, [handleValueChange]);

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
        const formatted = formatValue(normalizedValue, decimals);
        alignScrollContainerToValue(scrollRef.current, formatted, behavior);
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [isOpen, normalizedValue, decimals]);

  const handleItemClick = useCallback(
    (option) => {
      const clamped = clampValue(option, min, max);
      setSelectedValue(clamped);
      if (scrollRef.current) {
        const formatted = formatValue(clamped, decimals);
        alignScrollContainerToValue(scrollRef.current, formatted, 'smooth');
      }
    },
    [min, max, decimals]
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
      <p className="text-muted text-xs text-center mb-2 uppercase tracking-wide">
        {unitLabel}
      </p>

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
            const formattedValue = formatValue(option, decimals);
            const isSelected =
              formatValue(selectedValue, decimals) === formattedValue;
            return (
              <div
                key={formattedValue}
                data-value={formattedValue}
                onClick={() => handleItemClick(option)}
                className={`h-16 flex items-center justify-center text-2xl font-semibold snap-center cursor-pointer transition-all ${
                  isSelected ? 'text-foreground scale-110' : 'text-muted'
                }`}
              >
                {formattedValue}
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
          className="flex-1 bg-accent-blue active:brightness-110 text-primary-foreground px-6 py-3 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-medium focus-ring press-feedback"
        >
          <Save size={20} />
          Save
        </button>
      </div>
    </ModalShell>
  );
};
