import { test } from "node:test";
import assert from "node:assert/strict";
import { loadHeadless } from "./headless.mjs";
import { routeDisplay, routeRows, flightRouteRows } from "../src/ui/route-display.js";

const hud = await loadHeadless("src/ui/hud.js", {
  state: "src/state/state.js", generateGalaxy: "src/sim/galaxy.js", findDestinationRoute: "src/sim/travel.js",
});

test("flight route shows only remaining systems, highlights current and counts future systems", () => {
  const { state } = hud, world = hud.generateGalaxy();
  const player = { place: "hollow" };
  state.galaxy = world; state.players = [player]; state.localPlayerIndex = 0;
  state.worldState.galaxy = { knowledge: {} };
  const target = world.systems.find(s => s.id !== "meridian");
  state.ui.destination = target.id;
  // Historical systems are retained by the starmap but must not leak into the HUD.
  state.ui.routeProgress = { destination: target.id, completed: [target.id] };
  const el = { hidden: true, innerHTML: "" };
  hud.updateHudRoute(0, el);
  const route = hud.findDestinationRoute(world, player.place, target.id, { player, profile: state.profile, world: state.worldState });
  const model = routeDisplay(world, target.id, route, {});
  assert.ok(route.length > 1);
  assert.equal(el.hidden, false);
  assert.ok(el.innerHTML.includes(`Route to ${target.n} (${model.stops.length - 1} systems)`));
  assert.ok(el.innerHTML.includes(`aria-current="location">${world.systemsById[world.pocketsById[player.place].parent].n}</li>`));
  assert.doesNotMatch(el.innerHTML, /route-done|✓|<small>|\d+ jumps?/);
  assert.equal((el.innerHTML.match(/<li(?: [^>]*)?>/g) || []).length, model.stops.length);
  assert.ok(!el.innerHTML.includes(world.pocketsById[player.place].n), "no pocket names in list");
  const remoteHop = route.find(id => world.pocketsById[id].parent !== world.pocketsById[player.place].parent);
  player.place = remoteHop;
  hud.updateHudRoute(0, el);
  const remaining = hud.findDestinationRoute(world, player.place, target.id, { player, profile: state.profile, world: state.worldState });
  const currentModel = routeDisplay(world, target.id, remaining, {});
  assert.ok(el.innerHTML.includes(`(${currentModel.stops.length - 1} ${currentModel.stops.length === 2 ? "system" : "systems"})`));
  assert.ok(el.innerHTML.includes(`aria-current="location">${world.systemsById[world.pocketsById[player.place].parent].n}</li>`));
  player.place = route[0]; hud.updateHudRoute(0, el);
  for (const link of Object.values(world.links)) if (link.kind === "gate") link.enabled = false;
  hud.updateHudRoute(0.6, el);
  assert.match(el.innerHTML, /No route available/);
  assert.match(el.innerHTML, /class="route-here" aria-current="location"/);
  assert.doesNotMatch(el.innerHTML, /\(0 systems\)/, "unavailable route has no misleading count");
  for (const link of Object.values(world.links)) if (link.kind === "gate") link.enabled = true;
  state.ui.destination = { pocketId: route.at(-1) };
  hud.updateHudRoute(0, el);
  assert.ok(el.innerHTML.includes(world.pocketsById[route.at(-1)].n), "exact pocket is identified in the route title");
  player.place = route.at(-1); hud.updateHudRoute(0, el);
  assert.match(el.innerHTML, /\(0 systems\)/);
  assert.equal((el.innerHTML.match(/<li(?: [^>]*)?>/g) || []).length, 1);
  state.ui.destination = null; hud.updateHudRoute(0, el);
  assert.equal(el.hidden, true);
});

test("route summary shows exact pockets, conceals undiscovered stops and escapes names", () => {
  const world = hud.generateGalaxy();
  const start = world.pocketsById.hollow;
  const target = Object.values(world.pocketsById).find(p => p.parent !== start.parent);
  const destination = { pocketId: target.id };
  const summary = routeDisplay(world, destination, [start.id, target.id], {});
  assert.equal(summary.stops.at(-1).pockets.at(-1).name, target.n);
  assert.match(summary.title, /\(/);
  const hiddenWorld = { ...world, visibility: { mode: "discovered" } };
  assert.deepEqual(routeDisplay(hiddenWorld, destination, [start.id, target.id], {}).stops.at(-1).pockets,
    [{ name: "Undiscovered pocket", current: false }]);
  assert.match(routeRows([{system: '<unsafe>', pockets: [{name: '&"'}]}]), /&lt;unsafe&gt;.*&amp;&quot;/);
  assert.equal(routeDisplay(world, destination, null, {}).available, false);
});


test("system rows group consecutive pockets in route order and mark the current pocket", () => {
  const world = hud.generateGalaxy(), start = world.pocketsById.hollow;
  const local = Object.values(world.pocketsById).find(p => p.parent === start.parent && p.id !== start.id);
  const remote = Object.values(world.pocketsById).find(p => p.parent !== start.parent);
  const again = Object.values(world.pocketsById).find(p => p.parent === remote.parent && p.id !== remote.id);
  const route = [start.id, local.id, remote.id, again.id, start.id];
  const summary = routeDisplay(world, { pocketId: start.id }, route, {});
  assert.equal(summary.stops.length, 3, "each contiguous system is one row, including revisits");
  assert.deepEqual(summary.stops.map(row => row.pockets.map(p => p.name)),
    [[start.n, local.n], [remote.n, again.n], [start.n]]);
  assert.equal(summary.stops[0].pockets[0].current, true);
  assert.ok(summary.stops.flatMap(row => row.pockets).slice(1).every(p => !p.current));
  assert.match(routeRows(summary.stops), /aria-current="location"[^>]*>.* \(here\)/);
});


test("flight systems omit completed and pocket detail while starmap retains both", () => {
  const world = hud.generateGalaxy(), start = world.pocketsById.hollow;
  const local = Object.values(world.pocketsById).find(p => p.parent === start.parent && p.id !== start.id);
  const remote = Object.values(world.pocketsById).find(p => p.parent !== start.parent);
  const remoteLocal = Object.values(world.pocketsById).find(p => p.parent === remote.parent && p.id !== remote.id);
  const detail = routeDisplay(world, { pocketId: remoteLocal.id }, [start.id, local.id, remote.id, remoteLocal.id], {}, start.id, [remote.parent]);
  const compact = flightRouteRows(detail.stops);
  assert.doesNotMatch(compact, /route-done|✓|<small>/);
  assert.match(compact, /class="route-here" aria-current="location"/);
  assert.ok(!compact.includes(local.n));
  assert.ok(!compact.includes(remoteLocal.n));
  assert.equal((compact.match(/<li(?: [^>]*)?>/g) || []).length, 2);
  const full = routeRows(detail.stops);
  assert.match(full, /class="route-done"/);
  assert.ok(full.includes(local.n));
  assert.ok(full.includes(remoteLocal.n), "starmap retains full pocket details");
  assert.match(flightRouteRows([{system:'<unsafe>', pockets:[], completed:false}]), /&lt;unsafe&gt;/);
});

test("system count excludes the current system and handles singular and local targets", () => {
  const { state } = hud, world = hud.generateGalaxy(), player = { place: "hollow" };
  state.galaxy = world; state.players = [player]; state.localPlayerIndex = 0;
  state.worldState.galaxy = { knowledge: {} };
  const startSystem = world.pocketsById[player.place].parent;
  const adjacent = world.systems.find(s => s.id !== startSystem && (() => {
    const route = hud.findDestinationRoute(world, player.place, s.id, { player, profile: state.profile, world: state.worldState });
    return route && routeDisplay(world, s.id, route, {}).stops.length === 2;
  })());
  assert.ok(adjacent);
  const el = { hidden: true, innerHTML: "" };
  state.ui.destination = adjacent.id; hud.updateHudRoute(0, el);
  assert.match(el.innerHTML, /\(1 system\)/);
  const local = Object.values(world.pocketsById).find(p => p.parent === startSystem && p.id !== player.place);
  state.ui.destination = { pocketId: local.id }; hud.updateHudRoute(0, el);
  assert.match(el.innerHTML, /\(0 systems\)/);
  assert.match(el.innerHTML, /aria-current="location"/);
  state.ui.destination = null; hud.updateHudRoute(0, el);
});
