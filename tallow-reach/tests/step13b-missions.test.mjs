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
  abandonMission,
  advanceMission,
  advanceMissions,
  activeMissions,
  chooseMission,
  completeMission,
  isMissionComplete,
  isMissionFailed,
  missionDialogue,
  missionNextText,
  missionProgress,
} from "../src/sim/missions.js";
import { emit, on } from "../src/util/events.js";
import { state } from "../src/state/state.js";
import "../src/sim/ai.js";
import { fire, hitHostile, spawnCrate } from "../src/sim/combat.js";
import { V } from "../src/util/math.js";

const clone = value => JSON.parse(JSON.stringify(value));
const playerFor = profile => ({ profile, place: "reach", docked: true });

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
      assert.equal(typeof step.objective, "string", `${mission.id} step ${step.id} has spoiler-safe objective data`);
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
    assert.equal(missionDialogue(mission).requiresDock, true, "the station contact is explicitly dock-gated");
    assert.equal(advanceMission(mission, "dialogue-next", { player }), true);
    assert.equal(chooseMission(mission.id, "help", profile), true);
    assert.equal(profile.flags["story.border.helped"], true);
    assert.equal(mission.step, 1, "the choice opens the station briefing without changing the world");
    assert.equal(state.worldState.missionState.hollow, undefined, "the briefing does not activate the remote sector");

    advanceMission(mission, "dialogue-next", { player });
    assert.equal(mission.step, 2, "the briefing gives the player a travel objective");
    assert.equal(scripts.length, 0, "dialogue buttons do not spawn the patrol");

    player.place = "hollow";
    player.docked = false;
    emit("place-entered", { id: "hollow", player, profile });
    assert.equal(mission.step, 5, "entering Hollow activates the sector and starts the patrol");
    assert.equal(state.worldState.missionState.hollow.borderSignal, "active");
    assert.equal(scripts.length, 1);
    assert.equal(scripts[0].action.kind, "spawn-wave");

    player.place = "hollow";
    emit("mission-trigger", { trigger: "wave-clear", player, profile });
    assert.equal(mission.step, 6);
    assert.equal(missionProgress(mission).done, 1, "one parallel objective is complete");
    emit("mission-tick", { dt: 2, player, profile });
    assert.equal(mission.step, 9, "parallel objectives and the flag branch advance the story");
    assert.equal(profile.holds.wasp.salv, 1, "the script gives the story item");
    assert.equal(missionDialogue(mission).speaker, "Archivist Vale");
    assert.equal(missionDialogue(mission).requiresDock, false, "the beacon handoff can continue in the field");
    advanceMission(mission, "dialogue-next", { player });
    assert.equal(isMissionComplete(mission), true);
  } finally {
    state.worldState = previousWorld;
    state.place = previousPlace;
  }
});

test("13b: a completed mission remains claimable after leaving its origin sector", () => {
  const { profile, mission, player } = freshStory();
  const previousWorld = state.worldState;
  const previousPlace = state.place;
  const previousPlaces = state.places;
  state.worldState = newSave().world;
  state.place = "hollow";
  state.places = new Map();
  try {
    advanceMission(mission, "dialogue-next", { player });
    chooseMission(mission.id, "help", profile);
    advanceMission(mission, "dialogue-next", { player });
    player.place = "hollow";
    player.docked = false;
    emit("place-entered", { id: "hollow", player, profile });
    emit("mission-trigger", { trigger: "wave-clear", mission: mission.id, player, profile });
    emit("mission-tick", { dt: 2, player, profile });
    advanceMission(mission, "dialogue-next", { player });
    assert.equal(isMissionComplete(mission), true);

    emit("place-changed", { from: "hollow", to: "reach", player, profile });
    assert.equal(isMissionFailed(mission), false, "returning home cannot fail a completed mission");
    assert.equal(activeMissions(profile).length, 1, "the completed mission stays available to collect");
    assert.equal(completeMission(0, profile), "Paid 300 cr.");
    assert.equal(activeMissions(profile).length, 0);
  } finally {
    state.worldState = previousWorld;
    state.place = previousPlace;
    state.places = previousPlaces;
  }
});

test("13b: a mission wave emits wave-clear and preserves an already-reached search place", () => {
  const { profile, mission, player } = freshStory();
  const previousWorld = state.worldState;
  const previousPlace = state.place;
  const previousPlaces = state.places;
  state.worldState = newSave().world;
  state.place = "hollow";
  state.places = new Map();
  try {
    advanceMission(mission, "dialogue-next", { player });
    chooseMission(mission.id, "help", profile);
    advanceMission(mission, "dialogue-next", { player });
    assert.equal(mission.steps[mission.step].id, "travel", "the story waits for the player to enter Hollow");
    player.place = "hollow";
    player.docked = false;
    emit("place-entered", { id: "hollow", player, profile });
    assert.equal(mission.steps[mission.step].id, "wait", "entering Hollow starts the spawned wave");
    const wave = [...state.places.get("hollow").entities.enemies];
    assert.equal(wave.length, 2, "the mission script spawns both patrol ships");
    assert.ok(wave.every(enemy => enemy.encounter === `mission:${mission.id}`), "the wave is tagged to its mission");

    for (const enemy of wave) hitHostile(enemy, 999, enemy.pos, player, "hollow");
    assert.equal(mission.steps[mission.step].id, "search", "the last mission ship wakes the wave-clear wait");
    assert.equal(missionProgress(mission).done, 1, "being in Hollow already satisfies the reach half of search");
  } finally {
    state.worldState = previousWorld;
    state.place = previousPlace;
    state.places = previousPlaces;
  }
});

test("13b: a full hold pauses the beacon handoff instead of abandoning the mission", () => {
  const { profile, mission, player } = freshStory();
  const previousWorld = state.worldState;
  const previousPlace = state.place;
  const previousPlaces = state.places;
  state.worldState = newSave().world;
  state.place = "hollow";
  state.places = new Map();
  try {
    advanceMission(mission, "dialogue-next", { player });
    chooseMission(mission.id, "help", profile);
    advanceMission(mission, "dialogue-next", { player });
    assert.equal(mission.steps[mission.step].id, "travel", "the briefing only gives the player a travel objective");

    player.place = "hollow";
    player.docked = false;
    emit("place-entered", { id: "hollow", player, profile });
    assert.equal(mission.steps[mission.step].id, "wait", "the patrol starts after entering Hollow, not from a dialogue click");
    const wave = [...state.places.get("hollow").entities.enemies];
    assert.equal(wave.length, 2);
    profile.holds.wasp.salv = 20; // fill the 20 m³ hold before the two kills
    for (const enemy of wave) hitHostile(enemy, 999, enemy.pos, player, "hollow");
    emit("mission-tick", { dt: 2, player, profile });

    assert.equal(mission.steps[mission.step].id, "reward-item", "the blocked handoff remains the current step");
    assert.equal(activeMissions(profile).length, 1, "a full hold does not abandon the mission");
    assert.equal(missionNextText(mission, profile), "Make room in your hold to continue.");

    emit("place-changed", { from: "hollow", to: "reach", player, profile });
    assert.equal(activeMissions(profile).length, 1, "returning to the station does not fail the pending handoff");
    delete profile.holds.wasp.salv;
    emit("mission-inventory-changed", { player, profile });
    assert.equal(mission.steps[mission.step].id, "finish", "freeing cargo retries the pending handoff");
    assert.equal(profile.holds.wasp.salv, 1, "the beacon is delivered exactly once");
  } finally {
    state.worldState = previousWorld;
    state.place = previousPlace;
    state.places = previousPlaces;
  }
});

test("13b: abandoning a story mission removes its scripted wave", () => {
  const { profile, mission, player } = freshStory();
  const previousWorld = state.worldState;
  const previousPlace = state.place;
  const previousPlaces = state.places;
  state.worldState = newSave().world;
  state.place = "hollow";
  state.places = new Map();
  try {
    advanceMission(mission, "dialogue-next", { player });
    chooseMission(mission.id, "help", profile);
    advanceMission(mission, "dialogue-next", { player });
    player.place = "hollow";
    player.docked = false;
    emit("place-entered", { id: "hollow", player, profile });
    const W = state.places.get("hollow").entities;
    assert.equal(W.enemies.length, 2, "the mission has a live scripted wave before abandonment");
    fire(W.enemies[0].pos, V(0, 0, -1), 1, false, 1, null, "hollow", mission.id);
    spawnCrate(V(0, 0, 0), "salv", "hollow", null, null, mission.id);
    assert.equal(W.bullets.length, 1, "mission hostile shots carry the mission identity");
    assert.equal(W.crates.length, 1, "mission loot carries the mission identity");

    assert.equal(abandonMission(mission.id, profile), "Mission abandoned.");
    assert.equal(activeMissions(profile).length, 0);
    assert.equal(W.enemies.length, 0, "abandoning the mission removes its NPCs");
    assert.equal(W.bullets.length, 0, "abandoning the mission removes its shots");
    assert.equal(W.crates.length, 0, "abandoning the mission removes its loot");
  } finally {
    state.worldState = previousWorld;
    state.place = previousPlace;
    state.places = previousPlaces;
  }
});

test("13b: mission-scoped triggers do not advance another waiting mission", () => {
  const makeWaiter = id => ({
    id,
    title: id,
    kind: "story",
    steps: [{ id: "wait", kind: "wait", trigger: "wave-clear", count: 1 }],
    rewards: { credits: 0 },
    fails: {},
    step: 0,
    current: 0,
    counters: {},
  });
  const profile = newProfile();
  const first = makeWaiter("story.first");
  const second = makeWaiter("story.second");
  profile.missions.push(first, second);
  advanceMissions("mission-trigger", { trigger: "wave-clear", mission: first.id, profile });
  assert.equal(isMissionComplete(first), true);
  assert.equal(isMissionComplete(second), false, "the other story does not consume the first story's wave");
});

test("13b: a blocked item script waits instead of silently losing the item", () => {
  const profile = newProfile();
  const player = playerFor(profile);
  const previousWorld = state.worldState;
  const previousPlace = state.place;
  state.worldState = newSave().world;
  state.place = "reach";
  profile.holds.wasp.ferrite = 25;
  const mission = {
    id: "blocked-item-script",
    title: "Blocked item script",
    kind: "story",
    steps: [
      { id: "give", kind: "script", action: { kind: "give-item", target: "ship", item: "salv", count: 1 }, next: "done" },
      { id: "done", kind: "dialogue", lines: ["Done."] },
    ],
    rewards: { credits: 0 },
    fails: {},
    step: 0,
    current: 0,
    counters: {},
  };
  profile.missions.push(mission);
  try {
    assert.equal(advanceMission(mission, "mission-tick", { dt: 1, player, profile }), false);
    assert.equal(mission.step, 0);
    assert.equal(profile.holds.wasp.salv, undefined);

    delete profile.holds.wasp.ferrite;
    assert.equal(advanceMission(mission, "mission-tick", { dt: 1, player, profile }), true);
    assert.equal(mission.steps[mission.step].id, "done");
    assert.equal(profile.holds.wasp.salv, 1);
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

test("13b: leaving while dialogue is open does not abandon the mission", () => {
  const stale = freshStory();
  stale.player.docked = false;
  assert.equal(advanceMission(stale.mission, "dialogue-next", { player: stale.player, profile: stale.profile }), false,
    "the runner rejects a stale station-dialogue advance in flight");
  assert.equal(stale.mission.counters.intro || 0, 0);

  const station = freshStory();
  emit("place-changed", { from: "hollow", to: "reach", player: station.player, profile: station.profile });
  assert.equal(isMissionFailed(station.mission), false, "a pending station conversation can be resumed after redocking");
  assert.equal(activeMissions(station.profile).length, 1);

  const beacon = freshStory();
  beacon.mission.step = 8;
  emit("place-changed", { from: "hollow", to: "reach", player: beacon.player, profile: beacon.profile });
  assert.equal(isMissionFailed(beacon.mission), false, "warping with the beacon line open does not lose the mission");
  assert.equal(activeMissions(beacon.profile).length, 1);
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

test("13b: leaving or waiting does not silently fail the border mission", () => {
  const left = freshStory();
  left.mission.step = 3; // a non-dialogue objective remains resumable after returning home
  emit("place-changed", { from: "hollow", to: "reach", player: left.player, profile: left.profile });
  assert.equal(isMissionFailed(left.mission), false);
  assert.equal(left.profile.missions.length, 1);

  const timed = freshStory();
  emit("mission-tick", { dt: 180, player: timed.player, profile: timed.profile });
  assert.equal(isMissionFailed(timed.mission), false);
  assert.equal(timed.profile.missions.length, 1);
});
