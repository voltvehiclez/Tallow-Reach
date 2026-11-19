// Slice 1 regression + feature tests:
//   1. True flight speed (m/s) when pushed by moving objects (e.g. Meridian Station
//      arms/rings) across 24..240 Hz frame rates, scaled movers, and slow axles.
//   2. Live available item counts in the station Mission Log for mining, deliver,
//      recovery, cargo handover, and story item missions.
//   3. Per-station 10-minute (600 s) unpaused contract refresh timer, single-offer
//      removal on accept, empty-board persistence, and save v22 migration/round-trip.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";

import { state, resetPlaces, applySave, currentSave } from "../src/state/state.js";
import { SAVE_VERSION, newProfile, newWorld, newSave, sanitizeSave, sanitizeWorld } from "../src/state/profile.js";
import { encodeSave, decodeSave } from "../src/state/storage.js";
import { PLACES, setPlaceCatalog } from "../src/data/places.js";
import { SIM_DT } from "../src/data/simulation.js";
import { CONTRACT_REFRESH_SECONDS, CONTRACTS_PER_BOARD } from "../src/data/contracts.js";
import { BORDER_SIGNAL_MISSION } from "../src/data/missions/story.js";
import { ORE_RUN, PARCEL_RUN } from "../src/data/missions/test-missions.js";
import { createPlayer, flight } from "../src/sim/player.js";
import { configurePlayer } from "../src/sim/session.js";
import { createSimClock, stepSim } from "../src/sim/step.js";
import { displayedSpeed } from "../src/sim/flight-instruments.js";
import { collideSphereAt, registerPlaceCollider, clearPlaceColliders, SHIP_RADIUS } from "../src/sim/colliders.js";
import { colliderFromObject } from "../src/render/collideModel.js";
import { STATION, addItem, takeItem, moveItem } from "../src/sim/inventory.js";
import {
  acceptMission,
  advanceMission,
  advanceMissions,
  completeMission,
  instantiateStoryMission,
  missionItemRequirements,
} from "../src/sim/missions.js";
import {
  acceptContract,
  boardAt,
  boardRefreshRemaining,
  canRefreshBoard,
  formatBoardCooldown,
  refreshBoard,
  rerollBoard,
  updateContractTimers,
} from "../src/sim/contracts.js";
import { missionLogHtml } from "../src/ui/missionlog.js";
import { outpostHtml } from "../src/ui/screens.js";
import { moveTo, newPilot } from "./mission-driver.mjs";

const DEPOT = {
  id: "depot",
  kind: "pocket",
  n: "Depot",
  parent: "meridian",
  d: "Second station pocket for independent board and inventory checks.",
  features: [{
    kind: "station", id: "depot", n: "Depot Station", pos: [0, 0, 0],
    dockRange: 300, dockSpeed: 70, launch: { pos: [0, 0, 200] },
  }],
  enter: { kind: "warp", pos: [0, 0, 300] },
  leave: { kind: "warp" },
};

function setupFlight(place = "hollow") {
  resetPlaces();
  state.players.length = 0;
  state.localPlayerIndex = 0;
  state.place = place;
  state.profile = newProfile();
  state.worldState = newWorld();
  state.warp = null;
  state.freeCam.on = false;
  const p = configurePlayer(createPlayer(), state.profile);
  p.docked = false;
  p.place = place;
  p.pos.set(0, 0, 0);
  p.v.set(0, 0, 0);
  return p;
}

function makeMeridianRig() {
  const stn = new THREE.Group();
  const spin = new THREE.Group();
  stn.add(spin);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(90, 7, 8, 48));
  ring.rotation.x = Math.PI / 2;
  spin.add(ring);
  const arms = new THREE.Group();
  arms.name = "spin";
  spin.add(arms);
  for (let i = 0; i < 4; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(180, 2.5, 2.5));
    spoke.rotation.y = (i * Math.PI) / 4;
    arms.add(spoke);
  }
  stn.updateMatrixWorld(true);
  const col = colliderFromObject(stn, { id: "meridian", damage: 0 });
  const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scale = new THREE.Vector3();
  let angle = 0;
  const stepSpin = dt => {
    angle += dt * 0.1;
    spin.rotation.y = angle;
    for (const m of col.movers) {
      m.mover.object.updateWorldMatrix(true, false);
      m.mover.object.matrixWorld.decompose(pos, quat, scale);
      Object.assign(m.mover.pos, { x: pos.x, y: pos.y, z: pos.z });
      Object.assign(m.mover.quat, { x: quat.x, y: quat.y, z: quat.z, w: quat.w });
      Object.assign(m.mover.scale, { x: scale.x, y: scale.y, z: scale.z });
    }
  };
  return { col, stepSpin, reset: () => { angle = 0; stepSpin(0); } };
}

test("moving station ring/arms push always reports true m/s across 24..240 Hz and main wires stepScenery per sim tick", () => {
  const main = readFileSync("src/main.js", "utf8");
  const scene = readFileSync("src/render/scene.js", "utf8");
  assert.match(scene, /export function stepScenery\(dt\)/, "scene exposes fixed-step mover update");
  assert.match(main, /beforeStep:[\s\S]*stepScenery\(SIM_DT\)/, "main advances moving colliders per sim tick, not once per frame");

  const p = setupFlight("hollow");
  const rig = makeMeridianRig();
  if (rig.col.soup) registerPlaceCollider("hollow", rig.col);
  for (const m of rig.col.movers) registerPlaceCollider("hollow", m);
  try {
    for (const radius of [20, 50, 75]) {
      const expected = radius * 0.1; // 0.1 rad/s * r = true linear speed (m/s)
      for (const fps of [24, 30, 50, 60, 120, 144, 240]) {
        rig.reset();
        p.pos.set(radius, 0, -(1.25 + SHIP_RADIUS - 0.01));
        p.v.set(0, 0, 0);
        p.measuredSpeed = 0;
        const clock = createSimClock(dt => flight(dt, p), { beforeStep: () => rig.stepSpin(SIM_DT) });
        for (let i = 0; i < fps * 2; i++) {
          clock.advance(1 / fps);
          if (i < Math.ceil(fps * 0.1)) continue;
          assert.ok(Math.abs(p.measuredSpeed - expected) < 0.35,
            `r=${radius} @ ${fps}Hz: measured ${p.measuredSpeed.toFixed(2)} m/s vs true ${expected.toFixed(2)} m/s`);
          assert.equal(displayedSpeed(p), Math.round(expected),
            `HUD speed never drops to 0 m/s while pushed at ${expected} m/s (${fps}Hz)`);
        }
      }
    }

    // Slow push near a single turning beam's axle (0.3 m/s < 0.5 m/s) still never reads 0 m/s.
    clearPlaceColliders("hollow");
    const slowGroup = new THREE.Group();
    const slowArm = new THREE.Group();
    slowArm.name = "spin";
    slowArm.add(new THREE.Mesh(new THREE.BoxGeometry(40, 2.5, 2.5)));
    slowGroup.add(slowArm);
    slowGroup.updateMatrixWorld(true);
    const slowCol = colliderFromObject(slowGroup, { id: "slow-arm", damage: 0 });
    for (const m of slowCol.movers) registerPlaceCollider("hollow", m);
    const sPos = new THREE.Vector3(), sQuat = new THREE.Quaternion(), sScale = new THREE.Vector3();
    p.pos.set(3, 0, -(1.25 + SHIP_RADIUS - 0.01));
    p.v.set(0, 0, 0);
    for (let i = 0; i < 10; i++) {
      slowArm.rotation.y += SIM_DT * 0.1;
      slowArm.updateWorldMatrix(true, false);
      slowArm.matrixWorld.decompose(sPos, sQuat, sScale);
      const mv = slowCol.movers[0].mover;
      Object.assign(mv.pos, { x: sPos.x, y: sPos.y, z: sPos.z });
      Object.assign(mv.quat, { x: sQuat.x, y: sQuat.y, z: sQuat.z, w: sQuat.w });
      Object.assign(mv.scale, { x: sScale.x, y: sScale.y, z: sScale.z });
      flight(SIM_DT, p);
    }
    assert.ok(p.measuredSpeed > 0.25 && p.measuredSpeed < 0.4, "raw speed matches 0.3 m/s hub sweep");
    assert.equal(p.pushed, true, "flight marks external collision displacement");
    assert.equal(displayedSpeed(p), 1, "active sub-0.5 m/s push rounds up to 1 m/s instead of claiming 0 m/s");

    // Free space with zero velocity still reads 0 m/s.
    p.pos.set(500, 0, 500);
    p.v.set(0, 0, 0);
    flight(SIM_DT, p);
    assert.equal(p.pushed, false);
    assert.equal(displayedSpeed(p), 0);
  } finally {
    clearPlaceColliders("hollow");
  }
});

test("scaled moving collider reports true world-metre penetration depth instead of catapulting", () => {
  const root = new THREE.Group();
  const moverNode = new THREE.Group();
  moverNode.name = "spin";
  moverNode.scale.setScalar(2);
  moverNode.add(new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10))); // world half-extent = 10 m
  root.add(moverNode);
  root.updateMatrixWorld(true);
  const col = colliderFromObject(root, { id: "scaled", damage: 0 });
  // Place sphere centre 0.1 m inside touch distance (10 + 4 - 0.1 = 13.9 m).
  const hit = collideSphereAt(col.movers, 13.9, 0, 0, 4);
  assert.ok(hit, "sphere touches scaled mover");
  assert.ok(Math.abs(hit.depth - 0.1) < 1e-4, `expected 0.1 m world push, got ${hit.depth}`);
});

test("station Mission Log always reflects live available item count across mining, deliver, salvage, handover and story missions", () => {
  const ctx = newPilot();
  try {
    setPlaceCatalog({ systems: [], pockets: { ...PLACES, depot: DEPOT } });
    moveTo(ctx, "reach", { dock: true });

    // Pre-stock 5 Ferrite in Meridian's store and 2 in ship hold before taking Mine 10 Ferrite.
    addItem(STATION, "ferrite", 5, ctx.profile, state.worldState);
    addItem(ctx.profile.ship, "ferrite", 2, ctx.profile, state.worldState);
    const mine = acceptMission({ type: "mine", tier: 1, o: "ferrite", n: 10, r: 500 }, ctx.profile, "reach");
    assert.match(missionLogHtml(ctx.profile), /Ferrite: 7 of 10 available/, "counts station + ship stock live");

    // Sell/discard 4 from station -> immediately drops to 3 of 10.
    takeItem(STATION, "ferrite", 4, ctx.profile, state.worldState);
    assert.match(missionLogHtml(ctx.profile), /Ferrite: 3 of 10 available/, "drops immediately when items leave inventory");

    // Gain 7 more Ferrite in station storage -> 10 of 10 ready to hand in right now, even from pre-existing stock.
    addItem(STATION, "ferrite", 7, ctx.profile, state.worldState);
    const fullMineLog = missionLogHtml(ctx.profile);
    assert.match(fullMineLog, /Ready to hand in/);
    assert.match(fullMineLog, /Ferrite: 10 of 10 available/);
    assert.match(fullMineLog, />Hand in cargo</);

    // Even after mining objective counter was full, losing ore drops back to true live count (never stuck at 10 of 10).
    mine.counters.objective = 10;
    mine.step = mine.current = 1;
    mine.completed = true;
    takeItem(STATION, "ferrite", 6, ctx.profile, state.worldState); // 2 station + 2 ship = 4
    const shortLog = missionLogHtml(ctx.profile);
    assert.match(shortLog, /Awaiting cargo/);
    assert.match(shortLog, /Ferrite: 4 of 10 available/);
    assert.match(shortLog, /width:40%/);

    // Docking at Depot checks Meridian's store (2) + ship hold (2) = 4, NOT Depot's unrelated stock!
    moveTo(ctx, "depot", { dock: true });
    addItem(STATION, "ferrite", 9, ctx.profile, state.worldState); // in Depot's store, cannot pay Meridian
    assert.match(missionLogHtml(ctx.profile), /Ferrite: 4 of 10 available/,
      "another station's storage is not counted toward Meridian's hand-in");
    // Loading 6 Ferrite from Depot into the ship hold makes 2 (Meridian) + 8 (ship) = 10 available to bring back.
    moveItem(STATION, ctx.profile.ship, "ferrite", 6, ctx.profile, state.worldState);
    const transitLog = missionLogHtml(ctx.profile);
    assert.match(transitLog, /Deliver to Meridian Station/);
    assert.match(transitLog, /Ferrite: 10 of 10 available/);

    // Dock at Meridian and hand in: consumes all 10 Ferrite and finishes the contract.
    moveTo(ctx, "reach", { dock: true });
    assert.equal(completeMission(mine.id, ctx.profile, ctx.player), "Paid 500 cr.");

    // Salvage contract shows both crate recoveries and live Salvage in inventory.
    const salv = acceptMission({ type: "salvage", tier: 1, n: 3, r: 400 }, ctx.profile, "reach");
    salv.counters.objective = 3;
    salv.step = salv.current = 1;
    salv.completed = true;
    addItem(ctx.profile.ship, "salv", 1, ctx.profile, state.worldState);
    const salvShort = missionLogHtml(ctx.profile);
    assert.match(salvShort, /3 out of 3 crates recovered/);
    assert.match(salvShort, /Salvage: 1 of 3 available/);
    assert.match(salvShort, /width:33%/);
    takeItem(ctx.profile.ship, "salv", 1, ctx.profile, state.worldState);
    ctx.profile.missions.length = 0;

    // Deliver objective step checks live available items.
    const deliver = {
      id: "test.deliver-cobalt",
      title: "Deliver 6 Cobalt",
      kind: "story",
      requires: [],
      origin: "reach",
      handIn: { station: "reach", objective: "Deliver {count} {item} to {station}." },
      steps: [{ id: "del", kind: "deliver", item: "cobalt", count: 6, place: "reach", objective: "Deliver 6 Cobalt to {station}." }],
      rewards: { credits: 250 },
      fails: {},
      step: 0,
      current: 0,
      counters: {},
    };
    ctx.profile.missions.push(deliver);
    addItem(STATION, "cobalt", 4, ctx.profile, state.worldState);
    assert.match(missionLogHtml(ctx.profile), /Cobalt: 4 of 6 available/);
    addItem(ctx.profile.ship, "cobalt", 2, ctx.profile, state.worldState);
    assert.match(missionLogHtml(ctx.profile), /Ready to hand in/);
    assert.match(missionLogHtml(ctx.profile), /Cobalt: 6 of 6 available/);
    assert.equal(completeMission(deliver.id, ctx.profile, ctx.player), "Paid 250 cr.");

    // Authored story mining mission (ORE_RUN) shows live count once the mine step is active.
    const oreRun = acceptMission(ORE_RUN, ctx.profile, "reach");
    advanceMission(oreRun, "dialogue-next", { profile: ctx.profile, player: ctx.player });
    addItem(ctx.profile.ship, "ferrite", 2, ctx.profile, state.worldState);
    assert.match(missionLogHtml(ctx.profile), /Ferrite: 2 of 3 available/);
    ctx.profile.missions.length = 0;
    takeItem(ctx.profile.ship, "ferrite", 2, ctx.profile, state.worldState);

    // Cargo delivery mission using loadCargo + handOver (PARCEL_RUN) checks ship hold live.
    const parcelRun = acceptMission(PARCEL_RUN, ctx.profile, "reach");
    advanceMission(parcelRun, "dialogue-next", { profile: ctx.profile, player: ctx.player });
    advanceMission(parcelRun, "dialogue-next", { profile: ctx.profile, player: ctx.player });
    advanceMissions("docked", { profile: ctx.profile, player: ctx.player }); // loads 1 parcel into hold
    assert.match(missionLogHtml(ctx.profile), /Sealed parcel: 1 of 1 available/);
    // Moving the parcel out of the ship hold into station storage reflects 0 of 1 aboard.
    moveItem(ctx.profile.ship, STATION, "parcel", 1, ctx.profile, state.worldState);
    assert.match(missionLogHtml(ctx.profile), /Sealed parcel: 0 of 1 available/);
    ctx.profile.missions.length = 0;

    // Story collect mission (The Border Signal): no spoiler on intro dialogue, live count on beacon/hand-in.
    const border = instantiateStoryMission(BORDER_SIGNAL_MISSION);
    ctx.profile.missions.push(border);
    assert.equal(missionItemRequirements(border, ctx.profile, state.worldState).length, 0);
    border.step = border.current = 8; // collect beacon
    assert.match(missionLogHtml(ctx.profile), /Beacon: 0 of 1 available/);
    addItem(ctx.profile.ship, "beacon", 1, ctx.profile, state.worldState);
    border.step = border.current = 10;
    border.completed = true;
    assert.match(missionLogHtml(ctx.profile), /Beacon: 1 of 1 available/);
    ctx.profile.missions.length = 0;

    // Parallel multi-item mission reports each required item's live count independently.
    const multi = {
      id: "test.multi-ore",
      title: "Alloy supply",
      kind: "story",
      requires: [],
      origin: "reach",
      handIn: { station: "reach", objective: "Deliver the ores to {station}." },
      steps: [{
        id: "both",
        kind: "parallel",
        steps: [
          { id: "f", kind: "mine", item: "ferrite", count: 4 },
          { id: "c", kind: "mine", item: "cobalt", count: 2 },
        ],
      }],
      rewards: { credits: 300 },
      fails: {},
      step: 0,
      current: 0,
      counters: {},
    };
    ctx.profile.missions.push(multi);
    takeItem(STATION, "ferrite", 99, ctx.profile, state.worldState);
    takeItem(ctx.profile.ship, "ferrite", 99, ctx.profile, state.worldState);
    addItem(STATION, "ferrite", 3, ctx.profile, state.worldState);
    addItem(ctx.profile.ship, "cobalt", 2, ctx.profile, state.worldState);
    const multiLog = missionLogHtml(ctx.profile);
    assert.match(multiLog, /Ferrite: 3 of 4 available/);
    assert.match(multiLog, /Cobalt: 2 of 2 available/);
    assert.match(multiLog, /Active/);
    addItem(ctx.profile.ship, "ferrite", 1, ctx.profile, state.worldState);
    assert.match(missionLogHtml(ctx.profile), /Ready to hand in/);
    assert.equal(completeMission(multi.id, ctx.profile, ctx.player), "Paid 300 cr.");
  } finally {
    ctx.restore();
  }
});

test("per-station 10-minute unpaused contract refresh timer removes only accepted offers and survives save/load", () => {
  const ctx = newPilot();
  try {
    setPlaceCatalog({ systems: [], pockets: { ...PLACES, depot: DEPOT } });
    assert.equal(SAVE_VERSION, 23);
    assert.equal(CONTRACT_REFRESH_SECONDS, 600);

    applySave(newSave());
    state.place = "reach";
    const player = configurePlayer(createPlayer(), state.profile);
    player.docked = true;
    player.place = "reach";

    // Initial board at Meridian has 4 contracts and starts its 10:00 refresh cooldown.
    const initial = [...boardAt("reach")];
    assert.equal(initial.length, CONTRACTS_PER_BOARD);
    assert.equal(boardRefreshRemaining("reach"), 600);
    assert.equal(canRefreshBoard("reach"), false);
    assert.equal(formatBoardCooldown(600), "10:00");

    // Trying to refresh early refuses and preserves the exact offers.
    assert.match(refreshBoard(state.worldState, "reach"), /10:00/);
    assert.deepEqual(boardAt("reach"), initial);

    // Accepting one offer removes ONLY that offer; the remaining 3 stay unchanged.
    assert.match(acceptContract(1, state.profile, state.worldState, "reach"), /Contract accepted/);
    assert.deepEqual(boardAt("reach"), [initial[0], initial[2], initial[3]]);

    // Accepting all remaining offers leaves the board empty and still gated by Meridian's timer.
    while (boardAt("reach").length) {
      acceptContract(0, state.profile, state.worldState, "reach");
    }
    assert.deepEqual(boardAt("reach"), [], "empty board does not auto-refill");
    const emptyUi = outpostHtml({ tab: "m" });
    assert.match(emptyUi, /No contracts available/);
    assert.match(emptyUi, /data-a="ref"[^>]*disabled/);
    assert.match(emptyUi, /Refresh \(10:00\)/);

    // Unpaused sim time advances Meridian's timer (e.g. 240 s -> 360 s / 6:00 left).
    updateContractTimers(240, state.worldState);
    assert.equal(boardRefreshRemaining("reach"), 360);
    assert.equal(formatBoardCooldown(boardRefreshRemaining("reach")), "6:00");

    // Travelling to Depot shows a full fresh board with its OWN independent 10:00 timer.
    state.place = "depot";
    const depotInitial = [...boardAt("depot")];
    assert.equal(depotInitial.length, CONTRACTS_PER_BOARD);
    assert.equal(boardRefreshRemaining("depot"), 600);
    assert.equal(boardRefreshRemaining("reach"), 360, "Meridian keeps its own remaining time");
    acceptContract(0, state.profile, state.worldState, "depot");
    assert.equal(boardAt("depot").length, CONTRACTS_PER_BOARD - 1);

    // Step via real unpaused stepSim and round-trip through encodeSave/decodeSave (reload test).
    stepSim(60);
    assert.equal(boardRefreshRemaining("reach"), 300);
    assert.equal(boardRefreshRemaining("depot"), 540);

    const reloaded = decodeSave(encodeSave(currentSave()));
    applySave(reloaded);
    assert.deepEqual(boardAt("reach"), [], "empty Meridian board stays empty across reload");
    assert.equal(boardAt("depot").length, CONTRACTS_PER_BOARD - 1, "partial Depot board persists across reload");
    assert.equal(boardRefreshRemaining("reach"), 300, "Meridian's 5:00 cooldown survives reload");
    assert.equal(boardRefreshRemaining("depot"), 540, "Depot's 9:00 cooldown survives reload");
    assert.equal(canRefreshBoard("reach"), false);

    // Finish Meridian's remaining 300 s -> Meridian unlocks while Depot still has 240 s (4:00) left!
    updateContractTimers(300, state.worldState);
    assert.equal(boardRefreshRemaining("reach"), 0);
    assert.equal(canRefreshBoard("reach"), true);
    assert.equal(boardRefreshRemaining("depot"), 240);
    assert.equal(canRefreshBoard("depot"), false);

    // Even after timer hits 0, reloading keeps Meridian empty until the player presses Refresh.
    applySave(decodeSave(encodeSave(currentSave())));
    assert.deepEqual(boardAt("reach"), []);
    state.place = "reach";
    const readyUi = outpostHtml({ tab: "m" });
    assert.doesNotMatch(readyUi, /data-a="ref"[^>]*disabled/, "Refresh button enables once 10 minutes pass");

    // Pressing Refresh posts 4 new contracts at Meridian and starts a fresh 10:00 timer; Depot is untouched.
    assert.equal(refreshBoard(state.worldState, "reach"), "");
    assert.equal(boardAt("reach").length, CONTRACTS_PER_BOARD);
    assert.equal(boardRefreshRemaining("reach"), 600);
    assert.equal(canRefreshBoard("reach"), false);
    assert.equal(boardRefreshRemaining("depot"), 240);
    assert.equal(boardAt("depot").length, CONTRACTS_PER_BOARD - 1);

    // Legacy v21 saves with an existing board upgrade cleanly to v22 without losing offers.
    const legacy = sanitizeSave({
      v: 21,
      profile: newProfile(),
      world: {
        ...newWorld(),
        v: 21,
        board: [{ type: "hunt", tier: 1, p: 0, n: 2, r: 400, e: "raider" }],
        boardTimers: undefined,
      },
    });
    assert.equal(legacy.v, 23);
    assert.equal(legacy.world.board.length, 1);
    assert.equal(boardRefreshRemaining("reach", legacy.world), 0);

    // Tampered timers are clamped to [0, CONTRACT_REFRESH_SECONDS] and unknown places dropped.
    const clamped = sanitizeWorld({ boardTimers: { reach: 99999, depot: -5, nowhere: 100 } });
    assert.equal(clamped.boardTimers.reach, CONTRACT_REFRESH_SECONDS);
    assert.equal(clamped.boardTimers.depot, 0);
    assert.equal("nowhere" in clamped.boardTimers, false);

    // Force-reroll helper still works for tests and resets only that station's timer.
    rerollBoard(state.worldState, "depot");
    assert.equal(boardRefreshRemaining("depot"), 600);
  } finally {
    ctx.restore();
  }
});
