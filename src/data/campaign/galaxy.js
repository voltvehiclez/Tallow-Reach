// Campaign-only galaxy. It uses the same seeded generator and the same star,
// pocket, gate, belt and planet machinery as the open world, but its authored
// places are supplied by the campaign catalog rather than the open-world
// PLACES table. The campaign has no physical connection to the open world.

import { GALAXY } from "../galaxy.js";
import { DEFAULT_SKY } from "../places.js";

export const CAMPAIGN_GALAXY_SEED = 240515;
export const CAMPAIGN_HOME_SYSTEM = "auric-reach";
export const CAMPAIGN_HOME_POCKET = "auric-flight-school";
export const CAMPAIGN_RANGE_DEF = "auric_flight_school";

const flightSchool = {
  id: CAMPAIGN_HOME_SYSTEM,
  kind: "system",
  n: "Auric Reach",
  parent: null,
  pos: [0, 0],
  tier: 1,
  core: { kind: "star", n: "Auric" },
};

const flightSchoolPocket = {
  id: CAMPAIGN_HOME_POCKET,
  kind: "pocket",
  def: CAMPAIGN_RANGE_DEF,
  parent: CAMPAIGN_HOME_SYSTEM,
  n: "Korr Flight Academy",
  d: "Captain Dane Korr's starship flight academy and its training range.",
  mapHeight: -0.028,
  sunwardArrival: 1100,
  enter: { kind: "warp", pos: [0, 0, 300] },
  leave: { kind: "warp" },
  sky: { ...DEFAULT_SKY },
};

/** Authored campaign geography. Adding another authored campaign system means
 * adding one record here plus its place definition; the generator does the rest.
 * Generated systems remain derived from the fixed seed and are never saved. */
export const CAMPAIGN_AUTHORED = {
  systems: [flightSchool],
  pockets: { [CAMPAIGN_HOME_POCKET]: flightSchoolPocket },
  links: {},
};

/** Fixed-seed, seven-system campaign galaxy. The generator remains the one
 * implementation for both modes; this patch only changes the authored catalog. */
export const CAMPAIGN_GALAXY = {
  ...GALAXY,
  seed: CAMPAIGN_GALAXY_SEED,
  homeSystem: CAMPAIGN_HOME_SYSTEM,
  homePocket: CAMPAIGN_HOME_POCKET,
  systemCount: 7,
  layout: { ...GALAXY.layout, radius: 480, candidates: 22 },
  difficulty: { ...GALAXY.difficulty, base: 1, perDistance: 0.006, variation: 0 },
  authored: CAMPAIGN_AUTHORED,
};

/** The fresh campaign mode's world record. It has the same shape as an open-world
 * save, but none of the open-world standing wormhole population. */
export function campaignGalaxyRecord() {
  return {
    seed: CAMPAIGN_GALAXY_SEED,
    knowledge: { [CAMPAIGN_HOME_SYSTEM]: { discovered: true, visited: true } },
  };
}
