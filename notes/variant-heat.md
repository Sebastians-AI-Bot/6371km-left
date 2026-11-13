# Variant: Heat

Preset in the debug panel: **Heat**. Hash: `#heat`.

## What this preset sets

- Heat: meter plus slowdown. Gradient 28 °C/m (exaggerated; the live control also offers 12 and 40). Surface temperature 18 °C. Above 30 °C the shovel time is multiplied by `1 + (T − 30) / 22`.
- Kit: 1 cooler. O places it. Within 80 cm it subtracts up to 40 °C at the cell it occupies, falling off to the edge of that radius. E picks it up.
- Same pre-dug shaft as Water, so the player starts at 146 cm. Haul: hand. Water off. Craft off. Zoom 4. Time scale 1×.
- Time scale does not enter the dig-time formula. The drill (×0.35) is a separate multiplier, from the craft preset.

“Meter only” (on the Live control, and on Full sim) colours the ground and prints °C, and does not change dig time.

## How to run

Open `prototype/index.html#heat`.

Heat and Gradient apply immediately.

## Where the numbers show

HUD line `heat slow`, the °C at the feet, and `grad`. Dig rate is still `px dug/s`. Depth is the canvas readout (146 cm at the spawn of this preset).

## Observed

Same Chrome session (1820×1013, 12 Nov 2026), plus the temperature function on the spawned sim.

- At rest: fps 60, cells 460800, solid 358201, water 1960, entities 2, depth 146 cm, mass Δ 0.
- Temperature at the feet: 58.9 °C. Shovel time on the soft-rock cell under the feet: 1.272 s. The same cell with heat off (Water preset) is 0.55 s.
- No Chrome dig-rate sample was taken on this preset beyond that dig time.

## Feel

## Keep / drop / iterate
