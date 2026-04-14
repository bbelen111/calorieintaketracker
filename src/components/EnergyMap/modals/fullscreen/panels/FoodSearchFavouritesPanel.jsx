import React from 'react';
import { Heart, Edit3, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { FoodTagBadges } from '../../../common/FoodTagBadges';
import { formatOne } from '../../../../../utils/formatting/format';
import { formatFoodDisplayName } from '../../../../../utils/food/foodPresentation';
import {
  FOOD_SOURCE_TYPES,
  resolveFoodSourceType,
} from '../../../../../utils/food/foodTags';

const STAGGER_EASE = [0.32, 0.72, 0, 1];
const getRowDelay = (index) => Math.min(index * 0.018, 0.12);

export const FoodSearchFavouritesPanel = ({
  sortedFavourites,
  hasFavourites,
  handleFavouriteCardClick,
  handleFavouriteEdit,
  onDeleteFavourite,
  setPendingDeleteId,
  openDeleteConfirm,
  prefersReducedMotion,
}) => {
  if (!hasFavourites) {
    return (
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={
          prefersReducedMotion
            ? { duration: 0 }
            : { duration: 0.2, ease: STAGGER_EASE }
        }
        className="text-center text-muted text-sm py-10"
      >
        <Heart className="mx-auto mb-3 text-muted" size={32} />
        <p>No favourite foods yet.</p>
        <p className="text-xs mt-1">
          Add foods to your favourites for quick access.
        </p>
      </motion.div>
    );
  }

  return (
    <AnimatePresence initial={false}>
      {sortedFavourites.map((favourite, index) => {
        const key = favourite.id ?? `${favourite.name}-${favourite.grams}`;
        const sourceType = resolveFoodSourceType(favourite);
        const isManual = sourceType === FOOD_SOURCE_TYPES.MANUAL;
        const isCustom = sourceType === FOOD_SOURCE_TYPES.CUSTOM;
        const favouritePortionText = favourite.portionInfo
          ? `${favourite.portionInfo.portionMultiplier} ${favourite.portionInfo.portionName}`
          : isCustom && favourite.per100g
            ? 'per 100g'
            : !isManual && favourite.grams
              ? `${formatOne(favourite.grams)}g`
              : null;

        return (
          <motion.div
            key={key}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={
              prefersReducedMotion
                ? { opacity: 1 }
                : { opacity: 0, y: -4, transition: { duration: 0.12 } }
            }
            transition={
              prefersReducedMotion
                ? { duration: 0 }
                : {
                    duration: 0.2,
                    ease: STAGGER_EASE,
                    delay: getRowDelay(index),
                  }
            }
            className="w-full text-left p-4 rounded-xl border border-border bg-surface-highlight transition-all md:hover:border-accent-emerald/40 cursor-pointer"
            role="button"
            tabIndex={0}
            onClick={(event) =>
              handleFavouriteCardClick(favourite, isManual, event)
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handleFavouriteCardClick(favourite, isManual, event);
              }
            }}
          >
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm leading-tight text-foreground truncate">
                  {formatFoodDisplayName({
                    name: favourite.name || 'Unnamed Food',
                    brand: favourite.brand,
                  })}
                </p>
                <FoodTagBadges
                  food={favourite}
                  className="mt-1"
                  portionText={favouritePortionText}
                />

                <div className="flex items-center gap-3 mt-2 text-xs">
                  <span className="text-accent-green font-medium">
                    {formatOne(
                      isCustom && favourite.per100g
                        ? favourite.per100g.calories
                        : favourite.calories || 0
                    )}{' '}
                    kcal
                  </span>
                  <span className="text-accent-red font-medium">
                    {formatOne(
                      isCustom && favourite.per100g
                        ? favourite.per100g.protein
                        : favourite.protein || 0
                    )}
                    g P
                  </span>
                  <span className="text-accent-amber font-medium">
                    {formatOne(
                      isCustom && favourite.per100g
                        ? favourite.per100g.carbs
                        : favourite.carbs || 0
                    )}
                    g C
                  </span>
                  <span className="text-accent-yellow font-medium">
                    {formatOne(
                      isCustom && favourite.per100g
                        ? favourite.per100g.fats
                        : favourite.fats || 0
                    )}
                    g F
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isManual && (
                  <button
                    type="button"
                    onClick={(e) => handleFavouriteEdit(favourite, e)}
                    className="flex-shrink-0 w-11 h-11 rounded-full bg-surface-highlight/20 md:hover:bg-accent-blue/20 transition-colors flex items-center justify-center"
                    aria-label="Edit manual entry"
                    title="Edit entry"
                  >
                    <Edit3 size={20} className="text-foreground" />
                  </button>
                )}

                {typeof onDeleteFavourite === 'function' &&
                  favourite.id != null && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setPendingDeleteId(favourite.id);
                        openDeleteConfirm();
                      }}
                      className="flex-shrink-0 w-11 h-11 rounded-full bg-surface-highlight/20 md:hover:bg-accent-red/20 transition-colors flex items-center justify-center"
                      aria-label="Delete favourite food"
                      title="Remove from favourites"
                    >
                      <Trash2
                        size={20}
                        className="text-foreground md:hover:text-accent-red"
                      />
                    </button>
                  )}
              </div>
            </div>
          </motion.div>
        );
      })}
    </AnimatePresence>
  );
};
