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
import { setupMenu } from "./ui/menu.js";
import { setupPause, setPause } from "./ui/pause.js";
import { setupStarmap, openStarmap, closeStarmap, isStarmapOpen } from "./ui/starmap.js";
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
setupStarmap();
installInput();
syncControls();   // the control record starts in sync with the (unpressed) keys
installCameraControls(state.freeCam, {
  canStart: () => !localPlayer().docked && !state.paused && !isStarmapOpen(),
  getScale: () => SHIPS[state.profile.ship].sc,
});

on("place-entered", ({ id }) => showPlace(id));
showPlace(state.place);

// --- Actions (key and mouse bindings, see core/input.js) -------------------

on("action", ({ name, repeat, to: nameTo, key }) => {
  const pauseKey = key !== "Escape";
  const playing = !state.ui.intro && !localPlayer().docked && !state.paused && !isStarmapOpen();
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
        else if (playing) openStarmap();
      }
      break;
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
      } else if (!state.ui.intro && !localPlayer().docked) setPause(!state.paused);
      break;
  }
});

addEventListener("resize", () => {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
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

  // Nothing simulates behind the start screen or the pause overlay.
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
