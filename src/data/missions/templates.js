// Mission templates: ready-made, correct-by-construction pieces. An author fills
// in names, places, items and words; the template supplies the situation rules
// (station or radio, docked or flying, safe spawn distance, resource gating).
//
// Everything here returns plain data in the existing step vocabulary, so the
// runner in sim/missions.js needs no special knowledge of templates, and
// validate.js lints the result like any other mission. Raw `script` steps are
// still allowed for anything a template does not cover, but they get no help.
//
//   briefing(...)   face-to-face dialogue at a station (needs docking)
//   radio(...)      a radio message that works while flying (never needs a dock)
//   travelTo(...)   fly into a pocket
//   loadCargo(...)  take an item aboard at the dock; waits for room in the hold
//   handOver(...)   give an item up at a pocket; waits until it is really aboard
//   ambush(...)     a hostile wave that arrives from a distance after the pilot
//                   is already flying in the place, then waits for it to clear
//   mineOre(...)    mine N of an ore; the station hand-in takes it at the end
//   mission(...)    wraps steps with flow filled in (every step names its `next`)
//
// See docs/MISSION_RULES.md for the rules these encode.

import { MISSION_RULES } from "./rules.js";

const base = (id, kind, fields) => ({ id, kind, ...fields });

/** Face to face at a station: needs the pilot docked, for this line only. */
export const briefing = ({ id, speaker, portrait, lines, objective, choices, next }) =>
  base(id, "dialogue", { requiresDock: true, speaker, portrait, lines, objective, ...(choices ? { choices } : {}), ...(next ? { next } : {}) });

/** A radio message: works in flight, never needs a dock. */
export const radio = ({ id, speaker, portrait, lines, objective, choices, next }) =>
  base(id, "dialogue", { requiresDock: false, speaker, portrait, lines, objective, ...(choices ? { choices } : {}), ...(next ? { next } : {}) });

export const travelTo = ({ id, place, objective, next }) =>
  base(id, "reach-sector", { place, objective, ...(next ? { next } : {}) });

/** Load cargo at the dock. A full hold makes this wait; nothing is lost. */
export const loadCargo = ({ id, place, item, count = 1, objective, next }) =>
  base(id, "script", {
    place, requiresDock: true, objective,
    action: { kind: "give-item", item, count, target: "ship" },
    ...(next ? { next } : {}),
  });

/** Hand an item over in a pocket. Waits until the item is really in the hold. */
export const handOver = ({ id, place, item, count = 1, objective, next }) =>
  base(id, "script", {
    place, requiresFlying: true, objective,
    action: { kind: "take-item", item, count, target: "ship" },
    ...(next ? { next } : {}),
  });

/** A wave that arrives from a distance once the pilot is flying in `place`. */
export const ambush = ({
  id, place, enemy = "raider", count = 2, spawnDist = [800, 1000], dropOnDefeat, objective, next,
}) => {
  const safe = spawnDist[0] >= MISSION_RULES.minSpawnDistance ? spawnDist : [MISSION_RULES.minSpawnDistance, MISSION_RULES.minSpawnDistance + 200];
  return [
    base(`${id}-spawn`, "script", {
      place, requiresFlying: true, objective,
      action: { kind: "spawn-wave", place, enemy, count, spawnDist: safe, ...(dropOnDefeat ? { dropOnDefeat } : {}) },
    }),
    base(`${id}-clear`, "wait", { trigger: "wave-clear", count: 1, objective, ...(next ? { next } : {}) }),
  ];
};

export const mineOre = ({ id, item, count, objective, next }) =>
  base(id, "mine", { item, count, objective, ...(next ? { next } : {}) });

/** Fill in `next` for every step that does not jump somewhere itself. */
export function sequence(steps) {
  const flat = steps.flat();
  return flat.map((step, index) => {
    if (step.next !== undefined || step.goto !== undefined || step.kind === "flags") return step;
    if (step.choices?.length && step.choices.every(c => c.next !== undefined || c.goto !== undefined)) return step;
    return { ...step, next: flat[index + 1]?.id ?? MISSION_RULES.endTarget };
  });
}

/** A complete story-kind mission definition. */
export const mission = ({ id, title, steps, credits = 0, fails }) => ({
  id,
  title,
  kind: "story",
  requires: [],
  steps: sequence(steps),
  rewards: { credits },
  fails: fails || {},
});
