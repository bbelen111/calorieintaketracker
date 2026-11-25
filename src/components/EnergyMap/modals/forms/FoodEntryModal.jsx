import React, { useState, useEffect, useMemo } from 'react';
import { Utensils, Heart, ChevronsUpDown } from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';
import { TefBurnCard } from '../../common/TefBurnCard';
import {
  calculateTefFromMacros,
  TEF_PROTEIN_RATE,
  TEF_CARB_RATE,
  TEF_FAT_RATE,
} from '../../../../utils/calculations/calculations';
import {
  formatEnergyFieldValue,
  formatPickerDisplayValue,
} from '../../../../utils/food/nutrientPicker';
import { useUnits } from '../../../../hooks/useUnits';

export const FoodEntryModal = ({
  isOpen,
  isClosing,
  onClose,
  onSave,
  onSaveAsFavourite,
  onCheckFoodExists,
  foodName,
  setFoodName,
  calories,
  protein,
  carbs,
  fats,
  fiber,
  sodium,
  saturatedFats,
  sugars,
  onOpenCaloriesPicker,
  onOpenProteinPicker,
  onOpenCarbsPicker,
  onOpenFatsPicker,
  onOpenFiberPicker,
  onOpenSodiumPicker,
  onOpenSaturatedFatsPicker,
  onOpenSugarsPicker,
  smartTefEnabled = false,
  isEditing = false,
}) => {
  const roundToTenth = (value) => Math.round(value * 10) / 10;

  const [markedAsFavourite, setMarkedAsFavourite] = useState(false);
  const [alreadyExists, setAlreadyExists] = useState(false);
  const [isTefExpanded, setIsTefExpanded] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      // Use a timeout to avoid synchronous setState in effect
      const timer = setTimeout(() => {
        setMarkedAsFavourite(false);
        setAlreadyExists(false);
        setIsTefExpanded(false);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Auto-hide "already exists" message after 3 seconds
  useEffect(() => {
    if (alreadyExists) {
      const timer = setTimeout(() => {
        setAlreadyExists(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [alreadyExists]);

  const units = useUnits();

  const handleSave = (options = {}) => {
    if (!foodName.trim()) {
      window.alert('Please enter a food name');
      return;
    }

    // Just save - no duplicate check dialog needed
    onSave?.(options);
  };

  const handleSaveAsFavourite = () => {
    if (!foodName.trim()) {
      window.alert('Please enter a food name');
      return;
    }

    if (typeof onSaveAsFavourite !== 'function') return;

    // Check if already favourited this session
    if (markedAsFavourite) return;

    // Check if food already exists by name
    if (onCheckFoodExists?.(foodName.trim())) {
      setAlreadyExists(true);
      return;
    }

    const favourite = {
      foodId: null, // Manual food, no database ID
      name: foodName.trim(),
      category: 'manual', // Manual entries get 'manual' category
      grams: null, // Manual entries don't have grams
      calories: parseFloat(calories) || 0,
      protein: parseFloat(protein) || 0,
      carbs: parseFloat(carbs) || 0,
      fats: parseFloat(fats) || 0,
      fiber: fiber !== '' ? parseFloat(fiber) : null,
      sodium: sodium !== '' ? parseFloat(sodium) : null,
      saturatedFats: saturatedFats !== '' ? parseFloat(saturatedFats) : null,
      sugars: sugars !== '' ? parseFloat(sugars) : null,
      isCustom: false, // Not a custom food, it's a manual entry
      source: 'manual',
      per100g: null,
      portions: [],
    };

    onSaveAsFavourite(favourite);
    setMarkedAsFavourite(true);
    // Don't close - just mark as favourited
  };

  const handleOpenPicker = (openPickerCallback) => {
    const activeElement = document.activeElement;
    if (activeElement && typeof activeElement.blur === 'function') {
      activeElement.blur();
    }

    window.setTimeout(() => {
      openPickerCallback?.();
    }, 60);
  };

  const tefBreakdown = useMemo(() => {
    const safeProtein = Math.max(0, Number.parseFloat(protein) || 0);
    const safeCarbs = Math.max(0, Number.parseFloat(carbs) || 0);
    const safeFats = Math.max(0, Number.parseFloat(fats) || 0);

    const proteinCalories = safeProtein * 4;
    const carbsCalories = safeCarbs * 4;
    const fatsCalories = safeFats * 9;

    const proteinTefCalories = proteinCalories * TEF_PROTEIN_RATE;
    const carbsTefCalories = carbsCalories * TEF_CARB_RATE;
    const fatsTefCalories = fatsCalories * TEF_FAT_RATE;

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
  }, [protein, carbs, fats]);

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      onClose={onClose}
      contentClassName="w-full md:max-w-2xl p-6"
    >
      <div className="flex items-center gap-3 mb-6">
        <Utensils className="text-accent-blue" size={28} />
        <h3 className="text-foreground font-bold text-2xl">
          {isEditing ? 'Edit Food Entry' : 'Manual Food Entry'}
        </h3>
      </div>

      <div className="space-y-4">
        {/* Food Name */}
        <div>
          <label className="block text-foreground text-sm font-semibold mb-2">
            Food Name
          </label>
          <input
            type="text"
            value={foodName}
            onChange={(e) => !isEditing && setFoodName(e.target.value)}
            placeholder="e.g., Chicken Breast"
            readOnly={isEditing}
            className={`w-full bg-surface-highlight border border-border rounded-lg px-4 py-3 text-foreground placeholder:text-muted focus-ring ${isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
          />
        </div>

        {/* Calories */}
        <div>
          <label className="block text-foreground text-sm font-semibold mb-2">
            {units.energy.noun}
          </label>
          <button
            type="button"
            onClick={() => handleOpenPicker(onOpenCaloriesPicker)}
            className="w-full bg-surface-highlight text-foreground px-4 py-3 rounded-lg border border-border transition-all text-left focus-ring md:hover:border-muted/50 flex items-center justify-between gap-3 pressable-inline"
            aria-label="Open calories picker"
          >
            <span className="font-medium text-base">
              {formatEnergyFieldValue(calories, units.energy)}
            </span>
            <ChevronsUpDown size={16} className="text-muted shrink-0" />
          </button>
        </div>

        {/* Macros Grid */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-foreground text-xs font-semibold mb-2">
              Protein (g)
            </label>
            <button
              type="button"
              onClick={() => handleOpenPicker(onOpenProteinPicker)}
              className="w-full bg-surface-highlight text-foreground px-3 py-2 rounded-lg border border-border transition-all text-left focus-ring md:hover:border-muted/50 flex items-center justify-between gap-2 pressable-inline"
              aria-label="Open protein picker"
            >
              <span className="font-medium text-sm">
                {formatPickerDisplayValue(protein, 'g')}
              </span>
              <ChevronsUpDown size={14} className="text-muted shrink-0" />
            </button>
          </div>

          <div>
            <label className="block text-foreground text-xs font-semibold mb-2">
              Carbs (g)
            </label>
            <button
              type="button"
              onClick={() => handleOpenPicker(onOpenCarbsPicker)}
              className="w-full bg-surface-highlight text-foreground px-3 py-2 rounded-lg border border-border transition-all text-left focus-ring md:hover:border-muted/50 flex items-center justify-between gap-2 pressable-inline"
              aria-label="Open carbs picker"
            >
              <span className="font-medium text-sm">
                {formatPickerDisplayValue(carbs, 'g')}
              </span>
              <ChevronsUpDown size={14} className="text-muted shrink-0" />
            </button>
          </div>

          <div>
            <label className="block text-foreground text-xs font-semibold mb-2">
              Fats (g)
            </label>
            <button
              type="button"
              onClick={() => handleOpenPicker(onOpenFatsPicker)}
              className="w-full bg-surface-highlight text-foreground px-3 py-2 rounded-lg border border-border transition-all text-left focus-ring md:hover:border-muted/50 flex items-center justify-between gap-2 pressable-inline"
              aria-label="Open fats picker"
            >
              <span className="font-medium text-sm">
                {formatPickerDisplayValue(fats, 'g')}
              </span>
              <ChevronsUpDown size={14} className="text-muted shrink-0" />
            </button>
          </div>
        </div>

        {/* Micros Grid (optional, nullable; empty = untracked) */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-foreground text-xs font-semibold mb-2">
              Fiber (g)
            </label>
            <button
              type="button"
              onClick={() => handleOpenPicker(onOpenFiberPicker)}
              className="w-full bg-surface-highlight text-foreground px-3 py-2 rounded-lg border border-border transition-all text-left focus-ring md:hover:border-muted/50 flex items-center justify-between gap-2 pressable-inline"
              aria-label="Open fiber picker"
            >
              <span className="font-medium text-sm">
                {formatPickerDisplayValue(fiber, 'g')}
              </span>
              <ChevronsUpDown size={14} className="text-muted shrink-0" />
            </button>
          </div>

          <div>
            <label className="block text-foreground text-xs font-semibold mb-2">
              Sodium (mg)
            </label>
            <button
              type="button"
              onClick={() => handleOpenPicker(onOpenSodiumPicker)}
              className="w-full bg-surface-highlight text-foreground px-3 py-2 rounded-lg border border-border transition-all text-left focus-ring md:hover:border-muted/50 flex items-center justify-between gap-2 pressable-inline"
              aria-label="Open sodium picker"
            >
              <span className="font-medium text-sm">
                {formatPickerDisplayValue(sodium, 'mg')}
              </span>
              <ChevronsUpDown size={14} className="text-muted shrink-0" />
            </button>
          </div>

          <div>
            <label className="block text-foreground text-xs font-semibold mb-2">
              Sat. Fat (g)
            </label>
            <button
              type="button"
              onClick={() => handleOpenPicker(onOpenSaturatedFatsPicker)}
              className="w-full bg-surface-highlight text-foreground px-3 py-2 rounded-lg border border-border transition-all text-left focus-ring md:hover:border-muted/50 flex items-center justify-between gap-2 pressable-inline"
              aria-label="Open saturated fat picker"
            >
              <span className="font-medium text-sm">
                {formatPickerDisplayValue(saturatedFats, 'g')}
              </span>
              <ChevronsUpDown size={14} className="text-muted shrink-0" />
            </button>
          </div>

          <div>
            <label className="block text-foreground text-xs font-semibold mb-2">
              Sugars (g)
            </label>
            <button
              type="button"
              onClick={() => handleOpenPicker(onOpenSugarsPicker)}
              className="w-full bg-surface-highlight text-foreground px-3 py-2 rounded-lg border border-border transition-all text-left focus-ring md:hover:border-muted/50 flex items-center justify-between gap-2 pressable-inline"
              aria-label="Open sugars picker"
            >
              <span className="font-medium text-sm">
                {formatPickerDisplayValue(sugars, 'g')}
              </span>
              <ChevronsUpDown size={14} className="text-muted shrink-0" />
            </button>
          </div>
        </div>

        {smartTefEnabled && (
          <TefBurnCard
            breakdown={tefBreakdown}
            expanded={isTefExpanded}
            onToggle={() => setIsTefExpanded((prev) => !prev)}
          />
        )}

        {/* Actions - same hierarchy as the Food Portion modal: one dominant
            primary and two quiet tinted secondaries. No Cancel: the sheet
            closes by tapping outside it (plus Escape / Android back). */}
        <div className="flex flex-col gap-1.5 pt-2">
          {alreadyExists && (
            <p className="text-accent-yellow text-sm text-center">
              A food with this name already exists in favourites.
            </p>
          )}
          <button
            type="button"
            onClick={() =>
              handleSave({
                closeEntryModal: true,
                closeSearchModal: false,
              })
            }
            disabled={!foodName.trim()}
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
                handleSave({
                  closeEntryModal: true,
                  closeSearchModal: true,
                })
              }
              disabled={!foodName.trim()}
              className="rounded-xl bg-accent-blue/10 px-2.5 py-2 text-[12px] font-semibold text-accent-blue transition-all press-feedback focus-ring disabled:cursor-not-allowed disabled:bg-surface-highlight/60 disabled:text-muted md:hover:bg-accent-blue/15"
            >
              {isEditing ? 'Save & exit' : 'Log & exit'}
            </button>
            {typeof onSaveAsFavourite === 'function' && !isEditing && (
              <button
                type="button"
                onClick={handleSaveAsFavourite}
                disabled={!foodName.trim() || markedAsFavourite}
                aria-label={
                  markedAsFavourite
                    ? 'Added to favourites'
                    : 'Save as favourite'
                }
                className={`flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-[12px] font-semibold transition-all press-feedback focus-ring ${
                  markedAsFavourite
                    ? 'cursor-default bg-accent-green/15 text-accent-green'
                    : 'bg-accent-green/10 text-accent-green disabled:cursor-not-allowed disabled:bg-surface-highlight/60 disabled:text-muted md:hover:bg-accent-green/15'
                }`}
              >
                <Heart
                  size={13}
                  fill={markedAsFavourite ? 'currentColor' : 'none'}
                  aria-hidden="true"
                />
                {markedAsFavourite ? 'Favourited' : 'Save & favourite'}
              </button>
            )}
          </div>
        </div>
      </div>
    </ModalShell>
  );
};
