import React, {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
} from 'react';
import {
  Star,
  BotMessageSquare,
  ScanBarcode,
  Search,
  ChevronLeft,
  Edit3,
  SlidersHorizontal,
  X,
  Plus,
  Utensils,
  WifiOff,
  Database,
  Globe,
  Loader2,
  AlertCircle,
  CloudOff,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ModalShell } from '../common/ModalShell';
import {
  FOOD_CATEGORIES,
  FOOD_DATABASE,
} from '../../../constants/foodDatabase';
import { formatOne } from '../../../utils/format';
import { useNetworkStatus } from '../../../hooks/useNetworkStatus';
import {
  searchFoods as searchOnlineFoods,
  getFoodDetails,
  addToFoodCache,
  trimFoodCache,
  FatSecretError,
} from '../../../services/fatSecret';

export const FoodSearchModal = ({
  isOpen,
  isClosing,
  onClose,
  onSelectFood,
  onOpenManualEntry,
  onOpenFavourites,
  pinnedFoods = [],
  onTogglePin,
  cachedFoods = [],
  onUpdateCachedFoods,
}) => {
  const LONG_PRESS_DURATION = 650;
  const DEBOUNCE_DELAY = 500;

  // Search mode: 'local' or 'online'
  const [searchMode, setSearchMode] = useState('local');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState(null);
  const [sortBy, setSortBy] = useState('name'); // name, calories, protein, carbs, fats
  const [sortOrder, setSortOrder] = useState('asc'); // asc, desc
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const dropdownRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const skipNextClickRef = useRef(false);
  const [longPressingId, setLongPressingId] = useState(null);

  // Online search state
  const [onlineResults, setOnlineResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [loadingFoodId, setLoadingFoodId] = useState(null);
  const searchTimeoutRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Network status
  const { isOnline } = useNetworkStatus();

  // Scroll/fade overlays for action buttons
  const actionScrollRef = useRef(null);

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

  // Reset state when modal closes
  useEffect(() => {
    if (isClosing) {
      // Clear online search state on close
      setOnlineResults([]);
      setSearchError(null);
      setIsSearching(false);
      setLoadingFoodId(null);
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    }
  }, [isClosing]);

  // Clear online results when switching modes
  useEffect(() => {
    setOnlineResults([]);
    setSearchError(null);
  }, [searchMode]);

  // Debounced online search
  const performOnlineSearch = useCallback(async (query) => {
    if (!query || query.trim().length < 2) {
      setOnlineResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    try {
      const result = await searchOnlineFoods(query);
      setOnlineResults(result.foods || []);
    } catch (error) {
      console.error('Online search error:', error);
      if (error instanceof FatSecretError) {
        setSearchError(error.message);
      } else {
        setSearchError('Search failed. Please try again.');
      }
      setOnlineResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Handle search query changes with debouncing for online mode
  useEffect(() => {
    if (searchMode !== 'online') return;

    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Don't search if query too short
    if (searchQuery.trim().length < 2) {
      setOnlineResults([]);
      setIsSearching(false);
      return;
    }

    // Set loading state immediately for feedback
    setIsSearching(true);

    // Debounce the actual API call
    searchTimeoutRef.current = setTimeout(() => {
      performOnlineSearch(searchQuery);
    }, DEBOUNCE_DELAY);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, searchMode, performOnlineSearch]);

  // Handle selecting an online food (fetch full details and cache)
  const handleOnlineFoodSelect = async (previewFood) => {
    if (!previewFood.fatSecretId) {
      // Already has full data (from cache), use directly
      onSelectFood?.(previewFood);
      return;
    }

    setLoadingFoodId(previewFood.id);
    setSearchError(null);

    try {
      // Fetch full food details
      const fullFood = await getFoodDetails(previewFood.fatSecretId);

      // Add to cache
      if (onUpdateCachedFoods) {
        const updatedCache = addToFoodCache(cachedFoods, fullFood);
        const trimmedCache = trimFoodCache(updatedCache, 200);
        onUpdateCachedFoods(trimmedCache);
      }

      // Pass to parent
      onSelectFood?.(fullFood);
    } catch (error) {
      console.error('Failed to fetch food details:', error);
      setSearchError(
        error instanceof FatSecretError
          ? error.message
          : 'Failed to load food details'
      );
    } finally {
      setLoadingFoodId(null);
    }
  };

  // Long-press handlers
  const handlePressStart = (foodId, event) => {
    if (event?.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    setLongPressingId(foodId);
    skipNextClickRef.current = false;

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }

    longPressTimerRef.current = setTimeout(() => {
      if (onTogglePin) {
        onTogglePin(foodId);
        skipNextClickRef.current = true;
      }
      setLongPressingId(null);
      longPressTimerRef.current = null;
    }, LONG_PRESS_DURATION);
  };

  const handlePressEnd = (shouldResetSkip = false) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    setLongPressingId(null);

    if (shouldResetSkip) {
      skipNextClickRef.current = false;
    }
  };

  const handleFoodClick = (food) => {
    if (skipNextClickRef.current) {
      skipNextClickRef.current = false;
      return;
    }

    onSelectFood?.(food);
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  // Show small fade overlays on scrollable action buttons container

  // Get unique subcategories for selected category
  const availableSubcategories = useMemo(() => {
    if (!selectedCategory) return [];

    // Include both static DB and cached foods
    const allFoods = [...FOOD_DATABASE, ...cachedFoods];
    const subcats = new Set();
    allFoods.forEach((food) => {
      if (food.category === selectedCategory && food.subcategory) {
        subcats.add(food.subcategory);
      }
    });
    return Array.from(subcats).sort();
  }, [selectedCategory, cachedFoods]);

  // Apply search, filter, and sort for LOCAL mode
  const localSearchResults = useMemo(() => {
    // Merge static database with cached online foods
    const allLocalFoods = [...FOOD_DATABASE, ...cachedFoods];

    // Search using local search function, but on merged array
    let results;
    if (!searchQuery.trim()) {
      results = allLocalFoods;
    } else {
      const query = searchQuery.toLowerCase().trim();
      results = allLocalFoods.filter(
        (food) =>
          food.name.toLowerCase().includes(query) ||
          food.brand?.toLowerCase().includes(query) ||
          food.category?.toLowerCase().includes(query)
      );
    }

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
    cachedFoods,
  ]);

  // Current results based on mode
  const displayResults =
    searchMode === 'local' ? localSearchResults : onlineResults;

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
      fullHeight
      overlayClassName="fixed inset-0 bg-black/70 !p-0 !flex-none !items-stretch !justify-stretch"
      contentClassName="fixed inset-0 w-screen h-screen p-0 bg-slate-900 rounded-none border-none !max-h-none flex flex-col overflow-x-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
    >
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onClose?.()}
            aria-label="Back"
            className="text-slate-300 hover:text-white transition-all"
          >
            <ChevronLeft size={24} />
          </button>
          <div className="flex items-center gap-2">
            <Search className="text-blue-400" size={24} />
            <h3 className="text-white font-bold text-xl">Add Food</h3>
          </div>
        </div>
      </div>

      <div className="flex-1 bg-slate-800 border-t border-slate-700 overflow-y-auto flex flex-col">
        {/* Search Mode Toggle */}
        <div className="px-4 pt-4">
          <div className="flex items-center gap-2 p-1 bg-slate-700/50 rounded-lg">
            <button
              onClick={() => setSearchMode('local')}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                searchMode === 'local'
                  ? 'bg-blue-500 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-600/50'
              }`}
            >
              <Database size={16} />
              <span>Local</span>
              {cachedFoods.length > 0 && (
                <span className="text-xs opacity-75">
                  (+{cachedFoods.length})
                </span>
              )}
            </button>
            <button
              onClick={() => isOnline && setSearchMode('online')}
              disabled={!isOnline}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                searchMode === 'online'
                  ? 'bg-emerald-500 text-white shadow-md'
                  : isOnline
                    ? 'text-slate-400 hover:text-white hover:bg-slate-600/50'
                    : 'text-slate-500 cursor-not-allowed opacity-50'
              }`}
            >
              {isOnline ? <Globe size={16} /> : <WifiOff size={16} />}
              <span>Online</span>
            </button>
          </div>
          {!isOnline && (
            <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <CloudOff size={16} className="text-amber-400 flex-shrink-0" />
              <p className="text-amber-400 text-xs">
                You&apos;re offline. Online search requires an internet
                connection.
              </p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="px-4 mt-3">
          <div className="relative overflow-hidden">
            <div
              ref={actionScrollRef}
              className="relative overflow-x-auto touch-action-pan-x scrollbar-hide"
            >
              <div className="flex gap-2 w-max">
                <button
                  onClick={onOpenFavourites}
                  aria-label="Favorites"
                  className="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-600/50 text-white rounded-full text-sm font-semibold transition-all shadow-md shadow-blue-500/20 whitespace-nowrap"
                >
                  <Star size={16} />
                  <span>Favorites</span>
                </button>

                <button
                  onClick={() => {}}
                  aria-label="Meal"
                  className="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-600/50 text-white rounded-full text-sm font-semibold transition-all shadow-md shadow-blue-500/20 whitespace-nowrap"
                >
                  <Utensils size={16} />
                  <span>Meal</span>
                </button>

                <button
                  onClick={() => {}}
                  aria-label="Add Food"
                  className="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-600/50 text-white rounded-full text-sm font-semibold transition-all shadow-md shadow-blue-500/20 whitespace-nowrap"
                >
                  <Plus size={16} />
                  <span>Add Food</span>
                </button>

                <button
                  onClick={onOpenManualEntry}
                  aria-label="Manual Entry"
                  className="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-600/50 text-white rounded-full text-sm font-semibold transition-all shadow-md shadow-blue-500/20 whitespace-nowrap"
                >
                  <Edit3 size={16} />
                  <span>Manual Entry</span>
                </button>

                <button
                  onClick={() => {}}
                  aria-label="Barcode Scan"
                  className="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-600/50 text-white rounded-full text-sm font-semibold transition-all shadow-md shadow-blue-500/20 whitespace-nowrap"
                >
                  <ScanBarcode size={16} />
                  <span>Barcode Scan</span>
                </button>

                <button
                  onClick={() => {}}
                  aria-label="AI Chatbot"
                  className="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-600/50 text-white rounded-full text-sm font-semibold transition-all shadow-md shadow-blue-500/20 whitespace-nowrap"
                >
                  <BotMessageSquare size={16} />
                  <span>AI Chatbot</span>
                </button>
              </div>
            </div>

            <div className="pointer-events-none absolute inset-y-0 -left-px w-10 z-20">
              <div className="absolute inset-y-0 left-0 w-2 bg-slate-800" />
              <div className="absolute inset-y-0 left-2 right-0 bg-gradient-to-r from-slate-800 via-slate-800/80 to-transparent" />
            </div>

            <div className="pointer-events-none absolute inset-y-0 -right-px w-10 z-20">
              <div className="absolute inset-y-0 right-0 w-2 bg-slate-800" />
              <div className="absolute inset-y-0 left-0 right-2 bg-gradient-to-l from-slate-800 via-slate-800/80 to-transparent" />
            </div>
          </div>
        </div>

        {/* Search Input */}
        <div className="px-4 mt-3">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={20}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                searchMode === 'online'
                  ? 'Search FatSecret database...'
                  : 'Search local foods...'
              }
              className="w-full bg-slate-700 border border-slate-600 rounded-lg pl-11 pr-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            )}
          </div>
          {searchMode === 'online' &&
            searchQuery.length > 0 &&
            searchQuery.length < 2 && (
              <p className="mt-1 text-slate-500 text-xs">
                Type at least 2 characters to search
              </p>
            )}
        </div>

        {/* Results Count & Filter Button */}
        <div className="px-4 mt-3 flex items-center justify-between">
          <p className="text-slate-400 text-sm">
            {searchMode === 'online' ? (
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
                {displayResults.length}{' '}
                {displayResults.length === 1 ? 'food' : 'foods'} found
              </>
            )}
          </p>

          {searchMode === 'local' && (
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
          )}
        </div>

        {/* Search Results */}
        <div className="flex-1 min-h-0 px-4 py-4 relative">
          <div className="h-full overflow-y-auto overflow-x-hidden touch-action-pan-y space-y-2">
            {/* Error State */}
            {searchError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle
                  size={20}
                  className="text-red-400 flex-shrink-0 mt-0.5"
                />
                <div>
                  <p className="text-red-400 font-medium text-sm">
                    {searchError}
                  </p>
                  <button
                    onClick={() => performOnlineSearch(searchQuery)}
                    className="mt-2 text-xs text-red-400 hover:text-red-300 underline"
                  >
                    Try again
                  </button>
                </div>
              </div>
            )}

            {/* Loading State for Online Search */}
            {searchMode === 'online' && isSearching && (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2
                  size={32}
                  className="text-blue-400 animate-spin mb-3"
                />
                <p className="text-slate-400 text-sm">
                  Searching FatSecret database...
                </p>
              </div>
            )}

            {/* Empty State */}
            {!isSearching && !searchError && displayResults.length === 0 ? (
              <div className="p-20 text-center">
                {searchMode === 'online' ? (
                  <>
                    <Globe className="mx-auto text-slate-500 mb-3" size={32} />
                    <p className="text-slate-400 text-sm">
                      {searchQuery.length < 2
                        ? 'Enter a search term to find foods online'
                        : 'No results found. Try a different search term.'}
                    </p>
                  </>
                ) : (
                  <>
                    <Search className="mx-auto text-slate-500 mb-3" size={32} />
                    <p className="text-slate-400 text-sm">No foods found</p>
                  </>
                )}
              </div>
            ) : searchMode === 'online' && !isSearching ? (
              /* Online Results */
              onlineResults.map((food) => {
                const isLoading = loadingFoodId === food.id;
                return (
                  <button
                    key={food.id}
                    onClick={() => !isLoading && handleOnlineFoodSelect(food)}
                    disabled={isLoading}
                    className={`relative w-full bg-slate-700/50 border border-slate-600 rounded-lg p-3 text-left transition-all ${
                      isLoading
                        ? 'opacity-70 cursor-wait'
                        : 'active:scale-[0.99] hover:border-emerald-500/50'
                    }`}
                  >
                    {isLoading && (
                      <div className="absolute inset-0 bg-slate-800/50 rounded-lg flex items-center justify-center z-10">
                        <Loader2
                          size={24}
                          className="text-blue-400 animate-spin"
                        />
                      </div>
                    )}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-white font-semibold text-sm truncate">
                            {food.name}
                          </h4>
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {food.brand && (
                            <span className="text-xs px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded truncate max-w-[150px]">
                              {food.brand}
                            </span>
                          )}
                          <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                            {food.type === 'Brand' ? 'Branded' : 'Generic'}
                          </span>
                          <span className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded flex items-center gap-1">
                            <Globe size={10} />
                            Online
                          </span>
                        </div>
                      </div>
                      {food.previewMacros && (
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-slate-500 text-[10px] font-medium">
                            {food.previewMacros.servingInfo || 'per serving'}
                          </span>
                          <div className="flex items-center gap-2 text-xs">
                            <div className="text-center">
                              <p className="text-emerald-400 font-bold">
                                {Math.round(food.previewMacros.calories)}
                              </p>
                              <p className="text-slate-500">cal</p>
                            </div>
                            <div className="text-center">
                              <p className="text-red-400 font-bold">
                                {formatOne(food.previewMacros.protein)}g
                              </p>
                              <p className="text-slate-500">prot</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })
            ) : (
              /* Local Results */
              !isSearching &&
              displayResults.map((food) => {
                const isPinned = pinnedFoods.includes(food.id);
                const isLongPressing = longPressingId === food.id;
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
                    onClick={() => handleFoodClick(food)}
                    onPointerDown={(event) => handlePressStart(food.id, event)}
                    onPointerUp={() => handlePressEnd(false)}
                    onPointerLeave={() => handlePressEnd(true)}
                    onPointerCancel={() => handlePressEnd(true)}
                    onContextMenu={(event) => event.preventDefault()}
                    className={`relative w-full bg-slate-700/50 border rounded-lg p-3 text-left transition-all ${
                      isLongPressing
                        ? 'border-blue-400 scale-[0.98]'
                        : `${borderClass} active:scale-[0.99]`
                    } ${shadowClass}`}
                  >
                    {isPinned && (
                      <div className="absolute top-2 right-2 w-1.5 h-1.5 bg-blue-400 rounded-full"></div>
                    )}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-white font-semibold text-sm truncate">
                            {food.name}
                          </h4>
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span
                            className={`text-xs px-2 py-0.5 rounded ${getCategoryClasses(food.category)}`}
                          >
                            {FOOD_CATEGORIES[food.category]?.label ||
                              (food.source === 'fatsecret'
                                ? 'Cached'
                                : food.category)}
                          </span>
                          {food.brand && (
                            <span className="text-xs px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded truncate max-w-[100px]">
                              {food.brand}
                            </span>
                          )}
                          {food.source === 'fatsecret' && (
                            <span className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded flex items-center gap-1">
                              <Globe size={10} />
                              Cached
                            </span>
                          )}
                          {food.portions && food.portions.length > 0 && (
                            <span className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded">
                              {food.portions.length}{' '}
                              {food.portions.length === 1
                                ? 'portion'
                                : 'portions'}
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
          <div className="pointer-events-none absolute left-0 right-0 top-0 h-3 bg-gradient-to-b from-slate-800/90 to-transparent" />
          <div className="pointer-events-none absolute left-0 right-0 bottom-0 h-3 bg-gradient-to-t from-slate-800/90 to-transparent" />
        </div>
      </div>
    </ModalShell>
  );
};
