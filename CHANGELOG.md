# Changelog

## v12.0.5 — Fixes: world map top-right, LOW black ground patches, ?dock=0 war panel, visible torpedo ambush (2026-10-13, extended AI session, cycle 4)
- Fix: the world-map inset now sits top-right as designed. A global `body > canvas { inset: 0 }` rule also matched it and pinned it left.
- Fix: the solid black patches on LOW. Two causes: hard-edged near-black scorch discs (environment props) and LOW crater decals that multiplied by a texture whose transparent edge uploads as black. Both now use a soft noisy alpha mask; crater decals fade by shrinking.
- Fix: with `?dock=0` the supply panel was created hidden with no way to open it. A WAR SYSTEMS drawer (bottom-left) now holds supply, economy, tech and defenses.
- Fix: the sub torpedo ambush is now visible and lands. Torpedoes are real objects with a white wake that home on the target ship's live position, with a water column + fire on impact and a "Torpedo impact" radio line. Subs reposition near a target lane while submerged. (Before, a few dust puffs aimed at a stale spot from up to 200 u away.)
- Defense placement ignores taps on the world-map inset.
- Tested: `node --check` on all JS, asset-lifecycle 33/33, headless HIGH / MEDIUM / LOW / phone 390×844 with 0 page errors; forced ambush → torpedo fired → hit on every tier; inset 8 px from the right edge; LOW crater/scorch screenshot; `?dock=0` drawer opens with all 4 panels. Not measured on a real iPhone/Mac.
- Build hours (real timestamps): day total so far 0.76 h (incl. the 0.32 h morning run), UNDER the 2–4 h target; the extended session continues.

## v12.0.4 — War Systems part 4: defensive structures (2026-10-13, extended AI session, cycle 3)
- New: defenses (`js/theaters/forts.js`, game layer) in Map → WAR SYSTEMS · DEFENSES: Bunker (8 fuel + 4 ammo), Turret (6 fuel + 8 ammo), Wall (6 fuel). Unlocked by the Fortifications tech.
- Pick a type, then tap the field. They only go on your side of the front (a tap past it snaps back). Cap 8 per side (5 on LOW/phone). They rise out of a dust cloud.
- Turrets swivel to the nearest enemy unit within 28 u and fire tracers; bunkers fire from the slit. Game FX only: never removes units, never moves the front. The enemy AI builds too.
- `?forts=0` turns it off.
- Tested: `node --check` on all JS, asset-lifecycle 33/33, headless HIGH / MEDIUM / LOW / phone 390×844 with 0 page errors; research → place bunker/turret/wall → tap-to-place on the canvas → turrets firing on each. Not measured on a real iPhone/Mac.
- Build hours (real timestamps): day total so far 0.55 h (incl. the 0.32 h morning run), UNDER the 2–4 h target; the extended session continues.

## v12.0.3 — War Systems part 3: tech tree (2026-10-13, extended AI session, cycle 2)
- New: tech tree (`js/theaters/tech.js`, game layer) in Map → WAR SYSTEMS · TECH TREE. Five techs, paid from the war economy, 20 s research each, with prerequisites:
  Logistics (10 fuel: income ×1.25) → Field Radar (8 intel: recon sweep 35 s over 3 zones) and Rapid Reload (12 ammo: Commander cooldowns tick 20 % faster) → Air Bridge (14 fuel: supply-drop call cooldown halved) and Fortifications (10 fuel + 10 ammo: unlocks defenses, coming next).
- The enemy AI researches too (radio lines, "Enemy R&D n/5" note). Never changes price, armies or the front. `?tech=0` turns it off.
- Tested: `node --check` on all JS, asset-lifecycle 33/33, headless HIGH / MEDIUM / LOW / phone 390×844 with 0 page errors and a research chain check (Logistics → Rapid Reload → Field Radar) on each. Not measured on a real iPhone/Mac.
- Build hours (real timestamps): day total so far 0.48 h (incl. the 0.32 h morning run), UNDER the 2–4 h target; the extended session continues.

## v12.0.2 — War Systems part 2: war economy (2026-10-13, extended AI session, cycle 1)
- New: war economy (`js/theaters/economy.js`, game layer). Per-side fuel / ammo / intel stockpiles in Map → WAR SYSTEMS · ECONOMY.
- Income every 4 s, weighted by market signals and labelled **ESTIMATED · SIMULATED**: fuel ← each side's share of the army (market walls), ammo ← |momentum|, intel ← whichever side momentum favours. Captured supply crates add +5 of their kind (power-ups → ammo).
- Spend it: Recon sweep (6 intel → fog lifted around the front for 20 s), Rearm (8 ammo → active Commander cooldowns −30 %), Rush drop (8 fuel → supply-drop call ready now). The enemy AI spends too. Never changes price, armies or the front.
- `?economy=0` turns it off (also off with `?theaters=0`).
- Tested: `node --check` on all JS, asset-lifecycle test 33/33, headless HIGH / MEDIUM / LOW / phone 390×844 with 0 page errors, income + spend check on each, panel lands in the Map sheet. Not measured on a real iPhone/Mac.
- Build hours (real timestamps): cycle 1 so far planning 0.01 h, building 0.02 h, testing 0.06 h. Day total so far 0.41 h (incl. the 0.32 h morning run), UNDER the 2–4 h target; the extended session continues.

## v12.0.1 — War Systems part 1: supply drops (2026-10-13, daily AI build)
- New: supply drops (`js/theaters/supply.js`, SIMULATED game layer). Cargo planes drop parachute crates with colored smoke, a ground ring and a world-map ping. Contents are fuel, ammo, intel or a power-up.
- One AI squad per side races to each crate. A capture ring fills for whoever holds it and pauses while CONTESTED. The winner banks it in a per-side tally (Map → WAR SYSTEMS).
- The Commander can call a drop in (60 s cooldown). If your side wins: intel lifts fog of war around the zone for 30 s, ammo cuts active cooldowns 30 %, a power-up adds +25 Moon Shot charge. Never changes price, armies or the front.
- Fix: the v12 theater bar, BREAKING ticker and WORLD settings were left on the page body (the theater bar floated over the field, even with Hide UI). The dock now moves them into the Map, Intel and Settings sheets.
- New: daily build-hours log (`data/build-hours.json`) and page ([build-hours.html](build-hours.html)), linked from Settings and the footer.
- `?supply=0` turns supply drops off. Tier caps: LOW/phone 1 active drop and 2 runners per side, others 2 drops and 3 runners.
- Tested: `node --check` on 57 JS files, asset-lifecycle test (33/33), headless HIGH / MEDIUM / LOW / phone 390×844 with 0 page errors and a full drop → capture cycle on each, plus `?supply=0`, `?theaters=0`, `?dock=0`, `?commander=0`, `?ui=0`. Not measured on a real iPhone/Mac.
- Build hours (real timestamps): 0.32 h (planning 0.02 h, building 0.15 h, testing 0.09 h, deploying 0.06 h). UNDER the 2–4 h daily target.

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
