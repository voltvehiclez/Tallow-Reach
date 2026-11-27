// The buffer and pocket sync between host `entities` snapshots and the guest sky.
//
// Like `shipstream.js`, this holds no game rules and never writes back to the host. A host
// broadcasts pocket snapshots (`bullets`, `missiles`, `crates`, `fx`, `enemies`) at ~24 Hz;
// without interpolation and without excluding `_net` entities from 60 Hz `prevPoses` snapshots,
// remote NPCs and shots jump/sawtooth at 60 Hz against 24 Hz data. This buffer interpolates
// every tracked entity between the two packets bracketing `now - delayMs` and syncs them into
// `placeWorld(place)` cleanly with stable object identities (`_net: true`).

import { V, Q } from "../util/math.js";
import { SHIP_STREAM } from "../data/multiplayer.js";
import { enemyDef } from "../data/enemies.js";
import { BULLET_COLOURS } from "../data/weapons.js";
import { dropEnemy } from "../sim/enemy.js";
import { dropEntity } from "../sim/entity.js";
import { purgeNonNetEntities } from "../sim/world.js";

const _qa = Q();
const _qb = Q();

const vec3 = (src, fallback = [0, 0, 0]) =>
  Array.isArray(src)
    ? [Number(src[0]) || 0, Number(src[1]) || 0, Number(src[2]) || 0]
    : (src && typeof src.x === "number" ? [src.x || 0, src.y || 0, src.z || 0] : [...fallback]);

const quat4 = src => {
  const q = Array.isArray(src)
    ? [Number(src[0]) || 0, Number(src[1]) || 0, Number(src[2]) || 0, src[3] ?? 1]
    : (src && typeof src.x === "number" ? [src.x || 0, src.y || 0, src.z || 0, src.w ?? 1] : [0, 0, 0, 1]);
  const len = Math.hypot(q[0], q[1], q[2], q[3]);
  return len > 1e-6 ? [q[0] / len, q[1] / len, q[2] / len, q[3] / len] : [0, 0, 0, 1];
};

const lerp3 = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

function slerp4(a, b, t) {
  _qa.set(a[0], a[1], a[2], a[3]).normalize();
  _qb.set(b[0], b[1], b[2], b[3]).normalize();
  _qa.slerp(_qb, t);
  return [_qa.x, _qa.y, _qa.z, _qa.w];
}

const distSq3 = (a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  return dx * dx + dy * dy + dz * dz;
};

function cleanBullet(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = Math.floor(Number(raw.id) || 0);
  if (id <= 0) return null;
  return {
    id,
    pos: vec3(raw.pos),
    quat: quat4(raw.quat),
    colour: Number.isFinite(raw.colour) ? raw.colour : BULLET_COLOURS.hostile,
  };
}

function cleanMissile(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = Math.floor(Number(raw.id) || 0);
  if (id <= 0) return null;
  return { id, pos: vec3(raw.pos), quat: quat4(raw.quat) };
}

function cleanCrate(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = Math.floor(Number(raw.id) || 0);
  if (id <= 0) return null;
  return {
    id,
    pos: vec3(raw.pos),
    quat: quat4(raw.quat),
    item: typeof raw.item === "string" && raw.item ? raw.item : "salv",
  };
}

function cleanFx(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = Math.floor(Number(raw.id) || 0);
  if (id <= 0) return null;
  return {
    id,
    pos: vec3(raw.pos),
    col: Number.isFinite(raw.col) ? raw.col : 0xffaa00,
    size: Number.isFinite(raw.size) && raw.size > 0 ? raw.size : 1,
    l: Number.isFinite(raw.l) ? raw.l : 0,
    t: Number.isFinite(raw.t) && raw.t > 0 ? raw.t : 1,
  };
}

function cleanEnemy(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = Math.floor(Number(raw.id) || 0);
  const def = typeof raw.def === "string" ? raw.def.trim() : "";
  if (id <= 0 || !def) return null;
  return {
    id,
    def,
    friendly: raw.friendly === true,
    boost: raw.boost === true,
    pos: vec3(raw.pos),
    quat: quat4(raw.quat),
    v: vec3(raw.v),
    hp: Number.isFinite(raw.hp) ? raw.hp : 0,
    mx: Number.isFinite(raw.mx) ? raw.mx : 0,
  };
}

const cleanList = (arr, fn) => (Array.isArray(arr) ? arr.map(fn).filter(Boolean) : []);

/**
 * Snapshot ring buffer for one guest screen's visited pockets.
 */
export function createEntityStream({ delayMs = 50, samples = 8, staleMs, snapM } = {}) {
  const delay = Number.isFinite(delayMs) ? delayMs : 50;
  const keep = Math.max(2, Math.floor(Number.isFinite(samples) ? samples : 8));
  const stale = Number.isFinite(staleMs) ? staleMs : SHIP_STREAM.staleMs;
  const snap = Number.isFinite(snapM) ? snapM : SHIP_STREAM.snapM;
  const snapSq = snap * snap;

  const byPlace = new Map();

  function receive(packet, at = Date.now()) {
    if (!packet || typeof packet !== "object" || !Number.isFinite(at)) return 0;
    const place = typeof packet.place === "string" ? packet.place.trim() : "";
    if (!place) return 0;
    const frame = {
      at,
      place,
      bullets: cleanList(packet.bullets, cleanBullet),
      missiles: cleanList(packet.missiles, cleanMissile),
      crates: cleanList(packet.crates, cleanCrate),
      fx: cleanList(packet.fx, cleanFx),
      enemies: cleanList(packet.enemies, cleanEnemy),
    };
    const record = byPlace.get(place) || { frames: [], lastAt: 0 };
    const last = record.frames[record.frames.length - 1];
    if (last && last.at >= frame.at) record.frames[record.frames.length - 1] = frame;
    else record.frames.push(frame);
    while (record.frames.length > keep) record.frames.shift();
    record.lastAt = Math.max(record.lastAt, frame.at);
    byPlace.set(place, record);
    return record.frames.length;
  }

  function interpItems(aList, bList, t, merge) {
    if (!bList.length) return [];
    const byId = new Map();
    for (const item of aList) byId.set(item.id, item);
    return bList.map(b => {
      const a = byId.get(b.id);
      if (!a || distSq3(a.pos, b.pos) > snapSq) return b;
      return merge(a, b, t);
    });
  }

  function samplePlace(place, now = Date.now()) {
    if (!place || !byPlace.has(place)) return null;
    const record = byPlace.get(place);
    if (now - record.lastAt > stale) {
      byPlace.delete(place);
      return null;
    }
    const frames = record.frames;
    const first = frames[0];
    const last = frames[frames.length - 1];
    if (!first) return null;
    const target = now - delay;
    if (target <= first.at) return first;
    if (target >= last.at) return last;

    let a = first, b = last;
    for (let i = 0; i < frames.length - 1; i += 1) {
      if (frames[i].at <= target && target <= frames[i + 1].at) {
        a = frames[i];
        b = frames[i + 1];
        break;
      }
    }
    const span = b.at - a.at;
    if (span <= 0) return b;
    const t = Math.max(0, Math.min(1, (target - a.at) / span));

    return {
      at: target,
      place,
      bullets: interpItems(a.bullets, b.bullets, t, (ai, bi, k) => ({
        ...bi,
        pos: lerp3(ai.pos, bi.pos, k),
        quat: slerp4(ai.quat, bi.quat, k),
      })),
      missiles: interpItems(a.missiles, b.missiles, t, (ai, bi, k) => ({
        ...bi,
        pos: lerp3(ai.pos, bi.pos, k),
        quat: slerp4(ai.quat, bi.quat, k),
      })),
      crates: interpItems(a.crates, b.crates, t, (ai, bi, k) => ({
        ...bi,
        pos: lerp3(ai.pos, bi.pos, k),
        quat: slerp4(ai.quat, bi.quat, k),
      })),
      fx: interpItems(a.fx, b.fx, t, (ai, bi, k) => ({
        ...bi,
        pos: lerp3(ai.pos, bi.pos, k),
        l: ai.l + (bi.l - ai.l) * k,
      })),
      enemies: interpItems(a.enemies, b.enemies, t, (ai, bi, k) => ({
        ...bi,
        pos: lerp3(ai.pos, bi.pos, k),
        quat: slerp4(ai.quat, bi.quat, k),
        v: lerp3(ai.v, bi.v, k),
      })),
    };
  }

  function forgetPlace(place) {
    return byPlace.delete(place);
  }

  function clear() {
    byPlace.clear();
  }

  return { receive, samplePlace, forgetPlace, clear };
}

/** True when a world record already holds any `_net` entity (used for immediate first-packet sync). */
export function hasNetEntities(W) {
  if (!W) return false;
  for (const key of ["enemies", "bullets", "missiles", "crates", "fx"]) {
    if (Array.isArray(W[key]) && W[key].some(r => r && r._net === true)) return true;
  }
  return false;
}

/**
 * Synchronise one pocket's entity arrays against an interpolated snapshot from the host.
 * Always purges stale non-`_net` transient records first so local boot entities never hang frozen
 * beside live host entities, and builds new records with all metadata (`def`, `n`, `place`, `v`,
 * `colour`) populated BEFORE inserting into `W`.
 */
export function syncPocketEntities(W, snapshot, place) {
  if (!W || !snapshot || !place) return;
  purgeNonNetEntities(place);

  const syncList = (list, incoming, kind, build, update) => {
    const arr = Array.isArray(incoming) ? incoming : [];
    const byId = new Map();
    for (const rec of list) if (rec && rec._net === true) byId.set(rec.id, rec);
    const seen = new Set();

    for (const raw of arr) {
      if (!raw || typeof raw !== "object") continue;
      const id = Math.floor(Number(raw.id) || 0);
      if (id <= 0) continue;
      seen.add(id);
      let rec = byId.get(id);
      const isNew = !rec;
      if (isNew) rec = build(id, raw);
      rec._net = true;
      rec.id = id;
      rec.kind = kind;
      rec.pos.set(raw.pos?.[0] || 0, raw.pos?.[1] || 0, raw.pos?.[2] || 0);
      if (rec.quat && raw.quat) {
        rec.quat.set(raw.quat[0] || 0, raw.quat[1] || 0, raw.quat[2] || 0, raw.quat[3] ?? 1).normalize();
      }
      if (update) update(rec, raw);
      if (isNew) list.push(rec);
    }

    for (let i = list.length - 1; i >= 0; i -= 1) {
      const rec = list[i];
      if (!rec || rec._net !== true || seen.has(rec.id)) continue;
      if (kind === "enemy") dropEnemy(rec, place);
      else dropEntity(list, rec);
    }
  };

  syncList(
    W.bullets,
    snapshot.bullets,
    "bullet",
    (id, raw) => ({
      id,
      kind: "bullet",
      pos: V(),
      quat: Q(),
      colour: Number.isFinite(raw.colour) ? raw.colour : BULLET_COLOURS.hostile,
      _net: true,
    }),
    (rec, raw) => {
      rec.colour = Number.isFinite(raw.colour) ? raw.colour : BULLET_COLOURS.hostile;
    },
  );

  syncList(
    W.missiles,
    snapshot.missiles,
    "missile",
    id => ({ id, kind: "missile", pos: V(), quat: Q(), _net: true }),
  );

  syncList(
    W.crates,
    snapshot.crates,
    "crate",
    (id, raw) => ({
      id,
      kind: "crate",
      pos: V(),
      quat: Q(),
      item: typeof raw.item === "string" ? raw.item : "salv",
      _net: true,
    }),
    (rec, raw) => {
      rec.item = typeof raw.item === "string" && raw.item ? raw.item : "salv";
    },
  );

  syncList(
    W.fx,
    snapshot.fx,
    "fx",
    id => ({ id, kind: "fx", pos: V(), col: 0xffaa00, size: 1, l: 0, t: 1, _net: true }),
    (rec, raw) => {
      rec.col = raw.col;
      rec.size = raw.size;
      rec.l = raw.l;
      rec.t = raw.t;
    },
  );

  syncList(
    W.enemies,
    snapshot.enemies,
    "enemy",
    (id, raw) => {
      const def = typeof raw.def === "string" && raw.def ? raw.def : "raider";
      return {
        id,
        kind: "enemy",
        place,
        def,
        n: enemyDef(def)?.n || def,
        friendly: raw.friendly === true,
        boosting: raw.boost === true,
        hp: Number.isFinite(raw.hp) ? raw.hp : 0,
        mx: Number.isFinite(raw.mx) ? raw.mx : 0,
        pos: V(),
        quat: Q(),
        v: V(),
        _net: true,
      };
    },
    (rec, raw) => {
      const def = typeof raw.def === "string" && raw.def ? raw.def : rec.def;
      rec.def = def;
      rec.place = place;
      rec.n = enemyDef(def)?.n || def;
      rec.friendly = raw.friendly === true;
      rec.boosting = raw.boost === true;
      rec.hp = Number.isFinite(raw.hp) ? raw.hp : rec.hp;
      rec.mx = Number.isFinite(raw.mx) ? raw.mx : rec.mx;
      if (!rec.v || typeof rec.v.set !== "function") rec.v = V();
      rec.v.set(Number(raw.v?.[0]) || 0, Number(raw.v?.[1]) || 0, Number(raw.v?.[2]) || 0);
    },
  );
}

/**
 * Compute sound events a guest should hear from one incoming pocket `entities` packet.
 * Updates `pickSeen` / `boomSeen` baselines unconditionally (even while docked) so undocking never
 * unleashes a backlog of old sounds, and matches `efires` against both synced `W.enemies` and
 * the incoming `enemies` array so first-packet shots are heard cleanly.
 */
export function collectGuestPocketSfx({ place, booms, picks, efires, enemies, W, player, boomSeen, pickSeen }) {
  const events = [];
  const pick = Math.floor(Number(picks) || 0);
  const prevPick = pickSeen.get(place) ?? pick;
  pickSeen.set(place, pick);

  const boom = Math.floor(Number(booms) || 0);
  const prevBoom = boomSeen.get(place) ?? boom;
  boomSeen.set(place, boom);

  // While docked inside a station, space sounds stay silent — matching single-player docking.
  if (!player || player.docked) return events;

  if (pick > prevPick) {
    const times = Math.min(pick - prevPick, 2);
    for (let i = 0; i < times; i += 1) events.push({ name: "pickup" });
  }

  if (Array.isArray(efires) && efires.length) {
    const me = player.pos;
    let heard = 0;
    for (const id of efires) {
      if (heard >= 2) break;
      const rid = Math.floor(Number(id) || 0);
      if (rid <= 0) continue;
      const synced = W?.enemies?.find(r => r && r.id === rid);
      const raw = synced ? null : (Array.isArray(enemies) ? enemies.find(r => r && Math.floor(Number(r.id) || 0) === rid) : null);
      const shooter = synced || raw;
      if (!shooter) continue;
      const hr = enemyDef(shooter.def)?.hearRange ?? 0;
      if (hr <= 0) continue;
      const sx = Array.isArray(shooter.pos) ? (Number(shooter.pos[0]) || 0) : (shooter.pos?.x ?? 0);
      const sy = Array.isArray(shooter.pos) ? (Number(shooter.pos[1]) || 0) : (shooter.pos?.y ?? 0);
      const sz = Array.isArray(shooter.pos) ? (Number(shooter.pos[2]) || 0) : (shooter.pos?.z ?? 0);
      const dx = sx - me.x, dy = sy - me.y, dz = sz - me.z;
      if (dx * dx + dy * dy + dz * dz <= hr * hr) {
        events.push({ name: "enemy-fire" });
        heard += 1;
      }
    }
  }

  if (boom > prevBoom) {
    const times = Math.min(boom - prevBoom, 2);
    // `SFX.explosion` in core/audio.js gates on `count > 10`.
    for (let i = 0; i < times; i += 1) events.push({ name: "explosion", count: 30 });
  }

  return events;
}
