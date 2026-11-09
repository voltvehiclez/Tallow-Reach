// Step 10: systems group pockets; places own their entities; warps are per pilot.
import { test } from "node:test";
import assert from "node:assert/strict";
import { state, resetPlaces, placeWorld } from "../src/state/state.js";
import { newProfile } from "../src/state/profile.js";
import { TERMS, term, Term, terms } from "../src/data/terms.js";
import { PLACES, PLACE_IDS, DEFAULT_PLACE, PLACE_DEFS, placeAt, placeDef, featureOf, pocketsIn, nextPocket, systemOf, isPocket, isSystem } from "../src/data/places.js";
import { loadPlace, enterPlace, stationAt, fieldAt, arrivalPos } from "../src/sim/places.js";
import { startWarp, updateWarp, isWarping } from "../src/sim/sectors.js";
import { stepSim } from "../src/sim/step.js";
import { createPlayer, createPlayerRecord } from "../src/sim/player.js";
import { configurePlayer } from "../src/sim/session.js";
import { spawnEnemy } from "../src/sim/ai.js";
import { fire, spawnCrate, updateBullets, updateCrates } from "../src/sim/combat.js";
import { launchMissile, updateMissileFlight } from "../src/sim/missile.js";
import { boom, updateEffects } from "../src/sim/effects.js";
import { V } from "../src/util/math.js";
import { WARP_TIME } from "../src/data/sectors.js";
import { on } from "../src/util/events.js";

function fresh() {
  resetPlaces();
  state.players.length = 0;
  state.localPlayerIndex = 0;
  state.profile = newProfile();
  state.time = 0;
  state.freeCam.on = false;
  state.aimDirection = { x: 0, y: 0, z: -1 };
  const local = configurePlayer(createPlayer(), state.profile);
  local.docked = false;
  local.pos.set(0, 0, 400);
  local.flight.spawnT = 1e9;
  return local;
}

test("10a: generic nouns live in one line each and capitalise/pluralise", () => {
  assert.equal(TERMS.mapNode, "system");
  assert.equal(TERMS.flyable, "pocket");
  assert.equal(term("flyable"), "pocket");
  assert.equal(Term("mapNode"), "System");
  assert.equal(terms("flyable"), "pockets");
});

test("10a: Meridian System groups pockets; the station is a feature, not a child place", () => {
  assert.equal(placeAt(DEFAULT_PLACE).n, "Meridian Station");
  assert.equal(systemOf(DEFAULT_PLACE), "meridian");
  assert.equal(placeAt("meridian").n, "Meridian System");
  assert.ok(isSystem("meridian"));
  assert.ok(isPocket("reach") && isPocket("hollow"));
  assert.equal(placeAt("hollow").n, "Kestrel Hollow");
  assert.equal(stationAt("reach").n, "Meridian Station");
  assert.equal(stationAt("hollow"), null);
  assert.ok(fieldAt("reach"));
  assert.equal(fieldAt("hollow"), null);
  assert.equal(PLACES.meridian.kind, "system");
  assert.ok(!Object.values(PLACES).some(p => p.parent === "reach"), "no place is a child of the station pocket");
});

test("10a: a system may hold any number of pockets and the legacy nextPocket helper cycles all of them", () => {
  const id = "test-third-pocket";
  PLACES[id] = { id, kind: "pocket", def: "empty", parent: "meridian", n: "Third Pocket", d: "test", enter: { kind: "warp", pos: [0, 0, 300] }, leave: { kind: "warp" } };
  PLACE_IDS.push(id);
  try {
    assert.deepEqual(pocketsIn("meridian"), ["reach", "hollow", id]);
    assert.equal(nextPocket("reach"), "hollow");
    assert.equal(nextPocket("hollow"), id);
    assert.equal(nextPocket(id), "reach");
  } finally {
    delete PLACES[id];
    PLACE_IDS.splice(PLACE_IDS.indexOf(id), 1);
  }
});

test("10a: the loader builds per-place containers once and keeps rocks separate", () => {
  fresh();
  loadPlace("reach");
  loadPlace("hollow");
  loadPlace("reach");
  const reach = placeWorld("reach"), hollow = placeWorld("hollow");
  assert.equal(reach.asteroids.length, placeDef("reach").features.find(f => f.kind === "asteroidField").count);
  assert.equal(hollow.asteroids.length, 0);
  assert.notEqual(reach, hollow);
  assert.ok(reach.asteroids.every(a => a.place === "reach"));
  assert.deepEqual(arrivalPos("hollow").toArray(), placeAt("hollow").enter.pos);
});

test("10b: each pilot owns their place and warp; shared systems are place-scoped", () => {
  const local = fresh();
  const other = configurePlayer(createPlayerRecord(), newProfile());
  state.players.push(other);
  other.docked = false;
  other.pos.set(0, 0, 400);
  other.flight.spawnT = 1e9;
  enterPlace("reach", local);
  enterPlace("hollow", other);
  assert.equal(local.place, "reach");
  assert.equal(other.place, "hollow");
  assert.equal(state.place, "reach", "the local alias follows only the local pilot");

  const enemyReach = spawnEnemy("raider", V(0, 0, -300), "reach");
  const enemyHollow = spawnEnemy("raider", V(0, 0, -300), "hollow");
  fire(V(0, 0, 0), V(0, 0, -1), 0, true, 1, local);
  fire(V(0, 0, 0), V(0, 0, -1), 0, true, 1, other);
  spawnCrate(V(0, 0, -50), "salv", "reach");
  spawnCrate(V(0, 0, -50), "salv", "hollow");
  launchMissile(null, { dmg: 1 }, V(0, 0, -1), V(0, 0, 0), local);
  launchMissile(null, { dmg: 1 }, V(0, 0, -1), V(0, 0, 0), other);
  boom(V(0, 0, 0), 2, 0xffffff, "reach");
  boom(V(0, 0, 0), 2, 0xffffff, "hollow");
  assert.equal(placeWorld("reach").bullets.length, 1);
  assert.equal(placeWorld("hollow").bullets.length, 1);
  assert.equal(placeWorld("reach").enemies[0], enemyReach);
  assert.equal(placeWorld("hollow").enemies[0], enemyHollow);

  assert.ok(startWarp(local));
  assert.ok(isWarping(local));
  assert.ok(!isWarping(other));
  assert.equal(other.place, "hollow");
  for (let t = 0; t < WARP_TIME + 0.1; t += 1 / 60) updateWarp(1 / 60, local);
  assert.equal(local.place, "hollow");
  assert.equal(other.place, "hollow");
  assert.ok(!isWarping(local));
  assert.equal(placeWorld("reach").crates.length, 0, "leaving the last pilot clears abandoned crates");
  assert.ok(placeWorld("reach").asteroids.length > 0, "rocks are geography and stay");

  // Both pilots now in hollow: one step moves both, and hollow's shared lists step.
  const before = other.pos.x;
  other.controls.strafe = 1;
  stepSim(1 / 60);
  assert.ok(other.pos.x > before);
  assert.equal(placeWorld("hollow").bullets.length, 1);
});

test("10b: warp does not clear another active pilot's fight in the old pocket", () => {
  const local = fresh();
  const other = configurePlayer(createPlayerRecord(), newProfile());
  state.players.push(other);
  other.docked = false;
  other.flight.spawnT = 1e9;
  enterPlace("reach", local);
  enterPlace("reach", other);
  spawnCrate(V(0, 0, -50), "salv", "reach");
  spawnEnemy("raider", V(0, 0, -300), "reach");
  startWarp(local);
  for (let t = 0; t < WARP_TIME + 0.1; t += 1 / 60) updateWarp(1 / 60, local);
  assert.equal(local.place, "hollow");
  assert.equal(other.place, "reach");
  assert.equal(placeWorld("reach").crates.length, 1);
  assert.equal(placeWorld("reach").enemies.length, 1);
});

test("10b: place-entered fires for actual moves and carries the pilot", () => {
  const local = fresh();
  const seen = [];
  on("place-entered", ({ id, player }) => seen.push([id, player === local]));
  enterPlace("reach", local);
  enterPlace("hollow", local);
  enterPlace("hollow", local);
  enterPlace("reach", local);
  assert.deepEqual(seen, [["hollow", true], ["reach", true]]);
});
