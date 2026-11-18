// Target lock (F). First surface under the camera reticle, then angular assistance: hostiles,
// rocks, crates, the outpost, and — since step 14 — a rift door, the way out of
// a run and its prize canister. F switches to a new candidate, or releases the
// same candidate / an old lock when the view has no candidate.

import { segmentRockHit } from "./colliders.js";
import { clamp } from "../util/math.js";
import { itemName } from "../data/items.js";
import { featureOf, featureById } from "../data/places.js";
import { state, msg, placeWorld } from "../state/state.js";
import { V } from "../util/math.js";
import { enemyPos } from "./enemy.js";
import { playerPos, playerFwd } from "./pilot.js";

/**
 * A lock is { k, o }: k is "e" hostile, "a" asteroid, "c" crate, "s" station, "r" rift door,
 * "g" the way out of a run, "k" a run's prize canister. o is the world object (null for the station).
 */
export function toggleLock(P = state.player, surfaceHit = undefined) {
  const F = P.flight,
    W = placeWorld(P.place || state.place);
  const notify = text => { if (P === state.player) msg(text, 1.5); };
  const previous = F.lock;

  const renderedRay = P === state.player && state.aimOrigin;
  const f = renderedRay ? V(state.aimDirection.x, state.aimDirection.y, state.aimDirection.z).normalize() : playerFwd(P),
    pp = renderedRay ? V(state.aimOrigin.x, state.aimOrigin.y, state.aimOrigin.z) : playerPos(P);
  let firstHit = null, firstDistance = Infinity;
  let best = null,
    bestScore = 0.45;

  // A real surface under the reticle beats angular assistance. Rank hits by depth, not size.
  const test = (k, o, p, radius) => {
    const q = p.clone().sub(pp),
      d = q.length(),
      score = Math.acos(clamp(q.dot(f) / d, -1, 1)) - Math.atan(radius / d);
    const along = q.dot(f), sideSq = Math.max(0, d * d - along * along);
    let distance = Infinity;
    const matchesSurface = surfaceHit?.k === k && (k === "s"
      ? surfaceHit.o.place === o.place && surfaceHit.o.feature === o.feature : surfaceHit.o === o);
    if (matchesSurface) { firstHit = { k, o }; firstDistance = -1; }
    // Browser supplies exact rendered geometry for every kind. Headless pilots retain sim proxies.
    if (surfaceHit !== undefined) {
      // A miss must not manufacture a sphere hit; angular assistance below is still available.
    } else if (k === "a") {
      // The same transformed triangles used by projectiles, including GLBs and nonuniform rocks.
      const length = d + radius * 2 + 1;
      const hit = segmentRockHit(o, pp, pp.clone().addScaledVector(f, length));
      if (hit) distance = hit.t * length;
    } else if (along >= 0 && sideSq <= radius * radius) {
      distance = Math.max(0, along - Math.sqrt(radius * radius - sideSq));
    }
    if (distance < firstDistance) { firstDistance = distance; firstHit = { k, o }; }
    if (along > 0 && score < bestScore) {
      bestScore = score;
      best = { k, o };
    }
  };
  for (const e of W.enemies) test("e", e, enemyPos(e), 8);
  for (const a of W.asteroids) test("a", a, a.pos, a.r);
  for (const c of W.crates) test("c", c, c.pos, 4);
  // Step 14: a rift door, the way out of a run and its prize canister are objects in the world like
  // anything else, so they lock the same way — and a pilot can always find the way in and out.
  for (const r of W.rifts || []) if (r && !r.gone) test("r", r, r.pos, Math.max(8, Number(r.r) || 20));
  for (const g of W.gates || []) if (g) test("g", g, g.pos, Math.max(8, Number(g.r) || 20));
  for (const k of W.caches || []) if (k) test("k", k, k.pos, Math.max(6, Number(k.r) || 9));
  const placeId = P.place || state.place;
  const station = featureOf(placeId, "station");
  if (station) test("s", { place: placeId, feature: station.id }, V(...station.pos), 100);

  best = firstHit || best;
  const same = best && previous && best.k === previous.k &&
    (best.k === "s" ? best.o.place === previous.o.place && best.o.feature === previous.o.feature : best.o === previous.o);
  F.lock = same || !best ? null : best;
  if (!F.lock && previous) notify("Target released");
  else if (!best) notify("No object to lock");
}

/** Current world position of a lock target. */
export function lockPosition(lock) {
  if (lock.k === "s") {
    const f = featureById(lock.o.place, lock.o.feature);
    return V(...f.pos);
  }
  return lock.k === "e" ? enemyPos(lock.o) : lock.o.pos;
}

/** Label shown on the lock marker. */
export function lockName(lock) {
  if (lock.k === "e") return lock.o.n || "hostile";
  if (lock.k === "a") return itemName(lock.o.type) + " rock, " + Math.ceil(lock.o.ore) + " left";
  if (lock.k === "c") return lock.o.item === "core" ? "reactor core" : "crate";
  if (lock.k === "r") return lock.o.dest || lock.o.n || "Rift";
  if (lock.k === "g") return lock.o.locked ? `${lock.o.n} (sealed)` : `${lock.o.n} (open)`;
  if (lock.k === "k") return lock.o.locked ? `${lock.o.n} (locked)` : `${lock.o.n} (open)`;
  if (lock.k === "s") {
    const f = featureById(lock.o.place, lock.o.feature);
    return f ? f.n : "Station";
  }
  return "Target";
}


/** Drop the lock if its target has been destroyed or collected. */
export function pruneLock(P = state.player) {
  const F = P.flight,
    W = placeWorld(P.place || state.place),
    L = F.lock;
  if (!L) return;
  if (L.k === "s") {
    if (L.o.place !== (P.place || state.place)) F.lock = null;
    return;
  }
  const list =
    L.k === "e" ? W.enemies
    : L.k === "a" ? W.asteroids
    : L.k === "c" ? W.crates
    : L.k === "r" ? W.rifts
    : L.k === "g" ? W.gates
    : L.k === "k" ? W.caches
    : null;
  if (!list || !list.includes(L.o)) F.lock = null;
}


/** Percentages for compact NPC bars. Current hostiles have no shield pool. */
export function targetHealth(enemy) {
  const percent = (value, max) => Number.isFinite(value) && Number.isFinite(max) && max > 0
    ? Math.round(clamp(value / max, 0, 1) * 100) : 0;
  return { shield: percent(enemy.sh, enemy.maxSh), hull: percent(enemy.hp, enemy.mx) };
}
