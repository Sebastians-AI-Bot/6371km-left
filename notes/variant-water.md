# Variant: Water

Preset in the debug panel: **Water**. Hash: `#water`.

## What this preset sets

- Water: slow seep (one flow pass every 0.18 s). Live control can switch to off or aggressive (0.05 s, two passes).
- Haul: bucket (cap 32). A shaft is pre-dug to 146 cm, with a cut through to the side chamber.
- Kit: 1 pump. P places it in the facing air cell. A placed pump moves neighboring water onto the surface heap, budget 12 cells/s. E picks the pump back up.
- K turns one carried soil or sand cell into a seal in the facing air cell. The count stays one. The seal does not fall and does not flow.
- Heat off. Craft off. Full simulation. 1 shaft. 1 cm cells. Zoom 4. Time scale 1×.

The lake is 70 cm × 28 cm of water (1960 cells), right of the shaft, behind rock. With water on, a dug hole can fill from that lake.

## How to run

`http://127.0.0.1:8765/prototype/index.html#water`

The Water control under Live applies immediately. It does not rebuild.

## Where the numbers show

HUD `water` appears when the mode is not off, next to the cell line `water 1960` (the count). `spoil/s` includes cells the pump moves. `mass Δ` includes water. Water is mass.

## Observed

Same Chrome session (1820×1013, 12 Nov 2026).

- At rest: fps 60, cells 460800, solid 358201, water 1960, entities 2, depth 146 cm, mass Δ 0.
- The cell under the feet is soft rock. Shovel time there is 0.55 s (heat is off).
- Node selfcheck: water placed over a hole flows down into it, and the total mass is unchanged. A seal is a soil cell that changed material, not a deleted cell.

## Feel

## Keep / drop / iterate
