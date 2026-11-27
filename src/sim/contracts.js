// Contract-board facade. Active progress lives in the generic mission runner;
// each station keeps its own offer list and its own unpaused 10-minute refresh
// cooldown in `world.boardTimers`, persisted across save/load.

import { R } from "../util/math.js";
import { random } from "../util/rng.js";
import { emit } from "../util/events.js";
import {
  CONTRACT,
  CONTRACT_REFRESH_SECONDS,
  CONTRACT_TYPES,
  CONTRACTS_PER_BOARD,
  DESCRIBE,
} from "../data/contracts.js";
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
  missionItemRequirements,
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

const hasOwn = (obj, key) => !!obj && Object.prototype.hasOwnProperty.call(obj, key);

function timersOf(world = state.worldState) {
  if (!world.boardTimers || typeof world.boardTimers !== "object" || Array.isArray(world.boardTimers)) {
    world.boardTimers = {};
  }
  return world.boardTimers;
}

function armRefreshTimer(world, placeId, seconds = CONTRACT_REFRESH_SECONDS) {
  timersOf(world)[placeId] = Math.max(0, Number(seconds) || 0);
}

function generateContract() {
  const tier = 1 + Math.floor(R(0, 3));
  const type = CONTRACT_TYPES[Math.floor(R(0, CONTRACT_TYPES.length))];
  return { type, tier, p: 0, ...CONTRACT[type](tier, random) };
}

export function generateBoard() {
  return Array.from({ length: CONTRACTS_PER_BOARD }, generateContract);
}

/** Remaining unpaused simulation seconds before `placeId`'s board may be refreshed. */
export function boardRefreshRemaining(placeId = state.place, world = state.worldState) {
  const raw = world?.boardTimers?.[placeId];
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : 0;
}

/** True when `placeId`'s contract refresh timer has reached zero. */
export function canRefreshBoard(placeId = state.place, world = state.worldState) {
  return boardRefreshRemaining(placeId, world) <= 0;
}

/** Format remaining refresh seconds as `M:SS` (empty string when ready). */
export function formatBoardCooldown(seconds) {
  const whole = Math.max(0, Math.ceil(Number(seconds) || 0));
  if (whole <= 0) return "";
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

/**
 * The contract board of one station. Every station has its own offers and its
 * own refresh timer: generating a station's initial board arms its cooldown, and
 * emptying a board by accepting every offer leaves it empty until the cooldown
 * expires and the pilot clicks Refresh.
 *
 * `world.board` stays the home station's board for backward compatibility; every
 * other station uses `world.boards[placeId]`.
 */
export function boardAt(placeId = state.place, world = state.worldState) {
  // Campaign mode has its own mission list and no open-world contract board.
  // Keep the data shape intact, but never populate or offer contracts there.
  if (world === state.worldState && state.mode === "campaign") {
    if (!Array.isArray(world.board)) world.board = [];
    if (!world.boards || typeof world.boards !== "object" || Array.isArray(world.boards)) world.boards = {};
    if (!Array.isArray(world.boards[placeId])) world.boards[placeId] = [];
    return world.boards[placeId];
  }
  const timers = timersOf(world);
  if (placeId === DEFAULT_PLACE) {
    if (!Array.isArray(world.board)) world.board = [];
    if (world.board.length === 0 && !hasOwn(timers, DEFAULT_PLACE)) {
      world.board = generateBoard();
      armRefreshTimer(world, DEFAULT_PLACE);
    }
    return world.board;
  }
  if (!world.boards || typeof world.boards !== "object" || Array.isArray(world.boards)) world.boards = {};
  if (!Array.isArray(world.boards[placeId])) {
    world.boards[placeId] = generateBoard();
    armRefreshTimer(world, placeId);
  } else if (world.boards[placeId].length === 0 && !hasOwn(timers, placeId)) {
    world.boards[placeId] = generateBoard();
    armRefreshTimer(world, placeId);
  }
  return world.boards[placeId];
}

/** Make sure the station's offer board exists. */
export function ensureBoard(world = state.worldState, placeId = state.place) {
  boardAt(placeId, world);
  return world;
}

/** Force-replace the offers on `placeId`'s board and start a fresh cooldown. */
export function rerollBoard(world = state.worldState, placeId = state.place) {
  if (placeId === DEFAULT_PLACE) {
    world.board = generateBoard();
  } else {
    if (!world.boards || typeof world.boards !== "object" || Array.isArray(world.boards)) world.boards = {};
    world.boards[placeId] = generateBoard();
  }
  armRefreshTimer(world, placeId);
  return world;
}

/** Player-facing board refresh: respects this station's 10-minute cooldown. */
export function refreshBoard(world = state.worldState, placeId = state.place) {
  boardAt(placeId, world);
  const wait = boardRefreshRemaining(placeId, world);
  if (wait > 0) return `Contract refresh ready in ${formatBoardCooldown(wait)}.`;
  rerollBoard(world, placeId);
  return "";
}

/** Advance every station's contract refresh timer by `dt` unpaused simulation seconds. */
export function updateContractTimers(dt, world = state.worldState) {
  if (!(dt > 0) || !world?.boardTimers || typeof world.boardTimers !== "object") return;
  const timers = world.boardTimers;
  for (const [placeId, value] of Object.entries(timers)) {
    const prev = typeof value === "number" && Number.isFinite(value) ? value : 0;
    if (prev <= 0) continue;
    const next = Math.max(0, prev - dt);
    timers[placeId] = next;
    if (Math.ceil(prev) !== Math.ceil(next)) {
      emit("board-timer-changed", { placeId, remaining: next, ready: next <= 0, world });
    }
  }
}

/** One-line wording works for both compact board offers and active missions. */
export function describe(mission) {
  return missionDescription(mission) || DESCRIBE[mission?.type]?.(mission) || "Mission";
}

/** Accept one offer and remove only that offer from the station's board. */
export function acceptContract(index, profile = state.profile, world = state.worldState, placeId = state.place, player = undefined) {
  const offers = boardAt(placeId, world);
  const offer = offers[index];
  if (!offer) return undefined;
  const mission = acceptMission(offer, profile, placeId, player);
  if (!mission) return undefined;
  offers.splice(index, 1);
  // Ensure legacy in-memory boards with no timer entry remember they were rolled,
  // so taking their final contract keeps the board empty until a manual refresh.
  const timers = timersOf(world);
  if (!hasOwn(timers, placeId)) timers[placeId] = CONTRACT_REFRESH_SECONDS;
  return "Contract accepted. Launch when ready.";
}

export function abandonContract(index, profile = state.profile, player = undefined) {
  if (index && typeof index === "object") return abandonMission(undefined, index);
  return abandonMission(index, profile, player);
}

export function completeContract(index, profile = state.profile, player = undefined, world = undefined) {
  if (index && typeof index === "object") return completeMission(undefined, index);
  return completeMission(index, profile, player, world);
}

export {
  missionOfferStation,
  missionItemRequirements,
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
