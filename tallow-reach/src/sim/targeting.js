// Target lock (F). Locks onto whatever is nearest the crosshair: hostiles,
// rocks, crates or the outpost. Pressing F again releases the lock.

import { fwd, clamp } from "../util/math.js";
import { itemName } from "../data/items.js";
import { sectorAt } from "../data/sectors.js";
import { state, msg } from "../state/state.js";
import { STATION_POS } from "./world.js";
import { enemyPos } from "./enemy.js";

/**
 * A lock is { k, o }: k is "e" hostile, "a" asteroid, "c" crate, "s" station.
 * o is the world object (null for the station).
 */
export function toggleLock() {
  const F = state.flight,
    W = state.world,
    P = state.player;
  if (F.lock) {
    F.lock = null;
    msg("Target released", 1.5);
    return;
  }

  const f = fwd(P.m),
    pp = P.m.position;
  let best = null,
    bestScore = 0.45;

  // Score is the angle off-axis, minus the angular size of the target.
  const test = (k, o, p, radius) => {
    const q = p.clone().sub(pp),
      d = q.length(),
      score = Math.acos(clamp(q.dot(f) / d, -1, 1)) - Math.atan(radius / d);
    if (score < bestScore) {
      bestScore = score;
      best = { k, o };
    }
  };
  for (const e of W.enemies) test("e", e, enemyPos(e), 8);
  for (const a of W.asteroids) test("a", a, a.m.position, a.r);
  for (const c of W.crates) test("c", c, c.m.position, 4);
  if (sectorAt(state.sector).st) test("s", null, STATION_POS, 100);

  if (best) {
    F.lock = best;
    msg("Target locked", 1.5);
  } else {
    msg("No object to lock", 1.5);
  }
}

/** Current world position of a lock target. */
export function lockPosition(lock) {
  if (lock.k === "s") return STATION_POS;
  return lock.k === "e" ? enemyPos(lock.o) : lock.o.m.position;
}

/** Label shown on the lock marker. */
export function lockName(lock) {
  if (lock.k === "e") return (lock.o.n || "hostile") + " " + Math.round((lock.o.hp / lock.o.mx) * 100) + "%";
  if (lock.k === "a") return itemName(lock.o.type) + " rock, " + Math.ceil(lock.o.ore) + " left";
  if (lock.k === "c") return lock.o.item === "core" ? "reactor core" : "crate";
  return "Meridian Outpost";
}


/** Drop the lock if its target has been destroyed or collected. */
export function pruneLock() {
  const F = state.flight,
    W = state.world,
    L = F.lock;
  if (!L || L.k === "s") return;
  const list = L.k === "e" ? W.enemies : L.k === "a" ? W.asteroids : W.crates;
  if (!list.includes(L.o)) F.lock = null;
}
