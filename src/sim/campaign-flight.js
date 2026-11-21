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
import { controlHeld, MISSION_CONTROLS, dialogueReadSeconds } from "../data/missions/rules.js";
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

/** The authored hold, in seconds. One second is the campaign's teaching unit:
 *  the HUD bar fills over that second and a full bar is a learned control. */
const holdSeconds = step => Math.max(0.1, Number(step.hold) || 1);

/** Publish the live hold so the HUD can draw the bar under the objective. The
 *  UI owns no timer of its own: this is the same number that finishes the step. */
function publishHold(mission, step, seconds) {
  const total = holdSeconds(step);
  state.ui.controlHold = {
    mission: mission.id,
    step: step.id,
    control: step.control,
    label: MISSION_CONTROLS[step.control]?.label || step.control,
    fraction: Math.max(0, Math.min(1, seconds / total)),
    percent: Math.min(100, Math.floor((seconds / total) * 100)),
  };
}

function clearHold() {
  state.ui.controlHold = null;
}

function tickControl(mission, step, player, dt) {
  const key = `${mission.id}:${step.id}`;
  if (hold.key !== key) hold = { key, seconds: 0 };
  if (controlHeld(player.controls || state.controls, step.control)) {
    hold.seconds += Math.max(0, Number(dt) || 0);
    if (hold.seconds >= holdSeconds(step)) {
      const control = step.control;
      hold = { key: "", seconds: 0 };
      clearHold();
      emit("mission-control", { mission: mission.id, step: step.id, control, player, profile: state.profile });
      return;
    }
  } else {
    hold.seconds = Math.max(0, hold.seconds - Math.max(0, Number(dt) || 0) * 2);
  }
  publishHold(mission, step, hold.seconds);
}

// ---- chase -----------------------------------------------------------------
function tickChase(mission, step, player, dt = 0) {
  const actor = storyActors(mission, player.place || state.place).find(e => e.def === step.follow);
  if (!actor) return;
  const gap = player.pos.distanceTo(actor.pos);
  const course = actor.course;
  if (!course) return;
  // Too far behind while he is running: not a failure — he slows to a stop,
  // says the reset line, and only then turns for the fixed start.
  if (course.mode === "run" && gap > Number(step.maxGap || 1000)) {
    course.mode = "reset-brake";
    course.talkStarted = false;
  }
  if (course.mode === "reset-talk") {
    if (!course.talkStarted) {
      course.talkStarted = true;
      const line = step.resetLine || "";
      course.talkLeft = dialogueReadSeconds(line);
      state.ui.resetDialogue = {
        mission: mission.id,
        title: mission.title,
        speaker: step.speaker || "Captain Dane Korr",
        portrait: step.portrait || "captain-dane-korr",
        line,
      };
      emit("mission-reset", {
        mission: mission.id, step: step.id, line, player, profile: state.profile,
      });
    } else {
      course.talkLeft = Math.max(0, (course.talkLeft || 0) - Math.max(0, Number(dt) || 0));
      if (course.talkLeft <= 0) {
        course.talkStarted = false;
        state.ui.resetDialogue = null;
        course.mode = "return";
        emit("mission-ui-refresh", {});
      }
    }
  }
  const running = course.mode === "run";
  // Before the run starts (or while resetting back to the start) he waits for
  // the pilot to form up at the fixed start.
  const gathering = course.mode !== "run";
  state.ui.chaseRun = {
    mission: mission.id,
    gathering,
    gap: Math.round(gap),
    gather: Number(step.gather) || 0,
    maxGap: Number(step.maxGap) || 1000,
  };
  // The bonus is a rule of the run: it is not decided while he is still waiting.
  if (running) {
    state.ui.followDistance = Math.round(gap);
    emit("mission-near", { actor: step.follow || step.target, metres: gap, player, profile: state.profile });
  }
  const distance = Number(step.distance) || course.total;
  if (course.mode === "done" || course.travelled >= distance - 1) {
    state.ui.resetDialogue = null;
    emit("mission-chase-complete", { mission: mission.id, step: step.id, player, profile: state.profile });
  }
}

// ---- actor roles -----------------------------------------------------------
function applyActorRoles(mission, step, player) {
  if (!step || (!step.actor && !step.actorRole && !step.course && step.kind !== "kill")) return;
  const place = player?.place || state.place;
  for (const actor of storyActors(mission, place)) {
    if (step.actor && step.actor !== actor.def) continue;
    if (step.actorRole && actor.role !== step.actorRole) actor.role = step.actorRole;
    if (step.course) {
      const phase = step.coursePhase || "lesson";
      if (!actor.course || actor.course.id !== step.course || actor.course.phase !== phase) {
        actor.course = startCourseAtBeginning(step.course, phase);
      }
      // How close the pilot must be to the waiting ship before the course runs.
      if (Number(step.gather) > 0) actor.course.gather = Number(step.gather);
    }
  }
  // Once a kill step begins, any wave that was prowling during the dialogue
  // goes into aggressive AI and attacks.
  if (step.kind === "kill") {
    const tag = `mission:${mission.id}`;
    for (const enemy of placeWorld(place).enemies) {
      if (!enemy || enemy.encounter !== tag || enemyDef(enemy.def).friendly === true) continue;
      if (step.enemy && enemy.def !== step.enemy) continue;
      if (enemy.role === "prowl") enemy.role = null;
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
  if (!mission || mission.failed) {
    clearHold();
    state.ui.followDistance = null;
    return;
  }
  const step = currentStep(mission);
  if (!step) {
    clearHold();
    return;
  }
  if (step.kind !== "control") clearHold();
  if (step.kind !== "chase") {
    state.ui.chaseRun = null;
    state.ui.resetDialogue = null;
  }
  if (step.kind !== "chase" && step.kind !== "kill" && step.kind !== "parallel") state.ui.followDistance = null;
  const place = player.place || state.place;
  ensureStoryActors(mission, player, place);
  if (player.docked) return;
  applyActorRoles(mission, step, player);
  if (step.kind === "control") tickControl(mission, step, player, dt);
  else if (step.kind === "chase") tickChase(mission, step, player, dt);
  else if (step.kind === "kill" || step.kind === "parallel") {
    // Keep the optional distance bonus honest during drills and ambushes too.
    const actor = step.actor
      ? storyActors(mission, place).find(e => e.def === step.actor)
      : null;
    if (actor) {
      const gap = player.pos.distanceTo(actor.pos);
      state.ui.followDistance = Math.round(gap);
      emit("mission-near", { actor: actor.def, metres: gap, player, profile: state.profile });
    }
  }
});

// A fresh act must not inherit a half-finished hold.
on("campaign-act-started", () => {
  hold = { key: "", seconds: 0 };
  actorSpawnedAt.clear();
  actorCheckAt = 0;
  clearHold();
  state.ui.followDistance = null;
  state.ui.chaseRun = null;
  state.ui.resetDialogue = null;
});

on("mission-progress", ({ mission, player } = {}) => {
  const active = mission && activeCampaignMission(state.profile)?.id === mission.id ? mission : null;
  if (!active || active.failed) return;
  const P = player || state.player;
  if (!P || P.docked || P.dead) return;
  applyActorRoles(active, currentStep(active), P);
});
