// The campaign's own screens: the chapter boxes on the title screen's left window,
// the header in its right panel, and the full-screen cards that end an act. An act
// is not a job, so nothing here accepts, abandons or hands anything in: the act
// starts, the act ends, and the campaign menu is where the pilot belongs between
// acts.

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

function actActionLabel(row) {
  return row.active ? "Resume" : row.complete ? "Replay" : "Begin";
}

/* ---- chapter boxes -------------------------------------------------------- */
// The campaign screen is a set of large boxes on the left-hand window, not a
// list of headings: one box per chapter, and a chapter opens into its acts.
// Future chapters and acts are drawn locked, so the shape of the campaign is
// visible before it is written.

/** "Chapter 1: Auric Reach" reads as kicker "Chapter 1", title "Auric Reach". */
function splitName(name = "") {
  const at = String(name).indexOf(": ");
  return at < 0
    ? { kicker: "", title: String(name) }
    : { kicker: String(name).slice(0, at), title: String(name).slice(at + 2) };
}

function chapterRows(profile) {
  const rows = campaignRows(profile);
  return CAMPAIGN_CHAPTERS.map(chapter => {
    const acts = rows.filter(row => row.act.chapterId === chapter.id);
    const playable = acts.length;
    const done = acts.filter(row => row.complete).length;
    const open = !chapter.planned && playable > 0;
    const active = acts.some(row => row.active);
    return { chapter, acts, playable, done, open, active };
  });
}

function chapterBox(row, index) {
  const { chapter } = row;
  // A chapter that is not written yet shows no name of its own: a blurred
  // placeholder with a number, so the shape of the campaign is visible without
  // advertising stories that do not exist.
  if (!row.open) {
    const status = row.playable ? "Locked" : `Chapter ${index + 1}`;
    return (
      `<button type="button" class="campaign-box campaign-chapter-box is-locked is-planned" ` +
      `data-a="campaignChapter" data-b="${esc(chapter.id)}" aria-label="${esc(status)} — coming soon">` +
      `<span class="campaign-box-kicker">${esc(status)}</span>` +
      `<strong class="campaign-box-title">Coming soon</strong>` +
      `<span class="campaign-box-note is-redacted">This chapter is not written yet. The story continues here in a later act.</span>` +
      `<span class="campaign-box-meta">Locked</span>` +
      `</button>`
    );
  }
  const { kicker, title } = splitName(chapter.n);
  const status = row.active ? "In progress" : row.done === row.playable ? "Completed" : "Open";
  const counts = `${row.done} of ${row.playable} act${row.playable === 1 ? "" : "s"} complete`;
  return (
    `<button type="button" class="campaign-box campaign-chapter-box${row.active ? " is-active" : ""}" ` +
    `data-a="campaignChapter" data-b="${esc(chapter.id)}" aria-label="${esc(chapter.n)}">` +
    `<span class="campaign-box-kicker">${esc(kicker || `Chapter ${index + 1}`)}</span>` +
    `<strong class="campaign-box-title">${esc(title)}</strong>` +
    `<span class="campaign-box-note">${esc(chapter.d || "")}</span>` +
    `<span class="campaign-box-meta">${esc(counts)} · ${esc(status)}</span>` +
    `</button>`
  );
}

function actBox(row) {
  const { kicker, title } = splitName(row.act.n);
  const meta = [actStatus(row), row.mission?.rewards?.credits ? `${Math.max(0, Math.floor(+row.mission.rewards.credits))} cr` : ""]
    .filter(Boolean).join(" · ");
  const body =
    `<span class="campaign-box-kicker">${esc(kicker || "Act")}</span>` +
    `<strong class="campaign-box-title">${esc(title)}</strong>` +
    `<span class="campaign-box-note">${esc(row.act.d || "")}</span>` +
    `<span class="campaign-box-meta">${esc(meta)}</span>`;
  if (row.locked) {
    return `<button type="button" class="campaign-box campaign-act-box is-locked" disabled aria-label="${esc(row.act.n)}">${body}<span class="campaign-box-action">Locked</span></button>`;
  }
  return (
    `<button type="button" class="campaign-box campaign-act-box${row.active ? " is-active" : ""}" ` +
    `data-a="campaignAct" data-b="${esc(row.act.id)}" aria-label="${esc(row.act.n)}">` +
    body +
    `<span class="campaign-box-action">${actActionLabel(row)}</span>` +
    `</button>`
  );
}

function plannedBox(act, index) {
  return (
    `<button type="button" class="campaign-box campaign-act-box is-locked is-planned" disabled ` +
    `aria-label="Act ${index + 1} — coming soon">` +
    `<span class="campaign-box-kicker">Act ${index + 1}</span>` +
    `<strong class="campaign-box-title">Coming soon</strong>` +
    `<span class="campaign-box-note is-redacted">This act is not written yet. Its story will open here.</span>` +
    `<span class="campaign-box-meta">Locked</span>` +
    `</button>`
  );
}

/**
 * The big left-hand window: chapter boxes, or one chapter's act boxes once a
 * chapter is chosen. Pure HTML, so the campaign screen can be tested without a DOM.
 */
export function campaignMenuHtml(profile = state.profile, ui = state.ui) {
  const rows = chapterRows(profile);
  const openId = ui?.campaignChapter || null;
  if (!openId) {
    return (
      `<h2>Chapters</h2>` +
      `<p class="campaign-lead">Choose a chapter. Its acts open here.</p>` +
      `<div class="campaign-boxes">${rows.map((row, index) => chapterBox(row, index)).join("")}</div>`
    );
  }
  const picked = rows.find(row => row.chapter.id === openId) || null;
  if (!picked) {
    return (
      `<h2>Chapters</h2>` +
      `<div class="campaign-boxes">${rows.map((row, index) => chapterBox(row, index)).join("")}</div>`
    );
  }
  const { chapter } = picked;
  const heading = picked.open ? chapter.n : `Chapter ${rows.indexOf(picked) + 1}`;
  const blurb = picked.open ? (chapter.d || "") : "This chapter is not written yet.";
  const acts = picked.acts.map(actBox);
  const planned = chapter.acts
    .map((act, index) => ({ act, index }))
    .filter(entry => !entry.act.mission)
    .map((entry, order) => plannedBox(entry.act, picked.acts.length + order));
  const progress = picked.open
    ? `${picked.done} of ${picked.playable} act${picked.playable === 1 ? "" : "s"} complete`
    : "Locked";
  return (
    `<div class="campaign-chapter-head">` +
    `<button type="button" class="campaign-back" data-a="campaignChapters">← All chapters</button>` +
    `<h2>${esc(heading)}</h2>` +
    `<p class="campaign-lead">${esc(blurb)} <span class="campaign-progress">${esc(progress)}</span></p>` +
    `</div>` +
    `<div class="campaign-boxes campaign-act-boxes">${acts.join("")}${planned.join("")}</div>`
  );
}

/** The narrow right-hand panel on the title: the campaign's own header. */
export function campaignScreenHtml(profile = state.profile) {
  const rows = campaignRows(profile);
  const done = rows.filter(row => row.complete).length;
  const open = chapterRows(profile).filter(row => row.open).length;
  return (
    `<h1>Campaign</h1>` +
    `<div class="sub">Pick up the story where you left it. An act starts when you choose it and ends back here.</div>` +
    `<p class="campaign-progress">${done} of ${rows.length} act${rows.length === 1 ? "" : "s"} complete · ${open} chapter${open === 1 ? "" : "s"} open</p>` +
    `<p class="campaign-side-note">Chapters are on the left. A chapter opens into its acts; future acts are already marked, so you can see where the story is going.</p>` +
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
  // The screen opens on the chapter boxes, never inside a chapter the pilot last
  // looked at (that decision belonged to the previous visit).
  state.ui.campaignChapter = null;
  emit("main-menu", {});
}

/** Shown by the campaign screen's action when a completed act is finished. */
export function campaignMenuBack() {
  // Nothing of the act's screen belongs to the title: drop the card if it is still
  // up and open on the chapter boxes next time.
  hideEnd();
  state.ui.campaign = false;
  state.ui.campaignChapter = null;
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

  // Leaving the act by any other route — the pause card's Exit to main menu, a
  // mode switch, a load — must take the end card with it. It is a fixed overlay
  // that covers the whole screen, so a card left behind reads as a blank menu
  // with no UI at all (the Act 1 completion report).
  on("main-menu", () => hideEnd());

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
