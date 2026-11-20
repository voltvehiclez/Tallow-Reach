// Campaign-mode selection and progress. Campaign missions live in their own data
// folder and run in their own galaxy; this module is the small mode-aware bridge
// the shared mission runner and screens use.

import { state } from "../state/state.js";
import { CAMPAIGN_MISSIONS, campaignMission } from "../data/campaign/index.js";
export { campaignMission };

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

/** Ordered rows for the mission-select screen. One mission unlocks at a time; completed rows remain replayable. */
export function campaignRows(profile = state.profile) {
  const done = campaignCompleted(profile);
  const next = campaignMissions().find(mission => !done.has(mission.id));
  return campaignMissions().map(mission => {
    const complete = done.has(mission.id);
    const available = complete || mission === next;
    return { mission, complete, available, current: mission === next };
  });
}

export function campaignAvailable(definition, profile = state.profile) {
  if (!definition || !isCampaignMissionId(definition.id)) return false;
  return campaignRows(profile).some(row => row.mission.id === definition.id && row.available);
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
