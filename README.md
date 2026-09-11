# LUNC Ecosystem Battlefield v6

**Live site:** https://mrbryan007.github.io/LUNC-Battlefield/


A classic-RTS-inspired visual rebuild of the LUNC Ecosystem Battlefield.

## What changed

- Removed the visible grid/Tetris-like battlefield presentation.
- Rebuilt terrain with procedural elevation and vertex coloring.
- Added original fortified bases, watchtowers, banners, rocks, shrubs and a worn central combat lane.
- Rebuilt infantry, armor and artillery from rounded/low-poly primitives instead of box-heavy units.
- Armies now deploy in formations and advance with the live market front.
- Replaced the giant glowing battle wall with a softer movable frontier of posts/flags.
- Rebuilt explosions with spherical fire/smoke particles rather than cubes.
- Added shadows, fog, RTS camera limits, atmospheric lighting and a more era-appropriate command HUD.
- Renamed misleading `CMC MCap` / `CMC Rank` labels to `Market cap` / `Market rank` because the data source is CoinGecko.
- Public GitHub Pages no longer polls `http://127.0.0.1:8787`. Local bridge polling runs only on localhost, or from an explicit HTTPS `?bridge=` URL.
- Binance spot depth remains optional; the app falls back gracefully to DefiLlama/CoinGecko and estimated walls.
- Binance USD-M liquidation stream uses the raw `/ws/<symbol>@forceOrder` form, with the actual `1000LUNCUSDT` futures contract for LUNC and `USTCUSDT` for USTC.

## Deploy

Replace the repository's existing `index.html` with this `index.html` and commit to `main`. GitHub Pages should redeploy automatically if Pages is already configured for the branch.

## Optional bridge

On localhost, the page looks for:

`http://127.0.0.1:8787/snapshot`

For a public HTTPS bridge, open the page with:

`?bridge=https://your-domain.example/snapshot`

Only use a trusted bridge that returns the expected snapshot shape.
