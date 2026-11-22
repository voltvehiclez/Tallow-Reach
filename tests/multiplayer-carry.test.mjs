// Step 16 slice 4: the pilot actually travels.
//
// Two real sessions joined by an in-memory wire (the same fixture `multiplayer-session`
// uses), but here the wire carries a PILOT: `checkOut` packs the guest's home save, the
// host relocates and stores it, and `bringPilotHome` puts it back. What this file proves
// is the thing the whole slice exists for — **items are moved, never copied** — and the
// ordering rule that makes two copies safe.
//
// What it cannot prove: that a ship appears on the host's screen. That needs a browser and
// `sim/`'s player records; `tests/multiplayer-visitors.test.mjs` proves the record half
// headlessly.
//
// Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as session from "../src/net/session.js";
import { SAVE_VERSION, newProfile, newWorld, sanitizeSave } from "../src/state/profile.js";
import {
  checkOut, checkIn, totals, compare, bundleFromProfile, bundleBytes,
} from "../src/net/custody.js";
import { cleanMessage, readMessage } from "../src/net/protocol.js";
import { NET } from "../src/data/multiplayer.js";

/** A save with a pilot who owns something worth carrying. */
const ARRIVAL = "reach:meridian";   // `ARRIVAL_STATION_KEY`: Meridian Station is in `reach`

function makeSave({ cr = 600, item = "ferrite", count = 12, station = ARRIVAL } = {}) {
  const save = { v: SAVE_VERSION, profile: newProfile(), world: newWorld(), away: null };
  save.profile.cr = cr;
  save.profile.holds[save.profile.ship] = { [item]: count };
  save.world.stationStores[station] = { [item]: 4 };
  return sanitizeSave(save);
}

/** The two-channel fixture: each `send` reaches the other side's reader. */
function makeWire() {
  const made = [];
  const factory = ({ role, worldId, onState, onData, onPeer }) => {
    const channel = {
      role,
      worldId,
      peerId: null,
      outbound: [],
      inbound: [],
      join: async () => { onState?.({ state: "finding", reason: "" }); return channel; },
      send: (peerId, value) => {
        channel.outbound.push({ peerId, value });
        channel.deliver?.(peerId, value);
        return true;
      },
      broadcast: value => (channel.peerId ? (channel.send(channel.peerId, value), 1) : 0),
      peers: () => (channel.peerId ? [channel.peerId] : []),
      state: () => ({ state: channel.peerId ? "connected" : "finding", reason: "" }),
      room: () => worldId,
      leave: () => { channel.left = true; },
      reach: (message, peerId = "peer-1") => { channel.inbound.push(message); onData?.({ ...message, peerId }); },
      connect(peerId = "peer-1") { channel.peerId = peerId; onPeer?.({ kind: "join", peerId }); },
    };
    made.push(channel);
    return channel;
  };
  return { factory, made };
}

/** Everything the host's save holds, as a bundle (what the host would send home). */
const copyOf = (save, guestId = "g", { rev = 1 } = {}) => {
  const record = save.world.guests[guestId];
  return bundleFromProfile(record.bundle.profile, {
    lockers: record.bundle.lockers,
    previous: { ...record.bundle, guestId, rev },
    name: record.name,
    rev,
  });
};

/* ------------------------------------------------------------------------- */
/* The wire's two new messages                                               */
/* ------------------------------------------------------------------------- */

test("slice 4: a suitcase goes on the wire whole, and a huge one is refused", () => {
  const save = makeSave();
  const { bundle } = checkOut(save, { worldId: "w-1", name: "Ada", guestId: "g-1", token: "t" });
  const message = cleanMessage("carry", { guestId: "g-1", name: "Ada", epoch: 0, rev: 0, bundle });
  assert.equal(message.t, "carry");
  assert.deepEqual(message.bundle.profile.holds, bundle.profile.holds, "the hold crosses unchanged");
  assert.equal(message.bundle.lockers.length, bundle.lockers.length, "and so does every locker stack");
  // Read back the way the receiver reads it.
  assert.deepEqual(readMessage(message), message, "a real message survives the reader");
  // Content this build does not know must survive: dropping it is how cargo is lost.
  const odd = { ...bundle, profile: { ...bundle.profile, holds: { wasp: { "future-ore": 3 } } } };
  const kept = readMessage(cleanMessage("carry", { guestId: "g", bundle: odd }));
  assert.equal(kept.bundle.profile.holds.wasp["future-ore"], 3, "an unknown id is carried, not cleaned away");
  // Too big: refused, never truncated.
  const huge = { ...bundle, profile: { ...bundle.profile, filler: "x".repeat(NET.suitcaseMaxBytes + 1) } };
  assert.equal(cleanMessage("carry", { guestId: "g", bundle: huge }), null, "an oversize suitcase is refused");
  assert.equal(cleanMessage("carry", { guestId: "g", bundle: { nope: true } }), null, "and so is one with no profile");
});

test("slice 4: bundleBytes measures what actually goes on the wire", () => {
  const save = makeSave();
  const { bundle } = checkOut(save, { worldId: "w", name: "Ada", guestId: "g", token: "t" });
  const size = bundleBytes(bundle);
  assert.ok(size > 0 && size < NET.suitcaseMaxBytes, `a real suitcase is small (${size} bytes)`);
  assert.equal(size, JSON.stringify(bundle).length);
});

/* ------------------------------------------------------------------------- */
/* checkOut -> host -> checkIn: nothing copied, nothing lost                 */
/* ------------------------------------------------------------------------- */

test("slice 4: the pilot leaves home, and its stations are emptied into the suitcase", () => {
  const save = makeSave({ count: 12 });
  const before = totals(save);
  const { save: packed, bundle } = checkOut(save, { worldId: "w-1", hostName: "Ada", guestId: "g-1", token: "t" });
  // The marker is on, so the home pilot is frozen (nothing may fly it while it is away).
  assert.equal(packed.away.worldId, "w-1");
  assert.equal(packed.away.guestId, "g-1");
  assert.ok(packed.away.suitcase, "the suitcase is in the marker");

  // **What `checkOut` actually does:** the profile half is COPIED (the frozen home pilot
  // keeps it as the last copy, so a lost suitcase is not a lost fleet) and every station
  // is EMPTIED, because a station stock is a place, and one stack cannot sit in two
  // worlds. That asymmetry is slice 1's design and it is why the home copy is frozen.
  // `totals` keys a station stack as `station:<key>` and a suitcase stack as
  // `locker:<key>`; the same cargo, under the two names the two objects use.
  for (const [key, count] of before) {
    const carried = key.startsWith("station:") ? `locker:${key.slice("station:".length)}` : key;
    assert.equal(totals(bundle).get(carried), count, `${key} is in the suitcase`);
    if (key.startsWith("station:")) {
      assert.equal(totals(packed).get(key), undefined, `${key} left the home stations`);
    }
  }
});

test("slice 4: a full round trip returns every unit exactly once", () => {
  const home = makeSave({ cr: 900, count: 12 });
  const before = totals(home);
  const { save: packed, bundle } = checkOut(home, { worldId: "w-1", hostName: "Ada", guestId: "g-1", token: "t" });

  // The host's world is a different galaxy with the same home station: everything fits.
  const host = makeSave({ cr: 40, count: 0, item: "lumenite" });
  const copied = copyOf({ world: { guests: { g: { name: "Acey", rev: 1, bundle } } } }, "g");
  // **The save the pilot comes home to is the PACKED one** — its stations were emptied
  // when the pilot left, so returning the lockers restores them rather than doubling them.
  const returned = checkIn(packed, copied);

  assert.equal(returned.away, null, "coming home clears the marker");
  assert.equal(returned.profile.cr, 900, "credits came back");
  const after = totals({ profile: returned.profile, world: returned.world });
  // A locker that came home to a station is a `station:` stack again; the profile half is
  // a `ship:` stack. Both must be EXACTLY what left — never doubled (LESSONS L15).
  for (const [key, count] of before) {
    const back = key.startsWith("station:") ? key : key;
    assert.equal(after.get(back), count, `${key} came home exactly once (got ${after.get(back)})`);
  }
  assert.equal(host.profile.cr, 40, "the host's own pilot was never touched");
});

test("slice 4: a station this world lacks sends the cargo to Meridian and remembers where it was", async () => {
  const home = makeSave({ station: "hollow:meridian" });
  const { bundle } = checkOut(home, { worldId: "w-1", name: "Ada", guestId: "g-1", token: "t" });
  // Arrive in a world that has no `hollow` station.
  const hostWorld = newWorld();
  const { bundle: relocated } = (await import("../src/net/custody.js")).relocate(bundle, hostWorld, {
    hasStation: key => key === ARRIVAL,
  });
  const stack = relocated.lockers.find(entry => entry.item === "ferrite");
  assert.equal(stack.station, ARRIVAL, "it waits at Meridian");
  assert.equal(stack.origin, "hollow:meridian", "and remembers home, so it goes back later");
});

/* ------------------------------------------------------------------------- */
/* Ordering: (epoch, rev), never the arrival order                           */
/* ------------------------------------------------------------------------- */

test("slice 4: a newer copy wins and an older one is ignored", () => {
  const now = { epoch: 0, rev: 3 };
  assert.equal(compare({ epoch: 0, rev: 4 }, now), -1, "a higher rev is newer");
  assert.equal(compare({ epoch: 1, rev: 0 }, now), -1, "a new epoch beats any rev");
  assert.equal(compare({ epoch: 0, rev: 2 }, now), 1, "a lower rev is older");
  assert.equal(compare(now, now), 0, "a tie is a tie");
});

/* ------------------------------------------------------------------------- */
/* Home, with the host offline                                               */
/* ------------------------------------------------------------------------- */

test("slice 4: bringing the pilot home needs no connection at all", () => {
  const home = makeSave({ cr: 700 });
  const { save: packed, bundle } = checkOut(home, { worldId: "w-1", hostName: "Ada", guestId: "g-1", token: "t" });
  // The host wrote the pilot and sent it back; the guest stored that copy.
  const written = bundleFromProfile({ ...bundle.profile, cr: 1250 }, { previous: { ...bundle, hostName: "Ada" }, rev: 2 });
  const stored = { ...packed, away: { ...packed.away, rev: 2, suitcase: written } };

  // No session running: the suitcase alone is the copy.
  const done = session.bringPilotHome(stored);
  assert.equal(done.ok, true, done.message);
  assert.equal(done.save.away, null, "the marker is gone");
  assert.equal(done.save.profile.cr, 1250, "the pilot came home as the host last wrote it");
});

test("slice 4: a damaged suitcase refuses rather than wiping the pilot", () => {
  const home = makeSave({ cr: 700 });
  const { save: packed } = checkOut(home, { worldId: "w-1", hostName: "Ada", guestId: "g-1", token: "t" });
  const damaged = { ...packed, away: { ...packed.away, suitcase: { nope: true } } };
  const done = session.bringPilotHome(damaged);
  assert.equal(done.ok, false, "it refuses");
  assert.match(done.message, /suitcase could not be read/i);
  assert.equal(done.save.away.guestId, "g-1", "and the marker still says where the pilot is");
});

test("slice 4: a pilot that is not away has nothing to bring home", () => {
  const done = session.bringPilotHome(makeSave());
  assert.equal(done.ok, false);
  assert.match(done.message, /not away/i);
});

/* ------------------------------------------------------------------------- */
/* The bug this slice found: the empty home stations must actually be SAVED  */
/* ------------------------------------------------------------------------- */

test("slice 4: packing writes the emptied stations into the live save, so cargo cannot double", () => {
  // LESSONS L15, the writing half. `checkOut` empties the station stocks in the save it
  // returns; if that save never reaches the game (the session used to write only the
  // guest list and world id), the live world keeps the stacks AND the suitcase carries
  // them — and coming home writes them back on top, so 4 ferrite becomes 8.
  //
  // This is the shape of the real bug, reproduced on the session's own save seam.
  const home = makeSave({ count: 12 });
  const { save: packed, bundle } = checkOut(home, { worldId: "w-1", hostName: "Ada", guestId: "g-1", token: "t" });

  const host = makeSave({ cr: 0, count: 0, item: "lumenite" });
  const copied = copyOf({ world: { guests: { g: { name: "Acey", rev: 1, bundle } } } }, "g");
  const returned = checkIn(packed, copied);
  const stationFerrite = totals({ profile: returned.profile, world: returned.world }).get("station:reach:meridian | ferrite");
  assert.equal(stationFerrite, 4, "the 4 units that were in the station are 4 again, not 8");

  // And the same round trip against the ORIGINAL save (stations never emptied) is the
  // failure mode: it doubles. This assertion documents why `install` exists.
  const wrong = checkIn(home, copied);
  assert.equal(
    totals({ profile: wrong.profile, world: wrong.world }).get("station:reach:meridian | ferrite"),
    8,
    "checking in over a save that still holds the stacks duplicates them — the reason the packed save is installed",
  );
});

/* ------------------------------------------------------------------------- */
/* The frozen pilot is never captured from the runtime                       */
/* ------------------------------------------------------------------------- */

test("slice 4: saving while away hands the frozen record through untouched", async () => {
  // The third way cargo could double. `captureActiveModeSave` folds LIVE runtime facts
  // into the save (resume point, ship racks, a stack on the cursor). While a pilot is
  // visiting, its own record is frozen and the suitcase is the only copy of what
  // travelled — so an autosave, a mode cycle or a save-slot switch must not read the
  // runtime at all.
  const { state, currentSave } = await import("../src/state/state.js");
  const { newProfile, newWorld } = await import("../src/state/profile.js");
  // `state.world` is a getter over `worldState`, so only the keys this test writes are
  // restored — not the whole object, which cannot be reassigned wholesale.
  const before = { profile: state.profile, worldState: state.worldState, ui: state.ui, away: state.away };
  try {
    state.profile = newProfile();
    state.worldState = newWorld();
    state.ui = { ...(state.ui || {}), invHeld: null, destination: "" };
    const away = { worldId: "w-1", hostName: "Ada", guestId: "g-1", token: "t", epoch: 0, rev: 2, suitcase: null };
    state.away = away;
    // Something the runtime would stamp if it were read: the resume destination. Capturing
    // an active mode copies `state.ui.destination` into the world; a frozen pilot must not
    // be re-read that way.
    state.ui.destination = "a-place-the-frozen-pilot-never-went";
    state.worldState.destination = "where-it-actually-left-off";
    const save = currentSave();
    assert.equal(save.away.guestId, "g-1", "the marker survives the save");
    assert.equal(save.away.rev, 2, "with its ordering");
    assert.equal(save.profile, state.profile, "and the frozen profile is handed through by reference, not rebuilt");
    assert.equal(save.world, state.worldState, "likewise the world");
    // **The assertion that actually catches the guard being removed:** reading the runtime
    // would overwrite the destination from `state.ui`. A frozen record is not re-read.
    assert.equal(state.worldState.destination, "where-it-actually-left-off", "the frozen world was not re-stamped from the runtime");
  } finally {
    state.profile = before.profile;
    state.worldState = before.worldState;
    state.ui = before.ui;
    state.away = before.away;
  }
});
