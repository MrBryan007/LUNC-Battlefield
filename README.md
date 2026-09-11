# LUNC Ecosystem Battlefield

RTS-style 3D market battlefield for Terra Luna Classic (v6).

**Live site:** https://mrbryan007.github.io/LUNC-Battlefield/

## Data truth

| Metric | Source | Mode |
| --- | --- | --- |
| LUNC / USTC / JURIS price | DefiLlama → CoinGecko; Binance spot when the WS opens | **LIVE** when connected, else **SIM** |
| Buy / sell walls | Binance depth when connected | **LIVE**; otherwise **ESTIMATED** (not a real order book) |
| Liquidations | Binance futures forceOrder | **LIVE** when stream opens — LUNC uses `1000LUNCUSDT`, USTC uses `USTCUSDT` |
| Chain / protocol TVL | DefiLlama | **LIVE** |
| Market cap / rank | CoinGecko | **LIVE** |
| Burn flares in the feed | Local demo effect | **SIM** — not on-chain burns |

## Local data bridge

The optional snapshot bridge at `http://127.0.0.1:8787/snapshot` is **disabled on GitHub Pages**. It only runs on `localhost` / `127.0.0.1`, or when you pass an HTTPS URL: `?bridge=https://your-bridge.example/snapshot`.

## Controls

WASD move · drag orbit · scroll zoom. Token bar: LUNC / USTC / JURIS.

Original classic-RTS battlefield feel (terrain, bases, units, fog, frontline) — no copyrighted game assets.
