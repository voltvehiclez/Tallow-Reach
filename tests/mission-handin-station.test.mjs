// Every mission and contract is handed in at ONE station: the one that gave it
// out, unless its data names another (`handIn.station`) because the job sends the
// pilot somewhere specific. Before this, `completeMission` paid at whatever
// counter the pilot happened to be docked at.
//
// The tests install a second station pocket, so "the wrong station" is a real
// station and not just an empty pocket: a pilot who docks there must be told
// where to go, must not be paid, and must not lose the cargo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { state, resetPlaces } from "../src/state/state.js";
import { PLACES, setPlaceCatalog } from "../src/data/places.js";
import { BORDER_SIGNAL_MISSION } from "../src/data/missions/story.js";
import { missionFromContract } from "../src/data/missions/contracts.js";
import { lintMission } from "../src/data/missions/validate.js";
import { newProfile, newSave, sanitizeSave } from "../src/state/profile.js";
import {
  acceptMission,
  atMissionHandInStation,
  completeMission,
  instantiateStoryMission,
  missionHandInStation,
  missionHandInStationName,
  missionNextText,
} from "../src/sim/missions.js";
import { addItem } from "../src/sim/inventory.js";
import { missionLogHtml } from "../src/ui/missionlog.js";
import { moveTo, newPilot } from "./mission-driver.mjs";

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

/** Two stations exist: Meridian (`reach`) and Depot Station (`depot`). */
function twoStations() {
  setPlaceCatalog({ systems: [], pockets: { ...PLACES, depot: DEPOT } });
}

function finishObjective(mission) {
  mission.counters.objective = mission.steps[0].count;
  mission.step = mission.current = mission.steps.length;
  mission.completed = true;
  return mission;
}

test("a contract is handed in at the station that gave it out, not at any station", () => {
  const ctx = newPilot();
  try {
    twoStations();
    const mission = finishObjective(acceptMission({ type: "mine", tier: 1, o: "ferrite", n: 2, r: 300 }, ctx.profile));
    assert.equal(missionHandInStation(mission), "reach", "the giving station is recorded on the mission");
    assert.equal(missionHandInStationName(mission), "Meridian Station");
    addItem(ctx.profile.ship, "ferrite", 1, ctx.profile, state.worldState);

    // Guidance names the hand-in station even from somewhere else.
    moveTo(ctx, "depot");
    assert.equal(missionNextText(mission, ctx.profile),
      "Deliver 2 Ferrite to Meridian Station. You have 1 of 2.",
      "the sentence names the station that takes the cargo, not the one the pilot is at");
    addItem(ctx.profile.ship, "ferrite", 1, ctx.profile, state.worldState);
    assert.equal(missionNextText(mission, ctx.profile), "Deliver 2 Ferrite to Meridian Station.",
      "with the whole cargo aboard only the delivery is left to say");

    // Docked at the wrong station: told where to go, paid nothing, cargo kept.
    moveTo(ctx, "depot", { dock: true });
    const before = ctx.profile.cr;
    assert.equal(completeMission(mission.id, ctx.profile, ctx.player), "Hand this in at Meridian Station.");
    assert.equal(ctx.profile.cr, before, "no reward at the wrong counter");
    assert.equal(ctx.profile.missions.includes(mission), true, "the mission waits for the right station");
    assert.equal(ctx.profile.holds[ctx.profile.ship].ferrite, 2, "the cargo is not taken at the wrong station");
    assert.equal(atMissionHandInStation(mission), false);
    // The log follows the pilot, so the mission is still readable at Depot — but
    // its hand-in belongs to Meridian, and the card says so instead of paying out.
    const log = missionLogHtml(ctx.profile);
    assert.match(log, /Mine 2 Ferrite/, "the active mission is still listed here");
    assert.match(log, /Deliver to Meridian Station/, "the log says where the hand-in is");
    assert.match(log, /Hand in at Meridian Station/, "the log names the station and disables the button");
    assert.match(log, /data-a="done"[^>]*disabled/, "the hand-in button cannot be pressed here");
    assert.doesNotMatch(log, />Hand in cargo</, "nothing offers a hand-in at the wrong station");

    // Docked at the right station: the same button works and the goods are taken.
    moveTo(ctx, "reach", { dock: true });
    assert.equal(atMissionHandInStation(mission), true);
    const ready = missionLogHtml(ctx.profile);
    assert.match(ready, />Hand in cargo</, "the hand-in is offered at the mission's own station");
    assert.doesNotMatch(ready, /disabled/, "nothing is disabled at the right station");
    assert.equal(completeMission(mission.id, ctx.profile, ctx.player), "Paid 300 cr.");
    assert.equal(ctx.profile.cr, before + 300);
    assert.equal(ctx.profile.holds[ctx.profile.ship].ferrite, undefined, "the exact cargo is consumed");
    assert.equal(ctx.profile.missions.includes(mission), false);
  } finally {
    ctx.restore();
  }
});

test("the default is the giving station: a contract taken at Depot Station is handed in there", () => {
  const ctx = newPilot();
  try {
    twoStations();
    moveTo(ctx, "depot", { dock: true });
    const mission = finishObjective(acceptMission({ type: "salvage", tier: 1, n: 1, r: 200 }, ctx.profile));
    assert.equal(missionHandInStation(mission), "depot", "the station that gave the contract takes it back");
    addItem(ctx.profile.ship, "salv", 1, ctx.profile, state.worldState);
    assert.match(missionNextText(mission, ctx.profile), /Deliver 1 derelict crate to Depot Station\.|Deliver 1 derelict crates to Depot Station\./);

    moveTo(ctx, "reach", { dock: true });
    assert.equal(completeMission(mission.id, ctx.profile, ctx.player), "Hand this in at Depot Station.",
      "Meridian Station cannot pay another station's contract");
    moveTo(ctx, "depot", { dock: true });
    assert.equal(completeMission(mission.id, ctx.profile, ctx.player), "Paid 200 cr.");
  } finally {
    ctx.restore();
  }
});

test("mission data can send the hand-in to a specific station", () => {
  const ctx = newPilot();
  try {
    twoStations();
    // A story mission that starts at Meridian but must be handed in at Depot.
    const def = instantiateStoryMission({
      ...BORDER_SIGNAL_MISSION,
      id: "story.depot-run",
      handIn: { station: "depot", objective: "Take the beacon to {station}." },
    });
    const mission = acceptMission(def, ctx.profile);
    assert.equal(missionHandInStation(mission), "depot", "the data's station wins over the giving station");
    finishObjective(mission);
    ctx.profile.holds[ctx.profile.ship].beacon = 1;
    assert.equal(missionNextText(mission, ctx.profile), "Take the beacon to Depot Station.");

    assert.equal(completeMission(mission.id, ctx.profile, ctx.player), "Hand this in at Depot Station.");
    moveTo(ctx, "depot", { dock: true });
    assert.equal(completeMission(mission.id, ctx.profile, ctx.player), "Paid 300 cr.");
  } finally {
    ctx.restore();
  }
});

test("the station survives a save, and an older mission resolves one from its origin", () => {
  const profile = newProfile();
  const save = newSave();
  state.worldState = save.world;
  state.place = "reach";
  const mission = finishObjective(acceptMission({ type: "hunt", tier: 1, n: 2, r: 400 }, profile));
  const saved = sanitizeSave(JSON.parse(JSON.stringify({ v: save.v, profile, world: save.world })));
  const kept = saved.profile.missions.find(m => m.id === mission.id);
  assert.equal(kept?.handIn?.station, "reach", "the hand-in station is part of the save");

  // A mission saved before the field existed: `origin` is the giving station.
  const prevPlace = state.place;
  const legacy = missionFromContract({ type: "hunt", tier: 1, n: 1, r: 100 }, "legacy");
  legacy.origin = "reach";
  state.place = "reach";
  assert.equal(missionHandInStation(legacy), "reach", "an older mission still resolves its station");
  twoStations();
  state.place = "depot";
  assert.equal(missionHandInStation(legacy), "reach", "the station it was given at wins over where the pilot is now");
  setPlaceCatalog(null);
  state.place = prevPlace;
  // Nothing at all: the home station, so the mission can never become impossible.
  assert.equal(missionHandInStation({ steps: [] }), "reach", "a record with no station falls back home");
});

test("lint: a hand-in station must be a station, and the sentence must name it", () => {
  assert.equal(BORDER_SIGNAL_MISSION.handIn.station, "reach", "the Border Signal names Meridian Station");
  assert.equal(lintMission(BORDER_SIGNAL_MISSION).filter(p => p.level === "error").length, 0, "the Border Signal lints clean");

  const bad = instantiateStoryMission({
    ...BORDER_SIGNAL_MISSION,
    id: "story.bad-station",
    handIn: { station: "hollow", objective: "Hand it in at {station}." },
  });
  const messages = lintMission(bad).filter(p => p.level === "error").map(p => p.message);
  assert.ok(messages.some(m => /has no station/.test(m)), "a pocket without a station is rejected");

  const unknown = instantiateStoryMission({
    ...BORDER_SIGNAL_MISSION,
    id: "story.unknown-station",
    handIn: { station: "nowhere", objective: "Hand it in at {station}." },
  });
  assert.ok(lintMission(unknown).some(p => /is not a pocket/.test(p.message)), "an unknown pocket is rejected");

  const vague = instantiateStoryMission({
    ...BORDER_SIGNAL_MISSION,
    id: "story.vague-handin",
    handIn: { station: "reach", objective: "Bring the beacon back." },
  });
  assert.ok(lintMission(vague).some(p => p.level === "warning" && /should use `\{station\}`/.test(p.message)),
    "a hand-in sentence that cannot name the station is flagged");
});
