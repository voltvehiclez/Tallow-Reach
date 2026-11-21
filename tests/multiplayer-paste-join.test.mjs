// The paste-code join, end to end (refactor step 16, slice 3, repaired 2026-11-21).
//
// The owner's report: "I cannot seem to connect to another client in a browser tab. It
// says 'Make a fresh offer first'." Two things were wrong with this fallback, and both are
// tested here:
//
//  1. The **guest could not start one.** Accepting a code needed a guest session, and a
//     guest session could only be made by a join link — so the fallback for "the link does
//     not work" could only be used when the link had worked.
//  2. A code carried no **world id**, so the host's own handshake would refuse the very
//     guest it had just invited.
//
// The wire below is a stub of `RTCPeerConnection` (Node has none): the two halves of the
// two browsers are one process, but every line of `net/paste.js`, `net/session.js` and
// `net/protocol.js` between them is the real code. What this cannot prove is real ICE:
// that is two actual browsers, which is the owner's playtest.
//
// Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { pack, unpack, codeWorldId, looksLikeCode } from "../src/net/paste.js";
import * as session from "../src/net/session.js";
import { SAVE_VERSION, newProfile, newWorld } from "../src/state/profile.js";
import { state } from "../src/state/state.js";

/* ------------------------------------------------------------------------- */
/* The code itself                                                           */
/* ------------------------------------------------------------------------- */

test("a code names the world it invites, and a code from before that still reads", () => {
  const description = { type: "offer", sdp: "v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\n" };
  const code = pack("offer", description, "w-42");
  assert.equal(looksLikeCode(code), true);
  assert.deepEqual(unpack(code), { kind: "offer", worldId: "w-42", description });
  assert.equal(codeWorldId(code), "w-42");

  // Version 1 (built earlier the same day) had no world id. It still reads; the host's own
  // handshake then decides, which is where that decision belongs.
  const legacy = "TRJOIN:" + Buffer.from(JSON.stringify({ v: 1, kind: "offer", description })).toString("base64");
  assert.equal(unpack(legacy).worldId, "");
  assert.equal(codeWorldId(legacy), "");

  // Nonsense names no world rather than throwing.
  assert.equal(codeWorldId("TRJOIN:not-real-base64!!"), "");
  assert.equal(codeWorldId("hello"), "");
});

/* ------------------------------------------------------------------------- */
/* Two browsers, one code each way                                           */
/* ------------------------------------------------------------------------- */

/** The two halves of a direct connection; `complete()` is what joins them. */
const connections = [];

class FakeChannel {
  constructor() {
    this.readyState = "connecting";
    this.peer = null;
    this.onmessage = null;
    this.onopen = null;
    this.onclose = null;
  }
  open() {
    this.readyState = "open";
    this.peer.readyState = "open";
    this.onopen?.();
    this.peer.onopen?.();
  }
  send(data) {
    if (this.peer?.onmessage) this.peer.onmessage({ data });
  }
  close() {
    this.readyState = "closed";
    this.peer && (this.peer.readyState = "closed");
  }
}

class FakePeerConnection {
  constructor() {
    this.iceGatheringState = "complete";
    this.connectionState = "new";
    this.localDescription = null;
    this.remoteDescription = null;
    this.created = [];
    connections.push(this);
  }
  addEventListener() {}
  removeEventListener() {}
  createDataChannel() {
    const channel = new FakeChannel();
    this.created.push(channel);
    this.channel = channel;
    return channel;
  }
  async createOffer() { return { type: "offer", sdp: "host-offer" }; }
  async createAnswer() { return { type: "answer", sdp: "guest-answer" }; }
  async setLocalDescription(description) { this.localDescription = description; }
  async setRemoteDescription(description) {
    this.remoteDescription = description;
    if (description.type !== "answer") return;
    // The host has just taken the guest's answer: link the two halves.
    const guest = connections.find(pc => pc !== this && pc.localDescription?.type === "answer" && !pc.paired);
    if (!guest) return;
    this.paired = guest.paired = true;
    const hostChannel = this.channel;
    const guestChannel = new FakeChannel();
    hostChannel.peer = guestChannel;
    guestChannel.peer = hostChannel;
    setTimeout(() => {
      this.connectionState = "connected";
      guest.connectionState = "connected";
      this.onconnectionstatechange?.();
      guest.onconnectionstatechange?.();
      guest.ondatachannel?.({ channel: guestChannel });
      hostChannel.open();
    }, 0);
  }
}

const settle = () => new Promise(resolve => setTimeout(resolve, 30));

function worldKit(worldId) {
  const save = {
    v: SAVE_VERSION,
    profile: newProfile(),
    world: { ...newWorld(), worldId, guests: {} },
    away: null,
  };
  return { read: () => JSON.parse(JSON.stringify(save)), write: next => Object.assign(save, next), raw: () => save };
}

test("a guest who has no link at all can join on a code, and the handshake accepts it", async () => {
  const previous = { rtc: globalThis.RTCPeerConnection, mode: state.mode };
  globalThis.RTCPeerConnection = FakePeerConnection;
  state.mode = "open";
  connections.length = 0;

  const hostKit = worldKit("w-hatch");
  session.setSaveKit(hostKit);

  try {
    // The host side: a session opened on its own world, making a code (no channel needed).
    const host = session.createChannelForTest("host", "w-hatch", "Ada", "host-token", hostKit);
    const offered = await host.startCodes();
    assert.match(offered.offer, /^TRJOIN:/, "the host has a code to send");
    assert.equal(codeWorldId(offered.offer), "w-hatch", "and the code says which world it is for");

    // The guest side: nothing is running, no link, just the code. This is the call that
    // used to answer "Multiplayer is off." and leave the player with no way in.
    const accepted = await session.codesAcceptFrom(offered.offer, { name: "Bo" });
    assert.equal(accepted.ok, true, `expected an answer code, got ${accepted.message || ""}`);
    assert.match(accepted.answer, /^TRJOIN:/, "the guest has an answer code to send back");

    // Back to the host with that answer.
    const finished = await host.finishCodes(accepted.answer);
    assert.equal(finished.ok, true, `expected the connection to finish, got ${finished.message || ""}`);
    await settle();

    // Both sides are connected, and the guest's hello crossed a wire that is not a broker.
    const hostSnap = host.snapshot();
    assert.equal(hostSnap.state, "connected");
    assert.deepEqual(hostSnap.guests.map(g => g.name), ["Bo"], "the host admits and lists the guest it invited");
    assert.equal(typeof hostKit.raw().world.guests[Object.keys(hostKit.raw().world.guests)[0]].tokenHash, "string");

    const guest = session.current();
    assert.ok(guest, "the guest has a session of its own now");
    assert.equal(guest.snapshot().state, "connected");
    assert.match(guest.snapshot().chat.at(-1).text, /Joined Ada's world/, "and is welcomed by name");

    // Chat over the code wire.
    assert.equal(host.say("the hatch is open"), true);
    await settle();
    assert.equal(guest.snapshot().chat.at(-1).text, "the hatch is open");

    session.stop();
  } finally {
    globalThis.RTCPeerConnection = previous.rtc;
    state.mode = previous.mode;
  }
});

test("a code that is not one is refused with a sentence, before anything is built", async () => {
  const previous = { rtc: globalThis.RTCPeerConnection, mode: state.mode };
  globalThis.RTCPeerConnection = FakePeerConnection;
  state.mode = "open";
  session.setSaveKit(worldKit("w-hatch"));
  try {
    const result = await session.codesAcceptFrom("hello, join me", { name: "Bo" });
    assert.equal(result.ok, false);
    assert.match(result.message, /join code/i);
    assert.equal(session.current(), null, "no half-built session is left behind");
  } finally {
    globalThis.RTCPeerConnection = previous.rtc;
    state.mode = previous.mode;
  }
});
