import React, { useEffect, useMemo, useState } from 'react';
import { Heart, Plus, Trash2, Edit3, Utensils } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';
import { useAnimatedModal } from '../../../hooks/useAnimatedModal';
import { ConfirmActionModal } from './ConfirmActionModal';
import {
  FOOD_CATEGORIES,
  FOOD_DATABASE,
} from '../../../constants/foodDatabase';
import { formatOne } from '../../../utils/format';

/**
 * Resolves a food item from the database by ID or returns null
 */
const resolveFoodById = (foodId) => {
  if (!foodId) return null;
  return FOOD_DATABASE.find((food) => food.id === foodId) ?? null;
};

/**
 * Builds a display-friendly food object from a favourite entry
 * Handles both database foods and custom entries
 */
const buildDisplayFood = (favourite) => {
  if (!favourite) return null;

  // For database foods, try to resolve current data
  if (favourite.foodId) {
    const dbFood = resolveFoodById(favourite.foodId);
    if (dbFood) {
      return {
        ...dbFood,
        // Override with favourite's saved portion info
        savedGrams: favourite.grams,
        savedCalories: favourite.calories,
        savedProtein: favourite.protein,
        savedCarbs: favourite.carbs,
        savedFats: favourite.fats,
      };
    }
  }

  // For custom foods or if database food not found, use stored data
  const hasGrams = favourite.grams > 0;
  return {
    id: favourite.id,
    foodId: favourite.foodId,
    name: favourite.name || 'Custom Food',
    category: favourite.category || 'supplements',
    isCustom: favourite.isCustom ?? true,
    per100g: favourite.per100g || {
      calories: hasGrams
        ? Math.round((favourite.calories / favourite.grams) * 100)
        : 0,
      protein: hasGrams
        ? Math.round(((favourite.protein || 0) / favourite.grams) * 100 * 10) /
          10
        : 0,
      carbs: hasGrams
        ? Math.round(((favourite.carbs || 0) / favourite.grams) * 100 * 10) / 10
        : 0,
      fats: hasGrams
        ? Math.round(((favourite.fats || 0) / favourite.grams) * 100 * 10) / 10
        : 0,
    },
    portions: favourite.portions || [],
    savedGrams: favourite.grams,
    savedCalories: favourite.calories,
    savedProtein: favourite.protein,
    savedCarbs: favourite.carbs,
    savedFats: favourite.fats,
  };
};

const getCategoryColor = (category) => {
  return FOOD_CATEGORIES[category]?.color || 'slate';
};

export const FoodFavouritesModal = ({
  isOpen,
  isClosing,
  favourites = [],
  onSelectFavourite,
  onEditFavourite,
  onCreateFavourite,
  onDeleteFavourite,
  onClose,
}) => {
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const {
    isOpen: isConfirmOpen,
    isClosing: isConfirmClosing,
    open: openConfirm,
    requestClose: requestConfirmClose,
    forceClose: forceConfirmClose,
  } = useAnimatedModal(false);

  const sortedFavourites = useMemo(() => {
    if (!Array.isArray(favourites)) {
      return [];
    }

    return favourites
      .filter(Boolean)
      .slice()
      .sort((a, b) => {
        const nameA = (a.name || '').toLowerCase();
        const nameB = (b.name || '').toLowerCase();
        if (nameA === nameB) {
          return (a.grams || 0) - (b.grams || 0);
        }
        return nameA.localeCompare(nameB);
      });
  }, [favourites]);

  const hasFavourites = sortedFavourites.length > 0;

  useEffect(() => {
    if (!isOpen) {
      forceConfirmClose();
    }
  }, [forceConfirmClose, isOpen]);

  useEffect(() => {
    if (!isConfirmOpen && !isConfirmClosing) {
      const timeout = setTimeout(() => {
        setPendingDeleteId(null);
      }, 0);
      return () => clearTimeout(timeout);
    }
  }, [isConfirmClosing, isConfirmOpen]);

  const handleInstantAdd = (favourite, event) => {
    event?.stopPropagation();

    // Build food entry for instant add
    const foodEntry = {
      id: Date.now(),
      foodId: favourite.foodId,
      name: favourite.name,
      calories: favourite.calories || 0,
      protein: favourite.protein || 0,
      carbs: favourite.carbs || 0,
      fats: favourite.fats || 0,
      grams: favourite.grams || null,
      timestamp: new Date().toISOString(),
    };

    onSelectFavourite?.(foodEntry, favourite);
  };

  const handleEditPortion = (favourite, event) => {
    event?.stopPropagation();

    const displayFood = buildDisplayFood(favourite);
    if (!displayFood) return;

    onEditFavourite?.(displayFood, favourite);
  };

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      onClose={onClose}
      contentClassName="p-4 md:p-6 w-full md:max-w-lg"
    >
      <div className="flex flex-col gap-4 md:gap-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-white font-bold text-xl md:text-2xl">
              Favourite Foods
            </h3>
            <p className="text-slate-400 text-sm md:text-base mt-1">
              Save your go-to foods with preset portions.
            </p>
          </div>
          {typeof onCreateFavourite === 'function' && (
            <button
              type="button"
              onClick={() => onCreateFavourite?.()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-100 transition-colors hover:border-amber-400 hover:text-white"
            >
              <Plus size={16} />
              Add
            </button>
          )}
        </div>

        <div
          className="space-y-3 overflow-y-auto pr-1 max-h-[60vh]"
          role="list"
        >
          {hasFavourites ? (
            sortedFavourites.map((favourite) => {
              const key =
                favourite.id ?? `${favourite.name}-${favourite.grams}`;
              const isCustom = favourite.isCustom || !favourite.foodId;
              const categoryColor = getCategoryColor(
                favourite.category || 'supplements'
              );

              return (
                <div
                  key={key}
                  className="w-full text-left p-4 rounded-xl border-2 transition-all bg-slate-700 border-slate-600 text-slate-200 hover:border-blue-400"
                  role="listitem"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 rounded-full p-2 bg-white/10">
                      {isCustom ? (
                        <Utensils size={18} className="text-purple-400" />
                      ) : (
                        <Heart size={18} className="text-red-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-base md:text-lg leading-tight text-white truncate">
                        {favourite.name || 'Unnamed Food'}
                      </p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span
                          className={`text-xs px-2 py-0.5 rounded bg-${categoryColor}-500/20 text-${categoryColor}-400`}
                        >
                          {FOOD_CATEGORIES[favourite.category]?.label ||
                            'Custom'}
                        </span>
                        {favourite.grams && (
                          <span className="text-xs text-slate-400">
                            {formatOne(favourite.grams)}g
                          </span>
                        )}
                        {isCustom && (
                          <span className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded">
                            Custom
                          </span>
                        )}
                      </div>

                      {/* Nutrition summary */}
                      <div className="flex items-center gap-3 mt-2 text-xs">
                        <span className="text-emerald-400 font-medium">
                          {formatOne(favourite.calories || 0)} cal
                        </span>
                        <span className="text-red-400 font-medium">
                          {formatOne(favourite.protein || 0)}g P
                        </span>
                        <span className="text-amber-400 font-medium">
                          {formatOne(favourite.carbs || 0)}g C
                        </span>
                        <span className="text-yellow-400 font-medium">
                          {formatOne(favourite.fats || 0)}g F
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      {/* Edit portion button */}
                      <button
                        type="button"
                        onClick={(e) => handleEditPortion(favourite, e)}
                        className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/20 hover:bg-blue-500/30 transition-colors flex items-center justify-center"
                        aria-label="Edit portion before adding"
                        title="Edit portion"
                      >
                        <Edit3 size={14} className="text-blue-400" />
                      </button>

                      {/* Delete button */}
                      {typeof onDeleteFavourite === 'function' &&
                        favourite.id != null && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setPendingDeleteId(favourite.id);
                              openConfirm();
                            }}
                            className="flex-shrink-0 w-8 h-8 rounded-full bg-white/10 hover:bg-red-500/20 transition-colors flex items-center justify-center"
                            aria-label="Delete favourite food"
                            title="Remove from favourites"
                          >
                            <Trash2
                              size={14}
                              className="text-slate-400 hover:text-red-400"
                            />
                          </button>
                        )}
                    </div>
                  </div>

                  {/* Quick add button - full width at bottom */}
                  <button
                    type="button"
                    onClick={(e) => handleInstantAdd(favourite, e)}
                    className="w-full mt-3 py-2 bg-emerald-600/80 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                    <Plus size={16} />
                    Quick Add
                  </button>
                </div>
              );
            })
          ) : (
            <div className="text-center text-slate-400 text-sm py-10">
              <Heart className="mx-auto mb-3 text-slate-500" size={32} />
              <p>No favourite foods yet.</p>
              <p className="text-xs mt-1">
                Add foods to your favourites for quick access.
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            type="button"
            className="flex-1 bg-slate-700 active:bg-slate-600 text-white px-4 py-3 rounded-lg transition-all active:scale-95 font-medium"
          >
            Close
          </button>
        </div>
      </div>

      <ConfirmActionModal
        isOpen={isConfirmOpen}
        isClosing={isConfirmClosing}
        title="Remove favourite food?"
        description="This food will be removed from your favourites list. You can add it back anytime."
        confirmLabel="Delete"
        cancelLabel="Keep"
        tone="danger"
        onConfirm={() => {
          requestConfirmClose();
          if (pendingDeleteId != null) {
            onDeleteFavourite?.(pendingDeleteId);
          }
        }}
        onCancel={() => requestConfirmClose()}
      />
    </ModalShell>
  );
};
