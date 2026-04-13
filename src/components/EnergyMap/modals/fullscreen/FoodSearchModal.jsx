import React, {
  useState,
  useReducer,
  useMemo,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
} from 'react';
import {
  Star,
  ScanBarcode,
  Search,
  ChevronLeft,
  ChevronDown,
  Edit3,
  X,
  Plus,
  WifiOff,
  Database,
  Globe,
  AlertCircle,
  CloudOff,
  Sparkles,
  Utensils,
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
import { FoodSearchMealPreviewPanel } from './panels/FoodSearchMealPreviewPanel';
import { FOOD_CATEGORIES } from '../../../../constants/food/foodDatabase';
import {
  MEAL_TYPE_ORDER,
  getMealTypeById,
} from '../../../../constants/meal/mealTypes';
import { useNetworkStatus } from '../../../../hooks/useNetworkStatus';
import { useEnergyMapStore } from '../../../../store/useEnergyMapStore';
import { addToFoodCache, trimFoodCache } from '../../../../services/foodCache';
import { mergePresentationEntriesWithVerified } from '../../../../utils/food/aiPresentationMerge';
import {
  searchBarcode as searchOpenFoodFactsBarcode,
  OpenFoodFactsError,
} from '../../../../services/openFoodFacts';
import {
  dedupeExtractedFoodEntries,
  FOOD_SEARCH_SOURCE,
  getFoodSearchSourceLabel,
  resetAiLookupSessionCache,
  resolveAiFoodEntry,
  searchFoodsLocal,
  searchFoodsOnline,
  resolveAiFoodLookup,
} from '../../../../services/foodSearch';
import {
  normalizeAiLookupResult,
  resolveFoodLookupContext,
} from '../../../../services/foodLookupContext';
import {
  BarcodeScannerError,
  canUseNativeBarcodeScanner,
  scanNativeBarcode,
} from '../../../../services/barcodeScanner';
import {
  recordRagExtractionOutcome,
  recordRagImplicitFeedback,
  recordRagLookupStats,
  recordRagPresentationNameDrift,
  recordRagStageLatency,
} from '../../../../services/ragTelemetry';

const CHAT_HISTORY_MESSAGE_LIMIT = 48;
const CHAT_TEXTAREA_MAX_HEIGHT = 112;
const DEFAULT_CHAT_PLACEHOLDER = 'Describe food + portion...';
const DEFAULT_MAX_IMAGE_COUNT = 3;
const LOCAL_RESULT_BATCH_SIZE = 120;
const ONLINE_RESULT_BATCH_SIZE = 80;
const LOCAL_DB_QUERY_PAGE_SIZE = 500;
const CHAT_REQUEST_STAGE = {
  EXTRACTION: 'extraction',
  RETRIEVAL: 'retrieval',
  VERIFICATION: 'verification',
  PRESENTATION: 'presentation',
  PROCESSING: 'processing',
};
const FOOD_SEARCH_DEFAULT_ENTRY_SET = new Set([
  'search_local',
  'search_online',
  'favourites',
  'chat',
  'manual_entry',
  'barcode',
]);
const AI_CATEGORY_KEYS = new Set([
  'protein',
  'carbs',
  'vegetables',
  'fats',
  'supplements',
  'custom',
  'manual',
]);

const normalizeSearchText = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const scoreLocalNameRelevance = (query, food) => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return 0;
  }

  const normalizedName = normalizeSearchText(food?.name);
  const normalizedBrand = normalizeSearchText(food?.brand);
  const normalizedCategory = normalizeSearchText(food?.category);

  if (!normalizedName && !normalizedBrand && !normalizedCategory) {
    return 0;
  }

  if (normalizedName === normalizedQuery) return 1000;
  if (normalizedName.startsWith(normalizedQuery)) return 700;
  if (` ${normalizedName} `.includes(` ${normalizedQuery} `)) return 450;
  if (normalizedName.includes(normalizedQuery)) return 250;

  if (normalizedBrand === normalizedQuery) return 140;
  if (normalizedBrand.includes(normalizedQuery)) return 80;
  if (normalizedCategory === normalizedQuery) return 40;
  if (normalizedCategory.includes(normalizedQuery)) return 20;

  return 0;
};

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

const buildRollingFoodContextSummary = (messages, options = {}) => {
  const { beforeMessageId = null, maxEntries = 8 } = options;
  const contextItems = [];

  for (const message of Array.isArray(messages) ? messages : []) {
    if (beforeMessageId && message.id === beforeMessageId) {
      break;
    }

    if (
      message?.role !== 'assistant' ||
      message?.status !== 'sent' ||
      message?.foodParser?.messageType !== 'food_entries' ||
      !Array.isArray(message?.foodParser?.entries)
    ) {
      continue;
    }

    message.foodParser.entries.forEach((entry) => {
      const name = String(entry?.name || '').trim();
      if (!name) {
        return;
      }

      const grams = Number(entry?.grams);
      const calories = Number(entry?.calories);
      const gramsLabel =
        Number.isFinite(grams) && grams > 0 ? `${Math.round(grams)}g` : null;
      const caloriesLabel =
        Number.isFinite(calories) && calories > 0
          ? `${Math.round(calories)} kcal`
          : null;

      contextItems.push(
        `${name}${gramsLabel ? ` (${gramsLabel}${caloriesLabel ? `, ${caloriesLabel}` : ''})` : caloriesLabel ? ` (${caloriesLabel})` : ''}`
      );
    });
  }

  const recentItems = contextItems.slice(-Math.max(1, maxEntries));
  if (recentItems.length === 0) {
    return '';
  }

  return recentItems.map((item, index) => `${index + 1}. ${item}`).join('\n');
};

const createChatRequestId = () =>
  `chat-req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeFoodSearchDefaultEntry = (value) => {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();

  return FOOD_SEARCH_DEFAULT_ENTRY_SET.has(normalized)
    ? normalized
    : 'search_local';
};

const getNowMs = () => {
  if (typeof window !== 'undefined' && window.performance?.now) {
    return window.performance.now();
  }

  return Date.now();
};

let foodCatalogModulePromise = null;
const loadFoodCatalogModule = async () => {
  if (!foodCatalogModulePromise) {
    foodCatalogModulePromise = import('../../../../services/foodCatalog');
  }
  return foodCatalogModulePromise;
};

let geminiModulePromise = null;
const loadGeminiModule = async () => {
  if (!geminiModulePromise) {
    geminiModulePromise = import('../../../../services/gemini');
  }
  return geminiModulePromise;
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
  selectedMealType = '',
  mealNutritionEntries = [],
  onSwitchMealType,
  onEditMealEntry,
  onDeleteMealEntry,
}) => {
  const {
    foodFavourites,
    pinnedFoods: storePinnedFoods,
    cachedFoods: storeCachedFoods,
    foodSearchDefaultEntry,
    togglePinnedFood,
    updateCachedFoods,
  } = useEnergyMapStore(
    (state) => ({
      foodFavourites: state.foodFavourites,
      pinnedFoods: state.pinnedFoods,
      cachedFoods: state.cachedFoods,
      foodSearchDefaultEntry: state.userData?.foodSearchDefaultEntry,
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
  const resolvedFoodSearchDefaultEntry = normalizeFoodSearchDefaultEntry(
    foodSearchDefaultEntry
  );
  const [isAiChatRagEnabled, setIsAiChatRagEnabled] = useState(false);
  const [maxImageCount, setMaxImageCount] = useState(DEFAULT_MAX_IMAGE_COUNT);
  const fetchLocalSubcategories = useCallback(async (category) => {
    const { getDistinctSubcategories } = await loadFoodCatalogModule();
    return getDistinctSubcategories(category);
  }, []);
  const fetchLocalFoodById = useCallback(async (foodId) => {
    const { getFoodById } = await loadFoodCatalogModule();
    return getFoodById(foodId);
  }, []);
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
  const mealTypeDropdownRef = useRef(null);
  const [longPressingId, setLongPressingId] = useState(null);
  const [isMealTypeMenuOpen, setIsMealTypeMenuOpen] = useState(false);
  const [isMealPreviewOpen, setIsMealPreviewOpen] = useState(false);
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
  const [activeSearchSource, setActiveSearchSource] = useState(
    FOOD_SEARCH_SOURCE.LOCAL
  );
  const [searchFallbackUsed, setSearchFallbackUsed] = useState(false);
  const [, setSearchErrorsBySource] = useState({});
  const [loadingFoodId, setLoadingFoodId] = useState(null);
  const [localDbResults, setLocalDbResults] = useState([]);
  const [isLocalSearching, setIsLocalSearching] = useState(false);
  const [isLocalLoadingMore, setIsLocalLoadingMore] = useState(false);
  const [localSearchError, setLocalSearchError] = useState(null);
  const [localDbOffset, setLocalDbOffset] = useState(0);
  const [hasMoreLocalDbResults, setHasMoreLocalDbResults] = useState(false);
  const [localSubcategories, setLocalSubcategories] = useState([]);
  const [favouriteFoodLookup, setFavouriteFoodLookup] = useState({});
  const [manualBarcodeInput, setManualBarcodeInput] = useState('');
  const [isBarcodeScanning, setIsBarcodeScanning] = useState(false);
  const [isBarcodeLookupPending, setIsBarcodeLookupPending] = useState(false);
  const [visibleResultCount, setVisibleResultCount] = useState(
    LOCAL_RESULT_BATCH_SIZE
  );
  const [barcodeToast, setBarcodeToast] = useState(null);
  const barcodeToastTimerRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const abortControllerRef = useRef(null);
  const hasAppliedDefaultEntryRef = useRef(false);

  // Network status
  const { isOnline } = useNetworkStatus();

  // Scroll/fade overlays for action buttons
  const actionScrollRef = useRef(null);

  // AI chat state
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatPlaceholder, setChatPlaceholder] = useState(
    DEFAULT_CHAT_PLACEHOLDER
  );
  const [chatAttachments, setChatAttachments] = useState([]);
  const [chatAttachmentErrors, setChatAttachmentErrors] = useState([]);
  const [chatError, setChatError] = useState(null);
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [chatStatusNowMs, setChatStatusNowMs] = useState(() => Date.now());
  const [queuedChatMessageIds, setQueuedChatMessageIds] = useState([]);
  const [activeChatRequest, setActiveChatRequest] = useState(null);
  const [expandedAiEntryKeys, setExpandedAiEntryKeys] = useState({});
  const [aiEntryLookupByKey, setAiEntryLookupByKey] = useState({});
  const [loggedAiEntryKeys, setLoggedAiEntryKeys] = useState({});
  const [favouritedAiEntryKeys, setFavouritedAiEntryKeys] = useState({});
  const aiEntryLookupRequestsRef = useRef(new Map());
  const chatAbortControllerRef = useRef(null);
  const chatScrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const chatTextareaRef = useRef(null);
  const latestChatAttachmentsRef = useRef([]);
  const latestChatMessagesRef = useRef([]);
  const localSearchRequestIdRef = useRef(0);
  const recordedFeedbackEventsRef = useRef(new Set());
  const queuedReplayInFlightRef = useRef(false);
  const previousViewModeRef = useRef(viewMode);

  // Close dropdown when clicking outside
  useEffect(() => {
    let cancelled = false;

    const resolveAiChatFeatureFlag = async () => {
      try {
        const { AI_CHAT_RAG_ENABLED } = await loadGeminiModule();
        if (!cancelled) {
          setIsAiChatRagEnabled(Boolean(AI_CHAT_RAG_ENABLED));
        }
      } catch {
        if (!cancelled) {
          setIsAiChatRagEnabled(false);
        }
      }
    };

    void resolveAiChatFeatureFlag();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const resolveMaxImageCount = async () => {
      try {
        const { MAX_IMAGE_COUNT } = await loadGeminiModule();
        if (!cancelled && Number.isFinite(MAX_IMAGE_COUNT)) {
          setMaxImageCount(Math.max(1, Math.round(MAX_IMAGE_COUNT)));
        }
      } catch {
        if (!cancelled) {
          setMaxImageCount(DEFAULT_MAX_IMAGE_COUNT);
        }
      }
    };

    void resolveMaxImageCount();

    return () => {
      cancelled = true;
    };
  }, []);

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
      if (
        mealTypeDropdownRef.current &&
        !mealTypeDropdownRef.current.contains(event.target)
      ) {
        setIsMealTypeMenuOpen(false);
      }
    };

    if (isFilterOpen || isFavouritesFilterOpen || isMealTypeMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isFilterOpen, isFavouritesFilterOpen, isMealTypeMenuOpen]);

  // Reset state when modal closes
  useEffect(() => {
    if (isClosing) {
      // Clear online search state on close
      setOnlineResults([]);
      setSearchError(null);
      setSearchFallbackUsed(false);
      setSearchErrorsBySource({});
      setActiveSearchSource(FOOD_SEARCH_SOURCE.LOCAL);
      setLocalDbResults([]);
      setLocalSearchError(null);
      setIsSearching(false);
      setIsLocalSearching(false);
      setIsLocalLoadingMore(false);
      setLoadingFoodId(null);
      setLocalDbOffset(0);
      setHasMoreLocalDbResults(false);
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
      setChatPlaceholder(DEFAULT_CHAT_PLACEHOLDER);
      setChatAttachmentErrors([]);
      setExpandedAiEntryKeys({});
      setAiEntryLookupByKey({});
      setLoggedAiEntryKeys({});
      setFavouritedAiEntryKeys({});
      setChatError(null);
      setIsSendingChat(false);
      setQueuedChatMessageIds([]);
      setActiveChatRequest(null);
      setIsBarcodeScanning(false);
      setIsBarcodeLookupPending(false);
      setManualBarcodeInput('');
      setBarcodeToast(null);
      setIsMealTypeMenuOpen(false);
      setIsMealPreviewOpen(false);
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
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (chatAbortControllerRef.current) {
        chatAbortControllerRef.current.abort();
      }
      resetAiLookupSessionCache();
      recordedFeedbackEventsRef.current.clear();
      aiEntryLookupRequestsRef.current.clear();
    }
  }, [
    chatAttachments,
    forceDeleteConfirmClose,
    forceManualAddConfirmClose,
    forceAddCustomFoodClose,
    forceBarcodeEntryClose,
    isClosing,
    chatMessages,
  ]);

  // Clear online results when switching modes
  useEffect(() => {
    setOnlineResults([]);
    setSearchError(null);
    setSearchFallbackUsed(false);
    setSearchErrorsBySource({});
    setActiveSearchSource(
      searchMode === 'online'
        ? FOOD_SEARCH_SOURCE.USDA
        : FOOD_SEARCH_SOURCE.LOCAL
    );
    setLocalSearchError(null);
    dispatchUiState({ type: 'set', key: 'selectedCategory', value: null });
    dispatchUiState({ type: 'set', key: 'selectedSubcategory', value: null });
    dispatchUiState({ type: 'set', key: 'isFilterOpen', value: false });
    dispatchUiState({ type: 'set', key: 'viewMode', value: 'search' });
  }, [searchMode]);

  useEffect(() => {
    if (!isSendingChat) {
      return undefined;
    }

    const timerId = window.setInterval(() => {
      setChatStatusNowMs(Date.now());
    }, 250);

    return () => {
      window.clearInterval(timerId);
    };
  }, [isSendingChat]);

  useEffect(() => {
    const previousViewMode = previousViewModeRef.current;
    if (previousViewMode === 'chat' && viewMode !== 'chat') {
      resetAiLookupSessionCache();
      aiEntryLookupRequestsRef.current.clear();
    }

    previousViewModeRef.current = viewMode;
  }, [viewMode]);

  const resolveSourceSearchError = useCallback((errorsBySource) => {
    const usdaMessage = errorsBySource?.[FOOD_SEARCH_SOURCE.USDA];

    return usdaMessage || null;
  }, []);

  const mergeUniqueFoodsById = useCallback((baseRows, extraRows) => {
    const mergedMap = new Map();

    (Array.isArray(baseRows) ? baseRows : []).forEach((food) => {
      if (!food?.id) return;
      mergedMap.set(food.id, food);
    });

    (Array.isArray(extraRows) ? extraRows : []).forEach((food) => {
      if (!food?.id || mergedMap.has(food.id)) return;
      mergedMap.set(food.id, food);
    });

    return Array.from(mergedMap.values());
  }, []);

  const runLocalSearch = useCallback(
    async ({ append, offset }) => {
      const requestId = localSearchRequestIdRef.current + 1;
      localSearchRequestIdRef.current = requestId;

      if (append) {
        setIsLocalLoadingMore(true);
      } else {
        setIsLocalSearching(true);
      }

      setLocalSearchError(null);
      setSearchError(null);

      try {
        const result = await searchFoodsLocal({
          query: searchQuery,
          category: selectedCategory,
          subcategory: selectedSubcategory,
          sortBy,
          sortOrder,
          limit: LOCAL_DB_QUERY_PAGE_SIZE,
          offset,
          pinnedFoodIds: resolvedPinnedFoods,
        });

        if (requestId !== localSearchRequestIdRef.current) {
          return;
        }

        const safeResults = Array.isArray(result?.results)
          ? result.results
          : [];

        setActiveSearchSource(FOOD_SEARCH_SOURCE.LOCAL);
        setSearchFallbackUsed(false);
        setSearchErrorsBySource({});
        setOnlineResults([]);

        setLocalDbResults((previousRows) =>
          append ? mergeUniqueFoodsById(previousRows, safeResults) : safeResults
        );
        setLocalDbOffset(
          Number(result?.nextOffset) || offset + safeResults.length
        );
        setHasMoreLocalDbResults(Boolean(result?.hasMoreLocal));
      } catch (error) {
        if (requestId !== localSearchRequestIdRef.current) {
          return;
        }

        console.error('Local food search error:', error);
        if (!append) {
          setLocalDbResults([]);
          setOnlineResults([]);
        }
        setLocalSearchError('Local database search failed.');
        setHasMoreLocalDbResults(false);
      } finally {
        if (requestId === localSearchRequestIdRef.current) {
          if (append) {
            setIsLocalLoadingMore(false);
          } else {
            setIsLocalSearching(false);
          }
        }
      }
    },
    [
      mergeUniqueFoodsById,
      resolvedPinnedFoods,
      searchQuery,
      selectedCategory,
      selectedSubcategory,
      sortBy,
      sortOrder,
    ]
  );

  useEffect(() => {
    if (!isOpen || searchMode !== 'local' || viewMode !== 'search') {
      return;
    }

    setLocalDbOffset(0);
    setHasMoreLocalDbResults(false);
    runLocalSearch({ append: false, offset: 0 });
  }, [isOpen, runLocalSearch, searchMode, viewMode]);

  useEffect(() => {
    const batchSize =
      searchMode === 'online'
        ? ONLINE_RESULT_BATCH_SIZE
        : LOCAL_RESULT_BATCH_SIZE;
    setVisibleResultCount(batchSize);
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

    fetchLocalSubcategories(selectedCategory)
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
  }, [fetchLocalSubcategories, searchMode, selectedCategory]);

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
        await fetchLocalFoodById(foodId),
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
  }, [fetchLocalFoodById, resolvedFavourites]);

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
  const performOnlineSearch = useCallback(
    async (query) => {
      if (!query || query.trim().length < 2) {
        setOnlineResults([]);
        setIsSearching(false);
        setSearchFallbackUsed(false);
        setSearchErrorsBySource({});
        setActiveSearchSource(FOOD_SEARCH_SOURCE.USDA);
        return;
      }

      if (!isOnline) {
        setOnlineResults([]);
        setSearchError('You are offline. Connect to search online foods.');
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      setSearchError(null);
      try {
        const result = await searchFoodsOnline({
          query,
        });

        const safeResults = Array.isArray(result?.results)
          ? result.results
          : [];

        setOnlineResults(safeResults);
        setActiveSearchSource(result?.source || FOOD_SEARCH_SOURCE.USDA);
        setSearchFallbackUsed(Boolean(result?.fallbackUsed));
        setSearchErrorsBySource(result?.errorsBySource || {});
        setSearchError(resolveSourceSearchError(result?.errorsBySource));
      } catch (error) {
        console.error('Online search error:', error);
        setSearchError(error?.message || 'Search failed. Please try again.');
        setOnlineResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [isOnline, resolveSourceSearchError]
  );

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
      setSearchError(null);
      setSearchFallbackUsed(false);
      setSearchErrorsBySource({});
      setActiveSearchSource(FOOD_SEARCH_SOURCE.USDA);
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

  // Handle selecting an online food (cache and select)
  const handleOnlineFoodSelect = async (previewFood) => {
    setLoadingFoodId(previewFood.id);
    setSearchError(null);

    try {
      const fullFood = previewFood;

      if (resolvedUpdateCachedFoods) {
        const updatedCache = addToFoodCache(resolvedCachedFoods, fullFood);
        const trimmedCache = trimFoodCache(updatedCache, 200);
        resolvedUpdateCachedFoods(trimmedCache);
      }

      // Pass to parent
      onSelectFood?.(fullFood);
    } catch (error) {
      console.error('Failed to fetch food details:', error);
      setSearchError(error?.message || 'Failed to load food details');
    } finally {
      setLoadingFoodId(null);
    }
  };

  const resolveBarcodeErrorMessage = useCallback((error) => {
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

  useLayoutEffect(() => {
    if (!isOpen) {
      hasAppliedDefaultEntryRef.current = false;
      return;
    }

    if (hasAppliedDefaultEntryRef.current) {
      return;
    }

    hasAppliedDefaultEntryRef.current = true;

    const selectedDefault = normalizeFoodSearchDefaultEntry(
      resolvedFoodSearchDefaultEntry
    );

    if (selectedDefault === 'search_local') {
      dispatchUiState({ type: 'set', key: 'viewMode', value: 'search' });
      dispatchUiState({ type: 'set', key: 'searchMode', value: 'local' });
      return;
    }

    if (selectedDefault === 'search_online') {
      dispatchUiState({ type: 'set', key: 'viewMode', value: 'search' });
      dispatchUiState({ type: 'set', key: 'searchMode', value: 'online' });
      return;
    }

    if (selectedDefault === 'favourites') {
      dispatchUiState({ type: 'set', key: 'viewMode', value: 'favourites' });
      return;
    }

    if (selectedDefault === 'chat') {
      dispatchUiState({ type: 'set', key: 'viewMode', value: 'chat' });
      return;
    }

    if (selectedDefault === 'manual_entry') {
      onOpenManualEntry?.();
      return;
    }

    if (selectedDefault === 'barcode') {
      void handleBarcodeScanClick();
    }
  }, [
    dispatchUiState,
    handleBarcodeScanClick,
    isOpen,
    onOpenManualEntry,
    resolvedFoodSearchDefaultEntry,
  ]);

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

  const resolvedMealEntries = useMemo(
    () => (Array.isArray(mealNutritionEntries) ? mealNutritionEntries : []),
    [mealNutritionEntries]
  );

  const resolvedMealType = useMemo(
    () => getMealTypeById(selectedMealType || 'other'),
    [selectedMealType]
  );

  const mealTypeLabel = selectedMealType
    ? resolvedMealType.label
    : 'Select meal';

  const handleSwitchMealType = useCallback(
    (mealTypeId) => {
      if (!mealTypeId) {
        return;
      }
      onSwitchMealType?.(mealTypeId);
      setIsMealTypeMenuOpen(false);
    },
    [onSwitchMealType]
  );

  const handleEditMealEntry = useCallback(
    (entry) => {
      if (!selectedMealType || !entry?.id) {
        return;
      }
      onEditMealEntry?.(selectedMealType, entry.id);
      setIsMealPreviewOpen(false);
    },
    [onEditMealEntry, selectedMealType]
  );

  const handleDeleteMealEntry = useCallback(
    (entry) => {
      if (!selectedMealType || !entry?.id) {
        return;
      }
      onDeleteMealEntry?.(selectedMealType, entry.id);
    },
    [onDeleteMealEntry, selectedMealType]
  );

  useEffect(() => {
    latestChatAttachmentsRef.current = chatAttachments;
  }, [chatAttachments]);

  useEffect(() => {
    latestChatMessagesRef.current = chatMessages;
  }, [chatMessages]);

  // Cleanup timer on unmount
  useEffect(() => {
    const recordedFeedbackEvents = recordedFeedbackEventsRef.current;

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
      resetAiLookupSessionCache();
      recordedFeedbackEvents.clear();
      revokeChatAttachments(latestChatAttachmentsRef.current);
      latestChatMessagesRef.current.forEach((message) => {
        revokeChatAttachments(message.attachments);
      });
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

    const normalizedQuery = normalizeSearchText(searchQuery);

    results.sort((a, b) => {
      if (sortBy === 'name') {
        if (normalizedQuery) {
          const scoreA = scoreLocalNameRelevance(normalizedQuery, a);
          const scoreB = scoreLocalNameRelevance(normalizedQuery, b);

          if (scoreA !== scoreB) {
            return scoreB - scoreA;
          }

          const lengthA = String(a?.name ?? '').length;
          const lengthB = String(b?.name ?? '').length;
          if (lengthA !== lengthB) {
            return lengthA - lengthB;
          }

          return String(a.name ?? '').localeCompare(String(b.name ?? ''));
        }

        const compare = String(a.name ?? '').localeCompare(
          String(b.name ?? '')
        );
        return sortOrder === 'asc' ? compare : -compare;
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
        compareValue = String(a?.name ?? '').localeCompare(
          String(b?.name ?? '')
        );
      } else {
        const aValue = Number(
          a?.previewMacros?.[sortBy] ?? a?.per100g?.[sortBy] ?? 0
        );
        const bValue = Number(
          b?.previewMacros?.[sortBy] ?? b?.per100g?.[sortBy] ?? 0
        );
        compareValue = aValue - bValue;
      }

      return sortOrder === 'asc' ? compareValue : -compareValue;
    });

    return results;
  }, [onlineResults, selectedCategory, selectedSubcategory, sortBy, sortOrder]);

  // Current results based on selected browse mode
  const displayResults =
    searchMode === 'local' ? localSearchResults : onlineSearchResults;

  const visibleDisplayResults = useMemo(
    () => displayResults.slice(0, visibleResultCount),
    [displayResults, visibleResultCount]
  );

  const hasMoreResults =
    visibleResultCount < displayResults.length ||
    (searchMode === 'local' && hasMoreLocalDbResults);

  const handleLoadMoreResults = useCallback(() => {
    const batchSize =
      searchMode === 'online'
        ? ONLINE_RESULT_BATCH_SIZE
        : LOCAL_RESULT_BATCH_SIZE;

    setVisibleResultCount((current) =>
      Math.min(current + batchSize, displayResults.length)
    );

    if (
      isOpen &&
      viewMode === 'search' &&
      searchMode === 'local' &&
      !isLocalSearching &&
      !isLocalLoadingMore &&
      hasMoreLocalDbResults
    ) {
      runLocalSearch({ append: true, offset: localDbOffset });
    }
  }, [
    displayResults.length,
    hasMoreLocalDbResults,
    isLocalLoadingMore,
    isLocalSearching,
    isOpen,
    localDbOffset,
    runLocalSearch,
    searchMode,
    viewMode,
  ]);

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

  const handleAddAttachmentFiles = useCallback(
    async (fileList) => {
      const files = Array.from(fileList || []);
      if (files.length === 0) return;

      setChatError(null);
      const nextErrors = [];

      let validateAttachment = null;
      try {
        const { validateAttachmentFile } = await loadGeminiModule();
        validateAttachment = validateAttachmentFile;
      } catch {
        setChatError('AI tools are unavailable right now. Please try again.');
        return;
      }

      setChatAttachments((prev) => {
        const remainingSlots = Math.max(maxImageCount - prev.length, 0);
        const acceptedFiles = files.slice(0, remainingSlots);
        const nextAttachments = [...prev];

        acceptedFiles.forEach((file) => {
          try {
            validateAttachment(file);
            nextAttachments.push(createChatAttachment(file));
          } catch (error) {
            nextErrors.push({
              id: `attachment-error-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              name: file?.name || 'Attachment',
              message: error.message || 'Invalid image attachment',
            });
          }
        });

        if (files.length > acceptedFiles.length) {
          files.slice(remainingSlots).forEach((file) => {
            nextErrors.push({
              id: `attachment-error-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              name: file?.name || 'Attachment',
              message: `You can attach up to ${maxImageCount} images per message.`,
            });
          });
        }

        return nextAttachments;
      });

      if (nextErrors.length > 0) {
        setChatAttachmentErrors((prev) => [...nextErrors, ...prev].slice(0, 8));
      }
    },
    [maxImageCount]
  );

  const removeAttachmentError = useCallback((errorId) => {
    setChatAttachmentErrors((prev) =>
      prev.filter((entry) => entry.id !== errorId)
    );
  }, []);

  const updateMessageById = useCallback((messageId, updater) => {
    setChatMessages((prev) =>
      prev.map((message) =>
        message.id === messageId ? (updater(message) ?? message) : message
      )
    );
  }, []);

  const queueChatMessageForReplay = useCallback(
    (messageId) => {
      if (!messageId) {
        return;
      }

      setQueuedChatMessageIds((prev) => {
        if (prev.includes(messageId)) {
          return prev;
        }
        return [...prev, messageId];
      });

      updateMessageById(messageId, (current) => ({
        ...current,
        status: 'queued',
        error: null,
      }));
    },
    [updateMessageById]
  );

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

  const inferAiCategoryFromMacros = useCallback((entry) => {
    const protein = Math.max(0, Number(entry?.protein) || 0);
    const carbs = Math.max(0, Number(entry?.carbs) || 0);
    const fats = Math.max(0, Number(entry?.fats) || 0);

    if (protein <= 0 && carbs <= 0 && fats <= 0) {
      return 'custom';
    }

    if (protein >= carbs && protein >= fats) {
      return 'protein';
    }
    if (carbs >= protein && carbs >= fats) {
      return 'carbs';
    }
    return 'fats';
  }, []);

  const resolveAiCategory = useCallback(
    (entry, lookupMeta = null) => {
      const explicitCategory = String(entry?.category || '').toLowerCase();
      if (AI_CATEGORY_KEYS.has(explicitCategory)) {
        return explicitCategory;
      }

      const matchedCategory = String(
        lookupMeta?.matchedFood?.category || ''
      ).toLowerCase();
      if (AI_CATEGORY_KEYS.has(matchedCategory)) {
        return matchedCategory;
      }

      return inferAiCategoryFromMacros(entry);
    },
    [inferAiCategoryFromMacros]
  );

  const resolveAiSubcategory = useCallback((lookupMeta = null) => {
    const matchedSubcategory = String(
      lookupMeta?.matchedFood?.subcategory || ''
    ).trim();
    return matchedSubcategory || 'ai_estimate';
  }, []);

  const resolveAiLookupMeta = useCallback(
    async (entry, entryKey) => {
      if (!entryKey || !entry?.name) {
        return null;
      }

      const existing = aiEntryLookupByKey[entryKey];
      if (existing) {
        return existing;
      }

      const pendingRequest = aiEntryLookupRequestsRef.current.get(entryKey);
      if (pendingRequest) {
        return pendingRequest;
      }

      const request = (async () => {
        try {
          const lookupTerms = Array.isArray(entry?.lookupTerms)
            ? entry.lookupTerms
            : Array.isArray(entry?.lookup_queries)
              ? entry.lookup_queries
              : [];

          const result = await resolveAiFoodLookup({
            entryName: entry.name,
            lookupTerms,
            isOnline,
          });

          const nextMeta = normalizeAiLookupResult(result, {
            entryName: entry.name,
          });

          setAiEntryLookupByKey((prev) => ({
            ...prev,
            [entryKey]: nextMeta,
          }));

          return nextMeta;
        } catch (error) {
          const errorMeta = {
            status: 'error',
            usedSource: FOOD_SEARCH_SOURCE.LOCAL,
            sourcesTried: [FOOD_SEARCH_SOURCE.LOCAL],
            fallbackUsed: false,
            queryUsed: entry.name,
            matchConfidence: 'low',
            matchScore: 0,
            matchedFood: null,
            errorsBySource: {
              [FOOD_SEARCH_SOURCE.LOCAL]: error?.message || 'AI lookup failed.',
            },
            errorReasonsBySource: {
              [FOOD_SEARCH_SOURCE.LOCAL]: 'local_search_failed',
            },
          };

          setAiEntryLookupByKey((prev) => ({
            ...prev,
            [entryKey]: errorMeta,
          }));

          return errorMeta;
        } finally {
          aiEntryLookupRequestsRef.current.delete(entryKey);
        }
      })();

      aiEntryLookupRequestsRef.current.set(entryKey, request);
      return request;
    },
    [aiEntryLookupByKey, isOnline]
  );

  const toggleAiEntryExpansion = useCallback(
    (entry, entryKey) => {
      setExpandedAiEntryKeys((prev) => ({
        ...prev,
        [entryKey]: !prev[entryKey],
      }));

      if (!expandedAiEntryKeys[entryKey]) {
        resolveAiLookupMeta(entry, entryKey);
      }
    },
    [expandedAiEntryKeys, resolveAiLookupMeta]
  );

  const parseEntryKeyMessageId = useCallback((entryKey) => {
    const normalizedKey = String(entryKey || '').trim();
    const lastDashIndex = normalizedKey.lastIndexOf('-');
    if (lastDashIndex <= 0) {
      return normalizedKey || null;
    }

    return normalizedKey.slice(0, lastDashIndex);
  }, []);

  const recordImplicitFeedbackForEntry = useCallback(
    async ({ entry, entryKey, eventType, lookupMeta = null }) => {
      if (!entryKey || !eventType) {
        return;
      }

      const dedupeKey = `${eventType}:${entryKey}`;
      if (recordedFeedbackEventsRef.current.has(dedupeKey)) {
        return;
      }
      recordedFeedbackEventsRef.current.add(dedupeKey);

      const resolvedLookup =
        lookupMeta ||
        aiEntryLookupByKey[entryKey] ||
        (await resolveAiLookupMeta(entry, entryKey));

      void recordRagImplicitFeedback({
        eventType,
        messageId: parseEntryKeyMessageId(entryKey),
        entryKey,
        source: resolvedLookup?.usedSource || entry?.source || 'estimate',
        confidence:
          resolvedLookup?.matchConfidence || entry?.confidence || 'low',
        category: resolveAiCategory(entry, resolvedLookup),
      }).catch(() => {});
    },
    [
      aiEntryLookupByKey,
      parseEntryKeyMessageId,
      resolveAiCategory,
      resolveAiLookupMeta,
    ]
  );

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
        const remainingSlots = Math.max(maxImageCount - prev.length, 0);
        const cloned = message.attachments
          .slice(0, remainingSlots)
          .map((attachment) => cloneChatAttachmentForDraft(attachment));

        if (message.attachments.length > cloned.length) {
          setChatError(
            `You can attach up to ${maxImageCount} images per message.`
          );
        }

        return [...prev, ...cloned];
      });
      focusChatComposer();
    },
    [focusChatComposer, maxImageCount]
  );

  const submitChatRequest = useCallback(
    async ({
      text,
      attachments,
      userMessageId = null,
      beforeMessageId = null,
      assistantPlaceholderId = null,
    }) => {
      if (isSendingChat) return;

      const trimmedText = typeof text === 'string' ? text.trim() : '';
      if (!trimmedText && attachments.length === 0) {
        setChatError('Type a message or attach at least one image.');
        return;
      }

      setChatError(null);
      setIsSendingChat(true);
      const requestId = createChatRequestId();
      setActiveChatRequest({
        userMessageId,
        assistantPlaceholderId,
        requestId,
        startedAtMs: Date.now(),
        currentStage: isAiChatRagEnabled
          ? CHAT_REQUEST_STAGE.EXTRACTION
          : CHAT_REQUEST_STAGE.PROCESSING,
      });

      const transitionRequestStage = (nextStage) => {
        setActiveChatRequest((previousRequest) => {
          if (!previousRequest || previousRequest.requestId !== requestId) {
            return previousRequest;
          }

          if (previousRequest.currentStage === nextStage) {
            return previousRequest;
          }

          return {
            ...previousRequest,
            currentStage: nextStage,
          };
        });
      };

      const requestStartedAt = getNowMs();
      let lookupStatsRecorded = false;
      let extractionSchemaVersion = null;
      let resultSchemaVersion = null;
      let GeminiErrorClass = null;

      const controller = new window.AbortController();
      chatAbortControllerRef.current = controller;

      try {
        const geminiModule = await loadGeminiModule();
        const {
          fetchMacrosWithGrounding,
          sendGeminiMessage,
          sendGeminiExtraction,
          sendGeminiPresentation,
          GeminiError,
        } = geminiModule;
        GeminiErrorClass = GeminiError;

        const history = buildStructuredChatHistory(chatMessages, {
          beforeMessageId,
        });
        const rollingFoodContextSummary = buildRollingFoodContextSummary(
          chatMessages,
          { beforeMessageId }
        );

        const assistantMessageId =
          assistantPlaceholderId || `assistant-${Date.now()}`;
        let result = null;
        let preResolvedLookupContext = {};

        if (isAiChatRagEnabled) {
          const extractionStartedAt = getNowMs();
          const runExtractionAttempt = async (messageOverride = trimmedText) =>
            sendGeminiExtraction({
              message: messageOverride,
              foodContextSummary: rollingFoodContextSummary,
              files: attachments.map((attachment) => attachment.file),
              history,
              signal: controller.signal,
            });

          let extractionResult = await runExtractionAttempt(trimmedText);
          const extractionLatencyMs = getNowMs() - extractionStartedAt;
          extractionSchemaVersion =
            extractionResult?.foodParser?.version || null;
          void recordRagStageLatency({
            stage: 'extraction',
            durationMs: extractionLatencyMs,
            schemaVersion: extractionSchemaVersion,
          }).catch(() => {});

          const extractionMessageType =
            extractionResult?.foodParser?.messageType || null;
          const extractionEntries = Array.isArray(
            extractionResult?.foodParser?.entries
          )
            ? extractionResult.foodParser.entries
            : [];
          const dedupedExtractionEntries =
            dedupeExtractedFoodEntries(extractionEntries);

          const shouldRetryShortCircuit =
            (extractionResult?.foodParser?.messageType === 'clarification' ||
              extractionResult?.foodParser?.messageType === 'error' ||
              dedupedExtractionEntries.length === 0) &&
            trimmedText.length > 0;

          let effectiveExtractionEntries = dedupedExtractionEntries;
          if (shouldRetryShortCircuit) {
            const constrainedPrompt = `${trimmedText}\n\nIf possible, return messageType=food_entries with conservative assumptions and at least one entry. Ask only one clarification question only if absolutely required.`;
            const retryResult = await runExtractionAttempt(constrainedPrompt);
            const retryEntries = Array.isArray(retryResult?.foodParser?.entries)
              ? retryResult.foodParser.entries
              : [];
            const retryDedupedEntries =
              dedupeExtractedFoodEntries(retryEntries);
            const retryMessageType =
              retryResult?.foodParser?.messageType || null;

            if (
              retryMessageType === 'food_entries' &&
              retryDedupedEntries.length > 0
            ) {
              extractionResult = retryResult;
              effectiveExtractionEntries = retryDedupedEntries;
              extractionSchemaVersion =
                extractionResult?.foodParser?.version ||
                extractionSchemaVersion;
            }
          }

          void recordRagExtractionOutcome({
            messageType:
              extractionMessageType ||
              (extractionEntries.length > 0 ? 'food_entries' : 'no_entries'),
            entriesCount: effectiveExtractionEntries.length,
            schemaVersion: extractionSchemaVersion,
          }).catch(() => {});

          const shouldShortCircuit =
            extractionMessageType === 'clarification' ||
            extractionMessageType === 'error' ||
            effectiveExtractionEntries.length === 0;

          if (shouldShortCircuit) {
            const canAttemptGroundedExtractionFallback =
              isOnline &&
              attachments.length === 0 &&
              effectiveExtractionEntries.length === 0 &&
              trimmedText.length > 0;

            if (canAttemptGroundedExtractionFallback) {
              try {
                transitionRequestStage(CHAT_REQUEST_STAGE.RETRIEVAL);
                const groundedEstimate = await fetchMacrosWithGrounding(
                  trimmedText,
                  controller.signal,
                  20000
                );

                const groundedEntry = {
                  name: groundedEstimate?.name || trimmedText,
                  grams: 100,
                  calories: Number(groundedEstimate?.per100g?.calories) || 0,
                  protein: Number(groundedEstimate?.per100g?.protein) || 0,
                  carbs: Number(groundedEstimate?.per100g?.carbs) || 0,
                  fats: Number(groundedEstimate?.per100g?.fats) || 0,
                  confidence: groundedEstimate?.confidence || 'low',
                  rationale:
                    groundedEstimate?.rationale ||
                    'Fallback grounded estimate due to low-confidence extraction.',
                  assumptions: Array.isArray(groundedEstimate?.assumptions)
                    ? groundedEstimate.assumptions
                    : [],
                  lookupTerms: [trimmedText],
                  source: FOOD_SEARCH_SOURCE.AI_WEB_SEARCH,
                };

                result = {
                  text:
                    extractionResult?.text ||
                    'I used a grounded web estimate for this entry.',
                  raw: extractionResult?.raw || null,
                  foodParser: {
                    version:
                      extractionResult?.foodParser?.version ||
                      extractionSchemaVersion,
                    messageType: 'food_entries',
                    entries: [groundedEntry],
                    followUpQuestion: null,
                  },
                };
                resultSchemaVersion = result?.foodParser?.version || null;
              } catch {
                result = extractionResult;
                resultSchemaVersion = extractionSchemaVersion;
              }
            } else {
              result = extractionResult;
              resultSchemaVersion = extractionSchemaVersion;
            }
          } else {
            transitionRequestStage(CHAT_REQUEST_STAGE.RETRIEVAL);
            const retrievalStartedAt = getNowMs();
            preResolvedLookupContext = await resolveFoodLookupContext({
              messageId: assistantMessageId,
              entries: effectiveExtractionEntries,
              isOnline,
            });
            void recordRagStageLatency({
              stage: 'retrieval',
              durationMs: getNowMs() - retrievalStartedAt,
              schemaVersion: extractionSchemaVersion,
            }).catch(() => {});
            void recordRagLookupStats({
              lookupContext: preResolvedLookupContext,
              schemaVersion: extractionSchemaVersion,
            }).catch(() => {});
            lookupStatsRecorded = true;

            transitionRequestStage(CHAT_REQUEST_STAGE.VERIFICATION);
            const verificationStartedAt = getNowMs();
            const verifiedEntryResults = await Promise.all(
              effectiveExtractionEntries.map((entry, index) => {
                const entryKey = `${assistantMessageId}-${index}`;
                return resolveAiFoodEntry({
                  entry,
                  isOnline,
                  lookupMeta: preResolvedLookupContext[entryKey] || null,
                });
              })
            );
            void recordRagStageLatency({
              stage: 'verification',
              durationMs: getNowMs() - verificationStartedAt,
              schemaVersion: extractionSchemaVersion,
            }).catch(() => {});

            const verifiedEntries = verifiedEntryResults
              .map((item) => {
                return item?.verifiedEntry || null;
              })
              .filter(Boolean);

            verifiedEntryResults.forEach((item, index) => {
              const entryKey = `${assistantMessageId}-${index}`;
              if (item?.lookupMeta) {
                preResolvedLookupContext[entryKey] = item.lookupMeta;
              }
            });

            transitionRequestStage(CHAT_REQUEST_STAGE.PRESENTATION);
            const presentationStartedAt = getNowMs();
            try {
              const presentationResult = await sendGeminiPresentation({
                message: trimmedText,
                systemData: {
                  entries: verifiedEntries,
                },
                history,
                signal: controller.signal,
              });
              resultSchemaVersion =
                presentationResult?.foodParser?.version ||
                extractionSchemaVersion;
              void recordRagStageLatency({
                stage: 'presentation',
                durationMs: getNowMs() - presentationStartedAt,
                schemaVersion: resultSchemaVersion,
              }).catch(() => {});

              const presentationEntries = Array.isArray(
                presentationResult?.foodParser?.entries
              )
                ? presentationResult.foodParser.entries
                : [];

              const {
                mergedEntries,
                hasPresentationLengthMismatch,
                hasSparsePresentationEntries,
              } = mergePresentationEntriesWithVerified({
                verifiedEntries,
                presentationEntries,
              });

              if (
                hasPresentationLengthMismatch ||
                hasSparsePresentationEntries
              ) {
                console.warn('Presentation entry alignment mismatch detected', {
                  verifiedEntryCount: verifiedEntries.length,
                  presentationEntryCount: presentationEntries.length,
                  hasSparsePresentationEntries,
                });
              }

              mergedEntries.forEach((mergedEntry, index) => {
                if (mergedEntry?.nameRewriteSuppressed) {
                  console.warn('Presentation name rewrite suppressed', {
                    verifiedName: verifiedEntries[index]?.name,
                    presentedName: presentationEntries[index]?.name || null,
                  });
                }
              });

              void recordRagPresentationNameDrift({
                verifiedEntries,
                presentationEntries,
                schemaVersion: resultSchemaVersion,
              }).catch(() => {});

              result = {
                ...presentationResult,
                text:
                  presentationResult?.text ||
                  extractionResult?.text ||
                  'Here are your parsed food entries.',
                foodParser: {
                  messageType: 'food_entries',
                  entries: mergedEntries,
                  followUpQuestion: null,
                },
              };
            } catch (presentationError) {
              console.warn('Presentation fallback to verified entries', {
                message: presentationError?.message || 'Unknown error',
              });

              resultSchemaVersion = extractionSchemaVersion;
              void recordRagStageLatency({
                stage: 'presentation',
                durationMs: getNowMs() - presentationStartedAt,
                schemaVersion: resultSchemaVersion,
              }).catch(() => {});

              result = {
                text:
                  extractionResult?.text ||
                  'Here are your parsed food entries.',
                raw: null,
                foodParser: {
                  messageType: 'food_entries',
                  entries: verifiedEntries,
                  followUpQuestion: null,
                },
              };
            }
          }
        } else {
          transitionRequestStage(CHAT_REQUEST_STAGE.PROCESSING);
          result = await sendGeminiMessage({
            message: trimmedText,
            files: attachments.map((attachment) => attachment.file),
            history,
            signal: controller.signal,
          });
          resultSchemaVersion = result?.foodParser?.version || null;

          if (result?.foodParser?.messageType) {
            const fallbackEntries = Array.isArray(result?.foodParser?.entries)
              ? result.foodParser.entries
              : [];

            void recordRagExtractionOutcome({
              messageType: result.foodParser.messageType,
              entriesCount: fallbackEntries.length,
              schemaVersion: resultSchemaVersion,
            }).catch(() => {});
          }
        }

        if (
          result?.foodParser?.messageType === 'food_entries' &&
          Array.isArray(result?.foodParser?.entries) &&
          result.foodParser.entries.length > 0
        ) {
          const lookupContext =
            Object.keys(preResolvedLookupContext).length > 0
              ? preResolvedLookupContext
              : await resolveFoodLookupContext({
                  messageId: assistantMessageId,
                  entries: result.foodParser.entries,
                  isOnline,
                });

          if (!lookupStatsRecorded && Object.keys(lookupContext).length > 0) {
            void recordRagLookupStats({
              lookupContext,
              schemaVersion: resultSchemaVersion || extractionSchemaVersion,
            }).catch(() => {});
            lookupStatsRecorded = true;
          }

          if (Object.keys(lookupContext).length > 0) {
            setAiEntryLookupByKey((prev) => ({
              ...prev,
              ...lookupContext,
            }));
          }
        }

        if (userMessageId) {
          updateMessageById(userMessageId, (message) => ({
            ...message,
            status: 'sent',
            error: null,
          }));
          setQueuedChatMessageIds((prev) =>
            prev.filter((queuedId) => queuedId !== userMessageId)
          );
        }

        const assistantMessage = createAssistantChatMessage({
          id: assistantMessageId,
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

        void recordRagStageLatency({
          stage: 'endToEnd',
          durationMs: getNowMs() - requestStartedAt,
          schemaVersion: resultSchemaVersion || extractionSchemaVersion,
        }).catch(() => {});
      } catch (error) {
        const message =
          GeminiErrorClass && error instanceof GeminiErrorClass
            ? error.message
            : 'Failed to get AI response. Please try again.';

        if (assistantPlaceholderId) {
          updateMessageById(assistantPlaceholderId, (assistantMessage) => ({
            ...assistantMessage,
            status: 'error',
            error: message,
          }));
        } else if (userMessageId) {
          if (!isOnline) {
            queueChatMessageForReplay(userMessageId);
          } else {
            updateMessageById(userMessageId, (userMessage) => ({
              ...userMessage,
              status: 'error',
              error: message,
            }));
            setQueuedChatMessageIds((prev) =>
              prev.filter((queuedId) => queuedId !== userMessageId)
            );
          }
        } else {
          setChatError(message);
        }
      } finally {
        setIsSendingChat(false);
        setActiveChatRequest(null);
        chatAbortControllerRef.current = null;
      }
    },
    [
      chatMessages,
      isOnline,
      isAiChatRagEnabled,
      isSendingChat,
      queueChatMessageForReplay,
      updateMessageById,
    ]
  );

  useEffect(() => {
    if (!isOnline || isSendingChat || queuedReplayInFlightRef.current) {
      return;
    }

    const nextQueuedId = queuedChatMessageIds[0];
    if (!nextQueuedId) {
      return;
    }

    const queuedMessage = chatMessages.find(
      (message) => message.id === nextQueuedId && message.role === 'user'
    );

    if (!queuedMessage) {
      setQueuedChatMessageIds((prev) =>
        prev.filter((queuedId) => queuedId !== nextQueuedId)
      );
      return;
    }

    queuedReplayInFlightRef.current = true;
    updateMessageById(nextQueuedId, (message) => ({
      ...message,
      status: 'sending',
      error: null,
    }));

    void submitChatRequest({
      text: queuedMessage.text || '',
      attachments: queuedMessage.attachments || [],
      userMessageId: queuedMessage.id,
    }).finally(() => {
      queuedReplayInFlightRef.current = false;
    });
  }, [
    chatMessages,
    isOnline,
    isSendingChat,
    queuedChatMessageIds,
    submitChatRequest,
    updateMessageById,
  ]);

  const sendChat = useCallback(async () => {
    if (isSendingChat) return;

    const currentText = chatInput;
    const currentAttachments = [...chatAttachments];
    const trimmedText = currentText.trim();

    if (!trimmedText && currentAttachments.length === 0) {
      setChatError('Type a message or attach at least one image.');
      return;
    }

    const latestAssistantBatch = [...chatMessages]
      .reverse()
      .find(
        (message) =>
          message.role === 'assistant' &&
          message.status === 'sent' &&
          message.foodParser?.messageType === 'food_entries' &&
          Array.isArray(message.foodParser?.entries) &&
          message.foodParser.entries.length > 0
      );

    if (latestAssistantBatch) {
      const entries = latestAssistantBatch.foodParser.entries;
      const keyedEntries = entries.map((entry, index) => ({
        entry,
        entryKey: `${latestAssistantBatch.id}-${index}`,
      }));

      const actedEntries = keyedEntries.filter(
        ({ entryKey }) =>
          loggedAiEntryKeys[entryKey] || favouritedAiEntryKeys[entryKey]
      );
      const unactedEntries = keyedEntries.filter(
        ({ entryKey }) =>
          !loggedAiEntryKeys[entryKey] && !favouritedAiEntryKeys[entryKey]
      );

      if (unactedEntries.length > 0) {
        unactedEntries.forEach(({ entry, entryKey }) => {
          void recordImplicitFeedbackForEntry({
            entry,
            entryKey,
            eventType: 'query_again_reject',
          });
        });
      }

      if (actedEntries.length > 0 && unactedEntries.length > 0) {
        unactedEntries.forEach(({ entry, entryKey }) => {
          void recordImplicitFeedbackForEntry({
            entry,
            entryKey,
            eventType: 'partial_batch_reject',
          });
        });
      }
    }

    const userMessageId = `user-${Date.now()}`;
    const shouldQueue = !isOnline;
    const userMessage = createUserChatMessage({
      id: userMessageId,
      text: currentText,
      attachments: currentAttachments,
      status: shouldQueue ? 'queued' : 'sending',
    });

    setChatMessages((prev) => [
      ...prev.slice(-CHAT_HISTORY_MESSAGE_LIMIT),
      userMessage,
    ]);
    setChatInput('');
    setChatPlaceholder(DEFAULT_CHAT_PLACEHOLDER);
    setChatAttachments([]);
    setChatAttachmentErrors([]);
    setChatError(null);

    if (shouldQueue) {
      setQueuedChatMessageIds((prev) => [...prev, userMessageId]);
      setChatError(
        'Message queued offline. It will send automatically once reconnected.'
      );
      return;
    }

    await submitChatRequest({
      text: currentText,
      attachments: currentAttachments,
      userMessageId,
    });
  }, [
    chatAttachments,
    chatInput,
    chatMessages,
    favouritedAiEntryKeys,
    isOnline,
    isSendingChat,
    loggedAiEntryKeys,
    recordImplicitFeedbackForEntry,
    submitChatRequest,
  ]);

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

      if (!isOnline) {
        queueChatMessageForReplay(message.id);
        setChatError(
          'Message queued offline. It will send automatically once reconnected.'
        );
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
    [
      isOnline,
      loadComposerDraft,
      queueChatMessageForReplay,
      submitChatRequest,
      updateMessageById,
    ]
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
        setChatPlaceholder(question);
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
    (entry, index = 0, entryKey = null, providedLookupMeta = null) => {
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
      const lookupMeta =
        providedLookupMeta || (entryKey ? aiEntryLookupByKey[entryKey] : null);
      const resolvedCategory = resolveAiCategory(entry, lookupMeta);
      const resolvedSubcategory = resolveAiSubcategory(lookupMeta);

      const baseCalories = Math.max(0, Math.round(safeNumber(entry.calories)));
      const baseProtein = Math.max(
        0,
        Math.round(safeNumber(entry.protein) * 10) / 10
      );
      const baseCarbs = Math.max(
        0,
        Math.round(safeNumber(entry.carbs) * 10) / 10
      );
      const baseFats = Math.max(
        0,
        Math.round(safeNumber(entry.fats) * 10) / 10
      );

      const roundedGrams =
        Number.isFinite(grams) && grams > 0 ? Math.round(grams) : null;

      const canUseLookupMacros =
        lookupMeta?.status === 'resolved' &&
        lookupMeta?.matchConfidence === 'high' &&
        lookupMeta?.matchedFood?.per100g &&
        roundedGrams &&
        roundedGrams > 0;

      const lookupFactor = canUseLookupMacros ? roundedGrams / 100 : null;
      const calories = canUseLookupMacros
        ? Math.max(
            0,
            Math.round(
              (Number(lookupMeta.matchedFood.per100g.calories) || 0) *
                lookupFactor
            )
          )
        : baseCalories;
      const protein = canUseLookupMacros
        ? Math.max(
            0,
            Math.round(
              (Number(lookupMeta.matchedFood.per100g.protein) || 0) *
                lookupFactor *
                10
            ) / 10
          )
        : baseProtein;
      const carbs = canUseLookupMacros
        ? Math.max(
            0,
            Math.round(
              (Number(lookupMeta.matchedFood.per100g.carbs) || 0) *
                lookupFactor *
                10
            ) / 10
          )
        : baseCarbs;
      const fats = canUseLookupMacros
        ? Math.max(
            0,
            Math.round(
              (Number(lookupMeta.matchedFood.per100g.fats) || 0) *
                lookupFactor *
                10
            ) / 10
          )
        : baseFats;

      return {
        id: entryId,
        foodId: `ai_${Date.now()}_${index}`,
        name: entry.name,
        category: resolvedCategory,
        subcategory: resolvedSubcategory,
        calories,
        protein,
        carbs,
        fats,
        grams: roundedGrams,
        source: 'ai',
        aiLookupUsed: Boolean(canUseLookupMacros),
        aiLookupSource:
          canUseLookupMacros && lookupMeta?.usedSource
            ? lookupMeta.usedSource
            : null,
        timestamp: new Date().toISOString(),
      };
    },
    [aiEntryLookupByKey, entryIdRef, resolveAiCategory, resolveAiSubcategory]
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
      category: foodEntry.category || 'custom',
      subcategory: foodEntry.subcategory || 'ai_estimate',
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
    async (entry, entryKey, { closeModal } = { closeModal: false }) => {
      if (!entryKey || loggedAiEntryKeys[entryKey]) {
        return;
      }

      const lookupMeta = await resolveAiLookupMeta(entry, entryKey);
      const foodEntry = buildAiFoodEntry(entry, 0, entryKey, lookupMeta);
      if (!foodEntry) return;

      onSelectFavourite?.(foodEntry, { closeModal });

      setLoggedAiEntryKeys((prev) => ({
        ...prev,
        [entryKey]: true,
      }));

      void recordImplicitFeedbackForEntry({
        entry,
        entryKey,
        eventType: closeModal ? 'log_exit_accept' : 'log_accept',
        lookupMeta,
      });
    },
    [
      buildAiFoodEntry,
      loggedAiEntryKeys,
      onSelectFavourite,
      recordImplicitFeedbackForEntry,
      resolveAiLookupMeta,
    ]
  );

  const handleSaveAiFavourite = useCallback(
    async (entry, entryKey, index = 0) => {
      if (!entryKey || favouritedAiEntryKeys[entryKey]) {
        return;
      }

      const lookupMeta = await resolveAiLookupMeta(entry, entryKey);
      const foodEntry = buildAiFoodEntry(entry, index, entryKey, lookupMeta);
      if (!foodEntry) return;

      const sourceFood = buildAiSourceFood(foodEntry);
      onSaveAsFavourite?.(foodEntry, sourceFood);

      setFavouritedAiEntryKeys((prev) => ({
        ...prev,
        [entryKey]: true,
      }));

      void recordImplicitFeedbackForEntry({
        entry,
        entryKey,
        eventType: 'save_favourite_accept',
        lookupMeta,
      });
    },
    [
      buildAiFoodEntry,
      buildAiSourceFood,
      favouritedAiEntryKeys,
      onSaveAsFavourite,
      recordImplicitFeedbackForEntry,
      resolveAiLookupMeta,
    ]
  );

  useEffect(() => {
    if (!isClosing) {
      return;
    }

    const latestAssistantBatch = [...chatMessages]
      .reverse()
      .find(
        (message) =>
          message.role === 'assistant' &&
          message.status === 'sent' &&
          message.foodParser?.messageType === 'food_entries' &&
          Array.isArray(message.foodParser?.entries) &&
          message.foodParser.entries.length > 0
      );

    if (!latestAssistantBatch) {
      return;
    }

    latestAssistantBatch.foodParser.entries.forEach((entry, index) => {
      const entryKey = `${latestAssistantBatch.id}-${index}`;
      const hasAction =
        loggedAiEntryKeys[entryKey] || favouritedAiEntryKeys[entryKey];

      if (!hasAction) {
        void recordImplicitFeedbackForEntry({
          entry,
          entryKey,
          eventType: 'ignored_no_action',
        });
      }
    });
  }, [
    chatMessages,
    favouritedAiEntryKeys,
    isClosing,
    loggedAiEntryKeys,
    recordImplicitFeedbackForEntry,
  ]);

  const handleLogAllAiEntries = useCallback(
    async (messageId, entries, closeModal = false) => {
      if (!Array.isArray(entries) || entries.length === 0) return;

      const unloggedEntries = entries
        .map((entry, index) => ({
          entry,
          entryKey: `${messageId}-${index}`,
        }))
        .filter(({ entryKey }) => !loggedAiEntryKeys[entryKey]);

      for (let index = 0; index < unloggedEntries.length; index += 1) {
        const { entry, entryKey } = unloggedEntries[index];
        const isLast = index === unloggedEntries.length - 1;
        await handleLogAiEntry(entry, entryKey, {
          closeModal: closeModal && isLast,
        });
      }
    },
    [handleLogAiEntry, loggedAiEntryKeys]
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
      allowKeyboardViewportResize={viewMode === 'chat'}
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

        <div className="flex items-center gap-2">
          <div className="relative" ref={mealTypeDropdownRef}>
            <motion.button
              type="button"
              onClick={() => setIsMealTypeMenuOpen((previous) => !previous)}
              whileTap={{ scale: 0.98 }}
              whileHover={{ y: -1 }}
              className="h-9 flex items-center gap-1.5 px-3 rounded-lg border border-border bg-surface-highlight text-foreground text-sm font-medium md:hover:bg-surface pressable-card focus-ring"
            >
              <Utensils size={14} className="text-accent-blue" />
              <span className="truncate max-w-[6.5rem]">{mealTypeLabel}</span>
              <ChevronDown
                size={13}
                className={`text-muted transition-transform ${
                  isMealTypeMenuOpen ? 'rotate-180' : ''
                }`}
              />
            </motion.button>

            <AnimatePresence>
              {isMealTypeMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
                  className="absolute right-0 top-full mt-2 w-56 max-h-72 overflow-y-auto rounded-lg border border-border bg-surface shadow-2xl z-50"
                >
                  <div className="p-2 space-y-1">
                    {MEAL_TYPE_ORDER.map((mealTypeId) => {
                      const option = getMealTypeById(mealTypeId);
                      const OptionIcon = option.icon;
                      const isActive = selectedMealType === mealTypeId;
                      return (
                        <button
                          key={mealTypeId}
                          type="button"
                          onClick={() => handleSwitchMealType(mealTypeId)}
                          className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition-all text-left pressable-card focus-ring ${
                            isActive
                              ? 'bg-accent-blue text-primary-foreground'
                              : 'text-foreground md:hover:bg-surface-highlight'
                          }`}
                        >
                          <OptionIcon size={15} />
                          <span>{option.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <motion.button
            type="button"
            onClick={() => setIsMealPreviewOpen(true)}
            whileTap={{ scale: 0.98 }}
            whileHover={{ y: -1 }}
            className="h-9 flex items-center gap-1.5 px-3 rounded-lg border border-border bg-surface-highlight text-foreground text-sm font-medium md:hover:bg-surface pressable-card focus-ring"
          >
            <span>In meal</span>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={`meal-count-${resolvedMealEntries.length}`}
                initial={{ opacity: 0, y: 6, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.9 }}
                transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                className="text-accent-blue text-base font-semibold leading-none"
              >
                {resolvedMealEntries.length}
              </motion.span>
            </AnimatePresence>
          </motion.button>
        </div>
      </div>

      <div className="flex-1 bg-surface border-t border-border overflow-y-auto flex flex-col">
        {/* Action Buttons - Always on top */}
        <div className="px-4 pt-4 pb-3 border-b border-border">
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
            chatAttachmentErrors={chatAttachmentErrors}
            removeAttachmentError={removeAttachmentError}
            isSendingChat={isSendingChat}
            chatStatusNowMs={chatStatusNowMs}
            activeChatRequest={activeChatRequest}
            chatScrollRef={chatScrollRef}
            fileInputRef={fileInputRef}
            cameraInputRef={cameraInputRef}
            chatTextareaRef={chatTextareaRef}
            chatPlaceholder={chatPlaceholder}
            chatInput={chatInput}
            setChatInput={setChatInput}
            answerClarification={answerClarification}
            expandedAiEntryKeys={expandedAiEntryKeys}
            aiEntryLookupByKey={aiEntryLookupByKey}
            getFoodSearchSourceLabel={getFoodSearchSourceLabel}
            toggleAiEntryExpansion={toggleAiEntryExpansion}
            loggedAiEntryKeys={loggedAiEntryKeys}
            favouritedAiEntryKeys={favouritedAiEntryKeys}
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
                    ? 'Search online foods (USDA)...'
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
          visibleResultsCount={visibleDisplayResults.length}
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
                  activeSearchSource={activeSearchSource}
                  fallbackUsed={searchFallbackUsed}
                  searchError={searchError}
                  localSearchError={localSearchError}
                  isLocalSearching={isLocalSearching}
                  isSearching={isSearching}
                  displayResults={visibleDisplayResults}
                  searchQuery={searchQuery}
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

              {viewMode === 'search' &&
                hasMoreResults &&
                !isSearching &&
                !isLocalSearching && (
                  <div className="pt-2 pb-1 flex justify-center">
                    <button
                      onClick={handleLoadMoreResults}
                      disabled={isLocalLoadingMore}
                      className="px-4 py-2 rounded-lg border border-border bg-surface-highlight text-foreground text-sm font-medium md:hover:bg-surface pressable-card focus-ring"
                    >
                      {isLocalLoadingMore
                        ? 'Loading more...'
                        : `Show more (${visibleDisplayResults.length} loaded)`}
                    </button>
                  </div>
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

      <AnimatePresence>
        {isMealPreviewOpen && (
          <FoodSearchMealPreviewPanel
            isOpen={isMealPreviewOpen}
            onClose={() => setIsMealPreviewOpen(false)}
            mealLabel={mealTypeLabel}
            mealEntries={resolvedMealEntries}
            onEditMealEntry={onEditMealEntry ? handleEditMealEntry : undefined}
            onDeleteMealEntry={
              onDeleteMealEntry ? handleDeleteMealEntry : undefined
            }
          />
        )}
      </AnimatePresence>
    </ModalShell>
  );
};
