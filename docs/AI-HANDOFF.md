# AI-HANDOFF — current operational state

Git is the source of truth. If this file disagrees with Git, Git wins and this file must be corrected.

**Updated:** 2026-09-13 (v9.4.13 terrain / formations)

## Current

| Item | Value |
| --- | --- |
| BUILD | `v9.4.13` |
| Branch | `feat/v9-next-gen-renderer` |
| Parent | `2448c5b79b5a5e0ca6d419009441654ac06582c4` (v9.4.12.1 FX cleanup) |
| PR | [#4](https://github.com/MrBryan007/LUNC-Battlefield/pull/4) **DRAFT / OPEN** |
| Production / `main` | **v8.8** · SHA `47a61b6c2485b4b3fd17b8ad793f5a7498ade7f9` |
| Live Pages | https://mrbryan007.github.io/LUNC-Battlefield/ (v8.8) |
| Three.js | **r128** WebGL default |
| Cache bust | `?v=20260913v9413` |

## Last accepted milestone (v9.4.12.1)

Shockwave hard-cap + recycle. Burn/liq wrappers no longer double-apply camera shake.

## This pass (v9.4.13)

Terrain / frontline depth + cluster formations. Fireteams / tank pairs / arty batteries. Broken no-man's-land on the **true** `getFrontlineX()`. Narrower center track. Market math unchanged.

**M1 Metal not measured in this sandbox.** Prior valid baseline HIGH ~60. Software FPS is invalid. M1 soak is still required for acceptance.

## Current next task after this report

Stop. Do not start v9.4.14 automatically. Expected next if Bryan approves: helicopter choreography rewrite.

## DO NOT

- Merge PR #4 or push v9 to `main`
- Deploy experimental v9 to GitHub Pages
- Force-push / rewrite history
- Upgrade Three.js off r128
- Change market truth, token logic, price mapping, frontline math
- Rewrite v9.4.11 jet state machine or v9.4.9 armor kit
- Restore AUTO → ULTRA
- Begin v9.5 bones/skinned architecture
- Store passwords, tokens, PATs, private keys, or recovery codes in docs/commits/prompts
- Copy Newhedge (or any competitor) assets, meshes, textures, shaders, code, or layout

## Notes for the next agent

- PR #4 **description is stale** (still talks about v9.2). Trust Git + this file + `docs/V9-*.md`.
- `main` README still says v8.7 in places; `js/config.js` on main is **v8.8**. Docs lag, not a v9 deploy.
- Burns / whales / gov / validators stay **UNAVAILABLE** until an HTTPS `?api=` bridge exists (PR #2). Do not invent live chain events.
- Helicopters still use older/opportunistic fire. Audio is hook-only. Jet mesh is still simple procedural. Known limits — not automatic bugs.
