import { beforeEach, describe, expect, it, vi } from 'vitest';

import { exportPhaseAsCSV, exportPhaseAsJSON } from './export';
import { saveTextFile } from '../services/fileShare';
import { createUnitFormatter } from './units/unitFormatter';
import { DEFAULT_UNIT_PREFERENCES } from '../constants/units/units';

vi.mock('../services/fileShare', () => ({
  saveTextFile: vi.fn(async () => ({ success: true })),
  saveTextFileToDevice: vi.fn(),
}));

const PHASE = {
  name: 'Cut',
  startDate: '2026-01-01',
  endDate: '2026-01-31',
  startingWeight: 80,
  targetWeight: 75,
  dailyLogs: { '2026-01-01': { nutritionRef: '2026-01-01' } },
};
const WEIGHTS = [
  { date: '2026-01-01', weight: 80 },
  { date: '2026-01-15', weight: 78 },
];
const NUTRITION = {
  '2026-01-01': {
    lunch: [{ id: 1, calories: 500, protein: 20, carbs: 50, fats: 10 }],
  },
};

const lastContent = () => saveTextFile.mock.calls.at(-1)[0].content;

describe('phase export units', () => {
  beforeEach(() => saveTextFile.mockClear());

  it('keeps the metric CSV as it was', async () => {
    await exportPhaseAsCSV(PHASE, WEIGHTS, NUTRITION, []);

    const csv = lastContent();
    expect(csv).toContain('Target Weight,75 kg\n');
    expect(csv).toContain('Weight Change,-2.00 kg\n');
    expect(csv).toContain('Nutrition Ref,Calories,Protein');
    expect(csv).toContain('2026-01-01,500.0,20.0');
    expect(csv).toContain('Date,Weight (kg)\n2026-01-01,80\n');
  });

  it('writes numeric pound and kJ columns, with stone as pounds', async () => {
    const units = createUnitFormatter({
      ...DEFAULT_UNIT_PREFERENCES,
      bodyWeight: 'st',
      energy: 'kJ',
    });
    await exportPhaseAsCSV(PHASE, WEIGHTS, NUTRITION, [], units);

    const csv = lastContent();
    expect(csv).toContain('Target Weight,165.3 lb\n');
    expect(csv).toContain('Weight Change,-4.41 lb\n');
    expect(csv).toContain('Nutrition Ref,Energy (kJ),Protein');
    expect(csv).toContain('2026-01-01,2092.0,20.0');
    expect(csv).toContain('Date,Weight (lb)\n2026-01-01,176.4\n');
  });

  it('keeps the JSON export in stored units', async () => {
    await exportPhaseAsJSON(PHASE, WEIGHTS, NUTRITION, []);

    const data = JSON.parse(lastContent());
    expect(data.phase.targetWeight).toBe(75);
    expect(data.weightEntries[0].weight).toBe(80);
  });
});
