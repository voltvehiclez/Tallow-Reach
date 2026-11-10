// Shared, presentation-only summary of the executable route shown on the chart and HUD.
import { systemVisible } from "../sim/galaxy.js";

export function routeDisplay(world, destination, route, knowledge = {}, from = route?.[0], completed = []) {
  if (!world || !destination) return null;
  const targetPocket = typeof destination === "object" ? world.pocketsById[destination.pocketId] : null;
  const targetSystem = world.systemsById[targetPocket?.parent || destination];
  if (!targetSystem) return null;
  const currentPocket = world.pocketsById[from];
  const current = currentPocket ? { pocket: currentPocket.n,
    system: world.systemsById[currentPocket.parent]?.n || currentPocket.parent } : null;
  const stops = completed.filter(id => world.systemsById[id]).map(id => ({
    id, system: systemVisible(world, id, knowledge) ? world.systemsById[id].n : "Undiscovered system",
    pockets: [], completed: true, jumps: null,
  }));
  const completedCount = stops.length;
  if (route) for (const [i, id] of route.entries()) {
    const pocket = world.pocketsById[id];
    if (!pocket) continue;
    const visible = pocket.parent === currentPocket?.parent || systemVisible(world, pocket.parent, knowledge);
    let row = stops.at(-1);
    // Group contiguous jumps by system; revisiting a system later makes a new row.
    if (!row || row.completed || row.id !== pocket.parent) {
      row = { id: pocket.parent, jumps: 0, system: visible ? (world.systemsById[pocket.parent]?.n || pocket.parent) : "Undiscovered system", pockets: [] };
      stops.push(row);
    }
    row.pockets.push({ name: visible ? pocket.n : "Undiscovered pocket", current: i === 0 });
    if (i < route.length - 1) row.jumps++;
  }
  return { title: targetPocket ? `${targetPocket.n} (${targetSystem.n})` : targetSystem.n,
    current, stops, completedCount, available: !!route };
}

export const escapeRouteText = value => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c]));

export function routeCurrent(current) {
  return current ? `<p class="route-current"><strong>Current:</strong> ${escapeRouteText(current.pocket)} <small>· ${escapeRouteText(current.system)}</small></p>` : "";
}

// The flight HUD shows only the current and future systems. Completed history
// and pocket details remain available in the starmap's fuller route display.
export function flightRouteRows(stops) {
  return stops.filter(stop => !stop.completed).map(stop => {
    const current = stop.pockets.some(p => p.current);
    return `<li${current ? ' class="route-here" aria-current="location"' : ""}><span aria-hidden="true">→</span> ${escapeRouteText(stop.system)}</li>`;
  }).join("");
}

export function routeRows(stops) {
  return stops.map(stop => {
    const isCurrent = stop.pockets.some(p => p.current);
    const names = stop.pockets.length
      ? ` <small>· ${stop.pockets.map(pocket => pocket.current
        ? `<strong aria-current="location">${escapeRouteText(pocket.name)} (here)</strong>` : escapeRouteText(pocket.name)).join(' → ')}</small>` : "";
    return `<li${stop.completed ? ` class="route-done" aria-label="Completed: ${escapeRouteText(stop.system)}"` : isCurrent ? ' class="route-here"' : ""}><span aria-hidden="true">${stop.completed ? "✓" : "→"}</span> ${escapeRouteText(stop.system)}${names}</li>`;
  }).join("");
}
