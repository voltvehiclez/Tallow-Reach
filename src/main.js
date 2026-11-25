import { selectPocketObject } from './sim/targeting.js';
import { pickLockSurface } from "./render/target-picking.js";
// Entry point. Wires the systems together and runs the frame loop.
// Update order matches the prototype: input, flight, weapons, AI, projectiles, render.

import { renderer, scene, camera, stars, showPlace, stepScenery, updateScenery, forgetPlace } from "./render/scene.js";
import { dockedView, chaseView, shakeOffset, installCameraControls } from "./render/camera.js";
import { state, localPlayer, applySave, currentSave, newRootSave, saveCurrentGame } from "./state/state.js";
import { loadAutosave } from "./state/storage.js";
import { shipCameraScale } from "./render/models.js";
import { shipDef } from "./data/ships.js";
import { verticalFovForAspect } from "./data/camera.js";
import { installInput, syncControls } from "./core/input.js";
import { updateAudio, initAudio } from "./core/audio.js";
import { on, emit } from "./util/events.js";
import { createPlayer, setShip } from "./sim/player.js";
import { setWeapon, setSecondaryWeapon, refreshGuns } from "./sim/weapons.js";
import { loadPlace } from "./sim/places.js";
import { toggleLock } from "./sim/targeting.js";
import { tryDock, resumeFromSave } from "./sim/session.js";
import { startWarp } from "./sim/sectors.js";
import { riftAction, restoreInstances } from "./sim/instances.js";
import { restoreWormholes } from "./sim/wormholes.js";
import { jumpRoute } from "./sim/navigation.js";
import { prepareGalaxySave } from "./sim/galaxy-session.js";
import { setupHud, updateHud } from "./ui/hud.js";
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
  on("mp-state", snapshot => { if (!snapshot || !snapshot.on) shipStream.clear(); });
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
      if (playing && !state.warp) tryDock();
      break;
    case "rift":
      // Step 14: one deliberate press goes in or out of a wormhole — into a rift door that is
      // within range, or out through the instance's own way out. Never by contact. Beside a run's
      // canister the same press opens the trade (ui/cache.js), and pressing it again puts it away:
      // the pilot's hands are on the cargo, so R stays the canister's key until they are done.
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
      if (!state.ui.intro && !state.paused && !localPlayer().docked) startWarp(localPlayer(), nameTo);
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

let last = performance.now();
const cameraAim = camera.position.clone();
const simClock = createSimClock(undefined, {
  beforeStep: () => {
    snapshotSimPoses();
    stepScenery(SIM_DT);
  },
  afterStep: snapRenderedPlayer,
});

/**
 * One frame. Split from `frame` below so that anything it throws can be caught without stopping the
 * loop: the next frame is asked for first, then the work is tried, then — if the work broke — the
 * scene is drawn anyway and the problem is said on screen. Without that, a single bad frame leaves
 * the last good picture frozen on the glass with a live loop behind it, which plays as a dead game.
 */
function drawFrame(now) {
  const dt = Math.min(MAX_FRAME_DT, (now - last) / 1000);
  last = now;

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
