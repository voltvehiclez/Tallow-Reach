// In-flight HUD: shield, hull and boost bars, cargo and contract readout,
// the missile lock ring, and the markers for targets and the outpost.

import { fmtDist } from "../util/math.js";
import { on } from "../util/events.js";
import { SHIPS } from "../data/ships.js";
import { sectorAt } from "../data/sectors.js";
import { camera } from "../render/scene.js";
import { state, say } from "../state/state.js";
import { holdLoad } from "../sim/economy.js";
import { moduleListName } from "../sim/guns.js";
import { describe } from "../sim/contracts.js";
import { pruneLock, lockPosition, lockName } from "../sim/targeting.js";
import { FIELD_CENTER, STATION_POS } from "../sim/world.js";
import { MISSILE } from "../data/weapons.js";

const $ = id => document.getElementById(id);
const MARKER_POOL = 18;
const MARKER_MARGIN_X = 75;   // keep labels this far from the screen edge
const MARKER_MARGIN_Y = 30;

let markers = [];
let markerCount = 0;
let el = {};

export function setupHud() {
  el = {
    root: $("hud"),
    shield: $("b1"),
    hull: $("b2"),
    boost: $("b3"),
    boostVal: $("boost-val"),
    shieldVal: $("sh-val"),
    hullVal: $("hull-val"),
    topRight: $("tr"),
    bottomCenter: $("bc"),
    powerBar: $("pwbar"),
    powerValue: $("pw-val"),
    powerFlow: $("pw-flow"),
    beam: $("bm"),
    beamBar: $("bmbar"),
    beamName: $("bm-name"),
    beamPct: $("bm-pct"),
    prompt: $("pr"),
    msg: $("msg"),
    cursor: $("cur"),
    cone: $("mcone"),
    reticle: $("retc").getContext("2d"),
    flash: $("flash"),
  };

  const container = $("mk");
  for (let i = 0; i < MARKER_POOL; i++) {
    const d = document.createElement("div");
    d.className = "mk";
    container.appendChild(d);
    markers.push(d);
  }

  addEventListener("mousemove", e => {
    el.cursor.style.left = e.clientX + "px";
    el.cursor.style.top = e.clientY + "px";
  });

  on("docked", () => (el.root.hidden = true));
  on("launched", () => (el.root.hidden = false));
  on("hurt", ({ shielded }) => {
    el.flash.style.opacity = shielded ? 0.25 : 0.8;
    setTimeout(() => (el.flash.style.opacity = 0), 120);
  });
}

/**
 * The missile lock ring's radius in pixels for a cone of `deg` degrees, or 0 when
 * there is no ring. The sim says the angle (state.flight.coneAngle); turning it
 * into pixels needs the camera's field of view and the window height, which only
 * the screen knows. Property-tested in tests/layers.test.mjs.
 */
export function coneRadiusPx(deg) {
  if (!(deg > 0)) return 0;
  return (Math.tan((deg * Math.PI) / 180) / Math.tan((camera.fov * Math.PI) / 360)) * innerHeight / 2;
}

/** Refresh every HUD element. Call once per frame while flying. */
export function updateHud(dt) {
  const P = state.player,
    S = state.profile,
    F = state.flight,
    H = state.hud,
    d = SHIPS[S.ship],
    m = S.mission;

  el.shield.style.width = (P.shMax > 0 ? Math.max(0, P.sh / P.shMax) : 0) * 100 + "%";
  el.hull.style.width = (P.hullMax > 0 ? Math.max(0, P.hull / P.hullMax) * 100 : 0) + "%";
  el.boost.style.width = (P.enMax > 0 ? Math.max(0, Math.min(1, P.en / P.enMax)) : 0) * 100 + "%";
  // Numbers beside every bar, so each pool can be read exactly as well as roughly.
  el.shieldVal.textContent = P.shMax > 0 ? `${Math.round(P.sh)} / ${Math.round(P.shMax)}` : "none";
  el.hullVal.textContent = P.hullMax > 0 ? `${Math.round(P.hull)} / ${Math.round(P.hullMax)}` : "none";
  el.boostVal.textContent = P.enMax > 0 ? `${Math.round(P.en)} / ${Math.round(P.enMax)}` : "none";

  // The primary line names what left click will do, using the names of the
  // equipped modules: the fitted beams for the beam slot, the fitted guns for the
  // cannon slot, and the same "Empty weapon slot" either way when nothing is there.
  const guns = state.guns,
    beams = state.beams || [],
    primary =
      S.pw === "beam"
        ? beams.length > 0
          ? moduleListName(beams)
          : "Empty weapon slot"
        : guns.length > 0
        ? moduleListName(guns)
        : "Empty weapon slot";

  el.topRight.innerHTML =
    `${sectorAt(state.sector).n}<br>` +
    `${S.cr} cr<br>Hold ${holdLoad()}/${d.cargo} m³<br>` +
    `${primary}${(state.missiles || []).length ? ", missiles " + S.msl : ""}<br>` +
    `<span style="color:var(--amber)">${m ? describe(m) + " " + m.p + "/" + m.n : "No contract"}</span>`;

  el.bottomCenter.textContent = `Throttle ${Math.round(P.thr * 100)}%   ${Math.round(P.v.length())} m/s`;

  // Ship power: what the cells hold, and what the powerplants are making.
  const pw = state.power,
    cap = Math.max(0, pw.cap);
  el.powerBar.style.width = (cap ? Math.max(0, Math.min(1, pw.stored / cap)) * 100 : 0) + "%";
  el.powerValue.textContent = cap ? `${Math.round(pw.stored)} / ${Math.round(cap)} MJ` : "No power cell";
  el.powerFlow.textContent = `Using ${round1(pw.draw)} of ${round1(pw.gen)} MJ/s`;

  // Beam progress toward the next ore: a small bar with the percentage, shown
  // only while the beam is actually cutting, right under the "left in rock"
  // hint.
  const fittedBeam = (state.beams || [])[0];
  el.beam.hidden = !(F.beamOn && fittedBeam);
  if (!el.beam.hidden) {
    const pct = Math.min(100, Math.floor(((F.beamT || 0) / fittedBeam.period) * 100));
    el.beamBar.style.width = pct + "%";
    el.beamName.textContent = fittedBeam.n;
    el.beamPct.textContent = `${pct}%`;
  }

  if (!state.warp && sectorAt(state.sector).st && P.m.position.length() < 300) {
    say(P.v.length() < 70 ? "Press G to dock at Meridian Outpost" : "Slow below 70 m/s to dock");
  }
  // A ship with no thrusters cannot move, so say why the controls do nothing.
  el.prompt.textContent =
    H.prompt || (state.drive.spd > 0 ? "" : "No thrusters fitted: press G to dock and fit one.");
  H.prompt = "";

  el.msg.textContent = H.msgT > 0 ? H.msg : "";
  if (H.msgT > 0) H.msgT -= dt;

  // The sim says the lock cone in degrees; the ring's size in pixels is the
  // screen's business (step 6b). Same formula and the same numbers as before.
  const coneRadius = coneRadiusPx(F.coneAngle);
  drawLockRing(F.missileLock, coneRadius);
  el.cone.style.display = coneRadius > 0 ? "block" : "none";
  if (coneRadius > 0) {
    el.cone.style.width = el.cone.style.height = 2 * coneRadius + "px";
  }

  drawMarkers();
}

/** One decimal at most, so 10 does not print as 10.0 and 0.25 does not print as 0. */
const round1 = v => (Math.round(v * 10) / 10).toString();

/** Corner brackets that tighten as the missile lock builds, then flash red. */
function drawLockRing(ML, radius) {
  const ctx = el.reticle;
  ctx.clearRect(0, 0, 160, 160);
  if (!(state.missiles || []).length || state.player.docked || !ML.target) return;

  const raw = ML.locked ? 1 : Math.min(1, ML.t / MISSILE.lock);
  const pr = raw < 1 ? raw * 0.5 * (1 + raw) : 1;
  const cx = 80,
    cy = 80;
  const flashOn = ML.locked && Math.sin(state.time * 18) > 0;
  const r = 58 - 24 * pr,
    len = r * 0.45;

  ctx.lineCap = "square";
  const alpha = 0.35 + 0.65 * pr,
    lw = 1.6 + pr * 1.2;
  ctx.strokeStyle = ML.locked ? (flashOn ? "#ffffff" : "#ff3030") : `rgba(224,164,88,${alpha})`;
  ctx.lineWidth = lw;
  [[1, 1], [-1, 1], [-1, -1], [1, -1]].forEach(([sx, sy]) => {
    const bx = cx + sx * r,
      by = cy + sy * r;
    ctx.beginPath();
    ctx.moveTo(bx - sx * len, by);
    ctx.lineTo(bx, by);
    ctx.lineTo(bx, by - sy * len);
    ctx.stroke();
  });
}

/**
 * Place a label on screen for a world point. Off-screen points are pinned
 * to the screen edge in their direction.
 */
function mark(p, text, cls, ox, oy) {
  if (markerCount >= MARKER_POOL) return;
  camera.updateMatrixWorld();
  const el_ = markers[markerCount++];
  const v = p.clone().project(camera);
  const pc = p.clone().applyMatrix4(camera.matrixWorldInverse);
  const W = innerWidth,
    H = innerHeight;

  let x, y;
  if (pc.z < 0 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1) {
    x = (v.x * 0.5 + 0.5) * W + (ox || 0);
    y = (-v.y * 0.5 + 0.5) * H + (oy || 0);
  } else {
    let dx = pc.x,
      dy = pc.y;
    if (Math.hypot(dx, dy) < 1e-3) {
      dx = 0;
      dy = -1;
    }
    const t = Math.min((W * 0.34) / (Math.abs(dx) || 1e-9), (H * 0.33) / (Math.abs(dy) || 1e-9));
    x = W / 2 + dx * t;
    y = H / 2 - dy * t;
  }
  x = Math.max(MARKER_MARGIN_X, Math.min(W - MARKER_MARGIN_X, x));
  y = Math.max(MARKER_MARGIN_Y, Math.min(H - MARKER_MARGIN_Y, y));

  el_.style.cssText = `display:block;left:${x}px;top:${y}px`;
  el_.className = "mk " + cls;
  el_.textContent = text === null ? "" : text + " " + fmtDist(state.player.m.position.distanceTo(p));
}

function drawMarkers() {
  const W = state.world,
    F = state.flight,
    P = state.player;
  markerCount = 0;

  const here = sectorAt(state.sector);
  if (here.st && !(F.lock && F.lock.k === "s")) mark(STATION_POS, "Meridian Outpost", "i");
  if (here.fd) mark(FIELD_CENTER, "Asteroid field", "");

  pruneLock();
  const lock = F.lock;

  W.enemies.forEach(e => {
    if (lock && lock.o === e) return;
    mark(e.pos, "Hostile", lock ? "h dim" : "h", 70, -36);
  });

  if (lock) {
    const hostile = lock.k === "e";
    const pos = lockPosition(lock);
    mark(pos, "Locked " + lockName(lock), hostile ? "h lock" : "lock", 70, -36);
    mark(pos, null, hostile ? "h lk" : "lk");
  }

  W.crates.forEach(c => {
    if (c !== (lock && lock.o) && P.m.position.distanceTo(c.m.position) < 900) {
      mark(c.m.position, "Crate", "");
    }
  });

  for (let i = markerCount; i < MARKER_POOL; i++) markers[i].style.display = "none";
}
