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
//   carry      { t, guestId, name, epoch, rev, bundle }   guest -> host: the suitcase, on arrival
//   suitcase   { t, guestId, name, epoch, rev, bundle }   host -> guest: the newer copy of it
//   bye        { t, guestId, name }                       guest -> host (slice 5): "I am going" —
//                                                         a tab closing or a pilot leaving, so the
//                                                         host writes the final copy back at once
//                                                         and marks the record `left` (no ghost)
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
export const KINDS = ["hello", "welcome", "refuse", "chat", "presence", "ping", "pong", "carry", "suitcase", "bye"];

/** The longest a name, an id or a chat line may be on the wire. */
const LIMITS = {
  id: 160,
  name: NET.nameMax,
  text: NET.chatLineMax,
  message: 300,
  list: 32,
  suitcase: NET.suitcaseMaxBytes,
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
    bundle,
  };
  return message;
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
