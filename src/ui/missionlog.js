// Step 13c mission presentation: the docked mission-log tab and the live
// dialogue panel. Mission text comes from mission data; this file only renders
// the generic vocabulary and sends dialogue actions back through the runner.

import { STORY_MISSIONS, TEST_MISSIONS } from "../data/missions/index.js";
import { state, currentSave } from "../state/state.js";
import { saveAutosave } from "../state/storage.js";
import { uiSound } from "../core/audio.js";
import { emit, on } from "../util/events.js";
import {
  activeMissions,
  atMissionHandInStation,
  canCollectMissionReward,
  chooseMission,
  isMissionFailed,
  missionDialogue,
  missionHandIn,
  missionOfferStation,
  missionHandInStationName,
  missionKindWord,
  missionNextText,
  missionObjectivesDone,
  missionProgress,
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

/**
 * Render the live dialogue card for one active mission. `stationName` is set when
 * the pilot is docked somewhere else: the conversation belongs to its own counter,
 * so the card says where to go instead of offering Continue.
 */
export function dialogueHtml(mission, { blocked = false, stationName = "" } = {}) {
  const dialogue = missionDialogue(mission);
  if (!dialogue) return "";
  const locked = blocked && dialogue.requiresDock;
  const choices = locked
    ? `<p class="dialogue-locked">${stationName
        ? `Return to ${esc(stationName)} to continue talking.`
        : "Redock to continue talking."}</p>`
    : dialogue.waitingForChoice && dialogue.choices.length
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

function missionStatus(mission, profile) {
  const progress = missionProgress(mission);
  const objectivesDone = missionObjectivesDone(mission);
  const failed = isMissionFailed(mission);
  const requirement = missionHandIn(mission);
  const atStation = atMissionHandInStation(mission);
  const station = missionHandInStationName(mission);
  const cargoReady = objectivesDone && canCollectMissionReward(mission, profile);
  const ready = cargoReady && atStation;
  // "Complete" is reserved for a mission with nothing left to hand over, at the
  // one station that takes it. A mission that owes items is only ready once they
  // are aboard or at the station, and one that must be handed in elsewhere says
  // where to go instead of pretending it can be paid here.
  const stateText = failed
    ? "Failed"
    : ready
      ? requirement ? "Ready to hand in" : "Complete"
      : objectivesDone
        ? cargoReady ? `Deliver to ${station}` : "Awaiting cargo"
        : "Active";
  // A not-yet-ready mission always offers Abandon, so no state is a dead end.
  const action = ready
    ? `<button data-a="done" data-b="${esc(mission.id)}">${requirement ? "Hand in cargo" : "Collect reward"}</button>`
    : cargoReady
      ? `<button data-a="done" data-b="${esc(mission.id)}" disabled>${requirement ? "Hand in" : "Collect"} at ${esc(station)}</button>` +
        `<button data-a="drop" data-b="${esc(mission.id)}">Abandon</button>`
      : `<button data-a="drop" data-b="${esc(mission.id)}">Abandon</button>`;
  const dialogue = missionDialogue(mission);
  const preview = dialogue
    ? `<p class="mission-log-dialogue"><strong>${esc(dialogue.speaker || "Mission contact")}:</strong> ${esc(dialogue.line)}</p>`
    : "";
  // A dialogue's 0/2 is the number of lines in the current conversation, not
  // mission completion. Keep that implementation detail out of the log; only
  // show a labelled numeric count for contracts with a meaningful target.
  const showProgress = mission.kind === "contract" && progress.total > 1;
  const progressText = showProgress
    ? ` <span>· Objective progress: ${progress.done} of ${progress.total}</span>`
    : "";
  const progressBar = showProgress
    ? `<div class="mission-log-bar"><i style="width:${Math.round((progress.done / progress.total) * 100)}%"></i></div>`
    : "";
  return (
    `<article class="mission-log-card">` +
    `<header><h3>${esc(mission.title || "Mission")}</h3><span>${esc(missionKindWord(mission))}</span></header>` +
    `<p class="mission-log-status">${stateText}${progressText}</p>` +
    progressBar +
    preview +
    `<p class="mission-log-next"><strong>Next:</strong> ${esc(missionNextText(mission, profile))}</p>` +
    `<div class="mission-log-actions">${action}</div>` +
    `</article>`
  );
}

/** Render all active missions plus data-defined story missions not yet accepted. */
export function missionLogHtml(profileOrUi = state.profile) {
  const profile = Array.isArray(profileOrUi?.missions) ? profileOrUi : state.profile;
  // Progress is readable anywhere: an active mission follows the pilot and is
  // listed at every station, so a job taken at Meridian can be watched at
  // Galereach. Only the *offers* are station-bound (each names the station that
  // gives it out), and only the station that takes the hand-in pays.
  const active = activeMissions(profile);
  const activeIds = new Set(active.map(mission => mission.id));
  const storyOffers = STORY_MISSIONS.filter(mission =>
    !activeIds.has(mission.id) && missionOfferStation(mission) === state.place);
  // The framework test missions are for the owner and for AI chats checking the
  // mission rules; they appear only when the game is opened with ?testmissions.
  const showTest = typeof location !== "undefined" && /[?&]testmissions(&|=|$)/.test(location.search || "");
  const testOffers = showTest ? TEST_MISSIONS.filter(mission => !activeIds.has(mission.id)) : [];
  let html = `<h2>Mission log</h2><div class="sub">Active missions, current objectives and the next thing to do.</div>`;
  html += active.length
    // Indexes would address the wrong mission: the list is this station's only,
    // while the runner counts every active mission. Name the mission instead.
    ? active.map(mission => missionStatus(mission, profile)).join("")
    : `<p>No active missions here.</p>`;
  if (storyOffers.length) {
    html += `<h2>Story missions</h2>` + storyOffers.map(mission =>
      `<div class="row"><div>${esc(mission.title)}<small>Story mission · hand in at ${esc(missionHandInStationName(mission))}</small></div><button data-a="story" data-b="${esc(mission.id)}">Start</button></div>`
    ).join("");
  }
  if (testOffers.length) {
    html += `<h2>Test missions</h2>` + testOffers.map(mission =>
      `<div class="row"><div>${esc(mission.title)}<small>Framework test mission</small></div><button data-a="story" data-b="${esc(mission.id)}">Start</button></div>`
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
  // A station-contact conversation needs that station: docked elsewhere it is
  // read-only with the station named, and in flight it asks the pilot to redock.
  const away = !!dialogue.station && dialogue.station !== state.place;
  const blocked = dialogue.requiresDock && (away || (!!state.player && !state.player.docked));
  root.innerHTML = dialogueHtml(mission, { blocked, stationName: away ? dialogue.stationName : "" });
  root.hidden = false;
}

function onDialogueClick(event) {
  const button = event.target.closest("[data-dialogue-next], [data-dialogue-choice]");
  if (!button) return;
  const mission = dialogueMission();
  if (!mission) return;
  const dialogue = missionDialogue(mission);
  // Only station-contact conversations are gated. In-field dialogue, such as
  // the beacon handoff, remains actionable during flight and after a warp.
  const away = !!dialogue?.station && dialogue.station !== state.place;
  if (dialogue?.requiresDock && (away || (state.player && !state.player.docked))) {
    renderDialogue();
    return;
  }
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

// ---- the "mission failed" notice -------------------------------------------------
// A mission that fails for any reason except the pilot abandoning it tells the pilot
// plainly which mission failed and why. It sits on top of both the flight HUD and the
// docked screen (a death docks the pilot at once) and stays until dismissed or 15 s pass.
const ALERT_SECONDS = 15;
let alertRoot = null;
let alertTimer = 0;

/** The notice's text for a `mission-failed` event, or "" when none should be shown. */
export function failureNoticeHtml({ mission, title, reason, message } = {}) {
  if (reason === "abandon") return "";   // the pilot chose that; no alarm needed
  const name = title || mission?.title || "Mission";
  const why = message || mission?.failureMessage || "It can no longer be completed.";
  // A contract says "Contract failed"; only story work calls itself a mission.
  return `<strong>${esc(missionKindWord(mission))} failed: ${esc(name)}</strong><span>${esc(why)}</span><em>Click to dismiss</em>`;
}

function hideFailureNotice() {
  clearTimeout(alertTimer);
  if (alertRoot) alertRoot.hidden = true;
}

function showFailureNotice(event = {}) {
  if (!alertRoot) return;
  if (event.player && state.player && event.player !== state.player) return;   // another pilot's mission
  const html = failureNoticeHtml(event);
  if (!html) return;
  alertRoot.innerHTML = html;
  alertRoot.hidden = false;
  clearTimeout(alertTimer);
  alertTimer = setTimeout(hideFailureNotice, ALERT_SECONDS * 1000);
}

/** Install the live dialogue card and subscribe it to mission/session events. */
export function setupMissionLog() {
  alertRoot = document.createElement("div");
  alertRoot.id = "mission-alert";
  alertRoot.hidden = true;
  alertRoot.setAttribute("role", "alert");
  alertRoot.addEventListener("click", hideFailureNotice);
  document.body.appendChild(alertRoot);
  on("mission-failed", showFailureNotice);
  on("main-menu", hideFailureNotice);

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
    "mission-objectives-done",
    "mission-failed",
    "mission-rewarded",
    "mission-abandoned",
    "mission-inventory-changed",
    "mission-ui-refresh",
    "main-menu",
    "docked",
    "launched",
  ]) {
    on(event, () => {
      renderDialogue();
      // The docked panel (Mission log, Contracts) is a snapshot drawn when it was
      // opened, so closing the last dialogue line left the card saying Abandon
      // until another tab was opened. Tell the panel to redraw whenever a mission
      // changes; menu.js ignores this while the panel is hidden or on the title.
      const panelAlreadyRedraws = ["mission-ui-refresh", "main-menu", "docked", "launched"].includes(event);
      if (!panelAlreadyRedraws) emit("mission-ui-refresh", {});
    });
  }
  renderDialogue();
}
