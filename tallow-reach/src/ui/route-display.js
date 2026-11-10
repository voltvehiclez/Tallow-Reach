// Shared, presentation-only summary of the executable route shown on the chart and HUD.
import { systemVisible } from "../sim/galaxy.js";

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
  if (route?.length && stops.length) stops.at(-1).destination = true;
  return { title: targetPocket ? `${targetPocket.n} (${targetSystem.n})` : targetSystem.n,
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
    const marker = stop.destination ? ' <span class="route-goal" role="img" aria-label="Destination">◆</span>' : "";
    return `<li${classes ? ` class="${classes}"` : ""}${current ? ' aria-current="location"' : ""}><span aria-hidden="true">→</span> ${escapeRouteText(stop.system)}${marker}</li>`;
  }).join("");
}
