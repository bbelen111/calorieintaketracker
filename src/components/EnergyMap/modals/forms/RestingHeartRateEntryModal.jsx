import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Save, Trash2, X } from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';
import { DateInput } from '../../common/DateInput';
import { HeartRatePicker } from '../pickers/HeartRatePickerModal';
import { getTodayDateKey } from '../../../../utils/data/dateKeys';
import {
  DEFAULT_RESTING_HEART_RATE_BPM,
  RESTING_HEART_RATE_MAX_BPM,
  RESTING_HEART_RATE_MIN_BPM,
  normalizeRestingHeartRate,
} from '../../../../constants/health/heartRate';
import { describeRestingHrMethod } from '../../../../utils/formatting/heartRate';
import {
  isCameraPulseSupported,
  measureRestingPulse,
} from '../../../../services/cameraPulse';

const CAMERA_HINTS = {
  starting: 'Starting the camera…',
  'no-finger': 'Cover the rear camera and flash completely with a fingertip.',
  measuring: 'Hold still and keep a light, steady touch.',
};

const CAMERA_FAILURES = {
  unsupported: 'Camera measurement is not available on this device.',
  permission: 'Camera permission was denied.',
  camera: 'Could not start the camera.',
  short: 'The reading was interrupted. Keep your finger in place.',
  quality:
    'The signal was too noisy to trust, so nothing was filled in. Try again holding still.',
};

const findEntryForDate = (entries, dateKey) =>
  (Array.isArray(entries) ? entries : []).find(
    (entry) => entry?.date === dateKey
  ) ?? null;

/** What the wheel should show for a day: its reading, else the default. */
const getEntryValue = (entry) =>
  normalizeRestingHeartRate(entry?.restingHr) ?? DEFAULT_RESTING_HEART_RATE_BPM;

/**
 * Morning resting heart rate (manual), for one date.
 *
 * Same shape as the weight / body fat entry modals: the wheel lives in the
 * modal and the date is a `DateInput`. A manual reading is never overwritten
 * by a synced one; "Clear" removes only the manual value (a watch's reading
 * for the day then shows again). Keyed by the orchestrator per open, so its
 * state is fresh each time.
 */
export const RestingHeartRateEntryModal = ({
  isOpen,
  isClosing,
  dateKey,
  entries = [],
  onSave,
  onClear,
  onCancel,
}) => {
  const todayKey = getTodayDateKey();
  const [date, setDate] = useState(dateKey ?? todayKey);
  const existingEntry = findEntryForDate(entries, date);
  const [value, setValue] = useState(
    getEntryValue(findEntryForDate(entries, dateKey ?? todayKey))
  );
  const [camera, setCamera] = useState({
    state: 'idle',
    message: null,
    progress: 0,
  });
  const measurementRef = useRef(null);

  const existingManual =
    existingEntry?.restingHrMethod === 'manual'
      ? existingEntry.restingHr
      : null;

  const stopCamera = useCallback(() => {
    measurementRef.current?.cancel();
    measurementRef.current = null;
  }, []);

  // Never leave the camera/torch running after the sheet goes away.
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
    }
  }, [isOpen, stopCamera]);
  useEffect(() => stopCamera, [stopCamera]);

  // Picking a day that already has a reading loads it; a day without one
  // keeps whatever the wheel shows.
  const handleDateChange = (nextDate) => {
    if (!nextDate) {
      return;
    }
    setDate(nextDate);
    const nextEntry = findEntryForDate(entries, nextDate);
    if (normalizeRestingHeartRate(nextEntry?.restingHr) != null) {
      setValue(getEntryValue(nextEntry));
    }
  };

  const handleCameraMeasure = async () => {
    stopCamera();
    setCamera({
      state: 'running',
      message: CAMERA_HINTS.starting,
      progress: 0,
    });
    const measurement = measureRestingPulse({
      onUpdate: ({ phase, progress, torch }) =>
        setCamera({
          state: 'running',
          message: `${CAMERA_HINTS[phase] ?? ''}${
            !torch && phase !== 'starting'
              ? ' (No flash available — use bright light.)'
              : ''
          }`,
          progress,
        }),
    });
    measurementRef.current = measurement;
    const outcome = await measurement.result;
    if (measurementRef.current !== measurement) {
      return;
    }
    measurementRef.current = null;
    if (outcome.reason === 'cancelled') {
      setCamera({ state: 'idle', message: null, progress: 0 });
      return;
    }
    const bpm = normalizeRestingHeartRate(outcome.bpm);
    if (bpm == null) {
      setCamera({
        state: 'failed',
        message: CAMERA_FAILURES[outcome.reason] ?? CAMERA_FAILURES.quality,
        progress: 0,
      });
      return;
    }
    setValue(bpm);
    setCamera({
      state: 'done',
      message: `Measured ${bpm} bpm (signal quality ${Math.round(
        outcome.quality * 100
      )}%). Check it looks right before saving.`,
      progress: 1,
    });
  };

  const normalizedValue = normalizeRestingHeartRate(value);
  const methodLabel = describeRestingHrMethod(existingEntry?.restingHrMethod);
  const isCameraRunning = camera.state === 'running';

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      onClose={onCancel}
      contentClassName="p-6 w-full max-w-lg"
    >
      <h3 className="text-foreground font-bold text-xl text-center mb-5">
        Resting Heart Rate
      </h3>

      <div className="space-y-4">
        <div
          className={isCameraRunning ? 'opacity-60 pointer-events-none' : ''}
        >
          <p className="text-muted text-xs text-center mb-2 uppercase tracking-wide">
            BPM
          </p>
          <HeartRatePicker
            value={value}
            onChange={(bpm) => setValue(bpm)}
            min={RESTING_HEART_RATE_MIN_BPM}
            max={RESTING_HEART_RATE_MAX_BPM}
            defaultValue={DEFAULT_RESTING_HEART_RATE_BPM}
          />
        </div>

        <div>
          <label className="text-muted text-sm block mb-2">Entry Date</label>
          <div className="relative">
            <DateInput
              value={date}
              onChange={handleDateChange}
              max={todayKey}
              className="w-full bg-surface-highlight text-foreground px-4 py-2 rounded-lg border border-border focus:outline-hidden focus-ring focus:border-accent-blue"
            />
          </div>
          {methodLabel && existingEntry?.restingHr != null && (
            <p className="text-muted text-xs mt-1">
              This day: current {existingEntry.restingHr} bpm ({methodLabel})
            </p>
          )}
        </div>

        {isCameraPulseSupported() && (
          <div className="rounded-lg border border-border bg-surface-highlight/40 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-foreground text-sm font-medium">
                  Measure with camera
                </p>
                <p className="text-muted text-[11px]">
                  Experimental · resting and still only
                </p>
              </div>
              {isCameraRunning ? (
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    setCamera({ state: 'idle', message: null, progress: 0 });
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-surface-highlight px-3 py-2 text-sm text-foreground focus-ring pressable-inline"
                >
                  <X size={16} /> Stop
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCameraMeasure}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent-blue/15 px-3 py-2 text-sm font-medium text-accent-blue focus-ring pressable-inline"
                >
                  <Camera size={16} /> Measure
                </button>
              )}
            </div>
            {camera.message && (
              <p
                className={`mt-2 text-xs ${
                  camera.state === 'failed'
                    ? 'text-accent-orange'
                    : 'text-muted'
                }`}
                aria-live="polite"
              >
                {camera.message}
              </p>
            )}
            {isCameraRunning && (
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-highlight">
                <div
                  className="h-full bg-accent-red transition-[width] duration-300"
                  style={{ width: `${Math.round(camera.progress * 100)}%` }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-3 mt-6">
        {existingManual != null && (
          <button
            type="button"
            onClick={() => onClear?.(date)}
            aria-label="Clear manual reading"
            className="px-4 py-3 rounded-lg bg-accent-red/15 text-accent-red focus-ring press-feedback"
          >
            <Trash2 size={20} />
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 bg-surface-highlight text-foreground px-6 py-3 rounded-lg font-medium focus-ring press-feedback"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={normalizedValue == null || isCameraRunning}
          onClick={() => onSave?.(date, normalizedValue)}
          className="flex-1 bg-primary text-primary-foreground px-6 py-3 rounded-lg flex items-center justify-center gap-2 font-medium focus-ring press-feedback disabled:opacity-60"
        >
          <Save size={20} />
          Save
        </button>
      </div>
    </ModalShell>
  );
};
