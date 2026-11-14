import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  SAVE_VERSION,
  newProfile,
  newWorld,
  newSave,
  sanitizeProfile,
  sanitizeWorld,
  sanitizeSave,
  portableProfile,
  mergeProfile,
} from "../src/state/profile.js";
import {
  loadAutosave,
  saveAutosave,
  readSlot,
  writeSlot,
  deleteSlot,
  encodeSave,
  decodeSave,
} from "../src/state/storage.js";
import { BASE_MODULES, BASE_DEFAULT } from "../src/data/station.js";
import { GALAXY } from "../src/data/galaxy.js";

const here = dirname(fileURLToPath(import.meta.url));
const sGalaxy = () => ({ seed: GALAXY.seed, knowledge: { meridian: { discovered: true, visited: true } } });
const V11_SAVE = JSON.parse(readFileSync(join(here, "saves", "v11-real.json"), "utf8"));
const V12_SAVE = JSON.parse(readFileSync(join(here, "saves", "v12-real.json"), "utf8"));

function legacyEncode(rawObj) {
  const bytes = new TextEncoder().encode(JSON.stringify(rawObj));
  let bin = "";
  bytes.forEach(b => (bin += String.fromCharCode(b)));
  return "TR1:" + btoa(bin);
}

test("9a: SAVE_VERSION is 20 and profile/world halves stay strictly separate", () => {
  assert.equal(SAVE_VERSION, 20);
  const s = newSave();
  assert.deepEqual(Object.keys(s).sort(), ["profile", "v", "world"]);
  for (const forbidden of ["base", "store", "board", "galaxy", "sector", "place", "resume", "wp", "cargo", "modules"]) {
    assert.equal(forbidden in s.profile, false, `profile must not carry ${forbidden}`);
  }
  assert.deepEqual(Object.keys(s.world).sort(), ["base", "board", "boards", "destination", "galaxy", "instances", "missionState", "place", "placeMemory", "resume", "stationStores", "store", "v"]);
  assert.deepEqual(s.world.galaxy, { seed: GALAXY.seed, knowledge: { meridian: { discovered: true, visited: true } } });
  assert.equal(s.world.place, "reach");
  assert.deepEqual(s.world.board, []);
  assert.deepEqual(s.world.boards, {}, "a new world has no other station's board generated yet");
});

test("9a: sanitizeWorld walks BASE_MODULES instead of naming base modules by hand", () => {
  const profileSrc = readFileSync(join(here, "..", "src", "state", "profile.js"), "utf8");
  assert.equal(/rb\.store|rb\.hangar|rb\.refinery/.test(profileSrc), false, "no hand-named base modules");

  // Temporarily register a synthetic base module in BASE_MODULES to prove
  // sanitizeWorld picks it up from data alone.
  BASE_MODULES.medbay = { n: "Medbay", max: 3, cost: l => 500 * (l + 1), d: "Test module" };
  BASE_DEFAULT.medbay = 1;
  try {
    const w = sanitizeWorld({ base: { medbay: 99 } });
    assert.equal(w.base.medbay, 3);
    const wDefault = sanitizeWorld({});
    assert.equal(wDefault.base.medbay, 1);
  } finally {
    delete BASE_MODULES.medbay;
    delete BASE_DEFAULT.medbay;
  }
});

test("9a: real v12 save migrates cleanly to v20 profile + world", () => {
  const migrated = sanitizeSave(V12_SAVE);
  assert.equal(migrated.v, 20);

  assert.equal(migrated.profile.v, 20);
  assert.equal(migrated.profile.cr, 4850);
  assert.deepEqual(migrated.profile.ships, ["wasp", "prospector"]);
  assert.equal(migrated.profile.ship, "prospector");
  assert.deepEqual(migrated.profile.holds, V12_SAVE.holds);
  assert.deepEqual(migrated.profile.mission, V12_SAVE.mission);
  assert.equal(migrated.profile.done, 9);
  assert.equal(migrated.profile.kills, 17);
  assert.equal(migrated.profile.msl, 5);
  assert.equal(migrated.profile.pw, "beam");
  assert.deepEqual(migrated.profile.hp, V12_SAVE.hp);
  assert.deepEqual(migrated.profile.loadout, V12_SAVE.loadout);
  assert.equal("base" in migrated.profile, false);
  assert.equal("store" in migrated.profile, false);

  assert.equal(migrated.world.v, 20);
  assert.deepEqual(migrated.world.base, { store: 3, hangar: 2, refinery: 2 });
  assert.deepEqual(migrated.world.store, V12_SAVE.store);
  assert.deepEqual(migrated.world.board, []);
  assert.deepEqual(migrated.world.galaxy, sGalaxy());
  assert.equal(migrated.world.place, "reach");
});

test("9a: real v11 save and old TR1 export codes (v11 and v12) decode into v20 saves", () => {
  const fromV11 = decodeSave(legacyEncode(V11_SAVE));
  assert.equal(fromV11.v, 20);
  assert.deepEqual(fromV11.profile.holds.wasp, { ferrite: 5, core: 1, thruster_basic: 1 });
  assert.deepEqual(fromV11.world.store, { ferrite: 12, salv: 3, beam_basic: 1, cannon_basic: 2 });
  assert.deepEqual(fromV11.world.base, { store: 1, hangar: 1, refinery: 0 });

  const v12Code = legacyEncode(V12_SAVE);
  const fromV12 = decodeSave(v12Code);
  assert.deepEqual(fromV12, sanitizeSave(V12_SAVE));

  // Re-encoding as the current version and decoding again is lossless.
  const v13Code = encodeSave(fromV12);
  assert.deepEqual(decodeSave(v13Code), fromV12);
});

test("9a: localStorage keys tr1 and tr_s1..tr_s3 are preserved and load old v12 JSON", () => {
  const mem = new Map();
  const prev = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: k => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: k => mem.delete(k),
  };
  try {
    // Pre-populate old v12 JSON under existing browser keys.
    mem.set("tr1", JSON.stringify(V12_SAVE));
    mem.set("tr_s1", JSON.stringify(V12_SAVE));

    const auto = loadAutosave();
    assert.equal(auto.v, 20);
    assert.equal(auto.profile.cr, 4850);
    assert.deepEqual(auto.world.base, { store: 3, hangar: 2, refinery: 2 });

    const slot1Raw = readSlot(1);
    assert.deepEqual(sanitizeSave(slot1Raw), auto);

    // Saving a v15 save writes back to the exact same keys.
    auto.world.board = [{ type: "hunt", tier: 1, p: 0, n: 2, r: 420, e: "raider" }];
    assert.equal(saveAutosave(auto), true);
    assert.equal(writeSlot(2, auto), true);
    assert.equal(mem.has("tr1"), true);
    assert.equal(mem.has("tr_s2"), true);
    assert.deepEqual(loadAutosave(), auto);
    assert.deepEqual(sanitizeSave(readSlot(2)), auto);

    deleteSlot(2);
    assert.equal(readSlot(2), null);
  } finally {
    globalThis.localStorage = prev;
  }
});

test("9c: portableProfile and mergeProfile are pure and isolate world state from guest profile changes", () => {
  const hostSave = sanitizeSave(V12_SAVE);
  hostSave.world.board = [{ type: "mine", tier: 1, p: 0, n: 8, r: 500, o: "ferrite" }];
  const hostSnapshot = JSON.parse(JSON.stringify(hostSave));

  // Extract portable profile for a guest trip into another player's world.
  const guest = portableProfile(hostSave);
  assert.equal("base" in guest, false);
  assert.equal("store" in guest, false);
  assert.equal("board" in guest, false);
  assert.equal(guest.cr, 4850);

  // Mutate guest profile as if playing in another world.
  guest.cr = 7200;
  guest.kills += 5;
  guest.msl = 2;
  guest.holds.prospector.voidite = 20;
  guest.hp.prospector = 0.6;
  assert.deepEqual(hostSave, hostSnapshot, "portableProfile must deep-clone so hostSave is untouched");

  // Merge guest profile back into the player's own save; their own station/world stays intact.
  const merged = mergeProfile(hostSave, guest);
  assert.deepEqual(hostSave, hostSnapshot, "mergeProfile must not mutate input save");
  assert.equal(merged.v, 20);
  assert.equal(merged.profile.cr, 7200);
  assert.equal(merged.profile.kills, 22);
  assert.equal(merged.profile.msl, 2);
  assert.equal(merged.profile.holds.prospector.voidite, 20);
  assert.equal(merged.profile.hp.prospector, 0.6);
  assert.deepEqual(merged.world, hostSnapshot.world, "own station store, base and board stay untouched");

  // Mutating `guest` after mergeProfile does not leak into `merged`.
  guest.cr = 0;
  assert.equal(merged.profile.cr, 7200);
});
