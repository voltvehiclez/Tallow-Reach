import { test } from "node:test";
import assert from "node:assert/strict";
import { GALAXY } from "../src/data/galaxy.js";
import { generateGalaxy } from "../src/sim/galaxy.js";
import { chartGalaxy, segmentDistanceSquared, straightEdgeBlockers } from "../src/ui/chart-lines.js";

function distances(world) {
  const graph = new Map(world.systems.map(s => [s.id, []]));
  for (const link of Object.values(world.links).filter(l => l.kind === "gate" && l.enabled !== false)) {
    const a = world.pockets[link.a].parent, b = world.pockets[link.b].parent;
    graph.get(a).push(b); graph.get(b).push(a);
  }
  const seen = new Map([[GALAXY.homeSystem, 0]]), queue = [GALAXY.homeSystem];
  for (let i = 0; i < queue.length; i++) for (const next of graph.get(queue[i])) {
    if (!seen.has(next)) { seen.set(next, seen.get(queue[i]) + 1); queue.push(next); }
  }
  return seen;
}

test("sparser seeded webs preserve scatter and put outer systems at least ten gate crossings from home", () => {
  for (const seed of [GALAXY.seed, 0, 1, 2, 42, 987654321]) {
    const world = generateGalaxy(seed);
    const old = generateGalaxy(seed, { generator: "organic-web-v1", graph: { maxNeighbors: 4, extraChance: 0.35, extraRange: 300 } });
    assert.deepEqual(world.systems.map(s => [s.id, s.n, s.pos]), old.systems.map(s => [s.id, s.n, s.pos]));
    const ds = distances(world);
    assert.equal(ds.size, world.systems.length);
    const outer = world.systems.filter(s => Math.hypot(...s.pos) >= GALAXY.layout.radius * 0.8);
    assert.ok(outer.length > 0);
    for (const s of outer) assert.ok(ds.get(s.id) >= 10, `${s.n} is ${ds.get(s.id)} gate crossings away`);
    assert.ok(Object.values(world.links).filter(l => l.kind === "gate").length < Object.values(old.links).filter(l => l.kind === "gate").length);
  }
});

test("straight chart links avoid unrelated dots without changing the world or its connections", () => {
  const original = generateGalaxy();
  const snapshot = structuredClone(original);
  const world = chartGalaxy(original);
  assert.equal(chartGalaxy(original), world, "chart layout is cached");
  assert.notEqual(world, original);
  assert.deepEqual(original, snapshot, "chart layout never mutates simulation or save geography");
  assert.deepEqual(Object.keys(world.links), Object.keys(original.links));
  const xs = world.systems.map(s => s.pos[0]), ys = world.systems.map(s => s.pos[1]);
  const minZoomScale = Math.max((Math.max(...xs) - Math.min(...xs) + 2 * GALAXY.map.padding) / (GALAXY.map.minZoom * 800),
    (Math.max(...ys) - Math.min(...ys) + 2 * GALAXY.map.padding) / (GALAXY.map.minZoom * 600));
  for (const link of Object.values(world.links).filter(l => l.kind === "gate")) {
    const a = world.systemsById[world.pockets[link.a].parent], b = world.systemsById[world.pockets[link.b].parent];
    assert.equal(straightEdgeBlockers(a, b, world.systems, s =>
      ((s.id === "meridian" ? GALAXY.map.homeRadius : GALAXY.map.nodeRadius) + 2) * minZoomScale).length, 0,
    "the default chart needs no line masking even at minimum zoom in an 800×600 viewport");
    for (const s of world.systems) {
      if (s.id === a.id || s.id === b.id) continue;
      assert.ok(segmentDistanceSquared(s.pos, a.pos, b.pos) >= 65 ** 2, `${a.id} → ${b.id} overlaps ${s.id}`);
    }
  }
  // A changed graph or authored position invalidates the derived chart, but
  // does not modify the stable names or the underlying world positions.
  const gate = Object.values(original.links).find(l => l.kind === "gate");
  gate.enabled = false;
  assert.equal(chartGalaxy(original), world, "closing a gate does not move chart systems");
  delete original.links[gate.id];
  assert.notEqual(chartGalaxy(original), world, "changing the graph invalidates the layout");
  const a = { id: "a", pos: [0, 0] }, b = { id: "b", pos: [100, 0] };
  const blocker = { id: "blocker", pos: [50, 0] }, distant = { id: "distant", pos: [50, 40] };
  assert.deepEqual(straightEdgeBlockers(a, b, [a, b, blocker, distant], () => 10).map(x => x.system.id), ["blocker"],
    "fallback masking excludes connected endpoints and all non-obstructing dots");
});
