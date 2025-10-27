# Energy Map Calorie Tracker - AI Coding Instructions

## Project Overview
React + Vite single-page app for fitness calorie tracking. Uses Framer Motion for animations, Tailwind for styling, and localStorage for persistence. **No backend, no API calls, no routing** - pure client-side state management.

## Architecture Pattern: Centralized State Coordinator

**`EnergyMapCalculator.jsx`** is the single source of truth - a 900+ line orchestrator managing:
- All modal states via `useAnimatedModal` hook (20+ modals)
- User data via `useEnergyMapData` hook (localStorage-backed)
- Screen navigation via `useSwipeableScreens` hook
- Temporary UI state for pickers, drafts, and forms

**Data flow:** User action → Modal state change → `useEnergyMapData` hook → localStorage → Re-render

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

### `useSwipeableScreens` - Horizontal Swiping
Manages 5-screen carousel (Logbook, Tracker, Home, Calorie Map, Insights). Returns `currentScreen`, `sliderStyle`, and touch `handlers`. All screens render simultaneously with `flex-shrink-0 w-full` - visibility controlled by transform.

## Modal Development Guidelines

1. **Use `ModalShell`** wrapper for all modals - handles overlay, animations, scroll-lock
2. **Pass `isOpen` AND `isClosing`** props to every modal component
3. **Temporary state** lives in parent (`EnergyMapCalculator`), not modal components
4. **Reset temp state** in `useEffect` watching `isClosing` - delay by animation duration
5. **Nested modals:** Child modals have longer close delays to prevent flickering

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

## Calculation System

- **BMR:** Mifflin-St Jeor equation in `calculations.js`
- **Step calories:** Custom heuristics based on stride length (height × 0.415/0.413) and weight
- **Cardio calories:** MET-based OR heart rate formula (gender-specific coefficients)
- **Training calories:** Preset types with `caloriesPerHour` values, multiplied by duration
- **Goal adjustments:** ±300/500 calorie modifiers applied to TDEE

**Never hardcode calculations** - all formulas live in `utils/calculations.js`.

## Storage Architecture

`userData` schema (see `storage.js` defaults):
```javascript
{
  age, weight, height, gender,
  trainingType, trainingDuration,
  stepRanges: ['<10k', '10k', '12k', ...],
  cardioSessions: [{ id, type, duration, intensity, effortType }],
  weightEntries: [{ date: 'YYYY-MM-DD', weight }],
  activityMultipliers: { training: 0.35, rest: 0.28 },
  // ... 10+ more fields
}
```

**Weight entries:** Always normalized with `normalizeDateKey()`, sorted with `sortWeightEntries()`, validated with `clampWeight()`. See `utils/weight.js` for helpers.

## Styling Conventions

- **Tailwind-only** - no custom CSS except animations in `index.css`
- **Dark theme:** `slate-800/900` backgrounds, `slate-700` borders, `slate-400` muted text
- **Interactive states:** `hover:bg-*` on desktop, `active:scale-95` for mobile feedback
- **Responsive:** Grid layouts with `md:` breakpoints, `hidden md:inline` for labels
- **Icons:** Lucide React at 20px default, 32px for headers

## Common Pitfalls

1. **Don't call `forceClose()`** unless absolutely necessary - breaks exit animations
2. **Step range parsing** is complex - use `parseStepRange()` from `utils/steps.js`, supports `<10k`, `>20k`, `10k-15k` formats
3. **Cardio effort types:** `'intensity'` (MET-based) vs `'heartRate'` (formula-based) - check `effortType` field
4. **Training type overrides:** Merged in `useEnergyMapData`, not raw from constants
5. **Modal nesting:** Parent must delay cleanup to prevent child unmounting early

## Development Workflow

```powershell
npm install        # First time setup
npm run dev        # Start Vite dev server (localhost:5173)
npm run build      # Production build to dist/
npm run preview    # Test production build locally
```

**No tests, no linters, no CI** - manual testing required. Check browser console for localStorage warnings.

## File Organization Logic

- **`/screens`** - Full-page views within carousel, receive props from `EnergyMapCalculator`
- **`/modals`** - Self-contained dialogs, all use `ModalShell` wrapper
- **`/modals/common`** - Only `ModalShell` (core wrapper) lives here, not other shared components
- **`/constants`** - Static lookup tables (goals, cardio types, training presets)
- **`/utils`** - Pure functions for calculations, parsing, formatting
- **`/hooks`** - Stateful logic extraction (modals, data, swiping)

## Key Files to Reference

- **`EnergyMapCalculator.jsx`** - Pattern for state management and modal orchestration
- **`useEnergyMapData.js`** - Pattern for localStorage hooks with derived state
- **`calculations.js`** - Canonical calculation implementations
- **`ModalShell.jsx`** - Scroll-lock and animation handling
- **`storage.js`** - Default data schema and merge logic
