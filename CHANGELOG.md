# Changelog

## v12.0.13 — Realism pass, part 1 (2026-10-15, AI build)
- Fixed the solid near-black smoke/scar band along the front (cycle-1 bug). Frontline scorches in `price-territory.js`, battlefield-look / warzone / marks scars, terrain no-man's tint, effects/environment scorches, and unit contact shadows now use soft alpha-falloff earthy greys/browns (not pure black discs); smoke is grey/brown, drifts with wind and thins. Never a solid black strip on any tier.
- Realism pass module (`js/fx/realism-pass.js`, `?realism=0` kill switch): layered explosions (flash → fireball → rising smoke column → debris → shockwave → scorch), speed-of-sound delay + distance attenuation on far blasts, gravity-based ballistic arcs for shells/arty, muzzle-flash and fire point lights (MEDIUM+), and faction camo / PBR wear materials on invasion bases and defenses (olive drab Bulls, rust-brown Bears).
- Retook the v12.0.12 HIGH base screenshot once the loader was actually gone (wait for `#loadScreen` hidden / engine ready, not a fixed timeout). Before/after shots in `docs/v12013-shots/`.
- Remaining realism gaps recorded in `docs/V12-ROADMAP.md`. Market-driven front, data-truth labels, Moon Shot, Commander, v11.4 HUD/dock, Hide UI, and all v12.x systems / `?flags` kept intact.
- Version bump to v12.0.13 (BUILD, quality api, index tags, cache-bust `?v=20261015v12013`).
- Tested: `node --check` on all JS, asset-lifecycle, stabilization-smoke, headless HIGH / MEDIUM / LOW / phone 390×844 with 0 page errors; feature checks for soft scars, layered boom, SOS delay, camo mats, ballistic arcs, `?realism=0`.

## v12.0.12 — Base invasions (2026-10-15, AI build)
- Deepened base invasions (`js/theaters/base-invasion.js`): each HQ now has barracks infantry that respawn, sentry and machine-gun turrets, mortars, rocket launchers, sniper towers, AA guns, perimeter walls, gates and night searchlights (searchlights only when the day/night cycle is night).
- Defenses actually fire: MG/sentry tracers (about 1-in-5 visible, realism style), arcing mortar shells, rocket salvos, sniper shots, and AA that tracks enemy jets. Assault squads and Commander strikes damage defenses; wrecks persist and rebuild for 6 fuel from the war economy.
- Each side's AI periodically sends an assault group at the enemy base. Map → WAR SYSTEMS · BASE INVASIONS has a Raid button (orders a squad + assault group, siren + radio) and a Rebuild button. A base breach awards Commander score (game layer only — never changes price, armies or the front).
- Siren goes through the shared `sfx` (mute / volume / iOS unlock). "BASE UNDER ATTACK" goes through the voice queue at alert priority with the subtitle / radio log. Gates open for friendly sorties. Status block shows base HP, defenses up/wrecked, barracks headcount and next-assault ETA. Hidden in Hide UI clean mode. `?invasion=0` turns it off. Scales down on LOW/phone; far defenses skip fire on LOW.
- Also covers the earlier PRs #9–#13 that landed on `main` without a version bump: stabilization + gfx recover, invasion feel, battlefield look, war zone FX, and hit marks / lived-in bases (`js/boot-stage.js`, `js/gfx-recover.js`, `js/fx/*.js`, early `base-invasion.js`).
- Version bump to v12.0.12 (BUILD, quality api, index tags, cache-bust `?v=20261015v12012`). `feat/v11.1-perf` synced with `main` on deploy.
- Tested: `node --check` on all JS, asset-lifecycle, stabilization-smoke, headless HIGH / MEDIUM / LOW / phone 390×844 with 0 page errors; feature check (assault → siren+radio, defenses fire, damage→wreck→rebuild, barracks respawn, raid, breach reward, `?invasion=0`). Screenshots in docs/v12012-shots.


## v12.0.11 — Wide front (2026-10-13, AI build)
- The bases are much farther apart: both HQ compounds moved from x ±48 to ±96, so the land front is about 2x wider and deeper. The price→front mapping and frontline math are unchanged: Bulls west, Bears east, price moves the front.
- Formations spread out: about 2x the north–south span, 1.6x more clusters per rank, 1.3x rank gap, and more jitter. Big armies now fill back toward their HQs (rear area) instead of clumping at the line.
- More ground units per tier: ULTRA 1400 / HIGH 1100 / MEDIUM 500 / LOW+phone 160 (was 500/500/250/110). `?units=N` now goes up to 2000. The market still decides each side's share.
- Updated to match: camera Bull/Bear HQ jumps, minimap world bounds (±130) and HQ markers, the v12 HQ views, and the supply depots (moved to ±130/±168, off the new compounds).
- `?wide=0` brings back the old v12.0.10 layout and budgets.
- Tested: `node --check` on all JS, asset-lifecycle 33/33, headless HIGH / MEDIUM / LOW / phone 390×844 with 0 page errors. At 1100 units, units cover z ±45 (was ±22). Before/after screenshots are in docs/v12011-shots.
- Build hours (real timestamps): day total so far 1.49 h, UNDER the 2–4 h target.

## v12.0.10 — Spoken radio chatter + HQ announcements (2026-10-13, AI build)
- New `js/theaters/voice.js`: spoken radio lines with callsigns ("Green Hornet", "Red Grizzly", Overlord, Watchtower, HQ) using the browser's built-in SpeechSynthesis (no audio files).
- Radio sound: browsers can't route SpeechSynthesis through WebAudio, so the effect is approximated: a lower, slightly faster voice, with WebAudio squelch clicks and a band-passed (300–3000 Hz), lightly distorted static burst before and after each line plus a static bed under it.
- Lines on: strikes called, nuke, squad orders, supply depot cut, air-raid warning, carrier hit, reinforcements (+ "E T A fifteen seconds"), tech done, supply crate won/lost, match start, weather and night changes, and a few humor lines. Enemy lines are INTERCEPTED (heavier static, lower voice).
- HQ market lines only speak when the real data moved (price % change and front direction) and are tagged LIVE when the price feed is live, otherwise SIMULATED.
- Priority queue: at most one spoken line every ~6 s; alerts/HQ beat chatter; stale lines drop.
- Subtitle strip above the dock (callsign + line + INTERCEPTED/ALERT/LIVE/SIMULATED tag); tap it for the last 8 lines. Hidden in Hide UI clean mode.
- Settings → WORLD → "Radio voice" toggle; the main mute and volume also apply. `?voice=0` turns it off. (Runs with the v12 world, so it's also off with `?theaters=0`.)
- Tested: `node --check` on all JS, asset-lifecycle 33/33, headless HIGH / MEDIUM / LOW / phone 390×844 with 0 page errors; events → queue → subtitle + speech call, intercepted enemy line, weather announcement, toggle present, `?voice=0` leaves no strip. Can't hear speech headless — needs an ear check on the iPhone (iOS voices differ).
- Build hours (real timestamps): day total so far 1.26 h (incl. the morning run).

## v12.0.9 — War Systems part 6: squad commands with cover and flanking (2026-10-13, extended AI session, cycle 8)
- New `js/theaters/squads.js` (game layer): three squads of your own (Alpha, Bravo, Charlie; 5 riflemen, 3 on LOW/phone) and three enemy AI squads.
- Orders in Map → WAR SYSTEMS · SQUADS: Move (then tap the field), Hold, Flank (swings wide along the north/south edge, then hooks into the enemy side), Cover (runs to the nearest friendly wall/bunker/depot; IN COVER takes half the incoming fire, men crouch).
- Squads trade tracer fire. Incoming fire builds suppression (red bar), which slows them. Selected-squad ring and waypoint marker. Enemy squads move, hold, take cover and flank too, and fog of war hides them.
- Cosmetic only: never removes market units or moves the front. `?squads=0` turns it off.
- Tested: `node --check` on all JS, asset-lifecycle 33/33, headless HIGH / MEDIUM / LOW / phone 390×844 with 0 page errors; move, flank, cover (to a depot and a placed wall), tap-to-move on the canvas and AI orders on each. Not measured on a real iPhone/Mac.
- Build hours (real timestamps, data/build-hours.json): day total 1.17 h before this deploy step (incl. the 0.32 h morning run), UNDER the 2–4 h target. Session ends here.

## v12.0.8 — Fuller fog of war (2026-10-13, extended AI session, cycle 7)
- New `js/theaters/fow.js`: a real visibility grid (8 u cells over the whole world) for your side, used when Spectator full vision is OFF (Settings → WORLD). Spectator stays ON by default, so the market view is unchanged.
- What you can see: your half of the land front, your army, your HQ/airbase radar (90 u), your jets, ships, UAV drones, defenses and supply depots, plus recon-sweep and intel-crate reveals.
- What shrinks it: fog ×0.6, rain ×0.8, night ×0.7, and an enemy cyber hack blinds your radar for 20 s.
- Enemy ships, jets, subs, defenses and reinforcement columns outside your vision are hidden. Hidden ships/jets leave last-known ghost markers on the world-map inset, which also dims unseen areas. A soft dark layer covers unseen ground (one textured plane, cheap on LOW).
- The market-driven armies and the frontline are always shown (data truth). `?fow=0` falls back to the old simple fog.
- Tested: `node --check` on all JS, asset-lifecycle 33/33, headless HIGH / MEDIUM / LOW / phone 390×844 with 0 page errors and fog on: grid computes in ~1–5 ms, enemy ships hidden + ghosted, fog weather shrinks vision, a cyber hack blinds radar. Not measured on a real iPhone/Mac.
- Build hours (real timestamps): day total so far 1.08 h (incl. the 0.32 h morning run), UNDER the 2–4 h target; the extended session continues.

## v12.0.7 — Sound design pass (2026-10-13, extended AI session, cycle 6)
- New ambience beds in `js/sfx.js`: wind (with gusts, louder the higher the camera), ocean surf (when the camera is over or near the ocean) and rain (with the Rain weather).
- New Doppler jet pass: when an airborne jet streaks past the camera you hear it rise, then drop in pitch, panned across the stereo field.
- New `js/theaters/soundscape.js`: strikes in the wider world (ships, supply depots, torpedoes) now sound, louder the closer the camera. Radio-chatter lines get a short radio blip (Bulls and Bears pitched differently, at most one every 3.5 s). Turrets and bunkers make gunfire by distance.
- Respects mute, the volume slider, pause and the iPhone unlock-on-first-tap. `?soundscape=0` turns it off. Audio only, no data changes.
- Tested: `node --check` on all JS, asset-lifecycle 33/33, headless HIGH / MEDIUM / LOW / phone 390×844 with 0 page errors; audio context running after a tap, beds follow camera/weather (surf 1 and rain 1 over the ocean in rain), strike sound, radio blip and a forced jet pass. Can't listen headless — needs an ear check on a real phone.
- Build hours (real timestamps): day total so far 0.94 h (incl. the 0.32 h morning run), UNDER the 2–4 h target; the extended session continues.

## v12.0.6 — War Systems part 5: supply lines you can cut + reinforcement waves (2026-10-13, extended AI session, cycle 5)
- New: supply lines (`js/theaters/lines.js`, game layer). Each side's HQ→front supply road now has a forward and a rear depot (fuel tanks, shed, flag).
- Cut them: any strike within 9 u of an enemy depot damages it; 3 hits destroy it and that side's line is CUT. Its economy income halves, its convoys stop, and its next reinforcement wave is delayed. Depots repair themselves in 25 s, or you can rebuild yours now for 5 fuel. The enemy AI sends bomber raids at your depots.
- New: reinforcement waves. Every 75 s a column marches from each HQ up the supply road and folds into the line (slower while the line is cut). Visual only: the market still sets army size and the front.
- Map → WAR SYSTEMS · SUPPLY LINES & WAVES shows line status, depot hp and the next wave per side. `?lines=0` turns it off.
- Tested: `node --check` on all JS, asset-lifecycle 33/33, headless HIGH / MEDIUM / LOW / phone 390×844 with 0 page errors; 3 strikes cut the enemy line (income 1.0 → 0.5), wave launch + march, AI raid on each. Not measured on a real iPhone/Mac.
- Build hours (real timestamps): day total so far 0.84 h (incl. the 0.32 h morning run), UNDER the 2–4 h target; the extended session continues.

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
