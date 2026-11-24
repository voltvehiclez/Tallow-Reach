# Reticle picking and recovery availability

## Reticle hits and recovery availability (2026-11-16)

- F chose a large background rock over a small foreground rock: angular-size scoring is not
  visible surface picking, and a ship-forward ray is not the rendered camera ray. Pick nearest
  visible mesh depth from the camera first for every lockable kind; only then use angular assistance.
  Render picking follows child transforms and visibility, ignores faint effects, and sends only
  a validated target reference to simulation. Headless callers retain collision-soup/proxy fallback.
  Regression: `tests/reticle-hit.test.mjs` overlaps unequal rocks and checks an irregular-mesh miss.
- A rich pilot could lose the only ship and receive no loaner. Credits do not constitute a usable
  hull. Recovery reuses surviving ownership, otherwise grants a complete stock Wasp at the chosen
  home. Test both no-hull and surviving-hull paths at generated stations in `home-station.test.mjs`.

`tests/target-picking.test.mjs` covers every kind, station holes, moving children and faint auras.

## Boost input is not successful ignition

A Shift press set full throttle before spool-up/MJ debit, allowing free throttle jumps.
Move the snap into the successful ignition transaction, after payment. Tests in
`boost-ignition.test.mjs` cover taps, spool-up, dry power/fuel and held-key throttle control.

## Signed controls are not resource pools

The generic 0–100% resource clamp hid reverse throttle. Use a separate signed
presentation helper: preserve the sign in text, use absolute magnitude for width,
and choose the fill origin/pattern from direction. Regression covers -100%, -50%,
zero, +50%, +100%, clamping and invalid values in flight-ui-slice1.test.mjs.

## Displacement is not engine velocity

Moving colliders can push position without adding velocity. Speed instruments must measure a single flight-step displacement after collision resolution. Do not measure between render frames across warp/load/teleport boundaries. tests/flight-slice2.test.mjs covers zero-velocity scenery pushes and travel discontinuities.

## Exercise the action boundary and share render time

N failed with emit undefined because a new main action used an unimported bus helper. Enumeration tests did not exercise the handler. flight-slice2 now executes the real handler body with main’s imported event bindings, including playing/repeat guards. Close-range lead jitter came from projecting fixed-step poses against an interpolated camera; interpolate muzzle pose, target position and velocities at the same render alpha instead of smoothing screen coordinates after projection. render-interp tests verify continuous interpolation and teleport reset.

### Sky points need circular masks; primitive joins need geometric bounds

WebGL PointsMaterial renders square pixels by default. For celestial/pocket dots,
mask gl_PointCoord outside a circle; test both belt and ordinary-marker materials.
For stacked primitives, compare bottom/top bounds (centre ± half height), not just
centres: the commerce cap must start at the core top. Regression tests live in
`tests/visual-refinement.test.mjs`; visual owner preview still required.

### Shared targets need independent flight paths

Give pilots seeded phases/timers and predictive separation; collision bounce alone
cannot fix synchronized paths. Exact overlaps need tie-break directions. Test
trajectories and delayed reactions (`tests/enemy-flight.test.mjs`). Unchanged
weapon stats do not prove unchanged difficulty: owner playtest is required.

### L17. A recorded-state fixture only proves what changed if you diff it
- **Seen:** fixing the spare Wasp changed the recorded 8b lifecycle fixture, which failed as a long unreadable deep-equal.
- **Rule:** when behaviour changes on purpose, re-record the fixture and diff old against new. Accept it only if every difference
  sits inside the behaviour you meant to change — here snapshots from the death onwards changed and every earlier one was
  identical, which is the evidence the fix did nothing else. Say so in a comment beside the fixture's test. A blanket re-record
  that "makes the test pass" would hide real regressions.
- **Enforced by:** the comment above the fixture assertion in `tests/single-player-combat-8b.test.mjs`.

### L20. A frame that throws stops the picture but not the loop, so a one-line bug plays as a dead game
- **Seen (owner, step 14 playtest):** "the game crashes … a few seconds after you've destroyed the last guardian" —
  a frozen screen, no message, and the only word about it a line in the browser console nobody was looking at.
- **Cause:** `main.js` asks for the next frame *before* it does the frame's work, so an exception inside a frame leaves
  the loop alive and the last good image on the glass: the game is running and looks dead. The pasted error was from a
  stale build, but the shape of the failure is the lesson — anything that can throw in front of the player takes the
  whole game down with it, silently.
- **Rule:** work that can throw in front of the player is caught where it happens, **said on screen in a sentence with
  the error's own first line** (`ui/crash.js`, `reportCrash`), and the picture is drawn anyway. A repeat is counted, not
  listed (a per-frame error would bury the sentence in a second); the card lists a few distinct problems and says how
  many it left out. The net listens only to what the browser reports as uncaught plus the frame loop's own catch — no
  `sim/` module may call it and no game rule may depend on it, and a test that expects an error still gets it thrown.
- **Enforced by:** `tests/crash.test.mjs` — the card's sentence and where it came from, repeat counting, the four-line
  cap with its "and N more" line, dismissal, and that a broken `document` cannot itself become the crash — plus the
  `frame`/`drawFrame` split in `main.js`.

### L21. When a new ask makes old code look like a special case, the shape underneath is usually the cause

The canister's prize began as a list of `{ i, c }` stacks because that was the shape a save could carry, and the same
shape is why the ordinary inventory rules could not reach it: `sim/inventory.js` speaks stock maps, so `openCache` had
to hand-carry cargo unit by unit, and every question about the canister — what is in it, is there room, move three of
these — needed a loop of its own. When the owner asked for a trade (two inventories side by side, clicks moving cargo
between them), the fix was not a panel bolted onto the old shape: it was making the canister an ordinary stock map
first, after which the panel was two columns of the grid that already existed and every move was the existing
`moveItem`. The save kept the list shape by converting at the two edges (`captureInstances`, `restoreInstance`), so no
save version moved. Before building UI for a container, ask what shape the container is: if the inventory layer cannot
address it, the panel will end up re-implementing the inventory layer.

### L22. When the owner says "remove the lines", remove the ability to draw lines

The first painted sky carried fractures and filaments because a nebula with nothing but blobs in it looked empty, and
they were painted the only way a canvas draws a thin bright thing: `beginPath`, `lineTo`, `stroke`, three times over
for the seam. The owner's verdict on the second round was that the sky was good *except* those lines — and the
temptation was to repaint them fainter, blurrier, fewer. Fainter lines are still lines: the eye reads a stroke as a
mark somebody made, which is exactly what "not realistic" means. The fix was structural instead — the painter lost its
`stroke` helper altogether, so a line in the sky is now impossible rather than discouraged, and the structure the lines
had been standing in for came back as shapes a real nebula actually has (bright cores where the gas is thick) plus one
pass of invisible dither grain, because a smooth dark gradient bands into contour lines of its own on an 8-bit screen
and those would have been "odd lines" by next round. The test that protects it asserts the recording canvas saw zero
strokes and no path ever started: when a complaint is about a kind of artifact, pin the absence of the capability, not
the absence of this week's instance of it.

### L25. A projectile's hit test must read the colliders the world already has, and sweep, not sample

Shots went through Meridian Station for months because `updateBullets` asked two questions and neither was "is
there scenery here": it checked hostiles (a sphere) and rocks (a distance-to-centre circle). The colliders existed
and the player's own ship already collided with them; the projectile path simply never asked. Whenever something new
must be hit, blocked or stopped, look for the hit test the game **already trusts** and reuse it — here
`sim/colliders.js`, which `render/` bakes and `player.js` and `ai.js` already read — rather than writing a second,
cheaper approximation beside it. A second approximation drifts: the old rock test used a bounding circle, so shots
also died in empty space beside a lumpy rock.

The other half is **sweeping**. A basic cannon bolt covers 15 m in one 60 Hz tick and a missile 8 m, so an end-point
test tunnels through anything thinner than that: a station spoke, a small rock, the edge of a hull. Test the segment
between the last tick's position and this one (`segmentColliderHit`), take the nearest hit's fraction `t`, and put the
projectile at the impact point so the explosion happens where it hit and not past it. The same sweep answers "would
this wall block the beam" for free.

Two consequences worth keeping:
- **`noclip` and `collide: false` must stay pass-through for projectiles as well as ships.** They are the owner's
  opt-out; a weapon that hits decoration makes the opt-out meaningless. Assert it, do not assume it.
- **Check what the new stop rule does to balance before shipping it.** Rocks now stop enemy fire, so a pilot can take
  cover — a real gameplay change. Measure it (here: 1 of 24 long lines from the station meets a rock in the Meridian
  belt) and say so, rather than discovering it in a playtest.

- **Enforced by:** `tests/projectile-collision.test.mjs` — the Meridian Station's real geometry stops a bolt on its hub
  and its ring, a thin wall between two ticks is caught, the nearest collider wins, a hostile's hull still resolves
  first, `noclip` scenery does not stop shots, a rock stops a hostile shot aimed at the pilot, and a missile and the
  mining beam obey the same rule.

### L26. A collider is a snapshot: if the part moves, transform the query, never re-bake the bake

A baked collider is a photograph — right for a still part, wrong at once for a turning one: Meridian's 180 m arms are
**144 m** from a still hitbox in a minute. Baking several angles is wrong too: fat between samples, N× the triangles. Both conflate *geometry* with *where it is*. Keep them apart: bake the soup **once, in its own space**, store
the live transform beside it (`mover = { pos, quat, scale }`, refreshed per frame), and carry the **query** in — segment
for weapons, sphere for hulls. Asteroid soups already worked this way (`segmentRockHit`). Rotate the
normal back to world space before moving a hull.

**Follow the owner's default:** match the model for anything noticeable; only tiny decoration earns `noclip`, and a
*workaround* tag is a smell. The arms also exposed a latent bug: `closestPointTriangle`'s face-interior branch was
guarded by a triple product that is **identically zero**, so interior queries fell back to *vertex A* — wrong normal
and depth, for every hull. Thin flat geometry probes it.

- **Enforced by:** `tests/moving-colliders.test.mjs` — on the arms at 24 spin phases, clear between them, arms named
  `spin`.

### L27. A default is a rule you did not write down: a silent `0` made every station harmless

Hitting Meridian Station did nothing for three sessions. The rock path carries `damage: 1` hardcoded, so rocks hurt;
the scenery path threaded a `damage` factor from data through the bake to a `hit.damage > 0` gate — defaulting to `0`
at every hop (`colliderFromObject`, `scene.js`'s `f.collideDmg ?? 0`). Zero passed every check, multiplied every
number, did nothing. A **factor defaulting to zero behind a `> 0` gate** is a feature that is dead rather than wrong,
and nothing crashes.

**The owner's rule is the right default:** everything solid hurts unless specifically told not to (2026-11-15). So the
factor defaults to `1` — the rock's own number — and the opt-out is explicit data (`collideDmg: 0`). When a system
has a knob whose zero means "never", make the *default* the behaviour the game wants, and make disabling it the
sentence a person has to write on purpose. Then apply the rule everywhere it is meant to hold in one pass: the pilot
**and** hostiles, which had the same free bounce for the same reason.

The second half is the test that was missing: nothing asserted scenery damage either way, so 633 green tests said
"fine" about a station that could not hurt anyone. Assert a rule at what the player feels — flying a hull into scenery
and reading the shield bar — not at the plumbing that carries it.

- **Enforced by:** `tests/collision-damage.test.mjs` (bake defaults, the hull really takes the rock-rate damage,
  the factor scales it, `collideDmg: 0` opts out, slow contact is free, rock and station cost the same) and
  `tests/enemy-collision.test.mjs` (scenery damages a hostile, `collideDmg: 0` does not).

### L28. A `[hidden]` toggle fails when a container selector outranks it or a checkbox traps the key

- **Seen (owner, 2026-11-18):** the `N` panel wouldn't close (`#hud > #pocket-objects` outranked `[hidden]` and checkbox `INPUT`s trapped keys), and `#inv-held-ghost` (`display: flex`) lingered as an empty box after dropping an item.
- **Rule:** every `[hidden]` rule must outrank every `display` rule for that element (and transient cursor ghosts remove on clear); typing guards apply only to text/number/select controls, never checkboxes.
- **Enforced by:** `tests/pocket-list.test.mjs`, `tests/station-ui-batch.test.mjs`.

### L29. Moving colliders stepped once per render frame gave `0 m/s` on multi-tick frames

- **Seen (owner, 2026-11-18):** being pushed by Meridian Station's turning structure showed `0 m/s` while moving.
- **Cause:** `updateScenery(dt)` advanced movers once per render frame before `simClock.advance(dt)` — on any 2-tick frame tick 1 took the whole push and tick 2 saw a frozen mover (`0 m/s`), while high-Hz frames jittered; scaled movers also multiplied local distance by `rLoc / radius` instead of `radius / rLoc`.
- **Rule:** every live collider moves inside the fixed `SIM_DT` step (`stepScenery`), scales local distances back to world metres, and never rounds an active collision push down to `0 m/s`.
- **Enforced by:** `tests/slice1-speed-missions-contracts.test.mjs` (24–240 Hz sweeps, scaled movers, sub-0.5 m/s push).

### L12. A new way to change state skipped the normal refresh
- **Seen (step 10):** after loading a save the sound was dead, the start screen reappeared on docking, and
  Load/Import/Reset did not redraw the screen.
- **Rule:** state changes go through the one path that also does the refresh (events, `loadGame`-style
  functions). A new route that sets state directly must emit what the listeners expect.
- **Enforced by:** `tests/step10-fixes.test.mjs` and the baseline playtest.

### L31. Direct-from-plant fallback and pre-check `setDraw` let a `0 MJ` ship fly and show phantom MJ/s

- **Seen (owner, 2026-11-18):** unequipping the power cell left the tank at `0 MJ`, yet the ship still flew and showed `Using X of Y MJ/s`.
- **Cause:** `hasPower` fell back to `p.gen >= mjps` when `p.stored === 0`, `player.js`/`shield.js` called `setDraw` before checking power, and wall-blocked mining beams bypassed `hasPower`.
- **Rule:** every system with `draw > 0` requires `p.stored > 0` (`hasPower`) and records `setDraw(..., 0)` whenever unpowered.
- **Enforced by:** `tests/slice3-assets-inventory-power.test.mjs`, `tests/content.test.mjs`, `tests/shield.test.mjs`.

### L32. A reset that only wipes the mode you are standing in reads as "reset does not work"
- **Seen (owner, 2026-11-21):** "Resetting save does not reset fully. Credits arent changed to 600. You own a test ship."
- **Cause:** Reset wiped only the *current* mode's half of the dual-mode save, while its words promise "Wipe credits, ships, base and contracts" — the other mode's pilot survived intact.
- **Rule:** a control's words are its contract: Reset wipes **both** halves (`resetAllSave` in `state/state.js`, staying in the mode pressed from); label any per-mode wipe as one.
- **Enforced by:** `tests/reset-save.test.mjs` (both halves dirtied; after a campaign reset both read 600 cr, one Wasp).

### L13. Anything that accumulates per frame must be multiplied by the time step
- **Seen:** the ship blurred and warp roll differed on a 240 Hz display.
- **Rule:** use `dt`; render between ticks by interpolation. See `architecture/simulation-and-rendering.md`.
- **Enforced by:** `tests/sim-step.test.mjs` (the fixed-step tests).

### L14. `matrixWorld` is last frame's transform
- **Rule:** after moving an object, update its matrix before reading `matrixWorld` for a gun or camera position.
  See `architecture/simulation-and-rendering.md`.
- **Enforced by:** NOT YET: add a test if this bites again (it cannot be checked headlessly today, only by eye).
