# LUNC Ecosystem Battlefield v7 — Live War Engine

Classic-RTS-inspired Terra Classic intelligence battlefield.

**Live site:** https://mrbryan007.github.io/LUNC-Battlefield/

## Architecture (Phase 1)

```
index.html
css/battlefield.css
js/config.js
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
```

v6 RTS visuals are preserved in `battle-engine.js`. `units.js` / `effects.js` are API stubs for further extraction.

## Data truth

Every metric/event is tagged **LIVE / CALCULATED / ESTIMATED / SIMULATED / UNAVAILABLE**.

| Feed | Status without HTTPS API |
| --- | --- |
| Prices (DefiLlama → CoinGecko; Binance spot if WS opens) | LIVE when connected |
| Buy/sell walls | LIVE with Binance depth; else ESTIMATED |
| Liquidations | LIVE on Binance futures (`1000LUNCUSDT` / `USTCUSDT`) |
| TVL | LIVE via DefiLlama |
| Burns / whales / governance / validators | **UNAVAILABLE** until `?api=` bridge exists |
| Battle Strength Score | CALCULATED from available inputs only |

## HTTPS data bridge (Phase 2)

Public Pages must not use localhost.

Set a permanent API:

`https://mrbryan007.github.io/LUNC-Battlefield/?api=https://your-bridge.example`

Optional legacy snapshot bridge (localhost or HTTPS only):

`?bridge=https://your-bridge.example/snapshot`

Expected future routes: `/snapshot`, `/burns`, `/whales`, `/governance/proposals`, `/governance/validators`.

## Token battlefields

- **LUNC** — main war map (burns, validators, gov, whales, book)
- **USTC** — recovery/repeg toward $1 (no fake peg data)
- **JURIS** — protocol/TVL focus (no Binance book/liqs)

## Local note

Simulated burn flares in the war feed (if shown) are labeled and are **not** chain burns.
