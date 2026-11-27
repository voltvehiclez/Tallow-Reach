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
//                crates[{ id, pos, quat, item }], fx[{ id, pos, col, size, l, t }] }
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
export const KINDS = ["hello", "welcome", "refuse", "chat", "presence", "ping", "pong", "carry", "suitcase", "bye", "ships", "controls", "warp", "dock", "entities"];

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
    case "entities":
      return { t: "entities", place: text(fields.place, LIMITS.id), bullets: cleanBullets(fields.bullets), missiles: cleanMissiles(fields.missiles), crates: cleanCrates(fields.crates), fx: cleanFx(fields.fx) };
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
    });
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
    out.push({ id: Math.max(0, Math.floor(Number(e.id) || 0)), pos: cleanVec3(e.pos), quat: cleanQuat(e.quat), item: text(e.item, 20) });
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
