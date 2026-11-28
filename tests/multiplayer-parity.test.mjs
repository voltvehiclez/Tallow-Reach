// Comprehensive parity & regression tests for guest vs single-player/host parity:
//   - F-lock / N-list / pilot & docked missile-lock parity
//   - Route jump (J), galaxy/uncharted/wormhole/shop sync & home restoration
//   - Rifts, multi-pilot instances, shared caches (CACHE), & expiry/death extraction
//   - Entity stream rifts/gates/caches, power.draw reset, HUD prompt, cargo/cache confirmations
//   - Full real-src/main.js two-VM end-to-end verification

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  state, localPlayer, applySave, newRootSave, resetPlaces, placeWorld,
  instanceAt, clearInstances, clearWormholes,
} from "../src/state/state.js";
import { on, emit } from "../src/util/events.js";
import { V, Q } from "../src/util/math.js";
import { resetGuests, arriveGuest, leaveGuest, guestRecordOf } from "../src/sim/multiplayer.js";
import { runGuestAction } from "../src/sim/guest-actions.js";
import { otherPilotsThere, targetHealth, selectPocketObject, lockName } from "../src/sim/targeting.js";
import { jumpRoute } from "../src/sim/navigation.js";
import { stepSim } from "../src/sim/step.js";
import { updateMissiles, refreshGuns } from "../src/sim/weapons.js";
import { updateMissileFlight } from "../src/sim/missile.js";
import { addEntity } from "../src/sim/entity.js";
import { purgeNonNetEntities } from "../src/sim/world.js";
import { createPlayer } from "../src/sim/player.js";
import { configurePlayer } from "../src/sim/session.js";
import { prepareGalaxySave, syncGuestGalaxy, switchGameMode } from "../src/sim/galaxy-session.js";
import {
  createInstance, enterRift, leaveInstance, riftActionResult,
  openCacheTrade, closeCacheTrade, syncGuestInstance, destroyInstance,
} from "../src/sim/instances.js";
import { spawnWormhole, doomWormhole, updateWormholes, syncGuestWormholes } from "../src/sim/wormholes.js";
import { CACHE, countOf } from "../src/sim/inventory.js";
import { cleanMessage, readMessage } from "../src/net/protocol.js";
import { createEntityStream, hasNetEntities, syncPocketEntities } from "../src/render/entitystream.js";
import { setChannelFactory, createChannelForTest } from "../src/net/session.js";
import { tickConnections } from "../src/sim/uncharted.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = rel => readFileSync(path.join(ROOT, rel), "utf8");

function resetAll() {
  resetGuests();
  clearInstances();
  clearWormholes();
  resetPlaces();
  state.players.length = 0;
  state.localPlayerIndex = 0;
  applySave(prepareGalaxySave(newRootSave()));
  switchGameMode("open");
  const P = configurePlayer(createPlayer(), state.profile);
  P.place = "reach";
  state.place = "reach";
  P.docked = false;
  P.dead = false;
  P.warp = null;
  P.pos.set(0, 0, 0);
  P.v.set(0, 0, 0);
  P.flight.lock = null;
  P.flight.missileLock = { target: null, t: 0, locked: false };
  state.otherPilots = [];
  state.away = false;
  state.paused = false;
  return P;
}

test("targeting & missile parity: otherPilotsThere resolves live host guests, targetHealth reads hullMax, docked pilots cannot be missile-locked", () => {
  const host = resetAll();
  host.place = "reach";
  host.hull = 60;
  host.hullMax = 100;
  host.sh = 25;
  host.shMax = 50;

  const guest = arriveGuest({
    guestId: "g-lock",
    name: "Guest Wingmate",
    profile: { name: "Guest Wingmate", cr: 100, ship: "wasp", ships: ["wasp"], hp: { wasp: 1 }, holds: { wasp: {} }, loadout: {} },
  });
  guest.docked = false;
  guest.place = "reach";
  guest.pos.set(0, 0, -250);
  guest.hull = 45;
  guest.hullMax = 90;
  guest.sh = 20;
  guest.shMax = 40;

  state.otherPilots = [{ k: "p", id: "fake-local-mirror", place: "reach", pos: V(0, 0, -100), dead: false }];
  assert.deepEqual(otherPilotsThere(host).map(p => p.id), ["fake-local-mirror"]);
  const seenByGuest = otherPilotsThere(guest);
  assert.equal(seenByGuest.length, 1);
  assert.equal(seenByGuest[0], host);
  assert.deepEqual(targetHealth(host), { shield: 50, hull: 60 });
  assert.equal(lockName({ k: "p", o: host }), host.profile.name || "Pilot");

  // Give guest a launcher and aim straight at host, then dock host: missile lock must NOT acquire/keep a docked pilot.
  guest.profile.loadout = guest.profile.loadout || {};
  guest.profile.loadout.wasp = { ...(guest.profile.loadout.wasp || {}), primary: ["cannon_basic"], secondary: ["missile_basic"] };
  guest.profile.sw = "1";
  guest.profile.msl = 4;
  guest.secondaryWeapon = "1";
  refreshGuns(guest, guest.profile);
  guest.missileStock = 4;
  guest.pos.set(0, 0, 0);
  host.pos.set(0, 0, -250);
  guest.aimDirection = { x: 0, y: 0, z: -1 };
  guest.quat.set(0, 0, 0, 1);
  host.docked = false;
  guest.flight.lock = { k: "p", o: host };
  updateMissiles(0.5, guest, false);
  assert.equal(guest.flight.missileLock.target, host);

  host.docked = true;
  updateMissiles(0.5, guest, false);
  assert.equal(guest.flight.missileLock.target, null);

  // In-flight missile also breaks lock when its pilot target docks.
  host.docked = false;
  const W = placeWorld("reach");
  W.missiles.push({ id: 99, pos: V(0, 0, -100), quat: Q(), d: V(0, 0, -1), sp: 300, l: 5, dmg: 10, t: host, owner: guest });
  host.docked = true;
  updateMissileFlight(0.05, "reach");
  assert.equal(W.missiles.find(m => m.id === 99)?.t, null);
});

test("runGuestAction lock op resolves enemy, rock, crate, rift, gate, cache, pilot, station, and clear on host", () => {
  const host = resetAll();
  host.place = "reach";
  const guest = arriveGuest({
    guestId: "g-act-lock",
    name: "Lock Pilot",
    profile: { name: "Lock Pilot", cr: 100, ship: "wasp", ships: ["wasp"], hp: { wasp: 1 }, holds: { wasp: {} }, loadout: {} },
  });
  guest.docked = false;
  guest.place = "reach";

  const W = placeWorld("reach");
  const enemy = { id: 101, kind: "enemy", hp: 50, mx: 50, pos: V(10, 0, -100) };
  W.enemies.push(enemy);
  const rock = addEntity(W.asteroids, { kind: "rock", place: "reach", pos: V(20, 0, -100) });
  const crate = addEntity(W.crates, { kind: "crate", place: "reach", item: "salv", pos: V(30, 0, -100) });
  const rift = addEntity(W.rifts, { kind: "rift", place: "reach", n: "Test Rift", pos: V(40, 0, -100) });
  const gate = addEntity(W.gates, { kind: "gate", place: "reach", n: "Test Gate", pos: V(50, 0, -100) });
  const cache = addEntity(W.caches, { kind: "cache", place: "reach", n: "Test Cache", pos: V(60, 0, -100) });

  assert.equal(runGuestAction(guest, { op: "lock", kind: "enemy", id: String(enemy.id) }).ok, true);
  assert.equal(guest.flight.lock?.k, "e");
  assert.equal(guest.flight.lock?.o, enemy);

  assert.equal(runGuestAction(guest, { op: "lock", kind: "rock", id: String(rock.id) }).ok, true);
  assert.equal(guest.flight.lock?.k, "a");

  assert.equal(runGuestAction(guest, { op: "lock", kind: "crate", id: String(crate.id) }).ok, true);
  assert.equal(guest.flight.lock?.k, "c");

  assert.equal(runGuestAction(guest, { op: "lock", kind: "rift", id: String(rift.id) }).ok, true);
  assert.equal(guest.flight.lock?.k, "r");

  assert.equal(runGuestAction(guest, { op: "lock", kind: "gate", id: String(gate.id) }).ok, true);
  assert.equal(guest.flight.lock?.k, "g");

  assert.equal(runGuestAction(guest, { op: "lock", kind: "cache", id: String(cache.id) }).ok, true);
  assert.equal(guest.flight.lock?.k, "k");

  assert.equal(runGuestAction(guest, { op: "lock", kind: "pilot", id: "host" }).ok, true);
  assert.equal(guest.flight.lock?.k, "p");
  assert.equal(guest.flight.lock?.o, host);

  assert.equal(runGuestAction(guest, { op: "lock", kind: "station", id: "meridian" }).ok, true);
  assert.equal(guest.flight.lock?.k, "s");

  assert.equal(runGuestAction(guest, { op: "lock", kind: "clear" }).ok, true);
  assert.equal(guest.flight.lock, null);
});

test("multiplayer instances & caches: multi-pilot leave/death isolation, CACHE actions, wormhole occupancy & uncharted cleanup", () => {
  const host = resetAll();
  host.place = "reach";
  const guest = arriveGuest({
    guestId: "g-rift",
    name: "Rift Guest",
    profile: { name: "Rift Guest", cr: 500, ship: "wasp", ships: ["wasp"], hp: { wasp: 1 }, holds: { wasp: {} }, loadout: {} },
  });
  guest.docked = false;
  guest.place = "reach";
  guest.pos.set(0, 0, -400);

  const W = placeWorld("reach");
  host.pos.set(0, 0, -400);
  const rift = addEntity(W.rifts, {
    kind: "rift", place: "reach", n: "Fracture", template: "guardian_rift", seed: 12345,
    pos: V(0, 0, -400), quat: Q(), spin: 0.35, r: 26, gone: false,
  });

  // Host enters, then guest enters via `op: "rift"`.
  assert.equal(enterRift(rift, host), true);
  const instId = host.place;
  const rec = instanceAt(instId);
  assert.ok(rec);
  assert.equal(runGuestAction(guest, { op: "rift" }).ok, true);
  assert.equal(guest.place, instId);
  assert.ok(rec.entries.has("host"));
  assert.ok(rec.entries.has("g-rift"));

  // Force objective met & cache unlocked for test.
  rec.objective.met = true;
  rec.cache.open = true;
  rec.cache.stock = { ferrite: 3 };
  rec.cache.slots = null;
  if (rec.cache.entity) rec.cache.entity.locked = false;
  if (rec.gate) rec.gate.locked = false;

  // Guest flies near cache and presses R -> opens cache without opening host's UI.
  let hostSawCacheEvent = false;
  let watchCacheOpen = true;
  on("instance-cache-open", payload => {
    if (watchCacheOpen && (!payload?.player || payload.player === host)) hostSawCacheEvent = true;
  });
  guest.pos.copy(rec.cache.pos);
  const openRes = riftActionResult(guest);
  watchCacheOpen = false;
  assert.equal(openRes.ok, true);
  assert.equal(openRes.openedCache, true);
  assert.equal(guest.openCacheId, instId);
  assert.equal(hostSawCacheEvent, false);

  // Guest takes 1 unit via invTake + places into hold via invClick, stows 1 unit back via invMove, verifies cacheClose, then shift-takes all remaining items!
  const takeOne = runGuestAction(guest, { op: "invTake", where: CACHE, slot: 0, n: 1 });
  assert.equal(takeOne.ok, true);
  assert.equal(runGuestAction(guest, { op: "invClick", where: "wasp", slot: 0 }).ok, true);
  assert.equal(countOf("wasp", "ferrite", guest.profile, guest.guestWorld), 1);
  assert.equal(runGuestAction(guest, { op: "invMove", where: "wasp", toWhere: CACHE, id: "ferrite", n: 1 }).ok, true);
  assert.equal(countOf("wasp", "ferrite", guest.profile, guest.guestWorld), 0);
  assert.equal(runGuestAction(guest, { op: "cacheClose" }).ok, true);
  assert.equal(guest.openCacheId, null);

  assert.equal(runGuestAction(guest, { op: "rift" }).ok, true);
  assert.equal(guest.openCacheId, instId);
  const shiftMove = runGuestAction(guest, { op: "invClick", where: CACHE, slot: 0, toWhere: "wasp", shift: true });
  assert.equal(shiftMove.ok, true);
  assert.equal(countOf("wasp", "ferrite", guest.profile, guest.guestWorld), 3);
  assert.equal(guest.openCacheId, null); // emptied cache clears openCacheId!

  // Guest dies while host is still inside: only guest is extracted; instance stays alive for host!
  emit("dying", { player: guest });
  assert.equal(guest.place, "reach");
  assert.equal(instanceAt(instId), rec);
  assert.equal(rec.gone, false);

  // Host leaves alone: once guardians are cleared, the non-reentrant instance destroys cleanly.
  placeWorld(instId).enemies.length = 0;
  host.pos.copy(rec.exitPos);
  assert.equal(leaveInstance(host), true);
  assert.equal(host.place, "reach");
  assert.equal(instanceAt(instId), null);

  // Wormhole occupancy & uncharted pocketsById cleanup check.
  const wh = spawnWormhole({ parent: state.galaxy.systems[0].id, seed: 777777 });
  assert.ok(wh);
  guest.place = wh.id;
  doomWormhole(wh, { quiet: true });
  assert.ok(state.wormholes.has(wh.id), "doomed wormhole remains while a guest occupies its pocket");
  guest.place = "reach";
  updateWormholes(0.1);
  assert.equal(state.wormholes.has(wh.id), false, "doomed wormhole clears once all pilots leave");

  if (state.galaxy?.liveConnectionEnds?.[0]?.[0]) {
    const connId = state.galaxy.liveConnectionEnds[0][0].id;
    state.worldState.connections[0].lifetime = 0.01;
    tickConnections(0.05);
    assert.equal(state.galaxy.pocketsById[connId], undefined, "tickConnections deletes expired pocketsById entry");
  }
});

test("protocol, entitystream, world purge, navigation warpFn & guest stepSim prompt parity", () => {
  const host = resetAll();
  state.away = true;
  state.hud.prompt = "Press R to enter Rift";
  stepSim(1 / 60);
  assert.equal(state.hud.prompt, "Press R to enter Rift", "guest stepSim must not wipe HUD prompt");
  state.away = false;

  // Custom warpFn in jumpRoute.
  state.ui.destination = { pocketId: "hollow" };
  const picked = [];
  const okJump = jumpRoute(host, (_p, to) => { picked.push(to); return true; });
  assert.equal(okJump, true);
  assert.equal(picked.length, 1);

  // Protocol + entitystream + purgeNonNetEntities for rifts/gates/caches.
  const cleanEnt = cleanMessage("entities", {
    place: "reach",
    rifts: [{ id: 1, pos: [1, 2, 3], quat: [0, 0, 0, 1], n: "R", dest: "Vault", variant: "simple", reentrant: true }],
    gates: [{ id: 2, pos: [4, 5, 6], quat: [0, 0, 0, 1], n: "Exit", locked: true }],
    caches: [{ id: 3, pos: [7, 8, 9], quat: [0, 0, 0, 1], n: "Prize", locked: false, loot: "salvage" }],
  });
  assert.equal(cleanEnt.rifts.length, 1);
  assert.equal(cleanEnt.rifts[0].variant, "simple");
  assert.equal(cleanEnt.rifts[0].reentrant, true);
  assert.equal(cleanEnt.gates[0].locked, true);
  assert.equal(cleanEnt.caches[0].locked, false);

  const W = placeWorld("reach");
  addEntity(W.rifts, { id: 901, kind: "rift", pos: V(0, 0, 0) });
  addEntity(W.gates, { id: 902, kind: "gate", pos: V(0, 0, 0) });
  addEntity(W.caches, { id: 903, kind: "cache", pos: V(0, 0, 0) });
  const stream = createEntityStream({ delayMs: 0 });
  stream.receive(cleanEnt, 1000);
  const snap = stream.samplePlace("reach", 1000);
  syncPocketEntities(W, snap, "reach");
  assert.equal(hasNetEntities(W), true);
  assert.equal(W.rifts.length, 1);
  assert.equal(W.rifts[0]._net, true);
  assert.equal(W.gates.length, 1);
  assert.equal(W.caches.length, 1);
  purgeNonNetEntities("reach");
  assert.equal(W.rifts.length, 1);

  // Clean visit message carries galaxy/shops/wormholes/connections/instance.
  const cleanV = readMessage({
    t: "visit",
    profile: { name: "A", cr: 10, ship: "wasp", ships: ["wasp"], hp: { wasp: 1 }, holds: { wasp: {} }, loadout: {} },
    world: { place: "reach", base: { store: 1, dock: 1, refinery: 1, market: 1 } },
    galaxy: { seed: 42, knowledge: { sol: { discovered: true, visited: true } } },
    shops: { "meridian:cannon_basic": 4 },
    wormholes: [{ id: "wh-1", parent: "sol", template: "wh_smugglers", seed: 99, tier: 1, lifetime: 500, totalLifetime: 1200, doomed: false }],
    connections: [{ epoch: 2, lifetime: 900 }],
    instance: {
      id: "inst-abc", template: "rift_pirate", seed: 123, tier: 1, origin: "reach",
      lifetime: 600, totalLifetime: 1200, warned: false, expired: false, mined: 0, spawned: true, objectiveMet: true,
      cache: { n: "Cache", loot: "salv", open: true, tradeOpen: true, stock: { ferr: 2 }, slots: [["ferr", 2]] },
    },
  });
  assert.equal(cleanV.galaxy.seed, 42);
  assert.equal(cleanV.shops["meridian:cannon_basic"], 4);
  assert.equal(cleanV.wormholes[0].id, "wh-1");
  assert.equal(cleanV.connections[0].epoch, 2);
  assert.equal(cleanV.instance.cache.tradeOpen, true);
});

test("session visitPrintOf excludes continuous lifetime jitter across idle frames while tracking structural changes", () => {
  const sessSrc = read("src/net/session.js");
  assert.match(sessSrc, /lifetimeBucket:\s*w\.doomed\s*\?\s*0\s*:\s*\(\(w\.lifetime\s*\|\|\s*0\)\s*>\s*60\s*\?\s*1\s*:\s*Math\.max\(0,\s*Math\.ceil\(w\.lifetime\s*\|\|\s*0\)\)\)/);
  assert.match(sessSrc, /lifetimeBucket:\s*snap\.instance\.warned\s*\n\s*\?\s*Math\.max\(0,\s*Math\.ceil\(snap\.instance\.lifetime\s*\|\|\s*0\)\)\s*\n\s*:\s*\(\(snap\.instance\.lifetime\s*\|\|\s*0\)\s*>\s*0\s*\?\s*1\s*:\s*0\)/);
  assert.match(sessSrc, /connections:\s*Array\.isArray\(snap\.connections\)\s*\?\s*snap\.connections\.map\(c\s*=>\s*\(\{\s*\n\s*epoch:\s*c\.epoch\s*\|\|\s*0,\s*\n\s*live:\s*\(c\.lifetime\s*\|\|\s*0\)\s*>\s*0,\s*\n\s*\}\)\)\s*:\s*null/);
  assert.ok(setChannelFactory && createChannelForTest);
});

test("real src/main.js two-VM end-to-end parity: J-route warp, F-lock sync, R rift/cache/exit, power.draw=0 & Go home", async () => {
  const esbuild = await import("esbuild");
  const vm = await import("node:vm");
  const shell = read("src/index.html");
  const bundle = await esbuild.build({
    stdin: {
      contents: `
        import "./src/main.js";
        import * as stateMod from "./src/state/state.js";
        import * as netSession from "./src/net/session.js";
        import * as mpUi from "./src/ui/multiplayer.js";
        import * as menuUi from "./src/ui/menu.js";
        import * as eventsMod from "./src/util/events.js";
        import * as cacheUi from "./src/ui/cache.js";
        import * as cargoUi from "./src/ui/cargo.js";
        import * as invMod from "./src/sim/inventory.js";
        import * as entityMod from "./src/sim/entity.js";
        import * as destMod from "./src/state/destination.js";
        globalThis.__APP = { stateMod, netSession, mpUi, menuUi, eventsMod, cacheUi, cargoUi, invMod, entityMod, destMod };
      `,
      resolveDir: ROOT,
    },
    bundle: true,
    write: false,
    format: "iife",
    loader: { ".webp": "dataurl", ".glb": "dataurl", ".txt": "text" },
    plugins: [{
      name: "stub-gl-only",
      setup(build) {
        const map = {
          "render/scene.js": "scene-stub",
          "render/menuview.js": "menuview-stub",
          "render/gltf.js": "gltf-stub",
          "render/shipviewer.js": "shipviewer-stub",
          "core/audio.js": "audio-stub",
          "render/warpfx.js": "warpfx-stub",
          "render/views.js": "views-stub",
          "render/target-picking.js": "pick-stub",
          "ui/outfitting.js": "outfitting-stub",
          "ui/crash.js": "crash-stub",
        };
        build.onResolve({ filter: /^trystero$/ }, () => ({ path: "trystero-stub", namespace: "stub" }));
        build.onResolve({ filter: /^\./ }, args => {
          const abs = path.resolve(args.resolveDir, args.path).replace(/\\/g, "/");
          for (const [suffix, name] of Object.entries(map)) {
            if (abs.endsWith("/src/" + suffix)) return { path: name, namespace: "stub" };
          }
        });
        build.onLoad({ filter: /.*/, namespace: "stub" }, async args => {
          if (args.path === "trystero-stub") return { contents: "export function joinRoom(cfg, roomId){ return globalThis.__makeRoom(cfg, roomId); } export function getRelaySockets(){ return {}; }" };
          if (args.path === "scene-stub") return { contents: `
            import * as THREE from "three";
            export const renderer = { setPixelRatio(){}, setSize(){}, render(){}, domElement: document.createElement("canvas") };
            export const scene = new THREE.Scene();
            export const camera = new THREE.PerspectiveCamera(60, 1280/800, 0.1, 20000);
            export const stars = new THREE.Group();
            export const showPlace = () => {};
            export const stepScenery = () => {};
            export const updateScenery = () => {};
            export const forgetPlace = () => {};
          `, resolveDir: ROOT };
          if (args.path === "menuview-stub") return { contents: "export const updateMenuView=()=>{}; export const menuView=()=>({scene:{},camera:{}}); export const resizeMenuView=()=>{};" };
          if (args.path === "gltf-stub") return { contents: "export const instantiateModel=()=>null; export const modelTemplate=()=>null; export const spinNodes=()=>[]; export const engNodes=()=>[]; export const preloadAfterPaint=()=>Promise.resolve(); export const preloadModels=()=>Promise.resolve();" };
          if (args.path === "shipviewer-stub") return { contents: "export const createShipViewer=()=>({ render(){}, dispose(){}, resize(){}, setShip(){} });" };
          if (args.path === "audio-stub") return { contents: "export const updateAudio=()=>{}; export const initAudio=()=>{}; export const uiSound=()=>{}; export const hoverSound=()=>{}; export const isMuted=()=>false; export const toggleMute=()=>false; export const setAudioSuspended=()=>{};" };
          if (args.path === "warpfx-stub") return { contents: "export const setupWarpStreaks=()=>{}; export const updateWarpStreaks=()=>{};" };
          if (args.path === "views-stub") return { contents: `
            import * as THREE from "three";
            export const installEnemyViews=()=>{};
            export const updateEnemyViews=()=>{};
            export const updateEntityViews=()=>{};
            export const snapshotSimPoses=()=>{};
            export const snapRenderedPlayer=()=>{};
            export const renderPlayerPose=(P)=>({pos:P.pos,quat:P.quat,v:P.v});
            export const interpolatedPos=(o)=>o?.pos||new THREE.Vector3();
            export const interpolatedVelocity=(o)=>o?.v||new THREE.Vector3();
          `, resolveDir: ROOT };
          if (args.path === "pick-stub") return { contents: "export const pickLockSurface=()=>globalThis.__PICK_RESULT||null;" };
          if (args.path === "outfitting-stub") return { contents: "export const updateOutfitting=()=>{}; export const mountOutfitting=()=>{};" };
          if (args.path === "crash-stub") return { contents: "export const installCrashNotice=()=>{}; export const reportCrash=(w,e)=>{ globalThis.__CRASHES.push([w, String(e)]); };" };
        });
      },
    }],
  });

  const code = bundle.outputFiles[0].text;
  const rooms = new Map();
  function makeVirtualRoom(who, roomId) {
    const peerId = who + "-peer";
    const listeners = { join: [], leave: [], msg: [] };
    if (!rooms.has(roomId)) rooms.set(roomId, new Map());
    const peersMap = rooms.get(roomId);
    const api = {
      peerId,
      makeAction() {
        return {
          send(data, opts) {
            const target = opts?.target;
            for (const [id, other] of peersMap.entries()) {
              if (id === peerId) continue;
              if (target && id !== target) continue;
              queueMicrotask(() => other._deliver(data, peerId));
            }
            return Promise.resolve();
          },
          onMessage(fn) { listeners.msg.push(fn); },
        };
      },
      onPeerJoin(fn) { listeners.join.push(fn); },
      onPeerLeave(fn) { listeners.leave.push(fn); },
      onError() {},
      getPeers() {
        const o = {};
        for (const id of peersMap.keys()) if (id !== peerId) o[id] = { direct: true };
        return o;
      },
      leave() {
        peersMap.delete(peerId);
        for (const [, other] of peersMap.entries()) other._peerLeft(peerId);
      },
      _deliver(data, fromPeer) { for (const fn of listeners.msg) fn(data, { peerId: fromPeer }); },
      _peerJoined(id) { for (const fn of listeners.join) fn({ peerId: id }); },
      _peerLeft(id) { for (const fn of listeners.leave) fn({ peerId: id }); },
    };
    const existing = [...peersMap.keys()];
    peersMap.set(peerId, api);
    queueMicrotask(() => {
      for (const id of existing) { peersMap.get(id)?._peerJoined(peerId); api._peerJoined(id); }
    });
    return api;
  }

  const allIntervals = [];
  const allTimeouts = [];
  function bootInstance(who) {
    const storage = new Map();
    const winListeners = {};
    const elsById = new Map();
    function makeEl(tag = "div", id = "") {
      const elListeners = {};
      const el = {
        tagName: tag.toUpperCase(), id, hidden: false, type: "", checked: false,
        textContent: "", _innerHTML: "", value: "", dataset: {}, style: {}, children: [],
        parentElement: null, attributes: {},
        classList: {
          _s: new Set(),
          add(...xs) { xs.forEach(x => this._s.add(x)); },
          remove(...xs) { xs.forEach(x => this._s.delete(x)); },
          toggle(x, f) { const on = f === undefined ? !this._s.has(x) : !!f; if (on) this._s.add(x); else this._s.delete(x); return on; },
          contains(x) { return this._s.has(x); },
        },
        get innerHTML() { return this._innerHTML; },
        set innerHTML(v) {
          this._innerHTML = String(v);
          this.children = [];
          const stack = [this];
          const VOID = new Set(["input", "img", "br", "hr"]);
          for (const m of this._innerHTML.matchAll(/<(\/?)(\w+)([^>]*)>/g)) {
            const closing = !!m[1]; const t = m[2].toLowerCase(); const attrs = m[3];
            if (closing) { if (stack.length > 1) stack.pop(); continue; }
            const cid = (attrs.match(/\bid="([^"]+)"/) || [])[1] || "";
            const c = makeEl(t, cid);
            if (/\bhidden\b/.test(attrs)) c.hidden = true;
            const cls = (attrs.match(/\bclass="([^"]+)"/) || [])[1];
            if (cls) cls.split(/\s+/).forEach(x => x && c.classList.add(x));
            const typeM = attrs.match(/\btype="([^"]+)"/);
            if (typeM) c.type = typeM[1];
            for (const dm of attrs.matchAll(/\bdata-([a-z0-9-]+)="([^"]*)"/gi)) {
              c.dataset[dm[1].replace(/-([a-z])/g, (_, ch) => ch.toUpperCase())] = dm[2];
            }
            stack[stack.length - 1].appendChild(c);
            if (!VOID.has(t) && !attrs.endsWith("/")) stack.push(c);
          }
        },
        appendChild(c) { c.parentElement = this; this.children.push(c); return c; },
        prepend(c) { c.parentElement = this; this.children.unshift(c); return c; },
        append(...cs) { cs.forEach(c => this.appendChild(c)); },
        remove() {},
        addEventListener(t, fn) { (elListeners[t] ||= []).push(fn); },
        dispatchEvent(ev) { for (const fn of elListeners[ev.type] || []) fn(ev); },
        setAttribute(k, v) { this.attributes[k] = String(v); },
        getAttribute(k) { return this.attributes[k] ?? null; },
        contains(target) { return target === this || this.children.some(c => c.contains?.(target)); },
        querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
        querySelectorAll(sel) {
          const out = [];
          const walk = node => {
            for (const c of node.children || []) {
              let match = false;
              if (sel.startsWith("#")) match = c.id === sel.slice(1);
              else if (sel.startsWith(".")) match = c.classList.contains(sel.slice(1));
              else if (sel.startsWith("[")) {
                const dm = sel.match(/^\[data-([a-z0-9-]+)(?:="([^"]*)")?\]$/i);
                if (dm) {
                  const k = dm[1].replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
                  match = dm[2] === undefined ? (k in c.dataset) : c.dataset[k] === dm[2];
                }
              } else match = c.tagName === sel.toUpperCase();
              if (match) out.push(c);
              walk(c);
            }
          };
          walk(this);
          return out;
        },
        closest(sel) {
          let cur = this;
          while (cur) {
            if (sel === "[data-cache-close]" && "cacheClose" in cur.dataset) return cur;
            if (sel === "button[data-a='invSlot']" && cur.tagName === "BUTTON" && cur.dataset?.a === "invSlot") return cur;
            cur = cur.parentElement;
          }
          return null;
        },
        focus() { doc.activeElement = this; },
        blur() { if (doc.activeElement === this) doc.activeElement = doc.body; },
        select() {},
        getBoundingClientRect() { return { top: 0, left: 0, width: 100, height: 20 }; },
        getContext() { return { clearRect(){}, beginPath(){}, moveTo(){}, lineTo(){}, stroke(){}, save(){}, restore(){} }; },
      };
      if (id) elsById.set(id, el);
      return el;
    }
    for (const m of shell.matchAll(/<(\w+)\s+[^>]*id="([^"]+)"([^>]*)>/g)) {
      const el = makeEl(m[1], m[2]);
      if (/\bhidden\b/.test(m[0])) el.hidden = true;
    }
    const body = makeEl("body");
    const doc = {
      body, documentElement: { clientWidth: 1280, clientHeight: 800 }, activeElement: body,
      visibilityState: "visible", hidden: false,
      createElement: tag => makeEl(tag), createElementNS: (_ns, tag) => makeEl(tag),
      getElementById: id => elsById.get(id) || null, addEventListener() {},
    };
    const rafQueue = [];
    let simNow = 1000;
    const ctx = {
      __CRASHES: [], __PICK_RESULT: null, __makeRoom: (_cfg, roomId) => makeVirtualRoom(who, roomId),
      console,
      setTimeout: (fn, ms, ...a) => { const t = setTimeout(fn, ms, ...a); allTimeouts.push(t); return t; },
      clearTimeout,
      setInterval: (fn, ms, ...a) => { const t = setInterval(fn, ms, ...a); allIntervals.push(t); return t; },
      clearInterval, queueMicrotask, Promise,
      Math, Date, JSON, Object, Array, Map, Set, Number, String, Boolean, Error, TypeError, RegExp,
      Uint8Array, Float32Array, Int32Array, ArrayBuffer, URL, Blob, TextEncoder, TextDecoder,
      localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k), clear: () => storage.clear() },
      location: { href: "https://example.test/", search: "", hash: "" }, history: { replaceState() {} },
      innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1,
      performance: { now: () => simNow },
      requestAnimationFrame: fn => { rafQueue.push(fn); return rafQueue.length; },
      addEventListener(t, fn) { (winListeners[t] ||= []).push(fn); },
      document: doc, window: null, navigator: { clipboard: { writeText: async () => {} } }, crypto: globalThis.crypto,
    };
    ctx.window = ctx; ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    return {
      ctx, doc, elsById,
      stepFrame(ms = 16.666) { simNow += ms; const b = rafQueue.splice(0); for (const fn of b) fn(simNow); },
      pressKey(c) { for (const fn of winListeners.keydown || []) fn({ code: c, repeat: false, altKey: false, target: doc.body, preventDefault() {} }); },
      releaseKey(c) { for (const fn of winListeners.keyup || []) fn({ code: c, altKey: false, target: doc.body, preventDefault() {} }); },
    };
  }

  try {
    const host = bootInstance("HOST");
    const guest = bootInstance("GUEST");
    const hApp = host.ctx.__APP;
    const gApp = guest.ctx.__APP;
    const tickBoth = async (frames = 8, ms = 16.666) => {
      for (let i = 0; i < frames; i++) {
        host.stepFrame(ms);
        guest.stepFrame(ms);
        await new Promise(r => setTimeout(r, 12));
      }
    };

    // Host starts game and hosts; remember guest home seed before joining.
    hApp.netSession.setUsername("HostPilot");
    host.elsById.get("panel").dispatchEvent({ type: "click", target: { closest() { return { dataset: { a: "intro" }, disabled: false }; } }, preventDefault() {} });
    await new Promise(r => setTimeout(r, 15));
    hApp.stateMod.state.worldState.galaxy.seed = 424242;
    hApp.stateMod.state.shops["meridian:cannon_basic"] = 7;
    await hApp.netSession.hostWorld({ name: "HostPilot" });
    const link = hApp.netSession.currentLink().link;

    gApp.netSession.setUsername("GuestPilot");
    guest.elsById.get("panel").dispatchEvent({ type: "click", target: { closest() { return { dataset: { a: "intro" }, disabled: false }; } }, preventDefault() {} });
    await new Promise(r => setTimeout(r, 15));
    const homeSeedBefore = gApp.stateMod.state.worldState.galaxy.seed;
    // Pause menu / quit back to title to join cleanly with saved home state.
    gApp.eventsMod.emit("mp-quit-title");
    await gApp.netSession.joinWorld({ link });
    await tickBoth(6);
    assert.equal(await gApp.mpUi.act("bring"), true);
    await tickBoth(12);

    const hGuests = hApp.stateMod.state.players.filter(p => p.guestId);
    assert.equal(hGuests.length, 1);
    const hg = hGuests[0];
    const gp = gApp.stateMod.localPlayer();

    // Verify host galaxy seed & shops synced to guest!
    assert.equal(gApp.stateMod.state.worldState.galaxy.seed, 424242);
    assert.equal(gApp.stateMod.state.shops["meridian:cannon_basic"], 7);

    // Launch guest from station via panel Go button.
    guest.elsById.get("panel").dispatchEvent({ type: "click", target: { closest() { return { dataset: { a: "go" }, disabled: false }; } }, preventDefault() {} });
    await tickBoth(16);
    assert.equal(hg.docked, false);
    assert.equal(gp.docked, false);

    // 1. Verify P.power.draw syncs cleanly to host (including 0 when omitted on wire)!
    gp.power.draw = 99;
    await tickBoth(12);
    assert.equal(gp.power.draw, Math.round(Math.max(0, Number(hg.power.draw) || 0) * 100) / 100, "guest power.draw tracks host");
    gp.power.draw = 5;
    hg.power.draw = 0;
    // Freeze shield regen briefly so host power.draw stays 0 across a ship frame if reactor has idle draw.
    hg.sh = hg.shMax;
    await tickBoth(12);
    assert.equal(gp.power.draw, Math.round(Math.max(0, Number(hg.power.draw) || 0) * 100) / 100, "applyOwnWeaponWx resets omitted pwrDraw to 0 when host idle draw is 0");

    // 2. Verify KeyF lock on guest syncs lock onto host guest record!
    const hW = hApp.stateMod.placeWorld(hg.place);
    const targetEnemy = { id: 8801, kind: "enemy", def: "raider", n: "Raider", place: hg.place, hp: 50, mx: 50, pos: hg.pos.clone().add({ x: 0, y: 0, z: -300 }), quat: hg.quat.clone(), v: hg.pos.clone().set(0, 0, 0) };
    hW.enemies.push(targetEnemy);
    await tickBoth(16);
    const gEnemy = gApp.stateMod.placeWorld(gp.place).enemies.find(e => e.id === 8801);
    assert.ok(gEnemy, "guest receives host enemy over mp-entities");
    guest.ctx.__PICK_RESULT = { k: "e", o: gEnemy };
    guest.pressKey("KeyF");
    guest.releaseKey("KeyF");
    await tickBoth(10);
    assert.equal(hg.flight.lock?.k, "e", "host guest record reflects guest's KeyF lock");
    assert.equal(hg.flight.lock?.o, targetEnemy);

    // 3. Verify KeyR enters a host rift -> guest syncs inst-... place, entities (gates/caches), opens cache, moves item, closes & leaves!
    const hRift = hApp.entityMod.addEntity(hW.rifts, {
      kind: "rift", place: hg.place, n: "Host Rift", template: "guardian_rift", seed: 55123,
      pos: hg.pos.clone(), quat: hg.quat.clone(), spin: 0.35, r: 26, gone: false,
    });
    assert.ok(hRift);
    await tickBoth(12);
    assert.ok(gApp.stateMod.placeWorld(gp.place).rifts.some(r => r._net === true), "guest draws host rift entity");

    guest.pressKey("KeyR");
    guest.releaseKey("KeyR");
    await tickBoth(20);
    assert.ok(hg.place.startsWith("rift-"), `host moved guest into instance (got ${hg.place})`);
    assert.equal(gp.place, hg.place, "guest followed into dynamic instance place");

    // Host marks instance objective complete & unlocks cache, guest stands beside cache & presses R!
    const rec = hApp.stateMod.instanceAt(hg.place);
    assert.ok(rec);
    hApp.stateMod.placeWorld(hg.place).enemies.length = 0;
    rec.objective.met = true;
    rec.cache.open = true;
    rec.cache.stock = { ferrite: 2 };
    rec.cache.slots = null;
    if (rec.cache.entity) rec.cache.entity.locked = false;
    if (rec.gate) rec.gate.locked = false;
    hg.pos.copy(rec.cache.pos);
    await tickBoth(16);

    guest.pressKey("KeyR");
    guest.releaseKey("KeyR");
    await tickBoth(16);
    assert.equal(gApp.cacheUi.isCacheOpen(), true, "guest R beside open cache opens ui/cache modal");

    // Shift-click item from CACHE into guest hold over wire!
    const cacheModal = guest.doc.body.querySelector("#cache");
    const cacheColBtns = cacheModal.querySelector("#cache-body").querySelectorAll("button");
    const ferrBtn = cacheColBtns.find(b => b.dataset?.where === "cache" && b.dataset?.a === "invSlot" && b.dataset?.id === "ferrite");
    assert.ok(ferrBtn, "guest cache modal renders CACHE slot button");
    cacheModal.dispatchEvent({ type: "click", target: ferrBtn, shiftKey: true, clientX: 10, clientY: 10 });
    await tickBoth(16);
    assert.equal(gApp.invMod.countOf(gp.ship, "ferrite", gApp.stateMod.state.profile, gApp.stateMod.state.worldState), 2);
    assert.equal(gApp.cacheUi.isCacheOpen(), false, "emptied cache closes modal cleanly on guest");

    // Guest flies to exit gate and presses R to exit instance back to origin pocket!
    hg.pos.copy(rec.exitPos);
    await tickBoth(16);
    guest.pressKey("KeyR");
    guest.releaseKey("KeyR");
    await tickBoth(18);
    assert.equal(gp.place, "reach", "guest returned to host origin pocket on KeyR exit");

    // 4. Verify KeyJ (route:jump) sends warp request to host, completes arrival -> guest place-changed clears destination, & travel-denied forwards notice!
    gApp.destMod.setDestination({ pocketId: "hollow" });
    guest.pressKey("KeyJ");
    guest.releaseKey("KeyJ");
    await tickBoth(14);
    assert.ok(hg.warp, "KeyJ initiated host warp for guest ship via netRequestWarp");
    await tickBoth(90, 35);
    assert.equal(hg.place, "hollow", "host guest arrived at hollow");
    assert.equal(gp.place, "hollow", "guest arrived at hollow");
    assert.equal(gApp.stateMod.state.ui.destination, null, "guest place-changed cleared reached destination");

    const guestNotices = [];
    gApp.eventsMod.on("mp-visit", v => { if (v?.notice) guestNotices.push(v.notice); });
    hApp.eventsMod.emit("travel-denied", { player: hg, reason: "Jump lane sealed." });
    await tickBoth(8);
    assert.equal(guestNotices.includes("Jump lane sealed."), true, "travel-denied forwards reason to guest via visit.notice");

    // 5. Verify Come home restores home galaxy seed, shops, destination and clears _net entities!
    guest.elsById.get("panel").dispatchEvent({ type: "click", target: { closest() { return { dataset: { a: "comehome" }, disabled: false }; } }, preventDefault() {} });
    await tickBoth(10);
    assert.equal(Boolean(gApp.stateMod.state.away), false);
    assert.equal(gApp.stateMod.state.worldState.galaxy.seed, homeSeedBefore);
    assert.equal(gApp.stateMod.state.shops["meridian:cannon_basic"], undefined);
    for (const [, cont] of gApp.stateMod.state.places.entries()) {
      for (const listName of ["bullets", "missiles", "crates", "fx", "enemies", "asteroids", "rifts", "gates", "caches"]) {
        assert.equal((cont.entities?.[listName] || []).some(e => e?._net), false, `no _net ${listName} left after coming home`);
      }
    }
    assert.deepEqual(host.ctx.__CRASHES, []);
    assert.deepEqual(guest.ctx.__CRASHES, []);
  } finally {
    for (const id of allIntervals) clearInterval(id);
    for (const id of allTimeouts) clearTimeout(id);
  }
});
