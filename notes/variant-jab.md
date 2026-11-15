# Variant: Jab

Preset in the debug panel: **Jab**. Hash: `#jab`.

## What this preset sets

- Dig feel: jab. One press digs at most one cell. Holding F or the mouse does not start the next cell. Releasing early cancels the stroke, and the cell stays.
- The stroke still uses the shovel time. Sand is 0.08 s. This is the same time as Hand. The drill and the time scale are not involved.
- Haul: hand. Carry cap 8. Walk speed 80 cm/s.
- Same garden as Hand. Water off, heat off, craft off, full simulation, 1 shaft, 1 cm cells, zoom 8, depth in cm, time scale 1×.

Hand is the hold-to-dig preset. Jab is the one-stroke preset. The garden, the cap, and the dig times match, so the difference is the gesture.

## How to run

Open `prototype/index.html#jab`.

A/D move. W jumps. S faces down. Tap F or the mouse, wait out the dig, then release before the next cell. G dumps the hands.

## Where the numbers show

HUD: `fps`, `cells`, `solid`, `water`, `entities`, `px dug/s`, `spoil/s`, `carry` (hands, cap 8), `mass Δ`. The last line starts with `jab · jab`.

## Observed

Headless Chrome, 15 Nov 2026. Not a feel note.

- At rest, after the rate window: fps 60, cells 460800, solid 362209, water 1960, entities 2, depth 22 cm, mass Δ 0.
- Holding S and F for 0.7 s without a release dug 1 cell. Hands 1/8. `jabArmed` was false, so the hold did not continue. mass Δ 0.
- Six presses of about 0.14 s, with a release between them, dug 6 cells. Hands 6/8. mass Δ 0.

## Feel

## Keep / drop / iterate
