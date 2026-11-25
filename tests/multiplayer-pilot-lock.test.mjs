// Playtest 23, the second half: **a visiting pilot is a ship like any other.**
//
// The owner's words (2026-11-25): a friend's hull "must be selectable (F / list), must show the
// player's name, and must show hull/shield stats like any other ship". Slice 8a drew the hull and
// stopped there: `sim/targeting.js` only ever offered hostiles, rocks, crates, rifts, gates,
// canisters and the station, the N list turned a pilot row into a name-only lock (`"n"`), and the
// HUD drew health bars for `k === "e"` alone. A visitor was a shape with no name and no bars.
//
// The fix is one new lock kind — `"p"` — and one new fact the screen publishes: `state.otherPilots`
// (`render/views.js`), the mirror of every pilot it draws. That mirror is what makes the fix work
// on **both** screens:
//
//   the host   a visiting record exists in `state.players`, and the mirror is built from it;
//   a guest    there is no record at all (slice 8a forbids it) — the friend exists only as a pose
//              the ship stream interpolated, so the mirror is the only place to pick it from.
//
// What no test can prove: that F on a real friend's hull feels right on a real screen. That is the
// owner's playtest (`testing/TESTING-16-SLICE8A.md`).
//
// Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { loadHeadless } from "./headless.mjs";
import { state } from "../src/state/state.js";
import { newProfile } from "../src/state/profile.js";
import { createPlayer } from "../src/sim/player.js";
import { configurePlayer } from "../src/sim/session.js";
import { toggleLock, pruneLock, lockName, lockPosition, targetHealth, selectPocketObject, isPocketRowLocked } from "../src/sim/targeting.js";
import { pocketObjects } from "../src/sim/flight-instruments.js";
import { hullFraction, shieldFraction } from "../src/sim/pilot-stats.js";
import { shipEntry } from "../src/net/ships.js";
import { cleanMessage } from "../src/net/protocol.js";
import { createShipStream } from "../src/render/shipstream.js";
import { SHIP_FIELDS } from "../src/data/multiplayer.js";
import { V } from "../src/util/math.js";

const source = rel => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

/* ------------------------------------------------------------------------- */
/* A world with one other pilot in it                                        */
/* ------------------------------------------------------------------------- */

/** The local pilot at the origin looking down -z, in an empty pocket, and no other pilot. */
function setup() {
  state.players.length = 0;
  state.localPlayerIndex = 0;
  state.profile = newProfile();
  state.place = "hollow";
  state.warp = null;
  state.freeCam.on = false;
  state.otherPilots = [];
  for (const list of Object.values(state.world)) list.length = 0;
  const P = createPlayer();
  configurePlayer(P, state.profile);
  P.docked = false;
  P.pos.set(0, 0, 0);
  P.quat.identity();
  return P;
}

/**
 * A pilot the screen is drawing, as `render/views.js` publishes it: the lock reference `{ k, o }`
 * points at, with the name the host lists it under and the two fractions its bars are drawn from.
 */
function drawnPilot({ id = "guest-1", name = "Acey", place = "hollow", pos = [0, 0, -200], hull = 0.5, shield = 0.25, dead = false, docked = false } = {}) {
  const ref = {
    k: "p",
    id,
    name,
    ship: "wasp",
    place,
    pos: V(...pos),
    quat: new THREE.Quaternion(),
    hull,
    shield,
    dead,
    docked,
  };
  ref.lock = { k: "p", o: ref };
  state.otherPilots.push(ref);
  return ref;
}

/* ------------------------------------------------------------------------- */
/* The two numbers the bars are drawn from                                   */
/* ------------------------------------------------------------------------- */

test("playtest 23: a pilot's health is two fractions, and an unfitted record is not a wreck", () => {
  assert.equal(hullFraction({ hull: 25, hullMax: 100 }), 0.25);
  assert.equal(hullFraction({ hull: 0, hullMax: 100 }), 0, "a dead hull is 0");
  assert.equal(hullFraction({ hull: 0, hullMax: 0 }), 1, "a record whose fit has not applied yet is whole, not wrecked");
  assert.equal(shieldFraction({ sh: 40, shMax: 80 }), 0.5);
  assert.equal(shieldFraction({ sh: 40, shMax: 0 }), 0, "no shield module means no pool, never a full one");
  assert.equal(shieldFraction({}), 0);
  assert.equal(hullFraction({ hull: 500, hullMax: 100 }), 1, "clamped, so a bar cannot overfill");
});

test("playtest 23: a pilot's lock shows hull and shield, exactly like a hostile's", () => {
  assert.deepEqual(targetHealth({ hull: 0.5, shield: 0.25 }), { shield: 25, hull: 50 });
  assert.deepEqual(targetHealth({ hull: 1, shield: 0 }), { shield: 0, hull: 100 }, "an unshielded friend shows an empty shield bar");
  assert.deepEqual(targetHealth({ hull: 2, shield: -1 }), { shield: 0, hull: 100 }, "clamped both ways");
  // The hostile shape is untouched by the new one.
  assert.deepEqual(targetHealth({ hp: 5, mx: 10 }), { shield: 0, hull: 50 });
  assert.deepEqual(targetHealth({ sh: 3, maxSh: 12, hp: 20, mx: 10 }), { shield: 25, hull: 100 });
});

/* ------------------------------------------------------------------------- */
/* F finds a friend                                                          */
/* ------------------------------------------------------------------------- */

test("playtest 23: F selects a visiting pilot under the reticle, names it, and finds it again", () => {
  const P = setup();
  const ref = drawnPilot();

  toggleLock(P);
  assert.deepEqual(P.flight.lock, { k: "p", o: ref }, "the friend down the nose is the target");
  assert.equal(lockName(P.flight.lock), "Acey", "the marker carries the pilot's name, never an id");
  assert.deepEqual([lockPosition(P.flight.lock).x, lockPosition(P.flight.lock).z], [0, -200], "and it sits where the hull was drawn");

  // The same target again releases it, exactly as a hostile does.
  toggleLock(P);
  assert.equal(P.flight.lock, null, "a second F releases the same pilot");
});

test("playtest 23: a friend slightly off the reticle is found by angular assistance, as hostiles are", () => {
  const P = setup();
  const ref = drawnPilot({ pos: [60, 0, -200] });          // ~17° off the nose, outside an 8 m sphere
  toggleLock(P, null);                                     // the browser's "no surface under the dot"
  assert.equal(P.flight.lock?.k, "p", "the cone catches what the dot missed");
  assert.equal(P.flight.lock.o, ref);
});

test("playtest 23: a friend in another pocket, a dead friend, and a friend who left are not targets", () => {
  const P = setup();
  drawnPilot({ id: "elsewhere", place: "reach" });
  toggleLock(P);
  assert.equal(P.flight.lock, null, "a hull in another pocket is not in this sky");

  state.otherPilots = [];
  const dead = drawnPilot({ id: "dead", dead: true });
  toggleLock(P);
  assert.equal(P.flight.lock, null, "a dead pilot draws nothing, so there is nothing to lock");

  const gone = drawnPilot({ id: "gone" });
  toggleLock(P);
  assert.equal(P.flight.lock?.o, gone);
  state.otherPilots = [];                                  // the hull left the sky
  pruneLock(P);
  assert.equal(P.flight.lock, null, "the lock goes with the hull");
});

test("playtest 23: the lock survives the pilot moving, because the reference is updated in place", () => {
  const P = setup();
  const ref = drawnPilot();
  toggleLock(P);
  ref.pos.set(120, 0, -400);                               // the next frame's drawn pose
  assert.deepEqual([lockPosition(P.flight.lock).x, lockPosition(P.flight.lock).z], [120, -400], "the marker follows the hull");
  pruneLock(P);
  assert.equal(P.flight.lock?.o, ref, "and the lock is not dropped just because it moved");
});

/* ------------------------------------------------------------------------- */
/* The N list                                                                */
/* ------------------------------------------------------------------------- */

test("playtest 23: the N list carries a friend as a Ship row with the pilot's own name", () => {
  const P = setup();
  const ref = drawnPilot({ name: "Acey" });
  const rows = pocketObjects(P);
  const ship = rows.find(row => row.object === ref);
  assert.ok(ship, "the friend is a row, so it can be selected from the list");
  assert.equal(ship.kind, "Ship", "under the kind the filters and the icon already know");
  assert.equal(ship.name, "Acey", "named for the pilot, not for the object");

  assert.equal(selectPocketObject(ref, P), true);
  assert.equal(P.flight.lock?.k, "p", "clicking the row locks it as a pilot");
  assert.equal(P.flight.lock.o, ref);
  assert.equal(isPocketRowLocked(ship, P.flight.lock), true, "and the row shows itself as selected");
  assert.equal(lockName(P.flight.lock), "Acey");
  assert.deepEqual(targetHealth(P.flight.lock.o), { shield: 25, hull: 50 }, "with bars, like any other ship");

  // The same row again unlocks, as every other row does.
  selectPocketObject(ref, P);
  assert.equal(P.flight.lock, null, "a second click releases it");
});

test("playtest 23: a docked friend is not a list row and a flying one is", () => {
  const P = setup();
  const parked = drawnPilot({ id: "parked", docked: true });
  const flying = drawnPilot({ id: "flying", pos: [0, 0, -200] });
  const rows = pocketObjects(P).filter(row => row.object === parked || row.object === flying);
  assert.deepEqual(rows.map(row => row.object), [flying], "a pilot parked inside a station is not out in the pocket");
});

/* ------------------------------------------------------------------------- */
/* The screen's mirror, and the wire                                         */
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

function bareWorld() {
  views.state.players.length = 0;
  views.state.localPlayerIndex = 0;
  views.state.place = "hollow";
  views.state.otherPilots = [];
  views.createPlayer();
  views.setShip("wasp");
  views.localPlayer().docked = false;
  views.localPlayer().pos.set(0, 0, 0);
  views.updateEntityViews();
  return views.state;
}

/** A visiting record, as `sim/multiplayer.js` leaves it. */
function visitor(extra = {}) {
  const P = {
    kind: "ship",
    guestId: "guest-1",
    name: "Acey",
    ship: "wasp",
    place: "hollow",
    pos: views.V(0, 0, -200),
    quat: views.Q(),
    v: views.V(0, 0, 0),
    thr: 0,
    docked: false,
    dead: false,
    hull: 50,
    hullMax: 100,
    sh: 20,
    shMax: 40,
    ...extra,
  };
  views.state.players.push(P);
  return P;
}

test("playtest 23: the host's screen publishes its visiting pilot as a targetable, named ship", () => {
  const S = bareWorld();
  assert.deepEqual(S.otherPilots, [], "alone, nothing to lock");

  visitor();
  views.updateEntityViews(1);
  assert.equal(S.otherPilots.length, 1, "one friend, one entry in the mirror");
  const ref = S.otherPilots[0];
  assert.equal(ref.k, "p", "it is a pilot lock reference");
  assert.equal(ref.name, "Acey", "with the name the world lists it under");
  assert.equal(ref.hull, 0.5, "half hull");
  assert.equal(ref.shield, 0.5, "and half shields — the same numbers the wire carries");
  assert.deepEqual([ref.pos.x, ref.pos.z], [0, -200], "where the hull was drawn");
  assert.equal(ref.dead, false);
});

test("playtest 23: a guest's mirror is built from the host's snapshots — no record, still lockable", () => {
  const S = bareWorld();
  const stream = createShipStream();
  const at = 1000;
  stream.receive([{
    id: "host",
    name: "Ada",
    ship: "bulwark",
    place: "hollow",
    pos: [40, 0, -300],
    quat: [0, 0, 0, 1],
    velocity: [0, 0, 0],
    throttle: 1,
    docked: false,
    dead: false,
    hull: 0.8,
    shield: 0.4,
  }], at);
  const poses = stream.sample(at + 200);
  views.updateEntityViews(1, poses);

  assert.equal(S.players.length, 1, "a guest still has one record: its own");
  assert.equal(S.otherPilots.length, 1, "but the host's hull is in the mirror");
  const ref = S.otherPilots[0];
  assert.equal(ref.name, "Ada", "named by the host");
  assert.equal(ref.hull, 0.8);
  assert.equal(ref.shield, 0.4);

  // And the sky emptying empties the mirror, so a lock cannot point at a hull nobody draws.
  views.updateEntityViews(1, []);
  assert.deepEqual(S.otherPilots, [], "no hull, no target");
});

test("playtest 23: shield travels on the wire, capped and cleaned like the hull", () => {
  assert.ok(SHIP_FIELDS.includes("shield"), "the field is on the list, so it is part of the contract");
  const entry = shipEntry({ ship: "wasp", place: "hollow", pos: { x: 1, y: 2, z: 3 }, hull: 50, hullMax: 100, sh: 10, shMax: 40 }, { id: "guest-1" });
  assert.equal(entry.hull, 0.5);
  assert.equal(entry.shield, 0.25, "shield travels as a fraction, never as HP");

  const clean = cleanMessage("ships", { ships: [{ id: "guest-1", hull: 9, shield: 9 }, { id: "guest-2", shield: -4 }] });
  assert.equal(clean.ships[0].shield, 1, "clamped at the top");
  assert.equal(clean.ships[1].shield, 0, "and at the bottom");
  assert.equal(cleanMessage("ships", { ships: [{ id: "guest-3" }] }).ships[0].shield, 0, "a message with no shield is an unshielded ship");
});

test("playtest 23: the HUD gives a pilot's lock the same two bars as a hostile's, and its name", () => {
  const hud = source("src/ui/hud.js");
  // The gate that used to hide the bars for everything but a hostile.
  assert.match(hud, /const bars = lock\.k === "e" \|\| lock\.k === "p"/, "a pilot lock carries health like a hostile's");
  assert.doesNotMatch(hud, /hostile \? targetHealth/, "and the old single-kind gate is gone");
  assert.match(hud, /bars \? targetHealth\(lock\.o\) : null/, "the marker is handed those numbers");
  // The pilot's own label in the sky, before it is locked.
  assert.match(hud, /state\.otherPilots \|\| \[\]/, "the HUD labels every other pilot it draws");
  assert.match(hud, /pilot\.name \|\| "Pilot"/, "by name");
  const display = source("src/ui/target-display.js");
  assert.match(display, /\bp: 'i'/, "a pilot's marker wears the friendly tone");
});
