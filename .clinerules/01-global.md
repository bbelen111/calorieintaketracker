# Energy Map Calorie Tracker - Global AI Coding Instructions

## Project Overview

React + Vite single-page app for fitness calorie tracking, wrapped by Capacitor for mobile deployment (iOS/Android). Local-first architecture with Zustand state management, Dexie-backed history persistence plus Capacitor Preferences for profile/settings, and USDA-backed online food search + OpenFoodFacts barcode lookup.

**Tech Stack:**
- React 18.3.1 + Vite 5.4.11 (dev server on `localhost:5173`, `strictPort: true`)
- Capacitor 8.0.1 (`appId: com.energymap.tracker`, `webDir: dist`)
- **Persistence:** Dexie (`IndexedDB`) for history + `@capacitor/preferences` for profile/settings
- **State:** `zustand` 4.5.5 using `createWithEqualityFn` (`zustand/traditional`) with `subscribeWithSelector` middleware
- **Food Catalog Runtime:** `sql.js` (WASM SQLite reader in browser)
- Dexie 4.x (history document store)
- Framer Motion 12.23.24 (animations)
- Tailwind 3.4.17 (styling via CSS variable–based semantic tokens)
- Lucide React 0.562.0 (icons)
- **External APIs:** USDA FoodData Central (online text search via `api/usda.js`), OpenFoodFacts (barcode lookup via `api/openfoodfacts.js`), OpenRouter (AI parsing via `api/openrouter.js`)

**Key Capacitor Plugins:**
- `@capacitor/preferences` — Profile/settings storage
- `@capacitor/app` — App lifecycle, hardware back button
- `@capacitor/status-bar` — Status bar color/style per theme
- `@capacitor/keyboard` — Input handling (`resize: "none"` in config)
- `@capacitor/splash-screen` — Launch screen
- `@capacitor/barcode-scanner` — Native barcode scanning (FoodSearch barcode action)
- `@capgo/capacitor-health` — Health Connect step sync (Android only)
- `@capgo/capacitor-navigation-bar` — Android navigation bar theming

**Testing exists (Node test runner), no CI pipeline yet.** Use automated tests for touched logic and then perform manual UI checks. No router — single-page app with swipeable screen carousel.

---

## Architecture: Store + Orchestrator Pattern

### The Big Picture

```
main.jsx
  └─ App.jsx (theme management, store hydration gate)
      └─ EnergyMapCalculator.jsx (4,100+ lines — THE orchestrator)
            ├─ 5-screen carousel (useSwipeableScreens)
            │   ├─ LogbookScreen
            │   ├─ TrackerScreen
            │   ├─ HomeScreen
            │   ├─ CalorieMapScreen
            │   └─ InsightsScreen
            ├─ PhaseDetailScreen (drill-down, not in carousel)
                └─ 41 top-level useAnimatedModal instances → 56 modal-related files (51 modals + 5 panels)
                 └─ ~21 additional child-level modals inside modal components
```

### Data Flow

```
User action → Store action (updateUserData) → deriveState() recalculates (with cached hot-path helpers)
  → Zustand re-renders subscribers → subscribeWithSelector detects userData change
  → Debounced save (1s) → saveEnergyMapData() splits into profile/history
  → Profile save: Capacitor Preferences.set(profile) only when profile payload changed
  → History save: Dexie write of changed history documents only
  → On Dexie history write failure, app warns and keeps profile save semantics intact
```

### Key Architectural Decisions

1. **Single orchestrator file (`EnergyMapCalculator.jsx`)** owns all modal lifecycle state, temporary form drafts, and screen navigation. At 4,100+ lines, it's deliberately centralized — not a candidate for splitting. New modals are instantiated here.

2. **Derived state pattern:** The Zustand store's `deriveState()` owns canonical fields (`bmr`, `trainingCalories`, `totalCardioBurn`, sorted entries, resolved types). Hot-path caching is intentional (resolved type maps, sorted arrays, normalized phase state, phase view projection) and `updateUserData` short-circuits no-op mutations. Never duplicate these calculations — consume them from the store.

3. **Store initialization is async.** `setupEnergyMapStore()` is called once from `EnergyMapCalculator`, which gates rendering on `isLoaded === true` to prevent flash of default data.

4. **`main.jsx` bootstraps** by preventing pinch-to-zoom gestures (gesturestart/change/end + Ctrl+wheel), configuring Capacitor keyboard settings, and rendering `<App />` — no providers, no router.

5. **Phase domain is `phaseLogV2`-native in the store.** Legacy `phases`/`activePhaseId` are derived projections for UI compatibility and are no longer persisted or mutated directly.

6. **Daily snapshots are derived and date-keyed.** `userData.dailySnapshots` is an auto-maintained history cache (`YYYY-MM-DD` keys), generated from canonical datasets (`nutritionData`, step/training/cardio sessions, and `calculateCalorieBreakdown`) via store action `upsertDailySnapshot(dateKey, options?)`.

7. **Goal state for duration-sensitive logic is profile-canonical.** `selectedGoal` and `goalChangedAt` live in persisted `userData` (profile scope), and any “days in goal” logic should derive from these values (e.g., `goalDurationDays` from the store). Do not rely on local component state or snapshots as the sole source of current goal status.

8. **Modal rendering is now intentionally lazy for heavy surfaces.** In `EnergyMapCalculator`, high-cost fullscreen and selected high-traffic modal components are loaded with `React.lazy(...)` and mounted conditionally (`isOpen || isClosing`) inside `Suspense` boundaries. Preserve this pattern for bundle health and animation-safe close behavior.

9. **Phase creation now supports dual modes with lock-aware goal behavior.** `PhaseCreationModal` supports `creationMode: 'goal' | 'target'`. In `target` mode, end date is required and at least one target metric (`targetWeight` or `targetBodyFat`) must be provided. The store derives a smart daily energy delta from `phaseTargetPlanning` and can temporarily lock goal changes while an active phase owns the phase delta (`isGoalLockedByActivePhase`).

10. **Goal-mode prediction UX is always visible.** In `PhaseCreationModal` goal mode, keep the bottom prediction card rendered even when insufficient inputs exist; show placeholder guidance until projection inputs are complete.

11. **Goal-mode percentage projection is weight-relative, not body-fat change.** `estimateGoalModeProjection(...)` returns `predictedWeightDeltaPercent` (bodyweight-relative delta) and keeps deprecated `predictedBodyFatDeltaPercent` as a compatibility alias only.

---

## File Organization

```
src/
├─ components/EnergyMap/
│   ├─ EnergyMapCalculator.jsx   # THE orchestrator (4,100+ lines; lazy-loads heavy modals)
│   ├─ common/
│   │   ├─ ModalShell.jsx        # Core modal wrapper (singleton managers)
│   │   ├─ FoodTagBadges.jsx     # Shared food tag/source badge renderer
│   │   └─ ScreenTabs.jsx        # Tab bar + floating variant
│   ├─ modals/                   # 51 modal files in 6 subfolders + 5 fullscreen panel components
│   │   ├─ fullscreen/           # Full-screen takeover modals (WeightTracker, BodyFatTracker, StepTracker, Settings, FoodSearch)
│   │   ├─ pickers/              # Scroll-wheel value pickers (Age, Calendar, Height, MealType, etc.)
│   │   ├─ info/                 # Read-only info/reference sheets (AdaptiveThermogenesisInfo, BmiInfo, BmrInfo, CalorieBreakdown, TefInfo, etc.)
│   │   ├─ forms/                # Data entry & editing dialogs (Cardio, Goal, PhaseCreation, WeightEntry, etc.)
│   │   ├─ lists/                # Browseable/selectable lists (CardioFavourites, CardioTypeList)
│   │   └─ common/               # Shared utility modals (ConfirmActionModal)
│   ├─ screens/                  # 6 screen components
│   └─ context/                  # Empty (unused)
├─ constants/                    # Static lookup tables (domain-nested canonical modules)
│   ├─ activity/
│   │  └─ activityPresets.js     # Canonical activity multipliers/presets source
│   ├─ cardio/
│   │  └─ cardioTypes.js         # Canonical cardio metadata (MET + overlap cadence)
│   ├─ food/
│   │  ├─ foodDatabase.js        # Canonical FOOD_CATEGORIES + legacy passthrough helpers
│   │  └─ foodDatabase.sqlite    # Canonical local food catalog database (queried via sql.js)
│   ├─ goals/
│   │  └─ goals.js               # Goal definitions with calorie modifiers
│   ├─ meal/
│   │  └─ mealTypes.js           # MEAL_TYPE_ORDER + meal type helpers
│   ├─ phases/
│   │  └─ phaseTemplates.js      # Phase creation templates
├─ hooks/
│   ├─ useAnimatedModal.js       # Modal lifecycle (isOpen/isClosing/requestClose)
│   ├─ useHardwareBackButton.js  # Native back handling (home-first + double-exit)
│   ├─ useSwipeableScreens.js    # 5-screen horizontal carousel
│   ├─ useHealthConnect.js       # Android Health Connect integration
│   ├─ useNetworkStatus.js       # Online/offline detection
│   └─ useScrollOffScreen.js     # Floating tab bar trigger
├─ store/
│   └─ useEnergyMapStore.js      # Zustand store: state, actions, derived values, persistence
│                                #   calculateBreakdown(steps, isTrainingDay, options?) — options.tefContext + options.adaptiveThermogenesisContext forwarded to core calc
│                                #   calculateTargetForGoal(steps, isTrainingDay, goalKey, options?) — 2-pass refinement for target TEF mode
├─ utils/
│   ├─ calculations/
│   │  ├─ calculations.js        # Core calorie formulas — BMR/cardio/training/TDEE/TEF
│   │  ├─ adaptiveThermogenesis.js # Adaptive thermogenesis mode resolution + crude/smart correction engine
│   │  ├─ dailySnapshots.js      # Derived daily snapshot builder + equality helpers
│   │  ├─ healthConnectWindow.js # Strict Health Connect step-read window helper (guarantees end > start)
│   │  ├─ epoc.js                # Session EPOC estimate + carryover window resolution
│   │  ├─ goalAlignment.js       # Weight trend vs goal alignment evaluation
│   │  ├─ phaseTargetPlanning.js # Target-mode phase planning (delta estimation + feasible date bands)
│   │  ├─ macroRecommendations.js # Macro target recommendation engine with profile anchoring and constraint-based logic
│   │  ├─ sessionCarryover.js    # Allocates carryover calories across date boundaries
│   │  └─ steps.js               # Step range parsing, step calorie estimation, getStepDetails
│   ├─ data/
│   │  ├─ dateKeys.js            # Canonical local/UTC date key formatters (`YYYY-MM-DD`)
│   │  ├─ historyDatabase.js     # Dexie history DB adapter + sharded document helpers
│   │  ├─ phaseLogV2.js          # Normalized phase/log domain; source-of-truth for phase state
│   │  └─ storage.js             # Orchestrates profile (Preferences) + history (Dexie) persistence
│   ├─ measurements/
│   │  ├─ bodyFat.js             # Body fat validation, trend analysis, sparklines
│   │  ├─ profile.js             # Age/height sanitization helpers (sanitizeAge, sanitizeHeight, AGE/HEIGHT min/max constants)
│   │  └─ weight.js              # Date normalization, weight clamping, sorting, trend analysis, sparklines
│   ├─ food/
│   │  ├─ foodPresentation.js    # Food display naming helpers (brand + name formatting)
│   │  ├─ foodTags.js            # Canonical food source/type resolver + badge metadata/classes
│   │  ├─ aiPresentationMerge.js # RAG presentation→verified merge guardrails (name rewrite + nutrition integrity)
│   │  └─ portionNormalization.js # AI/lookup portion→grams normalization + per100g scaling helpers
│   ├─ formatting/
│   │  ├─ format.js              # Number formatting (formatOne: 1 decimal place)
│   │  └─ time.js                # Time/duration helpers (normalize, round, format, split)
│   ├─ phases/
│   │  └─ phases.js              # Phase metrics calculation
│   ├─ visuals/
│   │  ├─ bezierPath.js          # SVG cubic Bézier curve interpolation for charts
│   │  ├─ scroll.js              # Scroll utilities
│   │  └─ trackerHelpers.jsx
│   ├─ theme.js                  # Native theme application (status bar, transparent nav bar, keyboard)
│   ├─ export.js                 # CSV/JSON export generation
├─ services/
│   ├─ openrouter.js             # OpenRouter client + mode helpers (extraction/presentation/grounding)
│   ├─ foodCache.js              # Cached food dedupe/trim helpers
│   ├─ foodLookupContext.js      # Batch AI entry lookup context resolver + normalized lookup meta
│   ├─ foodSearch.js             # Local/USDA/grounded lookup orchestration + deterministic AI entry resolution
│   ├─ ragTelemetry.js           # RAG telemetry aggregation + diagnostics helpers
│   ├─ usda.js                   # USDA online search client
│   ├─ openFoodFacts.js          # OpenFoodFacts barcode lookup client
│   ├─ barcodeScanner.js         # Official Capacitor barcode scanner wrapper
│   └─ foodCatalog.js            # SQLite-backed local food catalog service (sql.js)
├─ scripts/
│   └─ food-db/
│      ├─ index.js               # Offline food DB audit/clean/replace pipeline
│      └─ config/
│         └─ taxonomy.js         # Canonical taxonomy maps + alias/portion sanitation config
└─ tests/                        # Node test runner suite (`node --test`)
  ├─ api/
  │   └─ openrouter.contract.test.js
  ├─ constants/
  │   └─ activityPresets.test.js
  ├─ services/
  │   ├─ foodLookupContext.test.js
  │   ├─ foodSearch.test.js
  │   ├─ openFoodFacts.test.js
  │   ├─ ragTelemetry.test.js
  │   └─ usda.test.js
  └─ utils/
    ├─ aiPresentationMerge.test.js # Presentation merge guardrail tests (sparse entries, rewrite suppression, integrity fallback)
    ├─ openrouter.test.js
    ├─ macroRecommendations.test.js
    ├─ portionNormalization.test.js
    ├─ calculations.test.js
    ├─ dateKeys.test.js
    ├─ adaptiveThermogenesis.test.js
    ├─ dailySnapshots.test.js    # Snapshot derivation and helper behavior tests
    ├─ phaseLogV2.test.js
    ├─ phases.test.js
    ├─ sessionCarryover.test.js
    ├─ steps.test.js
    ├─ foodTags.test.js
    ├─ storage.sharding.test.js
    └─ storage.test.js           # Persistence split + Dexie-first behavior tests
```

---

## Development Workflow

```powershell
npm install            # First time setup
npm run dev            # Vite dev server (localhost:5173, strictPort)
npm run build          # Production build → dist/
npx cap sync           # Sync dist/ to native projects
npx cap open android   # Open in Android Studio
npx cap open ios       # Open in Xcode (Mac only)
```

```powershell
npm run lint           # ESLint check (flat config, Babel parser, Prettier integration)
npm run lint:fix       # Auto-fix lint issues
npm run format         # Prettier formatting
npm run test           # Node test runner
npm run test:watch     # Node test runner in watch mode
```

**Testing notes:**
- Tests use `node --test` with ESM; use explicit `.js` extensions in relative imports for test-executed modules.
- `npm run lint` can include pre-existing warnings in untouched files. Prefer targeted lint for changed files during incremental work, then full lint when practical.
- Storage tests intentionally run with in-memory `window.localStorage` shims in Node context; avoid plugin monkey-patching when possible.
- Full `npm run test` currently includes a known pre-existing failure in `tests/constants/activityPresets.test.js` (expected training multiplier `0.35`, actual `0.2`). Treat as unrelated unless touching activity preset defaults.

**ESLint config:** Flat config format (`eslint.config.js`), uses `@babel/eslint-parser` with JSX preset. `react/prop-types` is disabled. Prettier runs as an ESLint rule.

---

## Global Common Pitfalls

1. **Async storage:** `Preferences.get()`/`.set()` are async. Always `await` or use the store (which handles it internally).
2. **Save debounce:** The 1-second debounce in `setupEnergyMapStore` is critical. Removing it causes UI freezes from serializing large JSON on every keystroke.
3. **Dexie is the only history persistence path:** Do not reintroduce Preferences history fallback/backfill logic.
4. **Save failure semantics:** If Dexie history write fails, persistence risk warning is expected and should remain explicit.
5. **Warnings should indicate real risk only:** Avoid noisy warnings unless a write was rejected or explicitly failed.
6. **Legacy phase migration path is removed:** Do not add runtime conversion/import logic for legacy `phases` payloads.
7. **Avoid full rewrite assumptions:** `saveEnergyMapData` writes changed profile/history segments only; avoid changes that force unconditional large writes.
8. **No dual-write toggle exists anymore:** Do not add `VITE_ENABLE_HISTORY_DUAL_WRITE`-style rollback flags back into normal save flow.
9. **Node ESM import hygiene:** For modules used in tests, keep explicit `.js` file extensions in relative imports to avoid `ERR_MODULE_NOT_FOUND`.
10. **Startup profile reads are parallelized:** Keep profile and last selected cardio-type `Preferences.get(...)` calls parallelized during hydration.
11. **Hook frame-throttling is intentional:** Keep RAF scheduling/equality guards in `useScrollOffScreen` and `useSwipeableScreens` to limit high-frequency layout/state churn on mobile.
12. **Backup/report artifacts are generated files:** `src/constants/*.backup.sqlite` and `scripts/food-db/reports/*.json` should remain ignored and not committed.
13. **OpenRouter proxy hardening is config-sensitive:** keep `ALLOWED_ORIGINS` and (if enabled) Upstash rate-limit env vars configured in deployment; mismatched env config can silently alter CORS/throttling behavior across environments.
