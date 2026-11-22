/**
 * Anonymous remote push registration client (Layer 2).
 *
 * Keeps all device-bound push credentials in standalone Capacitor Preferences
 * keys (never inside `userData`, so JSON exports never carry another phone's
 * push token or installation ID).
 *
 * Talks to `/api/push/register` and `/api/push/unregister` on the Vercel API
 * gateway. Zero health data or PII ever leaves the device — only an anonymous
 * UUID, platform (`ios` | `android`), device token, and opted-in topic keys.
 */
import { Preferences } from '@capacitor/preferences';
import { getPlatform, isNative } from '../utils/platform.js';

export const PUSH_INSTALLATION_ID_KEY = 'energyMapPushInstallationId';
export const PUSH_REGISTRATION_CACHE_KEY = 'energyMapPushRegistrationCache';
export const APP_VERSION_LABEL = '0.1.0';

const DEFAULT_PUSH_API_BASE =
  'https://calorieintaketracker.vercel.app/api/push';
const REQUEST_TIMEOUT_MS = 12_000;

export const resolvePushApiBase = () => {
  const configured =
    typeof import.meta.env?.VITE_PUSH_API_BASE === 'string'
      ? import.meta.env.VITE_PUSH_API_BASE.trim()
      : '';
  return (configured || DEFAULT_PUSH_API_BASE).replace(/\/+$/, '');
};

const generateUuidV4 = () => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(
    ''
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export const getOrCreatePushInstallationId = async () => {
  try {
    const { value } = await Preferences.get({ key: PUSH_INSTALLATION_ID_KEY });
    const trimmed = String(value ?? '').trim();
    if (trimmed) {
      return trimmed;
    }
  } catch {
    // Fall through to generate a fresh UUID.
  }

  const nextId = generateUuidV4();
  try {
    await Preferences.set({ key: PUSH_INSTALLATION_ID_KEY, value: nextId });
  } catch (error) {
    console.warn('[Push] Could not persist installation ID:', error);
  }
  return nextId;
};

export const loadPushRegistrationCache = async () => {
  try {
    const { value } = await Preferences.get({
      key: PUSH_REGISTRATION_CACHE_KEY,
    });
    if (!value) {
      return null;
    }
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

export const savePushRegistrationCache = async (record) => {
  try {
    if (!record) {
      await Preferences.remove({ key: PUSH_REGISTRATION_CACHE_KEY });
      return;
    }
    await Preferences.set({
      key: PUSH_REGISTRATION_CACHE_KEY,
      value: JSON.stringify(record),
    });
  } catch (error) {
    console.warn('[Push] Could not persist registration cache:', error);
  }
};

const postJson = async (url, body) => {
  const controller =
    typeof globalThis.AbortController === 'function'
      ? new globalThis.AbortController()
      : null;
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    : null;

  try {
    const response = await globalThis.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller?.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(
        payload?.error || `Push API request failed (${response.status})`
      );
      error.status = response.status;
      throw error;
    }
    return payload;
  } finally {
    if (timeoutId != null) {
      clearTimeout(timeoutId);
    }
  }
};

/**
 * Registers or updates this device's push token and topic list with the backend.
 */
export const registerPushDeviceWithServer = async ({
  token,
  topics = [],
  platform = getPlatform(),
  appVersion = APP_VERSION_LABEL,
}) => {
  const normalizedToken = String(token ?? '').trim();
  if (!normalizedToken) {
    return { ok: false, error: 'Missing push token.' };
  }
  if (platform !== 'ios' && platform !== 'android') {
    return { ok: false, error: 'Unsupported platform for remote push.' };
  }

  const installationId = await getOrCreatePushInstallationId();
  const normalizedTopics = Array.from(
    new Set(
      (Array.isArray(topics) ? topics : [])
        .map((t) => String(t ?? '').trim())
        .filter(Boolean)
    )
  ).sort();

  const cached = await loadPushRegistrationCache();
  if (
    cached &&
    cached.installationId === installationId &&
    cached.token === normalizedToken &&
    cached.platform === platform &&
    JSON.stringify(cached.topics ?? []) === JSON.stringify(normalizedTopics) &&
    cached.synced === true
  ) {
    return { ok: true, installationId, cached: true };
  }

  const endpoint = `${resolvePushApiBase()}/register`;
  if (isNative() && endpoint.startsWith('/')) {
    return { ok: false, error: 'Push API base URL is not configured.' };
  }

  try {
    await postJson(endpoint, {
      installationId,
      platform,
      token: normalizedToken,
      topics: normalizedTopics,
      appVersion,
    });
    await savePushRegistrationCache({
      installationId,
      platform,
      token: normalizedToken,
      topics: normalizedTopics,
      synced: true,
      updatedAt: Date.now(),
    });
    return { ok: true, installationId, cached: false };
  } catch (error) {
    await savePushRegistrationCache({
      installationId,
      platform,
      token: normalizedToken,
      topics: normalizedTopics,
      synced: false,
      updatedAt: Date.now(),
    });
    return {
      ok: false,
      error: error?.message || 'Could not reach the push registration service.',
    };
  }
};

/**
 * Unregisters this device from remote push on the backend.
 */
export const unregisterPushDeviceWithServer = async () => {
  const cached = await loadPushRegistrationCache();
  const installationId =
    cached?.installationId || (await getOrCreatePushInstallationId());
  const endpoint = `${resolvePushApiBase()}/unregister`;

  try {
    await postJson(endpoint, {
      installationId,
      token: cached?.token ?? undefined,
    });
    await savePushRegistrationCache(null);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error?.message || 'Could not unregister push device.',
    };
  }
};
