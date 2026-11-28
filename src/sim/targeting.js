import { pocketObjects } from './flight-instruments.js';
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
import { enemyDef } from "../data/enemies.js";
import { playerPos, playerFwd } from "./pilot.js";

/**
 * A lock is { k, o }: k is "e" hostile, "p" **another pilot**, "a" asteroid, "c" crate, "s" station,
 * "r" rift door, "g" the way out of a run, "k" a run's prize canister. o is the world object
 * (null for the station).
 *
 * `"p"` is playtest 23's fix. The owner's words: a visiting pilot "must be selectable (F / list),
 * must show the player's name, and must show hull/shield stats like any other ship". A visitor is
 * not in `W.enemies` (it is a `state.players` record) and on a guest there is no record at all, so
 * the target is a **plain reference the renderer keeps**: `state.otherPilots` (`render/views.js`
 * writes it, this file only reads it). See the note there — it is a picture, never sim state.
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
  // Friendlies are normally not selectable; a def may opt in (`lockable`).
  for (const e of W.enemies) { if (!e.friendly || enemyDef(e.def).lockable === true) test("e", e, enemyPos(e), 8); }
  // Another pilot is a ship on the glass, so F finds it the same way it finds a hostile: under the
  // reticle first, then the cone. Its position is the interpolated pose the screen drew, which is
  // also the position the HUD marker is placed at, so the lock sits on the hull the owner sees.
  for (const pilot of otherPilotsThere(P)) test("p", pilot, pilot.pos, 8);
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

/**
 * Every other pilot this screen is drawing in `P`'s pocket, as lock references.
 *
 * `state.otherPilots` is the renderer's mirror (`render/views.js`): on a host it is the visiting
 * records it draws, on a guest the poses the host's snapshots put on the glass. This is the only
 * list a guest has — it has no such records — which is exactly why the mirror exists.
 */
export function otherPilotsThere(P = state.player) {
  const place = P?.place || state.place;
  if (P && P !== state.player && state.players.includes(P)) {
    return state.players.filter(p => p && p !== P && !p.dead && (p.place || state.place) === place);
  }
  return (state.otherPilots || []).filter(pilot => pilot && !pilot.dead && pilot.place === place);
}

/** Current world position of a lock target. */
export function lockPosition(lock) {
  if (lock.k === "s") {
    const f = featureById(lock.o.place, lock.o.feature);
    return V(...f.pos);
  }
  if (lock.k === "p") return lock.o?.pos || V(0, 0, 0);
  return lock.k === "e" ? enemyPos(lock.o) : lock.o.pos;
}

/** Label shown on the lock marker. */
export function lockName(lock) {
  if (lock.k === "n") return lock.o.name;
  // The pilot's own name — never "Ship" and never its guest id: the owner asked to see who it is.
  if (lock.k === "p") return lock.o?.name || lock.o?.profile?.name || "Pilot";
  if (lock.k === "e") return lock.o.role === "prowl" ? "Unmarked" : lock.o.n || "hostile";
  if (lock.k === "a") return itemName(lock.o.type) + " rock, " + Math.ceil(lock.o.ore) + " left";
  if (lock.k === "c") return lock.o.item === "core" ? "reactor core" : lock.o.persistent && lock.o.missionId ? itemName(lock.o.item) : "crate";
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
  if (L.k === "n") {
    const row = pocketObjects(P).find(row => samePocketObject(row, L.o.source));
    if (L.o.place !== (P.place || state.place) || !row) F.lock = null;
    else L.o.pos = Array.isArray(row.object.pos) ? V(...row.object.pos) : row.object.pos || V(...row.object.center);
    return;
  }
  if (L.k === "s") {
    if (L.o.place !== (P.place || state.place)) F.lock = null;
    return;
  }
  // A pilot leaves the world, crosses to another pocket or dies: the lock goes with it. The list
  // is the renderer's mirror, so a hull that stopped being drawn stopped being a target too.
  if (L.k === "p") {
    if (!otherPilotsThere(P).includes(L.o)) F.lock = null;
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


/**
 * Percentages for compact NPC bars. Current hostiles have no shield pool.
 *
 * Two shapes arrive here, and both mean "a ship": a hostile carries HP and maxima (`hp`/`mx`,
 * `sh`/`maxSh`), while another pilot arrives as the fractions its screen already worked out
 * (`hull`/`shield`, 0..1 — from `sim/pilot-stats.js`, the same numbers the wire carries). The
 * fractions are recognised first: a pilot reference has no `mx`, and a hostile has no `hull`.
 */
export function targetHealth(o) {
  const percent = (value, max) => Number.isFinite(value) && Number.isFinite(max) && max > 0
    ? Math.round(clamp(value / max, 0, 1) * 100) : 0;
  if (o && Number.isFinite(o.hullMax)) {
    return { shield: percent(o.sh, o.shMax), hull: percent(o.hull, o.hullMax) };
  }
  if (o && Number.isFinite(o.hull) && !Number.isFinite(o.mx) && !Number.isFinite(o.hp)) {
    const of = value => Number.isFinite(value) ? Math.round(clamp(value, 0, 1) * 100) : 0;
    return { shield: of(o.shield), hull: of(o.hull) };
  }
  return { shield: percent(o?.sh, o?.maxSh), hull: percent(o?.hp, o?.mx) };
}

const LOCK_KIND_BY_ROW = {
  Hostile: "e",
  // A pilot row in the N list (a visiting record on the host, a friend's pose on a guest). It was
  // already a row; it used to become a name-only lock (`"n"`), which is why selecting a friend
  // showed no bars and F could not find one. It is a ship, so it locks as a ship.
  Ship: "p",
  Asteroid: "a",
  Cargo: "c",
  Rift: "r",
  Gate: "g",
  Cache: "k",
  station: "s",
};

// placeDef returns derived feature copies; match their stable authored identity, not reference.
function samePocketObject(row, object) {
  return row.object === object || (row.feature && object?.id != null && row.object.id === object.id && row.object.kind === object.kind);
}

/** True when a pocket-list row corresponds to the pilot's active lock (from F or list click). */
export function isPocketRowLocked(row, lock, place = state.place) {
  if (!row || !lock) return false;
  const kind = LOCK_KIND_BY_ROW[row.kind];
  if (kind === "s") {
    return lock.k === "s" && lock.o?.place === place && lock.o?.feature === row.object?.id;
  }
  if (kind) return lock.k === kind && lock.o === row.object;
  return lock.k === "n" && lock.o?.place === place && samePocketObject(row, lock.o?.source);
}

/** Selecting a live list row shares F lock records, including same-target unlock. */
export function selectPocketObject(object, P = state.player) {
  const row = pocketObjects(P).find(row => samePocketObject(row, object));
  if (!row) return false; // A row may disappear between its render and click.
  const place = P.place || state.place;
  const kind = LOCK_KIND_BY_ROW[row.kind];
  const next = kind === "s" ? { k: "s", o: { place, feature: object.id } } : kind ? { k: kind, o: object } : {
    k: "n", o: { source: object, rowKind: row.kind, place, name: row.name, pos: Array.isArray(object.pos) ? V(...object.pos) : object.pos || V(...object.center) },
  };
  P.flight.lock = isPocketRowLocked(row, P.flight.lock, place) ? null : next;
  return true;
}
