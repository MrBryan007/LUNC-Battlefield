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

## v12.1 "War Systems"
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
