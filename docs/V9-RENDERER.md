# LUNC Battlefield v9 — Renderer strategy

**Status:** v9.1 shipped on `feat/v9-next-gen-renderer`; **v9.2** adds PBR materials/lighting (see `docs/V9-GRAPHICS.md`). **Not merged to main.** Live GitHub Pages remains v8.x until an explicit merge.

## Goals (v9.1)

Conservative infrastructure only:

- Abstract renderer creation behind `LUNCBattle.renderer` (`js/renderer.js`).
- Keep the **default path identical to v8.8**: Three.js **r128** + `WebGLRenderer`.
- Allow an **experimental** WebGPU preference (`?renderer=webgpu` / localStorage) that **tries** `THREE.WebGPURenderer` only if it exists on the already-loaded THREE global.
- Never crash: any WebGPU failure falls back to a working `WebGLRenderer`.
- Do **not** load a second Three.js CDN or upgrade the global THREE object in v9.1.

## Non-goals (explicitly deferred)

No PBR materials overhaul, glTF pipeline, KTX2 textures, skeletal animation, GPU particles, terrain redesign, unit/building mesh replacement, or Three.js major upgrade in v9.1.

Those belong to **v9.2+** after the abstraction is proven.

---

## Architecture

```
index.html
  three r128 CDN (unchanged)
  OrbitControls (r128 examples)
  js/config.js          BUILD v9.1
  js/quality.js         AUTO/LOW/MEDIUM/HIGH/ULTRA + dyn-res
  js/renderer.js        ← NEW abstraction
  … modules …
  js/battle-engine.js   uses LUNCBattle.renderer.create(...)
```

### `LUNCBattle.renderer` API

| Method | Role |
| --- | --- |
| `detectWebGPU()` | `{ available, reason?, adapterInfo? }` via `navigator.gpu` / `requestAdapter`; sync cache + async fill |
| `resolvePreference()` | URL `?renderer=webgpu\|webgl` → localStorage `luncBattle.renderer` → default `webgl` |
| `create({ THREE, canvas?, antialias?, powerPreference?, prefer? })` | Returns `{ renderer, backend, webgpuAvailable, fallbackReason, capabilities, dispose }` |
| `getState()` | Overlay snapshot: prefer, WebGPU availability, active backend, fallback reason, Three revision, notes |
| `applyPixelRatio(renderer, dpr)` | Helper used by quality dyn-res |
| `getInfo(renderer)` | `renderer.info` when present |

### Preference resolution

1. Explicit `prefer` argument to `create()`
2. URL query `?renderer=webgpu` or `?renderer=webgl`
3. `localStorage['luncBattle.renderer']`
4. **Default: `webgl`**

Persist preference (optional):

```js
LUNCBattle.renderer.setStoredPreference('webgpu'); // or 'webgl'
```

### Create / fallback flow

```
prefer webgl (default)
  → new THREE.WebGLRenderer(...)   // same as v8.8

prefer webgpu
  → if typeof THREE.WebGPURenderer === 'function'
       try construct → backend 'webgpu'
     else
       fallbackReason = "THREE.WebGPURenderer not present on loaded Three (r128)…"
       → new THREE.WebGLRenderer(...)   // always succeeds
```

**Expected result on current Pages CDN (r128):** `?renderer=webgpu` always falls back to WebGL with a clear `fallbackReason`. Browser may still report `navigator.gpu` available — that is adapter detection, not a working Three WebGPURenderer.

---

## Three.js decision (v9.1)

| Item | Decision |
| --- | --- |
| CDN | Keep `three.js/r128` + OrbitControls `0.128.0` |
| Global upgrade | **No** — do not load a newer Three that would replace `window.THREE` |
| WebGPURenderer | Absent on r128 → experimental path documents fallback |
| Why | Preserve live v8.8 visual/behavior parity; avoid OrbitControls / encoding / shadowMap API drift |

Real WebGPU requires a **future Three upgrade** (likely modern `three` npm/module build with `WebGPURenderer`, possibly WebGPU node materials). That remains **after v9.2** (materials/lighting), behind the same abstraction so battle-engine/quality keep calling `LUNCBattle.renderer.create`.

---

## Quality system (unchanged contract)

v9.1 keeps:

- Modes: **AUTO / LOW / MEDIUM / HIGH / ULTRA**
- Dynamic resolution via `setPixelRatio` (through `applyPixelRatio`)
- Shadow map enable/type/size from presets
- Perf overlay (Shift+P / `?perf=1`) with FPS + feed diagnostics

Overlay additions (v9.1):

- Renderer preference
- WebGPU available: yes / no / unknown
- Active backend
- Fallback reason (when present)

---

## How to enable experimental WebGPU preference

```
# URL (session)
https://…/LUNC-Battlefield/?renderer=webgpu
https://…/LUNC-Battlefield/?renderer=webgpu&perf=1

# Or localStorage
localStorage.setItem('luncBattle.renderer', 'webgpu');
```

On r128 you should still boot on **WebGL**, with console info and overlay fallback text explaining missing `THREE.WebGPURenderer`.

Reset:

```
?renderer=webgl
# or
localStorage.removeItem('luncBattle.renderer');
```

---

## Limitations (v9.1)

- No actual WebGPU frames with the shipped r128 build.
- `detectWebGPU()` can report adapter availability while `create({ prefer:'webgpu' })` still falls back — by design.
- WebGPURenderer (when eventually present) may need async `init()`; v9.1 only constructs synchronously and falls back on throw.
- Shadow / `outputEncoding` / ACES tone mapping remain WebGLRenderer-oriented; guarded with property checks for future backends.
- Feature branch only — default Pages deploy is unaffected until merge.

---

## Milestone plan

1. **v9.1 — Renderer abstraction** ✅ (this doc)
2. **v9.2 — PBR materials & lighting foundation** ✅ — see `docs/V9-GRAPHICS.md`  
   Shared MeshStandard registry, lighting foundation, tone-mapping restraint. **No Three upgrade.**
3. **Later — Three upgrade evaluation** (do not start as v9.3 in the v9.2 commit)  
   Pin a modern Three build with `WebGPURenderer`; keep WebGL fallback.
4. **Later — WebGPU path hardening**  
   Async init, color space / tone mapping parity, OrbitControls compatibility.
5. **Later — Asset pipeline hooks**  
   Optional glTF / KTX2 behind quality presets (clear-license only).
6. **Later — Content pass**  
   Unit/building/terrain upgrades after WebGL default stays rock-solid.

---

## Verification checklist

- [ ] `node --check` on changed JS
- [ ] Default (no query): `backend === 'webgl'`, battlefield boots
- [ ] `?renderer=webgpu`: fallback to WebGL + `fallbackReason` set / logged
- [ ] Quality AUTO/LOW/MEDIUM/HIGH/ULTRA + dyn-res still apply
- [ ] HUD / minimap / data feeds unchanged
- [ ] Branch not merged to `main`
