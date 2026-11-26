/* Seven test bays side by side, each 3 m wide and 3 m deep, under 40 cm
   of sky. The whole world fits the window, so it never slides. */
var DIG = (function () {
  "use strict";

  var M = makeDig;
  var BAY = 300, SKY = 40, DEPTH = 300;
  var BAYS = [
    { name: "sand" },
    { name: "topsoil" },
    { name: "clay" },
    { name: "gravel" },
    { name: "stone" },
    { name: "water", note: "sand under a water table" },
    { name: "oil", note: "clay over stone, oil pocket in the stone" }
  ];
  var TABLE = SKY + 40;
  var OIL_LENS = { x: 6 * BAY + 190, y: SKY + 190, rx: 75, ry: 30 };

  function cell(x, y, o) {
    o.flag = 0;
    o.clump = 0;
    o.shade = (M.hash(x, y, 7) * 256) | 0;
    if (y < SKY) { o.mat = M.AIR; return; }
    var name = BAYS[Math.min(BAYS.length - 1, Math.floor(x / BAY))].name;
    if (name === "sand") { o.mat = M.SAND; o.flag = M.LOOSE; }
    else if (name === "topsoil") o.mat = M.TOPSOIL;
    else if (name === "clay") o.mat = M.CLAY;
    else if (name === "stone") o.mat = M.STONE;
    else if (name === "gravel") {
      o.clump = M.pebble(x, y, 5);
      if (o.clump) o.mat = M.GRAVEL;
      else { o.mat = M.SAND; o.flag = M.LOOSE; }
    } else if (name === "water") {
      o.mat = M.SAND;
      o.flag = M.LOOSE | (y >= TABLE ? M.WET : 0);
    } else {
      var ex = (x + 0.5 - OIL_LENS.x) / OIL_LENS.rx, ey = (y + 0.5 - OIL_LENS.y) / OIL_LENS.ry;
      if (ex * ex + ey * ey < 1) o.mat = M.OIL;
      else o.mat = y < SKY + 120 ? M.CLAY : M.STONE;
    }
  }

  return makeDig({
    W: BAY * BAYS.length,
    H: SKY + DEPTH,
    ring: false,
    table: TABLE,
    saturated: function (x, y) { return y >= TABLE && x >= 5 * BAY && x < 6 * BAY; },
    cell: cell,
    BAY: BAY, SKY: SKY, TABLE: TABLE, BAYS: BAYS
  });
})();
