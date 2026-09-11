# LUNC Ecosystem Battlefield

Live 3D market war map for Terra Luna Classic.

Open it: https://mrbryan007.github.io/LUNC-Battlefield/

## Data truth

| Metric | Source | Mode |
| --- | --- | --- |
| LUNC / USTC / JURIS price | DefiLlama, then CoinGecko (Binance if WS opens) | **LIVE** when connected, else **SIM** walk |
| Buy / sell walls | Binance depth when stream opens | **LIVE**; otherwise **ESTIMATED** from volume + noise — not a real order book |
| Terra Classic / protocol TVL | DefiLlama | **LIVE** |
| Market cap / rank | CoinGecko (not CoinMarketCap) | **LIVE** |
| Liquidation flashes | Binance futures forceOrder when open | **LIVE** |
| “Sim burn flash” feed lines | Local demo effect | **SIM** — not on-chain burns |

Never treat estimated walls or sim burn flashes as confirmed chain or exchange burn data. Tokens without a live quote are not shown.
