// Step 13c: dialogue and mission-log presentation stays generic while mission
// text, speaker data, choices and current progress remain data-driven.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BORDER_SIGNAL_MISSION } from "../src/data/missions/story.js";
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
  assert.equal(missionDialogue(mission).pause, false, "dialogue does not pause unless mission data asks it to");

  const profile = newProfile();
  advanceMission(mission, "dialogue-next", { profile });
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
  assert.match(html, /Progress 0\/2/, "the current dialogue progress is shown");
  assert.match(html, /Hear Archivist Vale(?:&#39;|')s request and choose whether to investigate\./, "the next action comes from mission data");
  assert.match(html, /A weak signal is repeating beyond Kestrel Hollow\./, "the current dialogue preview is shown");

  const waiting = storyMission();
  waiting.step = 4;
  assert.equal(missionNextText(waiting), "Go to Kestrel Hollow and defeat the two raiders.",
    "the story data supplies a direct current objective for the flight HUD");
  const searching = storyMission();
  searching.step = 5;
  assert.equal(missionNextText(searching), "Reach the signal and hold position for two seconds.",
    "the HUD objective updates from the story data after the wave");
  const beacon = storyMission();
  beacon.step = 7;
  assert.equal(missionNextText(beacon), "Retrieve the beacon and keep it aboard your ship.",
    "the HUD objective updates for the scripted beacon transfer");
  const returning = storyMission();
  returning.step = 8;
  assert.equal(missionNextText(returning), "Return to Meridian Station with the beacon.",
    "the HUD objective updates for the return-home handoff");

  const screens = readFileSync(new URL("../src/ui/screens.js", import.meta.url), "utf8");
  const ui = readFileSync(new URL("../src/ui/missionlog.js", import.meta.url), "utf8");
  assert.match(screens, /\["l", "Mission log"\]/, "the mission log is an outpost tab");
  assert.match(screens, /l: missionLogHtml/, "the tab is wired to the mission-log renderer");
  assert.doesNotMatch(ui, /Archivist Vale|Kestrel Hollow|I will investigate/, "story text stays in mission data");
});

test("13c: dialogue presentation fields survive the existing v19 save round trip", () => {
  const save = newSave();
  save.profile.missions.push(storyMission());
  const loaded = sanitizeSave(save);
  const step = loaded.profile.missions[0].steps[0];
  assert.equal(step.portrait, "archivist-vale");
  assert.equal(step.log, "Hear Archivist Vale's request and choose whether to investigate.");
  assert.equal(loaded.profile.missions[0].steps[8].portrait, "archivist-vale");
});
