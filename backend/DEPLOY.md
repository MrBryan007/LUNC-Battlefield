# Deploy LUNC Battlefield API (Cloudflare Workers)

## Prerequisites

- Cloudflare account
- Node 18+
- `npx wrangler` (devDependency in this folder)

## Login

```bash
cd backend
npx wrangler login
```

## Deploy

```bash
cd backend
npx wrangler deploy
```

Note the workers.dev URL, e.g. `https://lunc-battlefield-api.<account>.workers.dev`.

## Optional vars

In `wrangler.toml` `[vars]` or the Cloudflare dashboard:

| Var | Purpose |
| --- | --- |
| `BUILD` | Build label (default `v7.1`) |
| `CHAIN_ID` | Default `columbus-5` |
| `TERRA_LCD_URLS` | Comma-separated LCD failover list |
| `BINANCE_REST_BASES` | Comma-separated Binance REST bases |

Example:

```bash
npx wrangler secret put TERRA_LCD_URLS
# paste: https://terra-classic-lcd.publicnode.com,https://lcd.terra-classic.hexxagon.io
```

(Or set plain `[vars]` for non-secret URLs.)

## Point GitHub Pages at the Worker

The Worker mounts **both** `/api/*` and bare paths (`/snapshot`, `/burns`, …).

**Either form works:**

```
https://mrbryan007.github.io/LUNC-Battlefield/?api=https://lunc-battlefield-api.<account>.workers.dev
```

```
https://mrbryan007.github.io/LUNC-Battlefield/?api=https://lunc-battlefield-api.<account>.workers.dev/api
```

Frontend `js/config.js` normalizes a trailing `/api` so `/burns` and `/api/burns` both resolve.

## Smoke after deploy

```bash
curl -sS "$WORKER/health" | jq .truth,.data.build
curl -sS "$WORKER/api/snapshot" | jq .truth,.data.market.LUNC.truth
curl -sS "$WORKER/governance/proposals" | jq .truth
curl -sS "$WORKER/liquidations" | jq .truth,.error
```

## Credentials still required

- Cloudflare login / API token for `wrangler deploy` (not stored in this repo)
- No Binance API key needed for public market/depth REST
- No Terra LCD key for the public endpoints used here
