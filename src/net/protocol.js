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
//
// Nothing here carries a save, a bundle or a pilot: slices 4 and 5 add those as new
// `t` values, and the handshake they will use is already written and tested in
// `net/custody.js` (`handshake`).
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
export const KINDS = ["hello", "welcome", "refuse", "chat", "presence", "ping", "pong"];

/** The longest a name, an id or a chat line may be on the wire. */
const LIMITS = {
  id: 160,
  name: NET.nameMax,
  text: NET.chatLineMax,
  message: 300,
  list: 32,
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
