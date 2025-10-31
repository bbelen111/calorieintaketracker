import { sortWeightEntries } from './weight';

const DATA_KEY = 'energyMapData';
const SELECTED_DAY_KEY = 'energyMapSelectedDay';

const hasLocalStorage = () =>
  typeof window !== 'undefined' && window.localStorage;

export const loadEnergyMapData = () => {
  if (!hasLocalStorage()) {
    return getDefaultEnergyMapData();
  }

  try {
    const saved = window.localStorage.getItem(DATA_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') {
        return mergeWithDefaults(parsed);
      }
    }
  } catch (error) {
    console.warn('Failed to load energy map data from storage', error);
  }

  return getDefaultEnergyMapData();
};

export const saveEnergyMapData = (data) => {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(DATA_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn('Failed to save energy map data to storage', error);
  }
};

export const loadSelectedDay = () => {
  if (!hasLocalStorage()) {
    return 'training';
  }

  try {
    const savedDay = window.localStorage.getItem(SELECTED_DAY_KEY);
    return savedDay === 'rest' ? 'rest' : 'training';
  } catch (error) {
    console.warn('Failed to load selected day from storage', error);
    return 'training';
  }
};

export const saveSelectedDay = (day) => {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(SELECTED_DAY_KEY, day);
  } catch (error) {
    console.warn('Failed to save selected day to storage', error);
  }
};

export const getDefaultEnergyMapData = () => ({
  age: 21,
  weight: 74,
  height: 168,
  weightEntries: [],
  gender: 'male',
  trainingType: 'bodybuilding',
  trainingDuration: 2,
  stepRanges: ['<10k', '10k', '12k', '14k', '16k', '18k', '20k', '>20k'],
  cardioSessions: [],
  cardioFavourites: [],
  customCardioTypes: {},
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

  return {
    ...defaults,
    ...data,
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
    phases: Array.isArray(data.phases) ? data.phases : defaults.phases,
    activePhaseId: data.activePhaseId ?? defaults.activePhaseId,
  };
}
