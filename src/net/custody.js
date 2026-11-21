// Custody: the pilot's suitcase (refactor step 16, slice 1; the save fields it
// writes are slice 2's — see `net/multiplayer.js`).
//
// A pilot lives in exactly one world at a time. Flying into somebody else's world
// they carry a **bundle** — the suitcase — and the host is the only writer of the
// copy inside it. Coming home, the suitcase is opened over the home save. This file
// is that whole idea in plain objects: no networking, no screen, and no save it was
// handed is ever mutated.
//
// The four verbs (the plan is step 16 in docs/REFACTOR_PLAN.md):
//
//   checkOut(save)                 pack the open-world pilot into a bundle
//   checkIn(save, bundle)          the reverse: a new home save with the bundle applied
//   relocate(bundle, world)        move whatever a world lacks to its arrival station
//   compare(a, b)                  (epoch, rev) ordering, plus `summary(a)` for a screen
//
// and the facts a host needs about a bundle without trusting it:
//
//   hashToken(token, salt)         the one function that turns a secret into what a host stores
//   tokenCheck(token, hash, salt)  does this secret name this guest?
//   handshake({...})               the version / world / token check, with a sentence for each refusal
//   summary(bundle)                "600 cr · 1 ship · 0 m³", for the choice screen
//   uniqueName(name, taken)        the host's name wins; later joiners get *, **, ***
//
// **The rules this file keeps**
//
//  - Items are MOVED, never copied. `checkOut` empties the home stations it packs,
//    and a stock that cannot legally sit at the destination is carried inside the
//    bundle instead of being written into the host's world.
//  - Only `TRAVEL_FIELDS` travel, plus the lockers (which live in a save's world
//    half). Missions, flags and stats stay in the home save: `checkIn` writes them
//    back from the home profile after sanitizing, so nothing can leak into them.
//  - The lockers travel as stacks carrying their `origin` station, so `relocate`
//    puts each stack back where it came from the moment that world has the station
//    again. Nothing is refused or deleted for lack of room: an over-full station is
//    flagged and only refuses new deposits (`net/station-inventory.js`).
//  - Unknown item, module or ship ids are kept untouched. A newer build may add
//    content this build has never heard of; losing it would be worse than holding
//    it. Whole unknown stacks ride in `lockers` (flagged `unknown`), and content ids
//    the sanitizer would reject are re-inserted by hand after it has run.
//
// **Bundle shape** (every entry is data, so a host can store it):
//
//   { v, worldId, hostName, guestId, token, name, epoch, rev, homeStation,
//     profile,                             the TRAVEL_FIELDS half, cleaned
//     lockers: [{ item, count, station, origin, unknown }],
//     unknown: { holds: [{ ship, item, count }], modules: [...], ships: [...] },
//     shipsAt: { shipId: placeId },        where a moved hull used to sit
//     summary: { cr, ships, volume, text } }
//
// **A note on `mergeProfile`.** Step 9's helper sanitizes the merged save, and the
// sanitizer drops a module or item id it does not recognise. Losing a known stack
// would break "items are moved, never copied", so `checkIn` builds its save itself,
// merges the unknown content back by hand, and `totals()` in the tests proves every
// stack that left comes back exactly once.

import { sanitizeProfile, sanitizeSave, cleanAway, SAVE_VERSION } from "../state/profile.js";
import { isItem, isModule, itemVol, newStock } from "../data/items.js";
import { isShipId } from "../data/ships.js";
import { MODULES } from "../data/modules.js";
import { ARRIVAL_STATION_KEY, TRAVEL_FIELDS, HOME_FIELDS, NET, KEY } from "../data/multiplayer.js";
import { inventoryOf, stockVolume, guardOverfull } from "./station-inventory.js";
import { stationIn } from "./world-places.js";
import { stationKeyAt, isPocket } from "../data/places.js";

/* ------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* ------------------------------------------------------------------------- */

const clone = value => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const isPlainObject = value => !!value && typeof value === "object" && !Array.isArray(value);
const whole = value => Math.max(0, Math.floor(Number(value) || 0));
const idText = value => (typeof value === "string" && value.trim() ? value.trim().slice(0, 160) : null);
const has = (object, key) => !!object && Object.prototype.hasOwnProperty.call(object, key);

/** Is this id something this build knows? An id it does not know is an unknown, not an error. */
export const knownItem = id => isItem(id);
export const knownModule = id => isModule(id) && !!MODULES[id];
export const knownShip = id => isShipId(id);

/**
 * One locker stack — `{ item, count, station, origin, unknown }`.
 *
 *   item     the content id, kept whether or not this build knows it
 *   count    whole units, never zero
 *   station  the station key it must sit at
 *   origin   the station key it came from (where `relocate` sends it back)
 *   unknown  true when this build cannot price the item
 */
export function makeLocker(item, count, station, origin) {
  const id = idText(item);
  const amount = whole(count);
  const at = idText(station);
  if (!id || !amount || !at) return null;
  return { item: id, count: amount, station: at, origin: idText(origin) || at, unknown: !isItem(id) };
}

const lockerKey = locker => `${locker.station} | ${locker.unknown ? 1 : 0} | ${locker.item}`;

/**
 * Merge locker lists, summing stacks of the same item at the same station. The
 * first stack seen keeps its `origin`: the place a thing left is the place it goes
 * back to, and a later re-pack must not overwrite that with somewhere it passed
 * through on the way.
 */
export function mergeLockers(...lists) {
  const out = [];
  const byKey = new Map();
  for (const list of lists) {
    for (const raw of Array.isArray(list) ? list : []) {
      const locker = makeLocker(raw?.item, raw?.count, raw?.station, raw?.origin ?? raw?.station);
      if (!locker) continue;
      const key = lockerKey(locker);
      if (byKey.has(key)) byKey.get(key).count += locker.count;
      else {
        byKey.set(key, locker);
        out.push(locker);
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------------- */
/* Tokens, names, ordering                                                    */
/* ------------------------------------------------------------------------- */

const SECRET_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/**
 * A fresh secret: `NET.tokenBytes` characters from the browser's own crypto. It
 * guards against an accident (a link pasted into the wrong chat), not an attacker
 * (vision pillar 5), but a guessable token would make an ordinary mistake look like
 * a join. Outside a browser there is no crypto, and the fallback says so in its own
 * comment rather than throwing and blocking the whole flow.
 */
export function makeToken(bytes = NET.tokenBytes) {
  const size = Math.max(16, whole(bytes) || NET.tokenBytes);
  const out = new Array(size);
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
    const raw = new Uint8Array(size);
    cryptoApi.getRandomValues(raw);
    for (let i = 0; i < size; i++) out[i] = SECRET_ALPHABET[raw[i] % SECRET_ALPHABET.length];
  } else {
    for (let i = 0; i < size; i++) out[i] = SECRET_ALPHABET[Math.floor(Math.random() * SECRET_ALPHABET.length)];
  }
  return out.join("");
}

/**
 * The non-secret form of a token: what a host actually stores
 * (`world.guests[guestId].tokenHash`). FNV-1a twice, salted with the guest id, so
 * one person's token reads differently to a host than to anyone else and the same
 * token for two guests reads differently. The token itself never reaches a save.
 */
export function hashToken(token, salt = "") {
  const text = `${String(token || "")} | ${String(salt || "")}`;
  let h = 0x811c9dc5;
  for (let pass = 0; pass < 2; pass++) {
    h = (0x811c9dc5 ^ Math.imul(pass + 1, 0x9e3779b9)) >>> 0;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
    h >>>= 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Does `token` name the guest whose `tokenHash` is stored under `salt`? Compared in full, without early exit. */
export function tokenCheck(token, tokenHash, salt = "") {
  const a = hashToken(token, salt);
  const b = String(tokenHash || "");
  if (!b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Two copies of one pilot, ordered as the plan says: the higher `epoch` wins, and
 * inside one epoch the higher `rev` wins. A missing or unreadable number ranks
 * lowest, so any real copy beats no copy. Returns -1 when `a` is newer, 1 when `b`
 * is, and 0 on a tie (the caller then shows both and lets the player choose).
 */
export function compare(a, b) {
  const rank = copy => {
    const epoch = Number.isFinite(Number(copy?.epoch)) ? Number(copy.epoch) : -Infinity;
    const rev = Number.isFinite(Number(copy?.rev)) ? Number(copy.rev) : -Infinity;
    return { epoch, rev };
  };
  const left = rank(a), right = rank(b);
  if (left.epoch !== right.epoch) return left.epoch > right.epoch ? -1 : 1;
  if (left.rev !== right.rev) return left.rev > right.rev ? -1 : 1;
  return 0;
}

/** m³ a bundle's holds and lockers take up. */
export function bundleVolume(bundle) {
  let used = 0;
  for (const stock of Object.values(bundle?.profile?.holds || {})) used += stockVolume(stock);
  for (const locker of Array.isArray(bundle?.lockers) ? bundle.lockers : []) {
    used += whole(locker?.count) * itemVol(locker?.item);
  }
  return used;
}

/**
 * A short line about one copy, for the choice screen:
 * `{ cr, ships, volume, text }` with `text` like "600 cr · 1 ship · 0 m³".
 */
export function summary(bundle) {
  const cr = whole(bundle?.cr ?? bundle?.profile?.cr);
  const ships = Array.isArray(bundle?.profile?.ships) ? bundle.profile.ships.length : whole(bundle?.ships);
  const volume = Math.round(Number(bundle?.volume) || bundleVolume(bundle));
  return { cr, ships, volume, text: `${cr} cr · ${ships} ship${ships === 1 ? "" : "s"} · ${volume} m³` };
}

/**
 * A display name made unique the way the plan asks: the host's name wins and later
 * joiners wear `*`, `**`, `***` and so on. Display names are for show only; nothing
 * in the game keys off one.
 */
export function uniqueName(name, taken = []) {
  const cleaned = String(name || "").replace(/\s+/g, " ").trim().slice(0, NET.nameMax);
  const base = cleaned.replace(/\*+$/, "").trim() || "Pilot";
  const used = new Set((Array.isArray(taken) ? taken : []).map(entry => String(entry || "").toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  for (let marks = 1; marks <= 1000; marks++) {
    const candidate = `${base}${"*".repeat(marks)}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return `${base}${"*".repeat(1001)}`;
}

/**
 * The `away` marker a home save keeps while its pilot is visiting somewhere.
 * `suitcase` is the pilot as the host last wrote it; it is the copy "Go home" opens.
 */
export function awayRecord({ worldId, hostName, guestId, token, epoch = 0, rev = 0, suitcase = null } = {}) {
  return {
    worldId: idText(worldId) || "",
    hostName: String(hostName || "").slice(0, 80),
    guestId: idText(guestId) || "",
    token: String(token || ""),
    epoch: whole(epoch),
    rev: whole(rev),
    suitcase: suitcase || null,
  };
}

/**
 * A host's record of one visiting pilot, as `world.guests[guestId]` keeps it. The
 * host stores the bundle and a hash of the guest's secret — never the secret.
 *
 * The bundle is stored WITHOUT its token: the host has no use for the guest's
 * secret (it has the hash), and a host's save should never become a way to take
 * somebody's pilot. `world.guests` is written by the host, read by the host, and
 * never travels.
 */
export function guestRecord({ name, token, guestId, epoch = 0, rev = 0, bundle = null, lastSeen = 0 } = {}) {
  const kept = isPlainObject(bundle) ? clone(bundle) : null;
  if (kept) delete kept.token;
  return {
    name: String(name || "").slice(0, NET.nameMax),
    tokenHash: hashToken(token, idText(guestId) || ""),
    epoch: whole(epoch),
    rev: whole(rev),
    bundle: kept,
    lastSeen: whole(lastSeen),
  };
}

/**
 * The three facts the join handshake checks, and a sentence for each refusal. The
 * words are what the guest reads, so they say what to do, not what went wrong inside.
 */
export function handshake({ token, guestId, record, version, worldVersion, worldId, expectedWorldId } = {}) {
  if (!record) return { ok: false, reason: "unknown", message: "That join link is not for this world. Ask the host for a new one." };
  if (Number.isFinite(version) && Number.isFinite(worldVersion) && version !== worldVersion) {
    return {
      ok: false,
      reason: "version",
      message: "That world is running a different version of Tallow Reach. Both players need the same build — rebuild, then send a fresh link.",
    };
  }
  if (expectedWorldId && worldId && worldId !== expectedWorldId) {
    return { ok: false, reason: "world", message: "That link is for a different world. The host needs to make a new one." };
  }
  if (!tokenCheck(token, record.tokenHash, idText(guestId) || "")) {
    return { ok: false, reason: "token", message: "That link has already been used, or it was copied wrongly. Ask the host for a new one." };
  }
  return { ok: true, reason: null, message: "" };
}

/* ------------------------------------------------------------------------- */
/* checkOut: the home save -> the suitcase                                    */
/* ------------------------------------------------------------------------- */

/**
 * Pack the open-world pilot out of `save` into a bundle.
 *
 * "Out of" is literal for the lockers: every station stock of that world is lifted
 * into the suitcase and the stations are left empty. The profile half is copied;
 * missions, flags and stats stay where they are. The caller keeps the returned
 * `save` (with `away` set) — nothing is written to disk here.
 *
 * Options: `worldId`, `hostName`, `guestId`, `token`, `name`, `epoch`, `rev`,
 * `keepLockers` (leave the stations stocked — used when a host first takes in a
 * pilot that is already sitting in the save it is packing), `away: false` (do not
 * write the marker).
 *
 * Returns `{ save, bundle }`.
 */
export function checkOut(save, options = {}) {
  if (!isPlainObject(save) || !isPlainObject(save.profile)) throw new Error("checkOut needs a save with a profile");
  const next = clone(save);
  const profile = next.profile;
  const world = isPlainObject(next.world) ? next.world : (next.world = {});

  const travelling = {};
  for (const field of TRAVEL_FIELDS) {
    if (field === "lockers" || !has(profile, field)) continue;
    travelling[field] = clone(profile[field]);
  }

  // Lockers: lift every station stock, each stack remembering where it came from.
  const lockers = [];
  for (const [station, stock] of Object.entries(inventoryOf(world))) {
    for (const [item, count] of Object.entries(stock)) {
      const locker = makeLocker(item, count, station, station);
      if (locker) lockers.push(locker);
    }
  }
  if (!options.keepLockers) {
    if (isPlainObject(world.stationStores)) {
      for (const station of Object.keys(world.stationStores)) world.stationStores[station] = newStock();
    }
    // An emptied world has no over-full station any more. Only cleared when it was
    // there: `storageOverfull` is a runtime flag the save does not carry, and adding
    // it here would make the returned save a shape the sanitizer disagrees with.
    if (isPlainObject(world.storageOverfull)) world.storageOverfull = {};
  }

  // A pilot who is already away keeps the secret it proved once: the host it is
  // returning to knows that hash, and a fresh token would look like a stranger.
  const token = String(options.token || save.away?.token || makeToken());
  const guestId = idText(options.guestId) || idText(save.away?.guestId) || "";
  const bundle = {
    v: SAVE_VERSION,
    worldId: idText(options.worldId) || "",
    hostName: String(options.hostName || "").slice(0, 80),
    guestId,
    token,
    name: String(options.name || "").slice(0, NET.nameMax),
    // Where this pilot calls home (a pocket id). Slice 4 needs it to put the pilot
    // back at its own station on the way home; it is the one home fact that has to
    // travel, because the home save is not with the pilot while it is away.
    homeStation: idText(profile.homeStation) || null,
    epoch: whole(options.epoch ?? save.away?.epoch),
    rev: whole(options.rev ?? 0),
    profile: travelling,
    lockers,
    unknown: { holds: [], modules: [], ships: [] },
    shipsAt: {},
    summary: null,
  };
  bundle.summary = summary(bundle);

  if (options.away !== false) {
    next.away = awayRecord({
      worldId: bundle.worldId,
      hostName: bundle.hostName,
      guestId,
      token,
      epoch: bundle.epoch,
      rev: bundle.rev,
      suitcase: bundle,
    });
  }
  return { save: next, bundle };
}

/* ------------------------------------------------------------------------- */
/* checkIn: the suitcase -> the home save                                     */
/* ------------------------------------------------------------------------- */

/** Copy the travelling half of a bundle into a profile, leaving everything else alone. */
function applyTravellingProfile(homeProfile, bundle) {
  const incoming = isPlainObject(bundle?.profile) ? bundle.profile : {};
  const merged = clone(homeProfile);
  for (const field of TRAVEL_FIELDS) {
    if (field === "lockers" || !has(incoming, field)) continue;
    merged[field] = clone(incoming[field]);
  }
  // Sanitize the merged profile so a damaged bundle can never write a broken save.
  // `v` is stamped first: a profile without it would be read as a pre-v12 save and
  // given pre-v12 defaults (the sanitizer's own migration rules), which would wipe
  // a hold. The bundle is always the current shape, so the stamp is the truth.
  merged.v = SAVE_VERSION;
  const clean = sanitizeProfile(merged);
  // The home half comes back from the untouched home profile, and `v` is the home
  // save's own, so nothing in this file can rewrite a mission, flag or statistic.
  for (const field of HOME_FIELDS) {
    if (field === "v") continue;
    if (has(homeProfile, field)) clean[field] = clone(homeProfile[field]);
    else delete clean[field];
  }
  clean.v = SAVE_VERSION;
  return clean;
}

/**
 * Apply `bundle` (the pilot as the host last wrote it) to a copy of `save` and
 * clear `save.away`. Pure: neither argument is mutated.
 *
 * The lockers come home to their own stations, then `relocate` sends anything whose
 * station this world lacks to Meridian. Unknown content is written back by hand after
 * the sanitizer (see the note at the top of this file). Returns the new save.
 */
export function checkIn(save, bundle, options = {}) {
  if (!isPlainObject(save) || !isPlainObject(save.profile)) throw new Error("checkIn needs a save with a profile");
  const next = clone(save);
  const homeProfile = next.profile;
  next.profile = applyTravellingProfile(homeProfile, bundle);
  next.v = SAVE_VERSION;
  next.away = null;
  if (!isPlainObject(next.world)) next.world = {};

  const incomingProfile = isPlainObject(bundle?.profile) ? bundle.profile : {};
  const stations = isPlainObject(next.world.stationStores) ? next.world.stationStores : (next.world.stationStores = {});

  // Every locker stack the bundle carries comes home to the station it names.
  for (const raw of Array.isArray(bundle?.lockers) ? bundle.lockers : []) {
    const locker = makeLocker(raw?.item, raw?.count, raw?.station, raw?.origin ?? raw?.station);
    if (!locker) continue;
    if (!isPlainObject(stations[locker.station])) stations[locker.station] = newStock();
    stations[locker.station][locker.item] = (stations[locker.station][locker.item] || 0) + locker.count;
  }

  // Content ids this build does not know, re-inserted into the half the sanitizer
  // cleaned. Moved, not duplicated: the bundle is the only copy of these.
  for (const entry of Array.isArray(bundle?.unknown?.holds) ? bundle.unknown.holds : []) {
    const shipId = idText(entry?.ship);
    const item = idText(entry?.item);
    const count = whole(entry?.count);
    if (!shipId || !item || !count || !next.profile.holds) continue;
    if (!next.profile.holds[shipId]) next.profile.holds[shipId] = newStock();
    next.profile.holds[shipId][item] = (next.profile.holds[shipId][item] || 0) + count;
  }
  for (const entry of Array.isArray(bundle?.unknown?.modules) ? bundle.unknown.modules : []) {
    const group = idText(entry?.group);
    const bay = Math.max(0, Math.floor(Number(entry?.bay) || 0));
    const module = idText(entry?.module);
    const shipId = idText(entry?.ship);
    if (!group || !module || !shipId) continue;
    const fit = next.profile.loadout?.[shipId];
    if (!fit || !Array.isArray(fit[group]) || fit[group][bay] != null) continue; // never overwrite a real module
    fit[group][bay] = module;
  }
  for (const id of Array.isArray(bundle?.unknown?.ships) ? bundle.unknown.ships : []) {
    const shipId = idText(id);
    if (!shipId || next.profile.ships.includes(shipId)) continue;
    // A hull this build cannot name still belongs to the pilot. It is recorded, with
    // the records it needs to be a ship (LESSONS L16), and kept out of the way.
    next.profile.ships.push(shipId);
    if (!next.profile.holds[shipId]) next.profile.holds[shipId] = newStock();
    if (!next.profile.hp) next.profile.hp = {};
    if (!(Number(next.profile.hp[shipId]) > 0)) next.profile.hp[shipId] = 1;
  }

  // Where a moved hull used to sit is remembered, so a later visit can put it back.
  if (isPlainObject(bundle?.shipsAt)) {
    for (const [shipId, placeId] of Object.entries(bundle.shipsAt)) {
      if (idText(shipId) && idText(placeId) && next.profile.ships.includes(shipId)) next.profile.shipPlaces[shipId] = placeId;
    }
  }

  const relocated = relocate({ profile: next.profile, lockers: [], unknown: bundle?.unknown }, next.world, { ...options, save: null });
  next.profile = relocated.bundle.profile;
  next.world.stationStores = relocated.stations;
  guardOverfull(next.world);
  return next;
}

/* ------------------------------------------------------------------------- */
/* relocate: nothing stays where the world has no station                     */
/* ------------------------------------------------------------------------- */

/**
 * Move a bundle's lockers to stations `world` actually has.
 *
 * A stack at a station the world lacks — a station of another galaxy, a removed
 * pocket, an old backup's key — goes to `options.arrival` (Meridian Station, as a
 * station key) and
 * keeps its `origin`, so the moment that world has the station again a later
 * `relocate` sends it back. Hulls are treated the same way through
 * `profile.shipPlaces`: a ship parked at a station this world lacks moves to the
 * arrival station, and `bundle.shipsAt` remembers where it used to be.
 *
 * Never refuses and never deletes. An arrival station holding more than it can is
 * flagged over-full (`station-inventory.js`), which only refuses new deposits.
 *
 * `options.index` is a station index from `net/world-places.js` (the exact answer);
 * without one, `options.hasStation(key)` is asked, and failing that a key is a
 * station when the world's own station stocks have it.
 *
 * Returns `{ bundle, stations }` — the relocated bundle (a new object) and the
 * world's station stocks with the lockers written in.
 */
export function relocate(bundle, world, options = {}) {
  const arrivalKey = idText(options.arrival) || ARRIVAL_STATION_KEY;
  const arrivalPocket = options.arrivalPocket || pocketOfStationKey(arrivalKey);
  const index = options.index || null;
  const hasStation = key => {
    if (typeof options.hasStation === "function") return !!options.hasStation(key);
    if (index) return !!stationIn(index, key);
    return isPlainObject(world?.stationStores) && has(world.stationStores, key);
  };

  const next = clone(isPlainObject(bundle) ? bundle : {});
  const lockers = [];
  for (const raw of Array.isArray(next.lockers) ? next.lockers : []) {
    const locker = makeLocker(raw?.item, raw?.count, raw?.station, raw?.origin ?? raw?.station);
    if (!locker) continue;
    // A stack BELONGS at its origin. If this world has that station it sits there,
    // and a stack that came home is put back rather than left where it waited.
    // Otherwise it waits at the arrival station — or stays wherever a world that
    // does have its current station says it is.
    if (hasStation(locker.origin)) locker.station = locker.origin;
    else if (!hasStation(locker.station)) locker.station = arrivalKey;
    lockers.push(locker);
  }
  next.lockers = lockers;

  if (!isPlainObject(next.profile)) next.profile = {};
  const profile = next.profile;
  if (isPlainObject(profile.shipPlaces)) {
    const moved = { ...(isPlainObject(next.shipsAt) ? next.shipsAt : {}) };
    for (const [shipId, placeId] of Object.entries(profile.shipPlaces)) {
      if (typeof placeId !== "string" || !placeId) continue;
      // `shipPlaces` names the *pocket* a hull sits in; a locker names a station
      // *key*. A hull belongs where it was recorded, and goes back there the moment
      // this world has that station again.
      const origin = moved[shipId] || placeId;
      const stationHere = isPocket(placeId) ? stationKeyAt(placeId) : null;
      const present = hasStation(placeId) || (!!stationHere && hasStation(stationHere));
      const back = isPocket(origin) ? stationKeyAt(origin) : origin;
      if (present) {
        profile.shipPlaces[shipId] = placeId;
        continue;
      }
      if (back && hasStation(back)) {
        profile.shipPlaces[shipId] = origin;
        delete moved[shipId];
        continue;
      }
      moved[shipId] = moved[shipId] || placeId;
      profile.shipPlaces[shipId] = arrivalPocket;
    }
    next.shipsAt = moved;
  }
  next.summary = summary(next);

  // The world side: the same stocks, with this bundle's lockers in them. Nothing
  // is removed, so calling `relocate` twice for two guests is safe.
  const stations = clone(inventoryOf(world));
  if (!isPlainObject(stations[arrivalKey])) stations[arrivalKey] = newStock();
  for (const locker of lockers) {
    if (!isPlainObject(stations[locker.station])) stations[locker.station] = newStock();
    stations[locker.station][locker.item] = (stations[locker.station][locker.item] || 0) + locker.count;
  }
  return { bundle: next, stations };
}

/** The pocket a station key belongs to — everything before its last `:`. */
export function pocketOfStationKey(key) {
  const text = idText(key);
  if (!text) return null;
  const at = text.lastIndexOf(":");
  return at > 0 ? text.slice(0, at) : text;
}

/* ------------------------------------------------------------------------- */
/* The other direction: a host's stored guest                                 */
/* ------------------------------------------------------------------------- */

/**
 * The profile a guest flies in a host's world: the travelling half, with the home
 * half from a fresh profile — so a host's guest has no missions, no flags and no
 * statistics of its own, and no story step can fire for a visitor. Used by slice 4
 * when the host has to rebuild a guest's pilot record.
 */
export function hostProfile(bundle) {
  const base = sanitizeProfile(sanitizeSave({ profile: clone(bundle?.profile) || {}, world: {} }).profile);
  const fresh = { ...base };
  for (const field of HOME_FIELDS) if (field in fresh) delete fresh[field];
  return sanitizeProfile({ ...fresh, missions: [], flags: {}, done: 0, kills: 0 });
}

/**
 * What leaves and what arrives, as one line each, for tests and for a host's own
 * repair: every stack in the profile's holds and in a locker list, summed by
 * `ship:` or `station:` plus item. Two totals that match mean nothing was copied or
 * lost on the way through.
 */
export function totals(bundleOrSave) {
  const out = new Map();
  const add = (where, stock) => {
    for (const [item, count] of Object.entries(stock || {})) {
      const amount = whole(count);
      if (!amount) continue;
      const key = `${where} | ${item}`;
      out.set(key, (out.get(key) || 0) + amount);
    }
  };
  for (const [shipId, stock] of Object.entries(bundleOrSave?.profile?.holds || {})) add(`ship:${shipId}`, stock);
  for (const locker of Array.isArray(bundleOrSave?.lockers) ? bundleOrSave.lockers : []) {
    // Keyed per station like a cargo hold, so "the same 12 ferrite is at Meridian"
    // reads the same whether it is in a locker or already written into a station.
    add(`locker:${locker.station}`, { [locker.item]: locker.count });
  }
  for (const [station, stock] of Object.entries(inventoryOf(bundleOrSave?.world || {}))) add(`station:${station}`, stock);
  return out;
}
