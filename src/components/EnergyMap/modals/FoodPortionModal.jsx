import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';
import { FOOD_CATEGORIES } from '../../../constants/foodDatabase';
import { formatOne } from '../../../utils/format';
import {
  alignScrollContainerToValue,
  createPickerScrollHandler,
} from '../../../utils/scroll';

const MIN_GRAMS = 10;
const MAX_GRAMS = 1000;
const DEFAULT_GRAMS = 100;

const GRAM_VALUES = Array.from(
  { length: MAX_GRAMS - MIN_GRAMS + 1 },
  (_, index) => MIN_GRAMS + index
);

const DECIMAL_VALUES = Array.from({ length: 10 }, (_, index) => index);

const clampWhole = (value) => {
  if (!Number.isFinite(value)) {
    return MIN_GRAMS;
  }
  return Math.min(Math.max(Math.round(value), MIN_GRAMS), MAX_GRAMS);
};

const clampDecimal = (value) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(Math.round(value), 0), 9);
};

const normalizeGrams = (grams) => {
  if (!Number.isFinite(grams)) {
    return MIN_GRAMS;
  }
  return Math.min(Math.max(grams, MIN_GRAMS), MAX_GRAMS);
};

const convertGramsToParts = (grams) => {
  const normalized = Math.round(normalizeGrams(grams) * 10) / 10;
  let whole = Math.floor(normalized);
  let decimal = Math.round((normalized - whole) * 10);

  if (decimal === 10) {
    whole = Math.min(whole + 1, MAX_GRAMS);
    decimal = 0;
  }

  if (whole === MAX_GRAMS) {
    decimal = 0;
  }

  return {
    whole,
    decimal,
  };
};

const buildGramValue = (whole, decimal) => {
  const clampedWhole = clampWhole(whole);
  const safeDecimal = clampedWhole === MAX_GRAMS ? 0 : clampDecimal(decimal);
  return Math.round((clampedWhole + safeDecimal / 10) * 10) / 10;
};

export const FoodPortionModal = ({
  isOpen,
  isClosing,
  onClose,
  onAddFood,
  selectedFood,
}) => {
  const wholeRef = useRef(null);
  const decimalRef = useRef(null);
  const wholeTimeoutRef = useRef(null);
  const decimalTimeoutRef = useRef(null);
  const idCounterRef = useRef(0);
  const hasAlignedRef = useRef(false);
  const selectionRef = useRef(convertGramsToParts(DEFAULT_GRAMS));

  const [selectedWhole, setSelectedWhole] = useState(DEFAULT_GRAMS);
  const [selectedDecimal, setSelectedDecimal] = useState(0);
  const [grams, setGrams] = useState(DEFAULT_GRAMS);

  const [handleWholeScroll, setHandleWholeScroll] = useState(() => () => {});
  const [handleDecimalScroll, setHandleDecimalScroll] = useState(
    () => () => {}
  );

  const applySelection = useCallback(
    (whole, decimal, behavior = 'instant', shouldUpdate = true) => {
      const clampedWhole = clampWhole(whole);
      const clampedDecimal =
        clampedWhole === MAX_GRAMS ? 0 : clampDecimal(decimal);

      selectionRef.current = {
        whole: clampedWhole,
        decimal: clampedDecimal,
      };

      setSelectedWhole(clampedWhole);
      setSelectedDecimal(clampedDecimal);

      if (wholeRef.current) {
        alignScrollContainerToValue(
          wholeRef.current,
          clampedWhole.toString(),
          behavior
        );
      }

      if (decimalRef.current) {
        alignScrollContainerToValue(
          decimalRef.current,
          clampedDecimal.toString(),
          behavior
        );
      }

      if (shouldUpdate) {
        setGrams(buildGramValue(clampedWhole, clampedDecimal));
      }
    },
    []
  );

  useEffect(
    () => () => {
      clearTimeout(wholeTimeoutRef.current);
      clearTimeout(decimalTimeoutRef.current);
    },
    []
  );

  useEffect(() => {
    if (!isOpen || !selectedFood) {
      hasAlignedRef.current = false;
      return undefined;
    }

    const behavior = hasAlignedRef.current ? 'smooth' : 'instant';
    hasAlignedRef.current = true;

    const parts = convertGramsToParts(DEFAULT_GRAMS);

    const frame = requestAnimationFrame(() => {
      applySelection(parts.whole, parts.decimal, behavior, true);
    });

    return () => cancelAnimationFrame(frame);
  }, [applySelection, isOpen, selectedFood]);

  const handleWholeChange = useCallback((nextWhole) => {
    const clampedWhole = clampWhole(nextWhole);
    const nextDecimal =
      clampedWhole === MAX_GRAMS ? 0 : selectionRef.current.decimal;

    selectionRef.current = {
      whole: clampedWhole,
      decimal: nextDecimal,
    };

    setSelectedWhole(clampedWhole);
    setSelectedDecimal(nextDecimal);

    if (clampedWhole === MAX_GRAMS && decimalRef.current) {
      alignScrollContainerToValue(decimalRef.current, '0', 'smooth');
    }

    setGrams(buildGramValue(clampedWhole, nextDecimal));
  }, []);

  const handleDecimalChange = useCallback((nextDecimal) => {
    const clampedDecimal =
      selectionRef.current.whole === MAX_GRAMS ? 0 : clampDecimal(nextDecimal);

    selectionRef.current = {
      whole: selectionRef.current.whole,
      decimal: clampedDecimal,
    };

    setSelectedDecimal(clampedDecimal);
    setGrams(buildGramValue(selectionRef.current.whole, clampedDecimal));
  }, []);

  useEffect(() => {
    setHandleWholeScroll(() =>
      createPickerScrollHandler(
        wholeRef,
        wholeTimeoutRef,
        (value) => parseInt(value, 10),
        handleWholeChange
      )
    );
  }, [handleWholeChange]);

  useEffect(() => {
    setHandleDecimalScroll(() =>
      createPickerScrollHandler(
        decimalRef,
        decimalTimeoutRef,
        (value) => parseInt(value, 10),
        handleDecimalChange
      )
    );
  }, [handleDecimalChange]);

  const calculateNutrition = () => {
    if (!selectedFood) return null;

    const per100g = selectedFood.per100g;
    const multiplier = grams / 100;

    return {
      name: selectedFood.name,
      calories: Math.round(per100g.calories * multiplier),
      protein: Math.round(per100g.protein * multiplier * 10) / 10,
      carbs: Math.round(per100g.carbs * multiplier * 10) / 10,
      fats: Math.round(per100g.fats * multiplier * 10) / 10,
      grams: grams,
    };
  };

  const nutrition = selectedFood ? calculateNutrition() : null;

  const handleAddFood = () => {
    if (!nutrition) return;

    const foodEntry = {
      id: (() => {
        idCounterRef.current += 1;
        return idCounterRef.current;
      })(),
      name: nutrition.name,
      calories: nutrition.calories,
      protein: nutrition.protein,
      carbs: nutrition.carbs,
      fats: nutrition.fats,
      grams: grams,
      timestamp: new Date().toISOString(),
    };

    onAddFood?.(foodEntry);
  };

  const getCategoryColor = (category) => {
    return FOOD_CATEGORIES[category]?.color || 'slate';
  };

  if (!selectedFood) return null;

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      onClose={onClose}
      overlayClassName="!z-[100]"
      contentClassName="p-6 w-full max-w-md"
    >
      {/* Header */}
      <div className="mb-4">
        <div className="bg-slate-700/50 border border-slate-600/50 rounded-lg p-3 flex items-center gap-4 shadow-lg shadow-slate-900/20">
          {/* Food name and category */}
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-semibold text-sm truncate">
              {selectedFood.name}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`text-xs px-2 py-0.5 bg-${getCategoryColor(selectedFood.category)}-500/20 text-${getCategoryColor(selectedFood.category)}-400 rounded-full`}
              >
                {FOOD_CATEGORIES[selectedFood.category]?.label}
              </span>
              <span className="text-slate-400 text-xs">per 100g</span>
            </div>
          </div>

          {/* Nutrition inline */}
          <div className="flex items-center gap-2 text-xs flex-shrink-0">
            <div className="text-center">
              <p className="text-emerald-400 font-bold">
                {selectedFood.per100g.calories}
              </p>
              <p className="text-slate-400">kcal</p>
            </div>
            <div className="text-center">
              <p className="text-red-400 font-bold">
                {selectedFood.per100g.protein}g
              </p>
              <p className="text-slate-400">protein</p>
            </div>
            <div className="text-center">
              <p className="text-amber-400 font-bold">
                {selectedFood.per100g.carbs}g
              </p>
              <p className="text-slate-400">carbs</p>
            </div>
            <div className="text-center">
              <p className="text-yellow-400 font-bold">
                {selectedFood.per100g.fats}g
              </p>
              <p className="text-slate-400">fat</p>
            </div>
          </div>
        </div>
      </div>

      {/* Portion Selector */}
      <div className="mb-6">
        <h3 className="text-white font-bold text-xl mb-4 text-center">
          Select Portion Size
        </h3>
        <label className="text-slate-400 text-xs text-center mb-2 uppercase tracking-wide block">
          Grammes
        </label>

        <div className="flex justify-center items-center">
          <div className="w-[220px]">
            <div className="relative h-48 overflow-hidden rounded-xl bg-slate-800/80">
              <div className="absolute inset-0 pointer-events-none z-10">
                <div className="h-16 bg-gradient-to-b from-slate-800 to-transparent" />
                <div className="h-16 bg-transparent" />
                <div className="h-16 bg-gradient-to-t from-slate-800 to-transparent" />
              </div>
              <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 h-16 border-y-2 border-blue-400/70 pointer-events-none z-10" />

              <div
                ref={wholeRef}
                className="h-full overflow-y-auto scrollbar-hide"
                onScroll={handleWholeScroll}
              >
                <div className="h-16" />
                {GRAM_VALUES.map((value) => (
                  <div
                    key={value}
                    data-value={value}
                    onClick={() =>
                      applySelection(
                        value,
                        selectionRef.current.decimal,
                        'smooth',
                        true
                      )
                    }
                    className={`h-16 flex items-center justify-center text-2xl font-bold snap-center transition-all text-center cursor-pointer ${
                      selectedWhole === value
                        ? 'text-white scale-110'
                        : 'text-slate-500'
                    }`}
                  >
                    {value}
                  </div>
                ))}
                <div className="h-16" />
              </div>
            </div>
          </div>

          <div className="w-24 flex-shrink-0">
            <div className="relative h-48 overflow-hidden rounded-xl bg-slate-800/80">
              <div className="absolute inset-0 pointer-events-none z-10">
                <div className="h-16 bg-gradient-to-b from-slate-800 to-transparent" />
                <div className="h-16 bg-transparent" />
                <div className="h-16 bg-gradient-to-t from-slate-800 to-transparent" />
              </div>
              <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 h-16 border-y-2 border-blue-400/70 pointer-events-none z-10" />

              <div
                ref={decimalRef}
                className="h-full overflow-y-auto scrollbar-hide"
                onScroll={handleDecimalScroll}
              >
                <div className="h-16" />
                {DECIMAL_VALUES.map((decimal) => {
                  const isDisabled =
                    selectedWhole === MAX_GRAMS && decimal !== 0;
                  return (
                    <div
                      key={decimal}
                      data-value={decimal}
                      onClick={() => {
                        if (isDisabled) return;
                        applySelection(
                          selectionRef.current.whole,
                          decimal,
                          'smooth',
                          true
                        );
                      }}
                      className={`h-16 flex items-center justify-center text-2xl font-bold snap-center transition-all text-center cursor-pointer ${
                        selectedDecimal === decimal
                          ? 'text-white scale-110'
                          : 'text-slate-500'
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
      </div>

      {/* Calculated Nutrition */}
      {nutrition && (
        <div className="bg-slate-700/50 border border-slate-600 rounded-lg p-4 mb-6 shadow-lg shadow-slate-900/20">
          <p className="text-slate-400 text-xs mb-3 text-center">
            For {formatOne(grams)}g:
          </p>
          <div className="grid grid-cols-4 gap-3 text-center">
            <div>
              <p className="text-emerald-400 font-bold text-2xl">
                {formatOne(nutrition.calories)}
              </p>
              <p className="text-slate-400 text-xs">kcal</p>
            </div>
            <div>
              <p className="text-red-400 font-bold text-2xl">
                {formatOne(nutrition.protein)}g
              </p>
              <p className="text-slate-400 text-xs">protein</p>
            </div>
            <div>
              <p className="text-amber-400 font-bold text-2xl">
                {formatOne(nutrition.carbs)}g
              </p>
              <p className="text-slate-400 text-xs">carbs</p>
            </div>
            <div>
              <p className="text-yellow-400 font-bold text-2xl">
                {formatOne(nutrition.fats)}g
              </p>
              <p className="text-slate-400 text-xs">fats</p>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition-all"
        >
          Cancel
        </button>
        <button
          onClick={handleAddFood}
          disabled={!nutrition || nutrition.calories === 0}
          className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-all flex items-center justify-center gap-2"
        >
          <Plus size={18} />
          Add Food
        </button>
      </div>
    </ModalShell>
  );
};
