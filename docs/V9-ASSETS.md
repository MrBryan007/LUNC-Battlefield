# LUNC Battlefield v9.3 — Professional glTF/GLB asset pipeline

**Status:** v9.3 on `feat/v9-next-gen-renderer` only. **Not merged to main.** Live Pages remains v8.x.

**Prerequisite:** v9.1 renderer abstraction + v9.2 PBR materials/lighting. Three.js stays **r128**. **No Three upgrade in v9.3.**

## Goals

- Registry-driven glTF/GLB loading with cache, clone, status, dispose
- Progressive load: procedural armies first; optional background preload
- Modes: `?assets=procedural` | `?assets=gltf` | default **AUTO**
- Missing/failed assets → **procedural SAFE FALLBACK forever** (never black-screen, never remove armies)
- Quality-aware shadows on instantiate; preserve authored PBR; optional faction emissive tint
- PERF overlay asset diagnostics (separate from feeds)
- Original tiny smoke-test GLBs only — **no third-party RTS assets**

## Non-goals

- Three.js upgrade / WebGPU cutover
- SkeletonUtils / skinned animation retarget (stub note only)
- KTX2 / Draco / Meshopt wiring (stubs documented)
- Live mid-battle hot-swap of meshes (skipped — unsafe without anim retarget)
- Shipping production art packs or unclear-license downloads
- Merging to `main` / starting v9.4

---

## Architecture

```
index.html
  three r128 CDN
  OrbitControls (r128 examples)
  GLTFLoader (r128 examples CDN — same pattern as OrbitControls)
  js/config.js           BUILD v9.3
  js/quality.js          PERF ASSETS section
  js/renderer.js         v9.1 (unchanged policy)
  js/materials.js        v9.2 PBR (preserved)
  js/assets.js           ← registry
  js/asset-loader.js     ← LUNCBattle.assets pipeline
  js/units.js            createUnit → instantiate || procedural
  js/structures.js       HQ → instantiate || procedural
  js/battle-engine.js    init assets early; background preload
```

### Directories

```
assets/models/{units,vehicles,artillery,structures,props}/
assets/textures/          (placeholder)
assets/licenses/ASSETS.md
tools/make-tiny-glbs.js   original GLB writer
```

### `LUNCBattle.assets` API

| Method | Role |
| --- | --- |
| `init(THREE)` | Bind THREE, resolve `?assets=` mode, create GLTFLoader |
| `loadAsset(id)` | Promise load → cache |
| `preload(ids?)` | Background multi-load (non-blocking) |
| `get(id)` | Cached template scene or null |
| `instantiate(id, opts?)` | Clone + normalize + shadows + optional accent; null → caller procedural |
| `getStatus(id)` | `{ status, error, tris, entry }` |
| `getRegistry()` | Registry map |
| `dispose(id?)` | Safe dispose (skips shared materials) |
| `getStats()` / `getEffectiveAssetMode()` | PERF diagnostics |
| `shouldUseGltf(id)` | Mode + readiness + quality gates |
| `tryHotSwap()` | Returns skipped (documented) |
| `prepareKTX2Stub` / `prepareDracoStub` / `prepareMeshoptStub` | Not wired |

### Registry fields (`js/assets.js`)

`id`, `type`, `path`, `faction`, `category`, `lod`, `lodPaths`, `animated`, `fallback`, `license`, `source`, `smokeTest`, `scale`, `rotation`, `positionOffset`, `groundOffset`

Conceptual IDs: `unit.{bull\|bear}.{infantry\|armor\|artillery}`, `structure.{bull\|bear}.hq`, `prop.{crate\|barrel\|rock}`

---

## Modes

| Query | Behavior |
| --- | --- |
| (default) AUTO | Load/cache GLBs in background. **Smoke-test placeholders are not used as visuals** — articulated procedural remains default until production-ready assets ship (`smokeTest: false`). |
| `?assets=gltf` | Prefer GLB when ready. After preload, one `rebuildUnits()` exercises instantiate. Still falls back if load fails. |
| `?assets=procedural` | Never load/instantiate GLB. |

LOW / MEDIUM / mobile: prefer procedural for units/structures (LOD hooks; no forced LOD0 giants).

---

## GLTFLoader strategy

- Same CDN pattern as OrbitControls: `three@0.128.0/examples/js/loaders/GLTFLoader.js`
- Attaches `THREE.GLTFLoader` on the existing r128 global
- If loader missing → procedural only (warn once)
- **Do not upgrade Three** for newer loaders — stop and document if ever required

Clone: `Object3D.clone(true)`. Skinned meshes need `SkeletonUtils.clone` later (note on `userData`).

---

## PBR / shadows

- Preserve glTF `MeshStandardMaterial` / metallic-roughness factors
- Optional soft emissive faction tint only (does not flatten authored PBR)
- Shadows by quality: LOW minimal (1 mesh), MEDIUM important (≤2), HIGH/ULTRA richer (≤8) — not every child blindly

---

## Progressive + fallback

1. First paint: procedural units/structures (always)
2. `setTimeout(0)` preload tiny set
3. Hot-swap skipped; `?assets=gltf` may rebuild army once after preload
4. Empty path / 404 / parse error → `failed` status + procedural forever
5. Demo id `unit.bull.missing_demo` has empty path to prove failure path

---

## Newhedge comparison (honest)

| Area | Pipeline potential (v9.3) | Still blocks beating Newhedge |
| --- | --- | --- |
| Asset ingestion | Real GLTFLoader + registry + cache + modes | Smoke boxes ≠ authored hero units |
| Materials | v9.2 PBR + preserve glTF mats | No production textures / atlases / KTX2 |
| Animation | Procedural articulated anims remain | No skeletal clips / retarget / SkeletonUtils |
| Art direction | Original procedural identity | No unique high-detail mesh library yet |
| Polish | Quality shadows, PERF asset stats | No cinematic FOW, advanced post, GPU particles |
| Content legal | Clear original-only policy | Cannot (and will not) copy competitor packs |

**Bottom line:** v9.3 unlocks a professional path to drop-in original GLBs without risking the live battlefield. It does **not** yet visually surpass Newhedge — that requires original production art, animation, and polish milestones after this pipeline.

---

## Smoke notes (for parent / computerUse)

- `?perf=1` → ASSETS section: mode / loaded / failed / pending / tris
- `?assets=procedural` → loaded stays 0 / skipped; armies procedural
- `?assets=gltf` → after feed line “Assets…”, army may rebuild with box GLBs
- `?assets=auto` (default) → preload may load templates; visuals stay procedural (smokeTest)
- Footer: `Prices: DefiLlama → CoinGecko → Binance Vision` (dynamic from config)
- Missing demo failure increments failed count

## Known limits

- Tiny ~1.2 KB box GLBs are pipeline placeholders, not production art
- No Draco/KTX2/Meshopt
- No SkeletonUtils
- No mid-battle hot-swap
- HQ GLB only appears if ready before `createFactionBase` (or future rebuild) — units proven via post-preload rebuild in GLTF mode
