// Step 13c: dialogue and mission-log presentation stays generic while mission
// text, speaker data, choices and current progress remain data-driven.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BORDER_SIGNAL_MISSION } from "../src/data/missions/story.js";
import { missionFromContract } from "../src/data/missions/contracts.js";
import { newProfile, newSave, sanitizeSave } from "../src/state/profile.js";
import {
  advanceMission,
  instantiateStoryMission,
  missionDialogue,
  missionNextText,
} from "../src/sim/missions.js";
import { dialogueHtml, missionLogHtml } from "../src/ui/missionlog.js";
import { state } from "../src/state/state.js";
import { readFileSync } from "node:fs";

function storyMission() {
  return instantiateStoryMission(BORDER_SIGNAL_MISSION);
}

test("13c: the dialogue panel renders a portrait slot, speaker, data text and choices", () => {
  const mission = storyMission();
  const first = dialogueHtml(mission);
  assert.match(first, /class="dialogue-portrait"/, "dialogue has a portrait slot");
  assert.match(first, /Archivist Vale/, "dialogue renders the data speaker");
  assert.match(first, /A weak signal is repeating beyond Kestrel Hollow\./, "dialogue renders the data line");
  assert.match(first, /data-dialogue-next/, "the first line can advance without pausing the world");
  const blocked = dialogueHtml(mission, { blocked: true });
  assert.match(blocked, /Redock to continue talking\./, "an undocked station dialogue asks the pilot to return");
  assert.doesNotMatch(blocked, /data-dialogue-next|data-dialogue-choice/, "an undocked station dialogue cannot advance or choose");
  const beacon = storyMission();
  beacon.step = 9;
  const inField = dialogueHtml(beacon, { blocked: true });
  assert.match(inField, /data-dialogue-next/, "an in-field beacon dialogue remains actionable while flying");
  assert.doesNotMatch(inField, /Redock to continue talking\./, "only station-contact dialogue is dock-gated");
  assert.equal(missionDialogue(mission).pause, false, "dialogue does not pause unless mission data asks it to");

  const profile = newProfile();
  advanceMission(mission, "dialogue-next", { profile, player: { docked: true, place: "reach" } });
  const second = dialogueHtml(mission);
  assert.match(second, /data-dialogue-choice="help"/, "the help choice is data-driven");
  assert.match(second, /data-dialogue-choice="decline"/, "the decline choice is data-driven");
});

test("13c: mission log lists active missions, objective, progress and next action", () => {
  const profile = newProfile();
  profile.missions.push(storyMission());
  const html = missionLogHtml(profile);
  assert.match(html, /Mission log/, "the log has a heading");
  const previousProfile = state.profile;
  state.profile = profile;
  try {
    assert.match(missionLogHtml({ tab: "l" }), /The Border Signal/, "the outpost tab receives its UI state without losing the active profile");
  } finally {
    state.profile = previousProfile;
  }
  assert.match(html, /The Border Signal/, "the active mission title is shown");
  assert.match(html, /Active/, "the mission is presented as active without exposing internal step numbering");
  assert.doesNotMatch(html, /Step \d+ of \d+/, "internal step numbering is not shown to players");
  assert.doesNotMatch(html, /Progress \d+\/\d+|mission-log-bar/, "dialogue line counts are not shown as unexplained mission progress");
  assert.match(html, /Hear Archivist Vale(?:&#39;|')s request\./, "the next action comes from spoiler-safe mission data");

  const contractProfile = newProfile();
  contractProfile.missions.push(missionFromContract(
    { type: "hunt", tier: 1, p: 0, n: 2, r: 100, e: "raider" },
    "contract:test-hunt",
  ));
  assert.match(missionLogHtml(contractProfile), /Objective progress: 0 of 2/, "known contract counts have a clear label");
  assert.match(html, /A weak signal is repeating beyond Kestrel Hollow\./, "the current dialogue preview is shown");

  const waiting = storyMission();
  waiting.step = 5;
  assert.equal(missionNextText(waiting), "Investigate the signal in Kestrel Hollow.",
    "the story data supplies a spoiler-safe current objective for the flight HUD");
  const searching = storyMission();
  searching.step = 6;
  assert.equal(missionNextText(searching), "Stay with the signal in Kestrel Hollow.",
    "the HUD objective updates from the story data after the wave without exposing the encounter");
  const beacon = storyMission();
  beacon.step = 8;
  assert.equal(missionNextText(beacon), "Return to Kestrel Hollow to retrieve the beacon.",
    "the HUD objective directs the pilot back to the authored retrieval place");
  const returning = storyMission();
  returning.step = 9;
  assert.equal(missionNextText(returning), "Return to Meridian Station.",
    "the HUD objective updates for the return-home handoff without repeating the reveal");
  const owed = storyMission();
  owed.step = owed.current = 10;
  owed.completed = true;
  assert.equal(missionNextText(owed, profile), "Return to Meridian Station with the beacon. You have 0 of 1.",
    "after the last line the mission asks for the hand-in, never for a reward");
  const paid = storyMission();
  paid.step = paid.current = 10;
  paid.completed = true;
  profile.holds[profile.ship].beacon = 1;
  assert.equal(missionNextText(paid, profile), "Return to Meridian Station with the beacon.",
    "with the beacon aboard the guidance is only the hand-in");
  assert.doesNotMatch(missionNextText(paid, profile), /complete/i,
    "a mission that owes its beacon is never called complete");

  // A mission that owes its item is ready to hand in, not complete; one that has
  // lost it says so and still offers a way out.
  const owedProfile = newProfile();
  const owedMission = instantiateStoryMission(BORDER_SIGNAL_MISSION);
  owedMission.step = owedMission.current = 10;
  owedMission.completed = true;
  owedProfile.missions.push(owedMission);
  assert.match(missionLogHtml(owedProfile), /Awaiting cargo/, "a missing hand-in is not called complete");
  assert.match(missionLogHtml(owedProfile), /Abandon/, "and the mission log still offers a way out");
  owedProfile.holds[owedProfile.ship].beacon = 1;
  const readyHtml = missionLogHtml(owedProfile);
  assert.match(readyHtml, /Ready to hand in/, "with the item aboard it is ready to hand in");
  assert.match(readyHtml, /Hand in cargo/, "and the button is the hand-in, not a reward claim");
  assert.doesNotMatch(readyHtml, /Complete/, "nothing claims it is complete before the hand-in");

  const screens = readFileSync(new URL("../src/ui/screens.js", import.meta.url), "utf8");
  const ui = readFileSync(new URL("../src/ui/missionlog.js", import.meta.url), "utf8");
  assert.match(screens, /\["l", "Mission log"\]/, "the mission log is an outpost tab");
  assert.match(screens, /l: missionLogHtml/, "the tab is wired to the mission-log renderer");
  assert.doesNotMatch(ui, /Archivist Vale|Kestrel Hollow|I will investigate/, "story text stays in mission data");
});

test("13c: old Border Signal saves migrate by step id to the resumable flow", () => {
  const old = JSON.parse(JSON.stringify(BORDER_SIGNAL_MISSION));
  const oldIds = ["intro", "prepare", "brief", "spawn", "wait", "search", "check-help", "reward-item", "finish", "declined"];
  old.steps = oldIds.map(id => old.steps.find(step => step.id === id));
  old.steps[0].choices[0].next = "prepare";
  old.steps[2].next = "spawn";
  old.steps[8].next = 10;
  old.timeout = 180;
  old.fails = { on: ["player-dead", "left-sector", "timeout"], sector: "hollow", action: "abandon" };
  old.step = 2;
  old.current = 2;
  old.counters = { intro: 2 };
  for (const step of old.steps) {
    delete step.requiresFlying;
    if (step.id === "prepare" || step.id === "spawn") delete step.place;
  }
  delete old.steps.find(step => step.id === "search").steps[1].place;
  const save = newSave();
  save.profile.missions = [old];
  const loaded = sanitizeSave(save);
  const mission = loaded.profile.missions[0];
  assert.equal(mission.steps[mission.step].id, "brief", "the pending dialogue keeps its stable step id");
  assert.equal(mission.steps.some(step => step.id === "travel"), true, "the new travel step is restored");
  assert.equal(mission.steps.find(step => step.id === "prepare").requiresFlying, true, "world scripts regain their state requirement");
  assert.equal(mission.steps.find(step => step.id === "search").steps[1].place, "hollow", "nested objective requirements survive migration");
  const rewardStep = mission.steps.find(step => step.id === "reward-item");
  assert.equal(rewardStep.place, "hollow", "the beacon remains at its authored retrieval place");
  assert.equal(rewardStep.requiresFlying, true, "a saved reward resumes only when the pilot returns to the field");
  assert.equal(mission.fails.on, undefined, "old automatic death, leave and timeout failures are removed; the current data declares none");
  assert.equal(mission.timeout, undefined);
});

test("13c: dialogue presentation fields survive the existing v20 save round trip", () => {
  const save = newSave();
  save.profile.missions.push(storyMission());
  const loaded = sanitizeSave(save);
  const step = loaded.profile.missions[0].steps[0];
  assert.equal(step.portrait, "archivist-vale");
  assert.equal(step.log, "Hear Archivist Vale's request and choose whether to investigate.");
  assert.equal(step.objective, "Hear Archivist Vale's request.");
  assert.equal(step.requiresDock, true, "station dialogue keeps its dock requirement through v20 saves");
  assert.equal(loaded.profile.missions[0].steps[9].portrait, "archivist-vale");
  assert.equal(loaded.profile.missions[0].steps[9].objective, "Return to Meridian Station.");
  assert.equal(loaded.profile.missions[0].steps[9].requiresDock, false, "the beacon dialogue remains in-field after a save");

  const oldSave = JSON.parse(JSON.stringify(save));
  for (const savedStep of oldSave.profile.missions[0].steps) delete savedStep.requiresDock;
  const migrated = sanitizeSave(oldSave);
  assert.equal(migrated.profile.missions[0].steps[0].requiresDock, true, "old station dialogue saves regain the authored dock gate");
  assert.equal(migrated.profile.missions[0].steps[9].requiresDock, false, "old beacon dialogue saves remain actionable in flight");
});
