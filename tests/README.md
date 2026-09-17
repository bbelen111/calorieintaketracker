# Test Suite Guide

Two test tiers run side by side. They never see each other's files — keep it that way.

## Tiers & Commands

| Command | Runner | Location | Purpose |
| --- | --- | --- | --- |
| `npm test` | `node --test` | `tests/**/*.test.js` | Pure logic: calculations, services, storage, store, API handler contracts |
| `npm run test:watch` | `node --test --watch` | `tests/**/*.test.js` | Watch mode for the logic tier |
| `npm run test:coverage` | `node --test --experimental-test-coverage` | `tests/**/*.test.js` | Line/branch/function coverage for `src/**` |
| `npm run test:ui` | Vitest (jsdom) | `src/**/*.spec.{js,jsx}` | Components, hooks, plugin bridges **and** orchestrator/screen integration |

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
| `components/EnergyMap/EnergyMapCalculator.jsx` | 32.2% | orchestrator: hydration gate, screens, tab wiring |
| `components/.../screens/InsightsScreen.jsx` | 89.2% | mounted via the orchestrator |
| `components/.../screens/TrackerScreen.jsx` | 67.8% | mounted via the orchestrator |
| `components/.../screens/HomeScreen.jsx` | 61.9% | mounted via the orchestrator |
| `components/.../screens/CalorieMapScreen.jsx` | 50% | mounted via the orchestrator |
| `components/.../screens/LogbookScreen.jsx` | 41.8% | mounted via the orchestrator |
| `hooks/useSwipeableScreens.js` | 47.1% | driven through the tab bar (pure loop math stays in the Node tier) |
| `components/.../screens/PhaseDetailScreen.jsx` | 6.3% | drill-down, not in the carousel — still untested |

The remaining ~50 modals are mostly untouched, so the tier's aggregate (24.8% lines) is low by design —
extend it per surface rather than chasing the number.

## Orchestrator Integration Tier

`src/components/EnergyMap/EnergyMapCalculator.spec.jsx` mounts the **real** 4,600-line orchestrator
against the **real** store (Capacitor doubles supply the web-shaped platform). It covers what no unit
spec can and is the reason the orchestrator/screens are no longer at 0%:

- the hydration gate (`Loading your data…` until `initialize()` lands — no flash of default data);
- all five carousel screens mounted exactly once (`.carousel-slide`) behind the floating tab bar;
- tab tap → chrome wiring (the header's per-screen stat line, scoped with `within(header)` because
  screens render their own summary copy);
- store → screen propagation (a logged food appears in the Tracker's rendered totals);
- a lazy `SettingsModal` open/close round trip through the shared modal stack (Suspense included).

**Two lessons to keep:**

1. **Scope text queries to the region under test.** A document-wide `findByText('No data yet')` matches
   both `AppHeader` and the Insights trend card — the ambiguity hides which one you actually asserted.
2. **The Preferences double is module-scoped for the whole file, and the store saves on a 1s debounce.**
   A previous test's pending save can land mid-run and be reloaded by the next `initialize()`, which made
   the coach-mark/gear assertions pass fast and fail under coverage instrumentation. Tests that depend on
   a persisted flag now pin it explicitly (`setSwipeHintSeen(...)`), and `beforeEach` clears the double.

**Deliberately deferred: full-browser E2E (Playwright).** Not run today, because it would require adding
selectors across the orchestrator and 60 modal files (the app has zero `data-testid`/`aria-label`/`role`
hooks), a ~150 MB Chromium download, and it fights the swipe shell's rAF/compositor settles. Entry
criteria — reach for it when a defect escapes that only a real browser would catch. What this tier
cannot replace, and Playwright would add: real layout/paint (carousel + tab-bar/dot geometry),
IndexedDB persistence across a reload, and visual regression.

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

`hooks/useSwipeableScreens.js` is now reached indirectly (47% lines) through the orchestrator's tab bar,
but its DOM drag/settle wiring is still not directly asserted — its pure loop math remains the Node
tier's job (`tests/utils/carouselLoop.test.js`).

## Known Defect Documented By A Test

`DailyNeatOverrideModal.spec.jsx` contains an `it.fails` case (**"clears the override when the 'Use my
settings (default)' card is applied"**). The clear card is staged under the key `'default'`, which
collides with the `'default'` preset inside `ACTIVITY_PRESET_OPTIONS`, so `handleApply` finds a preset
and calls `onApply` instead of `onClear`. For a user whose global NEAT multiplier is customised (e.g.
0.25), tapping "Use my settings (default)" therefore writes a `0.22` override instead of clearing it.

The test asserts the **desired** behaviour and is marked `it.fails`, so the suite stays green and it will
be reported as an unexpected pass the moment the defect is fixed — then delete `.fails` and keep it as a
normal regression test.

## Continuous Integration

`.github/workflows/ci.yml` runs on pushes to `main`, on pull requests, and manually (`workflow_dispatch`).
One job, in this order — every step was run locally to confirm it passes:

| Step | Command | Why |
| --- | --- | --- |
| Install | `npm ci` | Also proves `package-lock.json` is in sync with `package.json` (npm errors if not) |
| Lint | `npm run lint:ci` | Blocking — see the profile note below |
| Logic tier | `npm run test:coverage` | The 371 tests **and** the coverage floors |
| UI tier | `npm run test:ui` | Vitest + jsdom (its own floors live in `vitest.config.js`) |
| Build | `npm run build` | Must emit `dist/index.html` |
| Build assertion | inline bash | Guards the Rolldown `manualChunks` regression |
| Android copy | `npx cap copy android` | Proves the built web bundle lands in the native project |

### Lint profiles

- `npm run lint` — the strict profile (`eslint.config.js`). Two React-Compiler-era advisory rules that
  `eslint-plugin-react-hooks` v7's recommended preset enables are **errors** here, so this command
  currently reports 38 problems (37 errors) in pre-existing code.
- `npm run lint:ci` — identical except those two rules are **warnings** (`eslint.ci.config.js`). This is
  what CI gates on, so a red build on day one cannot hide genuine regressions in every other rule.

The debt is real, not a false positive: `react-hooks/set-state-in-effect` (36 instances) and
`react-hooks/preserve-manual-memoization` (1 instance) sit in the 4,600-line orchestrator plus 11
modal/screen files that sync state on prop change and use manual memoization. Refactoring them belongs in
its own change with UI verification. **Do not add new instances** — they appear as warnings in CI and as
errors in `npm run lint`.

### Coverage floors

Floors, not exact ratchets: deliberately a few points below the measured values so that adding an
untested surface nudges rather than blocks, while a real collapse fails the build.

| Tier | Measured (lines / branch / funcs) | Enforced floor |
| --- | --- | --- |
| Logic — `npm run test:coverage` flags | 78.4 / 68.2 / 79.6 | 75 / 63 / 75 |
| UI — `vitest.config.js` `coverage.thresholds` | 24.8 / 13.5 / 20.8 | 22 / 11 / 18 |

A failure names the metric and the shortfall (e.g. `84.52% line coverage does not meet threshold of 99%`),
and the gate was verified by running it with an impossible floor. Raise the floors as coverage improves.

### Why `cap copy` instead of `cap sync`

`cap sync` also runs the Gradle update step, which needs the Android SDK on the runner — minutes of setup
for no extra signal here. `cap copy` is exactly what validates "the built web bundle lands in the native
project", and every file it writes (`android/app/src/main/assets/public`, the generated
`capacitor.config.json` / `capacitor.plugins.json`) is gitignored, so nothing native is written back into
the repo.

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
