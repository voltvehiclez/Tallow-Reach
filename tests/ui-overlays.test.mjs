// The overlays and the title screen: what may open where, in what order, and
// what the title camera is looking at.
//
// The owner reported that the pause menu and the starmap were refused while
// docked, that Exit to main menu left the engine humming behind the title, and
// that the title background was whatever the last game view happened to be.
// These tests pin the parts that can be checked without a browser:
//   - the pause card's order (Resume first, Exit to main menu last),
//   - both overlays are allowed at a station,
//   - the title camera path frames the station with its planet behind it,
//   - the audio fade is safe to call with no speakers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { state } from "../src/state/state.js";
import { canPause, canOpenStarmap, pauseOverlayHtml } from "../src/ui/overlays.js";
import { MENU_CAMERA, menuPose } from "../src/data/camera.js";
import { fadeToSilence } from "../src/core/audio.js";

const player = (over = {}) => ({ docked: false, dead: false, warp: null, place: "reach", ...over });

test("pause card: Resume is the first control and Exit to main menu the last", () => {
  const html = pauseOverlayHtml();
  const order = [...html.matchAll(/id="(pz-[a-z-]+)"/g)].map(m => m[1]);
  assert.deepEqual(order, ["pz-resume", "pz-sound", "pz-main-menu"],
    "the card reads Resume, then the sound switch, then Exit to main menu");
  assert.ok(html.indexOf("Resume") < html.indexOf("Exit to main menu"), "Resume is above Exit to main menu");
  assert.match(html, /P or Esc to resume/, "the hint stays with the title");
});

test("both overlays open at a station: docked is part of the open world", () => {
  const prev = { intro: state.ui.intro, paused: state.paused, cargo: state.ui.cargo, galaxy: state.galaxy };
  try {
    state.ui.intro = false;
    state.paused = false;
    state.galaxy = { pockets: {} };
    assert.equal(canPause(state.ui), true, "pausing a docked pilot is allowed");
    assert.equal(canOpenStarmap(player({ docked: true }), state.ui, state.galaxy), true,
      "reading the chart at a station is allowed");
    assert.equal(canOpenStarmap(player({ docked: false }), state.ui, state.galaxy), true, "and in flight");

    state.ui.intro = true;
    assert.equal(canPause(state.ui), false, "the title screen owns the screen");
    assert.equal(canOpenStarmap(player({ docked: true }), state.ui, state.galaxy), false, "no chart in the menu");

    state.ui.intro = false;
    state.paused = true;
    assert.equal(canOpenStarmap(player(), state.ui, state.galaxy), false, "the pause overlay is already up");
    state.paused = false;
    assert.equal(canOpenStarmap(player({ warp: {} }), state.ui, state.galaxy), false, "not mid-warp");
    assert.equal(canOpenStarmap(player({ dead: true }), state.ui, state.galaxy), false, "not while dead");
    state.ui.cargo = { open: true };
    assert.equal(canOpenStarmap(player(), state.ui, state.galaxy), false, "not on top of the flight inventory");
    state.ui.cargo = null;
  } finally {
    state.ui.intro = prev.intro;
    state.paused = prev.paused;
    state.ui.cargo = prev.cargo;
    state.galaxy = prev.galaxy;
  }
});

test("title camera: same view every time, station framed with its planet behind it", () => {
  // Meridian's planet, from data/places.js: the direction the camera must face away from.
  const planetDir = [-7000, -1500, -10000];
  const len = Math.hypot(...planetDir);
  const unit = planetDir.map(v => v / len);
  let minDot = Infinity, maxDot = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let t = 0; t <= 1000; t += 5) {
    const { pos, look, dist } = menuPose(t, planetDir);
    assert.equal(look[0], 0);
    assert.equal(look[2], 0);
    assert.equal(look[1], MENU_CAMERA.lookHeight, "the camera always aims at the station");
    assert.ok(dist > 300 && dist < 800, `camera stays a cinematic distance away (${dist.toFixed(0)})`);
    assert.ok(pos[1] > 0, "the camera stays above the ring plane");
    // Unit vector from the station to the camera: it must point away from the
    // planet, or the planet would not be behind the station.
    const radial = Math.hypot(...pos);
    const dot = pos.reduce((sum, v, i) => sum + (v / radial) * unit[i], 0);
    minDot = Math.min(minDot, dot);
    maxDot = Math.max(maxDot, dot);
    minY = Math.min(minY, pos[1]);
    maxY = Math.max(maxY, pos[1]);
  }
  assert.ok(maxDot < -0.6, `the camera stays opposite the planet (worst ${maxDot.toFixed(2)})`);
  assert.ok(minDot > -1, "and never swings past it");
  assert.ok(maxY - minY > 5, "the elevation drifts, so the shot is not static");
});

test("the audio fade is safe with no speakers", () => {
  assert.doesNotThrow(() => fadeToSilence());
  assert.doesNotThrow(() => fadeToSilence(0));
});
