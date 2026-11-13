// The first mission definitions: today's three contracts expressed as data.
// The generator keeps the old contract numbers and wording; missionFromContract
// gives the runner a complete mission record without importing simulation code.

import { itemName, itemValue } from "../items.js";
import { DEFAULT_ENEMY, enemyDef } from "../enemies.js";
import { CONTRACT_OBJECTIVE_KINDS } from "./index.js";

export const CONTRACT_TYPES = ["mine", "hunt", "salvage"];
export const MINE_ORES = ["ferrite", "cobalt", "voidite"];

export const CONTRACT = {
  mine: (tier, rnd) => {
    const ore = MINE_ORES[Math.floor(rnd() * MINE_ORES.length)];
    const n = 8 * tier + Math.floor(rnd() * 8);
    return { o: ore, n, r: Math.round(n * itemValue(ore) * 1.9 + 120 * tier) };
  },
  hunt: tier => {
    const n = 2 + tier * 2;
    return { e: DEFAULT_ENEMY, n, r: n * 190 + 100 * tier };
  },
  salvage: tier => {
    const n = 3 * tier;
    return { n, r: n * 130 + 100 * tier };
  },
};

export const DESCRIBE = {
  mine: m => `Mine ${m.n} ${itemName(m.o)}`,
  hunt: m => `Destroy ${m.n} ${enemyDef(m.e).pl}`,
  salvage: m => `Recover ${m.n} derelict crates`,
};

export const CONTRACTS_PER_BOARD = 4;

export const CONTRACT_MISSION_TEMPLATES = {
  mine: {
    id: "contract.mine",
    title: "Mining contract",
    kind: "contract",
    requires: [],
    steps: [{ id: "objective", kind: "mine", objective: "Mine {remaining} {item}." }],
    rewards: { credits: "$reward" },
    fails: { abandon: "abandoned" },
  },
  hunt: {
    id: "contract.hunt",
    title: "Hunt contract",
    kind: "contract",
    requires: [],
    steps: [{ id: "objective", kind: "kill", objective: "Destroy {remaining} {enemy}." }],
    rewards: { credits: "$reward" },
    fails: { abandon: "abandoned" },
  },
  salvage: {
    id: "contract.salvage",
    title: "Salvage contract",
    kind: "contract",
    requires: [],
    steps: [{ id: "objective", kind: "collect", item: "salv", objective: "Recover {remaining} derelict crates." }],
    rewards: { credits: "$reward" },
    fails: { abandon: "abandoned" },
  },
};

const clone = value => JSON.parse(JSON.stringify(value));

/**
 * Turn the old compact offer into the data shape consumed by the mission
 * runner. `id` is supplied when an offer becomes active so several copies of a
 * contract type can be active without sharing progress.
 */
export function missionFromContract(contract, id = `contract:${contract?.type || "unknown"}`) {
  const type = CONTRACT_TYPES.includes(contract?.type) ? contract.type : null;
  if (!type) return null;
  const template = CONTRACT_MISSION_TEMPLATES[type];
  const tier = Math.max(1, Math.floor(+contract.tier || 1));
  const n = Math.max(1, Math.floor(+contract.n || 1));
  const r = Math.max(0, Math.floor(+contract.r || 0));
  const p = Math.max(0, Math.min(n, Math.floor(+contract.p || 0)));
  const step = clone(template.steps[0]);
  step.count = n;
  if (type === "mine") step.item = contract.o;
  if (type === "salvage") step.item = "salv";
  if (type === "hunt") {
    // Generated offers name the current enemy. Pre-step-1 saves omitted `e`,
    // which deliberately meant that any hostile counted, so preserve that
    // distinction instead of filling it in here.
    if (contract.e !== undefined) step.enemy = contract.e;
    if (contract.faction) step.faction = contract.faction;
  }

  return {
    id,
    title: DESCRIBE[type]({ ...contract, tier, n, r, p, e: contract.e || DEFAULT_ENEMY }),
    kind: template.kind,
    requires: clone(template.requires),
    steps: [step],
    rewards: { credits: r },
    fails: clone(template.fails),
    step: p >= n ? 1 : 0,
    current: p >= n ? 1 : 0,
    counters: { objective: p },
    // Compatibility fields stay on the mission so old systems and exported
    // saves can still identify a contract without knowing its step schema.
    type,
    tier,
    n,
    p,
    r,
    ...(type === "mine" ? { o: contract.o } : {}),
    ...(type === "hunt" && contract.e !== undefined ? { e: contract.e } : {}),
    ...(contract.faction ? { faction: contract.faction } : {}),
  };
}

/** The legacy one-line wording for either an offer or a mission record. */
export function describeMission(mission) {
  if (!mission) return "";
  if (typeof mission.title === "string" && mission.steps) return mission.title;
  return DESCRIBE[mission.type]?.(mission) || String(mission.title || mission.id || "Mission");
}

/** The objective kind for one of the three contract types. */
export const contractObjectiveKind = type => CONTRACT_OBJECTIVE_KINDS[type] || null;
