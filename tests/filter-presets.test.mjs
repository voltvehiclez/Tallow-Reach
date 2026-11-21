import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanFilterPresets, presetSlotsHtml, presetMenuHtml, FILTER_PRESET_COUNT } from "../src/ui/pocket-list.js";
import { newSave, sanitizeSave, SAVE_VERSION } from "../src/state/profile.js";

test("filter presets: seven slots, empty by default, damaged entries dropped", () => {
  assert.equal(FILTER_PRESET_COUNT, 7);
  assert.deepEqual(cleanFilterPresets(null), Array(7).fill(null));
  const clean = cleanFilterPresets([
    { name: "Mining", filters: { Ship: false, Cargo: true } },
    "junk",
    { filters: { Station: false } },
  ]);
  assert.equal(clean[0].name, "Mining");
  assert.equal(clean[0].filters.Ship, false);
  assert.equal(clean[0].filters.Station, true, "missing kinds default on");
  assert.equal(clean[1], null);
  assert.equal(clean[2].filters.Station, false);
  assert.equal(clean.length, 7);
});

test("preset slots render a plus for empty and a name for filled; the menu offers rename and reset", () => {
  const presets = cleanFilterPresets([{ name: "Mining", filters: {} }]);
  const html = presetSlotsHtml(presets, 0);
  assert.match(html, /data-pocket-preset="0"[^>]*>Mining</);
  assert.match(html, /data-pocket-preset="1"[^>]*>\+</);
  const menu = presetMenuHtml(presets[0], 0);
  assert.match(menu, /data-preset-rename="0"/);
  assert.match(menu, /data-preset-reset="0"/);
});

test("save v28: an older save loads with seven empty presets and keeps everything else", () => {
  const old = newSave();
  old.v = 27;
  delete old.profile.pocketFilterPresets;
  old.profile.cr = 4321;
  const clean = sanitizeSave(JSON.parse(JSON.stringify(old)));
  assert.equal(clean.v, SAVE_VERSION);
  assert.equal(SAVE_VERSION, 28);
  assert.deepEqual(clean.profile.pocketFilterPresets, Array(7).fill(null));
  assert.equal(clean.profile.cr, 4321);
  const withPresets = newSave();
  withPresets.profile.pocketFilterPresets = [{ name: "Combat", filters: { "Asteroid field": false } }];
  const roundTripped = sanitizeSave(JSON.parse(JSON.stringify(withPresets)));
  assert.equal(roundTripped.profile.pocketFilterPresets[0].name, "Combat");
  assert.equal(roundTripped.profile.pocketFilterPresets[0].filters["Asteroid field"], false);
});

test("the earth-like planet class exists, generates, and backs the main menu", async () => {
  const { PLANET_CLASSES, PLANET_CLASS_IDS, makePlanet } = await import("../src/data/planets.js");
  assert.ok(PLANET_CLASS_IDS.includes("earth"));
  assert.match(PLANET_CLASSES.earth.n, /Earth-like/);
  const seen = new Set();
  for (let seed = 1; seed < 400 && !seen.has("earth"); seed++) {
    seen.add(makePlanet(`p${seed}`, "Test", "b", `sys${seed}`, seed).classId);
  }
  assert.ok(seen.has("earth"), "the world generator can roll an earth-like world");
  const { readFileSync } = await import("node:fs");
  assert.match(readFileSync("src/render/menuview.js", "utf8"), /classId: "earth"/, "the title backdrop is the earth-like world");
});
