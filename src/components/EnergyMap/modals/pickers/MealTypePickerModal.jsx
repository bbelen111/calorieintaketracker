import React from 'react';
import { Utensils } from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';
import {
  MEAL_TYPE_ORDER,
  getMealTypeById,
} from '../../../../constants/mealTypes';

export const MealTypePickerModal = ({
  isOpen,
  isClosing,
  onClose,
  onSelect,
  mealTypeItemCounts = {}, // { [mealTypeId]: number }
}) => {
  const handleSelect = (mealTypeId) => {
    onSelect?.(mealTypeId);
    onClose?.();
  };

  // Inline color/focus classes (simplified)

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      onClose={onClose}
      contentClassName="w-full md:max-w-md p-6"
    >
      <div className="flex items-center gap-3 mb-6">
        <Utensils className="text-accent-blue" size={28} />
        <h3 className="text-foreground font-bold text-2xl">Meal Type</h3>
      </div>

      <div className="space-y-3">
        {MEAL_TYPE_ORDER.map((mealTypeId) => {
          const mealType = getMealTypeById(mealTypeId);
          const Icon = mealType.icon;
          const itemCount = mealTypeItemCounts[mealTypeId] || 0;
          return (
            <button
              key={`meal-${mealTypeId}`}
              onClick={() => handleSelect(mealTypeId)}
              className="w-full p-4 rounded-xl border-2 transition-all flex items-center gap-4 shadow-sm bg-surface-highlight border-border md:hover:border-accent-blue/50 focus-ring pressable-card"
              tabIndex={0}
            >
              <Icon className="text-foreground" size={24} />
              <div className="flex-1 text-left">
                <h4 className="text-foreground font-semibold text-lg">
                  {mealType.label}
                </h4>
              </div>
              {/* Item count on right if > 0, subtle style */}
              {itemCount > 0 && (
                <span className="ml-2 text-xs text-muted font-medium px-2 py-1 rounded bg-foreground/10 border border-border">
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
          className="flex-1 px-4 py-3 bg-surface-highlight text-foreground rounded-lg font-semibold transition-all press-feedback focus-ring md:hover:bg-surface"
        >
          Cancel
        </button>
      </div>
    </ModalShell>
  );
};
