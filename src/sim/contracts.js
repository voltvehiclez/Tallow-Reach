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
  canCompleteMissionHere,
  atMissionHandInStation,
  missionHandInStationName,
  missionOfferStation,
  missionObjectivesDone,
  missionHandIn,
  missionDescription,
  missionProgress,
  missionAt,
  missionForObjective,
  remainingObjective,
} from "./missions.js";
import { state } from "../state/state.js";
import { DEFAULT_PLACE } from "../data/places.js";

function generateContract() {
  const tier = 1 + Math.floor(R(0, 3));
  const type = CONTRACT_TYPES[Math.floor(R(0, CONTRACT_TYPES.length))];
  return { type, tier, p: 0, ...CONTRACT[type](tier, random) };
}

export function generateBoard() {
  return Array.from({ length: CONTRACTS_PER_BOARD }, generateContract);
}

/**
 * The contract board of one station. Every station has its own offers, so a
 * board read at Meridian cannot be browsed or accepted anywhere else.
 *
 * `world.board` stays the home station's board (and the old save field), so a
 * save from before per-station boards still has its offers where the pilot left
 * them; every other station gets its own list in `world.boards[placeId]`,
 * generated the first time it is looked at.
 */
export function boardAt(placeId = state.place, world = state.worldState) {
  if (placeId === DEFAULT_PLACE) {
    if (!Array.isArray(world.board) || world.board.length === 0) world.board = generateBoard();
    return world.board;
  }
  if (!world.boards || typeof world.boards !== "object" || Array.isArray(world.boards)) world.boards = {};
  if (!Array.isArray(world.boards[placeId]) || world.boards[placeId].length === 0) {
    world.boards[placeId] = generateBoard();
  }
  return world.boards[placeId];
}

/** Make sure the station's offer board exists. */
export function ensureBoard(world = state.worldState, placeId = state.place) {
  boardAt(placeId, world);
  return world;
}

/** Replace the offers on the board at `placeId` only. */
export function rerollBoard(world = state.worldState, placeId = state.place) {
  if (placeId === DEFAULT_PLACE) {
    world.board = generateBoard();
  } else {
    if (!world.boards || typeof world.boards !== "object" || Array.isArray(world.boards)) world.boards = {};
    world.boards[placeId] = generateBoard();
  }
  return world;
}

/** One-line wording works for both compact board offers and active missions. */
export function describe(mission) {
  return missionDescription(mission) || DESCRIBE[mission?.type]?.(mission) || "Mission";
}

export function acceptContract(index, profile = state.profile, world = state.worldState, placeId = state.place) {
  const offer = boardAt(placeId, world)[index];
  if (!offer) return undefined;
  const mission = acceptMission(offer, profile, placeId);
  rerollBoard(world, placeId);
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
  missionOfferStation,
  activeMissions,
  acceptMission,
  canCollectMissionReward,
  canCompleteMissionHere,
  atMissionHandInStation,
  missionHandInStationName,
  missionObjectivesDone,
  missionHandIn,
  missionNextText,
  missionProgress,
  missionAt,
  missionForObjective,
  remainingObjective,
};
