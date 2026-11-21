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
import * as session from "../src/net/session.js";
import { setLibraryLoader } from "../src/net/transport.js";
import { SAVE_VERSION, newProfile, newWorld } from "../src/state/profile.js";

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

test("chat: a sent line goes and is cleared; an unsent line stays and says why", () => {
  fakeApi({ say: () => true, snapshot: () => ({ ...COLD, on: true, role: "host", state: "connected" }) });
  assert.deepEqual(ui.sendChatText("  hallo  "), { sent: true, problem: "" });

  // Hosting, nobody has joined yet: the line has nowhere to go, and that is what it says.
  fakeApi({ say: () => false, snapshot: () => ({ ...COLD, on: true, role: "host", state: "finding" }) });
  const alone = ui.sendChatText("hello");
  assert.equal(alone.sent, false);
  assert.match(alone.problem, /no other pilot is connected/i);

  // Multiplayer off is its own sentence.
  fakeApi({ say: () => false });
  assert.match(ui.sendChatText("hello").problem, /Multiplayer is off/i);

  // Connected but the message did not get through is a different sentence again.
  fakeApi({ say: () => false, snapshot: () => ({ ...COLD, on: true, role: "guest", state: "connected" }) });
  assert.match(ui.sendChatText("hello").problem, /could not be reached/i);

  // Nothing typed is not a failure.
  assert.deepEqual(ui.sendChatText("   "), { sent: false, problem: "" });
});

/* ------------------------------------------------------------------------- */
/* 6. The two front doors, and the chat box's rules                          */
/* ------------------------------------------------------------------------- */

test("the title menu has one button that opens this screen", () => {
  const screens = read("src/ui/screens.js");
  assert.match(screens, /<button class="go" data-a="multiplayer">Join Multiplayer World<\/button>/);
  const menu = read("src/ui/menu.js");
  assert.match(menu, /multiplayer\(\) \{\s*\n\s*openMultiplayer\(\{ focus: "join" \}\);/);
});

test("the pause card opens the same screen, and shows its state in one line", () => {
  const overlays = read("src/ui/overlays.js");
  assert.match(overlays, /multiplayerCardHtml\(\)/);
  const pause = read("src/ui/pause.js");
  assert.match(pause, /const mpButton = overlay\.querySelector\("#pz-mp"\);/);
  // Guarded: a pause card drawn without the multiplayer line (a test's fake DOM, an older
  // overlay) must not throw on the way to wiring the rest of the card.
  assert.match(pause, /if \(mpButton\) mpButton\.onclick = \(\) => openMultiplayer\(\);/);
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
function fakeRelay() {
  const rooms = new Map();
  let next = 1;
  return {
    joinRoom(config, roomId) {
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
