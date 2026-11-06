// What the Outfitting screen lays out: the module groups around the ship
// (MODULE_GROUPS) and the paint slots under the hull group (APPEARANCE_SLOTS).
// This file only describes bays: nothing is fitted or painted yet, and nothing
// here changes flight, combat or the save.
//
//   k      short id, will name the group in module data and saves later
//   n      name shown above the bays
//   d      one line: what fitting this group will change
//   slots  how many bays of this kind the ship has
//
// Add an entry here and the screen draws one more group: the list is split in
// half around the 3D view, so nothing else needs to know how many there are.
// Slot counts can become per-hull later (a big ship with two powerplants); the
// screen reads every count through slotsFor(), so that change lands in one place.
//
// Keep the keys short, like the other data tables.

export const MODULE_GROUPS = [
  { k: "power", n: "Powerplant", d: "Power the ship produces, in MW.", slots: 1 },
  { k: "cell", n: "Power cells", d: "Energy the ship can store, in MJ.", slots: 1 },
  { k: "thruster", n: "Thrusters", d: "Acceleration, top speed, turn rate and boost.", slots: 1 },
  { k: "shield", n: "Shields", d: "Shield strength and how fast it recharges.", slots: 1 },
  { k: "primary", n: "Primary weapons", d: "Main guns. Fired with left click.", slots: 2 },
  { k: "secondary", n: "Secondary weapons", d: "Launchers and specials. Fired with right click.", slots: 1 },
  { k: "hull", n: "Hull", d: "Armour, turn rate and top speed of the hull itself.", slots: 1 },
];

/**
 * How many bays group `g` has on hull `shipId`.
 * Today every hull is the same; a per-hull override belongs in this function.
 */
export const slotsFor = (g, shipId) => g.slots;

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
