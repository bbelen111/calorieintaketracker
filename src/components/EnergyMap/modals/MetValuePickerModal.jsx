import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Save } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';
import { alignScrollContainerToValue } from '../../../utils/scroll';

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
  onChange,
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

  const updateValue = useCallback(
    (
      nextValue,
      { shouldAlign = true, alignBehavior = 'smooth', emitChange = true } = {}
    ) => {
      const clamped = clampValue(nextValue, min, max);
      setSelectedValue((previous) => {
        if (Math.abs(previous - clamped) < 0.0001) {
          return previous;
        }
        return clamped;
      });

      if (emitChange && onChange) {
        onChange(clamped);
      }

      if (shouldAlign) {
        alignToValue(clamped, alignBehavior);
      }
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
      updateValue(normalizedValue, {
        shouldAlign: true,
        alignBehavior: behavior,
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [isOpen, normalizedValue, updateValue]);

  useEffect(() => {
    let timeout = timeoutRef.current;
    return () => {
      clearTimeout(timeout);
    };
  }, []);

  // Inline scroll handler for lint compliance
  const handleScroll = (event) => {
    const container = event.currentTarget;
    const closestItem = container.querySelectorAll('[data-value]');
    let closest = null;
    let closestDistance = Infinity;
    const containerCenter = container.scrollTop + container.clientHeight / 2;
    closestItem.forEach((item) => {
      const itemCenter = item.offsetTop + item.offsetHeight / 2;
      const distance = Math.abs(containerCenter - itemCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = item;
      }
    });
    if (closest) {
      const parsedValue = parseFloat(closest.dataset.value);
      if (!Number.isNaN(parsedValue)) {
        updateValue(parsedValue, { shouldAlign: false });
      }
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      const containerEl = scrollRef.current || container;
      if (!containerEl) return;
      // Find closest again for alignment
      let closestAlign = null;
      let closestAlignDistance = Infinity;
      const center = containerEl.scrollTop + containerEl.clientHeight / 2;
      containerEl.querySelectorAll('[data-value]').forEach((item) => {
        const itemCenter = item.offsetTop + item.offsetHeight / 2;
        const distance = Math.abs(center - itemCenter);
        if (distance < closestAlignDistance) {
          closestAlignDistance = distance;
          closestAlign = item;
        }
      });
      if (closestAlign) {
        const targetScrollTop =
          closestAlign.offsetTop -
          containerEl.clientHeight / 2 +
          closestAlign.offsetHeight / 2;
        containerEl.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
      }
    }, 140);
  };

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      overlayClassName="z-[85]"
      contentClassName="p-6 w-full max-w-sm"
    >
      <h3 className="text-white font-bold text-xl mb-4 text-center">{title}</h3>
      <p className="text-slate-400 text-xs text-center mb-2 uppercase tracking-wide">
        {unitLabel}
      </p>

      <div className="relative h-48 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none z-10">
          <div className="h-16 bg-gradient-to-b from-slate-800 to-transparent" />
          <div className="h-16 bg-transparent" />
          <div className="h-16 bg-gradient-to-t from-slate-800 to-transparent" />
        </div>
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-16 border-y-2 border-blue-400 pointer-events-none z-10" />

        <div
          ref={scrollRef}
          className="h-full overflow-y-auto scrollbar-hide"
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
                onClick={() => updateValue(option)}
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
          onClick={() => {
            updateValue(selectedValue);
            onSave?.(selectedValue);
          }}
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
