// The campaign's own screens: the chapter/act list on the title screen, and the
// full-screen cards that end an act. An act is not a job, so nothing here accepts,
// abandons or hands anything in: the act starts, the act ends, and the campaign
// menu is where the pilot belongs between acts.

import { state, saveCurrentGame } from "../state/state.js";
import { CAMPAIGN_CHAPTERS } from "../data/campaign/index.js";
import { campaignRows, isCampaignMissionId } from "../sim/campaign.js";
import { restartCampaignAct, startCampaignAct } from "../sim/campaign-act.js";
import { emit, on } from "../util/events.js";
import { uiSound } from "../core/audio.js";
import { setPause } from "./pause.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[c]));

function actStatus(row) {
  if (row.active) return "In progress";
  if (row.complete) return "Completed · Replayable";
  if (row.available) return "Next act";
  return "Locked";
}

function actButton(row) {
  if (row.locked) return `<button disabled>Locked</button>`;
  const label = row.active ? "Resume" : row.complete ? "Replay" : "Begin";
  return `<button data-a="campaignAct" data-b="${esc(row.act.id)}">${label}</button>`;
}

/** Pure HTML for the campaign screen shown on the title. */
export function campaignScreenHtml(profile = state.profile) {
  const rows = campaignRows(profile);
  const byId = new Map(rows.map(row => [row.act.chapterId, []]));
  for (const row of rows) {
    if (!byId.has(row.act.chapterId)) byId.set(row.act.chapterId, []);
    byId.get(row.act.chapterId).push(row);
  }
  const chapters = CAMPAIGN_CHAPTERS.map(chapter => {
    const acts = byId.get(chapter.id) || [];
    const done = acts.filter(row => row.complete).length;
    const body = acts.length
      ? acts.map(row => {
          const meta = [actStatus(row), row.mission?.rewards?.credits ? `${Math.max(0, Math.floor(+row.mission.rewards.credits))} cr` : ""]
            .filter(Boolean).join(" · ");
          return (
            `<div class="row campaign-act${row.locked ? " is-locked" : ""}${row.active ? " is-active" : ""}">` +
            `<div><strong>${esc(row.act.n)}</strong><small>${esc(row.act.d || "")}</small><small class="campaign-act-meta">${esc(meta)}</small></div>` +
            actButton(row) +
            `</div>`
          );
        }).join("")
      : `<p>More acts are being written.</p>`;
    return (
      `<section class="campaign-chapter">` +
      `<h2>${esc(chapter.n)}</h2>` +
      `<p class="campaign-chapter-note">${esc(chapter.d || "")}</p>` +
      `<p class="campaign-progress">${done} of ${acts.length} act${acts.length === 1 ? "" : "s"} complete</p>` +
      body +
      `</section>`
    );
  }).join("");
  return (
    `<h1>Campaign</h1>` +
    `<div class="sub">Pick up the story where you left it. An act starts when you choose it and ends back here.</div>` +
    `<div class="campaign-chapters">${chapters}</div>` +
    `<div class="main-menu-actions"><button class="go" data-a="campaignBack">Back</button></div>`
  );
}

let endRoot = null;
let failedMission = null;

/** The big card that stops the act. `kind` is "accomplished" or "failed". */
export function campaignEndHtml({ kind, title, line = "", detail = "", buttons = "" } = {}) {
  const accomplished = kind === "accomplished";
  return (
    `<div class="campaign-end-card ${accomplished ? "is-accomplished" : "is-failed"}">` +
    `<div class="campaign-end-kicker">${accomplished ? "Campaign" : "Act failed"}</div>` +
    `<h1>${accomplished ? "Mission accomplished" : "Mission failed"}</h1>` +
    (title ? `<p class="campaign-end-title">${esc(title)}</p>` : "") +
    (line ? `<p class="campaign-end-line">${esc(line)}</p>` : "") +
    (detail ? `<p class="campaign-end-detail">${esc(detail)}</p>` : "") +
    `<div class="campaign-end-actions">${buttons || `<button data-campaign-end="menu">Return to campaign menu</button>`}</div>` +
    `</div>`
  );
}

function showEnd(html, kind = "") {
  if (!endRoot) return;
  endRoot.innerHTML = html;
  endRoot.hidden = false;
  // A finished or failed act stops the world: the pilot has a decision to make.
  state.ui.campaignEnd = kind || "open";
  uiSound("confirm");
}

function hideEnd() {
  state.ui.campaignEnd = null;
  failedMission = null;
  if (endRoot) {
    endRoot.hidden = true;
    endRoot.innerHTML = "";
  }
}

/** Leave the act and put the pilot back on the campaign screen. */
export function showCampaignMenu({ save = true } = {}) {
  hideEnd();
  if (save && !state.ui.intro) saveCurrentGame();
  state.ui.intro = true;
  state.ui.campaign = true;
  emit("main-menu", {});
}

/** Shown by the campaign screen's action when a completed act is finished. */
export function campaignMenuBack() {
  state.ui.campaign = false;
  state.ui.intro = true;
  emit("main-menu", {});
}

/** Install the end-of-act card and listen for the events that fill it. */
export function setupCampaign() {
  endRoot = document.createElement("div");
  endRoot.id = "campaign-end";
  endRoot.hidden = true;
  endRoot.setAttribute("role", "dialog");
  endRoot.setAttribute("aria-modal", "true");
  endRoot.addEventListener("click", event => {
    const retry = event.target.closest("[data-campaign-retry]");
    if (retry) {
      const fromCheckpoint = retry.dataset.campaignRetry === "checkpoint" && failedMission?.checkpoint;
      const result = fromCheckpoint
        ? startCampaignAct(failedMission.id, { restart: true, checkpoint: failedMission.checkpoint })
        : restartCampaignAct(failedMission?.id);
      if (!result.ok) return;
      hideEnd();
      emit("campaign-act-entered", {});
      return;
    }
    const button = event.target.closest("[data-campaign-end]");
    if (!button) return;
    showCampaignMenu();
  });
  document.body.appendChild(endRoot);

  on("campaign-act-completed", ({ mission, reward } = {}) => {
    if (state.mode !== "campaign") return;
    showEnd(campaignEndHtml({
      kind: "accomplished",
      title: mission?.title || "Campaign act",
      line: reward > 0 ? `Paid ${reward} cr.` : "Act complete.",
      detail: "The campaign continues from the chapter menu.",
    }), "accomplished");
  });

  // Pause card → Restart act: a clean act, from the top.
  on("pause-restart-act", () => {
    const result = restartCampaignAct();
    if (!result.ok) return;
    setPause(false);
    hideEnd();
    emit("campaign-act-entered", {});
  });

  // A failed act stops the game and offers the two ways back: the beginning, or
  // the last checkpoint the act reached (a data flag on a step; First Sortie has
  // none yet, so it only ever offers the beginning).
  on("mission-failed", ({ mission, message } = {}) => {
    if (state.mode !== "campaign" || !mission || !isCampaignMissionId(mission.id)) return;
    failedMission = mission;
    const checkpoint = mission.checkpoint;
    const buttons =
      `<button data-campaign-retry="begin">Start from the beginning</button>` +
      (checkpoint ? `<button data-campaign-retry="checkpoint">Start from last checkpoint</button>` : "") +
      `<button data-campaign-end="menu">Return to campaign menu</button>`;
    showEnd(campaignEndHtml({
      kind: "failed",
      title: mission.title,
      line: message || mission.failureMessage || "The act cannot continue.",
      detail: checkpoint ? "A checkpoint was reached earlier in this act." : "This act has no checkpoints yet, so it restarts from the top.",
      buttons,
    }), "failed");
  });
}
