# LUNC Battlefield v9.2 — PBR materials & lighting foundation

**Status:** v9.2 on feature branch `feat/v9-next-gen-renderer` only. **Not merged to main.** Live GitHub Pages remains v8.x until an explicit merge.

**Prerequisite:** v9.1 renderer abstraction (`js/renderer.js`) — WebGL default (Three.js **r128**) unchanged. **No Three.js upgrade in v9.2.**

## Goals

- Shared `MeshStandardMaterial` registry (`LUNCBattle.materials` in `js/materials.js`)
- Reuse presets across **terrain / structures / units / props / faction accents**
- Creation-time color & roughness variation for non-shared instances
- Quality-aware roughness / metalness / emissive clamps + envMap enable stubs
- Improved battle-engine lighting: sun / hemisphere / fill / rim / faction accents
- Tone-mapping **restraint** (ACES kept, exposure ~0.94)
- Hot FX stay **MeshBasic** (`effects.js` untouched for PBR)
- Perf overlay shows material count when practical
- Stubs only for normal / AO / KTX2 / envMap — **no unclear-license assets**

## Non-goals (explicitly deferred)

- Three.js upgrade / WebGPURenderer cutover → later milestone (not v9.3 in this pass)
- glTF pipeline, skeletal animation, GPU particles, terrain mesh redesign
- Shipping compressed textures or third-party texture packs
- Merging to `main`

---

## Architecture

```
index.html
  three r128 CDN (unchanged)
  OrbitControls (r128)
  js/config.js          BUILD v9.2
  js/quality.js         lightingComplexity scales sun/hemi/fill/rim/accents
  js/renderer.js        v9.1 abstraction (WebGL default)
  js/materials.js       ← NEW shared PBR registry
  js/terrain.js         registry presets (ground / patch / road)
  js/environment.js     prop presets; smoke stays MeshBasic
  js/structures.js      structure + faction shared mats; mutable accents
  js/units.js           unit presets + accent cache
  js/effects.js         MeshBasic hot FX (unchanged policy)
  js/battle-engine.js   lighting foundation + mat() → registry
```

### `LUNCBattle.materials` API

| Method | Role |
| --- | --- |
| `init(THREE)` | Bind THREE (r128 global) |
| `get(name)` | Shared named `MeshStandardMaterial` preset |
| `create` / `mat` | Ad-hoc registered standard material (legacy signature) |
| `vary(base, seed)` | Creation-time color/roughness jitter (new instance) |
| `accent` / `factionAccent` | Emissive faction accent mats |
| `basic(params)` | MeshBasic helper (shadows / cheap FX) |
| `applyQuality(tier)` | Retune shared mats for LOW→ULTRA |
| `setEnvMap(tex)` | Optional envMap stub hook |
| `attachNormalMapStub` / `attachAOMapStub` | No-op stubs pending clear-license maps |
| `prepareKTX2Stub()` | Documents KTX2 not wired |
| `getCount()` / `count()` | `{ total, shared, variants, … }` / total |
| `dispose(mat?)` | Dispose one (skips shared) or all registry mats |
| `isShared(mat)` | Callers skip disposing shared presets |

### Preset namespaces

- `terrain.*` — ground (vertexColors), dirtPatch, road, mud, rock
- `structure.*` — dirt/wood/metal/glass/… + bull/bear wall/roof/frame
- `unit.*` — body/cloth/metal/skin/track
- `prop.*` — rocks, foliage, wood, scorched, …
- Dynamic `accent.*` / `faction.*` keys for emissive trims

---

## Lighting foundation

| Light | Role | Notes |
| --- | --- | --- |
| Hemisphere | Soft sky/ground bounce | Quality scales intensity |
| Directional sun | Key + shadows | Slightly cooler/warmer balance; lower intensity vs v8 for PBR |
| Directional fill | Cool opposite fill | Dimmed on LOW |
| Directional rim | Subtle edge separation | Off on LOW |
| Point accents | Bull / bear bases | Soft intensity; quality scales from `userData.baseIntensity` |

Tone mapping: `ACESFilmicToneMapping` with **exposure 0.94** (was ~1.02) so MeshStandard albedo stays readable without washout.

---

## Quality overlay

Shift+P / `?perf=1` shows **Mats** total (+ shared when provided) alongside FPS / renderer backend lines from v9.1.

---

## Cache bust

Asset query: `?v=20260912v92`

---

## Verification checklist

- [ ] `node --check` on changed JS
- [ ] Default boot: WebGL backend, battlefield loads
- [ ] Materials reused (overlay Mats count stable; shared > 0)
- [ ] Effects/projectiles still MeshBasic / bright FX
- [ ] Quality LOW→ULTRA adjusts lighting + material clamps
- [ ] No Three CDN change; `THREE.REVISION` still 128
- [ ] Branch **not** merged to `main`

## Milestone note

v9.2 here is **PBR materials + lighting foundation**. A future Three upgrade / WebGPU hardening remains **later** and must not break the WebGL default.
