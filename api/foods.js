/* eslint-disable no-undef */
// Vercel Serverless Function: Supabase-backed online food search proxy.
//
// Read-only gateway for the curated catalog (`public.foods` + the
// `search_foods`/`search_foods_total` RPCs). Serves `/api/foods?action=search`
// using the ANON key: RLS grants public SELECT on `foods` and the RPCs are
// EXECUTE-granted to anon, so nothing privileged ever lives in this deploy —
// writes are service-role only, via the pipeline seeder.
//
// Response envelope (see api/foodRows.js):
//   { catalogFoods: [canonical rows…], foods: [legacy FDC rows…], totalHits, page }

import { toCatalogPayloadRows, toLegacyFdcRows } from './foodRows.js';

const resolveSupabaseUrl = () => String(process.env.SUPABASE_URL || '').trim();

// Read-only key. The anon key is public by design (app ships it anyway); the
// publishable key is its newer format. Never read SERVICE_ROLE here.
const resolveAnonKey = () =>
  String(
    process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || ''
  ).trim();

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 200;
const RETRY_MAX_DELAY_MS = 1500;
const RETRY_JITTER_MS = 100;

const resolveMaxAttempts = () => {
  const parsed = Number.parseInt(
    String(
      process.env.FOODS_MAX_ATTEMPTS || process.env.USDA_MAX_ATTEMPTS || ''
    ),
    10
  );
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(parsed, 5)
    : DEFAULT_MAX_ATTEMPTS;
};

const resolveRetryBaseDelayMs = () => {
  const parsed = Number.parseFloat(
    String(
      process.env.FOODS_RETRY_BASE_DELAY_MS ||
        process.env.USDA_RETRY_BASE_DELAY_MS ||
        ''
    )
  );
  return Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : DEFAULT_RETRY_BASE_DELAY_MS;
};

// PostgREST is far more reliable than FDC's edge/WAF: retry real 5xx only.
const isTransientStatus = (status) => {
  const code = Number(status);
  return code >= 500 && code <= 599;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const resolveRetryDelayMs = (attempt) => {
  const base = resolveRetryBaseDelayMs();
  const exponential = Math.min(base * 2 ** (attempt - 1), RETRY_MAX_DELAY_MS);
  return exponential + Math.random() * RETRY_JITTER_MS;
};

async function fetchSupabaseJson(url, apiKey, label) {
  const maxAttempts = resolveMaxAttempts();

  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
    });

    const payload = await response.json().catch(() => ({}));

    if (response.ok) {
      return payload;
    }

    const transient = isTransientStatus(response.status);
    if (!transient || attempt >= maxAttempts) {
      const error = new Error(
        payload?.message ||
          payload?.error ||
          `${label} error: ${response.status}`
      );
      error.status = response.status;
      error.details = payload;
      throw error;
    }

    await sleep(resolveRetryDelayMs(attempt));
  }
}

async function searchCatalogRows(query, limit, offset, supabaseUrl, apiKey) {
  const url = new URL('/rest/v1/rpc/search_foods', supabaseUrl);
  url.searchParams.set('p_query', query);
  url.searchParams.set('p_limit', String(limit));
  url.searchParams.set('p_offset', String(offset));
  const payload = await fetchSupabaseJson(url, apiKey, 'food search');
  return Array.isArray(payload) ? payload : [];
}

async function searchCatalogTotal(query, supabaseUrl, apiKey) {
  try {
    const url = new URL('/rest/v1/rpc/search_foods_total', supabaseUrl);
    url.searchParams.set('p_query', query);
    const payload = await fetchSupabaseJson(url, apiKey, 'food total');

    // PostgREST returns scalar RPC results as a bare value (`44`), but be
    // tolerant of array/object wrappers from older gateways.
    const first = Array.isArray(payload) ? (payload[0] ?? payload) : payload;
    const value =
      first !== null && typeof first === 'object'
        ? (first.search_foods_total ?? first)
        : first;
    const total = Number(value);

    return Number.isFinite(total) ? Math.max(0, total) : null;
  } catch {
    return null; // best-effort: fall back to rows.length
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Resolve creds once per request so mid-flight env changes never swap the
  // backing URL between the data and count calls.
  const supabaseUrl = resolveSupabaseUrl();
  const apiKey = resolveAnonKey();

  if (!supabaseUrl || !apiKey) {
    return res.status(500).json({
      error: 'Supabase catalog not configured',
      details:
        'Set SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_PUBLISHABLE_KEY) in your deployment environment.',
    });
  }

  const { action, query, page, pageSize } = req.query;
  const normalizedAction = String(action || 'search').toLowerCase();

  if (normalizedAction !== 'search') {
    return res.status(400).json({
      error: 'Invalid action',
      validActions: ['search'],
    });
  }

  const normalizedQuery = String(query || '').trim();
  if (normalizedQuery.length < 2) {
    return res.status(400).json({
      error: 'Valid query parameter required (min 2 characters)',
    });
  }

  const parsedPage = Number.parseInt(String(page || '1'), 10);
  const parsedPageSize = Number.parseInt(String(pageSize || '20'), 10);
  const safePage =
    Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const safePageSize = Number.isFinite(parsedPageSize)
    ? Math.min(Math.max(parsedPageSize, 1), 50)
    : 20;
  const limit = safePageSize;
  const offset = (safePage - 1) * safePageSize;

  try {
    const rows = await searchCatalogRows(
      normalizedQuery,
      limit,
      offset,
      supabaseUrl,
      apiKey
    );
    const totalHits =
      (await searchCatalogTotal(normalizedQuery, supabaseUrl, apiKey)) ??
      rows.length;

    return res.status(200).json({
      catalogFoods: toCatalogPayloadRows(rows),
      foods: toLegacyFdcRows(rows),
      totalHits,
      page: safePage,
    });
  } catch (error) {
    console.error('food search proxy error:', error);
    return res.status(error?.status || 500).json({
      error: error?.message || 'Internal server error',
      details: error?.status ? error.details : undefined,
    });
  }
}
