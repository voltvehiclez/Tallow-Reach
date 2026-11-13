// Data-driven mission runner (Steps 13a and 13b). Contracts are the first
// mission kind; the same runner also handles story dialogue, scripts, waits,
// remembered flags, branches and parallel objectives.

import { on, emit } from "../util/events.js";
import { CONTRACT_MISSION_TEMPLATES, missionFromContract, describeMission } from "../data/missions/contracts.js";
import { storyMission } from "../data/missions/index.js";
import { itemCat, itemName, itemStack, itemVol } from "../data/items.js";
import { enemyDef } from "../data/enemies.js";
import { placeAt, isPocket, DEFAULT_PLACE } from "../data/places.js";
import { state, profileOf } from "../state/state.js";
import { STATION, addItem, capacityOf, countOf, hasRoomFor, loadOf, stockOf, takeItem } from "./inventory.js";
import { enterPlace, arrivalPos, stationAt } from "./places.js";

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

/**
 * Every authored step is finished. This is deliberately NOT called "complete":
 * a mission that hands items in is not accomplished until `completeMission`
 * takes the goods and pays. Read this name, never `mission.completed`, so the
 * difference cannot quietly disappear again (LESSONS L15).
 */
export function missionObjectivesDone(mission) {
  return !!mission && !mission.failed && (mission.completed === true || mission.step >= (mission.steps?.length || 0));
}

/** The word the runner uses for this mission's own kind: "Contract" or "Mission". */
export function missionKindWord(mission) {
  return mission?.kind === "contract" ? "Contract" : "Mission";
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
  const done = missionObjectivesDone(mission) ? total : Math.min(total, counterValue(mission, step.id));
  return { done, total, step, index };
}

/**
 * "2 out of 3 crates recovered" for a recovery contract, or null for missions
 * that count something else (a hunt counts kills, a mining job counts ore).
 * These are the crates the contract itself put in space: recovering another
 * contract's, or loose crates from a wreck, never moves this number.
 */
export function missionRecoveryText(mission) {
  if (!mission || mission.kind !== "contract" || mission.type !== "salvage") return null;
  const { done, total } = missionProgress(mission);
  return `${done} out of ${total} crates recovered`;
}

export function remainingObjective(mission) {
  const progress = missionProgress(mission);
  return Math.max(0, progress.total - progress.done);
}

/** Fill the small set of data-only placeholders a mission sentence may use. */
function fillMissionText(text, values) {
  return String(text ?? "").replace(/\{(remaining|count|item|enemy|place|station)\}/g, (_, key) => String(values[key] ?? ""));
}

/**
 * A station pocket id, or null. `stationAt` alone would accept any unknown id,
 * because the place catalog falls back to the home station for ids it does not
 * know; that would turn a corrupt `handIn.station` into a mission filed at a
 * station that does not exist, which no log would ever show.
 */
export const stationPocket = id => (typeof id === "string" && isPocket(id) && stationAt(id) ? id : null);

/**
 * The place id of the station a mission is handed in at. Mission data may name
 * one (`handIn.station`) when the job sends the pilot somewhere specific;
 * otherwise it is the station that gave the mission out, which `acceptMission`
 * records the moment it is taken. `origin` (the station a contract was taken
 * from) resolves it for missions saved before the field existed, the station the
 * pilot is docked at covers an offer that has not been accepted yet, and a
 * record whose station no longer exists falls back to the home station, so a
 * mission can never become impossible. Returns null only if nothing can be named.
 */
export function missionHandInStation(mission) {
  const named = stationPocket(mission?.handIn?.station);
  if (named) return named;
  const origin = stationPocket(mission?.origin);
  if (origin) return origin;
  // An offer (or a mission taken in flight) has no origin station yet: the one
  // the pilot is docked at gives it out, so that is where it comes back to.
  if (stationPocket(state.place)) return state.place;
  return stationPocket(DEFAULT_PLACE);
}

/** The name of the station a mission is handed in at, for player-facing text. */
export function missionHandInStationName(mission) {
  return stationAt(missionHandInStation(mission))?.n || "a station";
}

/**
 * Is the pilot docked at the station that takes this mission's hand-in? A
 * mission with no resolvable station can be handed in anywhere (it must never
 * become impossible); everything ordinary names exactly one station.
 */
export function atMissionHandInStation(mission, placeId = state.place) {
  const station = missionHandInStation(mission);
  return !station || station === placeId;
}

/**
 * The one station that offers an authored mission: its own `offeredAt`, else the
 * station it is handed in at (the giving station), else home. Every mission is
 * therefore specific to a station by default — there is no "offered everywhere"
 * form, and the Mission log only lists an offer at that station.
 *
 * A mission whose data names `offeredAt` that is not a station is offered
 * **nowhere** rather than silently moving to the fallback: a typo must not turn
 * one station's job into every station's job (the linter reports it as an error).
 */
export function missionOfferStation(definition, fallback = DEFAULT_PLACE) {
  const named = typeof definition?.offeredAt === "string" ? definition.offeredAt : "";
  if (named) return stationPocket(named);          // fail closed, never move
  const handIn = stationPocket(definition?.handIn?.station);
  if (handIn) return handIn;
  return stationPocket(fallback);
}

/**
 * Is the pilot at the station this mission belongs to? A station-contact
 * conversation (a dialogue step with `requiresDock`) happens at the counter that
 * gives the mission out, not at any station the pilot may dock at: reading the
 * Archivist's briefing while docked at Galereach would be a conversation in two
 * places at once. Missions that name no station are never held back.
 */
export function missionAtItsStation(mission, placeId = state.place) {
  const station = missionOfferStation(mission);
  return !station || !placeId || station === placeId;
}

/** The station name a mission sentence shows for `{station}`. */
function stationLabel(mission) {
  return missionHandInStationName(mission);
}

/**
 * Record the station a mission is handed in at, once, when it is taken: its own
 * data if it names one, else the station that gave it out. Stored on the
 * mission so it survives a save and cannot drift as the pilot travels.
 */
function stampHandInStation(mission, at = state.place) {
  if (!mission) return mission;
  if (stationPocket(mission?.handIn?.station)) return mission;   // the data chose it
  const giving = stationPocket(at) || missionHandInStation(mission);
  if (!giving) return mission;
  mission.handIn = { ...(mission.handIn || {}), station: giving };
  return mission;
}

/** The sentence a mission shows while its objectives are done but its items
 * are still owed. Kept in mission data (`handIn.objective`), never in the UI. */
function handInObjective(mission) {
  if (typeof mission?.handIn?.objective === "string" && mission.handIn.objective) return mission.handIn.objective;
  const definition = mission?.kind === "contract"
    ? CONTRACT_MISSION_TEMPLATES[mission?.type]
    : storyMission(mission?.id);
  return typeof definition?.handIn?.objective === "string" ? definition.handIn.objective : "";
}

/** Replace the placeholders used by contract objectives. Story objectives are
 * normally complete sentences and need no interpolation. */
function formatMissionObjective(text, step, progress, mission) {
  const target = step.place || step.sector || step.target;
  return fillMissionText(text, {
    remaining: Math.max(0, progress.total - progress.done),
    count: progress.total,
    item: step.item ? itemName(step.item) : "the required item",
    enemy: step.enemy ? enemyDef(step.enemy).pl || "hostiles" : "hostiles",
    place: target ? placeAt(target)?.n || target : "the target area",
    station: stationLabel(mission),
  });
}

/**
 * Guidance once every objective is finished but the reward is unclaimed.
 * A mission that owes items is NOT accomplished yet: its text keeps naming the
 * cargo and the station until the hand-in consumes them. A mission with nothing
 * to hand over is done and says so in its own kind's word, so a contract never
 * calls itself a mission.
 */
function handInNextText(mission, profile) {
  const requirement = missionHandIn(mission);
  const station = stationLabel(mission);
  if (!requirement) return `${missionKindWord(mission)} complete. Return to ${station} to collect the reward.`;
  const text = handInText(mission);
  // A delivery contract's shortfall is paperwork, not guidance: the store and the
  // hold both count, the sentence already names the station, and the docked
  // card says exactly what is missing when the pilot tries to hand in.
  if (deliveryContract(mission)) return text;
  const delivery = missionDeliveryRequirement(mission, profile);
  const have = delivery ? delivery.station + delivery.hold : requirement.count;
  return have >= requirement.count ? text : `${text} You have ${have} of ${requirement.count}.`;
}

/** Explain a resource-blocked script instead of leaving a vague generic step. */
function blockedScriptText(step, profile = state.profile) {
  for (const action of scriptActions(step)) {
    const kind = scriptKind(action);
    if ((kind !== "give-item" && kind !== "take-item") || scriptActionReady(action, profile)) continue;
    const station = action.target === "station";
    if (kind === "give-item") return station
      ? "Make room in station storage to continue."
      : "Make room in your hold to continue.";
    return station
      ? "Keep the required item in station storage to continue."
      : "Keep the required item in your hold to continue.";
  }
  return "";
}

/** Generic mission-log/HUD guidance. Every mission may supply a spoiler-safe
 * `objective` in its data step. The older `log` field remains in saved mission
 * data for compatibility, but is deliberately never shown here: procedural
 * logs can reveal a future ambush or another step's implementation detail. */
/**
 * A contract whose job is to gather cargo and bring it to a station (mining and
 * salvage). Its guidance names the delivery from the moment it is taken: a
 * "Mine 3 of 12" line counts only what is aboard, while the station store may
 * already hold the rest, so the number told half the story (owner request).
 */
function deliveryContract(mission) {
  return !!mission && mission.kind === "contract" && CONTRACT_MISSION_TEMPLATES[mission.type]?.delivery === true;
}

/** The sentence a mission shows about its owed goods, filled in. */
function handInText(mission) {
  const requirement = missionHandIn(mission);
  return fillMissionText(handInObjective(mission) || "Deliver {count} {item} to {station}.", {
    count: requirement?.count ?? 0,
    remaining: 0,
    item: requirement ? itemName(requirement.item) : "the cargo",
    enemy: "hostiles",
    place: stationLabel(mission),
    station: stationLabel(mission),
  });
}

export function missionNextText(mission, profile = state.profile) {
  if (!mission) return "No mission selected.";
  if (isMissionFailed(mission)) return mission.failureMessage || `${missionKindWord(mission)} failed.`;
  if (missionObjectivesDone(mission)) return handInNextText(mission, profile);
  // Read from the data, not from the step: an accepted contract keeps the step
  // text it was created with, and the delivery sentence is the right guidance
  // at every point of the job.
  if (deliveryContract(mission)) return handInText(mission);
  const step = missionStep(mission);
  if (!step) return "No current objective.";
  const progress = missionProgress(mission);
  const resourceHint = step.kind === "script" ? blockedScriptText(step, profile) : "";
  if (resourceHint) {
    // A dock-side step cannot continue in flight, so say that too: the player
    // must never be told to "make room" while nothing tells them to go back.
    const here = profile === state.profile ? state.player : null;
    return step.requiresDock === true && here && here.docked !== true
      ? `Dock at a station and ${resourceHint.charAt(0).toLowerCase()}${resourceHint.slice(1)}`
      : resourceHint;
  }
  if (typeof step.objective === "string" && step.objective) {
    return formatMissionObjective(step.objective, step, progress, mission);
  }
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
      return step.place || step.sector ? `Go to ${placeName}.` : "Continue following the mission lead.";
    case "parallel":
    case "script":
      return "Continue following the mission lead.";
    case "flags":
      return "Decide how to proceed.";
    default:
      return "Continue following the mission lead.";
  }
}

export function missionForObjective(profile, kind) {
  return missionsOf(profile).find(mission =>
    !missionObjectivesDone(mission) && !isMissionFailed(mission) && missionStep(mission)?.kind === kind
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
export function instantiateMission(offer, at = state.place) {
  const mission = missionFromContract(offer, freshId(offer?.type));
  // Remember the station the contract was taken from, so the hand-in guidance
  // can name it while the pilot is out in the field. `origin` is already part of
  // the saved mission shape, so no save migration is needed.
  if (mission && !mission.origin) mission.origin = at;
  return stampHandInStation(mission, at);
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
  // "end" is the named finish line. Authors write `next: "end"` instead of a
  // bare step number that silently points at the wrong step if one is inserted.
  if (target === "end") return mission.steps.length;
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

// The last step finished. This is NOT the mission's accomplishment: a mission
// that hands items in still waits for `completeMission`, which consumes them
// and pays. The event name says so, so no listener can mistake one for the other.
function markObjectivesDone(mission, payload = {}) {
  if (mission.completed) return false;
  mission.completed = true;
  mission.current = mission.steps.length;
  emit("mission-objectives-done", { mission, player: payload.player });
  return true;
}

function moveToStep(mission, target, payload = {}) {
  const index = target;
  if (!Number.isInteger(index) || index < 0 || index > mission.steps.length) return false;
  mission.step = index;
  mission.current = index;
  mission.p = 0;
  if (index >= mission.steps.length) markObjectivesDone(mission, payload);
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
  // them as an event means mission data does not import an enemy system. A
  // world-changing spawn waits until the acting pilot is actually flying in
  // the requested place; advancing a station conversation cannot create a
  // fight somewhere else.
  if (kind === "spawn-wave" || kind === "spawn-ship") {
    if (!player || player.docked === true || player.dead === true || player.warp ||
        (player.place || state.place) !== place) return false;
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

function scriptActionsReady(actions, profile, payload = {}) {
  const planned = new Map();
  const player = payload.player || (profile === state.profile ? state.player : null);
  const stockFor = where => {
    if (!planned.has(where)) {
      planned.set(where, {
        counts: { ...stockOf(where, profile, state.worldState) },
        load: loadOf(where, profile, state.worldState),
      });
    }
    return planned.get(where);
  };
  for (const action of actions) {
    const kind = scriptKind(action);
    if (kind === "give-item" || kind === "take-item") {
      const item = action.item;
      const count = Math.max(1, Math.floor(+action.count || 1));
      const where = action.target === "station" ? STATION : profile.ship;
      const stock = stockFor(where);
      const have = Math.max(0, Number(stock.counts[item]) || 0);
      if (kind === "take-item") {
        if (have < count) return false;
        stock.counts[item] = have - count;
        stock.load = Math.max(0, stock.load - count * itemVol(item));
        continue;
      }
      const volume = itemVol(item);
      if (!(volume > 0) || stock.load + count * volume > capacityOf(where, profile, state.worldState) ||
          have + count > itemStack(item)) return false;
      stock.counts[item] = have + count;
      stock.load += count * volume;
      continue;
    }
    if (kind === "spawn-wave" || kind === "spawn-ship") {
      const place = action.place || action.sector || player?.place || state.place;
      if (!player || player.docked === true || player.dead === true || player.warp ||
          (player.place || state.place) !== place) return false;
    }
    if (kind === "warp-player" && (!player || !(action.to || action.place || action.sector))) return false;
  }
  return true;
}

function stepSituationReady(step, profile, payload = {}) {
  if (payload.fromDialogue) return false;
  const player = payload.player || (profile === state.profile ? state.player : null);
  const requiredPlace = step.place || step.sector || step.requiresPlace;
  if (requiredPlace && (!player || player.place !== requiredPlace)) return false;
  if (state.loading || player?.loading || player?.dead || player?.warp ||
      (player?.inCombat && step.allowCombat !== true)) return false;
  if (step.requiresDock === true && player?.docked !== true) return false;
  if (step.requiresFlying === true && (!player || player.docked === true)) return false;
  return true;
}

function executeScriptStep(step, mission, profile, payload = {}) {
  if (!stepSituationReady(step, profile, payload)) return false;
  const actions = scriptActions(step);
  if (!actions.length) return true;
  // Preflight the complete batch. This prevents a multi-action hand-off from
  // applying its first item transfer and then getting stuck on a later full
  // hold, which would duplicate that first transfer on every retry.
  if (!scriptActionsReady(actions, profile, payload)) return false;
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

function missionPickupMatches(step, mission, payload = {}) {
  const requiredPlace = step?.place || step?.sector || step?.requiresPlace;
  const actualPlace = payload.player?.place || payload.place || payload.id;
  return step?.kind === "collect" && (step.missionItem === true || step.owned === true) &&
    payload.missionId === mission.id &&
    payload.missionItem === true &&
    (!step.item || step.item === payload.item) &&
    (!requiredPlace || requiredPlace === actualPlace) &&
    payload.player?.docked !== true;
}

/** Remember a mission-tagged pickup even if the story has not reached its
 * collect step yet. The physical crate is gone once picked up, so losing that
 * event would leave a valid mission permanently waiting for an item that cannot
 * respawn. Current collect/parallel steps handle their own events below. */
function rememberMissionPickup(mission, event, payload = {}) {
  if (event !== "pickup") return false;
  ensureCounters(mission);
  const current = missionStep(mission);
  const currentHandles = current?.kind === "collect"
    ? missionPickupMatches(current, mission, payload)
    : current?.kind === "parallel" && (current.steps || []).some(child => missionPickupMatches(child, mission, payload));
  if (currentHandles) return false;
  const index = mission.steps.findIndex((step, i) => i > mission.step && missionPickupMatches(step, mission, payload));
  if (index < 0) return false;
  const step = mission.steps[index];
  const before = counterValue(mission, step.id);
  const after = Math.min(stepCount(step), before + 1);
  if (after === before) return false;
  mission.counters[step.id] = after;
  return true;
}

/** Run zero-length story steps immediately after a mission starts or advances. */
function activateAutomatic(mission, profile, payload = {}) {
  let changed = false;
  for (let guard = 0; guard < 100 && !missionObjectivesDone(mission) && !isMissionFailed(mission); guard++) {
    const step = missionStep(mission);
    if (!step) break;
    if (primeReachStep(mission, payload)) {
      changed = true;
      continue;
    }
    // A mission pickup can happen before a later collect step becomes current.
    // Once its counter is recorded, completing that objective is still a
    // deterministic no-op rather than asking the pilot to find a crate twice.
    if (step.kind === "collect" && counterValue(mission, step.id) >= stepCount(step)) {
      changed = true;
      moveToStep(mission, nextStepIndex(mission, step), payload);
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

function objectiveMatches(step, event, payload = {}, mission = null) {
  if (!step) return false;
  const requiredPlace = step.place || step.sector || step.requiresPlace;
  const actualPlace = payload.player?.place || payload.place || payload.id || payload.target;
  if (requiredPlace && requiredPlace !== actualPlace) return false;
  if (step.kind === "kill") {
    return (!step.enemy || step.enemy === payload.def) && (!step.faction || step.faction === payload.faction);
  }
  if (step.kind === "mine") return !step.item || step.item === payload.item;
  if (step.kind === "collect") {
    // `owned` crates belong to one recovery contract: the mission spawns its own
    // in space, and another contract's crates (or loose Salvage from a wreck)
    // must not finish its count. The recovered item is ordinary cargo, so any
    // Salvage can still pay the hand-in.
    if (step.owned === true &&
        (payload.missionId !== mission?.id || payload.player?.docked === true)) return false;
    return (!step.item || step.item === payload.item) &&
      (step.missionItem !== true || (payload.missionItem === true &&
        payload.missionId === mission?.id && payload.player?.docked !== true));
  }

  if (step.kind === "reach" || step.kind === "reach-sector") {
    const target = step.place || step.sector || step.target;
    return !target || target === payload.id || target === payload.place || target === payload.player?.place;
  }
  if (step.kind === "deliver") {
    const target = step.target || step.place;
    if (target === "station" && payload.player && payload.player.docked !== true) return false;
    return (!target || target === payload.target || target === payload.place || target === payload.player?.place) &&
      (!step.item || step.item === payload.item);
  }
  if (step.kind === "wait") {
    if (event === "mission-trigger") return !step.trigger || step.trigger === payload.trigger || step.trigger === payload.id;
    if (event === "place-entered") {
      const target = step.place || step.sector || step.target;
      return !!target && target === (payload.id || payload.place || payload.player?.place);
    }
    return event === "mission-tick" && (step.timer === true || step.trigger === "timer" || step.seconds !== undefined);
  }
  return event === "mission-tick" && step.kind === "survive";
}

function advanceDialogue(mission, step, event, payload, profile) {
  // The UI also hides these controls, but keep the rule in the runner so a
  // stale click or another caller cannot advance a station conversation while
  // the pilot is in flight.
  const player = payload.player || (profile === state.profile ? state.player : null);
  if (!player || state.loading || player.loading || player.dead || player.warp ||
      (player.inCombat && step.allowCombat !== true) ||
      (step.requiresDock === true && player.docked !== true)) return false;
  // A station-contact conversation belongs to the station that gives the mission
  // out; docking at another counter is not the same place (docs/MISSION_RULES.md).
  if (step.requiresDock === true && !missionAtItsStation(mission, player.place || state.place)) return false;
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
    activateAutomatic(mission, profile, { ...payload, fromDialogue: true });
    return true;
  }
  if (event !== "dialogue-next") return false;
  if (current + 1 < lines.length) {
    mission.counters[step.id] = current + 1;
    mission.p = current + 1;
    return true;
  }
  moveToStep(mission, nextStepIndex(mission, step), payload);
  activateAutomatic(mission, profile, { ...payload, fromDialogue: true });
  return true;
}

function advanceParallel(mission, step, event, payload) {
  let changed = false;
  for (const child of step.steps || []) {
    const id = parallelKey(step, child), total = stepCount(child), before = counterValue(mission, id);
    if (before >= total || !objectiveMatches(child, event, payload, mission)) continue;
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
  if (!mission || isMissionFailed(mission) || !missionStep(mission)) return false;
  const rememberedPickup = rememberMissionPickup(mission, event, payload);
  if (missionObjectivesDone(mission)) return rememberedPickup;
  // Mission-spawned trigger events are scoped to the mission that emitted them;
  // otherwise a wave-clear from one story could wake every waiting story.
  if (event === "mission-trigger" && payload.mission && payload.mission !== mission.id) return false;
  const profile = profileFor(payload);
  ensureCounters(mission);
  const prepared = activateAutomatic(mission, profile, payload);
  if (prepared || missionObjectivesDone(mission) || isMissionFailed(mission)) {
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
  if (!objectiveMatches(step, event, payload, mission)) return false;

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

// Events after which a mission that owes a hand-in is checked for a mission-only
// item that no longer exists anywhere (a ship destroyed, a hold changed, a dock).
const LOST_HAND_IN_EVENTS = new Set(["mission-tick", "docked", "place-changed", "warp-end", "mission-inventory-changed"]);

/** Advance all missions owned by the event's player. */
export function advanceMissions(event, payload = {}) {
  const profile = profileFor(payload);
  let changed = LOST_HAND_IN_EVENTS.has(event) ? failLostHandIns(payload, profile) : false;
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

/** What to tell the player when a failure rule carries no message of its own.
 * The notice above it already says "Mission failed: <name>", so these are the
 * reason only. */
const FAILURE_REASON_TEXT = {
  "player-dead": "Your ship was destroyed.",
  "left-sector": "You left the area the mission needed you in.",
  timeout: "Time ran out.",
};

/**
 * Mission-only items (category "mission": a parcel, a beacon) a mission hands out,
 * drops or sends the pilot to fetch. They cannot be found again once lost.
 */
export function missionOnlyItems(mission) {
  const found = new Set();
  const visit = step => {
    if (!step || typeof step !== "object") return;
    for (const action of scriptActions(step)) {
      const kind = scriptKind(action);
      if (kind === "give-item" && action?.item) found.add(action.item);
      if ((kind === "spawn-wave" || kind === "spawn-ship") && action?.dropOnDefeat?.item) found.add(action.dropOnDefeat.item);
    }
    if (step.kind === "collect" && step.missionItem === true && step.item) found.add(step.item);
    for (const child of step.steps || []) visit(child);
  };
  for (const step of mission?.steps || []) visit(step);
  return [...found].filter(id => itemCat(id) === "mission");
}

/** Every copy of an item anywhere the pilot can reach without it being lost. */
function missionCopies(item, profile) {
  let total = 0;
  const seen = new Set();
  const add = stock => {
    if (!stock || typeof stock !== "object" || seen.has(stock)) return;
    seen.add(stock);
    total += Math.max(0, Number(stock[item]) || 0);
  };
  for (const hold of Object.values(profile?.holds || {})) add(hold);
  const world = state.worldState || {};
  for (const stock of Object.values(world.stationStores || {})) add(stock);
  add(world.store);
  return total;
}

/**
 * A mission whose objectives are done but which still owes a hand-in can be
 * waiting on a mission-only object (category "mission": a beacon, a parcel) that
 * no longer exists anywhere. Such an object cannot be bought, mined or looted
 * again, so the mission is impossible: this returns its requirement. Ordinary
 * goods (ore, salvage) can be recovered again, so they never count as lost, and
 * neither does an item that is still in the ship or at a station.
 */
export function missionLostHandIn(mission, profile = state.profile) {
  if (!mission || isMissionFailed(mission) || !missionObjectivesDone(mission)) return null;
  const requirement = missionHandIn(mission);
  if (!requirement || itemCat(requirement.item) !== "mission") return null;
  return missionCopies(requirement.item, profile) >= requirement.count ? null : requirement;
}

/** Fail every active mission that owes a hand-in it can never make. Says why. */
function failLostHandIns(payload = {}, profile = profileFor(payload)) {
  let changed = false;
  for (const mission of [...missionsOf(profile)]) {
    const lost = missionLostHandIn(mission, profile);
    if (!lost) continue;
    changed = failMission(mission, "lost-item", profile, payload, {
      action: "abandon",
      message: `The ${itemName(lost.item)} this ${missionKindWord(mission).toLowerCase()} needed is gone, so it cannot be finished.`,
    }, { afterObjectives: true }) || changed;
  }
  return changed;
}

/**
 * Mark a configured mission failure and apply its declared outcome.
 * `options.afterObjectives` is the one way to fail a mission whose steps are
 * all done: what it needs is gone for good (a lost mission-only hand-in item).
 * Without it, a returning pilot is never failed by a later timeout, death or
 * sector change.
 */
export function failMission(mission, reason, profile = state.profile, payload = {}, ruleOverride = null, options = {}) {
  if (!mission || isMissionFailed(mission)) return false;
  if (missionObjectivesDone(mission) && options.afterObjectives !== true) return false;
  const rule = ruleOverride || failureRule(mission, reason);
  if (!rule) return false;
  mission.failed = true;
  mission.failure = reason;
  // A failure always says why. Authored text wins; otherwise the reason names the cause.
  const authored = typeof rule === "object" ? rule.message : mission.fails?.message;
  const message = authored || FAILURE_REASON_TEXT[reason] || "";
  if (message) mission.failureMessage = message;
  applyFlags(profile, typeof rule === "object" ? rule.set : null);
  const action = failureAction(rule, mission);
  emit("mission-failed", { mission, title: mission.title, reason, action, message: mission.failureMessage || "", player: payload.player });
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

export function acceptMission(offer, profile = state.profile, at = state.place) {
  // A story mission can only be active once. The Mission log hides an active
  // offer, but the rule belongs here: a second copy (a double click, a retry, a
  // network message) would run the same script twice and double every spawn.
  if (offer?.kind === "story" && missionsOf(profile).some(active => active.id === offer.id)) return undefined;
  // Every mission is handed in at one station: its data may name it, otherwise it
  // is the station that gave the mission out (this one, unless the pilot is not
  // at a station, in which case the home station). Stamped on the record so it
  // survives a save and cannot drift as the pilot travels.
  // `at` is the station whose board the offer came from: a contract read at a
  // station is filed there even if the caller is not standing in it (tests, or a
  // board browsed for a docked friend).
  const mission = stampHandInStation(
    offer?.kind === "story" ? instantiateStoryMission(offer) : instantiateMission(offer, at),
    at,
  );
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
    // Only authored station-contact conversations require docking. In-field
    // mission dialogue stays actionable while flying.
    requiresDock: step.requiresDock === true,
    // Where that conversation happens: the station that gives the mission out.
    station: missionOfferStation(mission),
    stationName: missionOfferStation(mission) ? stationAt(missionOfferStation(mission))?.n || "" : "",
    pause: step.pause === true || mission.pause === true,
  };
}

/** Advance the current dialogue line without making the UI know step internals. */
export function nextMissionDialogue(indexOrId, profile = state.profile, player = profile === state.profile ? state.player : undefined) {
  const mission = missionAt(indexOrId, profile);
  if (!mission) return false;
  return advanceMission(mission, "dialogue-next", { profile, player });
}

/** Select a current dialogue choice without making the UI know step internals. */
export function chooseMission(indexOrId, choiceId, profile = state.profile, player = profile === state.profile ? state.player : undefined) {
  const mission = missionAt(indexOrId, profile);
  if (!mission) return false;
  return advanceMission(mission, "dialogue-choice", { choice: choiceId, profile, player });
}

function itemRequirementStep(steps = []) {
  for (const step of steps) {
    if (step?.item && ["collect", "deliver", "mine"].includes(step.kind)) return step;
    const nested = step?.kind === "parallel" ? itemRequirementStep(step.steps) : null;
    if (nested) return nested;
  }
  return null;
}

/**
 * The items a mission must hand over before it is accomplished, or null. What
 * counts as a hand-in is data: any item-bearing `collect`, `mine` or `deliver`
 * objective, including one nested in a parallel step. The runner consumes the
 * exact quantity at the station only when the reward is paid, so a mission that
 * owes items is never treated as finished early (LESSONS L15). The legacy
 * salvage fallback covers unsanitized v18/early-v19 records that did not store
 * their explicit item id.
 */
export function missionHandIn(mission) {
  const step = itemRequirementStep(mission?.steps);
  if (!step && mission?.type !== "salvage") return null;
  const item = step?.item || "salv";
  const count = mission?.type === "salvage"
    ? Math.max(1, Math.floor(+mission.n || +step?.count || 1))
    : Math.max(1, Math.floor(+step.count || 1));
  return { item, count };
}

export function missionDeliveryRequirement(mission, profile = state.profile) {
  const requirement = missionHandIn(mission);
  if (!requirement) return null;
  const station = countOf(STATION, requirement.item, profile, state.worldState);
  const hold = countOf(profile.ship, requirement.item, profile, state.worldState);
  return { ...requirement, station, hold };
}

/** Ready to be paid at the station the pilot is at right now. */
export function canCompleteMissionHere(mission, profile = state.profile) {
  return canCollectMissionReward(mission, profile) && atMissionHandInStation(mission);
}

export function canCollectMissionReward(mission, profile = state.profile) {
  if (!missionObjectivesDone(mission)) return false;
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

export function completeMission(indexOrId, profile = state.profile, player = profile === state.profile ? state.player : undefined) {
  if (player && (state.loading || player.loading || player.dead || player.warp || player.inCombat || player.docked !== true)) {
    return "Dock at a station to collect the reward.";
  }
  const mission = missionAt(indexOrId, profile) || missionsOf(profile).find(missionObjectivesDone);
  if (!mission || !missionObjectivesDone(mission)) return undefined;
  // One station takes the hand-in. Anywhere else pays nothing and says where to
  // go, so the reward can never be collected at the wrong counter.
  if (!atMissionHandInStation(mission)) return `Hand this in at ${missionHandInStationName(mission)}.`;
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
  return `${missionKindWord(mission)} abandoned.`;
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
// Arrival enters the new pocket while the warp animation is still active;
// retry world-changing steps once the pilot is actually out of warp.
on("warp-end", payload => advanceMissions("warp-end", payload));
// Resource-blocked scripts retry when the player changes inventory or returns
// to a station. The pending step, not the button click, decides whether it can
// now continue.
on("mission-inventory-changed", payload => advanceMissions("inventory-changed", payload));
on("docked", payload => advanceMissions("docked", payload));
on("mission-dialogue-next", payload => advanceMissions("dialogue-next", payload));
on("mission-dialogue-choice", payload => advanceMissions("dialogue-choice", payload));
// Death is punishment enough, so a destroyed ship does NOT fail a mission by default.
// A mission fails on death only when
//   1. its data says so on purpose (`fails: { on: ["player-dead"], ... }`), or
//   2. the ship was carrying a mission-only item the mission still needs: the hold is
//      lost with the ship and that item cannot be found again.
// Case 2 applies to a mission whose objectives are all done but whose hand-in
// has not happened yet: the beacon is gone, so it can never be accomplished.
// Either way the failure carries a message, which the HUD shows.
on("player-dead", (payload = {}) => {
  const profile = profileFor(payload);
  // `lost` is the hold as it was at the moment of death, so this never depends
  // on whether the recovery code has already cleared the ship.
  const held = payload.lost || profile?.holds?.[profile?.ship] || {};
  for (const mission of [...missionsOf(profile)]) {
    if (isMissionFailed(mission)) continue;
    if (failMission(mission, "player-dead", profile, payload)) continue;
    const requirement = missionHandIn(mission);
    const lostItem = (requirement && itemCat(requirement.item) === "mission" && (Number(held[requirement.item]) || 0) > 0
      ? requirement.item
      : null) ||
      (!missionObjectivesDone(mission)
        ? missionOnlyItems(mission).find(id => (Number(held[id]) || 0) > 0)
        : null);
    if (!lostItem) continue;
    failMission(mission, "player-dead", profile, payload, {
      action: "abandon",
      message: `Your ship was destroyed and the ${itemName(lostItem)} it carried was lost.`,
    }, { afterObjectives: true });
  }
});
on("place-changed", payload => {
  advanceMissions("place-changed", payload);
  const profile = profileFor(payload);
  for (const mission of [...missionsOf(profile)]) {
    const sector = mission.fails?.sector || mission.origin;
    // Leaving while a conversation is open is not an intentional mission
    // failure: station conversations remain pending until redocking, while
    // in-field dialogue can travel with the pilot. This also prevents the
    // final Border Signal line from abandoning the mission during the return
    // warp just because the player has not clicked Close yet.
    if (sector && payload.from === sector && payload.to !== sector && !missionDialogue(mission)) {
      failMission(mission, "left-sector", profile, payload);
    }
  }
});
