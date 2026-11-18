import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateGalaxy } from '../src/sim/galaxy.js';
import { PLACE_DEFS } from '../src/data/places.js';
import { planAsteroids, asteroidEnvelope, fieldDensityWeight, arcContour, fieldMarkerPosition } from '../src/sim/asteroids.js';

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
  assert.ok(nearest >= 4000 && nearest < 4200, `${id}: nearest surface ${nearest}`);
  assert.ok(rocks.some(r => r.r >= 180));
  assert.ok(rocks.some(r => r.r < 85));
  return plan;
}
test('Meridian is a packed C surrounding the station with a 4 km clear centre', () => {
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
  for (const slot of [100, 9, 0, field.count - 1]) {
    const rock = spawnAsteroid('reach', field, slot);
    assert.deepEqual(rock.pos, expected.get(`field:${slot}`).pos);
  }
  placeWorld('reach').asteroids.length = 0;
  const restored = spawnAsteroid('reach', field, 9);
  assert.deepEqual(restored.pos, expected.get('field:9').pos);
});


test('Belts are 30% flatter and 20% less dense per volume, with tapered ends', () => {
  const field = PLACE_DEFS.meridian.features.find(f => f.kind === 'asteroidField');
  assert.equal(field.height, 400 * 0.7);
  assert.equal(field.count, Math.round(210 * ((6000 ** 2 - 4000 ** 2) / (3600 ** 2 - 2000 ** 2))));
  const arc = field.arc, span = 2 * Math.PI - arc.gap;
  const at = fraction => ({ x: Math.cos(arc.angle + arc.gap / 2 + span * fraction),
    z: Math.sin(arc.angle + arc.gap / 2 + span * fraction) });
  assert.ok(fieldDensityWeight(field, at(0.01)) < fieldDensityWeight(field, at(0.1)));
  assert.ok(fieldDensityWeight(field, at(0.1)) < fieldDensityWeight(field, at(0.3)));
  assert.ok(fieldDensityWeight(field, at(0.3)) < fieldDensityWeight(field, at(0.5)));
  assert.ok(fieldDensityWeight(field, at(0.01)) < 0.012);
  assert.ok(fieldDensityWeight(field, at(0.1)) < 0.012);
  assert.ok(fieldDensityWeight(field, at(0.25)) < 0.26);
  assert.ok(Math.abs(fieldDensityWeight(field, at(0.1)) - fieldDensityWeight(field, at(0.9))) < 1e-10);
  const rocks = [...planAsteroids('reach', [field]).values()];
  let ends = 0, middle = 0;
  for (const rock of rocks) {
    const angle = ((Math.atan2(rock.pos.z - field.pos[2], rock.pos.x - field.pos[0]) - arc.angle - arc.gap / 2) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const t = angle / span;
    if (t < 0.1 || t > 0.9) ends++;
    if (t > 0.4 && t < 0.6) middle++;
  }
  assert.ok(ends < middle * 0.1, `ends ${ends}, middle ${middle}`);
});

test('Smaller ordinary fields widen and gradually thin toward their edges', async () => {
  const { templateFeatures } = await import('../src/data/place-templates.js');
  const field = templateFeatures('frontier', { id: 'taper-test', template: 'frontier' }).features.find(f => f.kind === 'asteroidField');
  assert.equal(field.radialFalloff, true);
  assert.ok(field.radius >= 875 && field.radius <= 1250);
  const weights = [0, 0.25, 0.5, 0.75, 1].map(t => fieldDensityWeight(field, { x: t * field.radius, z: 0 }));
  for (let i = 1; i < weights.length; i++) assert.ok(weights[i] < weights[i - 1]);
  assert.equal(weights[0], 1);
  assert.ok(Math.abs(weights.at(-1) - 0.3) < 1e-10);
});


test('C contours are irregular and deterministic, with occasional separated outer strays', () => {
  const field = PLACE_DEFS.meridian.features.find(f => f.kind === 'asteroidField');
  const contours = Array.from({ length: 20 }, (_, i) => arcContour(field, i * 0.3));
  assert.ok(Math.max(...contours.map(c => c.width)) - Math.min(...contours.map(c => c.width)) > 200);
  assert.ok(contours.every(c => c.inner >= field.arc.inner));
  assert.deepEqual(arcContour(field, 1), arcContour(structuredClone(field), 1));
  const rocks = [...planAsteroids('reach', [field]).values()];
  const strays = rocks.filter(rock => {
    const x = rock.pos.x - field.pos[0], z = rock.pos.z - field.pos[2];
    const contour = arcContour(field, Math.atan2(z, x));
    return Math.hypot(x, z) - asteroidEnvelope(rock) > contour.inner + contour.width + 200;
  });
  assert.ok(strays.length > rocks.length * 0.07 && strays.length < rocks.length * 0.25, `strays: ${strays.length}`);
  assert.ok(rocks.every(r => Math.abs(r.pos.y - field.pos[1]) <= field.height * 1.25));
});


test('Field markers sit midway through the populated arc, not at the warp centre', () => {
  const home = PLACE_DEFS.meridian.features.find(f => f.kind === 'asteroidField');
  for (const angle of [home.arc.angle, 0, 1.2, 5.8]) {
    const field = { ...home, arc: { ...home.arc, angle } };
    const original = structuredClone(field);
    const marker = fieldMarkerPosition(field);
    const contour = arcContour(field, angle + Math.PI);
    const dx = marker[0] - field.pos[0], dz = marker[2] - field.pos[2];
    assert.ok(Math.abs(Math.hypot(dx, dz) - contour.inner - contour.width / 2) < 1e-8);
    assert.ok(Math.abs(dx / Math.hypot(dx, dz) - Math.cos(angle + Math.PI)) < 1e-8);
    assert.equal(marker[1], field.pos[1]);
    assert.deepEqual(field, original, 'marker must not move the field or arrival centre');
  }
  assert.deepEqual(fieldMarkerPosition({ pos: [1, 2, 3] }), [1, 2, 3]);
});


test('Meridian Station alone rotates its opening toward the sun and lowers its field', async () => {
  const { systemSpatialLayout } = await import('../src/sim/galaxy.js');
  const { setPlaceCatalog, placeDef } = await import('../src/data/places.js');
  for (const seed of [1, 42]) {
    const world = generateGalaxy(seed);
    setPlaceCatalog(world);
    try {
      const field = placeDef('reach').features.find(f => f.kind === 'asteroidField');
      const node = systemSpatialLayout(world, 'meridian').byId.reach;
      const angle = Math.atan2(-node.pos[2], -node.pos[0]);
      assert.ok(Math.abs(Math.sin(field.arc.angle - angle)) < 1e-8);
      assert.ok(Math.cos(field.arc.angle - angle) > 0.999);
      assert.equal(field.pos[1], -50);
    } finally { setPlaceCatalog(null); }
  }
});

test('Ordinary fields including other Meridian pockets widen without changing core density or height', async () => {
  const { sceneryFeatures } = await import('../src/data/scenery.js');
  const source = { kind: 'asteroidField', id: 'field', pos: [0,0,0], radius: 1000,
    count: 100, height: 200, radialFalloff: true };
  const wide = sceneryFeatures({ id: 'other-meridian-pocket', parent: 'meridian' }, [source])[0];
  assert.equal(wide.radius, 2500);
  assert.equal(wide.height, 200);
  assert.equal(wide.coreRadius, 1000);
  assert.ok(wide.count > source.count);
  for (const r of [0, 300, 900]) assert.ok(Math.abs(fieldDensityWeight(wide, {x:r,z:0}) - fieldDensityWeight(source, {x:r,z:0})) < 1e-12);
  assert.ok(fieldDensityWeight(wide, {x:1500,z:0}) > fieldDensityWeight(wide, {x:2200,z:0}));
  assert.equal(sceneryFeatures({ id: 'reach', parent:'meridian' }, [source])[0].radius, 1000);
  assert.equal(sceneryFeatures({ id: 'belt', role:'belt', parent:'meridian' }, [source])[0].radius, 1000);
});

test('Arc strays diffuse above and below the old height with a sparse outer fringe', () => {
  const field = PLACE_DEFS.meridian.features.find(f => f.kind === 'asteroidField');
  const rocks = [...planAsteroids('reach', [field]).values()];
  const above = rocks.filter(r => r.pos.y - field.pos[1] > field.height);
  const below = rocks.filter(r => r.pos.y - field.pos[1] < -field.height);
  assert.ok(above.length > 0 && below.length > 0);
  assert.ok(above.length + below.length < rocks.length * 0.18);
  assert.ok(rocks.every(r => Math.abs(r.pos.y-field.pos[1]) <= field.height * 1.25));
});
