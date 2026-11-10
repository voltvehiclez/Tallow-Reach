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
  const route = hud.findDestinationRoute(world, player.place, target.id, { player, profile: state.profile, world: state.worldState });
  assert.ok(route.length > 1);
  for (const link of Object.values(world.links)) if (link.kind === "gate") link.enabled = false;
  hud.updateHudRoute(0.6, el);
  assert.match(el.innerHTML, /No route available/);
  for (const link of Object.values(world.links)) if (link.kind === "gate") link.enabled = true;
  hud.updateHudRoute(0.6, el);
  assert.match(el.innerHTML, /J · next warp/);
  state.ui.destination = { pocketId: route.at(-1) };
  hud.updateHudRoute(0, el);
  assert.ok(el.innerHTML.includes(world.pocketsById[route.at(-1)].n), "exact pocket target refreshes immediately");
  player.place = route.at(-1);
  hud.updateHudRoute(0, el);
  assert.doesNotMatch(el.innerHTML, /<li>/, "remaining stops update immediately after arriving");
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
  assert.equal(summary.stops.at(-1).pocket, target.n);
  assert.match(summary.title, /\(/);
  const hiddenWorld = { ...world, visibility: { mode: "discovered" } };
  assert.deepEqual(routeDisplay(hiddenWorld, destination, [start.id, target.id], {}).stops,
    [{ system: "Undiscovered system", pocket: null }]);
  assert.match(routeRows([{system: '<unsafe>', pocket: '&"'}]), /&lt;unsafe&gt;.*&amp;&quot;/);
  assert.equal(routeDisplay(world, destination, null, {}).available, false);
});
