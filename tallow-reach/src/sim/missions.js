// Data-driven mission runner (Step 13a). Contracts are the first mission kind;
// the runner already speaks in objective events so story missions can add
// dialogue, flags and scripts without creating a second progress system.

import { on, emit } from "../util/events.js";
import { missionFromContract, describeMission } from "../data/missions/contracts.js";
import { state, profileOf } from "../state/state.js";

let nextMissionId = 0;

function missionsOf(profile = state.profile) {
  if (!profile) return [];
  if (Array.isArray(profile.missions)) return profile.missions;
  // Plain test/legacy profiles may still carry only the old property. The real
  // save profile has a compatibility setter, but this also keeps the runner
  // useful with a minimal object made by a headless test.
  if (profile.mission) {
    const mission = missionFromContract(profile.mission, `contract:legacy:${++nextMissionId}`);
    profile.missions = mission ? [mission] : [];
    return profile.missions;
  }
  profile.missions = [];
  return profile.missions;
}

export const activeMissions = (profile = state.profile) => missionsOf(profile);

export function missionDescription(mission) {
  return describeMission(mission);
}

export function missionStep(mission) {
  if (!mission || !Array.isArray(mission.steps) || mission.step >= mission.steps.length) return null;
  return mission.steps[mission.step];
}

export function isMissionComplete(mission) {
  return !!mission && (mission.completed === true || mission.step >= (mission.steps?.length || 0));
}

export function missionProgress(mission) {
  if (!mission || !Array.isArray(mission.steps) || !mission.steps.length) return { done: 0, total: 0 };
  const index = Math.min(Math.max(0, mission.step), mission.steps.length - 1);
  const step = mission.steps[index];
  const done = isMissionComplete(mission)
    ? step.count
    : Number(mission.counters?.[step.id] || 0);
  return { done: Math.min(step.count, Math.max(0, done)), total: step.count, step, index };
}

export function remainingObjective(mission) {
  const progress = missionProgress(mission);
  return Math.max(0, progress.total - progress.done);
}

export function missionForObjective(profile, kind) {
  return missionsOf(profile).find(mission => !isMissionComplete(mission) && missionStep(mission)?.kind === kind) || null;
}

function freshId(type) {
  nextMissionId += 1;
  return `contract:${type}:${nextMissionId}`;
}

/** Make an active mission from a compact board offer. */
export function instantiateMission(offer) {
  return missionFromContract(offer, freshId(offer?.type));
}

function ensureCounters(mission) {
  if (!mission.counters || typeof mission.counters !== "object") mission.counters = {};
  for (const step of mission.steps || []) {
    const value = Number(mission.counters[step.id]);
    mission.counters[step.id] = Number.isFinite(value) && value >= 0 ? value : 0;
  }
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
  return event === "mission-tick" && step.kind === "survive";
}

/** Advance one current objective. Returns true when the mission changed. */
export function advanceMission(mission, event, payload = {}) {
  if (!mission || isMissionComplete(mission) || !missionStep(mission)) return false;
  ensureCounters(mission);
  const step = missionStep(mission);
  if (!objectiveMatches(step, event, payload)) return false;

  const before = mission.counters[step.id] || 0;
  const amount = step.kind === "survive" ? Math.max(0, Number(payload.dt) || 0) : 1;
  const after = Math.min(step.count, before + amount);
  mission.counters[step.id] = after;
  mission.p = Math.floor(after);
  if (after >= step.count) {
    mission.step += 1;
    mission.current = mission.step;
    if (mission.step >= mission.steps.length) mission.completed = true;
  }
  emit("mission-progress", { mission, event, payload, player: payload.player });
  if (mission.completed) emit("mission-completed", { mission, player: payload.player });
  return true;
}

/** Advance all missions owned by the event's player. */
export function advanceMissions(event, payload = {}) {
  const profile = profileOf(payload.player);
  let changed = false;
  for (const mission of [...missionsOf(profile)]) changed = advanceMission(mission, event, payload) || changed;
  return changed;
}

export function acceptMission(offer, profile = state.profile) {
  const mission = instantiateMission(offer);
  if (!mission) return undefined;
  missionsOf(profile).push(mission);
  return mission;
}

export function missionAt(indexOrId, profile = state.profile) {
  const list = missionsOf(profile);
  if (typeof indexOrId === "number" || /^\d+$/.test(String(indexOrId ?? ""))) return list[+indexOrId];
  return list.find(mission => mission.id === indexOrId);
}

export function completeMission(indexOrId, profile = state.profile) {
  const mission = missionAt(indexOrId, profile) || missionsOf(profile).find(isMissionComplete);
  if (!mission || !isMissionComplete(mission)) return undefined;
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
  missionsOf(profile).splice(missionsOf(profile).indexOf(mission), 1);
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
on("mission-tick", payload => advanceMissions("mission-tick", payload));
