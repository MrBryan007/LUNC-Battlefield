#!/usr/bin/env bash
# Re-download the v12 starter CC0 skins from Poly Pizza (URLs taken from each model page, 2026-10-12).
set -euo pipefail
cd "$(dirname "$0")/../assets/models/v12"
curl -fsSL -o helicopter.glb      https://static.poly.pizza/e3dfeb10-5525-4a39-83d8-13a709aaca4b.glb  # kazuma "Helicopter" CC0
curl -fsSL -o radar.glb           https://static.poly.pizza/ac218d89-a903-4cc1-aa32-bd70262cda76.glb  # Quaternius "Roof Radar" CC0
curl -fsSL -o watchtower.glb      https://static.poly.pizza/8bec6466-329a-4f83-99d9-600a00e2c437.glb  # Quaternius "Small Watch Tower" CC0
curl -fsSL -o sack_trench_raw.glb https://static.poly.pizza/00e71997-0e9f-4083-9507-3935639996c7.glb  # Quaternius "Sack Trench Small" CC0
npx -y gltfpack@0.21 -i sack_trench_raw.glb -o bunker_sandbag.glb -si 0.35 -noq && rm sack_trench_raw.glb
ls -la
