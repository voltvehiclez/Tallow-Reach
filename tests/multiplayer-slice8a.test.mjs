// Step 16 slice 8a: host-authoritative ship snapshots, drawn as views on the other screen.
//
// The slice is four small pieces, and each is tested where it lives:
//
//   data/multiplayer.js  `SHIP_FIELDS` is the list; `SHIP_STREAM` is the rate and the delay.
//   net/ships.js         a live pilot record -> one entry of the list (host side).
//   net/protocol.js      the `ships` kind, cleaned and capped on the way out AND in.
//   net/session.js       the host sends at 24 Hz; a guest hands the message on, minus itself.
//   render/shipstream.js the guest's buffer: draw 100 ms in the past, interpolate, never guess.
//   render/views.js      every other pilot as a hull (host: from `state.players`, no wire).
//
// What no test can prove: that two machines see each other. That is the owner's playtest
// (`testing/TESTING-16-SLICE8A.md`), and pretending otherwise would be a test that passes while
// the real thing fails (the same words the slice-3 connection test uses).
//
// Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { loadHeadless } from "./headless.mjs";
import { SHIP_FIELDS, SHIP_STREAM, HOST_PILOT_ID, NET } from "../src/data/multiplayer.js";
import { shipEntry, shipEntries, hullFraction, hullFor } from "../src/net/ships.js";
import { cleanMessage, readMessage, KINDS, LIMITS } from "../src/net/protocol.js";
import { createShipStream } from "../src/render/shipstream.js";
import { SAVE_VERSION, newProfile, newWorld } from "../src/state/profile.js";
import { DEFAULT_PLACE } from "../src/data/places.js";
import { on } from "../src/util/events.js";
import * as session from "../src/net/session.js";

const source = rel => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

/* ------------------------------------------------------------------------- */
/* The list, in data                                                          */
/* ------------------------------------------------------------------------- */

test("slice 8a: SHIP_FIELDS is the plan's list, plus the two a reader needs", () => {
  // The plan's fields (docs/REFACTOR_PLAN.md, "8a — snapshots out"), by any name:
  const plan = {
    name: ["name"],
    place: ["place"],
    position: ["pos"],
    rotation: ["quat"],
    velocity: ["velocity"],
    throttle: ["throttle"],
    docked: ["docked"],
    dead: ["dead"],
    hullFraction: ["hull"],
  };
  for (const [what, names] of Object.entries(plan)) {
    assert.ok(names.some(n => SHIP_FIELDS.includes(n)), `${what} must travel (SHIP_FIELDS)`);
  }
  // ...and the two the plan implied but did not list: which pilot, and which hull to draw.
  assert.ok(SHIP_FIELDS.includes("id"), "an entry is keyed on the pilot");
  assert.ok(SHIP_FIELDS.includes("ship"), "a screen that knows nothing of the friend's fleet still has to build the right hull");
  // Nothing that is not a picture: a snapshot is never a way to move a rule.
  for (const forbidden of ["profile", "holds", "cr", "loadout", "sh", "en", "power", "controls", "hp"]) {
    assert.equal(SHIP_FIELDS.includes(forbidden), false, `${forbidden} is not a picture of a ship and must not travel`);
  }
});

test("slice 8a: the snapshot rate is the owner's 20–30 Hz, in its own value, not the 2 s sync", () => {
  assert.ok(SHIP_STREAM.hz >= 20 && SHIP_STREAM.hz <= 30, "24 Hz sits inside the owner's band");
  assert.ok(Math.abs(1000 / SHIP_STREAM.hz - 1000 / 24) < 1e-9, "24 a second is one every 41.7 ms");
  assert.equal(NET.snapshotSec, 2, "the profile sync is untouched: it is 2 s and it means something else");
  assert.notEqual(SHIP_STREAM.hz, NET.snapshotSec, "the two rates can never be confused");
  assert.ok(SHIP_STREAM.delayMs > 1000 / SHIP_STREAM.hz, "the screen must be far enough behind to straddle two snapshots");
  assert.ok(SHIP_STREAM.staleMs > SHIP_STREAM.delayMs, "a pilot is not dropped before its own delay has passed");
  assert.ok(SHIP_STREAM.samples >= 3, "more than the two a single interpolation needs");
});

/* ------------------------------------------------------------------------- */
/* The host's picture, from live records                                      */
/* ------------------------------------------------------------------------- */

/** A pilot record, as `sim/player.js` makes one (only the fields a snapshot reads). */
function record({ guestId = "", name = "", ship = "wasp", place = DEFAULT_PLACE, pos = [1, 2, 3], thr = 0.5, docked = false, dead = false, hull = [50, 100] } = {}) {
  const P = {
    kind: "ship",
    ship,
    place,
    pos: new THREE.Vector3(...pos),
    quat: new THREE.Quaternion(0, 0.6, 0, 0.8),
    v: new THREE.Vector3(10, -20, 30),
    thr,
    docked,
    dead,
    hull: hull[0],
    hullMax: hull[1],
  };
  if (guestId) P.guestId = guestId;
  if (name) P.name = name;
  return P;
}

test("slice 8a: a pilot record becomes exactly the fields the list names", () => {
  const entry = shipEntry(record({ guestId: "guest-1", name: "Acey" }), { id: "guest-1", name: "Acey" });
  assert.deepEqual(Object.keys(entry).sort(), [...SHIP_FIELDS].sort(), "nothing more leaves the host");

  assert.equal(entry.id, "guest-1");
  assert.equal(entry.name, "Acey");
  assert.equal(entry.ship, "wasp");
  assert.equal(entry.place, DEFAULT_PLACE);
  assert.deepEqual(entry.pos, [1, 2, 3], "position as a plain triple on the wire");
  assert.equal(entry.quat.length, 4);
  assert.ok(Math.abs(Math.hypot(...entry.quat) - 1) < 1e-3, "rotation arrives normalised");
  assert.deepEqual(entry.velocity, [10, -20, 30]);
  assert.equal(entry.throttle, 0.5);
  assert.equal(entry.docked, false);
  assert.equal(entry.dead, false);
  assert.equal(entry.hull, 0.5, "hull travels as a fraction, never as HP");
  // Plain data: no Vector3, no object graph, nothing a JSON round trip would change.
  assert.deepEqual(JSON.parse(JSON.stringify(entry)), entry);
});

test("slice 8a: the host's own ship travels too, under one id, and a nameless record is skipped", () => {
  const local = record({ pos: [0, 0, 200], ship: "bulwark" });
  const guest = record({ guestId: "guest-1", name: "Acey" });
  const ships = shipEntries([local, guest], { localIndex: 0, localName: "Ada" });

  assert.equal(ships.length, 2);
  assert.equal(ships[0].id, HOST_PILOT_ID, "the host's own hull has an id a guest can tell apart");
  assert.equal(ships[0].name, "Ada", "the display name is the host's, from the session — not in the profile");
  assert.equal(ships[0].ship, "bulwark");
  assert.equal(ships[1].id, "guest-1", "a visitor travels under its guest id");
  assert.equal(ships[1].name, "Acey");

  const nameless = shipEntries([local, record()], { localIndex: 0 });
  assert.deepEqual(nameless.map(s => s.id), [HOST_PILOT_ID], "a record with no id cannot be keyed, so it is left out");
  assert.deepEqual(shipEntries([]), [], "an empty world sends nothing");
});

test("slice 8a: a hull fraction, and the hull the far screen builds", () => {
  assert.equal(hullFraction({ hull: 25, hullMax: 100 }), 0.25);
  assert.equal(hullFraction({ hull: 0, hullMax: 100 }), 0, "a dead hull is 0, not 1");
  assert.equal(hullFraction({ hull: 0, hullMax: 0 }), 1, "an unfitted record reads as whole, never as wrecked");
  assert.equal(hullFor({ ship: "prospector" }), "prospector");
  assert.equal(hullFor({ ship: "not-a-hull" }), "wasp", "an unknown hull is drawn, not thrown");
});

/* ------------------------------------------------------------------------- */
/* The wire                                                                   */
/* ------------------------------------------------------------------------- */

test("slice 8a: `ships` is one of the kinds, and it is cleaned on the way out and in", () => {
  assert.ok(KINDS.includes("ships"), "the kind exists");
  assert.equal(cleanMessage("ships", {}).ships.length, 0, "a message with no list is an empty picture, not null");

  const messy = {
    ships: [{
      id: "guest-1", name: "A".repeat(400), ship: "wasp", place: DEFAULT_PLACE,
      pos: [1e12, "x", null], quat: [0, 0, 0, 0], velocity: { x: 1, y: 2, z: 3 },
      throttle: 12, docked: "yes", dead: 1, hull: -4, extra: "not on the list",
    }],
  };
  const clean = cleanMessage("ships", messy);
  const entry = clean.ships[0];
  assert.equal(entry.name.length, NET.nameMax, "a name is capped");
  assert.ok(Math.abs(entry.pos[0]) <= 1e6, "an impossible coordinate is clamped, not carried");
  assert.deepEqual(entry.pos.slice(1), [0, 0], "a value that is not a number is zero");
  assert.deepEqual(entry.quat, [0, 0, 0, 1], "a rotation with no length becomes the identity — a hull still faces somewhere");
  assert.deepEqual(entry.velocity, [1, 2, 3], "a vector-shaped value is read");
  assert.equal(entry.throttle, 1, "throttle is clamped to -1..1");
  assert.equal(entry.docked, false, "only a real `true` says docked");
  assert.equal(entry.dead, false, "and only a real `true` says dead");
  assert.equal(entry.hull, 0);
  assert.equal("extra" in entry, false, "a field that is not on the list is dropped");

  // The same cleaning happens on the way in, which is the only path a peer can take.
  const read = readMessage({ t: "ships", ships: [messy.ships[0]] });
  assert.deepEqual(read, clean, "a hostile or hand-made packet is rebuilt field by field");
  assert.equal(readMessage({ t: "ships", ships: "lots" }).ships.length, 0, "a list that is not a list is empty");
  assert.deepEqual(
    readMessage({ t: "ships", ships: [{ pos: [1, 2, 3] }, {}, null, "junk"] }).ships,
    [],
    "an entry with no pilot cannot be keyed on anything, so it is not a pilot",
  );
});

test("slice 8a: one message carries at most LIMITS.ships pilots — a batched world, never a truncation", () => {
  const many = Array.from({ length: LIMITS.ships + 10 }, (_, i) => ({ id: `guest-${i}`, ship: "wasp", place: DEFAULT_PLACE }));
  const clean = cleanMessage("ships", { ships: many });
  assert.equal(clean.ships.length, LIMITS.ships, "the cap is the wire's, and it is documented");
  assert.ok(LIMITS.ships > 1, "more than one pilot per packet, or a room is a chat room");

  // A hostile packet is bounded by the same cap: a megabyte of ids is 24 pilots, not a flood.
  const flood = cleanMessage("ships", { ships: Array.from({ length: 5000 }, (_, i) => ({ id: `x${i}` })) });
  assert.equal(flood.ships.length, LIMITS.ships);
  assert.ok(JSON.stringify(flood).length < 8192, "and the whole message stays small enough for a data channel");
});

/* ------------------------------------------------------------------------- */
/* The two sessions                                                           */
/* ------------------------------------------------------------------------- */

/** An in-memory wire: everything one side sends arrives on the other. */
function wirePair() {
  const made = [];
  const factory = ({ role, worldId, onState, onData, onPeer }) => {
    const channel = {
      role, worldId, peerId: null,
      join: async () => { onState?.({ state: "finding", reason: "" }); return channel; },
      send: (peerId, value) => { channel.outbound.push({ peerId, value }); channel.deliver?.(peerId, value); return true; },
      broadcast: value => { if (!channel.peerId) return 0; channel.send(channel.peerId, value); return 1; },
      peers: () => (channel.peerId ? [channel.peerId] : []),
      state: () => ({ state: channel.peerId ? "connected" : "finding", reason: "" }),
      room: () => worldId,
      leave: () => { channel.left = true; },
      outbound: [],
      reach: (message, peerId = "peer-1") => onData?.({ ...message, peerId }),
      connect(peerId = "peer-1") { channel.peerId = peerId; onPeer?.({ kind: "join", peerId }); },
    };
    made.push(channel);
    return channel;
  };
  return { factory, made };
}

const makeSave = () => ({ v: SAVE_VERSION, profile: newProfile(), world: newWorld(), away: null });

/** What the host's own game would answer with (`main.js`'s listener, in miniature). */
let hostPicture = [];
on("mp-ships-request", request => {
  request.ships = hostPicture;
  request.answered = true;
});

const arrivals = [];
on("mp-ships", payload => arrivals.push(payload));

async function twoSessions() {
  const wire = wirePair();
  session.setChannelFactory(wire.factory);
  const hostSave = makeSave();
  const hostKit = { read: () => hostSave, write: next => Object.assign(hostSave, next) };
  const host = session.createChannelForTest("host", "w-1", "Ada", "host-token", hostKit);
  await host.start();
  const hostChannel = wire.made.at(-1);
  const guest = session.createChannelForTest("guest", "w-1", "Bo", "guest-token", { read: () => makeSave(), write: () => {} });
  await guest.start();
  const guestChannel = wire.made.at(-1);
  hostChannel.deliver = (peerId, value) => guestChannel.reach(value, peerId);
  guestChannel.deliver = (peerId, value) => hostChannel.reach(value, peerId);
  hostChannel.connect("guest-peer");
  guestChannel.connect("host-peer");
  return { host, guest, hostChannel, guestChannel, hostSave };
}

test("slice 8a: the host sends the picture at its own rate, and a guest never sends one", async () => {
  const { host, guest, hostChannel } = await twoSessions();
  // The two browsers met, so the guest said hello on its own (slice 3's retry) and is here.
  assert.equal(host.snapshot().guests.length, 1, "the guest is in the world");

  hostPicture = [{ id: "host", name: "Ada", ship: "wasp", place: DEFAULT_PLACE, pos: [0, 0, 200], quat: [0, 0, 0, 1], velocity: [0, 0, 0], throttle: 0, docked: true, dead: false, hull: 1 }];
  hostChannel.outbound.length = 0;
  assert.equal(host.broadcastShips(), 1, "one pilot, one entry on the wire");

  const sent = hostChannel.outbound.filter(m => m.value.t === "ships");
  assert.equal(sent.length, 1, "one message carries the picture");
  assert.ok(sent[0].value.ships.length === 1);

  // A guest has no picture to send: the wire is one-way in this slice.
  guest.channel().outbound.length = 0;
  assert.equal(guest.broadcastShips(), 0, "a guest never sends ships");
  assert.equal(guest.channel().outbound.filter(m => m.value.t === "ships").length, 0);

  session.stop({ quiet: true });
});

test("slice 8a: a host with nobody visiting sends nothing at all", async () => {
  const wire = wirePair();
  session.setChannelFactory(wire.factory);
  const save = makeSave();
  const host = session.createChannelForTest("host", "w-9", "Ada", "host-token", { read: () => save, write: next => Object.assign(save, next) });
  await host.start();
  hostPicture = [{ id: "host", name: "Ada", ship: "wasp", place: DEFAULT_PLACE }];
  assert.equal(host.broadcastShips(), 0, "no guests, no packets: a room of one costs nothing");
  session.stop({ quiet: true });
});

test("slice 8a: the guest draws the host's picture, minus its own hull", async () => {
  const { host } = await twoSessions();

  hostPicture = [
    { id: "host", name: "Ada", ship: "wasp", place: DEFAULT_PLACE, pos: [0, 0, 200], quat: [0, 0, 0, 1], velocity: [0, 0, 0], throttle: 0.4, docked: false, dead: false, hull: 0.9 },
    { id: "guest-guest-to", name: "Bo", ship: "prospector", place: DEFAULT_PLACE, pos: [5, 0, 200], quat: [0, 0, 0, 1], velocity: [0, 0, 0], throttle: 0, docked: true, dead: false, hull: 1 },
  ];
  const before = arrivals.length;
  host.broadcastShips();

  assert.equal(arrivals.length, before + 1, "the message reached the guest's screen");
  const payload = arrivals.at(-1);
  assert.deepEqual(payload.ships.map(s => s.id), ["host"], "the guest's own record is dropped: it already draws its own hull");
  assert.equal(payload.ships[0].ship, "wasp");
  assert.equal(typeof payload.at, "number", "an arrival time travels with it, so the buffer can order it");
  session.stop({ quiet: true });
});

/* ------------------------------------------------------------------------- */
/* The guest's buffer: interpolation, never prediction                        */
/* ------------------------------------------------------------------------- */

/** One `ships` message with a pilot at `x`, clean as the protocol would leave it. */
const frame = (x, extra = {}) => [{
  id: "guest-1", name: "Acey", ship: "wasp", place: DEFAULT_PLACE,
  pos: [x, 0, 0], quat: [0, 0, 0, 1], velocity: [0, 0, 0], throttle: 0, docked: false, dead: false, hull: 1,
  ...extra,
}];

test("slice 8a: the screen draws 100 ms in the past, between the two snapshots that straddle it", () => {
  // 10 m in 40 ms is 250 m/s: an ordinary ship, not a teleport (SHIP_STREAM.snapM).
  const stream = createShipStream();
  const t0 = 10_000;
  stream.receive(frame(0), t0);
  stream.receive(frame(10), t0 + 40);
  stream.receive(frame(20), t0 + 80);

  // Nothing to draw before the delay has resolved: the newest snapshot is not shown early.
  assert.equal(stream.sample(t0 + 20)[0].pos.x, 0, "the oldest snapshot is where the screen starts");

  const at = stream.sample(t0 + 120)[0];       // target = t0 + 20: halfway from 0 to 10
  assert.ok(at.pos.x > 0 && at.pos.x < 10, "between two snapshots");
  assert.equal(Math.round(at.pos.x), 5, "and halfway between them at the halfway point");

  const later = stream.sample(t0 + 140)[0];    // target = t0 + 40: the second snapshot itself
  assert.equal(Math.round(later.pos.x), 10);

  // Past the newest snapshot the pose is HELD, never extrapolated: a guest must not fly a hull
  // through a station and then snap it back.
  assert.equal(stream.sample(t0 + 500)[0].pos.x, 20);
});

test("slice 8a: a rotation is slerped, a pocket change and a teleport are drawn as steps", () => {
  const stream = createShipStream();
  const t0 = 1000;
  const half = [0, Math.SQRT1_2, 0, Math.SQRT1_2];
  stream.receive(frame(0, { quat: [0, 0, 0, 1] }), t0);
  stream.receive(frame(10, { quat: half }), t0 + 40);
  const mid = stream.sample(t0 + 120)[0];      // halfway between the two
  assert.ok(Math.abs(mid.quat.y - 0.38) < 0.05, "the hull turns with it, not beside it");
  assert.ok(Math.abs(mid.quat.length() - 1) < 1e-6, "and it stays a rotation");

  // A jump of more than SHIP_STREAM.snapM is a launch or a warp: drawn where it is now.
  const big = createShipStream();
  big.receive(frame(0), t0);
  big.receive(frame(500), t0 + 40);
  assert.equal(big.sample(t0 + 120)[0].pos.x, 500, "a teleport is not smeared across the sky");

  // A change of pocket is a step, never an interpolation across two worlds.
  const moved = createShipStream();
  moved.receive(frame(0, { place: "a" }), t0);
  moved.receive(frame(10, { place: "b" }), t0 + 40);
  assert.equal(moved.sample(t0 + 120)[0].place, "b");
});

test("slice 8a: a pilot that stops being mentioned is dropped, and a session's end forgets everybody", () => {
  const stream = createShipStream({ staleMs: 300 });
  const t0 = 5000;
  stream.receive(frame(0), t0);
  assert.equal(stream.count(), 1);
  assert.equal(stream.sample(t0 + 50).length, 1, "still fresh");

  assert.deepEqual(stream.sample(t0 + 2000), [], "silence empties the sky: nothing is drawn where nobody said");
  assert.equal(stream.count(), 0, "and the buffer forgets it, so a long silence cannot grow it");

  stream.receive(frame(0), t0);
  stream.receive(frame(1), t0 + 10);
  assert.equal(stream.count(), 1);
  stream.forget("guest-1");
  assert.equal(stream.count(), 0, "a `left` forgets a pilot at once");
  stream.receive(frame(0), t0);
  stream.clear();
  assert.equal(stream.count(), 0, "and a stopped session leaves nothing behind");
});

test("slice 8a: the buffer is bounded, and two messages in one millisecond do not sit beside each other", () => {
  const stream = createShipStream({ samples: 4 });
  const t0 = 1000;
  for (let i = 0; i < 40; i += 1) stream.receive(frame(i), t0 + i * 10);
  // 40 snapshots went in; four are kept, so an hour of silence cannot grow a buffer.
  const held = stream.sample(t0 + 400 + 100)[0];
  assert.ok(held, "the newest pose is still there");
  assert.equal(held.pos.x, 39, "and it is the newest");

  const same = createShipStream();
  same.receive(frame(0), t0);
  same.receive(frame(7), t0);                  // a second message in the same millisecond
  assert.equal(same.count(), 1, "one pilot, one entry");
  assert.equal(same.sample(t0 + 200)[0].pos.x, 7, "the later message is the one at that instant");
});

/* ------------------------------------------------------------------------- */
/* The glass: another pilot's hull, drawn as a view                           */
/* ------------------------------------------------------------------------- */

const views = await loadHeadless(
  "src/render/views.js",
  {
    state: "src/state/state.js",
    emit: "src/util/events.js",
    V: "src/util/math.js",
    Q: "src/util/math.js",
    createPlayer: "src/sim/player.js",
    setShip: "src/sim/player.js",
    localPlayer: "src/state/state.js",
    newProfile: "src/state/profile.js",
  },
  { keep: ["views.js"] }
);

/** A clean world with the local pilot only, not docked, looking at the default pocket. */
function bareWorld() {
  views.state.players.length = 0;
  views.state.localPlayerIndex = 0;
  views.state.place = DEFAULT_PLACE;
  views.createPlayer();
  views.setShip("wasp");
  views.localPlayer().docked = false;
  views.updateEntityViews();
  return views.state;
}

/** A visitor that has launched and is flying — the only kind the host's sky draws. */
function visitor(extra = {}) {
  const P = {
    kind: "ship",
    guestId: "guest-1",
    name: "Acey",
    ship: "wasp",
    place: DEFAULT_PLACE,
    pos: views.V(0, 0, 210),
    quat: views.Q(),
    v: views.V(0, 0, 0),
    thr: 0,
    docked: false,
    dead: false,
    hull: 1,
    hullMax: 1,
    ...extra,
  };
  views.state.players.push(P);
  return P;
}

test("slice 8a: the host draws its visiting pilot's hull with no wire at all", () => {
  const S = bareWorld();
  assert.equal(views.otherPilotViewCount(), 0, "alone, nothing else is drawn");

  const mark = views.__calls.length;
  const P = visitor();
  views.updateEntityViews(1);
  assert.equal(views.otherPilotViewCount(), 1, "one visitor, one hull on the host's screen");
  const built = views.__calls.slice(mark).filter(c => c.name === "buildPlayerShip");
  assert.equal(built.length, 1, "built from the visitor's own hull");
  assert.equal(built[0].args[0], "wasp");

  const pose = views.__calls.slice(mark).find(c => c.name.endsWith("position.copy"));
  assert.ok(pose, "the hull was placed");
  assert.deepEqual([pose.args[0].x, pose.args[0].y, pose.args[0].z], [0, 0, 210], "where the record says it is");
  assert.equal(S.players.length, 2, "drawing never adds or moves a record");

  // The record moving (an ordinary sim tick) moves the hull.
  P.pos.set(30, 0, 210);
  const mark2 = views.__calls.length;
  views.updateEntityViews(1);
  const moved = views.__calls.slice(mark2).find(c => c.name.endsWith("position.copy"));
  assert.deepEqual([moved.args[0].x, moved.args[0].y, moved.args[0].z], [30, 0, 210]);
  assert.equal(views.otherPilotViewCount(), 1, "still one hull, never a second one");
});

test("slice 8a: another pilot's hull is drawn only in the pocket this screen shows", () => {
  bareWorld();
  const P = visitor();
  views.updateEntityViews(1);
  assert.equal(views.otherPilotViewCount(), 1);

  // The visitor crosses to another pocket: its hull leaves this sky.
  P.place = "sys-999-elsewhere";
  const mark = views.__calls.length;
  views.updateEntityViews(1);
  assert.equal(views.otherPilotViewCount(), 0, "a hull from another pocket would be a ghost");
  assert.deepEqual(views.__calls.slice(mark).map(c => c.name).filter(n => n === "scene.remove"), ["scene.remove"]);

  // Back again: drawn again.
  P.place = DEFAULT_PLACE;
  views.updateEntityViews(1);
  assert.equal(views.otherPilotViewCount(), 1);
});

test("slice 8a: a docked visitor is inside its station and is not drawn (owner, 2026-11-26)", () => {
  bareWorld();
  const P = visitor({ docked: true });
  views.updateEntityViews(1);
  assert.equal(views.otherPilotViewCount(), 0, "a docked hull is inside the station — nothing in the sky");

  P.docked = false;
  views.updateEntityViews(1);
  assert.equal(views.otherPilotViewCount(), 1, "and it leaves the station into the sky");
});

test("slice 8a: a dead pilot draws nothing, a new hull rebuilds the mesh, and a departure removes it", () => {
  bareWorld();
  const P = visitor();
  views.updateEntityViews(1);
  assert.equal(views.otherPilotViewCount(), 1);

  P.dead = true;
  views.updateEntityViews(1);
  assert.equal(views.otherPilotViewCount(), 0, "a dead hull is gone from the sky");

  P.dead = false;
  views.updateEntityViews(1);
  assert.equal(views.otherPilotViewCount(), 1, "and comes back when the pilot recovers");

  // A different hull: the mesh is rebuilt rather than wearing the old shape.
  const mark = views.__calls.length;
  P.ship = "prospector";
  P.profile = { ship: "prospector" };
  views.updateEntityViews(1);
  const built = views.__calls.slice(mark).filter(c => c.name === "buildPlayerShip");
  assert.equal(built.length, 1, "one new mesh");
  assert.equal(built[0].args[0], "prospector");
  assert.equal(views.otherPilotViewCount(), 1, "still one hull");

  // The visitor goes home: its record leaves `state.players`, and the hull leaves the scene.
  views.state.players.length = 1;
  views.updateEntityViews(1);
  assert.equal(views.otherPilotViewCount(), 0);
});

test("slice 8a: a guest draws the poses its ship stream interpolated, and no record at all", () => {
  const S = bareWorld();
  const pose = {
    id: "host",
    name: "Ada",
    ship: "bulwark",
    place: DEFAULT_PLACE,
    pos: new THREE.Vector3(-40, 0, 300),
    quat: new THREE.Quaternion(),
    throttle: 1,
    docked: false,
    dead: false,
    hull: 1,
  };
  const mark = views.__calls.length;
  views.updateEntityViews(1, [pose]);
  assert.equal(views.otherPilotViewCount(), 1, "the host's hull is on the guest's screen");
  const built = views.__calls.slice(mark).filter(c => c.name === "buildPlayerShip");
  assert.equal(built[0].args[0], "bulwark", "built from the hull the host named");
  assert.deepEqual([pose.pos.x, pose.pos.y, pose.pos.z], [-40, 0, 300], "drawing never moves the pose it was given");
  assert.equal(S.players.length, 1, "a guest has one record: its own. A friend is a pose, not a player");

  // A pose in another pocket is not this sky.
  views.updateEntityViews(1, [{ ...pose, place: "somewhere-else" }]);
  assert.equal(views.otherPilotViewCount(), 0);
});

test("slice 8a: the snapshot path is views only — nothing in it can write to the game", () => {
  // The rule the slice is built on: a remote ship is drawn, never simulated. Enforced by what the
  // two new modules are allowed to import, because a comment does not stop a later chat.
  const ships = source("src/net/ships.js");
  assert.doesNotMatch(ships, /from "\.\.\/state\//, "net/ships.js reads records it is handed; it does not reach state");
  // One `sim/` import is allowed, and it is arithmetic rather than the world: since playtest 23 the
  // two health fractions live in `sim/pilot-stats.js` so the host's own screen and the wire cannot
  // disagree about a friend's bars. `net/` importing `sim/` is the allowed direction (`net/world-places.js`
  // already does, for the galaxy); the reverse is still forbidden below.
  assert.doesNotMatch(ships.replace(/from "\.\.\/sim\/pilot-stats\.js"/, ""), /from "\.\.\/sim\//, "and it simulates nothing");
  assert.doesNotMatch(source("src/sim/pilot-stats.js"), /^import /m, "the helper it borrows is arithmetic and imports nothing");
  assert.doesNotMatch(ships, /P[.\[]\w*\]?\s*=\s*[^=]/, "it never assigns to the record it was handed");
  assert.doesNotMatch(ships, /\.set\(|\.copy\(/, "and never moves a vector it did not make");

  const stream = source("src/render/shipstream.js");
  assert.doesNotMatch(stream, /from "\.\.\/state\//, "render/shipstream.js holds poses, not game state");
  assert.doesNotMatch(stream, /from "\.\.\/net\//, "and it does not talk to the wire itself: main.js joins the two");

  // `sim/` still never imports `net/` (the arrow points one way, and slice 8a did not turn it).
  assert.doesNotMatch(source("src/sim/multiplayer.js"), /from "\.\.\/net\//, "sim/ may not import net/");
  // And the views file draws a record, never writes one.
  const viewsSrc = source("src/render/views.js");
  assert.match(viewsSrc, /export function updateOtherPilotViews/, "the hulls are drawn by one exported function");
  assert.doesNotMatch(viewsSrc, /state\.players\.push/, "drawing never adds a pilot");
});
