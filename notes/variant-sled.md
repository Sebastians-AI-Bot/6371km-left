# Variant: Sled

Preset in the debug panel: **Sled**. Hash: `#sled`.

## What this preset sets

- Haul: sled. A 14 cm × 8 cm sled starts just left of the player, in the pit. Dug cells go into the sled when it is within 10 cm of the body. Otherwise the cell drops into the pile beside you.
- Cap 48. That is roomier than Bucket (32) and smaller than the cart (120). The sled is not the cart and not the belt. The lawn cart is still in the slice and is not this haul.
- The sled follows the side you walked away from, at 56 cm/s. Walk speed is 80 cm/s, so it lags. It stops at solid cells.
- Dig feel: hold. Sand shovel time 0.08 s. G dumps the sled.
- Same garden as Hand. Water off, heat off, craft off, zoom 8, 1 cm cells.

## How to run

Open `prototype/index.html#sled`.

Stand beside the sled. Hold F or the mouse to load it. Walk with A/D. The sled trails behind. G dumps it.

## Where the numbers show

HUD line `sled n/48`. `entities` is 3: player, cart, sled. `spoil/s` counts a dump. `mass Δ` counts the sled’s cells.

## Observed

Headless Chrome, 15 Nov 2026. Not a feel note.

- At rest: cells 460800, entities 3, depth 22 cm, mass Δ 0. The grid matches Hand (solid 362209, water 1960). fps 60 on that slice in this session.
- Holding S and F for 0.5 s put 6 sand cells in the sled. Hands stayed 0. mass Δ 0.
- Then D for 0.6 s. The player moved to x 413. The sled moved from x 350 to x 383.6 (about 56 cm/s) and was 29 cm behind, outside the 10 cm load reach.
- G reported “sled dumped 6” and the sled returned to 0. mass Δ 0.

## Feel

## Keep / drop / iterate
