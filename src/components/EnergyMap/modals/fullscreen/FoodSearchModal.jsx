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
  ScanBarcode,
  Search,
  ChevronLeft,
  Edit3,
  SlidersHorizontal,
  X,
  Plus,
  WifiOff,
  Database,
  Globe,
  AlertCircle,
  CloudOff,
  Sparkles,
  SendHorizontal,
  Paperclip,
  Camera,
  ImagePlus,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { shallow } from 'zustand/shallow';
import { ModalShell } from '../../common/ModalShell';
import { useAnimatedModal } from '../../../../hooks/useAnimatedModal';
import { ConfirmActionModal } from '../common/ConfirmActionModal';
import { AddCustomFoodModal } from '../forms/AddCustomFoodModal';
import { FOOD_CATEGORIES } from '../../../../constants/foodDatabase';
import { formatOne } from '../../../../utils/format';
import { useNetworkStatus } from '../../../../hooks/useNetworkStatus';
import { useEnergyMapStore } from '../../../../store/useEnergyMapStore';
import {
  getDistinctSubcategories as getLocalSubcategories,
  getFoodById as getLocalFoodById,
  searchFoods as searchLocalFoods,
} from '../../../../services/foodCatalog';
import {
  searchFoods as searchOnlineFoods,
  getFoodDetails,
  addToFoodCache,
  trimFoodCache,
  FatSecretError,
} from '../../../../services/fatSecret';
import {
  sendGeminiMessage,
  GeminiError,
  validateAttachmentFile,
  MAX_IMAGE_COUNT,
} from '../../../../services/gemini';

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
  onSaveAsFavourite,
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
  const [pendingManualAdd, setPendingManualAdd] = useState(null);
  const {
    isOpen: isDeleteConfirmOpen,
    isClosing: isDeleteConfirmClosing,
    open: openDeleteConfirm,
    requestClose: requestDeleteConfirmClose,
    forceClose: forceDeleteConfirmClose,
  } = useAnimatedModal(false);

  const {
    isOpen: isManualAddConfirmOpen,
    isClosing: isManualAddConfirmClosing,
    open: openManualAddConfirm,
    requestClose: requestManualAddConfirmClose,
    forceClose: forceManualAddConfirmClose,
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
  const [localDbResults, setLocalDbResults] = useState([]);
  const [isLocalSearching, setIsLocalSearching] = useState(false);
  const [localSearchError, setLocalSearchError] = useState(null);
  const [localSubcategories, setLocalSubcategories] = useState([]);
  const [favouriteFoodLookup, setFavouriteFoodLookup] = useState({});
  const searchTimeoutRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Network status
  const { isOnline } = useNetworkStatus();

  // Scroll/fade overlays for action buttons
  const actionScrollRef = useRef(null);

  // AI chat state
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatAttachments, setChatAttachments] = useState([]);
  const [chatError, setChatError] = useState(null);
  const [isSendingChat, setIsSendingChat] = useState(false);
  const chatAbortControllerRef = useRef(null);
  const chatScrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

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
      setLocalDbResults([]);
      setLocalSearchError(null);
      setIsSearching(false);
      setIsLocalSearching(false);
      setLoadingFoodId(null);
      setViewMode('search');
      setFavouritesSearchQuery('');
      setFavouritesSortBy('name');
      setFavouritesSortOrder('asc');
      setIsFavouritesFilterOpen(false);
      setChatMessages([]);
      setChatInput('');
      setChatError(null);
      setIsSendingChat(false);
      chatAttachments.forEach((attachment) => {
        if (attachment.previewUrl) {
          URL.revokeObjectURL(attachment.previewUrl);
        }
      });
      setChatAttachments([]);
      forceDeleteConfirmClose();
      forceManualAddConfirmClose();
      forceAddCustomFoodClose();
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (chatAbortControllerRef.current) {
        chatAbortControllerRef.current.abort();
      }
    }
  }, [
    chatAttachments,
    forceDeleteConfirmClose,
    forceManualAddConfirmClose,
    forceAddCustomFoodClose,
    isClosing,
  ]);

  // Clear online results when switching modes
  useEffect(() => {
    setOnlineResults([]);
    setSearchError(null);
    setLocalSearchError(null);
    setSelectedCategory(null);
    setSelectedSubcategory(null);
    setIsFilterOpen(false);
    setViewMode('search');
  }, [searchMode]);

  useEffect(() => {
    if (searchMode !== 'local' || viewMode !== 'search') {
      return;
    }

    let cancelled = false;
    setIsLocalSearching(true);
    setLocalSearchError(null);

    searchLocalFoods({
      query: searchQuery,
      category: selectedCategory,
      subcategory: selectedSubcategory,
      sortBy,
      sortOrder,
      limit: 500,
    })
      .then((rows) => {
        if (cancelled) {
          return;
        }
        setLocalDbResults(Array.isArray(rows) ? rows : []);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        console.error('Local food search error:', error);
        setLocalDbResults([]);
        setLocalSearchError('Local database search failed.');
      })
      .finally(() => {
        if (cancelled) {
          return;
        }
        setIsLocalSearching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    searchMode,
    viewMode,
    searchQuery,
    selectedCategory,
    selectedSubcategory,
    sortBy,
    sortOrder,
  ]);

  useEffect(() => {
    if (searchMode !== 'local' || !selectedCategory) {
      setLocalSubcategories([]);
      return;
    }

    let cancelled = false;

    getLocalSubcategories(selectedCategory)
      .then((subcategories) => {
        if (cancelled) {
          return;
        }
        setLocalSubcategories(
          Array.isArray(subcategories) ? subcategories : []
        );
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        console.error('Failed to load local subcategories:', error);
        setLocalSubcategories([]);
      });

    return () => {
      cancelled = true;
    };
  }, [searchMode, selectedCategory]);

  useEffect(() => {
    const uniqueFoodIds = Array.from(
      new Set(
        (resolvedFavourites ?? [])
          .map((favourite) => favourite?.foodId)
          .filter((foodId) => typeof foodId === 'string' && foodId.length > 0)
      )
    );

    if (uniqueFoodIds.length === 0) {
      setFavouriteFoodLookup({});
      return;
    }

    let cancelled = false;

    Promise.all(
      uniqueFoodIds.map(async (foodId) => [
        foodId,
        await getLocalFoodById(foodId),
      ])
    )
      .then((pairs) => {
        if (cancelled) {
          return;
        }

        const nextLookup = Object.fromEntries(
          pairs.filter(([, food]) => Boolean(food))
        );
        setFavouriteFoodLookup(nextLookup);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        console.error('Failed to resolve favourite foods:', error);
        setFavouriteFoodLookup({});
      });

    return () => {
      cancelled = true;
    };
  }, [resolvedFavourites]);

  useEffect(() => {
    if (!isDeleteConfirmOpen && !isDeleteConfirmClosing) {
      const timeout = setTimeout(() => {
        setPendingDeleteId(null);
      }, 0);
      return () => clearTimeout(timeout);
    }
  }, [isDeleteConfirmClosing, isDeleteConfirmOpen]);

  useEffect(() => {
    if (!isManualAddConfirmOpen && !isManualAddConfirmClosing) {
      const timeout = setTimeout(() => {
        setPendingManualAdd(null);
      }, 0);
      return () => clearTimeout(timeout);
    }
  }, [isManualAddConfirmClosing, isManualAddConfirmOpen]);

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
    return favouriteFoodLookup[foodId] ?? null;
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
      brand: favourite.brand || null,
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

  const handleFavouriteCardClick = (favourite, isManual, event) => {
    event?.stopPropagation();

    if (isManual) {
      setPendingManualAdd(favourite);
      openManualAddConfirm();
      return;
    }

    handleFavouriteEdit(favourite, event);
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
      if (chatAbortControllerRef.current) {
        chatAbortControllerRef.current.abort();
      }
      chatAttachments.forEach((attachment) => {
        if (attachment.previewUrl) {
          URL.revokeObjectURL(attachment.previewUrl);
        }
      });
    };
  }, [chatAttachments]);

  useEffect(() => {
    if (viewMode !== 'chat') return;

    const handlePaste = (event) => {
      const clipboardItems = Array.from(event.clipboardData?.items || []);
      const imageFiles = clipboardItems
        .filter(
          (item) => item.kind === 'file' && item.type.startsWith('image/')
        )
        .map((item) => item.getAsFile())
        .filter(Boolean);

      if (imageFiles.length === 0) return;

      event.preventDefault();
      setChatError(null);

      setChatAttachments((prev) => {
        const remainingSlots = Math.max(MAX_IMAGE_COUNT - prev.length, 0);
        const acceptedFiles = imageFiles.slice(0, remainingSlots);
        const nextAttachments = [...prev];

        acceptedFiles.forEach((file, index) => {
          try {
            validateAttachmentFile(file);
            nextAttachments.push({
              id: `${Date.now()}-${index}-${file.name}`,
              file,
              previewUrl: URL.createObjectURL(file),
            });
          } catch (error) {
            setChatError(error.message || 'Invalid image attachment');
          }
        });

        if (imageFiles.length > acceptedFiles.length) {
          setChatError(
            `You can attach up to ${MAX_IMAGE_COUNT} images per message.`
          );
        }

        return nextAttachments;
      });
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [viewMode]);

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

    // Include both local DB-derived and cached foods
    const allFoods = [
      ...localDbResults,
      ...resolvedCachedFoods,
      ...customFoods,
    ];
    const subcats = new Set();

    localSubcategories.forEach((subcategory) => {
      subcats.add(subcategory);
    });

    allFoods.forEach((food) => {
      if (food.category === selectedCategory && food.subcategory) {
        subcats.add(food.subcategory);
      }
    });
    return Array.from(subcats).sort();
  }, [
    customFoods,
    localDbResults,
    localSubcategories,
    selectedCategory,
    searchMode,
    onlineResults,
    resolvedCachedFoods,
  ]);

  // Apply search, filter, and sort for LOCAL mode
  const localSearchResults = useMemo(() => {
    const mergedMap = new Map();

    [...localDbResults, ...resolvedCachedFoods, ...customFoods].forEach(
      (food) => {
        if (!food?.id) {
          return;
        }
        mergedMap.set(food.id, food);
      }
    );

    let results = Array.from(mergedMap.values());

    if (selectedCategory) {
      results = results.filter((food) => food.category === selectedCategory);
    }

    if (selectedSubcategory) {
      results = results.filter(
        (food) => food.subcategory === selectedSubcategory
      );
    }

    if (searchQuery.trim()) {
      const normalizedQuery = searchQuery.toLowerCase().trim();
      results = results.filter(
        (food) =>
          String(food.name ?? '')
            .toLowerCase()
            .includes(normalizedQuery) ||
          String(food.brand ?? '')
            .toLowerCase()
            .includes(normalizedQuery) ||
          String(food.category ?? '')
            .toLowerCase()
            .includes(normalizedQuery)
      );
    }

    results.sort((a, b) => {
      if (sortBy === 'name') {
        return String(a.name ?? '').localeCompare(String(b.name ?? ''));
      }

      const aValue = Number(a?.per100g?.[sortBy] ?? 0);
      const bValue = Number(b?.per100g?.[sortBy] ?? 0);
      return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
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
    customFoods,
    localDbResults,
    resolvedCachedFoods,
    searchQuery,
    selectedCategory,
    selectedSubcategory,
    sortBy,
    sortOrder,
    resolvedPinnedFoods,
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
    return `${map[color] || 'bg-accent-slate'} text-primary-foreground`;
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

  const isSearchAddExpanded =
    viewMode === 'search' || viewMode === 'favourites';
  const toggleSegmentIndex =
    viewMode === 'favourites' ? 2 : searchMode === 'online' ? 1 : 0;

  const handleAddAttachmentFiles = (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    setChatError(null);

    setChatAttachments((prev) => {
      const remainingSlots = Math.max(MAX_IMAGE_COUNT - prev.length, 0);
      const acceptedFiles = files.slice(0, remainingSlots);
      const nextAttachments = [...prev];

      acceptedFiles.forEach((file, index) => {
        try {
          validateAttachmentFile(file);
          nextAttachments.push({
            id: `${Date.now()}-${index}-${file.name}`,
            file,
            previewUrl: URL.createObjectURL(file),
          });
        } catch (error) {
          setChatError(error.message || 'Invalid image attachment');
        }
      });

      if (files.length > acceptedFiles.length) {
        setChatError(
          `You can attach up to ${MAX_IMAGE_COUNT} images per message.`
        );
      }

      return nextAttachments;
    });
  };

  const removeAttachment = (attachmentId) => {
    setChatAttachments((prev) => {
      const attachment = prev.find((item) => item.id === attachmentId);
      if (attachment?.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
      return prev.filter((item) => item.id !== attachmentId);
    });
  };

  const buildAiFoodEntry = useCallback(
    (entry, index = 0) => {
      if (!entry?.name) {
        return null;
      }

      const entryId = entryIdRef.current;
      entryIdRef.current += 1;

      const safeNumber = (value) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
      };

      const grams = Number(entry.grams);

      return {
        id: entryId,
        foodId: `ai_${Date.now()}_${index}`,
        name: entry.name,
        calories: Math.max(0, Math.round(safeNumber(entry.calories))),
        protein: Math.max(0, Math.round(safeNumber(entry.protein) * 10) / 10),
        carbs: Math.max(0, Math.round(safeNumber(entry.carbs) * 10) / 10),
        fats: Math.max(0, Math.round(safeNumber(entry.fats) * 10) / 10),
        grams: Number.isFinite(grams) && grams > 0 ? Math.round(grams) : null,
        source: 'ai',
        timestamp: new Date().toISOString(),
      };
    },
    [entryIdRef]
  );

  const buildAiSourceFood = useCallback((foodEntry) => {
    if (!foodEntry?.name) {
      return null;
    }

    const grams = Number(foodEntry.grams);
    const divisor = Number.isFinite(grams) && grams > 0 ? grams / 100 : null;

    return {
      id: foodEntry.foodId,
      name: foodEntry.name,
      category: 'supplements',
      source: 'ai',
      per100g:
        divisor && divisor > 0
          ? {
              calories: Math.round(foodEntry.calories / divisor),
              protein: Math.round((foodEntry.protein / divisor) * 10) / 10,
              carbs: Math.round((foodEntry.carbs / divisor) * 10) / 10,
              fats: Math.round((foodEntry.fats / divisor) * 10) / 10,
            }
          : null,
      portions: [],
    };
  }, []);

  const handleLogAiEntry = useCallback(
    (entry, { closeModal } = { closeModal: false }) => {
      const foodEntry = buildAiFoodEntry(entry);
      if (!foodEntry) return;
      onSelectFavourite?.(foodEntry, { closeModal });
    },
    [buildAiFoodEntry, onSelectFavourite]
  );

  const handleSaveAiFavourite = useCallback(
    (entry, index = 0) => {
      const foodEntry = buildAiFoodEntry(entry, index);
      if (!foodEntry) return;
      const sourceFood = buildAiSourceFood(foodEntry);
      onSaveAsFavourite?.(foodEntry, sourceFood);
    },
    [buildAiFoodEntry, buildAiSourceFood, onSaveAsFavourite]
  );

  const handleLogAllAiEntries = useCallback(
    (entries, closeModal = false) => {
      if (!Array.isArray(entries) || entries.length === 0) return;

      entries.forEach((entry, index) => {
        const isLast = index === entries.length - 1;
        handleLogAiEntry(entry, { closeModal: closeModal && isLast });
      });
    },
    [handleLogAiEntry]
  );

  const sendChat = async () => {
    if (isSendingChat) return;

    if (!isOnline) {
      setChatError('You are offline. Connect to the internet to use AI chat.');
      return;
    }

    if (!chatInput.trim() && chatAttachments.length === 0) {
      setChatError('Type a message or attach at least one image.');
      return;
    }

    const currentText = chatInput;
    const currentAttachments = [...chatAttachments];

    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: currentText.trim() || 'Image analysis request',
      attachmentCount: currentAttachments.length,
      createdAt: Date.now(),
    };

    const history = chatMessages
      .filter(
        (message) => message.role === 'user' || message.role === 'assistant'
      )
      .map((message) => ({ role: message.role, content: message.content }));

    setChatMessages((prev) => [...prev.slice(-48), userMessage]);
    setChatError(null);
    setIsSendingChat(true);

    const controller = new window.AbortController();
    chatAbortControllerRef.current = controller;

    try {
      const result = await sendGeminiMessage({
        message: currentText,
        files: currentAttachments.map((attachment) => attachment.file),
        history,
        signal: controller.signal,
      });

      setChatMessages((prev) => [
        ...prev.slice(-49),
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: result.text,
          foodParser: result.foodParser ?? null,
          createdAt: Date.now(),
        },
      ]);

      setChatInput('');
      currentAttachments.forEach((attachment) => {
        if (attachment.previewUrl) {
          URL.revokeObjectURL(attachment.previewUrl);
        }
      });
      setChatAttachments([]);
    } catch (error) {
      const message =
        error instanceof GeminiError
          ? error.message
          : 'Failed to get AI response. Please try again.';
      setChatError(message);
    } finally {
      setIsSendingChat(false);
      chatAbortControllerRef.current = null;
    }
  };

  const handleChatInputKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendChat();
    }
  };

  useEffect(() => {
    if (viewMode !== 'chat') return;
    chatScrollRef.current?.scrollTo({
      top: chatScrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [chatMessages, chatAttachments, viewMode]);

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      onClose={onClose}
      fullHeight
      overlayClassName="fixed inset-0 bg-surface/70 !p-0 !flex-none !items-stretch !justify-stretch"
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
                  className="relative flex items-center bg-primary rounded-full shadow-md overflow-hidden"
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
                      isSearchAddExpanded
                        ? 'text-primary-foreground border-2 border-[rgb(var(--action-border)/0.7)] rounded-full bg-primary'
                        : 'text-primary-foreground/80 md:hover:text-primary-foreground'
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
                      isSearchAddExpanded
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
                      className="flex items-center gap-2 px-3 py-2 text-primary-foreground/80 md:hover:text-primary-foreground text-sm font-semibold transition-colors whitespace-nowrap press-feedback focus-ring"
                    >
                      <Plus size={16} />
                      <span className="whitespace-nowrap">Add</span>
                    </motion.button>
                  </motion.div>
                </motion.div>

                <button
                  onClick={() => setViewMode('chat')}
                  aria-label="AI Chat"
                  className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-primary md:hover:brightness-110 text-primary-foreground rounded-full text-sm font-semibold transition-all shadow-md whitespace-nowrap press-feedback focus-ring border ${
                    viewMode === 'chat'
                      ? 'border-[rgb(var(--action-border)/0.7)]'
                      : 'border-transparent'
                  }`}
                >
                  <Sparkles size={16} />
                  <span>AI Chat</span>
                </button>

                <button
                  onClick={onOpenManualEntry}
                  aria-label="Manual Entry"
                  className="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-primary md:hover:brightness-110 text-primary-foreground rounded-full text-sm font-semibold transition-all shadow-md whitespace-nowrap press-feedback focus-ring border border-transparent"
                >
                  <Edit3 size={16} />
                  <span>Manual Entry</span>
                </button>

                <button
                  onClick={() => {}}
                  aria-label="Barcode Scan"
                  className="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-primary md:hover:brightness-110 text-primary-foreground rounded-full text-sm font-semibold transition-all shadow-md whitespace-nowrap press-feedback focus-ring border border-transparent"
                >
                  <ScanBarcode size={16} />
                  <span>Barcode Scan</span>
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

        {viewMode === 'chat' && (
          <div className="flex-1 min-h-0 flex flex-col">
            {!isOnline && (
              <div className="mx-4 mt-3 flex items-center gap-2 px-3 py-2 bg-accent-amber/10 border border-accent-amber/30 rounded-lg flex-shrink-0">
                <CloudOff
                  size={14}
                  className="text-accent-amber flex-shrink-0"
                />
                <p className="text-accent-amber text-xs">
                  You&apos;re offline. AI chat requires an internet connection.
                </p>
              </div>
            )}

            <div
              ref={chatScrollRef}
              className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden touch-action-pan-y px-4 pt-3 pb-2 space-y-3"
            >
              {chatMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center gap-5 px-2 py-6">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-accent-blue/15 border border-accent-blue/25 flex items-center justify-center">
                      <Sparkles size={22} className="text-accent-blue" />
                    </div>
                    <p className="text-foreground font-semibold text-base">
                      Food Log Parser
                    </p>
                    <p className="text-muted text-xs max-w-[240px] leading-relaxed">
                      Describe what you ate (and optionally attach images). I
                      will estimate nutrition and prepare log-ready entries.
                    </p>
                  </div>

                  <div className="w-full grid grid-cols-2 gap-2">
                    {[
                      {
                        icon: '🍗',
                        label: 'Parse a food text',
                        prompt: '3 egg omelette',
                      },
                      {
                        icon: '📸',
                        label: 'Parse text + image',
                        prompt:
                          'Burger from a local diner (I will attach an image)',
                      },
                      {
                        icon: '🧮',
                        label: 'Ask with assumptions',
                        prompt: '2 slices pepperoni pizza, large slice size',
                      },
                      {
                        icon: '📝',
                        label: 'Multi-item parse',
                        prompt: 'Chicken sandwich and medium fries',
                      },
                    ].map(({ icon, label, prompt }) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setChatInput(prompt)}
                        className="flex items-center gap-2 px-3 py-2.5 bg-surface-highlight border border-border rounded-xl text-left text-xs font-medium text-foreground md:hover:border-accent-blue/40 md:hover:bg-accent-blue/5 transition-all pressable-inline focus-ring"
                      >
                        <span className="text-base leading-none">{icon}</span>
                        <span className="leading-tight">{label}</span>
                      </button>
                    ))}
                  </div>

                  <p className="text-muted text-[11px] text-center">
                    You can also paste or attach meal photos for visual
                    analysis.
                  </p>
                </div>
              ) : (
                <>
                  {chatMessages.map((message) => {
                    const isUser = message.role === 'user';
                    return (
                      <div
                        key={message.id}
                        className={`flex items-end gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}
                      >
                        {!isUser && (
                          <div className="flex-shrink-0 w-6 h-6 rounded-lg bg-accent-blue/15 border border-accent-blue/25 flex items-center justify-center mb-0.5">
                            <Sparkles size={12} className="text-accent-blue" />
                          </div>
                        )}

                        <div
                          className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                            isUser
                              ? 'bg-accent-blue text-primary-foreground rounded-br-md'
                              : 'bg-surface-highlight border border-border text-foreground rounded-bl-md'
                          }`}
                        >
                          <p>{message.content}</p>
                          {!isUser &&
                            message.foodParser?.messageType ===
                              'food_entries' &&
                            Array.isArray(message.foodParser.entries) &&
                            message.foodParser.entries.length > 0 && (
                              <div className="mt-3 space-y-2">
                                {message.foodParser.entries.map(
                                  (entry, index) => (
                                    <div
                                      key={`${message.id}-${entry.name}-${index}`}
                                      className="rounded-xl bg-surface border border-border px-3 py-2"
                                    >
                                      <div className="flex items-center justify-between gap-2 mb-2">
                                        <p className="text-xs font-semibold text-foreground truncate">
                                          {entry.name}
                                        </p>
                                        <span
                                          className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                                            entry.confidence === 'high'
                                              ? 'bg-accent-green/20 text-accent-green'
                                              : entry.confidence === 'low'
                                                ? 'bg-accent-red/20 text-accent-red'
                                                : 'bg-accent-amber/20 text-accent-amber'
                                          }`}
                                        >
                                          {entry.confidence ?? 'medium'}
                                        </span>
                                      </div>

                                      <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted mb-2">
                                        {Number.isFinite(entry.grams) && (
                                          <span>{formatOne(entry.grams)}g</span>
                                        )}
                                        <span>
                                          {formatOne(entry.calories)} kcal
                                        </span>
                                        <span>{formatOne(entry.protein)}P</span>
                                        <span>{formatOne(entry.carbs)}C</span>
                                        <span>{formatOne(entry.fats)}F</span>
                                      </div>

                                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleLogAiEntry(entry, {
                                              closeModal: false,
                                            })
                                          }
                                          className="px-2.5 py-1.5 rounded-lg bg-accent-blue text-primary-foreground text-xs font-semibold md:hover:brightness-110 press-feedback focus-ring"
                                        >
                                          Log
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleLogAiEntry(entry, {
                                              closeModal: true,
                                            })
                                          }
                                          className="px-2.5 py-1.5 rounded-lg bg-accent-emerald text-primary-foreground text-xs font-semibold md:hover:brightness-110 press-feedback focus-ring"
                                        >
                                          Log & Exit
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleSaveAiFavourite(entry, index)
                                          }
                                          className="px-2.5 py-1.5 rounded-lg bg-surface-highlight border border-border text-foreground text-xs font-semibold md:hover:border-accent-purple/50 press-feedback focus-ring"
                                        >
                                          Save Favorite
                                        </button>
                                      </div>
                                    </div>
                                  )
                                )}

                                {message.foodParser.entries.length > 1 && (
                                  <div className="rounded-xl bg-surface border border-border px-3 py-2">
                                    <p className="text-[11px] text-muted mb-2">
                                      Batch actions
                                    </p>
                                    <div className="grid grid-cols-2 gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleLogAllAiEntries(
                                            message.foodParser.entries,
                                            false
                                          )
                                        }
                                        className="px-2.5 py-1.5 rounded-lg bg-accent-indigo text-primary-foreground text-xs font-semibold md:hover:brightness-110 press-feedback focus-ring"
                                      >
                                        Add All
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleLogAllAiEntries(
                                            message.foodParser.entries,
                                            true
                                          )
                                        }
                                        className="px-2.5 py-1.5 rounded-lg bg-accent-purple text-primary-foreground text-xs font-semibold md:hover:brightness-110 press-feedback focus-ring"
                                      >
                                        Add All & Exit
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          {isUser && message.attachmentCount > 0 && (
                            <p className="text-xs text-primary-foreground/70 mt-1">
                              {message.attachmentCount} image
                              {message.attachmentCount === 1 ? '' : 's'}{' '}
                              attached
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {isSendingChat && (
                    <div className="flex items-end gap-2 justify-start">
                      <div className="flex-shrink-0 w-6 h-6 rounded-lg bg-accent-blue/15 border border-accent-blue/25 flex items-center justify-center">
                        <Sparkles size={12} className="text-accent-blue" />
                      </div>
                      <div className="bg-surface-highlight border border-border rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1">
                        {[0, 150, 300].map((delay) => (
                          <span
                            key={delay}
                            className="w-1.5 h-1.5 bg-muted rounded-full animate-bounce"
                            style={{
                              animationDelay: `${delay}ms`,
                              animationDuration: '900ms',
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {chatAttachments.length > 0 && (
              <div className="px-4 pb-1 flex-shrink-0">
                <div className="overflow-x-auto touch-action-pan-x scrollbar-hide">
                  <div className="flex gap-2 w-max py-1">
                    {chatAttachments.map((attachment) => (
                      <div
                        key={attachment.id}
                        className="relative w-14 h-14 rounded-xl border border-border overflow-hidden bg-surface-highlight flex-shrink-0"
                      >
                        <img
                          src={attachment.previewUrl}
                          alt="Attachment preview"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeAttachment(attachment.id)}
                          className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-background/90 backdrop-blur-sm text-muted md:hover:text-foreground flex items-center justify-center pressable-inline focus-ring border border-border/50"
                          aria-label="Remove image"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {chatError && (
              <div className="mx-4 mb-1 flex-shrink-0">
                <div className="bg-accent-red/10 border border-accent-red/30 rounded-lg px-3 py-2 text-accent-red text-xs flex items-start gap-2">
                  <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
                  <span>{chatError}</span>
                </div>
              </div>
            )}

            <div className="px-4 pb-3 pt-1 flex-shrink-0">
              <div className="rounded-2xl border border-border bg-surface-highlight overflow-hidden shadow-sm">
                <div className="flex items-end gap-2 px-2 pt-2 pb-2">
                  <div className="flex items-center gap-0.5 pb-0.5 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isSendingChat}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-muted md:hover:text-foreground md:hover:bg-surface transition-all pressable-inline focus-ring disabled:opacity-40"
                      aria-label="Attach image"
                    >
                      <Paperclip size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      disabled={isSendingChat}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-muted md:hover:text-foreground md:hover:bg-surface transition-all pressable-inline focus-ring disabled:opacity-40"
                      aria-label="Take photo"
                    >
                      <Camera size={15} />
                    </button>
                  </div>

                  <div className="w-px h-5 bg-border flex-shrink-0 self-center" />

                  <textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={handleChatInputKeyDown}
                    placeholder="Describe food to log (text and/or images)…"
                    rows={1}
                    className="flex-1 resize-none max-h-28 bg-transparent text-foreground placeholder:text-muted outline-none py-1.5 px-2 text-sm leading-relaxed"
                  />

                  <button
                    type="button"
                    onClick={sendChat}
                    disabled={
                      isSendingChat ||
                      (!chatInput.trim() && chatAttachments.length === 0)
                    }
                    className="flex-shrink-0 w-9 h-9 rounded-xl bg-accent-blue text-primary-foreground md:hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center press-feedback focus-ring self-end"
                    aria-label="Send message"
                  >
                    {isSendingChat ? (
                      <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin-fast" />
                    ) : (
                      <SendHorizontal size={15} />
                    )}
                  </button>
                </div>

                <div className="px-3 pb-2 flex items-center justify-between">
                  <p className="text-[10px] text-muted">
                    Up to {MAX_IMAGE_COUNT} images · JPEG/PNG/WebP · max 5MB
                    each · paste supported
                  </p>
                  <div
                    className="flex items-center gap-1 text-[10px] text-muted"
                    title="Paste image from clipboard"
                  >
                    <ImagePlus size={11} />
                    <span>paste</span>
                  </div>
                </div>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={(e) => {
                handleAddAttachmentFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                handleAddAttachmentFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>
        )}

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
                className="w-full bg-surface-highlight border border-border rounded-lg pl-11 pr-10 py-3 text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent-blue"
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
                className="w-full bg-surface-highlight border border-border rounded-lg pl-11 pr-10 py-3 text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent-blue"
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

        {/* Local/Online/Favorites Toggle */}
        {viewMode !== 'chat' && (
          <div className="px-4 mt-3">
            <div className="relative flex items-center p-1 bg-surface-highlight rounded-lg">
              <div
                className={`absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-md shadow-md ${
                  viewMode === 'favourites'
                    ? 'bg-accent-indigo'
                    : searchMode === 'local'
                      ? 'bg-accent-blue'
                      : 'bg-accent-emerald'
                }`}
                style={{
                  transform: `translateX(${toggleSegmentIndex * 100}%)`,
                  transition:
                    'transform 0.2s cubic-bezier(0.32, 0.72, 0, 1), background-color 0.2s ease-out',
                }}
              />
              <button
                onClick={() => {
                  setViewMode('search');
                  setSearchMode('local');
                }}
                className={`relative z-10 flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'search' && searchMode === 'local'
                    ? 'text-primary-foreground'
                    : 'text-muted md:hover:text-foreground'
                }`}
              >
                <Database size={16} />
                <span>Local</span>
              </button>
              <button
                onClick={() => {
                  if (!isOnline) return;
                  setViewMode('search');
                  setSearchMode('online');
                }}
                disabled={!isOnline}
                className={`relative z-10 flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'search' && searchMode === 'online'
                    ? 'text-primary-foreground'
                    : isOnline
                      ? 'text-muted md:hover:text-foreground'
                      : 'text-muted cursor-not-allowed opacity-50'
                }`}
              >
                {isOnline ? <Globe size={16} /> : <WifiOff size={16} />}
                <span>Online</span>
              </button>
              <button
                onClick={() => setViewMode('favourites')}
                className={`relative z-10 flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'favourites'
                    ? 'text-primary-foreground'
                    : 'text-muted md:hover:text-foreground'
                }`}
              >
                <Star size={16} />
                <span>Favorites</span>
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
        {viewMode !== 'chat' && (
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
                                onClick={() =>
                                  setFavouritesSortBy(option.value)
                                }
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
                              {searchMode === 'online'
                                ? 'Serving'
                                : 'Subcategory'}
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
        )}

        {/* Search Results */}
        {viewMode !== 'chat' && (
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
                        className="w-full text-left p-4 rounded-xl border border-border bg-surface-highlight transition-all md:hover:border-accent-emerald/40 cursor-pointer"
                        role="button"
                        tabIndex={0}
                        onClick={(event) =>
                          handleFavouriteCardClick(favourite, isManual, event)
                        }
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            handleFavouriteCardClick(
                              favourite,
                              isManual,
                              event
                            );
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
                              {favourite.brand && (
                                <span className="text-xs px-2 py-0.5 bg-accent-emerald/20 text-accent-emerald rounded truncate max-w-[140px]">
                                  {favourite.brand}
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
                            {/* Edit button - manual favourites only */}
                            {isManual && (
                              <button
                                type="button"
                                onClick={(e) =>
                                  handleFavouriteEdit(favourite, e)
                                }
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
                    <div className="bg-accent-red/10 border border-accent-red/30 rounded-lg p-4 flex items-start gap-3">
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
                      <p className="text-muted text-sm">
                        Searching local foods...
                      </p>
                    </div>
                  )}

                  {/* Loading State for Online Search */}
                  {searchMode === 'online' && isSearching && (
                    <div className="flex flex-col items-center justify-center py-12">
                      <div className="relative w-8 h-8 mb-3">
                        <div className="absolute inset-0 border-4 border-border rounded-full" />
                        <div className="absolute inset-0 border-4 border-transparent border-t-accent-blue rounded-full animate-spin-fast" />
                      </div>
                      <p className="text-muted text-sm">
                        Searching FatSecret database...
                      </p>
                    </div>
                  )}

                  {/* Empty State */}
                  {!isSearching &&
                  !isLocalSearching &&
                  !searchError &&
                  !localSearchError &&
                  displayResults.length === 0 ? (
                    <div className="p-20 text-center">
                      {searchMode === 'online' ? (
                        <>
                          <Globe
                            className="mx-auto text-muted mb-3"
                            size={32}
                          />
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
                          <Search
                            className="mx-auto text-muted mb-3"
                            size={32}
                          />
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
                                  {food.type === 'Brand'
                                    ? 'Branded'
                                    : 'Generic'}
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
                          className={`relative w-full bg-surface-highlight border rounded-xl p-3 text-left transition-all ${
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
          </div>
        )}
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

      <ConfirmActionModal
        isOpen={isManualAddConfirmOpen}
        isClosing={isManualAddConfirmClosing}
        title="Add manual food now?"
        description="This will add the manual favourite to the current meal."
        confirmLabel="Add"
        cancelLabel="Cancel"
        tone="success"
        onConfirm={() => {
          requestManualAddConfirmClose();
          if (pendingManualAdd) {
            handleFavouriteInstantAdd(pendingManualAdd);
          }
        }}
        onCancel={() => requestManualAddConfirmClose()}
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
