# Variant: Belt

Preset in the debug panel: **Belt**. Hash: `#belt`.

## What this preset sets

- Haul: belt, plus hands (cap 8).
- A belt is dug into the lawn from x 36 cm to x 210 cm, one cell deep. Each belt cell is an entity. Loose sand taken from the sandbox bed (14 cells) starts on that belt.
- Kit: 30 belt cells. L places one in the facing air cell. Facing sets the belt direction. E picks a belt cell back up.
- Belts step at 10 cells/s and only move loose mass. Water off, heat off, craft off, full simulation, 1 shaft, 1 cm cells, zoom 5, time scale 1×.

## How to run

Open `prototype/index.html#belt`.

## Where the numbers show

HUD `entities` includes every belt cell. `spoil/s` is the belt traffic plus any dump. `px dug/s` stays 0 until you dig. `mass Δ` is the conservation check.

## Observed

Same Chrome session (1820×1013, 12 Nov 2026).

- At spawn: cells 460800, solid 360984, water 1960, entities 177 (player, cart, 175 belt cells), mass Δ 0.
- After about 1 s in Chrome: fps 60, spoil/s 135.5, px dug/s 0, mass Δ 0, depth 22 cm. The seeded sand was riding the belt.

## Feel

## Keep / drop / iterate
