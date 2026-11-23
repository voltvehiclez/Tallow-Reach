import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { SHIPS } from '../src/data/ships.js';

test('owner compressed Test Ship decodes offline with the embedded Draco decoder', async () => {
  const bytes = readFileSync('src/assets/models/ship.testship.glb');
  // Re-recorded 2026-11-22 for the owner's testship-v1.glb (playtest 14). The old model was
  // 983f2048…, 0.91 x 0.24 x 1 with its base on y=0 and a stray "Page camera" node; this one
  // is centred on y (-0.097 to 0.139) and carries one mesh node. Diffed old against new
  // (LESSONS L17): the ONLY changes are the checksum, the bounding box and the node list —
  // every other assertion below is unchanged and still passes.
  assert.equal(createHash('md5').update(bytes).digest('hex'), '8338c12ec894bbd1442bc3e58198aa3e');
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
    const sourceLow = [-0.38701313734054565, -0.09709753096103668, -0.5003356337547302];
    const sourceHigh = [0.52118319272995, 0.13922041654586792, 0.5003356337547302];
    for (let axis = 0; axis < 3; axis++) {
      assert.ok(Math.abs(low[axis] - sourceLow[axis]) < 0.001);
      assert.ok(Math.abs(high[axis] - sourceHigh[axis]) < 0.001);
    }
    for (const object of [points, decoded, decoder, buffer]) module.destroy(object);
  }
  assert.equal(json.images[0].mimeType, 'image/webp');
  assert.equal(SHIPS.testship.modelLength, 14.8925);
  // **The orientation check that would have caught playtest 15** (owner: the ship was
  // "looking to the left"). `modelYaw` corrects the SOURCE model, so the question is what
  // the DRAWN nose points at — the node's own rotation applied first, then this yaw. The
  // new file ships a +90° node rotation that the old one did not have; keeping the old
  // model's π/2 on top of it faced the ship at −X.
  {
    const THREE = await import("three");
    const node = new THREE.Object3D();
    const q = json.nodes[0].rotation;           // [x, y, z, w] from the file itself
    if (q) node.quaternion.set(q[0], q[1], q[2], q[3]);
    const nose = new THREE.Vector3(1, 0, 0).applyQuaternion(node.quaternion);   // raw mesh runs +X
    const yaw = new THREE.Object3D();
    yaw.rotateY(SHIPS.testship.modelYaw);
    nose.applyQuaternion(yaw.quaternion);
    assert.ok(nose.z < -0.99, `the drawn nose must point forward (−Z); it points (${nose.x.toFixed(2)}, ${nose.y.toFixed(2)}, ${nose.z.toFixed(2)})`);
    assert.ok(Math.abs(nose.y) < 0.01, "and not up or down");
  }
  assert.equal(SHIPS.testship.cameraPadding, 1.2);
});
