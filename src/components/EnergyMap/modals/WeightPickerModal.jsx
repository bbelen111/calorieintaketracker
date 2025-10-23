import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Save } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';
import { alignScrollContainerToValue, createPickerScrollHandler } from '../../../utils/scroll';

const MIN_WEIGHT = 30;
const MAX_WEIGHT = 210;
const WEIGHT_VALUES = Array.from({ length: MAX_WEIGHT - MIN_WEIGHT + 1 }, (_, index) => MIN_WEIGHT + index);
const DECIMAL_VALUES = Array.from({ length: 10 }, (_, index) => index);

const clampWhole = (value) => {
  if (!Number.isFinite(value)) {
    return MIN_WEIGHT;
  }
  return Math.min(Math.max(Math.round(value), MIN_WEIGHT), MAX_WEIGHT);
};

const clampDecimal = (value) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(Math.round(value), 0), 9);
};

const normalizeWeight = (weight) => {
  if (!Number.isFinite(weight)) {
    return MIN_WEIGHT;
  }
  return Math.min(Math.max(weight, MIN_WEIGHT), MAX_WEIGHT);
};

const convertWeightToParts = (weight) => {
  const normalized = Math.round(normalizeWeight(weight) * 10) / 10;
  let whole = Math.floor(normalized);
  let decimal = Math.round((normalized - whole) * 10);

  if (decimal === 10) {
    whole = Math.min(whole + 1, MAX_WEIGHT);
    decimal = 0;
  }

  if (whole === MAX_WEIGHT) {
    decimal = 0;
  }

  return {
    whole,
    decimal
  };
};

const buildWeightValue = (whole, decimal) => {
  const clampedWhole = clampWhole(whole);
  const safeDecimal = clampedWhole === MAX_WEIGHT ? 0 : clampDecimal(decimal);
  return Math.round((clampedWhole + safeDecimal / 10) * 10) / 10;
};

export const WeightPickerModal = ({ isOpen, isClosing, value, onChange, onCancel, onSave }) => {
  const wholeRef = useRef(null);
  const decimalRef = useRef(null);
  const wholeTimeoutRef = useRef(null);
  const decimalTimeoutRef = useRef(null);
  const hasAlignedRef = useRef(false);
  const selectionRef = useRef({ whole: MIN_WEIGHT, decimal: 0 });

  const [selectedWhole, setSelectedWhole] = useState(MIN_WEIGHT);
  const [selectedDecimal, setSelectedDecimal] = useState(0);

  const notifyChange = useCallback(
    (whole, decimal) => {
      if (!onChange) {
        return;
      }
      onChange(buildWeightValue(whole, decimal));
    },
    [onChange]
  );

  const applySelection = useCallback(
    (whole, decimal, behavior = 'instant', shouldNotify = false) => {
      const clampedWhole = clampWhole(whole);
      const clampedDecimal = clampedWhole === MAX_WEIGHT ? 0 : clampDecimal(decimal);

      selectionRef.current = {
        whole: clampedWhole,
        decimal: clampedDecimal
      };

      setSelectedWhole(clampedWhole);
      setSelectedDecimal(clampedDecimal);

      if (wholeRef.current) {
        alignScrollContainerToValue(wholeRef.current, clampedWhole.toString(), behavior);
      }

      if (decimalRef.current) {
        alignScrollContainerToValue(decimalRef.current, clampedDecimal.toString(), behavior);
      }

      if (shouldNotify) {
        notifyChange(clampedWhole, clampedDecimal);
      }
    },
    [notifyChange]
  );

  useEffect(
    () => () => {
      clearTimeout(wholeTimeoutRef.current);
      clearTimeout(decimalTimeoutRef.current);
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

    const parts = convertWeightToParts(value);

    const frame = requestAnimationFrame(() => {
      applySelection(parts.whole, parts.decimal, behavior);
    });

    return () => cancelAnimationFrame(frame);
  }, [applySelection, isOpen, value]);

  const handleWholeChange = useCallback(
    (nextWhole) => {
      const clampedWhole = clampWhole(nextWhole);
      const nextDecimal = clampedWhole === MAX_WEIGHT ? 0 : selectionRef.current.decimal;

      selectionRef.current = {
        whole: clampedWhole,
        decimal: nextDecimal
      };

      setSelectedWhole(clampedWhole);
      setSelectedDecimal(nextDecimal);

      if (clampedWhole === MAX_WEIGHT && decimalRef.current) {
        alignScrollContainerToValue(decimalRef.current, '0', 'smooth');
      }

      notifyChange(clampedWhole, nextDecimal);
    },
    [notifyChange]
  );

  const handleDecimalChange = useCallback(
    (nextDecimal) => {
      const clampedDecimal = selectionRef.current.whole === MAX_WEIGHT ? 0 : clampDecimal(nextDecimal);

      selectionRef.current = {
        whole: selectionRef.current.whole,
        decimal: clampedDecimal
      };

      setSelectedDecimal(clampedDecimal);
      notifyChange(selectionRef.current.whole, clampedDecimal);
    },
    [notifyChange]
  );

  const handleWholeScroll = useMemo(
    () => createPickerScrollHandler(wholeRef, wholeTimeoutRef, (value) => parseInt(value, 10), handleWholeChange),
    [handleWholeChange]
  );

  const handleDecimalScroll = useMemo(
    () => createPickerScrollHandler(decimalRef, decimalTimeoutRef, (value) => parseInt(value, 10), handleDecimalChange),
    [handleDecimalChange]
  );

  const selectedWeight = useMemo(() => buildWeightValue(selectedWhole, selectedDecimal), [selectedDecimal, selectedWhole]);

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      overlayClassName="z-[70]"
      contentClassName="p-6 w-full max-w-md"
    >
      <h3 className="text-white font-bold text-xl mb-4 text-center">Select Weight</h3>
      <p className="text-slate-400 text-xs text-center mb-2 uppercase tracking-wide">Kilograms</p>

      <div className="flex gap-4">
        <div className="flex-1">
          <div className="relative h-48 overflow-hidden">
            <div className="absolute inset-0 pointer-events-none z-10">
              <div className="h-16 bg-gradient-to-b from-slate-800 to-transparent" />
              <div className="h-16 bg-transparent" />
              <div className="h-16 bg-gradient-to-t from-slate-800 to-transparent" />
            </div>
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-16 border-y-2 border-blue-400 pointer-events-none z-10" />

            <div ref={wholeRef} className="h-full overflow-y-auto scrollbar-hide" onScroll={handleWholeScroll}>
              <div className="h-16" />
              {WEIGHT_VALUES.map((weight) => (
                <div
                  key={weight}
                  data-value={weight}
                  onClick={() => applySelection(weight, selectionRef.current.decimal, 'smooth', true)}
                  className={`h-16 flex items-center justify-center text-2xl font-bold snap-center transition-all text-center cursor-pointer ${
                    selectedWhole === weight ? 'text-white scale-110' : 'text-slate-500'
                  }`}
                >
                  {weight}
                </div>
              ))}
              <div className="h-16" />
            </div>
          </div>
        </div>

        <div className="w-20 flex-shrink-0">
          <div className="relative h-48 overflow-hidden">
            <div className="absolute inset-0 pointer-events-none z-10">
              <div className="h-16 bg-gradient-to-b from-slate-800 to-transparent" />
              <div className="h-16 bg-transparent" />
              <div className="h-16 bg-gradient-to-t from-slate-800 to-transparent" />
            </div>
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-16 border-y-2 border-blue-400 pointer-events-none z-10" />

            <div ref={decimalRef} className="h-full overflow-y-auto scrollbar-hide" onScroll={handleDecimalScroll}>
              <div className="h-16" />
              {DECIMAL_VALUES.map((decimal) => {
                const isDisabled = selectedWhole === MAX_WEIGHT && decimal !== 0;
                return (
                  <div
                    key={decimal}
                    data-value={decimal}
                    onClick={() => {
                      if (isDisabled) return;
                      applySelection(selectionRef.current.whole, decimal, 'smooth', true);
                    }}
                    className={`h-16 flex items-center justify-center text-2xl font-bold snap-center transition-all text-center cursor-pointer ${
                      selectedDecimal === decimal ? 'text-white scale-110' : 'text-slate-500'
                    } ${isDisabled ? 'opacity-40 pointer-events-none' : ''}`}
                  >
                    .{decimal}
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
          className="flex-1 bg-slate-700 active:bg-slate-600 text-white px-6 py-3 rounded-lg transition-all active:scale-95 font-medium"
        >
          Cancel
        </button>
        <button
          onClick={() => onSave?.(selectedWeight)}
          type="button"
          className="flex-1 bg-blue-600 active:bg-blue-700 text-white px-6 py-3 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-medium"
        >
          <Save size={20} />
          Save
        </button>
      </div>
    </ModalShell>
  );
};
