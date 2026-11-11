// Step 10c: save v14 stores world.place, migrates old sector ids and resumes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SAVE_VERSION, newSave, sanitizeSave, sanitizeWorld, portableProfile, mergeProfile } from "../src/state/profile.js";
import { encodeSave, decodeSave, saveAutosave, loadAutosave, writeSlot, readSlot } from "../src/state/storage.js";
import { state, applySave, currentSave, resetPlaces } from "../src/state/state.js";
import { createPlayer } from "../src/sim/player.js";
import { configurePlayer, resumeFromSave } from "../src/sim/session.js";
import { DEFAULT_PLACE, placeAt } from "../src/data/places.js";
import { stationAt, arrivalPos } from "../src/sim/places.js";

const here = dirname(fileURLToPath(import.meta.url));
const V13_SAVE = JSON.parse(readFileSync(join(here, "saves", "v13-real.json"), "utf8"));
const V12_SAVE = JSON.parse(readFileSync(join(here, "saves", "v12-real.json"), "utf8"));

function legacyEncode(rawObj) {
  const bytes = new TextEncoder().encode(JSON.stringify(rawObj));
  let bin = "";
  bytes.forEach(b => (bin += String.fromCharCode(b)));
  return "TR1:" + btoa(bin);
}

function mockStorage() {
  const mem = new Map();
  const prev = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: k => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: k => mem.delete(k),
  };
  return { mem, restore: () => { globalThis.localStorage = prev; } };
}

test("10c: new saves are v18 and store world.place, not world.sector", () => {
  assert.equal(SAVE_VERSION, 18);
  const s = newSave();
  assert.equal(s.v, 18);
  assert.equal(s.world.v, 18);
  assert.equal(s.world.place, DEFAULT_PLACE);
  assert.equal("sector" in s.world, false);
  assert.deepEqual(sanitizeSave(s), s);
});

test("10c: v13 sector ids migrate to place; unknown ids fall back to the starting pocket", () => {
  const migrated = sanitizeSave(V13_SAVE);
  assert.equal(migrated.v, 18);
  assert.equal(migrated.world.place, "hollow");
  assert.equal("sector" in migrated.world, false);
  assert.equal(migrated.profile.cr, V13_SAVE.profile.cr);
  assert.deepEqual(migrated.profile.holds, V13_SAVE.profile.holds);
  assert.deepEqual(migrated.world.store, V13_SAVE.world.store);

  assert.equal(sanitizeWorld({ v: 13, sector: "reach" }).place, "reach");
  assert.equal(sanitizeWorld({ v: 13, sector: "nowhere" }).place, DEFAULT_PLACE);
  assert.equal(sanitizeWorld({ v: 14, place: "hollow", sector: "reach" }).place, "hollow");
  assert.equal(sanitizeWorld({ v: 14, place: "nowhere" }).place, DEFAULT_PLACE);
  assert.equal(sanitizeSave(V12_SAVE).world.place, DEFAULT_PLACE);
});

test("10c: an old v13 export code and an older v12 code still load", () => {
  const fromV13 = decodeSave(legacyEncode(V13_SAVE));
  assert.equal(fromV13.v, 18);
  assert.equal(fromV13.world.place, "hollow");
  const fromV12 = decodeSave(legacyEncode(V12_SAVE));
  assert.equal(fromV12.v, 18);
  assert.equal(fromV12.profile.cr, 4850);
  const round = encodeSave(fromV13);
  assert.deepEqual(decodeSave(round), fromV13);
});

test("10c: old localStorage autosave and slots migrate on read and write back v18", () => {
  const { mem, restore } = mockStorage();
  try {
    mem.set("tr1", JSON.stringify(V13_SAVE));
    mem.set("tr_s1", JSON.stringify(V12_SAVE));
    const auto = loadAutosave();
    assert.equal(auto.v, 18);
    assert.equal(auto.world.place, "hollow");
    const slot = sanitizeSave(readSlot(1));
    assert.equal(slot.v, 18);
    assert.equal(saveAutosave(auto), true);
    assert.equal(writeSlot(2, auto), true);
    assert.deepEqual(loadAutosave(), auto);
    assert.deepEqual(sanitizeSave(readSlot(2)), auto);
    assert.equal(JSON.parse(mem.get("tr1")).world.place, "hollow");
  } finally {
    restore();
  }
});

test("10c: portable profile carries no place; merge keeps the host's current pocket", () => {
  const host = sanitizeSave(V13_SAVE);
  const guest = portableProfile(host);
  assert.equal("place" in guest, false);
  assert.equal("sector" in guest, false);
  guest.cr = 999;
  const merged = mergeProfile(host, guest);
  assert.equal(merged.world.place, "hollow");
  assert.equal(merged.profile.cr, 999);
  assert.equal(host.profile.cr, V13_SAVE.profile.cr);
});

test("10c: loading a station save opens docked; loading an away save resumes flying at the arrival point", () => {
  resetPlaces();
  state.players.length = 0;
  state.localPlayerIndex = 0;
  const player = configurePlayer(createPlayer(), state.profile);

  const stationSave = newSave();
  stationSave.world.place = "reach";
  applySave(stationSave);
  resumeFromSave(player);
  assert.equal(player.place, "reach");
  assert.equal(player.docked, true);
  assert.deepEqual(player.pos.toArray(), stationAt("reach").pos);

  const awaySave = sanitizeSave(V13_SAVE); // sector hollow
  applySave(awaySave);
  resumeFromSave(player);
  assert.equal(player.place, "hollow");
  assert.equal(player.docked, false);
  assert.deepEqual(player.pos.toArray(), arrivalPos("hollow").toArray());
  assert.deepEqual(player.v.toArray(), [0, 0, 0]);
  assert.equal(player.sh, player.shMax);
  assert.equal(player.en, player.drive.bmax);
  assert.equal(state.worldState.place, "hollow");
  assert.equal(currentSave().world.place, "hollow");
});
