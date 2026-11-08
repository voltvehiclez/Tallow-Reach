import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newProfile,
  newWorld,
  newSave,
  sanitizeProfile,
  sanitizeWorld,
  sanitizeSave,
  SAVE_VERSION,
} from "../src/state/profile.js";
import { encodeSave, decodeSave } from "../src/state/storage.js";

test("newProfile and newWorld survive their own sanitizers unchanged", () => {
  const p = newProfile();
  assert.equal(p.v, SAVE_VERSION);
  assert.equal("base" in p, false);
  assert.equal("store" in p, false);
  assert.deepEqual(sanitizeProfile(p), p);

  const w = newWorld();
  assert.equal(w.v, SAVE_VERSION);
  assert.deepEqual(sanitizeWorld(w), w);

  const s = newSave();
  assert.equal(s.v, SAVE_VERSION);
  assert.deepEqual(sanitizeSave(s), s);
});

test("sanitizeSave upgrades an unversioned prototype save into profile and world", () => {
  // Saves written by reference/tallow-reach.html had no `v` field, a single
  // `cargo` bag and `wp` unlock flags.
  const old = {
    cr: 1200,
    cargo: { ferrite: 3, salv: 1 },
    store: { cobalt: 5 },
    ships: ["wasp"],
    ship: "wasp",
    base: { store: 2, hangar: 1, refinery: 1 },
    mission: null,
    done: 4,
    kills: 7,
    wp: { beam: true, msl: false },
    msl: 0,
    pw: "beam",
    hp: { wasp: 0.75 },
  };
  const s = sanitizeSave(old);
  assert.equal(s.v, SAVE_VERSION);
  assert.equal(s.profile.cr, 1200);
  assert.equal(s.profile.hp.wasp, 0.75);
  assert.equal(s.profile.pw, "beam");
  assert.deepEqual(s.profile.holds.wasp, { ferrite: 3, salv: 1 });
  assert.equal(s.world.store.cobalt, 5);
  assert.equal(s.world.store.beam_basic, 1, "old beam unlock becomes a stored module");
  assert.deepEqual(s.world.base, { store: 2, hangar: 1, refinery: 1 });
});

test("sanitizeProfile and sanitizeWorld clamp bogus numbers and drop unknown ids", () => {
  const p = sanitizeProfile({
    v: 1,
    cr: -50,
    cargo: { ferrite: 4.9, unobtanium: 99, core: -2 },
    ships: ["enterprise", "wasp", "wasp"],
    ship: "enterprise",
    mission: { type: "bogus" },
    hp: { wasp: 5 },
  });
  assert.equal(p.cr, 0);
  assert.deepEqual(p.ships, ["wasp"]);
  assert.equal(p.ship, "wasp");
  assert.deepEqual(p.holds.wasp, { ferrite: 4 });
  assert.equal(p.hp.wasp, 1);
  assert.equal(p.mission, null);

  const w = sanitizeWorld({
    v: 1,
    base: { store: 99, hangar: 0, refinery: 9, bogus: 5 },
    store: { cobalt: 2.8, unobtanium: 50, salv: -1 },
    board: [{ type: "bogus" }, { type: "hunt", tier: 2, n: 3, p: 1, r: 900 }],
    sector: "nowhere",
  });
  assert.deepEqual(w.base, { store: 5, hangar: 1, refinery: 4 });
  assert.deepEqual(w.store, { cobalt: 2 });
  assert.deepEqual(w.board, [{ type: "hunt", tier: 2, n: 3, p: 1, r: 900 }]);
  assert.equal(w.sector, "reach");
});

test("sanitizeProfile, sanitizeWorld and sanitizeSave reject non-saves", () => {
  assert.throws(() => sanitizeProfile(null), /not a Tallow Reach save/);
  assert.throws(() => sanitizeProfile({}), /not a Tallow Reach save/);
  assert.throws(() => sanitizeWorld(null), /not a Tallow Reach save/);
  assert.throws(() => sanitizeWorld([]), /not a Tallow Reach save/);
  assert.throws(() => sanitizeSave(null), /not a Tallow Reach save/);
  assert.throws(() => sanitizeSave({}), /not a Tallow Reach save/);
});

test("export codes round-trip a full profile + world save", () => {
  const s = newSave();
  s.profile.cr = 9876;
  s.profile.holds.wasp.voidite = 2;
  s.profile.mission = { type: "hunt", n: 4, tier: 2, r: 1000, p: 1 };
  s.world.base.refinery = 3;
  s.world.store.cobalt = 11;
  s.world.board = [{ type: "salvage", tier: 1, n: 3, p: 0, r: 520 }];

  const code = encodeSave(s);
  assert.match(code, /^TR1:/);
  assert.deepEqual(decodeSave(code), s);
});

test("decodeSave rejects damaged codes", () => {
  assert.throws(() => decodeSave("nope"));
  assert.throws(() => decodeSave("TR1:not-base64!!!"));
});
