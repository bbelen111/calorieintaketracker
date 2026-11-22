/* eslint-disable no-undef */
// Shared helpers for Vercel Layer 2 push endpoints (`api/push/register.js`
// and `api/push/unregister.js`). Leading underscore keeps Vercel from
// exposing this module as a standalone route.

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const parseRequestBody = (req) => {
  if (req?.body && typeof req.body === 'object') {
    return req.body;
  }
  if (typeof req?.body === 'string' && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }
  return null;
};

/**
 * Resolves the Supabase URL, public ANON/publishable key, and server-only
 * `PUSH_RPC_SECRET`. Never reads `SUPABASE_SERVICE_ROLE_KEY`.
 */
export const resolvePushBackendConfig = () => {
  const supabaseUrl = String(process.env.SUPABASE_URL || '').trim();
  const anonKey = String(
    process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || ''
  ).trim();
  const rpcSecret = String(process.env.PUSH_RPC_SECRET || '').trim();
  return { supabaseUrl, anonKey, rpcSecret };
};

/**
 * Mirrors `api/openrouter.js`: `x-real-ip` wins; `x-forwarded-for` takes the
 * LAST hop (platform-appended) rather than the forgeable first entry.
 */
export const resolveClientIp = (req) => {
  const realIp = String(req?.headers?.['x-real-ip'] || '').trim();
  if (realIp) {
    return realIp;
  }

  const forwardedFor = String(req?.headers?.['x-forwarded-for'] || '').trim();
  if (forwardedFor) {
    const hops = forwardedFor
      .split(',')
      .map((hop) => hop.trim())
      .filter(Boolean);
    if (hops.length > 0) {
      return hops[hops.length - 1];
    }
  }

  return String(req?.socket?.remoteAddress || '').trim() || 'unknown';
};

/**
 * Per-IP Upstash Redis REST rate limiter matching `api/openrouter.js`.
 */
export const checkPushRateLimit = async (req, scope = 'push') => {
  const upstashUrl = String(process.env.UPSTASH_REDIS_REST_URL || '').trim();
  const upstashToken = String(
    process.env.UPSTASH_REDIS_REST_TOKEN || ''
  ).trim();
  const failClosed =
    String(
      process.env.PUSH_RATE_LIMIT_FAIL_CLOSED ||
        process.env.OPENROUTER_RATE_LIMIT_FAIL_CLOSED ||
        ''
    )
      .trim()
      .toLowerCase() === 'true';

  if (!upstashUrl || !upstashToken) {
    return { limited: false, retryAfterSeconds: null };
  }

  const maxRequests = Math.max(
    1,
    Number.parseInt(process.env.PUSH_RATE_LIMIT_MAX_REQUESTS || '20', 10) || 20
  );
  const windowSeconds = Math.max(
    1,
    Number.parseInt(process.env.PUSH_RATE_LIMIT_WINDOW_SECONDS || '60', 10) ||
      60
  );

  const ip = resolveClientIp(req);
  const key = `push:${scope}:rl:${ip}`;

  try {
    const pipelineResponse = await fetch(`${upstashUrl}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${upstashToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['INCR', key],
        ['EXPIRE', key, String(windowSeconds), 'NX'],
        ['TTL', key],
      ]),
    });

    if (!pipelineResponse.ok) {
      throw new Error(`Rate limit backend failed (${pipelineResponse.status})`);
    }

    const pipelineData = await pipelineResponse.json().catch(() => []);
    const currentCount = Number(pipelineData?.[0]?.result ?? 0);
    const ttl = Number(pipelineData?.[2]?.result ?? windowSeconds);

    if (currentCount > maxRequests) {
      return {
        limited: true,
        retryAfterSeconds: ttl > 0 ? ttl : windowSeconds,
      };
    }

    return { limited: false, retryAfterSeconds: null };
  } catch {
    if (failClosed) {
      return {
        limited: true,
        retryAfterSeconds: windowSeconds,
        message: 'Rate limiter unavailable. Please retry shortly.',
      };
    }
    return { limited: false, retryAfterSeconds: null };
  }
};
