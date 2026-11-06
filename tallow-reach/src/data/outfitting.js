// What the Outfitting screen lays out: the module groups around the ship
// (MODULE_GROUPS), how many bays each hull has of each group (SHIP_LAYOUTS),
// and the paint slots under the hull group (APPEARANCE_SLOTS).
//
// This file only describes bays. What is fitted in them is saved data
// (profile.loadout), and the modules themselves are in data/modules.js.

//   k   short id, used by SHIP_LAYOUTS, module data and saves
//   n   name shown above the bays
//   d   one line: what fitting this group changes
//
// Add an entry here and the screen draws one more group: the list is split in
// half around the 3D view, so nothing else needs to know how many there are.
// Every hull must then give it a slot count in SHIP_LAYOUTS (a test checks).
export const MODULE_GROUPS = [
  { k: "power", n: "Powerplant", d: "Energy the ship makes every second, in MJ/s." },
  { k: "cell", n: "Power cells", d: "Energy the ship can hold, in MJ." },
  { k: "thruster", n: "Thrusters", d: "Acceleration, top speed, turn rate and boost." },
  { k: "shield", n: "Shields", d: "Shield strength and how fast it recharges." },
  { k: "primary", n: "Primary weapons", d: "Main guns. Fired with left click." },
  { k: "secondary", n: "Secondary weapons", d: "Launchers and specials. Fired with right click." },
  { k: "hull", n: "Hull", d: "Armour, turn rate and top speed of the hull itself." },
];

// How many bays each hull has, group id -> count.
//
// Every hull is a straight copy of the Wasp's layout today. They are separate
// entries on purpose: giving a big ship two powerplants later is an edit to
// that hull's line and nothing else. The screen and the save read the counts
// through slotsFor()/layoutFor(), so no other file needs the numbers.
export const SHIP_LAYOUTS = {
  wasp: { power: 1, cell: 1, thruster: 1, shield: 1, primary: 2, secondary: 1, hull: 1 },
  prospector: { power: 1, cell: 1, thruster: 1, shield: 1, primary: 2, secondary: 1, hull: 1 },
  bulwark: { power: 1, cell: 1, thruster: 1, shield: 1, primary: 2, secondary: 1, hull: 1 },
};

/** The bay counts for hull `shipId`, falling back to the Wasp. */
export const layoutFor = shipId => SHIP_LAYOUTS[shipId] || SHIP_LAYOUTS.wasp;

/** How many bays group `g` has on hull `shipId`. */
export const slotsFor = (g, shipId) => layoutFor(shipId)[g.k] || 0;

// Paint slots on the Appearance card, which sits under the hull group in the
// right-hand column. Like modules, no paint exists yet: these entries only name
// the bays. Paints will be bought, stored and fitted exactly the way modules
// are, so one entry per colour channel is all the screen needs.
//
//   k   short id, will name the channel in paint data and saves later
//   n   name shown in the bay
//
// Add an entry and one more paint bay appears; the card is drawn by the same
// code and styled like the module cards.
export const APPEARANCE_SLOTS = [
  { k: "primary", n: "Primary" },
  { k: "secondary", n: "Secondary" },
];
