# LUNC Battlefield v9.4.9 — Authored armor + artillery kit

**Status:** `feat/v9-next-gen-renderer` only. **Not merged to main.** No Pages deploy.

**Goal:** Replace blocky procedural tank (type 1) and artillery (type 2) with an original low-poly RTS vehicle kit. Silhouette > proportion > faction > detail. No photorealism. No copied Newhedge/game assets.

**Preserved:** v9.4.6 `_mergedGeoCache` / `bakeGeo` / `mergeGeos`; semantic LOD groups; turret yaw + cannon/barrel recoil; helicopters/jets untouched; terrain/frontline/market logic untouched. **No** SkeletonUtils, AnimationMixer, bones, or skinned meshes.

---

## Orientation

Local **+Z = forward** (gun / muzzle). Hull length along Z, width along X, tracks at ±X. Unit `rotation.y` facing still maps local +Z toward the frontline.

World size stays near prior tank footprint (~1.8–2.0 long × ~1.3 wide) so formation spacing and muzzle offsets remain sane.

---

## Main Battle Tank (type 1)

| Part | Notes |
| --- | --- |
| Lower hull | Elongated box ~1.28 × 0.5 × 1.85 |
| Glacis | Front wedge (rotated box) |
| Upper deck + engine bump | Rear engine deck reads as MBT |
| Side skirts | Thin boxes along track sides |
| Track slabs | Continuous side volumes in **core** (survive LOD2) |
| Road wheels | 3×/side cylinders — **detail** (LOD0) |
| Turret | Wider-than-tall box ~1.0 × 0.36 × 0.92, slightly forward of mid |
| Cannon | Cylinder length **1.55**, recoil mesh `parts.cannon` |
| LOD0 extras | Hatch, coax MG stub, antenna, turret cap |

**Faction:** same kit; `accentMat(color)` + bull/bear body wash. Shared mats from `js/materials.js`.

### Tank LOD composition

| LOD | Visible | Approx tris (indexed) |
| --- | --- | --- |
| **0** | Full kit: hull+glacis+skirts+engine+track slabs+wheels+turret+mantlet+cannon+hatch+coax+antenna | **~368** |
| **1** | Hull+track slabs+turret+cannon (drop wheels/hatch/coax/antenna/cap) | **~168** |
| **2** | Same core silhouette as LOD1 (slabs stay; never lose turret/cannon) | **~168** |
| **3** | Impostor stub: low hull + turret mass + short gun cue (not a building slab) | **~44** |

---

## Artillery (type 2) — SPG / field hybrid

Distinct from MBT on purpose:

- Longer thinner chassis (~2.05 Z) + deck
- **Open mount + gun shield** (no closed MBT turret)
- Barrel **2.5** long (~1.6× tank cannon), elevated rest (`baseElev ≈ -0.32`)
- Rear trail arms + stabilizer legs + feet
- Scale `1.08`

### Artillery LOD strategy

| LOD | Visible | Approx tris |
| --- | --- | --- |
| **0** | Chassis+deck+mount/shield+trails+stabilizers+wheels+feet+long barrel+breech | **~296** |
| **1** | Core chassis+trails+shield+long barrel (drop wheels/feet/breech detail) | **~148** |
| **2** | Same core — **long barrel kept**; open mount still reads vs tank | **~148** |
| **3** | Stub: long thin carriage + longer elevated barrel (distinct from tank stub) | **~32** |

---

## Materials / draw cost

- Reuses `unit.bodyBull/Bear`, `unit.dark`, `unit.metal`, `unit.metalDark`, `unit.track`, faction `accent()`.
- Merge-by-material: hull accent, hull dark, tracks, wheels, turret accent, arty chassis, mount/shield, trails, wheels, feet.
- Anim-critical kept separate: **turret Group**, **cannon mesh**, **barrel Group**.
- Measured mesh/object count @ LOD0: tank **12** meshes / **7** mats; artillery **8** meshes / **6** mats (incl. ground shadow disc).

---

## Verify

```bash
node --check js/units.js js/lod.js js/config.js js/quality.js
# local: python3 -m http.server 8080 → http://127.0.0.1:8080/?perf=1
```

**Next build (not this milestone):** jet attack choreography + impact synchronization.
