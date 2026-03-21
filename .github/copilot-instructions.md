# Energy Map Calorie Tracker - AI Coding Instructions

## Project Overview

React + Vite single-page app for fitness calorie tracking, wrapped by Capacitor for mobile deployment (iOS/Android). Local-first architecture with Zustand state management, Dexie-backed history persistence plus Capacitor Preferences for profile/settings, and optional FatSecret API for online food search.

**Tech Stack:**
- React 18.3.1 + Vite 5.4.11 (dev server on `localhost:5173`, `strictPort: true`)
- Capacitor 8.0.1 (`appId: com.energymap.tracker`, `webDir: dist`)
- **Persistence (cutover):** Dexie (`IndexedDB`) for history + `@capacitor/preferences` for profile/settings
- **State:** `zustand` 4.5.5 with `subscribeWithSelector` middleware
- Dexie 4.x (history document store + migration metadata)
- Framer Motion 12.23.24 (animations)
- Tailwind 3.4.17 (styling via CSS variable–based semantic tokens)
- Lucide React 0.562.0 (icons)
- **External API:** FatSecret (optional, via Vercel serverless proxy at `api/fatsecret.js`)

**Key Capacitor Plugins:**
- `@capacitor/preferences` — Profile/settings storage + legacy history fallback key during migration
- `@capacitor/app` — App lifecycle, hardware back button
- `@capacitor/status-bar` — Status bar color/style per theme
- `@capacitor/keyboard` — Input handling (`resize: "none"` in config)
- `@capacitor/splash-screen` — Launch screen
- `@capgo/capacitor-health` — Health Connect step sync (Android only)
- `@capgo/capacitor-navigation-bar` — Android navigation bar theming

**Testing exists (Node test runner), no CI pipeline yet.** Use automated tests for touched logic and then perform manual UI checks. No router — single-page app with swipeable screen carousel.

---

## Architecture: Store + Orchestrator Pattern

### The Big Picture

```
main.jsx
  └─ App.jsx (theme management, store hydration gate)
       └─ EnergyMapCalculator.jsx (3,300+ lines — THE orchestrator)
            ├─ 5-screen carousel (useSwipeableScreens)
            │   ├─ LogbookScreen
            │   ├─ TrackerScreen
            │   ├─ HomeScreen
            │   ├─ CalorieMapScreen
            │   └─ InsightsScreen
            ├─ PhaseDetailScreen (drill-down, not in carousel)
            └─ 37 top-level useAnimatedModal instances → 46 modal files
                 └─ ~17 additional child-level modals inside modal components
```

### Data Flow

```
User action → Store action (updateUserData) → deriveState() recalculates
  → Zustand re-renders subscribers → subscribeWithSelector detects userData change
  → Debounced save (1s) → saveEnergyMapData() splits into profile/history
  → Profile save: Capacitor Preferences.set(profile)
  → History save: Dexie write (default)
  → Legacy fallback save: Preferences.set(history) if dual-write enabled OR Dexie write fails
```

### Key Architectural Decisions

1. **Single orchestrator file (`EnergyMapCalculator.jsx`)** owns all modal lifecycle state, temporary form drafts, and screen navigation. At 3,237 lines, it's deliberately centralized — not a candidate for splitting. New modals are instantiated here.

2. **Derived state pattern:** The Zustand store's `deriveState()` function recomputes `bmr`, `trainingCalories`, `totalCardioBurn`, sorted entries, and resolved types on every `userData` mutation. Never duplicate these calculations — consume them from the store.

3. **Store initialization is async.** `setupEnergyMapStore()` is called once from `EnergyMapCalculator`, which gates rendering on `isLoaded === true` to prevent flash of default data.

4. **`main.jsx` bootstraps** by preventing pinch-to-zoom gestures (gesturestart/change/end + Ctrl+wheel), configuring Capacitor keyboard settings, and rendering `<App />` — no providers, no router.

5. **Phase domain is currently dual-represented** (legacy `phases` + normalized `phaseLogV2`) and synchronized in store actions. Treat `phaseLogV2` as normalization infrastructure while UI remains legacy-facing.

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
1. Calls `initialize()` to load profile from Preferences + history from Dexie (with legacy key backfill fallback)
2. Subscribes to `userData` changes with a 1-second debounced save (`SAVE_DEBOUNCE_MS = 1000`)

**Critical:** Do not remove the debounce — saving 2MB+ JSON on every keystroke freezes the UI.

**Also critical:** The debounced callback is async and must retain try/catch handling to avoid unhandled save failures.

### Legacy: `useEnergyMapData` Hook

Deprecated 7-line wrapper that spreads the entire store state. Defeats `shallow` comparison. **Prefer direct store selectors** in new code.

---

## Modal System

### Modal Count

- **37 `useAnimatedModal()` instances** in `EnergyMapCalculator.jsx` (top-level orchestrator)
- **~17 additional child-level modals** declared inside modal components (e.g., delete confirmations, sub-pickers)
- **46 modal files** organised into 6 subfolders inside `src/components/EnergyMap/modals/`:
  - `fullscreen/` — WeightTrackerModal, BodyFatTrackerModal, StepTrackerModal, SettingsModal, FoodSearchModal
  - `pickers/` — AgePickerModal, BodyFatPickerModal, CalendarPickerModal, DatePickerModal, DurationPickerModal, FoodPortionModal, HeartRatePickerModal, HeightPickerModal, MealTypePickerModal, MetValuePickerModal, StepGoalPickerModal, TemplatePickerModal, WeightPickerModal
  - `info/` — BmiInfoModal, BmrInfoModal, BodyFatTrendInfoModal, CalorieBreakdownModal, CaloriesPerHourGuideModal, FfmiInfoModal, TefInfoModal, WeightTrendInfoModal
  - `forms/` — AddCustomFoodModal, BodyFatEntryModal, CardioModal, CustomCardioTypeModal, DailyActivityCustomModal, DailyActivityEditorModal, DailyActivityModal, DailyLogModal, FoodEntryModal, GoalModal, PhaseCreationModal, TrainingModal, StepRangesModal, TrainingTypeEditorModal, WeightEntryModal
  - `lists/` — CardioFavouritesModal, CardioTypeListModal, FoodFavouritesModal
  - `common/` — ConfirmActionModal
- Total across codebase: ~54 modal instances

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

`ModalShell` (`common/ModalShell.jsx`, 601 lines) uses **three singleton managers**:
- **`ModalStackManager`** — Assigns z-index per modal (`BASE_Z_INDEX=1000 + position`), tracks topmost for escape/focus
- **`SharedOverlayManager`** — Single backdrop element shared across all modals, progressive darkening per nesting depth
- **`BodyScrollLockManager`** — Reference-counted scroll lock with scrollbar width compensation

Modals auto-register on mount, auto-dim when not topmost. Content uses CSS animations from `index.css` (`modalSlideUp`/`modalSlideDown`).

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

Child modals should use longer close delays (+50ms) to prevent premature unmounting:
```javascript
const childModal = useAnimatedModal(false, MODAL_CLOSE_DELAY); // 180ms instead of default
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

**11 accent tokens:** `accent-blue`, `accent-green`, `accent-lime`, `accent-emerald`, `accent-yellow`, `accent-amber`, `accent-orange`, `accent-red`, `accent-purple`, `accent-slate`, `accent-indigo`

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
| Step calories | `getStepDetails(steps, userData)` | **Lives in `utils/steps.js`**, not calculations.js. Stride length heuristic: height × 0.415 (male) / 0.413 (female) |
| Cardio (single) | `calculateCardioCalories(session, userData, cardioTypes)` | MET-based (`effortType: 'intensity'`) or heart rate formula (`effortType: 'heartRate'`) |
| Cardio (total) | `getTotalCardioBurn(userData, cardioTypes)` | Sums `calculateCardioCalories` across all `userData.cardioSessions` |
| Training cal/hr | `getTrainingCaloriesPerHour(userData, trainingTypes)` | Base cal/hr × intensity multiplier (light 0.75 / moderate 1.0 / vigorous 1.25) |
| Training (total) | `getTrainingCalories(userData, trainingTypes)` | Supports `trainingEffortType: 'heartRate'` or intensity-based. `caloriesPerHour × trainingDuration` from resolved types |
| TDEE breakdown | `calculateCalorieBreakdown({...})` | BMR + activity multiplier + training + cardio + steps. Accepts optional `tefContext`. Returns `bmrDetails`, TEF fields when Smart TEF is enabled |
| TDEE (simple) | `calculateTDEE(options)` | Convenience wrapper — returns just `calculateCalorieBreakdown(options).total` |
| Goal target | `calculateGoalCalories(tdee, goal)` | Applies ±300/500 modifier based on goal |
| BMI | `calculateBMI(weight, height)` | Standard BMI: weight(kg) / height(m)² |
| BMI category | `getBMICategory(bmi)` | Returns `{ label, color }` for underweight/normal/overweight/obese |
| FFMI | `calculateFFMI(weight, height, bodyFatPercent)` | Fat-Free Mass Index — returns `{ raw, normalized, leanMass }` |
| FFMI category | `getFFMICategory(ffmi, gender)` | Returns `{ label, color }` from "Below average" to "Suspiciously high" |
| TEF (from macros) | `calculateTefFromMacros({proteinGrams, carbsGrams, fatsGrams})` | Protein×25% + Carbs×8% + Fats×2% of caloric content |
| TEF (target mode) | `calculateTargetTef({targetCalories, weightKg, ...})` | Estimates TEF using weight-derived macro targets |
| TEF (dynamic mode) | `calculateDynamicTef({totals, ...})` | Uses today's logged macro totals for live TEF estimate |

**TEF constants** exported from `calculations.js`: `TEF_MULTIPLIER_OFFSET = 0.1`, `TEF_PROTEIN_RATE = 0.25`, `TEF_CARB_RATE = 0.08`, `TEF_FAT_RATE = 0.02`.

**Smart TEF mechanic:** When `userData.smartTefEnabled` is true and a `tefContext` is passed, `calculateCalorieBreakdown()` subtracts `TEF_MULTIPLIER_OFFSET` (10%) from the NEAT activity multiplier (`effectiveActivityMultiplier = rawActivityMultiplier - 0.1`) then adds the macro-based TEF back as an explicit line item. Net effect is neutral at default macro ratios but improves accuracy with real logged data. The breakdown return object gains: `rawActivityMultiplier`, `effectiveActivityMultiplier`, `tefOffsetApplied`, `tefMode`, `smartTefCalories`, `smartTefDetails`.

**`tefContext` shape:** `{ mode: 'off' | 'target' | 'dynamic', totals?: {protein, carbs, fats}, targetCalories?: number, weightKg?: number, enabled?: boolean }`

**Target mode chicken-and-egg:** The store's `calculateTargetForGoal()` runs a 2-pass refinement loop — pass 1 seeds `targetCalories` with pre-TEF TDEE; pass 2 uses goal-adjusted result from pass 1. Two iterations converges sufficiently.

**Training types** are resolved at the store level (`resolveTrainingTypes`) by merging `trainingTypes` constants with `userData.trainingTypeOverrides`. Never use raw constants directly.

---

## Storage Architecture (`utils/storage.js`, `utils/historyDatabase.js`)

### Split Storage Keys

| Key | Contents | Why |
|-----|----------|-----|
| `energyMapData_profile` | Settings, user stats, preferences, small lists | Primary profile/settings source of truth |
| `energyMapData_history` | Legacy history mirror/fallback | Used for backfill/fallback during and after cutover |

Primary history store is now Dexie (`energyMapHistory` DB), with document rows keyed by history field name.

Split is determined by `HISTORY_FIELDS` array: `weightEntries`, `bodyFatEntries`, `stepEntries`, `nutritionData`, `phases`, `phaseLogV2`, `cardioSessions`.

### Dexie History Store

`utils/historyDatabase.js` manages:
- DB name: `energyMapHistory`
- `historyDocuments` table (`id` = history field key, payload document)
- `metadata` table (migration markers, e.g. `historyMigrationState`)

Helper surface:
- `loadHistoryFromDexie(historyFieldKeys)`
- `saveHistoryToDexie(historyData)`
- `getDexieHistoryMigrationState()`
- `setDexieHistoryMigrationState(value)`

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

Migration behavior is layered:
1. One-time migration from `localStorage` key `energyMapData` into current persistence (`saveEnergyMapData`).
2. On load, if Dexie history is empty, app backfills from legacy `energyMapData_history` key.
3. Migration metadata is written to Dexie `metadata` table (`historyMigrationState`) after confirmed backfill success.

### Default Data

`getDefaultEnergyMapData()` in `utils/storage.js` defines the full schema with defaults. Key defaults:
- `age: 21`, `weight: 74`, `height: 168`, `gender: 'male'`, `theme: 'auto'`
- `stepGoal: 10000`, `trainingType: 'bodybuilding'`, `trainingDuration: 2`
- `trainingEffortType: 'intensity'`, `trainingIntensity: 'moderate'`, `trainingHeartRate: ''`
- `customTrainingName: 'My Training'`, `customTrainingCalories: 220`, `customTrainingDescription: 'Custom training style'`
- 6 preset training types in `trainingTypeOverrides` with calories/hour values (bodybuilding 220, powerlifting 180, strongman 280, crossfit 300, calisthenics 240, custom 220)
- `activityMultipliers: { training: 0.35, rest: 0.28 }`
- `activityPresets: { training: 'default', rest: 'default' }`
- `customActivityMultipliers: { training: 0.35, rest: 0.28 }`
- `smartTefEnabled: false`

---

## Data Schemas

### `userData` (merged in memory from both storage keys)

```javascript
{
  // Profile
  age, weight, height, gender,
  theme: 'auto',                    // 'auto' | 'dark' | 'light' | 'amoled_dark'
  trainingType, trainingDuration,
  trainingEffortType: 'intensity',  // 'intensity' | 'heartRate'
  trainingIntensity: 'moderate',    // 'light' | 'moderate' | 'vigorous'
  trainingHeartRate: '',            // BPM string for HR-based training calc
  stepRanges: ['<10k', '10k', ...],
  activityMultipliers: { training: 0.35, rest: 0.28 },
  activityPresets: { training: 'default', rest: 'default' },
  customActivityMultipliers: { training: 0.35, rest: 0.28 },
  trainingTypeOverrides: { bodybuilding: { label, description, caloriesPerHour }, ... },
  pinnedFoods: ['food_id1', ...],
  cachedFoods: [],                  // Foods from FatSecret API
  foodFavourites: [],
  cardioFavourites: [],
  customCardioTypes: {},
  stepGoal: 10000,
  bodyFatTrackingEnabled: true,
  smartTefEnabled: false,          // Explicit macro-based TEF replaces implicit 10% in NEAT

  // History (primary in Dexie, legacy fallback in Preferences history key)
  cardioSessions: [{ id, type, duration, intensity, effortType, averageHeartRate? }],
  weightEntries: [{ date: 'YYYY-MM-DD', weight }],
  bodyFatEntries: [{ date: 'YYYY-MM-DD', bodyFat }],
  stepEntries: [{ date: 'YYYY-MM-DD', steps, source: 'healthConnect'|'manual' }],
  nutritionData: { 'YYYY-MM-DD': { mealType: [foodEntry, ...] } },
  phases: [{ id, name, startDate, endDate, goal, startingWeight, status, dailyLogs }],
  phaseLogV2: { version, phasesById, phaseOrder, activePhaseId, logsById, logIdsByPhaseId, logIdByPhaseDate },
  activePhaseId: null,
}
```

### Food Entry Shape

```javascript
{ id: 'uuid', foodId: 'chicken_breast', name: 'Chicken Breast',
  grams: 174, calories: 287, protein: 54, carbs: 0, fats: 6.3,
  timestamp: 1699876543210 }
```

Meal types ordered by `MEAL_TYPE_ORDER` constant: breakfast, lunch, dinner, snacks.

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

### Phase/Logbook v2 Bridge (`utils/phaseLogV2.js`)

The app currently uses a **bridge model**:

- UI screens and modals still consume legacy `phases[].dailyLogs`.
- Store normalization synchronizes to/from `phaseLogV2` (`convertLegacyPhasesToPhaseLogV2` and `convertPhaseLogV2ToLegacyPhases`).
- Single-active-phase constraints are enforced in normalization (`active` uniqueness).

When editing phase logic:

1. Update legacy behavior used by UI.
2. Keep conversion semantics intact.
3. Ensure deletions clear dangling references (weight/body-fat/nutrition refs).

---

## FatSecret API Integration

Optional online food search proxied through Vercel serverless function.

**Architecture:**
- `services/fatSecret.js` — Client service with 15-second timeout, `FatSecretError` class
- `api/fatsecret.js` — Vercel serverless proxy handling OAuth 2.0 token management

**Configuration:**
- Native builds: Set `VITE_FATSECRET_API_BASE` env var to deployed Vercel URL
- Default: `https://calorieintaketracker.vercel.app/api/fatsecret`
- Vercel env vars: `FATSECRET_CLIENT_ID`, `FATSECRET_CLIENT_SECRET`

**Key functions:**
```javascript
import { searchFoods, getFoodDetails, searchByBarcode } from './services/fatSecret';
const results = await searchFoods('chicken breast', { page: 0, maxResults: 20 });
const food = await getFoodDetails(foodId);
const food = await searchByBarcode('012345678901');
```

Results cached in `userData.cachedFoods` to reduce API calls.

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
│   ├─ EnergyMapCalculator.jsx   # THE orchestrator (3,300+ lines)
│   ├─ common/
│   │   ├─ ModalShell.jsx        # Core modal wrapper (601 lines, singleton managers)
│   │   └─ ScreenTabs.jsx        # Tab bar + floating variant
│   ├─ modals/                   # 46 modal files in 6 subfolders, all use ModalShell
│   │   ├─ fullscreen/           # Full-screen takeover modals (WeightTracker, BodyFatTracker, StepTracker, Settings, FoodSearch)
│   │   ├─ pickers/              # Scroll-wheel value pickers (Age, BodyFat, Calendar, Height, Weight, MealType, etc.)
│   │   ├─ info/                 # Read-only info/reference sheets (BmiInfo, BmrInfo, CalorieBreakdown, TefInfo, etc.)
│   │   ├─ forms/                # Data entry & editing dialogs (Cardio, Goal, PhaseCreation, WeightEntry, etc.)
│   │   ├─ lists/                # Browseable/selectable lists (CardioFavourites, FoodFavourites)
│   │   └─ common/               # Shared utility modals (ConfirmActionModal)
│   ├─ screens/                  # 6 screen components
│   └─ context/                  # Empty (unused)
├─ constants/                    # Static lookup tables
│   ├─ foodDatabase.js           # 3000+ food items (per-100g macros + portions)
│   ├─ goals.js                  # Goal definitions with calorie modifiers
│   ├─ cardioTypes.js            # Cardio activities with MET values
│   ├─ trainingTypes.js          # Training presets with cal/hour
│   ├─ mealTypes.js              # MEAL_TYPE_ORDER
│   ├─ activityPresets.js        # DEFAULT_ACTIVITY_MULTIPLIERS; also exports MIN_CUSTOM_ACTIVITY_MULTIPLIER, clampCustomActivityMultiplier(), clampCustomActivityPercent(), getCustomActivityPercent()
│   └─ phaseTemplates.js         # Phase creation templates
├─ hooks/
│   ├─ useAnimatedModal.js       # Modal lifecycle (isOpen/isClosing/requestClose)
│   ├─ useEnergyMapData.js       # DEPRECATED — use store directly
│   ├─ useSwipeableScreens.js    # 5-screen horizontal carousel
│   ├─ useHealthConnect.js       # Android Health Connect integration
│   ├─ useNetworkStatus.js       # Online/offline detection
│   └─ useScrollOffScreen.js     # Floating tab bar trigger
├─ store/
│   └─ useEnergyMapStore.js      # Zustand store: state, actions, derived values, persistence
│                                #   calculateBreakdown(steps, isTrainingDay, options?) — options.tefContext forwarded to core calc
│                                #   calculateTargetForGoal(steps, isTrainingDay, goalKey, options?) — 2-pass refinement for target TEF mode
├─ utils/
│   ├─ calculations.js           # ALL calorie formulas — BMR, cardio, training, TDEE, BMI, FFMI, Smart TEF
│   ├─ storage.js                # Orchestrates profile (Preferences) + history (Dexie) persistence and migration fallback
│   ├─ historyDatabase.js        # Dexie history DB adapter + migration metadata helpers
│   ├─ profile.js                # Age/height sanitization helpers (sanitizeAge, sanitizeHeight, AGE/HEIGHT min/max constants)
│   ├─ weight.js                 # Date normalization, weight clamping, sorting, trend analysis, sparklines (325 lines)
│   ├─ steps.js                  # Step range parsing, step calorie estimation, getStepDetails (153 lines)
│   ├─ bodyFat.js                # Body fat validation, trend analysis, sparklines (262 lines)
│   ├─ bezierPath.js             # SVG cubic Bézier curve interpolation for charts (168 lines)
│   ├─ phases.js                 # Phase metrics calculation (132 lines)
│   ├─ phaseLogV2.js             # Normalized phase/log domain + legacy bridge conversion
│   ├─ goalAlignment.js          # Weight trend vs goal alignment evaluation
│   ├─ theme.js                  # Native theme application (status bar, transparent nav bar, keyboard)
│   ├─ format.js                 # Number formatting (formatOne: 1 decimal place)
│   ├─ export.js                 # CSV/JSON export generation
│   ├─ scroll.js                 # Scroll utilities
│   └─ time.js                   # Time/duration helpers (normalize, round, format, split)
├─ services/
│   └─ fatSecret.js              # FatSecret API client (403 lines)
└─ tests/                        # Node test runner suite (`node --test`)
  ├─ constants/
  └─ utils/
     ├─ storage.test.js          # Persistence split + migration + fallback behavior tests
└─ native/                       # DEPRECATED — use utils/theme.js applyNativeTheme() instead
    ├─ statusBar.js
    └─ navigationBar.js
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

**ESLint config:** Flat config format (`eslint.config.js`), uses `@babel/eslint-parser` with JSX preset. `react/prop-types` is disabled. Prettier runs as an ESLint rule.

---

## Common Pitfalls

1. **Async storage:** `Preferences.get()`/`.set()` are async. Always `await` or use the store (which handles it internally).
2. **Save debounce:** The 1-second debounce in `setupEnergyMapStore` is critical. Removing it causes UI freezes from serializing large JSON on every keystroke.
3. **Dexie is primary for history now:** Do not treat `energyMapData_history` as primary source; it is fallback/backfill compatibility storage.
4. **Fallback semantics matter:** If Dexie history save fails, legacy Preferences history write is attempted automatically. Do not remove this fallback without a deliberate cleanup release.
5. **Warnings should indicate real risk only:** Avoid noisy warnings for successful fallback paths.
6. **Never call `forceClose()`** on modals unless absolutely necessary — it skips exit animations and can cause visual glitches.
7. **Step range parsing** is complex — always use `parseStepRange()` from `utils/steps.js`. It handles `<10k`, `>20k`, `10k-15k`, `+` suffix formats.
8. **Cardio effort types:** Check `session.effortType` — `'intensity'` uses MET-based calculation, `'heartRate'` uses gender-specific heart rate coefficients.
9. **Training type resolution:** Never use raw `trainingTypes` constants. The store's `resolveTrainingTypes()` merges constants with user overrides. Consume `trainingTypes` from the store.
10. **Modal nesting:** Parent modals must delay state cleanup to prevent child modals from unmounting mid-animation. Use `MODAL_CLOSE_DELAY` (180ms) with `setTimeout`.
11. **Safe areas:** Full-screen layouts must include `var(--sat)` / `var(--sab)` for notch and home indicator support.
12. **No hardcoded colors:** Never use `bg-slate-*`, `text-white`, `border-slate-*`, `text-blue-400`, etc. Always use semantic tokens or accent tokens.
13. **Hover gating:** Never use bare `hover:` — always use `md:hover:` to prevent sticky hover on touch devices.
14. **Weight entries:** Always normalize dates with `normalizeDateKey()`, validate with `clampWeight()` (30-210 kg range), and sort with `sortWeightEntries()` before storing.
15. **`native/` folder is deprecated.** Use `utils/theme.js` `applyNativeTheme()` for all native platform styling.
16. **Smart TEF and NEAT:** When `userData.smartTefEnabled` is true, `calculateCalorieBreakdown()` subtracts `TEF_MULTIPLIER_OFFSET` (0.1) from the activity multiplier and adds macro-derived TEF back explicitly. The displayed NEAT multiplier in `CalorieBreakdownModal` will therefore appear lower than the user's configured value — this is intentional and explained in `TefInfoModal`. Never remove the offset without also disabling TEF.
17. **Activity multiplier clamping:** Custom activity multipliers have a floor defined by `MIN_CUSTOM_ACTIVITY_MULTIPLIER` in `activityPresets.js`. Always use `clampCustomActivityMultiplier()` when persisting custom NEAT values. The `DailyActivityCustomModal` picker starts at `MIN_CUSTOM_ACTIVITY_PERCENT` (10%), not 0.
18. **Calorie breakdown request object:** `openCalorieBreakdown()` in the orchestrator accepts either a plain step count (legacy) or a `{ steps, tefContext }` object. `CalorieMapScreen` step cards and the live Health Connect card pass the full object to enable correct TEF mode selection.
19. **Nutrition references are data-backed, not cosmetic:** `nutritionRef` should map to a day that actually has entries in `nutritionData`. If meals are deleted for a date, clear stale refs (store sync handles this for food actions).
20. **Phase metrics are nutrition-aware now:** Never hardcode `avgCalories = 0` in phase UIs. Use `calculatePhaseMetrics(phase, weightEntries, nutritionData)`.
21. **Daily log nutrition management route:** In logbook flow, nutrition management routes through the Tracker screen date context; preserve selected date handoff when adjusting this UX.
22. **Dual-write toggle:** `VITE_ENABLE_HISTORY_DUAL_WRITE=false` is the cutover default. Set true only for conservative rollback windows.
23. **Node ESM import hygiene:** For modules used in tests, keep explicit `.js` file extensions in relative imports to avoid `ERR_MODULE_NOT_FOUND`.
