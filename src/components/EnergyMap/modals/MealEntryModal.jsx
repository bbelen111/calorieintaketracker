import React from 'react';
import { Utensils, Plus, Edit3, Trash2, ChevronRight } from 'lucide-react';
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

  // Latest timestamp for this meal (used in unified header)
  const latestTimestamp = foodEntries.reduce((latest, entry) => {
    const t =
      entry && entry.timestamp ? new Date(entry.timestamp).getTime() : 0;
    return t > latest ? t : latest;
  }, 0);
  const mealTime = latestTimestamp
    ? new Date(latestTimestamp).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

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
        <Utensils className="text-blue-400" size={28} />
        <h3 className="text-white font-bold text-2xl">Meal Entry</h3>
      </div>

      <div className="space-y-6">
        {/* Meal Type + Summary (unified) */}
        <div>
          {/* Unified container so selector and totals look like one box */}
          <div className="">
            <div className="bg-slate-700/50 rounded-lg border border-slate-600 overflow-hidden">
              <div className="flex flex-col md:flex-row items-stretch">
                <button
                  type="button"
                  onClick={onMealTypeClick}
                  className="w-full md:w-64 bg-transparent px-4 py-3 md:pr-4 text-left hover:bg-slate-700/25 transition-all flex items-center justify-between md:border-r md:border-slate-600/50"
                >
                  {mealTypeData ? (
                    <div className="flex items-center gap-3">
                      {React.createElement(mealTypeData.icon, {
                        className: 'text-white',
                        size: 20,
                      })}
                      <div className="flex items-baseline gap-2">
                        <span className="text-white font-semibold">
                          {mealTypeData.label}
                        </span>
                        {mealTime && (
                          <span className="text-slate-400 text-xs">
                            {mealTime}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <span className="text-slate-400">Select meal type...</span>
                  )}
                  <ChevronRight className="text-slate-400" size={20} />
                </button>

                {mealTypeData && foodEntries.length > 0 && (
                  <div className="p-3 flex-1 border-t border-slate-600">
                    <div className="grid grid-cols-4 gap-3 text-center">
                      <div>
                        <p className="text-emerald-400 font-bold text-base">
                          {Math.round(mealTotals.calories)}
                        </p>
                        <p className="text-slate-400 text-xs">kcal</p>
                      </div>
                      <div>
                        <p className="text-red-400 font-bold text-base">
                          {Math.round(mealTotals.protein)}g
                        </p>
                        <p className="text-slate-400 text-xs">protein</p>
                      </div>
                      <div>
                        <p className="text-yellow-400 font-bold text-base">
                          {Math.round(mealTotals.fats)}g
                        </p>
                        <p className="text-slate-400 text-xs">fats</p>
                      </div>
                      <div>
                        <p className="text-amber-400 font-bold text-base">
                          {Math.round(mealTotals.carbs)}g
                        </p>
                        <p className="text-slate-400 text-xs">carbs</p>
                      </div>
                    </div>
                    {/* mealTime moved beside meal type for cleaner layout */}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Food Entries */}
        {mealTypeData && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-slate-300 text-sm font-semibold">
                Food Items
              </label>
              <button
                onClick={onAddFood}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition-all"
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
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {foodEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="bg-slate-700/50 rounded-lg p-3 border border-slate-600/50 flex justify-between items-start gap-3 shadow-lg shadow-slate-900/20"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold text-sm truncate">
                        {entry.name}
                      </p>
                      <p className="text-slate-400 text-xs">
                        <span className="text-emerald-400">{`${entry.calories || 0} kcal`}</span>
                        {' • '}
                        <span className="text-red-400">{`${entry.protein || 0} p`}</span>
                        {' • '}
                        <span className="text-yellow-400">{`${entry.fats || 0} f`}</span>
                        {' • '}
                        <span className="text-amber-400">{`${entry.carbs || 0} c`}</span>
                      </p>
                    </div>

                    <div className="flex items-end gap-3">
                      <button
                        onClick={() => onEditFood?.(entry.id)}
                        type="button"
                        className="text-slate-200 hover:text-white transition-all hover:scale-110 active:scale-95"
                        title="Edit food"
                      >
                        <Edit3 size={22} />
                      </button>
                      <button
                        onClick={() => handleDeleteFood(entry.id)}
                        type="button"
                        className="text-red-400 hover:text-red-300 transition-all hover:scale-110 active:scale-95"
                        title="Delete food"
                      >
                        <Trash2 size={22} />
                      </button>
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
