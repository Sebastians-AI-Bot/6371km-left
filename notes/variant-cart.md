# Variant: Cart

Preset in the debug panel: **Cart**. Hash: `#cart`.

## What this preset sets

- Haul: cart. Hands still hold 8. The cart holds 120. The cart is a body on the lawn (22 cm × 12 cm) and is pushed when you walk into it.
- Water off, heat off, craft off, full simulation, 1 shaft, 1 cm cells, zoom 6, depth in cm, volume off, time scale 1×.
- E beside the cart loads the hands into the cart, or unloads into the hands when the hands are empty.
- G beside the cart dumps the cart into a heap. Otherwise G dumps the hands.

All of that goes through the same move-N-cells path as hand and bucket. A transfer that does not fit is put back.

## How to run

`http://127.0.0.1:8765/prototype/index.html#cart`

## Where the numbers show

HUD `carry` is the hands. HUD `cart` is `n/120`. `entities` counts the player and the cart. `spoil/s` counts cells moved by a dump or a load. `mass Δ` stays on the overlay.

## Observed

Same Chrome session (1820×1013, 12 Nov 2026).

- At rest: fps 60, cells 460800, solid 362209, water 1960, entities 2, depth 22 cm, mass Δ 0.
- No separate load/dump timing was taken on this preset.

## Feel

## Keep / drop / iterate
