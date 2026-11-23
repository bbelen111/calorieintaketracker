import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import { Heart } from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';
import { PortionUnitSelect } from '../../common/PortionUnitSelect';
import { FoodTagBadges } from '../../common/FoodTagBadges';
import { MicroStat } from '../../common/MicroStat';
import { TefBurnCard } from '../../common/TefBurnCard';
import { usePortionCardFlight } from '../../../../hooks/usePortionCardFlight';
import { formatOne } from '../../../../utils/formatting/format';
import { formatFoodDisplayName } from '../../../../utils/food/foodPresentation';
import {
  calculateTefFromMacros,
  TEF_PROTEIN_RATE,
  TEF_CARB_RATE,
  TEF_FAT_RATE,
} from '../../../../utils/calculations/calculations';
import {
  alignScrollContainerToValue,
  createPickerScrollHandler,
} from '../../../../utils/visuals/scroll';
import { scaleMacrosFromPer100g } from '../../../../utils/food/portionNormalization';

const MIN_GRAMS = 1;
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
  onSaveAsFavourite,
  selectedFood,
  initialGrams = DEFAULT_GRAMS,
  smartTefEnabled = false,
  isEditing = false,
  isFoodFavourited = false,
}) => {
  const roundToTenth = (value) => Math.round(value * 10) / 10;

  const wholeRef = useRef(null);
  const decimalRef = useRef(null);
  const wholeTimeoutRef = useRef(null);
  const decimalTimeoutRef = useRef(null);
  const idCounterRef = useRef(0);
  const hasAlignedRef = useRef(false);
  const selectionRef = useRef(convertGramsToParts(initialGrams));
  // The modal's top item card (the element that flies) and a flag that skips the
  // return flight when the whole search modal is closing too (Log & exit).
  const cardRef = useRef(null);
  const skipReturnRef = useRef(false);

  // Track if user has marked this as favourite during this session
  const [markedAsFavourite, setMarkedAsFavourite] = useState(false);
  const [isTefExpanded, setIsTefExpanded] = useState(false);

  const handleClose = useCallback(() => {
    setMarkedAsFavourite(false);
    setIsTefExpanded(false);
    onClose?.();
  }, [onClose]);

  // Determine if food has custom portions
  const hasCustomPortions = useMemo(
    () => selectedFood?.portions && selectedFood.portions.length > 0,
    [selectedFood]
  );

  const initialGramsValue = useMemo(() => {
    const numeric = Number(initialGrams);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return DEFAULT_GRAMS;
    }
    return normalizeGrams(numeric);
  }, [initialGrams]);

  const [selectedUnit, setSelectedUnit] = useState('grams'); // 'grams' or portion id
  const [selectedWhole, setSelectedWhole] = useState(DEFAULT_GRAMS);
  const [selectedDecimal, setSelectedDecimal] = useState(0);

  const [handleWholeScroll, setHandleWholeScroll] = useState(() => () => {});
  const [handleDecimalScroll, setHandleDecimalScroll] = useState(
    () => () => {}
  );

  useEffect(
    () => () => {
      clearTimeout(wholeTimeoutRef.current);
      clearTimeout(decimalTimeoutRef.current);
    },
    []
  );

  // Get current portion object if using custom unit
  const currentPortion = useMemo(() => {
    if (selectedUnit === 'grams' || !selectedFood?.portions) return null;
    return selectedFood.portions.find((p) => p.id === selectedUnit);
  }, [selectedUnit, selectedFood]);

  const computeGramsFromParts = useCallback(
    (whole, decimal, unitOverride, portionOverride) => {
      const quantity = buildGramValue(whole, decimal);
      const targetUnit = unitOverride ?? selectedUnit;

      if (targetUnit === 'grams') {
        return quantity;
      }

      const resolvedPortion =
        portionOverride ??
        (targetUnit === selectedUnit
          ? currentPortion
          : selectedFood?.portions?.find((portion) => {
              return portion.id === targetUnit;
            }));

      if (!resolvedPortion) {
        return quantity;
      }

      return Math.round(quantity * resolvedPortion.grams * 10) / 10;
    },
    [selectedUnit, currentPortion, selectedFood]
  );

  const applySelection = useCallback((whole, decimal, behavior = 'instant') => {
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
  }, []);

  const grams = useMemo(() => {
    return computeGramsFromParts(selectedWhole, selectedDecimal);
  }, [computeGramsFromParts, selectedWhole, selectedDecimal]);

  // Reset state when modal opens with new food
  useEffect(() => {
    hasAlignedRef.current = false;

    if (!isOpen || !selectedFood) {
      const frame = requestAnimationFrame(() => setSelectedUnit('grams'));
      return () => cancelAnimationFrame(frame);
    }

    const frame = requestAnimationFrame(() => setSelectedUnit('grams'));
    return () => cancelAnimationFrame(frame);
  }, [isOpen, selectedFood, setSelectedUnit]);

  // Sync picker to default position on open
  useEffect(() => {
    if (!isOpen || !selectedFood) {
      return undefined;
    }

    const behavior = hasAlignedRef.current ? 'smooth' : 'instant';
    hasAlignedRef.current = true;

    const parts = convertGramsToParts(initialGramsValue);

    const frame = requestAnimationFrame(() => {
      applySelection(parts.whole, parts.decimal, behavior);
    });

    return () => cancelAnimationFrame(frame);
  }, [applySelection, initialGramsValue, isOpen, selectedFood]);

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
  }, []);

  const handleDecimalChange = useCallback((nextDecimal) => {
    const clampedDecimal =
      selectionRef.current.whole === MAX_GRAMS ? 0 : clampDecimal(nextDecimal);

    selectionRef.current = {
      whole: selectionRef.current.whole,
      decimal: clampedDecimal,
    };

    setSelectedDecimal(clampedDecimal);
  }, []);

  const unitOptions = useMemo(
    () => [
      { id: 'grams', label: 'Grammes', detail: 'Exact weight' },
      ...(selectedFood?.portions ?? []).map((portion) => ({
        id: portion.id,
        label: portion.label,
        detail: Number.isFinite(portion.grams)
          ? `${formatOne(portion.grams)} g`
          : undefined,
      })),
    ],
    [selectedFood]
  );

  const handleUnitChange = useCallback(
    (newUnit) => {
      if (newUnit === selectedUnit) {
        return;
      }

      setSelectedUnit(newUnit);

      if (newUnit === 'grams') {
        applySelection(DEFAULT_GRAMS, 0, 'instant');
        return;
      }

      applySelection(1, 0, 'instant');
    },
    [applySelection, selectedUnit]
  );

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

  const calculateNutrition = useCallback(() => {
    if (!selectedFood) return null;

    // Shared scaling helper: macros + null-preserving micro nutrients (fiber/
    // sodium/saturatedFats/sugars) at the selected gram amount.
    const scaled = scaleMacrosFromPer100g(selectedFood.per100g, grams);

    return {
      name: selectedFood.name,
      ...scaled,
      grams,
    };
  }, [selectedFood, grams]);

  const nutrition = selectedFood ? calculateNutrition() : null;
  const tefBreakdown = useMemo(() => {
    if (!smartTefEnabled || !nutrition) {
      return null;
    }

    const safeProtein = Math.max(0, Number(nutrition.protein) || 0);
    const safeCarbs = Math.max(0, Number(nutrition.carbs) || 0);
    const safeFats = Math.max(0, Number(nutrition.fats) || 0);

    const proteinTefCalories = safeProtein * 4 * TEF_PROTEIN_RATE;
    const carbsTefCalories = safeCarbs * 4 * TEF_CARB_RATE;
    const fatsTefCalories = safeFats * 9 * TEF_FAT_RATE;
    const rawTotalCalories =
      proteinTefCalories + carbsTefCalories + fatsTefCalories;

    return {
      proteinGrams: roundToTenth(safeProtein),
      carbsGrams: roundToTenth(safeCarbs),
      fatsGrams: roundToTenth(safeFats),
      proteinTefCalories: roundToTenth(proteinTefCalories),
      carbsTefCalories: roundToTenth(carbsTefCalories),
      fatsTefCalories: roundToTenth(fatsTefCalories),
      rawTotalCalories: roundToTenth(rawTotalCalories),
      roundedTotalCalories: calculateTefFromMacros({
        proteinGrams: safeProtein,
        carbsGrams: safeCarbs,
        fatsGrams: safeFats,
      }),
    };
  }, [nutrition, smartTefEnabled]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const timer = setTimeout(() => {
      setIsTefExpanded(false);
    }, 0);

    return () => clearTimeout(timer);
  }, [isOpen, selectedFood?.id]);

  const handleAddFood = (options = {}) => {
    if (!nutrition) return;
    skipReturnRef.current = options.closeSearchModal === true;

    const foodEntry = {
      id: (() => {
        idCounterRef.current += 1;
        return idCounterRef.current;
      })(),
      foodId: selectedFood?.id,
      name: nutrition.name,
      brand: selectedFood?.brand || null,
      calories: nutrition.calories,
      protein: nutrition.protein,
      carbs: nutrition.carbs,
      fats: nutrition.fats,
      fiber: nutrition.fiber,
      sodium: nutrition.sodium,
      saturatedFats: nutrition.saturatedFats,
      sugars: nutrition.sugars,
      grams,
      timestamp: new Date().toISOString(),
    };
    onAddFood?.(foodEntry, options);
  };

  const handleSaveAsFavourite = () => {
    if (!nutrition || typeof onSaveAsFavourite !== 'function') return;

    // If already favourited (either from props or marked during this session), do nothing
    if (isFoodFavourited || markedAsFavourite) return;

    // Build portion info for smart favouriting
    const portionInfo = currentPortion
      ? {
          portionId: currentPortion.id,
          portionName: currentPortion.name,
          portionMultiplier: buildGramValue(selectedWhole, selectedDecimal),
          portionGrams: currentPortion.grams,
        }
      : null;

    const foodEntry = {
      foodId: selectedFood?.id,
      name: nutrition.name,
      brand: selectedFood?.brand || null,
      calories: nutrition.calories,
      protein: nutrition.protein,
      carbs: nutrition.carbs,
      fats: nutrition.fats,
      fiber: nutrition.fiber,
      sodium: nutrition.sodium,
      saturatedFats: nutrition.saturatedFats,
      sugars: nutrition.sugars,
      grams,
      // Include source from the food for proper tagging
      source: selectedFood?.source || null,
      // Include portion info for smart favouriting
      ...(portionInfo && { portionInfo }),
    };
    onSaveAsFavourite(foodEntry, selectedFood);
    setMarkedAsFavourite(true);
    // Don't close or add food - just mark as favourite
  };

  // Determine if currently favourited (either pre-existing or just marked)
  const isCurrentlyFavourited = isFoodFavourited || markedAsFavourite;

  // Shared-element transition: the top card flies in from the tapped search
  // result (and back on close). Must run before the early return below.
  usePortionCardFlight({ isOpen, isClosing, cardRef, skipReturnRef });

  if (!selectedFood) return null;

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      onClose={handleClose}
      contentClassName="modal-content-fade portion-enter p-5 w-full max-w-md"
    >
      {/* Item card - the shared element. It matches the Food Search result card
          it came from (same surface, radius and layout), which is what lets the
          card fly in from the list. Micronutrients live in the "For Ng" card
          below, scaled to the chosen amount. */}
      <div
        ref={cardRef}
        className="mb-5 rounded-xl border border-border bg-surface-highlight p-3 text-left"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h4 className="truncate text-sm font-semibold text-foreground">
              {formatFoodDisplayName({
                name: selectedFood.name,
                brand: selectedFood.brand,
              })}
            </h4>
            <FoodTagBadges food={selectedFood} className="mt-1" />
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-[10px] font-medium text-muted">per 100g</span>
            <div className="flex items-center gap-3 text-xs">
              <div className="text-center">
                <p className="font-bold text-accent-emerald">
                  {formatOne(selectedFood.per100g.calories)}
                </p>
                <p className="text-muted">cal</p>
              </div>
              <div className="text-center">
                <p className="font-bold text-accent-red">
                  {formatOne(selectedFood.per100g.protein)}g
                </p>
                <p className="text-muted">prot</p>
              </div>
              <div className="text-center">
                <p className="font-bold text-accent-amber">
                  {formatOne(selectedFood.per100g.carbs)}g
                </p>
                <p className="text-muted">carb</p>
              </div>
              <div className="text-center">
                <p className="font-bold text-accent-yellow">
                  {formatOne(selectedFood.per100g.fats)}g
                </p>
                <p className="text-muted">fat</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Portion Selector */}
      <div className="mb-6">
        <h3 className="text-foreground font-bold text-xl mb-4 text-center">
          Select Portion Size
        </h3>

        {/* Unit Selector Label with Dropdown */}
        <div className="relative z-20 mb-3">
          <PortionUnitSelect
            value={selectedUnit}
            options={hasCustomPortions ? unitOptions : unitOptions.slice(0, 1)}
            onChange={handleUnitChange}
          />
        </div>

        {/* Picker - always visible */}
        <div className="flex justify-center items-center">
          <div className="w-[220px]">
            <div className="relative h-48 overflow-hidden rounded-xl bg-surface/80">
              <div className="absolute inset-0 pointer-events-none z-10">
                <div className="h-16 bg-linear-to-b from-surface to-transparent" />
                <div className="h-16 bg-transparent" />
                <div className="h-16 bg-linear-to-t from-surface to-transparent" />
              </div>
              <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 h-16 border-y-2 border-accent-blue/70 pointer-events-none z-10" />

              <div
                ref={wholeRef}
                className="h-full overflow-y-auto overflow-x-hidden scrollbar-hide touch-action-pan-y"
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
                        'smooth'
                      )
                    }
                    className={`h-16 flex items-center justify-center text-2xl font-bold snap-center transition-all text-center cursor-pointer ${
                      selectedWhole === value
                        ? 'text-foreground scale-110'
                        : 'text-muted'
                    }`}
                  >
                    {value}
                  </div>
                ))}
                <div className="h-16" />
              </div>
            </div>
          </div>

          <div className="w-24 shrink-0">
            <div className="relative h-48 overflow-hidden rounded-xl bg-surface/80">
              <div className="absolute inset-0 pointer-events-none z-10">
                <div className="h-16 bg-linear-to-b from-surface to-transparent" />
                <div className="h-16 bg-transparent" />
                <div className="h-16 bg-linear-to-t from-surface to-transparent" />
              </div>
              <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 h-16 border-y-2 border-accent-blue/70 pointer-events-none z-10" />

              <div
                ref={decimalRef}
                className="h-full overflow-y-auto overflow-x-hidden scrollbar-hide touch-action-pan-y"
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
                          'smooth'
                        );
                      }}
                      className={`h-16 flex items-center justify-center text-2xl font-bold snap-center transition-all text-center cursor-pointer ${
                        selectedDecimal === decimal
                          ? 'text-foreground scale-110'
                          : 'text-muted'
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

        {/* Display selected quantity and equivalent grams
        <div className="text-center mt-4">
          <p className="text-foreground font-bold text-3xl">
            {formatOne(displayQuantity)}{' '}
            <span className="text-muted text-lg font-normal">
              {selectedUnit === 'grams'
                ? 'g'
                : currentPortion?.label.toLowerCase() || ''}
            </span>
          </p>
          {selectedUnit !== 'grams' && (
            <p className="text-muted text-sm mt-1">
              = {formatOne(grams)}g total
            </p>
          )}
        </div> */}
      </div>

      {/* Calculated Nutrition */}
      {nutrition && (
        <div className="bg-surface-highlight/75 border border-border rounded-lg p-4 mb-6 shadow-lg">
          <p className="text-muted text-xs mb-3 text-center">
            For {formatOne(grams)}g:
          </p>
          <div className="grid grid-cols-4 gap-3 text-center">
            <div>
              <p className="text-accent-emerald font-bold text-2xl">
                {formatOne(nutrition.calories)}
              </p>
              <p className="text-muted text-xs">kcal</p>
            </div>
            <div>
              <p className="text-accent-red font-bold text-2xl">
                {formatOne(nutrition.protein)}g
              </p>
              <p className="text-muted text-xs">protein</p>
            </div>
            <div>
              <p className="text-accent-amber font-bold text-2xl">
                {formatOne(nutrition.carbs)}g
              </p>
              <p className="text-muted text-xs">carbs</p>
            </div>
            <div>
              <p className="text-accent-yellow font-bold text-2xl">
                {formatOne(nutrition.fats)}g
              </p>
              <p className="text-muted text-xs">fats</p>
            </div>
          </div>
          {/* Micronutrients at the chosen amount (null = untracked -> a dash). */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-border/70 pt-3">
            <MicroStat
              label="Fiber"
              value={nutrition.fiber}
              unit="g"
              colorClass="text-accent-green"
            />
            <MicroStat
              label="Sodium"
              value={nutrition.sodium}
              unit="mg"
              colorClass="text-accent-indigo"
            />
            <MicroStat
              label="Sat. Fat"
              value={nutrition.saturatedFats}
              unit="g"
              colorClass="text-accent-yellow"
            />
            <MicroStat
              label="Sugars"
              value={nutrition.sugars}
              unit="g"
              colorClass="text-accent-pink"
            />
          </div>
          {smartTefEnabled && tefBreakdown && (
            <TefBurnCard
              className="mt-4"
              breakdown={tefBreakdown}
              expanded={isTefExpanded}
              onToggle={() => setIsTefExpanded((prev) => !prev)}
            />
          )}
        </div>
      )}

      {/* Actions - same hierarchy as the AI Chat result card: one dominant
          primary and two quiet tinted secondaries. */}
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() =>
            handleAddFood({
              closePortionModal: true,
              closeSearchModal: false,
            })
          }
          disabled={!nutrition}
          className="w-full rounded-xl bg-primary px-3 py-2.5 text-[13px] font-semibold text-primary-foreground shadow-xs transition-all press-feedback focus-ring disabled:cursor-not-allowed disabled:bg-surface-highlight/60 disabled:text-muted md:hover:brightness-110"
        >
          {isEditing ? 'Save entry' : 'Log entry'}
        </button>

        <div
          className={`grid gap-1.5 ${
            typeof onSaveAsFavourite === 'function' && !isEditing
              ? 'grid-cols-2'
              : 'grid-cols-1'
          }`}
        >
          <button
            type="button"
            onClick={() =>
              handleAddFood({ closePortionModal: true, closeSearchModal: true })
            }
            disabled={!nutrition}
            className="rounded-xl bg-accent-blue/10 px-2.5 py-2 text-[12px] font-semibold text-accent-blue transition-all press-feedback focus-ring disabled:cursor-not-allowed disabled:bg-surface-highlight/60 disabled:text-muted md:hover:bg-accent-blue/15"
          >
            {isEditing ? 'Save & exit' : 'Log & exit'}
          </button>
          {typeof onSaveAsFavourite === 'function' && !isEditing && (
            <button
              type="button"
              onClick={handleSaveAsFavourite}
              disabled={isCurrentlyFavourited || !nutrition}
              aria-label={
                isCurrentlyFavourited
                  ? 'Already favourited'
                  : 'Save as favourite'
              }
              className={`flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-[12px] font-semibold transition-all press-feedback focus-ring ${
                isCurrentlyFavourited
                  ? 'cursor-default bg-accent-green/15 text-accent-green'
                  : 'bg-accent-green/10 text-accent-green disabled:cursor-not-allowed disabled:bg-surface-highlight/60 disabled:text-muted md:hover:bg-accent-green/15'
              }`}
            >
              <Heart
                size={13}
                fill={isCurrentlyFavourited ? 'currentColor' : 'none'}
                aria-hidden="true"
              />
              {isCurrentlyFavourited ? 'Favourited' : 'Save & favourite'}
            </button>
          )}
        </div>
      </div>
    </ModalShell>
  );
};
