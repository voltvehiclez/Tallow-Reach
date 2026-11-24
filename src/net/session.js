// One multiplayer session (refactor step 16, slice 3): which side this browser is on,
// who is connected, what has been said.
//
// This is the layer a screen talks to. It owns no DOM: it holds the current channel (or
// paste link), answers the handshake, keeps the guest list and the chat history, and says
// what changed on the event bus so the pause card, the chat box and the HUD can each draw
// their own part without knowing about each other.
//
//   hostWorld({ save, name })            open this world to guests; returns { ok, worldId, link }
//   joinWorld({ link, name })            join somebody's world from a join link
//   codesOffer() / codesAccept(c) / codesFinish(c)   the paste-code fallback
//   say(text)                            send a chat line
//   stop()                               leave or close, whichever is running
//   snapshot()                           what a screen draws
//
// **The handshake is slice 1's, not new work.** A guest says hello with its build, the
// world id and its secret; the host checks all three with `custody.handshake`, which
// already has a sentence for each refusal, and records the guest with `putGuest`, which
// stores a hash of the secret and never the secret itself. Slice 3 adds no second,
// weaker check — a known guest must prove its token even while the rest is still being
// built, because that is the one check a wrong implementation would quietly lose.
//
// **Slice 4: the pilot travels.** A guest that is welcome packs its open-world pilot with
// `custody.checkOut`, sends the suitcase as one `carry` message, and its home save then
// carries the `away` marker (so its own pilot is frozen). The host `relocate`s the bundle
// into its world, stores it with `putGuest`, and asks `sim/` to build a docked record
// (`mp-guest-arrive`). From then on the host writes the copy back: when something the
// guest owns changes, it raises `rev` (never more than once per `NET.revStepMs`) and
// sends a `suitcase` message about `NET.snapshotSec` later; the guest stores it with
// `syncAway`. `goHome()` applies that copy with `custody.checkIn` and clears the marker,
// and it works with the host offline because the suitcase is the guest's own copy.
//
// **Nothing is ever truncated.** A suitcase too big for `NET.suitcaseMaxBytes` is refused
// with a sentence and the pilot stays home; half a pilot is worse than one that did not go.
//
// **Event bus.** `mp-state` fires whenever anything a screen shows has changed, with a
// snapshot attached. `mp-chat-arrived` fires for a line from somebody else. `mp-notice`
// is how `net/` asks for a sentence to be shown: `net/` may not import `ui/` (the layers
// test enforces it, and the reason is real — a connection must not need a DOM).

import { emit } from "../util/events.js";
import { state, currentRootSave, applySave } from "../state/state.js";
import { SAVE_VERSION, sanitizeSave } from "../state/profile.js";
import { createChannel, stateLine } from "./transport.js";
import { createPasteLink, codeWorldId } from "./paste.js";
import { readMessage, cleanMessage, isChatLine } from "./protocol.js";
import {
  handshake, makeToken, checkOut, checkIn, relocate, compare, isNewerCopy,
  guestRecord, bundleFromProfile, bundleBytes, awayRecord,
} from "./custody.js";
import {
  worldIdFor, putGuest, dropGuest, guestList, seenGuest, isAway,
  adoptHostWorld, syncAway, leaveHostWorld,
} from "./multiplayer.js";
import { stationsOfWorld } from "./world-places.js";
import { readAway } from "../state/storage.js";
import { makeJoinLink, makeJoinUrl, readJoinLink, pageBase } from "./join-link.js";
import { readSettings, writeSettings, cleanName } from "./settings.js";
import { checkTurnServers, turnSummary } from "./turn.js";
import { NET, CHAT } from "../data/multiplayer.js";

/** A whole, non-negative number: what every count on the wire is. */
const whole = value => Math.max(0, Math.floor(Number(value) || 0));

/* ------------------------------------------------------------------------- */
/* How the session reaches the save                                           */
/* ------------------------------------------------------------------------- */

/**
 * The session's handles on the game: read the live save, and write the guest list back
 * into it. Injected rather than imported so a test can drive a session with two plain
 * objects, and so `net/` keeps its one direction of knowledge (downwards).
 *
 * The defaults read and write `state`, which is what the running game does.
 */
const saveKit = {
  /** The live mode save: profile, world and the away marker for the pilot at the controls. */
  read: () => {
    const root = currentRootSave();
    return sanitizeSave(state.mode === "campaign" ? root.campaign : root.open);
  },
  /**
   * Write a mode save back. Only the fields multiplayer owns are taken: the guest list
   * and the world id. Writing a whole save here would fight the game's own capture code,
   * and the host has no business changing anything else about its world.
   */
  write: next => {
    if (!next || typeof next !== "object") return;
    if (next.world && typeof next.world === "object") {
      if (next.world.guests && typeof next.world.guests === "object") state.worldState.guests = next.world.guests;
      if (typeof next.world.worldId === "string") state.worldState.worldId = next.world.worldId;
    }
  },
  /**
   * Install a WHOLE mode save, for the guest's own pilot only (slice 4).
   *
   * This is separate from `write` on purpose, and the separation is the whole point:
   * `write` is the host's narrow business (the guest list and the world id), while this
   * is the one case where multiplayer legitimately replaces the pilot's own half — when
   * it packs itself away (`checkOut` empties the station stocks, so leaving them in the
   * live save while the suitcase also carries them would duplicate every stack on the way
   * home) or comes back (`checkIn`). LESSONS L15: items are moved, never copied, so the
   * emptying has to reach the save that is actually stored.
   */
  install: next => {
    if (!next || typeof next !== "object") return;
    // A dual-mode envelope installs itself; a mode save goes into the half it belongs to.
    if (next.open || next.campaign) { applySave(next); return; }
    if (!next.profile) return;
    const mode = state.mode === "campaign" ? "campaign" : "open";
    applySave({ ...currentRootSave(), [mode]: next });
  },
};

/**
 * Replace the save handles (tests, and any host that keeps its save elsewhere).
 *
 * `install` is part of the kit for the same reason `read` is: it is the only handle that can
 * put a WHOLE pilot back, and the title card's Bring pilot home calls the module's own
 * `saveKit` rather than a session's. A test that cannot replace it cannot model the game.
 */
export function setSaveKit(kit) {
  saveKit.read = kit.read || saveKit.read;
  saveKit.write = kit.write || saveKit.write;
  saveKit.install = kit.install || saveKit.install;
}

/** The live save, as the session sees it (a fresh snapshot every call). */
export const liveSave = () => saveKit.read();

/**
 * How a session makes its wire. `transport.createChannel` in the game; a test swaps in a
 * pair of channels that hand messages to each other, which is the only way to exercise
 * two sessions (real handshake, real protocol) without a browser and without a relay.
 */
let makeChannel = createChannel;
export function setChannelFactory(factory) {
  makeChannel = typeof factory === "function" ? factory : createChannel;
}
export const channelFactory = () => makeChannel;

/* ------------------------------------------------------------------------- */
/* The session in use                                                         */
/* ------------------------------------------------------------------------- */

let active = null;

export const current = () => active;
export const isOn = () => !!active && active.on;

/** What a screen draws, without touching the session. */
/**
 * The session's snapshot, plus the TWO facts a screen needs and cannot get anywhere else:
 * whether the player's standing switch is on, and whether a session object exists at all.
 *
 * The owner's report (playtest 17) is why. The multiplayer switch reads *Off* until a world
 * has been HOSTED (`switchOn: hosting`), and the switch is disabled while visiting — so a
 * player who enters a friend's world silently sits in a state where the one control that
 * opens multiplayer reads Off, greyed out, and nothing on screen can be pressed. The switch
 * means "multiplayer is on on this browser", which is what `readSettings().enabled` records;
 * clicking it must always find a session to act on, so one is created for a switched-on,
 * idle browser.
 */
export const snapshot = () => {
  const live = active ? active.snapshot() : emptySnapshot();
  return { ...live, enabled: readSettings().enabled === true, session: !!active };
};

function emptySnapshot() {
  return {
    on: false,
    role: null,
    // Nothing is running, but the standing switch may still be on (see `snapshot`).
    enabled: readSettings().enabled === true,
    session: false,
    state: "idle",
    line: "Multiplayer is off.",
    worldId: null,
    name: readSettings().name,
    peers: [],
    guests: [],
    chat: [],
    codes: null,
  };
}

/* ------------------------------------------------------------------------- */
/* Opening and joining                                                        */
/* ------------------------------------------------------------------------- */

/**
 * Open this world to guests. Gives the world an id the first time (a link names it), and
 * returns that id with the link to hand out, so the pause card can show both at once.
 *
 * Hosting needs: a name, the open world (the campaign is single player), and a pilot that
 * is at home (a visiting pilot cannot host the world it is visiting).
 */
export async function hostWorld({ save = liveSave(), name = readSettings().name } = {}) {
  const who = cleanName(name);
  if (!who) return { ok: false, message: "Set a username first." };
  if (state.mode === "campaign") return { ok: false, message: "The campaign is single player." };
  if (isAway(save)) return { ok: false, message: "Your pilot is visiting another world. Bring it home before hosting." };
  if (active) stop();

  // The world gets an id once: a second host on the same save finds the same id, so an
  // already-sent link keeps working.
  const hosted = worldIdFor(save);
  const worldId = hosted.world.worldId;
  const token = makeToken(NET.tokenBytes);
  saveKit.write(hosted);

  const link = makeJoinLink(worldId, token);
  const session = createSession({ role: "host", worldId, name: who, token, save: saveKit });
  tokens.set(session, token);
  active = session;
  await session.start();
  return { ok: true, worldId, link, url: makeJoinUrl(worldId, token, pageBase()) };
}

/** Join somebody's world from a join link (a whole pasted URL works too). */
export async function joinWorld({ link, name = readSettings().name } = {}) {
  const found = readJoinLink(link);
  if (!found.ok) return found;
  const who = cleanName(name);
  if (!who) return { ok: false, message: "Set a username first." };
  if (state.mode === "campaign") return { ok: false, message: "The campaign is single player. Joining works from the open world." };
  // Rejoining the world the pilot is ALREADY visiting is the whole point of the away card's
  // Rejoin button, so the away marker only refuses a join to a DIFFERENT world (playtest 15:
  // a visitor could not get back into the friends' world it was still standing in).
  const awayNow = liveSave()?.away || null;
  if (awayNow && awayNow.worldId !== found.worldId) {
    return { ok: false, message: "Your pilot is already visiting another world. Bring it home first." };
  }
  if (active) stop();

  const session = createSession({ role: "guest", worldId: found.worldId, name: who, token: found.token, save: saveKit });
  active = session;
  await session.start();
  const joined = await session.waitForWelcome();
  if (!joined.ok) {
    if (active === session) stop();
    return joined;
  }
  return { ok: true, worldId: found.worldId };
}

/* ------------------------------------------------------------------------- */
/* A session                                                                  */
/* ------------------------------------------------------------------------- */

function createSession({ role, worldId: startWorldId, name, token, save = saveKit }) {
  // A guest normally knows its world from the link; a guest joining by paste code learns it
  // from the code (`acceptCodes`), which is why this is `let` and not a constant.
  let worldId = startWorldId;
  const chat = [];
  const guests = [];        // who the host says is here
  const peerNames = new Map(); // peerId -> display name, so presence survives a welcome
  let channel = null;
  let paste = null;
  let codes = null;
  let on = true;
  // What this browser is called *here*: the host may rename a duplicate (`uniqueName`), so
  // it is not always the name that was typed. `name` stays the chosen one — that is what a
  // hello carries, so the host can rename it again the same way on a rejoin.
  let shown = name;
  // The host's own name, learnt from the welcome. A guest's player list is built from this
  // plus the guest rows — without it the guest sees a column with only itself in it.
  let hostName = "";
  let hostPeerId = null;
  let welcomed = false;     // has the host answered at all?
  // Slice 5: **the host's browser went away, and the pilot did not.**
  //
  // The loss is a fact this session states once (`mp-host-left`, `snapshot().hostLost`); what
  // the player sees is `ui/multiplayer.js`'s decision, and it is the owner's (2026-11-24): back
  // to the main menu with "Lost connection to host" on it, like any other game, and join again
  // by joining. The save is not touched here: the marker and the suitcase stay exactly as they
  // were, so *Bring pilot home* still works with the host gone for ever.
  let hostLost = false;
  let lostReason = "";
  // When the host last said anything at all. A crashed browser sends no `leave`, and a channel
  // can take a minute to admit a peer is gone, so silence is the guest's own sign of life
  // (`checkHostAlive`). Written for every message from the host and nothing else.
  let lastHostHeard = 0;
  const welcomeWaiters = [];
  // "Nobody has appeared in the room and the wait is over." Not an error: the honest fact
  // that the relay route is not delivering, which is the moment the code path stops being a
  // footnote and becomes the thing on screen (playtest 6).
  let stalled = false;
  let stallTimer = 0;
  let relayTried = false;   // has this session already escalated to a relay server?
  let keepalive = 0;        // the watchdog that reopens a room that silently died
  let lastRestart = 0;
  let helloRetry = 0;       // the retry timer (guest only)
  let helloWait = 0;        // the "nobody answered" timer (guest only)
  let hostWait = 0;         // the "a browser joined but never said hello" timer (host only)
  let greeted = false;      // has this guest managed to say hello at all?
  const greetedPeers = new Set(); // ...and to which peers (a hello is per connection)

  /* --- slice 4: the suitcase ------------------------------------------------------- */
  // The guest's bundle, packed when the join is accepted and kept while the visit lasts.
  // `carried` is what the host last gave us; `carriedRev` is the ordering pair of that
  // copy, so a `suitcase` message can be judged with `compare` instead of a guessed rule.
  let carried = null;
  let carriedRev = 0;
  // Has the host confirmed it took the suitcase? Until it has, a `carry` is re-sent: the
  // welcome can arrive before the channel can carry anything (LESSONS L35).
  let carriedAcked = false;
  // The host's side: the peer that owns each guest id, so a write-back goes to the right
  // browser when two guests are in the room.
  const guestPeer = new Map();
  // The host's write-back throttle: one raise per guest per `NET.revStepMs`, and the
  // timer that sends it `NET.snapshotSec` later (the plan's two seconds).
  const pendingWrite = new Map();   // guestId -> { at, timer }
  const lastWrite = new Map();      // guestId -> timestamp of the last raise
  // The guest's own "is this mine?" state: its home save is frozen while it is away.
  let awayMark = null;

  /* --- slice 5: the copy stays current, and a departure is said out loud ------------ */
  // The host's check: every `NET.snapshotSec` it asks `sim/` what each visiting pilot looks
  // like NOW and compares it with what it last sent. That comparison is the whole feature —
  // before it, `writeBack` existed and nothing ever called it, so a guest's suitcase only ever
  // held the copy it arrived with and everything it did in the friend's world was lost when it
  // went home. `suitcaseRepeatSec` re-sends an unchanged copy, so a packet lost on a flaky
  // channel heals itself without a reconnect.
  let guestSync = 0;                // the host's interval
  const livePrint = new Map();      // guestId -> what the host last saw the pilot look like
  const lastSent = new Map();       // guestId -> when it last went on the wire
  // The guest's "I am closing this page" hook, so the host gets a final copy and is not left
  // holding a pilot for a browser that is gone (a `bye`; see `net/protocol.js`).
  let pageHook = null;

  const ownGuestId = () => `guest-${token.slice(0, 8)}`;

  /** The guest id behind a peer, as the host knows them. */
  const guestIdForPeer = peerId => {
    for (const [guestId, id] of guestPeer) if (id === peerId) return guestId;
    const row = guests.find(entry => entry.peerId === peerId);
    return row?.guestId || "";
  };

  /**
   * Store a change to the GUEST'S OWN pilot.
   *
   * Not `save.write`: that seam is deliberately narrow, because a host may only touch the
   * guest list and the world id. A guest changing its own record — packing (`checkOut`
   * empties the home stations) or taking a newer suitcase from the host (the away marker
   * and the copy) — needs the whole mode save installed, or the change never reaches the
   * game while the wire thinks it did. LESSONS L34.
   */
  function storePilot(next) {
    if (!next || typeof next !== "object") return;
    if (save.install) save.install(next);
    else save.write(next);
  }

  function snapshot() {
    const status = channel ? channel.state() : paste ? paste.state() : { state: "idle", reason: "" };
    return {
      on,
      role,
      state: status.state,
      // Slice 4: what a screen needs to say about the pilot rather than the pipe.
      away: awayMark ? { ...awayMark, suitcase: undefined } : null,
      carrying: !!carried,
      carriedAcked,
      // Slice 5: the host's browser is gone, and the pilot is still in its world. A screen
      // draws "Lost connection to host" from this, never from a guess.
      hostLost,
      lostReason,
      line: stateLine(status),
      worldId,
      name: shown,
      hostName,
      peers: channel ? channel.peers() : [],
      guests: guests.slice(),
      chat: chat.slice(),
      connectProgress: role === "guest" ? guestProgress(status) : null,
      // Facts for the screen's "Connection details": what the transport can see about the
      // link itself, so a failure can be reported instead of guessed at.
      diag: channel && typeof channel.diagnostics === "function" ? channel.diagnostics() : null,
      stalled,
      relay: relayTried,
      codes: codes ? { ...codes } : null,
      // What the code's own network paths look like. `relay: 0` means the code can only work
      // between two machines on the same network (playtest 8: a laptop on 4G needs TURN).
      codePaths: paste && typeof paste.paths === "function" ? paste.paths() : null,
    };
  }

  function publish() {
    try {
      emit("mp-state", snapshot());
    } catch (e) {
      /* a broken screen must not break a session */
    }
  }

  function noteLine(from, text, own = false) {
    const at = Date.now();
    chat.push({ from, text, at, own });
    while (chat.length > CHAT.recentLines) chat.shift();
    publish();
    if (!own) {
      try {
        emit("mp-chat-arrived", { from, text, at });
      } catch (e) { /* ignore */ }
    }
  }

  /** Take one message. Never throws: a bad message is dropped, not echoed. */
  function receive(raw, peerId = null) {
    const message = readMessage(raw);
    if (!message) return;
    // The host is alive: any message from it counts, because the point is not the message but
    // that the other browser is still there (see `checkHostAlive`).
    if (role === "guest" && (!hostPeerId || peerId === hostPeerId)) lastHostHeard = Date.now();
    if (isChatLine(message)) {
      noteLine(message.from || "Other pilot", message.text);
      return;
    }
    switch (message.t) {
      case "hello": return onHello(message, peerId);
      case "welcome": return onWelcome(message, peerId);
      case "refuse": return onRefuse(message);
      case "presence": return onPresence(message);
      // Slice 4: the pilot itself.
      case "carry": return onCarry(message, peerId);
      case "suitcase":
        // Either side may receive one: the host sends the newer copy back, and a guest
        // that rejoined gets its own copy re-sent. `who` decides nothing — the ordering
        // pair does.
        if (role === "guest") return onSuitcase(message);
        return onSuitcaseAck(message);
      case "bye": return onBye(message, peerId);
      case "ping": {
        // Slice 5: a guest's heartbeat is the host's only sign of life between copies.
        // `lastSeen` is what `net/multiplayer.js`'s `guestIsHere` reads, so it is written
        // here and nowhere else.
        if (role === "host" && peerId) markPeerSeen(peerId);
        return send({ t: "pong", at: Date.now() }, peerId);
      }
      default: return undefined;
    }
  }

  /** Host side of the handshake: version, world and secret, in slice 1's words. */
  function onHello(message, peerId) {
    if (role !== "host") return;
    const current = save.read();
    const record = current?.world?.guests?.[message.guestId] || null;

    // `custody.handshake` refuses an unknown guest (its first test). Slice 3 has no join
    // flow yet, so a first hello carries no record and is admitted on the strength of the
    // link it arrived with — that is the slice-4 decision, made here in ONE place, with a
    // comment, rather than by quietly weakening the check for known guests.
    // A record the pilot has already LEFT does not hold its current token: it is holding
    // its suitcase, not an identity. The fresh join link is the proof (the old peer is
    // gone, the host made a new token), so a marked record is re-admitted and the new
    // token replaces the old hash — otherwise a pilot that visited once could never come
    // back, which is exactly what playtest 14 hit.
    const returning = !!record && record.left === true;
    const checked = record && !returning
      ? handshake({
        token: message.token,
        guestId: message.guestId,
        record,
        version: message.v,
        worldVersion: SAVE_VERSION,
        worldId: message.worldId,
        expectedWorldId: worldId,
      })
      : firstHelloCheck(message);

    if (!checked.ok) {
      send({ t: "refuse", reason: checked.reason, message: checked.message }, peerId);
      noteLine("Tallow Reach", `${message.name || "A pilot"} could not join: ${checked.message}`);
      return;
    }

    // **One session per guest id: a newer connection kicks the older** (slice 5).
    //
    // A pilot lives in one place, so two windows flying it is a bug even when both are the
    // same player. The newer connection wins because it is the one the player just opened.
    // The old window is told in words (it keeps its suitcase and its marker — only that
    // connection ends), and its row leaves the list **without** marking the record `left`,
    // because the pilot has not gone anywhere: the same pilot is here, in the new window.
    const replaced = guests.filter(entry => entry.guestId === message.guestId && entry.peerId && peerId && entry.peerId !== peerId);
    if (replaced.length) {
      const told = "This pilot was opened in another window, which has it now. Nothing was lost — your save still carries it.";
      for (const row of replaced) {
        send({ t: "refuse", reason: "replaced", message: told }, row.peerId);
      }
      removeRows(entry => entry.guestId === message.guestId && entry.peerId !== peerId);
      noteLine("Tallow Reach", `${replaced[0].name || message.name || "A pilot"} moved to another window.`);
    }

    // Two pilots called `Acey` are two rows in the list and two names in chat, so the host
    // hands out the first free variant. Its own name counts, and so does every other guest
    // — but not this guest's own row, or a rejoin would rename it again every time.
    const display = uniqueName(message.name, [
      name,
      ...guests.filter(entry => entry.guestId !== message.guestId).map(entry => entry.name),
    ]);

    const recorded = putGuest(current, message.guestId, {
      name: display,
      token: message.token,
      // `left: false` re-admits a pilot that had gone home, and keeps its old `epoch`/`rev`
      // so its suitcase still orders correctly against what the guest holds (playtest 14).
      left: false,
      epoch: returning ? record?.epoch : 0,
      rev: returning ? record?.rev : 0,
      bundle: null,
      lastSeen: Date.now(),
    });
    save.write(recorded);

    if (hostWait) { clearTimeout(hostWait); hostWait = 0; }
    clearStallTimer();
    const fresh = !guests.some(entry => entry.guestId === message.guestId);
    upsertGuest({ guestId: message.guestId, name: display, docked: false, peerId: peerId || null });
    if (peerId) peerNames.set(peerId, display);
    send(cleanMessage("welcome", {
      v: SAVE_VERSION,
      worldId,
      you: message.guestId,
      youName: display,
      name,
      guests: guests.map(g => ({ guestId: g.guestId, name: g.name, docked: g.docked })),
    }), peerId);
    // A repeated hello (the guest retries until it hears back) admits the same guest again;
    // only the first one is news.
    if (fresh) {
      noteLine("Tallow Reach", display === message.name
        ? `${display} joined.`
        : `${display} joined — ${message.name} was already taken.`);
    }
    publishPresence();
  }

  /**
   * The three checks a first hello gets when there is no record yet: the same build, the
   * same world, and a name that is really a name. The secret is checked by `handshake`
   * from the second visit onwards; a first visit's secret is what creates the record.
   */
  function firstHelloCheck(message) {
    if (message.v !== SAVE_VERSION) {
      return { ok: false, reason: "version", message: "That pilot is running a different version of Tallow Reach. Both players need the same build — rebuild, then send a fresh link." };
    }
    if (message.worldId !== worldId) {
      return { ok: false, reason: "world", message: "That link is for a different world. Ask the host to make a new one." };
    }
    if (!message.guestId || !message.name) {
      return { ok: false, reason: "shape", message: "That pilot did not say who it is. Ask them to join again." };
    }
    return { ok: true };
  }

  /** Guest side: the host accepted us and said who else is here. */
  function onWelcome(message, peerId = null) {
    if (role !== "guest") return;
    if (peerId) hostPeerId = peerId;
    if (message.name) hostName = message.name;
    if (message.youName) shown = message.youName;
    guests.length = 0;
    for (const entry of message.guests || []) upsertGuest(entry);
    // A welcome can arrive more than once (the hello is repeated until it is answered), and
    // the player must not be told "Joined Ada's world" every two seconds.
    const first = !welcomed;
    welcomed = true;
    hostLost = false;
    lostReason = "";
    lastHostHeard = Date.now();
    resolveWelcome({ ok: true });
    stalled = false;
    clearStallTimer();
    if (helloWait) { clearTimeout(helloWait); helloWait = 0; }
    // **A lost host is a lost room** (owner, 2026-11-24): the player is put back on the main
    // menu with "Lost connection to host" and joins again, so there is no half-connected state
    // to come back from here. A rejoin is an ordinary join — and a host that still holds this
    // pilot's record marked `left` re-admits it, because a `left` record is holding a
    // suitcase, not an identity (see `onHello`). The copy the guest carries goes back on the
    // wire in the `isAway` branch below, exactly as any other visit starts.
    if (!first) { publish(); return; }
    noteLine("Tallow Reach", `Joined ${message.name || "the host"}'s world.`);
    // A rename is not silent: being listed as somebody else without being told reads as a
    // bug, and the fix is one sentence.
    if (message.youName && message.youName !== name) {
      noteLine("Tallow Reach", `You are ${message.youName} here — the host already has a ${name}.`);
    }
    // Slice 4: **joining is not travelling.** "Bring my pilot" is a separate press, because
    // the plan quotes it as an action and because a visiting pilot is frozen at home — a
    // player who only wants to see a friend's galaxy and talk should not have their own
    // world paused for it. The ONE exception is a rejoin: a pilot that is already away is
    // already packed, so its suitcase goes back on the wire to catch the host up.
    if (isAway(save.read())) {
      carried = save.read()?.away?.suitcase || null;
      carriedRev = save.read()?.away?.rev || 0;
      awayMark = save.read()?.away || null;
      if (carried) sendCarryMessage(carried);
    } else {
      emit("mp-away-changed", { away: null, canBring: true });
    }
  }

  /* ------------------------------------------------------------------------- */
  /* Slice 4: the suitcase                                                      */
  /* ------------------------------------------------------------------------- */

  /**
   * Guest side: freeze the home pilot into a bundle and hand it to the host.
   *
   * `checkOut` lifts the travelled half AND every station locker out of the home save, so
   * the local copy no longer holds them — items are moved, never copied. The returned
   * save (with its `away` marker) is written back through the save kit, which is what
   * makes the pilot frozen at home from this moment.
   *
   * A bundle too big for the wire is refused *before* anything is written, so a pilot
   * that cannot travel stays home with all its cargo.
   */
  function sendCarry() {
    if (role !== "guest" || carried !== null) return false;
    const home = save.read();
    if (isAway(home)) {
      // Already away from a previous visit: its suitcase is the copy, not this save.
      carried = home.away?.suitcase || null;
      carriedRev = home.away?.rev || 0;
      awayMark = home.away || null;
      if (!carried) {
        emit("mp-notice", "Your pilot is already visiting another world, and its suitcase could not be read. Bring it home from the main menu first.");
        return false;
      }
      return sendCarryMessage(carried);
    }
    let packed = null;
    try {
      packed = checkOut(home, { worldId, hostName: hostName || "", guestId: ownGuestId(), name, token });
    } catch (error) {
      emit("mp-notice", `Your pilot could not be packed for the trip: ${error?.message || "the suitcase did not close"}.`);
      return false;
    }
    const size = bundleBytes(packed.bundle);
    if (size > NET.suitcaseMaxBytes) {
      emit("mp-notice", `Your pilot carries too much to travel (${Math.round(size / 1024)} KB of cargo and fits; the limit is ${Math.round(NET.suitcaseMaxBytes / 1024)} KB). Sell or store some of it and try again.`);
      return false;
    }
    carried = packed.bundle;
    carriedRev = whole(packed.bundle.rev);
    awayMark = packed.save.away || null;
    // The home save keeps the marker, an emptied stations half and the frozen pilot, and
    // the suitcase has the rest. Installing it (not merely `write`ing it) is what stops
    // the cargo existing in two places at once.
    storePilot(packed.save);
    emit("mp-away-changed", { away: awayMark });
    return sendCarryMessage(carried);
  }

  /** Session side of "Bring my pilot": pack, install the frozen record, put it on the wire. */
  function bringPilot() {
    if (role !== "guest") return { ok: false, message: "Only a visitor brings a pilot — this world is yours." };
    if (carried) return { ok: true, message: "Your pilot is already here." };
    const sent = sendCarry();
    return sent
      ? { ok: true, message: "Your pilot is on its way." }
      : { ok: false, message: "Your pilot could not travel — see the message on screen for why." };
  }

  function sendCarryMessage(bundle) {
    // **The secret is put back on the way out** (slice 5, found by the reconnect test).
    //
    // The copy the guest keeps is the copy the HOST sent back, and a host never keeps a
    // pilot's secret (`guestRecord` deletes it), so after the first suitcase arrives the
    // stored bundle carries no token. A rejoin in a fresh session — which is exactly what a
    // lost connection or a closed tab leaves — then had nothing to prove itself with and was
    // refused as "that link has already been used". The marker's own `token` is the field
    // that survives, so it is the one that goes on the wire.
    const secret = awayMark?.token || bundle?.token || token;
    const message = cleanMessage("carry", {
      guestId: ownGuestId(),
      name,
      epoch: bundle?.epoch || 0,
      rev: bundle?.rev || 0,
      bundle: bundle ? { ...bundle, token: secret } : bundle,
    });
    if (!message) {
      emit("mp-notice", "Your suitcase could not be put on the wire. Your pilot is still at home.");
      return false;
    }
    // A `carry` names one host, so it goes to the peer that welcomed us; a code-jointed
    // visit has exactly one wire and no peer id.
    const sent = hostPeerId ? send(message, hostPeerId) : send(message);
    if (!sent) {
      // Not an error yet: the host retries nothing, so we do. The welcome may arrive
      // before the channel can carry anything (the same race the hello had, L35).
      setTimeout(() => { if (on && carried && !carriedAcked) sendCarryMessage(carried); }, NET.helloRetrySec * 1000);
      return false;
    }
    return true;
  }

  /**
   * Guest side: the host wrote the pilot and sent the newer copy back.
   *
   * The ordering pair decides, never the arrival order: `compare` is slice 1's rule and
   * the only thing allowed to answer "is this newer than what I have". A copy that is not
   * newer is dropped silently — it is a late message, not an error.
   */
  function onSuitcase(message) {
    if (role !== "guest") return;
    carriedAcked = true;
    const incoming = { epoch: whole(message?.epoch), rev: whole(message?.rev) };
    if (carried && compare(incoming, { epoch: awayMark?.epoch || 0, rev: carriedRev }) > 0) return;   // older: ignore
    if (!message?.bundle) return;
    carried = message.bundle;
    carriedRev = incoming.rev;
    if (awayMark) {
      awayMark = { ...awayMark, epoch: incoming.epoch, rev: incoming.rev, suitcase: carried };
      const stored = syncAway({ ...save.read(), away: awayMark }, carried, incoming);
      storePilot(stored);
      awayMark = stored.away || awayMark;
    }
    emit("mp-away-changed", { away: awayMark });
    publish();
  }

  /**
   * Host side: a guest's suitcase arrived.
   *
   * The bundle is not trusted: it goes through `relocate` (anything whose station this
   * world lacks waits at Meridian and remembers where it came from) and the world's own
   * station stocks are written from the result. `putGuest` stores it with the guest's
   * token *hash*, never the token, and the record keeps `(epoch, rev)`.
   *
   * Then `sim/` is asked to build the record (`mp-guest-arrive`) — through the event bus,
   * because `net/` and `sim/` do not import each other in that direction.
   */
  function onCarry(message, peerId) {
    if (role !== "host") return;
    const guestId = message.guestId || message.bundle?.guestId;
    const record = save.read()?.world?.guests?.[guestId] || null;
    // A known guest must prove its token; a first visit is admitted on the link it came
    // with, exactly as the hello is (see `firstHelloCheck`).
    // Same rule as a hello: a record the pilot has LEFT is proof of nothing, and the fresh
    // link is. (See `onHello`; playtest 14.)
    const checked = record && record.left !== true
      ? handshake({
        token: message.bundle?.token,
        guestId,
        record,
        version: message.bundle?.v,
        worldVersion: SAVE_VERSION,
        worldId: message.bundle?.worldId,
        expectedWorldId: worldId,
      })
      : { ok: true, reason: null, message: "" };
    if (!checked.ok) {
      send({ t: "refuse", reason: checked.reason, message: checked.message }, peerId);
      noteLine("Tallow Reach", `${message.name || "A pilot"}'s pilot could not arrive: ${checked.message}`);
      return;
    }
    if (!remoteCanJoin()) {
      send({ t: "refuse", reason: "full", message: "This world is holding as many visiting pilots as it can. Ask the host to send somebody home." }, peerId);
      return;
    }

    const current = save.read();
    const index = stationsOfWorld(current.world);
    const incoming = { epoch: whole(message.epoch), rev: whole(message.rev) };

    // **Whose copy is newer? The ordering pair decides, never the arrival order** (slice 5).
    //
    // Three ways two copies of one pilot can disagree, and all three are real:
    //
    //  1. **The host loaded an older save** (a backup, a second machine, a browser that
    //     restored yesterday's file) while the guest still holds the trip. The guest's copy
    //     is newer, so it wins and becomes the world's record — the host does not get to
    //     drag a pilot backwards just because its own file is old.
    //  2. **A stale `carry` arrives late** (a re-sent message, a guest that reopened from an
    //     old tab). The host's record is newer, so the record stands and the guest is sent
    //     the newer copy back instead of being believed.
    //  3. **The pilot came home and came back.** A `left` record is holding a suitcase, not
    //     an identity: the pilot has been home since, may have bought a whole new fit there,
    //     and its save is the newest truth about it. So a returning pilot's copy wins, and
    //     that is the fact the ordering pair cannot express — which is exactly why the check
    //     is `record.left` first and `compare` second, and not `compare` alone.
    //
    // A tie (`compare` says 0) takes the incoming copy: two copies with the same pair are
    // the same trip, and the arriving one is by definition the one the guest just packed.
    const stale = record && record.left !== true && compare(record, incoming) < 0;
    if (stale) {
      const kept = { ...(record.bundle || {}), token: "" };
      if (kept?.profile) {
        if (peerId) guestPeer.set(guestId, peerId);
        // The world keeps ITS pilot, and the guest is told so in words rather than silently.
        emit("mp-guest-arrive", {
          guestId,
          name: record.name || message.name || "Guest",
          profile: null,
          bundle: kept,
        });
        send(cleanMessage("suitcase", {
          guestId,
          name: record.name || message.name || "",
          epoch: whole(record.epoch),
          rev: whole(record.rev),
          bundle: kept,
        }), peerId);
        noteLine("Tallow Reach", `${record.name || message.name || "A pilot"}'s pilot is newer in this world than the copy that arrived; this world kept its own.`);
        save.write(seenGuest(save.read(), guestId, Date.now()));
        publish();
        return;
      }
      // A record with no bundle holds nothing to defend: fall through and take the guest's.
    }

    const relocated = relocate(message.bundle, current.world, { index });
    const stored = putGuest(current, guestId, {
      name: message.name || record?.name || "Guest",
      token: message.bundle?.token || "",
      epoch: incoming.epoch,
      rev: incoming.rev,
      bundle: { ...relocated.bundle, token: "" },
      // A returning pilot's copy is the newest truth (see the note above), and it starts a
      // new visit: the record stops claiming it is holding a suitcase.
      left: false,
      lastSeen: Date.now(),
    });
    stored.world.stationStores = relocated.stations;
    save.write(stored);

    if (peerId) guestPeer.set(guestId, peerId);
    livePrint.delete(guestId);
    // The record itself is the simulation's job. `net/` may not touch state.players.
    emit("mp-guest-arrive", {
      guestId,
      name: message.name || record?.name || "Guest",
      profile: null,             // main.js fills this from the bundle with custody.hostProfile
      bundle: relocated.bundle,
    });
    send(cleanMessage("suitcase", {
      guestId,
      name: message.name || record?.name || "",
      epoch: incoming.epoch,
      rev: incoming.rev,
      bundle: { ...relocated.bundle, token: "" },
    }), peerId);
    noteLine("Tallow Reach", `${message.name || "A pilot"}'s pilot arrived — ${relocated.bundle.summary?.text || "suitcase received"}.`);
    publish();
  }

  /**
   * Host side: a guest's connection dropped without a goodbye (playtest 14).
   *
   * Three things were left behind, and all three were visible: the guest stayed in the
   * players list, no line in the chat said it had gone, and its record stayed in
   * `world.guests` — so the next join was treated as a RETURNING guest and demanded a token
   * the pilot had already been given a new one of. That last one is what made "Join" from
   * the main menu do nothing at all for a pilot that had visited before.
   *
   * The record is marked `left` rather than deleted: the pilot's suitcase is still in it,
   * and if the same pilot comes back it must get its own ship and cargo rather than a
   * fresh one. A marked record is compared on `lastSeen` by the next hello.
   */
  function forgetPeer(peerId) {
    retireRows(removeRows(row => row.peerId === peerId));
  }

  /**
   * Take rows out of the players list **without deciding anything about the pilot**.
   *
   * Slice 5 needed this split: a guest whose connection dropped must be sent home in words
   * (`retireRows`, which marks the record `left` and tells the sim the ship has gone), while a
   * guest that merely moved to a newer window must leave the list **while its pilot stays put**
   * (`onHello`'s takeover). One function that did both is what would have made a takeover look
   * like a departure and delete the visitor's ship from the world.
   */
  function removeRows(match) {
    const gone = [];
    for (let i = guests.length - 1; i >= 0; i--) {
      if (!match(guests[i])) continue;
      gone.unshift(guests[i]);
      guests.splice(i, 1);
    }
    for (const row of gone) {
      if (row.peerId) {
        peerNames.delete(row.peerId);
        greetedPeers.delete(row.peerId);
      }
      if (!row.peerId || guestPeer.get(row.guestId) === row.peerId) guestPeer.delete(row.guestId);
      livePrint.delete(row.guestId);
      lastSent.delete(row.guestId);
    }
    return gone;
  }

  /** A row's pilot really has gone: mark the record `left`, tell the world, tell everybody. */
  function retireRows(gone) {
    if (!gone.length) return false;
    // The record, so a returning pilot is not locked out of its own suitcase.
    let stored = save.read();
    const seen = new Set();
    for (const g of gone) {
      if (seen.has(g.guestId)) continue;
      seen.add(g.guestId);
      const record = stored?.world?.guests?.[g.guestId];
      if (record) stored = putGuest(stored, g.guestId, { ...record, left: true, lastSeen: Date.now() });
      // The ship leaves the simulation (slice 4's docked visitor).
      emit("mp-guest-left", { guestId: g.guestId, name: g.name });
      noteLine("Tallow Reach", `${g.name} left.`);
    }
    if (stored) save.write(stored);
    // Everybody else's list, so a third pilot does not see a ghost either.
    publishPresence();
    return true;
  }

  /**
   * Host side: the guest told us it is leaving (`bye`, slice 5) — a tab closing, "Go home",
   * or "Leave".
   *
   * **The final copy is written back before the pilot is taken out of the world**, which is
   * the whole reason the message exists: a guest that closes its tab holds a copy up to
   * `suitcaseRepeatSec` old, and the newest version of it is here, in the host's live record.
   * Writing it back means the last few seconds of the visit survive either way — in the copy
   * that goes back over the wire if the tab is still listening, and in this world if it is not.
   */
  function onBye(message, peerId) {
    if (role !== "host") return;
    const guestId = message.guestId || guestIdForPeer(peerId);
    if (!guestId) { forgetPeer(peerId); return; }
    const row = guests.find(entry => entry.guestId === guestId) || null;
    if (row?.peerId) guestPeer.set(guestId, row.peerId);
    // Flush any change that is still waiting on its own timer, so the final copy is the newest.
    const pending = pendingWrite.get(guestId);
    if (pending?.timer) clearTimeout(pending.timer);
    pendingWrite.delete(guestId);
    writeBack(guestId);
    retireRows(removeRows(entry => entry.guestId === guestId && (!peerId || !entry.peerId || entry.peerId === peerId)));
  }

  /** Host side: this peer's guest said "still here" (the `ping` heartbeat). */
  function markPeerSeen(peerId) {
    const guestId = guestIdForPeer(peerId);
    if (!guestId) return;
    const next = seenGuest(save.read(), guestId, Date.now());
    save.write(next);
  }

  /**
   * Host side: the guest adopted the copy we wrote. Nothing to do but note it — the write
   * already happened, and `compare` protects against a copy arriving out of order.
   */
  function onSuitcaseAck() {
    // The host receives nothing it needs to act on: the copy it sent was already stored
    // before it left. (A guest answers a suitcase by storing it — `onSuitcase` above.)
    return undefined;
  }

  /** Is there room for one more visiting pilot? (`NET.maxGuests`, a live-session limit.) */
  function remoteCanJoin() {
    return guests.length < NET.maxGuests;
  }

  /**
   * Host side: something the guest owns changed, so raise `rev` and write the copy back.
   *
   * Throttled twice over: no more than one raise per `NET.revStepMs`, and the message
   * goes `NET.snapshotSec` after the *last* change, so a busy second is one snapshot
   * rather than sixty. The plan asks for exactly this.
   */
  function noteGuestChanged(guestId) {
    if (role !== "host") return false;
    const now = Date.now();
    const last = lastWrite.get(guestId) || 0;
    if (now - last < NET.revStepMs) {
      // Too soon: make sure one is pending, and let its own timer do the work.
      if (!pendingWrite.has(guestId)) scheduleWrite(guestId);
      return false;
    }
    lastWrite.set(guestId, now);
    scheduleWrite(guestId);
    return true;
  }

  function scheduleWrite(guestId) {
    const existing = pendingWrite.get(guestId);
    if (existing?.timer) clearTimeout(existing.timer);
    const timer = setTimeout(() => {
      pendingWrite.delete(guestId);
      writeBack(guestId);
    }, Math.max(0, NET.snapshotSec) * 1000);
    if (typeof timer?.unref === "function") timer.unref();
    pendingWrite.set(guestId, { at: Date.now(), timer });
  }

  /**
   * Host side: read the visiting pilot's LIVE profile back out as a suitcase and send it.
   *
   * The records themselves belong to `sim/` (a ship with a fit, a hold, Hull HP), so this
   * asks for the live profile through the bus and answers on `mp-guest-bundle`. When
   * there is no live record (the guest is docked out of the world, or `sim/` is not
   * running — a test) the stored bundle is sent unchanged, which is still a correct copy.
   */
  function writeBack(guestId) {
    const current = save.read();
    const record = current?.world?.guests?.[guestId];
    if (!record) return false;
    const live = liveBundleFor(guestId);
    const rev = Math.max(whole(record.rev) + 1, whole(live?.rev));
    const bundle = live
      ? bundleFromProfile(live.profile, {
        lockers: live.lockers || [],
        previous: { ...record.bundle, guestId, worldId, hostName: name },
        name: record.name,
        rev,
      })
      : { ...(record.bundle || {}), rev };
    if (!bundle?.profile) return false;
    const stored = putGuest(current, guestId, { rev, bundle: { ...bundle, token: "" }, lastSeen: Date.now() });
    save.write(stored);
    const peerId = guestPeer.get(guestId) || null;
    const message = cleanMessage("suitcase", {
      guestId,
      name: record.name,
      epoch: whole(record.epoch),
      rev,
      bundle: { ...bundle, token: "" },
    });
    if (message) send(message, peerId);
    lastSent.set(guestId, Date.now());
    publish();
    return true;
  }

  /**
   * **Host side: is the visiting pilot still what this world thinks it is?** (slice 5)
   *
   * This is the loop the plan promised and nothing ran: `writeBack` existed from slice 4 but
   * its only caller was `noteGuestChanged`, which nobody ever called — so a guest's suitcase
   * only ever held the copy it arrived with, and every credit it earned, every stack it
   * mined and every module it fitted in the friend's world was lost when it came home. The
   * owner would have seen it as "coming home rolls my save back".
   *
   * It is a *comparison*, not a timer that writes: every `NET.snapshotSec` the host asks
   * `sim/` what each visitor looks like now, and only a real difference raises `rev`. An
   * unchanged copy is re-sent every `NET.suitcaseRepeatSec` so a packet lost on a bad channel
   * heals without anybody reconnecting.
   */
  function syncGuests() {
    if (role !== "host" || !on) return 0;
    let changed = 0;
    for (const guestId of [...guestPeer.keys()]) {
      const live = liveBundleFor(guestId);
      if (!live?.profile) continue;
      let print = "";
      try {
        print = JSON.stringify({ profile: live.profile, lockers: live.lockers || [] });
      } catch (e) {
        continue;                                   // unserialisable: not something to send
      }
      const before = livePrint.get(guestId);
      livePrint.set(guestId, print);
      if (print !== before) {
        if (noteGuestChanged(guestId)) changed += 1;
        continue;
      }
      if (Date.now() - (lastSent.get(guestId) || 0) > NET.suitcaseRepeatSec * 1000) writeBack(guestId);
    }
    return changed;
  }

  function startGuestSync() {
    if (guestSync || role !== "host") return;
    guestSync = setInterval(syncGuests, Math.max(0.5, NET.snapshotSec) * 1000);
    if (typeof guestSync?.unref === "function") guestSync.unref();
  }

  /**
   * The live profile of a visiting pilot, as `sim/` knows it.
   *
   * `sim/` cannot be imported from here (the arrow points the other way), so this asks
   * on the bus with a synchronous "answer me now" event: `main.js` listens and fills in
   * the payload. With no listener (headless tests) the answer is simply absent, and the
   * stored bundle is used — never a guess.
   */
  function liveBundleFor(guestId) {
    const request = { guestId, profile: null, lockers: [], answered: false };
    try {
      emit("mp-guest-bundle-request", request);
    } catch (e) { /* a broken listener must not break a session */ }
    return request.answered ? request : null;
  }

  function onRefuse(message) {
    // Slice 5: **the same pilot is open in a newer window.** This connection is over — the
    // newer one has the pilot — but nothing about the save changes: the marker and the
    // suitcase stay exactly where they are, so the pilot is not lost, it is elsewhere.
    if (message.reason === "replaced") {
      try {
        emit("mp-notice", message.message || "This pilot was opened in another window, which has it now.");
      } catch (e) { /* a broken screen must not break a session */ }
      stop({ quiet: true });
      return;
    }
    noteLine("Tallow Reach", message.message || "The host could not let you in.");
  }

  function onPresence(message) {
    if (role !== "guest") return;
    guests.length = 0;
    for (const entry of message.guests || []) upsertGuest(entry);
    publish();
  }

  function upsertGuest(entry) {
    if (!entry?.guestId) return;
    // A `welcome` and a `presence` list carry no peer id, and spreading one over a known
    // guest used to WIPE the peer id — so that guest could never be matched to the peer
    // that left, and stayed in the list for ever (playtest 14).
    const clean = { ...entry };
    if (!clean.peerId) delete clean.peerId;
    const at = guests.findIndex(g => g.guestId === entry.guestId);
    if (at >= 0) guests[at] = { ...guests[at], ...clean };
    else guests.push({ guestId: entry.guestId, name: entry.name || "Guest", docked: !!entry.docked, peerId: entry.peerId || null });
  }

  /**
   * Send one clean message.
   *
   * A message *for a peer* goes over the channel, because only the channel knows who that
   * is. A message for whoever is there goes over every wire that is up: the channel for
   * the broker's peers and the paste link for the one code-jointed pilot. (Sending a
   * handled-for-you message down the wrong wire was how a welcome could reach the wrong
   * pilot once a host had both.)
   */
  function send(message, peerId = null) {
    const clean = typeof message?.t === "string" ? cleanMessage(message.t, message) : null;
    if (!clean) return false;
    if (peerId) return channel ? channel.send(peerId, clean) : false;
    let sent = false;
    if (paste && paste.live()) sent = paste.send(clean) || sent;
    if (channel) {
      const count = channel.broadcast(clean);
      sent = count > 0 || sent;
    }
    return sent;
  }

  /** Say a chat line as this browser's display name. */
  function say(text) {
    const line = cleanMessage("chat", { text, from: shown, at: Date.now() });
    if (!line) return false;
    const sent = send(line);
    if (sent) noteLine(shown, line.text, true);
    return sent;
  }

  /** Host: tell every guest who is here, which is the list they draw. */
  function publishPresence() {
    if (role !== "host") return;
    send({ t: "presence", guests: guests.map(g => ({ guestId: g.guestId, name: g.name, docked: g.docked })) });
  }

  /**
   * The guest's hello: who I am, on which build, for which world, with my secret.
   *
   * **Only `greeted` if it actually left.** `join()` returns as soon as the room is open,
   * and the other pilot is introduced a moment later, so the first attempt usually finds
   * nobody to send to. Latching `greeted` regardless (which this did until 2026-11-21)
   * meant the hello was dropped and never retried: the host never heard the guest, so it
   * never welcomed it, never listed it and never checked its token — while chat, which
   * broadcasts on every line, worked. The guest's screen said "connected" and the host's
   * list stayed empty.
   *
   * A hello is per peer (two guests are two hellos) and is re-sent on every peer that
   * arrives, which is also what a reconnect will need in slice 5.
   */
  function sayHello(peerId = null) {
    if (role !== "guest") return false;
    // A code-jointed connection has exactly one pilot and no peer id, so the hello is a
    // plain broadcast over that wire (and once is enough).
    if (paste && paste.live()) {
      if (greeted) return false;
      const sent = send({ t: "hello", v: SAVE_VERSION, worldId, guestId: ownGuestId(), name, token });
      if (sent) greeted = true;
      return sent;
    }
    if (!peerId) return false;              // otherwise a hello names one pilot, never a crowd
    if (greetedPeers.has(peerId)) return false;
    const message = { t: "hello", v: SAVE_VERSION, worldId, guestId: ownGuestId(), name, token };
    const sent = send(message, peerId);
    if (sent) {
      greeted = true;
      greetedPeers.add(peerId);
    }
    return sent;
  }

  /**
   * Say hello to every peer the channel can see. Called when the room opens and whenever
   * the channel reports it is connected; both are guesses about when the other browser
   * becomes known, and `greetedPeers` makes the second guess free. A broadcast hello is
   * deliberately not used: the host would admit the same guest once per copy.
   */
  function greetEveryone() {
    if (role !== "guest" || !channel) return false;
    let any = false;
    for (const peerId of channel.peers()) any = sayHello(peerId) || any;
    return any;
  }

  async function start() {
    channel = makeChannel({
      role,
      worldId,
      useTurn: true,
      onState: status => {
        publish();
        if (status.state === "connected") greetEveryone();
      },
      onData: ({ peerId, ...message }) => receive(message, peerId),
      onPeer: event => {
        // Somebody is in the room: whatever we were worried about, it is not "nobody came".
        if (event?.kind === "join") { stalled = false; clearStallTimer(); }
        if (event?.kind === "leave" && event.peerId) {
          if (role === "host") {
            forgetPeer(event.peerId);
          } else if (role === "guest" && welcomed) {
            const hostGone = hostPeerId ? event.peerId === hostPeerId : (channel && channel.peers().length === 0);
            if (hostGone) {
              markHostLost("The host closed the game.");
              return;
            }
          }
        }
        if (role === "host") { publishPresence(); armHostWait(); }
        // A guest says hello to the pilot that just appeared. This is the retry that
        // makes the handshake happen at all (see `sayHello`).
        if (role === "guest" && event?.kind === "join") sayHello(event.peerId || null);
        publish();
      },
    });
    publish();
    await channel.join();
    greetEveryone();
    if (role === "guest") { startHelloRetry(); watchPage(); }
    if (role === "host") { armHostWait(); startGuestSync(); }
    armStallTimer();
    startKeepalive();
    // Ask the relays once the room exists, so Connection details is never blank about them.
    checkRelays();
    publish();
    return true;
  }

  /* The paste-code fallback: the same session, a different wire. */

  async function startCodes() {
    if (role !== "host") return null;
    paste = createPasteLink({
      worldId,
      onState: status => {
        publish();
        if (status.state === "connected" && paste?.live()) sayHello();
      },
      onData: message => receive(message, null),
    });
    const offer = await paste.offer();
    noteCodePaths();
    codes = { offer, answer: null };
    publish();
    return codes;
  }

  async function finishCodes(answer) {
    if (!paste) return { ok: false, message: "Make a fresh offer first." };
    const done = await paste.complete(answer);
    publish();
    if (!done) return { ok: false, message: paste.state().reason || "That code was not accepted." };
    codes = { ...(codes || { offer: "" }), answer };
    return { ok: true };
  }

  async function acceptCodes(offer) {
    if (role !== "guest") return { ok: false, message: "Only the guest accepts a code." };
    // The code names the world it invites us to; the handshake checks the same id.
    const invited = codeWorldId(offer);
    if (invited) worldId = invited;
    paste = createPasteLink({
      worldId,
      onState: status => {
        publish();
        // Only greet once there is really a channel: the code path reports "connected"
        // when the channel opens, and `live()` is the same question asked again.
        if (status.state === "connected" && paste?.live()) sayHello();
      },
      onData: message => receive(message, null),
    });
    const answer = await paste.accept(offer);
    noteCodePaths();
    if (answer) startHelloRetry();
    publish();
    if (!answer) return { ok: false, message: paste.state().reason || "That code was not accepted." };
    codes = { offer: null, answer };
    return { ok: true, answer };
  }

  /**
   * Keep saying hello until the host answers.
   *
   * A hello used to be sent once per peer, and latched as done. On one machine the data
   * channel is open almost immediately, so that looked fine. Between two machines it can
   * open seconds later — and a hello sent into it before it opened is gone, which is how a
   * guest ended up in a world of its own with the host's messages on their way but never
   * its name in the list (owner's playtest 3). The retry stops the moment a welcome lands,
   * and after `NET.helloWaitSec` the player is told, rather than left looking joined.
   */
  function startHelloRetry() {
    // Hosts never greet; a guest that is already welcomed has nothing to retry.
    if (role !== "guest" || welcomed) return;
    if (helloRetry) clearInterval(helloRetry);
    helloRetry = setInterval(() => {
      if (!on || welcomed) { clearInterval(helloRetry); helloRetry = 0; return; }
      // `greetedPeers` stops a repeat hello to the same peer — but a retry exists because
      // the first send "succeeded" into a channel that had nobody at the other end, which
      // is exactly the case that latch cannot tell apart. So it is cleared each round.
      greetedPeers.clear();
      greeted = false;
      greetEveryone();
    }, NET.helloRetrySec * 1000);
    if (typeof helloRetry?.unref === "function") helloRetry.unref();
    if (helloWait) clearTimeout(helloWait);
    helloWait = setTimeout(() => {
      if (!on || welcomed) return;
      // Two different failures, two different sentences: a room with a peer in it that
      // never answers is a blocked connection; a room with nobody in it is a link pointing
      // at a world nobody is hosting.
      const peers = channel ? channel.peers().length : 0;
      if (peers && !relayTried) return escalateToRelay();
      const said = peers
        ? "Still no answer from the host. The two browsers found each other, but messages are not getting through even through the relay — try the paste-code path."
        : "Nobody else is in that room yet. Both screens must show the same World id and the host's switch must read On (Pause > Open Multiplayer > Connection details). If both show 1 browser in the room, the relay that introduces you is not working: use the codes instead — the host presses “No relay? Copy/paste codes”, and you paste the code it gives into the box on the main menu.";
      try {
        emit("mp-notice", said);
      } catch (e) { /* a broken screen must not break a session */ }
    }, NET.helloWaitSec * 1000);
    if (typeof helloWait?.unref === "function") helloWait.unref();
  }

  /**
   * After `NET.helloWaitSec` with nobody in the room, say so once and let the screen offer
   * the code path. It is not an error state — a host may simply be waiting — so it never
   * changes the connection, only what the screen suggests.
   */
  function armStallTimer() {
    clearStallTimer();
    if (!on) return;
    stallTimer = setTimeout(() => {
      stallTimer = 0;
      if (!on || !channel) return;
      if (channel.peers().length) return;
      stalled = true;
      publish();
    }, NET.helloWaitSec * 1000);
    if (typeof stallTimer?.unref === "function") stallTimer.unref();
  }

  function clearStallTimer() {
    if (stallTimer) { clearTimeout(stallTimer); stallTimer = 0; }
  }

  function guestProgress(status) {
    if (welcomed) return { pct: 100, label: "Connected!" };
    if (greeted) return { pct: 85, label: "Handshaking with host…" };
    const hasPeer = (channel && channel.peers().length > 0) || status?.state === "connected";
    if (hasPeer) return { pct: 70, label: "Found host, connecting…" };
    if (status?.state === "finding") return { pct: 40, label: "Looking for host…" };
    return { pct: 15, label: "Joining relays…" };
  }

  function resolveWelcome(result) {
    while (welcomeWaiters.length) {
      const done = welcomeWaiters.shift();
      done(result);
    }
  }

  function waitForWelcome(timeoutMs = 20000) {
    if (welcomed) return Promise.resolve({ ok: true });
    if (!on) return Promise.resolve({ ok: false, message: "Connection cancelled." });
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        const idx = welcomeWaiters.indexOf(finish);
        if (idx >= 0) welcomeWaiters.splice(idx, 1);
        resolve({ ok: false, message: "Could not reach the host. Check the link or try paste codes." });
      }, timeoutMs);
      function finish(result) {
        clearTimeout(timer);
        resolve(result);
      }
      welcomeWaiters.push(finish);
    });
  }

  /**
   * End this session. `quiet` is the one exception to the goodbye: a guest that was **replaced
   * by a newer window** must not say "I am leaving", because the pilot has not left — the host
   * would take the ship out of its world and mark the record `left` for a pilot that is
   * standing right there in the other window.
   */
  function stop({ quiet = false } = {}) {
    // Slice 5: tell the host on the way out, while there is still a wire to say it on. A
    // `bye` makes the departure immediate and lossless (the final copy is written back and
    // the record is marked `left` at once instead of when the browser's channel finally
    // closes). It is not a promise: a crashed tab sends nothing, and the host still copes.
    if (!quiet) {
      try {
        leaveWord();
      } catch (e) { /* a goodbye is never worth throwing over */ }
    }
    on = false;
    resolveWelcome({ ok: false, message: "Connection cancelled." });
    if (keepalive) { clearInterval(keepalive); keepalive = 0; }
    if (helloRetry) { clearInterval(helloRetry); helloRetry = 0; }
    if (helloWait) { clearTimeout(helloWait); helloWait = 0; }
    if (hostWait) { clearTimeout(hostWait); hostWait = 0; }
    if (guestSync) { clearInterval(guestSync); guestSync = 0; }
    for (const { timer } of pendingWrite.values()) if (timer) clearTimeout(timer);
    pendingWrite.clear();
    clearStallTimer();
    unwatchPage();
    try {
      channel?.leave();
      paste?.leave();
    } catch (e) { /* ignore */ }
    channel = null;
    paste = null;
    codes = null;
    guests.length = 0;
    hostLost = false;
    lostReason = "";
    if (active === session) active = null;
    publish();
  }

  /* --- slice 5: the host went away, and the pilot did not ------------------------- */

  /**
   * The host is gone: its browser closed, or nothing has come back from it (`checkHostAlive`).
   * **The pilot is not thrown away with it.**
   *
   * This states the fact and nothing else. `snapshot().hostLost` is true and the bus hears
   * `mp-host-left { reason, hostName }`; `ui/multiplayer.js` decides what the player gets, and
   * that decision is the owner's (2026-11-24): *"returned to the main menu with a prompt saying
   * something like lost connection to host. Dismissing this returns you to main menu. Like
   * Minecraft."* So the UI stops the session and shows the prompt, and joining again is an
   * ordinary join.
   *
   * **The save is not touched here.** The marker and the suitcase stay exactly as they were,
   * so *Bring pilot home* still works with the host gone for ever — that is the whole reason
   * a lost host is not a lost pilot.
   *
   * Said once per loss: a channel can announce a departing peer more than once while it
   * settles, and three prompts in a row is how a player learns to ignore a screen.
   */
  function markHostLost(reason) {
    const said = reason || "The host's browser went away.";
    if (hostLost) {
      lostReason = said;
      return false;
    }
    hostLost = true;
    lostReason = said;
    // This browser is no longer in the host's world, whatever its list last said.
    guests.length = 0;
    // The hello is what finds the host again, and it is sent to a peer — so the latches that
    // stop it being repeated have to go with the loss.
    greetedPeers.clear();
    greeted = false;
    publish();
    try {
      emit("mp-host-left", { reason: said, hostName });
    } catch (e) { /* a broken screen must not break a session */ }
    return true;
  }

  /**
   * **A host that has stopped answering is a host that is gone** (owner, 2026-11-24: *"or the
   * guest loses connection to the host mid game"*).
   *
   * Waiting for the transport to say so is not enough: a crashed browser sends no `leave`, and
   * a channel can take a minute to give up on a peer, which is a minute of a player looking at
   * a world it is no longer in. The guest already says `ping` every `NET.heartbeatSec` and the
   * host answers `pong`, so silence for `NET.lastSeenSec` is a fair sign — the same number the
   * host uses to say a guest is away, for the same reason.
   *
   * Takes the clock so a test can hand it one; the keepalive passes the real one.
   */
  function checkHostAlive(now = Date.now()) {
    if (role !== "guest" || !on || !welcomed) return false;
    if (!lastHostHeard) { lastHostHeard = now; return false; }
    if (now - lastHostHeard <= Math.max(6, NET.lastSeenSec) * 1000) return false;
    return markHostLost("The host stopped answering, so the connection to its world is gone.");
  }

  /**
   * The guest's goodbye (`bye`, slice 5), sent when this session stops **and** when the page
   * is being closed. Both are ordinary departures the host can act on at once.
   */
  function leaveWord() {
    if (!on || role !== "guest" || !welcomed) return false;
    const message = cleanMessage("bye", { guestId: ownGuestId(), name });
    if (!message) return false;
    return send(message, hostPeerId || null);
  }

  /**
   * Listen for the page going away, so a closed tab is a `bye` rather than a silence.
   *
   * `pagehide` is the one event every browser fires on a close, a reload and a
   * back-navigation; `beforeunload` covers the older ones. Nothing may be awaited here — a
   * closing page gets no more turns — which is exactly why the message is sent synchronously
   * and the host does the storing.
   */
  function watchPage() {
    if (pageHook || typeof globalThis.addEventListener !== "function") return;
    pageHook = () => {
      try { leaveWord(); } catch (e) { /* nothing can be done on the way out */ }
    };
    globalThis.addEventListener("pagehide", pageHook);
    globalThis.addEventListener("beforeunload", pageHook);
  }

  function unwatchPage() {
    if (!pageHook || typeof globalThis.removeEventListener !== "function") { pageHook = null; return; }
    globalThis.removeEventListener("pagehide", pageHook);
    globalThis.removeEventListener("beforeunload", pageHook);
    pageHook = null;
  }

  /**
   * A room can die quietly: a backgrounded tab, a laptop that slept, a relay that dropped us.
   * The transport reports `lost`, and a `lost` room will never recover on its own, so the
   * session reopens it — at most once every ten seconds, and never while one is starting.
   *
   * Slice 5 rides the same timer to say "still here" (`ping`), which is what keeps a host's
   * `lastSeen` honest between copies of the pilot.
   */
  function startKeepalive() {
    if (keepalive) return;
    keepalive = setInterval(async () => {
      if (!on || !channel) return;
      if (role === "guest" && welcomed) send({ t: "ping", at: Date.now() });
      // ...and the same tick asks whether the host is still there at all.
      checkHostAlive();
      const status = channel.state();
      const dead = status.state === "lost" || status.state === "closed";
      if (!dead) return;
      if (Date.now() - lastRestart < 10_000) return;
      lastRestart = Date.now();
      greetedPeers.clear();
      greeted = false;
      welcomed = false;
      await channel.restart({ useTurn: relayTried });
      if (role === "guest") greetEveryone(); else publishPresence();
      publish();
    }, Math.max(2, NET.heartbeatSec) * 1000);
    if (typeof keepalive?.unref === "function") keepalive.unref();
  }

  /**
   * The host's half of the same failure: a browser is in the room, nobody was admitted.
   *
   * A relayed path needs a relay candidate from *each* end, so the host has to escalate too —
   * it is no good the guest retrying through a relay that the host is not using.
   */
  function armHostWait() {
    if (role !== "host" || hostWait || relayTried) return;
    hostWait = setTimeout(() => {
      hostWait = 0;
      if (!on || !channel || !channel.peers().length) return;
      if (guests.length) return;             // somebody got in; the pipe works
      escalateToRelay();
    }, NET.helloWaitSec * 1000);
    if (typeof hostWait?.unref === "function") hostWait.unref();
  }

  /**
   * The direct attempt found the other browser but nothing got through: join again through a
   * relay server (both sides do this, because a relayed path needs a relay candidate from
   * each end). This is the fix for two machines on a home network that will not pass a
   * packet between them — same machine always works, and that is what hid the problem.
   */
  async function escalateToRelay() {
    if (relayTried || !channel || !channel.peers().length) return false;
    relayTried = true;
    try {
      emit("mp-notice", "The direct connection did not open. Trying a relay server — this can take a few seconds.");
    } catch (e) { /* a broken screen must not break a session */ }
    publish();
    await channel.restart({ useTurn: true });
    greetedPeers.clear();
    greeted = false;
    if (role === "guest") greetEveryone();
    else publishPresence();
    publish();
    return true;
  }

  /**
   * Say, once, what a freshly made code can actually do.
   *
   * The codes worked on the same wifi and failed on 4G (owner, playtest 8). That is a code
   * with no relay path: two machines behind different NATs have no address they can both
   * reach, so the only thing that saves it is a TURN candidate. Saying so before the code is
   * sent is the difference between a puzzle and a diagnosis.
   */
  function noteCodePaths() {
    const paths = paste && typeof paste.paths === "function" ? paste.paths() : null;
    if (!paths) return;
    const said = paths.relay > 0
      ? `This code has a relay path (${paths.relay}), so it works between different networks too.`
      : "This code has no relay path — only local addresses. It will work between machines on the same network, and fail across networks such as 4G or a friend's house.";
    try {
      emit("mp-notice", said);
    } catch (e) { /* a broken screen must not break a session */ }
  }

  /** Ask the signalling relays how they are, so the screen can say it. */
  async function checkRelays(options) {
    if (!channel || typeof channel.checkRelays !== "function") return null;
    const status = await channel.checkRelays(options);
    publish();
    return status;
  }

  /** The screen's "Reconnect" button: another attempt, through the relay this time. */
  async function reconnect() {
    if (!channel) return false;
    relayTried = true;
    greetedPeers.clear();
    greeted = false;
    welcomed = false;
    const done = await channel.restart({ useTurn: true });
    if (role === "guest") {
      greetEveryone();
      startHelloRetry();
    } else {
      publishPresence();
    }
    publish();
    return !!done;
  }

  const session = {
    get on() { return on; },
    get role() { return role; },
    get name() { return shown; },
    get worldId() { return worldId; },
    start,
    stop,
    say,
    sayHello,
    snapshot,
    publish,
    receive,
    startCodes,
    finishCodes,
    acceptCodes,
    waitForWelcome,
    // Slice 4: the guest's "Bring my pilot" press, and the in-world prompt asking for it.
    bringPilot,
    // Slice 5: the host's two-second "is the visitor still what we think?" check — the same
    // function its timer runs, so a test can ask without waiting two seconds.
    syncGuests,
    // Slice 5: the guest's own watchdog, on the same seam — a test hands it a clock instead of
    // waiting twenty seconds for a real one.
    checkHostAlive,
    leaveWord,
    reconnect,
    escalateToRelay,
    checkRelays,
    channel: () => channel,
    paste: () => paste,
    /**
     * Test-only hook: pretend a message arrived from a peer. In the game, the channel's
     * `onData` calls `receive`; a test has no channel, so it calls this instead.
     */
    reachFrom: (message, peerId = "peer") => receive(message, peerId),
  };
  return session;
}

/* ------------------------------------------------------------------------- */
/* What a screen calls                                                        */
/* ------------------------------------------------------------------------- */

/* ------------------------------------------------------------------------- */
/* Names                                                                      */
/* ------------------------------------------------------------------------- */

/**
 * The name a pilot actually answers to in a world (owner's rule, playtest 2 of 2026-11-21).
 *
 * A name is a label, not an identity: the secret in the link is the identity. Two pilots
 * who both typed `Acey` must still be tellable apart in the list and in chat, so the host
 * hands out the first free variant — `Acey`, then `Acey*`, then `Acey**`. Stars, not
 * numbers, because a trailing `2` reads like a different person and a star reads like what
 * it is: a name that was already taken.
 *
 * The suffix is trimmed off the base rather than pushed past `NET.nameMax`, so a renamed
 * pilot still fits the wire's name field.
 */
export function uniqueName(wanted, taken = []) {
  const base = cleanName(wanted) || "Pilot";
  const used = new Set((Array.isArray(taken) ? taken : []).map(entry => cleanName(entry)).filter(Boolean));
  if (!used.has(base)) return base;
  for (let stars = 1; stars < 40; stars += 1) {
    const suffix = "*".repeat(stars);
    const name = base.slice(0, Math.max(1, NET.nameMax - suffix.length)) + suffix;
    if (!used.has(name)) return name;
  }
  return `${base.slice(0, 1)}${"*".repeat(Math.max(1, NET.nameMax - 1))}`;
}

/** Send a chat line. False when nobody is listening, or the line is empty. */
export const say = text => (active ? active.say(text) : false);

/** Another attempt, through a relay. The screen's "Reconnect" button. */
export const reconnect = () => (active ? active.reconnect() : false);

/** Ask the signalling relays whether they answer from this browser. */
export const checkRelays = options => (active ? active.checkRelays(options) : Promise.resolve(null));

/**
 * Test the relay (TURN) servers this browser would use, free ones included.
 *
 * This is the only honest way to answer "why does 4G fail": a relayed ICE candidate means the
 * server authenticated us and will forward packets; none means the servers are down, the login
 * is wrong, or the network blocks them — and that is a relay problem, not a game one.
 */
export const testTurn = servers => checkTurnServers(servers).then(result => ({ ...result, sentence: turnSummary(result) }));

/**
 * Remember the player's own relay server (or forget it with `null`), then republish so the
 * screen redraws. Stored with the name and the switches: it is a property of this browser.
 */
export function saveRelay(relay) {
  const record = writeSettings({ ...readSettings(), relay: relay || null });
  if (active) active.publish?.();
  return record.relay;
}

/**
 * Stop whatever is running.
 *
 * `quiet: true` leaves without a `bye` — for a session whose other end is already gone (a lost
 * host, slice 5), where the goodbye has nobody to reach and writing one to a dead wire only
 * makes the silence look deliberate.
 */
export function stop(options) {
  if (!active) return false;
  active.stop(options);
  active = null;
  return true;
}

/**
 * The pilot walks out of a friend's world and back into its own (owner, playtest 7).
 *
 * Visiting is a *connection*, not a mode: opening your own world from the main menu must end
 * the session, not leave a guest hailing a world it is no longer looking at. The host's own
 * world is different — going to the menu and back is still the same room, so hosting is left
 * alone. The suitcase half (`state.away`) is handed back by the caller, which owns saves.
 *
 * Returns true when something was actually left.
 */
export const shouldLeaveVisit = snap => !!snap && snap.on === true && snap.role === "guest";

export function leaveVisit() {
  if (!shouldLeaveVisit(active ? active.snapshot() : null)) return false;
  const worldId = active.worldId || null;
  stop();
  writeSettings({ ...readSettings(), enabled: false });
  return worldId || true;
}

/**
 * "Bring my pilot" (slice 4) — the press that actually puts the pilot on the wire.
 *
 * Separate from `joinWorld` on purpose (see `onWelcome`): joining a friend's world to look
 * around costs nothing, and only this refuses to leave your own world behind. Returns
 * `{ ok, message }` so a screen can say what happened without reading a marker.
 */
/**
 * "Bring my pilot" (slice 4), as a screen calls it.
 *
 * The session that is running owns the packing (it holds the token, the world id and the
 * wire), so this only finds it. With no session there is nothing to bring a pilot TO —
 * a visit begins by joining — and the sentence says which press is missing.
 */
export function bringPilot() {
  if (!active || typeof active.bringPilot !== "function") {
    return { ok: false, message: "Join your friend's world first, then bring your pilot." };
  }
  return active.bringPilot();
}

/**
 * "Bring my pilot home" from the TITLE screen (playtest 14).
 *
 * The card's two buttons used to do nothing, and the reason was one line: from the title
 * there is no open-world save loaded to unpack into (`currentRootSave()` describes whatever
 * mode happens to be active), so `bringPilotHome` was handed a save with no profile and
 * declined — and `ui/menu.js`'s `comeHome` returned false before it restored anything. The
 * player was then stuck: Rejoin did nothing, a new link was refused with "bring it home
 * first", and nothing on the card could bring it home.
 *
 * So the unpacking happens against the mode save that is *stored*, which is where the
 * frozen pilot actually lives, and the result is written straight back through the same
 * `saveKit`. The marker on the live state is cleared here too, because the title screen
 * reads `state.away` and a card that cannot go away is the bug.
 */
export function bringPilotHomeAtMenu({ mode = "open" } = {}) {
  const live = liveSave();
  // **`liveSave()` is a MODE save, not the dual-mode envelope** (playtest 15).
  //
  // `saveKit.read` returns `sanitizeSave(...)` — one pilot with `profile`, `world` and
  // `away` — while a root save is `{ v, mode, open, campaign }`. This function was written
  // against the envelope and indexed `root[mode]`, which on a mode save is `undefined`
  // every single time, so "Bring pilot home" could never work from the title: it refused
  // before it looked at the suitcase. Accept both, because the seam is injectable (a test
  // or a host may hand the session a root), and a wrong guess here is a pilot trapped on
  // the away card.
  const modeSave = isModeSave(live) ? live : (live && typeof live === "object" ? live[mode] : null);
  if (!modeSave || typeof modeSave !== "object") {
    return { ok: false, message: "Your pilot's save could not be read, so it cannot come home yet. Do not reset — tell the host." };
  }
  // Coming home is about ONE pilot, so everything below works on the mode save, and only
  // an actual envelope is written back as an envelope (`rootWithMode`).
  const root = isModeSave(live) ? null : live;
  const half = modeSave;
  if (!half.away) {
    // Nothing stored to unpack: the live state is all there is. Clear it rather than trap
    // the player on a card about a pilot that is not away.
    state.away = null;
    return { ok: true, save: root, message: "Your pilot is home." };
  }
  const done = bringPilotHome(half);
  if (!done.ok) return done;
  // Write back in the shape the seam gave us: a mode save as a mode save (the game's own
  // seam installs the whole pilot), an envelope as an envelope.
  const next = root ? { ...root, [mode]: done.save } : done.save;
  saveKit.write(next);
  // `write` is the host's narrow seam and only ever takes the guest list and the world id,
  // so the returned pilot has to be installed too or the suitcase's contents never reach
  // the stored save (LESSONS L34 — the same trap that made cargo stick after coming home).
  if (saveKit.install) saveKit.install(next);
  state.away = null;
  if (active && active.role === "guest") {
    try { active.stop(); } catch (e) { /* the host may be long gone */ }
    active = null;
  }
  return { ok: true, save: next, modeSave: done.save, message: done.message };
}

/**
 * One pilot's half of a save (`profile`, `world`, `away`) — as opposed to the dual-mode
 * envelope (`{ v, mode, open, campaign }`) that holds two of them.
 *
 * The difference matters: `saveKit.read()` hands back a MODE save, and reading it as an
 * envelope yields `undefined` for every mode. Nothing else in this file needs the
 * distinction, so this is the one place that decides it.
 */
function isModeSave(save) {
  return !!save && typeof save === "object" && !Array.isArray(save) &&
    !!save.profile && typeof save.profile === "object";
}

/**
 * **Is a newer copy of this pilot waiting in the friend's world?** (owner, playtest 18)
 *
 * The owner's rule: the "your pilot is in Ada's world" card shows *only* when the player tries
 * to open their own world and the copy online is newer. This answers that question from the
 * STORED save, so the title screen can ask it without loading a world, and Open World can ask it
 * again at the moment of pressing.
 *
 * `mine` is the frozen travelling half left in the home save by `checkOut` — it copies the
 * pilot's own fields into the suitcase and leaves them in place, so the home profile still holds
 * the pilot exactly as it left, which is the baseline this asks about. `theirs` is the suitcase
 * under `away` (the copy the host keeps writing back), in the same shape. See
 * `custody.isNewerCopy` for the rules and for why a tie is NOT newer.
 *
 * Reads, never writes. Returns false when there is no away marker or no readable pair, so a
 * damaged marker can never raise a card that the player cannot dismiss.
 */
export function newerCopyAway({ mode = "open" } = {}) {
  let live = null;
  try {
    live = liveSave();
  } catch (e) {
    return false;
  }
  const modeSave = isModeSave(live) ? live : (live && typeof live === "object" ? live[mode] : null);
  const away = modeSave?.away || state.away || null;
  if (!away) return false;
  const theirs = away.suitcase || readAwayCopy(away.worldId);
  if (!theirs?.profile) return false;
  let mine = null;
  try {
    // The home copy is a whole save; `checkOut`'s travelling half is `profile` + the lockers
    // that are still in its stations, which is exactly the shape `isNewerCopy` reads.
    mine = { profile: modeSave?.profile || {}, cr: modeSave?.profile?.cr };
  } catch (e) {
    return false;
  }
  return isNewerCopy(mine, theirs);
}

/**
 * "Bring my pilot home" (slice 4) — the one action that must work with the host OFFLINE.
 *
 * The suitcase is the guest's own copy (`away.suitcase`, kept up to date by `syncAway`),
 * so coming home needs no connection at all: apply it with `custody.checkIn`, clear the
 * marker, and the pilot is back with everything it was holding in the friend's world.
 *
 * `save` is the home save, which the caller owns (this module may not read the game's
 * whole save shape). Returns `{ ok, save, message }` — a new save, never a mutated one.
 */
export function bringPilotHome(save, { reason = "" } = {}) {
  const away = save?.away || null;
  if (!away) return { ok: false, save, message: "Your pilot is not away — there is nothing to bring home." };
  const suitcase = away.suitcase || readAwayCopy(away.worldId);
  if (!suitcase?.profile) {
    return {
      ok: false,
      save,
      message: "Your pilot's suitcase could not be read, so it cannot come home yet. Do not reset — join the host again from the main menu so it can send a fresh copy.",
    };
  }
  let home = null;
  try {
    home = checkIn(save, suitcase);
  } catch (error) {
    return { ok: false, save, message: `Your pilot could not come home: ${error?.message || "the suitcase did not open"}.` };
  }
  // The marker is cleared by `checkIn`; the per-world key is `leaveHostWorld`'s job, and
  // the guest can only be home from one world, so both halves happen here.
  const settled = leaveHostWorld(home);
  // A session that was still open is now looking at a world that is not running.
  if (active && active.role === "guest") {
    try { active.stop(); } catch (e) { /* ignore */ }
  }
  return {
    ok: true,
    save: settled,
    message: reason || `Your pilot is home${away.hostName ? `, back from ${away.hostName}'s world` : ""}.`,
  };
}

/** The suitcase under `away:<worldId>`, for a save whose in-save copy is damaged. */
function readAwayCopy(worldId) {
  try {
    return readAway(worldId);
  } catch (e) {
    return null;
  }
}

/** Was this browser visiting somebody else's world? (The screen asks before it asks why.) */
export function isVisiting() {
  return !!active && active.role === "guest";
}

export const codesOffer = () => (active ? active.startCodes() : Promise.resolve(null));
export const codesFinish = answer =>
  (active ? active.finishCodes(answer) : Promise.resolve({ ok: false, message: "Multiplayer is off." }));
export const codesAccept = (offer, options) =>
  (active ? active.acceptCodes(offer) : codesAcceptFrom(offer, options));

/**
 * Join by paste code when nothing is running yet: the guest has no link, so the **code is
 * the invitation** and it names the world (see `net/paste.js`). Before this existed, the
 * guest's "Use a paste code" button could only work for somebody who was already a guest
 * through a working link — a fallback for the case the fallback exists for, that could not
 * be used in that case.
 *
 * Returns the same shape as `codesAccept`: `{ ok, answer }` or `{ ok: false, message }`.
 */
export async function codesAcceptFrom(offer, { name = readSettings().name } = {}) {
  const who = cleanName(name);
  if (!who) return { ok: false, message: "Set a username first." };
  if (state.mode === "campaign") return { ok: false, message: "The campaign is single player. Joining works from the open world." };
  const invited = codeWorldId(offer);
  // Same rule as `joinWorld`: a code for the world the pilot is already visiting is a
  // rejoin, not a second trip away.
  const awayNow = liveSave()?.away || null;
  if (awayNow && invited && awayNow.worldId !== invited) {
    return { ok: false, message: "Your pilot is already visiting another world. Bring it home first." };
  }
  if (!invited) {
    return { ok: false, message: "That is not a host's join code. Ask them to copy the whole code — it starts with TRJOIN:." };
  }
  if (active) stop();
  const session = createSession({
    role: "guest",
    worldId: invited,
    name: who,
    token: makeToken(NET.tokenBytes),
    save: saveKit,
  });
  active = session;
  const result = await session.acceptCodes(offer);
  if (!result?.ok) {
    stop();
    return result || { ok: false, message: "That code was not accepted." };
  }
  return result;
}

/** The link for the current host, or null when this browser is not hosting. */
export function currentLink() {
  if (!active || active.role !== "host") return null;
  const token = tokens.get(active) || "";
  return {
    worldId: active.worldId,
    link: makeJoinLink(active.worldId, token),
    url: makeJoinUrl(active.worldId, token, pageBase()),
  };
}

/**
 * A host's token lives with its session, not in the settings: it is made when the world is
 * opened and forgotten when the session stops. A WeakMap keeps it out of a snapshot, so no
 * screen can print the secret except through the link that needs it.
 */
const tokens = new WeakMap();

/** Remember the username. */
export function setUsername(text) {
  const name = cleanName(text);
  if (!name) return { ok: false, message: "Type a name first." };
  writeSettings({ name });
  active?.publish();
  return { ok: true, name };
}

/** Turn open multiplayer on or off (the pause card's switch). Off stops any session. */
export function setEnabled(value) {
  const wanted = value === true;
  writeSettings({ enabled: wanted });
  if (!wanted) {
    stop();
    return wanted;
  }
  // Switched ON with nothing running: create an idle session so the switch has something to
  // act on and a screen has a snapshot to draw. A session is a host or a guest, so this is a
  // host that has not opened a room yet (`hostWorld` gives it an id the first time) — which is
  // exactly what "Multiplayer: On, waiting for you to send a link" means.
  if (!active) {
    const who = readSettings().name;
    if (cleanName(who)) {
      active = createSession({ role: "host", worldId: null, name: cleanName(who), token: makeToken(NET.tokenBytes), save: saveKit });
    }
  }
  if (active) active.publish?.();
  return wanted;
}

export const enabled = () => readSettings().enabled;

/** Host: the guests this world is holding, newest seen first. */
export const heldGuests = save => guestList(save || liveSave());

/** Host: note that a guest was seen just now (the heartbeat, slice 5). */
export function touchGuest(guestId, at = Date.now()) {
  const next = seenGuest(saveKit.read(), guestId, at);
  saveKit.write(next);
}

/** Host: forget a guest's record. Used when a join is refused for good, never on a hunch. */
export function forgetGuest(guestId) {
  saveKit.write(dropGuest(saveKit.read(), guestId));
}

/** Exposed for tests: the cold snapshot shape, and the session factory for a fake wire. */
export { emptySnapshot };
/**
 * Test-only: build one side of a pair without going through `hostWorld`/`joinWorld`
 * (which need a real game). Positional on purpose, so a test reads as two lines.
 */
export const createChannelForTest = (role, worldId, name, token, save) =>
  createSession({ role, worldId, name, token, save });

/** Test-only: the session that `stop`/`leaveVisit` act on (the game sets this when it joins). */
export const focusForTest = channel => { active = channel || null; };

/**
 * Test-only: join two sessions with a wire that copies messages across, so the real
 * protocol can be exercised without a browser. It lives beside the session because it
 * needs the private `channel` handle; nothing in the game calls it.
 */
export function pairForTest(host, guest, { hostChannel = host.channel(), guestChannel = guest.channel() } = {}) {
  if (!hostChannel || !guestChannel) return false;
  // Each channel gets a `reach` that hands the message to the other SESSION, which is
  // what a relay does for real. `deliver` is the fixture's hook for the outward half.
  hostChannel.reach = message => guest.reachFrom?.(message, "guest-peer");
  guestChannel.reach = message => host.reachFrom?.(message, "host-peer");
  hostChannel.deliver = (peerId, value) => guestChannel.onData?.({ ...value, peerId });
  guestChannel.deliver = (peerId, value) => hostChannel.onData?.({ ...value, peerId });
  hostChannel.peerId = "guest-peer";
  guestChannel.peerId = "host-peer";
  return true;
}
