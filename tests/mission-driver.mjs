// A scripted "player" for the mission tests. It plays any mission the way a
// careful person would, using only the real engine (events, the dialogue API,
// crates, the hold), so tests can then disturb it: wander off, reload, fill the
// hold, die. Not a test file itself; tests/mission-invariants.test.mjs uses it.
//
// The driver never edits a mission's state. It only does things a pilot can do:
// dock, fly somewhere, click Continue, mine, shoot, pick up a crate, hand in.

import assert from "node:assert/strict";
import { SAVE_VERSION, newProfile, newSave, sanitizeSave } from "../src/state/profile.js";
import { state } from "../src/state/state.js";
import { emit, on } from "../src/util/events.js";
import { V } from "../src/util/math.js";
import { itemCat } from "../src/data/items.js";
import { MISSION_RULES } from "../src/data/missions/rules.js";
import {
  acceptMission, activeMissions, completeMission, isMissionComplete, isMissionFailed,
  missionDeliveryRequirement, missionDialogue, missionNextText, missionStep,
  chooseMission, nextMissionDialogue,
} from "../src/sim/missions.js";
import { STATION, addItem, capacityOf, countOf, loadOf } from "../src/sim/inventory.js";
import { hitHostile, updateCrates } from "../src/sim/combat.js";
import "../src/sim/ai.js";

// Everything the mission system tells the rest of the game, recorded.
export const ledger = { given: {}, taken: {}, picked: {}, failed: [], abandoned: [], spawnDistances: [] };
const bump = (table, item, n = 1) => { table[item] = (table[item] || 0) + n; };
on("mission-item-given", p => bump(ledger.given, p.item, p.count));
on("mission-item-taken", p => bump(ledger.taken, p.item, p.count));
on("pickup", p => { if (p.missionItem) bump(ledger.picked, p.item, 1); });
on("mission-failed", p => ledger.failed.push(p));
on("mission-abandoned", p => ledger.abandoned.push(p));
export function resetLedger() {
  ledger.given = {}; ledger.taken = {}; ledger.picked = {}; ledger.failed = []; ledger.abandoned = []; ledger.spawnDistances = [];
}

/** A fresh pilot docked at Meridian Station, in a fresh world. Call `restore()` when done. */
export function newPilot() {
  const prev = {
    worldState: state.worldState, place: state.place, places: state.places,
    players: state.players, profile: state.profile, localPlayerIndex: state.localPlayerIndex,
  };
  const profile = newProfile();
  state.worldState = newSave().world;
  state.profile = profile;
  state.place = "reach";
  state.places = new Map();
  const player = { profile, place: "reach", docked: true, dead: false, pos: V(0, 0, 0) };
  state.players = [player];
  state.localPlayerIndex = 0;
  resetLedger();
  const ctx = {
    profile, player, pick: null,
    restore() { Object.assign(state, prev); },
  };
  return ctx;
}

const entities = placeId => state.places.get(placeId)?.entities;
export const missionEntities = (missionId) => {
  const out = { enemies: [], crates: [] };
  for (const [id, place] of state.places) {
    for (const enemy of place.entities.enemies) if (enemy.encounter === `mission:${missionId}`) out.enemies.push({ id, enemy });
    for (const crate of place.entities.crates) if (crate.missionId === missionId) out.crates.push({ id, crate });
  }
  return out;
};

// ---- where the pilot is --------------------------------------------------------------

export function moveTo(ctx, place, { dock = false } = {}) {
  const { player, profile } = ctx;
  const from = player.place;
  if (from === place && player.docked === dock) return;
  player.place = place;
  state.place = place;
  player.docked = dock;
  player.pos = V(0, 0, 0);
  if (from !== place) emit("place-changed", { from, to: place, player, profile });
  emit("place-entered", { id: place, player, profile });
  if (dock) emit("docked", { player, profile });
  else emit("warp-end", { from, to: place, player, profile });
}

export const dock = ctx => moveTo(ctx, "reach", { dock: true });

// ---- the hold ------------------------------------------------------------------------

export function fillHold(ctx, filler = "salv") {
  while (addItem(ctx.profile.ship, filler, 1, ctx.profile, state.worldState) > 0) { /* fill */ }
}
export const holdIsFull = ctx => loadOf(ctx.profile.ship, ctx.profile) >= capacityOf(ctx.profile.ship, ctx.profile);
export function emptyFiller(ctx, filler = "salv") {
  delete ctx.profile.holds[ctx.profile.ship][filler];
  emit("mission-inventory-changed", { player: ctx.player, profile: ctx.profile });
}
export function missionItemTotal(ctx) {
  const totals = {};
  for (const where of [ctx.profile.ship, STATION]) {
    const stock = ctx.profile.holds?.[where] || (where === STATION ? state.worldState.base?.stock || {} : {});
    for (const id of Object.keys(stock)) if (itemCat(id) === "mission") totals[id] = (totals[id] || 0) + stock[id];
  }
  return totals;
}
const holdOnly = ctx => ({ ...(ctx.profile.holds?.[ctx.profile.ship] || {}) });

// ---- dying and reloading --------------------------------------------------------------

/** The ship is destroyed: the hold is lost, the pilot restarts docked at the station. */
export function die(ctx) {
  const { player, profile } = ctx;
  const lost = { ...(profile.holds[profile.ship] || {}) };   // what the ship carried at that moment
  profile.holds[profile.ship] = {};
  player.dead = true;
  emit("player-dead", { player, profile, lost });
  player.dead = false;
  player.place = "reach";
  state.place = "reach";
  player.docked = true;
  emit("docked", { player, profile });
}

/** Save, throw the running state away, load: only what the save file holds survives. */
export function reload(ctx) {
  const raw = JSON.parse(JSON.stringify({ v: SAVE_VERSION, profile: ctx.profile, world: state.worldState }));
  const loaded = sanitizeSave(raw);
  const before = activeMissions(ctx.profile).map(m => JSON.parse(JSON.stringify(m)));
  ctx.profile.missions.splice(0, ctx.profile.missions.length, ...loaded.profile.missions);
  ctx.profile.flags = loaded.profile.flags;
  // Nothing authored may be dropped by the save format.
  for (const old of before) {
    const now = ctx.profile.missions.find(m => m.id === old.id);
    assert.ok(now, `${old.id} survived the save`);
    assert.equal(now.step, old.step, `${old.id} stays on the same step after a reload`);
    // A missing counter and a counter at 0 mean the same thing (the save writes the zeros in).
    const nonZero = c => Object.fromEntries(Object.entries(c || {}).filter(([, n]) => n));
    assert.deepEqual(nonZero(now.counters), nonZero(old.counters), `${old.id} keeps its counters after a reload`);
    old.steps.forEach((step, i) => {
      for (const [key, value] of Object.entries(step)) {
        if (value === undefined || key === "count") continue;
        // The save writes a single `action` as a one-item list: same meaning, different shape.
        const wrap = v => (key === "action" ? [].concat(v) : v);
        assert.deepEqual(wrap(now.steps[i][key]), wrap(value), `${old.id} step ${step.id}: field "${key}" survives a save and load`);
      }
    });
  }
}

// ---- playing one step -----------------------------------------------------------------

function worldSignature(ctx) {
  return JSON.stringify({
    places: [...state.places].map(([id, p]) => [id, p.entities.enemies.length, p.entities.crates.length]),
    holds: ctx.profile.holds,
    missionState: state.worldState.missionState || null,
  });
}

/** Run a dialogue click and prove it changed nothing in the world. */
function dialogueClick(ctx, call) {
  const before = worldSignature(ctx);
  call();
  assert.equal(worldSignature(ctx), before, "pressing a dialogue button must never spawn, move, give or take anything");
}

export function act(ctx, mission) {
  const { player, profile } = ctx;
  const step = missionStep(mission);
  if (!step) return null;
  const fly = place => moveTo(ctx, place);
  switch (step.kind) {
    case "dialogue": {
      if (step.requiresDock) dock(ctx);
      const d = missionDialogue(mission);
      if (d.choices.length && d.waitingForChoice) {
        const choice = ctx.pick?.(mission, step) ?? d.choices[0].id;
        dialogueClick(ctx, () => chooseMission(mission.id, choice, profile, player));
      } else dialogueClick(ctx, () => nextMissionDialogue(mission.id, profile, player));
      return "dialogue";
    }
    case "reach":
    case "reach-sector":
      fly(step.place);
      return "reach";
    case "script":
      if (step.requiresDock) moveTo(ctx, step.place, { dock: true });
      else fly(step.place);
      emit("mission-tick", { dt: 0.1, player, profile });
      checkSpawnDistances(ctx, mission);
      return "script";
    case "wait": {
      if (step.trigger === "wave-clear") {
        const { enemies } = missionEntities(mission.id);
        if (!enemies.length) emit("mission-trigger", { trigger: "wave-clear", mission: mission.id, player, profile });
        for (const { id, enemy } of enemies) hitHostile(enemy, 999, enemy.pos, player, id);
      } else emit("mission-tick", { dt: step.seconds || 2, player, profile });
      return "wait";
    }
    case "survive":
      if (step.place) fly(step.place);
      emit("mission-tick", { dt: step.count || 2, player, profile });
      return "survive";
    case "mine": {
      fly("reach");
      if (!addItem(profile.ship, step.item, 1, profile, state.worldState)) return "blocked";
      emit("mined", { item: step.item, player });
      return "mine";
    }
    case "collect": {
      const crate = missionEntities(mission.id).crates[0];
      if (!crate) return null;
      fly(crate.id);
      player.pos.copy(crate.crate.pos);
      updateCrates(1, crate.id);
      return "collect";
    }
    case "parallel":
      for (const child of step.steps) {
        if (child.kind === "reach" || child.kind === "reach-sector") fly(child.place);
        if (child.kind === "survive") { fly(child.place || player.place); emit("mission-tick", { dt: child.count || 2, player, profile }); }
      }
      return "parallel";
    default:
      emit("mission-tick", { dt: 1, player, profile });
      return step.kind;
  }
}

function checkSpawnDistances(ctx, mission) {
  for (const { enemy } of missionEntities(mission.id).enemies) {
    const distance = enemy.pos.distanceTo(ctx.player.pos);
    ledger.spawnDistances.push(distance);
    assert.ok(distance >= MISSION_RULES.minSpawnDistance,
      `a mission ship appeared ${Math.round(distance)} units from the pilot (minimum ${MISSION_RULES.minSpawnDistance})`);
  }
}

const progressSignature = (ctx, id) => {
  const m = ctx.profile.missions.find(item => item.id === id);
  return m ? JSON.stringify([m.step, m.counters, m.completed || false]) : "gone";
};

/**
 * Play a mission to its end. Options: `before(ctx, mission)` runs before every
 * action (the disturbance); `stopAt(mission)` stops early; `unblock(ctx, mission)`
 * is what a sensible player does when nothing seems to happen (empty the hold).
 * Returns "complete", "failed" or "stopped". Throws if the player gets stuck.
 */
export function drive(ctx, id, { before, stopAt, unblock, maxLoops = 400 } = {}) {
  let idle = 0;
  let last = progressSignature(ctx, id);
  for (let loop = 0; loop < maxLoops; loop++) {
    const mission = ctx.profile.missions.find(item => item.id === id);
    if (!mission) return "failed";
    if (isMissionFailed(mission)) return "failed";
    if (isMissionComplete(mission)) return "complete";
    if (stopAt?.(mission)) return "stopped";
    before?.(ctx, mission, loop);
    const now = ctx.profile.missions.find(item => item.id === id);
    if (!now) return "failed";
    const text = missionNextText(now, ctx.profile);
    assert.ok(text && text !== "No current objective." && text !== "No mission selected.",
      `${id} step ${missionStep(now)?.id} tells the player what to do next`);
    act(ctx, now);
    const sig = progressSignature(ctx, id);
    if (sig === last) {
      idle += 1;
      if (idle >= 3) {
        if (unblock?.(ctx, now)) idle = 0;
        else throw new Error(`STUCK: ${id} cannot continue from step "${missionStep(now)?.id}" (${text})`);
      }
    } else idle = 0;
    last = sig;
  }
  throw new Error(`${id} did not finish in ${maxLoops} actions`);
}

/** What a sensible player does when blocked: make room in the hold. */
export function emptyHoldIfFull(ctx) {
  if (!holdIsFull(ctx)) return false;
  emptyFiller(ctx);
  return true;
}

/** Collect the reward at the station, getting any ordinary goods the hand-in still needs. */
export function handIn(ctx, id) {
  const mission = ctx.profile.missions.find(item => item.id === id);
  assert.ok(mission, `${id} is still claimable`);
  dock(ctx);
  const need = missionDeliveryRequirement(mission, ctx.profile);
  if (need && need.hold + need.station < need.count) {
    assert.notEqual(itemCat(need.item), "mission", `${id}: a lost mission item cannot be replaced, so the mission should have failed`);
    addItem(ctx.profile.ship, need.item, need.count - need.hold - need.station, ctx.profile, state.worldState);
  }
  const before = ctx.profile.cr;
  const result = completeMission(id, ctx.profile, ctx.player);
  assert.match(String(result), /^Paid \d+ cr\.$/, `${id} pays out at the station`);
  assert.ok(ctx.profile.cr > before || mission.rewards.credits === 0, "the credits arrive");
  assert.equal(ctx.profile.missions.some(item => item.id === id), false, `${id} is removed once paid`);
  return result;
}

export const accept = (ctx, definition) => acceptMission(JSON.parse(JSON.stringify(definition)), ctx.profile);
export { holdOnly, countOf };
