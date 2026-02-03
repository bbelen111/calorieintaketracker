# Energy Map Calorie Tracker - AI Coding Instructions

## Target Platform: Mobile (Capacitor)
This app is designed to be wrapped by Capacitor for mobile deployment (iOS/Android).
- **Mobile-First Design:** All UI must fit comfortably on standard mobile viewports (360px-390px width).
- **High Density:** Avoid large, airy desktop-style padding. Prefer tighter spacing (e.g., `p-4` instead of `p-6`, `gap-2` instead of `gap-4`).
- **Touch Targets:** Buttons must be tappable, but visual density should be high to fit information on small screens.
- **Overscroll/Bounce:** Capacitor handles bounce, but the app should manage its own scrolling containers responsibly.
- **Safe Areas:** Be mindful of top (status bar) and bottom (home indicator) safe areas. Use `env(safe-area-inset-*)` variables in global styles (`var(--sat)`, `var(--sab)`, `var(--sal)`, `var(--sar)`).
- **Project Structure:** `dist` folder is synced to native projects via `npx cap sync`.
- **Font Scaling:** Base font size is 13px on mobile, 17px on desktop (768px+) for increased density.
- **App ID:** `com.energymap.tracker` - defined in `capacitor.config.json` as the bundle identifier for native builds.

## Project Overview
React + Vite single-page app for fitness calorie tracking. Uses Framer Motion for animations, Tailwind for styling, **Zustand for state**, and Capacitor Preferences for native persistence. Local-first architecture with optional FatSecret API integration for food search.

**Tech Stack:**
- React 18.3.1 + Vite 5.4.11
- Capacitor 8.0.1 (iOS/Android)
- **Persistence:** `@capacitor/preferences` (Native storage, NOT localStorage)
- **State:** `zustand` store (centralized, debounced persistence)
- Framer Motion 12.23.24 (animations)
- Tailwind 3.4.17 (styling)
- Lucide React (icons)
- **External API:** FatSecret (optional, via Vercel serverless proxy)

**Key Plugins:**
- `@capacitor/preferences` (Data storage)
- `@capacitor/status-bar` (System UI styling)
- `@capacitor/keyboard` (Input handling)
- `@capacitor/splash-screen` (Launch experience)
- `@capgo/capacitor-health` (Health Connect integration on Android)

## Architecture Pattern: Store + Orchestrator

**`EnergyMapCalculator.jsx`** is the UI orchestrator managing:
- All modal states via `useAnimatedModal` hook (40+ modals total)
- Store-backed user data via `useEnergyMapStore` (preferences-backed, debounced)
- Screen navigation via `useSwipeableScreens` hook (5 screens: Logbook, Tracker, Home, Calorie Map, Insights)
- Temporary UI state for pickers, drafts, and forms (e.g., `tempCardioDraft`, `tempPhaseData`)

**Data flow:** User action → Store update → Debounced Save (1s) → Native Preferences → Re-render

**Hydration gate:** `EnergyMapCalculator` waits for `useEnergyMapStore().isLoaded` before rendering to prevent initial flash.

**File stats:** 3000+ lines managing 40+ modal instances, 6 screen components, and all inter-component state coordination.

## Custom Hook Patterns

### `useAnimatedModal` - Modal Lifecycle Management
Returns `{ isOpen, isClosing, open, requestClose, forceClose }`. The `isClosing` flag enables CSS exit animations before unmounting. Never call `setIsOpen(false)` directly - always use `requestClose()` to trigger the 200ms animation sequence.

**Example:**
```jsx
const myModal = useAnimatedModal();
// Opening: myModal.open()
// Closing: myModal.requestClose() - NOT myModal.forceClose()
<MyModal isOpen={myModal.isOpen} isClosing={myModal.isClosing} />
```

### `useEnergyMapStore` - Centralized State
Encapsulates all business logic: BMR calculations, cardio sessions, weight tracking, step ranges. Returns derived values (`bmr`, `trainingCalories`, `totalCardioBurn`) that auto-update when `userData` changes. **Never duplicate calculation logic** - use the store's selectors/actions.
- **Important:** Handles asynchronous loading/saving to native preferences.
- **Debouncing:** Saves are delayed by 1 second to prevent UI stuttering on input.

### `useEnergyMapData` - Legacy Wrapper
Thin compatibility wrapper around the store. Prefer direct store selectors in new code.

### `useSwipeableScreens` - Horizontal Swiping
Manages 5-screen carousel (Logbook, Tracker, Home, Calorie Map, Insights). Returns `currentScreen`, `sliderStyle`, and touch `handlers`. All screens render simultaneously with `flex-shrink-0 w-full` - visibility controlled by transform.

### `useHealthConnect` - Health Connect Integration
Manages Android Health Connect connection for live step data. Returns `{ status, stepData, error, loading, connect, refreshSteps }`. Status values: `'unavailable'`, `'not_installed'`, `'disconnected'`, `'connecting'`, `'connected'`, `'error'`. Only available on Android - returns `'unavailable'` on web/iOS.

## Modal Development Guidelines

1. **Use `ModalShell`** wrapper for all modals - handles overlay, animations, scroll-lock
2. **Pass `isOpen` AND `isClosing`** props to every modal component
3. **Temporary state** lives in parent (`EnergyMapCalculator`), not modal components
4. **Reset temp state** in `useEffect` watching `isClosing` - delay by `MODAL_CLOSE_DELAY` (180ms in parent, 200ms in ModalShell)
5. **Nested modals:** Child modals have longer close delays (+50ms) to prevent flickering during parent modal closing

**Example Modal Structure:**
```jsx
<ModalShell isOpen={isOpen} isClosing={isClosing} contentClassName="w-full md:max-w-2xl p-6">
  <h3 className="text-white font-bold text-xl mb-4">Modal Title</h3>
  {/* Content */}
  <div className="flex gap-2 mt-4">
    <button onClick={onCancel}>Cancel</button>
    <button onClick={onSave}>Save</button>
  </div>
</ModalShell>
```

**Example Temp State Reset:**
```jsx
useEffect(() => {
  if (isClosing) {
    setTimeout(() => setTempDraft(null), MODAL_CLOSE_DELAY);
  }
}, [isClosing]);
```

### ModalShell Architecture
`ModalShell` uses **singleton managers** for sophisticated cross-modal coordination:
- **ModalStackManager:** Tracks z-index stack, ensures topmost modal receives events/escape key
- **SharedOverlayManager:** Single overlay element shared across all modals, prevents flicker during transitions
- **BodyScrollLockManager:** Reference-counted scroll lock, preserves scrollbar width compensation

Modals register on mount, receive dynamic z-index (`BASE_Z_INDEX + stackPosition`), and auto-dim when not topmost. Focus trap and escape key handling only active for topmost modal.

## Calculation System

- **BMR:** Mifflin-St Jeor equation for basic BMR, auto-upgrades to Katch-McArdle when body fat tracking is enabled with valid entries
- **Step calories:** Custom heuristics based on stride length (height × 0.415 for male / 0.413 for female) and weight. Use `getStepCaloriesDetails(stepCount, { weight, height, gender })` from `utils/steps.js` - returns `{ distanceMiles, calories, strideLengthMeters }`.
- **Cardio calories:** MET-based OR heart rate formula (gender-specific coefficients in `HEART_RATE_COEFFICIENTS`)
- **Training calories:** Preset types with `caloriesPerHour` values in `trainingTypeOverrides`, multiplied by duration
- **Goal adjustments:** ±300/500 calorie modifiers applied to TDEE based on goal selection (maintenance, bulk, cut, etc.)

**Never hardcode calculations** - all formulas live in `utils/calculations.js`.

## Storage Architecture (Native Preferences)

Data is split into two keys to optimize performance and prevent dropped frames on large datasets:

1.  **`energyMapData_profile`**: Settings, user stats, preferences.
2.  **`energyMapData_history`**: Heavy data (Weight entries, Nutrition logs, Phases).

**Migration:** Automated migration from `localStorage` (`energyMapData`) triggers on first run via `saveEnergyMapData` in `utils/storage.js`.

`userData` schema (merged in memory):
```javascript
{
  // Profile Data
  age, weight, height, gender,
  trainingType, trainingDuration,
  stepRanges: ['<10k', '10k', ...],
  activityMultipliers: { training: 0.35, rest: 0.28 },
  pinnedFoods: ['food_id1', ...],
  stepGoal: 10000, // Daily step target (default 10000)

  // History Data
  cardioSessions: [{ id, type, duration, intensity, effortType }],
  weightEntries: [{ date: 'YYYY-MM-DD', weight }], // Always normalized & sorted
  bodyFatEntries: [{ date, bodyFat }],
  nutritionData: { 'YYYY-MM-DD': { mealType: [foodEntry, ...] } },
  phases: [{ id, name, startDate, endDate, goal, dailyLogs }],
  stepEntries: [{ date: 'YYYY-MM-DD', steps, source: 'healthConnect'|'manual' }],
}
```

**Weight entries:** Always normalized with `normalizeDateKey()`, sorted with `sortWeightEntries()`, validated with `clampWeight()`. See `utils/weight.js` for helpers.

### Phase/Logbook System
Phases use **reference-based architecture** - daily logs store `weightRef`/`nutritionRef` pointing to `weightEntries`/`nutritionData`, not embedded copies. This prevents data duplication and ensures single source of truth.

**Phase structure:**
```javascript
{
  id: 'uuid',
  name: 'Bulking Phase',
  startDate: 'YYYY-MM-DD',
  endDate: 'YYYY-MM-DD', // null for active phases
  goal: 'bulk',
  startingWeight: 74,
  dailyLogs: {
    'YYYY-MM-DD': { 
      weightRef: true,      // Indicates weight exists in weightEntries
      nutritionRef: true,   // Indicates nutrition exists in nutritionData
      notes: 'Optional'
    }
  }
}
```

Use `calculatePhaseMetrics()` from `utils/phases.js` to compute weight change, weekly rate, completion percentage.

### Food Tracking System
Food entries stored in `nutritionData` keyed by ISO date, then by meal type (breakfast, lunch, dinner, snacks - see `MEAL_TYPE_ORDER`):

```javascript
nutritionData: {
  '2025-11-13': {
    breakfast: [
      { id: 'uuid', foodId: 'chicken_breast', name: 'Chicken Breast', 
        grams: 174, calories: 287, protein: 54, carbs: 0, fats: 6.3, 
        timestamp: 1699876543210 }
    ]
  }
}
```

Food database (`constants/foodDatabase.js`) contains 3000+ items with per-100g macros and preset portions. Use `pinnedFoods` array for quick access favorites.

### FatSecret API Integration
Optional online food search via FatSecret API, proxied through a Vercel serverless function for secure credential handling.

**Architecture:**
- **Client service:** `services/fatSecret.js` - search, barcode lookup, food details
- **Serverless proxy:** `api/fatsecret.js` - OAuth 2.0 token management, Vercel deployment
- **Caching:** Found foods cached in `userData.cachedFoods` to reduce API calls

**Configuration:**
- Set `VITE_FATSECRET_API_BASE` env var for native builds (defaults to Vercel deployment)
- Requires `FATSECRET_CLIENT_ID` and `FATSECRET_CLIENT_SECRET` env vars on Vercel

**Key functions:**
```javascript
import { searchFoods, getFoodDetails, searchByBarcode } from './services/fatSecret';

// Search returns mapped results with per-100g macros
const results = await searchFoods('chicken breast', { page: 0, maxResults: 20 });

// Get full food details including portions
const food = await getFoodDetails(foodId);

// Barcode lookup (UPC/EAN)
const food = await searchByBarcode('012345678901');
```

### Step Tracking System
Step data integrates with Health Connect on Android for automatic syncing:

**Step entries** stored in `stepEntries` array:
```javascript
stepEntries: [
  { date: '2025-01-28', steps: 12543, source: 'healthConnect' }
]
```

**Key components:**
- **`StepTrackerModal`** - Full-screen bar graph visualization with timeframe filtering, goal progress, distance/calories stats
- **`StepGoalPickerModal`** - Scroller-based picker for setting daily step goal (1k-50k in 500 increments)
- **`LiveStepsCard`** (in CalorieMapScreen) - Hero card showing real-time steps with progress bar

**Store actions:** `setStepGoal(goal)`, `saveStepEntry({ date, steps, source })`

## Styling Conventions

- **Tailwind-only** - no custom CSS except animations in `index.css`
- **User Select:** `user-select: none` enabled globally to prevent app text selection.
- **Dark theme:** `slate-800/900` backgrounds, `slate-700` borders, `slate-400` muted text
- **Icons:** Lucide React at 20px default, 32px for headers

## Touch-First Interactive Patterns (Critical)

This is a **mobile-first, touch-first app**. All interactive feedback must prioritize touch devices:

### Hover Gating Pattern ⚠️
**NEVER** use bare `hover:` classes. Always gate to desktop only:
```css
/* ❌ WRONG - affects all devices including touch */
className="hover:bg-blue-600"

/* ✅ CORRECT - desktop only (768px+) */
className="md:hover:bg-blue-600"
```

The same pattern applies to `group-hover:`:
```css
/* ❌ WRONG */
className="group-hover:text-white"

/* ✅ CORRECT */
className="md:group-hover:text-white"
```

### Press Feedback (All Devices)
Every button must have visual press feedback using utility classes:

```css
/* Primary buttons - strong feedback */
className="press-feedback"              /* scale-0.98 + brightness-110 */

/* Secondary/card buttons - moderate feedback */
className="pressable-card"              /* scale-0.99 */

/* Icon buttons - subtle feedback */
className="pressable-inline"            /* scale-0.985 */

/* Generic fallback - subtle */
className="pressable"                   /* scale-0.985 */
```

### Focus Ring Accessibility (Keyboard Navigation)
All interactive elements must have `.focus-ring`:
```css
className="focus-ring"                  /* Blue outline on keyboard focus */
```

### Complete Interactive Element Pattern
```jsx
{/* Primary button */}
<button className="bg-blue-600 md:hover:bg-blue-500 press-feedback focus-ring">
  Save
</button>

{/* Card with interaction */}
<button className="border border-slate-700 md:hover:border-slate-600 pressable-card focus-ring">
  Card
</button>

{/* Icon button */}
<button className="rounded-lg p-2 md:hover:bg-slate-700/50 pressable-inline focus-ring">
  <Icon />
</button>
```

### Responsive Breakpoint
The `md:` prefix (768px) is the boundary:
- **< 768px (Mobile):** Touch press feedback only, no hover
- **≥ 768px (Desktop):** Press feedback + hover enhancements

## Common Pitfalls
1. **Async Storage:** Unlike localStorage, `Preferences` are async. **Always await** load/save operations or use the handled store.
2. **Debouncing:** Do not remove the debounce in `useEnergyMapStore` setup. Saving 2MB of JSON on every keystroke will freeze the UI.
3. **Don't call `forceClose()`** unless absolutely necessary - breaks exit animations.
4. **Step range parsing** is complex - use `parseStepRange()` from `utils/steps.js`, supports `<10k`, `>20k`, `10k-15k` formats.
5. **Cardio effort types:** `'intensity'` (MET-based) vs `'heartRate'` (formula-based) - check `effortType` field.
6. **Training type overrides:** Merged in `useEnergyMapStore`, not raw from constants.
7. **Modal nesting:** Parent must delay cleanup to prevent child unmounting early.
8. **Safe Area padding:** When modifying full-screen layouts, ensure `padding-top/bottom` includes `var(--sat)` / `var(--sab)` for notch support.

## Development Workflow

```powershell
npm install            # First time setup
npm run dev            # Start Vite dev server (localhost:5173)
npm run build          # Production build to dist/
npx cap sync           # Sync build to native projects
npx cap open android   # Open Android Studio
npx cap open ios       # Open Xcode (Mac only)
```

**Linting:**
```powershell
npm run lint           # Check code style
npm run lint:fix       # Auto-fix linting issues
npm run format         # Run Prettier formatting
```

**No tests, no CI** - manual testing required. Check browser console for localStorage warnings.

## File Organization Logic

- **`/screens`** - Full-page views within carousel, receive props from `EnergyMapCalculator`
- **`/modals`** - Self-contained dialogs, all use `ModalShell` wrapper
- **`/common`** - Only `ModalShell` (core wrapper) and `ScreenTabs` live here, not other shared components
- **`/constants`** - Static lookup tables (goals, cardio types, training presets, 3000+ food items)
- **`/utils`** - Pure functions for calculations, parsing, formatting, export (CSV/JSON)
- **`/hooks`** - Stateful logic extraction (modals, data, swiping)
- **`/store`** - Zustand store (hydration, actions, derived state)

## Key Files to Reference
Preferences-backed hooks with derived state and debouncing
- **`calculations.js`** - Canonical calculation implementations
- **`ModalShell.jsx`** - Scroll-lock and animation handling
- **`storage.js`** - Data schema, default values, and migration implementations
- **`useEnergyMapStore.js`** - Zustand state, selectors, derived values, and persistence
