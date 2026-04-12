/* eslint-disable no-undef */
// Vercel Serverless Function: Gemini API Proxy
// Keeps Gemini API key server-side and proxies chat requests.

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const FOOD_PARSER_SCHEMA_VERSION = '1.0.0';
const GEMINI_MODES = Object.freeze({
  EXTRACTION: 'extraction',
  PRESENTATION: 'presentation',
  GROUNDING_LOOKUP: 'grounding_lookup',
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
- Use Google Search grounding to return a conservative 100g baseline estimate for exactly one requested food.
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Gemini API key not configured' });
  }

  const body = req.body || {};
  const modeRaw = String(body.mode || GEMINI_MODES.EXTRACTION)
    .trim()
    .toLowerCase();
  const mode =
    Object.values(GEMINI_MODES).includes(modeRaw) && modeRaw
      ? modeRaw
      : GEMINI_MODES.EXTRACTION;
  const useGrounding = body.useGrounding === true;

  if (modeRaw && !Object.values(GEMINI_MODES).includes(modeRaw)) {
    return res.status(400).json({
      error: 'Invalid mode',
      validModes: Object.values(GEMINI_MODES),
    });
  }

  const model =
    typeof body.model === 'string' && body.model.trim().length > 0
      ? body.model.trim()
      : DEFAULT_MODEL;

  const contents = body.contents;

  if (!Array.isArray(contents) || contents.length === 0) {
    return res.status(400).json({ error: 'contents array is required' });
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
      maxOutputTokens: 1200,
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
