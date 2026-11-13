# Variant: Full sim

Preset in the debug panel: **Full sim**. Hash: `#full-sim`.

## What this preset sets

World mode A: every cell in the garden is simulated. No abstract packages.

- Haul: belt (the lawn belt from the Belt preset) plus hands (cap 8).
- Water: slow. Heat: meter only, gradient 22 °C/m. The meter does not slow the tool.
- Craft on, at the station. Shaft pre-dug to 146 cm, with the cut into the chamber.
- Kits: 1 pump, 1 cooler, 20 belt cells.
- Zoom 1.4, so the view is much wider than Hand (zoom 8). Camera still follows.
- Depth readout style: centimetres plus “of 6,371 km” and the percent of 637,100,000 cm. Excavated volume stays off until the checkbox is turned on (litres, then m³; one 1 cm cell is 0.1 L at a 1 m slice).
- Time scale 1×. Shafts: 1.

## How to run

`http://127.0.0.1:8765/prototype/index.html#full-sim`

This is the same page as the other presets. The World control can switch to the abstract shaft without a rebuild.

## Where the numbers show

HUD: fps, cells, solid, water, entities, px dug/s, spoil/s, heat °C, mass Δ. The earth-depth lines are on the canvas, bottom left. Volume appears there only when the checkbox is on.

## Observed

Same Chrome session (1820×1013, 12 Nov 2026).

- After about 1.2 s: fps 60. One earlier sample, taken while switching presets, read 58.
- cells 460800, solid 356976, water 1960, entities 177, packages 0.
- spoil/s 135.5 (the belt moving the seeded sand). px dug/s 0. mass Δ 0. Depth 146 cm.
- Temperature at the feet 50.1 °C. Dig time on the soft-rock cell under the feet stayed 0.55 s, because this preset’s heat mode is meter only.

## Feel

## Keep / drop / iterate
