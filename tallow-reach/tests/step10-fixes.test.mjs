// Owner playtest fixes after step 10:
//   1. sound was dead when a save resumed out in space (start screen skipped)
//   2. docking showed the start screen again instead of the station menu
//   3. Load slot appeared to do nothing (a ReferenceError after the save applied)
//
// The real ui/menu.js runs here against a small DOM stand-in; render/ and core/
// are the usual headless stand-ins, so calls into sound are recorded.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadHeadless } from "./headless.mjs";

const els = new Map();
function makeEl(id) {
  return {
    id, hidden: false, _html: "", handlers: {}, dataset: {}, style: {},
    clientWidth: 1200, clientHeight: 800, scrollLeft: 0, scrollTop: 0,
    addEventListener(t, fn) { this.handlers[t] = fn; },
    classList: { toggle() {}, add() {}, remove() {} },
    set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    append() {}, remove() {}, focus() {}, select() {}, closest() { return null; },
  };
}
globalThis.document = {
  getElementById: id => { if (!els.has(id)) els.set(id, makeEl(id)); return els.get(id); },
  createElement: tag => makeEl(tag),
};
const mem = new Map();
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k),
};

const m = await loadHeadless("src/ui/menu.js", {
  state: "src/state/state.js",
  currentSave: "src/state/state.js",
  applySave: "src/state/state.js",
  resetPlaces: "src/state/state.js",
  newProfile: "src/state/profile.js",
  newSave: "src/state/profile.js",
  createPlayer: "src/sim/player.js",
  configurePlayer: "src/sim/session.js",
  resumeFromSave: "src/sim/session.js",
  dock: "src/sim/session.js",
  encodeSave: "src/state/storage.js",
});
const { state } = m;
const panel = document.getElementById("panel");

let wired = false;   // setupMenu must run once only: it registers bus handlers

/** Boot a fresh game and wire the panel once (setupMenu registers bus handlers). */
function boot(place = "reach", intro = true) {
  m.resetPlaces();
  mem.clear();
  state.players.length = 0;
  state.localPlayerIndex = 0;
  state.profile = m.newProfile();
  state.worldState = m.newSave().world;
  state.worldState.place = place;
  state.place = place;
  state.ui.intro = intro;
  state.ui.tab = "s";
  state.ui.toast = "";
  state.ui.xcode = "";
  const P = m.configurePlayer(m.createPlayer(), state.profile);
  P.place = place;
  if (wired) m.render();   // boot draws the start screen or the station menu
  return P;
}

/** Press a panel button. Returns the error it threw, or null. */
function click(a, b) {
  const btn = { dataset: { a, b }, disabled: false, closest: () => null };
  const e = { target: { closest: sel => (sel === "button[data-a]" ? btn : null) }, shiftKey: false };
  try { panel.handlers.click(e); return null; } catch (err) { return err; }
}

boot();
m.setupMenu();
wired = true;

test("fix 3: Load slot restores the save and redraws the panel in the same click", () => {
  const P = boot("reach", false);
  P.docked = true;
  assert.equal(state.profile.cr, 600);
  assert.equal(click("sv", "1"), null, "saving a slot must not throw");
  assert.equal(JSON.parse(mem.get("tr_s1")).profile.cr, 600);

  state.profile.cr = 594;                 // as if modules had been bought
  m.render();
  assert.ok(panel.innerHTML.includes("594 cr"), "panel shows the spent balance");

  assert.equal(click("ld", "1"), null, "loading a slot must not throw");
  assert.equal(state.profile.cr, 600, "credits come back");
  assert.ok(panel.innerHTML.includes("600 cr"), "and the panel shows them without another click");
  assert.equal(state.ui.toast, "Loaded slot 1");
  assert.equal(JSON.parse(mem.get("tr_s1")).profile.cr, 600, "the slot itself is untouched");
});

test("fix 3: a slot holding an away save puts the pilot back out in space", () => {
  const P = boot("reach", false);
  P.docked = true;
  state.worldState.place = "hollow";
  assert.equal(click("sv", "2"), null);
  state.worldState.place = "reach";
  state.profile.cr = 100;

  assert.equal(click("ld", "2"), null);
  assert.equal(state.place, "hollow");
  assert.equal(P.docked, false, "an away save resumes flying");
  assert.equal(panel.hidden, true, "and the station panel is not left open over the flight HUD");
});

test("fix 3: Import applies a good code, and a bad code leaves the game alone", () => {
  const P = boot("reach", false);
  P.docked = true;
  const save = m.currentSave();
  save.profile.cr = 4850;
  const code = m.encodeSave(save);

  document.getElementById("xt").value = code;
  assert.equal(click("im"), null);
  assert.equal(state.profile.cr, 4850);
  assert.equal(state.ui.toast, "Save imported.");
  assert.ok(panel.innerHTML.includes("4850 cr"));

  document.getElementById("xt").value = "TR1:garbage";
  assert.equal(click("im"), null);
  assert.equal(state.profile.cr, 4850, "a damaged code changes nothing");
  assert.equal(state.ui.toast, "That code is not a valid save.");
});

test("fix 3: Reset progress works and leaves the pilot docked at the home station", () => {
  const P = boot("hollow", false);
  state.profile.cr = 42;
  assert.equal(click("rs2"), null);
  assert.equal(state.profile.cr, 600);
  assert.equal(state.place, "reach");
  assert.equal(P.docked, true);
  assert.equal(panel.hidden, false);
});

test("fix 2: docking always shows the station menu, never the start screen again", () => {
  // Boot an away save: the start screen is up and the ship is prepared out in space.
  const P = boot("hollow", true);
  m.resumeFromSave(P);
  assert.equal(P.docked, false);
  assert.equal(panel.hidden, false, "the start screen owns the panel while it is up");
  assert.ok(panel.innerHTML.includes("Enter game"), "and it is still the start screen");

  assert.equal(click("intro"), null, '"Enter game"');
  assert.equal(state.ui.intro, false);
  assert.equal(P.docked, false, "it deploys the pilot where the save put them");
  assert.equal(state.place, "hollow");
  assert.equal(panel.hidden, true);

  // Fly home and dock: straight into the station menu.
  m.dock(P);
  assert.equal(P.docked, true);
  assert.equal(panel.hidden, false);
  assert.ok(panel.innerHTML.includes("Contracts"), "the station menu with its tabs");
  assert.ok(!panel.innerHTML.includes("Enter game"), "not the start screen");
  assert.equal(state.ui.intro, false, "the start screen never comes back");
});

test("fix 2: a station save deploys straight into the station menu", () => {
  const P = boot("reach", true);
  m.resumeFromSave(P);
  assert.ok(panel.innerHTML.includes("Enter game"));
  assert.equal(click("intro"), null);
  assert.equal(P.docked, true);
  assert.equal(panel.hidden, false);
  assert.ok(panel.innerHTML.includes("Contracts"));
});

test("fix 1: sound is started by a user gesture, not only by the start button", () => {
  const main = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  assert.match(main, /addEventListener\("pointerdown",\s*\(\)\s*=>\s*initAudio\(\)/,
    "a click starts or resumes the audio context");
  assert.match(main, /addEventListener\("keydown",\s*\(\)\s*=>\s*initAudio\(\)/,
    "so does a key press");
  assert.match(main, /import \{ updateAudio, initAudio \} from "\.\/core\/audio\.js"/);

  // And the start button still starts it (recorded by the headless sound stand-in).
  boot("hollow", true);
  const mark = m.__calls.length;
  assert.equal(click("intro"), null);
  assert.ok(m.__calls.slice(mark).some(c => c.name === "initAudio"), "Enter game starts sound too");
});

test("fix 2: nothing simulates behind the start screen", () => {
  const main = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  assert.match(main, /if \(state\.paused \|\| state\.ui\.intro\)/);
  assert.match(main, /const playing = !state\.ui\.intro &&/);
});
