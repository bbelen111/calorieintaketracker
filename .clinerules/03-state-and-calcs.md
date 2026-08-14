---
paths:
  - src/store/**
  - src/utils/**
---

# Energy Map Calorie Tracker - State, Calculations & Data Schemas

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

**Derived `goalDailyBalanceTarget`:** `deriveState` exposes a canonical, phase-lock-aware goal daily balance target in **balance convention** (positive = deficit). It mirrors the same phase-lock rule `calculateTargetForGoal` uses: when an active phase owns the delta (`isGoalLockedByActivePhase` and `phaseGoalCalorieDeltaSourcePhaseId === activePhaseId`), it is `-phaseGoalCalorieDelta`, otherwise `-resolveGoalCalorieDelta(selectedGoal)`. Rolling Energy Balance and any analytics consume this field rather than recomputing the goal/phase delta in UI.

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

## Calculation System (`utils/calculations/calculations.js`)

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
| Goal target | `calculateGoalCalories(tdee, goal, deltaOverride?)` | Applies ±300/500 modifier by goal, or explicit per-phase override when provided |
| BMI | `calculateBMI(weight, height)` | Standard BMI: weight(kg) / height(m)² |
| BMI category | `getBMICategory(bmi)` | Returns `{ label, color }` for underweight/normal/overweight/obese |
| FFMI | `calculateFFMI(weight, height, bodyFatPercent)` | Fat-Free Mass Index — returns `{ raw, normalized, leanMass }` |
| FFMI category | `getFFMICategory(ffmi, gender)` | Returns `{ label, color }` from "Below average" to "Suspiciously high" |
| TEF (from macros) | `calculateTefFromMacros({proteinGrams, carbsGrams, fatsGrams})` | Protein×25% + Carbs×8% + Fats×2% of caloric content |
| TEF (target mode) | `calculateTargetTef({targetCalories, weightKg, ...})` | Estimates TEF from bounded macro targets (saved split + profile anchors) |
| TEF (dynamic mode) | `calculateDynamicTef({totals, ...})` | Uses today's logged macro totals for live TEF estimate |
| Adaptive thermogenesis mode | `resolveAdaptiveThermogenesisMode({ userData, adaptiveThermogenesisContext })` | Resolves `'off' \| 'crude' \| 'smart'` from persisted settings plus optional per-request override |
| Adaptive thermogenesis correction | `computeAdaptiveThermogenesis({...})` | Computes bounded correction (±300 kcal/day) from staged duration logic (`crude`) or snapshot/weight divergence signal (`smart`), with optional smart-mode weight-signal smoothing (`EMA`/`SMA`, 3-14 day window) |
| Rolling balance (window) | `calculateRollingEnergyBalance({...})` | Pure analytic rollup consuming snapshot `tdee`/`intake` (`balance = tdee - intake`, positive = deficit) over 3/7/14/28-day windows; never rebuilds TDEE (`utils/calculations/rollingEnergyBalance.js`) |

**TEF constants** exported from `calculations.js`: `TEF_MULTIPLIER_OFFSET = 0.1`, `TEF_PROTEIN_RATE = 0.25`, `TEF_CARB_RATE = 0.08`, `TEF_FAT_RATE = 0.02`.

**Smart TEF mechanic:** When `userData.smartTefEnabled` is true and a `tefContext` is passed, `calculateCalorieBreakdown()` subtracts `TEF_MULTIPLIER_OFFSET` (10%) from the NEAT activity multiplier (`effectiveActivityMultiplier = rawActivityMultiplier - 0.1`) then adds the macro-based TEF back as an explicit line item. Net effect is neutral at default macro ratios but improves accuracy with real logged data. The breakdown return object gains: `rawActivityMultiplier`, `effectiveActivityMultiplier`, `tefOffsetApplied`, `tefMode`, `smartTefCalories`, `smartTefDetails`.

**Macro target anchoring:** Macro recommendations are constraint-based. Bounds are profile-derived (`protein: 1.6-2.8 g/kg`, mass source = lean mass when body fat is available else bodyweight; `fat: 0.6-1.6 g/kg`; `carb soft floor: 50g` with relaxation warning on infeasible budgets). Preserve calorie reconciliation and warning fields (`carb_soft_floor_relaxed`, `hard_floor_exceeds_budget`) when adjusting this logic.

**Macro gram anchors (locks):** `userData.macroLocks` (`{ protein, carbs, fats }`, each `null` = unlocked or a gram number) lets users pin macros in **grams** so targets stay stable while calorie targets shift (live steps, cardio/training sessions, step ranges). `normalizeMacroLocks()` coerces values (rejects `null`/`''`/negative/NaN) and enforces `MAX_MACRO_LOCKS = 2` (protein/carbs win ties). `calculateMacroRecommendations()` accepts `macroLocks`, holds locked macros at their anchor grams (clamped to safety bounds as **soft anchors**), redistributes residual calories to unlocked macros by relative ratio, and returns `macroLocks.lockedKeys` / `relaxedKeys` / `lockWarnings`. `TrackerScreen` and `InsightsScreen` forward `macroLocks` so displayed targets respect locks everywhere.

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

**Rolling Energy Balance:** `utils/calculations/rollingEnergyBalance.js` is the canonical longitudinal analytics source. `calculateRollingEnergyBalance({ snapshots, windowDays, asOfDate, goalDailyBalanceTarget })` consumes the already-computed snapshot `tdee`/`intake` (never rebuilds TDEE) over 3/7/14/28-day calendar windows (default 7). Returns `rollingBalance`, `averageDailyBalance`, `trackedDays`, `expectedBalance`, `balanceVariance`, `estimatedWeightChangeKg` (÷`ESTIMATED_ENERGY_PER_KG`=7700, labelled as a rough energy-equivalent estimate), `hasData`, `insufficientData`, and ordered `days`. Sign convention: positive = deficit, negative = surplus. Missing snapshots are unavailable days (never zero); malformed/missing-field records and future dates are excluded via `parseDailyEnergyBalance`/`selectRollingBalanceDays`; duplicates keep the last snapshot. The goal's daily target is the store-derived, phase-lock-aware `goalDailyBalanceTarget` (positive = deficit). Do not duplicate this logic in UI components.

**Adaptive Thermogenesis mechanic:** `calculateCalorieBreakdown()` computes `baselineTotal` first (BMR + NEAT + steps + training + cardio + Smart TEF), then applies AT as a post-formula correction (`total = baselineTotal + adaptiveThermogenesisCorrection`). Returned AT fields include `baselineTotal`, `adjustedTotal`, `adaptiveThermogenesisMode`, `adaptiveThermogenesisCorrection`, and `adaptiveThermogenesis`.

**AT stage constants are exported for UI:** `CRUDE_CUT_STAGES` and `CRUDE_SURPLUS_STAGES` are exported from `adaptiveThermogenesis.js` so the fullscreen `AdaptiveThermogenesisModal` renders the crude timeline without duplicating stage data.

**Goal-duration for AT display is store-owned:** consume `state.goalDurationDays` instead of calling `Date.now()` inside a `useMemo`/render — the React Compiler `react-hooks/purity` rule rejects impure calls during render.


**Smart AT smoothing mechanic:** When `adaptiveThermogenesisSmoothingEnabled` is true, smart mode smooths the weight series before slope regression (`adaptiveThermogenesisSmoothingMethod`: `'ema' | 'sma'`, `adaptiveThermogenesisSmoothingWindowDays`: clamped 3–14). Smoothing metadata is included in the AT smart signal for debugging (`smoothingEnabled`, `smoothingMethod`, `smoothingWindowDays`).

**EPOC mechanic:** `calculateCalorieBreakdown()` resolves per-session EPOC from `utils/epoc.js`, then uses `getCarryoverForDateFromSessions()` (`utils/sessionCarryover.js`) to allocate carryover calories to the requested `dateKey`. Returned fields include `epocEnabled`, `epocCalories`, `trainingEpoc`, `cardioEpoc`, `epocFromTodaySessions`, `epocCarryInCalories`, `trainingEpocDetails`, and `cardioEpocDetails`.

**Training types** are resolved at the store level (`resolveTrainingTypes`) by merging `trainingTypes` constants with `userData.trainingType` (catalog). Never use raw constants directly.

**Step/cardio overlap model (Option 2):** `utils/steps.js` handles overlap deduction using explicit cardio-type metadata from `constants/cardioTypes.js`.
- `cardioTypes[<key>].ambulatory` decides whether a session is step-based.
- `cardioTypes[<key>].cadence` is the type-specific baseline steps/min used by deduction estimates.
- Session-level `stepOverlapEnabled` controls whether that specific ambulatory session deducts steps.
- Cardio burn is preserved; only the step component is reduced to avoid double counting.

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
  phaseGoalCalorieDelta: null,      // Active phase smart delta override (kcal/day), if any
  phaseGoalCalorieDeltaSourcePhaseId: null, // Active phase id that owns the delta override
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
  macroRecommendationSplit: { protein: 0.3, carbs: 0.4, fats: 0.3 }, // Ratio split (sums to 1)
  macroLocks: { protein: null, carbs: null, fats: null },            // Gram anchors (null = unlocked; max 2)

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

## State & Calculation Common Pitfalls

1. **Weight entries:** Always normalize dates with `normalizeDateKey()`, validate with `clampWeight()` (30-210 kg range), and sort with `sortWeightEntries()` before storing.
2. **Step range parsing** is complex — always use `parseStepRange()` from `utils/steps.js`. It handles `<10k`, `>20k`, `10k-15k`, `+` suffix formats.
3. **Cardio effort types:** Check `session.effortType` — `'intensity'` uses MET-based calculation, `'heartRate'` uses gender-specific heart rate coefficients.
4. **Cardio overlap classification is metadata-driven:** Do not infer ambulatory cardio with string matching/keywords. Use `cardioTypes[type].ambulatory`.
5. **Cadence source of truth:** For overlap estimation, use `cardioTypes[type].cadence` (or defined fallback path in `utils/steps.js` for custom types). Do not hardcode cadence by name in UI/store code.
6. **Session-level overlap toggle:** Respect `session.stepOverlapEnabled` in overlap deduction; relevant types default on, non-ambulatory types force off.
7. **Training type resolution:** Never use raw `trainingTypes` constants. The store's `resolveTrainingTypes()` merges constants with persisted `userData.trainingType` entries. Consume resolved `trainingTypes` from the store.
8. **Daily snapshots are cache, not truth:** Never edit `dailySnapshots` directly from UI/form state; always derive via `upsertDailySnapshot(...)`.
9. **Snapshot TEF naming is intentional:** Snapshot field is `tef` (derived from `smartTefCalories` in breakdown). Do not assume implicit TEF if Smart TEF mode is off.
10. **Snapshot persistence is sharded by date:** Keep `dailySnapshots` in Dexie sharded documents (`dailySnapshots:<date>`), not in profile payload and not as one monolithic history blob.
11. **Goal duration logic depends on persisted timestamps:** If implementing coarse/crude staged adjustments (e.g., prolonged cut/bulk handling), base elapsed-day calculations on persisted `goalChangedAt` (and optional phase boundaries), not transient UI state.
12. **Snapshots are not goal-state authority:** `goalAtSnapshot` is for historical inspection only. Current goal behavior must resolve from `userData.selectedGoal` (+ `goalChangedAt`).
13. **Date keys must use shared helpers:** Avoid ad-hoc `toISOString().split('T')[0]` for app logic. Use `utils/dateKeys.js` (`getTodayDateKey`, `formatDateKeyLocal`, `formatDateKeyUtc`) to prevent mixed local/UTC behavior.
14. **Session timing fields are first-class:** `startTime`, `startedAt`, and `endedAt` on cardio/training sessions are used for carryover allocation and day-boundary logic. Preserve these when editing sessions.
15. **Carryover is date-keyed:** `getCarryoverForDateFromSessions()` allocates carryover by overlap windows against `dateKey`; always pass the correct `dateKey` when computing breakdowns/snapshots.
16. **Snapshot EPOC fields are intentional:** `dailySnapshots` persist `epoc`, `epocTraining`, `epocCardio`, `epocFromTodaySessions`, and `epocCarryInCalories` for historical/analytics context.
17. **Store hot-path caches are intentional:** Keep reference-based caches in `useEnergyMapStore` (resolved training/cardio types, sorted entry arrays, normalized phase state, phase view) and preserve `updateUserData` no-op short-circuiting.
18. **Breakdown session reuse is intentional:** `calculateCalorieBreakdown()` reuses prefiltered date-scoped training/cardio sessions for burn calculations; avoid reintroducing duplicate date filtering in the same call path.
19. **Nutrition references are data-backed, not cosmetic:** `nutritionRef` should map to a day that actually has entries in `nutritionData`. If meals are deleted for a date, clear stale refs (store sync handles this for food actions).
20. **Per-phase calorie delta override is layered, not formula replacement:** keep `calculateCalorieBreakdown()`/TDEE core unchanged; apply phase delta via `calculateGoalCalories(..., deltaOverride)` in target resolution paths.
21. **Feasible-date band API is opt-in for heavy arrays.** Prefer summary fields (`strictCount`, `lenientCount`, `feasibleMinDateKey`, `feasibleMaxDateKey`, day-span ranges) and only request date/evaluation arrays when the caller explicitly needs them.
22. **Selector/destructure parity matters:** when selecting store fields in `useEnergyMapStore`, always destructure every referenced variable (`aiChatRolloutUserId`, `aiChatRagRolloutOverride`, `aiChatRagRolloutPercentage`) to avoid runtime `ReferenceError` crashes.
23. **Macro locks are gram anchors, not ratios:** `userData.macroLocks` pins macros in **grams** (max 2 via `MAX_MACRO_LOCKS`). `null`/`''`/negative/NaN are treated as unlocked — never coerce `null` to `0` (a 0g lock is a valid lock and would displace another). Locked grams are **soft anchors**: they relax to safety floors when the calorie target is too low, surfaced via `macroLocks.relaxedKeys` / `lockWarnings`. Always route lock-aware calculations through `calculateMacroRecommendations(..., { macroLocks })` and forward `macroLocks` to `TrackerScreen`/`InsightsScreen`.
