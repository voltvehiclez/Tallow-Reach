// The 2D starmap (step 11B). Reads the resolved galaxy and asks sim/travel.js
// for every destination quote; it never decides adjacency or starts a warp itself.
// A chosen pocket emits a named travel action, handled by main.js through the
// existing sim/sectors.js sequence. Presentation numbers live in data/galaxy.js.

import { GALAXY } from "../data/galaxy.js";
import { PLACE_DEFS, placeAt } from "../data/places.js";
import { term, Term, terms } from "../data/terms.js";
import { state, localPlayer, profileOf } from "../state/state.js";
import { systemVisible, pocketsInSystem } from "../sim/galaxy.js";
import { travelQuote } from "../sim/travel.js";
import { emit, on } from "../util/events.js";
import { clearControls, syncControls } from "../core/input.js";
import { setAudioSuspended, uiSound } from "../core/audio.js";

let root = null;
let drag = null;
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c]));

/** Pure view helpers (tested without a browser). */
export function visibleSystems(world, knowledge = {}) {
  return world.systems.filter(s => systemVisible(world, s.id, knowledge))
    .sort((a, b) => a.n.localeCompare(b.n) || a.id.localeCompare(b.id));
}

/** One chart line per external gate pair; internal pocket hops stay in the list. */
export function systemEdges(world, knowledge = {}) {
  const seen = new Set();
  const edges = [];
  for (const link of Object.values(world.links)) {
    if (link.kind !== "gate" || link.enabled === false) continue;
    const a = world.pocketsById[link.a]?.parent;
    const b = world.pocketsById[link.b]?.parent;
    if (!a || !b || !systemVisible(world, a, knowledge) || !systemVisible(world, b, knowledge)) continue;
    const id = [a, b].sort().join("__");
    if (seen.has(id)) continue;
    seen.add(id);
    edges.push({ id, a: world.systemsById[a], b: world.systemsById[b], link });
  }
  return edges;
}

export function chartBounds(systems, padding = GALAXY.map.padding) {
  if (!systems.length) return [-padding, -padding, padding * 2, padding * 2];
  const xs = systems.map(s => s.pos[0]), ys = systems.map(s => -s.pos[1]);
  const minX = Math.min(...xs) - padding, maxX = Math.max(...xs) + padding;
  const minY = Math.min(...ys) - padding, maxY = Math.max(...ys) + padding;
  return [minX, minY, Math.max(1, maxX - minX), Math.max(1, maxY - minY)];
}

export function chartViewBox(world, view, knowledge = {}) {
  const [x, y, w, h] = chartBounds(visibleSystems(world, knowledge));
  const zoom = Math.max(GALAXY.map.minZoom, Math.min(GALAXY.map.maxZoom, view.zoom || 1));
  const vw = w / zoom, vh = h / zoom;
  return [x + (w - vw) / 2 + (view.pan?.[0] || 0), y + (h - vh) / 2 + (view.pan?.[1] || 0), vw, vh];
}

/** SVG user units per screen pixel for preserveAspectRatio="xMidYMid meet". */
export function chartPixelScale(box, width = 800, height = 600) {
  const w = Number.isFinite(width) && width > 0 ? width : 800;
  const h = Number.isFinite(height) && height > 0 ? height : 600;
  return Math.max(box[2] / w, box[3] / h) || 1;
}

export function travelContext(player = localPlayer()) {
  return { player, profile: profileOf(player), world: state.worldState };
}

/** Every pocket in an inspected system, with the reason a non-direct hop is disabled. */
export function pocketChoices(world, from, systemId, context = {}) {
  return pocketsInSystem(world, systemId).map(pocket => {
    const current = pocket.id === from;
    const quote = current
      ? { ok: false, reason: "You are here.", cost: {} }
      : travelQuote(world, from, pocket.id, context);
    const unsupportedCost = Object.entries(quote.cost || {}).length > 0;
    const peerLink = pocket.role === "gate" ? Object.values(world.links).find(l =>
      l.kind === "gate" && (l.a === pocket.id || l.b === pocket.id)) : null;
    const peer = peerLink ? world.pocketsById[peerLink.a === pocket.id ? peerLink.b : peerLink.a] : null;
    return {
      pocket, current, quote, peer,
      canWarp: quote.ok && !unsupportedCost,
      status: current ? "You are here" : unsupportedCost ? "Travel costs are not implemented yet."
        : quote.ok ? "Direct route · Free" : quote.reason,
      station: (PLACE_DEFS[pocket.def]?.features || []).some(f => f.kind === "station"),
    };
  });
}

export function setupStarmap() {
  root = document.createElement("div");
  root.id = "starmap";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", "Starmap");
  document.body.appendChild(root);
  root.addEventListener("click", onClick);
  root.addEventListener("change", e => {
    if (e.target.id === "sm-system") selectSystem(e.target.value);
  });
  root.addEventListener("keydown", e => {
    const node = e.target.closest?.("[data-system]");
    if (node && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      e.stopPropagation();
      selectSystem(node.dataset.system);
    }
  });
  root.addEventListener("wheel", e => {
    if (!state.ui.starmap) return;
    e.preventDefault();
    e.stopPropagation();
    zoomMap(e.deltaY < 0 ? 1 : -1);
  }, { passive: false });
  root.addEventListener("pointerdown", e => {
    const svg = e.target.closest?.("svg.sm-chart");
    if (!svg || e.target.closest?.("[data-system]") || !state.ui.starmap) return;
    const view = state.ui.starmap;
    drag = { x: e.clientX, y: e.clientY, pan: [...view.pan], box: chartViewBox(state.galaxy, view, knowledge()) };
    svg.setPointerCapture?.(e.pointerId);
  });
  root.addEventListener("pointermove", e => {
    if (!drag || !state.ui.starmap) return;
    const svg = root.querySelector("svg.sm-chart");
    const rect = svg?.getBoundingClientRect?.() || { width: 800, height: 600 };
    const scale = Math.min(rect.width / drag.box[2], rect.height / drag.box[3]) || 1;
    state.ui.starmap.pan = [drag.pan[0] - (e.clientX - drag.x) / scale, drag.pan[1] - (e.clientY - drag.y) / scale];
    svg?.setAttribute("viewBox", chartViewBox(state.galaxy, state.ui.starmap, knowledge()).join(" "));
  });
  const endDrag = () => { drag = null; };
  root.addEventListener("pointerup", endDrag);
  root.addEventListener("pointercancel", endDrag);

  on("warp-start", ({ player } = {}) => { if (!player || player === localPlayer()) closeStarmap(); });
  on("docked", ({ player } = {}) => { if (!player || player === localPlayer()) closeStarmap(); });
  on("died", () => closeStarmap());
  on("place-changed", ({ player } = {}) => {
    if (state.ui.starmap && (!player || player === localPlayer())) render();
  });
  on("travel-denied", ({ player, reason } = {}) => {
    if (state.ui.starmap && (!player || player === localPlayer())) {
      state.ui.starmap.notice = reason || "Travel is not available.";
      render();
    }
  });
}

const knowledge = () => state.worldState.galaxy?.knowledge || {};

export function openStarmap() {
  const P = localPlayer();
  if (!root || !state.galaxy || state.ui.intro || state.paused || !P || P.docked || P.dead || P.warp) return false;
  const from = P.place || state.place;
  const systems = visibleSystems(state.galaxy, knowledge());
  const selected = systems.find(s => s.id === placeAt(from).parent)?.id || systems[0]?.id || null;
  state.ui.starmap = { selected, zoom: 1, pan: [0, 0], notice: "", labels: false };
  clearControls();
  if (!state.multiplayer) setAudioSuspended(true);
  root.hidden = false;
  render();
  render();   // measure the inserted chart so dots/labels keep their screen size
  root.querySelector("[data-action='close']")?.focus();
  return true;
}

export function closeStarmap() {
  if (!state.ui.starmap && (!root || root.hidden)) return false;
  state.ui.starmap = null;
  drag = null;
  if (root) root.hidden = true;
  setAudioSuspended(state.paused);
  syncControls();
  return true;
}

export const isStarmapOpen = () => !!state.ui.starmap;

function selectSystem(id) {
  const view = state.ui.starmap;
  if (!view || !systemVisible(state.galaxy, id, knowledge())) return false;
  view.selected = id;
  view.notice = "";
  uiSound("click");
  render();
  return true;
}

function zoomMap(direction) {
  const view = state.ui.starmap;
  if (!view) return;
  const factor = direction >= 0 ? GALAXY.map.zoomStep : 1 / GALAXY.map.zoomStep;
  view.zoom = Math.max(GALAXY.map.minZoom, Math.min(GALAXY.map.maxZoom, view.zoom * factor));
  render();
}

function onClick(e) {
  const button = e.target.closest?.("button, [data-system]");
  if (!button || button.disabled || !state.ui.starmap) return;
  if (button.dataset.system) { selectSystem(button.dataset.system); return; }
  const action = button.dataset.action;
  if (action === "close") { uiSound("click"); closeStarmap(); }
  else if (action === "zoom-in") zoomMap(1);
  else if (action === "zoom-out") zoomMap(-1);
  else if (action === "reset") {
    state.ui.starmap.zoom = 1;
    state.ui.starmap.pan = [0, 0];
    render();
  } else if (action === "labels") {
    state.ui.starmap.labels = !state.ui.starmap.labels;
    render();
  } else if (action === "travel") {
    // main.js rechecks through startWarp; a refusal leaves the chart open.
    emit("action", { name: "travel", to: button.dataset.to, repeat: false });
  }
}

function render() {
  const view = state.ui.starmap;
  if (!root || !view || !state.galaxy) return;
  drag = null;   // a re-render replaces the SVG; never keep capturing the old one
  const world = state.galaxy;
  const know = knowledge();
  const systems = visibleSystems(world, know);
  if (!systems.some(s => s.id === view.selected)) view.selected = systems[0]?.id || null;
  const from = localPlayer()?.place || state.place;
  const here = placeAt(from);
  const selected = world.systemsById[view.selected];
  const box = chartViewBox(world, view, know);
  const edges = systemEdges(world, know);
  const rect = root.querySelector("svg.sm-chart")?.getBoundingClientRect?.() || { width: 800, height: 600 };
  const unit = chartPixelScale(box, rect.width, rect.height);
  const focus = root.querySelector(":focus")?.dataset?.system || null;

  const lines = edges.map(({ id, a, b }) =>
    `<line class="sm-edge" data-edge="${esc(id)}" x1="${a.pos[0]}" y1="${-a.pos[1]}" x2="${b.pos[0]}" y2="${-b.pos[1]}"/>`).join("");
  const nodes = systems.map(s => {
    const current = s.id === here.parent;
    const chosen = s.id === view.selected;
    const visited = know[s.id]?.visited;
    const radius = (current ? GALAXY.map.homeRadius : GALAXY.map.nodeRadius) * unit;
    const label = chosen || current || view.labels;
    return `<g class="sm-node${current ? " current" : ""}${chosen ? " selected" : ""}${visited ? " visited" : ""}"
      data-system="${esc(s.id)}" role="button" tabindex="0" aria-label="${esc(s.n)}${current ? ", current system" : ""}">
      <title>${esc(s.n)} — advisory tier ${s.tier}</title>
      <circle class="sm-hit" cx="${s.pos[0]}" cy="${-s.pos[1]}" r="${radius + 8 * unit}"/>
      <circle class="sm-dot" cx="${s.pos[0]}" cy="${-s.pos[1]}" r="${radius}"/>
      ${chosen ? `<circle class="sm-ring" cx="${s.pos[0]}" cy="${-s.pos[1]}" r="${radius + 5 * unit}"/>` : ""}
      ${label ? `<text x="${s.pos[0] + radius + 5 * unit}" y="${-s.pos[1] + 3 * unit}" style="font-size:${11 * unit}px;stroke-width:${3 * unit}px">${esc(s.n)}</text>` : ""}
    </g>`;
  }).join("");
  const choices = selected ? pocketChoices(world, from, selected.id, travelContext()) : [];
  const cards = choices.map(c => `
    <div class="sm-pocket${c.current ? " here" : ""}">
      <div class="sm-pocket-head"><strong>${esc(c.pocket.n)}</strong>
        <span>${c.current ? "You are here" : c.station ? Term("station") : c.pocket.role === "gate" ? "Gate" : Term("flyable")}</span></div>
      <p>${esc(c.pocket.d)}</p>
      ${c.peer ? `<p class="sm-peer">Gate peer: ${esc(c.peer.n)} (${esc(world.systemsById[c.peer.parent]?.n || "")})</p>` : ""}
      <button type="button" data-action="travel" data-to="${esc(c.pocket.id)}" ${c.canWarp ? "" : "disabled"}>
        ${c.canWarp ? "Warp here · Free" : "Unavailable"}
      </button>
      <small>${esc(c.status)}</small>
    </div>`).join("");

  root.innerHTML = `
    <div class="sm-shell">
      <header class="sm-header">
        <div><h1>Starmap</h1>
          <p>${esc(here.n)} · ${esc(placeAt(here.parent).n)} · ${systems.length} ${esc(terms("mapNode"))}</p></div>
        <button type="button" data-action="close">Close · M / Esc</button>
      </header>
      <div class="sm-body">
        <section class="sm-chart-panel" aria-label="${esc(Term("mapNode"))} chart">
          <div class="sm-tools">
            <label>Inspect <select id="sm-system">${systems.map(s =>
              `<option value="${esc(s.id)}"${s.id === view.selected ? " selected" : ""}>${esc(s.n)}</option>`).join("")}</select></label>
            <div><button type="button" data-action="zoom-out" aria-label="Zoom out">−</button>
              <button type="button" data-action="zoom-in" aria-label="Zoom in">+</button>
              <button type="button" data-action="reset">Fit</button>
              <button type="button" data-action="labels">${view.labels ? "Fewer names" : "All names"}</button></div>
          </div>
          <svg class="sm-chart" viewBox="${box.join(" ")}" preserveAspectRatio="xMidYMid meet" aria-label="Connected ${esc(terms("mapNode"))}">
            ${lines}${nodes}
          </svg>
          <p class="sm-help">Click a ${esc(term("mapNode"))} to inspect it. Drag to pan; scroll or use +/− to zoom.
            Lines show gate connections. Amber marks your ${esc(term("mapNode"))}; a ring marks your selection.</p>
        </section>
        <aside class="sm-details">
          ${selected ? `<h2>${esc(selected.n)}</h2>
            <p class="sm-tier">Advisory tier ${selected.tier}</p>
            <p class="sm-note">Distance guidance only. The ${esc(term("flyable"))}'s actual content decides danger.
              Generated placeholders are empty for now.</p>
            <h3>${esc(terms("flyable"))} · ${choices.length}</h3>
            <p class="sm-note">Only a directly linked ${esc(term("flyable"))} can be entered. Travel through gates and junctions one hop at a time.</p>
            <div class="sm-pockets">${cards}</div>` : `<h2>No visible ${esc(terms("mapNode"))}</h2>`}
          <p class="sm-status" aria-live="polite">${esc(view.notice || (state.multiplayer ? "The hosted world keeps running while the map is open." : "Single-player flight is paused while the map is open."))}</p>
        </aside>
      </div>
    </div>`;
  const cssEscape = globalThis.CSS?.escape || (value => value.replace(/["\\]/g, "\\$&"));
  if (focus) root.querySelector(`[data-system="${cssEscape(focus)}"]`)?.focus();
}
