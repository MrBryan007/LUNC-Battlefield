# AI-HANDOFF — current operational state

Git is the source of truth. If this file disagrees with Git, Git wins and this file must be corrected.

**Updated:** 2026-09-13 (v9.4.12 pass)

## Current

| Item | Value |
| --- | --- |
| BUILD | `v9.4.12` |
| Branch | `feat/v9-next-gen-renderer` |
| Last accepted GitHub tip before this pass | `0fde76fae4d4c7ae83123fa89b58eaafad58438e` (v9.4.11 PERF label) |
| Feature parent | `cb9dcee4e458eb17aac3937b19e14f7e01974ccf` (v9.4.11 jet choreography) |
| PR | [#4](https://github.com/MrBryan007/LUNC-Battlefield/pull/4) **DRAFT / OPEN** |
| Production / `main` | **v8.8** · SHA `47a61b6c2485b4b3fd17b8ad793f5a7498ade7f9` |
| Live Pages | https://mrbryan007.github.io/LUNC-Battlefield/ (v8.8) |
| Three.js | **r128** WebGL default |
| Cache bust | `?v=20260913v9412` |

## Last accepted milestone (v9.4.11)

Jet attack choreography: `REENTER → APPROACH → ALIGN → INGRESS → RELEASE → FLYTHROUGH → EGRESS → COOLDOWN`. Unique `runId` per pass. Causal chain: jet → release → projectile → hit → FX. No opportunistic type-4 `maybeFire`. No magic `setTimeout` bomb blasts.

## This pass (v9.4.12)

Battlefield impact / FX polish. Readable power ladder (small arms < tank < artillery < rocket < jet bomb). Layered pooled FX. Barrel-tip muzzles. Trauma² camera shake (arty/bomb/burn + heavy nearby rocket, distance-attenuated). Heli rockets half visual scale. Jet state machine **unchanged**.

## Hardware performance baseline (acceptance)

**Valid:** MacBook Pro 17,1 · Apple M1 · Metal via ANGLE · Chrome · HIGH ~60 FPS, heavy combat ~60, GPU ~2.1–3.2 ms, CPU submit ~2.0–2.5 ms, 48–74 units.

**Invalid:** SwiftShader / llvmpipe / Microsoft Basic Render Driver. Do not tune the product around software rasterizers.

## Visual architecture constraints

- Local **+Z = forward** (gun / muzzle).
- Tank LOD0–2: hull + turret + cannon. Artillery LOD0–2: chassis + long barrel. Never flat building-like tanks.
- AUTO quality **caps at HIGH**. Manual ULTRA remains. Retina/high-DPR hardware-score tax preserved.
- Army density is product identity (≈48–74). Do not cut armies as the FX performance lever.
- Procedural art is SAFE FALLBACK. Original art only. Newhedge is a visual benchmark, **never copy**.

## Current next task after this report

Stop. Do not start v9.4.13 automatically.

Likely later (Bryan-approved only): terrain/frontline depth + less grid formations → helicopter choreography rewrite → env spectacle → audio → authored jet mesh. Broad v9.5 / SkeletonUtils / AnimationMixer / skinned GLB only if explicitly ordered.

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
