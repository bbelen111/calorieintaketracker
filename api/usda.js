/* eslint-disable no-undef */
// Vercel Serverless Function: USDA FoodData Central API Proxy
// Proxies online text search and keeps API key server-side.

const USDA_API_BASE =
  process.env.USDA_API_BASE || 'https://api.nal.usda.gov/fdc/v1';
const USDA_API_KEY = process.env.USDA_API_KEY || '';

async function searchFoodsByText(query, page = 1, pageSize = 20) {
  const url = new URL('/foods/search', USDA_API_BASE);
  url.searchParams.set('query', query);
  url.searchParams.set('pageNumber', String(page));
  url.searchParams.set('pageSize', String(pageSize));
  url.searchParams.set('api_key', USDA_API_KEY);

  const response = await fetch(url.toString(), {
    method: 'GET',
  });

  const payload = await response.json().catch(() => ({}));
  return { response, payload };
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

  if (!USDA_API_KEY) {
    return res.status(500).json({
      error: 'USDA API key not configured',
      details: 'Set USDA_API_KEY in your deployment environment.',
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

  try {
    const { response, payload } = await searchFoodsByText(
      normalizedQuery,
      safePage,
      safePageSize
    );

    if (!response.ok) {
      return res.status(response.status).json({
        error:
          payload?.error?.message || `USDA search error: ${response.status}`,
        details: payload,
      });
    }

    return res.status(200).json(payload);
  } catch (error) {
    console.error('USDA text search proxy error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message:
        process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}
