// Target lock (F). Locks onto whatever is nearest the crosshair: hostiles,
// rocks, crates or the outpost. Pressing F again releases the lock.

import { clamp } from "../util/math.js";
import { itemName } from "../data/items.js";
import { featureOf, featureById } from "../data/places.js";
import { state, msg, placeWorld } from "../state/state.js";
import { V } from "../util/math.js";
import { enemyPos } from "./enemy.js";
import { playerPos, playerFwd } from "./pilot.js";

/**
 * A lock is { k, o }: k is "e" hostile, "a" asteroid, "c" crate, "s" station.
 * o is the world object (null for the station).
 */
export function toggleLock(P = state.player) {
  const F = P.flight,
    W = placeWorld(P.place || state.place);
  const notify = text => { if (P === state.player) msg(text, 1.5); };
  if (F.lock) {
    F.lock = null;
    notify("Target released");
    return;
  }

  const f = playerFwd(P),
    pp = playerPos(P);
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
  for (const a of W.asteroids) test("a", a, a.pos, a.r);
  for (const c of W.crates) test("c", c, c.pos, 4);
  const placeId = P.place || state.place;
  const station = featureOf(placeId, "station");
  if (station) test("s", { place: placeId, feature: station.id }, V(...station.pos), 100);

  if (best) {
    if (best.k === "s") best.o = { place: placeId, feature: station.id };
    F.lock = best;
    notify("Target locked");
  } else {
    notify("No object to lock");
  }
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
  if (lock.k === "e") return (lock.o.n || "hostile") + " " + Math.round((lock.o.hp / lock.o.mx) * 100) + "%";
  if (lock.k === "a") return itemName(lock.o.type) + " rock, " + Math.ceil(lock.o.ore) + " left";
  if (lock.k === "c") return lock.o.item === "core" ? "reactor core" : "crate";
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
  const list = L.k === "e" ? W.enemies : L.k === "a" ? W.asteroids : W.crates;
  if (!list.includes(L.o)) F.lock = null;
}
