// Save v15: come back where you logged out.
//
// The owner's report: quitting while flying in the Meridian Station pocket put
// you back docked, because the old code asked only "does this pocket have a
// station?". The save now carries `world.resume` — null while docked, otherwise
// the exact spot, heading, shields and boost — with the pocket's arrival point
// kept as the fallback for old saves, damaged data and a ship that cannot move.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SAVE_VERSION, newSave, sanitizeSave, sanitizeWorld, portableProfile, mergeProfile,
} from "../src/state/profile.js";
import { encodeSave, decodeSave } from "../src/state/storage.js";
import { state, applySave, currentSave, captureResume, resetPlaces } from "../src/state/state.js";
import { createPlayer } from "../src/sim/player.js";
import { configurePlayer, resumeFromSave, dock, launch } from "../src/sim/session.js";
import { arrivalPos, stationAt } from "../src/sim/places.js";
import { PLACE_EXTENT } from "../src/data/places.js";
import { AUTOSAVE_SECONDS } from "../src/data/simulation.js";
import { V } from "../src/util/math.js";

function boot(place = "reach") {
  resetPlaces();
  state.players.length = 0;
  state.localPlayerIndex = 0;
  state.profile = newSave().profile;
  state.worldState = newSave().world;
  state.worldState.place = place;
  state.place = place;
  const P = configurePlayer(createPlayer(), state.profile);
  P.place = place;
  return P;
}

test("v19: a new save has a resume slot, null while docked", () => {
  assert.equal(SAVE_VERSION, 19);
  const s = newSave();
  assert.equal(s.world.resume, null);
  assert.deepEqual(sanitizeSave(s), s);
});

test("quitting while flying in the station pocket comes back flying at that exact spot", () => {
  const P = boot("reach");
  P.docked = false;
  P.pos.set(1800, 240, -1450);                 // out in the belt, nowhere near the station
  P.quat.setFromAxisAngle(V(0, 1, 0), 0.7);
  P.sh = 4;
  P.en = 3;
  const save = sanitizeSave(JSON.parse(JSON.stringify(currentSave())));
  assert.ok(save.world.resume, "flying is recorded");
  assert.deepEqual(save.world.resume.pos, [1800, 240, -1450]);

  // A fresh session loading that save.
  const Q2 = boot("reach");
  applySave(save);
  resumeFromSave(Q2);
  assert.equal(Q2.docked, false, "not docked — this was the reported bug");
  assert.equal(state.place, "reach");
  assert.deepEqual(Q2.pos.toArray(), [1800, 240, -1450], "same spot");
  assert.ok(Math.abs(Q2.quat.angleTo(P.quat)) < 1e-9, "same heading");
  assert.deepEqual(Q2.v.toArray(), [0, 0, 0], "but stationary");
});

test("shields and boost come back as left, so quitting is not a free repair", () => {
  const P = boot("reach");
  P.docked = false;
  P.pos.set(900, 0, -900);
  P.sh = 3;
  P.en = 2;
  const save = sanitizeSave(JSON.parse(JSON.stringify(currentSave())));

  const R = boot("reach");
  applySave(save);
  resumeFromSave(R);
  assert.equal(R.sh, 3, "shields are not topped up");
  assert.equal(R.en, 2, "boost is not topped up");
  assert.ok(R.sh < R.shMax && R.en < R.drive.bmax);
});

test("shields and boost are clamped to what is actually fitted", () => {
  const w = sanitizeWorld({ v: 15, place: "reach", resume: { pos: [500, 0, 0], quat: [0, 0, 0, 1], sh: 9999, en: 9999 } });
  const P = boot("reach");
  applySave({ v: SAVE_VERSION, profile: state.profile, world: w });
  resumeFromSave(P);
  assert.equal(P.sh, P.shMax);
  assert.equal(P.en, P.drive.bmax);
});

test("docking clears the resume point, so the next load opens the station menu", () => {
  const P = boot("reach");
  launch(P);
  P.pos.set(1500, 0, -1200);
  assert.ok(currentSave().world.resume, "flying is recorded");
  dock(P);
  assert.equal(currentSave().world.resume, null, "docking clears it");

  const R = boot("reach");
  applySave(sanitizeSave(JSON.parse(JSON.stringify(currentSave()))));
  resumeFromSave(R);
  assert.equal(R.docked, true);
  assert.deepEqual(R.pos.toArray(), stationAt("reach").pos);
});

test("launch records the launch point immediately", () => {
  const P = boot("reach");
  dock(P);
  launch(P);
  const r = currentSave().world.resume;
  assert.ok(r);
  assert.deepEqual(r.pos, stationAt("reach").launch.pos);
});

test("v14 and older saves keep their old behaviour: dock at a station, else the arrival point", () => {
  // No `resume` field at all, exactly as a v14 save looks.
  const atStation = sanitizeSave({ v: 14, profile: newSave().profile, world: { v: 14, place: "reach", sector: "reach" } });
  assert.equal(atStation.world.resume, null);
  const P = boot("reach");
  applySave(atStation);
  resumeFromSave(P);
  assert.equal(P.docked, true);

  const away = sanitizeSave({ v: 14, profile: newSave().profile, world: { v: 14, place: "hollow", sector: "hollow" } });
  const R = boot("hollow");
  applySave(away);
  resumeFromSave(R);
  assert.equal(R.docked, false);
  assert.deepEqual(R.pos.toArray(), arrivalPos("hollow").toArray());
});

test("a damaged resume point falls back instead of placing the ship somewhere impossible", () => {
  const bad = [
    { pos: [NaN, 0, 0] },
    { pos: [Infinity, 0, 0] },
    { pos: [0, 0] },
    { pos: ["x", 0, 0] },
    { pos: [PLACE_EXTENT * 10, 0, 0] },
    { pos: [0, 0, 0], quat: [0, 0, 0, 0] },
    "nonsense",
    [1, 2, 3],
  ];
  for (const raw of bad) {
    const w = sanitizeWorld({ v: 15, place: "hollow", resume: raw });
    if (w.resume) {
      assert.ok(w.resume.pos.every(Number.isFinite), "a kept position is always finite");
      assert.ok(Math.abs(Math.hypot(...w.resume.quat) - 1) < 1e-6, "a kept heading is always a unit quaternion");
    }
    const P = boot("hollow");
    applySave({ v: SAVE_VERSION, profile: state.profile, world: w });
    resumeFromSave(P);
    assert.ok(Number.isFinite(P.pos.x) && Number.isFinite(P.pos.length()), "the ship is somewhere real");
    assert.equal(P.docked, false, "an empty pocket still puts you flying at the entry point");
  }
  assert.equal(sanitizeWorld({ v: 15, resume: { pos: [NaN, 0, 0] } }).resume, null);
  assert.equal(sanitizeWorld({ v: 15, resume: { pos: [PLACE_EXTENT * 10, 0, 0] } }).resume, null);
});

test("a ship with no thrusters is not stranded far from home", () => {
  const P = boot("reach");
  state.profile.loadout.wasp.thruster = [null];      // unfitted
  P.docked = false;
  P.pos.set(5000, 0, -5000);
  const save = sanitizeSave(JSON.parse(JSON.stringify(currentSave())));

  const R = boot("reach");
  state.profile.loadout.wasp.thruster = [null];
  applySave(save);
  resumeFromSave(R);
  assert.equal(R.docked, true, "it docks so the pilot can fit thrusters again");
});

test("the exact spot survives an export code round-trip", () => {
  const P = boot("hollow");
  P.docked = false;
  P.pos.set(-1234.5, 67.25, 8900);
  P.quat.setFromAxisAngle(V(1, 0, 0), 0.3);
  P.sh = 5;
  P.en = 1.5;
  const code = encodeSave(currentSave());
  const back = decodeSave(code);
  assert.deepEqual(back.world.resume.pos, [-1234.5, 67.25, 8900]);
  assert.deepEqual(back.world.resume.quat, P.quat.toArray(), "heading is byte-identical");
  assert.equal(back.world.resume.sh, 5);
  assert.equal(back.world.resume.en, 1.5);
});

test("every save path captures the live spot, not a stale one", () => {
  const P = boot("reach");
  P.docked = false;
  P.pos.set(10, 20, 30);
  captureResume();
  P.pos.set(400, 500, 600);
  assert.deepEqual(currentSave().world.resume.pos, [400, 500, 600], "currentSave re-reads the ship");
});

test("the resume point belongs to the world, not the portable profile", () => {
  const P = boot("reach");
  P.docked = false;
  P.pos.set(700, 0, -700);
  const save = currentSave();
  const guest = portableProfile(save);
  assert.equal("resume" in guest, false, "a guest does not carry host-world coordinates");
  const merged = mergeProfile(save, guest);
  assert.deepEqual(merged.world.resume, save.world.resume, "merging keeps the home resume point");
});

test("the game writes the resume point on exit and on a timer", () => {
  const main = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  assert.match(main, /addEventListener\("pagehide", saveResumePoint\)/);
  assert.match(main, /visibilitychange/);
  assert.match(main, /setInterval\(saveResumePoint, AUTOSAVE_SECONDS \* 1000\)/);
  assert.ok(AUTOSAVE_SECONDS > 0 && AUTOSAVE_SECONDS <= 60, "the period is data and sane");
});
