# Architecture: Ship systems: drive, shield, hull, guns, mining beam, missiles, fitting

> Part of the code-architecture docs; the index and the layers are in [ARCHITECTURE.md](../ARCHITECTURE.md).
> This describes the code **as it is now**. When a change replaces a rule, rewrite it here.

## Conventions

- **Camera trail has one home: the `CAMERA` table in `data/camera.js`** (`base` 11, `fast` 17,
  `reverse` 10.5, with the pure helper `cameraTrail(vf, fwdTop, revTop)`). It is the only thing
  that changes the chase distance with speed; the camera's easing must never see the ship's
  travel, or speed leaks back in.
- **The boost tank is part of the drive too.** `data/modules.js` gives the thrusters
  `bmax`/`buse`/`bfill` (tank size, units a second out, units a second back); `sim/drive.js`
  carries them on `state.drive` and sizes `state.player.enMax`, and `sim/player.js` burns and
  refills `player.en`. The HUD prints `en / enMax` beside the bar. Nothing else knows the numbers.
- **Speed and turn have one home: the fitted thrusters.** `sim/drive.js` reads the thruster
  module and writes `state.drive = { spd, turn }`; `sim/player.js` and `render/camera.js` read
  that and nothing else. Hulls no longer carry `spd`/`turn` at all: do not add them back and do
  not hard-code a speed. Swap the module, or add a field to it.
- **No thruster fitted means a dead ship.** `driveOf()` returns `{ spd: 0, turn: 0 }` when the
  thruster bay is empty (there is no hull fallback, on purpose: the bays are what make the ship
  fly). `flight()` then holds the throttle at 0 and refuses boost as well as thrust, so holding
  W, Shift or the mouse does nothing at all, and pressing any of them raises the centre-screen
  warning "Equip thrusters to move" (`tryingToMove()` in `sim/player.js`, repeat-limited by
  `state.player.noDriveT`). The HUD prints "No thrusters fitted: press G to dock and fit one."
  and `launch()` says the same in the centre message. Test it with any hull
  plus an empty thruster bay (`hasDrive(state.drive)` is false). Docking range is 300 m and
  launch puts the ship at 200 m, so an immobile ship can always dock straight back.
- **Shields come from the shield module, not the hull.** `sim/shield.js` reads `sh` (Shield HP),
  `regen` (Shield HP a second) and `delay` (seconds without a hit) and writes `state.shield` plus
  `P.shMax`. Any hit stamps `P.last` (in `hurt()`), and the recharge stays off until that was
  `delay` seconds ago; then it runs at full `regen`. No shield module means `P.shMax` is 0 and
  every hit goes to the hull. Later shield types with special behaviour (recharging under fire)
  are extra fields read by `updateShield()` — nothing outside that file changes. Shields also cost
  power: a flat `draw` MJ/s (2 on the basic module) all the while they are up, reported through
  `setDraw("shield", ...)` so `state.power.draw` stays the whole ship's bill. When the ship cannot
  pay that (no plant, flat cells) they bleed away at `drain` Shield HP a second and stay at 0 until
  the power comes back.
- **Hull HP come from the hull module, not the hull.** `sim/hull.js` reads `hp` from the
  fitted hull module the same way shields read `sh` — `hull_basic` grants 10 Hull HP, and it
  is standard issue. No hull module fitted means the ship has no Hull HP at all: `P.hullMax`
  is 0, `P.hull` is 0, and the first hit that reaches the hull emits `player-dead` (see
  `hurt()`) — a one-shot kill, exactly like taking the shields off. The hull has no recharge and
  no power bill: damage is only ever repaired at the outpost, for credits. The fraction left is
  kept in `profile.hp[ship]`, stamped on every hull hit (`hurt()`) and on dock, so a fit change
  or a hangar visit keeps the damage taken — never a free repair, and taking the module off at
  the dock un-fits the ship without forgetting the fraction it had. Repair costs
  (`economy.repairCost`) read the fitted module's Hull HP, not a hull stat.
- **Guns come from the primary bays, not the hull.** A gun is a module in the `primary`
  group (`cannon_basic`: `dmg` a shot, `rate` shots a second per barrel, `bspd` bullet speed, `draw` MJ/s,
  and `barrels` for linked barrels fired side by side, default 1).
  `sim/guns.js` turns the fitted bays into `state.guns`, one entry per gun in bay order, and
  `updatePrimary()` in `sim/weapons.js` fires them all on left click, each on its own
  `1 / rate` cooldown, from its nose hardpoints (a linked pair — the basic cannon —
  fires from the two fixed hardpoints at ±1.8 m, one bolt per side, the pre-module
  layout; a lone barrel fires from its bay position, `-1.8 + 3.6 * i` metres across
  the nose). The bay
  index is the only difference between the two bays: the same module behaves the same in
  either one, and there is no separate key for either. The gun's damage is multiplied by the
  hull's `dmg` (1 on every hull — the hulls are identical apart from the hold for now), so
  the module figure is the number the game uses. While the trigger is held and the guns are firing they report
  `setDraw("guns", draw * guns fitted)`; `hasPower()` decides whether they may fire at all, the
  same rule the thrusters follow. `state.flight.gunCd` holds one cooldown per fitted gun.
  Whether they fired on a given frame is worked out inside `updatePrimary` and kept there — it
  is per-frame and purely local, so it is not a field of `state.flight` (the old stored copy was
  never read by anything outside `sim/weapons.js`).
- **The mining beam is a module too, not a weapon flag.** `beam_basic` lives in the `primary`
  group (`period` 4 s of continuous contact per ore before the hull's `mine` multiplier,
  `range` 340 m, `draw` 2 MJ/s), sold at Meridian for 900 cr (`data/shops.js`) — buying it puts the module in
  storage, from where it can be fitted in either primary bay like a gun (key 2 selects the
  beam slot; with no beam fitted that slot is the `Empty weapon slot`).
  `sim/guns.js`'s `beamsOf()` picks the fitted beams (a primary module with `period`, no
  `dmg`), and `state.beams` holds them; `updatePrimary()` only cuts with the beam slot
  selected, a rock in reach and the power to pay (`setDraw("beam", …)`, `hasPower()`,
  `state.power.use.beam`), it draws only while actually cutting, and a whole ore banks per
  `period` of continuous contact (1 ore per 4 s, `best.ore` depletes per ore, the rock
  disappears when dry). The hull's `mine` multiplier is 1 on every hull. **The moment contact stops, the progress toward the next ore is
  lost** — `state.flight.beamT` (contact time) tracks it; docking, launching, a fit change
  or a warp clear it too. A small bar with the percentage (`#bm` in the HUD, directly under
  the "left in rock" hint) shows the progress while the beam is cutting; it is hidden
  otherwise. **A full hold stops the beam before it cuts at all** (`Cargo hold full`), so there is
  no progress to bank. Each completed ore plays a chime (the `ore-gained` entry of `SFX` in
  `core/audio.js`, emitted once per ore the beam secures, above the loop that puts the ore in the
  hold). The beam
  is not a gun: `gunsOf()` never returns it, so the guns and the beam slot never both fire.
  The first fitted beam (lowest bay) acts if two are fitted. Saves that owned the old shop
  beam were given one `beam_basic` in storage in save version 8 (not auto-fitted).
- **The missile lock ring is sized by the screen, not the sim.** The sim reports the cone in
  degrees (`state.flight.coneAngle`: `MISSILE.cone` while a launcher is fitted and no warp is
  running, else 0) and `coneRadiusPx()` in `ui/hud.js` turns that into the ring's pixel radius
  with the camera's field of view and the window height. Same numbers as before the move; do not
  put the pixel maths back in `sim/`.
- **The missile launcher is a module too — it replaced the old `wp.msl` flag.** `missile_basic`
  lives in the `secondary` group (`dmg` 8, `cap` 12, `cd` 4 s, `ammo` 8), sold at Meridian for
  1500 cr like the old launcher, and a purchase tops the rack up to the module's `ammo` (8
  missiles) without ever taking any away — buying it puts the
  module in storage, fitted in the secondary bay like any other module. The missile itself is
  unchanged (`data/weapons.js`: `sp0` 140, `max` 480, `acc` 300, `life` 7 s, `turn` 5.5,
  lock 2.34 s in the dashed cone, 20° cone, 2500 m range, `unitPrice` 35 cr per missile in
  the Shop). `sim/guns.js`'s `missilesOf()` picks the fitted launchers (a secondary module
  with `dmg`), `state.missiles` holds them, `updateMissiles()` only locks and fires with one
  fitted, `F.missileCd` uses the module's `cd` instead of the old flat 0.9 s, and a fired
  missile carries its module's `dmg` (8) into the world so a mid-flight fit change cannot
  alter it. Damage is 8 per missile — it used to be 80. The restock row in the Outfitting services box (below the 3D viewer) shows when
  a launcher is fitted, capped by that launcher. Saves that owned the old launcher were given
  one `missile_basic` in storage in save version 9 (not auto-fitted); the whole `wp` object
  left the save.
- **The primary line and the equip toast use the equipped modules' own names.**
  `moduleListName()` in `sim/guns.js` builds them (`Basic cannons`, `Basic cannons x2` in a
  doubled bay, `Basic mining beam`, `A + B` for a mixed pair), so the HUD and the toast can
  never drift apart from what is actually fitted.
- **`FLIGHT` in `data/ships.js` still scales every ship at once**: `turn` multiplies the
  drive's turn rate, and `strafe` / `lift` / `reverse` are fractions of the drive's `spd`. The
  main drive and its 2x boost are the only directions that reach full speed.
- **Fitting lives in one place.** `sim/fitting.js` is the only code that writes `profile.loadout`, and
  it refreshes the acting pilot's ship power, drive, shields, hull and guns after every change.
  Anything else that changes a bay must go through it, or the ship keeps the old numbers.

## Known gaps

These are real, current limits. None of them is a bug in play today.

- **Every hull is the same ship apart from the hold today.** Thrusters set speed and turn,
  every hull ships with the same basic drive, and the hull's combat and mining multipliers
  are 1 everywhere. The only difference between hulls is the hold, measured in m³ (one
  cargo unit = 1 m³): Wasp 20 m³, Bulwark 30 m³, Prospector 70 m³. Ship-specific bonuses
  are meant to arrive later as hull attributes; hold size is the one stat being kept.
- **Only a handful of modules exist**: a powerplant, a power cell, basic thrusters, basic
  shields, the basic cannons, the basic mining beam, the basic missiles and the basic hull. They can be
  taken off and fitted again (`sim/fitting.js`, stored in the active station's `world.stationStores` stock). All eight are on sale at
  Meridian (`data/shops.js`): the beam at 900 cr and the missile pod at 1500 cr, and the six
  standard parts at 1 cr each, so a part taken off a hull or lost with a ship can always be
  bought back. There is still only one tier of each part — better versions are new `MODULES`
  entries plus a shop row, not a new system.
  Several things draw power (thrusters 2 MJ/s flying plus boost, shields, guns, the beam
  2 MJ/s cutting), so a basic plant out-produces the trickle and the cells stay near full
  unless the powerplant is removed.
- **Inventory limits.** Only the station's parts can be fitted in Outfitting: a module sitting in a
  ship's hold has to be moved back to the station first. Spare modules can be sold (a spare part is
  an item with a value), but there is no "move everything" button, and fitting in the field is not
  possible. Cargo no longer travels with you between ships: it stays in the ship you
  left it in, and the Base screen's Store/Load/Sell buttons act on the ship being flown.
