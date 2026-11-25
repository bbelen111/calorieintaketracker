import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
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
import { useUnits } from '../../../../hooks/useUnits';
import { createFoodUnit } from '../../../../utils/units/unitFormatter';

const MIN_GRAMS = 1;
const MAX_GRAMS = 1000;
const DEFAULT_GRAMS = 100;
const DEFAULT_OUNCES = 4;

// The two weight units are always offered; the preference picks the default.
const GRAMS_UNIT_ID = 'grams';
const OUNCES_UNIT_ID = 'ounces';
const OUNCE = createFoodUnit('oz');

const countFrom = (first, last) =>
  Array.from({ length: last - first + 1 }, (_, index) => first + index);

// What the two wheels span: grams and custom-portion quantities share one, the
// ounce wheel stops at the same 1000 g.
const QUANTITY_WHEEL = {
  min: MIN_GRAMS,
  max: MAX_GRAMS,
  values: countFrom(MIN_GRAMS, MAX_GRAMS),
};
const OUNCE_WHEEL = {
  min: 0.1,
  max: OUNCE.toPicker(MAX_GRAMS),
  values: countFrom(0, Math.floor(OUNCE.toPicker(MAX_GRAMS))),
};

const wheelFor = (unitId) =>
  unitId === OUNCES_UNIT_ID ? OUNCE_WHEEL : QUANTITY_WHEEL;

const DECIMAL_VALUES = Array.from({ length: 10 }, (_, index) => index);

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

/** A quantity inside the wheel's range, as its whole and decimal rows. */
const quantityToParts = (quantity, wheel) => {
  const safe = Number.isFinite(quantity) ? quantity : wheel.min;
  const bounded = Math.min(Math.max(safe, wheel.min), wheel.max);
  const tenths = Math.round(bounded * 10);
  return { whole: Math.floor(tenths / 10), decimal: tenths % 10 };
};

/** The quantity two wheel rows stand for, pulled back inside the range. */
const buildQuantity = (whole, decimal, wheel) => {
  const first = wheel.values[0];
  const last = wheel.values[wheel.values.length - 1];
  const safeWhole = Number.isFinite(whole)
    ? Math.min(Math.max(Math.round(whole), first), last)
    : first;
  const quantity = (safeWhole * 10 + clampDecimal(decimal)) / 10;
  return Math.min(Math.max(quantity, wheel.min), wheel.max);
};

const clampParts = (whole, decimal, wheel) =>
  quantityToParts(buildQuantity(whole, decimal, wheel), wheel);

/** The weight-wheel rows for `grams` in one of the two weight units. */
const gramsToParts = (grams, unitId) =>
  quantityToParts(
    unitId === OUNCES_UNIT_ID ? OUNCE.toPicker(grams) : grams,
    wheelFor(unitId)
  );

export const FoodPortionModal = ({
  isOpen,
  isClosing,
  onClose,
  onAddFood,
  onSaveAsFavourite,
  selectedFood,
  initialGrams,
  smartTefEnabled = false,
  isEditing = false,
  isFoodFavourited = false,
  // Ingredient mode (recipe builder): the wheels pick an amount of the food and
  // hand it back through `onConfirmIngredient({ food, grams, portionLabel })`.
  // Nothing is logged and there is no favourite / "Log & exit" action.
  ingredientMode = false,
  confirmLabel = null,
  onConfirmIngredient,
}) => {
  const roundToTenth = (value) => Math.round(value * 10) / 10;
  const { food: foodUnit, energy } = useUnits();
  const preferredUnitId = foodUnit.isOunce ? OUNCES_UNIT_ID : GRAMS_UNIT_ID;

  const initialGramsValue = useMemo(() => {
    const numeric = Number(initialGrams);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return preferredUnitId === OUNCES_UNIT_ID
        ? OUNCE.fromPicker(DEFAULT_OUNCES)
        : DEFAULT_GRAMS;
    }
    return normalizeGrams(numeric);
  }, [initialGrams, preferredUnitId]);

  const wholeRef = useRef(null);
  const decimalRef = useRef(null);
  const wholeTimeoutRef = useRef(null);
  const decimalTimeoutRef = useRef(null);
  const idCounterRef = useRef(0);
  const hasAlignedRef = useRef(false);
  const selectionRef = useRef(gramsToParts(initialGramsValue, preferredUnitId));
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

  // 'grams', 'ounces' or a portion id.
  const [selectedUnit, setSelectedUnit] = useState(preferredUnitId);
  const [selectedWhole, setSelectedWhole] = useState(
    () => gramsToParts(initialGramsValue, preferredUnitId).whole
  );
  const [selectedDecimal, setSelectedDecimal] = useState(
    () => gramsToParts(initialGramsValue, preferredUnitId).decimal
  );

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
    if (
      selectedUnit === GRAMS_UNIT_ID ||
      selectedUnit === OUNCES_UNIT_ID ||
      !selectedFood?.portions
    ) {
      return null;
    }
    return selectedFood.portions.find((p) => p.id === selectedUnit);
  }, [selectedUnit, selectedFood]);

  const computeGramsFromParts = useCallback(
    (whole, decimal) => {
      const quantity = buildQuantity(whole, decimal, wheelFor(selectedUnit));

      if (currentPortion) {
        return Math.round(quantity * currentPortion.grams * 10) / 10;
      }

      // Wheels still showing what the modal opened with keep the exact grams.
      const isOunces = selectedUnit === OUNCES_UNIT_ID;
      const opened = isOunces
        ? OUNCE.toPicker(initialGramsValue)
        : Math.round(initialGramsValue * 10) / 10;
      if (quantity === opened) {
        return initialGramsValue;
      }

      return isOunces
        ? Math.min(OUNCE.fromPicker(quantity), MAX_GRAMS)
        : quantity;
    },
    [selectedUnit, currentPortion, initialGramsValue]
  );

  const alignWheels = useCallback((behavior) => {
    const { whole, decimal } = selectionRef.current;
    if (wholeRef.current) {
      alignScrollContainerToValue(wholeRef.current, whole.toString(), behavior);
    }
    if (decimalRef.current) {
      alignScrollContainerToValue(
        decimalRef.current,
        decimal.toString(),
        behavior
      );
    }
  }, []);

  const applySelection = useCallback(
    (whole, decimal, behavior = 'instant', unitId = GRAMS_UNIT_ID) => {
      const parts = clampParts(whole, decimal, wheelFor(unitId));

      selectionRef.current = parts;
      setSelectedWhole(parts.whole);
      setSelectedDecimal(parts.decimal);
      alignWheels(behavior);
    },
    [alignWheels]
  );

  // Switching between the gram and ounce wheels swaps the rows, so re-align
  // once the new list is in the document.
  useLayoutEffect(() => {
    alignWheels('instant');
  }, [alignWheels, selectedUnit]);

  const grams = useMemo(() => {
    return computeGramsFromParts(selectedWhole, selectedDecimal);
  }, [computeGramsFromParts, selectedWhole, selectedDecimal]);

  // Sync unit and wheels to the default position on open
  useEffect(() => {
    if (!isOpen || !selectedFood) {
      hasAlignedRef.current = false;
      return undefined;
    }

    const behavior = hasAlignedRef.current ? 'smooth' : 'instant';
    hasAlignedRef.current = true;

    const parts = gramsToParts(initialGramsValue, preferredUnitId);

    const frame = requestAnimationFrame(() => {
      setSelectedUnit(preferredUnitId);
      applySelection(parts.whole, parts.decimal, behavior, preferredUnitId);
    });

    return () => cancelAnimationFrame(frame);
  }, [
    applySelection,
    initialGramsValue,
    isOpen,
    preferredUnitId,
    selectedFood,
  ]);

  const handleWholeChange = useCallback(
    (nextWhole) => {
      const requested = selectionRef.current.decimal;
      const parts = clampParts(nextWhole, requested, wheelFor(selectedUnit));

      selectionRef.current = parts;
      setSelectedWhole(parts.whole);
      setSelectedDecimal(parts.decimal);

      if (parts.decimal !== requested && decimalRef.current) {
        alignScrollContainerToValue(
          decimalRef.current,
          String(parts.decimal),
          'smooth'
        );
      }
    },
    [selectedUnit]
  );

  const handleDecimalChange = useCallback(
    (nextDecimal) => {
      const parts = clampParts(
        selectionRef.current.whole,
        nextDecimal,
        wheelFor(selectedUnit)
      );

      selectionRef.current = parts;
      setSelectedDecimal(parts.decimal);
    },
    [selectedUnit]
  );

  const unitOptions = useMemo(
    () => [
      { id: GRAMS_UNIT_ID, label: 'Grammes', detail: 'Exact weight' },
      { id: OUNCES_UNIT_ID, label: 'Ounces', detail: 'Exact weight' },
      ...(selectedFood?.portions ?? []).map((portion) => ({
        id: portion.id,
        label: foodUnit.formatPortionLabel(portion.label),
        detail: Number.isFinite(portion.grams)
          ? foodUnit.format(portion.grams)
          : undefined,
      })),
    ],
    [foodUnit, selectedFood]
  );

  const handleUnitChange = useCallback(
    (newUnit) => {
      if (newUnit === selectedUnit) {
        return;
      }

      setSelectedUnit(newUnit);

      const startingQuantity =
        newUnit === GRAMS_UNIT_ID
          ? DEFAULT_GRAMS
          : newUnit === OUNCES_UNIT_ID
            ? DEFAULT_OUNCES
            : 1;
      applySelection(startingQuantity, 0, 'instant', newUnit);
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
      // Kept on the entry so editing it still knows the tag when the food
      // itself can't be looked up again (online, barcode, custom foods).
      ...(selectedFood?.category ? { category: selectedFood.category } : {}),
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

  const handleConfirmIngredient = () => {
    if (!nutrition || typeof onConfirmIngredient !== 'function') return;
    skipReturnRef.current = false;

    // Portion units are display-only here: the recipe stores the resolved grams
    // and just remembers how the user picked them ("1.5 x 1 cup").
    const quantity = buildQuantity(
      selectedWhole,
      selectedDecimal,
      wheelFor(selectedUnit)
    );
    onConfirmIngredient({
      food: selectedFood,
      grams,
      portionLabel: currentPortion
        ? `${formatOne(quantity)} × ${currentPortion.label}`
        : null,
    });
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
          portionMultiplier: buildQuantity(
            selectedWhole,
            selectedDecimal,
            wheelFor(selectedUnit)
          ),
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

  // The item card shows nutrition per 100 g or per ounce.
  const perBasis = (value) => formatOne(foodUnit.perBasis(value));

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
            <span className="text-[10px] font-medium text-muted">
              {foodUnit.basisLabel}
            </span>
            <div className="flex items-center gap-3 text-xs">
              <div className="text-center">
                <p className="font-bold text-accent-emerald">
                  {energy.compact(
                    foodUnit.perBasis(selectedFood.per100g.calories)
                  )}
                </p>
                <p className="text-muted">{energy.shortUnit}</p>
              </div>
              <div className="text-center">
                <p className="font-bold text-accent-red">
                  {perBasis(selectedFood.per100g.protein)}g
                </p>
                <p className="text-muted">prot</p>
              </div>
              <div className="text-center">
                <p className="font-bold text-accent-amber">
                  {perBasis(selectedFood.per100g.carbs)}g
                </p>
                <p className="text-muted">carb</p>
              </div>
              <div className="text-center">
                <p className="font-bold text-accent-yellow">
                  {perBasis(selectedFood.per100g.fats)}g
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
            options={hasCustomPortions ? unitOptions : unitOptions.slice(0, 2)}
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
                {wheelFor(selectedUnit).values.map((value) => (
                  <div
                    key={value}
                    data-value={value}
                    onClick={() =>
                      applySelection(
                        value,
                        selectionRef.current.decimal,
                        'smooth',
                        selectedUnit
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
                  const wheel = wheelFor(selectedUnit);
                  const quantity = (selectedWhole * 10 + decimal) / 10;
                  const isDisabled =
                    quantity < wheel.min || quantity > wheel.max;
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
                          selectedUnit
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
            For {foodUnit.format(grams, { space: false })}:
          </p>
          <div className="grid grid-cols-4 gap-3 text-center">
            <div>
              <p className="text-accent-emerald font-bold text-2xl">
                {energy.compact(nutrition.calories)}
              </p>
              <p className="text-muted text-xs">{energy.unit}</p>
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
            ingredientMode
              ? handleConfirmIngredient()
              : handleAddFood({
                  closePortionModal: true,
                  closeSearchModal: false,
                })
          }
          disabled={!nutrition}
          className="w-full rounded-xl bg-primary px-3 py-2.5 text-[13px] font-semibold text-primary-foreground shadow-xs transition-all press-feedback focus-ring disabled:cursor-not-allowed disabled:bg-surface-highlight/60 disabled:text-muted md:hover:brightness-110"
        >
          {ingredientMode
            ? (confirmLabel ?? 'Add to recipe')
            : isEditing
              ? 'Save entry'
              : 'Log entry'}
        </button>

        {!ingredientMode && (
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
                handleAddFood({
                  closePortionModal: true,
                  closeSearchModal: true,
                })
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
        )}
      </div>
    </ModalShell>
  );
};
