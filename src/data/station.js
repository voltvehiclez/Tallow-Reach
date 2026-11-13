// Meridian Station: base modules and their costs.
// Cost is a function of the level you are building to (1, 2, ...).

export const BASE_DEFAULT = { store: 1, hangar: 1, refinery: 0 };

export const BASE_MODULES = {
  store: {
    n: "Storage bay",
    d: "Adds 250 units of storage.",
    max: 5,
    cost: level => 600 * level * level,
  },
  hangar: {
    n: "Hangar berth",
    d: "Room for another ship.",
    max: 5,
    cost: level => 1500 * level * level,
  },
  refinery: {
    n: "Refinery",
    d: "Sells cargo for 15% more.",
    max: 4,
    cost: level => 800 * (level + 1) * (level + 1),
  },
};

export const STORAGE_PER_LEVEL = 250;
export const REFINERY_BONUS_PER_LEVEL = 0.15;
export const RECOVERY_FEE = 150;      // max fee charged when a ship is lost (capped by cash)
export const REPAIR_MIN_HULL = 0.02; // a docked ship never saves below this hull fraction
