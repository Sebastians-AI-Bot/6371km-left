# Variant: Hand

Preset in the debug panel: **Hand**. Hash: `#hand`.

## What this preset sets

- Haul: hand. Carry cap 8 cells. Walk speed used by the sim: 80 cm/s.
- Water off. Heat off. Craft off. World: full simulation. Shafts: 1.
- Cell size 1 cm. Zoom 8. Depth readout: centimetres. Excavated volume off. Time scale 1×.
- Garden slice, no pre-dug shaft. Player stands in the sandbox pit.

World the preset builds: 960 cm × 480 cm. Surface at 96 cm. Sandbox x 300–440 cm, pit 22 cm, sand bed 28 cm on soil. Player 10 cm × 18 cm. One fossil (4 cells) under the sand. Side chamber with a bench, a station, and ore in the floor. A second sand patch at x 700–780 cm is present and refused until Shafts is set to 2.

## How to run

Serve the repo and open `http://127.0.0.1:8765/prototype/index.html#hand`. F1 opens the panel. Choosing Hand rebuilds the slice. Pixel size (1 cm / 2 cm) also rebuilds. The other controls under Live apply immediately.

## Where the numbers show

HUD, always on, top left:

- `fps`
- `cells`, `solid`, `water`
- `entities` (player, cart, packages, and each placed machine cell)
- `px dug/s`, `spoil/s`
- `carry`, `cart`, `mass Δ` (0 means nothing was created or deleted)

Depth is the quiet readout at the bottom left of the canvas. The “of 6,371 km” line and the volume line are their own toggles (volume default off).

## Observed

Headless Chrome, viewport 1820×1013, devicePixelRatio 1, 12 Nov 2026. Not a feel note.

- At rest: fps 60, cells 460800, solid 362209, water 1960 (the lake; water is off so it does not flow), entities 2, depth 22 cm, mass Δ 0.
- Holding S and F for 1.0 s of real time on the sand bed removed 11 cells. Hands stopped at 8/8. The cells past that went to the surface heap (column x = 264). Player y moved from 100 to 100.96. mass Δ stayed 0. Shovel time on sand is 0.08 s.
- G then reported “dumped 8” and the hands returned to 0. mass Δ stayed 0. G dumps into the facing cell and stacks on the first solid. If that pile cannot be placed, G uses the surface heap.

A 2 cm pixel-size rebuild of this preset, checked in Node with `createSim`, is 480×240 = 115200 cells (solid 90544, water 490). That count was not taken from a Chrome frame.

## Feel

## Keep / drop / iterate
