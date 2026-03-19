import React, { useState, useEffect, useMemo } from 'react';
import { Utensils, Save, Heart, Check } from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';
import { calculateTefFromMacros } from '../../../../utils/calculations';

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
  setCalories,
  protein,
  setProtein,
  carbs,
  setCarbs,
  fats,
  setFats,
  smartTefEnabled = false,
  isEditing = false,
}) => {
  const [markedAsFavourite, setMarkedAsFavourite] = useState(false);
  const [alreadyExists, setAlreadyExists] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      // Use a timeout to avoid synchronous setState in effect
      const timer = setTimeout(() => {
        setMarkedAsFavourite(false);
        setAlreadyExists(false);
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

  const handleSave = () => {
    if (!foodName.trim()) {
      window.alert('Please enter a food name');
      return;
    }

    // Just save - no duplicate check dialog needed
    onSave?.();
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

  const sanitizeNumericInput = (value) => {
    // allow empty string
    if (value === '') return '';
    // remove any characters except digits and dot
    const cleaned = String(value).replace(/[^0-9.]/g, '');
    // if there's no dot or only one, return as-is (but keep only digits and single dot)
    const parts = cleaned.split('.');
    if (parts.length <= 1) return parts[0];
    // keep first dot only, join the rest (prevents multiple dots)
    return parts.shift() + '.' + parts.join('');
  };

  const rawFoodTef = useMemo(
    () =>
      calculateTefFromMacros({
        proteinGrams: parseFloat(protein) || 0,
        carbsGrams: parseFloat(carbs) || 0,
        fatsGrams: parseFloat(fats) || 0,
      }),
    [protein, carbs, fats]
  );

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
          <input
            type="text"
            inputMode="decimal"
            value={calories}
            onChange={(e) => setCalories(sanitizeNumericInput(e.target.value))}
            placeholder="0"
            className="w-full bg-surface-highlight border border-border rounded-lg px-4 py-3 text-foreground placeholder:text-muted focus-ring"
          />
        </div>

        {/* Macros Grid */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-foreground text-xs font-semibold mb-2">
              Protein (g)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={protein}
              onChange={(e) => setProtein(sanitizeNumericInput(e.target.value))}
              placeholder="0"
              className="w-full bg-surface-highlight border border-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted focus-ring"
            />
          </div>

          <div>
            <label className="block text-foreground text-xs font-semibold mb-2">
              Carbs (g)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={carbs}
              onChange={(e) => setCarbs(sanitizeNumericInput(e.target.value))}
              placeholder="0"
              className="w-full bg-surface-highlight border border-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted focus-ring"
            />
          </div>

          <div>
            <label className="block text-foreground text-xs font-semibold mb-2">
              Fats (g)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={fats}
              onChange={(e) => setFats(sanitizeNumericInput(e.target.value))}
              placeholder="0"
              className="w-full bg-surface-highlight border border-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted focus-ring"
            />
          </div>
        </div>

        {smartTefEnabled && (
          <div className="rounded-lg border border-accent-blue/70 bg-accent-blue px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <p className="text-white font-semibold text-sm">TEF Burn</p>
              <p className="text-white font-bold text-sm whitespace-nowrap">
                {rawFoodTef.toLocaleString()} kcal
              </p>
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
          <div className="flex gap-2 items-center">
            {/* Save as Favourite - only show when callback provided and not editing */}
            <button
              onClick={onClose}
              className="flex-1 h-10 px-4 bg-surface-highlight text-foreground rounded-lg font-semibold transition-all text-sm press-feedback focus-ring md:hover:bg-surface"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!foodName.trim()}
              className="flex-1 h-10 px-4 bg-blue-600 disabled:bg-surface-highlight/60 disabled:cursor-not-allowed disabled:text-muted text-white rounded-lg font-semibold transition-all flex items-center justify-center gap-2 text-sm press-feedback focus-ring md:hover:bg-blue-500"
            >
              <Save size={18} />
              {isEditing ? 'Add & Save' : 'Add Food'}
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
                className={`w-10 h-10 ml-1 border disabled:cursor-not-allowed text-white rounded-lg font-medium transition-all flex items-center justify-center press-feedback focus-ring ${
                  markedAsFavourite
                    ? 'bg-green-600 border-green-500/50'
                    : 'bg-indigo-600 md:hover:bg-indigo-500 border-indigo-600/50 disabled:bg-surface-highlight/30 disabled:border-border/60 disabled:text-muted'
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
