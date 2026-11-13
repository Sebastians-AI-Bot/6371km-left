# Variant: Time scale

Preset in the debug panel: **Time scale**. Hash: `#time-scale`.

## What this preset sets

- Time scale 4× at spawn. Live steps: 1×, 2×, 4×, 8×. The scale multiplies the simulation clock (movement, dig progress, falling, belts, water, pumps, packages).
- It does not change the shovel or the drill. Drill ×0.35 is only the tool, from Craft.
- Otherwise this is the Hand garden: haul hand (cap 8), water off, heat off, craft off, full simulation, 1 shaft, 1 cm cells, zoom 8, depth in cm.

## How to run

`http://127.0.0.1:8765/prototype/index.html#time-scale`

The Time scale control applies immediately and does not rebuild. HUD `time` shows the step.

## Where the numbers show

`px dug/s` and `spoil/s` are per real second, so they rise with the time scale. `fps` stays a real-time frame rate. Dig time in the code (sand 0.08 s) is in sim seconds.

## Observed

Same Chrome session (1820×1013, 12 Nov 2026).

- At rest: fps 60, cells 460800, solid 362209, water 1960, entities 2, depth 22 cm, mass Δ 0, time 4×.
- Holding S and F for 1.0 s of real time on the sand bed removed 42 cells. Hands stopped at 8/8 and the rest spilled to the surface heap. mass Δ stayed 0. Player y moved from 100 to 102.69.
- The same hold on the Hand preset (1×), in the same session, removed 11 cells. 42 and 11 are the raw counts.

## Feel

## Keep / drop / iterate
