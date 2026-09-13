# v9.4.11 — Jet attack choreography + impact sync

Original procedural air only (no competitor pack copies). Wired in `js/units.js` + `js/battle-engine.js` + `js/effects.js`.

| Type | Role | Motion | Fire |
| --- | --- | --- | --- |
| **3** Helicopter | Cabin + rotor disc + tail | Orbit / strafe near frontline at altitude | Rockets + gun tracers via `effectsApi.fireWeapon` (unchanged this pass) |
| **4** Jet / strike | Swept fuselage + wings · scale **1.35** · alt **~8.5–11** | Authoritative pass: **REENTER → APPROACH → ALIGN → INGRESS → RELEASE → FLYTHROUGH → EGRESS → COOLDOWN** | Per-run `runId` + corridor; **strafe** (4–8 tracers) / **bomb** (real arc projectile) / **rocket**; impacts only from that run’s projectiles |

## Jet run ownership

Each pass stores on `userData`: `runId`, `runAim`, `runWeapon`, `entryVec`, `exitVec`, `releaseGate`, `attackCorridor`, optional `variation`. Aim is picked once at plan time (armor cluster → arty → dense infantry → frontline strip). Mid-run retarget only if aim becomes completely invalid → abort to **EGRESS**.

**Forbidden:** opportunistic jet `maybeFire`, randomized jet impact points, magic `setTimeout` bomb ripples. Jet impacts must originate from a projectile/tracer tagged with the active `runId`.

**Counts (per side):** desktop ~2–4 heli + 1–3 jets; mobile lower (1–2 / 1). Scales lightly with wall strength.

**LOD:** air cores stay visible LOD0–2; LOD3 uses shaped stubs. Ground formations / v9.4.9 armor+arty unchanged.

**FX:** pooled projectiles (incl. `bomb` kind); `fireWeapon` accepts `runId` / `onHit` / `jetStrike`. Quality caps still apply.

**Audio:** hook flags only (`audioHooks.approach|flyby|release|impact`) — no audio system in this pass.
