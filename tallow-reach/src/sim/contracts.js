// STEP 9 LOCAL-ONLY: board, contract progress and rewards belong to state.profile.
// Contracts: the offer board at the outpost and progress tracking while flying.
// Progress is driven entirely by events, so new contract types only need
// a generator in data/contracts.js and a listener here.

import { R } from "../util/math.js";
import { random } from "../util/rng.js";
import { on } from "../util/events.js";
import { CONTRACT, CONTRACT_TYPES, CONTRACTS_PER_BOARD, DESCRIBE } from "../data/contracts.js";
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
export function ensureBoard() {
  if (state.ui.board.length === 0) state.ui.board = generateBoard();
}

export function rerollBoard() {
  state.ui.board = generateBoard();
}

/** One-line description of a contract. */
export function describe(m) {
  return DESCRIBE[m.type](m);
}

export function acceptContract(index) {
  state.profile.mission = state.ui.board[index];
  rerollBoard();
  return "Contract accepted. Launch when ready.";
}

export function abandonContract() {
  state.profile.mission = null;
}

export function completeContract() {
  const p = state.profile,
    m = p.mission;
  p.cr += m.r;
  p.done++;
  p.mission = null;
  return `Paid ${m.r} cr.`;
}

function progress(type, matches = () => true) {
  const m = state.profile.mission;
  if (m && m.type === type && matches(m)) m.p = Math.min(m.n, m.p + 1);
}

on("mined", ({ item }) => progress("mine", m => m.o === item));
// A hunt contract counts only the enemy it named (old saves named none: any kill counts).
on("enemy-killed", ({ def } = {}) => progress("hunt", m => !m.e || m.e === def));
on("pickup", () => progress("salvage"));
