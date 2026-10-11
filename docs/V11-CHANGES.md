# LUNC Battlefield v11.0: realistic units + modern military look

**Branch:** `feat/v11-realistic-units` (based on `main` @ `bd185ac`, the live V10.0). **Not merged, not deployed.**
Three.js stays **r128** from the same CDNs. No CDN or script source changed, and no new libraries were added.

## What changed, in plain words

- **Real 3D soldiers instead of stick figures.** Every infantry unit is now a rigged soldier model (CC0, Quaternius) in olive fatigues and a dark plate carrier, with a faction-coloured visor and a carbine. They animate between **idle (rifle ready), walk, run, and firing** depending on what the unit is doing.
- **Real armour.** Main battle tanks replace the box tanks: two different hulls, one for Bulls and one for Bears. Every third armour slot is an **armoured IFV/APC truck**, and on MEDIUM and up, armoured **MG technicals** escort part of the armour group. IFVs fire short **machine-gun tracer bursts** at the front.
- **More troops on the field.** Each market-driven infantry slot now carries squadmates: about **3x infantry on HIGH/ULTRA, 2x on MEDIUM, and 1.5x on LOW**. Every artillery battery gets a **mortar team** (2 crew plus a mortar) that lobs **arcing mortar shells** and leaves **craters**. Artillery guns are kept as they were.
- **Polish.** PBR materials (roughness/metal, using the V10 sky reflections), instanced shadows on MEDIUM+, **dust kicked up by moving vehicles**, scorch craters from mortars, and the existing muzzle flashes, tracers, and explosions. The colour grade is cooler and more modern: teal shadows, warm highlights, a little less saturation, and a little more contrast.

## How it works (and why gameplay and data are untouched)

New file `js/v11-units.js` is a **visual skin layer**. Each frame it reads the armies from `LUNCBattle.engine.getArmies()` and draws models at each unit's existing transform with `THREE.InstancedMesh`.

- Army sizes, slots, the frontline, market and price feeds, LIVE/CALCULATED labels, and Commander scoring are **not touched**. The escorts and mortar teams are cosmetic. They are not targets and don't change any number.
- The procedural meshes still exist. They are moved to camera layer 1, so they're hidden but still used for LOD, muzzle positions, and Commander hit tests. The ground blob shadow stays visible. If a model fails to load, that unit type stays procedural, which is the SAFE FALLBACK. Add `?v11=0` to get the pure V10 look.
- **Animated crowds cheaply:** each animation clip is sampled into 6–8 static poses at load time (`SkinnedMesh.boneTransform`). Each pose is one InstancedMesh per faction, so hundreds of animated soldiers cost about 56 small draw calls instead of hundreds of AnimationMixers. Baking yields between clips so the page stays responsive. It took about 2–8 s in software rendering on the box, and should be much faster on an M1.
- Engine hooks are tiny: `battle-engine.js` calls `v11.init(engine)` after the V10 engine bridge and `v11.update()` at the start of `drawFrame()`. `units.js` only tags the ground blob (`userData.groundBlob`).

## Unit counts (desktop caps per side; phones use the existing smaller caps)

| Tier | Soldiers drawn | Armour | Mortar teams | Shadows / dust |
| --- | --- | --- | --- | --- |
| LOW (phones) | infantry × 1.5 (phone max 28 → ~42) | MBT + IFV (1 in 3), no technicals | about half of the batteries | off / off |
| MEDIUM | infantry × 2 (max 52 → 104) + 2 per mortar | MBT/IFV + technicals on ~25% | every battery | on / on |
| HIGH / ULTRA | infantry × 3 (max 52 → 156) + 2 per mortar | MBT/IFV + technicals on ~50% | every battery | on / on |

Model budget: soldier about 2.6k tris, tanks about 2.3–2.4k, IFV about 4k, technical about 3.2k (after gltfpack simplification). Total model download is about 0.94 MB.

## Hard constraints kept

- No change to market, price, feed, or data-truth logic or labels, frontline math, or LIVE/CALCULATED values.
- The v9.4.17 phone-freeze fix in `price-territory.js` is untouched.
- Three.js r128 from the same CDN. BUILD is `v11.0`, and the cache-bust is `?v=20261010v11` on every script and stylesheet.

## Files

- New: `js/v11-units.js`, `assets/models/v11/*.glb` (5 CC0 models), `docs/ASSET-LICENSES.md`, `docs/V11-CHANGES.md`, `docs/v11-shots/`
- Changed: `index.html` (script tag, cache-bust, build label), `js/config.js` (BUILD v11.0), `js/battle-engine.js` (2 hooks), `js/units.js` (blob tag), `js/postfx.js` (grade values), `README.md`

## Verification (box: headless Chrome + SwiftShader software GPU)

- `node --check` passes on every JS file.
- No page errors. The only console errors are pre-existing external feed ones (CoinGecko CORS/rate limit, Binance websocket).
- LOW → MEDIUM → HIGH → ULTRA → AUTO live switch works: post-FX none/FXAA/MSAA, and the v11 tier follows it (escorts, shadows, dust). Pause/resume, LUNC → USTC → LUNC token switch (rebuilt units get re-skinned), a Commander artillery strike, and `v11.setEnabled(false/true)` all ran without errors.
- **SwiftShader FPS is not a valid measurement** (about 4–25 FPS for both V10 and V11 on the CPU renderer). **A real check on the Mac M1 8 GB and an iPhone is still needed.**

## Screenshots (`docs/v11-shots/`)

`before-desktop-high.png` / `after-desktop-high.png` · `before-desktop-low.png` / `after-desktop-low.png` · `before-mobile.png` / `after-mobile.png` · `after-closeup-infantry.png` · `after-closeup-armor.png`

## Known limits / next

- Environment props (rocks, crates, sandbag blocks) and structures are still the old simple meshes. They're the next biggest "old-school" tell.
- Soldiers' rifles are a simple original mesh. Tanks are static models (no track or turret animation). Artillery guns are still procedural.
- Bull tint is baked at load using the token colour at that moment. Switching tokens keeps the first tint (cosmetic only).
- Infantry LOD uses the same mesh at all distances. If the M1 struggles on HIGH, the first knob is `TIER.HIGH.infEscort` (2 → 1).
