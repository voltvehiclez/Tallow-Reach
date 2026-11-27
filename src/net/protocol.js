// The wire protocol (refactor step 16, slice 3): the handful of messages the two sides
// exchange over the channel, and the rules that keep them small enough to arrive.
//
// Slice 3 sends only what proving the pipe needs:
//
//   hello      { t, v, worldId, guestId, name, token }   host -> guest, right after joining
//   welcome    { t, v, worldId, you, youName, name, guests[] }
//                                                        host -> guest: who you are here,
//                                                        under what name (see `uniqueName`)
//   refuse     { t, reason, message }                     host -> guest, why it said no
//   chat       { t, text, from, at }                      either way, one line
//   presence   { t, guests[{ guestId, name, docked }] }   host -> guests, who is here
//   ping/pong  { t, at }                                  either way, `NET.heartbeatSec`
//   carry      { t, guestId, name, epoch, rev, bundle, fresh }  guest -> host: the suitcase, on
//                                                         arrival. `fresh` means "packed in the
//                                                         pilot's own home save just now", i.e. it
//                                                         came home and this is a new trip — the one
//                                                         fact an ordering pair cannot express
//   suitcase   { t, guestId, name, epoch, rev, bundle }   host -> guest: the newer copy of it
//   bye        { t, guestId, name }                       guest -> host (slice 5): "I am going" —
//                                                         a tab closing or a pilot leaving, so the
//                                                         host writes the final copy back at once
//                                                         and marks the record `left` (no ghost)
//   ships      { t, ships[{ id, name, ship, place, pos, quat, velocity, throttle,
//                           docked, dead, hull }] }        host -> guests (slice 8a): where every
//                                                         pilot is, `SHIP_STREAM.hz` times a
//                                                         second. One message carries up to
//                                                         `LIMITS.ships` pilots, so a full world
//                                                         is a few messages, never a truncation —
//                                                         `maxGuests` is a valve, not a cap
//   controls   { t, steer{x,y}, roll, thrust, strafe, lift, stop, brake, boost, fire, sec,
//                aim[x,y,z] }                             guest -> host (slice 8b): what that
//                                                         pilot is asking its ship to do,
//                                                         `CONTROLS.hz` times a second. It is a
//                                                         **command**, not a key: the host writes it
//                                                         into its own record of that pilot's
//                                                         controls and its own sim decides what it
//                                                         means (refactor principle 7)
//   warp       { t, to }                                  guest -> host (slice 8c): \"take my ship to this pocket\" — a request, not a teleport; host re-checks travel rules and runs startWarp for that pilot
//   dock       { t }                                        guest -> host (slice 8c): \"dock now\" — host runs tryDock for that pilot when in range
//   entities   { t, place, bullets[{ id, pos, quat, colour }], missiles[{ id, pos, quat }],
//                crates[{ id, pos, quat, item }], fx[{ id, pos, col, size, l, t }], booms (u16),
//                enemies[{ id, def, friendly, boost, pos, quat, v, hp, mx }], picks (u16),
//                efires[ids] (enemy-fire events since the previous broadcast) }
//                                                        host -> guests: one message per pocket
//                                                        that holds a visitor, `SHIP_STREAM.hz`
//                                                        a second. Visual only; hits, loot and
//                                                        lifetimes are the host's sim's business
//
// The `bye` is a courtesy, not a contract: a crashed tab sends nothing at all, which is why the
// host still notices a peer that vanished on its own. It only makes the ordinary departure —
// the close button, "Go home", "Leave" — immediate and lossless.
//
// The handshake every message above relies on is written and tested in `net/custody.js`
// (`handshake`), never here.
//
// **Two rules that are easy to get wrong**
//
//  1. **A message is small.** A relay or a data channel drops or fragments a big packet;
//     a chat line is capped at `NET.chatLineMax`, and every message is put through
//     `cleanMessage` on the way out AND on the way in, so a hand-edited or hostile peer
//     cannot flood the other side with a megabyte.
//  2. **A message is validated before it is believed.** Every field is checked for type
//     and length on arrival; anything unexpected is dropped silently (a peer is not
//     trusted, and a refusal is not worth a crash). `readMessage` is the only reader.

import { NET } from "../data/multiplayer.js";

/** Every message kind this build understands. An unknown `t` is dropped, not echoed. */
export const KINDS = ["hello", "welcome", "refuse", "chat", "presence", "ping", "pong", "carry", "suitcase", "bye", "ships", "controls", "warp", "dock", "entities", "act", "visit"];

/** Allowlisted guest `act` operation names validated on both wire send and receive. */
export const ACT_OPS = [
  "pw", "sw",
  "invCancel", "invClick", "invRight", "invTake", "invStack", "invMove", "invSell", "invDiscard", "invUse", "invEquip",
  "fitClick", "fitPlace", "fitFrom", "bayUnequip", "baySwap",
  "sel", "buyShip", "sellShip", "rp", "home", "buy", "wr",
  "dep", "wd", "sellh", "sells", "up",
  "acc", "ref", "drop", "done", "story", "dlgNext", "dlgChoice",
];

/**
 * The longest a name, an id or a chat line may be on the wire, and the other hard caps.
 *
 * Exported because a sender has to know how much one message may carry: `ships` is sent in
 * batches of `LIMITS.ships`, so a world with more pilots than that sends more than one message
 * per snapshot instead of dropping the ones at the end.
 */
export const LIMITS = {
  id: 160,
  name: NET.nameMax,
  text: NET.chatLineMax,
  message: 300,
  list: 32,
  suitcase: NET.suitcaseMaxBytes,
  // Slice 8a: how many pilots one `ships` message carries. A wire cap, never a player cap.
  ships: 24,
  entities: 32,
  rocks: 256,
  // The largest a position, a velocity or any other single axis figure may be, in metres. A
  // pocket is kilometres across at most; bigger than this is a hand-made or corrupt packet.
  reach: 1e6,
};

const text = (value, max) => (typeof value === "string" ? value.slice(0, max) : "");

/**
 * Take a message of the given kind and return it as it will go on the wire: only the
 * fields that kind has, only their own types, nothing longer than a limit. Returns null
 * for anything this build cannot send, so a typo in a caller is caught here rather than
 * by the other side.
 */
export function cleanMessage(kind, fields = {}) {
  if (!KINDS.includes(kind)) return null;
  switch (kind) {
    case "hello":
      return {
        t: "hello",
        v: Math.max(0, Math.floor(Number(fields.v) || 0)),
        worldId: text(fields.worldId, LIMITS.id),
        guestId: text(fields.guestId, LIMITS.id),
        name: text(fields.name, LIMITS.name),
        token: text(fields.token, LIMITS.id),
      };
    case "welcome":
      return {
        t: "welcome",
        v: Math.max(0, Math.floor(Number(fields.v) || 0)),
        worldId: text(fields.worldId, LIMITS.id),
        you: text(fields.you, LIMITS.id),
        youName: text(fields.youName, LIMITS.name),
        name: text(fields.name, LIMITS.name),
        guests: cleanGuestList(fields.guests),
      };
    case "refuse":
      return {
        t: "refuse",
        reason: text(fields.reason, 40) || "unknown",
        message: text(fields.message, LIMITS.message) || "The host could not let you in.",
      };
    case "chat":
      return cleanChat(fields);
    case "presence":
      return { t: "presence", guests: cleanGuestList(fields.guests) };
    case "ping":
    case "pong":
      return { t: kind, at: Math.max(0, Math.floor(Number(fields.at) || 0)) };
    // Slice 4: the pilot actually travels. `carry` is the guest handing its suitcase to
    // the host on arrival; `suitcase` is the host handing the newer copy back. Both carry
    // one bundle and nothing else, and both are size-capped before they are believed.
    case "carry":
      return cleanCarry(fields, "carry");
    case "suitcase":
      return cleanCarry(fields, "suitcase");
    // Slice 8a: where every pilot is, as a plain picture. `SHIP_FIELDS` in
    // `data/multiplayer.js` is the list of fields; nothing here can reach a rule.
    case "ships":
      return { t: "ships", ships: cleanShips(fields.ships) };
    // 8c+: host -> guest: bullets/missiles/crates/fx in the same pocket. Visual only; host authoritative.
    // One message per pocket that holds a visitor: the world's transient objects, as the
    // host's sim holds them. Visual only; the host decides hits, loot and lifetimes.
    // `rocks` is attached only when a pocket's asteroid field changes (mining/depletion/respawn)
    // or a visitor enters, so routine 24 Hz packets stay small.
    case "entities":
      return {
        t: "entities",
        place: text(fields.place, LIMITS.id),
        bullets: cleanBullets(fields.bullets),
        missiles: cleanMissiles(fields.missiles),
        crates: cleanCrates(fields.crates),
        fx: cleanFx(fields.fx),
        booms: u16(fields.booms),
        enemies: cleanEnemies(fields.enemies),
        picks: u16(fields.picks),
        efires: cleanEFires(fields.efires),
        ...(Array.isArray(fields.rocks) ? { rocks: cleanRocks(fields.rocks) } : {}),
      };
    // Slice 8b: one pilot's asking, rebuilt field by field. Every axis is clamped to -1..1 and
    // every held control to a real `true`, so a hand-made message cannot ask a ship for 900 m/s of
    // thrust and a `"yes"` cannot be read as a held trigger. `CONTROL_FIELDS` in
    // `data/multiplayer.js` is the list of what travels.
    case "controls":
      return cleanControls(fields);
    // Slice 8c: the guest asks the host to warp or dock its own ship. The host re-checks
    // everything (travelQuote, dock range) and decides; a guest cannot teleport itself.
    case "warp":
      return { t: "warp", to: text(fields.to, LIMITS.id) };
    case "dock":
      return { t: "dock" };
    // Step 16 follow-up: guest intent for weapons, inventory, fitting, shops, contracts and missions.
    case "act":
      return cleanAct(fields);
    // Step 16 follow-up: authoritative state sync for a visiting guest (profile, guestWorld, held).
    case "visit":
      return cleanVisit(fields);
    // Slice 5: the guest is leaving on purpose. Two short strings, nothing else: the host
    // answers it with a final `suitcase`, so this message must never be able to say more
    // than "I am going".
    case "bye":
      return {
        t: "bye",
        guestId: text(fields.guestId, LIMITS.id),
        name: text(fields.name, LIMITS.name),
      };
    default:
      return null;
  }
}

function cleanChat(fields = {}) {
  const line = text(fields.text, LIMITS.text).replace(/\s+/g, " ").trim();
  if (!line) return null;
  return {
    t: "chat",
    text: line,
    from: text(fields.from, LIMITS.name),
    at: Math.max(0, Math.floor(Number(fields.at) || 0)),
  };
}

/**
 * A suitcase on the wire.
 *
 * **This is the one message whose payload is not rebuilt field by field.** A bundle holds
 * `profile` (the travelled half), station `lockers`, and an `unknown` record of content ids
 * this build may not know — and dropping an id it does not recognise is exactly the bug
 * LESSONS L16 and the custody tests exist to prevent ("items moved, never copied" is only
 * true if the copy is whole). So the shape is checked, the size is capped, and the content
 * ids are left alone; the *receiver* never trusts the bundle as a profile anyway — it goes
 * through `custody.relocate` and `sanitizeSave` before a hull or a hold is written.
 *
 * `carry` also names the guest (`guestId`, `name`) so the host can answer the right peer
 * even when two guests are mid-handshake.
 */
function cleanCarry(fields = {}, kind) {
  const bundle = fields.bundle;
  if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)) return null;
  if (!bundle.profile || typeof bundle.profile !== "object" || Array.isArray(bundle.profile)) return null;
  let size = 0;
  try {
    size = JSON.stringify(bundle).length;
  } catch (e) {
    return null;                                  // unserialisable: not a suitcase
  }
  if (!Number.isFinite(size) || size > LIMITS.suitcase) return null;
  const message = {
    t: kind,
    guestId: text(fields.guestId || bundle.guestId, LIMITS.id),
    name: text(fields.name || bundle.name, LIMITS.name),
    // The ordering pair travels BESIDE the bundle, not inside it: `compare` must be able
    // to order two copies without trusting anything inside either one.
    epoch: Math.max(0, Math.floor(Number(fields.epoch) || 0)),
    rev: Math.max(0, Math.floor(Number(fields.rev) || 0)),
    // **Provenance, not content** (playtest 24): a `carry` packed from the pilot's own home save
    // after it came home is the newest truth about it, whatever the ordering pair says — a fresh
    // `checkOut` starts at zero while a host raises `rev` on every write-back. Only a `carry`
    // carries it; a `suitcase` answers with the world's own copy and has nothing to claim.
    ...(kind === "carry" ? { fresh: fields.fresh === true } : {}),
    bundle,
  };
  return message;
}

/**
 * One number on the wire: a finite value, clamped to `±LIMITS.reach` and rounded to three
 * decimals (a millimetre, and three bytes shorter than the float). `fallback` is what a
 * missing or hostile value becomes.
 */
function num(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(Math.max(-LIMITS.reach, Math.min(LIMITS.reach, n)) * 1000) / 1000;
}

/** `[x, y, z]` from anything vector-shaped, or the zero/identity fallback. */
function cleanVec3(raw, fallback = [0, 0, 0]) {
  if (Array.isArray(raw)) return [num(raw[0]), num(raw[1]), num(raw[2])];
  if (raw && typeof raw === "object") return [num(raw.x), num(raw.y), num(raw.z)];
  return fallback.slice();
}

/**
 * `[x, y, z, w]`, normalised, because the far screen slerps with it: a zero or NaN rotation
 * would leave a hull facing nowhere for ever. A rotation that is not a rotation becomes the
 * identity, which draws an upright ship — wrong, but never broken.
 */
function cleanQuat(raw) {
  const q = Array.isArray(raw)
    ? [num(raw[0]), num(raw[1]), num(raw[2]), num(raw[3])]
    : raw && typeof raw === "object"
      ? [num(raw.x), num(raw.y), num(raw.z), num(raw.w)]
      : [0, 0, 0, 1];
  const len = Math.hypot(q[0], q[1], q[2], q[3]);
  if (!Number.isFinite(len) || len < 1e-6) return [0, 0, 0, 1];
  return q.map(v => Math.round((v / len) * 10000) / 10000);
}

/** A monotonically increasing counter on the wire: an integer 0..65535 (u16, wraps mod 65536). */
const u16 = value => {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n % 65536;
};

/**
 * A ship snapshot: the pilots the host drew, as `SHIP_FIELDS` says, capped at `LIMITS.ships`
 * per message. An entry with no id is dropped (nothing could be keyed on it), and every other
 * field is rebuilt from its own type — a peer is never believed about what it sent.
 */
function cleanShips(raw) {
  const out = [];
  if (!Array.isArray(raw)) return out;
  for (const entry of raw) {
    if (out.length >= LIMITS.ships) break;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const id = text(entry.id, LIMITS.id);
    if (!id) continue;
    out.push({
      id,
      name: text(entry.name, LIMITS.name),
      ship: text(entry.ship, 40),
      place: text(entry.place, LIMITS.id),
      pos: cleanVec3(entry.pos),
      quat: cleanQuat(entry.quat),
      velocity: cleanVec3(entry.velocity),
      throttle: Math.round(Math.max(-1, Math.min(1, num(entry.throttle))) * 1000) / 1000,
      docked: entry.docked === true,
      dead: entry.dead === true,
      hull: Math.round(Math.max(0, Math.min(1, num(entry.hull, 1))) * 1000) / 1000,
      // Shield, the second bar (playtest 23). A fraction on the wire, clamped like the hull: a
      // message that says 7.5 shields is a number a reader can draw, not HP from a host's fit.
      shield: Math.round(Math.max(0, Math.min(1, num(entry.shield, 0))) * 1000) / 1000,
      boost: entry.boost === true,
      shake: Math.round(Math.max(0, Math.min(1, num(entry.shake, 0))) * 1000) / 1000,
      // --- weapon effects, cleaned like everything else; a peer is never believed about a number.
      shots: u16(entry.shots),
      missiles: u16(entry.missiles),
      locks: u16(entry.locks),
      ore: u16(entry.ore),
      hits: u16(entry.hits),
      boosts: u16(entry.boosts),
      beamOn: entry.beamOn === true,
      beamStart: cleanVec3(entry.beamStart),
      beamEnd: cleanVec3(entry.beamEnd),
      mineFrac: Math.round(Math.max(0, Math.min(1, num(entry.mineFrac, 0))) * 1000) / 1000,
      beamT: Math.round(Math.max(0, Math.min(60, num(entry.beamT, 0))) * 1000) / 1000,
      pwr: Math.round(Math.max(0, Math.min(1, num(entry.pwr, 1))) * 1000) / 1000,
      pwrDraw: Math.round(Math.max(0, Math.min(500, num(entry.pwrDraw, 0))) * 100) / 100,
      enFrac: Math.round(Math.max(0, Math.min(1, num(entry.enFrac, 1))) * 1000) / 1000,
      hint: text(entry.hint, 120),
      cone: Math.round(Math.max(0, Math.min(45, num(entry.cone, 0))) * 100) / 100,
      lockT: Math.round(Math.max(0, Math.min(60, num(entry.lockT, 0))) * 1000) / 1000,
      lockLocked: entry.lockLocked === true,
      lockTarget: entry.lockTarget === true,
      warpOn: entry.warpOn === true,
      warpFx: Math.round(Math.max(0, Math.min(1, num(entry.warpFx, 0))) * 1000) / 1000,
      warpFlash: Math.round(Math.max(0, Math.min(1, num(entry.warpFlash, 0))) * 1000) / 1000,
      warps: u16(entry.warps),
      bursts: u16(entry.bursts),
    });
    // The weapon-effects block costs nothing until it is used: a default-zero field is omitted,
    // not sent as `0` — 24 pilots every 42 ms is not the place to carry a full launch history.
    // A reader's own cleaning (or `Number(x) || 0`) gives the same zero back, so nothing is lost.
    const last = out[out.length - 1];
    for (const key of ["shots", "missiles", "locks", "ore", "hits", "boosts", "warps", "bursts"]) if (!last[key]) delete last[key];
    if (!last.warpOn) { delete last.warpFx; delete last.warpFlash; }
    if (!last.beamOn && last.beamStart.every(v => v === 0) && last.beamEnd.every(v => v === 0)) {
      delete last.beamStart;
      delete last.beamEnd;
    }
    if (!last.mineFrac) delete last.mineFrac;
    if (!last.beamT) delete last.beamT;
    if (last.pwr === 1) delete last.pwr;
    if (!last.pwrDraw) delete last.pwrDraw;
    if (last.enFrac === 1) delete last.enFrac;
    if (!last.hint) delete last.hint;
    if (!last.cone) delete last.cone;
    if (!last.lockT) delete last.lockT;
    if (!last.lockLocked) delete last.lockLocked;
    if (!last.lockTarget) delete last.lockTarget;
  }
  return out;
}

/**
 * One pilot's controls (slice 8b). A command, not a key: the host has already decided who this
 * message belongs to (the peer it came from, never the message), so nothing here names a pilot.
 *
 * Every axis is a number in **-1..1** and every held control is **exactly `true`**; anything else is
 * the neutral value, because a ship that reads a bad number is a ship flying into a rock. `aim`
 * reuses the vec3 cleaner and is normalised by the sim when it is written into the record, so a
 * zero vector cannot leave a pilot aiming nowhere.
 */
function cleanControls(fields = {}) {
  const axis = value => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(Math.max(-1, Math.min(1, n)) * 1000) / 1000 : 0;
  };
  const held = value => value === true;
  const steer = fields.steer && typeof fields.steer === "object" ? fields.steer : {};
  return {
    t: "controls",
    steer: { x: axis(steer.x), y: axis(steer.y) },
    roll: axis(fields.roll),
    thrust: axis(fields.thrust),
    strafe: axis(fields.strafe),
    lift: axis(fields.lift),
    stop: held(fields.stop),
    brake: held(fields.brake),
    boost: held(fields.boost),
    fire: held(fields.fire),
    sec: held(fields.sec),
    aim: cleanVec3(fields.aim, [0, 0, -1]),
  };
}

function cleanBullets(raw) {
  const out = [];
  if (!Array.isArray(raw)) return out;
  for (const e of raw) {
    if (out.length >= LIMITS.entities) break;
    if (!e || typeof e !== "object") continue;
    out.push({ id: Math.max(0, Math.floor(Number(e.id) || 0)), pos: cleanVec3(e.pos), quat: cleanQuat(e.quat), colour: Math.max(0, Math.floor(Number(e.colour) || 0)) });
  }
  return out;
}
function cleanMissiles(raw) {
  const out = [];
  if (!Array.isArray(raw)) return out;
  for (const e of raw) {
    if (out.length >= LIMITS.entities) break;
    if (!e || typeof e !== "object") continue;
    out.push({ id: Math.max(0, Math.floor(Number(e.id) || 0)), pos: cleanVec3(e.pos), quat: cleanQuat(e.quat) });
  }
  return out;
}
function cleanCrates(raw) {
  const out = [];
  if (!Array.isArray(raw)) return out;
  for (const e of raw) {
    if (out.length >= LIMITS.entities) break;
    if (!e || typeof e !== "object") continue;
    const item = { id: Math.max(0, Math.floor(Number(e.id) || 0)), pos: cleanVec3(e.pos), quat: cleanQuat(e.quat), item: text(e.item, 20) };
    const missionId = text(e.missionId, LIMITS.id);
    const encounter = text(e.encounter, LIMITS.id);
    const missionOwner = text(e.missionOwner, LIMITS.id);
    if (missionId) item.missionId = missionId;
    if (e.persistent === true) item.persistent = true;
    if (encounter) item.encounter = encounter;
    if (missionOwner) item.missionOwner = missionOwner;
    out.push(item);
  }
  return out;
}
function cleanFx(raw) {
  const out = [];
  if (!Array.isArray(raw)) return out;
  for (const e of raw) {
    if (out.length >= LIMITS.entities) break;
    if (!e || typeof e !== "object") continue;
    out.push({ id: Math.max(0, Math.floor(Number(e.id) || 0)), pos: cleanVec3(e.pos), col: Math.max(0, Math.floor(Number(e.col) || 0)), size: Math.max(0, num(e.size, 1)), l: Math.max(0, num(e.l, 0)), t: Math.max(0, num(e.t, 1)) });
  }
  return out;
}

/**
 * Enemies on the wire: everything a far screen needs to draw the hull, lock it and show it as hurt.
 * The damage itself is host-side; a snapshot can carry no rule. `def` picks the mesh and the
 * faction glow, `v` is the one number a ballistic lead is computed from, `mx` is the def's full hull
 * so the far screen can fraction the bar the same way `sim/pilot-stats.js` does.
 */
function cleanEnemies(raw) {
  const out = [];
  if (!Array.isArray(raw)) return out;
  for (const e of raw) {
    if (out.length >= LIMITS.entities) break;
    if (!e || typeof e !== "object" || Array.isArray(e)) continue;
    const id = Math.floor(Number(e.id));
    const def = text(e.def, 40);
    if (!Number.isFinite(id) || id <= 0 || !def) continue;
    const row = {
      id,
      def,
      friendly: e.friendly === true,
      boost: e.boost === true,
      pos: cleanVec3(e.pos),
      quat: cleanQuat(e.quat),
      v: cleanVec3(e.v),
      hp: Math.max(0, Math.round(num(e.hp, 0) * 100) / 100),
      mx: Math.max(0, Math.round(num(e.mx, 0) * 100) / 100),
    };
    const missionId = text(e.missionId, LIMITS.id);
    const encounter = text(e.encounter, LIMITS.id);
    const missionOwner = text(e.missionOwner, LIMITS.id);
    if (missionId) row.missionId = missionId;
    if (encounter) row.encounter = encounter;
    if (missionOwner) row.missionOwner = missionOwner;
    out.push(row);
  }
  return out;
}

function cleanRocks(raw) {
  const out = [];
  if (!Array.isArray(raw)) return out;
  const round2 = (value, fallback = 0) => Math.round(num(value, fallback) * 100) / 100;
  const vec2 = v => Array.isArray(v)
    ? [round2(v[0]), round2(v[1]), round2(v[2])]
    : (v && typeof v === "object" ? [round2(v.x), round2(v.y), round2(v.z)] : [0, 0, 0]);
  for (const r of raw) {
    if (out.length >= LIMITS.rocks) break;
    if (!r || typeof r !== "object" || Array.isArray(r)) continue;
    const id = Math.floor(Number(r.id));
    if (!Number.isFinite(id) || id <= 0) continue;
    const ore = Math.max(0, round2(r.ore, 0));
    const max = Math.max(0.01, round2(r.max, 1));
    const radius = Math.max(1, round2(r.r, 10));
    out.push({
      id,
      type: text(r.type, 24) || "ferrite",
      shape: Math.max(0, Math.min(16, Math.floor(Number(r.shape) || 0))),
      r: radius,
      ore,
      max,
      pos: vec2(r.pos),
      quat: cleanQuat(r.quat),
      s0: vec2(r.s0),
      scale: vec2(r.scale),
    });
  }
  return out;
}

function cleanAct(fields = {}) {
  const op = text(fields.op, 32);
  if (!ACT_OPS.includes(op)) return null;
  const out = { t: "act", op };
  const reqId = Math.floor(Number(fields.reqId));
  if (Number.isFinite(reqId) && reqId >= 0) out.reqId = reqId;
  const id = text(fields.id, LIMITS.id);
  const choice = text(fields.choice, 64);
  const where = text(fields.where, 40);
  const toWhere = text(fields.toWhere, 40);
  const group = text(fields.group, 24);
  const shop = text(fields.shop, 40);
  const kind = text(fields.kind, 40);
  if (id) out.id = id;
  if (choice) out.choice = choice;
  if (where) out.where = where;
  if (toWhere) out.toWhere = toWhere;
  if (group) out.group = group;
  if (shop) out.shop = shop;
  if (kind) out.kind = kind;
  for (const key of ["slot", "toSlot", "bay"]) {
    if (fields[key] === undefined || fields[key] === null) continue;
    const v = Math.floor(Number(fields[key]));
    if (Number.isFinite(v) && v >= -1 && v <= 512) out[key] = v;
  }
  if (fields.n !== undefined && fields.n !== null) {
    const n = Math.floor(Number(fields.n));
    if (Number.isFinite(n) && n > 0) out.n = Math.min(100000, n);
  }
  if (fields.shift === true) out.shift = true;
  return out;
}

function cleanHeld(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const id = text(raw.id, 40);
  const n = Math.max(0, Math.floor(Number(raw.n) || 0));
  if (!id || n <= 0) return null;
  const out = {
    id,
    n,
    kind: text(raw.kind, 24),
    where: text(raw.where, 40),
  };
  const slot = Math.floor(Number(raw.slot));
  if (Number.isFinite(slot) && slot >= 0 && slot <= 512) out.slot = slot;
  const stationKey = text(raw.stationKey, LIMITS.id);
  const ship = text(raw.ship, 40);
  const instanceId = text(raw.instanceId, LIMITS.id);
  if (stationKey) out.stationKey = stationKey;
  if (ship) out.ship = ship;
  if (instanceId) out.instanceId = instanceId;
  if (raw.fromBay === true) {
    out.fromBay = true;
    const group = text(raw.group, 24);
    const bay = Math.floor(Number(raw.bay));
    if (group) out.group = group;
    if (Number.isFinite(bay) && bay >= 0 && bay <= 32) out.bay = bay;
  }
  return out;
}

function cleanVisit(fields = {}) {
  const profile = fields.profile;
  const world = fields.world;
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return null;
  if (!world || typeof world !== "object" || Array.isArray(world)) return null;
  let size = 0;
  try {
    size = JSON.stringify(profile).length + JSON.stringify(world).length;
  } catch (e) {
    return null;
  }
  if (!Number.isFinite(size) || size > LIMITS.suitcase) return null;
  return {
    t: "visit",
    ackReqId: Math.max(0, Math.floor(Number(fields.ackReqId) || 0)),
    notice: text(fields.notice, LIMITS.message),
    sound: text(fields.sound, 24),
    docked: fields.docked === true,
    place: text(fields.place, LIMITS.id),
    pw: Math.max(0, Math.min(4, Math.floor(Number(fields.pw) || 0))),
    sw: Math.max(0, Math.min(4, Math.floor(Number(fields.sw) || 0))),
    msl: Math.max(0, Math.floor(Number(fields.msl) || 0)),
    hull: Math.round(Math.max(0, num(fields.hull, 0)) * 1000) / 1000,
    hullMax: Math.round(Math.max(0, num(fields.hullMax, 0)) * 1000) / 1000,
    shield: Math.round(Math.max(0, num(fields.shield, 0)) * 1000) / 1000,
    shieldMax: Math.round(Math.max(0, num(fields.shieldMax, 0)) * 1000) / 1000,
    held: cleanHeld(fields.held),
    profile,
    world,
  };
}

/** Enemy fires since the last packet: raw ids, capped at 8. The guest gates by its own ears. */
const EFIS_CAP = 8;
function cleanEFires(raw) {
  const out = [];
  if (!Array.isArray(raw)) return out;
  for (const e of raw) {
    if (out.length >= EFIS_CAP) break;
    const id = Math.floor(Number(e));
    if (Number.isFinite(id) && id > 0 && !out.includes(id)) out.push(id);
  }
  return out;
}

function cleanGuestList(raw) {
  const out = [];
  if (!Array.isArray(raw)) return out;
  for (const entry of raw.slice(0, LIMITS.list)) {
    if (!entry || typeof entry !== "object") continue;
    const guestId = text(entry.guestId, LIMITS.id);
    if (!guestId) continue;
    out.push({ guestId, name: text(entry.name, LIMITS.name), docked: entry.docked === true });
    if (out.length >= LIMITS.list) break;
  }
  return out;
}

/**
 * Read what arrived from the other side. Returns a clean message, or null when it is not
 * something this build knows (a newer peer's message, a hostile packet, a half line).
 */
export function readMessage(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const kind = typeof raw.t === "string" ? raw.t : "";
  if (!KINDS.includes(kind)) return null;
  return cleanMessage(kind, raw);
}

/** Is this a chat line that may be shown? (Empty after trimming is not.) */
export const isChatLine = message => !!message && message.t === "chat" && message.text.length > 0;
