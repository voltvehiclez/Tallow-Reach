// Hulls the player can fly. Stats are per ship:
//   spd     top thrust speed (m/s)     cargo   hold capacity
//   hull    hit points                 sh      shield points
//   dmg     multiplier on cannon damage
//   mine    multiplier on mining rate  turn    multiplier on steering
//   sc      model scale                price   cost in the Hangar
//   col     hull colour (hex)

export const SHIPS = {
  wasp: {
    n: "Wasp",
    d: "Light interceptor. Fast, fragile.",
    spd: 150, cargo: 20, hull: 100, sh: 80,
    dmg: 1, mine: 1, turn: 1.2, sc: 1,
    price: 600, col: 0x59636b,
  },
  prospector: {
    n: "Prospector",
    d: "Mining rig with a heavy beam and a deep hold.",
    spd: 105, cargo: 70, hull: 150, sh: 60,
    dmg: 0.8, mine: 2.3, turn: 0.9, sc: 1.4,
    price: 3500, col: 0x6b5b45,
  },
  bulwark: {
    n: "Bulwark",
    d: "Armoured gunship. Slow to turn, hard to kill.",
    spd: 90, cargo: 30, hull: 280, sh: 160,
    dmg: 1.8, mine: 1, turn: 0.7, sc: 1.7,
    price: 6000, col: 0x434b53,
  },
};

export const DEFAULT_SHIP = "wasp";
