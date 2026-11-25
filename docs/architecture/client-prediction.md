# Client prediction and interpolation (step 16, slice 8)

*Last checked: 2026-11-24. **Planned, not built.** This file records the owner's brief of
2026-11-24 — the decisions and numbers are theirs, the file names and code facts are this tree's
(four claims checked against it) — and it becomes the "how it works" doc once slice 8 lands. The slice list is step 16 of
[../REFACTOR_PLAN.md](../REFACTOR_PLAN.md).*

The host stays authoritative. Prediction changes **what the guest simulates and draws between
acks**, never who decides: the host's world is still the only truth, and a guest's input is a
command (principle 7), not a key.

## What the guest predicts: its own ship, and nothing else

- **Run `flight(dt, P, runtime)` locally every tick** (`sim/player.js`), on the guest's own controls
  and its copy of its own ship. The loop is already fixed at 60 Hz (`SIM_DT = 1 / 60` in
  `data/simulation.js`, `sim/step.js` `createSimClock`), and controls are already a per-pilot
  record (`state.controls`; 8b adds `state.localInput` for the wire — see the plan).
- **Tag every input with a tick number** and send it. The host answers with its authoritative ship
  state **plus the last input tick it processed** (the `ack`).
- The guest **rewinds to that state and replays the inputs the host has not confirmed yet**. The
  unconfirmed buffer is bounded (a data cap when it is built), so a long silence cannot grow it.
- **Corrections:**
  - **Rotation is not corrected** unless it diverges badly — only the guest's own controls turn its
    ship, so its rotation is already right.
  - **Position and velocity error are blended over about 100 ms**, not snapped: the ship eases.
  - **Snap on a large error** — after a warp or a respawn, where easing would fly the ship through
    scenery.
- **The stick is a held position (−1…1), not a mouse delta**, so a lost packet repeats the same
  input instead of accumulating error. Inputs are sent **unordered and unreliable, with a little
  redundancy** (each message repeats the last few — a count in data).
- **Mispredictions should be rare.** `flight()` collides with rocks (`state.world.asteroids`),
  place colliders (the station ring, a planet, a cave wall) and solid enemy hulls; there is **no
  pilot-versus-pilot collision**, so two players cannot disagree about bouncing off each other. A
  guest's own rock or station bump is predicted from its own copy; the **damage** is not (below).
- **Weapons are cosmetic first:** fire the muzzle flash and the sound **immediately on the guest**,
  and let the host's real bullet replace the cosmetic one. A shot that *hits* is the host's to say.

## What the guest does not predict

- **Damage, kills and loot.**
- **Enemies and missiles.**
- **Mining progress, inventory, docking and warp.**

Hits and kills are shown **only when the host confirms them**: a wrong guess there is much more
jarring than 100 ms of delay. `hurt()` and `player-dead` stay host-side; the guest's hull display
follows the snapshots.

## Remote things are interpolated, never predicted

Other ships and enemies are drawn **about 100 ms in the past**, from **20–30 Hz snapshots**: the
screen shows the world as it was `now − delay`, interpolating between the two snapshots that straddle
that time. The drawing side already exists — `simClock.alpha()` interpolation in `render/views.js`
and `render/camera.js` (see [simulation-and-rendering.md](simulation-and-rendering.md)) — so slice 8
adds a buffer and a delay, not a renderer. The ship-snapshot rate is a **new** data value:
`NET.snapshotSec` (2 s) is the *profile* sync, not this.

## Aim lag against enemies

- Enemies are slow next to the pilot's bullets: their closing speeds run **55–210 m/s** and their
  orbits **18–62 m/s** (`spdFar`/`spdNear`/`spdOrbit` in `data/enemies.js`; the owner's mid-range
  profile is 125 m/s closing, 25–45 m/s orbiting). The pilot's bullets are fast: **900 m/s**
  (`bspd` in `data/modules.js`).
- A guest sees enemies about **150 ms in the past** — the owner's estimate is **5–19 m** of enemy
  movement for that mid-range profile (the fastest closing enemy would be about 31 m).
- **No lag compensation is built yet. Playtest first.** If guest shots miss noticeably, the host
  keeps about **250 ms of enemy position history** and **fast-forwards guest bullets by their
  latency when they spawn** (a host-side change in `sim/weapons.js`).

## What the code has to grow

1. **`flight()` has side effects; it needs a dry run.** Today `flight()` calls `hurt()` on a rock,
   place collider or enemy contact — which emits `sfx`, stamps `profile.hp` and can emit
   `player-dead` — emits `sfx` for boost ignition, and spends `runtime.power.stored` on that
   ignition. The guest predicts movement on **a copy** with **no events and no damage**; the copy's
   own power object still drains, because stored power gates speed and boost ignition. The host
   decides every consequence.
2. **The ack is the whole predicted state, not just a pose:** `pos`, `quat`, `v`, `thr`, `bs`,
   `boost`, `en`, `power.stored`, plus the last processed tick. `thr`/`bs`/`boost` are what the
   flight model and the HUD read; `en`/`power.stored` gate the boost and the drive.
3. **The reported shadowed `r` is not in this tree (checked 2026-11-24).** The asteroid loop in
   `sim/player.js` is `for (const a of state.world.asteroids)` and calls
   `hurt(speed * 0.015 * (hit.damage || 1), P)` with **no** profile argument, so nothing is shadowed
   and nothing is `undefined`. `hurt(d, P, profile)` still falls back to `profileOf(P)`, correct for
   the local pilot. A snippet that passes `r.profile` came from another chat's proposal; it does not
   match this code and is not a bug to fix here.
4. **Aim is per pilot.** `state.aimDirection` is the local camera direction (a parking-lot note in
   [../ROADMAP.md](../ROADMAP.md)); `sim/weapons.js` already reads `P.aimDirection || playerFwd(P)`
   for a non-local record. Each guest must send **its own aim direction in its input**, and the host
   writes it into that guest's record. Any other reader that samples `state.aimDirection` (the
   missile lock in `sim/targeting.js`) has to read the firing pilot's own aim when a guest fires.

## Order to build it

1. **Host-authoritative snapshots with interpolation** (8a, extended to 20–30 Hz).
2. **Predict the guest's own ship** (8d): ticked inputs, ack, rewind and replay, the 100 ms blend.
3. **The cosmetic muzzle effects** (8e): flash and sound now, the host's bullet replaces them.
4. **Lag compensation only if playtests demand it** — never as a first move.

## Where the numbers live, and what stays the same

Every timing and cap — snapshot rate, input redundancy, blend window, divergence threshold, the
history window — is a value in `src/data/multiplayer.js` (timings) or the sim's own data, never a
number in the logic. Saves do not change. The host's authority, the token/`tokenHash` rule, the wire
caps (`net/protocol.js` `LIMITS`, `cleanMessage` on send and on read) and the one-library rule
(`trystero`, only in `net/transport.js`) all stay exactly as they are.

## Honest limits, until playtests say otherwise

- A guest's own ship can be visibly wrong for about 100 ms after a bump or a hard turn.
- A guest sees enemies about 150 ms late; its shots may miss by 5–19 m against common enemies (up to
  about 31 m against the fastest closing one) until lag compensation exists — and lag compensation
  is deliberately **not** in the first build.
- Nothing here hides a guess: damage, kills, loot and mining stay host-confirmed.
