import React from 'react';
import { Utensils, Plus, Edit2, Trash2, ChevronRight } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';
import { getMealTypeById } from '../../../constants/mealTypes';

export const MealEntryModal = ({
  isOpen,
  isClosing,
  onClose,
  mealType,
  onMealTypeClick,
  foodEntries = [],
  onAddFood,
  onEditFood,
  onDeleteFood,
}) => {
  const mealTypeData = mealType ? getMealTypeById(mealType) : null;

  // Calculate meal totals
  const mealTotals = foodEntries.reduce(
    (acc, entry) => ({
      calories: acc.calories + (entry.calories || 0),
      protein: acc.protein + (entry.protein || 0),
      carbs: acc.carbs + (entry.carbs || 0),
      fats: acc.fats + (entry.fats || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fats: 0 }
  );

  const handleDeleteFood = (entryId) => {
    if (window.confirm('Delete this food entry?')) {
      onDeleteFood?.(entryId);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      onClose={onClose}
      contentClassName="w-full md:max-w-3xl p-6"
    >
      <div className="flex items-center gap-3 mb-6">
        <Utensils className="text-emerald-400" size={28} />
        <h3 className="text-white font-bold text-2xl">Meal Entry</h3>
      </div>

      <div className="space-y-6">
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
            {mealTypeData ? (
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

        {/* Meal Summary */}
        {mealTypeData && foodEntries.length > 0 && (
          <div className="bg-slate-700 rounded-lg p-4 border border-slate-600">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-white font-semibold text-sm">Meal Summary</h4>
              <span className="text-slate-400 text-xs">
                {foodEntries.length} item{foodEntries.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div className="text-center">
                <p className="text-emerald-400 font-bold text-lg">
                  {Math.round(mealTotals.calories)}
                </p>
                <p className="text-slate-400 text-xs">Calories</p>
              </div>
              <div className="text-center">
                <p className="text-blue-400 font-bold text-lg">
                  {Math.round(mealTotals.protein)}g
                </p>
                <p className="text-slate-400 text-xs">Protein</p>
              </div>
              <div className="text-center">
                <p className="text-amber-400 font-bold text-lg">
                  {Math.round(mealTotals.carbs)}g
                </p>
                <p className="text-slate-400 text-xs">Carbs</p>
              </div>
              <div className="text-center">
                <p className="text-purple-400 font-bold text-lg">
                  {Math.round(mealTotals.fats)}g
                </p>
                <p className="text-slate-400 text-xs">Fats</p>
              </div>
            </div>
          </div>
        )}

        {/* Food Entries */}
        {mealTypeData && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-slate-300 text-sm font-semibold">
                Food Items
              </label>
              <button
                onClick={onAddFood}
                className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold transition-all"
              >
                <Plus size={16} />
                Add Food
              </button>
            </div>

            {foodEntries.length === 0 ? (
              <div className="bg-slate-700/50 border border-slate-600 border-dashed rounded-lg p-8 text-center">
                <Utensils className="mx-auto text-slate-500 mb-3" size={32} />
                <p className="text-slate-400 text-sm mb-2">
                  No food items added yet
                </p>
                <p className="text-slate-500 text-xs">
                  Click &quot;Add Food&quot; to start tracking this meal
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                {foodEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="bg-slate-700 border border-slate-600 rounded-lg p-4 hover:bg-slate-600/50 transition-all"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h4 className="text-white font-semibold text-base">
                          {entry.name}
                        </h4>
                        {entry.timestamp && (
                          <p className="text-slate-400 text-xs mt-1">
                            {new Date(entry.timestamp).toLocaleTimeString(
                              'en-US',
                              {
                                hour: 'numeric',
                                minute: '2-digit',
                              }
                            )}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onEditFood?.(entry.id)}
                          className="p-2 hover:bg-blue-500/20 rounded-lg transition-all"
                          title="Edit food"
                        >
                          <Edit2 className="text-blue-400" size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteFood(entry.id)}
                          className="p-2 hover:bg-red-500/20 rounded-lg transition-all"
                          title="Delete food"
                        >
                          <Trash2 className="text-red-400" size={16} />
                        </button>
                      </div>
                    </div>

                    {/* Nutrition Info */}
                    <div className="grid grid-cols-4 gap-2 text-center pt-3 border-t border-slate-600">
                      <div>
                        <p className="text-emerald-400 font-semibold text-sm">
                          {entry.calories || 0}
                        </p>
                        <p className="text-slate-400 text-xs">cal</p>
                      </div>
                      <div>
                        <p className="text-blue-400 font-semibold text-sm">
                          {entry.protein || 0}g
                        </p>
                        <p className="text-slate-400 text-xs">protein</p>
                      </div>
                      <div>
                        <p className="text-amber-400 font-semibold text-sm">
                          {entry.carbs || 0}g
                        </p>
                        <p className="text-slate-400 text-xs">carbs</p>
                      </div>
                      <div>
                        <p className="text-purple-400 font-semibold text-sm">
                          {entry.fats || 0}g
                        </p>
                        <p className="text-slate-400 text-xs">fats</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!mealTypeData && (
          <div className="bg-slate-700/50 border border-slate-600 border-dashed rounded-lg p-8 text-center">
            <Utensils className="mx-auto text-slate-500 mb-3" size={32} />
            <p className="text-slate-400 text-sm">
              Select a meal type to start adding food items
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition-all"
          >
            Done
          </button>
        </div>
      </div>
    </ModalShell>
  );
};
