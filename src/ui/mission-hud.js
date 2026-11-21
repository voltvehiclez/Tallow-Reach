// The extra lines a campaign act puts under its objective in the top-right HUD
// block: the control lesson's hold bar, and the run's own rule (stay within 1 km,
// bonus within 500 m). Pure HTML — no DOM, no three.js — so it is tested directly
// and the HUD only decides when to show it.

import { missionBonusStatus } from "../sim/missions.js";
import { isCampaignMissionId } from "../sim/campaign.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[c]));

/** A hold bar as a percentage: a full bar is one learned control. */
export function holdBarHtml(hold) {
  if (!hold) return "";
  const percent = Math.round(Math.max(0, Math.min(1, Number(hold.fraction) || 0)) * 100);
  return `<small class="hud-hold"><span class="hold-label">${esc(hold.label || "")}</span>` +
    `<span class="hold-track"><i style="width:${percent}%"></i></span><b>${percent}%</b></small>`;
}

/** The run's rule, and the still-live bonus (or live distance once the bonus is gone), directly under the objective. */
export function chaseLinesHtml(run, mission) {
  if (!run) return "";
  const gapLimit = Number(run.maxGap) > 0 ? Number(run.maxGap) : 1000;
  const limit = gapLimit % 1000 === 0 ? `${gapLimit / 1000} km` : `${gapLimit} m`;
  const rule = run.gathering
    ? `Close to within ${Math.round(Number(run.gather) || 300)} m of Dane to start the run.`
    : `Stay within ${limit} of Dane for the whole course to pass.`;
  // While he waits for the form-up there is no distance to judge. Once the run is
  // live, keep the live distance readout on screen even after the 500 m bonus is
  // lost, because the pilot still needs to stay within the 1 km pass mark.
  const liveGap = !run.gathering && Number.isFinite(Number(run.gap))
    ? Math.max(0, Math.round(Number(run.gap)))
    : null;
  const bonus = missionBonusStatus(mission, liveGap);
  const bonusLine = bonus
    ? `<small class="hud-bonus${bonus.over ? " is-over" : ""}">Bonus: within ${bonus.limit} m` +
      `${bonus.metres == null || run.gathering ? "" : ` · now ${bonus.metres} m`}</small>`
    : liveGap != null
      ? `<small class="hud-bonus${liveGap > gapLimit ? " is-over" : ""}">Distance to Dane: now ${liveGap} m</small>`
      : "";
  return `<small class="hud-chase">${esc(rule)}</small>${bonusLine}`;
}

/** Every extra line this act adds under its objective, in order. */
export function campaignDetailHtml(mission, { hold = null, run = null } = {}) {
  if (!mission || !isCampaignMissionId(mission.id)) return "";
  return `${hold && hold.mission === mission.id ? holdBarHtml(hold) : ""}` +
    `${run && run.mission === mission.id ? chaseLinesHtml(run, mission) : ""}`;
}
