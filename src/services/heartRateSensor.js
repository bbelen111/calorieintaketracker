/**
 * Live Bluetooth LE heart-rate sensor (standard Heart Rate Service 0x180D):
 * chest straps, arm bands and watches in "broadcast HR" mode.
 *
 * A module singleton, NOT component state: closing the recording modal (or
 * the form under it) never stops a recording, and the header pill can show it
 * from anywhere. React reads it through `useHeartRateSensorState()`.
 *
 * Contracts:
 * - `@capacitor-community/bluetooth-le` and `@capacitor-community/keep-awake`
 *   are imported DYNAMICALLY, only when the user pairs/records, so neither
 *   enters the boot-critical bundle (see vite.config.js chunk rules).
 * - Recording math is time-weighted between consecutive notifications; a gap
 *   longer than RECORDING_MAX_GAP_SECONDS (signal lost, app backgrounded) is
 *   excluded, never interpolated, and shows up as reduced coverage.
 * - A checkpoint is written to Preferences every CHECKPOINT_INTERVAL_MS so an
 *   app kill mid-session can be recovered on the next launch.
 * - v1 is foreground-only: the screen is kept awake while recording.
 */
import { useSyncExternalStore } from 'react';
import { Preferences } from '@capacitor/preferences';
import {
  getHeartRateZone,
  parseHeartRateMeasurement,
} from '../utils/calculations/heartRate.js';
import { isNative } from '../utils/platform.js';

const HEART_RATE_SERVICE = '0000180d-0000-1000-8000-00805f9b34fb';
const HEART_RATE_MEASUREMENT = '00002a37-0000-1000-8000-00805f9b34fb';
const BATTERY_SERVICE = '0000180f-0000-1000-8000-00805f9b34fb';
const BATTERY_LEVEL = '00002a19-0000-1000-8000-00805f9b34fb';

export const RECORDING_MAX_GAP_SECONDS = 10;
export const SCAN_DURATION_MS = 15_000;
export const CHECKPOINT_INTERVAL_MS = 30_000;
export const RECONNECT_ATTEMPTS = 6;
export const RECONNECT_DELAY_MS = 5_000;
export const CHECKPOINT_KEY = 'energyMapLiveHeartRateRecording';
const MIN_RECORDING_SECONDS = 60;
const PLAUSIBLE_MIN_BPM = 25;
const PLAUSIBLE_MAX_BPM = 240;

const loadBle = () => import('@capacitor-community/bluetooth-le');
const loadKeepAwake = () => import('@capacitor-community/keep-awake');

const INITIAL_STATE = Object.freeze({
  connection: 'idle', // idle | scanning | connecting | connected | reconnecting | disconnected | error
  error: null,
  deviceId: null,
  deviceName: null,
  battery: null,
  currentBpm: null,
  contactDetected: null,
  lastSampleAt: null,
  scanResults: [],
  recording: null,
});

let state = INITIAL_STATE;
const listeners = new Set();
let isBleInitialized = false;
let scanTimer = null;
let checkpointTimer = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
let intentionalDisconnect = false;
let recordingZoneModel = null;

const setState = (patch) => {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
};

export const getHeartRateSensorState = () => state;
export const subscribeHeartRateSensor = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const useHeartRateSensorState = () =>
  useSyncExternalStore(
    subscribeHeartRateSensor,
    getHeartRateSensorState,
    getHeartRateSensorState
  );

const describeError = (error, fallback) => {
  const message = String(error?.message ?? error ?? '').trim();
  if (/disabled|not enabled|powered off/i.test(message)) {
    return 'Bluetooth is off. Turn it on and try again.';
  }
  if (/permission|denied|not allowed|unauthori/i.test(message)) {
    return 'Bluetooth permission was denied.';
  }
  return message ? `${fallback} (${message})` : fallback;
};

const ensureBle = async () => {
  const { BleClient } = await loadBle();
  if (!isBleInitialized) {
    await BleClient.initialize({ androidNeverForLocation: true });
    isBleInitialized = true;
  }
  return BleClient;
};

// ---------------------------------------------------------------------------
// Recording accumulator (pure; exported for tests)
// ---------------------------------------------------------------------------

/** A fresh recording accumulator. */
export const createRecording = ({ kind, startedAt, zoneCount = 5 }) => ({
  kind,
  startedAt,
  sampleCount: 0,
  areaBpmSeconds: 0,
  coveredSeconds: 0,
  minBpm: null,
  maxBpm: null,
  zoneSeconds: Array.from({ length: zoneCount }, () => 0),
  lastSample: null,
});

/**
 * Folds one notification into a recording. Consecutive samples closer than
 * RECORDING_MAX_GAP_SECONDS add a trapezoid; longer gaps are skipped.
 */
export const addRecordingSample = (recording, { timeMs, bpm }, zoneModel) => {
  if (
    !recording ||
    !Number.isFinite(timeMs) ||
    !Number.isFinite(bpm) ||
    bpm < PLAUSIBLE_MIN_BPM ||
    bpm > PLAUSIBLE_MAX_BPM
  ) {
    return recording;
  }
  const next = {
    ...recording,
    sampleCount: recording.sampleCount + 1,
    minBpm: recording.minBpm == null ? bpm : Math.min(recording.minBpm, bpm),
    maxBpm: recording.maxBpm == null ? bpm : Math.max(recording.maxBpm, bpm),
    lastSample: { timeMs, bpm },
  };
  const previous = recording.lastSample;
  if (previous) {
    const dt = (timeMs - previous.timeMs) / 1000;
    if (dt > 0 && dt <= RECORDING_MAX_GAP_SECONDS) {
      const meanBpm = (previous.bpm + bpm) / 2;
      next.areaBpmSeconds = recording.areaBpmSeconds + meanBpm * dt;
      next.coveredSeconds = recording.coveredSeconds + dt;
      const zone = getHeartRateZone(meanBpm, zoneModel);
      if (zone) {
        next.zoneSeconds = recording.zoneSeconds.map((seconds, index) =>
          index === zone.index - 1 ? seconds + dt : seconds
        );
      }
    }
  }
  return next;
};

const formatTimeOfDay = (epochMs) => {
  const date = new Date(epochMs);
  return `${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes()
  ).padStart(2, '0')}`;
};

/**
 * Session summary for the cardio / training draft, or `null` when the
 * recording is too short or holds no covered time.
 */
export const summarizeRecording = (recording, endedAt) => {
  if (!recording || !Number.isFinite(endedAt)) {
    return null;
  }
  const elapsedSeconds = (endedAt - recording.startedAt) / 1000;
  if (elapsedSeconds < MIN_RECORDING_SECONDS || recording.coveredSeconds <= 0) {
    return null;
  }
  return {
    kind: recording.kind,
    startedAt: recording.startedAt,
    endedAt,
    startTime: formatTimeOfDay(recording.startedAt),
    durationMinutes: Math.max(1, Math.round(elapsedSeconds / 60)),
    averageHeartRate: Math.round(
      recording.areaBpmSeconds / recording.coveredSeconds
    ),
    maxHeartRate: recording.maxBpm,
    minHeartRate: recording.minBpm,
    coverage: Math.min(
      1,
      Math.round((recording.coveredSeconds / elapsedSeconds) * 100) / 100
    ),
    zoneSeconds: recording.zoneSeconds.map((seconds) => Math.round(seconds)),
    sampleCount: recording.sampleCount,
  };
};

// ---------------------------------------------------------------------------
// Checkpointing
// ---------------------------------------------------------------------------

const writeCheckpoint = async () => {
  const { recording, deviceId, deviceName } = state;
  if (!recording) {
    return;
  }
  try {
    await Preferences.set({
      key: CHECKPOINT_KEY,
      value: JSON.stringify({
        recording: { ...recording, lastSample: recording.lastSample },
        deviceId,
        deviceName,
        savedAt: Date.now(),
      }),
    });
  } catch (error) {
    console.warn('[HeartRateSensor] Checkpoint failed:', error);
  }
};

const clearCheckpoint = async () => {
  try {
    await Preferences.remove({ key: CHECKPOINT_KEY });
  } catch {
    // Nothing to recover from; a stale checkpoint is discarded on read.
  }
};

/**
 * A recording interrupted by an app kill, as a session summary ending at the
 * last checkpoint, or `null`. Call once on launch; `discardInterruptedRecording`
 * after the user decides.
 */
export const readInterruptedRecording = async () => {
  try {
    const { value } = await Preferences.get({ key: CHECKPOINT_KEY });
    if (!value) {
      return null;
    }
    const parsed = JSON.parse(value);
    const recording = parsed?.recording;
    const endedAt = Number(recording?.lastSample?.timeMs ?? parsed?.savedAt);
    const summary = summarizeRecording(recording, endedAt);
    if (!summary) {
      await clearCheckpoint();
      return null;
    }
    return { ...summary, deviceName: parsed?.deviceName ?? null };
  } catch {
    await clearCheckpoint();
    return null;
  }
};

export const discardInterruptedRecording = () => clearCheckpoint();

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

const handleMeasurement = (dataView) => {
  const parsed = parseHeartRateMeasurement(dataView);
  if (!parsed) {
    return;
  }
  const timeMs = Date.now();
  const patch = {
    currentBpm: parsed.bpm,
    contactDetected: parsed.contactDetected,
    lastSampleAt: timeMs,
  };
  // Some straps report "no skin contact" with a stale bpm; never record it.
  if (state.recording && parsed.contactDetected !== false) {
    patch.recording = addRecordingSample(
      state.recording,
      { timeMs, bpm: parsed.bpm },
      recordingZoneModel
    );
  }
  setState(patch);
};

const subscribeMeasurements = async (BleClient, deviceId) => {
  await BleClient.startNotifications(
    deviceId,
    HEART_RATE_SERVICE,
    HEART_RATE_MEASUREMENT,
    handleMeasurement
  );
  try {
    const battery = await BleClient.read(
      deviceId,
      BATTERY_SERVICE,
      BATTERY_LEVEL
    );
    setState({ battery: battery.getUint8(0) });
  } catch {
    setState({ battery: null });
  }
};

const scheduleReconnect = () => {
  clearTimeout(reconnectTimer);
  if (reconnectAttempts >= RECONNECT_ATTEMPTS || !state.deviceId) {
    setState({
      connection: 'disconnected',
      error: 'Lost the sensor. Check it is on and nearby.',
    });
    return;
  }
  reconnectAttempts += 1;
  setState({ connection: 'reconnecting' });
  reconnectTimer = setTimeout(async () => {
    try {
      await connectToDevice({
        deviceId: state.deviceId,
        name: state.deviceName,
      });
    } catch {
      scheduleReconnect();
    }
  }, RECONNECT_DELAY_MS);
};

const handleDisconnect = () => {
  if (intentionalDisconnect) {
    return;
  }
  setState({ currentBpm: null });
  // Mid-recording drops reconnect automatically; the gap is excluded.
  if (state.recording) {
    scheduleReconnect();
  } else {
    setState({ connection: 'disconnected' });
  }
};

const connectToDevice = async ({ deviceId, name }) => {
  const BleClient = await ensureBle();
  intentionalDisconnect = false;
  await BleClient.connect(deviceId, handleDisconnect, { timeout: 10_000 });
  await subscribeMeasurements(BleClient, deviceId);
  reconnectAttempts = 0;
  setState({
    connection: 'connected',
    error: null,
    deviceId,
    deviceName: name ?? state.deviceName ?? 'Heart rate sensor',
  });
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Scans for HR sensors for SCAN_DURATION_MS (native) or opens the browser picker (web dev). */
export const startSensorScan = async () => {
  setState({ connection: 'scanning', error: null, scanResults: [] });
  try {
    const BleClient = await ensureBle();
    if (!isNative()) {
      const device = await BleClient.requestDevice({
        services: [HEART_RATE_SERVICE],
      });
      setState({
        connection: 'idle',
        scanResults: [
          {
            deviceId: device.deviceId,
            name: device.name ?? 'Heart rate sensor',
            rssi: null,
          },
        ],
      });
      return;
    }
    await BleClient.requestLEScan(
      { services: [HEART_RATE_SERVICE] },
      (result) => {
        const deviceId = result?.device?.deviceId;
        if (!deviceId) {
          return;
        }
        const entry = {
          deviceId,
          name: result.localName ?? result.device.name ?? 'Heart rate sensor',
          rssi: Number.isFinite(result.rssi) ? result.rssi : null,
        };
        const others = state.scanResults.filter(
          (item) => item.deviceId !== deviceId
        );
        setState({ scanResults: [...others, entry] });
      }
    );
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      stopSensorScan();
    }, SCAN_DURATION_MS);
  } catch (error) {
    setState({
      connection: 'error',
      error: describeError(error, 'Could not scan for sensors.'),
    });
  }
};

export const stopSensorScan = async () => {
  clearTimeout(scanTimer);
  if (state.connection === 'scanning') {
    setState({ connection: state.deviceId ? 'disconnected' : 'idle' });
  }
  if (!isNative()) {
    return;
  }
  try {
    const { BleClient } = await loadBle();
    await BleClient.stopLEScan();
  } catch {
    // Scan already stopped.
  }
};

/** Connects to a sensor (the paired one, or one picked from the scan list). */
export const connectSensor = async ({ deviceId, name }) => {
  if (!deviceId) {
    return false;
  }
  await stopSensorScan();
  setState({
    connection: 'connecting',
    error: null,
    deviceId,
    deviceName: name,
  });
  try {
    await connectToDevice({ deviceId, name });
    return true;
  } catch (error) {
    setState({
      connection: 'error',
      error: describeError(error, 'Could not connect to the sensor.'),
    });
    return false;
  }
};

export const disconnectSensor = async () => {
  intentionalDisconnect = true;
  clearTimeout(reconnectTimer);
  const { deviceId } = state;
  setState({ connection: 'idle', currentBpm: null, battery: null });
  if (!deviceId) {
    return;
  }
  try {
    const { BleClient } = await loadBle();
    await BleClient.disconnect(deviceId);
  } catch {
    // Already disconnected.
  }
};

const setKeepAwake = async (enabled) => {
  try {
    const { KeepAwake } = await loadKeepAwake();
    if (enabled) {
      await KeepAwake.keepAwake();
    } else {
      await KeepAwake.allowSleep();
    }
  } catch (error) {
    console.warn('[HeartRateSensor] Keep-awake failed:', error);
  }
};

/**
 * Starts recording a `cardio` or `training` session from the connected
 * sensor. `zoneModel` (from the user's HR profile) prices time-in-zone.
 */
export const startRecording = ({ kind, zoneModel = null }) => {
  if (state.connection !== 'connected' || state.recording) {
    return false;
  }
  recordingZoneModel = zoneModel;
  setState({ recording: createRecording({ kind, startedAt: Date.now() }) });
  setKeepAwake(true);
  clearInterval(checkpointTimer);
  checkpointTimer = setInterval(writeCheckpoint, CHECKPOINT_INTERVAL_MS);
  return true;
};

/** Stops the recording and returns its session summary (or null if too short). */
export const finishRecording = () => {
  const summary = summarizeRecording(state.recording, Date.now());
  clearInterval(checkpointTimer);
  recordingZoneModel = null;
  setState({ recording: null });
  setKeepAwake(false);
  clearCheckpoint();
  return summary;
};

export const cancelRecording = () => {
  clearInterval(checkpointTimer);
  recordingZoneModel = null;
  setState({ recording: null });
  setKeepAwake(false);
  clearCheckpoint();
};

/** Test seam. */
export const resetHeartRateSensorState = () => {
  clearTimeout(scanTimer);
  clearInterval(checkpointTimer);
  clearTimeout(reconnectTimer);
  reconnectAttempts = 0;
  intentionalDisconnect = false;
  recordingZoneModel = null;
  isBleInitialized = false;
  state = INITIAL_STATE;
  listeners.forEach((listener) => listener());
};
