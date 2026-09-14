# v9.4.13 — Terrain / frontline depth + cluster formations

**Branch only:** `feat/v9-next-gen-renderer`. **Not merged to main.** Production Pages stay on v8.8.

Goal: contested war ground, not a chessboard. Market/frontline math is unchanged.

## Formations

Ground units spawn in **deterministic clusters** (index + type + side only — no per-frame jitter).

| Class | Cluster | Depth behind live frontline | Notes |
| --- | --- | --- | --- |
| Infantry | 4-man wedge / fireteam | ~6–9 | Closest to contested strip |
| Armor | staggered pair / section | ~12–16 | Supports through infantry gaps |
| Artillery | 2-gun battery | ~20–24 | Rear |

`userData.home.depth` / `home.yaw` / `home.cluster` are assigned at spawn. `moveArmy` tracks `targetX + side * depth` so layout stays clustered as the price frontline moves.

Old behavior removed: `cols = 8/5` spreadsheet rows, tiny 4cm jitter, extra depth from `index/cols`.

## Frontline / no-man's-land

`getFrontlineX()` remains authoritative. Visuals decorate it:

- Broken berms and sandbag clusters (not a fence every 4m)
- Sparse contested flags
- Scorch craters + wrecks seated on terrain as the strip translates
- Residual smoke wisps

World-space terrain also has a **narrow** worn track (was a 12.5-unit bowling-alley overlay) plus small static bowls near origin. Frontline **props** follow price; the ground mesh does not move.

## Terrain

- Flatten at |x|<8 reduced (0.84 → 0.55) so gentle undulation remains
- Trench/berm ridges kept
- Extra small craters allowed near center
- Shared-material dirt patches in the contested strip
- Env `blockedSpot` |x|<2.4 (was 5) so some rocks/rubble can sit near the strip

Units still snap Y to `terrainHeight` — no physics engine.

## Non-goals

Jet `runId` machine, armor kit, FX hierarchy, AUTO≤HIGH, army density, merge/deploy.
