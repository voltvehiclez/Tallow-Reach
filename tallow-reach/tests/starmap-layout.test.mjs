import { test } from "node:test";
import assert from "node:assert/strict";
import { GALAXY } from "../src/data/galaxy.js";
import { generateGalaxy } from "../src/sim/galaxy.js";
import { routeSystemEdge, segmentDistanceSquared, svgEdgePath } from "../src/ui/chart-lines.js";

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

test("system lines route around unrelated dots at multiple zoom scales", () => {
  const a = { id: "a", pos: [0, 0] }, b = { id: "b", pos: [100, 0] }, c = { id: "c", pos: [50, 0] };
  const path = routeSystemEdge(a, b, [a, b, c], 10);
  assert.ok(path.length > 2);
  assert.ok(path.slice(1).every((p, i) => segmentDistanceSquared([50, 0], path[i], p) >= 100 - 1e-7));
  assert.match(svgEdgePath(path), /^M/);
  for (const seed of [GALAXY.seed, 42]) {
    const world = generateGalaxy(seed);
    for (const radius of [12, 36, 72]) for (const link of Object.values(world.links).filter(l => l.kind === "gate")) {
      const a = world.systemsById[world.pockets[link.a].parent], b = world.systemsById[world.pockets[link.b].parent];
      const points = routeSystemEdge(a, b, world.systems, radius);
      assert.deepEqual(points[0], [a.pos[0], -a.pos[1]]);
      assert.deepEqual(points.at(-1), [b.pos[0], -b.pos[1]]);
      for (const s of world.systems) {
        if (s === a || s === b) continue;
        const dot = [s.pos[0], -s.pos[1]], r2 = radius * radius;
        if (segmentDistanceSquared(dot, points[0], points[0]) <= r2 || segmentDistanceSquared(dot, points.at(-1), points.at(-1)) <= r2) continue;
        assert.ok(points.slice(1).every((p, i) => segmentDistanceSquared(dot, points[i], p) >= r2 - 1e-6), `${a.id} → ${b.id} overlaps ${s.id}`);
      }
    }
  }
});
