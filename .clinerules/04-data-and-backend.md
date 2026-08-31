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

Split is determined by `HISTORY_FIELDS` array: `weightEntries`, `bodyFatEntries`, `stepEntries`, `nutritionData`, `phaseLogV2`, `cardioSessions`, `trainingSessions`, `cachedFoods`, `dailySnapshots`, `dailyNeatOverrides`.

`dailySnapshots` is also history-scoped and sharded by date document key (`dailySnapshots:YYYY-MM-DD`).

`dailyNeatOverrides` is also history-scoped and sharded by date document key (`dailyNeatOverrides:YYYY-MM-DD`). Each date's record is `{ multiplier, presetKey, label, updatedAt }` and ships with a matching sharded-Dexie config so only changed days are written on save. `mergeWithDefaults()` normalizes the map on load (drops invalid date keys, clamps multipliers via `clampCustomActivityMultiplier()` to the 0.1–1.0 range, coerces `presetKey`/`label` to strings or `null`).

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
| `getWindowDateKeys(endDateKey, n)` | `utils/dateKeys.js` | Exactly `n` consecutive UTC date keys ending at `endDateKey`; validates canonical round-trip (rejects e.g. `2026-02-31`); `[]` on invalid |
| `calculateTrapezoidalWindowAverage(sortedEntries, n, anchorKey, valueField)` | `utils/weight.js` | Time-weighted (trapezoidal) average over an exact n-day UTC window; `null` on empty window |
| `calculateNDayWeightAverage(entries, n, endDateKey?)` / `calculateNDayBodyFatAverage(entries, n, endDateKey?)` | `utils/weight.js` / `utils/bodyFat.js` | Today-anchored trapezoidal N-day averages delegating to the shared window helper |

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
- `activityMultipliers: { training: 0.2, rest: 0.22 }` (canonical `DEFAULT_ACTIVITY_MULTIPLIERS` in `constants/activity/activityPresets.js`)
- `activityPresets: { training: 'default', rest: 'default' }`
- `customActivityMultipliers: { training: 0.2, rest: 0.22 }`
- `smartTefEnabled: false`
- `adaptiveThermogenesisEnabled: false`
- `adaptiveThermogenesisSmartMode: false`
- `adaptiveThermogenesisSmoothingEnabled: false`
- `adaptiveThermogenesisSmoothingMethod: 'ema'`
- `adaptiveThermogenesisSmoothingWindowDays: 7`
- `epocEnabled: true`
- `epocCarryoverHours: 6`
- `hasSeenSwipeHint: false` — one-time swipe coach-mark flag (profile scope; flipped via the store action `markSwipeHintSeen()`)
- `dailyNeatOverrides: {}` — date-keyed (`YYYY-MM-DD`) history map; each entry `{ multiplier, presetKey, label, updatedAt }` (multiplier clamped 0.1–1.0)

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
  - Optional: `USDA_USER_AGENT=<browser-like UA>` (defaults to a Chrome desktop UA; FoodData Central rejects non-browser UAs with HTTP 404 for `/foods/search`)
  - Optional: `OPENFOODFACTS_API_BASE` (defaults to `https://world.openfoodfacts.org`)

**Key functions:**
```javascript
import { searchFoods as searchUsdaFoods } from './services/usda';
import { searchBarcode } from './services/openFoodFacts';

const results = await searchUsdaFoods('chicken breast', { page: 1, pageSize: 20 });
const food = await searchBarcode('012345678901');
```

Results are cached in `userData.cachedFoods` to reduce repeated network requests.

**Micro nutrient mapping (fiber / sodium / saturatedFats / sugars):**
- USDA nutrient matching is tiered: `nutrientNumber` first (291 Fiber / 307 Sodium / 606 Saturated fat / 269 Sugars), then `nutrientId` (1079/1093/1258/2000), then normalized name patterns.
- OpenFoodFacts reports sodium in **grams** with an explicit `sodium_unit` marker. `services/openFoodFacts.js` converts g → mg when `sodium_unit` is `g` (or missing) and honors an explicit `mg` unit; when sodium is absent it derives sodium from `salt_100g` (`salt_g × 393.4` ≈ mg). `nutriments_estimated` is never ingested.
- EU labels report net carbs with fiber separate, so fiber is never clamped against OFF carbs; USDA "carb by difference" (US sources) includes fiber and applies the stricter `sugars + fiber <= carbs` soft clamp.
- Per-100g result objects carry nullable micro fields; `null` = untracked.

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

**RAG chat pipeline service (`src/services/ragChatPipeline.js`):**
- `runRagChatPipeline(...)` — decoupled orchestration of the whole chat request (extraction → retrieval → verification → presentation). OpenRouter clients are injected via `modules`, telemetry via `telemetry`, stage progress via `onStageChange` (`CHAT_PIPELINE_STAGE`: `extraction | retrieval | verification | presentation | processing`). Returns `{ result, lookupContext, schemaVersion, extractionSchemaVersion, presentationSkipped, mode }`.
- Read-only/pure helpers exported for tests and reuse: `buildStructuredChatHistory`, `buildRollingFoodContextSummary`, `mergeEntriesWithLookupContext`, `shouldSkipPresentationPass`.
- Single-entry/simple responses skip the presentation LLM pass (see `shouldSkipPresentationPass`) and reuse the internal `buildVerifiedResultFromEntries` (not exported) to shape the result.
- Because the pipeline is standalone, it can be unit-tested with stubbed OpenRouter modules (see `tests/services/ragChatPipeline.test.js`); `FoodSearchModal` remains a thin consumer.
- Stage timing/budget constants are the single source of truth in `services/ragBudget.js` (`RAG_TIMING`, `resolveRagStageTimeoutMs`, `RAG_MAX_DEFERRED_GROUNDING_ENTRIES`, `RAG_LOOKUP_CONCURRENCY_LIMIT`, `assertRagTimingInvariants`) — never hardcode per-stage timeout values in callers.
- Reason codes (user-facing messages, recovery hints, chip labels) are centralized in `services/foodLookupReasons.js` and re-exported by `services/foodLookupContext.js`.

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

- `fast` — lower latency, narrower lookup breadth, deferred grounding disabled
- `balanced` — default profile and compatibility baseline
- `precision` — wider lookup breadth and longer timeout budget

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
- Reason-code definitions live in the canonical registry `src/services/foodLookupReasons.js` (`FOOD_LOOKUP_ERROR_REASONS`, `LOOKUP_STATUS_CHIP_LABELS`, `LOOKUP_DECISION_REASON_LABELS`, `DEFAULT_ERROR_REASON_BY_SOURCE`); `foodLookupContext.js`/`aiFinalizedEntryState.js`/chat UI must resolve labels through those helpers so the registries cannot drift.

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
- `scripts/food-db/index.js` performs audit/clean/rebuild/replace. The rebuild writes the nullable micro columns (`fiber`, `sodium`, `saturated_fats`, `sugars`); legacy DBs without them are loaded defensively via `PRAGMA table_info` detection.
- `scripts/food-db/build.js` is the **from-scratch catalog builder**. It ingests the raw FDC CSV downloads under `scripts/food-db/fdc-download/` (Foundation `foundation_food` + SR Legacy `sr_legacy_food` + Survey/FNDDS `survey_fndds_food` — Survey is on by default via `CURATION.useSurvey`), assembles per-100g macros + micros + household portions in one pass, then applies the curation rules in `scripts/food-db/config/curation.js` (junk-exclusion patterns, include/exclude overrides by `fdc_id`, and cut-variant collapsing that keeps at most one raw + one cooked representative per group). Nutrient ids are dual-scheme: SR/Foundation `food_nutrient.nutrient_id` carries the internal FDC id (energy `1008`, protein `1003`, …), while Survey/FNDDS carries the nutrient NUMBER directly (`208`, `203`, …) — both are mapped (note `1002` is NITROGEN, never energy). A post-collapse display-name pass rewrites poultry/pork into friendly labels (`Chicken, broilers or fryers, breast, meat only, raw` → `Chicken breast, raw`; the raw skinless-boneless breast is the canonical "Chicken breast, raw") with a rename-collision guard. Curated recoveries live in `scripts/food-db/config/curation.js`: `includeFdcIds` force-keeps real SR staples that the ALL-CAPS brand detector drops (e.g. `Cereals, CREAM OF WHEAT, ...`), and `manualFoods` adds branded-only common foods (`Chicken breast, raw, frozen`, jasmine/basmati rice, penne) by CLONING nutrition + portions from a documented donor `fdc_id` (`curated_` ids) so numbers are never invented. Every decision is written to `reports/curation.json`; `--replace` swaps the bundled DB (backup automatically), `--write` emits `scripts/food-db/foodDatabase.curated.sqlite`, and the default is a DB-free dry-run for iterative refinement.
- `scripts/food-db/enrich-nutrients.js` joins bundled catalog `usda_<fdcId>` rows against the official FDC bulk CSVs (`food_nutrient.csv`/`nutrient.csv` from Foundation/SR Legacy, optional Branded) to backfill the micro columns; unmatched rows stay `NULL`.
- `scripts/food-db/config/taxonomy.js` contains canonical category/subcategory maps and aliases.
- NPM scripts:
  - `npm run db:food:audit`
  - `npm run db:food:clean:dry`
  - `npm run db:food:clean`
  - `npm run db:food:build` (syntax: `node scripts/food-db/build.js [--survey] [--write|--replace]`)
  - `npm run db:food:enrich` (syntax: `node scripts/food-db/enrich-nutrients.js [--dir <extract-dir>] [--replace]`)
- Local intermediate artifacts (`foodDatabase.curated.sqlite`, `foodDatabase.backup.sqlite`, `fdc-download/`) are gitignored; keep the raw downloads local for rebuilds.

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
- Read windows are built through `buildHealthConnectStepReadWindow()` in `src/utils/healthConnectWindow.js`; keep that helper the single source of truth for explicit `startDate`/`endDate` normalization and strict `end > start` validation.
- `fetchSteps()` must use the **today-scoped window** (`buildHealthConnectStepReadWindow()`, local midnight → now) as the primary read path. The plugin's native default range is a rolling 24 hours and would include previous-day steps in today's live count, so it must only be used as a degraded fallback when the explicit today window fails. If all reads fail, return `null` and degrade gracefully rather than throwing a connection error into the live card flow.
- Step aggregation is centralized in `aggregateStepsBySource()` in `src/utils/healthConnectWindow.js`; use it for all read paths (today-scoped, native default, and rolling fallback) to keep max-per-source dedup consistent.
- The `Health.readSamples()` failure path should log the resolved window so exact-midnight or clock-skew issues are diagnosable without touching calorie math.

Always returns `'unavailable'` on web and iOS. Status constants exported as `HealthConnectStatus` enum object.

---

## Data & Backend Common Pitfalls

1. **Food cache retention is intentional:** `cachedFoods` is history-scoped and persisted with dedupe + max cap (currently 500). Keep retention logic if changing cache schema.
2. **Local food catalog is SQLite-first:** Query local foods via `services/foodCatalog.js`; do not reintroduce full in-memory `FOOD_DATABASE` scans as a primary path.
3. **Food data hygiene is offline-first:** Keep taxonomy/portion normalization in `scripts/food-db` pipeline and avoid adding query-time normalization layers for category/subcategory cleanup.
4. **OpenRouter instruction authority is server-side and mode-specific:** Keep behavioral prompt updates in `api/openrouter.js` (`EXTRACTION_SYSTEM_INSTRUCTION`, `PRESENTATION_SYSTEM_INSTRUCTION`, `GROUNDING_LOOKUP_SYSTEM_INSTRUCTION`) and preserve the existing `food_parser_json` schema unless a coordinated parser/test update is intentional.
5. **Pinned local foods must remain hydratable outside top-N result windows:** local search currently fetches pinned IDs via `getFoodsByIds(...)` on the first local page and merges them before UI filtering; do not regress to top-limited-only result sources.
6. **Local search ranking is relevance-aware for name sorting:** exact/prefix/word-boundary name matches should outrank generic contains matches (e.g., plain `honey` should not be buried under unrelated composites).
7. **RAG chat orchestration lives in `services/ragChatPipeline.js`:** when `VITE_AI_CHAT_RAG_ENABLED` is true, `runRagChatPipeline(...)` owns the extraction → deterministic resolution (`resolveFoodLookupContext` + `resolveAiFoodEntry`) → presentation sequence and returns `{ result, lookupContext, schemaVersion, extractionSchemaVersion, presentationSkipped, mode }`; `FoodSearchModal` consumes that return value and must not re-implement the stage sequencing inline. Keep the fail-closed legacy single-call path (`sendOpenRouterMessage`, `mode: 'processing'`) and the single-entry presentation skip (`shouldSkipPresentationPass`) intact.
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
19. **Daily NEAT overrides persist via sharded history, not profile:** `dailyNeatOverrides` lives in the Dexie history split (`HISTORY_FIELDS`) with per-date sharding (`dailyNeatOverrides:YYYY-MM-DD`) so only changed days are written. Add/remove any change to this field via the store action `setDailyNeatOverride(...)`; on load, `mergeWithDefaults()` drops invalid date keys and clamps multipliers. Do not reintroduce a profile or Preferences fallback for this data.
