// Data-driven mission runner (Steps 13a and 13b). Contracts are the first
// mission kind; the same runner also handles story dialogue, scripts, waits,
// remembered flags, branches and parallel objectives.

import { on, emit } from "../util/events.js";
import { missionFromContract, describeMission } from "../data/missions/contracts.js";
import { itemName } from "../data/items.js";
import { enemyDef } from "../data/enemies.js";
import { placeAt } from "../data/places.js";
import { state, profileOf } from "../state/state.js";
import { STATION, addItem, countOf, hasRoomFor, takeItem } from "./inventory.js";
import { enterPlace, arrivalPos } from "./places.js";

let nextMissionId = 0;

function missionsOf(profile = state.profile) {
  if (!profile) return [];
  if (!Array.isArray(profile.missions)) {
    // Plain test/legacy profiles may still carry only the old property. The
    // real save profile has a compatibility setter, but this keeps the runner
    // useful with a minimal object made by a headless test.
    if (profile.mission) {
      const mission = missionFromContract(profile.mission, `contract:legacy:${++nextMissionId}`);
      profile.missions = mission ? [mission] : [];
    } else profile.missions = [];
  }
  if (!profile.flags || typeof profile.flags !== "object" || Array.isArray(profile.flags)) profile.flags = {};
  return profile.missions;
}

function profileFor(payload = {}, fallback = state.profile) {
  return payload.profile || profileOf(payload.player) || fallback;
}

export const activeMissions = (profile = state.profile) => missionsOf(profile);

export function missionDescription(mission) {
  return describeMission(mission);
}

export function missionStep(mission) {
  if (!mission || !Array.isArray(mission.steps) || mission.step >= mission.steps.length) return null;
  return mission.steps[mission.step];
}

export function isMissionFailed(mission) {
  return !!mission?.failed;
}

export function isMissionComplete(mission) {
  return !!mission && !mission.failed && (mission.completed === true || mission.step >= (mission.steps?.length || 0));
}

function stepCount(step) {
  if (!step) return 1;
  if (step.kind === "dialogue") return Math.max(1, Array.isArray(step.lines) ? step.lines.length : 1);
  if (step.kind === "parallel") return Math.max(1, (step.steps || []).reduce((n, child) => n + stepCount(child), 0));
  const count = Number(step.count ?? step.seconds ?? 1);
  return Number.isFinite(count) && count > 0 ? count : 1;
}

function parallelKey(step, child) {
  return `${step.id}.${child.id}`;
}

function counterValue(mission, id) {
  return Math.max(0, Number(mission.counters?.[id]) || 0);
}

export function missionProgress(mission) {
  if (!mission || !Array.isArray(mission.steps) || !mission.steps.length) return { done: 0, total: 0 };
  const index = Math.min(Math.max(0, mission.step), mission.steps.length - 1);
  const step = mission.steps[index];
  if (step.kind === "parallel") {
    const total = (step.steps || []).reduce((n, child) => n + stepCount(child), 0);
    const done = (step.steps || []).reduce((n, child) => n + Math.min(stepCount(child), counterValue(mission, parallelKey(step, child))), 0);
    return { done, total, step, index };
  }
  const total = stepCount(step);
  const done = isMissionComplete(mission) ? total : Math.min(total, counterValue(mission, step.id));
  return { done, total, step, index };
}

export function remainingObjective(mission) {
  const progress = missionProgress(mission);
  return Math.max(0, progress.total - progress.done);
}

/** Generic mission-log guidance. Story-specific wording can be supplied by a
 * data step's optional `log` field; the fallback only describes the vocabulary
 * of the current step and never names a story or hard-codes its dialogue. */
export function missionNextText(mission) {
  if (!mission) return "No mission selected.";
  if (isMissionFailed(mission)) return mission.failureMessage || "Mission failed.";
  if (isMissionComplete(mission)) return "Mission complete. Return to a station to collect the reward.";
  const step = missionStep(mission);
  if (!step) return "No current objective.";
  if (typeof step.log === "string" && step.log) return step.log;
  const progress = missionProgress(mission);
  const left = Math.max(0, progress.total - progress.done);
  const target = step.place || step.sector || step.target;
  const placeName = target ? placeAt(target)?.n || target : "the target area";
  switch (step.kind) {
    case "dialogue":
      return missionDialogue(mission)?.waitingForChoice ? "Choose a response." : "Continue the conversation.";
    case "kill":
      return `Destroy ${left} ${enemyDef(step.enemy).pl || "hostiles"}.`;
    case "mine":
      return `Mine ${left} ${itemName(step.item)}.`;
    case "collect":
      return `Collect ${left} ${itemName(step.item)}.`;
    case "reach":
    case "reach-sector":
      return `Reach ${placeName}.`;
    case "deliver":
      return `Deliver ${left} ${itemName(step.item)}${target ? ` to ${placeName}` : ""}.`;
    case "survive":
      return `Survive for ${Math.ceil(left)} seconds.`;
    case "wait":
      return step.trigger && step.trigger !== "timer" ? `Wait for ${step.trigger}.` : `Wait ${Math.ceil(left)} seconds.`;
    case "parallel":
      return `Complete all ${(step.steps || []).length} objectives.`;
    case "script":
    case "flags":
      return "Follow the mission instruction.";
    default:
      return `Complete the ${step.kind} objective.`;
  }
}

export function missionForObjective(profile, kind) {
  return missionsOf(profile).find(mission =>
    !isMissionComplete(mission) && !isMissionFailed(mission) && missionStep(mission)?.kind === kind
  ) || null;
}

function freshId(type) {
  nextMissionId += 1;
  return `contract:${type}:${nextMissionId}`;
}

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

/** Make an active mission from a compact board offer. */
export function instantiateMission(offer) {
  return missionFromContract(offer, freshId(offer?.type));
}

/** Clone a data-only story definition into the saved runtime shape. */
export function instantiateStoryMission(definition, id = definition?.id) {
  if (!definition || definition.kind !== "story" || !Array.isArray(definition.steps) || !definition.steps.length) return null;
  const mission = cloneData(definition);
  mission.id = id || `story:${++nextMissionId}`;
  mission.step = 0;
  mission.current = 0;
  mission.counters = {};
  mission.elapsed = 0;
  delete mission.completed;
  delete mission.failed;
  return mission;
}

function ensureCounters(mission) {
  if (!mission.counters || typeof mission.counters !== "object" || Array.isArray(mission.counters)) mission.counters = {};
  for (const step of mission.steps || []) {
    if (step.kind === "parallel") {
      for (const child of step.steps || []) {
        const id = parallelKey(step, child), value = Number(mission.counters[id]);
        mission.counters[id] = Number.isFinite(value) && value >= 0 ? Math.min(stepCount(child), value) : 0;
      }
      continue;
    }
    const value = Number(mission.counters[step.id]);
    mission.counters[step.id] = Number.isFinite(value) && value >= 0 ? Math.min(stepCount(step), value) : 0;
  }
}

function stepIndex(mission, target) {
  if (target === undefined || target === null || target === "") return null;
  if (typeof target === "number" || /^\d+$/.test(String(target))) {
    const index = Math.floor(+target);
    return index >= 0 && index <= mission.steps.length ? index : null;
  }
  const index = mission.steps.findIndex(step => step.id === target);
  return index >= 0 ? index : null;
}

function nextStepIndex(mission, step, fallback = mission.step + 1) {
  const target = step?.next ?? step?.goto;
  if (target !== undefined) return stepIndex(mission, target);
  return fallback;
}

function applyFlags(profile, values) {
  if (!values || typeof values !== "object" || Array.isArray(values)) return false;
  if (!profile.flags || typeof profile.flags !== "object" || Array.isArray(profile.flags)) profile.flags = {};
  let changed = false;
  for (const [id, value] of Object.entries(values)) {
    if (!id || profile.flags[id] !== value) {
      profile.flags[id] = value;
      changed = true;
    }
  }
  return changed;
}

function flagsMatch(flags, test) {
  if (test === undefined || test === null) return true;
  if (typeof test === "string") return !!flags?.[test];
  if (Array.isArray(test)) return test.every(id => !!flags?.[id]);
  if (typeof test !== "object") return false;
  return Object.entries(test).every(([id, expected]) => flags?.[id] === expected);
}

function emitProgress(mission, event, payload = {}) {
  emit("mission-progress", { mission, event, payload, player: payload.player });
}

function markComplete(mission, payload = {}) {
  if (mission.completed) return false;
  mission.completed = true;
  mission.current = mission.steps.length;
  emit("mission-completed", { mission, player: payload.player });
  return true;
}

function moveToStep(mission, target, payload = {}) {
  const index = target;
  if (!Number.isInteger(index) || index < 0 || index > mission.steps.length) return false;
  mission.step = index;
  mission.current = index;
  mission.p = 0;
  if (index >= mission.steps.length) markComplete(mission, payload);
  return true;
}

function scriptKind(action) {
  if (typeof action === "string") return action;
  return action?.kind || action?.action || action?.type || "";
}

function scriptActions(step) {
  if (Array.isArray(step?.actions)) return step.actions;
  if (Array.isArray(step?.action)) return step.action;
  return step?.action ? [step.action] : [];
}

function placeState(place) {
  const world = state.worldState;
  if (!world.missionState || typeof world.missionState !== "object" || Array.isArray(world.missionState)) {
    world.missionState = {};
  }
  if (!world.missionState[place] || typeof world.missionState[place] !== "object" || Array.isArray(world.missionState[place])) {
    world.missionState[place] = {};
  }
  return world.missionState[place];
}

function executeScriptAction(action, mission, profile, payload = {}) {
  const kind = scriptKind(action);
  if (!kind) return false;
  const player = payload.player || (profile === state.profile ? state.player : null);
  const place = action.place || action.sector || player?.place || state.place;
  const count = Math.max(1, Math.floor(+action.count || 1));
  if (kind === "give-item" || kind === "take-item") {
    const item = action.item;
    const where = action.target === "station" ? STATION : profile.ship;
    const changed = kind === "give-item"
      ? addItem(where, item, count, profile, state.worldState)
      : takeItem(where, item, count, profile, state.worldState);
    emit(kind === "give-item" ? "mission-item-given" : "mission-item-taken", {
      mission, item, count: changed, target: action.target || "ship", player,
    });
    // A script must not silently move on when an item could not be transferred.
    // In particular, a full ship hold used to let a story hand-out disappear
    // while the dialogue advanced as if the player had received it.
    return changed >= count;
  }
  if (kind === "set-sector-state") {
    const values = action.set || action.state || (action.key ? { [action.key]: action.value } : {});
    Object.assign(placeState(place), values);
    emit("mission-sector-state", { mission, place, state: placeState(place), player });
    return true;
  }
  if (kind === "play-sound") {
    const name = action.name || action.sound;
    if (name) emit("sfx", { name, ...(action.args && typeof action.args === "object" ? action.args : {}) });
    return !!name;
  }
  if (kind === "warp-player") {
    const target = action.to || action.place || action.sector;
    if (!target || !player || !enterPlace(target, player)) return false;
    if (player.pos) player.pos.copy(arrivalPos(target));
    emit("mission-warp", { mission, from: place, to: target, player });
    return true;
  }
  // Spawn actions are handled by the simulation adapter in sim/ai.js. Keeping
  // them as an event means mission data does not import an enemy system.
  if (kind === "spawn-wave" || kind === "spawn-ship") {
    emit("mission-script", { mission, action: { ...action, kind }, place, player, profile });
    return true;
  }
  return false;
}

function scriptActionReady(action, profile) {
  const kind = scriptKind(action);
  if (kind !== "give-item" && kind !== "take-item") return true;
  const item = action.item;
  const count = Math.max(1, Math.floor(+action.count || 1));
  const where = action.target === "station" ? STATION : profile.ship;
  return kind === "give-item"
    ? hasRoomFor(where, item, count, profile, state.worldState)
    : countOf(where, item, profile, state.worldState) >= count;
}

function executeScriptStep(step, mission, profile, payload = {}) {
  const actions = scriptActions(step);
  if (!actions.length) return true;
  if (!actions.every(action => scriptActionReady(action, profile))) return false;
  return actions.every(action => executeScriptAction(action, mission, profile, payload));
}

/** Count a reach objective immediately when a later step starts in its target
 * place. This matters for scripted sequences such as "fight, then search":
 * entering the place before the fight still satisfies the reach half. */
function primeReachStep(mission, payload = {}) {
  const place = payload.player?.place || payload.place || payload.id;
  if (!place) return false;
  ensureCounters(mission);
  const matches = step => {
    if (!step || (step.kind !== "reach" && step.kind !== "reach-sector")) return false;
    const target = step.place || step.sector || step.target;
    return !!target && target === place;
  };
  const step = missionStep(mission);
  if (matches(step)) {
    const total = stepCount(step);
    mission.counters[step.id] = total;
    mission.p = total;
    moveToStep(mission, nextStepIndex(mission, step), payload);
    return true;
  }
  if (step?.kind !== "parallel") return false;
  let changed = false;
  for (const child of step.steps || []) {
    if (!matches(child)) continue;
    const id = parallelKey(step, child), total = stepCount(child);
    if (counterValue(mission, id) < total) {
      mission.counters[id] = total;
      changed = true;
    }
  }
  if (!changed) return false;
  mission.p = (step.steps || []).filter(child => counterValue(mission, parallelKey(step, child)) >= stepCount(child)).length;
  if ((step.steps || []).every(child => counterValue(mission, parallelKey(step, child)) >= stepCount(child))) {
    moveToStep(mission, nextStepIndex(mission, step), payload);
  }
  return true;
}

/** Run zero-length story steps immediately after a mission starts or advances. */
function activateAutomatic(mission, profile, payload = {}) {
  let changed = false;
  for (let guard = 0; guard < 100 && !isMissionComplete(mission) && !isMissionFailed(mission); guard++) {
    const step = missionStep(mission);
    if (!step) break;
    if (primeReachStep(mission, payload)) {
      changed = true;
      continue;
    }
    if (step.kind === "script") {
      if (!executeScriptStep(step, mission, profile, payload)) break;
      changed = true;
      moveToStep(mission, nextStepIndex(mission, step), payload);
      continue;
    }
    if (step.kind === "flags") {
      applyFlags(profile, step.set);
      const pass = flagsMatch(profile.flags, step.test);
      const target = pass ? (step.then ?? step.ifTrue ?? step.next) : (step.else ?? step.ifFalse);
      const moved = moveToStep(mission, target === undefined ? mission.step + 1 : stepIndex(mission, target), payload);
      changed = moved || changed;
      if (!moved) break;
      continue;
    }
    break;
  }
  return changed;
}

function objectiveMatches(step, event, payload = {}) {
  if (!step) return false;
  if (step.kind === "kill") {
    return (!step.enemy || step.enemy === payload.def) && (!step.faction || step.faction === payload.faction);
  }
  if (step.kind === "mine") return !step.item || step.item === payload.item;
  if (step.kind === "collect") return !step.item || step.item === payload.item;
  if (step.kind === "reach" || step.kind === "reach-sector") {
    const target = step.place || step.sector || step.target;
    return !target || target === payload.id || target === payload.place;
  }
  if (step.kind === "deliver") {
    const target = step.target || step.place;
    return (!target || target === payload.target || target === payload.place) &&
      (!step.item || step.item === payload.item);
  }
  if (step.kind === "wait") {
    if (event === "mission-trigger") return !step.trigger || step.trigger === payload.trigger || step.trigger === payload.id;
    if (event === "place-entered") {
      const target = step.place || step.sector || step.target;
      return !!target && target === (payload.id || payload.place);
    }
    return event === "mission-tick" && (step.timer === true || step.trigger === "timer" || step.seconds !== undefined);
  }
  return event === "mission-tick" && step.kind === "survive";
}

function advanceDialogue(mission, step, event, payload, profile) {
  const lines = Array.isArray(step.lines) ? step.lines : step.lines == null ? [] : [String(step.lines)];
  const current = counterValue(mission, step.id);
  if (event === "dialogue-choice") {
    if (current < Math.max(0, lines.length - 1)) return false;
    const choiceId = typeof payload.choice === "object" ? payload.choice.id : payload.choice;
    const choice = (step.choices || []).find(item => item.id === choiceId);
    if (!choice) return false;
    applyFlags(profile, choice.set || choice.flags);
    const target = choice.next ?? choice.goto;
    moveToStep(mission, target === undefined ? mission.step + 1 : stepIndex(mission, target), payload);
    activateAutomatic(mission, profile, payload);
    return true;
  }
  if (event !== "dialogue-next") return false;
  if (current + 1 < lines.length) {
    mission.counters[step.id] = current + 1;
    mission.p = current + 1;
    return true;
  }
  moveToStep(mission, nextStepIndex(mission, step), payload);
  activateAutomatic(mission, profile, payload);
  return true;
}

function advanceParallel(mission, step, event, payload) {
  let changed = false;
  for (const child of step.steps || []) {
    const id = parallelKey(step, child), total = stepCount(child), before = counterValue(mission, id);
    if (before >= total || !objectiveMatches(child, event, payload)) continue;
    const amount = child.kind === "survive" || (child.kind === "wait" && event === "mission-tick")
      ? Math.max(0, Number(payload.dt) || 0) : 1;
    mission.counters[id] = Math.min(total, before + amount);
    changed = true;
  }
  if (changed) {
    mission.p = (step.steps || []).filter(child => counterValue(mission, parallelKey(step, child)) >= stepCount(child)).length;
    if ((step.steps || []).every(child => counterValue(mission, parallelKey(step, child)) >= stepCount(child))) {
      moveToStep(mission, nextStepIndex(mission, step), payload);
      const profile = profileFor(payload);
      activateAutomatic(mission, profile, payload);
    }
  }
  return changed;
}

/** Advance one current objective. Returns true when the mission changed. */
export function advanceMission(mission, event, payload = {}) {
  if (!mission || isMissionComplete(mission) || isMissionFailed(mission) || !missionStep(mission)) return false;
  // Mission-spawned trigger events are scoped to the mission that emitted them;
  // otherwise a wave-clear from one story could wake every waiting story.
  if (event === "mission-trigger" && payload.mission && payload.mission !== mission.id) return false;
  const profile = profileFor(payload);
  ensureCounters(mission);
  const prepared = activateAutomatic(mission, profile, payload);
  if (prepared || isMissionComplete(mission) || isMissionFailed(mission)) {
    if (prepared) emitProgress(mission, event, payload);
    return prepared;
  }
  const step = missionStep(mission);
  if (step.kind === "dialogue") {
    const changed = advanceDialogue(mission, step, event, payload, profile);
    if (changed) emitProgress(mission, event, payload);
    return changed;
  }
  if (step.kind === "parallel") {
    const changed = advanceParallel(mission, step, event, payload);
    if (changed) emitProgress(mission, event, payload);
    return changed;
  }
  if (!objectiveMatches(step, event, payload)) return false;

  const before = counterValue(mission, step.id);
  const amount = step.kind === "survive" || (step.kind === "wait" && event === "mission-tick")
    ? Math.max(0, Number(payload.dt) || 0) : 1;
  const after = Math.min(stepCount(step), before + amount);
  mission.counters[step.id] = after;
  mission.p = Math.floor(after);
  if (after >= stepCount(step)) {
    moveToStep(mission, nextStepIndex(mission, step), payload);
    activateAutomatic(mission, profile, payload);
  }
  emitProgress(mission, event, payload);
  return true;
}

/** Advance all missions owned by the event's player. */
export function advanceMissions(event, payload = {}) {
  const profile = profileFor(payload);
  let changed = false;
  for (const mission of [...missionsOf(profile)]) {
    if (event === "mission-tick") {
      mission.elapsed = Math.max(0, Number(mission.elapsed) || 0) + Math.max(0, Number(payload.dt) || 0);
      if (mission.timeout > 0 && mission.elapsed >= mission.timeout) {
        changed = failMission(mission, "timeout", profile, payload) || changed;
        continue;
      }
    }
    changed = advanceMission(mission, event, payload) || changed;
  }
  return changed;
}

function failureRule(mission, reason) {
  const fails = mission?.fails;
  if (!fails || typeof fails !== "object") return null;
  if (Array.isArray(fails.on) && fails.on.includes(reason)) return fails[reason] ?? fails;
  if (Object.prototype.hasOwnProperty.call(fails, reason)) return fails[reason];
  return null;
}

function failureAction(rule, mission) {
  if (typeof rule === "string") return rule === "abandon" ? "abandon" : "keep";
  return rule?.action || mission?.fails?.action || "keep";
}

/** Mark a configured story mission failure and apply its declared outcome. */
export function failMission(mission, reason, profile = state.profile, payload = {}) {
  // Completed missions remain active until the player collects their reward.
  // They must survive a later timeout, death or sector change instead of being
  // marked failed and removed while the player is returning home.
  if (!mission || isMissionFailed(mission) || isMissionComplete(mission)) return false;
  const rule = failureRule(mission, reason);
  if (!rule) return false;
  mission.failed = true;
  mission.failure = reason;
  const message = typeof rule === "object" ? rule.message : mission.fails?.message;
  if (message) mission.failureMessage = message;
  applyFlags(profile, typeof rule === "object" ? rule.set : null);
  const action = failureAction(rule, mission);
  emit("mission-failed", { mission, reason, action, message: mission.failureMessage || "", player: payload.player });
  if (action === "abandon") {
    const list = missionsOf(profile), index = list.indexOf(mission);
    if (index >= 0) list.splice(index, 1);
  }
  return true;
}

function failMissionsFor(reason, payload = {}) {
  const profile = profileFor(payload);
  let changed = false;
  for (const mission of [...missionsOf(profile)]) changed = failMission(mission, reason, profile, payload) || changed;
  return changed;
}

export function acceptMission(offer, profile = state.profile) {
  const mission = offer?.kind === "story" ? instantiateStoryMission(offer) : instantiateMission(offer);
  if (!mission) return undefined;
  missionsOf(profile).push(mission);
  activateAutomatic(mission, profile, { profile });
  emit("mission-accepted", { mission, player: profile === state.profile ? state.player : undefined });
  return mission;
}

export function missionAt(indexOrId, profile = state.profile) {
  const list = missionsOf(profile);
  if (typeof indexOrId === "number" || /^\d+$/.test(String(indexOrId ?? ""))) return list[+indexOrId];
  return list.find(mission => mission.id === indexOrId);
}

/** Current dialogue line and choices for the future dialogue panel (Step 13c). */
export function missionDialogue(mission) {
  const step = missionStep(mission);
  if (!step || step.kind !== "dialogue") return null;
  const lines = Array.isArray(step.lines) ? step.lines : step.lines == null ? [] : [String(step.lines)];
  const lineIndex = Math.min(Math.max(0, counterValue(mission, step.id)), Math.max(0, lines.length - 1));
  return {
    speaker: step.speaker || "",
    portrait: step.portrait || mission.portrait || "",
    line: lines[lineIndex] || "",
    lineIndex,
    lines: [...lines],
    choices: Array.isArray(step.choices) ? step.choices.map(choice => ({ ...choice })) : [],
    waitingForChoice: Array.isArray(step.choices) && lineIndex >= lines.length - 1,
    pause: step.pause === true || mission.pause === true,
  };
}

/** Advance the current dialogue line without making the UI know step internals. */
export function nextMissionDialogue(indexOrId, profile = state.profile) {
  const mission = missionAt(indexOrId, profile);
  if (!mission) return false;
  return advanceMission(mission, "dialogue-next", {
    profile,
    player: profile === state.profile ? state.player : undefined,
  });
}

/** Select a current dialogue choice without making the UI know step internals. */
export function chooseMission(indexOrId, choiceId, profile = state.profile) {
  const mission = missionAt(indexOrId, profile);
  if (!mission) return false;
  return advanceMission(mission, "dialogue-choice", {
    choice: choiceId,
    profile,
    player: profile === state.profile ? state.player : undefined,
  });
}

function itemRequirement(mission) {
  if (mission?.type === "salvage") {
    const step = mission.steps?.find(item => item.kind === "collect") || mission.steps?.[0];
    return {
      item: step?.item || "salv",
      count: Math.max(1, Math.floor(+mission.n || +step?.count || 1)),
    };
  }
  const step = mission?.steps?.find(item => (item.kind === "deliver" || item.kind === "mine") && item.item);
  if (!step) return null;
  return {
    item: step.item,
    count: Math.max(1, Math.floor(+step.count || 1)),
  };
}

export function missionDeliveryRequirement(mission, profile = state.profile) {
  const requirement = itemRequirement(mission);
  if (!requirement) return null;
  const station = countOf(STATION, requirement.item, profile, state.worldState);
  const hold = countOf(profile.ship, requirement.item, profile, state.worldState);
  return { ...requirement, station, hold };
}

export function canCollectMissionReward(mission, profile = state.profile) {
  if (!isMissionComplete(mission)) return false;
  const requirement = missionDeliveryRequirement(mission, profile);
  return !requirement || requirement.station + requirement.hold >= requirement.count;
}

function consumeDelivery(mission, profile) {
  const requirement = missionDeliveryRequirement(mission, profile);
  if (!requirement) return null;
  if (requirement.station + requirement.hold < requirement.count) {
    return `Need ${requirement.count} ${itemName(requirement.item)} in this station or your ship.`;
  }
  let left = requirement.count;
  left -= takeItem(STATION, requirement.item, left, profile, state.worldState);
  if (left > 0) takeItem(profile.ship, requirement.item, left, profile, state.worldState);
  return null;
}

export function completeMission(indexOrId, profile = state.profile) {
  const mission = missionAt(indexOrId, profile) || missionsOf(profile).find(isMissionComplete);
  if (!mission || !isMissionComplete(mission)) return undefined;
  const deliveryError = consumeDelivery(mission, profile);
  if (deliveryError) return deliveryError;
  const reward = Math.max(0, Math.floor(+mission.rewards?.credits || +mission.r || 0));
  profile.cr += reward;
  profile.done = Math.max(0, Math.floor(+profile.done || 0)) + 1;
  const list = missionsOf(profile);
  list.splice(list.indexOf(mission), 1);
  emit("mission-rewarded", { mission, reward, player: profile === state.profile ? state.player : undefined });
  return `Paid ${reward} cr.`;
}

export function abandonMission(indexOrId, profile = state.profile) {
  const mission = missionAt(indexOrId, profile) || missionsOf(profile)[0];
  if (!mission) return undefined;
  failMission(mission, "abandon", profile, { player: profile === state.profile ? state.player : undefined });
  const list = missionsOf(profile);
  const index = list.indexOf(mission);
  if (index >= 0) list.splice(index, 1);
  emit("mission-abandoned", { mission, player: profile === state.profile ? state.player : undefined });
  return "Mission abandoned.";
}

// Gameplay events carry the acting player, so progress remains in that pilot's
// portable profile in a hosted world. No emitter needs to know about missions.
on("mined", payload => advanceMissions("mined", payload));
on("enemy-killed", payload => advanceMissions("enemy-killed", payload));
on("pickup", payload => advanceMissions("pickup", payload));
on("place-entered", payload => advanceMissions("place-entered", payload));
on("delivered", payload => advanceMissions("delivered", payload));
on("mission-trigger", payload => advanceMissions("mission-trigger", payload));
on("mission-tick", payload => advanceMissions("mission-tick", payload));
on("mission-dialogue-next", payload => advanceMissions("dialogue-next", payload));
on("mission-dialogue-choice", payload => advanceMissions("dialogue-choice", payload));
on("player-dead", payload => failMissionsFor("player-dead", payload));
on("place-changed", payload => {
  advanceMissions("place-changed", payload);
  const profile = profileFor(payload);
  for (const mission of [...missionsOf(profile)]) {
    const sector = mission.fails?.sector || mission.origin;
    if (sector && payload.from === sector && payload.to !== sector) failMission(mission, "left-sector", profile, payload);
  }
});
