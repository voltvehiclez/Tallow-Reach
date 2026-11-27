// Regression tests for multiplayer guest ship, station, inventory/fitting,
// mission/owner isolation, and frozen-home custody separation.
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

import { state, applySave, newRootSave, saveCurrentGame, placeWorld, resetPlaces } from "../src/state/state.js";
import { SAVE_VERSION, newProfile, newWorld } from "../src/state/profile.js";
import { DEFAULT_PLACE, stationKeyAt } from "../src/data/places.js";
import { STORY_MISSIONS } from "../src/data/missions/index.js";
import { on, emit } from "../src/util/events.js";
import { KINDS, ACT_OPS, cleanMessage, readMessage, LIMITS } from "../src/net/protocol.js";
import {
  createGuestWorld,
  cancelGuestHeld,
  guestProfileSnapshot,
  guestLockerSnapshot,
  runGuestAction,
} from "../src/sim/guest-actions.js";
import {
  arriveGuest,
  executeGuestAction,
  leaveGuest,
  guestRecordOf,
  resetGuests,
} from "../src/sim/multiplayer.js";
import { createPlayer } from "../src/sim/player.js";
import { enterPlace } from "../src/sim/places.js";
import { launch } from "../src/sim/session.js";
import { acceptContract, completeContract } from "../src/sim/contracts.js";
import { acceptMission, instantiateMission } from "../src/sim/missions.js";
import { objectObjectiveColor, missionTravelTargets } from "../src/ui/mission-hud.js";
import { syncPocketEntities } from "../src/render/entitystream.js";
import { hostProfile } from "../src/net/custody.js";
import * as session from "../src/net/session.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = rel => readFileSync(path.join(ROOT, rel), "utf8");

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
        channel.peerId = peerId;
        onPeer?.({ kind: "join", peerId });
      },
    };
    made.push(channel);
    return channel;
  };
  return { factory, made };
}

function resetWorldFixture() {
  resetGuests();
  resetPlaces();
  storageMap.clear();
  state.away = null;
  state.guestHome = null;
  state.multiplayer = false;
  state.paused = false;
  state.ui.intro = false;
  applySave(newRootSave());
  state.players.length = 0;
  createPlayer();
  enterPlace(DEFAULT_PLACE, state.player);
}

test("protocol: act and visit validate, preserve slot 0, clamp helds/size, and keep optional mission/owner fields", () => {
  assert.ok(KINDS.includes("act") && KINDS.includes("visit"));
  assert.ok(ACT_OPS.includes("pw") && ACT_OPS.includes("story") && ACT_OPS.includes("invEquip"));

  // `slot: 0` must survive sanitization cleanly (not treated as falsy).
  const actMsg = cleanMessage("act", { op: "pw", slot: 0, reqId: 7, shift: true });
  assert.equal(actMsg.t, "act");
  assert.equal(actMsg.op, "pw");
  assert.equal(actMsg.slot, 0);
  assert.equal(actMsg.reqId, 7);
  assert.equal(actMsg.shift, true);

  assert.equal(cleanMessage("act", { op: "not-a-real-op", slot: 0 }), null);

  // Oversize visit snapshots must be rejected before reading.
  const hugeVisit = cleanMessage("visit", {
    profile: { ships: ["wasp"], pad: "x".repeat(LIMITS.suitcase + 100) },
    world: { place: DEFAULT_PLACE },
  });
  assert.equal(hugeVisit, null);

  const okVisit = readMessage({
    t: "visit",
    ackReqId: 12,
    docked: true,
    place: DEFAULT_PLACE,
    pw: 2,
    sw: 1,
    msl: 4,
    hull: 45,
    hullMax: 60,
    shield: 15,
    shieldMax: 25,
    held: { id: "ferrite", n: 3, kind: "hold", where: "wasp", slot: 0, ship: "wasp" },
    profile: { ships: ["wasp"], ship: "wasp" },
    world: { place: DEFAULT_PLACE },
    notice: "Purchased item",
    sound: "buy",
  });
  assert.equal(okVisit.ackReqId, 12);
  assert.equal(okVisit.pw, 2);
  assert.equal(okVisit.held.slot, 0);
  assert.equal(okVisit.held.n, 3);

  // Enemies/crates preserve mission/owner metadata only when present.
  const ent = readMessage({
    t: "entities",
    place: DEFAULT_PLACE,
    enemies: [
      { id: 1, def: "drone", pos: [0, 0, 0], quat: [0, 0, 0, 1], v: [0, 0, 0], hp: 10, mx: 10 },
      { id: 2, def: "raider", pos: [1, 0, 0], quat: [0, 0, 0, 1], v: [0, 0, 0], hp: 20, mx: 20, missionId: "c1", encounter: "c1:step", missionOwner: "g-1" },
    ],
    crates: [
      { id: 3, item: "ferrite", pos: [2, 0, 0] },
      { id: 4, item: "beacon", pos: [3, 0, 0], persistent: true, missionId: "m1", missionOwner: "g-1" },
    ],
  });
  assert.equal(ent.enemies.length, 2);
  assert.equal("missionOwner" in ent.enemies[0], false);
  assert.equal(ent.enemies[1].missionOwner, "g-1");
  assert.equal(ent.crates.length, 2);
  assert.equal("missionOwner" in ent.crates[0], false);
  assert.equal(ent.crates[1].missionOwner, "g-1");
  assert.equal(ent.crates[1].missionId, "m1");
});

test("host guest actions: shop, ship, weapon slots, cursor holds, contracts and story isolate from host world", () => {
  resetWorldFixture();
  const hostCreditsBefore = state.profile.cr;
  const hostShipsBefore = [...state.profile.ships];
  const hostStoreBefore = JSON.stringify(state.worldState.stationStores);
  const hostMissionsBefore = JSON.stringify(state.profile.missions);

  const guestProfile = newProfile();
  guestProfile.cr = 10000;
  const homeKey = stationKeyAt(DEFAULT_PLACE);
  const P = arriveGuest({
    guestId: "guest-alpha",
    name: "GuestAlpha",
    profile: guestProfile,
    place: DEFAULT_PLACE,
    lockers: [
      { item: "ferrite", count: 4, station: homeKey, origin: homeKey },
      { item: "future_relic", count: 2, station: homeKey, origin: homeKey },
    ],
  });
  assert.ok(P && P.guestWorld, "guest arrives with its own isolated guestWorld");
  assert.equal(P.docked, true);

  // 1. Buy a module while docked: credits and guest station storage change; host is untouched.
  const buyMod = executeGuestAction("guest-alpha", { op: "buy", shop: "meridian", id: "cannon_basic", n: 1 });
  assert.equal(buyMod.ok, true);
  assert.ok(P.profile.cr < 10000);
  assert.equal(state.profile.cr, hostCreditsBefore);
  assert.equal(JSON.stringify(state.worldState.stationStores), hostStoreBefore);

  // 2. Equip module into primary bay and switch primary weapon slot to 1 (index 0).
  const equip = executeGuestAction("guest-alpha", { op: "invEquip", where: "station", id: "cannon_basic", slot: 1 });
  assert.equal(equip.ok, true);
  assert.equal(equip.shipsChanged, true);

  const pwRes = executeGuestAction("guest-alpha", { op: "pw", slot: 0 });
  assert.equal(pwRes.ok, true);
  assert.equal(P.profile.pw, "1");
  assert.equal(P.weapon, "1");

  // 3. Upgrade hangar berth, buy a duplicate hull ("wasp#2"), and select it cleanly.
  const upHangar = executeGuestAction("guest-alpha", { op: "up", id: "hangar" });
  assert.equal(upHangar.ok, true);
  const buyHull = executeGuestAction("guest-alpha", { op: "buyShip", id: "wasp", n: 1 });
  assert.equal(buyHull.ok, true);
  assert.ok(P.profile.ships.includes("wasp#2"));
  const selDup = executeGuestAction("guest-alpha", { op: "sel", id: "wasp#2" });
  assert.equal(selDup.ok, true);
  assert.equal(P.profile.ship, "wasp#2");
  assert.equal(P.ship, "wasp#2");
  assert.deepEqual(state.profile.ships, hostShipsBefore);

  // 4. Cursor pickup (`guestHeld`) folds non-destructively into suitcase snapshots,
  //    and unknown item IDs from future builds survive in `guestUnknownLockers`.
  const pickup = executeGuestAction("guest-alpha", { op: "invClick", where: "station", slot: 0 });
  assert.equal(pickup.ok, true);
  assert.ok(P.guestHeld && P.guestHeld.n > 0);
  const lockerSnap = guestLockerSnapshot(P);
  const ferriteInSnap = lockerSnap.filter(row => row.item === "ferrite").reduce((s, r) => s + r.count, 0);
  const futureInSnap = lockerSnap.filter(row => row.item === "future_relic").reduce((s, r) => s + r.count, 0);
  assert.equal(ferriteInSnap, 4, "station cursor hold folds back into locker snapshot without item loss");
  assert.equal(futureInSnap, 2, "unknown locker items survive custody snapshot without stripping");
  assert.ok(P.guestHeld && P.guestHeld.n > 0, "snapshotting did not mutate live guestHeld");
  assert.equal(cancelGuestHeld(P), true);
  assert.equal(P.guestHeld, null);

  // 5. Accept a contract: stamped with owner === guestId, stored on guest profile only.
  const acc = executeGuestAction("guest-alpha", { op: "acc", slot: 0 });
  assert.equal(acc.ok, true);
  assert.equal(P.profile.missions.length, 1);
  assert.equal(P.profile.missions[0].owner, "guest-alpha");
  assert.equal(JSON.stringify(state.profile.missions), hostMissionsBefore);

  // 6. Story dialogue / choice in guest profile stays isolated from host.
  const storyOffer = STORY_MISSIONS.find(m => (m.offeredAt || DEFAULT_PLACE) === DEFAULT_PLACE);
  if (storyOffer) {
    const storyRes = executeGuestAction("guest-alpha", { op: "story", id: storyOffer.id });
    assert.equal(storyRes.ok, true);
    const storyM = P.profile.missions.find(m => m.id === storyOffer.id);
    assert.equal(storyM?.owner, "guest-alpha");
    assert.equal(JSON.stringify(state.profile.missions), hostMissionsBefore);
    // Advance the dockside dialogue steps via `dlgNext` so launching is unblocked.
    for (let guard = 0; guard < 12; guard++) {
      const next = executeGuestAction("guest-alpha", { op: "dlgNext", id: storyM.id });
      if (!next.ok) break;
    }
  }

  // 7. Undocked guest cannot buy ships/items on the station shop.
  launch(P, P.profile);
  assert.equal(P.docked, false);
  const denied = executeGuestAction("guest-alpha", { op: "buy", shop: "meridian", id: "cannon_basic", n: 1 });
  assert.equal(denied.ok, false);
  assert.match(denied.notice, /Dock/i);

  // Clean snapshot still works after undocking.
  const profSnap = guestProfileSnapshot(P);
  assert.equal(profSnap.ship, "wasp#2");
  leaveGuest("guest-alpha");
  assert.equal(guestRecordOf("guest-alpha"), null);
});

test("mission & HUD owner isolation: guest and host missions never cross-highlight targets or steal waypoints", () => {
  resetWorldFixture();
  const gProf = newProfile();
  const P = arriveGuest({ guestId: "g-1", name: "Visitor", profile: gProf, place: DEFAULT_PLACE });

  const hostMission = instantiateMission(
    { id: "c-host", title: "Host Hunt", kind: "contract", type: "hunt", sector: DEFAULT_PLACE, count: 1, target: "raider", reward: 100 },
    DEFAULT_PLACE,
    "host",
  );
  const guestMission = instantiateMission(
    { id: "c-guest", title: "Guest Hunt", kind: "contract", type: "hunt", sector: DEFAULT_PLACE, count: 1, target: "raider", reward: 100 },
    DEFAULT_PLACE,
    "g-1",
  );
  assert.equal("owner" in hostMission, false);
  assert.equal(guestMission.owner, "g-1");

  const hostEnemy = { kind: "e", def: "raider", missionId: "c-host", missionOwner: "host" };
  const guestEnemy = { kind: "e", def: "raider", missionId: "c-guest", missionOwner: "g-1" };

  assert.ok(objectObjectiveColor(hostEnemy, "Hostile", { missions: [hostMission], viewerOwner: "host" }));
  assert.equal(Boolean(objectObjectiveColor(guestEnemy, "Hostile", { missions: [hostMission], viewerOwner: "host" })), false);

  assert.ok(objectObjectiveColor(guestEnemy, "Hostile", { missions: [guestMission], viewerOwner: "g-1" }));
  assert.equal(Boolean(objectObjectiveColor(hostEnemy, "Hostile", { missions: [guestMission], viewerOwner: "g-1" })), false);

  // Synced entities retain missionId / encounter / missionOwner for guest HUD matching.
  const W = placeWorld(DEFAULT_PLACE);
  syncPocketEntities(W, {
    enemies: [{ id: 50, def: "raider", pos: [10, 0, 10], quat: [0, 0, 0, 1], v: [0, 0, 0], hp: 30, mx: 30, missionId: "c-guest", encounter: "c-guest:hunt", missionOwner: "g-1" }],
    crates: [{ id: 51, item: "beacon", pos: [0, 0, 10], n: 1, persistent: true, missionId: "m-guest", missionOwner: "g-1" }],
    bullets: [], missiles: [], fx: [],
  }, DEFAULT_PLACE);
  assert.equal(W.enemies[0].missionOwner, "g-1");
  assert.equal(W.enemies[0].missionId, "c-guest");
  assert.equal(W.crates[0].missionOwner, "g-1");
  assert.equal(W.crates[0].missionId, "m-guest");

  // Travel target list scopes cleanly per profile missions list.
  const guestTargets = missionTravelTargets({
    place: "empty-other",
    profile: P.profile,
    worldState: P.guestWorld,
    missions: [{ ...guestMission, steps: [{ kind: "hunt", sector: DEFAULT_PLACE, count: 1, done: 0, label: "Go" }] }],
  });
  assert.equal(guestTargets.length, 1);
  assert.equal(guestTargets[0].place, DEFAULT_PLACE);

  resetGuests();
});

test("session act/visit roundtrip and frozen-home custody guard (saveCurrentGame + saveKit)", async () => {
  resetWorldFixture();
  const wire = wirePair();
  session.setChannelFactory(wire.factory);

  const hostSave = { v: SAVE_VERSION, profile: newProfile(), world: newWorld(), away: null };
  hostSave.profile.cr = 4321;

  const guestHomeSave = { v: SAVE_VERSION, profile: newProfile(), world: newWorld(), away: null };
  guestHomeSave.profile.cr = 900;
  guestHomeSave.world.place = "sol-belt";

  // Wire host visitors like main.js does.
  let arrived = false;
  const hostArriveListener = ({ guestId, name, bundle } = {}) => {
    if (arrived || !bundle) return;
    arrived = true;
    arriveGuest({ guestId, name, profile: hostProfile(bundle), place: bundle.homeStation || null, lockers: bundle.lockers || [] });
  };
  on("mp-guest-arrive", hostArriveListener);
  on("mp-guest-act", req => {
    if (!req?.guestId || !req?.action) return;
    req.result = executeGuestAction(req.guestId, req.action);
    req.answered = true;
  });
  on("mp-guest-visit-request", req => {
    const P = guestRecordOf(req?.guestId);
    if (!P?.profile) return;
    req.snapshot = {
      docked: !!P.docked,
      place: P.place || DEFAULT_PLACE,
      pw: Math.max(0, Math.min(4, Number(P.profile.pw ?? 1) - 1)),
      sw: Math.max(0, Math.min(4, Number(P.profile.sw ?? 1) - 1)),
      msl: Math.max(0, Math.floor(P.profile.msl || 0)),
      hull: P.hull || 0,
      hullMax: P.hullMax || 0,
      shield: P.sh || 0,
      shieldMax: P.shMax || 0,
      held: P.guestHeld ? { ...P.guestHeld } : null,
      profile: JSON.parse(JSON.stringify(P.profile)),
      world: JSON.parse(JSON.stringify(P.guestWorld || {})),
    };
    req.answered = true;
  });

  const visits = [];
  on("mp-visit", v => visits.push(v));

  let guestInstalled = guestHomeSave;
  const host = session.createChannelForTest("host", "w-sync", "Ada", "h-tok", {
    read: () => hostSave,
    write: next => Object.assign(hostSave, next),
  });
  const guest = session.createChannelForTest("guest", "w-sync", "Bo", "g-tok", {
    read: () => guestInstalled,
    write: next => Object.assign(guestInstalled, next),
    install: next => { guestInstalled = next; },
  });

  await host.start();
  const hostCh = wire.made.at(-1);
  await guest.start();
  const guestCh = wire.made.at(-1);
  hostCh.deliver = (peerId, value) => guestCh.reach(value, peerId);
  guestCh.deliver = (peerId, value) => hostCh.reach(value, peerId);
  hostCh.connect("guest-peer");
  guestCh.connect("host-peer");

  // Guest brings its pilot -> host creates guest record.
  const brought = guest.bringPilot();
  assert.equal(brought.ok, true);
  assert.ok(arrived, "guest arrived on host");

  // Guest sends actions over session -> host executes and replies with `visit`.
  session.focusForTest(guest);
  const req1 = session.requestGuestAction({ op: "pw", slot: 3 });
  assert.ok(req1 > 0);
  const lastVisit = visits.at(-1);
  assert.ok(lastVisit, "guest received authoritative visit snapshot");
  assert.equal(lastVisit.ackReqId, req1);
  assert.equal(lastVisit.pw, 3);
  assert.equal(lastVisit.profile.pw, "4");
  assert.equal(lastVisit.profile.cr, 900);

  const req2 = session.requestGuestAction({ op: "buy", shop: "meridian", id: "cannon_basic", n: 1 });
  assert.ok(req2 > req1);
  const afterBuy = visits.at(-1);
  assert.equal(afterBuy.ackReqId, req2);
  assert.ok(afterBuy.profile.cr < 900);
  assert.equal(afterBuy.world.stationStores[stationKeyAt(DEFAULT_PLACE)].cannon_basic, 1);

  // Host's own world save remains untouched.
  assert.equal(hostSave.profile.cr, 4321);

  // `saveCurrentGame` must be a strict no-op while `state.away` is active so live visit data
  // never overwrites the frozen home disk save.
  state.away = { worldId: "w-sync", guestId: "guest-g-tok", hostName: "Ada", token: "x", epoch: 0, rev: 0, suitcase: null };
  assert.equal(saveCurrentGame(), null, "saveCurrentGame refuses to overwrite disk while visiting");

  session.focusForTest(null);
  session.stop({ quiet: true });
  host.stop({ quiet: true });
  session.setChannelFactory(null);
  resetWorldFixture();
});

test("main.js and UI wiring: installMultiplayerShips precedes setupMenu, stashGuestHome guards rejoin, and UI routes acts", () => {
  const main = read("src/main.js");
  const idxShips = main.indexOf("installMultiplayerShips();");
  const idxMenu = main.indexOf("setupMenu(");
  assert.ok(idxShips > 0 && idxMenu > 0 && idxShips < idxMenu,
    "installMultiplayerShips registers mp-visit before setupMenu redraws from state");
  assert.match(main, /if \(!state\.guestHome && state\.away\) stashGuestHome\(\);/,
    "rejoin snapshots stash frozen home state before applying visit state");
  assert.match(main, /on\("mp-enter-world"[\s\S]{0,160}applyVisitSnapshot\(lastVisitSnapshot\)/,
    "entering world after early visit snapshot replays the visit snapshot over resumeFromSave");

  for (const rel of ["src/ui/menu.js", "src/ui/inventory-ui.js", "src/ui/cargo.js", "src/ui/missionlog.js"]) {
    const src = read(rel);
    assert.match(src, /requestGuestAction/, `${rel} routes guest interactions through requestGuestAction`);
  }
});
