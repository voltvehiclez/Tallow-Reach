// Hunt contracts are about the neighbourhood they were taken in (owner,
// 2026-11-14): "if you accept a mission in Meridian Station it should be till
// destroy the ones specifically that spawn in the meridian station."
//
// The kill step carries `place` — the pocket the board was read at — so
// `objectiveMatches` refuses kills anywhere else in the universe, and the
// objective sentence names the asteroid belt and pocket the raiders spawn by.
// Contracts accepted before this change have no `place` on the step and keep
// the old count-anywhere rule; only newly accepted hunts are scoped.
import { test } from "node:test";
import assert from "node:assert/strict";
import { state } from "../src/state/state.js";
import { PLACES, setPlaceCatalog } from "../src/data/places.js";
import { newProfile } from "../src/state/profile.js";
import {
  acceptMission,
  advanceMissions,
  missionNextText,
  missionProgress,
} from "../src/sim/missions.js";

const GALETRADE = {
  id: "galetrade",
  kind: "pocket",
  n: "Galedrift Expanse",
  parent: "meridian",
  d: "A busy trade pocket. A friendly counter is open near the rocks.",
  template: "trade_lane",
  enter: { kind: "warp", pos: [0, 0, 300] },
  leave: { kind: "warp" },
};

const BARN = {
  id: "barn",
  kind: "pocket",
  n: "Kestrel Hollow",
  parent: "meridian",
  d: "A field-less pocket with a station.",
  features: [{
    kind: "station", id: "barnstation", n: "Barn Station", pos: [0, 0, 0],
    dockRange: 300, dockSpeed: 70, launch: { pos: [0, 0, 200] }, shop: "meridian",
  }],
  enter: { kind: "warp", pos: [0, 0, 300] },
  leave: { kind: "warp" },
};

const killer = (profile, place) => ({ def: "raider", faction: "pirates", player: { profile, docked: false, place } });

test("a hunt accepted at Meridian Station counts only kills near the Asteroid field", () => {
  const profile = newProfile();
  const hunt = acceptMission({ type: "hunt", tier: 1, n: 2, r: 400, e: "raider" }, profile, "reach");
  assert.equal(missionNextText(hunt, profile),
    "Destroy 2 pirate raiders near the Asteroid field (Meridian Station).",
    "the objective names the belt and the station, from the same data the spawner uses");
  assert.equal(hunt.steps[0].place, "reach", "the kill step carries its pocket");

  advanceMissions("enemy-killed", killer(profile, "hollow"));
  assert.equal(missionProgress(hunt).done, 0, "a raider killed in another pocket does not pay");
  advanceMissions("enemy-killed", killer(profile, "galetrade"));
  assert.equal(missionProgress(hunt).done, 0, "a raider killed in a trade lane does not pay");
  advanceMissions("enemy-killed", killer(profile, "reach"));
  assert.equal(missionProgress(hunt).done, 1, "a raider killed in the belt pays");
});

test("a hunt accepted in a generated trade-lane pocket names the Trade-lane asteroid field", () => {
  const prev = state.place;
  setPlaceCatalog({ systems: [], pockets: { ...PLACES, galetrade: GALETRADE } });
  try {
    const profile = newProfile();
    const hunt = acceptMission({ type: "hunt", tier: 1, n: 2, r: 400, e: "raider" }, profile, "galetrade");
    assert.equal(missionNextText(hunt, profile),
      "Destroy 2 pirate raiders near the Trade-lane asteroid field (Galedrift Expanse).");
    advanceMissions("enemy-killed", killer(profile, "reach"));
    assert.equal(missionProgress(hunt).done, 0, "Meridian's belt is somebody else's problem");
    advanceMissions("enemy-killed", killer(profile, "galetrade"));
    assert.equal(missionProgress(hunt).done, 1, "the belt by the trade lane pays");
  } finally {
    setPlaceCatalog(null);
    state.place = prev;
  }
});

test("a hunt accepted in a field-less pocket is scoped to that pocket, and says so", () => {
  const prev = state.place;
  setPlaceCatalog({ systems: [], pockets: { ...PLACES, barn: BARN } });
  try {
    const profile = newProfile();
    const hunt = acceptMission({ type: "hunt", tier: 1, n: 2, r: 400, e: "raider" }, profile, "barn");
    assert.equal(missionNextText(hunt, profile),
      "Destroy 2 pirate raiders in Kestrel Hollow.");
    advanceMissions("enemy-killed", killer(profile, "reach"));
    assert.equal(missionProgress(hunt).done, 0);
    advanceMissions("enemy-killed", killer(profile, "barn"));
    assert.equal(missionProgress(hunt).done, 1);
  } finally {
    setPlaceCatalog(null);
    state.place = prev;
  }
});
