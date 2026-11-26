/* The ground of the column as dig cells (see ../dig/sim.js): 1 cm cells,
   x across the centre face and y down from the surface, in centimetres.
   Topsoil, clay and sand are themselves, gravel is pebbles in sand, and
   every rock unit below is stone. The groundwater pocket is wet sand
   under its own water table; gas is air, oil is oil, brine is water and
   magma stays stone. */
function makeColumnWorld(column, pockets) {
  "use strict";

  var M = makeDig;
  var W = 1536, H = 1024, CS = 32;
  var units = [];
  var from = 0;
  for (var i = 0; i < column.length; i++) {
    var name = column[i].name;
    var to = Math.round(column[i].to * 100);
    units.push({
      from: from,
      to: to,
      mat: name === "topsoil" ? M.TOPSOIL : name === "clay" ? M.CLAY : name === "sand" ? M.SAND
        : name === "gravel" ? M.GRAVEL : M.STONE
    });
    from = to;
  }
  var holes = [];
  var water = null;
  for (i = 0; i < pockets.length; i++) {
    var p = pockets[i];
    var hole = {
      name: p.name,
      x0: Math.round(p.x0 * 100), x1: Math.round(p.x1 * 100),
      y0: Math.round(p.d0 * 100), y1: Math.round(p.d1 * 100)
    };
    if (p.name === "water") water = hole;
    if (p.name !== "magma") holes.push(hole);
  }

  function unitAt(y) {
    for (var k = 0; k < units.length; k++) if (y < units[k].to) return units[k];
    return units[units.length - 1];
  }

  function holeAt(x, y) {
    for (var k = 0; k < holes.length; k++) {
      var h = holes[k];
      if (y >= h.y0 && y < h.y1 && x >= h.x0 && x < h.x1) return h;
    }
    return null;
  }

  function cell(x, y, o) {
    o.flag = 0;
    o.clump = 0;
    o.shade = (M.hash(x, y, 7) * 256) | 0;
    if (y < 0) { o.mat = M.AIR; return; }
    var h = holeAt(x, y);
    if (h) {
      if (h.name === "water") { o.mat = M.SAND; o.flag = M.LOOSE | M.WET; }
      else if (h.name === "gas") o.mat = M.AIR;
      else if (h.name === "oil") o.mat = M.OIL;
      else o.mat = M.WATER;
      return;
    }
    var m = unitAt(y).mat;
    if (m === M.GRAVEL) {
      o.clump = M.pebble(x, y, 5);
      if (o.clump) o.mat = M.GRAVEL;
      else { o.mat = M.SAND; o.flag = M.LOOSE; }
      return;
    }
    o.mat = m;
    if (m === M.SAND) o.flag = M.LOOSE;
  }

  return {
    W: W,
    H: H,
    ring: true,
    x0: -W / 2,
    y0: -8 * CS,
    table: water ? water.y0 : Infinity,
    saturated: function (x, y) {
      return !!water && y >= water.y0 && y < water.y1 && x >= water.x0 && x < water.x1;
    },
    sky: function (x, y) { return y < 0; },
    cell: cell
  };
}
