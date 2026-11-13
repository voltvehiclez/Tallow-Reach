// Missions and contracts belong to a station. The owner reported that a Meridian
// mission could be read — and its Abandon pressed — from another station's
// Mission log, which is not how a noticeboard works: work is filed where it is
// given out, and the board of one counter is not the board of another.
//
// The second half is the Border Signal bug: with the final dialogue open, closing
// it left the docked card still offering Abandon even though the beacon was
// aboard, so the hand-in could not be taken. The docked panel is HTML built when
// it is drawn, so any mission change now has to tell it to draw again.
import { test } from "node:test";
import assert from "node:assert/strict";
import { state } from "../src/state/state.js";
import { PLACES, setPlaceCatalog } from "../src/data/places.js";
import { stationAt } from "../src/sim/places.js";
import { generateGalaxy } from "../src/sim/galaxy.js";
import { BORDER_SIGNAL_MISSION } from "../src/data/missions/story.js";
import { newProfile, newSave, sanitizeSave, SAVE_VERSION } from "../src/state/profile.js";
import {
  acceptMission,
  activeMissions,
  advanceMission,
  instantiateStoryMission,
  missionHandInStation,
  missionOfferStation,
  nextMissionDialogue,
} from "../src/sim/missions.js";
import { acceptContract, boardAt, describe, rerollBoard } from "../src/sim/contracts.js";
import { addItem } from "../src/sim/inventory.js";
import { outpostHtml } from "../src/ui/screens.js";
import { dialogueHtml, missionLogHtml, setupMissionLog } from "../src/ui/missionlog.js";
import { on } from "../src/util/events.js";

const DEPOT = {
  id: "depot",
  kind: "pocket",
  n: "Depot",
  parent: "meridian",
  d: "A second station pocket, used by the tests.",
  features: [{
    kind: "station", id: "depot", n: "Depot Station", pos: [0, 0, 0],
    dockRange: 300, dockSpeed: 70, launch: { pos: [0, 0, 200] },
  }],
  enter: { kind: "warp", pos: [0, 0, 300] },
  leave: { kind: "warp" },
};

function twoStations() {
  setPlaceCatalog({ systems: [], pockets: { ...PLACES, depot: DEPOT } });
}

/** The smallest DOM setupMissionLog needs: two elements it can hold and fill. */
function installDom() {
  const make = (tag = "div") => ({
    tagName: tag.toUpperCase(), id: "", hidden: false, innerHTML: "", textContent: "",
    children: [], dataset: {}, handlers: {}, attributes: {},
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    addEventListener(name, fn) { this.handlers[name] = fn; },
    classList: { add() {}, remove() {}, toggle() {} },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  });
  globalThis.document = { body: make("body"), createElement: make };
}

/** Run `fn` with the pilot docked at `place` in a fresh world, then restore. */
function atStation(place, fn) {
  const prev = {
    worldState: state.worldState, place: state.place, places: state.places,
    profile: state.profile, player: state.player, players: state.players,
    intro: state.ui.intro,
  };
  state.worldState = newSave().world;
  state.profile = newProfile();
  state.place = place;
  state.worldState.place = place;
  state.player = { profile: state.profile, place, docked: true, dead: false, pos: { x: 0, y: 0, z: 0 } };
  state.players = [state.player];
  state.ui.intro = false;
  try {
    twoStations();
    return fn(state.profile, state.worldState);
  } finally {
    state.worldState = prev.worldState;
    state.place = prev.place;
    state.places = prev.places;
    state.profile = prev.profile;
    state.player = prev.player;
    state.players = prev.players;
    state.ui.intro = prev.intro;
  }
}

test("each station keeps its own contract board, and a reroll touches only that station", () => {
  atStation("reach", (_profile, world) => {
    const home = boardAt("reach", world);
    const depot = boardAt("depot", world);
    assert.notEqual(home, depot, "two stations do not share one board");
    assert.equal(world.board, home, "the home station's board stays in world.board, where old saves keep it");
    assert.equal(world.boards.depot, depot, "another station's offers live in world.boards");

    const homeOffers = JSON.stringify(world.board);
    const depotBoard = world.boards.depot;
    rerollBoard(world, "depot");
    assert.equal(JSON.stringify(world.board), homeOffers, "rerolling Depot leaves Meridian's offers untouched");
    assert.notEqual(world.boards.depot, depotBoard, "Depot's own offers were replaced");
    assert.notEqual(JSON.stringify(world.boards.depot), JSON.stringify(depotBoard), "…with a freshly generated list");
  });
});

test("a contract read on one station's board is filed at that station", () => {
  atStation("reach", (profile, world) => {
    const depotBoard = boardAt("depot", world);
    const offer = depotBoard[0];
    assert.ok(offer, "Depot has an offer to take");
    const homeOffers = JSON.stringify(world.board);
    assert.match(acceptContract(0, profile, world, "depot"), /Contract accepted/, "the offer could be accepted");
    assert.equal(activeMissions(profile).length, 1, "one contract is now active");
    const [mission] = activeMissions(profile);
    assert.equal(describe(mission), describe(offer), "the active contract is the one Depot offered");
    assert.equal(missionHandInStation(mission), "depot",
      "the job comes back to the counter that handed it out, not to state.place");
    assert.equal(JSON.stringify(world.board), homeOffers, "Meridian's board is not rerolled by a Depot acceptance");
  });
});

test("an active mission is readable at every station, but only its own station hands it in", () => {
  atStation("reach", profile => {
    // Two different jobs, so the rendered text tells them apart.
    const home = acceptMission({ type: "mine", tier: 1, o: "ferrite", n: 2, r: 300 }, profile, "reach");
    const depot = acceptMission({ type: "hunt", tier: 1, e: "raider", n: 1, r: 300 }, profile, "depot");
    const homeText = describe(home), depotText = describe(depot);
    assert.notEqual(homeText, depotText, "the two contracts read differently");

    // Progress follows the pilot: both jobs are listed at either station.
    state.place = "depot";
    const depotLog = missionLogHtml(profile);
    assert.equal(depotLog.includes(homeText), true, "a Meridian job can be watched from Depot");
    assert.equal(depotLog.includes(depotText), true, "and Depot's own job is listed");
    assert.doesNotMatch(depotLog, /another station|filed at/, "the log says nothing about work elsewhere");
    const depotTab = outpostHtml({ tab: "m" });
    assert.equal(depotTab.includes(homeText), true, "the Contracts tab shows every active mission too");
    assert.equal(depotTab.includes(depotText), true);

    state.place = "reach";
    const homeLog = missionLogHtml(profile);
    assert.equal(homeLog.includes(depotText), true, "Depot's job is readable at Meridian as well");
    assert.equal(homeLog.includes(homeText), true);

    // Neither can be handed in yet (the objectives are not done), and both can be
    // abandoned from anywhere: a mission is never stuck behind a station.
    assert.match(homeLog, new RegExp(`data-a="drop" data-b="${depot.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`),
      "another station's mission is listed with its own id, so Abandon works from here");
    assert.match(homeLog, new RegExp(`data-a="drop" data-b="${home.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`),
      "buttons address their mission by id, not by a list position");
  });
});

test("in the generated galaxy, Galereach offers no story mission to accept", () => {
  // The owner's check, with the real seed rather than a stand-in station: fly to
  // Galereach and the Mission log has no story offer. Meridian still has it.
  const prev = {
    galaxy: state.galaxy, place: state.place, worldState: state.worldState,
    profile: state.profile, places: state.places, intro: state.ui.intro,
  };
  try {
    const galaxy = generateGalaxy();
    setPlaceCatalog(galaxy);
    state.galaxy = galaxy;
    state.worldState = newSave().world;
    state.profile = newProfile();
    state.places = new Map();
    state.ui.intro = false;
    const stations = Object.keys(galaxy.pocketsById || galaxy.pockets || {}).filter(id => stationAt(id));
    assert.ok(stations.length > 1, "the seed has many stations to fly between");
    const galereach = stations.find(id => /galereach/i.test(String(stationAt(id).n)));
    assert.ok(galereach, "the seed's galaxy has a station called Galereach");

    state.place = state.playerPlace = galereach;
    state.worldState.place = galereach;
    const away = missionLogHtml(state.profile);
    assert.doesNotMatch(away, /The Border Signal/, "Galereach does not offer Meridian's story mission");
    assert.doesNotMatch(away, /data-a="story"/, "nothing can be accepted as a story mission there");

    state.place = "reach";
    state.worldState.place = "reach";
    const home = missionLogHtml(state.profile);
    assert.match(home, /The Border Signal/, "Meridian still offers it");
    assert.match(home, /data-a="story" data-b="story\.border-signal"/, "with the accept button");

    // The owner's follow-up: once taken at Meridian, the mission follows the
    // pilot. At Galereach the log shows it and its progress, though it can only
    // be handed in back at Meridian.
    const accepted = acceptMission(BORDER_SIGNAL_MISSION, state.profile, "reach");
    assert.ok(accepted, "the story mission is accepted at Meridian");
    state.place = state.worldState.place = galereach;
    const carried = missionLogHtml(state.profile);
    assert.match(carried, /The Border Signal/, "the active mission is readable at Galereach");
    assert.match(carried, /Active/, "with its progress state");
    assert.match(carried, /data-a="drop"/, "and can be abandoned from here");
    assert.doesNotMatch(carried, /data-a="story"/, "but it is not offered for a second time");
  } finally {
    state.galaxy = prev.galaxy;
    state.place = prev.place;
    state.worldState = prev.worldState;
    state.profile = prev.profile;
    state.places = prev.places;
    state.ui.intro = prev.intro;
  }
});

test("a story mission is offered only at the station that gives it out", () => {
  atStation("reach", profile => {
    const atHome = missionLogHtml(profile);
    assert.match(atHome, /The Border Signal/, "Meridian offers the story mission");
    assert.equal(missionOfferStation(BORDER_SIGNAL_MISSION), "reach");

    state.place = "depot";
    const away = missionLogHtml(profile);
    assert.equal(away.includes("The Border Signal"), false, "Depot does not offer Meridian's story mission");
    assert.equal(state.profile.missions.length, 0, "…and nothing was accepted by looking");
  });
});

test("closing the final dialogue redraws the docked panel, so the hand-in appears", () => {
  // The docked panel is a snapshot. This drives the real dialogue path — the same
  // click the pilot makes — and checks the redraw is announced after it.
  installDom();
  atStation("reach", profile => {
    setupMissionLog();
    const mission = instantiateStoryMission(BORDER_SIGNAL_MISSION);
    // Stand on the final conversation, with the beacon already in the hold: the
    // state the pilot reaches at Meridian after the script has played out.
    const finish = mission.steps.findIndex(step => step.id === "finish");
    assert.ok(finish > 0, "the story has its final conversation");
    mission.step = mission.current = finish;
    mission.counters = { ...(mission.counters || {}), finish: 0 };
    profile.missions.push(mission);
    addItem(profile.ship, "beacon", 1, profile, state.worldState);
    mission.steps.forEach((step, i) => { if (i < finish) mission.counters[step.id] = 999; });

    const before = missionLogHtml(profile);
    assert.match(before, /Abandon/, "before the dialogue closes the card still offers Abandon");

    let redraws = 0;
    on("mission-ui-refresh", () => { redraws += 1; });
    assert.equal(nextMissionDialogue(mission.id, profile, state.player), true, "the last line closes");
    assert.ok(redraws >= 1, "the docked panel was told to draw again");

    const after = missionLogHtml(profile);
    assert.match(after, /Hand in cargo/, "with the cargo aboard, the hand-in is offered");
    assert.doesNotMatch(after, />Abandon</, "and Abandon is gone");
  });
});

test("a story mission with an unknown `offeredAt` is offered nowhere, not everywhere", () => {
  // Fail closed: a typo must never turn one station's job into every station's.
  assert.equal(missionOfferStation({ ...BORDER_SIGNAL_MISSION, offeredAt: "no-such-station" }), null);
  assert.equal(missionOfferStation({ ...BORDER_SIGNAL_MISSION, offeredAt: "hollow" }), null,
    "a pocket without a station cannot offer anything");
  assert.equal(missionOfferStation({ ...BORDER_SIGNAL_MISSION, offeredAt: "reach" }), "reach",
    "and the authored station still wins");
});

test("a station conversation belongs to its own station, not any dock", () => {
  atStation("reach", profile => {
    const mission = acceptMission(BORDER_SIGNAL_MISSION, profile, "reach");
    assert.ok(mission, "the story mission is accepted at Meridian");

    // Docked at Meridian: the conversation can be read and advanced.
    assert.equal(advanceMission(mission, "dialogue-next", { profile, player: state.player }), true,
      "the briefing advances at the station that gives it out");

    // Docked anywhere else: the card says where to go and the runner refuses, so a
    // stale click cannot play a Meridian conversation from Galereach.
    state.place = "depot";
    state.worldState.place = "depot";
    state.player.place = "depot";
    const card = dialogueHtml(mission, { blocked: true, stationName: "Meridian Station" });
    assert.match(card, /Return to Meridian Station to continue talking\./);
    assert.doesNotMatch(card, /data-dialogue-next|data-dialogue-choice/,
      "nothing in the card can advance another station's conversation");
    const before = JSON.stringify(mission.counters);
    assert.equal(advanceMission(mission, "dialogue-next", { profile, player: state.player }), false,
      "the runner refuses as well");
    assert.equal(JSON.stringify(mission.counters), before, "and nothing moved");
  });
});
