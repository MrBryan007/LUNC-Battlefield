> **v9.4.11:** Jet attack choreography + runId-synced impacts (no magic setTimeout blasts). Army density / effect caps unchanged; expect FPS ≈ v9.4.10 M1 baseline (~60 HIGH) if Metal soak confirms.

> **v9.4.10:** AUTO quality ceiling capped at **HIGH** (never auto-select/promote ULTRA) + Retina dPR≥1.5 hardware-score tax — interactive headroom on MacBook/windowed Chrome. Manual ULTRA still works. M1 headless still ~60 FPS @ HIGH/ULTRA; feel lag was AUTO→ULTRA under Retina load.

> **v9.4.9:** Authored armor/arty kit (LOD silhouettes). Mesh-merge strategy retained; see **`docs/V9-ARMOR.md`**. FPS not re-measured on SwiftShader box — cite v9.4.8 M1 baseline.

> **v9.4.8:** Calls ~65 @ ~5.4 FPS wall — JS only ~4 ms. Stall instrumentation in **`docs/V9-STALL.md`** (not more mesh merges).

> **v9.4.7 follow-up:** PERF was able to lock at 25/40ms due to sim-capped `dt` → `quality.tick`. See **`docs/V9-CADENCE.md`** for the wall-clock fix, RAF probe, and scene/A-B isolation matrix.

# LUNC Battlefield v9.4.6 — REAL PERF via mesh merging

**Status:** v9.4.6 on `feat/v9-next-gen-renderer` only. **Not merged to main.** No Pages deploy from this milestone.

**Baseline (v9.4.4 acceptance):** sustained ~**25 FPS / 40ms**, Calls ~**600–940**, Tris ~**36–44k**, Units ~**48–74**.

**v9.4.5 result (FAILED soft opts):** selective shadows, LOD stagger, FX/impostor pools, frustum hide, throttled minimap/PERF — **measured NO FPS gain** (~25 FPS, Calls still **600–1018**). Root remaining cost: **main-pass multi-mesh procedural units** (~12–18 meshes × ~50–70 units).

**Goals:** Material FPS + Calls improvement while PRESERVING density ~48–74, tank hull+turret+cannon through useful LOD, distinct artillery, helis+jets+tracers+explosions, faction colors, minimap, frontline, price territory, semantic LOD, and v9.4.3–5 lifecycle/PERF snapshot.

**Targets:** normal **50–60 FPS** if realistic; heavy **>45**; minimum = clear measurable jump from ~25. Cut Calls well below the 600–940 band.

---

## Why v9.4.5 did not move the needle

| Soft opt | Intent | Why Calls stayed high |
| --- | --- | --- |
| Selective shadows | Cut shadow-map draws | Main pass still issued **one draw per tiny box/cyl** |
| LOD stagger / frustum hide | CPU + some hide | On-screen armies still ~12–18 meshes each |
| FX / impostor pools | GC + mat churn | Secondary vs unit mesh spam |
| Throttled UI | Overlay noise | Not in `renderer.info.render.calls` hot path |

**Conclusion:** Must reduce **meshes per unit** (merge same-material static parts), not only shadow policy.

---

## v9.4.6 approach (narrow — not a rewrite)

1. **Per-unit / shared baked mesh merge** for static parts sharing a material (`bakeGeo` + `mergeGeos`, r128-safe, no BufferGeometryUtils CDN).
2. Prefer **one mesh per material per semantic LOD group**; keep Separate Groups where animation requires it.
3. **Shared merged geometries** cached once (`_mergedGeoCache`) — no per-unit geo clone of merged results; primitive `GEO.*` still shared.
4. Stronger **LOD3 impostor-only** (`visible` hide of procedural children + ground blob).
5. **LOW** still `shadowMap.enabled = false` (unchanged); HIGH keeps selective casters.
6. Harder simultaneous transparent FX caps after mesh cut.

### Exact mesh strategies

| Unit | Kept separate (anim / LOD / caster) | Merged (same mat) | Approx mesh Δ @ LOD0 |
| --- | --- | --- | --- |
| **Infantry** | Limb roots (upper/lower Groups), torso accent caster, pelvis, chest, head skin, weapon, backpack | lowerLeg+boot → 1; bull helmCap+disc → 1; bear ridge+stub → 1 | ~19 → ~15 |
| **Armor** | Hull / bevel / skirt (diff mats), turret Group, cannon recoil, turret accent caster | **8 wheels → 1**; **2 track rows → 1** | ~17 → ~10 |
| **Artillery** | Base caster, shield, barrel Group + breech | sides L+R → 1; wheels → 1; trails → 1; feet → 1 | ~12 → ~8 |
| **Heli** | Cabin caster, nose, boom, rotor Group, tail rotor | skids → 1; pods → 1 | ~10 → ~8 |
| **Jet** | Fuse caster, nose, fin | wings → 1; engines → 1 | ~8 → ~6 |

**Preserved:** turret yaw, cannon/barrel recoil, infantry walk limbs, heli rotor spin, jet engine pulse (scales merged engine mesh), faction accents, semantic LOD groups, army density, air combat.

**Avoided:** emptying armies, slab tanks, disabling air, Three upgrade, SkeletonUtils / authored kit (v9.5).

---

## Expected Calls impact

- Main pass: roughly **−4 to −8 draws/unit** on screen → on ~50–70 units often **−200 to −500** calls vs multi-mesh baseline (before counting LOD hides).
- Combined with v9.4.5 selective shadows + frustum/LOD3 hide: aim to leave the **600–940** band (toward ~**250–450** in typical HIGH camera, load-dependent).
- FPS: material recovery from ~25 toward **50–60** normal / **>45** heavy if GPU was draw-bound; if CPU-bound elsewhere, still expect a **clear** jump.

Profile with `renderer.info` / PERF overlay (`?perf=1`, fixed Graphics **HIGH**).

---

## BUILD

`v9.4.10` · cache `?v=20260913v9410` · PERF label `v9.4.10` (AUTO max HIGH).

---

## What we did **not** do

- Cut army density / air wings  
- Flatten tanks to slabs  
- Disable air combat  
- Change market / Battle Strength / data-truth  
- Start v9.5 authored unit kit / SkeletonUtils / KTX2  
- Merge to `main` / deploy Pages / merge PR #4  

---

## Before / after measurement notes (parent browser A/B)

Compare tip **v9.4.6** vs:

- `654c5d4` — v9.4.5 soft opts (failed FPS)  
- `26e1e341` — v9.4.4 visual baseline (~25 FPS / Calls 600–940)

Use `?perf=1` (or Shift+P). Prefer fixed Graphics **HIGH** (not AUTO).

| Metric | v9.4.4 / v9.4.5 | v9.4.6 expect |
| --- | --- | --- |
| FPS / frame ms | ~25 / ~40ms | major ↑ (aim 50–60 normal; >45 heavy) |
| Calls | ~600–940 (v9.4.5 still 600–1018) | clear cut below that band |
| Tris | ~36–44k | similar (merge ≠ decimate) |
| Units | ~48–74 | **unchanged density** |
| Visual | tank hull+turret+cannon; air OK | same silhouettes; wheels no longer spin independently (merged) |

Regression checks: tanks read as tanks at LOD2; heli/jet still fire; no empty battlefield; PERF shows **v9.4.6**.
