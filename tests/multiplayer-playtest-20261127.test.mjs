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

import { state, applySave, newRootSave, currentSave, placeWorld, resetPlaces } from "../src/state/state.js";
import { SAVE_VERSION, newProfile, newWorld, sanitizeSave, cleanVisitState } from "../src/state/profile.js";
import { DEFAULT_PLACE, stationKeyAt, setPlaceCatalog } from "../src/data/places.js";
import { generateGalaxy } from "../src/sim/galaxy.js";
import { V } from "../src/util/math.js";
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
import { createPlayer } from "../src/sim/player.js";
import { enterPlace, stationAt } from "../src/sim/places.js";
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
