// The join link (refactor step 16, slice 3): one link, as the owner designed it.
//
//     ?join=<worldId>#<token>
//
// Three deliberate choices, each of which is a rule:
//
//  1. **The world id is in the query, the secret is after the `#`.** A browser never
//     sends a fragment to a server and never puts one in a referrer, so the guest's
//     secret cannot be logged by whoever hosts the page. A query inside a query would
//     also need double encoding, which is a bug waiting to happen in a copy-paste field.
//  2. **A link carries only what the host already knows.** The world id and a token:
//     no name, no save, no pilot. Opening a link reveals nothing about the host's game
//     until the two browsers are connected.
//  3. **A link is a value, not a URL to fetch.** Anything that is not
//     `?join=…#…` is refused with a sentence, because the most likely mistake is
//     pasting a whole sentence ("here's the link: …") or half a link.

const MARK = "?join=";
const SEP = "#";

/** The string the host shows and the guest pastes: `?join=<worldId>#<token>`. */
export function makeJoinLink(worldId, token) {
  const id = String(worldId || "").trim();
  const secret = String(token || "").trim();
  if (!id || !secret) return "";
  return `${MARK}${encodeURIComponent(id)}${SEP}${secret}`;
}

/**
 * A full address for the host to copy out of the game. `base` is the page's own address
 * with any stale `?join=` part removed, so a host who was once a guest does not send
 * their own link by accident.
 */
export function makeJoinUrl(worldId, token, base = pageBase()) {
  const link = makeJoinLink(worldId, token);
  return link ? `${base}${link}` : "";
}

/** The current page's address, without a query or fragment: where a link would point. */
export function pageBase() {
  try {
    const { origin, pathname } = globalThis.location || {};
    if (!origin) return "";
    return `${origin}${pathname}`;
  } catch (e) {
    return "";
  }
}

/**
 * Read a join link out of what a guest pasted (or out of the address bar). Accepts the
 * bare `?join=…#…`, a full URL with it on the end, and surrounding whitespace or quotes
 * (people paste from chat, which adds both). Returns `{ worldId, token }` or a reason.
 */
export function readJoinLink(text) {
  const raw = String(text || "").trim().replace(/^[<"']+|[>"']+$/g, "");
  if (!raw) return { ok: false, reason: "empty", message: "Paste the link the host sent you." };

  // Everything from `?join=` on, wherever it appears: links get pasted inside sentences.
  const at = raw.indexOf(MARK);
  if (at < 0) {
    return {
      ok: false,
      reason: "shape",
      message: "That is not a join link. It should look like ?join=… # … — ask the host to copy it again.",
    };
  }
  const rest = raw.slice(at + MARK.length);
  const hash = rest.indexOf(SEP);
  if (hash <= 0) {
    return {
      ok: false,
      reason: "incomplete",
      message: "That link is missing its second half. Copy the whole thing, including everything after the #.",
    };
  }
  const worldId = safeDecode(rest.slice(0, hash));
  // A token is letters and digits (`custody.makeToken`), so anything else at the end is
  // the rest of the sentence it was pasted in ("… #abc123 thanks"). Cutting there is what
  // makes pasting a link out of a chat message work; a hostile value is refused by the
  // handshake anyway, which is the only thing that decides who gets in.
  const token = (safeDecode(rest.slice(hash + 1)).match(/^[A-Za-z0-9]+/) || [""])[0];
  if (!worldId || !token) {
    return { ok: false, reason: "incomplete", message: "That link is missing its world or its secret. Ask the host to copy it again." };
  }
  return { ok: true, worldId, token };
}

/** `decodeURIComponent`, but a malformed escape is a value, not a crash. */
function safeDecode(text) {
  const value = String(text || "").trim();
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch (e) {
    return value;
  }
}

/**
 * The join link sitting in the address bar right now, or null. `net/multiplayer.js`
 * uses this at boot: opening a link is meant to be the whole join gesture.
 */
export function linkFromLocation(search, hash) {
  try {
    const query = String(search ?? globalThis.location?.search ?? "");
    const fragment = String(hash ?? globalThis.location?.hash ?? "").replace(/^#/, "");
    const at = query.indexOf(MARK);
    if (at < 0 || !fragment) return null;
    const found = readJoinLink(`${query.slice(at)}${SEP}${fragment}`);
    return found.ok ? found : null;
  } catch (e) {
    return null;
  }
}

/**
 * Remove `?join=` from the address bar once it has been used. A link is single-use in the
 * sense that re-opening a page should not silently re-join a world the pilot has left;
 * `history.replaceState` keeps the page itself untouched and adds no history entry.
 */
export function forgetLink() {
  try {
    const { origin, pathname } = globalThis.location || {};
    if (!origin || typeof history?.replaceState !== "function") return;
    history.replaceState(null, "", `${origin}${pathname}`);
  } catch (e) {
    /* a sandboxed frame may refuse: the link simply stays in the bar */
  }
}
