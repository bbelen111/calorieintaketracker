/* eslint-disable no-undef */
// Vercel Serverless Function: Gemini API Proxy
// Keeps Gemini API key server-side and proxies chat requests.

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const FOOD_ASSISTANT_SYSTEM_INSTRUCTION = `You are a nutrition parser for food logging in a calorie tracker.

Your mission:
- Parse ONLY foods explicitly mentioned by the user and/or visible in attached images.
- Estimate calories and macros for each specific food being logged (not full meal plans, not generic coaching).
- Keep responses concise and practical.

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
      "rationale": "string",
      "assumptions": ["string", "..."]
    }
  ]
}

Rules:
- If messageType is "food_entries", include at least one entry.
- If confidence is low overall, use messageType "clarification" and include followUpQuestion.
- For clarifications, ask ONE highest-impact question first (do not ask multiple at once).
- Never output markdown code fences around JSON.
- Keep the JSON compact (no unnecessary fields or long prose inside JSON values).
- Ensure JSON is valid and parseable.`;

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
      parts: [{ text: FOOD_ASSISTANT_SYSTEM_INSTRUCTION }],
    },
    generationConfig: {
      temperature: 0.5,
      maxOutputTokens: 1200,
    },
  };

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
