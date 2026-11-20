// The campaign's authored mission order and its own lookup. Campaign definitions
// never enter the open-world story list; the live mode decides which list UI reads.

import { M01_FIRST_SORTIE } from "./m01.js";
import { CAMPAIGN_ACTS, CAMPAIGN_CHAPTERS } from "./chapters.js";

export { CAMPAIGN_ACTS, CAMPAIGN_CHAPTERS };

export const CAMPAIGN_MISSIONS = Object.freeze([
  M01_FIRST_SORTIE,
]);

export const CAMPAIGN_MISSION_IDS = Object.freeze(CAMPAIGN_MISSIONS.map(mission => mission.id));

export const campaignMission = id => CAMPAIGN_MISSIONS.find(mission => mission.id === id) || null;

/** The act record for an act id or a mission id, or null. */
export const campaignAct = idOrMission =>
  CAMPAIGN_ACTS.find(act => act.id === idOrMission || act.mission === idOrMission) || null;

/** The chapter an act belongs to, or null. */
export const campaignChapter = chapterId =>
  CAMPAIGN_CHAPTERS.find(chapter => chapter.id === chapterId) || null;
