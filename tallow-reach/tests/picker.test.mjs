// The Outfitting picker rule: one open at a time, click the open one to close it.
// Pure functions, so this runs without a browser. See src/ui/picker.js.

import { test } from "node:test";
import assert from "node:assert/strict";
import { toggleModulePicker, togglePaintPicker } from "../src/ui/picker.js";

test("clicking a module bay opens its picker and clicking it again closes it", () => {
  let fit = null;
  fit = toggleModulePicker(fit, "power", 0);
  assert.deepEqual(fit, { kind: "module", g: "power", i: 0 });

  fit = toggleModulePicker(fit, "power", 0);
  assert.equal(fit, null, "the same bay shuts it again");
});

test("one picker at a time: another bay replaces the open one", () => {
  let fit = toggleModulePicker(null, "power", 0);
  fit = toggleModulePicker(fit, "primary", 1);
  assert.deepEqual(fit, { kind: "module", g: "primary", i: 1 }, "the new bay is the open one");

  // Bay 0 of a different group is a different bay, even at the same index.
  fit = toggleModulePicker(fit, "cell", 1);
  assert.deepEqual(fit, { kind: "module", g: "cell", i: 1 });
});

test("paint bays and module bays share the one picker", () => {
  let fit = toggleModulePicker(null, "power", 0);
  fit = togglePaintPicker(fit, "primary");
  assert.deepEqual(fit, { kind: "paint", k: "primary" }, "the paint bay takes over");

  fit = toggleModulePicker(fit, "power", 0);
  assert.deepEqual(fit, { kind: "module", g: "power", i: 0 }, "and a module bay takes it back");

  fit = togglePaintPicker(fit, "primary");
  assert.deepEqual(fit, { kind: "paint", k: "primary" });
  fit = togglePaintPicker(fit, "primary");
  assert.equal(fit, null, "the same paint bay closes it");

  fit = togglePaintPicker(null, "secondary");
  fit = togglePaintPicker(fit, "primary");
  assert.deepEqual(fit, { kind: "paint", k: "primary" }, "the other paint bay replaces it");
});
