# LUNC Battlefield v8 — Graphics Overhaul

## Status

**v8.2 done** — articulated RTS units and animation states (infantry / armor / artillery).

**v8.1 done** — richer RTS terrain and battlefield environment.

All meshes are **original procedural Three.js r128** geometry. No third-party game assets, no copyrighted packs, no GridHelper / neon grids / blocky Tetris look.

## Modules

| File | Role |
| --- | --- |
| `js/terrain.js` | Heightfield (multi-octave hills, trenches/berms, road, craters) + vertex-colored ground |
| `js/environment.js` | Rocks, trees, ruins, barricades, props, scorched discs, distant smoke |
| `js/animations.js` | Animation state enums + `tickInfantry` / `tickArmor` / `tickArtillery` / `pickState` |
| `js/units.js` | Articulated unit builders, shared GEO/materials, formations, `tickUnit` / `setAnimState` |
| `js/battle-engine.js` | Wires terrain / environment / units; keeps market / Binance / strength paths |

## v8.2 animation states

### Infantry (`type === 0`)
`IDLE` · `WALK` · `RUN` · `AIM` · `FIRE` · `RELOAD` · `HIT`

Opposite arm/leg walk cycle; face ±x toward frontline; feet on `terrainHeight`.

### Armor (`type === 1`)
`MOVE` · `AIM_TURRET` · `FIRE` · `IDLE_SCAN`

Track scroll via `trackPhase`; turret scans / aims toward frontline; cannon recoil on fire.

### Artillery (`type === 2`)
`AIM` · `FIRE` · `RELOAD` · `IDLE`

Barrel elevates toward target; longer reload; holds rear ranks.

## Reuse approach

- Materials created once per `createUnitsApi()` (body / accent / dark / metal / cloth)
- Shared `GEO` cache (cylinder segments 5–8)
- Articulated infantry uses Group hierarchies with shared BufferGeometry (not InstancedMesh — limb animation)

## License / assets

- Procedural geometry and materials authored for this project
- No external copyrighted game assets
- Three.js r128 via CDN (MIT)

## Roadmap

| Stage | Focus |
| --- | --- |
| **8.1** | Terrain + environment |
| **8.2** | Unit visual polish / formations / animations (this release) |
| 8.3 | Base architecture refresh |
| 8.4 | VFX / strikes / atmosphere |
| 8.5 | Frontline / capture markers |
| 8.6 | Lighting / post / camera |
| 8.7 | Mobile perf pass |
| 8.8 | Final art QA + docs |

Market data, Binance depth, Battle Strength, liquidations, and `?api=` bridge must remain intact across all stages.
