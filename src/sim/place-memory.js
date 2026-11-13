// Persistent memory for a pocket's depleted resources and cleared encounters.
// Timers are remaining simulation seconds, not wall-clock timestamps: pausing the
// game pauses the timer, and a save can carry the remaining time to another load.
//
// The world owns the plain object (`world.placeMemory`); this module owns the
// small rules around it. A future story/event can emit `respawn-place` with a
// place id, kind and encounter/rock id to clear a timer immediately.

import { state } from "../state/state.js";
import { emit, on } from "../util/events.js";

const BUCKETS = ["rocks", "encounters"];

function memoryRoot() {
  if (!state.worldState.placeMemory || typeof state.worldState.placeMemory !== "object") {
    state.worldState.placeMemory = {};
  }
  return state.worldState.placeMemory;
}

function recordFor(placeId, create = true) {
  const root = memoryRoot();
  if (!root[placeId] && create) root[placeId] = { rocks: {}, encounters: {} };
  const record = root[placeId];
  if (!record) return null;
  for (const bucket of BUCKETS) {
    if (!record[bucket] || typeof record[bucket] !== "object") record[bucket] = {};
  }
  return record;
}

function cleanRecord(placeId) {
  const root = memoryRoot();
  const record = root[placeId];
  if (!record) return;
  if (!Object.keys(record.rocks).length && !Object.keys(record.encounters).length) delete root[placeId];
}

/** Remaining cooldown, or zero when this thing is ready. */
export function memoryTimer(placeId, kind, id) {
  const bucket = kind === "rock" ? "rocks" : "encounters";
  return Math.max(0, Number(recordFor(placeId, false)?.[bucket]?.[id]) || 0);
}

/** Whether an encounter/resource is still cooling down. */
export const memoryCooling = (placeId, kind, id) => memoryTimer(placeId, kind, id) > 0;

function mark(placeId, bucket, id, seconds) {
  const delay = Math.max(0, Number(seconds) || 0);
  if (!id || !(delay > 0)) return;
  recordFor(placeId)[bucket][id] = delay;
}

export const markRockMined = (placeId, id, seconds) => mark(placeId, "rocks", id, seconds);
export const markEncounterCleared = (placeId, id, seconds) => mark(placeId, "encounters", id, seconds);

/** Remove one cooldown and announce that the place may rebuild it. */
export function respawnMemory(placeId, kind, id) {
  const bucket = kind === "rock" ? "rocks" : "encounters";
  const record = recordFor(placeId, false);
  if (record) delete record[bucket][id];
  cleanRecord(placeId);
  emit("place-memory-ready", { placeId, kind, id, forced: true });
}

/** Decrement every timer by simulation time and announce expiries. */
export function updatePlaceMemory(dt) {
  if (!(dt > 0)) return;
  const root = memoryRoot();
  for (const [placeId, record] of Object.entries(root)) {
    for (const [kind, bucket] of [["rock", record.rocks], ["encounter", record.encounters]]) {
      if (!bucket || typeof bucket !== "object") continue;
      for (const [id, value] of Object.entries(bucket)) {
        const left = Number(value) - dt;
        if (left > 0) bucket[id] = left;
        else {
          delete bucket[id];
          emit("place-memory-ready", { placeId, kind, id, forced: false });
        }
      }
    }
    cleanRecord(placeId);
  }
}

// Story and event code can trigger a respawn without importing the memory module.
on("respawn-place", ({ placeId, kind, id } = {}) => {
  if (placeId && kind && id) respawnMemory(placeId, kind, id);
});
