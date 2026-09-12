# LUNC Ecosystem Battlefield v7 — Live War Engine

Classic-RTS-inspired Terra Classic intelligence battlefield.

**Build (main / live):** v8.x — RTS Command HUD + War Room (see `docs/V8-GRAPHICS.md`).

**v9 (feature branch only):** `feat/v9-next-gen-renderer` — **v9.4.5 PERFORMANCE RECOVERY** (selective shadows, LOD stagger, shared FX/impostor pools, frustum hide, throttled minimap/PERF) on v9.4.4 tank silhouettes + air combat / denser armies. Default remains WebGL (Three **r128**) with procedural SAFE FALLBACK. Impostors / SkeletonUtils / KTX2 deferred to v9.5. See `docs/V9-PERF.md` + `docs/V9-LOD.md`. Not merged to main; live Pages stays on v8 until an explicit merge.

**Live site:** https://mrbryan007.github.io/LUNC-Battlefield/

## Architecture (Phase 1)

```
index.html
css/battlefield.css
js/config.js
js/quality.js
js/renderer.js  # v9.1+ feature branch
js/materials.js # v9.2 PBR registry
js/lod.js  # v9.4.5 LOD + stagger/shadow policy
js/…  # see docs/V9-PERF.md
js/assets.js / js/asset-loader.js  # v9.3–v9.4.4 glTF + generation-token lifecycle
js/main.js
js/market.js
js/terra.js
js/governance.js
js/burns.js
js/whales.js
js/battle-engine.js
js/units.js
js/effects.js
js/ui.js
js/war-room.js
```

v6 RTS visuals are preserved in `battle-engine.js`. `units.js` / `effects.js` are API stubs for further extraction.

## Data truth

Every metric/event is tagged **LIVE / CALCULATED / ESTIMATED / SIMULATED / UNAVAILABLE**.

| Feed | Status without HTTPS API |
| --- | --- |
| Prices (configured: DefiLlama / CoinGecko / Binance Vision REST; Binance spot if WS opens) | LIVE when connected |
| Buy/sell walls | LIVE with Binance depth; else ESTIMATED |
| Liquidations | LIVE on Binance futures (`1000LUNCUSDT` / `USTCUSDT`) |
| TVL | LIVE via DefiLlama |
| Burns / whales / governance / validators | **UNAVAILABLE** until `?api=` bridge exists |
| Battle Strength Score | CALCULATED from available inputs only |

## HTTPS data bridge (Phase 2)

Public Pages must not use localhost.

Set a permanent API:

`https://mrbryan007.github.io/LUNC-Battlefield/?api=https://your-bridge.example`

Primary architecture is `?api=https://your-bridge.example` (uses `/snapshot` and other routes). Legacy `?bridge=` HTTPS URLs are mapped onto `api` when possible; localhost bridges are not used on GitHub Pages.

Expected future routes: `/snapshot`, `/burns`, `/whales`, `/governance/proposals`, `/governance/validators`.

## Token battlefields

- **LUNC** — main war map (burns, validators, gov, whales, book)
- **USTC** — recovery/repeg toward $1 (no fake peg data)
- **JURIS** — protocol/TVL focus (no Binance book/liqs)

## Local note

Simulated burn flares in the war feed (if shown) are labeled and are **not** chain burns.

## Liquidity zones

When Binance depth (or API book) is live, Immediate 0–0.5%, Near 0.5–1%, Major 1–3%, and Deep 3–5% bid/ask notionals drive army walls and the Liquidity zones panel. Without a book, walls stay ESTIMATED.
