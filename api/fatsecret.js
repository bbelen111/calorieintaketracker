/* eslint-disable no-undef */
// Vercel Serverless Function: FatSecret API Proxy
// Handles OAuth 2.0 authentication and proxies requests securely
// Node.js runtime - process, Buffer, fetch are available globally

const FATSECRET_TOKEN_URL = 'https://oauth.fatsecret.com/connect/token';
const FATSECRET_API_URL = 'https://platform.fatsecret.com/rest/server.api';

// In-memory token cache (persists across warm function invocations)
let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Fetch OAuth 2.0 access token using Client Credentials grant
 */
async function getAccessToken() {
  const now = Date.now();

  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && tokenExpiresAt > now + 60000) {
    return cachedToken;
  }

  const clientId = process.env.FATSECRET_CLIENT_ID;
  const clientSecret = process.env.FATSECRET_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('FatSecret credentials not configured');
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    'base64'
  );

  const response = await fetch(FATSECRET_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=basic barcode',
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Token fetch failed:', errorText);
    throw new Error('Failed to authenticate with FatSecret');
  }

  const data = await response.json();
  cachedToken = data.access_token;
  tokenExpiresAt = now + data.expires_in * 1000;

  return cachedToken;
}

/**
 * Make authenticated request to FatSecret Platform API
 */
async function fatSecretRequest(params) {
  const token = await getAccessToken();

  const url = new URL(FATSECRET_API_URL);
  url.searchParams.set('format', 'json');

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('API request failed:', errorText);
    throw new Error(`FatSecret API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Vercel Serverless Handler
 */
export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, query, food_id, barcode, page } = req.query;

  try {
    let result;

    switch (action) {
      case 'search':
        // Search foods by text query
        if (!query) {
          return res.status(400).json({ error: 'Query parameter required' });
        }
        result = await fatSecretRequest({
          method: 'foods.search',
          search_expression: query,
          page_number: page || 0,
          max_results: 20,
        });
        break;

      case 'get':
        // Get detailed food info by ID
        if (!food_id) {
          return res.status(400).json({ error: 'food_id parameter required' });
        }
        result = await fatSecretRequest({
          method: 'food.get.v4',
          food_id: food_id,
        });
        break;

      case 'barcode': {
        // Look up food by barcode (UPC/EAN)
        if (!barcode) {
          return res.status(400).json({ error: 'barcode parameter required' });
        }
        // First get food_id from barcode
        const barcodeResult = await fatSecretRequest({
          method: 'food.find_id_for_barcode',
          barcode: barcode,
        });

        if (barcodeResult.error || !barcodeResult.food_id) {
          return res.status(404).json({
            error: 'Barcode not found',
            details: barcodeResult,
          });
        }

        // Then get full food details
        result = await fatSecretRequest({
          method: 'food.get.v4',
          food_id: barcodeResult.food_id.value,
        });
        break;
      }

      case 'autocomplete':
        // Autocomplete suggestions (faster, less data)
        if (!query) {
          return res.status(400).json({ error: 'Query parameter required' });
        }
        result = await fatSecretRequest({
          method: 'foods.autocomplete',
          expression: query,
          max_results: 10,
        });
        break;

      default:
        return res.status(400).json({
          error: 'Invalid action',
          validActions: ['search', 'get', 'barcode', 'autocomplete'],
        });
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('FatSecret proxy error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message:
        process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}
