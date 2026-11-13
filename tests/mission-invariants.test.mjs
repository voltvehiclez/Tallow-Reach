// Invariant tests: written once, run on EVERY authored mission (Border Signal and
// all the framework test missions), under the awkward situations real players
// create. A new mission is covered the moment it is added to the data folder.
//
// The invariants (docs/MISSION_RULES.md):
//   * never stuck: from any situation there is always something the player can do
//   * never silently failed, abandoned or skipped
//   * nothing enters or leaves the hold except by a real pickup, hand-over or hand-in
//   * pressing a dialogue button never changes the world
//   * mission ships never appear closer than the safe distance
//   * a save and load keeps every authored field
//   * death fails a mission only if its data says so or a mission-only item was aboard, then clearly
//     (with a message, cleaned up); otherwise the mission carries on and can be finished
//   * replaying starts clean; two missions at once do not interfere
import { test } from "node:test";
import assert from "node:assert/strict";
import { STORY_MISSIONS, TEST_MISSIONS } from "../src/data/missions/index.js";
import { MISSION_RULES } from "../src/data/missions/rules.js";
import { activeMissions, isMissionFailed, missionOnlyItems } from "../src/sim/missions.js";
import { emit } from "../src/util/events.js";
import {
  accept, die, drive, dock, emptyHoldIfFull, fillHold, handIn, holdIsFull, ledger, missionEntities,
  missionItemTotal, moveTo, newPilot, reload, resetLedger,
} from "./mission-driver.mjs";

const ALL = [...STORY_MISSIONS, ...TEST_MISSIONS];
const withPilot = fn => {
  const ctx = newPilot();
  try { return fn(ctx); } finally { ctx.restore(); }
};
const hasDeathRule = def => def.fails?.on?.includes("player-dead") && def.fails.action === "abandon";

for (const def of ALL) {
  test(`${def.id}: plays through to the reward when nothing goes wrong`, () => withPilot(ctx => {
    accept(ctx, def);
    assert.equal(drive(ctx, def.id), "complete");
    handIn(ctx, def.id);
    assert.deepEqual(ledger.failed, [], "nothing failed");
    assert.deepEqual(ledger.abandoned, [], "nothing was abandoned");
    assert.deepEqual(missionEntities(def.id), { enemies: [], crates: [] }, "nothing of the mission is left in the world");
    assert.equal(activeMissions(ctx.profile).length, 0);
    for (const distance of ledger.spawnDistances) assert.ok(distance >= MISSION_RULES.minSpawnDistance);
  }));

  test(`${def.id}: still finishes when the pilot keeps wandering off`, () => withPilot(ctx => {
    accept(ctx, def);
    // Docked, flying at the station, flying in the other pocket: every loop somewhere else.
    const spots = [["reach", true], ["hollow", false], ["reach", false], ["hollow", false], ["reach", true]];
    const wander = (c, mission, loop) => { const [place, docked] = spots[loop % spots.length]; moveTo(c, place, { dock: docked }); };
    assert.equal(drive(ctx, def.id, { before: wander, unblock: emptyHoldIfFull }), "complete");
    handIn(ctx, def.id);
    assert.deepEqual(ledger.failed, []);
    assert.deepEqual(ledger.abandoned, []);
  }));

  test(`${def.id}: save and load at every step loses nothing`, () => withPilot(ctx => {
    accept(ctx, def);
    let lastStep = null;
    const reloadOnNewStep = (c, mission) => {
      const key = `${mission.step}:${JSON.stringify(mission.counters)}`;
      if (key !== lastStep) { lastStep = key; reload(c); }
    };
    assert.equal(drive(ctx, def.id, { before: reloadOnNewStep }), "complete");
    reload(ctx);
    handIn(ctx, def.id);
  }));

  test(`${def.id}: a full hold never fails, skips or abandons it`, () => withPilot(ctx => {
    accept(ctx, def);
    const filledAt = new Set();
    const fillOncePerStep = (c, mission) => {
      if (!filledAt.has(mission.step)) { filledAt.add(mission.step); fillHold(c); }
    };
    assert.equal(drive(ctx, def.id, { before: fillOncePerStep, unblock: emptyHoldIfFull }), "complete");
    assert.deepEqual(ledger.failed, [], "a full hold is never a failure");
    assert.deepEqual(ledger.abandoned, []);
    handIn(ctx, def.id);
  }));

  test(`${def.id}: items only move through real pickups, hand-overs and the hand-in`, () => withPilot(ctx => {
    accept(ctx, def);
    const storm = (c, mission) => {
      const before = missionItemTotal(c);
      const given = { ...ledger.given }, taken = { ...ledger.taken }, picked = { ...ledger.picked };
      // Everything a pilot can do that is not a pickup: dock, undock, jump, wait, unload.
      moveTo(c, "reach", { dock: true });
      emit("mission-inventory-changed", { player: c.player, profile: c.profile });
      moveTo(c, "reach");
      moveTo(c, "hollow");
      emit("mission-tick", { dt: 1, player: c.player, profile: c.profile });
      emit("mission-inventory-changed", { player: c.player, profile: c.profile });
      moveTo(c, "reach", { dock: true });
      const after = missionItemTotal(c);
      const items = new Set([...Object.keys(before), ...Object.keys(after), ...Object.keys(ledger.given), ...Object.keys(ledger.taken)]);
      for (const item of items) {
        const legit = (ledger.given[item] || 0) - (given[item] || 0)
          - ((ledger.taken[item] || 0) - (taken[item] || 0))
          + ((ledger.picked[item] || 0) - (picked[item] || 0));
        assert.equal((after[item] || 0) - (before[item] || 0), legit,
          `${item} changed in the hold by something other than a pickup or a mission hand-over (step ${mission.steps[mission.step]?.id})`);
      }
    };
    assert.equal(drive(ctx, def.id, { before: storm, unblock: emptyHoldIfFull }), "complete");
    handIn(ctx, def.id);
  }));

  test(`${def.id}: if the ship is destroyed at any step it fails clearly or can still be finished`, () => {
    const steps = def.steps.length;
    for (let k = 1; k < steps; k++) {
      withPilot(ctx => {
        accept(ctx, def);
        const outcome = drive(ctx, def.id, { stopAt: m => m.step >= k, unblock: emptyHoldIfFull });
        if (outcome !== "stopped") return;   // the mission already ended before step k
        // What the ship carries when it is destroyed decides the outcome, so look first.
        const hold = ctx.profile.holds[ctx.profile.ship] || {};
        const carriedMissionItem = missionOnlyItems(activeMissions(ctx.profile)[0]).find(id => (hold[id] || 0) > 0);
        die(ctx);
        if (hasDeathRule(def) || carriedMissionItem) {
          assert.equal(ledger.failed.length, 1, `${def.id} fails when destroyed at step ${k} (${hasDeathRule(def) ? "declared" : "carrying " + carriedMissionItem})`);
          assert.ok(ledger.failed[0].message, "and tells the player why");
          if (hasDeathRule(def)) assert.equal(ledger.failed[0].message, def.fails.message);
          else assert.match(ledger.failed[0].message, /destroyed/, "naming the destroyed ship");
          assert.equal(ledger.failed[0].title, def.title, "the notice can name the mission");
          assert.equal(activeMissions(ctx.profile).length, 0, "the failed mission is gone");
          assert.deepEqual(missionEntities(def.id), { enemies: [], crates: [] }, "its ships and crates are gone");
          // Replaying starts from a clean first step.
          resetLedger();
          const again = accept(ctx, def);
          assert.equal(again.step, 0, "a replay starts at the beginning");
          assert.deepEqual(Object.values(again.counters).filter(Boolean), [], "with no leftover progress");
          assert.equal(drive(ctx, def.id, { unblock: emptyHoldIfFull }), "complete", "and can be finished");
          handIn(ctx, def.id);
          assert.deepEqual(ledger.failed, [], "the replay does not fail");
        } else {
          assert.deepEqual(ledger.failed, [], "death did not fail a mission with no death rule and no mission item aboard");
          assert.equal(drive(ctx, def.id, { unblock: emptyHoldIfFull }), "complete", "and it can still be finished without the lost hold");
          handIn(ctx, def.id);
        }
      });
    }
  });
}

test("two missions at once do not interfere with each other", () => withPilot(ctx => {
  const defs = [TEST_MISSIONS.find(d => d.id === "test.parcel-run"), STORY_MISSIONS[0], TEST_MISSIONS.find(d => d.id === "test.ore-run"), TEST_MISSIONS.find(d => d.id === "test.radio-relay")];
  for (const def of defs) accept(ctx, def);
  assert.equal(activeMissions(ctx.profile).length, defs.length);
  // Take every mission half way, then finish them in a different order.
  for (const def of defs) drive(ctx, def.id, { stopAt: m => m.step >= 2, unblock: emptyHoldIfFull });
  for (const def of [...defs].reverse()) assert.equal(drive(ctx, def.id, { unblock: emptyHoldIfFull }), "complete", `${def.id} finishes`);
  for (const def of defs) handIn(ctx, def.id);
  assert.deepEqual(ledger.failed, [], "no mission failed another");
  assert.equal(activeMissions(ctx.profile).length, 0);
  assert.equal(Object.values(missionItemTotal(ctx)).reduce((a, b) => a + b, 0), 0, "no mission item is left over");
}));

test("two missions that spawn at once keep their ships and crates separate", () => withPilot(ctx => {
  const border = STORY_MISSIONS[0];
  const ambush = TEST_MISSIONS.find(d => d.id === "test.ambush-run");
  accept(ctx, border);
  accept(ctx, ambush);
  // Both are waiting on a wave in Kestrel Hollow.
  drive(ctx, border.id, { stopAt: m => m.steps[m.step].id === "wait" });
  drive(ctx, ambush.id, { stopAt: m => m.steps[m.step].id === "raiders-clear" });
  assert.equal(missionEntities(border.id).enemies.length, 2);
  assert.equal(missionEntities(ambush.id).enemies.length, 2);
  // The ambush mission asks to fail on death, so only its own ships go. Border Signal has no death
  // rule (and no beacon is aboard), so it carries on with its ships untouched.
  die(ctx);
  assert.equal(missionEntities(ambush.id).enemies.length, 0, "the failed mission removes its own ships");
  assert.equal(missionEntities(border.id).enemies.length, 2, "the other mission is left alone");
  assert.equal(ledger.failed.length, 1);
  assert.equal(activeMissions(ctx.profile).length, 1);
}));

test("a mission that is waiting on something always says what", () => withPilot(ctx => {
  // The parcel is blocked by a full hold at the dock: the objective must say what to do.
  const def = TEST_MISSIONS.find(d => d.id === "test.parcel-run");
  const mission = accept(ctx, def);
  fillHold(ctx);
  assert.ok(holdIsFull(ctx));
  drive(ctx, def.id, { stopAt: m => m.steps[m.step].id === "load", unblock: () => false });
  dock(ctx);
  emit("mission-tick", { dt: 1, player: ctx.player, profile: ctx.profile });
  assert.equal(mission.steps[mission.step].id, "load", "a full hold keeps the cargo step waiting");
  assert.equal(isMissionFailed(mission), false);
  const { missionNextText } = require_missions();
  assert.match(missionNextText(mission, ctx.profile), /room in your hold/i);
  moveTo(ctx, "reach");
  assert.match(missionNextText(mission, ctx.profile), /^Dock at a station and make room in your hold/i,
    "in flight it also says to dock");
}));

function require_missions() {
  return { missionNextText: (mission, profile) => nextText(mission, profile) };
}
import { missionNextText as nextText } from "../src/sim/missions.js";

// ---- accepting and abandoning over and over (a real bug: ships multiplied each time) ----------

import { abandonMission } from "../src/sim/missions.js";

const enemiesInWorld = () => {
  let n = 0;
  for (const def of ALL) n += missionEntities(def.id).enemies.length;
  return n;
};

test("a story mission cannot be active twice", () => withPilot(ctx => {
  for (const def of ALL) {
    const first = accept(ctx, def);
    assert.ok(first, `${def.id} starts`);
    assert.equal(accept(ctx, def), undefined, `${def.id} cannot be started a second time while active`);
    assert.equal(activeMissions(ctx.profile).filter(m => m.id === def.id).length, 1);
    abandonMission(def.id, ctx.profile);
  }
  assert.equal(activeMissions(ctx.profile).length, 0);
}));

for (const def of ALL.filter(d => d.steps.some(s => s.action?.kind === "spawn-wave" || s.action?.[0]?.kind === "spawn-wave"))) {
  test(`${def.id}: accepting and abandoning it over and over never multiplies its ships or crates`, () => withPilot(ctx => {
    const waveStep = def.steps.findIndex(s => /spawn|raiders|wait/.test(s.id) && s.kind === "wait");
    for (let round = 0; round < 6; round++) {
      const mission = accept(ctx, def);
      assert.ok(mission, `round ${round}: it can be started again once abandoned`);
      assert.equal(mission.step, 0, `round ${round}: starts from the beginning`);
      drive(ctx, def.id, { stopAt: m => m.step >= waveStep });
      const { enemies } = missionEntities(def.id);
      assert.equal(enemies.length, 2, `round ${round}: exactly its own two ships, never more`);
      abandonMission(def.id, ctx.profile);
      assert.deepEqual(missionEntities(def.id), { enemies: [], crates: [] }, `round ${round}: abandoning leaves nothing behind`);
    }
    assert.equal(enemiesInWorld(), 0);
  }));
}
