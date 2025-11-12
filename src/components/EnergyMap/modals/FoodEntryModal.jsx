import React from 'react';
import { Utensils, Save } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';

export const FoodEntryModal = ({
  isOpen,
  isClosing,
  onClose,
  onSave,
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
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
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
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
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
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
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
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
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
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition-all flex items-center justify-center gap-2"
          >
            <Save size={18} />
            {isEditing ? 'Save Changes' : 'Add Food'}
          </button>
        </div>
      </div>
    </ModalShell>
  );
};
