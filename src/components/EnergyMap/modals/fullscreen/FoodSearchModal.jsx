import React, {
  useState,
  useReducer,
  useMemo,
  useRef,
  useEffect,
  useCallback,
} from 'react';
import {
  Star,
  ScanBarcode,
  Search,
  ChevronLeft,
  Edit3,
  X,
  Plus,
  WifiOff,
  Database,
  Globe,
  AlertCircle,
  CloudOff,
  Sparkles,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { shallow } from 'zustand/shallow';
import { ModalShell } from '../../common/ModalShell';
import { useAnimatedModal } from '../../../../hooks/useAnimatedModal';
import { ConfirmActionModal } from '../common/ConfirmActionModal';
import { AddCustomFoodModal } from '../forms/AddCustomFoodModal';
import { BarcodeEntryModal } from '../forms/BarcodeEntryModal';
import { FoodSearchChatPanel } from './panels/FoodSearchChatPanel';
import { FoodSearchResultsPanel } from './panels/FoodSearchResultsPanel';
import { FoodSearchFavouritesPanel } from './panels/FoodSearchFavouritesPanel';
import { FoodSearchFilterControls } from './panels/FoodSearchFilterControls';
import { FOOD_CATEGORIES } from '../../../../constants/foodDatabase';
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
  searchBarcode as searchOpenFoodFactsBarcode,
  OpenFoodFactsError,
} from '../../../../services/openFoodFacts';
import {
  BarcodeScannerError,
  canUseNativeBarcodeScanner,
  scanNativeBarcode,
} from '../../../../services/barcodeScanner';
import {
  sendGeminiMessage,
  GeminiError,
  validateAttachmentFile,
  MAX_IMAGE_COUNT,
} from '../../../../services/gemini';

const CHAT_HISTORY_MESSAGE_LIMIT = 48;
const CHAT_TEXTAREA_MAX_HEIGHT = 112;

const initialUiState = {
  searchMode: 'local',
  viewMode: 'search',
  searchQuery: '',
  favouritesSearchQuery: '',
  favouritesSortBy: 'name',
  favouritesSortOrder: 'asc',
  isFavouritesFilterOpen: false,
  selectedCategory: null,
  selectedSubcategory: null,
  sortBy: 'name',
  sortOrder: 'asc',
  isFilterOpen: false,
};

const uiStateReducer = (state, action) => {
  if (action?.type === 'set') {
    const previousValue = state[action.key];
    const nextValue =
      typeof action.value === 'function'
        ? action.value(previousValue)
        : action.value;

    if (Object.is(previousValue, nextValue)) {
      return state;
    }

    return {
      ...state,
      [action.key]: nextValue,
    };
  }

  return state;
};

const createAttachmentId = () =>
  `attachment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const createChatAttachment = (file) => ({
  id: createAttachmentId(),
  file,
  previewUrl: URL.createObjectURL(file),
  name: file?.name || 'Meal image',
});

const cloneChatAttachmentForDraft = (attachment) => ({
  id: createAttachmentId(),
  file: attachment.file,
  previewUrl: URL.createObjectURL(attachment.file),
  name: attachment.name || attachment.file?.name || 'Meal image',
});

const revokeChatAttachment = (attachment) => {
  if (attachment?.previewUrl) {
    URL.revokeObjectURL(attachment.previewUrl);
  }
};

const revokeChatAttachments = (attachments = []) => {
  attachments.forEach((attachment) => revokeChatAttachment(attachment));
};

const createUserChatMessage = ({
  id,
  text,
  attachments = [],
  status = 'sent',
  error = null,
}) => ({
  id,
  role: 'user',
  text: typeof text === 'string' ? text.trim() : '',
  attachments,
  status,
  error,
  foodParser: null,
  createdAt: Date.now(),
});

const createAssistantChatMessage = ({
  id,
  text,
  foodParser = null,
  status = 'sent',
  error = null,
  replyToUserMessageId = null,
}) => ({
  id,
  role: 'assistant',
  text: typeof text === 'string' ? text.trim() : '',
  attachments: [],
  status,
  error,
  foodParser,
  replyToUserMessageId,
  createdAt: Date.now(),
});

const buildStructuredChatHistory = (messages, options = {}) => {
  const { beforeMessageId = null } = options;
  const history = [];

  for (const message of Array.isArray(messages) ? messages : []) {
    if (beforeMessageId && message.id === beforeMessageId) {
      break;
    }

    if (
      (message.role !== 'user' && message.role !== 'assistant') ||
      message.status !== 'sent'
    ) {
      continue;
    }

    if (message.role === 'user') {
      const parts = [];
      const text = typeof message.text === 'string' ? message.text.trim() : '';
      if (text) {
        parts.push({ text });
      }

      (Array.isArray(message.attachments) ? message.attachments : []).forEach(
        (attachment) => {
          if (
            attachment?.file &&
            typeof window !== 'undefined' &&
            attachment.file instanceof window.File
          ) {
            parts.push({ file: attachment.file });
          }
        }
      );

      if (parts.length > 0) {
        history.push({ role: 'user', parts });
      }
      continue;
    }

    const assistantText =
      typeof message.text === 'string' ? message.text.trim() : '';
    if (assistantText) {
      history.push({ role: 'assistant', content: assistantText });
    }
  }

  return history.slice(-CHAT_HISTORY_MESSAGE_LIMIT);
};

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

  const [uiState, dispatchUiState] = useReducer(uiStateReducer, initialUiState);
  const {
    searchMode,
    viewMode,
    searchQuery,
    favouritesSearchQuery,
    favouritesSortBy,
    favouritesSortOrder,
    isFavouritesFilterOpen,
    selectedCategory,
    selectedSubcategory,
    sortBy,
    sortOrder,
    isFilterOpen,
  } = uiState;
  const setUiStateField = (key, value) =>
    dispatchUiState({ type: 'set', key, value });
  const setSearchMode = (value) => setUiStateField('searchMode', value);
  const setViewMode = (value) => setUiStateField('viewMode', value);
  const setSearchQuery = (value) => setUiStateField('searchQuery', value);
  const setFavouritesSearchQuery = (value) =>
    setUiStateField('favouritesSearchQuery', value);
  const setFavouritesSortBy = (value) =>
    setUiStateField('favouritesSortBy', value);
  const setFavouritesSortOrder = (value) =>
    setUiStateField('favouritesSortOrder', value);
  const setIsFavouritesFilterOpen = (value) =>
    setUiStateField('isFavouritesFilterOpen', value);
  const favouritesDropdownRef = useRef(null);
  const setSelectedCategory = (value) =>
    setUiStateField('selectedCategory', value);
  const setSelectedSubcategory = (value) =>
    setUiStateField('selectedSubcategory', value);
  const setSortBy = (value) => setUiStateField('sortBy', value);
  const setSortOrder = (value) => setUiStateField('sortOrder', value);
  const setIsFilterOpen = (value) => setUiStateField('isFilterOpen', value);
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

  const {
    isOpen: isBarcodeEntryOpen,
    isClosing: isBarcodeEntryClosing,
    open: openBarcodeEntry,
    requestClose: requestBarcodeEntryClose,
    forceClose: forceBarcodeEntryClose,
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
  const [manualBarcodeInput, setManualBarcodeInput] = useState('');
  const [isBarcodeScanning, setIsBarcodeScanning] = useState(false);
  const [isBarcodeLookupPending, setIsBarcodeLookupPending] = useState(false);
  const [barcodeToast, setBarcodeToast] = useState(null);
  const barcodeToastTimerRef = useRef(null);
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
  const [activeChatRequest, setActiveChatRequest] = useState(null);
  const [expandedAiEntryKeys, setExpandedAiEntryKeys] = useState({});
  const [editingAiEntry, setEditingAiEntry] = useState(null);
  const chatAbortControllerRef = useRef(null);
  const chatScrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const chatTextareaRef = useRef(null);

  const {
    isOpen: isAiEntryEditorOpen,
    isClosing: isAiEntryEditorClosing,
    open: openAiEntryEditor,
    requestClose: requestAiEntryEditorClose,
    forceClose: forceAiEntryEditorClose,
  } = useAnimatedModal(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        dispatchUiState({ type: 'set', key: 'isFilterOpen', value: false });
      }
      if (
        favouritesDropdownRef.current &&
        !favouritesDropdownRef.current.contains(event.target)
      ) {
        dispatchUiState({
          type: 'set',
          key: 'isFavouritesFilterOpen',
          value: false,
        });
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
      dispatchUiState({ type: 'set', key: 'viewMode', value: 'search' });
      dispatchUiState({
        type: 'set',
        key: 'favouritesSearchQuery',
        value: '',
      });
      dispatchUiState({ type: 'set', key: 'favouritesSortBy', value: 'name' });
      dispatchUiState({
        type: 'set',
        key: 'favouritesSortOrder',
        value: 'asc',
      });
      dispatchUiState({
        type: 'set',
        key: 'isFavouritesFilterOpen',
        value: false,
      });
      setChatMessages([]);
      setChatInput('');
      setExpandedAiEntryKeys({});
      setEditingAiEntry(null);
      setChatError(null);
      setIsSendingChat(false);
      setActiveChatRequest(null);
      setIsBarcodeScanning(false);
      setIsBarcodeLookupPending(false);
      setManualBarcodeInput('');
      setBarcodeToast(null);
      if (barcodeToastTimerRef.current) {
        clearTimeout(barcodeToastTimerRef.current);
        barcodeToastTimerRef.current = null;
      }
      revokeChatAttachments(chatAttachments);
      chatMessages.forEach((message) => {
        revokeChatAttachments(message.attachments);
      });
      setChatAttachments([]);
      forceDeleteConfirmClose();
      forceManualAddConfirmClose();
      forceAddCustomFoodClose();
      forceBarcodeEntryClose();
      forceAiEntryEditorClose();
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
    forceBarcodeEntryClose,
    forceAiEntryEditorClose,
    isClosing,
    chatMessages,
  ]);

  // Clear online results when switching modes
  useEffect(() => {
    setOnlineResults([]);
    setSearchError(null);
    setLocalSearchError(null);
    dispatchUiState({ type: 'set', key: 'selectedCategory', value: null });
    dispatchUiState({ type: 'set', key: 'selectedSubcategory', value: null });
    dispatchUiState({ type: 'set', key: 'isFilterOpen', value: false });
    dispatchUiState({ type: 'set', key: 'viewMode', value: 'search' });
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

  const resolveBarcodeErrorMessage = useCallback((error) => {
    if (error instanceof FatSecretError) {
      return error.message;
    }

    if (error instanceof OpenFoodFactsError) {
      return error.message;
    }

    if (error instanceof BarcodeScannerError) {
      return error.message;
    }

    return 'Unable to read that barcode. Please try again.';
  }, []);

  const showBarcodeToast = useCallback(
    (message, tone = 'info', durationMs = 2600) => {
      if (barcodeToastTimerRef.current) {
        clearTimeout(barcodeToastTimerRef.current);
      }

      setBarcodeToast({ id: Date.now(), message, tone });

      if (durationMs > 0) {
        barcodeToastTimerRef.current = setTimeout(() => {
          setBarcodeToast(null);
          barcodeToastTimerRef.current = null;
        }, durationMs);
      }
    },
    []
  );

  const clearBarcodeToast = useCallback(() => {
    if (barcodeToastTimerRef.current) {
      clearTimeout(barcodeToastTimerRef.current);
      barcodeToastTimerRef.current = null;
    }
    setBarcodeToast(null);
  }, []);

  const activeBarcodeStatusToastMessage = useMemo(() => {
    if (isBarcodeScanning) {
      return 'Scanning barcode…';
    }

    if (isBarcodeLookupPending) {
      return 'Searching product database…';
    }

    return null;
  }, [isBarcodeLookupPending, isBarcodeScanning]);

  const lookupBarcodeAndSelectFood = useCallback(
    async (rawBarcode, { closeEntryModal = false } = {}) => {
      const cleanedBarcode = String(rawBarcode ?? '').replace(/\D/g, '');
      if (!cleanedBarcode || cleanedBarcode.length < 8) {
        showBarcodeToast(
          'Please enter a valid barcode (at least 8 digits).',
          'error'
        );
        return false;
      }

      if (!isOnline) {
        showBarcodeToast(
          'You are offline. Connect to the internet to look up barcodes.',
          'error'
        );
        return false;
      }

      clearBarcodeToast();
      setIsBarcodeLookupPending(true);

      try {
        const fullFood = await searchOpenFoodFactsBarcode(cleanedBarcode);

        if (resolvedUpdateCachedFoods) {
          const updatedCache = addToFoodCache(resolvedCachedFoods, fullFood);
          const trimmedCache = trimFoodCache(updatedCache, 200);
          resolvedUpdateCachedFoods(trimmedCache);
        }

        onSelectFood?.(fullFood);

        if (closeEntryModal) {
          requestBarcodeEntryClose();
        }

        setManualBarcodeInput('');
        showBarcodeToast(
          'Product found. Choose a portion to continue.',
          'info'
        );
        return true;
      } catch (error) {
        console.error('Barcode lookup error:', error);
        showBarcodeToast(resolveBarcodeErrorMessage(error), 'error');
        return false;
      } finally {
        setIsBarcodeLookupPending(false);
      }
    },
    [
      isOnline,
      onSelectFood,
      requestBarcodeEntryClose,
      resolveBarcodeErrorMessage,
      clearBarcodeToast,
      resolvedCachedFoods,
      resolvedUpdateCachedFoods,
      showBarcodeToast,
    ]
  );

  const handleBarcodeScanClick = useCallback(async () => {
    clearBarcodeToast();

    if (!isOnline) {
      showBarcodeToast(
        'You are offline. Connect to the internet to look up barcodes.',
        'error'
      );
      return;
    }

    if (!canUseNativeBarcodeScanner()) {
      openBarcodeEntry();
      return;
    }

    setIsBarcodeScanning(true);

    try {
      const result = await scanNativeBarcode();
      await lookupBarcodeAndSelectFood(result?.barcode ?? '');
    } catch (error) {
      if (error instanceof BarcodeScannerError && error.code === 'CANCELLED') {
        return;
      }

      console.error('Native barcode scan error:', error);
      showBarcodeToast(resolveBarcodeErrorMessage(error), 'error');
    } finally {
      setIsBarcodeScanning(false);
    }
  }, [
    clearBarcodeToast,
    isOnline,
    lookupBarcodeAndSelectFood,
    openBarcodeEntry,
    resolveBarcodeErrorMessage,
    showBarcodeToast,
  ]);

  const handleManualBarcodeSubmit = useCallback(() => {
    lookupBarcodeAndSelectFood(manualBarcodeInput, { closeEntryModal: true });
  }, [lookupBarcodeAndSelectFood, manualBarcodeInput]);

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
      brand: favourite.brand || null,
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
      if (barcodeToastTimerRef.current) {
        clearTimeout(barcodeToastTimerRef.current);
        barcodeToastTimerRef.current = null;
      }
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
      if (chatAbortControllerRef.current) {
        chatAbortControllerRef.current.abort();
      }
      revokeChatAttachments(chatAttachments);
      chatMessages.forEach((message) => {
        revokeChatAttachments(message.attachments);
      });
    };
  }, [chatAttachments, chatMessages]);

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

  const resizeChatTextarea = useCallback(() => {
    const textarea = chatTextareaRef.current;
    if (!textarea) return;

    textarea.style.height = '0px';
    const nextHeight = Math.min(
      textarea.scrollHeight,
      CHAT_TEXTAREA_MAX_HEIGHT
    );
    textarea.style.height = `${nextHeight}px`;
  }, []);

  useEffect(() => {
    resizeChatTextarea();
  }, [chatInput, resizeChatTextarea]);

  const handleAddAttachmentFiles = useCallback((fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    setChatError(null);

    setChatAttachments((prev) => {
      const remainingSlots = Math.max(MAX_IMAGE_COUNT - prev.length, 0);
      const acceptedFiles = files.slice(0, remainingSlots);
      const nextAttachments = [...prev];

      acceptedFiles.forEach((file) => {
        try {
          validateAttachmentFile(file);
          nextAttachments.push(createChatAttachment(file));
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
  }, []);

  const removeAttachment = useCallback((attachmentId) => {
    setChatAttachments((prev) => {
      const attachment = prev.find((item) => item.id === attachmentId);
      revokeChatAttachment(attachment);
      return prev.filter((item) => item.id !== attachmentId);
    });
  }, []);

  const focusChatComposer = useCallback(() => {
    requestAnimationFrame(() => {
      chatTextareaRef.current?.focus();
      resizeChatTextarea();
    });
  }, [resizeChatTextarea]);

  const copyChatText = useCallback(async (text) => {
    const resolvedText = typeof text === 'string' ? text.trim() : '';
    if (!resolvedText) return;

    try {
      if (!window.navigator?.clipboard?.writeText) {
        throw new Error('Clipboard unavailable');
      }

      await window.navigator.clipboard.writeText(resolvedText);
      setChatError(null);
    } catch {
      setChatError('Copy failed. Your browser blocked clipboard access.');
    }
  }, []);

  const toggleAiEntryExpansion = useCallback((entryKey) => {
    setExpandedAiEntryKeys((prev) => ({
      ...prev,
      [entryKey]: !prev[entryKey],
    }));
  }, []);

  const updateMessageById = useCallback((messageId, updater) => {
    setChatMessages((prev) =>
      prev.map((message) =>
        message.id === messageId ? (updater(message) ?? message) : message
      )
    );
  }, []);

  const loadComposerDraft = useCallback(
    ({ text = '', attachments = [] }) => {
      setChatInput(text);
      setChatError(null);
      setChatAttachments((prev) => {
        revokeChatAttachments(prev);
        return attachments.map((attachment) =>
          cloneChatAttachmentForDraft(attachment)
        );
      });
      focusChatComposer();
    },
    [focusChatComposer]
  );

  const handleEditUserMessage = useCallback(
    (message) => {
      loadComposerDraft({
        text: message?.text || '',
        attachments: message?.attachments || [],
      });
    },
    [loadComposerDraft]
  );

  const handleReuseUserAttachments = useCallback(
    (message) => {
      if (
        !Array.isArray(message?.attachments) ||
        message.attachments.length === 0
      )
        return;

      setChatError(null);
      setChatAttachments((prev) => {
        const remainingSlots = Math.max(MAX_IMAGE_COUNT - prev.length, 0);
        const cloned = message.attachments
          .slice(0, remainingSlots)
          .map((attachment) => cloneChatAttachmentForDraft(attachment));

        if (message.attachments.length > cloned.length) {
          setChatError(
            `You can attach up to ${MAX_IMAGE_COUNT} images per message.`
          );
        }

        return [...prev, ...cloned];
      });
      focusChatComposer();
    },
    [focusChatComposer]
  );

  const openAiEntryEditModal = useCallback(
    (messageId, entryIndex, entry) => {
      setEditingAiEntry({
        messageId,
        entryIndex,
        name: entry?.name || '',
        grams:
          entry?.grams == null || Number.isNaN(Number(entry.grams))
            ? ''
            : String(entry.grams),
        calories: String(entry?.calories ?? ''),
        protein: String(entry?.protein ?? ''),
        carbs: String(entry?.carbs ?? ''),
        fats: String(entry?.fats ?? ''),
        confidence: entry?.confidence ?? 'medium',
        rationale: entry?.rationale ?? '',
        assumptions: Array.isArray(entry?.assumptions)
          ? entry.assumptions.join('\n')
          : '',
      });
      openAiEntryEditor();
    },
    [openAiEntryEditor]
  );

  const handleAiEntryEditorChange = useCallback((field, value) => {
    setEditingAiEntry((prev) => (prev ? { ...prev, [field]: value } : prev));
  }, []);

  const saveEditedAiEntry = useCallback(() => {
    if (!editingAiEntry) return;

    const normalizedEntry = {
      name: editingAiEntry.name.trim(),
      grams:
        editingAiEntry.grams.trim() === ''
          ? null
          : Math.max(1, Math.round(Number(editingAiEntry.grams) || 0)),
      calories: Math.max(0, Math.round(Number(editingAiEntry.calories) || 0)),
      protein:
        Math.max(0, Math.round((Number(editingAiEntry.protein) || 0) * 10)) /
        10,
      carbs:
        Math.max(0, Math.round((Number(editingAiEntry.carbs) || 0) * 10)) / 10,
      fats:
        Math.max(0, Math.round((Number(editingAiEntry.fats) || 0) * 10)) / 10,
      confidence: editingAiEntry.confidence || 'medium',
      rationale: editingAiEntry.rationale.trim() || null,
      assumptions: editingAiEntry.assumptions
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 6),
    };

    if (!normalizedEntry.name) {
      setChatError('Entry name is required.');
      return;
    }

    updateMessageById(editingAiEntry.messageId, (message) => {
      if (!message?.foodParser?.entries?.[editingAiEntry.entryIndex]) {
        return message;
      }

      const nextEntries = message.foodParser.entries.map((entry, index) =>
        index === editingAiEntry.entryIndex ? normalizedEntry : entry
      );

      return {
        ...message,
        foodParser: {
          ...message.foodParser,
          entries: nextEntries,
        },
      };
    });

    setChatError(null);
    requestAiEntryEditorClose();
  }, [editingAiEntry, requestAiEntryEditorClose, updateMessageById]);

  const submitChatRequest = useCallback(
    async ({
      text,
      attachments,
      userMessageId = null,
      beforeMessageId = null,
      assistantPlaceholderId = null,
    }) => {
      if (isSendingChat) return;

      if (!isOnline) {
        setChatError(
          'You are offline. Connect to the internet to use AI chat.'
        );
        return;
      }

      const trimmedText = typeof text === 'string' ? text.trim() : '';
      if (!trimmedText && attachments.length === 0) {
        setChatError('Type a message or attach at least one image.');
        return;
      }

      setChatError(null);
      setIsSendingChat(true);
      setActiveChatRequest({
        userMessageId,
        assistantPlaceholderId,
      });

      const controller = new window.AbortController();
      chatAbortControllerRef.current = controller;

      try {
        const history = buildStructuredChatHistory(chatMessages, {
          beforeMessageId,
        });

        const result = await sendGeminiMessage({
          message: trimmedText,
          files: attachments.map((attachment) => attachment.file),
          history,
          signal: controller.signal,
        });

        if (userMessageId) {
          updateMessageById(userMessageId, (message) => ({
            ...message,
            status: 'sent',
            error: null,
          }));
        }

        const assistantMessage = createAssistantChatMessage({
          id: assistantPlaceholderId || `assistant-${Date.now()}`,
          text: result.text,
          foodParser: result.foodParser ?? null,
          status: 'sent',
          replyToUserMessageId: userMessageId,
        });

        setChatMessages((prev) => {
          if (assistantPlaceholderId) {
            return prev.map((message) =>
              message.id === assistantPlaceholderId ? assistantMessage : message
            );
          }

          return [...prev.slice(-CHAT_HISTORY_MESSAGE_LIMIT), assistantMessage];
        });
      } catch (error) {
        const message =
          error instanceof GeminiError
            ? error.message
            : 'Failed to get AI response. Please try again.';

        if (assistantPlaceholderId) {
          updateMessageById(assistantPlaceholderId, (assistantMessage) => ({
            ...assistantMessage,
            status: 'error',
            error: message,
          }));
        } else if (userMessageId) {
          updateMessageById(userMessageId, (userMessage) => ({
            ...userMessage,
            status: 'error',
            error: message,
          }));
        } else {
          setChatError(message);
        }
      } finally {
        setIsSendingChat(false);
        setActiveChatRequest(null);
        chatAbortControllerRef.current = null;
      }
    },
    [chatMessages, isOnline, isSendingChat, updateMessageById]
  );

  const sendChat = useCallback(async () => {
    if (isSendingChat) return;

    const currentText = chatInput;
    const currentAttachments = [...chatAttachments];
    const trimmedText = currentText.trim();

    if (!trimmedText && currentAttachments.length === 0) {
      setChatError('Type a message or attach at least one image.');
      return;
    }

    const userMessageId = `user-${Date.now()}`;
    const userMessage = createUserChatMessage({
      id: userMessageId,
      text: currentText,
      attachments: currentAttachments,
      status: 'sending',
    });

    setChatMessages((prev) => [
      ...prev.slice(-CHAT_HISTORY_MESSAGE_LIMIT),
      userMessage,
    ]);
    setChatInput('');
    setChatAttachments([]);
    setChatError(null);

    await submitChatRequest({
      text: currentText,
      attachments: currentAttachments,
      userMessageId,
    });
  }, [chatAttachments, chatInput, isSendingChat, submitChatRequest]);

  const retryUserMessage = useCallback(
    async (message, { asDraft = false } = {}) => {
      if (!message) return;

      if (asDraft) {
        loadComposerDraft({
          text: message.text || '',
          attachments: message.attachments || [],
        });
        return;
      }

      updateMessageById(message.id, (current) => ({
        ...current,
        status: 'sending',
        error: null,
      }));

      await submitChatRequest({
        text: message.text || '',
        attachments: message.attachments || [],
        userMessageId: message.id,
      });
    },
    [loadComposerDraft, submitChatRequest, updateMessageById]
  );

  const regenerateAssistantReply = useCallback(
    async (assistantMessage) => {
      if (!assistantMessage?.replyToUserMessageId || isSendingChat) return;

      const sourceUserMessage = chatMessages.find(
        (message) => message.id === assistantMessage.replyToUserMessageId
      );
      if (!sourceUserMessage) return;

      const placeholderId = `assistant-${Date.now()}`;
      const placeholderMessage = createAssistantChatMessage({
        id: placeholderId,
        text: '',
        status: 'sending',
        replyToUserMessageId: sourceUserMessage.id,
      });

      setChatMessages((prev) => [
        ...prev.slice(-CHAT_HISTORY_MESSAGE_LIMIT),
        placeholderMessage,
      ]);

      await submitChatRequest({
        text: sourceUserMessage.text || '',
        attachments: sourceUserMessage.attachments || [],
        beforeMessageId: sourceUserMessage.id,
        assistantPlaceholderId: placeholderId,
        userMessageId: sourceUserMessage.id,
      });
    },
    [chatMessages, isSendingChat, submitChatRequest]
  );

  const answerClarification = useCallback(
    (message) => {
      const question = message?.foodParser?.followUpQuestion?.trim() || '';
      if (question) {
        setChatInput(question);
        focusChatComposer();
      }
    },
    [focusChatComposer]
  );

  const stopChatRequest = useCallback(() => {
    chatAbortControllerRef.current?.abort();
  }, []);

  const handleChatInputPaste = useCallback(
    (event) => {
      const clipboardData = event.clipboardData;
      const imageFiles = Array.from(clipboardData?.items || [])
        .filter(
          (item) => item.kind === 'file' && item.type.startsWith('image/')
        )
        .map((item) => item.getAsFile())
        .filter(Boolean);

      if (imageFiles.length === 0) {
        return;
      }

      event.preventDefault();

      const pastedText = clipboardData?.getData('text/plain') || '';
      if (pastedText) {
        const textarea = chatTextareaRef.current;
        const start = textarea?.selectionStart ?? chatInput.length;
        const end = textarea?.selectionEnd ?? chatInput.length;

        setChatInput((prev) => {
          const nextValue = `${prev.slice(0, start)}${pastedText}${prev.slice(end)}`;
          requestAnimationFrame(() => {
            if (textarea) {
              const cursor = start + pastedText.length;
              textarea.selectionStart = cursor;
              textarea.selectionEnd = cursor;
            }
          });
          return nextValue;
        });
      }

      handleAddAttachmentFiles(imageFiles);
    },
    [chatInput.length, handleAddAttachmentFiles]
  );

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
                  onClick={handleBarcodeScanClick}
                  aria-label="Barcode Scan"
                  disabled={isBarcodeScanning || isBarcodeLookupPending}
                  className="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-primary md:hover:brightness-110 text-primary-foreground rounded-full text-sm font-semibold transition-all shadow-md whitespace-nowrap press-feedback focus-ring border border-transparent disabled:opacity-60 disabled:cursor-not-allowed"
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

        <AnimatePresence>
          {activeBarcodeStatusToastMessage ? (
            <motion.div
              key={`barcode-status-${activeBarcodeStatusToastMessage}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
              className="fixed inset-x-0 z-[1300] flex justify-center pointer-events-none px-4"
              style={{ bottom: 'calc(var(--sab) + 1.5rem)' }}
              role="status"
              aria-live="polite"
            >
              <div className="max-w-sm w-full rounded-xl border border-accent-blue/30 bg-surface/95 px-3 py-2.5 shadow-xl backdrop-blur-sm flex items-center gap-2 text-sm text-foreground">
                <div className="w-4 h-4 border-2 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin-fast flex-shrink-0" />
                <span className="leading-tight">
                  {activeBarcodeStatusToastMessage}
                </span>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {barcodeToast && !activeBarcodeStatusToastMessage ? (
            <motion.div
              key={barcodeToast.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
              className="fixed inset-x-0 z-[1300] flex justify-center pointer-events-none px-4"
              style={{ bottom: 'calc(var(--sab) + 1.5rem)' }}
              role="status"
              aria-live="polite"
            >
              <div
                className={`max-w-sm w-full rounded-xl border px-3 py-2.5 shadow-xl backdrop-blur-sm flex items-center gap-2 text-sm leading-tight ${
                  barcodeToast.tone === 'error'
                    ? 'border-accent-red/35 bg-accent-red/10 text-accent-red'
                    : 'border-accent-blue/30 bg-surface/95 text-foreground'
                }`}
              >
                {barcodeToast.tone === 'error' ? (
                  <AlertCircle size={15} className="flex-shrink-0" />
                ) : (
                  <ScanBarcode size={15} className="flex-shrink-0" />
                )}
                <span>{barcodeToast.message}</span>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {viewMode === 'chat' && (
          <FoodSearchChatPanel
            isOnline={isOnline}
            chatMessages={chatMessages}
            chatAttachments={chatAttachments}
            chatError={chatError}
            isSendingChat={isSendingChat}
            activeChatRequest={activeChatRequest}
            chatScrollRef={chatScrollRef}
            fileInputRef={fileInputRef}
            cameraInputRef={cameraInputRef}
            chatTextareaRef={chatTextareaRef}
            chatInput={chatInput}
            setChatInput={setChatInput}
            answerClarification={answerClarification}
            expandedAiEntryKeys={expandedAiEntryKeys}
            toggleAiEntryExpansion={toggleAiEntryExpansion}
            openAiEntryEditModal={openAiEntryEditModal}
            handleLogAiEntry={handleLogAiEntry}
            handleSaveAiFavourite={handleSaveAiFavourite}
            handleLogAllAiEntries={handleLogAllAiEntries}
            copyChatText={copyChatText}
            handleEditUserMessage={handleEditUserMessage}
            handleReuseUserAttachments={handleReuseUserAttachments}
            retryUserMessage={retryUserMessage}
            regenerateAssistantReply={regenerateAssistantReply}
            removeAttachment={removeAttachment}
            stopChatRequest={stopChatRequest}
            handleChatInputKeyDown={handleChatInputKeyDown}
            handleChatInputPaste={handleChatInputPaste}
            sendChat={sendChat}
            handleAddAttachmentFiles={handleAddAttachmentFiles}
          />
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

        <FoodSearchFilterControls
          viewMode={viewMode}
          searchMode={searchMode}
          displayResults={displayResults}
          sortedFavourites={sortedFavourites}
          favouritesSearchQuery={favouritesSearchQuery}
          resolvedFavourites={resolvedFavourites}
          isSearching={isSearching}
          isLocalSearching={isLocalSearching}
          resolvedCachedFoods={resolvedCachedFoods}
          favouritesDropdownRef={favouritesDropdownRef}
          dropdownRef={dropdownRef}
          isFavouritesFilterOpen={isFavouritesFilterOpen}
          setIsFavouritesFilterOpen={setIsFavouritesFilterOpen}
          hasActiveFavouritesFilters={hasActiveFavouritesFilters}
          clearFavouritesFilters={clearFavouritesFilters}
          favouritesSortBy={favouritesSortBy}
          setFavouritesSortBy={setFavouritesSortBy}
          favouritesSortOrder={favouritesSortOrder}
          setFavouritesSortOrder={setFavouritesSortOrder}
          getFavouritesSortLabel={getFavouritesSortLabel}
          isFilterOpen={isFilterOpen}
          setIsFilterOpen={setIsFilterOpen}
          hasActiveFilters={hasActiveFilters}
          clearFilters={clearFilters}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
          selectedSubcategory={selectedSubcategory}
          setSelectedSubcategory={setSelectedSubcategory}
          categoryOptions={categoryOptions}
          availableSubcategories={availableSubcategories}
          sortBy={sortBy}
          setSortBy={setSortBy}
          sortOrder={sortOrder}
          setSortOrder={setSortOrder}
          getFilterActiveClass={getFilterActiveClass}
          getSortLabel={getSortLabel}
        />

        {/* Search Results */}
        {viewMode !== 'chat' && (
          <div className="flex-1 min-h-0 px-4 py-4 relative">
            <div className="h-full overflow-y-auto overflow-x-hidden touch-action-pan-y space-y-2">
              {viewMode === 'favourites' ? (
                <FoodSearchFavouritesPanel
                  sortedFavourites={sortedFavourites}
                  hasFavourites={hasFavourites}
                  handleFavouriteCardClick={handleFavouriteCardClick}
                  handleFavouriteEdit={handleFavouriteEdit}
                  onDeleteFavourite={onDeleteFavourite}
                  setPendingDeleteId={setPendingDeleteId}
                  openDeleteConfirm={openDeleteConfirm}
                />
              ) : (
                <FoodSearchResultsPanel
                  searchMode={searchMode}
                  searchError={searchError}
                  localSearchError={localSearchError}
                  isLocalSearching={isLocalSearching}
                  isSearching={isSearching}
                  displayResults={displayResults}
                  searchQuery={searchQuery}
                  onlineResults={onlineResults}
                  loadingFoodId={loadingFoodId}
                  handleOnlineFoodSelect={handleOnlineFoodSelect}
                  resolvedPinnedFoods={resolvedPinnedFoods}
                  longPressingId={longPressingId}
                  handleFoodClick={handleFoodClick}
                  handlePressStart={handlePressStart}
                  handlePressEnd={handlePressEnd}
                  performOnlineSearch={performOnlineSearch}
                />
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

      <BarcodeEntryModal
        isOpen={isBarcodeEntryOpen}
        isClosing={isBarcodeEntryClosing}
        value={manualBarcodeInput}
        isSubmitting={isBarcodeLookupPending}
        onValueChange={(value) => {
          setManualBarcodeInput(value.replace(/[^\d]/g, ''));
          clearBarcodeToast();
        }}
        onSubmit={handleManualBarcodeSubmit}
        onClose={requestBarcodeEntryClose}
      />

      <ModalShell
        isOpen={isAiEntryEditorOpen}
        isClosing={isAiEntryEditorClosing}
        onClose={requestAiEntryEditorClose}
        contentClassName="w-full md:max-w-md p-5"
      >
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              Edit AI Entry
            </h3>
            <p className="text-xs text-muted mt-1">
              Adjust the estimate before logging or saving it.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">
                Name
              </label>
              <input
                type="text"
                value={editingAiEntry?.name ?? ''}
                onChange={(event) =>
                  handleAiEntryEditorChange('name', event.target.value)
                }
                className="w-full bg-surface-highlight border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent-blue"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted mb-1">
                  Grams
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={editingAiEntry?.grams ?? ''}
                  onChange={(event) =>
                    handleAiEntryEditorChange('grams', event.target.value)
                  }
                  className="w-full bg-surface-highlight border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent-blue"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">
                  Calories
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={editingAiEntry?.calories ?? ''}
                  onChange={(event) =>
                    handleAiEntryEditorChange('calories', event.target.value)
                  }
                  className="w-full bg-surface-highlight border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent-blue"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">
                  Protein
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={editingAiEntry?.protein ?? ''}
                  onChange={(event) =>
                    handleAiEntryEditorChange('protein', event.target.value)
                  }
                  className="w-full bg-surface-highlight border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent-blue"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">
                  Carbs
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={editingAiEntry?.carbs ?? ''}
                  onChange={(event) =>
                    handleAiEntryEditorChange('carbs', event.target.value)
                  }
                  className="w-full bg-surface-highlight border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent-blue"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">
                  Fats
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={editingAiEntry?.fats ?? ''}
                  onChange={(event) =>
                    handleAiEntryEditorChange('fats', event.target.value)
                  }
                  className="w-full bg-surface-highlight border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent-blue"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted mb-1">
                Rationale
              </label>
              <textarea
                rows={3}
                value={editingAiEntry?.rationale ?? ''}
                onChange={(event) =>
                  handleAiEntryEditorChange('rationale', event.target.value)
                }
                className="w-full resize-none bg-surface-highlight border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent-blue"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted mb-1">
                Assumptions
              </label>
              <textarea
                rows={4}
                value={editingAiEntry?.assumptions ?? ''}
                onChange={(event) =>
                  handleAiEntryEditorChange('assumptions', event.target.value)
                }
                placeholder="One assumption per line"
                className="w-full resize-none bg-surface-highlight border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent-blue"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={requestAiEntryEditorClose}
              className="flex-1 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground md:hover:bg-surface-highlight press-feedback focus-ring"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveEditedAiEntry}
              className="flex-1 rounded-lg bg-accent-blue px-4 py-2 text-sm font-semibold text-primary-foreground md:hover:brightness-110 press-feedback focus-ring"
            >
              Save
            </button>
          </div>
        </div>
      </ModalShell>
    </ModalShell>
  );
};
