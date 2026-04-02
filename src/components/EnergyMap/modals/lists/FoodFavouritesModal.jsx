import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Heart, Plus, Trash2, Edit3, Utensils } from 'lucide-react';
import { shallow } from 'zustand/shallow';
import { ModalShell } from '../../common/ModalShell';
import { useAnimatedModal } from '../../../../hooks/useAnimatedModal';
import { useEnergyMapStore } from '../../../../store/useEnergyMapStore';
import { ConfirmActionModal } from '../common/ConfirmActionModal';
import { FOOD_CATEGORIES } from '../../../../constants/foodDatabase';
import { getFoodById as getFoodByIdFromCatalog } from '../../../../services/foodCatalog';
import { formatOne } from '../../../../utils/format';

/**
 * Builds a display-friendly food object from a favourite entry
 * Handles both database foods and custom entries
 */
const buildDisplayFood = (favourite, dbFoodLookup = {}) => {
  if (!favourite) return null;

  // For database foods, try to resolve current data
  if (favourite.foodId) {
    const dbFood = dbFoodLookup[favourite.foodId] ?? null;
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
    brand: favourite.brand || null,
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

const getCategoryTagClass = (category) => {
  const color = getCategoryColor(category);
  const map = {
    red: 'bg-accent-red/20 text-accent-red',
    amber: 'bg-accent-amber/20 text-accent-amber',
    green: 'bg-accent-green/20 text-accent-green',
    yellow: 'bg-accent-yellow/20 text-accent-yellow',
    purple: 'bg-accent-purple/20 text-accent-purple',
    blue: 'bg-accent-blue/20 text-accent-blue',
    emerald: 'bg-accent-emerald/20 text-accent-emerald',
    slate: 'bg-surface-highlight/60 text-muted',
    indigo: 'bg-accent-blue/20 text-accent-blue',
  };
  return map[color] || 'bg-surface-highlight/60 text-muted';
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
  const { foodFavourites, removeFoodFavourite } = useEnergyMapStore(
    (state) => ({
      foodFavourites: state.foodFavourites,
      removeFoodFavourite: state.removeFoodFavourite,
    }),
    shallow
  );
  const resolvedFavourites = favourites ?? foodFavourites;
  const resolvedDeleteFavourite = onDeleteFavourite ?? removeFoodFavourite;
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [dbFoodLookup, setDbFoodLookup] = useState({});
  const entryIdRef = useRef(1);
  const {
    isOpen: isConfirmOpen,
    isClosing: isConfirmClosing,
    open: openConfirm,
    requestClose: requestConfirmClose,
    forceClose: forceConfirmClose,
  } = useAnimatedModal(false);

  const sortedFavourites = useMemo(() => {
    if (!Array.isArray(resolvedFavourites)) {
      return [];
    }

    return resolvedFavourites
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
  }, [resolvedFavourites]);

  const hasFavourites = sortedFavourites.length > 0;

  useEffect(() => {
    const uniqueFoodIds = Array.from(
      new Set(
        (sortedFavourites ?? [])
          .map((favourite) => favourite?.foodId)
          .filter((foodId) => typeof foodId === 'string' && foodId.length > 0)
      )
    );

    if (uniqueFoodIds.length === 0) {
      setDbFoodLookup({});
      return;
    }

    let cancelled = false;

    Promise.all(
      uniqueFoodIds.map(async (foodId) => [foodId, await getFoodByIdFromCatalog(foodId)])
    )
      .then((pairs) => {
        if (cancelled) {
          return;
        }

        setDbFoodLookup(
          Object.fromEntries(pairs.filter(([, food]) => Boolean(food)))
        );
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        console.error('Failed to resolve favourite foods:', error);
        setDbFoodLookup({});
      });

    return () => {
      cancelled = true;
    };
  }, [sortedFavourites]);

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

    const entryId = entryIdRef.current;
    entryIdRef.current += 1;

    // Build food entry for instant add
    const foodEntry = {
      id: entryId,
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

    const displayFood = buildDisplayFood(favourite, dbFoodLookup);
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
            <h3 className="text-foreground font-bold text-xl md:text-2xl">
              Favourite Foods
            </h3>
            <p className="text-muted text-sm md:text-base mt-1">
              Save your go-to foods with preset portions.
            </p>
          </div>
          {typeof onCreateFavourite === 'function' && (
            <button
              type="button"
              onClick={() => onCreateFavourite?.()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-highlight px-3 py-2 text-sm font-medium text-foreground transition-colors md:hover:border-accent-amber focus-ring pressable"
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

              return (
                <div
                  key={key}
                  className="w-full text-left p-4 rounded-xl border-2 transition-all bg-surface border-border text-foreground md:hover:border-accent-blue focus-visible:border-accent-blue focus-visible:ring-2 focus-visible:ring-accent-blue/40 cursor-pointer"
                  role="button"
                  tabIndex={0}
                  onClick={(event) => handleInstantAdd(favourite, event)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleInstantAdd(favourite, event);
                    }
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 rounded-full p-2 bg-foreground/10">
                      {isCustom ? (
                        <Utensils size={18} className="text-foreground" />
                      ) : (
                        <Heart size={18} className="text-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-base md:text-lg leading-tight text-foreground truncate">
                        {favourite.name || 'Unnamed Food'}
                      </p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${getCategoryTagClass(
                            favourite.category || 'supplements'
                          )}`}
                        >
                          {FOOD_CATEGORIES[favourite.category]?.label ||
                            'Custom'}
                        </span>
                        {favourite.brand && (
                          <span className="text-xs px-2 py-0.5 bg-accent-emerald/20 text-accent-emerald rounded truncate max-w-[140px]">
                            {favourite.brand}
                          </span>
                        )}
                        {favourite.grams && (
                          <span className="text-xs text-muted">
                            {formatOne(favourite.grams)}g
                          </span>
                        )}
                        {isCustom && (
                          <span className="text-xs px-2 py-0.5 bg-accent-purple/20 text-accent-purple rounded">
                            Custom
                          </span>
                        )}
                      </div>

                      {/* Nutrition summary */}
                      <div className="flex items-center gap-3 mt-2 text-xs">
                        <span className="text-accent-green font-medium">
                          {formatOne(favourite.calories || 0)} kcal
                        </span>
                        <span className="text-accent-red font-medium">
                          {formatOne(favourite.protein || 0)}g P
                        </span>
                        <span className="text-accent-amber font-medium">
                          {formatOne(favourite.carbs || 0)}g C
                        </span>
                        <span className="text-accent-yellow font-medium">
                          {formatOne(favourite.fats || 0)}g F
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Edit portion button */}
                      <button
                        type="button"
                        onClick={(e) => handleEditPortion(favourite, e)}
                        className="flex-shrink-0 w-10 h-10 rounded-full bg-foreground/10 md:hover:bg-accent-blue/20 transition-colors flex items-center justify-center"
                        aria-label="Edit portion before adding"
                        title="Edit portion"
                      >
                        <Edit3 size={18} className="text-foreground" />
                      </button>

                      {/* Delete button */}
                      {typeof resolvedDeleteFavourite === 'function' &&
                        favourite.id != null && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setPendingDeleteId(favourite.id);
                              openConfirm();
                            }}
                            className="flex-shrink-0 w-10 h-10 rounded-full bg-foreground/10 md:hover:bg-accent-red/20 transition-colors flex items-center justify-center"
                            aria-label="Delete favourite food"
                            title="Remove from favourites"
                          >
                            <Trash2
                              size={18}
                              className="text-foreground md:hover:text-accent-red"
                            />
                          </button>
                        )}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center text-muted text-sm py-10">
              <Heart className="mx-auto mb-3 text-muted" size={32} />
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
            className="flex-1 bg-surface-highlight text-foreground px-4 py-3 rounded-lg transition-all active:scale-95 font-medium"
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
            resolvedDeleteFavourite?.(pendingDeleteId);
          }
        }}
        onCancel={() => requestConfirmClose()}
      />
    </ModalShell>
  );
};
