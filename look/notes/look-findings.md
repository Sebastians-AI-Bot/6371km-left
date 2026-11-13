# Look prototype — findings

Godot **4.7.2 stable** (GDScript, Forward+). No extra libraries.

The strata use **Poly Haven CC0** 1K JPEGs (albedo, OpenGL normal, roughness), loaded at runtime and converted from sRGB to linear. See `textures/CREDITS.txt`.

- `farm_soil` — topsoil
- `gravel_ground_01` — sand, and the sand in the box
- `rock_boulder_dry` — limestone, and the stain under the hot rock
- `granular_concrete` — granite, wet stone, and the host for ore

A triplanar shader samples one face of the photo per cube, with a different crop on each block. Copper and gold nuggets are generated in that shader, not a metal photo. The hot band is the boulder pulled down to charcoal, with emissive cracks in the faces and in the joints. Water is a translucent shader with a moving ripple normal and a bright crest. Paper grain, the technical lines, and the toy props stay procedural.

Mood images in `reference/mood/` were direction only.

Measured on this machine with **lavapipe** (llvmpipe, LLVM 20.1.2) — software Vulkan, not a GPU. Viewport **1500×1000**, vsync off, MSAA 2×, SSAO and a little glow on, no depth of field and no tilt-shift. Treat the frame rates as a floor.

## How to open

```
godot --path /workspace/.worktrees/look
```

The binary used here was Godot 4.7.2.stable at `~/.local/bin/godot`. Any Godot 4.7 editor can open `project.godot`.

Controls:

- Right mouse — orbit (same elevated three-quarter angle at every zoom)
- Wheel — zoom from the diorama out to the line-drawn Earth
- Left click — break the block under the cursor
- H — hide or show the debug panel

The panel switches material, light preset (Studio warm, Daylight, Gallery), variation, zoom, background (Paper or Sky), and a stress grid. It shows FPS, solid block count, and debris count.

## What worked

The cut face now reads as materials rather than flat colour bands. Soil shows clods, sand is granular, limestone is mottled stone, granite carries metallic flecks, the pool has a glossy streak, and the bottom is dark rock with orange cracks instead of solid orange cubes. Broken pieces keep the same photos.

Blocks are one shared bevelled cube (44 triangles) in a `MultiMesh` per material. Gaps are tighter than the first pass, and each cube only yaws a couple of degrees, so the stack stays a cut block.

Default grid is **12 × 20 × 12**. After the water pocket is carved out that is **2,752** solid blocks (**121,088** triangles).

Clicking a block hides that instance and spawns six pre-fractured convex pieces. Piece volumes sum to **1.0**. Pieces are rigid bodies, sleep where they land, and are never freed. Twelve front-face blocks became **72** debris bodies. Intact blocks have no physics.

Zoom keeps the same three-quarter camera. Full zoom is a line cross-section of the Earth with the coloured block as a speck on the rim and a “6 371 km” label. Paper and sky are a panel switch.

Stress rebuild of the 100k grid took **1,123 ms**. The photographic shader did not change the lavapipe frame rate in any useful way (beauty 4.5 fps, was 4.6 on the flat materials).

## What did not

- **Frame rate here is the software rasterizer.** Beauty: **4.5 fps** average, **4.2** minimum, 40 frames, 8.9 s. After the break: **4.2 / 3.6**, 24 frames, 5.71 s. Stress with shadows: **0.9 fps**, **0.8** minimum, 16 frames, 18.6 s, **97,216** solid blocks, **4,277,504** triangles. Stress with shadows off: **1.0** average, **0.6** minimum, 16 frames, 16.23 s. A real GPU was not available.
- **The chunky look does not survive 100k cubes in the same volume.** Keep the beauty count for the diorama.
- **From the wide camera the cubes are still a grid.** Each face is only a couple of dozen pixels, so the photo detail is clearer in the close water/hot frame than in the full diorama. The reference miniature is a render of much larger faces.
- **Shadow catcher failed** on the first pass (`shadow_to_opacity` drew a black slab) and is still hidden. No contact shadow on the paper.
- **Water is one shaded surface**, not a simulated pool. The ripple is analytic. It reads as a glossy streak, not a full caustic.
- **Hot cracks alias** into short segments at this resolution. They follow the joints and a few lines across the faces. They are not a rendered fluid.
- **Mid-zoom lines are a grid cage** more than the delicate layer-extension drawing. The Earth is an ellipse because the camera stays at three-quarter.
- **Props are still primitives** (sandbox, child, excavator, trees, lamp, short conveyor).
- The on-screen FPS counter is a short window. The numbers above are wall-clock benches in `notes/bench.json`.

## Screenshots

Under `notes/screenshots/`:

| File | What it is |
| --- | --- |
| `01-diorama-studio.png` | Studio warm, photographic layers, paper |
| `02-break-debris.png` | Twelve blocks broken, 72 pieces on the floor |
| `03-zoom-lines-near.png` | Same camera, technical grid |
| `04-zoom-lines-earth.png` | Line-drawn Earth, block on the rim |
| `05-light-daylight.png` | Daylight preset |
| `06-light-gallery.png` | Gallery preset |
| `07-background-sky.png` | Sky background |
| `08-material-granite.png` | Every block on the granite material; water stays |
| `09-water-hot.png` | Closer on the pool, the cavity, and the hot cracks |
| `10-stress.png` | 97,216 solid blocks |
| `11-debug-panel.png` | The panel |

Copies of those files are in `/cursor/stores/self/media/look/`.
