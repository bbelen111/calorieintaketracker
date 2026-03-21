import { Preferences } from '@capacitor/preferences';
import {
  clampCustomActivityMultiplier,
  DEFAULT_ACTIVITY_MULTIPLIERS,
} from '../constants/activityPresets.js';
import {
  getDexieHistoryMigrationState,
  loadHistoryFromDexie,
  saveHistoryToDexie,
  setDexieHistoryMigrationState,
} from './historyDatabase.js';
import { sortWeightEntries } from './weight.js';
import { sortBodyFatEntries } from './bodyFat.js';
import { sanitizeAge, sanitizeHeight } from './profile.js';
import {
  createDefaultPhaseLogV2State,
  normalizePhaseLogV2State,
} from './phaseLogV2.js';

// Legacy key for migration
const LEGACY_DATA_KEY = 'energyMapData';

// Split keys for performance
const PROFILE_KEY = 'energyMapData_profile'; // Settings, preferences, small lists
const HISTORY_KEY = 'energyMapData_history'; // Heavy logs: nutrition, weight, phases

const SELECTED_DAY_KEY = 'energyMapSelectedDay';
const MAX_CACHED_FOODS = 500;

const HISTORY_FIELDS = [
  'weightEntries',
  'bodyFatEntries',
  'stepEntries',
  'nutritionData',
  'phases',
  'phaseLogV2',
  'cardioSessions',
  'cachedFoods',
];

const ACTIVITY_DAY_TYPES = ['training', 'rest'];
const hasOwnProperty = (obj, key) =>
  Object.prototype.hasOwnProperty.call(obj, key);

let lastSavedProfileSerialized = null;
let lastSavedHistorySerializedByField = new Map();

const hasLocalStorage = () =>
  typeof window !== 'undefined' && window.localStorage;

const isEnvFlagEnabled = (value, fallback = false) => {
  if (value == null) {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
};

const isDualWriteEnabled = () =>
  isEnvFlagEnabled(import.meta?.env?.VITE_ENABLE_HISTORY_DUAL_WRITE, false);

const parseJsonOrEmpty = (value) => {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.warn('Failed to parse stored JSON payload', error);
    return {};
  }
};

const getMissingHistoryFields = (historyData) =>
  HISTORY_FIELDS.filter((field) => !hasOwnProperty(historyData, field));

const getFoodCacheIdentity = (entry, index) => {
  if (!entry || typeof entry !== 'object') {
    return `index:${index}`;
  }

  const candidateKeys = [
    entry.id,
    entry.foodId,
    entry.food_id,
    entry.fatsecretId,
    entry.barcode,
  ];
  const primary = candidateKeys.find(
    (value) => typeof value === 'string' && value.trim().length > 0
  );

  if (primary) {
    return primary.trim().toLowerCase();
  }

  const name =
    typeof entry.name === 'string' ? entry.name.trim().toLowerCase() : '';
  const brand =
    typeof entry.brandName === 'string'
      ? entry.brandName.trim().toLowerCase()
      : '';

  if (name || brand) {
    return `${name}|${brand}`;
  }

  return `index:${index}`;
};

const normalizeCachedFoodsForPersistence = (
  cachedFoods,
  maxItems = MAX_CACHED_FOODS
) => {
  if (!Array.isArray(cachedFoods) || maxItems <= 0) {
    return [];
  }

  const recentWindow = cachedFoods.slice(-maxItems * 3);
  const seen = new Set();
  const dedupedNewestFirst = [];

  for (let index = recentWindow.length - 1; index >= 0; index -= 1) {
    const entry = recentWindow[index];
    const cacheIdentity = getFoodCacheIdentity(entry, index);

    if (seen.has(cacheIdentity)) {
      continue;
    }

    seen.add(cacheIdentity);
    dedupedNewestFirst.push(entry);
  }

  const dedupedChronological = dedupedNewestFirst.reverse();
  return dedupedChronological.slice(-maxItems);
};

const sanitizeHistoryForPersistence = (historyData) => ({
  ...historyData,
  cachedFoods: normalizeCachedFoodsForPersistence(historyData.cachedFoods),
});

const createHistorySerializedMap = (historyData) => {
  const serializedByField = new Map();
  Object.entries(historyData).forEach(([field, payload]) => {
    serializedByField.set(field, JSON.stringify(payload));
  });
  return serializedByField;
};

const getChangedHistoryData = (historyData) => {
  const changedHistoryData = {};
  const serializedByField = createHistorySerializedMap(historyData);

  serializedByField.forEach((serialized, field) => {
    if (lastSavedHistorySerializedByField.get(field) !== serialized) {
      changedHistoryData[field] = historyData[field];
    }
  });

  return {
    changedHistoryData,
    serializedByField,
  };
};

// Helper to migrate legacy localStorage data to Capacitor Preferences
async function migrateFromLocalStorage() {
  if (!hasLocalStorage()) return null;

  try {
    const legacy = window.localStorage.getItem(LEGACY_DATA_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);

      // Save to new storage
      await saveEnergyMapData(parsed);

      // Clear legacy
      window.localStorage.removeItem(LEGACY_DATA_KEY);
      return parsed;
    }
  } catch (err) {
    console.error('Migration failed:', err);
  }
  return null;
}

export const loadEnergyMapData = async () => {
  try {
    // 1. Try to migrate first
    const migratedData = await migrateFromLocalStorage();
    if (migratedData) {
      return mergeWithDefaults(migratedData);
    }

    // 2. Load profile from Capacitor Preferences
    const profileRes = await Preferences.get({ key: PROFILE_KEY });
    const profileData = parseJsonOrEmpty(profileRes.value);

    // 3. Load history from Dexie first
    const dexieResult = await loadHistoryFromDexie(HISTORY_FIELDS);
    const dexieHistoryData = dexieResult.historyData ?? {};
    let historyData = { ...dexieHistoryData };
    const missingHistoryFields = getMissingHistoryFields(historyData);
    const shouldInspectLegacyHistory =
      !dexieResult.hasAnyHistory || missingHistoryFields.length > 0;

    // 4. Backfill or repair Dexie from legacy Preferences history if needed
    if (shouldInspectLegacyHistory) {
      const historyRes = await Preferences.get({ key: HISTORY_KEY });
      const legacyHistoryData = parseJsonOrEmpty(historyRes.value);

      if (Object.keys(legacyHistoryData).length > 0) {
        if (!dexieResult.hasAnyHistory) {
          historyData = legacyHistoryData;
          const didBackfillDexie = await saveHistoryToDexie(legacyHistoryData);

          if (didBackfillDexie) {
            await setDexieHistoryMigrationState({
              complete: true,
              source: 'preferences-history',
              migratedAt: Date.now(),
            });
          } else {
            await setDexieHistoryMigrationState({
              complete: false,
              source: 'preferences-history',
              failedAt: Date.now(),
            });
          }
        } else {
          const repairedFields = {};
          missingHistoryFields.forEach((fieldKey) => {
            if (hasOwnProperty(legacyHistoryData, fieldKey)) {
              historyData[fieldKey] = legacyHistoryData[fieldKey];
              repairedFields[fieldKey] = legacyHistoryData[fieldKey];
            }
          });

          if (Object.keys(repairedFields).length > 0) {
            const didRepairDexie = await saveHistoryToDexie(repairedFields);
            await setDexieHistoryMigrationState({
              complete: didRepairDexie,
              source: 'preferences-history-repair',
              repairedAt: Date.now(),
              repairedFields: Object.keys(repairedFields),
            });
          }
        }
      }
    } else {
      const migrationState = await getDexieHistoryMigrationState();
      if (!migrationState?.complete) {
        await setDexieHistoryMigrationState({
          complete: true,
          source: 'dexie-history',
          migratedAt: Date.now(),
        });
      }
    }

    historyData = sanitizeHistoryForPersistence(historyData);

    if (
      Object.keys(profileData).length === 0 &&
      Object.keys(historyData).length === 0
    ) {
      return getDefaultEnergyMapData();
    }

    // 5. Merge everything into in-memory shape
    return mergeWithDefaults({
      ...profileData,
      ...historyData,
    });
  } catch (error) {
    console.warn('Failed to load energy map data from storage', error);
    return getDefaultEnergyMapData();
  }
};

export const saveEnergyMapData = async (data) => {
  try {
    const profileData = {};
    const historyData = {};

    // Split data into profile (settings) and history (heavy logs)
    Object.keys(data).forEach((key) => {
      if (HISTORY_FIELDS.includes(key)) {
        historyData[key] = data[key];
      } else {
        profileData[key] = data[key];
      }
    });

    const normalizedHistoryData = sanitizeHistoryForPersistence(historyData);
    const profileSerialized = JSON.stringify(profileData);
    const { changedHistoryData, serializedByField } = getChangedHistoryData(
      normalizedHistoryData
    );
    const hasProfileChanges = profileSerialized !== lastSavedProfileSerialized;
    const hasHistoryChanges = Object.keys(changedHistoryData).length > 0;

    if (!hasProfileChanges && !hasHistoryChanges) {
      return;
    }

    const dualWriteEnabled = isDualWriteEnabled();

    const primaryResults = await Promise.allSettled([
      hasProfileChanges
        ? Preferences.set({
            key: PROFILE_KEY,
            value: profileSerialized,
          })
        : Promise.resolve('skipped-profile-write'),
      hasHistoryChanges
        ? saveHistoryToDexie(changedHistoryData)
        : Promise.resolve(true),
    ]);

    const [, dexieResult] = primaryResults;
    const rejected = primaryResults.filter(
      (result) => result.status === 'rejected'
    );

    const dexieSucceeded =
      dexieResult?.status === 'fulfilled' && dexieResult.value === true;
    const hasExplicitFailureValue =
      hasHistoryChanges &&
      dexieResult?.status === 'fulfilled' &&
      dexieResult.value === false;

    const shouldWriteLegacyHistory =
      hasHistoryChanges && (dualWriteEnabled || !dexieSucceeded);
    let fallbackHistorySucceeded = false;
    if (shouldWriteLegacyHistory) {
      const fallbackResult = await Promise.allSettled([
        Preferences.set({
          key: HISTORY_KEY,
          value: JSON.stringify(normalizedHistoryData),
        }),
      ]);

      fallbackHistorySucceeded = fallbackResult[0]?.status === 'fulfilled';
      if (fallbackResult[0]?.status === 'rejected') {
        rejected.push(fallbackResult[0]);
      }
    }

    const profileWriteSucceeded =
      !hasProfileChanges || primaryResults[0]?.status === 'fulfilled';
    const historyWriteSucceeded =
      !hasHistoryChanges || dexieSucceeded || fallbackHistorySucceeded;

    if (profileWriteSucceeded) {
      lastSavedProfileSerialized = profileSerialized;
    }
    if (historyWriteSucceeded) {
      lastSavedHistorySerializedByField = serializedByField;
    }

    // Warn only when persistence is genuinely at risk:
    // - any rejected write (profile or fallback history), or
    // - Dexie explicit failure when we did not (or could not) fallback.
    const hasPersistenceRisk =
      rejected.length > 0 ||
      (hasExplicitFailureValue && !shouldWriteLegacyHistory);

    if (hasPersistenceRisk) {
      console.warn('One or more storage save operations failed', {
        rejected,
        hasExplicitFailureValue,
      });
    }
  } catch (error) {
    console.warn('Failed to save energy map data to storage', error);
  }
};

export const loadSelectedDay = async () => {
  try {
    const { value } = await Preferences.get({ key: SELECTED_DAY_KEY });
    return value === 'rest' ? 'rest' : 'training';
  } catch (error) {
    console.warn('Failed to load selected day from storage', error);
    return 'training';
  }
};

export const saveSelectedDay = async (day) => {
  try {
    await Preferences.set({ key: SELECTED_DAY_KEY, value: day });
  } catch (error) {
    console.warn('Failed to save selected day to storage', error);
  }
};

export const getDefaultEnergyMapData = () => ({
  age: 21,
  weight: 74,
  height: 168,
  weightEntries: [],
  bodyFatEntries: [],
  stepEntries: [], // { date: 'YYYY-MM-DD', steps: number, source: 'manual' | 'healthConnect' }
  stepGoal: 10000, // Daily step goal
  bodyFatTrackingEnabled: true,
  gender: 'male',
  theme: 'auto', // 'auto' | 'dark' | 'light' | 'amoled_dark'
  smartTefEnabled: false,
  smartTefFoodTefBurnEnabled: true,
  smartTefQuickEstimatesTargetMode: true,
  smartTefLiveCardTargetMode: false,
  trainingType: 'bodybuilding',
  trainingDuration: 2,
  trainingEffortType: 'intensity',
  trainingIntensity: 'moderate',
  trainingHeartRate: '',
  stepRanges: ['<10k', '10k', '12k', '14k', '16k', '18k', '20k', '>20k'],
  cardioSessions: [],
  cardioFavourites: [],
  foodFavourites: [],
  customCardioTypes: {},
  nutritionData: {},
  pinnedFoods: [],
  cachedFoods: [], // Foods fetched from online APIs (FatSecret, etc.)
  // nutritionData structure: { 'YYYY-MM-DD': { mealType: [{ id, name, calories, protein, carbs, fats, timestamp }] } }
  trainingTypeOverrides: {
    bodybuilding: {
      label: 'Bodybuilding',
      description: 'Hypertrophy focus, moderate rest periods',
      caloriesPerHour: 220,
    },
    powerlifting: {
      label: 'Powerlifting',
      description: 'Heavy compounds, longer rest periods',
      caloriesPerHour: 180,
    },
    strongman: {
      label: 'Strongman',
      description: 'High intensity events, carries, pushes',
      caloriesPerHour: 280,
    },
    crossfit: {
      label: 'CrossFit',
      description: 'High intensity, metabolic conditioning',
      caloriesPerHour: 300,
    },
    calisthenics: {
      label: 'Calisthenics',
      description: 'Bodyweight movements, skill work',
      caloriesPerHour: 240,
    },
    custom: {
      label: 'My Training',
      description: 'Custom training style',
      caloriesPerHour: 220,
    },
  },
  customTrainingName: 'My Training',
  customTrainingCalories: 220,
  customTrainingDescription: 'Custom training style',
  activityPresets: {
    training: 'default',
    rest: 'default',
  },
  activityMultipliers: {
    ...DEFAULT_ACTIVITY_MULTIPLIERS,
  },
  customActivityMultipliers: {
    ...DEFAULT_ACTIVITY_MULTIPLIERS,
  },
  phases: [],
  activePhaseId: null,
  phaseLogV2: createDefaultPhaseLogV2State(),
});

function mergeWithDefaults(data) {
  const defaults = getDefaultEnergyMapData();
  const activityPresets = {
    ...defaults.activityPresets,
    ...(data.activityPresets ?? {}),
  };
  const activityMultipliers = {
    ...defaults.activityMultipliers,
    ...(data.activityMultipliers ?? {}),
  };
  const customActivityMultipliers = {
    ...defaults.customActivityMultipliers,
    ...(data.customActivityMultipliers ?? {}),
  };

  ACTIVITY_DAY_TYPES.forEach((dayType) => {
    const fallbackCustom = Number.isFinite(customActivityMultipliers[dayType])
      ? customActivityMultipliers[dayType]
      : Number.isFinite(activityMultipliers[dayType])
        ? activityMultipliers[dayType]
        : defaults.customActivityMultipliers[dayType];

    customActivityMultipliers[dayType] =
      clampCustomActivityMultiplier(fallbackCustom);

    if (activityPresets[dayType] === 'custom') {
      activityMultipliers[dayType] = customActivityMultipliers[dayType];
    }
  });

  const normalizeNutritionData = (raw) => {
    if (!raw || typeof raw !== 'object') return defaults.nutritionData;

    const normalized = {};

    for (const [date, meals] of Object.entries(raw)) {
      normalized[date] = {};
      if (!meals || typeof meals !== 'object') continue;

      for (const [mealType, entries] of Object.entries(meals)) {
        normalized[date][mealType] = Array.isArray(entries)
          ? entries.map((entry) => {
              // Ensure a grams key exists so consumers can rely on the shape.
              if (!entry || typeof entry !== 'object') {
                return { ...entry, grams: null };
              }
              if (!('grams' in entry)) {
                return { ...entry, grams: null };
              }
              return entry;
            })
          : [];
      }
    }

    return normalized;
  };

  return {
    ...defaults,
    ...data,
    age: sanitizeAge(data.age, defaults.age),
    height: sanitizeHeight(data.height, defaults.height),
    nutritionData: normalizeNutritionData(
      data.nutritionData ?? defaults.nutritionData
    ),
    trainingTypeOverrides: {
      ...defaults.trainingTypeOverrides,
      ...(data.trainingTypeOverrides ?? {}),
    },
    activityPresets,
    activityMultipliers,
    customActivityMultipliers,
    customCardioTypes: {
      ...defaults.customCardioTypes,
      ...(data.customCardioTypes ?? {}),
    },
    stepRanges: Array.isArray(data.stepRanges)
      ? data.stepRanges
      : defaults.stepRanges,
    cardioSessions: Array.isArray(data.cardioSessions)
      ? data.cardioSessions.map((session) => ({
          ...session,
          effortType: session?.effortType ?? 'intensity',
        }))
      : defaults.cardioSessions,
    cardioFavourites: Array.isArray(data.cardioFavourites)
      ? data.cardioFavourites.map((session) => ({
          ...session,
          effortType: session?.effortType ?? 'intensity',
        }))
      : defaults.cardioFavourites,
    weightEntries: sortWeightEntries(
      data.weightEntries ?? defaults.weightEntries
    ),
    bodyFatEntries: sortBodyFatEntries(
      data.bodyFatEntries ?? defaults.bodyFatEntries
    ),
    stepEntries: Array.isArray(data.stepEntries)
      ? data.stepEntries.sort((a, b) => a.date.localeCompare(b.date))
      : defaults.stepEntries,
    bodyFatTrackingEnabled:
      data.bodyFatTrackingEnabled ?? defaults.bodyFatTrackingEnabled,
    smartTefEnabled: data.smartTefEnabled ?? defaults.smartTefEnabled,
    smartTefFoodTefBurnEnabled:
      data.smartTefFoodTefBurnEnabled ?? defaults.smartTefFoodTefBurnEnabled,
    smartTefQuickEstimatesTargetMode:
      data.smartTefQuickEstimatesTargetMode ??
      defaults.smartTefQuickEstimatesTargetMode,
    smartTefLiveCardTargetMode:
      data.smartTefLiveCardTargetMode ?? defaults.smartTefLiveCardTargetMode,
    phases: Array.isArray(data.phases) ? data.phases : defaults.phases,
    activePhaseId: data.activePhaseId ?? defaults.activePhaseId,
    phaseLogV2: normalizePhaseLogV2State(
      data.phaseLogV2 ?? defaults.phaseLogV2
    ),
    pinnedFoods: Array.isArray(data.pinnedFoods)
      ? data.pinnedFoods
      : defaults.pinnedFoods,
    foodFavourites: Array.isArray(data.foodFavourites)
      ? data.foodFavourites
      : defaults.foodFavourites,
    cachedFoods: Array.isArray(data.cachedFoods)
      ? normalizeCachedFoodsForPersistence(data.cachedFoods)
      : defaults.cachedFoods,
  };
}
