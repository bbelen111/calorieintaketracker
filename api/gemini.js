/* eslint-disable no-undef */
// Vercel Serverless Function: Gemini API Proxy
// Keeps Gemini API key server-side and proxies chat requests.

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const FALLBACK_MODEL = 'gemini-2.5-flash';
const FOOD_PARSER_SCHEMA_VERSION = '1.0.0';
const MAX_CONTENT_ITEMS = 30;
const MAX_CONTENTS_PAYLOAD_BYTES = 500000;
const GEMINI_MODES = Object.freeze({
  EXTRACTION: 'extraction',
  PRESENTATION: 'presentation',
  GROUNDING_LOOKUP: 'grounding_lookup',
});

const MODE_DEFAULT_MAX_TOKENS = Object.freeze({
  [GEMINI_MODES.EXTRACTION]: 2400,
  [GEMINI_MODES.PRESENTATION]: 1600,
  [GEMINI_MODES.GROUNDING_LOOKUP]: 800,
});

const EXTRACTION_SYSTEM_INSTRUCTION = `You are a nutrition parser for food logging in a calorie tracker.

Your mission:
- Parse ONLY foods explicitly mentioned by the user and/or visible in attached images.
- Estimate calories and macros for each specific food being logged (not full meal plans, not generic coaching).
- Keep responses concise and practical.

Conversation context behavior:
- The prompt may include a [RECENT_FOOD_CONTEXT] block.
- Use it ONLY to resolve references like "same as before", "again", "double rice", "remove sauce".
- Do NOT add context items as new entries unless the user explicitly references them in the current request.

Confidence behavior:
- High confidence: return actionable food entries.
- Medium confidence: return actionable food entries and clearly note uncertainty.
- Low confidence: do not guess aggressively; ask a focused follow-up question first.

Conservative estimation policy (HIGH PRIORITY):
- Prefer a clarification question whenever key uncertainty would materially change calories/macros (e.g., portion size, cooked vs raw weight, oily vs dry prep, single vs double patty, sauce amount, full-sugar vs diet drink).
- If user intent is clear enough to log now, still provide entries, but choose conservative defaults:
  - Avoid extreme values unless user explicitly states them.
  - Use typical serving ranges and pick a reasonable midpoint or slightly conservative estimate.
  - Keep assumptions explicit and brief.
- Never invent foods, side items, toppings, or beverages not explicitly mentioned or visually evident.
- For entries, include practical lookupTerms that improve local/USDA matching (food name, key descriptor, and brand when clearly provided).
- Prefer canonical food names in "name" for lookup stability (brand can still be included in lookupTerms).
- If multiple plausible interpretations exist, either:
  1) ask one concise follow-up question (preferred for low confidence), or
  2) provide one best estimate with medium confidence and explicit assumptions.

Every reply must include a short explanation of how estimates were produced (e.g., assumed portion size, common diner serving, visual cues, typical database ranges) and invite more context for better accuracy.

Output format requirements (MANDATORY):
1) Human-facing response text first.
2) Then append a machine payload enclosed exactly in these tags:
<food_parser_json>{...valid JSON...}</food_parser_json>

JSON schema:
{
  "version": "${FOOD_PARSER_SCHEMA_VERSION}",
  "messageType": "food_entries" | "clarification" | "error",
  "assistantMessage": "string",
  "followUpQuestion": "string (optional)",
  "entries": [
    {
      "name": "string",
      "grams": number,
      "calories": number,
      "protein": number,
      "carbs": number,
      "fats": number,
      "confidence": "high" | "medium" | "low",
      "category": "protein" | "carbs" | "vegetables" | "fats" | "supplements" | "custom" | "manual" (optional),
      "rationale": "string",
      "assumptions": ["string", "..."],
      "lookupTerms": ["string", "..."]
    }
  ]
}

Rules:
- Always include "version" and set it exactly to "${FOOD_PARSER_SCHEMA_VERSION}".
- If messageType is "food_entries", include at least one entry.
- If confidence is low overall, use messageType "clarification" and include followUpQuestion.
- For clarifications, ask ONE highest-impact question first (do not ask multiple at once).
- If messageType is "clarification" or "error", entries should be empty.
- Never output markdown code fences around JSON.
- Keep the JSON compact (no unnecessary fields or long prose inside JSON values).
- Ensure JSON is valid and parseable.`;

const PRESENTATION_SYSTEM_INSTRUCTION = `You are a nutrition logging assistant that formats final answers from system-verified nutrition data.

Rules:
- If the user prompt contains a [SYSTEM_DATA] block, use ONLY those numbers for calories/macros.
- Never alter, infer, or re-estimate calories/macros that are provided inside [SYSTEM_DATA].
- Preserve the verified entry order from [SYSTEM_DATA].
- Prefer keeping verified names unchanged unless the rewrite is a minor readability cleanup.
- Keep copy concise and practical.
- If [SYSTEM_DATA] is missing or malformed, return a concise error payload.

Output format requirements (MANDATORY):
1) Human-facing response text first.
2) Then append machine payload enclosed exactly in:
<food_parser_json>{...valid JSON...}</food_parser_json>

JSON schema:
{
  "version": "${FOOD_PARSER_SCHEMA_VERSION}",
  "messageType": "food_entries" | "error",
  "assistantMessage": "string",
  "entries": [
    {
      "name": "string",
      "grams": number,
      "calories": number,
      "protein": number,
      "carbs": number,
      "fats": number,
      "confidence": "high" | "medium" | "low",
      "category": "protein" | "carbs" | "vegetables" | "fats" | "supplements" | "custom" | "manual" (optional),
      "rationale": "string",
      "assumptions": ["string", "..."],
      "lookupTerms": ["string", "..."],
      "source": "local" | "usda" | "ai_web_search" | "estimate"
    }
  ]
}

Rules:
- Always include "version" and set it exactly to "${FOOD_PARSER_SCHEMA_VERSION}".
- If messageType is "food_entries", include at least one entry.
- Keep names close to verified labels in [SYSTEM_DATA] (avoid semantic rewrites).
- Keep JSON compact and valid.
- Never output markdown code fences around JSON.`;

const GROUNDING_LOOKUP_SYSTEM_INSTRUCTION = `You are a nutrition retrieval assistant for obscure foods.

Task:
- Use Google Search grounding to return a conservative 100g baseline estimate for each requested food.
- If the user asks for one food, return one entry. If multiple foods are requested, return one entry per food.
- Preserve requested order whenever possible.
- Return strict JSON only, inside <food_parser_json> tags.
- Do not include markdown code fences.

Required JSON schema:
{
  "version": "${FOOD_PARSER_SCHEMA_VERSION}",
  "messageType": "food_entries" | "error",
  "assistantMessage": "string",
  "entries": [
    {
      "name": "string",
      "grams": 100,
      "calories": number,
      "protein": number,
      "carbs": number,
      "fats": number,
      "confidence": "low" | "medium",
      "rationale": "string",
      "assumptions": ["string", "..."],
      "source": "ai_web_search"
    }
  ]
}

Rules:
- Always include "version" and set it exactly to "${FOOD_PARSER_SCHEMA_VERSION}".`;

function resolveSystemInstruction(mode) {
  switch (mode) {
    case GEMINI_MODES.PRESENTATION:
      return PRESENTATION_SYSTEM_INSTRUCTION;
    case GEMINI_MODES.GROUNDING_LOOKUP:
      return GROUNDING_LOOKUP_SYSTEM_INSTRUCTION;
    case GEMINI_MODES.EXTRACTION:
    default:
      return EXTRACTION_SYSTEM_INSTRUCTION;
  }
}

const VALID_ROLES = new Set(['user', 'model']);

function isValidPart(part) {
  if (!part || typeof part !== 'object') return false;

  if (typeof part.text === 'string') {
    return part.text.trim().length > 0;
  }

  const inlineData = part.inlineData;
  if (!inlineData || typeof inlineData !== 'object') return false;

  const { mimeType, data } = inlineData;
  return (
    typeof mimeType === 'string' &&
    /^image\/(jpeg|png|webp)$/i.test(mimeType) &&
    typeof data === 'string' &&
    data.length > 0
  );
}

function isValidContent(content) {
  if (!content || typeof content !== 'object') return false;
  if (!VALID_ROLES.has(content.role)) return false;
  if (!Array.isArray(content.parts) || content.parts.length === 0) return false;
  return content.parts.every(isValidPart);
}

const resolveAllowedOrigins = () => {
  const raw =
    String(process.env.ALLOWED_ORIGINS || '').trim() ||
    String(process.env.ALLOWED_ORIGIN || '').trim();

  if (!raw) {
    return [];
  }

  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
};

const normalizeOrigin = (value) =>
  String(value || '')
    .trim()
    .replace(/\/+$/, '')
    .toLowerCase();

const escapeRegex = (value) =>
  String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const isOriginAllowedByRule = (requestOrigin, rule) => {
  const normalizedOrigin = normalizeOrigin(requestOrigin);
  const normalizedRule = normalizeOrigin(rule);

  if (!normalizedOrigin || !normalizedRule) {
    return false;
  }

  if (normalizedRule === '*') {
    return true;
  }

  if (!normalizedRule.includes('*')) {
    return normalizedOrigin === normalizedRule;
  }

  const wildcardRegex = new RegExp(
    `^${escapeRegex(normalizedRule).replace(/\\\*/g, '.*')}$`,
    'i'
  );

  return wildcardRegex.test(normalizedOrigin);
};

const isOriginAllowed = (requestOrigin, allowedOrigins) => {
  const rules = Array.isArray(allowedOrigins) ? allowedOrigins : [];
  return rules.some((rule) => isOriginAllowedByRule(requestOrigin, rule));
};

const applyCorsHeaders = (req, res) => {
  const requestOrigin = String(req?.headers?.origin || '').trim();
  const allowedOrigins = resolveAllowedOrigins();

  if (allowedOrigins.length === 0) {
    if (requestOrigin) {
      res.setHeader('Access-Control-Allow-Origin', requestOrigin);
      res.setHeader('Vary', 'Origin');
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
  } else {
    const allowOrigin =
      requestOrigin && isOriginAllowed(requestOrigin, allowedOrigins)
        ? requestOrigin
        : allowedOrigins[0];
    res.setHeader('Access-Control-Allow-Origin', allowOrigin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (allowedOrigins.length === 0) {
    return true;
  }

  return requestOrigin ? isOriginAllowed(requestOrigin, allowedOrigins) : true;
};

const resolveClientIp = (req) => {
  const forwardedFor = String(req?.headers?.['x-forwarded-for'] || '').trim();
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  return (
    String(req?.headers?.['x-real-ip'] || '').trim() ||
    String(req?.socket?.remoteAddress || '').trim() ||
    'unknown'
  );
};

const checkRequestRateLimit = async (req) => {
  const upstashUrl = String(process.env.UPSTASH_REDIS_REST_URL || '').trim();
  const upstashToken = String(
    process.env.UPSTASH_REDIS_REST_TOKEN || ''
  ).trim();
  const failClosed =
    String(process.env.GEMINI_RATE_LIMIT_FAIL_CLOSED || '')
      .trim()
      .toLowerCase() === 'true';

  if (!upstashUrl || !upstashToken) {
    return {
      limited: false,
      retryAfterSeconds: null,
    };
  }

  const maxRequests = Math.max(
    1,
    Number.parseInt(process.env.GEMINI_RATE_LIMIT_MAX_REQUESTS || '60', 10) ||
      60
  );
  const windowSeconds = Math.max(
    1,
    Number.parseInt(process.env.GEMINI_RATE_LIMIT_WINDOW_SECONDS || '60', 10) ||
      60
  );

  const ip = resolveClientIp(req);
  const key = `gemini:rl:${ip}`;

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

    return {
      limited: false,
      retryAfterSeconds: null,
    };
  } catch {
    if (failClosed) {
      return {
        limited: true,
        retryAfterSeconds: windowSeconds,
        message: 'Rate limiter unavailable. Please retry shortly.',
      };
    }

    return {
      limited: false,
      retryAfterSeconds: null,
    };
  }
};

const resolveModeMaxTokens = (mode) => {
  const envMap = {
    [GEMINI_MODES.EXTRACTION]: process.env.GEMINI_MAX_TOKENS_EXTRACTION,
    [GEMINI_MODES.PRESENTATION]: process.env.GEMINI_MAX_TOKENS_PRESENTATION,
    [GEMINI_MODES.GROUNDING_LOOKUP]: process.env.GEMINI_MAX_TOKENS_GROUNDING,
  };

  const parsed = Number.parseInt(String(envMap[mode] || '').trim(), 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return MODE_DEFAULT_MAX_TOKENS[mode] || MODE_DEFAULT_MAX_TOKENS.extraction;
};

export default async function handler(req, res) {
  const isCorsAllowed = applyCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    if (!isCorsAllowed) {
      return res.status(403).json({ error: 'Origin not allowed' });
    }
    return res.status(200).end();
  }

  if (!isCorsAllowed) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rateLimitStatus = await checkRequestRateLimit(req);
  if (rateLimitStatus.limited) {
    if (Number.isFinite(rateLimitStatus.retryAfterSeconds)) {
      res.setHeader('Retry-After', String(rateLimitStatus.retryAfterSeconds));
    }
    return res.status(429).json({
      error: rateLimitStatus.message || 'Too many requests',
      retryAfterSeconds: rateLimitStatus.retryAfterSeconds ?? undefined,
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Gemini API key not configured' });
  }

  const body = req.body || {};
  const modeRaw = String(body.mode || '')
    .trim()
    .toLowerCase();

  if (modeRaw && !Object.values(GEMINI_MODES).includes(modeRaw)) {
    return res.status(400).json({
      error: 'Invalid mode',
      validModes: Object.values(GEMINI_MODES),
    });
  }

  const mode = modeRaw || GEMINI_MODES.EXTRACTION;
  const useGrounding = body.useGrounding === true;
  const defaultModel = process.env.GEMINI_MODEL || FALLBACK_MODEL;
  const defaultGroundingModelRaw = process.env.GEMINI_GROUNDING_MODEL || '';

  const requestedModel =
    typeof body.model === 'string' && body.model.trim().length > 0
      ? body.model.trim()
      : '';
  const defaultGroundingModel =
    typeof defaultGroundingModelRaw === 'string' &&
    defaultGroundingModelRaw.trim().length > 0
      ? defaultGroundingModelRaw.trim()
      : '';
  const model =
    requestedModel ||
    (mode === GEMINI_MODES.GROUNDING_LOOKUP && defaultGroundingModel
      ? defaultGroundingModel
      : defaultModel);

  const contents = body.contents;

  if (!Array.isArray(contents) || contents.length === 0) {
    return res.status(400).json({ error: 'contents array is required' });
  }

  if (contents.length > MAX_CONTENT_ITEMS) {
    return res.status(413).json({
      error: 'Payload too large',
      message: `contents cannot exceed ${MAX_CONTENT_ITEMS} items`,
    });
  }

  const payloadBytes = Buffer.byteLength(JSON.stringify(contents), 'utf8');
  if (payloadBytes > MAX_CONTENTS_PAYLOAD_BYTES) {
    return res.status(413).json({
      error: 'Payload too large',
      message: `contents payload exceeds ${MAX_CONTENTS_PAYLOAD_BYTES} bytes`,
    });
  }

  if (!contents.every(isValidContent)) {
    return res.status(400).json({
      error:
        'Invalid contents payload. Each content must include role (user|model) and non-empty parts with text or supported image inlineData.',
    });
  }

  const payload = {
    contents,
    systemInstruction: {
      parts: [{ text: resolveSystemInstruction(mode) }],
    },
    generationConfig: {
      temperature: mode === GEMINI_MODES.GROUNDING_LOOKUP ? 0.2 : 0.5,
      maxOutputTokens: resolveModeMaxTokens(mode),
    },
  };

  if (mode === GEMINI_MODES.GROUNDING_LOOKUP && useGrounding) {
    payload.tools = [{ googleSearch: {} }];
  }

  try {
    const endpoint = `${GEMINI_BASE_URL}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseData = await response.json().catch(() => ({}));

    if (!response.ok) {
      const upstreamMessage =
        responseData?.error?.message ||
        `Gemini request failed (${response.status})`;

      return res.status(response.status).json({
        error: upstreamMessage,
        status: response.status,
      });
    }

    return res.status(200).json(responseData);
  } catch (error) {
    console.error('Gemini proxy error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message:
        process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}
