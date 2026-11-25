// Playtest 8a's follow-up slice: **the guest's controls reach its ship** (step 16, slice 8b).
//
// The owner's model, from the plan: the host's browser is the only writer of the truth, and the
// guest sends *what it is asking its ship to do* — a command, not a key (refactor principle 7). So
// this slice is three small facts:
//
//   1. a `controls` message kind, rebuilt field by field on the way out and in (`net/protocol.js`),
//      capped so a hand-made packet cannot ask a ship for 900 m/s of thrust;
//   2. `state.localInput` — **one new state, one new writer** (`core/input.js`), because `net/` may
//      not import `core/` and `sim/` may not either (the numbered decision in REFACTOR_PLAN.md);
//   3. `sim/multiplayer.js` `applyGuestControls`, which writes the asking into that visitor's own
//      control record — where `core/input.js` writes the local pilot's — and the host's sim decides
//      what it means. A docked visitor launches the first time it asks to fly; a silent guest is
//      asked for nothing after `CONTROLS.staleMs`.
//
// What is NOT here (8d): prediction, acks, rewind. A guest's own screen still shows its own galaxy
// (8c), so a playtest of this slice is done from the **host's** screen.
//
// Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as session from "../src/net/session.js";
import { SAVE_VERSION, newProfile, newWorld, sanitizeSave } from "../src/state/profile.js";
import { putGuest } from "../src/net/multiplayer.js";
import { hashToken } from "../src/net/custody.js";
import { cleanMessage, readMessage, KINDS, LIMITS } from "../src/net/protocol.js";
import { CONTROL_FIELDS, CONTROLS } from "../src/data/multiplayer.js";
import { on } from "../src/util/events.js";
import { state, localPlayer } from "../src/state/state.js";
import { createPlayer } from "../src/sim/player.js";
import { configurePlayer, launch } from "../src/sim/session.js";
import { neutralControls } from "../src/state/controls.js";
import {
  arriveGuest, applyGuestControls, ageGuestControls, guestRecordOf, resetGuests,
} from "../src/sim/multiplayer.js";
import { stepSim } from "../src/sim/step.js";
import { keys, syncControls, pointer } from "../src/core/input.js";
import { DEFAULT_PLACE } from "../src/data/places.js";

const THRUST_ON = { thrust: 1, steer: { x: 0, y: 0 }, aim: [0, 0, -1] };

/* ------------------------------------------------------------------------- */
/* 1. The wire: a command, capped and rebuilt                                */
/* ------------------------------------------------------------------------- */

test("slice 8b: `controls` is a kind, and it carries only the control record", () => {
  assert.equal(KINDS.includes("controls"), true, "the kind exists");
  assert.deepEqual(
    CONTROL_FIELDS,
    ["steer", "roll", "thrust", "strafe", "lift", "stop", "brake", "boost", "fire", "sec", "aim"],
    "the fields are the control record plus the aiming direction",
  );
  const message = cleanMessage("controls", { ...THRUST_ON, nonsense: "dropped", guestId: "not-a-field" });
  assert.equal(message.t, "controls");
  assert.equal(message.thrust, 1);
  assert.equal("nonsense" in message, false, "a field the record has no room for is not carried");
  assert.equal("guestId" in message, false, "a controls message never names a pilot: the peer is the identity");
  assert.deepEqual(readMessage(message), message, "and it survives the reader unchanged");
});

test("slice 8b: every axis is clamped to -1..1 and every held control is a real true", () => {
  const wild = cleanMessage("controls", {
    thrust: 900, strafe: -400, lift: NaN, roll: "sideways",
    stop: "yes", brake: 1, boost: true, fire: 1, sec: null,
    steer: { x: -7, y: 0.25 },
    aim: { x: 3, y: 0, z: -4 },
  });
  assert.equal(wild.thrust, 1, "a hand-made 900 m/s of thrust is a full stick, not a rocket");
  assert.equal(wild.strafe, -1);
  assert.equal(wild.lift, 0, "NaN is nothing, never a wrecked axis");
  assert.equal(wild.roll, 0, "a string is not a stick");
  assert.deepEqual(wild.steer, { x: -1, y: 0.25 }, "the stick is one object with two clamped axes");
  assert.equal(wild.boost, true, "a held control that really is `true` is held");
  assert.equal(wild.stop, false, "`\"yes\"` is not a key being down");
  assert.equal(wild.brake, false, "`1` is not a key being down");
  assert.equal(wild.fire, false);
  assert.deepEqual(wild.aim, [3, 0, -4], "aim is a direction; the sim normalises it when it is used");
  // A message with nothing in it is a neutral one, never a missing one.
  const empty = cleanMessage("controls", {});
  assert.deepEqual(empty.steer, { x: 0, y: 0 });
  assert.deepEqual(empty.aim, [0, 0, -1], "an absent aim keeps the nose forward");
  assert.equal(readMessage({ t: "controls" }).t, "controls", "and `{}` is still a valid asking of nothing");
  assert.equal(LIMITS.reach, 1e6, "the shared axis cap is untouched by this slice");
});

/* ------------------------------------------------------------------------- */
/* 2. `state.localInput`: one new state, one new writer                      */
/* ------------------------------------------------------------------------- */

test("slice 8b: the wire's copy of this pilot's input mirrors the controls, and is a copy", () => {
  state.players.length = 0;
  state.localPlayerIndex = 0;
  state.profile = newProfile();
  createPlayer();
  for (const code of Object.keys(keys)) keys[code] = 0;
  pointer.x = 0.4;
  pointer.y = -0.2;
  keys.KeyW = 1;
  keys.ShiftLeft = 1;
  keys.fire = 1;
  syncControls();
  const c = localPlayer().controls;
  assert.equal(state.localInput.thrust, c.thrust, "thrust mirrors");
  assert.equal(state.localInput.boost, c.boost, "and a held key");
  assert.equal(state.localInput.fire, c.fire);
  assert.deepEqual({ x: state.localInput.steer.x, y: state.localInput.steer.y }, { x: c.steer.x, y: c.steer.y });
  // Not a reference: a session may read this, and nothing may write the pilot's controls through it.
  state.localInput.thrust = -1;
  assert.equal(c.thrust, 1, "the pilot's own controls are untouched by the wire's copy");
  keys.KeyW = 0;
  keys.ShiftLeft = 0;
  keys.fire = 0;
  pointer.x = pointer.y = 0;
  syncControls();
  assert.equal(state.localInput.thrust, 0, "and letting go is mirrored too");
});

/* ------------------------------------------------------------------------- */
/* 3. The sim: the asking lands in that pilot's record, and it flies         */
/* ------------------------------------------------------------------------- */

/** A pocket with the local pilot docked out of the way and one visitor docked at its arrival. */
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
  P.docked = true;                      // the host is at its own station, out of the way
  const visitor = arriveGuest({ guestId: "guest-1", name: "Acey", profile: newProfile(), place: DEFAULT_PLACE });
  return { P, visitor };
}

test("slice 8b: a guest's asking is written into its own record, and the host's sim is what moves it", () => {
  const { visitor } = worldWithVisitor();
  assert.equal(visitor.docked, true, "a visitor arrives docked");
  const took = applyGuestControls("guest-1", { ...THRUST_ON, fire: true, aim: [0, 0, -1] });
  assert.equal(took, true, "a known visitor's asking is accepted");
  assert.equal(visitor.controls.thrust, 1, "the same field `core/input.js` fills for the local pilot");
  assert.equal(visitor.controls.fire, true);
  assert.equal(visitor.docked, false, "asking to fly launches the docked visitor: it has no other hull");
  assert.ok(visitor.pos.distanceTo(state.player.pos) > 0, "and it is out at its station's launch point");

  const at = visitor.pos.clone();
  for (let i = 0; i < 120; i++) stepSim(1 / 60);
  assert.ok(visitor.pos.distanceTo(at) > 1, `the host's own sim flew it (${visitor.pos.distanceTo(at).toFixed(2)} m)`);
  assert.equal(state.player.docked, true, "the host's pilot did nothing: this was one record's controls");
});

test("slice 8b: an asking of nothing does not launch a docked visitor", () => {
  const { visitor } = worldWithVisitor();
  applyGuestControls("guest-1", cleanMessage("controls", {}));
  assert.equal(visitor.docked, true, "standing at the counter is not flying");
  assert.equal(visitor.controls.thrust, 0);
});

test("slice 8b: a guest that is not here, or is dead, drives nothing", () => {
  const { visitor } = worldWithVisitor();
  assert.equal(applyGuestControls("guest-nobody", THRUST_ON), false, "an unknown id is refused");
  assert.equal(applyGuestControls("", THRUST_ON), false);
  assert.equal(applyGuestControls("guest-1", null), false, "a message with no body is refused");
  assert.equal(visitor.docked, true, "and none of that launched anything");

  visitor.docked = false;
  visitor.dead = true;
  assert.equal(applyGuestControls("guest-1", THRUST_ON), false, "a wreck is not flown");
  assert.equal(applyGuestControls("guest-1", THRUST_ON), false);
  assert.equal(visitor.controls.thrust, 0, "and its controls were never written after death");
});

test("slice 8b: the sim clamps again, and the aim is normalised into the record", () => {
  const { visitor } = worldWithVisitor();
  visitor.docked = false;
  applyGuestControls("guest-1", { thrust: 12, roll: -9, aim: [0, 0, -50] });
  assert.equal(visitor.controls.thrust, 1, "even a message that skipped the wire is clamped");
  assert.equal(visitor.controls.roll, -1);
  assert.ok(Math.abs(Math.hypot(visitor.aimDirection.x, visitor.aimDirection.y, visitor.aimDirection.z) - 1) < 1e-6,
    "the aim is a unit direction, so a long vector cannot outrange a shot");
  assert.ok(Math.abs(visitor.aimDirection.z + 1) < 1e-6, "and it points where the guest looked");
  applyGuestControls("guest-1", { aim: [0, 0, 0] });
  assert.ok(Math.abs(visitor.aimDirection.z + 1) < 1e-6, "a zero aim leaves the last good one alone");
});

/* ------------------------------------------------------------------------- */
/* 4. A silent guest does not fly on                                         */
/* ------------------------------------------------------------------------- */

test("slice 8b: a guest that goes quiet is asked for nothing after `CONTROLS.staleMs`", () => {
  const { visitor } = worldWithVisitor();
  applyGuestControls("guest-1", { ...THRUST_ON, fire: true, boost: true });
  state.time = 0;                       // `applyGuestControls` stamps `inputAt` from the sim clock
  applyGuestControls("guest-1", { ...THRUST_ON, fire: true, boost: true });
  state.time = CONTROLS.staleMs / 1000 - 0.01;
  ageGuestControls();
  assert.equal(visitor.controls.thrust, 1, "still inside the window: the ship keeps its stick");
  assert.equal(visitor.controls.fire, true, "and its trigger");

  state.time = CONTROLS.staleMs / 1000 + 0.01;
  ageGuestControls();
  assert.equal(visitor.controls.thrust, 0, "silence lets go of the stick");
  assert.equal(visitor.controls.fire, false, "and the trigger");
  assert.equal(visitor.controls.boost, false);
  assert.equal(visitor.docked, false, "it stays launched; it simply coasts");
});

test("slice 8b: a visitor that has never been asked anything is not \"stale\"", () => {
  const { visitor } = worldWithVisitor();
  state.time = 60;
  ageGuestControls();
  assert.equal(visitor.docked, true, "a visitor nobody has flown is left parked");
  assert.equal(visitor.controls.thrust, 0);
});

/* ------------------------------------------------------------------------- */
/* 5. The session: who may drive what                                        */
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

/** A host and one welcomed guest, as `tests/multiplayer-rejoin.test.mjs` builds them. */
async function joined() {
  const wire = wirePair();
  session.setChannelFactory(wire.factory);
  const hostSave = makeSave();
  hostSave.world.guests["guest-guest-to"] = {
    name: "Bo", tokenHash: hashToken("guest-token", "guest-guest-to"), epoch: 1, rev: 1,
    bundle: { profile: newProfile(), rev: 1, epoch: 1 }, lastSeen: 0, left: false,
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
  // Each side is addressed by the name ITS peer gave it: the host calls the guest "guest-peer", and
  // the guest calls the host "host-peer". Deliberately not the same string, so this test cannot pass
  // by accident on a message addressed to nobody.
  hostChannel.deliver = (peerId, value) => guestChannel.reach(value, "host-peer");
  guestChannel.deliver = (peerId, value) => hostChannel.reach(value, "guest-peer");
  hostChannel.connect("guest-peer");
  guestChannel.connect("host-peer");
  await new Promise(resolve => setTimeout(resolve, 0));
  return { host, guest, hostChannel, guestChannel };
}

test("slice 8b: a guest's controls reach the host, labelled with the peer's own pilot", async () => {
  const { hostChannel } = await joined();
  const heard = [];
  on("mp-guest-controls", payload => heard.push(payload));

  hostChannel.reach(cleanMessage("controls", { thrust: 0.75, fire: true, aim: [0, 0, -1] }), "guest-peer");
  assert.equal(heard.length, 1, "the host hands the asking on, once");
  assert.equal(heard[0].guestId, "guest-guest-to", "named by the peer it came from, never by the message");
  assert.equal(heard[0].input.thrust, 0.75);
  assert.equal(heard[0].input.fire, true);

  // A controls message from a peer the host never welcomed drives nothing.
  hostChannel.reach(cleanMessage("controls", { thrust: 1 }), "stranger-peer");
  assert.equal(heard.length, 1, "an unwelcomed peer is ignored");
  session.stop({ quiet: true });
});

test("slice 8b: the guest's own send is cleaned, and stops when the session does", async () => {
  const { guest, guestChannel } = await joined();
  guestChannel.outbound.length = 0;
  const previous = state.localInput;
  state.localInput = { ...neutralControls(), thrust: 50, fire: true };
  state.aimDirection = { x: 0, y: 0, z: -1 };
  const sent = guest.sendControls();
  const message = guestChannel.outbound.at(-1)?.value;
  state.localInput = previous;
  assert.equal(sent, true, "the guest sends");
  assert.equal(message.t, "controls", "and it is a controls message");
  assert.equal(message.thrust, 1, "clamped on the way out as well as on the way in");
  assert.equal(message.fire, true);
  assert.deepEqual(message.aim, [0, 0, -1], "with the guest's own looking direction");

  guest.stop({ quiet: true });          // this session, not whichever one was created last
  guestChannel.outbound.length = 0;
  assert.equal(guest.sendControls(), false, "a session that has stopped sends nothing");
  assert.equal(guestChannel.outbound.length, 0);
});
