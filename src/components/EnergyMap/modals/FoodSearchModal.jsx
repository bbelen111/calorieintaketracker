import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Star,
  BotMessageSquare,
  ScanBarcode,
  Search,
  Edit3,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ModalShell } from '../common/ModalShell';
import {
  searchFoods,
  FOOD_CATEGORIES,
  FOOD_DATABASE,
} from '../../../constants/foodDatabase';
import { formatOne } from '../../../utils/format';

export const FoodSearchModal = ({
  isOpen,
  isClosing,
  onClose,
  onSelectFood,
  onOpenManualEntry,
  pinnedFoods = [],
  onTogglePin,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState(null);
  const [sortBy, setSortBy] = useState('name'); // name, calories, protein, carbs, fats
  const [sortOrder, setSortOrder] = useState('asc'); // asc, desc
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const dropdownRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const [longPressingId, setLongPressingId] = useState(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsFilterOpen(false);
      }
    };

    if (isFilterOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isFilterOpen]);

  // Long-press handlers
  const handlePressStart = (foodId) => {
    setLongPressingId(foodId);
    longPressTimerRef.current = setTimeout(() => {
      if (onTogglePin) {
        onTogglePin(foodId);
      }
      setLongPressingId(null);
    }, 750); // 750ms hold duration
  };

  const handlePressEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    setLongPressingId(null);
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  // Get unique subcategories for selected category
  const availableSubcategories = useMemo(() => {
    if (!selectedCategory) return [];

    const subcats = new Set();
    FOOD_DATABASE.forEach((food) => {
      if (food.category === selectedCategory && food.subcategory) {
        subcats.add(food.subcategory);
      }
    });
    return Array.from(subcats).sort();
  }, [selectedCategory]);

  // Apply search, filter, and sort
  const searchResults = useMemo(() => {
    let results = searchFoods(searchQuery);

    // Apply category filter
    if (selectedCategory) {
      results = results.filter((food) => food.category === selectedCategory);
    }

    // Apply subcategory filter
    if (selectedSubcategory) {
      results = results.filter(
        (food) => food.subcategory === selectedSubcategory
      );
    }

    // Apply sorting
    results = [...results].sort((a, b) => {
      let compareValue = 0;

      if (sortBy === 'name') {
        compareValue = a.name.localeCompare(b.name);
      } else {
        const aValue = a.per100g[sortBy] || 0;
        const bValue = b.per100g[sortBy] || 0;
        compareValue = aValue - bValue;
      }

      return sortOrder === 'asc' ? compareValue : -compareValue;
    });

    // Sort pinned foods to the top
    results = [...results].sort((a, b) => {
      const aIsPinned = pinnedFoods.includes(a.id);
      const bIsPinned = pinnedFoods.includes(b.id);
      if (aIsPinned && !bIsPinned) return -1;
      if (!aIsPinned && bIsPinned) return 1;
      return 0;
    });

    return results;
  }, [
    searchQuery,
    selectedCategory,
    selectedSubcategory,
    sortBy,
    sortOrder,
    pinnedFoods,
  ]);

  const getCategoryClasses = (category) => {
    const colorMap = {
      protein: 'bg-red-500/20 text-red-400',
      carbs: 'bg-amber-500/20 text-amber-400',
      vegetables: 'bg-green-500/20 text-green-400',
      fats: 'bg-yellow-500/20 text-yellow-400',
      supplements: 'bg-purple-500/20 text-purple-400',
    };
    return colorMap[category] || 'bg-slate-500/20 text-slate-400';
  };

  const clearFilters = () => {
    setSelectedCategory(null);
    setSelectedSubcategory(null);
    setSortBy('name');
    setSortOrder('asc');
  };

  const hasActiveFilters =
    selectedCategory ||
    selectedSubcategory ||
    sortBy !== 'name' ||
    sortOrder !== 'asc';

  const getSortLabel = () => {
    const labels = {
      name: 'Name',
      calories: 'Calories',
      protein: 'Protein',
      carbs: 'Carbs',
      fats: 'Fats',
    };
    const orderLabel = sortOrder === 'asc' ? '↑' : '↓';
    return `${labels[sortBy]} ${orderLabel}`;
  };

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      onClose={onClose}
      contentClassName="w-full md:max-w-3xl p-6"
    >
      <div className="flex items-center gap-3 mb-4">
        <Search className="text-blue-400" size={28} />
        <h3 className="text-white font-bold text-2xl">Add Food</h3>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 mb-3">
        <button
          onClick={() => {}}
          aria-label="Favorites"
          className="flex-1 flex items-center justify-center gap-2 px-3 py-3 bg-blue-600 hover:bg-blue-600/50 text-white rounded-lg font-semibold transition-all shadow-md shadow-blue-500/20"
        >
          <Star size={18} />
          <span className="hidden md:inline">Favorites</span>
        </button>
        <button
          onClick={onOpenManualEntry}
          aria-label="Manual Entry"
          className="flex-1 flex items-center justify-center gap-2 px-3 py-3 bg-blue-600 hover:bg-blue-600/50 text-white rounded-lg font-semibold transition-all shadow-md shadow-blue-500/20"
        >
          <Edit3 size={18} />
          <span className="hidden md:inline">Manual Entry</span>
        </button>
        <button
          onClick={() => {}}
          aria-label="Barcode Scan"
          className="flex-1 flex items-center justify-center gap-2 px-3 py-3 bg-blue-600 hover:bg-blue-600/50 text-white rounded-lg font-semibold transition-all shadow-md shadow-blue-500/20"
        >
          <ScanBarcode size={18} />
          <span className="hidden md:inline">Barcode Scan</span>
        </button>
        <button
          onClick={() => {}}
          aria-label="AI Chatbot"
          className="flex-1 flex items-center justify-center gap-2 px-3 py-3 bg-blue-600 hover:bg-blue-600/50 text-white rounded-lg font-semibold transition-all shadow-md shadow-blue-500/20"
        >
          <BotMessageSquare size={18} />
          <span className="hidden md:inline">AI Chatbot</span>
        </button>
      </div>

      {/* Search Input */}
      <div className="mb-3">
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={20}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search for a food..."
            className="w-full bg-slate-700 border border-slate-600 rounded-lg pl-11 pr-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
      </div>

      {/* Results Count & Filter Button */}
      <div className="mb-3 flex items-center justify-between">
        <p className="text-slate-400 text-sm">
          {searchResults.length} {searchResults.length === 1 ? 'food' : 'foods'}{' '}
          found
        </p>

        {/* Compact Filter Button */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className={`text-sm font-medium flex items-center gap-1 transition-colors ${
              hasActiveFilters
                ? 'text-blue-400 hover:text-blue-300'
                : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            <SlidersHorizontal size={14} />
            {hasActiveFilters ? 'View Filters' : 'Filters'}
          </button>

          {/* Dropdown Overlay */}
          <AnimatePresence>
            {isFilterOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="absolute right-0 top-full mt-2 w-80 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl z-50 max-h-[500px] overflow-y-auto overflow-x-hidden touch-action-pan-y"
              >
                <div className="p-4 space-y-4">
                  {/* Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-slate-700">
                    <h4 className="text-white font-bold text-lg">
                      Filters & Sort
                    </h4>
                    <button
                      onClick={clearFilters}
                      className="text-sm text-blue-400 hover:text-blue-300 font-medium"
                    >
                      Clear All
                    </button>
                  </div>

                  {/* Category Filter */}
                  <div>
                    <label className="text-slate-300 font-semibold text-sm block mb-2">
                      Category
                    </label>
                    <div className="space-y-1.5">
                      <button
                        onClick={() => {
                          setSelectedCategory(null);
                          setSelectedSubcategory(null);
                        }}
                        className={`w-full px-3 py-2 rounded-lg text-left text-sm font-medium transition-all ${
                          selectedCategory === null
                            ? 'bg-blue-500 text-white'
                            : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        All Categories
                      </button>
                      {Object.entries(FOOD_CATEGORIES).map(
                        ([key, { label, color }]) => (
                          <button
                            key={key}
                            onClick={() => {
                              setSelectedCategory(key);
                              setSelectedSubcategory(null);
                            }}
                            className={`w-full px-3 py-2 rounded-lg text-left text-sm font-medium transition-all ${
                              selectedCategory === key
                                ? `bg-${color}-500 text-white`
                                : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            {label}
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  {/* Subcategory Filter */}
                  {availableSubcategories.length > 0 && (
                    <div>
                      <label className="text-slate-300 font-semibold text-sm block mb-2">
                        Subcategory
                      </label>
                      <div className="space-y-1.5">
                        <button
                          onClick={() => setSelectedSubcategory(null)}
                          className={`w-full px-3 py-2 rounded-lg text-left text-sm font-medium transition-all ${
                            selectedSubcategory === null
                              ? 'bg-blue-500 text-white'
                              : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          All Subcategories
                        </button>
                        {availableSubcategories.map((subcat) => (
                          <button
                            key={subcat}
                            onClick={() => setSelectedSubcategory(subcat)}
                            className={`w-full px-3 py-2 rounded-lg text-left text-sm font-medium transition-all capitalize ${
                              selectedSubcategory === subcat
                                ? 'bg-blue-500 text-white'
                                : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            {subcat.replace(/-/g, ' ')}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sort By */}
                  <div>
                    <label className="text-slate-300 font-semibold text-sm block mb-2">
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
                              ? 'bg-emerald-500 text-white'
                              : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sort Order */}
                  <div>
                    <label className="text-slate-300 font-semibold text-sm block mb-2">
                      Sort Order
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setSortOrder('asc')}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                          sortOrder === 'asc'
                            ? 'bg-emerald-500 text-white'
                            : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        ↑ Ascending
                      </button>
                      <button
                        onClick={() => setSortOrder('desc')}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                          sortOrder === 'desc'
                            ? 'bg-emerald-500 text-white'
                            : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        ↓ Descending
                      </button>
                    </div>
                  </div>

                  {/* Active Filters Summary */}
                  {hasActiveFilters && (
                    <div className="pt-3 border-t border-slate-700">
                      <p className="text-slate-400 text-xs mb-2">
                        Active Filters:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedCategory && (
                          <span className="px-2 py-1 bg-slate-700 text-slate-300 rounded text-xs flex items-center gap-1">
                            {FOOD_CATEGORIES[selectedCategory]?.label}
                            <X
                              size={12}
                              className="cursor-pointer hover:text-white"
                              onClick={() => {
                                setSelectedCategory(null);
                                setSelectedSubcategory(null);
                              }}
                            />
                          </span>
                        )}
                        {selectedSubcategory && (
                          <span className="px-2 py-1 bg-slate-700 text-slate-300 rounded text-xs flex items-center gap-1 capitalize">
                            {selectedSubcategory.replace(/-/g, ' ')}
                            <X
                              size={12}
                              className="cursor-pointer hover:text-white"
                              onClick={() => setSelectedSubcategory(null)}
                            />
                          </span>
                        )}
                        {(sortBy !== 'name' || sortOrder !== 'asc') && (
                          <span className="px-2 py-1 bg-slate-700 text-slate-300 rounded text-xs">
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
      </div>

      {/* Search Results */}
      <div className="space-y-2 max-h-[500px] min-h-[500px] overflow-y-auto overflow-x-hidden touch-action-pan-y">
        {searchResults.length === 0 ? (
          <div className="bg-slate-700/50 border border-slate-600 border-dashed rounded-lg p-8 text-center">
            <Search className="mx-auto text-slate-500 mb-3" size={32} />
            <p className="text-slate-400 text-sm">No foods found</p>
          </div>
        ) : (
          searchResults.map((food) => {
            const isPinned = pinnedFoods.includes(food.id);
            const isLongPressing = longPressingId === food.id;
            // Compose border and shadow classes for pinned state
            let borderClass = '';
            let shadowClass = '';
            if (isPinned) {
              borderClass = 'border-blue-400';
            } else {
              borderClass = 'border-slate-600';
              shadowClass = '';
            }
            return (
              <button
                key={food.id}
                onClick={() => onSelectFood?.(food)}
                onMouseDown={() => handlePressStart(food.id)}
                onMouseUp={handlePressEnd}
                onMouseLeave={handlePressEnd}
                onTouchStart={() => handlePressStart(food.id)}
                onTouchEnd={handlePressEnd}
                onTouchCancel={handlePressEnd}
                className={`w-full bg-slate-700/50 border rounded-lg p-3 text-left transition-all ${
                  isLongPressing
                    ? 'border-blue-400 scale-[0.98]'
                    : `${borderClass} active:scale-[0.99]`
                } ${shadowClass}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {/* No pin icon, just blue border for pinned */}
                      <h4 className="text-white font-semibold text-sm truncate">
                        {food.name}
                      </h4>
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${getCategoryClasses(food.category)}`}
                      >
                        {FOOD_CATEGORIES[food.category]?.label}
                      </span>
                      {food.portions && food.portions.length > 0 && (
                        <span className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded">
                          {food.portions.length}{' '}
                          {food.portions.length === 1 ? 'portion' : 'portions'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-slate-500 text-[10px] font-medium">
                      per 100g
                    </span>
                    <div className="flex items-center gap-3 text-xs">
                      <div className="text-center">
                        <p className="text-emerald-400 font-bold">
                          {formatOne(food.per100g.calories)}
                        </p>
                        <p className="text-slate-500">cal</p>
                      </div>
                      <div className="text-center">
                        <p className="text-red-400 font-bold">
                          {formatOne(food.per100g.protein)}g
                        </p>
                        <p className="text-slate-500">prot</p>
                      </div>
                      <div className="text-center">
                        <p className="text-amber-400 font-bold">
                          {formatOne(food.per100g.carbs)}g
                        </p>
                        <p className="text-slate-500">carb</p>
                      </div>
                      <div className="text-center">
                        <p className="text-yellow-400 font-bold">
                          {formatOne(food.per100g.fats)}g
                        </p>
                        <p className="text-slate-500">fat</p>
                      </div>
                    </div>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Cancel Button */}
      <div className="mt-4">
        <button
          onClick={onClose}
          className="w-full px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition-all"
        >
          Cancel
        </button>
      </div>
    </ModalShell>
  );
};
