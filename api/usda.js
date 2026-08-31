// Legacy alias — the former /api/usda route.
//
// Already-shipped native builds still call this URL (their bundle bakes in the
// old `VITE_USDA_API_BASE` or the old default). It re-exports the same
// Supabase-backed handler, which also returns the legacy FDC `foods` envelope
// for those clients. Keep this file in sync with api/foods.js exports.
export { default } from './foods.js';
