# LUNC Battlefield v9.4.5 — PERFORMANCE RECOVERY

**Status:** v9.4.5 on `feat/v9-next-gen-renderer` only. **Not merged to main.** No Pages deploy from this milestone.

**Baseline (v9.4.4 acceptance):** sustained ~**25 FPS / 40ms**, Calls ~**600–940**, Tris ~**36–44k**, Units ~**48–74**. Visual OK; too slow to add next art.

**Goals:** Recover substantial FPS / draw calls **without** emptying the battlefield, reverting tanks to slabs, disabling air combat, making the scene look obviously worse, or changing market/data-truth.

**Targets:** normal cam **50–60 FPS** if realistic; heavy combat **>45**; minimum = major measurable improvement from ~25 FPS. Materially cut ~600–940 calls.

---

## Profile first (code + renderer.info)

Inspected `renderer.info`, material/geo construction, FX pools, LOD tick, lights/shadows, minimap Hz, and per-frame allocations.

| Rank | Bottleneck | Evidence | Why it hurts |
| --- | --- | --- | --- |
| **1** | **Shadow-map draw spam** | Every procedural mesh used `castShadow=true` via `meshFrom` (~12–18 meshes/unit × ~60 units ≈ 700+ casters) | Shadow pass ≈ one extra draw per caster → dominates Calls ~600–940 |
| **2** | **Main-pass mesh count** | Infantry/armor/arty multi-mesh; LOD hides groups but far units still drawn when off-frustum | Frustum only skipped **anim**, not `visible` |
| **3** | **LOD CPU every frame** | `updateUnitLod` + env `traverse` every frame for all units/props | Distance + hysteresis + group toggles on 60+ objects @ 25 FPS compounds frame time |
| **4** | **FX / light alloc** | New `MeshBasicMaterial` per scorch/shockwave; new `PointLight` per muzzle/explosion | GC + unique mats; unbounded flash lights |
| **5** | **Unique LOD3 stub mats/geos** | `ensureImpostorStub` allocated per unit | Inflates `info.memory.geometries` / materials |
| **6** | **Minimap + PERF UI** | `getDefenseMarkers` every frame; overlay refresh 0.35s; HIGH minimap 12 Hz | CPU noise under combat |
| **7** | **Per-shot matrix / clone** | `muzzleWorld` cloned Vector3 + `updateMatrixWorld(true)`; heli rotor / air shadow `.clone()` mats | Allocations + unique transparent mats |

Transparent FX (smoke/sparks, `depthWrite:false`) remain secondary vs shadow spam. Population intentionally kept (Units ~48–74).

---

## Optimizations shipped (v9.4.5)

1. **Selective unit shadows (largest expected Calls win)**  
   - Only **core** meshes cast (torso/hull/turret/cabin/fuse). Limbs, wheels, detail, ground blobs: never cast.  
   - Runtime `LUNCBattle.lod.applyShadowPolicy`: cast only at **LOD0–1**; LOD2+/culled → off.  
   - Tighter sun shadow camera frustum (battlefield center).

2. **Frustum hide (not despawn)**  
   - Band ≥2 + out of view → `unit.visible = false` (sim continues). Structures same.

3. **LOD CPU stagger**  
   - LOD0–1: every frame. LOD2: every 2 frames. LOD3: every 4. Bucketed by `userData.index`.  
   - Env LOD traverse every 3rd frame. No intentional visible “delayed LOD” pop (hysteresis retained).

4. **Shared LOD3 impostor pool**  
   - Shared stub geos + 2 faction `MeshBasic` mats (bull/bear).

5. **FX lifecycle**  
   - Scorch / shockwave mesh pools; flash `PointLight` pool capped (2 mobile / 4 desktop).  
   - Projectile/particle mats cloned once at pool create (no per-spawn `new Material`).  
   - Air combat + heli/jet kept.

6. **Shared unit transparent mats**  
   - Heli rotor disc + air ground-shadow: shared basics (no per-unit `.clone()`).

7. **Minimap / PERF throttle**  
   - HIGH minimap **8 Hz**, ULTRA **10**, MEDIUM **8**, LOW **7**.  
   - Defense markers ~2 Hz; PERF overlay refresh **0.5s**; label **v9.4.5**.

8. **Cheaper muzzle**  
   - Scratch `Vector3`; no forced `updateMatrixWorld(true)` per shot.

**BUILD:** `v9.4.5` · cache `?v=20260912v945` · PERF label `v9.4.5`.

---

## What we did **not** do

- Cut army density / air wings  
- Flatten tanks to slabs  
- Disable air combat  
- Change market / Battle Strength / data-truth  
- Start v9.5 authored unit kit / SkeletonUtils / KTX2  
- Merge to `main` / deploy Pages  

---

## Before / after measurement notes (parent browser verify)

Use `?perf=1` (or Shift+P). Prefer fixed Graphics **HIGH** (not AUTO) for A/B.

| Metric | v9.4.4 baseline | v9.4.5 expect |
| --- | --- | --- |
| FPS / frame ms | ~25 / ~40ms | major ↑ (aim 50–60 normal; >45 heavy) |
| Calls | ~600–940 | material cut (often ~½ from shadow policy alone) |
| Tris | ~36–44k | mild ↓ (frustum hide + LOD) |
| Units | ~48–74 | **unchanged density** |
| Visual | tank hull+turret+cannon; air OK | same silhouettes; close shadows still present |

**Single opt expected to help most:** selective + distance LOD shadow casting (shadow-map draw elimination).

Regression checks: tanks still read as tanks at LOD2; heli/jet still fire; no empty battlefield.
