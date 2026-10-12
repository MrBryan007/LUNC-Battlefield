# LUNC Battlefield — Asset licenses (v11.0)

Every third-party asset that ships in this repo is listed here. Nothing comes from a commercial game, from Retro Rewind, or from any source with an unclear license. Older original assets are still documented in `assets/licenses/ASSETS.md`.

## v11 third-party 3D models (all CC0 1.0, public domain)

| File | Model | Author | License | Source URL | Modifications |
| --- | --- | --- | --- | --- | --- |
| `assets/models/v11/soldier.glb` | "SWAT" (rigged; Idle_Gun / Walk / Run / Idle_Gun_Shoot clips used) | Quaternius | CC0 1.0 | https://poly.pizza/m/Btfn3G5Xv4 | Simplified with gltfpack (`-si 0.3 -sa -noq`, ~7.7k → 2.6k tris). Recoloured at runtime (olive fatigues + faction tint) |
| `assets/models/v11/tank_a.glb` | "Tank" (bull MBT) | Quaternius | CC0 1.0 | https://poly.pizza/m/FA5daiyZQq | gltfpack `-si 0.35 -sa -noq` (~7.2k → 2.4k tris); runtime camo recolour |
| `assets/models/v11/tank_b.glb` | "Tank" (bear MBT) | Quaternius | CC0 1.0 | https://poly.pizza/m/cW3zvvkMOM | gltfpack `-si 0.35 -sa -noq` (~6.5k → 2.3k tris); runtime camo recolour |
| `assets/models/v11/truck_armored.glb` | "Truck Armored" (used as IFV / APC) | Quaternius | CC0 1.0 | https://poly.pizza/m/VvX8nmoCN5 | gltfpack `-si 0.25 -sa -noq` (~16k → 4k tris); texture re-graded to muted military paint at runtime |
| `assets/models/v11/pickup_armored.glb` | "Pickup Truck Armored" (MG technical escort) | Quaternius | CC0 1.0 | https://poly.pizza/m/RUwMItmU4B | gltfpack `-si 0.25 -sa -noq` (~13k → 3.2k tris); texture re-graded at runtime |

Poly Pizza lists each of these as **CC0 (public domain)**: commercial use and modification are allowed, and no credit is required. We credit Quaternius (https://quaternius.com) anyway.

## v11 original (project-authored, generated at runtime)

| Item | Where | License |
| --- | --- | --- |
| Carbine rifle mesh attached to every soldier pose | `js/v11-units.js` `rifleGeo()` | Project original |
| Mortar tube, baseplate, and bipod | `js/v11-units.js` `buildMortarGeo()` | Project original |
| Vehicle dust puffs (reuses `proctex.smokePuff`) | `js/v11-units.js` | Project original |
| Colour grade tweak | `js/postfx.js` | Project original |

## Rules for future assets

Use only CC0, CC-BY (add attribution here), or project-original assets. Record the file, author, license, URL, and modifications for each one. Never use ripped commercial-game assets, assets from Retro Rewind, or "free download" sites with no clear license.

## v12 starter skins (all CC0 1.0 per their Poly Pizza pages, checked 2026-10-12)

| File | Model | Author | License | Source URL | Modifications |
| --- | --- | --- | --- | --- | --- |
| `assets/models/v12/helicopter.glb` | "Helicopter" | kazuma | CC0 1.0 | https://poly.pizza/m/EQJ2MECUbx | none (1.1k tris); runtime faction tint; procedural rotor disc kept on top |
| `assets/models/v12/radar.glb` | "Roof Radar" | Quaternius | CC0 1.0 | https://poly.pizza/m/V7XQDxF8JC | none (~1k tris) |
| `assets/models/v12/bunker_sandbag.glb` | "Sack Trench Small" | Quaternius | CC0 1.0 | https://poly.pizza/m/iHyRewQQcN | gltfpack `-si 0.35 -noq` (3.6k → ~1.3k tris) |
| `assets/models/v12/watchtower.glb` | "Small Watch Tower" | Quaternius | CC0 1.0 | https://poly.pizza/m/CygapExMf5 | none (~0.6k tris) |
Re-fetch with `tools/fetch-v12-assets.sh`.
