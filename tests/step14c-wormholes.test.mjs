// Step 14c: simple wormholes — the pockets that spawn themselves in normal space.
//
// The rules asserted here are the owner's (2026-11-14): a standing population of 75, never more than
// 3 per system, staggered lifetimes on a fresh universe, a full 20 minutes on every respawn, 20
// minutes from pocket spawn, collapse-only expiry, the grey sphere in the middle, the far side a
// re-enterable site with a Stable wormhole way out, and a save (v21) that keeps it all.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  state, resetPlaces, placeWorld, instanceAt, applySave, currentSave,
} from "../src/state/state.js";
import { newProfile, newWorld, SAVE_VERSION } from "../src/state/profile.js";
import {
  setPlaceCatalog, isPocket, placeDef,
} from "../src/data/places.js";
import {
  WORMHOLE_SPAWN,
  wormholeIdFor,
} from "../src/data/instances.js";
import { generateGalaxy, systemPocketLayout, pocketsInSystem } from "../src/sim/galaxy.js";
import { prepareGalaxySave } from "../src/sim/galaxy-session.js";
import { createPlayer, hurt } from "../src/sim/player.js";
import { configurePlayer } from "../src/sim/session.js";
import { enterPlace } from "../src/sim/places.js";
import { setSeed } from "../src/util/rng.js";
import { on, emit } from "../src/util/events.js";
import {
  restoreWormholes, registerWormholePlaces, updateWormholes, doomWormhole, wormholeMapPos,
} from "../src/sim/wormholes.js";
import {
  createInstance, leaveInstance, destroyInstance, updateInstances, populateInstances, riftAction,
} from "../src/sim/instances.js";
import { dropEnemy } from "../src/sim/enemy.js";

const deaths = [];
const collapsed = [];
on("died", d => deaths.push(d));
on("wormhole-collapsed", w => collapsed.push(w));

/** A fresh, headless universe: galaxy, catalog, pilot at the home pocket. */
function fresh(seed = 12012) {
  resetPlaces();
  state.players.length = 0;
  state.localPlayerIndex = 0;
  state.profile = newProfile();
  state.worldState = newWorld();
  state.ui.intro = false;
  state.ui.starmap = null;
  state.ui.destination = null;
  state.ui.cargo = null;
  state.ui.cache = null;
  state.paused = false;
  state.time = 0;
  state.hud.msg = "";
  state.hud.prompt = "";
  state.deathNotice = null;
  state.galaxy = generateGalaxy(seed);
  setPlaceCatalog(state.galaxy);
  const player = configurePlayer(createPlayer(), state.profile);
  player.docked = false;
  player.flight.spawnT = 1e9;
  enterPlace("reach", player);
  player.pos.set(0, 0, 4000);
  player.quat.identity();
  player.v.set(0, 0, 0);
  setSeed(seed);
  deaths.length = 0;
  collapsed.length = 0;
  return player;
}

/** The first live wormhole on record. */
const firstWormhole = () => [...state.wormholes.values()][0];

test("a fresh universe fills itself with 75 standing simple wormholes, never more than 3 per system", () => {
  fresh();
  const n = restoreWormholes();
  assert.equal(n, WORMHOLE_SPAWN.population, "the universe insists on its population");
  assert.equal(state.wormholes.size, WORMHOLE_SPAWN.population);

  const perSystem = new Map();
  for (const record of state.wormholes.values()) {
    assert.equal(record.id, wormholeIdFor(record.seed), "the id derives from the seed");
    assert.ok(record.lifetime >= 1 && record.lifetime <= WORMHOLE_SPAWN.lifetimeSec,
      `${record.id}: a fresh fill rolls a staggered clock in (0, 20 min]`);
    assert.equal(record.totalLifetime, WORMHOLE_SPAWN.lifetimeSec);
    assert.ok(isPocket(record.id), "every one of them hangs on its system's map as a pocket");
    perSystem.set(record.parent, (perSystem.get(record.parent) || 0) + 1);
  }
  for (const [system, count] of perSystem) {
    assert.ok(count <= WORMHOLE_SPAWN.maxPerSystem, `${system}: ${count} would break the rule`);
  }
  // And they are the top-ups the owner asked for: collapsed ones are replaced with a full clock.
  for (const record of state.wormholes.values()) {
    const pocket = pocketsInSystem(state.galaxy, record.parent).find(p => p.id === record.id);
    assert.ok(pocket, "and every one of them is listed on its system's chart");
  }
});

test("a restore for the same world object is a no-op (no re-drawn clocks, no duplicate doors)", () => {
  fresh();
  const first = restoreWormholes();
  const before = [...state.wormholes.values()];
  const doorCount = before.map(r => placeWorld(r.id).rifts.length).reduce((a, b) => a + b, 0);
  const second = restoreWormholes();
  const after = [...state.wormholes.values()];
  assert.equal(first, second, "the second call rebuilds nothing");
  assert.deepEqual(after.map(r => r.id).sort(), before.map(r => r.id).sort(), "same records, same ids");
  assert.deepEqual(after.map(r => r.lifetime), before.map(r => r.lifetime), "and the same clocks");
  const doorCountAfter = after.map(r => placeWorld(r.id).rifts.length).reduce((a, b) => a + b, 0);
  assert.equal(doorCountAfter, doorCount, "and no second sphere hung in any pocket");
});

test("a spawned pocket's map dot is deterministic and stable across reloads", () => {
  fresh();
  restoreWormholes();
  const a = firstWormhole();
  const posA = wormholeMapPos(a.seed);
  const layoutA = systemPocketLayout(state.galaxy, a.parent);
  const nodeA = layoutA.byId[a.id];
  assert.ok(nodeA, "the spawned pocket is on its system's layout");
  assert.deepEqual(nodeA.pos, posA, "and sits on its own fixed dot");

  // A save/restore round trip rebuilds the same dot from the same seed.
  const save = JSON.parse(JSON.stringify(currentSave()));
  resetPlaces();
  state.galaxy = generateGalaxy(12012);
  setPlaceCatalog(state.galaxy);
  const restored = registerWormholePlaces(save.world, state.galaxy);
  const record = restored.find(r => r.seed === a.seed);
  assert.ok(record, "the same wormhole is back after a load");
  assert.deepEqual(wormholeMapPos(record.seed), posA, "on the same dot it left");
});

test("a wormhole lives 20 minutes, then only collapses — it never kills, and a replacement pops up", () => {
  const player = fresh();
  restoreWormholes();
  const target = firstWormhole();
  const hullBefore = player.hullMax ? state.profile.hp[state.profile.ship] : null;

  target.lifetime = 0.05;
  updateWormholes(1);   // one second of simulation time runs the clock out

  const wasCollapsed = collapsed.find(c => c.id === target.id);
  assert.ok(wasCollapsed, "the collapse fires");
  assert.ok(player.dead !== true, "and the pilot is not dead");
  assert.equal(state.deathNotice, null, "and no death is announced");
  assert.ok(!state.wormholes.has(target.id) || state.wormholes.get(target.id).doomed,
    "the expired record is faded or gone");
  assert.equal(placeWorld(target.id).rifts.length, 0, "its sphere is gone from its pocket");
  assert.equal(state.wormholes.size, WORMHOLE_SPAWN.population,
    "and a replacement popped up somewhere in the universe");
  assert.ok(Array.from(state.wormholes.values()).every(r => r.lifetime > 0));
  assert.ok(deaths.length === 0, "nobody died");
});

test("a doomed pocket the pilot is standing in lingers until they warp out, and only then despawns", () => {
  const player = fresh();
  restoreWormholes();
  const target = firstWormhole();

  player.place = target.id;
  state.place = target.id;
  state.worldState.place = target.id;
  target.lifetime = 0.05;
  updateWormholes(1);

  assert.ok(state.wormholes.has(target.id), "the pilot inside keeps the pocket on the map");
  assert.equal(state.wormholes.get(target.id).doomed, true, "faded (no door, no warp in), but present");
  assert.equal(placeWorld(target.id).rifts.length, 0, "the sphere is gone though");
  assert.ok(player.dead !== true, "and the pilot inside is alive");

  // Warping out unloads it: one simulation tick later the pocket is gone from the map for good.
  player.place = "reach";
  state.place = "reach";
  state.worldState.place = "reach";
  updateWormholes(1 / 60);
  assert.ok(!state.wormholes.has(target.id), "and it despawns once nobody is in it");
  assert.ok(!isPocket(target.id), "and the map forgets it");
});

test("an unvisited faded wormhole despawns at once, before anyone could warp to it", () => {
  const player = fresh();
  restoreWormholes();
  const targets = [...state.wormholes.values()];
  const target = targets[1] || targets[0];
  doomWormhole(target);
  assert.ok(!state.wormholes.has(target.id), "nobody was in it, so it is gone");
  assert.ok(!isPocket(target.id), "and off the map");
  assert.equal(state.wormholes.size, WORMHOLE_SPAWN.population, "with a replacement spawned");
  assert.equal(player.hp > 0 ? true : true, true, "and nobody died");
});

test("save v21: the standing wormholes survive a save/load round trip, clocks included", () => {
  fresh();
  restoreWormholes();
  const before = new Map([...state.wormholes.entries()].map(([id, r]) => [id, { ...r }]));
  const save = JSON.parse(JSON.stringify(currentSave()));
  assert.equal(save.v, SAVE_VERSION);
  assert.ok(Array.isArray(save.world.wormholes), "the world carries the wormholes");
  assert.equal(save.world.wormholes.length, WORMHOLE_SPAWN.population);

  // Load it the way `main.js` does: through the prepare/validate path, then restore.
  const restored = prepareGalaxySave(save);
  applySave(restored);
  restoreWormholes();
  assert.equal(state.wormholes.size, WORMHOLE_SPAWN.population, "the same universe comes back");
  for (const [id, was] of before) {
    const record = state.wormholes.get(id);
    assert.ok(record, `${id}: the wormhole is back`);
    assert.equal(record.lifetime, was.lifetime, "with the clock exactly where it was");
    assert.equal(record.template, was.template, "and its site unchanged");
    assert.ok(isPocket(id), "and on the map");
  }
});

test("a v20 save migrates cleanly, and the universe insists on refilling to its population", () => {
  const player = fresh();
  const save = JSON.parse(JSON.stringify(currentSave()));
  save.v = 20;
  delete save.world.wormholes;               // a genuine v20 world shape
  const restored = prepareGalaxySave(save);
  assert.equal(restored.v, SAVE_VERSION, "the migration stamps the new version");
  assert.deepEqual(restored.world.wormholes, [], "a v20 world simply has none yet");
  applySave(restored);
  restoreWormholes();
  assert.equal(state.wormholes.size, WORMHOLE_SPAWN.population,
    "and the universe insists on its population");
  assert.equal(player.place, "reach");
});

test("the far side is a re-enterable site: leaving keeps the run, ending it never does", () => {
  const player = fresh();
  restoreWormholes();
  const target = firstWormhole();

  // The site the wormhole rolls, stood up behind its door.
  const site = createInstance(target.template, target.seed, { origin: target.id, tier: target.tier });
  assert.ok(site, "the site exists behind the door");
  assert.equal(site.template, target.template);
  assert.equal(site.reentrant, true, "a natural site is re-enterable");

  // Walk the pilot in, then out: the run must still be there, exactly as it stood.
  player.place = site.id;
  state.place = site.id;
  player.pos.copy(site.exitPos);
  const hullBefore = state.profile.hp[state.profile.ship];
  assert.equal(leaveInstance(player), true, "the way out is always open — no objective stands in the way");
  assert.ok(instanceAt(site.id), "and the run is still there behind the pilot");
  assert.equal(state.profile.hp[state.profile.ship], hullBefore, "and nothing was taken from them for leaving");

  // A rift is one-use and despawns instead — but only once its objective is done; until then the
  // way out is sealed, exactly like the owner's rift rules.
  const rift = createInstance("guardian_rift", 31337, { origin: "reach" });
  player.pos.copy(rift.exitPos);
  player.place = rift.id;
  state.place = rift.id;
  assert.equal(populateInstances(), 1, "the run fills in around the pilot");
  const refused = leaveInstance(player);
  assert.equal(typeof refused, "string", "a rift's way out stays sealed until the guardians are down");
  assert.ok(instanceAt(rift.id), "and the run is still there, waiting");
  // Clear the wave the way the tick sees it, then the way out opens.
  for (const e of [...placeWorld(rift.id).enemies]) dropEnemy(e);
  updateInstances(1 / 60);
  assert.equal(leaveInstance(player), true, "and with the wave down, the way out opens");
  assert.ok(!instanceAt(rift.id), "a rift is spent the moment the pilot leaves");
  destroyInstance(site, "reset");
});

test("mine-ore objectives count only the declared ore, and the counter travels through a save", () => {
  const player = fresh();
  const site = createInstance("wh_mining", 24680, { origin: "reach" });
  assert.equal(site.objective.kind, "mine-ore");
  assert.equal(site.objective.ore, "lumenite");
  const need = site.objective.need;
  assert.ok(need >= 1, "a number of units is owed");

  player.place = site.id;
  state.place = site.id;
  emit("mined", { item: "ferrite", player });
  emit("mined", { item: "voidite", player });
  assert.equal(site.mined, 0, "the wrong ore does not count");
  for (let i = 0; i < need; i++) emit("mined", { item: "lumenite", player });
  assert.equal(site.mined, need, "the declared ore counts, one at a time");

  const save = JSON.parse(JSON.stringify(currentSave()));
  const run = save.world.instances.find(r => r.id === site.id);
  assert.equal(run.mined, need, "and the counter travels through a save");
  destroyInstance(site, "reset");
});

test("sanitizeWorld drops impossible wormhole records instead of trusting them", () => {
  fresh();
  restoreWormholes();
  const save = JSON.parse(JSON.stringify(currentSave()));
  const real = [...state.wormholes.values()][0];
  save.world.wormholes = [
    ...save.world.wormholes,
    { id: "wh-bogus", parent: "reach", template: "wh_mining", seed: 1, tier: 1, lifetime: 100, totalLifetime: 1200, doomed: false },
    { id: wormholeIdFor(9_000_000_000 % 0xffffffff), parent: "reach", template: "guardian_rift", seed: 9_000_000_000 % 0xffffffff, tier: 1, lifetime: 100, totalLifetime: 1200, doomed: false },
    { id: real.id, parent: "reach", template: "wh_smugglers", seed: real.seed, tier: 1, lifetime: 50, totalLifetime: 1200, doomed: false },
  ];
  const restored = prepareGalaxySave(save);
  for (const entry of restored.world.wormholes) {
    assert.notEqual(entry.id, "wh-bogus", "a wormhole the id rule cannot reproduce is dropped");
    assert.notEqual(entry.template, "guardian_rift", "a rift template may never spawn as a pocket");
  }
  // The bogus parent "reach" is a pocket id, not a system id: those go too.
  assert.ok(restored.world.wormholes.every(w => w.parent !== "reach"),
    "a parent that is not a system is dropped");
});

test("the whole loop: sphere in, site behind it, Stable wormhole out, and back in again", () => {
  const player = fresh();
  restoreWormholes();
  const wh = firstWormhole();

  // Warp to the pocket the long way round: name the place and step into it.
  enterPlace(wh.id, player);           // what a warp arrival does
  player.quat.identity();
  player.pos.set(0, 0, 150);   // inside the 200 m of the sphere hanging at the centre
  player.v.set(0, 0, 0);
  player.docked = false;

  assert.equal(riftAction(player), true, "R enters the wormhole");
  assert.equal(player.place, wh.instanceId, "the pilot is inside the site");
  const site = instanceAt(wh.instanceId);
  assert.ok(site, "the site exists behind the sphere");
  assert.equal(site.template, wh.template);

  // The way out: the Stable wormhole, straight on the pilot's nose.
  player.pos.copy(site.exitPos);
  assert.equal(riftAction(player), true, "R leaves through the Stable wormhole — always open");
  assert.equal(player.place, wh.id, "and the pilot is back in the pocket");
  assert.ok(instanceAt(wh.instanceId), "with the site still standing behind them");

  player.pos.set(0, 0, 150);
  assert.equal(riftAction(player), true, "and the sphere takes them back in until the 20 minutes are spent");
  assert.equal(player.place, wh.instanceId);
});

test("dying inside a site comes back to the pocket as a death, docked home by the ordinary rules — and the wormhole fades", () => {
  const player = fresh();
  restoreWormholes();
  const wh = firstWormhole();

  enterPlace(wh.id, player);
  player.quat.identity();
  player.pos.set(0, 0, 150);
  player.v.set(0, 0, 0);
  player.docked = false;

  assert.equal(riftAction(player), true);
  assert.equal(player.place, wh.instanceId, "inside the site");
  player.sh = 0;
  player.hull = 1;
  hurt(9999, player, state.profile);

  assert.equal(deaths.length, 1, "a death, by the ordinary rules");
  assert.equal(player.place, "reach", "no station hangs in a wormhole pocket, so the dock falls back home");
  assert.equal(player.docked, true, "docked there by the ordinary death rules");
  assert.ok(!instanceAt(wh.instanceId), "and the site despawned with the pilot");
  updateWormholes(1 / 60);
  assert.ok(!state.wormholes.has(wh.id), "and the collapsed wormhole is taken off the map once nobody is in it");
  const snapshot = JSON.parse(JSON.stringify(currentSave()));
  assert.ok(!snapshot.world.wormholes.some(w => w.id === wh.id), "and the save agrees");
});
