// Presentation-only galaxy layout. Simulation positions, graph and saves are
// never changed; this places chart dots away from unrelated straight edges.

/** Squared distance from p to the finite segment a--b. */
export function segmentDistanceSquared(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
  return (p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dy) ** 2;
}

/** Only unrelated dots can mask a straight edge; endpoints stay connected. */
export function straightEdgeBlockers(a, b, systems, radiusFor) {
  const start = [a.pos[0], -a.pos[1]], end = [b.pos[0], -b.pos[1]];
  return systems.filter(s => s.id !== a.id && s.id !== b.id).map(s => ({ system: s, radius: radiusFor(s) }))
    .filter(({ system, radius }) => segmentDistanceSquared([system.pos[0], -system.pos[1]], start, end) < radius * radius);
}

const cache = new WeakMap();
const projected = new WeakSet();

/** Stable visual-only positions with straight connections. The iterative layout
 *  preserves the overall scatter while nudging unrelated dots clear of edges.
 *  It is cached per world and recalculated when positions or gate links change. */
export function chartGalaxy(world) {
  if (!world || projected.has(world) || !world.systemsById || !world.pocketsById) return world;
  // Keep closed gates in the layout so toggling one does not rearrange the map.
  const gates = Object.values(world.links || {}).filter(l => l.kind === "gate")
    .map(l => [world.pocketsById[l.a]?.parent, world.pocketsById[l.b]?.parent])
    .filter(([a, b]) => a && b && a !== b);
  const signature = JSON.stringify([world.systems.map(s => [s.id, ...s.pos]), gates]);
  const old = cache.get(world);
  if (old?.signature === signature) return old.value;
  // Keep non-geometric fields live (e.g. a policy change) while owning only
  // the visual position. Neither the original record nor its position mutates.
  const systems = world.systems.map(s => Object.assign(Object.create(s), { pos: [...s.pos] }));
  const byId = Object.fromEntries(systems.map(s => [s.id, s]));
  const xs = systems.map(s => s.pos[0]), ys = systems.map(s => s.pos[1]);
  const extent = systems.length ? Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) : 0;
  const clearance = Math.max(1, extent * 0.033);
  for (let pass = 0; pass < 250; pass++) {
    let overlaps = 0;
    for (const [aId, bId] of gates) {
      const a = byId[aId]?.pos, b = byId[bId]?.pos;
      if (!a || !b) continue;
      const dx = b[0] - a[0], dy = b[1] - a[1], len = dx * dx + dy * dy;
      if (!len) continue;
      for (const system of systems) {
        if (system.id === aId || system.id === bId) continue;
        const p = system.pos;
        const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len));
        let vx = p[0] - (a[0] + t * dx), vy = p[1] - (a[1] + t * dy), d = Math.hypot(vx, vy);
        if (d >= clearance) continue;
        overlaps++;
        if (d < 1e-9) { vx = -dy; vy = dx; d = Math.hypot(vx, vy); }
        const step = (clearance - d) * 0.75 + clearance * 0.001;
        p[0] += step * vx / d; p[1] += step * vy / d;
      }
    }
    if (!overlaps) break;
  }
  const value = { ...world, systems, systemsById: byId };
  projected.add(value);
  cache.set(world, { signature, value });
  return value;
}
