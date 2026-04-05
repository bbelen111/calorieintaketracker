# Energy Map Calorie Tracker

A **React + Vite** single-page app for fitness calorie tracking, wrapped by Capacitor for mobile deployment (iOS/Android). Local-first architecture with Zustand state management, Dexie-backed history persistence, and OpenFoodFacts-backed online food search with barcode lookup.

## 🎯 Features

- **Comprehensive Calorie Tracking** — Foods, steps, cardio, and training sessions
- **Smart TDEE Calculations** — BMR (Mifflin-St Jeor / Katch-McArdle), activity multipliers, EPOC, adaptive thermogenesis, Smart TEF
- **Phase Management** — Track bulking/cutting phases with daily logs and metrics
- **Phase-Based Analytics** — Weight trends, nutrition rollups, daily snapshots
- **Barcode Scanning** — Native barcode lookup via Capacitor
- **Health Connect Integration** — Android step sync (iOS via HealthKit ready)
- **Offline-First** — SQLite local food catalog (13k+ foods), IndexedDB history
- **AI-Powered Food Parsing** — Gemini-backed food entry assistance
- **4 Theme Modes** — Auto, dark, light, AMOLED
- **Mobile-Optimized UI** — Touch-first design, no hardcoded colors, semantic tokens
- **Progressive Web App** — Works offline, installable on mobile

## 🛠 Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Frontend** | React | 18.3.1 |
| **Build & Dev** | Vite | 5.4.11 |
| **Mobile Wrapper** | Capacitor | 8.0.1 |
| **State Management** | Zustand | 4.5.5 |
| **History Storage** | Dexie (IndexedDB) | 4.x |
| **Settings Storage** | @capacitor/preferences | — |
| **Food Catalog** | SQLite (sql.js WASM) | — |
| **Animations** | Framer Motion | 12.23.24 |
| **Styling** | Tailwind CSS | 3.4.17 |
| **Icons** | Lucide React | 0.562.0 |
| **External APIs** | OpenFoodFacts, Gemini | — |

**Key Capacitor Plugins:**
- `@capacitor/preferences`, `@capacitor/app`, `@capacitor/status-bar`, `@capacitor/keyboard`, `@capacitor/barcode-scanner`, `@capgo/capacitor-health`, `@capgo/capacitor-navigation-bar`

## 🏗 Architecture

### Store + Orchestrator Pattern

```
App.jsx (theme management, store hydration gate)
  └─ EnergyMapCalculator.jsx (orchestrator, 3,800+ lines)
      ├─ 5-screen carousel
      │   ├─ LogbookScreen
      │   ├─ TrackerScreen
      │   ├─ HomeScreen
      │   ├─ CalorieMapScreen
      │   └─ InsightsScreen
      ├─ PhaseDetailScreen (drill-down)
      └─ 40 top-level modals + ~21 child-level modals

Persistence:
  Profile (settings/stats)  → Capacitor Preferences
  History (data)           → Dexie (IndexedDB)
    ├─ weightEntries
    ├─ bodyFatEntries
    ├─ stepEntries
    ├─ nutritionData
    ├─ phaseLogV2
    ├─ cardioSessions
    ├─ trainingSessions
    ├─ cachedFoods
    └─ dailySnapshots
```

### Data Flow

```
User Action
  → Store action (updateUserData)
  → deriveState() recalculates (with cached hot-path helpers)
  → Zustand re-renders subscribers
  → Debounced save (1s)
  → Profile save (Preferences, only if payload changed)
  → History save (Dexie, only changed documents)
```

### Derived State & Calculations

The store's canonical fields (computed via `deriveState`) are:
- `bmr`, `trainingCalories`, `totalCardioBurn`, `tdee`
- Sorted entry arrays, resolved type catalogs, phase projections
- Daily snapshots cache

**Never duplicate these calculations.** Always consume from the store.

## 📁 Project Structure

```
src/
├─ components/EnergyMap/
│   ├─ EnergyMapCalculator.jsx    # Main orchestrator
│   ├─ modals/                     # 49 modal files (6 subfolders)
│   │   ├─ fullscreen/             # WeightTracker, BodyFatTracker, StepTracker, Settings, FoodSearch
│   │   ├─ pickers/                # Value selectors (Age, Calendar, Duration, etc.)
│   │   ├─ info/                   # Info/reference modals (BmiInfo, BmrInfo, etc.)
│   │   ├─ forms/                  # Data entry (CardioModal, GoalModal, etc.)
│   │   ├─ lists/                  # Browseable lists
│   │   └─ common/                 # ConfirmActionModal, ModalShell
│   └─ screens/                    # 5 carousel screens + PhaseDetailScreen
├─ store/
│   └─ useEnergyMapStore.js        # Zustand store (state, actions, derived values, persistence)
├─ utils/
│   ├─ calculations.js             # ALL calorie formulas (BMR, TDEE, cardio, training, TEF, AT)
│   ├─ dailySnapshots.js           # Derived daily snapshot builder
│   ├─ storage.js                  # Profile + Dexie orchestration
│   ├─ historyDatabase.js          # Dexie adapter
│   ├─ steps.js                    # Step calculation & range parsing
│   ├─ theme.js                    # Native theme application
│   └─ [26+ more utils]
├─ services/
│   ├─ foodCatalog.js              # SQLite local food search
│   ├─ openFoodFacts.js            # Online food/barcode lookup
│   ├─ gemini.js                   # AI food parsing
│   └─ barcodeScanner.js
├─ hooks/
│   ├─ useAnimatedModal.js         # Modal lifecycle (isOpen/isClosing/requestClose)
│   ├─ useSwipeableScreens.js      # 5-screen carousel
│   ├─ useHealthConnect.js         # Android Health Connect
│   └─ [3+ more hooks]
├─ constants/
│   ├─ foodDatabase.sqlite         # Local food catalog (13k+ foods)
│   ├─ cardioTypes.js              # Cardio activities with MET values
│   ├─ goals.js, mealTypes.js, activityPresets.js
│   └─ [more constants]
└─ tests/
    ├─ utils/                       # calc, steps, phases, storage, etc.
    ├─ services/
    └─ constants/
```

## 🚀 Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm run dev              # Vite dev server (localhost:5173, strictPort)
```

### Production Build

```bash
npm run build            # Build → dist/
npx cap sync             # Sync native projects
npx cap open android     # Open in Android Studio
npx cap open ios         # Open in Xcode (Mac only)
```

### Linting & Testing

```bash
npm run lint             # ESLint check
npm run lint:fix         # Auto-fix lint issues
npm run format           # Prettier formatting
npm run test             # Node test runner
npm run test:watch       # Node test runner (watch mode)
```

## 🔄 Key Patterns

### Zustand Subscriptions

Always use selective subscriptions with `shallow` comparison:

```javascript
const { bmr, userData } = useEnergyMapStore(
  (state) => ({ bmr: state.bmr, userData: state.userData }),
  shallow
);
```

### Store Actions

All mutations go through `updateUserData()`:

```javascript
myAction: (param) => {
  updateUserData(set, get, (prev) => ({
    ...prev,
    myField: value,
  }));
},
```

### Modal Lifecycle

Use `useAnimatedModal()` hook:

```javascript
const myModal = useAnimatedModal();
<MyModal isOpen={myModal.isOpen} isClosing={myModal.isClosing} onClose={myModal.requestClose} />
```

### Calculations

Use centralized functions from `utils/calculations.js`:

```javascript
const bmr = calculateBMR(userData);
const tdee = calculateTDEE({ userData, steps, isTrainingDay, tefContext });
const breakdown = calculateCalorieBreakdown({ userData, steps, isTrainingDay });
```

### Theme System

Always use semantic tokens and accent colors:

```javascript
// ✅ CORRECT
className="bg-surface text-foreground"
className="bg-accent-blue/20 text-accent-red"

// ❌ WRONG
className="bg-slate-800 text-white"
className="text-blue-400"
```

### Touch-First Interactions

Always gate hover states to desktop:

```javascript
// ✅ CORRECT
className="md:hover:bg-blue-600 press-feedback focus-ring"

// ❌ WRONG
className="hover:bg-blue-600"
```

## 💾 Storage Architecture

### Split Persistence

| Key | Storage | Contents |
|-----|---------|----------|
| `energyMapData_profile` | Preferences | Settings, user stats, preferences |
| Dexie `historyDocuments` | IndexedDB | Timeline data sharded by history field |
| `energyMapLastSelectedCardioType` | Preferences | Last selected cardio type (hydration optimization) |

### Dexie History Fields

- `weightEntries`, `bodyFatEntries`, `stepEntries`
- `nutritionData`, `phaseLogV2`, `cardioSessions`, `trainingSessions`
- `cachedFoods`, `dailySnapshots` (sharded by date: `dailySnapshots:YYYY-MM-DD`)

### Daily Snapshots

Snapshot source-of-truth is **derived** (never manually authored). Auto-triggers on:
- Hydration (seed yesterday + today)
- Mutation (food, steps, cardio, training)
- Day rollover caught by app resume

Snapshots include denormalized `goalAtSnapshot` for historical analysis.

## 🔗 Integrations

### OpenFoodFacts

Online food search and barcode lookup via Vercel serverless proxy.

```javascript
import { searchFoods, searchBarcode } from './services/openFoodFacts';
const results = await searchFoods('chicken breast');
const food = await searchBarcode('012345678901');
```

**Configuration:** Set `VITE_OPENFOODFACTS_API_BASE` env var (default: `https://calorieintaketracker.vercel.app/api/openfoodfacts`)

### Gemini AI Parsing

Gemini food parsing via `api/gemini.js` (server-side key handling).

```javascript
import { parseFood } from './services/gemini';
const parsed = await parseFood('2 chicken breasts, cup of rice, tablespoon olive oil');
```

### Local Food Catalog (SQLite)

13k+ foods indexed in SQLite, queried at runtime via `sql.js` WASM.

```javascript
import { searchFoods, getFoodById } from './services/foodCatalog';
const results = await searchFoods({ query: 'chicken', category: 'Meat', limit: 50 });
```

### Health Connect (Android)

Native step data sync via `@capgo/capacitor-health`.

```javascript
const health = useHealthConnect();
// Returns: { status, steps, lastSynced, connect, refresh, disconnect }
```

## 📊 Calorie Calculation System

### Key Formulas

| Calculation | Function | Details |
|------------|----------|---------|
| BMR | `calculateBMR(userData)` | Mifflin-St Jeor; upgrades to Katch-McArdle with valid body fat |
| Step Calories | `getStepDetails(steps, userData)` | Stride-based (height × 0.415/0.413) |
| Cardio | `calculateCardioCalories(session, userData, cardioTypes)` | MET-based or heart rate formula |
| Training EPOC | `resolveTrainingSessionEpoc({...})` | Post-exercise burn + carryover window |
| Cardio EPOC | `resolveCardioSessionEpoc({...})` | Post-exercise burn + carryover window |
| TDEE | `calculateTDEE({...})` | BMR + activity + training + cardio + steps + EPOC |
| Breakdown | `calculateCalorieBreakdown({...})` | Full TDEE with all components & diagnostics |
| Smart TEF | `calculateTefFromMacros({...})` | Protein×25% + Carbs×8% + Fats×2% |
| Adaptive Thermogenesis | `computeAdaptiveThermogenesis({...})` | Bounded ±300 kcal/day correction |

All formulas are **centralized** in `utils/calculations.js`. Never duplicate or inline calculations.

## 🎨 Theme System

### 4 Theme Modes

- **Auto (default):** Follows system `prefers-color-scheme`, real-time updates
- **Dark:** Slate 900 background
- **Light:** Slate 100 background, dark text
- **AMOLED:** Pure black (#000000)

### Semantic Tokens

| Token | Use | Light | Dark |
|-------|-----|-------|------|
| `bg-background` | Primary background | Slate 100 | Slate 900 |
| `bg-surface` | Secondary surface | Slate 50 | Slate 800 |
| `text-foreground` | Primary text | Slate 900 | Slate 50 |
| `text-muted` | Secondary text | Slate 600 | Slate 400 |
| `bg-primary`, `text-primary-foreground` | Primary action | Blue | Blue |

### Accent Colors (12 flavors)

`accent-blue`, `accent-red`, `accent-green`, `accent-yellow`, `accent-orange`, `accent-purple`, `accent-lime`, `accent-emerald`, `accent-amber`, `accent-slate`, `accent-indigo`, `accent-pink`

Auto-adjust: 400-level shades (dark/AMOLED), 600-level (light).

## ⚠️ Common Pitfalls

1. **Never hardcode colors** — Use semantic tokens (`bg-surface`, `text-foreground`) and accent colors
2. **Subscriptions must use `shallow`** — Prevents unnecessary re-renders on store updates
3. **Async storage is always awaited** — `Preferences.get()`/`.set()` are async
4. **Do not duplicate calculations** — Always consume from store or `utils/calculations.js`
5. **Save debounce is critical** — Removing 1-second debounce causes UI freezes on large JSON writes
6. **Modal close must use `requestClose()`** — `forceClose()` skips exit animations
7. **Always use `seedDate` helpers** — Avoid ad-hoc `toISOString().split('T')[0]` for date keys
8. **No bare `hover:` classes** — Always gate to desktop with `md:hover:`
9. **Preserve session timing fields** — `startTime`, `startedAt`, `endedAt` are used for carryover/boundary logic
10. **Daily snapshots are derived cache** — Never manually edit; always use `upsertDailySnapshot(...)`

## 🔧 Configuration

### Environment Variables

```env
VITE_OPENFOODFACTS_API_BASE=https://your-vercel-url/api/openfoodfacts
VITE_GEMINI_API_BASE=https://your-vercel-url/api/gemini
```

### Capacitor Config

```javascript
// capacitor.config.json
{
  "appId": "com.energymap.tracker",
  "webDir": "dist",
  "// ... more config"
}
```

### Vite Config

```javascript
// vite.config.js
{
  "server": { "strictPort": true, "port": 5173 },
  "// ... more config"
}
```

## 📝 Testing

Tests use Node's built-in `--test` runner with ESM. Coverage includes:
- **Calculations** — BMR, TDEE, cardio, training, TEF, AT, EPOC
- **Storage** — Persistence split, Dexie sharding, profile/history semantics
- **Utilities** — Steps, weight, body fat, phases, snapshots, date keys
- **Services** — Food search, OpenFoodFacts, food catalog

```bash
npm test
npm test:watch
```

## 📖 Additional Resources

- See `AGENTS.md` for comprehensive architecture & implementation guidelines
- `utils/calculations.js` — Comment-heavy calorie formula reference
- `store/useEnergyMapStore.js` — Store structure & action patterns
- `tests/` — Working examples of utility usage & calculation validation

## 📄 License

[Your license here]

---

**Last Updated:** April 2026