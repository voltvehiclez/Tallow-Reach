// Entry point. Wires the systems together and runs the frame loop.
// Update order matches the prototype: input, flight, weapons, AI, projectiles, render.

import { renderer, scene, camera, stars, planet, spin, showSector } from "./render/scene.js";
import { dockedView, chaseView, shakeOffset, installCameraControls } from "./render/camera.js";
import { state, localPlayer } from "./state/state.js";
import { newProfile } from "./state/profile.js";
import { loadAutosave } from "./state/storage.js";
import { SHIPS } from "./data/ships.js";
import { installInput, syncControls } from "./core/input.js";
import { updateAudio } from "./core/audio.js";
import { on } from "./util/events.js";
import { createPlayer, setShip } from "./sim/player.js";
import { setWeapon, refreshGuns } from "./sim/weapons.js";
import { populateField } from "./sim/asteroids.js";
import { toggleLock } from "./sim/targeting.js";
import { tryDock } from "./sim/session.js";
import { startWarp } from "./sim/sectors.js";
import { setupHud, updateHud } from "./ui/hud.js";
import { setupMenu } from "./ui/menu.js";
import { setupPause, setPause } from "./ui/pause.js";
import { updateOutfitting } from "./ui/outfitting.js";
import { refillPower } from "./sim/power.js";
import { refreshDrive } from "./sim/drive.js";
import { refreshShield } from "./sim/shield.js";
import { refreshHull } from "./sim/hull.js";
import { createSimClock } from "./sim/step.js";
import { MAX_FRAME_DT } from "./data/simulation.js";
import { setupWarpFlash, updateWarpFlash } from "./ui/warpflash.js";
import { setupWarpStreaks, updateWarpStreaks } from "./render/warpfx.js";
import { installEnemyViews, updateEnemyViews, updateEntityViews } from "./render/views.js";

// --- Boot ------------------------------------------------------------------

document.body.prepend(renderer.domElement);
state.profile = loadAutosave() || newProfile();
createPlayer();
setShip(state.profile.ship);
populateField();
refillPower();   // start docked, so the cells are full
refreshDrive();  // speed and turn come from the fitted thrusters
refreshShield(); // and shield strength comes from the fitted shields
refreshHull();   // and Hull HP come from the fitted hull module
refreshGuns();   // and the primary bays decide what fires on left click

setupHud();
setupMenu();
setupWarpStreaks();
installEnemyViews();   // one mesh per entity: hostiles, shots, crates, sparks, rocks, the ship
setupWarpFlash();
setupPause();
installInput();
syncControls();   // the control record starts in sync with the (unpressed) keys
installCameraControls(state.freeCam, {
  canStart: () => !localPlayer().docked && !state.paused,
  getScale: () => SHIPS[state.profile.ship].sc,
});

on("sector-entered", ({ id }) => showSector(id));
showSector(state.sector);

// --- Actions (key and mouse bindings, see core/input.js) -------------------

on("action", ({ name, repeat }) => {
  const playing = !localPlayer().docked && !state.paused;
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
    case "warp":
      if (playing && !repeat) startWarp();
      break;
    case "pause":
      if (!localPlayer().docked) setPause(!state.paused);
      break;
  }
});

addEventListener("resize", () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// --- Frame loop ------------------------------------------------------------

let last = performance.now();
const cameraAim = camera.position.clone();
const simClock = createSimClock();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(MAX_FRAME_DT, (now - last) / 1000);
  last = now;

  if (state.paused) {
    renderer.render(scene, camera);
    return;
  }

  const P = localPlayer(),
    F = state.flight;
  planet.rotation.y += dt * 0.003;
  spin.rotation.y += dt * 0.1;
  stars.position.copy(camera.position);

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
  updateEnemyViews();      // copy each hostile's position onto its mesh
  updateEntityViews();     // and every bullet, missile, crate, particle, rock and the ship
  updateWarpStreaks(dt);   // all three hide themselves when no warp is running
  updateWarpFlash();

  // A hit may have docked the player during the updates above.
  if (P.docked) {
    dockedView(state.time);
  } else {
    chaseView(dt, P, state.freeCam);
    updateHud(dt);
  }

  const offset = shakeOffset(P, dt, SHIPS[state.profile.ship].sc);
  if (offset) camera.position.add(offset);
  renderer.render(scene, camera);
  if (offset) camera.position.sub(offset);

  // Draws its own canvas and does nothing unless the Outfitting tab is open.
  updateOutfitting(dt);
}

requestAnimationFrame(frame);
