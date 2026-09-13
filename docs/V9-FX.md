# v9.4.12 — Battlefield impact / FX polish

**Branch only:** `feat/v9-next-gen-renderer`. **Not merged to main.** Production Pages stay on v8.8.

Goal: clearer combat impact hierarchy, hit feedback, and spectacle while preserving readability, army density, jet `runId` causality, and market/data truth.

## Impact power hierarchy

| Tier | Weapon | Muzzle | Projectile | Impact |
| --- | --- | --- | --- | --- |
| **1** | Infantry small arms | Tiny flash at barrel, 1 spark, **no** point light | Thin short tracer | Tiny dirt/spark |
| **2** | Tank cannon | Stronger flash + short smoke + light | Shell | Debris + short smoke puff + small scorch |
| **3** | Artillery | Largest muzzle, firing smoke, light | High-arc shell | Dirt column, debris, medium smoke, shockwave, nearby shake |
| **4** | Rocket / missile | Launch flash + **trail starts at launch** | Visible rocket | Strong impact, debris, smoke; trail **stops at hit** |
| **5** | Jet bomb | Tiny release puff | Real downward-arc bomb | Flash + blast + dirt column + smoke plume + embers + brief fire core + shake |

`small arms < armor/artillery < jet strike` must remain readable without labels.

## Implementation notes

- **Pooled** flash / debris / ember / fire-aftermath meshes. No per-impact `new` geometry. No `setTimeout` explosion accounting (tick-owned slots).
- Muzzle flashes **do not float away** (near-zero vertical velocity, short life).
- Tracers thinned (not laser beams). Heli rockets use `visualScale` 0.52 / `trailScale` 0.45 so they do not read as jet-scale.
- Camera shake: **trauma²**, **dt decay**, **distance-attenuated**, only **arty / bomb / burn** (plus heavy nearby rocket). Applied after OrbitControls; target is never shaken.
- Quality: LOW keeps core flash+impact and strict debris/aftermath caps. HIGH/ULTRA add debris, smoke, fire cores. **Army population is not the quality lever.**
- Jet choreography **unchanged** (v9.4.11 state machine + `runId` → projectile → hit → FX). No magic `setTimeout` blasts.
- Helicopter **AI unchanged**; only rocket scale / pod muzzle / trail / impact presentation.

## Files

- `js/effects.js` — hierarchy, debris, aftermath, trails
- `js/battle-engine.js` — heli rocket scale; distance-attenuated `onShake`
- `js/camera.js` — trauma² + dt decay
- `js/animations.js` — slightly stronger, fast-recovering barrel recoil
- `js/units.js` — muzzle offsets at barrel/pod tips
- `js/quality.js` — `debris` / `aftermath` caps
- `js/config.js` / `index.html` — BUILD `v9.4.12` · cache `?v=20260913v9412`

## Non-goals (this pass)

Market math, frontline data, helicopter choreography rewrite, audio system, SkeletonUtils / v9.5, production merge.
