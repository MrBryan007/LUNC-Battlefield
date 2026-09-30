# AI-HANDOFF — current operational state

Git is the source of truth. If this file disagrees with Git, Git wins and this file must be corrected.

**Updated:** 2026-09-30 (v9.4.17 lighting + ground read)

## Current

| Item | Value |
| --- | --- |
| BUILD | `v9.4.17` |
| Branch | `feat/v9-next-gen-renderer` |
| Parent | `e3c475db3c0bf83c505f73a822f220ae47e04a80` (v9.4.16 iOS playability) |
| PR | [#4](https://github.com/MrBryan007/LUNC-Battlefield/pull/4) **DRAFT / OPEN** |
| Production / `main` | **v8.8** @ `47a61b6c2485` — do not merge, do not deploy |
| Three.js | **r128** WebGL default |
| Cache bust | `?v=20260930v9417` |
| AUTO | caps at **HIGH**. ULTRA is manual only |
| M1 Metal HIGH soak | **OPEN** |

## This pass (v9.4.17)

Lighting and ground readability only. Sun/hemi/fill/rim **colors and sun direction** changed. Exposure `0.94 → 0.98`. Fog `near 48 / far 132 → near 64 / far 168`, color `0x1c2620`. Ground material color lifted to `0x9aa48c` (vertex colors were being multiplied into near-black). Dirt-patch and road opacity raised slightly. **Intensities were not changed** — `js/quality.js` still owns the LOW/MED/HIGH/ULTRA ladder.

Not changed: market math, `getFrontlineX()`, Battle Strength, formations, jet `runId`, heli `heliRunId`, FX hierarchy, tracer instancing, LOD, iOS MSAA-off / `powerPreference: default` / closer camera.

## Next

Stop. Do not start v9.4.18. M1 Metal HIGH soak remains OPEN.

## Archive (superseded — not current)

- **v9.4.16** `e3c475d` — iOS: no MSAA, `powerPreference: default`, closer phone camera. Combat unchanged.
- **v9.4.15** `91329ea` — jet silhouette at RTS camera.
- **v9.4.14** `95a46b7` — heli `heliRunId` machine; instanced tracers + LOD3 infantry; `window.__SOAK__`. Software soak invalid.
- **v9.4.13** `a92047f` — terrain/frontline depth + fireteams / tank pairs / artillery batteries.
- **v9.4.12.1** — shockwave cap; burn/liq no longer double-shake.
- **v9.4.12** — FX hierarchy polish.
- **v9.4.11** — jet `runId` choreography.
- **v9.4.10** — AUTO max HIGH.
- **v9.4.9** — armor hull + turret + cannon, artillery chassis + barrel.

## DO NOT

- Merge PR #4 or push v9 to `main`
- Deploy experimental v9 to GitHub Pages
- Force-push / rewrite history
- Upgrade Three.js off r128
- Change market truth, token logic, price mapping, frontline math
- Rewrite jet or heli state machines or the v9.4.9 armor kit
- Restore AUTO → ULTRA
- Begin v9.5 bones/skinned architecture
- Store passwords, tokens, PATs, private keys, or recovery codes in docs/commits/prompts
- Copy Newhedge (or any competitor) assets, meshes, textures, shaders, code, or layout

## Notes for the next agent

- PR #4 **title and description are stale**. Suggested title (do not rename unless Bryan says so): `v9 Next-Gen Renderer — through v9.4.17 Lighting + Ground Readability`. Trust Git + this file.
- `main` is **v8.8**. Docs lag there is not a v9 deploy.
- Burns / whales / gov / validators stay **UNAVAILABLE** until an HTTPS `?api=` bridge exists. Do not invent live chain events.
- Helicopters use the v9.4.14 causal machine, not opportunistic fire. Audio is hook-only.
