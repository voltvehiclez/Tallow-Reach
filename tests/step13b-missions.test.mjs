// Step 13b: story dialogue, scripts, waits, flags, branching, parallel work
// and failure outcomes all use the same data mission runner.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BORDER_SIGNAL_MISSION, STORY_MISSIONS } from "../src/data/missions/story.js";
import { ENEMIES } from "../src/data/enemies.js";
import { isItem, itemName } from "../src/data/items.js";
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
import { loadPlace } from "../src/sim/places.js";
import { fire, hitHostile, spawnCrate, updateCrates } from "../src/sim/combat.js";
import { clearWorldObjects } from "../src/sim/world.js";
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
        assert.ok(ids.has(target) || target === "end" || Number(target) === mission.steps.length, `${mission.id} target ${target} exists`);
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
        if (action.dropOnDefeat?.item) assert.equal(isItem(action.dropOnDefeat.item), true,
          `${mission.id} authored defeat item ${action.dropOnDefeat.item} exists`);
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
  const reward = BORDER_SIGNAL_MISSION.steps.find(step => step.id === "reward-item");
  assert.equal(itemName(reward.item), "Beacon", "the Border Signal catalogue item is actually named Beacon");
  assert.match(`${reward.log} ${reward.objective}`, /beacon/i,
    "the retrieval dialogue and objective use the same player-facing item name");
  assert.equal(reward.item, "beacon", "the authored story step does not reuse generic salvage");
  const spawn = BORDER_SIGNAL_MISSION.steps.find(step => step.id === "spawn");
  assert.equal(spawn.action.dropOnDefeat.item, "beacon", "the authored defeat drop matches the collect objective");
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
    assert.equal(chooseMission(mission.id, "help", profile, player), true);
    assert.equal(profile.flags["story.border.helped"], true);
    assert.equal(mission.step, 1, "the choice opens the station briefing without changing the world");
    assert.equal(missionDialogue(mission).line, "The signal is inside the hollow. Follow it and report what you find.",
      "the briefing gives a spoiler-safe investigation instruction");
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
    assert.equal(mission.step, 8, "parallel objectives and the flag branch advance to the physical retrieval");
    assert.equal(mission.steps[mission.step].kind, "collect");
    assert.equal(mission.steps[mission.step].missionItem, true, "the authored reward is a mission-tagged pickup");
    assert.equal(profile.holds.wasp.beacon || 0, 0, "the item is not silently awarded by the mission script");
    assert.equal(mission.steps[mission.step].item, "beacon", "the physical item id is the authored Beacon");
    assert.equal(missionDialogue(mission), null, "the physical retrieval has no scripted handoff dialogue");

    profile.holds.wasp.beacon = 1;
    emit("pickup", { item: "beacon", missionId: mission.id, missionItem: true, place: "hollow", player, profile });
    assert.equal(mission.step, 9, "only the successful mission pickup advances the story");
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
    chooseMission(mission.id, "help", profile, player);
    advanceMission(mission, "dialogue-next", { player });
    player.place = "hollow";
    player.docked = false;
    emit("place-entered", { id: "hollow", player, profile });
    emit("mission-trigger", { trigger: "wave-clear", mission: mission.id, player, profile });
    emit("mission-tick", { dt: 2, player, profile });
    assert.equal(mission.steps[mission.step].id, "reward-item");
    profile.holds.wasp.beacon = 1;
    emit("pickup", { item: "beacon", missionId: mission.id, missionItem: true, place: "hollow", player, profile });
    advanceMission(mission, "dialogue-next", { player });
    assert.equal(isMissionComplete(mission), true);

    emit("place-changed", { from: "hollow", to: "reach", player, profile });
    assert.equal(isMissionFailed(mission), false, "returning home cannot fail a completed mission");
    assert.equal(activeMissions(profile).length, 1, "the completed mission stays available to collect");
    delete profile.holds.wasp.beacon;
    const before = profile.cr;
    assert.equal(completeMission(0, profile), "Need 1 Beacon in this station or your ship.",
      "a completed story mission stays claimable when its item is missing");
    assert.equal(profile.cr, before, "a missing story item does not pay the reward");
    assert.equal(activeMissions(profile).length, 1, "a missing story item does not remove the mission");
    profile.holds.wasp.beacon = 1;
    assert.equal(completeMission(0, profile), "Paid 300 cr.");
    assert.equal(profile.holds.wasp.beacon, undefined, "the exact story item is consumed at hand-in");
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
    chooseMission(mission.id, "help", profile, player);
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
    player.place = "reach";
    emit("mission-tick", { dt: 2, player, profile });
    assert.equal(mission.steps[mission.step].id, "search", "holding position in the wrong place does not advance the search");
    player.place = "hollow";
    emit("mission-tick", { dt: 2, player, profile });
    assert.equal(mission.steps[mission.step].id, "reward-item", "returning to the signal resumes the pending hold before the physical pickup");
  } finally {
    state.worldState = previousWorld;
    state.place = previousPlace;
    state.places = previousPlaces;
  }
});

test("13b: dialogue cannot execute a following world script", () => {
  const profile = newProfile();
  const player = playerFor(profile);
  const previousWorld = state.worldState;
  state.worldState = newSave().world;
  const mission = {
    id: "dialogue-world-gate",
    title: "Dialogue world gate",
    kind: "story",
    steps: [
      {
        id: "talk",
        kind: "dialogue",
        requiresDock: true,
        lines: ["Ready?", "Go."],
        choices: [{ id: "go", text: "Go", next: "world" }],
      },
      {
        id: "world",
        kind: "script",
        place: "hollow",
        action: { kind: "set-sector-state", place: "hollow", set: { tested: true } },
        next: "done",
      },
      { id: "done", kind: "dialogue", requiresDock: false, lines: ["Done."] },
    ],
    rewards: { credits: 0 },
    fails: {},
    step: 0,
    current: 0,
    counters: {},
  };
  profile.missions.push(mission);
  try {
    advanceMission(mission, "dialogue-next", { player });
    assert.equal(chooseMission(mission.id, "go", profile, player), true);
    assert.equal(mission.steps[mission.step].id, "world");
    assert.equal(state.worldState.missionState?.hollow, undefined,
      "the dialogue choice only changes conversation state");
    player.place = "hollow";
    player.docked = false;
    emit("place-entered", { id: "hollow", player, profile });
    assert.equal(state.worldState.missionState.hollow.tested, true,
      "the arrival event executes the pending world script");
  } finally {
    state.worldState = previousWorld;
  }
});

test("13b: arrival waits for warp-end before changing the remote world", () => {
  const { profile, mission, player } = freshStory();
  const previousWorld = state.worldState;
  const previousPlace = state.place;
  const previousPlaces = state.places;
  state.worldState = newSave().world;
  state.place = "reach";
  state.places = new Map();
  try {
    advanceMission(mission, "dialogue-next", { player });
    chooseMission(mission.id, "help", profile, player);
    advanceMission(mission, "dialogue-next", { player });
    player.place = "hollow";
    player.docked = false;
    player.warp = { from: "reach", to: "hollow" };
    emit("place-entered", { id: "hollow", player, profile });
    assert.equal(mission.steps[mission.step].id, "prepare", "arrival does not run world scripts during warp");
    assert.equal(state.worldState.missionState.hollow, undefined);
    player.warp = null;
    emit("warp-end", { from: "reach", to: "hollow", player, profile });
    assert.equal(mission.steps[mission.step].id, "wait", "the pending arrival work resumes after warp");
    assert.equal(state.worldState.missionState.hollow.borderSignal, "active");
    assert.equal(state.places.get("hollow").entities.enemies.length, 2);
  } finally {
    state.worldState = previousWorld;
    state.place = previousPlace;
    state.places = previousPlaces;
  }
});

test("13b: a full hold leaves the physical beacon in Hollow until it is picked up", () => {
  const { profile, mission, player } = freshStory();
  const previousWorld = state.worldState;
  const previousPlace = state.place;
  const previousPlaces = state.places;
  const previousPlayers = state.players;
  const previousProfile = state.profile;
  state.worldState = newSave().world;
  state.place = "hollow";
  state.places = new Map();
  state.profile = profile;
  player.pos = V(0, 0, 0);
  player.dead = false;
  state.players = [player];
  state.localPlayerIndex = 0;
  try {
    advanceMission(mission, "dialogue-next", { player });
    chooseMission(mission.id, "help", profile, player);
    advanceMission(mission, "dialogue-next", { player });
    assert.equal(mission.steps[mission.step].id, "travel", "the briefing only gives the player a travel objective");

    player.place = "hollow";
    player.docked = false;
    emit("place-entered", { id: "hollow", player, profile });
    assert.equal(mission.steps[mission.step].id, "wait", "the patrol starts after entering Hollow, not from a dialogue click");
    const wave = [...state.places.get("hollow").entities.enemies];
    assert.equal(wave.length, 2);
    const carrierPosition = wave[0].pos.clone();
    profile.holds.wasp.salv = 19;
    profile.holds.wasp.beacon = 1; // fill the 20 m³ hold before the two kills
    for (const enemy of wave) hitHostile(enemy, 999, enemy.pos, player, "hollow");
    emit("mission-tick", { dt: 2, player, profile });

    const W = state.places.get("hollow").entities;
    const missionCrate = W.crates.find(crate => crate.missionId === mission.id && crate.persistent);
    assert.ok(missionCrate, "the relevant hostile leaves one mission-tagged crate at its defeat position");
    assert.equal(W.crates.filter(crate => crate.missionId === mission.id && crate.persistent).length, 1,
      "the authored mission item is dropped exactly once");
    assert.equal(missionCrate.pos.distanceTo(carrierPosition), 0, "the mission crate is dropped at the defeating NPC's location");
    assert.equal(mission.steps[mission.step].id, "reward-item", "the physical retrieval is the current objective");
    assert.equal(activeMissions(profile).length, 1, "a full hold does not abandon the mission");
    player.pos.copy(missionCrate.pos);
    updateCrates(1, "hollow");
    assert.ok(W.crates.includes(missionCrate), "a full hold cannot collect the mission crate");
    assert.equal(profile.holds.wasp.beacon, 1, "a blocked pickup adds no item");

    player.place = "reach";
    player.docked = true;
    state.place = "reach";
    emit("place-changed", { from: "hollow", to: "reach", player, profile });
    delete profile.holds.wasp.beacon;
    emit("mission-inventory-changed", { player, profile });
    assert.equal(mission.steps[mission.step].id, "reward-item", "station unloading cannot complete a remote physical objective");
    assert.equal(profile.holds.wasp.beacon || 0, 0, "the mission item was not silently moved into cargo");
    assert.ok(W.crates.includes(missionCrate), "the crate remains in Hollow while the pilot is away");

    player.place = "hollow";
    player.docked = false;
    player.warp = { from: "reach", to: "hollow" };
    state.place = "hollow";
    emit("place-entered", { id: "hollow", player, profile });
    assert.equal(mission.steps[mission.step].id, "reward-item", "arrival alone does not collect the crate");
    player.warp = null;
    emit("warp-end", { from: "reach", to: "hollow", player, profile });
    player.pos.copy(missionCrate.pos);
    // Remove ordinary patrol loot from this focused pickup check; the physical
    // mission crate itself is still the only object being collected here.
    W.crates = [missionCrate];
    updateCrates(0, "hollow");
    assert.equal(mission.steps[mission.step].id, "finish", "the mission advances only after the physical pickup");
    assert.equal(profile.holds.wasp.beacon, 1, "one successful pickup adds exactly one mission item");
    assert.equal(W.crates.length, 0, "the collected crate leaves the world");
  } finally {
    state.worldState = previousWorld;
    state.place = previousPlace;
    state.places = previousPlaces;
    state.players = previousPlayers;
    state.profile = previousProfile;
  }
});

test("13b: a mission crate survives departure, save/load and re-entry without duplication", () => {
  const profile = newProfile();
  const mission = clone(BORDER_SIGNAL_MISSION);
  mission.step = 8;
  mission.current = 8;
  mission.counters = {};
  profile.missions.push(mission);
  const previousWorld = state.worldState;
  const previousPlace = state.place;
  const previousPlaces = state.places;
  const previousPlayers = state.players;
  const previousProfile = state.profile;
  state.worldState = newSave().world;
  state.profile = profile;
  state.place = "hollow";
  state.places = new Map();
  const player = { profile, place: "hollow", docked: false, dead: false, pos: V(0, 0, 0) };
  state.players = [player];
  state.localPlayerIndex = 0;
  try {
    const crate = spawnCrate(V(123, -4, 567), "beacon", "hollow", null, null, mission.id);
    assert.ok(crate, "the authored mission item is a physical crate");
    assert.deepEqual(crate.pos.toArray(), [123, -4, 567], "the crate starts at the authored defeat position");
    assert.equal(state.worldState.missionState.hollow.drops.length, 1, "the defeat creates one saved mission drop");

    clearWorldObjects("hollow");
    assert.equal(state.places.get("hollow").entities.crates.length, 1, "warping away does not erase the mission crate");
    const save = sanitizeSave(JSON.parse(JSON.stringify({ v: 19, profile, world: state.worldState })));
    assert.equal(save.world.missionState.hollow.drops[0].collected, false, "the uncollected drop is part of the save");

    state.profile = save.profile;
    state.worldState = save.world;
    state.place = "hollow";
    state.places = new Map();
    player.profile = save.profile;
    loadPlace("hollow");
    loadPlace("hollow");
    const restored = state.places.get("hollow").entities.crates;
    assert.equal(restored.length, 1, "re-entry rebuilds one visible mission crate, not a duplicate");
    assert.deepEqual(restored[0].pos.toArray(), [123, -4, 567], "save/load keeps the defeat position");

    player.pos.copy(restored[0].pos);
    updateCrates(0, "hollow");
    assert.equal(restored.length, 0, "the crate leaves only after a physical pickup");
    assert.equal(save.profile.holds.wasp.beacon, 1, "pickup uses the normal one-unit cargo transfer");
    assert.equal(mission.step, 8, "the old object is not used to advance a different in-memory mission");
    assert.equal(save.profile.missions[0].step, 9, "the saved mission advances from the normal pickup event");
    assert.equal(save.world.missionState.hollow.drops[0].collected, true, "the consumed marker prevents a retry drop");

    state.places = new Map();
    loadPlace("hollow");
    assert.equal(state.places.get("hollow").entities.crates.length, 0, "a collected mission item is not recreated on reload");
  } finally {
    state.worldState = previousWorld;
    state.place = previousPlace;
    state.places = previousPlaces;
    state.players = previousPlayers;
    state.profile = previousProfile;
  }
});

test("13b: a pre-physical Border Signal save gets a fallback crate instead of soft-locking", () => {
  const profile = newProfile();
  const legacyMission = clone(BORDER_SIGNAL_MISSION);
  legacyMission.steps[8] = {
    id: "reward-item",
    kind: "script",
    place: "hollow",
    action: { kind: "give-item", target: "ship", item: "salv", count: 1 },
    next: "finish",
  };
  legacyMission.step = 8;
  legacyMission.current = 8;
  legacyMission.counters = {};
  profile.missions.push(legacyMission);
  const previousWorld = state.worldState;
  const previousPlace = state.place;
  const previousPlaces = state.places;
  const previousProfile = state.profile;
  const save = sanitizeSave(JSON.parse(JSON.stringify({ v: 19, profile, world: newSave().world })));
  const mission = save.profile.missions[0];
  state.worldState = save.world;
  state.profile = save.profile;
  state.place = "hollow";
  state.places = new Map();
  try {
    loadPlace("hollow");
    const crates = state.places.get("hollow").entities.crates;
    assert.equal(mission.steps[mission.step].kind, "collect", "the old script step migrates to a physical collect objective");
    assert.equal(mission.steps[mission.step].item, "beacon", "the migrated Border Signal objective uses the Beacon id");
    assert.equal(crates.length, 1, "an older save waiting for the handoff receives one recoverable crate");
    assert.equal(crates[0].missionId, mission.id);
    assert.equal(crates[0].item, "beacon", "the fallback converts the old salv reference to a Beacon");
    assert.equal(crates[0].persistent, true);
    assert.equal(state.worldState.missionState.hollow.drops.length, 1, "the fallback gets the same saved-drop bookkeeping");
  } finally {
    state.worldState = previousWorld;
    state.place = previousPlace;
    state.places = previousPlaces;
    state.profile = previousProfile;
  }
});

test("13b: old Border Signal mission-drop records migrate salv to Beacon", () => {
  const profile = newProfile();
  const mission = clone(BORDER_SIGNAL_MISSION);
  mission.step = 8;
  mission.current = 8;
  mission.counters = {};
  profile.missions.push(mission);
  const world = newSave().world;
  world.missionState = {
    hollow: {
      drops: [{ missionId: mission.id, item: "salv", pos: [12, -3, 45], collected: false }],
    },
  };
  const save = sanitizeSave(JSON.parse(JSON.stringify({ v: 19, profile, world })));
  assert.equal(save.world.missionState.hollow.drops[0].item, "beacon");
  const previousWorld = state.worldState;
  const previousProfile = state.profile;
  const previousPlace = state.place;
  const previousPlaces = state.places;
  try {
    state.worldState = save.world;
    state.profile = save.profile;
    state.place = "hollow";
    state.places = new Map();
    loadPlace("hollow");
    const crates = state.places.get("hollow").entities.crates;
    assert.equal(crates.length, 1);
    assert.equal(crates[0].item, "beacon");
    assert.deepEqual(crates[0].pos.toArray(), [12, -3, 45]);
  } finally {
    state.worldState = previousWorld;
    state.profile = previousProfile;
    state.place = previousPlace;
    state.places = previousPlaces;
  }
});

test("13b: a multi-action resource handoff preflights as one unit", () => {
  const profile = newProfile();
  profile.holds.wasp.salv = 19;
  const mission = {
    id: "batch-handoff",
    title: "Batch handoff",
    kind: "story",
    steps: [
      {
        id: "handoff",
        kind: "script",
        objective: "Secure the recovered items.",
        action: [
          { kind: "give-item", target: "ship", item: "salv", count: 1 },
          { kind: "give-item", target: "ship", item: "core", count: 1 },
        ],
        next: "done",
      },
      { id: "done", kind: "dialogue", lines: ["Done."] },
    ],
    rewards: { credits: 0 },
    fails: {},
    step: 0,
    current: 0,
    counters: {},
  };
  profile.missions.push(mission);
  const player = playerFor(profile);
  player.place = "hollow";
  player.docked = false;
  assert.equal(advanceMission(mission, "mission-tick", { dt: 0, player, profile }), false,
    "the whole handoff waits when the combined batch does not fit");
  assert.equal(profile.holds.wasp.salv, 19, "a blocked batch does not partially transfer its first item");
  assert.equal(profile.holds.wasp.core || 0, 0);
  delete profile.holds.wasp.salv;
  emit("mission-inventory-changed", { player, profile });
  assert.equal(mission.steps[mission.step].id, "done");
  assert.equal(profile.holds.wasp.salv, 1);
  assert.equal(profile.holds.wasp.core, 1);
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
    chooseMission(mission.id, "help", profile, player);
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
    assert.equal(state.worldState.missionState.hollow?.drops, undefined, "abandoning removes the persisted mission item too");
    assert.ok(spawnCrate(V(0, 0, 0), "salv", "hollow", null, null, mission.id),
      "a later retry can create one fresh mission item instead of inheriting a stale marker");
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
  assert.equal(chooseMission(mission.id, "decline", profile, player), true);
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
  player.place = "hollow";
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
  beacon.mission.step = 9;
  beacon.player.docked = false;
  emit("place-changed", { from: "hollow", to: "reach", player: beacon.player, profile: beacon.profile });
  assert.equal(isMissionFailed(beacon.mission), false, "warping with the beacon line open does not lose the mission");
  assert.equal(activeMissions(beacon.profile).length, 1);
});

test("13b: dying does not fail the border mission, but dying with the beacon aboard does, with a message", () => {
  const plain = freshStory();
  emit("player-dead", { player: plain.player, profile: plain.profile, lost: { ore: 4 } });
  assert.equal(isMissionFailed(plain.mission), false, "death alone leaves the mission active");
  assert.equal(activeMissions(plain.profile).length, 1);

  const { profile, mission, player } = freshStory();
  const failures = [];
  on("mission-failed", payload => { if (payload?.mission === mission) failures.push(payload); });
  emit("player-dead", { player, profile, lost: { beacon: 1 } });
  assert.equal(isMissionFailed(mission), true);
  assert.equal(activeMissions(profile).length, 0);
  assert.equal(failures[0].reason, "player-dead");
  assert.equal(failures[0].action, "abandon");
  assert.match(failures[0].message, /destroyed.*Beacon|destroyed.*beacon/i, "the message says why");
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
