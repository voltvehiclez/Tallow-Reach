# Tallow Reach: code architecture

**Reading order for an AI assistant:** this file, then [HOW_TO_ADD.md](HOW_TO_ADD.md)
(step-by-step recipes), then the `README.md` in the folder you are about to edit,
then [CHANGELOG.md](CHANGELOG.md) (what earlier sessions changed).

## Running it

```
npm install          # once
npm run build        # writes game/tallow-reach.html (single file, works offline)
npm run watch        # rebuilds on every save
npm test             # unit tests: data and save layers, plus content checks
```

`game/tallow-reach.html` is **generated** from `src/`. Never edit it by hand. It only
changes when someone runs `npm run build`, so every change to `src/` should end with
a reminder to rebuild. It is self-contained (three.js is bundled in), so it still
runs when opened from disk.

## Layers

Dependencies only point downward. Lower layers never import higher ones.

```
main.js                 boot + frame loop
ui/                     HUD, outpost menus, pause overlay       (reads state, calls sim actions)
render/                 three.js scene, models, camera          (reads state, never changes game rules)
sim/                    gameplay rules: flight, combat, economy, contracts, lifecycle
state/                  runtime state, persistent profile, save storage
data/                   static tuning: ships, items, weapons, station, contract templates
core/                   audio synth, keyboard/mouse input
util/                   math helpers, event bus, seedable RNG
```

Sideways imports inside a layer are fine when they are one-directional (for example
`sim/session.js` uses `sim/world.js`). To connect two systems that should not know
about each other, use the event bus instead.

## Where things live

| You want to...                       | Edit                                           |
|--------------------------------------|------------------------------------------------|
| Add or rebalance a ship              | `data/ships.js`                                |
| Add a cargo type or change prices    | `data/items.js`                                |
| Tune the basic cannon                 | `data/modules.js` (`cannon_basic`: `dmg`, `rate`, `bspd`, `draw`) |
| Tune the missile or the mining beam   | `data/weapons.js`                              |
| Add or price a shop weapon           | `data/weapons.js` (`SHOP_WEAPONS`)             |
| Change base module costs             | `data/station.js`                              |
| Add a contract type                  | `data/contracts.js` (list, generator, wording), plus a listener in `sim/contracts.js` |
| Add a sector or change the warp order| `data/sectors.js`; see HOW_TO_ADD.md recipe 14 |
| Change the warp timing or its lockout | `WARP` in `data/sectors.js` (the look itself follows those numbers) |
| Change pirate behaviour              | `sim/ai.js`                                    |
| Change flight feel                   | `sim/player.js` (`flight`)                     |
| Rebind keys                          | `BINDINGS` in `core/input.js`                  |
| Add an outpost screen (tab)          | `ui/screens.js` (`TABS`, `SCREENS`, a HTML function) and `ui/menu.js` (`ACTIONS`) |
| Add a module                         | `data/modules.js` (`MODULES`, `STOCK_FIT`); see HOW_TO_ADD.md recipe 16 |
| Swap modules between ship and storage| `sim/fitting.js` (`fitModule`, `unequip`, `storedFor`); picker in `ui/screens.js`, actions in `ui/menu.js` |
| Change how a bay opens or closes    | `ui/picker.js` (one picker at a time, pure and tested) |
| Give a hull its own bays             | `data/outfitting.js` (`SHIP_LAYOUTS`)           |
| Change what power does in flight      | `sim/power.js` (`powerOf`, `hasPower`, `setDraw`, `updatePower`) and `state.power`; who draws what is `sim/drive.js` + `sim/player.js` (drive), `sim/shield.js` (shields) and `sim/weapons.js` (guns) |
| Change how a ship flies               | the thruster module in `data/modules.js`; `sim/drive.js` turns it into `state.drive` |
| Change what shields do in flight      | `sim/shield.js` (`shieldOf`, `refreshShield`, `updateShield`) and `state.shield`; the numbers are on the shield module |
| Change what the guns do in flight     | `sim/guns.js` (which guns are fitted, `state.guns`) and `sim/weapons.js` (`updatePrimary`); the numbers are on the `cannon_basic` module |
| Add or reorder outfitting bay groups | `data/outfitting.js` (`MODULE_GROUPS`)          |
| Add a paint bay to Appearance        | `data/outfitting.js` (`APPEARANCE_SLOTS`), drawn by `appearanceHtml()` in `ui/screens.js` |
| Change the ship in the Outfitting view| `render/shipviewer.js` (camera, lights, framing); `ui/outfitting.js` (page, input) |
| Change the pause menu                | `ui/pause.js`, styles under "Pause overlay" in `styles.css` |
| Change colours or layout of any UI   | `styles.css` (sections are labelled)           |
| Add a sound                          | `core/audio.js` (`tone`, `nz`, or a new graph) |
| Change what gets saved               | `state/profile.js` (bump `SAVE_VERSION`, add a migration) |
| Change the in-flight power readout   | `ui/hud.js` (the power block) and `#pw` in `src/index.html`, styles under "Flight HUD" |
| Add tests                            | `tests/` (`*.test.mjs`, run by `npm test`)     |

## File map

```
src/main.js            boot, action handling (lock, weapon, dock, pause), frame loop
src/index.html         page shell: HUD elements, outpost panel, hint text
src/styles.css         all styling, in labelled sections
src/data/              tuning numbers and content tables (ships, items, weapons, station, contracts, sectors, camera, outfitting bays and paint slots, modules)
src/util/              events.js (bus), rng.js (seedable random), math.js (vectors, helpers)
src/core/              audio.js (synth + mute), input.js (keys -> named actions)
src/state/             state.js (runtime), profile.js (saved data), storage.js (slots, codes)
src/sim/               player, power, drive, fitting, weapons, combat, ai, asteroids, targeting, economy, contracts, session, sectors, effects, world
src/render/            scene.js (including one group per sector), models.js, camera.js, warpfx.js, shipviewer.js (Outfitting)
src/ui/                hud.js, menu.js (button actions), screens.js (outpost HTML), outfitting.js (ship window), picker.js (open bay), pause.js, warpflash.js
tests/                 profile.test.mjs (saves, RNG), content.test.mjs (data completeness)
docs/                  this file, HOW_TO_ADD.md, AI_PROMPTS.md, CHANGELOG.md
```

Each `src/` folder also has its own short `README.md`.

## Conventions

- **Data tables use short keys.** Ships: `n` name, `d` description, `spd`, `hull`, `sh`
  and so on (each key is explained at the top of the file). Items: `n`, `v`.
  Contracts: `n` count, `r` reward, `o` ore, `p` progress. Keep the short keys when adding entries.
- **Tuning numbers go in `src/data/`.** Constants private to one system (ranges, timers)
  may sit at the top of that file with a comment.
- **`matrixWorld` is last frame's transform.** three.js only refreshes it when the scene is
  drawn, so `object.localToWorld(v)` during the frame loop silently uses where the object was
  one frame ago — an error that grows with speed. This is what made the chase camera trail
  further the faster the ship flew. Build world points from `position` and `quaternion` by hand
  when the result matters (see `render/camera.js`).
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
- **Shields come from the shield module, not the hull.** `sim/shield.js` reads `sh` (points),
  `regen` (points a second) and `delay` (seconds without a hit) and writes `state.shield` plus
  `P.shMax`. Any hit stamps `P.last` (in `hurt()`), and the recharge stays off until that was
  `delay` seconds ago; then it runs at full `regen`. No shield module means `P.shMax` is 0 and
  every hit goes to the hull. Later shield types with special behaviour (recharging under fire)
  are extra fields read by `updateShield()` — nothing outside that file changes. Shields also cost
  power: a flat `draw` MJ/s (2 on the basic module) all the while they are up, reported through
  `setDraw("shield", ...)` so `state.power.draw` stays the whole ship's bill. When the ship cannot
  pay that (no plant, flat cells) they bleed away at `drain` points a second and stay at 0 until
  the power comes back.
- **Guns come from the primary bays, not the hull.** A gun is a module in the `primary`
  group (`cannon_basic`: `dmg` a shot, `rate` shots a second, `bspd` bullet speed, `draw` MJ/s).
  `sim/guns.js` turns the fitted bays into `state.guns`, one entry per gun in bay order, and
  `updatePrimary()` in `sim/weapons.js` fires them all on left click, each on its own
  `1 / rate` cooldown, from its own barrel (`-1.8 + 3.6 * i` metres across the nose). The bay
  index is the only difference between the two bays: the same module behaves the same in
  either one, and there is no separate key for either. The gun's damage is multiplied by the
  hull's `dmg` (1 on the Wasp, 0.8 on the Prospector, 1.8 on the Bulwark), so the module figure
  is the Wasp's number. While the trigger is held and the guns are firing they report
  `setDraw("guns", draw * guns fitted)`; `hasPower()` decides whether they may fire at all, the
  same rule the thrusters follow. `state.flight.gunCd` holds one cooldown per fitted gun and
  `state.flight.gunsOn` says whether they fired this frame.
- **`FLIGHT` in `data/ships.js` still scales every ship at once**: `turn` multiplies the
  drive's turn rate, and `strafe` / `lift` / `reverse` are fractions of the drive's `spd`. The
  main drive and its 2x boost are the only directions that reach full speed.
- **Fitting lives in one place.** `sim/fitting.js` is the only code that writes
  `profile.loadout` or `profile.modules`, and it refreshes ship power after every change.
  Anything else that changes a bay must go through it, or the ship keeps the old numbers.
- **Outpost actions** are functions in `ACTIONS` in `ui/menu.js`. A button carries
  `data-a="actionName"` and optionally `data-b="argument"`. After each click the panel
  re-renders and the game autosaves.
- **Economy and contract functions** change `state.profile` and may return a message
  string, which the panel shows as a green toast.
- **Screens are pure functions** that return an HTML string from the current state.
  They never change state.
- **Anything that accumulates must be multiplied by `dt`.** A constant added per frame
  (`camera.rotateZ(0.05)` every frame, say) silently depends on the frame rate: harmless on a
  60 Hz screen, a visible bug on a 240 Hz one. This bit the warp roll once. Use
  `x += rate * dt`, or steer toward a target with `1 - Math.exp(-k * dt)`.
- **The Outfitting ship has its own renderer.** The outpost panel is HTML sitting on top
  of the game canvas, so a view inside it needs its own canvas and WebGL context
  (`render/shipviewer.js`). The panel rebuilds its HTML on every click, which takes that
  canvas out of the page without destroying it; `ui/outfitting.js` puts the same canvas
  back into `#shipview` after each render. Do not create a renderer per render, and keep
  `id="shipview"` in `outfittingHtml`.
- **Sounds** are played with `tone()` / `nz()` from `core/audio.js` and respect mute
  automatically. UI sounds go through `uiSound()` and `hoverSound()`.
- **Text shown to the player** is written inline in the screen or action that shows it.
- **Save changes** follow the rules in "Save compatibility" below.

## Events

Systems talk through `util/events.js` instead of importing each other. The
current events and their payloads are listed at the top of that file. To react
to gameplay from a new feature, subscribe with `on(name, handler)`. For example:

```js
import { on } from "../util/events.js";
on("pirate-killed", () => { /* achievements, faction reputation, ... */ });
```

If you add an event, add it to the list at the top of `util/events.js` in the same change.

## State

- `state.profile` is the save: credits, ships, base, contracts and stats. It is written to disk on dock and on every menu action.
- Everything else in `state/state.js` is runtime. It is rebuilt when the game loads.
- Systems read `state.*` directly. There is no hidden global, so tests can build a state object and call a system.

## Replayability hooks

- `util/rng.js`: `random()` is the seedable random source. Call `setSeed(n)` and anything
  that uses `random()` or `R()` becomes reproducible. Today that covers the contract board
  and the audio noise buffers. See "Known gaps" for what still bypasses it.
- `data/contracts.js`: contract generators take a random source, so they can be seeded in the same way.

## Save compatibility

Storage keys (`tr1` for the autosave, `tr_s1`..`tr_s3` for slots) and the `TR1:` code prefix are unchanged from the prototype, so existing saves load. `sanitizeProfile` fills in defaults and clamps values, so older or partly corrupt saves still open.

When you change what is saved:

1. Add the field with a default in `newProfile()`.
2. Make `sanitizeProfile()` validate it (clamp numbers, drop unknown ids).
3. Raise `SAVE_VERSION` and add a line to the "Version history" comment.
4. If an old save needs converting rather than just defaulting, convert it in `sanitizeProfile()`.
5. Add a test in `tests/` that loads an old-shaped save.

## Known gaps (things to know before building on top)

These are real, current limits. None of them is a bug in play today.

- **Some randomness bypasses the seed.** `sim/ai.js`, `sim/combat.js` (loot drops) and
  `sim/asteroids.js` call `Math.random()` directly, so pirate waves, loot and some asteroid
  rolls ignore `setSeed`. Switching them to `random()` from `util/rng.js` makes them seedable
  with no change in unseeded play. Do this before building seeded sectors or daily challenges.
- **`sanitizeProfile` lists some things by name.** The three base modules (`store`, `hangar`,
  `refinery`) and the weapon flags (`beam`, `msl`) are written out in `state/profile.js`. A new
  base module or weapon needs a line there too. `tests/content.test.mjs` fails if a base module is missing.
- **There is one enemy type.** Pirate numbers (hit points, speeds, ranges, fire rate) sit inside
  `sim/ai.js`. Before adding a second enemy, move them into a new `src/data/enemies.js` (see HOW_TO_ADD.md).
- **Every hull flies the same today.** Thrusters set speed and turn, every hull ships with
  the same basic drive, and nothing on the hull modifies it yet. Hull character (a heavy
  Bulwark being slower) is meant to arrive as hull attributes multiplying `driveOf()`.
- **Only a handful of modules exist**: a powerplant, a power cell, basic thrusters and basic
  shields. They can be taken off and fitted again
  (`sim/fitting.js`, stored in `profile.modules`), but **nothing can be bought yet**, so
  storage only ever holds parts taken off a hull. The thrusters are the only thing that draws
  power (2 MJ/s flying, +1 MJ/s while the boost burns, a flat 20 MJ each time the boost lights;
  refilling the boost meter is free), so a basic plant out-produces the trickle and the cells
  stay near full unless the powerplant is removed.
- **One active contract at a time** (`profile.mission`), and contract tiers are fixed at 1 to 3
  (`generateContract` in `sim/contracts.js`, wording in `ui/screens.js`).
- **`pirate-killed` carries no payload.** When enemy types arrive, emit `{ kind }` so listeners can tell them apart.
- **Muting is not saved.** Sound starts on every time the game opens.
- **The sector you are in is not saved.** `state.sector` is runtime only, so you always launch
  in Tallow Reach. Only Tallow Reach has content: Kestrel Hollow is empty, and the outpost,
  planet and rocks are hidden (not deleted) while you are away, so the field comes back as
  you left it.
- **A warp takes the controls for about two seconds, but not the momentum.** The throttle is
  released and the stick eases to neutral (`WARP_COAST` in `data/sectors.js`), so the ship
  coasts down and unwinds its turn; weapons are offline for the whole sequence. Enemies keep
  shooting at you while it charges. Making the ship invulnerable during a warp, or letting
  enemies lose interest, is a deliberate design decision that has not been made yet.
- **There is no star map screen yet.** M cycles through `SECTOR_IDS` in order and names the
  destination in a centre-screen message. A screen for choosing a destination is a new tab
  (recipe 7) once there are more than two sectors.
- **One sector's geography is written into the code.** The field belongs to `FIELD_SECTOR`
  (`sim/world.js`), and the outpost is always at the origin of the sector whose `st` flag is
  true. A second populated sector needs those two made per-sector.
