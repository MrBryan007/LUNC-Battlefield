# LUNC Battlefield — v8.1–v8.8 Review Package

**Branch:** `feat/v8-rts-graphics-overhaul`  
**Build:** v8.8  
**Date:** 2026-09-11 (PT)  
**Scope:** Graphics / UX overhaul only — market, Battle Strength, liquidity, burn, whale, and governance math unchanged.

---

## 1. Executive summary

v8 delivers an original procedural RTS battlefield (Three.js r128) with terrain, articulated units, faction bases, combat FX, price territory, minimap/camera, Command HUD / War Room, and a **v8.8 graphics quality system** (AUTO/LOW/MEDIUM/HIGH/ULTRA) with dynamic resolution, LOD hooks, instancing, and a feed-health diagnostics overlay.

No third-party game assets. No fabricated LIVE burns / whales / liquidations.

---

## 2. Version checklist

| Ver | Deliverable | Module(s) | Status |
| --- | --- | --- | --- |
| 8.1 | Terrain + environment | `terrain.js`, `environment.js` | Done |
| 8.2 | Articulated units + anim | `units.js`, `animations.js` | Done |
| 8.3 | Faction bases | `structures.js` | Done |
| 8.4 | Pooled combat FX | `effects.js` | Done |
| 8.5 | Price territory / frontline | `price-territory.js` | Done |
| 8.6 | Minimap + camera | `minimap.js`, `camera.js` | Done |
| 8.7 | Command HUD + War Room | `ui.js`, `war-room.js` | Done |
| 8.8 | Quality / perf system | `quality.js` + wiring | Done |
| 9.x | — | — | **Not started** |

---

## 3. v8.8 quality architecture

### Presets (effective caps)

| | LOW | MEDIUM | HIGH | ULTRA |
| --- | --- | --- | --- | --- |
| pixelRatioCap | 1.0 | 1.35 | 1.6 | 1.8 |
| renderScale | 0.72 | 0.88 | 1.0 | 1.0 |
| shadows | off | basic | soft | soft |
| shadowMapSize | 512 | 1024 | 2048 | 2048 |
| particles | 36 | 70 | 120 | 160 |
| smoke | 4 | 8 | 16 | 20 |
| explosions | 3 | 5 | 8 | 10 |
| projectiles | 20 | 32 | 48 | 56 |
| vegetationDensity | 0.30 | 0.55 | 0.85 | 1.0 |
| minimapHz | 7 | 10 | 12 | 12 |
| animComplexity | low | medium | high | ultra |
| unitUpdateDivisor | 2 | 1 | 1 | 1 |
| shadowCast | major | bases | rich | rich |

### AUTO
1. Initial conservative pick from dPR, resolution, `hardwareConcurrency`, mobile UA/width, optional `renderer.info`
2. Sustained FPS EMA with hysteresis (~28 fps → scale down / drop level; ~54 fps → scale up / raise)
3. Cooldowns (~8–12s) prevent oscillation
4. `localStorage['luncBattle.graphicsQuality']` stores explicit choice; AUTO preference stays `AUTO` while UI shows `AUTO · <level>`

### Dynamic resolution
- Eases `renderScale` toward target; applies via `renderer.setPixelRatio(min(dPR, cap) * scale)`
- **Never** recreates `WebGLRenderer`
- Resize calls `quality.apply` again

### LOD hooks (v9 prep)
- `getLodBand(distance)` → 0..3 using preset LOD0–LOD3 distances
- Far / LOW: skip or simplify articulated anim; **no mesh rebuild**

### Instancing / pooling / shadows
- Rocks + fence posts/rails → `THREE.InstancedMesh`
- Effects pools unchanged; caps driven by quality; duration scale applied
- Shadow cast: LOW major-only / off; MEDIUM bases+nearby; HIGH/ULTRA richer

### Perf overlay
Toggle: `?perf=1` · `localStorage luncBattle.perfOverlay=1` · Shift+P  
Shows FPS, avg ms, approx 1% low, scale, quality label, `renderer.info`, active units/projectiles/particles/explosions/smoke, minimap Hz, **and** feed health section.

### Feed diagnostics (not graphics failures)
Names: Binance WS, Binance Vision REST, CoinGecko, DefiLlama, Backend/API, Terra  
States: LIVE / DEGRADED / STALE / RATE_LIMITED / CORS_BLOCKED / OFFLINE / UNAVAILABLE / RECONNECTING  
HTTP 451 / 429 / CORS → feed state only (`quality.reportFeed` from existing fetch/WS paths).

---

## 4. Hard constraints verification

| Constraint | Result |
| --- | --- |
| No merge to main | Confirmed for this package |
| Stopped at v8.8 (no v9) | Confirmed |
| Market / strength / liq / burn math untouched | Quality module is graphics-only; grep audit recommended |
| No fabricated LIVE events | Unchanged policy |
| GitHub Pages safe | HTTPS feeds; `?api=` optional |

---

## 5. Sustained performance samples

| Scenario | Duration | Result |
| --- | --- | --- |
| Automated Node tick sample (no GPU) | ~90s simulated | Mobile-ish start `AUTO·LOW` @ dPR scale 0.72; under ~22 FPS scale→0.56; recovery → `AUTO·HIGH` then desktop-like raise (mobile capped at HIGH). FPS EMA tracked correctly. |
| Full 10–15 min browser soak | — | **Pending parent-run** (desktop + mobile ~390px) |

Suggested soak checklist:
- [ ] AUTO settles without oscillation
- [ ] Manual LOW→ULTRA changes apply without renderer recreation
- [ ] Shift+P overlay: feeds show CORS_BLOCKED/RATE_LIMITED correctly when 451/429
- [ ] LUNC / USTC / JURIS token switch; no ReferenceError
- [ ] Minimap clicks immediate at LOW Hz draw

---

## 6. Known limitations

1. Env/structure **density** applied at scene build — mid-session quality change updates caps/shadows/dyn-res, not full prop respawn
2. Articulated units not instanced (intentional — limb animation)
3. Post-FX / texture LOD hooks are stubs
4. LOD mesh swaps deferred to v9
5. 1% low is approximate from a short rolling window
6. Full multi-device soak numbers pending parent verification

---

## 7. Files touched (v8.8)

- `js/quality.js` (new)
- `js/config.js`, `js/battle-engine.js`, `js/effects.js`, `js/environment.js`, `js/terrain.js`, `js/structures.js`, `js/units.js`, `js/animations.js`, `js/minimap.js`, `js/market.js`, `js/ui.js` (header)
- `index.html`, `css/battlefield.css`
- `docs/V8-GRAPHICS.md`, `docs/V8-REVIEW-PACKAGE.md`

---

## 8. Sign-off

- Implementation: v8.8 quality system complete on `feat/v8-rts-graphics-overhaul`
- **Do not merge to main** until product owner approval
- **Do not start v9** in this PR


---

## Sustained performance soak (box browser, 2026-09-11)

**Tip under test:** `c04ffaf` (+ follow-up quality-UI fix if present)  
**URL:** `?perf=1` · quality AUTO · desktop ~1280  

| Metric | Value |
| --- | --- |
| Duration | ~15.3 min (185 samples @ 5s) |
| FPS avg / min / max | 25 / 25 / 25 (flat; no progressive decline) |
| frameMs | ~40 |
| Final quality | `AUTO · LOW` · renderScale `0.56` |
| Final renderer.info | ~982 calls · ~57.7k tris · 9 textures · 407 geometries |
| Decline | **0** (start-half FPS = end-half FPS) |

**Caveat:** Flat 25 FPS on the shared box VM may reflect compositor/throttle limits more than phone/desktop silicon. Adaptive scale did settle LOW under load; quality cycling still applied scales 0.72→1.0 correctly.

### Quality UI fix (v8.8.1)
Graphics picker was mounted in `#statusTray` under the minimap (`z-index` 26 vs 27) and was not clickable. Moved to **fixed top-right** (`z-index` 45) with visible `AUTO · X` chip; menu opens downward.

### Provider / feed health (soak environment)
| Feed | Observed |
| --- | --- |
| Binance Vision REST | LIVE |
| Binance WS | RECONNECTING / blocked (451-class) |
| CoinGecko | CORS_BLOCKED |
| DefiLlama | LIVE |
| Backend/API | UNAVAILABLE |
| Terra | LIVE where wired |

Feed failures are diagnostics only — not graphics failures. App continues with Vision REST + fallbacks.

### Merge recommendation
**Branch ready for independent final review.** Do **not** merge until Bryan approves. Known UI occlusion fixed in v8.8.1; re-verify quality gear click on desktop + ~390px before merge decision.

### Quality UI fix follow-up (v8.8.2)
Root cause: `.quality-picker { position: relative }` overrode `.quality-picker-fixed { position: fixed }` (same specificity, later rule), so the control sat in document flow (top-left) under the HUD. Fixed via `#qualityPicker { position: fixed !important; …; z-index: 70 }` top-right.
