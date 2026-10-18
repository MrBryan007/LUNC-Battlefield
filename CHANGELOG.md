# Changelog

## v12.0.18 — Weather & cyber warfare affect combat (2026-10-18, AI build)
- Weather and cyber used to be cosmetic. New `js/theaters/wx-combat.js` (`LUNCBattle.wxCombat`) is one table of condition modifiers that the combat code now asks.
- Weather (Settings → WORLD) and night change the fighting. Naval gunnery spread widens (rain ×1.35, fog ×1.7, night ×1.15; the guns are radar-laid, so they lose less than eyes would). Theater AA hit chance drops (rain −25 %, fog −45 %, night −15 %). IR air-to-air missiles miss more (rain −20 %, fog −35 %). Base MG, sentry and sniper positions engage at shorter range (rain −18 %, fog −45 %, night −25 %). UAV sensors already shrink in rain and fog (v12.0.17).
- Rain soaks the ground over about 20 s (darker and glossier) and it dries over about 45 s. On MEDIUM and up there are small splash puffs around the camera.
- Cyber hacks now hit real systems. Every hack (the v12.0 random pulse, or one you order) also takes one of the victim's systems offline for 15 s, on top of the existing radar blind: AA guns (theater AA and base AA positions stop firing), UAV links (drones keep orbiting but can't spot or fire, and the UAV panel shows LINK JAMMED), or comms (your tactical-map inset turns to static with a COMMS JAMMED label). Systems come back with a radio call.
- New Map → WAR SYSTEMS · WEATHER & CYBER panel. It shows the live modifiers, the ground wetness and every outage per side with countdowns. Counter-hack (5 intel) restores all your systems, radar included, and puts up a 30 s firewall that blocks the next intrusion. Cyber attack (8 intel, 60 s cooldown) knocks out one enemy system and blinds their radar. Both are paid from the war economy.
- All of this is the theater game layer (SIMULATED). It never touches market data, army counts, the price-driven front or data-truth labels. The market-driven frontline, Moon Shot, Commander, the v11.4 HUD/dock, Hide UI (which also hides the jam overlay), the v12.x systems and all `?flags` are unchanged. Kill switch: `?wxcombat=0` gives v12.0.17 behaviour.
- Version bump to v12.0.18 (BUILD, quality api, index tags, cache-bust `?v=20261018v12018`).
- Tested: `node --check` on all 78 JS files, asset-lifecycle 33/33, stabilization-smoke 15/15 (now also checks the wx-combat hooks), and headless HIGH / MEDIUM / LOW / iPhone 390×844 with 0 page errors. On every view the rain and fog modifiers matched the table, the ground soaked (roughness 0.97 → 0.60), an AA hack zeroed that side's AA, a UAV-link hack stopped your drone firing over the enemy fleet, a comms hack showed the jam overlay, Counter-hack spent 5 intel and cleared everything, the firewall blocked the next hack, Cyber attack spent intel and then held its 60 s cooldown, the random v12.0 pulse counted exactly once, and outages expired after 15 s. `?wxcombat=0` gave no panel and no modifiers. Screenshots in `docs/v12018-shots/`. SwiftShader only, so this isn't measured on a real iPhone/Mac yet.
- Build hours (real timestamps): day total so far 0.41 h before the cycle-2 deploy, under the 2–4 h target. The run continues.

## v12.0.17 — UAV recon & strike drones (2026-10-18, AI build)
- The v12.0 drones were grey boxes flying a fixed circle. New `js/theaters/uav.js` (`LUNCBattle.uav`) turns them into tasked recon/strike drones with their own procedural airframe (our own geometry): a long straight wing, slender fuselage, sensor ball under the nose, V-tail, a spinning pusher prop, a faction IFF stripe and nav lights with a strobe. They bank in turns. Callsigns are Reaper 1-1 / 1-2 (Bulls) and Shadow 2-1 / 2-2 (Bears).
- Tasking: each drone flies to a task point and orbits it at 30–36 m. Each side's AI re-tasks its drones every 25–40 s between the land front, enemy ships (the drone follows the ship), enemy supply depots and the enemy's forward defenses. You can task your side's nearest drone to the camera point with the `U` key or the new Map → WAR SYSTEMS · UAV panel (12 s cooldown). It confirms on the radio with a grid reference and drops a tactical-map ping.
- Sensor: a 36 m footprint (IR, so night doesn't cut it; fog ×0.6, rain ×0.8) spots enemy ships, jets on the apron, supply depots and base defenses. Contacts show as red SPOT triangles on the tactical map for 20 s, and the drone calls them in ("Reaper 1-1, contact. 1 carrier, 1 destroyer, grid G6-43."). The fog-of-war grid keeps taking drone vision, and a destroyed drone no longer gives vision.
- Strike: two missiles per sortie. When a spotted target is in range and the 40–60 s cooldown is up, the drone fires ("rifle, rifle"), the missile flies a visible smoke-trailed pursuit and hits through the existing theater strike path at small power, so ships, defenses, depots and parked jets take damage, and the drone calls "splash". The "UAV strike" button fires on the best spotted target in range. When both rails are empty it calls "winchester", flies back to its airbase, lands, rearms for 20 s and relaunches.
- Threat: enemy air defence can shoot a drone down when it orbits inside the envelope of the enemy airbase, base AA guns or sailing warships (a per-second chance, lower in fog and rain). It spirals down trailing smoke, crashes or splashes, and a replacement launches from its airbase 40 s later.
- The tactical map draws drones as air symbols labelled UAV, with your drones' sensor ring on the large map.
- Cost by tier: 1 drone per side on LOW and phones, 2 on MEDIUM and up. Missile smoke trails and nav lights are off on LOW. Brevity codes (rifle, splash, winchester) close one of the audio/radio realism gaps.
- All of this is the theater game layer (SIMULATED). It never touches market data, army counts, the price-driven front or data-truth labels. The market-driven frontline, Moon Shot, Commander, the v11.4 HUD/dock, Hide UI, the v12.x systems and all `?flags` are unchanged. Kill switch: `?uav=0` brings back the v12.0 orbiting drones.
- Version bump to v12.0.17 (BUILD, quality api, index tags, cache-bust `?v=20261018v12017`).
- Tested: `node --check` on all 77 JS files, asset-lifecycle 33/33, stabilization-smoke 14/14 (now also checks the uav wiring), and headless HIGH / MEDIUM / LOW / iPhone 390×844 with 0 page errors. On every tier a drone placed over the enemy fleet spotted ships and hit one (a destroyer went 80 → 66 hp), a forced shoot-down fell, crashed and relaunched about 45 s later, re-tasking worked by API and the `U` key, the cooldown held and the panel and map symbols rendered. A 150 s AI-only run gave 16 re-tasks, 22 contacts, 8 missiles, 2 rearm cycles and 2 losses. `?uav=0` gave the old orbiting boxes and no panel. Screenshots in `docs/v12017-shots/`. SwiftShader only, so this isn't measured on a real iPhone/Mac yet.
- Build hours (real timestamps): day total so far 0.23 h before the cycle-1 deploy, under the 2–4 h target. The run continues with more cycles.

## v12.0.16 — Tactical map (2026-10-17, AI build)
- The world-map inset is now a military-style tactical map. New `js/theaters/tacmap.js` (`LUNCBattle.tacmap`) replaces the 1–2 px coloured dots with APP-6-inspired symbols (our own drawing). Frames are set relative to your Commander side: your forces are rectangles and the enemy are diamonds, in faction colours. Ground units are grouped per map cell into one symbol per type: infantry ✕, armor ellipse, artillery dot, helicopter bow-tie. Echelon ticks (• •• ••• | || |||) show how many on-screen units each symbol stands for. Also on the map: air tracks with a heading line, ships as CV / BB / DD surface symbols, HQs with a staff, airbases (AB), supply depots (SUP, crossed out when destroyed), forts, supply-drop rings, and fog-of-war dimming with last-known ghosts.
- The front is drawn as a FLOT (forward line of own troops) with semicircles facing the enemy. The map header labels where it comes from: price LIVE / NOT LIVE. Unit positions are labelled SIMULATED, and the market data, armies and front are only read, never changed.
- Expand mode, the v12.1 "tactical minimap expand toggle": the ⤢ button on the inset, the `N` key, or "Open tactical map" in the Map sheet opens a large map (full screen on phones, where it opens on the Front zoom). It has World / Front zoom, a lettered grid (A–K × 1–7 in 50 m squares, refs like `F3-62`), a legend (?), a shortcut to the Map sheet (☰) and close (✕ / Esc, which closes the map without pausing the game). Tap or click flies the camera there, looking down on the spot; on phones the map then closes so you can see it. Long-press or right-click drops a ping: a pulsing ring on both maps with its grid ref, a fading 3D beacon in the world and a radio blip. Pings are game markers only.
- Crisp on retina: the inset canvas is backed at devicePixelRatio (cap 2). The inset draws at 4 Hz and the large map at about 8 Hz, only while it is open (2–5 ms at 1100 units on SwiftShader). Far units still show, because the map ignores LOD hiding. Hidden in Hide UI and cutscenes. Kill switch: `?tacmap=0` brings back the v12.0.15 dot inset.
- `LUNCBattle.theaters.flyToPoint(x, z, dist)` was added for the map's camera jumps.
- Version bump to v12.0.16 (BUILD, quality api, index tags, cache-bust `?v=20261017v12016`).
- Tested: `node --check` on all 76 JS files, asset-lifecycle 33/33, stabilization-smoke 13/13 (now also checks the tacmap wiring), and headless HIGH / MEDIUM / LOW / iPhone 390×844 with 0 page errors. The ⤢ button opens the map by click and by tap. Up to 345 symbols in the HIGH Front view. Pings place a ring and a beacon. Tap flew the camera to the tapped spot (75, −51) on LOW and on the phone. N toggles, and Esc closes without pausing. Hide UI hides both the map and the button. `?tacmap=0` gives the old 150 px dot inset with no button. Screenshots in `docs/v12016-shots/`.
- Build hours (real timestamps): day total so far 0.73 h at the cycle-2 deploy, under the 2–4 h target. The run continues.

## v12.0.15 — Realism pass, part 3: sea & air (2026-10-17, AI build)
- Ships now ride the waves. New `js/fx/realism-seaair.js` (`LUNCBattle.seaAir`) samples the same wave function the ocean shader uses at each hull's bow, stern and both beams. Hulls heave, pitch and roll through a damped roll spring: smaller ships roll more, a carrier barely moves, and there is a calm-sea swell on LOW, where the ocean surface is flat. Hulls now sit at a waterline in the water instead of floating on top of it.
- At the end of a patrol lane, ships sail a turning circle out to sea instead of flipping 180° on the spot. They heel outward and lose a little speed in the turn, then ease back onto their lane. On MEDIUM and up (not phones), each ship leaves a foam wake that rides the same waves (a bright turbulent stern trail plus faint Kelvin arms) and throws bow spray.
- Theater jets fly like aircraft. The Euler order is now yaw → pitch → roll in the airframe's own axes (the old "pitch" term spun around the world X axis). Jets bank in coordinated turns (`atan(V·ω/g)`, up to about 66°) and pitch with their climb rate. On the ground they face the way they are moving; they used to taxi out backwards.
- Takeoff and landing: a jet turns onto the runway before its roll, rotates at Vr and climbs out. On return to base it flies an initial point, then a final approach lined up with the runway, slows to approach speed, rides a glide slope with a flare and touches down only on the centreline (otherwise it goes around). It brakes on the rollout and taxis to its parking slot, with no mid-air 180° heading snap and no teleport to the apron. Carrier deck launches start from the moving, heaving deck.
- Materials: theater colours were sRGB hex values fed to three r128 as linear, so ships looked beige, the airbase tarmac pale grey and the sea washed-out teal. They are now converted, and the sea is a deeper blue-green (`?seaair=0` restores the old colours). Fixed ship turrets rendering white, because a `{}` material had been cached under the name 'dark'.
- Two world fixes for every tier: (1) the far ground skirt (y −0.55) showed through every ocean wave trough as gold striped discs across the whole sea; it is now cut out under the ocean. (2) The v10 scenery ridge rings (r 230 / 320) were sized for the old small field and cut through both airbases as a dark jagged wall, standing in the sea. They are now pushed out past the wide world, a bit taller, and lowered below the horizon over the ocean, so the south is an open-sea horizon.
- All of this is theater layer only (SIMULATED). The market-driven front, data-truth labels, Moon Shot, Commander, the v11.4 HUD/dock, Hide UI, the v12.x systems and all `?flags` are unchanged. Kill switch: `?seaair=0` (also off with `?realism=0`).
- Version bump to v12.0.15 (BUILD, quality api, index tags, cache-bust `?v=20261017v12015` on all 71 local css/js tags).
- Tested: `node --check` on all 75 JS files, asset-lifecycle 33/33, stabilization-smoke 12/12 (now also checks the realism-seaair load order), and headless HIGH / MEDIUM / LOW / iPhone 390×844 with 0 page errors (console errors are only localhost CoinGecko CORS). Offline sim of the approach logic from 5 start points: all touched down within 0.3 of the centreline and parked in 25–32 s, max bank 66°. In-page on LOW (23 fps): 5 U-turns that turned seaward and converged back onto the lanes, 4 approaches, 3 landings and 3 taxi-ins, ship roll ≤ 0.07 rad. `?seaair=0` gave the old Euler order, 0 wakes and 0 colour fixes. Before/after shots are in `docs/v12015-shots/`. SwiftShader only, so this isn't measured on a real iPhone/Mac yet.
- Build hours (real timestamps): day total so far 0.5 h at the time of the cycle-1 deploy, under the 2–4 h target. The run continues with more cycles.

## v12.0.14 — Realism pass, part 2: armies (2026-10-16, AI build)
- Armies wear real camo instead of pastel bodies. New `js/fx/realism-armies.js` (`LUNCBattle.armyRealism`) patches unit materials with an object-space procedural camo shader (three r128 `onBeforeCompile`, no UVs or textures needed): Bulls woodland / olive drab with brown and black blotches, Bears dark grey-green with tan. Dust on top faces, grime low on the hulls, and roughness rises with dirt. Applied to procedural soldiers, MBTs, SPGs and aircraft, the v11 GLB soldiers and vehicles (no more pink/mint faction tint), the theater squads, supply runners and barracks men, ragdoll/persistent bodies and the far-LOD stubs.
- Faction identity stays readable through small IFF markers: a faction-coloured roof panel (plus a glacis chevron on procedural MBTs) on vehicles, a shoulder band on infantry, and the existing coloured visor on GLB soldiers. Minimap, labels, base banners and HUD market colours are unchanged.
- Scale & spacing: MBTs ×1.45 and SPGs ×1.3 (uniform, so turrets don't shear). A 1.8 m soldier now stands about chest-high next to a tank. Vehicle formations are staggered ranks with 7–9 m lateral pitch and rank pitch longer than a hull, widened inside the land area (z −92…50) before they go deeper. Small armies (phone/LOW) form compact company blocks. A light separation pass keeps vehicles from stacking. The AI z-clamp (±15 m, which squeezed the wide front back into a clump) now keeps each unit near its own lane. Army counts, the price→X mapping and the frontline math are unchanged: slots are still offsets behind the live front.
- Motion: vehicles accelerate and brake (MBT 1.6 / 2.6 m/s², max 4.2 m/s; SPG slower), plan their stop and never overshoot the market-driven position. Hulls follow their travel direction with a max turn rate (MBT 0.55 rad/s) and back up instead of spinning around. Light suspension pitch/roll from slope and acceleration plus a bob on the move. Turrets slew toward a target at a max rate (0.65 rad/s). Infantry get per-soldier cadence and stride variety (procedural and GLB poses), so nobody marches in lockstep.
- Cost by tier: LOW/phone keep the instanced GLB path and get the flat camo base (the shader's noise branch is off), with motion math only. `?realism=0` restores the old pastel look, slots and motion (it also still disables the v12.0.13 realism pass).
- Same-day fix after the first live check: the procedural (pre-GLB / `?v11=0`) camo was washed out to pink-white on Bears, because the palette went in as raw hex where three r128 expects linear colours. Palette, body and stub colours are now converted from sRGB, and the far-LOD stubs are darker and 50 % transparent.
- Version bump to v12.0.14 (BUILD, quality api, index tags, cache-bust `?v=20261016v12014b` on every local css/js tag, including the three that were still on `20261010v111`).
- Tested: `node --check` on all JS (69 files), asset-lifecycle 33/33, stabilization-smoke (now also checks realism-armies wiring), headless HIGH / MEDIUM / LOW / iPhone 390×844 with 0 page errors. In-page feature checks: camo materials patched with 0 pastel unit meshes left, 0 vehicle footprint overlaps in the 121-tank slot layout (min centre 5.1 m), accel cap (max 4.2 m/s, no overshoot), turn and slew caps held exactly, pitch/roll clamped, gait spread 0.84–1.16, and `?realism=0` back to pastel and classic slots. Before/after screenshots in `docs/v12014-shots/`. SwiftShader only, so this isn't measured on a real iPhone/Mac yet.

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
