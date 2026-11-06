// Hulls the player can fly. Right now every hull is the same ship apart from
// its hold: identical gun damage, mining rate, model scale and price. The hold
// is measured in cubic metres, one cargo unit = 1 m³, and that is the only
// thing that differs between them (the Hull HP come from the fitted hull
// module now, not from the hull itself):
//
//   cargo   hold capacity, in m³           dmg     multiplier on cannon damage (1 for now)
//   mine    multiplier on mining rate (1 for now)
//   price   cost in the Hangar             col     hull colour (hex)
//   sc      model scale
//
// Ship-specific bonuses will arrive later; until then nothing on a hull
// modifies the simulation, only the hold does. Hull HP come from the fitted
// hull module (data/modules.js, sim/hull.js): a hull with no module in its
// hull bay has no Hull HP at all, and any hit reaching it kills the ship.
//
// Shields are not a hull stat: the fitted shield module decides how many Shield HP
// the ship has, how fast they come back and how long a lull has to last
// (data/modules.js, sim/shield.js). No shield module means no shields at all.
//
// A hull has no speed or turn of its own: both come from the thrusters fitted in
// the thruster bay (data/modules.js, sim/drive.js). A ship with an empty thruster
// bay cannot move at all. When hulls should fly differently that will be a
// multiplier in sim/drive.js, not a base speed here.
//
// FLIGHT scales every ship at once. The forward speed comes from the drive; the
// other directions are a fraction of it, because side, vertical and reverse
// thrusters are much weaker than the main drive.

export const FLIGHT = {
  turn: 0.7,     // multiplier on every ship's turn rate (0.7 = 30% slower than the raw stat)
  strafe: 0.3,   // sideways (A/D) speed, as a fraction of forward speed
  lift: 0.3,     // up and down (Space/C) speed, as a fraction of forward speed
  reverse: 0.3,  // backing up (S below zero throttle), as a fraction of forward speed
};

export const SHIPS = {
  wasp: {
    n: "Wasp",
    d: "The baseline hull. A small hold.",
    cargo: 20,
    dmg: 1, mine: 1, sc: 1,
    price: 600, col: 0x59636b,
  },
  prospector: {
    n: "Prospector",
    d: "The baseline hull, with the deep hold for ore.",
    cargo: 70,
    dmg: 1, mine: 1, sc: 1,
    price: 600, col: 0x6b5b45,
  },
  bulwark: {
    n: "Bulwark",
    d: "The baseline hull, with a slightly larger hold.",
    cargo: 30,
    dmg: 1, mine: 1, sc: 1,
    price: 600, col: 0x434b53,
  },
};

export const DEFAULT_SHIP = "wasp";
