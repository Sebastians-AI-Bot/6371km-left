# Variant: Abstract shaft

Preset in the debug panel: **Abstract shaft**. Hash: `#abstract-shaft`.

## What this preset sets

World mode B, on the same page as Full sim. There is no `prototype/window.html`. The grid, the dig, and the haul are the same sim. One rule is added: loose spoil inside the shaft, above an 80 cm window at the face and below the sand bed, is lifted into a package.

- A package is a visible lump with a count (cap 24 per lump). It is not deleted. It moves upward and, at the surface, unpacks onto the surface heap as cells.
- Haul: belt. Water off. Heat off. Craft off. Shaft pre-dug to 146 cm. The bed also seeds one package of 24 sand cells, taken out of the sand bed so the count is conserved at spawn.
- Zoom 3. Depth in cm. Time scale 1×. Kits: 20 belt cells.

Embedded ground is not loose, so it stays cells. Only loose spoil is packed.

## How to run

`http://127.0.0.1:8765/prototype/index.html#abstract-shaft`

The World control under Live switches full / abstract on the current slice.

## Where the numbers show

HUD `pkg` is the number of cells sitting in packages. `entities` counts each package as one entity, plus each belt cell. `spoil/s` includes cells packed and cells unpacked onto the heap. `mass Δ` counts package contents.

## Observed

Same Chrome session (1820×1013, 12 Nov 2026).

- Spawn census (Node `createSim`, before the loop runs): cells 460800, solid 356952, water 1960, entities 178, one package holding 24 cells, mass Δ 0.
- About 0.7 s after boot in Chrome: fps 60, entities 179, 2 packages holding 44 cells, mass Δ 0. More loose sand in the shaft had been packed. The extra cells were still in the package count.

## Feel

## Keep / drop / iterate
