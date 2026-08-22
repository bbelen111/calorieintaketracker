---
paths:
  - src/components/**
---

# Energy Map Calorie Tracker - UI, Modals & Screens

## Modal System

### Modal Count

- **46 top-level `useAnimatedModal()` instances** in `EnergyMapCalculator.jsx` (top-level orchestrator)
- **~21 additional child-level modals** declared inside modal components (e.g., delete confirmations, sub-pickers)
- **57 modal component files** organised into 6 subfolders inside `src/components/EnergyMap/modals/`, plus 5 supporting panel components under `fullscreen/panels/`:
  - `fullscreen/` — WeightTrackerModal, BodyFatTrackerModal, StepTrackerModal, SettingsModal, FoodSearchModal, AdaptiveThermogenesisModal, RollingEnergyBalanceModal
  - `pickers/` — AgePickerModal, CalendarPickerModal, **CaloriesPerHourPickerModal**, DatePickerModal, DurationPickerModal, EpocWindowPickerModal, FoodPortionModal, HeartRatePickerModal, HeightPickerModal, **MacroPickerModal**, MealTypePickerModal, MetValuePickerModal, **NumericValuePickerModal**, StepGoalPickerModal, TemplatePickerModal, TimePickerModal
  - `info/` — AdaptiveThermogenesisInfoModal, BmiInfoModal, BmrInfoModal, BodyFatTrendInfoModal, CalorieBreakdownModal, CaloriesPerHourGuideModal, EpocInfoModal, FfmiInfoModal, TefInfoModal, WeightTrendInfoModal
  - `forms/` — AddCustomFoodModal, BarcodeEntryModal, BodyFatEntryModal, CardioModal, CustomCardioTypeModal, DailyActivityCustomModal, DailyActivityEditorModal, DailyActivityModal, DailyLogModal, **DailyNeatOverrideModal**, FoodEntryModal, GoalModal, PhaseCreationModal, TrainingModal, StepRangesModal, TrainingTypeEditorModal, WeightEntryModal
  - `lists/` — CardioFavouritesModal, CardioTypeListModal, CalorieTargetModal
  - `common/` — ConfirmActionModal
- Total across codebase: ~67 modal hook instances (`useAnimatedModal`)

### Adaptive Thermogenesis Frontend

- `AdaptiveThermogenesisModal` (`modals/fullscreen/AdaptiveThermogenesisModal.jsx`) is the fullscreen frontend for the whole AT subsystem. It is **lazy-loaded** in `EnergyMapCalculator.jsx` and subscribes to the store (`userData`, `weightEntries`, `goalDurationDays`), recomputing **both** `crude` and `smart` results live.
- It renders **Crude / Smart** tabs: Crude shows the applied correction plus the full staged timeline (from `CRUDE_CUT_STAGES` / `CRUDE_SURPLUS_STAGES`); Smart shows correction, confidence, divergence/noise-floor, weekly rates, and data-used badges. Insufficient-data states use progress rows.
- `InsightsScreen` renders an `AdaptiveCorrectionCard` preview (Turned off / Need more data / No correction active / ±N kcal/day) in a new "Adaptive Thermogenesis" section and opens the modal via `onOpenAdaptiveThermogenesis`.
- Wire it like any other top-level modal: `useAnimatedModal()`, register in `isAnyModalOpen` + `closeTopmostModal` + deps, and lazy `React.lazy(...)` with an `isOpen || isClosing` mount guard.

### Rolling Energy Balance Frontend

- `RollingEnergyBalanceModal` (`modals/fullscreen/RollingEnergyBalanceModal.jsx`) is the fullscreen, lazy-loaded analytics surface for the longitudinal rolling energy balance. It subscribes to `userData.dailySnapshots`, `weightEntries`, and the derived `goalDailyBalanceTarget`, recomputing the window summary via `calculateRollingEnergyBalance(...)` in a `useMemo`.
- Backed by the pure calculator `utils/calculations/rollingEnergyBalance.js` (windows 3/7/14/28 days, default 7). It consumes the already-computed snapshot `tdee`/`intake` (never rebuilds TDEE). Per-day balance `= tdee - intake` (positive = deficit, negative = surplus). Missing days are unavailable, never zero; malformed snapshots and future dates are excluded.
- `InsightsScreen` renders a `RollingBalancePreviewCard` (7-day headline) and opens the modal via `onOpenRollingEnergyBalance`.
- Wire it like any other top-level modal: `useAnimatedModal()`, register in `isAnyModalOpen` + `closeTopmostModal` + deps, and lazy `React.lazy(...)` with an `isOpen || isClosing` mount guard.
- **Animations (reuse the app's CSS conventions — do not introduce a new design system):**
  - Window selector uses a **single persistent sliding pill** with inline `transition: left 0.28s cubic-bezier(0.32, 0.72, 0, 1)...` (same as `AdaptiveThermogenesisModal`/`WeightTrackerModal`). Keep one persistent pill animating `left`; do NOT render it as per-button conditional remounts (no `transition` → no slide).
  - The content wrapper is keyed by `windowDays` and tagged `tracker-graph-switch` so switching windows re-plays a subtle fade/translate page transition.
  - The bar-chart `<rect>`s carry `tracker-bar-animated` so bars grow in (`trackerBarIn`). Both rely on the global `prefers-reduced-motion` fallback in `index.css`.


### Daily NEAT Override Frontend

- `DailyNeatOverrideModal` (`modals/forms/DailyNeatOverrideModal.jsx`) is the session quick-sheet for today's **daily NEAT override**. It is mounted with an `isOpen || isClosing` guard, keyed by a version counter so it re-freshes its selection state on each open (no setState-in-effect on open).
- It renders a curated set of preset cards from `ACTIVITY_PRESET_OPTIONS[dayType]` plus a **"Use my settings (default)"** clear action. Selecting a preset stages an apply; `onApply({ multiplier, presetKey, label })` saves the override, `onClear()` clears today's override and falls back to the global setting.
- The top-right day pill is **color-coded by day type**: Training Day = `text-accent-blue` + **Dumbbell** icon, Rest Day = `text-accent-indigo` + **Bed** icon (via `DAY_PILL_CLASS` / `DAY_ICON_BY_KEY`).
- **Home entry point:** In `HomeScreen`'s "Today's Activity Burn" hero, the **NEAT metric block** (icon + label + kcal) is the touch target — it carries a faint underline + chevron affordance, opens the override modal via `onOpenDailyActivityOverride`, and tints green when today's override is active. The **"~X% of daily TDEE"** pill there is a separate button wired to `onOpenTodayBreakdown`, which opens the `CalorieBreakdownModal` for today.
- **Calculation wiring:** save via the store action `setDailyNeatOverride(dateKey, overrideOrNull)`; the multiplier is applied in `calculateCalorieBreakdown` (override-first, clamped). No duplicate override logic in UI components.
- Wire it like any other sequencing modal: `useAnimatedModal()`, register in `isAnyModalOpen` + `closeTopmostModal` + deps. It is lightweight (no `React.lazy`), matching other short session modals.


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
  - `FoodSearchEntryCard.jsx` — renders one finalized chat entry card (primary badge + disclosure chip labels) via `buildFinalizedEntryCardState()` in `utils/food/aiFinalizedEntryState.js`
  Keep panel responsibilities isolated and avoid moving large inline JSX blocks back into `FoodSearchModal`.
- The **RAG chat request flow is decoupled from the modal**: `FoodSearchModal` calls `runRagChatPipeline(...)` in `services/ragChatPipeline.js` (injected OpenRouter `modules` + `telemetry`). The modal owns only the chat state machine, stage pill, abort controller, and assistant-bubble entry rendering. Do not re-inline extraction/retrieval/verification/presentation steps into the modal.
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

AI chat mode (feature-flagged RAG path):
FoodSearchModal (chat state machine, stage pill, abort controller, entry rendering)
  -> runRagChatPipeline(...) in services/ragChatPipeline.js   # decoupled orchestration; unit-testable with stubbed OpenRouter modules
    stage: extraction     -> sendOpenRouterExtraction(...) in services/openrouter.js (mode='extraction')
                              -> retry short-circuit with constrained prompt when extraction idles (clarification/error/no entries)
                              -> grounded single-entry fallback via fetchMacrosWithGrounding (mode='grounding_lookup') for low-confidence extraction
                              -> fail-closed: legacy single-call path (sendOpenRouterMessage, mode='processing') when extraction module is unavailable
    stage: retrieval      -> resolveFoodLookupContext(...) in services/foodLookupContext.js
                              -> local lookup (foodCatalog), USDA lookup (services/usda.js), deferred grounding batch (fetchMacrosWithGrounding, mode='grounding_lookup')
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

## UI & Modal Common Pitfalls

1. **Never call `forceClose()`** on modals unless absolutely necessary — it skips exit animations and can cause visual glitches.
2. **Modal nesting:** Parent modals must delay state cleanup to prevent child modals from unmounting mid-animation. Use `MODAL_CLOSE_DELAY` (180ms) with `setTimeout`.
3. **Safe areas:** Full-screen layouts must include `var(--sat)` / `var(--sab)` for notch and home indicator support.
4. **No hardcoded colors:** Never use `bg-slate-*`, `text-white`, `border-slate-*`, `text-blue-400`, etc. Always use semantic tokens or accent tokens.
5. **Hover gating:** Never use bare `hover:` — always use `md:hover:` to prevent sticky hover on touch devices.
6. **Native theming is centralized in `utils/theme.js`.** Do not add legacy status/navigation bar wrapper modules.
7. **Macro target display style:** `TrackerScreen` and `InsightsScreen` show picked macro targets (single target grams), not min-max range copy. Keep UI wording aligned with target-based display.
8. **Calorie breakdown request object:** `openCalorieBreakdown()` in the orchestrator accepts either a plain step count (legacy) or a `{ steps, tefContext, adaptiveThermogenesisContext }` object. `CalorieMapScreen` step cards and the live Health Connect card pass the full object to enable correct TEF/AT mode context.
9. **Daily log nutrition management route:** In logbook flow, nutrition management routes through the Tracker screen date context; preserve selected date handoff when adjusting this UX.
10. **Modal darkening must remain per-layer + lane-based:** Keep wrapper z-index allocation in +2 steps (`ModalStackManager`) and preserve depth-based opacity math (`calculateStackTargetOpacity` + `calculateLayerOpacity`) in `ModalShell`. Do not reintroduce a shared-overlay singleton path or ad-hoc `bg-*` overlay classes; that breaks progressive nested darkening and can regress layering/interaction.
11. **Native back navigation has home-first + double-exit behavior:** In `EnergyMapCalculator`, native back handling must close topmost modal first; when no modal is open and current screen is not Home, navigate to Home instead of exiting; when already on Home, require a second back press within a short window and show the transient hint text (`"Swipe or tap again to exit"`) before `App.exitApp()`.
12. **Framer Motion + Tailwind transform caveat for fixed hints/toasts:** Avoid combining Framer Motion transform animations with Tailwind translate centering utilities on the same element (e.g., `left-1/2 -translate-x-1/2`), because Motion overwrites `transform` and can shift the UI off-center. Prefer fixed full-width flex centering (`fixed inset-x-0 flex justify-center`).
13. **Food favourites surface is unified:** Use `FoodSearchModal` favourites mode for favourites UX. Do not recreate a standalone `FoodFavouritesModal` surface.
14. **Food tags are centralized:** Reuse `FoodTagBadges` + `foodTags` helpers; do not add per-modal ad-hoc tag/source logic.
15. **Brand display in food cards is name-first:** Use `formatFoodDisplayName` and avoid rendering brand as a separate chip in food list cards.
16. **Large food lists are progressively rendered in `FoodSearchModal`:** preserve `visibleResultCount` batching plus offset-based local pagination, and keep the count copy in "loaded count" style (`x foods found`) to avoid heavy first paint on 13k+ catalog datasets.
17. **Chat-mode cache lifecycle is scoped:** `FoodSearchModal` resets AI lookup session cache when leaving chat view and on modal close/unmount. Keep this behavior to prevent stale cross-conversation carryover.
18. **Avoid callback TDZ regressions in orchestrator components:** in `FoodSearchModal`, callbacks referenced by other hooks/callbacks (e.g., `updateMessageById`) must be declared before first usage to avoid runtime `Cannot access ... before initialization` errors.
19. **Bundle-splitting hygiene for dynamic services:** keep `foodCatalog` and `openrouter` usage dynamic in heavy UI/orchestrator flows (`FoodSearchModal`, `EnergyMapCalculator`) so static imports do not pull these paths back into the main chunk.
20. **Lazy modal mount guard is required:** for lazy-loaded modal components, gate render with `isOpen || isClosing`. Rendering only on `isOpen` can cut exit animations and regress close-stack UX.
21. **Goal prediction card should stay mounted in goal mode:** keep render gating on `creationMode === 'goal'` (not on projection availability) and use a placeholder message when start/end inputs cannot yet produce `estimateGoalModeProjection(...)` output.
22. **Do not label weight-relative % as body-fat %.** Use `predictedWeightDeltaPercent` wording in UI copy; treat `predictedBodyFatDeltaPercent` as deprecated alias for compatibility only.
23. **Goal lock is intentional while active phase delta is applied:** `setSelectedGoal` is guarded when `isGoalLockedByActivePhase` is true, and `HomeScreen` goal CTA reflects locked state.
24. **Phase creation mode drives validation constraints:** in `target` mode, require end date plus at least one target metric (`targetWeight` or `targetBodyFat`), and reject blocked aggressiveness bands from `phaseTargetPlanning`.
25. **AT mode control is settings-driven:** `CalorieBreakdownModal` does not expose an AT mode selector. Mode changes are configured in `SettingsModal` (`adaptiveThermogenesisEnabled` + `adaptiveThermogenesisSmartMode`) and reflected in breakdown output.
26. **AT smart-mode smoothing is settings-driven:** Smoothing controls also live in `SettingsModal` (`adaptiveThermogenesisSmoothingEnabled`, `adaptiveThermogenesisSmoothingMethod`, `adaptiveThermogenesisSmoothingWindowDays`). Keep method constrained to `ema|sma` and clamp window to 3–14 days.
27. **EPOC is settings-driven and persisted:** `epocEnabled` and `epocCarryoverHours` are canonical `userData` fields (profile scope). Configure from `SettingsModal`; do not duplicate per-screen global toggles.
28. **EPOC UI surface exists:** `EpocInfoModal`, `EpocWindowPickerModal`, and `TimePickerModal` are active parts of the flow. Keep them wired when changing settings/session forms.
29. **Constrained triangle mapping:** `MacroPickerModal` uses full-surface constrained remapping (`macroSplitFromConstrainedTrianglePoint` / `macroSplitToConstrainedTrianglePoint`) so the whole triangle is draggable while remaining within bounded macro behavior. Do not revert to direct raw-ratio barycentric mapping for picker interactions.
30. **Macro lock UI is gram-anchored:** `MacroPickerModal` exposes a lock toggle on each macro chip that pins that macro at its current computed grams (max 2 via `MAX_MACRO_LOCKS`; the third lock button is disabled). The control surface is conditional:
   - **0 locks:** full triangle drag via constrained barycentric mapping.
   - **1 lock:** horizontal `<input type="range">` slider with direct gram control (the slider value is the grams of the first unlocked macro, bounded by `getUnlockedMacroGramRange(...)`). The second unlocked macro fills the residual calories. The slider track uses a two-color gradient matching the two unlocked macro accent colors, with end labels showing grams and calorie-ratio percentages.
   - **2 locks:** triangle drag is disabled; the handle shows a dashed ring with an "absorbs changes" hint on the unlocked macro.
   Locked grams are **soft anchors** — when the calorie target is too low, they relax to safety floors and a warning chip is shown. Keep the lock state wired through `onLocksChange`/`macroLocks` and persist via `handleUserDataChange('macroLocks', ...)`. The 1-lock slider path uses helpers from `macroRecommendations.js`: `getUnlockedMacroKeys`, `getUnlockedMacroGramRange`, and `macroSplitFromUnlockedRatio`.
31. **Activity multiplier clamping:** Custom activity multipliers have a floor defined by `MIN_CUSTOM_ACTIVITY_MULTIPLIER` in `activityPresets.js`. Always use `clampCustomActivityMultiplier()` when persisting custom NEAT values. The `DailyActivityCustomModal` picker starts at `MIN_CUSTOM_ACTIVITY_PERCENT` (10%), not 0.
32. **Phase metrics are nutrition-aware now:** Never hardcode `avgCalories = 0` in phase UIs. Use `calculatePhaseMetrics(phase, weightEntries, nutritionData)`.
33. **Smart TEF and NEAT:** When `userData.smartTefEnabled` is true, `calculateCalorieBreakdown()` subtracts `TEF_MULTIPLIER_OFFSET` (0.1) from the activity multiplier and adds macro-derived TEF back explicitly. The displayed NEAT multiplier in `CalorieBreakdownModal` will therefore appear lower than the user's configured value — this is intentional and explained in `TefInfoModal`. Never remove the offset without also disabling TEF.
34. **Scroll pickers must not fight the user's gesture:** Embedded pickers that live-update a parent `value` prop on every scroll (e.g. `WeightPicker`/`BodyFatPicker` in the entry modals) must guard the `[value]` alignment effect with a user-driven flag (`isUserDrivenRef` + short auto-reset timeout). Without this, the effect re-runs on every scroll update and calls `alignScrollContainerToValue(...)` mid-gesture, causing choppy, fighting-the-finger scrolling. The settle-timeout in `createPickerScrollHandler` already snap-aligns after the gesture ends, so `handleWholeChange`/`handleDecimalChange` should not call `alignScrollContainerToValue` directly either. Keep initial open alignment, clamping, and max-value decimal reset behavior intact.
35. **Daily NEAT override touch targets:** In the `HomeScreen` hero, the **"~X% of daily TDEE"** pill opens today's `CalorieBreakdownModal` (`onOpenTodayBreakdown`), and the **NEAT metric block** (underlined icon + label + kcal with a chevron) is the override entry point (`onOpenDailyActivityOverride`). Do not move the override entry onto a separate chip/pill — keep it on the NEAT metric itself, and keep the day pill in `DailyNeatOverrideModal` color-coded (Training = `accent-blue`/Dumbbell, Rest = `accent-indigo`/Bed).
