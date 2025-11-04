import React from 'react';
import { Utensils } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';
import { MEAL_TYPE_ORDER, getMealTypeById } from '../../../constants/mealTypes';

export const MealTypePickerModal = ({
  isOpen,
  isClosing,
  onClose,
  onSelect,
  selectedMealType,
  mealTypeItemCounts = {}, // { [mealTypeId]: number }
}) => {
  const handleSelect = (mealTypeId) => {
    onSelect?.(mealTypeId);
    onClose?.();
  };

  // Unify focus/hover color to blue
  const getColorClasses = (color, isSelected) => {
    const base = isSelected
      ? 'bg-blue-600 border-blue-500'
      : 'bg-slate-700 border-slate-600 hover:bg-blue-600/20 hover:border-blue-500/50 focus:ring-2 focus:ring-blue-400';
    return base;
  };

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      onClose={onClose}
      contentClassName="w-full md:max-w-md p-6"
    >
      <div className="flex items-center gap-3 mb-6">
        <Utensils className="text-emerald-400" size={28} />
        <h3 className="text-white font-bold text-2xl">Select Meal Type</h3>
      </div>

      <div className="space-y-3">
        {MEAL_TYPE_ORDER.map((mealTypeId) => {
          const mealType = getMealTypeById(mealTypeId);
          const isSelected = selectedMealType === mealTypeId;
          const Icon = mealType.icon;
          const itemCount = mealTypeItemCounts[mealTypeId] || 0;
          return (
            <button
              key={mealTypeId}
              onClick={() => handleSelect(mealTypeId)}
              className={`w-full p-4 rounded-lg border-2 transition-all flex items-center gap-4 ${getColorClasses(mealType.color, isSelected)}`}
              tabIndex={0}
            >
              <Icon className="text-white" size={24} />
              <div className="flex-1 text-left">
                <h4 className="text-white font-semibold text-lg">
                  {mealType.label}
                </h4>
              </div>
              {/* Item count on right if > 0, subtle style */}
              {itemCount > 0 && (
                <span className="ml-2 text-xs text-slate-400 font-medium px-2 py-1 rounded bg-slate-800/60">
                  {itemCount} food {itemCount === 1 ? 'item' : 'items'}
                </span>
              )}
              {/* Removed selection circle for selected meal type */}
            </button>
          );
        })}
      </div>

      <div className="flex gap-3 mt-6">
        <button
          onClick={onClose}
          className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition-all"
        >
          Cancel
        </button>
      </div>
    </ModalShell>
  );
};
