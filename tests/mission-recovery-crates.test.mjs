// Recovery contracts own the crates they put in space: each job counts only its
// own crates, the tally reads "2 out of 3 crates recovered", any Salvage in the
// hold or station can pay the hand-in, and the crates left over are cleared away
// when the contract is handed in or abandoned.
import { test } from "node:test";
import assert from "node:assert/strict";
import { state, applySave, currentSave, placeWorld } from "../src/state/state.js";
import { newSave, sanitizeSave } from "../src/state/profile.js";
import { createPlayer } from "../src/sim/player.js";
import { configurePlayer, launch } from "../src/sim/session.js";
import {
  acceptMission,
  abandonMission,
  completeMission,
  missionObjectivesDone,
  missionRecoveryText,
} from "../src/sim/missions.js";
import { spawnCrate, updateCrates, restoreMissionDrops } from "../src/sim/combat.js";
import { countOf } from "../src/sim/inventory.js";
import { setSeed } from "../src/util/rng.js";
import { V } from "../src/util/math.js";
// The reward and abandon listeners clear a mission's own crates from space.
import "../src/sim/ai.js";

function arena() {
  setSeed(5150);
  applySave(newSave());
  state.place = "reach";
  state.players.length = 0;
  state.localPlayerIndex = 0;
  for (const list of Object.values(state.world)) list.length = 0;
  const profile = state.profile;
  const P = configurePlayer(createPlayer(), profile);
  P.place = "reach";
  state.players[0] = P;
  return { profile, P };
}

const cratesOf = mission => placeWorld("reach").crates.filter(crate => crate.missionId === mission.id);

function recover(P, mission) {
  for (const crate of cratesOf(mission).slice()) {
    P.pos.copy(crate.pos);
    updateCrates(1 / 60, "reach");
  }
}

test("a recovery contract spawns its own crates in the field, one per crate it asks for", () => {
  const { profile, P } = arena();
  const small = acceptMission({ type: "salvage", tier: 1, n: 3, p: 0, r: 300 }, profile);
  const large = acceptMission({ type: "salvage", tier: 2, n: 6, p: 0, r: 600 }, profile);
  launch(P, profile);

  assert.equal(placeWorld("reach").crates.length, 9, "three crates for one job and six for the other");
  assert.equal(cratesOf(small).length, 3);
  assert.equal(cratesOf(large).length, 6);
  assert.deepEqual(cratesOf(small).map(c => c.crateSlot).sort(), [0, 1, 2], "each crate has its own slot");
  assert.ok(placeWorld("reach").crates.every(c => c.persistent), "mission crates stay put across a warp");
  assert.equal(missionRecoveryText(small), "0 out of 3 crates recovered");
  assert.equal(missionRecoveryText(large), "0 out of 6 crates recovered");

  // Picking one up and launching again tops up nothing: the count is the need.
  P.pos.copy(cratesOf(large)[0].pos);
  updateCrates(1 / 60, "reach");
  launch(P, profile);
  assert.equal(cratesOf(large).length, 5, "a collected crate is not spawned twice");
  assert.equal(missionRecoveryText(large), "1 out of 6 crates recovered");
});

test("each recovery contract counts only its own crates, never loose salvage", () => {
  const { profile, P } = arena();
  const small = acceptMission({ type: "salvage", tier: 1, n: 3, p: 0, r: 300 }, profile);
  const large = acceptMission({ type: "salvage", tier: 2, n: 6, p: 0, r: 600 }, profile);
  launch(P, profile);

  // A crate from a wreck belongs to no contract.
  spawnCrate(V(P.pos.x, P.pos.y, P.pos.z), "salv");
  updateCrates(1 / 60, "reach");
  assert.equal(missionRecoveryText(small), "0 out of 3 crates recovered", "loose salvage is not a recovery");
  assert.equal(missionRecoveryText(large), "0 out of 6 crates recovered");

  recover(P, small);
  assert.equal(missionRecoveryText(small), "3 out of 3 crates recovered");
  assert.equal(missionRecoveryText(large), "0 out of 6 crates recovered", "the other job still needs its own six");
  assert.equal(missionObjectivesDone(small), true);
  assert.equal(missionObjectivesDone(large), false);
});

test("the hand-in takes ordinary Salvage and clears the contract's leftover crates", () => {
  const { profile, P } = arena();
  const mission = acceptMission({ type: "salvage", tier: 1, n: 3, p: 0, r: 300 }, profile);
  launch(P, profile);
  // An extra crate of the same job is still out there when the pilot hands in.
  spawnCrate(V(120, 0, 0), "salv", "reach", null, null, mission.id, true, 99);
  assert.equal(cratesOf(mission).length, 4);

  recover(P, mission);
  assert.equal(missionObjectivesDone(mission), true);
  assert.equal(countOf(profile.ship, "salv", profile, state.worldState), 4, "four crates in the hold");

  P.docked = true;
  assert.equal(completeMission(mission.id, profile, P), "Paid 300 cr.");
  assert.equal(countOf(profile.ship, "salv", profile, state.worldState), 1,
    "three crates paid the job; the spare is still cargo");
  assert.equal(placeWorld("reach").crates.filter(c => c.missionId === mission.id).length, 0,
    "the crates that spawned for this contract are gone from space");
  restoreMissionDrops("reach");
  assert.equal(placeWorld("reach").crates.filter(c => c.missionId === mission.id).length, 0,
    "and re-entering the pocket does not bring them back");
});

test("abandoning a recovery contract clears its crates but leaves the other job's crates", () => {
  const { profile, P } = arena();
  const small = acceptMission({ type: "salvage", tier: 1, n: 2, p: 0, r: 200 }, profile);
  const large = acceptMission({ type: "salvage", tier: 2, n: 6, p: 0, r: 600 }, profile);
  launch(P, profile);
  assert.equal(placeWorld("reach").crates.length, 8);

  assert.equal(abandonMission(small.id, profile), "Contract abandoned.");
  assert.equal(cratesOf(small).length, 0);
  assert.equal(cratesOf(large).length, 6);
});

test("a reloaded pocket rebuilds every crate of a contract, each in its own slot", () => {
  const { profile, P } = arena();
  const mission = acceptMission({ type: "salvage", tier: 2, n: 4, p: 0, r: 400 }, profile);
  launch(P, profile);
  placeWorld("reach").crates.length = 0;          // as if the pocket had been unloaded
  restoreMissionDrops("reach");
  assert.equal(cratesOf(mission).length, 4, "all four crates come back");
  assert.deepEqual(cratesOf(mission).map(c => c.crateSlot).sort(), [0, 1, 2, 3], "and none of them merge");
  restoreMissionDrops("reach");
  assert.equal(cratesOf(mission).length, 4, "restoring twice does not duplicate them");
});

test("crate slots are part of the saved world, so a reload keeps every crate apart", () => {
  const { profile, P } = arena();
  const mission = acceptMission({ type: "salvage", tier: 2, n: 4, p: 0, r: 400 }, profile);
  launch(P, profile);
  const saved = sanitizeSave(JSON.parse(JSON.stringify(currentSave())));
  const drops = saved.world.missionState.reach.drops.filter(drop => drop.missionId === mission.id);
  assert.deepEqual(drops.map(drop => drop.slot).sort(), [0, 1, 2, 3]);
});
