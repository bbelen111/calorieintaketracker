# Energy Map Calorie Tracker

An interactive React and Tailwind web app that helps lifters and active users translate their daily activity, cardio, and training habits into actionable calorie targets. The interface guides you through configuring personal metrics, selecting daily goals, and reviewing dynamically generated macro recommendations so you can make consistent nutrition decisions.

- **Three guided screens** make it easy to manage profile data, inspect step-based calorie maps, and review macro insights.
- **Framer Motion powered UI** keeps modal workflows smooth while swiping between screens on desktop or mobile.
- **Local storage persistence** remembers settings, cardio sessions, and preferred step ranges across visits.

---

## Features

- Personal profile configuration with age, weight, height, and training presets.
- Training day vs. rest day toggles with quick overrides for duration and modality.
- Rich cardio session builder using MET-based burn calculations and reusable presets.
- Step range management with fully editable buckets and detailed calorie breakdowns.
- Goal-driven calorie targets (maintenance, bulking, cutting, aggressive variants).
- Macro guidance tied to weight and goal selection, including contextual tips.
- Animated modal system shared across pickers, info dialogs, and settings menus.

## Getting Started

### Prerequisites

- Node.js 18.0 (or newer) and npm 9 (or newer). Use `node --version` to verify.

### Installation

```powershell
git clone https://github.com/bbelen111/calorieintaketracker.git
cd calorieintaketracker
npm install
```

### Development Server

```powershell
npm run dev
```

- Vite serves the app on a local URL (default: `http://localhost:5173`).
- The server reloads automatically when you edit files inside `src/`.

### Production Build

```powershell
npm run build
npm run preview
```

- `npm run build` compiles an optimized bundle in `dist/`.
- `npm run preview` launches a local static server to check the production build.

## Available Scripts

- `npm run dev` – start the Vite dev server.
- `npm run build` – emit production assets to `dist/`.
- `npm run preview` – preview the production bundle locally.

## Project Structure

```text
src/
	App.jsx                 # Entry point that mounts the EnergyMapCalculator
	components/
		EnergyMap/
			EnergyMapCalculator.jsx   # Main state coordinator and modal orchestrator
			screens/                  # Home, Calorie Map, and Insights screen UIs
			modals/                   # Goal, cardio, training, and settings dialogs
			common/                   # Shared layout shells and the swipeable tab UI
	hooks/                  # Custom hooks: data management, modals, swipe logic
	utils/                  # Calculation, step range, and storage helpers
	constants/              # Configurable cardio, goal, and training presets
```

## Calculation Methodology

- **Basal Metabolic Rate (BMR):** The app uses the Mifflin-St Jeor equation with metric units. This formula is widely cited for its balance of clinical evidence and ease of use. Gender, age, weight, and height all directly influence the estimated resting calorie burn.
- **Activity Multiplier:** Training and rest days apply different baseline activity multipliers (0.35 vs. 0.28 of BMR) to approximate the thermic effect of daily movement beyond tracked steps. These values draw from typical moderate activity profiles and can vary significantly among individuals.
- **Step-Based Calories:** Each step range leverages heuristics in `getStepDetails` that combine user weight, stride length assumptions, and typical MET values for walking. Increasing ranges scale calories non-linearly to reflect higher durations and the compounding effect of sustained movement.
- **Training Expenditure:** Predefined training types use calories-per-hour estimates from sports science literature and fitness trackers. A custom training option allows manual overrides when your sessions differ from the presets. Training calories change proportionally with session duration.
- **Cardio Sessions:** Each cardio modality references MET tables stratified by intensity (light, moderate, vigorous). Calories are computed as `MET × body weight (kg) × hours`, a standard approach for steady-state cardio estimation.
- **Goal Adjustments:** Maintenance keeps calories near total daily energy expenditure (TDEE). Bulking and cutting goals apply ±300 to ±500 calorie differentials to reflect common weekly weight change targets (~0.25–1.0 kg).

## Accuracy and Limitations

- Estimates rely on population averages; individual metabolism, body composition, hormonal factors, and tracking accuracy can shift actual energy needs by 10–20% or more.
- MET values assume steady, consistent effort. Interval training, strength circuits, or highly skilled movements often deviate from standard tables.
- Step counts and cardio inputs do not account for non-exercise activity thermogenesis (NEAT) outside tracked sessions. Consider monitoring trends and adjusting manually if results diverge from expectations.
- BMR equations presume healthy adults. Adolescents, older adults, pregnant individuals, or those with medical conditions should consult a clinician or registered dietitian for personalized advice.

## Disclaimer

This tool provides educational estimates only and is not a substitute for professional medical or nutritional guidance. Always cross-reference the app’s recommendations with your own observations, progress metrics, and, when possible, input from qualified health professionals. Use responsibly, especially if you have underlying health conditions or specialized performance goals.


