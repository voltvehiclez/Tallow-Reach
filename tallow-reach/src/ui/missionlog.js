// Step 13c mission presentation: the docked mission-log tab and the live
// dialogue panel. Mission text comes from mission data; this file only renders
// the generic vocabulary and sends dialogue actions back through the runner.

import { STORY_MISSIONS } from "../data/missions/index.js";
import { state, currentSave } from "../state/state.js";
import { saveAutosave } from "../state/storage.js";
import { uiSound } from "../core/audio.js";
import { on } from "../util/events.js";
import {
  activeMissions,
  canCollectMissionReward,
  chooseMission,
  isMissionComplete,
  isMissionFailed,
  missionDialogue,
  missionNextText,
  missionProgress,
  missionStep,
  nextMissionDialogue,
} from "../sim/missions.js";
import { setPause } from "./pause.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[c]));

/** Render the live dialogue card for one active mission. */
export function dialogueHtml(mission) {
  const dialogue = missionDialogue(mission);
  if (!dialogue) return "";
  const choices = dialogue.waitingForChoice && dialogue.choices.length
    ? dialogue.choices.map(choice =>
        `<button class="dialogue-choice" data-dialogue-choice="${esc(choice.id)}">${esc(choice.text || choice.id)}</button>`
      ).join("")
    : `<button class="dialogue-next" data-dialogue-next="true">${dialogue.lineIndex + 1 < dialogue.lines.length ? "Continue" : "Close"}</button>`;
  const portrait = dialogue.portrait || "Portrait";
  return (
    `<div class="dialogue-shell">` +
    `<div class="dialogue-portrait" data-portrait="${esc(portrait)}" aria-label="Portrait slot">${esc(portrait)}</div>` +
    `<div class="dialogue-body">` +
    `<div class="dialogue-meta"><span>${esc(mission.title)}</span><span>${dialogue.lineIndex + 1} / ${dialogue.lines.length}</span></div>` +
    `<h2>${esc(dialogue.speaker || "Mission contact")}</h2>` +
    `<p class="dialogue-text">${esc(dialogue.line)}</p>` +
    `<div class="dialogue-actions">${choices}</div>` +
    `</div>` +
    `</div>`
  );
}

function missionStatus(mission, index, profile) {
  const step = missionStep(mission);
  const progress = missionProgress(mission);
  const complete = isMissionComplete(mission);
  const failed = isMissionFailed(mission);
  const stateText = failed
    ? "Failed"
    : complete
      ? "Complete"
      : `Step ${Math.min(progress.index + 1, mission.steps.length)} of ${mission.steps.length}`;
  const kindText = step?.kind ? ` · ${step.kind}` : "";
  const action = complete && canCollectMissionReward(mission, profile)
    ? `<button data-a="done" data-b="${index}">Collect reward</button>`
    : !complete
      ? `<button data-a="drop" data-b="${index}">Abandon</button>`
      : "";
  const dialogue = missionDialogue(mission);
  const preview = dialogue
    ? `<p class="mission-log-dialogue"><strong>${esc(dialogue.speaker || "Mission contact")}:</strong> ${esc(dialogue.line)}</p>`
    : "";
  const width = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    `<article class="mission-log-card">` +
    `<header><h3>${esc(mission.title || "Mission")}</h3><span>${esc(mission.kind || "mission")}</span></header>` +
    `<p class="mission-log-status">${stateText}${kindText} <span>· Progress ${progress.done}/${progress.total}</span></p>` +
    `<div class="mission-log-bar"><i style="width:${width}%"></i></div>` +
    preview +
    `<p class="mission-log-next"><strong>Next:</strong> ${esc(missionNextText(mission))}</p>` +
    `<div class="mission-log-actions">${action}</div>` +
    `</article>`
  );
}

/** Render all active missions plus data-defined story missions not yet accepted. */
export function missionLogHtml(profileOrUi = state.profile) {
  const profile = Array.isArray(profileOrUi?.missions) ? profileOrUi : state.profile;
  const active = activeMissions(profile);
  const activeIds = new Set(active.map(mission => mission.id));
  const storyOffers = STORY_MISSIONS.filter(mission => !activeIds.has(mission.id));
  let html = `<h2>Mission log</h2><div class="sub">Active missions, current steps and the next thing to do.</div>`;
  html += active.length
    ? active.map((mission, index) => missionStatus(mission, index, profile)).join("")
    : `<p>No active missions.</p>`;
  if (storyOffers.length) {
    html += `<h2>Story missions</h2>` + storyOffers.map(mission =>
      `<div class="row"><div>${esc(mission.title)}<small>Story mission</small></div><button data-a="story" data-b="${esc(mission.id)}">Start</button></div>`
    ).join("");
  }
  return html;
}

let root = null;
let missionPause = false;

function dialogueMission() {
  if (state.ui.intro) return null;
  return activeMissions(state.profile).find(mission => missionDialogue(mission));
}

function releaseMissionPause() {
  if (!missionPause) return;
  missionPause = false;
  setPause(false);
}

/** Refresh the live dialogue card without changing simulation pause state by default. */
export function renderDialogue() {
  const mission = dialogueMission();
  const dialogue = mission && missionDialogue(mission);
  if (!mission || !dialogue) {
    releaseMissionPause();
    if (root) {
      root.hidden = true;
      root.innerHTML = "";
    }
    return;
  }
  if (missionPause && !dialogue.pause) releaseMissionPause();
  if (dialogue.pause && !state.paused && !missionPause) {
    missionPause = true;
    setPause(true);
  }
  root.innerHTML = dialogueHtml(mission);
  root.hidden = false;
}

function onDialogueClick(event) {
  const button = event.target.closest("[data-dialogue-next], [data-dialogue-choice]");
  if (!button) return;
  const mission = dialogueMission();
  if (!mission) return;
  const changed = button.dataset.dialogueChoice
    ? chooseMission(mission.id, button.dataset.dialogueChoice)
    : nextMissionDialogue(mission.id);
  if (!changed) return;
  event.preventDefault();
  event.stopPropagation();
  uiSound(button.dataset.dialogueChoice ? "confirm" : "click");
  saveAutosave(currentSave());
  renderDialogue();
}

/** Install the live dialogue card and subscribe it to mission/session events. */
export function setupMissionLog() {
  root = document.createElement("section");
  root.id = "dialogue-panel";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-live", "polite");
  root.setAttribute("aria-label", "Mission dialogue");
  root.addEventListener("click", onDialogueClick);
  document.body.appendChild(root);

  for (const event of [
    "mission-accepted",
    "mission-progress",
    "mission-completed",
    "mission-failed",
    "mission-rewarded",
    "mission-abandoned",
    "mission-ui-refresh",
    "docked",
    "launched",
  ]) on(event, renderDialogue);
  renderDialogue();
}
