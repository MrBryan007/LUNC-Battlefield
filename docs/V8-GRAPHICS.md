# LUNC Battlefield v8 — Graphics Overhaul

## Status

**v8.1 done** — richer RTS terrain and battlefield environment.

All meshes are **original procedural Three.js r128** geometry. No third-party game assets, no copyrighted packs, no GridHelper / neon grids / blocky Tetris look.

## Modules

| File | Role |
| --- | --- |
| `js/terrain.js` | Heightfield (multi-octave hills, trenches/berms, road, craters) + vertex-colored ground |
| `js/environment.js` | Rocks, trees, ruins, barricades, props, scorched discs, distant smoke |
| `js/battle-engine.js` | Wires createTerrain / createEnvironment; keeps market / Binance / strength paths |

## License / assets

- Procedural geometry and materials authored for this project
- No external copyrighted game assets
- Three.js r128 via CDN (MIT)

## Roadmap

| Stage | Focus |
| --- | --- |
| **8.1** | Terrain + environment (this release) |
| 8.2 | Unit visual polish / formations |
| 8.3 | Base architecture refresh |
| 8.4 | VFX / strikes / atmosphere |
| 8.5 | Frontline / capture markers |
| 8.6 | Lighting / post / camera |
| 8.7 | Mobile perf pass |
| 8.8 | Final art QA + docs |

Market data, Binance depth, Battle Strength, liquidations, and `?api=` bridge must remain intact across all stages.
