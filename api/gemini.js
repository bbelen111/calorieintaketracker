/* eslint-disable no-undef */
// Vercel Serverless Function: Gemini API Proxy
// Keeps Gemini API key server-side and proxies chat requests.

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const FOOD_ASSISTANT_SYSTEM_INSTRUCTION =
  'You are a food-focused assistant for a calorie tracking app. Prioritize concise, practical guidance about food identification, calories, macros, portions, substitutions, and logging tips. Be explicit when uncertain and suggest next best actions.';

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
      maxOutputTokens: 700,
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
