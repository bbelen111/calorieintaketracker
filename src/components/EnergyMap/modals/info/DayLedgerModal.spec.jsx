import React from 'react';
import { render, screen } from '@testing-library/react';
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
    // Measurement + provenance
    expect(screen.getByText('74 kg')).toBeInTheDocument();
    expect(screen.getByText('Health store')).toBeInTheDocument();
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

    await user.click(
      screen.getByRole('button', { name: /Tap to open full breakdown/i })
    );
    expect(onOpenBreakdown).toHaveBeenCalledWith(SNAP_DATE);
  });

  it('swaps the body-fat tile for a sessions tile when tracking is off', () => {
    renderModal({ bodyFatTrackingEnabled: false });

    expect(screen.queryByText('Body Fat')).not.toBeInTheDocument();
    // 296 + 344 = 640
    expect(screen.getByText('640 kcal')).toBeInTheDocument();
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
});
