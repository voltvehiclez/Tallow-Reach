// Chart-only geometry. Connections remain explicit gate links; this routes
// their polylines around unrelated system dots without changing saved places.

/** Squared distance from p to the finite segment a--b. */
export function segmentDistanceSquared(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
  return (p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dy) ** 2;
}

/** Route a straight or bent polyline around screen-sized dots. Coordinates use
 *  SVG's inverted Y. When two dots physically overlap, no line can avoid both;
 *  such an obstacle is ignored until zooming in separates the dots. */
export function routeSystemEdge(a, b, systems, radius) {
  const start = [a.pos[0], -a.pos[1]], end = [b.pos[0], -b.pos[1]];
  const r2 = radius * radius;
  const obstacles = systems.filter(s => s.id !== a.id && s.id !== b.id)
    .map(s => [s.pos[0], -s.pos[1]])
    .filter(p => segmentDistanceSquared(p, start, start) > r2 && segmentDistanceSquared(p, end, end) > r2);
  const clear = (x, y) => obstacles.every(p => segmentDistanceSquared(p, x, y) >= r2 - 1e-7);
  if (clear(start, end)) return [start, end];
  const pad = radius * 5;
  const near = obstacles.filter(p => p[0] >= Math.min(start[0], end[0]) - pad && p[0] <= Math.max(start[0], end[0]) + pad &&
    p[1] >= Math.min(start[1], end[1]) - pad && p[1] <= Math.max(start[1], end[1]) + pad);
  const points = [start, end];
  for (const p of near) for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    const candidate = [p[0] + radius * 1.3 * Math.cos(angle), p[1] + radius * 1.3 * Math.sin(angle)];
    if (obstacles.every(other => segmentDistanceSquared(other, candidate, candidate) >= r2 - 1e-7)) points.push(candidate);
  }
  const dist = Array(points.length).fill(Infinity), prev = Array(points.length).fill(-1), done = new Set();
  dist[0] = 0;
  while (done.size < points.length) {
    let at = -1;
    for (let i = 0; i < points.length; i++) if (!done.has(i) && (at < 0 || dist[i] < dist[at])) at = i;
    if (at < 0 || !Number.isFinite(dist[at])) break;
    if (at === 1) {
      const path = [];
      for (let i = 1; i !== -1; i = prev[i]) path.push(points[i]);
      return path.reverse();
    }
    done.add(at);
    for (let i = 0; i < points.length; i++) {
      if (done.has(i)) continue;
      const d = Math.hypot(points[i][0] - points[at][0], points[i][1] - points[at][1]);
      if (dist[at] + d < dist[i] && clear(points[at], points[i])) { dist[i] = dist[at] + d; prev[i] = at; }
    }
  }
  // Extreme zoom can overlap chart dots so that a non-overlapping path is
  // geometrically impossible; the dot fill still covers the line in that case.
  return [start, end];
}

export const svgEdgePath = points => points.map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join(" ");
