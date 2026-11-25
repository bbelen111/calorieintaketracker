import React, { useEffect, useState } from 'react';
import { CheckCircle2, Dumbbell, Loader2, Watch } from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';
import { readWorkoutsForDate } from '../../../../services/heartRateHealth';
import { formatWorkoutTypeLabel } from '../../../../constants/health/workoutTypeMap';
import { isStrengthWorkout } from '../../../../utils/calculations/sessionHeartRate';
import { getHealthSourceName } from '../../../../constants/health/healthSources';
import { formatDateLabel } from '../../../../utils/measurements/weight';
import { useUnits } from '../../../../hooks/useUnits';

const formatClock = (epochMs) =>
  new Date(epochMs).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

/**
 * Workouts the watch recorded on a day, to prefill a cardio / training draft.
 * Mounted only while open (`isOpen || isClosing` in the parent), so each open
 * starts a fresh read. The watch's own calorie figure is shown for reference
 * only — the app always prices sessions with its own formulas.
 */
export const HealthWorkoutImportModal = ({
  isOpen,
  isClosing,
  dateKey,
  kind,
  importedIds,
  onSelect,
  onClose,
}) => {
  const units = useUnits();
  const [state, setState] = useState({ status: 'loading', workouts: [] });

  useEffect(() => {
    let cancelled = false;
    readWorkoutsForDate(dateKey).then((workouts) => {
      if (!cancelled) {
        setState(
          workouts == null
            ? { status: 'error', workouts: [] }
            : { status: 'ready', workouts }
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [dateKey]);

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      onClose={onClose}
      contentClassName="w-full md:max-w-md p-6"
    >
      <h3 className="text-foreground font-bold text-xl">Import from watch</h3>
      <p className="text-muted text-sm mb-4">
        {getHealthSourceName()} ·{' '}
        {formatDateLabel(dateKey, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        })}
      </p>

      {state.status === 'loading' && (
        <div className="flex items-center justify-center gap-2 py-8 text-muted text-sm">
          <Loader2 size={18} className="animate-spin" /> Reading workouts…
        </div>
      )}
      {state.status === 'error' && (
        <p className="py-6 text-center text-sm text-accent-orange">
          Could not read workouts. Check the workout permission in{' '}
          {getHealthSourceName()}.
        </p>
      )}
      {state.status === 'ready' && state.workouts.length === 0 && (
        <p className="py-6 text-center text-sm text-muted">
          No workouts recorded on this day.
        </p>
      )}

      {state.status === 'ready' && state.workouts.length > 0 && (
        <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
          {state.workouts.map((workout) => {
            const alreadyImported = importedIds?.has(workout.id);
            const strength = isStrengthWorkout(workout.workoutType);
            const mismatch =
              (kind === 'cardio' && strength) ||
              (kind === 'training' && !strength);
            return (
              <li key={workout.id}>
                <button
                  type="button"
                  disabled={alreadyImported}
                  onClick={() => onSelect?.(workout)}
                  className="w-full rounded-lg border border-border bg-surface-highlight/50 p-3 text-left pressable-card focus-ring disabled:opacity-50"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 font-semibold text-foreground">
                      {strength ? (
                        <Dumbbell size={16} className="text-accent-blue" />
                      ) : (
                        <Watch size={16} className="text-accent-blue" />
                      )}
                      {formatWorkoutTypeLabel(workout.workoutType)}
                    </span>
                    {alreadyImported && (
                      <span className="inline-flex items-center gap-1 text-xs text-accent-green">
                        <CheckCircle2 size={14} /> Imported
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {formatClock(workout.startMs)} · {workout.durationMinutes}{' '}
                    min
                    {workout.totalEnergyBurned != null &&
                      ` · watch says ${
                        units.energy.isKj
                          ? units.energy.format(workout.totalEnergyBurned)
                          : `${workout.totalEnergyBurned} ${units.energy.unit}`
                      }`}
                    {workout.sourceName && ` · ${workout.sourceName}`}
                  </p>
                  {mismatch && !alreadyImported && (
                    <p className="mt-1 text-[11px] text-accent-amber">
                      {kind === 'cardio'
                        ? 'Looks like strength work — usually logged as Training.'
                        : 'Looks like cardio — usually logged as Cardio.'}
                    </p>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        onClick={onClose}
        className="mt-5 w-full bg-surface-highlight text-foreground px-6 py-3 rounded-lg font-medium focus-ring press-feedback"
      >
        Close
      </button>
    </ModalShell>
  );
};
