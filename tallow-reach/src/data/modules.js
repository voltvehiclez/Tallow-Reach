// Modules that go in the Outfitting bays. The basic pair below are fitted to
// every hull from the start; nothing else is sold yet.
//
//   g       the module group it fits (an id from data/outfitting.js)
//   n       name, shown in the bay and (later) in the shop
//   d       one line
//   mjps    powerplant: energy made per second
//   mj      power cell: energy it holds when full
//
// A module may only have the stat its group uses. When thrusters, shields and
// weapons arrive they add fields here (top speed, shield points, damage) and the
// systems that read those fields, the way sim/power.js reads mjps and mj.
//
// Keep the keys short, like the other data tables.

export const MODULES = {
  power_basic: { g: "power", n: "Basic powerplant", d: "Standard reactor.", mjps: 10 },
  cell_basic: { g: "cell", n: "Basic power cell", d: "Standard storage bank.", mj: 100 },
};

// What a hull is delivered with, bay by bay: group id -> module ids in bay
// order. Bays with no entry are delivered empty. Used for new games, for old
// saves that had no loadout, and for a ship bought in the Hangar.
export const STOCK_FIT = {
  power: ["power_basic"],
  cell: ["cell_basic"],
};
