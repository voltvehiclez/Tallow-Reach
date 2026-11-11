// Station storage is local to the station feature, not one shared world stock.
import { test } from "node:test";
import assert from "node:assert/strict";
import { state, applySave } from "../src/state/state.js";
import { newSave, sanitizeSave, SAVE_VERSION } from "../src/state/profile.js";
import { generateGalaxy } from "../src/sim/galaxy.js";
import { setPlaceCatalog, placeDef, stationKeyAt } from "../src/data/places.js";
import { STATION, addItem, countOf, moveItem, stationStock } from "../src/sim/inventory.js";
import { shopList, buyItem, sellStored } from "../src/sim/economy.js";
import { fitModule, unequip } from "../src/sim/fitting.js";
import { encodeSave, decodeSave } from "../src/state/storage.js";

function generatedStations(seed = 19001) {
  state.galaxy = generateGalaxy(seed);
  setPlaceCatalog(state.galaxy);
  return Object.values(state.galaxy.pockets).filter(place =>
    place.template && placeDef(place.id).features.some(feature => feature.kind === "station")
  );
}

function at(placeId) {
  state.place = placeId;
  state.worldState.place = placeId;
}

test("economy, shop presentation, selling and capacity use the active station only", () => {
  applySave(newSave());
  const [first, second] = generatedStations(19002);
  assert.ok(first && second);
  state.profile.cr = 10000;

  at(first.id);
  assert.equal(addItem(STATION, "beam_basic", 1), 1);
  const beam = rows => rows.find(row => row.id === "beam_basic");
  assert.equal(beam(shopList("meridian")).owned, 1, "the current station's spare part is shown");

  at(second.id);
  assert.equal(countOf(STATION, "beam_basic"), 0, "the trader starts with a separate stock");
  assert.equal(beam(shopList("meridian")).owned, 0, "shop ownership does not reveal another station's stock");
  assert.match(fitModule("primary", 1, "beam_basic", null), /not in storage/i, "fitting cannot reach another station");
  at(first.id);
  assert.match(fitModule("primary", 1, "beam_basic", null), /Fitted/i, "fitting consumes the current station's module");
  assert.equal(countOf(STATION, "beam_basic"), 0);
  assert.match(unequip("primary", 1, null), /moved to storage/i, "unequipping returns the module to the same station");
  at(second.id);
  assert.match(buyItem("meridian", "beam_basic", 1, null), /station inventory/i, "the same Meridian rule can buy at the trader");
  assert.equal(countOf(STATION, "beam_basic"), 1);
  assert.equal(sellStored(), "Sold 1 item for 540 cr.", "selling only sees this trader's stock");
  assert.equal(countOf(STATION, "beam_basic"), 0);

  // Capacity is local too: a full trader cannot buy, while the first station is empty.
  assert.equal(addItem(STATION, "ferrite", 250), 250);
  assert.equal(beam(shopList("meridian")).room, false);
  const creditsBeforeRefusal = state.profile.cr;
  assert.match(buyItem("meridian", "beam_basic", 1, null), /no room/i);
  assert.equal(state.profile.cr, creditsBeforeRefusal, "a full station refusal charges nothing");
  at(first.id);
  assert.equal(beam(shopList("meridian")).room, true);
  assert.equal(countOf(STATION, "beam_basic"), 1);

  const roundTrip = decodeSave(encodeSave({ v: SAVE_VERSION, profile: state.profile, world: state.worldState }));
  applySave(roundTrip);
  at(first.id);
  assert.equal(countOf(STATION, "beam_basic"), 1, "export/reload preserves the first station");
  at(second.id);
  assert.equal(countOf(STATION, "ferrite"), 250, "export/reload preserves the second station");

  setPlaceCatalog(null);
  state.galaxy = null;
});

test("each generated station has independent inventory that survives save/load", () => {
  applySave(newSave());
  const [first, second] = generatedStations();
  assert.ok(first && second && first.id !== second.id, "the generated galaxy has two separate stations");
  assert.notEqual(stationKeyAt(first.id), stationKeyAt(second.id));

  at("reach");
  assert.equal(addItem(STATION, "cobalt", 3), 3, "the authored Meridian station also has its own stock");
  at(first.id);
  assert.equal(countOf(STATION, "cobalt"), 0, "a generated trader cannot see Meridian's stock");
  assert.equal(addItem(STATION, "ferrite", 4), 4);
  assert.equal(countOf(STATION, "ferrite"), 4);
  assert.equal(stationStock(state.worldState, first.id).ferrite, 4);

  at(second.id);
  assert.equal(countOf(STATION, "ferrite"), 0, "a new station does not see the first station's stock");
  assert.match(moveItem(STATION, "wasp", "ferrite", 1), /No Ferrite/i, "inventory transfer cannot reach another station");
  assert.equal(addItem(STATION, "ferrite", 2), 2);

  at(first.id);
  assert.equal(countOf(STATION, "ferrite"), 4, "returning finds the original station's stock");
  at(second.id);
  assert.equal(countOf(STATION, "ferrite"), 2, "the second station keeps only its own stock");

  const save = sanitizeSave({ v: SAVE_VERSION, profile: state.profile, world: state.worldState });
  const firstKey = stationKeyAt(first.id), secondKey = stationKeyAt(second.id);
  assert.deepEqual(save.world.stationStores[stationKeyAt("reach")], { cobalt: 3 });
  assert.deepEqual(save.world.stationStores[firstKey], { ferrite: 4 });
  assert.deepEqual(save.world.stationStores[secondKey], { ferrite: 2 });

  const old = newSave();
  old.v = old.profile.v = old.world.v = 18;
  delete old.world.stationStores;
  old.world.place = first.id;
  old.world.store = { cobalt: 3 };
  const migrated = sanitizeSave(old);
  assert.equal(migrated.v, 18);
  assert.deepEqual(migrated.world.store, {}, "legacy stock moves off the home alias when the save was at a trader");
  assert.deepEqual(migrated.world.stationStores[stationKeyAt(first.id)], { cobalt: 3 }, "legacy stock is assigned to the saved station");

  const legacyGate = Object.values(state.galaxy.pockets).find(place => place.role === "gate" &&
    state.galaxy.pockets[`${place.id}-station`] && !placeDef(place.id).features.some(feature => feature.kind === "station"));
  assert.ok(legacyGate, "the generated catalog has a gate whose old trader can be migrated");
  const legacyFeature = placeDef(`${legacyGate.id}-station`).features.find(feature => feature.kind === "station");
  const dockedGateSave = newSave();
  dockedGateSave.world.place = legacyGate.id;
  dockedGateSave.world.resume = null;
  dockedGateSave.world.stationStores = { [`${legacyGate.id}:${legacyFeature.id}`]: { cobalt: 2 } };
  const migratedGate = sanitizeSave(dockedGateSave);
  assert.equal(migratedGate.world.place, `${legacyGate.id}-station`, "a docked old gate trader resumes at its detached station");
  assert.deepEqual(migratedGate.world.stationStores[stationKeyAt(`${legacyGate.id}-station`)], { cobalt: 2 });
  const flyingGateSave = newSave();
  flyingGateSave.world.place = legacyGate.id;
  flyingGateSave.world.resume = { pos: [1, 2, 3], quat: [0, 0, 0, 1], sh: 1, en: 1 };
  assert.equal(sanitizeSave(flyingGateSave).world.place, legacyGate.id, "a flying save keeps its gate location");

  setPlaceCatalog(null);
  state.galaxy = null;
});
