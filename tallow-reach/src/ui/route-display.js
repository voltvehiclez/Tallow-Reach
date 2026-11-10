// Shared, presentation-only summary of the executable route shown on the chart and HUD.
import { systemVisible } from "../sim/galaxy.js";

export function routeDisplay(world, destination, route, knowledge = {}) {
  if (!world || !destination) return null;
  const targetPocket = typeof destination === "object" ? world.pocketsById[destination.pocketId] : null;
  const targetSystem = world.systemsById[targetPocket?.parent || destination];
  if (!targetSystem) return null;
  const stops = [];
  if (route) for (let i = 1; i < route.length; i++) {
    const pocket = world.pocketsById[route[i]], previous = world.pocketsById[route[i - 1]];
    if (!pocket || !previous || (pocket.parent === previous.parent && pocket.id !== targetPocket?.id)) continue;
    const system = world.systemsById[pocket.parent];
    const visible = systemVisible(world, pocket.parent, knowledge);
    const showPocket = pocket.id === targetPocket?.id || (!targetPocket && pocket.parent === targetSystem.id);
    stops.push({ system: visible ? (system?.n || pocket.parent) : "Undiscovered system",
      pocket: visible && showPocket ? pocket.n : null });
  }
  return { title: targetPocket ? `${targetPocket.n} (${targetSystem.n})` : targetSystem.n, stops, available: !!route };
}

export const escapeRouteText = value => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c]));

export function routeRows(stops) {
  return stops.map(stop => `<li><span aria-hidden="true">→</span> ${escapeRouteText(stop.system)}${stop.pocket ? ` <small>· ${escapeRouteText(stop.pocket)}</small>` : ""}</li>`).join("");
}
