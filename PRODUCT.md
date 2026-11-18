# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

Energy Map ships only as native iOS and Android apps (React + Vite bundle wrapped by Capacitor). There is no hosted web app; the only Vercel deployment is API-only (`/api/*`, everything else 404s). The browser target exists for development (`npm run dev`, `localhost:5173`) and is never deployed.

The UI is one custom design system rendered inside a WebView on both OSes, not platform-native components. It still owes each OS its platform guarantees — safe-area insets, the system Back gesture, keyboard/IME insets, Reduce Motion, read-only HealthKit on iOS — and those obligations are load-bearing on both targets.

## Users

- **Primary user today: the maintainer.** Daily personal use on a phone. Confirmed: personal for now, planned for a testing circle next, with an eventual public release.
- **Future audience: not yet defined.** The shipped vocabulary — Lean Bulk / Moderate Cut / Aggressive Cut, gram-anchored macro targets, phase logs, body-fat tracking, training and cardio sessions, EPOC — addresses someone who already understands TDEE, macros and bulk/cut cycles rather than a first-time dieter. Inferred from the shipped feature set, not confirmed by the maintainer. Public-release audience, pricing and launch scope are undecided.

## Product Purpose

Rebuild the user's true Total Daily Energy Expenditure every day instead of handing them a static number, and apply the chosen goal or phase on top — so the calorie target someone eats against reflects what their body actually burned that day.

Success is a target the user can trust and audit: every part of the day's expenditure is visible, attributable to a logged input or a documented formula, and recoverable from history weeks later.

## Positioning

A date-keyed expenditure ledger, not a static BMR × activity multiplier.

TDEE is recomposed per day from BMR (Mifflin-St Jeor, upgrading to Katch-McArdle when body fat is tracked), NEAT, net steps with ambulatory-cardio overlap deduction, logged exercise, EPOC with midnight carryover, TEF, and a bounded adaptive-thermogenesis correction. Each day is persisted as a derived snapshot, so any past day can be reopened and recomputed exactly as it was recorded.

That history is what a neighboring tracker could not truthfully copy: the mechanism is the ledger underneath the number, plus local-first data — no account, no server-side user record, and a bundled 13,000-food catalog that works with the network off.

## Operating Context

- **Used as a daily ritual on a phone, in portrait.** A morning weigh-in, meals logged across the day, one-handed entry in a kitchen or gym, sessions after training, and a review of the day's ledger in the evening.
- **The device is the database.** Profile and settings live in Capacitor Preferences; history lives in IndexedDB. There are no accounts, no login, no analytics, and no crash-reporting SDK.
- **Network is optional and explicit.** Offline catalog search and all tracking work with no connection. Only the queries a user actively makes — online catalog search, barcode lookup, AI food chat — leave the device, to Supabase, OpenFoodFacts or OpenRouter respectively.
- **Steps arrive from the OS health store.** Health Connect on Android (read/write scope); Apple Health on iOS, read-only by design.
- **Exports leave through the OS share sheet** (CSV/JSON written to the app cache, never uploaded).
- **Build and release are the maintainer's own loop:** Vite build → `cap copy`/`cap sync` → Xcode/Android Studio → device. Xcode live reload over LAN needs a temporary ATS exception that must not ship.

## Capabilities and Constraints

**Capabilities (shipped):**
- Five-screen swipeable surface — Logbook, Tracker, Home (default), Calorie Map, Insights — plus a Phase detail drill-down outside the carousel.
- Food logging by local catalog search, barcode scan, or AI chat; entries may carry fiber, sodium, saturated fat and sugars, each nullable when untracked.
- Steps manual or health-synced; cardio and training sessions by intensity or heart rate; EPOC with an adjustable carryover window.
- Five goals and dual-mode phases (`goal` / `target`) with smart daily-delta planning and feasible-date bands; macro targets with gram locks.
- Derived daily snapshots, a Daily Ledger calendar, and rolling energy-balance windows of 3/7/14/28 days.
- Per-day NEAT override, eight themes, and an in-app text-size and density scale.

**Constraints that future work must preserve:**
- Local-first persistence split: Preferences for profile/settings, IndexedDB (sharded by date) for history. Saves are incremental, never whole-database writes.
- No accounts, no authentication, no server-side user data, no analytics.
- iOS 16.4 minimum (Tailwind v4's browser floor); Android ships through Health Connect.
- Native-only distribution. The Vercel project is API-only and its domain is a compatibility contract with already-installed builds — renaming or moving it breaks online search, barcode and AI chat in every installed app.
- All Rights Reserved; single maintainer; no third-party reuse.
- Every calorie number is centralized in one formula module. Duplicated or inline math is a correctness bug, not a style preference.

**Explicitly undecided:** public-release scope, audience definition, pricing/monetisation, support commitments, and the accessibility standard (see below).

## Brand Commitments

- **Name:** "Energy Map", shipped as `appId com.energymap.tracker`, `appName "Energy Map"`; the repository and store listing title is "Energy Map Calorie Tracker".
- **Voice:** plain, technical, and honest about limits. The product's own copy says it "refuses to hand you a static number", and the docs state accepted limitations plainly rather than papering over them. Numbers are presented with their provenance, not as magic.
- **Constraint:** All Rights Reserved, one maintainer. No brand-voice, logo or identity document exists beyond what ships in the app's native resources; the design system itself is documented in `AGENTS.md`.

## Evidence on Hand

- **Eight real device screenshots** in `.github/assets/` (Home, breakdown, step tracker, Daily Ledger, local food search, AI logger, macro split, phase creation) — the only visual evidence of the product in use.
- **A bundled SQLite catalog** of 13,000+ curated foods, built and audited by scripts in this repo, with per-food sourcing recorded.
- **Two automated test tiers** (logic + UI) with CI gates, including an Xcode build of the real project, so "it builds and the formulas hold" is evidence rather than a claim.
- **Documented math** in `README.md` for every expenditure term.

**Absences future work must not fabricate:** no user testimonials or case studies, no user research, no analytics or usage numbers, no App Store presence or reviews yet, no press, and no published validation study comparing calculated TDEE against measured expenditure. Accuracy claims must stay formula-and-source based ("this is what the stack computes"), never "clinically accurate" or "proven".

## Product Principles

1. **Expenditure is rebuilt, never assumed.** Every number on screen traces to a logged input, a documented formula, or a recorded snapshot. A static daily target is a failure state.
2. **Honest absence beats a plausible zero.** Missing days, untracked micronutrients, and stale weigh-ins are shown as unavailable — never zero-filled, never interpolated into a claim.
3. **The device is the database.** Local-first, no account, and any network call is a query the user chose to make. Data leaving the device is the exception that must be visible.
4. **Entry must survive the real scene.** One-handed, mid-day, in a kitchen: speed of logging and glanceability of the result outrank decoration, and every interaction assumes a thumb on a phone.
5. **Measured claims only.** Limits get documented rather than hidden, and nothing unverified gets presented as fact — no invented testimonials, no "scientifically proven" accuracy.

## Accessibility & Inclusion

**Standard: deliberately undecided** (confirmed by the maintainer). Future work should not invent a conformance claim or a WCAG statement, but must not regress the commitments the app already ships:

- Focus rings on interactive elements, and reduced-motion opt-outs for every animation.
- A rem-based text scale (13px phone / 17px desktop) with an in-app Text size setting, plus a separate layout density setting.
- Maintainer-accepted trade-off on record: the Compact density shrinks tap targets below the usual 44pt guidance. Do not widen or fix that silently — revisit it as its own change.
- Touch-first in every respect: no hover-dependent affordance, no desktop-only interaction as the only path.
