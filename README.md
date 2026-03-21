# Energy Map Calorie Tracker

## Storage Migration Status

Current phase: **Cutover (Dexie-first writes)**.

Completed so far:
- Dexie-backed dedicated history storage added for heavy history fields.
- Profile/settings continue to persist via Capacitor Preferences.
- Backfill fallback from legacy history key to Dexie is in place.
- Migration state and failure hardening added.
- Regression coverage added for split persistence and legacy migration behavior.
- History writes now default to Dexie-only; legacy history key write is opt-in.
- Safety fallback keeps writing legacy history key automatically if Dexie write fails.

## Rollout Configuration

Use the following environment flag to control safety dual-write during rollout:

- `VITE_ENABLE_HISTORY_DUAL_WRITE=true`
  - Writes history to **Dexie** and legacy Preferences history key.
  - Use for conservative rollback windows or migration validation.

- `VITE_ENABLE_HISTORY_DUAL_WRITE=false` (default)
  - Writes history to **Dexie only**.
  - Legacy Preferences history key is still used automatically as a fallback if Dexie write fails.

This variable is defined in the root `.env` file.