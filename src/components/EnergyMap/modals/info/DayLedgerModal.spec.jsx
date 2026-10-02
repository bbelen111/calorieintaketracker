import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { DayLedgerModal } from './DayLedgerModal';

/**
 * `DayLedgerModal` is the read-only detail sheet behind the Daily Ledger
 * browser. Contract: it renders a fully populated day record (snapshot cache
 * + canonical nutrition/sessions/trackers/phase-log), suppresses nothing into
 * zeros, nav-arrows walk tracked days only, and the hero card opens the
 * breakdown for the recorded date.
 */

const SNAP_DATE = '2026-03-10';

const SNAPSHOT = {
  date: SNAP_DATE,
  goalAtSnapshot: 'cutting',
  tdee: 2540,
  baselineTdee: 2600,
  intake: 2000,
  deficit: 540,
  bmr: 1650,
  stepCalories: 150,
  trainingBurn: 300,
  cardioBurn: 100,
  stepCount: 8000,
  isTrainingDay: true,
  tef: 100,
  tefMode: 'dynamic',
  epoc: 60,
  epocTraining: 40,
  epocCardio: 20,
  epocFromTodaySessions: 60,
  epocCarryInCalories: 25,
  adaptiveThermogenesisCorrection: -120,
  adaptiveThermogenesisMode: 'smart',
};

const DAILY_SNAPSHOTS = {
  [SNAP_DATE]: SNAPSHOT,
  '2026-03-09': { ...SNAPSHOT, date: '2026-03-09', tdee: 2500, deficit: 500 },
  '2026-03-11': { ...SNAPSHOT, date: '2026-03-11', tdee: 2600, deficit: 600 },
};
const RENDER_PROPS = {
  isOpen: true,
  isClosing: false,
  onClose: vi.fn(),
  dateKey: SNAP_DATE,
  snapshot: SNAPSHOT,
  dailySnapshots: DAILY_SNAPSHOTS,
  weightEntries: [
    { date: '2026-03-05', weight: 74.2 },
    { date: SNAP_DATE, weight: 74 },
  ],
  bodyFatEntries: [{ date: SNAP_DATE, bodyFat: 15.2 }],
  stepEntries: [{ date: SNAP_DATE, steps: 8000, source: 'healthConnect' }],
  bodyFatTrackingEnabled: true,
  nutritionData: {
    [SNAP_DATE]: {
      breakfast: [
        {
          id: 'f1',
          name: 'Oats',
          grams: 60,
          calories: 230,
          protein: 8,
          carbs: 40,
          fats: 4,
        },
      ],
      lunch: [
        {
          id: 'f2',
          name: 'Chicken breast',
          grams: 180,
          calories: 297,
          protein: 56,
          carbs: 0,
          fats: 6,
        },
      ],
    },
  },
  userData: { age: 30, weight: 74, height: 178, gender: 'male' },
  cardioSessions: [
    {
      id: 'c1',
      date: SNAP_DATE,
      type: 'running',
      duration: 30,
      intensity: 'moderate',
      effortType: 'intensity',
      startTime: '18:00',
      stepOverlapEnabled: true,
    },
  ],
  trainingSessions: [
    {
      id: 't1',
      date: SNAP_DATE,
      type: 'trainingtype_1',
      duration: 75,
      intensity: 'vigorous',
      effortType: 'intensity',
      startTime: '07:30',
    },
  ],
  cardioTypes: {
    running: { label: 'Running', met: { moderate: 8 }, ambulatory: true },
  },
  trainingTypes: {
    trainingtype_1: { label: 'Bodybuilding', caloriesPerHour: 220 },
  },
  neatOverride: null,
  phaseLogV2: null,
  onSelectDate: vi.fn(),
  onOpenBreakdown: vi.fn(),
};

const renderModal = (props = {}) =>
  render(<DayLedgerModal {...RENDER_PROPS} {...props} />);
describe('DayLedgerModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('populates the full day record', () => {
    renderModal();

    expect(screen.getByText('2,540')).toBeInTheDocument();
    expect(screen.getByText('+540')).toBeInTheDocument();
    // Session rows carry canonical kcal + effort labels
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByText('Bodybuilding')).toBeInTheDocument();
    expect(screen.getByText('~296')).toBeInTheDocument();
    expect(screen.getByText('~344')).toBeInTheDocument();
    // Per-meal breakdown names the meals + item counts
    expect(screen.getByText(/Breakfast/)).toBeInTheDocument();
    expect(screen.getByText(/Lunch/)).toBeInTheDocument();
    // Measurement rows (steps is now a single number — no provenance caption)
    expect(screen.getByText('74 kg')).toBeInTheDocument();
    expect(screen.getByText('8,000')).toBeInTheDocument();
    expect(screen.queryByText('Health store')).not.toBeInTheDocument();
    // Nutrition macros render in one row with the app's macro icons
    expect(screen.getByText('Protein')).toBeInTheDocument();
    expect(screen.getByText('Carbs')).toBeInTheDocument();
    // A real change renders the shared "vs prev" chip
    expect(screen.getByText(/vs prev/)).toBeInTheDocument();
  });

  it('renders nothing while closed', () => {
    renderModal({ isOpen: false });

    expect(screen.queryByText('Daily Ledger')).not.toBeInTheDocument();
  });

  it('shows the honest gap-day state with no snapshot', () => {
    renderModal({ snapshot: null, dateKey: '2026-03-01' });

    expect(
      screen.getByText('No ledger recorded for this day')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('navigates tracked days via the arrows', async () => {
    const user = userEvent.setup();
    const onSelectDate = vi.fn();
    renderModal({ onSelectDate });

    await user.click(screen.getByRole('button', { name: 'Next tracked day' }));
    expect(onSelectDate).toHaveBeenCalledWith('2026-03-11');

    await user.click(
      screen.getByRole('button', { name: 'Previous tracked day' })
    );
    expect(onSelectDate).toHaveBeenCalledWith('2026-03-09');
  });

  it('opens the breakdown for the recorded date', async () => {
    const user = userEvent.setup();
    const onOpenBreakdown = vi.fn();
    renderModal({ onOpenBreakdown });

    await user.click(screen.getByText(/Full breakdown/i));
    expect(onOpenBreakdown).toHaveBeenCalledWith(SNAP_DATE);
  });

  it('swaps the body-fat row for a sessions row when tracking is off', () => {
    renderModal({ bodyFatTrackingEnabled: false });

    expect(screen.queryByText('Body fat')).not.toBeInTheDocument();
    expect(screen.getByText('Sessions')).toBeInTheDocument();
    // 296 + 344 = 640
    expect(screen.getByText('640 kcal')).toBeInTheDocument();
  });

  it('renders fiber as a nutrient beside sugars/sodium, never as a macro', () => {
    renderModal({
      nutritionData: {
        [SNAP_DATE]: {
          lunch: [
            {
              id: 'f3',
              name: 'Lentils',
              grams: 100,
              calories: 116,
              protein: 9,
              carbs: 20,
              fats: 0.4,
              fiber: 8,
              sodium: 2,
              saturatedFats: 0.1,
              sugars: 1.8,
            },
          ],
        },
      },
    });

    expect(screen.getByText('Fiber')).toBeInTheDocument();
    expect(screen.getByText('8 g')).toBeInTheDocument();
    expect(screen.getByText('Sodium')).toBeInTheDocument();
    expect(screen.getByText('2 mg')).toBeInTheDocument();
  });

  it('surfaces the NEAT override chip only when one exists', () => {
    renderModal({
      neatOverride: {
        multiplier: 0.3,
        presetKey: 'active',
        label: 'Highly Active',
      },
    });
    expect(screen.getByText(/Highly Active/)).toBeInTheDocument();
  });

  it('omits the NEAT override chip when none exists', () => {
    renderModal({ neatOverride: null });
    expect(screen.queryByText(/Highly Active/)).not.toBeInTheDocument();
  });

  it('hides the phase card when the date has no phase log', () => {
    renderModal();

    // The fundraising "Phase" section header only renders with a phase log.
    expect(screen.queryByText('Phase')).not.toBeInTheDocument();
  });

  it('hides the change chip when the reading is unchanged', () => {
    renderModal({
      weightEntries: [
        { date: '2026-03-05', weight: 74 },
        { date: SNAP_DATE, weight: 74 },
      ],
      bodyFatEntries: [
        { date: '2026-03-05', bodyFat: 15.2 },
        { date: SNAP_DATE, bodyFat: 15.2 },
      ],
    });

    expect(screen.queryByText(/vs prev/)).not.toBeInTheDocument();
  });

  it('drops the EPOC block so the hero card shrinks when there is no EPOC', () => {
    renderModal({
      snapshot: {
        ...SNAPSHOT,
        epoc: 0,
        epocTraining: 0,
        epocCardio: 0,
        epocFromTodaySessions: 0,
        epocCarryInCalories: 0,
      },
    });

    expect(screen.queryByText(/EPOC/)).not.toBeInTheDocument();
    // The breakdown prompt stays available even without EPOC.
    expect(screen.getByText('Full breakdown')).toBeInTheDocument();
  });

  it('steps to the next tracked day on a leftward swipe', () => {
    const onSelectDate = vi.fn();
    renderModal({ onSelectDate });

    const surface = screen.getByText('2,540');
    fireEvent.touchStart(surface, {
      touches: [{ clientX: 240, clientY: 120 }],
    });
    fireEvent.touchMove(surface, {
      touches: [{ clientX: 120, clientY: 128 }],
    });
    fireEvent.touchEnd(surface);

    expect(onSelectDate).toHaveBeenCalledWith('2026-03-11');
  });

  it('steps to the previous tracked day on a rightward swipe', () => {
    const onSelectDate = vi.fn();
    renderModal({ onSelectDate });

    const surface = screen.getByText('2,540');
    fireEvent.touchStart(surface, {
      touches: [{ clientX: 100, clientY: 120 }],
    });
    fireEvent.touchMove(surface, {
      touches: [{ clientX: 220, clientY: 126 }],
    });
    fireEvent.touchEnd(surface);

    expect(onSelectDate).toHaveBeenCalledWith('2026-03-09');
  });

  it('ignores a mostly-vertical drag so scrolling never switches days', () => {
    const onSelectDate = vi.fn();
    renderModal({ onSelectDate });

    const surface = screen.getByText('2,540');
    fireEvent.touchStart(surface, {
      touches: [{ clientX: 200, clientY: 100 }],
    });
    fireEvent.touchMove(surface, {
      touches: [{ clientX: 140, clientY: 260 }],
    });
    fireEvent.touchEnd(surface);

    expect(onSelectDate).not.toHaveBeenCalled();
  });
});
