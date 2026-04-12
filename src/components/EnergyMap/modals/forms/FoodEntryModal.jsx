import React, { useState, useEffect, useMemo } from 'react';
import { Utensils, Save, Heart, Check, ChevronsUpDown } from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';
import {
  calculateTefFromMacros,
  TEF_PROTEIN_RATE,
  TEF_CARB_RATE,
  TEF_FAT_RATE,
} from '../../../../utils/calculations/calculations';
import { formatOne } from '../../../../utils/formatting/format';

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
  onOpenCaloriesPicker,
  onOpenProteinPicker,
  onOpenCarbsPicker,
  onOpenFatsPicker,
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
      isCustom: false, // Not a custom food, it's a manual entry
      source: 'manual',
      per100g: null,
      portions: [],
    };

    onSaveAsFavourite(favourite);
    setMarkedAsFavourite(true);
    // Don't close - just mark as favourited
  };

  const formatPickerValue = (value, unit = '') => {
    const numericValue = Number.parseFloat(value);
    if (!Number.isFinite(numericValue)) {
      return unit ? `0 ${unit}` : '0';
    }

    const formatted = Number.isInteger(numericValue)
      ? String(numericValue)
      : numericValue.toFixed(1).replace(/\.0$/, '');

    return unit ? `${formatted} ${unit}` : formatted;
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
            Calories
          </label>
          <button
            type="button"
            onClick={() => handleOpenPicker(onOpenCaloriesPicker)}
            className="w-full bg-surface-highlight text-foreground px-4 py-3 rounded-lg border border-border transition-all text-left focus-ring md:hover:border-muted/50 flex items-center justify-between gap-3 pressable-inline"
            aria-label="Open calories picker"
          >
            <span className="font-medium text-base">
              {formatPickerValue(calories, 'kcal')}
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
                {formatPickerValue(protein, 'g')}
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
                {formatPickerValue(carbs, 'g')}
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
                {formatPickerValue(fats, 'g')}
              </span>
              <ChevronsUpDown size={14} className="text-muted shrink-0" />
            </button>
          </div>
        </div>

        {smartTefEnabled && (
          <div className="rounded-lg border border-accent-blue/70 bg-accent-blue overflow-hidden">
            <button
              type="button"
              onClick={() => setIsTefExpanded((prev) => !prev)}
              aria-expanded={isTefExpanded}
              className="w-full px-4 py-3 text-left transition-all rounded-lg pressable-card focus-ring md:hover:brightness-110"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-primary-foreground font-semibold text-md">
                    TEF Burn
                  </p>
                </div>
                <p className="text-primary-foreground font-bold text-md whitespace-nowrap">
                  {tefBreakdown.roundedTotalCalories.toLocaleString()} kcal
                </p>
              </div>
              <div className="flex justify-center mt-2">
                <span className="h-1 w-20 rounded-full bg-foreground/30" />
              </div>
            </button>

            <div
              className={`overflow-hidden transition-all duration-300 ease-out px-4 ${
                isTefExpanded
                  ? 'max-h-96 opacity-100 pb-4'
                  : 'max-h-0 opacity-0'
              }`}
            >
              <div className="rounded-lg border border-border bg-surface p-3 space-y-2 text-xs text-foreground/80">
                <div className="flex items-center justify-between gap-3">
                  <p>
                    <span className="text-accent-red font-semibold">
                      Protein
                    </span>{' '}
                    = {formatOne(tefBreakdown.proteinGrams)}g × 4 × 25%
                  </p>
                  <p className="text-accent-red font-semibold">
                    {formatOne(tefBreakdown.proteinTefCalories)} kcal
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <p>
                    <span className="text-accent-amber font-semibold">
                      Carbs
                    </span>{' '}
                    = {formatOne(tefBreakdown.carbsGrams)}g × 4 × 8%
                  </p>
                  <p className="text-accent-amber font-semibold">
                    {formatOne(tefBreakdown.carbsTefCalories)} kcal
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <p>
                    <span className="text-accent-yellow font-semibold">
                      Fats
                    </span>{' '}
                    = {formatOne(tefBreakdown.fatsGrams)}g × 9 × 2%
                  </p>
                  <p className="text-accent-yellow font-semibold">
                    {formatOne(tefBreakdown.fatsTefCalories)} kcal
                  </p>
                </div>
                <div className="pt-2 border-t border-border/60 space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-foreground/90 font-semibold">
                      TEF subtotal (Rounded)
                    </p>
                    <p className="text-foreground/90 font-semibold">
                      {tefBreakdown.roundedTotalCalories} kcal
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2 pt-2">
          {alreadyExists && (
            <p className="text-accent-yellow text-sm text-center">
              A food with this name already exists in favourites.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleSave({ closeModal: false })}
              disabled={!foodName.trim()}
              className="h-10 px-3 bg-primary disabled:bg-surface-highlight/60 disabled:cursor-not-allowed disabled:text-muted text-primary-foreground rounded-lg font-semibold transition-all flex items-center justify-center gap-2 text-sm press-feedback focus-ring md:hover:brightness-110"
            >
              <Save size={18} />
              {isEditing ? 'Save' : 'Log'}
            </button>
            <button
              onClick={() => handleSave({ closeModal: true })}
              disabled={!foodName.trim()}
              className="h-10 px-3 bg-accent-blue disabled:bg-surface-highlight/60 disabled:cursor-not-allowed disabled:text-muted text-primary-foreground rounded-lg font-semibold transition-all flex items-center justify-center gap-2 text-sm press-feedback focus-ring md:hover:brightness-110"
            >
              <Save size={18} />
              {isEditing ? 'Save & Exit' : 'Log & Exit'}
            </button>
          </div>

          <div className="flex gap-2 items-center">
            <button
              onClick={onClose}
              className="flex-1 h-10 px-4 bg-surface-highlight text-foreground rounded-lg font-semibold transition-all text-sm press-feedback focus-ring md:hover:bg-surface"
            >
              Cancel
            </button>
            {typeof onSaveAsFavourite === 'function' && !isEditing && (
              <button
                onClick={handleSaveAsFavourite}
                disabled={!foodName.trim() || markedAsFavourite}
                aria-label={
                  markedAsFavourite
                    ? 'Added to favourites'
                    : 'Save as favourite'
                }
                title={
                  markedAsFavourite
                    ? 'Added to favourites'
                    : 'Save as favourite'
                }
                className={`w-10 h-10 border disabled:cursor-not-allowed text-primary-foreground rounded-lg font-medium transition-all flex items-center justify-center press-feedback focus-ring ${
                  markedAsFavourite
                    ? 'bg-accent-green border-accent-green/50 text-primary-foreground'
                    : 'bg-accent-indigo md:hover:brightness-110 border-accent-indigo/50 text-primary-foreground disabled:bg-surface-highlight/30 disabled:border-border/60 disabled:text-muted'
                }`}
              >
                {markedAsFavourite ? <Check size={20} /> : <Heart size={20} />}
              </button>
            )}
          </div>
        </div>
      </div>
    </ModalShell>
  );
};
