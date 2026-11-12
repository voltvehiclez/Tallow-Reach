// Step 13a: contracts are one-step data missions run by a generic objective runner.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CONTRACT_TYPES, CONTRACT_MISSION_TEMPLATES, missionFromContract } from "../src/data/missions/contracts.js";
import { MISSION_STEP_KINDS } from "../src/data/missions/index.js";
import {
  newProfile,
  newSave,
  sanitizeSave,
  SAVE_VERSION,
} from "../src/state/profile.js";
import {
  activeMissions,
  acceptMission,
  advanceMissions,
  canCollectMissionReward,
  completeMission,
  isMissionComplete,
  missionProgress,
} from "../src/sim/missions.js";
import { emit } from "../src/util/events.js";
import { state } from "../src/state/state.js";

const playerFor = profile => ({ profile });

test("13a: every contract is a mission-data template with a runner objective", () => {
  assert.deepEqual([...CONTRACT_TYPES].sort(), ["hunt", "mine", "salvage"]);
  for (const type of CONTRACT_TYPES) {
    const template = CONTRACT_MISSION_TEMPLATES[type];
    assert.equal(template.kind, "contract");
    assert.ok(Array.isArray(template.steps) && template.steps.length > 0);
    assert.ok(MISSION_STEP_KINDS.includes(template.steps[0].kind));
    const mission = missionFromContract({ type, tier: 1, n: 3, p: 0, r: 500, o: "ferrite", e: "raider" }, `test:${type}`);
    assert.equal(mission.id, `test:${type}`);
    assert.equal(mission.steps[0].count, 3);
    assert.equal(mission.rewards.credits, 500);
    assert.equal(isMissionComplete(mission), false);
  }
});

test("13a: multiple active contracts advance independently from gameplay events", () => {
  const profile = newProfile();
  const player = playerFor(profile);
  const mine = acceptMission({ type: "mine", tier: 1, p: 0, n: 2, r: 400, o: "ferrite" }, profile);
  const hunt = acceptMission({ type: "hunt", tier: 1, p: 0, n: 1, r: 500, e: "raider" }, profile);
  assert.equal(activeMissions(profile).length, 2);

  advanceMissions("mined", { item: "cobalt", player });
  assert.equal(missionProgress(mine).done, 0, "wrong ore does not advance the mining mission");
  advanceMissions("mined", { item: "ferrite", player });
  assert.equal(missionProgress(mine).done, 1);
  advanceMissions("enemy-killed", { def: "raider", faction: "pirates", player });
  assert.equal(isMissionComplete(hunt), true);
  assert.equal(isMissionComplete(mine), false);

  advanceMissions("mined", { item: "ferrite", player });
  assert.equal(isMissionComplete(mine), true);
  const before = profile.cr;
  assert.equal(completeMission(1, profile), `Paid 500 cr.`);
  assert.equal(profile.cr, before + 500);
  assert.equal(activeMissions(profile).length, 1);
  assert.equal(completeMission(undefined, profile), `Paid 400 cr.`);
  assert.equal(activeMissions(profile).length, 0);
});

test("13a: salvage rewards require and consume the recovered items at hand-in", () => {
  const profile = newProfile();
  const station = state.worldState.store;
  const previous = station.salv;
  delete station.salv;
  try {
    const mission = missionFromContract({ type: "salvage", tier: 1, p: 2, n: 2, r: 700 }, "salvage-hand-in");
    assert.equal(mission.steps[0].item, "salv");
    profile.missions.push(mission);
    const before = profile.cr;
    assert.equal(canCollectMissionReward(mission, profile), false);
    assert.equal(completeMission(0, profile), "Need 2 Salvage in this station or your ship.");
    assert.equal(profile.cr, before, "a missing delivery does not pay the reward");
    assert.equal(profile.missions.length, 1, "the completed objective stays claimable");

    station.salv = 1;
    profile.holds.wasp.salv = 1;
    assert.equal(canCollectMissionReward(mission, profile), true);
    assert.equal(completeMission(0, profile), "Paid 700 cr.");
    assert.equal(profile.cr, before + 700);
    assert.equal(station.salv, undefined, "station delivery stock is consumed");
    assert.equal(profile.holds.wasp.salv, undefined, "ship delivery stock is consumed");
    assert.equal(profile.missions.length, 0);
  } finally {
    if (previous === undefined) delete station.salv;
    else station.salv = previous;
  }
});

test("13a: the runner supports reach, deliver and survive objective events", () => {
  const profile = newProfile();
  const player = playerFor(profile);
  profile.missions.push({
    id: "story-shaped-test",
    title: "A mixed objective test",
    kind: "story",
    requires: [],
    steps: [
      { id: "reach", kind: "reach", place: "hollow", count: 1 },
      { id: "deliver", kind: "deliver", target: "station", item: "salv", count: 1 },
      { id: "survive", kind: "survive", count: 2 },
    ],
    rewards: { credits: 1 },
    fails: {},
    step: 0,
    current: 0,
    counters: {},
  });
  advanceMissions("place-entered", { id: "reach", player });
  assert.equal(missionProgress(profile.missions[0]).done, 0);
  advanceMissions("place-entered", { id: "hollow", player });
  advanceMissions("delivered", { target: "station", item: "salv", player });
  advanceMissions("mission-tick", { dt: 1, player });
  advanceMissions("mission-tick", { dt: 1, player });
  assert.equal(isMissionComplete(profile.missions[0]), true);
});

test("13a: v18 active contracts migrate to v19 missions and flags survive round trips", () => {
  const old = newSave();
  old.v = old.profile.v = old.world.v = 18;
  old.profile.mission = { type: "mine", tier: 2, p: 3, n: 10, r: 900, o: "cobalt" };
  old.profile.flags = { metArchivist: true };
  const save = sanitizeSave(old);
  assert.equal(SAVE_VERSION, 19);
  assert.equal(save.v, 19);
  assert.equal(save.profile.missions.length, 1);
  assert.equal(save.profile.missions[0].steps[0].kind, "mine");
  assert.equal(save.profile.missions[0].counters.objective, 3);
  assert.deepEqual(save.profile.flags, { metArchivist: true });

  const roundTrip = sanitizeSave(JSON.parse(JSON.stringify(save)));
  assert.deepEqual(roundTrip, save);
  assert.equal(roundTrip.profile.mission.p, 3, "the old singular view remains readable");
});

test("13a: objective events on the event bus reach the active runner", () => {
  const profile = newProfile();
  const player = playerFor(profile);
  profile.missions.push(missionFromContract({ type: "mine", tier: 1, p: 0, n: 1, r: 1, o: "ferrite" }, "bus-test"));
  emit("mined", { item: "ferrite", player });
  assert.equal(isMissionComplete(profile.missions[0]), true);
});
