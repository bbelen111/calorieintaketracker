/* eslint-disable no-undef */
// Vercel Serverless Function: Anonymous device push token unregistration (Layer 2).
//
// Calls the narrow `public.unregister_push_device` SECURITY DEFINER RPC using
// `SUPABASE_ANON_KEY` + server-only `PUSH_RPC_SECRET`, protected by Upstash
// per-IP rate limiting. `SUPABASE_SERVICE_ROLE_KEY` never lives on Vercel.

import {
  UUID_PATTERN,
  checkPushRateLimit,
  parseRequestBody,
  resolvePushBackendConfig,
} from './_shared.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rateLimit = await checkPushRateLimit(req, 'unregister');
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

  const body = parseRequestBody(req);
  const installationId = String(body?.installationId ?? '').trim();
  if (!UUID_PATTERN.test(installationId)) {
    return res
      .status(400)
      .json({ error: 'Valid UUID installationId is required.' });
  }

  try {
    const url = new URL('/rest/v1/rpc/unregister_push_device', supabaseUrl);

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_secret: rpcSecret,
        p_installation_id: installationId.toLowerCase(),
      }),
    });

    if (!response.ok) {
      return res.status(response.status >= 500 ? 502 : response.status).json({
        error: 'Failed to unregister push device.',
      });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('push unregister error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
