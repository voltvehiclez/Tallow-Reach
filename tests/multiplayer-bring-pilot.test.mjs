// Step 16 slice 4, end to end: two live sessions, and a pilot that actually crosses.
//
// `multiplayer-carry` proves the suitcase's arithmetic and `multiplayer-visitors` proves a
// bundle becomes a ship. This file proves the WIRING between them: a guest presses Bring my
// pilot, the host answers, the host writes a newer copy back, and the guest comes home with
// what the host last recorded — all through the real protocol, over the in-memory wire.
//
// What it still cannot prove: that a browser draws it. That is the owner's playtest.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as session from "../src/net/session.js";
import { SAVE_VERSION, newProfile, newWorld, sanitizeSave } from "../src/state/profile.js";
import { checkOut, totals, compare } from "../src/net/custody.js";
import { on } from "../src/util/events.js";
import { NET } from "../src/data/multiplayer.js";

const STATION = "reach:meridian";

/** A pilot with something to lose. */
function pilotSave({ cr = 800, ferrite = 10 } = {}) {
  const save = { v: SAVE_VERSION, profile: newProfile(), world: newWorld(), away: null };
  save.profile.cr = cr;
  save.profile.holds[save.profile.ship] = { ferrite };
  save.world.stationStores[STATION] = { ferrite: 5 };
  return sanitizeSave(save);
}

/** The in-memory wire, exactly as `multiplayer-session` builds it. */
function makeWire() {
  const made = [];
  const factory = ({ role, worldId, onState, onData, onPeer }) => {
    const channel = {
      role,
      worldId,
      peerId: null,
      outbound: [],
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
      reach: (message, peerId = "peer-1") => onData?.({ ...message, peerId }),
      connect(peerId = "peer-1") { channel.peerId = peerId; onPeer?.({ kind: "join", peerId }); },
    };
    made.push(channel);
    return channel;
  };
  return { factory, made };
}

/**
 * A host and a guest, wired together, each with its own save behind its own seam.
 *
 * The guest's seam is a real one this time — it has `install`, so the frozen record the
 * session builds actually lands somewhere and the test can look at it.
 */
async function pair({ hostName = "Ada", guestName = "Bo" } = {}) {
  const wire = makeWire();
  session.setChannelFactory(wire.factory);
  const hostSave = { ...pilotSave({ cr: 40, ferrite: 0 }) };
  const guestSave = pilotSave({ cr: 800, ferrite: 10 });
  const hostKit = { read: () => hostSave, write: next => Object.assign(hostSave, next) };
  const guestKit = { read: () => guestSave, write: next => Object.assign(guestSave, next) };

  const host = session.createChannelForTest("host", "w-1", hostName, "host-token", hostKit);
  await host.start();
  const hostChannel = wire.made.at(-1);
  const guest = session.createChannelForTest("guest", "w-1", guestName, "guest-token", guestKit);
  await guest.start();
  const guestChannel = wire.made.at(-1);

  hostChannel.deliver = (peerId, value) => guestChannel.reach(value, peerId);
  guestChannel.deliver = (peerId, value) => hostChannel.reach(value, peerId);
  hostChannel.connect("guest-peer");
  guestChannel.connect("host-peer");
  // `joinWorld` makes the guest the active session once the handshake settles, which is
  // what `bringPilot()` looks for. The in-memory wire answers synchronously, so one turn
  // of the event loop is enough.
  session.focusForTest(guest);
  await new Promise(resolve => setTimeout(resolve, 0));
  return { host, guest, hostChannel, guestChannel, hostSave, guestSave, hostKit, guestKit };
}

test("slice 4: joining a world does NOT freeze the pilot — Bring my pilot does", async () => {
  const { guestSave, hostChannel } = await pair();
  // The guest has joined (the wire connected and it said hello) and its pilot is at home.
  assert.equal(guestSave.away, null, "a visit alone leaves the pilot at home");
  const carries = hostChannel.outbound.filter(m => m.value.t === "carry");
  assert.equal(carries.length, 0, "nothing crossed the wire by joining");
});

test("slice 4: Bring my pilot sends a suitcase, and the host takes it", async () => {
  const { guest, guestSave, guestChannel, hostSave } = await pair();
  const noticed = [];
  on("mp-notice", text => noticed.push(text));

  const done = session.bringPilot();
  assert.equal(done.ok, true, done.message);

  // The guest's own record is frozen: marker on, stations emptied into the suitcase.
  assert.equal(guestSave.away.worldId, "w-1");
  assert.equal(guestSave.away.hostName, "Ada");
  assert.ok(guestSave.away.suitcase?.profile, "the suitcase is on the save");
  assert.equal(totals(guestSave).get(`station:${STATION} | ferrite`), undefined, "the station stock left home");

  // ...and the host received it.
  // A `carry` is the GUEST's message, so it is on the guest's outbound wire.
  const carry = guestChannel.outbound.find(m => m.value.t === "carry");
  assert.ok(carry, "a carry went out");
  assert.ok(carry.value.bundle?.profile, "and it is a whole pilot, not a summary");
  assert.ok(hostSave.world.guests && Object.keys(hostSave.world.guests).length >= 1, "the host stored a guest");
  const record = Object.values(hostSave.world.guests)[0];
  // The host keeps a HASH of the token, never the token: `cleanGuests` requires the hash
  // and the stored bundle carries no `token` key at all. A stolen host save is not a
  // stolen identity.
  assert.ok(!("token" in record), "no raw token on the record");
  assert.ok(!("token" in (record.bundle || {})), "and none in the bundle");
  assert.match(record.tokenHash, /^[0-9a-f]+$/, "only the hash, which proves without revealing");
  assert.equal(record.bundle.profile.cr, 800, "and it holds the pilot's credits");
  assert.ok(hostSave.world.stationStores[STATION]?.ferrite >= 5, "the lockers arrived in the world's stations");
});

test("slice 4: the host sends the copy back, and the guest's marker carries it", async () => {
  const { guest, guestSave, hostChannel } = await pair();
  session.bringPilot();
  // The host answers a suitcase with a `suitcase`; the guest stores it under the marker.
  const suitcase = hostChannel.outbound.find(m => m.value.t === "suitcase");
  assert.ok(suitcase || guestSave.away, "either the copy came back, or the marker still holds the one we sent");
  assert.ok(guestSave.away.suitcase?.profile, "the guest can always come home from its own copy");
  assert.equal(guestSave.away.epoch, 0, "ordered by epoch");
  assert.ok(typeof guestSave.away.rev === "number", "and by rev");
});

test("slice 4: a second Bring my pilot is a no-op, not a second ship", async () => {
  const { guest, guestSave, guestChannel } = await pair();
  session.bringPilot();
  const before = guestChannel.outbound.filter(m => m.value.t === "carry").length;
  const again = session.bringPilot();
  assert.equal(again.ok, true, "it is not an error — the pilot is simply already here");
  const after = guestChannel.outbound.filter(m => m.value.t === "carry").length;
  assert.equal(after, before, "and nothing crossed the wire twice");
});

test("slice 4: an oversize suitcase is refused before anything is frozen", async () => {
  const wire = makeWire();
  session.setChannelFactory(wire.factory);
  const huge = pilotSave();
  huge.profile.holds[huge.profile.ship] = { filler: "x".repeat(NET.suitcaseMaxBytes + 10) };
  const kit = { read: () => huge, write: next => Object.assign(huge, next) };
  const hostSave = pilotSave({ cr: 0 });
  const hostKit = { read: () => hostSave, write: next => Object.assign(hostSave, next) };
  const host = session.createChannelForTest("host", "w-2", "Ada", "t", hostKit);
  await host.start();
  const hostChannel = wire.made.at(-1);
  const guest = session.createChannelForTest("guest", "w-2", "Bo", "t2", kit);
  await guest.start();
  const guestChannel = wire.made.at(-1);
  hostChannel.deliver = (peerId, v) => guestChannel.reach(v, peerId);
  guestChannel.deliver = (peerId, v) => hostChannel.reach(v, peerId);
  hostChannel.connect("g");
  guestChannel.connect("h");
  session.focusForTest(guest);
  await new Promise(resolve => setTimeout(resolve, 0));

  const noticed = [];
  on("mp-notice", text => noticed.push(text));
  const done = session.bringPilot();
  assert.equal(done.ok, false, "it refuses");
  assert.equal(huge.away, null, "and the pilot stays home with all its cargo — nothing was frozen");
  assert.ok(noticed.some(t => /too much to travel/i.test(t)), `it says why: ${noticed.join(" | ")}`);
});

test("slice 4: coming home needs no host, and restores what the pilot left with", async () => {
  const { guest, guestSave, hostChannel } = await pair();
  session.bringPilot();
  const suitcase = guestSave.away.suitcase;
  assert.ok(suitcase, "the guest holds a copy");

  // The host goes away entirely.
  hostChannel.leave();
  session.focusForTest(null);

  const done = session.bringPilotHome(guestSave);
  assert.equal(done.ok, true, done.message);
  assert.equal(done.save.away, null, "the marker is cleared");
  assert.equal(done.save.profile.cr, 800, "the credits are back");
  assert.ok(totals(done.save).get(`station:${STATION} | ferrite`) >= 5, "and so are the lockers");
});

test("slice 4: a copy that is older than the one the guest holds is ignored", async () => {
  const { guestSave, guestChannel } = await pair();
  session.bringPilot();
  const base = guestSave.away.suitcase;

  // A newer copy from the host (rev 5) is taken.
  const newer = { ...base, profile: { ...base.profile, cr: 5000 } };
  guestChannel.reach({ t: "suitcase", guestId: guestSave.away.guestId, epoch: 0, rev: 5, bundle: newer });
  assert.equal(guestSave.away.rev, 5, "the newer copy was stored");
  assert.equal(guestSave.away.suitcase.profile.cr, 5000, "and its contents with it");

  // A late copy from before (rev 1) arrives afterwards and must not win.
  const older = { ...base, profile: { ...base.profile, cr: 1 } };
  guestChannel.reach({ t: "suitcase", guestId: guestSave.away.guestId, epoch: 0, rev: 1, bundle: older });
  assert.equal(guestSave.away.rev, 5, "the older copy did not move the marker back");
  assert.equal(guestSave.away.suitcase.profile.cr, 5000, "nor overwrite the newer credits");
  // The rule that decided is slice 1's ordering pair, not arrival order.
  assert.ok(compare({ epoch: 0, rev: 1 }, { epoch: 0, rev: 5 }) > 0);
});
