import { test } from "node:test";
import assert from "node:assert/strict";
import { loadHeadless } from "./headless.mjs";
import { routeDisplay, routeRows } from "../src/ui/route-display.js";

const hud = await loadHeadless("src/ui/hud.js", {
  state: "src/state/state.js", generateGalaxy: "src/sim/galaxy.js", findDestinationRoute: "src/sim/travel.js",
});

test("flight route display follows destination and remaining stops and hides on clear", () => {
  const { state } = hud, world = hud.generateGalaxy();
  const player = { place: "hollow" };
  state.galaxy = world; state.players = [player]; state.localPlayerIndex = 0;
  state.worldState.galaxy = { knowledge: {} };
  const target = world.systems.find(s => s.id !== "meridian");
  state.ui.destination = target.id;
  const el = { hidden: true, innerHTML: "" };
  hud.updateHudRoute(0, el);
  assert.equal(el.hidden, false);
  assert.match(el.innerHTML, /Route to /);
  assert.ok(el.innerHTML.includes(target.n));
  assert.match(el.innerHTML, /J · next warp/);
  assert.ok(el.innerHTML.includes(`${world.pocketsById[player.place].n} (here)</strong>`));
  const route = hud.findDestinationRoute(world, player.place, target.id, { player, profile: state.profile, world: state.worldState });
  assert.ok(route.length > 1);
  const expected = route.map(id => world.pocketsById[id].n);
  const model = routeDisplay(world, target.id, route, {});
  assert.deepEqual(model.stops.flatMap(stop => stop.pockets.map(p => p.name)), expected, "every local and gate hop appears in order");
  assert.ok(route.some((id, i) => i > 0 && world.pocketsById[id].parent === world.pocketsById[route[i - 1]].parent), "covers a local pocket jump");
  for (const row of model.stops.slice(1)) assert.doesNotMatch(routeRows([row], { compact: true }), /<small>·/, "future systems do not display pocket names");
  assert.match(el.innerHTML, /\d+ jumps?/);
  player.place = route[1];
  hud.updateHudRoute(0, el);
  assert.ok(el.innerHTML.includes(`${world.pocketsById[player.place].n} (here)</strong>`), "current area updates on a hop");
  player.place = route[0];
  hud.updateHudRoute(0, el);
  for (const link of Object.values(world.links)) if (link.kind === "gate") link.enabled = false;
  hud.updateHudRoute(0.6, el);
  assert.match(el.innerHTML, /No route available/);
  assert.ok(el.innerHTML.includes(`Current:</strong> ${world.pocketsById[player.place].n}`), "current area remains visible when blocked");
  for (const link of Object.values(world.links)) if (link.kind === "gate") link.enabled = true;
  hud.updateHudRoute(0.6, el);
  assert.match(el.innerHTML, /J · next warp/);
  state.ui.destination = { pocketId: route.at(-1) };
  hud.updateHudRoute(0, el);
  assert.match(el.innerHTML, /Route to /, "exact pocket target refreshes immediately");
  player.place = route.at(-1);
  hud.updateHudRoute(0, el);
  assert.equal((el.innerHTML.match(/<li(?: class="[^"]+")?>/g) || []).length, 1, "only the current system remains after arriving");
  assert.ok(el.innerHTML.includes(`${world.pocketsById[player.place].n} (here)</strong>`));
  state.ui.destination = null;
  hud.updateHudRoute(0, el);
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


test("compact route keeps completed systems and shows only current-system pocket detail", () => {
  const world = hud.generateGalaxy(), start = world.pocketsById.hollow;
  const local = Object.values(world.pocketsById).find(p => p.parent === start.parent && p.id !== start.id);
  const remote = Object.values(world.pocketsById).find(p => p.parent !== start.parent);
  const remoteLocal = Object.values(world.pocketsById).find(p => p.parent === remote.parent && p.id !== remote.id);
  const detail = routeDisplay(world, { pocketId: remoteLocal.id }, [start.id, local.id, remote.id, remoteLocal.id], {}, start.id, [remote.parent]);
  assert.equal(detail.completedCount, 1);
  assert.equal(detail.stops[0].completed, true);
  assert.equal(detail.stops[1].jumps, 2, "counts both the local jump and departure gate");
  assert.equal(detail.stops[2].jumps, 1);
  const compact = routeRows(detail.stops, { compact: true });
  assert.match(compact, /class="route-done"/);
  assert.match(compact, /class="route-here"/);
  assert.match(compact, /2 jumps/);
  assert.ok(compact.includes(local.n));
  assert.ok(!compact.includes(remoteLocal.n));
  assert.ok(routeRows(detail.stops).includes(remoteLocal.n), "starmap retains full pocket details");
});
