// Entry point. Wires the systems together and runs the frame loop.
// Update order matches the prototype: input, flight, weapons, AI, projectiles, render.

import { renderer, scene, camera, stars, planet, spin } from "./render/scene.js";
import { dockedView, chaseView, shakeOffset, installCameraControls } from "./render/camera.js";
import { state } from "./state/state.js";
import { newProfile } from "./state/profile.js";
import { loadAutosave } from "./state/storage.js";
import { SHIPS } from "./data/ships.js";
import { installInput } from "./core/input.js";
import { updateAudio } from "./core/audio.js";
import { on } from "./util/events.js";
import { createPlayer, setShip, flight } from "./sim/player.js";
import { updatePrimary, updateMissiles, setWeapon } from "./sim/weapons.js";
import { updateEnemies } from "./sim/ai.js";
import { updateBullets, updateCrates } from "./sim/combat.js";
import { updateEffects } from "./sim/effects.js";
import { populateField } from "./sim/asteroids.js";
import { toggleLock } from "./sim/targeting.js";
import { tryDock } from "./sim/session.js";
import { setupHud, updateHud } from "./ui/hud.js";
import { setupMenu } from "./ui/menu.js";
import { setupPause, setPause } from "./ui/pause.js";

// --- Boot ------------------------------------------------------------------

document.body.prepend(renderer.domElement);
state.profile = loadAutosave() || newProfile();
createPlayer();
setShip(state.profile.ship);
populateField();

setupHud();
setupMenu();
setupPause();
installInput();
installCameraControls(state.freeCam, {
  canStart: () => !state.player.docked && !state.paused,
  getScale: () => SHIPS[state.profile.ship].sc,
});

// --- Actions (key and mouse bindings, see core/input.js) -------------------

on("action", ({ name, repeat }) => {
  const playing = !state.player.docked && !state.paused;
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
      if (playing) tryDock();
      break;
    case "pause":
      if (!state.player.docked) setPause(!state.paused);
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

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (state.paused) {
    renderer.render(scene, camera);
    return;
  }
  state.time += dt;

  const P = state.player,
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

  if (!P.docked) {
    flight(dt);
    updatePrimary(dt);
    updateMissiles(dt);
    updateEnemies(dt);
    updateBullets(dt);
    updateCrates(dt);
  }
  updateEffects(dt);

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
}

requestAnimationFrame(frame);
