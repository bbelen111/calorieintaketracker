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
}) => {
  const handleSelect = (mealTypeId) => {
    onSelect?.(mealTypeId);
    onClose?.();
  };

  const getColorClasses = (color, isSelected) => {
    const colors = {
      orange: isSelected
        ? 'bg-orange-600 border-orange-500'
        : 'bg-slate-700 border-slate-600 hover:bg-orange-600/20 hover:border-orange-500/50',
      yellow: isSelected
        ? 'bg-yellow-600 border-yellow-500'
        : 'bg-slate-700 border-slate-600 hover:bg-yellow-600/20 hover:border-yellow-500/50',
      indigo: isSelected
        ? 'bg-indigo-600 border-indigo-500'
        : 'bg-slate-700 border-slate-600 hover:bg-indigo-600/20 hover:border-indigo-500/50',
      green: isSelected
        ? 'bg-green-600 border-green-500'
        : 'bg-slate-700 border-slate-600 hover:bg-green-600/20 hover:border-green-500/50',
      slate: isSelected
        ? 'bg-slate-600 border-slate-500'
        : 'bg-slate-700 border-slate-600 hover:bg-slate-600/80 hover:border-slate-500/50',
    };
    return colors[color] || colors.slate;
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
          return (
            <button
              key={mealTypeId}
              onClick={() => handleSelect(mealTypeId)}
              className={`w-full p-4 rounded-lg border-2 transition-all flex items-center gap-4 ${getColorClasses(mealType.color, isSelected)}`}
            >
              <Icon className="text-white" size={24} />
              <div className="flex-1 text-left">
                <h4 className="text-white font-semibold text-lg">
                  {mealType.label}
                </h4>
              </div>
              {isSelected && (
                <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center">
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                </div>
              )}
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
