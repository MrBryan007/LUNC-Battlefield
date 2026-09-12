# v9.4.4 — Procedural air units

Original procedural only (no competitor pack copies). Wired in `js/units.js` + `js/battle-engine.js`.

| Type | Role | Motion | Fire |
| --- | --- | --- | --- |
| **3** Helicopter | Cabin + rotor disc + tail | Orbit / strafe near frontline at altitude | Rockets + gun tracers via `effectsApi.fireWeapon` |
| **4** Jet / strike | Swept fuselage + wings | Fast ingress → strafe/bomb → egress → re-enter | Rockets + delayed blast ripple |

**Counts (per side):** desktop ~2–4 heli + 1–3 jets; mobile lower (1–2 / 1). Scales lightly with wall strength.

**LOD:** air cores stay visible LOD0–2; LOD3 uses shaped stubs. Ground formations unchanged.

**FX:** reuses pooled projectiles/explosions; quality caps still apply — do not bypass `CAPS`.
