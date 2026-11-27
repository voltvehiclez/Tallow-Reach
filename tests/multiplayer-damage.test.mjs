// Playtest 23, second round: **one stuck browser, and a friend's hull that was only a picture.**
//
// Two reports (owner, 2026-11-25):
//
//  1. *"In the previous browser, still can't connect … 'That link has already been used, or it was
//     copied wrongly.'"* — one browser, for ever, while a fresh browser joined the same world fine,
//     and bringing the pilot home did not help. The cause was the first round's bug leaving its mark
//     in the **host's** save: the record had been written back once by a build that re-hashed
//     nothing over the real hash, so it held the hash of *no secret at all* and refused its own pilot
//     for ever. A record that knows no secret cannot refuse anybody — that is the repair — and a
//     record that DOES hold a secret still refuses a wrong one.
//  2. *"The guest ship that spawns in is not clippable and doesn't take damage. Every ship should by
//     default take damage and be collidable in tallow reach unless otherwise specified."* — a
//     visiting hull was drawn and simulated but nothing treated it as a body: the host's own bolts
//     passed through it and two hulls could occupy the same space. Now a friend's hull stops a shot
//     and stops a ship, shields first, exactly as a hostile's does.
//
// Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as session from "../src/net/session.js";
import { SAVE_VERSION, newProfile, newWorld, sanitizeSave } from "../src/state/profile.js";
import { putGuest } from "../src/net/multiplayer.js";
import { handshake, hashToken, recordHoldsNoSecret, tokenCheck } from "../src/net/custody.js";
import { on } from "../src/util/events.js";
import { state, profileOf } from "../src/state/state.js";
import { createPlayer } from "../src/sim/player.js";
import { configurePlayer, homeStationPlace } from "../src/sim/session.js";
import { stationAt } from "../src/sim/places.js";
import { RECOVERY_FEE } from "../src/data/station.js";
import { flight, hurt, pilotHullRadius } from "../src/sim/player.js";
import { arriveGuest, guestRecordOf, resetGuests } from "../src/sim/multiplayer.js";
import { updateBullets } from "../src/sim/combat.js";
import { updateMissileFlight } from "../src/sim/missile.js";
import { addEntity } from "../src/sim/entity.js";
import { shipEntry } from "../src/net/ships.js";
import { V, Q } from "../src/util/math.js";
import { DEFAULT_PLACE } from "../src/data/places.js";

const GUEST_ID = "guest-guest-to";            // `ownGuestId()`: `guest-` + the token's first 8

/* ------------------------------------------------------------------------- */
/* 1. A record that knows no secret cannot refuse anybody                    */
/* ------------------------------------------------------------------------- */

test("playtest 23b: the hash of nothing is recognised, and a real hash is not", () => {
  const nothing = { tokenHash: hashToken("", GUEST_ID) };
  assert.equal(recordHoldsNoSecret(nothing, GUEST_ID), true, "the shape the old build left behind");
  assert.equal(recordHoldsNoSecret({ tokenHash: "" }, GUEST_ID), true, "so is an empty hash");
  assert.equal(recordHoldsNoSecret({ tokenHash: hashToken("real", GUEST_ID) }, GUEST_ID), false, "a real secret is a real secret");
  // Salting: the same "nothing" under another guest id is not this guest's record.
  assert.equal(recordHoldsNoSecret(nothing, "guest-somebody"), false);
});

test("playtest 23b: a damaged record is admitted and flagged, a wrong token is still refused", () => {
  const damaged = { tokenHash: hashToken("", GUEST_ID), left: false };
  const admitted = handshake({
    token: "guest-token", guestId: GUEST_ID, record: damaged,
    version: SAVE_VERSION, worldVersion: SAVE_VERSION, worldId: "w-1", expectedWorldId: "w-1",
  });
  assert.equal(admitted.ok, true, "a record that holds no secret cannot turn its pilot away");
  assert.equal(admitted.repaired, true, "and the host is told it was repaired");

  const wrong = handshake({
    token: "not-the-token", guestId: GUEST_ID, record: { tokenHash: hashToken("guest-token", GUEST_ID) },
    version: SAVE_VERSION, worldVersion: SAVE_VERSION, worldId: "w-1", expectedWorldId: "w-1",
  });
  assert.equal(wrong.ok, false, "a record that holds a secret still refuses the wrong one");
  assert.equal(wrong.reason, "token");
});

/* ------------------------------------------------------------------------- */
/* 1b. The whole stuck browser, through two real sessions                    */
/* ------------------------------------------------------------------------- */

function makeSave() {
  return sanitizeSave({ v: SAVE_VERSION, profile: newProfile(), world: newWorld(), away: null });
}

function wirePair() {
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
      leave: () => {},
      reach: (message, peerId = "peer-1") => onData?.({ ...message, peerId }),
      connect(peerId = "peer-1") { channel.peerId = peerId; onPeer?.({ kind: "join", peerId }); },
    };
    made.push(channel);
    return channel;
  };
  return { factory, made };
}

/** A host whose save already carries the record an older build damaged. */
async function damagedHost() {
  const wire = wirePair();
  session.setChannelFactory(wire.factory);
  const hostSave = makeSave();
  // The state the bug left: the guest exists, holds a suitcase, is not marked `left`, and its hash is
  // the hash of *nothing* — so every later hello for it failed the token check.
  hostSave.world.guests[GUEST_ID] = {
    name: "Bo",
    tokenHash: hashToken("", GUEST_ID),
    epoch: 1,
    rev: 1,
    bundle: { profile: newProfile(), rev: 1, epoch: 1 },
    lastSeen: 0,
    left: false,
  };
  const host = session.createChannelForTest("host", "w-1", "Ada", "host-token", {
    read: () => hostSave, write: next => Object.assign(hostSave, next),
  });
  await host.start();
  const hostChannel = wire.made.at(-1);
  const guest = session.createChannelForTest("guest", "w-1", "Bo", "guest-token", {
    read: () => makeSave(), write: () => {},
  });
  await guest.start();
  const guestChannel = wire.made.at(-1);
  hostChannel.deliver = (peerId, value) => guestChannel.reach(value, peerId);
  guestChannel.deliver = (peerId, value) => hostChannel.reach(value, peerId);
  hostChannel.connect("guest-peer");
  guestChannel.connect("host-peer");
  await new Promise(resolve => setTimeout(resolve, 0));
  return { host, hostSave, hostChannel, guestChannel };
}

test("playtest 23b: the browser the old build locked out gets back in, and its record is repaired", async () => {
  const { host, hostSave, hostChannel } = await damagedHost();
  const refusals = hostChannel.outbound.filter(m => m.value.t === "refuse");
  assert.deepEqual(refusals.map(m => m.value.reason), [], "no refusal: the record held no secret to check");
  assert.equal(hostChannel.outbound.some(m => m.value.t === "welcome"), true, "the pilot is welcomed");
  assert.equal(host.snapshot().guests.some(row => row.guestId === GUEST_ID), true, "and is in the world");

  // The repair is the point: the record now holds the hash of the pilot's real secret, so the NEXT
  // join is an ordinary one and needs no repair at all.
  assert.equal(hostSave.world.guests[GUEST_ID].tokenHash, hashToken("guest-token", GUEST_ID), "the hash is the pilot's again");
  assert.equal(recordHoldsNoSecret(hostSave.world.guests[GUEST_ID], GUEST_ID), false);
  assert.equal(tokenCheck("guest-token", hostSave.world.guests[GUEST_ID].tokenHash, GUEST_ID), true);
  session.stop({ quiet: true });
});

test("playtest 23b: a good hash is never rewritten by a carry that carries an old secret", async () => {
  // The second way a browser could be locked out of its own record: a `carry` putting `away.token` —
  // a token from whenever the pilot was last checked out — over the hash the hello had just proved.
  const { hostSave } = await damagedHost();
  const secure = { ...hostSave.world.guests[GUEST_ID], tokenHash: hashToken("guest-token", GUEST_ID) };
  hostSave.world.guests[GUEST_ID] = secure;
  session.stop({ quiet: true });

  const wire = wirePair();
  session.setChannelFactory(wire.factory);
  const save = makeSave();
  save.world.guests[GUEST_ID] = secure;
  const host = session.createChannelForTest("host", "w-1", "Ada", "host-token", {
    read: () => save, write: next => Object.assign(save, next),
  });
  await host.start();
  const hostChannel = wire.made.at(-1);
  // A carry from the guest, with a stale token in its bundle.
  hostChannel.reach({
    t: "carry",
    guestId: GUEST_ID,
    name: "Bo",
    epoch: 2,
    rev: 2,
    bundle: { v: SAVE_VERSION, rev: 2, epoch: 2, token: "token-from-an-older-build", profile: newProfile(), lockers: [] },
  }, "guest-peer");
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(save.world.guests[GUEST_ID].tokenHash, hashToken("guest-token", GUEST_ID), "the hello's proof stands; the suitcase cannot overwrite it");
  session.stop({ quiet: true });
});

test("playtest 23b: a refusal ends the attempt in words instead of looping", async () => {
  // The link really is somebody else's secret here — a record that DOES hold a secret, presented with
  // a different one. It must still refuse (the repair must not be a weaker handshake), and the guest
  // must end up somewhere it can act from rather than sitting in "joining" for ever.
  const wire = wirePair();
  session.setChannelFactory(wire.factory);
  const save = makeSave();
  save.world.guests[GUEST_ID] = {
    name: "Bo", tokenHash: hashToken("somebody-elses-token", GUEST_ID), epoch: 1, rev: 1,
    bundle: { profile: newProfile(), rev: 1, epoch: 1 }, lastSeen: 0, left: false,
  };
  const host = session.createChannelForTest("host", "w-1", "Ada", "host-token", {
    read: () => save, write: next => Object.assign(save, next),
  });
  await host.start();
  const hostChannel = wire.made.at(-1);
  const guest = session.createChannelForTest("guest", "w-1", "Bo", "guest-token", {
    read: () => makeSave(), write: () => {},
  });
  await guest.start();
  const guestChannel = wire.made.at(-1);
  hostChannel.deliver = (peerId, value) => guestChannel.reach(value, peerId);
  guestChannel.deliver = (peerId, value) => hostChannel.reach(value, peerId);
  hostChannel.connect("guest-peer");
  guestChannel.connect("host-peer");
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(hostChannel.outbound.filter(m => m.value.t === "refuse").length, 1, "exactly one refusal");
  assert.equal(guest.snapshot().on, false, "and the guest's attempt is over, not looping");
  const said = guest.snapshot().chat.map(row => row.text).join(" | ");
  assert.match(said, /already been used/i, "and the host's own words are in the log, to act on");
  session.stop({ quiet: true });
});

/* ------------------------------------------------------------------------- */
/* 2. A friend's hull is a body                                              */
/* ------------------------------------------------------------------------- */

/** A pocket with the local pilot flying and one visiting pilot docked at Meridian's launch point. */
function worldWithVisitor() {
  state.players.length = 0;
  state.localPlayerIndex = 0;
  state.profile = newProfile();
  state.place = DEFAULT_PLACE;
  state.warp = null;
  state.freeCam.on = false;
  for (const list of Object.values(state.world)) list.length = 0;
  resetGuests();
  const P = createPlayer();
  configurePlayer(P, state.profile);
  P.docked = false;
  P.pos.set(0, 0, 0);
  P.quat.identity();
  const visitor = arriveGuest({ guestId: "guest-1", name: "Acey", profile: newProfile(), place: DEFAULT_PLACE });
  visitor.docked = true;                        // as it arrives
  visitor.pos.set(0, 0, -60);
  return { P, visitor };
}

test("playtest 23b: another pilot's hull is solid — the two ships cannot share the space", () => {
  const { P, visitor } = worldWithVisitor();
  const rr = 4 + pilotHullRadius(visitor);
  P.pos.copy(visitor.pos).add(V(0, 0, rr * 0.5));   // halfway inside the friend's hull
  visitor.sh = 0;                                   // so the parked hull's damage lands on hull, not shields
  const mine = P.sh + P.hull;
  P.v.set(0, 0, -120);                              // arriving fast enough to hurt (25 m/s rule)
  flight(1 / 60, P);

  const gap = P.pos.distanceTo(visitor.pos);
  assert.ok(gap >= rr - 1e-6, `the hulls were separated (${gap.toFixed(2)} m apart, ${rr} m needed)`);
  assert.ok(P.sh + P.hull < mine, "and a hard contact costs the pilot, shields first, as a rock does");
  assert.ok(visitor.hull < visitor.hullMax, "the parked hull takes its share too");
  assert.ok(P.pushed, "the pilot feels the push");
});

test("playtest 23b: a slow nudge separates the hulls and hurts nobody", () => {
  const { P, visitor } = worldWithVisitor();
  const rr = 4 + pilotHullRadius(visitor);
  P.pos.copy(visitor.pos).add(V(0, 0, rr * 0.5));
  P.v.set(0, 0, -2);
  const mine = P.sh + P.hull, theirs = visitor.sh + visitor.hull;
  flight(1 / 60, P);
  assert.ok(P.pos.distanceTo(visitor.pos) >= rr - 1e-6, "still separated");
  assert.equal(P.sh + P.hull, mine, "no damage under 25 m/s");
  assert.equal(visitor.sh + visitor.hull, theirs, "on either side");
});

test("playtest 23b: a visiting pilot in another pocket is not in the way", () => {
  const { P, visitor } = worldWithVisitor();
  visitor.place = "sys-000-elsewhere";
  P.pos.copy(visitor.pos);
  const mine = P.sh + P.hull;
  flight(1 / 60, P);
  assert.equal(P.sh + P.hull, mine, "no collision across pockets");
});

test("playtest 23b: the pilot's own bolts damage another pilot's hull, shields first", () => {
  const { P, visitor } = worldWithVisitor();
  visitor.sh = 10;
  visitor.shMax = 20;
  visitor.hull = 50;
  visitor.hullMax = 100;
  const start = { sh: visitor.sh, hull: visitor.hull };

  const shoot = (dmg) => {
    const b = addEntity(state.world.bullets, {
      id: "b1", kind: "bullet", pos: visitor.pos.clone(), quat: Q(), v: V(0, 0, 0),
      own: true, dmg, l: 2, owner: P,
    });
    updateBullets(1 / 60, state.place);
    return b;
  };

  shoot(4);
  assert.equal(visitor.sh, start.sh - 4, "the shield takes it first, as it does for a hostile");
  assert.equal(visitor.hull, start.hull, "hull untouched while shields hold");
  assert.equal(state.world.bullets.length, 0, "and the shot is spent on the hull, not passed through");

  shoot(20);
  assert.equal(visitor.sh, 0, "the shield is gone");
  assert.equal(visitor.hull, start.hull - 14, "and the rest reaches the hull, exactly as it does on a hostile");
});

test("playtest 23b: a shot never hurts the hull that fired it, and a dead hull is not a target", () => {
  const { P, visitor } = worldWithVisitor();
  const mine = P.hull;
  addEntity(state.world.bullets, {
    id: "b2", kind: "bullet", pos: P.pos.clone(), quat: Q(), v: V(0, 0, 0),
    own: true, dmg: 50, l: 2, owner: P,
  });
  updateBullets(1 / 60, state.place);
  assert.equal(P.hull, mine, "a pilot's own hull is never in the way of its own shot");

  visitor.dead = true;
  const before = visitor.hull;
  addEntity(state.world.bullets, {
    id: "b3", kind: "bullet", pos: visitor.pos.clone(), quat: Q(), v: V(0, 0, 0),
    own: true, dmg: 50, l: 2, owner: P,
  });
  updateBullets(1 / 60, state.place);
  assert.equal(visitor.hull, before, "a wreck is not a target");
});

test("playtest 23b: a warhead bursts on another pilot's hull instead of sailing past it", () => {
  const { P, visitor } = worldWithVisitor();
  visitor.sh = 0;
  visitor.hull = 60;                        // a hit this size is not lethal: recovery is the test above
  visitor.pos.set(0, 0, -20);
  const before = visitor.hull;
  addEntity(state.world.missiles, {
    id: "m1", kind: "missile", pos: V(0, 0, -10), d: V(0, 0, -1), quat: Q(), sp: 120,
    dmg: 25, t: null, l: 3, owner: P,
  });
  updateMissileFlight(1 / 60, state.place);
  assert.equal(visitor.hull, before - 25, "the friend's hull takes the warhead, shields first");
  assert.equal(state.world.missiles.length, 0, "and the warhead is spent on it");
});

test("playtest 23b: a warhead does not burst on the hull that fired it", () => {
  const { P, visitor } = worldWithVisitor();
  visitor.pos.set(0, 0, -400);            // out of the way, so only the owner's own hull is near
  const mine = P.sh + P.hull;
  addEntity(state.world.missiles, {
    id: "m2", kind: "missile", pos: P.pos.clone(), d: V(0, 0, -1), quat: Q(), sp: 120,
    dmg: 25, t: null, l: 3, owner: P,
  });
  updateMissileFlight(1 / 60, state.place);
  assert.equal(P.sh + P.hull, mine, "a pilot's own warhead leaves the launch rail");
});

/* ------------------------------------------------------------------------- */
/* 3. Destroyed, and said out loud                                           */
/* ------------------------------------------------------------------------- */

test("step 16 death: a visitor's hull recovers like a pilot — docked at home, fee paid, cargo lost", () => {
  const { visitor } = worldWithVisitor();
  const recovered = [];
  on("mp-guest-recovered", payload => recovered.push(payload));

  const cr = visitor.profile.cr;
  const lostShip = visitor.profile.ship;
  visitor.profile.holds[lostShip].ferrite = 5;    // cargo aboard, which the death must lose
  hurt(visitor.hull + (visitor.sh || 0) + 1, visitor, profileOf(visitor));

  // The ordinary recovery ran, with the visitor's own profile, in the world that holds the record:
  assert.equal(visitor.dead, false, "the hull is not left dead in the field — a visitor recovers like any pilot");
  assert.equal(visitor.docked, true, "and wakes docked, never standing on an undock point");
  const home = homeStationPlace(visitor.profile);
  const station = stationAt(home);
  assert.deepEqual([visitor.pos.x, visitor.pos.y, visitor.pos.z], station.pos,
    "docked at the station's own position, as a local pilot does");
  assert.equal(visitor.profile.cr, cr - RECOVERY_FEE, "the recovery fee was charged, as it always is");
  assert.equal(visitor.profile.holds?.[lostShip]?.ferrite ?? 0, 0, "the lost hull took its cargo with it");
  assert.equal(visitor.hull, visitor.hullMax, "and a fresh hull stands in its place");
  assert.equal(recovered.length, 1, "the world is told once, by name");
  assert.equal(recovered[0].guestId, "guest-1");
  assert.equal(shipEntry(visitor, { id: "guest-1" }).dead, false, "the far screen draws it docked again (SHIP_FIELDS)");

  // The local pilot is untouched by any of it: this is one record's hull, not a global state.
  assert.equal(state.player.dead ?? false, false);
  assert.equal(guestRecordOf("guest-1"), visitor, "and the record is still the world's to write back");
});
