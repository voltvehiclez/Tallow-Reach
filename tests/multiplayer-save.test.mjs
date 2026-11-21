// Save v29 (refactor step 16, slice 2): `away` on a save, `world.guests` on a host,
// and the storage keys the two live under.
//
// Slice 1 was the rules of travel. This is where those rules live on disk:
//
//   - an old (v28 and older) save loads with `away: null` and no guests, and a v29
//     save carries its marker through any later save;
//   - a pilot that is away is marked, and its suitcase is written under `away:<worldId>`
//     as well as inside the marker, so two tabs cannot overwrite each other;
//   - a host's copy of a visiting pilot is `world.guests[guestId]`, shaped by
//     GUEST_FIELDS, and it never carries the guest's secret token;
//   - a save is written through a scratch key and swapped in, keeping the version it
//     replaced, so a crash mid-write cannot eat a pilot;
//   - a damaged suitcase never fails a whole save.
//
// Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  newSave, newCampaignSave, newWorld, sanitizeSave, sanitizeWorld, cleanAway,
  SAVE_VERSION,
} from "../src/state/profile.js";
import {
  saveAutosave, loadAutosave, writeSlot, readSlot, readPrevious,
  writeAway, readAway, clearAway, awayWorlds,
  encodeSave, decodeSave,
} from "../src/state/storage.js";
import { applySave, currentSave, currentRootSave, state, newRootSave } from "../src/state/state.js";
import { checkOut, checkIn, guestRecord, hashToken } from "../src/net/custody.js";
import {
  worldIdFor, adoptHostWorld, leaveHostWorld, syncAway, putGuest, guestOf, dropGuest,
  guestList, guestIsHere, guestCount, canTakeGuest, isAway, awayLine, suitcaseKey, makeWorldId,
} from "../src/net/multiplayer.js";
import { AWAY_FIELDS, GUEST_FIELDS, NET } from "../src/data/multiplayer.js";
import { prepareGalaxySave } from "../src/sim/galaxy-session.js";

const here = dirname(fileURLToPath(import.meta.url));
const V13_SAVE = JSON.parse(readFileSync(join(here, "saves", "v13-real.json"), "utf8"));

/** A stand-in for the browser's localStorage, with the key list `awayWorlds` walks. */
function mockStorage() {
  const mem = new Map();
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: key => (mem.has(key) ? mem.get(key) : null),
    setItem: (key, value) => { mem.set(key, String(value)); },
    removeItem: key => { mem.delete(key); },
    key: i => [...mem.keys()][i] ?? null,
    get length() { return mem.size; },
  };
  return { mem, restore: () => { globalThis.localStorage = previous; } };
}

const withStorage = fn => {
  const store = mockStorage();
  try {
    return fn(store.mem);
  } finally {
    store.restore();
  }
};

/** A home save packed for a visit, and the suitcase that came out of it. */
function packed() {
  const save = newSave();
  save.profile.cr = 1750;
  const id = worldIdFor(save);
  const { save: home, bundle } = checkOut(save, {
    worldId: id.world.worldId, hostName: "Ada's Reach", guestId: "g-1", name: "Bo", epoch: 1,
  });
  return { save, home, bundle, worldId: id.world.worldId };
}

/* ------------------------------------------------------------------------- */
/* The migration: every older save loads at home                              */
/* ------------------------------------------------------------------------- */

test("v29: a v28 save loads with away: null and a world that has never been hosted", () => {
  // Shape of a v28 save: the same two halves, no `away`, no `worldId`/`guests`.
  const old = newSave();
  delete old.away;
  delete old.world.worldId;
  delete old.world.guests;
  old.v = 28;
  old.profile.v = 28;
  old.world.v = 28;

  const clean = sanitizeSave(old);
  assert.equal(SAVE_VERSION, 29, "slice 2 is the step that makes the save v29");
  assert.equal(clean.v, 29);
  assert.equal(clean.away, null, "the migration's whole promise: an old save is a pilot at home");
  assert.equal(clean.world.worldId, null, "a world that was never hosted has no id yet");
  assert.deepEqual(clean.world.guests, {}, "and no visiting pilots");
  // Everything the old save carried is still exactly there.
  assert.equal(clean.profile.cr, old.profile.cr);
  assert.deepEqual(clean.profile.ships, old.profile.ships);
  assert.deepEqual(clean.world.stationStores, old.world.stationStores);
});

test("v29: a real v13 save still loads, at home, with its whole pilot", () => {
  const clean = sanitizeSave(V13_SAVE);
  assert.equal(clean.v, 29);
  assert.equal(clean.away, null);
  assert.equal(clean.world.place, "hollow");
  assert.equal(clean.profile.cr, V13_SAVE.profile.cr);
  assert.deepEqual(clean.profile.holds, V13_SAVE.profile.holds);
});

test("v29: a v29 save round-trips through the sanitizer unchanged", () => {
  const save = newSave();
  assert.deepEqual(sanitizeSave(save), save);
  // Including one with a marker and a guest, so the new fields are covered too.
  const { home } = packed();
  const away = adoptHostWorld(home, home.away);
  assert.deepEqual(sanitizeSave(away), away);
  const host = putGuest(worldIdFor(save), "g-1", { name: "Bo", token: "secret", bundle: { profile: { cr: 1 } }, epoch: 3, rev: 4 });
  assert.deepEqual(sanitizeSave(host), host);
});

test("v29: the campaign half never has a marker, and multiplayer never touches it", () => {
  const campaign = newCampaignSave();
  assert.equal(campaign.away, null);
  assert.equal(campaign.world.worldId, null);
  // Wrapping and sanitizing the envelope keeps both halves' markers separate.
  const root = { v: 29, mode: "open", open: newSave(), campaign };
  root.open.away = cleanAway({ worldId: "w-1", guestId: "g-1", token: "t" });
  const clean = sanitizeSave(root.open);
  assert.equal(clean.away.worldId, "w-1");
  assert.equal(sanitizeSave(root.campaign).away, null);
});

/* ------------------------------------------------------------------------- */
/* The marker itself                                                          */
/* ------------------------------------------------------------------------- */

test("v29: a marker needs a world and a guest to name, and is written in AWAY_FIELDS order", () => {
  assert.equal(cleanAway(null), null);
  assert.equal(cleanAway({ worldId: "w-1" }), null, "a marker with no guest id names nobody");
  assert.equal(cleanAway({ guestId: "g-1" }), null, "a marker with no world id names nowhere");
  assert.equal(cleanAway({ worldId: "  ", guestId: "g-1" }), null);

  const marker = cleanAway({ rev: 9, worldId: " w-1 ", guestId: "g-1", token: "t0k", epoch: 2, hostName: "Ada", extra: "dropped" });
  assert.deepEqual(Object.keys(marker), AWAY_FIELDS, "the field order is the documented one");
  assert.equal(marker.worldId, "w-1", "ids are trimmed");
  assert.equal("extra" in marker, false, "nothing outside AWAY_FIELDS is kept");
});

test("v29: a damaged suitcase is dropped, and the marker still says where the pilot is", () => {
  const marker = cleanAway({ worldId: "w-1", guestId: "g-1", token: "t", suitcase: "not a bundle" });
  assert.equal(marker.suitcase, null, "a suitcase that is not an object is no suitcase");
  assert.equal(marker.worldId, "w-1", "but the pilot still knows where it is");
  // A suitcase of the right shape is kept, and given the sub-fields a save expects.
  const suitcase = cleanAway({ worldId: "w-1", guestId: "g-1", suitcase: { profile: { cr: 5 } } }).suitcase;
  assert.deepEqual(suitcase.profile, { cr: 5 });
  assert.deepEqual(suitcase.lockers, []);
  assert.deepEqual(suitcase.unknown, { holds: [], modules: [], ships: [] });
  assert.deepEqual(suitcase.shipsAt, {});
});

test("v29: a suitcase keeps content ids this build does not know", () => {
  // While a pilot is away the suitcase is the only copy of what it carries, so the
  // save must not second-guess an id a newer build wrote (slice 1 drops nothing).
  const suitcase = cleanAway({
    worldId: "w-1",
    guestId: "g-1",
    suitcase: {
      profile: { cr: 5, holds: { wasp: { unobtainium: 2 } }, loadout: { wasp: { primary: ["warp_lance"] } }, ships: ["wasp", "dreadnought"] },
      lockers: [{ item: "unobtainium", count: 3, station: "reach:meridian", origin: "reach:meridian" }],
    },
  }).suitcase;
  assert.deepEqual(suitcase.profile.holds.wasp, { unobtainium: 2 });
  assert.deepEqual(suitcase.profile.loadout.wasp.primary, ["warp_lance"]);
  assert.deepEqual(suitcase.profile.ships, ["wasp", "dreadnought"]);
  assert.deepEqual(suitcase.lockers.map(l => l.item), ["unobtainium"]);
});

/* ------------------------------------------------------------------------- */
/* The host's side: world.guests                                              */
/* ------------------------------------------------------------------------- */

test("v29: this world's id is minted once and then kept", () => {
  const save = newSave();
  assert.equal(save.world.worldId, null, "a world is not hosted until somebody hosts it");
  const first = worldIdFor(save);
  const id = first.world.worldId;
  assert.match(id, /^w-[A-Za-z0-9]{16}$/, "an id from the same source as a token (makeToken never goes below 16)");
  assert.equal(save.world.worldId, null, "minting does not mutate the save it was given");
  assert.equal(worldIdFor(first).world.worldId, id, "loading it again keeps the id, or a link would die");
  // Two worlds never share an id.
  assert.notEqual(makeWorldId(), makeWorldId());
});

test("v29: a host's record is GUEST_FIELDS, and it never carries the guest's secret", () => {
  const { bundle } = packed();
  const host = putGuest(worldIdFor(newSave()), "g-1", {
    name: "Bo", token: "the-guest-secret", epoch: 2, rev: 7, bundle, lastSeen: 1000,
  });
  const record = guestOf(host, "g-1");
  assert.deepEqual(Object.keys(record), GUEST_FIELDS, "the documented record shape, in order");
  assert.equal(record.bundle.token, undefined, "the host has the hash, so the secret never reaches a save");
  assert.equal(record.tokenHash, hashToken("the-guest-secret", "g-1"), "and the hash is salted with the guest id");
  assert.equal(record.epoch, 2);
  assert.equal(record.rev, 7);
  assert.equal(record.name, "Bo");
  assert.equal(record.lastSeen, 1000);
  // The record is what a save writes: loading it back gives the same object.
  assert.deepEqual(sanitizeSave(host).world.guests, host.world.guests);
});

test("v29: a guest record with no token hash is dropped, and dropping a guest is always safe", () => {
  const host = sanitizeWorld({
    v: 29,
    guests: {
      "g-1": { name: "Bo", tokenHash: "abc12345", epoch: 1, rev: 1, bundle: null, lastSeen: 0 },
      "g-2": { name: "No hash", epoch: 1 },              // nothing to prove against
      "g-3": "not a record",
    },
  });
  assert.deepEqual(Object.keys(host.guests), ["g-1"], "only a real record survives");
  // Deleting the entry loses nothing: the guest's suitcase is the copy that counts.
  const { bundle } = packed();
  const kept = putGuest(putGuest(newSave(), "g-1", { token: "a", bundle, name: "Bo" }), "g-2", { token: "b", name: "Cy" });
  assert.equal(guestCount(kept), 2);
  const dropped = dropGuest(kept, "g-1");
  assert.equal(guestCount(dropped), 1);
  assert.equal(guestOf(dropped, "g-1"), null);
  assert.equal(guestCount(kept), 2, "dropping is pure: the save it was given still has both");
});

test("v29: the guest list is newest-seen first, and 'here' is a window not a flag", () => {
  const save = putGuest(putGuest(putGuest(newSave(), "g-1", { token: "a", name: "Ada", lastSeen: 100 }),
    "g-2", { token: "b", name: "Cy", lastSeen: 900 }),
    "g-3", { token: "c", name: "Bo", lastSeen: 0 });
  assert.deepEqual(guestList(save).map(g => g.guestId), ["g-2", "g-1", "g-3"], "most recent first, never seen last");
  // `lastSeen` is a millisecond stamp, and "here" is the NET.lastSeenSec window.
  const now = 1_000_000;
  const fresh = putGuest(save, "g-4", { token: "d", name: "Di", lastSeen: now - 1000 });
  const stale = putGuest(save, "g-5", { token: "e", name: "Ed", lastSeen: now - (NET.lastSeenSec * 1000 + 1) });
  assert.equal(guestIsHere(guestOf(fresh, "g-4"), now), true, "seen a second ago is here");
  assert.equal(guestIsHere(guestOf(stale, "g-5"), now), false, `older than NET.lastSeenSec (${NET.lastSeenSec}s) is gone`);
  assert.equal(guestIsHere(guestOf(fresh, "g-3"), now), false, "never seen is not here");
  assert.equal(guestIsHere(null, now), false);
});

test("v29: taking a guest is a live-session limit, never a reason to delete a record", () => {
  let save = newSave();
  assert.equal(canTakeGuest(save), true);
  for (let i = 0; i < NET.maxGuests; i++) save = putGuest(save, `g-${i}`, { token: `t${i}`, name: `P${i}` });
  assert.equal(guestCount(save), NET.maxGuests);
  assert.equal(canTakeGuest(save), false, "a full session says no to a new arrival");
  // …and every record is still there, because a record is somebody's pilot.
  assert.equal(guestCount(save), NET.maxGuests);
  assert.deepEqual(Object.keys(save.world.guests).sort(), ["g-0", "g-1", "g-2", "g-3"]);
});

/* ------------------------------------------------------------------------- */
/* Leaving, coming back, and the two copies of the suitcase                   */
/* ------------------------------------------------------------------------- */

test("v29: adopting a host world stores the marker and writes the suitcase under its own key", () => {
  withStorage(mem => {
    const { home, worldId, bundle } = packed();
    const away = adoptHostWorld(home, home.away);
    assert.equal(isAway(away), true);
    assert.equal(isAway(home), true, "checkOut already marked it");
    assert.ok(mem.has(suitcaseKey(worldId)), "the second copy exists under away:<worldId>");
    assert.deepEqual(JSON.parse(mem.get(suitcaseKey(worldId))).profile.cr, 1750);
    assert.equal(readAway(worldId).profile.cr, bundle.profile.cr);
    assert.deepEqual(awayWorlds(), [worldId]);
  });
});

test("v29: two worlds keep two suitcases, so two tabs cannot overwrite each other", () => {
  withStorage(() => {
    const a = packed();
    const b = { save: newSave(), home: null, bundle: null, worldId: "w-second" };
    b.save.profile.cr = 42;
    const { save: homeB, bundle: bundleB } = checkOut(b.save, { worldId: b.worldId, guestId: "g-2", epoch: 1 });
    adoptHostWorld(a.home, a.home.away);
    adoptHostWorld(homeB, homeB.away);
    assert.equal(readAway(a.worldId).profile.cr, 1750);
    assert.equal(readAway(b.worldId).profile.cr, 42);
    assert.deepEqual(awayWorlds().sort(), [a.worldId, b.worldId].sort());
    assert.equal(bundleB.profile.cr, 42);
  });
});

test("v29: the host's newer copy becomes the suitcase, and going home clears both", () => {
  withStorage(mem => {
    const { home, worldId } = packed();
    const away = adoptHostWorld(home, home.away);
    // The host changed the pilot: credits up, a new rev.
    const written = { ...away.away.suitcase, rev: 6, profile: { ...away.away.suitcase.profile, cr: 2100 } };
    const synced = syncAway(away, written, { rev: 6 });
    assert.equal(synced.away.rev, 6, "the host's rev is what the marker says");
    assert.equal(synced.away.suitcase.profile.cr, 2100);
    assert.equal(readAway(worldId).profile.cr, 2100, "and the per-world copy is the same snapshot");
    assert.equal(away.away.suitcase.profile.cr, 1750, "syncAway is pure");

    // Coming home: the marker goes, the key is forgotten, the pilot is playable again.
    const back = leaveHostWorld(synced);
    assert.equal(isAway(back), false);
    assert.equal(back.away, null);
    assert.equal(mem.has(suitcaseKey(worldId)), false, "no stale suitcase is left to be found later");
    assert.deepEqual(awayWorlds(), []);
    assert.equal(synced.away.worldId, worldId, "and leaving is pure too");
  });
});

test("v29: a suitcase can be applied straight back home (slice 1's checkIn, through the marker)", () => {
  const { save, home } = packed();
  const suitcase = { ...home.away.suitcase, rev: 3, profile: { ...home.away.suitcase.profile, cr: 2400 } };
  const back = checkIn(home, suitcase);
  assert.equal(back.away, null, "checkIn clears the marker as part of coming home");
  assert.equal(back.profile.cr, 2400, "with the host's copy of the credits");
  assert.deepEqual(back.profile.missions, save.profile.missions, "and the home save's own missions, untouched");
  // `cleanAway` / `isAway` are the one readers for the question every caller asks.
  assert.equal(cleanAway(back?.away), null);
  assert.equal(cleanAway(home.away).guestId, "g-1");
  assert.equal(cleanAway(undefined), null, "no marker at all reads as home, not as an error");
});

test("v29: a frozen pilot says where it is, in words a screen can show", () => {
  const { home } = packed();
  assert.equal(awayLine(home), "Your pilot is at Ada's Reach.");
  assert.equal(awayLine(newSave()), "");
  // A marker with no host name still says the true thing.
  assert.equal(awayLine({ away: cleanAway({ worldId: "w-1", guestId: "g-1" }) }), "Your pilot is visiting another world.");
});

/* ------------------------------------------------------------------------- */
/* Storage: the swap, the previous version, and the per-world key            */
/* ------------------------------------------------------------------------- */

test("v29: an autosave keeps the version it replaced, so a bad write costs nothing", () => {
  withStorage(mem => {
    const first = newSave();
    first.profile.cr = 100;
    assert.equal(saveAutosave(first), true);
    assert.equal(mem.has("tr1"), true);
    assert.equal(mem.has("tr1:tmp"), false, "the scratch key is cleaned up after a good write");
    assert.equal(mem.has("tr1:prev"), false, "there was nothing to keep the first time");

    const second = newSave();
    second.profile.cr = 200;
    saveAutosave(second);
    assert.equal(JSON.parse(mem.get("tr1")).open.profile.cr, 200);
    assert.equal(JSON.parse(mem.get("tr1:prev")).open.profile.cr, 100, "the one before it is kept for one generation");
    assert.equal(readPrevious("tr1").open.profile.cr, 100);

    // The current save is unreadable (a half-written or corrupted record): loading
    // falls back to the kept version instead of losing the pilot.
    mem.set("tr1", "{not json");
    // Boot passes `prepareGalaxySave` because the browser record is a dual-mode
    // envelope; the recovery reads the kept version through it.
    assert.equal(loadAutosave(prepareGalaxySave).open.profile.cr, 100,
      "the damaged autosave is unreadable, so the version kept beside it loads");
  });
});

test("v29: a slot is swapped in too, but keeps no history", () => {
  withStorage(mem => {
    const save = newSave();
    save.profile.cr = 777;
    assert.equal(writeSlot(1, save), true);
    assert.equal(readSlot(1).open.profile.cr, 777);
    assert.equal(mem.has("tr_s1:prev"), false, "the player asked for this save; there is nothing to go back to");
    assert.equal(mem.has("tr_s1:tmp"), false);
    save.profile.cr = 888;
    writeSlot(1, save);
    assert.equal(readSlot(1).open.profile.cr, 888);
  });
});

test("v29: writing a suitcase is idempotent and clearing it removes every copy", () => {
  withStorage(mem => {
    writeAway("w-1", { profile: { cr: 5 } });
    writeAway("w-1", { profile: { cr: 6 } });
    assert.equal(readAway("w-1").profile.cr, 6);
    assert.equal(readAway("w-1", value => value.profile.cr), 6, "a reader may prepare what it reads");
    assert.equal(mem.has("away:w-1:prev"), false, "a suitcase has no history to keep");
    assert.equal(writeAway("", { profile: {} }), false, "no world id, no key");
    assert.equal(readAway(""), null);
    assert.equal(readAway("never-written"), null);
    clearAway("w-1");
    assert.equal(readAway("w-1"), null);
    assert.deepEqual(awayWorlds(), []);
  });
});

test("v29: a pilot's marker survives export and import", () => {
  const { home } = packed();
  const text = encodeSave(home);
  const back = decodeSave(text);
  assert.equal(back.away.worldId, home.away.worldId);
  assert.equal(back.away.suitcase.profile.cr, 1750);
  // And a save that has no marker imports as a pilot at home, not as a broken save.
  const plain = encodeSave(newSave());
  assert.equal(decodeSave(plain).away, null);
});

test("v29: a dual-mode autosave carries each half's marker with that half", () => {
  withStorage(mem => {
    const root = newRootSave();
    root.open.away = cleanAway({ worldId: "w-1", guestId: "g-1", token: "t", epoch: 1, suitcase: { profile: { cr: 3 } } });
    saveAutosave(root);
    const disk = JSON.parse(mem.get("tr1"));
    assert.equal(disk.open.away.worldId, "w-1", "the open half keeps its own marker");
    assert.equal(disk.open.away.suitcase.profile.cr, 3, "and its suitcase");
    assert.equal(disk.campaign.away, null, "the campaign pilot never travels");
    assert.equal("away" in root.open.profile, false, "the marker is never inside a profile");
  });
});

/* ------------------------------------------------------------------------- */
/* The live game                                                              */
/* ------------------------------------------------------------------------- */

test("v29: loading a save marks the runtime, and every later save keeps the marker", () => {
  const root = newRootSave();
  root.open.away = cleanAway({
    worldId: "w-live", hostName: "Ada's Reach", guestId: "g-live", token: "tok", epoch: 4, rev: 2,
    suitcase: { profile: { cr: 90 } },
  });
  applySave(prepareGalaxySave(root));
  try {
    assert.equal(state.away.worldId, "w-live", "the runtime knows the pilot is away");
    assert.equal(isAway(state), true, "and the runtime knows it");
    const captured = currentSave();
    assert.equal(captured.away.worldId, "w-live", "an autosave made while away still says so");
    assert.equal(captured.away.rev, 2);
    const envelope = currentRootSave();
    assert.equal(envelope.open.away.guestId, "g-live");
    assert.equal(envelope.campaign.away, null);
  } finally {
    applySave(prepareGalaxySave(newRootSave()));
  }
  assert.equal(state.away, null, "and a save with no marker loads as a pilot at home");
});

test("v29: an old save that is loaded is a pilot at home, through the real boot path", () => {
  const old = newRootSave();
  delete old.open.away;
  old.v = 28;
  old.open.v = 28;
  applySave(prepareGalaxySave(old));
  try {
    assert.equal(state.away, null);
    assert.equal(currentSave().away, null);
  } finally {
    applySave(prepareGalaxySave(newRootSave()));
  }
});

test("v29: a host's save keeps its guests through a save and a load", () => {
  const host = putGuest(worldIdFor(newSave()), "g-1", {
    name: "Bo", token: "secret", epoch: 1, rev: 0,
    bundle: { profile: { cr: 40, ships: ["wasp"] }, lockers: [] },
    lastSeen: 5000,
  });
  const back = sanitizeSave(JSON.parse(JSON.stringify(host)));
  assert.equal(back.world.worldId, host.world.worldId);
  const record = guestOf(back, "g-1");
  assert.equal(record.name, "Bo");
  assert.equal(record.bundle.profile.cr, 40);
  assert.equal(record.lastSeen, 5000);
  // And the guest record survives the envelope too.
  const root = { v: 29, mode: "open", open: host, campaign: newCampaignSave() };
  const reloaded = sanitizeSave(root.open);
  assert.equal(guestOf(reloaded, "g-1").tokenHash, guestRecord({ token: "secret", guestId: "g-1" }).tokenHash);
});

test("v29: a world built from scratch has an empty guest list, and no world id", () => {
  const world = newWorld();
  assert.equal(world.worldId, null);
  assert.deepEqual(world.guests, {});
  assert.deepEqual(sanitizeWorld({ v: 29 }).guests, {});
  assert.equal(sanitizeWorld({ v: 29 }).worldId, null);
  assert.equal(sanitizeWorld({ v: 29, worldId: "  w-x  " }).worldId, "w-x", "an id is trimmed");
  assert.equal(sanitizeWorld({ v: 29, worldId: 12 }).worldId, null, "and must be a string");
});
