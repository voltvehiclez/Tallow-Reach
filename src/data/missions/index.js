// Mission data vocabulary. Definitions contain ids and plain values only: the
// runner in sim/missions.js owns event handling, counters and rewards. Each
// player-facing step may provide a spoiler-safe `objective` sentence; internal
// `log` text is not a HUD or Mission-log objective.

export const MISSION_KINDS = ["contract", "story"];

export const MISSION_STEP_KINDS = [
  "kill",
  "mine",
  "collect",
  "reach",
  "reach-sector",
  "deliver",
  "survive",
  "dialogue",
  "script",
  "wait",
  "flags",
  "parallel",
];

export const CONTRACT_OBJECTIVE_KINDS = {
  mine: "mine",
  hunt: "kill",
  salvage: "collect",
};

export const SCRIPT_ACTION_KINDS = [
  "spawn-wave",
  "spawn-ship",
  "set-sector-state",
  "give-item",
  "take-item",
  "play-sound",
  "warp-player",
];

export const isMissionKind = kind => MISSION_KINDS.includes(kind);
export const isMissionStepKind = kind => MISSION_STEP_KINDS.includes(kind);
export const isScriptActionKind = kind => SCRIPT_ACTION_KINDS.includes(kind);

export { BORDER_SIGNAL_MISSION, STORY_MISSIONS } from "./story.js";
export { TEST_MISSIONS } from "./test-missions.js";

import { STORY_MISSIONS } from "./story.js";
import { TEST_MISSIONS } from "./test-missions.js";

/** An authored definition by id: story missions first, then the framework test missions. */
export const storyMission = id =>
  STORY_MISSIONS.find(mission => mission.id === id) || TEST_MISSIONS.find(mission => mission.id === id) || null;
