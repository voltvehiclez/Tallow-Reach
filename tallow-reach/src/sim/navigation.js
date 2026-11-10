// Local session route navigation. Destination is a system or pocket; each J press uses
// exactly one ordinary, re-quoted warp hop (including any local gate hop).
import { state, localPlayer, profileOf, msg } from "../state/state.js";
import { findDestinationRoute } from "./travel.js";
import { startWarp } from "./sectors.js";

export function jumpRoute(player = localPlayer()) {
  if (!player || player.docked || player.dead || player.warp) return false;
  const destination = state.ui.destination;
  if (!destination) { msg("No destination set"); return false; }
  const route = findDestinationRoute(state.galaxy, player.place || state.place, destination,
    { player, profile: profileOf(player), world: state.worldState });
  if (!route) { msg("No route to destination."); return false; }
  if (route.length < 2) { state.ui.destination = null; msg("Destination reached."); return false; }
  return startWarp(player, route[1]);
}
