// Step 16 slice 8c follow-up (2026-11-27): enemies on the guest.
// The ground rule: the guest plays exactly as it would single-player. The host is still the only
// writer of the wound — this is the picture of every hostile in the pocket, plus the same bullets
// the host's own screen shows being dodged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanMessage, LIMITS } from "../src/net/protocol.js";
import { DEFAULT_PLACE } from "../src/data/places.js";
import { DEFAULT_ENEMY } from "../src/data/enemies.js";

const at = (x, y, z) => [x, y, z];
const mk = (id, def, extra = {}) => ({
  id,
  def,
  friendly: false,
  boost: false,
  pos: at(1, 2, 3),
  quat: [0, 0, 0, 1],
  v: at(4, 0, 5),
  hp: 30,
  mx: 50,
  ...extra,
});

test("enemies: a hostile record travels intact through the pocket entities message", () => {
  const message = cleanMessage("entities", { place: DEFAULT_PLACE, enemies: [mk(7, "raider"), mk(8, "turret", { friendly: true, boost: true })] });
  assert.equal(message.enemies.length, 2);
  assert.deepEqual(message.enemies[0], {
    id: 7, def: "raider", friendly: false, boost: false,
    pos: [1, 2, 3], quat: [0, 0, 0, 1], v: [4, 0, 5], hp: 30, mx: 50,
  });
  assert.equal(message.enemies[1].friendly, true);
  assert.equal(message.enemies[1].boost, true);
});

test("enemies: junk is dropped — no id or no def means no hull to draw", () => {
  const message = cleanMessage("entities", {
    place: DEFAULT_PLACE,
    enemies: [
      null,                       // not a record
      {},                         // nothing at all
      mk(0, "raider"),            // id zero cannot be keyed
      mk(-3, "raider"),           // negative id
      mk(9, ""),                  // no def — nothing to build the mesh from
      { ...mk(10, "raider"), extra: "dropped" },
    ],
  });
  assert.deepEqual(message.enemies.map(e => e.id), [10], "the one valid hull is all that survives");
  assert.equal("extra" in message.enemies[0], false, "and nothing outside the contract rides along");
});

test("enemies: the same cap as the rest of the pocket — a full room, never a flood", () => {
  const many = Array.from({ length: LIMITS.entities + 8 }, (_, i) => mk(i + 1, "raider"));
  const clean = cleanMessage("entities", { place: DEFAULT_PLACE, enemies: many });
  assert.equal(clean.enemies.length, LIMITS.entities);
  assert.equal(cleanMessage("entities", {}).enemies.length, 0, "an absent list is an empty pocket, not null");
});

test("enemies: what is on the wire is what this build's enemy views can read", () => {
  // The view needs def (mesh), pos/quat (pose), v (glow + ballistic lead) and the flags; the
  // lock path needs kind/friendly on the record, which the applier sets. Nothing else is believed.
  const message = cleanMessage("entities", { place: DEFAULT_PLACE, enemies: [mk(42, DEFAULT_ENEMY, { extra: 1 })] });
  const e = message.enemies[0];
  assert.deepEqual(Object.keys(e).sort(), ["boost", "def", "friendly", "hp", "id", "mx", "pos", "quat", "v"].sort(), "the contract is exactly the nine fields");
  assert.deepEqual(JSON.parse(JSON.stringify(message)), message, "and it survives a JSON round trip");
});

test("entities: pickups and enemy gunfire clean to what this build can read", () => {
  const message = cleanMessage("entities", {
    place: DEFAULT_PLACE,
    picks: 3.7,                       // fractional counts floor to whole chimes
    efires: [12, 12, 0, -4, "x", 99, 9988, 777, 555, 333, 111, 222, 444],   // dupes, junk, over the cap
  });
  assert.equal(message.picks, 3);
  assert.deepEqual(message.efires, [12, 99, 9988, 777, 555, 333, 111, 222], "ids survive whole, junk drops, at most eight, no repeats");
  assert.equal(cleanMessage("entities", {}).picks, 0, "absent counter is zero");
  assert.equal(cleanMessage("entities", {}).efires.length, 0, "absent list is empty");
});
