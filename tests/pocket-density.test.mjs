import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateGalaxy } from '../src/sim/galaxy.js';
import { PLACE_DEFS } from '../src/data/places.js';
import { planAsteroids, asteroidEnvelope } from '../src/sim/asteroids.js';

function checkArc(id, field) {
  const plan = planAsteroids(id, [field]);
  const rocks = [...plan.values()];
  assert.equal(rocks.length, field.count, `${id}: all slots fit`);
  let nearest = Infinity;
  const bounds = rocks.map(asteroidEnvelope);
  const sectors = new Set();
  for (let i = 0; i < rocks.length; i++) {
    const p = rocks[i].pos.clone().sub({ x: field.pos[0], y: field.pos[1], z: field.pos[2] });
    nearest = Math.min(nearest, p.length() - bounds[i]);
    const angle = ((Math.atan2(p.z, p.x) - field.arc.angle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    assert.ok(angle >= field.arc.gap / 2 && angle <= 2 * Math.PI - field.arc.gap / 2);
    sectors.add(Math.floor(angle / (Math.PI / 4)));
    for (let j = 0; j < i; j++) {
      assert.ok(rocks[i].pos.distanceTo(rocks[j].pos) >= bounds[i] + bounds[j] + 19.99, `${id}: overlap ${i}/${j}`);
    }
  }
  assert.ok(sectors.size >= 6, 'rocks surround the centre across the C');
  assert.ok(nearest >= 2000 && nearest < 2200, `${id}: nearest surface ${nearest}`);
  assert.ok(rocks.some(r => r.r >= 180));
  assert.ok(rocks.some(r => r.r < 85));
  return plan;
}
test('Meridian is a packed C surrounding the station with a 2 km clear centre', () => {
  const field = PLACE_DEFS.meridian.features.find(f => f.kind === 'asteroidField');
  checkArc('reach', field);
  const world = generateGalaxy(42);
  assert.deepEqual(world.pockets.reach.enter.pos, field.pos);
});
test('Dedicated belts use dense C arcs and warp at the centre across seeds', () => {
  for (const seed of [1, 42, 728]) {
    const world = generateGalaxy(seed);
    const belts = Object.values(world.pockets).filter(p => p.role === 'belt');
    for (const pocket of belts) {
      const field = pocket.features.find(f => f.kind === 'asteroidField');
      assert.equal(field.layout, 'arc');
      assert.deepEqual(pocket.enter.pos, field.pos);
      assert.notDeepEqual(pocket.enter.face, field.pos);
    }
    for (const pocket of belts.slice(0, 3)) checkArc(pocket.id, pocket.features[0]);
  }
});
test('Packing reserves mined slots and prevents overlaps across adjacent fields', () => {
  const base = { kind: 'asteroidField', stable: true, count: 35, radius: 700, height: 300, ore: 'asteroid',
    rock: { rMin: 20, rMax: 80, giantChance: 0.02, giantMin: 180, giantMax: 250, orePerR: 1.6 } };
  const fields = [{ ...base, id: 'a', pos: [0, 0, 0] }, { ...base, id: 'b', pos: [500, 0, 0] }];
  const plan = planAsteroids('packing-test', fields);
  assert.equal(plan.size, 70);
  const rocks = [...plan.values()];
  for (let i = 0; i < rocks.length; i++) for (let j = 0; j < i; j++) {
    assert.ok(rocks[i].pos.distanceTo(rocks[j].pos) >= asteroidEnvelope(rocks[i]) + asteroidEnvelope(rocks[j]) + 19.99);
  }
  assert.deepEqual(planAsteroids('packing-test', structuredClone(fields)), plan);
});

test('Slot positions survive skipped slots, reverse loading and respawn', async () => {
  const { resetPlaces, placeWorld } = await import('../src/state/state.js');
  const { spawnAsteroid } = await import('../src/sim/asteroids.js');
  // Rebuild in reverse order, omitting a slot, to model cooldown-filtered loading.
  const field = PLACE_DEFS.meridian.features.find(f => f.kind === 'asteroidField');
  const expected = planAsteroids('reach', [field]);
  resetPlaces();
  for (const slot of [100, 9, 0, 749]) {
    const rock = spawnAsteroid('reach', field, slot);
    assert.deepEqual(rock.pos, expected.get(`field:${slot}`).pos);
  }
  placeWorld('reach').asteroids.length = 0;
  const restored = spawnAsteroid('reach', field, 9);
  assert.deepEqual(restored.pos, expected.get('field:9').pos);
});
