import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { SHIPS } from '../src/data/ships.js';

test('owner compressed Test Ship decodes offline with the embedded Draco decoder', async () => {
  const bytes = readFileSync('src/assets/models/ship.testship.glb');
  assert.equal(createHash('md5').update(bytes).digest('hex'), '983f20487d3b5840033a6d15d77b2896');
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  const jsonSize = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonSize).toString());
  const bin = bytes.subarray(28 + jsonSize);
  const context = vm.createContext({ console, setTimeout, clearTimeout, TextDecoder, TextEncoder });
  vm.runInContext(readFileSync('src/assets/decoders/draco-decoder.txt', 'utf8'), context);
  const { module } = await new Promise(resolve => {
    context.DracoDecoderModule({ onModuleLoaded: module => resolve({ module }) });
  });
  for (const mesh of json.meshes) for (const primitive of mesh.primitives) {
    const ext = primitive.extensions.KHR_draco_mesh_compression;
    const view = json.bufferViews[ext.bufferView];
    const raw = bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
    const buffer = new module.DecoderBuffer();
    buffer.Init(new Int8Array(raw), raw.byteLength);
    const decoder = new module.Decoder(), decoded = new module.Mesh();
    const status = decoder.DecodeBufferToMesh(buffer, decoded);
    assert.ok(status.ok(), status.error_msg());
    assert.ok(decoded.num_faces() > 0);
    const attr = decoder.GetAttributeByUniqueId(decoded, ext.attributes.POSITION);
    const points = new module.DracoFloat32Array();
    decoder.GetAttributeFloatForAllPoints(decoded, attr, points);
    const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < decoded.num_points(); i++) for (let axis = 0; axis < 3; axis++) {
      const value = points.GetValue(i * 3 + axis);
      low[axis] = Math.min(low[axis], value);
      high[axis] = Math.max(high[axis], value);
    }
    // Draco quantization may move vertices slightly, but not change authoring axes or size.
    const sourceLow = [-0.4541015625, 0, -0.4990234375];
    const sourceHigh = [0.4541015625, 0.236328125, 0.4990234375];
    for (let axis = 0; axis < 3; axis++) {
      assert.ok(Math.abs(low[axis] - sourceLow[axis]) < 0.001);
      assert.ok(Math.abs(high[axis] - sourceHigh[axis]) < 0.001);
    }
    for (const object of [points, decoded, decoder, buffer]) module.destroy(object);
  }
  assert.equal(json.images[0].mimeType, 'image/webp');
  assert.equal(SHIPS.testship.modelLength, 14.8925);
  assert.equal(SHIPS.testship.modelYaw, Math.PI / 2);
  assert.equal(SHIPS.testship.cameraPadding, 1.2);
});
