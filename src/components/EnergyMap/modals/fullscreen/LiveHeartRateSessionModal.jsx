import React, { useEffect, useMemo, useState } from 'react';
import {
  BatteryMedium,
  Bluetooth,
  ChevronLeft,
  HeartPulse,
  Loader2,
  Play,
  Square,
  Trash2,
} from 'lucide-react';
import { shallow } from 'zustand/shallow';
import { ModalShell } from '../../common/ModalShell';
import { HeartRateZoneBars } from '../../common/HeartRateBadges';
import { useEnergyMapStore } from '../../../../store/useEnergyMapStore';
import { useUnits } from '../../../../hooks/useUnits';
import {
  getHeartRateZone,
  resolveHeartRateZones,
} from '../../../../utils/calculations/heartRate';
import { calculateCaloriesPerMinuteFromHeartRate } from '../../../../utils/calculations/calculations';
import { formatElapsed } from '../../../../utils/formatting/heartRate';
import { HEART_RATE_ZONE_CLASSES } from '../../../../constants/health/heartRate';
import {
  cancelRecording,
  connectSensor,
  finishRecording,
  startRecording,
  useHeartRateSensorState,
} from '../../../../services/heartRateSensor';

const CONNECTION_COPY = {
  idle: 'Not connected',
  scanning: 'Scanning…',
  connecting: 'Connecting…',
  connected: 'Connected',
  reconnecting: 'Signal lost — reconnecting…',
  disconnected: 'Disconnected',
  error: 'Connection failed',
};

/**
 * Live heart-rate recording from a paired Bluetooth sensor (fullscreen, lazy).
 * The recording lives in services/heartRateSensor.js, so closing this view
 * (back / Escape) keeps it running; the header pill reopens it. "Finish"
 * hands a session summary to the orchestrator, which fills the cardio or
 * training form so the user saves it the normal way.
 */
export const LiveHeartRateSessionModal = ({
  isOpen,
  isClosing,
  kind = 'cardio',
  onClose,
  onFinish,
  onOpenPairing,
}) => {
  const { energy } = useUnits();
  const { userData, heartRateProfile } = useEnergyMapStore(
    (state) => ({
      userData: state.userData,
      heartRateProfile: state.heartRateProfile,
    }),
    shallow
  );
  const sensor = useHeartRateSensorState();
  const pairedSensor = userData?.heartRateSensor ?? null;
  const recording = sensor.recording;
  const recordingKind = recording?.kind ?? kind;
  const [now, setNow] = useState(() => Date.now());
  const [notice, setNotice] = useState(null);

  // Connect the paired sensor when the view opens.
  useEffect(() => {
    if (!isOpen || !pairedSensor?.deviceId) {
      return;
    }
    const { connection, deviceId } = sensor;
    const isLinked =
      deviceId === pairedSensor.deviceId &&
      (connection === 'connected' ||
        connection === 'connecting' ||
        connection === 'reconnecting');
    if (!isLinked) {
      connectSensor(pairedSensor);
    }
    // Only on open / sensor change: reconnection is the service's job.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, pairedSensor?.deviceId]);

  // Elapsed clock while recording.
  useEffect(() => {
    if (!recording || !isOpen) {
      return undefined;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [recording, isOpen]);

  const zoneModel = useMemo(
    () => resolveHeartRateZones(heartRateProfile),
    [heartRateProfile]
  );
  const currentZone = getHeartRateZone(sensor.currentBpm, zoneModel);
  const elapsedSeconds = recording
    ? Math.max(
        0,
        (Math.max(now, recording.startedAt) - recording.startedAt) / 1000
      )
    : 0;
  const averageBpm =
    recording && recording.coveredSeconds > 0
      ? Math.round(recording.areaBpmSeconds / recording.coveredSeconds)
      : null;
  const coverage =
    recording && elapsedSeconds > 0
      ? Math.min(1, recording.coveredSeconds / elapsedSeconds)
      : null;
  const liveKcal =
    recordingKind === 'cardio' && averageBpm != null
      ? Math.round(
          calculateCaloriesPerMinuteFromHeartRate({
            heartRate: averageBpm,
            weightKg: userData?.weight,
            ageYears: userData?.age,
            gender: userData?.gender,
            vo2Max: heartRateProfile?.vo2Max,
          }) *
            (elapsedSeconds / 60)
        )
      : null;

  const handleStart = () => {
    setNotice(null);
    setNow(Date.now());
    startRecording({ kind, zoneModel });
  };

  const handleFinish = () => {
    const summary = finishRecording();
    if (!summary) {
      setNotice(
        'Too short to save — record at least a minute with the sensor on.'
      );
      return;
    }
    onFinish?.(summary);
  };

  const handleDiscard = () => {
    cancelRecording();
    setNotice(null);
    onClose?.();
  };

  const isConnected = sensor.connection === 'connected';
  const zoneClasses = currentZone
    ? HEART_RATE_ZONE_CLASSES[currentZone.key]
    : null;

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      onClose={onClose}
      overlayClassName="fixed inset-0 bg-surface/70 p-0! flex-none! items-stretch! justify-stretch!"
      contentClassName="fixed inset-0 w-screen h-screen p-0 bg-background rounded-none border-none max-h-none! flex flex-col pt-[env(safe-area-inset-top)] keyboard-bottom-inset pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
    >
      <div className="flex items-center justify-between px-4 py-3 fullscreen-header bg-background border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onClose?.()}
            aria-label="Back"
            className="text-muted md:hover:text-foreground transition-all pressable-inline focus-ring"
          >
            <ChevronLeft size={24} />
          </button>
          <h3 className="text-foreground font-bold text-xl">
            {recordingKind === 'training' ? 'Live training' : 'Live cardio'}
          </h3>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted">
          <Bluetooth
            size={14}
            className={isConnected ? 'text-accent-blue' : ''}
          />
          {CONNECTION_COPY[sensor.connection] ?? ''}
          {sensor.battery != null && (
            <span className="inline-flex items-center gap-0.5">
              <BatteryMedium size={14} /> {sensor.battery}%
            </span>
          )}
        </span>
      </div>

      <div className="flex-1 fullscreen-body bg-surface border-t border-border overflow-y-auto flex flex-col items-center px-4 py-6 gap-6">
        {!pairedSensor ? (
          <div className="mt-10 flex flex-col items-center gap-3 text-center">
            <Bluetooth size={36} className="text-muted" />
            <p className="text-foreground font-semibold">No sensor paired</p>
            <p className="text-muted text-sm max-w-xs">
              Pair a Bluetooth chest strap, arm band or a watch in heart-rate
              broadcast mode.
            </p>
            <button
              type="button"
              onClick={() => onOpenPairing?.()}
              className="mt-2 rounded-lg bg-primary px-5 py-3 font-medium text-primary-foreground focus-ring press-feedback"
            >
              Pair a sensor
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center">
              <div
                className={`flex h-48 w-48 flex-col items-center justify-center rounded-full border-4 ${
                  zoneClasses
                    ? `${zoneClasses.soft} border-current ${zoneClasses.text}`
                    : 'border-border text-muted'
                }`}
              >
                <HeartPulse size={28} />
                <span className="mt-1 text-6xl font-bold text-foreground tabular-nums leading-none">
                  {sensor.currentBpm ?? '—'}
                </span>
                <span className="text-sm text-muted">bpm</span>
              </div>
              <p className="mt-3 text-sm font-semibold text-foreground">
                {currentZone
                  ? `${currentZone.label} · ${currentZone.name}`
                  : 'Below Zone 1'}
              </p>
              {sensor.contactDetected === false && (
                <p className="mt-1 text-xs text-accent-orange">
                  No skin contact — moisten the strap&apos;s electrodes.
                </p>
              )}
              <p className="mt-1 text-xs text-muted">{pairedSensor.name}</p>
            </div>

            {recording ? (
              <div className="grid w-full max-w-md grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-muted text-[11px] uppercase tracking-wide">
                    Elapsed
                  </p>
                  <p className="text-foreground text-xl font-bold tabular-nums">
                    {formatElapsed(elapsedSeconds)}
                  </p>
                </div>
                <div>
                  <p className="text-muted text-[11px] uppercase tracking-wide">
                    Avg
                  </p>
                  <p className="text-foreground text-xl font-bold">
                    {averageBpm ?? '—'}
                  </p>
                </div>
                <div>
                  <p className="text-muted text-[11px] uppercase tracking-wide">
                    {liveKcal != null ? energy.unit : 'Peak'}
                  </p>
                  <p className="text-foreground text-xl font-bold">
                    {liveKcal != null
                      ? energy.value(liveKcal, { grouping: false })
                      : (recording.maxBpm ?? '—')}
                  </p>
                </div>
              </div>
            ) : null}

            {recording && (
              <div className="w-full max-w-md space-y-1.5">
                <HeartRateZoneBars zoneSeconds={recording.zoneSeconds} />
                {coverage != null && coverage < 0.9 && elapsedSeconds > 60 && (
                  <p className="text-xs text-muted">
                    Signal covered {Math.round(coverage * 100)}% of the session
                    — gaps are left out of the average.
                  </p>
                )}
              </div>
            )}

            {sensor.error && (
              <p className="text-sm text-accent-orange text-center max-w-xs">
                {sensor.error}
              </p>
            )}
            {notice && (
              <p className="text-sm text-accent-orange text-center max-w-xs">
                {notice}
              </p>
            )}

            <div className="mt-auto flex w-full max-w-md flex-col gap-3">
              {recording ? (
                <>
                  <button
                    type="button"
                    onClick={handleFinish}
                    className="flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-4 text-lg font-semibold text-primary-foreground focus-ring press-feedback"
                  >
                    <Square size={20} /> Finish &amp; review
                  </button>
                  <button
                    type="button"
                    onClick={handleDiscard}
                    className="flex items-center justify-center gap-2 rounded-lg bg-accent-red/15 px-6 py-3 font-medium text-accent-red focus-ring press-feedback"
                  >
                    <Trash2 size={18} /> Discard recording
                  </button>
                  <p className="text-center text-xs text-muted">
                    Keep the app open — the screen stays on while recording.
                  </p>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleStart}
                    disabled={!isConnected}
                    className="flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-4 text-lg font-semibold text-primary-foreground focus-ring press-feedback disabled:opacity-60"
                  >
                    {isConnected ? (
                      <Play size={20} />
                    ) : (
                      <Loader2 size={20} className="animate-spin" />
                    )}
                    Start recording
                  </button>
                  {!isConnected && sensor.connection !== 'connecting' && (
                    <button
                      type="button"
                      onClick={() => connectSensor(pairedSensor)}
                      className="rounded-lg bg-surface-highlight px-6 py-3 font-medium text-foreground focus-ring pressable-inline"
                    >
                      Reconnect
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onOpenPairing?.()}
                    className="text-sm text-accent-blue focus-ring rounded px-2 py-1 pressable-inline"
                  >
                    Use a different sensor
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </ModalShell>
  );
};

export default LiveHeartRateSessionModal;
