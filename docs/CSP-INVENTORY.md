# CDN / CSP inventory — v12.0.12 finish

## External origins in use
| Kind | Origin |
|---|---|
| Three.js | `https://cdnjs.cloudflare.com` |
| OrbitControls / GLTFLoader | `https://cdn.jsdelivr.net` |
| Market REST | `https://api.coingecko.com`, `https://api.binance.com` |
| Market WS | `wss://stream.binance.com` |
| Terra / burns / gov | Terra LCD and related HTTPS endpoints (varies by config) |
| GitHub Pages | same origin (`mrbryan007.github.io`) |
| Local assets | same origin |

## Proposed CSP (NOT ENFORCED)
```
default-src 'self';
script-src 'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net;
connect-src 'self' https://api.coingecko.com https://api.binance.com wss://stream.binance.com https://*.terra.dev https://*.cosmos.directory;
img-src 'self' data: blob:;
style-src 'self' 'unsafe-inline';
font-src 'self' data:;
media-src 'self' blob:;
worker-src 'self' blob:;
```

## Why not enforced yet
- Terra and related endpoints are not a single fixed origin.
- Inline styles are used by recovery status and HUD.
- A wrong `connect-src` would break live market data.
- No analytics scripts found.

## Recommendation
Do not enforce a CSP in this release. Revisit after vendoring Three.js and listing every live API origin.
