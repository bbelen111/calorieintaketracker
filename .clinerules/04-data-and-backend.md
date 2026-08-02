---
paths:
  - src/services/**
  - src/constants/**
  - api/**
  - scripts/**
  - src/hooks/**
---

# Energy Map Calorie Tracker - Data, Storage & Backend Services

## Storage Architecture (`utils/data/storage.js`, `utils/data/historyDatabase.js`)

### Split Storage Keys

| Key | Contents | Why |
|-----|----------|-----|
| `energyMapData_profile` | Settings, user stats, preferences, small lists | Primary profile/settings source of truth |

Primary history store is now Dexie (`energyMapHistory` DB), with document rows keyed by history field name.

Split is determined by `HISTORY_FIELDS` array: `weightEntries`, `bodyFatEntries`, `stepEntries`, `nutritionData`, `phaseLogV2`, `cardioSessions`, `trainingSessions`, `cachedFoods`, `dailySnapshots`.

`dailySnapshots` is also history-scoped and sharded by date document key (`dailySnapshots:YYYY-MM-DD`).

### Dexie History Store

`utils/data/historyDatabase.js` manages:
- DB name: `energyMapHistory`
- `historyDocuments` table (`id` = history field key or sharded key, payload document)

Helper surface:
- `loadAllHistoryDocuments()`
- `saveHistoryToDexie(historyData)`
- `saveHistoryDocumentsToDexie(documents)`
- `deleteHistoryDocumentsFromDexie(documentIds)`

Return semantics are intentionally boolean-oriented for save helpers (`true`/`false`) so callers can handle non-throw failures.

### Data Integrity Helpers

| Utility | Module | Purpose |
|---------|--------|---------|
| `normalizeDateKey(value)` | `utils/weight.js` | Validates `YYYY-MM-DD` format, returns `null` on invalid |
| `clampWeight(value)` | `utils/weight.js` | Clamps to 30-210 kg, rounds to 1 decimal |
| `sortWeightEntries(entries)` | `utils/weight.js` | Filters invalid entries, sorts by date ascending |
| `clampBodyFat(value)` | `utils/bodyFat.js` | Validates body fat percentage |
| `sortBodyFatEntries(entries)` | `utils/bodyFat.js` | Filters and sorts body fat entries |
| `parseStepRange(range)` | `utils/steps.js` | Parses `<10k`, `>20k`, `10k-15k` formats → `{ min, max, operator }` |
| `mergeWithDefaults(data)` | `utils/data/storage.js` | Deep-merges loaded data with defaults, normalizes nutrition entries |
| `sanitizeAge(value, fallback)` | `utils/profile.js` | Clamps and rounds age to 1–100 range |
| `sanitizeHeight(value, fallback)` | `utils/profile.js` | Clamps and rounds height to 120–220 cm range |

### Migration

Migration behavior is now intentionally minimal:
1. No `localStorage` or Preferences history backfill path is used.
2. Legacy Dexie `phases` documents are ignored (no compatibility import path).
3. Saves persist only `phaseLogV2` for phase history.

### Default Data

`getDefaultEnergyMapData()` in `utils/data/storage.js` defines the full schema with defaults. Key defaults:
- `age: 21`, `weight: 74`, `height: 168`, `gender: 'male'`, `theme: 'auto'`
- `selectedGoal: 'maintenance'`, `goalChangedAt: Date.now()`
- `stepGoal: 10000`, `selectedTrainingType: 'trainingtype_1'`, `trainingDuration: 2`
- 6 preset training types in `trainingType` with calories/hour values (`trainingtype_1..6` → bodybuilding 220, powerlifting 180, strongman 280, crossfit 300, calisthenics 240, custom 220)
- `activityMultipliers: { training: 0.35, rest: 0.28 }`
- `activityPresets: { training: 'default', rest: 'default' }`
- `customActivityMultipliers: { training: 0.35, rest: 0.28 }`
- `smartTefEnabled: false`
- `aiRagQualityMode: 'balanced'`
- `adaptiveThermogenesisEnabled: false`
- `adaptiveThermogenesisSmartMode: false`
- `adaptiveThermogenesisSmoothingEnabled: false`
- `adaptiveThermogenesisSmoothingMethod: 'ema'`
- `adaptiveThermogenesisSmoothingWindowDays: 7`
- `epocEnabled: true`
- `epocCarryoverHours: 6`

---

## USDA Search + OpenFoodFacts Barcode Integration

Online text search and barcode lookup are split across two proxied services for consistent error handling and centralized credentials.

**Architecture:**
- `services/usda.js` — Client service for online text search (FoodData Central), with timeout + native base URL guard.
- `api/usda.js` — Vercel proxy supporting `action=search` (text search).
- `services/openFoodFacts.js` — Client service for barcode lookups.
- `api/openfoodfacts.js` — Vercel proxy supporting `action=barcode` (product lookup).

**Configuration:**
- Native builds: set `VITE_USDA_API_BASE` for USDA search and `VITE_OPENFOODFACTS_API_BASE` for barcode lookup.
- Defaults:
  - USDA: `https://calorieintaketracker.vercel.app/api/usda`
  - OpenFoodFacts barcode: `https://calorieintaketracker.vercel.app/api/openfoodfacts`
- Recommended Vercel env vars:
  - `USDA_API_KEY=<your FoodData Central API key>`
  - `OPENFOODFACTS_USER_AGENT=EnergyMapCalorieTracker/1.0 (contact@example.com)`
  - Optional: `OPENFOODFACTS_API_BASE` (defaults to `https://world.openfoodfacts.org`)

**Key functions:**
```javascript
import { searchFoods as searchUsdaFoods } from './services/usda';
import { searchBarcode } from './services/openFoodFacts';

const results = await searchUsdaFoods('chicken breast', { page: 1, pageSize: 20 });
const food = await searchBarcode('012345678901');
```

Results are cached in `userData.cachedFoods` to reduce repeated network requests.

---

## OpenRouter AI Parsing Integration

OpenRouter food parsing is proxied through `api/openrouter.js` (server-side key handling) and consumed by `src/services/openrouter.js`.

**Gateway modes + instruction sources:**
- `api/openrouter.js` supports `mode: 'extraction' | 'presentation' | 'grounding_lookup'`.
- Canonical prompt sources live in `api/openrouter.js`:
  - `EXTRACTION_SYSTEM_INSTRUCTION`
  - `PRESENTATION_SYSTEM_INSTRUCTION`
  - `GROUNDING_LOOKUP_SYSTEM_INSTRUCTION`
- Grounding tools are gated: only `mode='grounding_lookup'` with `useGrounding: true` injects `tools: [{ type: 'openrouter:web_search' }]`.

**Client helpers (`src/services/openrouter.js`):**
- `sendOpenRouterExtraction(...)`
- `sendOpenRouterPresentation(...)`
- `fetchMacrosWithGrounding(...)`
- `sendOpenRouterMessage(...)` includes bounded transient retry for upstream `502|503|504` and queued exponential backoff for `429`
- Feature flag: `AI_CHAT_RAG_ENABLED` from `VITE_AI_CHAT_RAG_ENABLED`

**Serverless security/env configuration (`api/openrouter.js`):**
- CORS allowlist is driven by `ALLOWED_ORIGINS` (or singular fallback `ALLOWED_ORIGIN`).
- Payload guards are enforced server-side (`messages` count + serialized payload size cap).
- Optional stateless per-IP throttling uses Upstash REST:
  - `UPSTASH_REDIS_REST_URL`
  - `UPSTASH_REDIS_REST_TOKEN`
  - `OPENROUTER_RATE_LIMIT_MAX_REQUESTS` (default `60`)
  - `OPENROUTER_RATE_LIMIT_WINDOW_SECONDS` (default `60`)
  - `OPENROUTER_RATE_LIMIT_FAIL_CLOSED` (`true`/`false`, default fail-open)
- Optional per-mode output token overrides:
  - `OPENROUTER_MAX_TOKENS_EXTRACTION`
  - `OPENROUTER_MAX_TOKENS_PRESENTATION`
  - `OPENROUTER_MAX_TOKENS_GROUNDING`
- Model/env controls remain:
  - `OPENROUTER_API_KEY` (required)
  - `OPENROUTER_MODEL` (default extraction/presentation model)
  - `OPENROUTER_GROUNDING_MODEL` (grounding mode default override)
  - `OPENROUTER_FALLBACK_MODELS` (optional comma-separated failover models)
  - `OPENROUTER_GROUNDING_FALLBACK_MODELS` (optional grounding-specific failover models)

**AI RAG quality presets (`src/services/aiRagQuality.js`):**
- `fast` — lower latency, narrower lookup breadth, deferred grounding disabled
- `balanced` — default profile and compatibility baseline
- `precision` — wider lookup breadth and longer timeout budget
- Persisted profile field: `userData.aiRagQualityMode`

**Policy requirements:**
- Use **conservative estimation** when uncertainty materially affects calories/macros.
- Prefer **one highest-impact clarification question** for low-confidence cases.
- Do not invent foods/add-ons not explicitly mentioned or clearly visible.
- Preserve machine payload contract exactly (`<food_parser_json>...</food_parser_json>` schema).

If adjusting OpenRouter behavior, update the mode-specific instruction in `api/openrouter.js` first and verify parser/contract stability with `tests/utils/openrouter.test.js` and `tests/api/openrouter.contract.test.js`.

**Lookup diagnostics requirements (`src/services/foodLookupContext.js`):**
- Preserve structured `errorReasonsBySource` metadata (in addition to `errorsBySource` text).
- Use `getLookupErrorReasonMessage(...)` for user-facing reason labels.
- Use `getLookupErrorRecoveryHint(...)` for actionable trace guidance in chat UI.
- Keep fallback error meta populated with both message and reason code (`local_search_failed`) to avoid empty diagnostics.

---

## Local Food Catalog (SQLite)

Food search now reads from `src/constants/food/foodDatabase.sqlite` through `src/services/foodCatalog.js` using `sql.js`.

**Runtime service surface (`services/foodCatalog.js`):**
- `searchFoods({ query, category, subcategory, sortBy, sortOrder, limit, offset })`
- `getFoodById(id)`
- `getFoodsByIds(ids)`
- `getDistinctSubcategories(category)`

`searchFoods(...)` intentionally applies query-aware relevance ordering for name searches (`sortBy === 'name'`) so exact/prefix name matches rank above broad contains matches.

**Canonical module note:**
- Use `src/constants/food/foodDatabase.js` as the only JS catalog entrypoint.
- `FOOD_DATABASE` remains an intentionally empty compatibility array inside the canonical module; do not repopulate static inline food data.
- Root-level `src/constants/foodDatabase.js` no longer exists.

**Offline cleanup pipeline:**
- `scripts/food-db/index.js` performs audit/clean/rebuild/replace.
- `scripts/food-db/config/taxonomy.js` contains canonical category/subcategory maps and aliases.
- NPM scripts:
  - `npm run db:food:audit`
  - `npm run db:food:clean:dry`
  - `npm run db:food:clean`

The cleanup path is source-first. Do not add per-query runtime quality enforcement back into the app for catalog normalization.

---

## Health Connect Integration (`hooks/useHealthConnect.js`)

Android-only step data sync via `@capgo/capacitor-health`.

**Status lifecycle:** `'unavailable'` → `'not_installed'` → `'disconnected'` → `'connecting'` → `'connected'` | `'error'`

Returns `{ status, steps, lastSynced, isLoading, error, connect, refresh, disconnect, openSettings, writeTestData }`.

- `openSettings()` — Opens Health Connect settings on Android
- `writeTestData()` — Writes 1000 test steps for debugging
- Step aggregation uses max-per-source strategy to prevent double counting from multiple health apps
- Auto-refreshes on app foreground via `App.addListener('appStateChange')`

Always returns `'unavailable'` on web and iOS. Status constants exported as `HealthConnectStatus` enum object.

---

## Data & Backend Common Pitfalls

1. **Food cache retention is intentional:** `cachedFoods` is history-scoped and persisted with dedupe + max cap (currently 500). Keep retention logic if changing cache schema.
2. **Local food catalog is SQLite-first:** Query local foods via `services/foodCatalog.js`; do not reintroduce full in-memory `FOOD_DATABASE` scans as a primary path.
3. **Food data hygiene is offline-first:** Keep taxonomy/portion normalization in `scripts/food-db` pipeline and avoid adding query-time normalization layers for category/subcategory cleanup.
4. **OpenRouter instruction authority is server-side and mode-specific:** Keep behavioral prompt updates in `api/openrouter.js` (`EXTRACTION_SYSTEM_INSTRUCTION`, `PRESENTATION_SYSTEM_INSTRUCTION`, `GROUNDING_LOOKUP_SYSTEM_INSTRUCTION`) and preserve the existing `food_parser_json` schema unless a coordinated parser/test update is intentional.
5. **Pinned local foods must remain hydratable outside top-N result windows:** local search currently fetches pinned IDs via `getFoodsByIds(...)` on the first local page and merges them before UI filtering; do not regress to top-limited-only result sources.
6. **Local search ranking is relevance-aware for name sorting:** exact/prefix/word-boundary name matches should outrank generic contains matches (e.g., plain `honey` should not be buried under unrelated composites).
7. **RAG chat pipeline is feature-flagged and two-pass:** when `VITE_AI_CHAT_RAG_ENABLED` is true, keep extraction → deterministic resolution (`resolveFoodLookupContext` + `resolveAiFoodEntry`) → presentation flow intact; retain single-pass fallback path for safety.
8. **Grounding must stay gated:** only grounded lookup requests should set `useGrounding: true`; do not enable web grounding for extraction/presentation modes.
9. **Deterministic macro math belongs in services/utilities, not JSX:** keep grams normalization and per100g scaling in `utils/food/portionNormalization.js` and `services/foodSearch.js` (`resolveAiFoodEntry`), not ad-hoc in modal components.
10. **Presentation merge logic is centralized:** use `utils/food/aiPresentationMerge.js` for presentation→verified merge behavior. Do not re-implement sparse-entry guards or nutrition integrity checks inline in JSX.
11. **RAG merge safety is correctness-critical:** sparse/misaligned presentation arrays must degrade to verified entries; never trust presentation indices blindly.
12. **Name rewrite suppression is intentional:** significant token-divergence rewrites are blocked and surfaced as metadata/badges for traceability.
13. **Nutrition guardrail is intentional:** when presentation macros imply calories outside tolerance, keep verified deterministic nutrition and annotate `nutritionIntegrityIssue`.
14. **Lookup diagnostics require reason codes:** keep `errorReasonsBySource` populated for all lookup/error paths so chat trace can show stable reason labels and suggested fixes.
15. **Keep lookup reason/hint helpers canonical:** use `getLookupErrorReasonMessage(...)` and `getLookupErrorRecoveryHint(...)` from `services/foodLookupContext.js`; avoid ad-hoc per-component strings.
16. **OpenRouter transient retry parity is intentional:** `sendOpenRouterMessage` retries transient upstream `502/503/504` with bounded backoff; do not remove unless replacing with equivalent resilience.
17. **Rate-limit queueing is intentional:** `429` handling uses serialized backoff queue semantics; preserve this when adjusting retry logic.
18. **OpenRouter proxy hardening is config-sensitive:** keep `ALLOWED_ORIGINS` and (if enabled) Upstash rate-limit env vars configured in deployment; mismatched env config can silently alter CORS/throttling behavior across environments.
