import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SlidersHorizontal, X } from 'lucide-react';

export const FoodSearchFilterControls = ({
  viewMode,
  searchMode,
  displayResults,
  sortedFavourites,
  favouritesSearchQuery,
  resolvedFavourites,
  isSearching,
  isLocalSearching,
  resolvedCachedFoods,
  favouritesDropdownRef,
  dropdownRef,
  isFavouritesFilterOpen,
  setIsFavouritesFilterOpen,
  hasActiveFavouritesFilters,
  clearFavouritesFilters,
  favouritesSortBy,
  setFavouritesSortBy,
  favouritesSortOrder,
  setFavouritesSortOrder,
  getFavouritesSortLabel,
  isFilterOpen,
  setIsFilterOpen,
  hasActiveFilters,
  clearFilters,
  selectedCategory,
  setSelectedCategory,
  selectedSubcategory,
  setSelectedSubcategory,
  categoryOptions,
  availableSubcategories,
  sortBy,
  setSortBy,
  sortOrder,
  setSortOrder,
  getFilterActiveClass,
  getSortLabel,
}) => {
  if (viewMode === 'chat') {
    return null;
  }

  return (
    <div className="px-4 mt-3 flex items-center justify-between">
      <p className="text-muted text-sm">
        {viewMode === 'favourites' ? (
          <>
            {sortedFavourites.length}{' '}
            {sortedFavourites.length === 1 ? 'favourite' : 'favourites'}
            {favouritesSearchQuery &&
              resolvedFavourites.length !== sortedFavourites.length && (
                <span className="ml-1 text-xs text-muted">
                  (of {resolvedFavourites.filter(Boolean).length})
                </span>
              )}
          </>
        ) : searchMode === 'online' ? (
          isSearching ? (
            'Searching...'
          ) : (
            <>
              {displayResults.length}{' '}
              {displayResults.length === 1 ? 'result' : 'results'}
            </>
          )
        ) : (
          <>
            {isLocalSearching
              ? 'Searching local foods...'
              : `${displayResults.length} ${displayResults.length === 1 ? 'food' : 'foods'} found`}
            {resolvedCachedFoods.length > 0 && (
              <span className="ml-2 text-xs text-muted">
                (+{resolvedCachedFoods.length} cached)
              </span>
            )}
          </>
        )}
      </p>

      {viewMode === 'favourites' && (
        <div className="relative" ref={favouritesDropdownRef}>
          <button
            onClick={() => setIsFavouritesFilterOpen(!isFavouritesFilterOpen)}
            className={`text-sm font-medium flex items-center gap-1 transition-colors ${
              hasActiveFavouritesFilters
                ? 'text-accent-blue md:hover:text-accent-blue/80'
                : 'text-muted md:hover:text-foreground'
            }`}
          >
            <SlidersHorizontal size={14} />
            {hasActiveFavouritesFilters ? 'View Filters' : 'Filters'}
          </button>

          <AnimatePresence>
            {isFavouritesFilterOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="absolute right-0 top-full mt-2 w-72 bg-surface border border-border rounded-lg shadow-2xl z-50 max-h-[400px] overflow-y-auto overflow-x-hidden touch-action-pan-y"
              >
                <div className="p-4 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-border">
                    <h4 className="text-foreground font-bold text-lg">
                      Sort Favourites
                    </h4>
                    <button
                      onClick={clearFavouritesFilters}
                      className="text-sm text-accent-blue md:hover:text-accent-blue/80 font-medium focus-ring"
                    >
                      Clear
                    </button>
                  </div>

                  <div>
                    <label className="text-foreground font-semibold text-sm block mb-2">
                      Sort By
                    </label>
                    <div className="space-y-1.5">
                      {[
                        { value: 'name', label: 'Name (A-Z)' },
                        { value: 'calories', label: 'Calories' },
                        { value: 'protein', label: 'Protein' },
                        { value: 'carbs', label: 'Carbs' },
                        { value: 'fats', label: 'Fats' },
                      ].map((option) => (
                        <button
                          key={option.value}
                          onClick={() => setFavouritesSortBy(option.value)}
                          className={`w-full px-3 py-2 rounded-lg text-left text-sm font-medium transition-all ${
                            favouritesSortBy === option.value
                              ? 'bg-accent-emerald text-primary-foreground'
                              : 'bg-surface-highlight/60 text-foreground md:hover:bg-surface'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-foreground font-semibold text-sm block mb-2">
                      Sort Order
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setFavouritesSortOrder('asc')}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                          favouritesSortOrder === 'asc'
                            ? 'bg-accent-emerald text-primary-foreground'
                            : 'bg-surface-highlight/60 text-foreground md:hover:bg-surface'
                        }`}
                      >
                        ↑ Ascending
                      </button>
                      <button
                        onClick={() => setFavouritesSortOrder('desc')}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                          favouritesSortOrder === 'desc'
                            ? 'bg-accent-emerald text-primary-foreground'
                            : 'bg-surface-highlight/60 text-foreground md:hover:bg-surface'
                        }`}
                      >
                        ↓ Descending
                      </button>
                    </div>
                  </div>

                  {hasActiveFavouritesFilters && (
                    <div className="pt-3 border-t border-border">
                      <p className="text-muted text-xs mb-2">Active Sorting:</p>
                      <div className="flex flex-wrap gap-1.5">
                        <span className="px-2 py-1 bg-surface-highlight text-foreground rounded text-xs">
                          {getFavouritesSortLabel()}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {viewMode === 'search' && (
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className={`text-sm font-medium flex items-center gap-1 transition-colors ${
              hasActiveFilters
                ? 'text-accent-blue md:hover:text-accent-blue/80'
                : 'text-muted md:hover:text-foreground'
            }`}
          >
            <SlidersHorizontal size={14} />
            {hasActiveFilters ? 'View Filters' : 'Filters'}
          </button>

          <AnimatePresence>
            {isFilterOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="absolute right-0 top-full mt-2 w-80 bg-surface border border-border rounded-lg shadow-2xl z-50 max-h-[500px] overflow-y-auto overflow-x-hidden touch-action-pan-y"
              >
                <div className="p-4 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-border">
                    <h4 className="text-foreground font-bold text-lg">
                      Filters & Sort
                    </h4>
                    <button
                      onClick={clearFilters}
                      className="text-sm text-accent-blue md:hover:text-accent-blue/80 font-medium focus-ring"
                    >
                      Clear All
                    </button>
                  </div>
                  <div>
                    <label className="text-foreground font-semibold text-sm block mb-2">
                      {searchMode === 'online' ? 'Type' : 'Category'}
                    </label>
                    <div className="space-y-1.5">
                      <button
                        onClick={() => {
                          setSelectedCategory(null);
                          setSelectedSubcategory(null);
                        }}
                        className={`w-full px-3 py-2 rounded-lg text-left text-sm font-medium transition-all ${
                          selectedCategory === null
                            ? 'bg-accent-blue text-primary-foreground'
                            : 'bg-surface-highlight/60 text-foreground md:hover:bg-surface'
                        }`}
                      >
                        {searchMode === 'online'
                          ? 'All Types'
                          : 'All Categories'}
                      </button>
                      {Object.entries(categoryOptions).map(
                        ([key, { label, color }]) => (
                          <button
                            key={key}
                            onClick={() => {
                              setSelectedCategory(key);
                              setSelectedSubcategory(null);
                            }}
                            className={`w-full px-3 py-2 rounded-lg text-left text-sm font-medium transition-all ${
                              selectedCategory === key
                                ? getFilterActiveClass(color)
                                : 'bg-surface-highlight/60 text-foreground md:hover:bg-surface'
                            }`}
                          >
                            {label}
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  {availableSubcategories.length > 0 && (
                    <div>
                      <label className="text-foreground font-semibold text-sm block mb-2">
                        {searchMode === 'online' ? 'Serving' : 'Subcategory'}
                      </label>
                      <div className="space-y-1.5">
                        <button
                          onClick={() => setSelectedSubcategory(null)}
                          className={`w-full px-3 py-2 rounded-lg text-left text-sm font-medium transition-all ${
                            selectedSubcategory === null
                              ? 'bg-accent-blue text-primary-foreground'
                              : 'bg-surface-highlight/60 text-foreground md:hover:bg-surface'
                          }`}
                        >
                          {searchMode === 'online'
                            ? 'All Servings'
                            : 'All Subcategories'}
                        </button>
                        {availableSubcategories.map((subcat) => (
                          <button
                            key={subcat}
                            onClick={() => setSelectedSubcategory(subcat)}
                            className={`w-full px-3 py-2 rounded-lg text-left text-sm font-medium transition-all ${
                              selectedSubcategory === subcat
                                ? 'bg-accent-blue text-primary-foreground'
                                : 'bg-surface-highlight/60 text-foreground md:hover:bg-surface'
                            }`}
                          >
                            {searchMode === 'online'
                              ? subcat
                              : subcat.replace(/-/g, ' ')}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="text-foreground font-semibold text-sm block mb-2">
                      Sort By
                    </label>
                    <div className="space-y-1.5">
                      {[
                        { value: 'name', label: 'Name (A-Z)' },
                        { value: 'calories', label: 'Calories' },
                        { value: 'protein', label: 'Protein' },
                        { value: 'carbs', label: 'Carbs' },
                        { value: 'fats', label: 'Fats' },
                      ].map((option) => (
                        <button
                          key={option.value}
                          onClick={() => setSortBy(option.value)}
                          className={`w-full px-3 py-2 rounded-lg text-left text-sm font-medium transition-all ${
                            sortBy === option.value
                              ? 'bg-accent-emerald text-primary-foreground'
                              : 'bg-surface-highlight/60 text-foreground md:hover:bg-surface'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-foreground font-semibold text-sm block mb-2">
                      Sort Order
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setSortOrder('asc')}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                          sortOrder === 'asc'
                            ? 'bg-accent-emerald text-primary-foreground'
                            : 'bg-surface-highlight/60 text-foreground md:hover:bg-surface'
                        }`}
                      >
                        ↑ Ascending
                      </button>
                      <button
                        onClick={() => setSortOrder('desc')}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                          sortOrder === 'desc'
                            ? 'bg-accent-emerald text-primary-foreground'
                            : 'bg-surface-highlight/60 text-foreground md:hover:bg-surface'
                        }`}
                      >
                        ↓ Descending
                      </button>
                    </div>
                  </div>

                  {hasActiveFilters && (
                    <div className="pt-3 border-t border-border">
                      <p className="text-muted text-xs mb-2">Active Filters:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedCategory && (
                          <span className="px-2 py-1 bg-surface-highlight text-foreground rounded text-xs flex items-center gap-1">
                            {categoryOptions[selectedCategory]?.label ||
                              selectedCategory}
                            <X
                              size={12}
                              className="cursor-pointer md:hover:text-foreground pressable-inline focus-ring"
                              onClick={() => {
                                setSelectedCategory(null);
                                setSelectedSubcategory(null);
                              }}
                            />
                          </span>
                        )}
                        {selectedSubcategory && (
                          <span className="px-2 py-1 bg-surface-highlight text-foreground rounded text-xs flex items-center gap-1">
                            {searchMode === 'online'
                              ? selectedSubcategory
                              : selectedSubcategory.replace(/-/g, ' ')}
                            <X
                              size={12}
                              className="cursor-pointer md:hover:text-foreground pressable-inline focus-ring"
                              onClick={() => setSelectedSubcategory(null)}
                            />
                          </span>
                        )}
                        {(sortBy !== 'name' || sortOrder !== 'asc') && (
                          <span className="px-2 py-1 bg-surface-highlight text-foreground rounded text-xs">
                            {getSortLabel()}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};
