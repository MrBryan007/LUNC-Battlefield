# LUNC Battlefield v10.0 — Graphics + Commander gameplay

**Branch:** `feat/v10-graphics-gameplay` (local only, built on `a51614f` v9.4.17 hotfix). **Not pushed, not merged, not deployed.**
Three.js stays **r128** (no CDN change). Market truth, token logic, price mapping, frontline math, jet state machine and armor kit are untouched.

## Critical fix (v9.4.17, commit a51614f)

`price-territory.js → getVisiblePriceLevels()` could loop forever on phones. With the mobile marker limits (min 4 / max 6),
`niceStep(5e-6 / 2.1)` rounds back up to `5e-6`, so the "shrink step" loop never progressed and **froze the page on any
phone-width or iPhone/Android user agent** before the first frame. The same code is on `main` (live Pages). Fixed with strict-progress
checks + iteration guards.

## Graphics (why it looked like 1999 → what changed)

| Problem | v10 change |
| --- | --- |
| Flat untextured green ground, map ended in a black void | Procedural tiling grass/earth **detail texture** + subtle normal map on the terrain; richer palette; **900 m ground skirt**, two low-poly **horizon ridges**, haze-matched fog |
| No sky, top-down camera | **Gradient sky dome** with sun glow + drifting procedural clouds; lower cinematic 3/4 camera (horizon visible) |
| Dull, washed lighting | Golden-hour key light (stronger, lower angle → longer readable shadows), sky-blue hemisphere, warm rim; **image-based lighting** (PMREM env map of the sky) on MEDIUM+ |
| No post-processing | New `js/postfx.js`: half-float scene target → **dual-Kawase bloom** → one composite pass with sRGB, colour grade (lift/gain, saturation, contrast), lens vignette, dither, **FXAA** (MEDIUM) or **4× MSAA** (HIGH/ULTRA, WebGL2). LOW = off (identical direct path). `?postfx=0` disables. |
| Explosions/smoke were low-poly spheres | Camera-facing **soft billboards**: additive glowing fire/flash/sparks/embers (toneMapped:false so they bloom), noise-textured smoke puffs |
| Dirt patches + centre track were hard-edged rectangles, track z-fought the terrain (stripes) | Soft procedural alpha masks; **road now conforms to terrain**; polygon offset on decals |
| Phones rendered at ~0.72 DPR (blurry) | LOW tier now 1.5 cap × 0.82 scale (dyn-res still drops to 0.55 when FPS sags) |
| HUD | Frosted-glass panels, entrance animations, lighter CSS vignette (post handles the lens vignette) |

Quality tiers (`js/quality.js`) still drive everything: `postFxHooks` per tier — LOW `{off}`, MEDIUM `{bloom 3 levels, FXAA}`, HIGH `{bloom 5, MSAA 4}`, ULTRA `{bloom 5, MSAA 4, stronger}`. Switching tiers live re-configures post-FX without recreating the renderer.

## Gameplay — Commander mode (`js/commander.js`, `css/commander.css`)

The armies still move with the live market. On top of that, **you** now command one side:

- **Pick a side** (Bulls or Bears) on the intro card. "Just watch" keeps the old spectator view (with a "Take Command" button).
- **Abilities:** `1` Artillery (3-shell arcing barrage, 5 s cooldown), `2` Airstrike (bomb run, 16 s), `3` **Moon Shot** ultimate (charged by landing hits). Arm, then click/tap the field. A 3D targeting reticle shows the blast radius. Right-click / Esc cancels.
- **Hit feedback:** big fireball + smoke blasts, point-light flash, bloom, screen shake, brief screen flash, hit marker, floating score, combo counter.
- **Score loop:** points per enemy type (infantry 10 / armor 30 / artillery 45) × combo multiplier; XP + **10 ranks** (Recruit → Validator General) saved locally; best score / best streak.
- **Missions with a difficulty ramp:** rotating orders (hit N infantry/armor, silence artillery, reach a combo, call the front). Each completed mission raises the level → more targets and less time.
- **Call the Front:** LONG/SHORT prediction resolved after 30 s against the **LIVE** price (disabled when price isn't live; flat = push). Labeled game-only, not financial advice.
- **Pause / restart:** `P` or Esc (sim + FX + audio freeze; camera still orbits), restart session from the pause card, auto-pause when the tab is hidden.
- **Audio** (`js/sfx.js`): all synthesized with WebAudio — explosions (filtered noise + sub thump, distance-attenuated), gunfire crackle, jet flyby, UI clicks, success/fail/promotion stingers, quiet battle ambience. Mute with `M` / HUD button (persisted). Hooked into existing battlefield explosions too.
- **Mobile:** Field tab now actually shows the battlefield (the War Room panel used to cover it); compact ability bar + Call panel; tap ability → tap field.

**Data truth:** strikes are cosmetic — they never change market data, army sizes, the frontline or any LIVE/CALCULATED values (units get a small knockback and walk back to their market-driven slot). Moon Shot shows "Game FX only — not a chain burn".

URL flags: `?play=1` skip intro · `?intro=0` · `?commander=0` disable game layer · `?postfx=0`.

## Files

New: `js/proctex.js`, `js/postfx.js`, `js/atmosphere.js`, `js/sfx.js`, `js/commander.js`, `css/commander.css`, `docs/V10-CHANGES.md`, `docs/v10-shots/`.
Changed: `index.html` (scripts, cache-bust `20261008v10`, favicon), `js/battle-engine.js` (lights, post-FX render path, atmosphere/IBL, engine bridge, pause, SFX hooks), `js/effects.js` (billboard FX), `js/terrain.js`, `js/quality.js`, `js/stall-diag.js` (timedRender render callback), `js/camera.js`, `js/config.js` (BUILD v10.0), `js/price-territory.js` (hotfix).

## Verification (headless Chrome + SwiftShader on the box)

- `node --check` on all JS.
- No JS errors / page errors. Only console errors are external CoinGecko CORS / rate-limit responses (pre-existing feed behaviour).
- Quality LOW→MEDIUM→HIGH→ULTRA→AUTO live switch: post-FX off/FXAA/MSAA as expected, no errors.
- Pause/resume, token switch (LUNC→USTC→LUNC), strikes, missions, scoring, promotion all exercised.
- FPS numbers from SwiftShader (software GPU, ~6–38 FPS) are **not valid** perf measurements. Real-device check still needed (iPhone + Mac).

## Screenshots (`docs/v10-shots/`)

`before-desktop-high.png` / `after-desktop-high.png` · `before-desktop-low.png` / `after-desktop-low.png` · `before-mobile.png` / `after-mobile.png` (baseline mobile taken with only the freeze hotfix applied — pre-hotfix the page never rendered) · `after-desktop-high-strike.png` · `after-intro-overlay.png`.

## Known limits / next

- Not measured on a real iPhone or Mac GPU. If iPhone FPS dips, AUTO still picks LOW (no post-FX); users can pick MEDIUM in the gear menu for bloom.
- Unit/structure models are still the original simple procedural meshes; best next visual step is better authored unit models (LOD kit already exists).
- Post-FX + MSAA needs WebGL2; WebGL1 falls back to FXAA-less 8-bit target with bloom.
- Commander progress is localStorage only (no accounts/leaderboard).
