import { test } from "node:test";
import assert from "node:assert/strict";
import { state, applySave, currentSave } from "../src/state/state.js";
import {
  newSave,
  newProfile,
  portableProfile,
  mergeProfile,
} from "../src/state/profile.js";
import { encodeSave, decodeSave } from "../src/state/storage.js";
import { setSeed } from "../src/util/rng.js";
import { V } from "../src/util/math.js";
import { createPlayer, createPlayerRecord, hurt } from "../src/sim/player.js";
import { configurePlayer, launch, dock, tryDock } from "../src/sim/session.js";
import { setWeapon } from "../src/sim/weapons.js";
import { spawnEnemy } from "../src/sim/ai.js";
import { spawnCrate } from "../src/sim/combat.js";
import { fitModule, unequip } from "../src/sim/fitting.js";
import {
  buyItem,
  buyShip,
  selectShip,
  repairShip,
  restockMissiles,
  sellHold,
} from "../src/sim/economy.js";
import {
  ensureBoard,
  acceptContract,
  completeContract,
} from "../src/sim/contracts.js";
import { stepSim } from "../src/sim/step.js";
import { DEFAULT_PLACE } from "../src/data/places.js";
import { stationAt } from "../src/sim/places.js";

function resetArena() {
  setSeed(4242);
  applySave(newSave());
  state.shops = {};
  state.place = "reach";
  state.time = 0;
  state.warp = null;
  state.freeCam.on = false;
  state.aimDirection = { x: 0, y: 0, z: -1 };
  state.players.length = 0;
  state.localPlayerIndex = 0;
  for (const list of Object.values(state.world)) list.length = 0;

  const local = configurePlayer(createPlayer(), state.profile);
  const guestSave = newSave();
  guestSave.profile.cr = 5000;
  guestSave.world.store = { voidite: 77 };
  guestSave.world.base = { store: 4, hangar: 3, refinery: 3 };
  const guestProfile = portableProfile(guestSave);
  const guest = configurePlayer(createPlayerRecord(), guestProfile);
  state.players.push(guest);
  return { local, guest, guestProfile, guestSave };
}

test("9c (saves & profiles): non-local player requires its own profile and stamps hull damage only there", () => {
  const { local, guest, guestProfile } = resetArena();
  assert.throws(() => configurePlayer(createPlayerRecord(), null), /own profile/);
  assert.throws(() => configurePlayer(createPlayerRecord(), state.profile), /own profile/);

  local.docked = false;
  guest.docked = false;
  guest.sh = 0;
  hurt(4, guest);
  assert.equal(guest.hull, 6);
  assert.equal(guestProfile.hp.wasp, 0.6, "guest hull fraction saved on guest profile");
  assert.equal(state.profile.hp.wasp, 1, "local profile hull untouched");
});

test("9c (inventory & pickups): non-local mining credits guest hold, stops when full, and advances guest mine contract", () => {
  const { local, guest, guestProfile } = resetArena();
  local.docked = true;

  guestProfile.loadout.wasp.primary = ["beam_basic", null];
  guestProfile.pw = "beam";
  guestProfile.mission = { type: "mine", tier: 1, p: 0, n: 2, r: 400, o: "ferrite" };
  configurePlayer(guest, guestProfile);
  guest.docked = false;
  guest.pos.set(0, 0, 0);
  guest.quat.set(0, 0, 0, 1); // faces -Z
  guest.flight.spawnT = 1e9;
  guest.controls.fire = true;

  // Place a ferrite rock 40 m ahead of guest along -Z.
  state.world.asteroids.push({
    id: 901,
    kind: "rock",
    sector: "reach",
    shape: 0,
    pos: V(0, 0, -40),
    quat: guest.quat.clone(),
    s0: V(10, 10, 10),
    scale: V(10, 10, 10),
    r: 10,
    type: "ferrite",
    ore: 30,
    max: 30,
  });

  // 9 seconds at 60 Hz with a 4 s beam period yields 2 ferrite.
  for (let i = 0; i < 540; i++) stepSim(1 / 60);
  assert.equal(guestProfile.holds.wasp.ferrite, 2, "mined ore credited to guest hold");
  assert.equal(state.profile.holds.wasp.ferrite, undefined, "local hold untouched");
  assert.equal(guestProfile.mission.p, 2, "guest mine contract reached 2/2");

  // Fill guest hold to capacity (20 m³ on Wasp) and verify beam stops cutting rock.
  guestProfile.holds.wasp.ferrite = 20;
  const oreBefore = state.world.asteroids[0].ore;
  for (let i = 0; i < 300; i++) stepSim(1 / 60);
  assert.equal(state.world.asteroids[0].ore, oreBefore, "full guest hold does not waste rock ore");
});

test("9c (inventory & pickups): crate pickup works while local is docked and skips a full pilot to credit one with room", () => {
  const { local, guest, guestProfile } = resetArena();
  local.docked = true;
  guest.docked = false;
  guest.flight.spawnT = 1e9;
  guest.pos.set(100, 0, 0);
  guestProfile.mission = { type: "salvage", tier: 1, p: 0, n: 1, r: 500 };

  spawnCrate(V(105, 0, 0), "core");
  stepSim(1 / 60);

  assert.equal(state.world.crates.length, 0, "guest picked up crate while local was docked");
  assert.equal(guestProfile.holds.wasp.core, 1, "reactor core added to guest hold");
  assert.equal(guestProfile.mission.p, 1, "guest salvage contract progressed");
  assert.equal(state.profile.holds.wasp.core, undefined);

  // Now undock local at (300,0,0) with a FULL hold, put guest at (312,0,0) with room,
  // and spawn a crate at (305,0,0) within pickup range of both (outside station keep-out).
  local.docked = false;
  local.flight.spawnT = 1e9;
  local.pos.set(300, 0, 0);
  state.profile.holds.wasp.ferrite = 20; // local Wasp hold full
  guest.pos.set(312, 0, 0);

  spawnCrate(V(305, 0, 0), "salv");
  stepSim(1 / 60);
  assert.equal(state.world.crates.length, 0);
  assert.equal(guestProfile.holds.wasp.salv, 1, "pilot with free hold room collected the crate");
});

test("9c (economy, outfitting & saved ammo): guest purchases, fits, repairs, weapon switches and missile shots stay on guest profile", () => {
  const { guest, guestProfile, guestSave } = resetArena();
  state.profile.cr = 600;
  state.profile.msl = 0;

  // Buy a missile pod as guest: charges guest credits, stores pod in hosted station,
  // and loads 8 starter missiles into guest's saved profile.
  const msgBuy = buyItem(stationAt(DEFAULT_PLACE).shop, "missile_basic", 1, guest, guestProfile);
  assert.match(msgBuy, /8 missiles included/);
  assert.equal(guestProfile.cr, 3500);
  assert.equal(guestProfile.msl, 8);
  assert.equal(state.profile.cr, 600, "host credits untouched");
  assert.equal(state.profile.msl, 0, "host missiles untouched");

  // Fit the pod onto guest's ship, switch weapon slot, and fire a missile in space.
  assert.match(fitModule("secondary", 0, "missile_basic", guest, guestProfile), /Fitted/);
  assert.deepEqual(guestProfile.loadout.wasp.secondary, ["missile_basic"]);
  assert.deepEqual(state.profile.loadout.wasp.secondary, [null], "host loadout untouched");

  setWeapon("beam", guest);
  assert.equal(guestProfile.pw, "beam");
  assert.equal(state.profile.pw, "cannon");

  guest.docked = false;
  guest.pos.set(0, 0, -400);
  guest.flight.spawnT = 1e9;
  guest.controls.sec = true;
  stepSim(1 / 60);
  guest.controls.sec = false;
  assert.equal(guestProfile.msl, 7, "fired missile decremented in guest's saved profile");
  assert.equal(guest.missileStock, 7);

  // Restock missiles to full 12-missile capacity, buy & select Prospector, damage & repair it, sell cargo, then merge back.
  assert.match(restockMissiles(guest, guestProfile), /Restocked 5/);
  assert.equal(guestProfile.msl, 12);

  state.worldState.base.hangar = 2;
  guestProfile.cr = 10000;
  buyShip("prospector", guestProfile);
  selectShip("prospector", guest, guestProfile);
  assert.equal(guest.ship, "prospector");
  assert.equal(state.profile.ship, "wasp", "host ship untouched");

  guest.sh = 0;
  hurt(5, guest, guestProfile);
  assert.ok(guestProfile.hp.prospector < 1);
  assert.match(repairShip("prospector", guest, guestProfile), /repaired/);
  assert.equal(guestProfile.hp.prospector, 1);
  assert.equal(guest.hull, guest.hullMax);

  guestProfile.holds.prospector.cobalt = 4;
  assert.match(sellHold(guestProfile), /Sold 4 items/);

  assert.match(unequip("primary", 0, guest, guestProfile), /moved to storage/);
  assert.throws(() => fitModule("primary", 0, "cannon_basic", guest, state.profile), /own profile/);

  // Returning home merges guestProfile into guestSave without touching guestSave's own station!
  const returnedSave = mergeProfile(guestSave, guestProfile);
  assert.equal(returnedSave.profile.ship, "prospector");
  assert.equal(returnedSave.profile.msl, 12);
  assert.deepEqual(returnedSave.world.store, { voidite: 77 }, "guest's home station storage preserved");
  assert.deepEqual(returnedSave.world.base, { store: 4, hangar: 3, refinery: 3 });
});

test("9c (contracts, kills & AI spawner): bullet/missile kills, board persistence and enemy spawns work per active pilot", () => {
  const { local, guest, guestProfile } = resetArena();

  // Offer board lives in world.board and survives save encode/decode.
  ensureBoard();
  assert.equal(state.worldState.board.length, 4);
  const boardCopy = structuredClone(state.worldState.board);
  const roundTripped = decodeSave(encodeSave(currentSave()));
  assert.deepEqual(roundTripped.world.board, boardCopy, "world.board persists in v13 saves");

  // Guest accepts an offer from the host's board; board rerolls and host mission stays null.
  acceptContract(0, guestProfile);
  assert.ok(guestProfile.mission);
  assert.equal(state.profile.mission, null);

  // Give guest a 2-kill hunt contract, cannon + launcher, and keep local docked!
  guestProfile.mission = { type: "hunt", tier: 1, p: 0, n: 2, r: 650, e: "raider" };
  guestProfile.msl = 4;
  guestProfile.loadout.wasp.secondary = ["missile_basic"];
  configurePlayer(guest, guestProfile);

  local.docked = true;
  guest.docked = false;
  guest.pos.set(0, 0, -900); // > 600 m from station so hunt spawner is active
  guest.quat.set(0, 0, 0, 1);

  // Trigger spawner while local is docked: guest's hunt contract spawns raiders!
  guest.flight.spawnT = 0.01;
  stepSim(1 / 60);
  assert.ok(state.world.enemies.length >= 1, "spawner spawned hunt targets for undocked guest while host was docked");

  // Clear random spawns and test deterministic cannon kill + missile kill by guest.
  state.world.enemies.length = 0;
  guest.flight.spawnT = 1e9;

  const e1 = spawnEnemy("raider", { x: 0, y: 0, z: -925 });
  e1.hp = 1;
  guest.controls.fire = true;
  for (let i = 0; i < 15 && state.world.enemies.includes(e1); i++) stepSim(1 / 60);
  guest.controls.fire = false;
  assert.equal(state.world.enemies.includes(e1), false, "guest cannon killed first raider");
  assert.equal(guestProfile.kills, 1);
  assert.equal(guestProfile.mission.p, 1);
  assert.equal(state.profile.kills, 0, "host kills untouched");

  state.world.bullets.length = 0;
  const e2 = spawnEnemy("raider", { x: 0, y: 0, z: -930 });
  e2.hp = 5;
  guest.flight.missileCd = 0;
  guest.flight.missileLock = { target: e2, t: 99, locked: true };
  guest.controls.sec = true;
  stepSim(1 / 60);
  guest.controls.sec = false;
  for (let i = 0; i < 30 && state.world.enemies.includes(e2); i++) stepSim(1 / 60);
  assert.equal(state.world.enemies.includes(e2), false, "guest missile killed second raider");
  assert.equal(guestProfile.kills, 2);
  assert.equal(guestProfile.mission.p, 2);
  assert.equal(state.profile.kills, 0);

  const crBefore = guestProfile.cr;
  assert.equal(completeContract(guestProfile), "Paid 650 cr.");
  assert.equal(guestProfile.cr, crBefore + 650);
  assert.equal(guestProfile.done, 1);
});

test("9c (docking & launch): one pilot docking does not clear another active pilot's fight; last pilot docking sweeps the field", () => {
  const { local, guest, guestProfile } = resetArena();

  guestProfile.mission = { type: "salvage", tier: 1, p: 0, n: 2, r: 450 };
  launch(local);
  launch(guest, guestProfile);
  assert.equal(local.docked, false);
  assert.equal(guest.docked, false);
  assert.equal(state.world.crates.length, 2, "guest salvage contract spawned its crates on launch");

  const raider = spawnEnemy("raider", { x: 0, y: 0, z: -800 });
  guest.sh = 3;
  guest.hull = 7;

  // Host docks while guest is still out fighting: raider must survive!
  dock(local);
  assert.equal(local.docked, true);
  assert.equal(state.world.enemies.includes(raider), true, "active guest's hostile was NOT cleared when host docked");

  // Guest flies into docking range slowly and calls tryDock: last pilot docking clears hostiles!
  guest.pos.set(0, 0, 150);
  guest.v.set(0, 0, 10);
  assert.equal(tryDock(guest, guestProfile), true);
  assert.equal(guest.docked, true);
  assert.equal(guest.sh, guest.shMax, "guest shields recharged on dock");
  assert.equal(guestProfile.hp.wasp, 0.7, "guest hull fraction recorded on dock");
  assert.equal(state.world.enemies.length, 0, "transient enemies cleared once last active pilot docked");
});
