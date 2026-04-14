import React from 'react';
import { AlertCircle, Globe, Search } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { FoodTagBadges } from '../../../common/FoodTagBadges';
import { formatOne } from '../../../../../utils/formatting/format';
import { formatFoodDisplayName } from '../../../../../utils/food/foodPresentation';

const STAGGER_EASE = [0.32, 0.72, 0, 1];
const getRowDelay = (index) => Math.min(index * 0.018, 0.12);
const SKELETON_ROW_COUNT = 6;

const resolveOnlineSourceBadge = (source) => {
  const normalizedSource = String(source || '')
    .toLowerCase()
    .trim();

  if (normalizedSource === 'usda') {
    return {
      label: 'USDA',
      className: 'bg-accent-blue/20 text-accent-blue',
    };
  }

  if (normalizedSource === 'openfoodfacts') {
    return {
      label: 'OpenFoodFacts',
      className: 'bg-accent-indigo/20 text-accent-indigo',
    };
  }

  if (normalizedSource === 'ai_web_search') {
    return {
      label: 'Web',
      className: 'bg-accent-purple/20 text-accent-purple',
    };
  }

  if (!normalizedSource) {
    return null;
  }

  return {
    label: 'Online',
    className: 'bg-surface-highlight/60 text-muted',
  };
};

const resolveOnlineTypeBadge = (type) => {
  const normalizedType = String(type || '')
    .toLowerCase()
    .trim();

  if (normalizedType === 'brand') {
    return {
      label: 'Branded',
      className: 'bg-accent-emerald/20 text-accent-emerald',
    };
  }

  if (normalizedType === 'generic') {
    return {
      label: 'Generic',
      className: 'bg-accent-slate/20 text-accent-slate',
    };
  }

  return null;
};

export const FoodSearchResultsPanel = ({
  searchMode,
  activeSearchSource,
  fallbackUsed,
  searchError,
  localSearchError,
  isLocalSearching,
  isSearching,
  displayResults,
  searchQuery,
  loadingFoodId,
  handleOnlineFoodSelect,
  resolvedPinnedFoods,
  longPressingId,
  handleFoodClick,
  handlePressStart,
  handlePressEnd,
  performOnlineSearch,
  animatedFoodIds,
  prefersReducedMotion,
}) => (
  <>
    {searchMode === 'online' && fallbackUsed && (
      <div className="bg-accent-blue/10 border border-accent-blue/30 rounded-lg p-3">
        <p className="text-accent-blue text-xs font-medium">
          Showing{' '}
          {activeSearchSource === 'usda'
            ? 'USDA'
            : activeSearchSource === 'openfoodfacts'
              ? 'OpenFoodFacts'
              : 'online'}{' '}
          fallback results.
        </p>
      </div>
    )}

    {searchError && (
      <div className="bg-accent-red/10 border border-accent-red/30 rounded-lg p-4 flex items-start gap-3">
        <AlertCircle
          size={20}
          className="text-accent-red flex-shrink-0 mt-0.5"
        />
        <div>
          <p className="text-accent-red font-medium text-sm">{searchError}</p>
          <button
            onClick={() => performOnlineSearch(searchQuery)}
            className="mt-2 text-xs text-accent-red md:hover:text-accent-red/80 underline"
          >
            Try again
          </button>
        </div>
      </div>
    )}

    {searchMode === 'local' && localSearchError && (
      <div className="bg-accent-red/10 border border-accent-red/30 rounded-lg p-4 flex items-start gap-3">
        <AlertCircle
          size={20}
          className="text-accent-red flex-shrink-0 mt-0.5"
        />
        <p className="text-accent-red font-medium text-sm">
          {localSearchError}
        </p>
      </div>
    )}

    {searchMode === 'local' && isLocalSearching && (
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.16 }}
        className="space-y-2 py-1"
      >
        {Array.from({ length: SKELETON_ROW_COUNT }).map((_, index) => (
          <div
            key={`local-skeleton-${index}`}
            className="h-[84px] rounded-xl border border-border bg-surface-highlight animate-pulse"
          />
        ))}
      </motion.div>
    )}

    {searchMode === 'online' && isSearching && (
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.16 }}
        className="space-y-2 py-1"
      >
        {Array.from({ length: SKELETON_ROW_COUNT }).map((_, index) => (
          <div
            key={`online-skeleton-${index}`}
            className="h-[84px] rounded-xl border border-border bg-surface-highlight animate-pulse"
          />
        ))}
      </motion.div>
    )}

    {!isSearching &&
    !isLocalSearching &&
    !searchError &&
    !localSearchError &&
    displayResults.length === 0 ? (
      <div className="p-20 text-center">
        {searchMode === 'online' ? (
          <>
            <Globe className="mx-auto text-muted mb-3" size={32} />
            <p className="text-muted text-sm">
              {searchQuery.length < 2
                ? 'Enter a search term to find foods online'
                : 'No online matches found. Try a different search term.'}
            </p>
            {searchQuery.length > 0 && searchQuery.length < 2 && (
              <p className="mt-1 text-muted text-xs">
                Type at least 2 characters to search
              </p>
            )}
          </>
        ) : (
          <>
            <Search className="mx-auto text-muted mb-3" size={32} />
            <p className="text-muted text-sm">No foods found</p>
          </>
        )}
      </div>
    ) : searchMode === 'online' && !isSearching ? (
      <AnimatePresence initial={false}>
        {displayResults.map((food, index) => {
          const isLoading = loadingFoodId === food.id;
          const shouldAnimate = Boolean(animatedFoodIds?.[food.id]);
          const onlineSourceBadge = resolveOnlineSourceBadge(
            food.source || activeSearchSource
          );
          const onlineTypeBadge = resolveOnlineTypeBadge(food.type);
          const hasPreviewMacros = Boolean(food.previewMacros);
          const macroSource = hasPreviewMacros
            ? food.previewMacros
            : food.per100g;
          const servingLabel = hasPreviewMacros
            ? food.previewMacros?.servingInfo || 'per serving'
            : 'per 100g';
          return (
            <motion.button
              key={food.id}
              initial={
                !prefersReducedMotion && shouldAnimate
                  ? { opacity: 0, y: 8 }
                  : false
              }
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
                      delay: shouldAnimate ? getRowDelay(index) : 0,
                    }
              }
              onClick={() => !isLoading && handleOnlineFoodSelect(food)}
              disabled={isLoading}
              className={`relative w-full bg-surface-highlight border border-border rounded-xl p-3 text-left transition-all ${
                isLoading
                  ? 'opacity-70 cursor-wait'
                  : 'active:scale-[0.99] md:hover:border-accent-emerald/50'
              }`}
            >
              {isLoading && (
                <div className="absolute inset-0 bg-surface-highlight rounded-lg flex items-center justify-center z-10">
                  <div className="relative w-6 h-6">
                    <div className="absolute inset-0 border-3 border-border rounded-full" />
                    <div className="absolute inset-0 border-3 border-transparent border-t-accent-blue rounded-full animate-spin-fast" />
                  </div>
                </div>
              )}
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-foreground font-semibold text-sm truncate">
                      {formatFoodDisplayName({
                        name: food.name,
                        brand: food.brand,
                      })}
                    </h4>
                  </div>
                  {(onlineSourceBadge || onlineTypeBadge) && (
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                      {onlineSourceBadge && (
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${onlineSourceBadge.className}`}
                        >
                          {onlineSourceBadge.label}
                        </span>
                      )}
                      {onlineTypeBadge && (
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${onlineTypeBadge.className}`}
                        >
                          {onlineTypeBadge.label}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {macroSource && (
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-muted text-[10px] font-medium">
                      {servingLabel}
                    </span>
                    <div className="flex items-center gap-2 text-xs">
                      <div className="text-center">
                        <p className="text-accent-emerald font-bold">
                          {Math.round(macroSource.calories || 0)}
                        </p>
                        <p className="text-muted">cal</p>
                      </div>
                      <div className="text-center">
                        <p className="text-accent-red font-bold">
                          {formatOne(macroSource.protein)}g
                        </p>
                        <p className="text-muted">prot</p>
                      </div>
                      <div className="text-center">
                        <p className="text-accent-amber font-bold">
                          {formatOne(macroSource.carbs)}g
                        </p>
                        <p className="text-muted">carb</p>
                      </div>
                      <div className="text-center">
                        <p className="text-accent-yellow font-bold">
                          {formatOne(macroSource.fats)}g
                        </p>
                        <p className="text-muted">fat</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.button>
          );
        })}
      </AnimatePresence>
    ) : (
      !isSearching && (
        <AnimatePresence initial={false}>
          {displayResults.map((food, index) => {
            const isPinned = resolvedPinnedFoods.includes(food.id);
            const isLongPressing = longPressingId === food.id;
            const shouldAnimate = Boolean(animatedFoodIds?.[food.id]);
            const borderClass = isPinned
              ? 'border-accent-blue'
              : 'border-border';

            return (
              <motion.button
                key={food.id}
                initial={
                  !prefersReducedMotion && shouldAnimate
                    ? { opacity: 0, y: 8 }
                    : false
                }
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
                        delay: shouldAnimate ? getRowDelay(index) : 0,
                      }
                }
                onClick={() => handleFoodClick(food)}
                onPointerDown={(event) => handlePressStart(food.id, event)}
                onPointerUp={() => handlePressEnd(false)}
                onPointerLeave={() => handlePressEnd(true)}
                onPointerCancel={() => handlePressEnd(true)}
                onContextMenu={(event) => event.preventDefault()}
                className={`relative w-full bg-surface-highlight border rounded-xl p-3 text-left transition-all ${
                  isLongPressing
                    ? 'border-accent-blue scale-[0.98]'
                    : `${borderClass} active:scale-[0.99]`
                }`}
              >
                {isPinned && (
                  <div className="absolute top-2 right-2 w-1.5 h-1.5 bg-accent-blue rounded-full"></div>
                )}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-foreground font-semibold text-sm truncate">
                        {formatFoodDisplayName({
                          name: food.name,
                          brand: food.brand,
                        })}
                      </h4>
                    </div>
                    <FoodTagBadges food={food} className="mt-1" />
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-muted text-[10px] font-medium">
                      per 100g
                    </span>
                    <div className="flex items-center gap-3 text-xs">
                      <div className="text-center">
                        <p className="text-accent-emerald font-bold">
                          {formatOne(food.per100g.calories)}
                        </p>
                        <p className="text-muted">cal</p>
                      </div>
                      <div className="text-center">
                        <p className="text-accent-red font-bold">
                          {formatOne(food.per100g.protein)}g
                        </p>
                        <p className="text-muted">prot</p>
                      </div>
                      <div className="text-center">
                        <p className="text-accent-amber font-bold">
                          {formatOne(food.per100g.carbs)}g
                        </p>
                        <p className="text-muted">carb</p>
                      </div>
                      <div className="text-center">
                        <p className="text-accent-yellow font-bold">
                          {formatOne(food.per100g.fats)}g
                        </p>
                        <p className="text-muted">fat</p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.button>
            );
          })}
        </AnimatePresence>
      )
    )}
  </>
);
