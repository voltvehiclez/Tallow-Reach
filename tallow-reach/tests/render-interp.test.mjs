import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { loadHeadless } from "./headless.mjs";

const app = await loadHeadless(
  "src/render/views.js",
  {
    state: "src/state/state.js",
    localPlayer: "src/state/state.js",
    applySave: "src/state/state.js",
    newSave: "src/state/profile.js",
    createPlayer: "src/sim/player.js",
    setShip: "src/sim/player.js",
    launch: "src/sim/session.js",
    createSimClock: "src/sim/step.js",
    V: "src/util/math.js",
    fwdQ: "src/util/math.js",
    FLIGHT: "src/data/ships.js",
    cameraTrail: "src/data/camera.js",
  },
  { keep: ["views.js"] }
);

test("240 Hz render interpolation eliminates 60 Hz sawtooth jumps when moving side to side", () => {
  app.applySave(app.newSave());
  for (const list of Object.values(app.state.world)) list.length = 0;
  app.createPlayer();
  app.setShip("wasp");
  app.installEnemyViews();
  app.launch();

  const P = app.localPlayer();
  P.flight.spawnT = 1e9;
  const clock = app.createSimClock(undefined, {
    beforeStep: app.snapshotSimPoses,
    afterStep: app.snapRenderedPlayer,
  });

  const camera = new THREE.PerspectiveCamera(70, 1920 / 1080, 0.5, 40000);
  const rel = app.V(0, 0, 0),
    want = app.V(0, 0, 0),
    prev = app.V(0, 0, 0),
    delta = app.V(0, 0, 0);
  let havePrev = false;

  function stepCamera(dt, pose) {
    const d = app.state.drive;
    const tr = app.cameraTrail(pose.v.dot(app.fwdQ(pose.quat)), d.spd * 2, d.spd * app.FLIGHT.reverse);
    const tp = app.V(0, 2.6, tr).applyQuaternion(pose.quat).add(pose.pos);
    if (!havePrev) {
      prev.copy(pose.pos);
      havePrev = true;
    }
    delta.copy(pose.pos).sub(prev);
    if (delta.lengthSq() > 2500) delta.set(0, 0, 0);
    prev.copy(pose.pos);
    if (P.snap) {
      camera.position.copy(tp);
      camera.quaternion.copy(pose.quat);
      delta.set(0, 0, 0);
      P.snap = false;
    }
    rel.copy(camera.position).sub(pose.pos).add(delta);
    want.copy(tp).sub(pose.pos);
    rel.lerp(want, 1 - Math.exp(-10 * dt));
    camera.position.copy(pose.pos).add(rel);
    camera.quaternion.slerp(pose.quat, 1 - Math.exp(-5 * dt));
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  }

  const dt = 1 / 240;
  P.controls.strafe = 1;
  P.controls.steer.x = 0.6;

  const noseScreenX = [];
  const hullWorldX = [];
  for (let f = 0; f < 64; f++) {
    clock.advance(dt);
    const alpha = clock.alpha();
    app.updateEnemyViews(alpha);
    app.updateEntityViews(alpha);
    const pose = app.renderPlayerPose(P, alpha);
    stepCamera(dt, pose);
    if (f >= 40) {
      hullWorldX.push(pose.pos.x);
      const nose = pose.pos.clone().add(app.V(0, 0, -4).applyQuaternion(pose.quat)).project(camera);
      noseScreenX.push((nose.x * 0.5 + 0.5) * 1920);
    }
  }

  // Every single 240 Hz display frame advances both world X and projected nose X smoothly
  // (no frozen frames and no 4-frame sawtooth jumps).
  for (let i = 1; i < hullWorldX.length; i++) {
    const dxWorld = hullWorldX[i] - hullWorldX[i - 1];
    const dxPx = noseScreenX[i] - noseScreenX[i - 1];
    assert.ok(dxWorld > 0.01, `world X advances on every 240 Hz frame (step ${i}: ${dxWorld})`);
    assert.ok(dxPx > 0.2 && dxPx < 1.0, `screen nose X glides smoothly without sawtooth jump (step ${i}: ${dxPx}px)`);
  }

  // Verify a teleport with P.snap snaps immediately instead of smearing across space.
  P.pos.set(0, 0, -5000);
  P.snap = true;
  const snapped = app.renderPlayerPose(P, 0.5);
  assert.equal(snapped.pos.z, -5000);
});
