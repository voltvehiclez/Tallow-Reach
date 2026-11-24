// Step 16 slice 5, end to end: crashes, reconnects, and the newest copy of a pilot.
//
// The plan's own list for this slice, one test each:
//
//   * `compare` decides when two copies disagree — never the arrival order;
//   * a host loading an OLDER save loses to a newer suitcase, and a stale one does not roll
//     a world backwards;
//   * **a lost host is a lost room**: the player is returned to the main menu with "Lost
//     connection to host", and rejoining keeps the version the server already has;
//   * a final copy on tab close (`bye`), so a closed tab is not a lost visit;
//   * one session per `guestId`: a newer connection kicks the older.
//
// Two sessions on an in-memory wire, exactly like `multiplayer-bring-pilot`: the real
// handshake, the real protocol, the real save seams. What it cannot prove is that a browser
// draws the prompt — that is the owner's playtest (testing/TESTING-16-SLICE5.md).

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
  assert.equal(snap.on, true, "the session states the loss; the screen decides what it means");
  assert.equal(snap.hostLost, true, "it says what happened");
  assert.match(snap.lostReason, /host|closed|went away/i, "in a sentence a screen can show");
  assert.equal(lost.length, 1, "the prompt is raised once, not once per repeated event");
  assert.equal(lost[0].hostName, "Ada", "and it can name the world it was in");
  // Nothing about the save moved: the marker, the suitcase and the frozen home half stay.
  assert.equal(guestSave.away.worldId, "w-1");
  assert.ok(guestSave.away.suitcase?.profile, "the copy it comes home from is still there");

  // Coming home still needs nobody: the suitcase is the guest's own copy.
  const home = session.bringPilotHome(guestSave);
  assert.equal(home.ok, true, home.message);
  assert.equal(home.save.profile.cr, 800, "the pilot comes home with its credits");
});

test("slice 5: a host that stops answering is a lost host, without waiting for the wire", async () => {
  // The owner's case (2026-11-24): *"the guest loses connection to the host mid game"*. A
  // crashed browser sends no `leave`, and a channel can take a minute to admit a peer is
  // gone, so the guest keeps its own clock: `ping` goes out every `NET.heartbeatSec` and the
  // host answers, so silence for `NET.lastSeenSec` is a fair sign it is gone.
  const { guest } = await pair();
  session.bringPilot();
  const lost = [];
  on("mp-host-left", payload => lost.push(payload));

  const now = Date.now();
  assert.equal(guest.checkHostAlive(now), false, "a host heard from a moment ago is here");
  assert.equal(
    guest.checkHostAlive(now + (NET.lastSeenSec - 1) * 1000),
    false,
    "and a few seconds of quiet is a slow relay, not a disaster",
  );
  assert.equal(
    guest.checkHostAlive(now + (NET.lastSeenSec + 5) * 1000),
    true,
    "silence for the whole window is a lost host",
  );
  assert.equal(guest.snapshot().hostLost, true, "and the session says so");
  assert.match(guest.snapshot().lostReason, /answering/i, "in words the prompt can show");
  assert.equal(lost.length, 1, "once, like every other loss");
  // A session that has been stopped cannot report a loss afterwards.
  session.stop({ quiet: true });
  assert.equal(guest.checkHostAlive(now + 999_999), false, "a stopped session is not watching");
});

test("slice 5: rejoining after a loss keeps the version the server already has", async () => {
  // The owner's other half (2026-11-24): *"when reconnecting to the server after a disconnect
  // your pilot's last version is already on the server."* So a rejoin must not upload the copy
  // the guest happens to be holding over a newer one the host wrote back — the guest catches
  // up, it does not overwrite. This is the case `compare` is for, and the one that would be
  // lost if "a record marked `left` hands over its own save" were applied to a dropped
  // connection instead of to a pilot that has actually been home.
  const { wire, host, guest, hostChannel, guestChannel, hostSave, guestSave } = await pair();
  session.bringPilot();
  const guestId = guestSave.away.guestId;
  const bundle = guestSave.away.suitcase;

  // The host wrote the pilot back twice; the last copy (rev 5, 1500 cr) had not reached the
  // guest when the connection died, so the guest's suitcase is still rev 3 / 900 cr.
  hostSave.world.guests[guestId] = {
    ...hostSave.world.guests[guestId],
    rev: 5,
    bundle: { ...bundle, token: "", profile: { ...bundle.profile, cr: 1500 } },
  };
  guestSave.away = {
    ...guestSave.away,
    rev: 3,
    suitcase: { ...bundle, rev: 3, profile: { ...bundle.profile, cr: 900 } },
  };

  // This wire knows a peer by the id the other side addressed, so both ends call it
  // `host-peer`; the host's row for the guest is filed under the id the guest used for it.
  guestChannel.drop("host-peer");
  hostChannel.drop("host-peer");
  assert.equal(guest.snapshot().hostLost, true, "the connection is gone");
  assert.equal(hostSave.world.guests[guestId].left, true, "so the host holds the pilot, not the pilot");
  session.stop({ quiet: true });
  assert.equal(guest.snapshot().on, false, "and the session is over: the room with it");

  // The player joins again from the main menu, with the same link: a new session, same pilot.
  hostChannel.outbound.length = 0;
  const again = session.createChannelForTest("guest", "w-1", "Bo", "guest-token", {
    read: () => guestSave,
    write: next => { if (next.world?.guests) guestSave.world.guests = next.world.guests; },
    install: next => Object.assign(guestSave, JSON.parse(JSON.stringify(next))),
  });
  await again.start();
  const againChannel = wire.made.at(-1);
  againChannel.deliver = (peerId, value) => hostChannel.reach(value, peerId);
  hostChannel.deliver = (peerId, value) => againChannel.reach(value, peerId);
  againChannel.connect("guest-peer-2");
  hostChannel.connect("guest-peer-2");
  await new Promise(resolve => setTimeout(resolve, 20));

  const record = hostSave.world.guests[guestId];
  assert.equal(record.left, false, "the pilot is here again");
  assert.equal(record.rev, 5, "with the version the server already had");
  assert.equal(record.bundle.profile.cr, 1500, "not the older copy the guest carried");
  // ...and the guest is handed the newer copy back, so the two agree again.
  const back = suitcases(hostChannel).at(-1);
  assert.equal(back?.value.rev, 5, "the newer copy goes back over the wire");
  assert.equal(back?.value.bundle.profile.cr, 1500, "with its contents");
  assert.equal(host.snapshot().guests.length, 1, "one pilot, one row");
  again.stop({ quiet: true });
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

test("slice 5: losing the host puts the menu up with one prompt and one door", () => {
  // The owner's rule (2026-11-24): *"returned to the main menu with a prompt saying something
  // like lost connection to host. Dismissing this returns you to main menu. Like Minecraft."*
  const screens = read("src/ui/screens.js");
  const prompt = screens.slice(screens.indexOf("function lostHostHtml"));
  const body = prompt.slice(0, prompt.indexOf("\n}\n") + 3);

  assert.match(body, /<h2>Lost connection to host<\/h2>/, "it says what happened, in his words");
  assert.match(body, /away-actions/, "as a card, like every other screen that stops the game");
  const buttons = body.match(/<button[^>]*>[^<]*<\/button>/g) || [];
  assert.equal(buttons.length, 1, "one door: dismissing it is the whole of it");
  assert.match(body, /data-a="lostHostOk">Main menu</, "and that door is the main menu");
  for (const tag of body.match(/<button[^>]*>/g) || []) assert.match(tag, /class="go"/, `${tag} is a full-width button`);
  assert.match(body, /away-build">Build \$\{esc\(BUILD\)\}/, "and it names its build, like the away card");
  // Two audiences, one screen: a pilot that is over there is told where it is, and a
  // looker-around is told that nothing of its own was involved (LESSONS L40).
  assert.match(body, /state\.away[\s\S]{0,400}Open World/, "the pilot is still in that world, and Open World offers it home");
  assert.match(body, /only looking around/, "and a guest with nothing there is told so");

  // It is drawn whoever the player is — a lost connection is news, not a question about a save.
  assert.match(screens, /if \(state\.ui\?\.lostHost\) return/, "the prompt is drawn from the connection's news");

  // Dismissing it changes nothing but the prompt.
  const menu = read("src/ui/menu.js");
  const act = menu.slice(menu.indexOf("  lostHostOk() {"));
  const dismissing = act.slice(0, act.indexOf("\n  },") + 4);
  assert.doesNotMatch(dismissing, /bringPilotHome|leaveVisit|api\.stop|stop\(/, "dismissing is not a decision about the save");
  assert.match(dismissing, /state\.ui\.lostHost = null;/, "it only closes the prompt");

  // The connection stops itself and puts the menu up, before the menu's handler can look.
  const ui = read("src/ui/multiplayer.js");
  const handler = ui.slice(ui.indexOf('on("mp-host-left"'));
  const handlerBody = handler.slice(0, handler.indexOf("\n  });") + 6);
  assert.match(handlerBody, /api\.stop\(\{ quiet: true \}\)/, "the room is gone, so the session is closed without a goodbye");
  assert.match(handlerBody, /state\.ui\.lostHost = \{ hostName: host, reason: said \}/, "the prompt carries the host's name and the reason");
  assert.match(handlerBody, /emit\("main-menu", \{\}\)/, "and the player is put back on the main menu");
  assert.doesNotMatch(handlerBody, /state\.away/, "every guest gets the prompt: a lost connection is not a save question");
  assert.doesNotMatch(ui, /snap\.hostLost === true/, "no session is kept behind the menu any more");

  // The session states the loss and does not touch a save.
  const events = read("src/util/events.js");
  assert.match(events, /mp-host-left  \{ reason, hostName \}/, "the loss is an event");
  assert.doesNotMatch(events, /mp-host-back/, "and there is no \"it came back\" event: joining again is joining");
  const net = read("src/net/session.js");
  const lost = net.slice(net.indexOf("function markHostLost("));
  const lostBody = lost.slice(0, lost.indexOf("\n  }\n") + 4);
  assert.doesNotMatch(lostBody, /stop\(/, "losing the host never stops a session or touches the pilot's save");
  assert.match(lostBody, /emit\("mp-host-left"/, "it says so instead");
  assert.match(net, /function checkHostAlive/, "and silence is a loss too, not only a departing peer");
});
