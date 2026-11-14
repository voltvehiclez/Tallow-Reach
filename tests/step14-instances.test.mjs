// Step 14a: rifts and instances — the door, the run, the locked cache, the clock and the way out.
//
// Everything asserted here is a rule the owner set on 2026-11-14 (docs/VISION.md, "Step 14"): the
// numbers live in data/instances.js, the behaviour in sim/instances.js, and nothing below reaches
// into render/, ui/ or core/.
import { test } from "node:test";
import assert from "node:assert/strict";
import { state, resetPlaces, placeWorld, instanceAt, captureResume, currentSave, applySave } from "../src/state/state.js";
import { newProfile, newWorld, sanitizeSave, SAVE_VERSION } from "../src/state/profile.js";
import {
  setPlaceCatalog, placeAt, placeDef, isPocket, isInstancePlace, pocketsIn, DEFAULT_PLACE,
} from "../src/data/places.js";
import {
  RIFT, RIFTS, INSTANCE_TEMPLATES, OBJECTIVE_KINDS, EXIT_REQUIREMENT_TYPES, EXPIRY_OUTCOME_TYPES,
  SKY_KINDS, instanceIdFor,
} from "../src/data/instances.js";
import { LOOT_TABLES } from "../src/data/loot.js";
import { ENEMIES, DEFAULT_ENEMY } from "../src/data/enemies.js";
import { FACTIONS } from "../src/data/factions.js";
import { missionFromContract } from "../src/data/missions/contracts.js";
import { acceptMission, activeMissions, missionProgress } from "../src/sim/missions.js";
import { generateGalaxy } from "../src/sim/galaxy.js";
import { createPlayer, hurt } from "../src/sim/player.js";
import { configurePlayer, resumeFromSave } from "../src/sim/session.js";
import { prepareGalaxySave } from "../src/sim/galaxy-session.js";
import { saveAutosave, loadAutosave } from "../src/state/storage.js";
import { enterPlace, loadPlace } from "../src/sim/places.js";
import { addItem, countOf, holdOf, discardItem } from "../src/sim/inventory.js";
import { SHIPS } from "../src/data/ships.js";
import { hitHostile } from "../src/sim/combat.js";
import { dropEnemy } from "../src/sim/enemy.js";
import { useItem, canUse, USE_ACTIONS } from "../src/sim/consumables.js";
import { toggleLock, lockName, lockPosition, pruneLock } from "../src/sim/targeting.js";
import {
  rollRiftTemplate, createInstance, riftClearance, openRift, enterRift, leaveInstance,
  destroyInstance, exitDenial, objectiveDone, updateInstances, nearestRift, riftAction,
  restoreInstances, populateInstances, openCache,
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
    // A run is harder than the map, and the numbers that say so are the ones the fight is made of:
    // the wave's own Hull HP and damage, times the run's scalars, are above the map's own hostile.
    // (The scalars used to do all the work, when a rift borrowed raiders and inflated them.)
    const guardian = ENEMIES[t.guardians?.enemy];
    assert.ok(guardian, `${id}: its guardian is a real enemy`);
    assert.ok(Number(t.difficulty?.hp) > 0 && Number(t.difficulty?.dmg) > 0, `${id}: its scalars are numbers`);
    assert.ok(guardian.hp * t.difficulty.hp > ENEMIES[DEFAULT_ENEMY].hp,
      `${id}: its wave outlasts the map's ${ENEMIES[DEFAULT_ENEMY].n}`);
    assert.ok(guardian.dmg * t.difficulty.dmg > ENEMIES[DEFAULT_ENEMY].dmg,
      `${id}: and each of them hits harder than one`);
    assert.ok(FACTIONS[guardian.f], `${id}: its guardians belong to a faction that exists`);
    assert.ok(Number(t.guardians.count) > 0, `${id}: it declares a wave`);
    const [lo, hi] = t.guardians.spawnDist;
    assert.ok(lo > 0 && hi >= lo, `${id}: its wave spawns at a real distance band`);
    assert.ok(OBJECTIVE_KINDS.includes(t.objective?.kind), `${id}: the objective kind is declared vocabulary`);
    assert.ok(typeof OBJECTIVES[t.objective.kind] === "function", `${id}: and sim/instances.js can check it`);
    assert.ok(t.objective.n, `${id}: an authored objective sentence for the HUD`);
    assert.ok(t.objective.done, `${id}: and an authored sentence for the moment it is met`);
    assert.ok(t.exit?.n, `${id}: the way out has a name the pilot is shown`);
    assert.ok(Array.isArray(t.exit?.pos) && t.exit.pos.length === 3,
      `${id}: the way out is an object somewhere in the world, not an abstract point`);
    assert.ok(Number(t.exit?.r) > 0, `${id}: and it is drawn at a declared size`);
    assert.ok(SKY_KINDS.includes(t.sky?.kind), `${id}: its sky is declared vocabulary`);
    for (const feature of t.features) {
      assert.notEqual(feature.kind, "planet", `${id}: a rift is not the space outside it, so no planet`);
    }
    for (const requirement of t.exit.requires) {
      assert.ok(EXIT_REQUIREMENT_TYPES.includes(requirement.type), `${id}: the exit rule is declared vocabulary`);
      assert.ok(typeof EXIT_REQUIREMENTS[requirement.type] === "function", `${id}: and has a handler`);
      assert.ok(requirement.message, `${id}: a sealed exit says why in its own words`);
    }
    assert.ok(EXPIRY_OUTCOME_TYPES.includes(t.onExpire?.kind), `${id}: the expiry outcome is declared vocabulary`);
    assert.ok(typeof EXPIRY_OUTCOMES[t.onExpire.kind] === "function", `${id}: and has a handler`);
    assert.ok(t.onExpire.message, `${id}: running out of time says so`);
    assert.ok(LOOT_TABLES[t.cache?.loot], `${id}: its cache names a real loot table`);
    assert.ok(Array.isArray(t.cache.pos) && t.cache.pos.length === 3, `${id}: its canister hangs somewhere`);
    assert.ok(Number(t.cache.r) > 0, `${id}: and is drawn at a declared size`);
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
      "each guardian's Hull HP is its own number, times the run's scalar");
    assert.equal(e.mx, e.hp, "and its maximum matches");
    assert.equal(e.encounter, null, "an instance's wave is no pocket encounter, so it writes no place memory");
    assert.ok(e.pos.distanceTo(player.pos) >= wave.spawnDist[0] - 1,
      `nothing spawns in the pilot's face (${Math.round(e.pos.distanceTo(player.pos))} m)`);
  }

  const caches = placeWorld(record.id).caches;
  assert.equal(caches.length, 1, "the prize canister is a physical thing in the world");
  assert.equal(caches[0].locked, true, "and it starts locked");
  assert.deepEqual([caches[0].pos.x, caches[0].pos.y, caches[0].pos.z],
    [...INSTANCE_TEMPLATES[record.template].cache.pos], "hanging where the template says");
  assert.equal(caches[0].r, INSTANCE_TEMPLATES[record.template].cache.r, "drawn at the size the data declares");

  // The way out is an object of its own, in plain sight from the moment the pilot arrives.
  const gates = placeWorld(record.id).gates;
  assert.equal(gates.length, 1, "the way out is a thing in the world, not an abstract point");
  assert.equal(gates[0], record.gate, "and the record knows which one is its own");
  assert.equal(gates[0].kind, "gate", "of its own kind");
  assert.equal(gates[0].locked, true, "locked while the objective stands");
  assert.equal(gates[0].n, record.exit.n, "named the way the pilot is told to name it");
  assert.deepEqual([gates[0].pos.x, gates[0].pos.y, gates[0].pos.z],
    [...INSTANCE_TEMPLATES[record.template].exit.pos], "hanging where the template says");
  assert.ok(player.pos.distanceTo(record.exitPos) <= RIFT.exitRange,
    "and the pilot arrives close enough to leave the moment it opens");

  assert.equal(objectiveDone(record), false, "the objective is not done yet");
  assert.ok(exitDenial(record), "so the way out is sealed");
  assert.equal(exitDenial(record), INSTANCE_TEMPLATES[record.template].exit.requires[0].message,
    "and it refuses in the template's own words");
  assert.equal(leaveInstance(player), exitDenial(record), "R again does not leave a sealed run");
  assert.equal(instanceAt(player.place), record, "the pilot is still inside");
  updateInstances(1 / 60);
  assert.equal(state.hud.prompt, exitDenial(record), "and at the gate the prompt says why it is shut");

  // Slice 14b: a run is part of the save, so the world names it and the resume point is the pilot's
  // own spot inside it. Logging out mid-rift comes back mid-rift (owner feedback 2026-11-14).
  const save = currentSave();
  assert.equal(save.world.place, record.id, "a save inside a rift names the run itself");
  assert.deepEqual(captureResume().pos.map(Math.round), player.pos.toArray().map(Math.round),
    "and the resume point is where the pilot is, not where they came from");
  const run = save.world.instances.find(r => r.id === record.id);
  assert.ok(run, "the run is in the save");
  assert.equal(run.template, record.template, "with the template it was rolled from");
  assert.equal(run.seed, record.seed, "and the seed that rolls it back the same");
  assert.equal(run.origin, DEFAULT_PLACE, "and the pocket it was entered from");
  assert.deepEqual(run.cache.stock, record.cache.stock, "the prize is saved exactly as it stands");
  assert.equal(run.cache.open, false, "still sealed, because the objective still stands");
  assert.equal(run.objectiveMet, false, "and the save says so in words the loader understands");
  assert.ok(Math.abs(run.lifetime - record.lifetime) < 1e-9, "down to the second of clock left");
  assert.deepEqual(run.entry.pos.map(Math.round), CLEAR.map(Math.round),
    "so leaving still puts the pilot back at the spot the door was opened from");
});

test("destroying the wave unlocks the canister, and R beside it moves the prize into the hold", () => {
  const player = withRifts(fresh());
  const record = insideRift(player, 31337);
  const W = placeWorld(record.id);
  const ship = state.profile.ship;

  for (const e of W.enemies.slice(1)) hitHostile(e, 9999, e.pos, player, record.id);
  updateInstances(1 / 60);
  assert.equal(objectiveDone(record), false, "one guardian left: the objective is not done");
  assert.ok(exitDenial(record), "and the way out is still sealed");
  assert.equal(W.caches.length, 1, "the canister is still hanging where the template put it");
  assert.equal(W.caches[0].locked, true, "and still locked");
  assert.equal(record.gate.locked, true, "as is the way out");

  // Beside a sealed canister, R says why and takes nothing.
  const stockBefore = record.cache.stock.map(s => `${s.i} ${s.c}`).join(", ");
  assert.ok(stockBefore, "the canister holds something from the moment the run is made");
  player.pos.copy(record.cache.pos);
  assert.equal(riftAction(player), false, "R on a sealed canister does not open it");
  assert.match(state.hud.msg, /still sealed/, "and says it is sealed");
  assert.match(state.hud.msg, /Destroy the rift guardians/, "with the objective that would unlock it");
  assert.equal(holdOf(ship, state.profile).salv || 0, 0, "nothing entered the hold");

  hitHostile(W.enemies[0], 9999, W.enemies[0].pos, player, record.id);
  const cratesFromTheFight = W.crates.length;
  updateInstances(1 / 60);
  assert.equal(objectiveDone(record), true, "the last one gone completes the objective");
  assert.equal(record.objective.met, true, "recorded on the instance");
  assert.equal(exitDenial(record), null, "the way out is open");
  assert.equal(record.gate.locked, false, "and the portal itself says so");
  assert.equal(W.caches.length, 1, "the canister is still there — the prize is not telegraphed into a hold");
  assert.equal(W.caches[0].locked, false, "but it is unlocked now");
  assert.ok(cratesFromTheFight > 0, "the guardians dropped their own loot, as they do anywhere");
  assert.equal(W.crates.length, cratesFromTheFight,
    "and unlocking the canister spilled nothing more: the prize stays inside it");
  assert.match(state.hud.msg, /unlocked/, "the pilot is told");
  assert.match(state.hud.msg, /press R/, "and how to collect it");

  // R beside it moves the whole prize aboard, one unit at a time, through the ordinary inventory rules.
  const wanted = record.cache.stock.map(s => [s.i, s.c]);
  assert.equal(riftAction(player), true, "R opens it");
  assert.match(state.hud.msg, /gives up/, "and says what came aboard");
  for (const [id, n] of wanted) assert.equal(countOf(ship, id), n, `${n} ${id} is in the hold`);
  assert.equal(W.caches.length, 0, "an empty canister is gone");
  assert.equal(record.cache.stock.length, 0, "and the record says it is empty");
});

test("a full hold takes what fits, the canister keeps the rest, and R again finishes the job", () => {
  const player = withRifts(fresh());
  const record = insideRift(player, 909);
  const ship = state.profile.ship;
  clearWave(record);
  player.pos.copy(record.cache.pos);

  const room = SHIPS[ship].cargo;
  const total = record.cache.stock.reduce((n, s) => n + s.c, 0);
  const stockOf = () => record.cache.stock.reduce((n, s) => n + s.c, 0);
  assert.ok(total > 3, "the prize is bigger than the room this test leaves");

  // Nothing fits at all: the canister is untouched and the pilot is told plainly.
  addItem(ship, "ferrite", room, state.profile);
  assert.equal(riftAction(player), false, "R with a full hold takes nothing");
  assert.match(state.hud.msg, /No room in the hold/, "and says so");
  assert.equal(stockOf(), total, "the canister is untouched");
  assert.equal(placeWorld(record.id).caches.length, 1, "and still hanging where it was");

  // Room for part of it: what fits comes aboard, one unit at a time, and the rest waits.
  discardItem(ship, "ferrite", 3, state.profile);
  assert.equal(riftAction(player), false, "R with room for only some of it does not finish the job");
  assert.match(state.hud.msg, /will not fit/, "and says how much is left inside");
  assert.match(state.hud.msg, /press R again/, "and what to do about it");
  const left = stockOf();
  assert.ok(left > 0 && left < total, "some came aboard and some did not");
  assert.equal(
    countOf(ship, "salv") + countOf(ship, "voidite") + countOf(ship, "core"), total - left,
    "and the hold holds exactly what was reported"
  );
  assert.equal(placeWorld(record.id).caches.length, 1, "the canister stays until it is empty");

  // Make room and the rest follows on the next press: a full hold never loses the prize.
  discardItem(ship, "ferrite", countOf(ship, "ferrite"), state.profile);
  assert.equal(riftAction(player), true, "R again takes the rest");
  assert.equal(stockOf(), 0, "the canister is empty");
  assert.equal(placeWorld(record.id).caches.length, 0, "and gone");
  assert.equal(countOf(ship, "salv") + countOf(ship, "voidite") + countOf(ship, "core"), total,
    "with the whole prize aboard, and not one unit more");
});

test("one seed is one prize: two runs of it hold exactly the same canister", () => {
  const stockOf = () => {
    const player = withRifts(fresh());
    const record = insideRift(player, 5150);
    const out = record.cache.stock.map(s => `${s.i}x${s.c}`).sort().join("|");
    destroyInstance(record, "reset");
    return out;
  };
  const first = stockOf();
  const second = stockOf();
  assert.ok(first.length > 0, "the canister holds something");
  assert.equal(second, first, "the same seed is the same reward, stack for stack");
});

test("leaving puts the pilot back exactly where they entered, with everything they carry", () => {
  const player = withRifts(fresh());
  addItem(state.profile.ship, "ferrite", 5, state.profile);
  const record = insideRift(player, 55);
  clearWave(record);

  // Too far from the way out: it says where to go.
  player.pos.set(record.exitPos.x, record.exitPos.y, record.exitPos.z + RIFT.exitRange + 400);
  assert.match(leaveInstance(player), /Fly back to/, "the way out is a place, not a menu");
  assert.equal(instanceAt(player.place), record, "and the pilot is still inside");

  player.pos.copy(record.exitPos);
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

test("F locks the door, the way out and the canister, and each label says what it is", () => {
  const player = withRifts(fresh());
  const rift = openRift("basic", player, 7);
  assert.equal(typeof rift, "object", `the door opens (${rift})`);

  // Face the door from 120 m out: F locks it the way it locks anything else in the world.
  player.pos.set(rift.pos.x, rift.pos.y, rift.pos.z + 120);
  player.quat.identity();
  state.hud.msg = "";
  toggleLock(player);
  assert.equal(player.flight.lock?.k, "r", "the door is a lockable object");
  assert.equal(player.flight.lock.o, rift, "and it is that door");
  assert.equal(lockName(player.flight.lock), rift.dest, "labelled with the run's own name, not an id");
  assert.deepEqual(lockPosition(player.flight.lock).toArray(), rift.pos.toArray(), "and the marker sits on it");

  toggleLock(player);
  assert.equal(player.flight.lock, null, "F again releases it");

  // Inside, the way out and the canister lock the same way, and their labels say whether they are open.
  const record = insideRift(player, 7);
  player.quat.identity();
  player.pos.set(record.exitPos.x, record.exitPos.y, record.exitPos.z + 120);
  toggleLock(player);
  assert.equal(player.flight.lock?.k, "g", "the way out is a lockable object");
  assert.equal(lockName(player.flight.lock), `${record.exit.n} (sealed)`, "and it says it is sealed");

  player.flight.lock = null;
  player.pos.set(record.cache.pos.x, record.cache.pos.y, record.cache.pos.z + 60);
  toggleLock(player);
  assert.equal(player.flight.lock?.k, "k", "the canister is a lockable object");
  assert.equal(lockName(player.flight.lock), `${record.cache.n} (locked)`, "and it says it is locked");

  clearWave(record);
  assert.equal(lockName(player.flight.lock), `${record.cache.n} (open)`,
    "the same lock reads open once the objective is done");
  assert.equal(player.flight.lock.o.locked, false, "because the record's own flag changed");

  // Opening it takes the canister away, and the lock goes with it rather than marking empty space.
  player.pos.copy(record.cache.pos);
  riftAction(player);
  pruneLock(player);
  assert.equal(player.flight.lock, null, "an emptied canister cannot stay locked");
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

  player.pos.copy(record.exitPos);
  assert.equal(exitDenial(record), null, "the Stable wormhole way out never refuses");
  assert.equal(leaveInstance(player), true, "so they leave whenever they like");
  assert.equal(player.place, DEFAULT_PLACE, "back in a pocket with nothing there to fly through again");
  assert.equal(placeWorld(DEFAULT_PLACE).rifts.length, 0, "and still no door to go back in");
  assert.equal(countOf(state.profile.ship, "cobalt"), 3, "keeping everything they carried");
});

test("an unknown rule fails shut and says so, instead of trapping or freeing a pilot silently", () => {
  const player = withRifts(fresh());
  const record = insideRift(player, 1234);
  player.pos.copy(record.exitPos);
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

/** The whole load path a browser takes: the save is flattened the way storage does, validated,
 *  installed, and the pilot is put back where the save says — run and all (slice 14b). */
function reload(save = currentSave()) {
  const clean = sanitizeSave(JSON.parse(JSON.stringify(save)));
  assert.equal(clean.v, SAVE_VERSION, "what comes back out of storage is the current version");
  applySave(clean);
  resumeFromSave();
  return clean;
}

test("logging out inside a rift comes back inside it: same run, clock, prize, wave and sealed way out", () => {
  const player = withRifts(fresh());
  const record = insideRift(player, 4242);
  const id = record.id;

  // Live in it a little first, so there is something a reload could lose.
  updateInstances(30);
  player.pos.set(140, -20, 90);
  player.quat.set(0, 0.3826834, 0, 0.9238795).normalize();
  const lifetime = record.lifetime;
  const stock = record.cache.stock.map(stack => ({ ...stack }));
  const guardians = placeWorld(id).enemies.map(e => e.pos.toArray().map(Math.round));
  const rocks = placeWorld(id).asteroids.length;
  const spot = player.pos.toArray();
  const facing = player.quat.toArray();

  reload();

  assert.equal(state.worldState.place, id, "the saved world still names the run");
  const back = instanceAt(id);
  assert.ok(back, "and the run is alive again");
  assert.equal(state.instances.size, 1, "exactly once: a reload rebuilds, it does not add");
  assert.equal(back.template, record.template, "the same template");
  assert.equal(back.seed, record.seed, "the same seed");
  assert.equal(back.origin, DEFAULT_PLACE, "still knowing the pocket it was entered from");
  assert.equal(back.lifetime, lifetime, "with the clock exactly where it was");
  assert.equal(back.totalLifetime, record.totalLifetime, "and the same lifetime it started with");
  assert.deepEqual(back.cache.stock, stock, "and the same prize, untouched");
  assert.equal(back.cache.open, false, "still sealed, because the objective still stands");
  assert.equal(back.objective.met, false, "the objective is not met by reloading");
  assert.equal(exitDenial(back), INSTANCE_TEMPLATES[back.template].exit.requires[0].message,
    "so the way out refuses in the same words");

  const P = state.player;
  assert.equal(P.place, id, "the pilot is inside it");
  assert.equal(P.docked, false, "flying, not docked");
  assert.deepEqual(P.pos.toArray(), spot, "at the spot they logged out");
  assert.deepEqual(P.quat.toArray().map(n => +n.toFixed(6)), facing.map(n => +n.toFixed(6)), "facing the same way");

  const W = placeWorld(id);
  assert.deepEqual(W.enemies.map(e => e.pos.toArray().map(Math.round)), guardians,
    "the same wave, in the same places, because the seed decides it");
  assert.equal(W.enemies.length, INSTANCE_TEMPLATES[back.template].guardians.count, "all of it");
  assert.equal(W.gates.length, 1, "the way out is an object in the world again");
  assert.equal(W.gates[0], back.gate, "and the record knows which one is its own");
  assert.equal(W.gates[0].locked, true, "locked, as it was");
  assert.equal(W.caches.length, 1, "the canister is hanging there again");
  assert.equal(W.caches[0].locked, true, "and locked");
  assert.equal(W.asteroids.length, rocks, "with the same field around it");
  assert.equal(isInstancePlace(id), true, "the run is a place again, so the loader and the scenery agree");
  assert.equal(placeAt(id).sky?.kind, INSTANCE_TEMPLATES[back.template].sky.kind, "with its own sky");
});

test("a run that was already finished comes back finished: the way out is open and the prize is not farmable twice", () => {
  const player = withRifts(fresh());
  const record = insideRift(player, 90210);
  const id = record.id;
  const ship = state.profile.ship;

  clearWave(record);
  assert.equal(record.objective.met, true, "the wave is gone, so the objective is met");
  const cacheName = record.cache.n;
  player.pos.copy(record.cache.pos);
  assert.equal(openCache(record, player), true, "and R beside the canister empties it into the hold");
  const taken = countOf(ship, "salv");
  assert.ok(taken > 0, "the prize is aboard");
  const lifetime = record.lifetime;

  reload();

  const back = instanceAt(id);
  assert.ok(back, "the run is still there");
  assert.equal(back.objective.met, true, "and it is still finished: reloading does not reset the objective");
  assert.equal(exitDenial(back), null, "so the way out is open");
  assert.equal(back.lifetime, lifetime, "with the clock where it was");
  const W = placeWorld(id);
  assert.equal(W.gates.length, 1, "the way out is there");
  assert.equal(W.gates[0].locked, false, "and unlocked");
  assert.equal(W.enemies.length, 0, "the wave does not come back");
  assert.equal(W.caches.length, 0, "an emptied canister is gone from the world for good");
  assert.equal(back.cache.stock.length, 0, "it is empty in the record too");
  assert.equal(openCache(back, state.player), `The ${cacheName} is empty.`, "so R cannot farm it a second time");
  assert.equal(countOf(ship, "salv"), taken, "and the hold still holds exactly what was taken");
  assert.deepEqual(state.player.pos.toArray().map(Math.round), record.cache.pos.toArray().map(Math.round),
    "the pilot comes back beside the canister they emptied, not at the arrival point");
  state.player.pos.copy(back.exitPos);
  assert.equal(leaveInstance(state.player), true, "and flying to the way out still leaves");
  assert.equal(state.player.place, DEFAULT_PLACE, "back to the pocket the door was opened from");
  assert.equal(state.worldState.place, DEFAULT_PLACE, "which is what the next save names");
  assert.equal(instanceAt(id), null, "the run is gone once it is left");
  assert.equal(isInstancePlace(id), false, "and so is its place");
});

test("a save from before runs existed still loads, and a run this build cannot rebuild sends the pilot home", () => {
  fresh();
  // v19 and older had no `instances` at all. That migrates to "no runs", and everything the save did
  // name — its pocket and the spot the pilot was flying at — survives untouched.
  const legacyWorld = { ...newWorld(), v: 19, resume: { pos: CLEAR, quat: [0, 0, 0, 1], sh: 12, en: 34 } };
  delete legacyWorld.instances;
  const legacy = sanitizeSave(JSON.parse(JSON.stringify({ v: 19, profile: newProfile(), world: legacyWorld })));
  assert.equal(legacy.v, SAVE_VERSION, "an old save is upgraded, never refused");
  assert.deepEqual(legacy.world.instances, [], "it simply has no runs");
  assert.equal(legacy.world.place, DEFAULT_PLACE, "and still names the pocket it named");
  assert.deepEqual(legacy.world.resume.pos, CLEAR, "and the spot the pilot was flying at");
  applySave(legacy);
  resumeFromSave();
  assert.equal(state.instances.size, 0, "so there is nothing to rebuild");
  assert.equal(state.player.place, DEFAULT_PLACE, "and the pilot is where the save said");

  // A run whose id this build would not produce — a template renamed, a seed edited, a hand-written
  // save — is dropped rather than trusted, and the pilot is not left standing in a place that is on
  // no map: they come home and dock.
  const ghost = sanitizeSave(JSON.parse(JSON.stringify({
    v: SAVE_VERSION,
    profile: newProfile(),
    world: {
      ...newWorld(),
      place: "rift-guardian_rift-zzz",
      resume: { pos: [10, 0, 10], quat: [0, 0, 0, 1], sh: 12, en: 34 },
      instances: [
        { id: "rift-guardian_rift-zzz", template: "guardian_rift", seed: 1, lifetime: 900, totalLifetime: 1200 },
        { id: instanceIdFor("not_a_template", 2), template: "not_a_template", seed: 2 },
      ],
    },
  })));
  assert.deepEqual(ghost.world.instances, [], "a run that cannot be rebuilt is not a run");
  assert.equal(ghost.world.place, DEFAULT_PLACE, "so the save no longer names a place that does not exist");
  applySave(ghost);
  resumeFromSave();
  assert.equal(state.instances.size, 0, "nothing came back");
  assert.equal(state.player.place, DEFAULT_PLACE, "and the pilot is home");
  assert.deepEqual(state.player.pos.toArray(), [10, 0, 10], "flying at the spot the save named");
  assert.equal(instanceAt(state.player.place), null, "in a pocket, not in a run that is not there");
});

/** A stand-in for the browser's localStorage, so a test can walk the real boot path. */
function mockStorage() {
  const mem = new Map();
  const prev = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: k => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: k => mem.delete(k),
  };
  return { mem, restore: () => { globalThis.localStorage = prev; } };
}

test("the boot path a browser takes comes back inside the run, with no pocket-recovery detour", () => {
  const player = withRifts(fresh());
  const record = insideRift(player, 6060);
  updateInstances(20);
  const lifetime = record.lifetime;
  const stock = record.cache.stock.map(stack => ({ ...stack }));

  const storage = mockStorage();
  try {
    saveAutosave(currentSave());     // what the 30-second timer, pagehide and the menu all do
    assert.ok(storage.mem.size > 0, "the autosave was written");

    // The browser comes back: boot reads that autosave through the galaxy adapter, which is the
    // path that used to see a run's place id as a pocket that had been removed and "recover" the
    // pilot home (owner bug report 2026-11-14).
    state.galaxyRecovery = null;
    const loaded = loadAutosave(prepareGalaxySave);
    assert.ok(loaded, "the autosave loads");
    assert.equal(state.galaxyRecovery, null, "a run is a place, not a pocket that went missing");
    assert.equal(loaded.world.place, record.id, "and the save still names the run");
    assert.ok(loaded.world.resume, "with the pilot's own spot inside it");

    applySave(loaded);
    resumeFromSave();
    const back = instanceAt(record.id);
    assert.ok(back, "so the run is alive again");
    assert.equal(state.player.place, record.id, "and the pilot is standing in it");
    assert.equal(back.lifetime, lifetime, "with the clock where it was");
    assert.deepEqual(back.cache.stock, stock, "and the same prize still inside");
    assert.equal(placeWorld(record.id).gates.length, 1, "the way out is there");
  } finally {
    storage.restore();
  }
});

test("a rift's wave is its own hostile, and no contract is paid by killing it", () => {
  const player = withRifts(fresh());

  // The owner's complaint as rules (2026-11-14): the target lock read "Newbie Raider" inside a rift,
  // and a hunt contract for raiders was paid by a run the contract never asked for.
  for (const [id, t] of Object.entries(INSTANCE_TEMPLATES)) {
    const def = ENEMIES[t.guardians.enemy];
    assert.notEqual(t.guardians.enemy, DEFAULT_ENEMY, `${id}: its wave is not the map's own hostile`);
    assert.equal(def.f, "rift", `${id}: it belongs to the rift, not to a faction the pilot can hail`);
    assert.match(def.n, /[Gg]uardian/, `${id}: the lock reads what it is ("${def.n}")`);
    assert.match(def.pl, /guardians/, `${id}: and contract wording would say "${def.pl}"`);
    assert.ok(LOOT_TABLES[def.loot], `${id}: it leaves its own drop behind`);
    assert.notEqual(def.col, ENEMIES[DEFAULT_ENEMY].col, `${id}: it is not wearing a raider's hull`);
  }

  // The fight the owner playtested, unchanged: a raider's 10 Hull HP and 1 damage a shot, times the
  // 1.6 / 1.5 and 2.2 / 2 the templates used to inflate them by, now authored on the guardians.
  const basic = INSTANCE_TEMPLATES.guardian_rift, deep = INSTANCE_TEMPLATES.deep_rift;
  assert.equal(Math.round(ENEMIES.riftguardian.hp * basic.difficulty.hp), 16, "a basic rift's guardian");
  assert.equal(ENEMIES.riftguardian.dmg * basic.difficulty.dmg, 1.5, "hits exactly as hard as before");
  assert.equal(Math.round(ENEMIES.deepguardian.hp * deep.difficulty.hp), 22, "and a deep rift's");
  assert.equal(ENEMIES.deepguardian.dmg * deep.difficulty.dmg, 2, "hits exactly as hard as before");

  const record = insideRift(player, 4242);
  const wave = placeWorld(record.id).enemies;
  assert.equal(wave.length, basic.guardians.count, "the declared wave is there");
  for (const e of wave) assert.equal(e.def, "riftguardian", "and every one of them is a guardian");

  // Locked up, the way the pilot sees it: the label is the hostile's own name.
  player.pos.copy(wave[0].pos).add(V(0, 0, 300));   // 300 m down-range of it, facing -Z as entry leaves the ship
  player.quat.identity();
  toggleLock(player);
  assert.equal(player.flight.lock?.k, "e", "the first guardian locks");
  assert.match(lockName(player.flight.lock), /^Rift Guardian \d+%$/,
    `the lock says "${lockName(player.flight.lock)}"`);
  pruneLock(player);

  // A hunt contract asks for the map's raiders. Killing this wave must not pay for it.
  acceptMission(missionFromContract({ type: "hunt", tier: 1, n: 4, r: 860, e: DEFAULT_ENEMY }),
    state.profile, DEFAULT_PLACE);
  assert.equal(activeMissions(state.profile).length, 1, "the contract is open");

  for (const e of [...placeWorld(record.id).enemies]) {
    let guard = 0;
    while (e.hp > 0 && guard++ < 200) hitHostile(e, 50, e.pos, player, record.id);
  }
  updateInstances(1 / 60);

  const [hunt] = activeMissions(state.profile);
  assert.equal(missionProgress(hunt).done, 0, "four guardians died and the raider contract did not move");
  assert.equal(record.objective.met, true, "while the run's own objective is met, as ever");
  assert.ok(state.hud.msg, "and the run said its own sentence about it");
});
