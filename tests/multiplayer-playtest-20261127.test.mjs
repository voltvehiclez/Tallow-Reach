// Regression tests for the 2026-11-27 post-8071bc1 live-playtest guest bugs:
//   1. Guest HUD stuck at 0 m/s because `applySelfShip` never synced `measuredSpeed`/`forwardSpeed`.
//   2. Guest could not dock (`withinDockGrace` 250ms revert + paste-code peerId:null drop + speed feedback).
//   3. Guest per-host-world missions/boards/flags/counters lost on relog (`visitState` persistence & custody isolation).
//   4. Guest position/place/health/docked state lost on relog (both on host and via `enterGameMode("open")` UI clobber).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const storageMap = new Map();
if (typeof globalThis.localStorage === "undefined") {
  globalThis.localStorage = {
    getItem: k => storageMap.get(k) ?? null,
    setItem: (k, v) => storageMap.set(k, String(v)),
    removeItem: k => storageMap.delete(k),
    clear: () => storageMap.clear(),
  };
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = rel => readFileSync(path.join(ROOT, rel), "utf8");

import { state, applySave, newRootSave, currentSave, placeWorld, resetPlaces, sayForPlayer } from "../src/state/state.js";
import { SAVE_VERSION, newProfile, newWorld, sanitizeSave, cleanVisitState } from "../src/state/profile.js";
import { DEFAULT_PLACE, stationKeyAt, setPlaceCatalog } from "../src/data/places.js";
import { RELAYS } from "../src/data/multiplayer.js";
import { generateGalaxy } from "../src/sim/galaxy.js";
import { V, Q } from "../src/util/math.js";
import { on } from "../src/util/events.js";
import { cleanMessage } from "../src/net/protocol.js";
import { checkOut, checkIn, hostProfile } from "../src/net/custody.js";
import { putGuest } from "../src/net/multiplayer.js";
import * as session from "../src/net/session.js";
import {
  arriveGuest,
  executeGuestAction,
  leaveGuest,
  guestRecordOf,
  guestLockerSnapshot,
  guestProfileSnapshot,
  guestVisitStateSnapshot,
  resetGuests,
} from "../src/sim/multiplayer.js";
import { createPlayer, createPlayerRecord, flight } from "../src/sim/player.js";
import { enterPlace, loadPlace, stationAt } from "../src/sim/places.js";
import { stepSim } from "../src/sim/step.js";
import { clearNetEntities } from "../src/sim/world.js";
import { addEntity } from "../src/sim/entity.js";
import { syncPocketRocks } from "../src/render/entitystream.js";
import { launch, tryDock, dockFailureReason } from "../src/sim/session.js";
import { syncSpeedFromVelocity, displayedSpeed, truePlayerSpeed } from "../src/sim/flight-instruments.js";
import { acceptContract, completeContract } from "../src/sim/contracts.js";
import { neutralControls } from "../src/state/controls.js";

function wirePair() {
  const made = [];
  const factory = ({ role, worldId, onState, onData, onPeer }) => {
    const peers = new Set();
    const channel = {
      role, worldId, peerId: null,
      join: async () => { onState?.({ state: "finding", reason: "" }); return channel; },
      send: (peerId, value) => {
        channel.outbound.push({ peerId, value });
        channel.deliver?.(peerId, value);
        return true;
      },
      broadcast: value => {
        let n = 0;
        for (const p of peers) { channel.send(p, value); n++; }
        return n;
      },
      peers: () => [...peers],
      state: () => ({ state: peers.size ? "connected" : "finding", reason: "" }),
      room: () => worldId,
      leave: () => { channel.left = true; peers.clear(); },
      outbound: [],
      reach: (message, peerId = "peer-1") => onData?.({ ...message, peerId }),
      connect(peerId = "peer-1") {
        peers.add(peerId);
        onPeer?.({ kind: "join", peerId });
        onState?.({ state: "connected", reason: "" });
      },
      drop(peerId = "peer-1") {
        peers.delete(peerId);
        onPeer?.({ kind: "leave", peerId });
      },
      restart: async () => channel,
      checkRelays: async () => ({ host: 1, srflx: 1, prflx: 0, relay: 0 }),
    };
    made.push(channel);
    return channel;
  };
  return { made, factory };
}

function resetHostWorld() {
  resetGuests();
  resetPlaces();
  state.players.length = 0;
  state.localPlayerIndex = 0;
  applySave(newRootSave());
  const P = createPlayer(neutralControls());
  enterPlace(DEFAULT_PLACE, P);
  state.players[0] = P;
  P.profile = state.profile;
}

/* ------------------------------------------------------------------------- */
/* Bug 1: guest HUD speed matches live velocity                              */
/* ------------------------------------------------------------------------- */

test("Bug 1: syncSpeedFromVelocity drives positive, negative, docked, and warp HUD speeds", () => {
  const P = createPlayer(neutralControls());
  P.quat.set(0, 0, 0, 1); // forward = -Z
  P.docked = false;
  P.dead = false;

  P.v.set(0, 0, -120);
  syncSpeedFromVelocity(P, false);
  assert.equal(truePlayerSpeed(P), 120);
  assert.equal(displayedSpeed(P, false), 120, "forward speed shows positive m/s");

  P.v.set(0, 0, 60);
  syncSpeedFromVelocity(P, false);
  assert.equal(displayedSpeed(P, false), -60, "reverse speed shows negative m/s");

  syncSpeedFromVelocity(P, true);
  assert.equal(P.measuredSpeed, 0);
  assert.equal(displayedSpeed(P, true), 0, "warping zeros velocity readout");

  P.v.set(0, 0, -90);
  P.docked = true;
  syncSpeedFromVelocity(P, false);
  assert.equal(P.measuredSpeed, 0);
  assert.equal(displayedSpeed(P, false), 0, "docked zeros velocity readout");

  const mainSrc = read("src/main.js");
  assert.match(mainSrc, /function applySelfShip[\s\S]*syncSpeedFromVelocity\(P,\s*Boolean\(P\.warp\)\)/,
    "applySelfShip calls syncSpeedFromVelocity after setting P.v/quat/docked/warp");
});

/* ------------------------------------------------------------------------- */
/* Bug 2: docking reliability, paste-code peer lookup, deterministic state   */
/* ------------------------------------------------------------------------- */

test("Bug 2: paste-code (peerId:null) accepts controls/warp/dock/act and hostPeerId targeting is used", async () => {
  const wire = wirePair();
  session.setChannelFactory(wire.factory);
  const hostSave = newRootSave().open;
  const guestSave = newRootSave().open;

  const host = session.createChannelForTest("host", "w-paste", "Ada", "h-tok", {
    read: () => hostSave,
    write: next => Object.assign(hostSave, next),
  });
  const guest = session.createChannelForTest("guest", "w-paste", "Bo", "g-tok", {
    read: () => guestSave,
    write: next => Object.assign(guestSave, next),
    install: next => { Object.assign(guestSave, next); },
  });

  await host.start();
  const hostCh = wire.made.at(-1);
  await guest.start();
  const guestCh = wire.made.at(-1);

  const emitted = { ctrl: 0, warp: 0, dock: 0, act: 0 };
  on("mp-guest-controls", () => { emitted.ctrl += 1; });
  on("mp-guest-warp", () => { emitted.warp += 1; });
  on("mp-guest-dock", () => { emitted.dock += 1; });
  on("mp-guest-act", req => { emitted.act += 1; req.answered = true; req.result = { ok: true }; });

  // Simulate paste-code connection where host `onData` passes `peerId = null`.
  hostCh.deliver = (_p, v) => guestCh.reach(v, "host-peer-real");
  guestCh.deliver = (_p, v) => hostCh.reach(v, null);
  hostCh.connect("paste-stub");
  guestCh.connect("host-peer-real");
  hostCh.reach({ t: "hello", v: SAVE_VERSION, worldId: "w-paste", guestId: "guest-g-tok", name: "Bo", token: "g-tok" }, null);

  state.ui.intro = false;
  state.paused = false;
  state.localInput = { ...neutralControls(), thrust: 1 };
  state.aimDirection = { x: 0, y: 0, z: -1 };
  // Ensure guest record exists locally and is not docked for sendControls.
  const localP = createPlayer(neutralControls());
  localP.docked = false;
  state.players[0] = localP;
  state.localPlayerIndex = 0;

  assert.equal(guest.sendControls(), true);
  assert.equal(guest.sendWarp("solis"), true);
  assert.equal(guest.sendDock(), true);
  assert.ok(guest.sendAction({ op: "pw", slot: 1 }) > 0);
  assert.deepEqual(emitted, { ctrl: 1, warp: 1, dock: 1, act: 1 },
    "all guest packets accepted when paste-code host receives peerId:null");

  // Verify guest sends directly to hostPeerId rather than broadcasting blindly.
  for (const msg of guestCh.outbound.filter(m => ["controls", "warp", "dock", "act"].includes(m.value?.t))) {
    assert.equal(msg.peerId, "host-peer-real", `${msg.value.t} targets hostPeerId`);
  }

  guest.stop({ quiet: true });
  host.stop({ quiet: true });
  session.setChannelFactory(null);
});

test("Bug 2: tryDock gives speed denial notice inside range and docks cleanly once slowed; main.js drops 250ms grace timer", () => {
  resetHostWorld();
  const profile = hostProfile(checkOut(newRootSave().open).bundle);
  const P = arriveGuest({ guestId: "g-dock", name: "Bo", profile });
  launch(P, P.profile);
  const st = stationAt(DEFAULT_PLACE);
  P.pos.set(...st.pos);
  P.pos.x += 25;

  P.v.set(0, 0, -95);
  assert.equal(tryDock(P, P.profile, P.guestWorld), false, "too fast to dock at 95 m/s");
  assert.match(dockFailureReason(P, P.profile), /Too fast to dock \(95 m\/s/, "clear guest refusal notice");

  P.v.set(0, 0, -15);
  assert.equal(tryDock(P, P.profile, P.guestWorld), true, "docks once below threshold");
  assert.equal(P.docked, true);

  const mainSrc = read("src/main.js");
  assert.equal(/withinDockGrace/.test(mainSrc), false, "fragile 250ms withinDockGrace timer removed");
  assert.match(mainSrc, /dockStreamCaughtUp/, "deterministic dock stream catch-up guard present");
});

/* ------------------------------------------------------------------------- */
/* Bugs 3 & 4: per-host-world missions, guestWorld, & position across relog  */
/* ------------------------------------------------------------------------- */

test("Bugs 3 & 4: guest missions, guestWorld, pose, health, and non-home docked station persist per host world across relogs", async () => {
  resetHostWorld();
  const wire = wirePair();
  session.setChannelFactory(wire.factory);

  const hostSave = newRootSave().open;
  hostSave.world.place = DEFAULT_PLACE;
  let guestHome = newRootSave().open;
  guestHome.profile.cr = 1500;
  guestHome.profile.flags = { homeSecret: true };
  guestHome.profile.done = 9;
  guestHome.profile.kills = 42;

  on("mp-guest-arrive", ({ guestId, name, bundle, visitState }) => {
    if (!bundle) return;
    const profile = hostProfile(bundle, visitState);
    arriveGuest({
      guestId, name, profile,
      place: bundle.homeStation || null,
      lockers: Array.isArray(bundle.lockers) ? bundle.lockers : [],
      visitState,
    });
  });
  on("mp-guest-left", ({ guestId }) => { leaveGuest(guestId); });
  on("mp-guest-bundle-request", req => {
    const P = guestRecordOf(req?.guestId);
    if (!P?.profile) return;
    req.profile = guestProfileSnapshot(P);
    req.lockers = guestLockerSnapshot(P);
    req.visitState = guestVisitStateSnapshot(P);
    req.answered = true;
  });

  const host = session.createChannelForTest("host", "w-host", "Ada", "h-tok", {
    read: () => hostSave,
    write: next => Object.assign(hostSave, next),
  });
  const guest1 = session.createChannelForTest("guest", "w-host", "Bo", "g-tok", {
    read: () => guestHome,
    write: next => Object.assign(guestHome, next),
    install: next => { guestHome = next; },
  });
  await host.start();
  const hostCh = wire.made.at(-1);
  await guest1.start();
  const guest1Ch = wire.made.at(-1);
  hostCh.deliver = (_p, v) => guest1Ch.reach(v, "host-peer");
  guest1Ch.deliver = (_p, v) => hostCh.reach(v, "guest-peer-1");
  hostCh.connect("guest-peer-1");
  guest1Ch.connect("host-peer");

  assert.equal(guest1.bringPilot().ok, true);
  const guestId = guestHome.away.guestId;
  let P = guestRecordOf(guestId);
  assert.ok(P, "guest arrived on host");
  assert.equal(P.profile.done, 0, "home stats never leak into host world");
  assert.equal(P.profile.flags.homeSecret, undefined, "home flags never leak into host world");

  // Guest accepts a salvage contract + edits host-world state, flies to `hollow`, collects partial progress, takes damage.
  assert.ok(P.guestWorld.board.length > 0, "guestWorld generated contract offers");
  let salvageIdx = P.guestWorld.board.findIndex(c => c.type === "salvage");
  if (salvageIdx < 0) {
    salvageIdx = 0;
    P.guestWorld.board[0] = { type: "salvage", tier: 1, p: 0, n: 3, r: 500 };
  }
  const accMsg = acceptContract(salvageIdx, P.profile, P.guestWorld, DEFAULT_PLACE, P);
  assert.match(String(accMsg), /Contract accepted/, "guest accepted salvage contract");
  P.profile.flags.hostFact = "seen-rift";
  P.profile.kills = 3;
  P.profile.done = 1;
  P.guestWorld.stationStores[stationKeyAt(DEFAULT_PLACE)] = { ferrite: 2 };
  P.guestWorld.stationSlots[stationKeyAt(DEFAULT_PLACE)] = [null, ["ferrite", 2]];
  launch(P, P.profile);
  assert.ok(P.guestWorld.missionState[DEFAULT_PLACE]?.drops?.length > 0, "salvage drops created on launch");
  enterPlace("hollow", P);
  P.pos.set(320, 15, -410);
  P.quat.set(0, 0.70710678, 0, 0.70710678).normalize();
  P.sh = Math.min(8, P.shMax);
  P.en = Math.min(19, P.drive.bmax);
  P.profile.missions[0].counters[P.profile.missions[0].steps[0].id] = 1;

  // Pure movement / mission state persists via syncGuests() WITHOUT bumping suitcase `rev`!
  host.syncGuests(); // baselines livePrint and saves visitState
  const revAfterBaseline = hostSave.world.guests[guestId].rev;
  P.pos.set(340, 18, -420);
  host.syncGuests();
  assert.equal(hostSave.world.guests[guestId].rev, revAfterBaseline,
    "moving in space updates visitState without bumping suitcase rev");
  assert.deepEqual(hostSave.world.guests[guestId].visitState.resume.pos, [340, 18, -420]);

  // Also test host `captureActiveModeSave()` saves guest visitState into hostSave.world.guests.
  P.pos.set(365, 22, -455);
  state.worldState = hostSave.world;
  const hostCaptured = currentSave();
  assert.deepEqual(hostCaptured.world.guests[guestId].visitState.resume.pos, [365, 22, -455],
    "host saveCurrentGame/currentSave captures live guest visitState");

  // Dirty disconnect (`forgetPeer` / drop) still flushes final state before removing live ship!
  hostCh.drop("guest-peer-1");
  await new Promise(r => setTimeout(r, 0));
  assert.equal(guestRecordOf(guestId), null, "guest left live world on drop");
  assert.equal(hostSave.world.guests[guestId].left, true, "marked left");
  assert.deepEqual(hostSave.world.guests[guestId].visitState.resume.pos, [365, 22, -455],
    "disconnect flushed latest position into visitState");
  assert.equal(hostSave.world.guests[guestId].visitState.missions.length, 1, "mission survived disconnect");
  guest1.stop({ quiet: true });

  // Simulate host save/reload round-trip through `sanitizeSave`.
  const reloadedHost = sanitizeSave(JSON.parse(JSON.stringify(hostSave)));
  Object.assign(hostSave, reloadedHost);

  // Path A (dirty drop -> reconnect without going home, `fresh: false` stale rejoin):
  // Host's flushed record restores lockers, stationSlots, hollow flight pose, health, and missions!
  const guest1b = session.createChannelForTest("guest", "w-host", "Bo", "g-tok", {
    read: () => guestHome,
    write: next => Object.assign(guestHome, next),
    install: next => { guestHome = next; },
  });
  await guest1b.start();
  const guest1bCh = wire.made.at(-1);
  hostCh.deliver = (_p, v) => guest1bCh.reach(v, "host-peer");
  guest1bCh.deliver = (_p, v) => hostCh.reach(v, "guest-peer-1b");
  hostCh.connect("guest-peer-1b");
  guest1bCh.connect("host-peer");
  // `onWelcome` sees `isAway(guestHome)` and automatically sends `carry` (`fresh: false`);
  // host sees `record.rev (1) > incoming.rev (0)` and restores its newer flushed record + visitState.
  P = guestRecordOf(guestId);
  assert.ok(P, "guest resumed on host after dirty disconnect");
  assert.deepEqual(P.guestWorld.stationSlots[stationKeyAt(DEFAULT_PLACE)], [null, ["ferrite", 2]],
    "dirty disconnect preserved stationSlots when reconnecting");
  // Clean leave (`bye` -> `writeBack` sends synced suitcase back to `guestHome` before disconnect).
  guest1b.stop();
  await new Promise(r => setTimeout(r, 0));

  // Verify the guest's home save NEVER absorbed host-world missions/flags on checkIn.
  const checkedInHome = checkIn(guestHome, guestHome.away.suitcase);
  assert.equal(checkedInHome.profile.done, 9, "home stats intact");
  assert.equal(checkedInHome.profile.flags.homeSecret, true, "home flags intact");
  assert.equal(checkedInHome.profile.flags.hostFact, undefined, "host flags never leak home");
  assert.equal(checkedInHome.profile.missions.length, 0, "host missions never leak home");
  assert.deepEqual(checkedInHome.world.stationStores[stationKeyAt(DEFAULT_PLACE)], { ferrite: 2 },
    "synced suitcase brought ferrite home safely");

  // Path B: Guest rejoins SAME host world with `fresh: true` after visiting home!
  const guest2 = session.createChannelForTest("guest", "w-host", "Bo", "g-tok", {
    read: () => checkedInHome,
    write: next => Object.assign(checkedInHome, next),
    install: next => { Object.assign(checkedInHome, next); },
  });
  await guest2.start();
  const guest2Ch = wire.made.at(-1);
  hostCh.deliver = (_p, v) => guest2Ch.reach(v, "host-peer");
  guest2Ch.deliver = (_p, v) => hostCh.reach(v, "guest-peer-2");
  hostCh.connect("guest-peer-2");
  guest2Ch.connect("host-peer");

  assert.equal(guest2.bringPilot().ok, true);
  P = guestRecordOf(guestId);
  assert.ok(P, "guest re-arrived on host");
  assert.equal(P.docked, false, "resumed in space, not reset docked to Meridian");
  assert.equal(P.place, "hollow", "resumed in saved pocket `hollow`");
  assert.deepEqual(P.pos.toArray(), [365, 22, -455], "resumed at exact flight position");
  assert.equal(Math.round(P.sh), Math.round(Math.min(8, P.shMax)), "shield preserved across relog");
  assert.equal(Math.round(P.en), Math.round(Math.min(19, P.drive.bmax)), "boost energy preserved across relog");
  assert.equal(P.profile.flags.hostFact, "seen-rift", "host-world flags restored");
  assert.equal(P.profile.kills, 3, "host-world kills restored");
  assert.equal(P.profile.missions.length, 1, "host-world active mission restored");
  assert.equal(P.profile.missions[0].owner, guestId, "restored mission retains guest owner");
  assert.equal(P.profile.missions[0].counters[P.profile.missions[0].steps[0].id], 1, "partial objective counter preserved");
  assert.ok(P.guestWorld.missionState[DEFAULT_PLACE]?.drops?.length > 0, "salvage mission drops preserved");
  assert.deepEqual(P.guestWorld.stationSlots[stationKeyAt(DEFAULT_PLACE)], [null, ["ferrite", 2]],
    "stationSlots preserved across fresh rejoin");

  // Also test docking at a non-home station (e.g. Galereach), closing tab (`bye`), and relogging docked there.
  const galaxy = generateGalaxy();
  setPlaceCatalog(galaxy);
  try {
    state.galaxy = galaxy;
    const altStationId = Object.keys(galaxy.pocketsById || galaxy.pockets || {})
      .find(id => id !== DEFAULT_PLACE && stationAt(id));
    assert.ok(altStationId, "generated galaxy has a non-home station");
    enterPlace(altStationId, P);
    const altStation = stationAt(altStationId);
    P.pos.set(...altStation.pos);
    P.v.set(0, 0, 0);
    assert.equal(tryDock(P, P.profile, P.guestWorld), true);
    assert.equal(P.docked, true);

    guest2.stop(); // sends `bye`
    await new Promise(r => setTimeout(r, 0));
    assert.equal(hostSave.world.guests[guestId].visitState.place, altStationId);
    assert.equal(hostSave.world.guests[guestId].visitState.resume, null, "docked save records null resume");

    // Reconnect (`fresh: false` rejoin) — wakes up docked at that non-home station.
    const guest3 = session.createChannelForTest("guest", "w-host", "Bo", "g-tok", {
      read: () => checkedInHome,
      write: next => Object.assign(checkedInHome, next),
      install: next => { Object.assign(checkedInHome, next); },
    });
    await guest3.start();
    const guest3Ch = wire.made.at(-1);
    hostCh.deliver = (_p, v) => guest3Ch.reach(v, "host-peer");
    guest3Ch.deliver = (_p, v) => hostCh.reach(v, "guest-peer-3");
    hostCh.connect("guest-peer-3");
    guest3Ch.connect("host-peer");
    await new Promise(r => setTimeout(r, 0));
    P = guestRecordOf(guestId);
    assert.ok(P, "guest rejoined cleanly");
    assert.equal(P.docked, true, "docked state restored");
    assert.equal(P.place, altStationId, "docked non-home station restored instead of Meridian");

    // Validate expired instance / wormhole fallback docks safely instead of stranding.
    const badState = cleanVisitState({ place: "rift-dead-999", resume: { pos: [10, 20, 30], quat: [0, 0, 0, 1], sh: 5, en: 5 } });
    const P4 = arriveGuest({ guestId: "g-expired", name: "Ex", profile: hostProfile(checkOut(newRootSave().open).bundle, badState), visitState: badState });
    assert.equal(P4.docked, true);
    assert.equal(P4.place, DEFAULT_PLACE, "expired temporary pocket falls back safely to docked station");

    guest3.stop({ quiet: true });
    host.stop({ quiet: true });
  } finally {
    setPlaceCatalog(null);
    state.galaxy = null;
  }
  session.setChannelFactory(null);
  resetHostWorld();
});

test("Bug 4 UI guard: enterGameMode('open') preserves guest airborne visit state on mp-enter-world instead of clobbering with home save", async () => {
  const { loadHeadless } = await import("./headless.mjs");
  const els = new Map();
  const makeEl = id => ({
    id, hidden: false, _html: "", handlers: {}, dataset: {}, style: {},
    clientWidth: 1200, clientHeight: 800,
    addEventListener(t, fn) { this.handlers[t] = fn; },
    setAttribute(k, v) { this[k] = v; },
    appendChild(child) { return child; },
    classList: { toggle() {}, add() {}, remove() {} },
    set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    append() {}, remove() {}, focus() {}, select() {}, closest() { return null; },
  });
  globalThis.document = {
    getElementById: id => { if (!els.has(id)) els.set(id, makeEl(id)); return els.get(id); },
    createElement: tag => makeEl(tag),
    body: makeEl("body"),
  };

  const m = await loadHeadless("src/ui/menu.js", {
    state: "src/state/state.js",
    currentSave: "src/state/state.js",
    applySave: "src/state/state.js",
    resetPlaces: "src/state/state.js",
    newProfile: "src/state/profile.js",
    newSave: "src/state/profile.js",
    createPlayer: "src/sim/player.js",
    configurePlayer: "src/sim/session.js",
    resumeFromSave: "src/sim/session.js",
    dock: "src/sim/session.js",
    encodeSave: "src/state/storage.js",
    on: "src/util/events.js",
    emit: "src/util/events.js",
    shownNotice: "src/ui/notice.js",
  });

  m.resetPlaces();
  m.state.players.length = 0;
  m.state.localPlayerIndex = 0;
  m.state.mode = "open";
  m.state.profile = m.newProfile();
  m.state.worldState = m.newSave().world;
  m.state.worldState.place = DEFAULT_PLACE;
  m.state.worldState.resume = null; // home save is docked at meridian!
  m.state.place = DEFAULT_PLACE;
  m.state.ui.intro = true;
  const P = m.configurePlayer(m.createPlayer(), m.state.profile);
  P.place = "hollow";
  P.docked = false;
  P.pos.set(111, 222, 333);

  m.state.away = { worldId: "w-1", hostName: "Ada", guestId: "guest-1", token: "t", epoch: 0, rev: 0, suitcase: null };
  m.state.guestHome = { place: DEFAULT_PLACE, docked: true, profile: m.newProfile(), worldState: m.newSave().world };

  // Mirror main.js's mp-refresh-visit hook (applied inside enterGameMode after switch/skip resumeFromSave).
  let refreshedVisit = false;
  m.on("mp-refresh-visit", () => {
    refreshedVisit = true;
    P.docked = false;
    P.place = "hollow";
    P.pos.set(111, 222, 333);
  });

  m.setupMenu();
  m.emit("mp-enter-world", {});

  const panel = els.get("panel");
  assert.equal(refreshedVisit, true, "enterGameMode triggered mp-refresh-visit");
  assert.equal(m.state.ui.intro, false, "exited title screen");
  assert.equal(P.docked, false, "home save's docked=true did NOT overwrite airborne guest state");
  assert.equal(P.place, "hollow", "guest pocket stayed at hollow");
  assert.equal(panel.hidden, true, "airborne guest hides outpost panel instead of trapping on station menu");
});

/* ------------------------------------------------------------------------- */
/* 2026-11-27d fixes:                                                        */
/*   A. `src/main.js` missing `cancelGuestHeld` import broke host `G` dock   */
/*   B. Undocked guest relog missed `hud.js` `open-world-entered` sync &     */
/*      `mp-refresh-visit` passed `Pose[]` instead of `Pose` to applySelfShip*/
/* ------------------------------------------------------------------------- */

test("Bug A static guard (2026-11-27d): no undeclared free-variable calls in bundled src/main.js", async () => {
  const esbuild = await import("esbuild");
  const res = await esbuild.build({
    entryPoints: [path.join(ROOT, "src/main.js")],
    bundle: true,
    write: false,
    format: "iife",
    external: ["three", "trystero", "three/*"],
    loader: { ".webp": "dataurl", ".glb": "dataurl", ".txt": "text" },
    minifyIdentifiers: true,
    logLevel: "silent",
  });
  const code = res.outputFiles[0].text;
  let out = "", i = 0;
  while (i < code.length) {
    const c = code[i], n = code[i + 1];
    if (c === "/" && n === "/") { while (i < code.length && code[i] !== "\n") i++; continue; }
    if (c === "/" && n === "*") { i += 2; while (i < code.length && !(code[i] === "*" && code[i + 1] === "/")) i++; i += 2; continue; }
    if (c === "\"" || c === "'") { const q = c; i++; while (i < code.length && code[i] !== q) { if (code[i] === "\\") i++; i++; } i++; out += "\"\""; continue; }
    if (c === "`") {
      i++;
      while (i < code.length && code[i] !== "`") {
        if (code[i] === "\\") { i += 2; continue; }
        if (code[i] === "$" && code[i + 1] === "{") { i += 2; out += " "; continue; }
        i++;
      }
      i++; continue;
    }
    if (c === "/") {
      const prevNonWs = out.trimEnd().slice(-1);
      if ("(=,[!&|?:;{}\n+".includes(prevNonWs) || out.trimEnd().endsWith("return")) {
        i++;
        while (i < code.length && code[i] !== "/") {
          if (code[i] === "\\") i++;
          else if (code[i] === "[") { i++; while (i < code.length && code[i] !== "]") { if (code[i] === "\\") i++; i++; } }
          i++;
        }
        i++; out += "/r/"; continue;
      }
    }
    out += c; i++;
  }
  const allowed = new Set([
    "Array", "ArrayBuffer", "AudioContext", "Blob", "Boolean", "CustomEvent", "Date", "Error",
    "Float32Array", "Image", "Int32Array", "Map", "Number", "Object", "Promise", "Proxy",
    "RTCPeerConnection", "RegExp", "ResizeObserver", "Set", "String", "TextDecoder",
    "TextEncoder", "TypeError", "Uint8Array", "URL", "URLSearchParams", "WeakMap", "WeakSet",
    "WebSocket", "Worker", "addEventListener", "alert", "atob", "btoa", "catch", "class",
    "clearInterval", "clearTimeout", "confirm", "console", "decodeURIComponent", "document",
    "encodeURIComponent", "fetch", "for", "function", "globalThis", "history", "if", "import",
    "innerHeight", "innerWidth", "isFinite", "isNaN", "localStorage", "location", "navigator",
    "new", "parseFloat", "parseInt", "performance", "prompt", "queueMicrotask",
    "requestAnimationFrame", "return", "setInterval", "setTimeout", "super", "switch", "throw",
    "typeof", "webkitAudioContext", "while", "await", "async",
  ]);
  const undeclared = [];
  for (const m of out.matchAll(/(?<![.$\w])([A-Za-z_][A-Za-z0-9_]{3,})\s*\(/g)) {
    const id = m[1];
    if (allowed.has(id)) continue;
    let p = m.index + m[0].length, depth = 1;
    while (p < out.length && depth > 0) {
      if (out[p] === "(") depth++;
      else if (out[p] === ")") depth--;
      p++;
    }
    while (p < out.length && /\s/.test(out[p])) p++;
    if (out[p] === "{") continue;
    undeclared.push(id);
  }
  assert.deepEqual(undeclared, [], `undeclared calls in src/main.js bundle: ${undeclared.join(", ")}`);

  const mainSrc = read("src/main.js");
  assert.match(mainSrc, /import\s*\{[\s\S]*\bcancelGuestHeld\b[\s\S]*\}\s*from\s*"\.\/sim\/multiplayer\.js"/);
  assert.match(mainSrc, /if\s*\(\s*latestSelf\.length\s*\)\s*applySelfShip\(\s*latestSelf\[0\]\s*\)/);
});

test("Bug A & B end-to-end (2026-11-27d): real src/main.js two-VM playtest covers KeyG docking, mission progress/hand-in, and undocked relog HUD/reticle", async () => {
  const esbuild = await import("esbuild");
  const vm = await import("node:vm");
  const shell = read("src/index.html");
  const bundle = await esbuild.build({
    stdin: {
      contents: `
        import "./src/main.js";
        import * as stateMod from "./src/state/state.js";
        import * as netSession from "./src/net/session.js";
        import * as mpUi from "./src/ui/multiplayer.js";
        import * as menuUi from "./src/ui/menu.js";
        import * as eventsMod from "./src/util/events.js";
        import * as placesMod from "./src/sim/places.js";
        import * as travelMod from "./src/sim/travel.js";
        import * as invMod from "./src/sim/inventory.js";
        globalThis.__APP = { stateMod, netSession, mpUi, menuUi, eventsMod, placesMod, travelMod, invMod };
      `,
      resolveDir: ROOT,
    },
    bundle: true,
    write: false,
    format: "iife",
    loader: { ".webp": "dataurl", ".glb": "dataurl", ".txt": "text" },
    plugins: [{
      name: "stub-gl-only",
      setup(build) {
        const map = {
          "render/scene.js": "scene-stub",
          "render/menuview.js": "menuview-stub",
          "render/gltf.js": "gltf-stub",
          "render/shipviewer.js": "shipviewer-stub",
          "core/audio.js": "audio-stub",
          "render/warpfx.js": "warpfx-stub",
          "render/views.js": "views-stub",
          "render/target-picking.js": "pick-stub",
          "ui/outfitting.js": "outfitting-stub",
          "ui/crash.js": "crash-stub",
        };
        build.onResolve({ filter: /^trystero$/ }, () => ({ path: "trystero-stub", namespace: "stub" }));
        build.onResolve({ filter: /^\./ }, args => {
          const abs = path.resolve(args.resolveDir, args.path).replace(/\\/g, "/");
          for (const [suffix, name] of Object.entries(map)) {
            if (abs.endsWith("/src/" + suffix)) return { path: name, namespace: "stub" };
          }
        });
        build.onLoad({ filter: /.*/, namespace: "stub" }, async args => {
          if (args.path === "trystero-stub") return { contents: "export function joinRoom(cfg, roomId){ return globalThis.__makeRoom(cfg, roomId); } export function getRelaySockets(){ return {}; }" };
          if (args.path === "scene-stub") return { contents: `
            import * as THREE from "three";
            export const renderer = { setPixelRatio(){}, setSize(){}, render(){}, domElement: document.createElement("canvas") };
            export const scene = new THREE.Scene();
            export const camera = new THREE.PerspectiveCamera(60, 1280/800, 0.1, 20000);
            export const stars = new THREE.Group();
            export const showPlace = () => {};
            export const stepScenery = () => {};
            export const updateScenery = () => {};
            export const forgetPlace = () => {};
          `, resolveDir: ROOT };
          if (args.path === "menuview-stub") return { contents: "export const updateMenuView=()=>{}; export const menuView=()=>({scene:{},camera:{}}); export const resizeMenuView=()=>{};" };
          if (args.path === "gltf-stub") return { contents: "export const instantiateModel=()=>null; export const modelTemplate=()=>null; export const spinNodes=()=>[]; export const engNodes=()=>[]; export const preloadAfterPaint=()=>Promise.resolve(); export const preloadModels=()=>Promise.resolve();" };
          if (args.path === "shipviewer-stub") return { contents: "export const createShipViewer=()=>({ render(){}, dispose(){}, resize(){}, setShip(){} });" };
          if (args.path === "audio-stub") return { contents: "export const updateAudio=()=>{}; export const initAudio=()=>{}; export const uiSound=()=>{}; export const hoverSound=()=>{}; export const isMuted=()=>false; export const toggleMute=()=>false; export const setAudioSuspended=()=>{};" };
          if (args.path === "warpfx-stub") return { contents: "export const setupWarpStreaks=()=>{}; export const updateWarpStreaks=()=>{};" };
          if (args.path === "views-stub") return { contents: `
            import * as THREE from "three";
            export const installEnemyViews=()=>{};
            export const updateEnemyViews=()=>{};
            export const updateEntityViews=()=>{};
            export const snapshotSimPoses=()=>{};
            export const snapRenderedPlayer=()=>{};
            export const renderPlayerPose=(P)=>({pos:P.pos,quat:P.quat,v:P.v});
            export const interpolatedPos=(o)=>o?.pos||new THREE.Vector3();
            export const interpolatedVelocity=(o)=>o?.v||new THREE.Vector3();
          `, resolveDir: ROOT };
          if (args.path === "pick-stub") return { contents: "export const pickLockSurface=()=>null;" };
          if (args.path === "outfitting-stub") return { contents: "export const updateOutfitting=()=>{}; export const mountOutfitting=()=>{};" };
          if (args.path === "crash-stub") return { contents: "export const installCrashNotice=()=>{}; export const reportCrash=(w,e)=>{ globalThis.__CRASHES.push([w, String(e)]); };" };
        });
      },
    }],
  });

  const code = bundle.outputFiles[0].text;
  const rooms = new Map();
  const roomByWho = new Map();
  function makeVirtualRoom(who, roomId) {
    const peerId = who + "-peer";
    const listeners = { join: [], leave: [], msg: [] };
    if (!rooms.has(roomId)) rooms.set(roomId, new Map());
    const peersMap = rooms.get(roomId);
    const api = {
      peerId,
      makeAction() {
        return {
          send(data, opts) {
            const target = opts?.target;
            for (const [id, other] of peersMap.entries()) {
              if (id === peerId) continue;
              if (target && id !== target) continue;
              queueMicrotask(() => other._deliver(data, peerId));
            }
            return Promise.resolve();
          },
          onMessage(fn) { listeners.msg.push(fn); },
        };
      },
      onPeerJoin(fn) { listeners.join.push(fn); },
      onPeerLeave(fn) { listeners.leave.push(fn); },
      onError() {},
      getPeers() {
        const o = {};
        for (const id of peersMap.keys()) if (id !== peerId) o[id] = { direct: true };
        return o;
      },
      leave() {
        peersMap.delete(peerId);
        for (const [, other] of peersMap.entries()) other._peerLeft(peerId);
      },
      _deliver(data, fromPeer) { for (const fn of listeners.msg) fn(data, { peerId: fromPeer }); },
      _peerJoined(id) { for (const fn of listeners.join) fn({ peerId: id }); },
      _peerLeft(id) { for (const fn of listeners.leave) fn({ peerId: id }); },
    };
    roomByWho.set(who, api);
    const existing = [...peersMap.keys()];
    peersMap.set(peerId, api);
    queueMicrotask(() => {
      for (const id of existing) { peersMap.get(id)?._peerJoined(peerId); api._peerJoined(id); }
    });
    return api;
  }

  const allIntervals = [];
  const allTimeouts = [];
  function bootInstance(who, existingStorage = null) {
    const storage = existingStorage || new Map();
    const winListeners = {};
    const elsById = new Map();
    function makeEl(tag = "div", id = "") {
      const elListeners = {};
      const el = {
        tagName: tag.toUpperCase(), id, hidden: false, type: "", checked: false,
        textContent: "", _innerHTML: "", value: "", dataset: {}, style: {}, children: [],
        parentElement: null, attributes: {},
        classList: {
          _s: new Set(),
          add(...xs) { xs.forEach(x => this._s.add(x)); },
          remove(...xs) { xs.forEach(x => this._s.delete(x)); },
          toggle(x, f) { const on = f === undefined ? !this._s.has(x) : !!f; if (on) this._s.add(x); else this._s.delete(x); return on; },
          contains(x) { return this._s.has(x); },
        },
        get innerHTML() { return this._innerHTML; },
        set innerHTML(v) {
          this._innerHTML = String(v);
          this.children = [];
          const stack = [this];
          const VOID = new Set(["input", "img", "br", "hr"]);
          for (const m of this._innerHTML.matchAll(/<(\/?)(\w+)([^>]*)>/g)) {
            const closing = !!m[1]; const t = m[2].toLowerCase(); const attrs = m[3];
            if (closing) { if (stack.length > 1) stack.pop(); continue; }
            const cid = (attrs.match(/\bid="([^"]+)"/) || [])[1] || "";
            const c = makeEl(t, cid);
            if (/\bhidden\b/.test(attrs)) c.hidden = true;
            const cls = (attrs.match(/\bclass="([^"]+)"/) || [])[1];
            if (cls) cls.split(/\s+/).forEach(x => x && c.classList.add(x));
            const typeM = attrs.match(/\btype="([^"]+)"/);
            if (typeM) c.type = typeM[1];
            for (const dm of attrs.matchAll(/\bdata-([a-z0-9-]+)="([^"]*)"/gi)) {
              c.dataset[dm[1].replace(/-([a-z])/g, (_, ch) => ch.toUpperCase())] = dm[2];
            }
            stack[stack.length - 1].appendChild(c);
            if (!VOID.has(t) && !attrs.endsWith("/")) stack.push(c);
          }
        },
        appendChild(c) { c.parentElement = this; this.children.push(c); return c; },
        prepend(c) { c.parentElement = this; this.children.unshift(c); return c; },
        append(...cs) { cs.forEach(c => this.appendChild(c)); },
        remove() {},
        addEventListener(t, fn) { (elListeners[t] ||= []).push(fn); },
        dispatchEvent(ev) { for (const fn of elListeners[ev.type] || []) fn(ev); },
        setAttribute(k, v) { this.attributes[k] = String(v); },
        getAttribute(k) { return this.attributes[k] ?? null; },
        contains(target) { return target === this || this.children.some(c => c.contains?.(target)); },
        querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
        querySelectorAll(sel) {
          const out = [];
          const walk = node => {
            for (const c of node.children || []) {
              let match = false;
              if (sel.startsWith("#")) match = c.id === sel.slice(1);
              else if (sel.startsWith(".")) match = c.classList.contains(sel.slice(1));
              else if (sel.startsWith("[")) {
                const dm = sel.match(/^\[data-([a-z0-9-]+)(?:="([^"]*)")?\]$/i);
                if (dm) {
                  const k = dm[1].replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
                  match = dm[2] === undefined ? (k in c.dataset) : c.dataset[k] === dm[2];
                }
              } else match = c.tagName === sel.toUpperCase();
              if (match) out.push(c);
              walk(c);
            }
          };
          walk(this);
          return out;
        },
        closest() { return null; },
        focus() { doc.activeElement = this; },
        blur() { if (doc.activeElement === this) doc.activeElement = doc.body; },
        select() {},
        getBoundingClientRect() { return { top: 0, left: 0, width: 100, height: 20 }; },
        getContext() { return { clearRect(){}, beginPath(){}, moveTo(){}, lineTo(){}, stroke(){}, save(){}, restore(){} }; },
      };
      if (id) elsById.set(id, el);
      return el;
    }
    for (const m of shell.matchAll(/<(\w+)\s+[^>]*id="([^"]+)"([^>]*)>/g)) {
      const el = makeEl(m[1], m[2]);
      if (/\bhidden\b/.test(m[0])) el.hidden = true;
    }
    const body = makeEl("body");
    const doc = {
      body, documentElement: { clientWidth: 1280, clientHeight: 800 }, activeElement: body,
      visibilityState: "visible", hidden: false,
      createElement: tag => makeEl(tag), createElementNS: (_ns, tag) => makeEl(tag),
      getElementById: id => elsById.get(id) || null, addEventListener() {},
    };
    const rafQueue = [];
    let simNow = 1000;
    const ctx = {
      __CRASHES: [], __makeRoom: (_cfg, roomId) => makeVirtualRoom(who, roomId),
      console,
      setTimeout: (fn, ms, ...a) => { const t = setTimeout(fn, ms, ...a); allTimeouts.push(t); return t; },
      clearTimeout,
      setInterval: (fn, ms, ...a) => { const t = setInterval(fn, ms, ...a); allIntervals.push(t); return t; },
      clearInterval, queueMicrotask, Promise,
      Math, Date, JSON, Object, Array, Map, Set, Number, String, Boolean, Error, TypeError, RegExp,
      Uint8Array, Float32Array, Int32Array, ArrayBuffer, URL, Blob, TextEncoder, TextDecoder,
      localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k), clear: () => storage.clear() },
      location: { href: "https://example.test/", search: "", hash: "" }, history: { replaceState() {} },
      innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1,
      performance: { now: () => simNow },
      requestAnimationFrame: fn => { rafQueue.push(fn); return rafQueue.length; },
      addEventListener(t, fn) { (winListeners[t] ||= []).push(fn); },
      document: doc, window: null, navigator: { clipboard: { writeText: async () => {} } }, crypto: globalThis.crypto,
    };
    ctx.window = ctx; ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    return {
      ctx, doc, elsById, storage,
      stepFrame(ms = 16.666) { simNow += ms; const b = rafQueue.splice(0); for (const fn of b) fn(simNow); },
      pressKey(c) { for (const fn of winListeners.keydown || []) fn({ code: c, repeat: false, altKey: false, target: doc.body, preventDefault() {} }); },
      releaseKey(c) { for (const fn of winListeners.keyup || []) fn({ code: c, altKey: false, target: doc.body, preventDefault() {} }); },
    };
  }

  try {
    const host = bootInstance("HOST");
    const guest = bootInstance("GUEST");
    const tick = async (g, n = 8) => {
      for (let i = 0; i < n; i++) {
        host.stepFrame(16.7);
        g.stepFrame(16.7);
        await new Promise(r => setTimeout(r, 12));
      }
    };

    host.ctx.__APP.netSession.setUsername("HostPilot");
    host.elsById.get("panel").dispatchEvent({ type: "click", target: { closest() { return { dataset: { a: "intro" }, disabled: false }; } }, preventDefault() {} });
    await new Promise(r => setTimeout(r, 15));
    await host.ctx.__APP.netSession.hostWorld({ name: "HostPilot" });
    const link = host.ctx.__APP.netSession.currentLink().link;

    guest.ctx.__APP.netSession.setUsername("GuestPilot");
    await guest.ctx.__APP.netSession.joinWorld({ link });
    await tick(guest, 4);
    assert.equal(await guest.ctx.__APP.mpUi.act("bring"), true);
    await tick(guest, 6);

    // Accept contract & launch
    const cr0 = guest.ctx.__APP.stateMod.state.profile.cr;
    guest.ctx.__APP.netSession.requestGuestAction({ op: "acc", slot: 0 });
    await tick(guest, 6);
    const gm = host.ctx.__APP.stateMod.state.players[1].profile.missions[0];
    assert.ok(gm, "guest accepted mission on host");

    guest.elsById.get("panel").dispatchEvent({ type: "click", target: { closest() { return { dataset: { a: "go" }, disabled: false }; } }, preventDefault() {} });
    await tick(guest, 8);
    assert.equal(guest.ctx.__APP.stateMod.localPlayer().docked, false);

    // Simulate guest flight & mission progress, then press G near Meridian Station!
    const P = host.ctx.__APP.stateMod.state.players[1];
    const W = host.ctx.__APP.stateMod.placeWorld("reach");
    if (gm.type === "salvage") {
      for (const c of W.crates.filter(c => c.missionId === gm.id)) { P.pos.copy(c.pos); await tick(guest, 3); }
    } else if (gm.type === "mine") {
      // Tier-3 mining contracts can exceed a Wasp's 20 m³ hold, so a pilot delivers across trips
      // (ship hold + station storage) just as `handInRequirements` checks both.
      const toShip = Math.min(gm.n, 10);
      host.ctx.__APP.invMod.addItem(P.profile.ship, gm.o, toShip, P.profile, P.guestWorld);
      if (gm.n > toShip) {
        host.ctx.__APP.invMod.addItem("station", gm.o, gm.n - toShip, P.profile, P.guestWorld);
      }
      host.ctx.__APP.eventsMod.emit("mined", { item: gm.o, ore: gm.o, amount: gm.n, player: P });
    } else if (gm.type === "hunt") {
      for (let round = 0; round < 6; round++) {
        const foes = [...W.enemies].filter(e =>
          (e.missionId === gm.id || e.encounter === `mission:${gm.id}`) && e.hp > 0
        );
        if (!foes.length) break;
        for (const e of foes) {
          e.hp = 0;
          host.ctx.__APP.eventsMod.emit("enemy-killed", {
            def: e.def, faction: e.faction, enemy: e, byPlayer: P, player: P,
            place: e.place || "reach", encounter: e.encounter, missionOwner: e.missionOwner,
          });
        }
        await tick(guest, 4);
      }
    }
    const st = host.ctx.__APP.placesMod.stationAt("reach");
    P.pos.set(...st.launch.pos);
    P.v.set(0, 0, 0);
    await tick(guest, 6);
    assert.match(guest.elsById.get("pr").textContent, /Press G to dock at Meridian Station/);

    // Bug A: pressing KeyG must NOT throw inside mp-guest-dock; guest docks and HUD hides.
    P.guestHeld = { item: "ferrite", count: 1, from: { kind: "ship", index: 0 } };
    guest.pressKey("KeyG");
    guest.releaseKey("KeyG");
    await tick(guest, 8);
    assert.equal(guest.ctx.__APP.stateMod.localPlayer().docked, true, "KeyG docked guest");
    assert.equal(P.docked, true, "host docked guest");
    assert.equal(P.guestHeld, null, "cancelGuestHeld cleared held cursor item on dock");
    assert.equal(guest.elsById.get("hud").hidden, true, "HUD hidden after KeyG dock");
    assert.equal(guest.elsById.get("panel").hidden, false, "station panel shown after KeyG dock");

    // Hand in completed mission
    guest.ctx.__APP.netSession.requestGuestAction({ op: "done", id: gm.id });
    await tick(guest, 8);
    assert.equal(guest.ctx.__APP.stateMod.state.profile.cr, cr0 + gm.r, "guest received mission reward");
    assert.equal(guest.ctx.__APP.stateMod.state.profile.missions.length, 0, "guest mission cleared after hand-in");

    // Launch again, fly out, drop peer abruptly (`room.leave()`), and relog in GUEST2!
    guest.elsById.get("panel").dispatchEvent({ type: "click", target: { closest() { return { dataset: { a: "go" }, disabled: false }; } }, preventDefault() {} });
    await tick(guest, 8);
    guest.pressKey("KeyW"); await tick(guest, 10); guest.releaseKey("KeyW");
    guest.pressKey("KeyX"); await tick(guest, 10); guest.releaseKey("KeyX");
    await tick(guest, 6);
    const posAtDrop = host.ctx.__APP.stateMod.state.players[1].pos.toArray();
    roomByWho.get("GUEST").leave();
    await tick(guest, 4);

    // Bug B: fresh GUEST2 joins while undocked (`mp-visit` arrives before `join-world`); HUD & reticle MUST show!
    const guest2 = bootInstance("GUEST2", new Map(guest.storage));
    guest2.ctx.__APP.netSession.setUsername("GuestPilot");
    await guest2.ctx.__APP.netSession.joinWorld({ link });
    await tick(guest2, 8);
    assert.equal(await guest2.ctx.__APP.mpUi.act("join-world"), true);
    await tick(guest2, 8);

    const g2p = guest2.ctx.__APP.stateMod.localPlayer();
    assert.equal(g2p.docked, false, "GUEST2 relogged undocked");
    assert.ok(Math.hypot(g2p.pos.x - posAtDrop[0], g2p.pos.y - posAtDrop[1], g2p.pos.z - posAtDrop[2]) < 1, "GUEST2 restored flight position");
    assert.equal(guest2.elsById.get("hud").hidden, false, "Bug B fixed: HUD visible on undocked relog");
    assert.equal(guest2.elsById.get("mk").style.display, "", "world markers visible on undocked relog");
    assert.equal(guest2.doc.body.classList.contains("no-reticle"), false, "Bug B fixed: reticle enabled on undocked relog");
    assert.equal(guest2.doc.body.classList.contains("pilot-pointer"), true, "flight pointer enabled on undocked relog");
    assert.equal(guest2.elsById.get("panel").hidden, true, "station panel hidden on undocked relog");
    assert.ok(guest2.elsById.get("weapon-slots").innerHTML.length > 0, "weapon slots rendered on undocked relog");

    // Relogged GUEST2 can also KeyG dock cleanly
    guest2.pressKey("KeyG");
    guest2.releaseKey("KeyG");
    await tick(guest2, 8);
    assert.equal(guest2.ctx.__APP.stateMod.localPlayer().docked, true, "relogged GUEST2 docks on KeyG");
    assert.equal(guest2.elsById.get("hud").hidden, true);
    assert.equal(guest2.elsById.get("panel").hidden, false);

    assert.deepEqual(host.ctx.__CRASHES, []);
    assert.deepEqual(guest.ctx.__CRASHES, []);
    assert.deepEqual(guest2.ctx.__CRASHES, []);
  } finally {
    for (const t of allIntervals) clearInterval(t);
    for (const t of allTimeouts) clearTimeout(t);
  }
});

/* ------------------------------------------------------------------------- */
/* 2026-11-27e fixes:                                                        */
/*   1. Host background keepalive (data: worker / AudioWorklet / interval),  */
/*      curated 10-relay list & warnOnRelayFailure = false,                  */
/*   2. Guest Launch freeze skip, mid-flight power preserve, Launch/Warp msg */
/*   3. Mining beam beamT/hint/power wire + HUD beam slot + syncPocketRocks  */
/*   4. Remote-pocket flight() collision + clearNetEntities loaded = false   */
/* ------------------------------------------------------------------------- */

test("2026-11-27e (prompts & pocket collision): sayForPlayer isolates guest prompts & expires cleanly; remote-pocket flight collides with P.place rocks", () => {
  applySave(newRootSave());
  resetPlaces();
  resetGuests();
  state.place = DEFAULT_PLACE;
  state.time = 10;
  state.hud.prompt = "";
  const localP = createPlayer();
  const guestP = createPlayerRecord();
  guestP.id = 99;
  guestP.guestId = "guest-p";
  guestP.place = "solace";
  guestP.docked = false;
  guestP.profile = newProfile("Guest");
  guestP.configured = true;
  guestP.drive = { spd: 200, rev: 60, side: 60, turn: 2, boost: 400, draw: 2, bmax: 10, buse: 2, bfill: 1, ignite: 20 };
  guestP.power = { cap: 60, stored: 60, gen: 12, draw: 0, use: { drive: 0, shield: 0, guns: 0, beam: 0 } };
  guestP.controls = neutralControls();
  state.players.length = 0;
  state.players.push(localP, guestP);
  state.localPlayerIndex = 0;

  sayForPlayer(guestP, "Beam contact lost — the ore starts again", 0.35);
  assert.equal(state.hud.prompt, "", "guest prompt does not overwrite host local HUD prompt");
  assert.equal(guestP.hudPrompt, "Beam contact lost — the ore starts again");
  assert.ok(guestP.hudPromptUntil > state.time);

  // Local player writes straight to state.hud.prompt
  sayForPlayer(localP, "Host prompt");
  assert.equal(state.hud.prompt, "Host prompt");

  // stepSim expires guest hudPrompt once hudPromptUntil passes
  stepSim(0.5);
  assert.equal(guestP.hudPrompt, "");

  // Remote-pocket collision: guest in "solace" hits a rock placed ONLY in placeWorld("solace"), not state.world!
  const remoteW = placeWorld("solace");
  remoteW.asteroids.length = 0;
  addEntity(remoteW.asteroids, {
    kind: "rock",
    place: "solace",
    type: "ferrite",
    shape: 0,
    pos: V(0, 0, -25),
    quat: Q(),
    scale: V(15, 15, 15),
    s0: V(15, 15, 15),
    r: 15,
    ore: 20,
    max: 20,
  });
  guestP.pos.set(0, 0, -14);
  guestP.v.set(0, 0, -100);
  flight(0.05, guestP);
  assert.ok(guestP.v.z > -100 || guestP.pos.z > -15, "guest ship bounces off remote-pocket rock in placeWorld(P.place)");

  resetGuests();
});

test("2026-11-27e (rocks & net reset): syncPocketRocks updates ore/scale in place without double-spawning and clearNetEntities resets container.loaded", () => {
  applySave(newRootSave());
  resetPlaces();
  const pocket = DEFAULT_PLACE;
  const W = placeWorld(pocket);
  const c = state.places.get(pocket);

  // Simulate host rock state before guest loads pocket locally
  const rockA = { id: 41, type: "ferrite", shape: 1, r: 14, ore: 18, max: 30, pos: [100, 0, 0], quat: [0, 0, 0, 1], s0: [14, 14, 14], scale: [11, 11, 11] };
  const rockB = { id: 42, type: "cobalt", shape: 2, r: 12, ore: 20, max: 20, pos: [300, 0, 0], quat: [0, 0, 0, 1], s0: [12, 12, 12], scale: [12, 12, 12] };
  syncPocketRocks(W, [rockA, rockB], pocket);
  assert.equal(W.asteroids.length, 2);
  const recA = W.asteroids.find(r => r._hostId === 41);
  assert.ok(recA && recA._net === true);

  // Entering the pocket afterwards via loadPlace must NOT duplicate local rocks over _net rocks
  loadPlace(pocket);
  assert.equal(W.asteroids.length, 2, "loadPlace skips populateField when _net rocks are already present");
  assert.equal(c.loaded, true);

  // Subsequent shrink keeps exact same entity object identity, and depletion removes rockB
  syncPocketRocks(W, [{ ...rockA, ore: 6, scale: [8.5, 8.5, 8.5] }], pocket);
  assert.equal(W.asteroids.length, 1);
  assert.strictEqual(W.asteroids[0], recA, "shrinking rock reuses existing object identity");
  assert.equal(recA.ore, 6);
  assert.equal(recA.scale.x, 8.5);

  // Leaving host resets _net rocks and container.loaded so home belt repopulates cleanly
  clearNetEntities();
  assert.equal(W.asteroids.length, 0);
  assert.equal(c.loaded, false);
  loadPlace(pocket);
  assert.ok(W.asteroids.length > 0, "returning home freshly repopulates local asteroids");
});

test("2026-11-27e (relays, transport, HUD & menu guards): curated relays, warnOnRelayFailure, primarySlotIndex beam matching, and netRequestDock", () => {
  assert.equal(RELAYS.relayUrls.length, 10);
  for (const url of RELAYS.relayUrls) assert.match(url, /^wss:\/\//);
  for (const noisy of ["wss://relay.damus.io", "wss://relay.nostr.band", "wss://nostr.bitcoiner.social", "wss://relay.wellorder.org"]) {
    assert.equal(RELAYS.relayUrls.includes(noisy), false, `${noisy} dropped from default relay list`);
  }

  const transportSrc = read("src/net/transport.js");
  assert.match(transportSrc, /warnOnRelayFailure\s*=\s*false/);
  const hudSrc = read("src/ui/hud.js");
  assert.match(hudSrc, /primarySlotIndex\(\s*S\.pw\s*,\s*P\s*\)/);
  const menuSrc = read("src/ui/menu.js");
  assert.match(menuSrc, /if\s*\(\s*state\.away\s*\)\s*\{[^}]*netRequestDock\(\)/);
});

test("2026-11-27e end-to-end: real src/main.js two-VM guest Launch/power/mining-beam-HUD/rock-depletion and host background keepalive", async () => {
  const esbuild = await import("esbuild");
  const vm = await import("node:vm");
  const shell = read("src/index.html");
  const bundle = await esbuild.build({
    stdin: {
      contents: `
        import "./src/main.js";
        import * as stateMod from "./src/state/state.js";
        import * as netSession from "./src/net/session.js";
        import * as mpUi from "./src/ui/multiplayer.js";
        import * as eventsMod from "./src/util/events.js";
        import * as placesMod from "./src/sim/places.js";
        import * as invMod from "./src/sim/inventory.js";
        import * as worldMod from "./src/sim/world.js";
        globalThis.__APP = { stateMod, netSession, mpUi, eventsMod, placesMod, invMod, worldMod };
      `,
      resolveDir: ROOT,
    },
    bundle: true,
    write: false,
    format: "iife",
    loader: { ".webp": "dataurl", ".glb": "dataurl", ".txt": "text" },
    plugins: [{
      name: "stub-gl-only",
      setup(build) {
        const map = {
          "render/scene.js": "scene-stub",
          "render/menuview.js": "menuview-stub",
          "render/gltf.js": "gltf-stub",
          "render/shipviewer.js": "shipviewer-stub",
          "core/audio.js": "audio-stub",
          "render/warpfx.js": "warpfx-stub",
          "render/views.js": "views-stub",
          "render/target-picking.js": "pick-stub",
          "ui/outfitting.js": "outfitting-stub",
          "ui/crash.js": "crash-stub",
        };
        build.onResolve({ filter: /^trystero$/ }, () => ({ path: "trystero-stub", namespace: "stub" }));
        build.onResolve({ filter: /^\./ }, args => {
          const abs = path.resolve(args.resolveDir, args.path).replace(/\\/g, "/");
          for (const [suffix, name] of Object.entries(map)) {
            if (abs.endsWith("/src/" + suffix)) return { path: name, namespace: "stub" };
          }
        });
        build.onLoad({ filter: /.*/, namespace: "stub" }, async args => {
          if (args.path === "trystero-stub") return { contents: "export function joinRoom(cfg, roomId){ return globalThis.__makeRoom(cfg, roomId); } export function getRelaySockets(){ return {}; }" };
          if (args.path === "scene-stub") return { contents: `
            import * as THREE from "three";
            export const renderer = { setPixelRatio(){}, setSize(){}, render(){}, domElement: document.createElement("canvas") };
            export const scene = new THREE.Scene();
            export const camera = new THREE.PerspectiveCamera(60, 1280/800, 0.1, 20000);
            export const stars = new THREE.Group();
            export const showPlace = () => {};
            export const stepScenery = () => {};
            export const updateScenery = () => {};
            export const forgetPlace = () => {};
          `, resolveDir: ROOT };
          if (args.path === "menuview-stub") return { contents: "export const updateMenuView=()=>{}; export const menuView=()=>({scene:{},camera:{}}); export const resizeMenuView=()=>{};" };
          if (args.path === "gltf-stub") return { contents: "export const instantiateModel=()=>null; export const modelTemplate=()=>null; export const spinNodes=()=>[]; export const engNodes=()=>[]; export const preloadAfterPaint=()=>Promise.resolve(); export const preloadModels=()=>Promise.resolve();" };
          if (args.path === "shipviewer-stub") return { contents: "export const createShipViewer=()=>({ render(){}, dispose(){}, resize(){}, setShip(){} });" };
          if (args.path === "audio-stub") return { contents: "export const updateAudio=()=>{}; export const initAudio=()=>{}; export const uiSound=()=>{}; export const hoverSound=()=>{}; export const isMuted=()=>false; export const toggleMute=()=>false; export const setAudioSuspended=()=>{};" };
          if (args.path === "warpfx-stub") return { contents: "export const setupWarpStreaks=()=>{}; export const updateWarpStreaks=()=>{};" };
          if (args.path === "views-stub") return { contents: `
            import * as THREE from "three";
            export const installEnemyViews=()=>{};
            export const updateEnemyViews=()=>{};
            export const updateEntityViews=()=>{};
            export const snapshotSimPoses=()=>{};
            export const snapRenderedPlayer=()=>{};
            export const renderPlayerPose=(P)=>({pos:P.pos,quat:P.quat,v:P.v});
            export const interpolatedPos=(o)=>o?.pos||new THREE.Vector3();
            export const interpolatedVelocity=(o)=>o?.v||new THREE.Vector3();
          `, resolveDir: ROOT };
          if (args.path === "pick-stub") return { contents: "export const pickLockSurface=()=>null;" };
          if (args.path === "outfitting-stub") return { contents: "export const updateOutfitting=()=>{}; export const mountOutfitting=()=>{};" };
          if (args.path === "crash-stub") return { contents: "export const installCrashNotice=()=>{}; export const reportCrash=(w,e)=>{ globalThis.__CRASHES.push([w, String(e)]); };" };
        });
      },
    }],
  });

  const code = bundle.outputFiles[0].text;
  const rooms = new Map();
  function makeVirtualRoom(who, roomId) {
    const peerId = who + "-peer";
    const listeners = { join: [], leave: [], msg: [] };
    if (!rooms.has(roomId)) rooms.set(roomId, new Map());
    const peersMap = rooms.get(roomId);
    const api = {
      peerId,
      makeAction() {
        return {
          send(data, opts) {
            const target = opts?.target;
            for (const [id, other] of peersMap.entries()) {
              if (id === peerId) continue;
              if (target && id !== target) continue;
              queueMicrotask(() => other._deliver(data, peerId));
            }
            return Promise.resolve();
          },
          onMessage(fn) { listeners.msg.push(fn); },
        };
      },
      onPeerJoin(fn) { listeners.join.push(fn); },
      onPeerLeave(fn) { listeners.leave.push(fn); },
      onError() {},
      getPeers() {
        const o = {};
        for (const id of peersMap.keys()) if (id !== peerId) o[id] = { direct: true };
        return o;
      },
      leave() {
        peersMap.delete(peerId);
        for (const [, other] of peersMap.entries()) other._peerLeft(peerId);
      },
      _deliver(data, fromPeer) { for (const fn of listeners.msg) fn(data, { peerId: fromPeer }); },
      _peerJoined(id) { for (const fn of listeners.join) fn({ peerId: id }); },
      _peerLeft(id) { for (const fn of listeners.leave) fn({ peerId: id }); },
    };
    const existing = [...peersMap.keys()];
    peersMap.set(peerId, api);
    queueMicrotask(() => {
      for (const id of existing) { peersMap.get(id)?._peerJoined(peerId); api._peerJoined(id); }
    });
    return api;
  }

  const allIntervals = [];
  const allTimeouts = [];
  function bootInstance(who) {
    const storage = new Map();
    const winListeners = {};
    const docListeners = {};
    const elsById = new Map();
    function makeEl(tag = "div", id = "") {
      const elListeners = {};
      const el = {
        tagName: tag.toUpperCase(), id, hidden: false, type: "", checked: false,
        textContent: "", _innerHTML: "", value: "", dataset: {}, style: {}, children: [],
        parentElement: null, attributes: {},
        classList: {
          _s: new Set(),
          add(...xs) { xs.forEach(x => this._s.add(x)); },
          remove(...xs) { xs.forEach(x => this._s.delete(x)); },
          toggle(x, f) { const on = f === undefined ? !this._s.has(x) : !!f; if (on) this._s.add(x); else this._s.delete(x); return on; },
          contains(x) { return this._s.has(x); },
        },
        get innerHTML() { return this._innerHTML; },
        set innerHTML(v) {
          this._innerHTML = String(v);
          this.children = [];
          const stack = [this];
          const VOID = new Set(["input", "img", "br", "hr"]);
          for (const m of this._innerHTML.matchAll(/<(\/?)(\w+)([^>]*)>/g)) {
            const closing = !!m[1]; const t = m[2].toLowerCase(); const attrs = m[3];
            if (closing) { if (stack.length > 1) stack.pop(); continue; }
            const cid = (attrs.match(/\bid="([^"]+)"/) || [])[1] || "";
            const c = makeEl(t, cid);
            if (/\bhidden\b/.test(attrs)) c.hidden = true;
            const cls = (attrs.match(/\bclass="([^"]+)"/) || [])[1];
            if (cls) cls.split(/\s+/).forEach(x => x && c.classList.add(x));
            for (const dm of attrs.matchAll(/\bdata-([a-z0-9-]+)="([^"]*)"/gi)) {
              c.dataset[dm[1].replace(/-([a-z])/g, (_, ch) => ch.toUpperCase())] = dm[2];
            }
            stack[stack.length - 1].appendChild(c);
            if (!VOID.has(t) && !attrs.endsWith("/")) stack.push(c);
          }
        },
        appendChild(c) { c.parentElement = this; this.children.push(c); return c; },
        prepend(c) { c.parentElement = this; this.children.unshift(c); return c; },
        append(...cs) { cs.forEach(c => this.appendChild(c)); },
        remove() {},
        addEventListener(t, fn) { (elListeners[t] ||= []).push(fn); },
        dispatchEvent(ev) { for (const fn of elListeners[ev.type] || []) fn(ev); },
        setAttribute(k, v) { this.attributes[k] = String(v); },
        getAttribute(k) { return this.attributes[k] ?? null; },
        contains(target) { return target === this || this.children.some(c => c.contains?.(target)); },
        querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
        querySelectorAll(sel) {
          const out = [];
          const walk = node => {
            for (const c of node.children || []) {
              let match = false;
              if (sel.startsWith("#")) match = c.id === sel.slice(1);
              else if (sel.startsWith(".")) match = c.classList.contains(sel.slice(1));
              else match = c.tagName === sel.toUpperCase();
              if (match) out.push(c);
              walk(c);
            }
          };
          walk(this);
          return out;
        },
        closest() { return null; },
        focus() { doc.activeElement = this; },
        blur() { if (doc.activeElement === this) doc.activeElement = doc.body; },
        select() {},
        getBoundingClientRect() { return { top: 0, left: 0, width: 100, height: 20 }; },
        getContext() { return { clearRect(){}, beginPath(){}, moveTo(){}, lineTo(){}, stroke(){}, save(){}, restore(){} }; },
      };
      if (id) elsById.set(id, el);
      return el;
    }
    for (const m of shell.matchAll(/<(\w+)\s+[^>]*id="([^"]+)"([^>]*)>/g)) {
      const el = makeEl(m[1], m[2]);
      if (/\bhidden\b/.test(m[0])) el.hidden = true;
    }
    const body = makeEl("body");
    const doc = {
      body, documentElement: { clientWidth: 1280, clientHeight: 800 }, activeElement: body,
      visibilityState: "visible", hidden: false,
      createElement: tag => makeEl(tag), createElementNS: (_ns, tag) => makeEl(tag),
      getElementById: id => elsById.get(id) || null,
      addEventListener(t, fn) { (docListeners[t] ||= []).push(fn); },
    };
    const rafQueue = [];
    let simNow = 1000;
    const ctx = {
      __CRASHES: [], __makeRoom: (_cfg, roomId) => makeVirtualRoom(who, roomId),
      console,
      setTimeout: (fn, ms, ...a) => { const t = setTimeout(fn, ms, ...a); allTimeouts.push(t); return t; },
      clearTimeout,
      setInterval: (fn, ms, ...a) => { const t = setInterval(fn, ms, ...a); allIntervals.push(t); return t; },
      clearInterval, queueMicrotask, Promise,
      Math, Date, JSON, Object, Array, Map, Set, Number, String, Boolean, Error, TypeError, RegExp,
      Uint8Array, Float32Array, Int32Array, ArrayBuffer, URL, Blob, TextEncoder, TextDecoder,
      localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k), clear: () => storage.clear() },
      location: { href: "https://example.test/", search: "", hash: "" }, history: { replaceState() {} },
      innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1,
      performance: { now: () => simNow },
      requestAnimationFrame: fn => { rafQueue.push(fn); return rafQueue.length; },
      addEventListener(t, fn) { (winListeners[t] ||= []).push(fn); },
      document: doc, window: null, navigator: { clipboard: { writeText: async () => {} } }, crypto: globalThis.crypto,
    };
    ctx.window = ctx; ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    return {
      ctx, doc, elsById,
      stepFrame(ms = 16.666) { simNow += ms; const b = rafQueue.splice(0); for (const fn of b) fn(simNow); },
      pressKey(c) { for (const fn of winListeners.keydown || []) fn({ code: c, repeat: false, altKey: false, target: doc.body, preventDefault() {} }); },
      releaseKey(c) { for (const fn of winListeners.keyup || []) fn({ code: c, altKey: false, target: doc.body, preventDefault() {} }); },
      mouseDown(btn = 0) { for (const fn of winListeners.mousedown || []) fn({ button: btn, target: doc.body, preventDefault() {} }); },
      mouseUp(btn = 0) { for (const fn of winListeners.mouseup || []) fn({ button: btn, target: doc.body, preventDefault() {} }); },
      setHidden(v) {
        doc.visibilityState = v ? "hidden" : "visible";
        doc.hidden = !!v;
        for (const fn of docListeners.visibilitychange || []) fn({});
      },
      advanceClockOnly(ms) { simNow += ms; },
    };
  }

  try {
    const host = bootInstance("HOST");
    const guest = bootInstance("GUEST");
    const tick = async (n = 8) => {
      for (let i = 0; i < n; i++) {
        host.stepFrame(16.7);
        guest.stepFrame(16.7);
        await new Promise(r => setTimeout(r, 12));
      }
    };

    host.ctx.__APP.netSession.setUsername("HostPilot");
    host.elsById.get("panel").dispatchEvent({ type: "click", target: { closest() { return { dataset: { a: "intro" }, disabled: false }; } }, preventDefault() {} });
    await new Promise(r => setTimeout(r, 15));
    await host.ctx.__APP.netSession.hostWorld({ name: "HostPilot" });
    const link = host.ctx.__APP.netSession.currentLink().link;

    // Host background keepalive fires host-keepalive-tick when rAF stalls (hidden tab > 80ms)
    let keepaliveTicks = 0;
    host.ctx.__APP.eventsMod.on("host-keepalive-tick", () => { keepaliveTicks++; });
    host.setHidden(true);
    host.advanceClockOnly(120);
    await new Promise(r => setTimeout(r, 45));
    assert.ok(keepaliveTicks >= 1, "hidden host advances sim and emits host-keepalive-tick via keepalive timer");
    host.setHidden(false);

    guest.ctx.__APP.netSession.setUsername("GuestPilot");
    await guest.ctx.__APP.netSession.joinWorld({ link });
    await tick(4);
    assert.equal(await guest.ctx.__APP.mpUi.act("bring"), true);
    await tick(6);

    // Equip mining beam in slot 2 (index 1) for guest so primarySlotIndex matching is exercised!
    const hostGuestP = host.ctx.__APP.stateMod.state.players[1];
    host.ctx.__APP.invMod.addItem("station", "beam_basic", 1, hostGuestP.profile, hostGuestP.guestWorld);
    guest.ctx.__APP.netSession.requestGuestAction({ op: "invEquip", where: "station", slot: -1, id: "beam_basic" });
    await tick(6);

    // Launch via station button -> must stay undocked even if buffered docked:true sample arrives
    guest.elsById.get("panel").dispatchEvent({ type: "click", target: { closest() { return { dataset: { a: "go" }, disabled: false }; } }, preventDefault() {} });
    // Inject a stale buffered docked:true frame into mp-self-ship immediately after launch
    host.ctx.__APP.eventsMod.emit; // noop sanity
    guest.ctx.__APP.eventsMod.emit("mp-self-ship", { ship: { id: hostGuestP.guestId, place: "reach", docked: true, pos: [0, 0, 0], quat: [0, 0, 0, 1], velocity: [0, 0, 0] }, at: Date.now() - 10 });
    await tick(10);
    const gLocal = guest.ctx.__APP.stateMod.localPlayer();
    assert.equal(gLocal.docked, false, "Launch keeps guest undocked without snapping back to stale docked frame");

    // Verify guest controls drive ship forward after launch (not frozen!)
    const posBeforeMove = hostGuestP.pos.clone();
    guest.pressKey("KeyW");
    await tick(30);
    guest.releaseKey("KeyW");
    assert.ok(hostGuestP.pos.distanceTo(posBeforeMove) > 0.5 && hostGuestP.v.length() > 1, "guest launches and moves freely via controls");

    // Verify mid-flight power & energy are preserved across mp-visit updates
    hostGuestP.power.stored = hostGuestP.power.cap * 0.4;
    hostGuestP.en = hostGuestP.enMax * 0.35;
    await tick(8);
    gLocal.power.stored = gLocal.power.cap * 0.4;
    gLocal.en = gLocal.enMax * 0.35;
    guest.ctx.__APP.netSession.requestGuestAction({ op: "pw", slot: 1 });
    await tick(8);
    assert.ok(gLocal.power.stored < gLocal.power.cap * 0.9, "mid-flight mp-visit preserves depleted power instead of refilling to 100%");
    assert.ok(gLocal.en < gLocal.enMax * 0.9, "mid-flight mp-visit preserves depleted boost energy");

    // Place a host asteroid directly in front of guest's nose & fire mining beam in slot 2
    const hostW = host.ctx.__APP.stateMod.placeWorld("reach");
    const targetRock = hostW.asteroids[0];
    assert.ok(targetRock, "reach has asteroids on host");
    targetRock.ore = 5;
    targetRock.max = 10;
    hostGuestP.power.stored = hostGuestP.power.cap;
    hostGuestP.quat.set(0, 0, 0, 1);
    hostGuestP.v.set(0, 0, 0);
    hostGuestP.pos.set(targetRock.pos.x, targetRock.pos.y, targetRock.pos.z + targetRock.r + 35);
    await tick(6);

    guest.mouseDown(0);
    await tick(20);
    assert.equal(hostGuestP.flight.beamOn, true, "host fires guest's mining beam in slot 2");
    assert.ok(hostGuestP.flight.beamT > 0.1, "host advances guest beamT");
    await tick(16);
    assert.equal(guest.ctx.__APP.stateMod.state.flight.beamOn, true, "guest draws mining beam");
    assert.ok(guest.ctx.__APP.stateMod.state.flight.beamT > 0, "guest receives beamT progress");
    assert.equal(guest.elsById.get("bm").hidden, false, "guest HUD #bm progress bar visible");
    assert.notEqual(guest.elsById.get("bmbar").style.width, "0%", "guest HUD #bmbar fills during mining");
    assert.match(guest.elsById.get("pr").textContent, /Hold to mine|left/, "guest HUD #pr shows live mining hint");

    // Release beam mid-cut -> guest sees contact-lost hint, which expires afterwards
    guest.mouseUp(0);
    for (let k = 0; k < 18; k++) {
      host.stepFrame(4);
      guest.stepFrame(4);
      await new Promise(r => setTimeout(r, 15));
      if (/Beam contact lost/.test(guest.elsById.get("pr").textContent)) break;
    }
    assert.match(guest.elsById.get("pr").textContent, /Beam contact lost/, "guest HUD receives timed beam contact-lost prompt");
    await tick(36);
    assert.equal(guest.elsById.get("pr").textContent, "", "guest HUD timed contact-lost prompt expires");

    // Deplete the rock on host and confirm host asteroid disappearance syncs to guest world
    const rockId = targetRock.id;
    host.ctx.__APP.worldMod.dropEntity ? null : null;
    hostW.asteroids.splice(hostW.asteroids.indexOf(targetRock), 1);
    await tick(10);
    const guestW = guest.ctx.__APP.stateMod.placeWorld("reach");
    assert.equal(guestW.asteroids.some(r => r._hostId === rockId), false, "depleted host rock disappears from guest world");

    assert.deepEqual(host.ctx.__CRASHES, []);
    assert.deepEqual(guest.ctx.__CRASHES, []);
  } finally {
    for (const t of allIntervals) clearInterval(t);
    for (const t of allTimeouts) clearTimeout(t);
  }
});
