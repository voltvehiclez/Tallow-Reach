// Pure travel rules (refactor step 11A). The map UI asks this module what is
// reachable; the warp sequence will ask it again before starting in step 11B.
// It reads resolved galaxy data only — no runtime state, UI, input or audio.
//
// Open-world systems default to free intra-system warp: any pocket in the same
// system is reachable without an internal route. A system may opt into
// `intraSystem: "links"` (future route-only instances) and then internal routes
// are required again. Cross-system travel always needs an explicit enabled gate
// link whose transport mode is registered and whose data requirements pass.
// Costs are returned as plain data for the caller to charge; today every cost is
// empty. This module deliberately imports no other system: callers pass the
// resolved galaxy record in, and future UI/network callers use the same contract.

/** Transport modes the rules know about. Step 11B wires "warp" to the existing
 *  sequence; a future supercruise mode registers here without changing the map. */
export const TRAVEL_MODES = {
  warp: { id: "warp" },
};

/** Requirement handlers: ({ req, link, from, to, context }) => true | string.
 *  `true` passes; a string explains the refusal. Empty today (no fuel/activation).
 *  A future gate can add e.g. `gate-active` and read context supplied by the sim. */
export const TRAVEL_REQUIREMENTS = {};

const linksFrom = (world, pocketId) =>
  Object.values(world.links || {}).filter(l => l.enabled !== false && (l.a === pocketId || l.b === pocketId));
const neighborOf = (link, pocketId) => link.a === pocketId ? link.b : link.b === pocketId ? link.a : null;
const connects = (l, from, to) => (l.a === from && l.b === to) || (l.a === to && l.b === from);
const directLink = (world, from, to) => {
  const all = Object.values(world.links || {}).filter(l => connects(l, from, to));
  return all.find(l => l.enabled !== false) || all[0];
};

/** Open-world systems default to free intra-system warp. A system record may set
 *  `intraSystem: "links"` to require explicit internal routes again (future
 *  route-only instances). Legacy/headless galaxies without system records also
 *  default to free, so the old authored reach <-> hollow hop still works. */
export function intraSystemPolicy(world, systemId) {
  const system = world?.systemsById?.[systemId] || world?.systems?.find(s => s.id === systemId);
  const policy = system?.intraSystem ?? world?.travel?.intraSystem ?? "free";
  return policy === "links" ? "links" : "free";
}

const sameSystem = (world, from, to) => {
  const a = world.pocketsById?.[from], b = world.pocketsById?.[to];
  return !!(a && b && a.parent && a.parent === b.parent);
};

/** Explain one proposed pocket-to-pocket trip without changing anything. */
export function travelQuote(world, from, to, context = {}) {
  const deny = reason => ({ ok: false, reason, link: null, mode: null, cost: {} });
  if (!world.pocketsById?.[from]) return deny("Unknown departure pocket.");
  if (!world.pocketsById?.[to]) return deny("Unknown destination pocket.");
  if (from === to) return deny("You are already in that pocket.");
  if (sameSystem(world, from, to) && intraSystemPolicy(world, world.pocketsById[from].parent) === "free") {
    const mode = TRAVEL_MODES.warp;
    if (!mode) return deny('Unknown travel mode "warp".');
    return { ok: true, reason: "", link: directLink(world, from, to) || null, mode: mode.id, cost: {} };
  }
  const link = directLink(world, from, to);
  if (!link) return deny("No direct route. Travel through connected pockets first.");
  return quoteLink(link, from, to, context);
}

/** Validate one already-found direct link. Shared by quotes and route search. */
function quoteLink(link, from, to, context = {}) {
  const deny = reason => ({ ok: false, reason, link: null, mode: null, cost: {} });
  if (link.enabled === false) return deny("That route is closed.");
  const mode = TRAVEL_MODES[link.mode];
  if (!mode) return deny(`Unknown travel mode "${link.mode}".`);
  for (const req of link.requires || []) {
    const handler = TRAVEL_REQUIREMENTS[req?.type];
    if (!handler) return deny(`Unknown travel requirement "${req?.type}".`);
    const result = handler({ req, link, from, to, context });
    if (result !== true) return deny(typeof result === "string" ? result : "Travel requirement not met.");
  }
  return { ok: true, reason: "", link, mode: mode.id, cost: { ...(link.cost || {}) } };
}

export const canTravel = (world, from, to, context = {}) => travelQuote(world, from, to, context).ok;

/** Every one-hop destination with its quote: explicit links, plus every other
 *  pocket in the same system when that system allows free intra-system warp. */
export function travelOptions(world, from, context = {}) {
  const options = new Map();
  for (const link of linksFrom(world, from)) {
    const to = neighborOf(link, from);
    if (to && !options.has(to)) options.set(to, { to, ...travelQuote(world, from, to, context) });
  }
  const pocket = world.pocketsById?.[from];
  if (pocket && intraSystemPolicy(world, pocket.parent) === "free") {
    for (const other of Object.values(world.pockets || {})) {
      if (other.parent !== pocket.parent || other.id === from || options.has(other.id)) continue;
      options.set(other.id, { to: other.id, ...travelQuote(world, from, other.id, context) });
    }
  }
  return [...options.values()];
}

/** Breadth-first route ids, or null. The map may show a route; travel still only
 *  starts one direct hop at a time. Free intra-system warp counts as a hop. */
export function findRoute(world, from, to, context = {}) {
  if (!world.pocketsById?.[from] || !world.pocketsById?.[to]) return null;
  if (from === to) return [from];
  const adjacency = new Map();
  const add = (a, b) => {
    if (!adjacency.has(a)) adjacency.set(a, []);
    adjacency.get(a).push(b);
  };
  for (const link of Object.values(world.links || {})) {
    if (link.enabled === false) continue;
    add(link.a, link.b);
    add(link.b, link.a);
  }
  const bySystem = new Map();
  for (const pocket of Object.values(world.pockets || {})) {
    if (!bySystem.has(pocket.parent)) bySystem.set(pocket.parent, []);
    bySystem.get(pocket.parent).push(pocket.id);
  }
  for (const [systemId, ids] of bySystem) {
    if (intraSystemPolicy(world, systemId) !== "free") continue;
    for (const a of ids) for (const b of ids) if (a !== b) add(a, b);
  }
  const previous = new Map([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const id = queue.shift();
    for (const next of adjacency.get(id) || []) {
      if (previous.has(next) || !canTravel(world, id, next, context)) continue;
      previous.set(next, id);
      if (next === to) {
        const route = [to];
        let cursor = id;
        while (cursor !== null) { route.push(cursor); cursor = previous.get(cursor); }
        return route.reverse();
      }
      queue.push(next);
    }
  }
  return null;
}

/** Fewest currently executable warp hops to any pocket in a system. The final
 *  pocket is the arrival gate when entering from another system. Re-evaluate
 *  after every hop; startWarp still requotes before performing any travel. */
export function findRouteToSystem(world, from, systemId, context = {}) {
  if (!world?.pocketsById?.[from] || !world?.systemsById?.[systemId]) return null;
  const neighbors = new Map(), bySystem = new Map();
  const add = (a, b, link) => {
    if (!neighbors.has(a)) neighbors.set(a, new Map());
    if (!neighbors.get(a).has(b)) neighbors.get(a).set(b, link);
  };
  for (const link of Object.values(world.links || {})) {
    if (link.enabled === false) continue;
    add(link.a, link.b, link); add(link.b, link.a, link);
  }
  for (const pocket of Object.values(world.pockets || {})) {
    if (!bySystem.has(pocket.parent)) bySystem.set(pocket.parent, []);
    bySystem.get(pocket.parent).push(pocket.id);
  }
  for (const [system, ids] of bySystem) {
    if (intraSystemPolicy(world, system) !== "free") continue;
    for (const a of ids) for (const b of ids) if (a !== b) add(a, b, null);
  }
  const previous = new Map([[from, null]]), queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    if (world.pocketsById[id]?.parent === systemId) {
      const route = [];
      for (let p = id; p !== null; p = previous.get(p)) route.push(p);
      return route.reverse();
    }
    for (const [to, link] of neighbors.get(id) || []) {
      if (previous.has(to) || !world.pocketsById[to]) continue;
      const localFree = sameSystem(world, id, to) && intraSystemPolicy(world, world.pocketsById[id].parent) === "free";
      const quote = localFree ? { ok: !!TRAVEL_MODES.warp, mode: "warp", cost: {} }
        : link ? quoteLink(link, id, to, context) : { ok: false };
      // startWarp currently supports only free warp, never unhandled costs.
      if (!quote.ok || quote.mode !== "warp" || Object.keys(quote.cost).length) continue;
      previous.set(to, id);
      queue.push(to);
    }
  }
  return null;
}
