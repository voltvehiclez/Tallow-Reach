// Regression suite for the four Step 16 slice 8c playtest bug classes:
//   1. Hosting while on the Pause / Multiplayer screen leaves the host world paused.
//   2. Guest docking is immediately undone by in-flight controls / unguarded input / camera lerp.
//   3. Leaving a host world leaves `_net` entities and broken transient state in the local world.
//   4. Guest cannot see NPCs (`makeEnemy` ReferenceError), wrong bullet colour, missing explosion
//      `count`, stale local NPCs, and 60 Hz prevPoses sawtooth over 24 Hz entity snapshots.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Minimal DOM & storage shims BEFORE importing UI modules so setupMultiplayer / setupMenu run cleanly in Node.
const storageMap = new Map();
if (typeof globalThis.localStorage === "undefined") {
  globalThis.localStorage = {
    getItem: k => storageMap.get(k) ?? null,
    setItem: (k, v) => storageMap.set(k, String(v)),
    removeItem: k => storageMap.delete(k),
    clear: () => storageMap.clear(),
  };
}
function makeFakeEl(tag = "div") {
  const el = {
    tagName: tag.toUpperCase(),
    id: "",
    hidden: false,
    className: "",
    children: [],
    parentNode: null,
    attributes: {},
    style: {},
    value: "",
    scrollTop: 0,
    scrollHeight: 0,
    _html: "",
    textContent: "",
    classList: {
      _set: new Set(),
      add(...xs) { for (const x of xs) this._set.add(x); },
      remove(...xs) { for (const x of xs) this._set.delete(x); },
      toggle(x, f) {
        const on = f === undefined ? !this._set.has(x) : !!f;
        if (on) this._set.add(x); else this._set.delete(x);
        return on;
      },
      contains(x) { return this._set.has(x); },
    },
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return this.attributes[k] ?? null; },
    addEventListener() {},
    closest() { return null; },
    focus() {},
    blur() {},
    select() {},
    contains(other) {
      if (other === this) return true;
      for (const c of this.children || []) if (c.contains?.(other)) return true;
      return false;
    },
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
    append(...kids) { for (const k of kids) this.appendChild(k); },
    querySelector(sel) {
      if (sel.startsWith("#")) {
        const id = sel.slice(1);
        const walk = node => {
          if (node.id === id) return node;
          for (const c of node.children || []) {
            const hit = walk(c);
            if (hit) return hit;
          }
          return null;
        };
        return walk(this);
      }
      return null;
    },
    querySelectorAll() { return []; },
  };
  Object.defineProperty(el, "innerHTML", {
    get() { return el._html; },
    set(v) {
      el._html = String(v);
      if (el.id === "mp-chat") {
        el.children = [];
        for (const [cid, ctag] of [["mp-chat-input", "input"], ["mp-chat-lines", "div"], ["mp-chat-who", "aside"], ["mp-chat-note", "div"], ["mp-chat-pin", "button"]]) {
          const child = makeFakeEl(ctag);
          child.id = cid;
          el.appendChild(child);
        }
      }
    },
  });
  return el;
}
if (typeof globalThis.document === "undefined") {
  const body = makeFakeEl("body");
  globalThis.document = {
    body,
    activeElement: null,
    createElement: tag => makeFakeEl(tag),
    getElementById: id => body.querySelector(`#${id}`),
    addEventListener() {},
  };
}

const root = fileURLToPath(new URL("..", import.meta.url));
const read = rel => readFileSync(path.join(root, rel), "utf8");

import { state, localPlayer, placeWorld, resetPlaces } from "../src/state/state.js";
import { newProfile, newWorld, SAVE_VERSION, sanitizeSave } from "../src/state/profile.js";
import { neutralControls } from "../src/state/controls.js";
import { DEFAULT_PLACE } from "../src/data/places.js";
import { BULLET_COLOURS } from "../src/data/weapons.js";
import { emit } from "../src/util/events.js";
import { stepSim, isSimulationPaused } from "../src/sim/step.js";
import { createPlayer, createPlayerRecord } from "../src/sim/player.js";
import { configurePlayer, launch, tryDock, resumeFromSave } from "../src/sim/session.js";
import { arriveGuest, applyGuestControls, resetGuests } from "../src/sim/multiplayer.js";
import { lockName, targetHealth } from "../src/sim/targeting.js";
import { pocketObjects } from "../src/sim/flight-instruments.js";
import { createShipStream } from "../src/render/shipstream.js";
import { loadHeadless } from "./headless.mjs";
import { playSfx } from "../src/core/audio.js";
import { fire } from "../src/sim/combat.js";
import { setupMultiplayer, setMultiplayerApi, closeMultiplayer } from "../src/ui/multiplayer.js";
import * as session from "../src/net/session.js";
import { hashToken } from "../src/net/custody.js";
import { cleanMessage } from "../src/net/protocol.js";

function resetRuntime() {
  state.players.length = 0;
  state.localPlayerIndex = 0;
  state.away = null;
  state.guestHome = null;
  state.paused = false;
  state.multiplayer = false;
  state.ui.intro = false;
  state.ui.campaign = false;
  state.ui.campaignEnd = false;
  state.ui.multiplayer = false;
  state.ui.awayCard = false;
  state.place = DEFAULT_PLACE;
  state.profile = newProfile();
  state.worldState = newWorld();
  resetPlaces();
  resetGuests();
}

/* ------------------------------------------------------------------------- */
/* Bug 1: hosting from the Pause card must unfreeze the simulation           */
/* ------------------------------------------------------------------------- */

test("Bug 1: starting multiplayer from the Pause menu sets state.multiplayer on mp-state", () => {
  resetRuntime();
  state.paused = true;
  state.multiplayer = false;
  state.ui.intro = false;
  state.ui.campaignEnd = false;

  setupMultiplayer();
  let snap = { on: false, role: null, state: "idle", line: "Multiplayer is off.", worldId: null, name: "Ada", peers: [], guests: [], chat: [] };
  setMultiplayerApi({ snapshot: () => snap });

  assert.equal(isSimulationPaused(), true, "before hosting, an open Pause card pauses local play");

  snap = { ...snap, on: true, role: "host", state: "finding", worldId: "w-host" };
  emit("mp-state", snap);
  assert.equal(state.multiplayer, true, "mp-state { on: true } turns state.multiplayer on immediately");
  assert.equal(isSimulationPaused(), false, "the hosted world ticks immediately without needing to close Pause first");

  snap = { ...snap, on: false, role: null, state: "idle", worldId: null };
  emit("mp-state", snap);
  assert.equal(state.multiplayer, false, "mp-state { on: false } clears state.multiplayer");
  assert.equal(isSimulationPaused(), true, "stopping hosting while Pause is open restores pause");
  closeMultiplayer();
});

/* ------------------------------------------------------------------------- */
/* Bug 2: guest docking must not immediately auto-relaunch                   */
/* ------------------------------------------------------------------------- */

test("Bug 2a: in-flight guest controls arriving after tryDock must NOT re-launch the guest", () => {
  resetRuntime();
  const host = createPlayer();
  configurePlayer(host, state.profile);
  host.docked = true;

  const visitor = arriveGuest({ guestId: "guest-1", name: "Bo", profile: newProfile(), place: DEFAULT_PLACE });
  assert.equal(launch(visitor, visitor.profile), undefined);
  assert.equal(visitor.docked, false, "visitor launches cleanly on explicit Launch");

  // Move visitor right next to the station at slow speed so tryDock succeeds.
  visitor.pos.set(0, 0, 0);
  visitor.v.set(0, 0, 0);
  assert.equal(tryDock(visitor, visitor.profile, state.worldState), true, "visitor docks at station");
  assert.equal(visitor.docked, true);

  // An in-flight controls packet arrives a few milliseconds later.
  applyGuestControls("guest-1", { thrust: 1, steer: { x: 0.4, y: -0.2 }, fire: true, aim: [0, 0, -1] });
  assert.equal(visitor.docked, true, "a docked visitor stays docked despite late controls packets");
  assert.equal(visitor.controls.thrust, 0, "and controls stay neutral while docked");
  assert.equal(visitor.controls.fire, false);

  // Only explicit Launch / mp-guest-dock undocks the visitor.
  launch(visitor, visitor.profile);
  assert.equal(visitor.docked, false, "explicit Launch puts the visitor back in space");
});

test("Bug 2b: guest sendControls sends nothing while docked, paused, or at the title screen", async () => {
  resetRuntime();
  const host = createPlayer();
  configurePlayer(host, state.profile);

  const made = [];
  session.setChannelFactory(({ role, worldId, onState, onData, onPeer }) => {
    const ch = {
      role, worldId, peerId: null, outbound: [],
      join: async () => { onState?.({ state: "finding", reason: "" }); return ch; },
      send: (peerId, value) => { ch.outbound.push({ peerId, value }); ch.deliver?.(peerId, value); return true; },
      broadcast: value => (ch.peerId ? (ch.send(ch.peerId, value), 1) : 0),
      peers: () => (ch.peerId ? [ch.peerId] : []),
      state: () => ({ state: ch.peerId ? "connected" : "finding", reason: "" }),
      room: () => worldId,
      leave: () => {},
      reach: (message, peerId = "peer-1") => onData?.({ ...message, peerId }),
      connect(peerId = "peer-1") { ch.peerId = peerId; onPeer?.({ kind: "join", peerId }); },
    };
    made.push(ch);
    return ch;
  });

  const makeSave = () => sanitizeSave({ v: SAVE_VERSION, profile: newProfile(), world: newWorld(), away: null });
  const hostSave = makeSave();
  hostSave.world.guests["guest-guest-to"] = {
    name: "Bo", tokenHash: hashToken("guest-token", "guest-guest-to"), epoch: 1, rev: 1,
    bundle: { profile: newProfile(), rev: 1, epoch: 1 }, lastSeen: 0, left: false,
  };
  const hostSess = session.createChannelForTest("host", "w-dock", "Ada", "host-token", {
    read: () => hostSave, write: next => Object.assign(hostSave, next),
  });
  await hostSess.start();
  const hostCh = made.at(-1);
  const guestSess = session.createChannelForTest("guest", "w-dock", "Bo", "guest-token", {
    read: () => makeSave(), write: () => {},
  });
  await guestSess.start();
  const guestCh = made.at(-1);
  hostCh.deliver = (_p, v) => guestCh.reach(v, "host-peer");
  guestCh.deliver = (_p, v) => hostCh.reach(v, "guest-peer");
  hostCh.connect("guest-peer");
  guestCh.connect("host-peer");
  await new Promise(r => setTimeout(r, 0));

  guestCh.outbound.length = 0;
  state.localInput = { ...neutralControls(), thrust: 1, fire: true };
  state.aimDirection = { x: 0, y: 0, z: -1 };

  host.docked = true;
  assert.equal(guestSess.sendControls(), false, "docked guest does not transmit flight controls");
  assert.equal(guestCh.outbound.length, 0);

  host.docked = false;
  state.paused = true;
  assert.equal(guestSess.sendControls(), false, "paused guest does not transmit flight controls");

  state.paused = false;
  state.ui.intro = true;
  assert.equal(guestSess.sendControls(), false, "guest on title screen does not transmit flight controls");

  state.ui.intro = false;
  assert.equal(guestSess.sendControls(), true, "flying guest transmits flight controls");
  assert.equal(guestCh.outbound.length, 1);

  guestSess.stop({ quiet: true });
  hostSess.stop({ quiet: true });
  session.setChannelFactory(null);
});

test("Bug 2c: shipStream snaps without interpolating across docked transitions", () => {
  const stream = createShipStream({ delayMs: 50, snapM: 500 });
  stream.receive([{ id: "g1", name: "Bo", ship: "wasp", place: "meridian", pos: [0, 0, -180], quat: [0, 0, 0, 1], velocity: [0, 0, 0], docked: false, dead: false }], 100);
  stream.receive([{ id: "g1", name: "Bo", ship: "wasp", place: "meridian", pos: [0, 0, -200], quat: [0, 0, 0, 1], velocity: [0, 0, 0], docked: true, dead: false }], 200);
  const [pose] = stream.sample(200); // target = 150ms, halfway between 100 and 200
  assert.equal(pose.docked, true);
  assert.equal(pose.pos.z, -200, "snaps cleanly to the new docked state rather than interpolating z = -190");
});

test("Bug 2d: main.js applySelfShip records prior pose/place/docked before mutating P for camera snap", () => {
  const mainSrc = read("src/main.js");
  const idx = mainSrc.indexOf("function applySelfShip");
  const body = mainSrc.slice(idx, mainSrc.indexOf("/* Stash our own galaxy", idx));
  assert.match(body, /prevPlace|wasPlace/, "applySelfShip captures previous place before overwriting P.place");
  assert.match(body, /prevPos|wasPos/, "applySelfShip captures previous position before overwriting P.pos");
  assert.match(body, /wasDocked !== P\.docked/, "docked <-> launched flips trigger camera snap");
});

/* ------------------------------------------------------------------------- */
/* Bug 3: leaving a host world must purge `_net` entities & unfreeze ship    */
/* ------------------------------------------------------------------------- */

test("Bug 3: returning home purges all _net entities so local stepSim flies and fires cleanly", async () => {
  resetRuntime();
  const P = createPlayer();
  configurePlayer(P, state.profile);
  state.away = { hostName: "Ada", worldId: "w-1" };

  // Simulate dirty `_net` records deposited by mp-entities while visiting a host.
  const W = placeWorld(DEFAULT_PLACE);
  W.bullets.push({ id: 901, kind: "bullet", _net: true, pos: P.pos.clone(), colour: 0xff4a35 }); // no .v!
  W.fx.push({ id: 902, kind: "fx", _net: true, pos: P.pos.clone(), l: 0.5, t: 1, col: 0xffaa00, size: 1 }); // no .v!
  W.missiles.push({ id: 903, kind: "missile", _net: true, pos: P.pos.clone() }); // no .d!
  W.enemies.push({ id: 904, kind: "enemy", _net: true, def: "raider", pos: P.pos.clone(), v: P.v.clone(), hp: 10, mx: 10 });
  state.otherPilots = [{ k: "p", id: "host", pos: P.pos.clone() }];
  state.flight.beamOn = true;
  state.flight.missileLock = { target: { _net: true }, t: 1, locked: true };

  // Also test the exact world-purge helper (`clearNetEntities`) + menu come-home path (`afterSaveChange`).
  const worldMod = await import("../src/sim/world.js");
  assert.equal(typeof worldMod.clearNetEntities, "function", "sim/world.js exports clearNetEntities()");
  worldMod.clearNetEntities();

  assert.equal(W.bullets.some(b => b._net), false, "all _net bullets purged");
  assert.equal(W.fx.some(f => f._net), false, "all _net fx purged");
  assert.equal(W.missiles.some(m => m._net), false, "all _net missiles purged");
  assert.equal(W.enemies.some(e => e._net), false, "all _net enemies purged");
  assert.equal(state.otherPilots.length, 0, "otherPilots cleared");
  assert.equal(state.flight.beamOn, false, "guest beam state cleared");
  assert.equal(state.flight.missileLock.target, null, "_net lock target cleared");

  // Launch locally and verify ship & bullets move with zero crash.
  state.away = null;
  resumeFromSave(P, state.profile);
  launch(P, state.profile);
  const startPos = P.pos.clone();
  P.controls.thrust = 1;
  P.controls.fire = true;
  for (let i = 0; i < 60; i++) stepSim(1 / 60);
  assert.ok(P.pos.distanceTo(startPos) > 1, "local ship flies normally after leaving host");
  const localBullets = placeWorld(DEFAULT_PLACE).bullets.filter(b => b && !b._net);
  assert.ok(localBullets.length > 0, "local cannons fire normally");
  assert.ok(localBullets[0].v.length() > 100, "local bullets carry real velocity and advance");

  // Verify both menu return paths invoke afterSaveChange() so places are always reset cleanly.
  const menuSrc = read("src/ui/menu.js");
  const comeHomeBody = menuSrc.slice(menuSrc.indexOf("function comeHome()"), menuSrc.indexOf("function enterGameMode("));
  assert.match(comeHomeBody, /afterSaveChange\(\)/, "comeHome() resets places and rebuilds local world");
  const actBody = menuSrc.slice(menuSrc.indexOf("  comehome() {"), menuSrc.indexOf("  lostHostOk() {"));
  assert.match(actBody, /afterSaveChange\(\)/, "ACTIONS.comehome() resets places and rebuilds local world");
});

/* ------------------------------------------------------------------------- */
/* Bug 4: guest NPC rendering, bullet colours, and sound parity              */
/* ------------------------------------------------------------------------- */

test("Bug 4: hostile bullets default to hostile red colour and explosion SFX includes count > 10", () => {
  const mainSrc = read("src/main.js");
  const entityStreamSrc = read("src/render/entitystream.js");
  // Must NOT default bullets to generic 0xffcc66 when e.own === false
  assert.doesNotMatch(mainSrc, /Number\.isFinite\(e\.color\)\s*\?\s*e\.color\s*:\s*0xffcc66/, "hostile bullet colour fallback must not overwrite red hostile shots with 0xffcc66");
  assert.match(mainSrc, /BULLET_COLOURS\.hostile/, "host-side bullet packing falls back to BULLET_COLOURS.hostile for non-player shots");
  // Explosion SFX must include count > 10 so core/audio.js SFX.explosion actually plays
  assert.match(mainSrc, /collectGuestPocketSfx\(/, "mp-entities routes pocket audio through collectGuestPocketSfx");
  assert.match(entityStreamSrc, /name:\s*"explosion",\s*count:\s*30/, "guest explosion SFX passes count > 10 so SFX.explosion plays");
  // makeEnemy must never reference an undeclared `place` variable
  assert.doesNotMatch(mainSrc, /def:\s*"raider",\s*place,\s*_net:\s*true/, "makeEnemy must not reference out-of-scope `place`");
});

test("Bug 4: entitystream interpolates remote hostiles/bullets smoothly and purges stale local NPCs", async () => {
  resetRuntime();
  const P = createPlayer();
  configurePlayer(P, state.profile);
  state.away = { hostName: "Ada", worldId: "w-1" };

  const W = placeWorld(DEFAULT_PLACE);
  // Plant a stale local non-_net NPC that would have stayed frozen in the guest sky before the fix.
  W.enemies.push({ id: 1, kind: "enemy", def: "raider", n: "Old", pos: P.pos.clone(), v: P.v.clone(), hp: 10, mx: 10 });

  const mod = await import("../src/render/entitystream.js");
  const stream = mod.createEntityStream({ delayMs: 50, snapM: 500 });

  stream.receive({
    place: DEFAULT_PLACE,
    enemies: [{ id: 11, def: "raider", friendly: false, boost: false, pos: [100, 0, 0], quat: [0, 0, 0, 1], v: [20, 0, 0], hp: 10, mx: 10 }],
    bullets: [{ id: 21, pos: [10, 0, 0], quat: [0, 0, 0, 1], colour: BULLET_COLOURS.hostile }],
    missiles: [],
    crates: [],
    fx: [],
  }, 100);
  stream.receive({
    place: DEFAULT_PLACE,
    enemies: [{ id: 11, def: "raider", friendly: false, boost: false, pos: [120, 0, 0], quat: [0, 0, 0, 1], v: [20, 0, 0], hp: 10, mx: 10 }],
    bullets: [{ id: 21, pos: [30, 0, 0], quat: [0, 0, 0, 1], colour: BULLET_COLOURS.hostile }],
    missiles: [],
    crates: [],
    fx: [],
  }, 200);

  const sample = stream.samplePlace(DEFAULT_PLACE, 200); // target = 150ms (t = 0.5)
  assert.ok(sample);
  assert.equal(sample.enemies[0].pos[0], 110, "enemy position interpolates smoothly between host snapshots");
  assert.equal(sample.bullets[0].pos[0], 20, "bullet position interpolates smoothly between host snapshots");

  mod.syncPocketEntities(W, sample, DEFAULT_PLACE);
  assert.equal(W.enemies.length, 1, "stale non-_net local NPC was purged when syncing host pocket");
  assert.equal(W.enemies[0]._net, true);
  assert.equal(W.enemies[0].id, 11);
  assert.equal(W.enemies[0].place, DEFAULT_PLACE);
  assert.equal(W.enemies[0].n, "Newbie Raider");
  assert.equal(W.bullets[0].colour, BULLET_COLOURS.hostile);

  // _net enemies appear identically to local enemies in HUD list, lock label, HP bar.
  const e = W.enemies[0];
  assert.equal(lockName({ k: "e", o: e }), "Newbie Raider");
  assert.equal(targetHealth(e).hull, 100);
  const objs = pocketObjects(P);
  assert.equal(objs.some(row => row.kind === "Hostile" && row.object?.id === 11 && row.name === "Newbie Raider"), true);

  // And in render/views.js: snapshotSimPoses() does not overwrite prevPoses for _net records
  // or render them with stale 60 Hz alpha instead of entityStream's interpolated pose.
  const views = await loadHeadless(
    "src/render/views.js",
    {
      state: "src/state/state.js",
      V: "src/util/math.js",
      Q: "src/util/math.js",
      placeWorld: "src/state/state.js",
    },
    { keep: ["views.js"] }
  );
  const netEnemy = {
    id: 11, kind: "enemy", def: "raider", n: "Newbie Raider", place: DEFAULT_PLACE,
    _net: true, pos: views.V(100, 0, 0), quat: views.Q(), v: views.V(20, 0, 0), hp: 10, mx: 10,
  };
  views.state.world.enemies.length = 0;
  views.state.world.enemies.push(netEnemy);
  views.updateEnemyViews(1);
  views.snapshotSimPoses();
  netEnemy.pos.set(110, 0, 0);
  // With alpha = 0.25, a non-_net entity would lerp back toward 100 (102.5);
  // a _net entity uses its entityStream-interpolated position (110) directly!
  assert.equal(views.interpolatedPos(netEnemy, 0.25).x, 110);
  assert.equal(views.interpolatedVelocity(netEnemy, 0.25).x, 20);
  assert.equal(views.enemyViewCount(), 1, "views.js draws the _net enemy mesh");
});

test("Bug 4: guest pocket SFX parity (explosion count > 10, first-packet efires, hearRange, docked silence)", async () => {
  resetRuntime();
  const P = createPlayer();
  configurePlayer(P, state.profile);
  P.docked = false;
  P.pos.set(0, 0, 0);

  const { collectGuestPocketSfx } = await import("../src/render/entitystream.js");
  const boomSeen = new Map();
  const pickSeen = new Map();
  const W = placeWorld(DEFAULT_PLACE);

  // Baseline first packet (booms=1, picks=2 -> baseline set, no backlog sounds).
  const s0 = collectGuestPocketSfx({
    place: DEFAULT_PLACE, booms: 1, picks: 2, efires: [], enemies: [], W, player: P, boomSeen, pickSeen,
  });
  assert.deepEqual(s0, []);

  // Second packet: boom incremented, pickup incremented, enemy fires within hearRange on same packet as spawn!
  const s1 = collectGuestPocketSfx({
    place: DEFAULT_PLACE,
    booms: 2,
    picks: 3,
    efires: [77, 88],
    enemies: [
      { id: 77, def: "raider", pos: [100, 0, 0] },   // raider hearRange is 600 -> audible!
      { id: 88, def: "raider", pos: [2000, 0, 0] },  // out of range -> silent!
    ],
    W,
    player: P,
    boomSeen,
    pickSeen,
  });
  assert.deepEqual(s1, [
    { name: "pickup" },
    { name: "enemy-fire" },
    { name: "explosion", count: 30 },
  ]);
  for (const ev of s1) assert.doesNotThrow(() => playSfx(ev));

  // While docked inside a station, pocket sounds stay silent while counters still stay baselined.
  P.docked = true;
  const sDocked = collectGuestPocketSfx({
    place: DEFAULT_PLACE, booms: 5, picks: 6, efires: [77],
    enemies: [{ id: 77, def: "raider", pos: [10, 0, 0] }],
    W, player: P, boomSeen, pickSeen,
  });
  assert.deepEqual(sDocked, []);
  assert.equal(boomSeen.get(DEFAULT_PLACE), 5);
  assert.equal(pickSeen.get(DEFAULT_PLACE), 6);
});

test("entitystream: arrival pacing (paceMs) smooths uneven 24 Hz pocket snapshots for 240 Hz sampling", async () => {
  const { createEntityStream } = await import("../src/render/entitystream.js");
  const paceMs = 1000 / 24;
  const jittered = [1000, 1062, 1084, 1151, 1168, 1210];
  const raw = createEntityStream({ delayMs: 100, samples: 8 });
  const paced = createEntityStream({ delayMs: 100, samples: 8, paceMs });
  for (let i = 0; i < jittered.length; i++) {
    const pkt = {
      place: DEFAULT_PLACE,
      bullets: [{ id: 1, pos: [i * 12, 0, 0], quat: [0, 0, 0, 1] }],
      missiles: [], crates: [], fx: [], enemies: [],
    };
    raw.receive(pkt, jittered[i]);
    paced.receive(pkt, jittered[i]);
  }
  const rawSteps = [], pacedSteps = [];
  let prevR = null, prevP = null;
  for (let ms = 1125; ms <= 1275; ms += 4.167) {
    const r = raw.samplePlace(DEFAULT_PLACE, ms)?.bullets?.[0]?.pos?.[0];
    const p = paced.samplePlace(DEFAULT_PLACE, ms)?.bullets?.[0]?.pos?.[0];
    if (prevR !== null && r !== undefined) rawSteps.push(r - prevR);
    if (prevP !== null && p !== undefined) pacedSteps.push(p - prevP);
    prevR = r; prevP = p;
  }
  const spread = arr => Math.max(...arr) - Math.min(...arr);
  assert.ok(spread(pacedSteps) < spread(rawSteps) * 0.5, `entityStream paced spread (${spread(pacedSteps).toFixed(3)}) stays tight vs raw (${spread(rawSteps).toFixed(3)})`);
});
