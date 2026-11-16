// The system spatial layout (2026-11-16): every pocket of a system gets a true 3D position in
// AUs, derived from the same deterministic layout as the 2D pocket map — height pinned at 0, map
// x read as AU x, map y read as AU z. Systems are measured in AUs, never flight metres, and a
// system's size is its farthest pocket from the central body. These tests pin the derivation
// so the sky layer, the lighting and any future warp space can never quietly disagree with the
// map. Pure data only; the renderer itself is exercised by the build and the playtest.
import { test } from "node:test";
import assert from "node:assert/strict";
import { GALAXY } from "../src/data/galaxy.js";
import {
  generateGalaxy, validateTuning, systemPocketLayout, systemSpatialLayout, systemScale,
} from "../src/sim/galaxy.js";

const fresh = (seed = GALAXY.seed, tuning = {}, overrides = {}) => generateGalaxy(seed, tuning, overrides);
const SP = GALAXY.systemSpace;
const dist3 = p => Math.hypot(p[0], p[1], p[2]);

test("system space: every pocket of every system gets a finite AU position inside the height band", () => {
  const world = fresh();
  assert.ok(world.systems.length >= 100);
  for (const system of world.systems) {
    const layout = systemSpatialLayout(world, system.id);
    assert.ok(layout, `system ${system.id} resolves a spatial layout`);
    assert.equal(layout.nodes.length, Object.values(world.pockets).filter(p => p.parent === system.id).length);
    for (const node of layout.nodes) {
      assert.ok(Number.isFinite(node.pos[1]), `pocket ${node.id} has a finite height`);
      assert.ok(Math.abs(node.pos[1]) <= SP.heightAmplitudeAu + 1e-9, `pocket ${node.id} height stays inside the seeded band`);
      assert.ok(node.pos.every(Number.isFinite), `pocket ${node.id} has a finite position`);
      assert.ok(node.distanceAu >= 0);
    }
    // The system's outer boundary is its farthest pocket — nothing else needs to be asked.
    const max = Math.max(...layout.nodes.map(n => n.distanceAu));
    assert.equal(layout.radiusAu, max);
  }
});

test("system space: the AU positions are the map layout's own positions, lifted into 3D", () => {
  const world = fresh();
  for (const system of world.systems.slice(0, 12)) {
    const map = systemPocketLayout(world, system.id);
    const spatial = systemSpatialLayout(world, system.id);
    const k = SP.auPerMapUnit * systemScale(world, system.id);
    assert.equal(spatial.auPerUnit, k);
    for (const node of spatial.nodes) {
      const flat = map.byId[node.id];
      assert.ok(flat, `pocket ${node.id} is on the map too`);
      assert.equal(node.pos[0], flat.pos[0] * k);
      assert.equal(node.pos[2], flat.pos[1] * k);
      assert.equal(node.distanceAu, Math.hypot(node.pos[0], node.pos[1], node.pos[2]));
    }
  }
});

test("system space: each system keeps one stable seeded scale, bounded by the data", () => {
  const world = fresh();
  const scales = new Set();
  for (const system of world.systems) {
    const a = systemScale(world, system.id);
    const b = systemScale(world, system.id);
    assert.equal(a, b, "scale is stable for the same seed");
    assert.ok(a >= SP.minScale && a <= SP.maxScale, `scale ${a} sits inside the data bounds`);
    scales.add(a);
  }
  // The whole point of the per-system roll: systems must not all come out the same size.
  assert.ok(scales.size > 1, "systems differ in size");
});

test("system space: a farther authored pocket grows the system's boundary by itself", () => {
  const world = fresh();
  const pocket = Object.values(world.pockets).find(p => p.role !== "gate");
  const parent = pocket.parent;
  const before = systemSpatialLayout(world, parent).radiusAu;
  const grown = fresh(GALAXY.seed, {}, { places: { [pocket.id]: { mapPos: [30, 700] } } });
  const layout = systemSpatialLayout(grown, parent);
  assert.equal(layout.radiusAu, Math.max(...layout.nodes.map(n => n.distanceAu)));
  assert.ok(layout.radiusAu > before, "the boundary followed the new farthest pocket outwards");
});

test("system space: the central body sits at the origin and the star kind comes from the core", () => {
  const world = fresh();
  const meridian = systemSpatialLayout(world, "meridian");
  assert.deepEqual(meridian.starPos, [0, 0, 0]);
  assert.equal(meridian.starKind, "star");
  const hole = fresh(GALAXY.seed, {}, { places: { meridian: { core: { kind: "blackHole", n: "Emberfall" } } } });
  const layout = systemSpatialLayout(hole, "meridian");
  assert.equal(layout.starKind, "blackHole");
  assert.equal(layout.starName, "Emberfall");
});

test("system space: a pocket registered at runtime (a spawned wormhole) is laid out like its siblings", () => {
  const world = fresh();
  const parent = "meridian";
  assert.equal(world.pocketsById["wh-spatial-test"], undefined);
  world.pockets["wh-spatial-test"] = {
    id: "wh-spatial-test", kind: "pocket", def: "empty", parent, n: "Test wormhole", d: "",
    enter: { kind: "warp", pos: [0, 0, 300] }, leave: { kind: "warp" }, mapPos: [0, 210], role: "ordinary",
  };
  const layout = systemSpatialLayout(world, parent);
  const node = layout.byId["wh-spatial-test"];
  assert.ok(node, "the runtime pocket gets a 3D position");
  const k = SP.auPerMapUnit * systemScale(world, parent);
  assert.equal(node.pos[0], 0);
  assert.equal(node.pos[2], 210 * k);
  assert.ok(Math.abs(node.pos[1]) <= SP.heightAmplitudeAu + 1e-9);
});

test("system space: an authored mapHeight wins the seeded roll, and bad heights are rejected", () => {
  const world = fresh(GALAXY.seed, {}, { places: { meridian: {} } });
  const pocket = Object.values(world.pockets).find(p => p.parent === "meridian");
  const authored = fresh(GALAXY.seed, {}, { places: { [pocket.id]: { mapHeight: 2.5 } } });
  const layout = systemSpatialLayout(authored, "meridian");
  assert.equal(layout.byId[pocket.id].pos[1], 2.5);
  assert.throws(() => fresh(GALAXY.seed, {}, { places: { [pocket.id]: { mapHeight: Number.NaN } } }), /mapHeight/);
});

test("system space: unregistered and non-system ids resolve to nothing", () => {
  const world = fresh();
  assert.equal(systemSpatialLayout(world, "no-such-place"), null);
  assert.equal(systemSpatialLayout(world, "wh-far-side-instance"), null);
  assert.equal(systemSpatialLayout(null, "meridian"), null);
});

test("system space: the tuning is validated, not trusted", () => {
  assert.throws(() => validateTuning({ ...GALAXY, systemSpace: { ...SP, auPerMapUnit: 0 } }), /auPerMapUnit/);
  assert.throws(() => validateTuning({ ...GALAXY, systemSpace: { ...SP, minScale: 2, maxScale: 1 } }), /minScale/);
  assert.throws(() => validateTuning({ ...GALAXY, systemSpace: { ...SP, blackHole: { ...SP.blackHole, radiusAu: 0 } } }), /blackHole\.radiusAu/);
  assert.throws(() => validateTuning({ ...GALAXY, systemSpace: { ...SP, star: { ...SP.star, haloOpacity: 1.5 } } }), /haloOpacity/);
  assert.throws(() => validateTuning({ ...GALAXY, systemSpace: { ...SP, pocketDot: { ...SP.pocketDot, opacity: 0 } } }), /pocketDot\.opacity/);
});
