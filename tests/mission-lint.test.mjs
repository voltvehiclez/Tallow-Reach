// The mission linter runs over every authored mission, and is itself tested
// against deliberately broken missions so it cannot quietly stop catching things.
import { test } from "node:test";
import assert from "node:assert/strict";
import { STORY_MISSIONS, TEST_MISSIONS } from "../src/data/missions/index.js";
import { lintMission, missionErrors } from "../src/data/missions/validate.js";
import { MISSION_RULES } from "../src/data/missions/rules.js";
import { ambush, briefing, handOver, loadCargo, mission, radio, sequence, travelTo } from "../src/data/missions/templates.js";

const clone = value => JSON.parse(JSON.stringify(value));
const errorsOf = def => lintMission(def).filter(p => p.level === "error").map(p => p.message);
const hasError = (def, pattern) => errorsOf(def).some(message => pattern.test(message));

test("lint: every authored mission lints clean", () => {
  const all = [...STORY_MISSIONS, ...TEST_MISSIONS];
  assert.ok(all.length >= 5);
  for (const def of all) assert.deepEqual(missionErrors(def), [], `${def.id} has lint errors`);
  const ids = all.map(def => def.id);
  assert.equal(new Set(ids).size, ids.length, "mission ids are unique across story and test missions");
});

test("lint: test missions cover the mission shapes the campaign will use", () => {
  const ids = TEST_MISSIONS.map(def => def.id);
  for (const id of ["test.parcel-run", "test.radio-relay", "test.ore-run", "test.ambush-run"]) assert.ok(ids.includes(id), id);
  const kinds = new Set(TEST_MISSIONS.flatMap(def => def.steps.map(step => step.kind)));
  for (const kind of ["dialogue", "script", "reach-sector", "wait", "mine"]) assert.ok(kinds.has(kind), `a test mission uses ${kind}`);
  const channels = new Set(TEST_MISSIONS.flatMap(def => def.steps.filter(s => s.kind === "dialogue").map(s => s.requiresDock)));
  assert.deepEqual([...channels].sort(), [false, true], "both station and radio dialogue are exercised");
});

test("lint: authored missions are not offered by accident", () => {
  for (const def of TEST_MISSIONS) assert.ok(!STORY_MISSIONS.includes(def), `${def.id} is a test mission, not a story mission`);
});

// ---- the linter must catch each of these ------------------------------------------------

const good = () => clone(TEST_MISSIONS.find(def => def.id === "test.ambush-run"));

test("lint catches: a bare step number instead of a named step", () => {
  const def = good();
  def.steps[0].next = 2;
  assert.ok(hasError(def, /must be a step id or "end", not a number/));
});

test("lint catches: a step that names a step which does not exist", () => {
  const def = good();
  def.steps[0].next = "nowhere";
  assert.ok(hasError(def, /not a step in this mission/));
});

test("lint catches: a step with no `next` (it would fall off the end by accident)", () => {
  const def = good();
  delete def.steps[def.steps.length - 1].next;
  assert.ok(hasError(def, /must say where it goes/));
});

test("lint catches: a step with no player-facing objective", () => {
  const def = good();
  delete def.steps[1].objective;
  assert.ok(hasError(def, /needs a player-facing `objective`/));
});

test("lint catches: a dialogue that does not say station or radio", () => {
  const def = good();
  delete def.steps[0].requiresDock;
  assert.ok(hasError(def, /requiresDock: true.*or `false`/));
});

test("lint catches: a spawn with no distance, or one too close to the pilot", () => {
  const def = good();
  const spawn = def.steps.find(step => step.action?.kind === "spawn-wave");
  delete spawn.action.spawnDist;
  assert.ok(hasError(def, /spawnDist/));
  spawn.action.spawnDist = [50, 100];
  assert.ok(hasError(def, /too close/));
  spawn.action.spawnDist = [MISSION_RULES.minSpawnDistance, MISSION_RULES.minSpawnDistance + 1];
  assert.deepEqual(errorsOf(def), []);
});

test("lint catches: a spawn that runs while docked, and a script with no situation", () => {
  const def = good();
  const spawn = def.steps.find(step => step.action?.kind === "spawn-wave");
  spawn.requiresFlying = false;
  spawn.requiresDock = true;
  assert.ok(hasError(def, /spawn must run while the pilot is flying/));
  delete spawn.requiresDock;
  assert.ok(hasError(def, /exactly one of/));
});

test("lint catches: a mission item that is collected but never dropped", () => {
  const def = clone(STORY_MISSIONS[0]);
  for (const step of def.steps) delete step.action?.dropOnDefeat;
  assert.ok(hasError(def, /no earlier spawn drops it/));
});

test("lint catches: taking an item nothing ever gave", () => {
  const def = mission({
    id: "t.take", title: "t", fails: { on: ["player-dead"], action: "abandon", message: "Lost." },
    steps: [handOver({ id: "hand", place: "hollow", item: "parcel", objective: "Hand it over." })],
  });
  assert.ok(hasError(def, /no earlier step gives or drops it/));
});

test("lint catches: waiting for a wave nothing spawns", () => {
  const def = mission({ id: "t.wait", title: "t", steps: [{ id: "w", kind: "wait", trigger: "wave-clear", objective: "Wait." }] });
  assert.ok(hasError(def, /no earlier step spawns a wave/));
});

test("lint catches: the unimplemented `deliver` step", () => {
  const def = mission({ id: "t.deliver", title: "t", steps: [{ id: "d", kind: "deliver", item: "parcel", place: "hollow", objective: "Deliver." }] });
  assert.ok(hasError(def, /`deliver` has no event behind it/));
});

test("lint catches: unreachable steps and dead ends", () => {
  const def = good();
  def.steps[0].next = "done";
  assert.ok(hasError(def, /can never be reached/));
  const loop = mission({
    id: "t.loop", title: "t",
    steps: [radio({ id: "a", speaker: "x", lines: ["a"], objective: "a", next: "b" }), radio({ id: "b", speaker: "x", lines: ["b"], objective: "b", next: "a" })],
  });
  assert.ok(hasError(loop, /no path leads to the end/));
});

test("lint accepts: a mission item with no death rule (the framework fails it itself, with a message)", () => {
  const def = clone(TEST_MISSIONS.find(item => item.id === "test.parcel-run"));
  def.fails = {};
  assert.deepEqual(missionErrors(def), []);
});

test("lint catches: a failure with no message, and a bad failure reason", () => {
  const def = good();
  delete def.fails.message;
  assert.ok(hasError(def, /fails\.message/));
  def.fails.message = "Lost.";
  def.fails.on = ["boredom"];
  assert.ok(hasError(def, /not allowed/));
});

test("lint catches: unknown items, enemies and places", () => {
  const def = good();
  def.steps[1].place = "nowhere";
  assert.ok(hasError(def, /not a pocket/));
  const spawn = def.steps.find(step => step.action?.kind === "spawn-wave");
  spawn.action.enemy = "ghost";
  assert.ok(hasError(def, /enemy "ghost" does not exist/));
  const parcel = clone(TEST_MISSIONS.find(item => item.id === "test.parcel-run"));
  parcel.steps.find(step => step.id === "load").action.item = "unobtainium";
  assert.ok(hasError(parcel, /not in the catalogue/));
});

// ---- the templates keep their promises ----------------------------------------------------

test("templates: sequence fills in every `next`, ending at \"end\"", () => {
  const steps = sequence([
    briefing({ id: "a", speaker: "x", lines: ["hi"], objective: "a" }),
    travelTo({ id: "b", place: "hollow", objective: "b" }),
    radio({ id: "c", speaker: "x", lines: ["bye"], objective: "c" }),
  ]);
  assert.deepEqual(steps.map(step => step.next), ["b", "c", "end"]);
});

test("templates: a station briefing needs a dock, a radio call never does", () => {
  assert.equal(briefing({ id: "a", lines: ["x"], objective: "a" }).requiresDock, true);
  assert.equal(radio({ id: "a", lines: ["x"], objective: "a" }).requiresDock, false);
});

test("templates: ambush clamps a too-close spawn to the safe distance and flies the pilot first", () => {
  const [spawn, wait] = ambush({ id: "x", place: "hollow", spawnDist: [10, 20], objective: "Fight." });
  assert.ok(spawn.action.spawnDist[0] >= MISSION_RULES.minSpawnDistance);
  assert.equal(spawn.requiresFlying, true);
  assert.equal(wait.trigger, "wave-clear");
});

test("templates: cargo is loaded at the dock and handed over in flight", () => {
  const load = loadCargo({ id: "l", place: "reach", item: "parcel", objective: "Load." });
  const hand = handOver({ id: "h", place: "hollow", item: "parcel", objective: "Hand over." });
  assert.equal(load.requiresDock, true);
  assert.equal(hand.requiresFlying, true);
});
