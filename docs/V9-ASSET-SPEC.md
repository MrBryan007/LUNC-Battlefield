# LUNC Battlefield — Production asset specification (v9.4)

**Spec only** — no animation implementation in v9.4. Three.js **r128**. Original art only; no Newhedge/StarCraft/AoE/C&C/Warcraft copies.

## Coordinate system

| Axis | Meaning |
| --- | --- |
| +X | East (bear staging tends +X) |
| +Y | Up |
| +Z | South / depth on map |

Right-handed. Ground plane is XZ. Gravity along −Y.

## Scale

| Asset class | Approx height (world units) | Notes |
| --- | --- | --- |
| Infantry | ~1.6–1.9 | Feet at y=0 |
| Armor | ~1.8–2.4 hull | Tracks on ground |
| Artillery | ~2.0–2.8 | Barrel pivot ~1.1 |
| HQ / command | ~4–7 | Compound pad below |
| Props (crate/barrel/rock) | 0.4–1.5 | |

Registry `scale` / `groundOffset` / `positionOffset` normalize imports.

## Forward

- Unit forward = **local +Z** after spawn facing correction
- Bull (side −1) faces +X (rotation.y ≈ +π/2)
- Bear (side +1) faces −X (rotation.y ≈ −π/2)
- Export GLBs with model forward +Z; registry `rotation` fixes exceptions

## Ground origin & pivot

- Pivot at **ground contact** under unit center (y=0 = feet / tracks)
- Do not bury mesh below ground; use `groundOffset` if authoring origin differs
- HQ pivot at building footprint center on pad

## Naming

```
unit.{faction}.{category}           e.g. unit.bull.infantry
structure.{faction}.{category}      e.g. structure.bear.hq
prop.{name}                         e.g. prop.crate

Files:
assets/models/units/unit_bull_infantry.glb
assets/models/units/unit_bull_infantry_lod1.glb
assets/models/units/unit_bull_infantry_lod2.glb
```

Registry `lodPaths`: `{ lod0, lod1, lod2, lod3 }` (lod3 often null → impostor).

## Faction accent nodes

- Name nodes `Accent` / `FactionAccent` / `EmissiveAccent` for soft emissive tint
- Pipeline may nudge emissive toward bull/bear color without flattening authored PBR
- Keep metallic-roughness maps intact

## Animation clip names (for v9.5+)

Exact names expected by future mixer wiring:

| Clip | Use |
| --- | --- |
| `Idle` | Default |
| `Walk` | Slow move |
| `Run` | Fast / urgent momentum |
| `Aim` | Pre-fire pose |
| `Fire` | Attack burst |
| `Reload` | Post-fire |
| `Hit` | Damage react |
| `Death` | Optional; prefer despawn FX |

Loop: Idle/Walk/Run. One-shot: Aim/Fire/Reload/Hit/Death.

## Material / LOD naming

- Materials: `MatBody`, `MatTrim`, `MatAccent`, `MatGlass` (optional)
- LOD meshes: `LOD0`, `LOD1`, `LOD2` as root children **or** separate files via `lodPaths`
- LOD3: impostor billboard / baked sprite (architecture stub in v9.4)

## License

Clear original or explicitly cleared licenses only. Document in `assets/licenses/ASSETS.md`. Smoke-test boxes are original pipeline placeholders — **not** final art.
