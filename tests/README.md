# Test Suite Guide

Two test tiers run side by side. They never see each other's files — keep it that way.

## Tiers & Commands

| Command | Runner | Location | Purpose |
| --- | --- | --- | --- |
| `npm test` | `node --test` | `tests/**/*.test.js` | Pure logic: calculations, services, storage, store, API handler contracts |
| `npm run test:watch` | `node --test --watch` | `tests/**/*.test.js` | Watch mode for the logic tier |
| `npm run test:coverage` | `node --test --experimental-test-coverage` | `tests/**/*.test.js` | Line/branch/function coverage for `src/**` |
| `npm run test:ui` | Vitest (jsdom) | `src/**/*.spec.{js,jsx}` | Component / hook rendering + interaction |

**Naming rule (hard requirement):** UI specs are `*.spec.jsx` / `*.spec.js` under `src/`. Logic specs are
`*.test.js` under `tests/`. `node --test` discovery matches `*.test.js` only, so a UI spec can never be
picked up by the Node runner (and vice versa). Do not add `*.test.js` under `src/`.

## Coverage Baseline

Measured on 2026-09-13 (`npm run test:coverage`, Node v22.13.1):

| Metric | Value |
| --- | --- |
| Line | 78.89% |
| Branch | 67.93% |
| Functions | 79.91% |
| Files instrumented | 41 of 137 `src/**/*.{js,jsx}` |

**Read this number carefully.** Node's coverage is V8-based and only reports modules that were actually
loaded during the run. Files no test imports do **not** appear in the report — they are silently omitted
rather than shown at 0%. In the baseline above, **96 files (70%) are never loaded**, which includes all of:

- `src/components/**` (screens, ~59 modal/panel components, `common/` chrome)
- `src/hooks/**` (`useAnimatedModal`, `useSwipeableScreens`, `useHealthConnect`, `useHardwareBackButton`, `useNetworkStatus`)
- `src/App.jsx`, `src/main.jsx`

So the reported 78.89% describes the ~30% of the codebase that is pure logic. Treat "absent from the
coverage table" as 0%, not as covered.

## Coverage — UI Tier

`npm run test:ui:coverage` reports only what the UI tier owns (`src/components/**`, `src/hooks/**`,
`src/utils/visuals/modalStack.js`), because the logic-only modules are the Node tier's job and would
otherwise show as 0% and drown the headline number.

Per-file coverage from the initial UI-tier work:

| Module | % Lines | Notes |
| --- | --- | --- |
| `hooks/useAnimatedModal.js` | 100% | open / requestClose / forceClose lifecycle |
| `hooks/useNetworkStatus.js` | 100% | online/offline + visibility re-poll + listener cleanup |
| `hooks/useHardwareBackButton.js` | 100% | modal → home-first → double-exit + hint timing |
| `hooks/useHealthConnect.js` | 94.5% | status lifecycle, read-window order, aggregation |
| `services/barcodeScanner.js` | 100% | platform gating + error-code mapping |
| `utils/visuals/modalStack.js` | 98.4% | z-lane allocation + backdrop opacity composition |
| `components/.../common/ScreenTabs.jsx` | 100% | active tab, ring copies, px geometry |
| `components/.../modals/common/ConfirmActionModal.jsx` | 100% | tone treatments + handlers |
| `components/.../modals/forms/GoalModal.jsx` | 100% | goal selection + actions |
| `components/.../modals/forms/DailyNeatOverrideModal.jsx` | 96.9% | preset staging + apply/clear |
| `components/.../common/AppHeader.jsx` | 97.9% | per-screen stat line + coach mark |
| `components/.../common/ModalShell.jsx` | 56.4% | stack/overlay paths via mount tests |

Screens, the orchestrator and the remaining ~50 modals are still untested, so the tier's aggregate is
low by design — extend it per surface rather than chasing the number.

## Plugin Boundary Tier

Capacitor plugins are mocked at the module boundary in `src/tests/mocks/capacitor.js` (registered by
`src/tests/setup.js`), so these specs drive the real callbacks and options the app hands to the plugins.
Mock surfaces mirror only the API the app actually calls, so an uncovered plugin call fails loudly rather
than silently returning `undefined`.

| Plugin | Spec | Invariants pinned |
| --- | --- | --- |
| `@capacitor/barcode-scanner` | `services/barcodeScanner.spec.js` | Off-platform throws `UNSUPPORTED` **without invoking the plugin**; digits are normalised; empty result → `NO_RESULT`, cancel → `CANCELLED`, permission → `PERMISSION_DENIED`, else `SCAN_FAILED`; already-mapped errors pass through; the exact scanner option payload is asserted |
| `@capacitor/app` (back button) | `hooks/useHardwareBackButton.spec.js` | Nothing is registered off-platform; topmost modal wins; otherwise navigate home; from Home a second press inside the confirm window exits, outside it re-shows the hint; hint auto-hides; leaving Home resets the pending exit; listener removed on unmount |
| `@capacitor/app` + `@capgo/capacitor-health` | `hooks/useHealthConnect.spec.js` | Platform/availability gating; **today-scoped read window is primary** (asserted to start at local midnight, i.e. not the plugin's rolling 24h default); plugin default is the degraded fallback and omits the window; exact-midnight error retries a rolling window; total failure degrades to `null` instead of throwing; samples are deduped **max-per-source, never summed**; refresh only while connected; foreground refreshes only when `isActive` |

Remaining gap in this tier: `hooks/useSwipeableScreens.js` (the largest hook, 0% — its pure loop math is
covered by `tests/utils/carouselLoop.test.js`, but the DOM-exposed drag/settle wiring is not).

## Known Defect Documented By A Test

`DailyNeatOverrideModal.spec.jsx` contains an `it.fails` case (**"clears the override when the 'Use my
settings (default)' card is applied"**). The clear card is staged under the key `'default'`, which
collides with the `'default'` preset inside `ACTIVITY_PRESET_OPTIONS`, so `handleApply` finds a preset
and calls `onApply` instead of `onClear`. For a user whose global NEAT multiplier is customised (e.g.
0.25), tapping "Use my settings (default)" therefore writes a `0.22` override instead of clearing it.

The test asserts the **desired** behaviour and is marked `it.fails`, so the suite stays green and it will
be reported as an unexpected pass the moment the defect is fixed — then delete `.fails` and keep it as a
normal regression test.

## Conventions

- ESM with explicit `.js` file extensions on relative imports (test-executed modules are resolved by Node directly).
- Node-environment shims for Capacitor plugins live in `tests/helpers/capacitorShims.js` — import them,
  do not re-declare `window.localStorage` shims per file.
- Tests must not call external services (Supabase catalog, OpenFoodFacts, OpenRouter). Stub at the module
  boundary; live contracts are asserted in `tests/services/**` and `tests/api/**` with injected stubs.
- Store specs rely on the 1s save debounce settling; keep the suppression window in
  `tests/store/dayTurnover.test.js` intact when adding store tests.
- Do not duplicate math already covered elsewhere: carousel loop geometry lives in
  `tests/utils/carouselLoop.test.js`, chart gap tiering in `tests/utils/bezierPath.test.js`, measurement
  averages in `tests/utils/trendAverages.test.js`.
