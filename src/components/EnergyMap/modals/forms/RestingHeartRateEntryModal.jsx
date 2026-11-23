import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { TrackerEntryModal } from '../../common/TrackerEntryModal';
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

const IDLE_CAMERA = { state: 'idle', message: null, progress: 0 };

const findEntryForDate = (entries, dateKey) =>
  (Array.isArray(entries) ? entries : []).find(
    (entry) => entry?.date === dateKey
  ) ?? null;

/**
 * Morning resting heart rate (manual), for one date.
 *
 * A thin wrapper over the shared `TrackerEntryModal`, exactly like the weight
 * and body fat entry modals: add/edit title, date locked while editing,
 * confirmed delete, error line and settle-relayed wheel drafts all come from
 * the shell, and the draft (`mode` / `date` / `bpm` / `error`) is owned by the
 * orchestrator. What is specific here: the wheel's bounds, the note about what
 * the day already holds (a watch reading is never overwritten — a manual one
 * is layered over it, and deleting the manual reading only removes that), and
 * the experimental camera measurement. Keyed by the orchestrator per open, so
 * the camera state is fresh each time.
 */
export const RestingHeartRateEntryModal = ({
  isOpen,
  isClosing,
  mode = 'add',
  date,
  bpm,
  entries = [],
  error,
  onDateChange,
  onBpmChange,
  onCancel,
  onSave,
  onDelete,
}) => {
  const [camera, setCamera] = useState(IDLE_CAMERA);
  const measurementRef = useRef(null);

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
      setCamera(IDLE_CAMERA);
      return;
    }
    const measured = normalizeRestingHeartRate(outcome.bpm);
    if (measured == null) {
      setCamera({
        state: 'failed',
        message: CAMERA_FAILURES[outcome.reason] ?? CAMERA_FAILURES.quality,
        progress: 0,
      });
      return;
    }
    onBpmChange?.(measured);
    setCamera({
      state: 'done',
      message: `Measured ${measured} bpm (signal quality ${Math.round(
        outcome.quality * 100
      )}%). Check it looks right before saving.`,
      progress: 1,
    });
  };

  const existingEntry = findEntryForDate(entries, date);
  const methodLabel = describeRestingHrMethod(existingEntry?.restingHrMethod);
  const isCameraRunning = camera.state === 'running';

  return (
    <TrackerEntryModal
      isOpen={isOpen}
      isClosing={isClosing}
      mode={mode}
      title={
        mode === 'edit' ? 'Edit Resting Heart Rate' : 'Add Resting Heart Rate'
      }
      unitLabel="BPM"
      value={bpm}
      onValueChange={onBpmChange}
      Picker={HeartRatePicker}
      pickerProps={{
        value: bpm,
        min: RESTING_HEART_RATE_MIN_BPM,
        max: RESTING_HEART_RATE_MAX_BPM,
        defaultValue: DEFAULT_RESTING_HEART_RATE_BPM,
      }}
      pickerLocked={isCameraRunning}
      date={date}
      onDateChange={onDateChange}
      dateMax={getTodayDateKey()}
      dateNote={
        methodLabel && existingEntry?.restingHr != null ? (
          <p className="text-muted text-xs mt-1">
            This day: current {existingEntry.restingHr} bpm ({methodLabel})
          </p>
        ) : null
      }
      error={error}
      deleteTitle="Delete resting heart rate?"
      deleteDescription="This removes your manual reading for the selected day. A watch reading, if there is one, will show again."
      saveDisabled={isCameraRunning}
      onCancel={onCancel}
      onSave={onSave}
      onDelete={onDelete}
    >
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
                  setCamera(IDLE_CAMERA);
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
                camera.state === 'failed' ? 'text-accent-orange' : 'text-muted'
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
    </TrackerEntryModal>
  );
};
