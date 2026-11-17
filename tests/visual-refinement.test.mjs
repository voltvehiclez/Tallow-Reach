import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { PLANET_VIEW, atmosphereRadius } from '../src/data/scenery.js';
import { PLACE_DEFS } from '../src/data/places.js';
const bundled = await build({ entryPoints: ['src/render/models.js'], bundle: true, write: false, format: 'esm', platform: 'node', loader: { '.glb': 'dataurl' } });
const { stationModel, planetModel } = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const meshes = object => { const list = []; object.traverse(n => { if (n.isMesh) list.push(n); }); return list; };

test('Meridian retains its original 90m ring, four spokes and original palette', () => {
  const feature = PLACE_DEFS.meridian.features.find(f => f.kind === 'station');
  const parts = meshes(stationModel(feature).object);
  assert.equal(parts.find(p => p.geometry.type === 'TorusGeometry').geometry.parameters.radius, 90);
  assert.equal(parts.filter(p => p.geometry.type === 'BoxGeometry' && p.geometry.parameters.width === 180).length, 4);
  assert.ok(parts.filter(p => p.material.type === 'MeshBasicMaterial').every(p => p.material.color.getHex() === 0xd9a45a));
});
test('Commerce cap sits flush above its core; refinery has no floating bottom slab', () => {
  const parts = meshes(stationModel({ style: 'commerce', pos: [0, 0, 0] }).object);
  const cap = parts.find(p => p.geometry.type === 'CylinderGeometry' && p.geometry.parameters.radiusTop === 11);
  const core = parts.find(p => p.geometry.type === 'CylinderGeometry' && p.geometry.parameters.radiusTop === 16);
  assert.equal(cap.position.y - cap.geometry.parameters.height / 2, core.position.y + core.geometry.parameters.height / 2);
  assert.equal(core.material.color.getHex(), 0x4a545c);
  assert.ok(parts.filter(p => p.material.type === 'MeshBasicMaterial').every(p => p.material.color.getHex() === 0xd9a45a));
  const industrial = meshes(stationModel({ style: 'industrial', pos: [0, 0, 0] }).object);
  assert.ok(!industrial.some(p => p.geometry.type === 'BoxGeometry' && p.position.y === -135));
});
test('Planet surfaces are solid colours, and sky point shaders discard square corners', () => {
  const source = readFileSync('src/render/systemsky.js', 'utf8');
  assert.ok(!source.includes('planetTexture'));
  assert.ok(source.includes('color: planet.col'));
  assert.equal((source.match(/pointRadius > 0.5/g) || []).length, 2);
  assert.ok(source.includes('dir.y = PLANET_VIEW.elevation'));
  assert.equal(PLANET_VIEW.elevation, 0);
  assert.ok(source.includes('L * PLANET_VIEW.radius'));
  assert.ok(Math.abs(PLANET_VIEW.radius / 0.338 - 1.3) < 1e-10);
  const planet = planetModel({ pos: [0, 0, 0], radius: 100, atmosphere: 114, col: 0x778899, atmoCol: 0x778899 });
  const surface = meshes(planet.object).find(p => p.material.type === 'MeshStandardMaterial');
  assert.equal(surface.material.map, null);
  assert.equal(surface.material.color.getHex(), 0x778899);
});


test('Atmosphere thickness is one third without changing the planet surface', () => {
  assert.equal(atmosphereRadius(300, 342), 314);
  assert.equal(atmosphereRadius(300, 366), 322);
  const planet = planetModel({ pos: [0, 0, 0], radius: 300, atmosphere: 342, col: 0x778899, atmoCol: 0x778899 });
  const parts = meshes(planet.object);
  assert.equal(parts.find(p => p.material.type === 'MeshStandardMaterial').geometry.parameters.radius, 300);
  assert.equal(parts.find(p => p.name === 'noclip.atmosphere').geometry.parameters.radius, 314);
  const source = readFileSync('src/render/systemsky.js', 'utf8');
  assert.ok(source.includes('atmosphereRadius(radiusPx, radiusPx * atmosphereScale)'));
});
