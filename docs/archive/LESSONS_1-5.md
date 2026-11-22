# Lessons archive: L1–L10

Moved out of [docs/LESSONS.md](../LESSONS.md) verbatim to keep it under its size limit.
Read them only when a task touches mission spawn counts, a full hold, dialogue departure, item integrity, or dialogue buttons.
(This file also carries **L23, imported models**, **L24, cube maps** and **L25, two skies** (the
one about a starfield installed twice — not the projectile L25), moved here word for word on
2026-11-21 to make room for L33, L34 and L35. L23 is the same rule as [GLB_MODELS.md](../GLB_MODELS.md); L24
is pinned by `tests/skybox.test.mjs` and described in [architecture/world-and-map.md](../architecture/world-and-map.md).)

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

### L9. A step kind that nothing could ever complete
- **Seen:** the `deliver` step kind existed, but nothing in the game emitted "delivered", so a mission using it
  could never finish.
- **Rule:** every step kind and trigger needs a real event source and a test before missions may use it. Until
  then the linter rejects it.
- **Enforced by:** the linter (`deliver` is an error); `tests/mission-lint.test.mjs`.

### L10. Death failed missions it should not have, or left a mission stuck without its item
- **Seen:** the owner wanted death to be punishment enough: a mission was failing on death for no good reason, and a mission
  whose parcel or beacon was lost with the ship had to fail clearly instead of waiting forever.
- **Rule:** dying does not fail a mission unless its data says so (`fails.on` has `player-dead`) or the ship was carrying a
  mission-only item (category `mission`) the mission needs, which is lost for good. Either way the failure carries a message
  and the HUD shows "Mission failed: <mission>" with the reason. Ordinary goods carry on. `player-dead` carries `lost`, the
  hold at that moment, so no listener depends on whether the cargo was already cleared.
- **Enforced by:** `tests/mission-death.test.mjs`; the die-at-every-step invariant in `tests/mission-invariants.test.mjs`.

### L23. Imported models need an explicit coordinate and size contract

An owner-supplied fighter faced +X and used small exporter units; loading successfully did not make it
a flight-ready model. Keep optional visual yaw and target length in hull data, rotate before measuring,
then scale and centre the bounds in a wrapper. Do not change gameplay `sc` to fix asset units. Test
forward direction, centred bounds, and size relative to the baseline hull before asking for a playtest.

### L24. A cube map has two independent ways to be wrong: the seams and the faces' own frames

Making six images agree at their edges and making each image land right way up are different problems, and passing the
seam check tells you nothing about the second. The generator builds every layer as a function of the **direction** a
pixel looks in (one sphere, sampled back per face), which makes the 24 edges agree by construction and even makes a
useless seam metric read low — so `cube_seam_error` measures edge pixels in direction space (`face_dirs`, then sample
the *neighbouring* face through a 24-entry `CUBE_NEIGHBOURS` table), and the three skies read 0.36–0.66 per 255.
Separately, the six files follow the OpenGL cube convention (`FACE_AXES`), which the generator's own preview cannot
verify, because the preview draws the net from the same rules that drew the pixels. `BoxGeometry` groups its faces in
the same order but frames **+Y and -Y the other way up**, so two faces would have arrived upside down and no file, no
preview and no seam number would have shown it. The fix is `src/render/cubemap.js` (`CUBE_FACES`, `CUBE_FACE_FLIP`,
`orientFace`), and the test reads `FACE_AXES` out of the Python, rebuilds `BoxGeometry`'s UV frames with three.js,
compares a 7×7 grid of texels per face, and asserts each flip **necessary** (unflipped is wrong) and none **redundant**
(flipping a correct face breaks it). A tautological test that only re-reads the constant would pass forever while the
sky hung upside down.

- **Rule:** for anything with a coordinate convention (cube faces, cubemaps, UVs, handedness), take the convention from
  the two files that own it — the producer's source and the consumer's source — and prove them against each other in a
  test. Do not infer it from a screenshot, a preview sheet, or a dimension that looks plausible.
- **Also:** a `CubeTexture` is not a drop-in for a `MeshBasicMaterial.map` in three r128; only `background`/`envMap`
  consult `isCubeTexture`. Six ordinary textures on the six material groups is the same picture with nothing to go wrong.
- **Enforced by:** `tests/skybox.test.mjs` — "the six faces are drawn the way the generator painted them" and "each flip
  in the table is necessary and no flip is redundant". It caught the real bug (worst mismatch 1.25 on `py`/`ny`, 0.0000
  on the other four).

### L25. Two skies for one picture: the same image installed twice, and a starfield that was already in the paint

- **Seen (owner, 2026-11-15):** "remove the existing starfield. This is because our previously generated skybox already
  has some stars baked in it. I might re-add star fields in the future but not now."
- **Cause:** the sky was one thing and the stars another, because until now no sky *was* a picture — the starfield was
  the only thing drawing stars. The moment normal space started wearing a generated skybox, two systems were drawing the
  same stars, and the fix was not to darken one of them: it was to stop drawing a second set. The same shape of mistake
  sat in the assets: the sky the owner kept had been installed under a working name and again under its real one, so the
  build inlined the same 140 KB picture twice.
- **Rule:** a picture that carries a thing must not be drawn under a second copy of that thing — ask *who draws this*
  before adding a layer. A sky's own look is data on the sky (`starfield`, `shards`), and one switch (`STARFIELD.enabled`)
  can turn a whole layer off without deleting the geometry, so the owner can ask for it back in one line. And an installed
  sky is a resource with a name: re-making it under the final name and `remove`-ing the old one is part of installing it
  (the tool has `remove` for exactly this, because `src/assets/skyboxes/` is the tool's folder and not a place to delete
  from by hand).
- **Enforced by:** `tests/skybox.test.mjs` — "normal space wears a generated sky, and the drawn starfield is off" reads
  `showPlace`'s own starfield expression (writer and reader cannot drift apart, as in L19) and pins the master switch;
  "nothing is in the skybox folder or the url map without being in data/skyboxes.js" plus the per-id budget check make a
  second copy of a picture a visible 140 KB, and the report's file size is quoted in the CHANGELOG entry.
