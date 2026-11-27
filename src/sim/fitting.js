// Moving modules between a pilot's ship and the current station's storage.
//
// Fitting costs nothing and is done while docked: a part comes out of the
// current station inventory and into a bay in `profile.loadout[ship]`, and
// whatever was in that bay goes back into that same station. Every change
// refreshes the target pilot's power, drive, shields, hull and guns.

import { MODULES } from "../data/modules.js";
import { MODULE_GROUPS, layoutFor } from "../data/outfitting.js";
import { isModule, itemName, itemStack, itemValue, itemVol } from "../data/items.js";
import { FLIGHT, shipDef, shipName } from "../data/ships.js";
import { SHOPS } from "../data/shops.js";
import { BULLET_LIFETIME, MISSILE } from "../data/weapons.js";
import { shipStation } from "../state/profile.js";
import { state, profileOf } from "../state/state.js";
import {
  STATION,
  addItem,
  addItemToSlot,
  countOf,
  freeOf,
  itemsAt,
  nameOf,
  slotAt,
  spaceFor,
  takeItem,
  takeItemFromSlot,
} from "./inventory.js";
import { refillPower } from "./power.js";
import { refreshDrive } from "./drive.js";
import { refreshShield } from "./shield.js";
import { refreshHull } from "./hull.js";
import { refreshGuns } from "./guns.js";

const groupTitle = key => MODULE_GROUPS.find(g => g.k === key)?.n || key;

function refreshFittedShip(P, profile) {
  refillPower(P, profile);
  refreshDrive(P, profile);
  refreshShield(P, profile);
  refreshHull(P, profile);
  refreshGuns(P, profile);
}

function activeShipHere(profile = state.profile, world = state.worldState) {
  const ship = profile?.ship;
  if (!ship || !shipDef(ship) || !Array.isArray(profile?.ships) || !profile.ships.includes(ship)) {
    return false;
  }
  const hasPlace = (profile.shipPlaces && profile.shipPlaces[ship]) || (profile.shipAt && profile.shipAt[ship]);
  if (!hasPlace) return true;
  const here = world === state.worldState ? state.place : (world?.place || state.place);
  return shipStation(profile, ship, here) === here;
}

function assertFitTarget(P, profile) {
  if (P && P !== state.player && (!profile || profile === state.profile)) {
    throw new Error("Non-local fitting requires its own profile");
  }
}

/**
 * The bay list for `group` on `profile`'s active ship, or null if there is no
 * such bay. `i` is the bay index.
 */
function bayList(group, i, profile = state.profile) {
  const fit = profile.loadout && profile.loadout[profile.ship];
  if (!fit) return null;
  const list = fit[group];
  if (!Array.isArray(list) || !Number.isInteger(i) || i < 0 || i >= list.length) return null;
  return list;
}

/**
 * Spare parts in storage that would fit a `group` bay, in the order they
 * arrived: one entry per part, so three beams are three "beam_basic"s.
 */
export function storedFor(group, world = state.worldState, profile = state.profile) {
  const out = [];
  for (const { id, n } of itemsAt(STATION, profile, world)) {
    if (!isModule(id) || MODULES[id].g !== group) continue;
    for (let i = 0; i < n; i++) out.push(id);
  }
  return out;
}

/** The module fitted in one bay, or null. */
export function fittedAt(group, i, profile = state.profile) {
  const list = bayList(group, i, profile);
  return list ? list[i] || null : null;
}

/**
 * Put stored module `id` into bay `i` of `group`. A part already in that bay
 * moves to storage. Returns a message for the panel, or undefined if the bay
 * does not exist (the screen is out of date).
 */
export function fitModule(
  group,
  i,
  id,
  P = state.player,
  profile = profileOf(P),
  world = state.worldState
) {
  assertFitTarget(P, profile);
  const list = bayList(group, i, profile);
  if (!list) return undefined;

  const m = MODULES[id];
  if (!m || m.g !== group) return "That module does not fit in that bay.";

  if (!countOf(STATION, id, profile, world)) return "That module is not in storage.";

  const replaced = list[i];
  // The part that comes out needs somewhere to go; the one going in frees its own space.
  if (replaced && itemVol(replaced) > freeOf(STATION, profile, world) + itemVol(id)) {
    return `No room in ${nameOf(STATION)} for the ${MODULES[replaced].n}. Make space in the Inventory tab.`;
  }
  takeItem(STATION, id, 1, profile, world);
  if (replaced) addItem(STATION, replaced, 1, profile, world);
  list[i] = id;

  refillPower(P, profile);
  refreshDrive(P, profile);
  refreshShield(P, profile);
  refreshHull(P, profile);
  refreshGuns(P, profile);
  return replaced
    ? `Fitted ${m.n}. ${MODULES[replaced].n} moved to storage.`
    : `Fitted ${m.n}.`;
}

/** Take whatever is in bay `i` of `group` out and put it in storage. */
export function unequip(
  group,
  i,
  P = state.player,
  profile = profileOf(P),
  world = state.worldState
) {
  assertFitTarget(P, profile);
  const list = bayList(group, i, profile);
  if (!list) return undefined;

  const id = list[i];
  if (!id) return "That bay is already empty.";
  if (itemVol(id) > freeOf(STATION, profile, world)) {
    return `No room in ${nameOf(STATION)} for the ${MODULES[id].n}. Make space in the Inventory tab.`;
  }

  list[i] = null;
  addItem(STATION, id, 1, profile, world);

  refreshFittedShip(P, profile);
  return `${MODULES[id].n} moved to storage.`;
}

function pickReturnPlace(replacedId, fromWhere, freedVol, profile, world) {
  if (!replacedId) return STATION;
  const need = itemVol(replacedId) || 0;
  if (fromWhere && need <= freeOf(fromWhere, profile, world) + freedVol) return fromWhere;
  if (fromWhere !== STATION && need <= freeOf(STATION, profile, world)) return STATION;
  return null;
}

/**
 * Inspect whether item `id` in `fromWhere` can be equipped directly onto the
 * pilot's active ship (without opening Outfitting). Equips into the first empty
 * bay of its group, or swaps a 1-bay group when fitted with a different module.
 */
export function canEquipModule(
  id,
  fromWhere = STATION,
  profile = state.profile,
  world = state.worldState
) {
  if (!isModule(id) || !MODULES[id]) {
    return { ok: false, group: null, bay: -1, replaced: null, reason: "This item cannot be equipped." };
  }
  const m = MODULES[id];
  if (!activeShipHere(profile, world)) {
    return { ok: false, group: m.g, bay: -1, replaced: null, reason: "No active ship stored at this station." };
  }
  const shipLabelText = shipName(profile.ship);
  const fit = profile.loadout?.[profile.ship];
  const list = fit?.[m.g];
  if (!Array.isArray(list) || list.length === 0) {
    return { ok: false, group: m.g, bay: -1, replaced: null, reason: `${m.n} does not fit on ${shipLabelText}.` };
  }
  const emptyBay = list.findIndex(cur => !cur);
  if (emptyBay >= 0) {
    return { ok: true, group: m.g, bay: emptyBay, replaced: null, reason: "" };
  }
  if (list.length === 1 && list[0] !== id) {
    const replaced = list[0];
    const dest = pickReturnPlace(replaced, fromWhere, itemVol(id) || 0, profile, world);
    if (!dest) {
      return {
        ok: false,
        group: m.g,
        bay: -1,
        replaced,
        reason: `No room to unequip ${MODULES[replaced]?.n || replaced}.`,
      };
    }
    return { ok: true, group: m.g, bay: 0, replaced, reason: "" };
  }
  if (list.length === 1 && list[0] === id) {
    return {
      ok: false,
      group: m.g,
      bay: -1,
      replaced: list[0],
      reason: `${m.n} is already equipped on ${shipLabelText}.`,
    };
  }
  return {
    ok: false,
    group: m.g,
    bay: -1,
    replaced: null,
    reason: `All ${groupTitle(m.g)} bays on ${shipLabelText} are full.`,
  };
}

/**
 * Fit one unit of module `id` from any docked inventory `(where, slotIndex)`
 * into `(group, i)` on `profile`'s active ship, placing any displaced module
 * back into `where` (or station storage if `where` is a full ship hold).
 */
export function fitModuleFrom(
  where,
  slotIndex,
  group,
  i,
  id,
  P = state.player,
  profile = profileOf(P),
  world = state.worldState
) {
  assertFitTarget(P, profile);
  if (!isModule(id) || !MODULES[id]) {
    return { ok: false, replaced: null, message: `${itemName(id) || "That item"} cannot be equipped.` };
  }
  const m = MODULES[id];
  if (!activeShipHere(profile, world)) {
    return { ok: false, replaced: null, message: "No active ship stored at this station." };
  }
  if (m.g !== group) {
    return { ok: false, replaced: null, message: `${m.n} fits ${groupTitle(m.g)}, not ${groupTitle(group)}.` };
  }
  const list = bayList(group, i, profile);
  if (!list) {
    return { ok: false, replaced: null, message: `${m.n} does not fit on ${shipName(profile.ship)}.` };
  }
  const source = where || STATION;
  if (!(countOf(source, id, profile, world) > 0)) {
    return { ok: false, replaced: null, message: `${m.n} is not in ${nameOf(source)}.` };
  }
  const replaced = list[i] || null;
  if (replaced === id) {
    return { ok: false, replaced, message: `${m.n} is already fitted in that bay.` };
  }
  const returnWhere = pickReturnPlace(replaced, source, itemVol(id) || 0, profile, world);
  if (replaced && !returnWhere) {
    return {
      ok: false,
      replaced,
      message: `No room in ${nameOf(source)} for the ${MODULES[replaced].n}.`,
    };
  }
  const idx = Number.isInteger(slotIndex) ? slotIndex : -1;
  const took = takeItemFromSlot(source, idx, id, 1, profile, world);
  if (!(took > 0)) {
    return { ok: false, replaced: null, message: `${m.n} is not in ${nameOf(source)}.` };
  }
  if (replaced) {
    const returnSlot = returnWhere === source && idx >= 0 && !slotAt(source, idx, profile, world) ? idx : -1;
    addItemToSlot(returnWhere, returnSlot, replaced, 1, profile, world);
  }
  list[i] = id;
  refreshFittedShip(P, profile);
  return {
    ok: true,
    replaced,
    message: replaced
      ? `Equipped ${m.n}. ${MODULES[replaced].n} moved to ${nameOf(returnWhere)}.`
      : `Equipped ${m.n}.`,
  };
}

/** Right-click `Equip` action from any Inventory slot onto the active ship. */
export function equipModuleFromInventory(
  where,
  slotIndex,
  id,
  P = state.player,
  profile = profileOf(P),
  world = state.worldState
) {
  assertFitTarget(P, profile);
  const check = canEquipModule(id, where || STATION, profile, world);
  if (!check.ok) return { ok: false, replaced: null, message: check.reason };
  return fitModuleFrom(where || STATION, slotIndex, check.group, check.bay, id, P, profile, world);
}

/**
 * Unequip bay `(group, i)` from the active ship into `(toWhere, toSlot)`. If
 * dropped onto a slot holding a single compatible module of the same group,
 * swaps the two cleanly.
 */
export function unequipTo(
  group,
  i,
  toWhere = STATION,
  toSlot = -1,
  P = state.player,
  profile = profileOf(P),
  world = state.worldState
) {
  assertFitTarget(P, profile);
  if (!activeShipHere(profile, world)) {
    return { ok: false, id: null, message: "No active ship stored at this station." };
  }
  const list = bayList(group, i, profile);
  if (!list) return { ok: false, id: null, message: "That bay does not exist." };
  const id = list[i];
  if (!id) return { ok: false, id: null, message: "That bay is already empty." };
  const dest = toWhere || STATION;
  const idx = Number.isInteger(toSlot) ? toSlot : -1;
  if (idx >= 0) {
    const target = slotAt(dest, idx, profile, world);
    if (target && isModule(target.id) && MODULES[target.id]?.g === group && target.id !== id && target.n === 1) {
      const swapRes = fitModuleFrom(dest, idx, group, i, target.id, P, profile, world);
      return { ok: swapRes.ok, id, message: swapRes.message };
    }
  }
  if (spaceFor(dest, id, profile, world) < 1) {
    return {
      ok: false,
      id,
      message: `No room in ${nameOf(dest)} for the ${MODULES[id].n}.`,
    };
  }
  list[i] = null;
  addItemToSlot(dest, idx, id, 1, profile, world);
  refreshFittedShip(P, profile);
  return { ok: true, id, message: `Unequipped ${MODULES[id].n} to ${nameOf(dest)}.` };
}

/** Swap two bays within the same module group on the active ship. */
export function swapFittedBays(group, fromBay, toBay, P = state.player, profile = profileOf(P)) {
  assertFitTarget(P, profile);
  if (fromBay === toBay) return { ok: false, message: "" };
  const list = bayList(group, fromBay, profile);
  if (!list || !Number.isInteger(toBay) || toBay < 0 || toBay >= list.length) {
    return { ok: false, message: "" };
  }
  if (!list[fromBay] && !list[toBay]) return { ok: false, message: "" };
  const tmp = list[fromBay];
  list[fromBay] = list[toBay];
  list[toBay] = tmp;
  refreshFittedShip(P, profile);
  return { ok: true, message: "" };
}

/**
 * Pick up a fitted module from bay `(group, i)` onto the cursor (identical to
 * left-clicking a slot in Inventory). Returns the held record or `null`.
 */
export function pickupFittedBay(
  group,
  i,
  P = state.player,
  profile = profileOf(P),
  world = state.worldState
) {
  assertFitTarget(P, profile);
  if (!activeShipHere(profile, world)) return null;
  const idx = Math.floor(+i);
  const list = bayList(group, idx, profile);
  if (!list || !list[idx]) return null;
  const id = list[idx];
  list[idx] = null;
  refreshFittedShip(P, profile);
  return { fromBay: true, ship: profile.ship, group, bay: idx, id, n: 1 };
}

/**
 * Safely return a cursor-held module picked from an Outfitting bay: refits its
 * original bay if still empty (or another empty bay in the same group), else
 * stores it in Station storage or the ship's hold so nothing is ever lost.
 */
export function returnBayHeld(
  held,
  P = state.player,
  profile = profileOf(P),
  world = state.worldState
) {
  if (!held || !held.fromBay || !held.id || !(held.n > 0)) return false;
  assertFitTarget(P, profile);
  const ship = held.ship && profile?.loadout?.[held.ship] ? held.ship : profile?.ship;
  const list = ship ? profile?.loadout?.[ship]?.[held.group] : null;
  if (Array.isArray(list)) {
    const idx = Number.isInteger(held.bay) && held.bay >= 0 && held.bay < list.length ? held.bay : -1;
    if (idx >= 0 && !list[idx]) {
      list[idx] = held.id;
      if (ship === profile.ship) refreshFittedShip(P, profile);
      return true;
    }
    const empty = list.findIndex(x => !x);
    if (empty >= 0) {
      list[empty] = held.id;
      if (ship === profile.ship) refreshFittedShip(P, profile);
      return true;
    }
  }
  const placed = addItem(STATION, held.id, 1, profile, world);
  if (placed < 1 && profile?.ship) {
    addItem(profile.ship, held.id, 1, profile, world);
  }
  return true;
}

/**
 * Place a module held from an Outfitting bay into Inventory slot `(where, idx)`.
 * Empty/matching slots take the module; occupied slots swap onto the cursor
 * when capacity allows — identical to regular Inventory clicks.
 */
export function placeBayHeldInSlot(
  held,
  where,
  slotIndex,
  profile = state.profile,
  world = state.worldState
) {
  if (!held || !held.fromBay || !held.id || !(held.n > 0)) {
    return { ok: false, moved: 0, held: null, message: "" };
  }
  const dest = where || STATION;
  const idx = Math.floor(+slotIndex);
  if (!Number.isInteger(idx) || idx < 0) {
    return { ok: false, moved: 0, held, message: "" };
  }
  const target = slotAt(dest, idx, profile, world);
  const stackCap = itemStack(held.id);
  const canMerge = target && target.id === held.id && target.n < stackCap;
  if (!target || canMerge) {
    if (spaceFor(dest, held.id, profile, world) < 1) {
      const m = MODULES[held.id];
      return {
        ok: false,
        moved: 0,
        held,
        message: `No room in ${nameOf(dest)} for ${m ? m.n : itemName(held.id)}.`,
      };
    }
    addItemToSlot(dest, idx, held.id, 1, profile, world);
    return { ok: true, moved: 1, held: null, message: "" };
  }
  // Swap with the occupied slot if removing `target` leaves room for `held.id`.
  const freed = target.n * (itemVol(target.id) || 0);
  const needed = itemVol(held.id) || 0;
  const free = freeOf(dest, profile, world);
  if (Number.isFinite(free) && free + freed < needed) {
    const m = MODULES[held.id];
    return {
      ok: false,
      moved: 0,
      held,
      message: `No room in ${nameOf(dest)} for ${m ? m.n : itemName(held.id)}.`,
    };
  }
  const took = takeItemFromSlot(dest, idx, target.id, target.n, profile, world);
  if (!(took > 0)) return { ok: false, moved: 0, held, message: "" };
  addItemToSlot(dest, idx, held.id, 1, profile, world);
  return {
    ok: true,
    moved: 1,
    swapped: true,
    held: { where: dest, slot: idx, id: target.id, n: took },
    message: "",
  };
}

/**
 * Place a cursor-held item (picked from Inventory or from an Outfitting bay)
 * into Outfitting bay `(group, i)` on the active ship. Swaps a displaced fitted
 * module onto the cursor when holding a single module, matching Inventory feel.
 */
export function placeHeldInBay(
  held,
  group,
  i,
  P = state.player,
  profile = profileOf(P),
  world = state.worldState
) {
  if (!held || !(held.n > 0)) return { ok: false, held: null, message: "" };
  assertFitTarget(P, profile);
  if (!activeShipHere(profile, world)) {
    return { ok: false, held, message: "No active ship stored at this station." };
  }
  if (!isModule(held.id) || !MODULES[held.id]) {
    return { ok: false, held, message: `${itemName(held.id)} cannot be equipped.` };
  }
  const m = MODULES[held.id];
  const idx = Math.floor(+i);
  const list = bayList(group, idx, profile);
  if (!list) {
    return { ok: false, held, message: `${m.n} does not fit on ${shipName(profile.ship)}.` };
  }
  if (m.g !== group) {
    return { ok: false, held, message: `${m.n} only fits in ${groupTitle(m.g)} bays.` };
  }
  const prev = list[idx] || null;
  if (prev === held.id && !held.fromBay) {
    return { ok: false, held, message: `${m.n} is already fitted in that bay.` };
  }
  if (held.n === 1) {
    list[idx] = held.id;
    refreshFittedShip(P, profile);
    const nextHeld = prev
      ? { fromBay: true, ship: profile.ship, group, bay: idx, id: prev, n: 1 }
      : null;
    return {
      ok: true,
      held: nextHeld,
      message: prev ? "" : `Equipped ${m.n}.`,
    };
  }
  // Holding a multi-module stack: fit 1 into the bay, store any displaced part,
  // and keep the rest of the stack on the cursor.
  const source = held.where || STATION;
  if (prev) {
    const dest = spaceFor(source, prev, profile, world) >= 1
      ? source
      : spaceFor(STATION, prev, profile, world) >= 1
        ? STATION
        : spaceFor(profile.ship, prev, profile, world) >= 1
          ? profile.ship
          : null;
    if (!dest) {
      return {
        ok: false,
        held,
        message: `No room in ${nameOf(source)} for the ${MODULES[prev].n}.`,
      };
    }
    addItem(dest, prev, 1, profile, world);
  }
  list[idx] = held.id;
  refreshFittedShip(P, profile);
  return {
    ok: true,
    held: { ...held, n: held.n - 1 },
    message: prev
      ? `Equipped ${m.n}. ${MODULES[prev].n} moved to storage.`
      : `Equipped ${m.n}.`,
  };
}

const fmtNum = v => {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return String(+n.toFixed(2));
};

function moduleShopPrice(id) {
  for (const shop of Object.values(SHOPS || {})) {
    for (const row of shop?.stock || []) {
      if ((row.kind || "item") === "item" && row.id === id && Number.isFinite(row.price)) {
        return row.price;
      }
    }
  }
  return null;
}

const KNOWN_MODULE_KEYS = new Set([
  "g", "n", "d", "vol", "weaponFamily",
  "mjps", "mj", "outputs",
  "spd", "turn", "draw", "boost", "ign", "bmax", "buse", "bfill",
  "dmg", "rate", "bspd", "barrels", "life",
  "period", "range",
  "cap", "cd", "ammo",
  "hp",
  "sh", "regen", "delay", "drain",
  "stats",
]);

function humaniseStatKey(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^\w/, c => c.toUpperCase());
}

/** Approximate maximum straight-line flight distance of a homing/dumbfire missile. */
function missileMaxReach(spec = MISSILE) {
  const sp0 = spec.sp0 || 0;
  const max = spec.max || sp0;
  const acc = spec.acc || 0;
  const life = spec.life || 0;
  if (!(acc > 0) || max <= sp0) return Math.round(max * life);
  const tAcc = Math.min(life, (max - sp0) / acc);
  const dAcc = sp0 * tAcc + 0.5 * acc * tAcc * tAcc;
  const dCruise = Math.max(0, life - tAcc) * max;
  return Math.round(dAcc + dCruise);
}

/**
 * Full player-facing statistics for any module `id` (equipped, stored, carried,
 * in a rift cache, in the Shop, or in My Assets). Extensible: any module adding
 * `stats: [[label, value], ...]` or new primitive fields in `data/modules.js`
 * surfaces them automatically without needing a UI rewrite.
 */
export function moduleInfoData(id, profile = state.profile) {
  if (!id || !isModule(id) || !MODULES[id]) return null;
  const m = MODULES[id];
  const group = MODULE_GROUPS.find(g => g.k === m.g);
  const groupName = group ? group.n : groupTitle(m.g);
  const hull = profile?.ship ? shipDef(profile.ship) : null;
  const sections = [];
  let kindLabel = `${groupName} module`;

  if (m.weaponFamily === "cannon" || (m.dmg != null && m.rate != null)) {
    kindLabel = `${groupName} · Autocannon`;
    const outputs = Math.max(1, m.barrels || 1);
    const volley = m.dmg * outputs;
    const dps = volley * m.rate;
    const bspd = m.bspd || 0;
    const life = m.life || BULLET_LIFETIME;
    const range = Math.round(bspd * life);
    const draw = m.draw ?? 0;
    const outRows = [
      ["Outputs", `${outputs} ${outputs === 1 ? "barrel" : "linked barrels"}`],
      ["Damage per bolt", `${fmtNum(m.dmg)} HP`],
      ["Volley damage", outputs > 1 ? `${fmtNum(volley)} HP (${fmtNum(m.dmg)} × ${outputs})` : `${fmtNum(volley)} HP`],
      ["Fire rate", `${fmtNum(m.rate)} shots/s (${fmtNum(1 / m.rate)} s cycle)`],
      ["Bolts per second", `${fmtNum(m.rate * outputs)}/s`],
      ["Sustained DPS", `${fmtNum(dps)} HP/s`],
    ];
    if (hull && Number.isFinite(hull.dmg) && hull.dmg !== 1) {
      outRows.push(["On " + hull.n, `${fmtNum(dps * hull.dmg)} HP/s (${fmtNum(hull.dmg)}× hull)`]);
    }
    sections.push({ title: "Weapon performance", rows: outRows });
    sections.push({
      title: "Range & energy",
      rows: [
        ["Effective range", bspd > 0 ? `${range} m` : "—"],
        ["Projectile speed", bspd > 0 ? `${fmtNum(bspd)} m/s` : "—"],
        ["Projectile lifetime", `${fmtNum(life)} s`],
        ["MJ usage (firing)", `${fmtNum(draw)} MJ/s`],
        ["MJ per shot", m.rate > 0 ? `${fmtNum(draw / m.rate)} MJ` : `${fmtNum(draw)} MJ`],
      ],
    });
  } else if (m.weaponFamily === "mining" || m.period != null) {
    kindLabel = `${groupName} · Mining beam`;
    const outputs = Math.max(1, m.barrels || m.outputs || 1);
    const rate = m.period > 0 ? outputs / m.period : 0;
    const draw = m.draw ?? 0;
    const beamRows = [
      ["Outputs", `${outputs} ${outputs === 1 ? "emitter" : "emitters"}`],
      ["Beam range", `${fmtNum(m.range ?? 0)} m (min 5 m)`],
      ["Cycle time", `${fmtNum(m.period)} s / ore`],
      ["Extraction rate", `${fmtNum(rate)} ore/s`],
      ["Contact rule", "Continuous (resets if broken)"],
    ];
    if (hull && Number.isFinite(hull.mine) && hull.mine !== 1 && m.period > 0) {
      beamRows.push(["On " + hull.n, `${fmtNum(m.period / hull.mine)} s / ore (${fmtNum(hull.mine)}× hull)`]);
    }
    sections.push({ title: "Beam performance", rows: beamRows });
    sections.push({
      title: "Energy",
      rows: [
        ["MJ usage (cutting)", `${fmtNum(draw)} MJ/s`],
        ["MJ per ore", `${fmtNum(draw * (m.period || 0))} MJ`],
      ],
    });
  } else if (m.weaponFamily === "missile" || (m.dmg != null && m.cd != null)) {
    kindLabel = `${groupName} · Missile launcher`;
    const outputs = Math.max(1, m.barrels || m.outputs || 1);
    const salvo = m.dmg * outputs;
    const dps = m.cd > 0 ? salvo / m.cd : 0;
    const draw = m.draw ?? 0;
    const outRows = [
      ["Outputs", `${outputs} ${outputs === 1 ? "launch tube" : "launch tubes"}`],
      ["Damage per missile", `${fmtNum(m.dmg)} HP`],
      ...(outputs > 1 ? [["Salvo damage", `${fmtNum(salvo)} HP`]] : []),
      ["Reload time", `${fmtNum(m.cd)} s (${m.cd > 0 ? fmtNum(1 / m.cd) : "0"}/s)`],
      ["Sustained DPS", `${fmtNum(dps)} HP/s`],
      ["Magazine capacity", `${fmtNum(m.cap ?? 0)} missiles (${fmtNum((m.cap ?? 0) * m.dmg)} HP total)`],
      ["Included ammo", `${fmtNum(m.ammo ?? 0)} missiles`],
      ["Restock price", `${fmtNum(MISSILE.unitPrice)} cr / missile`],
      ["MJ usage", `${fmtNum(draw)} MJ/s`],
    ];
    if (hull && Number.isFinite(hull.dmg) && hull.dmg !== 1) {
      outRows.splice(2, 0, ["On " + hull.n, `${fmtNum(m.dmg * hull.dmg)} HP (${fmtNum(hull.dmg)}× hull)`]);
    }
    sections.push({ title: "Launcher performance", rows: outRows });
    sections.push({
      title: "Range & guidance",
      rows: [
        ["Lock-on range", `${fmtNum(MISSILE.range)} m`],
        ["Max flight reach", `~${missileMaxReach(MISSILE)} m (${fmtNum(MISSILE.life)} s)`],
        ["Lock time", `${fmtNum(MISSILE.lock)} s`],
        ["Lock cone", `±${fmtNum(MISSILE.cone)}°`],
        ["Launch / top speed", `${fmtNum(MISSILE.sp0)} → ${fmtNum(MISSILE.max)} m/s`],
        ["Acceleration", `${fmtNum(MISSILE.acc)} m/s²`],
        ["Homing turn rate", `${fmtNum(MISSILE.turn)} rad/s (${Math.round((MISSILE.turn * 180) / Math.PI)}°/s)`],
      ],
    });
  } else if (m.spd != null) {
    kindLabel = `${groupName} · Drive`;
    const draw = m.draw ?? 0;
    const boost = m.boost ?? 0;
    sections.push({
      title: "Flight performance",
      rows: [
        ["Forward speed", `${fmtNum(m.spd)} m/s`],
        ["Boost speed", `${fmtNum(m.spd * 2)} m/s`],
        ["Reverse speed", `${fmtNum(m.spd * FLIGHT.reverse)} m/s`],
        ["Strafe / vertical", `${fmtNum(m.spd * FLIGHT.strafe)} m/s`],
        ["Turn multiplier", `${fmtNum(m.turn ?? 1)}×`],
      ],
    });
    const boostDur = m.buse > 0 ? `${fmtNum((m.bmax || 0) / m.buse)} s` : "—";
    const boostRefill = m.bfill > 0 ? `${fmtNum((m.bmax || 0) / m.bfill)} s` : "—";
    sections.push({
      title: "Energy & boost",
      rows: [
        ["MJ usage (thrusting)", `${fmtNum(draw)} MJ/s`],
        ["MJ usage (boosting)", `${fmtNum(draw + boost)} MJ/s (+${fmtNum(boost)} MJ/s)`],
        ["Boost ignition cost", `${fmtNum(m.ign ?? 0)} MJ`],
        ["Boost tank", `${fmtNum(m.bmax ?? 0)} units`],
        ["Boost burn rate", `${fmtNum(m.buse ?? 0)}/s (${boostDur} full burn)`],
        ["Boost recharge", `${fmtNum(m.bfill ?? 0)}/s (${boostRefill} to full)`],
      ],
    });
  } else if (m.sh != null) {
    kindLabel = `${groupName} · Deflector`;
    const fullTime = m.regen > 0 ? ` (${fmtNum(m.sh / m.regen)} s to full)` : "";
    sections.push({
      title: "Shield & energy",
      rows: [
        ["Shield capacity", `${fmtNum(m.sh)} HP`],
        ["Recharge rate", `${fmtNum(m.regen ?? 0)} HP/s${fullTime}`],
        ["Recharge delay", `${fmtNum(m.delay ?? 0)} s without hit`],
        ["MJ usage (upkeep)", `${fmtNum(m.draw ?? 0)} MJ/s`],
        ["Unpowered drain", `${fmtNum(m.drain ?? 0)} HP/s`],
      ],
    });
  } else if (m.hp != null) {
    kindLabel = `${groupName} · Armour`;
    const rows = [["Hull HP", `${fmtNum(m.hp)} HP`]];
    if (hull && Number.isFinite(hull.hpMul) && hull.hpMul !== 1) {
      rows.push(["On " + hull.n, `${fmtNum(m.hp * hull.hpMul)} HP (${fmtNum(hull.hpMul)}× hull)`]);
    }
    rows.push(["MJ usage", `${fmtNum(m.draw ?? 0)} MJ/s (passive)`]);
    sections.push({ title: "Armour stats", rows });
  } else if (m.mjps != null) {
    kindLabel = `${groupName} · Reactor`;
    const outputs = Math.max(1, m.outputs || 1);
    sections.push({
      title: "Power generation",
      rows: [
        ["Power output", `+${fmtNum(m.mjps)} MJ/s`],
        ["Outputs", `${outputs} ${outputs === 1 ? "power bus" : "power buses"}`],
        ["MJ usage", "0 MJ/s (generates power)"],
      ],
    });
  } else if (m.mj != null) {
    kindLabel = `${groupName} · Capacitor`;
    sections.push({
      title: "Energy storage",
      rows: [
        ["Capacity", `${fmtNum(m.mj)} MJ`],
        ["MJ usage", `${fmtNum(m.draw ?? 0)} MJ/s (passive)`],
      ],
    });
  }

  // Forward-compatible extension hook: any `stats: [[label, value], ...]` array
  // or future custom fields added in `data/modules.js` render here automatically.
  const extraRows = [];
  if (Array.isArray(m.stats)) {
    for (const entry of m.stats) {
      if (Array.isArray(entry) && entry.length >= 2) {
        extraRows.push([String(entry[0]), String(entry[1])]);
      } else if (entry && typeof entry === "object" && entry.label != null) {
        extraRows.push([String(entry.label), String(entry.value ?? "")]);
      }
    }
  }
  for (const [k, v] of Object.entries(m)) {
    if (KNOWN_MODULE_KEYS.has(k) || v == null) continue;
    if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") {
      extraRows.push([humaniseStatKey(k), typeof v === "number" ? fmtNum(v) : String(v)]);
    }
  }
  if (extraRows.length) {
    sections.push({ title: "Additional stats", rows: extraRows });
  }

  const layout = profile?.ship ? layoutFor(profile.ship) : null;
  const totalSlots = layout && Number.isFinite(layout[m.g]) ? layout[m.g] : null;
  const fittedList = profile?.ship ? profile?.loadout?.[profile.ship]?.[m.g] : null;
  const fittedCount = Array.isArray(fittedList) ? fittedList.filter(Boolean).length : 0;
  const stack = itemStack(id);
  const buyPrice = moduleShopPrice(id);
  const resale = itemValue(id);
  const fitRows = [["Fits slot", groupName]];
  if (totalSlots !== null && hull) {
    fitRows.push([`${hull.n} bays`, totalSlots > 0 ? `${fittedCount} / ${totalSlots} fitted` : "No bays"]);
  }
  fitRows.push(["Volume", `${fmtNum(itemVol(id))} m³`]);
  fitRows.push(["Stack size", Number.isFinite(stack) ? String(stack) : "Unlimited"]);
  if (buyPrice !== null) fitRows.push(["Shop price", `${buyPrice} cr`]);
  if (resale > 0) fitRows.push(["Resale value", `${resale} cr`]);
  sections.push({ title: "Fitting & storage", rows: fitRows });

  return {
    id,
    name: m.n || itemName(id),
    group: m.g,
    groupName,
    kindLabel,
    description: m.d || "",
    sections,
  };
}

/** True when `group` is a real bay group on the ship being flown. */
export const isBayGroup = (group, profile = state.profile) =>
  Object.prototype.hasOwnProperty.call(layoutFor(profile.ship), group);

/**
 * How many of module `id` are owned across `world`'s station storage,
 * `profile`'s ship holds, and fitted bays of `profile`'s loadouts.
 */
export function ownedCount(id, profile = state.profile, world = state.worldState) {
  let n = countOf(STATION, id, profile, world);
  for (const hold of Object.values(profile.holds || {})) n += (hold && hold[id]) || 0;
  for (const fit of Object.values(profile.loadout || {})) {
    for (const bays of Object.values(fit || {})) {
      if (Array.isArray(bays)) n += bays.filter(m => m === id).length;
    }
  }
  return n;
}

/** True when at least one module `id` is owned (see ownedCount). */
export const ownsModule = (id, profile = state.profile, world = state.worldState) =>
  ownedCount(id, profile, world) > 0;
