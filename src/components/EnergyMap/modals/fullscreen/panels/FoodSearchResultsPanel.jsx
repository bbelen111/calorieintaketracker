import React from 'react';
import { AlertCircle, Globe, Search } from 'lucide-react';
import { FoodTagBadges } from '../../../common/FoodTagBadges';
import { formatOne } from '../../../../../utils/format';
import { formatFoodDisplayName } from '../../../../../utils/foodPresentation';

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
}) => (
  <>
    {searchMode === 'online' && fallbackUsed && (
      <div className="bg-accent-blue/10 border border-accent-blue/30 rounded-lg p-3">
        <p className="text-accent-blue text-xs font-medium">
          Showing {activeSearchSource === 'openfoodfacts' ? 'OpenFoodFacts' : 'online'} fallback results.
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
      <div className="flex flex-col items-center justify-center py-12">
        <div className="relative w-8 h-8 mb-3">
          <div className="absolute inset-0 border-4 border-border rounded-full" />
          <div className="absolute inset-0 border-4 border-transparent border-t-accent-blue rounded-full animate-spin-fast" />
        </div>
        <p className="text-muted text-sm">Searching local foods...</p>
      </div>
    )}

    {searchMode === 'online' && isSearching && (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="relative w-8 h-8 mb-3">
          <div className="absolute inset-0 border-4 border-border rounded-full" />
          <div className="absolute inset-0 border-4 border-transparent border-t-accent-blue rounded-full animate-spin-fast" />
        </div>
        <p className="text-muted text-sm">Searching online food databases...</p>
      </div>
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
      displayResults.map((food) => {
        const isLoading = loadingFoodId === food.id;
        const hasPreviewMacros = Boolean(food.previewMacros);
        const macroSource = hasPreviewMacros ? food.previewMacros : food.per100g;
        const servingLabel = hasPreviewMacros
          ? food.previewMacros?.servingInfo || 'per serving'
          : 'per 100g';
        return (
          <button
            key={food.id}
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
                <FoodTagBadges food={food} showCategory={false} className="mt-1" />
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
          </button>
        );
      })
    ) : (
      !isSearching &&
      displayResults.map((food) => {
        const isPinned = resolvedPinnedFoods.includes(food.id);
        const isLongPressing = longPressingId === food.id;
        const borderClass = isPinned ? 'border-accent-blue' : 'border-border';

        return (
          <button
            key={food.id}
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
          </button>
        );
      })
    )}
  </>
);
