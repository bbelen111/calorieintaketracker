# Security Policy

**Energy Map Calorie Tracker** is a local-first calorie and energy-balance tracker that ships as
native iOS and Android apps (React + Vite bundle wrapped by Capacitor). There is **no hosted web
app** — the only Vercel deployment is **API-only** (`/api/*`; every other path returns `404`).

This document covers how to report a vulnerability, what is in scope, which controls are actually
implemented, and which risks are knowingly accepted. Every control described below is traceable to
the source in this repository — nothing here is aspirational. Where a limitation exists, it is
stated plainly rather than papered over.

---

## 🎯 Scope

### In scope

| Surface | Location | Notes |
| --- | --- | --- |
| Native app (iOS + Android) | `src/`, `ios/`, `android/` | The shipped product. Data stays on-device. |
| OpenRouter AI proxy | `api/openrouter.js` | **Highest-value target** — holds a paid API key server-side and is the only endpoint with an origin allowlist and a rate limiter. |
| Online catalog search proxy | `api/foods.js`, `api/usda.js` | `api/usda.js` is a legacy alias that re-exports the same handler. |
| Barcode lookup proxy | `api/openfoodfacts.js` | Forwards barcode lookups to OpenFoodFacts. |
| Offline catalog tooling | `scripts/food-db/` | Build/curate/enrich pipeline for the bundled SQLite catalog. |
| Build, CI and release path | `vite.config.js`, `.github/workflows/ci.yml`, `capacitor.config.json`, `vercel.json` | Includes anything that could leak a secret into a shipped bundle. |

### Out of scope

- **Third-party upstreams.** Supabase / PostgREST, OpenFoodFacts and OpenRouter are separate
  services. Report issues in them to their own security teams — this project only proxies to them.
- **Catalog data quality.** Nutrition accuracy, taxonomy and portion oddities in the bundled
  catalog are data-correctness issues, not vulnerabilities. Open a normal issue (see
  `scripts/food-db/` and the README).
- **The browser target.** `npm run dev` (`localhost:5173`) exists for development and QA only. It
  is never deployed and is not a supported production target.
- **Physical device access.** Attacks requiring an unlocked, already-compromised device, or a
  rooted/jailbroken device, are out of scope.
- **Social engineering, spam, and volumetric denial of service** against the API endpoints.

---

## 📣 Reporting a Vulnerability

**Please do not open a public issue for a security report.** Use one of the private channels below.

### Preferred: GitHub Private Vulnerability Reporting

Open a private advisory at:

**https://github.com/bbelen111/calorieintaketracker/security/advisories/new**

(or: repository **Security** tab → **Report a vulnerability**).

> This button only appears when the maintainer has enabled *Private vulnerability reporting* in the
> repository settings. If you do not see it, use the fallback below.

### Fallback: email

**187245515+bbelen111@users.noreply.github.com**

This is the maintainer's GitHub-linked (noreply) address, so replies may be routed through GitHub
rather than a normal mailbox. If you need a guaranteed two-way channel, open the private advisory
instead.

### What to include

The more of this you can provide, the faster triage goes:

- **Affected surface** — one of the rows in the scope table (`api/openrouter.js`, `api/foods.js`,
  `api/openfoodfacts.js`, the native app, `scripts/food-db`, or the build/CI path).
- **Impact** — what an attacker gains, and against whom (the maintainer, a user, or the API
  deployment).
- **Reproduction** — exact steps, the request/response or build command, and any payload.
- **Environment** — commit SHA or version, platform (iOS/Android), OS version, and whether it is a
  debug or release build.
- **Disclosure status** — whether any part of this is already public.

### What to expect

These are targets, not a contractual SLA:

| Stage | Target |
| --- | --- |
| Acknowledgement of your report | ~3 business days |
| Initial triage and severity assessment | ~7 business days |
| Fix or documented mitigation | Depends on severity and release cadence |

Fixes ship through the normal release path (native app updates + API deploys), so a fix may be live
on the API before an app-store update reaches users. Please allow a **90-day coordinated disclosure
window** before publishing; the maintainer will credit you in the advisory unless you ask to remain
anonymous.

### Safe harbour

Good-faith security research on **your own account, device and data** is welcome. While
investigating, please do not:

- access, modify, or exfiltrate other people's data;
- run denial-of-service or load-testing attacks against the API endpoints;
- use the paid AI endpoint for bulk/unbounded testing (spend is the maintainer's — see the
  rate-limit notes below);
- publish exploit details before the disclosure window closes.

The maintainer will not pursue action against researchers who follow these rules.

### No bug bounty

This project is **All Rights Reserved** (see `LICENSE`) and has no bug-bounty program. Reports are
acknowledged and credited, but no monetary reward is offered.

---

## 🧱 Security Architecture

### Data residency: local-first by design

The app has **no accounts, no login, and no server-side user data**. There is no authentication
system and no analytics or crash-reporting SDK in the client bundle.

| Data | Where it lives |
| --- | --- |
| Profile, settings, preferences | `@capacitor/preferences` on-device (`energyMapData_profile`) |
| History — weight, body fat, steps, nutrition, phases, cardio/training sessions, daily snapshots | Dexie (IndexedDB) on-device (`energyMapHistory`) |
| Food catalog | Bundled SQLite (`src/constants/food/foodDatabase.sqlite`), queried via `sql.js` |

Consequence for triage: there is **no central store of user data to breach**. The interesting
attack surface is the API proxy layer and the build/release path, not a user database.

### Transport

All production traffic is HTTPS. The app declares `ITSAppUsesNonExemptEncryption = false` in
`ios/App/App/Info.plist` (standard OS-provided HTTPS only — no custom cryptography). Plain-HTTP
origins (`http://localhost:*`, `http://127.0.0.1:*`) are allowed by the OpenRouter proxy **for
local development only**.

### Secret handling

| Secret | Handling |
| --- | --- |
| `OPENROUTER_API_KEY` | **Server-side only.** Read in `api/openrouter.js`; never sent to the client. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Server-side only; used for the rate limiter. |
| `SUPABASE_ANON_KEY` / `SUPABASE_PUBLISHABLE_KEY` | Read-only key, public by design. `api/foods.js` never reads a service-role key. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Never used in this deployment** — it belongs to the offline catalog pipeline seeder only. |
| `VITE_*` variables | **Public by definition** — Vite inlines them into the shipped bundle. Never put a secret here. |

`.env`, `.env.*` and `.env*.local` are gitignored, and no environment file is tracked in the
repository.

### Device permissions

| Platform | Permission | Purpose |
| --- | --- | --- |
| Android | `INTERNET` | API calls |
| Android | `health.READ_STEPS`, `ACTIVITY_RECOGNITION` | Read step count from Health Connect |
| iOS | `NSHealthShareUsageDescription` | Read steps from Apple Health |
| iOS | `NSCameraUsageDescription` | Scan food barcodes |

Health sync is **read-only on iOS by design**: `NSHealthUpdateUsageDescription` is deliberately
absent and `ios/App/App/App.entitlements` carries only `com.apple.developer.healthkit` (no
clinical-records array), because the app never writes health data there. Exports are written to the
app cache and handed to the OS share sheet (`@capacitor/filesystem` + `@capacitor/share`) — the app
never uploads them.

### Endpoint controls

#### `api/openrouter.js` — AI parsing proxy (the sensitive one)

Keeps the paid OpenRouter key server-side. Controls, in request order:

1. **Origin allowlist.** `ALLOWED_ORIGINS` (comma-separated) is enforced; a disallowed `Origin`
   gets `403` — including on `OPTIONS`. `BUILTIN_ALLOWED_ORIGINS` always permits
   `capacitor://localhost`, `ionic://localhost`, `https://localhost[:*]`, `http://localhost[:*]`
   and `127.0.0.1[:*]`, because the native WebView legitimately runs from those origins.
2. **Method gate.** `POST` and `OPTIONS` only; anything else gets `405`.
3. **Per-IP rate limit** (see below) — `429` with `Retry-After`.
4. **API key presence** — `500` if `OPENROUTER_API_KEY` is unset (fail closed, never proxy
   unauthenticated).
5. **Mode allowlist.** `mode` must be one of `extraction`, `presentation`, `grounding_lookup`;
   anything else gets `400` with the valid list.
6. **Payload bounds.** `messages` must be a non-empty array, at most `MAX_CONTENT_ITEMS` (30)
   items, and at most `MAX_CONTENTS_PAYLOAD_BYTES` (500 000) serialized bytes; each message must
   have a valid `role` and non-empty text or a supported image content block. Violations get
   `400`/`413`.
7. **Gated tool injection.** OpenRouter web-search tools are injected **only** for
   `mode: 'grounding_lookup'` with `useGrounding === true` — never for extraction or presentation.
8. **Upstream error hygiene.** Upstream error text is mapped into the response, but internal
   `error.message` is only echoed when `NODE_ENV === 'development'`.

**Rate limiting** uses Upstash Redis REST (`INCR` / `EXPIRE … NX` / `TTL` in one pipeline):

- Requires **both** `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. With either missing the
  limiter is **skipped entirely** — this is the single most important deployment check.
- `OPENROUTER_RATE_LIMIT_MAX_REQUESTS` (default 60; production uses 15) per
  `OPENROUTER_RATE_LIMIT_WINDOW_SECONDS` (default 60).
- `OPENROUTER_RATE_LIMIT_FAIL_CLOSED=true` makes a limiter-backend outage tighten (reject) rather
  than remove the limit.
- The bucket key comes from `x-real-ip`, falling back to the **last** `x-forwarded-for` hop, then
  the socket address. `x-forwarded-for` is client-appendable, so its **first** entry is forgeable;
  keying on it would let a caller mint a fresh bucket per request and bypass the throttle entirely.

#### `api/foods.js` (+ `api/usda.js` alias) — online catalog search

- **Read-only credentials only.** Uses `SUPABASE_ANON_KEY` / `SUPABASE_PUBLISHABLE_KEY`; RLS grants
  public `SELECT` and the RPCs are `EXECUTE`-granted to `anon`. The service-role key is never read.
- `action` must be `search` (`400` otherwise); `query` must be at least 2 characters.
- `pageSize` is clamped to **1–50**, and `page` to a positive integer, so callers cannot request
  unbounded result sets.
- Upstream retries apply to **real 5xx only** (`DEFAULT_MAX_ATTEMPTS = 3`, hard ceiling 5) with
  exponential backoff plus jitter.
- Responses are cacheable at the edge (`Cache-Control: public, s-maxage=120,
  stale-while-revalidate=600`) — no user-specific data is ever returned.
- CORS is `*` by design: the payload is a public food catalog, and the endpoint is unauthenticated.

#### `api/openfoodfacts.js` — barcode lookup

- `GET` only; `action` must be `barcode`.
- The barcode is **digit-normalized** (all non-digits stripped) and must be at least 8 digits, so
  arbitrary strings cannot be smuggled into the upstream URL path.
- The upstream request uses a **fixed, allowlisted `fields` list** — callers cannot inject arbitrary
  OpenFoodFacts query parameters.
- CORS is `*` by design; the endpoint returns public product data and holds no credentials.

---

## 🛡 Threat Model & Mitigations

| Threat | Mitigation | Where |
| --- | --- | --- |
| API key theft from the shipped app | The key is never in the bundle — all AI calls go through the serverless proxy | `api/openrouter.js`, `src/services/openrouter.js` |
| LLM credit abuse / cost exhaustion | Per-IP throttle via Upstash, with `Retry-After` and optional fail-closed | `checkRequestRateLimit` |
| Rate-limit bypass by forging client IP | Bucket key prefers `x-real-ip` and takes the **last** `x-forwarded-for` hop, never the first | `resolveClientIp` |
| Oversized or malformed prompts (cost/DoS) | 30-message cap, 500 000-byte cap, per-message validation, fixed per-mode `max_tokens` | `MAX_CONTENT_ITEMS`, `MAX_CONTENTS_PAYLOAD_BYTES`, `isValidMessage` |
| Forcing expensive web-grounded calls | Grounding tools injected only for `grounding_lookup` + explicit `useGrounding` | `payload.tools` gate |
| Path/parameter injection into an upstream | Digit-normalized barcode + fixed `fields`; fixed `action` values everywhere | `api/openfoodfacts.js` |
| Enumerating/abusing a privileged database key | Anon/publishable key only; RLS + RPC grants; service-role key absent from the deploy | `api/foods.js` |
| Internal error details leaking | Upstream error text is mapped; raw `error.message` only under `NODE_ENV=development` | `api/openrouter.js`, `api/openfoodfacts.js` |
| Secret committed to the repo or bundled into `dist/` | Gitignored env files; no env file tracked; server-side proxying; `VITE_*` treated as public | `.gitignore`, README |
| Silent regression of the release bundle | CI asserts `dist/index.html` + expected vendor chunks, then `cap copy` into the native projects | `.github/workflows/ci.yml` |

---

## ⚠️ Known & Accepted Limitations

These are **known and deliberate**, documented so reporters and users can reason about residual
risk instead of rediscovering it. They are not unreported vulnerabilities.

1. **The origin allowlist is not a security boundary.** Any HTTP client can forge an `Origin`
   header, and the native app legitimately runs from `capacitor://localhost` /
   `https://localhost`, which must stay allowed. The allowlist filters casual browser use; the
   **rate limiter is the real control** on the AI endpoint.
2. **The API functions are unauthenticated.** There is no API key, session or user identity on
   `api/*` — by design, since the app has no accounts. Per-IP throttling is the only spend control
   on `api/openrouter.js`.
3. **Missing Upstash credentials silently disable the rate limiter.** If either
   `UPSTASH_REDIS_REST_URL` or `UPSTASH_REDIS_REST_TOKEN` is unset, `checkRequestRateLimit` returns
   "not limited" and the paid endpoint is open to any caller. This is a deployment-configuration
   risk, and it is called out in the hardening checklist below.
4. **`429` handling is best-effort across a distributed limit.** The limiter is a simple
   `INCR` + `EXPIRE … NX` counter keyed per IP, so it is approximate under concurrency and shares
   one bucket across everyone behind a NAT or corporate egress IP.
5. **HealthKit cannot confirm read access.** On iOS, HealthKit deliberately never reveals whether
   *read* permission was granted, so `checkAuthorization` answers "has the user already been
   asked?" rather than "was it granted?". A user who denied access reads back as authorized and
   simply gets zero samples. This is an Apple platform limitation, not an app bug.
6. **Local data is protected by the OS app sandbox, not app-level encryption.** Weight, body fat,
   nutrition and step history sit in IndexedDB and Capacitor Preferences. There is no additional
   at-rest encryption layer beyond what the platform provides (device encryption, app sandboxing).
   Anyone with an unlocked device or a device backup can read it.
7. **Query text leaves the device when online features are used.** Online catalog search, barcode
   lookup and AI chat necessarily forward the query, barcode or prompt (and any attached image) to
   Supabase, OpenFoodFacts and OpenRouter respectively. Offline catalog search and all tracking
   work without any network access.
8. **The AI chat path sends user-authored text and images to a third-party LLM.** Prompts are
   bounded in size but are not filtered for sensitive content — do not type anything into the AI
   logger that you would not send to a third-party API.
9. **`NSAllowsLocalNetworking` is a dev-only ATS exception.** The README documents adding it so the
   plain-HTTP dev server on a LAN IP works during development. It is **not present in the shipped
   `ios/App/App/Info.plist`** — if you add it locally, remove it before a release build so App
   Transport Security stays strict.
10. **`vercel.json` must stay routes-only.** `framework` / `buildCommand` / `outputDirectory`
    overrides (even set to `null`) previously stopped the deployment from landing. Routing is
    evaluated before file serving, which is what makes every non-`/api` path return `404`.
11. **Dependency and secret scanning are only partly automated.** Dependabot security alerts and
    CodeQL code scanning are both enabled, but `npm audit` does not run in CI (so advisories never
    fail the build), there is no Dependabot version-update configuration, and there is no secret
    scanning workflow. See the supply-chain section.

---

## 🚀 Deployment Hardening Checklist

Before exposing the API deployment to users, confirm every item:

**Required — the AI endpoint is otherwise open or broken**

- [ ] `OPENROUTER_API_KEY` is set (server-side only).
- [ ] `UPSTASH_REDIS_REST_URL` **and** `UPSTASH_REDIS_REST_TOKEN` are both set — without them the
      rate limiter is skipped.
- [ ] `OPENROUTER_RATE_LIMIT_MAX_REQUESTS=15` (mirrors the client budget).
- [ ] `OPENROUTER_RATE_LIMIT_WINDOW_SECONDS=60`.
- [ ] `OPENROUTER_RATE_LIMIT_FAIL_CLOSED=true` (an Upstash outage should tighten, not remove, the
      limit).

**Required — the online catalog is otherwise unavailable**

- [ ] `SUPABASE_URL` and `SUPABASE_ANON_KEY` (or `SUPABASE_PUBLISHABLE_KEY`) are set. Use the
      read-only key — **never** the service-role key.
- [ ] `OPENFOODFACTS_USER_AGENT` identifies the deployment (OpenFoodFacts requires a meaningful
      user agent).

**Recommended**

- [ ] `ALLOWED_ORIGINS` lists only real production origins. Remember it does not replace the rate
      limiter.
- [ ] `OPENROUTER_MODEL` / `OPENROUTER_FALLBACK_MODELS` / `OPENROUTER_GROUNDING_MODEL` are pinned
      rather than left to a moving default.
- [ ] Per-mode token budgets (`OPENROUTER_MAX_TOKENS_EXTRACTION`,
      `OPENROUTER_MAX_TOKENS_PRESENTATION`, `OPENROUTER_MAX_TOKENS_GROUNDING`) are set to cap worst-case
      spend per request.

**Invariants — do not change these**

- [ ] `vercel.json` has no `framework` / `buildCommand` / `outputDirectory` overrides.
- [ ] The project name and the `calorieintaketracker.vercel.app` domain are unchanged — they are the
      baked-in default base URLs behind the `VITE_*_API_BASE` defaults, so changing them breaks
      already-installed apps.
- [ ] No secret is ever placed in a `VITE_*` variable; Vite inlines those into the shipped bundle.

---

## 📦 Dependency & Supply-Chain Posture

**What exists today**

- `package-lock.json` is committed, so installs are reproducible and CI uses `npm ci`.
- Third-party licence obligations are tracked in `THIRD_PARTY_NOTICES.md`, regenerated with
  `npm run licenses:generate`.
- **Dependabot security alerts are enabled**, so GitHub surfaces dependency advisories on the
  default branch.
- **CodeQL code scanning is enabled** (advanced setup — `.github/workflows/codeql.yml` and
  `codeql-swift.yml`). JavaScript/TypeScript — ~67k lines and effectively the whole product — is
  analysed on every push and pull request to `main`, weekly, and on demand, and needs no build.
  Swift is analysed best-effort and path-gated; see the note under the gap list for why.
- CI (`.github/workflows/ci.yml`) runs two jobs:
  - `verify` — `npm ci` → `npm run lint:ci` → `npm run test:coverage` → `npm run test:ui` →
    `npm run build` → an assertion that `dist/index.html` and the expected `chunk-*` vendor bundles
    were emitted → `npx cap copy android`.
  - `ios` — `npm ci` → build → `npx cap copy ios` → `xcodebuild` with signing disabled, proving the
    Xcode project still compiles with every Capacitor plugin linked through Swift Package Manager.
- Android release signing keys and iOS provisioning profiles are not committed to the repository.

**Current advisory snapshot (October 2026)**

`npm audit` reports **0 advisories**.

Getting there took three steps, all confined to the build/dev toolchain — none of it is runtime code
in the shipped app bundle:

- The Tailwind v3 chain (`braces`, `postcss-selector-parser`) disappeared when Tailwind moved to v4,
  which drops those dependencies entirely.
- `source-map-js` was cleared by a plain `npm audit fix` (1.2.1 → 1.2.2).
- `uuid` (GHSA-w5hq-g745-h8pq, `<11.1.1`) is forced to `^11.1.1` for `xcode` through a **scoped**
  `overrides` entry in `package.json`. `xcode@3.0.1` is the latest release and still pins
  `uuid: ^7.0.3`, so no upstream fix exists and `npm audit fix` cannot reach it without `--force`
  (which would also risk downgrading `@capacitor/cli`).

The override is safe here because `xcode` has exactly **one** `uuid` call site — `uuid.v4()` with no
arguments, in `generateUuid()` — while the advisory only affects `v3`/`v5`/`v6` **when a `buf`
argument is passed**. The vulnerable path is unreachable. Verified before committing: `xcode` still
parses the real `ios/App/App.xcodeproj/project.pbxproj`, `generateUuid()` still returns unique
24-character uppercase hex, `npx cap copy ios` succeeds, and build plus both test tiers are
unaffected. The override is scoped to `xcode` rather than global so it cannot leak to another
consumer if one is ever added.

**Known gaps (planned, not claimed as done)**

- `npm audit` is **not** run in CI, so advisories are visible but never fail the build.
- No Dependabot **version-update** configuration (`.github/dependabot.yml`), so advisories are
  surfaced without automated update PRs.
- No secret scanning workflow (CodeQL code scanning now covers JavaScript/TypeScript and Swift).
- No SBOM beyond `THIRD_PARTY_NOTICES.md`.
- No reproducible-build or artifact-provenance attestation for the native binaries.

**Note on Swift coverage:** Swift analysis is deliberately best-effort. Its workflow is path-gated to
iOS-relevant changes and its job is `continue-on-error`, because CodeQL supports only `autobuild` and
`manual` for Swift (`build-mode: none` exists for C/C++, C#, Java and Rust only) and can therefore
only analyse Swift by compiling it — which requires `npm ci` first, since
`ios/App/CapApp-SPM/Package.swift` declares ten local path dependencies into `node_modules`.

If you are reviewing this project, treat the dependency graph and the native build toolchain as
part of the attack surface.

---

## 👤 Maintainer & Contact

| Field | Value |
| --- | --- |
| Maintainer | Brendon Justine Alvero Belen ([@bbelen111](https://github.com/bbelen111)) |
| Repository | https://github.com/bbelen111/calorieintaketracker |
| Private advisory | https://github.com/bbelen111/calorieintaketracker/security/advisories/new |
| Fallback email | 187245515+bbelen111@users.noreply.github.com |
| License | All Rights Reserved (see `LICENSE`) — no bug bounty |

---

## 📚 Related Documentation

- `README.md` → **Configuration** → *OpenRouter Proxy Security Notes* — the operator-facing summary
  of the endpoint's controls and the Upstash requirement.
- `README.md` → **Vercel Deployment (API-only)** — why `vercel.json` is routes-only and why the
  domain is a compatibility contract.
- `AGENTS.md` — architecture and implementation guidelines, including the platform-divergence and
  keyboard/inset contracts referenced above.
- `api/openrouter.js`, `api/foods.js`, `api/openfoodfacts.js` — inline comments document the
  reasoning behind the origin allowlist, the `x-forwarded-for` hop choice, and the read-only key
  policy.

---

**Last Updated:** October 2026
