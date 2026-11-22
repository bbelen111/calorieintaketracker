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

  it('seeds today’s snapshot so the header is not empty after an import', async () => {
    seedCurrent();

    await get().importUserData({ ...getDefaultEnergyMapData() });

    const snapshots = Object.keys(get().userData.dailySnapshots ?? {});
    expect(snapshots.length).toBeGreaterThan(0);
  });
});
