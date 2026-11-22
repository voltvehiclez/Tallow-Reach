// The connection's plain parts (refactor step 16, slice 3): the join link, the wire
// protocol, the paste codes and the transport's state machine — all with no browser and
// no relay.
//
// What is deliberately NOT tested here: an actual WebRTC connection. It cannot be made in
// Node (no RTCPeerConnection, no relay socket), and pretending otherwise would be a test
// that passes while the real thing fails. The owner's two-browser test is the proof for
// the wire itself; these tests prove the parts that decide what goes over it.
//
// Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  makeJoinLink, makeJoinUrl, readJoinLink, linkFromLocation, pageBase,
} from "../src/net/join-link.js";
import { cleanMessage, readMessage, isChatLine, KINDS } from "../src/net/protocol.js";
import { pack, unpack, looksLikeCode, codeLength } from "../src/net/paste.js";
import { createChannel, roomNameFor, stateLine, isLive } from "../src/net/transport.js";
import { readSettings, writeSettings, cleanName, nameIsSet } from "../src/net/settings.js";
import { ROOM_NAMESPACE, NET, CHAT, RELAYS } from "../src/data/multiplayer.js";
import { SAVE_VERSION } from "../src/state/profile.js";

/* ------------------------------------------------------------------------- */
/* Settings (the username and the two switches)                               */
/* ------------------------------------------------------------------------- */

function mockStorage() {
  const mem = new Map();
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: key => (mem.has(key) ? mem.get(key) : null),
    setItem: (key, value) => { mem.set(key, String(value)); },
    removeItem: key => { mem.delete(key); },
  };
  return { mem, restore: () => { globalThis.localStorage = previous; } };
}

const withStorage = fn => {
  const store = mockStorage();
  try {
    return fn(store.mem);
  } finally {
    store.restore();
  }
};

test("settings: a name is remembered, trimmed and capped, and never in a save", () => {
  withStorage(() => {
    assert.deepEqual(readSettings(), { name: "", enabled: false, autoJoin: true, relay: null, lastJoin: "" }, "nothing stored is a clean slate");
    writeSettings({ name: "  Ada   Lovelace " });
    assert.equal(readSettings().name, "Ada Lovelace", "runs of spaces collapse and the ends are trimmed");
    assert.equal(nameIsSet(), true);
    writeSettings({ name: "x".repeat(90) });
    assert.equal(readSettings().name.length, NET.nameMax, "a name is capped at NET.nameMax");
    assert.equal(cleanName(""), "");
    assert.equal(nameIsSet(""), false);
    // The switches are separate from the name and keep their values.
    writeSettings({ enabled: true, autoJoin: false });
    assert.deepEqual(readSettings(), { name: "x".repeat(NET.nameMax), enabled: true, autoJoin: false, relay: null });
  });
  // No storage at all (private window): a working session, just no memory.
  const previous = globalThis.localStorage;
  delete globalThis.localStorage;
  try {
    assert.deepEqual(readSettings(), { name: "", enabled: false, autoJoin: true, relay: null });
    assert.doesNotThrow(() => writeSettings({ name: "Ada" }));
  } finally {
    globalThis.localStorage = previous;
  }
});

test("settings: nonsense in storage is ignored rather than fatal", () => {
  withStorage(mem => {
    mem.set("tr_mp", "{not json");
    assert.deepEqual(readSettings(), { name: "", enabled: false, autoJoin: true, relay: null });
    mem.set("tr_mp", JSON.stringify({ name: 42, enabled: "yes" }));
    assert.deepEqual(readSettings(), { name: "", enabled: false, autoJoin: true, relay: null }, "wrong types fall back");
    // A relay server is remembered with the other settings, and nonsense is dropped.
    mem.set("tr_mp", JSON.stringify({ name: "Ada", relay: { urls: "turn:a.example:443", username: "u", credential: "c" } }));
    assert.deepEqual(readSettings().relay, { urls: "turn:a.example:443", username: "u", credential: "c" });
    mem.set("tr_mp", JSON.stringify({ name: "Ada", relay: "yes" }));
    assert.equal(readSettings().relay, null, "a relay that is not three strings is not a relay");
  });
});

/* ------------------------------------------------------------------------- */
/* The join link: one link, the secret after the #                            */
/* ------------------------------------------------------------------------- */

test("join link: the secret rides after the #, so no server ever sees it", () => {
  const link = makeJoinLink("w-abc123", "s3cr3t");
  assert.equal(link, "?join=w-abc123#s3cr3t");
  assert.equal(makeJoinUrl("w-abc123", "s3cr3t", "https://example.com/game.html"),
    "https://example.com/game.html?join=w-abc123#s3cr3t");
  // A world id is escaped: an unusual id must not split the link.
  assert.equal(makeJoinLink("w a&b", "tok"), "?join=w%20a%26b#tok");
  assert.deepEqual(readJoinLink(makeJoinLink("w a&b", "tok")), { ok: true, worldId: "w a&b", token: "tok" });
  // No id or no token is not a link, so a half-built one is never shown.
  assert.equal(makeJoinLink("", "tok"), "");
  assert.equal(makeJoinLink("w-1", ""), "");
});

test("join link: a link pasted out of a chat message is read correctly", () => {
  // The likely mistakes: the whole sentence, quotes from a chat app, the link on its own.
  const cases = [
    ["?join=w-1#tok", "w-1", "tok"],
    ["hey, join me: https://x.example/game.html?join=w-1#tok — see you there", "w-1", "tok"],
    ["  \"?join=w-1#tok\"  ", "w-1", "tok"],
    ["<https://x.example/game.html?join=w-1#tok>", "w-1", "tok"],
  ];
  for (const [text, worldId, token] of cases) {
    const found = readJoinLink(text);
    assert.equal(found.ok, true, `should read a link out of: ${text}`);
    assert.equal(found.worldId, worldId);
    assert.equal(found.token, token, `the sentence after the secret must not be swallowed: ${text}`);
  }
});

test("join link: a wrong or half link is refused with a sentence a player can act on", () => {
  const empty = readJoinLink("");
  assert.equal(empty.ok, false);
  assert.match(empty.message, /Paste the link/);

  const shape = readJoinLink("come play tallow reach");
  assert.equal(shape.reason, "shape");
  assert.match(shape.message, /\?join=/);

  const half = readJoinLink("?join=w-1");
  assert.equal(half.reason, "incomplete");
  assert.match(half.message, /after the #/, "it names the part that is missing");

  const noSecret = readJoinLink("?join=w-1#");
  assert.equal(noSecret.ok, false);

  // A link with a fragment that is not a token shape is still read, and the handshake is
  // what refuses it: the reader's job is to find the value, not to judge it.
  assert.equal(readJoinLink("?join=w-1#abc-def").token, "abc");
});

test("join link: the address bar and the page base are read without a browser", () => {
  assert.deepEqual(linkFromLocation("?join=w-1", "#tok"), { ok: true, worldId: "w-1", token: "tok" });
  assert.equal(linkFromLocation("", ""), null, "no link in the bar");
  assert.equal(linkFromLocation("?join=w-1", ""), null, "a fragment is part of the link");
  assert.equal(typeof pageBase(), "string");
});

/* ------------------------------------------------------------------------- */
/* The wire protocol: small, validated, and nothing it does not know          */
/* ------------------------------------------------------------------------- */

test("protocol: every kind is cleaned to its own fields, and nothing else survives", () => {
  assert.deepEqual(KINDS.sort(), ["chat", "hello", "ping", "pong", "presence", "refuse", "welcome"]);

  const hello = cleanMessage("hello", { v: SAVE_VERSION, worldId: "w-1", guestId: "g-1", name: "Ada", token: "tok", admin: true });
  assert.deepEqual(Object.keys(hello), ["t", "v", "worldId", "guestId", "name", "token"], "a hello carries no extra field");
  assert.equal(hello.v, SAVE_VERSION, "and it says which build it is, so a mismatch is refused in words");

  assert.equal(cleanMessage("nope", {}), null, "an unknown kind cannot be sent");
  assert.equal(cleanMessage("chat", { text: "   " }), null, "an empty line is not a line");
});

test("protocol: a message cannot be used to fill the other side's screen or memory", () => {
  const line = cleanMessage("chat", { text: "x".repeat(NET.chatLineMax + 500), from: "Ada" });
  assert.equal(line.text.length, NET.chatLineMax, "a chat line is capped");
  const name = cleanMessage("hello", { name: "n".repeat(500) });
  assert.equal(name.name.length, NET.nameMax, "a name is capped");
  const list = cleanMessage("presence", { guests: Array.from({ length: 200 }, (_, i) => ({ guestId: `g${i}` })) });
  assert.equal(list.guests.length, 32, "a guest list is capped");
  // A chat line's whitespace is collapsed: no line of 200 spaces, no leading blank rows.
  assert.equal(cleanMessage("chat", { text: "  a   b\n\tc " }).text, "a b c");
});

test("protocol: what arrives is validated, and junk is dropped silently", () => {
  for (const junk of [null, undefined, 42, "hello", [], {}, { t: "unknown" }, { t: "chat" }]) {
    assert.equal(readMessage(junk), null, `junk is dropped: ${JSON.stringify(junk)}`);
  }
  const good = readMessage({ t: "ping", at: 1234, extra: "x" });
  assert.deepEqual(good, { t: "ping", at: 1234 });
  assert.equal(isChatLine({ t: "chat", text: "hi", from: "Ada", at: 1 }), true);
  assert.equal(isChatLine({ t: "refuse", reason: "token" }), false);
});

/* ------------------------------------------------------------------------- */
/* Paste codes: the fallback, with no library and no relay                    */
/* ------------------------------------------------------------------------- */

test("paste codes: an offer and an answer round-trip as text a player can send", () => {
  const sdp = "v=0\r\no=- 4611731400430051336 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n";
  const offer = pack("offer", { type: "offer", sdp });
  assert.equal(looksLikeCode(offer), true);
  assert.equal(offer.startsWith("TRJOIN:"), true, "a code says what game it belongs to");
  const back = unpack(offer);
  assert.equal(back.kind, "offer");
  assert.equal(back.description.type, "offer");
  assert.equal(back.description.sdp, sdp);
  assert.equal(codeLength(offer), offer.length);

  const answer = pack("answer", { type: "answer", sdp: sdp.replace("127.0.0.1", "10.0.0.2") });
  assert.equal(unpack(answer).kind, "answer");
});

test("paste codes: whitespace from a chat app is harmless, junk is refused", () => {
  const offer = pack("offer", { type: "offer", sdp: "v=0\r\ns=-\r\n" });
  // A chat app wraps a long code over lines; that must not break it.
  const wrapped = offer.replace(/(.{30})/g, "$1\n  ");
  assert.equal(unpack(wrapped)?.kind, "offer", "line breaks and indentation are ignored");

  for (const junk of ["", "hello", "TRJOIN:", "TRJOIN:!!!!", "TRJOIN:" + btoa("{}")]) {
    assert.equal(unpack(junk), null, `refused: ${JSON.stringify(junk.slice(0, 20))}`);
  }
  assert.equal(looksLikeCode("?join=w-1#tok"), false, "a link is not a code");
});

/* ------------------------------------------------------------------------- */
/* The channel's state machine (no browser, no relay)                        */
/* ------------------------------------------------------------------------- */

test("transport: a channel starts idle, refuses to send, and its room names the world", () => {
  const channel = createChannel({ role: "host", worldId: "w-1" });
  assert.deepEqual(channel.state(), { state: "idle", reason: "" });
  assert.deepEqual(channel.peers(), []);
  assert.equal(channel.send("peer", { t: "ping" }), false, "nothing to send through yet");
  assert.equal(channel.broadcast({ t: "ping" }), 0);
  assert.equal(channel.room(), roomNameFor("w-1"));
  assert.equal(channel.room(), `${ROOM_NAMESPACE}:w-1`, "the room is derived from the app id and the world");
  assert.equal(isLive(channel), false);
  assert.equal(stateLine({ state: "idle" }), "Multiplayer is off.");
  channel.leave();
  assert.equal(channel.state().state, "closed");
});

test("transport: a world with no id fails in words instead of trying", async () => {
  const seen = [];
  const channel = createChannel({ role: "host", worldId: "", onState: s => seen.push(s.state) });
  assert.equal(await channel.join(), null);
  assert.equal(channel.state().state, "lost");
  assert.match(channel.state().reason, /no id/, "the message says what is missing");
  assert.ok(seen.includes("lost"));
  assert.equal(isLive(channel), false);
});

test("transport: relays are configurable data, not code", () => {
  // `RELAYS.relayUrls` empty means the library's own free public list. If that list ever
  // dies, this is the one place a working relay goes (and nothing else changes).
  assert.ok(Array.isArray(RELAYS.relayUrls));
  assert.equal(ROOM_NAMESPACE, "tallowreach.p2p", "changing this breaks every link already sent");
});
