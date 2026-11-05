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
| Tune a gun, missile or the beam      | `data/weapons.js`                              |
| Add or price a shop weapon           | `data/weapons.js` (`SHOP_WEAPONS`)             |
| Change base module costs             | `data/station.js`                              |
| Add a contract type                  | `data/contracts.js` (list, generator, wording), plus a listener in `sim/contracts.js` |
| Add a sector or change the warp order| `data/sectors.js`; see HOW_TO_ADD.md recipe 14 |
| Change the warp timing or its lockout | `WARP` in `data/sectors.js` (the look itself follows those numbers) |
| Change pirate behaviour              | `sim/ai.js`                                    |
| Change flight feel                   | `sim/player.js` (`flight`)                     |
| Rebind keys                          | `BINDINGS` in `core/input.js`                  |
| Add an outpost screen (tab)          | `ui/screens.js` (`TABS`, `SCREENS`, a HTML function) and `ui/menu.js` (`ACTIONS`) |
| Change the pause menu                | `ui/pause.js`, styles under "Pause overlay" in `styles.css` |
| Change colours or layout of any UI   | `styles.css` (sections are labelled)           |
| Add a sound                          | `core/audio.js` (`tone`, `nz`, or a new graph) |
| Change what gets saved               | `state/profile.js` (bump `SAVE_VERSION`, add a migration) |
| Add tests                            | `tests/` (`*.test.mjs`, run by `npm test`)     |

## File map

```
src/main.js            boot, action handling (lock, weapon, dock, pause), frame loop
src/index.html         page shell: HUD elements, outpost panel, hint text
src/styles.css         all styling, in labelled sections
src/data/              tuning numbers and content tables (ships, items, weapons, station, contracts, sectors, camera)
src/util/              events.js (bus), rng.js (seedable random), math.js (vectors, helpers)
src/core/              audio.js (synth + mute), input.js (keys -> named actions)
src/state/             state.js (runtime), profile.js (saved data), storage.js (slots, codes)
src/sim/               player, weapons, combat, ai, asteroids, targeting, economy, contracts, session, sectors, effects, world
src/render/            scene.js (including one group per sector), models.js, camera.js, warpfx.js
src/ui/                hud.js, menu.js (button actions), screens.js (outpost HTML), pause.js, warpflash.js
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
- **Flight feel has one home: the `FLIGHT` table in `data/ships.js`.** It scales every hull at
  once — `turn` (multiplier on each ship's `turn` stat), and `strafe` / `lift` / `reverse`
  (fractions of each ship's forward `spd`). The main drive and its 2x boost are the only
  forward speeds that reach full `spd`. Do not put a raw speed in `sim/player.js`; add a field
  to `FLIGHT` instead, or the ships stop agreeing with each other.
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
