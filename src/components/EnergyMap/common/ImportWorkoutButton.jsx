import React, { useMemo, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { shallow } from 'zustand/shallow';
import { useEnergyMapStore } from '../../../store/useEnergyMapStore';
import { useAnimatedModal } from '../../../hooks/useAnimatedModal';
import {
  resolveHeartRateProfile,
  resolveHeartRateZones,
} from '../../../utils/calculations/heartRate';
import {
  applyWorkoutToCardioDraft,
  applyWorkoutToTrainingDraft,
} from '../../../utils/calculations/sessionHeartRate';
import { HealthConnectStatus } from '../../../constants/health/healthSources';
import { isHeartRateTrackingEnabled } from '../../../constants/health/heartRate';
import { useHeartRateSyncState } from '../../../services/heartRateSync';
import { readSessionHeartRate } from '../../../services/heartRateHealth';
import { HealthWorkoutImportModal } from '../modals/lists/HealthWorkoutImportModal';

const MODAL_CLOSE_DELAY = 180;

/**
 * "Import" button for the cardio / training form headers (it sits next to
 * Favourites). Sessions stay manual: this only PREFILLS the draft (type, start
 * time, duration and, when the watch recorded one, the average heart rate)
 * from a workout the user picks, and the user still reviews and saves it.
 *
 * Renders nothing unless heart-rate tracking is on and its sync is connected.
 * `onNote` receives a one-line result message for the form to show under its
 * header.
 */
export const ImportWorkoutButton = ({
  kind,
  session,
  onChange,
  dateKey,
  cardioTypes,
  onNote,
}) => {
  const { userData, cardioSessions, trainingSessions } = useEnergyMapStore(
    (state) => ({
      userData: state.userData,
      cardioSessions: state.userData?.cardioSessions,
      trainingSessions: state.userData?.trainingSessions,
    }),
    shallow
  );
  const sync = useHeartRateSyncState();
  const [isImporting, setIsImporting] = useState(false);

  const {
    isOpen: isListOpen,
    isClosing: isListClosing,
    open: openList,
    requestClose: closeList,
  } = useAnimatedModal(false, MODAL_CLOSE_DELAY);

  // Workouts already imported (by platform id) are greyed out in the list.
  const importedIds = useMemo(
    () =>
      new Set(
        [...(cardioSessions ?? []), ...(trainingSessions ?? [])]
          .map((item) => item?.healthWorkoutId)
          .filter(Boolean)
      ),
    [cardioSessions, trainingSessions]
  );

  if (
    !isHeartRateTrackingEnabled(userData) ||
    sync.status !== HealthConnectStatus.CONNECTED
  ) {
    return null;
  }

  const handleSelect = async (workout) => {
    closeList();
    setIsImporting(true);
    onNote?.(null);
    try {
      const zoneModel = resolveHeartRateZones(
        resolveHeartRateProfile(userData, dateKey)
      );
      const heartRate = await readSessionHeartRate({
        start: workout.startMs,
        end: workout.endMs,
        preferredSourceId: workout.sourceId,
        zoneModel,
      });
      onChange?.(
        kind === 'training'
          ? applyWorkoutToTrainingDraft(session, workout, heartRate)
          : applyWorkoutToCardioDraft(session, workout, heartRate, cardioTypes)
      );
      onNote?.(
        heartRate
          ? `Imported · avg ${heartRate.summary.average} bpm. Review it, then save.`
          : 'Imported the time and duration — no heart rate was recorded with it.'
      );
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openList}
        disabled={isImporting}
        aria-label="Import workout from watch"
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-highlight px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-foreground transition-colors press-feedback focus-ring md:hover:border-accent-blue disabled:opacity-60"
      >
        {isImporting ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Download size={14} />
        )}
        Import
      </button>

      {(isListOpen || isListClosing) && (
        <HealthWorkoutImportModal
          isOpen={isListOpen}
          isClosing={isListClosing}
          dateKey={dateKey}
          kind={kind}
          importedIds={importedIds}
          onSelect={handleSelect}
          onClose={closeList}
        />
      )}
    </>
  );
};
