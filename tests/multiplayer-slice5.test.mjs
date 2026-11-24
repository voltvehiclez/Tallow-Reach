// Step 16 slice 5, end to end: crashes, reconnects, and the newest copy of a pilot.
//
// The plan's own list for this slice, one test each:
//
//   * `compare` decides when two copies disagree — never the arrival order;
//   * a host loading an OLDER save loses to a newer suitcase, and a stale one does not roll
//     a world backwards;
//   * "Your pilot is safe" with **Wait** and **Go home** when the host drops;
//   * a final copy on tab close (`bye`), so a closed tab is not a lost visit;
//   * one session per `guestId`: a newer connection kicks the older.
//
// Two sessions on an in-memory wire, exactly like `multiplayer-bring-pilot`: the real
// handshake, the real protocol, the real save seams. What it cannot prove is that a browser
// draws the card — that is the owner's playtest (testing/TESTING-16-SLICE5.md).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as session from "../src/net/session.js";
import { SAVE_VERSION, newProfile, newWorld, sanitizeSave } from "../src/state/profile.js";
import { checkOut, compare } from "../src/net/custody.js";
import { on } from "../src/util/events.js";
import { NET } from "../src/data/multiplayer.js";

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const STATION = "reach:meridian";

/** A pilot with something to lose. */
function pilotSave({ cr = 800, ferrite = 10 } = {}) {
  const save = { v: SAVE_VERSION, profile: newProfile(), world: newWorld(), away: null };
  save.profile.cr = cr;
  save.profile.holds[save.profile.ship] = { ferrite };
  save.world.stationStores[STATION] = { ferrite: 5 };
  return sanitizeSave(save);
}

/**
 * The in-memory wire, with the two events a *crash* needs: a peer that goes (`drop`) and a
 * peer that comes back (`connect` again).
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
      join: async () => { onState?.({ state: "finding", reason: "" }); return channel; },
      send: (peerId, value) => {
        channel.outbound.push({ peerId, value });
        channel.deliver?.(peerId, value);
        return true;
      },
      broadcast: value => (channel.peerId ? (channel.send(channel.peerId, value), 1) : 0),
      peers: () => (channel.peerId ? [channel.peerId] : []),
      state: () => ({ state: channel.peerId ? "connected" : "finding", reason: "" }),
      room: () => worldId,
      leave: () => { channel.left = true; },
      restart: async () => channel,
      checkRelays: async () => ({ host: 1, srflx: 1, prflx: 0, relay: 0 }),
      reach: (message, peerId = "peer-1") => { channel.inbound.push(message); onData?.({ ...message, peerId }); },
      connect(peerId = "peer-1") { channel.peerId = peerId; onPeer?.({ kind: "join", peerId }); },
      /** The other browser is gone: the channel reports the peer leaving and forgets it. */
      drop(peerId = channel.peerId) { channel.peerId = null; onPeer?.({ kind: "leave", peerId }); },
    };
    made.push(channel);
    return channel;
  };
  return { factory, made };
}

/** A host and a guest, wired together. Both seams are faithful to the game's own. */
async function pair({ hostName = "Ada", guestName = "Bo" } = {}) {
  const wire = makeWire();
  session.setChannelFactory(wire.factory);
  const hostSave = pilotSave({ cr: 40, ferrite: 0 });
  const guestSave = pilotSave({ cr: 800, ferrite: 10 });
  const hostKit = { read: () => hostSave, write: next => Object.assign(hostSave, next), install: next => Object.assign(hostSave, next) };
  const guestKit = {
    read: () => guestSave,
    // The game's own narrow seam: a host may only touch the guest list and the world id.
    write: next => {
      if (next.world?.guests) guestSave.world.guests = next.world.guests;
      if (typeof next.world?.worldId === "string") guestSave.world.worldId = next.world.worldId;
    },
    install: next => Object.assign(guestSave, JSON.parse(JSON.stringify(next))),
  };

  const host = session.createChannelForTest("host", "w-1", hostName, "host-token", hostKit);
  await host.start();
  const hostChannel = wire.made.at(-1);
  const guest = session.createChannelForTest("guest", "w-1", guestName, "guest-token", guestKit);
  await guest.start();
  const guestChannel = wire.made.at(-1);

  hostChannel.deliver = (peerId, value) => guestChannel.reach(value, peerId);
  guestChannel.deliver = (peerId, value) => hostChannel.reach(value, peerId);
  hostChannel.connect("guest-peer");
  guestChannel.connect("host-peer");
  session.focusForTest(guest);
  await new Promise(resolve => setTimeout(resolve, 0));
  return { wire, host, guest, hostChannel, guestChannel, hostSave, guestSave, hostKit, guestKit };
}

const carries = channel => channel.outbound.filter(m => m.value.t === "carry");
const suitcases = channel => channel.outbound.filter(m => m.value.t === "suitcase");

/* ------------------------------------------------------------------------- */
/* The host goes away                                                        */
/* ------------------------------------------------------------------------- */

test("slice 5: the host going away does not throw the pilot away", async () => {
  const { guest, guestSave, guestChannel, hostChannel } = await pair();
  session.bringPilot();
  assert.ok(guestSave.away?.suitcase, "the pilot is visiting, with its own copy of itself");

  const lost = [];
  on("mp-host-left", payload => lost.push(payload));

  // The host's browser disappears: the channel reports the peer gone.
  guestChannel.drop("host-peer");
  await new Promise(resolve => setTimeout(resolve, 0));

  const snap = guest.snapshot();
  assert.equal(snap.on, true, "the session stays up — it is the only thing still looking");
  assert.equal(snap.hostLost, true, "and says what happened");
  assert.match(snap.lostReason, /host|closed|went away/i, "in a sentence a screen can show");
  assert.equal(lost.length, 1, "the title raises the card once, not once per repeated event");
  assert.equal(lost[0].hostName, "Ada", "and the card can name the world it was in");
  // Nothing about the save moved: the marker, the suitcase and the frozen home half stay.
  assert.equal(guestSave.away.worldId, "w-1");
  assert.ok(guestSave.away.suitcase?.profile, "the copy it comes home from is still there");

  // Coming home still needs nobody: the suitcase is the guest's own copy.
  const home = session.bringPilotHome(guestSave);
  assert.equal(home.ok, true, home.message);
  assert.equal(home.save.profile.cr, 800, "the pilot comes home with its credits");
});

test("slice 5: Wait keeps looking, and a host that comes back is met again", async () => {
  const { host, guest, guestSave, guestChannel, hostChannel, hostSave } = await pair();
  session.bringPilot();
  assert.ok(Object.keys(hostSave.world.guests || {}).length, "the host holds the pilot");

  const back = [];
  on("mp-host-back", payload => back.push(payload));

  // The host's browser goes, on both sides of the wire (a dead browser does not run code).
  // This wire knows a peer by the id the other side addressed, so both ends call it
  // `host-peer`; a real channel names the remote browser and agrees with itself.
  guestChannel.drop("host-peer");
  hostChannel.drop("host-peer");
  assert.equal(guest.snapshot().hostLost, true, "the guest knows the host is gone");
  assert.equal(host.snapshot().guests.length, 0, "and the host's list is empty");
  assert.equal(hostSave.world.guests[Object.keys(hostSave.world.guests)[0]].left, true,
    "the record is marked left, holding the suitcase rather than an identity");

  // The host opens the same world again (its worldId never changes), so the room is the same
  // and the guest meets it without anybody retyping a link.
  hostChannel.connect("guest-peer-2");
  guestChannel.connect("host-peer-2");
  await new Promise(resolve => setTimeout(resolve, 10));

  const snap = guest.snapshot();
  assert.equal(snap.hostLost, false, "the loss is over");
  assert.equal(snap.hostName, "Ada", "with the same host");
  assert.equal(back.length >= 1, true, "and the screen is told the world is back");
  assert.equal(host.snapshot().guests.length, 1, "the host has the pilot listed again");
  const resent = carries(guestChannel).length;
  assert.ok(resent >= 2, "the guest's copy went back over the wire to catch the host up");
  const record = Object.values(hostSave.world.guests)[0];
  assert.equal(record.left, false, "the record is no longer holding a suitcase");
  assert.equal(record.bundle.profile.cr, 800, "and the pilot is the one the guest carries");
});

/* ------------------------------------------------------------------------- */
/* Two copies disagree                                                       */
/* ------------------------------------------------------------------------- */

/** A carry exactly as the guest's session writes one. */
const carryFrom = (bundle, { guestId, name = "Bo", epoch = 0, rev = 0 } = {}) => ({
  t: "carry", guestId, name, epoch, rev, bundle,
});

test("slice 5: the host's older save loses to a newer suitcase", async () => {
  const { host, hostChannel, hostSave, guestSave } = await pair();
  session.bringPilot();
  const guestId = guestSave.away.guestId;
  const bundle = guestSave.away.suitcase;

  // The host restores a backup from before the visit: its record is an old one (rev 1) that
  // says the pilot had 10 credits. The guest's copy is rev 9 and holds 900.
  hostSave.world.guests[guestId] = {
    ...hostSave.world.guests[guestId],
    rev: 1,
    bundle: { ...bundle, profile: { ...bundle.profile, cr: 10 } },
  };
  // A carry carries the guest's secret, which the host checks when it already has a record.
  const newer = { ...bundle, token: "guest-token", profile: { ...bundle.profile, cr: 900 } };

  hostChannel.outbound.length = 0;
  hostChannel.reach(carryFrom(newer, { guestId, rev: 9 }), "host-peer");
  await new Promise(resolve => setTimeout(resolve, 0));

  const record = hostSave.world.guests[guestId];
  assert.equal(record.rev, 9, "the guest's newer copy becomes the world's record");
  assert.equal(record.bundle.profile.cr, 900, "with its contents");
  assert.equal(suitcases(hostChannel).at(-1)?.value.rev, 9, "and the guest is told that is the copy");
  assert.ok(compare(record, { epoch: 0, rev: 1 }) < 0, "which is what `compare` says too");
});

test("slice 5: a stale suitcase does not roll the host's world backwards", async () => {
  const { hostChannel, hostSave, guestSave } = await pair();
  session.bringPilot();
  const guestId = guestSave.away.guestId;
  const bundle = guestSave.away.suitcase;

  // The host's record is the newest (rev 12, 1200 credits); a copy from earlier arrives late.
  hostSave.world.guests[guestId] = {
    ...hostSave.world.guests[guestId],
    rev: 12,
    bundle: { ...bundle, profile: { ...bundle.profile, cr: 1200 } },
  };
  const stale = { ...bundle, token: "guest-token", profile: { ...bundle.profile, cr: 5 } };

  hostChannel.outbound.length = 0;
  hostChannel.reach(carryFrom(stale, { guestId, rev: 3 }), "host-peer");
  await new Promise(resolve => setTimeout(resolve, 0));

  const record = hostSave.world.guests[guestId];
  assert.equal(record.rev, 12, "the record stands");
  assert.equal(record.bundle.profile.cr, 1200, "and the pilot with it");
  const back = suitcases(hostChannel).at(-1);
  assert.equal(back?.value.rev, 12, "the guest is sent the newer copy back, not ignored");
  assert.equal(back?.value.bundle.profile.cr, 1200, "with its contents");
  assert.equal(record.left === true, false, "and it is still a live record");
});

test("slice 5: a pilot that came home and came back wins with its own save", async () => {
  // The case the ordering pair cannot express: the record left behind by a visit that ended.
  // The pilot has been home since (it may have bought a whole new fit there), so its copy is
  // the newest truth about it even though the numbers say otherwise.
  const { hostChannel, hostSave, guestSave } = await pair();
  session.bringPilot();
  const guestId = guestSave.away.guestId;
  const bundle = guestSave.away.suitcase;

  hostSave.world.guests[guestId] = {
    ...hostSave.world.guests[guestId],
    rev: 40,
    left: true,
    bundle: { ...bundle, profile: { ...bundle.profile, cr: 1 } },
  };
  const returned = { ...bundle, token: "guest-token", profile: { ...bundle.profile, cr: 2500 } };

  hostChannel.reach(carryFrom(returned, { guestId, rev: 0 }), "host-peer");
  await new Promise(resolve => setTimeout(resolve, 0));

  const record = hostSave.world.guests[guestId];
  assert.equal(record.bundle.profile.cr, 2500, "the returning pilot's copy is the one this world keeps");
  assert.equal(record.left, false, "and the record stops claiming it is holding a suitcase");
});

/* ------------------------------------------------------------------------- */
/* The newest copy is written back                                           */
/* ------------------------------------------------------------------------- */

test("slice 5: the host writes what a visiting pilot became, not only what it arrived with", async () => {
  // The gap this closes: `writeBack` existed from slice 4 and nothing ever called it, so the
  // copy a guest comes home from was the copy it arrived with. Everything it earned, mined
  // and fitted in the friend's world was silently lost on the way home.
  const { host, hostChannel, hostSave, guestSave } = await pair();
  session.bringPilot();
  const guestId = guestSave.away.guestId;
  const arrived = hostSave.world.guests[guestId].bundle.profile.cr;

  // `sim/` answers "what does this pilot look like NOW?" on the bus (main.js does this for
  // real). The visitor earned 3,000 credits in the host's world.
  on("mp-guest-bundle-request", request => {
    request.profile = { ...guestSave.away.suitcase.profile, cr: 3800 };
    request.lockers = [];
    request.answered = true;
  });

  assert.equal(host.syncGuests(), 1, "the change is noticed on the next check");
  // The raise is deliberately late (`NET.snapshotSec`), so the message waits for the burst.
  await new Promise(resolve => setTimeout(resolve, NET.snapshotSec * 1000 + 150));

  const record = hostSave.world.guests[guestId];
  assert.equal(record.rev >= 1, true, "the copy's `rev` was raised");
  assert.equal(record.bundle.profile.cr, 3800, "and it holds what the pilot became");
  const sent = suitcases(hostChannel).at(-1);
  assert.equal(sent?.value.bundle.profile.cr, 3800, "which went to the guest");
  assert.equal(sent?.value.bundle.profile.cr === arrived, false, "not the copy it arrived with");

  // Nothing changed the second time, so nothing moves.
  const rev = hostSave.world.guests[guestId].rev;
  host.syncGuests();
  await new Promise(resolve => setTimeout(resolve, NET.snapshotSec * 1000 + 150));
  assert.equal(hostSave.world.guests[guestId].rev, rev, "an unchanged pilot is not re-saved every two seconds");
});

/* ------------------------------------------------------------------------- */
/* Leaving on purpose                                                        */
/* ------------------------------------------------------------------------- */

test("slice 5: a bye takes a final copy, then takes the pilot out at once", async () => {
  const { guest, hostChannel, hostSave, guestSave } = await pair();
  session.bringPilot();
  const guestId = guestSave.away.guestId;
  const left = [];
  on("mp-guest-left", payload => left.push(payload));

  const before = suitcases(hostChannel).length;
  guest.stop();                       // a tab closing, "Go home", or "Leave"
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(guest.snapshot().on, false, "the closing tab's session is over");
  assert.equal(left.length >= 1, true, "the host's world is told the ship has gone");
  assert.equal(suitcases(hostChannel).length > before, true, "and the final copy was written back first");
  const record = hostSave.world.guests[guestId];
  assert.equal(record.left, true, "the record holds the suitcase, not an identity");
  assert.equal(record.bundle.profile.cr >= 800, true, "and the suitcase is whole");
});

/* ------------------------------------------------------------------------- */
/* One session per guest id                                                  */
/* ------------------------------------------------------------------------- */

test("slice 5: a newer connection takes the pilot over, and the older one is told", async () => {
  const { wire, host, hostChannel, hostSave, guestSave, guestChannel } = await pair();
  session.bringPilot();
  const guestId = guestSave.away.guestId;
  const notices = [];
  on("mp-notice", text => notices.push(text));

  // A second window joins the same link: same token, so the same guest id.
  const second = session.createChannelForTest("guest", "w-1", "Bo", "guest-token", {
    read: () => guestSave,
    write: next => { if (next.world?.guests) guestSave.world.guests = next.world.guests; },
    install: next => Object.assign(guestSave, JSON.parse(JSON.stringify(next))),
  });
  await second.start();
  const secondChannel = wire.made.at(-1);
  hostChannel.outbound.length = 0;

  // The new window says hello, from its own peer.
  hostChannel.reach(
    { t: "hello", v: SAVE_VERSION, worldId: "w-1", guestId, name: "Bo", token: "guest-token" },
    "guest-peer-2",
  );
  await new Promise(resolve => setTimeout(resolve, 0));

  const told = hostChannel.outbound.find(m => m.value.t === "refuse" && m.value.reason === "replaced");
  assert.ok(told, "the older connection is refused in words");
  // The host knows the older guest by the id it addressed (`host-peer` in this wire); the new
  // window said hello as `guest-peer-2`, so the refusal must not be aimed there.
  assert.equal(told.peerId, "host-peer", "and the words go to the older window, not the newer one");
  assert.match(told.value.message, /another window/i, "the sentence says what happened");
  // The older guest session stops — the newer one has the pilot — and says so.
  assert.equal(guestChannel.left, true, "the older window's wire is closed");
  assert.ok(notices.some(text => /another window/i.test(text)), `the player is told: ${notices.join(" | ")}`);
  // **The pilot did not go anywhere**: one row, and the record is not marked left.
  assert.equal(host.snapshot().guests.length, 1, "one row for one pilot");
  assert.equal(hostSave.world.guests[guestId].left === true, false, "and the record is not a departure");
  assert.equal(second.snapshot().on, true, "the newer window is still connected");
  second.stop();
});

/* ------------------------------------------------------------------------- */
/* What the screens are told                                                 */
/* ------------------------------------------------------------------------- */

test("slice 5: the card says the pilot is safe, and both ways off it are real", () => {
  const screens = read("src/ui/screens.js");
  const card = screens.slice(screens.indexOf("function lostCardHtml"));
  const body = card.slice(0, card.indexOf("\n}\n") + 3);

  assert.match(body, /Your pilot is safe/, "the first thing it says is the true one");
  // Two buttons, both the card's own kind (the away card's lesson: one odd button reads as a bug).
  const buttons = body.match(/<button[^>]*>[^<]*<\/button>/g) || [];
  assert.equal(buttons.length, 2, "Wait and Go home");
  assert.match(body, /data-a="waitForHost">Wait</, "Wait makes no decision about the save");
  assert.match(body, /data-a="comehome">Go home</, "and Go home is the one rule for coming home");
  for (const tag of body.match(/<button[^>]*>/g) || []) assert.match(tag, /class="go"/, `${tag} is a full-width button`);
  assert.match(body, /away-build">Build \$\{esc\(BUILD\)\}/, "and it names its build, like the away card");

  // It is drawn only while the pilot really is away, so coming home cannot leave it on screen.
  assert.match(screens, /if \(state\.away && state\.ui\?\.lostCard\) return/,
    "the card is drawn from the connection's news, and only for a pilot that is away");

  // Wait leaves the save and the visit alone.
  const menu = read("src/ui/menu.js");
  const act = menu.slice(menu.indexOf("  waitForHost() {"));
  const waiting = act.slice(0, act.indexOf("\n  },") + 4);
  assert.doesNotMatch(waiting, /bringPilotHome|leaveVisit|api\.stop/, "Wait is not a decision about the save");
  assert.match(waiting, /state\.ui\.lostCard = null;/, "it only closes the card");

  // ...and the session is kept only for the state the card exists for.
  const ui = read("src/ui/multiplayer.js");
  assert.match(ui, /snap\.role === "guest" && snap\.hostLost === true/,
    "a guest whose host vanished is not stopped on the way to the menu");
  const handler = ui.slice(ui.indexOf('on("mp-host-left"'));
  const handlerBody = handler.slice(0, handler.indexOf("\n  });") + 6);
  assert.match(handlerBody, /state\.ui\.lostCard = \{ hostName: host, reason: said \}/,
    "the card is raised by the connection, with the host's name");
  // ...and only for a pilot that is actually over there: a guest that went to look around has
  // nothing at stake, so it gets a sentence and its session stops.
  assert.match(handlerBody, /if \(!state\.away\) \{[\s\S]{0,300}api\.stop\(\)/,
    "no pilot in that world, no card — and nothing left looking");

  // The event the card waits for is documented and emitted.
  const events = read("src/util/events.js");
  assert.match(events, /mp-host-back  \{ name \}/, "the return is an event too");
  const net = read("src/net/session.js");
  const lost = net.slice(net.indexOf("function markHostLost("));
  const lostBody = lost.slice(0, lost.indexOf("\n  }\n") + 4);
  assert.doesNotMatch(lostBody, /stop\(/, "losing the host does not stop the session");
  assert.match(lostBody, /emit\("mp-host-left"/, "it says so instead");
});
