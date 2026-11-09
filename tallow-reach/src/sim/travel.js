// Pure travel rules (refactor step 11A). The map UI asks this module what is
// reachable; the warp sequence will ask it again before starting in step 11B.
// It reads resolved galaxy data only — no runtime state, UI, input or audio.
//
// A route is usable when it is enabled, directly connects the two pockets, its
// transport mode is registered, and every data requirement passes. Costs are
// returned as plain data for the caller to charge; today every cost is empty.
// This module deliberately imports no other system: callers pass the resolved
// galaxy record in, and future UI/network callers use the same pure contract.

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

/** Explain one proposed pocket-to-pocket trip without changing anything. */
export function travelQuote(world, from, to, context = {}) {
  const deny = reason => ({ ok: false, reason, link: null, mode: null, cost: {} });
  if (!world.pocketsById?.[from]) return deny("Unknown departure pocket.");
  if (!world.pocketsById?.[to]) return deny("Unknown destination pocket.");
  if (from === to) return deny("You are already in that pocket.");
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

/** Every direct destination with its quote, for a pocket chooser. */
export function travelOptions(world, from, context = {}) {
  return linksFrom(world, from).map(link => {
    const to = neighborOf(link, from);
    return { to, ...travelQuote(world, from, to, context) };
  });
}

/** Breadth-first route ids, or null. The map may show a route; travel still only
 *  starts one direct hop at a time. Builds one adjacency index per search. */
export function findRoute(world, from, to, context = {}) {
  if (!world.pocketsById?.[from] || !world.pocketsById?.[to]) return null;
  if (from === to) return [from];
  const adjacency = new Map();
  for (const link of Object.values(world.links || {})) {
    if (link.enabled === false) continue;
    if (!adjacency.has(link.a)) adjacency.set(link.a, []);
    if (!adjacency.has(link.b)) adjacency.set(link.b, []);
    adjacency.get(link.a).push({ to: link.b, link });
    adjacency.get(link.b).push({ to: link.a, link });
  }
  const previous = new Map([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const id = queue.shift();
    for (const { to: next, link } of adjacency.get(id) || []) {
      if (previous.has(next) || !quoteLink(link, id, next, context).ok) continue;
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
