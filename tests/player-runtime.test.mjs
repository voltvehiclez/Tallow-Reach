// In-progress 8c: separately supplied player flight, shields, power and damage.
import { test } from "node:test";
import assert from "node:assert/strict";
import { state } from "../src/state/state.js";
import { newProfile } from "../src/state/profile.js";
import { createPlayer, createPlayerRecord, flight, hurt } from "../src/sim/player.js";
import { driveOf, refreshDrive } from "../src/sim/drive.js";
import { shieldOf, updateShield } from "../src/sim/shield.js";
import { powerOf, refillPower, updatePower } from "../src/sim/power.js";
import { on } from "../src/util/events.js";
import "../src/sim/session.js"; // real local-death listener must ignore the other player

function fresh() {
  state.players.length = 0;
  state.localPlayerIndex = 0;
  state.profile = newProfile();
  state.place = "hollow";
  state.time = 10;
  state.warp = null;
  state.freeCam.on = false;
  state.world.asteroids.length = 0;
  const local = createPlayer();
  refreshDrive();
  refillPower();
  local.docked = false;
  local.hull = local.hullMax = 10;
  local.sh = local.shMax = 10;
  const other = createPlayerRecord();
  const profile = newProfile();
  const loadout = profile.loadout[profile.ship];
  const drive = driveOf(loadout);
  const caps = powerOf(loadout);
  const power = { ...caps, stored: caps.cap, draw: 0, use: { drive: 0, shield: 0, guns: 0, beam: 0 } };
  const shield = shieldOf(loadout);
  other.docked = false;
  other.pos.set(500, 0, 0);
  other.en = other.enMax = drive.bmax;
  other.hull = other.hullMax = 10;
  other.shMax = shield.cap;
  other.sh = 4;
  state.players.push(other);
  return { local, other, profile, drive, power, shield };
}

test("an explicit player flies and draws power without altering the local pilot or budget", () => {
  const { local, other, profile, drive, power } = fresh();
  const before = { pos: local.pos.toArray(), stored: state.power.stored, draw: state.power.draw };
  other.controls.thrust = 1;
  for (let i = 0; i < 60; i++) {
    flight(1 / 60, other, { drive, power, profile });
    updatePower(1 / 60, power);
  }
  assert.ok(other.pos.z < -1);
  assert.ok(power.draw > 0);
  assert.deepEqual(local.pos.toArray(), before.pos);
  assert.equal(state.power.stored, before.stored);
  assert.equal(state.power.draw, before.draw);
});

test("other-player shields and hull damage use their own state and profile", () => {
  const { local, other, profile, shield, power } = fresh();
  const localHp = state.profile.hp[state.profile.ship];
  updateShield(1, other, shield, power);
  assert.equal(other.sh, 5);
  assert.equal(local.sh, 10);
  assert.equal(power.use.shield, 2);
  hurt(7, other, profile);
  assert.equal(other.sh, 0);
  assert.equal(other.hull, 8);
  assert.equal(profile.hp[profile.ship], 0.8);
  assert.equal(state.profile.hp[state.profile.ship], localHp);
  assert.equal(local.hull, 10);
});

test("another player's death identifies them and does not destroy the local ship", () => {
  const { local, other, profile } = fresh();
  const events = [];
  on("player-dead", event => events.push(event));
  other.sh = 0;
  hurt(20, other, profile);
  assert.equal(events.at(-1).player, other);
  assert.equal(local.hull, 10);
  assert.equal(local.docked, false);
  assert.deepEqual(state.profile.ships, [state.profile.ship]);
});

test("non-local flight, damage and shields reject accidentally shared local state", () => {
  const { other, profile, drive, power, shield } = fresh();
  assert.throws(() => flight(1 / 60, other), /own drive, power and profile/);
  assert.throws(() => flight(1 / 60, other, { drive, power: state.power, profile }), /own drive, power and profile/);
  assert.throws(() => hurt(1, other), /own profile/);
  assert.throws(() => updateShield(1, other, shield, state.power), /own shield and power/);
  assert.doesNotThrow(() => updateShield(1, other, shield, power));
});
