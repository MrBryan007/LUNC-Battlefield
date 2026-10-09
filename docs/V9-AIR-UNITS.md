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

## v9.4.14 helicopter choreography

Helicopters no longer fire from opportunistic `maybeFire`. They use a run-owned machine:

**PATROL → ALIGN → INGRESS → RELEASE → BREAK → COOLDOWN**

- Per-run `heliRunId` (`h1`, `h2`, …)
- Aim picked once (`pickJetAim` cluster: armor → arty → inf → frontline)
- RELEASE fires **gun tracers** or **rockets** via `fireWeapon` with that `runId`
- Rocket `visualScale` 0.52 / `trailScale` 0.45 (unchanged)
- Impacts only from that run’s projectiles (`onHit` gated on `heliRunId`)
- Jets **untouched** (still `j*` `runId` REENTER→…→COOLDOWN)

`maybeFire` skips type 3 and type 4.

## v9.4.14 instancing

- Tracers: two `InstancedMesh` batches (bull/bear). Individual tracer meshes stay off-scene (sim only).
- LOD3 infantry: two `InstancedMesh` cards via `lod.syncFarInfantry`. Per-unit impostor stub hidden when batched.

## Soak (`?perf=1` or `?soak=1`)

After ~30s writes `window.__SOAK__` `{ avgFps, minFps, calls, tris, units, gpu, metal, valid }`. **`valid` is true only when GPU string matches Metal** and is not SwiftShader. Sandbox software reports are INVALID.

## v9.4.15 jet silhouette (presentation only)

Jets are easier to read at the default RTS camera. **No combat change.**

- Scale **1.35 → 1.55**
- Wider merged wings, taller fin + horizontal stabs (`jet.wings.v9415` / `jet.tail.v9415`)
- Canopy blister + thicker fuse/nose
- State machine, `runId`, weapons, impacts **unchanged**
- Helicopters **unchanged**
