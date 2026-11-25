// Step 16 slice 7: the visiting pilot is on the map.
//
// Slice 4 made a visitor a real, docked, simulated player record; there is still no camera
// to draw its hull (slice 8). What slice 7 adds is the thing the owner can SEE: the pilot's
// name under the pocket it stands in, on the system (pocket) map, and the same names in the
// side panel. These tests read `state.players` through the same functions the renderer uses
// (`systemMarkup`), because LESSONS L19 is exactly this shape: the writer being right is not
// the same as the reader finding it.
//
// Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SAVE_VERSION, newProfile, newWorld, newSave, sanitizeSave } from "../src/state/profile.js";
import { state, applySave, resetPlaces } from "../src/state/state.js";
import { prepareGalaxySave } from "../src/sim/galaxy-session.js";
import { placeAt, DEFAULT_PLACE } from "../src/data/places.js";
import { createPlayer } from "../src/sim/player.js";
import { checkOut, hostProfile } from "../src/net/custody.js";
import { arriveGuest, leaveGuest, resetGuests } from "../src/sim/multiplayer.js";
import { chartGalaxy } from "../src/ui/chart-lines.js";
import { pocketConnections, pilotBlips, visitingPilots, pilotPanelMarkup, systemMarkup, galaxyMarkup } from "../src/ui/starmap.js";

const starmapSource = readFileSync(new URL("../src/ui/starmap.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

/** The host's own world, with only the local pilot in it, as the game boots. */
function freshHost() {
  resetPlaces();
  resetGuests();
  state.players.length = 0;
  state.localPlayerIndex = 0;
  applySave(prepareGalaxySave(newSave()));
  state.ui.intro = false;
  const local = createPlayer();
  local.docked = true;
  local.place = DEFAULT_PLACE;
  return local;
}

/** A guest's home save. The travelling half is what arrives; the home half stays behind. */
function guestSave() {
  return sanitizeSave({ v: SAVE_VERSION, profile: newProfile(), world: newWorld(), away: null });
}

/** Bring one visitor into the host's world the way `main.js` does, through its own door. */
function addGuest(guestId = "guest-1", name = "Acey") {
  const bundle = checkOut(guestSave(), {
    worldId: "w-host", hostName: "Host", guestId, token: `tok-${guestId}`,
  }).bundle;
  return arriveGuest({ guestId, name, profile: hostProfile(bundle), place: bundle.homeStation });
}

/** The system chart the map builds for the pocket a pilot stands in. */
function chartOf(placeId = DEFAULT_PLACE) {
  const world = chartGalaxy(state.galaxy);
  const systemId = world.pocketsById[placeId].parent;
  return { world, systemId, chart: pocketConnections(world, systemId) };
}

test("slice 7: a visiting pilot is a named blip at the pocket it stands in", () => {
  const local = freshHost();
  const guest = addGuest();
  assert.equal(guest.place, DEFAULT_PLACE, "a visitor arrives docked at a station this world has");

  const { chart } = chartOf(guest.place);
  const blips = pilotBlips(chart);
  assert.equal(blips.length, 1, "one other pilot, one blip");
  assert.deepEqual(
    { id: blips[0].id, name: blips[0].name, place: blips[0].place, nodeId: blips[0].nodeId },
    { id: "guest-1", name: "Acey", place: DEFAULT_PLACE, nodeId: DEFAULT_PLACE }
  );
  assert.equal(pilotBlips(chart, [local], local).length, 0, "the host's own pilot is not a blip: it is 'You are here'");
  assert.equal(pilotBlips(chart, state.players, local).length, 1);
});

test("slice 7: the system map draws the blip under the right pocket (the reader's own path)", () => {
  freshHost();
  const guest = addGuest();
  const { world, systemId } = chartOf(guest.place);
  const here = placeAt(DEFAULT_PLACE);
  const markup = systemMarkup(world, { selected: systemId }, {}, here, 1);

  assert.match(markup, /data-pilot="guest-1"/, "the map carries the pilot's own id");
  assert.match(markup, /class="sm-pilot-blip"[^>]*>· Acey</, "and its name, as a blip row");
  assert.ok(markup.indexOf(`data-pocket="${DEFAULT_PLACE}"`) < markup.indexOf('data-pilot="guest-1"'),
    "the blip is drawn inside the pocket the pilot is standing in, not at another node");
  assert.equal((markup.match(/data-pilot="/g) || []).length, 1, "one visiting pilot, one blip");
});

test("slice 7: the galaxy chart names a visitor under its system, without zooming in", () => {
  // The owner's first report was "I see no viewing of a player on map": the map opens on the
  // galaxy and the pocket blip only exists one click in. The galaxy chart is where the
  // question "where is my friend?" is actually asked, so the name belongs there too.
  freshHost();
  const guest = addGuest();
  const here = placeAt(DEFAULT_PLACE);
  const world = chartGalaxy(state.galaxy);
  const know = state.worldState.galaxy?.knowledge || {};
  const visitors = visitingPilots();
  assert.equal(visitors[0].systemId, here.parent, "a visitor carries the system it is in");
  const withPilot = galaxyMarkup(world, { selected: null, labels: false }, know, here, 1, null, new Map(),
    new Map([[here.parent, visitors]]));
  assert.ok(withPilot.includes(`data-pilot="${guest.guestId}"`), "named on the galaxy chart");
  assert.ok(withPilot.includes("· Acey"));
  // Same chart, no visitors: no pilot rows at all, so the row above is the thing that drew it.
  const without = galaxyMarkup(world, { selected: null, labels: false }, know, here, 1, null, new Map(), new Map());
  assert.ok(!without.includes("data-pilot="), "no visitors, no rows");
});

test("slice 7: the side panel names every visiting pilot and where it is", () => {
  freshHost();
  addGuest();
  const pocket = placeAt(DEFAULT_PLACE);
  const panel = pilotPanelMarkup(visitingPilots());
  assert.match(panel, /Visiting pilots<\/span>/);
  assert.ok(panel.includes(`Acey · ${pocket.n}`), "name and pocket, from the one record");
  assert.ok(panel.includes(`(${placeAt(pocket.parent).n})`), "and the system, so the player knows which map to open");
  assert.equal(pilotPanelMarkup([]), "", "a world with no visitors says nothing at all");
  assert.match(starmapSource, /pilotPanelMarkup\(visitors\)/, "the renderer actually draws that row");
  assert.ok(starmapSource.indexOf("pilotPanelMarkup(visitors)") < starmapSource.indexOf('<p class="sm-current">'),
    "the row sits under the heading, before the pocket list — not at the bottom where it was invisible");
});

test("slice 7: a visitor in another system is not a blip on this one", () => {
  freshHost();
  const guest = addGuest();
  const { world, systemId, chart } = chartOf(guest.place);
  assert.equal(pilotBlips(chart).length, 1);
  const elsewhere = Object.values(world.pocketsById)
    .find(p => p && p.parent && p.parent !== systemId && !p.connection);
  assert.ok(elsewhere, "the galaxy has a pocket in another system");
  guest.place = elsewhere.id;
  assert.equal(pilotBlips(chart).length, 0, "it stands somewhere this chart does not show");
  // …but the panel still finds it, or a pilot that arrived in another system looks lost.
  const panel = pilotPanelMarkup(visitingPilots());
  assert.ok(panel.includes("Acey"), "the panel names every visitor, wherever it is");
  assert.ok(panel.includes(placeAt(elsewhere.parent).n), "and names the system to open");
});

test("slice 7: a pilot whose pocket is not on the chart is skipped, never guessed", () => {
  freshHost();
  const guest = addGuest();
  const { chart } = chartOf(guest.place);
  guest.place = "a-rift-that-is-not-on-the-map";
  assert.equal(pilotBlips(chart).length, 0);
});

test("slice 7: two visitors at one station stack in a stable order", () => {
  freshHost();
  addGuest("guest-b", "Bex");
  addGuest("guest-a", "Ada");
  const { world, systemId, chart } = chartOf(DEFAULT_PLACE);
  const blips = pilotBlips(chart);
  assert.deepEqual(blips.map(b => b.name), ["Ada", "Bex"], "same pocket, ordered by name, every redraw");
  const markup = systemMarkup(world, { selected: systemId }, {}, placeAt(DEFAULT_PLACE), 1);
  assert.equal((markup.match(/data-pilot="/g) || []).length, 2, "two pilots, two rows");
  assert.ok(markup.indexOf("Ada") < markup.indexOf("Bex"));
});

test("slice 7: a pilot that goes home takes its blip with it", () => {
  freshHost();
  const guest = addGuest();
  const { chart } = chartOf(guest.place);
  assert.equal(pilotBlips(chart).length, 1);
  assert.equal(leaveGuest("guest-1"), true);
  assert.equal(state.players.includes(guest), false);
  assert.equal(pilotBlips(chart).length, 0, "the map follows the record, it is not a second copy of it");
});

test("slice 7: a pilot arriving or leaving repaints an open map", () => {
  // L43: a rule with no caller is not a feature. The map is only redrawn on interactions, so
  // the two bus events `sim/multiplayer.js` emits have to ask for the repaint themselves.
  assert.match(starmapSource, /on\("mp-guest-arrived",[^)]*\)\s*=>\s*\{[^}]*render\(\)/);
  assert.match(starmapSource, /on\("mp-guest-left",[^)]*\)\s*=>\s*\{[^}]*render\(\)/);
});

test("slice 7: the blip is styled, not only emitted", () => {
  assert.match(styles, /\.sm-node \.sm-pilot-blip \{[^}]*fill: var\(--amber\)/);
  assert.match(styles, /\.sm-pilots \{[^}]*color: var\(--ink\)/);
});
