// Shared, presentation-only summary of the executable route shown on the chart and HUD.
import { PLACE_DEFS } from "../data/places.js";
import { templateFeatures } from "../data/place-templates.js";
import { systemVisible } from "../sim/galaxy.js";

export function pocketIconKind(pocket) {
  if (!pocket) return "circle";
  const features = pocket.template ? templateFeatures(pocket.template, pocket).features
    : [...(PLACE_DEFS[pocket.def]?.features || []), ...(pocket.features || []), ...(pocket.extraFeatures || [])];
  if (features.some(f => f.kind === "station")) return "station";
  return ["belt", "planet"].includes(pocket.role) ? pocket.role : "circle";
}

export function pocketMarkerMarkup(pocket, current = false) {
  const kind = pocketIconKind(pocket);
  const shape = kind === "station" ? '<rect x="10" y="10" width="12" height="12"/>'
    : kind === "belt" ? '<circle cx="11" cy="19" r="3"/><circle cx="16" cy="12" r="2.5"/><circle cx="22" cy="19" r="2.5"/>'
    : kind === "planet" ? '<ellipse class="nav-planet-ring" cx="16" cy="16" rx="10" ry="4"/><circle cx="16" cy="16" r="6"/>'
    : '<circle cx="16" cy="16" r="6"/>';
  return `<svg class="nav-pocket-icon ${current ? "nav-current" : "nav-destination"}" viewBox="0 0 32 32" aria-hidden="true">${current ? '<circle class="nav-current-ring" cx="16" cy="16" r="13"/>' : ""}<g>${shape}</g></svg>`;
}

export function routeDisplay(world, destination, route, knowledge = {}, from = route?.[0]) {
  if (!world || !destination) return null;
  const targetPocket = typeof destination === "object" ? world.pocketsById[destination.pocketId] : null;
  const targetSystem = world.systemsById[targetPocket?.parent || destination];
  if (!targetSystem) return null;
  const currentPocket = world.pocketsById[from];
  const current = currentPocket ? { pocket: currentPocket.n,
    system: world.systemsById[currentPocket.parent]?.n || currentPocket.parent } : null;
  const stops = [];
  if (route) for (const [i, id] of route.entries()) {
    const pocket = world.pocketsById[id];
    if (!pocket) continue;
    const visible = pocket.parent === currentPocket?.parent || systemVisible(world, pocket.parent, knowledge);
    let row = stops.at(-1);
    // Group contiguous jumps by system; revisiting a system later makes a new row.
    if (!row || row.id !== pocket.parent) {
      row = { id: pocket.parent, system: visible ? (world.systemsById[pocket.parent]?.n || pocket.parent) : "Undiscovered system", pockets: [] };
      stops.push(row);
    }
    row.pockets.push({ name: visible ? pocket.n : "Undiscovered pocket", current: i === 0 });
  }
  if (route?.length && stops.length) {
    stops.at(-1).destination = true;
    if (targetPocket) {
      stops.at(-1).destinationPocket = targetPocket.n;
      stops.at(-1).destinationKind = pocketIconKind(targetPocket);
    }
  }
  return { title: targetPocket ? targetPocket.n : targetSystem.n,
    current, stops, available: !!route };
}

export const escapeRouteText = value => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c]));

// Shared by the flight HUD and starmap: show only remaining system names.
export function flightRouteRows(stops) {
  return stops.map(stop => {
    const current = stop.pockets.some(p => p.current);
    const classes = [current ? "route-here" : "", stop.destination ? "route-destination" : ""].filter(Boolean).join(" ");
    const destinationPocket = stop.destinationPocket ? `(${escapeRouteText(stop.destinationPocket)})` : "";
    const pocket = stop.destinationPocket ? ` <small><span class="route-pocket-icon icon-${stop.destinationKind || "circle"}" aria-hidden="true"></span>${destinationPocket}</small>` : "";
    const destinationLabel = stop.destination ? ` aria-label="${escapeRouteText(stop.system)}${stop.destinationPocket ? ` ${destinationPocket}` : ""}, destination"` : "";
    const markerClasses = ["route-marker", current ? "route-marker-start" : stop.destination ? "route-marker-destination" : "route-marker-intermediate"].filter(Boolean).join(" ");
    const tick = "";
    const marker = `<span class="${markerClasses}" aria-hidden="true">${tick}</span>`;
    return `<li${classes ? ` class="${classes}"` : ""}${current ? ' aria-current="location"' : ""}${destinationLabel}>${marker} ${escapeRouteText(stop.system)}${pocket}</li>`;
  }).join("");
}
