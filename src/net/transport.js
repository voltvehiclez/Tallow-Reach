// The connection (refactor step 16, slice 3): the ONLY file that names the network
// library. Trystero was the owner's choice on 2026-11-21 (`trystero@0.27.0`, MIT,
// Nostr build, free public relays). Everything above this file talks in the small
// vocabulary below, so a different library — or none at all — is a change here and
// nowhere else.
//
// **What the rest of the game sees**
//
//   createChannel({ role, id, onState, onData, onPeer })
//   channel.join()                                  host: open the room; guest: find it
//   channel.state()                                 { state, reason } for a screen
//   channel.peers()                                 ids of the other browsers in the room
//   channel.send(peerId, value)                     one message to one peer
//   channel.broadcast(value)                        one message to everyone
//   channel.leave()
//
// Messages are plain JSON objects. Keeping them small is the caller's job: the
// protocol in `net/protocol.js` does that on purpose.
//
// **Why a room name and not a peer id.** A one-link join means the host has nothing to
// type: the link *is* the room. Both browsers join a room derived from the world's id
// (`ROOM_NAMESPACE` + the id) and the broker introduces whoever is in it. The secret
// that proves *which* guest is after the `#` in `?join=<worldId>#<token>`, so it never
// reaches a server (see `net/join-link.js`).
//
// **The library is loaded lazily.** It is ~151 KB of the bundle, and a player who
// never opens multiplayer should not pay for parsing it at startup: `import("trystero")`
// runs on the first `join()`. esbuild still bundles it into the single file, so the
// game stays one HTML file with no network fetch.
//
// **Failure is a state, not an exception.** A relay that is down, a firewall, a library
// that will not load: the channel says `lost` with a reason a screen can print, and the
// paste-code fallback (`net/paste.js`) is what a player uses then. Nothing here throws
// into a frame.
//
// **The library's real API, as used below** (checked against the installed package,
// not from memory — `@trystero-p2p/core` types):
//   joinRoom({ appId, relayConfig? }, roomId)       -> Room
//   room.makeAction(name)                           -> { send(data, { target? }), onMessage(fn) }
//   room.onPeerJoin(({ peerId }) => ...)            room.onPeerLeave(({ peerId }) => ...)
//   room.getPeers()                                 -> { [peerId]: PeerInfo }
//   onMessage receives (data, { peerId, ... }).

import { ROOM_NAMESPACE, RELAYS } from "../data/multiplayer.js";

const isObject = value => !!value && typeof value === "object" && !Array.isArray(value);

/**
 * How the library is loaded: `import("trystero")`, lazily, on the first join. A test
 * replaces this with a small in-memory room pair, which is how the *whole* connection —
 * join, broadcast, the handshake, chat — is exercised with no browser and no relay.
 * (An actual WebRTC connection still needs two real browsers; see the test file.)
 */
let loadLibrary = () => import("trystero");

/** Test-only. `setLibraryLoader(null)` puts the real lazy import back. */
export function setLibraryLoader(loader) {
  loadLibrary = typeof loader === "function" ? loader : () => import("trystero");
}

/** The room a world's browsers meet in. Deterministic: one world is one room. */
export const roomNameFor = worldId => `${ROOM_NAMESPACE}:${String(worldId || "").trim()}`;

/**
 * A channel over the signalling broker.
 *
 * `role` is only used in the words of a failure message; the broker treats both sides
 * the same, and a world is only ever one or the other in practice.
 */
export function createChannel({ role = "host", worldId, onState, onData, onPeer } = {}) {
  let current = { state: "idle", reason: "" };
  let room = null;
  let starting = null;
  const actions = {};

  const setState = (state, reason = "") => {
    if (current.state === state && current.reason === reason) return;
    current = { state, reason };
    try {
      onState?.(current);
    } catch (e) {
      /* a broken screen must not break the connection */
    }
  };

  const peerIds = () => {
    try {
      return Object.keys(room?.getPeers?.() || {});
    } catch (e) {
      return [];
    }
  };

  /**
   * Load the library and join the room. Safe to call twice; the second call returns the
   * same promise. Never throws: a failure lands in `lost` with a sentence.
   */
  function join() {
    if (starting) return starting;
    if (current.state === "connected" || current.state === "finding") return Promise.resolve(null);
    if (!String(worldId || "").trim()) {
      setState("lost", "This world has no id yet. A world gets one the first time it is hosted.");
      return Promise.resolve(null);
    }
    setState("finding", "Contacting the signalling relay…");

    starting = (async () => {
      let joinRoom;
      try {
        ({ joinRoom } = await loadLibrary());
      } catch (error) {
        setState("lost", "The multiplayer library could not be loaded. Rebuild the game, or use paste codes.");
        return null;
      }

      try {
        const config = { appId: ROOM_NAMESPACE };
        if (Array.isArray(RELAYS.relayUrls) && RELAYS.relayUrls.length) {
          config.relayConfig = { urls: RELAYS.relayUrls.slice() };
        }
        // The owner's escape hatch for two networks that cannot see each other: a TURN
        // server in `data/multiplayer.js`. Unset, the library's public STUN is enough for
        // most homes and no setting changes.
        if (RELAYS.rtcConfig && typeof RELAYS.rtcConfig === "object") {
          config.rtcConfig = RELAYS.rtcConfig;
        }
        room = joinRoom(config, roomNameFor(worldId));

        // One action carries every message this game sends; `t` says what it is. One
        // namespace, not several, so a future message kind needs no new plumbing.
        actions.wire = room.makeAction("reach");
        actions.wire.onMessage((data, context) => {
          if (!isObject(data)) return;
          try {
            onData?.({ ...data, peerId: context?.peerId || null });
          } catch (e) {
            /* as above */
          }
        });

        room.onPeerJoin(({ peerId }) => {
          setState("connected");
          try {
            onPeer?.({ kind: "join", peerId });
          } catch (e) { /* ignore */ }
        });
        room.onPeerLeave(({ peerId }) => {
          // Losing the only peer is "the other pilot's browser went away", not "we are
          // connected to nothing": the room is still open and they can come back.
          setState(peerIds().length ? "connected" : "finding", peerIds().length ? "" : "The other pilot left. Waiting…");
          try {
            onPeer?.({ kind: "leave", peerId });
          } catch (e) { /* ignore */ }
        });
        // Errors the library reports (a relay refusing, a peer's offer failing). They are
        // worth showing once and are not fatal: the room is still open.
        if (typeof room.onError === "function") {
          room.onError(error => {
            const code = String(error?.code || "");
            if (code === "relay-failed") setState("lost", "The signalling relay refused the connection. Try again, or use paste codes.");
            else if (code === "peer-connect-failed") setState("finding", "Could not reach the other pilot directly (a strict network). Try again, or use paste codes.");
            else setState(current.state, current.reason || "Still waiting for the other pilot.");
          });
        }

        // A room with no peers is still `finding`: the relay accepted us, nobody has
        // answered. That is the honest state for a host waiting on its own.
        const ids = peerIds();
        setState(ids.length ? "connected" : "finding", ids.length ? "" : "Waiting for the other pilot to join…");
        return room;
      } catch (error) {
        setState("lost", "Could not reach the signalling relay. Try again, or use paste codes.");
        return null;
      }
    })();

    return starting.finally(() => {
      starting = null;
    });
  }

  /** One message to one peer. Returns false when there is no room to send through. */
  function send(peerId, value) {
    if (!actions.wire || !peerId) return false;
    try {
      // The library returns a promise; a failed send is not worth a thrown frame. The
      // caller's protocol has its own heartbeat, so a lost message shows up as silence.
      actions.wire.send(JSON.parse(JSON.stringify(value)), { target: peerId });
      return true;
    } catch (e) {
      return false;
    }
  }

  /** One message to everyone. Returns how many peers it went to. */
  function broadcast(value) {
    if (!actions.wire) return 0;
    let sent = 0;
    for (const id of peerIds()) if (send(id, value)) sent++;
    return sent;
  }

  function leave() {
    try {
      room?.leave?.();
    } catch (e) {
      /* leaving a room that is already gone is not an error */
    }
    room = null;
    for (const key of Object.keys(actions)) delete actions[key];
    setState("closed", "");
  }

  return {
    role,
    worldId,
    join,
    send,
    broadcast,
    leave,
    peers: peerIds,
    state: () => ({ ...current }),
    room: () => roomNameFor(worldId),
  };
}

/** A sentence for a screen, from whatever the channel last said. */
export function stateLine({ state, reason } = {}) {
  switch (state) {
    case "finding": return reason || "Looking for the other pilot…";
    case "connected": return "Connected.";
    case "lost": return reason || "The connection was lost.";
    default: return "Multiplayer is off.";
  }
}

/** Are the two browsers actually talking? Used by the pause card and the HUD. */
export const isLive = channel => !!channel && channel.state().state === "connected";
