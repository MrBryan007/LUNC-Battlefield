# LUNC Battlefield v9.4 — True LOD system

**Status:** v9.4 on `feat/v9-next-gen-renderer` only. **Not merged to main.** Live Pages remains v8.x.

**v9.4.1 hotfix:** PERF LOD counts use an `endFrame` snapshot after unit/structure/env tallies. Earlier, `quality.tick` ran right after `beginFrame` (zeros), so the overlay always showed LOD0–3 as 0/0/0/0 while internal LOD still worked.

**Prerequisite:** v9.1–v9.3 (renderer, PBR, glTF pipeline). Three.js stays **r128**. **No Three upgrade. No v9.5 in this milestone.**

## Goals

- Camera distance → **LOD0–3** with **hysteresis** (no flicker at boundaries)
- Quality-aware thresholds (LOW aggressive, MED balanced, HIGH richer, ULTRA keep LOD0 farther)
- APIs for units / structures / props (`LUNCBattle.lod`)
- Registry `lodPaths` + loader requests/caches correct LOD asset
- Procedural LOD simplification + GLB LOD path switching (smoke boxes verify only)
- Swap safety (preserve transform, faction, formation home, type, health/state, anim, fire, targeting)
- Frustum / far culling of expensive work — **never** logical despawn
- Anim update rate by LOD; structure + environment LOD; PERF LOD counts
- Memory/disposal ownership rules before KTX2
- Document skinned/animated GLB swap plan for **v9.5** (SkeletonUtils) — not implemented here

## Non-goals

- Full AnimationMixer / SkeletonUtils (v9.5)
- Production impostor atlases / billboard baking
- Three upgrade / WebGPU cutover
- Changing market / Battle Strength / data-truth math
- Merging to `main` / starting v9.5

---

## Architecture

```
js/lod.js            LUNCBattle.lod — bands, hysteresis, culling, anim policy, env/structure passes
js/assets.js         registry lodPaths: { lod0, lod1, lod2, lod3 }
js/asset-loader.js   cache key id::lodN; resolvePath(entry, band); swapVisual()
js/units.js          updateUnitLod per tick; optional GLTF-mode swapVisual
js/animations.js     LOD0 full · LOD1 reduced · LOD2 simple · LOD3 no limb
js/structures.js     decorative cull; silhouette + faction identity kept
js/environment.js    trees/rocks/wreckage/crates/fences/debris — reduce/hide; terrain stable
js/effects.js        skip far particle churn; projectiles still advance
js/quality.js        PERF ASSETS: LOADED vs SPAWNED + LOD0–3 counts
```

## Thresholds (enter) + hysteresis

| Quality | LOD0 enter | LOD1 enter | LOD2 enter | Hysteresis |
| --- | --- | --- | --- | --- |
| LOW | 16 | 32 | 55 | 3 |
| MEDIUM | 20 | 40 | 65 | 4 |
| HIGH | 24 | 44 | 70 | 4 |
| ULTRA | 30 | 52 | 82 | 5 |

**Hysteresis example (HIGH):** LOD0→1 when distance ≥ 24; LOD1→0 only when distance < 20 (24 − 4). Same pattern for LOD1↔2 and LOD2↔3.

Leave thresholds = enter − hysteresis. This is what prevents zoom flicker.

## Procedural LOD

| Band | Visual | Anim |
| --- | --- | --- |
| LOD0 | Articulated full | Full rate |
| LOD1 | Hide minor detail (pack/antenna/wheels) | Reduced-freq (period ~2) |
| LOD2 | Silhouette core (body/hull) | Simple facing + light bob |
| LOD3 | Impostor **prep** (billboard stub OK) | No limb anim |

Missing LOD mesh → keep current visual / procedural SAFE FALLBACK. **Never remove units/armies. Never black canvas.**

## GLB LOD

- Registry `lodPaths` drives loader — no path scatter in unit code
- Smoke-test boxes share the same path for LOD0–2 (verifies request/cache/switch); `lod3: null` → impostor stub
- Missing path → `failed` + procedural / keep current
- `?assets=gltf` enables `swapVisual` verification; AUTO keeps smokeTest procedural default

## Swap safety

`assets.swapVisual(wrap, id, lodBand)` captures/restores:

world pos, rot, side/faction, formation home, type, health/state hooks, anim metadata, fire timing, targeting.

No new logical unit / jump / duplicate on LOD change.

## Skinned / animated GLB swap (v9.5 plan — NOT implemented)

1. Load GLB with skins + clips via GLTFLoader (r128)
2. Clone with **`THREE.SkeletonUtils.clone`** (not `Object3D.clone`) so skeleton binds correctly
3. Retarget or rebind AnimationMixer clips per instance; preserve `userData` combat/formation state via same capture/restore as `swapVisual`
4. Cross-fade Idle/Walk/Run/Aim/Fire/Reload/Hit/Death by clip name (see `docs/V9-ASSET-SPEC.md`)
5. LOD swap replaces rooted skinned mesh while mixer state maps to nearest clip; never reset fire cooldown / home slot
6. Until then: procedural articulated anims remain the SAFE FALLBACK

## Culling

- Frustum / off-camera: skip expensive anim for far units; set `lodCulled` — simulation still moves/fires
- Far FX: skip particle opacity churn beyond ~95u; projectiles still simulate
- Structures: `lodSkipFx` skips blinkers at distance
- Env: hide/cluster far props; **terrain untouched**

## Memory / disposal

- **Template-owned** textures/geos on cached GLB scenes are shared across clones — do **not** dispose maps from clones
- Only dispose maps marked `userData.luncOwned` / `luncOwnsMaps`
- Shared `LUNCBattle.materials` presets (`luncShared`) never disposed from asset dispose
- Nulling map refs without ownership rules is a leak/risk — audit before KTX2 wiring

## PERF overlay

- **ASSETS LOADED (cache)** vs **ASSETS SPAWNED** (GLB spawned · procedural spawned)
- Mode strings: `PROCEDURAL` / `GLTF` / `MIXED` / `GLTF LOADED · PROCEDURAL ACTIVE`
- LOD0–3 counts (+ cull)

## Newhedge honesty

LOD enables richer near models and cheaper far ones — a necessary production step. It does **not** by itself beat Newhedge. Still need:

- Original high-detail hero meshes (not smoke boxes)
- Real PBR textures / atlases (KTX2 later)
- Skeletal animation + polish (v9.5+)
- Unique art direction (no competitor pack copying)

**Bottom line:** v9.4 is production *readiness* for LOD and assets. Visual parity with Newhedge remains an art + animation milestone, not a toggle.

## Known limits / parent smoke notes

- Zoom in/out: watch for LOD boundary flicker (hysteresis should prevent)
- `?perf=1`: confirm LOADED ≠ SPAWNED implication; LOD counts move with camera
- `?assets=procedural`: no GLB spawn; armies remain
- `?assets=gltf`: smoke boxes may appear; LOD swap may re-request same path (verify no jump/dupe)
- Impostor is a stub plane — not production billboards
- Parent should browser-verify zoom; leave notes on any flicker
