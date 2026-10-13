# Changelog

## v12.0.1 — War Systems part 1: supply drops (2026-10-13, daily AI build)
- New: supply drops (`js/theaters/supply.js`, SIMULATED game layer). Cargo planes drop parachute crates with colored smoke, a ground ring and a world-map ping. Contents are fuel, ammo, intel or a power-up.
- One AI squad per side races to each crate. A capture ring fills for whoever holds it and pauses while CONTESTED. The winner banks it in a per-side tally (Map → WAR SYSTEMS).
- The Commander can call a drop in (60 s cooldown). If your side wins: intel lifts fog of war around the zone for 30 s, ammo cuts active cooldowns 30 %, a power-up adds +25 Moon Shot charge. Never changes price, armies or the front.
- Fix: the v12 theater bar, BREAKING ticker and WORLD settings were left on the page body (the theater bar floated over the field, even with Hide UI). The dock now moves them into the Map, Intel and Settings sheets.
- New: daily build-hours log (`data/build-hours.json`) and page ([build-hours.html](build-hours.html)), linked from Settings and the footer.
- `?supply=0` turns supply drops off. Tier caps: LOW/phone 1 active drop and 2 runners per side, others 2 drops and 3 runners.
- Tested: `node --check` on 57 JS files, asset-lifecycle test (33/33), headless HIGH / MEDIUM / LOW / phone 390×844 with 0 page errors and a full drop → capture cycle on each, plus `?supply=0`, `?theaters=0`, `?dock=0`, `?commander=0`, `?ui=0`. Not measured on a real iPhone/Mac.
- Build hours (real timestamps, through testing): 0.26 h (planning 0.02 h, building 0.15 h, testing 0.09 h); deploying is logged in data/build-hours.json once Pages confirms. Target 2–4 h.

## v12.0 — Theaters of War (2026-10-12)
- Wide world with a free camera (pan/orbit/zoom, Q/E rotate, O overview). Theater bar and Tour in the Map sheet.
- Naval theater: ocean shader, destroyers, battleships and a carrier, broadsides, sinking and respawn.
- Air theater: two airbases. Jets taxi, take off, dogfight (missiles/flares), land and crash. AA guns, convoys.
- Basic UAV drones, submarines with torpedo ambushes, an inert ICBM test-launch display, cyber glitch pulses, weather (clear/rain/fog), a day/night cycle and a northern ridge sector.
- Always-on world-map inset. Fog of war toggle (Spectator full vision ON by default). Adaptive music pad and volume slider.
- BREAKING ticker. Signals labelled ESTIMATED · SIMULATED. Market data and the frontline are never altered.
- `?theaters=0` gives the ground-only fallback. Per-tier caps (LOW keeps 2 ships per side and 4 jets).
- Fix: heavy-fx `buildPlane` initialises lazily.
- See docs/V12-ROADMAP.md for what's basic and what's planned.

## v11.4 — HUD dock
## v11.3 — Heavy weapons, nuke cutscene, debris, persistence, medics
