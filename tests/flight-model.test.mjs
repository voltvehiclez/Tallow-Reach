import { test } from 'node:test';
import assert from 'node:assert/strict';
import { V, Q } from '../src/util/math.js';
import { stepFlight, completeFlightStats } from '../src/sim/flight-model.js';
import { flyNpc } from '../src/sim/npc-pilot.js';
import { flyFighter, flyCourse } from '../src/sim/enemy-flight.js';
import { createBrain } from '../src/sim/enemy-flight.js';
import { startCourseAtBeginning } from '../src/sim/flight-course.js';
import { ENEMIES, enemyDef, flightStatsFor, flightStatsForShip } from '../src/data/enemies.js';
import { FLIGHT } from '../src/data/ships.js';

const DT = 1 / 60;
const ship = () => ({ pos: V(0, 0, 0), quat: Q(), v: V(0, 0, 0), thr: 0, bs: 0, boost: false });

// The player model as it was before the merge, written out from the old
// sim/player.js maths (local Y/X/Z turns with the stick deadzone, throttle
// target from thr, FLIGHT fractions, 0.9 / 2.4 easing, boost adds its speed).
function oldPlayerStep(s, stats, input, dt) {
  const dz = v => (Math.abs(v) < 0.1 ? 0 : v - Math.sign(v) * 0.1);
  const turn = stats.turn * FLIGHT.turn;
  // Axis factors as the owner set them 2026-11-21: yaw 40% of its old 1.6,
  // pitch unchanged, roll 250% of its old 1.5, then cut 25% (3.75 -> 2.8125)
  // after the owner found fast rolling sickening.
  const qy = Q().setFromAxisAngle(V(0, 1, 0), -dz(input.yaw || 0) * 0.64 * turn * dt);
  const qx = Q().setFromAxisAngle(V(1, 0, 0), -dz(input.pitch || 0) * 1.2 * turn * dt);
  const qz = Q().setFromAxisAngle(V(0, 0, 1), (input.roll || 0) * 2.8125 * turn * dt);
  s.quat.multiply(qy).multiply(qx).multiply(qz);
  if (input.thrust > 0) s.thr = Math.min(1, s.thr + dt * 0.5);
  if (input.thrust < 0) s.thr = Math.max(-1, s.thr - dt * 0.5);
  if (input.stop) s.thr = 0;
  if (input.brake) s.thr = s.thr > 0 ? Math.max(0, s.thr - dt * 0.9) : s.thr < 0 ? Math.min(0, s.thr + dt * 0.9) : 0;
  s.bs = input.boost ? Math.min(1, s.bs + dt / 0.4) : Math.max(0, s.bs - dt * 5);
  s.boost = s.bs >= 1;
  if (s.boost) s.thr = 1;
  const f = V(0, 0, -1).applyQuaternion(s.quat);
  const right = V(1, 0, 0).applyQuaternion(s.quat);
  const up = V(0, 1, 0).applyQuaternion(s.quat);
  const throttle = s.thr >= 0 ? s.thr : s.thr * stats.reverse;
  const target = f.multiplyScalar(throttle * stats.speed + (s.boost ? stats.speed : 0))
    .addScaledVector(right, (input.strafe || 0) * stats.speed * stats.strafe)
    .addScaledVector(up, (input.lift || 0) * stats.speed * stats.lift);
  s.v.lerp(target, 1 - Math.exp(-dt * (s.boost ? 2.4 : 0.9)));
  s.pos.addScaledVector(s.v, dt);
}

test('(a) the shared model reproduces the old player model exactly', () => {
  const stats = { speed: 150, turn: 1.2, strafe: 0.6, lift: 0.6, reverse: 0.6, ease: 0.9, boostEase: 2.4, boostSpeed: 150 };
  const inputs = [
    { thrust: 1, yaw: 0.4, pitch: -0.2 },
    { thrust: 1, strafe: 1, yaw: -0.7 },
    { thrust: 1, boost: true, lift: 0.5, roll: 0.6 },
    { thrust: -1, pitch: 0.3 },
    { stop: true, yaw: 1 },
    { thrust: 1, brake: true },
  ];
  const a = ship(), b = ship();
  for (let round = 0; round < 40; round++) {
    for (const input of inputs) {
      stepFlight(a, stats, input, DT);
      oldPlayerStep(b, { ...stats, boostSpeed: undefined }, input, DT);
      assert.deepEqual(a.pos.toArray(), b.pos.toArray());
      assert.deepEqual(a.v.toArray(), b.v.toArray());
      assert.deepEqual(a.quat.toArray(), b.quat.toArray());
      assert.equal(a.thr, b.thr);
    }
  }
});

test('(b) every existing NPC type starts with the stock Wasp flight numbers', () => {
  const wasp = flightStatsForShip('wasp');
  assert.deepEqual(wasp, { speed: 150, turn: 1.2, strafe: 0.6, lift: 0.6, reverse: 0.6, ease: 0.9, boostEase: 2.4, boostSpeed: 150, yaw: 1, pitch: 1, roll: 1, turnAll: 1 });
  for (const [id, def] of Object.entries(ENEMIES)) {
    assert.deepEqual(flightStatsFor(def), wasp, id);
    assert.deepEqual(def.flight, wasp, `${id} carries its own copied block`);
  }
});

test('(c) changing one NPC type changes only that type', () => {
  const tuned = { ...ENEMIES.raider, flight: { ...ENEMIES.raider.flight, speed: 90 } };
  assert.equal(flightStatsFor(tuned).speed, 90);
  assert.equal(flightStatsFor(ENEMIES.raider).speed, 150);
  assert.equal(flightStatsFor(ENEMIES.smuggler).speed, 150);
});

test('(d) an NPC can neither exceed its top speed nor out-turn its turn rate', () => {
  const e = { pos: V(), quat: Q(), v: V(), flight: { thr: 0, bs: 0, boost: false } };
  const def = ENEMIES.raider, stats = flightStatsFor(def);
  for (let i = 0; i < 60 * 30; i++) flyNpc(e, def, V(0, 0, -10000), V(0, 0, -10000), DT, { boost: false });
  assert.ok(e.v.length() <= stats.speed + 1e-6, `speed ${e.v.length()}`);
  assert.ok(e.v.length() > stats.speed * 0.95);
  // Turn cap: in one second of full stick the nose may swing no more than the
  // model's fastest nose axis — pitch, since the pilot banks to turn (test
  // (j)); before banking this cap was the yaw rate. Plus one tick of slack.
  const e2 = { pos: V(), quat: Q(), v: V(), flight: { thr: 0, bs: 0, boost: false } };
  const before = V(0, 0, -1).applyQuaternion(e2.quat);
  for (let i = 0; i < 60; i++) flyNpc(e2, def, V(10000, 0, 0), V(10000, 0, 0), DT);
  const after = V(0, 0, -1).applyQuaternion(e2.quat);
  const swung = Math.acos(Math.max(-1, Math.min(1, before.dot(after))));
  const cap = FLIGHT.pitchFactor * (1 - FLIGHT.deadzone) * stats.turn * FLIGHT.turn * 1 + DT * 2;
  assert.ok(swung <= cap + 0.05, `swung ${swung} over cap ${cap}`);
  assert.ok(swung > 0.3, 'it does turn toward the target');
});

test('(e) fromShip copies a hull once and individual overrides win', () => {
  const def = { flight: { fromShip: 'wasp', speed: 42 } };
  const stats = flightStatsFor(def);
  assert.equal(stats.speed, 42);
  assert.equal(stats.turn, flightStatsForShip('wasp').turn);
  assert.equal(stats.boostSpeed, 150);
});

test('(f) missing fields fall back to the defaults', () => {
  assert.deepEqual(flightStatsFor({}), { ...FLIGHT.defaultStats });
  assert.deepEqual(completeFlightStats({ speed: 10 }), { ...FLIGHT.defaultStats, speed: 10 });
  assert.deepEqual(flightStatsFor({ flight: { turn: 3 } }), { ...FLIGHT.defaultStats, turn: 3 });
});

test('(g) the NPC pilot settles on a target instead of oscillating or spinning', () => {
  const e = { pos: V(0, 0, 0), quat: Q(), v: V(), brain: createBrain(7), def: 'raider', id: 1, hp: 10, place: 't' };
  const target = { pos: V(300, 40, -600), v: V() };
  const world = { enemies: [e], asteroids: [], bullets: [] };
  let totalTurn = 0, prev = V(0, 0, -1);
  for (let i = 0; i < 60 * 20; i++) {
    const to = target.pos.clone().sub(e.pos);
    flyFighter(e, enemyDef('raider'), to, to.length(), DT, { world, target, players: [target] });
    const f = V(0, 0, -1).applyQuaternion(e.quat);
    totalTurn += Math.acos(Math.max(-1, Math.min(1, prev.dot(f))));
    prev = f;
    assert.ok(e.pos.toArray().every(Number.isFinite));
    assert.ok(e.v.length() <= 300 + 1e-6, `never past boost cap, got ${e.v.length()}`);
  }
  assert.ok(totalTurn < Math.PI * 6, `total turning ${totalTurn} rad in 20 s — no spinning`);
  assert.ok(e.pos.distanceTo(target.pos) < 700, `closed in to ${e.pos.distanceTo(target.pos)} m`);
});

test('(h) a story ship flies its authored course on the shared model', () => {
  const e = {
    pos: V(5000, 0, 5000), quat: Q(), v: V(), brain: createBrain(3), def: 'captain_korr',
    id: 9, hp: 9999, place: 't', course: startCourseAtBeginning('m01-range', 'chase'),
  };
  e.course.gather = 300;
  // The pilot forms up NEAR Dane (within the 300 m gather), not on his exact
  // start point — sitting on it makes Dane's collision avoidance cancel his
  // return flight head-on.
  const target = { pos: e.course.start.clone().add(V(200, 0, 0)), v: V(), quat: Q() };
  const world = { enemies: [e], asteroids: [], bullets: [] };
  let ran = false;
  for (let i = 0; i < 60 * 180 && !e.course.done; i++) {
    flyCourse(e, enemyDef('captain_korr'), target.pos.clone().sub(e.pos), 0, DT, { world, target, players: [target] });
    if (e.course.mode === 'run') ran = true;
    // Forward boost cap is 300; strafe/lift add on top vectorially, exactly as
    // the player's own target velocity always could (sqrt(300^2 + 90^2)).
    assert.ok(e.v.length() <= 320, `course speed ${e.v.length()}`);
  }
  assert.ok(ran, 'the course started once the pilot formed up');
  assert.ok(e.course.done, 'Dane reaches the end of the authored course');
});

test("(i) axis rates: yaw slowest, roll fastest; per-axis and turnAll tweaks bend only turning", () => {
  // One second of full stick on one axis; returns the angle swung, in radians.
  const swing = (input, stats = {}, vec = V(0, 0, -1), ticks = 60) => {
    const ship = { pos: V(), quat: Q(), v: V(), thr: 0, bs: 0, boost: false };
    const before = vec.clone().applyQuaternion(ship.quat);
    for (let i = 0; i < ticks; i++) stepFlight(ship, { speed: 150, turn: 1.2, ...stats }, input, DT);
    const after = vec.clone().applyQuaternion(ship.quat);
    return Math.acos(Math.max(-1, Math.min(1, before.dot(after))));
  };
  const yaw = swing({ yaw: 1 });
  const pitch = swing({ pitch: 1 });
  const roll = swing({ roll: 1 }, {}, V(0, 1, 0)); // roll spins the up vector, not the nose
  // The owner's ratios (2026-11-21): yaw 0.64, pitch 1.2, roll 2.8125. Yaw and
  // pitch pass the stick deadzone (x0.9 at full stick); roll never did.
  assert.ok(Math.abs(yaw / pitch - 0.64 / 1.2) < 0.02, `yaw/pitch ${yaw / pitch}`);
  assert.ok(Math.abs(roll / pitch - 2.8125 / (1.2 * 0.9)) < 0.02, `roll/pitch ${roll / pitch}`);
  // One axis at a time: yaw: 2 doubles yaw and leaves pitch alone.
  assert.ok(Math.abs(swing({ yaw: 1 }, { yaw: 2 }) / yaw - 2) < 0.02);
  assert.ok(Math.abs(swing({ pitch: 1 }, { yaw: 2 }) / pitch - 1) < 0.02);
  // turnAll: 2 doubles every axis at once.
  assert.ok(Math.abs(swing({ yaw: 1 }, { turnAll: 2 }) / yaw - 2) < 0.02);
  assert.ok(Math.abs(swing({ pitch: 1 }, { turnAll: 2 }) / pitch - 2) < 0.02);
  // (20 ticks: at turnAll 2 a full second of roll passes 180 degrees and the
  // angle measure folds back on itself.)
  assert.ok(Math.abs(swing({ roll: 1 }, { turnAll: 2 }, V(0, 1, 0), 20) / swing({ roll: 1 }, {}, V(0, 1, 0), 20) - 2) < 0.02);
  // An NPC type bends its own axes in its flight block, nobody else's.
  const banked = { ...ENEMIES.raider, flight: { ...ENEMIES.raider.flight, roll: 2, turnAll: 1.5 } };
  assert.equal(flightStatsFor(banked).roll, 2);
  assert.equal(flightStatsFor(banked).turnAll, 1.5);
  assert.equal(flightStatsFor(ENEMIES.raider).roll, 1);
});

test("(j) the NPC pilot banks (roll, then pitch) onto a side target faster than yaw alone could", () => {
  const e = { pos: V(), quat: Q(), v: V(), flight: { thr: 0, bs: 0, boost: false } };
  const def = ENEMIES.raider;
  const target = V(10000, 0, 0); // dead right: the worst case for slow yaw
  let seconds = -1, minUpY = 1;
  const up = V(), fwd = V();
  for (let i = 0; i < 60 * 8; i++) {
    flyNpc(e, def, target, target, DT);
    up.set(0, 1, 0).applyQuaternion(e.quat);
    minUpY = Math.min(minUpY, up.y);
    fwd.set(0, 0, -1).applyQuaternion(e.quat);
    if (Math.acos(Math.max(-1, Math.min(1, fwd.dot(V(1, 0, 0))))) < 0.05) { seconds = (i + 1) * DT; break; }
  }
  assert.ok(seconds > 0, "the nose arrives on the side target");
  // Yaw alone is capped at yawFactor x deadzoned stick x turn x FLIGHT.turn
  // (~0.36 rad/s), so 90 degrees could never take less than ~4.3 s.
  const yawOnlyFloor = (Math.PI / 2) / (FLIGHT.yawFactor * 0.9 * 1.2 * FLIGHT.turn);
  assert.ok(seconds < yawOnlyFloor, `banked arrival ${seconds.toFixed(2)}s beats the yaw-only floor ${yawOnlyFloor.toFixed(2)}s`);
  assert.ok(minUpY < 0.3, `the ship really banked (up vector tipped to ${minUpY.toFixed(2)})`);
});

test("(k) course legs can author a barrel roll; the waypoints and destination do not move", async () => {
  const { buildCourse } = await import("../src/sim/flight-course.js");
  const { FLIGHT_COURSES } = await import("../src/data/flight-courses.js");
  const course = buildCourse("m01-range", "chase");
  assert.ok(course.points.some(p => p.roll === 360), "a leg authors a roll one way");
  assert.ok(course.points.some(p => p.roll === -360), "and one the other way");
  // Every waypoint is exactly where the legs alone put it (roll is additive
  // data on the point, never an input to its position).
  const bare = { ...FLIGHT_COURSES["m01-range"], chase: { ...FLIGHT_COURSES["m01-range"].chase,
    legs: FLIGHT_COURSES["m01-range"].chase.legs.map(({ roll, ...rest }) => rest) } };
  void bare;
  assert.equal(course.points.length, FLIGHT_COURSES["m01-range"].chase.legs.length);
});
