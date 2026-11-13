// Entry point. Wires the systems together and runs the frame loop.
// Update order matches the prototype: input, flight, weapons, AI, projectiles, render.

import { renderer, scene, camera, stars, showPlace, updateScenery } from "./render/scene.js";
import { dockedView, chaseView, shakeOffset, installCameraControls } from "./render/camera.js";
import { state, localPlayer, applySave, currentSave } from "./state/state.js";
import { newSave } from "./state/profile.js";
import { loadAutosave, saveAutosave } from "./state/storage.js";
import { SHIPS } from "./data/ships.js";
import { installInput, syncControls } from "./core/input.js";
import { updateAudio, initAudio } from "./core/audio.js";
import { on } from "./util/events.js";
import { createPlayer, setShip } from "./sim/player.js";
import { setWeapon, refreshGuns } from "./sim/weapons.js";
import { loadPlace } from "./sim/places.js";
import { toggleLock } from "./sim/targeting.js";
import { tryDock, resumeFromSave } from "./sim/session.js";
import { startWarp } from "./sim/sectors.js";
import { jumpRoute } from "./sim/navigation.js";
import { prepareGalaxySave } from "./sim/galaxy-session.js";
import { setupHud, updateHud } from "./ui/hud.js";
import { setupMenu, openStationTab } from "./ui/menu.js";
import { setupPause, setPause } from "./ui/pause.js";
import { setupMissionLog } from "./ui/missionlog.js";
import { setupStarmap, openStarmap, closeStarmap, isStarmapOpen } from "./ui/starmap.js";
import { setupCargo, openCargo, closeCargo, isCargoOpen, canOpenCargo } from "./ui/cargo.js";
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
import { setupWarpStreaks, updateWarpStreaks } from "./render/warpfx.js";
import {
  installEnemyViews,
  updateEnemyViews,
  updateEntityViews,
  snapshotSimPoses,
  snapRenderedPlayer,
  renderPlayerPose,
} from "./render/views.js";

// --- Boot ------------------------------------------------------------------

document.body.prepend(renderer.domElement);
applySave(loadAutosave(prepareGalaxySave) || prepareGalaxySave(newSave()));
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
setupMenu();
resumeFromSave();   // prepares the ship; the start screen still owns the panel

// Save where the pilot is, so quitting mid-flight returns them to that spot.
// Docking, warping and menu clicks already save; this covers simply flying off
// and closing the tab. `pagehide` and the hidden-tab event are the ones browsers
// actually deliver on close; the timer bounds what a crash can lose.
const saveResumePoint = () => {
  if (!state.ui.intro) saveAutosave(currentSave());
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
setupMissionLog();
setupStarmap();
setupCargo();
installInput();
syncControls();   // the control record starts in sync with the (unpressed) keys
installCameraControls(state.freeCam, {
  canStart: () => !localPlayer().docked && !state.paused && !isStarmapOpen() && !isCargoOpen(),
  getScale: () => SHIPS[state.profile.ship].sc,
});

on("place-entered", ({ id }) => showPlace(id));
showPlace(state.place);

// --- Actions (key and mouse bindings, see core/input.js) -------------------

on("action", ({ name, repeat, to: nameTo, key }) => {
  const pauseKey = key !== "Escape";
  const playing = !state.ui.intro && !localPlayer().docked && !state.paused && !isStarmapOpen() && !isCargoOpen();
  switch (name) {
    case "lock":
      if (playing && !repeat) toggleLock();
      break;
    case "weapon:cannon":
      if (playing) setWeapon("cannon");
      break;
    case "weapon:beam":
      if (playing) setWeapon("beam");
      break;
    case "dock":
      if (playing && !state.warp) tryDock();
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
    case "pause":
      if (isStarmapOpen()) {
        closeStarmap();
        if (name === "pause" && pauseKey) setPause(true);
      } else if (isCargoOpen()) {
        // Esc just closes the hold; P closes it and opens the pause card.
        closeCargo();
        if (name === "pause" && pauseKey) setPause(true);
      } else if (canPause()) setPause(!state.paused);
      break;
  }
});

addEventListener("resize", () => {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  resizeMenuView();
});

// --- Frame loop ------------------------------------------------------------

let last = performance.now();
const cameraAim = camera.position.clone();
const simClock = createSimClock( undefined, {
  beforeStep: snapshotSimPoses,
  afterStep: snapRenderedPlayer,
});

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(MAX_FRAME_DT, (now - last) / 1000);
  last = now;

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
  updateScenery(dt);

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
  updateEntityViews(alpha);   // and every bullet, missile, crate, particle, rock and the ship
  updateWarpStreaks(dt);      // all three hide themselves when no warp is running
  updateWarpFlash();

  // A hit may have docked the player during the updates above.
  if (P.docked) {
    dockedView(state.time + alpha * SIM_DT);
  } else {
    chaseView(dt, P, state.freeCam, renderPlayerPose(P, alpha));
    updateHud(dt);
  }
  stars.position.copy(camera.position);

  const offset = shakeOffset(P, dt, SHIPS[state.profile.ship].sc);
  if (offset) camera.position.add(offset);
  renderer.render(scene, camera);
  if (offset) camera.position.sub(offset);

  // Draws its own canvas and does nothing unless the Outfitting tab is open.
  updateOutfitting(dt);
}

requestAnimationFrame(frame);
