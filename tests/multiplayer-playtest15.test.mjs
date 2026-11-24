// Playtest 15 (owner): the away card stopped being a card and became a trap.
//
// Three symptoms, one shape:
//
//  1. "Bring pilot home" answered *Your pilot's save could not be read, so it cannot come
//     home yet.* — every time, in both browsers, and at first boot too.
//  2. Rejoin answered *Your pilot is already visiting another world, bring it home first* —
//     which is the button refusing to do the one thing it is named after.
//  3. A refresh did not help, because the refusal is not a connection problem: nothing was
//     ever consulted but the shape of a save.
//
// The cause is a single confusion of two different records. `saveKit.read()` returns a MODE
// save — `{ profile, world, away }`, one pilot — while `bringPilotHomeAtMenu` was written
// against the dual-mode ENVELOPE `{ v, mode, open, campaign }` and indexed `root[mode]`.
// On a mode save that is `undefined`, so the function refused before it ever looked at the
// suitcase. These tests hold the seam to its real shape, and prove the card can always be
// left — which is the property the player actually cares about.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as session from "../src/net/session.js";
import { SAVE_VERSION, newProfile, newWorld, sanitizeSave } from "../src/state/profile.js";
import { checkOut } from "../src/net/custody.js";
import { state, applySave } from "../src/state/state.js";
import { readSettings, writeSettings } from "../src/net/settings.js";

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const STATION = "reach:meridian";

/** A pilot with a hull, a hold and a station locker — so coming home has work to do. */
function pilotSave({ cr = 800, ferrite = 10 } = {}) {
  const save = { v: SAVE_VERSION, profile: newProfile(), world: newWorld(), away: null };
  save.profile.cr = cr;
  save.profile.homeStation = STATION;
  save.profile.holds[save.profile.ship] = { ferrite };
  save.world.stationStores[STATION] = { ferrite: 5 };
  return sanitizeSave(save);
}

/** The guest's real seam: `read` gives a MODE save, `install` replaces the whole pilot. */
function seam(start) {
  let live = start;
  return {
    read: () => live,
    write: next => {
      if (next?.world?.guests) live.world.guests = next.world.guests;
      if (typeof next?.world?.worldId === "string") live.world.worldId = next.world.worldId;
    },
    install: next => { live = JSON.parse(JSON.stringify(next)); },
    get live() { return live; },
  };
}

/** Put a pilot on the away card exactly as slice 4 does: packed (`checkOut`) and installed. */
function packAway(kit, { worldId = "w-1", hostName = "Ada", guestId = "guest-abcd1234" } = {}) {
  const { save: packed } = checkOut(kit.live, {
    worldId, hostName, guestId, name: "Bo", token: "secret-token",
  });
  kit.install(packed);
  state.away = packed.away;
  state.profile = packed.profile;
  state.worldState = packed.world;
  return packed;
}

/**
 * The game's own seam reads through `currentRootSave()`, and `bringPilotHomeAtMenu` writes
 * through `saveKit`. Both are module singletons, so each test puts them back.
 */
function useKit(kit) {
  session.setSaveKit({ read: kit.read, write: kit.write, install: kit.install });
}

test("playtest 15: Bring pilot home works at the title, from a MODE save", () => {
  applySave({ v: SAVE_VERSION, mode: "open", open: sanitizeSave(newProfile() && { v: SAVE_VERSION, profile: newProfile(), world: newWorld() }), campaign: { v: SAVE_VERSION, profile: newProfile(), world: newWorld() } });
  const kit = seam(pilotSave());
  useKit(kit);
  packAway(kit);
  assert.equal(state.away?.worldId, "w-1", "the pilot is on the card to begin with");

  const done = session.bringPilotHomeAtMenu({ mode: "open" });

  assert.equal(done.ok, true, `the card must be leavable; it said: ${done.message}`);
  assert.match(done.message, /back from Ada's world/);
  // ...and it is a real homecoming, not just a message: the marker is gone, and the cargo
  // the suitcase carried is back in the station it belongs to.
  assert.equal(state.away, null, "the marker the card reads is cleared");
  assert.equal(kit.live.away, null, "and the STORED save says the pilot is home");
  assert.equal(kit.live.world.stationStores[STATION].ferrite, 5, "its locker came home with it");
});

test("playtest 15: the same call still understands a dual-mode envelope", () => {
  // The seam is injectable, so a caller may hand over a whole root save. Guessing wrong in
  // EITHER direction traps a pilot, so both shapes work and the answer keeps its shape.
  const open = pilotSave();
  const campaign = { v: SAVE_VERSION, profile: newProfile(), world: newWorld(), away: null };
  const root = { v: SAVE_VERSION, mode: "open", open, campaign };
  const kit = {
    read: () => root,
    write: () => {},
    install: () => {},
  };
  session.setSaveKit({ read: kit.read, write: kit.write, install: kit.install });
  const { save: packed } = checkOut(open, { worldId: "w-1", hostName: "Ada", guestId: "guest-abcd1234", name: "Bo", token: "t" });
  root.open = packed;
  state.away = packed.away;

  const done = session.bringPilotHomeAtMenu({ mode: "open" });

  assert.equal(done.ok, true, `an envelope must work too; it said: ${done.message}`);
  assert.equal(done.save.open.away, null, "the OPEN half is the one that came home");
  assert.equal(done.save.campaign.profile.cr, campaign.profile.cr, "the campaign pilot is untouched");
});

test("playtest 15: a pilot whose save is genuinely unreadable still refuses — safely", () => {
  // The refusal sentence is not banned, it was MISUSED: a pilot with no marker is home, and
  // must never be told its save is broken.
  const kit = seam(pilotSave());
  session.setSaveKit({ read: () => null, write: kit.write, install: kit.install });
  const done = session.bringPilotHomeAtMenu({ mode: "open" });
  assert.equal(done.ok, false, "no save at all is still a refusal, not a wipe");
  assert.match(done.message, /could not be read/);
});

test("playtest 15: Rejoin is allowed back into the world the pilot is visiting", () => {
  // The card's Rejoin rebuilds the link from the marker and calls `joinWorld`. That call was
  // refused by the away guard with "bring it home first" — the button contradicting itself.
  const net = read("src/net/session.js");
  assert.match(net, /awayNow && awayNow\.worldId !== found\.worldId/,
    "the away guard only refuses a DIFFERENT world, so a rejoin is not a second trip");
  assert.doesNotMatch(net, /if \(isAway\(liveSave\(\)\)\) return \{ ok: false, message: "Your pilot is already visiting another world/,
    "and the blanket refusal is gone from the join path");
  // The paste-code door had the same blanket refusal and is the fallback when a link fails.
  assert.match(net, /awayNow && invited && awayNow\.worldId !== invited/,
    "the code path makes the same exception");
});

test("playtest 15: coming home from the title also reaches the STORED save", () => {
  // `write` is the host's narrow seam (guest list + world id) and cannot carry a returned
  // pilot. Without `install`, the card would clear, the screen would say "home", and the
  // pilot on disk would still be frozen — the player would be back on the card after a
  // refresh. This is L34's trap in a second place.
  const net = read("src/net/session.js");
  const at = net.indexOf("export function bringPilotHomeAtMenu");
  const body = net.slice(at, at + 2600);
  assert.match(body, /saveKit\.install\(next\)/, "the returned pilot is installed, not merely written");
  assert.match(body, /state\.away = null/, "and the card's marker is cleared");
});

test("playtest 15: the away card is never a dead end", () => {
  // The player's own words: "refreshing both browsers makes the laptop stuck in this menu."
  // Whatever else breaks, there must be a path off the card that does not need the host.
  const menu = read("src/ui/menu.js");
  // Playtest 17 corrected this: routing the card's button through Open World's action made it
  // answer with Open World's refusal. It has its own body now.
  assert.doesNotMatch(menu, /comehome\(\) \{\s*ACTIONS\.intro\(\);/, "Bring pilot home is NOT Open World's action");
  assert.match(menu, /comehome\(\) \{\s*const done = bringPilotHomeAtMenu/, "it unpacks the suitcase itself");
  // Playtest 18 changed what Open World does with an away pilot: it raises the card instead of
  // flying a frozen pilot. Playtest 20 made that unconditional — the card is the press's whole
  // answer — and removed the "is the copy newer?" question entirely: coming home always takes the
  // copy the friend's world holds.
  assert.match(menu, /if \(state\.away\) \{\s*state\.ui\.awayCard = true;/,
    "Open World raises the card whenever the pilot is away");
  assert.doesNotMatch(menu, /newerCopyAway|awayNewer/, "with nothing compared first");
  assert.match(menu, /state\.ui\.awayCard = true;/, "the card is raised by that press alone");
  const net = read("src/net/session.js");
  // Coming home needs no wire: the suitcase is the guest's own copy.
  assert.match(net, /const suitcase = away\.suitcase \|\| readAwayCopy\(away\.worldId\)/);
});

/**
 * The in-memory wire again, but with the guest side handed to the caller so a channel that
 * `joinWorld` creates for itself can be wired to the host that is already listening.
 */
function wireFactoryFor(made, hostOf, onGuest) {
  return ({ role, worldId, onState, onData, onPeer }) => {
    const ch = {
      role, worldId, peerId: null, outbound: [],
      join: async () => { onState?.({ state: "finding", reason: "" }); return ch; },
      send: (peer, value) => { ch.outbound.push({ peer, value }); ch.deliver?.(peer, value); return true; },
      broadcast: value => (ch.peerId ? (ch.send(ch.peerId, value), 1) : 0),
      peers: () => (ch.peerId ? [ch.peerId] : []),
      state: () => ({ state: ch.peerId ? "connected" : "finding", reason: "" }),
      room: () => worldId,
      leave: () => { ch.left = true; },
      restart: async () => ch,
      checkRelays: async () => ({ host: 1, srflx: 1, prflx: 0, relay: 0 }),
      reach: (message, peerId = "peer-1") => onData?.({ ...message, peerId }),
      connect(peerId = "peer-1") { ch.peerId = peerId; onPeer?.({ kind: "join", peerId }); },
    };
    made.push(ch);
    if (role === "guest") {
      onGuest(ch);
      const host = hostOf();
      if (host) {
        ch.deliver = (peer, value) => host.reach?.(value, peer);
        host.deliver = (peer, value) => ch.reach?.(value, peer);
        setTimeout(() => { host.connect("guest-peer"); ch.connect("host-peer"); }, 0);
      }
    }
    return ch;
  };
}

test("playtest 15: a real rejoin connects, with the pilot still away", async () => {
  // The card's Rejoin, driven for real: the pilot is already visiting a world, the wire is
  // gone, and it joins that SAME world again. Before the fix `joinWorld` refused it with
  // "bring it home first" — the button could never do what its name says.
  // A username, because `joinWorld` refuses without one and that would hide the guard.
  const mem = new Map();
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: k => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: k => { mem.delete(k); },
  };
  writeSettings({ name: "Bo" });
  const made = [];
  session.setChannelFactory(({ role, worldId, onState, onData, onPeer }) => {
    const ch = {
      role, worldId, peerId: null, outbound: [],
      join: async () => { onState?.({ state: "finding", reason: "" }); return ch; },
      send: (peer, value) => { ch.outbound.push({ peer, value }); ch.deliver?.(peer, value); return true; },
      broadcast: value => (ch.peerId ? (ch.send(ch.peerId, value), 1) : 0),
      peers: () => (ch.peerId ? [ch.peerId] : []),
      state: () => ({ state: ch.peerId ? "connected" : "finding", reason: "" }),
      room: () => worldId,
      leave: () => { ch.left = true; },
      // A real channel can make a new transport for the same room; the join path asks for
      // one when the previous link has gone (`helloRetrySec`).
      restart: async () => ch,
      checkRelays: async () => ({ host: 1, srflx: 1, prflx: 0, relay: 0 }),
      reach: (message, peerId = "peer-1") => onData?.({ ...message, peerId }),
      connect(peerId = "peer-1") { ch.peerId = peerId; onPeer?.({ kind: "join", peerId }); },
    };
    made.push(ch);
    return ch;
  });

  const hostKit = seam(pilotSave({ cr: 40, ferrite: 0 }));
  const guestKit = seam(pilotSave());
  // `setSaveKit` keeps whatever it is not given, so every test states its own read: the
  // previous test proved the unreadable-save refusal with a null one.
  useKit(guestKit);
  packAway(guestKit, { worldId: "w-1" });
  assert.equal(session.liveSave()?.away?.worldId, "w-1", "the seam really reports the pilot away");

  const host = session.createChannelForTest("host", "w-1", "Ada", "host-token", hostKit);
  await host.start();
  const hostCh = made.at(-1);
  // `joinWorld` makes the guest's channel itself, so the pair is wired as it appears — that
  // is what makes this a real rejoin and not a mock of one.
  let guestCh = null;
  session.setChannelFactory(wireFactoryFor(made, () => hostCh, ch => { guestCh = ch; }));
  hostCh.deliver = (peer, value) => guestCh?.reach?.(value, peer);

  const other = await session.joinWorld({ link: "?join=w-different#some-token" });
  assert.equal(other.ok, false, "a DIFFERENT world is still refused while the pilot is away");
  assert.match(other.message, /already visiting another world/);

  // ...and the world it is standing in is accepted, which is the whole point of Rejoin.
  assert.equal(state.away?.worldId, "w-1", "still away, i.e. this really is a rejoin");
  const same = await session.joinWorld({ link: "?join=w-1#secret-token" });
  assert.equal(same.ok, true, `Rejoin must be allowed; it said: ${same.message || "(no message)"}`);
  session.stop();
  globalThis.localStorage = previous;
});
