# LUNC Battlefield Audit Log

Permanent record of completed work orders. Another reviewer should be able to reconstruct what changed without chat history.

Entries are appended. Do not rewrite prior entries except to correct a factual error.

---

## 2026-11-12 — P0: Player rank/XP persistence + HTML hardening

**Objective:**  
1. Fix player rank/XP loss on refresh/restart.  
2. Harden unsafe remote-data rendering (`esc()`, validator power, Battle Strength, source labels).  
3. Align release metadata (codename/date) with the visible title.

**Date/time:** 2026-11-12 ~08:00–08:31 PST (merged 16:28 UTC)

**Starting branch / commit:**  
- `main` @ `41bd46c35d18` — Merge feat/v11.1-perf (v12.0.62 ground truth) into main

**Final commit:**  
- `2c2906bb43cd` — Merge pull request #14 from `fix/v12.0.62-p0-ship`  
- PR: https://github.com/MrBryan007/LUNC-Battlefield/pull/14  
- **Pushed to main:** Yes. GitHub Pages built and serving.

**Files changed:**
- `js/commander.js` — persistence, schema, validation, backup, migration, confirmed reset
- `js/ui.js` — corrected `esc()`, added `safeNum()`, escaped Battle Strength name/detail, escaped source label, validator power via `safeNum`
- `js/config.js` — codename aligned to `Ground truth`, date to `2026-11-12`
- `tests/progression-persist.js` — new
- `tests/p0-hardening.js` — new
- `commander.js` (root, accidental early push; superseded by `js/commander.js`)

**Bugs / vulnerabilities confirmed:**
- Rank/XP lived in a fragile `localStorage` key (`luncBattle.commander.v10`) with no schema, no validation, no backup, and no migration. A bad save or failed load could wipe progress.
- `esc()` in `js/ui.js` replaced characters with themselves instead of HTML entities (`&` → `&`, `<` → `<`). Remote strings in burns, whales, proposals, validators, and Battle Strength were not safely escaped.
- Validator `votingPower` / `tokens` were inserted raw into HTML.
- Battle Strength `p.name` and `p.detail` were inserted raw.
- Liquidity `sourceLabel` was inserted raw.
- BUILD codename was `Flight controls` / date `2026-11-05` while the page title said `Ground truth`.

**Exact fixes:**
- New storage key `luncBattlefield.playerProgress` with backup key `luncBattlefield.playerProgress.backup`.
- Schema version 1. XP is the source of truth; rank is recalculated via existing `rankFor(xp)`. Rank thresholds and names were not changed.
- `migratePlayerProgress()` rejects negative / NaN / Infinity / non-numeric XP; recovers valid XP if optional fields are corrupt.
- Legacy key `luncBattle.commander.v10` is read if the new key is empty.
- Save on XP award, rank-up, side change, intro seen, `pagehide`, and `beforeunload`. Load happens before any save. Defaults are never written over a valid save.
- Pause menu **Reset progress** requires confirmation. Cancel does nothing. Session restart still does not clear XP.
- `esc()` now emits `&`, `<`, `>`, `"`, `&#39;`.
- `safeNum()` used for validator power. Battle Strength name/detail and source label escaped.
- Config codename/date aligned to title.

**Tests added:**
- `tests/progression-persist.js`
- `tests/p0-hardening.js`

**Tests actually run:**
- `node tests/progression-persist.js` — 15/15 PASS
- `node tests/p0-hardening.js` — 15/15 PASS
- `node --check js/commander.js` — OK
- `node --check js/ui.js` — OK
- `node --check js/config.js` — OK

**Pass/fail:** All listed tests passed. No failures recorded.

**Browser / device / graphics profiles tested:**  
None in this pass. No browser harness was run. Live site was checked after Pages built (title, config, commander store key, esc entities present).

**Performance impact:** Not measured. No density, quality, or renderer changes.

**Warnings / known issues / technical debt:**
- Persistence is localStorage only (same browser + device). Not cloud sync.
- Accidental root `commander.js` was pushed early; the real file is `js/commander.js`.
- CSP is not enforced. Three.js remains on CDN without SRI.
- Static `innerHTML` for trusted markup remains.

**Systems deliberately left unchanged:**
- Rank thresholds and rank names
- XP earning rates
- DataTruth semantics
- Market / frontline math
- Aircraft run-state machines
- Three.js version (r128)
- Army density and quality tiers

**Verification:**  
Live site after Pages build confirmed:
- `js/config.js` codename `Ground truth`, date `2026-11-12`
- `js/commander.js` uses `luncBattlefield.playerProgress`
- `js/ui.js` `esc()` contains `&` / `<` / `>`

**Status:** Merged to main. Live.
