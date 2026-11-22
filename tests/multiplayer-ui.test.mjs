// The multiplayer screen, button by button (refactor step 16, slice 3, reworked after the
// owner's playtest of 2026-11-21).
//
// The owner's report had three parts, and each one is a test here:
//
//   1. "It does not give a link if I open multiplayer without a username." — so: the switch
//      cannot be turned on without a name, and a refusal is a sentence on screen, not a
//      switch that lies and a message drawn into an element that does not exist.
//   2. "I cannot seem to connect to another client in a browser tab; it says 'Make a fresh
//      offer first'." — so: the join box exists *before* any session (it used to exist only
//      after you had already joined), and the Connect button exists only when there is an
//      offer to connect.
//   3. "Chat does not send with Enter; the text just sits in the box." — so: a line that
//      cannot go says why, and a line that can go is cleared.
//
// The last group goes further than the screen: a small in-memory relay (two "browsers" in
// one process) drives the REAL transport, the REAL session, the REAL protocol and the REAL
// handshake, which is what proves the pipe the screen sits on. An actual WebRTC connection
// still needs two real browsers; the owner's playtest is the proof of that last inch.
//
// Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import * as ui from "../src/ui/multiplayer.js";
import { uniqueName } from "../src/net/session.js";
import { isSimulationPaused } from "../src/sim/step.js";
import * as session from "../src/net/session.js";
import { setLibraryLoader, setRelayProbe, createChannel } from "../src/net/transport.js";
import { RELAYS, ICE } from "../src/data/multiplayer.js";
import { SAVE_VERSION, newProfile, newWorld } from "../src/state/profile.js";
import { state } from "../src/state/state.js";
import { NET } from "../src/data/multiplayer.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = rel => readFileSync(path.join(root, rel), "utf8");

const COLD = {
  on: false, role: null, state: "idle", line: "Multiplayer is off.",
  worldId: null, name: "", peers: [], guests: [], chat: [],
};

/**
 * A stand-in for `net/session.js` that records what was asked of it. Overrides win, so a
 * test can make hosting fail or a link be refused without touching the real session.
 */
function fakeApi(over = {}) {
  const calls = [];
  let snap = { ...COLD };
  const api = {
    snapshot: () => ({ ...snap, peers: [...snap.peers], guests: [...snap.guests], chat: [...snap.chat] }),
    currentLink: () => (snap.on && snap.role === "host"
      ? { worldId: "w-1", link: "?join=w-1#token", url: "https://example.test/game.html?join=w-1#token" }
      : null),
    hostWorld: async () => {
      calls.push("hostWorld");
      snap = { ...snap, on: true, role: "host", state: "finding", line: "Waiting for the other pilot to join…", worldId: "w-1" };
      return { ok: true, worldId: "w-1", url: "https://example.test/game.html?join=w-1#token" };
    },
    joinWorld: async ({ link } = {}) => {
      calls.push(["joinWorld", link]);
      snap = { ...snap, on: true, role: "guest", state: "finding", line: "Looking for the other pilot…" };
      return { ok: true, worldId: "w-1" };
    },
    setEnabled: value => { calls.push(["setEnabled", value]); return value; },
    setUsername: name => { calls.push(["setUsername", name]); return { ok: true, name }; },
    stop: () => {
      calls.push("stop");
      snap = { ...COLD };
      return true;
    },
    codesOffer: async () => { calls.push("codesOffer"); return { offer: "TRJOIN:offer-code" }; },
    codesFinish: async code => { calls.push(["codesFinish", code]); return { ok: true }; },
    codesAccept: async (code, options) => { calls.push(["codesAccept", code, options]); return { ok: true, answer: "TRJOIN:answer-code" }; },
    say: text => { calls.push(["say", text]); return true; },
    ...over,
  };
  ui.setMultiplayerApi(api);
  return { calls, setSnap: next => { snap = next; }, getSnap: () => snap };
}

/** A named player: the model reads the typed field, not storage, so this is enough. */
const withName = (name = "Ada") => { ui.panelState().fields.name = name; };

const html = () => ui.screenHtml(ui.screenModel());

test.beforeEach(() => ui.resetPanel());

// No test may open a real WebSocket to a signalling relay. The relay-health test puts its own
// stub back; section 11 is the only place that wants one.
test.before(() => setRelayProbe(null));

/* ------------------------------------------------------------------------- */
/* 1. No username, no switch                                                 */
/* ------------------------------------------------------------------------- */

test("the switch cannot be turned on without a username — and says why if it is tried", async () => {
  const fake = fakeApi();
  const cold = ui.screenModel();
  assert.equal(cold.nameSet, false);
  assert.equal(cold.canSwitch, false, "the switch is disabled before a name exists");
  assert.equal(cold.canJoin, false, "and so is Join");
  assert.equal(cold.joinAvailable, true, "but the join box is there: joining is not hidden");

  // The switch is disabled in the markup too, not only in the model.
  assert.match(html(), /data-mp="host"[^>]*disabled/);

  // And the action refuses even if a hand-rolled click gets through.
  const worked = await ui.act("host");
  assert.equal(worked, false);
  assert.equal(fake.calls.includes("hostWorld"), false, "nothing was hosted");
  assert.match(ui.panelState().message, /username first/i);
  assert.equal(ui.screenModel().messageKind, "error");
  // The sentence has somewhere to live: the message element is always in the card.
  assert.match(html(), /id="mp-msg"/);
});

test("a name enables both front doors without a redraw of the field", async () => {
  fakeApi();
  withName("Ada");
  const named = ui.screenModel();
  assert.equal(named.canSwitch, true);
  assert.equal(named.canJoin, true);
  assert.doesNotMatch(html(), /data-mp="host"[^>]*disabled/);
});

/* ------------------------------------------------------------------------- */
/* 2. Hosting: the link appears, the switch tells the truth                   */
/* ------------------------------------------------------------------------- */

test("hosting with a name shows the link, and the switch follows the session", async () => {
  const fake = fakeApi();
  withName("Ada");

  // A stored wish is not a session: the switch must not be drawn from it.
  const before = ui.screenModel();
  assert.equal(before.switchOn, false);

  assert.equal(await ui.act("host"), true);
  assert.deepEqual(fake.calls.filter(c => c === "hostWorld").length, 1);
  const after = ui.screenModel();
  assert.equal(after.switchOn, true, "on, because this world really is open");
  assert.match(after.link, /join=w-1#token/, "the host has a link to copy");
  const page = html();
  assert.match(page, /id="mp-link"[^>]*value="https:\/\/example\.test\/game\.html\?join=w-1#token"/);
  assert.match(page, /data-mp="copy-link"/, "and a button that copies it");
  assert.match(ui.panelState().message, /send it to your friend/i);
});

test("hosting that fails leaves the switch off and says the reason on screen", async () => {
  const fake = fakeApi({
    hostWorld: async () => { fake.calls.push("hostWorld"); return { ok: false, message: "Your pilot is visiting another world." }; },
  });
  withName("Ada");

  assert.equal(await ui.act("host"), false);
  const model = ui.screenModel();
  assert.equal(model.switchOn, false, "an On switch for a world that is not open is a lie");
  assert.equal(model.message, "Your pilot is visiting another world.");
  assert.equal(model.messageKind, "error");
  assert.match(html(), /id="mp-msg" class="mp-msg is-error"[^>]*>Your pilot is visiting another world\./);
});

test("turning hosting off closes the world and keeps the switch honest", async () => {
  const fake = fakeApi();
  withName("Ada");
  await ui.act("host");
  assert.equal(ui.screenModel().hosting, true);

  assert.equal(await ui.act("host"), true);
  assert.ok(fake.calls.includes("stop"), "the session is stopped");
  assert.deepEqual(fake.calls.filter(c => Array.isArray(c) && c[0] === "setEnabled").at(-1), ["setEnabled", false]);
  assert.equal(ui.screenModel().hosting, false);
});

/* ------------------------------------------------------------------------- */
/* 3. Joining: the box exists before you have joined                          */
/* ------------------------------------------------------------------------- */

test("a guest can paste a link without hosting first — the dead end from the playtest", async () => {
  const fake = fakeApi();
  withName("Bo");
  // No session at all, and no world of your own: this is what the screen shows a player
  // who has just pressed "Join Multiplayer World".
  assert.equal(ui.screenModel().state, "idle");
  assert.equal(ui.screenModel().hosting || ui.screenModel().visiting, false);
  const page = html();
  assert.match(page, /data-mp-field="join"/, "the paste box is on screen before any session");
  assert.match(page, /data-mp="join"/, "and so is the button");

  ui.panelState().fields.join = "https://example.test/game.html?join=w-1#token";
  assert.equal(await ui.act("join"), true);
  assert.deepEqual(fake.calls.find(c => Array.isArray(c) && c[0] === "joinWorld"),
    ["joinWorld", "https://example.test/game.html?join=w-1#token"]);
  assert.equal(ui.screenModel().visiting, true);
});

test("a link that is refused shows the host's own sentence, not silence", async () => {
  fakeApi({
    joinWorld: async () => ({ ok: false, message: "That link is missing its second half. Copy the whole thing, including everything after the #." }),
  });
  withName("Bo");
  ui.panelState().fields.join = "?join=w-1";
  assert.equal(await ui.act("join"), false);
  assert.match(ui.screenModel().message, /missing its second half/);
});

test("joining with no name or no link refuses in words and touches nothing", async () => {
  const fake = fakeApi();
  ui.panelState().fields.join = "?join=w-1#tok";
  assert.equal(await ui.act("join"), false);
  assert.match(ui.panelState().message, /username first/i);
  assert.equal(fake.calls.some(c => Array.isArray(c) && c[0] === "joinWorld"), false);

  ui.resetPanel();
  fakeApi();
  withName("Bo");
  assert.equal(await ui.act("join"), false);
  assert.match(ui.panelState().message, /Paste the link/i);
});

test("a guest who is host is told to stop hosting instead of silently dropping the room", async () => {
  const fake = fakeApi();
  withName("Ada");
  await ui.act("host");
  assert.equal(await ui.act("join"), false);
  assert.match(ui.panelState().message, /Stop hosting/i);
  assert.equal(fake.calls.some(c => Array.isArray(c) && c[0] === "joinWorld"), false);
});

/* ------------------------------------------------------------------------- */
/* 4. The paste-code fallback                                                 */
/* ------------------------------------------------------------------------- */

test("an offer code stays on screen after the redraw, and Connect needs an offer", async () => {
  const fake = fakeApi();
  withName("Ada");
  await ui.act("host");

  // Before an offer: no answer box and no Connect button, because the only thing you
  // could do with them is get "Make a fresh offer first."
  let page = html();
  assert.doesNotMatch(page, /data-mp="finish"/, "no Connect button before there is an offer");
  assert.equal(await ui.act("finish"), false);
  assert.match(ui.panelState().message, /Make an offer first/);
  assert.equal(fake.calls.some(c => Array.isArray(c) && c[0] === "codesFinish"), false);

  // Make one: it is in the model AND in the markup, and a redraw keeps it there.
  assert.equal(await ui.act("offer"), true);
  assert.equal(ui.panelState().offer, "TRJOIN:offer-code");
  ui.screenModel();               // a redraw, as an incoming `mp-state` would cause
  page = html();
  assert.match(page, /TRJOIN:offer-code/, "the code the host must send is still on screen");
  assert.match(page, /data-mp="finish"/, "and now Connect exists");

  // Finish with the answer.
  ui.panelState().fields.code = "TRJOIN:answer-code";
  assert.equal(await ui.act("finish"), true);
  assert.deepEqual(fake.calls.find(c => Array.isArray(c) && c[0] === "codesFinish"), ["codesFinish", "TRJOIN:answer-code"]);
  assert.match(ui.panelState().message, /Connected/);
});

test("a guest pastes the host's offer into the same box and gets an answer to send back", async () => {
  const fake = fakeApi();
  withName("Bo");
  ui.panelState().fields.join = "TRJOIN:offer-code";
  assert.equal(await ui.act("join"), true, "a code in the join box is accepted there");
  assert.deepEqual(fake.calls.find(c => Array.isArray(c) && c[0] === "codesAccept"), ["codesAccept", "TRJOIN:offer-code", { name: "Bo" }]);
  assert.equal(fake.calls.some(c => Array.isArray(c) && c[0] === "joinWorld"), false, "a code is not sent to the link reader");
  assert.match(html(), /TRJOIN:answer-code/, "the answer is shown for the player to send back");
  assert.match(html(), /data-mp="copy-answer"/);
});

/* ------------------------------------------------------------------------- */
/* 5. Chat                                                                   */
/* ------------------------------------------------------------------------- */

test("chat: a sent line goes and is cleared; a line nobody can hear is still shown", () => {
  fakeApi({ say: () => true, snapshot: () => ({ ...COLD, on: true, role: "host", state: "connected" }) });
  assert.deepEqual(ui.sendChatText("  hallo  "), { sent: true, echoed: false, problem: "" });

  // Hosting, nobody has joined yet. Playtest 2 changed this on purpose: the line is still
  // shown on this screen (so a host alone can type and read it back), and the note says
  // who can see it.
  fakeApi({ say: () => false, snapshot: () => ({ ...COLD, on: true, role: "host", state: "finding", name: "Ada" }) });
  const alone = ui.sendChatText("hello");
  assert.equal(alone.sent, false);
  assert.equal(alone.echoed, true, "the box shows it even though it left the machine");
  assert.match(alone.problem, /Only you are here/);

  // Connected, but the message did not get through: echoed too, and a different sentence.
  fakeApi({ say: () => false, snapshot: () => ({ ...COLD, on: true, role: "guest", state: "connected", name: "Bo" }) });
  const lost = ui.sendChatText("hello");
  assert.equal(lost.echoed, true);
  assert.match(lost.problem, /could not be reached/i);

  // Multiplayer off is its own sentence, and nothing is echoed: there is no box to show it.
  fakeApi({ say: () => false });
  assert.deepEqual(ui.sendChatText("hello"), { sent: false, echoed: false, problem: "Multiplayer is off." });

  // Nothing typed is not a failure.
  assert.deepEqual(ui.sendChatText("   "), { sent: false, echoed: false, problem: "" });
});

/* ------------------------------------------------------------------------- */
/* 6. The two front doors, and the chat box's rules                          */
/* ------------------------------------------------------------------------- */

test("the title menu has one button that opens this screen", () => {
  const screens = read("src/ui/screens.js");
  assert.match(screens, /<button class="go" data-a="multiplayer">Join Multiplayer World<\/button>/);
  const menu = read("src/ui/menu.js");
  // ...and it names its door, so the screen shows the join block and not the switch.
  assert.match(menu, /openMultiplayer\(\{ focus: "join", from: "menu" \}\)/);
});

test("the pause card opens the same screen, and shows its state in one line", () => {
  const overlays = read("src/ui/overlays.js");
  assert.match(overlays, /multiplayerCardHtml\(\)/);
  const pause = read("src/ui/pause.js");
  assert.match(pause, /const mpButton = overlay\.querySelector\("#pz-mp"\);/);
  // Guarded: a pause card drawn without the multiplayer line (a test's fake DOM, an older
  // overlay) must not throw on the way to wiring the rest of the card.
  assert.match(pause, /if \(mpButton\) mpButton\.onclick = \(\) => openMultiplayer\(\{ from: "pause" \}\);/);
  const card = ui.multiplayerCardHtml();
  assert.match(card, /id="pz-mp"/);
  assert.match(card, /id="pz-mp-state"/);
});

test("the screen is a modal surface: flight keys do not reach the ship while it is open", () => {
  const input = read("src/core/input.js");
  assert.match(input, /state\.ui\.multiplayer/, "core/input.js asks whether the screen is open");
  assert.match(read("src/state/state.js"), /multiplayer: false/, "and the flag is declared in ui state");
});

test("a join from the title puts the pilot in the open world", () => {
  assert.match(read("src/ui/multiplayer.js"), /emit\("mp-enter-world"/);
  assert.match(read("src/ui/menu.js"), /on\("mp-enter-world"/);
});

/* ------------------------------------------------------------------------- */
/* 7. The pipe the screen sits on: a real session pair over a fake relay      */
/* ------------------------------------------------------------------------- */

/**
 * A tiny stand-in for the network library: `joinRoom` puts the caller in an in-memory
 * room and introduces whoever arrives later. Everything above it — `net/transport.js`,
 * `net/session.js`, the protocol, the handshake — is the real code.
 */
function fakeRelay({ dropFirst = "", dropAll = "" } = {}) {
  const rooms = new Map();
  const joins = [];       // every joinRoom config, so a test can see what a retry used
  let next = 1;
  let dropped = false;
  return {
    joins,
    joinRoom(config, roomId) {
      joins.push(config);
      const member = { id: `peer-${next++}`, actions: new Map(), peerJoin: [], peerLeave: [] };
      const members = rooms.get(roomId) || new Set();
      rooms.set(roomId, members);
      const others = [...members];
      members.add(member);
      const listeners = name => {
        if (!member.actions.has(name)) member.actions.set(name, []);
        return member.actions.get(name);
      };
      const room = {
        makeAction: name => ({
          send(data, options = {}) {
            // One message kind can be dropped once, to prove a retry exists.
            if (dropAll && data && data.t === dropAll) return Promise.resolve();
            if (dropFirst && !dropped && data && data.t === dropFirst) { dropped = true; return Promise.resolve(); }
            const targets = options.target ? [options.target] : [...members].map(m => m.id);
            for (const other of members) {
              if (other === member || !targets.includes(other.id)) continue;
              for (const fn of other.actions.get(name) || []) fn(JSON.parse(JSON.stringify(data)), { peerId: member.id });
            }
            return Promise.resolve();
          },
          onMessage(fn) { listeners(name).push(fn); return () => {}; },
        }),
        onPeerJoin: fn => { member.peerJoin.push(fn); return () => {}; },
        onPeerLeave: fn => { member.peerLeave.push(fn); return () => {}; },
        onError: () => () => {},
        getPeers: () => Object.fromEntries([...members].filter(m => m !== member).map(m => [m.id, {}])),
        leave: () => {
          members.delete(member);
          for (const other of members) for (const fn of other.peerLeave) fn({ peerId: member.id });
          return Promise.resolve();
        },
      };
      // The introduction arrives just after both sides have registered their handlers,
      // which is what a real relay does too.
      setTimeout(() => {
        for (const other of others) {
          for (const fn of member.peerJoin) fn({ peerId: other.id });
          for (const fn of other.peerJoin) fn({ peerId: member.id });
        }
      }, 0);
      return room;
    },
  };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 25));

function worldKit(worldId = "w-ui") {
  const save = {
    v: SAVE_VERSION,
    profile: newProfile(),
    world: { ...newWorld(), worldId, guests: {} },
    away: null,
  };
  return {
    read: () => JSON.parse(JSON.stringify(save)),
    write: next => Object.assign(save, next),
    raw: () => save,
  };
}

test("two browsers meet, the guest says hello once, and both can talk", async () => {
  const relay = fakeRelay();
  setLibraryLoader(async () => relay);
  session.setChannelFactory(null);          // the real transport, over the fake relay

  const hostKit = worldKit();
  const guestKit = worldKit();

  // `hostWorld`/`joinWorld` need the game's state, so the sessions are built directly and
  // fed a save: the same code path the real ones take, minus the save plumbing.
  const host = session.createChannelForTest("host", "w-ui", "Ada", "host-token", hostKit);
  await host.start();
  const guest = session.createChannelForTest("guest", "w-ui", "Bo", "guest-token", guestKit);
  await guest.start();
  await settle();

  assert.equal(host.snapshot().state, "connected", "the host sees the connection");
  assert.equal(guest.snapshot().state, "connected", "and so does the guest");

  // The handshake: the guest said hello with no peer known yet and retried when one
  // appeared. Before this fix the retry did not exist and this list stayed empty.
  assert.deepEqual(host.snapshot().guests.map(g => g.name), ["Bo"], "the host knows who joined");
  assert.equal(guest.snapshot().chat.at(-1).text, "Joined Ada's world.", "the guest is welcomed");
  const joined = host.snapshot().chat.filter(line => /joined/i.test(line.text));
  assert.equal(joined.length, 1, "exactly one hello was admitted, not one per retry");

  // The guest's record is stored without its secret.
  const records = Object.entries(hostKit.raw().world.guests);
  assert.equal(records.length, 1);
  const record = records[0][1];
  assert.equal(typeof record.tokenHash, "string");
  assert.equal(JSON.stringify(record).includes("guest-token"), false);

  // Chat, both ways, through the real protocol.
  assert.equal(host.say("dock with me"), true, "the host can send");
  await settle();
  assert.deepEqual(guest.snapshot().chat.at(-1), { from: "Ada", text: "dock with me", at: guest.snapshot().chat.at(-1).at, own: false });

  assert.equal(guest.say("on my way"), true, "the guest can send");
  await settle();
  assert.equal(host.snapshot().chat.at(-1).text, "on my way");
  assert.equal(host.snapshot().chat.at(-1).from, "Bo");

  host.stop();
  guest.stop();
  setLibraryLoader(null);
});

test("two browsers in different worlds never meet", async () => {
  const relay = fakeRelay();
  setLibraryLoader(async () => relay);
  setRelayProbe(null);
  session.setChannelFactory(null);

  const host = session.createChannelForTest("host", "w-one", "Ada", "host-token", worldKit("w-one"));
  await host.start();
  const stranger = session.createChannelForTest("guest", "w-two", "Cy", "other-token", worldKit("w-two"));
  await stranger.start();
  await settle();

  assert.deepEqual(host.snapshot().guests, [], "a room is one world");
  assert.equal(host.say("anyone?"), false, "and nobody is there to hear it");

  host.stop();
  stranger.stop();
  setLibraryLoader(null);
});

/* ------------------------------------------------------------------------- */
/* 7. Every button on the screen is an action the screen knows                */
/* ------------------------------------------------------------------------- */

test("every button the card draws has a case in act(), in every state it can be in", async () => {
  // A rendered button with no `case` is a click that does nothing, which is exactly the
  // class of bug the owner hit. Collect the actions from every state the card can be in.
  const states = [
    { name: "no name, nothing running", model: () => { ui.resetPanel(); return ui.screenModel(); } },
    { name: "named, off", model: () => { ui.resetPanel(); withName("Ada"); return ui.screenModel(); } },
    { name: "hosting", model: () => { ui.resetPanel(); withName("Ada"); return ui.screenModel(); }, prep: ["host"] },
    { name: "offer in hand", model: () => { ui.resetPanel(); withName("Ada"); return ui.screenModel(); }, prep: ["host", "offer"] },
    { name: "a code pasted", model: () => { ui.resetPanel(); withName("Bo"); return ui.screenModel(); }, prep: ["offer"] },
  ];
  const drawn = new Set();
  const source = read("src/ui/multiplayer.js");
  for (const state of states) {
    fakeApi();
    if (state.prep?.includes("host")) await ui.act("host", { name: "Ada" });
    if (state.prep?.includes("offer")) { ui.panelState().fields.join = "TRJOIN:pasted"; await ui.act("offer"); }
    const model = state.model();
    for (const [, action] of ui.screenHtml(model).matchAll(/data-mp="([^"]+)"/g)) drawn.add(action);
  }
  assert.ok(drawn.size >= 6, `the screen draws buttons at all (saw ${drawn.size})`);
  for (const action of drawn) {
    assert.match(source, new RegExp(`case "${action}":`), `"${action}" is drawn as a button, so act() must handle it`);
    await ui.act(action).catch(() => {});
  }
});

/* ------------------------------------------------------------------------- */
/* 8. The owner's second playtest (2026-11-21, later the same day)            */
/* ------------------------------------------------------------------------- */
//
// Five reports, and the fixes they asked for. The first is a name rule, the second a bug
// in the chat box, the third a surface split, the fourth a pause that did not pause, and
// the fifth a list.

test("a duplicate name is renamed with asterisks, and the guest is told", async () => {
  // The rule, on its own: the host's own name is taken, and so is every `acey*` before.
  assert.equal(uniqueName("Acey", ["Ada"]), "Acey", "a free name is left alone");
  assert.equal(uniqueName("Acey", ["Acey"]), "Acey*", "the host already answers to it");
  assert.equal(uniqueName("Acey", ["Acey", "Acey*"]), "Acey**", "and so does the first guest");
  assert.equal(uniqueName("", ["Acey"]), "Pilot", "an empty name still gets one");
  assert.ok(uniqueName("x".repeat(24), ["x".repeat(24)]).length <= 24, "and never grows past the wire's limit");

  // And through the real handshake: two browsers both calling themselves Ada.
  const relay = fakeRelay();
  setLibraryLoader(async () => relay);
  session.setChannelFactory(null);
  const host = session.createChannelForTest("host", "w-name", "Ada", "host-token", worldKit("w-name"));
  await host.start();
  const guest = session.createChannelForTest("guest", "w-name", "Ada", "guest-token", worldKit("w-name"));
  await guest.start();
  await settle();

  assert.deepEqual(host.snapshot().guests.map(g => g.name), ["Ada*"], "the host lists the guest under the renamed name");
  assert.equal(guest.snapshot().name, "Ada*", "and the guest knows what it is called here");
  assert.match(
    guest.snapshot().chat.map(line => line.text).join("\n"),
    /You are Ada\* here/,
    "the guest is told why its name changed",
  );
  // Chat is attributed to the name the host handed out, not the one that was typed.
  assert.equal(guest.say("hello"), true);
  await settle();
  assert.equal(host.snapshot().chat.at(-1).from, "Ada*");
  host.stop();
  guest.stop();
  setLibraryLoader(null);
});

test("the chat box shows its input whenever it is open — the guest could not type", () => {
  // The bug: `drawChat` hid the input unless the input already had focus, and a hidden
  // input cannot be focused. So opening the box showed the lines and no way to type, and
  // the keys went back to the ship.
  assert.deepEqual(ui.chatVisibility({ on: true, intro: false, panel: false, open: true }), { box: true, input: true });
  assert.deepEqual(ui.chatVisibility({ on: true, intro: false, panel: false, open: false }), { box: true, input: false },
    "a closed box shows the lines and no input");
  assert.deepEqual(ui.chatVisibility({ on: false, intro: false, panel: false, open: true }), { box: false, input: false },
    "no session, no box");
  assert.deepEqual(ui.chatVisibility({ on: true, intro: true, panel: false, open: true }), { box: false, input: false },
    "never over the title screen");
  assert.deepEqual(ui.chatVisibility({ on: true, intro: false, panel: true, open: true }), { box: false, input: false },
    "nor over a menu");
  // And opening sets the flag *before* it asks for the cursor: focusing a hidden field
  // is a silent no-op, which is exactly how the guest's chat box became untypable.
  const source = read("src/ui/multiplayer.js");
  const open = source.slice(source.indexOf("export function openChat"));
  assert.match(open, /chatOpen = true;[\s\S]{0,400}chatInput\.hidden = false;[\s\S]{0,400}chatInput\.focus\(\)/);
});

test("chat works with nobody else connected: the line is shown, and says only you see it", () => {
  const fake = fakeApi({
    say: text => { fake.calls.push(["say", text]); return false; },
  });
  fake.setSnap({ ...COLD, on: true, role: "host", state: "finding", name: "Ada" });
  const result = ui.sendChatText("anyone there?");
  assert.equal(result.sent, false);
  assert.equal(result.echoed, true, "the line still goes on this screen");
  assert.match(result.problem, /Only you are here/);
  const log = ui.panelState().history;
  assert.equal(log.length, 1, "and it is kept in the box's own log");
  assert.deepEqual([log[0].from, log[0].text, log[0].own], ["Ada", "anyone there?", true]);
  // The log survives the box closing, which is what "scroll up" means.
  assert.deepEqual(ui.panelState().history.map(line => line.text), ["anyone there?"]);
});

test("the chat box has a compact player column beside the lines", () => {
  const snap = { name: "Ada", guests: [{ guestId: "g1", name: "Bo" }, { guestId: "g2", name: "Cy*" }] };
  assert.deepEqual(ui.chatWhoRows(snap), ["Ada", "Bo", "Cy*"], "you first, then everyone else");
  assert.deepEqual(ui.chatWhoRows({ name: "", guests: [] }), ["Pilot"], "and never an empty column");
  assert.deepEqual(ui.chatWhoRows({ name: "Ada", guests: [{ guestId: "g1", name: "Ada" }] }), ["Ada"],
    "your own name is not listed twice");
  const rows = ui.chatWhoHtml(snap);
  assert.equal((rows.match(/<li/g) || []).length, 3, "one small row per pilot");
  const source = read("src/ui/multiplayer.js");
  assert.match(source, /id="mp-chat-who"/, "the column has its own element");
});

test("joining is the main menu's job and hosting is the pause card's", async () => {
  const fake = fakeApi();
  withName("Ada");

  // From the title: the join block only.
  ui.openMultiplayer({ from: "menu" });
  assert.equal(ui.screenModel().surface, "join");
  const fromMenu = ui.screenHtml(ui.screenModel());
  assert.match(fromMenu, /id="mp-join"/, "the main menu offers the paste box");
  assert.doesNotMatch(fromMenu, /data-mp="host"/, "and no host switch");
  assert.doesNotMatch(fromMenu, /id="mp-link"/, "and no link to copy");
  assert.equal(await ui.act("host"), false, "the host action refuses from the title");
  assert.match(ui.panelState().message, /pause menu/i);

  // From the pause card, in your own world: the host block only.
  ui.openMultiplayer({ from: "pause" });
  assert.equal(ui.screenModel().surface, "host");
  const fromPause = ui.screenHtml(ui.screenModel());
  assert.match(fromPause, /data-mp="host"/, "the pause card offers the switch");
  assert.doesNotMatch(fromPause, /id="mp-join"/, "and no way to join from mid-flight");
  ui.panelState().fields.join = "?join=w-1#token";
  assert.equal(await ui.act("join"), false, "the join action refuses from the pause card");
  assert.match(ui.panelState().message, /main menu/i);
  assert.equal(fake.calls.includes("joinWorld"), false, "and nothing was attempted");
  assert.equal(fake.calls.includes("hostWorld"), false);
  ui.closeMultiplayer();
});

test("a hosted or visited world keeps running while the card is open", () => {
  // The gate itself, with no DOM: `state.multiplayer` is what `sim/step.js` reads.
  state.ui.intro = false;
  state.ui.campaignEnd = false;
  state.paused = true;
  state.multiplayer = true;
  assert.equal(isSimulationPaused(), false, "an online world does not stop for a settings card");
  state.multiplayer = false;
  assert.equal(isSimulationPaused(), true, "an offline one still does");
  state.paused = false;
  state.ui.intro = false;
  // And the switch that sets it: while a session is on, `setPause` must not turn it off.
  const pause = read("src/ui/pause.js");
  assert.match(pause, /state\.multiplayer = isOn\(\);/);
  assert.doesNotMatch(pause, /state\.multiplayer = !v && isOn\(\)/);
});

/* ------------------------------------------------------------------------- */
/* 9. The owner's third playtest (2026-11-21, on a second machine)            */
/* ------------------------------------------------------------------------- */
//
// Three reports from a laptop joining a PC: the join button swallowed the first click, the
// guest saw only itself in the player list, and the two machines never actually admitted
// each other (a hello sent once, into a data channel that was not open yet, latches).

test("the guest's list shows the host: a column with only you in it is a lie", () => {
  const host = { name: "Ada", hostName: "", guests: [{ guestId: "g1", name: "Bo" }] };
  const guest = { name: "Bo", hostName: "Ada", guests: [{ guestId: "g1", name: "Bo" }] };
  assert.deepEqual(ui.chatWhoRows(host), ["Ada", "Bo"], "the host sees itself and its guest");
  assert.deepEqual(ui.chatWhoRows(guest), ["Bo", "Ada"], "the guest sees itself *and the host*");
  // The host's own row comes from the session, so the guest has to be told it once.
  assert.match(ui.chatWhoHtml(guest), /Current players/, "and the column says what it is");
  assert.equal((ui.chatWhoHtml(guest).match(/<li/g) || []).length, 2);
});

test("a guest learns the host's name from the welcome, and lists it", async () => {
  const relay = fakeRelay();
  setLibraryLoader(async () => relay);
  session.setChannelFactory(null);
  const host = session.createChannelForTest("host", "w-hostname", "Ada", "host-token", worldKit("w-hostname"));
  await host.start();
  const guest = session.createChannelForTest("guest", "w-hostname", "Bo", "guest-token", worldKit("w-hostname"));
  await guest.start();
  await settle();
  assert.equal(guest.snapshot().hostName, "Ada", "the guest keeps the host's name, not just its message");
  assert.deepEqual(ui.chatWhoRows(guest.snapshot()), ["Bo", "Ada"], "so its column has two rows, not one");
  host.stop();
  guest.stop();
  setLibraryLoader(null);
});

test("a hello that was lost is sent again until somebody answers", async () => {
  // A relay that drops the first hello: the guest's data channel is open a moment after
  // `join()` returns, so the first attempt goes nowhere. This is the second machine's bug.
  const relay = fakeRelay({ dropFirst: "hello" });
  setLibraryLoader(async () => relay);
  session.setChannelFactory(null);
  const was = NET.helloRetrySec;
  NET.helloRetrySec = 0.02;
  const host = session.createChannelForTest("host", "w-retry", "Ada", "host-token", worldKit("w-retry"));
  await host.start();
  const guest = session.createChannelForTest("guest", "w-retry", "Bo", "guest-token", worldKit("w-retry"));
  await guest.start();
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.deepEqual(host.snapshot().guests.map(g => g.name), ["Bo"], "the retry got the guest admitted");
  assert.equal(host.snapshot().chat.filter(line => /joined/i.test(line.text)).length, 1,
    "and the host says it once, not once per retry");
  assert.equal(guest.snapshot().hostName, "Ada", "the guest got its welcome");
  NET.helloRetrySec = was;
  host.stop();
  guest.stop();
  setLibraryLoader(null);
});

test("the name field commits without redrawing — that redraw ate the Join click", () => {
  const source = read("src/ui/multiplayer.js");
  const change = source.slice(source.indexOf('root.addEventListener("change"'), source.indexOf("// Escape closes the screen"));
  assert.doesNotMatch(change, /\bdraw\(\)/, "a form commit must not replace the button under the cursor");
  assert.match(change, /refreshLiveness\(\)/, "it updates the controls in place instead");
  // ...and the in-place update carries the message too, or a refusal would go unseen.
  const liveness = source.slice(source.indexOf("function refreshLiveness"), source.indexOf("function focusField"));
  assert.match(liveness, /#mp-msg/);
});

test("the chat box is tall enough to read, and its list is called Current players", () => {
  const css = read("src/styles.css");
  const block = css.slice(css.indexOf("#mp-chat-lines {"));
  const height = Number((block.match(/max-height:\s*(\d+)px/) || [])[1] || 0);
  assert.ok(height >= 240, `the lines get ~doubled height (saw ${height}px)`);
  const who = css.slice(css.indexOf("#mp-chat-who {"));
  assert.ok(Number((who.match(/min-width:\s*(\d+)px/) || [])[1] || 0) >= 104, "the player column has room");
  assert.match(ui.chatWhoHtml({ name: "Ada", guests: [] }), /Current players/);
});

/* ------------------------------------------------------------------------- */
/* 10. Playtest 4: two machines that cannot see each other                    */
/* ------------------------------------------------------------------------- */
//
// The owner's laptop joins (the room is found) and is told "you are the only one there". On one
// machine that never happens, because both tabs share a process: two *machines* need a path
// across the network, and a home router usually has none (no hairpin NAT, mDNS blocked). The
// answer is a relay, but only after the direct attempt has failed — and both ends must use it.

test("the screen says what the link is doing, in facts", () => {
  const snap = {
    ...COLD, on: true, role: "guest", state: "connected", name: "Bo", hostName: "",
    diag: { signalling: "connected", line: "Connected.", useTurn: false, sent: 12, received: 0, peers: [{ id: "p1", connection: "connecting", ice: "checking", direct: true }] },
  };
  const model = ui.screenModel({ snap });
  assert.equal(model.diag.sent, 12);
  assert.equal(model.diag.received, 0);
  const html = ui.screenHtml(model);
  assert.match(html, /Connection details/);
  assert.match(html, /sent 12/);
  assert.match(html, /received 0/);
  assert.match(html, /Direct link: connecting \(checking\)/);
  assert.match(html, /data-mp="reconnect"/, "and there is a way to try again");
  assert.doesNotMatch(html, /Relay mode: on/, "a direct attempt is still direct");
  // The two facts that separate "different room" from "same room, no path between us".
  assert.match(html, /Browsers in the room: 2/, "how many browsers the room has, counting this one");
  assert.match(html, /World id: /, "and which world it is looking for");
  assert.match(html, /Build: /, "and which build this page is");
  assert.match(html, /data-mp="copy-diag"/, "with a way to copy all of it");
});

test("the connection report is one paste-ready block", () => {
  const snap = {
    ...COLD, on: true, role: "guest", state: "connected", name: "Bo", worldId: "w-abc",
    diag: { signalling: "connected", line: "Connected.", useTurn: true, sent: 4, received: 0, peers: [{ id: "p1", connection: "failed", ice: "failed", direct: true }] },
  };
  const model = ui.screenModel({ snap });
  const report = ui.diagReport(model);
  for (const needle of ["Tallow Reach connection report", "Build:", "World id: w-abc", "Role: guest", "Signalling: connected", "Browsers in the room: 2", "Messages sent 4, received 0", "Relay mode: on", "Direct link: failed (failed)"]) {
    assert.ok(report.includes(needle), `the report says "${needle}"`);
  }
  // A host's own report must say so, and count itself in the room.
  const asHost = ui.diagReport(ui.screenModel({ snap: { ...COLD, on: true, role: "host", name: "Ada", diag: { signalling: "finding", sent: 0, received: 0, peers: [], useTurn: false } } }));
  assert.match(asHost, /Role: host/);
  assert.match(asHost, /Browsers in the room: 1/);
  assert.match(asHost, /Direct link: no other browser is in the room/);
});

test("a session with no diagnostics draws no details block", () => {
  const model = ui.screenModel({ snap: { ...COLD } });
  assert.equal(model.diag, null);
  assert.doesNotMatch(ui.screenHtml(model), /Connection details/);
});

test("a host with a browser in the room but no hello says so", () => {
  const snap = {
    ...COLD, on: true, role: "host", state: "connected", name: "Ada",
    diag: { signalling: "connected", line: "", useTurn: false, sent: 9, received: 0, peers: [{ id: "p1", connection: "connecting", ice: "checking", direct: true }] },
  };
  const html = ui.screenHtml(ui.screenModel({ snap }));
  assert.match(html, /A browser is in the room but has not identified itself/,
    "the host's half of the failure names itself");
});

test("a room that dies quietly is reopened by the session's watchdog", () => {
  // A backgrounded tab or a slept laptop loses the relay; the room never comes back by itself.
  const source = read("src/net/session.js");
  const watch = source.slice(source.indexOf("function startKeepalive"), source.indexOf("function armHostWait"));
  assert.match(watch, /state === "lost" \|\| status\.state === "closed"/, "it looks for a dead room");
  assert.match(watch, /channel\.restart\(/, "and reopens it");
  assert.match(watch, /10_000/, "but not in a loop");
  assert.match(source, /startKeepalive\(\);/, "and it is started with the channel");
});

test("Reconnect is an action the screen knows", async () => {
  const calls = [];
  const fake = fakeApi({ reconnect: async () => { calls.push("reconnect"); return true; } });
  fake.setSnap({ ...COLD, on: true, role: "guest", state: "connected", name: "Bo",
    diag: { signalling: "connected", line: "", useTurn: false, sent: 3, received: 0, peers: [] } });
  assert.equal(await ui.act("reconnect"), true);
  assert.deepEqual(calls, ["reconnect"], "the screen asks the session to reconnect");
  assert.match(ui.panelState().message, /Reconnected/);
});

test("a hello that never arrives ends with a relay attempt on both ends", async () => {
  // A relay that accepts the room but never delivers a hello: the handshake cannot happen.
  const relay = fakeRelay({ dropFirst: "hello", dropAll: "hello" });
  setLibraryLoader(async () => relay);
  session.setChannelFactory(null);
  const was = { retry: NET.helloRetrySec, wait: NET.helloWaitSec };
  NET.helloRetrySec = 0.02;
  NET.helloWaitSec = 0.06;
  const host = session.createChannelForTest("host", "w-relay", "Ada", "host-token", worldKit("w-relay"));
  await host.start();
  const guest = session.createChannelForTest("guest", "w-relay", "Bo", "guest-token", worldKit("w-relay"));
  await guest.start();
  await new Promise(resolve => setTimeout(resolve, 200));

  assert.equal(guest.snapshot().relay, true, "the guest escalated to the relay");
  assert.equal(host.snapshot().relay, true, "and so did the host: a relayed path needs both ends");
  assert.ok(relay.joins.some(config => Array.isArray(config.turnConfig) && config.turnConfig.length),
    "the second attempt was configured with a relay server");
  assert.ok(host.snapshot().diag.sent > 0, "the screen has facts to show");

  NET.helloRetrySec = was.retry;
  NET.helloWaitSec = was.wait;
  host.stop();
  guest.stop();
  setLibraryLoader(null);
});

/* ------------------------------------------------------------------------- */
/* 11. Playtest 5's answer: the relays that introduce the two browsers        */
/* ------------------------------------------------------------------------- */
//
// The owner's report was decisive and had nothing to do with WebRTC: same build, same world id,
// both "finding", one browser in each room, zero messages sent. The introduction never happened.
// The library picks five of thirty public relays, seeded by the app id — and this game's five
// were obscure. They are now pinned, and the screen says whether they are reachable.

test("the signalling relays are pinned to known-good servers, not the library's shuffle", () => {
  assert.ok(RELAYS.relayUrls.length >= 5, "at least the five the library would use");
  for (const url of RELAYS.relayUrls) assert.match(url, /^wss:\/\/[a-z0-9.-]+$/, `${url} is a websocket relay`);
  assert.ok(RELAYS.relayUrls.includes("wss://nos.lol"), "and they are the long-running public ones");
  const transport = read("src/net/transport.js");
  assert.match(transport, /relayConfig = \{ urls: RELAYS\.relayUrls\.slice\(\) \}/, "the transport passes them");
});

test("relay health is measured and reported", async () => {
  const checks = [];
  setRelayProbe(async urls => {
    checks.push(urls);
    return { total: urls.length, open: urls.length - 1, checkedAt: Date.now() };
  });
  const channel = createChannel({ role: "host", worldId: "w-probe" });
  const status = await channel.checkRelays();
  // The library uses five relays (its `redundancy`), so those are the five we ask about.
  assert.deepEqual(checks[0], RELAYS.relayUrls.slice(0, 5), "it asks about exactly the relays in use");
  assert.equal(status.open, 4);
  assert.equal(channel.diagnostics().relays.open, 4, "and the diagnostics carry it");
  setRelayProbe(null);
});

test("the details block says how many relays answered, in words", () => {
  const base = { ...COLD, on: true, role: "host", state: "finding", name: "Ada", worldId: "w-1" };
  const diag = { signalling: "finding", line: "Waiting…", useTurn: false, sent: 0, received: 0, peers: [] };
  const dead = ui.screenHtml(ui.screenModel({ snap: { ...base, diag: { ...diag, relays: { total: 5, open: 0, checkedAt: 1 } } } }));
  assert.match(dead, /Relays reachable: 0 of 5/);
  assert.match(dead, /network is blocking them/);
  const fine = ui.screenHtml(ui.screenModel({ snap: { ...base, diag: { ...diag, relays: { total: 5, open: 4, checkedAt: 1 } } } }));
  assert.match(fine, /Relays reachable: 4 of 5/);
  assert.doesNotMatch(fine, /network is blocking them/);
  const report = ui.diagReport(ui.screenModel({ snap: { ...base, diag: { ...diag, relays: { total: 5, open: 2, checkedAt: 1 } } } }));
  assert.match(report, /Relays reachable: 2 of 5/);
});

test("Escape closes the multiplayer screen before it toggles the pause card", () => {
  const main = read("src/main.js");
  const pause = main.slice(main.indexOf('case "pause":'), main.indexOf('case "pause":') + 900);
  assert.match(pause, /isMultiplayerScreenOpen\(\)/, "the pause key asks whether the screen is open");
  assert.match(pause, /closeMultiplayer\(\)/, "and closes it first");
  assert.ok(pause.indexOf("isMultiplayerScreenOpen()") < pause.indexOf("setPause("),
    "before it does anything else with the pause state");
});

/* ------------------------------------------------------------------------- */
/* 12. Playtest 6: the relay's own view, and no multiplayer in the campaign   */
/* ------------------------------------------------------------------------- */

test("the details say how many relays the library itself kept", () => {
  const base = { ...COLD, on: true, role: "host", state: "finding", name: "Ada", worldId: "w-1" };
  const diag = { signalling: "finding", line: "Waiting…", useTurn: false, sent: 0, received: 0, peers: [] };
  // Three answered a plain socket; the library kept none of them, because they refused its
  // events. That is a different failure from "your network blocks everything".
  const model = ui.screenModel({
    snap: { ...base, diag: { ...diag, relays: { total: 5, open: 3, connected: 0, checkedAt: 1 } } },
  });
  const html = ui.screenHtml(model);
  assert.match(html, /Relays reachable: 3 of 5/);
  assert.match(html, /Relays connected: 0/);
  assert.match(html, /none of them would carry this game's messages/i);
  assert.match(ui.diagReport(model), /Relays connected: 0/);

  const fine = ui.screenHtml(ui.screenModel({
    snap: { ...base, diag: { ...diag, relays: { total: 5, open: 5, connected: 4, checkedAt: 1 } } },
  }));
  assert.match(fine, /Relays connected: 4/);
  assert.doesNotMatch(fine, /would carry this game's messages/i);
});

test("the campaign's pause card has no multiplayer row; a live session keeps it", () => {
  assert.equal(ui.multiplayerAvailable("campaign"), false, "the campaign does not offer it");
  assert.equal(ui.multiplayerAvailable("open"), true, "free flight does");
  const pause = read("src/ui/pause.js");
  assert.match(pause, /mpCard\.hidden = !\(multiplayerAvailable\(state\.mode\) \|\| isOn\(\)\)/,
    "and the card follows the mode, except while a session is on");
});

test("the code path can fall back to a TURN server, because it has no relay to fall back to", () => {
  assert.ok(Array.isArray(ICE.turn) && ICE.turn.length, "a TURN server is configured");
  const paste = read("src/net/paste.js");
  assert.match(paste, /\.\.\.\(Array\.isArray\(ICE\.turn\)/, "and the code path uses it");
  assert.match(paste, /stun:/, "beside STUN, which still wins when a direct path exists");
});

test("the relay list keeps more than one family of servers", () => {
  assert.ok(RELAYS.relayUrls.length >= 8,
    "a relay that opens a socket can still refuse these events, so one family is not enough");
  assert.equal(new Set(RELAYS.relayUrls).size, RELAYS.relayUrls.length, "and none repeats");
});

test("a stalled host is told to use the codes, and a stalled guest gets the box to paste one", () => {
  const stalledHost = { ...COLD, on: true, role: "host", state: "finding", name: "Ada", worldId: "w-1", stalled: true };
  const hostHtml = ui.screenHtml(ui.screenModel({ snap: stalledHost, view: { surface: "host" } }));
  assert.match(hostHtml, /Nobody has appeared in your room/);
  assert.match(hostHtml, /No relay\? Copy\/paste codes/);

  // A guest who never got in is on the pause card, which used to have no paste box at all.
  const stalledGuest = { ...COLD, on: true, role: "guest", state: "finding", name: "Bea", worldId: "w-1", stalled: true };
  const guestHtml = ui.screenHtml(ui.screenModel({ snap: stalledGuest, view: { surface: "host" } }));
  assert.match(guestHtml, /data-mp="join"/, "the guest can paste the host's code from the pause card");
  assert.match(guestHtml, /Join/i);

  // And nothing of that appears while the room is merely waiting normally.
  const waiting = ui.screenHtml(ui.screenModel({ snap: { ...COLD, on: true, role: "host", state: "finding", name: "Ada", worldId: "w-1" }, view: { surface: "host" } }));
  assert.doesNotMatch(waiting, /Nobody has appeared in your room/);
});

test("the session decides when a room counts as stalled, and it is not an error", () => {
  const src = read("src/net/session.js");
  assert.match(src, /function armStallTimer\(\)/, "there is one timer for it");
  assert.match(src, /stalled = true;\s*\n\s*publish\(\);/, "it publishes the fact");
  assert.match(src, /NET\.helloWaitSec \* 1000/, "after the same wait as the hello");
  assert.match(src, /if \(channel\.peers\(\)\.length\) return;/, "and only with nobody in the room");
  assert.match(src, /stalled,/, "the snapshot carries it to the screen");
});

/* ------------------------------------------------------------------------- */
/* 13. Playtest 7: opening your own world ends a visit                        */
/* ------------------------------------------------------------------------- */

test("opening your own world leaves a friend's, and hosting is untouched", async () => {
  assert.equal(session.shouldLeaveVisit(null), false);
  assert.equal(session.shouldLeaveVisit({ on: false, role: "guest" }), false, "nothing to leave");
  assert.equal(session.shouldLeaveVisit({ on: true, role: "host" }), false, "your own world is not a visit");
  assert.equal(session.shouldLeaveVisit({ on: true, role: "guest" }), true);

  session.setChannelFactory(null);
  setLibraryLoader(async () => fakeRelay());
  setRelayProbe(null);

  const guest = session.createChannelForTest("guest", "w-leave", "Bo", "guest-token", worldKit("w-leave"));
  await guest.start();
  session.focusForTest(guest);
  assert.equal(session.snapshot().on, true);
  assert.equal(session.leaveVisit(), "w-leave", "it says which world was left");
  assert.equal(session.snapshot().on, false, "and the session is gone");
  assert.equal(session.isVisiting(), false);

  const host = session.createChannelForTest("host", "w-own", "Ada", "host-token", worldKit("w-own"));
  await host.start();
  session.focusForTest(host);
  assert.equal(session.leaveVisit(), false, "a host going to the menu and back is still hosting");
  assert.equal(session.snapshot().on, true);
  host.stop();
  session.focusForTest(null);
});

test("the title's Open World is where a visit ends, and the pilot comes home", () => {
  const menu = read("src/ui/menu.js");
  assert.match(menu, /function comeHome\(\)/);
  assert.match(menu, /if \(!leaveVisit\(\)\) return false;/, "it only acts on a real visit");
  assert.match(menu, /checkIn\(currentRootSave\(\), away\.suitcase\)/, "the suitcase is unpacked the same way slice 4 will");
  assert.match(menu, /intro\(\) \{\s*\n\s*comeHome\(\);/, "and it runs before the open world loads");
  // The join path must not trip over it: entering the world a join just produced is not a leave.
  const entered = menu.indexOf('on("mp-enter-world"');
  assert.doesNotMatch(menu.slice(entered, entered + 400), /comeHome/, "a fresh join does not leave");
});
