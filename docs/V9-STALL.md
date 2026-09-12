# LUNC Battlefield v9.4.8 — Find the non-JS WebGL/GPU render stall

**Branch:** `feat/v9-next-gen-renderer` only · **Not merged** · **Not deployed**  
**BUILD:** `v9.4.8` · cache `?v=20260912v948` · Three **r128**  
**Parent tip before this:** `e067998` (v9.4.7 PERF EMA clamp remove)

## Proven context (do not re-litigate)

| Signal | Value |
| --- | --- |
| RAF / render / sim / PERF | ≈ **5.4/s** |
| Wall frame | ≈ **216.7 ms** |
| Timed JS (cadence ranked) | ≈ **4 ms** total |
| Calls (post-clamp truth) | **~65** |
| Tris | ~**45.6k** |
| Units | **48** |
| Empty RAF probe (`tools/raf-probe.html`) | **~60** |
| Earlier PERF “25” | **measurement bug** (sim-capped dt → fixed in v9.4.7) |

**Conclusion:** Blind draw-call reduction is the wrong next step. ~**210 ms/frame** is **outside** timed JS. This milestone instruments where that time goes (GPU vs sync vs compositor vs resolution/AA/shadows) and only applies a fix if proven.

---

## Deliverables shipped

1. **Calls 65 confirmation** — PERF + STALL panels expose `renderer.info.render` (**calls / tris / points / lines**), **programs**, **geometries**, **textures**, **autoReset**, plus scene **visible mesh / Object3D** and near/far mesh counts.
2. **GPU timer queries** — `EXT_disjoint_timer_query_webgl2` or `EXT_disjoint_timer_query`, async/non-blocking; report **GPU ms vs CPU submit vs wall**.
3. **WebGL info dump** — version, vendor/renderer (unmasked), max tex, AA/depth/stencil/alpha/preserveDrawingBuffer/powerPreference, extensions (`console.info` once).
4. **`tools/webgl-baseline.html`** — tiers **A–E** on same Three r128 CDN.
5. **Diagnostic query flags** (non-destructive) — see runbook below.
6. **This audit** — hot paths for forced sync / uploads / multipass.
7. **Fix policy** — apply **only** a proven fix; otherwise stop with proof (this build: **diagnostics only**, no speculative render cut).

---

## Code audit (forced sync / uploads / multipass)

| API / pattern | Where | Per-frame? | Stall risk |
| --- | --- | --- | --- |
| `renderer.info.autoReset` | Three r128 default **true**; reset at **start** of `render()` | N/A | Reading **after** `render()` is correct. Reading before → 0 or stale. |
| `shadowMap.needsUpdate = true` | `quality.apply()` only (`js/quality.js`) | **No** (apply / AUTO / resize / mode change) | Not a per-frame upload. Confirmed. |
| `CanvasTexture` + `needsUpdate` | `price-territory.js` `makeLabelSprite` | **Once at create** (range rebuild), not every RAF | Low. Not a continuous canvas→GPU upload. |
| `materials.needsUpdate = true` | `materials.applyQuality` | Quality change only | Can cause **program/material churn** on AUTO level change — not every frame. |
| `instanceMatrix.needsUpdate` | env/structures instancing | When instance data changes | Normal; cheap vs 200 ms. |
| `readPixels` / `toDataURL` / `getImageData` | **Not found** in gameplay JS | — | Eliminated as primary suspect. |
| `gl.finish` / `gl.flush` | **Not found** | — | Eliminated. |
| `EffectComposer` / multipass post | **Not found** | — | Multipass = **shadow map pass(es) + main** only. |
| Minimap `canvas` 2D `draw` | `minimap.js` throttled by `drawHz` | Throttled (not WebGL) | CPU 2D; not in `renderer.render` timer. |
| `antialias: true` | renderer create | Context lifetime | MSAA cost scales with **drawing buffer**; A/B with `?aa=0` + `?canvas=`. |
| `PCFSoftShadowMap` + map **1024–2048** | quality presets HIGH/ULTRA | Shadow pass each frame when enabled | Likely GPU cost; A/B `?shadows=0`, `?lights=`. |

### Calls ~600 (older) vs ~65 (now) — explanation

| Hypothesis | Verdict |
| --- | --- |
| `info.autoReset` mis-timed read | Unlikely for PERF overlay (reads after frames via `tick` → `refreshOverlay` on live `renderer.info` **after** renders). Still exposed now for proof. |
| Shadow passes double-counted oddly | Shadow draws **are** included in `info.render.calls` when enabled — expected. |
| Multi-sample “fake” calls | MSAA does **not** inflate Three's call counter. |
| Real mesh/draw reduction | **Primary:** v9.4.5 selective shadows + frustum hide, then **v9.4.6 mesh merge** cut multi-mesh units. Pre-merge baseline was **600–940** calls @ similar tris; **~65 calls @ ~46k tris** is consistent with merged batches + LOD hide, not a counter bug. |
| Far-camera cull | Visible mesh counts (near/far) in STALL panel prove how many meshes remain. |

**Proof path:** `?stall=1&perf=1` → Calls/Tris/Programs + visMesh near/far. Compare `?shadows=0` (calls should drop by shadow casters’ depth passes).

---

## Parent browser runbook

Deploy preview or local static server. Prefer fixed Graphics **HIGH** unless testing quality.

### 0) Environment sanity

| Step | URL |
| --- | --- |
| Empty RAF | `tools/raf-probe.html` |
| WebGL tiers A–E | `tools/webgl-baseline.html` · `?tier=A\|B\|C\|D\|E` · `?aa=0` · `?size=640x400` |

If baseline **A/B** wall ≈16 ms but battlefield ≈217 ms → cost is **scene content / shadows / resolution**, not “RAF broken”.  
If baseline **A** alone is slow → GPU/compositor/driver/environment.

### 1) Confirm Calls 65 + GPU vs CPU

```
index.html?stall=1&perf=1
```

Read **STALL** (top-left) + **PERF** (bottom-left) + **CADENCE** (bottom-right):

- Calls / Tris / Pts / Lines / Prog / Geo / Tex / autoReset  
- GPU ms (async) · CPU submit ms · wall (from PERF/cadence)  
- visMesh / near / far  

**Interpret:**

| Pattern | Meaning |
| --- | --- |
| CPU submit ~4–10 ms, GPU ~200 ms | **GPU-bound** (fill/shadows/AA) |
| CPU submit ~200 ms, GPU low/n/a | **Sync stall** in `render()` (GPU wait without timer, or driver) |
| Both low, wall still ~200 ms | **Not in render** — compositor, vsync bundle, tab throttle, main-thread outside timed sections |
| `?norender=1` wall → ~16 ms | Stall was inside/around `renderer.render` |
| `?norender=1` still ~200 ms | Stall **outside** WebGL submit (browser/RAF scheduling) |

### 2) Isolation matrix (flags)

| Flag | Effect |
| --- | --- |
| `?stall=1` | GPU timers + WebGL dump + STALL panel (also enables cadence counters) |
| `?diag=1` / `?cadence=1` | Cadence + stall GPU panel |
| `?mat=basic` | Unlit `MeshBasicMaterial` override; geometry unchanged |
| `?tex=0` | Clear maps/envMaps/normal/etc where safe |
| `?freeze=1` | Freeze sim/LOD/FX/minimap updates; **keep rendering** |
| `?norender=1` | RAF loop **without** `renderer.render` |
| `?canvas=1280x800\|960x600\|640x400\|320x200` | Fixed internal buffer (pixel ratio forced 1) |
| `?aa=0` | Create renderer with **antialias:false** |
| `?ui=0` | Hide PERF/DOM overlays/panels |
| `?lights=0\|1\|hemi` | No lights / single light / hemi only |
| Prior cadence | `?shadows=0` `?fx=0` `?air=0` `?dpr=1` `?scene=renderer\|…\|full` |

Suggested order:

1. `?stall=1&norender=1&ui=0`  
2. `?stall=1&freeze=1`  
3. `?stall=1&canvas=320x200&aa=0&shadows=0`  
4. `?stall=1&mat=basic&tex=0`  
5. `?stall=1&lights=hemi` then `lights=0`  
6. Baseline `tools/webgl-baseline.html?tier=E&aa=0`

### 3) What would count as a proven fix

Only if a flag or audit line shows a **specific** forced sync / per-frame upload / misconfig, e.g.:

- Per-frame `CanvasTexture.needsUpdate` / `texImage2D` from 2D canvas  
- Accidental `readPixels` / `finish`  
- `shadowMap.needsUpdate=true` every frame  
- Drawing buffer far larger than intended (DPR×CSS) with MSAA  

**This v9.4.8 commit does not ship a speculative fix** — parent matrix must point at one smoking gun first.

---

## Files

| Path | Role |
| --- | --- |
| `js/stall-diag.js` | Flags, GPU timers, WebGL dump, scene counts, STALL overlay |
| `tools/webgl-baseline.html` | Tiers A–E microbenchmarks |
| `js/battle-engine.js` | Wire freeze/norender/timedRender/aa/canvas |
| `js/quality.js` / `js/cadence-diag.js` | PERF/CADENCE enrichment |
| `docs/V9-STALL.md` | This doc |

## Non-goals

- No merge to `main` / no Pages deploy  
- No v9.5 / authored art / SkeletonUtils  
- Preserve 48 units, tanks, air, frontline, minimap, territory  
- No blind Calls chasing  

