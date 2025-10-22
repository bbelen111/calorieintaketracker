const DATA_KEY = 'energyMapData';
const SELECTED_DAY_KEY = 'energyMapSelectedDay';

const hasLocalStorage = () => typeof window !== 'undefined' && window.localStorage;

export const loadEnergyMapData = () => {
  if (!hasLocalStorage()) {
    return getDefaultEnergyMapData();
  }

  try {
    const saved = window.localStorage.getItem(DATA_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') {
        return parsed;
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
  gender: 'male',
  trainingType: 'bodybuilding',
  trainingDuration: 2,
  stepRanges: ['<10k', '10k', '12k', '14k', '16k', '18k', '20k', '>20k'],
  cardioSessions: [],
  trainingTypeOverrides: {
    bodybuilding: {
      label: 'Bodybuilding',
      description: 'Hypertrophy focus, moderate rest periods',
      caloriesPerHour: 220
    },
    powerlifting: {
      label: 'Powerlifting',
      description: 'Heavy compounds, longer rest periods',
      caloriesPerHour: 180
    },
    strongman: {
      label: 'Strongman',
      description: 'High intensity events, carries, pushes',
      caloriesPerHour: 280
    },
    crossfit: {
      label: 'CrossFit',
      description: 'High intensity, metabolic conditioning',
      caloriesPerHour: 300
    },
    calisthenics: {
      label: 'Calisthenics',
      description: 'Bodyweight movements, skill work',
      caloriesPerHour: 240
    },
    custom: {
      label: 'My Training',
      description: 'Custom training style',
      caloriesPerHour: 220
    }
  },
  customTrainingName: 'My Training',
  customTrainingCalories: 220,
  customTrainingDescription: 'Custom training style'
});
