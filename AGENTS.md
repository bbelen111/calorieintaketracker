# Energy Map Calorie Tracker - AI Coding Instructions

## Project Overview

React + Vite single-page app for fitness calorie tracking, wrapped by Capacitor for mobile deployment (iOS/Android). Local-first architecture with Zustand state management, Dexie-backed history persistence plus Capacitor Preferences for profile/settings, and Supabase-catalog-backed online food search + OpenFoodFacts barcode lookup.

**Tech Stack:**
- React 18.3.1 + Vite 8.2.0 (dev server on `localhost:5173`, `strictPort: true`)
- Capacitor 8.0.1 (`appId: com.energymap.tracker`, `webDir: dist`)
- **Persistence:** Dexie (`IndexedDB`) for history + `@capacitor/preferences` for profile/settings
- **State:** `zustand` 4.5.5 using `createWithEqualityFn` (`zustand/traditional`) with `subscribeWithSelector` middleware
- **Food Catalog Runtime:** `sql.js` (WASM SQLite reader in browser)
- Dexie 4.x (history document store)
- Framer Motion 12.23.24 (animations)
- Tailwind 3.4.17 (styling via CSS variable–based semantic tokens)
- Lucide React 0.562.0 (icons)
- **External APIs:** Supabase food catalog (online text search via `api/foods.js`; legacy `/api/usda` alias retained), OpenFoodFacts (barcode lookup via `api/openfoodfacts.js`), OpenRouter (AI parsing via `api/openrouter.js`)

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
                └─ 44 top-level useAnimatedModal instances → 59 modal-related files (54 modals + 5 panels)
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

  - **Vite 8 / Rolldown chunking:** `build.rollupOptions.output.manualChunks` must be a function. The older object-map form throws `manualChunks is not a function` and prevents `dist/index.html` from being emitted, which breaks Capacitor sync.

3. **Store initialization is async.** `setupEnergyMapStore()` is called once from `EnergyMapCalculator`, which gates rendering on `isLoaded === true` to prevent flash of default data.

4. **`main.jsx` bootstraps** by preventing pinch-to-zoom gestures (gesturestart/change/end + Ctrl+wheel), configuring Capacitor keyboard settings, and rendering `<App />` — no providers, no router.

5. **Phase domain is `phaseLogV2`-native in the store.** Legacy `phases`/`activePhaseId` are derived projections for UI compatibility and are no longer persisted or mutated directly.

6. **Daily snapshots are derived and date-keyed.** `userData.dailySnapshots` is an auto-maintained history cache (`YYYY-MM-DD` keys), generated from canonical datasets (`nutritionData`, step/training/cardio sessions, and `calculateCalorieBreakdown`) via store action `upsertDailySnapshot(dateKey, options?)`.

7. **Goal state for duration-sensitive logic is profile-canonical.** `selectedGoal` and `goalChangedAt` live in persisted `userData` (profile scope), and any “days in goal” logic should derive from these values (e.g., `goalDurationDays` from the store). Do not rely on local component state or snapshots as the sole source of current goal status.

8. **Modal rendering is now intentionally lazy for heavy surfaces.** In `EnergyMapCalculator`, high-cost fullscreen and selected high-traffic modal components are loaded with `React.lazy(...)` and mounted conditionally (`isOpen || isClosing`) inside `Suspense` boundaries. Preserve this pattern for bundle health and animation-safe close behavior.

9. **Phase creation now supports dual modes with lock-aware goal behavior.** `PhaseCreationModal` supports `creationMode: 'goal' | 'target'`. In `target` mode, end date is required and at least one target metric (`targetWeight` or `targetBodyFat`) must be provided. The store derives a smart daily energy delta from `phaseTargetPlanning` and can temporarily lock goal changes while an active phase owns the phase delta (`isGoalLockedByActivePhase`).
10. **Goal-mode prediction UX is always visible.** In `PhaseCreationModal` goal mode, keep the bottom prediction card rendered even when insufficient inputs exist; show placeholder guidance until projection inputs are complete.
11. **Goal-mode percentage projection is weight-relative, not body-fat change.** `estimateGoalModeProjection(...)` returns `predictedWeightDeltaPercent` (bodyweight-relative delta) and keeps deprecated `predictedBodyFatDeltaPercent` as a compatibility alias only.
12. **The swipe shell is a coordinated design system:** full-bleed carousel viewport + 16px edge peek with alpha-faded neighbour slides, a floating glass bottom tab bar (`ScreenTabs`), and a header zone (`AppHeader`) with greeting + per-screen glanceable stats + drag-linked swipe dots. All peek/peek-fade/bar/dot geometry constants are inline **px** (the app root font is rem-based: 13px mobile / 17px desktop) and have hard sync points — see Screen Components.

---

## Zustand Store (`store/useEnergyMapStore.js`)

### Subscription Patterns ⚠️

```jsx
// ✅ CORRECT — selective subscription with shallow comparison (prevents unnecessary re-renders)
const { bmr, trainingCalories, userData } = useEnergyMapStore(
  (state) => ({ bmr: state.bmr, trainingCalories: state.trainingCalories, userData: state.userData }),
  shallow
);

// ✅ CORRECT — single value selector (no shallow needed)
const isLoaded = useEnergyMapStore((state) => state.isLoaded);

// ❌ AVOID — spreading entire state (re-renders on every store change)
const store = useEnergyMapStore((state) => ({ ...state }));
```

### Store Actions

All mutations go through `updateUserData(set, get, updater)` which:
1. Applies the updater function to `state.userData`
2. Calls `deriveState(nextUserData)` to recompute all derived values
3. Calls `set()` with both the new `userData` and derived fields

**Adding a new store action:**
```javascript
myNewAction: (param) => {
  updateUserData(set, get, (prev) => ({
    ...prev,
    myField: transformedValue,
  }));
},
```

**Daily NEAT override action:** `setDailyNeatOverride(dateKey, overrideOrNull)` upserts one date's override (normalizes the date, clamps the multiplier with `clampCustomActivityMultiplier()` to 0.1–1.0, coerces `presetKey`/`label` to strings or `null`, stamps `updatedAt`), or deletes the date's record when `overrideOrNull == null`. After a change it calls `upsertDailySnapshot(normalizedDate)` so TDEE / snapshots / rolling balance update immediately. Uses `updateUserData` (short-circuits on no-op) exactly like other actions.

### Persistence Setup

`setupEnergyMapStore()` (called once) does two things:
1. Calls `initialize()` to load profile from Preferences + history from Dexie
2. Subscribes to `userData` changes with a 1-second debounced save (`SAVE_DEBOUNCE_MS = 1000`)

**Critical:** Do not remove the debounce — saving 2MB+ JSON on every keystroke freezes the UI.

**Also critical:** The debounced callback is async and must retain try/catch handling to avoid unhandled save failures.

**Startup note:** `loadEnergyMapData()` intentionally reads `energyMapData_profile` and `energyMapLastSelectedCardioType` in parallel via `Promise.all(...)` before merging Dexie history.

### Daily Snapshot Lifecycle

- Snapshot source-of-truth is **derived**, never authored manually.
- Store action: `upsertDailySnapshot(dateKey, options?)`.
- Snapshot includes denormalized goal metadata (`goalAtSnapshot`) for historical charts/debugging; this is analytic context, not canonical goal state.
- Auto-triggers:
  - Hydration: seed yesterday + today if missing.
  - Mutation-driven updates: food, steps, cardio sessions, training sessions.
  - Day rollover: finalize previous day + seed current day.
  - Native app resume: catch up if midnight passed while backgrounded.
- Equality checks ignore `createdAt` / `updatedAt` metadata so idempotent upserts do not churn writes.
- Snapshot equivalence is field-wise (metadata excluded) rather than JSON stringify-based; preserve that behavior for performance.

### Legacy: `useEnergyMapData` Hook

Removed from the codebase. **Do not reintroduce** full-store spread wrappers; use direct store selectors with `shallow` where appropriate.

---

## Modal System

### Modal Count

- **48 top-level `useAnimatedModal()` instances** in `EnergyMapCalculator.jsx` (top-level orchestrator)
- **~21 additional child-level modals** declared inside modal components (e.g., delete confirmations, sub-pickers)
- **59 modal component files** organised into 6 subfolders inside `src/components/EnergyMap/modals/`, plus 5 supporting panel components under `fullscreen/panels/`:
  - `fullscreen/` — WeightTrackerModal, BodyFatTrackerModal, StepTrackerModal, SettingsModal, FoodSearchModal, AdaptiveThermogenesisModal, RollingEnergyBalanceModal
  - `pickers/` — AgePickerModal, CalendarPickerModal, **CaloriesPerHourPickerModal**, DatePickerModal, DurationPickerModal, EpocWindowPickerModal, FoodPortionModal, HeartRatePickerModal, HeightPickerModal, **MacroPickerModal**, MealTypePickerModal, MetValuePickerModal, **NumericValuePickerModal**, StepGoalPickerModal, TemplatePickerModal, TimePickerModal
  - `info/` — AdaptiveThermogenesisInfoModal, BmiInfoModal, BmrInfoModal, BodyFatTrendInfoModal, CalorieBreakdownModal, CaloriesPerHourGuideModal, DayLedgerModal, EpocInfoModal, FfmiInfoModal, TefInfoModal, WeightTrendInfoModal
  - `forms/` — AddCustomFoodModal, BarcodeEntryModal, BodyFatEntryModal, CardioModal, CustomCardioTypeModal, DailyActivityCustomModal, DailyActivityEditorModal, DailyActivityModal, DailyLogModal, **DailyNeatOverrideModal**, FoodEntryModal, GoalModal, PhaseCreationModal, TrainingModal, StepRangesModal, TrainingTypeEditorModal, WeightEntryModal
  - `lists/` — CardioFavouritesModal, CardioTypeListModal, CalorieTargetModal, DayLedgerListModal
  - `common/` — ConfirmActionModal
- Total across codebase: ~69 modal hook instances (`useAnimatedModal`)

### Adaptive Thermogenesis Frontend

- `AdaptiveThermogenesisModal` (`modals/fullscreen/`) is the fullscreen, lazy-loaded frontend for the AT subsystem. It subscribes to the store and recomputes both `crude` and `smart` results live, rendering Crude/Smart tabs over the exported `CRUDE_CUT_STAGES`/`CRUDE_SURPLUS_STAGES` timeline.
- `InsightsScreen` renders an `AdaptiveCorrectionCard` preview and opens the modal via the `onOpenAdaptiveThermogenesis` prop.
- Wire it like any other top-level modal: `useAnimatedModal()`, register in `isAnyModalOpen` + `closeTopmostModal` + deps, and lazy `React.lazy(...)` with an `isOpen || isClosing` mount guard.

### Rolling Energy Balance Frontend

- `RollingEnergyBalanceModal` (`modals/fullscreen/`) is the fullscreen, lazy-loaded analytics surface for the longitudinal rolling energy balance. It subscribes to `userData.dailySnapshots`, `weightEntries`, and the derived `goalDailyBalanceTarget`, then recomputes the window summary via `calculateRollingEnergyBalance(...)` in a `useMemo`.
- Backed by the pure calculator `utils/calculations/rollingEnergyBalance.js` (windows 3/7/14/28 days, default 7). It consumes the already-computed snapshot `tdee`/`intake` — it never rebuilds TDEE. Per-day balance `= tdee - intake` (positive = deficit, negative = surplus). Missing days are unavailable, never zero. Missing/malformed snapshots and future dates are excluded.
- `InsightsScreen` renders a `RollingBalancePreviewCard` (7-day headline) and opens the modal via the `onOpenRollingEnergyBalance` prop.
- Wire it like any other top-level modal: `useAnimatedModal()`, register in `isAnyModalOpen` + `closeTopmostModal` + deps, and lazy `React.lazy(...)` with an `isOpen || isClosing` mount guard.
- **Animations (reuse the app's CSS conventions, not a new design system):**
  - The window selector uses a **single persistent sliding pill** with inline `transition: left 0.28s cubic-bezier(0.32, 0.72, 0, 1)...` (same pattern as `AdaptiveThermogenesisModal`/`WeightTrackerModal`).
  - The content wrapper is keyed by `windowDays` and tagged `tracker-graph-switch` so switching windows re-plays a subtle fade/translate page transition.
  - The bar-chart `<rect>`s carry `tracker-bar-animated` so bars grow in (`trackerBarIn`). Both benefit from the global `prefers-reduced-motion` fallback in `index.css`.
  - **Do not** leave a sliding-pill as per-button conditional remounts (no `transition` → no slide); always keep one persistent pill and animate `left`/`transform`.


### Daily NEAT Override Frontend

- `DailyNeatOverrideModal` (`modals/forms/DailyNeatOverrideModal.jsx`) is the session quick-sheet for today's **daily NEAT override**. It is mounted with an `isOpen || isClosing` guard, keyed by a version counter so it re-freshes its selection state on each open (no setState-in-effect on open).
- It renders a curated set of preset cards from `ACTIVITY_PRESET_OPTIONS[dayType]` plus a **"Use my settings (default)"** clear action. Selecting a preset stages an apply; `onApply({ multiplier, presetKey, label })` saves the override, `onClear()` clears today's override and falls back to the global setting.
- The top-right day pill is **color-coded by day type**: Training Day = `text-accent-blue` + **Dumbbell** icon, Rest Day = `text-accent-indigo` + **Bed** icon (via `DAY_PILL_CLASS` / `DAY_ICON_BY_KEY`).
- **Home entry point:** In `HomeScreen`'s "Today's Activity Burn" hero, the **NEAT metric block** (icon + label + kcal) is the touch target — it carries a faint underline + chevron affordance, opens the override modal via `onOpenDailyActivityOverride`, and tints green when today's override is active. The **"~X% of daily TDEE"** pill there is a separate button wired to `onOpenTodayBreakdown`, which opens the `CalorieBreakdownModal` for today.
- **Calculation wiring:** save via the store action `setDailyNeatOverride(dateKey, overrideOrNull)`; the multiplier is applied in `calculateCalorieBreakdown` (override-first, clamped). No duplicate override logic in UI components.
- Wire it like any other sequencing modal: `useAnimatedModal()`, register in `isAnyModalOpen` + `closeTopmostModal` + deps. It is lightweight (no `React.lazy`), matching other short session modals.


### Daily Ledger Frontend (Logbook)

- Entry point: `LogbookScreen` renders a `DayLedgerCard` at the **bottom** of Logbook (after Completed Phases), styled with HomeScreen session-row grammar (`bg-surface-highlight/50 rounded-lg p-4 border-border/50`, bare accent icon, semibold title, group-hover chevron); opens `DayLedgerListModal` via `onOpenDayLedger`.
- `DayLedgerListModal` (`modals/lists/DayLedgerListModal.jsx`) is a lazy-loaded calendar browser over `dailySnapshots`: fixed 42-cell grid (always 6 weeks, mirroring `CalendarPickerModal`), swipeable month navigation, balance-kind cell coloring via `DAY_LEDGER_BALANCE_META`, a balance-kind legend, and a Today jump.
- Month/year pickers anchor beneath the nav row via a `relative` wrapper + `absolute inset-x-0 top-full mt-2 flex justify-center pointer-events-none`; Framer Motion animates only the inner card. Never position these overlays with invalid Tailwind classes (`left-1/5`, `top-29`) or Tailwind translate utilities on Motion-animated elements.
- The bottom **dual-mode panel keeps ONE stable fixed height (`h-[230px]`) for every state**: month summary, day-preview, and empty all render inside the same fixed-height container (`relative h-[230px]`) so surrounding content never moves during any interaction (BF toggle, mode switch, selection changes). Panels are anchored `absolute inset-0` with `overflow-y-auto` inner scrolling; never animate or dynamically resize the container height — animated resizing reintroduces exactly the layout shift the fixed height exists to prevent: picking a tracked day swaps in a tappable day-preview (tap again opens `DayLedgerModal` via `onOpenDayDetail`); deselecting or changing month falls back to the month summary. Month summary = 2×2 `SummaryTile` grid (Avg Energy combined, Balance avg+total kind-colored via `getDailyBalanceKind`, Avg Weight + conditional `% BF`, Avg Steps). The day panel shows Weight + BF tiles when `bodyFatTrackingEnabled`, else Weight + combined Sessions card (Cardio/Training split).
- `bodyFatTrackingEnabled` must be forwarded from the orchestrator; BF-off swaps tile contents instead of hiding rows.
- `DayLedgerModal` (`modals/info/DayLedgerModal.jsx`) is the read-only detail sheet: measurements strip via `getMeasurementForDate`, single TDEE energy card that opens the production lazy `CalorieBreakdownModal` recomputed for that historical day through orchestrator `handleOpenDayLedgerBreakdown(dateKey)` (steps + dynamic TEF totals + AT context + `dateKey`; the store applies date-scoped NEAT). It renders the snapshot's `goalAtSnapshot` and that day's training flag.
- Wire both like any top-level modal: `useAnimatedModal()` (the detail modal uses `MODAL_CLOSE_DELAY`), register in `isAnyModalOpen` + `closeTopmostModal` + deps, lazy `React.lazy(...)` with an `isOpen || isClosing` mount guard.
- All display math lives in `utils/calculations/dayLedgerPresentation.js`; both modals are thin renderers (see 03-state-and-calcs / State & Calculations docs).


### Modal Performance Loading Strategy

- Heavy fullscreen modals are lazy-loaded via `React.lazy(...)` in `EnergyMapCalculator`.
- Selected additional heavyweight modals are also lazy-loaded (`CalorieBreakdownModal`, `TrainingModal`, `CardioModal`, `PhaseCreationModal`, `DailyLogModal`).
- Mounting uses `isOpen || isClosing` guards to preserve exit animations and prevent unmounting during close transitions.
- Keep `fallback={null}` unless introducing a deliberate loading affordance that does not break modal stack timing.

### Food Search/Favourites UI Architecture

- `FoodSearchModal` is the **canonical** food favourites UI surface (`viewMode === 'favourites'`).
- `FoodFavouritesModal` was removed as redundant and should **not** be reintroduced.
- `FoodSearchModal` is now a **4-mode surface**: local search, online search, favourites, and AI chat (`viewMode` + `searchMode` state machine).
- `FoodSearchModal` now composes focused panel components from `modals/fullscreen/panels/`:
  - `FoodSearchChatPanel.jsx`
  - `FoodSearchFilterControls.jsx`
  - `FoodSearchMealPreviewPanel.jsx`
  - `FoodSearchResultsPanel.jsx`
  - `FoodSearchFavouritesPanel.jsx`
  - `FoodSearchEntryCard.jsx` — renders one finalized chat entry card (primary badge + disclosure chip labels) from `buildFinalizedEntryCardState()` in `utils/food/aiFinalizedEntryState.js`
  Keep panel responsibilities isolated and avoid moving large inline JSX blocks back into `FoodSearchModal`.
- The **RAG chat request flow is decoupled from the modal**: `FoodSearchModal` calls `runRagChatPipeline(...)` in `services/ragChatPipeline.js` (with injected OpenRouter `modules` + `telemetry`). The modal owns only the chat state machine, stage pill, abort controller, and assistant-bubble entry rendering. Do not re-inline extraction/retrieval/verification/presentation steps into the modal.
- Local result rendering uses **progressive batches** (`visibleResultCount`) to reduce mount/paint cost on large datasets:
  - Local batch size: `120`
  - Online batch size: `80`
  - "Show more" increments visible rows and can trigger additional local DB page fetches.
- Local DB paging in search mode uses `LOCAL_DB_QUERY_PAGE_SIZE = 500` with offset-based fetches when users load more.
- **Online mode pages server-side too**: each fetch requests up to `ONLINE_SEARCH_PAGE_SIZE` (50, the RPC cap) and "Show more" appends the next page via `performOnlineSearch(query, { append: true })` with ID-dedupe. A request-id guard (`onlineSearchRequestIdRef`) drops stale responses so a slow earlier query can never overwrite newer results, and the paging cursor resets on query/mode changes.
- Filter/result header intentionally shows **current loaded count only** in search mode (e.g. `240 foods found`) and updates as more rows are loaded.
- Online mode remains debounced (`DEBOUNCE_DELAY = 500ms`) and enforces a minimum query length (`2` chars).
- Long-press pinning is owned by `FoodSearchModal` UI interaction (`LONG_PRESS_DURATION = 650ms`) and persists through store `togglePinnedFood`.
- Local search pin hydration is data-layer-backed: pinned IDs are fetched by ID even when they fall outside the top limited query window.
- Food tag rendering is now centralized via `components/EnergyMap/common/FoodTagBadges.jsx`.
- Food source/type resolution is centralized in `utils/foodTags.js`.
- Food display naming is centralized in `utils/foodPresentation.js` (`formatFoodDisplayName`).
- Brand presentation rule: display brand in name as **`Brand - Food name`**; avoid separate brand tag chips in food list cards.

### FoodSearchModal Search Data Flow

```
Local mode:
FoodSearchModal
  -> searchFoodsLocal(...) in services/foodSearch.js
    -> searchFoods(..., limit, offset) in services/foodCatalog.js (SQLite/sql.js)
    -> getFoodsByIds(...) for first-page pinned hydration
  -> merge local rows + cached rows + custom foods
  -> client-side category/subcategory/sort filters
  -> pinned-first ordering + progressive rendering
  -> load-more can request additional SQLite pages via offset

Online mode:
FoodSearchModal
  -> debounced searchFoodsOnline(...) in services/foodSearch.js
    -> services/foodCloud.js
  -> preview rows + cache-on-select flow

AI chat mode (feature-flagged RAG path):
FoodSearchModal (chat state machine, stage pill, abort controller, entry rendering)
  -> runRagChatPipeline(...) in services/ragChatPipeline.js   # decoupled orchestration; unit-testable with stubbed OpenRouter modules
    stage: extraction     -> sendOpenRouterExtraction(...) in services/openrouter.js (mode='extraction')
                              -> retry short-circuit with constrained prompt when extraction idles (clarification/error/no entries)
                              -> grounded single-entry fallback via fetchMacrosWithGrounding (mode='grounding_lookup') for low-confidence extraction
                              -> fail-closed: legacy single-call path (sendOpenRouterMessage, mode='processing') when extraction module is unavailable
    stage: retrieval      -> resolveFoodLookupContext(...) in services/foodLookupContext.js
                              -> local lookup (foodCatalog), online catalog lookup (services/foodCloud.js), deferred grounding batch (fetchMacrosWithGrounding, mode='grounding_lookup')
    stage: verification   -> resolveAiFoodEntry(...) per entry in services/foodSearch.js (deterministic verified entries)
    stage: presentation   -> skipped for single-entry/simple results (shouldSkipPresentationPass -> buildVerifiedResultFromEntries)
                              -> sendOpenRouterPresentation(...) in services/openrouter.js (mode='presentation', [SYSTEM_DATA])
                              -> mergePresentationEntriesWithVerified(...) in utils/food/aiPresentationMerge.js
                                -> sparse/misaligned guardrails
                                -> significant name rewrite suppression
                                -> macro-calorie integrity validation + verified fallback on mismatch
  -> pipeline returns { result, lookupContext, schemaVersion, extractionSchemaVersion, presentationSkipped, mode }
  -> final lookup-context reconciliation for any branch that produced entries without pre-resolved context
  -> assistant entries hydrated via mergeEntriesWithLookupContext(messagesId-keyed stable keys)
  -> entry cards finalized via buildFinalizedEntryCardState(...) in utils/food/aiFinalizedEntryState.js, rendered by FoodSearchEntryCard.jsx
  -> provenance-first rendering in FoodSearchChatPanel (Verified Database / Reused / Web Estimate / AI Estimate)
  -> reason-coded trace diagnostics + recovery hints (canonical registry services/foodLookupReasons.js; re-exported by services/foodLookupContext.js)
  -> telemetry: services/ragTelemetry.js (stage latency, extraction outcome, lookup stats, presentation name drift, presentation issues)
```

### `useAnimatedModal` Hook

```javascript
const myModal = useAnimatedModal(initiallyOpen = false, animationDuration = 180);
// Returns: { isOpen, isClosing, open, requestClose, forceClose }
```

- **`open()`** — Sets `isOpen = true`, clears any pending close timeout
- **`requestClose()`** — Sets `isClosing = true`, waits 180ms, then sets `isOpen = false`. **Always use this for closing.**
- **`forceClose()`** — Immediately unmounts. Only for edge cases (breaks exit animation).
- **`isClosing`** — CSS exit animations key off this flag

### Creating a New Modal

1. Choose the right subfolder based on the modal type:
   - `fullscreen/` — takes up the entire screen (`fixed inset-0 w-screen h-screen`)
   - `pickers/` — scroll-wheel value selectors (numbers, dates, durations)
   - `info/` — read-only reference/explanation sheets
   - `forms/` — data entry / editing dialogs
   - `lists/` — browseable/selectable lists of items
   - `common/` — shared utility modals reused across many features (e.g. confirm dialogs)

2. Create `modals/<subfolder>/MyNewModal.jsx` — note `ModalShell` is now two levels up:
```jsx
import { ModalShell } from '../../common/ModalShell';

export const MyNewModal = ({ isOpen, isClosing, onClose, onSave, /* data props */ }) => (
  <ModalShell isOpen={isOpen} isClosing={isClosing} contentClassName="w-full md:max-w-2xl p-6">
    <h3 className="text-foreground font-bold text-xl mb-4">Title</h3>
    {/* Content using semantic theme classes */}
    <div className="flex gap-2 mt-4">
      <button onClick={onClose} className="bg-surface text-muted press-feedback focus-ring">Cancel</button>
      <button onClick={onSave} className="bg-primary text-primary-foreground press-feedback focus-ring">Save</button>
    </div>
  </ModalShell>
);
```

3. In `EnergyMapCalculator.jsx`:
```jsx
import { MyNewModal } from './modals/<subfolder>/MyNewModal';
// ...
const myNewModal = useAnimatedModal();
// ...in JSX:
<MyNewModal
  isOpen={myNewModal.isOpen}
  isClosing={myNewModal.isClosing}
  onClose={myNewModal.requestClose}
  onSave={handleSave}
/>
```

### ModalShell Architecture

`ModalShell` (`common/ModalShell.jsx`) uses **two singleton managers**:
- **`ModalStackManager`** — Assigns wrapper z-index in **2-step lanes** (`BASE_Z_INDEX=1000`, then `+2` per stacked modal), tracks `isClosing`, resolves topmost modal, and computes stack depth.
- **`BodyScrollLockManager`** — Reference-counted body scroll lock with scrollbar width compensation.

Darkening is **per-modal overlay wrapper**, not a shared overlay singleton. Each modal calculates cumulative target darkness by depth, then converts it to a per-layer opacity (`calculateStackTargetOpacity` + `calculateLayerOpacity`) so nested stacks darken progressively without over-darkening lower layers. Overlay fade timing is `OVERLAY_FADE_MS = 180` and content motion still uses `index.css` modal animations (`modalSlideUp`/`modalSlideDown`).

Additional implementation details to preserve:
- `overlayClassName` is sanitized to strip `bg-*` utilities so backdrop color remains controlled by inline opacity math.
- Only the **topmost non-closing modal** handles Escape and overlay-click close; non-top layers disable content pointer events.
- Native keyboard-resize handling locks overlay/content height from `visualViewport` and only recalculates on large viewport deltas to avoid modal squish.

### Temporary State Pattern

Temp state for modal forms lives in `EnergyMapCalculator`, **not** in the modal component:

```jsx
// In EnergyMapCalculator.jsx
const [tempDraft, setTempDraft] = useState(null);

// Reset temp state on close — delay matches animation duration
useEffect(() => {
  if (myModal.isClosing) {
    setTimeout(() => setTempDraft(null), MODAL_CLOSE_DELAY); // 180ms
  }
}, [myModal.isClosing]);
```

### Nested Modal Timing

For nested modal stacks, explicitly pass `MODAL_CLOSE_DELAY` for consistency with parent close timing:
```javascript
const childModal = useAnimatedModal(false, MODAL_CLOSE_DELAY); // keep close timing aligned
```

### Reusable Confirm Modal

For delete/destructive actions, use the existing `ConfirmActionModal` pattern:
```jsx
// Set state, then open:
setConfirmActionTitle('Delete Entry?');
setConfirmActionDescription('This cannot be undone.');
setConfirmActionLabel('Delete');
setConfirmActionTone('danger'); // 'danger' | 'success' | default blue
setConfirmActionCallback(() => () => performDelete());
confirmActionModal.open();
```

---

## Screen Components

### Carousel Structure (full-bleed + edge peek)

`useSwipeableScreens(5, viewportRef, initialScreen=2)` manages a horizontal carousel. All 5 screens render simultaneously as `carousel-slide` elements (width `calc(100% - 32px)` — 16px inset per side) inside a **full-bleed viewport** (`-mx-4 md:-mx-6` on the content container), so the 16px neighbour insets sit flush against the screen edge.

- **Edge peek:** neighbouring screens peek 16px into view on both edges. The sliver shows real card content because the slide inner padding is tightened to `px-2` (≈6.75px) — not empty padding.
- **Alpha masks:** only the neighbouring slides (`currentScreen ± 1`, via `getSlideEdgeFadeClass(index, currentScreen)` in `EnergyMapCalculator`) carry `.slide-fade-left` / `.slide-fade-right` (20px linear-gradient masks in `index.css`), so the peeked sliver fades to true transparency — the page gradient shows through faded pixels, never an overlay tint.
- **Edge tap guards:** two invisible 16px strips (`absolute inset-y-0 z-10 w-4`) pinned inside the viewport edges absorb taps on the peek sliver so taps can never trigger hidden neighbour-screen cards. They are children of the viewport, so swipe drags still bubble to the carousel handlers.
- **Transform formula:** slider transform is `calc(PEEK*(1+2*screen) + offset px − screen*100%)` with `PEEK = SCREEN_EDGE_PEEK_PX` (16) — the peek compensation term keeps slide alignment exact.
- **Drag progress:** `applySliderTransform` publishes `--screen-drag-progress` (float 0–4) on `:root` imperatively on every transform commit. The tab-bar circle and header dots read it via `calc(...)`, so they track the finger frame-by-frame with **zero React re-renders** (preserves the hook's no-state-churn design).
- **Swipe coach mark:** a one-time "Swipe between screens" hint chip in the header is gated by the persisted `userData.hasSeenSwipeHint` flag (store action `markSwipeHintSeen()`; auto-marked on first drag or tab select).
- Viewport resize updates are `ResizeObserver`-driven but `requestAnimationFrame`-throttled with equality guards to avoid resize-state churn.
- **Rem/px hazard:** the app root font is 13px mobile / 17px desktop — all swipe-shell geometry constants are inline px (`SCREEN_EDGE_PEEK_PX=16`, `CIRCLE_SIZE_PX=44`, `BAR_HEIGHT_PX=54`, `DOT_SIZE_PX=6`, `DOT_STEP_PX=12`). Keep new geometry px-based.
- Screen order (0-indexed): **Logbook → Tracker → Home (default) → Calorie Map → Insights**

`PhaseDetailScreen` is a drill-down from Logbook, not part of the carousel.

### Screen Props Pattern

Screens receive a large props bundle from `EnergyMapCalculator` containing:
- **Data:** `userData`, `bmr`, `trainingCalories`, `weightEntries`, `bodyFatEntries`, etc.
- **Modal openers:** Callback functions like `onOpenGoalModal`, `onOpenWeightTracker`, etc.
- **UI state:** `selectedDay`, display strings, step ranges

Screens also subscribe to the store directly with `shallow` selectors as a fallback pattern. Prefer passing through props for new features.

### Bottom Tab Bar (`ScreenTabs`)

`ScreenTabs.jsx` (`common/`) is the **fixed floating glass pill bar** — it replaces the old in-flow tab bar + `FloatingScreenTabs` overlay + `useScrollOffScreen` hook (all removed; do not reintroduce):
- 54px-high fully-rounded pill (`bg-surface/35` + `backdrop-blur-2xl` + `border-border/40`), floating with margins: `2rem` sides / `1.5rem` bottom + safe-area insets (`--sal`/`--sar`/`--sab`).
- **Icon-only tabs**; the active tab is a **single persistent filled accent circle** (`CIRCLE_SIZE_PX = 44`) whose `left` is computed from `--screen-drag-progress` (transition disabled while swiping; `left 0.28s cubic-bezier(0.32, 0.72, 0, 1)` on release).
- `z-[900]` — below the ModalShell z-lanes (1000+) so modals always cover it.
- Sized in inline px so geometry stays exact regardless of the rem-based root font size.

### Header Zone (`AppHeader`)

`AppHeader.jsx` (`common/`) is the top header on every screen — a thin display component that reuses canonical helpers (`getNutritionTotalsForDate`, `calculateWeightTrend`, derived snapshot fields; no duplicated math):
- Row 1: greeting + long date (minute-interval clock) on the left; right slot swaps between the **swipe coach-mark chip** (while unseen) and the **settings gear** (`onOpenSettings` → orchestrator `settingsModal`).
- Row 2: per-screen glanceable stat line (Logbook: active phase · Tracker: selected-date calories · Home: TDEE · Calorie Map: steps · Insights: weight trend) + `SwipeDots`.
- `SwipeDots` uses px-only absolute-positioned dots (`DOT_SIZE_PX=6`, `DOT_STEP_PX=12`) plus one persistent moving dot whose `translateX` tracks `--screen-drag-progress` — rem-based flex-gap sizing previously made dots drift out of alignment with the px-based moving dot.

---

## Theme System

### 4 Theme Modes

`'auto'` | `'dark'` | `'light'` | `'amoled_dark'`

- **Auto (default):** Follows `prefers-color-scheme`, updates in real-time
- **Dark:** Slate 900 background
- **Light:** Slate 100 background, dark text
- **AMOLED:** Pure black (#000000)

### Implementation Chain

1. **CSS Variables** in `index.css`: `:root` = dark, `.theme-light`, `.theme-amoled-dark`
2. **Tailwind config** maps variables to utilities: `bg-background`, `text-foreground`, etc.
3. **`App.jsx`** watches `userData.theme` + system preference, applies body class + `applyNativeTheme()`
4. **`utils/theme.js`** handles native Status Bar, Navigation Bar, Keyboard styling

### Color Rules (MANDATORY)

```jsx
// ❌ NEVER hardcode colors
className="bg-slate-800 text-white border-slate-700"
className="text-blue-400 bg-red-400"

// ✅ ALWAYS use semantic tokens
className="bg-surface text-foreground border-border"

// ✅ ALWAYS use accent tokens
className="text-accent-blue"
className="bg-accent-red/20 text-accent-red"
```

**Semantic tokens:** `bg-background`, `bg-surface`, `bg-surface-highlight`, `bg-primary`, `text-foreground`, `text-muted`, `text-primary-foreground`, `border-border`

**12 accent tokens:** `accent-blue`, `accent-green`, `accent-lime`, `accent-emerald`, `accent-yellow`, `accent-amber`, `accent-orange`, `accent-red`, `accent-purple`, `accent-slate`, `accent-indigo`, `accent-pink`

Accent semantic use:
| Token | Semantic Use |
|-------|-------------|
| `accent-blue` | Primary accent, icons, headers |
| `accent-green` | On-target, positive |
| `accent-lime` | Goal alignment |
| `accent-emerald` | Brands, secondary positive |
| `accent-yellow` | Fats, caution |
| `accent-amber` | Carbs, calories |
| `accent-orange` | Warning level |
| `accent-red` | Protein, negative, delete, warnings |
| `accent-purple` | Supplements, aggressive bulk, cached foods |
| `accent-slate` | Neutral, fallback |
| `accent-indigo` | Barcode, manual entries |
| `accent-pink` | Secondary highlight, specialty emphasis |

Accents auto-adjust: 400-level shades for dark/AMOLED, 600-level for light.

**`--action-border` exception:** Not a Tailwind utility. Access via: `border-[rgb(var(--action-border))]`

### Key Theme Functions (`utils/theme.js`)

| Function | Purpose |
|----------|---------|
| `applyNativeTheme(theme)` | Updates status bar, nav bar, keyboard appearance |
| `resolveTheme(theme)` | Resolves `'auto'` → `'dark'` or `'light'` based on system |
| `getThemeClass(theme)` | Returns CSS class name for `<body>` |
| `isDarkTheme(theme)` | Boolean check for dark variants |
| `getVignetteColor(theme)` | Returns RGB string for gradient vignettes |

---

## Touch-First Interactive Patterns (Critical)

### Hover Gating ⚠️

**NEVER** use bare `hover:` classes — they cause sticky hover states on touch devices:

```jsx
// ❌ WRONG
className="hover:bg-blue-600"
className="group-hover:text-white"

// ✅ CORRECT — gated to desktop (768px+)
className="md:hover:bg-blue-600"
className="md:group-hover:text-white"
```

### Press Feedback Classes

Defined in `index.css` `@layer base` and `@layer components`:

| Class | Effect | Use For |
|-------|--------|---------|
| `press-feedback` | `scale(0.98)` + `brightness(110%)` | Primary action buttons |
| `pressable-card` | `scale(0.99)` | Cards, secondary buttons |
| `pressable-inline` | `scale(0.985)` | Icon buttons |
| `pressable` | `scale(0.985)` | Generic fallback |
| `surface-active` | `brightness(105%)` + `border-blue-400/80` + `shadow-inner` | Tappable surface areas |
| `focus-ring` | Blue outline on `:focus-visible` | **All** interactive elements |

**All buttons get `active:scale-[0.985]` by default** via the base layer reset — the classes above add extra feedback.

### Complete Button Pattern

```jsx
<button className="bg-primary text-primary-foreground md:hover:brightness-110 press-feedback focus-ring">
  Save
</button>

<button className="border border-border md:hover:border-muted/50 pressable-card focus-ring">
  Card
</button>

<button className="rounded-lg p-2 md:hover:bg-surface-highlight/50 pressable-inline focus-ring">
  <Icon size={20} />
</button>
```

---

## Mobile-First Design Rules

- **Viewport:** 360px-390px width target. Prefer `p-4` over `p-6`, `gap-2` over `gap-4`.
- **Font scaling:** 13px base on mobile, 17px on desktop (768px+) — set in `index.css` `html` rule.
- **Safe areas:** Use `var(--sat)`, `var(--sab)`, `var(--sal)`, `var(--sar)` for notch/home indicator padding.
- **Scrollbars:** Globally hidden via CSS (`*::-webkit-scrollbar { display: none }`) — scroll behavior preserved.
- **User selection:** Disabled globally (`user-select: none`). Re-enabled on `input`, `textarea`, `select`, `[contenteditable]`.
- **Touch highlight:** Disabled globally (`-webkit-tap-highlight-color: transparent`).
- **Icons:** Lucide React, 20px default size, 32px for section headers.

---

## Calculation System (`utils/calculations/calculations.js`)

All calorie formulas are centralized. **Never duplicate or inline calculations.**

| Calculation | Function | Details |
|------------|----------|---------|
| BMR | `calculateBMR(userData)` | Mifflin-St Jeor; auto-upgrades to Katch-McArdle when `bodyFatTrackingEnabled` with valid entries |
| Step calories | `getStepDetails(steps, userData)` | **Lives in `utils/steps.js`**, not calculations.js. Stride length heuristic: height × 0.415 (male) / 0.413 (female). In full breakdown mode, step calories are computed from **remaining steps** after ambulatory-cardio overlap deduction. |
| Cardio (single) | `calculateCardioCalories(session, userData, cardioTypes)` | MET-based (`effortType: 'intensity'`) or heart rate formula (`effortType: 'heartRate'`) |
| Cardio (total) | `getTotalCardioBurn(userData, cardioTypes)` | Sums `calculateCardioCalories` for **today's date** only |
| Cardio (for date) | `getTotalCardioBurnForDate(userData, cardioTypes, dateKey)` | Sums cardio calories for a specific `dateKey` |
| Training EPOC (single) | `resolveTrainingSessionEpoc({ session, exerciseCalories, trainingType, userData })` | Post-exercise burn estimate + carryover window for one training session (`utils/epoc.js`) |
| Cardio EPOC (single) | `resolveCardioSessionEpoc({ session, exerciseCalories, cardioType, userData })` | Post-exercise burn estimate + carryover window for one cardio session (`utils/epoc.js`) |
| Session carryover (date) | `getCarryoverForDateFromSessions({ dateKey, sessions, resolveCarryover })` | Allocates carryover calories across date boundaries (`utils/sessionCarryover.js`) |
| Training cal/hr | `getTrainingCaloriesPerHour(userData, trainingTypes)` | Base cal/hr × intensity multiplier (light 0.75 / moderate 1.0 / vigorous 1.25) |
| Training (total) | `getTotalTrainingBurnForDate(userData, trainingTypes, dateKey)` | Session-first burn from `trainingSessions` (`effortType` + `averageHeartRate` or `intensity`) |
| Training (for date) | `getTotalTrainingBurnForDate(userData, trainingTypes, dateKey)` | Sums training-session calories for a specific `dateKey` |
| TDEE breakdown | `calculateCalorieBreakdown({...})` | BMR + activity multiplier + training + cardio + steps + EPOC. Accepts optional `tefContext`, `adaptiveThermogenesisContext`, and `dateKey`. Returns `bmrDetails`, TEF fields when Smart TEF is enabled, AT fields, EPOC fields (`epocCalories`, `trainingEpoc`, `cardioEpoc`, carry-in/from-today details), plus step-overlap diagnostics (`originalEstimatedSteps`, `deductedSteps`, `remainingEstimatedSteps`, overlap session counts/details). |
| TDEE (simple) | `calculateTDEE(options)` | Convenience wrapper — returns just `calculateCalorieBreakdown(options).total` |
| Goal target | `calculateGoalCalories(tdee, goal, deltaOverride?)` | Applies ±300/500 modifier by goal, or explicit per-phase override when provided |
| BMI | `calculateBMI(weight, height)` | Standard BMI: weight(kg) / height(m)² |
| BMI category | `getBMICategory(bmi)` | Returns `{ label, color }` for underweight/normal/overweight/obese |
| FFMI | `calculateFFMI(weight, height, bodyFatPercent)` | Fat-Free Mass Index — returns `{ raw, normalized, leanMass }` |
| FFMI category | `getFFMICategory(ffmi, gender)` | Returns `{ label, color }` from "Below average" to "Suspiciously high" |
| TEF (from macros) | `calculateTefFromMacros({proteinGrams, carbsGrams, fatsGrams})` | Protein×25% + Carbs×8% + Fats×2% of caloric content |
| TEF (target mode) | `calculateTargetTef({targetCalories, weightKg, ...})` | Estimates TEF from bounded macro targets (saved split + profile anchors) |
| TEF (dynamic mode) | `calculateDynamicTef({totals, ...})` | Uses today's logged macro totals for live TEF estimate |
| Adaptive thermogenesis mode | `resolveAdaptiveThermogenesisMode({ userData, adaptiveThermogenesisContext })` | Resolves `'off' \| 'crude' \| 'smart'` from persisted settings plus optional per-request override |
| Adaptive thermogenesis correction | `computeAdaptiveThermogenesis({...})` | Computes bounded correction (±300 kcal/day) from a signed asymmetric pressure accumulator over up to 28 daily-goal snapshots (`crude`; cut deepens, surplus unwinds fast, maintenance decays — isolated goal switches never reset history) or snapshot/weight divergence signal (`smart`), with optional smart-mode weight-signal smoothing (`EMA`/`SMA`, 3-14 day window) |
| Rolling balance (window) | `calculateRollingEnergyBalance({...})` | Pure analytic rollup consuming snapshot `tdee`/`intake` (`balance = tdee - intake`, positive = deficit) over 3/7/14/28-day windows; never rebuilds TDEE (`utils/calculations/rollingEnergyBalance.js`) |

**TEF constants** exported from `calculations.js`: `TEF_MULTIPLIER_OFFSET = 0.1`, `TEF_PROTEIN_RATE = 0.25`, `TEF_CARB_RATE = 0.08`, `TEF_FAT_RATE = 0.02`.

**Rolling Energy Balance:** `utils/calculations/rollingEnergyBalance.js` is the canonical longitudinal analytics source. `calculateRollingEnergyBalance({ snapshots, windowDays, asOfDate, goalDailyBalanceTarget })` consumes the already-computed snapshot `tdee`/`intake` (never rebuilds TDEE) over 3/7/14/28-day calendar windows (default 7). Returns `rollingBalance`, `averageDailyBalance`, `trackedDays`, `expectedBalance`, `balanceVariance`, `estimatedWeightChangeKg` (÷`ESTIMATED_ENERGY_PER_KG`=7700, labelled as a rough energy-equivalent estimate), `hasData`, `insufficientData`, and ordered `days`. Sign convention: positive = deficit, negative = surplus. Missing snapshots are unavailable days (never zero); malformed/missing-field records and future dates are excluded via `parseDailyEnergyBalance`/`selectRollingBalanceDays`; duplicates keep the last snapshot. The goal's daily target is the store-derived, phase-lock-aware `goalDailyBalanceTarget` (positive = deficit). Do not duplicate this logic in UI components.

**Smart TEF mechanic:** When `userData.smartTefEnabled` is true and a `tefContext` is passed, `calculateCalorieBreakdown()` subtracts `TEF_MULTIPLIER_OFFSET` (10%) from the NEAT activity multiplier (`effectiveActivityMultiplier = rawActivityMultiplier - 0.1`) then adds the macro-based TEF back as an explicit line item. Net effect is neutral at default macro ratios but improves accuracy with real logged data. The breakdown return object gains: `rawActivityMultiplier`, `effectiveActivityMultiplier`, `tefOffsetApplied`, `tefMode`, `smartTefCalories`, `smartTefDetails`.

**Daily NEAT override mechanic:** `calculateCalorieBreakdown()` resolves the NEAT multiplier **override-first** for the resolved `dateKey` (`dailyNeatOverrides[resolvedDateKey]`), clamped via `clampCustomActivityMultiplier()` over the fallback chain override → training/rest global multiplier → `DEFAULT_ACTIVITY_MULTIPLIERS`. When applied, the breakdown return object gains `dailyNeatOverrideApplied`, `dailyNeatOverrideMultiplier`, `dailyNeatOverridePresetKey`, and `dailyNeatOverrideLabel`. The override changes `rawActivityMultiplier` (and thus `baseActivity` / NEAT segment) only for that one date; Smart TEF, AT, and EPOC math remain unchanged.

**Macro target anchoring:** Macro recommendations are constraint-based. Bounds are profile-derived (`protein: 1.6-2.8 g/kg`, mass source = lean mass when body fat is available else bodyweight; `fat: 0.6-1.6 g/kg`; `carb soft floor: 50g` with relaxation warning on infeasible budgets). Preserve calorie reconciliation and warning fields (`carb_soft_floor_relaxed`, `hard_floor_exceeds_budget`) when adjusting this logic.

**Constrained triangle mapping:** `MacroPickerModal` uses full-surface constrained remapping (`macroSplitFromConstrainedTrianglePoint` / `macroSplitToConstrainedTrianglePoint`) so the whole triangle is draggable while remaining within bounded macro behavior. Do not revert to direct raw-ratio barycentric mapping for picker interactions.

**Macro gram anchors (locks):** `userData.macroLocks` (`{ protein, carbs, fats }`, each `null` = unlocked or a gram number) lets users pin macros in **grams** so targets stay stable while calorie targets shift (live steps, cardio/training sessions, step ranges). `normalizeMacroLocks()` coerces values (rejects `null`/`''`/negative/NaN) and enforces `MAX_MACRO_LOCKS = 2` (protein/carbs win ties). `calculateMacroRecommendations()` accepts `macroLocks`, holds locked macros at their anchor grams (clamped to safety bounds as **soft anchors**), redistributes residual calories to unlocked macros by relative ratio, and returns `macroLocks.lockedKeys` / `relaxedKeys` / `lockWarnings`. The control surface in `MacroPickerModal` is conditional:
- **0 locks:** full triangle drag via constrained barycentric mapping.
- **1 lock:** horizontal `<input type="range">` slider with direct gram control (the slider value is the grams of the first unlocked macro, bounded by `getUnlockedMacroGramRange(...)`). The second unlocked macro fills the residual calories. The slider track uses a two-color gradient matching the two unlocked macro accent colors, with end labels showing grams and calorie-ratio percentages. The 1-lock slider path uses helpers from `macroRecommendations.js`: `getUnlockedMacroKeys`, `getUnlockedMacroGramRange`, and `macroSplitFromUnlockedRatio`.
- **2 locks:** triangle drag is disabled; the handle shows a dashed ring with an "absorbs changes" hint on the unlocked macro.
`TrackerScreen` and `InsightsScreen` forward `macroLocks` so displayed targets respect locks everywhere.

**`tefContext` shape:** `{ mode: 'off' | 'target' | 'dynamic', totals?: {protein, carbs, fats}, targetCalories?: number, weightKg?: number, enabled?: boolean }`

**`adaptiveThermogenesisContext` shape:** `{ mode?: 'off' | 'crude' | 'smart' }`

**Target mode chicken-and-egg:** The store's `calculateTargetForGoal()` runs a 2-pass refinement loop — pass 1 seeds `targetCalories` with pre-TEF TDEE; pass 2 uses goal-adjusted result from pass 1. Two iterations converges sufficiently.

**Phase target planning utilities:** `utils/calculations/phaseTargetPlanning.js` is the canonical source for target-mode estimation and feasible-date evaluation:
- `estimateRequiredDailyEnergyDelta(...)`
- `buildFeasibleDateBands(...)`
- `deriveTargetCreationModePayload(...)`
- `estimateGoalModeProjection(...)` (goal-mode projection card math)
- `TARGET_METRICS`, `PHASE_TARGET_PLANNING_ERROR` (shared constants for metric discriminants and diagnostics)

Planning behavior notes:
- Combined metric canonical key is `weight_and_body_fat` (legacy `weight_and_bodyFat` is normalized for compatibility).
- When both weight and body-fat targets are provided, weight-derived energy delta is the primary plan signal; body-fat delta remains a diagnostic component.
- `buildFeasibleDateBands(...)` is summary-first: counts/ranges/bounds are returned by default; `strictDateKeys`/`lenientDateKeys`/`blockedDateKeys` and `evaluations` are only materialized when explicitly requested (`includeDateKeys`, `includeEvaluations`).
- Optional diagnostics sink is supported via mutable `{ errorCode }` object (e.g., `MISSING_DATE`, `INVALID_DATE_RANGE`, `NO_METRIC_INPUT`, `INVALID_DATE_WINDOW`).
Do not duplicate target planning formulas in components.

**Adaptive Thermogenesis mechanic:** `calculateCalorieBreakdown()` computes `baselineTotal` first (BMR + NEAT + steps + training + cardio + Smart TEF), then applies AT as a post-formula correction (`total = baselineTotal + adaptiveThermogenesisCorrection`). Returned AT fields include `baselineTotal`, `adjustedTotal`, `adaptiveThermogenesisMode`, `adaptiveThermogenesisCorrection`, and `adaptiveThermogenesis`.

**Crude AT pressure accumulator:** Crude mode is strictly goal-driven and deterministic — it never reads `intakeCalories`, energy balance, or weight logs. It evaluates a split, non-negative pressure model over a rolling window of up to `CRUDE_WINDOW_DAYS` (28) daily snapshots ending at the requested `dateKey`; each day's goal is read from `snapshot.selectedGoal ?? snapshot.goalAtSnapshot` (unknown records are skipped, never zero-filled). The two accumulators are `cutPressure` (deficit depth) and `surplusPressure` (surplus height), each clamped to `[0, 28]`, with at most one non-zero at a time. Transitions: `cut` → `cutPressure + 1.0/day` (resets to `cutPressure = 1.0` when `surplusPressure > 0` — leaving surplus); `surplus` → `cutPressure − 2.0/day` while a deficit exists (fast unwind), else `surplusPressure + 0.75/day`; `maintenance` → `cutPressure − 0.25/day` when in deficit, else `surplusPressure − 0.50/day`. The signed net `balancePressure = surplusPressure − cutPressure` is exposed for UI/analytics. Milestones on the dominant accumulator: `cutPressure >= 3/7/14/21` → −50/−100/−175/−250 kcal/day; `surplusPressure >= 7/14/21` → +50/+100/+150 kcal/day; otherwise 0. Because crude evaluates the snapshot history rather than `goalDurationDays`, an isolated maintenance/refeed day decays the accumulated adaptation instead of resetting it to zero — and the `maintenance-goal` no-op guard applies to smart mode only. The store's `setSelectedGoal` refreshes today's snapshot (`goalAtSnapshot`) on an actual goal switch so same-day changes feed the accumulator immediately.

**Smart AT smoothing mechanic:** When `adaptiveThermogenesisSmoothingEnabled` is true, smart mode smooths the weight series before slope regression (`adaptiveThermogenesisSmoothingMethod`: `'ema' | 'sma'`, `adaptiveThermogenesisSmoothingWindowDays`: clamped 3–14). Smoothing metadata is included in the AT smart signal for debugging (`smoothingEnabled`, `smoothingMethod`, `smoothingWindowDays`).

**EPOC mechanic:** `calculateCalorieBreakdown()` resolves per-session EPOC from `utils/epoc.js`, then uses `getCarryoverForDateFromSessions()` (`utils/sessionCarryover.js`) to allocate carryover calories to the requested `dateKey`. Returned fields include `epocEnabled`, `epocCalories`, `trainingEpoc`, `cardioEpoc`, `epocFromTodaySessions`, `epocCarryInCalories`, `trainingEpocDetails`, and `cardioEpocDetails`.

**Training types** are resolved at the store level (`resolveTrainingTypes`) by merging `trainingTypes` constants with `userData.trainingType` (catalog). Never use raw constants directly.

**Step/cardio overlap model (Option 2):** `utils/steps.js` handles overlap deduction using explicit cardio-type metadata from `constants/cardioTypes.js`.
- `cardioTypes[<key>].ambulatory` decides whether a session is step-based.
- `cardioTypes[<key>].cadence` is the type-specific baseline steps/min used by deduction estimates.
- Session-level `stepOverlapEnabled` controls whether that specific ambulatory session deducts steps.
- Cardio burn is preserved; only the step component is reduced to avoid double counting.

---

## Measurement Averages, Trend Fallbacks & Chart Gap Handling

### Trapezoidal N-Day Averages

- `calculateNDayWeightAverage(entries, n, endDateKey?)` (`utils/measurements/weight.js`) and `calculateNDayBodyFatAverage(entries, n, endDateKey?)` (`utils/measurements/bodyFat.js`) average an **exact `n`-day UTC calendar window anchored to today** (or an explicit `endDateKey`).
- Both delegate to the shared exported `calculateTrapezoidalWindowAverage(sortedEntries, n, anchorKey, valueField)` in `weight.js` (reused by `bodyFat.js`). Never duplicate the integral math in components or re-implement per-module copies.
- Mechanics: samples form a polyline that is linearly interpolated between measurements and **held flat at the window edges**, so the integral always spans exactly `n` days whenever any sample exists (the right boundary is midnight *after* the window end so `n` inclusive day keys map to exactly `n` integrated days). Returns `null` when the window holds no data — callers must surface that honestly instead of substituting zeros. Result is rounded to 1 decimal.

### Window Date Keys

- `getWindowDateKeys(endDateKey, n)` in `utils/data/dateKeys.js` builds exactly `n` consecutive UTC date keys `[E−(n−1) … E]`. It validates format **and** canonical round-trip (rejects non-canonical keys like `'2026-02-31'` that JS date coercion would silently accept) and returns `[]` on invalid input. Use it for any day-window iteration instead of hand-rolled date arithmetic.

### Capped Trend Fallback (data honesty)

- `calculateWeightTrend` / `calculateBodyFatTrend` fall back to the last two entries **only when their span ≤ `MAX_TREND_FALLBACK_SPAN_DAYS` (14 days)**. Otherwise they return `'Need more data'` with `isStaleFallback: true` instead of presenting a stale rate as current behaviour.

### Smart AT Staleness Gate

- `SMART_WEIGHT_STALENESS_MAX_AGE_DAYS = 3` (exported from `utils/calculations/adaptiveThermogenesis.js`). `getAdaptiveThermogenesisSmartModeDataStatus` gates the smart signal on weigh-in freshness: when the newest weigh-in is older than 3 days relative to the requested `dateKey`, it returns `{ isSufficient: false, reason: 'weight-data-stale', latestWeightEntryAgeDays, stalenessMaxAgeDays, ... }` regardless of how many historical entries sit inside the 28-day window, and `computeSmartCorrection` deactivates (correction 0, `insufficientData`). `AdaptiveThermogenesisModal` renders dedicated recovery copy for this reason ("Your latest weigh-in is too old…").

### Chart Gap Handling (Weight / BodyFat Tracker Charts)

- Timeline slots are built by `buildTaggedChartSlots({ days, getValue, minValue, range, chartWidth, windowSize, chartHeight })` in `utils/visuals/trackerHelpers.jsx`: real entries map to `{ date, value, x, y, isInterpolated: false }`; interior missing days are **linearly interpolated** between their nearest real neighbours and tagged `{ isInterpolated: true, gapLength }` (`gapLength` = consecutive missing days in that run); leading/trailing empty slots stay `null` — no invented data at the chart edges.
- `buildGapAwarePathRuns(taggedPoints, options?)` in `utils/visuals/bezierPath.js` groups tagged slots into drawable runs with gap tiers:
  - `gapLength <= GAP_SOLID_MAX_DAYS (7)` → bridged **seamlessly**: interpolated slots merge into the current solid run (no split, one continuous stroke)
  - `<= GAP_DASHED_MAX_DAYS (14)` → bridged by a separate dashed stroke (`GAP_DASH_PATTERN = '4 6'`) anchored at the preceding real point and closed by the next real point
  - otherwise → **not** bridged; the line splits into separate runs
  Every returned run ends on a real point; interpolated slots trailing past the last real point are discarded. Returned points are clean `{x,y}` geometry (interpolation tags stay internal). The dead `buildSegmentedBezierPaths` was deleted — do not reintroduce segmented path builders.
- Tracker area gradients use `gradientUnits="userSpaceOnUse"` spanning `0 → chartHeight` so every run fragment shares one gradient space — never revert to default per-path bounding-box gradients (they restart per fragment and band the fill).
- `WeightTrackerModal` / `BodyFatTrackerModal` preserve the `isInterpolated`/`gapLength` tags when mapping points into `buildGapAwarePathRuns`, and tooltips snap to the nearest **real** point — interpolated bridge slots are visual aids, never selectable data.

---

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
| `getWindowDateKeys(endDateKey, n)` | `utils/dateKeys.js` | Exactly `n` consecutive UTC date keys ending at `endDateKey`; validates canonical round-trip; `[]` on invalid |
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

---

## Data Schemas

### `userData` (profile + Dexie history, merged in memory)

```javascript
{
  // Profile
  age, weight, height, gender,
  theme: 'auto',                    // 'auto' | 'dark' | 'light' | 'amoled_dark'
  selectedGoal: 'maintenance',      // Canonical current goal key
  goalChangedAt: 1700000000000,     // Epoch ms when selectedGoal last changed (persisted)
  phaseGoalCalorieDelta: null,      // Active phase smart delta override (kcal/day), if any
  phaseGoalCalorieDeltaSourcePhaseId: null, // Active phase id that owns the delta override
  selectedTrainingType, trainingDuration,
  stepRanges: ['<10k', '10k', ...],
  activityMultipliers: { training: 0.2, rest: 0.22 },
  activityPresets: { training: 'default', rest: 'default' },
  customActivityMultipliers: { training: 0.2, rest: 0.22 },
  trainingType: { trainingtype_1: { label, caloriesPerHour }, ... },
  pinnedFoods: ['food_id1', ...],
  foodFavourites: [],
  cardioFavourites: [],
  customCardioTypes: {},
  stepGoal: 10000,
  bodyFatTrackingEnabled: true,
  smartTefEnabled: false,          // Explicit macro-based TEF replaces implicit 10% in NEAT
  smartTefFoodTefBurnEnabled: true,
  smartTefQuickEstimatesTargetMode: true,
  smartTefLiveCardTargetMode: false,
  adaptiveThermogenesisEnabled: false,
  adaptiveThermogenesisSmartMode: false,
  adaptiveThermogenesisSmoothingEnabled: false,
  adaptiveThermogenesisSmoothingMethod: 'ema',
  adaptiveThermogenesisSmoothingWindowDays: 7,
  epocEnabled: true,
  epocCarryoverHours: 6,
  macroRecommendationSplit: { protein: 0.3, carbs: 0.4, fats: 0.3 }, // Ratio split (sums to 1)
  macroLocks: { protein: null, carbs: null, fats: null },            // Gram anchors (null = unlocked; max 2)

  // History (Dexie)
  cardioSessions: [{ id, date, startTime, startedAt, endedAt, type, duration, intensity, effortType, averageHeartRate?, stepOverlapEnabled? }],
  trainingSessions: [{ id, date, startTime, startedAt, endedAt, type, duration, intensity, effortType, averageHeartRate? }],
  weightEntries: [{ date: 'YYYY-MM-DD', weight }],
  bodyFatEntries: [{ date: 'YYYY-MM-DD', bodyFat }],
  stepEntries: [{ date: 'YYYY-MM-DD', steps, source: 'healthConnect'|'manual' }],
  nutritionData: { 'YYYY-MM-DD': { mealType: [foodEntry, ...] } },   // entries may carry fiber/sodium/saturatedFats/sugars (null = untracked)
  cachedFoods: [],                  // Cached foods from online/barcode lookups (history-scoped; deduped + capped on persistence)
  dailyNeatOverrides: {
    'YYYY-MM-DD': {
      multiplier,                    // Clamped 0.1–1.0 via clampCustomActivityMultiplier()
      presetKey: 'active' | null,    // Curated preset key, or null for a custom/legacy value
      label: 'Highly Active' | null, // Optional display label
      updatedAt,                     // Epoch ms of last write
    }
  },
  dailySnapshots: {
    'YYYY-MM-DD': {
      date,
      tdee,
      intake,
      deficit,                      // positive = deficit, negative = surplus
      goalAtSnapshot,               // Denormalized copy of selectedGoal for history/analytics
      stepCount,
      isTrainingDay,
      bmr,
      stepCalories,
      trainingBurn,
      cardioBurn,
      tef,
      tefMode,
      epoc,
      epocTraining,
      epocCardio,
      epocFromTodaySessions,
      epocCarryInCalories,
      micros,                        // { fiber, sodium, saturatedFats, sugars } sums of known values; null = none tracked
      microsCoverage,                // { fiber, sodium, saturatedFats, sugars } boolean hasUntracked per nutrient (partial day sums)
      baselineTdee,
      adaptiveThermogenesisCorrection,
      adaptiveThermogenesisMode,
      createdAt,
      updatedAt,
    }
  },
  phaseLogV2: { version, phasesById, phaseOrder, activePhaseId, logsById, logIdsByPhaseId, logIdByPhaseDate },
}
```

`phases` and `activePhaseId` still exist as derived store fields for UI compatibility, but they are projections from `phaseLogV2` (not persisted source-of-truth).

### Food Entry Shape

```javascript
{ id: 'uuid', foodId: 'chicken_breast', name: 'Chicken Breast',
  grams: 174, calories: 287, protein: 54, carbs: 0, fats: 6.3,
  fiber: 0, sodium: 65, saturatedFats: 1.4, sugars: 0,   // optional micros
  timestamp: 1699876543210 }
```

**Micro nutrients (fiber, sodium, saturatedFats, sugars) are optional and NULL
semantic.** `null`/absent = untracked (rendered as —); `0` = measured zero. The
canonical defs + normalizers/invariant clamps live in
`src/constants/nutrients/nutrients.js`. Units: fiber/saturatedFats/sugars in
grams (1 decimal), sodium in **milligrams** (whole integer). Soft source-scoped
invariants clamp invalid data (`saturatedFats <= fats`, `sugars <= carbs`,
and for US/USDA "carb by difference" sources only, `sugars + fiber <= carbs`);
OpenFoodFacts/EU net-carb entries never clamp fiber against carbs.

Meal types are ordered by `MEAL_TYPE_ORDER`: `breakfast`, `morning_snack`, `lunch`, `afternoon_snack`, `dinner`, `evening_snack`, `other`.

### Phase Structure (Reference-Based)

Daily logs store reference keys (`weightRef`, `bodyFatRef`, `nutritionRef`) pointing to existing datasets — **not** embedded copies. This keeps single-source-of-truth behavior for trackers and phase analytics.

```javascript
{
  id: Date.now(),
  name: 'Bulking Phase',
  creationMode: 'goal' | 'target',
  startDate: 'YYYY-MM-DD',
  endDate: 'YYYY-MM-DD',       // required for `target` mode, nullable for `goal` mode
  goalType: 'bulk',
  targetMetric: 'weight' | 'bodyFat' | 'weight_and_body_fat' | null,
  targetBodyFat: 14.5,
  targetDateRequired: false,
  targetAggressivenessBand: 'strict' | 'lenient' | 'blocked' | null,
  smartCaloriePlan: {
    requiredDailyDeltaCalories,
    totalDeltaCalories,
    daySpan,
    aggressivenessBand,
    startDate,
    endDate,
    components: { weightDeltaKcal, bodyFatDeltaKcal },
  },
  startingWeight: 74,
  status: 'active',             // 'active' | 'completed'
  dailyLogs: {
    'YYYY-MM-DD': {
      weightRef: 'YYYY-MM-DD',
      bodyFatRef: 'YYYY-MM-DD',
      nutritionRef: 'YYYY-MM-DD',
      notes: 'Optional',
      completed: false
    }
  }
}
```

Use `calculatePhaseMetrics()` from `utils/phases.js` for weight change, weekly rate, completion stats, and nutrition rollups (`avgCalories`, `avgProtein`, `avgCarbs`, `avgFats`, `nutritionDays`).

### Phase/Logbook v2 Model (`utils/phaseLogV2.js`)

The app now uses a **v2-native model**:

- Store actions mutate `phaseLogV2` directly.
- UI compatibility views (`phases`, `activePhaseId`) are derived via `convertPhaseLogV2ToLegacyPhases(...)`.
- Single-active-phase constraints are enforced in normalization (`active` uniqueness).

When editing phase logic:

1. Treat `phaseLogV2` as the only source-of-truth.
2. Keep `convertPhaseLogV2ToLegacyPhases(...)` stable for UI compatibility until screens are fully v2-native.
3. Ensure deletions clear dangling references (weight/body-fat/nutrition refs).

---

## Online Catalog Search + OpenFoodFacts Barcode Integration

Online text search and barcode lookup are split across two proxied services for consistent error handling and centralized credentials. Online text search is backed by the curated Supabase catalog (pipeline-seeded `public.foods`), while barcode lookup stays OpenFoodFacts-backed.

**Architecture:**
- `services/foodCloud.js` — Client service for online text search (Supabase-backed curated catalog), with timeout + native base URL guard; maps canonical catalog rows to the app food shape.
- `api/foods.js` — Vercel proxy for `action=search` over the Supabase PostgREST RPC `search_foods` (read-only **anon** key; RLS grants public SELECT + the RPCs are EXECUTE-granted to anon). Responses are **lean by default** — `{ catalogFoods, page }`; the legacy FDC `foods` envelope and the `search_foods_total` count RPC are only exercised when a caller opts in via `legacy=1` (or when served through `/api/usda`) so already-shipped native builds keep working while modern clients skip the duplicate payload + extra count call. Responses carry `Cache-Control: public, s-maxage=120, stale-while-revalidate=600`. Payload builders live in `api/foodRows.js` (canonical `catalogFoods` always, synthetic FDC `foods` envelope only on the legacy path).
- `api/usda.js` — legacy alias of `api/foods.js` serving the old `/api/usda` URL so already-shipped builds keep working.
- `services/openFoodFacts.js` — Client service for barcode lookups.
- `api/openfoodfacts.js` — Vercel proxy supporting `action=barcode` (product lookup).

**Configuration:**
- Native builds: set `VITE_FOODS_API_BASE` for the online catalog search and `VITE_OPENFOODFACTS_API_BASE` for barcode lookup. Legacy `VITE_USDA_API_BASE` is still honored and `/api/usda` remains served as an alias.
- Defaults:
  - Online catalog: `https://calorieintaketracker.vercel.app/api/foods`
  - OpenFoodFacts barcode: `https://calorieintaketracker.vercel.app/api/openfoodfacts`
- Recommended Vercel env vars:
  - `SUPABASE_URL=<project url>` and `SUPABASE_ANON_KEY` (or `SUPABASE_PUBLISHABLE_KEY`) — required for read-only search (RLS + anon RPC EXECUTE). The `SUPABASE_SERVICE_ROLE_KEY` is NEVER used in this deploy; it belongs to the pipeline seeder only.
  - `OPENFOODFACTS_USER_AGENT=EnergyMapCalorieTracker/1.0 (contact@example.com)`
  - Optional: `OPENFOODFACTS_API_BASE` (defaults to `https://world.openfoodfacts.org`)
  - The legacy `USDA_API_KEY` / `USDA_USER_AGENT` vars are obsolete (FDC is never called at runtime)

**Key functions:**
```javascript
import { searchFoods as searchOnlineFoods } from './services/foodCloud';
import { searchBarcode } from './services/openFoodFacts';

const results = await searchOnlineFoods('chicken breast', { page: 1, pageSize: 20 });
const food = await searchBarcode('012345678901');
```

Search results are cached at two layers:
- **In-memory query-result cache** (`FOODS_SEARCH_CACHE_TTL_MS` = 5 min, `FOODS_SEARCH_CACHE_MAX_ENTRIES` = 64, LRU-recency-refreshed) inside `services/foodCloud.js` — dedupes identical query/page/size reads within a session (`clearFoodsSearchCache()` clears it and is used by tests).
- **Persisted cache-on-select** in `userData.cachedFoods` — only foods the user actually selects/logs survive across sessions.

**Rename scope:** the online path is branded "online database / food cloud" end-to-end: `/api/foods` (+ legacy `/api/usda` alias), `VITE_FOODS_API_BASE`, `services/foodCloud.js`, `api/foodRows.js`, and the internal RAG pipeline is now cloud-native (`FOOD_SEARCH_SOURCE.CLOUD` = `'cloud'`, `cloud_search_failed`/`cloud_search_aborted`, `try_cloud`, `cloud_*` decision/telemetry keys, `defaultSource: 'cloud'`). Two deliberate exceptions stay USDA-encoded: the persisted `usda_<fdcId>` food-id prefix (data provenance; backs stored favourites/pins) and the `'usda'` nutrient-invariant scope in `constants/nutrients/nutrients.js` (US "carb by difference" semantics — a different domain, not the search source).

**Micro nutrient mapping (fiber / sodium / saturatedFats / sugars):**
- Micros are served **pre-curated per-100g** from the catalog (pipeline `build.js` normalization + source-scoped invariants) — the client no longer derives them from FDC `foodNutrients`, so `null` = untracked is inherited verbatim.
- OpenFoodFacts reports sodium in **grams** with an explicit `sodium_unit` marker. `services/openFoodFacts.js` converts g → mg when `sodium_unit` is `g` (or missing) and honors an explicit `mg` unit; when sodium is absent it derives sodium from `salt_100g` (`salt_g × 393.4` ≈ mg). `nutriments_estimated` is never ingested.
- EU labels report net carbs with fiber separate, so fiber is never clamped against OFF carbs; US/USDA "carb by difference" rows carry the stricter `sugars + fiber <= carbs` clamp applied at catalog build time. Cloud ranking (`search_foods` RPC) mirrors local `foodCatalog.js` and demotes/boosts branded rows by brand intent (`BRAND_INTENT_TOKEN_HINTS`).
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
- Stage timing/budget constants are the single source of truth in `services/ragBudget.js` (`RAG_TIMING`, `resolveRagStageTimeoutMs`, `RAG_MAX_DEFERRED_GROUNDING_ENTRIES`, `RAG_LOOKUP_CONCURRENCY_LIMIT`, `assertRagTimingInvariants`) — do not hardcode per-stage timeout values in callers.
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
- `fetchSteps()` must use the **today-scoped window** (`buildHealthConnectStepReadWindow()`, local midnight → now) as the primary read path. The plugin's native default range is a rolling 24 hours and would include previous-day steps in today's live count, so it must only be used as a degraded fallback when the explicit today window fails. If all reads fail, return `null` and degrade gracefully rather than throwing a connection error into the live card flow.
- Step aggregation is centralized in `aggregateStepsBySource()` in `src/utils/healthConnectWindow.js`; use it for all read paths (today-scoped, native default, and rolling fallback) to keep max-per-source dedup consistent.

Always returns `'unavailable'` on web and iOS. Status constants exported as `HealthConnectStatus` enum object.

---

## File Organization

```
src/
├─ components/EnergyMap/
│   ├─ EnergyMapCalculator.jsx   # THE orchestrator (4,100+ lines; lazy-loads heavy modals)
│   ├─ common/
│   │   ├─ ModalShell.jsx        # Core modal wrapper (singleton managers)
│   │   ├─ FoodTagBadges.jsx     # Shared food tag/source badge renderer
│   │   ├─ AppHeader.jsx         # Header zone (greeting, per-screen stat line, swipe dots, coach mark, settings gear)
│   │   └─ ScreenTabs.jsx        # Fixed floating glass bottom tab bar (drag-linked active circle)
│   ├─ modals/                   # 53 modal files in 6 subfolders + 5 fullscreen panel components
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
│   ├─ nutrients/
│   │  └─ nutrients.js           # Canonical micro nutrients (fiber/sodium/saturatedFats/sugars): units, clamps,
│   │                            #   source-scoped soft invariants, OFF sodium conversion, totals/coverage helpers
├─ hooks/
│   ├─ useAnimatedModal.js       # Modal lifecycle (isOpen/isClosing/requestClose)
│   ├─ useHardwareBackButton.js  # Native back handling (home-first + double-exit)
│   ├─ useSwipeableScreens.js    # 5-screen horizontal carousel (edge peek + --screen-drag-progress)
│   ├─ useHealthConnect.js       # Android Health Connect integration
│   └─ useNetworkStatus.js       # Online/offline detection
├─ store/
│   └─ useEnergyMapStore.js      # Zustand store: state, actions, derived values, persistence
│                                #   calculateBreakdown(steps, isTrainingDay, options?) — options.tefContext + options.adaptiveThermogenesisContext forwarded to core calc
│                                #   calculateTargetForGoal(steps, isTrainingDay, goalKey, options?) — 2-pass refinement for target TEF mode
│                                #   goalDailyBalanceTarget — derived phase-lock-aware goal daily balance target (positive = deficit)
├─ utils/
│   ├─ calculations/
│   │  ├─ calculations.js        # Core calorie formulas — BMR/cardio/training/TDEE/TEF
│   │  ├─ adaptiveThermogenesis.js # Adaptive thermogenesis mode resolution + crude/smart correction engine
│   │  ├─ dailySnapshots.js      # Derived daily snapshot builder + equality helpers
│   │  ├─ rollingEnergyBalance.js # Rolling energy-balance calculator (3/7/14/28-day windows; consumes snapshot tdee/intake)
│   │  ├─ dayLedgerPresentation.js # Daily Ledger display-model builders (read-only snapshot projections)
│   │  ├─ epoc.js                # Session EPOC estimate + carryover window resolution
│   │  ├─ goalAlignment.js       # Weight trend vs goal alignment evaluation
│   │  ├─ phaseTargetPlanning.js # Target-mode phase planning (delta estimation + feasible date bands)
│   │  ├─ macroRecommendations.js # Macro target recommendation engine with profile anchoring and constraint-based logic
│   │  ├─ sessionCarryover.js    # Allocates carryover calories across date boundaries
│   │  └─ steps.js               # Step range parsing, step calorie estimation, getStepDetails
│   ├─ data/
│   │  ├─ dateKeys.js            # Canonical local/UTC date key formatters (`YYYY-MM-DD`) + `getWindowDateKeys(endDateKey, n)` UTC window helper
│   │  ├─ historyDatabase.js     # Dexie history DB adapter + sharded document helpers
│   │  ├─ phaseLogV2.js          # Normalized phase/log domain; source-of-truth for phase state
│   │  └─ storage.js             # Orchestrates profile (Preferences) + history (Dexie) persistence
│   ├─ measurements/
│   │  ├─ bodyFat.js             # Body fat validation, trend analysis, sparklines, trapezoidal N-day averages
│   │  ├─ profile.js             # Age/height sanitization helpers (sanitizeAge, sanitizeHeight, AGE/HEIGHT min/max constants)
│   │  └─ weight.js              # Date normalization, weight clamping, sorting, trend analysis (capped fallback), sparklines, calculateTrapezoidalWindowAverage
│   ├─ food/
│   │  ├─ aiFinalizedEntryState.js # Finalized chat entry card state (calm primary badges + disclosure chip labels)
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
│   │  ├─ bezierPath.js          # SVG cubic Bézier curve interpolation + gap-aware chart path runs
│   │  ├─ scroll.js              # Scroll utilities
│   │  └─ trackerHelpers.jsx
│   ├─ theme.js                  # Native theme application (status bar, transparent nav bar, keyboard)
│   ├─ export.js                 # CSV/JSON export generation
├─ services/
│   ├─ openrouter.js             # OpenRouter client + mode helpers (extraction/presentation/grounding)
│   ├─ foodCache.js              # Cached food dedupe/trim helpers
│   ├─ foodLookupContext.js      # Batch AI entry lookup context resolver + normalized lookup meta
│   ├─ foodSearch.js             # Local/online-catalog/grounded lookup orchestration + deterministic AI entry resolution
│   ├─ foodLookupReasons.js      # Canonical lookup reason-code registry (messages, recovery hints, chip labels)
│   ├─ ragTelemetry.js           # RAG telemetry aggregation + diagnostics helpers
│   ├─ ragChatPipeline.js        # Decoupled RAG chat pipeline orchestration (extraction → retrieval → verification → presentation)
│   ├─ ragBudget.js              # Centralized RAG stage timing/budget constants + resolveRagStageTimeoutMs
│   ├─ foodCloud.js              # Supabase catalog online search client
│   ├─ openFoodFacts.js          # OpenFoodFacts barcode lookup client
│   ├─ barcodeScanner.js         # Official Capacitor barcode scanner wrapper
│   └─ foodCatalog.js            # SQLite-backed local food catalog service (sql.js)
├─ scripts/
│   └─ food-db/
│      ├─ index.js               # Offline food DB audit/clean/replace pipeline
│      ├─ enrich-nutrients.js    # FDC bulk CSV join -> backfills fiber/sodium/saturated_fats/sugars by fdc_id
│      └─ config/
│         └─ taxonomy.js         # Canonical taxonomy maps + alias/portion sanitation config
└─ tests/                        # Node test runner suite (`node --test`)
  ├─ api/
  │   └─ openrouter.contract.test.js
  ├─ constants/
  │   └─ activityPresets.test.js
│   └─ nutrients.test.js      # Canonical micro nutrient defs, soft invariants, OFF sodium conversion
  ├─ services/
  │   ├─ foodLookupContext.test.js
  │   ├─ foodSearch.test.js
  │   ├─ openFoodFacts.test.js
  │   ├─ ragTelemetry.test.js
  │   ├─ ragChatPipeline.test.js # Decoupled pipeline orchestration (helper contracts + stage routing with stubbed OpenRouter modules)
  │   └─ foodCloud.test.js
  └─ utils/
    ├─ aiFinalizedEntryState.test.js # Finalized chat entry card badge/label resolution
    ├─ aiPresentationMerge.test.js # Presentation merge guardrail tests (sparse entries, rewrite suppression, integrity fallback)
    ├─ openrouter.test.js
    ├─ macroRecommendations.test.js
    ├─ portionNormalization.test.js
    ├─ calculations.test.js
    ├─ healthConnectWindow.test.js
    ├─ dateKeys.test.js
    ├─ adaptiveThermogenesis.test.js
    ├─ bezierPath.test.js        # Gap-aware path run tiering (solid/dashed/broken) + Bézier contracts
    ├─ trendAverages.test.js     # Trapezoidal N-day averages + capped trend fallback behaviour
    ├─ dailySnapshots.test.js    # Snapshot derivation and helper behavior tests
    ├─ dayLedgerPresentation.test.js # Daily Ledger presentation helpers (preview/month summaries)
    ├─ rollingEnergyBalance.test.js # Rolling balance calculator tests (windows, missing/malformed days, expected-vs-actual)
    ├─ phaseLogV2.test.js
    ├─ phaseTargetPlanning.test.js
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
- Full `npm run test` is green (as of the chart-gap rendering continuity fix, 283 tests pass). Recent additions: `tests/utils/bezierPath.test.js` (gap-aware path runs), `tests/utils/trendAverages.test.js` (trapezoidal N-day averages + capped trend fallback), and staleness-gate cases in `tests/utils/adaptiveThermogenesis.test.js`. The canonical defaults are asserted by `tests/constants/activityPresets.test.js` against `DEFAULT_ACTIVITY_MULTIPLIERS` (`{ training: 0.2, rest: 0.22 }`).

**ESLint config:** Flat config format (`eslint.config.js`), uses `@babel/eslint-parser` with JSX preset. `react/prop-types` is disabled. Prettier runs as an ESLint rule.

---

## Common Pitfalls

1. **Async storage:** `Preferences.get()`/`.set()` are async. Always `await` or use the store (which handles it internally).
2. **Save debounce:** The 1-second debounce in `setupEnergyMapStore` is critical. Removing it causes UI freezes from serializing large JSON on every keystroke.
3. **Dexie is the only history persistence path:** Do not reintroduce Preferences history fallback/backfill logic.
4. **Save failure semantics:** If Dexie history write fails, persistence risk warning is expected and should remain explicit.
5. **Warnings should indicate real risk only:** Avoid noisy warnings unless a write was rejected or explicitly failed.
6. **Legacy phase migration path is removed:** Do not add runtime conversion/import logic for legacy `phases` payloads.
7. **Avoid full rewrite assumptions:** `saveEnergyMapData` writes changed profile/history segments only; avoid changes that force unconditional large writes.
8. **Food cache retention is intentional:** `cachedFoods` is history-scoped and persisted with dedupe + max cap (currently 500). Keep retention logic if changing cache schema.
9. **Never call `forceClose()`** on modals unless absolutely necessary — it skips exit animations and can cause visual glitches.
10. **Step range parsing** is complex — always use `parseStepRange()` from `utils/steps.js`. It handles `<10k`, `>20k`, `10k-15k`, `+` suffix formats.
11. **Cardio effort types:** Check `session.effortType` — `'intensity'` uses MET-based calculation, `'heartRate'` uses gender-specific heart rate coefficients.
12. **Cardio overlap classification is metadata-driven:** Do not infer ambulatory cardio with string matching/keywords. Use `cardioTypes[type].ambulatory`.
13. **Cadence source of truth:** For overlap estimation, use `cardioTypes[type].cadence` (or defined fallback path in `utils/steps.js` for custom types). Do not hardcode cadence by name in UI/store code.
14. **Session-level overlap toggle:** Respect `session.stepOverlapEnabled` in overlap deduction; relevant types default on, non-ambulatory types force off.
15. **Training type resolution:** Never use raw `trainingTypes` constants. The store's `resolveTrainingTypes()` merges constants with persisted `userData.trainingType` entries. Consume resolved `trainingTypes` from the store.
16. **Modal nesting:** Parent modals must delay state cleanup to prevent child modals from unmounting mid-animation. Use `MODAL_CLOSE_DELAY` (180ms) with `setTimeout`.
17. **Safe areas:** Full-screen layouts must include `var(--sat)` / `var(--sab)` for notch and home indicator support.
18. **No hardcoded colors:** Never use `bg-slate-*`, `text-white`, `border-slate-*`, `text-blue-400`, etc. Always use semantic tokens or accent tokens.
19. **Hover gating:** Never use bare `hover:` — always use `md:hover:` to prevent sticky hover on touch devices.
20. **Weight entries:** Always normalize dates with `normalizeDateKey()`, validate with `clampWeight()` (30-210 kg range), and sort with `sortWeightEntries()` before storing.
21. **Native theming is centralized in `utils/theme.js`.** Do not add legacy status/navigation bar wrapper modules.
22. **Smart TEF and NEAT:** When `userData.smartTefEnabled` is true, `calculateCalorieBreakdown()` subtracts `TEF_MULTIPLIER_OFFSET` (0.1) from the activity multiplier and adds macro-derived TEF back explicitly. The displayed NEAT multiplier in `CalorieBreakdownModal` will therefore appear lower than the user's configured value — this is intentional and explained in `TefInfoModal`. Never remove the offset without also disabling TEF.
23. **Macro target display style:** `TrackerScreen` and `InsightsScreen` show picked macro targets (single target grams), not min-max range copy. Keep UI wording aligned with target-based display.
24. **Activity multiplier clamping:** Custom activity multipliers have a floor defined by `MIN_CUSTOM_ACTIVITY_MULTIPLIER` in `activityPresets.js`. Always use `clampCustomActivityMultiplier()` when persisting custom NEAT values. The `DailyActivityCustomModal` picker starts at `MIN_CUSTOM_ACTIVITY_PERCENT` (10%), not 0.
25. **Calorie breakdown request object:** `openCalorieBreakdown()` in the orchestrator accepts either a plain step count (legacy) or a `{ steps, tefContext, adaptiveThermogenesisContext }` object. `CalorieMapScreen` step cards and the live Health Connect card pass the full object to enable correct TEF/AT mode context.
26. **Nutrition references are data-backed, not cosmetic:** `nutritionRef` should map to a day that actually has entries in `nutritionData`. If meals are deleted for a date, clear stale refs (store sync handles this for food actions).
27. **Phase metrics are nutrition-aware now:** Never hardcode `avgCalories = 0` in phase UIs. Use `calculatePhaseMetrics(phase, weightEntries, nutritionData)`.
28. **Daily log nutrition management route:** In logbook flow, nutrition management routes through the Tracker screen date context; preserve selected date handoff when adjusting this UX.
29. **No dual-write toggle exists anymore:** Do not add `VITE_ENABLE_HISTORY_DUAL_WRITE`-style rollback flags back into normal save flow.
30. **Node ESM import hygiene:** For modules used in tests, keep explicit `.js` file extensions in relative imports to avoid `ERR_MODULE_NOT_FOUND`.
31. **Daily snapshots are cache, not truth:** Never edit `dailySnapshots` directly from UI/form state; always derive via `upsertDailySnapshot(...)`.
32. **Snapshot TEF naming is intentional:** Snapshot field is `tef` (derived from `smartTefCalories` in breakdown). Do not assume implicit TEF if Smart TEF mode is off.
33. **Snapshot persistence is sharded by date:** Keep `dailySnapshots` in Dexie sharded documents (`dailySnapshots:<date>`), not in profile payload and not as one monolithic history blob.
34. **Goal duration logic depends on persisted timestamps:** If implementing coarse/crude staged adjustments (e.g., prolonged cut/bulk handling), base elapsed-day calculations on persisted `goalChangedAt` (and optional phase boundaries), not transient UI state.
35. **Snapshots are not goal-state authority:** `goalAtSnapshot` is for historical inspection only. Current goal behavior must resolve from `userData.selectedGoal` (+ `goalChangedAt`).
36. **AT mode control is settings-driven:** `CalorieBreakdownModal` does not expose an AT mode selector. Mode changes are configured in `SettingsModal` (`adaptiveThermogenesisEnabled` + `adaptiveThermogenesisSmartMode`) and reflected in breakdown output.
37. **AT smart-mode smoothing is settings-driven:** Smoothing controls also live in `SettingsModal` (`adaptiveThermogenesisSmoothingEnabled`, `adaptiveThermogenesisSmoothingMethod`, `adaptiveThermogenesisSmoothingWindowDays`). Keep method constrained to `ema|sma` and clamp window to 3–14 days.
38. **Date keys must use shared helpers:** Avoid ad-hoc `toISOString().split('T')[0]` for app logic. Use `utils/dateKeys.js` (`getTodayDateKey`, `formatDateKeyLocal`, `formatDateKeyUtc`) to prevent mixed local/UTC behavior.
39. **Modal darkening must remain per-layer + lane-based:** Keep wrapper z-index allocation in +2 steps (`ModalStackManager`) and preserve depth-based opacity math (`calculateStackTargetOpacity` + `calculateLayerOpacity`) in `ModalShell`. Do not reintroduce a shared-overlay singleton path or ad-hoc `bg-*` overlay classes; that breaks progressive nested darkening and can regress layering/interaction.
40. **EPOC is settings-driven and persisted:** `epocEnabled` and `epocCarryoverHours` are canonical `userData` fields (profile scope). Configure from `SettingsModal`; do not duplicate per-screen global toggles.
41. **Session timing fields are first-class:** `startTime`, `startedAt`, and `endedAt` on cardio/training sessions are used for carryover allocation and day-boundary logic. Preserve these when editing sessions.
42. **Carryover is date-keyed:** `getCarryoverForDateFromSessions()` allocates carryover by overlap windows against `dateKey`; always pass the correct `dateKey` when computing breakdowns/snapshots.
42. **EPOC UI surface exists:** `EpocInfoModal`, `EpocWindowPickerModal`, and `TimePickerModal` are active parts of the flow. Keep them wired when changing settings/session forms.
43. **Snapshot EPOC fields are intentional:** `dailySnapshots` persist `epoc`, `epocTraining`, `epocCardio`, `epocFromTodaySessions`, and `epocCarryInCalories` for historical/analytics context.
44. **Native back navigation has home-first + double-exit behavior:** In `EnergyMapCalculator`, native back handling must close topmost modal first; when no modal is open and current screen is not Home, navigate to Home instead of exiting; when already on Home, require a second back press within a short window and show the transient hint text (`"Swipe or tap again to exit"`) before `App.exitApp()`.
45. **Framer Motion + Tailwind transform caveat for fixed hints/toasts:** Avoid combining Framer Motion transform animations with Tailwind translate centering utilities on the same element (e.g., `left-1/2 -translate-x-1/2`), because Motion overwrites `transform` and can shift the UI off-center. Prefer fixed full-width flex centering (`fixed inset-x-0 flex justify-center`).
46. **Local food catalog is SQLite-first:** Query local foods via `services/foodCatalog.js`; do not reintroduce full in-memory `FOOD_DATABASE` scans as a primary path.
47. **Food data hygiene is offline-first:** Keep taxonomy/portion normalization in `scripts/food-db` pipeline and avoid adding query-time normalization layers for category/subcategory cleanup.
48. **Backup/report artifacts are generated files:** `src/constants/*.backup.sqlite` and `scripts/food-db/reports/*.json` should remain ignored and not committed.
49. **Store hot-path caches are intentional:** Keep reference-based caches in `useEnergyMapStore` (resolved training/cardio types, sorted entry arrays, normalized phase state, phase view) and preserve `updateUserData` no-op short-circuiting.
50. **Breakdown session reuse is intentional:** `calculateCalorieBreakdown()` reuses prefiltered date-scoped training/cardio sessions for burn calculations; avoid reintroducing duplicate date filtering in the same call path.
51. **Startup profile reads are parallelized:** Keep profile and last selected cardio-type `Preferences.get(...)` calls parallelized during hydration.
52. **Hook frame-throttling is intentional:** Keep RAF scheduling/equality guards in `useSwipeableScreens` to limit high-frequency layout/state churn on mobile.
53. **Food favourites surface is unified:** Use `FoodSearchModal` favourites mode for favourites UX. Do not recreate a standalone `FoodFavouritesModal` surface.
54. **Food tags are centralized:** Reuse `FoodTagBadges` + `foodTags` helpers; do not add per-modal ad-hoc tag/source logic.
55. **Brand display in food cards is name-first:** Use `formatFoodDisplayName` and avoid rendering brand as a separate chip in food list cards.
56. **OpenRouter instruction authority is server-side and mode-specific:** Keep behavioral prompt updates in `api/openrouter.js` (`EXTRACTION_SYSTEM_INSTRUCTION`, `PRESENTATION_SYSTEM_INSTRUCTION`, `GROUNDING_LOOKUP_SYSTEM_INSTRUCTION`) and preserve the existing `food_parser_json` schema unless a coordinated parser/test update is intentional.
57. **Pinned local foods must remain hydratable outside top-N result windows:** local search currently fetches pinned IDs via `getFoodsByIds(...)` on the first local page and merges them before UI filtering; do not regress to top-limited-only result sources.
58. **Local search ranking is relevance-aware for name sorting:** exact/prefix/word-boundary name matches should outrank generic contains matches (e.g., plain `honey` should not be buried under unrelated composites).
59. **Large food lists are progressively rendered in `FoodSearchModal`:** preserve `visibleResultCount` batching plus offset-based local pagination, and keep the count copy in "loaded count" style (`x foods found`) to avoid heavy first paint on 13k+ catalog datasets.
60. **RAG chat orchestration lives in `services/ragChatPipeline.js`:** when `VITE_AI_CHAT_RAG_ENABLED` is true, `runRagChatPipeline(...)` owns the extraction → deterministic resolution (`resolveFoodLookupContext` + `resolveAiFoodEntry`) → presentation sequence and returns `{ result, lookupContext, schemaVersion, extractionSchemaVersion, presentationSkipped, mode }`; `FoodSearchModal` consumes that return value and must not re-implement the stage sequencing inline. Keep the fail-closed legacy single-call path (`sendOpenRouterMessage`, `mode: 'processing'`) and the single-entry presentation skip (`shouldSkipPresentationPass`) intact.
61. **Grounding must stay gated:** only grounded lookup requests should set `useGrounding: true`; do not enable web grounding for extraction/presentation modes.
62. **Deterministic macro math belongs in services/utilities, not JSX:** keep grams normalization and per100g scaling in `utils/food/portionNormalization.js` and `services/foodSearch.js` (`resolveAiFoodEntry`), not ad-hoc in modal components.
63. **Presentation merge logic is centralized:** use `utils/food/aiPresentationMerge.js` for presentation→verified merge behavior. Do not re-implement sparse-entry guards or nutrition integrity checks inline in JSX.
64. **RAG merge safety is correctness-critical:** sparse/misaligned presentation arrays must degrade to verified entries; never trust presentation indices blindly.
65. **Name rewrite suppression is intentional:** significant token-divergence rewrites are blocked and surfaced as metadata/badges for traceability.
66. **Nutrition guardrail is intentional:** when presentation macros imply calories outside tolerance, keep verified deterministic nutrition and annotate `nutritionIntegrityIssue`.
67. **Lookup diagnostics require reason codes:** keep `errorReasonsBySource` populated for all lookup/error paths so chat trace can show stable reason labels and suggested fixes.
68. **Keep lookup reason/hint helpers canonical:** use `getLookupErrorReasonMessage(...)` and `getLookupErrorRecoveryHint(...)` from `services/foodLookupContext.js`; avoid ad-hoc per-component strings.
69. **OpenRouter transient retry parity is intentional:** `sendOpenRouterMessage` retries transient upstream `502/503/504` with bounded backoff; do not remove unless replacing with equivalent resilience.
70. **Rate-limit queueing is intentional:** `429` handling uses serialized backoff queue semantics; preserve this when adjusting retry logic.
71. **Chat-mode cache lifecycle is scoped:** `FoodSearchModal` resets AI lookup session cache when leaving chat view and on modal close/unmount. Keep this behavior to prevent stale cross-conversation carryover.
72. **Avoid callback TDZ regressions in orchestrator components:** in `FoodSearchModal`, callbacks referenced by other hooks/callbacks (e.g., `updateMessageById`) must be declared before first usage to avoid runtime `Cannot access ... before initialization` errors.
73. **Selector/destructure parity matters:** when selecting store fields in `useEnergyMapStore`, always destructure every referenced variable (`aiChatRolloutUserId`, `aiChatRagRolloutOverride`, `aiChatRagRolloutPercentage`) to avoid runtime `ReferenceError` crashes.
74. **Bundle-splitting hygiene for dynamic services:** keep `foodCatalog` and `openrouter` usage dynamic in heavy UI/orchestrator flows (`FoodSearchModal`, `EnergyMapCalculator`) so static imports do not pull these paths back into the main chunk.
75. **Lazy modal mount guard is required:** for lazy-loaded modal components, gate render with `isOpen || isClosing`. Rendering only on `isOpen` can cut exit animations and regress close-stack UX.
77. **Phase creation mode drives validation constraints:** in `target` mode, require end date plus at least one target metric (`targetWeight` or `targetBodyFat`), and reject blocked aggressiveness bands from `phaseTargetPlanning`.
78. **Goal lock is intentional while active phase delta is applied:** `setSelectedGoal` is guarded when `isGoalLockedByActivePhase` is true, and `HomeScreen` goal CTA reflects locked state.
79. **Per-phase calorie delta override is layered, not formula replacement:** keep `calculateCalorieBreakdown()`/TDEE core unchanged; apply phase delta via `calculateGoalCalories(..., deltaOverride)` in target resolution paths.
80. **Goal prediction card should stay mounted in goal mode:** keep render gating on `creationMode === 'goal'` (not on projection availability) and use a placeholder message when start/end inputs cannot yet produce `estimateGoalModeProjection(...)` output.
81. **Do not label weight-relative % as body-fat %.** Use `predictedWeightDeltaPercent` wording in UI copy; treat `predictedBodyFatDeltaPercent` as deprecated alias for compatibility only.
82. **Feasible-date band API is opt-in for heavy arrays.** Prefer summary fields (`strictCount`, `lenientCount`, `feasibleMinDateKey`, `feasibleMaxDateKey`, day-span ranges) and only request date/evaluation arrays when the caller explicitly needs them.
83. **OpenRouter proxy hardening is config-sensitive:** keep `ALLOWED_ORIGINS` and (if enabled) Upstash rate-limit env vars configured in deployment; mismatched env config can silently alter CORS/throttling behavior across environments.
84. **Health Connect step reads must be today-scoped first:** `useHealthConnect.fetchSteps()` must use the explicit today window from `buildHealthConnectStepReadWindow()` (local midnight → now) as the primary read. The plugin's native default (`now - 1 day` / `now`) is a rolling 24 hours and would include previous-day steps in today's live count, so it must only be used as a degraded fallback when the explicit today window fails. Keep the rolling 24-hour fallback in the same helper module for recovery paths. If every read still fails on a real device, return `null` and keep the app usable instead of surfacing a connection error.
85. **CalorieMap live card is a consumer, not the source of Health Connect failures:** `CalorieMapScreen` should keep passing `{ steps, tefContext }` to the breakdown modal, but any time-window fix belongs in the Health Connect hook/helper layer.
84. **Scroll pickers must not fight the user's gesture:** Embedded pickers that live-update a parent `value` prop on every scroll (e.g. `WeightPicker`/`BodyFatPicker` in the entry modals) must guard the `[value]` alignment effect with a user-driven flag (`isUserDrivenRef` + short auto-reset timeout). Without this, the effect re-runs on every scroll update and calls `alignScrollContainerToValue(...)` mid-gesture, causing choppy, fighting-the-finger scrolling. The settle-timeout in `createPickerScrollHandler` already snap-aligns after the gesture ends, so `handleWholeChange`/`handleDecimalChange` should not call `alignScrollContainerToValue` directly either. Keep initial open alignment, clamping, and max-value decimal reset behavior intact.
86. **Daily NEAT overrides are date-scoped + clamped:** `dailyNeatOverrides` is a **history field** (not profile) and sharded by date (`dailyNeatOverrides:YYYY-MM-DD`). Always route writes through the store action `setDailyNeatOverride(dateKey, overrideOrNull)` (never mutate the map ad-hoc), normalize dates via `normalizeDateKey()`, and clamp multipliers with `clampCustomActivityMultiplier()` (0.1–1.0). The multiplier is applied override-first in `calculateCalorieBreakdown` for the resolved `dateKey` only; do not leak an override across other dates or into global settings.
87. **N-day measurement averages are trapezoidal + window-anchored:** `calculateNDayWeightAverage`/`calculateNDayBodyFatAverage` integrate over an exact n-day UTC window anchored to today (or explicit `endDateKey`) via the shared `calculateTrapezoidalWindowAverage(...)` in `weight.js`. Do not reintroduce naive entry means, duplicate the integral per module, or substitute `0` when they return `null` — render the empty state honestly.
88. **Day-window iteration uses `getWindowDateKeys`:** build date windows with `getWindowDateKeys(endDateKey, n)` from `utils/data/dateKeys.js` (UTC-stable, canonical-key validated). Do not hand-roll `setDate`/ISO-slice loops that silently accept non-canonical keys like `2026-02-31`.
89. **Chart gap styling is tag-driven and tiered:** tracker charts interpolate interior missing days via `buildTaggedChartSlots(...)` (`isInterpolated` + `gapLength`) and tier bridges in `buildGapAwarePathRuns(...)` — ≤7 days solid, 8–14 dashed, >14 broken. Preserve the tags when mapping points; stripping `gapLength` collapses dashed/broken tiers to solid. Leading/trailing empty slots must stay `null`, tooltips snap to real points only, and `buildSegmentedBezierPaths` stays deleted.
90. **Smart AT is gated on weigh-in freshness:** `getAdaptiveThermogenesisSmartModeDataStatus` rejects the smart signal with `reason: 'weight-data-stale'` when the newest weigh-in exceeds `SMART_WEIGHT_STALENESS_MAX_AGE_DAYS` (3) relative to the requested `dateKey`; the correction deactivates instead of extrapolating stale trends. Tune only the exported constant; never bypass the gate.
91. **Trend fallback is capped:** `calculateWeightTrend`/`calculateBodyFatTrend` use the last-two-entries fallback only when their span ≤ `MAX_TREND_FALLBACK_SPAN_DAYS` (14); otherwise they return `'Need more data'` with `isStaleFallback: true`. Do not widen the cap or drop the flag without a coordinated UI/test update.
92. **Daily Ledger surfaces are read-only snapshot projections:** `DayLedgerListModal`/`DayLedgerModal` consume snapshots only through `dayLedgerPresentation.js` helpers; never mutate snapshots from these modals, never zero-fill missing days, and never animate/dynamically resize the bottom dual-mode panel — it must keep ONE stable fixed height (`h-[230px]`, taller than the original 200px) across every state, with `absolute inset-0` panels + inner scrolling, because animated resizing reintroduces the exact layout shift the fixed height exists to prevent.
93. **Daily Ledger picker overlays must stay anchored:** position them with a `relative` wrapper + absolute flex centering under the nav row while Motion animates only the inner card. Do not reintroduce invalid Tailwind classes (`left-1/5`, `top-29`) or Tailwind translate centering on Motion elements (see the Framer Motion transform caveat).
94. **Carousel peek has hard sync points:** `SCREEN_EDGE_PEEK_PX` (16) in `useSwipeableScreens.js` ↔ `.carousel-slide { width: calc(100% - 32px) }` in `index.css` ↔ the slide inner padding (`px-2`) that puts real card content into the sliver. Changing one requires updating the others; the transform compensation `PEEK*(1+2*screen)` derives from the constant automatically.
95. **Peek slivers are gesture area, not tap area:** keep the invisible edge tap-guard strips (`absolute inset-y-0 z-10 w-4`) inside the viewport; without them, taps on the sliver would trigger cards on hidden neighbour screens. Drags must keep working from the guards (they bubble to the viewport handlers).
96. **Peek fades are alpha masks on neighbours only:** apply `.slide-fade-left/right` only to `currentScreen ± 1` slides via `getSlideEdgeFadeClass`, and never replace the masks with gradient overlay strips (overlays tint the faded pixels instead of letting the page gradient show through).
97. **`--screen-drag-progress` is the drag-sync channel:** published imperatively on `:root` by `useSwipeableScreens.applySliderTransform` and consumed via `calc(...)` by the tab-bar circle and header dots. Do not replace it with React state (re-renders per drag frame) and do not introduce per-button conditional remounts for the moving pill/circle/dot.
98. **The swipe coach-mark flag is persisted and store-routed:** `userData.hasSeenSwipeHint` (profile scope) is mutated only via the `markSwipeHintSeen()` store action; the header chip hides on first drag or tab select. Do not derive it from transient UI state.
