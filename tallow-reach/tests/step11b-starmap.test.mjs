// Step 11B: the live map, direct-hop warp, compact v16 saves and safe recovery.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GALAXY, GALAXY_OVERRIDES } from "../src/data/galaxy.js";
import { DEFAULT_PLACE, placeAt, pocketsIn, setPlaceCatalog } from "../src/data/places.js";
import { SAVE_VERSION, newSave, sanitizeSave } from "../src/state/profile.js";
import { state, applySave, currentSave, resetPlaces } from "../src/state/state.js";
import { encodeSave, decodeSave, loadAutosave, saveAutosave, writeSlot, readSlot } from "../src/state/storage.js";
import { generateGalaxy, recordSystemVisit, systemPocketLayout } from "../src/sim/galaxy.js";
import { prepareGalaxySave } from "../src/sim/galaxy-session.js";
import { createPlayer } from "../src/sim/player.js";
import { configurePlayer, resumeFromSave } from "../src/sim/session.js";
import { loadPlace, stationAt, fieldAt } from "../src/sim/places.js";
import { startWarp, updateWarp } from "../src/sim/sectors.js";
import { TRAVEL_REQUIREMENTS, travelQuote } from "../src/sim/travel.js";
import { isSimulationPaused } from "../src/sim/step.js";
import { WARP_TIME } from "../src/data/sectors.js";
import { BINDINGS, keys, pointer, syncControls, clearControls } from "../src/core/input.js";
import {
  visibleSystems, systemEdges, chartBounds, chartViewBox, chartPixelScale, pocketChoices,
  pocketConnections, systemChartBounds, systemChartViewBox, interpolateViewBox, contextMenuPosition,
  galaxyPanSpeed, panDelta, galaxyPanDelta, pocketLabelPosition, exitChoice,
} from "../src/ui/starmap.js";
import { loadHeadless } from "./headless.mjs";

const V13 = JSON.parse(readFileSync(new URL("./saves/v13-real.json", import.meta.url), "utf8"));
const V12 = JSON.parse(readFileSync(new URL("./saves/v12-real.json", import.meta.url), "utf8"));
// Produced by the pre-11B (HEAD) sanitizer from the real v13 character plus a
// v15 flying resume. No owner-exported v15 was available; this is a versioned
// regression fixture, not a claimed new owner save.
const V15 = JSON.parse(readFileSync(new URL("./saves/v15-pre11b.json", import.meta.url), "utf8"));

function fresh(seed = GALAXY.seed) {
  resetPlaces();
  state.players.length = 0;
  state.localPlayerIndex = 0;
  state.ui.intro = false;
  state.ui.starmap = null;
  state.paused = false;
  state.multiplayer = false;
  state.freeCam.on = false;
  const raw = newSave();
  raw.world.galaxy.seed = seed;
  const save = prepareGalaxySave(raw);
  applySave(save);
  const P = configurePlayer(createPlayer(), save.profile);
  P.docked = false;
  P.pos.set(0, 0, 300);
  P.flight.spawnT = 1e9;
  state.time = 0;
  return P;
}

function oldV15() {
  const s = newSave();
  s.v = s.profile.v = s.world.v = 15;
  s.world.galaxy = null;
  s.world.place = "hollow";
  s.world.resume = { pos: [120, 30, -450], quat: [0, 0, 0, 1], sh: 4, en: 2 };
  s.profile.cr = 4850;
  s.profile.holds.wasp.ferrite = 9;
  return s;
}

test("11B: new saves are v16 and store only seed plus compact system knowledge", () => {
  assert.equal(SAVE_VERSION, 16);
  const s = newSave();
  assert.deepEqual(Object.keys(s.world.galaxy).sort(), ["knowledge", "seed"]);
  assert.equal(s.world.galaxy.seed, GALAXY.seed);
  assert.deepEqual(s.world.galaxy.knowledge.meridian, { discovered: true, visited: true });
  for (const forbidden of ["systems", "pockets", "links", "positions"]) assert.equal(forbidden in s.world.galaxy, false);
  assert.deepEqual(sanitizeSave(s), s);
});

test("11B: a real-shaped v15 resume save migrates without losing character, cargo or spot", () => {
  const old = oldV15();
  const before = JSON.parse(JSON.stringify(old));
  const s = prepareGalaxySave(old);
  assert.equal(s.v, 16);
  assert.equal(s.world.place, "hollow");
  assert.deepEqual(s.world.resume, before.world.resume);
  assert.equal(s.profile.cr, 4850);
  assert.equal(s.profile.holds.wasp.ferrite, 9);
  assert.equal(s.world.galaxy.seed, GALAXY.seed);
  assert.deepEqual(old, before, "migration does not mutate the old save");
  assert.deepEqual(decodeSave(encodeSave(s), prepareGalaxySave), s);
});

test("11B: v13 and v12 fixtures still migrate through the world-aware loader", () => {
  for (const raw of [V13, V12]) {
    const s = prepareGalaxySave(raw);
    assert.equal(s.v, 16);
    assert.equal(s.profile.cr, raw.profile?.cr ?? raw.cr);
    assert.deepEqual(s.profile.holds, raw.profile?.holds ?? raw.holds);
    assert.ok(state.galaxy.pocketsById[s.world.place]);
  }
});

test("11B: a custom seed and generated-pocket resume regenerate exactly from compact data", () => {
  fresh(42);
  const expected = JSON.stringify(generateGalaxy(42));
  state.worldState.place = "sys-010-hub";
  state.player.place = "sys-010-hub";
  state.place = "sys-010-hub";
  state.player.pos.set(10, 20, 30);
  recordSystemVisit(state.galaxy, state.worldState.galaxy.knowledge, "sys-010-hub");
  const save = currentSave();
  const compact = JSON.stringify(save.world.galaxy);
  assert.ok(compact.length < 1000, "knowledge stays compact, not a geography dump");
  const back = decodeSave(encodeSave(save), prepareGalaxySave);
  assert.equal(back.world.place, "sys-010-hub");
  assert.deepEqual(back.world.resume.pos, [10, 20, 30]);
  assert.equal(JSON.stringify(state.galaxy), expected);
});

test("11B: a removed pocket returns the pilot to the home station with character and cargo intact", () => {
  const saved = {
    places: { ...GALAXY_OVERRIDES.places }, links: { ...GALAXY_OVERRIDES.links },
    removedPlaces: [...GALAXY_OVERRIDES.removedPlaces], removedLinks: [...GALAXY_OVERRIDES.removedLinks],
  };
  try {
    GALAXY_OVERRIDES.places["test-annex"] = {
      kind: "pocket", parent: "meridian", def: "empty", n: "Test Annex", d: "Temporary test pocket.",
      enter: { kind: "warp", pos: [0, 0, 300] }, leave: { kind: "warp" },
    };
    GALAXY_OVERRIDES.links["test-annex-link"] = { kind: "internal", a: "reach", b: "test-annex", mode: "warp", cost: {}, requires: [] };
    fresh();
    state.profile.cr = 1234;
    state.profile.holds.wasp.ferrite = 7;
    state.worldState.place = "test-annex";
    state.worldState.resume = { pos: [1, 2, 3], quat: [0, 0, 0, 1], sh: 2, en: 1 };
    const profileBefore = JSON.parse(JSON.stringify(currentSave().profile));
    const code = encodeSave(currentSave());
    GALAXY_OVERRIDES.removedPlaces.push("test-annex");
    const back = decodeSave(code, prepareGalaxySave);
    assert.equal(back.world.place, DEFAULT_PLACE);
    assert.equal(back.world.resume, null);
    assert.deepEqual(back.profile, profileBefore, "the whole character survives");
    assert.deepEqual(state.galaxyRecovery, { from: "test-annex", to: "reach" });
    applySave(back);
    resumeFromSave(state.player);
    assert.equal(state.player.docked, true, "the normal loader docks at the safe home station");
    assert.deepEqual(state.player.pos.toArray(), stationAt(DEFAULT_PLACE).pos);
    assert.equal(placeAt("test-annex").id, "reach", "live lookup also falls back safely");
  } finally {
    Object.assign(GALAXY_OVERRIDES, saved);
    fresh();
  }
});

test("11B: autosave, slots and TR1 codes keep their keys/prefix and use the same seed preparation", () => {
  const mem = new Map();
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k),
  };
  try {
    fresh(77);
    state.worldState.place = "hollow";
    const save = currentSave();
    assert.equal(saveAutosave(save), true);
    assert.equal(writeSlot(2, save), true);
    assert.ok(mem.has("tr1") && mem.has("tr_s2"));
    assert.equal(loadAutosave(prepareGalaxySave).world.galaxy.seed, 77);
    assert.equal(prepareGalaxySave(readSlot(2)).world.galaxy.seed, 77);
    const code = encodeSave(save);
    assert.ok(code.startsWith("TR1:"));
    assert.equal(decodeSave(code, prepareGalaxySave).world.galaxy.seed, 77);
    assert.equal(JSON.parse(mem.get("tr1")).v, 16);
  } finally {
    if (previous === undefined) delete globalThis.localStorage; else globalThis.localStorage = previous;
  }
});

test("11B: moving a system is still a data edit in the live place catalog", () => {
  const previous = GALAXY_OVERRIDES.places["sys-004"];
  try {
    GALAXY_OVERRIDES.places["sys-004"] = { pos: [180, -260] };
    fresh();
    assert.deepEqual(placeAt("sys-004").pos, [180, -260]);
    assert.ok(pocketsIn("sys-004").includes("sys-004-hub"));
    assert.ok(chartBounds(visibleSystems(state.galaxy)).every(Number.isFinite));
  } finally {
    if (previous === undefined) delete GALAXY_OVERRIDES.places["sys-004"]; else GALAXY_OVERRIDES.places["sys-004"] = previous;
    fresh();
  }
});

test("11B: visibility policy controls chart nodes and edges; pocket quotes explain non-direct hops", () => {
  fresh();
  const world = state.galaxy;
  assert.equal(visibleSystems(world).length, 121);
  assert.ok(systemEdges(world).length > 0);
  const choices = pocketChoices(world, "reach", "sys-001");
  assert.ok(choices.length >= 2);
  assert.ok(choices.every(c => !c.canWarp && c.status.includes("No direct route")));
  world.visibility.mode = "discovered";
  assert.deepEqual(visibleSystems(world, { meridian: { discovered: true } }).map(s => s.id), ["meridian"]);
  assert.deepEqual(systemEdges(world, { meridian: { discovered: true } }), []);
  const home = pocketChoices(world, "reach", "meridian");
  assert.equal(home.find(c => c.pocket.id === "hollow").canWarp, true);
  assert.equal(home.find(c => c.pocket.id === "reach").current, true);
  assert.ok(home.filter(c => c.pocket.role === "gate").every(c => c.canWarp && c.peer));
  world.visibility.mode = "all";
  const box = chartViewBox(world, { zoom: 2, pan: [10, -5] });
  assert.ok(box.every(Number.isFinite) && box[2] > 0 && box[3] > 0);
  assert.equal(chartPixelScale([0, 0, 2000, 1000], 800, 600), 2.5);
});

test("11B: M is a map action and an open map releases flight controls", () => {
  const P = fresh();
  assert.equal(BINDINGS.KeyM, "starmap");
  keys.KeyW = 1; keys.fire = 1; pointer.x = 0.8;
  state.ui.starmap = { selected: "meridian", zoom: 1, pan: [0, 0] };
  syncControls();
  assert.equal(P.controls.thrust, 0);
  assert.equal(P.controls.fire, false);
  assert.deepEqual(P.controls.steer, { x: 0, y: 0 });
  clearControls();
  state.ui.starmap = null;
  syncControls();
  assert.equal(P.controls.thrust, 0);
});

test("11B: single-player chart pauses the frame gate; a future hosted world keeps running", () => {
  fresh();
  state.ui.starmap = { selected: "meridian" };
  assert.equal(isSimulationPaused(), true);
  state.multiplayer = true;
  assert.equal(isSimulationPaused(), false);
  state.paused = true;
  assert.equal(isSimulationPaused(), true);
  state.paused = false;
  state.multiplayer = false;
  state.ui.starmap = null;
});

test("11B: route-only warp refuses non-direct/closed/unknown-requirement routes and never charges credits", () => {
  const P = fresh();
  state.galaxy.systemsById.meridian.intraSystem = "links";
  const credits = state.profile.cr;
  assert.equal(startWarp(P, "sys-001-hub"), false);
  assert.equal(P.warp, null);
  assert.match(state.hud.msg, /No direct route/);
  const link = state.galaxy.links["reach-hollow"];
  link.enabled = false;
  assert.equal(startWarp(P, "hollow"), false);
  assert.match(state.hud.msg, /closed/);
  link.enabled = true;
  link.requires = [{ type: "not-registered" }];
  assert.equal(startWarp(P, "hollow"), false);
  link.requires = [];
  link.cost = { fuel: 1 };
  assert.equal(startWarp(P, "hollow"), false);
  assert.match(state.hud.msg, /cost/);
  link.cost = {};
  assert.equal(state.profile.cr, credits);
});

test("11B: a route-only data requirement can use pilot context without changing the map", () => {
  const P = fresh();
  state.galaxy.systemsById.meridian.intraSystem = "links";
  const link = state.galaxy.links["reach-hollow"];
  TRAVEL_REQUIREMENTS["test-credits"] = ({ req, context }) => context.profile.cr >= req.min || "Not enough credits.";
  try {
    link.requires = [{ type: "test-credits", min: state.profile.cr + 1 }];
    assert.equal(startWarp(P, "hollow"), false);
    assert.equal(state.hud.msg, "Not enough credits.");
    link.requires = [{ type: "test-credits", min: 1 }];
    assert.equal(startWarp(P, "hollow"), true);
  } finally {
    link.requires = [];
    delete TRAVEL_REQUIREMENTS["test-credits"];
  }
});

test("11B: the existing warp sequence crosses one gate to its exact reciprocal peer", () => {
  const P = fresh();
  assert.equal(startWarp(P, "hollow"), true);
  updateWarp(WARP_TIME);
  assert.equal(P.place, "hollow");
  assert.equal(stationAt("hollow"), null);
  const internal = Object.values(state.galaxy.links).find(l => l.kind === "internal" &&
    (l.a === "hollow" || l.b === "hollow") && state.galaxy.pocketsById[l.a === "hollow" ? l.b : l.a].role === "gate");
  assert.equal(internal, undefined, "Kestrel Hollow is not a gate or internal junction");
  const gate = "meridian-gate-sys-001";
  assert.equal(startWarp(P, gate), true, "free local warp reaches a gate directly from Kestrel Hollow");
  updateWarp(WARP_TIME);
  assert.equal(P.place, gate);
  const external = Object.values(state.galaxy.links).find(l => l.kind === "gate" && (l.a === gate || l.b === gate));
  const peer = external.a === gate ? external.b : external.a;
  assert.equal(startWarp(P, peer), true);
  updateWarp(WARP_TIME);
  assert.equal(P.place, peer);
  assert.equal(placeAt(peer).parent, "sys-001");
  assert.deepEqual(state.worldState.galaxy.knowledge["sys-001"], { discovered: true, visited: true });
  const empty = loadPlace(peer);
  for (const list of Object.values(empty.entities)) assert.deepEqual(list, []);
  assert.equal(stationAt(peer), null);
  assert.equal(fieldAt(peer), null);
  assert.equal(currentSave().world.place, peer);
});

// The real UI module against a tiny DOM. Core audio/input are the usual headless
// stand-ins; clicks go through its actual delegated handler and event bus.
function makeEl(tag = "div") {
  return {
    tag, id: "", hidden: false, innerHTML: "", dataset: {}, style: {}, handlers: {}, attrs: {},
    addEventListener(type, fn) { this.handlers[type] = fn; },
    setAttribute(k, v) { this.attrs[k] = v; },
    appendChild() {}, append() {}, remove() {}, querySelector() { return null; },
    querySelectorAll() { return []; }, focus() {}, select() {}, closest() { return null; },
    classList: { toggle() {}, add() {}, remove() {} },
    clientWidth: 1200, clientHeight: 800, scrollLeft: 0, scrollTop: 0,
    setPointerCapture() {}, getBoundingClientRect() { return { width: 800, height: 600 }; },
  };
}
const domEls = new Map();
globalThis.document = {
  createElement: makeEl,
  getElementById: id => { if (!domEls.has(id)) domEls.set(id, makeEl(id)); return domEls.get(id); },
  body: { appendChild() {} },
};
const ui = await loadHeadless("src/ui/starmap.js", {
  state: "src/state/state.js", applySave: "src/state/state.js", newSave: "src/state/profile.js",
  prepareGalaxySave: "src/sim/galaxy-session.js", createPlayer: "src/sim/player.js",
  configurePlayer: "src/sim/session.js", on: "src/util/events.js", emit: "src/util/events.js",
});
let mapRoot = null;

test("11B: real map opens, inspects systems, zooms into a pocket map and right-click warps", () => {
  const save = ui.prepareGalaxySave(ui.newSave());
  ui.applySave(save);
  const P = ui.configurePlayer(ui.createPlayer(), save.profile);
  P.docked = false; P.place = "reach";
  ui.state.ui.intro = false; ui.state.ui.starmap = null; ui.state.paused = false; ui.state.multiplayer = false;
  // Capture the real root that setupStarmap appends to the stub body.
  const appended = [];
  const oldAppend = document.body.appendChild;
  document.body.appendChild = el => appended.push(el);
  ui.setupStarmap();
  document.body.appendChild = oldAppend;
  const map = appended[0];
  mapRoot = map;
  assert.equal(ui.openStarmap(), true);
  assert.equal(map.hidden, false);
  assert.equal((map.innerHTML.match(/data-system="/g) || []).length, 121);
  // The right panel is a compact overview, not a stack of travel cards/buttons.
  assert.ok(map.innerHTML.includes("Current pocket"));
  assert.ok(map.innerHTML.includes('data-pocket-row="hollow"'));
  for (const old of ["Warp here", "Unavailable", "Advisory tier", "Gate peer:", "sm-pocket-head"]) {
    assert.ok(!map.innerHTML.includes(old), `panel should not contain ${old}`);
  }
  const click = dataset => map.handlers.click({ target: { closest: () => ({ dataset, disabled: false }) } });
  click({ system: "sys-010" });
  assert.equal(ui.state.ui.starmap.selected, "sys-010");
  assert.ok(!map.innerHTML.includes('data-action="travel"'), "remote pockets have no warp buttons");
  click({ action: "zoom-in" });
  assert.ok(ui.state.ui.starmap.zoom > 1);
  assert.equal(ui.state.ui.starmap.mode, "galaxy");
  click({ system: "meridian" });
  map.handlers.dblclick({ target: { closest: () => ({ dataset: { system: "meridian" } }) }, preventDefault() {} });
  assert.equal(ui.state.ui.starmap.mode, "system");
  assert.ok(map.innerHTML.includes('data-pocket="hollow"'));
  assert.ok(!map.innerHTML.includes("sm-pocket-edge"), "free local warp has no internal blue lines");
  assert.ok(!map.innerHTML.includes('data-pockets-edge="reach-hollow"'));
  assert.ok(map.innerHTML.includes("Warp to any pocket in this system"));
  assert.ok(map.innerHTML.includes("data-exit="));
  assert.ok(map.innerHTML.includes('data-peer-system="sys-001"'), "gate stubs name the neighbouring system");
  let prevented = false, stopped = false;
  map.handlers.contextmenu({
    target: { closest: sel => sel.includes("[data-pocket]") ? { dataset: { pocket: "hollow" } } : null },
    clientX: 120, clientY: 140,
    preventDefault() { prevented = true; }, stopPropagation() { stopped = true; },
  });
  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.ok(map.innerHTML.includes("Warp to Kestrel Hollow"));
  const actions = [];
  ui.on("action", action => actions.push(action));
  click({ action: "travel", to: "hollow" });
  assert.deepEqual(actions.at(-1), { name: "travel", to: "hollow", repeat: false });
  click({ action: "close" });
  assert.equal(map.hidden, true);
  assert.equal(ui.state.ui.starmap, null);
  assert.equal(ui.openStarmap(), true);
  assert.equal(ui.state.ui.starmap.mode, "galaxy", "reopening starts at the galaxy web");
  prevented = false;
  map.handlers.keydown({ key: "Enter", target: { closest: () => ({ dataset: { system: "sys-002" } }) },
    preventDefault() { prevented = true; }, stopPropagation() {} });
  assert.equal(prevented, true);
  assert.equal(ui.state.ui.starmap.selected, "sys-002");
  ui.closeStarmap();
});

test("11B: composition root wires map/travel/pause and every save replacement prepares its seed", () => {
  const main = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  const menu = readFileSync(new URL("../src/ui/menu.js", import.meta.url), "utf8");
  assert.match(main, /loadAutosave\(prepareGalaxySave\)/);
  assert.match(main, /case "starmap":/);
  assert.match(main, /startWarp\(localPlayer\(\), nameTo\)/);
  assert.match(main, /if \(isSimulationPaused\(\)\)/);
  assert.match(main, /const playing = .*!isStarmapOpen\(\)/);
  assert.match(menu, /prepareGalaxySave\(raw\)/);
  assert.match(menu, /decodeSave\(text, prepareGalaxySave\)/);
  assert.match(menu, /prepareGalaxySave\(newSave\(\)\)/);
});

test("11B: the pre-11B v15 fixture resumes flying with its character and cargo intact", () => {
  fresh();
  const save = prepareGalaxySave(V15);
  assert.equal(V15.v, 15);
  assert.equal(save.v, 16);
  assert.deepEqual(save.profile, { ...V15.profile, v: 16 });
  assert.deepEqual(save.world.base, V15.world.base);
  assert.deepEqual(save.world.store, V15.world.store);
  assert.deepEqual(save.world.board, V15.world.board);
  assert.deepEqual(save.world.resume, V15.world.resume);
  assert.equal(save.world.place, "hollow");
  applySave(save);
  resumeFromSave(state.player);
  assert.equal(state.player.docked, false);
  assert.deepEqual(state.player.pos.toArray(), V15.world.resume.pos);
  assert.equal(state.profile.cr, 4850);
  assert.equal(state.profile.holds.wasp.ferrite, 14);
});

test("11B: an invalid save cannot leave a candidate galaxy installed behind the old world", () => {
  fresh(42);
  const before = state.galaxy;
  const bad = { v: 16, profile: { v: 16, ships: "not an array" }, world: { galaxy: { seed: 999 } } };
  assert.throws(() => prepareGalaxySave(bad), /not a Tallow Reach save/);
  assert.equal(state.galaxy, before);
  assert.equal(state.galaxyRecovery, null);
  assert.deepEqual(placeAt("sys-001").pos, before.systemsById["sys-001"].pos);
});

test("11B: real map pans by dragging and shows a late travel refusal inside the chart", () => {
  assert.equal(ui.openStarmap(), true);
  const svg = { setPointerCapture() {} };
  mapRoot.handlers.pointerdown({ target: { closest: sel => sel === "svg.sm-chart" ? svg : null },
    button: 0, clientX: 100, clientY: 100, pointerId: 1 });
  mapRoot.handlers.pointermove({ clientX: 140, clientY: 120 });
  const panned = [...ui.state.ui.starmap.pan];
  assert.notDeepEqual(panned, [0, 0]);
  mapRoot.handlers.pointerup({});
  mapRoot.handlers.pointermove({ clientX: 300, clientY: 300 });
  assert.deepEqual(ui.state.ui.starmap.pan, panned);
  ui.emit("travel-denied", { reason: "Gate is dormant." });
  assert.equal(ui.state.ui.starmap.notice, "Gate is dormant.");
  assert.ok(mapRoot.innerHTML.includes("Gate is dormant."));
  ui.closeStarmap();
});

test("11B: pocket layout is deterministic, gate exits point at peers, and mapPos is an author override", () => {
  fresh();
  const world = state.galaxy;
  const layout = systemPocketLayout(world, "meridian");
  assert.deepEqual(layout, systemPocketLayout(world, "meridian"));
  assert.equal(layout.nodes.length, Object.values(world.pockets).filter(p => p.parent === "meridian").length);
  assert.ok(layout.nodes.every(n => Math.hypot(...n.pos) > 0), "the centre belongs to the visual core");
  for (const node of layout.nodes) {
    const radius = node.pocket.role === "gate" ? GALAXY.systemMap.gateRadius : GALAXY.systemMap.ordinaryRadius;
    assert.ok(Math.abs(Math.hypot(...node.pos) - radius) < 1e-9, "pockets orbit the core on their own ring");
  }
  const chart = pocketConnections(world, "meridian");
  assert.equal(chart.policy, "free");
  assert.deepEqual(chart.edges, []);
  assert.ok(world.links["reach-hollow"], "the underlying link records remain available for an opt-out");
  const gates = Object.values(world.pockets).filter(p => p.parent === "meridian" && p.role === "gate");
  assert.equal(chart.exits.length, gates.length);
  for (const exit of chart.exits) {
    const peer = world.systemsById[exit.peerSystemId];
    const dx = peer.pos[0] - world.systemsById.meridian.pos[0];
    const dy = peer.pos[1] - world.systemsById.meridian.pos[1];
    assert.ok(exit.direction[0] * dx + exit.direction[1] * dy > 0, "exit stub points toward its peer system");
    assert.ok(Math.abs(exit.end[0] - (exit.start[0] + exit.direction[0] * GALAXY.systemMap.exitLength)) < 1e-9);
    assert.ok(Math.abs(exit.end[1] - (exit.start[1] + exit.direction[1] * GALAXY.systemMap.exitLength)) < 1e-9);
  }
  for (const node of chart.nodes) {
    const point = [node.pos[0], -node.pos[1]];
    const label = pocketLabelPosition(node, point, GALAXY.systemMap.pocketRadius, 1);
    if (node.pocket.role !== "gate") continue;
    const screenDirection = [node.direction[0], -node.direction[1]];
    const offset = [label.x - point[0], label.y - point[1]];
    assert.ok(offset[0] * screenDirection[0] + offset[1] * screenDirection[1] <= 0,
      "a gate pocket name sits inward, away from its orange exit stub and peer label");
  }
  assert.ok(systemChartBounds(chart).every(Number.isFinite));
  assert.ok(systemChartViewBox(world, { selected: "meridian", mode: "system", systemZoom: 1, systemPan: [0, 0] }).every(Number.isFinite));
  const previous = GALAXY_OVERRIDES.places.hollow;
  try {
    GALAXY_OVERRIDES.places.hollow = { mapPos: [-130, 90] };
    fresh();
    const moved = systemPocketLayout(state.galaxy, "meridian");
    assert.deepEqual(moved.byId.hollow.pos, [-130, 90]);
    assert.ok(moved.nodes.find(n => n.pocket.role === "gate").direction, "an authored gate still knows its outward direction");
  } finally {
    if (previous === undefined) delete GALAXY_OVERRIDES.places.hollow; else GALAXY_OVERRIDES.places.hollow = previous;
    fresh();
  }
  assert.throws(() => generateGalaxy(GALAXY.seed, GALAXY, {
    places: { hollow: { mapPos: [1, "x"] } }, links: {}, removedPlaces: [], removedLinks: [],
  }), /mapPos/);
});

test("11B: system-map lines follow enabled links and the visibility policy", () => {
  fresh();
  const world = state.galaxy;
  assert.deepEqual(pocketConnections(world, "meridian").edges, [], "free systems omit internal lines");
  world.systemsById.meridian.intraSystem = "links";
  const internal = world.links["reach-hollow"];
  internal.enabled = false;
  assert.ok(!pocketConnections(world, "meridian").edges.some(e => e.id === "reach-hollow"));
  internal.enabled = true;
  const gate = Object.values(world.pockets).find(p => p.parent === "meridian" && p.role === "gate");
  const external = Object.values(world.links).find(l => l.kind === "gate" && (l.a === gate.id || l.b === gate.id));
  external.enabled = false;
  assert.ok(!pocketConnections(world, "meridian").exits.some(e => e.id === external.id));
  external.enabled = true;
  world.visibility.mode = "discovered";
  const fog = pocketConnections(world, "meridian", { meridian: { discovered: true } });
  assert.equal(fog.exits.length, 0, "hidden peer systems get no exit stub");
  assert.ok(fog.edges.length > 0, "required route-only pocket lines remain");
  world.visibility.mode = "all";
  world.systemsById.meridian.intraSystem = "free";
  assert.deepEqual(pocketConnections(world, "meridian").edges, [], "the data opt-out is reversible");
});

test("11B: galaxy/system zoom transition blends viewBoxes and can be driven headlessly", () => {
  assert.deepEqual(interpolateViewBox([0, 0, 100, 100], [10, 10, 50, 50], 0), [0, 0, 100, 100]);
  assert.deepEqual(interpolateViewBox([0, 0, 100, 100], [10, 10, 50, 50], 0.5), [5, 5, 75, 75]);
  assert.deepEqual(interpolateViewBox([0, 0, 100, 100], [10, 10, 50, 50], 1), [10, 10, 50, 50]);
  const pos = contextMenuPosition(9999, 9999, { width: 800, height: 600 });
  assert.ok(pos.left <= 800 - GALAXY.map.context.width - GALAXY.map.context.margin);
  assert.ok(pos.top <= 600 - GALAXY.map.context.height - GALAXY.map.context.margin);
  const oldRaf = globalThis.requestAnimationFrame, oldCancel = globalThis.cancelAnimationFrame;
  let frame = null, id = 1;
  globalThis.requestAnimationFrame = fn => { frame = fn; return id++; };
  globalThis.cancelAnimationFrame = () => { frame = null; };
  const click = dataset => mapRoot.handlers.click({ target: { closest: () => ({ dataset, disabled: false }) } });
  try {
    assert.equal(ui.openStarmap(), true);
    mapRoot.handlers.dblclick({ target: { closest: () => ({ dataset: { system: "meridian" } }) }, preventDefault() {} });
    assert.equal(ui.state.ui.starmap.mode, "system");
    assert.ok(frame, "entering a system schedules a zoom transition");
    assert.ok(mapRoot.innerHTML.includes("sm-galaxy-layer") && mapRoot.innerHTML.includes("sm-system-layer"));
    assert.ok(mapRoot.innerHTML.includes("transitioning"));
    let cb = frame; frame = null;
    cb(performance.now() + GALAXY.map.transitionMs + 5);
    assert.equal(frame, null);
    assert.ok(!mapRoot.innerHTML.includes("transitioning"));
    assert.ok(!mapRoot.innerHTML.includes("sm-galaxy-layer"));
    assert.ok(mapRoot.innerHTML.includes('data-pocket="hollow"'));
    click({ action: "back" });
    assert.ok(frame, "returning to the galaxy schedules the reverse transition");
    cb = frame; frame = null;
    cb(performance.now() + GALAXY.map.transitionMs + 5);
    assert.equal(ui.state.ui.starmap.mode, "galaxy");
    assert.ok(!mapRoot.innerHTML.includes("sm-system-layer"));
    ui.closeStarmap();
  } finally {
    if (oldRaf === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = oldRaf;
    if (oldCancel === undefined) delete globalThis.cancelAnimationFrame; else globalThis.cancelAnimationFrame = oldCancel;
    ui.closeStarmap();
  }
});

test("11B: zoom controls enter/leave the system map and illegal right-clicks cannot warp", () => {
  assert.equal(ui.openStarmap(), true);
  const click = dataset => mapRoot.handlers.click({ target: { closest: () => ({ dataset, disabled: false }) } });
  click({ system: "meridian" });
  for (let i = 0; i < 5; i++) click({ action: "zoom-in" });
  assert.equal(ui.state.ui.starmap.mode, "system", "zooming in far enough opens the pocket map");
  click({ action: "back" });
  assert.equal(ui.state.ui.starmap.mode, "galaxy");
  click({ system: "sys-010" });
  click({ action: "zoom-in" });
  assert.equal(ui.state.ui.starmap.mode, "system");
  assert.equal(ui.state.ui.starmap.selected, "sys-010");
  const hub = Object.values(ui.state.galaxy.pockets).find(p => p.parent === "sys-010" && p.role !== "gate");
  mapRoot.handlers.contextmenu({
    target: { closest: sel => sel.includes("[data-pocket]") ? { dataset: { pocket: hub.id } } : null },
    clientX: 100, clientY: 100, preventDefault() {}, stopPropagation() {},
  });
  assert.ok(mapRoot.innerHTML.includes("No direct route"));
  assert.ok(!mapRoot.innerHTML.includes('data-action="travel"'), "an illegal hop has no clickable Warp to");
  let stopped = false;
  mapRoot.handlers.keydown({ key: "Escape", target: { closest: () => null },
    preventDefault() {}, stopPropagation() { stopped = true; } });
  assert.equal(stopped, true);
  assert.ok(ui.state.ui.starmap, "Escape closes the popup before the chart");
  assert.equal(ui.state.ui.starmap.menu, null);
  assert.ok(!mapRoot.innerHTML.includes("sm-context"));
  click({ action: "zoom-out" });
  assert.equal(ui.state.ui.starmap.mode, "galaxy", "zooming out at the system fit returns to the galaxy");
  ui.closeStarmap();
});

test("11B: stars/black holes have permanent two-line names and are never warp destinations", () => {
  const save = ui.prepareGalaxySave(ui.newSave());
  ui.applySave(save);
  const P = ui.configurePlayer(ui.createPlayer(), save.profile);
  P.docked = false; P.place = "reach";
  ui.state.ui.intro = false; ui.state.ui.starmap = null; ui.state.paused = false;
  assert.equal(ui.openStarmap(), true);
  const enter = id => mapRoot.handlers.dblclick({
    target: { closest: () => ({ dataset: { system: id } }) }, preventDefault() {},
  });
  const click = dataset => mapRoot.handlers.click({ target: { closest: () => ({ dataset, disabled: false }) } });
  const actions = [];
  let listening = true;
  ui.on("action", action => { if (listening && action.name === "travel") actions.push(action); });
  try {
    enter("meridian");
    assert.equal(ui.state.ui.starmap.mode, "system");
    const core = mapRoot.innerHTML.match(/<g class="sm-core star"[\s\S]*?<\/g>/)?.[0];
    assert.ok(core, "Meridian has a central star");
    for (const text of ['data-core="meridian"', 'role="img"', 'tabindex="0"', 'aria-label="Meridian (Star)"',
      'class="sm-core-label sm-core-name"', ">Meridian</text>", 'class="sm-core-label sm-core-type"',
      ">(Star)</text>", "sm-core-glow", "sm-core-ring", "sm-core-body"]) {
      assert.ok(core.includes(text), text);
    }
    assert.ok(!core.includes("data-pocket="), "the core is not a pocket target");
    assert.ok(!core.includes("data-action="), "the core has no travel action");
    assert.ok(!core.includes('role="button"'));
    assert.ok(!core.includes("<title>"), "no native hover tooltip duplicates the permanent label");
    assert.ok(!mapRoot.innerHTML.includes("<title>"), "no chart node uses a native hover tooltip");
    assert.ok(mapRoot.innerHTML.includes("The central star/black hole is not warpable"));
    const nameY = Number(core.match(/sm-core-name" x="[^"]*" y="([^"]*)"/)[1]);
    const typeY = Number(core.match(/sm-core-type" x="[^"]*" y="([^"]*)"/)[1]);
    assert.ok(typeY > nameY, "the celestial type sits on a new row below the name");
    const coreRadius = Number(core.match(/sm-core-body" cx="[^"]*" cy="[^"]*" r="([^"]*)"/)[1]);
    const pocketDotRadius = html => Number(html.match(/data-pocket="reach"[\s\S]*?class="sm-dot"[^>]*r="([^"]*)"/)[1]);
    const fitPocketRadius = pocketDotRadius(mapRoot.innerHTML);
    const fitWidth = Number(mapRoot.innerHTML.match(/viewBox="([^"]*)"/)[1].split(" ")[2]);
    click({ action: "zoom-in" });
    const zoomedCore = mapRoot.innerHTML.match(/<g class="sm-core star"[\s\S]*?<\/g>/)?.[0];
    const zoomedRadius = Number(zoomedCore.match(/sm-core-body" cx="[^"]*" cy="[^"]*" r="([^"]*)"/)[1]);
    const zoomWidth = Number(mapRoot.innerHTML.match(/viewBox="([^"]*)"/)[1].split(" ")[2]);
    assert.equal(zoomedRadius, coreRadius, "core radius is a map unit, so zooming enlarges its on-screen graphic");
    assert.notEqual(pocketDotRadius(mapRoot.innerHTML), fitPocketRadius, "pocket dots stay screen-sized while the core scales");
    assert.ok(zoomWidth < fitWidth);
    click({ action: "reset" });
    click({ core: "meridian" });
    assert.equal(ui.state.ui.starmap.menu, null);
    let prevented = false;
    mapRoot.handlers.keydown({ key: "Enter", target: {
      closest: sel => sel === "[data-core]" ? { dataset: { core: "meridian" } } : null,
    }, preventDefault() { prevented = true; }, stopPropagation() {} });
    assert.equal(prevented, false, "activating the core does not open a warp popup");
    mapRoot.handlers.contextmenu({ target: { closest: () => null }, clientX: 100, clientY: 100,
      preventDefault() {}, stopPropagation() {} });
    assert.equal(ui.state.ui.starmap.menu, null);
    assert.deepEqual(actions, []);
    assert.equal(travelQuote(ui.state.galaxy, "reach", "meridian").ok, false);
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
    assert.match(css, /\.sm-core-label \{ fill:/);
    assert.ok(!css.includes(".sm-core-label { opacity: 0"), "core labels are not hover-gated");
    assert.ok(!css.includes(".sm-core:hover .sm-core-label"));
    click({ action: "back" });
    enter("sys-001");
    assert.ok(mapRoot.innerHTML.includes('class="sm-core black-hole"'));
    assert.ok(mapRoot.innerHTML.includes('aria-label="Duskdrift (Black hole)"'));
    assert.ok(mapRoot.innerHTML.includes(">Duskdrift</text>"));
    assert.ok(mapRoot.innerHTML.includes(">(Black hole)</text>"));
    assert.ok(!mapRoot.innerHTML.includes('data-pocket="sys-001"'), "the black hole is not a warpable hub");
  } finally {
    listening = false;
    ui.closeStarmap();
  }
});

test("11B: a free gate hop keeps the named action; a links opt-out restores lines and refusal", () => {
  const save = ui.prepareGalaxySave(ui.newSave());
  ui.applySave(save);
  const P = ui.configurePlayer(ui.createPlayer(), save.profile);
  P.docked = false; P.place = "hollow";
  ui.state.ui.intro = false; ui.state.ui.starmap = null; ui.state.paused = false;
  assert.equal(ui.openStarmap(), true);
  const galaxyEdges = (mapRoot.innerHTML.match(/data-edge="/g) || []).length;
  assert.ok(galaxyEdges > 0, "the galaxy keeps its explicit gate web");
  mapRoot.handlers.dblclick({ target: { closest: () => ({ dataset: { system: "meridian" } }) }, preventDefault() {} });
  const gate = "meridian-gate-sys-001";
  const rightClick = id => mapRoot.handlers.contextmenu({
    target: { closest: sel => sel.includes("[data-pocket]") ? { dataset: { pocket: id } } : null },
    clientX: 100, clientY: 100, preventDefault() {}, stopPropagation() {},
  });
  const click = dataset => mapRoot.handlers.click({ target: { closest: () => ({ dataset, disabled: false }) } });
  rightClick(gate);
  assert.ok(mapRoot.innerHTML.includes(`data-action="travel" data-to="${gate}"`));
  assert.ok(!mapRoot.innerHTML.includes("sm-pocket-edge"));
  assert.ok(mapRoot.innerHTML.includes("no internal route is needed"));
  const actions = [];
  let listening = true;
  ui.on("action", action => { if (listening && action.name === "travel") actions.push(action); });
  try {
    click({ action: "travel", to: gate });
    assert.deepEqual(actions.at(-1), { name: "travel", to: gate, repeat: false });
    assert.equal(travelQuote(ui.state.galaxy, P.place, gate).ok, true);
    ui.state.galaxy.systemsById.meridian.intraSystem = "links";
    click({ action: "reset" });
    assert.ok(mapRoot.innerHTML.includes("requires connected pocket hops"));
    assert.ok(mapRoot.innerHTML.includes('data-pockets-edge="reach-hollow"'));
    rightClick(gate);
    assert.ok(mapRoot.innerHTML.includes("No direct route"));
    assert.ok(!mapRoot.innerHTML.includes('data-action="travel"'));
    assert.equal(travelQuote(ui.state.galaxy, P.place, gate).ok, false, "the shared quote path respects the opt-out");
    click({ action: "back" });
    assert.equal((mapRoot.innerHTML.match(/data-edge="/g) || []).length, galaxyEdges, "galaxy routes are unchanged");
  } finally {
    listening = false;
    ui.closeStarmap();
  }
});

test("11B: galaxy pan stays bounded in screen pixels while increasing gently as zoom decreases", () => {
  assert.equal(galaxyPanSpeed(GALAXY.map.maxZoom), GALAXY.map.panSpeed * 0.5);
  assert.equal(galaxyPanSpeed(GALAXY.map.minZoom), GALAXY.map.panSpeed);
  assert.ok(galaxyPanSpeed(1) > galaxyPanSpeed(2.5) && galaxyPanSpeed(2.5) > galaxyPanSpeed(5));
  const box = [0, 0, 800, 600], viewport = { width: 800, height: 600 };
  assert.deepEqual(panDelta([100, 100], [140, 120], box, viewport), [-40, -20]);
  assert.deepEqual(panDelta([100, 100], [140, 120], box, viewport, 5), [-200, -100]);
  assert.equal(panDelta([100, 100], [140, 120], box, viewport, 0.5)[0], -20);
  assert.deepEqual(panDelta([100, 100], [110, 100], [0, 0, 1600, 1200], viewport), [-20, -0]);
  assert.deepEqual(panDelta([100, 100], [110, 100], [0, 0, 1600, 1200], viewport, 4), [-80, -0]);
  const maxBox = [0, 0, 800, 600], wide = [0, 0, 1600, 1200];
  assert.deepEqual(galaxyPanDelta([0, 0], [10, 0], maxBox, viewport, GALAXY.map.maxZoom), [-5, -0]);
  assert.ok(Math.abs(galaxyPanDelta([0, 0], [10, 0], wide, viewport, 2.5)[0] + 20 * galaxyPanSpeed(2.5)) < 1e-9);

  ui.openStarmap();
  const svg = { setPointerCapture() {}, setAttribute() {}, getBoundingClientRect() { return viewport; } };
  const oldQuery = mapRoot.querySelector;
  mapRoot.querySelector = sel => sel === "svg.sm-chart" ? svg : oldQuery.call(mapRoot, sel);
  const drag = zoom => {
    ui.state.ui.starmap.zoom = zoom;
    ui.state.ui.starmap.pan = [0, 0];
    mapRoot.handlers.pointerdown({ target: { closest: sel => sel === "svg.sm-chart" ? svg : null },
      button: 0, clientX: 100, clientY: 100, pointerId: 1 });
    mapRoot.handlers.pointermove({ clientX: 110, clientY: 100 });
    // Compare on-screen travel: the viewBox conversion already changes world
    // units per pixel, and the requested zoom multiplier amplifies that drag.
    const box = chartViewBox(ui.state.galaxy, ui.state.ui.starmap);
    const value = Math.abs(ui.state.ui.starmap.pan[0]) / chartPixelScale(box, viewport.width, viewport.height);
    mapRoot.handlers.pointerup({});
    return value;
  };
  const max = drag(GALAXY.map.maxZoom), middle = drag(2.5), min = drag(GALAXY.map.minZoom);
  assert.ok(Math.abs(max - 5) < 1e-9);
  assert.ok(middle > max && min > middle);
  assert.ok(Math.abs(min - 10) < 1e-9, "at most one screen pixel per pointer pixel");
  // The bound must hold for different chart aspect ratios and viewport sizes.
  for (const vp of [{ width: 320, height: 900 }, { width: 1920, height: 400 }]) {
    for (const zoom of [GALAXY.map.minZoom, 1, 2.5, GALAXY.map.maxZoom]) {
      const box = [0, 0, 1600 / zoom, 1200 / zoom];
      const delta = galaxyPanDelta([0, 0], [10, 0], box, vp, zoom);
      const screenTravel = Math.abs(delta[0]) / chartPixelScale(box, vp.width, vp.height);
      assert.ok(screenTravel >= 5 && screenTravel <= 10 + 1e-9);
    }
  }
  ui.state.ui.starmap.mode = "system";
  ui.state.ui.starmap.selected = "meridian";
  ui.state.ui.starmap.systemZoom = 1;
  ui.state.ui.starmap.systemPan = [0, 0];
  mapRoot.handlers.pointerdown({ target: { closest: sel => sel === "svg.sm-chart" ? svg : null },
    button: 0, clientX: 100, clientY: 100, pointerId: 1 });
  mapRoot.handlers.pointermove({ clientX: 110, clientY: 100 });
  const systemBox = systemChartViewBox(ui.state.galaxy, ui.state.ui.starmap);
  const expected = -10 / chartPixelScale(systemBox, viewport.width, viewport.height);
  assert.ok(Math.abs(ui.state.ui.starmap.systemPan[0] - expected) < 1e-9);
  mapRoot.handlers.pointerup({});
  mapRoot.querySelector = oldQuery;
  ui.closeStarmap();
});

test("11B: neighbouring gate-system labels open the shared popup and warp only from their matching gate", () => {
  const save = ui.prepareGalaxySave(ui.newSave());
  ui.applySave(save);
  const P = ui.configurePlayer(ui.createPlayer(), save.profile);
  P.docked = false; P.place = "reach";
  ui.state.ui.intro = false; ui.state.ui.starmap = null; ui.state.paused = false;
  ui.openStarmap();
  mapRoot.handlers.dblclick({ target: { closest: () => ({ dataset: { system: "meridian" } }) }, preventDefault() {} });
  const world = ui.state.galaxy;
  const exit = pocketConnections(world, "meridian").exits.find(e => e.peerSystemId === "sys-002");
  assert.ok(exit);
  assert.equal(exitChoice(world, exit, "reach").label, "Lumenveil");
  assert.equal(exitChoice(world, exit, "reach").canWarp, false);
  assert.equal(exitChoice(world, exit, exit.from).canWarp, true);
  assert.equal(exitChoice(world, exit, exit.from).pocket.id, exit.peerPocketId);
  assert.ok(mapRoot.innerHTML.includes(`data-exit="${exit.id}"`));
  assert.ok(mapRoot.innerHTML.includes('role="button" tabindex="0" aria-label="Lumenveil, neighbouring system"'));
  const clickExit = () => mapRoot.handlers.click({ target: {
    closest: sel => sel.includes("[data-exit]") ? { dataset: { exit: exit.id } } : null,
  }, clientX: 120, clientY: 140 });
  clickExit();
  assert.equal(ui.state.ui.starmap.menu.exitId, exit.id);
  assert.ok(mapRoot.innerHTML.includes('class="sm-context"'));
  assert.ok(mapRoot.innerHTML.includes("<strong>Lumenveil</strong>"));
  assert.ok(mapRoot.innerHTML.includes("No direct route"));
  assert.ok(!mapRoot.innerHTML.includes('data-action="travel"'));
  let stopped = false;
  mapRoot.handlers.keydown({ key: "Escape", target: { closest: () => null },
    preventDefault() {}, stopPropagation() { stopped = true; } });
  assert.ok(stopped);
  assert.equal(ui.state.ui.starmap.menu, null);
  assert.ok(!mapRoot.innerHTML.includes('class="sm-context"'));
  let keyStopped = false;
  mapRoot.handlers.keydown({ key: "Enter", target: {
    closest: sel => sel.includes("[data-exit]") ? { dataset: { exit: exit.id } } : null,
  }, preventDefault() {}, stopPropagation() { keyStopped = true; } });
  assert.ok(keyStopped);
  assert.equal(ui.state.ui.starmap.menu.exitId, exit.id, "keyboard activation uses the same exit popup");
  mapRoot.handlers.keydown({ key: "Escape", target: { closest: () => null }, preventDefault() {}, stopPropagation() {} });

  P.place = exit.from;
  mapRoot.handlers.contextmenu({ target: {
    closest: sel => sel.includes("[data-exit]") ? { dataset: { exit: exit.id } } : null,
  }, clientX: 120, clientY: 140, preventDefault() {}, stopPropagation() {} });
  assert.ok(mapRoot.innerHTML.includes(`data-action="travel" data-to="${exit.peerPocketId}"`));
  assert.ok(mapRoot.innerHTML.includes("Warp to Lumenveil"));
  const actions = [];
  let listening = true;
  ui.on("action", action => { if (listening && action.name === "travel") actions.push(action); });
  try {
    mapRoot.handlers.click({ target: { closest: () => ({ dataset: { action: "travel", to: exit.peerPocketId }, disabled: false }) } });
    assert.deepEqual(actions.at(-1), { name: "travel", to: exit.peerPocketId, repeat: false });
    assert.equal(travelQuote(world, P.place, exit.peerPocketId).ok, true);
    assert.equal(world.pocketsById[exit.peerPocketId].parent, "sys-002");
    // A closed gate cannot be bypassed by clicking its neighbouring-system label.
    exit.link.enabled = false;
    assert.equal(pocketConnections(world, "meridian").exits.some(e => e.id === exit.id), false);
    assert.equal(travelQuote(world, P.place, exit.peerPocketId).ok, false);
  } finally {
    listening = false;
    exit.link.enabled = true;
    ui.closeStarmap();
  }
});

// The real menu module, with its own bundled state, exercises the notices a
// player actually sees after intro/slot/import recovery.
const menuStorage = new Map();
globalThis.localStorage = {
  getItem: k => menuStorage.get(k) ?? null,
  setItem: (k, v) => menuStorage.set(k, String(v)),
  removeItem: k => menuStorage.delete(k),
};
const menu = await loadHeadless("src/ui/menu.js", {
  state: "src/state/state.js", currentSave: "src/state/state.js", applySave: "src/state/state.js",
  resetPlaces: "src/state/state.js", newSave: "src/state/profile.js",
  prepareGalaxySave: "src/sim/galaxy-session.js", createPlayer: "src/sim/player.js",
  configurePlayer: "src/sim/session.js", resumeFromSave: "src/sim/session.js",
  encodeSave: "src/state/storage.js", placeAt: "src/data/places.js",
});
const menuPanel = document.getElementById("panel");
function menuClick(a, b) {
  const btn = { dataset: { a, b }, disabled: false };
  menuPanel.handlers.click({ target: { closest: sel => sel === "button[data-a]" ? btn : null }, shiftKey: false });
}
function menuBoot() {
  menu.resetPlaces();
  menu.state.players.length = 0;
  menu.state.localPlayerIndex = 0;
  const save = menu.prepareGalaxySave(menu.newSave());
  menu.applySave(save);
  menu.configurePlayer(menu.createPlayer(), save.profile);
  menu.state.ui.intro = true;
  menu.state.ui.tab = "s";
  menu.state.ui.toast = "";
  return save;
}
menuBoot();
menu.setupMenu();
const legacyCode = raw => "TR1:" + Buffer.from(JSON.stringify(raw), "utf8").toString("base64");

test("11B: intro, slot and import recovery notices survive; a bad import leaves the world alone", () => {
  const raw = menu.newSave();
  raw.v = raw.profile.v = raw.world.v = 15;
  raw.world.galaxy = null;
  raw.world.place = "removed-test-pocket";
  raw.world.resume = { pos: [1, 2, 3], quat: [0, 0, 0, 1], sh: 2, en: 1 };
  raw.profile.cr = 1234;
  raw.profile.holds.wasp.ferrite = 7;

  menu.applySave(menu.prepareGalaxySave(raw));
  menu.state.ui.intro = true;
  menuClick("intro");
  assert.match(menu.state.ui.toast, /character and cargo are safe/);
  assert.equal(menu.state.galaxyRecovery, null);
  assert.equal(menu.state.player.docked, true);

  menuStorage.set("tr_s1", JSON.stringify(raw));
  menu.state.ui.intro = false;
  menu.state.profile.cr = 1;
  menuClick("ld", "1");
  assert.match(menu.state.ui.toast, /^Loaded slot 1/);
  assert.match(menu.state.ui.toast, /character and cargo are safe/);
  assert.equal(menu.state.profile.cr, 1234);

  menu.state.profile.cr = 2;
  document.getElementById("xt").value = legacyCode(raw);
  menuClick("im");
  assert.match(menu.state.ui.toast, /^Save imported\./);
  assert.match(menu.state.ui.toast, /character and cargo are safe/);
  assert.equal(menu.state.profile.cr, 1234);

  const galaxyBefore = menu.state.galaxy;
  const bad = { v: 16, profile: { v: 16 }, world: { galaxy: { seed: 999 } } };
  document.getElementById("xt").value = legacyCode(bad);
  menuClick("im");
  assert.equal(menu.state.ui.toast, "That code is not a valid save.");
  assert.equal(menu.state.profile.cr, 1234);
  assert.equal(menu.state.galaxy, galaxyBefore);
  assert.deepEqual(menu.placeAt("sys-001").pos, galaxyBefore.systemsById["sys-001"].pos);
});

// Real audio module with a tiny Web Audio stand-in: a later pointer/key gesture
// calls initAudio again and must not undo the chart's requested suspension.
const audioContexts = [];
function audioParam() {
  return { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {} };
}
function audioNode(extra = {}) { return { connect() { return this; }, ...extra }; }
class FakeAudioContext {
  constructor() { this.currentTime = 0; this.sampleRate = 8000; this.destination = {}; this.resumes = 0; this.suspends = 0; this.oscillators = 0; audioContexts.push(this); }
  createGain() { return audioNode({ gain: audioParam() }); }
  createBuffer(_channels, length) { return { getChannelData: () => new Float32Array(length) }; }
  createBufferSource() { return audioNode({ start() {}, stop() {}, buffer: null, loop: false }); }
  createBiquadFilter() { return audioNode({ frequency: audioParam(), Q: audioParam(), type: "" }); }
  createOscillator() { this.oscillators++; return audioNode({ frequency: audioParam(), start() {}, stop() {}, type: "" }); }
  createWaveShaper() { return audioNode({ curve: null }); }
  resume() { this.resumes++; return Promise.resolve(); }
  suspend() { this.suspends++; return Promise.resolve(); }
}
globalThis.window = { AudioContext: FakeAudioContext };
const audio = await loadHeadless("src/core/audio.js", {}, { keep: ["audio.js"] });

test("11B: audio stays suspended across later user-gesture init calls until the chart closes", () => {
  audio.setAudioSuspended(true);
  audio.initAudio();
  const ctx = audioContexts.at(-1);
  assert.equal(ctx.suspends, 1);
  assert.equal(ctx.resumes, 0);
  audio.initAudio();
  assert.equal(ctx.resumes, 0);
  audio.setAudioSuspended(false);
  assert.equal(ctx.resumes, 1);
  audio.setAudioSuspended(true);
  audio.initAudio();
  assert.equal(ctx.resumes, 1);
  const oscillators = ctx.oscillators;
  audio.uiSound("click");
  assert.equal(ctx.oscillators, oscillators, "suspended UI clicks do not queue a burst for resume");
  audio.warpCharge(1);
  assert.ok(ctx.oscillators > oscillators, "the warp charge still schedules across the map-close resume");
  audio.setAudioSuspended(false);
  assert.equal(ctx.resumes, 2);
});

// Real input module against captured window listeners.
const windowHandlers = {};
globalThis.addEventListener = (type, fn) => { windowHandlers[type] = fn; };
globalThis.innerWidth = 1000;
globalThis.innerHeight = 800;
const input = await loadHeadless("src/core/input.js", {
  state: "src/state/state.js", localPlayer: "src/state/state.js",
  createPlayer: "src/sim/player.js", configurePlayer: "src/sim/session.js",
  on: "src/util/events.js",
}, { keep: ["input.js"] });
input.state.players.length = 0;
input.state.localPlayerIndex = 0;
const inputPlayer = input.configurePlayer(input.createPlayer(), input.state.profile);
input.installInput();
function key(code, tagName = "BUTTON") {
  let prevented = 0;
  windowHandlers.keydown({ code, repeat: false, target: { tagName }, preventDefault() { prevented++; } });
  return prevented;
}

test("11B: an open chart leaves Space/Alt to the UI, releases flight keys and still toggles with M", () => {
  const actions = [], freecam = [];
  input.on("action", a => actions.push(a));
  input.on("freecam", v => freecam.push(v));
  input.state.ui.starmap = { selected: "meridian" };
  key("KeyW");
  assert.equal(input.keys.KeyW, undefined);
  assert.equal(inputPlayer.controls.thrust, 0);
  assert.equal(key("Space"), 0, "Space can activate a focused map button");
  key("AltLeft");
  assert.deepEqual(freecam, []);
  key("KeyM", "SELECT");
  assert.equal(actions.at(-1).name, "starmap");
  input.state.ui.starmap = null;
  key("KeyW");
  assert.equal(input.keys.KeyW, 1);
  assert.equal(inputPlayer.controls.thrust, 1);
  assert.equal(key("Space"), 1);
  key("AltLeft");
  assert.equal(freecam.at(-1), true);
  windowHandlers.keyup({ code: "KeyW", preventDefault() {} });
  assert.equal(inputPlayer.controls.thrust, 0);
  input.clearControls();
});
