import React from 'react';
import { Utensils, Save, Heart } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';

export const FoodEntryModal = ({
  isOpen,
  isClosing,
  onClose,
  onSave,
  onSaveAsFavourite,
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
  isEditing = false,
}) => {
  const handleSave = () => {
    if (!foodName.trim()) {
      window.alert('Please enter a food name');
      return;
    }

    onSave?.();
  };

  const handleSaveAsFavourite = () => {
    if (!foodName.trim()) {
      window.alert('Please enter a food name');
      return;
    }

    if (typeof onSaveAsFavourite !== 'function') return;

    const favourite = {
      foodId: null, // Custom food, no database ID
      name: foodName.trim(),
      category: 'manual', // Manual entries get 'manual' tag
      grams: null, // Custom entries don't have grams
      calories: parseFloat(calories) || 0,
      protein: parseFloat(protein) || 0,
      carbs: parseFloat(carbs) || 0,
      fats: parseFloat(fats) || 0,
      isCustom: true,
      source: 'manual',
      per100g: null,
      portions: [],
    };

    onSaveAsFavourite(favourite);
    onSave?.();
    onClose?.();
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

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      onClose={onClose}
      contentClassName="w-full md:max-w-2xl p-6"
    >
      <div className="flex items-center gap-3 mb-6">
        <Utensils className="text-blue-400" size={28} />
        <h3 className="text-white font-bold text-2xl">
          {isEditing ? 'Edit Food Entry' : 'Custom Food Entry'}
        </h3>
      </div>

      <div className="space-y-4">
        {/* Food Name */}
        <div>
          <label className="block text-slate-300 text-sm font-semibold mb-2">
            Food Name
          </label>
          <input
            type="text"
            value={foodName}
            onChange={(e) => setFoodName(e.target.value)}
            placeholder="e.g., Chicken Breast"
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus-ring"
          />
        </div>

        {/* Calories */}
        <div>
          <label className="block text-slate-300 text-sm font-semibold mb-2">
            Calories
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={calories}
            onChange={(e) => setCalories(sanitizeNumericInput(e.target.value))}
            placeholder="0"
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus-ring"
          />
        </div>

        {/* Macros Grid */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-slate-300 text-xs font-semibold mb-2">
              Protein (g)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={protein}
              onChange={(e) => setProtein(sanitizeNumericInput(e.target.value))}
              placeholder="0"
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 focus-ring"
            />
          </div>

          <div>
            <label className="block text-slate-300 text-xs font-semibold mb-2">
              Carbs (g)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={carbs}
              onChange={(e) => setCarbs(sanitizeNumericInput(e.target.value))}
              placeholder="0"
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 focus-ring"
            />
          </div>

          <div>
            <label className="block text-slate-300 text-xs font-semibold mb-2">
              Fats (g)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={fats}
              onChange={(e) => setFats(sanitizeNumericInput(e.target.value))}
              placeholder="0"
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 focus-ring"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 pt-2">
          <div className="flex gap-2 items-center">
            {/* Save as Favourite - only show when callback provided and not editing */}
            <button
              onClick={onClose}
              className="flex-1 h-10 px-4 bg-slate-700 text-white rounded-lg font-semibold transition-all text-sm press-feedback focus-ring md:hover:bg-slate-600"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!foodName.trim()}
              className="flex-1 h-10 px-4 bg-blue-600 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-all flex items-center justify-center gap-2 text-sm press-feedback focus-ring md:hover:bg-blue-500"
            >
              <Save size={18} />
              {isEditing ? 'Save Changes' : 'Add Food'}
            </button>
            {typeof onSaveAsFavourite === 'function' && !isEditing && (
              <button
                onClick={handleSaveAsFavourite}
                disabled={!foodName.trim()}
                aria-label="Save as favourite"
                title="Save as favourite"
                className="w-10 h-10 ml-1 bg-indigo-600 md:hover:bg-indigo-500 border border-indigo-600/50 disabled:bg-slate-600/20 disabled:border-slate-600/50 disabled:cursor-not-allowed text-white disabled:text-slate-500 rounded-lg font-medium transition-all flex items-center justify-center press-feedback focus-ring"
              >
                <Heart size={20} />
              </button>
            )}
          </div>
        </div>
      </div>
    </ModalShell>
  );
};
