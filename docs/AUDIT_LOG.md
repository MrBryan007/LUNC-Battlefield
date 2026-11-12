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

---

## 2026-11-12 — P0 Hardening Verification & Forensic DOM Audit

**Objective:** Forensic verification of the P0 hardening work. No new features. Confirm esc()/safeNum(), classify DOM insertion sites, remove unused duplicate, add CI, record exactly what was tested.

**Timestamp:** 2026-11-12 ~08:41 PST (started)

**Starting branch / commit:**  
- `main` @ `279e948b9a01` — Merge pull request #15 from docs/audit-log

**Branch:** `fix/v12.0.62-p0-verify`

**Files inspected:**  
All `.js` and `.html` under the repo (125 files). Focused review of `js/ui.js`, `js/commander.js`, `js/theaters/voice.js`, `js/theaters/brevity.js`, `js/ui/hotseat.js`, `js/config.js`, `index.html`, and every file containing `innerHTML` / `insertAdjacentHTML` / `outerHTML` / `document.write`.

**Files changed:**
- `js/theaters/brevity.js` — escape glossary word before HTML insertion
- `commander.js` (root) — removed (duplicate of `js/commander.js`, unused)
- `.github/workflows/ci.yml` — new CI workflow
- `tests/p0-hardening.js` — added iframe and javascript: href samples
- `docs/AUDIT_LOG.md` — this entry

**Unsafe rendering locations found:**
- `js/theaters/brevity.js` glossary inserted `w` raw. `w` comes from internal brevity codes, not remote user input, but was unescaped. Fixed.

**Locations determined safe:**
- `js/ui.js` `esc()` encodes `& < > " '` in the correct order. Verified by reading source and by `tests/p0-hardening.js`.
- `js/ui.js` burns/whales/proposals use `esc()`. Validator power uses `safeNum()`. Battle Strength name/detail escaped. Source label escaped.
- `js/theaters/voice.js` has its own `esc()` and uses it for who/tag/text.
- Most theater/UI `innerHTML` sites are static trusted markup (panel chrome, SIMULATED labels).
- `js/commander.js` rank/XP display uses `textContent` for the rank name and numeric formatting for XP.
- No query-string values were found being inserted into HTML.

**Unresolved:**
- Theater status strings built as `h` then assigned to `innerHTML` in `asw.js` and `ridge.js` were not fully traced in this pass. Marked UNRESOLVED pending a line-by-line review of those status builders.
- Static `innerHTML` for trusted chrome remains (acceptable, not a vulnerability).

**Exact fixes:**
- Brevity glossary words are now escaped before insertion.
- Root `commander.js` removed. `index.html` loads `js/commander.js` only. The two files were identical at audit time.
- CI workflow runs syntax check + `p0-hardening.js` + `progression-persist.js` + `stabilization-smoke.js` on pull requests and pushes to main. Does not touch Pages deploy.

**Tests added:**  
Expanded `tests/p0-hardening.js` with `<iframe src=javascript:alert(1)>` and `<a href="javascript:alert(1)">`.

**Tests actually run:**
- `node tests/p0-hardening.js` — 17/17 PASS
- `node tests/progression-persist.js` — 15/15 PASS
- `node tests/stabilization-smoke.js` — PASS (no failures)
- `node --check` on all `tests/*.js` and `js/ui.js`, `js/commander.js`, `js/config.js`, `js/theaters/brevity.js` — OK
- Live site smoke via browser: title `v12.0.62 — Ground truth`, `loadBuild` `v12.0.62`, canvas present. No profile matrix.

**Not run (do not claim):**
- HIGH / MEDIUM / LOW graphics profile harnesses (require Playwright + local server; Playwright module not available in this environment)
- iPhone-sized viewport harness
- Shader-error harness
- Road/ground-contact harness
- Aircraft/vehicle harness
- Online-link/network harness
- Lighthouse Performance audit (not executed; no Lighthouse run in this environment)

**Browser / device / graphics profiles tested:**  
Live production page load only (desktop browser). Canvas present. No quality-tier or mobile-viewport matrix was executed.

**Performance impact:** Not measured. No Lighthouse run. No FPS or draw-call numbers.

**Warnings / remaining risks:**
- Theater status HTML in `asw.js` / `ridge.js` not fully classified.
- CSP still not enforced. Three.js still on CDN without SRI.
- Persistence is localStorage only.
- CI does not run the Playwright harnesses.

**Systems deliberately left unchanged:**
- Rank thresholds, XP rates, DataTruth semantics, market/frontline math, aircraft state machines, Three.js version, army density, quality tiers, graphics styling.

**Status:** On branch `fix/v12.0.62-p0-verify`. Not merged. Not deployed.

---

## 2026-11-12 — P0 Verification & Closure (browser XSS, CI, duplicate cleanup)

**Objective:** Close remaining P0 verification items. Real browser XSS test, CI gating, duplicate commander.js removal, truthful regression matrix, Lighthouse notes.

**Timestamp:** 2026-11-12 ~09:47 PST

**Starting branch / commit:**  
- `main` @ `279e948b9a01`  
- Continued on `fix/v12.0.62-p0-verify` @ `695a7344b65a`

**Files changed (this closure):**
- `tests/xss-browser.js` — new browser-level XSS harness
- `.github/workflows/ci.yml` — updated to install Chromium and run browser XSS test
- `docs/AUDIT_LOG.md` — this entry

**Issues confirmed:**
- Prior static XSS test did not exercise the live DOM. Browser test now does.
- Root `commander.js` was unused (confirmed: index.html loads `js/commander.js` only; files were identical). Removed on this branch.
- No CI existed on main. Workflow added on this branch.

**Exact fixes:**
- `tests/xss-browser.js` loads the real page, stubs `LB.burns/whales/governance.getLatest()` with hostile strings, calls the real `LB.ui.renderIntelPanels()` and `LB.ui.renderBattleStrength()`, and asserts no script/img-onerror/svg-onload nodes and no dialogs.
- CI installs Chromium + puppeteer-core and runs syntax, p0-hardening, progression-persist, stabilization-smoke, and xss-browser. Does not touch Pages deploy.
- Root `commander.js` already removed on this branch.

**Tests added:** `tests/xss-browser.js`

**Tests actually run:**
- `node tests/xss-browser.js` — ALL PASS (no dialogs; burns/whales/gov/validators/strengthParts: no script, no img onerror, no svg onload, no raw script, hostile text present)
- `node tests/p0-hardening.js` — ALL PASS
- `node tests/progression-persist.js` — ALL PASS
- `node tests/stabilization-smoke.js` — PASS
- Puppeteer smoke:
  - desktop 1280x800: title v12.0.62, canvas true, quality MEDIUM, HUD present, 0 page errors
  - iPhone 390x844: canvas true, quality LOW (auto), HUD present, 0 page errors
  - forced HIGH via localStorage: canvas true, quality HIGH
  - forced LOW via localStorage: canvas true, quality LOW

**Not run:**
- Full Playwright harnesses (ground, roads, aircraft, netplay) — those scripts hardcode a playwright path not present here
- Lighthouse audit — not executed in this environment
- Shader-error probe — not executed
- Network/online-link harness — not executed

**Lighthouse findings (investigation only, score not re-measured):**
- A Performance score near 17 on a Three.js WebGL page is consistent with: large JS (Three.js r128 from CDN + many game scripts), no server render, canvas-first boot, and Lighthouse treating the page as a document rather than a game.
- P0 changes (esc, persistence, CI, brevity escape) do not add render-blocking assets or change the boot path in a way that would explain a 17 score. The score is structural, not a regression from this hardening.
- Recommendations for a later performance work order: vendor/pin Three.js, defer non-critical theater scripts, measure TTI with the existing boot-stage marks, consider a lighter first paint before optional systems. No trivial fix applied in this pass.

**Browser/device/graphics profiles actually tested:**
- Chromium headless, desktop 1280x800 (MEDIUM)
- Chromium headless, iPhone-sized 390x844 (LOW auto)
- Chromium headless, forced HIGH and LOW
- Live production page load (prior turn): title and canvas confirmed

**Console/shader errors:** 0 page errors on the smokes above. Shader probe not run.

**Remaining warnings / debt:**
- `asw.js` / `ridge.js` status HTML not fully classified
- CSP not enforced; Three.js on CDN without SRI
- Persistence is localStorage only
- CI chromium package name may differ on ubuntu (`chromium` vs `chromium-browser`); workflow tries both

**Systems left unchanged:**
- Rank thresholds, XP rates, DataTruth, market math, aircraft state machines, Three.js version, density, quality tiers, graphics styling

**Status:** On branch `fix/v12.0.62-p0-verify`. PR #16. Not merged. Not deployed.

---

## 2026-11-12 — Master A-to-Z Forensic Audit & Upgrade Planning

**Objective:** Inspect the full repository, document condition, and produce a ranked backlog. No gameplay, graphics, or engine changes.

**Timestamp:** 2026-11-12 ~10:04 PST

**Starting branch / commit:** `main` @ `9d12a25af5cc0e37bbc3303b67be1307a01ec204`

**Files inspected:** ~605 tracked files; 121 JS (~36,100 lines); 16 tests; 49 markdown; 20 GLB; 1 workflow.

**Files changed:**
- `docs/MASTER_AUDIT_2026-11.md` (new)
- `docs/AUDIT_LOG.md` (this entry)

**Code changes:** None.

**Security (this pass):** No new P0. P1: no CSP, CDN Three.js without SRI, unclassified theater status HTML in asw.js/ridge.js. esc()/safeNum() remain correct. No eval, no document.write, no secrets.

**Tests run:** None new. Prior verification tests remain the CI suite. This work order is inspection only.

**Browser/graphics tested:** Not re-run. Prior smoke (desktop MEDIUM, iPhone LOW, forced HIGH/LOW) still stands.

**Performance:** Not measured. Lighthouse ~17 treated as structural for WebGL, not a P0 regression.

**Systems left unchanged:** Everything in the application. Three.js r128. DataTruth. Market math. Aircraft contracts. Rank thresholds.

**Report:** `docs/MASTER_AUDIT_2026-11.md`

**Status:** Documentation only. Pushed for review. No backlog implementation started.
