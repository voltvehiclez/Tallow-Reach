// Step 12: generated place content, generic encounters and simulation-time memory.
import { test } from "node:test";
import assert from "node:assert/strict";
import { newProfile, newSave, newWorld, SAVE_VERSION, sanitizeSave } from "../src/state/profile.js";
import { state, resetPlaces, placeWorld } from "../src/state/state.js";
import { setPlaceCatalog, placeDef } from "../src/data/places.js";
import { generateGalaxy } from "../src/sim/galaxy.js";
import { createPlayer } from "../src/sim/player.js";
import { configurePlayer } from "../src/sim/session.js";
import { enterPlace, loadPlace, refreshPlace } from "../src/sim/places.js";
import { updateEnemies } from "../src/sim/ai.js";
import { updateCrates } from "../src/sim/combat.js";
import { dropEntity } from "../src/sim/entity.js";
import { fieldAt } from "../src/sim/places.js";
import { isSimulationPaused, stepSim } from "../src/sim/step.js";
import { rockMemoryId } from "../src/sim/asteroids.js";
import { markRockMined, memoryTimer, updatePlaceMemory } from "../src/sim/place-memory.js";
import { emit } from "../src/util/events.js";
import { V } from "../src/util/math.js";

function fresh(seed = 12012) {
  resetPlaces();
  state.players.length = 0;
  state.localPlayerIndex = 0;
  state.profile = newProfile();
  state.worldState = newWorld();
  state.ui.intro = false;
  state.ui.starmap = null;
  state.ui.destination = null;
  state.paused = false;
  state.time = 0;
  state.galaxy = generateGalaxy(seed);
  setPlaceCatalog(state.galaxy);
  const player = configurePlayer(createPlayer(), state.profile);
  player.docked = false;
  player.flight.spawnT = 1e9;
  return player;
}

function generatedPocket(predicate = () => true) {
  return Object.values(state.galaxy.pockets).find(place => place.template && predicate(placeDef(place.id)));
}

test("generated pockets resolve three varied templates and fill their data-defined features", () => {
  fresh();
  const pockets = Object.values(state.galaxy.pockets).filter(place => place.template);
  assert.ok(pockets.length > 0, "the generated galaxy contains pockets");
  assert.deepEqual(
    [...new Set(pockets.map(place => place.template))].sort(),
    ["frontier", "salvage_yard", "trade_lane"],
    "the default galaxy uses all three Step 12 templates"
  );

  const signatures = new Set();
  for (const template of ["frontier", "salvage_yard", "trade_lane"]) {
    const place = pockets.find(candidate => candidate.template === template);
    const definition = placeDef(place.id);
    assert.ok(place.d && !/empty/i.test(place.d), `${template} has template content in pocket information`);
    loadPlace(place.id);
    const world = placeWorld(place.id);
    const field = definition.features.find(feature => feature.kind === "asteroidField");
    const staticFeatures = definition.features.filter(feature => feature.kind === "encounter");
    assert.ok(field, `${template} has an asteroid field`);
    assert.equal(world.asteroids.length, field.count, `${template} fills its field now`);
    assert.ok(staticFeatures.length > 0, `${template} has a static encounter at this tier`);
    assert.ok(world.crates.length > 0, `${template} turns its static encounter into loot crates`);
    signatures.add(definition.features.map(feature => feature.kind + ":" + (feature.encounter || feature.id)).join("|"));
  }
  assert.equal(signatures.size, 3, "templates produce different pocket content");

  const traderPocket = pockets.find(place => placeDef(place.id).features.some(feature => feature.kind === "station"));
  assert.ok(traderPocket, "a generated trade lane has a dockable station feature");
  const trader = placeDef(traderPocket.id).features.find(feature => feature.kind === "station");
  assert.equal(trader.shop, "meridian", "the trader uses existing SHOPS stock rather than a second storage system");
});

test("generated stations are separate from gates while explicit gate co-location remains possible", () => {
  const world = generateGalaxy();
  setPlaceCatalog(world);
  const gates = Object.values(world.pockets).filter(place => place.role === "gate");
  assert.ok(gates.length > 0);
  assert.ok(gates.every(place => !placeDef(place.id).features.some(feature => feature.kind === "station")),
    "default gate pockets do not carry stations");
  const stations = Object.values(world.pockets).filter(place => placeDef(place.id).features.some(feature => feature.kind === "station"));
  assert.ok(stations.some(place => place.role === "station"), "a moved station gets its own station pocket");
  const stationNames = stations.map(place => place.n);
  assert.equal(new Set(stationNames).size, stationNames.length, "station pockets have unique names");
  const allStationFeatureNames = stations.map(place => placeDef(place.id).features.find(feature => feature.kind === "station").n);
  assert.equal(new Set(allStationFeatureNames).size, allStationFeatureNames.length, "station features have unique HUD names");
  const generatedStationNames = stations.filter(place => place.template).map(place =>
    placeDef(place.id).features.find(feature => feature.kind === "station").n);
  assert.equal(new Set(generatedStationNames).size, generatedStationNames.length, "generated station features have unique HUD names");
  assert.ok(generatedStationNames.some(name => /Outpost|Hideout|Trading Hub|Waystation|Freeport|Exchange/.test(name)),
    "generated stations use varied names rather than only the generic Station suffix");
  for (const place of stations.filter(candidate => candidate.role === "station")) {
    assert.notEqual(place.role, "gate");
    assert.ok(Object.values(world.links).some(link => link.kind === "internal" &&
      (link.a === place.id || link.b === place.id)), `${place.id} is reachable through an internal link`);
  }

  // An author can deliberately place a station on a gate by adding an explicit
  // feature record; the generated detachment does not override that choice.
  const gate = gates.find(place => place.template === "trade_lane") || gates[0];
  const explicit = {
    kind: "station", id: "author-station", n: "Author Station", pos: [0, 0, 0],
    keepout: 90, dockRange: 260, dockSpeed: 70, launch: { pos: [0, 0, 220] }, shop: "meridian",
  };
  const authored = generateGalaxy(undefined, {}, { places: { [gate.id]: { features: [explicit] } } });
  setPlaceCatalog(authored);
  assert.ok(placeDef(gate.id).features.some(feature => feature.id === "author-station"));
  assert.equal(authored.pockets[`${gate.id}-station`], undefined, "explicit co-location keeps the station on the gate");
  setPlaceCatalog(null);
});

test("a generated hostile patrol is a generic encounter and still serves hunt contracts", () => {
  const player = fresh(12013);
  const place = generatedPocket(definition => definition.features.some(feature => feature.kind === "spawner"));
  assert.ok(place);
  enterPlace(place.id, player);
  const definition = placeDef(place.id);
  const spawner = definition.features.find(feature => feature.kind === "spawner");
  const field = definition.features.find(feature => feature.kind === "asteroidField");
  assert.equal("enemy" in spawner, false, "the generated spawner names an encounter, not a raider special case");
  assert.equal(spawner.encounter, "hostile_patrol");
  player.pos.copy(V(...field.pos));
  player.flight.spawnT = 0;
  state.profile.mission = { type: "hunt", p: 0, n: 1, e: "raider" };

  updateEnemies(0, place.id);
  const enemies = placeWorld(place.id).enemies;
  assert.equal(enemies.length, 1, "the hunt contract requests one remaining target");
  assert.equal(enemies[0].def, "raider");
  assert.equal(enemies[0].encounter, spawner.id, "the enemy records the data-defined encounter feature");
});

test("mined rock memory counts simulation time, pauses with the simulation and respawns by event", () => {
  const player = fresh(12014);
  const place = generatedPocket(definition => definition.features.some(feature => feature.kind === "asteroidField"));
  enterPlace(place.id, player);
  const world = placeWorld(place.id);
  const field = fieldAt(place.id);
  const rock = world.asteroids[0];
  const memoryId = rockMemoryId(field, rock.slot);
  dropEntity(world.asteroids, rock);
  markRockMined(place.id, memoryId, 10);
  assert.equal(memoryTimer(place.id, "rock", memoryId), 10);

  state.paused = true;
  assert.equal(isSimulationPaused(), true);
  if (!isSimulationPaused()) stepSim(5);
  assert.equal(memoryTimer(place.id, "rock", memoryId), 10, "paused time is not spent");

  state.paused = false;
  stepSim(9);
  assert.equal(Math.round(memoryTimer(place.id, "rock", memoryId)), 1);
  stepSim(2);
  assert.equal(memoryTimer(place.id, "rock", memoryId), 0, "the cooldown expires in simulation time");
  assert.ok(world.asteroids.some(candidate => candidate.memoryId === memoryId), "the expired slot respawns in a loaded place");

  const second = world.asteroids.find(candidate => candidate.memoryId !== memoryId);
  const secondId = second.memoryId;
  dropEntity(world.asteroids, second);
  markRockMined(place.id, secondId, 420);
  emit("respawn-place", { placeId: place.id, kind: "rock", id: secondId });
  assert.equal(memoryTimer(place.id, "rock", secondId), 0, "an event can override the slow default timer");
  assert.ok(world.asteroids.some(candidate => candidate.memoryId === secondId), "the event immediately rebuilds the slot");
});

test("cleared static encounters stay absent, save their cooldown and respond to a forced respawn event", () => {
  const player = fresh(12015);
  const place = generatedPocket(definition => definition.features.some(feature => feature.kind === "encounter"));
  enterPlace(place.id, player);
  const definition = placeDef(place.id);
  const feature = definition.features.find(candidate => candidate.kind === "encounter");
  const world = placeWorld(place.id);
  assert.ok(world.crates.some(crate => crate.encounter === feature.id));
  player.pos.copy(V(...feature.pos));

  // Pull/pick up all crates belonging to this encounter. Other generated
  // encounters, if present, are well away and remain untouched.
  for (let i = 0; i < 120 && world.crates.some(crate => crate.encounter === feature.id); i++) updateCrates(0.1, place.id);
  assert.equal(world.crates.some(crate => crate.encounter === feature.id), false, "the encounter is cleared by collecting its final crate");
  assert.equal(memoryTimer(place.id, "encounter", feature.id), 420);
  const afterClear = world.crates.length;
  refreshPlace(place.id);
  assert.equal(world.crates.length, afterClear, "refresh does not duplicate a cooling encounter");

  emit("respawn-place", { placeId: place.id, kind: "encounter", id: feature.id });
  assert.ok(world.crates.some(crate => crate.encounter === feature.id), "a future event can force the encounter back early");
});

test("save version 19 preserves place memory and station stores, while older saves migrate", () => {
  const save = newSave();
  save.world.placeMemory = {
    hollow: { rocks: { "field:3": 12.5 }, encounters: { "derelict-0": 300 } },
  };
  const clean = sanitizeSave(save);
  assert.equal(SAVE_VERSION, 19);
  assert.deepEqual(clean.world.placeMemory, save.world.placeMemory);

  const old = JSON.parse(JSON.stringify(save));
  old.v = old.profile.v = old.world.v = 17;
  delete old.world.placeMemory;
  const migrated = sanitizeSave(old);
  assert.equal(migrated.v, 19);
  assert.deepEqual(migrated.world.placeMemory, {});

  const bad = JSON.parse(JSON.stringify(save));
  bad.world.placeMemory.bad = { rocks: { nope: -1, nan: "not-a-number" }, encounters: [] };
  assert.deepEqual(sanitizeSave(bad).world.placeMemory, save.world.placeMemory);
});
