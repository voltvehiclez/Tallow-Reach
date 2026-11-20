// The campaign's authored mission order and its own lookup. Campaign definitions
// never enter the open-world story list; the live mode decides which list UI reads.

import { M01_FIRST_SORTIE } from "./m01.js";

export const CAMPAIGN_MISSIONS = Object.freeze([
  M01_FIRST_SORTIE,
]);

export const CAMPAIGN_MISSION_IDS = Object.freeze(CAMPAIGN_MISSIONS.map(mission => mission.id));

export const campaignMission = id => CAMPAIGN_MISSIONS.find(mission => mission.id === id) || null;
