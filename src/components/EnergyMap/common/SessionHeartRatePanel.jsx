import React, { useMemo, useState } from 'react';
import { Bluetooth, Download, Loader2, Watch } from 'lucide-react';
import { shallow } from 'zustand/shallow';
import { useEnergyMapStore } from '../../../store/useEnergyMapStore';
import { useAnimatedModal } from '../../../hooks/useAnimatedModal';
import {
  HeartRateSourceGlyph,
  HeartRateZoneBars,
  HeartRateZoneChip,
} from './HeartRateBadges';
import {
  describeHeartRateLoad,
  getHeartRateZone,
  resolveHeartRateProfile,
  resolveHeartRateZones,
} from '../../../utils/calculations/heartRate';
import {
  applyHeartRateSummary,
  applyWorkoutToCardioDraft,
  applyWorkoutToTrainingDraft,
} from '../../../utils/calculations/sessionHeartRate';
import { describeSessionHeartRateSource } from '../../../utils/formatting/heartRate';
import {
  HealthConnectStatus,
  getHealthSourceName,
} from '../../../constants/health/healthSources';
import { useHeartRateSyncState } from '../../../services/heartRateSync';
import { readSessionHeartRate } from '../../../services/heartRateHealth';
import { HealthWorkoutImportModal } from '../modals/lists/HealthWorkoutImportModal';

const MODAL_CLOSE_DELAY = 180;
const LOW_COVERAGE = 0.5;

/**
 * Heart-rate extras under a cardio / training form's average-HR button:
 * - zone chip ("Z3 · 68% HRR") from the HR profile AS OF the session's date,
 * - provenance (watch / sensor), peak, coverage and time-in-zone,
 * - "Use watch data": the session window's samples, one source, time-weighted,
 * - "Import workout": prefill from a workout the watch recorded,
 * - "Record live": hands off to the orchestrator's live-sensor recording.
 *
 * Favourite templates get the chip only (they have no real time window).
 */
export const SessionHeartRatePanel = ({
  kind,
  session,
  onChange,
  dateKey,
  window: sessionWindow,
  cardioTypes,
  isFavouriteMode = false,
  onRecordLive,
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
  const [status, setStatus] = useState({ state: 'idle', message: null });

  const {
    isOpen: isImportOpen,
    isClosing: isImportClosing,
    open: openImport,
    requestClose: requestImportClose,
  } = useAnimatedModal(false, MODAL_CLOSE_DELAY);

  const profile = useMemo(
    () => resolveHeartRateProfile(userData, dateKey),
    [userData, dateKey]
  );
  const zoneModel = useMemo(() => resolveHeartRateZones(profile), [profile]);
  const zone = getHeartRateZone(session?.averageHeartRate, zoneModel);
  const load = describeHeartRateLoad(session?.averageHeartRate, profile);

  const importedIds = useMemo(
    () =>
      new Set(
        [...(cardioSessions ?? []), ...(trainingSessions ?? [])]
          .map((item) => item?.healthWorkoutId)
          .filter(Boolean)
      ),
    [cardioSessions, trainingSessions]
  );

  const isSyncConnected = sync.status === HealthConnectStatus.CONNECTED;
  const sourceLabel = describeSessionHeartRateSource(session?.heartRateSource);
  const coverage = Number(session?.heartRateCoverage);

  const handleUseWatchData = async () => {
    if (!sessionWindow) {
      return;
    }
    // A session still in progress reads up to now; one in the future has
    // nothing to read yet.
    if (sessionWindow.startMs >= Date.now()) {
      setStatus({
        state: 'error',
        message: 'This session has not started yet — check its start time.',
      });
      return;
    }
    setStatus({ state: 'loading', message: null });
    const result = await readSessionHeartRate({
      start: sessionWindow.startMs,
      end: Math.min(sessionWindow.endMs, Date.now()),
      zoneModel,
    });
    if (!result) {
      setStatus({
        state: 'error',
        message: `No heart rate found in ${getHealthSourceName()} for this time.`,
      });
      return;
    }
    onChange?.(applyHeartRateSummary(session, result.summary, 'healthConnect'));
    const parts = [
      `Avg ${result.summary.average} · max ${result.summary.max} bpm`,
      result.source.sourceName,
      `${result.summary.sampleCount} samples`,
    ].filter(Boolean);
    setStatus({
      state:
        result.summary.coverage != null &&
        result.summary.coverage < LOW_COVERAGE
          ? 'warning'
          : 'done',
      message:
        result.summary.method === 'sparse'
          ? `${parts.join(' · ')}. Few readings in this window — the average is approximate.`
          : result.summary.coverage != null &&
              result.summary.coverage < LOW_COVERAGE
            ? `${parts.join(' · ')}. Watch data covers only ${Math.round(
                result.summary.coverage * 100
              )}% of this session.`
            : parts.join(' · '),
    });
  };

  const handleImport = async (workout) => {
    requestImportClose();
    setStatus({ state: 'loading', message: null });
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
    setStatus({
      state: 'done',
      message: heartRate
        ? `Imported · avg ${heartRate.summary.average} bpm`
        : 'Imported the time and duration — no heart rate was recorded with it.',
    });
  };

  return (
    <div className="mt-2 space-y-2">
      {(zone || load || sourceLabel) && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <HeartRateZoneChip zone={zone} load={load} />
          {sourceLabel && (
            <span className="inline-flex items-center gap-1">
              <HeartRateSourceGlyph source={session?.heartRateSource} />
              {sourceLabel}
            </span>
          )}
          {Number.isFinite(Number(session?.maxHeartRate)) && (
            <span>peak {session.maxHeartRate}</span>
          )}
          {Number.isFinite(coverage) && (
            <span>{Math.round(coverage * 100)}% covered</span>
          )}
        </div>
      )}
      <HeartRateZoneBars zoneSeconds={session?.heartRateZoneSeconds} />

      {!isFavouriteMode && (isSyncConnected || onRecordLive) && (
        <div className="flex flex-wrap gap-2">
          {isSyncConnected && (
            <button
              type="button"
              onClick={handleUseWatchData}
              disabled={!sessionWindow || status.state === 'loading'}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent-blue/15 px-3 py-2 text-xs font-medium text-accent-blue focus-ring pressable-inline disabled:opacity-50"
            >
              {status.state === 'loading' ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Watch size={14} />
              )}
              Use watch data
            </button>
          )}
          {isSyncConnected && (
            <button
              type="button"
              onClick={openImport}
              className="inline-flex items-center gap-1.5 rounded-lg bg-surface-highlight px-3 py-2 text-xs font-medium text-foreground focus-ring pressable-inline"
            >
              <Download size={14} />
              Import workout
            </button>
          )}
          {onRecordLive && (
            <button
              type="button"
              onClick={() => onRecordLive(kind)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-surface-highlight px-3 py-2 text-xs font-medium text-foreground focus-ring pressable-inline"
            >
              <Bluetooth size={14} />
              Record live
            </button>
          )}
        </div>
      )}

      {status.message && (
        <p
          aria-live="polite"
          className={`text-xs ${
            status.state === 'error' || status.state === 'warning'
              ? 'text-accent-orange'
              : 'text-muted'
          }`}
        >
          {status.message}
        </p>
      )}

      {(isImportOpen || isImportClosing) && (
        <HealthWorkoutImportModal
          isOpen={isImportOpen}
          isClosing={isImportClosing}
          dateKey={dateKey}
          kind={kind}
          importedIds={importedIds}
          onSelect={handleImport}
          onClose={requestImportClose}
        />
      )}
    </div>
  );
};
