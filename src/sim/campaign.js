// Campaign-mode selection and progress. Campaign missions live in their own data
// folder and run in their own galaxy; this module is the small mode-aware bridge
// the shared mission runner, the campaign screen and the station screens use.
//
// Campaign structure is chapters -> acts (data/campaign/chapters.js). There is no
// job board and no accepting: an act starts from the campaign screen and runs to
// its end. Progress is still one saved list of completed mission ids.

import { state } from "../state/state.js";
import { CAMPAIGN_MISSIONS, CAMPAIGN_ACTS, campaignAct, campaignMission } from "../data/campaign/index.js";
export { campaignMission, campaignAct };

export const isCampaignMode = () => state.mode === "campaign";
export const campaignMissions = () => CAMPAIGN_MISSIONS;
export const isCampaignMissionId = id => !!campaignMission(id);

export function campaignCompleted(profile = state.profile) {
  const raw = profile?.campaign?.completed;
  return new Set(Array.isArray(raw) ? raw.filter(id => typeof id === "string" && campaignMission(id)) : []);
}

export function campaignComplete(profile = state.profile) {
  const done = campaignCompleted(profile);
  return campaignMissions().length > 0 && campaignMissions().every(mission => done.has(mission.id));
}

/** The campaign mission running right now, or null. */
export function activeCampaignMission(profile = state.profile) {
  const list = Array.isArray(profile?.missions) ? profile.missions : [];
  return list.find(mission => isCampaignMissionId(mission?.id)) || null;
}

/**
 * Every act in playing order with its state for the campaign screen.
 * `complete` — already finished and replayable; `active` — the act in progress
 * (resume it); `available` — the next act that may be started; `locked` — later
 * acts wait for the ones before them.
 */
export function campaignRows(profile = state.profile) {
  const done = campaignCompleted(profile);
  // A failed act is not resumable: the screen offers it as a fresh start, never
  // as "Resume", so a quit from the failure card can never strand the pilot on a
  // mission that can no longer advance.
  const running = activeCampaignMission(profile);
  const active = running && !running.failed ? running : null;
  let nextTaken = false;
  return CAMPAIGN_ACTS.map(act => {
    const mission = campaignMission(act.mission);
    const complete = done.has(act.mission);
    const isActive = !!active && active.id === act.mission;
    const available = complete || isActive || (!nextTaken && !done.has(act.mission));
    if (!complete && !isActive && !nextTaken) nextTaken = true;
    return { act, mission, complete, active: isActive, available, locked: !available };
  });
}

export function campaignActRow(actId, profile = state.profile) {
  return campaignRows(profile).find(row => row.act.id === actId || row.act.mission === actId) || null;
}

/** True when this act (record or mission id) may be started or resumed now. */
export function campaignAvailable(definitionOrActId, profile = state.profile) {
  const act = typeof definitionOrActId === "string"
    ? campaignAct(definitionOrActId)
    : campaignAct(definitionOrActId?.id) || campaignAct(definitionOrActId?.mission);
  if (!act) return false;
  const row = campaignActRow(act.id, profile);
  return !!row && row.available;
}

// ---- act boundaries -------------------------------------------------------
// A campaign act is a scene, not a sandbox. The pilot leaves the act's pocket
// only when the act says so, and cannot dock in the middle of a fight. Both rules
// read the running act's own data, so a future act may grant travel or allow a
// dock by writing it on the step it belongs to.

const currentStepOf = mission => (Array.isArray(mission?.steps) ? mission.steps[mission.step] : null);
const stepIsKill = step => step?.kind === "kill" ||
  (step?.kind === "parallel" && (Array.isArray(step.steps) ? step.steps : []).some(child => child?.kind === "kill"));

/** Why the pilot may not warp out of this campaign pocket, or "" if they may. */
export function campaignTravelRefusal(profile = state.profile) {
  if (state.mode !== "campaign") return "";
  const mission = activeCampaignMission(profile);
  if (!mission) return "You have no business leaving this pocket.";
  if (mission.allowTravel === true) return "";
  if (currentStepOf(mission)?.allowTravel === true) return "";
  return "You do not have permission to leave this pocket.";
}

/** Why the pilot may not dock right now, or "" if they may. Docking is blocked
 *  only while the act still owes a destruction: flying objectives leave the
 *  station open, so a pilot can put down and pick the act back up. */
export function campaignDockRefusal(profile = state.profile) {
  if (state.mode !== "campaign") return "";
  const mission = activeCampaignMission(profile);
  if (!mission || mission.completed || mission.failed) return "";
  if (!stepIsKill(currentStepOf(mission))) return "";
  return "You cannot dock while the act's enemies are still out there.";
}

/** Record a first completion. Returns true when this was a new story completion. */
export function noteCampaignCompletion(mission, profile = state.profile) {
  if (!mission || !isCampaignMissionId(mission.id) || !profile || typeof profile !== "object") return false;
  const done = campaignCompleted(profile);
  if (done.has(mission.id)) return false;
  if (!profile.campaign || typeof profile.campaign !== "object" || Array.isArray(profile.campaign)) profile.campaign = { completed: [] };
  if (!Array.isArray(profile.campaign.completed)) profile.campaign.completed = [];
  profile.campaign.completed.push(mission.id);
  profile.campaign.completed = [...new Set(profile.campaign.completed)];
  return true;
}
