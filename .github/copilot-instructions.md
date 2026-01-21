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
React + Vite single-page app for fitness calorie tracking. Uses Framer Motion for animations, Tailwind for styling, and Capacitor Preferences for native persistence. **No backend, no API calls, no routing** - pure client-side state management. Fully offline-capable local-first architecture.

**Tech Stack:**
- React 18.3.1 + Vite 5.4.11
- Capacitor 8.0.1 (iOS/Android)
- **Persistence:** `@capacitor/preferences` (Native storage, NOT localStorage)
- Framer Motion 12.23.24 (animations)
- Tailwind 3.4.17 (styling)
- Lucide React (icons)

**Key Plugins:**
- `@capacitor/preferences` (Data storage)
- `@capacitor/status-bar` (System UI styling)
- `@capacitor/keyboard` (Input handling)
- `@capacitor/splash-screen` (Launch experience)

## Architecture Pattern: Centralized State Coordinator

**`EnergyMapCalculator.jsx`** is the single source of truth - a 2700+ line orchestrator managing:
- All modal states via `useAnimatedModal` hook (40+ modals total)
- User data via `useEnergyMapData` hook (preferences-backed, debounced)
- Screen navigation via `useSwipeableScreens` hook (6 screens: Logbook, Tracker, Home, Calorie Map, Insights, Phase Detail)
- Temporary UI state for pickers, drafts, and forms (e.g., `tempCardioDraft`, `tempPhaseData`)

**Data flow:** User action → Modal state change → `useEnergyMapData` hook → Debounced Save (1s) → Native Preferences → Re-render

**File stats:** 2700+ lines managing 40+ modal instances, 6 screen components, and all inter-component state coordination.

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

### `useEnergyMapData` - Single State Hook
Encapsulates all business logic: BMR calculations, cardio sessions, weight tracking, step ranges. Returns derived values (`bmr`, `trainingCalories`, `totalCardioBurn`) that auto-update when `userData` changes. **Never duplicate calculation logic** - use the hook's exported functions.
- **Important:** Handles asynchronous loading/saving to native preferences.
- **Debouncing:** Saves are delayed by 1 second to prevent UI stuttering on input.

### `useSwipeableScreens` - Horizontal Swiping
Manages 5-screen carousel (Logbook, Tracker, Home, Calorie Map, Insights). Returns `currentScreen`, `sliderStyle`, and touch `handlers`. All screens render simultaneously with `flex-shrink-0 w-full` - visibility controlled by transform.

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
- **Step calories:** Custom heuristics based on stride length (height × 0.415 for male / 0.413 for female) and weight
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

  // History Data
  cardioSessions: [{ id, type, duration, intensity, effortType }],
  weightEntries: [{ date: 'YYYY-MM-DD', weight }], // Always normalized & sorted
  bodyFatEntries: [{ date, bodyFat }],
  nutritionData: { 'YYYY-MM-DD': { mealType: [foodEntry, ...] } },
  phases: [{ id, name, startDate, endDate, goal, dailyLogs }],
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

## Styling Conventions

- **Tailwind-only** - no custom CSS except animations in `index.css`
- **User Select:** `user-select: none` enabled globally to prevent app text selection.
- **Dark theme:** `slate-800/900` backgrounds, `slate-700` borders, `slate-400` muted text
- **Interactive states:** `hover:bg-*` on desktop, `active:scale-95` for mobile feedback
- **Responsive:** Grid layouts with `md:` breakpoints, `hidden md:inline` for labels
- **Icons:** Lucide React at 20px default, 32px for headers

## Common Pitfalls
 **Async Storage:** Unlike localStorage, `Preferences` are async. **Always await** load/save operations or use the handled `useEnergyMapData` hook.
2.  **Debouncing:** Do not remove the `setTimeout` in `useEnergyMapData`. Saving 2MB of JSON on every keystroke will freeze the UI.
3.  **Don't call `forceClose()`** unless absolutely necessary - breaks exit animations
4.  **Don't call `forceClose()`** unless absolutely necessary - breaks exit animations
2. **Step range parsing** is complex - use `parseStepRange()` from `utils/steps.js`, supports `<10k`, `>20k`, `10k-15k` formats
3. **Cardio effort types:** `'intensity'` (MET-based) vs `'heartRate'` (formula-based) - check `effortType` field
4. **Training type overrides:** Merged in `useEnergyMapData`, not raw from constants
5. **Modal nesting:** Parent must delay cleanup to prevent child unmounting early
6. **Safe Area padding:** When modifying full-screen layouts, ensure `padding-top/bottom` includes `var(--sat)` / `var(--sab)` for notch support.

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

## Key Files to Reference
Preferences-backed hooks with derived state and debouncing
- **`calculations.js`** - Canonical calculation implementations
- **`ModalShell.jsx`** - Scroll-lock and animation handling
- **`storage.js`** - Data schema, default values, and migrationplementations
- **`ModalShell.jsx`** - Scroll-lock and animation handling
- **`storage.js`** - Default data schema and merge logic
