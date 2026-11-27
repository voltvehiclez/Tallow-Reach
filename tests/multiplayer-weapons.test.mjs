// Slice 16, weapon effects on the guest (build `2026-11-26c`).
// The guest's own weapons must look and sound the same as they do single-player:
// the own-ship entry carries the mining beam's state verbatim and monotonic event
// counters the own screen turns back into sounds.
import { test } from "node:test";
import assert from "node:assert/strict";
import { shipEntry } from "../src/net/ships.js";
import { cleanMessage } from "../src/net/protocol.js";
import { createShipStream } from "../src/render/shipstream.js";
import { SHIP_FIELDS } from "../src/data/multiplayer.js";
import { DEFAULT_PLACE } from "../src/data/places.js";

const vec = (x, y, z) => ({ x, y, z });
const stub = (extra = {}) => ({
  kind: "ship",
  name: "Acey",
  ship: "wasp",
  place: DEFAULT_PLACE,
  pos: vec(1, 2, 3),
  quat: { x: 0, y: 0, z: 0, w: 1 },
  v: vec(10, -20, 30),
  thr: 0.5,
  docked: false,
  dead: false,
  hull: 60,
  hullMax: 100,
  shMax: 40,
  sh: 20,
  wxShots: 41,
  wxMissiles: 3,
  wxLocks: 2,
  wxOre: 7,
  wxHits: 1,
  wxBoosts: 9,
  boost: true,
  shake: 0.6,
  flight: { beamOn: true, beamStart: vec(0, 0, 200), beamEnd: vec(0, 0, 167.5), mineFrac: 0.75, coneAngle: 6.5, missileLock: { target: { id: 99 }, t: 1.5, locked: true } },
  ...extra,
});

test("weapons: the own-ship entry carries the weapon-effects block, and nothing else new", () => {
  const entry = shipEntry(stub(), { id: "guest-1", name: "Acey" });
  assert.deepEqual(Object.keys(entry).sort(), [...SHIP_FIELDS].sort(), "the wire stays the contract — boost, shake, beam and the counters, nothing more");
  assert.equal(entry.beamOn, true);
  assert.deepEqual(entry.beamStart, [0, 0, 200]);
  assert.deepEqual(entry.beamEnd, [0, 0, 167.5]);
  assert.equal(entry.mineFrac, 0.75);
  assert.equal(entry.shots, 41);
  assert.equal(entry.missiles, 3);
  assert.equal(entry.locks, 2);
  assert.equal(entry.ore, 7);
  assert.equal(entry.hits, 1);
  assert.equal(entry.boosts, 9);
  assert.equal(entry.boost, true);
  assert.equal(entry.shake, 0.6);
  assert.equal(entry.cone, 6.5, "the launcher cone travels");
  assert.equal(entry.lockT, 1.5);
  assert.equal(entry.lockLocked, true);
  assert.equal(entry.lockTarget, true, "only the fact of a held lock travels — never the host's record");
});

test("weapons: a record with no beam state and no counters cleans to zeroes, never NaN", () => {
  const entry = shipEntry(stub({ flight: undefined, wxShots: undefined, wxMissiles: undefined, wxLocks: undefined, wxOre: undefined, wxHits: undefined, wxBoosts: undefined }), { id: "guest-1", name: "A" });
  assert.equal(entry.beamOn, false);
  assert.deepEqual(entry.beamStart, [0, 0, 0]);
  assert.deepEqual(entry.beamEnd, [0, 0, 0]);
  assert.equal(entry.mineFrac, 0);
  for (const k of ["shots", "missiles", "locks", "ore", "hits", "boosts"]) assert.equal(entry[k], 0, k);
});

test("weapons: counters wrap at u16, and the beam survives the protocol cleaning", () => {
  const message = cleanMessage("ships", { ships: [{ ...shipEntry(stub(), { id: "guest-1", name: "Acey" }), shots: 65537, missiles: 70000 }] });
  assert.equal(message.ships[0].shots, 1, "u16 wraps on the wire");
  assert.equal(message.ships[0].missiles, 4464);
  assert.equal(message.ships[0].beamOn, true);
  assert.deepEqual(message.ships[0].beamStart, [0, 0, 200]);
  assert.deepEqual(message.ships[0].beamEnd, [0, 0, 167.5]);
  assert.equal(message.ships[0].mineFrac, 0.75);
  assert.equal(message.shots, undefined, "and the cleaner drops anything that is not a `ships` field");
});

test("weapons: the ship stream keeps the whole block, so the own screen can apply it", () => {
  const stream = createShipStream({ delayMs: 35, samples: 8 });
  const t0 = 1000;
  stream.receive([shipEntry(stub(), { id: "guest-1", name: "Acey" })], t0);
  const pose = stream.sample(t0 - 35)[0];
  assert.equal(pose.beamOn, true);
  assert.equal(pose.mineFrac, 0.75);
  assert.equal(pose.shots, 41);
  assert.equal(pose.boosts, 9);
  assert.equal(pose.beamStart.x, 0);
  assert.equal(pose.beamStart.z, 200);
  assert.equal(pose.beamEnd.z, 167.5);
  assert.equal(pose.cone, 6.5);
  assert.equal(pose.lockT, 1.5);
  assert.equal(pose.lockLocked, true);
  assert.equal(pose.lockTarget, true);
});
