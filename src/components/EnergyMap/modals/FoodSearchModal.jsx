import React, {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
} from 'react';
import {
  Star,
  Heart,
  Trash2,
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
  AlertCircle,
  CloudOff,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { shallow } from 'zustand/shallow';
import { ModalShell } from '../common/ModalShell';
import { useAnimatedModal } from '../../../hooks/useAnimatedModal';
import { ConfirmActionModal } from './ConfirmActionModal';
import { AddCustomFoodModal } from './AddCustomFoodModal';
import {
  FOOD_CATEGORIES,
  FOOD_DATABASE,
} from '../../../constants/foodDatabase';
import { formatOne } from '../../../utils/format';
import { useNetworkStatus } from '../../../hooks/useNetworkStatus';
import { useEnergyMapStore } from '../../../store/useEnergyMapStore';
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
  onAddCustomFood,
  favourites = [],
  onSelectFavourite,
  onEditFavourite,
  onDeleteFavourite,
  pinnedFoods = [],
  onTogglePin,
  cachedFoods = [],
  onUpdateCachedFoods,
  customFoods = [],
}) => {
  const {
    foodFavourites,
    pinnedFoods: storePinnedFoods,
    cachedFoods: storeCachedFoods,
    togglePinnedFood,
    updateCachedFoods,
  } = useEnergyMapStore(
    (state) => ({
      foodFavourites: state.foodFavourites,
      pinnedFoods: state.pinnedFoods,
      cachedFoods: state.cachedFoods,
      togglePinnedFood: state.togglePinnedFood,
      updateCachedFoods: state.updateCachedFoods,
    }),
    shallow
  );
  const resolvedFavourites = favourites ?? foodFavourites;
  const resolvedPinnedFoods = pinnedFoods ?? storePinnedFoods;
  const resolvedCachedFoods = cachedFoods ?? storeCachedFoods;
  const resolvedTogglePin = onTogglePin ?? togglePinnedFood;
  const resolvedUpdateCachedFoods = onUpdateCachedFoods ?? updateCachedFoods;
  const LONG_PRESS_DURATION = 650;
  const DEBOUNCE_DELAY = 500;
  const ONLINE_CATEGORIES = {
    Brand: { label: 'Branded', color: 'blue' },
    Generic: { label: 'Generic', color: 'slate' },
  };

  // Search mode: 'local' or 'online'
  const [searchMode, setSearchMode] = useState('local');
  const [viewMode, setViewMode] = useState('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [favouritesSearchQuery, setFavouritesSearchQuery] = useState('');
  const [favouritesSortBy, setFavouritesSortBy] = useState('name');
  const [favouritesSortOrder, setFavouritesSortOrder] = useState('asc');
  const [isFavouritesFilterOpen, setIsFavouritesFilterOpen] = useState(false);
  const favouritesDropdownRef = useRef(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState(null);
  const [sortBy, setSortBy] = useState('name'); // name, calories, protein, carbs, fats
  const [sortOrder, setSortOrder] = useState('asc'); // asc, desc
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const dropdownRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const skipNextClickRef = useRef(false);
  const [longPressingId, setLongPressingId] = useState(null);
  const entryIdRef = useRef(1);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const {
    isOpen: isDeleteConfirmOpen,
    isClosing: isDeleteConfirmClosing,
    open: openDeleteConfirm,
    requestClose: requestDeleteConfirmClose,
    forceClose: forceDeleteConfirmClose,
  } = useAnimatedModal(false);

  // Add Custom Food modal state
  const {
    isOpen: isAddCustomFoodOpen,
    isClosing: isAddCustomFoodClosing,
    open: openAddCustomFood,
    requestClose: requestAddCustomFoodClose,
    forceClose: forceAddCustomFoodClose,
  } = useAnimatedModal(false);

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
      if (
        favouritesDropdownRef.current &&
        !favouritesDropdownRef.current.contains(event.target)
      ) {
        setIsFavouritesFilterOpen(false);
      }
    };

    if (isFilterOpen || isFavouritesFilterOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isFilterOpen, isFavouritesFilterOpen]);

  // Reset state when modal closes
  useEffect(() => {
    if (isClosing) {
      // Clear online search state on close
      setOnlineResults([]);
      setSearchError(null);
      setIsSearching(false);
      setLoadingFoodId(null);
      setViewMode('search');
      setFavouritesSearchQuery('');
      setFavouritesSortBy('name');
      setFavouritesSortOrder('asc');
      setIsFavouritesFilterOpen(false);
      forceDeleteConfirmClose();
      forceAddCustomFoodClose();
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    }
  }, [forceDeleteConfirmClose, forceAddCustomFoodClose, isClosing]);

  // Clear online results when switching modes
  useEffect(() => {
    setOnlineResults([]);
    setSearchError(null);
    setSelectedCategory(null);
    setSelectedSubcategory(null);
    setIsFilterOpen(false);
    setViewMode('search');
  }, [searchMode]);

  useEffect(() => {
    if (!isDeleteConfirmOpen && !isDeleteConfirmClosing) {
      const timeout = setTimeout(() => {
        setPendingDeleteId(null);
      }, 0);
      return () => clearTimeout(timeout);
    }
  }, [isDeleteConfirmClosing, isDeleteConfirmOpen]);

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
      if (resolvedUpdateCachedFoods) {
        const updatedCache = addToFoodCache(resolvedCachedFoods, fullFood);
        const trimmedCache = trimFoodCache(updatedCache, 200);
        resolvedUpdateCachedFoods(trimmedCache);
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
      if (resolvedTogglePin) {
        resolvedTogglePin(foodId);
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

  const handleFavouriteInstantAdd = (favourite, event) => {
    event?.stopPropagation();

    const entryId = entryIdRef.current;
    entryIdRef.current += 1;

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

  const resolveFoodById = (foodId) => {
    if (!foodId) return null;
    return FOOD_DATABASE.find((food) => food.id === foodId) ?? null;
  };
  const toPer100g = (value, grams) => {
    if (!grams || grams <= 0) return 0;
    return Math.round((value / grams) * 100 * 10) / 10;
  };

  const buildDisplayFood = (favourite) => {
    if (!favourite) return null;

    if (favourite.foodId) {
      const dbFood = resolveFoodById(favourite.foodId);
      if (dbFood) {
        return {
          ...dbFood,
          savedGrams: favourite.grams,
          savedCalories: favourite.calories,
          savedProtein: favourite.protein,
          savedCarbs: favourite.carbs,
          savedFats: favourite.fats,
        };
      }
    }

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
          ? toPer100g(favourite.protein || 0, favourite.grams)
          : 0,
        carbs: hasGrams ? toPer100g(favourite.carbs || 0, favourite.grams) : 0,
        fats: hasGrams ? toPer100g(favourite.fats || 0, favourite.grams) : 0,
      },
      portions: favourite.portions || [],
      savedGrams: favourite.grams,
      savedCalories: favourite.calories,
      savedProtein: favourite.protein,
      savedCarbs: favourite.carbs,
      savedFats: favourite.fats,
    };
  };

  const handleFavouriteEdit = (favourite, event) => {
    event?.stopPropagation();

    const displayFood = buildDisplayFood(favourite);
    if (!displayFood) return;

    onEditFavourite?.(displayFood, favourite);
  };

  const sortedFavourites = useMemo(() => {
    if (!Array.isArray(resolvedFavourites)) return [];

    let results = resolvedFavourites.filter(Boolean);

    // Apply search filter
    if (favouritesSearchQuery.trim()) {
      const query = favouritesSearchQuery.toLowerCase().trim();
      results = results.filter(
        (fav) =>
          fav.name?.toLowerCase().includes(query) ||
          fav.category?.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    results = [...results].sort((a, b) => {
      let compareValue = 0;

      if (favouritesSortBy === 'name') {
        const nameA = (a.name || '').toLowerCase();
        const nameB = (b.name || '').toLowerCase();
        compareValue = nameA.localeCompare(nameB);
      } else {
        const aValue = a[favouritesSortBy] || 0;
        const bValue = b[favouritesSortBy] || 0;
        compareValue = aValue - bValue;
      }

      return favouritesSortOrder === 'asc' ? compareValue : -compareValue;
    });

    return results;
  }, [
    resolvedFavourites,
    favouritesSearchQuery,
    favouritesSortBy,
    favouritesSortOrder,
  ]);

  const hasFavourites = sortedFavourites.length > 0;

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  // Show small fade overlays on scrollable action buttons container

  const localCategoryOptions = useMemo(() => {
    const merged = { ...FOOD_CATEGORIES };
    if (resolvedCachedFoods.length > 0) {
      merged.cached = { label: 'Cached', color: 'purple' };
    }
    return merged;
  }, [resolvedCachedFoods]);

  const categoryOptions =
    searchMode === 'online' ? ONLINE_CATEGORIES : localCategoryOptions;

  // Get unique subcategories for selected category
  const availableSubcategories = useMemo(() => {
    if (!selectedCategory) return [];

    if (searchMode === 'online') {
      const servingSet = new Set();
      onlineResults.forEach((food) => {
        if (food.type === selectedCategory) {
          const servingInfo = food.previewMacros?.servingInfo;
          if (servingInfo) {
            servingSet.add(servingInfo);
          }
        }
      });
      return Array.from(servingSet).sort();
    }

    // Include both static DB and cached foods
    const allFoods = [...FOOD_DATABASE, ...resolvedCachedFoods];
    const subcats = new Set();
    allFoods.forEach((food) => {
      if (food.category === selectedCategory && food.subcategory) {
        subcats.add(food.subcategory);
      }
    });
    return Array.from(subcats).sort();
  }, [selectedCategory, searchMode, onlineResults, resolvedCachedFoods]);

  // Apply search, filter, and sort for LOCAL mode
  const localSearchResults = useMemo(() => {
    // Merge static database with cached online foods and custom foods
    const allLocalFoods = [
      ...FOOD_DATABASE,
      ...resolvedCachedFoods,
      ...customFoods,
    ];

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
      const aIsPinned = resolvedPinnedFoods.includes(a.id);
      const bIsPinned = resolvedPinnedFoods.includes(b.id);
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
    resolvedPinnedFoods,
    resolvedCachedFoods,
    customFoods,
  ]);

  const onlineSearchResults = useMemo(() => {
    let results = [...onlineResults];

    if (selectedCategory) {
      results = results.filter((food) => food.type === selectedCategory);
    }

    if (selectedSubcategory) {
      results = results.filter(
        (food) => food.previewMacros?.servingInfo === selectedSubcategory
      );
    }

    results = [...results].sort((a, b) => {
      let compareValue = 0;

      if (sortBy === 'name') {
        compareValue = a.name.localeCompare(b.name);
      } else {
        const aValue = a.previewMacros?.[sortBy] || 0;
        const bValue = b.previewMacros?.[sortBy] || 0;
        compareValue = aValue - bValue;
      }

      return sortOrder === 'asc' ? compareValue : -compareValue;
    });

    return results;
  }, [onlineResults, selectedCategory, selectedSubcategory, sortBy, sortOrder]);

  // Current results based on mode
  const displayResults =
    searchMode === 'local' ? localSearchResults : onlineSearchResults;

  const getFilterActiveClass = (color) => {
    const map = {
      red: 'bg-accent-red',
      amber: 'bg-accent-amber',
      green: 'bg-accent-green',
      yellow: 'bg-accent-yellow',
      purple: 'bg-accent-purple',
      blue: 'bg-accent-blue',
      emerald: 'bg-accent-emerald',
      slate: 'bg-accent-slate',
      indigo: 'bg-accent-indigo',
    };
    return `${map[color] || 'bg-accent-slate'} text-white`;
  };

  const getCategoryClasses = (category) => {
    const colorMap = {
      protein: 'bg-accent-red/20 text-accent-red',
      carbs: 'bg-accent-amber/20 text-accent-amber',
      vegetables: 'bg-accent-green/20 text-accent-green',
      fats: 'bg-accent-yellow/20 text-accent-yellow',
      supplements: 'bg-accent-purple/20 text-accent-purple',
      cached: 'bg-accent-purple/20 text-accent-purple',
    };
    return colorMap[category] || 'bg-surface-highlight/60 text-muted';
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

  const hasActiveFavouritesFilters =
    favouritesSortBy !== 'name' || favouritesSortOrder !== 'asc';

  const clearFavouritesFilters = () => {
    setFavouritesSortBy('name');
    setFavouritesSortOrder('asc');
  };

  const getFavouritesSortLabel = () => {
    const labels = {
      name: 'Name',
      calories: 'Calories',
      protein: 'Protein',
      carbs: 'Carbs',
      fats: 'Fats',
    };
    const orderLabel = favouritesSortOrder === 'asc' ? '↑' : '↓';
    return `${labels[favouritesSortBy]} ${orderLabel}`;
  };

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
      contentClassName="fixed inset-0 w-screen h-screen p-0 bg-background rounded-none border-none !max-h-none flex flex-col overflow-x-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
    >
      <div className="flex items-center justify-between px-4 py-3 bg-background border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onClose?.()}
            aria-label="Back"
            className="text-muted md:hover:text-foreground transition-all pressable-inline focus-ring"
          >
            <ChevronLeft size={24} />
          </button>
          <div className="flex items-center gap-2">
            <h3 className="text-foreground font-bold text-xl">Add Food</h3>
          </div>
        </div>
      </div>

      <div className="flex-1 bg-surface border-t border-border overflow-y-auto flex flex-col">
        {/* Action Buttons - Always on top */}
        <div className="px-4 pt-4">
          <div className="relative overflow-hidden">
            <div
              ref={actionScrollRef}
              className="relative overflow-x-auto touch-action-pan-x scrollbar-hide"
            >
              <div className="flex gap-2 w-max mx-2 py-2">
                {/* Search + Add Food as single pill when search is active */}
                <motion.div
                  className="relative flex items-center bg-blue-600 rounded-full shadow-md shadow-blue-500/30 overflow-hidden"
                  initial={false}
                  layout
                  transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                >
                  <motion.button
                    onClick={() => setViewMode('search')}
                    aria-label="Search"
                    whileTap={{ scale: 0.98 }}
                    whileHover={{ y: -1 }}
                    className={`relative flex items-center gap-2 px-3 py-2 text-sm font-semibold transition-all whitespace-nowrap ${
                      viewMode === 'search'
                        ? 'text-white border-2 border-[rgb(var(--action-border)/0.7)] rounded-full bg-blue-600'
                        : 'text-white/80 md:hover:text-white'
                    }`}
                  >
                    <Search size={16} />
                    <span>Search</span>
                  </motion.button>

                  {/* Add Food button - animate width + slide in to push layout */}
                  <motion.div
                    className="overflow-hidden"
                    initial={false}
                    animate={
                      viewMode === 'search'
                        ? {
                            maxWidth: 160,
                            opacity: 1,
                            pointerEvents: 'auto',
                          }
                        : {
                            maxWidth: 0,
                            opacity: 0,
                            marginLeft: 0,
                            pointerEvents: 'none',
                          }
                    }
                    transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                    style={{ display: 'inline-flex' }}
                  >
                    <motion.button
                      onClick={openAddCustomFood}
                      aria-label="Add Food"
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.99 }}
                      className="flex items-center gap-2 px-3 py-2 text-white/80 md:hover:text-white text-sm font-semibold transition-colors whitespace-nowrap press-feedback focus-ring"
                    >
                      <Plus size={16} />
                      <span className="whitespace-nowrap">Add Food</span>
                    </motion.button>
                  </motion.div>
                </motion.div>

                <button
                  onClick={() => setViewMode('favourites')}
                  aria-label="Favorites"
                  className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-full text-sm font-semibold transition-all shadow-md whitespace-nowrap ${
                    viewMode === 'favourites'
                      ? 'bg-blue-600 text-white border-2 border-[rgb(var(--action-border)/0.7)] shadow-blue-500/30'
                      : 'bg-blue-600 text-white border border-transparent shadow-blue-500/20 md:hover:bg-blue-600/50'
                  }`}
                >
                  <Star size={16} />
                  <span>Favorites</span>
                </button>

                <button
                  onClick={() => {}}
                  aria-label="Meal"
                  className="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-blue-600 md:hover:bg-blue-600/50 text-white rounded-full text-sm font-semibold transition-all shadow-md shadow-blue-500/20 whitespace-nowrap press-feedback focus-ring border border-transparent"
                >
                  <Utensils size={16} />
                  <span>Meal</span>
                </button>

                <button
                  onClick={onOpenManualEntry}
                  aria-label="Manual Entry"
                  className="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-blue-600 md:hover:bg-blue-600/50 text-white rounded-full text-sm font-semibold transition-all shadow-md shadow-blue-500/20 whitespace-nowrap press-feedback focus-ring border border-transparent"
                >
                  <Edit3 size={16} />
                  <span>Manual Entry</span>
                </button>

                <button
                  onClick={() => {}}
                  aria-label="Barcode Scan"
                  className="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-blue-600 md:hover:bg-blue-600/50 text-white rounded-full text-sm font-semibold transition-all shadow-md shadow-blue-500/20 whitespace-nowrap press-feedback focus-ring border border-transparent"
                >
                  <ScanBarcode size={16} />
                  <span>Barcode Scan</span>
                </button>

                <button
                  onClick={() => {}}
                  aria-label="AI Chatbot"
                  className="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-blue-600 md:hover:bg-blue-600/50 text-white rounded-full text-sm font-semibold transition-all shadow-md shadow-blue-500/20 whitespace-nowrap press-feedback focus-ring border border-transparent"
                >
                  <BotMessageSquare size={16} />
                  <span>AI Chatbot</span>
                </button>
              </div>
            </div>

            <div className="pointer-events-none absolute inset-y-0 -left-px w-3 z-20">
              <div className="absolute inset-y-0 left-0 w-1 bg-surface" />
              <div className="absolute inset-y-0 left-1 right-0 bg-gradient-to-r from-surface via-surface/80 to-transparent" />
            </div>

            <div className="pointer-events-none absolute inset-y-0 -right-px w-3 z-20">
              <div className="absolute inset-y-0 right-0 w-1 bg-surface" />
              <div className="absolute inset-y-0 left-0 right-1 bg-gradient-to-l from-surface via-surface/80 to-transparent" />
            </div>
          </div>
        </div>

        {/* Search Input - for search mode */}
        {viewMode === 'search' && (
          <div className="px-4 mt-3">
            <div className="relative flex items-center">
              <Search
                className="absolute left-3 text-muted flex-shrink-0 pointer-events-none"
                size={20}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                }}
                placeholder={
                  searchMode === 'online'
                    ? 'Search FatSecret database...'
                    : 'Search local foods...'
                }
                className="w-full bg-surface-highlight border border-border rounded-lg pl-11 pr-10 py-3 text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 text-muted md:hover:text-foreground pressable-inline focus-ring flex-shrink-0"
                  aria-label="Clear search"
                >
                  <X size={18} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Search Input - for favourites mode */}
        {viewMode === 'favourites' && (
          <div className="px-4 mt-3">
            <div className="relative flex items-center">
              <Search
                className="absolute left-3 text-muted flex-shrink-0 pointer-events-none"
                size={20}
              />
              <input
                type="text"
                value={favouritesSearchQuery}
                onChange={(e) => setFavouritesSearchQuery(e.target.value)}
                placeholder="Search favourites..."
                className="w-full bg-surface-highlight border border-border rounded-lg pl-11 pr-10 py-3 text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              {favouritesSearchQuery && (
                <button
                  onClick={() => setFavouritesSearchQuery('')}
                  className="absolute right-3 text-muted md:hover:text-foreground pressable-inline focus-ring flex-shrink-0"
                  aria-label="Clear search"
                >
                  <X size={18} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Local/Online Toggle - only for search mode */}
        {viewMode === 'search' && (
          <div className="px-4 mt-3">
            <div className="relative flex items-center gap-2 p-1 bg-surface-highlight rounded-lg">
              <div
                className={`absolute inset-y-1 w-1/2 rounded-md shadow-md ${
                  searchMode === 'local'
                    ? 'bg-accent-blue'
                    : 'bg-accent-emerald'
                }`}
                style={{
                  left: searchMode === 'local' ? '4px' : 'calc(50% + 4px)',
                  transition:
                    'left 0.2s cubic-bezier(0.32, 0.72, 0, 1), background-color 0.2s ease-out',
                }}
              />
              <button
                onClick={() => setSearchMode('local')}
                className={`relative z-10 flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  searchMode === 'local'
                    ? 'text-white'
                    : 'text-muted md:hover:text-foreground'
                }`}
              >
                <Database size={16} />
                <span>Local</span>
              </button>
              <button
                onClick={() => isOnline && setSearchMode('online')}
                disabled={!isOnline}
                className={`relative z-10 flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  searchMode === 'online'
                    ? 'text-white'
                    : isOnline
                      ? 'text-muted md:hover:text-foreground'
                      : 'text-muted cursor-not-allowed opacity-50'
                }`}
              >
                {isOnline ? <Globe size={16} /> : <WifiOff size={16} />}
                <span>Online</span>
              </button>
            </div>
            {!isOnline && (
              <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-accent-amber/10 border border-accent-amber/30 rounded-lg">
                <CloudOff
                  size={16}
                  className="text-accent-amber flex-shrink-0"
                />
                <p className="text-accent-amber text-xs">
                  You&apos;re offline. Online search requires an internet
                  connection.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Results Count & Filter Button */}
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
                {displayResults.length}{' '}
                {displayResults.length === 1 ? 'food' : 'foods'} found
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
                onClick={() =>
                  setIsFavouritesFilterOpen(!isFavouritesFilterOpen)
                }
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
                                  ? 'bg-accent-emerald text-white'
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
                                ? 'bg-accent-emerald text-white'
                                : 'bg-surface-highlight/60 text-foreground md:hover:bg-surface'
                            }`}
                          >
                            ↑ Ascending
                          </button>
                          <button
                            onClick={() => setFavouritesSortOrder('desc')}
                            className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                              favouritesSortOrder === 'desc'
                                ? 'bg-accent-emerald text-white'
                                : 'bg-surface-highlight/60 text-foreground md:hover:bg-surface'
                            }`}
                          >
                            ↓ Descending
                          </button>
                        </div>
                      </div>

                      {hasActiveFavouritesFilters && (
                        <div className="pt-3 border-t border-border">
                          <p className="text-muted text-xs mb-2">
                            Active Sorting:
                          </p>
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
                    ? 'text-blue-400 md:hover:text-blue-300'
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
                          className="text-sm text-blue-400 md:hover:text-blue-300 font-medium focus-ring"
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
                                ? 'bg-accent-blue text-white'
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
                            {searchMode === 'online'
                              ? 'Serving'
                              : 'Subcategory'}
                          </label>
                          <div className="space-y-1.5">
                            <button
                              onClick={() => setSelectedSubcategory(null)}
                              className={`w-full px-3 py-2 rounded-lg text-left text-sm font-medium transition-all ${
                                selectedSubcategory === null
                                  ? 'bg-accent-blue text-white'
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
                                    ? 'bg-accent-blue text-white'
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
                                  ? 'bg-accent-emerald text-white'
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
                                ? 'bg-accent-emerald text-white'
                                : 'bg-surface-highlight/60 text-foreground md:hover:bg-surface'
                            }`}
                          >
                            ↑ Ascending
                          </button>
                          <button
                            onClick={() => setSortOrder('desc')}
                            className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                              sortOrder === 'desc'
                                ? 'bg-accent-emerald text-white'
                                : 'bg-surface-highlight/60 text-foreground md:hover:bg-surface'
                            }`}
                          >
                            ↓ Descending
                          </button>
                        </div>
                      </div>

                      {hasActiveFilters && (
                        <div className="pt-3 border-t border-border">
                          <p className="text-muted text-xs mb-2">
                            Active Filters:
                          </p>
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

        {/* Search Results */}
        <div className="flex-1 min-h-0 px-4 py-4 relative">
          <div className="h-full overflow-y-auto overflow-x-hidden touch-action-pan-y space-y-2">
            {viewMode === 'favourites' ? (
              hasFavourites ? (
                sortedFavourites.map((favourite) => {
                  const key =
                    favourite.id ?? `${favourite.name}-${favourite.grams}`;
                  // Determine type priority: cached > manual > custom > regular
                  // A food can only be ONE type - check in priority order
                  const isCached = favourite.source === 'fatsecret';
                  const isManual =
                    !isCached &&
                    (favourite.source === 'manual' ||
                      favourite.category === 'manual');
                  const isCustom =
                    !isCached &&
                    !isManual &&
                    (favourite.source === 'user' || favourite.isCustom);

                  return (
                    <div
                      key={key}
                      className="w-full text-left p-4 rounded-lg border border-border bg-surface-highlight transition-all md:hover:border-emerald-500/40 cursor-pointer"
                      role="button"
                      tabIndex={0}
                      onClick={(event) =>
                        handleFavouriteInstantAdd(favourite, event)
                      }
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleFavouriteInstantAdd(favourite, event);
                        }
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm leading-tight text-foreground truncate">
                            {favourite.name || 'Unnamed Food'}
                          </p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {/* Category tag - only show when explicit category exists and item is NOT cached (consolidate Cached badge) */}
                            {!isManual && !isCached && favourite.category && (
                              <span
                                className={`text-xs px-2 py-0.5 rounded ${getCategoryClasses(
                                  favourite.category
                                )}`}
                              >
                                {FOOD_CATEGORIES[favourite.category]?.label ||
                                  favourite.category}
                              </span>
                            )}
                            {/* Type tags - only ONE: Cached, Manual, or Custom */}
                            {isCached && (
                              <span className="text-xs px-2 py-0.5 bg-accent-purple/20 text-accent-purple rounded">
                                Cached
                              </span>
                            )}
                            {isManual && (
                              <span className="text-xs px-2 py-0.5 bg-accent-indigo/20 text-accent-indigo rounded">
                                Manual
                              </span>
                            )}
                            {isCustom && (
                              <span className="text-xs px-2 py-0.5 bg-accent-blue/20 text-accent-blue rounded">
                                Custom
                              </span>
                            )}
                            {/* Portion/grams info - ALWAYS at the end */}
                            {favourite.portionInfo ? (
                              <span className="text-xs text-muted">
                                {favourite.portionInfo.portionMultiplier}{' '}
                                {favourite.portionInfo.portionName}
                              </span>
                            ) : isCustom && favourite.per100g ? (
                              <span className="text-xs text-muted">
                                per 100g
                              </span>
                            ) : !isManual && favourite.grams ? (
                              <span className="text-xs text-muted">
                                {formatOne(favourite.grams)}g
                              </span>
                            ) : null}
                          </div>

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
                          {/* Edit button - show for all foods */}
                          <button
                            type="button"
                            onClick={(e) => handleFavouriteEdit(favourite, e)}
                            className="flex-shrink-0 w-9 h-9 rounded-full bg-foreground/10 md:hover:bg-blue-500/30 transition-colors flex items-center justify-center"
                            aria-label={
                              isManual
                                ? 'Edit manual entry'
                                : 'Edit portion before adding'
                            }
                            title={isManual ? 'Edit entry' : 'Edit portion'}
                          >
                            <Edit3 size={16} className="text-foreground" />
                          </button>

                          {typeof onDeleteFavourite === 'function' &&
                            favourite.id != null && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setPendingDeleteId(favourite.id);
                                  openDeleteConfirm();
                                }}
                                className="flex-shrink-0 w-9 h-9 rounded-full bg-foreground/10 md:hover:bg-red-500/20 transition-colors flex items-center justify-center"
                                aria-label="Delete favourite food"
                                title="Remove from favourites"
                              >
                                <Trash2
                                  size={16}
                                  className="text-foreground md:hover:text-red-400"
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
              )
            ) : (
              <>
                {/* Error State */}
                {searchError && (
                  <div className="bg-accent-red/10 border border-red-500/30 rounded-lg p-4 flex items-start gap-3">
                    <AlertCircle
                      size={20}
                      className="text-accent-red flex-shrink-0 mt-0.5"
                    />
                    <div>
                      <p className="text-accent-red font-medium text-sm">
                        {searchError}
                      </p>
                      <button
                        onClick={() => performOnlineSearch(searchQuery)}
                        className="mt-2 text-xs text-accent-red md:hover:text-accent-red/80 underline"
                      >
                        Try again
                      </button>
                    </div>
                  </div>
                )}

                {/* Loading State for Online Search */}
                {searchMode === 'online' && isSearching && (
                  <div className="flex flex-col items-center justify-center py-12">
                    <div className="relative w-8 h-8 mb-3">
                      <div className="absolute inset-0 border-4 border-border rounded-full" />
                      <div className="absolute inset-0 border-4 border-transparent border-t-blue-400 rounded-full animate-spin-fast" />
                    </div>
                    <p className="text-muted text-sm">
                      Searching FatSecret database...
                    </p>
                  </div>
                )}

                {/* Empty State */}
                {!isSearching && !searchError && displayResults.length === 0 ? (
                  <div className="p-20 text-center">
                    {searchMode === 'online' ? (
                      <>
                        <Globe className="mx-auto text-muted mb-3" size={32} />
                        <p className="text-muted text-sm">
                          {searchQuery.length < 2
                            ? 'Enter a search term to find foods online'
                            : 'No results found. Try a different search term.'}
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
                  /* Online Results */
                  onlineResults.map((food) => {
                    const isLoading = loadingFoodId === food.id;
                    return (
                      <button
                        key={food.id}
                        onClick={() =>
                          !isLoading && handleOnlineFoodSelect(food)
                        }
                        disabled={isLoading}
                        className={`relative w-full bg-surface-highlight border border-border rounded-lg p-3 text-left transition-all ${
                          isLoading
                            ? 'opacity-70 cursor-wait'
                            : 'active:scale-[0.99] md:hover:border-accent-emerald/50'
                        }`}
                      >
                        {isLoading && (
                          <div className="absolute inset-0 bg-surface-highlight rounded-lg flex items-center justify-center z-10">
                            <div className="relative w-6 h-6">
                              <div className="absolute inset-0 border-3 border-border rounded-full" />
                              <div className="absolute inset-0 border-3 border-transparent border-t-blue-400 rounded-full animate-spin-fast" />
                            </div>
                          </div>
                        )}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="text-foreground font-semibold text-sm truncate">
                                {food.name}
                              </h4>
                            </div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {food.brand && (
                                <span className="text-xs px-2 py-0.5 bg-accent-emerald/20 text-accent-emerald rounded truncate max-w-[150px]">
                                  {food.brand}
                                </span>
                              )}
                              <span className="text-xs px-2 py-0.5 bg-accent-blue/20 text-accent-blue rounded">
                                {food.type === 'Brand' ? 'Branded' : 'Generic'}
                              </span>
                            </div>
                          </div>
                          {food.previewMacros && (
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-muted text-[10px] font-medium">
                                {food.previewMacros.servingInfo ||
                                  'per serving'}
                              </span>
                              <div className="flex items-center gap-2 text-xs">
                                <div className="text-center">
                                  <p className="text-accent-emerald font-bold">
                                    {Math.round(food.previewMacros.calories)}
                                  </p>
                                  <p className="text-muted">cal</p>
                                </div>
                                <div className="text-center">
                                  <p className="text-accent-red font-bold">
                                    {formatOne(food.previewMacros.protein)}g
                                  </p>
                                  <p className="text-muted">prot</p>
                                </div>
                                <div className="text-center">
                                  <p className="text-accent-amber font-bold">
                                    {formatOne(food.previewMacros.carbs)}g
                                  </p>
                                  <p className="text-muted">carb</p>
                                </div>
                                <div className="text-center">
                                  <p className="text-accent-yellow font-bold">
                                    {formatOne(food.previewMacros.fats)}g
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
                  /* Local Results */
                  !isSearching &&
                  displayResults.map((food) => {
                    const isPinned = resolvedPinnedFoods.includes(food.id);
                    const isLongPressing = longPressingId === food.id;
                    let borderClass = '';
                    let shadowClass = '';
                    if (isPinned) {
                      borderClass = 'border-accent-blue';
                    } else {
                      borderClass = 'border-border';
                      shadowClass = '';
                    }
                    return (
                      <button
                        key={food.id}
                        onClick={() => handleFoodClick(food)}
                        onPointerDown={(event) =>
                          handlePressStart(food.id, event)
                        }
                        onPointerUp={() => handlePressEnd(false)}
                        onPointerLeave={() => handlePressEnd(true)}
                        onPointerCancel={() => handlePressEnd(true)}
                        onContextMenu={(event) => event.preventDefault()}
                        className={`relative w-full bg-surface-highlight border rounded-lg p-3 text-left transition-all ${
                          isLongPressing
                            ? 'border-accent-blue scale-[0.98]'
                            : `${borderClass} active:scale-[0.99]`
                        } ${shadowClass}`}
                      >
                        {isPinned && (
                          <div className="absolute top-2 right-2 w-1.5 h-1.5 bg-accent-blue rounded-full"></div>
                        )}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="text-foreground font-semibold text-sm truncate">
                                {food.name}
                              </h4>
                            </div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {food.source !== 'fatsecret' &&
                                food.category !== 'cached' && (
                                  <span
                                    className={`text-xs px-2 py-0.5 rounded ${getCategoryClasses(
                                      food.category
                                    )}`}
                                  >
                                    {FOOD_CATEGORIES[food.category]?.label ||
                                      food.category}
                                  </span>
                                )}
                              {food.brand && (
                                <span className="text-xs px-2 py-0.5 bg-accent-emerald/20 text-accent-emerald rounded truncate max-w-[100px]">
                                  {food.brand}
                                </span>
                              )}
                              {food.source === 'fatsecret' && (
                                <span className="text-xs px-2 py-0.5 bg-accent-purple/20 text-accent-purple rounded flex items-center gap-1">
                                  <Globe size={10} />
                                  Cached
                                </span>
                              )}
                              {food.portions && food.portions.length > 0 && (
                                <span className="text-xs px-2 py-0.5 bg-accent-purple/20 text-accent-purple rounded">
                                  {food.portions.length}{' '}
                                  {food.portions.length === 1
                                    ? 'portion'
                                    : 'portions'}
                                </span>
                              )}
                            </div>
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
            )}
          </div>
          <div className="pointer-events-none absolute left-0 right-0 top-0 h-3 bg-gradient-to-b from-surface/90 to-transparent" />
          <div className="pointer-events-none absolute left-0 right-0 bottom-0 h-3 bg-gradient-to-t from-surface/90 to-transparent" />
        </div>
      </div>

      <ConfirmActionModal
        isOpen={isDeleteConfirmOpen}
        isClosing={isDeleteConfirmClosing}
        title="Remove favourite food?"
        description="This food will be removed from your favourites list. You can add it back anytime."
        confirmLabel="Delete"
        cancelLabel="Keep"
        tone="danger"
        onConfirm={() => {
          requestDeleteConfirmClose();
          if (pendingDeleteId != null) {
            onDeleteFavourite?.(pendingDeleteId);
          }
        }}
        onCancel={() => requestDeleteConfirmClose()}
      />

      <AddCustomFoodModal
        isOpen={isAddCustomFoodOpen}
        isClosing={isAddCustomFoodClosing}
        onClose={requestAddCustomFoodClose}
        onSaveFood={(customFood) => {
          onAddCustomFood?.(customFood);
        }}
      />
    </ModalShell>
  );
};
