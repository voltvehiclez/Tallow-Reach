// The pointer over the empty screen. The canvas hides the system pointer for
// mouse-look flight, because the HUD draws its own reticle; while the HUD is
// away (title screen, docked) there is no reticle, so the real pointer must come
// back or the mouse vanishes beside the station panel.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = file => readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");

test("the system pointer returns whenever the flight reticle is off screen", () => {
  const styles = read("styles.css");
  const hud = read("ui/hud.js");

  assert.match(styles, /canvas \{[^}]*cursor: none;/, "the canvas hides the pointer in flight");
  assert.match(styles, /body\.no-reticle canvas \{\s*cursor: default;/, "and shows it again when the HUD is away");

  assert.match(hud, /classList\.toggle\("no-reticle", !visible\)/,
    "the HUD keeps the body class in step with its own visibility");
  assert.match(hud, /on\("docked",[^]*?setReticle\(false\)/, "docking brings the pointer back");
  assert.match(hud, /on\("launched",[^]*?setReticle\(true\)/, "launching hands the screen back to the reticle");
  assert.match(hud, /on\("main-menu",[^]*?setReticle\(false\)/, "and so does the title screen");
  assert.match(hud, /setReticle\(!el\.root\.hidden\)/, "the boot state is synced with the hidden HUD in index.html");
  assert.doesNotMatch(hud, /el\.root\.hidden = (true|false)/,
    "no path may hide the HUD without the pointer following it");
});
