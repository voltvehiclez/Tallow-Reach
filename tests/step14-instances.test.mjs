// Step 14a: rifts and instances — the door, the run, the locked cache, the clock and the way out.
//
// Everything asserted here is a rule the owner set on 2026-11-14 (docs/VISION.md, "Step 14"): the
// numbers live in data/instances.js, the behaviour in sim/instances.js, and nothing below reaches
// into render/, ui/ or core/.
import { test } from "node:test";
import assert from "node:assert/strict";
import { newProfile, newWorld } from "../src/state/profile.js";
import { state, resetPlaces, placeWorld, instanceAt, captureResume, currentSave } from "../src/state/state.js";
import {
  setPlaceCatalog, placeAt, placeDef, isPocket, isInstancePlace, pocketsIn, DEFAULT_PLACE,
} from "../src/data/places.js";
import {
  RIFT, RIFTS, INSTANCE_TEMPLATES, OBJECTIVE_KINDS, EXIT_REQUIREMENT_TYPES, EXPIRY_OUTCOME_TYPES,
  instanceIdFor,
} from "../src/data/instances.js";
import { LOOT_TABLES } from "../src/data/loot.js";
import { ENEMIES } from "../src/data/enemies.js";
import { generateGalaxy } from "../src/sim/galaxy.js";
import { createPlayer, hurt } from "../src/sim/player.js";
import { configurePlayer } from "../src/sim/session.js";
import { enterPlace, loadPlace } from "../src/sim/places.js";
import { addItem, countOf } from "../src/sim/inventory.js";
import { hitHostile } from "../src/sim/combat.js";
import { dropEnemy } from "../src/sim/enemy.js";
import { useItem, canUse, USE_ACTIONS } from "../src/sim/consumables.js";
import {
  rollRiftTemplate, createInstance, riftClearance, openRift, enterRift, leaveInstance,
  destroyInstance, exitDenial, objectiveDone, updateInstances, nearestRift, riftAction,
  OBJECTIVES, EXIT_REQUIREMENTS, EXPIRY_OUTCOMES,
} from "../src/sim/instances.js";
import { setSeed } from "../src/util/rng.js";
import { V } from "../src/util/math.js";
import { on } from "../src/util/events.js";

/** A clear spot in the home pocket: over a km from the station, the field's edge and the planet. */
const CLEAR = [0, 0, 4000];

// The bus has no unsubscribe, so listeners registered here live for the whole file. Each test that
// watches an event clears its own list first, which keeps later tests from tripping earlier ones.
const deaths = [];
const closures = [];
const expiries = [];
on("died", text => deaths.push(text));
on("instance-closed", payload => closures.push(payload));
on("instance-expired", payload => expiries.push(payload));

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
  enterPlace(DEFAULT_PLACE, player);
  player.pos.set(...CLEAR);
  player.quat.identity();
  player.v.set(0, 0, 0);
  setSeed(seed);
  deaths.length = 0;
  closures.length = 0;
  expiries.length = 0;
  return player;
}

/** Give the pilot some rifts, the way the shop would. */
function withRifts(player, n = 3) {
  addItem(state.profile.ship, "rift_basic", n, state.profile);
  return player;
}

/** A live run: the pilot is inside an instance, and its record is returned. Which template the
 *  door leads to is a weighted roll, so the session rng is seeded with the same number: one seed is
 *  then one instance in every respect, which is what the determinism tests below need. */
function insideRift(player, seed = 4242) {
  setSeed(seed);
  const rift = openRift("basic", player, seed);
  assert.equal(typeof rift, "object", `the rift opens in clear space (${rift})`);
  assert.equal(enterRift(rift, player), true, "and the pilot goes in");
  return instanceAt(player.place);
}

/** Empty an instance's wave without a fight, then let the tick notice. */
function clearWave(record) {
  for (const e of [...placeWorld(record.id).enemies]) dropEnemy(e);
  updateInstances(1 / 60);
}

test("every instance template is complete data, and the registries know every word it uses", () => {
  fresh();
  const ids = Object.keys(INSTANCE_TEMPLATES);
  assert.ok(ids.length >= 2, "step 14 needs at least two instance templates");
  for (const [id, t] of Object.entries(INSTANCE_TEMPLATES)) {
    assert.ok(t.n && t.d, `${id}: a name and a description`);
    assert.ok(Number(t.tier) > 0, `${id}: an advisory tier`);
    assert.ok(Number(t.lifetimeSec) > 0, `${id}: a lifetime`);
    assert.ok(Number(t.difficulty?.hp) > 1 && Number(t.difficulty?.dmg) > 1,
      `${id}: harder than the map, which scales no enemy at all`);
    assert.ok(ENEMIES[t.guardians?.enemy], `${id}: its guardian is a real enemy`);
    assert.ok(Number(t.guardians.count) > 0, `${id}: it declares a wave`);
    const [lo, hi] = t.guardians.spawnDist;
    assert.ok(lo > 0 && hi >= lo, `${id}: its wave spawns at a real distance band`);
    assert.ok(OBJECTIVE_KINDS.includes(t.objective?.kind), `${id}: the objective kind is declared vocabulary`);
    assert.ok(typeof OBJECTIVES[t.objective.kind] === "function", `${id}: and sim/instances.js can check it`);
    assert.ok(t.objective.n, `${id}: an authored objective sentence for the HUD`);
    assert.ok(t.exit?.n, `${id}: the way out has a name the pilot is shown`);
    for (const requirement of t.exit.requires) {
      assert.ok(EXIT_REQUIREMENT_TYPES.includes(requirement.type), `${id}: the exit rule is declared vocabulary`);
      assert.ok(typeof EXIT_REQUIREMENTS[requirement.type] === "function", `${id}: and has a handler`);
      assert.ok(requirement.message, `${id}: a sealed exit says why in its own words`);
    }
    assert.ok(EXPIRY_OUTCOME_TYPES.includes(t.onExpire?.kind), `${id}: the expiry outcome is declared vocabulary`);
    assert.ok(typeof EXPIRY_OUTCOMES[t.onExpire.kind] === "function", `${id}: and has a handler`);
    assert.ok(t.onExpire.message, `${id}: running out of time says so`);
    assert.ok(LOOT_TABLES[t.cache?.loot], `${id}: its cache names a real loot table`);
    assert.ok(Array.isArray(t.cache.pos) && t.cache.pos.length === 3, `${id}: its cache hangs somewhere`);
    assert.ok(Array.isArray(t.enter?.pos) && t.enter.pos.length === 3, `${id}: it has an arrival point`);
    assert.ok(Array.isArray(t.features) && t.features.length > 0, `${id}: it has features to load`);
    for (const feature of t.features) {
      if (feature.kind === "spawner") assert.fail(`${id}: an instance declares its own wave, never a spawner`);
      if (feature.kind === "asteroidField") assert.ok(LOOT_TABLES[feature.ore], `${id}: its rock ore is a real table`);
    }
  }
  for (const [riftId, def] of Object.entries(RIFTS)) {
    assert.ok(def.n, `${riftId}: a name`);
    assert.ok(def.templates?.length, `${riftId}: a pool of templates`);
    for (const entry of def.templates) {
      assert.ok(INSTANCE_TEMPLATES[entry.id], `${riftId}: ${entry.id} is a real template`);
      assert.ok(Number(entry.w) > 0, `${riftId}: ${entry.id} has a positive weight`);
    }
  }
});

test("which template a rift opens is a weighted roll, and a bad pool refuses instead of guessing", () => {
  fresh();
  const steps = [0, 0.5, 0.84, 0.86, 0.99];
  let i = 0;
  const counts = {};
  for (let k = 0; k < steps.length; k++) {
    const id = rollRiftTemplate("basic", () => steps[i++]);
    counts[id] = (counts[id] || 0) + 1;
  }
  // The weights are 85/15, so 0, 0.5 and 0.84 land in the usual run and 0.86, 0.99 in the rare one.
  assert.equal(counts.guardian_rift, 3, "the usual run comes up most often");
  assert.equal(counts.deep_rift, 2, "and the rarer one at the top of the range");
  assert.equal(rollRiftTemplate("basic", () => 0.999999), "deep_rift", "a roll at the very top still lands in the pool");
  assert.equal(rollRiftTemplate("nope"), null, "an unknown rift kind opens nothing");

  const backup = RIFTS.basic.templates;
  RIFTS.basic.templates = [{ id: "not_a_template", w: 5 }];
  assert.equal(rollRiftTemplate("basic"), null, "a pool of unknown templates opens nothing");
  RIFTS.basic.templates = [{ id: "guardian_rift", w: 0 }];
  assert.equal(rollRiftTemplate("basic"), null, "and a weight of zero means never");
  RIFTS.basic.templates = backup;
  assert.equal(rollRiftTemplate("basic", () => 0), "guardian_rift", "the pool is whole again");
});

test("the same seed is the same instance: same id, same rocks, and no trace in the world", () => {
  fresh();
  const read = seed => {
    const record = createInstance("guardian_rift", seed, { origin: DEFAULT_PLACE });
    loadPlace(record.id);
    const rocks = placeWorld(record.id).asteroids.map(r => ({
      p: [r.pos.x, r.pos.y, r.pos.z].map(n => Number(n.toFixed(6))),
      type: r.type,
      r: Number(r.r.toFixed(6)),
    }));
    const out = { id: record.id, rocks };
    destroyInstance(record, "reset");
    return out;
  };

  const a = read(99);
  const b = read(99);
  const c = read(100);
  assert.equal(a.id, instanceIdFor("guardian_rift", 99), "the place id is derived from the template and the seed");
  assert.deepEqual(b, a, "the same seed builds exactly the same instance");
  assert.notEqual(c.id, a.id, "a different seed is a different instance");
  assert.notDeepEqual(c.rocks, a.rocks, "and its debris is laid out differently");
  assert.equal(a.rocks.length, INSTANCE_TEMPLATES.guardian_rift.features[0].count, "every declared rock is there");
  assert.deepEqual(state.worldState.placeMemory, {}, "an instance writes no place memory, so nothing outlives it");
});

test("a rift opens only in clear space, and every margin is data", () => {
  const player = fresh();
  assert.equal(riftClearance(player), true, "over a km from everything: clear");

  player.pos.set(300, 0, 0);
  assert.match(riftClearance(player), /Too close to/, "a station keeps its kilometre");
  assert.ok(riftClearance(player).includes(`${RIFT.clearance.station / 1000} km`), "and names the data's number");

  player.pos.set(1800, 200, -700);
  assert.match(riftClearance(player), /asteroid field/i, "a field is measured to its edge, not its centre");

  player.pos.set(-7000, -1500, -6500);
  assert.match(riftClearance(player), /planet/, "a planet is measured from its surface");

  // A single rock has a much smaller margin, so a rift never opens inside one.
  player.pos.set(...CLEAR);
  placeWorld(DEFAULT_PLACE).asteroids.push({ kind: "rock", place: DEFAULT_PLACE, pos: V(0, 0, CLEAR[2] + 60), r: 40 });
  assert.match(riftClearance(player), /Too close to a rock/, "and a rock keeps its own margin");
  assert.ok(riftClearance(player).includes(`${RIFT.clearance.rock} m`), "which is the data's number too");
});

test("using the item opens a rift at the ship and spends exactly one", () => {
  const player = withRifts(fresh(), 3);
  assert.equal(canUse("rift_basic"), true, "a consumable can be used");
  assert.equal(canUse("ferrite"), false, "ore cannot");
  assert.equal(typeof USE_ACTIONS["spawn-rift"], "function", "and its action is registered");

  const text = useItem("rift_basic", state.profile.ship, player);
  assert.match(text, /opens ahead/, `the pilot is told what happened (${text})`);
  assert.equal(countOf(state.profile.ship, "rift_basic"), 2, "one was spent");

  const rifts = placeWorld(DEFAULT_PLACE).rifts;
  assert.equal(rifts.length, 1, "one door hangs in the pocket");
  assert.equal(rifts[0].kind, "rift", "it is a record, not a mesh");
  assert.deepEqual([rifts[0].pos.x, rifts[0].pos.y, rifts[0].pos.z], [...CLEAR], "it opened exactly where the ship was");
  assert.ok(INSTANCE_TEMPLATES[rifts[0].template], "and it names a real template");

  // A refusal spends nothing and makes nothing.
  player.pos.set(200, 0, 0);
  assert.match(useItem("rift_basic", state.profile.ship, player), /Too close to/,
    "the clearance refusal reaches the pilot word for word");
  assert.equal(countOf(state.profile.ship, "rift_basic"), 2, "nothing was spent on a refusal");
  assert.equal(placeWorld(DEFAULT_PLACE).rifts.length, 1, "and no second door appeared");
  assert.match(useItem("ferrite", state.profile.ship, player), /cannot be used/, "ore says it cannot be used");

  // One door per template and seed: the same seed is the same instance, so it cannot be opened
  // twice. The roll is seeded the same way both times so both doors lead to the same template.
  player.pos.set(...CLEAR);
  setSeed(99);
  assert.equal(typeof openRift("basic", player, 5150), "object", "a door opens in clear space");
  setSeed(99);
  assert.equal(typeof openRift("basic", player, 5150), "string",
    "but a second door for a run that already exists is refused");
  assert.equal(placeWorld(DEFAULT_PLACE).rifts.length, 2, "so there are still only the two doors");
});

test("R at close range goes in; the run is generated, sealed and harder than the map", () => {
  const player = withRifts(fresh());
  const rift = openRift("basic", player, 7);
  assert.equal(nearestRift(player), rift, "the door within range is the one R would use");

  player.pos.set(CLEAR[0], CLEAR[1], CLEAR[2] + RIFT.enterRange + 500);
  assert.equal(nearestRift(player), null, "a door beyond RIFT.enterRange is not offered");
  assert.equal(riftAction(player), false, "so R does nothing out there");
  assert.match(state.hud.prompt, /Nothing to enter/, "and says so");
  assert.equal(player.place, DEFAULT_PLACE, "the pilot is still in the pocket");
  assert.match(enterRift(rift, player), /Fly closer/, "entering that door directly says how close to come");

  player.pos.set(...CLEAR);
  assert.equal(riftAction(player), true, "in range, R goes in");

  const record = instanceAt(player.place);
  assert.ok(record, "the pilot is inside an instance");
  assert.equal(record.id, rift.instance, "the one that door led to");
  assert.equal(isInstancePlace(record.id), true, "it is a runtime instance place");
  assert.equal(isPocket(record.id), false, "and never a pocket of the map");
  assert.equal(pocketsIn(placeAt(record.id).parent).includes(record.id), false, "so no system can list it");
  assert.equal(placeAt(record.id).n, INSTANCE_TEMPLATES[record.template].n, "the HUD can name it like any place");
  assert.equal(placeDef(record.id).features.length, INSTANCE_TEMPLATES[record.template].features.length,
    "and its features come from the template");
  assert.deepEqual([player.pos.x, player.pos.y, player.pos.z], [...record.enterPos.toArray()],
    "the pilot arrives at the template's arrival point");
  assert.equal(placeWorld(record.id).asteroids.length > 0, true, "its debris was built by the ordinary loader");

  const enemies = placeWorld(record.id).enemies;
  const wave = INSTANCE_TEMPLATES[record.template].guardians;
  assert.equal(enemies.length, wave.count, "the declared wave is there");
  for (const e of enemies) {
    assert.equal(e.hp, Math.round(ENEMIES[e.def].hp * record.difficulty.hp),
      "each guardian is hardened by the template's scalar");
    assert.equal(e.mx, e.hp, "and its maximum matches");
    assert.equal(e.encounter, null, "an instance's wave is no pocket encounter, so it writes no place memory");
    assert.ok(e.pos.distanceTo(player.pos) >= wave.spawnDist[0] - 1,
      `nothing spawns in the pilot's face (${Math.round(e.pos.distanceTo(player.pos))} m)`);
  }

  const caches = placeWorld(record.id).caches;
  assert.equal(caches.length, 1, "the locked cache is a physical thing in the world");
  assert.equal(caches[0].locked, true, "and it starts locked");
  assert.deepEqual([caches[0].pos.x, caches[0].pos.y, caches[0].pos.z],
    [...INSTANCE_TEMPLATES[record.template].cache.pos], "hanging where the template says");

  assert.equal(objectiveDone(record), false, "the objective is not done yet");
  assert.ok(exitDenial(record), "so the way out is sealed");
  assert.equal(exitDenial(record), INSTANCE_TEMPLATES[record.template].exit.requires[0].message,
    "and it refuses in the template's own words");
  assert.equal(leaveInstance(player), exitDenial(record), "R again does not leave a sealed run");
  assert.equal(instanceAt(player.place), record, "the pilot is still inside");
  updateInstances(1 / 60);
  assert.equal(state.hud.prompt, exitDenial(record), "and at the gate the prompt says why it is shut");

  // Slice 14a: an instance is session runtime, so the saved world still names the pocket it was
  // opened from, and the resume point is the spot the pilot left. 14b saves the run itself.
  const save = currentSave();
  assert.equal(save.world.place, DEFAULT_PLACE, "a save inside a rift names the pocket, not the instance");
  assert.deepEqual(save.world.resume.pos.map(Math.round), CLEAR.map(Math.round), "and comes back to the entry spot");
  assert.deepEqual(captureResume().pos.map(Math.round), CLEAR.map(Math.round), "which is what the resume point says");
});

test("destroying the wave opens the cache, which spills crates the pilot collects one by one", () => {
  const player = withRifts(fresh());
  const record = insideRift(player, 31337);
  const W = placeWorld(record.id);

  for (const e of W.enemies.slice(1)) hitHostile(e, 9999, e.pos, player, record.id);
  updateInstances(1 / 60);
  assert.equal(objectiveDone(record), false, "one guardian left: the objective is not done");
  assert.ok(exitDenial(record), "and the way out is still sealed");
  assert.equal(W.caches.length, 1, "the cache is still locked and still there");

  hitHostile(W.enemies[0], 9999, W.enemies[0].pos, player, record.id);
  updateInstances(1 / 60);
  assert.equal(objectiveDone(record), true, "the last one gone completes the objective");
  assert.equal(record.objective.met, true, "recorded on the instance");
  assert.equal(exitDenial(record), null, "the way out is open");
  assert.equal(W.caches.length, 0, "the locked container is gone");
  assert.match(state.hud.msg, /is open/, "and the pilot is told the cache opened");

  // The reward is ordinary crates: nothing enters a hold by itself.
  const held = countOf(state.profile.ship, "salv");
  assert.ok(W.crates.length > 0, "the cache spilled crates into the instance");
  assert.equal(countOf(state.profile.ship, "salv"), held, "the hold did not fill itself");
  for (const crate of W.crates) assert.equal(crate.kind, "crate", "each one is a collectable crate");

  const spill = W.crates.map(c => `${c.item}:${c.pos.x.toFixed(3)},${c.pos.z.toFixed(3)}`).sort().join("|");
  destroyInstance(record, "reset");

  // Two runs of one seed spill the same reward in the same place. Both empty the wave without a
  // fight, so what is left is the cache's own spill — a killed guardian drops its loot as well.
  const spillOf = () => {
    const p = withRifts(fresh());
    const r = insideRift(p, 31337);
    clearWave(r);
    const out = placeWorld(r.id).crates
      .map(c => `${c.item}:${c.pos.x.toFixed(3)},${c.pos.z.toFixed(3)}`).sort().join("|");
    destroyInstance(r, "reset");
    return out;
  };
  const first = spillOf();
  const second = spillOf();
  assert.ok(first.length > 0, "the cache spilled something");
  assert.equal(second, first, "the same seed spills the same reward, crate for crate and metre for metre");
  assert.ok(spill.length >= first.length, "and a fight leaves the guardians' own loot on top of it");
});

test("leaving puts the pilot back exactly where they entered, with everything they carry", () => {
  const player = withRifts(fresh());
  addItem(state.profile.ship, "ferrite", 5, state.profile);
  const record = insideRift(player, 55);
  clearWave(record);

  // Too far from the way out: it says where to go.
  player.pos.set(record.enterPos.x, record.enterPos.y, record.enterPos.z + RIFT.exitRange + 400);
  assert.match(leaveInstance(player), /Fly back to/, "the way out is a place, not a menu");
  assert.equal(instanceAt(player.place), record, "and the pilot is still inside");

  player.pos.copy(record.enterPos);
  updateInstances(1 / 60);
  assert.match(state.hud.prompt, /Press R to leave/, "the way out offers itself where R would work");
  assert.equal(riftAction(player), true, "R at the way out leaves the run");
  assert.equal(player.place, DEFAULT_PLACE, "back in the pocket the rift was opened from");
  assert.equal(state.place, DEFAULT_PLACE, "and the local alias follows");
  assert.deepEqual([player.pos.x, player.pos.y, player.pos.z], CLEAR, "at the exact spot they left");
  assert.equal(state.instances.size, 0, "the instance is gone");
  assert.equal(isInstancePlace(record.id), false, "unregistered as a place");
  assert.equal(state.places.has(record.id), false, "and its runtime container with it");
  assert.equal(placeWorld(DEFAULT_PLACE).rifts.length, 0, "the door collapsed on the way out: one use");
  assert.equal(countOf(state.profile.ship, "ferrite"), 5, "what they carried, they kept");
  assert.deepEqual(closures.map(c => c.reason), ["left"], "and the bus says why it closed");
});

test("a rift's clock runs from entry, warns, then kills: the run and the ship are both gone", () => {
  const player = withRifts(fresh());
  addItem(state.profile.ship, "salv", 4, state.profile);
  const record = insideRift(player, 2024);
  const template = INSTANCE_TEMPLATES[record.template];
  assert.equal(record.lifetime, template.lifetimeSec, "the clock is the template's, started on entry");

  updateInstances(template.lifetimeSec - RIFT.warnSec - 1);
  assert.equal(record.warned, false, "no warning while there is still time");
  updateInstances(2);
  assert.equal(record.warned, true, "the warning fires inside RIFT.warnSec of the end");
  assert.match(state.hud.msg, /collapses in/, "and says how long is left");
  assert.ok(record.lifetime > 0, "the instance is still alive");
  assert.equal(player.docked, false, "and so is the pilot");

  updateInstances(record.lifetime + 1);
  assert.equal(record.expired, true, "then it expired");
  assert.deepEqual(expiries.map(e => e.kind), ["kill"], "with its declared outcome");
  assert.equal(state.instances.size, 0, "the instance is gone");
  assert.equal(placeWorld(DEFAULT_PLACE).rifts.length, 0, "and so is the door");
  assert.equal(player.docked, true, "the ordinary death rules docked the pilot");
  assert.equal(player.place, DEFAULT_PLACE, "in the pocket they had opened it from");
  assert.equal(countOf(state.profile.ship, "salv"), 0, "the hold went with the ship");
  assert.equal(deaths.length, 1, "one death");
  assert.ok(deaths[0].startsWith(template.onExpire.message), "the notice starts with the template's own words");
  assert.match(deaths[0], /recovery fee/, "and carries the ordinary consequences");
  assert.equal(state.deathNotice, null, "the notice was consumed");
});

test("dying to a shot inside a rift despawns it at once and puts the pilot back where they entered", () => {
  const player = withRifts(fresh());
  const record = insideRift(player, 808);
  player.sh = 0;
  player.hull = 1;
  hurt(9999, player, state.profile);

  assert.equal(state.instances.size, 0, "the instance despawned with the pilot");
  assert.equal(placeWorld(DEFAULT_PLACE).rifts.length, 0, "and the door with it");
  assert.equal(player.place, DEFAULT_PLACE, "the pilot was put back in the pocket they entered from");
  assert.equal(player.docked, true, "and docked there by the ordinary death rules");
  assert.deepEqual(closures.map(c => c.reason), ["death"], "the bus says why it closed");
  assert.equal(deaths.length, 1, "one death, from the shot");
  assert.ok(!deaths[0].startsWith(INSTANCE_TEMPLATES[record.template].onExpire.message),
    "and it is not blamed on the clock");
});

test("a collapse expiry only takes the way in: the run stays and the pilot leaves whenever", () => {
  const player = withRifts(fresh());
  addItem(state.profile.ship, "cobalt", 3, state.profile);
  const record = insideRift(player, 606);
  // What a simple wormhole's instance will declare (slice 14c): a free exit and a collapse outcome.
  // The registries read the record, so this needs no code of its own.
  record.onExpire = { kind: "collapse", message: "The wormhole behind you has faded." };
  record.exit.requires = [];
  record.lifetime = 5;

  updateInstances(6);
  assert.deepEqual(expiries.map(e => e.kind), ["collapse"], "it expired with its declared outcome");
  assert.equal(record.collapsed, true, "the instance knows the way in is gone");
  assert.equal(record.doomOrigin, true, "and its outer pocket is doomed, which slice 14c reads");
  assert.equal(placeWorld(DEFAULT_PLACE).rifts.length, 0, "the door faded");
  assert.equal(instanceAt(player.place), record, "but the pilot is still inside, alive");
  assert.equal(player.docked, false, "nobody was forced out");
  assert.equal(deaths.length, 0, "and nobody died");
  assert.equal(state.profile.ships.includes(state.profile.ship), true, "the ship is still theirs");
  assert.match(state.hud.msg, /faded/, "and the template's own words were shown");

  player.pos.copy(record.enterPos);
  assert.equal(exitDenial(record), null, "the Stable wormhole way out never refuses");
  assert.equal(leaveInstance(player), true, "so they leave whenever they like");
  assert.equal(player.place, DEFAULT_PLACE, "back in a pocket with nothing there to fly through again");
  assert.equal(placeWorld(DEFAULT_PLACE).rifts.length, 0, "and still no door to go back in");
  assert.equal(countOf(state.profile.ship, "cobalt"), 3, "keeping everything they carried");
});

test("an unknown rule fails shut and says so, instead of trapping or freeing a pilot silently", () => {
  const player = withRifts(fresh());
  const record = insideRift(player, 1234);
  record.exit.requires = [{ type: "not-a-rule", message: "ignored" }];
  assert.match(exitDenial(record), /cannot be checked/, "an exit rule nobody wrote refuses plainly");
  assert.equal(leaveInstance(player), exitDenial(record), "and R does not leave");

  record.exit.requires = [];
  record.onExpire = { kind: "not-an-outcome", message: "" };
  record.lifetime = 1;
  updateInstances(2);
  assert.equal(state.instances.size, 0, "an outcome nobody wrote still puts the pilot out");
  assert.equal(player.place, DEFAULT_PLACE, "rather than leaving them in a dead place");
  assert.equal(player.docked, false, "and without killing them");

  assert.equal(createInstance("not-a-template", 1), null, "an unknown template makes nothing");
  assert.equal(openRift("not-a-rift", player), 'Nothing knows how to open "not-a-rift".', "nor an unknown rift kind");
});

test("a reset forgets every instance, and a dead instance id is no place at all", () => {
  const player = withRifts(fresh());
  const record = insideRift(player, 4711);
  const id = record.id;
  destroyInstance(record, "reset");
  assert.equal(isInstancePlace(id), false, "a destroyed instance is no place any more");
  assert.equal(placeAt(id).id, DEFAULT_PLACE, "and an unknown id falls back to the starting pocket");
  assert.equal(closures[closures.length - 1].reason, "reset", "with the reason on the bus");

  openRift("basic", player, 4712);
  assert.equal(placeWorld(DEFAULT_PLACE).rifts.length, 1, "a door hangs in the pocket");
  resetPlaces();
  assert.equal(state.instances.size, 0, "a reset forgets every instance");
  assert.equal(placeWorld(DEFAULT_PLACE).rifts.length, 0, "and every door with it");
});
