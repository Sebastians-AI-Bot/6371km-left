# Variant: Bucket

Preset in the debug panel: **Bucket**. Hash: `#bucket`.

## What this preset sets

- Haul: bucket. Carry cap 32 cells. Walk speed used by the sim: 48 cm/s.
- Same garden as Hand: water off, heat off, craft off, full simulation, 1 shaft, 1 cm cells, zoom 8, depth in cm, volume off, time scale 1×.

Dig times do not change with the bucket. The shovel times are sand 0.08 s, soil 0.22 s, soft rock 0.55 s, hard rock 1.3 s, ore 0.9 s.

## How to run

Open `prototype/index.html#bucket`.

F1, then Bucket, rebuilds the slice. The Haul control under Live switches hand / bucket / cart / belt without a rebuild.

## Where the numbers show

Same HUD as Hand. `carry` reads `n/32` in this preset. `px dug/s` and `spoil/s` are the rates. `mass Δ` is the conservation check.

## Observed

Same Chrome session as the other notes (1820×1013, 12 Nov 2026).

- At rest, about 0.7 s after boot: fps 60, cells 460800, solid 362209, water 1960, entities 2, depth 22 cm, mass Δ 0.
- No separate dig-rate trial was run on this preset. The sand shovel time is the same 0.08 s as Hand. The cap on the HUD is 32.

## Feel

## Keep / drop / iterate
