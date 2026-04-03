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

  const { action, barcode } = req.query;
  const normalizedAction = String(action || 'barcode').toLowerCase();

  if (normalizedAction !== 'barcode') {
    return res.status(400).json({
      error: 'Invalid action',
      validActions: ['barcode'],
    });
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
