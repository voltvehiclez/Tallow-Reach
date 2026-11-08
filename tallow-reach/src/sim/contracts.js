// Contracts: the offer board at the outpost and progress tracking while flying.
// The offer board lives in `world.board` (`state.worldState.board`); active
// contract progress and payout belong to the pilot's `profile`. Progress is
// driven entirely by events, so new contract types only need a generator in
// data/contracts.js and a listener here.

import { R } from "../util/math.js";
import { random } from "../util/rng.js";
import { on } from "../util/events.js";
import { CONTRACT, CONTRACT_TYPES, CONTRACTS_PER_BOARD, DESCRIBE } from "../data/contracts.js";
import { state, profileOf } from "../state/state.js";

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
  if (!Array.isArray(world.board) || world.board.length === 0) {
    world.board = generateBoard();
  }
}

export function rerollBoard(world = state.worldState) {
  world.board = generateBoard();
}

/** One-line description of a contract. */
export function describe(m) {
  return DESCRIBE[m.type](m);
}

export function acceptContract(index, profile = state.profile, world = state.worldState) {
  ensureBoard(world);
  const offer = world.board[index];
  if (!offer) return undefined;
  profile.mission = { ...offer };
  rerollBoard(world);
  return "Contract accepted. Launch when ready.";
}

export function abandonContract(profile = state.profile) {
  profile.mission = null;
}

export function completeContract(profile = state.profile) {
  const m = profile.mission;
  if (!m) return undefined;
  profile.cr += m.r;
  profile.done++;
  profile.mission = null;
  return `Paid ${m.r} cr.`;
}

function progress(type, matches = () => true, player = undefined) {
  const prof = player !== undefined ? profileOf(player) : state.profile;
  const m = prof && prof.mission;
  if (m && m.type === type && matches(m)) m.p = Math.min(m.n, m.p + 1);
}

on("mined", ({ item, player } = {}) => progress("mine", m => m.o === item, player));
// A hunt contract counts only the enemy it named (old saves named none: any kill counts).
on("enemy-killed", ({ def, player } = {}) => progress("hunt", m => !m.e || m.e === def, player));
on("pickup", ({ player } = {}) => progress("salvage", () => true, player));
