# Energy Map Calorie Tracker - AI Coding Instructions

## Project Overview

React + Vite single-page app for fitness calorie tracking, wrapped by Capacitor for mobile deployment (iOS/Android). Local-first architecture with Zustand state management, Dexie-backed history persistence plus Capacitor Preferences for profile/settings, and Supabase-catalog-backed online food search + OpenFoodFacts barcode lookup.

**Distribution:** native iOS + Android only. There is **no public web app** — the only Vercel deployment is **API-only** (`/api/*`; every other path returns `404`). The browser target exists but is **dev-only** (`npm run dev`, `localhost:5173`); the web branches in `services/fileShare.js` / `utils/platform.js` are retained for development and are never deployed.

**Tech Stack:**
- React 18.3.1 + Vite 8.2.0 (dev server on `localhost:5173`, `strictPort: true`)
- Capacitor 8.0.1 (`appId: com.energymap.tracker`, `webDir: dist`)
- **Persistence:** Dexie (`IndexedDB`) for history + `@capacitor/preferences` for profile/settings
- **State:** `zustand` 4.5.5 using `createWithEqualityFn` (`zustand/traditional`) with `subscribeWithSelector` middleware
- **Food Catalog Runtime:** `sql.js` (WASM SQLite reader in browser)
- Dexie 4.x (history document store)
- Framer Motion 12.23.24 (animations)
- Tailwind 4.x (CSS-first: `@import 'tailwindcss'` + `@theme inline` in `src/index.css`, no `tailwind.config.js`; styling via CSS variable–based semantic tokens)
- Lucide React 0.562.0 (icons)
- **External APIs:** Supabase food catalog (online text search via `api/foods.js`; legacy `/api/usda` alias retained), OpenFoodFacts (barcode lookup via `api/openfoodfacts.js`), OpenRouter (AI parsing via `api/openrouter.js`), anonymous remote push device registration (`api/push/register.js`, `api/push/unregister.js`)

**Key Capacitor Plugins:**
- `@capacitor/preferences` — Profile/settings storage
- `@capacitor/app` — App lifecycle, hardware back button
- `@capacitor/status-bar` — Status bar color/style per theme
- `@capacitor/keyboard` — Input handling (iOS: `resize: "none"` + `autoBackdropColor: "dom"` in config; Android's contract is the manifest's `adjustResize`)
- `@capacitor/splash-screen` — Launch screen
- `@capacitor/barcode-scanner` — Native barcode scanning (FoodSearch barcode action)
- `@capgo/capacitor-health` — Step + heart-rate sync (Health Connect on Android, HealthKit on iOS; read-only for HR)
- `@capacitor-community/bluetooth-le` — Live heart-rate sensors (Heart Rate Service 0x180D); **dynamically imported** only
- `@capacitor-community/keep-awake` — Keeps the screen on during a live HR recording; **dynamically imported** only
- `@capacitor/local-notifications` — Layer 1 on-device reminders, digests, milestones, and live HR guard; **dynamically imported** only via `services/notificationBridge.js`
- `@capacitor/push-notifications` — Layer 2 optional remote announcements (FCM/APNs); **dynamically imported** only via `services/notificationBridge.js`
- `@capgo/capacitor-navigation-bar` — Android navigation bar theming
- `@capacitor/filesystem` + `@capacitor/share` — Native export delivery (Cache write + OS share sheet)

**Two test tiers are automated and CI-gated** — `node --test` for logic (`tests/**/*.test.js`) and Vitest/jsdom for UI (`src/**/*.spec.{js,jsx}`), with coverage floors enforced by `.github/workflows/ci.yml` (`verify` + `ios` jobs; `npm run lint:ci` downgrades the two pre-existing advisory rules to warnings). Still do manual UI checks for visual/interaction changes. No router — single-page app with swipeable screen carousel.

---

## Architecture: Store + Orchestrator Pattern

### The Big Picture

```
main.jsx
  └─ App.jsx (theme management, store hydration gate)
      └─ EnergyMapCalculator.jsx (4,675 lines — THE orchestrator)
            ├─ 5-screen carousel (useSwipeableScreens)
            │   ├─ LogbookScreen
            │   ├─ TrackerScreen
            │   ├─ HomeScreen
            │   ├─ CalorieMapScreen
            │   └─ InsightsScreen
            ├─ PhaseDetailScreen (drill-down, not in carousel)
                └─ 54 top-level useAnimatedModal instances → 74 modal-related files (68 modals + 6 panels)
                 └─ 34 additional child-level modal instances inside modal/common components
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

1. **Single orchestrator file (`EnergyMapCalculator.jsx`)** owns all modal lifecycle state, temporary form drafts, and screen navigation. At 4,675 lines, it's deliberately centralized — not a candidate for splitting. New modals are instantiated here.

2. **Derived state pattern:** The Zustand store's `deriveState()` owns canonical fields (`bmr`, `trainingCalories`, `totalCardioBurn`, sorted entries, resolved types). Hot-path caching is intentional (resolved type maps, sorted arrays, normalized phase state, phase view projection) and `updateUserData` short-circuits no-op mutations. Never duplicate these calculations — consume them from the store.

  - **Vite 8 / Rolldown chunking:** `build.rollupOptions.output.manualChunks` must be a function. The older object-map form throws `manualChunks is not a function` and prevents `dist/index.html` from being emitted, which breaks Capacitor sync.
  - **`services/openrouter.js` imports only `@capacitor/core` and `ragBudget.js`.** Its manual chunk absorbs its imports, so one app import makes the whole chunk boot-critical (pinned by `tests/utils/openrouter.test.js`).
  - **Boot-critical chunking rules (`vite.config.js`):** `@capacitor/barcode-scanner`, `@capacitor-community/*`, `@capacitor/local-notifications`, and `@capacitor/push-notifications` are deliberately excluded from the shared `chunk-capacitor` chunk, and `html5-qrcode` gets its own manual chunk. The scanner's *web* fallback bundles html5-qrcode (~350 kB min) which never runs on native; lumping it into the capacitor chunk (eagerly loaded at launch via the static `@capacitor/keyboard` import in `main.jsx` and `modulepreload`ed from `dist/index.html`) used to cost ~28% of cold-start JS. Both the scanner's async `web.js` and the html5-qrcode engine must stay lazy (fetched only when a web-platform scan initialises), and the notification / BLE plugins must stay dynamically imported. Do not revert these rules; when touching chunking, verify the `modulepreload` list in `dist/index.html`.

3. **Store initialization is async.** `setupEnergyMapStore()` is called once from `EnergyMapCalculator`, which gates rendering on `isLoaded === true` to prevent flash of default data.

4. **`main.jsx` bootstraps** by preventing pinch-to-zoom gestures (gesturestart/change/end + Ctrl+wheel), configuring Capacitor keyboard settings, and rendering `<App />` — no providers, no router.

5. **Phase domain is `phaseLogV2`-native in the store.** Legacy `phases`/`activePhaseId` are derived projections for UI compatibility and are no longer persisted or mutated directly.

6. **Daily snapshots are derived and date-keyed.** `userData.dailySnapshots` is an auto-maintained history cache (`YYYY-MM-DD` keys), generated from canonical datasets (`nutritionData`, step/training/cardio sessions, and `calculateCalorieBreakdown`) via store action `upsertDailySnapshot(dateKey, options?)`.

7. **Goal state for duration-sensitive logic is profile-canonical.** `selectedGoal` and `goalChangedAt` live in persisted `userData` (profile scope), and any “days in goal” logic should derive from these values (e.g., `goalDurationDays` from the store). Do not rely on local component state or snapshots as the sole source of current goal status.

8. **Modal rendering is now intentionally lazy for heavy surfaces.** In `EnergyMapCalculator`, high-cost fullscreen and selected high-traffic modal components are loaded with `React.lazy(...)` and mounted conditionally (`isOpen || isClosing`) inside `Suspense` boundaries. This now includes three heavyweight pickers — `CalendarPickerModal` (~42 kB source), `FoodPortionModal` and `MacroPickerModal` — which used to sit in the boot-critical bundle despite being rarely-opened surfaces. Preserve this pattern for bundle health and animation-safe close behavior.

9. **Phase creation now supports dual modes with lock-aware goal behavior.** `PhaseCreationModal` supports `creationMode: 'goal' | 'target'`. In `target` mode, end date is required and at least one target metric (`targetWeight` or `targetBodyFat`) must be provided. The store derives a smart daily energy delta from `phaseTargetPlanning` and can temporarily lock goal changes while an active phase owns the phase delta (`isGoalLockedByActivePhase`). **While a phase is active its goal type IS `selectedGoal`** (`syncSelectedGoalToActivePhase` inside `normalizePhaseStateForUserData`, so every action, hydration and import enforces it; `goalChangedAt` restamps on a real change; ending the phase keeps its goal and lifts the lock). A target phase's goal is never a stored label: phase normalization re-derives it from its plan (`resolveGoalForDailyDelta(smartCaloriePlan.requiredDailyDeltaCalories)`), so a +692 kcal/day plan is an Aggressive Bulk. Before this, a bulk phase started from Maintenance read "Maintenance · +692 kcal surplus" on Home and recorded maintenance into snapshots and Staged AT, and a goal-mode phase never applied its goal at all.
9b. **Goal sizes have one definition: `constants/goals/goalDefinitions.js`.** Each goal's calorie change (±300 / ±500) and its weekly weight-rate band (moderate 0.25–0.45 kg/wk, aggressive 0.45–1.0, maintenance ±0.1) live together, and an aggressive goal starts at its own delta (500 kcal/day ≈ 0.45 kg/wk at `KCAL_PER_KG_BODYWEIGHT` 7,700), so following a goal is always "On track" by its own verdict. `resolveGoalCalorieDelta`, `isGoalKey`, `calculateGoalAlignment` (weight), `getGoalAlignmentText` / `getGoalWeeklyTarget` (weight) and `resolveGoalForDailyDelta` (target phases, templates: <100 kcal maintenance, 100–499 moderate, ≥500 aggressive) all read it. The table also holds each goal's **body-fat** band (%/wk; no calorie equivalent): moderate 0.08–0.15, aggressive 0.15–0.3, maintenance ±0.1 - the bands the Body Fat trend sheet always documented. The verdict text and "Goal:" label used to reuse the weight numbers (0.25–0.5 %/wk, copied when the body-fat tracker was cloned from the weight one), so a body-fat trend's colour and its words disagreed. Read bands through `getGoalRateBand(goal, metricType)` and write them with `getGoalWeeklyTarget` (chips) / `getGoalRateRangeText` (the Weight / Body Fat trend info sheets); a trend is "flat" only below `getGoalDirectionThreshold(metricType)` (weight 0.1 kg/wk, body fat 0.08 %/wk: the slowest band's floor), so a rate inside a goal's own band is never "the wrong way". Never re-declare a goal-key set, a calorie map or a rate band elsewhere. `goals.js` (labels, colours, icons, `desc`) is UI only. The trend *labels* (`Stable` / `Gradual` / `Moderate` / `Aggressive` / `Severe` … in `weight.js` / `bodyFat.js`, and the trend info sheets' "Trend Classifications") are descriptive, but their edges come from the same table through `getTrendLabelThresholds(metricType)`: Stable below the flat zone, Gradual through the moderate band, then 80 % / 120 % of the aggressive band's top, rounded to two decimals - weight 0.1 / 0.45 / 0.8 / 1.2 kg/wk (unchanged), body fat 0.08 / 0.15 / 0.24 / 0.36 %/wk (they used to reuse the weight numbers, so a Lean Bulk's +0.09 %/wk read "Stable"). Covered by `tests/constants/goalDefinitions.test.js` (incl. every target template's `goalType` matching its own plan, and the trend labels), `src/utils/visuals/trackerHelpers.spec.js` (colour vs words for body fat) and `modals/info/TrendInfoModals.spec.jsx` (the sheets print the table's numbers).
10. **Goal-mode prediction UX is always visible.** In `PhaseCreationModal` goal mode, keep the bottom prediction card rendered even when insufficient inputs exist; show placeholder guidance until projection inputs are complete.
11. **Goal-mode percentage projection is weight-relative, not body-fat change.** `estimateGoalModeProjection(...)` returns `predictedWeightDeltaPercent` (bodyweight-relative delta) and keeps deprecated `predictedBodyFatDeltaPercent` as a compatibility alias only.
12. **The swipe shell is a coordinated, looping design system:** all five screens render exactly once and each is positioned by its own wrapped transform (canonical math in `utils/visuals/carouselLoop.js`), so the carousel loops in both directions (by default; the user can turn the loop off and re-order the screens) with no cloned slides, ghost cells or normalization timers; a full-bleed carousel viewport + 16px edge peek with alpha-faded neighbour slides, a floating glass bottom tab bar (`ScreenTabs`), and a header zone (`AppHeader`) with greeting + per-screen glanceable stats + drag-linked swipe dots. **Motion ownership:** drag frames are imperative `translateX` writes (rAF-throttled, no React re-render), while settles are a CSS transition (`SLIDE_SETTLE_TRANSITION`) written onto the slides so they run on the compositor thread — never a JS/rAF settle, which is exposed to every main-thread stall and visibly stutters on high-refresh screens. The drag-linked markers (tab-bar circle, header dot) are **ring** affordances — `RING_COPY_OFFSETS` copies of one element, one track apart, all driven by the same live position — so a seam crossing glides one copy off the end of the track while the next re-enters the other end; and the peek fades are permanent per-slide masks whose *strength* the shell writes (a mask cannot be transitioned as a class, so toggling fades popped). All peek/peek-fade/bar/dot geometry constants are inline **px** (the app root font is rem-based: 13px mobile / 17px desktop) and have hard sync points — see Screen Components.

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

**`deriveState` hot-path caching:** the date-scoped session burns (`trainingCalories`, `totalCardioBurn`) are WeakMap-cached per `(sessionsRef, typesRef, dateKey|weight|age|height|gender)` via `getCachedDateBurn` — the sessions arrays are replaced immutably by `updateUserData` (the same contract the persistence diff relies on), so a profile-only write like a theme or fontScale toggle no longer re-scans/re-prices every session. Type resolution, entry sorting, phase normalization and the phase view keep their own WeakMap caches. Do not remove or bypass these caches; if you add a profile field the burn formulas read, extend `todayBurnProfileKey`.

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
- **`goalTarget` is the per-day target record** (`-resolveGoalCalorieDelta(goal, phaseDeltaOverride)`, same sign as `deficit`). The **deviation is never stored** - it is `deficit - goalTarget`, derived in `dayLedgerPresentation.js`. **Past days keep their goal**: a rebuild of an existing snapshot for a date before today (an edited meal, a health backfill) carries `goalAtSnapshot` and `goalTarget` forward instead of restamping them with today's goal; today's snapshot follows the live goal. A legacy past snapshot keeps its goal and leaves `goalTarget` `null`. Readers go through `resolveSnapshotGoalTarget(snapshot)` -> `{ target, source: 'recorded' | 'nominal' }` (nominal = the goal's ±300/±500 delta, for legacy snapshots; phase overrides are not recoverable from history) or `null`. `createPhase` / `updatePhase` / `deletePhase` / `setActivePhase` refresh today's snapshot (like `setSelectedGoal`) so today's target tracks the phase lock. `normalizeDailySnapshots` coerces a stored `goalTarget` to a finite number or `null` on load. **Load-time history repair (hydration + import only, never per write):** `reconcileSnapshotGoalsWithPhases` relabels `goalAtSnapshot` on days a target phase's smart delta was recorded under a goal that does not explain it (inside the phase's dates, `goalTarget === -plannedDelta`, and the recorded goal's own nominal delta is not that target); nothing else changes, and today is rebuilt when loading moved the goal.
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

- **54 top-level `useAnimatedModal()` instances** in `EnergyMapCalculator.jsx` (top-level orchestrator)
- **34 additional child-level modal instances** declared inside modal components and `common/ImportWorkoutButton.jsx` (e.g., delete confirmations, sub-pickers, the workout import list, the recipe ingredient picker + its portion sheet)
- **68 modal component files** organised into 6 subfolders inside `src/components/EnergyMap/modals/`, plus 6 supporting panel components under `fullscreen/panels/`:
  - `fullscreen/` — WeightTrackerModal, BodyFatTrackerModal, StepTrackerModal, SettingsModal, FoodSearchModal, AdaptiveThermogenesisModal, RollingEnergyBalanceModal, **HeartRateTrackerModal**, **LiveHeartRateSessionModal**, **RecipeIngredientPickerModal** (the recipe builder's "Add ingredient" page: a child of `AddCustomFoodModal`, lazy-loaded, same fullscreen chrome as Food Search)
  - heart-rate additions elsewhere: `forms/` **RestingHeartRateEntryModal**, `info/` **HeartRateZonesInfoModal**, `lists/` **HealthWorkoutImportModal** (child of the cardio/training forms) and **HeartRateSensorPairingModal**
  - `pickers/` — AgePickerModal, CalendarPickerModal, **CaloriesPerHourPickerModal**, DatePickerModal, **DualWheelModal**, DurationPickerModal, **EnergyPickerModal**, EpocWindowPickerModal, FoodPortionModal, HeartRatePickerModal, HeightPickerModal, **MacroPickerModal**, MealTypePickerModal, MetValuePickerModal, **NumericValuePickerModal**, StepGoalPickerModal, TemplatePickerModal, TimePickerModal
  - `info/` — AdaptiveThermogenesisInfoModal, **AddCustomFoodInfoModal** (child of `AddCustomFoodModal`), BmiInfoModal, BmrInfoModal, BodyFatTrendInfoModal, CalorieBreakdownModal, CaloriesPerHourGuideModal, DayLedgerModal, EpocInfoModal, FfmiInfoModal, TefInfoModal, WeightTrendInfoModal
  - `forms/` — AddCustomFoodModal, BarcodeEntryModal, BodyFatEntryModal, CardioModal, CustomCardioTypeModal, DailyActivityCustomModal, DailyActivityEditorModal, DailyLogModal, **DailyNeatOverrideModal**, FoodEntryModal, GoalModal, PhaseCreationModal, TrainingModal, StepRangesModal, TrainingTypeEditorModal, WeightEntryModal
  - `lists/` — CardioFavouritesModal, CardioTypeListModal, CalorieTargetModal, DayLedgerListModal
  - `common/` — ConfirmActionModal
  - `forms/RecipeIngredientsSection.jsx` is a **section component, not a modal** (the Recipe half of `AddCustomFoodModal`); it owns one `NumericValuePickerModal`
- Total across codebase: 88 modal hook instances (`useAnimatedModal`)

### Settings Modal Navigation

- `SettingsModal` remains one fullscreen modal. Its home page is a simple vertical list of ten category buttons: Profile & Health, Units, Appearance, Home & Tips, Navigation, Activity & Steps, Metabolic Adjustments, Food & Macros, Notifications, and Integrations. Do not add numbering, descriptions, or a second page title to the hub.
- Each category opens in place, using the shared fullscreen header pattern (back chevron + current page title); pages start directly with their controls rather than a separate intro heading/description.
- Settings changes apply immediately through the existing `onFieldChange`/store path. There is no draft, Save, Cancel, or rollback when navigating between pages or closing the modal.
- Header back and Escape step up via `getSettingsParentPage` (`utils/settings/settingsNavigation.js`): from the **Choose a metric** slot picker (`homeLayout:<slot>`) back to **Home & Tips** (`homeLayout`), from a category page back to the hub (`home`), and from the hub they close Settings. Android hardware back follows the same rule through `closeTopmostModal`.
- **Settings motion (CSS, enter-only, reduced-motion safe).** The hub and pages swap in place, so direction lives on the way in: entering a deeper page slides its blocks in from the right (`.settings-page-enter > * > *`), stepping back to a parent page slides from the left (`.settings-page-back > * > *`), and returning to the hub slides its rows from the left (`.settings-hub-enter > *`), all staggered by child index. The hub only animates when the user came *back* to it - `SettingsModal` derives depth & direction during render (`navTrack`, reset when the modal closes), never in an effect - so the modal's own open animation is not doubled. Inside `Choose a metric`, the wrapper shares one key (`homeLayout:picker`) so switching Shortcut / Left tile / Right tile tabs does not replay the page enter animation. The header title is re-keyed (`header-stat-in`). Keyframes use `animation-fill-mode: backwards`, **never `both`/`forwards`**: a held fill pins `transform: none` over every button's `active:scale-*` press feedback. Options that exist only while a parent switch is on (EPOC carryover, Smart TEF sub-toggles, AT mode/smoothing, the Notifications rules' time/day extras) are wrapped in `SettingsReveal` (`fullscreen/SettingsReveal.jsx`), which animates the wrapper's height together with the fade via `AnimatePresence` so the sections below glide instead of jumping; a segmented choice plays `.settings-select-pop` only when `active` flips to true *after mount* (render-phase tracked in `SegmentedButton`, so a page opening does not pulse the already-selected buttons). `BinarySwitch` uses a springy thumb and an emerald glow when on. All of these classes are in the `data-motion` reduced/off opt-out list (see Motion Preference) in `index.css`; add any new Settings motion class there too.
- Keep child pickers and info modals ahead of Settings in the orchestrator's close priority so the active child closes first. Categories are not separate or stacked modals.
- **Navigation** (`fullscreen/NavigationSettingsSection.jsx`) arranges the five main screens: a **Live preview** of the tab bar (tap one slot, then another, to swap them; Home wears the accent circle because the app opens on it), the **Page order** list (framer-motion `Reorder`; only the grip handle starts a drag so the rest of the row still scrolls, arrow keys on the handle move a row, moves are announced in a `role="status"` line), the **Loop pages** switch (`screenLoopEnabled`) and a **Default order** reset row (order only). Screens can be re-ordered, never added or removed. A drag is staged in local state and written once on drop (the second exception, with the AT slider, to apply-on-change); every other control applies immediately. Covered by `NavigationSettings.spec.jsx`.
- Preserve the existing control ownership: Profile & Health contains profile and body-measurement settings, plus the **Heart rate** group (`HeartRateSettingsSection`: resting HR → HR tracker / "Log today's reading", Max HR + VO2 max pickers with an "automatic" reset, and the zones explainer — all through `actions.openers` keys `heartRateTracker` / `restingHeartRateEntry` / `maxHeartRatePicker` / `vo2MaxPicker` / `heartRateZonesInfo`; the watch-sync switch and the BLE sensor row moved to Integrations); **Units** (`UnitsSettingsSection`) owns `userData.unitPreferences`: a Metric / US / UK preset row and one segmented row per quantity (see Measurement Units); **Appearance** owns theme selection plus **Text size**, **Density**, and **Animations**; **Home & Tips** (`HomeLayoutSettingsSection` + `HeroMetricPickerPage` in `fullscreen/HomeLayoutSettingsSection.jsx`) owns a live interactive preview of the Home hero card (dashed outlines on the Shortcut pill and two tiles), the **Currently showing** summary rows, the **Choose a metric** subpage with a Shortcut / Left tile / Right tile segmented switcher over the 4 categorised metric groups (`Food`, `Activity`, `Body`, `Trends` from `HERO_ACTION_CATEGORIES`, persisted as `heroActionMetric` / `heroTileLeftMetric` / `heroTileRightMetric` and swapped on collision so no metric appears twice; Body Fat is disabled while `bodyFatTrackingEnabled` is off; picking a metric stays on the picker so all 3 slots can be configured in one visit), a **Goal card** switch (**Start a phase prompt**, `homePhasePromptEnabled`, default on: hides the goal card's no-phase "Start a phase" footer), and the single consolidated **Tips** reset row ("Swipe, macro and pin tips" → **Show all again**, resetting any seen `hasSeenSwipeHint` / `hasSeenMacroHint` / `hasSeenPinHint` back to `false`); Activity & Steps shows one card per day type (Training Day / Rest Day: preset, offset, BMR+NEAT baseline, a "Today" badge and today's NEAT override if set); each card calls `openers.dailyActivity(dayType)` which opens `DailyActivityEditorModal` for that day directly (there is no intermediate day-picker modal), plus the **Daily step goal** and **Step ranges** pickers (reusing `StepGoalPickerModal` / `StepRangesModal` through the `openers` map); Metabolic Adjustments contains EPOC, Smart TEF, and Adaptive Thermogenesis settings; **Food & Macros** owns the default Food Search view (`foodSearchDefaultEntry`, options shared with `MealTypePickerModal` via `FOOD_SEARCH_DEFAULT_ENTRY_OPTIONS`), the macro split summary that opens `MacroPickerModal`, the **On-target range** (`onTargetToleranceKcal`: a ±50 / ±100 / ±150 / ±250 kcal segmented choice (labelled in kJ for kJ users; the stored value stays kcal) - Strict / Default / Relaxed / Loose - defined with its normalizer in `constants/goals/onTarget.js`, validated in `handleUserDataChange` and `mergeWithDefaults`, default 100; it decides when the Daily Ledger counts a day as on target and how wide the Tracker's calorie target range is), and **Clear cached foods** (confirmed through `ConfirmActionModal`; favourites and logged meals are unaffected, pins on cached online/barcode foods stop showing). **Integrations** (`IntegrationsSection`) owns everything that crosses the app boundary, in three groups: **Health data** (headed `getHealthSourceName()`: a **Steps** row and a **Heart rate & workouts** row, a **Sync now** button that refreshes both, **Manage permissions** on Android only, a last-synced label via `formatRelativeTime`, and a read-only footnote), **Devices** (the BLE sensor row → `openers.heartRateSensor`) and **Your data** — **Export all data** (`exportAllDataAsJSON`; format build/parse live together in `utils/data/fullExport.js`, `cachedFoods` is left out) and **Import from file**, with one shared status line (a dismissed share sheet stays silent). **Export delivery is platform-specific via `saveTextFileToDevice` (`services/fileShare.js`):** web = download; **Android = written straight into the public Documents folder** (`method: 'saved'`; no storage permission on Android 11+, Android 10 and older refuse the write and fall back to the share sheet) with a separate **Share** button for the sheet; **iOS = share sheet only**, because iOS has no public folder an app can write to and the sheet's "Save to Files" is its download (the status line says so). Phase exports still use `saveTextFile` (share sheet). **Import** reads the picked file in the page (`<input type=file>`, no plugin), validates it with `parseFullExportText` (right app, known `formatVersion` — a newer one is refused — non-empty `data`), then hands `{ ok, data, summary }` to `openers.importData(parsed, onResult)`; the orchestrator's `handleImportData` is the destructive gate (`ConfirmActionModal`, danger tone, summary in the copy) and reports back through `onResult` because the confirm modal closes on accept. **Import is REPLACE, never merge**, through store action `importUserData`: it persists first and swaps memory only on success (a failed write leaves the app as it was), via `replaceEnergyMapData` in `storage.js`, which flushes the current state and then saves the import as an ordinary diff, so the existing identity-diff machinery deletes every shard the file lacks — nothing is cleared before the new data is written (`saveEnergyMapData` now returns a boolean for exactly this). `DEVICE_BOUND_FIELDS` (`heartRateSensor`, `heartRateSyncEnabled`) keep THIS device's values over the file's; `cachedFoods` is not in an export, so it resets to empty. Covered by `src/store/importUserData.spec.js` (in-memory Dexie stand-in: stale shards deleted, failed write leaves memory untouched), `fileShare.spec.js`, `tests/utils/fullExport.test.js` and the import/export blocks in `SettingsModal.spec.jsx`. Step-sync state is **not** a singleton: the orchestrator owns the `useHealthConnect()` instance and passes it to the modal as the `stepSync` prop (`{ status, isLoading, error, lastSynced, connect, refresh, openSettings }`; omitted = unavailable). Heart-rate sync reads the `heartRateSync` singleton directly. **Steps has no off switch on purpose:** `useHealthConnect` reconnects on launch whenever the OS still grants access, so a switch would not survive a relaunch — its row offers Connect/Retry and the footnote points to the health app for revoking; heart rate has a real persisted opt-in (`heartRateSyncEnabled`). When neither store is reachable the group shows an explanatory note ("Health Connect isn't installed…" / "…isn't available on this device.") instead of an empty card. Covered by the `SettingsModal Integrations page` block in `SettingsModal.spec.jsx`, `tests/utils/relativeTime.test.js` and `tests/utils/fullExport.test.js`. New Settings rows reuse existing store fields/modals through `actions.onFieldChange` / `actions.openers` - add no new systems here. **Appearance renders each theme as a live preview swatch**: `THEME_OPTIONS` carries a `swatchClass` per theme (`auto` is a dark/light split), and the swatch element wears that theme class so its `bg-background` / `bg-surface` / `bg-primary` resolve from the real theme definition in `index.css` - never hardcode a theme's colours in the picker. `.theme-dark` exists only as a swatch alias of the `:root` default (it is never applied to `<body>`).

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
  - The bar-chart `<rect>`s carry `tracker-bar-animated` so bars grow in (`trackerBarIn`). Both benefit from the global `data-motion` reduced/off rules in `index.css`.
  - **Do not** leave a sliding-pill as per-button conditional remounts (no `transition` → no slide); always keep one persistent pill and animate `left`/`transform`.


### Daily NEAT Override Frontend

- `DailyNeatOverrideModal` (`modals/forms/DailyNeatOverrideModal.jsx`) is the session quick-sheet for today's **daily NEAT override**. It may show an advisory heart-rate chip (`heartRateAdvice` from `assessNeatFromHeartRate`) that only stages the next preset up/down — never applied automatically (see "Heart Rate"). It is mounted with an `isOpen || isClosing` guard, keyed by a version counter so it re-freshes its selection state on each open (no setState-in-effect on open).
- It renders a curated set of preset cards from `ACTIVITY_PRESET_OPTIONS[dayType]` plus a **"Use my settings (default)"** clear action. Selecting a preset stages an apply; `onApply({ multiplier, presetKey, label })` saves the override, `onClear()` clears today's override and falls back to the global setting.
- The top-right day pill is **color-coded by day type**: Training Day = `text-accent-blue` + **Dumbbell** icon, Rest Day = `text-accent-indigo` + **Bed** icon (via `DAY_PILL_CLASS` / `DAY_ICON_BY_KEY`).
- **Home entry point:** In `HomeScreen`'s "Today's Activity Burn" hero, the **NEAT metric block** (icon + label + kcal) is the touch target — it carries a faint underline + chevron affordance, opens the override modal via `onOpenDailyActivityOverride`, and tints green when today's override is active. The **"~X% of daily TDEE"** pill there is a separate button wired to `onOpenTodayBreakdown`, which opens the `CalorieBreakdownModal` for today.
- **Configurable Home hero slots (pill + two tiles):** the header gear already owns Settings from every screen, so `HomeScreen`'s hero card exposes three configurable slots drawing from one 12-metric registry (`constants/appearance/heroAction.js` — `calories`, `caloriesLeft`, `protein`, `steps`, `deficit`, `balance7d`, `phase`, `streak`, `restingHr`, `burn`, `weight`, `bodyFat`; defaults are `calories` / `weight` / `bodyFat` so out-of-the-box Home looks unchanged; `weight` and `bodyFat` are tile-only and never offered or allowed on the pill):
  - **Pill (`HeroActionPill`, `common/`):** beside the **"Energy Map"** heading in a `flex flex-wrap` row; one content-hugging sibling of the hero buttons (`bg-primary`, `rounded-lg`, `px-4 py-2` + 20px icon, `font-semibold`, `shrink-0`, no `shadow-*` utility — height is *derived* from padding rather than fixed `h-9`/`h-10`). Calorie/protein metrics open the canonical meal-entry flow (`handleLogFoodFromHome`, which pins `trackerSelectedDate` to today before `startMealEntryFlow()`); other metrics open their own screen directly with no extra `+` button tacked on.
  - **Two tiles (`HeroActionTile`, `common/`):** the 2-column row under the title (copying the original Weight / Body Fat tile grammar: `shortLabel` / `primary` + optional staleness `warning` chip / `caption` + chevron). When `bodyFatTrackingEnabled` is off, `readHeroSlots` steps Body Fat aside at render time to the next free metric instead of leaving a hole, without rewriting the stored pick (it returns when tracking is re-enabled).
  - **Shared model & progress outline:** pure `buildHeroActionModel` + `getProgressPercent` (`utils/calculations/heroActionMetrics.js`) supply both shapes from canonical sources (`HomeScreen` still reads today's nutrition once via `todayNutritionTotals`). Both `HeroActionPill` and `HeroActionTile` share `HeroProgressOutline` (`common/`): a stretched SVG overlay (`preserveAspectRatio="none"` + `vector-effect="non-scaling-stroke"`, `overflow: visible`, `stroke="rgb(var(--accent-green) / 1)"` + `drop-shadow(0 0 2px rgb(var(--accent-green) / 0.35))`, no track, `strokeOpacity={0}` at 0 % or when `progress` is `null`). Over-goal / goal-reached states belong in `getProgressPercent` / a `getBarColor`-shaped branch, never inline in JSX.
  - **Persistence & openers:** stored on `userData` as `heroActionMetric`, `heroTileLeftMetric`, `heroTileRightMetric` (settled on load via `readHeroSlots` in `mergeWithDefaults`, and swapped on collision via `assignHeroSlot` in `handleUserDataChange`). Tap targets come from the orchestrator's memoized `heroActionOpeners` map. Covered by `tests/utils/heroActionMetrics.test.js`, `tests/store/heroActionSettings.test.js`, `HeroActionPill.spec.jsx`, `HeroActionTile.spec.jsx`, `SettingsModal.spec.jsx`, and `EnergyMapCalculator.spec.jsx`.
- **Calculation wiring:** save via the store action `setDailyNeatOverride(dateKey, overrideOrNull)`; the multiplier is applied in `calculateCalorieBreakdown` (override-first, clamped). No duplicate override logic in UI components.
- Wire it like any other sequencing modal: `useAnimatedModal()`, register in `isAnyModalOpen` + `closeTopmostModal` + deps. It is lightweight (no `React.lazy`), matching other short session modals.


### Home "Your Goal" Card Frontend

- **Home "Your Goal" card (`common/GoalPlanCard.jsx`).** The original full-colour goal tile stays on top (icon, label, delta, `Tap to change` → `onGoalClick` / `GoalModal`). **Without an active phase** the tile carries a `Day N` badge (`goalDurationDays` + 1) and below it: a 7-day adherence strip (`buildDayLedgerCardSummary(..., windowDays: GOAL_PLAN_STRIP_DAYS)` drawn by the shared `common/DayBalanceStrip.jsx` in its `flat` variant; the Logbook Daily Ledger card uses the default `bars` variant) with the on-target count and streak, **one line** holding the trend icon, weekly rate and verdict (`calculateWeightTrend` + `getGoalAlignmentText`, worded short by `shortenVerdict`) on the left and the 4-week projection (`~79.4 kg in 4 wk` / `Holding ~75.5 kg`, no icon) on the right (it wraps only if both cannot fit), at most one nudge (stale weigh-in > 7 days, cut >= 56 days, bulk gaining faster than its band) and a `Give it an end date · Start a phase` footer (`openLogbookFromHome`: it goes to the Logbook list, it does **not** open the creation modal; hidden when `userData.homePhasePromptEnabled` is false). **With an active phase** the tile shows the target actually in force (`describeActiveGoalTarget` over the store's `goalDailyBalanceTarget`, so a phase's smart delta reads `-550 kcal deficit`, not the nominal -300) and **is the only way into the phase** (`Open phase` caption → `openActivePhaseFromHome`, with a lock badge top-right where the `Day N` badge sits otherwise; the goal modal is unreachable from the card while a phase runs; a locked goal with no phase view keeps the disabled `Set by your phase` tile). Below it, non-interactive and replacing the goal detail: the phase name with `Day X of Y · ends Jan 3` (no end date in the ending / overdue / upcoming states), a progress bar (weight toward `targetWeight` when measurable, else elapsed time, none for an open-ended phase), the phase facts (`text-[11px]`, `left … right` lines) in **the widest layout that fits** (`useFirstFit` measures the two-line candidates in a hidden, `aria-hidden` probe and re-checks on resize, so screen width, Text size, long values and units all count; `data-layout` names the choice; never pick by the font-scale setting): `two-lines` — `Start: 74 kg · Nov 27, 2026 | Target: 82 kg` … `Target +0.63 kg/wk`, then `Current: 74.3 kg · +0.3 kg` … `Current +0.35 kg/wk · On track`; `two-lines-tight` — the same without the repeated `Target` / `Current` before the rates (the target rate keeps its label when there is no target value beside it); `short-lines` (large text, narrow screens) — `Start: 74 kg` … `Nov 27, 2026`, `Target: 82 kg` … `+0.63 kg/wk` (without a target weight or body fat the goal band is the target value), then `Current: …` … the measured rate (the target is the target weight, else the target body fat; the target rate is the **planned** one, start to target weight over the phase's dates, else the `goalType` band from `getGoalWeeklyTarget`; the current rate is `calculateWeightTrend` over the **phase's own** weigh-ins and shows only once they span `PHASE_RATE_MIN_SPAN_DAYS` (7), reading `Rate after 7 days` until then; the verdict is `judgePhasePace` against the planned rate (±25 %, floor 0.1 kg/wk), or `getGoalAlignmentText` on the phase's `goalType` when there is no plan — never the selected goal; no weigh-in in the phase reads `Current: no weigh-in yet`; a lone weigh-in with no stored starting weight is never a change of zero) and the same adherence strip, counting only the phase's own days (`selectPhaseLedgerInput`; hidden until one is logged); `phaseEnding` (≤3 days left) / `phaseOverdue` (still active after `endDate`) add a review line. All branching lives in the pure `buildGoalPlanCardModel` (`utils/calculations/goalPlanCard.js`, `tests/utils/goalPlanCard.test.js`); missing data is a hint or nothing, never a zero. The active phase is read from the store's `phases` view, the same lookup `openActivePhaseFromHome` uses. Covered by `common/GoalPlanCard.spec.jsx`.


### Daily Ledger Frontend (Logbook)

- Entry point: `LogbookScreen` renders a `DayLedgerCard` at the **bottom** of Logbook (after Completed Phases); opens `DayLedgerListModal` via `onOpenDayLedger`. It uses the **Insights card grammar** (`p-5 md:p-6` card, 30px `accent-blue` icon + bold title, the logged-day count top-right as a local `LedgerHeadline` (the big number beside a **two-line stacked unit** `days` / `logged`: `flex items-stretch`, the unit column `justify-between` + `text-left` (the header's right slot is `text-right`, which it would otherwise inherit) so its two lines span exactly the number's height, `text-3xl` number + `text-[11px]` unit, both scaling with Text size) or an `InsightStatus` "No days yet" chip, two `LedgerTile`s, `accent-blue/80` footer + chevron, outer `div` + inner `pressable-card group` button) with one signature element: a **14-day balance strip** of the 14 *finished* days ending **yesterday** (today is in progress and never feeds the card). One bar per day, coloured by `DAY_LEDGER_BALANCE_META` (same kind colours as the ledger calendar), sized 30–100 % by distance from maintenance (±1,000 kcal fills it); a day that missed its target dims (`opacity-50`); an unlogged day is a thin grey stub (a gap, never a zero bar). The **subtitle** is `Tracking since Oct 3` (the earliest logged day, `firstLoggedDate`; the year is added when it is not this year) - it frames the lifetime headline count; with nothing logged it reads `Browse your day-by-day energy history`. The goal and target are deliberately not repeated here (the strip header and the Yesterday tile already carry the target). The strip header reads `N of M logged days on target` and, from 2 consecutive on-target days, a `Flame` chip `N-day <goal> streak`. Tiles: **Yesterday** (signed balance + kind, then `On target` / `+40 vs target` + `target +300`, or `Not logged`) and **Average balance** (stacked 7-day / 14-day rows). With nothing logged the card collapses to a one-line invitation (no strip, no tiles). All numbers come from the pure `buildDayLedgerCardSummary({ snapshots, todayKey?, windowDays?, tolerance?, currentGoal? })` in `dayLedgerPresentation.js`. **"Logged" means a valid snapshot AND `intake > 0`**: the app seeds yesterday's/today's snapshots on launch, so a bare snapshot only proves the app was opened (the calendar/list modal still use `isValidDaySnapshot`). A day's verdict is `deviation = deficit - goalTarget` within the **on-target range** (`userData.onTargetToleranceKcal`, `isDayOnTarget`). The streak counts consecutive on-target logged days ending yesterday, all under the **current** goal (a goal switch, a missed day or an off-target day ends it). Covered by `tests/utils/dayLedgerPresentation.test.js` and `LogbookScreen.spec.jsx`.
- `DayLedgerListModal` (`modals/lists/DayLedgerListModal.jsx`) is a lazy-loaded calendar browser over `dailySnapshots`: fixed 42-cell grid (always 6 weeks, mirroring `CalendarPickerModal`), swipeable month navigation, balance-kind cell coloring via `DAY_LEDGER_BALANCE_META`, a balance-kind legend, and a Today jump.
- The **Month Summary header** carries a `Target` badge `N on target` **beside** the `x/y days` badge, in the title row's right slot (finished, logged days judged against their own recorded target inside `onTargetTolerance`, from `summarizeMonthSnapshots(..., { tolerance })` -> `onTargetDays` / `judgedDays`; hidden when nothing can be judged; green when N > 0, muted at 0). Both badges are `shrink-0 whitespace-nowrap` in one `flex` group and the month name line `truncate`s, so the header stays the two-line title block and never changes the month surface's height.
- The day-preview panel shows the day's target verdict **inside its existing balance caption** (`Deficit · on target` / `Deficit · +40 vs target`, `whitespace-nowrap`, fed by `buildDaySnapshotPreview`'s `goalTarget` / `targetDeviation` and the `onTargetTolerance` prop; `targetDeviation` is `null` for a day with nothing eaten, so it gets no verdict; `describeGoalTarget(target)` is the shared "300 kcal deficit" wording). It adds no row on purpose: the panel's height is the max across its stacked surfaces, so never give the day surface a taller line than the month/empty surfaces can match.
- Month/year pickers anchor beneath the nav row via a `relative` wrapper + `absolute inset-x-0 top-full mt-2 flex justify-center pointer-events-none`; Framer Motion animates only the inner card. Never position these overlays with invalid Tailwind classes (`left-1/5`, `top-29`) or Tailwind translate utilities on Motion-animated elements.
- The bottom **dual-mode panel uses a grid-stacked "auto-fixed" height** instead of a hardcoded px value: the day-preview, month-summary, and empty-month surfaces are **always mounted, stacked in the same grid cell** (`row-start-1 col-start-1`), so the container height is the natural max across all states - constant during mode switches (zero layout shift) yet content-driven per device/font. Surfaces toggle via Motion `animate` opacity/y + `pointer-events-none` + `aria-hidden` (no AnimatePresence unmount swaps; never animate the container height); the day panel retains the last preview via `lastPreviewRef` so deselecting a day cannot collapse its layout contribution, and the EPOC line always renders (`invisible` when zero) so per-day variance cannot resize the panel. Picking a tracked day swaps in a tappable day-preview (tap again opens `DayLedgerModal` via `onOpenDayDetail`); deselecting or changing month falls back to the month summary. Month summary = 2x2 `SummaryTile` grid (Avg Energy combined, Balance avg+total kind-colored via `getDailyBalanceKind`, Avg Weight + conditional `% BF`, Avg Steps). The day panel shows Weight + BF tiles when `bodyFatTrackingEnabled`, else Weight + combined Sessions card (Cardio/Training split).
- `bodyFatTrackingEnabled` must be forwarded from the orchestrator; BF-off swaps tile contents instead of hiding rows.
- `DayLedgerModal` (`modals/info/DayLedgerModal.jsx`) is the read-only detail sheet: it renders one fully populated day record via `buildDayLedgerDetailModel(...)` in `dayLedgerPresentation.js` — hero TDEE/composition-bar card (a two-row baseline-aligned grid - `TDEE` / kind label, then the TDEE number on the same baseline as the signed balance - followed by ONE line with `Eaten N kcal` left and `Target 300 kcal deficit · on target` / `· +40 vs target` right (green/orange against `userData.onTargetToleranceKcal`; it wraps only if both cannot fit; steps are deliberately not repeated, the measurements strip owns them); a day with nothing eaten shows the target but **no verdict**, because its balance is just the whole TDEE; tap opens the production lazy `CalorieBreakdownModal` recomputed for that historical day through orchestrator `handleOpenDayLedgerBreakdown(dateKey)` with steps + the snapshot's **recorded** TEF/AT contexts via `resolveSnapshotBreakdownContexts(snapshot)`; the store applies date-scoped NEAT — never re-derive the mode from current settings), day-shape chips (goal · Training/Rest · NEAT override · TEF/AT modes), an always-occupying EPOC context line, a measurements strip with honest `vs prev` delta chips + step provenance (`healthConnect`/`manual`), read-only **session rows** resolved with the same canonical kcal formulas as `HomeScreen`, a per-meal nutrition ledger from canonical `nutritionData`, and a conditional phase card (name + Empty/Partial/Complete status + read-only notes from `phaseLogV2` logs). The day body re-keys on `dateKey` with a CSS-only `.day-ledger-in` fade/rise (in the `data-motion` reduced/off opt-out list (see Motion Preference)). Returns/renders nothing when the snapshot is missing or `dateKey` disagrees with the recorded date — never zero-filled. `CalorieBreakdownModal` shows a date chip only for non-today days (`dateKey !== getTodayDateKey()`); it deliberately shows no "recorded that day" TDEE line, so a differing recompute is not surfaced.
- Wire both like any top-level modal: `useAnimatedModal()` (the detail modal uses `MODAL_CLOSE_DELAY`), register in `isAnyModalOpen` + `closeTopmostModal` + deps, lazy `React.lazy(...)` with an `isOpen || isClosing` mount guard.
- All display math lives in `utils/calculations/dayLedgerPresentation.js`; both modals are thin renderers (see the Calculation System / Measurement Averages sections of this document).
- **The Tracker's calorie target is the same band.** `TrackerScreen`'s Total Calories card writes the target as a range (target ± `onTargetToleranceKcal`) in the card header and the Target selector row, each end converted to the energy unit on its own. The header is the flame icon, "Total Calories" and a subtitle ("Today's intake" with a blue dot on today; any other selected day shows its date, year only if it differs, formatted in UTC, and no dot), with the day's intake (+ smaller unit) on the right over "of low – high unit". The two sides mirror each other line for line - the intake uses the title's size and line height, the range the subtitle's - so they align; keep them in step. That right block drops under the title when it cannot fit (large text, narrow screens). `judgeIntakeAgainstTarget(...)` (same module; `deviation = target - intake`, judged by `isDayOnTarget`) returns `under` / `onTarget` / `over`, and that one status colours the bar, the % and the remaining amount (emerald / green / red) - never `caloriesPercent >= 100`. "over target" is said only above the range; over the target but inside the band reads "over". Nothing logged has no verdict. It is judged against the live target shown on the card, also for past dates. There is deliberately no "on target" badge.


### Calendar Picker Dual Panel (Tracker date selection)

- `CalendarPickerModal` (`modals/pickers/`) uses the same grid-stacked "auto-fixed" height contract as `DayLedgerListModal`: the day-preview panel and the Monthly Average card are **always mounted and stacked in the same grid cell** (`row-start-1 col-start-1`), toggled via opacity + `pointer-events-none` + `aria-hidden` — no floating tooltip, no AnimatePresence unmount swaps for the panel surfaces, no animated height.
- Interaction: tapping a non-ghost day previews it in the panel (empty days show an honest "No entries" state; macros come from `nutritionData` only — no snapshot props); tapping the previewed day again deselects back to the Monthly Average card; the day-preview card itself is a **whole-card button** (DayLedger's "tap to view full ledger" grammar: `pressable-card` + `focus-ring` + muted `border-t` footer with chevron) so tapping it anywhere — or keyboard Enter / the Today button — calls `onSelectDate` and closes. Month changes reset the preview via the `changeMonth` wrapper, and closing the modal resets all preview state (render-phase retention pattern — no refs read during render, no setState-in-effect).
- Its month/year picker overlays use the anchored pattern (relative nav-row wrapper + `absolute inset-x-0 top-full mt-2 flex justify-center pointer-events-none`, Motion animates only the inner card) — never `left-1/5`/`top-29` or Tailwind translate on Motion elements.
- A calendar-cell **legend** sits between the grid and the dual panel (always rendered, static — never toggled by preview state, so it cannot shift layout). It reuses `DayLedgerListModal`'s legend grammar (`flex ... gap-3 pt-3 mt-3 border-t border-border text-[10px] text-muted flex-wrap` + `w-2 h-2` swatch + label) but is adapted to this modal's cell states instead of balance kinds: round `accent-blue` dot = has entries (mirrors the in-cell tracked marker), `accent-slate` square = no entries, `accent-blue` square = selected. The legend lives in the modal body, not inside `CalendarHeatmap`, so it stays outside the swipe-touch region.

### Tracker Modal Selection Card (Weight / Body Fat / Step / Rolling Energy Balance / Heart Rate)

`HeartRateTrackerModal` follows the same contract (fixed `topPx`, in-SVG guide line, tap-to-dismiss, re-tap to edit, render-phase retention) with resting-HR deltas from a pre-filtered single-family series; its month (12m) cards are read-only.

- The four tracker modals share **one** detail surface: `TrackerSelectionCard` (`common/TrackerSelectionCard.jsx`, with the `TrackerCardMetric` inline label/value pair). It replaced a per-modal floating tooltip that was measured onto the tapped point (`getBoundingClientRect()` + `scrollLeft` + a `resize` listener) and rendered **outside** `ModalShell` at `z-[1200]`. Do not reintroduce a positioned tooltip: it drifted when the chart was panned (so panning had to dismiss it), overflowed at the first/last slot and above the header, escaped the `1000 + 2/depth` z-lanes, and needed a capture-phase `document.pointerdown` listener with `circle`/`g`/`[data-date-label]` whitelists to dismiss.
- **Placement is fixed, never measured.** The card is a **graph-wide strip** (`w-full` inside a wrapper that defaults to `inset-x-2` — an 8px gutter, the same one the modals' graph row already carries as `pr-2`) inside a `relative` graph container, so its edges never touch the screen edges while its right edge still lands on the y-axis column's own right edge: the **whole axis (ticks + current-value pill) stays behind the card while it is open**. That is the accepted trade-off — the card's own value is the reading you need, the axis is a static scale, and a tap or a swipe dismisses the card; `className` can still override the inset, but no modal does today. The wrapper is `pointer-events-none` and only the card captures pointers. The only inline geometry is `top`, and it is a **constant handed down by the modal** (`topPx`, default `8`) — the plot's top edge — never a measurement, and never a `left`.
- **`topPx` is the plot's top edge, which is mode-aware in the Step tracker.** Every chart layer starts at `8px`, so that is the default; `StepTrackerModal` passes `plotTopPx = weekBracketAreaHeight + 8` so the card clears the 7d **weekly-average bracket band** (`WEEK_BRACKET_TOP_PADDING=8` → `WEEK_BRACKET_HEIGHT=32`, i.e. y 8→40) instead of covering it. That file uses the same constant for the chart layer and the y-axis column, so the three cannot drift. Any future top-anchored chart annotation needs the same treatment: give it its own reserved band and align the card to the plot top below it.
- **Dismissal is a tap on the graph — there is no close button.** The old per-modal X was a 21px tap target in the corner, which is unusable on a phone. Each modal puts `onClick={dismissSelection}` on its graph container (carousel + y-axis), and the card calls `event.stopPropagation()` on its own container so a tap on the card means "let me read this" rather than "close". Point/bar/axis-label handlers `stopPropagation()` **after** their empty-slot guard (not before), so a tap on a gap in the plot bubbles up and dismisses instead of dead-ending. **Panning also dismisses in the Weight / Body Fat / Step carousels** — `handleCarouselScroll`'s first statement (ahead of its geometry guard, as a functional no-op-safe update), so a swipe means "let me read the plot"; Rolling stays tap-only because it is read-only analytics. Dismissing on `pointerdown` was rejected: it also fires on plain taps, which would break the "tap the same day again to edit" gesture.
- **The connector is a guide line drawn inside the chart SVG** (`<line x1={selectedGuideX} x2={selectedGuideX} y1={0} y2={chartHeight}>`, `stroke="rgb(var(--accent-blue) / 0.45)"`, `strokeDasharray="3 4"`, `pointerEvents="none"`, drawn *behind* the data runs). It is derived from the selected slot's chart `x` (`selectedSlot.x` / `bar.x`), so panning and resizing can never make it drift. Line charts also enlarge the selected point (accent fill, `pointRadius + 2`); bar charts keep their `accent-blue` outline rect. Never add an elbow leader that depends on the card's viewport x — that would have to be recomputed per pan frame.
- **Zero-entry empty state:** with no entries, `WeightTrackerModal` / `BodyFatTrackerModal` replace the view-mode toggle, the stat strip, the Add Entry bar and the chart with a single centred empty state (icon tile, "No weigh-ins yet" / "No body fat readings yet", one line of purpose, a primary **Log your first weigh-in / reading** button wired to `onAddEntry`, and the past-date hint). Never render the all-dash stat strip, the `—` rates or the "No weight/body fat data yet." chart placeholder in that state; the header (back + tracker switch) stays.
- **Selection state uses render-phase retention** (`selectedDate` / `lastSelectedDate` / `selectionSource`, verbatim from `CalendarPickerModal`): the retained slot keeps the card's content while it fades out, so it can never blank mid-fade, and no ref is read during render and no state is set from an effect.
- **Interaction:** tap a point/bar/axis label to select (re-tapping the same slot in the day modes keeps the long-standing "tap again to edit/add" gesture, and the card body is the second, discoverable route); **tap anywhere else in the graph to dismiss**, or swipe the plot (Weight / Body Fat / Step); view-mode/window changes dismiss. Empty slots are not selectable in Step/Rolling (honest "no data") while Weight/Body Fat keep them selectable through the axis label so the add flow stays reachable — in both cases the tap either selects or dismisses, never dead-ends.
- **Anatomy:** a **graph-wide strip** (`w-full` inside the wrapper that defaults to `inset-x-2`, value row pushed to `justify-between` so inline metrics sit at the right edge) with compact `px-4 py-2.5` text padding that lands on the modals' own 16px gutter (height is the budget, since the card overlays the plot's top band): muted date/month row, a `text-xl` primary value, an optional inline metric row (Distance/Burned, Total, TDEE/Intake, plus the Weight / Body Fat delta cluster below — the day cards still carry **no** `7d`/`14d` *level* chips, which the modals' own "Averages" stat card already shows; only the 12m month card adds a `Tracked x/y d` chip), and — only when the modal has an edit/add flow — a muted `border-t border-border/30` footer (`Tap to edit entry` / `Tap to add entry` + chevron) that makes the whole body a `<button>` (`pressable-card` + `focus-ring`, `ariaLabel` from the caller). Read-only variants (Step, 12m month selections, Rolling) render as a `role="status" aria-live="polite"` surface with no footer action. It keeps an 8px gutter from each screen edge (`inset-x-2`), so the strip never touches the edges while the y-axis column still sits behind it (the accepted trade-off in the placement bullet). **Weight / Body Fat deltas:** the day cards add `vs prev` (the change since the previous sample, with the sampling span in the label once it exceeds a day) and `vs 7d avg` (the reading minus its own 7-day trapezoidal average ending on that day), and the 12m month cards add `vs prev month`. The numbers come from `getPreviousEntryDelta` / `getWindowAverageDeviation` / `formatSignedDelta` in `utils/measurements/weight.js` (generic over `valueField`, so weight and body fat share one implementation instead of drifting), are derived from the RETAINED slot so they cannot blank mid-fade, and are omitted entirely — never zero-filled — when no honest comparison exists (first-ever sample, single-sample window, empty day). They are deliberately uncoloured: a single reading's implied weekly rate (`Δ/span × 7`) extrapolates daily water-weight noise into "progressing too rapidly".
- **Glass (matching the `ScreenTabs` grammar):** `border-border/40` + `bg-surface/85 supports-[backdrop-filter]:bg-surface/55` + `backdrop-blur-2xl backdrop-saturate-150` + `shadow-2xl shadow-background/40`, so the chart smears through the card while staying readable on engines without `backdrop-filter`. Keep it token-based — no `bg-white/*` highlight strips.
- `TrackerCardMetric` is deliberately a text pair rather than a tile: the card overlays the top of the plot, so height is the budget.
- Covered by UI-tier specs: `common/TrackerSelectionCard.spec.jsx` (mount-always + crossfade, constant `top` with no measured geometry, `topPx`, glass classes, no close button, card-taps-don't-reach-the-graph-handler, pointer transparency, action/read-only variants) plus one per modal — `WeightTrackerModal.spec.jsx` (full round trip: no `z-[1200]` node, tap → card + guide line, card commit, re-tap gesture, re-target on another point, empty-day add flow, plot-tap dismissal with content retained, full-graph inset, pan-dismiss, signed delta chips + the irregular-span label, and no deltas without an honest comparison), `BodyFatTrackerModal.spec.jsx` (the same delta / pan / inset contract with `%`), `StepTrackerModal.spec.jsx` (read-only, card aligned to the plot top so the 7d week brackets stay visible, gap-tap dismisses, pan-dismiss, no delta chips) and `RollingEnergyBalanceModal.spec.jsx` (store-seeded ledger, untracked day tap dismisses, full-graph inset).
- **Known tradeoff:** with the X gone, read-only cards have no keyboard dismissal (actionable ones keep Enter-on-body, which commits and deselects). Nothing regresses for the chart itself — points/bars were never keyboard-reachable, so selection was always pointer-only.

### Modal Performance Loading Strategy

- Heavy fullscreen modals are lazy-loaded via `React.lazy(...)` in `EnergyMapCalculator`.
- Selected additional heavyweight modals are also lazy-loaded (`CalorieBreakdownModal`, `TrainingModal`, `CardioModal`, `PhaseCreationModal`, `DailyLogModal`), plus three heavyweight pickers (`CalendarPickerModal` ~42 kB source, `FoodPortionModal`, `MacroPickerModal`) that used to live in the boot-critical bundle.
- Mounting uses `isOpen || isClosing` guards to preserve exit animations and prevent unmounting during close transitions.
- Keep `fallback={null}` unless introducing a deliberate loading affordance that does not break modal stack timing.
- **Tracker chart geometry is precomputed, not per-render:** the Weight/BodyFat tracker modals memoize their gap-aware run geometry (`buildChartRunsGeometry` → `chartRunsGeometry7d/30d/12m`) — `buildGapAwarePathRuns` + `buildBezierPaths` used to run inside the chart render helper on every render (each selection tap or store write while the modal was open rebuilt every path string). The shared render helper takes the memoized geometry as its last parameter; first/last-run edge extension is resolved against the FULL runs array inside the builder. Do not move path construction back into the render body.
- **Entry-modal wheel drafts relay on settle:** the Weight / Body Fat / Resting HR entry modals are thin wrappers over one shared shell, `common/TrackerEntryModal.jsx` (add/edit title, date locked while editing, confirmed delete, error line, Save/Cancel; the owner supplies the wheel via `Picker` + `pickerProps`, its copy, and data rules, and the orchestrator owns each draft's `mode`/`date`/`originalDate`/`error` and runs the date-conflict check: add mode asks "Overwrite?" via `ConfirmActionModal`, edit mode errors). Never re-copy the shell into a tracker; fix behaviour there. The shell stages wheel scroll changes locally (the picker keeps its own live selection state, so the display never lags) and relays `onValueChange` (`onWeightChange` / `onBodyFatChange` / `onBpmChange`) to the orchestrator's draft on a `SCROLL_SETTLE_DELAY` trailing debounce. Their Save buttons pass the live value (`onSave?.(pendingWeightRef.current ?? weight)`) so a save racing the trailing commit can never persist a stale draft; pending commits are dropped when the modal closes. Do not wire wheel scroll frames straight into orchestrator state — that re-rendered the whole tree at ~60fps during a flick.
- **The only continuous store-bound control in Settings commits on release:** the AT smoothing-window slider stages its drag value in local state and writes the store on pointer up / key up / blur. Every other Settings control still applies immediately through `onFieldChange`.

### Food Search/Favourites UI Architecture

- `FoodSearchModal` is the **canonical** food favourites UI surface (`viewMode === 'favourites'`).
- `FoodFavouritesModal` was removed as redundant and should **not** be reintroduced.
- `FoodSearchModal` is now a **5-mode surface**: local search, online search, favourites, recents, and AI chat (`viewMode` + `searchMode` state machine).
- `FoodSearchModal` now composes focused panel components from `modals/fullscreen/panels/`:
  - `FoodSearchChatPanel.jsx`
  - `FoodSearchFilterControls.jsx`
  - `FoodSearchMealPreviewPanel.jsx`
  - `FoodSearchResultsPanel.jsx`
  - `FoodSearchFavouritesPanel.jsx`
  - `FoodSearchRecentsPanel.jsx` (see "Food Search Recents")
  - `FoodSearchEntryCard.jsx` — renders one finalized chat entry card (primary badge + disclosure chip labels) from `buildFinalizedEntryCardState()` in `utils/food/aiFinalizedEntryState.js` The card's category tag comes from the shared `resolveAiEntryCategory(entry, lookupMeta)` in `utils/food/aiCategory.js` - the same resolver the modal logs with (model food-type category -> matched food's category -> dominant macro; the model's `custom`/`manual` are ignored because they describe provenance, not the food). It returns `null` when nothing is known and the card then shows **no** category tag; never hard-code a `'custom'` fallback for the tag (an omelette used to be labelled "Custom"). Micronutrients render on the right of that tag row (`Fiber / Sodium / Sat. Fat / Sugars`, Tracker colours); the other Food Search item cards (results, favourites, meal preview) deliberately show none.
  Keep panel responsibilities isolated and avoid moving large inline JSX blocks back into `FoodSearchModal`.
- The **RAG chat request flow is decoupled from the modal**: `FoodSearchModal` calls `runRagChatPipeline(...)` in `services/ragChatPipeline.js` (with injected OpenRouter `modules` + `telemetry`). The modal owns only the chat state machine, stage pill, abort controller, and assistant-bubble entry rendering. Do not re-inline extraction/retrieval/verification/presentation steps into the modal.
- **Food Portion modal (`modals/pickers/FoodPortionModal.jsx`).** The top card is the *shared element* of a hero transition: tapping a Food Search **result** records that card's rect (`rememberPortionOrigin` in `utils/visuals/portionTransition.js`, age-limited and read non-destructively so a stale rect can never leak into a modal opened another way) and `hooks/usePortionCardFlight.js` flies a **clone** of the modal's card from there into its slot (and back on close, skipped for "Log & exit" because the list it would return to is closing too). A clone in a fixed layer - not the card - because the sheet is `overflow-y-auto` and would clip a card entering from outside it; only `transform` + `box-shadow` animate (Web Animations API, no React state), and layout effects hide the real card before first paint. The sheet opts into `modal-content-fade` (fade-only) so the card's resting rect is final when measured, and everything under the card rises in staggered via `.portion-enter`. The flight is **search results only** (local + online): the Favourites card is a different design and would visibly distort. Reduced motion, a missing Web Animations API, or no recorded origin (editing a logged entry) all simply show the card. The top card deliberately matches the result card (`rounded-xl border bg-surface-highlight p-3`) and shows **no micronutrients**; they live in the "For Ng" card via the shared `common/MicroStat.jsx` (same component as the Tracker row, `null` = `-`). Actions follow the AI Chat card's hierarchy: one full-width primary (`Log entry` / `Save entry`), two tinted secondaries (`Log & exit`, `Save & favourite`/`Favourited`), and **no close button on purpose** - the sheet closes by tapping outside it (plus Escape / Android back via `ModalShell`); do not add a Cancel row or an X back. Keep the item card the sheet's **first child**: it is the shared element of the card flight, and `.portion-enter` staggers every child after it. The scroll wheels are the **original design** (overlay fades + two blue lines) and were deliberately left unchanged. **Weight units:** the unit list always offers Grams and Ounces beside the custom portions; `units.food` picks the default. The ounce wheel is whole + tenth (0.1-35.3 oz, the same 1000 g cap), a new ounce log opens at 4 oz, and an edit whose wheel was not moved keeps the exact stored grams. The `TEF Burn` bar lives inside the "For Ng" card, under the micronutrient row, and only renders when Smart TEF *and* "TEF burn in food modals" are on (Settings -> Metabolic Adjustments).
- **Add Custom Food modal (`forms/AddCustomFoodModal.jsx`, the Search "Add" action).** It mirrors the Manual Entry form: every numeric value (calories, macros, micros and the optional custom-portion grams) is a picker **button** that opens `NumericValuePickerModal`, never a free-text numeric input. The field config + value helpers are canonical in `utils/food/nutrientPicker.js` (`NUTRIENT_PICKER_FIELDS`, `PORTION_GRAMS_PICKER_FIELD`, `normalizePickerValue`, `formatPickerValueForState`, `formatPickerDisplayValue`) and are shared with the Manual Entry pickers in the orchestrator — do not fork per-form copies. Actions follow the same hierarchy as Manual Entry: primary **Save food** (save + close, returns to search), plus **Cancel** and **Save & log**. Save & log persists the food exactly like Save, then asks the orchestrator to open the portion picker for the new food (`handleAddCustomFood(customFood, { log: true })`), so logging always runs through the canonical portion flow (custom portions included) instead of inventing a gram default. A **`HelpCircle` button** at the top right of the header (both modes, create and edit) opens `info/AddCustomFoodInfoModal`, a read-only child sheet explaining Food, Recipe, portions and saving - keep its copy in step with the form's rules.
- **Ounce users** enter a custom food as **"Nutrition per [N oz]"** (default 1 oz; set it to the label serving) on tenth-step wheels; save converts to `per100g` (3 decimals), and a field the user did not touch keeps its original per-100g value. kJ users get `EnergyPickerModal` for energy.
- **Recipes (a food built from existing foods) - see the Recipes section below.** The same modal carries a **`Food | Recipe` segmented switch** under its title; Recipe mode swaps only the "Nutrition per 100g" block for `forms/RecipeIngredientsSection.jsx`. Name, category chips, custom portions and the Save / Cancel / Save & log footer are shared, and Food mode's DOM is unchanged (its spec pins "exactly two textboxes").

- **Open-time loading is a single skeleton, never a partial list.** On open, `hasLocalSearchCompleted` is `false` until the first local search of that open finishes; while it is false the results panel receives an **empty list + the skeleton** (`showLocalSkeleton` / `isFirstLocalLoad`), and the header reads "Searching local foods...". Rendering the merged cached/custom foods first, then covering them with a skeleton, then swapping in the database page - while the old rows were still playing their `AnimatePresence` exit - was the open-time flicker (and the list re-sorted under the user's eyes). The first search is deferred `FIRST_LOCAL_SEARCH_DELAY_MS` (220ms) so the sheet's slide-in is not competing with the list's heavy first mount and the synchronous sql.js query; every later search starts **synchronously** (deferring it even one macrotask flashes "No foods found"). After the first load a re-search keeps showing the current rows (the client-side filter already keeps them consistent with the query) and only uses the skeleton when there is nothing to show. Skeleton rows are the same height as a result card (68px, `SKELETON_ROW_CLASS`) so the swap does not shift the layout - keep them in sync - and result cards carry `content-visibility: auto` (`RESULT_CARD_STYLE`) so ~120 off-screen cards cost almost nothing to lay out. The flag lives in state *and* a ref (the ref lets the search effect read it without re-running - and re-searching - when it flips) and is reset in the `isClosing` cleanup.
- Local result rendering uses **progressive batches** (`visibleResultCount`) to reduce mount/paint cost on large datasets:
  - Local batch size: `120`
  - Online batch size: `80`
  - "Show more" increments visible rows and can trigger additional local DB page fetches.
- Local DB paging in search mode uses `LOCAL_DB_QUERY_PAGE_SIZE = 500` with offset-based fetches when users load more.
- **Online mode pages server-side too**: each fetch requests up to `ONLINE_SEARCH_PAGE_SIZE` (50, the RPC cap) and "Show more" appends the next page via `performOnlineSearch(query, { append: true })` with ID-dedupe. A request-id guard (`onlineSearchRequestIdRef`) drops stale responses so a slow earlier query can never overwrite newer results, and the paging cursor resets on query/mode changes.
- Filter/result header intentionally shows **current loaded count only** in search mode (e.g. `240 foods found`) and updates as more rows are loaded.
- Online mode remains debounced (`DEBOUNCE_DELAY = 500ms`) and enforces a minimum query length (`2` chars).
- Long-press pinning is owned by `FoodSearchModal` UI interaction (`LONG_PRESS_DURATION = 650ms`) and persists through store `togglePinnedFood`. A **one-time pin helper** ("Hold a food to pin it to the top") toasts over the bottom of the results the first time real rows are on screen in search view (`canShowPinHint`: not the open-time skeleton, not favourites/chat), gated by the persisted `userData.hasSeenPinHint` flag (`markPinHintSeen()`). Same contract as the Tracker macro helper: local render-phase latch (`hasPinHintShown`), flag written as soon as it shows, faded after `PIN_HINT_DURATION_MS` (5 s) or by the first successful long-press pin, pointer-transparent.
- Local search pin hydration is data-layer-backed: pinned IDs are fetched by ID even when they fall outside the top limited query window.
- Food tag rendering is now centralized via `components/EnergyMap/common/FoodTagBadges.jsx`.
- Food source/type resolution is centralized in `utils/foodTags.js`.
- Food display naming is centralized in `utils/foodPresentation.js` (`formatFoodDisplayName`).
- Brand presentation rule: display brand in name as **`Brand - Food name`**; avoid separate brand tag chips in food list cards.

### Food Search Recents

- Entry point: the **Recents** button in the action row, right after the Search pill (`viewMode === 'recents'`). It is deliberately **not** a segment of the Local | Online | Favorites switch, and that switch is hidden inside the view (Search returns). It can also be the default view (`foodSearchDefaultEntry: 'recents'`; the value is listed in `FOOD_SEARCH_DEFAULT_ENTRY_OPTIONS`, `FoodSearchModal` and `storage.js`).
- **Derived, nothing persisted** (`utils/food/recentFoods.js`, covered by `tests/utils/recentFoods.test.js`): `buildRecentFoods(nutritionData)` walks every logged entry (local, online, barcode, AI, custom, recipe, manual) into one row per food, newest first by the entry's `timestamp` (falling back to its date key, so a backfilled meal sorts by when it was logged and is labelled with the day eaten). Same food = same `foodId`, except per-log ids (`ai_…`, `manual_…`) and missing ids, which match on brand + name. The search box matches every word against brand + name across **all** recent foods; at most `RECENT_FOODS_LIMIT` (50) rows show. The list is computed only while `FoodSearchRecentsPanel` is mounted.
- Rows show the **logged** numbers and last log (`170g · Lunch · Today`). Entries don't record every source flag, so `toRecentDisplayFood` recovers it from the food id for `FoodTagBadges`.
- **Tapping never logs.** The orchestrator's `handleSelectRecentFood` opens the portion modal on the last grams using `resolveFoodForRelog` (`utils/food/loggedEntry.js`): live recipe → saved custom food → local catalog → `cachedFoods` → rebuilt from the entry. A rebuilt food carries `entryMetadata` (source, subcategory, AI lookup fields) that the add path spreads under the new entry, so an AI food keeps its tag. An entry **without grams** opens Manual Entry in add mode, prefilled; it keeps `foodId` / brand / category / source only while its name is unchanged (`pickManualRelogIdentity`).
- Editing a logged entry does **not** use this resolver (`handleEditFoodEntry` is unchanged).
- Known limit: the gram wheel stops at 1000 g, so a larger past entry opens clamped.

### Recipes

A recipe is a user-built food assembled from existing foods ("Beef bowl" = 150 g beef + 200 g rice). Because a food is already `per100g` + `portions` and a logged entry is a denormalised snapshot, a recipe **flattens into an ordinary food** and everything downstream (search, favourites, the portion modal, `nutritionData`, snapshots, phase rollups) needs no change - and editing or deleting a recipe can never rewrite history.

- **Data (`userData.recipes`, profile scope, like `foodFavourites`).** `{ id: 'recipe_<ts>_<rand>', name, category, tags, servings (1-99), cookedWeightGrams | null, ingredients: [{ id, foodId, name, brand, source, category, grams, per100g, portionLabel }], portions (extra user portions), createdAt, updatedAt }`. Normalised on load by `normalizeRecipes` in `mergeWithDefaults` (corrupt rows and duplicate ids dropped, servings clamped); store actions `addRecipe` / `updateRecipe` / `removeRecipe` (all via `updateUserData`, all return whether they applied; `updateRecipe` re-normalises so an edit can never store an invalid recipe). `recipes` is also a derived store field and rides in the full export automatically.
- **Ingredients are SNAPSHOTS.** `per100g` is copied when the ingredient is added (catalog rows change between versions, `cachedFoods` is capped, custom foods are session-only), so a recipe is self-contained and stable; `foodId` is provenance only. Editing "rice" later does not change existing recipes.
- **Everything else is derived, never stored** (`utils/food/recipe.js`, pure, covered by `tests/utils/recipe.test.js`): `computeRecipeTotals` sums at full precision (it deliberately does NOT use `scaleMacrosFromPer100g` per ingredient - that rounds its output), `buildRecipeFood` returns `{ id, source: 'recipe', isRecipe: true, isCustom: true, per100g (3 decimals), portions: [{ id: 'recipe_serving', label: '1 serving', grams }, ...extras], servings, servingGrams, totalGrams }`, `getRecipePerServing` scales with the same `scaleMacrosFromPer100g` the portion modal uses, so the builder preview matches what is logged (within the whole-kcal rounding the modal applies).
- **Micro nutrients stay null-honest.** If ANY ingredient has `null` for a micro, the recipe's value is `null` (untracked); a partial sum would read as a measured number. A measured `0` stays `0`.
- **Cooked weight is optional** (`cookedWeightGrams`, "Advanced" disclosure): it only changes the *per-100g* numbers (for people who weigh the finished dish); "1 serving" is exact either way. Default = sum of ingredient weights.
- **A serving may not exceed 1000 g** (`RECIPE_MAX_SERVING_GRAMS`, mirrors `FoodPortionModal`'s gram wheel). `validateRecipeDraft` blocks Save and suggests the minimum servings; otherwise a logged serving could not be re-opened and edited in grams without being clamped. Portion-unit logging itself is not clamped. In ounce mode the ingredient and portion wheels stop at the same 1000 g, and the cooked weight is picked in ounces (0.4-176.4 oz, stored as 10-5000 g).
- **Logging adds ONE entry** (name, grams, macros, `foodId: recipe_...`), exactly like any food - never one row per ingredient. `getRecipeStartGrams(food)` opens the portion wheel on one serving's weight (`handleSelectFoodFromSearch`, Save & log) so "Log entry" logs one serving.
- **Not auto-favourited**, unlike custom foods (`handleAddCustomFood`): a favourite would freeze a copy of the nutrition that goes stale on the next edit. Recipes are searchable straight from the store; a favourite the user makes through the portion modal resolves to the LIVE recipe (`FoodSearchModal.resolveFoodById` falls back to `recipeFoodsById`), and a deleted recipe falls back to the favourite's own snapshot.
- **Search wiring:** `FoodSearchModal` reads `state.recipes`, derives `recipeFoods`, and merges them into the `customFoods` it already filters/sorts/merges by id - no recipe special-casing in the merge. The orchestrator's `handleSaveRecipe(recipe, { log, isEditing })` writes the store (and for Save & log opens `foodPortionModal`); `handleEditFoodEntry` resolves a recipe entry's `foodId` to the live recipe before the catalog / `buildFallbackFoodFromEntry`, so editing a logged recipe keeps its "1 serving" portion.
- **Source tag:** `FOOD_SOURCE_TYPES.RECIPE` (pink "Recipe" badge) in `utils/food/foodTags.js`. `resolveFoodSourceType` checks recipes **before** the `isCustom` branch (a recipe food is also `isCustom`). `FoodTagBadges` shows `N servings` instead of `N portions` for a recipe.
- **Edit / delete:** a recipe row in the local results carries a separate **edit button beside the card** (`FoodSearchResultsPanel` `onEditRecipe`) - never inside it, the card is itself a button and also owns tap + long-press-to-pin. Editing reopens `AddCustomFoodModal` with `editingRecipe` (title "Edit Recipe", switch hidden, pre-filled through a **render-phase seed keyed by what is being opened** - no setState-in-effect on open; `FoodSearchModal` keeps `editingRecipe` until the form has finished closing). Delete confirms through `ConfirmActionModal` and calls the store `removeRecipe`; its copy states that logged meals keep their numbers.
- **Ingredient picker (`fullscreen/RecipeIngredientPickerModal.jsx`, lazy-loaded by `AddCustomFoodModal`) is Food Search's browse view, not a lookalike.** It is a fullscreen page with the same chrome (`fullscreen-header` / `fullscreen-body`, safe areas, `keyboard-bottom-inset`): a back chevron + an animated **"In recipe N"** count pill, the search input, the **Local | Online** `SegmentedToggle`, an amber offline notice (a `SettingsReveal`), the shared `FoodSearchFilterControls` (count + Filters & Sort menu: category / subcategory / sort / order) and the shared `FoodSearchResultsPanel` rows (skeleton, staggered rise-in, pinned dot, online cards, error + retry), a "Show more" button, and a Done bar. The Online segment is disabled while offline, like Food Search. It **loads the default catalog list on open** (empty query), and the **Local list is one merged set**: favourites (`favouriteToIngredientFood`: prefers the stored `per100g`, back-derives legacy ones from their saved grams, skips weightless manual entries and recipes) + the bundled catalog + cached foods + the foods the user added this session (`AddCustomFoodModal` `userFoods`, passed down from `FoodSearchModal`'s session `customFoods`), with **pinned foods first** (pins are also hydrated into the catalog query via `pinnedFoodIds`). Recipes are never offered (no nesting). Online = the cloud catalog with **cache-on-select** (`addToFoodCache` / `trimFoodCache(…, 200)`). The page stays open after each add (an animated "Added …" toast and the count pill confirm it); picking a row opens `FoodPortionModal` in **ingredient mode** (`ingredientMode`, `confirmLabel`, `onConfirmIngredient({ food, grams, portionLabel })`: one confirm button, no log / favourite actions, nothing is logged). Long-press-to-pin is intentionally not wired here (pin from Food Search).
- **The picker shares its logic with Food Search instead of copying it.** The pure half - merge by id (later source wins), filter by category / subcategory / query, relevance-aware name sort, macro sorts, pinned-first, online filters, subcategory options, sort labels - lives in `utils/food/foodListing.js` and **`FoodSearchModal` uses it too** (it was moved out of the modal verbatim; covered by `tests/utils/foodListing.test.js`). The stateful half for the picker is `hooks/useFoodBrowser.js` (local + online, filters, paging; `FOOD_BROWSER_LIMITS` mirrors the search modal's batch / page sizes, 220 ms first-load delay and 500 ms online debounce). Loading is **derived, not stored**: every fetched result set is tagged with the request key that produced it (query + filters + pins for local, query + retry for online; keys carry their own parameters so effects depend on the key alone), so "searching" is `results.key !== currentKey`, a stale response can never show, and nothing is set synchronously from an effect. Local rows already on screen are narrowed on the client by the current filters while the next catalog page loads; the first load of an open shows only the skeleton (never a half-built list), exactly like the search modal. Load-more uses functional updates that drop a response whose request has moved on. Do not re-implement filter / sort logic in either surface.
- **Motion in the recipe flow (all reduced-motion safe; no new CSS classes).** The **Food | Recipe** switch and the picker's **Local | Online** switch are the shared `common/SegmentedToggle.jsx`: ONE persistent pill that glides with a composited `transform` (`0.2s cubic-bezier(0.32, 0.72, 0, 1)`) and eases its colour, the Food Search toggle's exact grammar (reduced / off drops the glide and keeps the colour change; never per-button conditional remounts). Food | Recipe stays the **same blue as the "Add Custom Food" header in both positions** (the pill only glides; the chef-hat icon is `accent-blue` too); Local is blue and Online emerald, as in Food Search. When the user switches mode (never on open, never when a recipe is opened to edit - `swapDirection` is `null` until the first switch), the section is re-keyed and eases in with the Settings page-enter idiom (`settings-page-enter` for Recipe, `settings-page-back` back to Food; staggered children, enter-only, `backwards` fill), the title and the Save label re-key with `header-stat-in`. For that to work each branch's root holds the blocks as its direct children (`RecipeIngredientsSection` is one `space-y-5` root). Inside the section, ingredient rows and custom-portion rows expand / collapse (`motion.li` / `motion.div` height + fade, each row owns its bottom gap so the gap collapses with it; in reduced motion the row has **no `exit`**, so `AnimatePresence` removes it at once), the empty state, the summary swap, the cooked-weight options and every validation message are `SettingsReveal` height reveals, and numbers tick (`TickValue`: `header-stat-in`, only when the text changes after mount). The picker adds a count-pill swap, a panel slide per mode (it moves the way you are heading), and the "Added …" toast. New animated classes would have to join the `data-motion` opt-out list in `index.css`; this flow deliberately reuses existing ones.
- **Known limits:** re-opening a *logged* recipe entry above 1000 g for editing starts in grams mode and the gram wheel tops out at 1000 (pre-existing `FoodPortionModal` behaviour, now easier to reach); a recipe's micros are `null` whenever any ingredient lacks them (honest, but common with catalog foods).
- **Follow-ups deliberately not in v1:** "save a logged meal as a recipe", "save as recipe" from a multi-entry AI Chat result, AI-estimated ingredients, recipe nesting, "refresh ingredient values", batch scaling.
- Covered by `tests/utils/recipe.test.js`, `tests/utils/recipePersistence.test.js`, `tests/store/recipeActions.test.js`, the recipe cases in `tests/utils/foodTags.test.js` / `fullExport.test.js`, and UI specs `RecipeIngredientsSection.spec.jsx`, `AddCustomFoodModal.recipe.spec.jsx`, `fullscreen/RecipeIngredientPickerModal.spec.jsx`, `common/SegmentedToggle.spec.jsx`, `hooks/useFoodBrowser.spec.js`, `FoodPortionModal.spec.jsx`, `FoodSearchResultsPanel.spec.jsx` and `FoodTagBadges.spec.jsx`, plus `tests/utils/foodListing.test.js` for the shared listing logic.

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
                              -> grounded single-entry fallback via fetchMacrosWithGrounding (mode='grounding_lookup') for low-confidence extraction:
                                 the query prefers the clarification payload's top-level lookupTerms (whole-word food terms) over the raw user text,
                                 and the entry preserves the grounding model's inferred portion (portionGrams, default 100g) instead of pinning 100g
                              -> fail-closed: legacy single-call path (sendOpenRouterMessage, mode='processing') when extraction module is unavailable
    stage: retrieval      -> resolveFoodLookupContext(...) in services/foodLookupContext.js
                              -> local lookup (foodCatalog), online catalog lookup (services/foodCloud.js), deferred grounding batch (fetchMacrosWithGrounding, mode='grounding_lookup')
                              -> per-term local + cloud searches run in PARALLEL (terms capped at 6) — never reintroduce a serial per-term await loop
                              -> deferred grounding requests are CHUNKED into waves of RAG_GROUNDING_BATCH_MAX_NAMES (10) batch calls — the batch LLM call
                                 caps at 10 names, so more than 10 deferred entries would otherwise silently fail past the first wave
                              -> source-preference weights are hoisted once per unique entry category (promise-cached Map), not read per entry
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
  -> telemetry: services/ragTelemetry.js (stage latency, extraction outcome, lookup stats, presentation name drift, presentation issues,
     per-stage token usage from raw.usage) — hydration loads ONLY the two telemetry docs via loadHistoryDocumentsByIds (never
     loadAllHistoryDocuments, which deserializes the whole history DB), and persistence is debounced (one trailing Dexie flush per
     1.5s window), not a write per event. All pipeline record.* calls are fire-and-forget (fireAndForgetTelemetry) — never re-await
     one between stages. Chat history is capped at CHAT_REQUEST_HISTORY_MESSAGE_LIMIT (12, matching what the low-level client
     actually sends) and NEVER replays historical image attachments (a re-encoded 5MB photo would blow the proxy's 500KB payload
     cap on every follow-up message).
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
- **Centered card surface:** non-fullscreen modals render `rounded-2xl border border-border/60 shadow-2xl` on the card (plus the `.rounded-2xl.bg-surface` top-light), so a dialog separates from the dimmed page and a child modal reads as sitting above its parent even though both are `bg-surface`. This is applied once in `ModalShell`, never per modal; fullscreen modals opt out through their own `rounded-none border-none` content classes.
- `overlayClassName` is sanitized to strip `bg-*` utilities so backdrop color remains controlled by inline opacity math.
- Only the **topmost non-closing modal** handles Escape and overlay-click close; non-top layers disable content pointer events.
- Keyboard handling is platform + CSS owned: no inline overlay/content `height` writes and no viewport-delta heuristics. See "On-Screen Keyboard Contract" below.

### On-Screen Keyboard Contract (Android `adjustResize` + iOS `--keyboard-inset`)

The keyboard is handled by the platform and CSS — never by JS height writes:

- **Android resizes the window** (`android/app/src/main/AndroidManifest.xml` → `android:windowSoftInputMode="adjustResize"`, never `adjustPan`). The layout viewport therefore *is* the visible band, so `fixed inset-0` overlays, `dvh`, `h-screen` and `ModalShell`'s `items-center p-4` centering all agree with the keyboard on their own. `adjustPan` slid the whole window up instead, which clipped a modal's header behind the status bar, exposed an undimmed band of the app between the modal and the keyboard and dragged the floating tab bar up into that band.
- **iOS deliberately does not resize** (`plugins.Keyboard.resize: "none"` with `autoBackdropColor: "dom"` and `ios.contentInset: "never"` in `capacitor.config.json`; the iOS-only `setResizeMode`/`setScroll` calls are gated behind `isIOS()` in `main.jsx`). The keyboard overlays a full-height WebView, so the covered height arrives as `--keyboard-inset` — the mechanism every keyboard-aware surface on iOS uses. Note `setScroll({ isDisabled: true })` also disables the WKWebView root scroll view (its delegate pins the content offset to zero), so nothing on iOS may depend on root scrolling.
- **`ModalShell` writes no inline `height`.** A previous effect locked the overlay/content to a measured `visualViewport` height behind a `120–420px` "keyboard delta" heuristic: a shorter keyboard left the overlay taller than the visible band (modal clipped behind the keyboard, action row unreachable) and a taller one was misread as a layout change and shrank the overlay, so the backdrop stopped covering the screen (app content showing through below the modal). `allowKeyboardViewportResize`, `KEYBOARD_RESIZE_MIN_DELTA` / `KEYBOARD_RESIZE_MAX_DELTA` and `VIEWPORT_WIDTH_LAYOUT_DELTA` are gone — do not reintroduce viewport-delta heuristics.
- **`hooks/useKeyboardVisible.js` is the single keyboard signal** (module-scoped singleton; `Keyboard.addListener('keyboardDidShow' | 'keyboardDidHide')` plus the `visualViewport` shrink, resolved by the pure `utils/visuals/keyboardInset.js`). It publishes `--keyboard-inset` (px) on `:root` and returns `{ isKeyboardVisible, keyboardInset }`; `App.jsx` mounts it once as the publisher, `ScreenTabs` consumes the flag, and `ModalShell` + `.keyboard-bottom-inset` consume the variable (a second consumer costs nothing).
- **The rule is ordering-proof:** a visual viewport that shrank below the layout viewport means the keyboard *overlays* the page (the iOS shape) → that shrink is the inset; a reported keyboard while the visual viewport still fills the layout viewport means the platform already removed the keyboard area from the layout viewport (Android `adjustResize`) → inset `0`, because padding for the keyboard height again is the phantom gap above the keyboard. A zoomed visual viewport (`scale > MAX_UNZOOMED_SCALE`) is never read as a keyboard.
- **Centered modals shrink their band, never their `height`:** `ModalShell` applies `padding-bottom: max(1rem, var(--keyboard-inset, 0px))` to the centering wrapper and `max-height: min(90dvh, calc(100dvh - var(--keyboard-inset, 0px) - 2rem))` to the content, so where the keyboard overlays (iOS) the modal re-centers above it and scrolls internally instead of overflowing the band (which clipped its top and hid its action row). Both reduce to the resting `p-4` gutter / `90dvh` cap on Android, and the fullscreen modals opt out (they own their own `fixed inset-0 h-screen` layout).
- **Keyboard changes are animated, not re-engineered.** The layout contract above is unchanged (platform + CSS own it); the *consequence* of a keyboard change is smoothed so a centred modal glides instead of snapping. **Android** (window resize): `hooks/useKeyboardGlide.js`, called from `ModalShell` for centred modals, FLIPs the sheet inside the `resize` event (before paint) from where it was to where it is - `translate: 0 <delta> -> 0 0` over `KEYBOARD_GLIDE_MS` (280ms) with `KEYBOARD_GLIDE_EASING`. It animates the individual `translate` property, **not** `transform`, because the sheet's entrance animation holds `transform` with a forwards fill; it measures with `offsetTop` (layout position, transform-proof); it only reacts to a keyboard-sized change (height >= 60px, width unchanged - a rotation is ignored); and a second resize mid-glide continues from the in-flight position. **iOS** (`--keyboard-inset`): `ModalShell` transitions the centring wrapper's `padding-bottom` and the sheet's `max-height` with the same duration/curve, and `.keyboard-bottom-inset` transitions `padding-bottom` for the fullscreen modals' bottom chrome. Both honour the Animations preference (reduced/off: no glide, no transitions). Do not move the keyboard handling into JS height writes to "animate" it, and keep the duration/curve in sync across the three places. **Known limit:** on Android a *fullscreen* modal's content is `fixed inset-0` and re-lays out with the window in one frame; only centred modals glide there.
- **Bottom chrome clears the keyboard with `max()`, never a sum:** `.keyboard-bottom-inset` (`index.css`) = `padding-bottom: max(env(safe-area-inset-bottom, 0px), var(--keyboard-inset, 0px))`, because while the keyboard is up the home-indicator inset sits *inside* the keyboard region. The 7 fullscreen modals use that class instead of `pb-[env(safe-area-inset-bottom)]`.
- **`ScreenTabs` fades out while the keyboard is visible** — a floating bar riding on a keyboard is noise. On Android it is already behind the modal overlay (so this is mostly defensive); on iOS it would otherwise sit right on top of the keyboard.
- Covered by `hooks/useKeyboardVisible.spec.js` (both keyboard shapes, the plugin-event/window-resize ordering, the zoom guard, the published CSS variable, listener + handle teardown), `common/ModalShell.spec.jsx` (the centered sizing values, no `height` writes, the fullscreen opt-out) and `tests/utils/keyboardInset.test.js` (the pure rule), with `src/tests/helpers/keyboardViewport.js` driving the viewport halves.

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

`useSwipeableScreens(5, viewportRef, homeIndex, { loop, screenKeys })` manages a horizontal carousel. All 5 screens render simultaneously as `carousel-slide` elements (width `calc(100% - 32px)` — 16px inset per side) inside a **full-bleed viewport** (`-mx-4 md:-mx-6` on the content container), so the 16px neighbour insets sit flush against the screen edge.

- **Edge peek:** neighbouring screens peek 16px into view on both edges. The sliver shows real card content because the slide inner padding is tightened to `px-2` (≈6.75px) — not empty padding.
- **Looping (clone-free):** every screen renders exactly once and each slide carries its **own** transform: `offset_i(position) = wrapIntoHalf(i + 1 − position)` in slide widths and `transform_i = translateX(calc((offset_i − i) * 100% + 16px))`. `%` resolves against the slide's own box width (viewport − 32px), which **is** the stride, so the geometry needs no measurement and self-corrects on every resize. The position is one continuous, unbounded value; a slide crosses the ring seam when its offset passes ±N/2 (~2 slides off-screen — `isSlideTeleport` makes that write instant so it can never sweep across the screen), and normalizing a wrap (6 → 1, 0 → 5) rewrites byte-identical transforms — no clones, ghost cells, timers or blank peek slivers.
- **Settles are compositor CSS transitions (never rAF):** `settleTo(...)` writes `SLIDE_SETTLE_TRANSITION_SET` (`transform` + `mask-position`, both `350ms cubic-bezier(0.22, 1, 0.36, 1)` — `CAROUSEL_SETTLE_MS` + `SLIDE_SETTLE_EASING`) together with the target transform on each slide in one task, then normalizes on a timer (`CAROUSEL_SETTLE_MS + 40ms`) with a bubbling `transitionend` fast path. A JS/rAF settle is re-coupled to every main-thread stall (React renders, `:root` custom-property style recalc, paint) and visibly stutters on a 120Hz panel. React never authors a slide `transform`/`transition` (`getSlideProps(index)` supplies only a stable ref), and `transition` is always written with its `transform`, so a stranded `transition: none` can never make a tab tap snap.
- **Interrupting a settle is arithmetic, not measurement:** `settleStateRef` keeps `{ from, to, startedAt }` and `resolveSettlePositionAt({ ..., durationMs: CAROUSEL_SETTLE_MS })` evaluates the *same* curve and clock, so a finger (or a tab tap) takes over mid-settle exactly where the animation is — no `getComputedStyle`, no layout read, no per-frame loop. The taker freezes that frame with an instant write before replanning.
- **Release/navigation planning:** `resolveSettleTarget(...)` snaps back below the threshold, steps one screen past it, and rounds multi-slide drags (no end clamps — the loop has no ends). `alignPositionToReference(...)` keeps the rest/target in the live position's period so a settle always animates the short way, and `resolveShortestScreenDelta(...)` makes tab taps travel the wrapped way around (4 → 0 is one screen forward).
- **Edge fades are continuous mask strengths (never classes):** every slide carries a permanent two-layer 20px ramp (`mask-image` + `mask-size: calc(100% + 20px) 100%` + `mask-position` in `index.css`), and only its *strength* moves — `resolveSlideFadeStrengths(offset)` → `{ left, right }` (`|offset|` clamped to 0–1, quantized and written only when it changes, by `writeSlideTransforms`). 0 parks the ramp fully outside the slide, 1 is the resting peek look. Because `mask-position` rides `SLIDE_SETTLE_TRANSITION_SET` (same duration + curve as the transform), the ramp retracts on the same clock as the slide; toggling a `.slide-fade-*` class instead popped, because a mask cannot be transitioned as a class.
- **Edge tap guards:** two invisible 16px strips (`absolute inset-y-0 z-10 w-4`) pinned inside the viewport edges absorb taps on the peek sliver so taps can never trigger hidden neighbour-screen cards. They are children of the viewport, so swipe drags still bubble to the carousel handlers.
- **Drag progress + duration:** `commitPosition` publishes `--screen-drag-progress` (the **1-based, unclamped** carousel position, e.g. `3.4` or `6.1` mid-wrap) and `--screen-drag-duration` imperatively onto the drag-linked chrome elements themselves (the tab bar + header dots register as sinks — see `utils/visuals/carouselDragVars.js`); never `:root`, because a `:root` custom-property write invalidates style for the whole document on every drag frame, which is what made swiping choppy as the mounted tree grew. The tab-bar circle and header dots read them via `calc(...)`, so they track the finger frame-by-frame with **zero React re-renders** (preserves the hook's no-state-churn design). The markers are **ring** affordances: `RING_COPY_OFFSETS` copies (`[-1, 0, 1]`) each add a static `copy * screenCount` offset inside their own `calc`, so a seam crossing glides one copy off the end of the track while the next re-enters the other end (clipped by a rounded `overflow-hidden` tracker) — which is why the position must **not** be clamped (clamping + swapping at normalize is what made a wrap jump). The duration variable is the hook's motion switch: `0s` while dragging (and for the instant landing when a wrap normalizes — the copies sit on identical on-track coordinates there, so the swap is invisible), the settle duration when gliding. **Never publish a settle's intermediate frames** — re-targeting the pill/dots every frame made them chase a moving target with a 0.28s/0.35s lag and look mushy; a settle publishes its target once.
- **Swipe coach mark:** a one-time "Swipe between screens" hint chip in the header is gated by the persisted `userData.hasSeenSwipeHint` flag (store action `markSwipeHintSeen()`; auto-marked on first drag or tab select).
- A gesture that locks to the vertical axis abandons the swipe and settles/glides the carousel back to its rest screen (`settleTo(restPositionRef.current)`; instant when it is already at rest) — it never fights the gesture.
- Viewport resize updates are `ResizeObserver`-driven but `requestAnimationFrame`-throttled with equality guards; slide transforms are percentage-based, so a resize needs no transform rewrite (the observer only refreshes the cached width used by the drag math, and re-syncs the affordances when idle).
- **Rem/px hazard:** the app root font is 13px mobile / 17px desktop — all swipe-shell geometry constants are inline px (`SCREEN_EDGE_PEEK_PX=16`, `CIRCLE_SIZE_PX=44`, `BAR_HEIGHT_PX=54`, `DOT_SIZE_PX=6`, `DOT_STEP_PX=12`). Keep new geometry px-based.
- **Screen order is user-owned.** Default: **Logbook → Tracker → Home → Calorie Map → Insights** (`DEFAULT_SCREEN_ORDER` in `constants/navigation/screens.js`, persisted as `userData.screenOrder`; `normalizeScreenOrder` always settles a stored value to a full permutation). **Never hard-code a screen's slot number**: look it up (`screenOrder.indexOf(SCREEN_KEYS.X)`), key per-screen chrome on the screen key (`AppHeader`'s `activeScreenKey`), and add screen content to the orchestrator's `screenContent` map. Slides render in the stored order, keyed by screen key, so re-ordering moves DOM nodes without remounting screens. The app opens on Home wherever it sits, and Android back still returns Home (`useHardwareBackButton` reads `homeIndex` through a ref so the one listener stays registered). When `screenKeys` changes, the hook keeps the screen in view at its new slot (render-phase remap, then an instant layout-effect rewrite).
- **Loop is optional** (`userData.screenLoopEnabled`, default `true`, passed to the hook, `ScreenTabs` and `AppHeader`). Every loop-dependent helper in `carouselLoop.js` takes `{ loop }` (default `true`). With it off: offsets are not wrapped, no slide ever "teleports" (a first-to-last tab tap slides across every screen), targets clamp to the ends, a drag past an end follows at `EDGE_RESISTANCE` (30%) and springs back, the published drag progress is clamped so the tab/dot indicator stays pinned, and only one indicator copy is rendered (`getRingCopyOffsets(false)`).

`PhaseDetailScreen` is a drill-down from Logbook, not part of the carousel.

### Screen Props Pattern

Screens receive a large props bundle from `EnergyMapCalculator` containing:
- **Data:** `userData`, `bmr`, `trainingCalories`, `weightEntries`, `bodyFatEntries`, etc.
- **Modal openers:** Callback functions like `onOpenGoalModal`, `onOpenWeightTracker`, etc.
- **UI state:** `selectedDay`, display strings, step ranges

Screens also subscribe to the store directly with `shallow` selectors as a fallback pattern. Prefer passing through props for new features.

**All five carousel screens are `React.memo`-wrapped** so the orchestrator's local state churn (modal opens, drafts, pickers) does not reconcile unrelated screens. That makes prop stability load-bearing: new props passed to a screen must be reference-stable (`useCallback`/`useMemo`/module constants), never inline object/array/function literals — an unstable prop silently defeats the memo for that screen. Known exception: `TrackerScreen` receives the `calendarModal` hook object (per-render identity), so its memo compare currently misses on that prop.

**Heavy screen math is memoized, never inline in a render body:**
- `CalorieMapScreen` consumes the orchestrator's memoized `stepRangeDetailsBySteps` (per-step-range goal-seeded breakdown details) via the `rangeDetailsBySteps` prop — never call `getRangeDetails` per card. (The map is a plain object, not a `Map`: the orchestrator imports the lucide `Map` icon, which shadows the global constructor.)
- `HomeScreen` memoizes its hero goal-seeded TDEE (`calculateTargetForGoal`, destructured from the store so the memo keys on the stable function, not the whole store object), today's per-session EPOC reduces, and today's session/step-entry filters.
- `InsightsScreen`'s AT preview memo is keyed on the narrow fields it reads (`goalChangedAt`, `dailySnapshots`, the AT enable/mode/smoothing settings, `selectedGoal`, `goalDurationDays`, weight entries); the AT-mode resolver is fed a narrow `{ adaptiveThermogenesisEnabled, adaptiveThermogenesisSmartMode }` object so the memo never needs the full `userData` identity.
- Static lookup literals (`GOAL_TEXT_CLASSES` in CalorieMapScreen, `BMI_COLOR_MAP`/`FFMI_COLOR_MAP` in InsightsScreen) live at module scope.

### Bottom Tab Bar (`ScreenTabs`)

`ScreenTabs.jsx` (`common/`) is the **fixed floating glass pill bar** — it replaces the old in-flow tab bar + `FloatingScreenTabs` overlay + `useScrollOffScreen` hook (all removed; do not reintroduce):
- 54px-high fully-rounded pill (`bg-surface/35` + `backdrop-blur-2xl` + `border-border/50` + a faint top inset highlight; the active circle carries a glassy gradient and a soft primary glow, clipped by the tracker), floating with **px** margins: `BAR_SIDE_GAP_PX` (40) sides / `BAR_BOTTOM_GAP_PX` (36) bottom + safe-area insets (`--sal`/`--sar`/`--sab`), capped at `BAR_MAX_WIDTH_PX` (384) so wide viewports get a narrower pill. The orchestrator's content clearance and the native-back exit hint read the exported `SCREEN_TABS_BOTTOM_CLEARANCE_PX` (`BAR_BOTTOM_GAP_PX + BAR_HEIGHT_PX + 12` = 102) from the same module, so the bar and the content padding cannot drift apart.
- **Icon-only tabs**; the active tab is a **ring of filled accent circles** (`CIRCLE_SIZE_PX = 44`, `RING_COPY_OFFSETS` copies) inside a rounded `overflow-hidden` full-bar tracker, each moved with a composited `transform: translate3d(calc((var(--screen-drag-progress, <activeScreen + 1>) - 1 + <copy * tabs.length>) * <100%/tabs.length>%), 0, 0)` — the tracker's own width is the bar width, so `100% / tabs.length` resolves to exactly one tab pitch with no measurement, and every copy reads the same live position with a static loop offset. `--screen-drag-duration` supplies the transition duration. Never animate `left` (a layout property → main-thread layout animation, janky at 120Hz) and never re-target it on settle frames.
- Icon colours follow `activeScreen` (the optimistic display screen) and crossfade with `transition: color var(--screen-drag-duration) …`, so the active colour lands exactly when its circle arrives.
- `z-[900]` — below the ModalShell z-lanes (1000+) so modals always cover it.
- Sized in inline px so geometry stays exact regardless of the rem-based root font size.

### Header Zone (`AppHeader`)

`AppHeader.jsx` (`common/`) is the top header on every screen — a thin display component that reuses canonical helpers (`getNutritionTotalsForDate`, `calculateWeightTrend`, derived snapshot fields; no duplicated math):
- Row 1: greeting + long date (minute-interval clock) on the left; right slot swaps between the **swipe coach-mark chip** (while unseen) and the **settings gear** (`onOpenSettings` → orchestrator `settingsModal`), which is a soft glass circle (`border-border/50 bg-surface/60 shadow-sm`).
- Row 2: per-screen glanceable stat line (Logbook: active phase · Tracker: selected-date calories · Home: TDEE · Calorie Map: steps · Insights: weight trend) + `SwipeDots`. The stat is selected by `activeScreen` and re-keyed on the screen, playing a 150ms CSS fade/rise-in (`.header-stat-in`; no `AnimatePresence mode="wait"`, which sequenced a 180ms exit before the 180ms enter and briefly emptied the row), inside a `flex-1 min-w-0` container so a longer/shorter string can never shuffle the dots. The stat itself is a content-hugging chip (`rounded-full border-border/40 bg-surface/50 px-2.5 py-1`, `max-w-full` so it truncates instead of pushing the dots).
- `SwipeDots` uses px-only absolute-positioned dots (`DOT_SIZE_PX=6`, `DOT_STEP_PX=12`) plus the same **ring** marker (`RING_COPY_OFFSETS` copies) whose `translateX` tracks `--screen-drag-progress` (duration from `--screen-drag-duration`), clipped by an `overflow-hidden` row — rem-based flex-gap sizing previously made dots drift out of alignment with the px-based moving dot.

---

## Theme System

### 8 Theme Modes

`'auto'` | `'dark'` | `'light'` | `'amoled_dark'` | `'forest'` | `'dawn'` | `'dusk'` | `'midnight'`

- **Auto (default):** Follows `prefers-color-scheme`, updates in real-time
- **Dark:** Slate 900 background (default; uses `:root`, no class)
- **Light:** Slate 100 background, dark text
- **Darker (AMOLED):** Pure black (#000000)
- **Forest:** Deep evergreen surfaces with crisp botanical accents (dark)
- **Dawn:** Warm paper surfaces with earthy, high-contrast accents (light)
- **Dusk:** Plum shadows with ember highlights for a softer night mode (dark)
- **Midnight:** Near-black navy with clear arctic-blue instrumentation (dark)

The theme keys, their `isDark` flag, native colors and CSS classes are defined together in `SettingsModal` `THEME_OPTIONS`, `utils/theme.js` (`THEME_CONFIG` / `NATIVE_THEME_RGB` / `getThemeClass`) and `index.css`. Keep all three in sync when adding a theme, and give it a `swatchClass` in `THEME_OPTIONS` (plus a `--card-sheen` value in its `index.css` block) so it gets a preview swatch and card top-light.

### Implementation Chain

1. **CSS Variables** in `index.css`: `:root` = dark, `.theme-light`, `.theme-amoled-dark`, `.theme-forest`, `.theme-dawn`, `.theme-dusk`, `.theme-midnight`
2. **Tailwind config** maps variables to utilities: `bg-background`, `text-foreground`, etc.
3. **`App.jsx`** watches `userData.theme` + system preference, applies body class + `applyNativeTheme()`
   - **Theme changes cross-fade.** `App.jsx` swaps the theme class inside `document.startViewTransition(...)` (260ms root cross-fade, `::view-transition-*(root)` in `index.css`) only for a *change* - the first apply, the `auto` system-preference listener and reduced/off motion all do the plain instant swap, and engines without the API fall back to it too. The class swap itself must stay synchronous.
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

**14 accent tokens:** `accent-blue`, `accent-green`, `accent-lime`, `accent-emerald`, `accent-yellow`, `accent-amber`, `accent-orange`, `accent-red`, `accent-purple`, `accent-slate`, `accent-indigo`, `accent-pink`, `accent-teal`, `accent-coral`

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
| `accent-teal` | EPOC / post-exercise burn |
| `accent-coral` | Adaptive thermogenesis correction |

Each theme hardcodes its own accent values in `index.css`, so the shade differs per theme rather than following one rule: dark / AMOLED use 500-level, light uses 600-level, forest and midnight use 400-level, dusk uses 300-level, and dawn uses 700-level.

**`--action-border` exception:** Not a Tailwind utility. Access via: `border-[rgb(var(--action-border))]`

### Elevation & Surface Depth (design language)

Depth is produced by a few **global rules in `src/index.css`**, not by per-component styling. Reuse them; never hand-roll shadows or gradients on individual cards.

- **The shadow scale is theme-owned.** `--shadow-xs/sm/md/lg/xl/2xl` are redefined in the `@theme inline` block as layered shadows (a tight contact shadow + a long, soft, negative-spread ambient shadow) tinted with `rgb(var(--overlay-base) / …)`, so every existing `shadow-*` utility - and its `shadow-background/40`-style colour modifier - picks the look up automatically. They must stay inside the `inline` block for the same reason as the colour tokens: `var(--overlay-base)` has to resolve on the element using it, not at `:root`. Pick a step from the scale; do not add one-off `shadow-[...]` values to cards.
- **Card top-light.** `.rounded-2xl.bg-surface` gets a faint top-edge highlight from `--card-sheen` (`255 255 255 / 0.03` on dark themes, transparent on `theme-light` and `theme-dawn`, where a white highlight on a white card is invisible). It is a `background-image` in `@layer components`, so a card that opts into its own gradient utility still wins. **A new theme must set `--card-sheen`** (copy the nearest dark/light sibling).
- **Solid action sheen + glow.** `button.bg-primary` and every solid `button.bg-accent-*` fill except `accent-slate` (neutral) get a top-light gradient and, while `:not(:disabled)`, a coloured under-glow; `div.bg-primary` with `rounded-lg|xl|2xl` (hero tiles such as the Calorie Map cards) gets the sheen only. The scope is deliberately `button` / rounded blocks so dots, progress fills and chips that reuse the same token are untouched. The box-shadow is in `@layer components`, so an explicit `shadow-*` / `ring-*` utility on the element still overrides it. The strengths (`0.10` sheen, `0.12` inset line, `0.5` glow) were dialled back on purpose - keep the effect subtle, it should read as depth, not as "glass".
- **The page backdrop is a plain diagonal wash** (`.app-backdrop`: background → surface → background, used by both orchestrator roots). Radial accent "glows" over it were tried and rejected - do not reintroduce them.
- `h1`-`h3` use `letter-spacing: -0.01em`.
- **Fullscreen modal chrome.** All seven fullscreen modals share one skeleton - a `bg-background` header over a `bg-surface` body - and carry the shared `.fullscreen-header` / `.fullscreen-body` classes from `index.css` on those two elements (a new fullscreen modal must too). The header is lit from the top and lifted above the body with a soft shadow (it needs `position: relative` + a z-index so the shadow paints over the scrolling body, which the class sets); the body catches the card top-light. Both are `background-image`/`box-shadow` only, so the `bg-*` utilities still own the base colour. The segmented-control sliding pill (`div.bg-accent-blue.absolute.rounded-md|lg`) gets the same sheen as solid buttons.
- **Scrolling rows fade with a mask, never with overlay strips.** A horizontally scrolling row (e.g. the Food Search action chips) uses `.fade-scroll-x` on the scroller; the owner writes `--fade-left` / `--fade-right` (0..1) from the scroll position straight onto the element (no state, no re-render) and a ResizeObserver re-evaluates it when the content width changes. Painting `from-surface` gradient overlays at the edges is what broke here: an overlay must match the background behind it exactly, and stopped doing so once `.fullscreen-body` gained its top-light gradient, leaving dark boxes at the edges. A mask fades the content itself, so it works on any background and any theme.
- **Chrome uses the same grammar.** The header gear is a soft glass circle (`border-border/50 bg-surface/60 shadow-sm`); the per-screen stat is a content-hugging chip (`rounded-full border-border/40 bg-surface/50`); the tab-bar pill has a `border-border/50` edge plus an `inset-shadow-[0_1px_0_rgb(255_255_255/0.07)]` top highlight, and its active circle carries a glassy gradient and a `0 0 14px rgb(var(--primary)/0.5)` glow that the rounded tracker clips, so it halos along the pill. The pill and accent-circle styles are shared constants in `common/glassStyles.js` (`GLASS_PILL_CLASS`, `GLASS_ACCENT_STYLE`), also used by the **AI chat composer** and its send button. The composer floats over the message list so the glass has content to blur; `FoodSearchChatPanel` publishes the footer's live height as `--chat-footer-height` (ResizeObserver, no state) and the list pads its bottom by it.
- **Colour-rule note:** the sheen/highlight layers use literal white/black overlays at low alpha. That is theme-invariant *lighting*, not palette colour, and is the one sanctioned exception to "never hardcode colours" - anything that is a hue still uses semantic/accent tokens.

### Display Scale: Text Size & Density

Two persisted profile settings (`userData.fontScale`: `small | default | large | xlarge`, `userData.uiDensity`: `compact | default | comfortable`) under **Settings -> Appearance**. The stored value is the option **key**, never the multiplier; options, normalizers and `applyUiScale()` live in `constants/appearance/uiScale.js` (shared by storage, `App.jsx` and the Settings UI). `mergeWithDefaults` sanitizes both, so a corrupt or pre-feature profile loads as `default`. `App.jsx` publishes `--font-scale` / `--density` on `<html>` from the store (primitives, no tree re-render); everything else is CSS in `index.css`:

- **Text size scales text only.** The `--text-*` tokens are `calc(<size> * var(--font-scale))`, and the line-height tokens are unitless ratios so they follow. The root font-size stays 13.5px / 17px, so layout does **not** grow with it. Text with **no** font-size utility inherits `body { font-size: calc(1rem * var(--font-scale)) }` (added because unstyled labels - e.g. the Settings hub rows, section headings and the Male/Female segment labels - silently ignored the setting when they inherited the fixed root size); at the default scale it resolves to the previous 13.5px / 17px. Fixed-px text (`text-[11px]` etc., ~230 uses) is outside the token system, so each size used in `src/` has an explicit `calc(Npx * var(--font-scale))` rule in the **last** `@layer utilities` block of `index.css`. **When you introduce a new `text-[Npx]` size, add it there** - otherwise it silently ignores the setting. Note `transition-all` on a container makes an inherited font-size change animate for the transition's duration, so computed-size checks taken immediately after a scale change can read a stale, interpolated value.
- **Density scales Tailwind v4's single `--spacing` unit** (`--spacing: calc(0.25rem * var(--density))`), which every numeric `p-/m-/gap-/space-/h-/w-/size-/inset-` utility derives from, so one declaration tightens or loosens the whole layout. It lives in a later cascade layer than Tailwind's theme, which is why it wins. It is a *layout* density, not a text change.
- **Deliberately unscaled:** anything in inline px (the swipe-shell geometry, `ScreenTabs`, `SwipeDots`, safe-area math), inline `rem` (the orchestrator root's page padding), `text-[Npx]` sizes missing from the override block, and iOS form inputs (pinned to 16px to stop focus-zoom). Pickers measure the DOM (`offsetTop`/`offsetHeight`), so they are density-safe; keep it that way - never hard-code a wheel row height in JS.
- **Trade-off to remember:** `Compact` (0.88) shrinks tap targets with everything else (`h-10` ~ 30px on a phone), so do not go below that without revisiting touch-target sizes.
- The Text size row draws each label at the size it stands for (absolute `rem`, so it does not move with the setting it describes) and pairs it with a `Type` glyph that grows with the size (`FONT_SCALE_ICON_PX`, absolute px); the Density row uses `Rows4`/`Rows3`/`Rows2` (more, tighter rows = more compact; `DENSITY_ICONS`). Both are stacked icon-over-label like the theme swatches, icons `aria-hidden`, and live in `SettingsModal` as presentation only - the option data stays in `constants/appearance/uiScale.js`; the active setting applies live to the whole app, including the Settings page, so there is no separate preview to maintain.

### Motion Preference (Animations)

A persisted profile setting, `userData.motionPreference` (`system | full | reduced | off`, default `system`), under **Settings -> Appearance -> Animations**. The user picks a *preference*; the app runs on a resolved **mode** (`full | reduced | off`) - model, option list and `resolveMotionMode(preference, deviceRequestsReducedMotion)` in `constants/appearance/motion.js`:

- **`system` (Auto, default)** resolves from the device's Reduce Motion setting *live* (App.jsx listens to the media query), so a user who never opens Settings gets exactly the pre-existing behaviour. **`full` deliberately overrides the device flag** - it is an explicit choice, not a default.
- **`reduced`**: decorative movement goes (slides, scales, staggers, the portion-card flight, the keyboard glide, smooth scrolling); crossfades and short colour/press transitions stay. **`off`**: nothing decorative animates - durations collapse to ~0, fades and transitions too. The 5-screen swipe carousel (`.carousel-slide` and its drag-linked chrome `.carousel-drag-sync`) stays smoothly settled across all modes so direct-manipulation swiping and tab switches never snap abruptly.

**One source of truth, three consumers.** `App.jsx` resolves the preference and publishes the mode via `setMotionMode(mode, document.documentElement)` (`utils/visuals/motionPreference.js`); `main.jsx` publishes the device default *before* React renders so there is no un-reduced first frame. Consumers:

1. **CSS** keys on `<html data-motion="...">` (never on `@media (prefers-reduced-motion)`): one `:root:is([data-motion='reduced'], [data-motion='off']) :is(<animation classes>)` rule (`animation: none; transform: none`), the modal sheet falling back from slide/scale to `modalFadeIn/Out`, `.keyboard-bottom-inset` transitions off, and for `off` a universal `:where(*:not(.carousel-slide):not(.carousel-drag-sync)), ::before, ::after { animation-duration / transition-duration: 0.01ms !important }` reset (~0 rather than `none`, so `animationend`/`transitionend` still fire; `.animate-spin` / `.animate-spin-fast` and the 5-screen carousel elements `.carousel-slide` / `.carousel-drag-sync` are exempt - a frozen spinner looks hung and a 0ms carousel settle makes swiping snap abruptly). **A new animated class must be added to that `:is(...)` list.**
2. **JS (imperative)** calls `prefersReducedMotion()` / `resolveScrollBehavior('smooth')` from `utils/visuals/motionPreference.js` (portion-card flight, keyboard glide, theme view-transition, picker `scrollTo`). Before a mode is published it falls back to reading the device flag live, which keeps unit tests that stub `matchMedia` working.
3. **React** uses `useMotionMode()` / `useReducedMotionPreference()` (`hooks/useMotionMode.js`, `useSyncExternalStore`) - a drop-in for framer-motion's `useReducedMotion()`, which only knows the *device* setting. `App.jsx` also wraps the tree in `<MotionConfig reducedMotion={full ? 'never' : 'always'}>` and sets `MotionGlobalConfig.skipAnimations` for `off`, so framer components that never check anything still obey.

**Rules:** never call `matchMedia('(prefers-reduced-motion...)')` directly or import framer's `useReducedMotion` (both ignore the in-app preference); never write a smooth `scrollTo`/`scrollIntoView` without `resolveScrollBehavior`; keep new Settings rows' `role="group"` + `aria-label` (the theme row and the Animations row both contain an "Auto" button, so the group is what disambiguates them for assistive tech and tests). The preference is validated on load (`mergeWithDefaults`), so corrupt or pre-feature profiles read as `system`.

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

## Measurement Units

Users choose a unit per quantity under **Settings -> Units**. It changes display and input only: **stored data and every calculation stay kg, cm, km, g and kcal** (snapshots, JSON export/import and the AI JSON payload included).

| `userData.unitPreferences` key | Options (default first) | Shown as |
|---|---|---|
| `bodyWeight` | `kg`, `lb`, `st` | 74.5 kg / 164.2 lb / 11 st 10.2 lb (changes, rates and pickers use lb for `st`) |
| `height` | `cm`, `ft` | 168 cm / 5′6″ |
| `distance` | `km`, `mi` | 5.2 km / 3.2 mi |
| `foodWeight` | `g`, `oz` | 170 g / 6 oz; "per 100g" becomes "per oz" |
| `energy` | `kcal`, `kJ` | 2,100 kcal / 8,786 kJ |

- Options, presets (Metric, US, UK: they set the first four, **never energy**) and the per-key normalizer live in `constants/units/units.js`; the preference is normalized by `mergeWithDefaults` and `handleUserDataChange`.
- **`utils/units/unitFormatter.js` is the only converter and the only place unit text is written.** `createUnitFormatter(preferences)` returns a frozen `{ bodyWeight, height, distance, food, energy }`, WeakMap-cached on the preference object, so replace that object immutably. Components use `useUnits()`; pure builders take a `units` argument (default `METRIC_UNITS`) or read `userData.unitPreferences`. A `useMemo` / `useCallback` that formats lists `units` in its dependencies.
- **Rules:** convert from the unrounded stored value and round last; formatters never clamp; metric output is byte-identical to the pre-units text (including no-space forms like `74.5kg`); **opening a picker and saving changes nothing** (every `fromPicker(picked, original)` returns the original when the picker still shows it); each value converts on its own, so kJ breakdown rows can differ from the total by a few kJ.
- **Never converted:** macros and micros, `g/kg`, `mL/kg/min`, bpm. Generic prose saying "calories" stays; field titles and sort labels read "Energy" in kJ mode (`units.energy.noun`).
- **Formulas:** linear lines (NEAT, steps, sessions, TEF, AT) convert whole; Mifflin, Katch, MET, BMI and FFMI stay in SI and append the converted result. Step math follows the **distance** unit. Charts keep kg geometry and convert labels only.
- **Pickers:** `common/DualWheel.jsx` (two wheels; its `config` from `utils/units/wheelConfigs.js` must be referentially stable) and `pickers/DualWheelModal.jsx` serve body weight (kg or lb + tenth, stone + half pound), feet + inches, ounce weights and kJ. `EnergyPickerModal` (hundreds + units, 0-20,920 kJ) replaces the stepped energy wheel for kJ food energy; `CaloriesPerHourPickerModal` steps 20 kJ.
- **Outside the UI:** notification bodies follow the units (the schedule signature includes the body, so a change reschedules); the phase **CSV** follows body weight and energy (stone is written as lb) while JSON exports stay canonical; a barcode product that only declares kJ is converted to kcal (`resolveEnergyKcal`); AI chat appends `[DISPLAY_UNITS]` (`utils/units/aiDisplayUnits.js`) for kJ / oz users and sends preconverted `displayValues` to the presentation pass, and the server prompts keep the JSON in kcal and grams.
- **Guard:** `tests/utils/unitLiterals.test.js` fails on a hard-coded unit in `src/components` or `src/utils`. Its allowlist is for SI equations and the few places a unit is fixed by definition; add to it only with such a reason.
- Covered by `tests/utils/units.test.js` (round trips, carries, preservation, metric parity), `unitPersistence.test.js`, `unitsEnergyBuilders.test.js`, `tests/notifications/notificationUnits.test.js`, and the `Units*.spec.jsx` / `UnitPickers.spec.jsx` / `exportUnits.spec.js` UI specs.

---

## Calculation System (`utils/calculations/calculations.js`)

All calorie formulas are centralized. **Never duplicate or inline calculations.**

| Calculation | Function | Details |
|------------|----------|---------|
| BMR | `calculateBMR(userData)` | Mifflin-St Jeor; auto-upgrades to Katch-McArdle when `bodyFatTrackingEnabled` with valid entries |
| Step calories | `getStepDetails(steps, userData)` | **Lives in `utils/steps.js`**, not calculations.js. Stride length heuristic: height × 0.415 (male) / 0.413 (female). In full breakdown mode, step calories are computed from **remaining steps** after ambulatory-cardio overlap deduction. |
| Cardio (single) | `calculateCardioCalories(session, userData, cardioTypes)` | MET-based (`effortType: 'intensity'`) or heart rate formula (`effortType: 'heartRate'`: Keytel, or Keytel's VO2-max equation when a VO2 max exists as of the session date) |
| Training (single) | `calculateTrainingSessionCalories(session, userData, trainingTypes)` | kcal/hr × intensity multiplier; HR sessions with `hrBurnModel: 'intensity'` let HR pick the level (`resolveTrainingHeartRateIntensity`), legacy HR sessions use Keytel |
| Cardio (total) | `getTotalCardioBurn(userData, cardioTypes)` | Sums `calculateCardioCalories` for **today's date** only |
| Cardio (for date) | `getTotalCardioBurnForDate(userData, cardioTypes, dateKey)` | Sums cardio calories for a specific `dateKey` |
| Training EPOC (single) | `resolveTrainingSessionEpoc({ session, exerciseCalories, trainingType, userData })` | Post-exercise burn estimate + carryover window for one training session (`utils/epoc.js`) |
| Cardio EPOC (single) | `resolveCardioSessionEpoc({ session, exerciseCalories, cardioType, userData })` | Post-exercise burn estimate + carryover window for one cardio session (`utils/epoc.js`) |
| Session carryover (date) | `getCarryoverForDateFromSessions({ dateKey, sessions, resolveCarryover })` | Allocates carryover calories across date boundaries (`utils/sessionCarryover.js`). **Date-distance pre-filtered:** only sessions that ended before the target day's end and within `MAX_EPOC_CARRYOVER_WINDOW_MINUTES` (exported from `epoc.js`; a session-provided `epocCarryoverMinutes` widens the per-session reach) reach the expensive `resolveCarryover` pricing pass — never revert to iterating (and re-pricing) every session in history per TDEE call. |
| Training cal/hr | `getTrainingCaloriesPerHour(userData, trainingTypes)` | Base cal/hr × intensity multiplier (light 0.75 / moderate 1.0 / vigorous 1.25) |
| Training (total) | `getTotalTrainingBurnForDate(userData, trainingTypes, dateKey)` | Session-first burn from `trainingSessions` (`effortType` + `averageHeartRate` or `intensity`) |
| Training (for date) | `getTotalTrainingBurnForDate(userData, trainingTypes, dateKey)` | Sums training-session calories for a specific `dateKey` |
| TDEE breakdown | `calculateCalorieBreakdown({...})` | BMR + activity multiplier + training + cardio + steps + EPOC. Accepts optional `tefContext`, `adaptiveThermogenesisContext`, and `dateKey`. Returns `bmrDetails`, TEF fields when Smart TEF is enabled, AT fields, EPOC fields (`epocCalories`, `trainingEpoc`, `cardioEpoc`, carry-in/from-today details), plus step-overlap diagnostics (`originalEstimatedSteps`, `deductedSteps`, `remainingEstimatedSteps`, overlap session counts/details), and per-session `cardioDetails` / `trainingDetails` lines (each priced by the canonical session formula, so they always sum to `cardioBurn` / `trainingBurn`; `CalorieBreakdownModal` renders them). |
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

**Rolling Energy Balance:** `utils/calculations/rollingEnergyBalance.js` is the canonical longitudinal analytics source. `calculateRollingEnergyBalance({ snapshots, windowDays, asOfDate, goalDailyBalanceTarget })` consumes the already-computed snapshot `tdee`/`intake` (never rebuilds TDEE) over 3/7/14/28-day calendar windows (default 7). Returns `rollingBalance`, `averageDailyBalance`, `trackedDays`, `expectedBalance`, `balanceVariance`, `estimatedWeightChangeKg` (÷`ESTIMATED_ENERGY_PER_KG`=7700, labelled as a rough energy-equivalent estimate), `hasData`, `insufficientData`, and ordered `days`. Sign convention: positive = deficit, negative = surplus. Missing snapshots are unavailable days (never zero); malformed/missing-field records and future dates are excluded via `parseDailyEnergyBalance`/`selectRollingBalanceDays`; duplicates keep the last snapshot. `expectedBalance` is the **sum of each day's own recorded target** (`days[].goalTarget`, from `resolveSnapshotGoalTarget`: recorded, else nominal for legacy snapshots), so a goal or phase change never rewrites history; the store-derived, phase-lock-aware `goalDailyBalanceTarget` (positive = deficit) is only the fallback for a day whose snapshot knows neither, and with no fallback `expectedBalance`/`balanceVariance` are `null`. Do not duplicate this logic in UI components.

**Smart TEF mechanic:** When `userData.smartTefEnabled` is true and a `tefContext` is passed, `calculateCalorieBreakdown()` subtracts `TEF_MULTIPLIER_OFFSET` (10%) from the NEAT activity multiplier (`effectiveActivityMultiplier = rawActivityMultiplier - 0.1`) then adds the macro-based TEF back as an explicit line item. Net effect is neutral at default macro ratios but improves accuracy with real logged data. The breakdown return object gains: `rawActivityMultiplier`, `effectiveActivityMultiplier`, `tefOffsetApplied`, `tefMode`, `smartTefCalories`, `smartTefDetails`.

**Daily NEAT override mechanic:** `calculateCalorieBreakdown()` resolves the NEAT multiplier **override-first** for the resolved `dateKey` (`dailyNeatOverrides[resolvedDateKey]`), clamped via `clampCustomActivityMultiplier()` over the fallback chain override → training/rest global multiplier → `DEFAULT_ACTIVITY_MULTIPLIERS`. When applied, the breakdown return object gains `dailyNeatOverrideApplied`, `dailyNeatOverrideMultiplier`, `dailyNeatOverridePresetKey`, and `dailyNeatOverrideLabel`. The override changes `rawActivityMultiplier` (and thus `baseActivity` / NEAT segment) only for that one date; Smart TEF, AT, and EPOC math remain unchanged.

**Macro target anchoring:** Macro recommendations are constraint-based. Bounds are profile-derived (`protein: 1.6-2.8 g/kg`, mass source = lean mass when body fat is available else bodyweight; `fat: 0.6-1.6 g/kg`; `carb soft floor: 50g` with relaxation warning on infeasible budgets). Preserve calorie reconciliation and warning fields (`carb_soft_floor_relaxed`, `hard_floor_exceeds_budget`) when adjusting this logic.

**Constrained triangle mapping:** `MacroPickerModal` uses full-surface constrained remapping (`macroSplitFromConstrainedTrianglePoint` / `macroSplitToConstrainedTrianglePoint`) so the whole triangle is draggable while remaining within bounded macro behavior. Do not revert to direct raw-ratio barycentric mapping for picker interactions.

**Macro gram anchors (locks):** `userData.macroLocks` (`{ protein, carbs, fats }`, each `null` = unlocked or a gram number) lets users pin macros in **grams** so targets stay stable while calorie targets shift (live steps, cardio/training sessions, step ranges). `normalizeMacroLocks()` coerces values (rejects `null`/`''`/negative/NaN) and enforces `MAX_MACRO_LOCKS = 2` (protein/carbs win ties). `calculateMacroRecommendations()` accepts `macroLocks`, holds locked macros at their anchor grams (clamped to safety bounds as **soft anchors**), redistributes residual calories to unlocked macros by relative ratio, and returns `macroLocks.lockedKeys` / `relaxedKeys` / `lockWarnings`. The control surface in `MacroPickerModal` is conditional:
- **0 locks:** full triangle drag via constrained barycentric mapping.
- **1 lock:** horizontal `<input type="range">` slider with direct gram control (the slider value is the grams of the first unlocked macro, bounded by `getUnlockedMacroGramRange(...)`). The second unlocked macro fills the residual calories. The slider track uses a two-color gradient matching the two unlocked macro accent colors, with end labels showing grams and calorie-ratio percentages. The 1-lock slider path uses helpers from `macroRecommendations.js`: `getUnlockedMacroKeys`, `getUnlockedMacroGramRange`, and `macroSplitFromUnlockedRatio`.
- **2 locks:** triangle drag is disabled; the handle shows a dashed ring with an "absorbs changes" hint on the unlocked macro.
`TrackerScreen` forwards `macroLocks` so displayed targets respect locks. **The macro picker has two entry points only: Settings → Food & Macros, and the Tracker's macro rings** (the whole Protein/Fats/Carbs ring area is the button, with a faint pie icon hint; Insights no longer has a Macro Targets card). A **one-time helper bubble** ("Tap your macros to edit the split") appears above the rings the first time Tracker is the visible screen (`isScreenActive={visibleScreen === trackerIndex}`), gated by the persisted `userData.hasSeenMacroHint` flag (store action `markMacroHintSeen()`). `TrackerScreen` latches it locally (`macroHintShown`, render-phase) and writes the flag as soon as it shows, so it never returns even if the user swipes away mid-hint; it fades after `MACRO_HINT_DURATION_MS` (5 s) or on the first tap of the rings. It is pointer-transparent (a tap on it is a tap on the rings).

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

**Staged AT pressure accumulator (internal key `'crude'`):** User-facing UI calls this **Staged mode** (the persisted/internal mode identifier stays `'crude'` for snapshot and export compatibility). Staged mode is strictly goal-driven and deterministic — it never reads `intakeCalories`, energy balance, or weight logs. It evaluates a split, non-negative pressure model over a rolling window of up to `CRUDE_WINDOW_DAYS` (28) daily snapshots ending at the requested `dateKey`; each day's goal is read from `snapshot.selectedGoal ?? snapshot.goalAtSnapshot` (unknown records are skipped, never zero-filled). The two accumulators are `cutPressure` (deficit depth) and `surplusPressure` (surplus height), each clamped to `[0, 28]`, with at most one non-zero at a time. Transitions: `cut` → `cutPressure + 1.0/day` (resets to `cutPressure = 1.0` when `surplusPressure > 0` — leaving surplus); `surplus` → `cutPressure − 2.0/day` while a deficit exists (fast unwind), else `surplusPressure + 0.75/day`; `maintenance` → `cutPressure − 0.25/day` when in deficit, else `surplusPressure − 0.50/day`. The signed net `balancePressure = surplusPressure − cutPressure` is exposed for UI/analytics. Milestones on the dominant accumulator: `cutPressure >= 3/7/14/21` → −50/−100/−175/−250 kcal/day; `surplusPressure >= 7/14/21` → +50/+100/+150 kcal/day; otherwise 0. Because Staged mode evaluates the snapshot history rather than `goalDurationDays`, an isolated maintenance/refeed day decays the accumulated adaptation instead of resetting it to zero — and the `maintenance-goal` no-op guard applies to Smart mode only. The store's `setSelectedGoal` refreshes today's snapshot (`goalAtSnapshot`) on an actual goal switch so same-day changes feed the accumulator immediately.

**Adaptive Thermogenesis UI surfaces (`AdaptiveThermogenesisModal`, `InsightsScreen`):** The modal keeps its top 2×2 summary metrics unboxed above the divider and uses cohesive `rounded-xl` cards for every body state below it (with `text-base` main headings / `text-sm` body copy and compact `text-xs` card footers/pills). On Maintenance with no active milestone, Staged mode renders `CrudeMaintenanceView` (explaining why maintenance stays at 0 kcal, optional residual sub-milestone pressure card, Cut/Surplus/Maintenance response breakdown, and a Rolling Energy Balance shortcut) instead of an empty state; while decaying an active post-cut/surplus milestone on Maintenance, `TimelineView` keeps the milestone chart with an "Unwinding on maintenance" callout. On Maintenance, Smart mode checks `result.details?.reason === 'maintenance-goal'` and renders `SmartMaintenanceView` rather than falling through to zeroed comparison cards. `InsightsScreen`'s `AdaptiveCorrectionCard` surfaces explicit maintenance subtitles (`Staged mode · no adjustment at maintenance` / `Smart mode · paused at maintenance`) and `None at maintenance` instead of `"Not reached yet"` or a placeholder `0 kg/wk`. Covered by `AdaptiveThermogenesisModal.spec.jsx` and `InsightsScreen.spec.jsx`.

**Smart AT smoothing mechanic:** When `adaptiveThermogenesisSmoothingEnabled` is true, smart mode smooths the weight series before slope regression (`adaptiveThermogenesisSmoothingMethod`: `'ema' | 'sma'`, `adaptiveThermogenesisSmoothingWindowDays`: clamped 3–14). Smoothing metadata is included in the AT smart signal for debugging (`smoothingEnabled`, `smoothingMethod`, `smoothingWindowDays`).

**EPOC mechanic:** `calculateCalorieBreakdown()` resolves per-session EPOC from `utils/epoc.js`, then uses `getCarryoverForDateFromSessions()` (`utils/sessionCarryover.js`) to allocate carryover calories to the requested `dateKey`. Returned fields include `epocEnabled`, `epocCalories`, `trainingEpoc`, `cardioEpoc`, `epocFromTodaySessions`, `epocCarryInCalories`, `trainingEpocDetails`, and `cardioEpocDetails`. The carryover allocation is **date-distance pre-filtered** (see the table row above): a session's carryover window starts when the session ENDS, so only sessions that ended inside the target day or within one carryover window's reach of its start can allocate into it. This is what keeps a single breakdown O(today + carry-in) instead of O(all history) — without it, every TDEE call re-priced every session ever logged, and the app visibly slowed as usage accumulated. Covered by `tests/utils/sessionCarryover.test.js`.

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
- Mechanics: samples form a polyline that is linearly interpolated between measurements and **held flat at the window edges**, so the integral always spans exactly `n` days whenever any sample exists (the right boundary is midnight *after* the window end so `n` inclusive day keys map to exactly `n` integrated days). Returns `null` when the window holds no data — callers must surface that honestly instead of substituting zeros. Result is rounded to the caller's `precision` (default 1 decimal; body-weight surfaces pass `units.bodyWeight.mathPrecision`, which is 2 outside kg).

### Window Date Keys

- `getWindowDateKeys(endDateKey, n)` in `utils/data/dateKeys.js` builds exactly `n` consecutive UTC date keys `[E−(n−1) … E]`. It validates format **and** canonical round-trip (rejects non-canonical keys like `'2026-02-31'` that JS date coercion would silently accept) and returns `[]` on invalid input. Use it for any day-window iteration instead of hand-rolled date arithmetic.

### Capped Trend Fallback (data honesty)

- `calculateWeightTrend` / `calculateBodyFatTrend` fall back to the last two entries **only when their span ≤ `MAX_TREND_FALLBACK_SPAN_DAYS` (14 days)**. Otherwise they return `'Need more data'` with `isStaleFallback: true` instead of presenting a stale rate as current behaviour.

### Trend Availability Gate (goal alignment)

- `hasTrendData(trend)` (`utils/calculations/goalAlignment.js`) is the only sanctioned test for "is this a real trend". The calculators return `weeklyRate: 0` for "No data yet" / "Need more data" just as they do for a genuinely stable rate, so a bare number can never distinguish missing data from a stable trend.
- `getGoalAlignmentText(trend, …)` takes the whole trend, not its rate, and returns `null` when `hasTrendData` is false. Surfaces must then render **no** verdict: the Insights snapshot cards show empty ("No weigh-ins yet"), "add one more entry" and stale-data guidance instead of a rate, and the tracker modals' alignment line simply disappears. Never let an empty log read as "On track".

### Smart AT Staleness Gate

- `SMART_WEIGHT_STALENESS_MAX_AGE_DAYS = 3` (exported from `utils/calculations/adaptiveThermogenesis.js`). `getAdaptiveThermogenesisSmartModeDataStatus` gates the smart signal on weigh-in freshness: when the newest weigh-in is older than 3 days relative to the requested `dateKey`, it returns `{ isSufficient: false, reason: 'weight-data-stale', latestWeightEntryAgeDays, stalenessMaxAgeDays, ... }` regardless of how many historical entries sit inside the 28-day window, and `computeSmartCorrection` deactivates (correction 0, `insufficientData`). `AdaptiveThermogenesisModal` renders dedicated recovery copy for this reason ("Your latest weigh-in is too old…").

### Chart Gap Handling (Weight / BodyFat Tracker Charts)

- Timeline slots are built by `buildTaggedChartSlots({ days, getValue, minValue, range, chartWidth, windowSize, chartHeight })` in `utils/visuals/trackerHelpers.jsx`: real entries map to `{ date, value, x, y, isInterpolated: false }`; interior missing days are **linearly interpolated** between their nearest real neighbours and tagged `{ isInterpolated: true, gapLength }` (`gapLength` = consecutive missing days in that run); leading/trailing empty slots stay `null` — no invented data at the chart edges.
- `buildGapAwarePathRuns(taggedPoints, options?)` in `utils/visuals/bezierPath.js` groups tagged slots into drawable runs with gap tiers:
  - `gapLength <= GAP_SOLID_MAX_DAYS (7)` → bridged **seamlessly**: interpolated slots merge into the current solid run (no split, one continuous stroke)
  - any longer gap (`GAP_DASHED_MAX_DAYS` is `Infinity`) → still bridged by a separate dashed stroke (`GAP_DASH_PATTERN = '4 6'`) anchored at the preceding real point and closed by the next real point; the line never splits unless a caller passes a finite `dashedMaxGapDays`
  - curves are monotone cubic (Fritsch–Carlson tangents, flat only at a drawn edge leader), never flat-control-point S-curves: those turned dense sloped data into a visible staircase wobble
  Every returned run ends on a real point; interpolated slots trailing past the last real point are discarded. Returned points are clean `{x,y}` geometry (interpolation tags stay internal). The dead `buildSegmentedBezierPaths` was deleted — do not reintroduce segmented path builders.
- Tracker area gradients use `gradientUnits="userSpaceOnUse"` spanning `0 → chartHeight` so every run fragment shares one gradient space — never revert to default per-path bounding-box gradients (they restart per fragment and band the fill).
- `WeightTrackerModal` / `BodyFatTrackerModal` preserve the `isInterpolated`/`gapLength` tags when mapping points into `buildGapAwarePathRuns`, and the selection card snaps to the nearest **real** point — interpolated bridge slots are visual aids, never selectable data.

---

## Storage Architecture (`utils/data/storage.js`, `utils/data/historyDatabase.js`)

### Split Storage Keys

| Key | Contents | Why |
|-----|----------|-----|
| `energyMapData_profile` | Settings, user stats, preferences, small lists | Primary profile/settings source of truth |

Primary history store is now Dexie (`energyMapHistory` DB), with document rows keyed by history field name.

Split is determined by `HISTORY_FIELDS` array: `weightEntries`, `bodyFatEntries`, `stepEntries`, `nutritionData`, `phaseLogV2`, `cardioSessions`, `trainingSessions`, `cachedFoods`, `dailySnapshots`, `dailyNeatOverrides`, `heartRateEntries` (sharded `heartRateEntries:YYYY-MM-DD`; see "Heart Rate").

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

### Incremental Persistence (identity diffing)

The save path is **O(changed), never O(entire history)** — this is what keeps the app responsive as the log grows. The old path `JSON.stringify`-ed every history field and rebuilt every shard on each debounced save, so a single logged food re-serialized the whole nutrition log and every snapshot.

- History fields are replaced **immutably** by the store, so `storage.js` tracks a per-field value **reference** (`lastSavedHistoryRefByField`). An unchanged field is skipped entirely (no normalization, no shard build, no serialization).
- Sharded fields diff **per shard** via `SHARDED_HISTORY_FIELD_CONFIG[field].shardEntries(value)` → `{ key, source, sourceRef, order }`; a shard is rewritten only when `sourceRef`/`order` moved, then compared structurally (`areShardPayloadsEqual`) so a rebuilt-but-identical payload is not rewritten. Deletes are the previously-tracked shards that are now absent.
- **Profile change detection is reference-based too** (`collectChangedProfileFields`): the debounced save used to `JSON.stringify` the whole profile (favourites/pins lists included) on EVERY save just to compare against the last serialized payload; now an unchanged profile short-circuits to O(fields) reference comparisons (`lastSavedProfileFieldRefByField`) and the stringify only runs when a non-history top-level field's reference actually moved. Key removals are detected (baseline keys absent from the payload count as changes), and the baseline is rebuilt **wholesale** after a successful write so removed keys leave it. Same immutability contract as the history diff.
- `primePersistenceBaseline(userData)` (called by `loadEnergyMapData` after `mergeWithDefaults`) records the loaded state as already-persisted, so the first save after launch writes only user changes. This primes BOTH scopes (history field refs + shard identities, and the profile field refs — previously the profile always wrote once on the first save because its baseline started empty). `sanitizeHistoryForPersistence` is now **load-only**; `cachedFoods` normalization lives in its shard config. `resetPersistenceTracking()` clears baselines for import/reset. `diffShardedHistoryField(...)` is the pure test seam and `getPersistenceFootprint()` reports tracked shard counts.
- **Never** reintroduce whole-field/per-shard `JSON.stringify` diffing (or whole-profile stringify-per-save) or mutate history/profile fields in place — the identity diffs depend on immutable replacement.

### Data Integrity Helpers

| Utility | Module | Purpose |
|---------|--------|---------|
| `normalizeDateKey(value)` | `utils/weight.js` | Validates `YYYY-MM-DD` format, returns `null` on invalid |
| `clampWeight(value)` | `utils/weight.js` | Clamps to 30-210 kg, rounds to **2 decimals** (so a weight entered in lb or st reads back unchanged); `formatWeight` rounds to 1 and clamps, so never use it for a weight *change* |
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
- `age: 21`, `weight: 74`, `height: 168`, `gender: 'male'`, `theme: 'auto'`, `fontScale: 'default'`, `uiDensity: 'default'`, `motionPreference: 'system'`, `onTargetToleranceKcal: 100`, `unitPreferences` all metric (`kg`, `cm`, `km`, `g`, `kcal`), `screenOrder` = `DEFAULT_SCREEN_ORDER`, `screenLoopEnabled: true`, `homePhasePromptEnabled: true`
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
- `heartRateEntries: []`, `maxHeartRateCustom: null`, `vo2MaxCustom: null`, `heartRateSyncEnabled: false`, `heartRateSensor: null`

---

## Data Schemas

### `userData` (profile + Dexie history, merged in memory)

```javascript
{
  // Profile
  age, weight, height, gender,
  theme: 'auto',                    // 'auto' | 'dark' | 'light' | 'amoled_dark' | 'forest' | 'dawn' | 'dusk' | 'midnight'
  fontScale: 'default',              // 'small' | 'default' | 'large' | 'xlarge' - scales text only (see Display Scale)
  uiDensity: 'default',             // 'compact' | 'default' | 'comfortable' - scales the spacing unit (see Display Scale)
  motionPreference: 'system',       // 'system' | 'full' | 'reduced' | 'off' - animations (see Motion Preference)
  screenOrder: ['logbook', 'tracker', 'home', 'calorie-map', 'insights'], // main screens in tab-bar order (see Carousel Structure)
  screenLoopEnabled: true,          // swiping past either end wraps around
  homePhasePromptEnabled: true,     // Home goal card "Start a phase" footer (Settings -> Home & Tips)
  unitPreferences: { bodyWeight, height, distance, foodWeight, energy }, // display/input units only (see Measurement Units)
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
  recipes: [],                      // User-built foods: ingredients (per100g snapshots) + servings + optional cooked weight; per100g / "1 serving" are derived (see Recipes)
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
  // HR sessions may also carry maxHeartRate, heartRateSource, heartRateCoverage,
  // heartRateZoneSeconds, healthWorkoutId; training adds hrBurnModel (see "Heart Rate")
  cardioSessions: [{ id, date, startTime, startedAt, endedAt, type, duration, intensity, effortType, averageHeartRate?, stepOverlapEnabled? }],
  trainingSessions: [{ id, date, startTime, startedAt, endedAt, type, duration, intensity, effortType, averageHeartRate?, hrBurnModel? }],
  heartRateEntries: [{ date, restingHr, restingHrMethod, avgHr, minHr, maxHr, wakingAvgHr, vo2Max, updatedAt }],
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
      goalTarget,                   // Daily balance target this day was judged against (kcal, positive = deficit; includes an active phase's smart delta); null on legacy snapshots
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
      restingHr, restingHrMethod, avgHr, maxHr, vo2Max, // flat; null = no reading
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
{ id: 1699876543210, foodId: 'chicken_breast', name: 'Chicken Breast',
  grams: 174, calories: 287, protein: 54, carbs: 0, fats: 6.3,
  fiber: 0, sodium: 65, saturatedFats: 1.4, sugars: 0,   // optional micros
  timestamp: 1699876543210 }                             // ISO string or epoch ms
```

**`id` is unique within its day, and the store guarantees it** (`utils/food/entryIds.js`): `addFoodEntry` keeps a requested id only if no entry that day has it (`resolveEntryId`), and `normalizeNutritionData` renumbers repeats left by older builds on load (`repairDayEntryIds` - deterministic, because the repair is only written back when that day next changes).

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

**Deployment shape (API-only):** the Vercel project ships **only** the `api/` functions. the 404s come from a `routes` block alone - `/api/(.*)` proxied to the function, then `/(.*)` returning `status: 404` - and because routing is evaluated **before** file serving, every non-API path 404s regardless of what the build produced. Never add `framework` / `buildCommand` / `outputDirectory` overrides: setting them (even to `null`) stopped the deployment from landing. There is no public web app (distribution is native iOS/Android only; the web target is dev-only). The native app bundles `dist/` itself through `npx cap sync`. **Never rename, move or delete the project, and never change `calorieintaketracker.vercel.app`:** that host is the baked-in default base URL behind the three `VITE_*_API_BASE` defaults as well as `/api/usda` (legacy alias for shipped builds), so the domain is a hard compatibility contract with installed apps.

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
- Stage timing/budget constants are the single source of truth in `services/ragBudget.js` (`RAG_TIMING`, `resolveRagStageTimeoutMs`, `RAG_MAX_DEFERRED_GROUNDING_ENTRIES`, `RAG_GROUNDING_BATCH_MAX_NAMES`, `RAG_LOOKUP_CONCURRENCY_LIMIT`, `assertRagTimingInvariants`) — do not hardcode per-stage timeout values in callers. The grounding batch budget invariant derives its worst case from the chunk waves (`ceil(maxDeferred / maxBatchNames)`), so both constants must move together.
- Reason codes (user-facing messages, recovery hints, chip labels) are centralized in `services/foodLookupReasons.js` and re-exported by `services/foodLookupContext.js`.

**Serverless security/env configuration (`api/openrouter.js`):**
- CORS allowlist is driven by `ALLOWED_ORIGINS` (or singular fallback `ALLOWED_ORIGIN`).
- Payload guards are enforced server-side (`messages` count + serialized payload size cap).
- Per-IP throttling via Upstash REST - the only control that bounds LLM spend, and a no-op unless BOTH credentials are set:
  - `UPSTASH_REDIS_REST_URL`
  - `UPSTASH_REDIS_REST_TOKEN`
  - `OPENROUTER_RATE_LIMIT_MAX_REQUESTS` (default `60`; production uses `15` to mirror the client budget)
  - `OPENROUTER_RATE_LIMIT_WINDOW_SECONDS` (default `60`)
  - `OPENROUTER_RATE_LIMIT_FAIL_CLOSED` (`true`/`false`, default fail-open; production sets `true`)
- The bucket key comes from `resolveClientIp(...)`: `x-real-ip` first, then the **LAST** `x-forwarded-for` hop, then the socket address. `x-forwarded-for` is client-appendable, so its first entry is forgeable - keying on it lets a caller mint a fresh bucket per request and bypass the limit. Never move the XFF fallback back to index `0`.
- A CORS origin allowlist is not a security boundary on its own: any client can forge `Origin`, and the native app legitimately runs from `capacitor://localhost` / `https://localhost` (both always allowed, plus `http://localhost:*` and `127.0.0.1` for local dev).
- Optional per-mode output token overrides:
  - `OPENROUTER_MAX_TOKENS_EXTRACTION`
  - `OPENROUTER_MAX_TOKENS_PRESENTATION`
  - `OPENROUTER_MAX_TOKENS_GROUNDING`
- The upstream OpenRouter call is aborted server-side (`OPENROUTER_UPSTREAM_TIMEOUT_MS`, default `28000` — just under the client's 30s stage timeout) and returns `504` on timeout, so a slow model cannot keep burning spend after the caller has given up.
- Model/env controls remain:
  - `OPENROUTER_API_KEY` (required)
  - `OPENROUTER_MODEL` (default extraction/presentation model; prefer a **non-reasoning** instruct model — reasoning tokens count against `max_tokens` and push the structured parser toward truncated payloads, which trigger the client's malformed-parser retry, another billable call)
  - `OPENROUTER_GROUNDING_MODEL` (grounding mode default override)
  - `OPENROUTER_FALLBACK_MODELS` (optional comma-separated failover models)
  - `OPENROUTER_GROUNDING_FALLBACK_MODELS` (optional grounding-specific failover models)

**Mode behavior notes:**
- Per-mode temperatures: extraction `0.3` (structured JSON parsing stays deterministic), presentation `0.5` (prose), grounding `0.2` (retrieval). Do not raise extraction back to `0.5` without measuring the malformed-parser retry rate.
- Extraction instruction biases toward **conservative entries with explicit assumptions** over clarification whenever the food is identifiable — the constrained-prompt retry is the escape hatch for genuinely ambiguous messages, not the common path.
- Clarification payloads carry a top-level `lookupTerms` array (normalized by the client parser into `foodParser.lookupTerms`) so the grounded fallback gets a clean whole-word food query instead of the raw user text.
- Grounding entries are **portion-aware**: `grams` is the model's best estimate of the described portion (default 100) and the client rescales the returned values to the per-100g baseline + `portionGrams` (`buildGroundedEstimateFromEntry`). Grounding entries may also carry the optional micro nutrients (fiber/sodium/saturatedFats/sugars, omit-when-unknown), passed through null-preserving end-to-end.

**Policy requirements:**
- Use **conservative estimation** when uncertainty materially affects calories/macros.
- Prefer **conservative entries with explicit assumptions** whenever a reasonable estimate is possible; reserve the one highest-impact clarification question for requests where no reasonable default exists.
- Do not invent foods/add-ons not explicitly mentioned or clearly visible.
- Preserve machine payload contract exactly (`<food_parser_json>...</food_parser_json>` schema; the v1.1 additions — top-level `lookupTerms` on clarification, grounding portion/micros — were coordinated parser+test updates and must stay in sync with `normalizeFoodParserEntryV1Dot1` / `parseFoodParserPayloadFromText`).

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
- `warmUpFoodCatalog()` — initialises the sql.js WASM engine + fetches/parses the bundled SQLite DB + primes the `foods` table-column detection (best-effort, singleton-backed; failures fall back to the lazy first-query path). Called from `hooks/useFoodCatalogWarmUp.js` during idle time after hydration so the first Food Search open does not pay all of it at once. The import in that hook must stay **dynamic** — a static import anywhere on the boot path would pull the catalog back into the eager bundle.

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

## Step Sync Integration (`hooks/useHealthConnect.js`)

Native step data sync via `@capgo/capacitor-health` on **both** native platforms: Health Connect on Android, HealthKit on iOS. The hook is gated by `isAndroid() || isIOS()` from `src/utils/platform.js` — never by an inline `Capacitor.getPlatform() === 'android'`.

**Status lifecycle:** `'unavailable'` → `'not_installed'` → `'disconnected'` → `'connecting'` → `'connected'` | `'error'`

Returns `{ status, steps, lastSynced, isLoading, error, connect, refresh, disconnect, openSettings, writeTestData }`.

- Status vocabulary and the brand name are canonical in `src/constants/health/healthSources.js` (`HealthConnectStatus`, `getHealthSourceName()` → `'Apple Health'` on iOS, `'Health Connect'` elsewhere). Both the hook and `CalorieMapScreen` read them from there — the screen used to keep an inline copy that could drift. Do not re-declare either.
- `openSettings()` — Opens Health Connect settings on Android; on iOS it is an explicit no-op with an info log (the plugin documents the method as Android-only and Capacitor exposes no API for launching the Health app).
- `writeTestData()` — Android-only debug helper (writes 1000 test steps). iOS is read-only, so it returns `false` without touching the plugin.
- Step aggregation uses max-per-source strategy to prevent double counting from multiple health apps (on iOS this covers iPhone + Apple Watch).
- Auto-refreshes on app foreground via `App.addListener('appStateChange')` on both platforms.
- Read windows are built through `buildHealthConnectStepReadWindow()` in `src/utils/healthConnectWindow.js`; keep that helper the single source of truth for explicit `startDate`/`endDate` normalization and strict `end > start` validation.
- `fetchSteps()` must use the **today-scoped window** (`buildHealthConnectStepReadWindow()`, local midnight → now) as the primary read path. The plugin's native default range is a rolling 24 hours and would include previous-day steps in today's live count, so it must only be used as a degraded fallback when the explicit today window fails. If all reads fail, return `null` and degrade gracefully rather than throwing a connection error into the live card flow.
- Step aggregation is centralized in `aggregateStepsBySource()` in `src/utils/healthConnectWindow.js`; use it for all read paths (today-scoped, native default, and rolling fallback) to keep max-per-source dedup consistent.

**Platform differences that are load-bearing:**

- **Scope request:** `buildPermissionRequest()` asks for `{ read: ['steps'], write: ['steps'] }` on Android and `{ read: ['steps'] }` on iOS. iOS is deliberately **read-only** — no `NSHealthUpdateUsageDescription` in `Info.plist` and no HealthKit share entitlement — so a write scope would prompt for a capability the app cannot use. Omitting `write` is safe: the plugin's Swift side defaults a missing array to `[]` for both `requestAuthorization` and `checkAuthorization`.
- **Availability:** `NOT_INSTALLED` is Android-only (Health Connect is a separate Play Store app). On iOS `isAvailable() === false` means HealthKit does not exist on the device (iPad, or restricted) and must map to `UNAVAILABLE`, because there is nothing the user could install.
- **Authorization semantics (iOS):** HealthKit never reveals whether READ access was granted (deliberate Apple privacy design). The plugin maps `getRequestStatusForAuthorization` (`unnecessary` → authorized), so `checkAuthorization()` answers *"has the user already been asked?"* — exactly what `initialize()` needs to avoid re-prompting on every launch. A user who denied access still reads back as authorized and simply gets zero samples; that is a HealthKit limitation, not an app bug to paper over.
- **Entitlement:** HealthKit requires `ios/App/App/App.entitlements` (`com.apple.developer.healthkit`), wired through `CODE_SIGN_ENTITLEMENTS` in both App build configs. When it is absent (e.g. an unsigned build) the plugin fails with `Missing com.apple.developer.healthkit entitlement` and the hook degrades to `UNAVAILABLE` — this path must never crash the app.

Always returns `'unavailable'` on **web** (and on any native platform that owns no health store). Status constants live in `src/constants/health/healthSources.js`. Availability mapping (UNAVAILABLE vs NOT_INSTALLED) is shared with the heart-rate sync through `services/healthBridge.js` (`resolveHealthAvailability`).

---

## Heart Rate

Heart rate is woven into the calorie system **conservatively**: it refines what already exists (session burns, EPOC intensity) and adds display-only context; it never invents an all-day burn. **BMR is never touched and NEAT is never changed automatically.** A user with no HR data gets byte-identical numbers to before — pinned by the golden regression (`tests/utils/heartRateGolden.test.js`).

### Sources

| Source | Module | Yields |
|---|---|---|
| Watch sync (Health Connect / Apple Health, read-only) | `services/heartRateSync.js` + `services/heartRateHealth.js`, lifecycle `hooks/useHeartRateSync.js` | Daily resting HR (device record, else **estimated** = lowest hourly average), daily avg/min/max, waking-hours HR, VO2 max readings |
| Manual morning resting HR | `RestingHeartRateEntryModal` → store `setManualRestingHeartRate` | `restingHrMethod: 'manual'` |
| Workout import (prefill only) | `common/ImportWorkoutButton` in the cardio/training form headers, `HealthWorkoutImportModal` | Type, start time, duration and, when the watch recorded one, the time-weighted average HR, peak, coverage and zone seconds for the user to review and save |
| Live BLE sensor (0x180D) — **built but dormant** | `services/heartRateSensor.js`, `LiveHeartRateSessionModal`, `HeartRateSensorPairingModal` | Live bpm, recorded session summary. **No form offers it today**: live cardio/training sessions are a later addition, so the live view is only reachable from the header pill while a recording runs (which nothing starts yet) |
| Camera pulse (experimental) | `services/cameraPulse.js` + pure `utils/calculations/pulseSignal.js` | One resting reading; refuses low-quality signals |

### Data

- **`userData.heartRateEntries`** (history, Dexie, sharded `heartRateEntries:YYYY-MM-DD`, date-sorted array): `{ date, restingHr, restingHrMethod: 'device'|'manual'|'estimated'|null, avgHr, minHr, maxHr, wakingAvgHr, vo2Max, updatedAt }`. Every value nullable (`null` = unknown, never zero-filled); an entry with no value is dropped. Normalizers/merge live in `utils/measurements/heartRate.js` (`normalizeHeartRateEntry`, `sortHeartRateEntries`, `mergeSyncedHeartRateEntry`, `applyManualRestingHeartRate`, `getRestingHrSeries`, `resolveRestingHrTrendFamily`).
- **Profile fields:** `maxHeartRateCustom` (120–230 or `null` = auto), `vo2MaxCustom` (15–90 or `null`), `heartRateSyncEnabled`, `heartRateSensor` (`{ deviceId, name }`). Invalid values set through `handleUserDataChange` clear to auto.
- **Session fields (optional):** `averageHeartRate` (canonical, priced), `maxHeartRate`, `heartRateSource` (`manual`|`healthConnect`|`ble`), `heartRateCoverage` (0–1), `heartRateZoneSeconds` ([z1..z5]), `healthWorkoutId` (dedupes imports), and **training only** `hrBurnModel` (`'keytel'`|`'intensity'`; missing = `'keytel'`). Helpers: `utils/calculations/sessionHeartRate.js`.
- **Snapshot fields (flat):** `restingHr`, `restingHrMethod`, `avgHr`, `maxHr`, `vo2Max` (`buildSnapshotHeartRateFields`).
- **Bounds** for every HR value are canonical in `constants/health/heartRate.js` (session 60–220, resting 30–120, max 120–230, daily 25–240, VO2 15–90); every normalizer **rejects** out-of-range values instead of clamping.

### Engine (`utils/calculations/heartRate.js`, pure)

- `resolveHeartRateProfile(userData, dateKey)` → `{ maxHr, maxHrSource, legacyMaxHr, restingHr, restingHrFamily, hasPersonalZones, hrReserve, vo2Max, … }` **as of the date** (no later data leaks back). Max HR = custom ?? max(Tanaka `208 − 0.7·age`, observed session peaks — observed only RAISES, needs ≥3 sessions, spikes > Tanaka+20 ignored). Resting baseline = 7-day trapezoidal (fallback 14-day) over ONE method family. **Personal zones** need ≥3 resting readings in 14 days and a reserve ≥40 bpm. Memoized per `(heartRateEntries, cardioSessions, trainingSessions)` reference + date + scalars.
- `resolveHeartRateIntensity({ heartRate, profile })`: personal zones → %HRR with ACSM cutpoints (light <40 %, moderate 40–59 %, vigorous ≥60 %); otherwise the **exact legacy rule** (0.70 / 0.85 of `220 − age`, or of a custom max).
- `resolveHeartRateZones` (5-zone Karvonen, or %max without a baseline), `getHeartRateZone`, `describeHeartRateLoad`.
- `computeTimeWeightedHeartRate` (trapezoid; gaps >120 s excluded, never interpolated; sparse samplers fall back to a plain mean with `method: 'sparse'`), `selectPrimaryHeartRateSource` (one source, never a blend), `estimateRestingHrFromHourly`, `calculateRestingHrTrend` (single family, ≥7 readings), `computeWakingHeartRate`, `assessNeatFromHeartRate`, `assessAdaptiveThermogenesisPhysiology`, `parseHeartRateMeasurement` (BLE 0x2A37).

### How it reaches TDEE

| Component | Effect |
|---|---|
| BMR | none |
| NEAT | none automatically; `assessNeatFromHeartRate` feeds a **chip** in `DailyNeatOverrideModal` that only stages the next preset (waking HR outside logged sessions ≥8 bpm above its 28-day median and steps not above theirs → up; ≤−6 → down; needs ≥14 baseline days) |
| Cardio (HR) | Keytel; with a VO2 max as of the session date (custom, or a watch reading ≤180 days old) the Keytel **VO2-max** equation |
| Training (HR) | `hrBurnModel: 'intensity'` (all NEW HR sessions): HR picks the level, the type keeps its kcal/hr. Legacy sessions (no marker) stay on Keytel; editing one keeps its stored model (`getStoredTrainingHrBurnModel`) |
| EPOC | intensity from `resolveHeartRateIntensity` with the profile **as of the session's own date**; `details.heartRateIntensity` records `{ percent, model }` |
| Step overlap | HR sessions ignore their stale stored intensity |
| AT | none on the number; the Smart tab shows a display-only "Physiology check" (resting-HR drift vs correction, measured readings only) |

### Sync rules (`services/heartRateSync.js`)

- Module singleton status (`useHeartRateSyncState`), lifecycle in `useHeartRateSync({ isLoaded })` (mounted once in the orchestrator): init after hydration, refresh on native foreground. Pull-based, never polls.
- Read types: `['heartRate', 'restingHeartRate', 'vo2Max', 'workouts']`, read-only on both platforms; HR denied → not connected; RHR denied → estimated method; iOS reads every type it asked for (HealthKit cannot report read grants).
- Daily data is read **one local day per call** (`buildLocalDayReadWindow`, DST-safe: a day is 23/25 h when it must be) — never a multi-day `bucket: 'day'` aggregate. Routine sync = yesterday + today; first sync back-fills 30 days (Android, Health Connect's cap) / 90 (iOS).
- `saveHeartRateEntries` merges field-by-field (a **manual resting HR is never overwritten**) and refreshes only **existing** snapshots from the earliest changed date to today via `upsertDailySnapshots(dateKeys, { onlyIfExisting: true })` — a synced day the user never tracked must never get a snapshot (it would carry intake 0).

### Surfaces

- **Insights:** `common/RestingHeartRateCard.jsx` (after Body Composition, before the AT card) uses the **same card grammar as `AdaptiveCorrectionCard` / `RollingBalancePreviewCard`**: `p-5 md:p-6` card, 30px `accent-blue` icon + bold title + muted subtitle ("7-day average · today 61 (manual)" — it may wrap to two lines so the measurement method is never truncated), the baseline as the headline on the right (the shared `common/InsightHeadline` — a large 25.3px bold value with a small muted unit, so "kcal/day" never crowds a title; the Adaptive Thermogenesis card uses it for a real correction, and its title wraps to two lines at 390px only in the widest "-250 kcal/day" state; a state with no number — "Off" / "No data" / "Inactive" — is shown as a small `InsightStatus` chip, never in the headline type), two stat tiles (Max HR, Zone 2) and an `accent-blue/80` footer with a chevron ("Trend after 7 readings" / the uncoloured 28-day change, then "— tap for details"). No sparkline: the chart lives in the tracker. The empty state keeps the header and offers a manual reading / connect. Keep new Insights cards on this grammar.
- **`HeartRateTrackerModal`** (fullscreen, lazy): 30d / 90d / 12m, gap-aware runs, the shared `TrackerSelectionCard` (vs prev / vs 7d avg via the generic weight.js helpers on a **pre-filtered single-family series**), re-tap to edit, zones card, sync row.
- **Cardio / Training forms are manual.** Sessions are entered by hand: there is **no "Use watch data" and no "Record live"** in the forms (do not re-add them without the live-session feature). `common/SessionHeartRatePanel.jsx` is display-only under the HR button (zone chip, provenance, peak/coverage, time-in-zone bar). The only watch affordance is `common/ImportWorkoutButton.jsx`: an **Import** button in the form header row, **beside Favourites** (the header wraps under the title on narrow screens), shown only while HR sync is connected and never in favourite-template mode. It prefills the draft from a picked workout (the watch's own kcal is shown for reference only and never copied) and reports a one-line result under the header. Estimates price with the full `userData` so they match the breakdown.
- **Live recording (dormant — no entry point from the forms):** `LiveHeartRateSessionModal` + `LiveHeartRatePill` in `AppHeader` (subscribes to the sensor singleton itself, so a beat never re-renders the orchestrator). "Finish" fills the form via `applyLiveRecordingToDraft`; an app-kill checkpoint (Preferences, every 30 s) is offered back through `ConfirmActionModal` on the next launch.
- **Also:** Home / Day Ledger session rows (`· Z3` + source glyph), Day Ledger "Resting HR" row, `CalorieBreakdownModal` per-session lines (intensity model, VO2), Phase Detail + exports (`restingHrStart/End/Change`, a HEART RATE CSV block), Settings → Profile & Health "Heart rate".

### Platform

- **Android** (`android/app/src/main/AndroidManifest.xml`): exactly READ_STEPS / WRITE_STEPS / READ_HEART_RATE / READ_RESTING_HEART_RATE / READ_VO2_MAX / READ_EXERCISE / READ_HEALTH_DATA_IN_BACKGROUND; every other plugin-merged health permission is `tools:node="remove"`d (keep the Play Console Health Connect declaration in sync). Privacy policy = the plugin's `PermissionsRationaleActivity` + alias loading `public/privacypolicy.html` — never re-declare those intent filters elsewhere. BLE: `BLUETOOTH_SCAN` (`neverForLocation`) + `BLUETOOTH_CONNECT`; location only ≤ API 30. Camera declared for the barcode scanner + camera pulse.
- **iOS** (`Info.plist`): `NSHealthShareUsageDescription` names steps, heart rate, resting HR, VO2 max and workouts (still no update description: read-only); `NSBluetoothAlwaysUsageDescription`; camera string covers the pulse reading. No background modes: live recording is foreground + keep-awake, gaps are excluded and shown as coverage.
- **Bundle:** both community plugins are dynamically imported by `services/heartRateSensor.js`; `vite.config.js` keeps `@capacitor-community/*` out of `chunk-capacitor`.

## Notification Subsystem (Layer 1 Local + Layer 2 Remote Push)

Two-layer design that keeps personal tracking reminders 100% on-device while supporting optional anonymous broadcast announcements:

- **Layer 1 (On-device, `@capacitor/local-notifications`):**
  - Constants, Android channels (`energy_map_reminders`, `energy_map_insights`, `energy_map_workouts`, `energy_map_announcements`), deterministic ID ranges (`1000–2900`), deep-link routes (`NOTIFICATION_ROUTES`), and settings normalizer live in `src/constants/notifications/notificationConfig.js`.
  - Pure planner in `src/utils/notifications/notificationPlanner.js` (`buildNotificationPlan`, `findUnimportedHealthWorkouts`, `buildLiveHrGuardNotifications`) computes a rolling 7-day schedule capped at `MAX_PENDING_LOCAL_NOTIFICATIONS = 60` (under iOS's 64-notification hard limit), applies quiet hours shifting, smart-skips already-logged weigh-ins/meals/steps/NEAT overrides, and reuses canonical calculation helpers (`calculateRollingEnergyBalance`, `getAdaptiveThermogenesisSmartModeDataStatus`, `resolveCardioSessionEpoc`, `resolveTrainingSessionEpoc`).
  - Covers: morning weigh-in, weekly body fat check-in (when `bodyFatTrackingEnabled`), meal nudges (breakfast/lunch/dinner), evening ledger close-out, daily NEAT check-in, phase lifecycle milestones, one-shot Smart AT unlock (`meta.atUnlockNotified`), weekly rolling energy balance digest, stale weigh-in warning (active phase or Smart AT), EPOC post-workout refuel, step goal close-out, unimported health workouts (wired in `services/heartRateSync.js`), and live BLE HR recording guard (ongoing banner + 2.5h forgot-to-stop alert). Local backup reminders are intentionally omitted.
  - Uses **opt-in exact scheduling** (`allowWhileIdle: true`): silent reconciles stay inexact (`isExactNotification: false`) until the user grants Android's *Alarms & reminders* (`SCHEDULE_EXACT_ALARM`, merged from `@capacitor/local-notifications`), at which point `reconcileNotifications()` upgrades scheduled reminders (and the 2.5h live HR forgot alert) to `isExactNotification: true` (`setExactAndAllowWhileIdle`). Native `NotificationReliabilityPlugin` (Android `WorkManager` + `PowerManager.isIgnoringBatteryOptimizations`, iOS `HKObserverQuery` + `com.apple.developer.healthkit.background-delivery`) surfaces battery-optimization prompts on Android and detects unimported workouts while the app is closed.
- **Layer 2 (Remote push, `@capacitor/push-notifications`):**
  - Opt-in only (`notifications.remotePush.announcementsEnabled`).
  - Anonymous `installation_id` UUID + registration cache live in standalone Capacitor Preferences keys (`services/pushRegistration.js`), **never** in `userData` or JSON exports.
  - Registers/unregisters against Upstash-rate-limited `/api/push/register` and `/api/push/unregister`, which call narrow `SECURITY DEFINER` RPCs (`register_push_device` / `unregister_push_device`, `SET search_path = ''`, returning `void`) using `SUPABASE_ANON_KEY` + server-only `PUSH_RPC_SECRET` verified against `private.push_config` (`scripts/push/push_devices.sql`). `public.push_devices` carries a nullable `user_id` FK to `auth.users(id)` for future Auth readiness, enables RLS, and revokes all table privileges from `anon`/`authenticated`. `SUPABASE_SERVICE_ROLE_KEY` **never** lives on Vercel; only the maintainer's local CLI (`scripts/push/send-announcement.js`) uses it.
- **Service, Hook & Settings UI:**
  - `services/notificationBridge.js` dynamically imports both Capacitor plugins (`vite.config.js` keeps them out of `chunk-capacitor`).
  - `services/notifications.js` (module singleton + `useNotificationState()`) owns permission state, channel creation, idempotent diff-and-reconcile scheduling, test notifications, and cold-start tap buffering.
  - `hooks/useNotifications.js` (mounted once in `EnergyMapCalculator.jsx`) reconciles on hydration, debounced store updates, `appStateChange`, and live HR sensor transitions, routing notification taps to the target screen/modal.
  - Settings page: `NotificationsSettingsSection.jsx` inside `SettingsModal.jsx`, reusing `TimePickerModal` for all time chips.

---

13. **Platform divergence is centralized in `utils/platform.js`.** `getPlatform` / `isNative` / `isIOS` / `isAndroid` are the only sanctioned way to branch on platform; they read the bridge lazily (never at module scope) and `isIOS()`/`isAndroid()` are additionally native-gated. Each platform may only call the plugin APIs it owns — themed through per-platform appliers in `utils/theme.js` (iOS keeps `StatusBar.setOverlaysWebView({ overlay: true })` because the app renders its own status-bar vignette and derives every inset from `env(safe-area-inset-*)`; Android insets the WebView and paints an opaque bar), the `backButton` listener is Android-only (`hooks/useHardwareBackButton.js`), the iOS-only `Keyboard.setResizeMode`/`setScroll` calls are gated in `main.jsx`, and export delivery splits web-download vs native share sheet in `services/fileShare.js`. **Gating beats try/catch:** an `await` that always rejects is a silent per-launch failure nobody notices. New platform branches must consume these helpers instead of hand-writing `Capacitor.getPlatform()` comparisons.
14. **iOS HealthKit is read-only and has different authorization semantics.** The health bridge (`hooks/useHealthConnect.js`) runs on both native platforms; iOS requests `{ read: ['steps'] }` only (no `NSHealthUpdateUsageDescription`, no HealthKit share entitlement) and treats HealthKit-unavailable as `UNAVAILABLE`, never `NOT_INSTALLED`. HealthKit cannot report whether READ access was granted, so `checkAuthorization` answers "has the user already been asked?" — see the Step Sync Integration (`hooks/useHealthConnect.js`) section of this document for the full contract. The capability lives in `ios/App/App/App.entitlements` and only takes effect in a **signed** build.

15. **The five carousel screens are `React.memo`-wrapped with stable props.** The orchestrator's local state churn (modal opens, drafts, pickers — ~80 `useState`) no longer reconciles all five screens per render. This is load-bearing: new props passed to a screen must be reference-stable (`useCallback`/`useMemo`/module constants), not inline object/array/function literals — an unstable prop silently defeats the memo for that screen. (Known exception: `TrackerScreen` receives the `calendarModal` hook object, whose identity is per-render, so its memo compare misses on that prop until the modal state is flattened into primitive props.)

16. **Food-catalog initialisation is warmed up during idle time.** `hooks/useFoodCatalogWarmUp.js` (mounted once in the orchestrator, after `isLoaded`) schedules a `requestIdleCallback` (setTimeout fallback on WKWebView/jsdom) dynamic import of `services/foodCatalog` + `warmUpFoodCatalog()` a few seconds after hydration, so the first Food Search open does not pay the sql.js WASM compile + 2.2 MB SQLite parse at once. The import must stay **dynamic** — a static import anywhere on the boot path would pull the catalog back into the eager bundle. Failures are swallowed on purpose: the lazy first-query path remains the fallback.

## File Organization

```
src/
├─ components/EnergyMap/
│   ├─ EnergyMapCalculator.jsx   # THE orchestrator (4,675 lines; lazy-loads heavy modals)
│   ├─ common/
│   │   ├─ ModalShell.jsx        # Core modal wrapper (singleton managers)
│   │   ├─ FoodTagBadges.jsx     # Shared food tag/source badge renderer
│   │   ├─ DualWheel.jsx         # Two scroll wheels for one value (stone + lb, ft + in, tenths, kJ hundreds)
│   │   ├─ MicroStat.jsx         # One micronutrient readout (`Fiber: 5.3g`; null = untracked) shared by Tracker + Food Portion modal
│   │   ├─ SegmentedToggle.jsx   # Sliding-pill segmented control (the Food Search Local | Online grammar): one persistent pill, composited transform glide, per-segment pill colour
│   │   ├─ TrackerSelectionCard.jsx # Shared tracker day/month detail card (fixed top-centre slot, no measured tooltip) + TrackerCardMetric
│   │   ├─ AppHeader.jsx         # Header zone (greeting, per-screen stat line, swipe dots, coach mark, settings gear)
│   │   └─ ScreenTabs.jsx        # Fixed floating glass bottom tab bar (drag-linked active circle)
│   ├─ modals/                   # 68 modal files in 6 subfolders + 6 fullscreen panel components
│   │   ├─ fullscreen/           # Full-screen takeover modals (WeightTracker, BodyFatTracker, StepTracker, Settings, FoodSearch, RecipeIngredientPicker)
│   │   ├─ pickers/              # Scroll-wheel value pickers (Age, Calendar, Height, MealType, etc.)
│   │   ├─ info/                 # Read-only info/reference sheets (AdaptiveThermogenesisInfo, BmiInfo, BmrInfo, CalorieBreakdown, TefInfo, etc.)
│   │   ├─ forms/                # Data entry & editing dialogs (Cardio, Goal, PhaseCreation, WeightEntry, etc.)
│   │   │                        #   AddCustomFoodModal = Food | Recipe; RecipeIngredientsSection = its Recipe body (section, not a modal)
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
│   ├─ units/
│   │  └─ units.js              # Unit options, defaults, presets (Metric/US/UK) + preference normalizer
│   ├─ navigation/
│   │  └─ screens.js             # The five main screens: keys, labels, default order + order normalize/swap/move
│   ├─ goals/
│   │  ├─ goalDefinitions.js     # THE goal-size table: calorie change + weekly weight band per goal,
│   │  │                         #   resolveGoalForDailyDelta (pure; no React)
│   │  └─ goals.js               # Goal labels, colours, icons (UI)
│   ├─ meal/
│   │  └─ mealTypes.js           # MEAL_TYPE_ORDER + meal type helpers
│   ├─ phases/
│   │  └─ phaseTemplates.js      # Phase creation templates
│   ├─ nutrients/
│   │  └─ nutrients.js           # Canonical micro nutrients (fiber/sodium/saturatedFats/sugars): units, clamps,
│   │                            #   source-scoped soft invariants, OFF sodium conversion, totals/coverage helpers
│   ├─ health/
│   │  ├─ healthSources.js       # Health-store vocabulary shared by the bridge hook and the UI
│   │  │                         #   (HealthConnectStatus + getHealthSourceName → "Apple Health"/"Health Connect")
│   │  ├─ heartRate.js           # Canonical HR bounds (session/resting/max/daily/VO2) + normalizers,
│   │  │                         #   resting-HR methods, 5-zone model + zone accent classes
│   │  └─ workoutTypeMap.js      # Health workout type -> cardio type key (+ strength set)
├─ hooks/
│   ├─ useUnits.js               # Unit formatter for the current preferences (see Measurement Units)
│   ├─ useAnimatedModal.js       # Modal lifecycle (isOpen/isClosing/requestClose)
│   ├─ useHardwareBackButton.js  # Android back handling (home-first + double-exit; registers nothing on iOS)
│   ├─ useSwipeableScreens.js    # 5-screen horizontal carousel (edge peek, compositor settles, drag-progress vars)
│   ├─ useCarouselDragVarSink.js # Registers a chrome element as a sink for the shell's live drag vars
│   │                            #   (tab bar / header dots) so a drag frame never invalidates :root
│   ├─ useHealthConnect.js       # Step sync bridge (Health Connect on Android, HealthKit read-only on iOS)
│   ├─ useHeartRateSync.js       # Heart-rate sync lifecycle (init after hydration, refresh on foreground)
│   ├─ usePortionCardFlight.js   # Food Portion modal hero transition (clone flies from the tapped result card; layout-effect driven, no state)
│   ├─ useMotionMode.js          # Resolved motion mode + `useReducedMotionPreference()` (drop-in for framer's device-only `useReducedMotion`)
│   ├─ useKeyboardGlide.js       # Smooths a centred modal's jump when the Android window resizes for the keyboard (FLIP via `translate`; iOS uses CSS transitions in ModalShell)
│   ├─ useKeyboardVisible.js     # App-wide keyboard state (Capacitor events + visualViewport;
│   │                            #   publishes `--keyboard-inset` on :root; singleton)
│   ├─ useFoodBrowser.js         # Stateful Food Search-style browse (Local + Online, filters, paging, derived loading) for the recipe ingredient picker;
│   │                            #   its pure half is utils/food/foodListing.js
│   ├─ useFoodCatalogWarmUp.js   # Idle warm-up for the local food catalog (sql.js WASM + bundled SQLite);
│   │                            #   dynamic import only — must never enter the boot-critical bundle
│   └─ useNetworkStatus.js       # Online/offline detection
├─ store/
│   └─ useEnergyMapStore.js      # Zustand store: state, actions, derived values, persistence
│                                #   calculateBreakdown(steps, isTrainingDay, options?) — options.tefContext + options.adaptiveThermogenesisContext forwarded to core calc
│                                #   calculateTargetForGoal(steps, isTrainingDay, goalKey, options?) — 2-pass refinement for target TEF mode (shared calculateGoalSeededBreakdown helper)
│                                #   buildDailySnapshot consumes buildDisplayTefContext + calculateGoalSeededBreakdown so the recorded TDEE matches the live target path
│                                #   goalDailyBalanceTarget — derived phase-lock-aware goal daily balance target (positive = deficit)
├─ utils/
│   ├─ calculations/
│   │  ├─ calculations.js        # Core calorie formulas — BMR/cardio/training/TDEE/TEF
│   │  ├─ adaptiveThermogenesis.js # Adaptive thermogenesis mode resolution + staged ('crude')/smart correction engine
│   │  ├─ dailySnapshots.js      # Derived daily snapshot builder + equality helpers
│   │  ├─ rollingEnergyBalance.js # Rolling energy-balance calculator (3/7/14/28-day windows; consumes snapshot tdee/intake)
  ├─ dayLedgerPresentation.js # Daily Ledger display-model builders (read-only snapshot projections;
  │                           #   buildDayLedgerDetailModel = full day model for DayLedgerModal)
│   │  ├─ epoc.js                # Session EPOC estimate + carryover window resolution
│   │  ├─ heartRate.js           # HR engine: as-of-date profile, %HRR intensity, zones, time-weighted
│   │  │                         #   session HR, source selection, resting estimate/trend, NEAT advisory,
│   │  │                         #   AT physiology check, BLE 0x2A37 parser
│   │  ├─ sessionHeartRate.js    # Session HR fields (manual/summary/clear/sanitize, hrBurnModel, workout import)
│   │  ├─ pulseSignal.js         # Camera PPG pulse estimate (autocorrelation; quality-gated)
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
│   │                            #   identity-diffed incremental saves (per-field ref + per-shard (sourceRef, order));
│   │                            #   primePersistenceBaseline / resetPersistenceTracking / diffShardedHistoryField
│   ├─ measurements/
│   │  ├─ bodyFat.js             # Body fat validation, trend analysis, sparklines, trapezoidal N-day averages
│   │  ├─ heartRate.js           # Daily HR entries: normalize/sort, synced merge (manual-safe), manual set/clear,
│   │  │                         #   single-family resting series
│   │  ├─ profile.js             # Age/height sanitization helpers (sanitizeAge, sanitizeHeight, AGE/HEIGHT min/max constants)
│   │  └─ weight.js              # Date normalization, weight clamping, sorting, trend analysis (capped fallback), sparklines,
│   │                            #   calculateTrapezoidalWindowAverage + tracker entry deltas
│   │                            #   (getPreviousEntryDelta / getWindowAverageDeviation / formatSignedDelta)
│   ├─ food/
│   │  ├─ aiCategory.js          # Shared AI entry category resolver (food-type -> matched food -> macro inference; null = unknown)
│   │  ├─ aiFinalizedEntryState.js # Finalized chat entry card state (calm primary badges + disclosure chip labels)
│   │  ├─ foodPresentation.js    # Food display naming helpers (brand + name formatting)
│   │  ├─ foodListing.js         # Shared pure listing logic (merge by id, category/subcategory/query filter, relevance + macro sort, pinned-first,
│   │  │                         #   online filters, subcategory options) used by FoodSearchModal AND the recipe ingredient picker
│   │  ├─ foodTags.js            # Canonical food source/type resolver + badge metadata/classes
│   │  ├─ aiPresentationMerge.js # RAG presentation→verified merge guardrails (name rewrite + nutrition integrity)
│   │  ├─ nutrientPicker.js      # Shared numeric-picker field config + value helpers (Manual Entry / Add Custom Food / recipe weights)
│   │  ├─ recipe.js              # Recipes: normalise, totals (full precision, null-honest micros), buildRecipeFood (derived per100g + "1 serving"),
│   │  │                         #   validateRecipeDraft (serving <= 1000 g), favouriteToIngredientFood, buildRecipeIngredient
│   │  ├─ loggedEntry.js         # Logged-entry mapping: AI card → logged nutrition, logged entry → editable fallback food,
│   │  │                         #   resolveFoodForRelog / pickManualRelogIdentity (Recents)
│   │  ├─ recentFoods.js         # Food Search Recents: derived one-row-per-food list, search, day labels
│   │  ├─ entryIds.js            # Per-day unique food entry ids (resolve on add, repair on load)
│   │  └─ portionNormalization.js # AI/lookup portion→grams normalization + per100g scaling helpers
│   ├─ formatting/
│   │  ├─ format.js              # Number formatting (formatOne: 1 decimal place)
│   │  └─ time.js                # Time/duration helpers (normalize, round, format, split)
│   ├─ phases/
│   │  └─ phases.js              # Phase metrics calculation
│   ├─ units/
│   │  ├─ unitFormatter.js       # THE converter/formatter (lb/st, ft+in, mi, oz, kJ); metric output unchanged
│   │  ├─ wheelConfigs.js        # DualWheel configurations for the unit-aware pickers
│   │  ├─ goalDescription.js     # Goal energy change in the user's unit
│   │  └─ aiDisplayUnits.js      # [DISPLAY_UNITS] block + preconverted values for the AI chat
│   ├─ visuals/
│   │  ├─ bezierPath.js          # SVG cubic Bézier curve interpolation + gap-aware chart path runs
│   │  ├─ carouselLoop.js        # Canonical swipe-shell loop math (wrapped offsets/fades, transforms,
│   │  │                         #   teleport tiers, settle planning, interruption clock, ease)
│   │  ├─ carouselDragVars.js    # Registry of the drag-linked chrome elements; the shell writes
│   │  │                         #   --screen-drag-progress/-duration onto them (never :root)
│   │  ├─ keyboardInset.js       # Pure keyboard-inset math (overlay vs window-resized detection)
│   │  ├─ motionPreference.js    # Runtime store for the resolved motion mode (`prefersReducedMotion`, `resolveScrollBehavior`, `setMotionMode`); drives `<html data-motion>`
│   │  ├─ portionTransition.js   # Origin registry + flyCard (clone-and-fly); framework-free, covered in both test tiers
│   │  ├─ modalStack.js          # Modal z-lane allocation + backdrop opacity math (extracted from ModalShell)
│   │  ├─ scroll.js              # Scroll utilities
│   │  └─ trackerHelpers.jsx
│   ├─ theme.js                  # Native theme application (status bar, transparent nav bar, keyboard) — per-platform appliers
│   ├─ platform.js               # Canonical platform resolution (getPlatform/isNative/isIOS/isAndroid); lazy reads
│   ├─ export.js                 # CSV/JSON export generation (delegates delivery to services/fileShare.js)
├─ services/
│   ├─ openrouter.js             # OpenRouter client + mode helpers (extraction/presentation/grounding)
│   ├─ foodCache.js              # Cached food dedupe/trim helpers
│   ├─ foodLookupContext.js      # Batch AI entry lookup context resolver + normalized lookup meta
│   ├─ foodSearch.js             # Local/online-catalog/grounded lookup orchestration + deterministic AI entry resolution
                                 #   (parallel per-term lookups, plural-stemmed token matching, chunked deferred grounding batches)
│   ├─ foodLookupReasons.js      # Canonical lookup reason-code registry (messages, recovery hints, chip labels)
│   ├─ ragTelemetry.js           # RAG telemetry aggregation + diagnostics helpers
│   ├─ ragChatPipeline.js        # Decoupled RAG chat pipeline orchestration (extraction → retrieval → verification → presentation)
│   ├─ ragBudget.js              # Centralized RAG stage timing/budget constants + resolveRagStageTimeoutMs
│   ├─ foodCloud.js              # Supabase catalog online search client
│   ├─ openFoodFacts.js          # OpenFoodFacts barcode lookup client
│   ├─ barcodeScanner.js         # Official Capacitor barcode scanner wrapper
│   ├─ fileShare.js              # Export delivery bridge (web download / native Filesystem+Share sheet)
│   ├─ healthBridge.js           # Shared health-store availability + read-type auth (steps + HR)
│   ├─ heartRateHealth.js        # HR plugin reads: per-local-day aggregates, resting, VO2, session samples, workouts
│   ├─ heartRateSync.js          # HR sync singleton (status store, connect/backfill/refresh/disconnect)
│   ├─ heartRateSensor.js        # Live BLE HR sensor singleton (scan/connect/record/checkpoint; lazy plugins)
│   ├─ cameraPulse.js            # Experimental camera pulse measurement (getUserMedia + torch)
│   └─ foodCatalog.js            # SQLite-backed local food catalog service (sql.js)
├─ tests/                        # UI-tier harness ONLY — setup.js (plugin doubles) + mocks/capacitor.js
│                                #   UI specs live beside their sources as `src/**/*.spec.{js,jsx}` (Vitest)
├─ scripts/
│   └─ food-db/
│      ├─ index.js               # Offline food DB audit/clean/replace pipeline
│      ├─ enrich-nutrients.js    # FDC bulk CSV join -> backfills fiber/sodium/saturated_fats/sugars by fdc_id
│      └─ config/
│         └─ taxonomy.js         # Canonical taxonomy maps + alias/portion sanitation config
└─ tests/                        # Node test runner suite (`node --test`) — repo-root `tests/`, NOT under `src/`
  ├─ helpers/                    # Shared Node-env shims (capacitorShims.js) + README.md (documents both tiers)
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
    ├─ entryDeltas.test.js       # Tracker card entry deltas (vs prev / vs 7d avg) + signed-delta formatting
    ├─ dailySnapshots.test.js    # Snapshot derivation and helper behavior tests
    ├─ dayLedgerPresentation.test.js # Daily Ledger presentation helpers (preview/month summaries)
    ├─ rollingEnergyBalance.test.js # Rolling balance calculator tests (windows, missing/malformed days, expected-vs-actual)
    ├─ phaseLogV2.test.js
    ├─ phaseTargetPlanning.test.js
    ├─ phases.test.js
    ├─ sessionCarryover.test.js
    ├─ steps.test.js
    ├─ foodTags.test.js
    ├─ carouselLoop.test.js      # Swipe-shell loop math (wrap periods, px transform geometry, teleport tiers,
                                 #   settle clock, shortest tab path, ease)
    ├─ keyboardInset.test.js     # Keyboard-inset rule (overlay vs adjustResize, ordering, zoom guard)
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
npm run lint           # ESLint check (flat config, Babel parser, Prettier integration) — strict profile
npm run lint:fix       # Auto-fix lint issues
npm run lint:ci        # CI profile (eslint.ci.config.js): same rules, two pre-existing advisory rules as warnings
npm run format         # Prettier formatting
npm run test           # Node test runner (logic tier)
npm run test:watch     # Node test runner in watch mode
npm run test:coverage  # Node test runner + coverage report (see tests/README.md)
npm run test:ui        # Vitest (jsdom) UI tier — components + hooks (`src/**/*.spec.{js,jsx}`)
npm run test:ui:watch  # Vitest watch mode
npm run test:ui:coverage # UI-tier coverage (components + hooks + modalStack)
```

**Testing notes:**
- Tests use `node --test` with ESM; use explicit `.js` extensions in relative imports for test-executed modules.
- `npm run lint` can include pre-existing warnings in untouched files. Prefer targeted lint for changed files during incremental work, then full lint when practical.
- Storage tests intentionally run with in-memory `window.localStorage` shims in Node context; avoid plugin monkey-patching when possible.
- **Heart-rate golden regression:** `tests/utils/heartRateGolden.test.js` pins the full `calculateCalorieBreakdown` + `buildDailySnapshot` output for the scenarios in `tests/helpers/heartRateGoldenFixture.js` (intensity + in-range HR sessions, EPOC carry-in, step overlap, Smart TEF, crude AT) against `tests/fixtures/heartRateGolden.json`, captured before any heart-rate change and verified identical under local, UTC and America/New_York time zones. Existing fields must not move; new top-level fields are allowed. Re-capture the JSON only for an intended change, naming the moved field in the commit.
- **Heart-rate coverage:** Node — `tests/utils/heartRate.test.js` (bounds, entries/merge, as-of-date profile, legacy-rule parity, %HRR cutpoints, observed max, VO2 validity, zones, time-weighted samples, source selection, resting estimate/trend, BLE parser, EPOC/training/VO2 weaving, sharded persistence, snapshot fields), `tests/utils/heartRateBounds.test.js` (session bounds, exact Keytel, `trainingDetails`), `tests/utils/sessionHeartRate.test.js` (session fields, workout map vs the real cardio catalog, waking HR, NEAT advisory, AT physiology, phase resting HR, live-recording accumulator), `tests/utils/localDayWindow.test.js` (DST-safe local-day windows, pinned `TZ`), `tests/utils/pulseSignal.test.js`, `tests/store/heartRateActions.test.js` (no snapshot seeding, manual wins, settings validation). UI — `services/heartRateSync.spec.js`, `services/heartRateSensor.spec.js`, `common/SessionHeartRatePanel.spec.jsx` (display-only), `common/ImportWorkoutButton.spec.jsx`, `modals/forms/SessionFormsHeartRate.spec.jsx` (no Use-watch-data / Record-live; Import beside Favourites), `fullscreen/HeartRateTrackerModal.spec.jsx`, `forms/RestingHeartRateEntryModal.spec.jsx`, `pickers/HeartRatePickerModal.spec.jsx`. The plugin doubles add `Health.queryAggregated` / `queryWorkouts`, a `BleClient` double (`BluetoothLeMock.__notify` pushes 0x2A37 frames) and `KeepAwake`.
- Full `npm run test` is green (535 tests; the shell's loop math — px transform geometry, teleport tiers, settle clock, wrap periods, shortest tab path, ease — is covered by `tests/utils/carouselLoop.test.js`). Earlier additions: `tests/utils/bezierPath.test.js` (gap-aware path runs), `tests/utils/trendAverages.test.js` (trapezoidal N-day averages + capped trend fallback), `tests/utils/entryDeltas.test.js` (tracker entry deltas + signed-delta formatting), staleness-gate cases in `tests/utils/adaptiveThermogenesis.test.js`, and the keyboard-inset rule in `tests/utils/keyboardInset.test.js`. `tests/utils/sessionCarryover.test.js` also pins the date-distance pre-filter (far sessions never reach the pricing pass; a session carrying its own long window is still honored), and `src/hooks/useFoodCatalogWarmUp.spec.js` covers the idle warm-up lifecycle (no warm-up before hydration, once-per-page-load, unmount cancels). The canonical defaults are asserted by `tests/constants/activityPresets.test.js` against `DEFAULT_ACTIVITY_MULTIPLIERS` (`{ training: 0.2, rest: 0.22 }`).
- The **UI tier is separate**: `npm run test:ui` runs Vitest 5 (jsdom + Testing Library) over `src/**/*.spec.{js,jsx}` for components and hooks. Logic specs stay `tests/**/*.test.js` under `node --test`, so neither runner can pick up the other's files. Harness: `vitest.config.js` (standalone, deliberately NOT extending `vite.config.js`) + `src/tests/setup.js` (Capacitor plugin doubles in `src/tests/mocks/capacitor.js`, `visualViewport`/`window.scrollTo`/`Element.prototype.scrollTo` shims — the tracker modals drive their chart carousels imperatively from effects — plus explicit RTL `cleanup` because `globals: false`). Modal stack/backdrop math was extracted to `src/utils/visuals/modalStack.js` so it is unit-testable without a DOM.
- **Plugin boundaries are covered at the module boundary, not by monkey-patching plugin internals.** `src/tests/mocks/capacitor.js` doubles `@capacitor/core`, `preferences`, `app`, `status-bar`, `keyboard`, `splash-screen`, `barcode-scanner`, `@capgo/capacitor-health`, `navigation-bar`, `@capacitor/filesystem` and `@capacitor/share`, and each double exposes **only the API surface the app actually calls** (verified by grep) so an uncovered plugin call fails loudly instead of silently returning `undefined`. Keep it that way: extend the double when the app starts using a new plugin method, and never reach into real plugin internals from a spec.
- Covered plugin contracts: `services/barcodeScanner.spec.js` (platform gating without invoking the plugin, digit normalisation, `UNSUPPORTED`/`NO_RESULT`/`CANCELLED`/`PERMISSION_DENIED`/`SCAN_FAILED` mapping, and the exact scanner option payload), `hooks/useHardwareBackButton.spec.js` (modal → home-first → double-exit + hint timing + listener cleanup, **plus: nothing is registered on iOS**), `hooks/useHealthConnect.spec.js` (status lifecycle, **today-scoped window as the primary read**, plugin default only as the degraded fallback, exact-midnight rolling retry, degradation to `null` instead of throwing, max-per-source step dedupe, refresh only while connected, foreground refresh only when `isActive`, **plus the iOS contract**: read-only scope, `UNAVAILABLE` instead of `NOT_INSTALLED`, Apple Health copy, Android-only settings/write helpers), `services/fileShare.spec.js` (web download vs native Cache-write + share sheet, share-sheet dismissal as success, never throwing) and `utils/theme.spec.js` (which plugin APIs each platform may touch), plus `hooks/useKeyboardVisible.spec.js` (both keyboard shapes, the plugin-event/window-resize ordering, the zoom guard, the published CSS variable, listener + handle teardown) and `common/ModalShell.spec.jsx` (the centered keyboard sizing).
- **Two platform helpers are covered beside their sources even though `src/utils/**` is otherwise the Node tier's job.** `src/utils/platform.spec.js` and `src/utils/theme.spec.js` live in the UI tier because driving them requires the Capacitor doubles (which only exist there); neither is in the UI coverage include list, so the tier's headline coverage stays meaningful. Pure-logic `src/utils/**` modules still belong in `tests/utils/*.test.js`.
- UI-tier coverage scope is deliberately narrow: `src/components/**`, `src/hooks/**`, `src/utils/visuals/modalStack.js` and `src/services/barcodeScanner.js` (the plugin bridge this tier owns). The rest of `src/services/**` and all of `src/utils/**` remain the Node tier's job, so `npm run test:ui:coverage` stays meaningful. `hooks/useSwipeableScreens.js` is now reached indirectly (~47%) through the orchestrator's tab bar; its DOM drag/settle wiring is still not directly asserted, and its pure loop math belongs to `tests/utils/carouselLoop.test.js`.
- **The orchestrator is covered by mounting it, not by extracting it.** `src/components/EnergyMap/EnergyMapCalculator.spec.jsx` mounts the real (4,600+ line) orchestrator against the real store, giving the hydration gate, all five carousel screens, tab→chrome wiring, store→screen propagation and a lazy `SettingsModal` open/close round trip. When adding to it: **scope text queries to the region under test** (`within(header)`) because screens render their own summary copy and a document-wide query silently matches the wrong element. Also note the store saves on a 1s debounce into a **module-scoped** Preferences double, so a previous test's pending save can be reloaded by the next `initialize()` — pin persisted flags explicitly (see `setSwipeHintSeen(...)` in that spec) instead of assuming a default.
- **Full-browser E2E (Playwright) is deliberately deferred, not forgotten.** It was skipped because it needs selectors added across the orchestrator and 58 modal files (the app has zero `data-testid`/`aria-label`/`role` hooks today), a ~150 MB Chromium download, and it fights the swipe shell's rAF/compositor settles. Entry criteria: reach for it when a defect escapes that only a real browser would catch. What the integration tier cannot replace and Playwright would add: real layout/paint (carousel + tab-bar/dot geometry), IndexedDB persistence across a reload, and visual regression.
- **CI (`.github/workflows/ci.yml`) gates the release path with two jobs.** The `verify` job (ubuntu) runs, in this order: `npm ci` → `npm run lint:ci` → `npm run test:coverage` → `npm run test:ui` → `npm run build` → an inline assertion that `dist/index.html` plus the expected `chunk-*` vendor bundles exist → `npx cap copy android`. Every step was verified locally before being wired up, including the assertion's failure paths (missing `index.html`, missing chunk) and the coverage floors (an impossible floor exits 1). The `ios` job (macOS) runs `npm ci` → `npm run build` → `npx cap copy ios` → a serial `xcodebuild -resolvePackageDependencies` warm-up → `xcodebuild -scheme App -sdk iphonesimulator -destination 'generic/platform=iOS Simulator'` with signing disabled; it proves the web bundle lands in the iOS project **and** that the Xcode project still compiles with every Capacitor plugin linked through SPM (the manifest references plugins by relative path into `node_modules`, so it also catches "plugin added to package.json but the iOS project was never re-synced"). The warm-up exists because SwiftPM's binary-artifact downloads race when `xcodebuild build` resolves the graph for both simulator slices out of a cold cache (swiftlang/swift-package-manager#10138 — "also happens with xcodebuild", unfixed in the Xcode 16.4 toolchain): one resolver dies with `already exists in file system`, then `Could not resolve package dependencies` and exit 74, before anything compiles. The warm-up step is `continue-on-error` so it can never replace or mask the gate, and the build retries **only** on that race signature — a lost race leaves the winner's artifact in the shared cache, so the retry downloads nothing, while a Swift compile error still fails on the first attempt. Entitlements are deliberately not applied in that job, so HealthKit runtime access is out of its scope — it needs a signed build.
- **`lint:ci` exists because the strict profile is red on pre-existing code.** `npm run lint` reports 36 errors: 36 × `react-hooks/set-state-in-effect`, enabled as errors by `eslint-plugin-react-hooks` v7's recommended preset, across the orchestrator plus modal/screen files that sync state on prop change. `eslint.ci.config.js` downgrades only that rule (plus the historical `react-hooks/preserve-manual-memoization`) to warnings so the CI gate is meaningful on day one; `npm run lint` stays strict so the debt is visible locally and in editors. **Do not add new instances** — refactoring them is its own change with UI verification.
- **Coverage floors are floors, not ratchets:** logic tier 75 lines / 63 branch / 75 funcs (measured 79.8/70.0/81.2) and UI tier 22/11/18. They are deliberately a few points below the measured values so adding an untested surface nudges rather than blocks CI. Raise them as coverage improves. Never use `cap sync` in CI: it runs Gradle and needs the Android SDK, while `cap copy` is what actually proves the web bundle lands in the native project (and its output is gitignored).

**ESLint config:** Flat config format (`eslint.config.js`), uses `@babel/eslint-parser` with JSX preset. `react/prop-types` is disabled. Prettier runs as an ESLint rule. `eslint.ci.config.js` extends it for the CI gate, downgrading the two pre-existing React-Compiler advisory rules to warnings (see the CI notes above).

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
11. **Cardio effort types:** Check `session.effortType` — `'intensity'` uses MET-based calculation, `'heartRate'` uses gender-specific heart rate coefficients (Keytel et al. 2005; bounds in pitfall 118).
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
23. **Macro target display style:** `TrackerScreen` shows picked macro targets (single target grams), not min-max range copy. Keep UI wording aligned with target-based display. The **calorie** target is the exception: it is shown as the On-target range (see Daily Ledger Frontend).
24. **Activity multiplier clamping:** Custom activity multipliers have a floor defined by `MIN_CUSTOM_ACTIVITY_MULTIPLIER` in `activityPresets.js`. Always use `clampCustomActivityMultiplier()` when persisting custom NEAT values. The `DailyActivityCustomModal` picker starts at `MIN_CUSTOM_ACTIVITY_PERCENT` (10%), not 0.
25. **Calorie breakdown request object:** `openCalorieBreakdown()` in the orchestrator accepts either a plain step count (legacy) or a `{ steps, tefContext, adaptiveThermogenesisContext }` object. `CalorieMapScreen` step cards and the live Health Connect card pass the full object to enable correct TEF/AT mode context.
26. **Nutrition references are data-backed, not cosmetic:** `nutritionRef` should map to a day that actually has entries in `nutritionData`. If meals are deleted for a date, clear stale refs (store sync handles this for food actions).
27. **Phase metrics are nutrition-aware now:** Never hardcode `avgCalories = 0` in phase UIs. Use `calculatePhaseMetrics(phase, weightEntries, nutritionData)`.
28. **Daily log nutrition management route:** In logbook flow, nutrition management routes through the Tracker screen date context; preserve selected date handoff when adjusting this UX.
29. **No dual-write toggle exists anymore:** Do not add `VITE_ENABLE_HISTORY_DUAL_WRITE`-style rollback flags back into normal save flow.
30. **Node ESM import hygiene:** For modules used in tests, keep explicit `.js` file extensions in relative imports to avoid `ERR_MODULE_NOT_FOUND`.
31. **Daily snapshots are cache, not truth:** Never edit `dailySnapshots` directly from UI/form state; always derive via `upsertDailySnapshot(...)`.
32. **Snapshot TEF naming + mode are intentional:** the snapshot's `tef` is derived from `smartTefCalories` and `tefMode` records the user's **display** mode — `resolveUserTefDisplayMode(userData)`: `off` when Smart TEF is off, else `target`/`dynamic` from `smartTefQuickEstimatesTargetMode` (`target` is the non-logging-user mode). `buildDailySnapshot` uses `buildDisplayTefContext` + `calculateGoalSeededBreakdown` (goal-seeded like the store's `calculateTargetForGoal`) so the recorded TDEE matches the live target path and the ledger's recomputed breakdown exactly. Never re-derive the mode from current settings when reading history — use `resolveSnapshotBreakdownContexts(snapshot)`.
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
78. **Goal lock is intentional while active phase delta is applied:** `setSelectedGoal` is guarded when `isGoalLockedByActivePhase` is true, and `HomeScreen` goal CTA reflects locked state. The lock only makes sense because the phase *sets* the goal: never let `selectedGoal` and the active phase's `goalType` diverge (the store re-syncs them on every write), and never classify a planned delta with anything but `resolveGoalForDailyDelta` (the old three-way classifier had no aggressive goals).
79. **Per-phase calorie delta override is layered, not formula replacement:** keep `calculateCalorieBreakdown()`/TDEE core unchanged; apply phase delta via `calculateGoalCalories(..., deltaOverride)` in target resolution paths.
80. **Goal prediction card should stay mounted in goal mode:** keep render gating on `creationMode === 'goal'` (not on projection availability) and use a placeholder message when start/end inputs cannot yet produce `estimateGoalModeProjection(...)` output.
81. **Do not label weight-relative % as body-fat %.** Use `predictedWeightDeltaPercent` wording in UI copy; treat `predictedBodyFatDeltaPercent` as deprecated alias for compatibility only.
82. **Feasible-date band API is opt-in for heavy arrays.** Prefer summary fields (`strictCount`, `lenientCount`, `feasibleMinDateKey`, `feasibleMaxDateKey`, day-span ranges) and only request date/evaluation arrays when the caller explicitly needs them.
83. **OpenRouter proxy hardening is config-sensitive:** keep `ALLOWED_ORIGINS` and the Upstash rate-limit env vars configured in deployment (`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`, `OPENROUTER_RATE_LIMIT_MAX_REQUESTS=15`, `OPENROUTER_RATE_LIMIT_FAIL_CLOSED=true`); mismatched env config silently alters CORS/throttling behavior across environments, and missing Upstash credentials disable the limiter outright, leaving the paid LLM endpoint open.
84. **Health Connect step reads must be today-scoped first:** `useHealthConnect.fetchSteps()` must use the explicit today window from `buildHealthConnectStepReadWindow()` (local midnight → now) as the primary read. The plugin's native default (`now - 1 day` / `now`) is a rolling 24 hours and would include previous-day steps in today's live count, so it must only be used as a degraded fallback when the explicit today window fails. Keep the rolling 24-hour fallback in the same helper module for recovery paths. If every read still fails on a real device, return `null` and keep the app usable instead of surfacing a connection error.
85. **CalorieMap live card is a consumer, not the source of Health Connect failures:** `CalorieMapScreen` should keep passing `{ steps, tefContext }` to the breakdown modal, but any time-window fix belongs in the Health Connect hook/helper layer.
84. **Scroll pickers must not fight the user's gesture:** Embedded pickers that live-update a parent `value` prop on every scroll (e.g. `WeightPicker`/`BodyFatPicker` in the entry modals) must guard the `[value]` alignment effect with a user-driven flag (`isUserDrivenRef` + short auto-reset timeout). Without this, the effect re-runs on every scroll update and calls `alignScrollContainerToValue(...)` mid-gesture, causing choppy, fighting-the-finger scrolling. The settle-timeout in `createPickerScrollHandler` already snap-aligns after the gesture ends, so `handleWholeChange`/`handleDecimalChange` should not call `alignScrollContainerToValue` directly either. Keep initial open alignment, clamping, and max-value decimal reset behavior intact.
86. **Daily NEAT overrides are date-scoped + clamped:** `dailyNeatOverrides` is a **history field** (not profile) and sharded by date (`dailyNeatOverrides:YYYY-MM-DD`). Always route writes through the store action `setDailyNeatOverride(dateKey, overrideOrNull)` (never mutate the map ad-hoc), normalize dates via `normalizeDateKey()`, and clamp multipliers with `clampCustomActivityMultiplier()` (0.1–1.0). The multiplier is applied override-first in `calculateCalorieBreakdown` for the resolved `dateKey` only; do not leak an override across other dates or into global settings.
87. **N-day measurement averages are trapezoidal + window-anchored:** `calculateNDayWeightAverage`/`calculateNDayBodyFatAverage` integrate over an exact n-day UTC window anchored to today (or explicit `endDateKey`) via the shared `calculateTrapezoidalWindowAverage(...)` in `weight.js`. Do not reintroduce naive entry means, duplicate the integral per module, or substitute `0` when they return `null` — render the empty state honestly.
88. **Day-window iteration uses `getWindowDateKeys`:** build date windows with `getWindowDateKeys(endDateKey, n)` from `utils/data/dateKeys.js` (UTC-stable, canonical-key validated). Do not hand-roll `setDate`/ISO-slice loops that silently accept non-canonical keys like `2026-02-31`.
89. **Chart gap styling is tag-driven and tiered:** tracker charts interpolate interior missing days via `buildTaggedChartSlots(...)` (`isInterpolated` + `gapLength`) and tier bridges in `buildGapAwarePathRuns(...)` — ≤7 days solid, longer gaps dashed (no broken tier by default). Preserve the tags when mapping points; stripping `gapLength` collapses the dashed tier to solid. Leading/trailing empty slots must stay `null`, the selection card snaps to real points only, and `buildSegmentedBezierPaths` stays deleted.
90. **Smart AT is gated on weigh-in freshness:** `getAdaptiveThermogenesisSmartModeDataStatus` rejects the smart signal with `reason: 'weight-data-stale'` when the newest weigh-in exceeds `SMART_WEIGHT_STALENESS_MAX_AGE_DAYS` (3) relative to the requested `dateKey`; the correction deactivates instead of extrapolating stale trends. Tune only the exported constant; never bypass the gate.
91. **Trend fallback is capped:** `calculateWeightTrend`/`calculateBodyFatTrend` use the last-two-entries fallback only when their span ≤ `MAX_TREND_FALLBACK_SPAN_DAYS` (14); otherwise they return `'Need more data'` with `isStaleFallback: true`. Do not widen the cap or drop the flag without a coordinated UI/test update.
92. **Daily Ledger surfaces are read-only snapshot projections:** `DayLedgerListModal`/`DayLedgerModal` consume snapshots only through `dayLedgerPresentation.js` helpers; never mutate snapshots from these modals, never zero-fill missing days. The bottom dual-mode panel must never animate or dynamically resize its height: it uses grid-cell stacking (day preview, month summary, and empty month always mounted in `row-start-1 col-start-1`, toggled by opacity) so its height is the constant, content-driven max across states - do not revert to a hardcoded px height, AnimatePresence unmount swaps for the surfaces, or animated height changes.
93. **Daily Ledger picker overlays must stay anchored:** position them with a `relative` wrapper + absolute flex centering under the nav row while Motion animates only the inner card. Do not reintroduce invalid Tailwind classes (`left-1/5`, `top-29`) or Tailwind translate centering on Motion elements (see the Framer Motion transform caveat).
94. **Carousel peek has hard sync points:** `SCREEN_EDGE_PEEK_PX` (16, canonical in `utils/visuals/carouselLoop.js` and re-exported by `useSwipeableScreens.js`) ↔ `.carousel-slide { width: calc(100% - 32px) }` in `index.css` ↔ the slide inner padding (`px-2`) that puts real card content into the sliver. Changing one requires updating the others; the per-slide wrapped transform derives its `16px` inset from the constant automatically. Slide transforms are percentage-based `translateX(calc(<factor> * 100% + 16px))` writes (no measurement needed), and the affordances read `--screen-drag-progress` (the 1-based, unclamped position) **plus** the hook-owned `--screen-drag-duration` (`0s` while dragging / when a wrap normalizes, the settle duration when gliding), and each slide's edge fade is a mask strength (`--slide-fade-left/right`, 20px ramp).
95. **Peek slivers are gesture area, not tap area:** keep the invisible edge tap-guard strips (`absolute inset-y-0 z-10 w-4`) inside the viewport; without them, taps on the sliver would trigger cards on hidden neighbour screens. Drags must keep working from the guards (they bubble to the viewport handlers).
96. **Peek fades are continuous mask strengths, never classes:** every slide carries a permanent 20px ramp on both edges and the shell moves only its strength (`--slide-fade-left/right` from `resolveSlideFadeStrengths(offset)`, quantized, written in the same task as the transform and riding the same duration/curve). Never go back to toggling a `.slide-fade-*` class — a mask cannot be transitioned as a class, so the peek popped mid-flight. Never replace the masks with gradient overlay strips either (overlays tint the faded pixels instead of letting the page gradient show through).
97. **`--screen-drag-progress` mirrors the live 1-based position and the markers are rings:** published imperatively onto the drag-chrome elements themselves (registered sinks; never `:root`) by `useSwipeableScreens.commitPosition`, and consumed via `calc(...)` by the tab-bar ring and the header dot ring. The value is **unclamped on purpose**: `RING_COPY_OFFSETS` copies (`[-1, 0, 1]`) each add a static `copy * screenCount` offset so a seam crossing glides one copy out of one end of the clipped track while the next re-enters the other (clamping + swapping at normalize is what made a wrap jump backwards across every tab). Do not replace the variables with React state (re-renders per drag frame), do not introduce per-button conditional remounts for the markers, and do not publish a settle's intermediate frames — a settle publishes its target once (with the duration set to the settle value) so the markers glide in lockstep with the slides instead of chasing a moving target.
98. **Per-screen chrome follows `visibleScreen`, not `currentScreen`:** `currentScreen` is the committed screen (rest position, hardware-back home-first logic); `visibleScreen` is the optimistic display screen, flipped the moment a settle's target is known (swipe release, tab tap). `ScreenTabs` (icon colours) and `AppHeader` (glanceable stat line) consume `visibleScreen`, so the chrome reacts immediately instead of waiting ~350ms for the settle to normalize, and their animations share the shell's duration so they land with the motion. Never drive them from a mid-drag screen change (that re-renders the 4,100-line orchestrator mid-gesture).
99. **The swipe coach-mark flag is persisted and store-routed:** `userData.hasSeenSwipeHint` (profile scope) is mutated only via the `markSwipeHintSeen()` store action; the header chip hides on first drag or tab select. Do not derive it from transient UI state.
100. **The carousel loops with per-slide wrapped transforms — keep React out of the slide styles:** `useSwipeableScreens` renders each screen once and writes every slide style imperatively (mount ref callbacks via `getSlideProps(index)`, each rAF-throttled drag frame, once per settle), so never author a slide `transform`/`transition` from React style props. Settles must stay **compositor CSS transitions** (`SLIDE_SETTLE_TRANSITION_SET`, normalized by the hook's timer + bubbling `transitionend`) — do not reintroduce a JS/rAF settle, which re-couples the animation to main-thread work (React renders, `:root` custom-property style recalc, paint) and stutters on high-refresh screens. Never write a `transition` without its `transform`: that mix previously stranded an inline `transition: none` — a vertical scroll abandons the gesture in the axis-lock branch, so nothing re-armed the transition and the next tab tap snapped instead of sliding. All loop math stays in `utils/visuals/carouselLoop.js` (`resolveSlideOffsets`, `buildSlideTransform`, `isSlideTeleport`, `resolveSettleTarget`, `resolveSettlePositionAt`, `alignPositionToReference`, `resolveShortestScreenDelta`, `resolveSlideFadeStrengths`, `carouselEase`) with no cloned slides, ghost cells or normalization timers.
101. **Known defect — the daily-NEAT "Use my settings (default)" card applies a preset instead of clearing (tripwired, not yet fixed):** `DailyNeatOverrideModal` stages its clear action under the key `'default'`, which collides with the `'default'` preset inside `ACTIVITY_PRESET_OPTIONS`, so `handleApply` finds a preset and calls `onApply` rather than `onClear`. For a user whose global NEAT multiplier is customised (`activityMultipliers[dayType]`, e.g. 0.25) the card therefore writes a `0.22` override instead of clearing it — a silently wrong NEAT/TDEE for that day. `src/components/EnergyMap/modals/forms/DailyNeatOverrideModal.spec.jsx` pins the desired behaviour with an `it.fails` tripwire: fix the key collision (stage the clear action under a sentinel key that cannot match a preset, or check that selection before the preset lookup) and the suite reports that test as an unexpected pass — then delete `.fails` and keep it as a normal regression test.
102. **Tracker detail is one shared, fixed-slot card — never a positioned tooltip:** the Weight / Body Fat / Step / Rolling Balance modals all render `TrackerSelectionCard` (`common/TrackerSelectionCard.jsx`) pinned inside their `relative` graph container, always mounted and crossfaded, with the selected slot tied to it by a vertical guide line drawn inside the chart SVG. Do **not** reintroduce measured positioning (`getBoundingClientRect()`/`scrollLeft`), a `fixed z-[1200]` node outside `ModalShell`, an outside-click `document.pointerdown` dismissal, or per-modal copies of the card markup: measured geometry is what made the old tooltips drift off their point, and `z-[1200]` escapes the `1000 + 2/depth` z-lanes. Dismissal *is* swipe-aware in the day carousels now (pitfall 103) — that is a scroll listener on a fixed-slot card, not a measured tooltip. Keep the selection in render-phase retention state (`selectedDate`/`lastSelectedDate`/`selectionSource`).
103. **The tracker card has no close button, and its `top` is a constant:** dismissal is `onClick={dismissSelection}` on each modal's **graph container**, the card stops propagation so its own taps never reach that handler, and point/bar/label handlers `stopPropagation()` *after* their empty-slot guard so a tap on a gap still bubbles up and dismisses. The Weight / Body Fat / Step carousels additionally dismiss on scroll — the first statement of `handleCarouselScroll`, ahead of its geometry guard, written as a functional no-op-safe update so it costs no re-render and no dependency; Rolling stays tap-only, and that dismissal must never move onto `pointerdown` (it fires on plain taps and would break the re-tap-to-edit gesture). The card's only inline geometry is `topPx` (the plot's top edge, default `8`) — a constant handed down by the modal, never a measurement, never a `left`. `StepTrackerModal` passes `weekBracketAreaHeight + 8` so the card clears the 7d weekly-average bracket band (y 8→40) instead of covering it; give any future top-anchored chart annotation the same reserved band and align the card below it. Keep the surface glass and **graph-wide** (`w-full` inside a wrapper that defaults to `inset-x-2` — an 8px gutter, so the strip never touches the screen edges and still covers the axis column, `px-4` text so the date lines up with the modals' stat-label gutter, `border-border/40`, `bg-surface/85 supports-[backdrop-filter]:bg-surface/55`, `backdrop-blur-2xl backdrop-saturate-150`, `shadow-2xl shadow-background/40`) — the y-axis column sits behind the card while it is open (accepted; a tap or a swipe dismisses), and the Weight / Body Fat day cards must not reintroduce the `7d`/`14d` **level** chips, since the modals' own "Averages" stat card already reports them: their per-day detail is the delta cluster in the card section above.
105. **History persistence is incremental (identity-diffed) — keep it O(changed):** `saveEnergyMapData` gates each history field on its **object reference** (`lastSavedHistoryRefByField`) and each shard on `(sourceRef, order)`, so an unchanged field costs O(1) and a single-day edit writes exactly one shard (e.g. `nutritionData:<day>`). Do **not** reintroduce whole-field/per-shard `JSON.stringify` diffing, do not mutate history arrays/objects in place (the diff relies on immutable replacement — the store's `updateUserData` spread is what makes it correct), and call `resetPersistenceTracking()` after any wholesale import/reset. `sanitizeHistoryForPersistence` is now load-only, and `primePersistenceBaseline()` runs after `mergeWithDefaults` on load so the first save writes only what the user changes. See "Storage Architecture → Incremental Persistence (identity diffing)" above.

104. **Keyboard layout is platform + CSS owned — never JS height writes or viewport-delta heuristics:** Android must stay on `android:windowSoftInputMode="adjustResize"` (never `adjustPan`), `ModalShell` must not write an inline `height` (no `allowKeyboardViewportResize`, no `KEYBOARD_RESIZE_*` delta bands), keyboard state comes only from `hooks/useKeyboardVisible.js` (Capacitor keyboard events + the `visualViewport` shrink resolved by `utils/visuals/keyboardInset.js`, published as `--keyboard-inset`), bottom chrome pads with `.keyboard-bottom-inset` = `max(env(safe-area-inset-bottom, 0px), var(--keyboard-inset, 0px))` (never the sum), centered modals shrink their centering band with the inset instead of their height, and `ScreenTabs` fades out while the keyboard is visible. iOS keeps `resize: "none"` on purpose (the overlay + tinted-backdrop design), which makes `--keyboard-inset` load-bearing there. See "On-Screen Keyboard Contract".
106. **Depth comes from the global tokens, not per-card styling:** use the `@theme inline` shadow scale (`shadow-md/lg/xl/2xl`), the `.rounded-2xl.bg-surface` card top-light (`--card-sheen`, which every new theme must define), and the `button.bg-primary|accent-*` sheen/glow rules in `index.css` instead of one-off shadows or gradients; keep the strengths subtle and do not reintroduce radial backdrop glows (`.app-backdrop` is a plain wash). See "Elevation & Surface Depth".
107. **One category resolver for AI entries:** the chat card's tag and the category an entry is logged under both come from `resolveAiEntryCategory` (`utils/food/aiCategory.js`, covered by `tests/utils/aiCategory.test.js`). Do not re-implement it inline or fall back to `'custom'` for display - unknown means no tag. `custom`/`manual` are provenance categories and are only honoured when they come from a matched database food, never from the model.
108. **The portion-card flight is clone-based and opt-in:** keep it on `usePortionCardFlight` + `utils/visuals/portionTransition.js`; do not animate the real card (the sheet's `overflow` clips it), do not add state to it, and do not extend it to cards whose design differs from the modal's top card (Favourites). A modal that measures a child's resting position must use `modal-content-fade` - the default entrance translates/scales the whole sheet while it plays.
109. **Display scale is CSS-variable driven - extend the variables, not components:** text size = the `--text-*` tokens + the px-size override block, density = `--spacing`; both are set from `userData.fontScale` / `userData.uiDensity` via `applyUiScale()`. Do not scale with per-component styles, change the root font-size (it would grow layout with text), or add a `text-[Npx]` size without adding it to the override block.
110. **Motion is one resolved mode, not scattered media queries:** read it with `prefersReducedMotion()` / `useReducedMotionPreference()` / `resolveScrollBehavior()` (never `matchMedia('(prefers-reduced-motion)')` or framer's `useReducedMotion`, which only know the device), key CSS on `<html data-motion>` and add any new animated class to the `:root:is([data-motion='reduced'], [data-motion='off'])` list in `index.css`. `full` intentionally overrides a device that asks for reduced motion. See "Motion Preference (Animations)".

111. **Boot-critical chunking is load-bearing:** `@capacitor/barcode-scanner` must stay excluded from the shared `chunk-capacitor` manual chunk and html5-qrcode must keep its own `chunk-html5-qrcode` — the scanner's web fallback (~350 kB) never runs on native, and the capacitor chunk is `modulepreload`ed at launch (via the static `@capacitor/keyboard` import in `main.jsx`). Reverting either rule re-adds ~28% dead JS to every cold start. When touching `vite.config.js` chunking, rebuild and check `dist/index.html`'s `modulepreload` list.

112. **Screen render-cost contracts — never reintroduce per-render recomputation:** the five screens are `React.memo`-wrapped (props must be reference-stable — inline object/array/function literals defeat the memo); `CalorieMapScreen` reads the orchestrator's memoized `stepRangeDetailsBySteps` (plain object, not a `Map` — the orchestrator imports the lucide `Map` icon which shadows the global); `HomeScreen`'s hero TDEE/EPOC math and `InsightsScreen`'s AT preview are `useMemo`d on their real inputs (the AT-mode resolver is fed a narrow `{ adaptiveThermogenesisEnabled, adaptiveThermogenesisSmartMode }` object on purpose — never widen the deps back to the whole `userData` identity); and `deriveState`'s date-scoped burns are WeakMap-cached per `(sessionsRef, typesRef, profileKey)`. A screen-level calculation lands behind a `useMemo` keyed on its real inputs, never inline in a render body.

113. **EPOC carryover allocation is date-distance pre-filtered:** `getCarryoverForDateFromSessions` only prices sessions that ended before the target day's end and within `MAX_EPOC_CARRYOVER_WINDOW_MINUTES` (exported from `epoc.js`, derived from the same clamps the window formula uses; a session-provided `epocCarryoverMinutes` widens that session's reach). Do not revert to iterating (and re-pricing via `resolveCarryover`) every session in history per TDEE call — the pre-filter is what keeps breakdowns O(today) as history grows. Covered by `tests/utils/sessionCarryover.test.js`.

114. **Entry-modal wheel drafts relay on settle, not per scroll frame:** `TrackerEntryModal` (shared by `WeightEntryModal` / `BodyFatEntryModal` / `RestingHeartRateEntryModal`) stages wheel changes locally and relay `onWeightChange`/`onBodyFatChange` to the orchestrator's draft on a `SCROLL_SETTLE_DELAY` debounce; their Save buttons pass the LIVE value (`onSave?.(pending ?? prop)`) so a save racing the trailing commit can never persist a stale draft, and pending commits are dropped when the modal closes. Wiring wheel scroll frames straight into orchestrator state re-rendered the whole tree at ~60fps during a flick. `findClosestScrollItem` caches the wheel's `[data-value]` element list per container (child-count stamped; positions still read live), and the only continuous store-bound control in Settings (the AT smoothing window slider) stages locally and commits on pointer/key/blur release.

115. **Profile persistence is identity-diffed like history:** `collectChangedProfileFields` gates the profile `JSON.stringify` on per-field reference movement (`lastSavedProfileFieldRefByField`, primed by `primePersistenceBaseline` alongside the history baselines, rebuilt wholesale after each successful write so removed keys leave it). Never reintroduce a whole-profile stringify on every debounced save, and never mutate a profile field in place — the diff depends on immutable replacement, exactly like the history fields.

116. **RAG pipeline latency contracts — telemetry, history, and grounding batches:** (a) every pipeline `record.*` telemetry call is fire-and-forget (`fireAndForgetTelemetry` in `services/ragChatPipeline.js`) — awaiting one put a Dexie write between pipeline stages; (b) `services/ragTelemetry.js` hydrates via `loadHistoryDocumentsByIds` (two docs) and persists on a 1.5s trailing debounce — never revert to `loadAllHistoryDocuments` (full-DB read) or a write per telemetry event; (c) `buildStructuredChatHistory` caps at `CHAT_REQUEST_HISTORY_MESSAGE_LIMIT` (12, matching the client's `slice(-12)`) and replaces historical image attachments with a text note — re-encoded images blow the proxy's 500KB payload cap on every follow-up; (d) `resolveAiGroundedBatch` chunks requests into waves of `RAG_GROUNDING_BATCH_MAX_NAMES` — the batch LLM call drops names past its cap, so unchunked batches silently fail every entry beyond the first ten. Covered by `tests/services/ragChatPipeline.test.js`, `tests/services/foodSearch.test.js` and `tests/utils/concurrency.test.js`.

117. **Lookup matching stems plurals on both sides:** `tokenize` in `services/foodSearch.js` applies `stemPluralToken` to query AND food tokens ("eggs" matches catalog "Egg"), and `BRAND_INTENT_TOKEN_HINTS` is stored pre-stemmed. Any new token-based comparison or cache key must go through `tokenize` — raw token equality on unstemmed strings regresses recall at the exact decision point that gates local-accept vs cloud/grounding escalation.

118. **Session heart rate has one set of bounds:** `normalizeSessionHeartRate` in `constants/health/heartRate.js` (whole bpm, 60–220, `null` otherwise — out-of-range values are rejected, never clamped) is the only validator. The form Save gates, the orchestrator sanitizers (`sanitizeCardioDraft` / `sanitizeTrainingSession`), the Keytel kcal formula, EPOC's HR→intensity rule (an invalid HR falls back to the stored `intensity`), the step-overlap cadence multiplier (an invalid HR is neutral) and `HeartRatePickerModal` all consume it. Do not reintroduce a per-layer `> 0` or `60/220` check. Two related contracts: a heart-rate session's stored `intensity` is stale (left over from before the user switched to HR), so step-overlap cadence ignores it and HR alone sets the cadence; and the HR picker opens an unset value at `DEFAULT_SESSION_HEART_RATE_BPM` (120) via `resolveInitialHeartRate`, because `Number('') === 0` used to clamp every fresh form to 60.
119. **Heart-rate data never moves an HR-less user's numbers, and never reaches back in time:** every HR formula has the legacy branch (no resting baseline → the exact `220 − age` 0.70/0.85 EPOC rule; no `hrBurnModel` → Keytel; no VO2 max → plain Keytel), and every HR profile is resolved **as of the session's / day's date** (`resolveHeartRateProfile(userData, dateKey)`). Keep the golden regression green; never resolve a past session with today's profile.
120. **Burn caches key on HR inputs:** `todayBurnProfileKey` carries `maxHeartRateCustom`, `vo2MaxCustom` and reference tokens for `heartRateEntries` and BOTH session arrays (observed max HR reads across them); HomeScreen's hero breakdown memo depends on the store's memoized `heartRateProfile`. A new HR input the burns read must join both.
121. **Synced HR never seeds snapshots and never overwrites a manual resting HR:** `saveHeartRateEntries` merges field-by-field and refreshes only existing snapshots (`upsertDailySnapshots(..., { onlyIfExisting: true })`); a seeded untracked day would carry intake 0 into Rolling Energy Balance / smart AT.
122. **Measured and estimated resting HR never share a trend:** trends, baselines, deltas and phase start/end resolve one family (`resolveRestingHrTrendFamily`); always pre-filter with `getRestingHrSeries` before the generic weight.js helpers (`getPreviousEntryDelta` compares with the immediately previous array entry).
123. **HR reads are one local day per call:** use `buildLocalDayReadWindow(dateKey)`; never a multi-day `bucket: 'day'` aggregate (Android buckets are fixed 24 h and drift across DST). Session reads use `limit: 0` over the bounded window and ONE source (`selectPrimaryHeartRateSource`).
124. **HR is display-only for AT and advisory-only for NEAT:** `assessAdaptiveThermogenesisPhysiology` must never feed the correction or its confidence, and `assessNeatFromHeartRate` only stages a preset in `DailyNeatOverrideModal`. BMR has no HR input.
125. **Lifting HR prices intensity, not Keytel, for new sessions only:** `sanitizeTrainingSession` writes `hrBurnModel` via `resolveTrainingHrBurnModel(draft)`; edit drafts carry the stored model (`getStoredTrainingHrBurnModel`) so editing a legacy session can never switch its formula.
126. **The BLE / keep-awake plugins stay lazy and the recording lives in the service:** only `services/heartRateSensor.js` imports them, dynamically; `vite.config.js` keeps `@capacitor-community/*` out of `chunk-capacitor`. Recording state is the module singleton (closing the view must not stop it); read it with `useHeartRateSensorState` in leaf components (e.g. `LiveHeartRatePill`), never by lifting beats into orchestrator state.

127. **Recipes are derived foods over snapshotted ingredients - keep them that way:** persist only `userData.recipes` (ingredients + servings + cooked weight); per-100g values and the "1 serving" portion always come from `buildRecipeFood` (`utils/food/recipe.js`), never stored, so a calculator fix fixes every recipe. Do not store a live reference to an ingredient's source food (its `per100g` is copied at add time), do not auto-favourite a recipe (the copy would go stale), do not sum micro nutrients that any ingredient lacks (the result is `null`), do not nest recipes in the ingredient picker, and do not nest the recipe edit button inside the result card button. The ingredient picker is Food Search's browse view: keep filtering / sorting / pinned-first in `utils/food/foodListing.js` (shared with `FoodSearchModal`) and its loading derived from request keys in `useFoodBrowser` rather than copying search-modal logic or setting loading state from effects; its Food | Recipe and Local | Online switches are the shared `SegmentedToggle` (one persistent sliding pill, never per-button remounts), and Food | Recipe keeps the "Add Custom Food" blue in both positions. Logging a recipe adds one entry, never one per ingredient. A recipe food is `isCustom` **and** `isRecipe` - check `isRecipe` / `FOOD_SOURCE_TYPES.RECIPE` first (`resolveFoodSourceType` does). A serving above 1000 g is rejected by `validateRecipeDraft` because the portion modal's gram wheel stops there. Pre-filling the form for an edit is a render-phase seed keyed by what is being opened, not an effect. See "Recipes".

128. **A logged entry is what the user saw - tags and numbers survive log and edit:** an AI chat entry is logged with exactly the card's numbers (`buildAiEntryNutrition`, `utils/food/loggedEntry.js`); database substitution happens once, in `resolveAiFoodEntry`, never again at log time (a second pass logged different macros than the card in the legacy / grounded-fallback paths). Editing an entry whose food can't be looked up goes through `buildFallbackFoodFromEntry`, which keeps the entry's own `category` / `foodId` / `brand` and never invents a category (it used to hard-code `supplements`). Logging paths carry `category` onto the entry, and saving an edit spreads the previous entry first so metadata is not dropped. Covered by `tests/utils/loggedEntry.test.js`.

129. **Food entry ids are settled by the store, never trusted from the caller:** delete and edit match by id, and the logging surfaces number entries from counters that restart on every mount (that once gave a whole meal `id: 1`, so deleting one food removed them all). Every new entry goes through `addFoodEntry`, which resolves the id against the whole day; any other writer of `nutritionData` must do the same (`utils/food/entryIds.js`). Keep the load repair deterministic. Covered by `tests/utils/entryIds.test.js`, the id block in `useEnergyMapStore.spec.js` and `tests/utils/storage.test.js`.

130. **Recents is a view of the log, not a list of its own:** do not persist it, do not log from a row tap, and re-log through `resolveFoodForRelog` so live portions and an entry's own metadata both survive. See "Food Search Recents".

131. **Units are a view over metric data:** never store a converted value, never write "kg"/"kcal"/"km"/"oz" by hand (use `useUnits()` or a `units` argument), never `Math.round` before formatting, and keep the open-then-save rule when adding a picker (`fromPicker(picked, original)`). Weights are stored to 2 decimals so lb and st survive a round trip. See "Measurement Units".

132. **Screen slots move:** the user can re-order the five screens and turn the loop off, so never compare against a literal screen index, never assume Logbook is slot 0, and keep new loop math behind the `{ loop }` option in `carouselLoop.js`. The icon module is `common/screenIcons.js` on purpose: a `screenTabs.js` beside `ScreenTabs.jsx` resolves to the same import on case-insensitive filesystems. See "Carousel Structure".
