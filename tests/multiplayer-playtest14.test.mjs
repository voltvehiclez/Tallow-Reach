// Playtest 14 (owner): the three things that were visibly wrong.
//
//  1. A guest that leaves is not removed: no chat line, still in the players list — and its
//     record stayed behind, so the next join was treated as a RETURNING guest.
//  2. The title showed "Bring my pilot" for a moment and then entered the world by itself.
//  3. The away card's buttons did nothing, and the player could not get out of it.
//
// Each of these was a different bug, and none of them was in the arithmetic — so these tests
// are about *messages and screens*, not cargo.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as session from "../src/net/session.js";
import { SAVE_VERSION, newProfile, newWorld, sanitizeSave } from "../src/state/profile.js";
import { checkOut } from "../src/net/custody.js";
import { on } from "../src/util/events.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const STATION = "reach:meridian";

function makeWire() {
  const made = [];
  const factory = ({ role, worldId, onState, onData, onPeer }) => {
    const ch = {
      role, worldId, peerId: null, outbound: [],
      join: async () => { onState?.({ state: "finding", reason: "" }); return ch; },
      send: (peerId, value) => { ch.outbound.push({ peerId, value }); ch.deliver?.(peerId, value); return true; },
      broadcast: value => (ch.peerId ? (ch.send(ch.peerId, value), 1) : 0),
      peers: () => (ch.peerId ? [ch.peerId] : []),
      state: () => ({ state: ch.peerId ? "connected" : "finding", reason: "" }),
      room: () => worldId,
      leave: () => { ch.left = true; },
      reach: (message, peerId = "peer-1") => onData?.({ ...message, peerId }),
      connect(peerId = "peer-1") { ch.peerId = peerId; onPeer?.({ kind: "join", peerId }); },
      disconnect(peerId = "peer-1") { ch.peerId = null; onPeer?.({ kind: "leave", peerId }); },
    };
    made.push(ch);
    return ch;
  };
  return { factory, made };
}

function hostSave() {
  const s = { v: SAVE_VERSION, profile: newProfile(), world: newWorld(), away: null };
  s.world.stationStores[STATION] = { ferrite: 4 };
  return sanitizeSave(s);
}

/** A host with one guest in the room, admitted the ordinary way. */
async function hosting() {
  const wire = makeWire();
  session.setChannelFactory(wire.factory);
  const stored = hostSave();
  // Merge INTO the existing world rather than replacing it: the game's save kit writes the
  // whole mode save, and a shallow replace would leave this fixture holding a world the
  // session has already moved on from (which is how this test first "failed" on correct code).
  const kit = {
    read: () => stored,
    write: next => {
      const world = { ...(next.world || {}) };
      Object.assign(stored, next);
      stored.world = Object.assign(stored.world, world);
    },
  };
  const host = session.createChannelForTest("host", "w-1", "Ada", "host-token", kit);
  await host.start();
  const ch = wire.made.at(-1);
  ch.connect("guest-peer");
  ch.reach({ t: "hello", v: SAVE_VERSION, worldId: "w-1", guestId: "guest-bo", name: "Bo", token: "bo-token" }, "guest-peer");
  return { host, ch, stored, wire };
}

/* ---- 1: leaving must be visible, and must not lock the pilot out ---------------- */

test("playtest 14: a guest that leaves is removed, announced, and its ship goes too", async () => {
  const { host, ch, stored } = await hosting();
  assert.equal(host.snapshot().guests.length, 1, "the guest is in the players list");

  const chat = [];
  const gone = [];
  on("mp-notice", () => {});
  on("mp-guest-left", p => gone.push(p));
  const before = host.snapshot().chat.length;

  // The laptop closes its lid: the peer vanishes with no goodbye.
  ch.disconnect("guest-peer");

  const snap = host.snapshot();
  assert.equal(snap.guests.length, 0, "it is gone from the players list");
  assert.ok(snap.chat.length > before, "and the chat says something");
  assert.match(snap.chat.at(-1).text, /Bo left\./, "in words, naming the pilot");
  assert.equal(gone.length, 1, "and the host's world is told to remove its ship");
  assert.equal(gone[0].guestId, "guest-bo");
  // The record is kept but marked, so the pilot's suitcase is not thrown away.
  const record = stored.world.guests["guest-bo"];
  assert.ok(record, "the record survives: it holds the visiting pilot's suitcase");
  assert.equal(record.left, true, "marked as left, so the next hello knows it may re-admit");
});

test("playtest 14: a pilot that visited once can come back with a fresh link", async () => {
  const { ch, stored } = await hosting();
  ch.disconnect("guest-peer");
  assert.equal(stored.world.guests["guest-bo"].left, true);

  // It comes back with a NEW token, because the host's link was made fresh.
  session.setChannelFactory(makeWire().factory);
  const host2 = session.createChannelForTest("host", "w-1", "Ada", "host-token", {
    read: () => stored,
    write: next => {
      const world = { ...(next.world || {}) };
      Object.assign(stored, next);
      stored.world = Object.assign(stored.world, world);
    },
  });
  await host2.start();
  const ch2 = host2.channel();
  ch2.connect("guest-peer-2");
  const chats = [];
  on("mp-notice", () => {});
  ch2.reach({ t: "hello", v: SAVE_VERSION, worldId: "w-1", guestId: "guest-bo", name: "Bo", token: "a-brand-new-token" }, "guest-peer-2");

  const snap = host2.snapshot();
  assert.equal(snap.guests.length, 1, "it got in — the old hash is not a life sentence");
  assert.equal(snap.guests[0].name, "Bo");
  assert.equal(stored.world.guests["guest-bo"].left, false, "and the record is live again");
});

test("playtest 14: a guest's peer id is not wiped by a welcome or a presence list", () => {
  // The second half of bug 1. `welcome` and `presence` carry no peer id, and spreading one
  // over a known guest used to erase the peer id — so the guest could never be matched to
  // the peer that left, and stayed in the list for ever.
  const src = read("src/net/session.js");
  assert.match(src, /if \(!clean\.peerId\) delete clean\.peerId;/, "a missing peer id does not overwrite a known one");
});

/* ---- 2: a join must not enter the world with a frozen pilot --------------------- */

test("playtest 14/17: joining never enters the world by itself", () => {
  // Playtest 14 patched this by checking `state.away` before entering the world — the join
  // still entered it for everybody else, which is how it destroyed the "Bring my pilot"
  // button. Playtest 17 removed the auto-enter entirely: entering the world is its own press
  // in the join box, so there is no longer a path that can fly a frozen pilot.
  const src = read("src/ui/multiplayer.js");
  const after = src.slice(src.indexOf("function afterJoined()"));
  const body = after.slice(0, after.indexOf("\n}\n"));
  assert.doesNotMatch(body, /mp-enter-world/, "a join does not enter the world, for anybody");
});

/* ---- 3: the away card's buttons must actually work ----------------------------- */

test("playtest 14: coming home from the title unpacks the STORED mode save", () => {
  const src = read("src/ui/menu.js");
  assert.match(src, /bringPilotHomeAtMenu\(/, "the card's path uses the menu-aware rule");
  // The old bug in one line: leaving the visit was allowed to fail and the function gave up.
  assert.doesNotMatch(src, /if \(!leaveVisit\(\)\) return false;/, "leaving the visit is no longer a precondition for coming home");
  const net = read("src/net/session.js");
  assert.match(net, /export function bringPilotHomeAtMenu/, "and that rule exists");
  assert.match(net, /state\.away = null/, "it clears the marker the card reads, or the card can never go away");
});

test("playtest 14: Rejoin is a real attempt, not a screen", () => {
  const src = read("src/ui/menu.js");
  assert.match(src, /function rejoinStoredWorld\(/, "there is a rejoin that actually joins");
  assert.match(src, /makeJoinUrl\(away\.worldId, away\.token/, "it rebuilds the link from the marker");
  assert.match(src, /joinWorld\(\{ link \}\)/, "and calls the real join");
  // ...and the card says what each button does, so the player is not guessing.
  const screens = read("src/ui/screens.js");
  assert.match(screens, /<b>Rejoin<\/b> connects you/);
  assert.match(screens, /<b>Bring pilot home<\/b> ends/);
});

/* ---- 4: the test ship's new model -------------------------------------------- */

test("playtest 14: the test ship draws the owner's new model", () => {
  const manifest = read("src/render/model-manifest.js");
  assert.match(manifest, /"ship\.testship"/, "the key the renderer asks for is still registered");
  // The owner's file, not the old one. The old model was 180,916 bytes and carried a stray
  // "Page camera" node; the uploaded testship-v1.glb is 181,948 and carries one mesh node.
  const glb = readFileSync(new URL("../src/assets/models/ship.testship.glb", import.meta.url));
  assert.equal(glb.length, 181948, "it is the testship-v1.glb the owner uploaded");
  const jsonLen = glb.readUInt32LE(12);
  const json = JSON.parse(glb.toString("utf8", 20, 20 + jsonLen));
  const names = (json.nodes || []).map(n => n.name).filter(Boolean);
  assert.deepEqual(names, ["mesh_000"], "the old model's extra camera node is gone");
  assert.deepEqual(json.extensionsRequired.sort(), ["EXT_texture_webp", "KHR_draco_mesh_compression"],
    "and it needs exactly the two extensions the game already ships");
});
