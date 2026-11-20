// Campaign flight beats: the parts of a story act that need the pilot's actual
// controls and position, not a menu.
//
//  * `control` steps finish when the pilot holds the authored control (data
//    names the control; data/missions/rules.js says how it is read).
//  * `chase` steps finish when the story ship has flown its whole authored
//    course. Falling too far behind is a natural reset: the contact says the
//    authored line, returns to the fixed start and the same objective is redone.
//  * a step may name a story actor and a role, so the same friendly hull leads a
//    lesson, watches a drill and joins an ambush.
//  * a story actor that vanishes (reload, leaving the pocket, a bug) is brought
//    back from its authored `spawn-ship` script, never duplicated.

import { on, emit } from "../util/events.js";
import { state, placeWorld } from "../state/state.js";
import { isPocket } from "../data/places.js";
import { enemyDef } from "../data/enemies.js";
import { controlHeld } from "../data/missions/rules.js";
import { activeCampaignMission } from "./campaign.js";
import { missionRespawnActions } from "./missions.js";
import { startCourseAtBeginning } from "./flight-course.js";

const storyActors = (mission, place) =>
  placeWorld(place).enemies.filter(e => e && e.encounter === `mission:${mission.id}` && enemyDef(e.def).friendly === true);

const currentStep = mission => mission?.steps?.[mission.step] || null;

// ---- control lesson --------------------------------------------------------
// One hold at a time, keyed to the mission and step, so a reset or a new act
// cannot inherit half a hold. A dip of the stick drains the timer instead of
// throwing the whole attempt away.
let hold = { key: "", seconds: 0 };

function tickControl(mission, step, player, dt) {
  const key = `${mission.id}:${step.id}`;
  if (hold.key !== key) hold = { key, seconds: 0 };
  if (controlHeld(player.controls || state.controls, step.control)) {
    hold.seconds += Math.max(0, Number(dt) || 0);
    if (hold.seconds >= Math.max(0.1, Number(step.hold) || 3)) {
      const control = step.control;
      hold = { key: "", seconds: 0 };
      emit("mission-control", { mission: mission.id, step: step.id, control, player, profile: state.profile });
    }
  } else {
    hold.seconds = Math.max(0, hold.seconds - Math.max(0, Number(dt) || 0) * 2);
  }
}

// ---- chase -----------------------------------------------------------------
function tickChase(mission, step, player) {
  const actor = storyActors(mission, player.place || state.place).find(e => e.def === step.follow);
  if (!actor) return;
  const gap = player.pos.distanceTo(actor.pos);
  emit("mission-near", { actor: step.target, metres: gap, player, profile: state.profile });
  const course = actor.course;
  if (!course) return;
  // Too far behind while he is running: not a failure — he turns for the fixed
  // start, the line is said and the objective is flown again.
  if (course.mode === "run" && gap > Number(step.maxGap || 1000)) {
    course.mode = "return";
    emit("mission-reset", {
      mission: mission.id, step: step.id, line: step.resetLine || "", player, profile: state.profile,
    });
  }
  const distance = Number(step.distance) || course.total;
  if (course.mode === "done" || course.travelled >= distance - 1) {
    emit("mission-chase-complete", { mission: mission.id, step: step.id, player, profile: state.profile });
  }
}

// ---- actor roles -----------------------------------------------------------
function applyActorRoles(mission, step, player) {
  if (!step || (!step.actor && !step.actorRole && !step.course)) return;
  const place = player.place || state.place;
  for (const actor of storyActors(mission, place)) {
    if (step.actor && step.actor !== actor.def) continue;
    if (step.actorRole && actor.role !== step.actorRole) actor.role = step.actorRole;
    if (step.course) {
      const phase = step.coursePhase || "lesson";
      if (!actor.course || actor.course.id !== step.course || actor.course.phase !== phase) {
        actor.course = startCourseAtBeginning(step.course, phase);
      }
    }
  }
}

// ---- bringing a story actor back ------------------------------------------
// The authored spawn is the only source of truth for where he belongs, so a
// reload or a walk out of the pocket re-creates him exactly as the act asked.
let actorCheckAt = 0;
const actorSpawnedAt = new Map();

function ensureStoryActors(mission, player, place) {
  if (!player || player.docked || player.dead || player.warp || state.loading || player.loading) return;
  if (!isPocket(place)) return;
  const now = performance.now();
  if (now - actorCheckAt < 1000) return;
  actorCheckAt = now;
  for (const action of missionRespawnActions(mission)) {
    if (action.story !== true) continue;
    const enemy = action.enemy || action.ship;
    if (!enemy || !enemyDef(enemy).friendly) continue;
    const alive = placeWorld(place).enemies.some(e => e && e.def === enemy && e.encounter === `mission:${mission.id}`);
    if (alive) continue;
    const key = `${mission.id}:${enemy}`;
    if (now - (actorSpawnedAt.get(key) || 0) < 6000) continue;
    actorSpawnedAt.set(key, now);
    emit("mission-script", {
      mission,
      action: { ...action, kind: "spawn-ship", enemy, count: 1, place },
      place, player, profile: state.profile,
    });
  }
}

// ---- per tick --------------------------------------------------------------
on("mission-tick", ({ dt, player } = {}) => {
  if (!player || player.dead || player.warp) return;
  const mission = activeCampaignMission(state.profile);
  if (!mission || mission.failed) return;
  const step = currentStep(mission);
  if (!step) return;
  const place = player.place || state.place;
  ensureStoryActors(mission, player, place);
  if (player.docked) return;
  applyActorRoles(mission, step, player);
  if (step.kind === "control") tickControl(mission, step, player, dt);
  else if (step.kind === "chase") tickChase(mission, step, player);
  else if (step.kind === "kill" || step.kind === "parallel") {
    // Keep the optional distance bonus honest during drills and ambushes too.
    const actor = step.actor
      ? storyActors(mission, place).find(e => e.def === step.actor)
      : null;
    if (actor) emit("mission-near", { actor: actor.def, metres: player.pos.distanceTo(actor.pos), player, profile: state.profile });
  }
});

// A fresh act must not inherit a half-finished hold.
on("campaign-act-started", () => { hold = { key: "", seconds: 0 }; actorSpawnedAt.clear(); actorCheckAt = 0; });
