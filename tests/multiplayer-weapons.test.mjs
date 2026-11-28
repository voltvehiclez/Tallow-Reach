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
  flight: { beamOn: true, beamStart: vec(0, 0, 200), beamEnd: vec(0, 0, 167.5), mineFrac: 0.75, beamT: 1.5, coneAngle: 6.5, missileLock: { target: { id: 99 }, t: 1.5, locked: true } },
  power: { stored: 30, cap: 60, draw: 4.5 },
  en: 6,
  enMax: 10,
  hudPrompt: "Hold to mine (12 left)",
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
  assert.equal(entry.beamT, 1.5);
  assert.equal(entry.pwr, 0.5);
  assert.equal(entry.pwrDraw, 4.5);
  assert.equal(entry.enFrac, 0.6);
  assert.equal(entry.hint, "Hold to mine (12 left)");
});

test("weapons: a record with no beam state and no counters cleans to zeroes, never NaN", () => {
  const entry = shipEntry(stub({ flight: undefined, power: undefined, en: undefined, enMax: undefined, hudPrompt: undefined, wxShots: undefined, wxMissiles: undefined, wxLocks: undefined, wxOre: undefined, wxHits: undefined, wxBoosts: undefined }), { id: "guest-1", name: "A" });
  assert.equal(entry.beamOn, false);
  assert.deepEqual(entry.beamStart, [0, 0, 0]);
  assert.deepEqual(entry.beamEnd, [0, 0, 0]);
  assert.equal(entry.mineFrac, 0);
  assert.equal(entry.beamT, 0);
  assert.equal(entry.pwr, 1);
  assert.equal(entry.pwrDraw, 0);
  assert.equal(entry.enFrac, 1);
  assert.equal(entry.hint, "");
  for (const k of ["shots", "missiles", "locks", "ore", "hits", "boosts"]) assert.equal(entry[k], 0, k);
});

test("weapons: counters wrap at u16, and the beam + HUD vitals survive protocol cleaning", () => {
  const message = cleanMessage("ships", { ships: [{ ...shipEntry(stub(), { id: "guest-1", name: "Acey" }), shots: 65537, missiles: 70000 }] });
  assert.equal(message.ships[0].shots, 1, "u16 wraps on the wire");
  assert.equal(message.ships[0].missiles, 4464);
  assert.equal(message.ships[0].beamOn, true);
  assert.deepEqual(message.ships[0].beamStart, [0, 0, 200]);
  assert.deepEqual(message.ships[0].beamEnd, [0, 0, 167.5]);
  assert.equal(message.ships[0].mineFrac, 0.75);
  assert.equal(message.ships[0].beamT, 1.5);
  assert.equal(message.ships[0].pwr, 0.5);
  assert.equal(message.ships[0].pwrDraw, 4.5);
  assert.equal(message.ships[0].enFrac, 0.6);
  assert.equal(message.ships[0].hint, "Hold to mine (12 left)");
  assert.equal(message.shots, undefined, "and the cleaner drops anything that is not a `ships` field");
});

test("weapons: the ship stream interpolates beamT/pwr/pwrDraw/enFrac and keeps hint", () => {
  const stream = createShipStream({ delayMs: 35, samples: 8 });
  const t0 = 1000;
  stream.receive([shipEntry(stub({ flight: { beamOn: true, beamStart: vec(0, 0, 200), beamEnd: vec(0, 0, 167.5), mineFrac: 0.75, beamT: 1.0, coneAngle: 6.5, missileLock: { target: { id: 99 }, t: 1.5, locked: true } }, power: { stored: 20, cap: 100, draw: 4 }, en: 4, enMax: 10, hudPrompt: "Hold to mine (12 left)" }), { id: "guest-1", name: "Acey" })], t0);
  stream.receive([shipEntry(stub({ flight: { beamOn: true, beamStart: vec(0, 0, 200), beamEnd: vec(0, 0, 167.5), mineFrac: 0.5, beamT: 2.0, coneAngle: 6.5, missileLock: { target: { id: 99 }, t: 1.5, locked: true } }, power: { stored: 60, cap: 100, draw: 8 }, en: 8, enMax: 10, hudPrompt: "Hold to mine (11 left)" }), { id: "guest-1", name: "Acey" })], t0 + 100);
  const pose = stream.sample(t0 + 50 + 35)[0];
  assert.equal(pose.beamOn, true);
  assert.equal(pose.mineFrac, 0.5);
  assert.ok(Math.abs(pose.beamT - 1.5) < 1e-6, "beamT interpolates monotonically while cutting");
  assert.ok(Math.abs(pose.pwr - 0.4) < 1e-6);
  assert.ok(Math.abs(pose.pwrDraw - 6) < 1e-6);
  assert.ok(Math.abs(pose.enFrac - 0.6) < 1e-6);
  assert.equal(pose.hint, "Hold to mine (11 left)");
  assert.equal(pose.shots, 41);
  assert.equal(pose.boosts, 9);
  assert.equal(pose.beamStart.x, 0);
  assert.equal(pose.beamStart.z, 200);
  assert.equal(pose.beamEnd.z, 167.5);
  assert.equal(pose.cone, 6.5);
  assert.equal(pose.lockT, 1.5);
  assert.equal(pose.lockLocked, true);
  assert.equal(pose.lockTarget, true);

  // When beam transitions off -> on between a and b, b.beamT is preserved across the onset blend.
  const onset = createShipStream({ delayMs: 35, samples: 8 });
  onset.receive([shipEntry(stub({ flight: { beamOn: false, beamT: 0, beamStart: vec(0, 0, 0), beamEnd: vec(0, 0, 0), mineFrac: 0 } }), { id: "guest-1", name: "Acey" })], t0);
  onset.receive([shipEntry(stub({ flight: { beamOn: true, beamT: 0.14, beamStart: vec(0, 0, 200), beamEnd: vec(0, 0, 167.5), mineFrac: 0.9 } }), { id: "guest-1", name: "Acey" })], t0 + 100);
  const onsetPose = onset.sample(t0 + 36)[0];
  assert.equal(onsetPose.beamOn, true);
  assert.equal(onsetPose.beamT, 0.14);
});

test("shipstream: arrival pacing (paceMs) prevents jitter surging and Hermite curves preserve tangent along turns", () => {
  const paceMs = 1000 / 24;
  const jittered = [1000, 1062, 1084, 1151, 1168, 1210]; // includes +25 ms late packet (gap 67 ms) followed by 17 ms rebound
  const rawStream = createShipStream({ delayMs: 100, samples: 8 });
  const pacedStream = createShipStream({ delayMs: 100, samples: 8, paceMs });
  for (let i = 0; i < jittered.length; i++) {
    const entry = shipEntry(stub({ pos: vec(i * 10, 0, 0), v: vec(240, 0, 0) }), { id: "guest-1", name: "Acey" });
    rawStream.receive([entry], jittered[i]);
    pacedStream.receive([entry], jittered[i]);
  }
  // Sample every 4.17 ms (240 Hz) across the middle window: paced step distances stay much steadier than raw jittered.
  const rawSteps = [], pacedSteps = [];
  let prevR = null, prevP = null;
  for (let ms = 1125; ms <= 1275; ms += 4.167) {
    const r = rawStream.sample(ms)[0]?.pos.x;
    const p = pacedStream.sample(ms)[0]?.pos.x;
    if (prevR !== null && r !== undefined) rawSteps.push(r - prevR);
    if (prevP !== null && p !== undefined) pacedSteps.push(p - prevP);
    prevR = r; prevP = p;
  }
  const spread = arr => Math.max(...arr) - Math.min(...arr);
  assert.ok(spread(pacedSteps) < spread(rawSteps) * 0.5, `paced spread (${spread(pacedSteps).toFixed(3)}) stays tight vs raw (${spread(rawSteps).toFixed(3)})`);

  // Curved turn: moving 10 m forward while velocity rotates across +Z gives an outward arc via Hermite.
  const curve = createShipStream({ delayMs: 100, samples: 6 });
  curve.receive([shipEntry(stub({ pos: vec(0, 0, 0), v: vec(250, 0, -40) }), { id: "guest-1", name: "Acey" })], 1000);
  curve.receive([shipEntry(stub({ pos: vec(10, 0, 0), v: vec(240, 0, 40) }), { id: "guest-1", name: "Acey" })], 1040);
  const mid = curve.sample(1120)[0];
  assert.ok(mid.pos.z < -0.1, `Hermite midpoint traces the outward arc (z=${mid.pos.z.toFixed(3)}) rather than flat chord z=0`);
});
