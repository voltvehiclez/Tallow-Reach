import { selectPocketObject } from './sim/targeting.js';
import { pickLockSurface } from "./render/target-picking.js";
// Entry point. Wires the systems together and runs the frame loop.
// Update order matches the prototype: input, flight, weapons, AI, projectiles, render.

import { renderer, scene, camera, stars, showPlace, stepScenery, updateScenery, forgetPlace } from "./render/scene.js";
import { dockedView, chaseView, shakeOffset, installCameraControls } from "./render/camera.js";
import { state, localPlayer, applySave, currentSave, newRootSave, saveCurrentGame, placeWorld } from "./state/state.js";
import { loadAutosave } from "./state/storage.js";
import { shipCameraScale } from "./render/models.js";
import { shipDef } from "./data/ships.js";
import { verticalFovForAspect } from "./data/camera.js";
import { installInput, syncControls } from "./core/input.js";
import { updateAudio, initAudio } from "./core/audio.js";
import { on, emit } from "./util/events.js";
import { createPlayer, setShip } from "./sim/player.js";
import { setWeapon, setSecondaryWeapon, refreshGuns } from "./sim/weapons.js";
import { pocketBoomCount } from "./sim/effects.js";
import { pocketPickCount, drainEFires } from "./sim/sfxlog.js";
import { enemyDef } from "./data/enemies.js";
import { WARP } from "./data/sectors.js";
import { loadPlace } from "./sim/places.js";
import { toggleLock } from "./sim/targeting.js";
import { launch, tryDock, resumeFromSave } from "./sim/session.js";
import { startWarp } from "./sim/sectors.js";
import { riftAction, restoreInstances } from "./sim/instances.js";
import { restoreWormholes } from "./sim/wormholes.js";
import { jumpRoute } from "./sim/navigation.js";
import { prepareGalaxySave } from "./sim/galaxy-session.js";
import { setupHud, updateHud } from "./ui/hud.js";
import { syncPointer } from "./ui/pointer.js";
import {
  setupMultiplayer, openChat, chatAway, isChatOpen,
  isMultiplayerScreenOpen, closeMultiplayer,
} from "./ui/multiplayer.js";
import { installJoinLink } from "./net/boot.js";
import { arriveGuest, leaveGuest, guestRecordOf, guestPlayers, applyGuestControls } from "./sim/multiplayer.js";
import { hostProfile, bundleFromProfile } from "./net/custody.js";
import { shipEntries } from "./net/ships.js";
import { createShipStream } from "./render/shipstream.js";
import { stationsOfWorld } from "./net/world-places.js";
import { requestWarp as netRequestWarp, requestDock as netRequestDock, isVisiting as netIsVisiting, isOn as isNetOn } from "./net/session.js";
import { enterPlace as simEnterPlace } from "./sim/places.js";
import * as THREE from "three";
import { setupMenu, openStationTab, closePanelPopovers } from "./ui/menu.js";
import { setupPause, setPause } from "./ui/pause.js";
import { setupMissionLog, updateDialogueClock, isFailureNoticeOpen, dismissFailureNotice } from "./ui/missionlog.js";
import { setupCampaign } from "./ui/campaign.js";
import "./sim/campaign-flight.js";
import { setupStarmap, openStarmap, closeStarmap, isStarmapOpen } from "./ui/starmap.js";
import { setupCargo, openCargo, closeCargo, dismissCargoLayer, isCargoOpen, canOpenCargo } from "./ui/cargo.js";
import { setupCache, closeCache, dismissCacheLayer, isCacheOpen } from "./ui/cache.js";
import { canPause, canOpenStarmap } from "./ui/overlays.js";
import { updateMenuView, menuView, resizeMenuView } from "./render/menuview.js";
import { updateOutfitting } from "./ui/outfitting.js";
import { refillPower } from "./sim/power.js";
import { refreshDrive } from "./sim/drive.js";
import { refreshShield } from "./sim/shield.js";
import { refreshHull } from "./sim/hull.js";
import { createSimClock, isSimulationPaused } from "./sim/step.js";
import { SIM_DT, MAX_FRAME_DT, AUTOSAVE_SECONDS } from "./data/simulation.js";
import { setupWarpFlash, updateWarpFlash } from "./ui/warpflash.js";
import { installCrashNotice, reportCrash } from "./ui/crash.js";
import { preloadAfterPaint } from "./render/gltf.js";
import { setupWarpStreaks, updateWarpStreaks } from "./render/warpfx.js";
import {
  installEnemyViews,
  updateEnemyViews,
  updateEntityViews,
  snapshotSimPoses,
  snapRenderedPlayer,
  renderPlayerPose,
} from "./render/views.js";

/* ------------------------------------------------------------------------- */
/* Slice 4: a visiting pilot has a ship in this world                          */
/* ------------------------------------------------------------------------- */

/**
 * `net/` cannot touch `state.players` (the layers point one way), so it asks for a record
 * on the bus and this is the only place that answers.
 *
 * The bundle is turned into the HALF of a profile a visitor is allowed to have
 * (`custody.hostProfile`: the travelled half, with no missions, flags or statistics, so
 * no story step can fire for a guest), and `sim/multiplayer.js` builds the ship.
 */
/* ------------------------------------------------------------------------- */
/* Slice 8a: where every pilot is, on the wire and on the glass                */
/* ------------------------------------------------------------------------- */

/**
 * The ship snapshot, wired once at boot.
 *
 * Three small joins, and each is here because `net/` and `render/` may not import each other:
 *
 *   `mp-ships-request`   the host's session asks what every pilot looks like; `net/ships.js`
 *                        turns the live records in `state.players` into the wire fields.
 *   `mp-ships`           the guest's session hands on what the host sent; the screen's own
 *                        `render/shipstream.js` keeps the buffer that becomes poses.
 *   `mp-state`           a session that ends forgets every friend at once, so a hull can never
 *                        outlive the connection that described it.
 */
const shipStream = createShipStream();
// Own ship needs its own interpolated buffer too — otherwise a 165 Hz guest sees its own hull at 24 Hz. Same timings but a shorter delay for responsiveness (60 ms vs 100 ms for other pilots).
const guestSelfStream = createShipStream({ delayMs: 35, samples: 8, staleMs: 1500, snapM: 50 });

/** Slice 8c: is this browser the guest whose own galaxy is frozen? */
function isGuestVisiting() {
  return !!state.away;
}

/* The own weapon-effects block: the sim-side counters arrive on the own ship entry; a counter that
 * advanced plays its sound once (a lost packet collapses two into one, never a backlog). Counters
 * that went BACKWARDS mean a fresh record on the host — re-baseline silently, never a salvo. */
const ownWxSeen = { shots: 0, missiles: 0, locks: 0, ore: 0, hits: 0, boosts: 0, warps: 0, bursts: 0 };
let ownWxBaselined = false;
function resetOwnWeaponWx() {
  for (const k of Object.keys(ownWxSeen)) ownWxSeen[k] = 0;
  ownWxBaselined = false;
}
const ownWxSfx = { shots: "cannon", missiles: "missile-fire", locks: "missile-lock", ore: "ore-gained", hits: "hit", boosts: "boost", warps: "warp-charge", bursts: "warp-burst" };
function applyOwnWeaponWx(entry) {
  // The beam is state, not events: it is drawn from the host's record exactly as the local sim would
  // leave it, so `render/views.js` and `core/audio.js` need no guest branch at all.
  const F = state.flight;
  if (F) {
    F.beamOn = entry.beamOn === true;
    const bs = entry.beamStart, be = entry.beamEnd;
    const toV3 = v => Array.isArray(v) ? new THREE.Vector3(v[0] || 0, v[1] || 0, v[2] || 0)
      : v && typeof v.x === "number" ? new THREE.Vector3(v.x, v.y, v.z) : null;
    const sb = toV3(bs), eb = toV3(be);
    if (sb) F.beamStart = sb;
    if (eb) F.beamEnd = eb;
    if (Number.isFinite(entry.mineFrac)) F.mineFrac = entry.mineFrac;
    // The lock ring and the cone follow the host's truth; the guest simulates no missiles.
    if (Number.isFinite(entry.cone)) F.coneAngle = entry.cone;
    const ML = F.missileLock || (F.missileLock = { target: null, t: 0, locked: false });
    if (Number.isFinite(entry.lockT)) ML.t = entry.lockT;
    ML.locked = entry.lockLocked === true;
    // A lock needs a target object; a stub is all the HUD reads (truthy). The host's record stays host-side.
    ML.target = entry.lockTarget === true ? (ML.target || { _net: true }) : null;
  }
  if (!ownWxBaselined) {
    // First picture after joining: adopt the host's counters without a salvo of stale sounds.
    for (const key of Object.keys(ownWxSeen)) ownWxSeen[key] = Math.max(0, Math.floor(Number(entry[key]) || 0));
    ownWxBaselined = true;
    return;
  }
  for (const key of Object.keys(ownWxSeen)) {
    const cur = Math.max(0, Math.floor(Number(entry[key]) || 0));
    const prev = ownWxSeen[key];
    if (cur < prev) { ownWxSeen[key] = cur; continue; }
    if (cur > prev) {
      const times = Math.min(cur - prev, 2);
      for (let i = 0; i < times; i++) {
        if (key === "warps") {
          try { emit("sfx", { name: "warp-charge", dur: WARP.charge }); } catch (e) { /* a missing audio path must not break the net path */ }
        } else {
          try { emit("sfx", { name: ownWxSfx[key] }); } catch (e) { /* a missing audio path must not break the net path */ }
        }
        // A wound on the guest goes through the same hurt bus a local wound does, so the HUD flash
        // and any hurt listener behave as if the guest's own sim had been the one to apply it.
        if (key === "hits") {
          try { emit("hurt", { shielded: (localPlayer()?.sh ?? 0) > 0, player: localPlayer() }); } catch (e) { /* the flash must not break the net path */ }
        }
      }
      ownWxSeen[key] = cur;
    }
  }
}

/** Apply one authoritative snapshot of our own ship (from the host) to the local record. */
function applySelfShip(entry) {
  const P = localPlayer();
  if (!P || !entry || typeof entry !== "object") return;
  const placeId = typeof entry.place === "string" ? entry.place.trim() : "";
  // Place first: entering a new pocket builds its scenery and sky.
  if (placeId && placeId !== state.place && placeId !== P.place) {
    try {
      const entered = simEnterPlace(placeId, P);
      if (!entered) {
        P.place = placeId;
        state.place = placeId;
        emit("place-entered", { id: placeId, player: P });
      }
    } catch (e) { /* a bad place id must not crash the frame */ }
  } else if (placeId && placeId !== P.place) {
    P.place = placeId;
  }
  // Position/rotation/velocity/throttle/docked/dead — the host's truth. Guest does not simulate.
  // `entry` may be a shipstream sample (pos is Vector3/Quaternion) or the raw wire entry (arrays).
  const pos = entry.pos;
  if (Array.isArray(pos)) P.pos.set(pos[0], pos[1], pos[2]);
  else if (pos && typeof pos.x === "number") P.pos.copy(pos);
  const quat = entry.quat;
  if (Array.isArray(quat)) P.quat.set(quat[0], quat[1], quat[2], quat[3]);
  else if (quat && typeof quat.x === "number") P.quat.copy(quat);
  const vel = entry.velocity || entry.vel || entry.v;
  if (Array.isArray(vel)) P.v.set(vel[0], vel[1], vel[2]);
  else if (vel && typeof vel.x === "number") P.v.copy(vel);
  P.thr = Number.isFinite(entry.throttle) ? entry.throttle : P.thr;
  const wasDocked = P.docked === true;
  P.docked = entry.docked === true;
  P.dead = entry.dead === true;
  P.boost = entry.boost === true;
  if (Number.isFinite(entry.shake)) P.shake = Math.max(0, Math.min(1, Number(entry.shake) || 0));
  // The station card and the reticle follow the host's dock decisions, like a local dock: this is
  // what puts the guest in the station screen (and its own suitcase on it) when the host docks it.
  if (P.docked !== wasDocked) {
    try { emit(P.docked ? "docked" : "launched", { player: P }); } catch (e) { /* UI must never break the net path */ }
  }
  if (Number.isFinite(entry.hull)) {
    const max = Number(P.hullMax) || 0;
    P.hull = max > 0 ? Math.max(0, entry.hull * max) : (entry.hull > 0 ? max || 100 : 0);
  }
  if (Number.isFinite(entry.shield)) {
    const max = Number(P.shMax) || 0;
    P.sh = max > 0 ? Math.max(0, entry.shield * max) : 0;
  }
  applyOwnWeaponWx(entry);
  // The warp the host is flying for us: the same timings the local sim would keep, mirrored so the
  // streaks, camera widen and flash overlay run unchanged (they all read `state.warp`).
  {
    const wantWarp = entry.warpOn === true;
    if (wantWarp) {
      const fx = Number.isFinite(entry.warpFx) ? Math.max(0, Math.min(1, entry.warpFx)) : 0;
      const flash = Number.isFinite(entry.warpFlash) ? Math.max(0, Math.min(1, entry.warpFlash)) : 0;
      const w = P.warp || (P.warp = { from: "", to: "", t: 0, fx: 0, flash: 0, switched: false, steer: { x: 0, y: 0 } });
      w.fx = fx; w.flash = flash;
    } else if (P.warp) {
      P.warp = null;
    }
  }
  // A warp that moved us is a teleport, not a smear — snap the camera this frame.
  const curPos = Array.isArray(entry.pos) ? new THREE.Vector3(entry.pos[0], entry.pos[1], entry.pos[2]) : entry.pos;
  if (P.snap !== true && (P.place !== placeId || (curPos && P.pos.distanceTo(curPos) > 50))) {
    P.snap = true;
  }
}

/* Stash our own galaxy place while visiting, so Go home can restore the sky. Slice 8c choice A: runtime only. */
function stashGuestHome() {
  if (state.guestHome) return;
  state.guestHome = {
    place: state.place,
    worldPlace: state.worldState ? state.worldState.place : state.place,
  };
}
function restoreGuestHome() {
  const home = state.guestHome;
  if (!home) return;
  const id = home.place || home.worldPlace;
  state.guestHome = null;
  if (typeof id === "string" && id) {
    const P = localPlayer();
    try { simEnterPlace(id, P); } catch (e) {}
    showPlace(state.place);
    if (P) { P.docked = false; P.warp = null; }
  }
  shipStream.clear();
}

function installMultiplayerShips() {
  on("mp-ships-request", request => {
    if (!request) return;
    request.ships = shipEntries(state.players, {
      localIndex: state.localPlayerIndex,
      localName: request.name || "",
    });
    request.answered = true;
  });
  on("mp-ships", ({ ships, at } = {}) => shipStream.receive(ships, at));
  on("mp-self-ship", ({ ship, at } = {}) => {
    if (!isGuestVisiting() || !ship) return;
    // Own ship is also a stream (see guestSelfStream) so a 165 Hz guest does not see its
    // own hull at 24 Hz. The pose is interpolated like any other pilot, but with a shorter
    // delay (60 ms vs 100 ms) so controls feel less laggy; the frame loop samples it each frame.
    guestSelfStream.receive([ship], at || Date.now());
  });
  on("mp-away-changed", ({ away } = {}) => {
    if (away) stashGuestHome();
    else { resetOwnWeaponWx(); restoreGuestHome(); }
  });
  on("mp-state", snapshot => {
    if (!snapshot || !snapshot.on) {
      shipStream.clear();
      guestSelfStream.clear();
      if (snapshot && !snapshot.on && state.guestHome) restoreGuestHome();
    }
  });
  on("mp-host-left", () => {
    if (state.guestHome) restoreGuestHome();
  });
}

/*
 * Slice 8c entities, rebuilt: the host's pocket arrives as data; the guest draws it and
 * simulates nothing.
 *
 *   `mp-entities-request`  the host's session asks what is in each pocket a visitor occupies;
 *                          answered synchronously, like the suitcase and the ship list
 *   `mp-entities`          per pocket: bullets, missiles, crates and fx records in `state.world`'s
 *                          own lists, as plain objects with stable identities — the views'
 *                          between-ticks interpolation works on them exactly as it does on the
 *                          host's own, and a record the next snapshot no longer names is dropped
 */
function installMultiplayerEntities() {
  // Host: answer what is in every pocket that holds a visitor, so the guest sees the same sky.
  on("mp-entities-request", request => {
    if (!request || !Array.isArray(request.places)) return;
    const wanted = new Set();
    for (const g of guestPlayers()) if (g?.place) wanted.add(g.place);
    request.places.length = 0;
    const vec = v => [v.x, v.y, v.z];
    const quat = q => (q ? [q.x, q.y, q.z, q.w] : [0, 0, 0, 1]);
    for (const placeId of wanted) {
      const W = placeWorld(placeId);
      if (!W) continue;
      const bullets = (W.bullets || []).map(e => ({
        id: e.id, pos: vec(e.pos), quat: quat(e.quat),
        colour: Number.isFinite(e.colour) ? e.colour : Number.isFinite(e.color) ? e.color : 0xffcc66,
      }));
      const missiles = (W.missiles || []).map(e => ({ id: e.id, pos: vec(e.pos), quat: quat(e.quat) }));
      const crates = (W.crates || []).map(e => ({ id: e.id, pos: vec(e.pos), quat: quat(e.quat), item: e.item || "salv" }));
      const fx = (W.fx || []).map(e => ({
        id: e.id, pos: vec(e.pos), col: Number.isFinite(e.col) ? e.col : 0xffaa00,
        size: e.size || 1, l: Number.isFinite(e.l) ? e.l : 0, t: Number.isFinite(e.t) ? e.t : 1,
      }));
      // Enemies, from the host's first-hand record: the guest draws and locks them exactly as the
      // host does (views read `def`, F-lock reads `W.enemies`), while every wound stays host-side.
      const enemies = (W.enemies || []).map(e => ({
        id: e.id, def: e.def, friendly: e.friendly === true, boost: e.boosting === true,
        pos: vec(e.pos), quat: quat(e.quat), v: vec(e.v || { x: 0, y: 0, z: 0 }),
        hp: Number.isFinite(e.hp) ? e.hp : 0, mx: Number.isFinite(e.mx) ? e.mx : 0,
      }));
      // Always answer for a pocket with a visitor — even with empty lists, so the guest clears
      // what is no longer there.
      request.places.push({ place: placeId, bullets, missiles, crates, fx, booms: pocketBoomCount(placeId), enemies, picks: pocketPickCount(placeId), efires: drainEFires(placeId) });
    }
    request.answered = true;
  });
  // Guest: apply the pocket we are in. Records are kept per id so the between-ticks
  // interpolation has an identity to hold on to; the host's sim is the clock.
  const syncList = (list, incoming, kind, make) => {
    const incomingArr = Array.isArray(incoming) ? incoming : [];
    const seen = new Set();
    for (const raw of incomingArr) {
      if (!raw || typeof raw !== "object") continue;
      const id = Math.floor(Number(raw.id) || 0);
      seen.add(id);
      let rec = null;
      for (const r of list) if (r && r._net === true && r.id === id) { rec = r; break; }
      if (!rec) {
        rec = make(raw) || { id, kind, pos: new THREE.Vector3(), _net: true };
        rec._net = true;
        rec.id = id;
        rec.kind = kind;
        list.push(rec);
      }
      rec.pos.set(raw.pos?.[0] || 0, raw.pos?.[1] || 0, raw.pos?.[2] || 0);
      if (raw.quat && rec.quat) rec.quat.set(raw.quat[0] || 0, raw.quat[1] || 0, raw.quat[2] || 0, raw.quat[3] ?? 1);
      if (rec.quat && raw.quat) rec.quat.normalize();
      if (kind === "bullet") rec.colour = raw.colour;
      else if (kind === "crate") rec.item = typeof raw.item === "string" ? raw.item : "salv";
      else if (kind === "fx") {
        rec.col = raw.col; rec.size = raw.size; rec.l = raw.l; rec.t = raw.t;
      }
    }
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i] && list[i]._net === true && !seen.has(list[i].id)) list.splice(i, 1);
    }
  };
  // A hostile record to draw, lock and lead — the host's first-hand truth, never the guest's sim.
  const makeEnemy = raw => ({
    id: 0, kind: "enemy", def: "raider", place, _net: true,
    pos: new THREE.Vector3(), quat: new THREE.Quaternion(), v: new THREE.Vector3(),
    hp: 0, mx: 0, friendly: false, boosting: false,
  });

  // How many pocket explosions this screen has already rumbled for, per place — a counter that
  // went backwards means a rebooted host, so re-baseline silently rather than rumble in a loop.
  const boomSeen = new Map();
  const pickSeen = new Map();
  on("mp-entities", ({ place, bullets, missiles, crates, fx, booms, enemies, picks, efires } = {}) => {
    if (!place || typeof place !== "string" || !isGuestVisiting()) return;
    if (place !== state.place) return;   // entities only for the pocket this screen is in
    const W = placeWorld(place);   // the synced records; shooters that died this packet are still here

    // A pickup chime is what a single-player screen would have heard — same pocket gate, same blip.
    const pick = Math.floor(Number(picks) || 0);
    const prevPick = pickSeen.get(place) ?? pick;
    if (pick < prevPick) pickSeen.set(place, pick);
    else if (pick > prevPick) {
      const times = Math.min(pick - prevPick, 2);
      for (let i = 0; i < times; i++) {
        try { emit("sfx", { name: "pickup" }); } catch (e) {}
      }
      pickSeen.set(place, pick);
    }
    // Gunfire is only for ears in the pocket: each entry is a shooter's id — check our own range.
    if (Array.isArray(efires) && efires.length && localPlayer()) {
      const me = localPlayer().pos;
      let heard = 0;
      for (const id of efires) {
        if (heard >= 2) break;
        const rid = Math.floor(Number(id) || 0);
        const shooter = W.enemies.find(r => r && r.id === rid);
        // Distance to *this screen's* pilot, the same gate the host uses for its own local ear —
        // just measured from our own ship instead of the host's.
        const hr = shooter ? enemyDef(shooter.def)?.hearRange ?? 0 : 0;
        if (shooter && hr > 0 && me.distanceToSquared(shooter.pos) <= hr * hr) {
          try { emit("sfx", { name: "enemy-fire" }); } catch (e) {}
          heard += 1;
        }
      }
    }
    // A rumble is what a single-player screen would have heard: the pocket just blew something up.
    const boom = Math.floor(Number(booms) || 0);
    const prevBoom = boomSeen.get(place) ?? boom;
    if (boom < prevBoom) boomSeen.set(place, boom);
    else if (boom > prevBoom) {
      const times = Math.min(boom - prevBoom, 2);
      for (let i = 0; i < times; i++) {
        try { emit("sfx", { name: "explosion" }); } catch (e) {}
      }
      boomSeen.set(place, boom);
    }
    try {
      syncList(W.bullets, bullets, "bullet", raw => ({
        id: 0, kind: "bullet", pos: new THREE.Vector3(), quat: new THREE.Quaternion(), colour: raw.colour, _net: true,
      }));
      syncList(W.missiles, missiles, "missile", () => ({
        id: 0, kind: "missile", pos: new THREE.Vector3(), quat: new THREE.Quaternion(), _net: true,
      }));
      syncList(W.crates, crates, "crate", () => ({
        id: 0, kind: "crate", pos: new THREE.Vector3(), quat: new THREE.Quaternion(), item: "salv", _net: true,
      }));
      syncList(W.fx, fx, "fx", () => ({
        id: 0, kind: "fx", pos: new THREE.Vector3(), col: 0xffaa00, size: 1, l: 0, t: 1, _net: true,
      }));
      syncList(W.enemies, enemies, "enemy", makeEnemy);
      // The per-record fields syncList does not know, applied in place after the positional ones.
      for (const rec of W.enemies) {
        if (!rec || rec._net !== true) continue;
        const raw = Array.isArray(enemies) ? enemies.find(r => r && Math.floor(Number(r.id) || 0) === rec.id) : null;
        if (!raw) continue;
        rec.def = typeof raw.def === "string" && raw.def ? raw.def : rec.def;
        rec.friendly = raw.friendly === true;
        rec.boosting = raw.boost === true;
        rec.hp = Number.isFinite(raw.hp) ? raw.hp : rec.hp;
        rec.mx = Number.isFinite(raw.mx) ? raw.mx : rec.mx;
        rec.v = rec.v && typeof rec.v.set === "function" ? rec.v : new THREE.Vector3();
        rec.v.set(Number(raw.v?.[0]) || 0, Number(raw.v?.[1]) || 0, Number(raw.v?.[2]) || 0);
      }
    } catch (e) { /* a broken pocket must never take the screen down */ }
  });
}

function installMultiplayerVisitors() {
  on("mp-guest-arrive", ({ guestId, name, bundle } = {}) => {
    if (!bundle) return;
    const profile = hostProfile(bundle);
    arriveGuest({ guestId, name, profile, place: bundle.homeStation || null });
  });
  on("mp-guest-left", ({ guestId } = {}) => {
    leaveGuest(guestId);
  });
  // **Slice 8b: the guest's asking reaches its ship.** `net/` may not import `sim/` (the layers point
  // one way) and the peer id is already resolved there, so the session hands over `{ guestId, input }`
  // and this is the one place that writes it into the visiting record. A message for a pilot whose
  // record has gone is dropped by the sim itself, which is the right place to know that.
  on("mp-guest-controls", ({ guestId, input } = {}) => {
    applyGuestControls(guestId, input);
  });
  // **Slice 8c: the guest asks the host to warp or dock its own ship.** Same one-way rule:
  // net resolves the peer to a guestId and emits, sim decides and runs the action. A request
  // for an unknown pilot is ignored here too.
  on("mp-guest-warp", ({ guestId, to } = {}) => {
    const P = guestRecordOf(guestId);
    if (!P || !to) return;
    try { startWarp(P, to); } catch (e) {}
  });
  on("mp-guest-dock", ({ guestId } = {}) => {
    const P = guestRecordOf(guestId);
    if (!P) return;
    // One button, like a local dock: in flight it docks, docked it launches. A visitor cannot
    // `launch()` locally (the teleport-to-launch-point bug), so both directions ride the host's
    // sim — `docked` follows on the next snapshot.
    try { if (P.docked) launch(P, P.profile); else tryDock(P, P.profile, state.worldState); } catch (e) {}
  });
  // The host's write-back asks what the visiting pilot is NOW. Answering synchronously
  // is deliberate: the session needs the live profile in the same call that builds the
  // suitcase, and an async answer would need a second timer for no gain.
  on("mp-guest-bundle-request", request => {
    const P = guestRecordOf(request?.guestId);
    if (!P?.profile) return;
    request.profile = P.profile;
    request.lockers = lockersForGuest(P.profile, P.guestId);
    request.answered = true;
  });
}

/**
 * The guest's station lockers, read from the host's world.
 *
 * A guest's lockers live in the host's `world.stationStores`, keyed by station, with no
 * record of which owner each stack belongs to — the host's own stock sits in the same
 * places. So the host does not invent a split: it sends the stacks at the stations the
 * guest's suitcase already named, which is the set the guest proved it owned on arrival.
 * Anything the guest gains on top travels in its HOLD (`profile.holds`), which is not
 * shared with anybody.
 */
function lockersForGuest(profile, guestId) {
  // The guest's own bundle, as this host stored it: `world.guests[guestId].bundle.lockers`
  // is the set it arrived with (already relocated to stations this world has). Reading
  // the host's `away` marker here would be the wrong pilot entirely — that is the HOST's
  // own trip. `guestRecord` stripped the guest's token from this copy, which is fine:
  // nothing here needs it.
  const bundle = state.worldState?.guests?.[guestId]?.bundle;
  const recorded = Array.isArray(bundle?.lockers) ? bundle.lockers : [];
  return recorded.map(locker => ({ ...locker }));
}

// --- Boot ------------------------------------------------------------------

// First, so that anything which breaks below — or later, in a listener or a timer — is said on
// screen instead of only in the browser's console (see ui/crash.js).
installCrashNotice();

document.body.prepend(renderer.domElement);
applySave(loadAutosave(prepareGalaxySave) || prepareGalaxySave(newRootSave()));
// A save can be from inside a rift (slice 14b): its run has to be a place again before anything
// loads that place. A save can also be standing in a simple wormhole pocket (slice 14c): the pocket
// has to be a place before its scenery is built. `resumeFromSave()` below puts the pilot back in it.
restoreInstances();
if (state.mode !== "campaign") restoreWormholes();
createPlayer();
setShip(state.profile.ship);
loadPlace(state.place);
refillPower();   // start docked, so the cells are full
refreshDrive();  // speed and turn come from the fitted thrusters
refreshShield(); // and shield strength comes from the fitted shields
refreshHull();   // and Hull HP come from the fitted hull module
refreshGuns();   // and the primary bays decide what fires on left click

// Browsers only allow sound after a user gesture. The start button used to be
// the only thing that started it, so a save that resumes out in space (start
// screen skipped) was silent forever. Any click or key now starts/resumes it.
addEventListener("pointerdown", () => initAudio(), { passive: true });
addEventListener("keydown", () => initAudio());

setupHud();
setupMenu({ beforeStart: () => modelLoading });
resumeFromSave();   // prepares the ship; the start screen still owns the panel

// Save where the pilot is, so quitting mid-flight returns them to that spot.
// Docking, warping and menu clicks already save; this covers simply flying off
// and closing the tab. `pagehide` and the hidden-tab event are the ones browsers
// actually deliver on close; the timer bounds what a crash can lose.
const saveResumePoint = () => {
  if (!state.ui.intro) saveCurrentGame();
};
addEventListener("pagehide", saveResumePoint);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveResumePoint();
});
setInterval(saveResumePoint, AUTOSAVE_SECONDS * 1000);
setupWarpStreaks();
installEnemyViews();   // one mesh per entity: hostiles, shots, crates, sparks, rocks, the ship
setupWarpFlash();
setupPause();
setupMultiplayer();
installMultiplayerVisitors();
installMultiplayerShips();
installMultiplayerEntities();
setupMissionLog();
setupCampaign();
setupStarmap();
setupCargo();
setupCache();
installInput();
syncControls();   // the control record starts in sync with the (unpressed) keys
installCameraControls(state.freeCam, {
  canStart: () =>
    !localPlayer().docked && !state.paused && !isStarmapOpen() && !isCargoOpen() && !isCacheOpen() && !isChatOpen(),
  getScale: () => shipCameraScale(state.profile.ship),
});

on("place-entered", ({ id }) => showPlace(id));
// A run that ends is never coming back, so its scenery and its sky go with it, and the pocket the
// pilot is back in shows again (already `state.place`: `destroyInstance` moves them before it emits).
// `render/` is not allowed to know when a run ends, so the bus says so and this is the only place
// that acts on it.
on("instance-closed", ({ id }) => {
  forgetPlace(id);
  showPlace(state.place);
});
// A simple wormhole pocket that despawns (it faded while nobody was in it, or the pilot warped off
// a faded one) takes its scenery, its sky and its door with it.
on("wormhole-gone", ({ id }) => {
  forgetPlace(id);
  showPlace(state.place);
});
// A load replaces the runs of the save before it; their scenery goes with them.
on("instances-forgotten", ({ ids }) => {
  for (const id of ids) forgetPlace(id);
});
showPlace(state.place);

// --- Actions (key and mouse bindings, see core/input.js) -------------------
on("navigation-select", object => {
  const P = localPlayer();
  if (P && state.ui.navigation && !state.paused && !P.docked && !state.warp) selectPocketObject(object, P);
});

on("action", ({ name, repeat, to: nameTo, key }) => {
  const pauseKey = key !== "Escape";
  const playing = !state.ui.intro && !localPlayer().docked && !state.paused && !isStarmapOpen() &&
    !isCargoOpen() && !isCacheOpen() && !isChatOpen();
  switch (name) {
    case "navigation":
      if (playing && !repeat) emit("navigation-toggle");
      break;
    case "lock":
      if (playing && !repeat) {
        const aim = cameraAim.set(0, 0, -1).applyQuaternion(camera.quaternion);
        state.aimOrigin = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
        Object.assign(state.aimDirection, { x: aim.x, y: aim.y, z: aim.z });
        toggleLock(localPlayer(), pickLockSurface(scene, camera));
      }
      break;
    case "primary:1": case "primary:2": case "primary:3": case "primary:4": case "primary:5":
      if (playing && !repeat) setWeapon(Number(name.split(":")[1]) - 1);
      break;
    case "secondary:1": case "secondary:2": case "secondary:3": case "secondary:4": case "secondary:5":
      if (playing && !repeat) setSecondaryWeapon(Number(name.split(":")[1]) - 1);
      break;
    case "dock":
      if (playing && !state.warp) {
        if (isGuestVisiting()) netRequestDock();
        else tryDock();
      }
      break;
    case "rift":
      // Step 14: one deliberate press goes in or out of a wormhole — into a rift door that is
      // within range, or out through the instance's own way out. Never by contact. Beside a run's
      // canister the same press opens the trade (ui/cache.js), and pressing it again puts it away:
      // the pilot's hands are on the cargo, so R stays the canister's key until they are done.
      // Slice 8c: a guest's rift is not simulated locally — the host owns rifts/wormholes.
      // Pressing R while visiting does nothing (does not affect host either).
      if (isGuestVisiting()) break;
      if (repeat) break;
      if (isFailureNoticeOpen()) { dismissFailureNotice(); break; }
      if (isCacheOpen()) closeCache();
      else if (playing && !state.warp) riftAction(localPlayer());
      break;
    case "starmap":
      if (!repeat) {
        if (isStarmapOpen()) closeStarmap();
        else if (canOpenStarmap()) openStarmap();
      }
      break;
    case "cargo": {
      // In space: the ship's own inventory, in the same tiles as the station tab.
      // Docked: the panel is already on screen, so the key switches it to Inventory.
      // On the title screen there is no pilot, and the key does nothing.
      if (repeat) break;
      const P = localPlayer();
      if (isCargoOpen()) closeCargo();
      else if (P && P.docked) openStationTab("i");
      else if (canOpenCargo(P)) openCargo();
      break;
    }
    case "route:jump":
      if (!repeat && playing) jumpRoute(localPlayer());
      break;
    case "travel":
      // The map only proposes a destination. The sim rechecks the direct link,
      // costs and requirements, then runs the existing warp animation on success.
      if (!state.ui.intro && !state.paused && !localPlayer().docked) {
        if (isGuestVisiting()) netRequestWarp(nameTo);
        else startWarp(localPlayer(), nameTo);
      }
      break;
    case "chat":
      // Step 16 slice 3: Enter opens the chat box, and only while multiplayer is on and
      // the player is actually flying or docked in a world (not on the title screen).
      if (repeat || state.ui.intro) break;
      if (isChatOpen()) break;
      openChat();
      break;
    case "pause":
      // The multiplayer screen sits on top of whatever opened it, so it gets Esc first: one
      // press puts it away and leaves the pause card (or the title) underneath. Playtest 5:
      // Esc in that screen used to fall through to the pause chain and do nothing at all.
      if (isMultiplayerScreenOpen()) {
        closeMultiplayer();
        break;
      }
      if (isStarmapOpen()) {
        closeStarmap();
        if (name === "pause" && pauseKey) {
          if (state.ui.navigation) emit("navigation-toggle", false);
          setPause(true);
        }
      } else if (isCargoOpen()) {
        // Esc dismisses an open cargo popover or held stack first, then closes the hold; P pauses.
        if (!pauseKey && dismissCargoLayer()) break;
        closeCargo();
        if (name === "pause" && pauseKey) {
          if (state.ui.navigation) emit("navigation-toggle", false);
          setPause(true);
        }
      } else if (isCacheOpen()) {
        // The same for a canister: Esc puts back a held stack or popover first, then closes.
        if (!pauseKey && dismissCacheLayer()) break;
        closeCache();
        if (name === "pause" && pauseKey) {
          if (state.ui.navigation) emit("navigation-toggle", false);
          setPause(true);
        }
      } else if (state.ui.navigation) {
        emit("navigation-toggle", false);
        if (pauseKey) setPause(true);
      } else if (!pauseKey && closePanelPopovers({ returnHeld: true, dismissLeft: true })) {
        // Esc dismisses docked popovers/held stacks first, then a toggleable left window.
      } else if (canPause()) {
    // Opening the pause card puts the chat box away: both cannot own the keyboard.
    chatAway();
    setPause(!state.paused);
  }
      break;
  }
});

addEventListener("resize", () => {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = verticalFovForAspect(camera.aspect);
  camera.updateProjectionMatrix();
  resizeMenuView();
});

// --- Frame loop ------------------------------------------------------------

let lastFrameAt = performance.now();
const cameraAim = camera.position.clone();
const simClock = createSimClock(undefined, {
  beforeStep: () => {
    snapshotSimPoses();
    stepScenery(SIM_DT);
  },
  afterStep: snapRenderedPlayer,
});

// When this browser is hosting, the world must keep running even if the tab is
// hidden or minimised — otherwise the guest sees a freeze. `requestAnimationFrame`
// stalls in a hidden tab, so a worker (not throttled) drives the same clock
// from wall time. It is cheap: one tick per SIM_DT (~60 Hz) and only while a
// session is on. Fallback to setInterval if workers are blocked.
let hostTick = null;
let hostWorker = null;
let hostTickAt = 0;
function advanceHostClock() {
  if (!isNetOn() || isSimulationPaused()) return;
  const now = performance.now();
  const dt = (now - hostTickAt) / 1000;
  hostTickAt = now;
  if (!Number.isFinite(dt) || dt <= 0) return;
  // rAF is driving the sim at 60 Hz while the tab is visible: stepping here too would run the
  // world at double speed. Only step when rAF has actually stalled (hidden/starved tab).
  if (now - lastFrameAt <= 80) return;
  // Catch up by stepping in MAX_FRAME_DT chunks in wall time, however late the tick is — a
  // throttled 1 Hz host keeps the world exactly on real time for its guests. Clamp the catch-up
  // so a long sleep never simulates more than five seconds in one go.
  let remaining = Math.min(dt, 5);
  while (remaining > 1e-9) {
    const chunk = Math.min(remaining, MAX_FRAME_DT);
    simClock.advance(chunk);
    remaining -= chunk;
  }
  // The host-keepalive-tick is what broadcasts ships + entities from this path (the session
  // self-throttles to the ship-stream rate). Without it the guest saw a frozen sky/world while
  // the host was tabbed out.
  try { emit("host-keepalive-tick", {}); } catch (e) {}
}
let hostWorkerUrl = null;
function startHostTick() {
  if (hostTick || hostWorker) return;
  hostTickAt = performance.now();
  try {
    const blob = new Blob(["setInterval(()=>postMessage('tick'),16)"], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    hostWorkerUrl = url;
    hostWorker = new Worker(url);
    hostWorker.onmessage = advanceHostClock;
    hostWorker.onerror = () => {
      try { hostWorker.terminate(); } catch (e) {}
      hostWorker = null;
      if (hostWorkerUrl) { try { URL.revokeObjectURL(hostWorkerUrl); } catch (e) {} hostWorkerUrl = null; }
      hostTick = setInterval(advanceHostClock, Math.round(SIM_DT * 1000));
      if (typeof hostTick?.unref === "function") hostTick.unref();
    };
  } catch (e) {
    hostTick = setInterval(advanceHostClock, Math.round(SIM_DT * 1000));
    if (typeof hostTick?.unref === "function") hostTick.unref();
  }
}
function stopHostTick() {
  if (hostWorker) { try { hostWorker.terminate(); } catch (e) {} hostWorker = null; }
  if (hostWorkerUrl) { try { URL.revokeObjectURL(hostWorkerUrl); } catch (e) {} hostWorkerUrl = null; }
  if (hostTick) { clearInterval(hostTick); hostTick = null; }
}
on("mp-state", snap => { if (snap?.on) startHostTick(); else stopHostTick(); });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && isNetOn()) startHostTick();
});
// Blur also stalls rAF on some window managers (clicking to second monitor).
addEventListener("blur", () => { if (isNetOn()) startHostTick(); });
addEventListener("focus", () => {
  // Let rAF take over again; keep tick for a moment to avoid gap on focus switch.
  setTimeout(() => { if (!document.hidden && hostTickAt && performance.now() - lastFrameAt < 200) stopHostTick(); }, 500);
});

/**
 * One frame. Split from `frame` below so that anything it throws can be caught without stopping the
 * loop: the next frame is asked for first, then the work is tried, then — if the work broke — the
 * scene is drawn anyway and the problem is said on screen. Without that, a single bad frame leaves
 * the last good picture frozen on the glass with a live loop behind it, which plays as a dead game.
 */
function drawFrame(now) {
  const dt = Math.min(MAX_FRAME_DT, (now - lastFrameAt) / 1000);
  lastFrameAt = now;

  // Dialogue lines read themselves out on their own clock, even while the
  // dialogue's own pause holds the world still.
  updateDialogueClock(dt);

  // The title screen has its own cinematic scene (the station turning with its
  // planet behind it), so it never shows the last game view; nothing simulates
  // behind it. The pause overlay freezes the game scene where it is.
  if (state.ui.intro) {
    updateMenuView(dt);
    const menu = menuView();
    renderer.render(menu.scene, menu.camera);
    return;
  }
  if (isSimulationPaused()) {
    renderer.render(scene, camera);
    return;
  }

  const P = localPlayer(),
    F = state.flight;

  updateAudio({
    time: state.time,
    docked: P.docked,
    thr: P.thr,
    boost: P.boost,
    hullFrac: P.hull / P.hullMax,
    beamOn: F.beamOn,
    mineFrac: F.mineFrac,
  });

  // Lock uses the previous rendered camera direction, just as before 8a.
  if (!P.docked) {
    const aim = cameraAim.set(0, 0, -1).applyQuaternion(camera.quaternion);
    Object.assign(state.aimDirection, { x: aim.x, y: aim.y, z: aim.z });
  }
  simClock.advance(dt);
  // Guest's own ship is a stream too (see installMultiplayerShips) — otherwise a 165 Hz screen jitters at 24 Hz. Apply its interpolated pose before rendering so the camera chases the smoothed position, not the last raw packet.
  if (isGuestVisiting()) {
    const selfPoses = guestSelfStream.sample(Date.now());
    if (selfPoses.length) applySelfShip(selfPoses[0]);
  }
  const alpha = simClock.alpha();
  updateEnemyViews(alpha);    // interpolate each hostile's mesh between 60 Hz ticks
  // Slice 8a: every other pilot. A host draws its visiting records straight from `state.players`
  // (no wire at all); a guest draws what the host sent, `SHIP_STREAM.delayMs` in the past.
  updateEntityViews(alpha, shipStream.sample());   // and every bullet, missile, crate, particle, rock and the ship
  updateWarpStreaks(dt);      // all three hide themselves when no warp is running
  updateWarpFlash();

  // A hit may have docked the player during the updates above.
  if (P.docked) {
    dockedView(state.time + alpha * SIM_DT);
  } else {
    chaseView(dt, P, state.freeCam, renderPlayerPose(P, alpha));
    updateHud(dt);
  }
  updateScenery(alpha);
  stars.position.copy(camera.position);

  const offset = shakeOffset(P, dt, shipDef(state.profile.ship)?.sc ?? 1);
  if (offset) camera.position.add(offset);
  renderer.render(scene, camera);
  if (offset) camera.position.sub(offset);

  // Draws its own canvas and does nothing unless the Outfitting tab is open.
  updateOutfitting(dt);
}

function frame(now) {
  requestAnimationFrame(frame);
  try {
    // One pointer at a time (playtest 25): the orange circle while the pilot steers, the system
    // cursor on the surfaces that take the stick. One comparison a frame.
    syncPointer();
    if (state.paused || isChatOpen()) {
      const c = localPlayer()?.controls;
      if (c) {
        c.pitch = 0; c.yaw = 0; c.roll = 0;
        c.throttle = 0; c.boost = false; c.fire = false; c.secondary = false;
      }
    }
    drawFrame(now);
  } catch (err) {
    reportCrash("frame", err);
    try {
      renderer.render(scene, camera);
    } catch (renderErr) {
      reportCrash("render", renderErr);
    }
  }
}

// Step 16 slice 3: a `?join=` link in the address bar is a join gesture on its own.
// Installed last so every screen it needs already exists; it asks the player before it
// touches anything (see net/boot.js).
installJoinLink();

// Draw the title first. Model decoding starts only after the browser has had
// a paint opportunity; Open World waits for the same background-load promise.
requestAnimationFrame(frame);
const modelLoading = preloadAfterPaint();
