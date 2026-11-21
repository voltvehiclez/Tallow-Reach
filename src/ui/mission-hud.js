// The extra lines a campaign act puts under its objective in the top-right HUD
// block: the control lesson's hold bar, and the run's own rule (stay within 1 km,
// bonus within 500 m). Pure HTML — no DOM, no three.js — so it is tested directly
// and the HUD only decides when to show it.

import {
  activeMissions,
  isMissionFailed,
  missionBonusStatus,
  missionHandInStation,
  missionObjectivesDone,
  missionOfferStation,
  missionReadyForHandIn,
  missionStep,
} from "../sim/missions.js";
import { isCampaignMissionId } from "../sim/campaign.js";
import { enemyDef } from "../data/enemies.js";
import { courseDef } from "../data/flight-courses.js";
import { featureById, isPocket, placeAt, systemOf } from "../data/places.js";
import { state } from "../state/state.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[c]));

// Only a colour that cannot break out of an inline style is ever rendered.
const SAFE_COLOR = /^(#[0-9a-fA-F]{3,8}|(?:rgb|rgba|hsl|hsla)\([0-9.,%\s/]+\)|var\(--[a-z0-9-]+\))$/;

/** A hold bar as a percentage: a full bar is one learned control. */
export function holdBarHtml(hold) {
  if (!hold) return "";
  const percent = Math.round(Math.max(0, Math.min(1, Number(hold.fraction) || 0)) * 100);
  return `<small class="hud-hold"><span class="hold-label">${esc(hold.label || "")}</span>` +
    `<span class="hold-track"><i style="width:${percent}%"></i></span><b>${percent}%</b></small>`;
}

/** The run's rule, and the still-live bonus (or live distance once the bonus is gone), directly under the objective. */
export function chaseLinesHtml(run, mission) {
  if (!run) return "";
  const gapLimit = Number(run.maxGap) > 0 ? Number(run.maxGap) : 1000;
  const limit = gapLimit % 1000 === 0 ? `${gapLimit / 1000} km` : `${gapLimit} m`;
  const rule = run.gathering
    ? `Close to within ${Math.round(Number(run.gather) || 300)} m of Dane to start the run.`
    : `Stay within ${limit} of Dane for the whole course to pass.`;
  // While he waits for the form-up there is no distance to judge. Once the run is
  // live, keep the live distance readout on screen even after the 500 m bonus is
  // lost, because the pilot still needs to stay within the 1 km pass mark.
  const liveGap = !run.gathering && Number.isFinite(Number(run.gap))
    ? Math.max(0, Math.round(Number(run.gap)))
    : null;
  const bonus = missionBonusStatus(mission, liveGap);
  const bonusLine = bonus
    ? `<small class="hud-bonus${bonus.over ? " is-over" : ""}">Bonus: within ${bonus.limit} m` +
      `${bonus.metres == null || run.gathering ? "" : ` · now ${bonus.metres} m`}</small>`
    : liveGap != null
      ? `<small class="hud-bonus${liveGap > gapLimit ? " is-over" : ""}">Distance to Dane: now ${liveGap} m</small>`
      : "";
  return `<small class="hud-chase">${esc(rule)}</small>${bonusLine}`;
}

/** Every extra line this act adds under its objective, in order. */
export function campaignDetailHtml(mission, { hold = null, run = null } = {}) {
  if (!mission || !isCampaignMissionId(mission.id)) return "";
  return `${hold && hold.mission === mission.id ? holdBarHtml(hold) : ""}` +
    `${run && run.mission === mission.id ? chaseLinesHtml(run, mission) : ""}`;
}

/**
 * CSS color matching the mission title in the top-right HUD (`#tr .hud-mission`):
 * amber/yellow (`var(--amber)`) for campaign acts and story missions, bluish
 * (`var(--ice)`) for contracts, and defaulting to `var(--amber)` (or a custom
 * `titleColor` / `color` on the mission) for any future mission types.
 */
export function missionTitleColor(mission) {
  if (!mission || typeof mission !== "object") return "var(--amber)";
  // A mission record can arrive from an imported save, so only a plain colour
  // value ever reaches an inline style.
  const custom = [mission.titleColor, mission.color]
    .find(value => typeof value === "string" && SAFE_COLOR.test(value.trim()));
  if (custom) return custom.trim();
  return mission.kind === "contract" ? "var(--ice)" : "var(--amber)";
}

/** Active objective step(s) for a mission, unwrapping parallel steps and looking
 *  past an in-space radio briefing to the wave kill step that was just spawned. */
export function activeObjectiveSteps(mission) {
  if (!mission || isMissionFailed(mission) || missionObjectivesDone(mission)) return [];
  const step = missionStep(mission);
  if (!step) return [];
  if (step.kind === "parallel") {
    return (step.steps || []).filter(child => {
      if (!child) return false;
      const done = Number(mission.counters?.[`${step.id}:${child.id}`] ?? mission.counters?.[child.id]) || 0;
      return done < Math.max(1, Number(child.count) || 1);
    });
  }
  // A glow means "this needs you now". A dialogue step therefore never looks
  // ahead to the wave it spawned: the drones it is *talking about* light up
  // only when the step that orders the kill is the current step.
  return [step];
}

function orderedActiveMissions(missions, profile) {
  const list = Array.isArray(missions) ? missions : activeMissions(profile);
  const story = [], contracts = [];
  for (const m of list) {
    if (!m || isMissionFailed(m)) continue;
    if (m.kind === "contract") contracts.push(m);
    else story.push(m);
  }
  return [...story, ...contracts];
}

/**
 * Return the glowing objective highlight color (`var(--amber)`, `var(--ice)`,
 * etc.) if `object` is an active mission target in `place`, or `""` otherwise.
 */
export function objectObjectiveColor(object, kind = "", options = {}) {
  if (!object) return "";
  const profile = options.profile || state.profile;
  const place = options.place || state.place;
  const worldState = options.worldState || state.worldState;
  const missions = orderedActiveMissions(options.missions, profile);

  const isStation = kind === "station" || kind === "s" || object.kind === "station";
  const isCrate = kind === "Cargo" || kind === "crate" || kind === "c" || object.kind === "crate";
  const isBeltGroup = Array.isArray(object.members) && object.main;
  const isField = isBeltGroup || kind === "asteroidField" || object.kind === "asteroidField";
  const isRock = kind === "Asteroid" || (object.type && object.ore !== undefined);
  const isShip = !isStation && !isCrate && !isField && !isRock &&
    (kind === "Hostile" || kind === "Ship" || kind === "enemy" || kind === "e" || typeof object.def === "string");

  for (const mission of missions) {
    const color = missionTitleColor(mission);
    const done = missionObjectivesDone(mission);
    const readyHandIn = missionReadyForHandIn(mission, profile, worldState);
    const steps = activeObjectiveSteps(mission);

    if (isStation) {
      if ((done || readyHandIn) && missionHandInStation(mission) === place) return color;
      for (const step of steps) {
        if (step.requiresDock === true && (step.place || missionOfferStation(mission)) === place) return color;
        if (step.kind === "deliver" && (step.target === "station" || step.target === place || step.place === place)) return color;
        if (step.kind === "dock" && step.place === place) return color;
        if (step.kind === "script") {
          const actions = Array.isArray(step.actions) ? step.actions : step.action ? [step.action] : [];
          if (actions.some(a => a?.kind === "give-item" || a?.kind === "take-item") && (!step.place || step.place === place)) {
            return color;
          }
        }
      }
      continue;
    }

    if (isShip) {
      const friendly = object.friendly === true || enemyDef(object.def)?.friendly === true;
      if (friendly) {
        // A friendly story ship glows only when the live objective is to fly
        // with it (a chase). During control lessons, briefings, drone drills
        // and the ambush it is company, not a target: no glow.
        for (const step of steps) {
          if (step.kind === "chase" &&
              (step.follow === object.def || step.actor === object.def) &&
              (!step.place || step.place === place)) {
            return color;
          }
        }
      } else if (object.hp === undefined || object.hp > 0) {
        for (const step of steps) {
          if (step.kind === "kill") {
            const reqPlace = step.place || step.sector;
            if (reqPlace && reqPlace !== place) continue;
            if (step.enemy && object.def && object.def !== step.enemy) continue;
            if (step.faction && object.f && object.f !== step.faction) continue;
            const enc = String(object.encounter || "");
            if (mission.kind !== "contract" && enc.startsWith("mission:") && enc !== `mission:${mission.id}`) continue;
            return color;
          }
          if (step.kind === "wait" && step.trigger === "wave-clear" && object.encounter === `mission:${mission.id}`) {
            return color;
          }
        }
      }
      continue;
    }

    if (isCrate) {
      if (!done && object.missionId === mission.id && object.persistent) return color;
      if (!done && !readyHandIn) {
        for (const step of steps) {
          if (step.kind !== "collect") continue;
          const reqPlace = step.place || step.sector;
          if (reqPlace && reqPlace !== place) continue;
          if (step.owned === true || step.missionItem === true) {
            if (object.missionId === mission.id && (!step.item || object.item === step.item)) return color;
          } else if (!step.item || object.item === step.item) {
            return color;
          }
        }
      }
      continue;
    }

    if (isField || isRock) {
      if (!done && !readyHandIn) {
        for (const step of steps) {
          if (step.kind !== "mine") continue;
          const reqPlace = step.place || step.sector;
          if (reqPlace && reqPlace !== place) continue;
          if (isBeltGroup) {
            if (object.members.some(f => !step.item || f?.ore === step.item)) return color;
          } else if (isField) {
            if (!step.item || object.ore === step.item) return color;
          } else if (isRock) {
            if (!step.item || object.type === step.item) return color;
          }
        }
      }
    }
  }
  return "";
}

/**
 * The pockets (and their systems) active missions currently want the pilot
 * to warp to: one entry per destination pocket, in the mission's own colour.
 * A destination drops off the moment the pilot is there, and returns if they
 * warp away again — this is recomputed from the live mission state, exactly
 * like the in-space Waypoint labels. The starmap rings these on both charts.
 */
export function missionTravelTargets(options = {}) {
  const profile = options.profile || state.profile;
  const place = options.place || state.place;
  const worldState = options.worldState || state.worldState;
  const missions = orderedActiveMissions(options.missions, profile);
  const out = [];
  const seen = new Set();
  const push = (placeId, color, missionId) => {
    if (!placeId || placeId === place || !isPocket(placeId) || seen.has(placeId)) return;
    seen.add(placeId);
    out.push({ place: placeId, system: systemOf(placeId), color, missionId });
  };
  for (const mission of missions) {
    const color = missionTitleColor(mission);
    const done = missionObjectivesDone(mission);
    const readyHandIn = missionReadyForHandIn(mission, profile, worldState);
    if (done || readyHandIn) {
      push(missionHandInStation(mission), color, mission.id);
      continue;
    }
    for (const step of activeObjectiveSteps(mission)) {
      const stepPlace = step.place || step.sector ||
        (step.kind === "reach" || step.kind === "reach-sector" ? step.target : null);
      push(stepPlace, color, mission.id);
    }
  }
  return out;
}

/**
 * Spatial waypoints (`{ id, label, pos: [x, y, z], color, missionId }`) for
 * active missions that require flying to a point or destination in space.
 */
export function missionWaypoints(options = {}) {
  const profile = options.profile || state.profile;
  const place = options.place || state.place;
  const world = options.world || state.world;
  const worldState = options.worldState || state.worldState;
  const missions = orderedActiveMissions(options.missions, profile);
  const out = [];
  const seenPos = new Set();

  const pushWaypoint = (id, label, pos, color, missionId) => {
    if (!Array.isArray(pos) || pos.length !== 3 || !pos.every(Number.isFinite)) return;
    const key = `${Math.round(pos[0])}:${Math.round(pos[1])}:${Math.round(pos[2])}`;
    if (seenPos.has(key)) return;
    seenPos.add(key);
    out.push({ id, label, pos: [pos[0], pos[1], pos[2]], color, missionId });
  };

  for (const mission of missions) {
    const color = missionTitleColor(mission);
    const done = missionObjectivesDone(mission);
    const readyHandIn = missionReadyForHandIn(mission, profile, worldState);
    const steps = activeObjectiveSteps(mission);

    // A destination in ANOTHER pocket gets no waypoint here: a marker planted
    // at a fixed local point would claim the station is a few kilometres away
    // inside a pocket it is not in. Cross-pocket destinations belong to the
    // starmap, which rings them (missionTravelTargets). Only points in THIS
    // pocket — an authored waypoint, a step position, a course start, a
    // signal — are marked in the ship UI.
    if (done || readyHandIn) continue;

    for (const step of steps) {
      const stepPlace = step.place || step.sector ||
        (step.kind === "reach" || step.kind === "reach-sector" ? step.target : null);
      if (stepPlace && stepPlace !== place && isPocket(stepPlace)) continue;

      if (Array.isArray(step.waypoint) && step.waypoint.length === 3) {
        pushWaypoint(`${mission.id}:${step.id}:wp`, step.waypointLabel || "Waypoint", step.waypoint, color, mission.id);
        continue;
      }
      if (Array.isArray(step.pos) && step.pos.length === 3) {
        pushWaypoint(`${mission.id}:${step.id}:pos`, step.waypointLabel || "Waypoint", step.pos, color, mission.id);
        continue;
      }

      if (step.kind === "chase" && (!stepPlace || stepPlace === place)) {
        const leader = (world?.enemies || []).find(e => e && e.def === (step.follow || step.actor));
        const courseStart = leader?.course?.start
          ? [leader.course.start.x, leader.course.start.y, leader.course.start.z]
          : courseDef(step.course)?.[step.coursePhase || "lesson"]?.start || courseDef(step.course)?.start;
        if (courseStart && (!leader?.course || leader.course.mode !== "run")) {
          const leaderAtStart = leader?.pos &&
            Math.hypot(leader.pos.x - courseStart[0], leader.pos.y - courseStart[1], leader.pos.z - courseStart[2]) < 50;
          if (!leaderAtStart) {
            pushWaypoint(`${mission.id}:${step.id}:start`, "Course start", courseStart, color, mission.id);
          }
        }
        continue;
      }

      if ((step.kind === "reach" || step.kind === "survive" || (step.kind === "wait" && !step.trigger)) &&
          (!stepPlace || stepPlace === place)) {
        const feature = (step.feature || step.anchor) ? featureById(place, step.feature || step.anchor) : null;
        const pos = feature?.pos || placeAt(place)?.enter?.pos || [0, 0, 0];
        pushWaypoint(`${mission.id}:${step.id}:reach`, step.waypointLabel || feature?.n || "Signal", pos, color, mission.id);
      }
    }
  }
  return out;
}
