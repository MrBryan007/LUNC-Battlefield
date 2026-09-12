# LUNC Battlefield v8 — Graphics Overhaul

## Status

**v8.7 done** — RTS Command HUD + War Room (primary/secondary layout, data-health, structured event cards).

**v8.6 done** — RTS minimap (Canvas 2D) + classic 3/4 camera navigation; frontline terrain grounding fix.

**v8.5 done** — price territory mapping and contested frontline (markers, capture, liquidity defenses).

**v8.4 done** — event-scaled combat effects with pooling (projectiles, impacts, liq/burn FX).

**v8.3 done** — faction bases and RTS structures (Bull industrial vs Bear fortified).

**v8.2 done** — articulated RTS units and animation states (infantry / armor / artillery).

**v8.1 done** — richer RTS terrain and battlefield environment.

All meshes are **original procedural Three.js r128** geometry. No third-party game assets, no copyrighted packs, no GridHelper / neon grids / blocky Tetris look. No copyrighted audio (optional procedural tones only).

## Modules

| File | Role |
| --- | --- |
| `js/terrain.js` | Heightfield (multi-octave hills, trenches/berms, road, craters) + vertex-colored ground |
| `js/environment.js` | Rocks, trees, ruins, barricades, props, scorched discs, distant smoke |
| `js/animations.js` | Animation state enums + `tickInfantry` / `tickArmor` / `tickArtillery` / `pickState` |
| `js/units.js` | Articulated unit builders, shared GEO/materials, formations, `tickUnit` / `setAnimState` |
| `js/structures.js` | Faction bases: HQ, barracks, depot/hangar, arty, supply, radar, comms, towers, bunkers, walls |
| `js/effects.js` | v8.4 pooled projectiles / particles / explosions / scorches / shockwaves + liq/burn hooks |
| `js/price-territory.js` | v8.5 price↔world X mapping, markers, contested frontline, liquidity defense props; v8.6 grounded frontline seating |
| `js/camera.js` | v8.6 classic 3/4 RTS camera (WASD pan, OrbitControls, focus helpers, optional cinematic) |
| `js/minimap.js` | v8.6 Canvas 2D overlay minimap (~10 Hz) + FRONT/BULL/BEAR focus |
| `js/ui.js` | v8.7 RTS Command HUD — primary strip, Battle Strength gates, data-health, intel cards |
| `js/war-room.js` | v8.7 structured War Room feed (event class / importance / VIEW EVENT) |
| `js/battle-engine.js` | Wires terrain / environment / units / structures / effects / price-territory / camera / minimap / HUD; keeps market / Binance / strength paths |


## v8.7 RTS Command HUD & War Room

### Command HUD (`LUNCBattle.ui`)
- **Primary (always on):** token, live price + 24h change, Bull/Bear Power, advantage state, frontline price/neighbors, data-health + source freshness
- **Advantage states:** STRONG BULL / BULL / CONTESTED / BEAR / STRONG BEAR — icon + text + faction accents (not color-only)
- **Battle Strength components:** Momentum, Order Book, Volume, Liqs, Whales, Burns, Funding, OI, Ecosystem — contributions only when truth is **LIVE** or **CALCULATED**; otherwise marked **UNAVAILABLE** (never fabricated)
- **Liquidity bands:** Immediate / Near / Major / Deep with Bid/Ask + truth; PARTIAL less authoritative
- **Data health:** ALL SYSTEMS LIVE / PARTIAL DATA / DEGRADED / RECONNECTING / BACKEND OFFLINE — CoinGecko fail ≠ total failure if Binance ok
- **Source freshness:** e.g. `BINANCE · LIVE · 1s`; stale downgrades
- **Token switch** clears stale HUD; **JURIS** has no fake Binance book/liq
- DOM writes throttled (primary ~8 Hz, strength/health slower)
- Mobile ~390px: safe-area, Command / Intel / War Room tabs; minimap + FRONT/BULL/BEAR preserved

### War Room (`LUNCBattle.warRoom`)
Event classes: MARKET · PRICE TERRITORY · LIQUIDATION · BURN · WHALE · GOVERNANCE · VALIDATOR · NETWORK · SYSTEM  
Fields: timestamp / type / headline / explanation / token / source / truth / importance  
Importance: INFO / NOTABLE / MAJOR / CRITICAL — **VIEW EVENT** only on MAJOR/CRITICAL  
Liq cards: LONG/SHORT · USD · LIVE · side benefiting; synced with existing FX — no fake liqs  
Legacy `pushFeed(text, type)` adapts into structured cards

## v8.6 minimap & camera

### Camera (`LUNCBattle.cameraCtrl.createApi`)
Returns `{ update, focusFrontline, focusBullBase, focusBearBase, focusWorld, getViewportWorldRect, requestCinematic, notifyUserInput, getBounds, version:'v8.6' }`.

- Classic **3/4 RTS** pose default ~(0, 38, 48) looking at frontline; **no FPS free-fly**
- WASD pan (Shift = fast) + OrbitControls orbit/zoom; polar & distance limits unchanged
- Bounds clamp target ≈ **X [−70,70] · Z [−45,45]**
- Shake applied as temporary position offset (no permanent target drift)
- Focus helpers: frontline / bull base x≈−48 / bear base x≈+48 / arbitrary world XZ
- `requestCinematic` — short interruptible pan; **only hooked for massive liq/burn**; `notifyUserInput` cancels
- `getViewportWorldRect` — approx FOV×distance rectangle for minimap

### Minimap (`LUNCBattle.minimap.createApi`)
- **Canvas 2D** DOM overlay (not a second Three.js renderer), bottom-right above status tray
- Draw throttle **~10 Hz** (8–12 Hz band)
- Field tint split by `frontlineX`; HQ diamonds at ±48; frontline stroke; defense dots; unit dots (cluster when crowded); camera viewport rect; optional FX pulses (1–2s)
- Click/tap → `focusWorld`; desktop drag supported; `stopPropagation` so HUD/orbit are not stolen
- Mobile: smaller canvas + `#minimapToggle` collapse; usable near 390px width
- Focus buttons **FRONT / BULL / BEAR** beside minimap

### Frontline grounding fix (v8.5 follow-up)
v8.5 sampled `terrainHeight(0, z)` then translated the frontline group in X — pieces floated/sank on hills.
**Fix:** each piece stores local XZ + yOff; `updateFrontline` reseats with `terrainHeight(frontlineX + localX, z)`. Capture hysteresis unchanged.

**Capture flip-flop watch:** level capture still uses ±0.35×step hysteresis and ≥3s feed debounce. Watch live books for rapid flip-flop noise if mid sits on a level; tighten threshold only if observed.

---

## v8.5 price territory & frontline

`LUNCBattle.priceTerritory.createApi({ THREE, scene, terrainHeight, mobile, pushFeed, DataTruth })` returns
`{ priceToWorldX, worldXToPrice, getPriceStep, getVisiblePriceLevels, setToken, updateCurrentPrice, updateFrontline, updateLiquidityDefenses, checkCaptures, dispose, getFrontlineX, getDisplayedRange, version:'v8.5' }`.

### Mapping
- Contested strip world X ≈ **−28…+28** (bases remain ~±48)
- Linear map: `displayedRangeLow→−28`, `displayedRangeHigh→+28` (soft clamp outside)
- Dynamic range centered on current price from recent `priceHistory` min/max (+ buffer)
- **Hysteresis:** recenter only when price exits the inner **70%** band — do not rebuild every tick

### Price steps & markers
- Step from token magnitude / decimals (LUNC ~1e-6 / 5e-7; USTC ~1e-5 / 5e-5; JURIS coarser)
- Visible nice levels: desktop ~7–11, mobile ~4–6
- Procedural posts/plaques + CanvasTexture/Sprite labels; ownership west=Bull / east=Bear / near=contested
- Capture when price crosses level by **>0.35×step** (debounce ≥3s): `PRICE BREAKOUT · Bulls captured $x` / `PRICE BREAKDOWN · Bears reclaimed $x`

### Frontline
- Contested strip: trenches/berms, sandbags, smoke wisps, contested flags, shell holes on `terrainHeight`
- `frontlineX` smooth-follows `priceToWorldX(price)` (lerp); armies sync via `getFrontlineX()`
- **v8.6:** pieces re-seated each tick at world `(frontlineX+localX, terrainHeight(...), z)` — no translating-group Y bug
- Sparse Bull/Bear territory flags; contested mid wreck/crater accents — no bright floor paint
- `getDefenseMarkers()` exposes defense dots for minimap

### Liquidity defenses
- From market zones (immediate/near/major); **skip UNAVAILABLE**
- **PARTIAL** → smaller translucent/uncertain props (not authoritative fortresses)
- LIVE/CALCULATED/PARTIAL only; never invent fortresses from ESTIMATED walls alone
- Rebuild when zone totals change **>15%** or token changes
- JURIS / no book → no fake live order-book defenses

### Token switch
`setToken` clears markers/defenses/capture state and rebuilds range from new base — no leftover labels.

---

## v8.4 combat effects

`LUNCBattle.effects.createApi({ THREE, scene, terrainHeight, projectilePool, particlePool, onShake, mobile, structuresApi? })` returns
`{ fireWeapon, muzzleFlash, impact, explosion, scorchDecal, shockwave, playLiquidationFX, playBurnFX, prepareWhaleFX, spawnReinforcementBurst, convoyWarning, scaleFromUsd, fireBarrage, tick, launchStrike, createExplosion, caps, version:'v8.4' }`.

### Pooling & caps (desktop / mobile)

| Resource | Desktop | Mobile |
| --- | --- | --- |
| Active projectiles | 48 | 24 |
| Active particles | 120 | 50 |
| Simultaneous explosions | 8 | 4 |
| Smoke clouds | 16 | 6 |
| Scorches / decals | 24 | 10 |

Inactive lists reuse meshes (no create/destroy per shot when possible). Over cap → drop oldest/smallest or skip spawn.

### Projectile kinds (`userData.kind`)

1. **`tracer`** — thin fast cylinder; infantry; short life; small muzzle flash; small spark impact
2. **`shell`** — thicker / slower; ballistic arc `y = lerp + sin(t)*h`; tank; medium flash; stronger impact + light scorch
3. **`arty`** — high arc; delayed dirt+smoke impact; shockwave; larger shake
4. **`rocket`** — exhaust trail particles; multi-hit via `fireBarrage` helper

`maybeFire` chooses kind by unit type (0 tracer, 1 shell, 2 arty) and spawns from `muzzleOffset` when present.

### Event scale helper

`scaleFromUsd(usd) → { tier, power, shake, barrageCount }`

| USD notional | Tier | Shake (cap) | Barrage |
| --- | --- | --- | --- |
| &lt; 5k | small | ≈0 | 1 |
| &lt; 50k | medium | ≈0.15 | 2 |
| &lt; 250k | large | ≈0.35 | 4 |
| else | massive (rare) | ≈0.55 | 6 |

### Liquidation mapping (LIVE forceOrder only)

- **SHORT_LIQ / BUY** — Bull-colored FX toward bear lines (east)
- **LONG_LIQ / SELL** — Bear-colored FX toward bull lines (west)
- Feed labels stay **LIVE**; no invented events
- Replaces simple `launchStrike`/`createExplosion` in the forceOrder handler via `playLiquidationFX`

### Burn hooks

Thresholds (amount LUNC): **100K / 1M / 10M / 100M / 1B** → small→massive gold/orange burn FX.

- `playBurnFX({ amountLunc, truth })` runs only if `truth` is **LIVE** or **SIMULATED**
- Simulated burn flares remain labeled **SIMULATED** / “not a chain event”
- If burns feed is **UNAVAILABLE**, no fake LIVE FX

### Whale stubs

`prepareWhaleFX` → `{ spawnReinforcementBurst, convoyWarning }` — visual stubs only; no fabricated whale events.

### Structure damage (visual stress only)

On **large/massive** liquidation or large/massive burn FX near a faction base (`|x|` high toward towers/bunkers), optionally `structuresApi.setDamageState(building, 'DAMAGED')` with cooldown. Rare **CRITICAL** on massive only. **Not** an economic “HQ destroyed” claim — documented as visual stress-test mapping.

### Audio

No copyrighted audio. Existing optional procedural tones (`playTone` / `playLiq` / `playBurn`) kept.

## v8.3 bases

`LUNCBattle.structures.createApi({ THREE, scene, terrainHeight, mat, mobile })` returns
`{ createFactionBase, updateStructures, setDamageState, getCommandCenter, getBuildings, setAccentColor, dispose, version:'v8.3' }`.

- **Bull (west, x≈−48)** — organized / industrial: octagonal command tower + annex, pitched-roof barracks, garage+ramp depot, ring berm arty pad, warehouse supply, lattice radar + spinning dish, comms hut + drums, cylindrical towers, half-buried bunkers, concrete perimeter + gate toward the frontline.
- **Bear (east, x≈+48)** — heavier / fortified, **different meshes** (not recolors): wide bunker-HQ with glacis + crenellations, buttressed barracks with gun slits, open motor-pool hangar, deeper U-shaped arty berms, earth-covered storehouse, squat panel radar, blockier comms, thick square towers, heavier bunkers, thicker merlon walls.
- Accent color only on banners, lamps, and thin trim. Token switch updates Bull accents via `setAccentColor`.
- Terrain: `placeOnTerrain` / `placeBuilding` using `terrainHeight`; dirt pads under large buildings; wall segments sample height along z. No floating / buried keeps.
- Damage hooks (no full gameplay): each major building has `kind`, `side`, `damageState:'HEALTHY'`, `smokePoints`, `firePoints`, `debrisSpawns`, optional damaged/critical mesh refs. `setDamageState` toggles overlays.
- Ambient: radar spin, banner flutter, restrained lamp blink/pulse.
- Perf: shared GEO/MAT caches; InstancedMesh for walls / sandbags / fences / crates / drums / hedgehogs. Mobile drops prop counts, keeps HQ identity.

## v8.2 animation states

### Infantry (`type === 0`)
`IDLE` · `WALK` · `RUN` · `AIM` · `FIRE` · `RELOAD` · `HIT`

Opposite arm/leg walk cycle; face ±x toward frontline; feet on `terrainHeight`.

### Armor (`type === 1`)
`MOVE` · `AIM_TURRET` · `FIRE` · `IDLE_SCAN`

Track scroll via `trackPhase`; turret scans / aims toward frontline; cannon recoil on fire.

### Artillery (`type === 2`)
`AIM` · `FIRE` · `RELOAD` · `IDLE`

Barrel elevates toward target; longer reload; holds rear ranks.

## Reuse approach

- Materials created once per `createUnitsApi()` / `createApi()` (body / accent / dark / metal / cloth / faction stone)
- Shared `GEO` cache (cylinder segments 5–8; unit box scaled per mesh)
- Articulated infantry uses Group hierarchies with shared BufferGeometry (not InstancedMesh — limb animation)
- Structures instance repeated props (walls, sandbags, fences, crates, drums, hedgehogs)
- Effects reuse inactive projectile/particle meshes under hard caps

## Known follow-ups

1. rootBob one-frame lag — **fixed in v8.3** (`moveArmy` now `tickUnit` then `y = terrainHeight + rootBob`)
2. Frontline float/sink from group translate — **fixed in v8.6** (per-piece terrain reseat)
3. HIT anim not combat-driven yet
4. draw-call optimization deferred to v8.8
5. LIVE burn indexer / whale FX still need HTTPS `?api=` — stubs ready in effects
6. Capture flip-flop watch if mid sits on a price level (hysteresis already present)

## License / assets

- Procedural geometry and materials authored for this project
- No external copyrighted game assets or audio packs
- Three.js r128 via CDN (MIT)

## Roadmap

| Stage | Focus |
| --- | --- |
| **8.1** | Terrain + environment |
| **8.2** | Unit visual polish / formations / animations |
| **8.3** | Base architecture refresh |
| **8.4** | VFX / strikes / atmosphere |
| **8.5** | Frontline / capture markers |
| **8.6** | Minimap + camera navigation |
| **8.7** | RTS Command HUD + War Room (this release) |
| 8.8 | Final art QA + docs / mobile perf |

Market data, Binance depth, Battle Strength, liquidations, and `?api=` bridge must remain intact across all stages. Do **not** fabricate LIVE burns / whales / liquidations.
