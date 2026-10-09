# LUNC Battlefield — Asset licenses (v9.3)

## Summary

**All shipped 3D models in this repository are original procedural geometry** authored for LUNC Battlefield (tiny box meshes written by `tools/make-tiny-glbs.js`).

- **No third-party game assets** (no Newhedge, StarCraft, Age of Empires, Command & Conquer, Warcraft, or any commercial RTS packs).
- **No unclear-license web models** downloaded into this tree.
- Procedural unit / structure / terrain / environment builders in `js/` remain the **SAFE FALLBACK forever**.

## Files present (original)

| Path | Source | License |
| --- | --- | --- |
| `assets/models/units/*.glb` | Original tiny box GLB (smoke test) | Project original — MrBryan007 / LUNC Battlefield |
| `assets/models/vehicles/*.glb` | Original tiny box GLB (smoke test) | Project original |
| `assets/models/artillery/*.glb` | Original tiny box GLB (smoke test) | Project original |
| `assets/models/structures/*.glb` | Original tiny box GLB (smoke test) | Project original |
| `assets/models/props/*.glb` | Original tiny box GLB (smoke test) | Project original |
| `assets/textures/` | Empty (placeholder) | N/A |
| `tools/make-tiny-glbs.js` | Original GLB writer | Project original |

These GLBs are **pipeline placeholders** (~1.2 KB each), not production art. Replace only with clear-license or original authored content.

## Third-party models

**None yet.**

When adding future assets, record: filename, author, license URL, and whether commercial use / modification is allowed. Reject anything that copies another RTS title’s meshes, textures, or UI.

## Runtime policy

Missing or failed loads → procedural fallback. Never black-screen. Never remove armies because an asset failed.

## v10 additions (all original, generated at runtime — no downloads)

| Item | Source | License |
| --- | --- | --- |
| Terrain detail albedo + normal map, smoke puff, soft glow, blob / strip masks (`js/proctex.js`) | Procedural canvas value-noise, authored for LUNC Battlefield | Project original |
| Sky dome shader, horizon ridges, ground skirt, sky env map (`js/atmosphere.js`) | Procedural | Project original |
| Post-processing shaders — bloom, FXAA-lite, grade (`js/postfx.js`) | Written for this project (standard published techniques: dual-Kawase blur, FXAA-style edge blend) | Project original |
| All sound effects (`js/sfx.js`) | Synthesized live with WebAudio (noise + oscillators) | Project original |
| Fonts | Inter + Rajdhani via Google Fonts (already used since v8) | SIL Open Font License 1.1 |
| Three.js r128 + OrbitControls/GLTFLoader (CDN, unchanged) | three.js authors | MIT |

No textures, models, or audio files were added to the repo.
