import { test } from 'node:test';
import assert from 'node:assert/strict';
import { V, Q } from '../src/util/math.js';
import { createBrain, flyFighter, flightAvoidance } from '../src/sim/enemy-flight.js';
import { enemyAI } from '../src/data/enemy-ai.js';
import { ENEMIES } from '../src/data/enemies.js';

const pilot = (id, seed, pos = V(0, 0, -400)) => ({ id, def: 'raider', place: 'ai-test', pos, quat: Q(), v: V(), hp: 10, brain: createBrain(seed) });
const world = enemies => ({ enemies, asteroids: [], bullets: [] });
const target = { pos: V(), v: V() };
function step(e, w, dt = 1/60) {
  const to = target.pos.clone().sub(e.pos);
  flyFighter(e, ENEMIES[e.def], to, to.length(), dt, { world: w, target });
}
test('Each enemy type declares a personality, with an extensible standard fallback', () => {
  for (const def of Object.values(ENEMIES)) assert.ok(def.aiProfile);
  assert.deepEqual(enemyAI({}), enemyAI({ aiProfile: 'missing' }));
  assert.ok(enemyAI(ENEMIES.hiveguardian).attackChance > enemyAI(ENEMIES.raider).attackChance);
  assert.ok(enemyAI(ENEMIES.hiveguardian).range < enemyAI(ENEMIES.raider).range);
  assert.equal(enemyAI({ aiTuning: { dodgeChance: 0 } }).dodgeChance, 0);
});
test('Individual pilots take distinct repeatable paths rather than synchronized orbits', () => {
  const run = () => {
    const a = pilot(1, 11), b = pilot(2, 22, V(5, 0, -400)), w = world([a, b]);
    const modes = new Set();
    let minSeparation = Infinity;
    for (let i = 0; i < 1200; i++) {
      step(a, w); step(b, w);
      modes.add(a.brain.mode);
      if (i > 60) minSeparation = Math.min(minSeparation, a.pos.distanceTo(b.pos));
    }
    assert.ok(minSeparation > 10, `separation ${minSeparation}`);
    assert.ok(modes.size >= 2);
    assert.ok(a.pos.distanceTo(b.pos) > 30);
    return [a.pos.toArray(), b.pos.toArray()];
  };
  assert.deepEqual(run(), run());
});
test('Predictive steering avoids a rock ahead, before the hull touches it', () => {
  const e = pilot(1, 42, V(0, 0, -300));
  e.v.set(0, 0, 100);
  const w = world([e]);
  w.asteroids.push({ pos: V(0, 0, -100), r: 60 });
  const avoidance = flightAvoidance(e, w, V(0, 0, 100));
  assert.ok(avoidance.length() > 0);
  let closest = Infinity;
  for (let i = 0; i < 600; i++) { step(e, w); closest = Math.min(closest, e.pos.distanceTo(w.asteroids[0].pos)); }
  assert.ok(closest > 65, `closest approach ${closest}`);
});
test('Exact overlapping ships get opposite separation instructions, not NaN or identical paths', () => {
  const a = pilot(1, 42), b = pilot(2, 42), w = world([a, b]);
  const aa = flightAvoidance(a, w, V()), bb = flightAvoidance(b, w, V());
  assert.ok(aa.dot(bb) < 0);
  for (let i = 0; i < 120; i++) { step(a, w); step(b, w); }
  assert.ok(a.pos.distanceTo(b.pos) > 20);
  assert.ok(a.pos.toArray().every(Number.isFinite));
});
test('Dodge reaction is delayed, probabilistic and cooldown limited', () => {
  const e = pilot(1, 99, V()); e.quat.identity();
  const w = world([e]);
  w.bullets.push({ own: true, pos: V(0, 0, -100), v: V(0, 0, 300) });
  step(e, w, 0.1);
  assert.equal(e.brain.dodge, 0);
  assert.equal(e.brain.cooldown, -0.1);
  for (let i = 0; i < 5; i++) step(e, w, 0.1);
  assert.ok(e.brain.cooldown > 0);
  const cooldown = e.brain.cooldown;
  step(e, w, 0.1);
  assert.ok(e.brain.cooldown < cooldown);
});

test('Station geometry triggers hull-width avoidance probes before contact', async () => {
  const { registerPlaceCollider, clearPlaceColliders, makeSoup } = await import('../src/sim/colliders.js');
  const soup = makeSoup([-200,-200,-200, 200,-200,-200, 200,200,-200, -200,-200,-200, 200,200,-200, -200,200,-200]);
  registerPlaceCollider('ai-test', { id: 'wall', soup });
  try {
    const e = pilot(1, 11, V(0, 0, -250));
    step(e, world([e]));
    assert.ok(e.brain.avoidance.length() > 0);
  } finally { clearPlaceColliders('ai-test'); }
});
test('Nearby pilots are avoided and friendlies block the firing lane', async () => {
  const { clearFriendlyLane } = await import('../src/sim/enemy-flight.js');
  const e = pilot(1, 11), friend = pilot(2, 22, V(0, 0, -200));
  assert.equal(clearFriendlyLane(e, V(), [e, friend]), false);
  friend.pos.x = 100;
  assert.equal(clearFriendlyLane(e, V(), [e, friend]), true);
  const ahead = { pos: V(0, 0, -250), v: V(), place: 'ai-test' };
  assert.ok(flightAvoidance(e, world([e]), V(0, 0, 100), [ahead]).length() > 0);
  ahead.place = 'elsewhere';
  assert.equal(flightAvoidance(e, world([e]), V(0, 0, 100), [ahead]).length(), 0);
});
