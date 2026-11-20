// Campaign act lifecycle: start an act, resume it, restart it, and finish it.
//
// An act is not a job: it has no offer, no Accept and no Abandon. The campaign
// screen starts it, the pilot plays it to its last objective, and the reward and
// the "mission accomplished" card happen by themselves. This module owns those
// transitions so no screen has to know how a mission record is built.

import { state, currentRootSave, applySave, saveCurrentGame, resetPlaces } from "../state/state.js";
import { newCampaignSave } from "../state/profile.js";
import { campaignAct, campaignMission, isCampaignMissionId, activeCampaignMission } from "./campaign.js";
import { prepareGalaxySave, switchGameMode } from "./galaxy-session.js";
import { resumeFromSave } from "./session.js";
import {
  acceptMission,
  atMissionHandInStation,
  canCollectMissionReward,
  completeMission,
  isMissionFailed,
  missionObjectivesDone,
  resumeMissionAtCheckpoint,
} from "./missions.js";
import { emit, on } from "../util/events.js";

/** Where an act begins: its authored station, else the campaign home pocket. */
export function campaignActPlace(definition) {
  return definition?.offeredAt || definition?.origin || null;
}

/**
 * Start, resume or restart an act.
 *
 *   resume  the act is already the active mission and `restart` is false: the
 *           saved world is loaded as it stands (nothing is reset).
 *   start   fresh act world, fresh mission, the pilot docked where the act begins.
 *   restart the same as start, but allowed for an act that is already running;
 *           this is what "start from the beginning" does after a failure.
 *
 * Returns `{ ok, mode: "resume" | "start", message }`.
 */
export function startCampaignAct(actIdOrMission, { restart = false, checkpoint = null } = {}) {
  const act = campaignAct(actIdOrMission);
  const definition = act ? campaignMission(act.mission) : null;
  if (!act || !definition) return { ok: false, mode: null, message: "That campaign act does not exist." };
  const place = campaignActPlace(definition);
  if (!place) return { ok: false, mode: null, message: "That campaign act has no starting place." };

  if (state.mode !== "campaign") switchGameMode("campaign");

  const running = activeCampaignMission();
  if (running && running.id === definition.id && !restart && !isMissionFailed(running)) {
    // The saved world already holds this act; just show it again.
    const P = state.player;
    if (P) resumeFromSave(P);
    saveCurrentGame();
    return { ok: true, mode: "resume", message: "" };
  }

  // A fresh act: keep the campaign pilot (their credits, fleet and fit are this
  // mode's own), throw away this act's world and any campaign mission still
  // running, then install the authored starting pocket.
  const root = currentRootSave();
  const half = root.campaign;
  half.profile.missions = (Array.isArray(half.profile.missions) ? half.profile.missions : [])
    .filter(mission => !isCampaignMissionId(mission?.id));
  half.world = newCampaignSave().world;
  half.world.place = place;
  half.world.resume = null;
  root.mode = "campaign";
  applySave(prepareGalaxySave(root));
  // The new act's pocket must be built from the new save, not the pocket the
  // previous act left behind in the session cache.
  resetPlaces();
  state.place = place;

  const P = state.player;
  if (P) {
    P.place = place;
    P.docked = true;
    resumeFromSave(P);
  }
  const mission = acceptMission(definition, state.profile, place);
  // "Start from last checkpoint": the act itself restarts clean, then the runner
  // puts the fresh mission back on the step the checkpoint named.
  if (checkpoint && mission) resumeMissionAtCheckpoint(mission, checkpoint, state.profile);
  saveCurrentGame();
  emit("campaign-act-started", { act, mission: activeCampaignMission() });
  return { ok: true, mode: "start", message: "" };
}

/** Restart the running act from the beginning (used by the failure screen). */
export function restartCampaignAct(actIdOrMission = null, { checkpoint = null } = {}) {
  const running = activeCampaignMission();
  const id = actIdOrMission || running?.id;
  if (!id) return { ok: false, mode: null, message: "There is no campaign act to restart." };
  return startCampaignAct(id, { restart: true, checkpoint });
}

/** Finish the act the moment its objectives are met. An act has no hand-in
 * screen: if it owes goods, the station hand-in still has to be possible, then
 * the reward, the completion record and the "accomplished" card follow. */
const finishing = new Set();

function finishActIfReady(mission) {
  if (state.mode !== "campaign" || !mission || !isCampaignMissionId(mission.id)) return;
  if (finishing.has(mission.id) || isMissionFailed(mission) || !missionObjectivesDone(mission)) return;
  if (!canCollectMissionReward(mission, state.profile) || !atMissionHandInStation(mission)) return;
  finishing.add(mission.id);
  try {
    completeMission(mission.id, state.profile, null);
  } finally {
    finishing.delete(mission.id);
  }
}

on("mission-progress", ({ mission } = {}) => finishActIfReady(mission));
on("mission-objectives-done", ({ mission } = {}) => finishActIfReady(mission));
on("docked", ({ player } = {}) => {
  if (player && state.player && player !== state.player) return;
  finishActIfReady(activeCampaignMission());
});

// The campaign screen shows its own card when this fires; it also carries the
// reward the act paid, because an act has no collect-reward step.
on("mission-rewarded", ({ mission, reward } = {}) => {
  if (!mission || !isCampaignMissionId(mission.id)) return;
  const act = campaignAct(mission.id);
  emit("campaign-act-completed", { mission, act, reward: Math.max(0, Math.floor(+reward || 0)) });
});
