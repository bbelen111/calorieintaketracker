# Energy Map Calorie Tracker - AI Coding Instructions

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
- **External APIs:** USDA FoodData Central (online text search via `api/usda.js`), OpenFoodFacts (barcode lookup via `api/openfoodfacts.js`), Gemini (AI parsing via `api/gemini.js`)

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
      └─ EnergyMapCalculator.jsx (3,800+ lines — THE orchestrator)
            ├─ 5-screen carousel (useSwipeableScreens)
            │   ├─ LogbookScreen
            │   ├─ TrackerScreen
            │   ├─ HomeScreen
            │   ├─ CalorieMapScreen
            │   └─ InsightsScreen
            ├─ PhaseDetailScreen (drill-down, not in carousel)
              └─ 40 top-level useAnimatedModal instances → 49 modal files
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

1. **Single orchestrator file (`EnergyMapCalculator.jsx`)** owns all modal lifecycle state, temporary form drafts, and screen navigation. At 3,800+ lines, it's deliberately centralized — not a candidate for splitting. New modals are instantiated here.

2. **Derived state pattern:** The Zustand store's `deriveState()` owns canonical fields (`bmr`, `trainingCalories`, `totalCardioBurn`, sorted entries, resolved types). Hot-path caching is intentional (resolved type maps, sorted arrays, normalized phase state, phase view projection) and `updateUserData` short-circuits no-op mutations. Never duplicate these calculations — consume them from the store.

3. **Store initialization is async.** `setupEnergyMapStore()` is called once from `EnergyMapCalculator`, which gates rendering on `isLoaded === true` to prevent flash of default data.

4. **`main.jsx` bootstraps** by preventing pinch-to-zoom gestures (gesturestart/change/end + Ctrl+wheel), configuring Capacitor keyboard settings, and rendering `<App />` — no providers, no router.

5. **Phase domain is `phaseLogV2`-native in the store.** Legacy `phases`/`activePhaseId` are derived projections for UI compatibility and are no longer persisted or mutated directly.

6. **Daily snapshots are derived and date-keyed.** `userData.dailySnapshots` is an auto-maintained history cache (`YYYY-MM-DD` keys), generated from canonical datasets (`nutritionData`, step/training/cardio sessions, and `calculateCalorieBreakdown`) via store action `upsertDailySnapshot(dateKey, options?)`.

7. **Goal state for duration-sensitive logic is profile-canonical.** `selectedGoal` and `goalChangedAt` live in persisted `userData` (profile scope), and any “days in goal” logic should derive from these values (e.g., `goalDurationDays` from the store). Do not rely on local component state or snapshots as the sole source of current goal status.

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

- **42 top-level `useAnimatedModal()` instances** in `EnergyMapCalculator.jsx` (top-level orchestrator)
- **~21 additional child-level modals** declared inside modal components (e.g., delete confirmations, sub-pickers)
- **52 modal component files** organised into 6 subfolders inside `src/components/EnergyMap/modals/`, plus 4 supporting panel components under `fullscreen/panels/`:
  - `fullscreen/` — WeightTrackerModal, BodyFatTrackerModal, StepTrackerModal, SettingsModal, FoodSearchModal
  - `pickers/` — AgePickerModal, BodyFatPickerModal, CalendarPickerModal, **CaloriesPerHourPickerModal**, CalorieTargetModal, DatePickerModal, DurationPickerModal, EpocWindowPickerModal, FoodPortionModal, HeartRatePickerModal, HeightPickerModal, MealTypePickerModal, MetValuePickerModal, StepGoalPickerModal, TemplatePickerModal, TimePickerModal, WeightPickerModal
  - `info/` — AdaptiveThermogenesisInfoModal, BmiInfoModal, BmrInfoModal, BodyFatTrendInfoModal, CalorieBreakdownModal, CaloriesPerHourGuideModal, EpocInfoModal, FfmiInfoModal, TefInfoModal, WeightTrendInfoModal
  - `forms/` — AddCustomFoodModal, BarcodeEntryModal, BodyFatEntryModal, CardioModal, CustomCardioTypeModal, DailyActivityCustomModal, DailyActivityEditorModal, DailyActivityModal, DailyLogModal, FoodEntryModal, GoalModal, PhaseCreationModal, TrainingModal, StepRangesModal, TrainingTypeEditorModal, WeightEntryModal
  - `lists/` — CardioFavouritesModal, CardioTypeListModal
  - `common/` — ConfirmActionModal
- Total across codebase: ~60 modal hook instances (`useAnimatedModal`)

### Food Search/Favourites UI Architecture

- `FoodSearchModal` is the **canonical** food favourites UI surface (`viewMode === 'favourites'`).
- `FoodFavouritesModal` was removed as redundant and should **not** be reintroduced.
- `FoodSearchModal` is now a **4-mode surface**: local search, online search, favourites, and AI chat (`viewMode` + `searchMode` state machine).
- `FoodSearchModal` now composes focused panel components from `modals/fullscreen/panels/`:
  - `FoodSearchChatPanel.jsx`
  - `FoodSearchFilterControls.jsx`
  - `FoodSearchResultsPanel.jsx`
  - `FoodSearchFavouritesPanel.jsx`
  Keep panel responsibilities isolated and avoid moving large inline JSX blocks back into `FoodSearchModal`.
- Local result rendering uses **progressive batches** (`visibleResultCount`) to reduce mount/paint cost on large datasets:
  - Local batch size: `120`
  - Online batch size: `80`
  - "Show more" increments visible rows and can trigger additional local DB page fetches.
- Local DB paging in search mode uses `LOCAL_DB_QUERY_PAGE_SIZE = 500` with offset-based fetches when users load more.
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
    -> services/usda.js
  -> preview rows + cache-on-select flow
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

### Carousel Structure

`useSwipeableScreens(5, viewportRef, initialScreen=2)` manages a horizontal carousel. All 5 screens render simultaneously with `flex-shrink-0 w-full`, visibility controlled by CSS transform offset.

Viewport resize updates are `ResizeObserver`-driven but `requestAnimationFrame`-throttled with equality guards to avoid resize-state churn.

Screen order (0-indexed): **Logbook → Tracker → Home (default) → Calorie Map → Insights**

`PhaseDetailScreen` is a drill-down from Logbook, not part of the carousel.

### Screen Props Pattern

Screens receive a large props bundle from `EnergyMapCalculator` containing:
- **Data:** `userData`, `bmr`, `trainingCalories`, `weightEntries`, `bodyFatEntries`, etc.
- **Modal openers:** Callback functions like `onOpenGoalModal`, `onOpenWeightTracker`, etc.
- **UI state:** `selectedDay`, display strings, step ranges

Screens also subscribe to the store directly with `shallow` selectors as a fallback pattern. Prefer passing through props for new features.

### Floating Tabs (useScrollOffScreen)

`useScrollOffScreen` detects when the original `ScreenTabs` bar scrolls out of the viewport, triggering a fixed-position `FloatingScreenTabs` overlay. Uses scroll event detection with an 8px threshold.

Visibility checks are queued with `requestAnimationFrame` to reduce scroll-time layout thrash.

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

## Calculation System (`utils/calculations.js`)

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
| Goal target | `calculateGoalCalories(tdee, goal)` | Applies ±300/500 modifier based on goal |
| BMI | `calculateBMI(weight, height)` | Standard BMI: weight(kg) / height(m)² |
| BMI category | `getBMICategory(bmi)` | Returns `{ label, color }` for underweight/normal/overweight/obese |
| FFMI | `calculateFFMI(weight, height, bodyFatPercent)` | Fat-Free Mass Index — returns `{ raw, normalized, leanMass }` |
| FFMI category | `getFFMICategory(ffmi, gender)` | Returns `{ label, color }` from "Below average" to "Suspiciously high" |
| TEF (from macros) | `calculateTefFromMacros({proteinGrams, carbsGrams, fatsGrams})` | Protein×25% + Carbs×8% + Fats×2% of caloric content |
| TEF (target mode) | `calculateTargetTef({targetCalories, weightKg, ...})` | Estimates TEF from bounded macro targets (saved split + profile anchors) |
| TEF (dynamic mode) | `calculateDynamicTef({totals, ...})` | Uses today's logged macro totals for live TEF estimate |
| Adaptive thermogenesis mode | `resolveAdaptiveThermogenesisMode({ userData, adaptiveThermogenesisContext })` | Resolves `'off' \| 'crude' \| 'smart'` from persisted settings plus optional per-request override |
| Adaptive thermogenesis correction | `computeAdaptiveThermogenesis({...})` | Computes bounded correction (±300 kcal/day) from staged duration logic (`crude`) or snapshot/weight divergence signal (`smart`), with optional smart-mode weight-signal smoothing (`EMA`/`SMA`, 3-14 day window) |

**TEF constants** exported from `calculations.js`: `TEF_MULTIPLIER_OFFSET = 0.1`, `TEF_PROTEIN_RATE = 0.25`, `TEF_CARB_RATE = 0.08`, `TEF_FAT_RATE = 0.02`.

**Smart TEF mechanic:** When `userData.smartTefEnabled` is true and a `tefContext` is passed, `calculateCalorieBreakdown()` subtracts `TEF_MULTIPLIER_OFFSET` (10%) from the NEAT activity multiplier (`effectiveActivityMultiplier = rawActivityMultiplier - 0.1`) then adds the macro-based TEF back as an explicit line item. Net effect is neutral at default macro ratios but improves accuracy with real logged data. The breakdown return object gains: `rawActivityMultiplier`, `effectiveActivityMultiplier`, `tefOffsetApplied`, `tefMode`, `smartTefCalories`, `smartTefDetails`.

**Macro target anchoring:** Macro recommendations are constraint-based. Bounds are profile-derived (`protein: 1.6-2.8 g/kg`, mass source = lean mass when body fat is available else bodyweight; `fat: 0.6-1.6 g/kg`; `carb soft floor: 50g` with relaxation warning on infeasible budgets). Preserve calorie reconciliation and warning fields (`carb_soft_floor_relaxed`, `hard_floor_exceeds_budget`) when adjusting this logic.

**Constrained triangle mapping:** `MacroPickerModal` uses full-surface constrained remapping (`macroSplitFromConstrainedTrianglePoint` / `macroSplitToConstrainedTrianglePoint`) so the whole triangle is draggable while remaining within bounded macro behavior. Do not revert to direct raw-ratio barycentric mapping for picker interactions.

**`tefContext` shape:** `{ mode: 'off' | 'target' | 'dynamic', totals?: {protein, carbs, fats}, targetCalories?: number, weightKg?: number, enabled?: boolean }`

**`adaptiveThermogenesisContext` shape:** `{ mode?: 'off' | 'crude' | 'smart' }`

**Target mode chicken-and-egg:** The store's `calculateTargetForGoal()` runs a 2-pass refinement loop — pass 1 seeds `targetCalories` with pre-TEF TDEE; pass 2 uses goal-adjusted result from pass 1. Two iterations converges sufficiently.

**Adaptive Thermogenesis mechanic:** `calculateCalorieBreakdown()` computes `baselineTotal` first (BMR + NEAT + steps + training + cardio + Smart TEF), then applies AT as a post-formula correction (`total = baselineTotal + adaptiveThermogenesisCorrection`). Returned AT fields include `baselineTotal`, `adjustedTotal`, `adaptiveThermogenesisMode`, `adaptiveThermogenesisCorrection`, and `adaptiveThermogenesis`.

**Smart AT smoothing mechanic:** When `adaptiveThermogenesisSmoothingEnabled` is true, smart mode smooths the weight series before slope regression (`adaptiveThermogenesisSmoothingMethod`: `'ema' | 'sma'`, `adaptiveThermogenesisSmoothingWindowDays`: clamped 3–14). Smoothing metadata is included in the AT smart signal for debugging (`smoothingEnabled`, `smoothingMethod`, `smoothingWindowDays`).

**EPOC mechanic:** `calculateCalorieBreakdown()` resolves per-session EPOC from `utils/epoc.js`, then uses `getCarryoverForDateFromSessions()` (`utils/sessionCarryover.js`) to allocate carryover calories to the requested `dateKey`. Returned fields include `epocEnabled`, `epocCalories`, `trainingEpoc`, `cardioEpoc`, `epocFromTodaySessions`, `epocCarryInCalories`, `trainingEpocDetails`, and `cardioEpocDetails`.

**Training types** are resolved at the store level (`resolveTrainingTypes`) by merging `trainingTypes` constants with `userData.trainingType` (catalog). Never use raw constants directly.

**Step/cardio overlap model (Option 2):** `utils/steps.js` handles overlap deduction using explicit cardio-type metadata from `constants/cardioTypes.js`.
- `cardioTypes[<key>].ambulatory` decides whether a session is step-based.
- `cardioTypes[<key>].cadence` is the type-specific baseline steps/min used by deduction estimates.
- Session-level `stepOverlapEnabled` controls whether that specific ambulatory session deducts steps.
- Cardio burn is preserved; only the step component is reduced to avoid double counting.

---

## Storage Architecture (`utils/storage.js`, `utils/historyDatabase.js`)

### Split Storage Keys

| Key | Contents | Why |
|-----|----------|-----|
| `energyMapData_profile` | Settings, user stats, preferences, small lists | Primary profile/settings source of truth |

Primary history store is now Dexie (`energyMapHistory` DB), with document rows keyed by history field name.

Split is determined by `HISTORY_FIELDS` array: `weightEntries`, `bodyFatEntries`, `stepEntries`, `nutritionData`, `phaseLogV2`, `cardioSessions`, `trainingSessions`, `cachedFoods`, `dailySnapshots`.

`dailySnapshots` is also history-scoped and sharded by date document key (`dailySnapshots:YYYY-MM-DD`).

### Dexie History Store

`utils/historyDatabase.js` manages:
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
| `mergeWithDefaults(data)` | `utils/storage.js` | Deep-merges loaded data with defaults, normalizes nutrition entries |
| `sanitizeAge(value, fallback)` | `utils/profile.js` | Clamps and rounds age to 1–100 range |
| `sanitizeHeight(value, fallback)` | `utils/profile.js` | Clamps and rounds height to 120–220 cm range |

### Migration

Migration behavior is now intentionally minimal:
1. No `localStorage` or Preferences history backfill path is used.
2. Legacy Dexie `phases` documents are ignored (no compatibility import path).
3. Saves persist only `phaseLogV2` for phase history.

### Default Data

`getDefaultEnergyMapData()` in `utils/storage.js` defines the full schema with defaults. Key defaults:
- `age: 21`, `weight: 74`, `height: 168`, `gender: 'male'`, `theme: 'auto'`
- `selectedGoal: 'maintenance'`, `goalChangedAt: Date.now()`
- `stepGoal: 10000`, `selectedTrainingType: 'trainingtype_1'`, `trainingDuration: 2`
- 6 preset training types in `trainingType` with calories/hour values (`trainingtype_1..6` → bodybuilding 220, powerlifting 180, strongman 280, crossfit 300, calisthenics 240, custom 220)
- `activityMultipliers: { training: 0.35, rest: 0.28 }`
- `activityPresets: { training: 'default', rest: 'default' }`
- `customActivityMultipliers: { training: 0.35, rest: 0.28 }`
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
  selectedTrainingType, trainingDuration,
  stepRanges: ['<10k', '10k', ...],
  activityMultipliers: { training: 0.35, rest: 0.28 },
  activityPresets: { training: 'default', rest: 'default' },
  customActivityMultipliers: { training: 0.35, rest: 0.28 },
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

  // History (Dexie)
  cardioSessions: [{ id, date, startTime, startedAt, endedAt, type, duration, intensity, effortType, averageHeartRate?, stepOverlapEnabled? }],
  trainingSessions: [{ id, date, startTime, startedAt, endedAt, type, duration, intensity, effortType, averageHeartRate? }],
  weightEntries: [{ date: 'YYYY-MM-DD', weight }],
  bodyFatEntries: [{ date: 'YYYY-MM-DD', bodyFat }],
  stepEntries: [{ date: 'YYYY-MM-DD', steps, source: 'healthConnect'|'manual' }],
  nutritionData: { 'YYYY-MM-DD': { mealType: [foodEntry, ...] } },
  cachedFoods: [],                  // Cached foods from online/barcode lookups (history-scoped; deduped + capped on persistence)
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
  timestamp: 1699876543210 }
```

Meal types are ordered by `MEAL_TYPE_ORDER`: `breakfast`, `morning_snack`, `lunch`, `afternoon_snack`, `dinner`, `evening_snack`, `other`.

### Phase Structure (Reference-Based)

Daily logs store reference keys (`weightRef`, `bodyFatRef`, `nutritionRef`) pointing to existing datasets — **not** embedded copies. This keeps single-source-of-truth behavior for trackers and phase analytics.

```javascript
{
  id: Date.now(),
  name: 'Bulking Phase',
  startDate: 'YYYY-MM-DD',
  endDate: 'YYYY-MM-DD',       // null for active phases
  goalType: 'bulk',
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

## Gemini AI Parsing Integration

Gemini food parsing is proxied through `api/gemini.js` (server-side key handling) and consumed by `src/services/gemini.js`.

**Canonical system instruction source:**
- `api/gemini.js` → `FOOD_ASSISTANT_SYSTEM_INSTRUCTION`

**Policy requirements:**
- Use **conservative estimation** when uncertainty materially affects calories/macros.
- Prefer **one highest-impact clarification question** for low-confidence cases.
- Do not invent foods/add-ons not explicitly mentioned or clearly visible.
- Preserve machine payload contract exactly (`<food_parser_json>...</food_parser_json>` schema).

If adjusting Gemini behavior, update `FOOD_ASSISTANT_SYSTEM_INSTRUCTION` first and verify parser/contract stability with `tests/utils/gemini.test.js`.

---

## Local Food Catalog (SQLite)

Food search now reads from `src/constants/foodDatabase.sqlite` through `src/services/foodCatalog.js` using `sql.js`.

**Runtime service surface (`services/foodCatalog.js`):**
- `searchFoods({ query, category, subcategory, sortBy, sortOrder, limit, offset })`
- `getFoodById(id)`
- `getFoodsByIds(ids)`
- `getDistinctSubcategories(category)`

`searchFoods(...)` intentionally applies query-aware relevance ordering for name searches (`sortBy === 'name'`) so exact/prefix name matches rank above broad contains matches.

**Compatibility layer:**
- `src/constants/foodDatabase.js` now keeps `FOOD_CATEGORIES` and async helper passthroughs for legacy imports.
- `FOOD_DATABASE` export is intentionally an empty compatibility array; do not repopulate static inline food data.

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

## File Organization

```
src/
├─ components/EnergyMap/
│   ├─ EnergyMapCalculator.jsx   # THE orchestrator (3,400+ lines)
│   ├─ common/
│   │   ├─ ModalShell.jsx        # Core modal wrapper (singleton managers)
│   │   ├─ FoodTagBadges.jsx     # Shared food tag/source badge renderer
│   │   └─ ScreenTabs.jsx        # Tab bar + floating variant
│   ├─ modals/                   # 49 modal files in 6 subfolders, all use ModalShell
│   │   ├─ fullscreen/           # Full-screen takeover modals (WeightTracker, BodyFatTracker, StepTracker, Settings, FoodSearch)
│   │   ├─ pickers/              # Scroll-wheel value pickers (Age, BodyFat, Calendar, Height, Weight, MealType, etc.)
│   │   ├─ info/                 # Read-only info/reference sheets (AdaptiveThermogenesisInfo, BmiInfo, BmrInfo, CalorieBreakdown, TefInfo, etc.)
│   │   ├─ forms/                # Data entry & editing dialogs (Cardio, Goal, PhaseCreation, WeightEntry, etc.)
│   │   ├─ lists/                # Browseable/selectable lists (CardioFavourites, CardioTypeList)
│   │   └─ common/               # Shared utility modals (ConfirmActionModal)
│   ├─ screens/                  # 6 screen components
│   └─ context/                  # Empty (unused)
├─ constants/                    # Static lookup tables
│   ├─ foodDatabase.js           # Compatibility exports + FOOD_CATEGORIES; data lives in SQLite catalog
│   ├─ foodDatabase.sqlite       # Canonical local food catalog database (queried via sql.js)
│   ├─ goals.js                  # Goal definitions with calorie modifiers
│   ├─ cardioTypes.js            # Cardio activities with MET values + step-overlap metadata (`ambulatory`, `cadence`)
│   ├─ trainingTypes.js          # Training presets with cal/hour
│   ├─ mealTypes.js              # MEAL_TYPE_ORDER
│   ├─ activityPresets.js        # DEFAULT_ACTIVITY_MULTIPLIERS; also exports MIN_CUSTOM_ACTIVITY_MULTIPLIER, clampCustomActivityMultiplier(), clampCustomActivityPercent(), getCustomActivityPercent()
│   └─ phaseTemplates.js         # Phase creation templates
├─ hooks/
│   ├─ useAnimatedModal.js       # Modal lifecycle (isOpen/isClosing/requestClose)
│   ├─ useSwipeableScreens.js    # 5-screen horizontal carousel
│   ├─ useHealthConnect.js       # Android Health Connect integration
│   ├─ useNetworkStatus.js       # Online/offline detection
│   └─ useScrollOffScreen.js     # Floating tab bar trigger
├─ store/
│   └─ useEnergyMapStore.js      # Zustand store: state, actions, derived values, persistence
│                                #   calculateBreakdown(steps, isTrainingDay, options?) — options.tefContext + options.adaptiveThermogenesisContext forwarded to core calc
│                                #   calculateTargetForGoal(steps, isTrainingDay, goalKey, options?) — 2-pass refinement for target TEF mode
├─ utils/
│   ├─ calculations.js           # ALL calorie formulas — BMR, cardio, training, TDEE, BMI, FFMI, Smart TEF
│   ├─ epoc.js                   # Session EPOC estimate + carryover window resolution
│   ├─ sessionCarryover.js       # Allocates carryover calories across date boundaries
│   ├─ adaptiveThermogenesis.js  # Adaptive thermogenesis mode resolution + crude/smart correction engine
│   ├─ dailySnapshots.js         # Derived daily snapshot builder + equality helpers
│   ├─ storage.js                # Orchestrates profile (Preferences) + history (Dexie) persistence
│   ├─ historyDatabase.js        # Dexie history DB adapter + sharded document helpers
│   ├─ profile.js                # Age/height sanitization helpers (sanitizeAge, sanitizeHeight, AGE/HEIGHT min/max constants)
│   ├─ weight.js                 # Date normalization, weight clamping, sorting, trend analysis, sparklines
│   ├─ steps.js                  # Step range parsing, step calorie estimation, getStepDetails
│   ├─ bodyFat.js                # Body fat validation, trend analysis, sparklines
│   ├─ bezierPath.js             # SVG cubic Bézier curve interpolation for charts
│   ├─ phases.js                 # Phase metrics calculation
│   ├─ phaseLogV2.js             # Normalized phase/log domain; source-of-truth for phase state
│   ├─ goalAlignment.js          # Weight trend vs goal alignment evaluation
│   ├─ theme.js                  # Native theme application (status bar, transparent nav bar, keyboard)
│   ├─ format.js                 # Number formatting (formatOne: 1 decimal place)
│   ├─ foodPresentation.js       # Food display naming helpers (brand + name formatting)
│   ├─ foodTags.js               # Canonical food source/type resolver + badge metadata/classes
│   ├─ export.js                 # CSV/JSON export generation
│   ├─ dateKeys.js               # Canonical local/UTC date key formatters (`YYYY-MM-DD`)
│   ├─ scroll.js                 # Scroll utilities
│   ├─ trackerHelpers.jsx        # Shared trend/goal-alignment helpers + TrendIcon
│   └─ time.js                   # Time/duration helpers (normalize, round, format, split)
├─ services/
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
  ├─ constants/
  │   └─ activityPresets.test.js
  └─ utils/
    ├─ calculations.test.js
    ├─ dateKeys.test.js
    ├─ adaptiveThermogenesis.test.js
    ├─ dailySnapshots.test.js   # Snapshot derivation and helper behavior tests
    ├─ phaseLogV2.test.js
    ├─ phases.test.js
    ├─ sessionCarryover.test.js
    ├─ steps.test.js
    ├─ foodTags.test.js
    ├─ storage.sharding.test.js
    └─ storage.test.js          # Persistence split + Dexie-first behavior tests
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
52. **Hook frame-throttling is intentional:** Keep RAF scheduling/equality guards in `useScrollOffScreen` and `useSwipeableScreens` to limit high-frequency layout/state churn on mobile.
53. **Food favourites surface is unified:** Use `FoodSearchModal` favourites mode for favourites UX. Do not recreate a standalone `FoodFavouritesModal` surface.
54. **Food tags are centralized:** Reuse `FoodTagBadges` + `foodTags` helpers; do not add per-modal ad-hoc tag/source logic.
55. **Brand display in food cards is name-first:** Use `formatFoodDisplayName` and avoid rendering brand as a separate chip in food list cards.
56. **Gemini instruction authority is server-side:** Keep behavioral prompt updates in `api/gemini.js` (`FOOD_ASSISTANT_SYSTEM_INSTRUCTION`) and preserve the existing `food_parser_json` schema unless a coordinated parser/test update is intentional.
57. **Pinned local foods must remain hydratable outside top-N result windows:** local search currently fetches pinned IDs via `getFoodsByIds(...)` on the first local page and merges them before UI filtering; do not regress to top-limited-only result sources.
58. **Local search ranking is relevance-aware for name sorting:** exact/prefix/word-boundary name matches should outrank generic contains matches (e.g., plain `honey` should not be buried under unrelated composites).
59. **Large food lists are progressively rendered in `FoodSearchModal`:** preserve `visibleResultCount` batching plus offset-based local pagination, and keep the count copy in "loaded count" style (`x foods found`) to avoid heavy first paint on 13k+ catalog datasets.
