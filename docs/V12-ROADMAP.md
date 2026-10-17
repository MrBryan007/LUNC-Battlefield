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
- **UAV drones**: orbit only; they don't spot or strike (they give vision only when fog of war is on).
- **Submarines**: one per side, surfacing to periscope depth with a torpedo ambush on the nearest enemy ship. No sonar and no ASW.
- **ICBM silos**: an occasional *inert test launch* arcing into the ocean. Cosmetic only, with no damage.
- **Cyber layer**: a periodic screen-glitch pulse and a radio message (SIMULATED). No gameplay effect.
- **Weather**: Clear / Rain / Fog toggle (rain particles and a shorter fog range). Weather doesn't affect combat.
- **Day/night**: optional 4-minute light cycle (sun and hemi intensity plus a night tint).
- **Extra sector**: a northern ridge of scenery mountains. Not playable terrain.
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
- **Materials:** authored GLB unit/vehicle skins (current models are procedural boxes); dirt/wear maps on ground units and vehicles; wet shoreline PBR.
- **Lighting & atmosphere:** dynamic sun-angle shadows on LOW-safe path; volumetric light shafts; better day/night color temperature around bases.
- **Terrain:** height-aware tracks that persist under vehicles; shoreline foam upgrade; less z-fighting on trench berms.
- **Motion & physics:** ~~vehicle suspension bob~~ (v12.0.14); aircraft banking on turns; ship roll in waves; ragdoll weight tweaks.
- **Combat behavior:** cover usage, suppression, bounding overwatch, flanking already partly in squads — deepen retreat/medic ranges.
- **FX:** tracer 1-in-5 everywhere (partial); fires that burn out over minutes; persistent wreck LODs further out.
- **Audio & radio:** Doppler on more than jets; authentic brevity codes; positional gunfire HRTF-ish pan.
- **UI:** NATO-ish map symbols on the world inset; less pastel unit silhouettes on the minimap (3D units are camo since v12.0.14).

## v12.0.14 "Realism pass, part 2: armies" (shipped 2026-10-16)
Camo PBR materials (object-space shader: Bulls woodland/olive drab, Bears grey-green/tan, dust + grime, roughness) on all ground units, aircraft, GLB layers and theater figures. Faction IFF roof panels / shoulder bands. MBT ×1.45 / SPG ×1.3, staggered vehicle ranks (7–9 m pitch, no overlap), separation, wide-lane AI z-clamp. Vehicle accel/brake/turn-rate limits, suspension pitch/roll/bob, turret slew, infantry gait variety. LOW/phone get the flat camo base. Kill switch `?realism=0`.

**Still open after part 2:**
- **Scale:** MBTs are about 4.4 m long against a 1.8 m soldier (a real one is about 10 m). Going further needs an authored MBT model with real proportions, because uniform scaling of the stubby procedural/GLB hulls makes them too tall. The GLB soldier is still 1.25 m against the 1.85 m procedural one. At HIGH counts (121 MBT + 66 SPG per side) the formations reach about 75 m behind the front.
- **Motion:** GLB (v11) tanks are merged meshes, so their turrets can't slew (procedural tanks do). There's no track/wheel slip, and units don't take terrain-aware routes around obstacles.
- **Materials:** camo is shader noise, not authored skins. There are no decals (numbers, mud splatter maps) and no wet/muddy variation by weather.
- From part 1: dynamic sun-angle shadows on LOW, terrain tracks that persist under vehicles, shoreline foam, aircraft banking, ship roll, fires burning out over minutes, Doppler, brevity codes, NATO-ish minimap symbols.

## v12.0.15 "Realism pass, part 3: sea & air" (shipped 2026-10-17)
Ship heave/pitch/roll from the ocean wave function, turning circles at lane ends, foam wakes + bow spray (MEDIUM+), jet bank/pitch in the airframe's axes, runway line-up, approach → glide slope → flare → rollout → taxi-in, sRGB-correct theater colours and a deeper sea. Fixed the skirt showing through wave troughs (gold discs) and the v10 ridge ring cutting through the airbases. Kill switch `?seaair=0`.

**Still open after part 3:**
- **Scale:** the carrier is 22 m against a 1.8 m soldier (a real one is about 330 m). Ship and airbase scale is still "toy" relative to the infantry; it needs a dedicated naval scale pass (camera, lanes and sim ranges all scale with it).
- **Aircraft:** no landing gear or flaps animation, no carrier traps (deck jets RTB to the airbase), and AA kills are still a random roll rather than a fuze/proximity model.
- **Sea:** no foam on wave crests, shoreline breakers are a pulsing strip, and there are no ship smoke stacks or exhaust.
- Carried over: fires that burn out over minutes, Doppler on more than jets, brevity codes, NATO-ish minimap symbols, persistent terrain tracks.

## v12.1 "War Systems"
**Shipped so far (v12.0.1, 2026-10-13, part 1):** supply drops. Cargo planes, parachute crates with colored smoke, a ground ring and a world-map ping. Fuel / ammo / intel / power-up contents. One AI squad per side races to each crate, with a capture ring and a CONTESTED state. Per-side tally in Map → WAR SYSTEMS. The Commander can call a drop (60 s cooldown). For the Commander's side: intel lifts fog of war around the zone for 30 s, ammo cuts active cooldowns by 30 % (stand-in until reinforcement waves exist), power-up adds +25 Moon Shot charge. `?supply=0` turns it off. Fuel is banked but not spent yet (needs the resource economy / tech tree slice).

Remaining in v12.1:
- RTS base building and upgrades. Resources: fuel, ammo and intel. Tech tree.
- Squad commands with cover and flanking. Bunkers, turrets and walls. Supply lines that can be cut. Reinforcement waves.
- Power-ups and score multipliers. Realistic ballistics and line of sight. Terrain affects movement and combat.
- **Market compatibility:** the market sets the reinforcement budget and resource income. Player choices never alter market data.
- **Supply drops:** cargo planes drop parachute crates into drop zones marked with smoke and a map ping. Contents are fuel, ammo, intel or a power-up. AI squads race to capture them (progress ring, contested state). The Commander can call one in. An intel drop reveals the area; an ammo drop speeds up the next wave.
- **Sound design and music:** WebAudio SFX scaled by size, jet Doppler, gunfire, radio blips, ambient wind/ocean/rain, adaptive music layers, mute, a volume slider, iOS unlock-on-tap and distance attenuation.
- **Tactical minimap:** always-on inset with an expand toggle, unit dots and pings.
- **Fog of war:** a per-faction visibility grid, reveals from UAVs, flares and radar, ghosted last-known enemies, shader darkening (cheap on LOW), and vision reduced by weather, night and cyber. Spectator full-vision toggle.
- Deepen the basic v12.0 items: drone spotting/strikes, sub sonar/ASW, cyber effects on radar/AA, weather affecting accuracy, and a playable ridge sector.

## v12.2 Multiplayer
- **Hot-seat first:** turn handoff or split control, a camera and fog per player, and a pass-the-device screen.
- **Online:** WebRTC P2P with free signaling (PeerJS, or copy-paste SDP as a fallback). Host-authoritative, with command sync (not state streaming). The host fetches market data and broadcasts it so both players see the same battle.
- **Risks:** NAT traversal fails on some networks (symmetric NAT) without a TURN server, and free TURN is scarce. A host-authoritative model still lets the host cheat, and clients can't be trusted. Latency or jitter calls for command delay and buffering. GitHub Pages has no backend, so we can't offer matchmaking or anti-cheat.

## v12.3
- Mission editor. Achievements and unlocks. A replay system (command log plus RNG seed, played back deterministically).
