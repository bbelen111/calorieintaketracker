---
paths:
  - src/components/**
---

# Energy Map Calorie Tracker - UI, Modals & Screens

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


### Daily Ledger Frontend (Logbook)

- Entry point: `LogbookScreen` renders a `DayLedgerCard` at the **bottom** of Logbook (after Completed Phases), styled with HomeScreen session-row grammar (`bg-surface-highlight/50 rounded-lg p-4 border-border/50`, bare accent icon, semibold title, group-hover chevron); opens `DayLedgerListModal` via `onOpenDayLedger`.
- `DayLedgerListModal` (`modals/lists/DayLedgerListModal.jsx`) is a lazy-loaded calendar browser over `dailySnapshots`: fixed 42-cell grid (always 6 weeks, mirroring `CalendarPickerModal`), swipeable month navigation, balance-kind cell coloring via `DAY_LEDGER_BALANCE_META`, a balance-kind legend, and a Today jump.
- Month/year pickers anchor beneath the nav row via a `relative` wrapper + `absolute inset-x-0 top-full mt-2 flex justify-center pointer-events-none`; Framer Motion animates only the inner card. Never position these overlays with invalid Tailwind classes (`left-1/5`, `top-29`) or Tailwind translate utilities on Motion-animated elements.
- The bottom **dual-mode panel uses a grid-stacked "auto-fixed" height** instead of a hardcoded px value: the day-preview, month-summary, and empty-month surfaces are **always mounted, stacked in the same grid cell** (`row-start-1 col-start-1`), so the container height is the natural max across all states - constant during mode switches (zero layout shift) yet content-driven per device/font. Surfaces toggle via Motion `animate` opacity/y + `pointer-events-none` + `aria-hidden` (no AnimatePresence unmount swaps; never animate the container height); the day panel retains the last preview via `lastPreviewRef` so deselecting a day cannot collapse its layout contribution, and the EPOC line always renders (`invisible` when zero) so per-day variance cannot resize the panel. Picking a tracked day swaps in a tappable day-preview (tap again opens `DayLedgerModal` via `onOpenDayDetail`); deselecting or changing month falls back to the month summary. Month summary = 2x2 `SummaryTile` grid (Avg Energy combined, Balance avg+total kind-colored via `getDailyBalanceKind`, Avg Weight + conditional `% BF`, Avg Steps). The day panel shows Weight + BF tiles when `bodyFatTrackingEnabled`, else Weight + combined Sessions card (Cardio/Training split).
- `bodyFatTrackingEnabled` must be forwarded from the orchestrator; BF-off swaps tile contents instead of hiding rows.
- `DayLedgerModal` (`modals/info/DayLedgerModal.jsx`) is the read-only detail sheet: measurements strip via `getMeasurementForDate`, single TDEE energy card that opens the production lazy `CalorieBreakdownModal` recomputed for that historical day through orchestrator `handleOpenDayLedgerBreakdown(dateKey)` (steps + dynamic TEF totals + AT context + `dateKey`; the store applies date-scoped NEAT). It renders the snapshot's `goalAtSnapshot` and that day's training flag.
- Wire both like any top-level modal: `useAnimatedModal()` (the detail modal uses `MODAL_CLOSE_DELAY`), register in `isAnyModalOpen` + `closeTopmostModal` + deps, lazy `React.lazy(...)` with an `isOpen || isClosing` mount guard.
- All display math lives in `utils/calculations/dayLedgerPresentation.js`; both modals are thin renderers (see 03-state-and-calcs / State & Calculations docs).


### Calendar Picker Dual Panel (Tracker date selection)

- `CalendarPickerModal` (`modals/pickers/`) uses the same grid-stacked "auto-fixed" height contract as `DayLedgerListModal`: the day-preview panel and the Monthly Average card are **always mounted and stacked in the same grid cell** (`row-start-1 col-start-1`), toggled via opacity + `pointer-events-none` + `aria-hidden` — no floating tooltip, no AnimatePresence unmount swaps for the panel surfaces, no animated height.
- Interaction: tapping a non-ghost day previews it in the panel (empty days show an honest "No entries" state; macros come from `nutritionData` only — no snapshot props); tapping the previewed day again deselects back to the Monthly Average card; the day-preview card itself is a **whole-card button** (DayLedger's "tap to view full ledger" grammar: `pressable-card` + `focus-ring` + muted `border-t` footer with chevron) so tapping it anywhere — or keyboard Enter / the Today button — calls `onSelectDate` and closes. Month changes reset the preview via the `changeMonth` wrapper, and closing the modal resets all preview state (render-phase retention pattern — no refs read during render, no setState-in-effect).
- Its month/year picker overlays use the anchored pattern (relative nav-row wrapper + `absolute inset-x-0 top-full mt-2 flex justify-center pointer-events-none`, Motion animates only the inner card) — never `left-1/5`/`top-29` or Tailwind translate on Motion elements.
- A calendar-cell **legend** sits between the grid and the dual panel (always rendered, static — never toggled by preview state, so it cannot shift layout). It reuses `DayLedgerListModal`'s legend grammar (`flex ... gap-3 pt-3 mt-3 border-t border-border text-[10px] text-muted flex-wrap` + `w-2 h-2` swatch + label) but is adapted to this modal's cell states instead of balance kinds: round `accent-blue` dot = has entries (mirrors the in-cell tracked marker), `accent-slate` square = no entries, `accent-blue` square = selected. The legend lives in the modal body, not inside `CalendarHeatmap`, so it stays outside the swipe-touch region.

### Tracker Modal Selection Card (Weight / Body Fat / Step / Rolling Energy Balance)

- The four tracker modals share **one** detail surface: `TrackerSelectionCard` (`common/TrackerSelectionCard.jsx`, with the `TrackerCardMetric` inline label/value pair). It replaced a per-modal floating tooltip that was measured onto the tapped point (`getBoundingClientRect()` + `scrollLeft` + a `resize` listener) and rendered **outside** `ModalShell` at `z-[1200]`. Do not reintroduce a positioned tooltip: it drifted when the chart was panned (so panning had to dismiss it), overflowed at the first/last slot and above the header, escaped the `1000 + 2/depth` z-lanes, and needed a capture-phase `document.pointerdown` listener with `circle`/`g`/`[data-date-label]` whitelists to dismiss.
- **Placement is fixed, never measured.** The card is absolutely positioned inside a `relative` graph container, horizontally centred over the plot via `flex justify-center` and an inset that clears the y-axis column (`className="left-0 right-14"` for the 12-wide axes, `right-16` for Rolling's `w-14`). The wrapper is `pointer-events-none` and only the card captures pointers. The only inline geometry is `top`, and it is a **constant handed down by the modal** (`topPx`, default `8`) — the plot's top edge — never a measurement, and never a `left`.
- **`topPx` is the plot's top edge, which is mode-aware in the Step tracker.** Every chart layer starts at `8px`, so that is the default; `StepTrackerModal` passes `plotTopPx = weekBracketAreaHeight + 8` so the card clears the 7d **weekly-average bracket band** (`WEEK_BRACKET_TOP_PADDING=8` → `WEEK_BRACKET_HEIGHT=32`, i.e. y 8→40) instead of covering it. That file uses the same constant for the chart layer and the y-axis column, so the three cannot drift. Any future top-anchored chart annotation needs the same treatment: give it its own reserved band and align the card to the plot top below it.
- **Dismissal is a tap on the graph — there is no close button.** The old per-modal X was a 21px tap target in the corner, which is unusable on a phone. Each modal puts `onClick={dismissSelection}` on its graph container (carousel + y-axis), and the card calls `event.stopPropagation()` on its own container so a tap on the card means "let me read this" rather than "close". Point/bar/axis-label handlers `stopPropagation()` **after** their empty-slot guard (not before), so a tap on a gap in the plot bubbles up and dismisses instead of dead-ending. Panning still never dismisses: a real touch-scroll synthesises no click, and scrollbars are hidden globally.
- **The connector is a guide line drawn inside the chart SVG** (`<line x1={selectedGuideX} x2={selectedGuideX} y1={0} y2={chartHeight}>`, `stroke="rgb(var(--accent-blue) / 0.45)"`, `strokeDasharray="3 4"`, `pointerEvents="none"`, drawn *behind* the data runs). It is derived from the selected slot's chart `x` (`selectedSlot.x` / `bar.x`), so panning and resizing can never make it drift. Line charts also enlarge the selected point (accent fill, `pointRadius + 2`); bar charts keep their `accent-blue` outline rect. Never add an elbow leader that depends on the card's viewport x — that would have to be recomputed per pan frame.
- **Selection state uses render-phase retention** (`selectedDate` / `lastSelectedDate` / `selectionSource`, verbatim from `CalendarPickerModal`): the retained slot keeps the card's content while it fades out, so it can never blank mid-fade, and no ref is read during render and no state is set from an effect.
- **Interaction:** tap a point/bar/axis label to select (re-tapping the same slot in the day modes keeps the long-standing "tap again to edit/add" gesture, and the card body is the second, discoverable route); **tap anywhere else in the graph to dismiss**; view-mode/window changes dismiss. Empty slots are not selectable in Step/Rolling (honest "no data") while Weight/Body Fat keep them selectable through the axis label so the add flow stays reachable — in both cases the tap either selects or dismisses, never dead-ends.
- **Anatomy:** compact on purpose (the plot is the modal's `flex-1` remainder) and **content-sized** (`w-auto max-w-[calc(100%-1rem)]`, not a fixed 280px block eating a quarter of the plot): muted date/month row, a `text-2xl` primary value, an optional inline metric row (Distance/Burned, Total, TDEE/Intake — the Weight/Body Fat day cards deliberately carry **no** `7d`/`14d` chips, which the modals' own "Averages" stat card already shows; only the 12m month card adds a `Tracked x/y d` chip), and — only when the modal has an edit/add flow — a muted `border-t border-border/30` footer (`Tap to edit entry` / `Tap to add entry` + chevron) that makes the whole body a `<button>` (`pressable-card` + `focus-ring`, `ariaLabel` from the caller). Read-only variants (Step, 12m month selections, Rolling) render as a `role="status" aria-live="polite"` surface with no footer action.
- **Glass (matching the `ScreenTabs` grammar):** `border-border/40` + `bg-surface/85 supports-[backdrop-filter]:bg-surface/55` + `backdrop-blur-2xl backdrop-saturate-150` + `shadow-2xl shadow-background/40`, so the chart smears through the card while staying readable on engines without `backdrop-filter`. Keep it token-based — no `bg-white/*` highlight strips.
- `TrackerCardMetric` is deliberately a text pair rather than a tile: the card overlays the top of the plot, so height is the budget.
- Covered by UI-tier specs: `common/TrackerSelectionCard.spec.jsx` (mount-always + crossfade, constant `top` with no measured geometry, `topPx`, glass classes, no close button, card-taps-don't-reach-the-graph-handler, pointer transparency, action/read-only variants) plus one per modal — `WeightTrackerModal.spec.jsx` (full round trip: no `z-[1200]` node, tap → card + guide line, card commit, re-tap gesture, re-target on another point, empty-day add flow, plot-tap dismissal with content retained), `BodyFatTrackerModal.spec.jsx`, `StepTrackerModal.spec.jsx` (read-only, card aligned to the plot top so the 7d week brackets stay visible, gap-tap dismisses) and `RollingEnergyBalanceModal.spec.jsx` (store-seeded ledger, untracked day tap dismisses).
- **Known tradeoff:** with the X gone, read-only cards have no keyboard dismissal (actionable ones keep Enter-on-body, which commits and deselects). Nothing regresses for the chart itself — points/bars were never keyboard-reachable, so selection was always pointer-only.

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
- **Looping (clone-free):** every screen renders exactly once and each slide carries its **own** transform: `offset_i(position) = wrapIntoHalf(i + 1 − position)` in slide widths and `transform_i = translateX(calc((offset_i − i) * 100% + 16px))`. `%` resolves against the slide's own box width (viewport − 32px), which **is** the stride, so the geometry needs no measurement and self-corrects on every resize. The position is one continuous, unbounded value; a slide crosses the ring seam when its offset passes ±N/2 (~2 slides off-screen — `isSlideTeleport` makes that write instant so it can never sweep across the screen), and normalizing a wrap (6 → 1, 0 → 5) rewrites byte-identical transforms — no clones, ghost cells, timers or blank peek slivers.
- **Settles are compositor CSS transitions (never rAF):** `settleTo(...)` writes `SLIDE_SETTLE_TRANSITION_SET` (`transform` + `mask-position`, both `350ms cubic-bezier(0.22, 1, 0.36, 1)` — `CAROUSEL_SETTLE_MS` + `SLIDE_SETTLE_EASING`) together with the target transform on each slide in one task, then normalizes on a timer (`CAROUSEL_SETTLE_MS + 40ms`) with a bubbling `transitionend` fast path. A JS/rAF settle is re-coupled to every main-thread stall (React renders, `:root` custom-property style recalc, paint) and visibly stutters on a 120Hz panel. React never authors a slide `transform`/`transition` (`getSlideProps(index)` supplies only a stable ref), and `transition` is always written with its `transform`, so a stranded `transition: none` can never make a tab tap snap.
- **Interrupting a settle is arithmetic, not measurement:** `settleStateRef` keeps `{ from, to, startedAt }` and `resolveSettlePositionAt({ ..., durationMs: CAROUSEL_SETTLE_MS })` evaluates the *same* curve and clock, so a finger (or a tab tap) takes over mid-settle exactly where the animation is — no `getComputedStyle`, no layout read, no per-frame loop. The taker freezes that frame with an instant write before replanning.
- **Release/navigation planning:** `resolveSettleTarget(...)` snaps back below the threshold, steps one screen past it, and rounds multi-slide drags (no end clamps — the loop has no ends). `alignPositionToReference(...)` keeps the rest/target in the live position's period so a settle always animates the short way, and `resolveShortestScreenDelta(...)` makes tab taps travel the wrapped way around (4 → 0 is one screen forward).
- **Edge fades are continuous mask strengths (never classes):** every slide carries a permanent two-layer 20px ramp (`mask-image` + `mask-size: calc(100% + 20px) 100%` + `mask-position` in `index.css`), and only its *strength* moves — `resolveSlideFadeStrengths(offset)` → `{ left, right }` (`|offset|` clamped to 0–1, quantized and written only when it changes, by `writeSlideTransforms`). 0 parks the ramp fully outside the slide, 1 is the resting peek look. Because `mask-position` rides `SLIDE_SETTLE_TRANSITION_SET` (same duration + curve as the transform), the ramp retracts on the same clock as the slide; toggling a `.slide-fade-*` class instead popped, because a mask cannot be transitioned as a class.
- **Edge tap guards:** two invisible 16px strips (`absolute inset-y-0 z-10 w-4`) pinned inside the viewport edges absorb taps on the peek sliver so taps can never trigger hidden neighbour-screen cards. They are children of the viewport, so swipe drags still bubble to the carousel handlers.
- **Drag progress + duration:** `commitPosition` publishes `--screen-drag-progress` (the **1-based, unclamped** carousel position, e.g. `3.4` or `6.1` mid-wrap) and `--screen-drag-duration` on `:root` imperatively. The tab-bar circle and header dots read them via `calc(...)`, so they track the finger frame-by-frame with **zero React re-renders** (preserves the hook's no-state-churn design). The markers are **ring** affordances: `RING_COPY_OFFSETS` copies (`[-1, 0, 1]`) each add a static `copy * screenCount` offset inside their own `calc`, so a seam crossing glides one copy off the end of the track while the next re-enters the other end (clipped by a rounded `overflow-hidden` tracker) — which is why the position must **not** be clamped (clamping + swapping at normalize is what made a wrap jump). The duration variable is the hook's motion switch: `0s` while dragging (and for the instant landing when a wrap normalizes — the copies sit on identical on-track coordinates there, so the swap is invisible), the settle duration when gliding. **Never publish a settle's intermediate frames** — re-targeting the pill/dots every frame made them chase a moving target with a 0.28s/0.35s lag and look mushy; a settle publishes its target once.
- **Swipe coach mark:** a one-time "Swipe between screens" hint chip in the header is gated by the persisted `userData.hasSeenSwipeHint` flag (store action `markSwipeHintSeen()`; auto-marked on first drag or tab select).
- A gesture that locks to the vertical axis abandons the swipe and settles/glides the carousel back to its rest screen (`settleTo(restPositionRef.current)`; instant when it is already at rest) — it never fights the gesture.
- Viewport resize updates are `ResizeObserver`-driven but `requestAnimationFrame`-throttled with equality guards; slide transforms are percentage-based, so a resize needs no transform rewrite (the observer only refreshes the cached width used by the drag math, and re-syncs the affordances when idle).
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
- **Icon-only tabs**; the active tab is a **ring of filled accent circles** (`CIRCLE_SIZE_PX = 44`, `RING_COPY_OFFSETS` copies) inside a rounded `overflow-hidden` full-bar tracker, each moved with a composited `transform: translate3d(calc((var(--screen-drag-progress, <activeScreen + 1>) - 1 + <copy * tabs.length>) * <100%/tabs.length>%), 0, 0)` — the tracker's own width is the bar width, so `100% / tabs.length` resolves to exactly one tab pitch with no measurement, and every copy reads the same live position with a static loop offset. `--screen-drag-duration` supplies the transition duration. Never animate `left` (a layout property → main-thread layout animation, janky at 120Hz) and never re-target it on settle frames.
- Icon colours follow `activeScreen` (the optimistic display screen) and crossfade with `transition: color var(--screen-drag-duration) …`, so the active colour lands exactly when its circle arrives.
- `z-[900]` — below the ModalShell z-lanes (1000+) so modals always cover it.
- Sized in inline px so geometry stays exact regardless of the rem-based root font size.

### Header Zone (`AppHeader`)

`AppHeader.jsx` (`common/`) is the top header on every screen — a thin display component that reuses canonical helpers (`getNutritionTotalsForDate`, `calculateWeightTrend`, derived snapshot fields; no duplicated math):
- Row 1: greeting + long date (minute-interval clock) on the left; right slot swaps between the **swipe coach-mark chip** (while unseen) and the **settings gear** (`onOpenSettings` → orchestrator `settingsModal`).
- Row 2: per-screen glanceable stat line (Logbook: active phase · Tracker: selected-date calories · Home: TDEE · Calorie Map: steps · Insights: weight trend) + `SwipeDots`. The stat is selected by `activeScreen` and re-keyed on the screen, playing a 150ms CSS fade/rise-in (`.header-stat-in`; no `AnimatePresence mode="wait"`, which sequenced a 180ms exit before the 180ms enter and briefly emptied the row), inside a `flex-1 min-w-0` container so a longer/shorter string can never shuffle the dots.
- `SwipeDots` uses px-only absolute-positioned dots (`DOT_SIZE_PX=6`, `DOT_STEP_PX=12`) plus the same **ring** marker (`RING_COPY_OFFSETS` copies) whose `translateX` tracks `--screen-drag-progress` (duration from `--screen-drag-duration`), clipped by an `overflow-hidden` row — rem-based flex-gap sizing previously made dots drift out of alignment with the px-based moving dot.

---

## Chart Gap Handling (Weight / BodyFat Tracker Charts)

- Timeline slots are built by `buildTaggedChartSlots({ days, getValue, minValue, range, chartWidth, windowSize, chartHeight })` in `utils/visuals/trackerHelpers.jsx`:
  - Real entries map to `{ date, value, x, y, isInterpolated: false }`.
  - Interior missing days are **linearly interpolated** between their nearest real neighbours and tagged `{ isInterpolated: true, gapLength }` (`gapLength` = consecutive missing days in that run).
  - Leading/trailing empty slots stay `null` — **no invented data at the chart edges**.
- `buildGapAwarePathRuns(taggedPoints, options?)` in `utils/visuals/bezierPath.js` groups tagged slots into drawable runs with gap tiers:
  - `gapLength <= GAP_SOLID_MAX_DAYS (7)` → bridged **seamlessly**: interpolated slots merge into the current solid run (no split, one continuous stroke)
  - `<= GAP_DASHED_MAX_DAYS (14)` → bridged by a separate dashed stroke (`GAP_DASH_PATTERN = '4 6'`) anchored at the preceding real point and closed by the next real point
  - otherwise → **not** bridged; the line splits into separate runs
- Every returned run ends on a real point; interpolated slots trailing past the last real point are discarded. Returned points are clean `{x,y}` geometry (interpolation tags stay internal). The dead `buildSegmentedBezierPaths` was deleted — do not reintroduce segmented path builders.
- Tracker area gradients use `gradientUnits="userSpaceOnUse"` spanning `0 → chartHeight` so every run fragment shares one gradient space — never revert to default per-path bounding-box gradients (they restart per fragment and band the fill).
- `WeightTrackerModal` / `BodyFatTrackerModal` preserve the `isInterpolated`/`gapLength` tags when mapping points into `buildGapAwarePathRuns`, and the selection card snaps to the nearest **real** point — interpolated bridge slots are visual aids, never selectable data.

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
36. **Chart gap styling is tag-driven and tiered:** Weight/BodyFat tracker charts must keep building slots via `buildTaggedChartSlots(...)` and tier bridges via `buildGapAwarePathRuns(...)` (≤7d solid, 8–14d dashed with `GAP_DASH_PATTERN`, >14d split into runs). Preserve `isInterpolated`/`gapLength` when mapping points — stripping them collapses dashed/broken tiers to solid. Do not reintroduce the deleted `buildSegmentedBezierPaths`.
37. **Interpolated chart slots are visual aids, never data:** leading/trailing empty day slots stay `null` (never zero or edge-cloned values), the tracker selection card snaps to real points only, and N-day average cards must render the honest empty state when `calculateNDayWeightAverage`/`calculateNDayBodyFatAverage` return `null`.
38. **Daily Ledger surfaces are read-only snapshot projections:** `DayLedgerListModal`/`DayLedgerModal` consume snapshots only through `dayLedgerPresentation.js` helpers; never mutate snapshots from these modals, never zero-fill missing days. The bottom dual-mode panel must never animate or dynamically resize its height: it uses grid-cell stacking (day preview, month summary, and empty month always mounted in `row-start-1 col-start-1`, toggled by opacity) so its height is the constant, content-driven max across states - do not revert to a hardcoded px height, AnimatePresence unmount swaps for the surfaces, or animated height changes.
39. **The carousel loops with per-slide wrapped transforms — keep React out of the slide styles:** `useSwipeableScreens` renders each screen once and writes every slide style imperatively (`commitPosition` → `translateX` + paired `transition`), on mount via the `getSlideProps(index)` ref callbacks, on each rAF-throttled drag frame, and once per settle. Never author a slide `transform`/`transition` from React props, and never write a `transition` without its `transform`: that combination previously stranded an inline `transition: none` (e.g. after a vertical scroll, which abandons the gesture in the axis-lock branch) and made the next tab tap snap instead of slide. Settles must stay **compositor CSS transitions** normalized by the hook (timer + `transitionend`) — do not reintroduce a JS/rAF settle, which re-couples the animation to main-thread work and stutters on high-refresh screens. Keep the loop math in `utils/visuals/carouselLoop.js` (`resolveSlideOffsets`, `buildSlideTransform`, `isSlideTeleport`, `resolveSettleTarget`, `resolveSettlePositionAt`, `alignPositionToReference`, `resolveShortestScreenDelta`, `resolveSlideFadeStrengths` (`getLoopSlideFadeSide` was removed — the fade is a strength, not a side), `carouselEase`) — no duplicated wrap/settle arithmetic in components, and no cloned slides/ghost cells/timers.
40. **Per-screen chrome follows `visibleScreen`, not `currentScreen`:** the hook exposes both — `currentScreen` is the committed screen (rest position, hardware-back home-first logic) and `visibleScreen` is the optimistic display screen, flipped the moment a settle's target is known (swipe release via `resolveSettleTarget(...).screenIndex`, or a tab tap). `ScreenTabs` (icon colours) and `AppHeader` (glanceable stat line) consume `visibleScreen`, so the chrome responds immediately instead of waiting ~350ms for the settle to normalize, and their animations share the shell's duration so they land with the motion. Do not drive them from a mid-drag screen change (that would re-render the 4,100-line orchestrator mid-gesture) and do not drive them from `currentScreen` (that reintroduces the lag).
39. **Daily Ledger picker overlays must stay anchored:** position them with a `relative` wrapper + absolute flex centering under the nav row while Motion animates only the inner card. Do not reintroduce invalid Tailwind classes (`left-1/5`, `top-29`) or Tailwind translate centering on Motion elements (see pitfall 12).
41. **Known defect — the daily-NEAT "Use my settings (default)" card applies a preset instead of clearing (tripwired, not yet fixed):** `DailyNeatOverrideModal` stages its clear action under the key `'default'`, which collides with the `'default'` preset inside `ACTIVITY_PRESET_OPTIONS`, so `handleApply` finds a preset and calls `onApply` rather than `onClear`. For a user whose global NEAT multiplier is customised (`activityMultipliers[dayType]`, e.g. 0.25) the card therefore writes a `0.22` override instead of clearing it — a silently wrong NEAT/TDEE for that day. `DailyNeatOverrideModal.spec.jsx` pins the desired behaviour with an `it.fails` tripwire: fix the key collision (stage the clear action under a sentinel key that cannot match a preset, or check that selection before the preset lookup) and the suite reports that test as an unexpected pass — then delete `.fails` and keep it as a normal regression test.
42. **Tracker detail is one shared, fixed-slot card — never a positioned tooltip:** the Weight / Body Fat / Step / Rolling Balance modals all render `TrackerSelectionCard` (`common/TrackerSelectionCard.jsx`) pinned inside their `relative` graph container, always mounted and crossfaded, with the selected slot tied to it by a vertical guide line drawn inside the chart SVG. Do **not** reintroduce measured positioning (`getBoundingClientRect()`/`scrollLeft`), a `fixed z-[1200]` node outside `ModalShell`, an outside-click `document.pointerdown` dismissal, close-on-pan, or per-modal copies of the card markup: measured geometry is what made the old tooltips drift off their point and forced panning to dismiss them, and `z-[1200]` escapes the `1000 + 2/depth` z-lanes. Keep the selection in render-phase retention state (`selectedDate`/`lastSelectedDate`/`selectionSource`).
43. **The tracker card has no close button, and its `top` is a constant:** dismissal is `onClick={dismissSelection}` on each modal's **graph container**, the card stops propagation so its own taps never reach that handler, and point/bar/label handlers `stopPropagation()` *after* their empty-slot guard so a tap on a gap still bubbles up and dismisses. The card's only inline geometry is `topPx` (the plot's top edge, default `8`) — a constant handed down by the modal, never a measurement, never a `left`. `StepTrackerModal` passes `weekBracketAreaHeight + 8` so the card clears the 7d weekly-average bracket band (y 8→40) instead of covering it; give any future top-anchored chart annotation the same reserved band and align the card below it. Keep the surface glass and content-sized (`w-auto max-w-[calc(100%-1rem)]`, `border-border/40`, `bg-surface/85 supports-[backdrop-filter]:bg-surface/55`, `backdrop-blur-2xl backdrop-saturate-150`, `shadow-2xl shadow-background/40`) — the Weight/Body Fat day cards must not reintroduce the `7d`/`14d` chips, since the modals' own "Averages" stat card already reports them.
