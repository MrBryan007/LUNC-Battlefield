# LUNC Battlefield — v12 Roadmap

All theater activity is a **game/sim layer**. It never alters market data, army counts or the frontline. Market-weighted signals (army ratio → naval tempo, |momentum| → sortie rate) are labelled **ESTIMATED · SIMULATED**. `?theaters=0` restores the v11.4 ground-only battlefield.

## v12.0 "Theaters of War" (shipped)
Solid:
- Wide world (x ±260, z −120…230) with a free camera: pan, orbit, zoom to 320; Q/E rotate; O overview; Map sheet theater bar (Ground / Naval / Air W / Air E / Bull HQ / Bear HQ / Overview + Tour).
- Ocean with a wave shader, beach and foam. Destroyers, battleships and a carrier (ULTRA/HIGH) trade broadsides, sink into hulks and respawn after 45 s.
- Airbases with runways, hangars, tower, radar and AA. Jets taxi, take off, fight (missiles and flares), return and land, or get shot down into persistent wrecks. Supply convoys.
- BREAKING ticker (Intel sheet). Tier caps from LOW to ULTRA. Far sim LOD at 4 Hz.
- v11.4 HUD dock unchanged.

**BASIC in v12.0** (to be deepened in v12.1):
- **UAV drones**: orbit only; they don't spot or strike (they give vision only when fog of war is on). *Deepened in v12.0.17.*
- **Submarines**: one per side, surfacing to periscope depth with a torpedo ambush on the nearest enemy ship. No sonar and no ASW. *Deepened in v12.0.20.*
- **ICBM silos**: an occasional *inert test launch* arcing into the ocean. Cosmetic only, with no damage.
- **Cyber layer**: a periodic screen-glitch pulse and a radio message (SIMULATED). No gameplay effect. *Deepened in v12.0.18.*
- **Weather**: Clear / Rain / Fog toggle (rain particles and a shorter fog range). Weather doesn't affect combat. *Affects combat since v12.0.18.*
- **Day/night**: optional 4-minute light cycle (sun and hemi intensity plus a night tint).
- **Extra sector**: a northern ridge of scenery mountains. Not playable terrain. *Playable since v12.0.21 (Hill 402).*
- **Sound/music**: the existing WebAudio SFX and ambience, a volume slider, and an adaptive drone pad that follows combat intensity. No jet Doppler yet.
- **Minimap**: an always-on world inset (front, bases, ships, jets, camera wedge); tap it to open Map. No expand mode.
- **Fog of war**: Spectator full vision is **ON by default**. When it's off, enemy ships, jets and subs outside friendly territory or out of UAV/jet range are hidden, with an edge-darkening overlay. There's no per-cell grid.
- Toggles: Settings sheet → WORLD.

## v12.0.12 "Base invasions" (shipped 2026-10-15)
Deepened HQ base defense and assault: firing defenses, wrecks + fuel rebuild, barracks respawn, AI assaults + player Raid, siren/sfx + voice ALERT, WAR SYSTEMS status panel, breach score reward. Kill switch `?invasion=0`. PRs #9–#13 stabilization / look / war-zone / lived-in marks folded into this version bump.


## v12.0.13 "Realism pass, part 1" (shipped 2026-10-15)
Soft frontline scars/smoke (no black strip), layered explosions, SOS-delayed far blasts, camo/PBR wear on invasion bases, gravity ballistic arcs for shells/arty, muzzle/fire lights. Kill switch `?realism=0`.

**Still open for later realism passes (checklist gaps):**
- **Scale & spacing:** soldier/MBT/carrier real-world proportions; formations still a bit clumped on LOW; base roads/revetments incomplete.
- **Materials:** authored GLB unit/vehicle skins (current models are procedural boxes); dirt/wear maps on ground units and vehicles; ~~wet shoreline PBR~~ (v12.0.38).
- **Lighting & atmosphere:** dynamic sun-angle shadows on LOW-safe path; volumetric light shafts; better day/night color temperature around bases.
- **Terrain:** ~~height-aware tracks that persist under vehicles~~ (shipped v12.0.36, `js/fx/tracks.js`, `?tracks=0`); ~~shoreline foam upgrade~~ (shipped v12.0.38, `js/fx/shoreline.js`, `?shore=0`: rolling breakers, swash, wet sand, no more swell cutting through the beach); less z-fighting on trench berms.
- **Motion & physics:** ~~vehicle suspension bob~~ (v12.0.14); aircraft banking on turns; ship roll in waves; ragdoll weight tweaks.
- **Combat behavior:** cover usage, suppression, bounding overwatch, flanking already partly in squads — deepen retreat/medic ranges.
- **FX:** tracer 1-in-5 everywhere (partial); ~~fires that burn out over minutes~~ (shipped v12.0.19, `js/fx/fires.js`, `?fires=0`); persistent wreck LODs further out.
- **Audio & radio:** ~~Doppler on more than jets~~ and ~~positional gunfire HRTF-ish pan~~ (shipped v12.0.39, `js/sfx.js`, `?spatial=0`: stereo position, head shadow, air absorption, speed-of-sound delay, Doppler whoosh); ~~authentic brevity codes~~ (shipped v12.0.40, `js/theaters/brevity.js`, `?brevity=0`: air-to-air brevity from real dogfight events, call-for-fire procedure, glossary in the radio log).
- **UI:** NATO-ish map symbols on the world inset; less pastel unit silhouettes on the minimap (3D units are camo since v12.0.14).

## v12.0.14 "Realism pass, part 2: armies" (shipped 2026-10-16)
Camo PBR materials (object-space shader: Bulls woodland/olive drab, Bears grey-green/tan, dust + grime, roughness) on all ground units, aircraft, GLB layers and theater figures. Faction IFF roof panels / shoulder bands. MBT ×1.45 / SPG ×1.3, staggered vehicle ranks (7–9 m pitch, no overlap), separation, wide-lane AI z-clamp. Vehicle accel/brake/turn-rate limits, suspension pitch/roll/bob, turret slew, infantry gait variety. LOW/phone get the flat camo base. Kill switch `?realism=0`.

**Still open after part 2:**
- **Scale:** MBTs are about 4.4 m long against a 1.8 m soldier (a real one is about 10 m). Going further needs an authored MBT model with real proportions, because uniform scaling of the stubby procedural/GLB hulls makes them too tall. The GLB soldier is still 1.25 m against the 1.85 m procedural one. At HIGH counts (121 MBT + 66 SPG per side) the formations reach about 75 m behind the front.
- **Motion:** GLB (v11) tanks are merged meshes, so their turrets can't slew (procedural tanks do). There's no track/wheel slip, and units don't take terrain-aware routes around obstacles.
- **Materials:** camo is shader noise, not authored skins. There are no decals (numbers, mud splatter maps) and no wet/muddy variation by weather.
- From part 1: dynamic sun-angle shadows on LOW, ~~terrain tracks that persist under vehicles~~ (v12.0.36), shoreline foam, aircraft banking, ship roll, fires burning out over minutes, Doppler, brevity codes, NATO-ish minimap symbols.

## v12.0.15 "Realism pass, part 3: sea & air" (shipped 2026-10-17)
Ship heave/pitch/roll from the ocean wave function, turning circles at lane ends, foam wakes + bow spray (MEDIUM+), jet bank/pitch in the airframe's axes, runway line-up, approach → glide slope → flare → rollout → taxi-in, sRGB-correct theater colours and a deeper sea. Fixed the skirt showing through wave troughs (gold discs) and the v10 ridge ring cutting through the airbases. Kill switch `?seaair=0`.

**Still open after part 3:**
- **Scale:** the carrier is 22 m against a 1.8 m soldier (a real one is about 330 m). Ship and airbase scale is still "toy" relative to the infantry; it needs a dedicated naval scale pass (camera, lanes and sim ranges all scale with it).
- **Aircraft:** ~~no landing gear, no carrier traps (deck jets RTB to the airbase)~~ shipped v12.0.33 (`js/fx/air-ops.js`, `?airops=0`: retracting gear, tailhook, afterburner/throttle model, beacon, bow catapult with steam, carrier racetrack → glide slope → trap / bolter / wave-off → deck spot → struck below, divert when the carrier sinks). ~~AA kills are still a random roll~~ shipped v12.0.34 (`js/fx/flak.js`, `?flak=0`: leading AA guns, ballistic shells with time + proximity fuzes, fragment damage, jet hit points with smoke and break-off; HQ base AA now fires flak too). ~~SAM sites / radar-guided missiles~~ shipped v12.0.37 (`js/fx/sam.js`, `?sam=0`: a battery by each airbase and behind each HQ on MEDIUM+, search + fire-control radars and a 4-round launcher, lock time hurt by weather/night/cyber, proportional-navigation missiles with proximity fuzes, chaff and notching, SAM symbols on the tactical map). Still open: flaps/slats animation.
- **Sea:** ~~no foam on wave crests and shoreline breakers are a pulsing strip~~ shipped v12.0.38 (`js/fx/shoreline.js`, `?shore=0`: crest whitecaps, shallow-water shading, rolling breakers and swash, wet sand). ~~No ship smoke stacks or exhaust~~ shipped v12.0.30 (`js/fx/naval-detail.js`, `?navdetail=0`: funnels with exhaust, masts with rotating radar, boot-top bands, AA mounts, lifeboats and carrier deck markings).
- Defenses realism pass shipped v12.0.26 (`?fortfx=0`: weathered concrete, faction camo, sandbag courses, Jersey barriers, turret slew limits, slit arcs, muzzle flash, recoil, delayed distance sound). Damage and destruction shipped v12.0.27 (`?fortdmg=0`: blast damage, scorch / wreck, squad suppression, AI mortar missions, Repair and Mortars-on-fort). Crews and combat engineers shipped v12.0.29 (`?fortcrew=0`: a gunner on each turret and a sentry behind each bunker who duck when suppressed; Repair walks a two-man engineer team out who can be killed on the way).
- Carried over: ~~fires that burn out over minutes~~ (v12.0.19), ~~Doppler on more than jets~~ (v12.0.39), ~~brevity codes~~ (v12.0.40), ~~persistent terrain tracks~~ (v12.0.36). (NATO-ish map symbols shipped in v12.0.16.)

## v12.1 "War Systems"
**Shipped so far (v12.0.1, 2026-10-13, part 1):** supply drops. Cargo planes, parachute crates with colored smoke, a ground ring and a world-map ping. Fuel / ammo / intel / power-up contents. One AI squad per side races to each crate, with a capture ring and a CONTESTED state. Per-side tally in Map → WAR SYSTEMS. The Commander can call a drop (60 s cooldown). For the Commander's side: intel lifts fog of war around the zone for 30 s, ammo cuts active cooldowns by 30 % (stand-in until reinforcement waves exist), power-up adds +25 Moon Shot charge. `?supply=0` turns it off. Fuel is banked but not spent yet (needs the resource economy / tech tree slice).

Remaining in v12.1:
- RTS base building and upgrades. Resources: fuel, ammo and intel. Tech tree.
- Squad commands with cover and flanking. Bunkers, turrets and walls. Supply lines that can be cut. Reinforcement waves.
- ~~Power-ups and score multipliers.~~ Shipped v12.0.42 (`js/theaters/powerups.js`, `?powerups=0`: Double Points, Rapid Reload, Combo Lock and Moon Fuel from power crates and field beacons; the combo was already a score multiplier). ~~Realistic ballistics and line of sight. Terrain affects movement and combat.~~ Shipped for the squads in v12.0.23 (`js/theaters/los.js`, `?los=0`: line of sight against terrain, the ridge, walls and bunkers; a range / high-ground / cover / weather hit model; casualties, fall-back and wipe-out with a fresh squad from HQ; slope-aware pace). v12.0.25 added it for fort turrets / bunkers (which now also engage and wound enemy squads) and the Hill 402 teams. ~~LOS for the market-army tanks~~ shipped v12.0.43 (`js/theaters/army-los.js`, `?armylos=0`: rifles and MBTs engage visible enemies or hold fire, SPGs scatter without a spotter).
- **Market compatibility:** the market sets the reinforcement budget and resource income. Player choices never alter market data.
- **Supply drops:** cargo planes drop parachute crates into drop zones marked with smoke and a map ping. Contents are fuel, ammo, intel or a power-up. AI squads race to capture them (progress ring, contested state). The Commander can call one in. An intel drop reveals the area; an ammo drop speeds up the next wave.
- **Sound design and music:** WebAudio SFX scaled by size, jet Doppler, gunfire, radio blips, ambient wind/ocean/rain, adaptive music layers, mute, a volume slider, iOS unlock-on-tap and distance attenuation.
- ~~**Tactical minimap:** always-on inset with an expand toggle, unit dots and pings.~~ Shipped v12.0.16 (`js/theaters/tacmap.js`, `?tacmap=0`): APP-6-style symbols, FLOT, expand mode with grid, legend, fly-to and pings. ~~Orders/arrows on the map and squad selection from the map~~ shipped v12.0.22 (⚑ Orders mode: tap a squad, tap the map to move it; Move / Flank / Hold / Cover; own routes drawn solid / dashed / dotted; 3D route line).
- **Fog of war:** a per-faction visibility grid, reveals from UAVs, flares and radar, ghosted last-known enemies, shader darkening (cheap on LOW), and vision reduced by weather, night and cyber. Spectator full-vision toggle.
- Deepen the basic v12.0 items: ~~drone spotting/strikes~~ (shipped v12.0.17, `js/theaters/uav.js`, `?uav=0`: tasked orbits, sensor spotting with SPOT markers, two missiles per sortie, RTB/rearm, AA shoot-downs, Commander tasking with `U`), ~~sub sonar/ASW~~ (shipped v12.0.20, `js/theaters/asw.js`, `?asw=0`: procedural attack subs that patrol, stalk, fire from periscope depth and evade; passive + active sonar contacts; ASROC and depth-charge attacks; noisemakers and torpedo decoys; SSN symbols on the tactical map; Commander Sonar ping and Sub: hunt here with `J`), ~~cyber effects on radar/AA~~ and ~~weather affecting accuracy~~ (shipped v12.0.18, `js/theaters/wx-combat.js`, `?wxcombat=0`: weather/night modifiers on gunnery, AA, IR missiles and direct-fire range; hacks knock out AA, UAV links or comms for 15 s; Counter-hack and Cyber attack in Map → WAR SYSTEMS), and ~~a playable ridge sector~~ (shipped v12.0.21, `js/theaters/ridge.js`, `?ridge=0`: a real ridge north of the battle with the Hill 402 OP, mountain fire teams that climb, fight and capture, +1 intel / 10 s and OP vision for the holder, Reinforce and Fire mission (`K`) in Map → WAR SYSTEMS, a Ridge quick-jump and tactical-map symbols). With this, every "deepen the basic v12.0 items" entry has shipped.

## v12.2 Multiplayer
- ~~**Hot-seat first:** turn handoff or split control, a camera and fog per player, and a pass-the-device screen.~~ Part 1 shipped v12.0.31 (`js/ui/hotseat.js`, `?hotseat=0` / `?hotseat=1`): Bulls vs Bears turns of 60–120 s for 2–5 rounds, per-player Commander session, cooldowns and camera, fog follows the active side, opaque pass-the-device screen, results. Part 2 shipped v12.0.35: player names, Swap sides, each player keeps their own orders (`commander.useMission`), tie-break on orders then hits, match history on the device. Still open: split control (both at once).
- **Online:** WebRTC P2P with free signaling (PeerJS, or copy-paste SDP as a fallback). Host-authoritative, with command sync (not state streaming). The host fetches market data and broadcasts it so both players see the same battle.
- **Risks:** NAT traversal fails on some networks (symmetric NAT) without a TURN server, and free TURN is scarce. A host-authoritative model still lets the host cheat, and clients can't be trusted. Latency or jitter calls for command delay and buffering. GitHub Pages has no backend, so we can't offer matchmaking or anti-cheat.

## v12.3
- Mission editor: part 1 shipped v12.0.44 (`js/ui/mission-editor.js`, `?editor=0`: chains of 1-5 timed objectives run through the ORDERS card, presets, 6 saved missions with best times, `?mission=` share links with validation). Part 2 shipped v12.0.45: Hold a point / Strike a point on four map points with a 3D ring + beam, tactical-map ping and a SEND SQUAD chip; start conditions (weather, time of day, side) applied on Play and restored after. Still open: escort a convoy objective and a fuller mission browser. ~~Achievements and unlocks~~ (part 1 shipped v12.0.24, `js/ui/achievements.js`, `?ach=0`: 19 achievements saved on the device, unlock toasts, a service-record rank from Recruit to General in the Cmd sheet; part 2 shipped v12.0.28, `?cosmetics=0`: 3 fort achievements (22 total, General of the Army) and rank-unlocked procedural camo for your bunkers and turrets; part 3 shipped v12.0.32, `?banners=0`: HQ flagpoles with waving cloth banners and six rank-unlocked banner designs for your HQ; part 4 shipped v12.0.41, `?squadkits=0`: rank-unlocked squad specialists (marksman, machine gunner, medic, engineer with foxholes, veteran) chosen per squad). A replay system: part 1 shipped v12.0.46 (`js/ui/replay.js`, `?replay=0`): a recorded after-action replay of the last 10 minutes (front with its data-truth label, sampled units, squads, strikes, orders), with a top-down viewer, front chart, scrubber, speeds, event list with fly-to, 2 saves and .json export. An exact deterministic re-simulation (command log plus RNG seed) isn't possible while live market data and randomised systems drive the battle. Still open: import a .json replay, share links, camera-follow playback in 3D.
