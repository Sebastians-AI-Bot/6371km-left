# Variant: Heap

Preset in the debug panel: **Heap**. Hash: `#heap`.

## What this preset sets

- Haul: heap. A dug cell does not enter the hands or the pocket. It is spilled as loose cells beside the body, and the fall pass stacks them into a pile.
- If that pile cannot take the cell, it goes to the surface heap instead. Nothing is deleted.
- Dig feel: hold. Sand shovel time 0.08 s. Walk speed 80 cm/s.
- Same garden as Hand. Water off, heat off, craft off, zoom 8, 1 cm cells.
- G has nothing to dump, because the hands stay empty.

## How to run

Open `prototype/index.html#heap`.

Hold F or the mouse while facing the sand. The pile grows beside you. Loose cells fall.

## Where the numbers show

HUD line `heap drop`. `hands` stays 0/8. `px dug/s` is cells removed. `spoil/s` counts cells that moved into the pile. `mass Δ` includes those loose cells.

## Observed

Headless Chrome, 15 Nov 2026. Not a feel note.

- At rest: cells 460800, entities 2, depth 22 cm, mass Δ 0. Same slice as Hand.
- Holding S and F for 0.4 s dug 4 cells. Hands stayed 0. Status: “dropped into the pile”. `hauled` was 4. mass Δ 0.
- 3 loose sand cells were in the pit air beside the body, above the sand bed. The other dug cell had fallen back down into the bed. It was still in the grid.

## Feel

## Keep / drop / iterate
