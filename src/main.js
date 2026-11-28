import { selectPocketObject } from './sim/targeting.js';
import { pickLockSurface } from "./render/target-picking.js";
// Entry point. Wires the systems together and runs the frame loop.
// Update order matches the prototype: input, flight, weapons, AI, projectiles, render.

import { renderer, scene, camera, stars, showPlace, stepScenery, updateScenery, forgetPlace } from "./render/scene.js";
import { dockedView, chaseView, shakeOffset, installCameraControls } from "./render/camera.js";
import {
  state, localPlayer, applySave, currentSave, newRootSave, saveCurrentGame, placeWorld, msg,
  instanceAt, captureInstances, captureWormholes, clearInstances, clearWormholes,
} from "./state/state.js";
import { loadAutosave } from "./state/storage.js";
import { shipCameraScale } from "./render/models.js";
import { shipDef, shipTypeOf } from "./data/ships.js";
import { verticalFovForAspect } from "./data/camera.js";
import { installInput, syncControls, clearControls } from "./core/input.js";
import { updateAudio, initAudio } from "./core/audio.js";
import { uiSound } from "./core/audio.js";
import { on, emit } from "./util/events.js";
import { createPlayer, setShip } from "./sim/player.js";
import { setWeapon, setSecondaryWeapon, refreshGuns } from "./sim/weapons.js";
import { pocketBoomCount } from "./sim/effects.js";
import { pocketPickCount, drainEFires } from "./sim/sfxlog.js";
import { BULLET_COLOURS } from "./data/weapons.js";
import { WARP } from "./data/sectors.js";
import { DEFAULT_PLACE, isPlace, placeAt, setPlaceCatalog } from "./data/places.js";
import { loadPlace } from "./sim/places.js";
import { clearNetEntities } from "./sim/world.js";
import { toggleLock } from "./sim/targeting.js";
import { launch, tryDock, dockFailureReason, resumeFromSave } from "./sim/session.js";
import { syncSpeedFromVelocity } from "./sim/flight-instruments.js";
import { startWarp } from "./sim/sectors.js";
import { riftAction, restoreInstances, syncGuestInstance } from "./sim/instances.js";
import { restoreWormholes, syncGuestWormholes } from "./sim/wormholes.js";
import { jumpRoute } from "./sim/navigation.js";
import { setDestination } from "./state/destination.js";
import { prepareGalaxySave, syncGuestGalaxy } from "./sim/galaxy-session.js";
import { setupHud, updateHud } from "./ui/hud.js";
import { notify } from "./ui/notice.js";
import { syncPointer } from "./ui/pointer.js";
import {
  setupMultiplayer, openChat, chatAway, isChatOpen,
  isMultiplayerScreenOpen, closeMultiplayer,
} from "./ui/multiplayer.js";
import { installJoinLink } from "./net/boot.js";
import {
  arriveGuest,
  leaveGuest,
  guestRecordOf,
  guestPlayers,
  applyGuestControls,
  executeGuestAction,
  cancelGuestHeld,
  guestLockerSnapshot,
  guestProfileSnapshot,
  guestVisitStateSnapshot,
} from "./sim/multiplayer.js";
import { hostProfile } from "./net/custody.js";
import { shipEntries } from "./net/ships.js";
import { createShipStream } from "./render/shipstream.js";
import { createEntityStream, hasNetEntities, syncPocketEntities, syncPocketRocks, collectGuestPocketSfx } from "./render/entitystream.js";
import {
  requestWarp as netRequestWarp,
  requestDock as netRequestDock,
  requestGuestAction,
  isOn as isNetOn,
} from "./net/session.js";
import { SHIP_STREAM } from "./data/multiplayer.js";
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
import { syncHeldGhost, clearHeldGhost } from "./ui/inventory-ui.js";
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
const STREAM_PACE_MS = 1000 / SHIP_STREAM.hz;
const hrNow = (typeof performance === "object" && typeof performance?.timeOrigin === "number")
  ? (perfMs = performance.now()) => performance.timeOrigin + perfMs
  : () => Date.now();

const shipStream = createShipStream({ paceMs: STREAM_PACE_MS });
// Own ship and pocket entities buffer past at least two 24 Hz snapshots (`SHIP_STREAM.delayMs` = 100 ms)
// with arrival dejittering (`paceMs`) so high-refresh screens (165/240 Hz) interpolate continuously
// without running dry into hold-frames between packets.
const guestSelfStream = createShipStream({ delayMs: SHIP_STREAM.delayMs, samples: 8, staleMs: 1500, snapM: 80, paceMs: STREAM_PACE_MS });
// Projectiles (`cannon_basic` 900 m/s + ship speed = ~1200 m/s) travel ~50–150 m across 1–3 packets;
// snapM: 300 keeps cannon shots interpolating smoothly at 240 Hz while still snapping real teleports.
const entityStream = createEntityStream({ delayMs: SHIP_STREAM.delayMs, samples: 8, staleMs: 1500, snapM: 300, paceMs: STREAM_PACE_MS });
const boomSeen = new Map();
const pickSeen = new Map();

/** Slice 8c: is this browser the guest whose own galaxy is frozen? */
function isGuestVisiting() {
  return !!state.away;
}

let lastVisitShip = "";
let lastVisitShipAt = 0;
let lastVisitDockState = null;
let lastVisitDockAt = 0;
let dockStreamCaughtUp = true;
let latestSlotReqId = 0;
let lastVisitSnapshot = null;
let pendingNetPlace = "";
let lastGuestGeoSig = "";

function sendGuestLock(lock) {
  if (!isGuestVisiting()) return;
  if (!lock) { requestGuestAction({ op: "lock", kind: "clear" }); return; }
  if (lock.k === "e" && lock.o?.id) requestGuestAction({ op: "lock", kind: "enemy", id: String(lock.o.id) });
  else if (lock.k === "a") requestGuestAction({ op: "lock", kind: "rock", id: String(lock.o?._hostId || lock.o?.id || "") });
  else if (lock.k === "c" && lock.o?.id) requestGuestAction({ op: "lock", kind: "crate", id: String(lock.o.id) });
  else if (lock.k === "r" && lock.o?.id) requestGuestAction({ op: "lock", kind: "rift", id: String(lock.o.id) });
  else if (lock.k === "g" && lock.o?.id) requestGuestAction({ op: "lock", kind: "gate", id: String(lock.o.id) });
  else if (lock.k === "k" && lock.o?.id) requestGuestAction({ op: "lock", kind: "cache", id: String(lock.o.id) });
  else if (lock.k === "p") requestGuestAction({ op: "lock", kind: "pilot", id: String(lock.o?.id || lock.o?.guestId || "host") });
  else if (lock.k === "s" && lock.o?.feature) requestGuestAction({ op: "lock", kind: "station", id: String(lock.o.feature) });
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
    F.beamT = F.beamOn && Number.isFinite(entry.beamT) ? Math.max(0, entry.beamT) : 0;
    // The lock ring and the cone follow the host's truth; the guest simulates no missiles.
    if (Number.isFinite(entry.cone)) F.coneAngle = entry.cone;
    const ML = F.missileLock || (F.missileLock = { target: null, t: 0, locked: false });
    if (Number.isFinite(entry.lockT)) ML.t = entry.lockT;
    ML.locked = entry.lockLocked === true;
    // A lock needs a target object; a stub is all the HUD reads (truthy). The host's record stays host-side.
    ML.target = entry.lockTarget === true ? (ML.target || { _net: true }) : null;
  }
  const P = localPlayer();
  if (P?.power) {
    const cap = Math.max(0, Number(P.power.cap) || 0);
    if (cap > 0) {
      const pwr = Number.isFinite(entry.pwr) ? Math.max(0, Math.min(1, entry.pwr)) : 1;
      P.power.stored = pwr * cap;
    }
    P.power.draw = Number.isFinite(entry.pwrDraw) ? Math.max(0, entry.pwrDraw) : 0;
  }
  if (P && Number(P.enMax) > 0) {
    const ef = Number.isFinite(entry.enFrac) ? Math.max(0, Math.min(1, entry.enFrac)) : 1;
    P.en = ef * P.enMax;
  }
  if (state.hud) {
    state.hud.prompt = typeof entry.hint === "string" ? entry.hint : "";
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
  const prevPlace = P.place;
  const prevPos = P.pos.clone();
  const wasDocked = P.docked === true;
  const wasWarping = Boolean(P.warp);
  const streamDocked = entry.docked === true;
  if (lastVisitDockState !== null && !dockStreamCaughtUp) {
    if (streamDocked !== lastVisitDockState && Date.now() - lastVisitDockAt < 1500) {
      // Ignore pre-transition snapshots lingering in the buffered stream (e.g. a stale `docked: true`
      // pose right after `launch()`) so the ship never snaps back to station coordinates or freezes.
      return;
    }
    dockStreamCaughtUp = true;
  }
  const placeId = typeof entry.place === "string" ? entry.place.trim() : "";
  // Place first: entering a new pocket builds its scenery and sky. If a dynamic place
  // (`wh-...`, `inst-...`) arrives on the ship stream before `visit` has registered it,
  // defer `simEnterPlace` until `applyVisitSnapshot` installs the host catalog/instance.
  if (placeId && placeId !== state.place && placeId !== P.place) {
    if (isPlace(placeId)) {
      pendingNetPlace = "";
      try {
        const entered = simEnterPlace(placeId, P);
        if (!entered) {
          P.place = placeId;
          state.place = placeId;
          emit("place-entered", { id: placeId, player: P });
        }
      } catch (e) { /* a bad place id must not crash the frame */ }
    } else {
      pendingNetPlace = placeId;
    }
  } else if (placeId && placeId !== P.place && isPlace(placeId)) {
    P.place = placeId;
  }
  const shipType = typeof entry.ship === "string" ? entry.ship.trim() : "";
  const withinShipGrace = lastVisitShip && (Date.now() - lastVisitShipAt < 300);
  if (shipType && !withinShipGrace && P.ship !== shipType && state.profile) {
    const matchId = state.profile.ships?.includes(shipType)
      ? shipType
      : (shipTypeOf(state.profile.ship) === shipTypeOf(shipType) ? state.profile.ship : shipType);
    if (matchId && matchId !== P.ship) {
      if (matchId !== state.profile.ship && state.profile.ships?.includes(matchId)) {
        state.profile.ship = matchId;
      }
      setShip(matchId, P, state.profile);
      refillPower(P);
      refreshDrive(P);
      refreshShield(P);
      refreshHull(P);
      refreshGuns(P);
    }
  }
  if (prevPlace && P.place && prevPlace !== P.place) {
    if (P.flight) P.flight.lock = null;
    entityStream.forgetPlace(prevPlace);
    try { emit("place-changed", { from: prevPlace, to: P.place, player: P }); } catch (e) {}
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
  P.docked = streamDocked;
  P.dead = entry.dead === true;
  P.boost = entry.boost === true;
  if (P.docked) {
    P.v.set(0, 0, 0);
    P.thr = 0;
  }
  if (Number.isFinite(entry.shake)) P.shake = Math.max(0, Math.min(1, Number(entry.shake) || 0));
  // The station card and the reticle follow the host's dock decisions, like a local dock: this is
  // what puts the guest in the station screen (and its own suitcase on it) when the host docks it.
  if (P.docked !== wasDocked) {
    try { emit(P.docked ? "docked" : "launched", { player: P }); } catch (e) { /* UI must never break the net path */ }
    if (!P.docked) {
      if ((P.drive?.spd || 0) > 0) msg("Launched. Fly to the asteroid field.", 4);
      else msg("No thrusters fitted: the ship cannot move. Press G to dock and fit one.", 6);
    }
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
      const w = P.warp || (P.warp = { from: prevPlace || P.place || "", to: "", t: 0, fx: 0, flash: 0, switched: false, steer: { x: 0, y: 0 } });
      w.fx = fx; w.flash = flash;
    } else if (P.warp) {
      const warpFrom = P.warp.from || prevPlace;
      P.warp = null;
      if (wasWarping && warpFrom && P.place && warpFrom !== P.place) {
        try {
          const fromDef = placeAt(warpFrom), destDef = placeAt(P.place);
          if (fromDef && destDef) msg(`Warp: ${fromDef.n} to ${destDef.n}. ${destDef.d}`, 4);
        } catch (e) {}
      }
    }
  }
  syncSpeedFromVelocity(P, Boolean(P.warp));
  // A warp, dock/launch transition, or teleport jump must snap the camera instead of panning.
  if (
    P.snap !== true &&
    (prevPlace !== P.place || wasDocked !== P.docked || prevPos.distanceToSquared(P.pos) > 2500)
  ) {
    P.snap = true;
  }
}

/* Stash our own galaxy place + checked-out home save while visiting, so Go home can restore cleanly. */
function stashGuestHome() {
  if (state.guestHome) return;
  captureInstances();
  if (state.mode !== "campaign") captureWormholes();
  state.guestHome = {
    place: state.place,
    worldPlace: state.worldState ? state.worldState.place : state.place,
    docked: localPlayer()?.docked !== false,
    profile: state.profile ? JSON.parse(JSON.stringify(state.profile)) : null,
    worldState: state.worldState ? JSON.parse(JSON.stringify(state.worldState)) : null,
    galaxy: state.galaxy || null,
    shops: state.shops ? JSON.parse(JSON.stringify(state.shops)) : {},
    destination: state.ui?.destination ?? null,
  };
}
function restoreGuestHome() {
  const home = state.guestHome;
  clearNetEntities();
  shipStream.clear();
  guestSelfStream.clear();
  entityStream.clear();
  boomSeen.clear();
  pickSeen.clear();
  lastVisitShip = "";
  lastVisitShipAt = 0;
  lastVisitDockState = null;
  lastVisitDockAt = 0;
  dockStreamCaughtUp = true;
  latestSlotReqId = 0;
  lastVisitSnapshot = null;
  pendingNetPlace = "";
  lastGuestGeoSig = "";
  if (isCacheOpen()) closeCache({ localOnly: true });
  clearHeldGhost();
  state.ui.invHeld = null;
  if (!home) return;
  const id = home.place || home.worldPlace;
  state.guestHome = null;
  for (const instId of [...state.instances.keys()]) forgetPlace(instId);
  clearInstances();
  for (const whId of [...state.wormholes.keys()]) forgetPlace(whId);
  clearWormholes();
  if (home.profile) state.profile = home.profile;
  if (home.worldState) state.worldState = home.worldState;
  state.shops = home.shops ? JSON.parse(JSON.stringify(home.shops)) : {};
  setDestination(home.destination ?? null);
  if (home.galaxy) {
    state.galaxy = home.galaxy;
    setPlaceCatalog(home.galaxy);
  }
  restoreInstances();
  if (state.mode !== "campaign") restoreWormholes(true);
  const P = localPlayer();
  if (P && state.profile) {
    P.profile = state.profile;
    P.weapon = state.profile.pw;
    P.secondaryWeapon = state.profile.sw;
    P.missileStock = state.profile.msl;
    P.openCacheId = null;
  }
  if (typeof id === "string" && id) {
    const wasDocked = P?.docked === true;
    try { simEnterPlace(id, P); } catch (e) { console.error("[restoreGuestHome] enter place failed", e); }
    showPlace(state.place);
    if (P) {
      P.warp = null;
      P.docked = Boolean(home.docked);
      P.snap = true;
      if (state.profile?.ship) {
        setShip(state.profile.ship, P, state.profile);
        refillPower(P);
        refreshDrive(P);
        refreshShield(P);
        refreshHull(P);
        refreshGuns(P);
      }
      if (!state.ui.intro && P.docked !== wasDocked) {
        try { emit(P.docked ? "docked" : "launched", { player: P }); } catch (e) { console.error("[restoreGuestHome] event failed", e); }
      }
    }
  }
}

function syncGuestWorldGeography(visit) {
  if (!visit || typeof visit !== "object") return;
  if (visit.shops && typeof visit.shops === "object") {
    state.shops = JSON.parse(JSON.stringify(visit.shops));
  }
  const seed = Number.isFinite(visit.galaxy?.seed) ? visit.galaxy.seed >>> 0 : null;
  const connEpochs = Array.isArray(visit.connections) ? visit.connections.map(c => c?.epoch ?? 0).join(",") : "";
  const geoSig = `${seed ?? ""}|${connEpochs}`;
  let rebuiltGalaxy = false;
  if (seed !== null && geoSig !== lastGuestGeoSig) {
    lastGuestGeoSig = geoSig;
    syncGuestGalaxy(visit.galaxy, visit.connections || [], visit);
    rebuiltGalaxy = true;
  } else if (visit.galaxy && state.worldState?.galaxy) {
    if (visit.galaxy.knowledge && typeof visit.galaxy.knowledge === "object") {
      state.worldState.galaxy.knowledge = JSON.parse(JSON.stringify(visit.galaxy.knowledge));
    }
    if (Array.isArray(visit.connections)) {
      state.worldState.connections = JSON.parse(JSON.stringify(visit.connections));
    }
  }
  if (Array.isArray(visit.wormholes) && (rebuiltGalaxy || JSON.stringify(visit.wormholes) !== JSON.stringify(state.worldState?.wormholes || []))) {
    syncGuestWormholes(visit.wormholes);
  } else if (rebuiltGalaxy && state.worldState?.wormholes) {
    syncGuestWormholes(state.worldState.wormholes);
  }
  syncGuestInstance(visit.instance || null);
}

function applyVisitSnapshot(visit) {
  if (!isGuestVisiting() || !visit || !visit.profile || !visit.world) return;
  if (!state.guestHome && state.away) stashGuestHome();
  lastVisitSnapshot = visit;
  const P = localPlayer();
  const prevShip = state.profile?.ship || "";
  const prevLoadoutJson = JSON.stringify(state.profile?.loadout?.[prevShip] || null);
  const oldPw = state.profile?.pw || "1";
  const oldSw = state.profile?.sw || "1";
  const prevFailedIds = new Set((state.profile?.missions || []).filter(m => m?.failed).map(m => m.id));

  const nextWorld = JSON.parse(JSON.stringify(visit.world));
  if (state.worldState) {
    for (const key of ["base", "stationStores", "stationSlots", "board", "boards", "boardTimers", "missionState"]) {
      if (nextWorld[key] !== undefined) state.worldState[key] = nextWorld[key];
    }
    if (visit.place) state.worldState.place = visit.place;
  }

  const nextProf = JSON.parse(JSON.stringify(visit.profile));
  if (state.profile) {
    for (const key of Object.keys(state.profile)) {
      if (!(key in nextProf)) delete state.profile[key];
    }
    Object.assign(state.profile, nextProf);
  }
  if (visit.ackReqId > 0 && visit.ackReqId < latestSlotReqId) {
    if (state.profile) {
      state.profile.pw = oldPw;
      state.profile.sw = oldSw;
    }
  } else if (state.profile) {
    state.profile.pw = String((visit.pw ?? 0) + 1);
    state.profile.sw = String((visit.sw ?? 0) + 1);
  }

  state.ui.invHeld = visit.held ? { ...visit.held } : null;
  syncHeldGhost();
  syncGuestWorldGeography(visit);

  if (P && state.profile) {
    P.profile = state.profile;
    P.weapon = state.profile.pw;
    P.secondaryWeapon = state.profile.sw;
    P.missileStock = state.profile.msl ?? 0;

    const nextShip = state.profile.ship || "";
    const nextLoadoutJson = JSON.stringify(state.profile.loadout?.[nextShip] || null);
    if (nextShip) {
      lastVisitShip = nextShip;
      lastVisitShipAt = Date.now();
      if (nextShip !== prevShip || nextLoadoutJson !== prevLoadoutJson || P.ship !== nextShip) {
        setShip(nextShip, P, state.profile);
      }
    }
    const prevPowerStored = P.power?.stored;
    const prevPowerDraw = P.power?.draw;
    const prevEn = P.en;
    refillPower(P);
    refreshDrive(P);
    refreshShield(P);
    refreshHull(P);
    refreshGuns(P);
    if (visit.docked !== true && P.docked !== true) {
      if (P.power && Number.isFinite(prevPowerStored)) P.power.stored = Math.min(P.power.cap || 0, prevPowerStored);
      if (P.power && Number.isFinite(prevPowerDraw)) P.power.draw = prevPowerDraw;
      if (Number.isFinite(prevEn)) P.en = Math.min(P.enMax || 0, prevEn);
    }
    if (Number.isFinite(visit.hullMax) && visit.hullMax > 0) P.hullMax = visit.hullMax;
    if (Number.isFinite(visit.hull)) P.hull = visit.hull;
    if (Number.isFinite(visit.shieldMax)) P.shMax = visit.shieldMax;
    if (Number.isFinite(visit.shield)) P.sh = visit.shield;
    if (visit.place && (visit.place !== state.place || visit.place !== P.place || pendingNetPlace === visit.place)) {
      const prevPlace = P.place || state.place;
      pendingNetPlace = "";
      try {
        if (!simEnterPlace(visit.place, P)) {
          P.place = visit.place;
          state.place = visit.place;
          emit("place-entered", { id: visit.place, player: P });
        }
        if (prevPlace && P.place && P.place !== prevPlace) {
          if (P.flight) P.flight.lock = null;
          entityStream.forgetPlace(prevPlace);
          emit("place-changed", { from: prevPlace, to: P.place, player: P });
        }
      } catch (e) {
        console.error("[applyVisitSnapshot] enter place failed", e);
      }
    }
    const wantDocked = visit.docked === true;
    if (wantDocked !== lastVisitDockState) {
      lastVisitDockState = wantDocked;
      lastVisitDockAt = Date.now();
      dockStreamCaughtUp = false;
    }
    if (wantDocked !== (P.docked === true)) {
      P.docked = wantDocked;
      if (P.docked) {
        P.v.set(0, 0, 0);
        P.thr = 0;
        syncSpeedFromVelocity(P, Boolean(P.warp));
      } else {
        if ((P.drive?.spd || 0) > 0) msg("Launched. Fly to the asteroid field.", 4);
        else msg("No thrusters fitted: the ship cannot move. Press G to dock and fit one.", 6);
      }
      P.snap = true;
      try { emit(P.docked ? "docked" : "launched", { player: P }); } catch (e) {
        console.error("[applyVisitSnapshot] event failed", e);
      }
    }

    const cacheSnap = visit.instance?.cache;
    const cacheStockQty = cacheSnap?.stock
      ? Object.values(cacheSnap.stock).reduce((a, b) => a + Math.max(0, Math.floor(Number(b) || 0)), 0)
      : 0;
    const shouldOpenCache = !P.docked && visit.instance?.id === state.place &&
      cacheSnap?.open === true && cacheSnap?.tradeOpen === true && cacheStockQty > 0;
    if (shouldOpenCache) {
      P.openCacheId = visit.instance.id;
      if (!isCacheOpen()) {
        emit("instance-cache-open", {
          id: visit.instance.id,
          loot: cacheSnap.loot,
          n: cacheSnap.n,
          left: cacheStockQty,
          profile: state.profile,
          player: P,
        });
      }
    } else {
      P.openCacheId = null;
      if (isCacheOpen()) closeCache({ localOnly: true });
    }
  }

  const newlyFailed = (state.profile?.missions || []).find(m => m?.failed && !prevFailedIds.has(m.id));
  if (newlyFailed && !visit.notice) {
    try {
      emit("mission-failed", {
        mission: newlyFailed,
        title: newlyFailed.title,
        reason: "visit",
        message: newlyFailed.failureMessage || "It can no longer be completed.",
        player: P,
      });
    } catch (e) {
      console.error("[applyVisitSnapshot] mission-failed event failed", e);
    }
  }
  if (visit.notice) notify(visit.notice);
  if (visit.sound) uiSound(visit.sound);
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
  on("mp-ships", ({ ships, at } = {}) => shipStream.receive(ships, at || hrNow()));
  on("mp-self-ship", ({ ship, at } = {}) => {
    if (!isGuestVisiting() || !ship) return;
    // Own ship uses the same buffer depth (`SHIP_STREAM.delayMs` = 100 ms) + arrival pacing so
    // high-refresh guests (165/240 Hz) interpolate continuously instead of stalling between packets.
    guestSelfStream.receive([ship], at || hrNow());
  });
  on("mp-visit", visit => applyVisitSnapshot(visit));
  on("mp-refresh-home", () => {
    state.guestHome = null;
    if (state.away) stashGuestHome();
  });
  on("mp-refresh-visit", () => {
    if (isGuestVisiting() && lastVisitSnapshot) {
      applyVisitSnapshot(lastVisitSnapshot);
      const latestSelf = guestSelfStream.sample(hrNow());
      if (latestSelf.length) applySelfShip(latestSelf[0]);
    }
  });
  on("mp-enter-world", () => {
    if (isGuestVisiting() && lastVisitSnapshot) applyVisitSnapshot(lastVisitSnapshot);
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
  const lastPocketGuestKey = new Map();
  const lastPocketRockSig = new Map();
  // Host: answer what is in every pocket that holds a visitor, so the guest sees the same sky.
  on("mp-entities-request", request => {
    if (!request || !Array.isArray(request.places)) return;
    const guestsByPlace = new Map();
    for (const g of guestPlayers()) {
      if (!g?.place) continue;
      let ids = guestsByPlace.get(g.place);
      if (!ids) { ids = []; guestsByPlace.set(g.place, ids); }
      ids.push(g.guestId || String(g.id || ""));
    }
    for (const k of [...lastPocketGuestKey.keys()]) {
      if (!guestsByPlace.has(k)) {
        lastPocketGuestKey.delete(k);
        lastPocketRockSig.delete(k);
      }
    }
    request.places.length = 0;
    const vec = v => [v.x, v.y, v.z];
    const quat = q => (q ? [q.x, q.y, q.z, q.w] : [0, 0, 0, 1]);
    const nowMs = Date.now();
    for (const [placeId, guestIds] of guestsByPlace) {
      const W = placeWorld(placeId);
      if (!W) continue;
      const bullets = (W.bullets || []).map(e => ({
        id: e.id, pos: vec(e.pos), quat: quat(e.quat),
        colour: Number.isFinite(e.colour) ? e.colour
          : Number.isFinite(e.color) ? e.color
          : (e.own ? BULLET_COLOURS.cannon : BULLET_COLOURS.hostile),
      }));
      const missiles = (W.missiles || []).map(e => ({ id: e.id, pos: vec(e.pos), quat: quat(e.quat) }));
      const crates = (W.crates || []).map(e => {
        const item = { id: e.id, pos: vec(e.pos), quat: quat(e.quat), item: e.item || "salv" };
        if (e.missionId) item.missionId = e.missionId;
        if (e.persistent === true) item.persistent = true;
        if (e.encounter) item.encounter = e.encounter;
        if (e.missionOwner) item.missionOwner = e.missionOwner;
        return item;
      });
      const fx = (W.fx || []).map(e => ({
        id: e.id, pos: vec(e.pos), col: Number.isFinite(e.col) ? e.col : 0xffaa00,
        size: e.size || 1, l: Number.isFinite(e.l) ? e.l : 0, t: Number.isFinite(e.t) ? e.t : 1,
      }));
      // Enemies, from the host's first-hand record: the guest draws and locks them exactly as the
      // host does (views read `def`, F-lock reads `W.enemies`), while every wound stays host-side.
      const enemies = (W.enemies || []).map(e => {
        const row = {
          id: e.id, def: e.def, friendly: e.friendly === true, boost: e.boosting === true,
          pos: vec(e.pos), quat: quat(e.quat), v: vec(e.v || { x: 0, y: 0, z: 0 }),
          hp: Number.isFinite(e.hp) ? e.hp : 0, mx: Number.isFinite(e.mx) ? e.mx : 0,
        };
        if (e.missionId) row.missionId = e.missionId;
        if (e.encounter) row.encounter = e.encounter;
        if (e.missionOwner) row.missionOwner = e.missionOwner;
        return row;
      });
      // Sync asteroids on pocket entry, depletion/respawn, or active mining (~12 Hz throttle)
      // so guests see depleted rocks gone, shrinking rocks shrink, and respawned rocks return.
      const asteroids = W.asteroids || [];
      const guestKey = guestIds.slice().sort().join(",");
      const entered = lastPocketGuestKey.get(placeId) !== guestKey;
      lastPocketGuestKey.set(placeId, guestKey);
      const rockSig = `${asteroids.length}|${asteroids.map(r => `${r.id}:${Math.round((r.ore || 0) * 10)}`).join(",")}`;
      const prevRock = lastPocketRockSig.get(placeId);
      const countChanged = !prevRock || prevRock.count !== asteroids.length;
      const oreChanged = !prevRock || prevRock.sig !== rockSig;
      let rocks;
      if (entered || countChanged || (oreChanged && nowMs - prevRock.at >= 80)) {
        lastPocketRockSig.set(placeId, { sig: rockSig, count: asteroids.length, at: nowMs });
        rocks = asteroids.map(r => ({
          id: r.id,
          type: r.type || "ferrite",
          shape: r.shape || 0,
          r: r.r || 10,
          ore: r.ore || 0,
          max: r.max || 1,
          pos: vec(r.pos),
          quat: quat(r.quat),
          s0: vec(r.s0 || { x: r.r || 10, y: r.r || 10, z: r.r || 10 }),
          scale: vec(r.scale || r.s0 || { x: r.r || 10, y: r.r || 10, z: r.r || 10 }),
        }));
      }
      // Rifts, instance gates, and instance caches for this pocket so guests draw and R-interact
      // identically to host.
      const rifts = (W.rifts || []).filter(e => e && !e.gone).map(e => ({
        id: e.id,
        pos: vec(e.pos),
        quat: quat(e.quat),
        n: e.n || "Rift",
        dest: e.dest || "",
        r: e.r || 26,
        spin: e.spin ?? 0.35,
        ...(e.variant ? { variant: e.variant } : {}),
        ...(e.instance ? { instance: e.instance } : {}),
        ...(e.wormhole ? { wormhole: e.wormhole } : {}),
        ...(e.template ? { template: e.template } : {}),
        ...(e.peer ? { peer: e.peer } : {}),
        ...(e.locked ? { locked: true } : {}),
        ...(e.reentrant ? { reentrant: true } : {}),
      }));
      const gates = (W.gates || []).filter(e => e && !e.gone).map(e => ({
        id: e.id,
        pos: vec(e.pos),
        quat: quat(e.quat),
        n: e.n || "Way out",
        r: e.r || 26,
        spin: e.spin ?? 0.35,
        locked: !!e.locked,
        exit: e.exit !== false,
        ...(e.variant ? { variant: e.variant } : {}),
      }));
      const caches = (W.caches || []).filter(e => e && !e.gone).map(e => ({
        id: e.id,
        pos: vec(e.pos),
        quat: quat(e.quat),
        n: e.n || "Cache",
        r: e.r || 10,
        spin: e.spin ?? 0.35,
        locked: e.locked !== false,
        ...(e.loot ? { loot: e.loot } : {}),
      }));
      // Always answer for a pocket with a visitor — even with empty lists, so the guest clears
      // what is no longer there.
      request.places.push({
        place: placeId, bullets, missiles, crates, fx,
        booms: pocketBoomCount(placeId), enemies,
        picks: pocketPickCount(placeId), efires: drainEFires(placeId),
        rifts, gates, caches,
        ...(rocks ? { rocks } : {}),
      });
    }
    request.answered = true;
  });
  on("mp-entities", ({ place, bullets, missiles, crates, fx, booms, enemies, picks, efires, rocks, rifts, gates, caches, at } = {}) => {
    if (!place || typeof place !== "string" || !isGuestVisiting()) return;
    if (place !== state.place) return;   // entities only for the pocket this screen is in
    const W = placeWorld(place);
    const P = localPlayer();

    for (const sfx of collectGuestPocketSfx({ place, booms, picks, efires, enemies, W, player: P, boomSeen, pickSeen })) {
      try { emit("sfx", sfx); } catch (e) {}
    }
    try {
      if (Array.isArray(rocks)) syncPocketRocks(W, rocks, place);
      const nowMs = at || hrNow();
      const firstArrival = !hasNetEntities(W);
      entityStream.receive({ place, bullets, missiles, crates, fx, enemies, rifts, gates, caches }, nowMs);
      if (firstArrival) {
        const initial = entityStream.samplePlace(place, nowMs);
        if (initial) syncPocketEntities(W, initial, place);
      }
    } catch (e) { /* a broken pocket must never take the screen down */ }
  });
}

function installMultiplayerVisitors() {
  on("mp-guest-arrive", ({ guestId, name, bundle, visitState = null } = {}) => {
    if (!bundle) return;
    const profile = hostProfile(bundle, visitState);
    arriveGuest({
      guestId,
      name,
      profile,
      place: bundle.homeStation || null,
      lockers: Array.isArray(bundle.lockers) ? bundle.lockers : [],
      visitState,
    });
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
    try {
      startWarp(P, to);
    } catch (e) {
      console.error("[mp-guest-warp]", e);
      if (typeof document !== "undefined") reportCrash("mp-guest-warp", e);
    }
    emit("mp-guest-visit-push", { guestId });
  });
  on("travel-denied", ({ player, reason } = {}) => {
    if (player?.guestId && reason) {
      emit("mp-guest-visit-push", { guestId: player.guestId, notice: reason });
    }
  });
  on("mp-guest-dock", ({ guestId } = {}) => {
    const P = guestRecordOf(guestId);
    if (!P) return;
    const wasDocked = P.docked === true;
    let notice = "";
    // One button, like a local dock: in flight it docks, docked it launches. A visitor cannot
    // `launch()` locally (the teleport-to-launch-point bug), so both directions ride the host's
    // sim — `docked` follows immediately on both `visit` and `ships`.
    try {
      if (P.docked) launch(P, P.profile);
      else {
        cancelGuestHeld(P);
        if (!tryDock(P, P.profile, P.guestWorld || state.worldState)) {
          notice = dockFailureReason(P, P.profile);
        }
      }
    } catch (e) {
      console.error("[mp-guest-dock]", e);
      if (typeof document !== "undefined") reportCrash("mp-guest-dock", e);
      notice = "Docking failed unexpectedly.";
    }
    emit("mp-guest-visit-push", {
      guestId,
      notice,
      dockTransition: wasDocked !== (P.docked === true),
    });
  });
  on("mp-guest-act", request => {
    if (!request?.guestId || !request?.action) return;
    request.result = executeGuestAction(request.guestId, request.action);
    request.answered = true;
  });
  on("mp-guest-visit-request", request => {
    const P = guestRecordOf(request?.guestId);
    if (!P?.profile) return;
    const rec = P.place ? instanceAt(P.place) : null;
    const instance = rec && !rec.gone ? {
      id: rec.id,
      template: rec.template,
      seed: rec.seed,
      tier: rec.tier,
      origin: rec.origin,
      lifetime: rec.lifetime,
      totalLifetime: rec.totalLifetime,
      warned: !!rec.warned,
      expired: !!rec.expired,
      mined: rec.mined || 0,
      spawned: !!rec.spawned,
      objectiveMet: !!rec.objective?.met,
      cache: rec.cache ? {
        n: rec.cache.n,
        loot: rec.cache.loot,
        open: !!rec.cache.open,
        tradeOpen: !!(rec.cache.open && P.openCacheId === rec.id),
        stock: { ...(rec.cache.stock || {}) },
        slots: Array.isArray(rec.cache.slots)
          ? rec.cache.slots.map(s => (Array.isArray(s) && s[0] ? [s[0], s[1]] : null))
          : null,
      } : null,
    } : null;
    request.snapshot = {
      docked: !!P.docked,
      place: P.place || DEFAULT_PLACE,
      pw: Math.max(0, Math.min(4, Number(P.profile.pw ?? 1) - 1)),
      sw: Math.max(0, Math.min(4, Number(P.profile.sw ?? 1) - 1)),
      msl: Math.max(0, Math.floor(P.profile.msl || 0)),
      hull: Number.isFinite(P.hull) ? P.hull : 0,
      hullMax: Number.isFinite(P.hullMax) ? P.hullMax : 0,
      shield: Number.isFinite(P.sh) ? P.sh : 0,
      shieldMax: Number.isFinite(P.shMax) ? P.shMax : 0,
      held: P.guestHeld ? { ...P.guestHeld } : null,
      openCacheId: P.openCacheId || "",
      profile: JSON.parse(JSON.stringify(P.profile)),
      world: JSON.parse(JSON.stringify(P.guestWorld || {})),
      galaxy: state.worldState?.galaxy ? {
        seed: state.worldState.galaxy.seed,
        knowledge: JSON.parse(JSON.stringify(state.worldState.galaxy.knowledge || {})),
      } : null,
      shops: state.shops ? JSON.parse(JSON.stringify(state.shops)) : {},
      wormholes: state.mode !== "campaign" ? captureWormholes() : [],
      connections: Array.isArray(state.worldState?.connections)
        ? JSON.parse(JSON.stringify(state.worldState.connections))
        : [],
      ...(instance ? { instance } : {}),
    };
    request.answered = true;
  });
  for (const ev of [
    "docked", "launched", "place-changed", "pickup", "mined", "enemy-killed",
    "mission-progress", "mission-objectives-done", "mission-accepted",
    "mission-failed", "mission-step-reset", "mission-rewarded", "mission-abandoned",
  ]) {
    on(ev, (payload = {}) => {
      const P = payload.player;
      if (!P?.guestId) return;
      emit("mp-guest-visit-push", {
        guestId: P.guestId,
        notice: ev === "mission-failed" && payload.reason !== "abandon" ? (payload.message || "") : "",
      });
    });
  }
  on("mp-place-notice", ({ guestId, text } = {}) => {
    if (!guestId || !text) return;
    emit("mp-guest-visit-push", { guestId, notice: text });
  });
  for (const ev of ["instance-objective-done", "instance-warning", "instance-cache-moved", "instance-cache-empty"]) {
    on(ev, ({ id } = {}) => {
      if (!id) return;
      for (const g of guestPlayers()) {
        if (g && g.place === id) emit("mp-guest-visit-push", { guestId: g.guestId });
      }
    });
  }
  on("mp-guest-recovered", (payload = {}) => {
    if (!payload.guestId) return;
    emit("mp-guest-visit-push", { guestId: payload.guestId, notice: payload.text || "" });
  });
  on("board-timer-changed", ({ world, secondsLeft } = {}) => {
    if (!world || world === state.worldState) return;
    const g = guestPlayers().find(p => p.guestWorld === world);
    if (g && (g.docked || secondsLeft === 0)) {
      emit("mp-guest-visit-push", { guestId: g.guestId });
    }
  });
  // The host's write-back asks what the visiting pilot is NOW. Answering synchronously
  // is deliberate: the session needs the live profile in the same call that builds the
  // suitcase, and an async answer would need a second timer for no gain.
  on("mp-guest-bundle-request", request => {
    const P = guestRecordOf(request?.guestId);
    if (!P?.profile) return;
    request.profile = guestProfileSnapshot(P);
    request.lockers = guestLockerSnapshot(P);
    request.visitState = guestVisitStateSnapshot(P);
    request.answered = true;
  });
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
let hasUserGesture = false;
const noteUserGesture = () => {
  hasUserGesture = true;
  if (isNetOn() && hostKeepaliveOn) startHostAudioKeepalive();
};
addEventListener("pointerdown", () => initAudio(), { passive: true });
addEventListener("keydown", () => initAudio());
addEventListener("pointerdown", noteUserGesture, { passive: true });
addEventListener("keydown", noteUserGesture);

installMultiplayerVisitors();
installMultiplayerShips();
installMultiplayerEntities();
setupHud();
setupMenu({ beforeStart: () => modelLoading });
resumeFromSave();   // prepares the ship; the start screen still owns the panel

// Save where the pilot is, so quitting mid-flight returns them to that spot.
// Docking, warping and menu clicks already save; this covers simply flying off
// and closing the tab. `pagehide` and the hidden-tab event are the ones browsers
// actually deliver on close; the timer bounds what a crash can lose.
const saveResumePoint = () => {
  if (!state.ui.intro && !state.away) {
    try { emit("mp-host-flush", {}); } catch (e) {}
    saveCurrentGame();
  }
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
  if (P && state.ui.navigation && !state.paused && !P.docked && !state.warp) {
    selectPocketObject(object, P);
    if (isGuestVisiting()) sendGuestLock(P.flight?.lock || null);
  }
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
        if (isGuestVisiting()) sendGuestLock(localPlayer().flight?.lock || null);
      }
      break;
    case "primary:1": case "primary:2": case "primary:3": case "primary:4": case "primary:5":
      if (playing && !repeat) {
        const slot = Number(name.split(":")[1]) - 1;
        setWeapon(slot);
        if (isGuestVisiting()) {
          const id = requestGuestAction({ op: "pw", slot });
          if (id > latestSlotReqId) latestSlotReqId = id;
        }
      }
      break;
    case "secondary:1": case "secondary:2": case "secondary:3": case "secondary:4": case "secondary:5":
      if (playing && !repeat) {
        const slot = Number(name.split(":")[1]) - 1;
        setSecondaryWeapon(slot);
        if (isGuestVisiting()) {
          const id = requestGuestAction({ op: "sw", slot });
          if (id > latestSlotReqId) latestSlotReqId = id;
        }
      }
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
      if (repeat) break;
      if (isFailureNoticeOpen()) { dismissFailureNotice(); break; }
      if (isCacheOpen()) closeCache();
      else if (playing && !state.warp) {
        if (isGuestVisiting()) requestGuestAction({ op: "rift" });
        else riftAction(localPlayer());
      }
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
      if (!repeat && playing) {
        if (isGuestVisiting()) jumpRoute(localPlayer(), (_, to) => netRequestWarp(to));
        else jumpRoute(localPlayer());
      }
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
// stalls in a hidden tab, and main-thread `setInterval` throttles to 1 Hz (1 fps).
// On `file://`, `new Worker(blobUrl)` can also throw `SecurityError`, falling back
// to that throttled `setInterval`. Furthermore, when the host opens the Pause menu
// (`setAudioSuspended(true)`), suspending the main game AudioContext drops Chromium's
// audible-tab throttling exemption if our keepalive node outputs 0.0 silence. So
// alongside `Worker` (blob: then data:), we run an unthrottled WebAudio hardware
// heartbeat emitting an inaudible 12 Hz (-57 dBFS) sub-sonic carrier so Chromium
// keeps the host tab unthrottled even while paused or muted on `file://`.
let hostTick = null;
let hostWorker = null;
let hostTickAt = 0;
let hostAudioCtx = null;
let hostAudioNode = null;
let hostAudioGain = null;
let hostAudioBusy = false;
let hostKeepaliveOn = false;
let mpRole = "";
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
function armIntervalFallback() {
  if (hostTick || hostWorker || hostAudioNode) return;
  hostTick = setInterval(advanceHostClock, Math.round(SIM_DT * 1000));
  if (typeof hostTick?.unref === "function") hostTick.unref();
}
function startHostWorker() {
  if (hostWorker || typeof Worker !== "function") return false;
  const workerSrc = "setInterval(()=>postMessage('tick'),16)";
  const tryStart = (url, revokeOnStop) => {
    try {
      const w = new Worker(url);
      w.onmessage = advanceHostClock;
      w.onerror = () => {
        try { w.terminate(); } catch (e) {}
        if (hostWorker === w) hostWorker = null;
        if (revokeOnStop && hostWorkerUrl === url) {
          try { URL.revokeObjectURL(url); } catch (e) {}
          hostWorkerUrl = null;
        }
        if (hostKeepaliveOn && revokeOnStop) {
          const dataUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(workerSrc)}`;
          if (!tryStart(dataUrl, false)) armIntervalFallback();
        } else if (hostKeepaliveOn) {
          armIntervalFallback();
        }
      };
      hostWorker = w;
      hostWorkerUrl = revokeOnStop ? url : null;
      return true;
    } catch (e) {
      return false;
    }
  };
  try {
    if (typeof Blob === "function" && typeof URL?.createObjectURL === "function") {
      const blob = new Blob([workerSrc], { type: "application/javascript" });
      const blobUrl = URL.createObjectURL(blob);
      if (tryStart(blobUrl, true)) return true;
      try { URL.revokeObjectURL(blobUrl); } catch (e) {}
    }
  } catch (e) {}
  return tryStart(`data:text/javascript;charset=utf-8,${encodeURIComponent(workerSrc)}`, false);
}
function startHostAudioKeepalive() {
  if (!hostKeepaliveOn || !hasUserGesture) return;
  if (hostAudioCtx && hostAudioCtx.state === "suspended" && typeof hostAudioCtx.resume === "function") {
    hostAudioCtx.resume().catch(() => {});
  }
  if (hostAudioNode || hostAudioBusy) return;
  const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (typeof Ctx !== "function") return;
  hostAudioBusy = true;
  try {
    const ctx = hostAudioCtx || new Ctx({ latencyHint: "interactive" });
    hostAudioCtx = ctx;
    if (ctx.state === "suspended" && typeof ctx.resume === "function") {
      ctx.resume().catch(() => {});
    }
    const attachKeepaliveNode = node => {
      if (!hostKeepaliveOn || hostAudioNode) {
        try { node.disconnect?.(); } catch (e) {}
        return;
      }
      const gain = ctx.createGain();
      if (typeof gain.gain?.setValueAtTime === "function" && typeof gain.gain?.linearRampToValueAtTime === "function" && typeof ctx.currentTime === "number") {
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.05);
      } else if (gain.gain) {
        gain.gain.value = 1;
      }
      node.connect(gain);
      gain.connect(ctx.destination);
      hostAudioNode = node;
      hostAudioGain = gain;
      if (hostTick) { clearInterval(hostTick); hostTick = null; }
    };
    const fallbackScriptProcessor = () => {
      if (!hostKeepaliveOn || hostAudioNode || typeof ctx.createScriptProcessor !== "function") return;
      try {
        const sp = ctx.createScriptProcessor(1024, 1, 1);
        let spPhase = 0;
        sp.onaudioprocess = ev => {
          const out = ev?.outputBuffer?.getChannelData?.(0);
          if (out) {
            for (let i = 0; i < out.length; i += 1) {
              spPhase = (spPhase + 0.0015708) % 6.2831853;
              out[i] = 0.002 * Math.sin(spPhase);
            }
          }
          advanceHostClock();
        };
        attachKeepaliveNode(sp);
      } catch (e) {}
    };
    const WorkletNode = globalThis.AudioWorkletNode;
    if (ctx.audioWorklet && typeof ctx.audioWorklet.addModule === "function" && typeof WorkletNode === "function") {
      const workletCode = "class K extends AudioWorkletProcessor{constructor(){super();this._n=0;this._p=0;}process(i,outputs){const out=outputs&&outputs[0]&&outputs[0][0];if(out){for(let k=0;k<out.length;k++){this._p=(this._p+0.0015708)%6.2831853;out[k]=0.002*Math.sin(this._p);}}if(++this._n>=6){this._n=0;this.port.postMessage(1);}return true;}}registerProcessor('tr-host-keepalive',K);";
      const modUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(workletCode)}`;
      ctx.audioWorklet.addModule(modUrl).then(() => {
        hostAudioBusy = false;
        if (!hostKeepaliveOn || hostAudioNode) return;
        try {
          const node = new WorkletNode(ctx, "tr-host-keepalive", { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
          node.port.onmessage = advanceHostClock;
          attachKeepaliveNode(node);
        } catch (e) {
          fallbackScriptProcessor();
        }
      }).catch(() => {
        hostAudioBusy = false;
        fallbackScriptProcessor();
      });
    } else {
      hostAudioBusy = false;
      fallbackScriptProcessor();
    }
  } catch (e) {
    hostAudioBusy = false;
  }
}
function startHostTick() {
  hostKeepaliveOn = true;
  if (!hostTickAt) hostTickAt = performance.now();
  else hostTickAt = Math.max(hostTickAt, performance.now() - SIM_DT * 1000);
  startHostWorker();
  startHostAudioKeepalive();
  if (!hostWorker && !hostAudioNode) armIntervalFallback();
}
function stopHostTick() {
  hostKeepaliveOn = false;
  if (hostWorker) { try { hostWorker.terminate(); } catch (e) {} hostWorker = null; }
  if (hostWorkerUrl) { try { URL.revokeObjectURL(hostWorkerUrl); } catch (e) {} hostWorkerUrl = null; }
  if (hostTick) { clearInterval(hostTick); hostTick = null; }
  if (hostAudioNode) {
    try { hostAudioNode.onaudioprocess = null; } catch (e) {}
    try { if (hostAudioNode.port) hostAudioNode.port.onmessage = null; } catch (e) {}
    try { hostAudioNode.disconnect(); } catch (e) {}
    hostAudioNode = null;
  }
  if (hostAudioGain) { try { hostAudioGain.disconnect(); } catch (e) {} hostAudioGain = null; }
  if (hostAudioCtx) {
    try { hostAudioCtx.close?.().catch?.(() => {}); } catch (e) {}
    hostAudioCtx = null;
  }
  hostAudioBusy = false;
}
on("mp-state", snap => {
  state.multiplayer = !!(snap?.on);
  mpRole = snap?.role || "";
  if (snap?.on && mpRole === "host") startHostTick();
  else stopHostTick();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && isNetOn() && mpRole === "host") startHostTick();
});
// Blur also stalls rAF on some window managers (clicking to second monitor).
addEventListener("blur", () => { if (isNetOn() && mpRole === "host") startHostTick(); });

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
  const sampleAt = hrNow(now);
  // Guest's own ship and visited-pocket entities use buffered snapshot interpolation (`SHIP_STREAM.delayMs` = 100 ms)
  // with arrival dejittering so high-refresh displays (e.g. 240 Hz) move smoothly instead of stalling between packets.
  if (isGuestVisiting()) {
    for (const inst of state.instances.values()) {
      if (inst && !inst.gone && inst.lifetime > 0) inst.lifetime = Math.max(0, inst.lifetime - dt);
    }
    for (const wh of state.wormholes.values()) {
      if (wh && !wh.doomed && wh.lifetime > 0) wh.lifetime = Math.max(0, wh.lifetime - dt);
    }
    const selfPoses = guestSelfStream.sample(sampleAt);
    if (selfPoses.length) applySelfShip(selfPoses[0]);
    const gP = localPlayer();
    if (gP) gP.bs = (gP.bs || 0) + ((gP.boost ? 1 : 0) - (gP.bs || 0)) * Math.min(1, dt * 8);
    const snap = entityStream.samplePlace(state.place, sampleAt);
    if (snap) syncPocketEntities(placeWorld(state.place), snap, state.place);
  }
  const alpha = simClock.alpha();
  updateEnemyViews(alpha);    // interpolate each hostile's mesh between 60 Hz ticks
  // Slice 8a: every other pilot. A host draws its visiting records straight from `state.players`
  // (no wire at all); a guest draws what the host sent, `SHIP_STREAM.delayMs` in the past.
  updateEntityViews(alpha, shipStream.sample(sampleAt));   // and every bullet, missile, crate, particle, rock and the ship
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
    if (state.paused || isChatOpen()) clearControls();
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
