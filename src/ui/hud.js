import { POCKET_FILTERS, pocketRowsHtml, pocketType, readPocketFilters, savePocketFilters, sortedPocketRows, cleanFilterPresets, presetSlotsHtml, presetMenuHtml } from './pocket-list.js';
import { playerMount } from '../sim/pilot.js';
import { pocketObjects, interceptPoint, displayedSpeed } from '../sim/flight-instruments.js';
import { primarySlotIndex } from '../sim/weapons.js';
import { locationText } from "./location-display.js";
import { weaponSlotsHtml } from "./weapon-slots.js";
import { meterHeight, meterPercent, meterValue, throttleDisplay } from "./vitals.js";
// In-flight HUD: shield, hull and boost bars, cargo and mission readout,
// the missile lock ring, and the markers for targets and the outpost.

import { beltLabelGroups, targetOnScreen, targetHealthMarkup, markerStyle, lockMarkerStyle, markerClasses } from "./target-display.js";
import { fmtDist } from "../util/math.js";
import { on, emit } from "../util/events.js";
import { shipDef } from "../data/ships.js";
import { itemName } from "../data/items.js";
import { featuresOf, featureById } from "../data/places.js";
import { term } from "../data/terms.js";
import { camera } from "../render/scene.js";
import { interpolatedPos, interpolatedVelocity, renderPlayerPose } from "../render/views.js";
import { state, say, instanceAt, saveCurrentGame } from "../state/state.js";
import { holdLoad } from "../sim/economy.js";
import { activeMissions, missionDescription, missionNextText, missionProgress, missionRecoveryText } from "../sim/missions.js";
import { campaignDetailHtml, missionWaypoints, objectObjectiveColor } from "./mission-hud.js";
import { pruneLock, lockPosition, lockName, targetHealth, isPocketRowLocked } from "../sim/targeting.js";
import { fieldMarkerPosition } from "../sim/asteroids.js";
import { stationAt } from "../sim/places.js";
import { cacheUnits, exitDenial, instanceTimeLeft } from "../sim/instances.js";
import { V } from "../util/math.js";
import { MISSILE, MISSILE_HUD, BULLET_LIFETIME } from "../data/weapons.js";
import { findDestinationRoute } from "../sim/travel.js";
import { localPlayer, profileOf } from "../state/state.js";
import { routeDisplay, flightRouteRows, escapeRouteText } from "./route-display.js";

const $ = id => document.getElementById(id);
const MARKER_POOL = 28;
const MARKER_MARGIN_X = 75;   // keep labels this far from the screen edge
const MARKER_MARGIN_Y = 30;
// A locked target slower than this (m/s) has nothing to lead, so the ballistic pip stays away:
// its "intercept" is the hull itself and it would sit on the lock marker already drawn there.
const LEAD_MIN_SPEED = 0.5;

let markers = [];
let markerCount = 0;
let markerRoot = null;
let beltPlace = null, beltGroups = [];
let el = {};
let routeCache = null;
let weaponSlotsCache = null;
let navigationTimer = 0, navigationRows = [], navigationSort = 'distance', navigationDirection = 1;
let navigationFilters;
let activePreset = -1;   // index into profile.pocketFilterPresets, or -1
let presetMenuIndex = -1;
const preferenceStorage = {
  getItem: key => globalThis.localStorage.getItem(key),
  setItem: (key,value) => globalThis.localStorage.setItem(key,value),
};
const filterPresets = () => cleanFilterPresets(state.profile?.pocketFilterPresets);
function renderPresets() {
  const bar = $("pocket-filter-presets");
  if (bar) bar.innerHTML = presetSlotsHtml(filterPresets(), activePreset);
  const slot = $("pocket-preset-menu-slot");
  if (slot) slot.innerHTML = presetMenuIndex >= 0 ? presetMenuHtml(filterPresets()[presetMenuIndex], presetMenuIndex) : "";
}
function persistPresets() {
  renderPresets();
  try { saveCurrentGame(); } catch { /* a preset survives in the profile until the next save */ }
}
function applyFiltersToPanel() {
  for (const input of el.navigation?.querySelectorAll?.("[data-pocket-filter]") || []) {
    input.checked = navigationFilters[input.dataset.pocketFilter] !== false;
  }
}
function setNavigation(open) {
  const next = Boolean(open);
  state.ui.navigation = next;
  if (el.navigation) {
    el.navigation.hidden = !next;
    if (!next) {
      if (el.navigationRows?.dataset) delete el.navigationRows.dataset.hover;
      const filters = el.navigation.querySelector?.('details');
      if (filters) filters.open = false;
      const active = document.activeElement;
      if (active && el.navigation.contains?.(active)) active.blur?.();
    }
  }
  document.body?.classList?.toggle('navigation-open', next);
  navigationTimer = 0;
  emit('navigation-input');
}
function syncNavigationSelection(P = localPlayer()) {
  if (!el.navigationRows?.querySelectorAll) return;
  const lock = P?.flight?.lock || null;
  const place = P?.place || state.place;
  for (const button of el.navigationRows.querySelectorAll('button[data-pocket-row]')) {
    const row = navigationRows[Number(button.dataset.pocketRow)];
    const selected = isPocketRowLocked(row, lock, place);
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
    button.parentElement?.classList?.toggle('selected', selected);
  }
}

/**
 * Show or hide the flight HUD, the world-space markers **and** the system pointer
 * with it. The markers live outside `#hud` (`#mk`, they are `position: fixed`),
 * so hiding only the HUD leaves the last drawn set of tags — "Trade lane
 * asteroid field" and the like — floating over whatever replaced the flight
 * view, the title screen included. The canvas hides the pointer for
 * mouse-look flight (`styles.css`), and the HUD draws its own reticle (`#cur`);
 * while the HUD is away — the title screen, or docked at a station — the
 * reticle is gone too, so the real pointer has to come back or the mouse
 * disappears over the empty screen.
 */
function setReticle(visible) {
  el.root.hidden = !visible;
  if (!visible) setNavigation(false);
  if (markerRoot) markerRoot.style.display = visible ? "" : "none";
  if (document.body && document.body.classList) {
    document.body.classList.toggle("no-reticle", !visible);
  }
}

export function setupHud() {
  el = {
    root: $("hud"),
    navigation: $("pocket-objects"),
    navigationRows: $("pocket-object-rows"),
    lead: $("weapon-lead"),
    weaponSlots: $("weapon-slots"),
    shield: $("b1"),
    hull: $("b2"),
    boost: $("b3"),
    boostVal: $("boost-val"),
    route: $("hud-route"),
    shieldVal: $("sh-val"),
    hullVal: $("hull-val"),
    topRight: $("tr"),
    systemName: $("system-name"),
    pocketName: $("pocket-name"),
    throttleFill: $("throttle-fill"),
    throttleLabel: $("throttle-label"),
    speed: $("speed"),
    shieldPercent: $("sh-pct"),
    hullPercent: $("hull-pct"),
    boostPercent: $("boost-pct"),
    powerPercent: $("pw-pct"),
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

  routeCache = null;
  weaponSlotsCache = null;
  markerRoot = $("mk");
  const container = markerRoot;
  for (let i = 0; i < MARKER_POOL; i++) {
    const d = document.createElement("div");
    d.className = "mk";
    container.appendChild(d);
    markers.push(d);
  }

  // Clicking the route must not fire weapons; weapon slots are keyboard-only (1–5, 6–0)
  // so turning down with the mouse never clicks a slot.
  el.route?.addEventListener("mousedown", e => e.stopPropagation());


  navigationRows = [];
  navigationSort = 'distance';
  navigationDirection = 1;
  navigationFilters = readPocketFilters(preferenceStorage);
  $("pocket-filters").innerHTML = POCKET_FILTERS.map(type=>`<label><input type="checkbox" data-pocket-filter="${type}" ${navigationFilters[type]?'checked':''}>${type}</label>`).join('');
  renderPresets();
  on("navigation-toggle", open => setNavigation(typeof open === "boolean" ? open : !state.ui.navigation));
  on("place-entered", () => {
    beltPlace = null;
    if (el.navigationRows?.dataset) delete el.navigationRows.dataset.hover;
    navigationTimer = 0;
  });
  el.navigation.addEventListener("mousedown", e => e.stopPropagation());
  el.navigation.addEventListener("wheel", e => e.stopPropagation());
  el.navigation.addEventListener("change", e => {
    const type = e.target.dataset.pocketFilter;
    if (!type) return;
    navigationFilters[type] = e.target.checked;
    savePocketFilters(preferenceStorage, navigationFilters);
    // Editing filters with a preset selected edits the preset itself.
    if (activePreset >= 0 && state.profile) {
      const presets = filterPresets();
      if (presets[activePreset]) {
        presets[activePreset] = { ...presets[activePreset], filters: { ...navigationFilters } };
        state.profile.pocketFilterPresets = presets;
        persistPresets();
      }
    }
    navigationTimer = 0;
  });
  el.navigation.addEventListener("contextmenu", e => {
    const presetButton = e.target.closest?.("[data-pocket-preset]");
    if (!presetButton) return;
    e.preventDefault();
    const index = Number(presetButton.dataset.pocketPreset);
    if (!filterPresets()[index]) return;   // an empty plus box has no menu
    presetMenuIndex = presetMenuIndex === index ? -1 : index;
    renderPresets();
  });
  el.navigation.addEventListener("click", e => {
    const rename = e.target.closest?.("[data-preset-rename]");
    const resetPreset = e.target.closest?.("[data-preset-reset]");
    if (rename || resetPreset) {
      const index = Number((rename || resetPreset).dataset.presetRename ?? (rename || resetPreset).dataset.presetReset);
      const presets = filterPresets();
      if (state.profile && presets[index]) {
        if (rename) {
          const input = el.navigation.querySelector("[data-preset-name]");
          presets[index] = { ...presets[index], name: String(input?.value || presets[index].name).slice(0, 40) || presets[index].name };
        } else {
          presets[index] = null;
          if (activePreset === index) activePreset = -1;
        }
        state.profile.pocketFilterPresets = presets;
      }
      presetMenuIndex = -1;
      persistPresets();
      navigationTimer = 0;
      return;
    }
    const presetButton = e.target.closest?.("[data-pocket-preset]");
    if (presetButton) {
      const index = Number(presetButton.dataset.pocketPreset);
      const presets = filterPresets();
      if (!presets[index]) {
        // An empty plus box takes the current filters.
        presets[index] = { name: `Filter ${index + 1}`, filters: { ...navigationFilters } };
        if (state.profile) state.profile.pocketFilterPresets = presets;
        activePreset = index;
      } else {
        activePreset = index;
        navigationFilters = { ...presets[index].filters };
        savePocketFilters(preferenceStorage, navigationFilters);
        applyFiltersToPanel();
      }
      presetMenuIndex = -1;
      persistPresets();
      navigationTimer = 0;
      return;
    }
    if (e.target.closest?.('#close-pocket-objects')) {
      e.preventDefault?.();
      setNavigation(false);
      return;
    }
    const sort = e.target.closest?.('[data-pocket-sort]');
    if (sort) {
      const key = sort.dataset.pocketSort;
      navigationDirection = navigationSort === key ? -navigationDirection : 1;
      navigationSort = key;
      for (const button of el.navigation.querySelectorAll('[data-pocket-sort]')) {
        button.setAttribute('aria-pressed', String(button === sort));
        button.textContent = button.dataset.pocketSort.replace(/^./, c=>c.toUpperCase()) + (button === sort ? (navigationDirection===1?' ↑':' ↓'):'');
      }
      if (e.detail > 0) sort.blur?.();
      navigationTimer = 0;
      return;
    }
    const row = e.target.closest?.('[data-pocket-row]');
    const entry = row && navigationRows[Number(row.dataset.pocketRow)];
    if (entry) {
      emit('navigation-select', entry.object);
      syncNavigationSelection(localPlayer());
      if (e.detail > 0) row.blur?.();
    }
  });
  $("close-pocket-objects").addEventListener("click", e => {
    e.preventDefault?.();
    e.stopPropagation?.();
    setNavigation(false);
  });
  // Avoid replacing a row between pointer-down and click, or a focused keyboard action.
  el.navigationRows.addEventListener('pointerenter', () => el.navigationRows.dataset.hover = '1');
  el.navigationRows.addEventListener('pointerleave', () => { delete el.navigationRows.dataset.hover; navigationTimer = 0; });


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
    weaponSlotsCache = null;
    setReticle(true);
  });
  on("campaign-act-entered", () => {
    weaponSlotsCache = null;
    setReticle(Boolean(state.player && !state.player.docked));
  });
  on("main-menu", () => {
    setReticle(false);
    routeCache = null;
    weaponSlotsCache = null;
  });

  // The title screen boots with the HUD hidden (index.html), so sync the pointer
  // with whatever the shell started with, and always start with the N list closed.
  setNavigation(false);
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
    // A recovery contract counts its own crates: "2 out of 3 crates recovered"
    // says what is left to fly out for, and the hand-in line stays a hand-in.
    const recovered = missionRecoveryText(mission);
    // Contracts are ordinary work and read light blue; story missions keep the
    // amber so a story always stands out in the top-right block.
    const kind = mission.kind === "contract" ? "contract" : "story";
    return `<div class="hud-mission hud-mission-${kind}"><strong>${escHud(missionDescription(mission))}:</strong>` +
      `<span class="hud-mission-objective">${escHud(missionNextText(mission))}</span>${
        campaignDetailHtml(mission, { hold: state.ui.controlHold, run: state.ui.chaseRun })
      }${progress ? `<small>${progress.done} of ${progress.total} defeated</small>` : ""}${
        recovered ? `<small>${recovered}</small>` : ""
      }</div>`;
  }).join("")}</div>`;
}

/** mm:ss for an instance's remaining lifetime. */
const clockText = seconds => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * The instance block (step 14): what this run asks for, how long it has left, and whether the way
 * out is open. All three are read from the instance's own record — the objective sentence is the
 * authored one (`data/instances.js`), and the refusal is the template's own words, so the HUD never
 * invents a rule (LESSONS L11).
 */
function instanceHtml(record) {
  if (!record) return "";
  const lines = [];
  if (record.objective.n) {
    lines.push(
      `<span class="hud-mission-objective">${escHud(
        record.objective.met ? `${record.objective.n} — done` : record.objective.n
      )}</span>`
    );
  }
  if (record.lifetime > 0) {
    lines.push(`<small>${escHud(record.n)} collapses in ${clockText(instanceTimeLeft(record))}</small>`);
  }
  const cache = record.cache;
  if (cacheUnits(cache) > 0) {
    lines.push(
      `<small>${escHud(
        cache.open ? `${cache.n} is open — fly to it and press R` : `${cache.n} is locked`
      )}</small>`
    );
  }
  const denial = exitDenial(record);
  lines.push(
    `<small>${
      denial ? escHud(denial) : `${escHud(record.exit.n)} is open — fly back to it and press R`
    }</small>`
  );
  return `<div class="hud-mission hud-mission-story" aria-label="This instance">${lines.join("")}</div>`;
}

export function updateHud(dt) {
  const P = state.player,
    S = state.profile,
    F = state.flight,
    H = state.hud,
    d = shipDef(S.ship),
    missions = activeMissions(S);

  el.shield.style.height = meterHeight(P.sh, P.shMax);
  el.hull.style.height = meterHeight(P.hull, P.hullMax);
  el.boost.style.height = meterHeight(P.en, P.enMax);
  // Numbers below every column, so each pool can be read exactly as well as roughly.
  el.shieldVal.textContent = meterValue(P.sh, P.shMax, " HP");
  el.hullVal.textContent = meterValue(P.hull, P.hullMax, " HP");
  el.boostVal.textContent = meterValue(P.en, P.enMax, " U");
  el.shieldPercent.textContent = meterPercent(P.sh, P.shMax);
  el.hullPercent.textContent = meterPercent(P.hull, P.hullMax);
  el.boostPercent.textContent = meterPercent(P.en, P.enMax);

  updateHudRoute(dt);

  const slotsHtml = weaponSlotsHtml(S);
  if (el.weaponSlots && weaponSlotsCache !== slotsHtml) {
    el.weaponSlots.innerHTML = slotsHtml;
    weaponSlotsCache = slotsHtml;
  }

  const location = locationText(state.place);
  el.systemName.textContent = location.system;
  el.pocketName.textContent = location.pocket;
  el.topRight.innerHTML =
    instanceHtml(instanceAt(state.place)) +
    `${S.cr} cr<br>Hold ${holdLoad()}/${d.cargo} m³<br>` +
    missionsHtml(missions);

  const throttle = throttleDisplay(P.thr);
  el.throttleFill.style.width = throttle.width;
  el.throttleFill.classList.toggle("reverse", throttle.reverse);
  el.throttleLabel.textContent = throttle.label;
  el.speed.textContent = `${displayedSpeed(P, !!state.warp)} m/s`;

  // Ship power: what the cells hold, and what the powerplants are making.
  const pw = state.power,
    cap = Math.max(0, pw.cap);
  el.powerBar.style.height = meterHeight(pw.stored, cap);
  el.powerValue.textContent = meterValue(pw.stored, cap, " MJ");
  el.powerPercent.textContent = meterPercent(pw.stored, cap);
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
    const dockSpd = Math.max(P.v.length(), P.measuredSpeed || 0);
    say(dockSpd < (station.dockSpeed ?? 70) ? `Press G to dock at ${station.n}` : `Slow below ${station.dockSpeed ?? 70} m/s to dock`);
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
  updateInstruments(dt, P, F);

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
  ctx.clearRect(0, 0, MISSILE_HUD.canvas, MISSILE_HUD.canvas);
  if (!(state.missiles || []).length || state.player.docked || !ML.target) return;

  const raw = ML.locked ? 1 : Math.min(1, ML.t / MISSILE.lock);
  const pr = raw < 1 ? raw * 0.5 * (1 + raw) : 1;
  const cx = MISSILE_HUD.canvas / 2,
    cy = MISSILE_HUD.canvas / 2;
  const flashOn = ML.locked && Math.sin(state.time * 18) > 0;
  const r = MISSILE_HUD.startRadius - (MISSILE_HUD.startRadius - MISSILE_HUD.endRadius) * pr,
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
function mark(p, text, style, ox, oy, health = null, extraCls = "", objectiveColor = "") {
  if (markerCount >= MARKER_POOL) return;
  camera.updateMatrixWorld();
  const el_ = markers[markerCount++];
  const pc = p.clone().applyMatrix4(camera.matrixWorldInverse);
  const W = innerWidth,
    H = innerHeight;
  // Frame NDC of the point through the stock projection.
  let v = null;
  const pv = p.clone().project(camera);
  const visible = targetOnScreen(pc.z, pv);
  if (visible) v = { x: pv.x, y: pv.y };

  let x, y;
  if (v && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1) {
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

  const tone = typeof style === "string" ? style : style?.tone || "";
  const color = typeof style === "object" && style?.color ? `;--marker-color:${style.color}` : "";
  const objStyle = objectiveColor ? `;--objective-color:${objectiveColor}` : "";
  el_.style.cssText = `display:block;left:${x}px;top:${y}px${color}${objStyle}`;
  el_.className = markerClasses("mk", tone, extraCls, objectiveColor ? "obj" : "");
  // Name and distance are separate spans and the distance sits in a
  // fixed-width tabular slot, so a label cannot resize (and shake) when the
  // range ticks from 1000 m to 900 m and back.
  if (text === null) {
    el_.textContent = "";
  } else {
    const dist = fmtDist(state.player.pos.distanceTo(p));
    const spans = `<span class="mk-name">${escHud(text)}</span> <span class="mk-dist">${escHud(dist)}</span>`;
    el_.innerHTML = health ? `${targetHealthMarkup(health)}${spans}` : spans;
  }
  return visible;
}

function drawMarkers() {
  const W = state.world,
    F = state.flight,
    P = state.player;
  markerCount = 0;

  pruneLock();
  const lock = F.lock;
  // One objective snapshot for the whole frame: markers, locks and waypoints all
  // read the same active mission list instead of walking the profile per label.
  const objCtx = { place: state.place, profile: state.profile, world: W, worldState: state.worldState, missions: activeMissions(state.profile) };

  // The N panel's filters govern the floating labels too: a filtered-out kind
  // draws no label, but the object is still there to be looked at and F-locked
  // (a lock always draws its label). Rocks are never labelled, as before.
  const labelOn = kind => navigationFilters?.[pocketType(kind)] !== false;
  for (const f of featuresOf(state.place, "station")) {
    const locked = lock && lock.k === "s" && lock.o?.place === state.place && lock.o?.feature === f.id;
    const objColor = objectObjectiveColor(f, "station", objCtx);
    if (!locked && labelOn("station")) mark(V(...f.pos), f.n, markerStyle("station", f), 0, 0, null, "", objColor);
  }
  if (beltPlace !== state.place) {
    beltGroups = beltLabelGroups(featuresOf(state.place, "asteroidField"));
    beltPlace = state.place;
  }
  const fieldLock = lock?.k === "n" && lock.o?.place === state.place && lock.o.source?.kind === "asteroidField"
    ? lock.o.source : null;
  let lockedBeltName;
  let lockedBeltGroup = null;
  for (const group of beltGroups) {
    const { main, members } = group;
    if (fieldLock && members.some(f => f.id === fieldLock.id)) {
      lockedBeltName = main.n;
      lockedBeltGroup = group;
    } else if (labelOn("asteroidField")) {
      const objColor = objectObjectiveColor(group, "asteroidField", objCtx);
      mark(V(...fieldMarkerPosition(main)), main.n, markerStyle("asteroidField", main), 0, 0, null, "", objColor);
    }
  }

  W.enemies.forEach(e => {
    if (lock && lock.o === e) return;
    if (!labelOn("Ship")) return;
    const kind = e.friendly ? "Ship" : "Hostile";
    const objColor = objectObjectiveColor(e, kind, objCtx);
    mark(interpolatedPos(e), e.role === "prowl" ? "Unmarked" : e.friendly ? e.n : "Hostile", markerStyle(kind, e), 70, -36, null, lock && !objColor ? "dim" : "", objColor);
  });

  // Step 16 slice 8a (playtest 23): another pilot is a ship in the sky like any other, so it wears
  // its pilot's name. Without this a friend's hull was an anonymous shape until F found it, which
  // is not what "like any other ship" means. The locked one is labelled by the lock marker instead.
  for (const pilot of state.otherPilots || []) {
    if (pilot.dead || pilot.place !== (P.place || state.place)) continue;
    if (lock && lock.k === "p" && lock.o === pilot) continue;
    if (!labelOn("Ship")) continue;
    mark(interpolatedPos(pilot), pilot.name || "Pilot", markerStyle("Ship", pilot), 70, -36, null, lock ? "dim" : "");
  }

  if (lock) {
    // Which locks carry hull/shield bars. A hostile has had them since the bars existed; another
    // pilot gets them now (playtest 23: "hull/shield stats like any other ship"). Nothing else in
    // the sky has a health pool, so nothing else shows one.
    const bars = lock.k === "e" || lock.k === "p";
    const style = lockMarkerStyle(lock, o => featureById(o?.place, o?.feature));
    const lockObj = lock.k === "s"
      ? featureById(lock.o?.place, lock.o?.feature)
      : lockedBeltGroup || (lock.k === "n" ? lock.o?.source : lock.o);
    const lockKind = lock.k === "s"
      ? "station"
      : lockedBeltGroup
        ? "asteroidField"
        : lock.k === "n"
          ? (lock.o?.rowKind || lock.o?.source?.kind || "")
          : lock.k;
    const objColor = objectObjectiveColor(lockObj, lockKind, objCtx);
    const pos = lock.o && lock.o.pos ? interpolatedPos(lock.o) : lockPosition(lock);
    const visible = mark(pos, lockedBeltName ?? lockName(lock), style, 70, -36, bars ? targetHealth(lock.o) : null, "lock", objColor);
    if (visible) mark(pos, null, style, 0, 0, null, "lk", objColor);
  }

  W.crates.forEach(c => {
    if (c === (lock && lock.o)) return;
    if (!labelOn("Cargo")) return;
    const objColor = objectObjectiveColor(c, "Cargo", objCtx);
    if (objColor || P.pos.distanceTo(c.pos) < 900) {
      // A mission item is labelled by its own name (Beacon, parcel…) and
      // carries the mission's objective glow via objColor; ordinary loot
      // stays a plain "Crate".
      const label = c.persistent && c.missionId ? itemName(c.item) : "Crate";
      mark(interpolatedPos(c), label, markerStyle("Cargo", c), 0, 0, null, "", objColor);
    }
  });

  // Step 14: the doors, the way out and the prize canister are always labelled — a run is a place
  // with nothing else in it to judge distance by, and losing the way out is losing the ship.
  for (const r of W.rifts || []) {
    if (r !== (lock && lock.o) && labelOn("Rift")) mark(interpolatedPos(r), r.dest || r.n || "Rift", markerStyle("Rift", r));
  }
  for (const g of W.gates || []) {
    if (g !== (lock && lock.o) && labelOn("Gate")) mark(interpolatedPos(g), g.locked ? `${g.n} (sealed)` : `${g.n} (open)`, markerStyle("Gate", g));
  }
  for (const k of W.caches || []) {
    if (k !== (lock && lock.o) && labelOn("Cache")) mark(interpolatedPos(k), k.locked ? `${k.n} (locked)` : `${k.n} (open)`, markerStyle("Cache", k));
  }

  for (const wp of missionWaypoints(objCtx)) {
    mark(V(...wp.pos), wp.label, { tone: "", color: wp.color }, 0, 0, null, "waypoint", wp.color);
  }

  for (let i = markerCount; i < MARKER_POOL; i++) markers[i].style.display = "none";
}

// Navigation overlay: keyboard flight continues; N, Escape or Close hides it.
function updateInstruments(dt, P, F) {
  navigationTimer -= dt;
  if (state.ui.navigation) {
    if (navigationTimer <= 0) {
      navigationTimer = 0.25;
      const focused = document.activeElement && el.navigationRows.contains?.(document.activeElement);
      if (!el.navigationRows.dataset?.hover && !focused) {
        const place = P.place || state.place;
        const objCtx = { place, profile: state.profile, world: state.world, worldState: state.worldState, missions: activeMissions(state.profile) };
        navigationRows = sortedPocketRows(pocketObjects(P), navigationFilters, navigationSort, navigationDirection);
        el.navigationRows.innerHTML = pocketRowsHtml(
          navigationRows,
          row => isPocketRowLocked(row, F.lock, place),
          row => objectObjectiveColor(row.object, row.kind, objCtx),
        );
      } else {
        syncNavigationSelection(P);
      }
    } else {
      syncNavigationSelection(P);
    }
  }
  el.lead.hidden = true;
  const lock = F.lock;
  if (state.warp || P.docked || !lock) return;
  // **Whatever F has locked, if it moves** (owner, playtest 25: *"ALL objects, ships, npcs,
  // players, anything that has a velocity and is selected with F with a weapon that isnt hitscan
  // has the lead indicator"*). It used to be hostiles only (`lock.k === 'e'`), so locking a
  // visiting pilot — which playtest 23 made possible — showed no pip at all.
  //
  // Two gates are left, and both are about the shot rather than the target: a wreck is not worth
  // aiming at, and a target that is not moving has nowhere to be but where it is, so its "lead" is
  // the hull itself and the pip would only sit on the marker already there. A rock, a crate at
  // rest, a station and a rift door all answer 0 m/s and keep the screen quiet.
  if (Number.isFinite(lock.o?.hp) && lock.o.hp <= 0) return;
  // The weapon is still the **selected primary bay** (owner, playtest 25: *"make the lead
  // indicator currently only be for primary weapon, it's easier that way right now"*): a gun in
  // that bay leads; an empty bay or the hitscan mining beam does not suggest a ballistic lead.
  const gun = P.guns.find(g => g.i === primarySlotIndex(state.profile.pw, P));
  if (!gun) return;
  const targetVel = interpolatedVelocity(lock.o);
  if (targetVel.lengthSq() < LEAD_MIN_SPEED * LEAD_MIN_SPEED) return;
  // Use the camera/hull render time, not the next fixed-step pose.
  const pose = renderPlayerPose(P);
  const barrels = Math.max(1, gun.barrels || 1);
  const origin = playerMount('gun', gun.i, 0, barrels, pose, state.profile.ship);
  if (barrels > 1) origin.add(playerMount('gun', gun.i, barrels-1, barrels, pose, state.profile.ship)).multiplyScalar(0.5);
  // Where the screen drew it, not the next fixed-step pose — the same render time as the origin.
  const point = interceptPoint(origin, pose.v, interpolatedPos(lock.o), targetVel, gun.speed, BULLET_LIFETIME);
  if (!point) return;
  const screen = point.project(camera);
  if (screen.z < -1 || screen.z > 1 || Math.abs(screen.x) > 1 || Math.abs(screen.y) > 1) return;
  el.lead.hidden = false;
  el.lead.style.left = `${(screen.x+1)*innerWidth/2}px`;
  el.lead.style.top = `${(1-screen.y)*innerHeight/2}px`;
}
