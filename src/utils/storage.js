import { Preferences } from '@capacitor/preferences';
import { sortWeightEntries } from './weight';
import { sortBodyFatEntries } from './bodyFat';

// Legacy key for migration
const LEGACY_DATA_KEY = 'energyMapData';

// Split keys for performance
const PROFILE_KEY = 'energyMapData_profile'; // Settings, preferences, small lists
const HISTORY_KEY = 'energyMapData_history'; // Heavy logs: nutrition, weight, phases

const SELECTED_DAY_KEY = 'energyMapSelectedDay';

const HISTORY_FIELDS = [
  'weightEntries',
  'bodyFatEntries',
  'stepEntries',
  'nutritionData',
  'phases',
  'cardioSessions',
];

const hasLocalStorage = () =>
  typeof window !== 'undefined' && window.localStorage;

// Helper to migrate legacy localStorage data to Capacitor Preferences
async function migrateFromLocalStorage() {
  if (!hasLocalStorage()) return null;

  try {
    const legacy = window.localStorage.getItem(LEGACY_DATA_KEY);
    if (legacy) {
      console.log(
        'Migrating legacy localStorage data to Capacitor Preferences...'
      );
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

    // 2. Load from Capacitor Preferences
    const profileRes = await Preferences.get({ key: PROFILE_KEY });
    const historyRes = await Preferences.get({ key: HISTORY_KEY });

    if (!profileRes.value && !historyRes.value) {
      return getDefaultEnergyMapData();
    }

    const profileData = profileRes.value ? JSON.parse(profileRes.value) : {};
    const historyData = historyRes.value ? JSON.parse(historyRes.value) : {};

    // Merge everything
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

    await Promise.all([
      Preferences.set({
        key: PROFILE_KEY,
        value: JSON.stringify(profileData),
      }),
      Preferences.set({
        key: HISTORY_KEY,
        value: JSON.stringify(historyData),
      }),
    ]);
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
  bodyFatTrackingEnabled: true,
  gender: 'male',
  trainingType: 'bodybuilding',
  trainingDuration: 2,
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
    training: 0.35,
    rest: 0.28,
  },
  customActivityMultipliers: {
    training: 0.35,
    rest: 0.28,
  },
  phases: [],
  activePhaseId: null,
});

function mergeWithDefaults(data) {
  const defaults = getDefaultEnergyMapData();
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
    nutritionData: normalizeNutritionData(
      data.nutritionData ?? defaults.nutritionData
    ),
    trainingTypeOverrides: {
      ...defaults.trainingTypeOverrides,
      ...(data.trainingTypeOverrides ?? {}),
    },
    activityPresets: {
      ...defaults.activityPresets,
      ...(data.activityPresets ?? {}),
    },
    activityMultipliers: {
      ...defaults.activityMultipliers,
      ...(data.activityMultipliers ?? {}),
    },
    customActivityMultipliers: {
      ...defaults.customActivityMultipliers,
      ...(data.customActivityMultipliers ?? {}),
    },
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
    phases: Array.isArray(data.phases) ? data.phases : defaults.phases,
    activePhaseId: data.activePhaseId ?? defaults.activePhaseId,
    pinnedFoods: Array.isArray(data.pinnedFoods)
      ? data.pinnedFoods
      : defaults.pinnedFoods,
    foodFavourites: Array.isArray(data.foodFavourites)
      ? data.foodFavourites
      : defaults.foodFavourites,
    cachedFoods: Array.isArray(data.cachedFoods)
      ? data.cachedFoods
      : defaults.cachedFoods,
  };
}
