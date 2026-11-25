// Playtest 23: **a pilot must be able to come back.**
//
// The owner's report (2026-11-25): *"when the guest leaves and then tries to rejoin. Stuck on 85%
// handshake after using the link and if i click bring my pilot it says in chat 'The link has
// already been used or it was copied wrongly. Ask host for a new one.'"*
//
// The cause was not the link. The host's **write-back** (and the `left` mark a departure writes)
// edits a guest record *without* the guest's secret — and `custody.guestRecord` hashed whatever it
// was given, so a record that had been written back once held the hash of **nothing** instead of the
// hash of the pilot's token. Every later hello for that pilot then failed `handshake`'s token check,
// with exactly that sentence, for ever.
//
// It looked intermittent because a record marked `left` (a clean "bye", a tab close) is re-admitted
// without a token check, while a record left `left: false` (a dropped connection, a crashed tab, or
// simply a visit long enough for the two-second sync to write back) is not.
//
// These tests are the class, not the case: a record must keep its secret through every edit that
// does not carry one, and a pilot must be able to leave and come back.
//
// Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as session from "../src/net/session.js";
import { newProfile, newWorld, SAVE_VERSION, sanitizeSave } from "../src/state/profile.js";
import { putGuest } from "../src/net/multiplayer.js";
import { guestRecord, hashToken, tokenCheck, handshake } from "../src/net/custody.js";
import { on } from "../src/util/events.js";
import { NET } from "../src/data/multiplayer.js";

const makeSave = () => sanitizeSave({ v: SAVE_VERSION, profile: newProfile(), world: newWorld(), away: null });
const GUEST_ID = "guest-guest-to";                  // `ownGuestId()`: `guest-` + the token's first 8

/** A record as the host first writes it, from a real hello. */
function admitted(save, guestId = "guest-abc", token = "tok-123") {
  return putGuest(save, guestId, { name: "Bo", token, left: false });
}

/* ------------------------------------------------------------------------- */
/* The one rule                                                              */
/* ------------------------------------------------------------------------- */

test("playtest 23: an edit without the secret keeps the hash the record already had", () => {
  const guestId = "guest-abc", token = "tok-123";
  let save = admitted(makeSave(), guestId, token);
  const stored = save.world.guests[guestId].tokenHash;
  assert.equal(stored, hashToken(token, guestId), "the first hello stores the hash of the real token");

  // Every edit that carries no secret: the write-back, and the `left` mark.
  save = putGuest(save, guestId, { rev: 2, bundle: { profile: { v: SAVE_VERSION }, rev: 2 }, lastSeen: Date.now() });
  assert.equal(save.world.guests[guestId].tokenHash, stored, "a write-back does not invent a secret");
  assert.equal(tokenCheck(token, save.world.guests[guestId].tokenHash, guestId), true, "so the pilot can still prove itself");

  save = putGuest(save, guestId, { left: true, lastSeen: Date.now() });
  assert.equal(save.world.guests[guestId].tokenHash, stored, "and neither does a departure");

  // A real token still replaces it — that is how a pilot is renamed onto a new browser.
  save = putGuest(save, guestId, { token: "tok-new" });
  assert.equal(save.world.guests[guestId].tokenHash, hashToken("tok-new", guestId), "a secret that IS given always wins");
  assert.equal(tokenCheck(token, save.world.guests[guestId].tokenHash, guestId), false, "and the old one stops working");
});

test("playtest 23: guestRecord takes a hash it is handed, and hashes nothing only when it has nothing", () => {
  const kept = guestRecord({ guestId: "g-1", name: "Bo", tokenHash: "deadbeef" });
  assert.equal(kept.tokenHash, "deadbeef", "an update passes the stored hash through");

  const given = guestRecord({ guestId: "g-1", name: "Bo", token: "tok", tokenHash: "deadbeef" });
  assert.equal(given.tokenHash, hashToken("tok", "g-1"), "a real token beats the stored hash");

  const fresh = guestRecord({ guestId: "g-1", name: "Bo" });
  const empty = guestRecord({ guestId: "g-1", name: "Bo", token: "" });
  assert.equal(fresh.tokenHash, empty.tokenHash, "a brand-new record with no token is one shape, as before");
  assert.equal(tokenCheck("", fresh.tokenHash, "g-1"), true, "and it matches an empty secret, never a pilot's");
});

test("playtest 23: the handshake admits the pilot whose record was written back", () => {
  const guestId = "guest-abc", token = "tok-123";
  const save = putGuest(admitted(makeSave(), guestId, token), guestId, {
    rev: 3, bundle: { profile: { v: SAVE_VERSION }, rev: 3 },
  });
  const checked = handshake({
    token, guestId, record: save.world.guests[guestId],
    version: SAVE_VERSION, worldVersion: SAVE_VERSION, worldId: "w-1", expectedWorldId: "w-1",
  });
  assert.equal(checked.ok, true, "a returning pilot is not locked out by its own save");
});

/* ------------------------------------------------------------------------- */
/* The whole loop, through two real sessions                                  */
/* ------------------------------------------------------------------------- */

/** A pilot with something to lose, as slice 5's own end-to-end test builds it. */
function pilotSave() {
  const save = makeSave();
  save.profile.cr = 800;
  save.profile.holds[save.profile.ship] = { ferrite: 10 };
  return save;
}

function makeWire() {
  const made = [];
  const factory = ({ role, worldId, onState, onData, onPeer }) => {
    const channel = {
      role, worldId, peerId: null, outbound: [],
      join: async () => { onState?.({ state: "finding", reason: "" }); return channel; },
      send: (peerId, value) => { channel.outbound.push({ peerId, value }); channel.deliver?.(peerId, value); return true; },
      broadcast: value => { if (!channel.peerId) return 0; channel.send(channel.peerId, value); return 1; },
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

/** Host and guest, joined, with a real pilot carried in (the suitcase, not only the hello). */
async function joinedPair({ token = "guest-token", carry = true } = {}) {
  const wire = makeWire();
  session.setChannelFactory(wire.factory);
  const hostSave = pilotSave();
  const guestSave = pilotSave();
  const narrow = next => {
    if (next.world?.guests) guestSave.world.guests = next.world.guests;
    if (typeof next.world?.worldId === "string") guestSave.world.worldId = next.world.worldId;
  };

  const host = session.createChannelForTest("host", "w-1", "Ada", "host-token", {
    read: () => hostSave, write: next => Object.assign(hostSave, next), install: next => Object.assign(hostSave, next),
  });
  await host.start();
  const hostChannel = wire.made.at(-1);
  const guest = session.createChannelForTest("guest", "w-1", "Bo", token, {
    read: () => guestSave, write: narrow, install: next => Object.assign(guestSave, JSON.parse(JSON.stringify(next))),
  });
  await guest.start();
  const guestChannel = wire.made.at(-1);
  // `sim/` answers "what does this pilot look like NOW?" on the bus, exactly as `main.js` does;
  // the host's two-second check has nothing to compare without it.
  on("mp-guest-bundle-request", request => {
    if (!request?.guestId) return;
    request.profile = guestSave.away?.suitcase?.profile || guestSave.profile;
    request.lockers = [];
    request.answered = true;
  });
  hostChannel.deliver = (peerId, value) => guestChannel.reach(value, peerId);
  guestChannel.deliver = (peerId, value) => hostChannel.reach(value, peerId);
  hostChannel.connect("guest-peer");
  guestChannel.connect("host-peer");
  session.focusForTest(guest);
  await new Promise(resolve => setTimeout(resolve, 0));
  if (carry) session.bringPilot();
  await new Promise(resolve => setTimeout(resolve, 0));
  return { host, guest, hostChannel, guestChannel, hostSave, guestSave, wire };
}

/** The returning browser: a fresh guest session on the same link, on the host's live channel. */
async function comeBack(wire, hostChannel, peerId, { token = "guest-token" } = {}) {
  const back = session.createChannelForTest("guest", "w-1", "Bo", token, {
    read: () => pilotSave(), write: () => {}, install: () => {},
  });
  await back.start();
  const channel = wire.made.at(-1);
  hostChannel.deliver = (peerId2, value) => channel.reach(value, peerId2);
  channel.deliver = (peerId2, value) => hostChannel.reach(value, peerId2);
  channel.connect(peerId);
  session.focusForTest(back);
  await new Promise(resolve => setTimeout(resolve, 0));
  return { back, channel };
}

test("playtest 23: a visit written back by the host's own check does not lock the pilot out", async () => {
  const { host, hostSave, wire, hostChannel } = await joinedPair();
  assert.equal(host.snapshot().guests.length, 1, "the guest is in the world");
  const stored = hostSave.world.guests[GUEST_ID].tokenHash;
  assert.equal(stored, hashToken("guest-token", GUEST_ID), "the host holds the hash of the real token");

  // The host's own two-second check, run by hand: the first pass records what the visiting pilot
  // looks like, the second sees no change and writes the copy back — the edit that erased the hash.
  const revBefore = hostSave.world.guests[GUEST_ID].rev;
  host.syncGuests();                                  // sees a change and schedules the write-back
  await new Promise(resolve => setTimeout(resolve, NET.snapshotSec * 1000 + 250));
  assert.equal(hostSave.world.guests[GUEST_ID].rev > revBefore, true, "the write-back really ran (its copy moved on)");
  assert.equal(hostSave.world.guests[GUEST_ID].tokenHash, stored, "and it left the secret's hash alone");

  // The guest's browser vanishes with no `bye` — a killed tab, a dropped channel — then comes back.
  session.stop({ quiet: true });
  const { back } = await comeBack(wire, hostChannel, "guest-peer-2");

  // The old window may be told it was replaced (one window per pilot, slice 5) — that is the
  // takeover rule, not a locked door. What must never appear is a **token** refusal.
  const toTheNewWindow = hostChannel.outbound.filter(m => m.value.t === "refuse" && m.peerId === "guest-peer-2");
  assert.deepEqual(toTheNewWindow.map(m => m.value.reason), [], "the returning pilot is not refused");
  assert.deepEqual(
    hostChannel.outbound.filter(m => m.value.t === "refuse" && m.value.reason === "token").map(m => m.value.message),
    [],
    "and nothing says the link has already been used",
  );
  assert.equal(hostChannel.outbound.some(m => m.value.t === "welcome"), true, "the pilot is welcomed back");
  assert.equal(host.snapshot().guests.some(row => row.guestId === GUEST_ID), true, "and the pilot is flying here again");
  assert.equal(hostSave.world.guests[GUEST_ID].tokenHash, stored, "with the same secret it left with");
  session.stop({ quiet: true });
});

test("playtest 23: leave and rejoin through a clean goodbye also comes back", async () => {
  const { host, hostChannel, guest, hostSave, wire } = await joinedPair();

  guest.stop();                                        // a `bye`: the host writes the final copy and marks it left
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(host.snapshot().guests.length, 0, "the row is gone");
  assert.equal(hostSave.world.guests[GUEST_ID].left, true, "the record holds a suitcase, not an identity");
  assert.equal(hostSave.world.guests[GUEST_ID].tokenHash, hashToken("guest-token", GUEST_ID), "and still knows its pilot");

  const { back } = await comeBack(wire, hostChannel, "guest-peer-3");
  const refusals = hostChannel.outbound.filter(m => m.value.t === "refuse");
  assert.deepEqual(refusals.map(m => m.value.reason), [], "no refusal on the way back in");
  assert.equal(hostChannel.outbound.some(m => m.value.t === "welcome"), true, "welcomed back");
  assert.equal(host.snapshot().guests.some(row => row.guestId === GUEST_ID), true, "the pilot is listed again");
  assert.equal(hostSave.world.guests[GUEST_ID].left, false, "and it is visiting again, not holding a suitcase");

  // "Bring my pilot" after a rejoin is the owner's other half of this bug: it must not fail.
  const carried = back.bringPilot();
  assert.equal(carried.ok, true, "the pilot travels again after a rejoin");
  session.stop({ quiet: true });
});
