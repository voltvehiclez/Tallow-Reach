// Mission linter. Pure data in, a list of problems out: no simulation, no screen.
// Every authored mission (story, template, test) must lint clean; tests/
// mission-lint.test.mjs runs it over all of them, so a new mission is checked
// without anyone writing a new test. The rules are in docs/MISSION_RULES.md.
//
//   lintMission(definition)  -> [{ level: "error" | "warning", step, message }]
//   missionErrors(definition) -> only the errors, as strings
//
// An "error" is something that can leave a player stuck, or break the realism
// rule (a spawn in the pilot's face, an item that can never be found, a step that
// can never be reached). A "warning" is worth a look but does not block.

import { isItem } from "../items.js";
import { ENEMIES } from "../enemies.js";
import { isPocket, placeDef } from "../places.js";
import { MISSION_KINDS, MISSION_STEP_KINDS } from "./index.js";
import { MISSION_RULES } from "./rules.js";

const END = MISSION_RULES.endTarget;
const TARGET_KEYS = ["next", "goto", "then", "else", "ifTrue", "ifFalse"];
const OBJECTIVE_CHILD_KINDS = ["kill", "mine", "collect", "reach", "reach-sector", "survive", "wait"];

const actionsOf = step =>
  Array.isArray(step.actions) ? step.actions : Array.isArray(step.action) ? step.action : step.action ? [step.action] : [];
const kindOf = action => (typeof action === "string" ? action : action?.kind || action?.action || action?.type || "");
const placeOf = step => step.place || step.sector || step.requiresPlace;

/** Every named target a step can jump to, including dialogue choices. */
export function stepTargets(step) {
  const out = [];
  for (const key of TARGET_KEYS) if (step[key] !== undefined) out.push(step[key]);
  for (const choice of step.choices || []) if (choice.next !== undefined || choice.goto !== undefined) out.push(choice.next ?? choice.goto);
  return out;
}

export function lintMission(def) {
  const problems = [];
  const error = (step, message) => problems.push({ level: "error", step: step?.id || "(mission)", message });
  const warn = (step, message) => problems.push({ level: "warning", step: step?.id || "(mission)", message });

  if (!def || typeof def !== "object") return [{ level: "error", step: "(mission)", message: "mission is not an object" }];
  if (typeof def.id !== "string" || !def.id) error(null, "mission needs an id");
  if (typeof def.title !== "string" || !def.title) error(null, "mission needs a title");
  if (!MISSION_KINDS.includes(def.kind)) error(null, `kind "${def.kind}" is not one of ${MISSION_KINDS.join(", ")}`);
  if (!Array.isArray(def.steps) || !def.steps.length) {
    error(null, "mission needs at least one step");
    return problems;
  }
  const reward = def.rewards?.credits;
  if (!(typeof reward === "number" && reward >= 0)) error(null, "rewards.credits must be a number of 0 or more");

  // --- ids ------------------------------------------------------------------
  const ids = new Set();
  for (const step of def.steps) {
    if (typeof step.id !== "string" || !step.id) { error(step, "every step needs an id"); continue; }
    if (ids.has(step.id)) error(step, `duplicate step id "${step.id}"`);
    ids.add(step.id);
    if (step.id === END) error(step, `"${END}" is reserved for the end of the mission`);
  }
  const indexOf = id => def.steps.findIndex(step => step.id === id);

  // --- per step ---------------------------------------------------------------
  def.steps.forEach((step, index) => {
    if (!MISSION_STEP_KINDS.includes(step.kind)) { error(step, `unknown step kind "${step.kind}"`); return; }
    if (typeof step.objective !== "string" || !step.objective.trim()) {
      error(step, "every step needs a player-facing `objective` sentence (it is what tells the player what to do next)");
    }

    // Flow: every step says where it goes, so nothing falls off the end by accident.
    for (const target of stepTargets(step)) {
      if (typeof target !== "string") error(step, `target ${JSON.stringify(target)} must be a step id or "${END}", not a number`);
      else if (target !== END && !ids.has(target)) error(step, `target "${target}" is not a step in this mission`);
    }
    const choicesAllJump = Array.isArray(step.choices) && step.choices.length > 0 && step.choices.every(c => c.next !== undefined || c.goto !== undefined);
    if (step.kind === "flags") {
      if (step.test === undefined) error(step, "a flags step needs a `test`");
      if ((step.then ?? step.ifTrue) === undefined || (step.else ?? step.ifFalse) === undefined) {
        error(step, "a flags step must name both `then` and `else`");
      }
    } else if (step.next === undefined && step.goto === undefined && !choicesAllJump) {
      error(step, `step must say where it goes with \`next\` (use "${END}" for the last step)`);
    }

    // Situation: where and how the player must be, stated, never assumed.
    if (step.kind === "dialogue") {
      if (typeof step.requiresDock !== "boolean") {
        error(step, "a dialogue must say `requiresDock: true` (face to face at a station) or `false` (a radio message)");
      }
      if (!Array.isArray(step.lines) || !step.lines.length || step.lines.some(l => typeof l !== "string" || !l)) {
        error(step, "a dialogue needs at least one non-empty line");
      }
      if (step.choices !== undefined) {
        const seen = new Set();
        for (const choice of step.choices) {
          if (!choice.id || seen.has(choice.id)) error(step, `choice id "${choice.id}" is missing or duplicated`);
          seen.add(choice.id);
          if (!choice.text) error(step, `choice "${choice.id}" needs text`);
          if (choice.next === undefined && choice.goto === undefined) error(step, `choice "${choice.id}" must name where it goes`);
        }
      }
    }
    if (step.kind === "script") {
      if (!placeOf(step)) error(step, "a script step must name the `place` where it runs");
      else if (!isPocket(placeOf(step))) error(step, `place "${placeOf(step)}" is not a pocket`);
      const dock = step.requiresDock === true, fly = step.requiresFlying === true;
      if (dock === fly) error(step, "a script step must say exactly one of `requiresDock: true` or `requiresFlying: true`");
      if (!actionsOf(step).length) error(step, "a script step needs an action");
    }
    for (const place of [step.place, step.sector, step.requiresPlace, step.target].filter(Boolean)) {
      if (place !== "station" && !isPocket(place)) error(step, `place "${place}" is not a pocket`);
    }
    if (step.kind === "deliver") {
      error(step, "`deliver` has no event behind it yet (nothing emits \"delivered\"); use a `take-item` script step at the destination");
    }
    if (step.kind === "reach-sector" || step.kind === "reach") {
      if (!placeOf(step)) error(step, `a ${step.kind} step needs a \`place\``);
    }
    if (step.item && !isItem(step.item)) error(step, `item "${step.item}" is not in the catalogue`);
    if (step.enemy && !ENEMIES[step.enemy]) error(step, `enemy "${step.enemy}" does not exist`);
    if (step.kind === "parallel") {
      const childIds = new Set();
      if (!Array.isArray(step.steps) || !step.steps.length) error(step, "a parallel step needs child steps");
      for (const child of step.steps || []) {
        if (!child.id || childIds.has(child.id)) error(step, `parallel child id "${child.id}" is missing or duplicated`);
        childIds.add(child.id);
        if (!OBJECTIVE_CHILD_KINDS.includes(child.kind)) error(step, `parallel child "${child.id}" must be an objective, not "${child.kind}"`);
      }
    }

    // Actions.
    for (const action of actionsOf(step)) {
      const kind = kindOf(action);
      if (!["spawn-wave", "spawn-ship", "set-sector-state", "give-item", "take-item", "play-sound", "warp-player"].includes(kind)) {
        error(step, `unknown script action "${kind}"`);
        continue;
      }
      if (kind === "spawn-wave" || kind === "spawn-ship") {
        if (step.requiresFlying !== true) error(step, "a spawn must run while the pilot is flying (`requiresFlying: true`), never while docked");
        if (action.place && action.place !== placeOf(step)) error(step, "a spawn action's place must match its step's place");
        if (action.feature || action.anchor) warn(step, "a spawn anchored on a feature can appear next to the pilot; prefer the default (from the pilot) with a spawnDist");
        const range = action.spawnDist;
        if (!Array.isArray(range) || range.length !== 2 || !range.every(Number.isFinite)) {
          error(step, "a spawn must declare `spawnDist: [min, max]` so it appears at a safe distance");
        } else if (range[0] < MISSION_RULES.minSpawnDistance || range[1] < range[0]) {
          error(step, `spawnDist ${JSON.stringify(range)} is too close: the minimum is ${MISSION_RULES.minSpawnDistance}`);
        }
        if (action.enemy && !ENEMIES[action.enemy]) error(step, `enemy "${action.enemy}" does not exist`);
        if (action.dropOnDefeat?.item && !isItem(action.dropOnDefeat.item)) error(step, `drop "${action.dropOnDefeat.item}" is not in the catalogue`);
      }
      if ((kind === "give-item" || kind === "take-item") && !isItem(action.item)) error(step, `item "${action.item}" is not in the catalogue`);
      if (kind === "give-item" && action.target !== "station" && step.requiresDock !== true) {
        warn(step, "giving an item to the ship is normally a dock-side loading step (`requiresDock: true`)");
      }
    }
  });

  // --- flow: reachability and no dead ends -----------------------------------
  const edges = index => {
    const step = def.steps[index];
    const out = [];
    const named = stepTargets(step).filter(t => typeof t === "string");
    for (const t of named) out.push(t === END ? def.steps.length : indexOf(t));
    if (!named.length) out.push(index + 1);
    return out.filter(n => n >= 0);
  };
  const reach = new Set([0]);
  const todo = [0];
  while (todo.length) {
    const i = todo.pop();
    if (i >= def.steps.length) continue;
    for (const n of edges(i)) if (!reach.has(n)) { reach.add(n); todo.push(n); }
  }
  def.steps.forEach((step, i) => { if (!reach.has(i)) error(step, "step can never be reached"); });
  if (!reach.has(def.steps.length)) error(null, "no path leads to the end of the mission");
  // Every reachable step must be able to reach the end (no loops with no way out).
  const canEnd = new Set([def.steps.length]);
  for (let pass = 0; pass < def.steps.length + 1; pass++) {
    def.steps.forEach((step, i) => { if (!canEnd.has(i) && edges(i).some(n => canEnd.has(n))) canEnd.add(i); });
  }
  def.steps.forEach((step, i) => { if (reach.has(i) && !canEnd.has(i)) error(step, "step can never reach the end of the mission (dead end or loop)"); });

  // --- player-facing wording -----------------------------------------------------
  // Guidance says what the pilot must still DO. It must never claim the work is
  // finished: a mission that hands items in is only accomplished when the station
  // hand-in takes them (LESSONS L15). A contract also never calls itself a mission.
  const COMPLETION_CLAIM = /\b(complete|completed|completing|accomplished|finished)\b/i;
  const guidance = [];
  const collectGuidance = step => {
    if (typeof step?.objective === "string") guidance.push(step);
    for (const child of step?.steps || []) collectGuidance(child);
  };
  def.steps.forEach(collectGuidance);
  if (typeof def.handIn?.objective === "string" && def.handIn.objective.trim()) guidance.push(null);
  for (const step of guidance) {
    const text = step?.objective ?? def.handIn.objective;
    if (COMPLETION_CLAIM.test(text)) {
      error(step, `guidance must not claim completion ("${text}"): a mission is only accomplished when its reward is handed in at a station, so say what is still owed`);
    }
    if (def.kind === "contract" && /\bmission\b/i.test(text)) {
      error(step, `a contract must call itself a contract, never a mission ("${text}")`);
    }
  }

  // A mission whose objectives collect or mine an item is not accomplished until
  // that item is handed in, so its data must say what the HUD shows meanwhile.
  const handInSteps = [];
  const visitHandIn = step => {
    if (step?.item && ["collect", "mine", "deliver"].includes(step.kind)) handInSteps.push(step);
    for (const child of step?.steps || []) visitHandIn(child);
  };
  def.steps.forEach(visitHandIn);
  if (handInSteps.length && !(typeof def.handIn?.objective === "string" && def.handIn.objective.trim())) {
    error(handInSteps[0], `this mission hands in ${handInSteps.map(step => `"${step.item}"`).join(", ")}, so it needs a \`handIn.objective\` sentence: the guidance shown after the last step while the cargo is still owed`);
  }
  // --- the hand-in station -------------------------------------------------------
  // Every mission is handed in at exactly one station (docs/MISSION_RULES.md). A
  // mission that sends the pilot somewhere specific names it with
  // `handIn.station`; otherwise it is the station that gave the mission out, so
  // authored data normally leaves the field out.
  if (def.handIn !== undefined) {
    if (typeof def.handIn !== "object" || def.handIn === null || Array.isArray(def.handIn)) {
      error(null, "`handIn` must be an object with an `objective` sentence");
    } else {
      for (const key of Object.keys(def.handIn)) {
        if (key !== "objective" && key !== "station") {
          warn(null, `unknown \`handIn.${key}\`: the runner reads only \`objective\` and \`station\``);
        }
      }
      let stationName = "";
      if (def.handIn.station !== undefined) {
        if (!isPocket(def.handIn.station)) error(null, `handIn.station "${def.handIn.station}" is not a pocket`);
        else {
          const feature = placeDef(def.handIn.station).features.find(f => f.kind === "station");
          if (!feature) error(null, `handIn.station "${def.handIn.station}" has no station, so nothing can be handed in there`);
          else stationName = String(feature.n || "");
        }
      }
      const objective = typeof def.handIn.objective === "string" ? def.handIn.objective : "";
      if (objective && !objective.includes("{station}") && !(stationName && objective.includes(stationName))) {
        warn(null, "handIn.objective should use `{station}` (the runner fills in the station) so the sentence always names where the hand-in is");
      }
    }
  }

  // --- where the mission is offered ----------------------------------------------
  // Story work is offered at one station's counter. `offeredAt` names it; leave it
  // out and the mission is offered wherever its hand-in is, else at the home
  // station. The field only decides where the log lists it, but a typo would
  // silently move a mission, so it is checked like the hand-in station.
  if (def.offeredAt !== undefined) {
    if (typeof def.offeredAt !== "string" || !isPocket(def.offeredAt)) {
      error(null, `\`offeredAt\` ${JSON.stringify(def.offeredAt)} is not a pocket, so no station offers this mission`);
    } else if (!placeDef(def.offeredAt).features.some(f => f.kind === "station")) {
      error(null, `\`offeredAt\` "${def.offeredAt}" has no station, so nothing offers this mission`);
    }
  }

  // --- sources: nothing may wait for something that can never exist -------------
  // Walk the steps in order; a later step may rely on an earlier source only.
  const drops = new Set(), gives = new Set(), spawnedWave = new Set();
  const flagsSet = new Set();
  const checkStep = step => {
    for (const action of actionsOf(step)) {
      const kind = kindOf(action);
      if (kind === "spawn-wave" || kind === "spawn-ship") {
        spawnedWave.add(placeOf(step) || "*");
        if (action.dropOnDefeat?.item) drops.add(action.dropOnDefeat.item);
      }
      if (kind === "give-item") gives.add(action.item);
    }
    for (const choice of step.choices || []) for (const key of Object.keys(choice.set || choice.flags || {})) flagsSet.add(key);
    for (const key of Object.keys(step.set || {})) flagsSet.add(key);
  };
  def.steps.forEach(step => {
    if (step.kind === "collect" && step.missionItem === true && !drops.has(step.item)) {
      error(step, `the mission item "${step.item}" is collected here, but no earlier spawn drops it (dropOnDefeat), so it can never exist`);
    }
    if (step.kind === "wait" && step.trigger === "wave-clear" && !spawnedWave.size) {
      error(step, "waits for `wave-clear`, but no earlier step spawns a wave");
    }
    for (const action of actionsOf(step)) {
      if (kindOf(action) === "take-item" && !gives.has(action.item) && !drops.has(action.item)) {
        error(step, `takes "${action.item}", but no earlier step gives or drops it`);
      }
    }
    if (step.kind === "flags" && step.test && typeof step.test === "object" && !Array.isArray(step.test)) {
      for (const key of Object.keys(step.test)) if (!flagsSet.has(key)) warn(step, `tests flag "${key}", which no earlier step sets`);
    }
    if (step.kind === "parallel") for (const child of step.steps || []) checkStep(child);
    checkStep(step);
  });

  // --- failure ---------------------------------------------------------------
  const fails = def.fails;
  if (fails && typeof fails === "object") {
    for (const reason of Array.isArray(fails.on) ? fails.on : []) {
      if (!MISSION_RULES.failReasons.includes(reason)) error(null, `failure reason "${reason}" is not allowed`);
    }
    if ((fails.on?.length || fails.action === "abandon") && !fails.message) {
      error(null, "a mission that can fail must carry a `fails.message` telling the player why");
    }
  }
  // Dying does not fail a mission unless the mission says so (`fails.on` has "player-dead").
  // The one exception needs no declaration: a mission-only item (a parcel, a beacon) is lost with
  // the hold and cannot be found again, so `sim/missions.js` fails the mission itself, with a
  // message, when the ship is destroyed while carrying one.
  if (def.timeout > 0) warn(null, "a timeout fails the mission silently unless the player can see the clock");

  return problems;
}

export const missionErrors = def => lintMission(def).filter(p => p.level === "error").map(p => `${def?.id}: ${p.step}: ${p.message}`);
