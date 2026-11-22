/* eslint-disable no-undef */
// Vercel Serverless Function: Anonymous device push token registration (Layer 2).
//
// Calls the narrow `public.register_push_device` SECURITY DEFINER RPC using the
// read-only `SUPABASE_ANON_KEY` + server-only `PUSH_RPC_SECRET`, protected by
// Upstash per-IP rate limiting. `SUPABASE_SERVICE_ROLE_KEY` never lives on
// Vercel. Zero user PII or health data is accepted or stored.

import {
  UUID_PATTERN,
  checkPushRateLimit,
  parseRequestBody,
  resolvePushBackendConfig,
} from './_shared.js';

const ALLOWED_PLATFORMS = new Set(['ios', 'android']);
const ALLOWED_TOPICS = new Set(['announcements']);
const MAX_TOKEN_LENGTH = 512;
const MAX_VERSION_LENGTH = 32;

export const validateRegisterPayload = (body) => {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }

  const installationId = String(body.installationId ?? '').trim();
  if (!UUID_PATTERN.test(installationId)) {
    return { ok: false, error: 'Valid UUID installationId is required.' };
  }

  const platform = String(body.platform ?? '')
    .trim()
    .toLowerCase();
  if (!ALLOWED_PLATFORMS.has(platform)) {
    return { ok: false, error: 'Platform must be "ios" or "android".' };
  }

  const token = String(body.token ?? '').trim();
  if (!token || token.length > MAX_TOKEN_LENGTH) {
    return {
      ok: false,
      error: `Push token is required (max ${MAX_TOKEN_LENGTH} characters).`,
    };
  }

  const rawTopics = Array.isArray(body.topics) ? body.topics : [];
  const topics = Array.from(
    new Set(
      rawTopics
        .map((topic) =>
          String(topic ?? '')
            .trim()
            .toLowerCase()
        )
        .filter((topic) => ALLOWED_TOPICS.has(topic))
    )
  ).sort();

  const rawVersion = String(body.appVersion ?? '').trim();
  const appVersion = rawVersion
    ? rawVersion.slice(0, MAX_VERSION_LENGTH)
    : null;

  return {
    ok: true,
    record: {
      installation_id: installationId.toLowerCase(),
      platform,
      token,
      topics,
      app_version: appVersion,
    },
  };
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rateLimit = await checkPushRateLimit(req, 'register');
  if (rateLimit.limited) {
    if (rateLimit.retryAfterSeconds != null) {
      res.setHeader('Retry-After', String(rateLimit.retryAfterSeconds));
    }
    return res.status(429).json({
      error:
        rateLimit.message || 'Too many requests. Please wait before retrying.',
    });
  }

  const { supabaseUrl, anonKey, rpcSecret } = resolvePushBackendConfig();
  if (!supabaseUrl || !anonKey || !rpcSecret) {
    return res.status(500).json({
      error: 'Push registration backend not configured',
      details:
        'Set SUPABASE_URL, SUPABASE_ANON_KEY (or SUPABASE_PUBLISHABLE_KEY), and PUSH_RPC_SECRET in your deployment environment.',
    });
  }

  const validation = validateRegisterPayload(parseRequestBody(req));
  if (!validation.ok) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const url = new URL('/rest/v1/rpc/register_push_device', supabaseUrl);

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_secret: rpcSecret,
        p_installation_id: validation.record.installation_id,
        p_platform: validation.record.platform,
        p_token: validation.record.token,
        p_topics: validation.record.topics,
        p_app_version: validation.record.app_version,
      }),
    });

    if (!response.ok) {
      return res.status(response.status >= 500 ? 502 : response.status).json({
        error: 'Failed to register push device.',
      });
    }

    return res.status(200).json({
      ok: true,
      installationId: validation.record.installation_id,
      topics: validation.record.topics,
    });
  } catch (error) {
    console.error('push register error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
