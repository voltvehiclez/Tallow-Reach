// Playtest round 4: missiles in the First Sortie, the two-wave gunnery pass, the
// ambush standoff and the universal mission objective markers/highlights.
//
// The marker helpers are pure (`src/ui/mission-hud.js`), the pocket rows are pure
// HTML (`src/ui/pocket-list.js`), and the rest is the real simulation.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { generateGalaxy } from "../src/sim/galaxy.js";
import { setPlaceCatalog } from "../src/data/places.js";
import { CAMPAIGN_GALAXY, CAMPAIGN_GALAXY_SEED, CAMPAIGN_HOME_POCKET } from "../src/data/campaign/galaxy.js";

const catalog = generateGalaxy(CAMPAIGN_GALAXY_SEED, CAMPAIGN_GALAXY, { places: {}, links: {}, removedPlaces: [], removedLinks: [] });
setPlaceCatalog(catalog);

const { CAMPAIGN_MISSIONS } = await import("../src/data/campaign/index.js");
const { MODULES } = await import("../src/data/modules.js");
const { newCampaignSave, separateCampaignPilot, newProfile } = await import("../src/state/profile.js");
const { acceptMission, advanceMission, missionDialogue } = await import("../src/sim/missions.js");
const { state, applySave, resetPlaces, newRootSave, placeWorld } = await import("../src/state/state.js");
const { prepareGalaxySave, switchGameMode } = await import("../src/sim/galaxy-session.js");
const { createPlayer } = await import("../src/sim/player.js");
const { configurePlayer } = await import("../src/sim/session.js");
const { spawnEnemy, updateEnemies } = await import("../src/sim/ai.js");
const { emit, on } = await import("../src/util/events.js");
const { V } = await import("../src/util/math.js");
const { pocketRowsHtml } = await import("../src/ui/pocket-list.js");
const { missionTitleColor, activeObjectiveSteps, objectObjectiveColor, missionWaypoints } =
  await import("../src/ui/mission-hud.js");
// Registers the campaign's mission-tick beats (hold timer, chase, missile top-up).
await import("../src/sim/campaign-flight.js");

const m01 = CAMPAIGN_MISSIONS[0];

/** A running campaign with the local pilot flying in the school pocket. */
async function campaignWorld() {
  resetPlaces();
  state.players.length = 0;
  state.localPlayerIndex = 0;
  applySave(prepareGalaxySave(newRootSave()));
  switchGameMode("campaign");
  const P = configurePlayer(createPlayer(), state.profile);
  P.docked = false;
  P.place = CAMPAIGN_HOME_POCKET;
  state.place = CAMPAIGN_HOME_POCKET;
  const mission = acceptMission(m01, state.profile, CAMPAIGN_HOME_POCKET);
  return { P, mission, world: placeWorld(CAMPAIGN_HOME_POCKET) };
}

test("the campaign pilot leaves the school with Basic Missiles fitted and full", () => {
  for (const profile of [newCampaignSave().profile, separateCampaignPilot(newProfile())]) {
    assert.equal(profile.loadout.wasp.secondary[0], "missile_basic", "the starter Wasp carries the missile pod");
    assert.equal(profile.msl, MODULES.missile_basic.cap, "and a full rack");
  }
  // The open-world pilot is untouched: this is the campaign's own loadout.
  assert.equal(newProfile().loadout.wasp.secondary[0], null);
  assert.equal(newProfile().msl, 0);
});

test("accepting First Sortie fits the missiles on the live ship too", async () => {
  const { P } = await campaignWorld();
  assert.equal(state.profile.loadout.wasp.secondary[0], "missile_basic");
  assert.equal(P.missileStock, MODULES.missile_basic.cap, "the flying ship's rack is filled");
  assert.ok(P.missiles.some(m => m.id === "missile_basic"), "and the launcher is fitted on the live ship");
});

test("the gunnery pass is two waves: primary weapons, then secondary weapons", () => {
  const order = m01.steps.map(step => step.id);
  assert.ok(order.indexOf("spawn-drones") < order.indexOf("drone-brief"), "the first wave spawns before its briefing");
  assert.ok(order.indexOf("drone-brief") < order.indexOf("drone-drill"));
  assert.ok(order.indexOf("drone-drill") < order.indexOf("spawn-missile-drones"), "the second wave follows the first drill");
  assert.ok(order.indexOf("spawn-missile-drones") < order.indexOf("missile-brief"));
  assert.ok(order.indexOf("missile-brief") < order.indexOf("missile-drill"));
  assert.ok(order.indexOf("missile-drill") < order.indexOf("spawn-ambush"), "the ambush still comes last");

  assert.equal(m01.steps.find(s => s.id === "drone-drill").count, 2);
  assert.equal(m01.steps.find(s => s.id === "missile-drill").count, 2);
  assert.match(m01.steps.find(s => s.id === "drone-drill").objective, /primary weapon/i);
  assert.match(m01.steps.find(s => s.id === "missile-drill").objective, /secondary weapon/i);
  assert.match(m01.steps.find(s => s.id === "missile-brief").lines.join(" "), /Right Click/, "the missile line names the control");
  assert.match(m01.steps.find(s => s.id === "missile-brief").lines.join(" "), /6 to 0/, "and the secondary bay keys");
});

test("a wave spawned before its briefing is still re-armed on reload", async () => {
  const { P, mission, world } = await campaignWorld();
  mission.step = mission.steps.findIndex(s => s.id === "drone-brief");
  world.enemies.length = 0;
  emit("place-entered", { id: CAMPAIGN_HOME_POCKET, player: P });
  assert.equal(world.enemies.filter(e => e.def === "practice_drone").length, 2,
    "the kill objective after the briefing tops the wave up");
});

test("the missile drill cannot stall on an empty rack", async () => {
  const { P, mission } = await campaignWorld();
  mission.step = mission.steps.findIndex(s => s.id === "missile-drill");
  placeWorld(CAMPAIGN_HOME_POCKET).missiles.length = 0;
  state.profile.msl = 0;
  P.missileStock = 0;
  emit("mission-tick", { dt: 0.05, player: P, profile: state.profile });
  assert.equal(state.profile.msl, MODULES.missile_basic.ammo, "a dry rack is refilled during the drill");
  assert.equal(P.missileStock, MODULES.missile_basic.ammo, "and the live ship sees it");
});

test("the ambush is a standoff: the raiders close in, stop, and stare at Dane", async () => {
  const { P, mission, world } = await campaignWorld();
  world.enemies.length = 0;
  world.bullets.length = 0;
  P.pos.set(0, 0, 0);
  const korr = spawnEnemy("captain_korr", V(0, 0, 300), CAMPAIGN_HOME_POCKET, `mission:${mission.id}`, { role: "observe" });
  mission.step = mission.steps.findIndex(s => s.id === "spawn-ambush");
  advanceMission(mission, "mission-tick", { dt: 0.05, player: P }, state.profile);
  const raiders = world.enemies.filter(e => e.def === "raider");
  assert.equal(raiders.length, 2);

  for (let i = 0; i < 400; i++) {
    emit("mission-tick", { dt: 0.05, player: P, profile: state.profile });
    updateEnemies(0.05, CAMPAIGN_HOME_POCKET);
  }
  for (const raider of raiders) {
    assert.ok(raider.pos.distanceTo(korr.pos) < 250, "each raider brakes within the standoff distance of Dane");
    assert.ok(raider.v.length() < 5, "and comes to a halt instead of circling");
  }
  assert.ok(raiders[0].pos.distanceTo(raiders[1].pos) < 120, "the two hulls hold station side by side");
  assert.equal(korr.role, "observe", "Dane holds his fire through the parley");
  assert.ok(korr.v.length() < 20, "and he too brakes to a halt to answer them");
  assert.equal(world.bullets.length, 0, "nobody shoots during the dialogue");

  world.enemies.length = 0;
  world.bullets.length = 0;
});

test("mission markers read the mission's own colour and every kind of objective", () => {
  const place = CAMPAIGN_HOME_POCKET;
  const story = { id: "story.x", kind: "story", title: "X", step: 0, counters: {} };
  const contract = { id: "contract:y", kind: "contract", title: "Y", step: 0, counters: {} };
  assert.equal(missionTitleColor(story), "var(--amber)");
  assert.equal(missionTitleColor(contract), "var(--ice)");
  assert.equal(missionTitleColor({ ...story, titleColor: "#6fd08c" }), "#6fd08c", "a mission may name its colour");

  // Kill: only the named enemy, in the right place, tagged to this mission.
  const kill = { ...story, steps: [{ id: "k", kind: "kill", enemy: "practice_drone", count: 2, place }] };
  const drone = { def: "practice_drone", hp: 5, f: "school", encounter: "mission:story.x" };
  assert.equal(objectObjectiveColor(drone, "Hostile", { missions: [kill], place }), "var(--amber)");
  assert.equal(objectObjectiveColor({ ...drone, def: "raider" }, "Hostile", { missions: [kill], place }), "",
    "an unrelated hostile is not highlighted");
  assert.equal(objectObjectiveColor({ ...drone, hp: 0 }, "Hostile", { missions: [kill], place }), "",
    "a dead target is not highlighted");
  assert.equal(objectObjectiveColor(drone, "Hostile", { missions: [kill], place: "somewhere-else" }), "",
    "another pocket's ships are not highlighted");

  // Wave-clear waits glow too, so a spawned wave is visible before the kill step.
  const wait = { ...story, steps: [{ id: "w", kind: "wait", trigger: "wave-clear" }] };
  assert.equal(objectObjectiveColor({ def: "raider", hp: 5, encounter: "mission:story.x" }, "Hostile",
    { missions: [wait], place }), "var(--amber)");

  // A friendly actor to form up on.
  const follow = { ...story, steps: [{ id: "f", kind: "chase", follow: "captain_korr", place }] };
  assert.equal(objectObjectiveColor({ def: "captain_korr", hp: 40, friendly: true }, "Ship",
    { missions: [follow], place }), "var(--amber)");

  // Stations: the hand-in, and a dock-required step.
  const handIn = { ...story, handIn: { station: place }, steps: [] };
  const station = { id: "korr", kind: "station", n: "Korr Flight School" };
  assert.equal(objectObjectiveColor(station, "station", { missions: [handIn], place }), "var(--amber)");
  assert.equal(objectObjectiveColor(station, "station", { missions: [kill], place }), "",
    "a station unrelated to the live objective stays plain");

  // Crates owed by a collect step, and persistent mission drops.
  const collect = { ...contract, steps: [{ id: "c", kind: "collect", item: "salv", count: 2, place }] };
  assert.equal(objectObjectiveColor({ item: "salv" }, "Cargo", { missions: [collect], place }), "var(--ice)");
  assert.equal(objectObjectiveColor({ item: "salv", missionId: "contract:y", persistent: true }, "Cargo",
    { missions: [collect], place }), "var(--ice)", "a mission's own drop never goes dark");
  assert.equal(objectObjectiveColor({ item: "ore" }, "Cargo", { missions: [collect], place }), "");

  // Mining: a belt group or a single rock of the named ore.
  const mine = { ...contract, steps: [{ id: "m", kind: "mine", item: "ferrite", count: 3, place }] };
  const group = { main: { id: "f1", n: "Ferrite field" }, members: [{ id: "f1", ore: "ferrite" }] };
  assert.equal(objectObjectiveColor(group, "asteroidField", { missions: [mine], place }), "var(--ice)");
  assert.equal(objectObjectiveColor({ type: "ferrite", ore: 3 }, "Asteroid", { missions: [mine], place }), "var(--ice)");
  assert.equal(objectObjectiveColor({ type: "ice", ore: 3 }, "Asteroid", { missions: [mine], place }), "");
});

test("a briefing does not look ahead to the kill step it just spawned (glow means: needed now)", () => {
  const mission = { id: "x", kind: "story", step: 1, counters: {}, steps: [
    { id: "spawn", kind: "script" },
    { id: "brief", kind: "dialogue", lines: ["one"] },
    { id: "drill", kind: "kill", enemy: "practice_drone", count: 2 },
  ] };
  assert.deepEqual(activeObjectiveSteps(mission).map(step => step.id), ["brief"],
    "while Dane is talking, the drones he spawned are not yet the objective");
  const fighting = { ...mission, step: 2 };
  assert.deepEqual(activeObjectiveSteps(fighting).map(step => step.id), ["drill"],
    "they light up when the kill step itself is current");
  const done = { ...mission, step: 3 };
  assert.deepEqual(activeObjectiveSteps(done), [], "a finished mission has no objective");
});

test("waypoints point at a destination, an authored point, a course start or a signal", () => {
  const place = CAMPAIGN_HOME_POCKET;
  const travelMission = { id: "story.travel", kind: "story", step: 0, counters: {},
    steps: [{ id: "go", kind: "reach-sector", place: "sys-001-hub" }] };
  const travel = missionWaypoints({ missions: [travelMission], place });
  assert.equal(travel.length, 1);
  assert.equal(travel[0].id, "story.travel:go:travel");
  assert.match(travel[0].label, /^Waypoint: /);
  assert.deepEqual(travel[0].pos, [0, 120, 1000], "a destination pocket is flown to its arrival point");
  assert.equal(travel[0].color, "var(--amber)");

  const here = { id: "story.here", kind: "story", step: 0, counters: {},
    steps: [{ id: "wp", kind: "reach", waypoint: [10, 20, 30], waypointLabel: "Beacon" }] };
  const point = missionWaypoints({ missions: [here], place });
  assert.deepEqual(point.map(w => w.pos), [[10, 20, 30]]);
  assert.equal(point[0].label, "Beacon");

  const chase = { id: "story.chase", kind: "story", step: 0, counters: {},
    steps: [{ id: "run", kind: "chase", follow: "captain_korr", course: "m01-range", coursePhase: "chase", place }] };
  const start = missionWaypoints({ missions: [chase], place });
  assert.equal(start.at(0)?.label, "Course start");
  assert.deepEqual(start.at(0)?.pos, [400, 240, 3200], "the fixture course start in data/flight-courses.js");
});

test("the N list marks an objective row with the mission's colour", () => {
  const rows = [
    { kind: "Hostile", object: { def: "practice_drone" }, name: "Practice Drone", distance: 640 },
    { kind: "Asteroid", object: { type: "ferrite", ore: 1 }, name: "Ferrite", distance: 900 },
  ];
  const html = pocketRowsHtml(rows, () => false, row => (row.kind === "Hostile" ? "var(--amber)" : ""));
  assert.match(html, /<li class="objective" style="--objective-color:var\(--amber\)"><button type="button" class="objective"/);
  assert.match(html, /<i class="pocket-icon h obj" style="--objective-color:var\(--amber\)"/);
  assert.match(html, /<li><button type="button" data-pocket-row="1"/, "a plain row keeps its old markup");
  assert.match(html, /<i class="pocket-icon" aria-hidden="true">/, "and its plain icon");
});

test("resuming an act from the title clears the title flags and says the act was entered", async () => {
  const { startCampaignAct } = await import("../src/sim/campaign-act.js");
  await campaignWorld();
  state.mode = "campaign";
  // Leaving the act to the title left these set; the flight HUD refuses to show
  // itself while `intro` is up, so the resume looked like a blank cockpit.
  state.ui.intro = true;
  state.ui.campaign = true;
  const seen = [];
  on("campaign-act-entered", payload => seen.push(payload));
  const result = startCampaignAct("campaign.m01-first-sortie");
  assert.equal(result.mode, "resume", "the running act is resumed, not restarted");
  assert.equal(state.ui.intro, false, "the title screen no longer owns the world");
  assert.equal(state.ui.campaign, false);
  assert.equal(seen.length, 1, "and the HUDs are told the act was entered");
  assert.equal(state.mode, "campaign");
});

test("the HUD re-syncs when an act is entered and the CSS glows objective markers", () => {
  const hud = readFileSync(new URL("../src/ui/hud.js", import.meta.url), "utf8");
  assert.match(hud, /on\("campaign-act-entered"/, "the flight HUD listens for the resume/restart event");
  assert.match(hud, /on\("campaign-act-entered", \(\) => \{\s*weaponSlotsCache = null;/, "and drops its cached weapon slots");
  assert.match(hud, /on\("main-menu", \(\) => \{[\s\S]*?weaponSlotsCache = null;/, "so does the title screen");

  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(css, /\.mk\.obj \{[^}]*border-color: var\(--objective-color, var\(--amber\)\)/);
  assert.match(css, /#pocket-object-rows li\.objective > button \{[^}]*--objective-color/);
  assert.match(css, /#pocket-object-rows \.pocket-icon\.obj \{/, "the list icon glows too");
});

test("an imported mission record cannot inject style with its title colour", async () => {
  const { pocketRowsHtml: rows } = await import("../src/ui/pocket-list.js");
  const hostile = { id: "x", kind: "story", titleColor: "red; background: url(javascript:1)", step: 0,
    counters: {}, steps: [{ id: "k", kind: "kill", enemy: "practice_drone", count: 1 }] };
  assert.equal(missionTitleColor(hostile), "var(--amber)", "a malformed colour falls back to the default");
  assert.equal(objectObjectiveColor({ def: "practice_drone", hp: 4 }, "Hostile",
    { missions: [hostile], place: CAMPAIGN_HOME_POCKET }), "var(--amber)");
  const html = rows([{ kind: "Hostile", object: {}, name: "Raider", distance: 500, objectiveColor: "red;x:y" }],
    () => false, () => "red;x:y");
  assert.doesNotMatch(html, /red;x:y/, "and never reaches the row markup");
  assert.doesNotMatch(html, /class="objective"/);
});

test("First Sortie ends on a dock objective: docking at the academy completes it, docking elsewhere does not", async () => {
  const { P, mission } = await campaignWorld();
  const dockStep = mission.steps[mission.steps.length - 1];
  assert.equal(dockStep.kind, "dock");
  assert.equal(dockStep.place, CAMPAIGN_HOME_POCKET);
  assert.match(dockStep.objective, /Dock at Korr Flight Academy/);
  assert.ok(!mission.steps.some(step => (step.lines || []).some(line => /keep one busy/i.test(line))),
    "Dane's removed line stays removed");
  mission.step = mission.steps.length - 1;
  P.place = "reach"; P.docked = true;
  const { advanceMission } = await import("../src/sim/missions.js");
  advanceMission(mission, "docked", { player: P }, P.profile);
  assert.equal(mission.step, mission.steps.length - 1, "docking at another pocket does not settle it");
  P.place = CAMPAIGN_HOME_POCKET;
  advanceMission(mission, "docked", { player: P }, P.profile);
  assert.ok(mission.completed || mission.step >= mission.steps.length, "docking at the academy finishes the act's last objective");
});

test("a friendly story ship glows only while the live objective is to fly with it", () => {
  const place = CAMPAIGN_HOME_POCKET;
  const dane = { def: "captain_korr", hp: 9999, friendly: true };
  const base = { id: "campaign.m01-first-sortie", kind: "story", counters: {} };
  const lesson = { ...base, step: 0, steps: [{ id: "l", kind: "control", control: "throttle", actor: "captain_korr", place }] };
  assert.equal(objectObjectiveColor(dane, "Ship", { missions: [lesson], place }), "",
    "no glow during the control lessons: Dane is not the objective");
  const drill = { ...base, step: 0, steps: [{ id: "d", kind: "dialogue", actor: "captain_korr", actorRole: "observe", place }] };
  assert.equal(objectObjectiveColor(dane, "Ship", { missions: [drill], place }), "",
    "no glow while he observes the drone drill or the ambush");
  const chase = { ...base, step: 0, steps: [{ id: "c", kind: "chase", follow: "captain_korr", actor: "captain_korr", place }] };
  assert.equal(objectObjectiveColor(dane, "Ship", { missions: [chase], place }), "var(--amber)",
    "he glows on the run, when forming up on him IS the objective");
  const dock = { ...base, step: 0, steps: [{ id: "dock", kind: "dock", place }] };
  assert.equal(objectObjectiveColor({ kind: "station" }, "station", { missions: [dock], place }), "var(--amber)",
    "the academy glows for the final dock objective");
});
