# LUNC Ecosystem Battlefield v7.1 — Terra Intelligence

Classic-RTS-inspired Terra Classic intelligence battlefield.

**Live site:** https://mrbryan007.github.io/LUNC-Battlefield/

## Architecture

```
index.html
css/battlefield.css
js/config.js          # ?api= base (root or /api suffix)
js/main.js
js/market.js
js/terra.js
js/governance.js      # legacy /governance/proposals + validators
js/burns.js           # envelope + legacy shapes
js/whales.js
js/battle-engine.js   # v6/v7 RTS visuals (unchanged design)
js/units.js
js/effects.js
js/ui.js
backend/              # Cloudflare Worker (v7.1)
docs/V7.1-BACKEND.md
```

v6 RTS visuals are preserved in `battle-engine.js`. Do not redesign the war engine for API work.

## Data truth

Every metric/event is tagged **LIVE / CALCULATED / ESTIMATED / SIMULATED / UNAVAILABLE / PARTIAL**.

| Feed | Without `?api=` | With v7.1 Worker |
| --- | --- | --- |
| Prices (DefiLlama → CoinGecko; Binance spot) | LIVE when connected | LIVE / PARTIAL via `/market` |
| Buy/sell walls | LIVE with Binance depth; else ESTIMATED | LIVE via `/orderbook` |
| Liquidations | LIVE on Binance futures WS in-page | Worker: **UNAVAILABLE** until WS ingest |
| TVL | LIVE via DefiLlama | unchanged |
| Burns / whales / governance / validators | **UNAVAILABLE** | LCD best-effort (PARTIAL/UNAVAILABLE preferred over wrong LIVE) |
| Battle Strength Score | CALCULATED from available inputs | unchanged |

## v7.1 HTTPS Worker (`?api=`)

Public Pages must not use localhost.

```
https://mrbryan007.github.io/LUNC-Battlefield/?api=https://YOUR.workers.dev
https://mrbryan007.github.io/LUNC-Battlefield/?api=https://YOUR.workers.dev/api
```

Both forms work: the Worker dual-mounts `/api/*` and bare `/snapshot`, `/burns`, `/whales`, `/governance/proposals`, `/governance/validators`. Frontend `config.js` strips a trailing `/api` when normalizing.

See **[docs/V7.1-BACKEND.md](docs/V7.1-BACKEND.md)** and **[backend/DEPLOY.md](backend/DEPLOY.md)**.

## Token battlefields

- **LUNC** — main war map (burns, validators, gov, whales, book)
- **USTC** — recovery/repeg toward $1 (no fake peg data)
- **JURIS** — protocol/TVL focus (no Binance book/liqs)

## Liquidity zones

When Binance depth (or API book) is live, Immediate 0–0.5%, Near 0.5–1%, Major 1–3%, and Deep 3–5% bid/ask notionals drive army walls and the Liquidity zones panel. Without a book, walls stay ESTIMATED.

## Backend quickstart

```bash
cd backend
npm test
npx wrangler deploy
```
