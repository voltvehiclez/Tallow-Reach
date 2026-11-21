// One multiplayer session, two sides (refactor step 16, slice 3).
//
// Two real sessions are joined by an in-memory wire, so the handshake, the guest list and
// the chat all go through the same code the broker path uses — every message the host
// sends is parsed by the guest's protocol reader, and the other way round. What this
// proves is who gets in and what they see. What it cannot prove is the wire itself: that
// is the owner's two-browser test, and pretending otherwise would be a test that passes
// while the real thing fails.
//
// The session reaches the wire through `setChannelFactory`, and the game's `state` through
// `setSaveKit`, so no bundler and no stubbing of modules is involved.
//
// Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import * as session from "../src/net/session.js";
import { SAVE_VERSION, newProfile, newWorld } from "../src/state/profile.js";
import { handshake } from "../src/net/custody.js";

const root = fileURLToPath(new URL("..", import.meta.url));

/** The world a host is holding, in place of the game's live save. */
function makeSave(extra = {}) {
  return { v: SAVE_VERSION, profile: newProfile(), world: newWorld(), away: null, ...extra };
}

/**
 * Build the in-memory wire: one channel per session, each `send` handed to the other
 * side's reader, which is exactly what a relay does for real. Returns the factory and the
 * list of channels it made, in order.
 */
function makeWire() {
  const made = [];
  const factory = ({ role, worldId, onState, onData, onPeer }) => {
    const channel = {
      role,
      worldId,
      peerId: null,
      outbound: [],
      inbound: [],
      join: async () => {
        onState?.({ state: "finding", reason: "" });
        return channel;
      },
      send: (peerId, value) => {
        channel.outbound.push({ peerId, value });
        channel.deliver?.(peerId, value);
        return true;
      },
      broadcast: value => {
        if (!channel.peerId) return 0;
        channel.send(channel.peerId, value);
        return 1;
      },
      peers: () => (channel.peerId ? [channel.peerId] : []),
      state: () => ({ state: channel.peerId ? "connected" : "finding", reason: "" }),
      room: () => worldId,
      leave: () => { channel.left = true; },
      /** Test side: a message arrives from the other browser. */
      reach: (message, peerId = "peer-1") => {
        channel.inbound.push(message);
        onData?.({ ...message, peerId });
      },
      /** Test side: the two browsers are connected. */
      connect(peerId = "peer-1") {
        channel.peerId = peerId;
        onPeer?.({ kind: "join", peerId });
      },
    };
    made.push(channel);
    return channel;
  };
  return { factory, made };
}

/** Two sessions, wired to each other, each with its own save (and its own view of it). */
async function twoSessions({ hostName = "Ada", guestName = "Bo" } = {}) {
  const wire = makeWire();
  session.setChannelFactory(wire.factory);
  const hostSave = makeSave();
  const guestSave = makeSave();
  const hostKit = { read: () => hostSave, write: next => Object.assign(hostSave, next) };
  const guestKit = { read: () => guestSave, write: () => { /* a guest keeps nothing locally yet */ } };

  const host = session.createChannelForTest("host", "w-1", hostName, "host-token", hostKit);
  await host.start();
  const hostChannel = wire.made.at(-1);
  const guest = session.createChannelForTest("guest", "w-1", guestName, "guest-token", guestKit);
  await guest.start();
  const guestChannel = wire.made.at(-1);

  // Join the pair: everything either sends now arrives on the other side.
  hostChannel.deliver = (peerId, value) => guestChannel.reach(value, peerId);
  guestChannel.deliver = (peerId, value) => hostChannel.reach(value, peerId);
  hostChannel.connect("guest-peer");
  guestChannel.connect("host-peer");

  return { host, guest, hostChannel, guestChannel, hostSave, guestKit, wire };
}

/** A hello exactly as the guest's session would write one. */
const helloFrom = (guest, overrides = {}) => ({
  t: "hello", v: SAVE_VERSION, worldId: "w-1", guestId: "guest-guest-to", name: "Bo", token: "guest-token", ...overrides,
});

test("a session starts cold and says so, with no connection and no chat", () => {
  const snap = session.snapshot();
  assert.equal(snap.on, false);
  assert.equal(snap.role, null);
  assert.equal(snap.guests.length, 0);
  assert.equal(snap.chat.length, 0);
  assert.equal(session.isOn(), false);
  assert.equal(session.say("hello"), false, "nothing to say anything to");
});

test("a first hello is checked for the build, the world and a name — and admitted", async () => {
  const { host, hostChannel } = await twoSessions();
  hostChannel.outbound.length = 0;
  hostChannel.reach(helloFrom(host));

  const welcome = hostChannel.outbound.find(m => m.value.t === "welcome");
  assert.ok(welcome, "a good hello is answered with a welcome");
  assert.equal(welcome.value.worldId, "w-1");
  assert.equal(welcome.value.you, "guest-guest-to");
  assert.deepEqual(welcome.value.guests.map(g => g.guestId), ["guest-guest-to"], "the welcome says who is here");
  const snap = host.snapshot();
  assert.deepEqual(snap.guests.map(g => g.name), ["Bo"], "and the host draws the guest");
});

test("a hello from a different build is refused with what to do about it", async () => {
  const { host, hostChannel } = await twoSessions();
  hostChannel.outbound.length = 0;
  hostChannel.reach(helloFrom(host, { v: SAVE_VERSION - 1 }));

  const refused = hostChannel.outbound.find(m => m.value.t === "refuse");
  assert.ok(refused, "a version mismatch is refused");
  assert.equal(refused.value.reason, "version");
  assert.match(refused.value.message, /same build/, "and the sentence says what to do");
  assert.equal(host.snapshot().guests.length, 0, "a refused guest is not added to the list");
});

test("a hello for a different world is refused, and a nameless one too", async () => {
  const { host, hostChannel } = await twoSessions();
  hostChannel.outbound.length = 0;
  hostChannel.reach(helloFrom(host, { worldId: "w-2" }));
  assert.equal(hostChannel.outbound.find(m => m.value.t === "refuse")?.value.reason, "world");

  hostChannel.outbound.length = 0;
  hostChannel.reach(helloFrom(host, { name: "" }));
  assert.equal(hostChannel.outbound.find(m => m.value.t === "refuse")?.value.reason, "shape");
});

test("a returning guest must prove the secret it was given — the slice-1 check, not a copy", async () => {
  const { host, hostChannel, hostSave } = await twoSessions();
  hostChannel.reach(helloFrom(host));
  const record = hostSave.world.guests["guest-guest-to"];
  assert.ok(record, "the host keeps a record for the guest it let in");
  assert.equal(typeof record.tokenHash, "string", "and the record holds a hash, never the secret");
  assert.equal(JSON.stringify(record).includes("guest-token"), false, "the secret itself is not in the save");

  // The same check the session uses, called directly: a wrong secret is refused, and the
  // sentence tells the player what to ask for.
  const wrong = handshake({
    token: "not-the-token", guestId: "guest-guest-to", record,
    version: SAVE_VERSION, worldVersion: SAVE_VERSION, worldId: "w-1", expectedWorldId: "w-1",
  });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.reason, "token");
  assert.match(wrong.message, /new one/);

  // And the session itself refuses that hello rather than trusting a name it has seen.
  hostChannel.outbound.length = 0;
  hostChannel.reach(helloFrom(host, { token: "not-the-token" }));
  assert.equal(hostChannel.outbound.find(m => m.value.t === "refuse")?.value.reason, "token", "a known guest with a wrong secret is turned away");
});

test("a chat line from the guest arrives on the host, attributed and capped", async () => {
  const { host, guest, hostChannel } = await twoSessions();
  hostChannel.reach(helloFrom(host));

  assert.equal(guest.say("dock with me"), true, "the guest can speak once connected");
  const line = host.snapshot().chat.at(-1);
  assert.equal(line.text, "dock with me");
  assert.equal(line.from, "Bo", "a line arrives under the sender's name");
  assert.equal(line.own, false, "and the host did not say it");

  assert.equal(host.say("  "), false, "an empty line is never sent");
  assert.equal(host.say("x".repeat(1000)), true);
  assert.equal(guest.snapshot().chat.at(-1).text.length <= 240, true, "a line is cut before it leaves");
  // `from` on the receiving side is the sender's name, never a name the sender chose.
  assert.equal(guest.snapshot().chat.at(-1).from, "Ada");
});

test("the chat history is a short window, not a log", async () => {
  const { host, hostChannel } = await twoSessions();
  hostChannel.reach(helloFrom(host));
  for (let i = 0; i < 40; i++) host.say(`line ${i}`);
  const snap = host.snapshot();
  assert.equal(snap.chat.length <= 8, true, "only the recent lines are kept");
  assert.equal(snap.chat.at(-1).text, "line 39", "and the newest is the last");
});

test("a session leaves cleanly: it stops, forgets its peers and says it is off", async () => {
  const { host, hostChannel } = await twoSessions();
  hostChannel.reach(helloFrom(host));
  assert.equal(host.snapshot().guests.length, 1);
  host.stop();
  assert.equal(host.on, false);
  assert.equal(hostChannel.left, true, "the channel is closed, so the broker forgets the room");
  assert.equal(host.snapshot().on, false);
  assert.equal(host.snapshot().guests.length, 0);
});

test("chat arrives as a line, is capped, and is never saved", async () => {
  const { cleanMessage, readMessage } = await import("../src/net/protocol.js");
  const line = cleanMessage("chat", { text: "  dock with me  ", from: "Ada", at: 5 });
  assert.deepEqual(readMessage(line), { t: "chat", text: "dock with me", from: "Ada", at: 5 });
  // Whatever the session keeps is session state: there is no save field for chat, and the
  // snapshot is a copy, so a screen cannot write into it.
  const snap = session.snapshot();
  const before = snap.chat.length;
  snap.chat.push({ from: "x", text: "y" });
  assert.equal(session.snapshot().chat.length, before, "the snapshot is a copy, not the live list");
});

test("the chat input is a real text field, so typing cannot fly the ship", () => {
  // The whole rule is kept by using an <input>: core/input.js ignores keys aimed at a
  // text field. This asserts the mechanism the rule depends on, both ways round.
  const input = readFileSync(path.join(root, "src/core/input.js"), "utf8");
  assert.match(input, /isTextInput/, "input.js distinguishes a text field");
  assert.match(input, /e\.target\.tagName === "INPUT"/, "and checks the event's target");

  const ui = readFileSync(path.join(root, "src/ui/multiplayer.js"), "utf8");
  assert.match(ui, /<input id="mp-chat-input"/, "the chat box is an input, not a div");
  assert.match(ui, /event\.stopPropagation\(\)/, "and it stops its keys reaching the game's bindings");
});

test("Enter opens chat and Escape closes it — bound once, no second copy of the rule", () => {
  const input = readFileSync(path.join(root, "src/core/input.js"), "utf8");
  assert.match(input, /Enter: "chat"/, "Enter is a named action");
  const main = readFileSync(path.join(root, "src/main.js"), "utf8");
  assert.match(main, /case "chat":/, "main.js handles it");
  assert.match(main, /openChat\(\)/, "by opening the box");
});

test("the world does not pause while multiplayer is on", () => {
  const step = readFileSync(path.join(root, "src/sim/step.js"), "utf8");
  assert.match(step, /state\.multiplayer/, "the pause gate asks the multiplayer flag");
  const pause = readFileSync(path.join(root, "src/ui/pause.js"), "utf8");
  assert.match(pause, /state\.multiplayer = !v && isOn\(\)/, "and the card sets it");
});

test("nothing in net/ imports the layers above it (slice 2's rule still holds)", () => {
  for (const file of ["transport.js", "session.js", "protocol.js", "paste.js", "join-link.js", "settings.js", "boot.js"]) {
    const src = readFileSync(path.join(root, "src/net", file), "utf8");
    assert.doesNotMatch(src, /from "\.\.\/(ui|render|core)\//, `net/${file} must not import ui/, render/ or core/`);
  }
  // The one allowance: the library is named in transport.js and nowhere else.
  for (const file of ["session.js", "protocol.js", "paste.js", "join-link.js", "settings.js", "boot.js"]) {
    const src = readFileSync(path.join(root, "src/net", file), "utf8");
    assert.doesNotMatch(src, /from "trystero"|import\("trystero"\)/, `net/${file} must not import the network library`);
  }
  const transport = readFileSync(path.join(root, "src/net", "transport.js"), "utf8");
  assert.match(transport, /import\("trystero"\)/, "transport.js is where it lives");
});
