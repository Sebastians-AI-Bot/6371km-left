# Variant: Craft

Preset in the debug panel: **Craft**. Hash: `#craft`.

## What this preset sets

- Craft on, at the placed station. Live control can switch the fixture to the bench, or turn recipes off.
- The side chamber is open (right of the sandbox, past a 6 cm gap). A bench and a station stand in it. Ore replaces the floor under them, so the recipe sees cells, not a counter.
- E next to the station: two ore cells become one ingot and one slag. E on the ingot (or an ingot in the hands) fits it as the drill. Drill dig time is ×0.35. That multiplier is not the time scale.
- There is no currency, shop, or purchase. Slag is a cell. The fossil is decorative and can be picked up with E; it is not a recipe.
- Haul: hand. Water off. Heat off. A shaft is pre-dug down to the chamber (player depth 104 cm). Zoom 5. Time scale 1×.

## How to run

Open `prototype/index.html#craft`.

Stand in the chamber, next to the station, and press E.

## Where the numbers show

HUD `tool` reads `shovel` or `drill (1 ingot)`. `mass Δ` must stay 0 across the smelt: two cells in, two cells out. `px dug/s` shows the drill once it is fitted.

## Observed

Same Chrome session (1820×1013, 12 Nov 2026).

- At rest: fps 60, cells 460800, solid 358705, water 1960, entities 2, depth 104 cm, mass Δ 0.
- Ore beside the station becomes one ingot and one slag, and the total mass stays unchanged. The drill is ×0.35. Time scale is a separate control and does not change that multiplier.

## Feel

## Keep / drop / iterate
