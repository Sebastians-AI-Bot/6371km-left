# 2D photo-column look

A side-on cross-section of one earth column, drawn on a canvas. Each block is a crop of a real photo. The Godot diorama was not changed.

## How to open

From `/workspace/look-2d`:

```
python3 -m http.server 8771 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8771/`. Wheel zooms, drag pans, click breaks a block. Serve the folder over HTTP so the photos load. There is no build step.

## What is on screen

Five blocks wide, twelve rows. At rest that is **60 blocks**.

| Band | Rows | Photo |
| --- | --- | --- |
| Topsoil | 2 | Poly Haven farm soil, copied from the Godot look textures |
| Sand / gravel | 2 | Poly Haven gravel ground, copied from the Godot look textures |
| Limestone | 2 | Poly Haven marble cliff 01 |
| Granite with ore | 2 | Poly Haven seaside rock, with flecks cut from rusty metal 02 |
| Water pocket | 2 | Center three columns: a crop of the Poly Haven pool photo. Outer columns: dark rock 02 |
| Hot band | 2 | Poly Haven dark rock, with glowing cracks drawn over the photo |

Crops are offset per block, and some are mirrored, so neighbours do not share the same patch. A dark joint and a small bevel keep each block readable. The grid edges are jogged a little so the stack is not a perfect tile.

On the soil: a sandbox, a figure with a shovel, and a toy excavator, all drawn from simple shapes, plus a few grass strokes. The page background is warm paper. There is no story, currency, or digging economy.

## Break, zoom, count

Click a block at least 56px on a side and it splits into four smaller crops of the same photo. Those pieces fall, land on whatever is under them, and stay. They are not removed. One click takes the count from 60 to 63. The debris screenshot breaks four blocks (two limestone, two granite) and settles at **72 blocks**.

Wheel zoom is clamped between 0.35 and 4. Drag pans. The corner readout is frames per second and the live block count.

## FPS

Measured in headless Chrome after the view had settled, on this machine:

| View | Blocks | FPS |
| --- | --- | --- |
| Full column | 60 | 60 |
| Surface | 60 | 60 |
| Zoomed blocks | 60 | 60 |
| Water and hot band | 60 | 60 |
| After four blocks broken | 72 | 60 |

The first sample on a cold load dipped to about 46, then sat at 60. Drawing is canvas image blits. Crack glow is baked once, not blurred every frame.

## What was tried

The 3D cube reads as a studio object. This test uses the game's side view instead: one column, photo faces, chunky joints.

Poly Haven has no water or lava texture in the set already downloaded. The water pocket is a crop of the CC0 pool photograph (the tonemapped HDRI), not a flat fill. Ore is the rust photo with the pale metal keyed out, stamped as irregular nuggets. Cracks are drawn on top of the dark rock photo so the hot band can glow without a lava texture.

Limestone carries the look best: each block is a different face of the cliff photo. Soil and gravel are more even, because those source photos are even, and the joints do the work of separating them. The water's top row is smoother than the row under it. The ore reads as copper flecks, still flatter than the stone in the mood pictures.

## Screenshots

Same five files in both places. Each file is present and larger than a stub.

- `/workspace/look-2d/notes/screenshots/01-column.png`
- `/workspace/look-2d/notes/screenshots/02-surface.png`
- `/workspace/look-2d/notes/screenshots/03-zoom-blocks.png`
- `/workspace/look-2d/notes/screenshots/04-break-debris.png`
- `/workspace/look-2d/notes/screenshots/05-hot-water.png`
- `/cursor/stores/self/media/look-2d/01-column.png`
- `/cursor/stores/self/media/look-2d/02-surface.png`
- `/cursor/stores/self/media/look-2d/03-zoom-blocks.png`
- `/cursor/stores/self/media/look-2d/04-break-debris.png`
- `/cursor/stores/self/media/look-2d/05-hot-water.png`

`01` is the whole column. `02` is the sandbox, figure, and machine. `03` is a close view of gravel, limestone, and ore. `04` is after blocks break and the pieces have landed. `05` is the water pocket and the hot cracks.
