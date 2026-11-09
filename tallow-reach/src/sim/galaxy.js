// Pure starmap generation and author overrides (refactor step 11A).
//
// A resolved galaxy is plain data:
//   { seed, generator, systems, pockets, links, systemsById, pocketsById }
// Systems own 2D positions; pockets keep the step-10 place shape; links are
// explicit pocket-to-pocket routes. Generation never mutates PLACES and never
// touches runtime state, so the same seed can be regenerated on load or a host.
//
// To replace the layout algorithm, register another function with the same
// `(seed, tuning, rng)` contract and name it in data/galaxy.js. Map/travel code
// consumes the resolved records and does not know which generator made them.

import { GALAXY, GALAXY_OVERRIDES, SYSTEM_NAME_PARTS } from "../data/galaxy.js";
import { PLACES, PLACE_LINKS, PLACE_DEFS, DEFAULT_PLACE } from "../data/places.js";
import { makeRng } from "../util/rng.js";

const clone = value => JSON.parse(JSON.stringify(value));
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

/** Registry of layout algorithms. A generator returns { systems, pockets, links }. */
export const GALAXY_GENERATORS = {
  "organic-web-v1": organicWeb,
};

/** Generate, apply author edits, derive advisory tiers, and validate. */
export function generateGalaxy(seed = GALAXY.seed, tuning = GALAXY, overrides = GALAXY_OVERRIDES) {
  const config = mergeTuning(GALAXY, tuning);
  validateTuning(config);
  const generator = GALAXY_GENERATORS[config.generator];
  if (typeof generator !== "function") throw new Error(`Unknown galaxy generator "${config.generator}"`);
  const world = generator(seed >>> 0, config, makeRng(seed));
  world.visibility = clone(config.visibility);
  applyOverrides(world, overrides);
  pruneDanglingLinks(world);
  assignTiers(world, config, makeRng((seed >>> 0) ^ 0x9e3779b9));
  index(world);
  const errors = validateGalaxy(world);
  if (errors.length) throw new Error(`Invalid galaxy:\n- ${errors.join("\n- ")}`);
  return world;
}

/** Generation settings are data, but impossible settings fail before play. */
export function validateTuning(tuning) {
  const count = tuning.systemCount;
  const max = tuning.graph.maxNeighbors;
  if (!Number.isInteger(count) || count < 1) throw new Error("galaxy.systemCount must be a whole number of at least 1");
  if (!Number.isInteger(max) || max < 1) throw new Error("galaxy.graph.maxNeighbors must be a whole number of at least 1");
  if (count > 2 && max < 2) throw new Error("galaxy.graph.maxNeighbors must be at least 2 to connect more than two systems");
  if (!(tuning.layout.radius > 0)) throw new Error("galaxy.layout.radius must be positive");
  if (!Number.isInteger(tuning.layout.candidates) || tuning.layout.candidates < 1) {
    throw new Error("galaxy.layout.candidates must be a whole number of at least 1");
  }
  if (!(tuning.graph.extraRange >= 0)) throw new Error("galaxy.graph.extraRange must be zero or more");
  if (!(tuning.graph.extraChance >= 0 && tuning.graph.extraChance <= 1)) {
    throw new Error("galaxy.graph.extraChance must be between 0 and 1");
  }
  if (!Number.isInteger(tuning.difficulty.variation) || tuning.difficulty.variation < 0) {
    throw new Error("galaxy.difficulty.variation must be a whole number of zero or more");
  }
}

/** Merge nested tuning tables without letting an omitted table erase defaults. */
export function mergeTuning(base, patch = {}) {
  const out = clone(base);
  for (const [key, value] of Object.entries(patch || {})) {
    if (value && typeof value === "object" && !Array.isArray(value) &&
        out[key] && typeof out[key] === "object" && !Array.isArray(out[key])) {
      out[key] = mergeTuning(out[key], value);
    } else {
      out[key] = clone(value);
    }
  }
  return out;
}

/**
 * Organic 2D web: scattered systems, a connected nearest-neighbour tree, then
 * short extra links. Degree caps leave dead ends while extras create junctions
 * and alternative routes. Positions are map units, not flight coordinates.
 */
export function organicWeb(seed, tuning, rng) {
  const count = Math.max(1, Math.floor(tuning.systemCount));
  const max = Math.max(1, Math.floor(tuning.graph.maxNeighbors));
  const systems = [];
  const pockets = {};
  const links = {};

  // Hand-authored systems keep their ids and pockets. Meridian is fixed at the
  // origin; any other authored system may supply pos in its record/override.
  const authored = Object.values(PLACES).filter(p => p.kind === "system");
  for (const system of authored) {
    systems.push({ ...clone(system), pos: clone(system.pos || [0, 0]) });
  }
  if (!systems.some(s => s.id === tuning.homeSystem)) {
    throw new Error(`Home system "${tuning.homeSystem}" is missing from PLACES`);
  }
  const home = systems.find(s => s.id === tuning.homeSystem);
  home.pos = [0, 0];

  const names = systemNames(rng, count - systems.length);
  while (systems.length < count) {
    const i = systems.length;
    systems.push({
      id: `sys-${String(i).padStart(3, "0")}`,
      kind: "system",
      n: names[i - authored.length] || `System ${i}`,
      parent: null,
      pos: scatterPoint(systems, tuning.layout, rng),
    });
  }

  for (const system of systems) {
    for (const place of Object.values(PLACES)) {
      if (place.kind === "pocket" && place.parent === system.id) pockets[place.id] = clone(place);
    }
    if (system.id === tuning.homeSystem) continue;
    const hub = `${system.id}-hub`;
    pockets[hub] = emptyPocket(hub, system.id, `${system.n} Expanse`, "Empty space. Nothing out here yet.");
  }
  for (const link of Object.values(PLACE_LINKS)) links[link.id] = clone(link);

  // Connected tree. Each new system attaches to the nearest earlier system with
  // a free slot, so every system is reachable without forcing a grid or cycle.
  const degree = new Map(systems.map(s => [s.id, 0]));
  const systemLinks = [];
  for (let i = 1; i < systems.length; i++) {
    const to = systems[i];
    let best = null;
    for (let j = 0; j < i; j++) {
      const from = systems[j];
      if (degree.get(from.id) >= max) continue;
      const d = distance(from.pos, to.pos);
      if (!best || d < best.d) best = { from, d };
    }
    // With max >= 2 and a tree, a free slot always exists among earlier nodes.
    if (!best) throw new Error("Galaxy generation could not connect every system; raise graph.maxNeighbors");
    connectSystems(best.from, to, pockets, links, systemLinks, degree, tuning);
  }

  // A few short extra edges create loops/alternative routes. Candidate order is
  // seeded, and both endpoints must have room under the same degree cap.
  const candidates = [];
  for (let i = 0; i < systems.length; i++) {
    for (let j = i + 1; j < systems.length; j++) {
      const a = systems[i], b = systems[j];
      if (systemLinks.some(l => (l.a === a.id && l.b === b.id) || (l.a === b.id && l.b === a.id))) continue;
      const d = distance(a.pos, b.pos);
      if (d <= tuning.graph.extraRange) candidates.push({ a, b, d, roll: rng() });
    }
  }
  candidates.sort((a, b) => (a.d - a.roll * tuning.graph.extraRange * 0.25) - (b.d - b.roll * tuning.graph.extraRange * 0.25));
  for (const c of candidates) {
    if (c.roll >= tuning.graph.extraChance) continue;
    if (degree.get(c.a.id) >= max || degree.get(c.b.id) >= max) continue;
    connectSystems(c.a, c.b, pockets, links, systemLinks, degree, tuning);
  }

  return { seed: seed >>> 0, generator: tuning.generator, systems, pockets, links };
}

function connectSystems(a, b, pockets, links, systemLinks, degree, tuning) {
  const gateA = `${a.id}-gate-${b.id}`;
  const gateB = `${b.id}-gate-${a.id}`;
  pockets[gateA] = emptyPocket(gateA, a.id, `Gate to ${b.n}`, `The ${b.n} gate pocket. Empty space beyond the gate.`, "gate");
  pockets[gateB] = emptyPocket(gateB, b.id, `Gate to ${a.n}`, `The ${a.n} gate pocket. Empty space beyond the gate.`, "gate");
  const hubA = a.id === tuning.homeSystem ? DEFAULT_PLACE : `${a.id}-hub`;
  const hubB = b.id === tuning.homeSystem ? DEFAULT_PLACE : `${b.id}-hub`;
  addLink(links, `${gateA}-inner`, "internal", hubA, gateA, tuning);
  addLink(links, `${gateB}-inner`, "internal", hubB, gateB, tuning);
  addLink(links, `${gateA}__${gateB}`, "gate", gateA, gateB, tuning);
  systemLinks.push({ a: a.id, b: b.id });
  degree.set(a.id, degree.get(a.id) + 1);
  degree.set(b.id, degree.get(b.id) + 1);
}

function emptyPocket(id, parent, n, d, role = null) {
  const pocket = {
    id, kind: "pocket", def: "empty", parent, n, d,
    enter: { kind: "warp", pos: [0, 0, 300] },
    leave: { kind: "warp" },
  };
  if (role) pocket.role = role;
  return pocket;
}

function addLink(links, id, kind, a, b, tuning) {
  links[id] = {
    id, kind, a, b,
    mode: tuning.travel.mode,
    cost: clone(tuning.travel.cost),
    requires: clone(tuning.travel.requires),
    enabled: true,
  };
}

/** Best-candidate scattering gives uneven spacing without a lattice. */
function scatterPoint(existing, layout, rng) {
  let best = null;
  for (let i = 0; i < Math.max(1, layout.candidates); i++) {
    const angle = rng() * Math.PI * 2;
    const radius = Math.sqrt(rng()) * layout.radius;
    const pos = [Math.cos(angle) * radius, Math.sin(angle) * radius];
    const nearest = existing.length ? Math.min(...existing.map(s => distance(pos, s.pos))) : Infinity;
    if (!best || nearest > best.nearest) best = { pos, nearest };
  }
  return best.pos.map(v => Math.round(v * 1000) / 1000);
}

function systemNames(rng, count) {
  const names = [];
  for (const prefix of SYSTEM_NAME_PARTS.prefixes) {
    for (const suffix of SYSTEM_NAME_PARTS.suffixes) names.push(`${prefix}${suffix}`);
  }
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [names[i], names[j]] = [names[j], names[i]];
  }
  return names.slice(0, Math.max(0, count));
}

/** Apply author patches/tombstones by stable id. No generator code changes needed.
 *  A patch for a new id must carry `kind: "system"` or `kind: "pocket"`; existing
 *  ids are merged, so moving a system or promoting a pocket is a small data edit. */
export function applyOverrides(world, overrides = {}) {
  for (const [id, patch] of Object.entries(overrides.places || {})) {
    const system = world.systems.find(s => s.id === id);
    if (system) Object.assign(system, clone(patch));
    else if (hasOwn(world.pockets, id)) Object.assign(world.pockets[id], clone(patch));
    else if (patch && patch.kind === "system") world.systems.push({ ...clone(patch), id });
    else if (patch && patch.kind === "pocket") world.pockets[id] = { ...clone(patch), id };
    else throw new Error(`Galaxy override "${id}" names no place; give a new place a kind`);
  }
  for (const [id, patch] of Object.entries(overrides.links || {})) {
    world.links[id] = { ...(world.links[id] || { id, enabled: true }), ...clone(patch), id };
  }
  for (const id of overrides.removedPlaces || []) {
    delete world.pockets[id];
    world.systems = world.systems.filter(s => s.id !== id);
  }
  for (const id of overrides.removedLinks || []) delete world.links[id];
}

/** Deleting a pocket deletes every route that names it. */
export function pruneDanglingLinks(world) {
  for (const [id, link] of Object.entries(world.links)) {
    if (!hasOwn(world.pockets, link.a) || !hasOwn(world.pockets, link.b)) delete world.links[id];
  }
}

/** Distance guidance with bounded seeded variation; authored tier always wins. */
export function assignTiers(world, tuning, rng) {
  const home = world.systems.find(s => s.id === tuning.homeSystem);
  const origin = home ? home.pos : [0, 0];
  for (const system of world.systems) {
    if (Number.isFinite(system.tier)) continue;
    if (system.id === tuning.homeSystem) { system.tier = Math.max(1, Math.round(tuning.difficulty.base)); continue; }
    const vary = Math.floor(rng() * (tuning.difficulty.variation * 2 + 1)) - tuning.difficulty.variation;
    system.tier = Math.max(1, Math.round(tuning.difficulty.base + distance(system.pos, origin) * tuning.difficulty.perDistance + vary));
  }
}

function index(world) {
  world.systemsById = Object.fromEntries(world.systems.map(s => [s.id, s]));
  world.pocketsById = world.pockets;
}

/** Plain-language validation errors; generation throws rather than shipping a broken web. */
export function validateGalaxy(world) {
  const errors = [];
  const systems = new Set(world.systems.map(s => s.id));
  if (systems.size !== world.systems.length) errors.push("system ids must be unique");
  for (const system of world.systems) {
    if (!Array.isArray(system.pos) || system.pos.length !== 2 || !system.pos.every(Number.isFinite)) {
      errors.push(`system ${system.id} needs a finite 2D pos`);
    }
  }
  for (const [id, pocket] of Object.entries(world.pockets)) {
    if (pocket.id !== id) errors.push(`pocket ${id} carries mismatched id ${pocket.id}`);
    if (!systems.has(pocket.parent)) errors.push(`pocket ${id} names missing system ${pocket.parent}`);
    if (!PLACE_DEFS[pocket.def]) errors.push(`pocket ${id} names missing definition ${pocket.def}`);
  }
  for (const system of world.systems) {
    if (!Object.values(world.pockets).some(p => p.parent === system.id)) {
      errors.push(`system ${system.id} has no pockets and cannot be visited`);
    }
  }
  const external = new Map();
  for (const [id, link] of Object.entries(world.links)) {
    if (link.id !== id) errors.push(`link ${id} carries mismatched id ${link.id}`);
    const a = world.pockets[link.a], b = world.pockets[link.b];
    if (!a || !b) { errors.push(`link ${link.id} names a missing pocket`); continue; }
    if (!["internal", "gate"].includes(link.kind)) errors.push(`link ${link.id} has unknown kind ${link.kind}`);
    if (link.kind === "internal") {
      if (a.parent !== b.parent) errors.push(`internal link ${link.id} crosses systems`);
      if (a.role === "gate" && b.role === "gate") errors.push(`internal link ${link.id} joins two gate pockets; a gate has one gate peer`);
    }
    if (link.kind === "gate") {
      if (a.parent === b.parent) errors.push(`gate link ${link.id} stays inside one system`);
      if (a.role !== "gate" || b.role !== "gate") errors.push(`gate link ${link.id} needs gate-role pockets at both ends`);
      external.set(a.id, (external.get(a.id) || 0) + 1);
      external.set(b.id, (external.get(b.id) || 0) + 1);
    }
  }
  for (const pocket of Object.values(world.pockets)) {
    const n = external.get(pocket.id) || 0;
    if (pocket.role === "gate" && n !== 1) errors.push(`gate pocket ${pocket.id} has ${n} external links; it needs exactly one`);
    if (pocket.role !== "gate" && n > 0) errors.push(`ordinary pocket ${pocket.id} has an external gate link`);
  }
  // Every pocket must be reachable from the starting pocket through explicit links.
  if (world.pockets[DEFAULT_PLACE]) {
    const seen = new Set([DEFAULT_PLACE]);
    const queue = [DEFAULT_PLACE];
    while (queue.length) {
      const id = queue.shift();
      for (const link of Object.values(world.links)) {
        if (link.enabled === false) continue;
        const next = link.a === id ? link.b : link.b === id ? link.a : null;
        if (next && !seen.has(next)) { seen.add(next); queue.push(next); }
      }
    }
    for (const id of Object.keys(world.pockets)) if (!seen.has(id)) errors.push(`pocket ${id} is unreachable from ${DEFAULT_PLACE}`);
  } else errors.push(`starting pocket ${DEFAULT_PLACE} is missing`);
  return errors;
}

/** Configurable map knowledge. Step 11A ships "all"; fog can be added here later. */
export const VISIBILITY_POLICIES = {
  all: () => true,
  discovered: (system, knowledge) => !!knowledge?.[system.id]?.discovered,
};

export function systemVisible(world, systemId, knowledge = {}, mode = world.visibility?.mode || GALAXY.visibility.mode) {
  const system = world.systemsById?.[systemId] || world.systems.find(s => s.id === systemId);
  if (!system) return false;
  const policy = VISIBILITY_POLICIES[mode];
  return policy ? !!policy(system, knowledge) : false;
}

export const pocketsInSystem = (world, systemId) =>
  Object.values(world.pockets).filter(p => p.parent === systemId);

export const linksFrom = (world, pocketId) =>
  Object.values(world.links).filter(l => l.enabled !== false && (l.a === pocketId || l.b === pocketId));

export const neighborOf = (link, pocketId) => link.a === pocketId ? link.b : link.b === pocketId ? link.a : null;

export function systemDistance(world, a, b) {
  const sa = world.systemsById?.[a] || world.systems.find(s => s.id === a);
  const sb = world.systemsById?.[b] || world.systems.find(s => s.id === b);
  return sa && sb ? distance(sa.pos, sb.pos) : Infinity;
}

function distance(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
