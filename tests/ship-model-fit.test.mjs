import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { build } from 'esbuild';
const bundled = await build({ entryPoints: ['src/render/models.js'], bundle: true, write: false, format: 'esm', platform: 'node', loader: { '.glb': 'dataurl' } });
const { fitShipModel, buildPlayerShip } = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));
import { SHIPS } from '../src/data/ships.js';

test('Test Ship import faces forward, is centred, and is 15% longer than Wasp', () => {
  const model = new THREE.Group();
  // Off-centre small source model, nose pointing right (+X).
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 0.4, 1));
  mesh.position.set(3, 1, -2);
  model.add(mesh);
  const fitted = fitShipModel(model, SHIPS.testship);
  const bounds = new THREE.Box3().setFromObject(fitted);
  const waspBounds = new THREE.Box3().setFromObject(buildPlayerShip('wasp'));
  assert.ok(bounds.getCenter(new THREE.Vector3()).length() < 1e-6);
  assert.ok(Math.abs(bounds.getSize(new THREE.Vector3()).z / waspBounds.getSize(new THREE.Vector3()).z - 1.15) < 1e-6);
  const forward = new THREE.Vector3(1, 0, 0).transformDirection(model.matrixWorld);
  assert.ok(forward.distanceTo(new THREE.Vector3(0, 0, -1)) < 1e-6);
  assert.equal(SHIPS.testship.sc, 1, 'visual import correction must not change gameplay scale');
});
