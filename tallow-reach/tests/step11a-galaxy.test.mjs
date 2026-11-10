// Step 11A: organic starmap generation, one-peer gates and author overrides,
// plus the open-world travel/core follow-up. These tests exercise pure data only;
// step11b-starmap.test.mjs covers the live map, warp sequence and compact saves.
import { test } from "node:test";
import assert from "node:assert/strict";
import { GALAXY, GALAXY_OVERRIDES } from "../src/data/galaxy.js";
import { PLACES, PLACE_LINKS, DEFAULT_PLACE } from "../src/data/places.js";
import {
  generateGalaxy, GALAXY_GENERATORS, organicWeb, validateGalaxy, validateTuning,
  pocketsInSystem, linksFrom, systemVisible, systemDistance, systemCoreName, assignCores,
} from "../src/sim/galaxy.js";
import { canTravel, travelQuote, travelOptions, findRoute, intraSystemPolicy, TRAVEL_REQUIREMENTS, TRAVEL_MODES } from "../src/sim/travel.js";
import { makeRng, setSeed, random } from "../src/util/rng.js";

const fresh = (seed = GALAXY.seed, tuning = {}, overrides = {}) => generateGalaxy(seed, tuning, overrides);

function systemDegrees(world) {
  const degree = new Map(world.systems.map(s => [s.id, 0]));
  for (const link of Object.values(world.links)) {
    if (link.kind !== "gate") continue;
    const a = world.pockets[link.a].parent, b = world.pockets[link.b].parent;
    degree.set(a, degree.get(a) + 1);
    degree.set(b, degree.get(b) + 1);
  }
  return degree;
}

test("11A: default generation is deterministic and has at least 100 systems", () => {
  const a = fresh(), b = fresh();
  assert.ok(a.systems.length >= 100);
  assert.equal(a.systems.length, GALAXY.systemCount);
  assert.deepEqual(a, b);
  assert.notDeepEqual(fresh(1).systems.map(s => s.pos), fresh(2).systems.map(s => s.pos));
});

test("11A: generation uses its own seeded stream, not combat's shared rolls", () => {
  setSeed(99);
  for (let i = 0; i < 50; i++) random();
  const a = fresh();
  setSeed(1);
  random(); random(); random();
  const b = fresh();
  setSeed(null);
  assert.deepEqual(a, b);
});

test("11A: positions are an organic 2D scatter, not a square lattice", () => {
  const world = fresh();
  const xs = new Set(world.systems.map(s => s.pos[0]));
  const ys = new Set(world.systems.map(s => s.pos[1]));
  assert.ok(xs.size > world.systems.length * 0.9, "x coordinates are not shared grid columns");
  assert.ok(ys.size > world.systems.length * 0.9, "y coordinates are not shared grid rows");
  assert.deepEqual(world.systemsById.meridian.pos, [0, 0]);
  for (const system of world.systems) {
    assert.equal(system.pos.length, 2);
    assert.ok(system.pos.every(Number.isFinite));
    assert.ok(Math.hypot(...system.pos) <= GALAXY.layout.radius + 1e-6);
  }
});

test("11A: the web has dead ends, two-link systems and junctions, under the degree cap", () => {
  const world = fresh();
  const degree = systemDegrees(world);
  const counts = { 1: 0, 2: 0, many: 0 };
  for (const d of degree.values()) {
    assert.ok(d >= 1 && d <= GALAXY.graph.maxNeighbors);
    if (d === 1) counts[1]++;
    else if (d === 2) counts[2]++;
    else counts.many++;
  }
  assert.ok(counts[1] > 0, "some systems are dead ends");
  assert.ok(counts[2] > 0, "some systems have exactly two neighbours");
  assert.ok(counts.many > 0, "some systems are junctions");
});

test("11A: every system and pocket is reachable through enabled links or free local warp", () => {
  const world = fresh();
  const seenSystems = new Set([GALAXY.homeSystem]);
  const queue = [GALAXY.homeSystem];
  while (queue.length) {
    const id = queue.shift();
    for (const pocket of pocketsInSystem(world, id)) {
      for (const link of linksFrom(world, pocket.id)) {
        if (link.kind !== "gate") continue;
        const next = world.pockets[link.a === pocket.id ? link.b : link.a].parent;
        if (!seenSystems.has(next)) { seenSystems.add(next); queue.push(next); }
      }
    }
  }
  assert.equal(seenSystems.size, world.systems.length);
  for (const pocket of Object.keys(world.pockets)) assert.ok(findRoute(world, DEFAULT_PLACE, pocket), pocket);
});

test("11A: each generated system has one ordinary hub and one gate pocket per neighbour", () => {
  const world = fresh();
  const degree = systemDegrees(world);
  for (const system of world.systems) {
    const pockets = pocketsInSystem(world, system.id);
    const gates = pockets.filter(p => p.role === "gate");
    assert.equal(gates.length, degree.get(system.id), system.id);
    if (system.id === GALAXY.homeSystem) {
      assert.ok(pockets.some(p => p.id === "reach"));
      assert.ok(pockets.some(p => p.id === "hollow"));
      assert.equal(pockets.filter(p => p.role !== "gate").length, 2, "Meridian keeps both existing ordinary pockets");
    } else {
      assert.equal(pockets.filter(p => p.role !== "gate").length, 1, system.id);
      assert.ok(world.pockets[`${system.id}-hub`]);
    }
    for (const gate of gates) {
      const external = Object.values(world.links).filter(l => l.kind === "gate" && (l.a === gate.id || l.b === gate.id));
      assert.equal(external.length, 1, `${gate.id} has exactly one external peer`);
      const peer = external[0].a === gate.id ? external[0].b : external[0].a;
      assert.equal(world.pockets[peer].role, "gate");
      assert.notEqual(world.pockets[peer].parent, system.id);
      assert.ok(linksFrom(world, gate.id).some(l => l.kind === "internal"), `${gate.id} connects inward`);
      assert.equal(world.pockets[gate.id].def, "empty");
    }
  }
  assert.notEqual(world.pockets.hollow.role, "gate", "Kestrel Hollow stays an ordinary empty pocket");
  assert.equal(world.pockets.hollow.def, "empty");
  assert.ok(canTravel(world, "reach", "hollow"));
});

test("11A: gate travel is one hop to the named peer, never to an arbitrary neighbouring system", () => {
  const world = fresh();
  const gate = Object.values(world.pockets).find(p => p.parent === GALAXY.homeSystem && p.role === "gate");
  const external = Object.values(world.links).find(l => l.kind === "gate" && (l.a === gate.id || l.b === gate.id));
  const peer = external.a === gate.id ? external.b : external.a;
  assert.ok(canTravel(world, gate.id, peer));
  const otherGate = Object.values(world.pockets).find(p => p.role === "gate" && p.parent !== gate.parent && p.id !== peer);
  assert.equal(canTravel(world, gate.id, otherGate.id), false);
  assert.match(travelQuote(world, gate.id, otherGate.id).reason, /No direct route/);
  assert.ok(travelOptions(world, gate.id).every(o => o.ok));
});

test("11A: moving a system is a data override and keeps ids, pockets and routes stable", () => {
  const before = fresh();
  const after = fresh(GALAXY.seed, {}, { places: { "sys-004": { pos: [180, -260] } } });
  assert.deepEqual(after.systemsById["sys-004"].pos, [180, -260]);
  assert.deepEqual(Object.keys(after.pockets).sort(), Object.keys(before.pockets).sort());
  assert.deepEqual(Object.keys(after.links).sort(), Object.keys(before.links).sort());
  assert.equal(after.pockets["sys-004-hub"].parent, "sys-004");
  assert.ok(systemDistance(after, "meridian", "sys-004") > 0);
});

test("11A: deleting a pocket prunes its links without touching generator code", () => {
  const world = fresh(GALAXY.seed, {}, { removedPlaces: ["hollow"] });
  assert.equal(world.pockets.hollow, undefined);
  assert.ok(!Object.values(world.links).some(l => l.a === "hollow" || l.b === "hollow"));
  assert.deepEqual(validateGalaxy(world), []);
  assert.ok(canTravel(world, DEFAULT_PLACE, "reach") === false);
});

test("11A: promoting an ordinary pocket to a gate is a role patch plus one named peer link", () => {
  const world = fresh(GALAXY.seed, {}, {
    places: {
      hollow: { role: "gate" },
      "test-peer-gate": {
        kind: "pocket", def: "empty", parent: "sys-001", n: "Test peer gate", d: "A gate peer added by data.",
        role: "gate", enter: { kind: "warp", pos: [0, 0, 300] }, leave: { kind: "warp" },
      },
    },
    links: {
      "test-peer-inner": { kind: "internal", a: "sys-001-hub", b: "test-peer-gate", mode: "warp", cost: {}, requires: [], enabled: true },
      "hollow-peer": { kind: "gate", a: "hollow", b: "test-peer-gate", mode: "warp", cost: {}, requires: [], enabled: true },
    },
  });
  assert.equal(world.pockets.hollow.role, "gate");
  assert.ok(canTravel(world, "hollow", "test-peer-gate"));
  assert.deepEqual(validateGalaxy(world), []);
});

test("11A: a gate with zero or two external peers is rejected plainly", () => {
  assert.throws(() => fresh(GALAXY.seed, {}, { places: { hollow: { role: "gate" } } }), /exactly one/);
  const world = fresh();
  const gates = Object.values(world.pockets).filter(p => p.role === "gate");
  const a = gates[0];
  const b = gates.find(g => g.parent !== a.parent && !Object.values(world.links).some(l =>
    l.kind === "gate" && ((l.a === a.id && l.b === g.id) || (l.a === g.id && l.b === a.id))));
  world.links["extra-peer"] = { id: "extra-peer", kind: "gate", a: a.id, b: b.id, mode: "warp", cost: {}, requires: [], enabled: true };
  assert.match(validateGalaxy(world).join("\n"), /has 2 external links/);
});

test("11A: an alternative route is a link record, and findRoute returns ids only", () => {
  const world = fresh();
  const from = DEFAULT_PLACE, to = "sys-010-hub";
  const before = findRoute(world, from, to);
  assert.ok(before && before.length > 2);
  world.links["test-shortcut"] = { id: "test-shortcut", kind: "internal", a: from, b: to, mode: "warp", cost: {}, requires: [], enabled: true };
  // Internal links may not cross systems, so use a same-system extra edge instead.
  delete world.links["test-shortcut"];
  const gate = Object.values(world.pockets).find(p => p.parent === GALAXY.homeSystem && p.role === "gate");
  world.links["test-shortcut"] = { id: "test-shortcut", kind: "internal", a: "hollow", b: gate.id, mode: "warp", cost: {}, requires: [], enabled: true };
  assert.deepEqual(validateGalaxy(world), []);
  assert.deepEqual(findRoute(world, "hollow", gate.id), ["hollow", gate.id]);
  assert.equal(canTravel(world, from, to), false, "a route path is not permission to skip hops");
});

test("11A: a replacement generator plugs into the same resolved-record contract", () => {
  GALAXY_GENERATORS["test-generator"] = (seed, tuning, rng) => organicWeb(seed, { ...tuning, systemCount: 12 }, rng);
  try {
    const world = fresh(GALAXY.seed, { generator: "test-generator" });
    assert.equal(world.generator, "test-generator");
    assert.equal(world.systems.length, 12);
    assert.ok(findRoute(world, DEFAULT_PLACE, "sys-011-hub"));
    assert.ok(canTravel(world, "reach", "hollow"));
  } finally {
    delete GALAXY_GENERATORS["test-generator"];
  }
});

test("11A: visibility is a policy, not a hard-coded no-fog assumption", () => {
  const world = fresh();
  assert.ok(world.systems.every(s => systemVisible(world, s.id)));
  const fog = fresh(GALAXY.seed, { visibility: { mode: "discovered" } });
  assert.equal(systemVisible(fog, "sys-001", {}), false);
  assert.equal(systemVisible(fog, "sys-001", { "sys-001": { discovered: true } }), true);
  assert.equal(systemVisible(fog, "missing", {}), false);
});

test("11A: difficulty is distance guidance with variation, and authored tiers win", () => {
  const world = fresh();
  assert.equal(world.systemsById.meridian.tier, GALAXY.difficulty.base);
  const near = world.systems.filter(s => systemDistance(world, "meridian", s.id) < 300);
  const far = world.systems.filter(s => systemDistance(world, "meridian", s.id) > 900);
  const avg = list => list.reduce((n, s) => n + s.tier, 0) / list.length;
  assert.ok(avg(far) > avg(near), "distant systems are generally harder");
  const easy = fresh(GALAXY.seed, {}, { places: { "sys-004": { tier: 1 } } });
  assert.equal(easy.systemsById["sys-004"].tier, 1, "far content may stay easy");
});

test("11A: tuning can change system count and degree cap without engine edits", () => {
  const world = fresh(GALAXY.seed, { systemCount: 30, graph: { maxNeighbors: 3, extraChance: 0.8, extraRange: 500 } });
  assert.equal(world.systems.length, 30);
  assert.ok([...systemDegrees(world).values()].every(d => d <= 3));
  assert.throws(() => fresh(GALAXY.seed, { systemCount: 10, graph: { maxNeighbors: 1 } }), /at least 2/);
  assert.throws(() => validateTuning({ ...GALAXY, systemCount: 0 }), /systemCount/);
});

test("11A: generation does not mutate authored place tables or default overrides", () => {
  const placesBefore = JSON.stringify(PLACES);
  const linksBefore = JSON.stringify(PLACE_LINKS);
  const overridesBefore = JSON.stringify(GALAXY_OVERRIDES);
  fresh(GALAXY.seed, {}, { places: { "sys-004": { pos: [1, 2] } }, removedPlaces: ["hollow"] });
  assert.equal(JSON.stringify(PLACES), placesBefore);
  assert.equal(JSON.stringify(PLACE_LINKS), linksBefore);
  assert.equal(JSON.stringify(GALAXY_OVERRIDES), overridesBefore);
});

test("11A: travel is free; route-only systems still refuse closed/unknown routes", () => {
  const world = fresh();
  const quote = travelQuote(world, "reach", "hollow");
  assert.equal(quote.ok, true);
  assert.deepEqual(quote.cost, {});
  assert.equal(quote.mode, "warp");
  // Closing an optional internal link does not close an open-world system.
  world.links["reach-hollow"].enabled = false;
  assert.equal(canTravel(world, "reach", "hollow"), true);
  world.systemsById.meridian.intraSystem = "links";
  assert.equal(canTravel(world, "reach", "hollow"), false);
  assert.match(travelQuote(world, "reach", "hollow").reason, /closed/);
  assert.equal(canTravel(world, "reach", "missing"), false);
  assert.equal(canTravel(world, "reach", "reach"), false);
});

test("11A: free local warp needs no internal link, but never bypasses a gate", () => {
  const world = fresh();
  assert.equal(world.travel.intraSystem, "free");
  assert.ok(world.systems.every(s => s.intraSystem === "free"));
  const gate = Object.values(world.pockets).find(p => p.parent === "meridian" && p.role === "gate");
  const external = Object.values(world.links).find(l => l.kind === "gate" && (l.a === gate.id || l.b === gate.id));
  const peer = external.a === gate.id ? external.b : external.a;
  assert.equal(Object.values(world.links).some(l => l.kind === "internal" &&
    ((l.a === "hollow" && l.b === gate.id) || (l.a === gate.id && l.b === "hollow"))), false);
  const quote = travelQuote(world, "hollow", gate.id);
  assert.equal(quote.ok, true);
  assert.equal(quote.link, null);
  assert.equal(quote.mode, "warp");
  assert.deepEqual(quote.cost, {});
  const warpMode = TRAVEL_MODES.warp;
  delete TRAVEL_MODES.warp;
  assert.match(travelQuote(world, "hollow", gate.id).reason, /Unknown travel mode/);
  TRAVEL_MODES.warp = warpMode;
  assert.deepEqual(findRoute(world, "hollow", gate.id), ["hollow", gate.id]);
  const options = travelOptions(world, "hollow");
  assert.equal(options.length, pocketsInSystem(world, "meridian").length - 1);
  assert.equal(new Set(options.map(o => o.to)).size, options.length);
  assert.ok(options.every(o => o.ok && world.pockets[o.to].parent === "meridian"));
  assert.ok(!options.some(o => o.to === peer));
  assert.equal(canTravel(world, "hollow", peer), false);
  assert.equal(canTravel(world, gate.id, peer), true);
  external.enabled = false;
  assert.match(travelQuote(world, gate.id, peer).reason, /closed/);
  assert.equal(canTravel(world, gate.id, peer), false);
  const detour = findRoute(world, "hollow", peer);
  assert.ok(!detour || detour.length > 2, "if a detour exists it cannot use the closed gate");
  assert.ok(!detour || detour.every((id, i) => i === 0 || canTravel(world, detour[i - 1], id)));
  // Free hops do not inherit an optional link's future cost or requirements.
  const local = world.links["reach-hollow"];
  local.cost = { fuel: 7 };
  local.requires = [{ type: "test-free-local" }];
  TRAVEL_REQUIREMENTS["test-free-local"] = () => "Optional route is unavailable.";
  try {
    assert.deepEqual(travelQuote(world, "reach", "hollow").cost, {});
    assert.equal(canTravel(world, "reach", "hollow"), true);
    world.systemsById.meridian.intraSystem = "links";
    assert.equal(canTravel(world, "reach", "hollow"), false);
    assert.deepEqual(travelQuote(world, "reach", "hollow").cost, {});
  } finally {
    delete TRAVEL_REQUIREMENTS["test-free-local"];
  }
});

test("11A: a route-only instance is a data opt-out and validates its internal connectivity", () => {
  const overrides = {
    places: {
      meridian: { intraSystem: "links" },
      "test-isolated": { kind: "pocket", parent: "meridian", def: "empty", n: "Isolated annex", d: "Route-only test." },
    },
  };
  assert.throws(() => fresh(GALAXY.seed, {}, overrides), /test-isolated is unreachable/);
  overrides.links = { "test-annex-route": {
    kind: "internal", a: "hollow", b: "test-isolated", mode: "warp", cost: {}, requires: [], enabled: true,
  } };
  const world = fresh(GALAXY.seed, {}, overrides);
  assert.equal(intraSystemPolicy(world, "meridian"), "links");
  assert.equal(intraSystemPolicy(world, "sys-001"), "free", "the opt-out is per system");
  assert.equal(canTravel(world, "reach", "test-isolated"), false);
  assert.deepEqual(findRoute(world, "reach", "test-isolated"), ["reach", "hollow", "test-isolated"]);
  world.links["test-annex-route"].enabled = false;
  assert.equal(findRoute(world, "reach", "test-isolated"), null);
  assert.match(validateGalaxy(world).join("\n"), /test-isolated is unreachable/);
  world.links["test-annex-route"].enabled = true;
  world.systemsById.meridian.intraSystem = "free";
  assert.deepEqual(validateGalaxy(world), [], "free systems need no internal link to an annex");
  assert.deepEqual(findRoute(world, "reach", "test-isolated"), ["reach", "test-isolated"]);
  const legacy = { pocketsById: { a: { id: "a", parent: "x" }, b: { id: "b", parent: "x" } }, pockets: {}, links: {} };
  assert.equal(intraSystemPolicy(legacy, "x"), "free");
  assert.equal(canTravel(legacy, "a", "b"), true);
});

test("11A: core kinds/names are seeded visual data with tuning and author overrides", () => {
  const world = fresh();
  assert.equal(GALAXY.systemMap.blackHoleChance, 0.05);
  assert.deepEqual(world.systemsById.meridian.core, { kind: "star", n: "Meridian" });
  assert.deepEqual(world.systemsById["sys-001"].core, { kind: "blackHole", n: "Duskdrift" });
  assert.ok(world.systems.every(s => ["star", "blackHole"].includes(s.core.kind) && s.core.n));
  assert.ok(world.systems.some(s => s.core.kind === "blackHole"));
  assert.ok(world.systems.filter(s => s.core.kind === "blackHole").length < world.systems.length / 2);
  assert.equal(systemCoreName({ n: "Meridian SYSTEM" }), "Meridian");
  assert.equal(systemCoreName({ n: "System" }), "System");
  const stars = fresh(GALAXY.seed, { systemMap: { blackHoleChance: 0 } });
  const holes = fresh(GALAXY.seed, { systemMap: { blackHoleChance: 1 } });
  assert.ok(stars.systems.every(s => s.core.kind === "star"));
  assert.ok(holes.systems.every(s => s.core.kind === "blackHole"));
  assert.deepEqual(holes.systems.map(s => ({ id: s.id, pos: s.pos })), stars.systems.map(s => ({ id: s.id, pos: s.pos })));
  assert.deepEqual(Object.keys(holes.links), Object.keys(stars.links));
  const authored = fresh(GALAXY.seed, {}, { places: { meridian: { core: { kind: "blackHole", n: "The Lantern" } } } });
  assert.deepEqual(authored.systemsById.meridian.core, { kind: "blackHole", n: "The Lantern" });
  assert.deepEqual(authored.systemsById["sys-001"].core, world.systemsById["sys-001"].core);
  const reordered = fresh();
  reordered.systems.reverse();
  assignCores(reordered, GALAXY);
  assert.deepEqual(reordered.systems.map(s => s.core).reverse(), world.systems.map(s => s.core));
  assert.equal(world.pockets.meridian, undefined, "the core is not a pocket");
  assert.equal(canTravel(world, "reach", "meridian"), false);
});

test("11A: invalid travel policies, core kinds and presentation tuning fail plainly", () => {
  assert.throws(() => fresh(GALAXY.seed, { travel: { intraSystem: "anything" } }), /travel.intraSystem/);
  assert.throws(() => fresh(GALAXY.seed, {}, { places: { meridian: { intraSystem: "toll" } } }), /intraSystem/);
  assert.throws(() => fresh(GALAXY.seed, {}, { places: { meridian: { core: { kind: "planet" } } } }), /core.kind/);
  for (const blackHoleChance of [-0.1, 1.1, NaN]) {
    assert.throws(() => validateTuning({ ...GALAXY, systemMap: { ...GALAXY.systemMap, blackHoleChance } }), /blackHoleChance/);
  }
  assert.throws(() => validateTuning({ ...GALAXY, map: { ...GALAXY.map, panSpeed: 0 } }), /panSpeed/);
  for (const key of ["ordinaryRadius", "gateRadius", "coreRadius", "blackHoleRadius", "coreLabelOffset", "coreLabelLineHeight", "labelGap"]) {
    assert.throws(() => validateTuning({ ...GALAXY, systemMap: { ...GALAXY.systemMap, [key]: 0 } }), new RegExp(key));
  }
});

test("11A: the organic generator itself is a pure function of seed, tuning and rng", () => {
  const tuning = { ...GALAXY, systemCount: 20 };
  const a = organicWeb(7, tuning, makeRng(7));
  const b = organicWeb(7, tuning, makeRng(7));
  assert.deepEqual(a, b);
});
