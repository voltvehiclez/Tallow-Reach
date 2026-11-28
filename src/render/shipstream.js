// The buffer between the wire and the glass (refactor step 16, slice 8a).
//
// The host sends where every pilot is `SHIP_STREAM.hz` times a second (24). A guest's screen
// must not draw the newest one: a packet that arrives 40 ms late, or not at all, would make a
// hull jump and then freeze. So the screen runs **`SHIP_STREAM.delayMs` in the past** and
// interpolates between the two snapshots that straddle that moment — the same idea the game
// already uses inside a tick (`simClock.alpha()` in `render/views.js`), applied to a second,
// slower clock: the buffer is the only thing slice 8a adds to the renderer.
//
//   const stream = createShipStream();
//   stream.receive(cleanShips, Date.now());   // on every `ships` message
//   const pilots = stream.sample();           // once a frame: poses to draw, already smoothed
//
// **Views only.** Nothing here is sim state: it holds the numbers a mesh is placed from, it
// never writes to `state`, and the ship list is replaced wholesale by what the host says. A
// guest that got no snapshots for `SHIP_STREAM.staleMs` draws no friend at all, which is the
// honest picture of "the host stopped telling me".
//
// **Never extrapolate.** Past the newest snapshot the pose is held, not guessed: a guessed
// position flies a hull through a station and then snaps back. Between two snapshots, a jump
// longer than `SHIP_STREAM.snapM` (a launch, a warp, a respawn) or a change of pocket is drawn
// as the step it is, not smeared across the screen.

import * as THREE from "three";
import { SHIP_STREAM } from "../data/multiplayer.js";

const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

const toVector = (raw, fallback = [0, 0, 0]) => {
  if (Array.isArray(raw)) return new THREE.Vector3(num(raw[0]), num(raw[1]), num(raw[2]));
  if (raw && typeof raw === "object") return new THREE.Vector3(num(raw.x), num(raw.y), num(raw.z));
  return new THREE.Vector3(...fallback);
};

const toQuaternion = raw => {
  const q = Array.isArray(raw)
    ? new THREE.Quaternion(num(raw[0]), num(raw[1]), num(raw[2]), num(raw[3], 1))
    : raw && typeof raw === "object"
      ? new THREE.Quaternion(num(raw.x), num(raw.y), num(raw.z), num(raw.w, 1))
      : new THREE.Quaternion();
  // A rotation with no length cannot be slerped; identity draws an upright hull instead.
  return q.lengthSq() > 1e-8 ? q.normalize() : new THREE.Quaternion();
};

/** One wire entry as the buffer keeps it: plain numbers turned into maths objects, once. */
function frameFrom(entry, at) {
  return {
    at,
    id: String(entry.id),
    name: String(entry.name || ""),
    ship: String(entry.ship || ""),
    place: String(entry.place || ""),
    pos: toVector(entry.pos),
    quat: toQuaternion(entry.quat),
    velocity: toVector(entry.velocity),
    throttle: num(entry.throttle),
    docked: entry.docked === true,
    dead: entry.dead === true,
    hull: num(entry.hull, 1),
    shield: num(entry.shield, 0),
    boost: entry.boost === true,
    shake: num(entry.shake, 0),
    shots: num(entry.shots, 0),
    missiles: num(entry.missiles, 0),
    locks: num(entry.locks, 0),
    ore: num(entry.ore, 0),
    hits: num(entry.hits, 0),
    boosts: num(entry.boosts, 0),
    beamOn: entry.beamOn === true,
    beamStart: entry.beamStart ? toVector(entry.beamStart) : null,
    beamEnd: entry.beamEnd ? toVector(entry.beamEnd) : null,
    mineFrac: num(entry.mineFrac, 0),
    beamT: num(entry.beamT, 0),
    pwr: entry.pwr === undefined ? 1 : num(entry.pwr, 1),
    pwrDraw: num(entry.pwrDraw, 0),
    enFrac: entry.enFrac === undefined ? 1 : num(entry.enFrac, 1),
    hint: typeof entry.hint === "string" ? entry.hint : "",
    cone: num(entry.cone, 0),
    lockT: num(entry.lockT, 0),
    lockLocked: entry.lockLocked === true,
    lockTarget: entry.lockTarget === true,
    warpOn: entry.warpOn === true,
    warpFx: num(entry.warpFx, 0),
    warpFlash: num(entry.warpFlash, 0),
    warps: num(entry.warps, 0),
    bursts: num(entry.bursts, 0),
  };
}

/** A pose to draw: fresh objects every call, so a mesh can never hold the buffer's own state. */
function poseFrom(
  frame,
  pos = frame.pos,
  quat = frame.quat,
  velocity = frame.velocity,
  throttle = frame.throttle,
  beamT = frame.beamT,
  pwr = frame.pwr,
  pwrDraw = frame.pwrDraw,
  enFrac = frame.enFrac,
  warpFx = frame.warpFx,
  warpFlash = frame.warpFlash,
  shake = frame.shake,
) {
  return {
    id: frame.id,
    name: frame.name,
    ship: frame.ship,
    place: frame.place,
    pos,
    quat,
    velocity,
    throttle,
    docked: frame.docked,
    dead: frame.dead,
    hull: frame.hull,
    shield: frame.shield,
    boost: frame.boost,
    shake,
    shots: frame.shots,
    missiles: frame.missiles,
    locks: frame.locks,
    ore: frame.ore,
    hits: frame.hits,
    boosts: frame.boosts,
    beamOn: frame.beamOn,
    beamStart: frame.beamStart,
    beamEnd: frame.beamEnd,
    mineFrac: frame.mineFrac,
    beamT,
    pwr,
    pwrDraw,
    enFrac,
    hint: frame.hint,
    cone: frame.cone,
    lockT: frame.lockT,
    lockLocked: frame.lockLocked,
    lockTarget: frame.lockTarget,
    warpOn: frame.warpOn,
    warpFx,
    warpFlash,
    warps: frame.warps,
    bursts: frame.bursts,
  };
}

/** Smooth position blend: Cubic Hermite along curved flight paths when endpoint velocities match motion, linear lerp otherwise. */
function interpPos(a, b, spanMs, t, out = new THREE.Vector3()) {
  const spanSec = spanMs / 1000;
  const va = a.velocity, vb = b.velocity;
  if (
    va && vb &&
    spanSec > 0.005 && spanSec <= 0.15 &&
    va.lengthSq() > 1 && vb.lengthSq() > 1
  ) {
    const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y, dz = b.pos.z - a.pos.z;
    const dpLen = Math.hypot(dx, dy, dz);
    const ax = (va.x + vb.x) * 0.5 * spanSec - dx;
    const ay = (va.y + vb.y) * 0.5 * spanSec - dy;
    const az = (va.z + vb.z) * 0.5 * spanSec - dz;
    if (Math.hypot(ax, ay, az) <= 0.5 * dpLen + 1.0) {
      const t2 = t * t, t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1;
      const h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2;
      const h11 = t3 - t2;
      return out.set(
        h00 * a.pos.x + h10 * spanSec * va.x + h01 * b.pos.x + h11 * spanSec * vb.x,
        h00 * a.pos.y + h10 * spanSec * va.y + h01 * b.pos.y + h11 * spanSec * vb.y,
        h00 * a.pos.z + h10 * spanSec * va.z + h01 * b.pos.z + h11 * spanSec * vb.z,
      );
    }
  }
  return out.copy(a.pos).lerp(b.pos, t);
}

/**
 * The buffer for one screen. `options` override the data values (a test drives its own clock).
 * `paceMs` (when > 0) smooths uneven network arrival gaps around the host's send cadence so high
 * refresh rates do not surge or stutter on WebRTC packet jitter.
 */
export function createShipStream({ delayMs, samples, staleMs, snapM, paceMs = 0 } = {}) {
  const delay = Number.isFinite(delayMs) ? delayMs : SHIP_STREAM.delayMs;
  const keep = Math.max(2, Math.floor(Number.isFinite(samples) ? samples : SHIP_STREAM.samples));
  const stale = Number.isFinite(staleMs) ? staleMs : SHIP_STREAM.staleMs;
  const snap = Number.isFinite(snapM) ? snapM : SHIP_STREAM.snapM;
  const pace = Number.isFinite(paceMs) && paceMs > 0 ? paceMs : 0;

  /** id -> snapshots in arrival order (oldest first), and when one last arrived. */
  const pilots = new Map();

  function paceTimestamp(record, rawAt) {
    if (!pace) return rawAt;
    if (!record.prevRawAt || rawAt - record.prevRawAt > pace * 3 || rawAt < record.prevRawAt - pace) {
      record.prevRawAt = rawAt;
      record.pacedAt = rawAt;
      return rawAt;
    }
    if (rawAt <= record.prevRawAt) return record.pacedAt;
    const sincePaced = rawAt - record.pacedAt;
    let next;
    if (sincePaced < pace * 0.45) {
      // Back-to-back immediate packet (e.g. dock/launch transition) keeps near-real spacing.
      next = Math.max(record.pacedAt + 1, rawAt);
    } else {
      // Bias step rounding by -0.25 so +25 ms jitter stays 1 cadence step while true drops (~2*pace) advance 2.
      const steps = Math.max(1, Math.round(sincePaced / pace - 0.25));
      const expected = record.pacedAt + steps * pace;
      const err = rawAt - expected;
      const maxLag = Math.min(28, delay * 0.28);
      next = expected + err * 0.15;
      next = Math.max(next, rawAt - maxLag);
      next = Math.min(next, rawAt + 8);
      if (next <= record.pacedAt) next = record.pacedAt + 1;
    }
    record.prevRawAt = rawAt;
    record.pacedAt = next;
    return next;
  }

  /**
   * Take one `ships` message. Entries are keyed by id and kept oldest-first; a pilot the host
   * stops mentioning simply stops being refreshed and goes stale below.
   */
  function receive(ships, at = Date.now()) {
    if (!Array.isArray(ships) || !Number.isFinite(at)) return 0;
    let taken = 0;
    for (const entry of ships) {
      if (!entry || typeof entry !== "object" || !entry.id) continue;
      const record = pilots.get(String(entry.id)) || { frames: [], lastAt: 0, prevRawAt: 0, pacedAt: 0 };
      const frame = frameFrom(entry, paceTimestamp(record, at));
      // Two messages can carry the same pilot in one millisecond (a batched world); the later
      // one replaces the earlier at that instant rather than sitting beside it.
      const last = record.frames[record.frames.length - 1];
      if (last && last.at >= frame.at) record.frames[record.frames.length - 1] = frame;
      else record.frames.push(frame);
      while (record.frames.length > keep) record.frames.shift();
      record.lastAt = Math.max(record.lastAt, at);
      pilots.set(frame.id, record);
      taken += 1;
    }
    return taken;
  }

  /**
   * The pose to draw for every pilot, `delay` milliseconds in the past.
   *
   * A pilot whose newest snapshot is older than `staleMs` is forgotten here, so a guest that
   * left, a host that stopped sending and a channel that died all empty the sky by themselves.
   */
  function sample(now = Date.now()) {
    const target = now - delay;
    const out = [];
    for (const [id, record] of [...pilots]) {
      if (now - record.lastAt > stale) {
        pilots.delete(id);
        continue;
      }
      const frames = record.frames;
      const first = frames[0];
      const last = frames[frames.length - 1];
      if (!first) continue;
      if (target <= first.at) {
        out.push(poseFrom(first, first.pos.clone(), first.quat.clone(), first.velocity.clone()));
        continue;
      }
      if (target >= last.at) {
        out.push(poseFrom(last, last.pos.clone(), last.quat.clone(), last.velocity.clone()));
        continue;
      }
      let a = first, b = last;
      for (let i = 0; i < frames.length - 1; i += 1) {
        if (frames[i].at <= target && target <= frames[i + 1].at) {
          a = frames[i];
          b = frames[i + 1];
          break;
        }
      }
      // A step this big, or a dock/death state flip, is a jump: snap instead of blending.
      const span = b.at - a.at;
      if (span <= 0 || a.place !== b.place || a.docked !== b.docked || a.dead !== b.dead || a.pos.distanceToSquared(b.pos) > snap * snap) {
        out.push(poseFrom(b, b.pos.clone(), b.quat.clone(), b.velocity.clone()));
        continue;
      }
      const t = Math.max(0, Math.min(1, (target - a.at) / span));
      const beamT = !b.beamOn ? 0 : (!a.beamOn || b.beamT < a.beamT ? b.beamT : a.beamT + (b.beamT - a.beamT) * t);
      const pwr = a.pwr + (b.pwr - a.pwr) * t;
      const pwrDraw = a.pwrDraw + (b.pwrDraw - a.pwrDraw) * t;
      const enFrac = a.enFrac + (b.enFrac - a.enFrac) * t;
      const warpFx = a.warpOn && b.warpOn ? a.warpFx + (b.warpFx - a.warpFx) * t : b.warpFx;
      const warpFlash = a.warpFlash + (b.warpFlash - a.warpFlash) * t;
      const shake = a.shake + (b.shake - a.shake) * t;
      out.push(poseFrom(
        b,
        interpPos(a, b, span, t),
        a.quat.clone().slerp(b.quat, t),
        a.velocity.clone().lerp(b.velocity, t),
        a.throttle + (b.throttle - a.throttle) * t,
        beamT,
        pwr,
        pwrDraw,
        enFrac,
        warpFx,
        warpFlash,
        shake,
      ));
    }
    return out;
  }

  /** Forget one pilot at once (its `left` was said, or the session stopped). */
  function forget(id) {
    return pilots.delete(String(id));
  }

  /** Forget everybody: a session ended, or a screen is being thrown away. */
  function clear() {
    pilots.clear();
  }

  /** How many pilots are held (a test's and the connection details' number). */
  const count = () => pilots.size;

  return { receive, sample, forget, clear, count, delayMs: delay };
}
