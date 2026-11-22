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
// **What a session does not do yet.** It moves no pilot. The suitcase is slice 4, so a
// bug here cannot cost anybody a ship; what it can do is fail to connect, and every
// failure is a sentence rather than an exception.
//
// **Event bus.** `mp-state` fires whenever anything a screen shows has changed, with a
// snapshot attached. `mp-chat-arrived` fires for a line from somebody else. `mp-notice`
// is how `net/` asks for a sentence to be shown: `net/` may not import `ui/` (the layers
// test enforces it, and the reason is real — a connection must not need a DOM).

import { emit } from "../util/events.js";
import { state, currentRootSave } from "../state/state.js";
import { SAVE_VERSION, sanitizeSave } from "../state/profile.js";
import { createChannel, stateLine } from "./transport.js";
import { createPasteLink, codeWorldId } from "./paste.js";
import { readMessage, cleanMessage, isChatLine } from "./protocol.js";
import { handshake } from "./custody.js";
import {
  worldIdFor, putGuest, dropGuest, guestList, seenGuest, isAway,
} from "./multiplayer.js";
import { makeToken } from "./custody.js";
import { makeJoinLink, makeJoinUrl, readJoinLink, pageBase } from "./join-link.js";
import { readSettings, writeSettings, cleanName } from "./settings.js";
import { NET, CHAT } from "../data/multiplayer.js";

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
};

/** Replace the save handles (tests, and any host that keeps its save elsewhere). */
export function setSaveKit(kit) {
  saveKit.read = kit.read || saveKit.read;
  saveKit.write = kit.write || saveKit.write;
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
export const snapshot = () => (active ? active.snapshot() : emptySnapshot());

function emptySnapshot() {
  return {
    on: false,
    role: null,
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
  if (isAway(liveSave())) return { ok: false, message: "Your pilot is already visiting another world. Bring it home first." };
  if (active) stop();

  const session = createSession({ role: "guest", worldId: found.worldId, name: who, token: found.token, save: saveKit });
  active = session;
  await session.start();
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
  let welcomed = false;     // has the host answered at all?
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

  const ownGuestId = () => `guest-${token.slice(0, 8)}`;

  function snapshot() {
    const status = channel ? channel.state() : paste ? paste.state() : { state: "idle", reason: "" };
    return {
      on,
      role,
      state: status.state,
      line: stateLine(status),
      worldId,
      name: shown,
      hostName,
      peers: channel ? channel.peers() : [],
      guests: guests.slice(),
      chat: chat.slice(),
      // Facts for the screen's "Connection details": what the transport can see about the
      // link itself, so a failure can be reported instead of guessed at.
      diag: channel && typeof channel.diagnostics === "function" ? channel.diagnostics() : null,
      stalled,
      relay: relayTried,
      codes: codes ? { ...codes } : null,
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
    if (isChatLine(message)) {
      noteLine(message.from || "Other pilot", message.text);
      return;
    }
    switch (message.t) {
      case "hello": return onHello(message, peerId);
      case "welcome": return onWelcome(message);
      case "refuse": return onRefuse(message);
      case "presence": return onPresence(message);
      case "ping": return send({ t: "pong", at: Date.now() }, peerId);
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
    const checked = record
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
      epoch: 0,
      rev: 0,
      bundle: null,
      lastSeen: Date.now(),
    });
    save.write(recorded);

    if (hostWait) { clearTimeout(hostWait); hostWait = 0; }
    clearStallTimer();
    const fresh = !guests.some(entry => entry.guestId === message.guestId);
    upsertGuest({ guestId: message.guestId, name: display, docked: false });
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
  function onWelcome(message) {
    if (role !== "guest") return;
    if (message.name) hostName = message.name;
    if (message.youName) shown = message.youName;
    guests.length = 0;
    for (const entry of message.guests || []) upsertGuest(entry);
    // A welcome can arrive more than once (the hello is repeated until it is answered), and
    // the player must not be told "Joined Ada's world" every two seconds.
    const first = !welcomed;
    welcomed = true;
    stalled = false;
    clearStallTimer();
    if (helloWait) { clearTimeout(helloWait); helloWait = 0; }
    if (!first) { publish(); return; }
    noteLine("Tallow Reach", `Joined ${message.name || "the host"}'s world.`);
    // A rename is not silent: being listed as somebody else without being told reads as a
    // bug, and the fix is one sentence.
    if (message.youName && message.youName !== name) {
      noteLine("Tallow Reach", `You are ${message.youName} here — the host already has a ${name}.`);
    }
  }

  function onRefuse(message) {
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
    const at = guests.findIndex(g => g.guestId === entry.guestId);
    if (at >= 0) guests[at] = { ...guests[at], ...entry };
    else guests.push({ guestId: entry.guestId, name: entry.name || "Guest", docked: !!entry.docked });
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
      onState: status => {
        publish();
        if (status.state === "connected") greetEveryone();
      },
      onData: ({ peerId, ...message }) => receive(message, peerId),
      onPeer: event => {
        // Somebody is in the room: whatever we were worried about, it is not "nobody came".
        if (event?.kind === "join") { stalled = false; clearStallTimer(); }
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
    if (role === "guest") startHelloRetry();
    if (role === "host") armHostWait();
    armStallTimer();
    startKeepalive();
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

  function stop() {
    on = false;
    if (keepalive) { clearInterval(keepalive); keepalive = 0; }
    if (helloRetry) { clearInterval(helloRetry); helloRetry = 0; }
    if (helloWait) { clearTimeout(helloWait); helloWait = 0; }
    if (hostWait) { clearTimeout(hostWait); hostWait = 0; }
    clearStallTimer();
    try {
      channel?.leave();
      paste?.leave();
    } catch (e) { /* ignore */ }
    channel = null;
    paste = null;
    codes = null;
    guests.length = 0;
    if (active === session) active = null;
    publish();
  }

  /**
   * A room can die quietly: a backgrounded tab, a laptop that slept, a relay that dropped us.
   * The transport reports `lost`, and a `lost` room will never recover on its own, so the
   * session reopens it — at most once every ten seconds, and never while one is starting.
   */
  function startKeepalive() {
    if (keepalive) return;
    keepalive = setInterval(async () => {
      if (!on || !channel) return;
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

/** Stop whatever is running. */
export function stop() {
  if (!active) return false;
  active.stop();
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
  if (isAway(liveSave())) return { ok: false, message: "Your pilot is already visiting another world. Bring it home first." };
  const invited = codeWorldId(offer);
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
  if (!wanted) stop();
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
