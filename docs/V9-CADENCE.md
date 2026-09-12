# LUNC Battlefield v9.4.7 — FPS cadence diagnostics & root-cause isolation

**Status:** `feat/v9-next-gen-renderer` only. **Not merged. Not deployed.** No v9.5 / authored art.

**Context:** v9.4.6 cut Calls (far ~558–570) but PERF stayed locked ~**25 FPS / 40.0 ms**. Blind mesh reduction is the wrong next step until we know *why* 25 is locked.

---

## Critical measurement bug (proven in code — fixed)

### Before (v9.4.6 and earlier)

```js
const dt = Math.min(.04, clock.getDelta());
// …
LUNCBattle.quality.tick(dt, renderer);
```

`quality.tick` derives FPS as `1000 / (dt * 1000)`.

| Real frame time | `getDelta()` | after `Math.min(.04)` | PERF shows |
| --- | --- | --- | --- |
| 16.7 ms (60 FPS) | 0.0167 | 0.0167 | ~60 ✓ |
| 40 ms (25 FPS) | 0.040 | 0.040 | 25 ✓ |
| **66 ms (15 FPS)** | 0.066 | **0.040** | **25 ✗** |

Whenever the real frame is **≥ 40 ms**, PERF could never show worse than **exactly 25 / 40.0 ms**. That matches the “locked ~25 / 40.0 ms” symptom after v9.4.5–6 even when the GPU/CPU might be slower.

### After (v9.4.7)

- **Simulation** still uses `dt = Math.min(0.04, wallDtSec)` (stability only).
- **PERF / `quality.tick`** receives **wall-clock RAF interval**: `performance.now()` delta between `animate()` entries.
- Do **not** pass the sim-capped `dt` into `quality.tick`.

This does **not** invent 60 FPS. It only stops lying when frames are slower than 40 ms. If the environment’s `requestAnimationFrame` is itself ~25 Hz, PERF will still read ~25 — use the RAF probe to prove that.

---

## Hard-cap hunt (search results)

| Check | Result |
| --- | --- |
| `requestAnimationFrame(animate)` | **One** call site in `battle-engine.js` (top of `animate`). No second RAF loop. |
| `renderer.setAnimationLoop` | **Not used.** |
| Explicit 25 FPS / 40 ms render cap | **None** (no `1000/25`, no sleep/throttle around render). |
| `Math.min(.04, …)` / `Math.min(0.04, …)` | **Sim dt cap only** (now). Was incorrectly also feeding PERF. |
| `setInterval` | Feeds / UTC / `updateBattleLogic` **760 ms** / UI — **not** on the RAF path. |
| PERF FPS source | Was `quality.tick(dt)` via capped delta; now wall-clock RAF interval. |
| Quality AUTO adapt thresholds | `ADAPT_HYST_DOWN=28` / `UP=54` — can change render scale, **not** RAF rate. |
| Minimap | Self-throttled to `minimapHz` (~7–12) — not the main canvas. |

**Conclusion:** No intentional 25 FPS render limiter found. The only code path that *forced the PERF readout* to 25/40 when frames were slow was the sim-dt → PERF coupling (fixed). Remaining “true” 25 Hz must be distinguished with the harness + RAF probe (env vs app CPU/GPU).

---

## Diagnostic harness (`?diag=1` or `?cadence=1`)

Script: `js/cadence-diag.js` (loaded from `index.html`).

Every ~2 s (overlay + `console.info('[cadence]', …)`):

| Metric | Meaning |
| --- | --- |
| **RAF/s** | `requestAnimationFrame` callbacks per second |
| **render/s** | `renderer.render()` calls per second |
| **sim/s** | Main `animate` body executions per second |
| **PERF FPS** | From `quality.getState().fps` (wall-clock based) |
| **CPU timers** | avg ms/frame ranked: `units`, `air`, `effects`, `lod`, `minimap`, `quality`, `render` |
| **Sizes** | CSS canvas size, drawingBuffer, devicePixelRatio, renderer pixel ratio |

Also auto-opens the PERF overlay.

### How to run (parent browser)

```
index.html?diag=1&perf=1
index.html?cadence=1&perf=1
```

Prefer fixed Graphics **HIGH** (not AUTO) while comparing.

**Interpretation**

- RAF/s ≈ render/s ≈ sim/s ≈ PERF → single loop, measurement aligned.
- RAF/s ≈ 25 and RAF probe also ≈ 25 → **environment-limited** (do not fake 60).
- RAF/s ≈ 50–60 but PERF low → app/GPU bound; use ranked CPU timers + `?scene=` isolation.
- render/s << RAF/s → unexpected (should not happen in this build).

---

## Standalone RAF probe

`tools/raf-probe.html` — **only** RAF + 2D canvas paint. No Three.js / battlefield.

```
tools/raf-probe.html
```

- If probe **≥ 50–60 FPS** → env can exceed 25; battlefield lock is app/GPU.
- If probe **≈ 25 / 40 ms** → box/browser/remote display caps cadence; **do not fake 60 in the app**.

Parent runs this in computerUse; no box-browser requirement for this milestone.

---

## Progressive scene switches (`?scene=`)

Non-destructive query tiers (each includes all lower layers):

| Value | Spawns |
| --- | --- |
| `renderer` | Lights + clear + camera + animate/render only |
| `terrain` | + terrain mesh |
| `structures` | + env props + faction bases + price territory |
| `ground` | + ground armies (no air) |
| `air` | + heli/jet wings |
| `fx` | + weapon FX / explosions / smoke spawning |
| `full` | Default — everything (same as omitting `scene`) |

Examples:

```
?diag=1&scene=renderer
?diag=1&scene=terrain
?diag=1&scene=structures
?diag=1&scene=ground
?diag=1&scene=air
?diag=1&scene=fx
?diag=1&scene=full
```

---

## A/B hooks (diag / isolation only — not permanent quality lowers)

| Query | Effect |
| --- | --- |
| `?dpr=1` / `1.25` / `1.5` | Override renderer pixel ratio after quality.apply |
| `?shadows=0` | Force `shadowMap.enabled = false` (+ sun.castShadow false) |
| `?fx=0` | No new smoke / tracers / explosions / strikes |
| `?air=0` | Skip heli/jet `spawnAirWing` |

Combine freely, e.g. `?diag=1&scene=ground&fx=0&shadows=0&dpr=1`.

---

## Expected test matrix (parent computerUse)

| # | URL / page | Expect |
| --- | --- | --- |
| A | `tools/raf-probe.html` | Record RAF/s; prove env &gt;25 or capped |
| B | `?diag=1&scene=renderer` | RAF/s vs PERF; near-empty GPU |
| C | `?diag=1&scene=terrain` | +terrain cost |
| D | `?diag=1&scene=structures` | +env/bases |
| E | `?diag=1&scene=ground&fx=0` | ground CPU/GPU without FX |
| F | `?diag=1&scene=air&fx=0` | +air |
| G | `?diag=1&scene=full` | baseline full |
| H | `?diag=1&dpr=1&shadows=0` | resolution/shadow A/B |
| I | `?diag=1&fx=0&air=0` | full scene minus FX/air |

Compare ranked CPU timers across rows. Cache bust: `?v=20260912v947` (already on script tags).

---

## Build labels

- **BUILD** `v9.4.7`
- Cache `?v=20260912v947`
- PERF title `PERF · v9.4.7`
- Cadence overlay `CADENCE · v9.4.7`
- Visuals/density: **preserve v9.4.6** (no army thinning, no authored art)

---

## Proven fix applied this milestone

1. **PERF measurement:** wall-clock RAF `performance.now` interval → `quality.tick` (sim keeps `Math.min(0.04)`).
2. **Harness + scene/A-B hooks** for isolation (no permanent quality downgrade).

**Not applied:** fake 60 FPS, duplicate RAF removal (none found), blind further mesh cuts.

---

## Node checks (executor)

```bash
node --check js/cadence-diag.js
node --check js/battle-engine.js
node --check js/quality.js
node --check js/config.js
```
