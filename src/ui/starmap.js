// The 2D starmap (step 11B). Reads the resolved galaxy and asks sim/travel.js
// for every destination quote; it never decides adjacency or starts a warp itself.
// Zooming into a selected system opens a derived pocket map; right-clicking a
// pocket proposes a named travel action, handled by main.js through the existing
// sim/sectors.js sequence. Presentation numbers live in data/galaxy.js.

import { GALAXY } from "../data/galaxy.js";
import { chartGalaxy, straightEdgeBlockers } from "./chart-lines.js";
import { routeDisplay, flightRouteRows } from "./route-display.js";
import { placeAt, placeDef } from "../data/places.js";
import { term, Term, terms } from "../data/terms.js";
import { state, localPlayer, profileOf, msg } from "../state/state.js";
import { setDestination } from "../state/destination.js";
import { systemVisible, pocketsInSystem, systemPocketLayout, systemCoreName } from "../sim/galaxy.js";
import { travelQuote, intraSystemPolicy, travelOptions, findRouteToSystem, findDestinationRoute } from "../sim/travel.js";
import { emit, on } from "../util/events.js";
import { clearControls, syncControls } from "../core/input.js";
import { setAudioSuspended, uiSound } from "../core/audio.js";
import { canOpenStarmap } from "./overlays.js";

let root = null;
let drag = null;
let transition = null;
let transitionFrame = null;
let pendingNavigationClick = null;
const DOUBLE_CLICK_DELAY = 500;
const ROUTE_ICON_SCALE = 0.8;
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c]));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const now = () => globalThis.performance?.now?.() ?? Date.now();

/** A small filled arrow centered at a fraction of a directed chart segment. */
function arrowPath(a, b, fraction = 0.68, size = 6) {
  const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
  if (!(length > 0)) return "";
  const ux = dx / length, uy = dy / length;
  const x = a[0] + dx * fraction, y = a[1] + dy * fraction;
  return `M${x + ux * size} ${y + uy * size} L${x - ux * size - uy * size * 0.65} ${y - uy * size + ux * size * 0.65} L${x - ux * size + uy * size * 0.65} ${y - uy * size - ux * size * 0.65} Z`;
}

function routeSystemIds(world, route) {
  if (!Array.isArray(route)) return [];
  const ids = [];
  for (const pocketId of route) {
    const systemId = world.pocketsById?.[pocketId]?.parent;
    if (systemId && ids.at(-1) !== systemId) ids.push(systemId);
  }
  return ids;
}

function routeRole(id, routeIds, startId, destinationId) {
  if (!routeIds.has(id)) return null;
  return { start: id === startId, destination: id === destinationId, intermediate: id !== startId && id !== destinationId };
}

function routeMarkerMarkup(x, y, radius, role, unit) {
  if (!role) return "";
  const rings = role.destination
    ? `<circle class="sm-route-marker sm-route-marker-destination-outer" cx="${x}" cy="${y}" r="${radius + 7 * unit * ROUTE_ICON_SCALE}"/>
       <path class="sm-route-marker sm-route-marker-destination-check" d="M${x - 3.5 * unit * ROUTE_ICON_SCALE} ${y} L${x - 1 * unit * ROUTE_ICON_SCALE} ${y + 3 * unit * ROUTE_ICON_SCALE} L${x + 4.5 * unit * ROUTE_ICON_SCALE} ${y - 4 * unit * ROUTE_ICON_SCALE}"/>`
    : "";
  return rings;
}

/** Pure view helpers (tested without a browser). */
export function visibleSystems(world, knowledge = {}) {
  return world.systems.filter(s => systemVisible(world, s.id, knowledge))
    .sort((a, b) => a.n.localeCompare(b.n) || a.id.localeCompare(b.id));
}

/** One galaxy chart line per external gate pair. The galaxy always keeps routes;
 *  only free-warp system charts omit their internal pocket-to-pocket lines. */
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
  world = chartGalaxy(world);
  const [x, y, w, h] = chartBounds(visibleSystems(world, knowledge));
  const zoom = clamp(view.zoom || 1, GALAXY.map.minZoom, GALAXY.map.maxZoom);
  const vw = w / zoom, vh = h / zoom;
  return [x + (w - vw) / 2 + (view.pan?.[0] || 0), y + (h - vh) / 2 + (view.pan?.[1] || 0), vw, vh];
}

/** SVG user units per screen pixel for preserveAspectRatio="xMidYMid meet". */
export function chartPixelScale(box, width = 800, height = 600) {
  const w = Number.isFinite(width) && width > 0 ? width : 800;
  const h = Number.isFinite(height) && height > 0 ? height : 600;
  return Math.max(box[2] / w, box[3] / h) || 1;
}

/** Galaxy screen-pixel travel per pointer pixel: gently increase from half
 *  speed at maximum zoom to full speed at minimum zoom. */
export function galaxyPanSpeed(zoom, tuning = GALAXY.map) {
  const z = clamp(zoom || 1, tuning.minZoom, tuning.maxZoom);
  const range = tuning.maxZoom - tuning.minZoom;
  const zoomOut = range > 0 ? (tuning.maxZoom - z) / range : 0;
  return tuning.panSpeed * (0.5 + 0.5 * zoomOut);
}

/** Screen pixels → viewBox units. `speed` is the on-screen travel per mouse pixel. */
export function panDelta(start, current, box, viewport, speed = 1) {
  const scale = chartPixelScale(box, viewport?.width, viewport?.height);
  return [-(current[0] - start[0]) * scale * speed, -(current[1] - start[1]) * scale * speed];
}

/** Convert pointer motion once, without amplifying it by viewport-dependent scale. */
export function galaxyPanDelta(start, current, box, viewport, zoom, tuning = GALAXY.map) {
  return panDelta(start, current, box, viewport, galaxyPanSpeed(zoom, tuning));
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
    const freeHop = quote.ok && world.pocketsById?.[from]?.parent === pocket.parent &&
      intraSystemPolicy(world, pocket.parent) === "free";
    return {
      pocket, current, quote, peer,
      canWarp: quote.ok && !unsupportedCost,
      status: current ? "You are here" : unsupportedCost ? "Travel costs are not implemented yet."
        : quote.ok ? (freeHop ? "Free intra-system warp" : "Direct route · Free") : quote.reason,
      station: placeDef(pocket.id).features.some(f => f.kind === "station"),
    };
  });
}

/** Required internal lines (route-only systems) plus gate exit stubs. Free-warp
 *  systems keep their link records but draw no internal lines. Exit stubs respect
 *  the same visibility policy as the galaxy chart. The core has no travel edge. */
export function pocketConnections(world, systemId, knowledge = {}, tuning = GALAXY.systemMap) {
  const layout = systemPocketLayout(world, systemId, tuning);
  const policy = intraSystemPolicy(world, systemId);
  const ids = new Set(layout.nodes.map(n => n.id));
  const edges = policy !== "links" ? [] : Object.values(world.links)
    .filter(l => l.kind === "internal" && l.enabled !== false && ids.has(l.a) && ids.has(l.b))
    .map(link => ({ id: link.id, a: link.a, b: link.b, link }));
  const exits = [];
  for (const node of layout.nodes) {
    if (!node.peerSystemId || !systemVisible(world, node.peerSystemId, knowledge)) continue;
    const link = Object.values(world.links).find(l =>
      l.kind === "gate" && l.enabled !== false && (l.a === node.id || l.b === node.id));
    if (!link) continue;
    const to = link.a === node.id ? link.b : link.a;
    const direction = node.direction || [1, 0];
    exits.push({
      id: link.id, from: node.id, to, peerPocketId: to, peerSystemId: node.peerSystemId, link,
      start: node.pos, direction,
      end: [node.pos[0] + direction[0] * tuning.exitLength, node.pos[1] + direction[1] * tuning.exitLength],
    });
  }
  return { ...layout, policy, edges, exits };
}

/** Directed local hops from the executable route, never unrelated links or gate crossings. */
export function systemRouteSegments(chart, route) {
  if (!Array.isArray(route)) return [];
  const segments = [];
  for (let i = 1; i < route.length; i++) {
    const a = chart.byId[route[i - 1]], b = chart.byId[route[i]];
    if (a && b && a.id !== b.id) segments.push({ from: a.id, to: b.id, a: a.pos, b: b.pos });
  }
  return segments;
}

/** Directed gate exits in the selected system that are consecutive steps in
 *  the executable route. Incoming route steps are reversed against the local
 *  exit geometry so the arrival stub is highlighted too. The remote pocket is
 *  not a chart node, so these are separate from systemRouteSegments. */
export function systemRouteExits(chart, route) {
  if (!Array.isArray(route)) return [];
  const exits = [];
  for (let i = 1; i < route.length; i++) {
    const from = route[i - 1], to = route[i];
    let exit = chart.exits.find(candidate => candidate.from === from && candidate.to === to);
    let reversed = false;
    if (!exit) {
      exit = chart.exits.find(candidate => candidate.from === to && candidate.to === from);
      reversed = !!exit;
    }
    if (exit) exits.push({ from, to, exit, reversed,
      a: reversed ? exit.end : exit.start, b: reversed ? exit.start : exit.end });
  }
  return exits;
}

/** The travel choice behind a clickable neighbouring-system exit. Its actual
 *  destination is the reciprocal gate pocket, never the remote system/core. */
export function exitChoice(world, exit, from, context = {}) {
  const pocket = world.pocketsById?.[exit.peerPocketId];
  if (!pocket) return null;
  const quote = travelQuote(world, from, pocket.id, context);
  const unsupportedCost = Object.entries(quote.cost || {}).length > 0;
  return {
    pocket, exit, label: world.systemsById?.[exit.peerSystemId]?.n || pocket.n,
    canWarp: quote.ok && !unsupportedCost, quote,
    status: unsupportedCost ? "Travel costs are not implemented yet."
      : quote.ok ? "Direct gate route · Free" : quote.reason,
  };
}

/** Keep a gate pocket's name on the inner side of its dot, away from the
 *  outward orange stub and the peer-system label. Ordinary names stay outward.
 *  Pure screen-space placement; `direction` is the gate's world-space vector. */
export function pocketLabelPosition(node, point, radius, unit, tuning = GALAXY.systemMap) {
  const gate = node.pocket.role === "gate" && node.direction;
  const dx = gate ? -node.direction[0] : node.pos[0];
  const dy = gate ? node.direction[1] : -node.pos[1];   // screen y is negated
  const anchor = dx < -0.25 ? "end" : dx > 0.25 ? "start" : "middle";
  const gap = radius + tuning.labelGap * unit;
  if (anchor === "middle") {
    return { x: point[0], y: point[1] + (dy < 0 ? -gap : gap + 6 * unit), anchor };
  }
  return { x: point[0] + (anchor === "end" ? -gap : gap), y: point[1] + 3 * unit, anchor };
}

/** Place pocket labels in screen-readable boxes, nudging colliding names along
 *  the tangent of their orbit. A connector is rendered for every nudge so a
 *  moved label remains unambiguously attached to its pocket dot. */
export function pocketLabelLayout(chart, point, radius, unit, tuning = GALAXY.systemMap) {
  const gap = 4 * unit;
  const edgeGap = radius + tuning.labelGap * unit;
  const labels = chart.nodes.map(node => {
    const dot = point(node.pos);
    const base = pocketLabelPosition(node, dot, radius, unit, tuning);
    const width = Math.max(8 * unit, String(node.pocket.n || "").length * 6.4 * unit);
    const height = 14 * unit;
    return { node, dot, base, x: base.x, y: base.y, anchor: base.anchor, width, height, moved: false };
  });
  const boxFor = label => {
    const left = label.anchor === "end" ? label.x - label.width : label.anchor === "middle" ? label.x - label.width / 2 : label.x;
    return { left, right: left + label.width, top: label.y - 11 * unit, bottom: label.y + 4 * unit };
  };
  const overlaps = (a, b) => a.left < b.right + gap && a.right > b.left - gap &&
    a.top < b.bottom + gap && a.bottom > b.top - gap;
  // Keep text away from every visible pocket/exit dot, not only from other text.
  // A little extra padding prevents a nearby label from looking attached to the
  // wrong gate when two exit pockets are close together.
  const dotPadding = radius + 4 * unit;
  const dotBoxes = [...chart.nodes.map(node => point(node.pos)), ...(chart.exits || []).map(exit => point(exit.end))]
    .map(([x, y]) => ({ left: x - dotPadding, right: x + dotPadding, top: y - dotPadding, bottom: y + dotPadding }));
  const overlapsDot = box => dotBoxes.some(dot => box.left < dot.right && box.right > dot.left &&
    box.top < dot.bottom && box.bottom > dot.top);
  const placed = [];
  for (const label of labels) {
    const horizontal = label.base.anchor !== "middle";
    // Horizontal labels stack by a line height; centred labels move along the
    // tangent in small increments so a nearby dot nudges them only as far as
    // necessary instead of jumping an entire label width.
    const tangentStep = Math.max(horizontal ? label.height + gap : gap, 0.01);
    const candidateOffsets = count => {
      const offsets = [0];
      for (let i = 1; i < count; i++) offsets.push((i % 2 ? -1 : 1) * Math.ceil(i / 2) * tangentStep);
      return offsets;
    };
    const candidates = [];
    const addSide = (anchor, y, offset) => {
      const x = anchor === "middle" ? label.dot[0] + offset
        : label.dot[0] + (anchor === "start" ? edgeGap : -edgeGap);
      candidates.push({ ...label, x, y: y + (anchor === "middle" ? 0 : offset), anchor });
    };
    if (horizontal) {
      // Try the inward/original side first, but flip to the other side before
      // stacking when that is what keeps the label away from another dot.
      const opposite = label.base.anchor === "start" ? "end" : "start";
      addSide(label.base.anchor, label.base.y, 0);
      addSide(opposite, label.base.y, 0);
      for (const offset of candidateOffsets(16).slice(1)) {
        addSide(label.base.anchor, label.base.y, offset);
        addSide(opposite, label.base.y, offset);
      }
    } else {
      // Vertical labels keep their centred reading first. At each small tangent
      // shift also try the two side anchors, so a crowded label can move just
      // far enough rather than exhausting a long row of centred positions.
      for (const offset of candidateOffsets(32)) {
        addSide("middle", label.base.y, offset);
        addSide("start", label.base.y, offset);
        addSide("end", label.base.y, offset);
      }
    }
    let chosen = null;
    // There is no viewport constraint on label text. If the preferred finite
    // candidates are all occupied, keep extending along the tangent until a
    // finite set of boxes cannot collide with it.
    for (let i = 0; !chosen; i++) {
      const candidate = candidates[i] || (horizontal
        ? { ...label, x: label.dot[0] + (i % 2 ? -edgeGap : edgeGap), y: label.base.y + Math.ceil(i / 2) * tangentStep, anchor: i % 2 ? "end" : "start" }
        : { ...label, x: label.base.x + (i % 2 ? -1 : 1) * Math.ceil(i / 2) * tangentStep, y: label.base.y, anchor: "middle" });
      const box = boxFor(candidate);
      if (!overlapsDot(box) && !placed.some(other => overlaps(box, other.box))) chosen = { ...candidate, box };
    }
    chosen.moved = Math.abs(chosen.x - chosen.base.x) > 1e-9 || Math.abs(chosen.y - chosen.base.y) > 1e-9 || chosen.anchor !== chosen.base.anchor;
    placed.push(chosen);
  }
  return new Map(placed.map(label => [label.node.id, label]));
}

/** A centred local box around the pockets and their outward exit stubs. */
export function systemChartBounds(chart, padding = GALAXY.systemMap.padding) {
  const points = [...chart.nodes.map(n => n.pos), ...chart.exits.map(e => e.end)];
  if (!points.length) return [-padding, -padding, padding * 2, padding * 2];
  const extent = Math.max(...points.map(p => Math.max(Math.abs(p[0]), Math.abs(p[1])))) + padding;
  return [-extent, -extent, extent * 2, extent * 2];
}

export function systemChartViewBox(world, view, knowledge = {}) {
  world = chartGalaxy(world);
  const system = world.systemsById?.[view.selected];
  if (!system) return chartViewBox(world, view, knowledge);
  const [x, y, w, h] = systemChartBounds(pocketConnections(world, system.id, knowledge));
  const zoom = clamp(view.systemZoom ?? 1, GALAXY.systemMap.minZoom, GALAXY.systemMap.maxZoom);
  const vw = w / zoom, vh = h / zoom;
  const pan = view.systemPan || [0, 0];
  return [system.pos[0] + x + (w - vw) / 2 + pan[0], -system.pos[1] + y + (h - vh) / 2 + pan[1], vw, vh];
}

export function activeChartViewBox(world, view, knowledge = {}) {
  return view.mode === "system" ? systemChartViewBox(world, view, knowledge) : chartViewBox(world, view, knowledge);
}

/** Linear viewBox blend; callers pass an already-eased progress value. */
export function interpolateViewBox(from, to, t) {
  const p = clamp(t, 0, 1);
  return from.map((value, i) => value + (to[i] - value) * p);
}

/** Keep a right-click popup inside the chart viewport. */
export function contextMenuPosition(x, y, viewport = { width: 800, height: 600 }, tuning = GALAXY.map.context) {
  const width = viewport.width || 800, height = viewport.height || 600;
  const offsetX = Number.isFinite(tuning.offsetX) ? tuning.offsetX : 8;
  const anchorY = Number.isFinite(tuning.anchorY) ? tuning.anchorY : 42;
  return {
    // Keep the menu just to the right of the pointer so its first action is
    // reachable with a small horizontal movement rather than a long downward one.
    left: clamp(x + offsetX, tuning.margin, Math.max(tuning.margin, width - tuning.width - tuning.margin)),
    top: clamp(y - anchorY, tuning.margin, Math.max(tuning.margin, height - tuning.height - tuning.margin)),
  };
}

/** Targets that have a double-click navigation action. Galaxy system dots keep
 *  their single-click selection; pocket-map left clicks stay inert and their
 *  existing menus are opened by contextmenu. The real click is delayed briefly
 *  so the browser can deliver a second click to the same SVG node. Rendering a
 *  popup on click one replaces that node and prevents native dblclick from
 *  reaching this delegated root. */
function navigationTarget(button, view = state.ui.starmap) {
  if (!button || !view) return null;
  if (view.mode === "galaxy" && button.dataset.system) {
    return { key: `system:${button.dataset.system}`, kind: "system", id: button.dataset.system };
  }
  if (view.mode !== "system") return null;
  if (button.dataset.exit) {
    return { key: `exit:${button.dataset.exit}`, kind: "exit", id: button.dataset.exit };
  }
  if (button.dataset.pocket && button.dataset.peerSystem) {
    return { key: `gate:${button.dataset.pocket}`, kind: "gate", id: button.dataset.pocket,
      peerSystem: button.dataset.peerSystem };
  }
  return null;
}

function clearPendingNavigationClick() {
  if (pendingNavigationClick?.timer != null) clearTimeout(pendingNavigationClick.timer);
  pendingNavigationClick = null;
}

function performSingleNavigationClick(pending) {
  const view = state.ui.starmap;
  if (!view || view.mode !== pending.mode) return;
  // Pocket-map left clicks are intentionally inert. Right-clicking the same
  // node still opens the existing travel/destination menu, while a double
  // click on a gate target is handled by navigateDoubleClick().
  if (pending.kind === "system") selectSystem(pending.id);
}

function flushPendingNavigationClick() {
  const pending = pendingNavigationClick;
  clearPendingNavigationClick();
  if (pending) performSingleNavigationClick(pending);
}

function navigateDoubleClick(button) {
  const view = state.ui.starmap;
  const target = navigationTarget(button, view);
  if (!target) return false;
  clearPendingNavigationClick();
  if (target.kind === "system") {
    if (!selectSystem(target.id, true)) return false;
    return enterSystem(target.id);
  }
  if (target.kind === "exit") {
    const exit = pocketConnections(state.galaxy, view.selected, knowledge()).exits
      .find(candidate => candidate.id === target.id);
    if (!exit || !systemVisible(state.galaxy, exit.peerSystemId, knowledge())) return false;
    return enterSystem(exit.peerSystemId);
  }
  if (!systemVisible(state.galaxy, target.peerSystem, knowledge())) return false;
  return enterSystem(target.peerSystem);
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
  root.addEventListener("contextmenu", onContextMenu);
  root.addEventListener("dblclick", e => {
    if (!state.ui.starmap) return;
    const button = e.target.closest?.("[data-system], [data-pocket], [data-exit]");
    if (!navigateDoubleClick(button)) return;
    e.preventDefault();
    e.stopPropagation?.();
  });
  root.addEventListener("change", e => {
    if (e.target.id === "sm-system") selectSystem(e.target.value);
  });
  root.addEventListener("keydown", onKeydown);
  globalThis.addEventListener?.("resize", () => { if (state.ui.starmap) render(); });
  root.addEventListener("wheel", e => {
    if (!state.ui.starmap) return;
    e.preventDefault();
    e.stopPropagation();
    const zoomIn = e.deltaY < 0;
    const node = e.target.closest?.("[data-system]");
    if (zoomIn && node && state.ui.starmap.mode === "galaxy") selectSystem(node.dataset.system, true);
    zoomMap(zoomIn ? 1 : -1);
  }, { passive: false });
  root.addEventListener("pointerdown", e => {
    const view = state.ui.starmap;
    const svg = e.target.closest?.("svg.sm-chart");
    if (!svg || !view || transition || e.button !== 0) return;
    if (e.target.closest?.("[data-system], [data-pocket], [data-exit], [data-core], .sm-context")) return;
    drag = { mode: view.mode, x: e.clientX, y: e.clientY, pan: [...(view.mode === "system" ? view.systemPan : view.pan)],
      box: activeChartViewBox(state.galaxy, view, knowledge()) };
    svg.setPointerCapture?.(e.pointerId);
  });
  root.addEventListener("pointermove", e => {
    const view = state.ui.starmap;
    if (!drag || !view || drag.mode !== view.mode) return;
    const svg = root.querySelector("svg.sm-chart");
    const rect = svg?.getBoundingClientRect?.() || { width: 800, height: 600 };
    let pan;
    if (view.mode === "galaxy") {
      const delta = galaxyPanDelta([drag.x, drag.y], [e.clientX, e.clientY], drag.box, rect, view.zoom);
      pan = [drag.pan[0] + delta[0], drag.pan[1] + delta[1]];
    } else {
      const scale = chartPixelScale(drag.box, rect.width, rect.height);
      pan = [drag.pan[0] - (e.clientX - drag.x) / scale, drag.pan[1] - (e.clientY - drag.y) / scale];
    }
    if (view.mode === "system") view.systemPan = pan; else view.pan = pan;
    svg?.setAttribute("viewBox", activeChartViewBox(state.galaxy, view, knowledge()).join(" "));
  });
  const endDrag = () => { drag = null; };
  root.addEventListener("pointerup", endDrag);
  root.addEventListener("pointercancel", endDrag);

  on("warp-start", ({ player } = {}) => { if (!player || player === localPlayer()) closeStarmap(); });
  on("docked", ({ player } = {}) => { if (!player || player === localPlayer()) closeStarmap(); });
  on("died", () => closeStarmap());
  on("place-changed", ({ from, to, player } = {}) => {
    if (player && player !== localPlayer()) return;
    const before = state.galaxy?.pocketsById?.[from]?.parent;
    const after = state.galaxy?.pocketsById?.[to]?.parent;
    if (before && after && before !== after) {
      for (const view of [state.ui.starmapMemory, state.ui.starmap]) {
        if (!view) continue;
        view.playerSystem = after;
        if (view.mode === "system") {
          if (systemVisible(state.galaxy, after, knowledge())) view.selected = after;
          else view.mode = "galaxy"; // never reveal a hidden system
          view.systemZoom = 1;
          view.systemPan = [0, 0];
          view.menu = null;
          view.notice = "";
        }
      }
      cancelTransition();
    }
    const destination = state.ui.destination;
    if (destination && (typeof destination === "string" ? after === destination : destination.pocketId === to)) {
      setDestination(null);
      msg("Destination reached.");
    }
    if (state.ui.starmap) render();
  });
  on("travel-denied", ({ player } = {}) => {
    if (state.ui.starmap && (!player || player === localPlayer())) {
      state.ui.starmap.notice = "";
      state.ui.starmap.menu = null;
      render();
    }
  });
}

const knowledge = () => state.worldState.galaxy?.knowledge || {};

export function openStarmap() {
  const P = localPlayer();
  // Docked is not a reason to refuse: the chart may be read at a station, and
  // warping from it still needs a launch. The rule lives in ui/overlays.js.
  if (!root || !canOpenStarmap(P)) return false;
  clearPendingNavigationClick();
  cancelTransition();
  const from = P.place || state.place;
  const systems = visibleSystems(state.galaxy, knowledge());
  const playerSystem = state.galaxy.pocketsById?.[from]?.parent || placeAt(from).parent;
  const selected = systems.find(s => s.id === playerSystem)?.id || systems[0]?.id || null;
  const saved = state.ui.starmapMemory;
  const visible = id => systems.some(s => s.id === id);
  const changedSystem = saved && saved.playerSystem !== playerSystem;
  const rememberedSelected = saved?.mode === "system" && changedSystem ? selected : saved?.selected;
  state.ui.starmap = {
    selected: visible(rememberedSelected) ? rememberedSelected : selected,
    mode: saved?.mode === "system" && visible(rememberedSelected || selected) ? "system" : "galaxy",
    zoom: saved?.zoom ?? 1, pan: saved?.pan ? [...saved.pan] : [0, 0],
    systemZoom: changedSystem ? 1 : (saved?.systemZoom ?? 1),
    systemPan: !changedSystem && saved?.systemPan ? [...saved.systemPan] : [0, 0],
    playerSystem, notice: "", labels: saved?.labels ?? false, menu: null, routePage: 0,
  };
  clearControls();
  // The world keeps flying behind the chart, so ordinary audio carries on.
  root.hidden = false;
  render();
  render();   // measure the inserted chart so dots/labels keep their screen size
  root.querySelector("[data-action='close']")?.focus();
  return true;
}

export function closeStarmap() {
  if (!state.ui.starmap && (!root || root.hidden)) return false;
  if (state.ui.starmap) {
    const view = state.ui.starmap;
    state.ui.starmapMemory = {
      selected: view.selected, mode: view.mode, zoom: view.zoom, pan: [...view.pan],
      systemZoom: view.systemZoom, systemPan: [...view.systemPan], labels: view.labels,
      playerSystem: state.galaxy?.pocketsById?.[localPlayer()?.place || state.place]?.parent || view.playerSystem,
    };
  }
  state.ui.starmap = null;
  drag = null;
  clearPendingNavigationClick();
  cancelTransition();
  if (root) root.hidden = true;
  setAudioSuspended(state.paused);
  syncControls();
  return true;
}

export const isStarmapOpen = () => !!state.ui.starmap;

function selectSystem(id, quiet = false) {
  const view = state.ui.starmap;
  if (!view || transition || !systemVisible(state.galaxy, id, knowledge())) return false;
  view.selected = id;
  view.notice = "";
  view.menu = null;
  if (view.mode === "system") view.systemPan = [0, 0];
  if (!quiet) uiSound("click");
  render();
  return true;
}

function centerOnSelected() {
  const view = state.ui.starmap;
  const world = chartGalaxy(state.galaxy);
  const system = world.systemsById?.[view.selected];
  if (!system) return;
  const [x, y, w, h] = chartBounds(visibleSystems(world, knowledge()));
  view.pan = [system.pos[0] - (x + w / 2), -system.pos[1] - (y + h / 2)];
}

function zoomMap(direction) {
  const view = state.ui.starmap;
  if (!view || transition) return;
  if (view.mode === "system") {
    if (direction < 0 && view.systemZoom <= GALAXY.systemMap.minZoom) { exitSystem(); return; }
    const factor = direction >= 0 ? GALAXY.map.zoomStep : 1 / GALAXY.map.zoomStep;
    view.systemZoom = clamp(view.systemZoom * factor, GALAXY.systemMap.minZoom, GALAXY.systemMap.maxZoom);
    view.menu = null;
    render();
    return;
  }
  const factor = direction >= 0 ? GALAXY.map.zoomStep : 1 / GALAXY.map.zoomStep;
  const next = clamp(view.zoom * factor, GALAXY.map.minZoom, GALAXY.map.maxZoom);
  if (view.selected) centerOnSelected();
  view.zoom = next;
  view.menu = null;
  if (direction >= 0 && next >= GALAXY.map.systemEntryZoom && view.selected) enterSystem(view.selected);
  else render();
}

function enterSystem(id = state.ui.starmap?.selected) {
  const view = state.ui.starmap;
  if (!view || !systemVisible(state.galaxy, id, knowledge())) return false;
  // A fast double-click can arrive while the short zoom animation is still
  // running. Finish that presentation first rather than dropping the request.
  if (transition) finishTransition();
  // A remote gate label is already on a system chart. Move directly to the
  // peer chart instead of briefly returning to the galaxy overview.
  if (view.mode === "system") {
    view.selected = id;
    view.systemZoom = 1;
    view.systemPan = [0, 0];
    view.menu = null;
    view.notice = "";
    render();
    return true;
  }
  const fromBox = activeChartViewBox(state.galaxy, view, knowledge());
  view.selected = id;
  view.mode = "system";
  view.systemZoom = 1;
  view.systemPan = [0, 0];
  view.menu = null;
  view.notice = "";
  startTransition("galaxy", "system", fromBox, systemChartViewBox(state.galaxy, view, knowledge()));
  return true;
}

function exitSystem() {
  const view = state.ui.starmap;
  if (!view || transition || view.mode !== "system") return false;
  const fromBox = activeChartViewBox(state.galaxy, view, knowledge());
  view.mode = "galaxy";
  view.zoom = clamp(GALAXY.map.systemEntryZoom / GALAXY.map.zoomStep, GALAXY.map.minZoom, GALAXY.map.maxZoom);
  view.menu = null;
  centerOnSelected();
  startTransition("system", "galaxy", fromBox, chartViewBox(state.galaxy, view, knowledge()));
  return true;
}

function startTransition(fromMode, toMode, fromBox, toBox) {
  const reduced = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const duration = reduced ? 0 : GALAXY.map.transitionMs;
  if (!(duration > 0) || !globalThis.requestAnimationFrame) {
    transition = null;
    render();
    return;
  }
  transition = { fromMode, toMode, fromBox, toBox, start: now(), duration };
  render();
}

function cancelTransition() {
  if (transitionFrame != null) globalThis.cancelAnimationFrame?.(transitionFrame);
  transitionFrame = null;
  transition = null;
}

function scheduleTransition() {
  if (!transition || transitionFrame != null) return;
  const raf = globalThis.requestAnimationFrame;
  if (!raf) { finishTransition(); return; }
  transitionFrame = raf(tickTransition);
}

function tickTransition(timestamp) {
  transitionFrame = null;
  if (!transition || !state.ui.starmap) return;
  const t = clamp((timestamp - transition.start) / transition.duration, 0, 1);
  const eased = t * t * (3 - 2 * t);
  const svg = root.querySelector("svg.sm-chart");
  svg?.setAttribute("viewBox", interpolateViewBox(transition.fromBox, transition.toBox, eased).join(" "));
  const galaxyOpacity = transition.toMode === "system" ? 1 - eased : eased;
  const systemOpacity = transition.toMode === "system" ? eased : 1 - eased;
  svg?.querySelector(".sm-galaxy-layer")?.setAttribute("opacity", String(galaxyOpacity));
  svg?.querySelector(".sm-system-layer")?.setAttribute("opacity", String(systemOpacity));
  if (t >= 1) finishTransition();
  else scheduleTransition();
}

function finishTransition() {
  cancelTransition();
  render();
}

function openPocketMenu(id, x, y) {
  const view = state.ui.starmap;
  if (!view || view.mode !== "system") return false;
  if (transition) finishTransition();
  const pocket = state.galaxy.pocketsById?.[id];
  if (!pocket || pocket.parent !== view.selected) return false;
  view.menu = { to: id, x, y };
  view.notice = "";
  uiSound("click");
  render();
  return true;
}

function openExitMenu(id, x, y) {
  const view = state.ui.starmap;
  if (!view || view.mode !== "system") return false;
  if (transition) finishTransition();
  const exit = pocketConnections(state.galaxy, view.selected, knowledge()).exits.find(e => e.id === id);
  if (!exit) return false;
  view.menu = { to: exit.peerPocketId, exitId: id, x, y };
  view.notice = "";
  uiSound("click");
  render();
  return true;
}

function openSystemMenu(id, x, y) {
  const view = state.ui.starmap;
  if (!view || view.mode !== "galaxy" || !systemVisible(state.galaxy, id, knowledge())) return false;
  if (transition) finishTransition();
  view.selected = id;
  view.menu = { systemId: id, x, y };
  view.notice = "";
  uiSound("click");
  render();
  return true;
}

/** A direct cross-system gate hop to this system, if one is executable now. */
export function directSystemWarp(world, from, systemId, context = {}) {
  if (world.pocketsById?.[from]?.parent === systemId) return null;
  return travelOptions(world, from, context).find(o => o.ok && o.mode === "warp" &&
    !Object.keys(o.cost).length && o.link?.kind === "gate" &&
    world.pocketsById[o.to]?.parent === systemId)?.to || null;
}

function menuChoice(world, view, from) {
  const menu = view.menu;
  if (!menu) return null;
  if (menu.exitId) {
    const exit = pocketConnections(world, view.selected, knowledge()).exits.find(e => e.id === menu.exitId);
    const choice = exit ? exitChoice(world, exit, from, travelContext()) : null;
    return choice ? { ...choice, title: choice.label } : null;
  }
  const choice = pocketChoices(world, from, view.selected, travelContext()).find(c => c.pocket.id === menu.to);
  return choice ? { ...choice, title: choice.pocket.n } : null;
}

function closeMenu() {
  const view = state.ui.starmap;
  if (!view?.menu) return;
  const { to, exitId, systemId } = view.menu;
  view.menu = null;
  render();
  const cssEscape = globalThis.CSS?.escape || (value => value.replace(/["\\]/g, "\\$&"));
  const selector = systemId ? `[data-system="${cssEscape(systemId)}"]` : exitId ? `[data-exit="${cssEscape(exitId)}"]` : `[data-pocket="${cssEscape(to)}"]`;
  root.querySelector(selector)?.focus();
}

function onContextMenu(e) {
  if (!state.ui.starmap) return;
  clearPendingNavigationClick();
  e.preventDefault();
  e.stopPropagation();
  const node = e.target.closest?.("[data-system], [data-pocket], [data-exit]");
  if (!node) { closeMenu(); return; }
  if (node.dataset.system) openSystemMenu(node.dataset.system, e.clientX, e.clientY);
  else if (node.dataset.exit) openExitMenu(node.dataset.exit, e.clientX, e.clientY);
  else openPocketMenu(node.dataset.pocket, e.clientX, e.clientY);
}

function onKeydown(e) {
  const view = state.ui.starmap;
  if (!view) return;
  if (e.key === "Escape" && view.menu) {
    e.preventDefault();
    e.stopPropagation();
    closeMenu();
    return;
  }
  const system = e.target.closest?.("[data-system]");
  if (system && (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10"))) {
    e.preventDefault(); e.stopPropagation();
    const rect = e.target.getBoundingClientRect?.() || { left: 0, top: 0, width: 800, height: 600 };
    openSystemMenu(system.dataset.system, rect.left + rect.width / 2, rect.top + rect.height / 2);
    return;
  }
  if (system && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    e.stopPropagation();
    selectSystem(system.dataset.system);
    return;
  }
  const pocket = e.target.closest?.("[data-pocket], [data-exit]");
  if (pocket && (e.key === "Enter" || e.key === " " || e.key === "ContextMenu" || (e.shiftKey && e.key === "F10"))) {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.target.getBoundingClientRect?.() || root.querySelector("svg.sm-chart")?.getBoundingClientRect?.() || { left: 0, top: 0, width: 800, height: 600 };
    const x = (rect.left || 0) + (rect.width || 800) / 2, y = (rect.top || 0) + (rect.height || 600) / 2;
    if (pocket.dataset.exit) openExitMenu(pocket.dataset.exit, x, y);
    else openPocketMenu(pocket.dataset.pocket, x, y);
  }
}

function onClick(e) {
  const view = state.ui.starmap;
  if (!view) return;
  const button = e.target.closest?.("button, [data-system], [data-pocket], [data-exit]");
  const target = navigationTarget(button, view);
  // Galaxy selection is deliberately immediate. The second click still reaches
  // the delegated dblclick handler because the selected system is rendered at
  // the same chart location; pocket/gate targets retain their protected delay.
  if (target?.kind === "system" && view.mode === "galaxy" && e.detail === 1) {
    clearPendingNavigationClick();
    performSingleNavigationClick({ ...target, mode: view.mode });
    return;
  }
  // A real first click on a pocket-map navigation target must not re-render its
  // delegated SVG node before the browser has a chance to emit dblclick.
  // Headless tests call this handler without `detail`, so their immediate
  // single-click semantics remain intact.
  if (target && (e.detail === 1 || e.detail === 2)) {
    if (e.detail === 2) {
      clearPendingNavigationClick();
      return;
    }
    if (pendingNavigationClick && pendingNavigationClick.key !== target.key) flushPendingNavigationClick();
    clearPendingNavigationClick();
    const pending = { ...target, mode: view.mode };
    pending.timer = setTimeout(() => {
      if (pendingNavigationClick === pending) {
        pendingNavigationClick = null;
        performSingleNavigationClick(pending);
      }
    }, DOUBLE_CLICK_DELAY);
    pendingNavigationClick = pending;
    return;
  }
  if (pendingNavigationClick && (!target || pendingNavigationClick.key !== target.key)) flushPendingNavigationClick();
  onClickNow(e);
}

function onClickNow(e) {
  const view = state.ui.starmap;
  if (!view) return;
  const button = e.target.closest?.("button, [data-system], [data-pocket], [data-exit]");
  const menuAction = ["travel", "set-destination", "set-pocket-destination", "system-warp"].includes(button?.dataset?.action);
  if (view.menu && !menuAction) {
    view.menu = null;
    if (!button || button.disabled) { render(); return; }
  }
  if (!button || button.disabled) return;
  if (button.dataset.system) { selectSystem(button.dataset.system); return; }
  if (view.mode === "system" && (button.dataset.exit || button.dataset.pocket)) return;
  const action = button.dataset.action;
  if (action === "close") { uiSound("click"); closeStarmap(); }
  else if (action === "zoom-in") zoomMap(1);
  else if (action === "zoom-out") zoomMap(-1);
  else if (action === "back") exitSystem();
  else if (action === "reset") {
    if (view.mode === "system") { view.systemZoom = 1; view.systemPan = [0, 0]; }
    else { view.zoom = 1; view.pan = [0, 0]; }
    view.menu = null;
    render();
  } else if (action === "labels") {
    view.labels = !view.labels;
    render();
  } else if (action === "set-destination") {
    const id = view.menu?.systemId;
    const from = localPlayer()?.place || state.place;
    if (!id || !systemVisible(state.galaxy, id, knowledge())) return;
    const route = findRouteToSystem(state.galaxy, from, id, travelContext());
    view.menu = null;
    if (route?.length >= 2) { setDestination(id); view.routePage = 0; }
    view.notice = "";
    render();
  } else if (action === "set-pocket-destination") {
    const from = localPlayer()?.place || state.place;
    const choice = menuChoice(state.galaxy, view, from);
    const target = choice?.pocket?.id;
    if (!target) return;
    const destination = { pocketId: target };
    const route = findDestinationRoute(state.galaxy, from, destination, travelContext());
    view.menu = null;
    if (route?.length >= 2) { setDestination(destination); view.routePage = 0; }
    view.notice = "";
    render();
  } else if (action === "system-warp") {
    const id = view.menu?.systemId;
    if (localPlayer()?.docked) { view.notice = "Docked: launch to warp."; render(); return; }
    const to = id && directSystemWarp(state.galaxy, localPlayer()?.place || state.place, id, travelContext());
    view.menu = null;
    if (!to) { view.notice = ""; render(); return; }
    emit("action", { name: "travel", to, repeat: false });
  } else if (action === "clear-destination") {
    setDestination(null); view.routePage = 0; render();
  } else if (action === "route-prev" || action === "route-next") {
    view.routePage = Math.max(0, (view.routePage || 0) + (action === "route-next" ? 1 : -1)); render();
  } else if (action === "travel") {
    const to = button.dataset.to;
    const from = localPlayer()?.place || state.place;
    // The chart opens at a station too; warping needs a launch first, so say so
    // here instead of proposing a course that main.js would silently refuse.
    if (localPlayer()?.docked) { view.notice = "Docked: launch to warp."; render(); return; }
    const choice = menuChoice(state.galaxy, view, from);
    view.menu = null;
    if (choice && choice.pocket.id !== to) {
      view.notice = "";
      render();
      return;
    }
    if (!choice?.canWarp) {
      view.notice = "";
      render();
      return;
    }
    // main.js rechecks through startWarp; a refusal leaves the chart open.
    emit("action", { name: "travel", to, repeat: false });
  }
}

function galaxyMarkup(world, view, know, here, unit, route = null) {
  const systems = visibleSystems(world, know);
  const paths = new Map(), masks = [];
  const clearance = (Math.max(GALAXY.map.homeRadius, GALAXY.map.nodeRadius) + 4) * unit;
  const [mx, my, mw, mh] = chartBounds(systems, GALAXY.map.padding + clearance * 10);
  const lines = systemEdges(world, know).map(({ id, a, b }, i) => {
    const start = [a.pos[0], -a.pos[1]], end = [b.pos[0], -b.pos[1]];
    const path = `M${start[0]} ${start[1]} L${end[0]} ${end[1]}`;
    // At extreme zoom or with unusually dense authored positions there may be
    // no room for all dots. Mask only obstructing unrelated dots, never the
    // two endpoint dots, so normal lines connect right to their systems.
    const blockers = straightEdgeBlockers(a, b, systems, s =>
      ((s.id === here.parent ? GALAXY.map.homeRadius : GALAXY.map.nodeRadius) + 2) * unit);
    const maskId = blockers.length ? `sm-edge-mask-${i}` : null;
    if (maskId) masks.push(`<mask id="${maskId}" maskUnits="userSpaceOnUse" x="${mx}" y="${my}" width="${mw}" height="${mh}">
      <rect x="${mx}" y="${my}" width="${mw}" height="${mh}" fill="white"/>
      ${blockers.map(({ system: s, radius }) => `<circle cx="${s.pos[0]}" cy="${-s.pos[1]}" r="${radius}" fill="black"/>`).join("")}</mask>`);
    paths.set([a.id, b.id].sort().join("__"), { path, maskId });
    return `<path class="sm-edge" data-edge="${esc(id)}" d="${path}"${maskId ? ` mask="url(#${maskId})"` : ""}/>`;
  }).join("");
  const routeLines = (route || []).slice(1).map((id, i) => {
    const a = world.systemsById[world.pocketsById[route[i]]?.parent];
    const b = world.systemsById[world.pocketsById[id]?.parent];
    if (!a || !b || a.id === b.id) return "";
    const line = paths.get([a.id, b.id].sort().join("__"));
    if (!line) return "";
    const start = [a.pos[0], -a.pos[1]], end = [b.pos[0], -b.pos[1]];
    const mask = line.maskId ? ` mask="url(#${line.maskId})"` : "";
    return `<path class="sm-route-edge" d="${line.path}"${mask}/><path class="sm-route-arrow" d="${arrowPath(start, end, 0.68, 6 * unit)}"${mask}/>`;
  }).join("");
  const routeIds = new Set(routeSystemIds(world, route));
  const routeStart = [...routeIds][0];
  const routeDestination = [...routeIds].at(-1);
  const nodes = systems.map(s => {
    const current = s.id === here.parent;
    const chosen = s.id === view.selected;
    const role = routeRole(s.id, routeIds, routeStart, routeDestination);
    const iconScale = role?.start || role?.destination || current ? ROUTE_ICON_SCALE : 1;
    const radius = (current ? GALAXY.map.homeRadius : GALAXY.map.nodeRadius) * iconScale * unit;
    const roleClass = role ? ` route-${role.destination ? "destination" : role.start ? "start" : "intermediate"}` : "";
    const marker = routeMarkerMarkup(s.pos[0], -s.pos[1], radius, role, unit);
    const label = chosen || current || view.labels;
    const labelX = s.pos[0] + radius + 5 * unit;
    const labelY = -s.pos[1] + 3 * unit;
    const hereLabel = current ? `<tspan class="sm-here-label" x="${labelX}" dy="${12 * unit}">(You are here)</tspan>` : "";
    return `<g class="sm-node${current ? " current" : ""}${chosen ? " selected" : ""}${roleClass}"
      data-system="${esc(s.id)}" role="button" tabindex="0" aria-label="${esc(s.n)}${current ? ", current system" : ""}">
      <title>${esc(s.n)}</title>
      <circle class="sm-hit" cx="${s.pos[0]}" cy="${-s.pos[1]}" r="${radius + 8 * unit}"/>
      <circle class="sm-dot" cx="${s.pos[0]}" cy="${-s.pos[1]}" r="${radius}"/>
      ${marker}
      ${chosen && !current ? `<circle class="sm-ring" cx="${s.pos[0]}" cy="${-s.pos[1]}" r="${radius + 5 * unit}"/>` : ""}
      ${label ? `<text x="${labelX}" y="${labelY}" style="font-size:${11 * unit}px;stroke-width:${3 * unit}px">${esc(s.n)}${hereLabel}</text>` : ""}
    </g>`;
  }).join("");
  return `<defs>${masks.join("")}</defs>` + lines + routeLines + nodes;
}

function systemMarkup(world, view, know, here, unit, route = null) {
  const chart = pocketConnections(world, view.selected, know);
  const system = chart.system;
  if (!system) return "";
  const ox = system.pos[0], oy = -system.pos[1];
  const point = p => [ox + p[0], oy - p[1]];
  const lines = chart.edges.map(edge => {
    const a = point(chart.byId[edge.a].pos), b = point(chart.byId[edge.b].pos);
    return `<line class="sm-edge sm-pocket-edge" data-pockets-edge="${esc(edge.id)}" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"/>`;
  }).join("");
  const routeLines = systemRouteSegments(chart, route).map(segment => {
    const a = point(segment.a), b = point(segment.b);
    const arrow = arrowPath(a, b, 0.7, 5 * unit);
    return `<g class="sm-system-route" data-route-from="${esc(segment.from)}" data-route-to="${esc(segment.to)}"><line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"/><path class="sm-system-route-arrow" d="${arrow}"/></g>`;
  }).join("");
  const exits = chart.exits.map(exit => {
    const a = point(exit.start), b = point(exit.end);
    const peer = world.systemsById[exit.peerSystemId];
    const label = peer?.n || "Connected system";
    const anchor = exit.direction[0] < -0.25 ? "end" : exit.direction[0] > 0.25 ? "start" : "middle";
    const gap = GALAXY.systemMap.labelGap * unit;
    const lx = b[0] + exit.direction[0] * gap;
    const ly = b[1] - exit.direction[1] * gap + 3 * unit;
    return `<g class="sm-exit" data-exit="${esc(exit.id)}" data-peer-system="${esc(exit.peerSystemId)}"
      role="button" tabindex="0" aria-label="${esc(label)}, neighbouring ${esc(term("mapNode"))}">
      <line class="sm-edge sm-exit-edge" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"/>
      <circle class="sm-exit-hit" cx="${b[0]}" cy="${b[1]}" r="${GALAXY.systemMap.pocketRadius * unit + 9 * unit}"/>
      <circle class="sm-exit-cap" cx="${b[0]}" cy="${b[1]}" r="${3.5 * unit}"/>
      <text x="${lx}" y="${ly}" text-anchor="${anchor}" style="font-size:${11 * unit}px;stroke-width:${3 * unit}px">${esc(label)}</text>
    </g>`;
  }).join("");
  const routeExitLines = systemRouteExits(chart, route).map(({ from, to, a: start, b: end }) => {
    const a = point(start), b = point(end);
    return `<g class="sm-system-route sm-system-route-exit" data-route-from="${esc(from)}" data-route-to="${esc(to)}"><line class="sm-route-exit-edge" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"/><path class="sm-system-route-arrow" d="${arrowPath(a, b, 0.7, 5 * unit)}"/></g>`;
  }).join("");
  const routePocketIds = new Set(Array.isArray(route) ? route : []);
  const routeStartPocket = Array.isArray(route) ? route[0] : null;
  const routeDestinationPocket = Array.isArray(route) ? route.at(-1) : null;
  const pocketRadius = GALAXY.systemMap.pocketRadius * unit;
  const labels = pocketLabelLayout(chart, point, pocketRadius, unit);
  const nodes = chart.nodes.map(node => {
    const [x, y] = point(node.pos);
    const current = node.id === here.id;
    const station = placeDef(node.pocket.id).features.some(feature => feature.kind === "station");
    const label = labels.get(node.id);
    const role = routeRole(node.id, routePocketIds, routeStartPocket, routeDestinationPocket);
    const radius = (role?.start || role?.destination ? ROUTE_ICON_SCALE : 1) * pocketRadius;
    const roleClass = role ? ` route-${role.destination ? "destination" : role.start ? "start" : "intermediate"}` : "";
    const marker = routeMarkerMarkup(x, y, radius, role, unit);
    const { x: lx, y: ly, anchor } = label;
    const labelLink = label.moved
      ? `<line class="sm-label-link" x1="${x}" y1="${y}" x2="${lx}" y2="${ly}"/>`
      : "";
    const dot = station
      ? `<rect class="sm-dot sm-station-dot" x="${x - radius}" y="${y - radius}" width="${radius * 2}" height="${radius * 2}"/>`
      : `<circle class="sm-dot" cx="${x}" cy="${y}" r="${radius}"/>`;
    const peerAttr = node.peerSystemId ? ` data-peer-system="${esc(node.peerSystemId)}"` : "";
    const hereLabel = current ? `<tspan class="sm-here-label" x="${lx}" dy="${12 * unit}">(You are here)</tspan>` : "";
    return `<g class="sm-node sm-pocket-node${station ? " sm-station-node" : ""}${current ? " current" : ""}${roleClass}" data-pocket="${esc(node.id)}"${peerAttr}
      role="button" tabindex="0" aria-label="${esc(node.pocket.n)}${node.peerSystemId ? ", gate to neighbouring system" : ""}${station ? ", station pocket" : ""}${current ? ", current pocket" : ""}">
      <circle class="sm-hit" cx="${x}" cy="${y}" r="${radius + 9 * unit}"/>
      ${labelLink}
      ${dot}
      ${marker}
      <text x="${lx}" y="${ly}" text-anchor="${anchor}" style="font-size:${11 * unit}px;stroke-width:${3 * unit}px">${esc(node.pocket.n)}${hereLabel}</text>
    </g>`;
  }).join("");
  // The core is a named chart object, not a pocket: no data-pocket, travel action,
  // route endpoint or saved flight location. Its two-line label is always visible;
  // no native <title> tooltip duplicates it. Radii are map units, so zoom scales it.
  const core = system.core || { kind: "star", n: systemCoreName(system) };
  const blackHole = core.kind === "blackHole";
  const radius = blackHole ? GALAXY.systemMap.blackHoleRadius : GALAXY.systemMap.coreRadius;
  const type = blackHole ? "Black hole" : "Star";
  const coreLabel = `${core.n} (${type})`;
  const coreX = ox, coreY = oy;
  const labelY = coreY + radius + GALAXY.systemMap.coreLabelOffset * unit;
  const lineStep = GALAXY.systemMap.coreLabelLineHeight * unit;
  const coreMarkup = `<g class="sm-core ${blackHole ? "black-hole" : "star"}" data-core="${esc(system.id)}"
    role="img" tabindex="0" aria-label="${esc(coreLabel)}">
    <circle class="sm-core-glow" cx="${coreX}" cy="${coreY}" r="${radius * 2.4}"/>
    <circle class="sm-core-ring" cx="${coreX}" cy="${coreY}" r="${radius + 5 * unit}"/>
    <circle class="sm-core-body" cx="${coreX}" cy="${coreY}" r="${radius}"/>
    <circle class="sm-core-hit" cx="${coreX}" cy="${coreY}" r="${radius + 10 * unit}"/>
    <text class="sm-core-label sm-core-name" x="${coreX}" y="${labelY}"
      text-anchor="middle" style="font-size:${12 * unit}px;stroke-width:${3 * unit}px">${esc(core.n)}</text>
    <text class="sm-core-label sm-core-type" x="${coreX}" y="${labelY + lineStep}"
      text-anchor="middle" style="font-size:${11 * unit}px;stroke-width:${3 * unit}px">(${esc(type)})</text>
  </g>`;
  return lines + exits + routeExitLines + coreMarkup + routeLines + nodes;
}

function render() {
  const view = state.ui.starmap;
  if (!root || !view || !state.galaxy) return;
  drag = null;   // a re-render replaces the SVG; never keep capturing the old one
  const world = chartGalaxy(state.galaxy);
  const know = knowledge();
  const systems = visibleSystems(world, know);
  if (!systems.some(s => s.id === view.selected)) {
    view.selected = systems[0]?.id || null;
    if (view.mode === "system") view.mode = "galaxy";
  }
  const from = localPlayer()?.place || state.place;
  const here = placeAt(from);
  const selected = world.systemsById[view.selected];
  const focus = root.querySelector(":focus")?.dataset || null;
  const progress = transition ? clamp((now() - transition.start) / transition.duration, 0, 1) : 1;
  const eased = progress * progress * (3 - 2 * progress);
  const box = transition ? interpolateViewBox(transition.fromBox, transition.toBox, eased) : activeChartViewBox(world, view, know);
  const rect = root.querySelector("svg.sm-chart")?.getBoundingClientRect?.() || { width: 800, height: 600 };
  const unit = chartPixelScale(box, rect.width, rect.height);
  const showGalaxy = view.mode === "galaxy" || !!transition;
  const showSystem = view.mode === "system" || !!transition;
  const route = state.ui.destination ? findDestinationRoute(world, from, state.ui.destination, travelContext()) : null;
  const galaxy = showGalaxy ? galaxyMarkup(world, view, know, here, unit, route) : "";
  const system = showSystem && view.selected ? systemMarkup(world, view, know, here, unit, route) : "";
  const galaxyOpacity = transition ? (transition.toMode === "system" ? 1 - eased : eased) : 1;
  const systemOpacity = transition ? (transition.toMode === "system" ? eased : 1 - eased) : 1;
  const chart = transition
    ? `<g class="sm-galaxy-layer" opacity="${galaxyOpacity}" style="pointer-events:none">${galaxy}</g>
       <g class="sm-system-layer" opacity="${systemOpacity}" style="pointer-events:none">${system}</g>`
    : view.mode === "system" ? system : galaxy;
  const choices = selected ? pocketChoices(world, from, selected.id, travelContext()) : [];
  const rows = choices.map(c => `
    <li class="sm-pocket${c.current ? " here" : ""}" data-pocket-row="${esc(c.pocket.id)}"${c.current ? ' aria-current="location"' : ""}>${esc(c.pocket.n)}</li>`).join("");
  const rootRect = root.getBoundingClientRect?.() || { left: 0, top: 0, width: 800, height: 600 };
  const menu = view.menu ? (view.menu.systemId ? systemMenuMarkup(world, view, from, rootRect) : pocketMenuMarkup(world, view, from, rootRect)) : "";
  const routeDetails = routeMarkup(world, view, route, from);
  const tools = view.mode === "system"
    ? `<div class="sm-tools"><strong>${esc(selected?.n || "")}</strong>
        <div><button type="button" data-action="back">Back to galaxy</button>
          <button type="button" data-action="zoom-out" aria-label="Zoom out">−</button>
          <button type="button" data-action="zoom-in" aria-label="Zoom in">+</button>
          <button type="button" data-action="reset">Fit</button></div></div>`
    : `<div class="sm-tools">
        <label>Inspect <select id="sm-system">${systems.map(s =>
          `<option value="${esc(s.id)}"${s.id === view.selected ? " selected" : ""}>${esc(s.n)}</option>`).join("")}</select></label>
        <div><button type="button" data-action="zoom-out" aria-label="Zoom out">−</button>
          <button type="button" data-action="zoom-in" aria-label="Zoom in">+</button>
          <button type="button" data-action="reset">Fit</button>
          <button type="button" data-action="labels">${view.labels ? "Fewer names" : "All names"}</button></div></div>`;
  const localTravel = selected && intraSystemPolicy(world, selected.id) === "free"
    ? `Warp to any ${esc(term("flyable"))} in this ${esc(term("mapNode"))}; no internal route is needed.`
    : `Follow the internal route lines; this ${esc(term("mapNode"))} requires connected ${esc(term("flyable"))} hops.`;
  const help = view.mode === "system"
    ? `Click or right-click a ${esc(term("flyable"))} to warp or set a destination. ${localTravel} Click a neighbouring ${esc(term("mapNode"))} at a gate stub to check that gate route; double-click the gate or its label to open that map directly. The central star/black hole is not warpable. Scroll out or Back to return.`
    : `Right-click a system to set a destination. Press J in flight for the next warp. Click a ${esc(term("mapNode"))} to select it. Scroll up or double-click to open its ${esc(term("flyable"))} map. Drag to pan; +/− zoom.`;

  root.innerHTML = `
    <div class="sm-shell">
      <header class="sm-header">
        <div><h1>Starmap</h1>
          <p>${esc(here.n)} · ${esc(placeAt(here.parent).n)} · ${systems.length} ${esc(terms("mapNode"))}</p></div>
        <button type="button" data-action="close">Close · M / Esc</button>
      </header>
      <div class="sm-body">
        <section class="sm-chart-panel" aria-label="${esc(Term("mapNode"))} chart">
          ${tools}
          ${localPlayer()?.docked ? `<p class="sm-notice">Docked at ${esc(here.n)}: launch to warp. The chart can be used here for planning.</p>` : view.notice ? `<p class="sm-notice">${esc(view.notice)}</p>` : ""}
          <svg class="sm-chart${transition ? " transitioning" : ""}" data-mode="${esc(view.mode)}" viewBox="${box.join(" ")}" preserveAspectRatio="xMidYMid meet" aria-label="${view.mode === "system" ? esc(selected?.n || "") + " " + esc(terms("flyable")) : "Connected " + esc(terms("mapNode"))}">
            ${chart}
          </svg>
          <p class="sm-help">${help}</p>
        </section>
        <aside class="sm-details" aria-label="System overview">
          ${selected ? `<h2>${esc(selected.n)}</h2>
            <p class="sm-current"><span>Current pocket</span> ${esc(here.n)}</p>
            <h3>${esc(Term("flyable"))}s</h3>
            <ul class="sm-pockets">${rows}</ul>${routeDetails}` : `<h2>No visible ${esc(terms("mapNode"))}</h2>`}
        </aside>
      </div>
      ${menu}
    </div>`;
  // Measure the actual space below the pocket list. Show every stop that fits;
  // only introduce page controls when the panel really needs them.
  const detailsRect = root.querySelector(".sm-details")?.getBoundingClientRect?.();
  const routeEl = root.querySelector(".sm-route");
  const routeRect = routeEl?.getBoundingClientRect?.();
  const visibleList = routeEl?.querySelector?.(".sm-route-list");
  const shownRows = visibleList?.querySelectorAll?.("li")?.length || 0;
  if (shownRows && routeRect && detailsRect && Number.isFinite(detailsRect.bottom) &&
      Number.isFinite(routeRect.top) && Number.isFinite(routeRect.height)) {
    // System names may wrap. Measure
    // all rows in a hidden copy and use the tallest to keep every page inside.
    const measured = [...(routeEl.querySelectorAll?.(".sm-route-measure li") || [])];
    const rowHeight = Math.max(22, ...measured.map(row => (row.getBoundingClientRect?.().height || 18) + 4));
    const listHeight = visibleList.getBoundingClientRect?.().height || shownRows * rowHeight;
    const overhead = Math.max(0, routeRect.height - listHeight);
    const size = Math.max(1, Math.floor((detailsRect.bottom - 15 - routeRect.top - overhead + 4) / rowHeight));
    if (view.routePageSize !== size) { view.routePageSize = size; render(); return; }
  }
  const cssEscape = globalThis.CSS?.escape || (value => value.replace(/["\\]/g, "\\$&"));
  if (view.menu) root.querySelector(".sm-context button, .sm-context")?.focus();
  else if (focus?.system) root.querySelector(`[data-system="${cssEscape(focus.system)}"]`)?.focus();
  else if (focus?.pocket) root.querySelector(`[data-pocket="${cssEscape(focus.pocket)}"]`)?.focus();
  else if (focus?.exit) root.querySelector(`[data-exit="${cssEscape(focus.exit)}"]`)?.focus();
  else if (focus?.core) root.querySelector(`[data-core="${cssEscape(focus.core)}"]`)?.focus();
  else if (focus?.action) root.querySelector(`[data-action="${cssEscape(focus.action)}"]`)?.focus();
  if (transition) scheduleTransition();
}

function pocketMenuMarkup(world, view, from, rootRect) {
  const choice = menuChoice(world, view, from);
  if (!choice) return "";
  const tuning = { ...GALAXY.map.context, height: 165 };
  const pos = contextMenuPosition(view.menu.x - (rootRect.left || 0), view.menu.y - (rootRect.top || 0), rootRect, tuning);
  return `<div class="sm-context" role="menu" tabindex="-1" aria-label="${esc(choice.title)}"
    style="left:${pos.left + (rootRect.left || 0)}px;top:${pos.top + (rootRect.top || 0)}px;width:${GALAXY.map.context.width}px">
    <strong>${esc(choice.title)}</strong>
    <button type="button" role="menuitem" data-action="set-pocket-destination">Set destination</button>
    ${choice.canWarp
      ? `<button type="button" role="menuitem" data-action="travel" data-to="${esc(choice.pocket.id)}">Warp to ${esc(choice.title)}</button>`
      : `<p class="sm-context-note">${esc(choice.status)}</p>`}
  </div>`;
}


function systemMenuMarkup(world, view, from, rootRect) {
  const id = view.menu.systemId, system = world.systemsById[id];
  if (!system || !systemVisible(world, id, knowledge())) return "";
  const direct = directSystemWarp(world, from, id, travelContext());
  const tuning = { ...GALAXY.map.context, height: 165 };
  const pos = contextMenuPosition(view.menu.x - (rootRect.left || 0), view.menu.y - (rootRect.top || 0), rootRect, tuning);
  return `<div class="sm-context" role="menu" tabindex="-1" aria-label="${esc(system.n)}"
    style="left:${pos.left + (rootRect.left || 0)}px;top:${pos.top + (rootRect.top || 0)}px;width:${tuning.width}px">
    <strong>${esc(system.n)}</strong>
    <button type="button" role="menuitem" data-action="set-destination">Set destination</button>
    ${direct ? `<button type="button" role="menuitem" data-action="system-warp">Warp to ${esc(system.n)}</button>` : ""}
  </div>`;
}

/** List remaining systems and paginate only when needed. */
function routeMarkup(world, view, route, from) {
  const details = routeDisplay(world, state.ui.destination, route, knowledge(), from);
  if (!details) return "";
  const { title, stops } = details;
  const pageSize = view.routePageSize || Math.max(1, stops.length);
  const pages = Math.max(1, Math.ceil(stops.length / pageSize));
  view.routePage = Math.min(view.routePage || 0, pages - 1);
  const rows = flightRouteRows(stops.slice(view.routePage * pageSize, (view.routePage + 1) * pageSize));
  return `<section class="sm-route" aria-label="Route"><h3>Route to ${esc(title)}</h3>
    ${route ? `<ol class="sm-route-list">${rows}</ol><ol class="sm-route-measure" aria-hidden="true">${flightRouteRows(stops)}</ol><p>J · next warp</p>` : '<p>No route available.</p>'}
    <div class="sm-route-actions">${pages > 1 ? `<button type="button" data-action="route-prev" ${view.routePage === 0 ? "disabled" : ""}>‹</button><span>${view.routePage + 1} / ${pages}</span><button type="button" data-action="route-next" ${view.routePage === pages - 1 ? "disabled" : ""}>›</button>` : ""}
    <button type="button" data-action="clear-destination">Clear</button></div></section>`;
}
