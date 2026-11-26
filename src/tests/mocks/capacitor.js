/**
 * Capacitor plugin doubles for the Vitest (jsdom) UI tier.
 *
 * Every mock mirrors only the API surface the app actually calls (verified via
 * grep against `src/**`), so a plugin call that is not covered here will fail
 * loudly instead of silently returning `undefined`.
 *
 * Registration happens in `src/tests/setup.js`; specs import the exported mock
 * objects to assert calls or override behaviour per test.
 */
import { vi } from 'vitest';

/**
 * In-memory `@capacitor/preferences` implementation.
 * Uses the public API surface only, so specs can seed state with
 * `await PreferencesMock.set({ key, value })`.
 */
export const createMemoryPreferences = () => {
  const store = new Map();
  return {
    get: vi.fn(async ({ key }) => ({
      value: store.has(key) ? store.get(key) : null,
    })),
    set: vi.fn(async ({ key, value }) => {
      store.set(key, value);
    }),
    remove: vi.fn(async ({ key }) => {
      store.delete(key);
    }),
    clear: vi.fn(async () => {
      store.clear();
    }),
    keys: vi.fn(async () => ({ keys: Array.from(store.keys()) })),
    configure: vi.fn(async () => {}),
  };
};

export const CapacitorMock = {
  isNativePlatform: vi.fn(() => false),
  getPlatform: vi.fn(() => 'web'),
  isPluginAvailable: vi.fn(() => true),
  convertFileSrc: vi.fn((path) => path),
};

export const PreferencesMock = createMemoryPreferences();

export const AppMock = {
  addListener: vi.fn(async () => ({
    remove: vi.fn(async () => {}),
  })),
  exitApp: vi.fn(async () => {}),
  getState: vi.fn(async () => ({ isActive: true })),
};

export const StatusBarMock = {
  setStyle: vi.fn(async () => {}),
  setBackgroundColor: vi.fn(async () => {}),
  setOverlaysWebView: vi.fn(async () => {}),
  show: vi.fn(async () => {}),
  hide: vi.fn(async () => {}),
};

export const KeyboardMock = {
  setStyle: vi.fn(async () => {}),
  // Called from `main.jsx` inside `if (isIOS())`; the resize mode itself lives in
  // capacitor.config.json and these only keep a long-lived session honest.
  setResizeMode: vi.fn(async () => {}),
  setScroll: vi.fn(async () => {}),
  show: vi.fn(async () => {}),
  hide: vi.fn(async () => {}),
  // Mirrors AppMock: the keyboard hook only registers `keyboardDidShow` /
  // `keyboardDidHide` and stores the handle to remove it again, so specs read the
  // registered callback straight off `addListener.mock.calls`.
  addListener: vi.fn(async () => ({
    remove: vi.fn(async () => {}),
  })),
};

export const NavigationBarMock = {
  setColor: vi.fn(async () => {}),
  setTransparency: vi.fn(async () => {}),
  setStyle: vi.fn(async () => {}),
};

export const SplashScreenMock = {
  hide: vi.fn(async () => {}),
  show: vi.fn(async () => {}),
};

export const BarcodeScannerMock = {
  CapacitorBarcodeScanner: {
    scanBarcode: vi.fn(async () => ({ ScanResult: '' })),
  },
  CapacitorBarcodeScannerAndroidScanningLibrary: {
    ZXing: 'zxing',
    MLKIT: 'mlkit',
  },
  CapacitorBarcodeScannerCameraDirection: { BACK: 1, FRONT: 0 },
  CapacitorBarcodeScannerScanOrientation: { PORTRAIT: 1, ADAPTIVE: 0 },
  CapacitorBarcodeScannerTypeHint: { ALL: 0, QR_CODE: 1, EAN_13: 2 },
};

export const HealthMock = {
  isAvailable: vi.fn(async () => ({ available: true })),
  checkAuthorization: vi.fn(async () => ({
    readAuthorized: [],
    writeAuthorized: [],
  })),
  requestAuthorization: vi.fn(async () => ({
    readAuthorized: ['steps'],
    writeAuthorized: [],
  })),
  readSamples: vi.fn(async () => []),
  saveSample: vi.fn(async () => {}),
  openHealthConnectSettings: vi.fn(async () => {}),
  // Heart-rate sync (daily / hourly aggregates) and the workout import.
  queryAggregated: vi.fn(async () => ({ samples: [] })),
  queryWorkouts: vi.fn(async () => ({ workouts: [] })),
};

/**
 * `@capacitor-community/bluetooth-le` double — only the BleClient calls
 * services/heartRateSensor.js makes. `startNotifications` keeps the callback
 * on `BluetoothLeMock.__notify` so a spec can push heart-rate frames.
 */
export const BluetoothLeMock = {
  BleClient: {
    initialize: vi.fn(async () => {}),
    requestLEScan: vi.fn(async () => {}),
    requestDevice: vi.fn(async () => ({
      deviceId: 'web-device',
      name: 'Strap',
    })),
    stopLEScan: vi.fn(async () => {}),
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    read: vi.fn(async () => new DataView(Uint8Array.from([80]).buffer)),
    startNotifications: vi.fn(async (_deviceId, _service, _char, callback) => {
      BluetoothLeMock.__notify = callback;
    }),
  },
  __notify: null,
};

/** `@capacitor-community/keep-awake` double. */
export const KeepAwakeMock = {
  keepAwake: vi.fn(async () => {}),
  allowSleep: vi.fn(async () => {}),
};

/**
 * `@capacitor/filesystem` double. Only `writeFile` is exposed because that is
 * the single Filesystem call the native export path makes — a future call to an
 * uncovered method should fail loudly instead of silently returning `undefined`.
 */
export const FilesystemMock = {
  writeFile: vi.fn(async ({ path }) => ({ uri: `file:///mock-cache/${path}` })),
};

/** Enum members the app actually reads (data, not API surface). */
export const DirectoryMock = { Cache: 'CACHE', Documents: 'DOCUMENTS' };
export const EncodingMock = { UTF8: 'utf8' };

/**
 * `@capacitor/share` double. The iOS implementation rejects with
 * `"Share canceled"` when the sheet is dismissed, so specs can reproduce that.
 */
export const ShareMock = {
  share: vi.fn(async () => ({ activityType: 'com.mock.share' })),
};

/** Enum-shaped exports consumed from the plugin modules. */
export const StyleMock = { Dark: 'DARK', Light: 'LIGHT', Default: 'DEFAULT' };
export const KeyboardStyleMock = {
  Dark: 'DARK',
  Light: 'LIGHT',
  Default: 'DEFAULT',
};

/** `@capacitor/local-notifications` double (Layer 1). */
export const LocalNotificationsMock = {
  checkPermissions: vi.fn(async () => ({ display: 'granted' })),
  requestPermissions: vi.fn(async () => ({ display: 'granted' })),
  checkExactNotificationSetting: vi.fn(async () => ({
    exact_alarm: 'granted',
  })),
  changeExactNotificationSetting: vi.fn(async () => ({
    exact_alarm: 'granted',
  })),
  createChannel: vi.fn(async () => {}),
  getPending: vi.fn(async () => ({ notifications: [] })),
  schedule: vi.fn(async () => ({ notifications: [] })),
  cancel: vi.fn(async () => {}),
  removeDeliveredNotifications: vi.fn(async () => {}),
  addListener: vi.fn(async () => ({
    remove: vi.fn(async () => {}),
  })),
};

/** Local native `NotificationReliability` plugin double (Android & iOS). */
export const NotificationReliabilityMock = {
  isIgnoringBatteryOptimizations: vi.fn(async () => ({ ignoring: true })),
  openBatteryOptimizationSettings: vi.fn(async () => ({ opened: true })),
  checkHealthBackgroundPermission: vi.fn(async () => ({ status: 'granted' })),
  requestHealthBackgroundPermission: vi.fn(async () => ({ status: 'granted' })),
  syncBackgroundWorkoutContext: vi.fn(async () => ({
    scheduled: true,
    backgroundPermission: 'granted',
  })),
};

/** `@capacitor/push-notifications` double (Layer 2). */
export const PushNotificationsMock = {
  checkPermissions: vi.fn(async () => ({ receive: 'granted' })),
  requestPermissions: vi.fn(async () => ({ receive: 'granted' })),
  register: vi.fn(async () => {}),
  unregister: vi.fn(async () => {}),
  addListener: vi.fn(async () => ({
    remove: vi.fn(async () => {}),
  })),
};
