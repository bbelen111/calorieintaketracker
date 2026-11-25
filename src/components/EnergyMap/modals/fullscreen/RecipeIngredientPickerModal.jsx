import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChefHat,
  ChevronLeft,
  CheckCircle2,
  CloudOff,
  Database,
  Globe,
  Search,
  WifiOff,
  X,
} from 'lucide-react';
import { shallow } from 'zustand/shallow';
import { ModalShell } from '../../common/ModalShell';
import { SegmentedToggle } from '../../common/SegmentedToggle';
import { FoodPortionModal } from '../pickers/FoodPortionModal';
import { FoodSearchFilterControls } from './panels/FoodSearchFilterControls';
import { FoodSearchMealPreviewPanel } from './panels/FoodSearchMealPreviewPanel';
import { FoodSearchResultsPanel } from './panels/FoodSearchResultsPanel';
import { SettingsReveal } from './SettingsReveal';
import { useAnimatedModal } from '../../../../hooks/useAnimatedModal';
import { useFoodBrowser } from '../../../../hooks/useFoodBrowser';
import { useNetworkStatus } from '../../../../hooks/useNetworkStatus';
import { useReducedMotionPreference } from '../../../../hooks/useMotionMode';
import { useEnergyMapStore } from '../../../../store/useEnergyMapStore';
import { addToFoodCache, trimFoodCache } from '../../../../services/foodCache';
import { getFilterActiveClass } from '../../../../utils/food/foodListing';
import { formatFoodDisplayName } from '../../../../utils/food/foodPresentation';
import { scaleMacrosFromPer100g } from '../../../../utils/food/portionNormalization';
import { formatOne } from '../../../../utils/formatting/format';
import {
  favouriteToIngredientFood,
  isRecipeFood,
} from '../../../../utils/food/recipe';

const MODAL_CLOSE_DELAY = 180;
const CACHE_LIMIT = 200; // same cap FoodSearchModal applies on cache-on-select
const ADDED_TOAST_MS = 2400;
const COUNT_FLASH_MS = 420;
const MAX_ANIMATED_ROWS = 16;
const PANEL_EASE = [0.32, 0.72, 0, 1];
const EMPTY = [];
const NOOP = () => {};

const isPickable = (food) =>
  Boolean(food?.id) && Boolean(food?.per100g) && !isRecipeFood(food);

const ingredientToPortionFood = (ingredient) => ({
  id: ingredient.foodId ?? ingredient.id,
  name: ingredient.name,
  brand: ingredient.brand ?? null,
  category: ingredient.category ?? 'custom',
  source: ingredient.source ?? null,
  per100g: ingredient.per100g,
  portions: [],
});

/**
 * The "Add ingredient" page of the recipe builder. It deliberately looks and
 * behaves like the Food Search modal's browse view - a Local | Online toggle,
 * a count + Filters row (category / subcategory / sort), pinned foods first,
 * progressive "Show more" - because it is the same job: find a food.
 *
 * Local lists, in one merged set: your pinned foods, favourites, cached foods
 * and the foods you added yourself, alongside the bundled catalog. It loads the
 * default catalog list on open, exactly like the search modal. Recipes are never
 * offered (no nesting).
 *
 * The filter / sort / merge logic is the search modal's own
 * (`utils/food/foodListing.js`) and the stateful half is `useFoodBrowser`; the
 * rows are the search modal's `FoodSearchResultsPanel`. Picking a row opens the
 * Food Portion modal in ingredient mode; the page stays open after each add so
 * several ingredients can go in one visit.
 */
export const RecipeIngredientPickerModal = ({
  isOpen,
  isClosing,
  onClose,
  onPickIngredient,
  ingredients,
  ingredientCount,
  onEditIngredient,
  onRemoveIngredient,
  customFoods = EMPTY,
}) => {
  const prefersReducedMotion = useReducedMotionPreference();
  const resolvedIngredients = Array.isArray(ingredients) ? ingredients : EMPTY;
  const resolvedIngredientCount = ingredientCount ?? resolvedIngredients.length;
  const { foodFavourites, pinnedFoods, cachedFoods, updateCachedFoods } =
    useEnergyMapStore(
      (state) => ({
        foodFavourites: state.foodFavourites,
        pinnedFoods: state.pinnedFoods,
        cachedFoods: state.cachedFoods,
        updateCachedFoods: state.updateCachedFoods,
      }),
      shallow
    );
  const { isOnline } = useNetworkStatus();
  const portionModal = useAnimatedModal(false, MODAL_CLOSE_DELAY);

  const favouriteFoods = useMemo(
    () => (foodFavourites ?? []).map(favouriteToIngredientFood).filter(Boolean),
    [foodFavourites]
  );
  const pickableCachedFoods = useMemo(
    () => (cachedFoods ?? []).filter(isPickable),
    [cachedFoods]
  );
  const pickableCustomFoods = useMemo(
    () => customFoods.filter(isPickable),
    [customFoods]
  );
  const pinnedFoodIds = pinnedFoods ?? EMPTY;

  const browser = useFoodBrowser({
    isOpen,
    isOnline,
    pinnedFoodIds,
    cachedFoods: pickableCachedFoods,
    favouriteFoods,
    customFoods: pickableCustomFoods,
  });

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isRecipePreviewOpen, setIsRecipePreviewOpen] = useState(false);
  const [prevIngredientCount, setPrevIngredientCount] = useState(
    resolvedIngredientCount
  );
  const [flashTrigger, setFlashTrigger] = useState(0);
  const [isRecipeCountFlashing, setIsRecipeCountFlashing] = useState(false);
  const [selectedFood, setSelectedFood] = useState(null);
  const [editingIngredient, setEditingIngredient] = useState(null);
  const [lastAdded, setLastAdded] = useState(null);
  const dropdownRef = useRef(null);

  if (prevIngredientCount !== resolvedIngredientCount) {
    setPrevIngredientCount(resolvedIngredientCount);
    if (isOpen && !isClosing) {
      setIsRecipeCountFlashing(true);
      setFlashTrigger((count) => count + 1);
    }
  }

  if (isClosing && isRecipePreviewOpen) {
    setIsRecipePreviewOpen(false);
  }

  useEffect(() => {
    if (flashTrigger === 0) return undefined;
    const timer = setTimeout(() => {
      setIsRecipeCountFlashing(false);
    }, COUNT_FLASH_MS);
    return () => clearTimeout(timer);
  }, [flashTrigger]);

  useEffect(() => {
    if (!isFilterOpen) return undefined;

    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isFilterOpen]);

  // Release the staged food only after the portion sheet has finished closing.
  useEffect(() => {
    if (!portionModal.isClosing) return undefined;
    const timer = setTimeout(() => {
      setSelectedFood(null);
      setEditingIngredient(null);
    }, MODAL_CLOSE_DELAY + 50);
    return () => clearTimeout(timer);
  }, [portionModal.isClosing]);

  useEffect(() => {
    if (!lastAdded) return undefined;
    const timer = setTimeout(() => setLastAdded(null), ADDED_TOAST_MS);
    return () => clearTimeout(timer);
  }, [lastAdded]);

  // Only the first screenful of rows plays the staggered rise-in; rows below
  // simply appear (they are off-screen and there is no delay worth staggering).
  const animatedFoodIds = useMemo(
    () =>
      Object.fromEntries(
        browser.visibleFoods
          .slice(0, MAX_ANIMATED_ROWS)
          .map((food) => [food.id, true])
      ),
    [browser.visibleFoods]
  );

  const previewEntries = useMemo(
    () =>
      resolvedIngredients.map((ingredient) => {
        const scaled = scaleMacrosFromPer100g(
          ingredient.per100g,
          ingredient.grams
        );
        return {
          ...ingredient,
          calories: scaled.calories,
          protein: scaled.protein,
          carbs: scaled.carbs,
          fats: scaled.fats,
        };
      }),
    [resolvedIngredients]
  );

  const handleSelectMode = (mode) => {
    setIsFilterOpen(false);
    browser.selectMode(mode);
  };

  const handleSelectFood = (food) => {
    if (browser.isOnlineMode) {
      // Same cache-on-select the main search does, so a picked online food is
      // available offline next time.
      updateCachedFoods(
        trimFoodCache(addToFoodCache(cachedFoods, food), CACHE_LIMIT)
      );
    }
    setEditingIngredient(null);
    setSelectedFood(food);
    portionModal.open();
  };

  const handleEditIngredient = async (entry) => {
    if (!entry?.id) return;
    const ingredient =
      resolvedIngredients.find((item) => item.id === entry.id) ?? entry;
    let matchingFood =
      (ingredient.foodId &&
        (browser.displayFoods.find((item) => item.id === ingredient.foodId) ??
          pickableCustomFoods.find((item) => item.id === ingredient.foodId) ??
          pickableCachedFoods.find((item) => item.id === ingredient.foodId) ??
          favouriteFoods.find((item) => item.id === ingredient.foodId))) ||
      null;

    if (!matchingFood && ingredient.foodId) {
      try {
        const { getFoodById } =
          await import('../../../../services/foodCatalog');
        matchingFood = await getFoodById(ingredient.foodId);
      } catch {
        matchingFood = null;
      }
    }

    setIsRecipePreviewOpen(false);
    setEditingIngredient(ingredient);
    setSelectedFood(
      matchingFood?.per100g ? matchingFood : ingredientToPortionFood(ingredient)
    );
    portionModal.open();
  };

  const handleDeleteIngredient = (entry) => {
    if (!entry?.id) return;
    onRemoveIngredient?.(entry.id);
  };

  const handleConfirmIngredient = ({ food, grams, portionLabel }) => {
    const label = `${formatFoodDisplayName({ name: food?.name, brand: food?.brand })} · ${formatOne(grams)} g`;
    if (editingIngredient) {
      onEditIngredient?.(editingIngredient.id, { grams, portionLabel });
      setLastAdded({
        id: Date.now(),
        text: `Updated ${label}`,
      });
    } else {
      onPickIngredient?.({ food, grams, portionLabel });
      setLastAdded({
        id: Date.now(),
        text: `Added ${label}`,
      });
    }
    portionModal.requestClose();
  };

  const handleModalClose = () => {
    if (isRecipePreviewOpen) {
      setIsRecipePreviewOpen(false);
      return;
    }
    onClose?.();
  };

  const handleClearFilters = () => {
    browser.clearFilters();
  };

  const showMore =
    browser.hasMore && !browser.isOnlineSearching && !browser.showLocalSkeleton;

  const toggleOptions = [
    {
      id: 'local',
      label: 'Local',
      icon: Database,
      pillClassName: 'bg-accent-blue',
    },
    {
      id: 'online',
      label: 'Online',
      icon: isOnline ? Globe : WifiOff,
      pillClassName: 'bg-accent-emerald',
      disabled: !isOnline,
    },
  ];

  return (
    <>
      <ModalShell
        isOpen={isOpen}
        isClosing={isClosing}
        onClose={handleModalClose}
        fullHeight
        overlayClassName="fixed inset-0 bg-surface/70 p-0! flex-none! items-stretch! justify-stretch!"
        contentClassName="fixed inset-0 w-screen h-screen p-0 bg-background rounded-none border-none max-h-none! flex flex-col overflow-x-hidden pt-[env(safe-area-inset-top)] keyboard-bottom-inset pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
      >
        <div className="fullscreen-header flex shrink-0 items-center justify-between border-b border-border bg-background px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onClose?.()}
              aria-label="Back"
              className="text-muted transition-all pressable-inline focus-ring md:hover:text-foreground"
            >
              <ChevronLeft size={24} />
            </button>
            <h3 className="text-xl font-bold text-foreground">
              Add ingredient
            </h3>
          </div>

          <motion.button
            layout={prefersReducedMotion ? undefined : 'size'}
            type="button"
            onClick={() => setIsRecipePreviewOpen(true)}
            whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
            whileHover={prefersReducedMotion ? undefined : { y: -1 }}
            transition={{ type: 'spring', stiffness: 360, damping: 34 }}
            aria-label={`${resolvedIngredientCount} in recipe`}
            className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium pressable-card focus-ring transition-colors duration-300 ${
              isRecipeCountFlashing
                ? 'border-accent-blue bg-accent-blue text-primary-foreground md:hover:brightness-110'
                : 'border-border bg-surface-highlight text-foreground md:hover:bg-surface'
            }`}
          >
            <span>In recipe</span>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={`recipe-count-${resolvedIngredientCount}`}
                initial={
                  prefersReducedMotion
                    ? false
                    : { opacity: 0, y: 6, scale: 0.9 }
                }
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={
                  prefersReducedMotion
                    ? { opacity: 1 }
                    : { opacity: 0, y: -6, scale: 0.9 }
                }
                transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                className={`text-base font-semibold leading-none transition-colors duration-300 ${
                  isRecipeCountFlashing
                    ? 'text-primary-foreground'
                    : 'text-accent-blue'
                }`}
              >
                {resolvedIngredientCount}
              </motion.span>
            </AnimatePresence>
          </motion.button>
        </div>

        <div className="fullscreen-body flex min-h-0 flex-1 flex-col border-t border-border bg-surface">
          <div className="mt-3 px-4">
            <div className="relative flex items-center">
              <Search
                className="pointer-events-none absolute left-3 shrink-0 text-muted"
                size={20}
              />
              <input
                type="text"
                inputMode="search"
                value={browser.query}
                onChange={(event) => browser.setQuery(event.target.value)}
                placeholder={
                  browser.isOnlineMode
                    ? 'Search the online food database...'
                    : 'Search local foods...'
                }
                aria-label="Search ingredients"
                className="w-full rounded-lg border border-border bg-surface-highlight py-3 pl-11 pr-10 text-foreground placeholder:text-muted focus:outline-hidden focus:ring-1 focus:ring-accent-blue"
              />
              {browser.query ? (
                <button
                  type="button"
                  onClick={() => browser.setQuery('')}
                  className="absolute right-3 shrink-0 text-muted pressable-inline focus-ring md:hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X size={18} />
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-3 px-4">
            <SegmentedToggle
              ariaLabel="Ingredient source"
              options={toggleOptions}
              value={browser.searchMode}
              onChange={handleSelectMode}
            />
            <SettingsReveal open={!isOnline}>
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-accent-amber/30 bg-accent-amber/10 px-3 py-2">
                <CloudOff size={16} className="shrink-0 text-accent-amber" />
                <p className="text-xs text-accent-amber">
                  You&apos;re offline. Online search requires an internet
                  connection.
                </p>
              </div>
            </SettingsReveal>
          </div>

          <FoodSearchFilterControls
            viewMode="search"
            searchMode={browser.searchMode}
            displayResults={browser.displayFoods}
            visibleResultsCount={browser.visibleFoods.length}
            isSearching={browser.isOnlineSearching}
            isLocalSearching={browser.showLocalSkeleton}
            resolvedCachedFoods={pickableCachedFoods}
            dropdownRef={dropdownRef}
            isFilterOpen={isFilterOpen}
            setIsFilterOpen={setIsFilterOpen}
            hasActiveFilters={browser.hasActiveFilters}
            clearFilters={handleClearFilters}
            selectedCategory={browser.selectedCategory}
            setSelectedCategory={browser.setSelectedCategory}
            selectedSubcategory={browser.selectedSubcategory}
            setSelectedSubcategory={browser.setSelectedSubcategory}
            categoryOptions={browser.categoryOptions}
            availableSubcategories={browser.availableSubcategories}
            sortBy={browser.sortBy}
            setSortBy={browser.setSortBy}
            sortOrder={browser.sortOrder}
            setSortOrder={browser.setSortOrder}
            getFilterActiveClass={getFilterActiveClass}
            getSortLabel={() => browser.sortLabel}
          />

          <div className="relative min-h-0 flex-1 px-4 py-4">
            <div className="h-full touch-action-pan-y space-y-2 overflow-y-auto overflow-x-hidden">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={`ingredient-results-${browser.searchMode}`}
                  initial={
                    prefersReducedMotion
                      ? false
                      : {
                          opacity: 0,
                          x: browser.isOnlineMode ? 12 : -12,
                        }
                  }
                  animate={{ opacity: 1, x: 0 }}
                  exit={
                    prefersReducedMotion
                      ? { opacity: 1 }
                      : {
                          opacity: 0,
                          x: browser.isOnlineMode ? -12 : 12,
                        }
                  }
                  transition={
                    prefersReducedMotion
                      ? { duration: 0 }
                      : { duration: 0.18, ease: PANEL_EASE }
                  }
                  className="space-y-2"
                >
                  <FoodSearchResultsPanel
                    searchMode={browser.searchMode}
                    activeSearchSource={
                      browser.isOnlineMode ? 'cloud' : 'local'
                    }
                    fallbackUsed={false}
                    searchError={browser.onlineError}
                    localSearchError={browser.localError}
                    isLocalSearching={browser.showLocalSkeleton}
                    isSearching={browser.isOnlineSearching}
                    displayResults={browser.visibleFoods}
                    searchQuery={browser.query}
                    loadingFoodId={null}
                    handleOnlineFoodSelect={handleSelectFood}
                    resolvedPinnedFoods={pinnedFoodIds}
                    longPressingId={null}
                    handleFoodClick={handleSelectFood}
                    handlePressStart={NOOP}
                    handlePressEnd={NOOP}
                    performOnlineSearch={browser.retryOnline}
                    animatedFoodIds={animatedFoodIds}
                    prefersReducedMotion={prefersReducedMotion}
                  />
                </motion.div>
              </AnimatePresence>

              {showMore ? (
                <div className="flex justify-center pb-1 pt-2">
                  <motion.button
                    type="button"
                    onClick={browser.loadMore}
                    disabled={browser.isLoadingMore}
                    initial={
                      prefersReducedMotion ? false : { opacity: 0, y: 6 }
                    }
                    animate={{ opacity: 1, y: 0 }}
                    transition={
                      prefersReducedMotion
                        ? { duration: 0 }
                        : { duration: 0.16, ease: PANEL_EASE }
                    }
                    whileTap={
                      prefersReducedMotion ? undefined : { scale: 0.98 }
                    }
                    className="rounded-lg border border-border bg-surface-highlight px-4 py-2 text-sm font-medium text-foreground pressable-card focus-ring md:hover:bg-surface"
                  >
                    {browser.isLoadingMore
                      ? 'Loading more...'
                      : `Show more (${browser.visibleFoods.length} loaded)`}
                  </motion.button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="shrink-0 border-t border-border bg-surface px-4 pb-4 pt-3">
            <button
              type="button"
              onClick={() => onClose?.()}
              className="w-full rounded-xl bg-primary px-3 py-2.5 text-[13px] font-semibold text-primary-foreground shadow-xs transition-all press-feedback focus-ring md:hover:brightness-110"
            >
              Done
            </button>
          </div>
        </div>

        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 z-1300 flex justify-center px-4"
          style={{ bottom: 'calc(var(--sab) + 5rem)' }}
        >
          <AnimatePresence>
            {lastAdded ? (
              <motion.div
                key={lastAdded.id}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={
                  prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }
                }
                transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                className="flex w-full max-w-sm items-center gap-2 rounded-xl border border-accent-green/35 bg-surface/95 px-3 py-2.5 text-sm leading-tight text-foreground shadow-xl backdrop-blur-xs"
              >
                <CheckCircle2
                  size={16}
                  aria-hidden="true"
                  className="shrink-0 text-accent-green"
                />
                <span className="min-w-0 truncate">{lastAdded.text}</span>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {isRecipePreviewOpen ? (
            <FoodSearchMealPreviewPanel
              isOpen={isRecipePreviewOpen}
              onClose={() => setIsRecipePreviewOpen(false)}
              title="Current Recipe"
              emptyText="No ingredients in this recipe yet."
              itemSingular="ingredient"
              itemPlural="ingredients"
              closeAriaLabel="Close recipe preview"
              editAriaLabel="Edit ingredient"
              deleteAriaLabel="Remove ingredient"
              icon={ChefHat}
              mealEntries={previewEntries}
              onEditMealEntry={
                onEditIngredient ? handleEditIngredient : undefined
              }
              onDeleteMealEntry={
                onRemoveIngredient ? handleDeleteIngredient : undefined
              }
            />
          ) : null}
        </AnimatePresence>
      </ModalShell>

      <FoodPortionModal
        isOpen={portionModal.isOpen}
        isClosing={portionModal.isClosing}
        onClose={portionModal.requestClose}
        selectedFood={selectedFood}
        initialGrams={editingIngredient?.grams}
        isEditing={Boolean(editingIngredient)}
        ingredientMode
        confirmLabel={editingIngredient ? 'Save changes' : 'Add to recipe'}
        onConfirmIngredient={handleConfirmIngredient}
      />
    </>
  );
};
