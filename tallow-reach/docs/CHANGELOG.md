# Changelog

Newest first. Every AI session adds a short entry when it changes the project, so the
next assistant (which has no memory of earlier chats) can see what happened and why.

Entry format: date, a one-line title, then what changed, which files, and anything
the next person must know (save version, rebuild needed, known issues).

---

## 2026-11-06: Lighting the boost costs a flat 20 MJ; refilling the meter is free

The boost now works like a car ignition: expensive to start, cheap to run, and filling the tank
costs nothing at all.

- **Ignition: 20 MJ in one gulp.** When the spool-up finishes and the shake fires, 20 MJ comes
  straight out of the cells (`ign: 20` on `thruster_basic`). With the basic 100 MJ cell that is a
  visible 100 → 80 drop in the bar, and the boost **will not light** unless the cells hold 20 MJ.
- **Burning the boost: 2 + 1 = 3 MJ/s.** The extra 1 MJ/s (`boost: 1`) is now charged only while
  the boost is actually firing, instead of while the meter was filling.
- **Filling the boost meter costs nothing.** The old +1 MJ/s charge draw is gone; the meter still
  fills itself at the same rate, free, at any throttle setting.
- Everything else stands: 2 MJ/s while the throttle is off centre, nothing at exactly zero, and a
  ship with no power has no thrust (the speed winds down).
- Files: `data/modules.js` (`boost` replaces `chg`, `ign: 20`), `sim/drive.js` (`driveOf` carries
  `boost`, `driveDraw(drive, throttle, boosting)`), `sim/player.js` (draw from the burning boost,
  ignition takes 20 MJ out of `stored` and needs that much there, meter refills free),
  `sim/power.js` (comments).
- Verified headless: idle = 0 MJ/s with the boost filling free; flying = 2; boosting = 3; the
  ignition frame dropped the cells 20.03 MJ; with 15 MJ in the cells, Shift did nothing at all.
- Tests: the existing power tests were updated to the new figures → **46 passing**. No save
  change: still version 5. `npm run build` needed (578 KB).

## 2026-11-06: Thrusters use power, and a dry cell winds the speed down

Basic thrusters now drink from the power cells. The numbers live on the module in
`data/modules.js` (`draw: 2`, `chg: 1`, `ign: 1`), so a better thruster can be thirstier.

- **2 MJ/s whenever the throttle is off centre** — 100%, 99%, 1%, -1%, -30%, -100% all count.
  Only a throttle of exactly zero (X, or hands off once it has been set to 0) draws nothing.
- **1 MJ/s more while the boost meter is filling.** The meter fills by itself whenever the ship
  has power to spare, so the readout often sits at 1 MJ/s when the ship is idle and at 3 MJ/s
  while flying and charging.
- **1 MJ flat, each time the boost lights.** Charged on the frame the boost engages, out of the
  cells' stored energy.
- **Out of power means no thrust, and the speed winds down.** `hasPower()` in `sim/power.js`
  answers whether the cells (or a plant that covers the demand) can pay; when they cannot, the
  drive's speed is treated as 0 and the usual drag model bleeds the speed away instead of
  stopping the ship dead. Boost is refused too. Turning still works, so a dry ship can aim.
- Files: `data/modules.js` (draw/chg/ign), `sim/drive.js` (`driveOf` carries them, new
  `driveDraw`), `sim/power.js` (new `hasPower`), `sim/player.js` (sets `state.power.draw`,
  gates thrust on power, charges and ignition costs), `ui/hud.js` unchanged (it already shows
  `Using X of Y MJ/s`).
- Verified headless: full throttle = 2 MJ/s, throttle 0 with a full boost = 0, idle charging =
  1, flying + charging = 3; ignition takes exactly 1 MJ plus the frame's 2 MJ/s; with no plant
  and 3 MJ left the ship went 52 → 33 → 21 → 14 → 9 → 5 → 2 m/s after the cells emptied.
- Tests: 3 new (`driveDraw` for every throttle setting, the power figures on the module,
  `hasPower`) → **46 passing**. No save change: still version 5. `npm run build` needed (578 KB).
- **Consequence to know about:** a plant-less ship that flies until the cells empty cannot fly
  home. That is the point of the rule; docking is only possible if you get back first.

## 2026-11-06: "Equip thrusters to move" warns you when a dead ship ignores the controls

- Undocking with no thrusters and then pressing **anything that would move the ship** now shows
  the warning **"Equip thrusters to move"** in the centre of the screen. It covers W/S (thrust),
  A/D (strafe), Space/C (lift), Q/E (roll), Shift (boost) and the mouse, and it repeats every
  three seconds while a control is still held, so it reads as a reminder instead of flickering.
- Nothing else changed: the ship still cannot move, turn or boost, the throttle stays at 0, the
  launch message and the standing hint line ("No thrusters fitted: press G to dock and fit one.")
  still explain how to get back to the outpost.
- The warning lives in `sim/player.js` (`tryingToMove()`, `NO_DRIVE_WARN`, `state.player.noDriveT`)
  and is shown with the ordinary centre-screen message, so it never stacks up.
- Tests: a guard test keeps the exact wording and the "only when a control is pressed and there
  is no drive" rule in place → **43 passing**. No save change: still version 5.
  `npm run build` needed (578 KB).

## 2026-11-06: No thrusters means no movement, no turning and no boost

- **An empty thruster bay is now a dead ship.** `driveOf()` returns `{ spd: 0, turn: 0 }`
  instead of falling back to a speed the hull used to carry, so with no thrusters fitted the
  ship cannot thrust, strafe, lift, turn or boost. The throttle is held at 0, so the engines
  stay cold, the boost ramp never starts and the boost bar is never spent.
- **Hulls no longer have `spd`/`turn`** (`data/ships.js`). Speed and turn live only in the
  thruster module; `npm test` now fails if a hull grows a speed of its own again. When hulls
  should handle differently, that is a multiplier in `sim/drive.js`, not a base speed.
- **The player is told, and can get back:** `launch()` puts the ship 200 m from the outpost
  (inside the 300 m docking range, so an immobile ship can dock straight back), refreshes the
  drive, and shows *"No thrusters fitted: the ship cannot move. Press G to dock and fit one."*
  The HUD repeats *"No thrusters fitted: press G to dock and fit one."* while the ship cannot
  move, so the dead controls have a reason on screen.
- Files: `sim/drive.js` (no fallback, new `hasDrive`), `sim/player.js` (throttle and boost
  gated on the drive), `sim/session.js` (launch distance, message, `refreshDrive()`),
  `ui/hud.js` (prompt), `data/ships.js` (no `spd`/`turn`), `tests/content.test.mjs`,
  `tests/fitting.test.mjs`.
- Verified headless: 10 s holding every control (W S A D Space C Shift, mouse hard over) moves
  an empty-bay ship **0 m and turns it 0°**, on all three hulls; with the basic thrusters
  nothing changed (150 m/s flat out, 295 m/s boost, same turn rate).
- Tests: **42 passing**. No save change: still version 5. `npm run build` needed (578 KB).

## 2026-11-06: Paint bays are clickable, and show an empty colour store

- **The two Appearance bays are buttons like module bays.** Clicking one opens the picker
  rectangle under the card, with a Close button and the message **"No colours in storage."**
  Clicking the open bay again, or Close, shuts it, and the open bay gets the pale blue edge.
- **One picker at a time across the whole screen**: opening a module bay closes an open paint
  picker and the other way round.
- **No paint data and no save change.** Colours will be stored and fitted the same way
  modules are, and this picker becomes that list of colours when they arrive; until then the
  empty message is the whole content.
- The click rule moved into a new `src/ui/picker.js` (`toggleModulePicker`,
  `togglePaintPicker`) so it is a pure function that can be tested without a browser.
  `ui/menu.js` `slot`/`paint` call it, and `fit`/`unfit` now check that the open picker is
  really a module bay. `state.ui.fit` gained a `kind` field ("module" or "paint").
- Tests: 3 new in `tests/picker.test.mjs` (the toggle, one-at-a-time, and paints and modules
  sharing the picker). `npm test` now runs 40.
  `game/tallow-reach.html` needs `npm run build` (577 KB).

## 2026-11-06: Fix: the Appearance bays lost their boxes

- The two paint bays on the **Appearance** card are plain divs, while module bays are now
  buttons. When the bays became clickable, the box styling (border, background, padding,
  grid) was written on `button.mod-bay`, so the paint bays no longer matched any rule and
  collapsed into bare inline text reading **"PRIMARYEmpty"**.
- The box is back on the bare `.mod-bay` class, which every bay uses whatever its tag;
  `button.mod-bay` now only carries the button reset (font, colour, cursor). The Appearance
  card is two dashed boxes side by side again, "Primary / Empty" and "Secondary / Empty",
  the same size as the Primary weapons bays.
- Tests: 1 new guard (now 37) that reads `src/styles.css` and fails if the box properties
  ever move onto the button selector again. No save or gameplay change.
  `game/tallow-reach.html` needs `npm run build` (577 KB).

## 2026-11-06: Basic thrusters, and every hull flies like the Wasp

- **The thruster bay has a module now**: `thruster_basic` in `src/data/modules.js`, "Basic
  thrusters", top speed **150 m/s** and turn **1.2** — the Wasp's old hull figures, copied
  exactly, so a Wasp with them fitted flies precisely as it did before modules existed.
  Boost is still 2x, strafe/lift/reverse are still the `FLIGHT` fractions.
- **Speed and turn now come from the thrusters, not the hull.** New `src/sim/drive.js` turns
  the fitted thruster into `state.drive = { spd, turn }`; `sim/player.js` and
  `render/camera.js` read that and nothing else. Measured in a headless flight probe:
  Wasp, Prospector and Bulwark all reach **150 m/s**, **295 m/s** on boost and turn at
  **69 deg/s** — identical, as asked. Hull differences are a later job and belong in
  `driveOf` as multipliers.
- **A hull with no thrusters fitted falls back to its own `spd`/`turn`** from `data/ships.js`
  (measured: Bulwark 90 m/s, 40 deg/s). That is deliberate: without it, a player who unequips
  the drive and launches would be stranded in space with no way back to the outpost.
- The Outfitting card shows `Basic thrusters` / `150 m/s` and the count `1 / 1`.
- **Save: `SAVE_VERSION` 4 -> 5.** The saved shape is unchanged; the version marks the point
  from which thrusters exist. A save made before 5 has its empty thruster bay filled with the
  stock drive on load (that bay was never a choice), while a save at 5 keeps a bay you chose
  to empty empty.
- Tests: 2 new and 1 extended (every hull flies like the old Wasp on stock thrusters; the
  hull fallback; the thruster module's fields; unequip/refit moving `state.drive`).
  `npm test` now runs 36. `game/tallow-reach.html` needs `npm run build` (576 KB).

## 2026-11-06: Click a bay to fit a module, or unequip one into storage

- **Every module bay is a button.** All eight bays across the seven groups can be clicked.
  Clicking one opens a **picker rectangle under that card**; clicking the same bay again, or
  **Close**, shuts it. Only one picker is open at a time.
- **The picker holds squares, one per stored part that fits that group**, each with the
  part's name and number (`Basic powerplant` / `10 MJ/s`). With nothing stored it reads
  **"No modules in storage."** exactly as asked, and that is what a new game shows.
- **Unequip**: a filled bay gets a button at the bottom of its picker, "Unequip Basic
  powerplant to storage". The part leaves the bay, lands in the new module store
  (`profile.modules`) and appears in the picker as a square, ready to go back in. Fitting
  into a full bay swaps, sending the part it replaced to storage.
- **Fitting is instant and updates the ship at once**: every fit/unequip refreshes the power
  budget, so taking the powerplant off turns 10 MJ/s into 0 MJ/s before you launch. Docked,
  the cells refill as usual.
- **Nothing can be bought yet**, so the only way to get a part into storage is to take it off
  a hull. That is deliberate: the shop is the next step.
- Save: **`SAVE_VERSION` 3 -> 4**, adding `profile.modules` (a list of module ids). Older
  saves load with an empty store and their fitted parts untouched; unknown ids are dropped
  and a corrupted value empties the store rather than failing the load.
- Files: new `src/sim/fitting.js` (`fitModule`, `unequip`, `storedFor`, `fittedAt`);
  `ui/screens.js` (bay buttons and the picker), `ui/menu.js` (`slot`, `fit`, `unfit`
  actions), `state/state.js` (`ui.fit`), `styles.css`, `state/profile.js`.
- Tests: 6 new in `tests/fitting.test.mjs` (new game, unequip, re-fit, the refusals, the
  swap, and the old-save migration). `npm test` now runs 34.
  `game/tallow-reach.html` needs `npm run build` (576 KB).

## 2026-11-06: Basic powerplant and power cell, with a power bar in flight

- **Modules exist.** `src/data/modules.js` holds the first two: **Basic powerplant** (10 MJ/s)
  and **Basic power cell** (100 MJ). Every hull is delivered with both fitted.
- **Per-hull bay layouts.** Bay counts moved out of `MODULE_GROUPS` into `SHIP_LAYOUTS`
  (`src/data/outfitting.js`), one entry per hull. All three are a straight copy of the Wasp's
  today (1 powerplant, 1 cell, 1 thruster, 1 shield, 2 primary, 1 secondary, 1 hull), so a big
  hull can be given a different arrangement later by editing its own line. `slotsFor()` and
  `layoutFor()` are the only readers; a test fails if a hull is missing a group's count.
- **The Outfitting screen shows what is fitted.** Fitted bays are now solid, with the part's
  name and its headline number (`Basic powerplant / 10 MJ/s`), and the group count reads
  `1 / 1`. Empty bays still read `Empty`.
- **Power in flight.** New `src/sim/power.js` turns the fitted modules into
  `state.power = { gen, cap, stored, draw }` (10 MJ/s, 100 MJ, 100 MJ, 0 MJ/s at the start) and
  charges the cells every frame. Bottom centre, above the throttle line, the HUD now shows a
  **Power cell** bar with `100 / 100 MJ` and `Using 0 of 10 MJ/s`. It reads `No power cell` if a
  hull has none fitted. Cells are full when you launch and topped up by the outpost on dock.
- **Nothing draws power yet.** `draw` is 0, so the bar sits full; the first system that needs
  energy (shields, the mining beam) only has to add to `state.power.draw` and the cells start
  moving. That is the one line to remember.
- **Save change: `SAVE_VERSION` 2 -> 3**, adding `profile.loadout`: per hull, per group, one
  entry per bay (`null` for empty). Old saves and new hulls get the stock fit
  (`STOCK_FIT` in `data/modules.js`); a bay the player really emptied stays empty, unknown
  module ids and bays beyond a hull's layout are dropped. A ship bought in the Hangar comes
  with the stock fit; a destroyed ship's loadout is deleted with it.
- Tests: 4 new (module data and its group, every hull's layout, a new game's 10 MJ/s into
  100 MJ, the old-save migration and dropped modules, and the charge/overflow/empty maths).
  `npm test` now runs 28. `game/tallow-reach.html` needs `npm run build` (572 KB).

## 2026-11-06: Powerplant talks in MJ/s, not MW

- The Powerplant card now reads **"Energy the ship makes every second, in MJ/s."** instead of
  "Power the ship produces, in MW." The Power cells card reads **"Energy the ship can hold,
  in MJ."** Both cards now describe energy in the same units, one "per second in", one
  "stored", which is easier to read than a megawatt with nothing to compare it to.
- **This is wording only.** 1 MJ/s is exactly 1 MW, so any module numbers written later mean
  the same figure in either unit and nothing needs rebalancing.
- One file changed: `src/data/outfitting.js` (`MODULE_GROUPS`). No gameplay, save, layout or
  visual change. Tests unchanged at 24. `game/tallow-reach.html` needs `npm run build`.

## 2026-11-06: Appearance card under the Hull bay

- **New card at the bottom of the right-hand column: Appearance**, directly under the Hull
  group. It holds **two paint bays, Primary and Secondary**, both reading `Empty` with a
  `0 / 2` count, and a line saying the standard livery is used until a colour is fitted.
- It is layout only. **No paint exists, nothing can be bought or fitted, and no gameplay,
  save field or `SAVE_VERSION` changed.** Paints will be bought, stored and fitted the same
  way modules are; the card is drawn by the same code as the module cards, so they will
  look identical when that arrives.
- The bays come from the new `APPEARANCE_SLOTS` in `src/data/outfitting.js` (`k` id, `n`
  name). Add an entry and one more paint bay appears; the card always sits last, under the
  hull group, so adding module groups does not move it.
- `ui/screens.js`: `appearanceHtml()`, appended last in the right rail. The screen's intro
  line now says modules and paints arrive in a later update.
- Tests: 1 new (the two paint slots have unique ids and names, primary before secondary).
  `npm test` now runs 24. `game/tallow-reach.html` needs `npm run build` (569 KB).

## 2026-11-06: Outfitting screen with a 3D ship viewer

- **New tab: Outfitting**, between Hangar and Shop. On this tab the outpost panel opens
  up to the middle of the screen (`#panel.wide`, up to 1180 px), so the ship has room.
- **The ship sits in the middle of the screen** in its own 3D window, drawn by a second
  renderer (`src/render/shipviewer.js`) on a transparent canvas over a dark gradient.
  It turns slowly on a display ring; drag to spin it, scroll to zoom, double click to reset.
  The idle turn pauses for 3 s whenever you take hold of it, and is off altogether if the
  system asks for reduced motion. Ships are normalised to the
  same bounding sphere, so no hull is clipped and none looks tiny.
- **Module groups surround it**, four down the left and three down the right, in the same
  card for every group: name, `filled / bays` count, one bay box per slot (all read
  "Empty"), and a line saying what the group decides. The layout is driven entirely by
  the new `src/data/outfitting.js`, so adding a group there is enough (recipe 15).
- **Bays today:** powerplant 1, power cells 1, thrusters 1, shields 1, primary weapons 2,
  secondary weapons 1, hull 1. Nothing is fitted and **no module exists in the game yet**;
  no gameplay number, save field or balance was touched, and `SAVE_VERSION` is unchanged.
- `ui/outfitting.js` mounts the viewer into `#shipview` after every panel redraw (the panel
  rebuilds its HTML, which throws the canvas out but does not destroy it) and draws one
  frame from the main loop through `updateOutfitting(dt)`. It does nothing unless you are
  docked on that tab.
- The ship window needs WebGL; if the browser refuses a second context the panel says so
  instead of showing an empty box.
- Tests: 1 new (`MODULE_GROUPS`: unique ids, a name and description each, whole-number bay
  counts, `slotsFor` agrees, and the intended 2 primary bays / 1 everywhere else).
  `npm test` now runs 23. `game/tallow-reach.html` needs `npm run build`.

## 2026-11-05: The chase camera stops running away at speed

- **The view no longer backs off as you accelerate.** It used to trail further the faster you
  went: 16.8 units behind the ship at 37% throttle, 26.9 at full throttle, and **43 at full
  boost**, which read as the camera flying backwards.
- The trail is now a fixed, bounded line in speed (`CAMERA` in the new `src/data/camera.js`):
  **11.0** standing still, **17** at full forward speed (throttle 1 plus boost) and **10.5** at
  maximum reverse. Everything between is linear in speed, and the two ends are hard limits, so
  no speed can push the view past 17 or pull it closer than 10.5. Measured in game: idle 11.0,
  100% throttle 13.9, full boost 17.0, full reverse 10.5.
- Both limits are per hull (`spd * 2` forward, `spd * FLIGHT.reverse` backwards), so the slower
  ships reach the same numbers at their own top speed instead of trailing less forever.
- **Two real bugs behind the old behaviour**, both fixed in `render/camera.js`:
  1. The chase point was built with `localToWorld()`, which reads `matrixWorld` — a matrix only
     refreshed when the scene is drawn, i.e. last frame's transform. The offset therefore
     included one frame of the ship's travel, growing with speed. It is now built from the
     ship's position and quaternion directly.
  2. The camera eased its position in world space toward that point, so the ship's own travel
     counted as camera error and the steady-state gap was `speed / 10`. The camera now rides
     along with the ship's per-frame movement (`_delta`) and eases only the offset, so speed
     cannot drag it back at all. Turning still swings the view (about 5 degrees of trailing at
     full stick), and a jump to a new sector is ignored so the arrival still snaps cleanly.
- Tests: 1 new (`cameraTrail` is bounded, monotonic, and hits 11 / 17 / 10.5 at idle / top /
  reverse). `npm test` now runs 22.
- Save format: unchanged. `game/tallow-reach.html` needs `npm run build`.

## 2026-11-05: Flight feels heavier: slower turn, weak side/reverse thrusters

- **Turning:** every hull now turns at 70% of its old rate (`FLIGHT.turn = 0.7`). Each ship's own
  `turn` stat still sets the character of the hull, so a Wasp is still twice as nimble as a Hauler;
  the 0.7 is applied on top. Measured in game (Wasp, stick held hard over): 66 deg/s, against
  99 deg/s before, a ~30% reduction.
- **Forward thrust is unchanged.** `spd` is still the top speed of the main drive and Shift still
  doubles it.
- **Sideways, vertical and reverse thrusters are now a fraction of the forward drive:** strafe
  (A/D) 30%, lift (Space/C) 30%, reverse (S below zero throttle) 30%. Measured strafe settles at
  45 m/s on the Wasp (0.3 x its 150 m/s forward speed) and boost still peaks at 2x forward (292 m/s
  observed). The point is that a ship is fastest going forward; its manoeuvring thrusters are not.
- The fractions live in one new table, `FLIGHT` in `src/data/ships.js` (`turn`, `strafe`, `lift`,
  `reverse`). `sim/player.js` reads it, so this is now the single place to retune the feel of
  every ship at once. The old hard-coded `0.45` strafe and `0.4` lift are gone.
- Tests: 1 new (the `FLIGHT` fractions are per-ship fractions of `spd`, and `turn` is a 0..1
  multiplier). `npm test` now runs 21.
- Save format: unchanged. `game/tallow-reach.html` needs `npm run build`.

## 2026-11-05: Warp lets the ship coast and unwind, instead of freezing it

- Pressing M no longer slams the ship to a halt or snaps its turn off.
- **Speed:** the throttle is released (exactly as pressing X does) and the existing drag model
  bleeds the speed off, so you coast down. Measured from 102 m/s: 94, 82, 75, 66, 60, 55, 48,
  44, 38 m/s across the charge. `startWarp()` no longer zeroes `P.v`; only the arrival does,
  under the white-out, where it cannot be seen.
- **Turning:** the stick position (mouse x/y and Q/E roll) is captured when the drive engages
  and eased back to neutral over the new `WARP_COAST.steer` (0.6 s) in `data/sectors.js`, via
  the pure helper `warpSteerEase(t)`. A held turn keeps turning for a moment and winds down.
  Strafe, lift, boost and throttle input are ignored for the whole sequence.
- `sim/player.js` no longer returns early during a warp. It runs the whole flight model with
  the inputs released, so momentum, drag, asteroid collisions and shield recharge all behave
  normally while the drive is engaged. Weapons are still cut, in `sim/weapons.js`.
- Removed the `P.snap` camera lock added with the roll fix: with the roll gone it only caused
  a small jump on the frame M was pressed. The camera simply keeps tracking the ship, which is
  now easing its turn out.
- Tests: 1 new (`warpSteerEase` is 1 at the start, about half way through, 0 after, and the
  ease finishes before the sector changes). `npm test` now runs 20.
- Save format: unchanged. `game/tallow-reach.html` needs `npm run build`.

## 2026-11-05: Fix: no rotation when warping

- Pressing M no longer turns or tilts the view. `render/camera.js` no longer rolls the
  camera during a warp; the FOV widening stays.
- Why it happened: the roll was added as a **fixed 0.05 radians per frame** instead of
  per second. That is a hidden frame-rate dependency — at 30 fps it was a slight 6 degree
  lean, but on a 144 Hz or 240 Hz display the same code compounded into a huge rotation over
  the two-second warp, which is what the player saw ("the ship rotates right and it warps
  when it is about 180 degrees").
- `sim/sectors.js` also sets `P.snap = true` when a warp starts, so the chase camera locks
  onto the ship's heading on that frame instead of continuing to catch up. Nothing swivels
  when the drive engages.
- Measured after the fix: the ship's apparent roll across a whole warp changes by less than
  0.5 degrees (it was 6 degrees at 30 fps before, and much more at high refresh rates).
- Save format: unchanged. `game/tallow-reach.html` needs `npm run build`.

## 2026-11-05: Warp animation, warp sound, and a two-second warp

- A warp is no longer instant. It is a sequence of about two seconds, tuned by the new
  `WARP` block in `data/sectors.js`: `charge` 1.1 s (drive spins up), `flash` 0.18 s
  (white-out, and the sector changes at the start of it), `settle` 0.72 s (drive winds
  down). `WARP_TIME`, `WARP_SWITCH_AT`, `warpPhaseAt(t)` and `warpFlashAt(t)` are exported
  so the visuals and the tests read the same numbers.
- **Control is locked for the whole sequence.** `sim/player.js` pins the ship (throttle and
  drift zeroed) and `sim/weapons.js` skips cannons, the beam, lock-on and missile launches;
  missiles already in flight keep going. Docking is refused mid-warp (`main.js`). Control
  comes back on the frame the sequence ends.
- `state.warp` holds the sequence while it runs: `{ from, to, t, fx, flash, switched }`.
  `fx` runs 0 -> 1 -> 0 over the whole warp and drives the visuals; `flash` peaks at 1 at
  the moment the sector changes. Both are recomputed from the clock every frame, so the
  picture cannot drift from the simulation.
- Look: `render/warpfx.js` draws 130 additive line streaks hanging off the camera, which
  close on the ship faster and stretch as the drive builds. `ui/warpflash.js` adds two
  full-screen gradients (a tunnel vignette that follows `fx`, and the white-out that follows
  `flash`). `render/camera.js` widens the FOV by up to 16 degrees and rolls slightly during
  the warp. No post-processing and no new dependencies.
- Sound: `warpCharge(dur)` in `core/audio.js` (rising whine, air rushing past, sub-bass
  swell) and `warpBurst()` at arrival (noise slam, thump, shimmer). Both are procedural, like
  everything else.
- New events: `warp-start { from, to }` and `warp-end { from, to }`, listed at the top of
  `util/events.js`. `sector-changed` now fires mid-warp, at the white-out.
- A warp is cancelled by docking (`sim/session.js`), which covers dying mid-warp: you never
  end up half-way between sectors.
- Performance note for the next session: the first version of the overlay (a masked
  `repeating-conic-gradient` behind a CSS mask) halved the frame rate, 32 -> 13 fps in a
  software renderer. It was replaced with the 3D streaks plus two plain gradients, which
  measures 32 -> 26 fps. Keep the overlay to plain gradients.
- Tests: 2 new (`warpPhaseAt` order and length, `warpFlashAt` shape). `npm test` now runs 19.
- Save format: unchanged (`SAVE_VERSION` stays 2). Warp state is runtime only.
- `game/tallow-reach.html` is unchanged; run `npm run build` to regenerate it.

## 2026-11-05: Second sector, warp on M

- There are now two sectors. **Tallow Reach** is the old one (outpost, planet, asteroid
  field). **Kestrel Hollow** is new and deliberately empty: you arrive in open space with
  nothing in it, and none of Tallow Reach's scenery, markers or rocks can be seen from it.
- **M warps** to the next sector on the chart and back again (an action, so it goes through
  `core/input.js` -> `main.js` like the other keys). It only works while flying: not docked,
  not paused. A warp clears hostiles, shots, crates and particles, drops you at the sector's
  arrival point at rest, and snaps the camera.
- New `src/data/sectors.js`: the sector table (`n`, `d`, `sn` arrival point, and the flags
  `st` outpost / `fd` field / `foes` raiders), `SECTOR_IDS` (the warp order) and
  `DEFAULT_SECTOR`. Tuning and new sectors go here.
- New `src/sim/sectors.js`: `enterSector(id)` and `warpToNext()`.
- `render/scene.js` now gives each sector its own `THREE.Group`, made on first use, with
  `sectorGroup(id)` and `showSector(id)`. The outpost, planet and atmosphere are built into
  the starting sector's group, so hiding a sector is a visibility toggle. The starfield is
  the backdrop of every sector, so it stays.
- `sim/world.js` keeps a parked rock list per sector, so `state.world.asteroids` always
  holds the current sector's rocks and every system can keep reading it directly. Mining,
  collisions, lock-on, bullets and missiles therefore find no rocks in Kestrel Hollow, and
  the field comes back exactly as you left it (same rocks, same mined-out ones).
  Also new: `clearWorldObjects()` (clears crates and particles too, used by the warp).
- Everywhere that assumed the outpost sits at the origin now checks the sector flags:
  the keep-out bubble (`sim/player.js`), docking (`sim/session.js`, which also returns you
  to the starting sector), station lock-on (`sim/targeting.js`), the pirate spawner
  (`sim/ai.js`) and the HUD markers and dock hint (`ui/hud.js`).
- The HUD's top-right readout now starts with the sector name.
- New event `sector-changed { from, to }`, listed at the top of `util/events.js`.
- Docs: how-to recipe 14 (a new sector) added; folder READMEs updated.
- Save format: **unchanged** (`SAVE_VERSION` stays 2). `state.sector` is runtime only, so you
  always launch in Tallow Reach and a reload puts you back there. No migration needed.
- `game/tallow-reach.html` is unchanged; run `npm run build` to regenerate it.

## 2026-11-05: Project tidy for growth (no gameplay change)

- Contract types are now defined in one place. `data/contracts.js` has `CONTRACT_TYPES`,
  `CONTRACT` generators and a new `DESCRIBE` table. The offer board (`sim/contracts.js`), the
  saved-game loader (`state/profile.js`) and the contract wording now read from it. Before, the
  number `3` and the type list were repeated in three files, so adding a fourth type would
  have failed silently. Output was checked identical to the old code across 3,000 seeded boards.
- `ui/screens.js`: outpost tabs are drawn through a `SCREENS` table instead of an if-chain.
  Two very long text lines were split into readable pieces. The HTML produced is identical.
- `styles.css` reformatted to one declaration per line with labelled sections. Verified equivalent
  to the old file after minifying.
- New: `docs/HOW_TO_ADD.md` (recipes), a `README.md` in each `src/` folder, "File map",
  "Conventions" and "Known gaps" sections in `docs/ARCHITECTURE.md`, this changelog.
- New tests: `tests/content.test.mjs` checks every ship, item, weapon, base module and contract type.
- `package.json`: `npm test` now runs `node --test` (the old `node --test tests/` form fails on newer Node versions).
- Save format: unchanged (`SAVE_VERSION` stays 2).
- `game/tallow-reach.html` was updated by hand-patching, because the build tools were not
  available in that session. It plays identically to a fresh build. Run `npm run build`
  once to regenerate it cleanly.

## 2026-11-05: Pause menu and mute

- The M key no longer mutes. `KeyM` was removed from `BINDINGS` in `core/input.js` and the
  `mute` case from `main.js`.
- The pause menu (`ui/pause.js`) now has four rows: big PAUSED, "P or Esc to resume", a
  Sound on/off switch (it calls `toggleMute()` in `core/audio.js`), and the Resume button.
  Styles are under "Pause overlay" in `styles.css`.
- Help texts that mentioned the M key were updated (`index.html`, `ui/screens.js`).
- Save format: unchanged. Mute state is not saved, so sound starts on every time.

## 0.2.0: Baseline

- Modular source split out of the original single-file prototype (`reference/original-tallow-reach.html`).
