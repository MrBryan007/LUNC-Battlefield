# LUNC Battlefield — Master A-to-Z Forensic Audit

**Date:** 2026-11-12  
**Auditor:** Grok (inspection only)  
**Starting SHA:** `9d12a25af5cc0e37bbc3303b67be1307a01ec204`  
**Branch inspected:** `main`  
**Live:** https://mrbryan007.github.io/LUNC-Battlefield/ (Pages from `main`, built)  
**Build:** v12.0.62 — Ground truth (2026-11-12)  
**Three.js:** r128 (CDN, no SRI)

This is an inspection and planning document. No gameplay, graphics, or engine changes were made.

---

## Executive assessment

LUNC Battlefield is a mature, actively iterated WebGL RTS layered on live Terra Classic market data. The core idea — Bull vs Bear war driven by real price/volume, with a clear DataTruth vocabulary — is intact and should be preserved.

Maturity is uneven. Market math, quality tiers, Commander progression, and a large theater layer are real and shipped. Visual polish, asset production, living-world logistics, and automated visual/regression coverage lag the systems underneath. The project should be modernized in place, not restarted.

Overall condition: **strong core, prototype-grade presentation, improving security, thin CI.**

---

## Repository inventory

| Kind | Count |
|---|---|
| Tracked files (approx) | 605 |
| JavaScript | 121 |
| JS lines | ~36,100 |
| HTML | 4 |
| CSS | 4 |
| Markdown | 49 |
| GLB models | 20 |
| Tests | 16 |
| Workflows | 1 (`ci.yml`) |

Largest modules: `js/battle-engine.js` (2495), `js/effects.js` (1367), `js/units.js` (1254), `js/commander.js` (1114), `js/asset-loader.js` (972), `js/structures.js` (964).

Open PRs (not closed, not deleted):
- #8 `feat/v11.2-smooth` — smoothness (pre-baked poses, shadow cache)
- #7 `feat/v11.1-perf` — freeze/lag fixes (draft)
- #4 `feat/v9-next-gen-renderer` — LOD + asset readiness (draft)
- #2 `feat/v7.1-terra-intelligence-backend` — Cloudflare Worker

Many dated `ai/2026-10-*` branches exist. None were closed or deleted.

---

## What is already strong (preserve)

- **DataTruth contract.** LIVE / CALCULATED / ESTIMATED / SIMULATED / PARTIAL / UNAVAILABLE are centralized in `js/config.js` and used by market, burns, whales, governance, and Battle Strength.
- **Market-driven frontline.** Price and volume drive army position and density. Game layers are documented as cosmetic.
- **Quality system.** AUTO / LOW / MEDIUM / HIGH / ULTRA. AUTO is capped below ULTRA. Mobile falls back. Confirmed in prior smoke: desktop MEDIUM, iPhone-sized LOW, forced HIGH/LOW all produced a canvas with 0 page errors.
- **Commander progression.** Ranks derived from XP. Persistence hardened (`luncBattlefield.playerProgress`, schema, backup, migration, confirmed reset).
- **Aircraft contracts.** Jet `runId` and helicopter state machine (PATROL → ALIGN → INGRESS → RELEASE → BREAK → COOLDOWN) exist in `battle-engine.js` and were not rewritten.
- **Security baseline.** `esc()` encodes `& < > " '`. `safeNum()` used for validator power. Browser XSS test exercises real render paths. CI runs syntax + security + persistence + smoke + browser XSS.
- **Theater breadth.** Supply, forts, silos, ASW, ridge, voice, UAV, economy, tech, squads, powerups, weather-combat — a wide living-world sketch already exists.

---

## Critical problems

### P0
- None newly confirmed in this pass that require an immediate code change. Prior P0 (broken `esc()`, XP loss, root `commander.js` duplicate) are fixed on `main`.

### P1
- **No CSP.** Three.js and loaders come from `cdnjs` / `jsdelivr` without SRI. A CDN compromise would execute in the page.
- **Theater status HTML not fully classified.** `js/theaters/asw.js` and `js/theaters/ridge.js` assign built strings to `innerHTML`. Not proven hostile, not proven safe.
- **CI does not gate Pages.** A failing test does not block the Pages deploy from `main`. Branch protection was not verified as required.
- **README is stale.** It still describes the project as v7/v8 with v9–v11 on feature branches. Live is v12.0.62. Source wins; docs mislead reviewers.

---

## Security findings

| Severity | Finding | Evidence |
|---|---|---|
| P1 | No CSP; CDN scripts without SRI | `index.html` lines 193–195; `docs/CDN-SRI.md` exists but is not enforced |
| P1 | Unclassified `innerHTML` in theater status builders | `asw.js`, `ridge.js` |
| P2 | 38 files use `innerHTML` | Most are static chrome; remote paths in `ui.js` are escaped |
| P2 | `localStorage` trusted for progression and settings | Convenience only; not financial |
| P3 | `new Function` in a tool script | `tools/v11.1/counts-test.js` — not runtime |
| Info | No `eval`, no `document.write`, no secrets in repo | Scan of JS/JSON/MD |
| Info | Online link-up validates JSON, clamps numbers, rate-limits | `js/ui/netplay.js` header |

`esc()` and `safeNum()` remain correct on `main`. Browser XSS test (`tests/xss-browser.js`) passes against real render paths.

---

## Data-truth audit

- Constants present: LIVE, CALCULATED, ESTIMATED, SIMULATED, UNAVAILABLE, PARTIAL.
- Price, order book, burns, whales, governance, validators feed Battle Strength. ESTIMATED values are labeled and excluded from analytical scores where the current rule says so.
- AI (`js/ai/ai-core.js`) is documented SIMULATED and does not write price, walls, or army counts.
- Commander strikes are cosmetic. Online strikes are cosmetic and do not score.
- No evidence in this pass that graphics code mutates factual market data.

---

## Graphics / renderer findings

- Three.js **r128**, WebGL, procedural fallback when GLBs fail.
- 20 GLBs exist (infantry, armor, artillery, structures, props, v11 tanks/soldier, v12 helicopter/watchtower/bunker/radar). Texture folders are mostly `.gitkeep`.
- No KTX2, Draco, or Meshopt in the live path. Impostors / SkeletonUtils deferred (README still says v9.5).
- Lighting, fog, post-FX, and quality scaling exist (`quality.js`, `postfx.js`, `atmosphere.js`, `environment.js`).
- Why it looks less polished than the systems deserve:
  - Many structures and units still fall back to simple procedural meshes.
  - Bases lack lived-in production art (sandbags, wire, and scars were added as cosmetic overlays, not as authored scenes).
  - Airbases have runway/hangar/tower/radar in the sim, but the visual kit is thin compared to the behavior.
  - No compressed textures; no authored LOD chains for most models.

**Do not replace Three.js.** Modernize materials, lighting, and assets on r128.

---

## Asset pipeline

| State | What |
|---|---|
| Production-ready | Small set of GLBs; loader with procedural fallback |
| Partial | v11/v12 model folders; asset-loader.js (972 lines) |
| Stubbed | Texture directories (`.gitkeep`); KTX2/Draco/Meshopt |
| Missing | Authored LOD variants, skinned animation sets for most units, airbase kit |

---

## Performance findings

- Quality presets scale unit caps, shadows, particles, and post-FX. AUTO max is HIGH.
- `battle-engine.js` is the hot path (2495 lines). Effects (1367) and units (1254) are large.
- Lighthouse ~17 (prior Netlify note) is consistent with a canvas-first Three.js page: large JS from CDN, no SSR, many scripts. Not a regression from P0 hardening.
- No FPS/draw-call numbers were measured in this audit.
- Budgets to adopt later:
  - Desktop HIGH: 60 fps target, draw-call budget documented per tier
  - Laptop MEDIUM: 45–60
  - Modern iPhone LOW/MEDIUM: 30–45, reduced particles and shadows
  - Android LOW: 30, minimal post-FX

---

## Gameplay findings

| System | State |
|---|---|
| Bull vs Bear war, frontline, territory | Complete, market-driven |
| Commander strikes, missions, ranks, XP | Complete, persisted |
| War Room, intel panels | Complete; remote fields escaped |
| Air combat / jets / helicopters | Functional state machines; visual kit thin |
| Artillery, infantry, tanks | Present; mix of GLB and procedural |
| Naval / ASW / silos | Real theater modules; some still cosmetic-leaning |
| Economy, tech, forts, supply, squads | Present as theater layers; depth varies |
| Victory conditions | Session/mission based, not a full campaign |

Feels complete: market war, Commander, quality, DataTruth.  
Feels prototype: airbase visuals, logistics economy, living-world autonomy.  
Feels cosmetic: some weather/cyber/UAV behaviors unless a later version deepened them (changelog notes several were deepened).

---

## Living-world / tycoon-simulation

Already sketched: supply lines, convoys, forts, silos, UAV orbits, base invasions, medics, economy, tech, weather-combat.

Needed for the Command & Conquer + Battlefield + living-sim goal (do not build now):
- Autonomous airbase loops (taxi, takeoff, patrol, land) as a visible default, not only on strike
- Fuel, ammo, repair, engineers as tracked resources
- Convoy routing that reacts to frontline and damage
- Reinforcement and recovery of damaged units
- Infrastructure repair after craters/fires

Architecture sketch: a `Logistics` blackboard (fuel, ammo, repair queues) read by airbase and convoy actors; market pressure still sets the strategic front; logistics only moves units inside the clamp.

---

## AI findings

- `js/ai/ai-core.js`: faction blackboard, message bus, staggered brains, officers, quests. SIMULATED. Outputs depth/lateral offsets only; frontline clamp remains authoritative.
- `js/ai/medics.js`: recovery cosmetic.
- Tier budgets exist (LOW fewer officers/quests).
- Missing for deeper tactics: flanking, retreat, reserves, combined-arms timing, artillery reposition, air-support requests tied to logistics. Preserve market-driven strategic pressure.

---

## Two-airbase audit

Both faction airbases exist in the sim (runway, hangars, tower, radar, AA — per changelog and theater code). Layout is functional and roughly symmetric.

First visual-remaster showcase should be these two sites:
- Keep gameplay positions and runway axes.
- Author faction identity (Bull: cooler metal, cleaner apron; Bear: weathered, heavier revetments).
- Add taxiway markings, parked aircraft, fuel bowsers, blast pens, perimeter wire, and working tower lights.
- Do not move the strategic anchors.

---

## UI / UX

HUD, command dock, War Room, minimap, Bull/Bear indicators, and data-source labels exist. Mobile layout scales. Polish over redesign: tighten panel hierarchy, keep DataTruth badges, avoid new chrome.

---

## Camera / cinematic

`js/camera.js` has pan, orbit, shake (reduced-motion and `?shake=` gated), and cinematic paths. Recommend later: named cameras for each airbase, unit follow, aircraft follow, and a replay director. Do not implement now.

---

## Audio

`js/sfx.js` is synthesized WebAudio. Voice/brevity and soundscape theaters exist. Weak or missing: recorded engines, spatial jets, Doppler, base ambience beds, weather layers. Synthesized SFX is fine as fallback; authored beds would sell the airbases.

---

## Mobile

Quality falls back on small viewports (confirmed LOW at 390×844). Touch and HUD exist. Same game, scaled. Watch particle and shadow budgets on LOW. No separate mobile fork.

---

## Networking / multiplayer

`js/ui/netplay.js` is **experimental P2P**, not production multiplayer.
- WebRTC with copy-paste SDP signalling. No TURN. Some networks cannot connect.
- Strikes shown on the other screen are cosmetic and do not score.
- Messages validated (size, types, clamped numbers, plain-text names) and rate-limited.
- Host-market sync is optional. Each side keeps its own DataTruth labels.
- Do not describe this as production multiplayer.

Hot-seat (`js/ui/hotseat.js`) is local two-player.

---

## Testing / CI

| Automated now | Not automated |
|---|---|
| Syntax (`node --check`) | HIGH/MEDIUM/LOW visual harness in CI |
| `p0-hardening.js` | Road/ground contact |
| `progression-persist.js` | Aircraft state regression |
| `stabilization-smoke.js` | Shader errors |
| `xss-browser.js` (needs Chromium) | Visual regression / screenshots |
| | Network/online harness |
| | Performance budgets |

Playwright harnesses exist (`ground-harness.js`, `roads-harness.js`, `quality-loads-probe.js`, netplay harnesses) but are not in CI and hardcode a local playwright path.

CI runs on PR and push to `main`. It does not replace Pages deploy. Branch protection requiring CI was not confirmed.

---

## Code quality

- Very large files: `battle-engine.js`, `effects.js`, `units.js`, `commander.js`.
- Global `LUNCBattle` namespace throughout. Incremental, not a rewrite.
- TODO/FIXME count in `js/` is low (4).
- Duplication: version strings were previously drifted; now centralized in `BUILD`. Root `commander.js` duplicate removed.
- Stale comments and docs (README, some V8/V9 docs) contradict v12.0.62.

---

## Documentation / Git

- `docs/AUDIT_LOG.md` is current through the P0 verification merge.
- `README.md` is stale (v7/v8 framing).
- `CHANGELOG.md` is detailed through v12.0.x and is the better narrative.
- `docs/AI-HANDOFF.md` and `docs/V12-ROADMAP.md` exist; treat source as truth where they disagree.
- Open PRs #2, #4, #7, #8 may contain useful experiments. Do not merge blindly. Do not delete.

---

## Dead / obsolete / duplicate

- Root `commander.js` — removed.
- Many `ai/2026-10-*` branches — historical, not deleted.
- V8/V9 docs describe unmerged or superseded work. Keep as history; do not treat as current.

---

## Technical debt

- CDN Three.js without SRI
- No CSP
- Large monolithic engine file
- Procedural fallback still the visual default for much of the field
- Persistence is device-local only
- CI does not run the existing Playwright harnesses
- README drift

---

## Recommended architecture (incremental)

1. Keep `LUNCBattle` namespace. Extract hot paths from `battle-engine.js` only when a change requires it.
2. One `BUILD` source (already true).
3. Logistics blackboard beside the AI blackboard, still inside the frontline clamp.
4. Asset manifest with fallback flags so missing GLBs fail soft.

---

## Recommended visual improvements

1. Bull and Bear airbase kits (first showcase).
2. Terrain/lighting pass after airbases (roads already grounded in v12.0.62).
3. Unit animation polish using existing v11 GLBs.
4. Do not upgrade Three.js in the next sprint.

---

## Recommended gameplay improvements

1. Make airbase loops visible by default.
2. Tie supply convoys to a simple fuel/ammo counter.
3. Keep Commander strikes cosmetic relative to market math.

---

## Recommended living-world improvements

See Living-world section. Sequence after airbase visuals so the loops have something to look like.

---

## Recommended test coverage

Add to CI, in order:
1. Keep current security/persistence/smoke/XSS.
2. Quality-load probe (HIGH/MEDIUM/LOW + mobile viewport) once Playwright is portable.
3. Ground/road contact probe.
4. Aircraft runId / heli sequence probe.
5. Screenshot diff for the two airbases after the remaster.

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| CDN script compromise | Low | High | Vendor Three.js, add SRI, then CSP |
| Stale README causes bad merges | Medium | Medium | Update README to v12.0.62 |
| Airbase remaster moves gameplay anchors | Medium | High | Freeze positions; visual-only first pass |
| CI green but Pages broken | Medium | Medium | Require CI; smoke the live URL after merge |
| Logistics sim leaks into market math | Low | High | Same rule as AI: no writes to price/frontline |

---

## Ranked master backlog

### P0 — must fix
None open that require an immediate patch. Prior P0 items are on `main`.

### P1 — high priority
1. **Classify or escape theater status HTML** (`asw.js`, `ridge.js`). Small. Benefit: close the last known injection question.
2. **Update README to v12.0.62.** Small. Benefit: reviewers stop using v8 docs as truth.
3. **Require CI on `main`.** Small/Medium. Benefit: bad merges blocked.
4. **Vendor or SRI Three.js.** Medium. Benefit: supply-chain hardening. Do before CSP.

### P2 — important
5. **Bull + Bear airbase visual remaster** (layout preserved). Large. Benefit: first showcase of the intended look.
6. **Portable Playwright harness in CI** (quality + ground). Medium.
7. **Airbase activity loops visible by default.** Medium.
8. **Simple logistics counters** (fuel/ammo/repair) inside the frontline clamp. Medium.

### P3 — polish / future
9. Authored unit animations and LOD variants. Large.
10. Terrain/lighting remaster. Large.
11. Spatial audio / Doppler. Medium.
12. Named cinematic cameras and replay director. Medium.
13. Optional cloud save (no wallet required). Major.
14. Deeper tactical AI (flank, retreat, reserves). Large.
15. Production multiplayer (needs a server; current link-up is not that). Major.

---

## Final roadmap

Evidence supports the expected sequence, with one insertion:

1. **Gate 1 — security/hardening verification.** Done on `main` (PR #14, #16). Residual: theater status HTML, CSP/SRI.
2. **Gate 2 — CI/regression infrastructure.** Partial. CI exists. Add required checks and portable browser harnesses before a visual sprint so regressions are caught.
3. **Gate 2.5 — README/docs truth pass.** Small, do before the remaster so the showcase is documented against v12.0.62.
4. **Gate 3 — Bull + Bear airbase visual remaster.** First major visual work. Preserve layout.
5. **Gate 4 — production asset pipeline** (manifest, compression, LOD). Supports Gate 3 and later units.
6. **Gate 5 — environment/terrain/lighting remaster.**
7. **Gate 6 — units/animations/combat polish.**
8. **Gate 7 — living-world logistics/economy.**
9. **Gate 8 — deeper tactical AI.**

Do not start Gate 3 until Bryan approves the next work order.

---

## Files changed by this audit

- `docs/MASTER_AUDIT_2026-11.md` (this file)
- `docs/AUDIT_LOG.md` (summary entry appended)

No application code was changed.
