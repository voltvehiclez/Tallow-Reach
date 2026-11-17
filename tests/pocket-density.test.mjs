import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateGalaxy } from '../src/sim/galaxy.js';
import { PLACE_DEFS } from '../src/data/places.js';
import { templateFeatures } from '../src/data/place-templates.js';
import { spawnAsteroid } from '../src/sim/asteroids.js';
import { resetPlaces } from '../src/state/state.js';

const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
test('Meridian retains original dense home field with populated outward extensions', () => {
  const fields = PLACE_DEFS.meridian.features.filter(f => f.kind === 'asteroidField');
  assert.deepEqual(fields[0].pos, [1800, 200, -1500]);
  assert.equal(fields[0].count, 70);
  assert.equal(fields[0].radius, 700);
  assert.equal(fields.length, 6);
  assert.equal(fields.reduce((n, f) => n + f.count, 0), 520);
  for (let i = 1; i < fields.length; i++) {
    assert.ok(distance(fields[i].pos, fields[i - 1].pos) < fields[i].radius + fields[i - 1].radius);
  }
  assert.ok(distance(fields[0].pos, fields.at(-1).pos) > 6000);
});
test('Belts remain dense across connected sections; arrivals are near the first POI', () => {
  for (const seed of [1, 42]) {
    const world = generateGalaxy(seed);
    for (const pocket of Object.values(world.pockets)) {
      const features = pocket.template ? templateFeatures(pocket.template, pocket).features :
        pocket.features || PLACE_DEFS[pocket.def]?.features || [];
      const station = features.find(f => f.kind === 'station');
      if (station && pocket.role !== 'planet') {
        const d = distance(station.pos, pocket.enter.pos);
        assert.ok(d >= 500 && d <= 1351, `${pocket.id}: ${d}`);
        assert.deepEqual(pocket.enter.face, station.pos);
      }
      if (pocket.role !== 'belt') continue;
      const fields = features.filter(f => f.kind === 'asteroidField');
      assert.ok(fields.length >= 5 && fields.length <= 7);
      assert.ok(fields.every(f => f.count >= 65 && f.radius <= 1000 && f.height <= 350));
      const d = distance(fields[0].pos, pocket.enter.pos) - fields[0].radius;
      assert.ok(d >= 350 && d <= 951);
      for (let i = 1; i < fields.length; i++) {
        assert.ok(distance(fields[i].pos, fields[i - 1].pos) < fields[i].radius * 2);
      }
    }
  }
});
test('Massive asteroids are deterministic, mixed with small rocks, using existing shapes', () => {
  resetPlaces();
  const field = PLACE_DEFS.meridian.features.find(f => f.id === 'field-extension-1');
  const rocks = Array.from({ length: field.count }, (_, i) => spawnAsteroid('reach', field, i));
  assert.ok(rocks.some(r => r.r >= 180));
  assert.ok(rocks.some(r => r.r < 85));
  assert.ok(rocks.every(r => r.r <= 360 && r.shape >= 0 && r.shape < 6));
  const again = spawnAsteroid('reach', field, 0);
  assert.equal(again.r, rocks[0].r);
  assert.deepEqual(again.pos, rocks[0].pos);
});
