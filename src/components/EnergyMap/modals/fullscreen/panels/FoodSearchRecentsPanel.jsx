import React, { useMemo } from 'react';
import { History, Search, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { FoodTagBadges } from '../../../common/FoodTagBadges';
import { getMealTypeById } from '../../../../../constants/meal/mealTypes';
import { useEnergyMapStore } from '../../../../../store/useEnergyMapStore';
import { formatOne } from '../../../../../utils/formatting/format';
import { useUnits } from '../../../../../hooks/useUnits';
import { formatFoodDisplayName } from '../../../../../utils/food/foodPresentation';
import {
  buildRecentFoods,
  formatRecentDayLabel,
  searchRecentFoods,
  toRecentDisplayFood,
} from '../../../../../utils/food/recentFoods';

const STAGGER_EASE = [0.32, 0.72, 0, 1];
const getRowDelay = (index) => Math.min(index * 0.018, 0.12);

const describeLastLog = ({ entry, mealType, dateKey }, foodUnit) =>
  [
    entry.grams > 0 ? foodUnit.format(entry.grams, { space: false }) : null,
    getMealTypeById(mealType).label,
    formatRecentDayLabel(dateKey),
  ]
    .filter(Boolean)
    .join(' · ');

export const FoodSearchRecentsPanel = ({
  searchQuery,
  onSearchQueryChange,
  onSelectRecent,
  prefersReducedMotion,
}) => {
  const { food: foodUnit, energy } = useUnits();
  const nutritionData = useEnergyMapStore(
    (state) => state.userData?.nutritionData
  );
  // Walks the whole log, so it only runs while this view is mounted.
  const recentFoods = useMemo(
    () => buildRecentFoods(nutritionData),
    [nutritionData]
  );
  const matches = useMemo(
    () => searchRecentFoods(recentFoods, searchQuery),
    [recentFoods, searchQuery]
  );

  if (recentFoods.length === 0) {
    return (
      <div className="px-4 text-center text-muted text-sm py-10">
        <History className="mx-auto mb-3 text-muted" size={32} />
        <p>Foods you log show up here.</p>
        <p className="text-xs mt-1">
          Log something with Search, AI Chat, Manual Entry or a barcode.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="px-4 mt-3">
        <div className="relative flex items-center">
          <Search
            className="absolute left-3 text-muted shrink-0 pointer-events-none"
            size={20}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder="Search recent foods..."
            className="w-full bg-surface-highlight border border-border rounded-lg pl-11 pr-10 py-3 text-foreground placeholder:text-muted focus:outline-hidden focus:ring-1 focus:ring-accent-blue"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchQueryChange('')}
              className="absolute right-3 text-muted md:hover:text-foreground pressable-inline focus-ring shrink-0"
              aria-label="Clear search"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      <p className="px-4 mt-3 text-muted text-sm">
        {matches.length} recent {matches.length === 1 ? 'food' : 'foods'}
      </p>

      <div className="flex-1 min-h-0 px-4 py-4">
        <div className="h-full overflow-y-auto overflow-x-hidden touch-action-pan-y space-y-2">
          {matches.length === 0 && (
            <p className="text-center text-muted text-sm py-10">
              No recent foods match &quot;{searchQuery.trim()}&quot;.
            </p>
          )}

          {matches.map((recent, index) => {
            const { entry } = recent;

            return (
              <motion.div
                key={recent.key}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={
                  prefersReducedMotion
                    ? { duration: 0 }
                    : {
                        duration: 0.2,
                        ease: STAGGER_EASE,
                        delay: getRowDelay(index),
                      }
                }
              >
                <button
                  type="button"
                  onClick={() => onSelectRecent?.(entry)}
                  className="w-full text-left p-4 rounded-xl border border-border bg-surface-highlight transition-all md:hover:border-accent-blue/40 pressable-card focus-ring"
                >
                  <p className="font-semibold text-sm leading-tight text-foreground truncate">
                    {formatFoodDisplayName({
                      name: entry.name || 'Unnamed Food',
                      brand: entry.brand,
                    })}
                  </p>
                  <FoodTagBadges
                    food={toRecentDisplayFood(entry)}
                    className="mt-1"
                    portionText={describeLastLog(recent, foodUnit)}
                  />

                  <div className="flex items-center gap-3 mt-2 text-xs">
                    <span className="text-accent-green font-medium">
                      {energy.compact(entry.calories || 0)} {energy.unit}
                    </span>
                    <span className="text-accent-red font-medium">
                      {formatOne(entry.protein || 0)}g P
                    </span>
                    <span className="text-accent-teal font-medium">
                      {formatOne(entry.carbs || 0)}g C
                    </span>
                    <span className="text-accent-yellow font-medium">
                      {formatOne(entry.fats || 0)}g F
                    </span>
                  </div>
                </button>
              </motion.div>
            );
          })}
        </div>
      </div>
    </>
  );
};
