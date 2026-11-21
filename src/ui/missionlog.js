// Step 13c mission presentation: the docked mission-log tab and the live
// dialogue panel. Mission text comes from mission data; this file only renders
// the generic vocabulary and sends dialogue actions back through the runner.

import { itemName } from "../data/items.js";
import { STORY_MISSIONS, TEST_MISSIONS } from "../data/missions/index.js";
import { campaignAct, campaignRows, activeCampaignMission, isCampaignMissionId } from "../sim/campaign.js";
import { state, currentSave, saveCurrentGame } from "../state/state.js";
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
  missionItemRequirements,
  missionOfferStation,
  missionHandInStationName,
  missionKindWord,
  missionNextText,
  missionObjectivesDone,
  missionOptionalRows,
  missionProgress,
  missionRecoveryText,
  nextMissionDialogue,
} from "../sim/missions.js";
import { setPause } from "./pause.js";
import { dialogueReadSeconds } from "../data/missions/rules.js";

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
  // A station line can be clicked past; a line said in space cannot, because a
  // mission may depend on how long it takes. Choices are always the pilot's.
  const choices = locked
    ? `<p class="dialogue-locked">${stationName
        ? `Return to ${esc(stationName)} to continue talking.`
        : "Redock to continue talking."}</p>`
    : dialogue.waitingForChoice && dialogue.choices.length
      ? dialogue.choices.map(choice =>
          `<button class="dialogue-choice" data-dialogue-choice="${esc(choice.id)}">${esc(choice.text || choice.id)}</button>`
        ).join("")
      : dialogue.requiresDock
        ? `<button class="dialogue-next" data-dialogue-next="true">${dialogue.lineIndex + 1 < dialogue.lines.length ? "Continue" : "Close"}</button>`
        : `<p class="dialogue-auto" data-dialogue-auto="true">${dialogue.lineIndex + 1 < dialogue.lines.length ? "…" : ""}</p>`;
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

/**
 * Extra spoiler-safe continuation lines rendered when a mission card is expanded
 * with `Details`. Never duplicates the title, status or `Next:` line already
 * shown on the card, and never reveals future unreached story steps.
 */
function missionExtraHtml(mission, { station, nextText, preview }) {
  const blocks = [];
  if (typeof mission.briefing === "string" && mission.briefing.trim()) {
    blocks.push(`<p class="mission-log-note">${esc(mission.briefing.trim())}</p>`);
  }
  if (preview) blocks.push(preview);

  // Additional current parallel sub-objectives or explicit extra details, if any.
  const steps = Array.isArray(mission.steps) ? mission.steps : [];
  const stepIdx = Number.isInteger(mission.step) ? mission.step : 0;
  const activeStep = steps[stepIdx] || null;
  const extraObjectives = [];
  if (activeStep?.kind === "parallel" && Array.isArray(activeStep.steps)) {
    for (const sub of activeStep.steps) {
      if (typeof sub?.objective === "string" && sub.objective && sub.objective !== nextText) {
        extraObjectives.push(sub.objective);
      }
    }
  }
  if (Array.isArray(mission.details)) {
    for (const line of mission.details) {
      if (typeof line === "string" && line.trim()) extraObjectives.push(line.trim());
    }
  }
  if (extraObjectives.length) {
    blocks.push(
      `<ul class="mission-log-list">` +
      extraObjectives.map(line => `<li>${esc(line)}</li>`).join("") +
      `</ul>`
    );
  }

  // Completed objectives so far (without internal step numbers or future spoilers).
  const completed = [];
  const seen = new Set([nextText]);
  const limit = Math.min(steps.length, Math.max(0, stepIdx));
  for (let i = 0; i < limit; i++) {
    const obj = steps[i]?.objective;
    if (typeof obj !== "string" || !obj.trim() || obj.includes("{")) continue;
    const clean = obj.trim();
    if (seen.has(clean)) continue;
    seen.add(clean);
    completed.push(clean);
  }
  if (completed.length) {
    blocks.push(
      `<ul class="mission-log-list mission-log-done">` +
      completed.map(line => `<li><span>Done:</span> ${esc(line)}</li>`).join("") +
      `</ul>`
    );
  }

  // Optional objectives: a bonus, never a requirement. The card says plainly
  // whether it is still live, won or thrown away.
  const optional = missionOptionalRows(mission);
  if (optional.length) {
    blocks.push(
      `<ul class="mission-log-list mission-log-optional">` +
      optional.map(row => {
        const mark = row.failed ? "Optional failed" : row.done ? "Optional earned" : "Optional";
        const credits = row.bonus > 0 ? ` · +${row.bonus} cr` : "";
        return `<li><span>${mark}:</span> ${esc(row.objective)}${esc(credits)}</li>`;
      }).join("") +
      `</ul>`
    );
  }

  // Concise reward, threat and hand-in metadata not already shown above.
  const meta = [];
  const credits = Math.max(0, Math.floor(+mission.rewards?.credits || +mission.r || 0));
  const rewardParts = [];
  if (credits > 0) rewardParts.push(`${credits} cr`);
  if (Array.isArray(mission.rewards?.items)) {
    for (const it of mission.rewards.items) {
      if (!it?.id) continue;
      const qty = Math.max(1, Math.floor(+it.count || +it.n || 1));
      rewardParts.push(`${qty}× ${itemName(it.id)}`);
    }
  }
  if (rewardParts.length) meta.push(`<span><strong>Reward:</strong> ${esc(rewardParts.join(", "))}</span>`);
  if (Number.isFinite(+mission.tier) && +mission.tier > 0) {
    meta.push(`<span><strong>Threat:</strong> ${Math.floor(+mission.tier)} of 3</span>`);
  }
  if (station) meta.push(`<span><strong>Hand in:</strong> ${esc(station)}</span>`);
  if (meta.length) {
    blocks.push(`<p class="mission-log-meta">${meta.join(" &middot; ")}</p>`);
  }
  return blocks.join("");
}

function missionStatus(mission, profile) {
  const progress = missionProgress(mission);
  const objectivesDone = missionObjectivesDone(mission);
  const failed = isMissionFailed(mission);
  const requirement = missionHandIn(mission);
  const atStation = atMissionHandInStation(mission);
  const station = missionHandInStationName(mission);
  const cargoReady = canCollectMissionReward(mission, profile);
  const ready = cargoReady && atStation;
  // "Complete" is reserved for a mission with nothing left to hand over, at the
  // one station that takes it. A mission that owes items is only ready once they
  // are aboard or at its hand-in station, and one that must be handed in
  // elsewhere says where to go instead of pretending it can be paid here.
  const stateText = failed
    ? "Failed"
    : ready
      ? requirement ? "Ready to hand in" : "Complete"
      : cargoReady
        ? `Deliver to ${esc(station)}`
        : objectivesDone
          ? "Awaiting cargo"
          : "Active";
  // A campaign act is not a job: it cannot be accepted, abandoned or handed in
  // by hand. It ends on its last objective and the campaign screen takes over.
  const campaign = state.mode === "campaign" && isCampaignMissionId(mission.id);
  // A not-yet-ready mission always offers Abandon, so no state is a dead end.
  const action = campaign ? "" : ready
    ? `<button data-a="done" data-b="${esc(mission.id)}">${requirement ? "Hand in cargo" : "Collect reward"}</button>`
    : cargoReady
      ? `<button data-a="done" data-b="${esc(mission.id)}" disabled>${requirement ? "Hand in" : "Collect"} at ${esc(station)}</button>` +
        `<button data-a="drop" data-b="${esc(mission.id)}">Abandon</button>`
      : `<button data-a="drop" data-b="${esc(mission.id)}">Abandon</button>`;
  const dialogue = missionDialogue(mission);
  const preview = dialogue
    ? `<p class="mission-log-dialogue"><strong>${esc(dialogue.speaker || "Mission contact")}:</strong> ${esc(dialogue.line)}</p>`
    : "";
  // Any mission requiring an item reports the exact live count available in
  // inventory right now; recovery jobs also keep their recovered-crate tally,
  // and dialogue line counts stay hidden.
  const items = missionItemRequirements(mission, profile);
  const itemText = items.map(r => `${r.name}: ${r.available} of ${r.required} available`).join(" · ");
  const itemDone = items.reduce((n, r) => n + Math.min(r.required, r.available), 0);
  const itemTotal = items.reduce((n, r) => n + r.required, 0);
  const recovered = missionRecoveryText(mission);
  const contractCount = mission.kind === "contract" && progress.total > 1;
  const parts = [];
  if (recovered) parts.push(recovered);
  if (itemText) parts.push(itemText);
  else if (contractCount) parts.push(`Objective progress: ${progress.done} of ${progress.total}`);
  const progressText = parts.length ? ` <span>· ${esc(parts.join(" · "))}</span>` : "";
  const barRatio = items.length
    ? recovered && !objectivesDone
      ? progress.total > 0 ? progress.done / progress.total : 0
      : itemTotal > 0 ? itemDone / itemTotal : 0
    : contractCount
      ? progress.done / progress.total
      : null;
  const progressBar = barRatio !== null
    ? `<div class="mission-log-bar"><i style="width:${Math.round(Math.min(1, Math.max(0, barRatio)) * 100)}%"></i></div>`
    : "";
  const nextText = missionNextText(mission, profile);
  const extra = missionExtraHtml(mission, { station, nextText, preview });
  return (
    `<article class="mission-log-card">` +
    `<header><h3>${esc(mission.title || "Mission")}</h3><span>${esc(missionKindWord(mission))}</span></header>` +
    `<p class="mission-log-status">${stateText}${progressText}</p>` +
    progressBar +
    `<p class="mission-log-next"><strong>Next:</strong> ${esc(nextText)}</p>` +
    `<div class="mission-log-actions">${action}</div>` +
    `<details class="mission-log-details"><summary>Details</summary>` +
    `<div class="mission-log-full">${extra}</div></details>` +
    `</article>`
  );
}

/** Pure docked mission-log screen rendered inside the left-side window on the Missions tab. */
export function missionLogHtml(profileOrUi = state.profile) {
  const profile = Array.isArray(profileOrUi?.missions) ? profileOrUi : state.profile;
  // Progress is readable anywhere: an active mission follows the pilot and is
  // listed at every station, so a job taken at Meridian can be watched at
  // Galereach. Only the *offers* are station-bound (each names the station that
  // gives it out), and only the station that takes the hand-in pays.
  const active = activeMissions(profile);
  const sub = state.mode === "campaign" ? "Campaign sorties and current objectives." : "Active missions, contracts and current objectives.";
  let html = `<h2>Mission log</h2><div class="sub">${esc(sub)}</div>`;
  html += active.length
    ? active.map(mission => missionStatus(mission, profile)).join("")
    : `<p>No active missions here.</p>`;
  return html;
}

/**
 * Pure Story missions offer block for the right-hand Missions tab. Keeps the
 * `Story missions` heading visible even after every offer at this station has
 * been accepted, showing "No more story missions available." when none remain.
 */
function campaignOffersHtml(profile) {
  const active = activeCampaignMission(profile);
  const act = active ? campaignAct(active.id) : null;
  let html = `<h2>Campaign</h2>`;
  if (active) {
    html += `<div class="row"><div><strong>${esc(active.title)}</strong><small>${esc(act?.chapterName || "Campaign")} · ${esc(act?.n || "Act")} in progress</small></div></div>`;
    html += `<p>This act runs until it is finished. There is nothing to accept and nothing to abandon.</p>`;
  } else {
    html += `<p>No campaign act is running. Choose an act from the campaign menu.</p>`;
  }
  return html;
}

export function storyOffersHtml(profileOrUi = state.profile) {
  const profile = Array.isArray(profileOrUi?.missions) ? profileOrUi : state.profile;
  const activeIds = new Set(activeMissions(profile).map(mission => mission.id));
  if (state.mode === "campaign") return campaignOffersHtml(profile);
  const storyOffers = STORY_MISSIONS.filter(mission =>
    !activeIds.has(mission.id) && missionOfferStation(mission) === state.place);
  // The framework test missions are for the owner and for AI chats checking the
  // mission rules; they appear only when the game is opened with ?testmissions.
  const showTest = typeof location !== "undefined" && /[?&]testmissions(&|=|$)/.test(location.search || "");
  const testOffers = showTest ? TEST_MISSIONS.filter(mission => !activeIds.has(mission.id)) : [];
  let html = `<h2>Story missions</h2>`;
  html += storyOffers.length
    ? storyOffers.map(mission =>
        `<div class="row"><div>${esc(mission.title)}<small>Story mission · hand in at ${esc(missionHandInStationName(mission))}</small></div><button data-a="story" data-b="${esc(mission.id)}">Start</button></div>`
      ).join("")
    : `<p>No more story missions available.</p>`;
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
    const reset = !state.ui.intro ? state.ui.resetDialogue : null;
    if (reset && reset.line && root) {
      const portrait = reset.portrait || "Portrait";
      root.innerHTML =
        `<div class="dialogue-shell">` +
        `<div class="dialogue-portrait" data-portrait="${esc(portrait)}" aria-label="Portrait slot">${esc(portrait)}</div>` +
        `<div class="dialogue-body">` +
        `<div class="dialogue-meta"><span>${esc(reset.title || "Mission")}</span><span>1 / 1</span></div>` +
        `<h2>${esc(reset.speaker || "Mission contact")}</h2>` +
        `<p class="dialogue-text">${esc(reset.line)}</p>` +
        `<div class="dialogue-actions"><p class="dialogue-auto" data-dialogue-auto="true"></p></div>` +
        `</div>` +
        `</div>`;
      root.hidden = false;
      return;
    }
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

// ---- the reading clock -----------------------------------------------------------
// Every line moves on by itself once it has been up long enough to read. A station
// line can also be clicked; a line said in space waits its full time, so a mission
// may depend on it. Choices are never taken for the pilot.
let readClock = { key: "", elapsed: 0 };

export function resetDialogueClock() {
  readClock = { key: "", elapsed: 0 };
}

/** Advance the open dialogue by one line when its reading time has passed.
 *  Returns true when a line moved. Call once per rendered frame. */
export function updateDialogueClock(dt) {
  if (!root || root.hidden) return false;
  if (state.ui.intro) return false;
  // The dialogue's own pause stops the world, not the conversation.
  if (state.paused && !missionPause) return false;
  const mission = dialogueMission();
  const dialogue = mission && missionDialogue(mission);
  if (!mission || !dialogue) return false;
  if (dialogue.waitingForChoice) return false;
  const away = !!dialogue.station && dialogue.station !== state.place;
  const blocked = dialogue.requiresDock && (away || (!!state.player && !state.player.docked));
  if (blocked) return false;
  const key = `${mission.id}:${mission.step}:${dialogue.lineIndex}:${dialogue.line}`;
  if (key !== readClock.key) readClock = { key, elapsed: 0 };
  readClock.elapsed += Math.max(0, Number(dt) || 0);
  if (readClock.elapsed < dialogueReadSeconds(dialogue.line)) return false;
  resetDialogueClock();
  const changed = nextMissionDialogue(mission.id);
  if (!changed) return false;
  saveCurrentGame();
  renderDialogue();
  emit("mission-ui-refresh", {});
  return true;
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
  saveCurrentGame();
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
  return `<strong>${esc(missionKindWord(mission))} failed: ${esc(name)}</strong><span>${esc(why)}</span><em>Press R to dismiss</em>`;
}

export function isFailureNoticeOpen() {
  return Boolean(alertRoot && !alertRoot.hidden);
}

export function dismissFailureNotice() {
  const open = isFailureNoticeOpen();
  hideFailureNotice();
  return open;
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
  document.body.appendChild(alertRoot);
  on("mission-failed", showFailureNotice);
  on("action", ({ name, repeat, key } = {}) => {
    if (!repeat && (name === "rift" || key === "KeyR") && isFailureNoticeOpen()) hideFailureNotice();
  });
  // A natural reset is not a failure: the contact says the line, the act goes on
  // and the pilot repeats that one objective.
  // Losing a bonus is news too, but it is not a failure and it never stops the act.
  on("mission-optional-failed", ({ optional } = {}) => {
    if (!alertRoot || !optional) return;
    alertRoot.innerHTML = `<strong>Optional objective failed</strong><span>${esc(optional.objective || "")}</span><em>Press R to dismiss</em>`;
    alertRoot.hidden = false;
    clearTimeout(alertTimer);
    alertTimer = setTimeout(hideFailureNotice, 8 * 1000);
  });
  on("mission-step-reset", ({ mission, step, line, player } = {}) => {
    if (player && state.player && player !== state.player) return;
    renderDialogue();
    if (!alertRoot) return;
    const text = line || step?.resetLine || "";
    if (!text) return;
    alertRoot.innerHTML = `<strong>${esc(step?.speaker || mission?.title || "Mission")}</strong><span>${esc(text)}</span><em>Press R to dismiss</em>`;
    alertRoot.hidden = false;
    clearTimeout(alertTimer);
    alertTimer = setTimeout(hideFailureNotice, 12 * 1000);
  });
  on("main-menu", () => {
    state.ui.resetDialogue = null;
    hideFailureNotice();
    resetDialogueClock();
  });

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
