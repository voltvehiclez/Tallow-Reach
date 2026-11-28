// Persist the local destination immediately, including when the map is paused.
// The route itself is derived afresh; only the target is saved.
import { state, currentSave, saveCurrentGame } from "./state.js";

export function setDestination(destination) {
  state.ui.destination = destination;
  state.worldState.destination = destination;
  if (!state.ui.intro && !state.away) saveCurrentGame();
}
