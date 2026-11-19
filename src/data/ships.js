// Hulls the player can fly. Each class carries its own hold, base Hull HP
// multiplier and hull bonuses:
//
//   cargo    hold capacity, in m³           dmg     multiplier on EVERYTHING the ship's weapons output
//   mine     multiplier on mining speed     price   base cost in the Shop
//   col      hull colour (hex)              sc      model scale
//   hpMul    multiplier on Hull HP from the fitted hull module (default 1)
//   bonuses  OPTIONAL extra bonus lines for the Ship details card
//
// Baseline hulls:
//   - Wasp:       20 m³ hold, baseline HP, no bonuses
//   - Prospector: 70 m³ hold, baseline HP (same as Wasp), 2× mining speed
//   - Bulwark:    30 m³ hold, baseline HP, 1.5× damage on all weapons
//   - Test Ship:  20 m³ hold, 100× Hull HP, 10× damage on all weapons (1 cr)
//
// Hull HP come from the fitted hull module (data/modules.js, sim/hull.js) scaled
// by `hpMul`; no module fitted means 0 Hull HP, while right-click Ship details
// reports the unmodified baseline Hull HP (stock hull × hpMul). Shields and
// speed/turn come from the fitted shield and thruster modules.
//
// Pilots may own multiple copies of the same hull class across stations. The
// first copy uses the bare hull id (`"wasp"`); extra copies use `"wasp#2"`,
// `"wasp#3"`, etc. Resolve a ship record through `shipTypeOf` / `shipDef` rather
// than indexing `SHIPS` with a fleet instance id directly.
//
// FLIGHT scales every ship at once. The forward speed comes from the drive; the
// other directions are a fraction of it, because side, vertical and reverse
// thrusters are much weaker than the main drive.

export const FLIGHT = {
  turn: 0.7,     // multiplier on every ship's turn rate (0.7 = 30% slower than the raw stat)
  strafe: 0.6,   // sideways (A/D) speed, as a fraction of forward speed
  lift: 0.6,     // up and down (Space/C) speed, as a fraction of forward speed
  reverse: 0.6,  // backing up (S below zero throttle), as a fraction of forward speed
};

export const SHIPS = {
  wasp: {
    n: "Wasp",
    d: "The baseline hull. A small hold and no hull bonuses.",
    cargo: 20,
    dmg: 1, mine: 1, hpMul: 1, sc: 1,
    price: 600, col: 0x59636b,
  },
  prospector: {
    n: "Prospector",
    d: "Mining hull with a deep hold and 2× mining speed.",
    cargo: 70,
    dmg: 1, mine: 2, hpMul: 1, sc: 1,
    price: 600, col: 0x6b5b45,
  },
  bulwark: {
    n: "Bulwark",
    d: "Combat hull with a larger hold and 1.5× damage on all weapons.",
    cargo: 30,
    dmg: 1.5, mine: 1, hpMul: 1, sc: 1,
    price: 600, col: 0x434b53,
  },
  // The owner's stress hull (2026-11-15): deliberately cheap and deliberately
  // overwhelming — 100× the basic hull's Hull HP, ten times the damage output
  // of everything the ship fires, the Wasp's hold, layout and stock fit.
  testship: {
    n: "Test Ship",
    d: "A proof of concept: 100× the basic hull's Hull HP and ten times the damage.",
    cargo: 20,
    dmg: 10, mine: 1, sc: 1, hpMul: 100,
    // Imported nose points +X; fit visually to 115% of Wasp length, not flight scale.
    modelYaw: Math.PI / 2, modelLength: 14.8925,
    cameraPadding: 1.2, // owner playtest: 20% more room than automatic framing
    price: 1, col: 0x8a6d3b,
  },
};

export const SHIP_IDS = Object.keys(SHIPS);

export const DEFAULT_SHIP = "wasp";

/** True when `type` is a base hull class key in `SHIPS`. */
export const isShipType = type =>
  typeof type === "string" && Object.prototype.hasOwnProperty.call(SHIPS, type);

/**
 * Valid owned-ship instance id: either a bare hull key (`"wasp"`) or a numbered
 * duplicate (`"wasp#2"`, `"wasp#3"`, ...).
 */
export function isShipId(id) {
  if (typeof id !== "string" || id.length > 64) return false;
  const hash = id.indexOf("#");
  if (hash < 0) return isShipType(id);
  const base = id.slice(0, hash);
  const suffix = id.slice(hash + 1);
  if (!isShipType(base) || !/^[1-9]\d{0,5}$/.test(suffix)) return false;
  return Number(suffix) >= 2;
}

/** Base hull key in `SHIPS` for a hull key or owned instance id, or `null`. */
export function shipTypeOf(id) {
  if (!isShipId(id)) return null;
  const hash = id.indexOf("#");
  return hash < 0 ? id : id.slice(0, hash);
}

/** Hull definition from `SHIPS` for a hull key or owned instance id, or `null`. */
export function shipDef(id) {
  const type = shipTypeOf(id);
  return type ? SHIPS[type] : null;
}

/** Display class name for a hull key or owned instance id (`"Wasp"`). */
export const shipName = id => shipDef(id)?.n || String(id);

/**
 * Display label for `id` inside a list of ships (such as a station hangar):
 * `"Wasp"` when only one Wasp is listed, `"Wasp #1"` / `"Wasp #2"` when two or
 * more share that class so the pilot can tell duplicates apart.
 */
export function shipLabel(id, list = null) {
  const type = shipTypeOf(id);
  const def = type ? SHIPS[type] : null;
  if (!def) return String(id);
  if (!Array.isArray(list)) return def.n;
  const same = list.filter(other => shipTypeOf(other) === type);
  if (same.length < 2) return def.n;
  const pos = same.indexOf(id);
  return pos >= 0 ? `${def.n} #${pos + 1}` : def.n;
}

/** Next unused instance id for a new ship of class `type` joining `ships`. */
export function nextShipId(type, ships = []) {
  if (!isShipType(type)) return null;
  const taken = new Set(Array.isArray(ships) ? ships : []);
  if (!taken.has(type)) return type;
  let n = 2;
  while (taken.has(`${type}#${n}`)) n++;
  return `${type}#${n}`;
}

/** Fraction of a hull's price paid back when sold in the Hangar (matches spare-part resale). */
export const SHIP_RESALE = 0.6;

/** Credits paid when selling `id` in the Hangar (60% of hull price, never below 1 cr). */
export function shipSellValue(id) {
  const s = shipDef(id);
  if (!s || !(s.price > 0)) return 0;
  return Math.max(1, Math.floor(s.price * SHIP_RESALE));
}

/** Format a stat multiplier cleanly (`1.5×`, `2×`, `100×`). */
const fmtMul = v => `${Number.isInteger(v) ? v : +v.toFixed(2)}\u00d7`;

/**
 * Unique hull bonus lines for `id`, derived purely from its `SHIPS` entry so a
 * new bonus multiplier or authored `bonuses` list shows automatically in Ship details.
 */
export function shipBonuses(id) {
  const s = shipDef(id);
  if (!s) return [];
  const out = [];
  if (typeof s.hpMul === "number" && s.hpMul !== 1) out.push(`${fmtMul(s.hpMul)} Hull HP`);
  if (typeof s.dmg === "number" && s.dmg !== 1) out.push(`${fmtMul(s.dmg)} damage (all weapons)`);
  if (typeof s.mine === "number" && s.mine !== 1) out.push(`${fmtMul(s.mine)} mining speed`);
  if (Array.isArray(s.bonuses)) {
    for (const line of s.bonuses) if (typeof line === "string" && line) out.push(line);
  }
  return out;
}
