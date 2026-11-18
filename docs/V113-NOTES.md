# v11.3 — heavy weapons, Mini Nuke cinematic, 500 units, damage/debris, persistence, medics
Everything here is game FX only. Market data, army ratio and frontline are unchanged. Strikes are labelled as player strikes.

## Controls
1–6 base row (unchanged). ` or the HEAVY button toggles the heavy row:
7 MOAB (45s) · 8 Cluster Bombs (20s) · 9 Napalm (24s) · 0 Gas (18s) · - A-10 (16s) · = Mini Nuke (charge: +2.5% per hit, needs 100%).
Skip the cutscene with click/tap/Space/Esc/Enter. Mobile: the heavy row is a 3-column grid above the bar.

## Modules
- js/fx/heavy-fx.js: flybys (bomber, jet, A-10), fire and gas zones, mushroom cloud, tracers. Pooled, with tier caps.
- js/fx/cutscene.js: Mini Nuke cinematic (launch, descent, flash, fireball+ring, title card). About 8 s on HIGH, about 4.9 s on LOW/mobile.
- js/fx/damage.js: instanced debris (caps U300/H180/M80/L20), unit HP states (smoke → fire → wreck), popped turrets, building damage (overlays + missing chunks + squashed rubble).
- js/fx/persist.js: static ring-buffer batches for wrecks, debris and bodies (U400/1500/300, H250/900/200, M120/400/100, L40/100/30). When a batch is full, its oldest item becomes a scorch decal plus a rubble pile.
- js/ai/medics.js: medics (?medics=0), wounded → "Medic!", officers first, avoids fire/gas zones, treat, stretcher teams to the CCP.
- units.js/battle-engine.js: ground budget 500/250/110 by tier (?units=N), split by market walls. Formations stack in ranks.
