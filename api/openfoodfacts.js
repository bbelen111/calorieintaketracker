/* eslint-disable no-undef */
// Vercel Serverless Function: OpenFoodFacts API Proxy
// Proxies barcode lookups and keeps request headers/config centralized.

const OPENFOODFACTS_API_BASE =
  process.env.OPENFOODFACTS_API_BASE || 'https://world.openfoodfacts.org';

const OPENFOODFACTS_USER_AGENT =
  process.env.OPENFOODFACTS_USER_AGENT ||
  'EnergyMapCalorieTracker/1.0 (https://calorieintaketracker.vercel.app)';

const PRODUCT_FIELDS = [
  'code',
  'product_name',
  'brands',
  'nutriments',
  'serving_size',
  'serving_quantity',
  'serving_quantity_unit',
  'quantity',
].join(',');

const SEARCH_PRODUCT_FIELDS = [
  'code',
  'product_name',
  'brands',
  'nutriments',
  'serving_size',
  'serving_quantity',
  'serving_quantity_unit',
].join(',');

function normalizeBarcode(barcode) {
  return String(barcode ?? '')
    .replace(/\D/g, '')
    .trim();
}

async function fetchProductByBarcode(barcode) {
  const url = new URL(
    `/api/v2/product/${encodeURIComponent(barcode)}.json`,
    OPENFOODFACTS_API_BASE
  );
  url.searchParams.set('fields', PRODUCT_FIELDS);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'User-Agent': OPENFOODFACTS_USER_AGENT,
    },
  });

  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function searchProductsByText(query, page = 1, pageSize = 20) {
  const url = new URL('/cgi/search.pl', OPENFOODFACTS_API_BASE);
  url.searchParams.set('search_terms', query);
  url.searchParams.set('search_simple', '1');
  url.searchParams.set('action', 'process');
  url.searchParams.set('json', '1');
  url.searchParams.set('fields', SEARCH_PRODUCT_FIELDS);
  url.searchParams.set('page', String(page));
  url.searchParams.set('page_size', String(pageSize));

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'User-Agent': OPENFOODFACTS_USER_AGENT,
    },
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

  const { action, barcode, query, page, pageSize } = req.query;
  const normalizedAction = String(action || 'barcode').toLowerCase();

  if (normalizedAction !== 'barcode' && normalizedAction !== 'search') {
    return res.status(400).json({
      error: 'Invalid action',
      validActions: ['barcode', 'search'],
    });
  }

  if (normalizedAction === 'search') {
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
      const { response, payload } = await searchProductsByText(
        normalizedQuery,
        safePage,
        safePageSize
      );

      if (!response.ok) {
        return res.status(response.status).json({
          error:
            payload?.status_verbose ||
            `OpenFoodFacts search error: ${response.status}`,
          details: payload,
        });
      }

      return res.status(200).json(payload);
    } catch (error) {
      console.error('OpenFoodFacts text search proxy error:', error);
      return res.status(500).json({
        error: 'Internal server error',
        message:
          process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }

  const normalizedBarcode = normalizeBarcode(barcode);
  if (!normalizedBarcode || normalizedBarcode.length < 8) {
    return res.status(400).json({ error: 'Valid barcode parameter required' });
  }

  try {
    const { response, payload } =
      await fetchProductByBarcode(normalizedBarcode);

    if (!response.ok) {
      return res.status(response.status).json({
        error:
          payload?.status_verbose || `OpenFoodFacts error: ${response.status}`,
        details: payload,
      });
    }

    if (payload?.status !== 1 || !payload?.product) {
      return res.status(404).json({
        error: 'Barcode not found in OpenFoodFacts database',
        details: payload,
      });
    }

    return res.status(200).json(payload);
  } catch (error) {
    console.error('OpenFoodFacts proxy error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message:
        process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}
