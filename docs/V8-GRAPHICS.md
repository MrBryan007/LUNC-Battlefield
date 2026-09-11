# LUNC Battlefield v8 — Graphics Overhaul

## Status

**v8.3 done** — faction bases and RTS structures (Bull industrial vs Bear fortified).

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
| `js/structures.js` | Faction bases: HQ, barracks, depot/hangar, arty, supply, radar, comms, towers, bunkers, walls |
| `js/battle-engine.js` | Wires terrain / environment / units / structures; keeps market / Binance / strength paths |

## v8.3 bases

`LUNCBattle.structures.createApi({ THREE, scene, terrainHeight, mat, mobile })` returns
`{ createFactionBase, updateStructures, setDamageState, getCommandCenter, setAccentColor, dispose, version:'v8.3' }`.

- **Bull (west, x≈−48)** — organized / industrial: octagonal command tower + annex, pitched-roof barracks, garage+ramp depot, ring berm arty pad, warehouse supply, lattice radar + spinning dish, comms hut + drums, cylindrical towers, half-buried bunkers, concrete perimeter + gate toward the frontline.
- **Bear (east, x≈+48)** — heavier / fortified, **different meshes** (not recolors): wide bunker-HQ with glacis + crenellations, buttressed barracks with gun slits, open motor-pool hangar, deeper U-shaped arty berms, earth-covered storehouse, squat panel radar, blockier comms, thick square towers, heavier bunkers, thicker merlon walls.
- Accent color only on banners, lamps, and thin trim. Token switch updates Bull accents via `setAccentColor`.
- Terrain: `placeOnTerrain` / `placeBuilding` using `terrainHeight`; dirt pads under large buildings; wall segments sample height along z. No floating / buried keeps.
- Damage hooks (no full gameplay): each major building has `kind`, `side`, `damageState:'HEALTHY'`, `smokePoints`, `firePoints`, `debrisSpawns`, optional damaged/critical mesh refs. `setDamageState` toggles overlays.
- Ambient: radar spin, banner flutter, restrained lamp blink/pulse.
- Perf: shared GEO/MAT caches; InstancedMesh for walls / sandbags / fences / crates / drums / hedgehogs. Mobile drops prop counts, keeps HQ identity.

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

- Materials created once per `createUnitsApi()` / `createApi()` (body / accent / dark / metal / cloth / faction stone)
- Shared `GEO` cache (cylinder segments 5–8; unit box scaled per mesh)
- Articulated infantry uses Group hierarchies with shared BufferGeometry (not InstancedMesh — limb animation)
- Structures instance repeated props (walls, sandbags, fences, crates, drums, hedgehogs)

## Known follow-ups (from v8.2)

1. rootBob one-frame lag — **fixed in v8.3** (`moveArmy` now `tickUnit` then `y = terrainHeight + rootBob`)
2. HIT anim not combat-driven yet
3. draw-call optimization deferred to v8.8

## License / assets

- Procedural geometry and materials authored for this project
- No external copyrighted game assets
- Three.js r128 via CDN (MIT)

## Roadmap

| Stage | Focus |
| --- | --- |
| **8.1** | Terrain + environment |
| **8.2** | Unit visual polish / formations / animations |
| **8.3** | Base architecture refresh (this release) |
| 8.4 | VFX / strikes / atmosphere |
| 8.5 | Frontline / capture markers |
| 8.6 | Lighting / post / camera |
| 8.7 | Mobile perf pass |
| 8.8 | Final art QA + docs |

Market data, Binance depth, Battle Strength, liquidations, and `?api=` bridge must remain intact across all stages.
