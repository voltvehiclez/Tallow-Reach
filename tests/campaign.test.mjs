// Step 15: campaign scaffolding. The campaign is its own saved mode and its own
// fixed-seed galaxy; it shares the browser pilot's fleet and credits, but not
// the open world's place, missions or progress.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SAVE_VERSION,
  newCampaignSave,
  newSave,
  ensureShipRecords,
  grantFixedShip,
  separateCampaignPilot,
} from "../src/state/profile.js";
import { generateGalaxy } from "../src/sim/galaxy.js";
import { setPlaceCatalog } from "../src/data/places.js";
import { CAMPAIGN_GALAXY, CAMPAIGN_GALAXY_SEED, CAMPAIGN_HOME_POCKET, CAMPAIGN_HOME_SYSTEM } from "../src/data/campaign/galaxy.js";

const catalog = generateGalaxy(CAMPAIGN_GALAXY_SEED, CAMPAIGN_GALAXY, { places: {}, links: {}, removedPlaces: [], removedLinks: [] });
setPlaceCatalog(catalog);

const { CAMPAIGN_MISSIONS, campaignMission } = await import("../src/data/campaign/index.js");
const { missionErrors } = await import("../src/data/missions/validate.js");

test("campaign galaxy is a separate fixed-seed seven-system world with its own home", () => {
  assert.equal(CAMPAIGN_GALAXY.systemCount, 7);
  assert.equal(catalog.systems.length, 7);
  assert.equal(catalog.systemsById[CAMPAIGN_HOME_SYSTEM].n, "Auric Reach");
  assert.ok(catalog.pocketsById[CAMPAIGN_HOME_POCKET]);
  assert.equal(catalog.pocketsById[CAMPAIGN_HOME_POCKET].def, "auric_flight_school");
  assert.ok(!catalog.pocketsById.reach, "campaign does not contain Meridian Station");
  assert.equal(newCampaignSave().world.naturalWormholes, false);
  assert.equal(newCampaignSave().world.place, CAMPAIGN_HOME_POCKET);
});

test("campaign mission data is separate and clean under the shared linter", () => {
  assert.equal(CAMPAIGN_MISSIONS.length, 1);
  assert.equal(CAMPAIGN_MISSIONS[0].id, "campaign.m01-first-sortie");
  assert.equal(CAMPAIGN_MISSIONS[0].fixedShip, "wasp");
  assert.deepEqual(missionErrors(CAMPAIGN_MISSIONS[0]), []);
  assert.equal(campaignMission("story.border-signal"), null);
});

test("each mode has its own pilot: the open-world fleet and credits never enter the campaign", () => {
  const open = newSave();
  const campaign = newCampaignSave();
  open.profile.cr = 4321;
  open.profile.ships.push("testship");
  ensureShipRecords(open.profile, "testship", "reach");
  open.profile.holds.testship = { salv: 4 };
  open.profile.ship = "testship";
  // The two halves are independent records; wrapping an open save into the
  // envelope must not copy that pilot into the fresh campaign.
  assert.equal(campaign.profile.cr, 600);
  assert.deepEqual(campaign.profile.ships, ["wasp"]);
  assert.equal(campaign.profile.holds.wasp && Object.keys(campaign.profile.holds.wasp).length, 0);
  assert.equal(campaign.profile.ship, "wasp");
  assert.equal(campaign.profile.homeStation, CAMPAIGN_HOME_POCKET);
  // A v26 campaign half is rebuilt as a fresh campaign pilot, keeping completions.
  const migrated = separateCampaignPilot({ cr: 4321, ships: ["wasp", "testship"], campaign: { completed: ["campaign.m01-first-sortie"] } });
  assert.equal(migrated.cr, 600);
  assert.deepEqual(migrated.ships, ["wasp"]);
  assert.deepEqual(migrated.campaign.completed, ["campaign.m01-first-sortie"]);
});

test("a fixed story ship is granted to the pilot and selected for that mode", () => {
  const save = newCampaignSave();
  save.profile.ships = ["prospector"];
  save.profile.ship = "prospector";
  save.profile.holds = { prospector: {} };
  save.profile.hp = { prospector: 1 };
  save.profile.loadout = { prospector: save.profile.loadout.prospector };
  save.profile.shipPlaces = { prospector: CAMPAIGN_HOME_POCKET };
  assert.equal(grantFixedShip(save.profile, "wasp", CAMPAIGN_HOME_POCKET), true);
  assert.deepEqual(save.profile.ships, ["prospector", "wasp"]);
  assert.equal(save.profile.ship, "wasp");
  assert.equal(save.profile.shipPlaces.wasp, CAMPAIGN_HOME_POCKET);
});

test("new dual-mode roots carry open and campaign halves for the same browser save", async () => {
  const { newRootSave } = await import("../src/state/state.js");
  const root = newRootSave();
  assert.equal(root.v, SAVE_VERSION);
  assert.equal(root.mode, "open");
  assert.equal(root.open.profile.homeStation, "reach");
  assert.equal(root.campaign.profile.homeStation, CAMPAIGN_HOME_POCKET);
  assert.equal(root.campaign.world.place, CAMPAIGN_HOME_POCKET);
  assert.equal(root.open.world.naturalWormholes, true);
  assert.equal(root.campaign.world.naturalWormholes, false);
});

test("switching modes swaps worlds, keeps the shared pilot, and preserves campaign progress in the envelope", async () => {
  const { state, applySave, currentRootSave, resetPlaces, newRootSave: freshRoot } = await import("../src/state/state.js");
  const { prepareGalaxySave, switchGameMode } = await import("../src/sim/galaxy-session.js");
  const { createPlayer } = await import("../src/sim/player.js");
  const { configurePlayer } = await import("../src/sim/session.js");
  resetPlaces();
  state.players.length = 0;
  state.localPlayerIndex = 0;
  applySave(prepareGalaxySave(freshRoot()));
  state.profile.cr = 4321;
  state.mode = "open";
  assert.equal(switchGameMode("campaign"), true);
  assert.equal(state.mode, "campaign");
  assert.equal(state.place, CAMPAIGN_HOME_POCKET);
  assert.equal(state.worldState.place, CAMPAIGN_HOME_POCKET);
  assert.equal(state.profile.cr, 600, "the campaign has its own pilot and its own credits");
  const P = configurePlayer(createPlayer(), state.profile);
  P.docked = true;
  P.place = CAMPAIGN_HOME_POCKET;
  state.place = CAMPAIGN_HOME_POCKET;

  const { acceptMission, completeMission } = await import("../src/sim/missions.js");
  const mission = acceptMission(CAMPAIGN_MISSIONS[0], state.profile, CAMPAIGN_HOME_POCKET);
  assert.ok(mission, "Captain Korr's mission starts");
  assert.equal(state.profile.ship, "wasp");
  assert.equal(state.profile.missions.length, 1);

  // Drive the mission record to its finished state; the hand-in path is the same one the player uses.
  mission.step = mission.steps.length;
  mission.current = mission.steps.length;
  mission.completed = true;
  const paid = completeMission(mission.id, state.profile, P);
  assert.match(paid, /Paid 50 cr\./);
  assert.deepEqual(state.profile.campaign.completed, [mission.id]);
  assert.equal(state.profile.missions.length, 0);

  const root = currentRootSave();
  assert.equal(root.campaign.profile.campaign.completed[0], mission.id);
  applySave(prepareGalaxySave(root));
  assert.deepEqual(state.profile.campaign.completed, [mission.id], "campaign completion survives a save round trip");
});

test("M01 can be played from acceptance to the reward hand-in through mission events", async () => {
  const { state, applySave, resetPlaces, newRootSave } = await import("../src/state/state.js");
  const { prepareGalaxySave, switchGameMode } = await import("../src/sim/galaxy-session.js");
  const { createPlayer } = await import("../src/sim/player.js");
  const { configurePlayer } = await import("../src/sim/session.js");
  const { acceptMission, advanceMission, completeMission, missionDialogue, missionObjectivesDone, missionOptionalRows, activeMissions } = await import("../src/sim/missions.js");

  resetPlaces();
  state.players.length = 0;
  state.localPlayerIndex = 0;
  applySave(prepareGalaxySave(newRootSave()));
  switchGameMode("campaign");
  const P = configurePlayer(createPlayer(), state.profile);
  P.docked = true;
  P.place = CAMPAIGN_HOME_POCKET;
  state.place = CAMPAIGN_HOME_POCKET;

  const mission = acceptMission(CAMPAIGN_MISSIONS[0], state.profile, CAMPAIGN_HOME_POCKET);
  assert.equal(mission.id, "campaign.m01-first-sortie");
  assert.equal(P.ship, "wasp");
  assert.equal(mission.optional.length, 1, "the act carries its optional bonus objective");

  const tick = dt => advanceMission(mission, "mission-tick", { dt, player: P }, state.profile);
  const kill = def => advanceMission(mission, "enemy-killed", {
    def, faction: "school", player: P, place: CAMPAIGN_HOME_POCKET,
  }, state.profile);
  const talk = () => {
    for (let guard = 0; guard < 12 && missionDialogue(mission); guard += 1) {
      advanceMission(mission, "dialogue-next", { player: P }, state.profile);
    }
  };
  const learn = (id, control) => {
    assert.equal(mission.steps[mission.step].id, id, `the lesson is on ${id}`);
    assert.equal(advanceMission(mission, "mission-control", { step: id, control, player: P }, state.profile), true);
  };

  talk();                         // graduation briefing (station)
  P.docked = false;               // launch and form up on Korr
  tick(0);

  // The control lesson: Korr calls each control, the pilot performs it.
  const lesson = [
    ["brief-throttle", "learn-throttle", "throttle-forward"],
    [null, "learn-throttle-back", "throttle-back"],
    ["brief-steer", "learn-steer", "steer"],
    ["brief-strafe", "learn-strafe-left", "strafe-left"],
    [null, "learn-strafe-right", "strafe-right"],
    ["brief-lift", "learn-rise", "lift-up"],
    [null, "learn-drop", "lift-down"],
    ["brief-roll", "learn-roll-left", "roll-left"],
    [null, "learn-roll-right", "roll-right"],
    ["brief-boost", "learn-boost", "boost"],
  ];
  for (const [brief, id, control] of lesson) {
    if (brief) talk();
    learn(id, control);
  }
  // Staying with him through the lesson earns the bonus.
  assert.deepEqual(missionOptionalRows(mission).map(row => [row.id, row.done]), [["stay-with-korr", true]]);

  talk();                         // chase orders
  assert.equal(mission.steps[mission.step].id, "chase");
  advanceMission(mission, "mission-chase-complete", { step: "chase", player: P }, state.profile);

  talk();                         // gunnery orders
  tick(0);                        // drones spawn
  kill("practice_drone");
  kill("practice_drone");
  talk();                         // ambush warning
  tick(0);                        // raiders spawn
  kill("raider");
  kill("raider");
  talk();                         // final report

  assert.equal(missionObjectivesDone(mission), true);
  P.docked = true;
  state.place = CAMPAIGN_HOME_POCKET;
  const paid = completeMission(mission.id, state.profile, P);
  assert.equal(paid, "Paid 150 cr.", "the optional bonus is paid with the reward");
  assert.deepEqual(state.profile.campaign.completed, [mission.id]);
  assert.equal(activeMissions(state.profile).length, 0);
});

test("reloading mid-sortie re-arms the wave deficit instead of stranding the pilot", async () => {
  const { state, applySave, resetPlaces, newRootSave, currentRootSave } = await import("../src/state/state.js");
  const { prepareGalaxySave, switchGameMode } = await import("../src/sim/galaxy-session.js");
  const { createPlayer } = await import("../src/sim/player.js");
  const { configurePlayer, resumeFromSave } = await import("../src/sim/session.js");
  const { acceptMission, advanceMission, missionDialogue } = await import("../src/sim/missions.js");
  const { hitHostile } = await import("../src/sim/combat.js");

  resetPlaces();
  state.players.length = 0; state.localPlayerIndex = 0;
  applySave(prepareGalaxySave(newRootSave()));
  switchGameMode("campaign");
  const P = configurePlayer(createPlayer(), state.profile);
  P.place = CAMPAIGN_HOME_POCKET; state.place = CAMPAIGN_HOME_POCKET;

  const mission = acceptMission(CAMPAIGN_MISSIONS[0], state.profile, CAMPAIGN_HOME_POCKET);
  const live = () => state.profile.missions.find(x => x.id === mission.id);
  const talk = () => { const m = live(); for (let i = 0; i < 12 && missionDialogue(m); i++) advanceMission(m, "dialogue-next", { player: state.player }, state.profile); };
  const tick = dt => { const m = live(); return advanceMission(m, "mission-tick", { dt, player: state.player }, state.profile); };
  const drones = () => state.world.enemies.filter(e => e.def === "practice_drone");
  const learn = (id, control) => {
    const m = live();
    advanceMission(m, "mission-control", { step: id, control, player: state.player }, state.profile);
  };

  talk();                      // graduation briefing
  P.docked = false;            // launch; joining the range runs the launch-order script
  tick(0);
  talk();                      // throttle orders
  learn("learn-throttle", "throttle-forward");
  learn("learn-throttle-back", "throttle-back");
  talk();                      // steering
  learn("learn-steer", "steer");
  talk();                      // strafe
  learn("learn-strafe-left", "strafe-left");
  learn("learn-strafe-right", "strafe-right");
  talk();                      // lift
  learn("learn-rise", "lift-up");
  learn("learn-drop", "lift-down");
  talk();                      // roll
  learn("learn-roll-left", "roll-left");
  learn("learn-roll-right", "roll-right");
  talk();                      // boost
  learn("learn-boost", "boost");
  talk();                      // chase orders
  advanceMission(live(), "mission-chase-complete", { step: "chase", player: state.player }, state.profile);
  talk();                      // gunnery orders
  tick(0);                     // clears the drone spawn step
  assert.equal(drones().length, 2, "two practice drones are standing off the range");
  hitHostile(drones()[0], 999, drones()[0].pos, state.player);
  assert.equal(live().counters["drone-drill"], 1);

  // Quit with one drone left alive, then boot the save the way a browser reload does.
  const raw = JSON.parse(JSON.stringify(currentRootSave()));
  resetPlaces();
  state.players.length = 0; state.localPlayerIndex = 0;
  state.galaxyRecovery = null;
  applySave(prepareGalaxySave(raw));
  const P2 = configurePlayer(createPlayer(), state.profile);
  resumeFromSave(P2);          // re-enters the pocket; re-arm fires on undock

  assert.equal(live().steps[live().step].id, "drone-drill");
  assert.equal(live().counters["drone-drill"], 1, "the kill progress survives the reload");
  assert.equal(drones().length, 1, "the missing drone is re-armed, and the living one is not duplicated");
  hitHostile(drones()[0], 999, drones()[0].pos, P2);
  assert.equal(live().counters["drone-drill"], 2, "the objective can be finished after the reload");

  // Finish the rest of the sortie and confirm the mission still pays out.
  talk();                      // ambush warning
  tick(0);                     // clears the pirate spawn step
  for (const raider of [...state.world.enemies.filter(e => e.def === "raider")]) hitHostile(raider, 999, raider.pos, P2);
  talk();                      // final report
  const { completeMission } = await import("../src/sim/missions.js");
  P2.docked = true; state.place = CAMPAIGN_HOME_POCKET; P2.place = CAMPAIGN_HOME_POCKET;
  assert.equal(completeMission(live().id, state.profile, P2), "Paid 150 cr.");
  assert.deepEqual(state.profile.campaign.completed, [mission.id]);
});
