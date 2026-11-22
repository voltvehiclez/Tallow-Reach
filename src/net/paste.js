// The paste-code fallback (refactor step 16, slice 3): the join that needs no broker.
//
// A free relay can be down, a network can refuse it, or a player can simply prefer not
// to talk to one. Then the two browsers still have to exchange a handful of strings, and
// the only channel they are certain to share is the one they are already using to talk
// to each other. So:
//
//   1. The host presses **No relay? Copy/paste codes**: the game makes an offer and shows it
//      as one code.
//   2. The guest pastes it under **Join Multiplayer World > paste codes**, and gets an
//      answer code back.
//   3. The guest sends that code to the host however they like; the host pastes it, and
//      the two browsers connect directly.
//
// **Why this file is separate from `transport.js`.** This path uses the browser's own
// `RTCPeerConnection` and nothing else — no library, no relay, no account — so it works
// even if the library fails to load. That is the whole point of a fallback, and it is
// also why the owner's rule ("one library, behind a wrapper") is not bent by it: the
// codes path is a browser API, not a dependency.
//
// **Honesty about what it costs.** A full ICE offer with trickle candidates is long
// (thousands of characters, a wall of text to send through a chat app). So: no trickle.
// The offer waits for gathering to finish and carries every candidate inline, which
// makes one paste instead of many. That takes a second or two per code and produces
// something a player can genuinely copy — and it is what the two-paste flow needs.
//
// **This file has no UI and no game state.** It is the connection primitive; slice 4
// puts the pilot through it, and `net/multiplayer.js` owns the screens' state.

/** The prefix that marks a code as this game's, so a stray paste is refused in words. */
import { ICE } from "../data/multiplayer.js";
import { iceServers } from "./turn.js";

const CODE_PREFIX = "TRJOIN:";

/**
 * The code's own version. Bumped to 2 on 2026-11-21 when the envelope gained the host's
 * `worldId`: a guest joining by code has no link to carry it, and without the world id the
 * handshake (which checks it in `custody.handshake`) would refuse the very guest the host
 * just invited. Version 1 codes are still read, with no world id, so nothing in the wild
 * turns to nonsense.
 */
export const CODE_VERSION = 2;

const isBrowser = () => typeof globalThis.RTCPeerConnection === "function";

/**
 * A connection over copy-pasted codes.
 *
 *   const link = createPasteLink({ onState, onData });
 *   const code = await link.offer();      // host: show this
 *   await link.accept(code);              // guest: paste the host's code, returns the answer
 *   await link.complete(answerCode);      // host: paste the guest's answer
 *
 * The result is the same small vocabulary the channel has: `send(value)`, `state()`,
 * `leave()`. One connection, not a room: a paste-code join is two browsers by definition.
 */
export function createPasteLink({ worldId = "", onState, onData } = {}) {
  let connection = null;
  let roomId = String(worldId || "");
  let current = { state: "idle", reason: "" };
  let channel = null;
  let pendingAnswer = null;
  // What the last gathered code can use: host/srflx are direct paths, `relay` came from TURN.
  const paths = { host: 0, srflx: 0, prflx: 0, relay: 0 };

  const setState = (state, reason = "") => {
    if (current.state === state && current.reason === reason) return;
    current = { state, reason };
    try {
      onState?.(current);
    } catch (e) { /* ignore */ }
  };

  const openConnection = () => {
    if (!isBrowser()) throw new Error("This browser cannot make a direct connection.");
    // Read at connection time, not import time: a player may have just added their own
    // relay server, and a code has to be made with it without reloading the game.
    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    pc.onconnectionstatechange = () => {
      const next = pc.connectionState;
      // "The peers can reach each other" is not yet "there is a channel to send on". The
      // channel's own `open` is the truth (see `attach`), and saying connected earlier told
      // the screen a lie and made the first hello fail — the state is latched, so nothing
      // re-sent it.
      if (next === "connected") setState(channel?.readyState === "open" ? "connected" : "working", "Opening a direct channel…");
      else if (next === "failed" || next === "disconnected" || next === "closed") {
        // Which failure it was, in the words the player needs: with no relay path in the code
        // the two machines can only ever meet on one network, and saying "closed" hides that.
        setState("lost", paths.relay > 0
          ? "The two networks could not find a path to each other, even through a relay server. Make a new code and try again."
          : "The two networks could not find a path to each other: this code has no relay path, so it only works between machines on the same network. Press Test relay servers in Connection details.");
      }
    };
    // ICE candidates are gathered into the code itself, so none arrive after it is sent.
    // They are also **counted by kind**, which is the only way a player can tell "the code
    // has a relay path" from "the code has nothing but local addresses" — the difference
    // between a phone on 4G reaching a home PC and not reaching it at all (playtest 8).
    for (const kind of PATH_KINDS) paths[kind] = 0;
    pc.onicecandidate = event => {
      const candidate = String(event?.candidate?.candidate || "");
      const kind = /\btyp (\w+)/.exec(candidate)?.[1];
      if (kind && PATH_KINDS.includes(kind)) paths[kind] += 1;
    };
    pc.ondatachannel = event => attach(event.channel);
    return pc;
  };

  function attach(dc) {
    channel = dc;
    dc.onmessage = event => {
      let value = null;
      try {
        value = JSON.parse(String(event.data));
      } catch (e) {
        return; // a peer that sends nonsense is ignored, not trusted
      }
      if (!value || typeof value !== "object") return;
      try {
        onData?.(value);
      } catch (e) { /* ignore */ }
    };
    dc.onopen = () => setState("connected");
    dc.onclose = () => setState("lost", "The direct connection closed. Make a new code.");
  }

  /** Wait until ICE gathering is over, or give up after a few seconds with what we have. */
  const gathered = pc => new Promise(resolve => {
    if (pc.iceGatheringState === "complete") return resolve();
    const done = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", done);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", done);
    // A network that never finishes gathering still deserves a usable code — and the wait
    // has to be long enough for the *relay* candidates, which is the whole point on 4G.
    setTimeout(() => {
      pc.removeEventListener("icegatheringstatechange", done);
      resolve();
    }, Math.max(2000, Number(ICE.gatherMs) || 8000));
  });

  /** Host: make the offer code to show. */
  async function offer() {
    setState("working", "Making a code…");
    try {
      connection = openConnection();
      const dc = connection.createDataChannel("reach", { ordered: true });
      attach(dc);
      const description = await connection.createOffer();
      await connection.setLocalDescription(description);
      await gathered(connection);
      const code = pack("offer", connection.localDescription, roomId);
      setState("waiting", "Send this code to the other pilot, then paste their answer.");
      return code;
    } catch (error) {
      setState("lost", `Could not make a code: ${error.message || error}`);
      return "";
    }
  }

  /** Guest: take the host's offer and return the answer code to send back. */
  async function accept(code) {
    setState("working", "Reading the code…");
    const parsed = unpack(code);
    if (!parsed || parsed.kind !== "offer") {
      setState("lost", "That is not a host's join code. Ask them to copy the whole code.");
      return "";
    }
    // The code names the world it invites you to; that is what the handshake will check.
    if (parsed.worldId) roomId = parsed.worldId;
    try {
      connection = openConnection();
      connectHandlers();
      await connection.setRemoteDescription(parsed.description);
      const description = await connection.createAnswer();
      await connection.setLocalDescription(description);
      await gathered(connection);
      const answer = pack("answer", connection.localDescription, roomId);
      setState("waiting", "Send this answer back to the host.");
      return answer;
    } catch (error) {
      setState("lost", `Could not read that code: ${error.message || error}`);
      return "";
    }
  }

  /** Host: take the guest's answer and finish the connection. */
  async function complete(code) {
    const parsed = unpack(code);
    if (!parsed || parsed.kind !== "answer") {
      setState("lost", "That is not the guest's answer code.");
      return false;
    }
    if (!connection) {
      setState("lost", "Make a fresh code first: this connection has been waiting too long.");
      return false;
    }
    try {
      await connection.setRemoteDescription(parsed.description);
      setState("working", "Connecting directly…");
      return true;
    } catch (error) {
      setState("lost", `Could not finish with that answer: ${error.message || error}`);
      return false;
    }
  }

  function connectHandlers() {
    // The guest gets the data channel the host created; `ondatachannel` is set in
    // `openConnection` already, this is only here so a future symmetric flow works.
  }

  function send(value) {
    if (!channel || channel.readyState !== "open") return false;
    try {
      channel.send(JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  function leave() {
    try {
      channel?.close?.();
      connection?.close?.();
    } catch (e) { /* ignore */ }
    channel = null;
    connection = null;
    setState("closed");
  }

  return {
    offer,
    accept,
    complete,
    send,
    leave,
    state: () => ({ ...current }),
    /** True once the two browsers are talking with no broker involved. */
    live: () => !!channel && channel.readyState === "open",
    /**
     * What network paths the last code carried, by kind. `relay > 0` is what makes a code
     * work between two different networks; `relay: 0` means every path is a local address,
     * so the two machines must be on the same network. A screen can say which.
     */
    paths: () => ({ ...paths }),
    hasRelayPath: () => paths.relay > 0,
  };
}

/**
 * What a direct connection may use to find itself.
 *
 * **STUN** answers "what is my address", and without one a connection between two home
 * networks usually fails. **TURN** (`ICE.turn` in `data/multiplayer.js`) is the fallback for
 * two networks that will not pass a packet between them: the code path carries the codes
 * itself, so the only thing that can still be missing is a path, and a home router with no
 * hairpin NAT is the usual reason there is none. Both are free public services and neither
 * carries game data — a TURN server forwards encrypted packets it cannot read.
 *
 * The library path (`net/transport.js`) keeps its TURN opt-in, because it works for most
 * players without one and a relayed path is slower. A player who resorted to codes has
 * already been told the easy way failed, so here it is always on.
 */
const ICE_SERVERS = [
  ...(Array.isArray(ICE.stun) ? ICE.stun : ["stun:stun.l.google.com:19302"]).map(url => ({ urls: url })),
  ...(Array.isArray(ICE.turn) ? ICE.turn.map(entry => ({ ...entry })) : []),
];

/** The kinds of network path a code can carry, most useful last. */
const PATH_KINDS = ["host", "srflx", "prflx", "relay"];

/* ------------------------------------------------------------------------- */
/* The code itself: a small, printable, copy-paste-safe envelope              */
/* ------------------------------------------------------------------------- */

/**
 * A code is `TRJOIN:` + base64 of `{ v, kind, description }`.
 *
 * Base64 of JSON, not a hand-rolled format: an SDP description is already text, and the
 * browser's own `btoa`/`atob` handle it. Whitespace is stripped on the way in, because a
 * chat app will wrap a long code over several lines and nobody will notice.
 */
export function pack(kind, description, worldId = "") {
  const body = JSON.stringify({
    v: CODE_VERSION,
    kind,
    worldId: String(worldId || ""),
    description: { type: description.type, sdp: description.sdp },
  });
  const bytes = new TextEncoder().encode(body);
  let binary = "";
  bytes.forEach(byte => (binary += String.fromCharCode(byte)));
  return CODE_PREFIX + btoa(binary);
}

/** Read a code back. Returns `{ kind, description }`, or null if it is not one. */
export function unpack(code) {
  const text = String(code || "").replace(/\s+/g, "");
  if (!text.startsWith(CODE_PREFIX)) return null;
  try {
    const binary = atob(text.slice(CODE_PREFIX.length));
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const value = JSON.parse(new TextDecoder().decode(bytes));
    // Version 1 is still read: it carried no world id, and a guest can still join with it
    // (the host's own check then decides, which is where that decision belongs).
    if (value?.v !== CODE_VERSION && value?.v !== 1) return null;
    if (value.kind !== "offer" && value.kind !== "answer") return null;
    const description = value.description;
    if (!description || typeof description.sdp !== "string" || !description.sdp) return null;
    return {
      kind: value.kind,
      worldId: typeof value.worldId === "string" ? value.worldId : "",
      description: { type: description.type, sdp: description.sdp },
    };
  } catch (e) {
    return null;
  }
}

/** A rough sense of how much text a player will have to send, for the copy button. */
export const codeLength = code => String(code || "").length;

/** Is this string shaped like one of this game's codes at all? */
export const looksLikeCode = code => String(code || "").replace(/\s+/g, "").startsWith(CODE_PREFIX);

/**
 * The world a code invites you to, or "" for a code that does not carry one. A guest needs
 * this *before* it has a session: the session is built for that world, and the handshake
 * checks the same id on the other side.
 */
export const codeWorldId = code => unpack(code)?.worldId || "";
