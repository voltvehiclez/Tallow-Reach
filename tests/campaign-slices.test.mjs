// Campaign slices B–G: the act boundaries, dialogue pacing, the failure and
// checkpoint framework, optional bonuses and the story-actor vocabulary.
//
// Everything here is data or a runner rule; no browser is involved.

import { test } from "node:test";
import assert from "node:assert/strict";

import { generateGalaxy } from "../src/sim/galaxy.js";
import { setPlaceCatalog } from "../src/data/places.js";
import { CAMPAIGN_GALAXY, CAMPAIGN_GALAXY_SEED, CAMPAIGN_HOME_POCKET } from "../src/data/campaign/galaxy.js";

const catalog = generateGalaxy(CAMPAIGN_GALAXY_SEED, CAMPAIGN_GALAXY, { places: {}, links: {}, removedPlaces: [], removedLinks: [] });
setPlaceCatalog(catalog);

const { CAMPAIGN_MISSIONS } = await import("../src/data/campaign/index.js");
const { campaignTravelRefusal, campaignDockRefusal } = await import("../src/sim/campaign.js");
const {
  acceptMission, advanceMission, missionDialogue, failMission, isMissionFailed, missionObjectivesDone,
  missionOptionalRows, missionBonus, instantiateStoryMission, resumeMissionAtCheckpoint, missionStep,
} = await import("../src/sim/missions.js");
const { MISSION_CONTROLS, controlHeld, dialogueReadSeconds, MISSION_RULES } = await import("../src/data/missions/rules.js");
const { ENEMIES } = await import("../src/data/enemies.js");
const { FLIGHT_COURSES } = await import("../src/data/flight-courses.js");
const { startCourseAtBeginning } = await import("../src/sim/flight-course.js");
const { spawnEnemy } = await import("../src/sim/ai.js");
const { placeWorld } = await import("../src/state/state.js");
const { on } = await import("../src/util/events.js");

/** A running campaign with the local pilot in the school pocket. */
async function campaignWorld({ docked = false } = {}) {
  const { state, applySave, resetPlaces, newRootSave } = await import("../src/state/state.js");
  const { prepareGalaxySave, switchGameMode } = await import("../src/sim/galaxy-session.js");
  const { createPlayer } = await import("../src/sim/player.js");
  const { configurePlayer } = await import("../src/sim/session.js");
  resetPlaces();
  state.players.length = 0;
  state.localPlayerIndex = 0;
  applySave(prepareGalaxySave(newRootSave()));
  switchGameMode("campaign");
  const P = configurePlayer(createPlayer(), state.profile);
  P.docked = docked;
  P.place = CAMPAIGN_HOME_POCKET;
  state.place = CAMPAIGN_HOME_POCKET;
  const mission = acceptMission(CAMPAIGN_MISSIONS[0], state.profile, CAMPAIGN_HOME_POCKET);
  return { state, P, mission };
}

/** Walk a mission's current dialogue to its end. */
const talk = (mission, P) => {
  for (let guard = 0; guard < 20 && missionDialogue(mission); guard += 1) {
    advanceMission(mission, "dialogue-next", { player: P }, P.profile);
  }
};

test("act boundaries: travel needs permission, docking is refused only for a live destroy objective", async () => {
  const { state, P, mission } = await campaignWorld({ docked: true });
  state.mode = "campaign";

  assert.equal(campaignTravelRefusal(state.profile), "You do not have permission to leave this pocket.");
  assert.equal(campaignDockRefusal(state.profile), "", "the briefing is not a fight: docking stays open");

  // The lesson is a flying objective, so a pilot may still put down.
  mission.step = mission.steps.findIndex(step => step.id === "brief-throttle");
  assert.equal(missionStep(mission).kind, "dialogue");
  assert.equal(campaignDockRefusal(state.profile), "");

  // A destroy objective closes the dock.
  const killIndex = mission.steps.findIndex(step => step.id === "drone-drill");
  mission.step = killIndex;
  assert.equal(campaignDockRefusal(state.profile), "You cannot dock while the act's enemies are still out there.");

  // An act may grant travel on itself or on one step, and then the refusal goes.
  mission.allowTravel = true;
  assert.equal(campaignTravelRefusal(state.profile), "");
  mission.allowTravel = false;
  mission.steps[killIndex].allowTravel = true;
  assert.equal(campaignTravelRefusal(state.profile), "");
  delete mission.steps[killIndex].allowTravel;
  assert.match(campaignTravelRefusal(state.profile), /permission to leave/);

  // Outside the campaign nothing changes.
  state.mode = "open";
  assert.equal(campaignTravelRefusal(state.profile), "");
  assert.equal(campaignDockRefusal(state.profile), "");
  state.mode = "campaign";
  P.docked = true;
});

test("a station dialogue blocks the Launch button until it is finished", async () => {
  const { launchBlockedReason } = await import("../src/sim/missions.js");
  const { P, mission, state } = await campaignWorld({ docked: true });
  assert.equal(missionStep(mission).id, "graduation");
  const reason = launchBlockedReason(state.profile, CAMPAIGN_HOME_POCKET);
  assert.match(reason, /conversation/i, "the pilot is told why the button will not work");
  assert.equal(launchBlockedReason(state.profile, "reach"), "", "another station says nothing about this conversation");

  talk(mission, P);
  assert.equal(launchBlockedReason(state.profile, CAMPAIGN_HOME_POCKET), "", "finished conversation frees the Launch button");
});

test("dialogue pacing is text-scaled and a space line runs itself", async () => {
  assert.equal(MISSION_RULES.dialogueBaseSeconds, 1.5);
  assert.equal(MISSION_RULES.dialogueCharsPerSecond, 12);
  assert.equal(dialogueReadSeconds(""), 1.5);
  assert.equal(dialogueReadSeconds("x".repeat(12)), 2.5);
  assert.equal(dialogueReadSeconds("x".repeat(120)), 11.5);

  const { dialogueHtml } = await import("../src/ui/missionlog.js");
  const { P, mission } = await campaignWorld({ docked: false });
  // The beacon line of the story mission is said in space; it must not ask for a click.
  mission.step = 2;                       // brief-throttle, a radio line
  const html = dialogueHtml(mission, { blocked: true });
  assert.match(html, /data-dialogue-auto/);
  assert.doesNotMatch(html, /data-dialogue-next/, "no Continue button in space");
  P.docked = false;
});

test("a failed act stops, says why, and its checkpoints can be resumed", async () => {
  const { P, mission } = await campaignWorld({ docked: false });
  assert.equal(failMission(mission, "player-dead", P.profile, { player: P }), true);
  assert.equal(isMissionFailed(mission), true);
  assert.equal(mission.failureMessage, "Your Wasp was destroyed.");
  assert.equal(missionObjectivesDone(mission), false);
  assert.equal(mission.checkpoint, undefined, "First Sortie has no checkpoints");

  // The framework itself: a step marked `checkpoint: true` is remembered, and a
  // fresh copy of the mission can be put back on it with its counters cleared.
  const definition = {
    id: "test.checkpoint-run",
    kind: "story",
    title: "Checkpoint run",
    steps: [
      { id: "one", kind: "wait", trigger: "go", objective: "First.", next: "two" },
      { id: "two", kind: "wait", trigger: "go", objective: "Second.", checkpoint: true, next: "three" },
      { id: "three", kind: "wait", trigger: "go", objective: "Third.", next: "end" },
    ],
  };
  const first = instantiateStoryMission(definition);
  advanceMission(first, "mission-trigger", { trigger: "go", profile: P.profile }, P.profile);
  assert.equal(missionStep(first).id, "two");
  assert.equal(first.checkpoint, "two");

  assert.equal(advanceMission(first, "mission-trigger", { trigger: "go", profile: P.profile }, P.profile), true);
  assert.equal(missionStep(first).id, "three");

  const retry = instantiateStoryMission(definition);
  assert.equal(resumeMissionAtCheckpoint(retry, "two", P.profile), true);
  assert.equal(missionStep(retry).id, "two");
  assert.equal(retry.checkpoint, "two");
  assert.equal(retry.counters.one, 0, "resuming clears earlier progress: the act starts clean");
  assert.equal(resumeMissionAtCheckpoint(retry, "no-such-step", P.profile), false);
});

test("optional objectives pay a bonus, can be lost without failing the act", async () => {
  const { P, mission } = await campaignWorld({ docked: false });
  assert.deepEqual(missionOptionalRows(mission).map(row => [row.id, row.bonus, row.done, row.failed]),
    [["stay-with-korr", 100, false, false]]);
  assert.equal(missionBonus(mission), 0);

  // The bonus covers the ten-kilometre run, not the lesson: five hundred metres
  // is the pass mark, and the run's own 1 km reset stays a separate rule.
  assert.equal(mission.optional[0].metres, 500);
  assert.equal(mission.optional[0].during, "chase");

  // A distance report closes the window: outside 500 m it is thrown away for
  // good, and the act itself carries on.
  mission.step = mission.steps.findIndex(step => step.id === "chase");
  advanceMission(mission, "mission-near", { actor: "captain_korr", metres: 900, player: P }, P.profile);
  assert.equal(mission.optionalProgress["stay-with-korr"].failed, true);
  assert.equal(missionBonus(mission), 0);

  const fresh = instantiateStoryMission(CAMPAIGN_MISSIONS[0]);
  fresh.step = fresh.steps.findIndex(step => step.id === "chase");
  advanceMission(fresh, "mission-near", { actor: "captain_korr", metres: 120, player: P }, P.profile);
  assert.equal(fresh.optionalProgress["stay-with-korr"] === undefined, true, "staying close decides nothing until the window closes");
});

test("the control vocabulary reads the pilot's controls, not a key name", () => {
  const controls = { thrust: 1, strafe: -1, lift: 0, roll: 0.5, steer: { x: 0.4, y: 0 }, boost: true, stop: false };
  assert.equal(controlHeld(controls, "throttle-forward"), true);
  assert.equal(controlHeld(controls, "throttle-back"), false);
  assert.equal(controlHeld(controls, "strafe-left"), true);
  assert.equal(controlHeld(controls, "strafe-right"), false);
  assert.equal(controlHeld(controls, "steer"), true);
  assert.equal(controlHeld(controls, "roll-left"), true, "Q (roll +1) is roll left, not roll right");
  assert.equal(controlHeld(controls, "roll-right"), false);
  assert.equal(controlHeld(controls, "lift-up"), false);
  assert.equal(controlHeld(controls, "boost"), true);
  assert.equal(controlHeld({}, "boost"), false);
  for (const id of ["throttle-forward", "brake", "throttle-back", "steer", "strafe-left", "strafe-right",
    "lift-up", "lift-down", "roll-left", "roll-right", "boost"]) {
    assert.ok(MISSION_CONTROLS[id], `${id} is part of the lesson vocabulary`);
  }
  assert.equal(controlHeld({ brake: true }, "brake"), true, "Ctrl is read from the brake flag");
  assert.equal(controlHeld({ brake: false }, "brake"), false);
});

test("First Sortie teaches every control, chases a fixed course and has no checkpoint", async () => {
  const m01 = CAMPAIGN_MISSIONS[0];
  const controls = m01.steps.filter(step => step.kind === "control").map(step => step.control);
  // Throttle and then the brake: a new pilot can always stop the ship before
  // anything that can drift them off the range.
  assert.deepEqual(controls, ["throttle-forward", "brake", "throttle-back", "steer", "strafe-left", "strafe-right",
    "lift-up", "lift-down", "roll-left", "roll-right", "boost"]);
  assert.ok(m01.steps.filter(step => step.kind === "control").every(step => step.hold === 1),
    "every control lesson is a one-second hold: one full bar");
  assert.ok(m01.steps.every(step => step.checkpoint !== true), "First Sortie has no checkpoints");
  assert.ok(!m01.allowTravel && m01.steps.every(step => !step.allowTravel), "the act never grants a jump");

  const chase = m01.steps.find(step => step.kind === "chase");
  assert.equal(chase.follow, "captain_korr");
  assert.equal(chase.maxGap, 1000);
  assert.match(chase.resetLine, /back to the start/i);
  const course = FLIGHT_COURSES[chase.course][chase.coursePhase];
  const length = course.legs.reduce((sum, leg) => sum + leg.length, 0);
  assert.ok(length >= chase.distance, "the authored course is at least the ten kilometres the act asks for");

  const optional = m01.optional[0];
  assert.equal(optional.metres, 500);
  assert.equal(optional.during, "chase", "the bonus covers the ten-kilometre run");

  // Dane's hull is story furniture with rules of its own.
  assert.equal(ENEMIES.captain_korr.friendly, true);
  assert.equal(ENEMIES.captain_korr.lockable, true);
  assert.equal(ENEMIES.captain_korr.dmg, 0);
  assert.equal(ENEMIES.captain_korr.engages, "hostiles");
  assert.equal(ENEMIES.captain_korr.ai, "story");
});

test("a story ship takes its role and flies to the fixed start of its course", async () => {
  const { state, P } = await campaignWorld({ docked: false });
  const e = spawnEnemy("captain_korr", P.pos.clone().add({ x: 0, y: 0, z: 600 }), CAMPAIGN_HOME_POCKET,
    "mission:campaign.m01-first-sortie", { role: "lead", course: "m01-range", phase: "lesson" });
  assert.equal(e.role, "lead");
  assert.equal(e.course.id, "m01-range");
  assert.equal(e.course.mode, "return", "he flies to the authored start and waits there");
  assert.equal(e.boosting, false);
  const course = startCourseAtBeginning("m01-range", "chase");
  assert.deepEqual(course.start.toArray(), [400, 240, 3200], "the chase begins at one fixed point in space");
  assert.ok(course.total > 10000, "the chase is a long course");
  assert.ok(course.points.some(point => point.boost), "he boosts on the straights");
  // Clean up so later tests start from an empty pocket.
  placeWorld(CAMPAIGN_HOME_POCKET).enemies.length = 0;
  state.world.enemies.length = 0;
});

test("the dialogue clock advances a line said in space once its reading time passes", async () => {
  // The smallest DOM the dialogue panel needs.
  const make = (tag = "div") => ({
    tagName: tag.toUpperCase(), id: "", hidden: false, innerHTML: "", textContent: "",
    children: [], dataset: {}, handlers: {}, attributes: {},
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    addEventListener(name, fn) { this.handlers[name] = fn; },
    classList: { add() {}, remove() {}, toggle() {} },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  });
  const prevDoc = globalThis.document;
  globalThis.document = { body: make("body"), createElement: make };
  try {
    const { setupMissionLog, updateDialogueClock, resetDialogueClock, renderDialogue } = await import("../src/ui/missionlog.js");
    resetDialogueClock();
    setupMissionLog();
    const { state, P, mission } = await campaignWorld({ docked: false });
    state.ui.intro = false;
    state.paused = false;
    mission.step = mission.steps.findIndex(step => step.id === "brief-throttle");
    renderDialogue();
    const line = missionDialogue(mission).line;
    const before = Number(mission.counters["brief-throttle"]) || 0;
    assert.equal(updateDialogueClock(0.2), false, "a line is never cut off early");
    assert.equal(updateDialogueClock(dialogueReadSeconds(line) + 0.1), true, "it advances on its own clock");
    assert.equal(Number(mission.counters["brief-throttle"]), before + 1);
    P.docked = false;
  } finally {
    globalThis.document = prevDoc;
  }
});

test("a failed act is offered as a fresh start, never resumed", async () => {
  const { state, P, mission } = await campaignWorld({ docked: false });
  const { campaignRows } = await import("../src/sim/campaign.js");
  const { startCampaignAct } = await import("../src/sim/campaign-act.js");
  assert.equal(campaignRows(state.profile)[0].active, true, "a healthy act can be resumed");

  failMission(mission, "player-dead", state.profile, { player: P });
  assert.equal(campaignRows(state.profile)[0].active, false, "a failed act is not resumable");
  assert.equal(campaignRows(state.profile)[0].available, true, "and it is offered again");

  const result = startCampaignAct("campaign.m01-first-sortie");
  assert.equal(result.ok, true);
  assert.equal(result.mode, "start", "starting a failed act restarts it clean instead of resuming");
  const fresh = state.profile.missions.find(item => item.id === mission.id);
  assert.ok(fresh && !fresh.failed, "the new record is not failed");
  assert.equal(fresh.step, 0, "and it begins at the briefing");
});

test("the end cards: accomplished returns to the menu; failed offers the two ways back", async () => {
  const make = (tag = "div") => ({
    tagName: tag.toUpperCase(), id: "", hidden: false, innerHTML: "", textContent: "",
    children: [], dataset: {}, handlers: {}, attributes: {},
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    addEventListener(name, fn) { this.handlers[name] = fn; },
    classList: { add() {}, remove() {}, toggle() {} },
    querySelector() { return null; }, querySelectorAll() { return []; },
  });
  const prevDoc = globalThis.document;
  globalThis.document = { body: make("body"), createElement: make };
  try {
    const { setupCampaign } = await import("../src/ui/campaign.js");
    setupCampaign();
    const card = globalThis.document.body.children.find(el => el.id === "campaign-end");
    assert.ok(card, "the card is installed");
    assert.equal(card.hidden, true, "and starts hidden");

    const { emit } = await import("../src/util/events.js");
    const { state, P, mission } = await campaignWorld({ docked: false });
    state.mode = "campaign";
    emit("campaign-act-completed", { mission, reward: 150 });
    assert.equal(card.hidden, false, "an accomplished act shows the card");
    assert.match(card.innerHTML, /Mission accomplished/i);
    assert.match(card.innerHTML, /150 cr/);
    assert.match(card.innerHTML, /data-campaign-end="menu"/, "and one way out: the campaign menu");

    card.hidden = true;
    failMission(mission, "player-dead", P.profile, { player: P });
    emit("mission-failed", { mission, message: mission.failureMessage });
    assert.match(card.innerHTML, /Mission failed/i);
    assert.match(card.innerHTML, /data-campaign-retry="begin"/, "start from the beginning");
    assert.doesNotMatch(card.innerHTML, /data-campaign-retry="checkpoint"/, "First Sortie has no checkpoints");
    assert.match(card.innerHTML, /data-campaign-end="menu"/);

    // A checkpointed act gets the second button.
    const checkpointed = { ...mission, checkpoint: "learn-boost" };
    emit("mission-failed", { mission: checkpointed, message: "Down." });
    assert.match(card.innerHTML, /data-campaign-retry="checkpoint"/);
    assert.equal(state.ui.campaignEnd, "failed", "a failed act stops the world");
  } finally {
    globalThis.document = prevDoc;
  }
});
