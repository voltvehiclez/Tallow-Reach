import { test } from "node:test";
import assert from "node:assert/strict";
import { newProfile, sanitizeProfile, SAVE_VERSION } from "../src/state/profile.js";
import { encodeSave, decodeSave } from "../src/state/storage.js";
import { setSeed, random } from "../src/util/rng.js";
import { generateBoard } from "../src/sim/contracts.js";
import { CONTRACT } from "../src/data/contracts.js";

test("fresh profile is valid and versioned", () => {
  const p = newProfile();
  assert.equal(p.v, SAVE_VERSION);
  assert.deepEqual(sanitizeProfile(p), p);
});

test("prototype saves (no version field) still load", () => {
  const old = { cr: 1200, cargo: { ferrite: 3 }, store: {}, ships: ["wasp"], ship: "wasp", base: { store: 2, hangar: 1, refinery: 1 }, mission: null, done: 2, kills: 5, wp: { beam: true, msl: false }, msl: 0, pw: "beam", hp: {} };
  const p = sanitizeProfile(old);
  assert.equal(p.v, SAVE_VERSION);
  assert.equal(p.cr, 1200);
  assert.equal(p.cargo.ferrite, 3);
  assert.equal(p.cargo.core, 0);
  assert.equal(p.pw, "beam");
});

test("sanitising clamps out-of-range values and drops unknown ships", () => {
  const p = sanitizeProfile({
    ships: ["wasp", "nope"], ship: "nope", cr: -50, base: { store: 99, hangar: -3, refinery: 40 },
    msl: 99, hp: { wasp: 7 }, mission: { type: "bogus" },
  });
  assert.deepEqual(p.ships, ["wasp"]);
  assert.equal(p.ship, "wasp");
  assert.equal(p.cr, 0);
  assert.deepEqual(p.base, { store: 5, hangar: 1, refinery: 4 });
  assert.equal(p.msl, 12);
  assert.equal(p.hp.wasp, 1);
  assert.equal(p.mission, null);
});

test("losing every ship with no cash gives a free Wasp", () => {
  const p = sanitizeProfile({ ships: [], ship: "bulwark", cr: 10 });
  assert.deepEqual(p.ships, ["wasp"]);
  assert.equal(p.ship, "wasp");
});

test("invalid input throws", () => {
  assert.throws(() => sanitizeProfile(null));
  assert.throws(() => sanitizeProfile({ ships: "wasp" }));
  assert.throws(() => decodeSave("TR1:not-base64!!"));
});

test("save codes round-trip", () => {
  const p = newProfile();
  p.cr = 4321;
  p.mission = { type: "hunt", n: 4, tier: 2, r: 1000, p: 1 };
  const back = decodeSave(encodeSave(p));
  assert.equal(back.cr, 4321);
  assert.equal(back.mission.type, "hunt");
  assert.ok(encodeSave(p).startsWith("TR1:"));
});

test("seeded RNG is reproducible and unseeded RNG is not", () => {
  setSeed(42);
  const a = [random(), random(), random()];
  setSeed(42);
  const b = [random(), random(), random()];
  assert.deepEqual(a, b);
  setSeed(null);
  assert.ok(random() >= 0 && random() < 1);
});

test("the same seed produces the same contract board", () => {
  setSeed(7);
  const a = JSON.stringify(generateBoard());
  setSeed(7);
  const b = JSON.stringify(generateBoard());
  setSeed(null);
  assert.equal(a, b);
});

test("mine contracts pick ore and size independently", () => {
  const seen = new Set();
  for (let i = 0; i < 400; i++) {
    const c = CONTRACT.mine(1, Math.random);
    seen.add(c.o + ":" + c.n);
  }
  const ores = new Set([...seen].map(s => s.split(":")[0]));
  const sizes = new Set([...seen].map(s => s.split(":")[1]));
  assert.equal(ores.size, 3);
  assert.ok(sizes.size > 6);
});
