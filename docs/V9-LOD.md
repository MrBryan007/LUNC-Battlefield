# LUNC Battlefield v9.4.2 — True LOD system

**Status:** v9.4.2 on `feat/v9-next-gen-renderer` only. **Not merged to main.** Live Pages remains v8.x.

**v9.4.1 hotfix:** PERF LOD counts use an `endFrame` snapshot after unit/structure/env tallies. Earlier, `quality.tick` ran right after `beginFrame` (zeros), so the overlay always showed LOD0–3 as 0/0/0/0 while internal LOD still worked.

**v9.4.2 corrective pass:** Semantic procedural LOD **groups** (not fragile mesh-name aliases), effective cache-key identity, `dispose(id)` clears all LOD variants, LOD3 impostor stub enter/leave, PERF cull counts = frustum/far-skipped only (not double-counted in LOD0–3).

**Prerequisite:** v9.1–v9.3 (renderer, PBR, glTF pipeline). Three.js stays **r128**. **No Three upgrade. No v9.5 in this milestone.**

## Goals

- Camera distance → **LOD0–3** with **hysteresis** (no flicker at boundaries)
- Quality-aware thresholds (LOW aggressive, MED balanced, HIGH richer, ULTRA keep LOD0 farther)
- APIs for units / structures / props (`LUNCBattle.lod`)
- Registry `lodPaths` + loader requests/caches **effective** LOD asset
- Procedural LOD via **semantic groups** + GLB LOD path switching (smoke boxes verify only)
- Swap safety (preserve transform, faction, formation home, type, health/state, anim, fire, targeting)
- Frustum / far culling of expensive work — **never** logical despawn
- Anim update rate by LOD; structure + environment LOD; PERF LOD counts
- Memory/disposal ownership rules before KTX2
- Document skinned/animated GLB swap plan for **v9.5** (SkeletonUtils) — not implemented here

## Non-goals / deferred to v9.5+

- Full AnimationMixer / SkeletonUtils (v9.5)
- Production impostor atlases / billboard baking
- Three upgrade / WebGPU cutover
- Changing market / Battle Strength / data-truth math
- Merging to `main` / starting v9.5
- Production art, KTX2 textures, HUD redesign, Newhedge copying

---

## Architecture

```
js/lod.js            LUNCBattle.lod — bands, hysteresis, semantic groups, impostor stub, cull diag
js/assets.js         registry lodPaths: { lod0, lod1, lod2, lod3 }
js/asset-loader.js   cache key = effective resolved band; dispose clears id + id::lodN
js/units.js          registerLodGroups on builders; updateUnitLod; tally after cull
js/animations.js     LOD0 full · LOD1 reduced · LOD2 simple · LOD3 no limb
js/structures.js     decorative → lodGroups.detail; silhouette + faction kept
js/environment.js    trees/rocks/wreckage/crates/fences/debris — reduce/hide; terrain stable
js/effects.js        skip far particle churn; projectiles still advance
js/quality.js        PERF: LOADED vs SPAWNED + LOD0–3 (visible) + cull (skipped)
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

## Semantic procedural LOD groups

Builders register `userData.lodGroups` (via `LUNCBattle.lod.registerLodGroups`):

| Group | Meaning | Visibility |
| --- | --- | --- |
| `core` / `silhouette` | Recognizable body/hull/carriage | LOD0–2 |
| `major` | Head, turret, barrel | LOD0–1 (hide at LOD2+) |
| `detail` | Pack, antenna, wheels, blinkers, decor | LOD0 only (hide at LOD1+) |
| `limbs` | Legs/arms/tracks/trails | LOD0–1 (hide at LOD2+) |

`lod.js` toggles **by group**, not by fragile names like `leftLeg` / `pack` (builders use `L_upperLeg`, `backpack`, `turret`, `cannon`).

| Band | Visual | Anim |
| --- | --- | --- |
| LOD0 | Full (all groups) | Full rate |
| LOD1 | Hide `detail` only | Reduced-freq (period ~2) |
| LOD2 | `core`/`silhouette` only | Simple facing + light bob |
| LOD3 | Impostor **stub** (procedural groups hidden) | No limb anim |

Missing LOD mesh → keep current visual / procedural SAFE FALLBACK. **Never remove units/armies. Never black canvas.**

### LOD3 impostor stub transitions

`ensureImpostorStub(unit)` creates a cheap colored plane child (`userData.luncImpostor`) once.

- **Enter LOD3:** create/show stub; hide procedural/GLTF visual groups; preserve world position & sim state (no teleport, no duplicate unit, no state reset).
- **Leave LOD3:** hide stub; restore group visibility for the new band.
- Stub only — not production billboards / atlases.

## Effective cache keys (`asset-loader.js`)

Cache identity is the **effective resolved** LOD variant, not the raw request:

- LOW/MED (and narrow viewports) bump a LOD0 request → effective LOD1.
- Key: base `id` for effective 0; `id::lodN` for effective 1–3.
- Must **not** store an LOD1 path under `id` / `id::lod0` when the request was LOD0 but quality resolved to LOD1.
- `resolveEffectiveLodBand` + `cacheKey` / `cacheKeyForRequest` keep keys deterministic and avoid duplicate loads of the same resolved asset.

### Dispose

`dispose(id)` clears:

- base `id`
- all `id::lodN` (and any `id::…` variant keys)
- matching `pending` entries

Reload rebuilds cleanly — no stale refs / leaks across variants for that asset only.

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

## PERF overlay — meaning of counts

Frame order (do not regress): **`beginFrame` → unit/structure/env work + `tally` → `endFrame` (snapshot) → `quality.tick` / PERF reads snapshot**.

| Field | Meaning |
| --- | --- |
| **LOD0–3** | Visible / processed objects that ran LOD work this frame (**not** frustum/far-skipped) |
| **cull** | Frustum / far-skipped count (expensive anim/FX skipped; still simulated) |
| **ASSETS LOADED (cache)** | Templates in loader cache |
| **ASSETS SPAWNED** | GLB spawned · procedural spawned (scene instances) |
| Mode | `PROCEDURAL` / `GLTF` / `MIXED` / `GLTF LOADED · PROCEDURAL ACTIVE` |

Culled objects are **not** included in the LOD0–3 visible totals (v9.4.2). Snapshot via `endFrame` prevents permanent 0/0/0/0 (v9.4.1).

## Newhedge honesty

LOD enables richer near models and cheaper far ones — a necessary production step. It does **not** by itself beat Newhedge. Still need:

- Original high-detail hero meshes (not smoke boxes)
- Real PBR textures / atlases (KTX2 later)
- Skeletal animation + mixer (v9.5+)
- Unique art direction (no competitor pack copying)

**Bottom line:** v9.4.x is production *readiness* for LOD and assets. Visual parity with Newhedge remains an art + animation milestone, not a toggle.

## Known limits / parent smoke notes

- Zoom in/out: watch LOD0↔1↔2↔3 both directions; hysteresis should prevent boundary flicker
- LOD3: stub plane appears; procedural hidden; reverse restores groups — no teleport/dupe
- `?perf=1`: LOD counts move with camera; cull rises when looking away from armies; never stuck 0/0/0/0
- Quality LOW↔ULTRA without reload: effective cache keys / thresholds update; no full page reload required
- `dispose(id)` then reload: clean rebuild of that asset’s variants only
- `?assets=procedural`: no GLB spawn; armies remain
- `?assets=gltf`: smoke boxes may appear; LOD swap may re-request — verify no jump/dupe
- Impostor is a stub plane — not production billboards
- ~390px / WebGPU→WebGL fallback: still SAFE FALLBACK procedural
- Parent should browser-verify matrix A–I; leave notes on any flicker or double-visible stub+mesh
