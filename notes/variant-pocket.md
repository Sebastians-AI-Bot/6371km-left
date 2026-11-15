# Variant: Pocket

Preset in the debug panel: **Pocket**. Hash: `#pocket`.

## What this preset sets

- Haul: pocket. Dug cells go into a pocket drawn on the body, not into the hands.
- Cap 3. That is tighter than Hand (8) and Bucket (32).
- When the pocket is full, the next cell spills to the surface heap (column x = 264). It is not deleted.
- Dig feel: hold, same as Hand. Sand shovel time 0.08 s. Walk speed 80 cm/s.
- Same garden as Hand. Water off, heat off, craft off, zoom 8, 1 cm cells.

## How to run

Open `prototype/index.html#pocket`.

Hold F or the mouse to dig. The pocket pips on the body fill, up to 3. G dumps the pocket into a heap.

## Where the numbers show

HUD line `pocket n/3`. `hands` stays 0/8 while you dig. `spoil/s` counts a dump and any spill after the pocket is full. `mass Δ` counts the pocket.

## Observed

Headless Chrome, 15 Nov 2026. Not a feel note.

- At rest: cells 460800, entities 2, depth 22 cm, mass Δ 0. Same slice as Hand (solid 362209, water 1960). fps 60 on that slice in this session.
- Holding S and F for 0.8 s dug 9 cells. The pocket stopped at 3. Hands stayed 0. Status: “pocket full, spilled”. mass Δ 0.
- G then reported “pocket dumped 3” and the pocket returned to 0. mass Δ 0.

## Feel

## Keep / drop / iterate
