// Step 13b: story dialogue, scripts, waits, flags, branching, parallel work
// and failure outcomes all use the same data mission runner.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BORDER_SIGNAL_MISSION, STORY_MISSIONS } from "../src/data/missions/story.js";
import { ENEMIES } from "../src/data/enemies.js";
import { isItem } from "../src/data/items.js";
import { featureById, isPocket } from "../src/data/places.js";
import { newProfile, newSave, sanitizeSave } from "../src/state/profile.js";
import {
  advanceMission,
  activeMissions,
  chooseMission,
  isMissionComplete,
  isMissionFailed,
  missionDialogue,
  missionProgress,
} from "../src/sim/missions.js";
import { emit, on } from "../src/util/events.js";
import { state } from "../src/state/state.js";

const clone = value => JSON.parse(JSON.stringify(value));
const playerFor = profile => ({ profile, place: "hollow" });

function freshStory(profile = newProfile()) {
  const mission = clone(BORDER_SIGNAL_MISSION);
  mission.step = 0;
  mission.current = 0;
  mission.counters = {};
  profile.missions.push(mission);
  return { profile, mission, player: playerFor(profile) };
}

function targetIds(step) {
  const out = [];
  for (const key of ["next", "goto", "then", "else", "ifTrue", "ifFalse"]) {
    if (step[key] !== undefined) out.push(step[key]);
  }
  for (const choice of step.choices || []) if (choice.next !== undefined) out.push(choice.next);
  return out;
}

test("13b: story data names valid ids and every top-level step is reachable", () => {
  assert.ok(STORY_MISSIONS.length > 0);
  for (const mission of STORY_MISSIONS) {
    const ids = new Set(mission.steps.map(step => step.id));
    assert.equal(ids.size, mission.steps.length, `${mission.id} has unique step ids`);
    for (const step of mission.steps) {
      for (const target of targetIds(step)) {
        assert.ok(ids.has(target) || Number(target) === mission.steps.length, `${mission.id} target ${target} exists`);
      }
      for (const child of step.steps || []) {
        assert.ok(child.id, `${mission.id} parallel child has an id`);
        assert.ok(["kill", "mine", "collect", "reach", "reach-sector", "survive", "wait"].includes(child.kind),
          `${mission.id} parallel child ${child.id} is an objective`);
      }
      if (step.item) assert.equal(isItem(step.item), true, `${mission.id} item ${step.item} exists`);
      if (step.enemy) assert.ok(ENEMIES[step.enemy], `${mission.id} enemy ${step.enemy} exists`);
      for (const action of (Array.isArray(step.action) ? step.action : step.action ? [step.action] : [])) {
        if (action.item) assert.equal(isItem(action.item), true, `${mission.id} script item ${action.item} exists`);
        if (action.enemy) assert.ok(ENEMIES[action.enemy], `${mission.id} script enemy ${action.enemy} exists`);
        const place = action.place || action.sector;
        if (place) assert.equal(isPocket(place), true, `${mission.id} script place ${place} exists`);
        if (place && action.feature) assert.ok(featureById(place, action.feature), `${mission.id} feature ${action.feature} exists`);
      }
    }
    const seen = new Set([mission.steps[0].id]);
    const todo = [0];
    while (todo.length) {
      const index = todo.shift();
      const step = mission.steps[index];
      const edges = targetIds(step);
      if (!edges.length && index + 1 < mission.steps.length) edges.push(mission.steps[index + 1].id);
      for (const target of edges) {
        const next = mission.steps.findIndex(candidate => candidate.id === target);
        if (next >= 0 && !seen.has(mission.steps[next].id)) {
          seen.add(mission.steps[next].id);
          todo.push(next);
        }
      }
    }
    assert.deepEqual([...seen].sort(), [...ids].sort(), `${mission.id} has no unreachable steps`);
  }
});

test("13b: dialogue choice changes the next step and the worked mission completes", () => {
  const { profile, mission, player } = freshStory();
  const previousWorld = state.worldState;
  const previousPlace = state.place;
  state.worldState = newSave().world;
  state.place = "hollow";
  const scripts = [];
  const capture = payload => { if (payload?.mission === mission) scripts.push(payload); };
  // The event bus intentionally has no remove API; filter by this mission so the
  // listener is harmless for the other tests in this process.
  on("mission-script", capture);
  try {
    assert.equal(missionDialogue(mission).line, "A weak signal is repeating beyond Kestrel Hollow.");
    assert.equal(advanceMission(mission, "dialogue-next", { player }), true);
    assert.equal(chooseMission(mission.id, "help", profile), true);
    assert.equal(profile.flags["story.border.helped"], true);
    assert.equal(mission.step, 2, "the choice takes the mission through its prepare script and brief");
    assert.equal(state.worldState.missionState.hollow.borderSignal, "active");

    advanceMission(mission, "dialogue-next", { player });
    assert.equal(mission.step, 4, "the brief advances through the spawn script");
    assert.equal(scripts.length, 1);
    assert.equal(scripts[0].action.kind, "spawn-wave");

    emit("mission-trigger", { trigger: "wave-clear", player, profile });
    assert.equal(mission.step, 5);
    emit("place-entered", { id: "hollow", player, profile });
    assert.equal(missionProgress(mission).done, 1, "one parallel objective is complete");
    emit("mission-tick", { dt: 2, player, profile });
    assert.equal(mission.step, 8, "parallel objectives and the flag branch advance the story");
    assert.equal(profile.holds.wasp.salv, 1, "the script gives the story item");
    assert.equal(missionDialogue(mission).speaker, "Archivist Vale");
    advanceMission(mission, "dialogue-next", { player });
    assert.equal(isMissionComplete(mission), true);
  } finally {
    state.worldState = previousWorld;
    state.place = previousPlace;
  }
});

test("13b: the alternate dialogue choice takes the decline branch", () => {
  const { profile, mission, player } = freshStory();
  advanceMission(mission, "dialogue-next", { player });
  assert.equal(chooseMission(mission.id, "decline", profile), true);
  assert.equal(profile.flags["story.border.helped"], false);
  assert.equal(mission.steps[mission.step].id, "declined");
  assert.equal(isMissionComplete(mission), false);
});

test("13b: wait steps support a timer and a player entering an area", () => {
  const profile = newProfile();
  const player = playerFor(profile);
  const mission = {
    id: "wait-shapes",
    title: "Wait shapes",
    kind: "story",
    steps: [
      { id: "timer", kind: "wait", seconds: 2 },
      { id: "area", kind: "wait", place: "hollow" },
    ],
    rewards: { credits: 0 },
    fails: {},
    step: 0,
    current: 0,
    counters: {},
  };
  profile.missions.push(mission);
  advanceMission(mission, "mission-tick", { dt: 1, player });
  assert.equal(mission.step, 0);
  advanceMission(mission, "mission-tick", { dt: 1, player });
  assert.equal(mission.step, 1);
  advanceMission(mission, "place-entered", { id: "reach", player });
  assert.equal(mission.step, 1);
  advanceMission(mission, "place-entered", { id: "hollow", player });
  assert.equal(isMissionComplete(mission), true);
});

test("13b: a mission saves dialogue progress and story state in the middle of a step", () => {
  const { profile, mission, player } = freshStory();
  advanceMission(mission, "dialogue-next", { player });
  profile.flags["story.border.helped"] = true;
  const save = newSave();
  save.profile = profile;
  save.world.missionState = { hollow: { borderSignal: "active" } };
  const loaded = sanitizeSave(save);
  assert.equal(loaded.profile.missions[0].step, 0);
  assert.equal(loaded.profile.missions[0].counters.intro, 1);
  assert.equal(loaded.profile.missions[0].steps[0].choices.length, 2);
  assert.equal(loaded.profile.flags["story.border.helped"], true);
  assert.deepEqual(loaded.world.missionState, save.world.missionState);
  assert.equal(missionDialogue(loaded.profile.missions[0]).line, "Will you find its source before it fades?");
});

test("13b: configured death failure removes the mission and reports its declared outcome", () => {
  const { profile, mission, player } = freshStory();
  const failures = [];
  on("mission-failed", payload => { if (payload?.mission === mission) failures.push(payload); });
  emit("player-dead", { player, profile });
  assert.equal(isMissionFailed(mission), true);
  assert.equal(activeMissions(profile).length, 0);
  assert.equal(failures[0].reason, "player-dead");
  assert.equal(failures[0].action, "abandon");
});

test("13b: the same declared failure policy handles leaving the sector and timing out", () => {
  const left = freshStory();
  emit("place-changed", { from: "hollow", to: "reach", player: left.player, profile: left.profile });
  assert.equal(isMissionFailed(left.mission), true);
  assert.equal(left.profile.missions.length, 0);

  const timed = freshStory();
  emit("mission-tick", { dt: 180, player: timed.player, profile: timed.profile });
  assert.equal(isMissionFailed(timed.mission), true);
  assert.equal(timed.profile.missions.length, 0);
});
