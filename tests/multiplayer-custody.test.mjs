// Custody (refactor step 16, slice 1): the pilot's suitcase, with no networking.
//
// These tests are the rules of travel, proved on plain objects before a byte moves:
//
//   - only the owner's list travels; missions, flags and stats stay home;
//   - items are MOVED, never copied — every stack that leaves comes home once;
//   - nothing is deleted for lack of room, and nothing unknown is dropped;
//   - a station the destination world lacks sends its cargo to Meridian, keeping
//     where it came from so it can go back;
//   - two copies of one pilot are ordered by (epoch, rev), never merged;
//   - a station key from one galaxy seed is NOT a station in another (L19: read a
//     field back the way the reader reads it).
//
// Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkOut, checkIn, relocate, compare, summary, totals,
  makeToken, hashToken, tokenCheck, handshake, guestRecord, uniqueName,
  mergeLockers, knownShip, hostProfile, makeLocker,
} from "../src/net/custody.js";
import { stationsOfWorld, stationsOf, stationIn, stationKeys } from "../src/net/world-places.js";
import { guardOverfull, stationSpaceFor, stationCapacity, inventoryOf, stockVolume } from "../src/net/station-inventory.js";
import { newProfile, newWorld, sanitizeSave, SAVE_VERSION } from "../src/state/profile.js";
import { TRAVEL_FIELDS, HOME_FIELDS, ARRIVAL_STATION, ARRIVAL_STATION_KEY, LOCKERS_FIELD, NET } from "../src/data/multiplayer.js";
import { addShipRecords } from "../src/state/profile.js";
import { generateGalaxy } from "../src/sim/galaxy.js";
import { isItem } from "../src/data/items.js";

/** The arrival station's key, read from data — the same value custody sends cargo to. */
const MERIDIAN = () => ARRIVAL_STATION_KEY;

/** A save at Meridian with a stocked home station, a spare hull and cargo. */
function homeSave() {
  const profile = newProfile();
  profile.cr = 1500;
  profile.holds.wasp = { ferrite: 7, cobalt: 3 };
  profile.ships.push("wasp#2");
  addShipRecords(profile, "wasp#2", "reach");
  profile.holds["wasp#2"] = { salv: 4 };
  const world = newWorld();
  world.stationStores["reach:meridian"] = { ferrite: 12, cobalt: 2 };
  return { v: SAVE_VERSION, profile, world };
}

/** Every stack in a save: its holds, its lockers, and its stations. */
function allTotals(save) {
  const out = new Map();
  const add = (key, n) => out.set(key, (out.get(key) || 0) + n);
  for (const stock of Object.values(save.profile?.holds || {}))
    for (const [item, n] of Object.entries(stock)) add(item, n);
  for (const stock of Object.values(save.world?.stationStores || {}))
    for (const [item, n] of Object.entries(stock)) add(item, n);
  for (const locker of save.lockers || []) add(locker.item, locker.count);
  return out;
}

test("the two field lists name every profile field exactly once", () => {
  const fields = Object.keys(newProfile()).filter(field => field !== "lockers");
  for (const field of fields) {
    const travels = TRAVEL_FIELDS.includes(field);
    const stays = HOME_FIELDS.includes(field);
    assert.ok(travels !== stays, `${field} must be in exactly one of TRAVEL_FIELDS / HOME_FIELDS (it is in ${travels ? "both" : "neither"})`);
  }
  for (const field of [...TRAVEL_FIELDS, ...HOME_FIELDS]) {
    // "lockers" is the one entry that is not a profile field: it names the station
    // storage in a save's world half, which travels with the pilot all the same.
    if (field === LOCKERS_FIELD) continue;
    assert.ok(fields.includes(field), `${field} is listed but newProfile() does not have it any more`);
  }
  // The owner's list, as sentences: credits, ships, loadouts, holds, hull damage,
  // missiles and selected weapons travel; the lockers are the one entry that is not a profile field.
  for (const field of ["cr", "ships", "loadout", "holds", "hp", "msl", "pw", "sw"]) {
    assert.ok(TRAVEL_FIELDS.includes(field), `${field} is pilot-owned and must travel`);
  }
  for (const field of ["missions", "flags", "done", "kills", "campaign"]) {
    assert.ok(HOME_FIELDS.includes(field), `${field} must stay in the home save`);
  }
});

test("checkOut packs the pilot-owned half and empties the home stations", () => {
  const save = homeSave();
  const before = allTotals(save);
  const { save: home, bundle } = checkOut(save, { worldId: "w-1", hostName: "Meridian", guestId: "g-1", name: "Ada", epoch: 1 });

  assert.equal(bundle.profile.cr, 1500);
  assert.deepEqual(bundle.profile.ships, ["wasp", "wasp#2"]);
  assert.deepEqual(bundle.profile.holds.wasp, { ferrite: 7, cobalt: 3 });
  assert.deepEqual(bundle.profile.holds["wasp#2"], { salv: 4 });
  assert.equal(bundle.profile.loadout.wasp.primary[0], "cannon_basic");
  // Lockers are lifted with the station they came from.
  assert.deepEqual(bundle.lockers.map(l => [l.station, l.item, l.count]).sort(), [
    ["reach:meridian", "cobalt", 2],
    ["reach:meridian", "ferrite", 12],
  ]);
  // Nothing travels twice: the home save has no mission data in the bundle, and no
  // stock left on its stations, while every unit still exists exactly once.
  assert.equal(Object.prototype.hasOwnProperty.call(bundle.profile, "missions"), false);
  assert.deepEqual(home.world.stationStores["reach:meridian"], {});
  assert.deepEqual([...allTotals({ ...home, lockers: bundle.lockers }).entries()].sort(), [...before.entries()].sort());
  // The marker on the home save names the host and holds the suitcase.
  assert.equal(home.away.worldId, "w-1");
  assert.equal(home.away.guestId, "g-1");
  assert.equal(home.away.suitcase.profile.cr, 1500);
  // The caller's save is untouched (pure).
  assert.equal(save.world.stationStores["reach:meridian"].ferrite, 12);
  assert.ok(summary(bundle).text.includes("1500 cr"));
});

test("checkIn puts the pilot back once and keeps home missions, flags and stats", () => {
  const save = homeSave();
  save.profile.missions = [{ id: "contract-1", kind: "contract", title: "Ore run" }];
  save.profile.flags = { metDane: true };
  save.profile.done = 4;
  save.profile.kills = 9;
  const { save: home0, bundle } = checkOut(save, { worldId: "w-1", guestId: "g-1", epoch: 1 });
  // `home0` is the save the pilot left behind: its stations are empty, which is what
  // makes "come home" happen exactly once.
  assert.deepEqual(home0.world.stationStores["reach:meridian"], {});

  // The host changed the pilot: credits, cargo, hull damage.
  const returned = {
    ...bundle,
    rev: 3,
    profile: { ...bundle.profile, cr: 2200, holds: { wasp: { ferrite: 10 }, "wasp#2": { salv: 4 } }, hp: { wasp: 0.4, "wasp#2": 1 } },
  };
  const home = checkIn(home0, returned);
  assert.equal(home.away, null, "coming home clears the marker");
  assert.equal(home.profile.cr, 2200);
  assert.deepEqual(home.profile.holds.wasp, { ferrite: 10 });
  assert.equal(home.profile.hp.wasp, 0.4);
  // The home half is exactly as it was.
  assert.deepEqual(home.profile.missions, save.profile.missions);
  assert.deepEqual(home.profile.flags, save.profile.flags);
  assert.equal(home.profile.done, 4);
  assert.equal(home.profile.kills, 9);
  // Lockers come home to their own station.
  assert.equal(home.world.stationStores["reach:meridian"].ferrite, 12);
  // Where the *marker* is concerned, coming home happens once: the returned save has
  // no suitcase left to open again by accident.
  assert.equal(home.away, null);
  assert.equal(home.profile.v, SAVE_VERSION);
});

test("relocate sends cargo of a station the world lacks to Meridian, and keeps its origin", () => {
  const { bundle } = checkOut(homeSave(), { worldId: "w-1", guestId: "g-1", epoch: 1 });
  // A station key from this save, and one from a world this build cannot have.
  const extra = { item: "cobalt", count: 2, station: "sys-999-hub:friendly_trader-0", origin: "sys-999-hub:friendly_trader-0", unknown: false };
  const withExtra = { ...bundle, lockers: [...bundle.lockers, extra] };
  const host = newWorld({ seed: 7 });
  const index = stationsOfWorld(host);
  // The host's own saved wormhole pockets are not this world's business: this world
  // is a fresh one, so those rows are ignored and only its seed is read.
  const { bundle: moved, stations } = relocate(withExtra, host, { index });

  const stranded = moved.lockers.find(l => l.item === "cobalt" && l.origin.startsWith("sys-999"));
  assert.equal(stranded.station, ARRIVAL_STATION_KEY, "a station this world lacks sends its cargo to Meridian");
  assert.equal(stranded.origin, "sys-999-hub:friendly_trader-0", "and remembers where it came from");
  assert.equal(stations[MERIDIAN()].ferrite, 12, "Meridian received the home station's locker");
  assert.equal(stations[MERIDIAN()].cobalt, 4, "both cobalt stacks landed in Meridian");

  // Once the world HAS that station again, a later relocate sends the stack back.
  const back = relocate(moved, host, { hasStation: key => key === "sys-999-hub:friendly_trader-0" });
  const restored = back.bundle.lockers.find(l => l.origin.startsWith("sys-999"));
  assert.equal(restored.station, "sys-999-hub:friendly_trader-0", "the stack goes back to the station it belongs to");
  // The arrival station is a real station of this world, not a bare pocket id.
  assert.ok(stationIn(index, ARRIVAL_STATION_KEY), "the arrival key names a station the host world really has");
  assert.equal(stationIn(index, ARRIVAL_STATION_KEY), ARRIVAL_STATION, "and it is Meridian's pocket");
});


test("relocate moves a hull parked at a missing station to the arrival station and remembers where", () => {
  const { bundle } = checkOut(homeSave(), { worldId: "w-1", guestId: "g-1", epoch: 1 });
  const profile = { ...bundle.profile, shipPlaces: { wasp: "reach", "wasp#2": "sys-042-hub" } };
  const { bundle: moved } = relocate({ ...bundle, profile }, newWorld({ seed: 7 }), {
    hasStation: key => key === "reach" || key === "reach:meridian",
  });
  assert.equal(moved.profile.shipPlaces.wasp, "reach", "a hull at a station the world has stays put");
  assert.equal(moved.profile.shipPlaces["wasp#2"], ARRIVAL_STATION, "a hull at a missing station is moved, not lost");
  assert.equal(moved.shipsAt["wasp#2"], "sys-042-hub", "and remembers where it was");
});

test("an over-full station is flagged and refuses deposits, and nothing is deleted", () => {
  const world = newWorld();
  const key = Object.keys(world.stationStores)[0];
  // Level-1 storage at Meridian; fill it past the brim with one huge stack.
  const cap = stationCapacity(world);
  world.stationStores[key] = { ferrite: Math.ceil(cap / 1) + 50 };
  const before = world.stationStores[key].ferrite;
  const flags = guardOverfull(world);
  assert.equal(flags[key], true);
  assert.equal(world.stationStores[key].ferrite, before, "the station keeps every unit it had");
  assert.equal(stationSpaceFor(world, key, "ferrite"), 0, "an over-full station takes no new deposits");
  assert.equal(stationSpaceFor(world, key, "cobalt"), 0);
});

test("unknown content survives the round trip untouched", () => {
  const save = homeSave();
  // A build from the future: an ore this one has never heard of, at a station, and a
  // hull that is not in this build's table. (An unknown id in a *hold* is covered by
  // "a save this build does not understand loads without losing anything" below: the
  // save sanitizer drops it before custody ever sees it, which is a save-version
  // question, not a custody one.)
  save.world.stationStores["reach:meridian"].strange_ore = 5;
  assert.equal(isItem("strange_ore"), false);
  assert.equal(knownShip("cutter"), false);

  const { save: home, bundle } = checkOut(save, { worldId: "w-1", guestId: "g-1", epoch: 1 });
  const stray = bundle.lockers.find(l => l.item === "strange_ore");
  assert.ok(stray, "an unknown locker stack is carried, not dropped");
  assert.equal(stray.unknown, true);
  assert.equal(stray.count, 5);

  // The host wrote nothing into these stacks but changed credits; coming home, the
  // unknown content is still there, in the same places, once.
  const back = checkIn(home, { ...bundle, profile: { ...bundle.profile, cr: 1600 } });
  assert.equal(back.world.stationStores["reach:meridian"].strange_ore, 5, "an unknown locker stack comes home");
  assert.equal(back.profile.cr, 1600);

  // A module this build does not know, in a bay: the same rule, by hand, after the
  // sanitizer (which drops it). It goes back into the bay it left, never over a real one.
  const withModule = {
    ...bundle,
    unknown: { ...bundle.unknown, modules: [{ ship: "wasp", group: "secondary", bay: 0, module: "launcher_mk9" }] },
  };
  const moduleHome = checkIn(home, withModule);
  // wasp.secondary bay 0 is empty in the stock fit, so the unknown module lands there.
  assert.equal(moduleHome.profile.loadout.wasp.secondary[0], "launcher_mk9");
  const noOverwrite = checkIn(home, {
    ...bundle,
    unknown: { ...bundle.unknown, modules: [{ ship: "wasp", group: "primary", bay: 0, module: "gun_mk9" }] },
  });
  assert.equal(noOverwrite.profile.loadout.wasp.primary[0], "cannon_basic", "an unknown module never displaces a real one");
});

test("compare orders by epoch, then rev, and never merges", () => {
  const older = { epoch: 1, rev: 9, profile: { cr: 100, ships: ["wasp"] } };
  const newerEpoch = { epoch: 2, rev: 0, profile: { cr: 300, ships: ["wasp"] } };
  const newerRev = { epoch: 1, rev: 10, profile: { cr: 200, ships: ["wasp"] } };
  assert.equal(compare(newerEpoch, older), -1, "a newer epoch wins even with a lower rev");
  assert.equal(compare(older, newerEpoch), 1);
  assert.equal(compare(newerRev, older), -1, "inside one epoch the higher rev wins");
  assert.equal(compare(older, older), 0);
  assert.equal(compare(older, null), -1, "any copy beats no copy");
  // A summary is a description, never a mixing of the two.
  assert.equal(summary(newerEpoch).cr, 300);
  assert.equal(summary(older).cr, 100);
});

test("a token names one guest to one host, and the host never stores the token", () => {
  const token = makeToken();
  assert.equal(token.length >= 16, true);
  const hash = hashToken(token, "g-1");
  assert.equal(tokenCheck(token, hash, "g-1"), true);
  assert.equal(tokenCheck(`${token}x`, hash, "g-1"), false, "a token with a character added is refused");
  assert.equal(tokenCheck(token, hash, "g-2"), false, "another guest's salt does not match");
  const record = guestRecord({ name: "Ada", token, guestId: "g-1", epoch: 2, rev: 5, lastSeen: 10 });
  assert.equal(record.token, undefined, "the record has no token field at all");
  assert.equal(record.tokenHash, hash);
  // `left` (playtest 14) is the "has gone home" mark on a record that is holding a pilot's
  // suitcase. It is still no secret: the list is what a host may store.
  assert.deepEqual(Object.keys(record).sort(), ["bundle", "epoch", "lastSeen", "left", "name", "rev", "tokenHash", "visitState"]);
});

test("the handshake refuses a version mismatch, the wrong world and a wrong token with a readable sentence", () => {
  const token = "a-token-for-ada";
  const record = guestRecord({ name: "Ada", token, guestId: "g-1" });
  const good = handshake({ token, guestId: "g-1", record, version: SAVE_VERSION, worldVersion: SAVE_VERSION, worldId: "w-1", expectedWorldId: "w-1" });
  assert.equal(good.ok, true);
  const version = handshake({ token, guestId: "g-1", record, version: SAVE_VERSION, worldVersion: SAVE_VERSION - 1 });
  assert.equal(version.ok, false);
  assert.equal(version.reason, "version");
  assert.match(version.message, /same build/);
  const world = handshake({ token, guestId: "g-1", record, worldId: "w-2", expectedWorldId: "w-1" });
  assert.equal(world.reason, "world");
  const bad = handshake({ token: "nope", guestId: "g-1", record });
  assert.equal(bad.reason, "token");
  assert.equal(handshake({ token, guestId: "g-9", record: null }).reason, "unknown");
});

test("display names stay unique: the host's name wins and joiners get stars", () => {
  assert.equal(uniqueName("Ada", ["Ada"]), "Ada*");
  assert.equal(uniqueName("Ada", ["Ada", "Ada*"]), "Ada**");
  assert.equal(uniqueName("Ada", ["Bob"]), "Ada");
  assert.equal(uniqueName("  ", []), "Pilot");
  assert.equal(uniqueName("x".repeat(80), []).length, NET.nameMax);
});

test("mergeLockers adds stacks of the same item at the same station and keeps the first origin", () => {
  const one = [{ item: "ferrite", count: 2, station: "a:x", origin: "a:x" }];
  const two = [{ item: "ferrite", count: 3, station: "a:x", origin: "b:y" }];
  const merged = mergeLockers(one, two);
  assert.deepEqual(merged, [{ item: "ferrite", count: 5, station: "a:x", origin: "a:x", unknown: false }]);
});

test("a station key from one galaxy seed is not a station in another world", () => {
  // LESSONS L19: read the fact back the way the reader reads it. Generated pocket
  // ids repeat across seeds, so the same key can name two different stations. The
  // seed is what tells them apart.
  const a = stationsOf(generateGalaxy(240515));
  const b = stationsOf(generateGalaxy(1));
  assert.notEqual(a.seed, b.seed);
  assert.ok(stationIn(a, "reach:meridian"), "Meridian is a station in both worlds");
  assert.ok(stationIn(b, "reach:meridian"));

  // A key that names a station in one seed but NOT in the other must read as
  // missing for the world that lacks it, or cargo would be written into a station
  // the player will never reach.
  const onlyA = stationKeys(a).find(key => !stationIn(b, key));
  assert.ok(onlyA, "the two seeds do not have the same stations");
  assert.equal(stationIn(b, onlyA), null);

  // And `keepLockers: false` packing plus `relocate` is what makes that safe.
  const save = homeSave();
  save.world.stationStores[onlyA] = { ferrite: 4 };
  const { bundle } = checkOut(save, { worldId: "w-1", guestId: "g-1", epoch: 1 });
  const hostWorld = newWorld({ seed: 1 });
  const moved = relocate(bundle, hostWorld, { index: b });
  const stray = moved.bundle.lockers.find(l => l.origin === onlyA);
  assert.ok(stray, "the stack is carried");
  assert.equal(stray.station, ARRIVAL_STATION_KEY, "and waits at Meridian in the world that lacks its station");
  assert.ok(inventoryOf(moved.stations)[MERIDIAN()].ferrite >= 4);
});

test("a host's copy of a guest's pilot is an ordinary profile with no home half", () => {
  const { bundle } = checkOut(homeSave(), { worldId: "w-1", guestId: "g-1", epoch: 1 });
  const profile = hostProfile({ ...bundle, profile: { ...bundle.profile, missions: [{ id: "x" }], flags: { a: 1 } } });
  assert.deepEqual(profile.missions, [], "a visitor's missions never reach the host");
  assert.deepEqual(profile.flags, {});
  assert.equal(profile.cr, 1500, "but their credits do");
  assert.deepEqual(profile.ships, ["wasp", "wasp#2"]);
});

test("a whole round trip — out, relocated, home — loses nothing and copies nothing", () => {
  // The key is READ from the world that holds the stock, never typed in: LESSONS L19
  // (read a field the way the reader reads it). The home world's own index is what
  // says where its stations are.
  const save = homeSave();
  const homeIndex = stationsOfWorld(save.world);
  const meridianKey = Object.keys(homeIndex.places).find(key => homeIndex.places[key] === ARRIVAL_STATION);
  save.world.stationStores[meridianKey] = { ferrite: 12, cobalt: 2, salv: 6 };

  const before = new Map();
  for (const stock of Object.values(save.profile.holds))
    for (const [item, n] of Object.entries(stock)) before.set(item, (before.get(item) || 0) + n);
  for (const stock of Object.values(save.world.stationStores))
    for (const [item, n] of Object.entries(stock)) before.set(item, (before.get(item) || 0) + n);

  const out = checkOut(save, { worldId: "w-1", guestId: "g-1", epoch: 1 });
  // The pilot left: the home save keeps none of it, so the suitcase is the only copy.
  for (const stock of Object.values(out.save.world.stationStores)) assert.deepEqual(stock, {});
  // A station this world has, and one it cannot have.
  const guesty = {
    ...out.bundle,
    lockers: [...out.bundle.lockers, makeLocker("ferrite", 2, "nowhere:x", "nowhere:x")],
  };
  const hostWorld = newWorld({ seed: 7 });
  const relocated = relocate(guesty, hostWorld, { index: stationsOfWorld(hostWorld) });
  assert.ok(relocated.bundle.lockers.some(l => l.origin === "nowhere:x" && l.station === meridianKey));

  // The host wrote the pilot (credits up, ferrite sold), then the pilot goes home.
  const hosted = {
    ...relocated.bundle,
    rev: 4,
    profile: { ...relocated.bundle.profile, cr: 1750, holds: { ...relocated.bundle.profile.holds, wasp: { ferrite: 5, cobalt: 3 } } },
  };
  const home = checkIn(out.save, hosted);
  const after = new Map();
  for (const stock of Object.values(home.profile.holds))
    for (const [item, n] of Object.entries(stock)) after.set(item, (after.get(item) || 0) + n);
  for (const stock of Object.values(home.world.stationStores))
    for (const [item, n] of Object.entries(stock)) after.set(item, (after.get(item) || 0) + n);
  assert.deepEqual([...after.entries()].sort(), [...before.entries()].sort(), "every unit that left came home once");
  assert.equal(home.profile.cr, 1750, "and the host's change to credits came with it");
});

test("totals() counts what a bundle carries, and what the save it left kept", () => {
  const save = homeSave();
  const { save: packedSave, bundle } = checkOut(save, { worldId: "w-1", guestId: "g-1", epoch: 1 });
  // The pilot's own holds travel in the profile half; the station lockers travel as
  // stacks. `totals()` is what a test (or a repair) uses to say "everything left is
  // still here", so it must read both halves of a bundle.
  const inBundle = totals(bundle);
  const inSaveBefore = totals(save);
  const sumOf = (map, item) => [...map]
    .filter(([key]) => key.slice(key.lastIndexOf(":") + 1) === item)
    .reduce((n, [, count]) => n + count, 0);
  for (const item of ["ferrite", "cobalt", "salv"]) {
    assert.equal(sumOf(inBundle, item), sumOf(inSaveBefore, item), `${item} reads the same in the bundle and in the save it left`);
  }
  // What the pilot *carries* stays in the profile half of the save it left (it is the
  // same pilot); what was in a station LOCKER is lifted out, so nothing sits at home
  // while the pilot is away.
  assert.deepEqual(totals(packedSave).has("locker:reach:meridian | ferrite"), false,
    "a locker stack leaves the home stations when the pilot packs");
  assert.equal(totals(packedSave).size, Object.keys(save.profile.holds).length + 1,
    "only the holds remain in the packed home save");
});

test("a host's copy of a guest's pilot is an ordinary profile with no home half", () => {
  const { bundle } = checkOut(homeSave(), { worldId: "w-1", guestId: "g-1", epoch: 1 });
  const profile = hostProfile({ ...bundle, profile: { ...bundle.profile, missions: [{ id: "x" }], flags: { a: 1 } } });
  assert.deepEqual(profile.missions, [], "a visitor's missions never reach the host");
  assert.deepEqual(profile.flags, {});
  assert.equal(profile.cr, 1500, "but their credits do");
  assert.deepEqual(profile.ships, ["wasp", "wasp#2"]);
});

test("totals() proves nothing was copied or lost on the way", () => {
  const save = homeSave();
  const { bundle } = checkOut(save, { worldId: "w-1", guestId: "g-1", epoch: 1 });
  const out = totals({ ...save, world: { stationStores: {} }, profile: { holds: {} }, lockers: bundle.lockers });
  const back = new Map([...totals(save)].filter(([key]) => !key.startsWith("locker:")));
  const outNoLockers = new Map([...out].filter(([key]) => !key.startsWith("locker:")));
  for (const [key, value] of outNoLockers) assert.equal(back.get(key), value, `${key} counts the same either side`);
});

test("hostProfile keeps a visitor's cargo, its fleet and its fits (LESSONS L16/L15)", () => {
  // Found while building slice 4. `hostProfile` is what makes a visiting pilot a SHIP in
  // the host's world, and it used to hand the sanitizer a profile with no `v`. A save with
  // no version is read as pre-v12, whose holds were `{ cargo, modules }`, so every hold came
  // back EMPTY: a guest would arrive with its ship, its credits and nothing in its hold.
  //
  // `applyTravellingProfile` had always stamped `v` for this exact reason (see its comment);
  // `hostProfile` did not. This reads the result back the way the sim does.
  const save = { v: SAVE_VERSION, profile: newProfile(), world: newWorld(), away: null };
  save.profile.cr = 4321;
  save.profile.holds[save.profile.ship] = { ferrite: 7, lumenite: 2 };
  const { bundle } = checkOut(save, { worldId: "w", hostName: "Ada", guestId: "g", token: "t", name: "Acey" });

  const profile = hostProfile(bundle);
  assert.equal(profile.v, SAVE_VERSION, "the visitor's profile is stamped as a current save");
  assert.deepEqual(profile.holds[profile.ship], { ferrite: 7, lumenite: 2 }, "its hold arrives whole");
  assert.equal(profile.cr, 4321, "and its credits");
  assert.ok(profile.loadout?.[profile.ship], "and its fit, so it has a hull and thrusters");
  // The home half is still stripped: a visitor has no missions of its own.
  assert.deepEqual(profile.missions, []);
  assert.deepEqual(profile.flags, {});
});
