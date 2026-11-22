// Relay (TURN) servers (step 16, slice 3): **which** servers this browser may use, and
// whether they actually answer.
//
// Why this file exists. Two machines on one wifi can connect with no help at all — they can
// dial each other's local addresses. Two machines on different networks (a phone on 4G, a PC
// on ethernet) cannot: a carrier NAT gives the phone an address nobody outside can dial, so
// the only path that works is one through a **TURN server**, and a code with no TURN
// candidate in it can only ever work on the same network (owner, playtests 8 and 9).
//
// The free TURN servers in `ICE.turn` are a convenience, not a promise: they are public, they
// come and go, and their logins are printed in public documentation. So a player can supply
// their own (`readSettings().relay`: the address, username and credential a TURN provider
// gives them), and the screen can **test** a set before blaming the network. A test is the
// only honest way to say "your relay server is not answering" instead of "co-op does not
// work".
//
// Nothing here carries game data: a TURN server forwards encrypted packets it cannot read.

import { ICE } from "../data/multiplayer.js";
import { readSettings } from "./settings.js";

/** One address a player typed, or nothing. Only `turn:`/`turns:` is a relay. */
const cleanUrl = value => {
  const text = String(value || "").trim().replace(/^[,;]+|[,;]+$/g, "");
  if (!text) return "";
  // Providers print it both ways. ExpressTURN, for instance, gives a bare
  // `free.expressturn.com:3478` with no scheme, so a host and a port are read as `turn:` —
  // the player should never have to know that the scheme was missing.
  const bare = /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\?transport=(tcp|udp))?$/i.test(text);
  const withScheme = /^turns?:[a-z0-9-]+(\.[a-z0-9-]+)*(:\d+)?(\?transport=(tcp|udp))?$/i.test(text);
  if (withScheme) return text;
  if (bare) return `turn:${text}`;
  return "";
};

/**
 * The player's own relay server, if they set one.
 *
 * Returns `{ urls, username, credential }` or null. A half-filled entry is refused, because a
 * TURN server with no login is a server that answers `401` and looks like a network fault.
 */
export function ownRelay(settings = readSettings()) {
  const relay = settings?.relay;
  if (!relay || typeof relay !== "object") return null;
  const urls = String(relay.urls || "")
    .split(/[\s,]+/)
    .map(cleanUrl)
    .filter(Boolean);
  const username = String(relay.username || "").trim();
  const credential = String(relay.credential || "").trim();
  if (!urls.length || !username || !credential) return null;
  return { urls, username, credential };
}

/** One entry as the browser wants it: a `name` is ours, not part of `RTCIceServer`. */
const asIceServer = entry => ({
  urls: [...(Array.isArray(entry.urls) ? entry.urls : [entry.urls])],
  username: entry.username,
  credential: entry.credential,
});

/**
 * The relay the game itself brings, in the browser's shape. Always at least one entry, so a
 * fresh install can already cross networks (owner's link over 4G, 2026-11-22).
 */
export function builtinRelays() {
  return (Array.isArray(ICE.turn) ? ICE.turn : []).map(asIceServer);
}

/** The built-in relay's name, for a screen that has to say what is in use. */
export function builtinRelayName() {
  return String(ICE.turnName || "the built-in relay");
}

/**
 * The built-in relay as the three boxes on the Multiplayer screen (address, username,
 * credential).
 *
 * A relay the player never typed is still the relay the game brings, so the boxes open
 * already holding it (owner's request, 2026-11-22): the address, username and credential a
 * provider hands out are three values no player should have to find and retype, and the
 * built-in one is the one the game already depends on. `relayFromFields` reads the boxes,
 * so seeding them here is what makes Save and the automatic save see a complete entry.
 */
export function builtinRelayFields() {
  const [first] = builtinRelays();
  if (!first) return { urls: "", username: "", credential: "" };
  return { urls: first.urls.join(", "), username: first.username, credential: first.credential };
}

/**
 * Every relay server this browser should try: the player's own first (it is the one they
 * chose, and the one that will keep working), then the built-in one as a fallback.
 */
export function turnServers(settings = readSettings()) {
  const own = ownRelay(settings);
  const builtin = builtinRelays();
  return own ? [asIceServer(own), ...builtin] : builtin;
}

/** The whole ICE configuration for a connection: STUN to find an address, TURN to cross a NAT. */
export function iceServers(settings = readSettings()) {
  const stun = (Array.isArray(ICE.stun) ? ICE.stun : ["stun:stun.l.google.com:19302"]).map(url => ({ urls: url }));
  return [...stun, ...turnServers(settings)];
}

/**
 * Ask each relay server to give us a relayed address, and count the ones that do.
 *
 * This is the real question, not "is the port open": an ICE config with
 * `iceTransportPolicy: "relay"` gathers *only* relayed candidates, so a `typ relay` candidate
 * means that server authenticated us and is willing to forward packets. A server that is down,
 * has a wrong login, or is blocked answers nothing — and the difference between those is not
 * something a player can see, so we report the count and let the number speak.
 *
 * Returns `{ total, ok, detail: [{ urls, relay }] }`. Never throws; a browser without WebRTC
 * reports `ok: 0`.
 */
export async function checkTurnServers(servers = turnServers(), { timeoutMs = 6000 } = {}) {
  const list = Array.isArray(servers) ? servers.filter(entry => entry && entry.urls) : [];
  if (!list.length) return { total: 0, ok: 0, detail: [] };
  if (typeof globalThis.RTCPeerConnection !== "function") {
    return { total: list.length, ok: 0, detail: list.map(entry => ({ urls: entry.urls, relay: 0 })) };
  }
  const detail = [];
  for (const entry of list) {
    detail.push({ urls: [...entry.urls], relay: await relayCandidatesFor(entry, timeoutMs) });
  }
  return { total: list.length, ok: detail.filter(item => item.relay > 0).length, detail };
}

/** How many relayed candidates one server produced within the window. */
function relayCandidatesFor(entry, timeoutMs) {
  return new Promise(resolve => {
    let pc = null;
    let count = 0;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { pc?.close?.(); } catch (e) { /* already gone */ }
      resolve(count);
    };
    const timer = setTimeout(finish, Math.max(1000, timeoutMs));
    if (typeof timer?.unref === "function") timer.unref();
    try {
      pc = new RTCPeerConnection({
        iceServers: [{ urls: entry.urls, username: entry.username, credential: entry.credential }],
        iceTransportPolicy: "relay",
      });
      pc.onicecandidate = event => {
        if (/\btyp relay\b/.test(String(event?.candidate?.candidate || ""))) count += 1;
      };
      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === "complete") finish();
      };
      pc.createDataChannel("relay-check");
      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .catch(finish);
    } catch (e) {
      finish();
    }
  });
}

/**
 * Read relay credentials out of whatever the provider handed the player.
 *
 * Providers print a little block — a `turn:` address, a username, a credential, sometimes as
 * JSON, sometimes as three lines of text. Retyping three values on two machines is how a
 * setting stops being used, so one box takes the whole block (and `TRTURN:` codes from the
 * **Copy relay settings** button, which are the same thing packed).
 */
export function parseRelayText(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const packed = /^TRTURN:([A-Za-z0-9+/=\s]+)$/.exec(text);
  if (packed) {
    try {
      const decoded = JSON.parse(atob(packed[1].replace(/\s+/g, "")));
      return ownRelay({ relay: decoded });
    } catch (e) {
      return null;
    }
  }
  // A `turn:`/`turns:` address, or a bare `host:port` the way some dashboards print it.
  const found = text.match(/turns?:[a-z0-9.-]+(?::\d+)?(?:\?transport=(?:tcp|udp))?|[a-z0-9-]+(?:\.[a-z0-9-]+)+:\d{2,5}/gi) || [];
  const urls = found.map(cleanUrl).filter(Boolean);
  const field = name => {
    // `username: u`, `username=u` and `"username":"u"` are all how a provider prints it.
    const match = new RegExp(`${name}"?\\s*[:=]\\s*"?([^"',}\\s]+)`, "i").exec(text);
    return match ? match[1] : "";
  };
  const username = field("username") || field("user");
  const credential = field("credential") || field("password") || field("pass");
  return ownRelay({ relay: { urls: [...new Set(urls)].join(","), username, credential } });
}

/** The three values as one line a player can send to their other machine. */
export function packRelay(relay) {
  const own = ownRelay({ relay });
  if (!own) return "";
  const text = JSON.stringify({ urls: own.urls.join(","), username: own.username, credential: own.credential });
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `TRTURN:${btoa(binary)}`;
}

/**
 * The relay a player is describing with the three boxes, or null.
 *
 * One function for the Save button **and** the automatic save, so the two can never disagree
 * about what counts as a complete entry. The address box may hold the provider's whole block,
 * a bare `host:port`, several comma-separated addresses, or a `TRTURN:` line from the other
 * machine; the username and credential boxes win when they hold something.
 */
export function relayFromFields(fields = {}) {
  const parsed = parseRelayText(fields.urls);
  const typed = { urls: String(fields.urls || "").trim(), username: String(fields.username || "").trim(), credential: String(fields.credential || "").trim() };
  const merged = parsed && (!typed.username || !typed.credential)
    ? { urls: parsed.urls.join(","), username: parsed.username, credential: parsed.credential }
    : typed;
  return ownRelay({ relay: merged });
}

/** One sentence a screen can print about a check's result. */
export function turnSummary(result) {
  if (!result || !result.total) return "No relay servers are configured, so a code can only work on the same network.";
  if (!result.ok) {
    return `None of the ${result.total} relay servers answered from this machine, so co-op cannot cross networks. ` +
      `That is a relay-server problem, not a game one: add your own relay server below if you have one.`;
  }
  return `${result.ok} of ${result.total} relay servers answered, so a code can cross networks.`;
}
