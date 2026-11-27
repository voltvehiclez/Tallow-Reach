// Host-side simulation execution for visiting guests (step 16 follow-up).
//
// A guest's screen never simulates or decides outcomes for shops, outfitting,
// inventory moves, contract boards or story choices. Every guest press arrives
// over `net/` as a compact `act` intent, the host resolves the guest's record
// `(P, P.profile, P.guestWorld)`, runs the exact same shared `sim/` functions
// single player uses, and returns the updated state as a `visit` snapshot.

import { state } from "../state/state.js";
import { DEFAULT_PLACE, stationKeyAt } from "../data/places.js";
import { canDiscard, isItem, itemName } from "../data/items.js";
import { BASE_DEFAULT, BASE_MODULES } from "../data/station.js";
import { STORY_MISSIONS, TEST_MISSIONS } from "../data/missions/index.js";
import { emit } from "../util/events.js";
import { setHomeStation } from "./session.js";
import { setWeapon, setSecondaryWeapon } from "./weapons.js";
import {
  buyItem,
  buyShip,
  repairShip,
  restockMissiles,
  selectShip,
  sellHold,
  sellInventoryItem,
  sellShip,
  sellStored,
  storeHold,
  upgradeBase,
  withdrawStored,
} from "./economy.js";
import {
  equipModuleFromInventory,
  fitModuleFrom,
  pickupFittedBay,
  placeBayHeldInSlot,
  placeHeldInBay,
  returnBayHeld,
  swapFittedBays,
  unequipTo,
} from "./fitting.js";
import {
  STATION,
  countOf,
  moveItem,
  pickupSlot,
  placeHeldStack,
  returnHeldStack,
  shiftMoveSlot,
  slotAt,
  stackAll,
  takeFromSlot,
  takeItem,
  takeItemFromSlot,
} from "./inventory.js";
import { canUse, useItem } from "./consumables.js";
import { acceptContract, abandonContract, completeContract, ensureBoard, refreshBoard } from "./contracts.js";
import { acceptMission, chooseMission, missionOfferStation, nextMissionDialogue } from "./missions.js";

const whole = n => Math.max(0, Math.floor(Number(n) || 0));

/** Build a fresh, per-guest station/board/mission-drop world seeded with arrived lockers. */
export function createGuestWorld(place = DEFAULT_PLACE, lockers = []) {
  const rb = state.worldState?.base && typeof state.worldState.base === "object" ? state.worldState.base : {};
  const base = {};
  for (const [id, m] of Object.entries(BASE_MODULES)) {
    const lo = BASE_DEFAULT[id] ?? 0;
    const raw = Math.floor(Number(rb[id]));
    base[id] = Number.isFinite(raw) ? Math.max(lo, Math.min(m.max, raw)) : lo;
  }
  const world = {
    place: place || DEFAULT_PLACE,
    base,
    stationStores: {},
    stationSlots: {},
    board: [],
    boards: {},
    boardTimers: {},
    missionState: {},
  };
  const origins = {};
  const unknownLockers = [];
  for (const raw of Array.isArray(lockers) ? lockers : []) {
    const item = typeof raw?.item === "string" ? raw.item : "";
    const count = whole(raw?.count);
    const station = typeof raw?.station === "string" ? raw.station : "";
    const origin = typeof raw?.origin === "string" && raw.origin ? raw.origin : station;
    if (!item || !(count > 0) || !station) continue;
    if (!isItem(item)) {
      unknownLockers.push({ item, count, station, origin });
      continue;
    }
    const stock = world.stationStores[station] || (world.stationStores[station] = {});
    stock[item] = (stock[item] || 0) + count;
    const originMap = origins[station] || (origins[station] = {});
    if (!originMap[item]) originMap[item] = origin;
  }
  ensureBoard(world, world.place);
  return { world, origins, unknownLockers };
}

/** Return any stack currently held on a guest's cursor safely back to its profile/world. */
export function cancelGuestHeld(P) {
  const held = P?.guestHeld;
  if (!held || !(held.n > 0)) {
    if (P) P.guestHeld = null;
    return false;
  }
  P.guestHeld = null;
  if (held.fromBay) {
    returnBayHeld(held, P, P.profile, P.guestWorld);
  } else {
    returnHeldStack(held, P.profile, P.guestWorld);
  }
  return true;
}

/**
 * Snapshot a live guest's profile/world/lockers without mutating live cursor state
 * (any cursor-held item is folded back into the snapshot copy so suitcase write-backs
 * never drop or duplicate items mid-drag).
 */
export function guestLockerSnapshot(P) {
  const world = P?.guestWorld;
  const stores = JSON.parse(JSON.stringify(world?.stationStores || {}));
  const held = P?.guestHeld;
  if (held && !held.fromBay && held.kind === "station" && held.id && held.n > 0) {
    const key = held.stationKey || stationKeyAt(P.place || DEFAULT_PLACE) || `${P.place || DEFAULT_PLACE}:station`;
    const stock = stores[key] || (stores[key] = {});
    stock[held.id] = (stock[held.id] || 0) + held.n;
  }
  const origins = P?.guestLockerOrigins || {};
  const lockers = [];
  for (const [station, stock] of Object.entries(stores)) {
    if (!stock || typeof stock !== "object") continue;
    for (const [item, count] of Object.entries(stock)) {
      const n = whole(count);
      if (n <= 0) continue;
      lockers.push({
        item,
        count: n,
        station,
        origin: origins[station]?.[item] || station,
      });
    }
  }
  for (const unk of P?.guestUnknownLockers || []) {
    if (unk?.item && unk.count > 0 && unk.station) lockers.push({ ...unk });
  }
  return lockers;
}

/** Snapshot a guest's profile for suitcase write-back, preserving any non-station cursor hold. */
export function guestProfileSnapshot(P) {
  const prof = P?.profile ? JSON.parse(JSON.stringify(P.profile)) : null;
  if (!prof) return null;
  const held = P?.guestHeld;
  if (held && held.id && held.n > 0) {
    if (held.fromBay) {
      const ship = held.ship && prof.loadout?.[held.ship] ? held.ship : prof.ship;
      const bays = ship ? prof.loadout?.[ship]?.[held.group] : null;
      const idx = Number.isInteger(held.bay) && held.bay >= 0 ? held.bay : -1;
      if (Array.isArray(bays) && idx >= 0 && idx < bays.length && !bays[idx]) {
        bays[idx] = held.id;
      } else if (prof.ship) {
        const hold = prof.holds[prof.ship] || (prof.holds[prof.ship] = {});
        hold[held.id] = (hold[held.id] || 0) + held.n;
      }
    } else if (held.kind !== "station") {
      const ship = held.ship && prof.holds?.[held.ship] ? held.ship : prof.ship;
      if (ship) {
        const hold = prof.holds[ship] || (prof.holds[ship] = {});
        hold[held.id] = (hold[held.id] || 0) + held.n;
      }
    }
  }
  return prof;
}

/**
 * Execute one validated guest `act` intent authoritatively on `(P, P.profile, P.guestWorld)`.
 * Returns `{ ok, changed, shipsChanged, notice, sound }`.
 */
export function runGuestAction(P, action) {
  if (!P || P.dead || !P.profile || !P.guestWorld || !action || typeof action !== "object") {
    return { ok: false, changed: false, shipsChanged: false, notice: "", sound: "" };
  }
  const profile = P.profile;
  const world = P.guestWorld;
  const here = P.place || world.place || DEFAULT_PLACE;
  world.place = here;

  const op = String(action.op || "");
  let ok = false;
  let changed = false;
  let shipsChanged = false;
  let notice = "";
  let sound = "";
  let inventoryTouched = false;

  const denyDock = () => ({ ok: false, changed: false, shipsChanged: false, notice: "Dock at a station first.", sound: "" });

  switch (op) {
    case "pw": {
      const slot = Math.floor(Number(action.slot));
      if (!Number.isInteger(slot) || slot < 0 || slot >= 5) break;
      const prev = profile.pw;
      setWeapon(slot, P);
      ok = true;
      changed = profile.pw !== prev;
      shipsChanged = changed;
      break;
    }

    case "sw": {
      const slot = Math.floor(Number(action.slot));
      if (!Number.isInteger(slot) || slot < 0 || slot >= 5) break;
      const prev = profile.sw;
      setSecondaryWeapon(slot, P);
      ok = true;
      changed = profile.sw !== prev;
      shipsChanged = changed;
      break;
    }

    case "invCancel":
      changed = cancelGuestHeld(P);
      ok = true;
      break;

    case "invClick": {
      const where = action.where || "";
      const slot = Number.isInteger(action.slot) ? action.slot : -1;
      if (!where || slot < 0) break;
      if (!P.docked && where !== profile.ship) break;
      const held = P.guestHeld && P.guestHeld.n > 0 ? P.guestHeld : null;
      if (!P.docked && held?.fromBay) break;
      if (action.shift) {
        if (!P.docked) break;
        const other = action.toWhere || "";
        if (!other || other === where) break;
        const res = shiftMoveSlot(where, slot, other, profile, world);
        ok = res.ok;
        changed = res.ok;
        notice = res.message || "";
        if (changed) { inventoryTouched = true; sound = "click"; }
        break;
      }
      if (held) {
        const res = held.fromBay
          ? placeBayHeldInSlot(held, where, slot, profile, world)
          : placeHeldStack(held, where, slot, { one: false }, profile, world);
        P.guestHeld = res.held || null;
        ok = res.ok;
        changed = res.ok;
        notice = res.message || "";
        if (changed) { inventoryTouched = true; sound = "click"; }
        break;
      }
      const picked = pickupSlot(where, slot, profile, world);
      if (picked) {
        P.guestHeld = picked;
        ok = true;
        changed = true;
        sound = "click";
      }
      break;
    }

    case "invRight": {
      const where = action.where || "";
      const slot = Number.isInteger(action.slot) ? action.slot : -1;
      const held = P.guestHeld && P.guestHeld.n > 0 ? P.guestHeld : null;
      if (!held || !where || slot < 0) break;
      if (!P.docked && (where !== profile.ship || held.fromBay)) break;
      const res = held.fromBay
        ? placeBayHeldInSlot(held, where, slot, profile, world)
        : placeHeldStack(held, where, slot, { one: true }, profile, world);
      P.guestHeld = res.held || null;
      ok = res.ok;
      changed = res.ok;
      notice = res.message || "";
      if (changed) { inventoryTouched = true; sound = "click"; }
      break;
    }

    case "invTake": {
      const where = action.where || "";
      const slot = Number.isInteger(action.slot) ? action.slot : -1;
      const amount = Math.floor(Number(action.n) || 0);
      if (!where || slot < 0 || amount < 1) break;
      if (!P.docked && where !== profile.ship) break;
      if (P.guestHeld) cancelGuestHeld(P);
      const res = takeFromSlot(where, slot, amount, profile, world);
      ok = res.ok;
      if (res.ok && res.held) {
        P.guestHeld = res.held;
        changed = true;
        sound = "click";
      } else {
        notice = res.message || "";
      }
      break;
    }

    case "invStack": {
      const where = action.where || "";
      if (!where) break;
      if (!P.docked && where !== profile.ship) break;
      let returned = false;
      if (P.guestHeld && P.guestHeld.where === where) {
        cancelGuestHeld(P);
        returned = true;
      }
      const res = stackAll(where, profile, world);
      changed = returned || res.changed;
      ok = changed;
      notice = res.message || "";
      if (changed) sound = "click";
      break;
    }

    case "invMove": {
      if (!P.docked) return denyDock();
      const where = action.where || "";
      const toWhere = action.toWhere || "";
      const id = action.id || "";
      const amount = action.n > 0 ? action.n : Infinity;
      if (!where || !toWhere || !id) break;
      const moved = moveItem(where, toWhere, id, amount, profile, world);
      changed = moved > 0;
      ok = changed;
      if (changed) { inventoryTouched = true; sound = "click"; }
      break;
    }

    case "invSell": {
      if (!P.docked) return denyDock();
      const id = action.id || "";
      const where = action.where || "";
      const amount = action.n > 0 ? action.n : null;
      const slot = Number.isInteger(action.slot) ? action.slot : -1;
      notice = sellInventoryItem(id, where, amount, profile, world, slot);
      changed = String(notice || "").startsWith("Sold ");
      ok = changed;
      if (changed) { inventoryTouched = true; sound = "buy"; }
      break;
    }

    case "invDiscard": {
      const id = action.id || "";
      const where = action.where || "";
      const slot = Number.isInteger(action.slot) ? action.slot : -1;
      const n = Math.floor(Number(action.n) || 0);
      if (!P.docked && where !== profile.ship) break;
      if (!canDiscard(id) || !(n > 0)) {
        notice = "That cannot be discarded.";
        break;
      }
      const avail = slot >= 0
        ? (slotAt(where, slot, profile, world)?.id === id ? slotAt(where, slot, profile, world).n : 0)
        : countOf(where, id, profile, world);
      if (n > avail) {
        notice = `Enter a whole number from 1 to ${avail}.`;
        break;
      }
      const took = slot >= 0
        ? takeItemFromSlot(where, slot, id, n, profile, world)
        : takeItem(where, id, n, profile, world);
      if (took > 0) {
        changed = true;
        ok = true;
        inventoryTouched = true;
        notice = `${took}\u00d7 ${itemName(id)} discarded.`;
        sound = "click";
      }
      break;
    }

    case "invUse": {
      const id = action.id || "";
      const where = action.where || profile.ship;
      if (!P.docked && where !== profile.ship) break;
      if (!canUse(id)) {
        notice = `${itemName(id)} cannot be used.`;
        break;
      }
      const before = countOf(where, id, profile, world);
      notice = useItem(id, where, P, profile);
      const after = countOf(where, id, profile, world);
      changed = after < before;
      ok = changed;
      if (changed) { inventoryTouched = true; sound = "click"; }
      break;
    }

    case "invEquip": {
      if (!P.docked) return denyDock();
      const res = equipModuleFromInventory(action.where || STATION, action.slot, action.id, P, profile, world);
      ok = res.ok;
      changed = res.ok;
      shipsChanged = res.ok;
      notice = res.message || "";
      if (changed) { inventoryTouched = true; sound = "click"; }
      break;
    }

    case "fitClick": {
      if (!P.docked) return denyDock();
      const group = action.group || "";
      const bay = Number.isInteger(action.bay) ? action.bay : -1;
      if (!group || bay < 0) break;
      if (action.shift) {
        const res = unequipTo(group, bay, STATION, -1, P, profile, world);
        ok = res.ok;
        changed = res.ok;
        shipsChanged = res.ok;
        notice = res.message || "";
        if (changed) { inventoryTouched = true; sound = "click"; }
        break;
      }
      const held = P.guestHeld && P.guestHeld.n > 0 ? P.guestHeld : null;
      if (held) {
        const res = placeHeldInBay(held, group, bay, P, profile, world);
        P.guestHeld = res.held || null;
        ok = res.ok;
        changed = res.ok;
        shipsChanged = res.ok;
        notice = res.message || "";
        if (changed) { inventoryTouched = true; sound = "click"; }
        break;
      }
      const picked = pickupFittedBay(group, bay, P, profile, world);
      if (picked) {
        P.guestHeld = picked;
        ok = true;
        changed = true;
        shipsChanged = true;
        sound = "click";
      }
      break;
    }

    case "fitPlace": {
      if (!P.docked) return denyDock();
      const held = P.guestHeld && P.guestHeld.n > 0 ? P.guestHeld : null;
      const group = action.group || "";
      const bay = Number.isInteger(action.bay) ? action.bay : -1;
      if (!held || !group || bay < 0) break;
      const res = placeHeldInBay(held, group, bay, P, profile, world);
      P.guestHeld = res.held || null;
      ok = res.ok;
      changed = res.ok;
      shipsChanged = res.ok;
      notice = res.message || "";
      if (changed) { inventoryTouched = true; sound = "click"; }
      break;
    }

    case "fitFrom": {
      if (!P.docked) return denyDock();
      const res = fitModuleFrom(action.where || STATION, action.slot, action.group, action.bay, action.id, P, profile, world);
      ok = res.ok;
      changed = res.ok;
      shipsChanged = res.ok;
      notice = res.message || "";
      if (changed) { inventoryTouched = true; sound = "click"; }
      break;
    }

    case "bayUnequip": {
      if (!P.docked) return denyDock();
      const res = unequipTo(action.group, action.bay, action.toWhere || STATION, action.toSlot, P, profile, world);
      ok = res.ok;
      changed = res.ok;
      shipsChanged = res.ok;
      notice = res.message || "";
      if (changed) { inventoryTouched = true; sound = "click"; }
      break;
    }

    case "baySwap": {
      if (!P.docked) return denyDock();
      const res = swapFittedBays(action.group, action.bay, action.toSlot, P, profile);
      ok = res.ok;
      changed = res.ok;
      shipsChanged = res.ok;
      notice = res.message || "";
      if (changed) sound = "click";
      break;
    }

    case "sel": {
      if (!P.docked) return denyDock();
      if (P.guestHeld) cancelGuestHeld(P);
      const prev = profile.ship;
      const err = selectShip(action.id, P, profile, world);
      changed = profile.ship !== prev;
      ok = !err;
      shipsChanged = changed;
      notice = err || "";
      if (changed) { inventoryTouched = true; sound = "click"; }
      break;
    }

    case "buyShip": {
      if (!P.docked) return denyDock();
      if (P.guestHeld) cancelGuestHeld(P);
      const before = profile.ships.length;
      const res = buyShip(action.id, profile, world, action.n > 0 ? action.n : 1, null, P);
      changed = profile.ships.length > before;
      ok = changed;
      shipsChanged = changed;
      notice = res || "";
      if (changed) { inventoryTouched = true; sound = "buy"; }
      break;
    }

    case "sellShip": {
      if (!P.docked) return denyDock();
      if (P.guestHeld) cancelGuestHeld(P);
      const before = profile.ships.length;
      notice = sellShip(action.id, P, profile, world) || "";
      changed = profile.ships.length < before;
      ok = changed;
      shipsChanged = changed;
      if (changed) { inventoryTouched = true; sound = "buy"; }
      break;
    }

    case "rp": {
      if (!P.docked) return denyDock();
      const before = profile.hp?.[action.id] ?? 1;
      notice = repairShip(action.id, P, profile) || "";
      changed = (profile.hp?.[action.id] ?? 1) > before;
      ok = changed;
      shipsChanged = changed;
      if (changed) sound = "repair";
      break;
    }

    case "home":
      if (!P.docked) return denyDock();
      notice = setHomeStation(P, profile);
      changed = true;
      ok = true;
      sound = "click";
      break;

    case "buy": {
      if (!P.docked) return denyDock();
      if (P.guestHeld) cancelGuestHeld(P);
      const beforeCr = profile.cr;
      notice = buyItem(action.shop, action.id, action.n > 0 ? action.n : 1, P, profile, world, action.kind || null) || "";
      changed = profile.cr !== beforeCr;
      ok = changed;
      shipsChanged = changed && action.kind === "ship";
      if (changed) { inventoryTouched = true; sound = "buy"; }
      break;
    }

    case "wr": {
      if (!P.docked) return denyDock();
      const beforeMsl = profile.msl;
      notice = restockMissiles(P, profile) || "";
      changed = profile.msl !== beforeMsl;
      ok = changed;
      shipsChanged = changed;
      if (changed) sound = "buy";
      break;
    }

    case "dep":
      if (!P.docked) return denyDock();
      if (P.guestHeld) cancelGuestHeld(P);
      notice = storeHold(profile, world);
      changed = true;
      ok = true;
      inventoryTouched = true;
      sound = "click";
      break;

    case "wd":
      if (!P.docked) return denyDock();
      if (P.guestHeld) cancelGuestHeld(P);
      withdrawStored(profile, world);
      changed = true;
      ok = true;
      inventoryTouched = true;
      sound = "click";
      break;

    case "sellh": {
      if (!P.docked) return denyDock();
      if (P.guestHeld) cancelGuestHeld(P);
      const beforeCr = profile.cr;
      notice = sellHold(profile, world);
      changed = profile.cr !== beforeCr;
      ok = changed;
      if (changed) { inventoryTouched = true; sound = "buy"; }
      break;
    }

    case "sells": {
      if (!P.docked) return denyDock();
      if (P.guestHeld) cancelGuestHeld(P);
      const beforeCr = profile.cr;
      notice = sellStored(profile, world);
      changed = profile.cr !== beforeCr;
      ok = changed;
      if (changed) { inventoryTouched = true; sound = "buy"; }
      break;
    }

    case "up": {
      if (!P.docked) return denyDock();
      const mod = action.id;
      if (!BASE_MODULES[mod]) break;
      const beforeLvl = world.base?.[mod] ?? 0;
      upgradeBase(mod, profile, world);
      changed = (world.base?.[mod] ?? 0) > beforeLvl;
      ok = changed;
      if (changed) sound = "buy";
      break;
    }

    case "acc": {
      if (!P.docked) return denyDock();
      notice = acceptContract(action.slot, profile, world, here, P) || "";
      changed = Boolean(notice);
      ok = changed;
      if (changed) { shipsChanged = true; sound = "click"; }
      break;
    }

    case "ref": {
      if (!P.docked) return denyDock();
      const before = JSON.stringify(world.boards?.[here] || world.board || []);
      notice = refreshBoard(world, here) || "";
      const after = JSON.stringify(world.boards?.[here] || world.board || []);
      changed = before !== after;
      ok = true;
      sound = "click";
      break;
    }

    case "drop": {
      const target = action.id || action.slot;
      notice = abandonContract(target, profile, P) || "";
      changed = Boolean(notice);
      ok = changed;
      if (changed) sound = "click";
      break;
    }

    case "done": {
      if (!P.docked) return denyDock();
      if (P.guestHeld) cancelGuestHeld(P);
      const target = action.id || action.slot;
      const beforeCount = (profile.missions || []).length;
      notice = completeContract(target, profile, P, world) || "";
      changed = (profile.missions || []).length !== beforeCount;
      ok = changed;
      if (changed) { inventoryTouched = true; sound = "buy"; }
      break;
    }

    case "story": {
      if (!P.docked) return denyDock();
      const offer = [...STORY_MISSIONS, ...TEST_MISSIONS].find(m => m.id === action.id);
      if (!offer || missionOfferStation(offer) !== here) break;
      const mission = acceptMission(offer, profile, here, P);
      changed = !!mission;
      ok = changed;
      if (changed) { shipsChanged = true; sound = "click"; }
      break;
    }

    case "dlgNext": {
      changed = nextMissionDialogue(action.id, profile, P);
      ok = changed;
      if (changed) sound = "click";
      break;
    }

    case "dlgChoice": {
      changed = chooseMission(action.id, action.choice, profile, P);
      ok = changed;
      if (changed) sound = "click";
      break;
    }

    default:
      break;
  }

  if (inventoryTouched) {
    try { emit("mission-inventory-changed", { player: P, profile }); } catch (e) {}
  }
  return { ok, changed, shipsChanged, notice, sound };
}
