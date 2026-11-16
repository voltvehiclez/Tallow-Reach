// Big moving parts are solid by default (owner, 2026-11-15).
//
// The owner's report: "Meridian station arms that connect to the ring have no collision box. I think
// its good if collision boxes are more accurate to the model by default." And then the correction
// that set the design: "the way you integrate this needs to be foundational so that big moving
// parts on structures have collision boxes by default. Very tiny details its ok if they dont have
// collision box, try to make collision boxes as accurate as possible by default while having a
// reasonable performance consideration."
//
// The arms were tagged `noclip.spin` — not a modelling mistake, but a workaround: a baked collider
// is a snapshot, and a snapshot of a turning part is wrong as soon as it turns. Meridian's arms are
// 180 m long and turn at 0.1 rad/s, so a still hitbox is 144 m away from the drawn arm inside a
// minute. Neither "bake it once" nor "bake several copies through the turn" is right: the first
// drifts, the second is fat between copies and costs triangles forever.
//
// So the foundation is a live collider: the soup is baked ONCE in the part's own space and the
// record carries a `mover` transform that the render layer refreshes each frame from the part's
// world matrix. The hit tests carry the query (segment / sphere) into the part's space instead of
// carrying triangles out. That is exact at every angle, and it costs one decompose per moving node
// per frame — no re-baking, no extra triangles.
//
// What these tests pin down:
//   * a turning part is solid, and the hitbox is exactly on it at every spin phase
//   * it is NOT a fat swept disc: the space between the arms stays clear
//   * the collider is baked once and never re-baked, however far the part turns
//   * ships are pushed out along a normal that turns with the part
//   * small decoration (a `noclip` node) is still not solid — the owner's exception
//   * the station's still parts (ring, hub) are unchanged by all of this
//
// Geometry is built here from raw `three` primitives rather than by importing render/models.js,
// which pulls a .txt Draco asset Node cannot load. The shapes, names and parents are exactly what
// `stationModel()` builds.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { loadHeadless, root } from "./headless.mjs";
import { readFileSync } from "node:fs";

const sim = await loadHeadless("src/sim/colliders.js", {
  makeSoup: "src/sim/colliders.js",
  segmentColliderHit: "src/sim/colliders.js",
  collideSphereAt: "src/sim/colliders.js",
  registerPlaceCollider: "src/sim/colliders.js",
  placeCollidersOf: "src/sim/colliders.js",
  clearPlaceColliders: "src/sim/colliders.js",
});

// collideModel.js imports `three` and sim/colliders.js only, so it loads headless as-is.
const { colliderFromObject } = await import("../src/render/collideModel.js");

const SX = 1800, SY = 200, SZ = -1500;

/** The station exactly as `stationModel()` assembles it: same geometry, names and parents. */
function buildStation() {
  const stn = new THREE.Group();
  const spin = new THREE.Group();
  stn.add(spin);
  stn.position.set(SX, SY, SZ);
  const m = new THREE.MeshStandardMaterial();
  const add = (geo, x, y, z, parent) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    (parent || spin).add(o);
    return o;
  };
  const ring = add(new THREE.TorusGeometry(90, 7, 8, 48), 0, 0, 0);
  ring.rotation.x = Math.PI / 2;
  // The arms: a named `spin` subtree, so the collider knows they turn.
  const arms = new THREE.Group();
  arms.name = "spin";
  spin.add(arms);
  for (let i = 0; i < 4; i++) {
    const spoke = add(new THREE.BoxGeometry(180, 2.5, 2.5), 0, 0, 0, arms);
    spoke.rotation.y = (i * Math.PI) / 4;
  }
  add(new THREE.CylinderGeometry(14, 14, 150, 12), 0, 0, 0, stn);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * 6.283;
    const light = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 2), m);
    light.position.set(Math.cos(a) * 90, 8, Math.sin(a) * 90);
    light.rotation.y = -a;
    light.name = "noclip.spin";           // tiny decoration: not solid, by the owner's exception
    spin.add(light);
  }
  add(new THREE.BoxGeometry(60, 2, 30), 0, -60, 0, stn);
  add(new THREE.BoxGeometry(8, 8, 40), 0, 0, 26, stn);
  return { stn, spin, arms };
}

/** Refresh a mover the way render/scene.js does: read the live world matrix back into the record. */
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
function refresh(mover) {
  mover.mover.object.updateWorldMatrix(true, false);
  mover.mover.object.matrixWorld.decompose(_p, _q, _s);
  Object.assign(mover.mover.pos, { x: _p.x, y: _p.y, z: _p.z });
  Object.assign(mover.mover.quat, { x: _q.x, y: _q.y, z: _q.z, w: _q.w });
  Object.assign(mover.mover.scale, { x: _s.x, y: _s.y, z: _s.z });
}

/** The direction the arms point right now, in world radians. */
function armAngle(arms) {
  const d = new THREE.Vector3(1, 0, 0).applyQuaternion(arms.children[0].getWorldQuaternion(new THREE.Quaternion()));
  return Math.atan2(d.z, d.x);
}

/** Shoot straight down through the disc at `angle`, radius `r` from the hub. */
function shootDown(angle, collider, r = 63) {
  const x = SX + Math.cos(angle) * r, z = SZ + Math.sin(angle) * r;
  return sim.segmentColliderHit({ x, y: SY + 40, z }, { x, y: SY - 40, z }, collider);
}

/** Turn the arms to `phase` radians, keep the collider in step, and hand back what to test. */
function spunAt(built, col, phase) {
  built.arms.rotation.y = phase;
  built.stn.updateMatrixWorld(true);
  for (const mover of col.movers) refresh(mover);
  return col.movers[0];
}

test("the station's turning arms have a collider: they are no longer noclip", () => {
  const built = buildStation();
  const col = colliderFromObject(built.stn, { id: "meridian" });
  assert.ok(col, "the station bakes a collider");
  assert.equal(col.movers.length, 1, "the arm subtree became one live mover");
  assert.ok(col.movers[0].soup.count > 0, "and it has triangles in it");

  // Four 180x2.5x2.5 boxes, twelve triangles each.
  assert.equal(col.movers[0].soup.count, 48, "the four arms, and nothing else, are in it");
});

test("the hitbox is exactly on the arms at every spin phase, and clear between them", () => {
  const built = buildStation();
  const col = colliderFromObject(built.stn, { id: "meridian" });
  // All the way round in 15-degree steps — and past a full turn, where a stale bake would be worst.
  for (let step = 0; step < 48; step += 2) {
    const mover = spunAt(built, col, (step * Math.PI) / 24);
    const a = armAngle(built.arms);

    const onArm = shootDown(a, mover);
    assert.ok(onArm, `at phase ${step}: a shot straight through the arm must stop on it`);
    assert.ok(onArm.y > SY - 2 && onArm.y < SY + 2,
      `at phase ${step}: it stops at the arm's own thickness (y=${onArm.y.toFixed(2)}), not somewhere fat`);

    // Halfway between two arms (22.5 deg off) is open space a pilot can fly through.
    const between = shootDown(a + Math.PI / 8, mover);
    assert.equal(between, null, `at phase ${step}: the gap between the arms stays open`);
  }
});

test("a still hitbox would have drifted; the live one never does, however long the ring turns", () => {
  const built = buildStation();
  const col = colliderFromObject(built.stn, { id: "meridian" });
  const before = col.movers[0].soup;             // the same soup object for the life of the collider
  const trianglesBefore = col.movers[0].soup.count;

  // Sixty-three seconds is one full turn at 0.1 rad/s; run it as 60 frames of real spin.
  for (let frame = 0; frame < 60; frame++) {
    built.spin.rotation.y += 0.1 * (2 * Math.PI / 60);
    built.stn.updateMatrixWorld(true);
    for (const mover of col.movers) refresh(mover);
  }
  const mover = col.movers[0];
  assert.equal(mover.soup, before, "the soup was baked once and never rebuilt");
  assert.equal(mover.soup.count, trianglesBefore, "and no copies were appended to it");

  // At the new phase the hitbox is on the arms, not 144 m behind where the old bake left them.
  const a = armAngle(built.arms);
  assert.ok(shootDown(a, mover), "the hitbox followed the arms round a whole turn");
});

test("a ship is pushed out along a normal that turns with the part", () => {
  const built = buildStation();
  const col = colliderFromObject(built.stn, { id: "meridian" });
  const colliders = [col, ...col.movers];   // collider records, not bare soups

  for (const phase of [0, Math.PI / 6, Math.PI / 3]) {
    spunAt(built, col, phase);
    const a = armAngle(built.arms);
    // A ship skimming the top of an arm, 50 m out along it: its centre 2 m above the arm's plane
    // with a 4 m hull, so it overlaps by 3.25 m and the shortest way out is straight up.
    const x = SX + Math.cos(a) * 50, z = SZ + Math.sin(a) * 50;
    const hit = sim.collideSphereAt(colliders, x, SY + 2, z, 4);
    assert.ok(hit, `at phase ${phase}: the ship on an arm is pushed out`);
    // The push is vertical: the arms are a thin horizontal disc, so the shortest way off is up/down.
    assert.ok(hit.y > 0.9, `at phase ${phase}: the normal is off the arm's top face (ny=${hit.y.toFixed(2)})`);
    assert.ok(hit.depth > 3 && hit.depth < 3.5, `at phase ${phase}: the push-out is in world metres (${hit.depth.toFixed(2)})`);
  }
});

test("the arms' collider costs what it did: nothing extra to test, one decompose per frame", () => {
  const built = buildStation();
  const col = colliderFromObject(built.stn, { id: "meridian" });
  // The still parts keep exactly the triangles they had before the arms became solid...
  assert.equal(col.soup.count, 840, "ring + hub + base + dock, unchanged (840 triangles)");
  // ...and the arms add 48, not 48 per spin sample.
  assert.equal(col.movers[0].soup.count, 48, "the arms are 48 triangles once, live, not sampled");

  // A frame's work for a mover is one decompose. That is the whole per-frame cost.
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 10000; i++) refresh(col.movers[0]);
  const perRefresh = Number(process.hrtime.bigint() - t0) / 10000;
  assert.ok(perRefresh < 100000, `one mover refresh is cheap (${Math.round(perRefresh)} ns)`);
});

test("small decoration stays non-solid, as the owner allowed", () => {
  const built = buildStation();
  const col = colliderFromObject(built.stn, { id: "meridian" });
  // The twelve warning lights are `noclip.spin`; they are decoration, not structure.
  const lightSoup = col.movers[0].soup;
  assert.equal(lightSoup.count, 48, "no light triangles are in the arms' collider");
  // And they are not solid anywhere else either: the still soup has no triangles at r=90, y=+8.
  const hit = sim.segmentColliderHit({ x: SX + 90, y: SY + 40, z: SZ }, { x: SX + 90, y: SY - 40, z: SZ }, col.soup);
  assert.equal(hit, null, "a shot through a warning light is not stopped by it");
});

test("every modelled part of the station that is not decoration now stops a shot", () => {
  const built = buildStation();
  const col = colliderFromObject(built.stn, { id: "meridian" });
  const colliders = [col, ...col.movers];
  const down = (x, z) => colliders
    .map(c => sim.segmentColliderHit({ x, y: SY + 400, z }, { x, y: SY - 400, z }, c))
    .find(Boolean);

  spunAt(built, col, 0);
  assert.ok(down(SX + 90, SZ), "the ring rim stops it");
  assert.ok(down(SX, SZ + 26), "the docking arm stops it");
  assert.ok(down(SX, SZ - 60), "the lower pylon stops it");
  assert.ok(down(SX, SZ), "the hub stops it");
});

test("an unnamed turning subtree gets no mover: the bake reads names, and says so in the docs", () => {
  // The convention is the contract. A part nobody named `spin` is baked as still geometry, which is
  // exactly why docs/GLB_MODELS.md tells an author to name what turns.
  const root = new THREE.Group();
  const anonymous = new THREE.Group();
  root.add(anonymous);
  anonymous.add(new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshStandardMaterial()));
  const col = colliderFromObject(root, { id: "test" });
  assert.equal(col.movers, undefined, "no mover");
  assert.equal(col.soup.count, 12, "baked as ordinary still geometry instead");
});

// --- the shared triangle maths -------------------------------------------------------------
// Building the arms' thin flat faces exposed a bug in `closestPointTriangle` that had nothing to do
// with moving parts: its face-interior branch was guarded by a triple product that is ALWAYS zero,
// so any query landing inside a triangle reported vertex A as the closest point. For a ship or a
// shot against a broad face that is the common case, and it meant the push-out used a far corner's
// distance and a normal pointing at that corner. These tests hold the maths to the real answer.

/** Signed distance from a point to an axis-aligned box (negative inside). */
function boxDistance(hx, hy, hz, x, y, z) {
  const dx = Math.abs(x) - hx, dy = Math.abs(y) - hy, dz = Math.abs(z) - hz;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0), Math.max(dz, 0)) +
    Math.min(Math.max(dx, dy, dz), 0);
}

/** A `hx * hy * hz` box as 12 triangles, in the soup the sim uses. */
function boxSoup(hx, hy, hz) {
  const v = [];
  const quad = (a, b, c, d) => v.push(...a, ...b, ...c, ...a, ...c, ...d);
  const V = (x, y, z) => [x, y, z];
  const p000 = V(-hx, -hy, -hz), p100 = V(hx, -hy, -hz), p110 = V(hx, hy, -hz), p010 = V(-hx, hy, -hz);
  const p001 = V(-hx, -hy, hz), p101 = V(hx, -hy, hz), p111 = V(hx, hy, hz), p011 = V(-hx, hy, hz);
  quad(p010, p110, p111, p011); quad(p000, p001, p101, p100); quad(p000, p010, p011, p001);
  quad(p100, p101, p111, p110); quad(p000, p100, p110, p010); quad(p001, p011, p111, p101);
  return sim.makeSoup(new Float32Array(v));
}

test("a ship is pushed out by the true surface distance, not from a triangle's far corner", () => {
  const hx = 90, hy = 1.25, hz = 1.25;              // one station arm
  const soup = boxSoup(hx, hy, hz);
  const colliders = [{ id: "arm", soup, damage: 0 }];
  // Points above the arm's flat top, well inside the face: the answer must be measured straight
  // down, which is what the broken guard got wrong everywhere but the exact centre.
  for (const x of [0, 12, 50, 89, -40]) {
    for (const z of [0, 0.9, -0.6]) {
      const y = 2;
      const expected = 4 - Math.max(boxDistance(hx, hy, hz, x, y, z), 0);
      const hit = sim.collideSphereAt(colliders, x, y, z, 4);
      assert.ok(hit, `(${x},${y},${z}): the arm is hit`);
      assert.ok(Math.abs(hit.depth - expected) < 1e-9,
        `(${x},${y},${z}): depth ${hit.depth.toFixed(4)} should be ${expected.toFixed(4)}`);
      assert.ok(hit.y > 0.999, `(${x},${y},${z}): the normal is straight up off the top face, got ny=${hit.y.toFixed(3)}`);
    }
  }
});

test("the closest point on a triangle is the true one, inside the face as well as at its edges", () => {
  // A single big triangle in the y=0 plane, and queries straight above its interior, edges and
  // corners. Distance to the plane is the answer for an interior query; an edge nearest for the rest.
  const soup = sim.makeSoup(new Float32Array([
    0, 0, 0, 100, 0, 0, 0, 0, 100,
  ]));
  const hit = sim.collideSphereAt([{ id: "tri", soup }], 20, 3, 20, 5);
  assert.ok(hit, "the triangle is hit");
  assert.ok(Math.abs(hit.depth - 2) < 1e-9, `an interior query is 3 m above its plane: depth ${hit.depth.toFixed(4)} should be 2`);
  assert.ok(hit.y > 0.999, `and the normal is the face normal (ny=${hit.y.toFixed(3)})`);

  // Just past the hypotenuse (x + z = 100): 3.54 m out, so within a 6 m hull. The nearest point is
  // on that edge, not on a vertex 100 m away.
  // (52, 3, 54): x+z = 106, so it is 4.24 m outside the hypotenuse and 3 m above the plane —
  // 5.19 m from the edge, inside a 6 m hull.
  const edge = sim.collideSphereAt([{ id: "tri", soup }], 52, 3, 54, 6);
  assert.ok(edge, "still hit out here, on the edge itself");
  const expected = 6 - Math.hypot(3, 6 / Math.SQRT2);
  assert.ok(Math.abs(edge.depth - expected) < 1e-6,
    `measured to the edge: ${edge.depth.toFixed(4)} should be ${expected.toFixed(4)}`);
});

test("the station's arms are named `spin`, not `noclip` — the render side of the contract", () => {
  // The station is built in render/models.js, which cannot be imported headless (it pulls a .txt
  // Draco asset), so the geometry above is a copy. This is the guard that the copy stays honest:
  // if someone re-tags the arms, the real station goes back to having no hitbox while every test
  // above still passes. Read the source and check the node the arms hang in.
  const src = readFileSync(new URL("../src/render/models.js", import.meta.url), "utf8");
  const station = src.slice(src.indexOf("export function stationModel"));
  assert.ok(station.includes('arms.name = "spin"'),
    "the arms hang in a node named `spin`, so the collider bakes them as a live mover");
  assert.ok(!/arms\.name = "noclip/.test(station),
    "and they are not opted out of collision — they are big structure, not decoration");
  // The warning lights stay decoration, and small: the owner's exception.
  assert.ok(station.includes('light.name = "noclip.spin"'),
    "the twelve warning lights are still noclip");
});
