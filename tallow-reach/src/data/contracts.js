// Contract templates. Each generator takes a threat tier (1-3) and a random
// number source `rnd()` returning values in [0, 1), and returns the size and reward.
//   mine     bring back ore of one type      (type "mine")
//   hunt     destroy pirate raiders          (type "hunt")
//   salvage  recover derelict crates         (type "salvage")
//
// To add a contract type, add its name to CONTRACT_TYPES, a generator to CONTRACT,
// and a one-line description to DESCRIBE. Progress tracking is a listener in
// sim/contracts.js. The offer board and the save loader read CONTRACT_TYPES,
// so nothing else needs the list.

import { ITEM } from "./items.js";

export const CONTRACT_TYPES = ["mine", "hunt", "salvage"];
export const MINE_ORES = ["ferrite", "cobalt", "voidite"];

export const CONTRACT = {
  mine: (tier, rnd) => {
    const ore = MINE_ORES[Math.floor(rnd() * MINE_ORES.length)];
    const n = 8 * tier + Math.floor(rnd() * 8);
    return { o: ore, n, r: Math.round(n * ITEM[ore].v * 1.9 + 120 * tier) };
  },
  hunt: tier => {
    const n = 2 + tier * 2;
    return { n, r: n * 190 + 100 * tier };
  },
  salvage: tier => {
    const n = 3 * tier;
    return { n, r: n * 130 + 100 * tier };
  },
};

/** One-line text for a contract `m` (as returned by a generator, plus its type). */
export const DESCRIBE = {
  mine: m => `Mine ${m.n} ${ITEM[m.o].n}`,
  hunt: m => `Destroy ${m.n} pirate raiders`,
  salvage: m => `Recover ${m.n} derelict crates`,
};

export const CONTRACTS_PER_BOARD = 4;
