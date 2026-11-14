// Keys 1 and 2 select primary bay 1 and primary bay 2, and only the selected
// bay's module may fire. Two cannons fitted means two weapons — but never two at
// once. A legacy save whose `pw` was the old "cannon"/"beam" mode switch migrates
// to the bay holding that kind of module on the flown ship.
import { test } from "node:test";
import assert from "node:assert/strict";
import { state } from "../src/state/state.js";
import { newProfile, sanitizeProfile } from "../src/state/profile.js";
import { createPlayer } from "../src/sim/player.js";
import { configurePlayer } from "../src/sim/session.js";
import { updatePrimary, setWeapon } from "../src/sim/weapons.js";

function setup(fit = ["cannon_basic", "cannon_basic"]) {
  state.players.length = 0;
  state.localPlayerIndex = 0;
  state.profile = newProfile();
  state.profile.loadout.wasp.primary = [...fit];
  state.place = "hollow";
  state.warp = null;
  state.freeCam.on = false;
  for (const list of Object.values(state.world)) list.length = 0;
  const a = createPlayer();
  configurePlayer(a, state.profile);
  a.docked = false;
  a.pos.set(0, 0, 100);
  return a;
}

test("only the gun in the selected primary bay fires", () => {
  const a = setup();
  a.controls.fire = true;

  updatePrimary(1 / 60, a);
  assert.equal(state.world.bullets.filter(b => b.owner === a).length, 2,
    "bay one's twin-linked cannon puts down two bolts, bay two stays silent");
  assert.ok(a.flight.gunCd[0] > 0, "bay one is on cooldown");
  assert.equal(a.flight.gunCd[1], 0, "bay two is not");

  setWeapon(1);
  assert.equal(state.profile.pw, "2", "key 2 selects the second bay");
  updatePrimary(1 / 60, a);
  assert.equal(state.world.bullets.filter(b => b.owner === a).length, 4,
    "bay two's cannon now fires — and only it does");
  assert.ok(a.flight.gunCd[1] > 0, "bay two is on cooldown");
});

test("an empty selected bay fires nothing, even with a gun in the other", () => {
  const a = setup(["cannon_basic", null]);
  setWeapon(1);
  assert.equal(state.profile.pw, "2");
  a.controls.fire = true;
  updatePrimary(1 / 60, a);
  assert.equal(state.world.bullets.filter(b => b.owner === a).length, 0,
    "the empty bay does not fire and does not fall back to the other gun");
});

test("selecting the beam bay stops the cannon from firing", () => {
  const a = setup(["cannon_basic", "beam_basic"]);
  setWeapon(1);   // the beam lives in bay two
  a.controls.fire = true;
  updatePrimary(1 / 60, a);
  assert.equal(state.world.bullets.filter(b => b.owner === a).length, 0,
    "the selected bay holds a beam, so no bolts leave the gun in bay one");
});

test("legacy pw values migrate to the bay holding that kind of module", () => {
  const fit = {
    power: ["power_basic"],
    cell: ["cell_basic"],
    thruster: ["thruster_basic"],
    shield: ["shield_basic"],
    primary: ["cannon_basic", "beam_basic"],
    secondary: ["missile_basic"],
    hull: ["hull_basic"],
  };
  const beam = sanitizeProfile({ ships: ["wasp"], ship: "wasp", v: 21, pw: "beam", loadout: { wasp: fit } });
  assert.equal(beam.pw, "2", "the beam lives in bay two");
  const cannon = sanitizeProfile({ ships: ["wasp"], ship: "wasp", v: 21, pw: "cannon", loadout: { wasp: fit } });
  assert.equal(cannon.pw, "1", "the cannon lives in bay one");
  const beamInBayOne = sanitizeProfile({
    ships: ["wasp"], ship: "wasp", v: 21, pw: "beam",
    loadout: { wasp: { ...fit, primary: ["beam_basic", "cannon_basic"] } },
  });
  assert.equal(beamInBayOne.pw, "1", "a beam in bay one is the bay one selection");
});
