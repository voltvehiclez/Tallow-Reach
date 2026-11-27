// Playtest 24 (build `2026-11-25f`): the three reports from the owner's first flight of 8b.
//
//   1. **"Guest ship is damaged -> leaving host game -> bring pilot back to local open world ->
//      repair -> bring pilot to host's world again -> guest is still damaged."** and the host's
//      line: *"guest's pilot is newer in this world than the copy that arrived; this world kept
//      its own."* The repair was real and the suitcase really carried it. The record was what
//      lied: a returning **hello** cleared the `left` mark that tells a carry "this is a
//      suitcase, not an identity", so by the time the copy arrived the world's own record looked
//      newer (a host raises `rev` on every write-back; a fresh `checkOut` starts at zero) and the
//      damaged copy was kept over the repaired one.
//   2. **"When host is viewing the guests ship in motion, if the host yaws/pitches slightly the
//      guest becomes blurry — model and label. Worse the faster the guest flies."** A visiting
//      record's `snap` flag is cleared by nobody but `chaseView`, which only ever sees the local
//      hull — and `launch()` sets it. So from the moment a guest took off its hull was placed at
//      the last 60 Hz tick under a 240 Hz camera: the 2026-11-08 sawtooth, back on the one record
//      that fix did not reach.
//   3. **"When opening chat with enter you should be able to highlight the chat to copy paste it
//      with mouse; attempting to select text closes the chat window."** The field's `blur` handler
//      closed an empty box, and a press on the lines blurs the field.
//
// Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as session from "../src/net/session.js";
import { newProfile, newWorld, SAVE_VERSION, sanitizeSave } from "../src/state/profile.js";
import { bringPilotHome } from "../src/net/session.js";
import { isAway } from "../src/net/multiplayer.js";
import { on } from "../src/util/events.js";
import * as ui from "../src/ui/multiplayer.js";
import { loadHeadless } from "./headless.mjs";
import { DEFAULT_PLACE } from "../src/data/places.js";

const GUEST_ID = "guest-guest-to";                    // `ownGuestId()`: `guest-` + the token's first 8

const makeSave = () => sanitizeSave({ v: SAVE_VERSION, profile: newProfile(), world: newWorld(), away: null });

/* ------------------------------------------------------------------------- */
/* 1. A repair made at home arrives at the host                                */
/* ------------------------------------------------------------------------- */

function pilotSave() {
  const save = makeSave();
  save.profile.cr = 800;
  save.profile.holds[save.profile.ship] = { ferrite: 10 };
  return save;
}

function makeWire() {
  const made = [];
  const factory = ({ role, worldId, onState, onData, onPeer }) => {
    const channel = {
      role, worldId, peerId: null, outbound: [],
      join: async () => { onState?.({ state: "finding", reason: "" }); return channel; },
      send: (peerId, value) => { channel.outbound.push({ peerId, value }); channel.deliver?.(peerId, value); return true; },
      broadcast: value => { if (!channel.peerId) return 0; channel.send(channel.peerId, value); return 1; },
      peers: () => (channel.peerId ? [channel.peerId] : []),
      state: () => ({ state: channel.peerId ? "connected" : "finding", reason: "" }),
      room: () => worldId,
      leave: () => { channel.left = true; },
      reach: (message, peerId = "peer-1") => onData?.({ ...message, peerId }),
      connect(peerId = "peer-1") { channel.peerId = peerId; onPeer?.({ kind: "join", peerId }); },
    };
    made.push(channel);
    return channel;
  };
  return { factory, made };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

/** Host and guest, joined, with the pilot carried in. The guest's own save is the real one. */
async function joinedPair({ token = "guest-token" } = {}) {
  const wire = makeWire();
  session.setChannelFactory(wire.factory);
  const hostSave = pilotSave();
  const guestSave = pilotSave();
  const narrow = next => {
    if (next?.world?.guests) guestSave.world.guests = next.world.guests;
    if (typeof next?.world?.worldId === "string") guestSave.world.worldId = next.world.worldId;
    if (next && "away" in next) guestSave.away = next.away;
  };
  const host = session.createChannelForTest("host", "w-1", "Ada", "host-token", {
    read: () => hostSave,
    write: next => Object.assign(hostSave, next),
    install: next => Object.assign(hostSave, next),
  });
  await host.start();
  const hostChannel = wire.made.at(-1);
  const guest = session.createChannelForTest("guest", "w-1", "Bo", token, {
    read: () => guestSave,
    write: next => { narrow(next); Object.assign(guestSave, next); },
    install: next => { narrow(next); Object.assign(guestSave, JSON.parse(JSON.stringify(next))); },
  });
  await guest.start();
  const guestChannel = wire.made.at(-1);
  // The bus answers "what does this pilot look like now?" the way `main.js` does, out of the
  // live visiting record (`sim/`'s player in the host's world). With no sim in a test, `live`
  // stands in for that record — it is the pilot as THIS world currently has it.
  const live = { profile: null };
  on("mp-guest-bundle-request", request => {
    if (!request?.guestId) return;
    request.profile = live.profile || guestSave.away?.suitcase?.profile || guestSave.profile;
    request.lockers = [];
    request.answered = true;
  });
  hostChannel.deliver = (peerId, value) => guestChannel.reach(value, peerId);
  guestChannel.deliver = (peerId, value) => hostChannel.reach(value, peerId);
  hostChannel.connect("guest-peer");
  guestChannel.connect("host-peer");
  session.focusForTest(guest);
  await settle();
  session.bringPilot();
  await settle();
  return { host, guest, hostChannel, guestChannel, hostSave, guestSave, wire, live };
}

/** The host's own two-second check, run by hand until the copy has been written back. */
async function hostWritesBack(host) {
  host.syncGuests();
  await new Promise(resolve => setTimeout(resolve, 2250));
}

/** What the world believes the pilot's hull damage is, from its stored bundle. */
const hostHullDamage = (hostSave, ship) => hostSave.world.guests[GUEST_ID]?.bundle?.profile?.hp?.[ship];

test("playtest 24: a pilot repaired at home arrives repaired, not as this world last saw it", async () => {
  const { host, guest, hostChannel, guestSave, hostSave, wire, live } = await joinedPair();
  const ship = guestSave.profile.ship;

  // The guest takes a beating **in this world**, and the host's own check writes that copy back.
  live.profile = JSON.parse(JSON.stringify(guestSave.away.suitcase.profile));
  live.profile.hp[ship] = 0.35;
  await hostWritesBack(host);
  assert.equal(hostHullDamage(hostSave, ship), 0.35, "this world now holds a damaged pilot");
  const hostRev = hostSave.world.guests[GUEST_ID].rev;
  assert.ok(hostRev > 0, "and its copy has moved on (a host raises `rev` on every write-back)");

  // The guest goes home the ordinary way.
  guest.stop();
  await settle();
  assert.equal(hostSave.world.guests[GUEST_ID].left, true, "the record is holding a suitcase");

  // Home: the suitcase is applied, and the pilot is repaired at a station there.
  const home = bringPilotHome(guestSave);
  assert.equal(home.ok, true, "the pilot comes home");
  assert.equal(isAway(home.save), false, "and is not away any more");
  home.save.profile.hp[ship] = 1;
  Object.assign(guestSave, home.save);

  // Back to the same world on the same link (with no live record there any more).
  live.profile = null;
  const back = session.createChannelForTest("guest", "w-1", "Bo", "guest-token", {
    read: () => guestSave,
    write: next => { Object.assign(guestSave, next); },
    install: next => { Object.assign(guestSave, JSON.parse(JSON.stringify(next))); },
  });
  await back.start();
  const backChannel = wire.made.at(-1);
  backChannel.deliver = (peerId, value) => hostChannel.reach(value, peerId);
  hostChannel.deliver = (peerId, value) => backChannel.reach(value, peerId);
  backChannel.connect("guest-peer-2");
  session.focusForTest(back);
  await settle();

  // The record is live again after the hello — and the **copy** is what says it came from home.
  assert.equal(hostSave.world.guests[GUEST_ID].left, false, "the hello re-admits the pilot as before");

  assert.equal(back.bringPilot().ok, true, "the pilot travels again");
  await settle();
  // The one fact an ordering pair cannot express: a fresh `checkOut` starts at zero, this world's
  // record has a raised `rev`, and yet the copy that carries the repair is the newer one.
  const carried = backChannel.outbound.map(m => m.value).filter(v => v?.t === "carry").at(-1);
  assert.equal(carried?.fresh, true, "the copy says it was packed out of the home save just now");
  assert.equal(carried?.rev, 0, "its ordering pair is at zero, which is exactly why the pair alone cannot decide");
  assert.equal(hostHullDamage(hostSave, ship), 1, "and it arrives REPAIRED");
  assert.equal(hostSave.world.guests[GUEST_ID].left, false, "the record is an identity again, not a suitcase");

  // The message that used to appear was the world saying it had kept its own damaged copy.
  const hostLines = (host.snapshot().chat || []).map(line => String(line.text || ""));
  assert.equal(hostLines.some(text => /kept its own/.test(text)), false, "and nothing says this world kept its own copy");
  assert.equal(hostLines.some(text => /arrived/.test(text)), true, "it says the pilot arrived, which is what happened");
  back.stop({ quiet: true });
});

/* ------------------------------------------------------------------------- */
/* 2. A visiting hull is interpolated between ticks, like everything else      */
/* ------------------------------------------------------------------------- */

const views = await loadHeadless(
  "src/render/views.js",
  {
    state: "src/state/state.js",
    emit: "src/util/events.js",
    V: "src/util/math.js",
    Q: "src/util/math.js",
    createPlayer: "src/sim/player.js",
    setShip: "src/sim/player.js",
    localPlayer: "src/state/state.js",
    newProfile: "src/state/profile.js",
  },
  { keep: ["views.js"] }
);

/** A clean world with the local pilot only, not docked, looking at the default pocket. */
function bareWorld() {
  views.state.players.length = 0;
  views.state.localPlayerIndex = 0;
  views.state.place = DEFAULT_PLACE;
  views.createPlayer();
  views.setShip("wasp");
  views.localPlayer().docked = false;
  views.updateEntityViews();
  return views.state;
}

/** A visitor in flight, as `launch()` leaves one: not docked, and `snap` set. */
function flyingVisitor(extra = {}) {
  const P = {
    kind: "ship",
    guestId: "guest-1",
    name: "Acey",
    ship: "wasp",
    place: DEFAULT_PLACE,
    pos: views.V(0, 0, 200),
    quat: views.Q(),
    v: views.V(0, 0, -240),
    thr: 1,
    docked: false,
    dead: false,
    hull: 1,
    hullMax: 1,
    snap: true,
    ...extra,
  };
  views.state.players.push(P);
  return P;
}

const drawnPos = id => views.state.otherPilots.find(p => String(p.id) === String(id))?.pos;

test("playtest 24: a visitor's `snap` is consumed, so its hull interpolates between 60 Hz ticks", () => {
  const S = bareWorld();
  const P = flyingVisitor();

  // The jump frame itself is still drawn as a jump (a launch, a warp): the flag is used, not denied.
  views.updateEntityViews(1);
  assert.deepEqual([drawnPos("guest-1").x, drawnPos("guest-1").y, drawnPos("guest-1").z], [0, 0, 200], "the first frame is where the record is");
  assert.equal(P.snap, false, "and the renderer has consumed the flag — nobody else ever would");

  // A tick: the previous pose is z 200, the next is 240 (40 m in one 60 Hz tick — ordinary flight,
  // under the 50 m teleport threshold). Halfway is 220, a place the hull must be drawn at or the
  // host sees the 60 Hz sawtooth again.
  views.snapshotSimPoses();
  P.pos.set(0, 0, 240);
  views.updateEntityViews(0.5);
  const mid = drawnPos("guest-1");
  assert.ok(Math.abs(mid.z - 220) < 1e-6, `the hull is drawn between the ticks (z ${mid.z}) — not at the last tick's 240`);
  assert.equal(S.players.length, 2, "drawing never adds or moves a record");

  // The label reads the same number (`ui/hud.js` places it from `state.otherPilots`), so a smooth
  // hull is a smooth tag: one pose, one place.
  assert.equal(views.state.otherPilots.find(p => p.id === "guest-1").pos.z, mid.z);

  // Two more frames, and every one of them moves: no frozen frame, no sawtooth.
  const seen = [mid.z];
  for (const alpha of [0.75, 1]) {
    views.updateEntityViews(alpha);
    seen.push(drawnPos("guest-1").z);
  }
  for (let i = 1; i < seen.length; i += 1) {
    assert.ok(seen[i] > seen[i - 1], `frame ${i} advances (${seen[i - 1]} -> ${seen[i]})`);
  }
});

test("playtest 24: a flying visitor's snap is consumed on the way; a docked one is inside the station (owner, 2026-11-26)", () => {
  const S = bareWorld();
  // A docked hull is inside the station and is not drawn — on this screen and on any other.
  const docked = flyingVisitor({ docked: true, snap: false, pos: views.V(5, 0, 210) });
  views.updateEntityViews(1);
  assert.equal(views.state.otherPilots.length, 0, "a docked visitor is not in the sky");
  assert.equal(docked.snap, false, "and it is not holding a stale snap flag either");
  docked.docked = false;
  views.updateEntityViews(1);
  assert.equal(views.state.otherPilots.length, 1, "when it launches it is drawn again");
  assert.equal(S.players.length, 2);
  // Nothing about the local hull changed: its own snap handling stays `chaseView`'s job.
  assert.equal(views.localPlayer().snap, false, "the local record is untouched by the visitor's path");
  docked.dead = true;
  views.updateEntityViews(1);
  assert.equal(views.state.otherPilots.length, 0, "a dead pilot draws nothing");
});

/* ------------------------------------------------------------------------- */
/* 3. Selecting the conversation keeps the box                                 */
/* ------------------------------------------------------------------------- */

test("playtest 24: a press on the chat lines keeps the box; a press outside still closes an empty one", () => {
  // The box the owner opened with Enter: open, not pinned, field empty.
  assert.equal(ui.pressKeepsChat("lines", { open: true }), true, "a press on the conversation starts a selection and the box stays");
  assert.equal(ui.pressKeepsChat("lines", { open: true, text: "half a sentence" }), true, "whatever is in the field");
  assert.equal(ui.pressKeepsChat("box", { open: true }), true, "the field and Pin are typing, not leaving");
  assert.equal(ui.pressKeepsChat("outside", { open: true }), false, "clicking back into the game closes an empty box, as before");
  assert.equal(ui.pressKeepsChat("outside", { open: true, text: "half a sentence" }), true, "but never a half-written line");
  assert.equal(ui.pressKeepsChat("outside", { open: false, pinned: true }), true, "a pinned box is the player's: it stays");
  assert.equal(ui.pressKeepsChat("lines", { open: false }), false, "a glancing box is only a glance: no selection in it");
});

test("playtest 24: the chat stylesheet lets only the open box's lines be selected", () => {
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(css, /#mp-chat-lines \{[\s\S]*?user-select: none;/, "a glance or a pinned readout is not a document");
  assert.match(css, /body\.mp-chat-open #mp-chat-lines \{ user-select: text;/, "the box the player opened can be selected and copied");
});
