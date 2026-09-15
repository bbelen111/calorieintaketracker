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
  setResizeMode: vi.fn(async () => {}),
  setScroll: vi.fn(async () => {}),
  show: vi.fn(async () => {}),
  hide: vi.fn(async () => {}),
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
};

/** Enum-shaped exports consumed from the plugin modules. */
export const StyleMock = { Dark: 'DARK', Light: 'LIGHT', Default: 'DEFAULT' };
export const KeyboardStyleMock = {
  Dark: 'DARK',
  Light: 'LIGHT',
  Default: 'DEFAULT',
};
