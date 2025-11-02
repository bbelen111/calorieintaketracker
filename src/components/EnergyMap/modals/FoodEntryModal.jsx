import React from 'react';
import { Utensils, Save, ChevronRight } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';
import { getMealTypeById } from '../../../constants/mealTypes';

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
  mealType,
  onMealTypeClick,
  isEditing = false,
}) => {
  const handleSave = () => {
    if (!foodName.trim()) {
      window.alert('Please enter a food name');
      return;
    }

    if (!mealType) {
      window.alert('Please select a meal type');
      return;
    }

    onSave?.();
  };

  const mealTypeData = getMealTypeById(mealType);

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      onClose={onClose}
      contentClassName="w-full md:max-w-2xl p-6"
    >
      <div className="flex items-center gap-3 mb-6">
        <Utensils className="text-emerald-400" size={28} />
        <h3 className="text-white font-bold text-2xl">
          {isEditing ? 'Edit Food Entry' : 'Add Food Entry'}
        </h3>
      </div>

      <div className="space-y-4">
        {/* Meal Type Selector */}
        <div>
          <label className="block text-slate-300 text-sm font-semibold mb-2">
            Meal Type
          </label>
          <button
            type="button"
            onClick={onMealTypeClick}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-left hover:bg-slate-600 transition-all flex items-center justify-between"
          >
            {mealType ? (
              <div className="flex items-center gap-3">
                <span className="text-2xl">{mealTypeData.icon}</span>
                <span className="text-white font-semibold">
                  {mealTypeData.label}
                </span>
              </div>
            ) : (
              <span className="text-slate-400">Select meal type...</span>
            )}
            <ChevronRight className="text-slate-400" size={20} />
          </button>
        </div>

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
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            autoFocus
          />
        </div>

        {/* Calories */}
        <div>
          <label className="block text-slate-300 text-sm font-semibold mb-2">
            Calories
          </label>
          <input
            type="number"
            value={calories}
            onChange={(e) => setCalories(e.target.value)}
            placeholder="0"
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* Macros Grid */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-slate-300 text-xs font-semibold mb-2">
              Protein (g)
            </label>
            <input
              type="number"
              value={protein}
              onChange={(e) => setProtein(e.target.value)}
              placeholder="0"
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 text-xs font-semibold mb-2">
              Carbs (g)
            </label>
            <input
              type="number"
              value={carbs}
              onChange={(e) => setCarbs(e.target.value)}
              placeholder="0"
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 text-xs font-semibold mb-2">
              Fats (g)
            </label>
            <input
              type="number"
              value={fats}
              onChange={(e) => setFats(e.target.value)}
              placeholder="0"
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
            className="flex-1 px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold transition-all flex items-center justify-center gap-2"
          >
            <Save size={18} />
            {isEditing ? 'Save Changes' : 'Add Food'}
          </button>
        </div>
      </div>
    </ModalShell>
  );
};
