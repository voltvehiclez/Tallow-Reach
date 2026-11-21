import { test } from "node:test";
import assert from "node:assert/strict";

// The full-reset scope (owner bug: credits unchanged, still owned the Test
// Ship after a reset). Both mode halves start fresh; the pilot stays in the
// mode they pressed Reset from.
const { state, applySave, newRootSave, resetAllSave } = await import("../src/state/state.js");
const { prepareGalaxySave, switchGameMode } = await import("../src/sim/galaxy-session.js");
const { DEFAULT_PLACE } = await import("../src/data/places.js");
const { CAMPAIGN_HOME_POCKET } = await import("../src/data/campaign/galaxy.js");

function dirtyRoot(mode) {
  const root = newRootSave();
  root.mode = mode;
  for (const half of ["open", "campaign"]) {
    root[half].profile.cr = 99999;
    root[half].profile.ships = ["wasp", "testship"];
    root[half].profile.ship = "testship";
  }
  return root;
}

test("reset wipes credits and ships in BOTH modes, whichever mode it is pressed from", () => {
  applySave(prepareGalaxySave(dirtyRoot("campaign")));
  assert.equal(state.profile.cr, 99999);
  const prepared = prepareGalaxySave(resetAllSave());
  applySave(prepared);
  assert.equal(state.mode, "campaign", "still in the mode Reset was pressed from");
  assert.equal(state.profile.cr, 600);
  assert.deepEqual(state.profile.ships, ["wasp"]);
  assert.equal(state.worldState.place, CAMPAIGN_HOME_POCKET);
  switchGameMode("open");
  assert.equal(state.profile.cr, 600, "the other mode was wiped too");
  assert.deepEqual(state.profile.ships, ["wasp"], "no Test Ship survives a reset");
  assert.equal(state.worldState.place, DEFAULT_PLACE, "and the open world starts at Meridian Station");
});
