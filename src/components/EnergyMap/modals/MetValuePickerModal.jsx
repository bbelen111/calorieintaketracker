import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Save } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';
import { alignScrollContainerToValue, createPickerScrollHandler } from '../../../utils/scroll';

const clampValue = (value, min, max) => {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
};

const determineDecimalPlaces = (step) => {
  const stepString = step.toString();
  const decimalPointIndex = stepString.indexOf('.');
  return decimalPointIndex === -1 ? 0 : stepString.length - decimalPointIndex - 1;
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
  onChange,
  onSave
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

  const alignToValue = useCallback(
    (nextValue, behavior = 'smooth') => {
      if (!scrollRef.current) {
        return;
      }

      const formatted = formatValue(nextValue, decimals);
      alignScrollContainerToValue(scrollRef.current, formatted, behavior);
    },
    [decimals]
  );

  const commitValue = useCallback(
    (nextValue, behavior = 'smooth') => {
      const clamped = clampValue(nextValue, min, max);
      setSelectedValue(clamped);
      if (onChange) {
        onChange(clamped);
      }
      alignToValue(clamped, behavior);
    },
    [alignToValue, max, min, onChange]
  );

  useEffect(() => {
    if (!isOpen) {
      hasAlignedRef.current = false;
      return undefined;
    }

    const behavior = hasAlignedRef.current ? 'smooth' : 'instant';
    hasAlignedRef.current = true;

    const frame = requestAnimationFrame(() => {
      commitValue(normalizedValue, behavior);
    });

    return () => cancelAnimationFrame(frame);
  }, [commitValue, isOpen, normalizedValue]);

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  const handleScroll = useMemo(
    () =>
      createPickerScrollHandler(
        scrollRef,
        timeoutRef,
        (raw) => parseFloat(raw),
        (next) => commitValue(next, 'smooth')
      ),
    [commitValue]
  );

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      overlayClassName="z-[85]"
      contentClassName="p-6 w-full max-w-sm"
    >
      <h3 className="text-white font-bold text-xl mb-4 text-center">{title}</h3>
      <p className="text-slate-400 text-xs text-center mb-2 uppercase tracking-wide">{unitLabel}</p>

      <div className="relative h-48 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none z-10">
          <div className="h-16 bg-gradient-to-b from-slate-800 to-transparent" />
          <div className="h-16 bg-transparent" />
          <div className="h-16 bg-gradient-to-t from-slate-800 to-transparent" />
        </div>
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-16 border-y-2 border-blue-400 pointer-events-none z-10" />

        <div ref={scrollRef} className="h-full overflow-y-auto scrollbar-hide" onScroll={handleScroll}>
          <div className="h-16" />
          {values.map((option) => {
            const formattedValue = formatValue(option, decimals);
            const isSelected = formatValue(selectedValue, decimals) === formattedValue;
            return (
              <div
                key={formattedValue}
                data-value={formattedValue}
                onClick={() => commitValue(option)}
                className={`py-3 px-6 text-2xl font-semibold transition-all snap-center cursor-pointer text-center ${
                  isSelected ? 'text-white scale-110' : 'text-slate-500'
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
          className="flex-1 bg-slate-700 active:bg-slate-600 text-white px-6 py-3 rounded-lg transition-all active:scale-95 font-medium"
        >
          Cancel
        </button>
        <button
          onClick={() => onSave?.(selectedValue)}
          type="button"
          className="flex-1 bg-green-600 active:bg-green-700 text-white px-6 py-3 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-medium"
        >
          <Save size={20} />
          Save
        </button>
      </div>
    </ModalShell>
  );
};
