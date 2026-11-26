import { beforeEach, describe, expect, it, vi } from 'vitest';

const { table, failures } = vi.hoisted(() => ({
  table: new Map(),
  failures: { saveDocuments: false },
}));

// An in-memory stand-in for the Dexie history table: the Node-style IndexedDB
// the real adapter needs does not exist under jsdom. The adapter's public
// surface is all `saveEnergyMapData` ever touches.
vi.mock('../utils/data/historyDatabase.js', () => ({
  loadAllHistoryDocuments: vi.fn(async () => ({
    available: true,
    hasAnyHistory: table.size > 0,
    documents: Array.from(table, ([id, payload]) => ({ id, payload })),
  })),
  loadHistoryDocumentsByIds: vi.fn(async () => ({
    available: true,
    hasAnyHistory: false,
    documents: [],
  })),
  saveHistoryToDexie: vi.fn(async (data) => {
    Object.entries(data).forEach(([id, payload]) => table.set(id, payload));
    return true;
  }),
  saveHistoryDocumentsToDexie: vi.fn(async (documents) => {
    if (failures.saveDocuments) {
      return false;
    }
    documents.forEach(({ id, payload }) => table.set(id, payload));
    return true;
  }),
  deleteHistoryDocumentsFromDexie: vi.fn(async (ids) => {
    ids.forEach((id) => table.delete(id));
    return true;
  }),
}));

import { useEnergyMapStore } from './useEnergyMapStore';
import { getDefaultEnergyMapData } from '../utils/data/storage';
import { resetPersistenceTracking } from '../utils/data/storage';
import { formatDateKeyLocal, getTodayDateKey } from '../utils/data/dateKeys';

const INITIAL_STORE = useEnergyMapStore.getInitialState();
const get = () => useEnergyMapStore.getState();

const meal = (id, calories) => ({
  id,
  foodId: id,
  name: id,
  grams: 100,
  calories,
  protein: 10,
  carbs: 10,
  fats: 5,
  timestamp: 1_700_000_000_000,
});

const nutritionFor = (days) =>
  Object.fromEntries(
    Object.entries(days).map(([date, calories]) => [
      date,
      { lunch: [meal(`meal-${date}`, calories)] },
    ])
  );

const seedCurrent = (overrides = {}) => {
  useEnergyMapStore.setState({
    userData: { ...getDefaultEnergyMapData(), ...overrides },
  });
};

describe('importUserData', () => {
  beforeEach(() => {
    table.clear();
    failures.saveDocuments = false;
    resetPersistenceTracking();
    useEnergyMapStore.setState(INITIAL_STORE, true);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('replaces memory and disk, deleting history the file does not contain', async () => {
    seedCurrent({
      nutritionData: nutritionFor({ '2026-03-01': 500, '2026-03-02': 600 }),
      weightEntries: [{ date: '2026-03-01', weight: 80 }],
    });

    const applied = await get().importUserData({
      ...getDefaultEnergyMapData(),
      age: 41,
      nutritionData: nutritionFor({ '2026-03-02': 900, '2026-03-03': 700 }),
      weightEntries: [{ date: '2026-03-03', weight: 77 }],
    });

    expect(applied).toBe(true);

    // Memory
    expect(get().userData.age).toBe(41);
    expect(Object.keys(get().userData.nutritionData).sort()).toEqual([
      '2026-03-02',
      '2026-03-03',
    ]);
    expect(get().userData.weightEntries.map((entry) => entry.date)).toEqual([
      '2026-03-03',
    ]);

    // Disk: the day only the OLD data had is gone, the new days are written.
    expect(table.has('nutritionData:2026-03-01')).toBe(false);
    expect(table.has('nutritionData:2026-03-02')).toBe(true);
    expect(table.has('nutritionData:2026-03-03')).toBe(true);
    expect(table.has('weightEntries:2026-03-01')).toBe(false);
    expect(table.has('weightEntries:2026-03-03')).toBe(true);
  });

  it('keeps this device’s own sensor and sync opt-in', async () => {
    seedCurrent({
      heartRateSensor: { deviceId: 'strap-here', name: 'Strap (this phone)' },
      heartRateSyncEnabled: true,
    });

    await get().importUserData({
      ...getDefaultEnergyMapData(),
      heartRateSensor: { deviceId: 'strap-there', name: 'Other phone strap' },
      heartRateSyncEnabled: false,
      age: 33,
    });

    expect(get().userData.age).toBe(33);
    expect(get().userData.heartRateSensor).toEqual({
      deviceId: 'strap-here',
      name: 'Strap (this phone)',
    });
    expect(get().userData.heartRateSyncEnabled).toBe(true);
  });

  it('leaves memory exactly as it was when the write fails', async () => {
    seedCurrent({ age: 29 });
    const before = get().userData;
    failures.saveDocuments = true;

    const applied = await get().importUserData({
      ...getDefaultEnergyMapData(),
      age: 55,
      weightEntries: [{ date: '2026-03-03', weight: 77 }],
    });

    expect(applied).toBe(false);
    expect(get().userData).toBe(before);
    expect(get().userData.age).toBe(29);
  });

  it('repairs a file whose active phase never set (or mislabelled) the goal', async () => {
    const shiftDays = (days) => {
      const date = new Date();
      date.setDate(date.getDate() + days);
      return formatDateKeyLocal(date);
    };
    const today = getTodayDateKey();
    const yesterday = shiftDays(-1);
    const before = shiftDays(-10);
    const phase = {
      id: 42,
      name: 'Bulk',
      startDate: shiftDays(-3),
      endDate: shiftDays(87),
      goalType: 'bulking',
      creationMode: 'target',
      targetWeight: 82,
      smartCaloriePlan: { requiredDailyDeltaCalories: 692 },
      startingWeight: 74,
      status: 'active',
    };
    const snapshot = (goalAtSnapshot, goalTarget) => ({
      goalAtSnapshot,
      goalTarget,
      tdee: 2600,
      intake: 3200,
      deficit: -600,
    });
    seedCurrent();

    // An export from a build where the goal stayed Maintenance under the phase
    // and the +692 kcal/day plan was saved as a Lean Bulk.
    await get().importUserData({
      ...getDefaultEnergyMapData(),
      selectedGoal: 'maintenance',
      phaseGoalCalorieDelta: 692,
      phaseGoalCalorieDeltaSourcePhaseId: 42,
      phaseLogV2: {
        version: 2,
        phasesById: { 42: phase },
        phaseOrder: [42],
        activePhaseId: 42,
      },
      dailySnapshots: {
        [before]: snapshot('maintenance', 0),
        [yesterday]: snapshot('maintenance', -692),
        [today]: snapshot('maintenance', -692),
      },
    });

    const { userData, goalDailyBalanceTarget, phases } = get();
    expect(phases[0].goalType).toBe('aggressive_bulk');
    expect(userData.selectedGoal).toBe('aggressive_bulk');
    expect(goalDailyBalanceTarget).toBe(-692);
    // The phase's days get its goal; the day before the phase keeps its own.
    expect(userData.dailySnapshots[yesterday].goalAtSnapshot).toBe(
      'aggressive_bulk'
    );
    expect(userData.dailySnapshots[today]).toMatchObject({
      goalAtSnapshot: 'aggressive_bulk',
      goalTarget: -692,
    });
    expect(userData.dailySnapshots[before].goalAtSnapshot).toBe('maintenance');
  });

  it('seeds today’s snapshot so the header is not empty after an import', async () => {
    seedCurrent();

    await get().importUserData({ ...getDefaultEnergyMapData() });

    const snapshots = Object.keys(get().userData.dailySnapshots ?? {});
    expect(snapshots.length).toBeGreaterThan(0);
  });
});
