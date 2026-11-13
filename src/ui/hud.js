// In-flight HUD: shield, hull and boost bars, cargo and mission readout,
// the missile lock ring, and the markers for targets and the outpost.

import { fmtDist } from "../util/math.js";
import { on } from "../util/events.js";
import { SHIPS } from "../data/ships.js";
import { placeAt, featuresOf } from "../data/places.js";
import { term } from "../data/terms.js";
import { camera } from "../render/scene.js";
import { interpolatedPos } from "../render/views.js";
import { state, say } from "../state/state.js";
import { holdLoad } from "../sim/economy.js";
import { moduleListName } from "../sim/guns.js";
import { activeMissions, missionDescription, missionNextText, missionProgress } from "../sim/missions.js";
import { pruneLock, lockPosition, lockName } from "../sim/targeting.js";
import { stationAt } from "../sim/places.js";
import { V } from "../util/math.js";
import { MISSILE } from "../data/weapons.js";
import { findDestinationRoute } from "../sim/travel.js";
import { localPlayer, profileOf } from "../state/state.js";
import { routeDisplay, flightRouteRows, escapeRouteText } from "./route-display.js";

const $ = id => document.getElementById(id);
const MARKER_POOL = 18;
const MARKER_MARGIN_X = 75;   // keep labels this far from the screen edge
const MARKER_MARGIN_Y = 30;

let markers = [];
let markerCount = 0;
let el = {};
let routeCache = null;

/**
 * Show or hide the flight HUD **and** the system pointer with it. The canvas
 * hides the pointer for mouse-look flight (`styles.css`), and the HUD draws its
 * own reticle (`#cur`); while the HUD is away — the title screen, or docked at a
 * station — the reticle is gone too, so the real pointer has to come back or the
 * mouse disappears over the empty screen.
 */
function setReticle(visible) {
  el.root.hidden = !visible;
  if (document.body && document.body.classList) {
    document.body.classList.toggle("no-reticle", !visible);
  }
}

export function setupHud() {
  el = {
    root: $("hud"),
    shield: $("b1"),
    hull: $("b2"),
    boost: $("b3"),
    boostVal: $("boost-val"),
    route: $("hud-route"),
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
    warpHint: $("warp-hint"),
  };

  routeCache = null;
  const container = $("mk");
  for (let i = 0; i < MARKER_POOL; i++) {
    const d = document.createElement("div");
    d.className = "mk";
    container.appendChild(d);
    markers.push(d);
  }

  // Clicking the route must not fire weapons.
  el.route?.addEventListener("mousedown", e => e.stopPropagation());

  if (el.warpHint) el.warpHint.textContent = "M starmap";

  addEventListener("mousemove", e => {
    el.cursor.style.left = e.clientX + "px";
    el.cursor.style.top = e.clientY + "px";
  });

  on("docked", ({ player } = {}) => {
    if (player && player !== state.player) return;
    setReticle(false);
  });
  on("launched", ({ player } = {}) => {
    if (state.ui.intro) return;
    if (player && player !== state.player) return;
    setReticle(true);
  });
  on("main-menu", () => {
    setReticle(false);
    routeCache = null;
  });

  // The title screen boots with the HUD hidden (index.html), so sync the pointer
  // with whatever the shell started with.
  setReticle(!el.root.hidden);
  on("hurt", ({ shielded, player }) => {
    if (player && player !== state.player) return;
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
const escHud = value => String(value ?? "").replace(/[&<>\"']/g, c => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '\"': "&quot;",
  "'": "&#39;",
}[c]));

function missionsHtml(missions) {
  if (!missions.length) return `<span style="color:var(--amber)">No active missions</span>`;
  return `<div class="hud-missions" aria-label="Active missions">${missions.map(mission => {
    const progress = mission.type === "hunt" ? missionProgress(mission) : null;
    // Contracts are ordinary work and read light blue; story missions keep the
    // amber so a story always stands out in the top-right block.
    const kind = mission.kind === "contract" ? "contract" : "story";
    return `<div class="hud-mission hud-mission-${kind}"><strong>${escHud(missionDescription(mission))}:</strong>` +
      `<span class="hud-mission-objective">${escHud(missionNextText(mission))}</span>${
        progress ? `<small>${progress.done} of ${progress.total} defeated</small>` : ""
      }</div>`;
  }).join("")}</div>`;
}

export function updateHud(dt) {
  const P = state.player,
    S = state.profile,
    F = state.flight,
    H = state.hud,
    d = SHIPS[S.ship],
    missions = activeMissions(S);

  el.shield.style.width = (P.shMax > 0 ? Math.max(0, P.sh / P.shMax) : 0) * 100 + "%";
  el.hull.style.width = (P.hullMax > 0 ? Math.max(0, P.hull / P.hullMax) * 100 : 0) + "%";
  el.boost.style.width = (P.enMax > 0 ? Math.max(0, Math.min(1, P.en / P.enMax)) : 0) * 100 + "%";
  // Numbers beside every bar, so each pool can be read exactly as well as roughly.
  el.shieldVal.textContent = P.shMax > 0 ? `${Math.round(P.sh)} / ${Math.round(P.shMax)}` : "none";
  el.hullVal.textContent = P.hullMax > 0 ? `${Math.round(P.hull)} / ${Math.round(P.hullMax)}` : "none";
  el.boostVal.textContent = P.enMax > 0 ? `${Math.round(P.en)} / ${Math.round(P.enMax)}` : "none";

  updateHudRoute(dt);

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
    `${placeAt(state.place).n}<br>` +
    `${S.cr} cr<br>Hold ${holdLoad()}/${d.cargo} m³<br>` +
    `${primary}${(state.missiles || []).length ? ", missiles " + S.msl : ""}<br>` +
    missionsHtml(missions);

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

  const station = stationAt(state.place);
  if (!state.warp && station && P.pos.distanceTo(V(...station.pos)) < (station.dockRange ?? 300)) {
    say(P.v.length() < (station.dockSpeed ?? 70) ? `Press G to dock at ${station.n}` : `Slow below ${station.dockSpeed ?? 70} m/s to dock`);
  }
  // A ship with no thrusters cannot move, so say why the controls do nothing.
  el.prompt.textContent =
    H.prompt || (state.drive.spd > 0 ? "" : "No thrusters fitted: press G to dock and fit one.");

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

/** Refresh the route immediately on destination/place changes and periodically for
 * changed travel rules, without running a path search on every animation frame. */
export function updateHudRoute(dt, routeElement = el.route) {
  if (!routeElement) return;
  const destination = state.ui.destination, player = localPlayer(), world = state.galaxy;
  const place = player?.place || state.place;
  const key = typeof destination === "string" ? `system:${destination}` : destination?.pocketId ? `pocket:${destination.pocketId}` : "";
  if (!key || !world || !player) {
    routeElement.hidden = true; routeCache = null; return;
  }
  if (routeCache && routeCache.key === key && routeCache.place === place && routeCache.world === world && routeCache.player === player) {
    routeCache.remaining -= Math.max(0, dt || 0);
    if (routeCache.remaining > 0) return;
  }
  const route = findDestinationRoute(world, place, destination, { player, profile: profileOf(player), world: state.worldState });
  const details = routeDisplay(world, destination, route, state.worldState.galaxy?.knowledge || {}, place);
  if (!details) { routeElement.hidden = true; routeCache = null; return; }
  // The current system is listed for orientation but is not a system left to travel to.
  const remaining = Math.max(0, details.stops.length - 1);
  const count = details.available
    ? `<span class="route-count">(${remaining} ${remaining === 1 ? "system" : "systems"})</span>`
    : "";
  const html = `<h3>Route to ${escapeRouteText(details.title)}${count ? ` ${count}` : ""}</h3>${details.available
    ? `<ol aria-label="Route systems">${flightRouteRows(details.stops)}</ol>`
    : `${details.current ? `<p class="route-here" aria-current="location">${escapeRouteText(details.current.system)}</p>` : ""}<p>No route available.</p>`}`;
  if (routeElement.innerHTML !== html) routeElement.innerHTML = html;
  routeElement.hidden = false;
  routeCache = { key, place, world, player, remaining: 0.5 };
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
  el_.textContent = text === null ? "" : text + " " + fmtDist(state.player.pos.distanceTo(p));
}

function drawMarkers() {
  const W = state.world,
    F = state.flight,
    P = state.player;
  markerCount = 0;

  for (const f of featuresOf(state.place, "station")) {
    if (!(F.lock && F.lock.k === "s")) mark(V(...f.pos), f.n, "i");
  }
  for (const f of featuresOf(state.place, "asteroidField")) mark(V(...f.pos), f.n, "");

  pruneLock();
  const lock = F.lock;

  W.enemies.forEach(e => {
    if (lock && lock.o === e) return;
    mark(interpolatedPos(e), "Hostile", lock ? "h dim" : "h", 70, -36);
  });

  if (lock) {
    const hostile = lock.k === "e";
    const pos = lock.o && lock.o.pos ? interpolatedPos(lock.o) : lockPosition(lock);
    mark(pos, "Locked " + lockName(lock), hostile ? "h lock" : "lock", 70, -36);
    mark(pos, null, hostile ? "h lk" : "lk");
  }

  W.crates.forEach(c => {
    if (c !== (lock && lock.o) && P.pos.distanceTo(c.pos) < 900) {
      mark(interpolatedPos(c), "Crate", "");
    }
  });

  for (let i = markerCount; i < MARKER_POOL; i++) markers[i].style.display = "none";
}
