// Contract-board compatibility facade. Step 13 moves progress into the generic
// mission runner; these names keep the existing menu and callers stable.

import { R } from "../util/math.js";
import { random } from "../util/rng.js";
import { CONTRACT, CONTRACT_TYPES, CONTRACTS_PER_BOARD, DESCRIBE } from "../data/contracts.js";
import {
  activeMissions,
  acceptMission,
  abandonMission,
  completeMission,
  missionNextText,
  canCollectMissionReward,
  isMissionComplete,
  missionDescription,
  missionProgress,
  missionAt,
  missionForObjective,
  remainingObjective,
} from "./missions.js";
import { state } from "../state/state.js";

function generateContract() {
  const tier = 1 + Math.floor(R(0, 3));
  const type = CONTRACT_TYPES[Math.floor(R(0, CONTRACT_TYPES.length))];
  return { type, tier, p: 0, ...CONTRACT[type](tier, random) };
}

export function generateBoard() {
  return Array.from({ length: CONTRACTS_PER_BOARD }, generateContract);
}

/** Make sure there is an offer board to show. */
export function ensureBoard(world = state.worldState) {
  if (!Array.isArray(world.board) || world.board.length === 0) world.board = generateBoard();
}

export function rerollBoard(world = state.worldState) {
  world.board = generateBoard();
}

/** One-line wording works for both compact board offers and active missions. */
export function describe(mission) {
  return missionDescription(mission) || DESCRIBE[mission?.type]?.(mission) || "Mission";
}

export function acceptContract(index, profile = state.profile, world = state.worldState) {
  ensureBoard(world);
  const offer = world.board[index];
  if (!offer) return undefined;
  const mission = acceptMission(offer, profile);
  rerollBoard(world);
  return mission ? "Contract accepted. Launch when ready." : undefined;
}

export function abandonContract(index, profile = state.profile) {
  if (index && typeof index === "object") return abandonMission(undefined, index);
  return abandonMission(index, profile);
}

export function completeContract(index, profile = state.profile) {
  if (index && typeof index === "object") return completeMission(undefined, index);
  return completeMission(index, profile);
}

export {
  activeMissions,
  acceptMission,
  canCollectMissionReward,
  isMissionComplete,
  missionNextText,
  missionProgress,
  missionAt,
  missionForObjective,
  remainingObjective,
};
