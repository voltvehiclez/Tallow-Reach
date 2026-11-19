# Lessons archive: L1–L6

Moved out of [docs/LESSONS.md](../LESSONS.md) verbatim to keep it under its size limit.
Read them only when a task touches mission spawn counts, a full hold, dialogue departure, item integrity, or dialogue buttons.

### L1. Starting a mission again spawned more ships each time
- **Seen:** accepting and abandoning a mission repeatedly made more and more NPCs appear.
- **Cause:** nothing stopped the same story mission being active twice (only the Mission log hid it), so its
  script ran twice; and abandoning did not always remove the ships, shots and crates the mission had made.
- **Rule:** a story mission can be active only once. Everything a mission spawns carries the mission's identity
  and is removed when it is abandoned, failed or paid. Starting it again starts clean from step 0.
- **Enforced by:** `tests/mission-invariants.test.mjs` ("cannot be active twice", "accepting and abandoning it
  over and over never multiplies its ships"); the guard in `acceptMission` (`sim/missions.js`).

### L2. A full hold made the mission skip, fail or abandon
- **Seen:** when the hold had no room for the mission item, the mission abandoned itself or moved on without the
  next dialogue.
- **Cause:** a resource shortfall (cargo space) was treated as a failure or as "done".
- **Rule:** a shortage makes a step **wait**, and the objective says what to do. A step that hands over an item
  advances only when the whole amount really fits. A mission item dropped in space stays there until collected.
- **Enforced by:** the full-hold invariant (every mission, every step); `tests/step13b-missions.test.mjs`
  (blocked beacon hand-off); `blockedScriptText` and the "Dock at a station and make room" hint.

### L3. Warping or undocking during a dialogue failed the mission
- **Seen:** leaving mid-conversation (warp, undock) marked the mission failed, or killed the dialogue.
- **Cause:** "the player left the place" was interpreted as abandonment.
- **Rule:** leaving **pauses**; it never fails a mission. Failure comes only from a declared, explained cause
  (`fails.on`, with `fails.message`). A conversation that needs the pilot docked simply waits and the objective
  says to return.
- **Enforced by:** the wandering invariant (the pilot is moved to a different place before every action); the
  linter (`fails.message`, allowed failure reasons); `step13b` warp-before-Close test.

### L4. A finished mission failed or vanished afterwards
- **Seen:** after completing the objective, a later sector change or death removed the mission before the reward
  could be claimed, and it re-appeared as a fresh "Start".
- **Cause:** failure rules were checked even after completion.
- **Rule:** a completed mission can no longer fail; it stays claimable until paid.
- **Enforced by:** `tests/step13b-missions.test.mjs` (return-home flow). *Partial: the invariants do not yet kill
  the pilot after completion, so add that case if this area changes.*

### L5. A dialogue button made things spawn, or ships appeared in the pilot's face
- **Seen:** pressing Continue triggered a spawn the briefing had not led up to; NPCs appeared on top of the pilot.
- **Cause:** world events were chained to dialogue progress; spawns were placed relative to nothing safe.
- **Rule:** dialogue and the world are separate (Continue only moves the conversation). Spawns happen because of
  what the pilot does in the world, from a declared distance of at least `MISSION_RULES.minSpawnDistance`, while
  flying.
- **Enforced by:** invariant (the world is snapshotted around every dialogue click and must be unchanged);
  invariant (measured spawn distance); linter (every spawn needs `spawnDist`, `requiresFlying`).

### L6. A mission item appeared in the hold by itself
- **Seen:** with a full hold the item dropped; after unloading cargo at the station the item suddenly appeared in
  the inventory instead of having to be retrieved.
- **Cause:** the game held the item aside and delivered it automatically once space freed up.
- **Rule (the realism rule):** nothing enters or leaves the hold or wallet except by a real pickup, purchase,
  loading at the dock or hand-over the player performs. Never as a side effect of space or a timer.
- **Enforced by:** the item-integrity invariant (a storm of docking, undocking, ticks and inventory events must
  not change mission items except through recorded pickups and hand-overs).

### L7. One mission's trigger advanced another mission
- **Seen:** two active missions interfered (a wave-clear for one moved the other).
- **Cause:** mission-tagged events were not scoped to the mission that owned them.
- **Rule:** every mission-tagged trigger carries its mission id and only that mission reacts.
- **Enforced by:** "two missions at once" invariants; `step13b` trigger-isolation test.

### L8. Authored mission fields were silently lost on save and load
- **Seen / risk:** a field added to a mission step worked in play but vanished after a save and load, because the
  save sanitizer (`cleanMissionStep` in `state/profile.js`) keeps only a list of known fields.
- **Rule:** any new step field must be added to that list. A save and load must keep every authored field.
- **Enforced by:** the save-and-load-at-every-step invariant, which compares every authored field of every step
  after a round trip through `sanitizeSave`.
