# How to add things to Tallow Reach

Step-by-step recipes for the common kinds of change. Read
[ARCHITECTURE.md](ARCHITECTURE.md) first for the layers and conventions.

Each recipe says how much work it really is:

- **Data only**: edit a table, nothing else.
- **Data + small code**: a table entry plus a few lines elsewhere.
- **New system**: new files. Do these one at a time.

`npm test` checks the data tables (`tests/content.test.mjs`), so a missing field or a
forgotten second place usually fails the tests with a message saying what to fix.

---

## Before every change (checklist)

1. Read the `README.md` in each `src/` folder you will touch.
2. Make the change in `src/`. Never edit `game/tallow-reach.html` (it is generated).
3. Did the saved data change? Follow "Save compatibility" in ARCHITECTURE.md.
4. Add or update a test if the change has rules that can break.
5. Add a short entry at the top of `docs/CHANGELOG.md`.
6. Tell the user to run `npm run build` and `npm test`, and give them test steps.

---

## 1. A new ship (data only)

File: `src/data/ships.js`. Copy an existing entry and give it a new key. All of these
fields are required (the test checks them): `n d spd cargo hull sh dmg mine turn sc price col`.

The Hangar, the purchase rules, repairs and saves all read `SHIPS`, so the new ship
appears automatically. It uses the standard hull model coloured by `col` and sized by `sc`.

Optional: a visible add-on (like the Prospector's drill) goes in `buildPlayerShip(id)` in
`src/render/models.js`.

## 2. A new cargo item or ore

- **Item that is only sold or carried** (data only): add it to `ITEM` in `src/data/items.js`
  (`n` name, `v` value). Cargo, storage, the Base screen and saves pick it up. Old saves
  load with 0 of it.
- **Something that has to be found.** Items do not appear on their own:
  - *Ore in asteroids*: `spawnAsteroid()` in `src/sim/asteroids.js` chooses the ore from a roll
    and sets the glow colour. Add a band to both.
  - *Loot in crates*: `updateCrates()` in `src/sim/combat.js` gives `salv` or `core` only.
  - *Mine contracts for the new ore*: add it to `MINE_ORES` in `src/data/contracts.js`.

## 3. A new contract type (data + small code)

Contracts count progress through events. Example: "Recover N reactor cores".

1. `src/data/contracts.js`
   - add `"cores"` to `CONTRACT_TYPES`
   - add a generator to `CONTRACT` that returns `{ n, r }` (count and reward in credits)
   - add a line to `DESCRIBE` (see the code below)
2. `src/sim/contracts.js`: add a listener at the bottom (see the code below).
3. The board, the saved-game loader and the Contracts screen read the list, so no other file needs the type.

```js
// src/data/contracts.js
export const CONTRACT_TYPES = ["mine", "hunt", "salvage", "cores"];
// ... inside CONTRACT:
cores: tier => {
  const n = 1 + tier;
  return { n, r: n * 400 + 100 * tier };
},
// ... inside DESCRIBE:
cores: m => `Recover ${m.n} reactor cores`,

// src/sim/contracts.js (bottom of the file)
on("pickup", ({ item }) => progress("cores", () => item === "core"));
```

Making the thing *exist in the world* is separate code. Hunt contracts get raiders from
the spawner in `sim/ai.js`. Salvage crates are placed in `launch()` in `sim/session.js`.

Which events can drive progress: `mined`, `pickup`, `pirate-killed`, `docked`, `launched`
(payloads are listed at the top of `src/util/events.js`).

## 4. A new shop weapon (data + real code)

Adding to `SHOP_WEAPONS` in `src/data/weapons.js` makes it appear in the Shop and be
purchasable, but **it will not do anything** until code uses it:

- `buyWeapon()` in `sim/economy.js` has a message for the beam and the missile launcher only
- firing and switching are in `sim/weapons.js` (`setWeapon`, the primary and missile updates)
- the HUD line in `ui/hud.js` names the equipped weapon
- the weapon flag lives in `profile.wp`; `sanitizeProfile` keeps unknown flags

Plan it as a small system: data entry, flag, firing code, HUD text, test.

## 5. A new base module (data + small code)

1. `src/data/station.js`: add the module to `BASE_MODULES` (`n d max cost`) and give it a
   starting level in `BASE_DEFAULT`.
2. `src/state/profile.js`: add it to the `s.base = { ... }` block in `sanitizeProfile` so the
   level survives saving. Raise `SAVE_VERSION` and add a "Version history" line.
3. Give it an effect. The Base screen and `upgradeBase()` are generic, but a module does
   nothing until some rule reads its level (as `storageCap()` and `valueOf()` in `sim/economy.js` do).
4. The content test fails if step 2 is forgotten.

## 6. A new enemy type (new system, do the refactor first)

Today there is one raider and its numbers sit inside `sim/ai.js`.

1. Create `src/data/enemies.js` with a table like `ENEMY = { pirate: { hp: 70, hpPerTier: 25, speedFar: 125, ... } }`
   and move the constants from the top of `sim/ai.js` and from `spawnPirate` into it. Behaviour must not change. Test by playing a hunt contract.
2. Give each spawned enemy a `kind` field and read its numbers from `ENEMY[kind]`.
3. Emit `emit("pirate-killed", { kind })` from `killHostile` in `sim/combat.js` and add the payload to the event list in `util/events.js`.
4. Add the new type to the table, and a spawn rule in the spawner at the bottom of `updateEnemies`.
5. Models: `mkShip(color, scale, foe)` in `render/models.js`.

## 7. A new outpost screen (tab)

1. `src/ui/screens.js`: add `["x", "Name"]` to `TABS`, write `function nameHtml(ui)` that returns an HTML string, and list it in `SCREENS` under the same key.
2. Buttons in that HTML carry `data-a="actionName"` and optionally `data-b="argument"`.
3. `src/ui/menu.js`: add each action to `ACTIONS`. It can call a sim function and `toast("message")`.
4. If the screen shows saved data, see "Save compatibility".

## 8. A new key binding or in-flight action

1. `src/core/input.js`: add `KeyX: "actionName"` to `BINDINGS`.
2. `src/main.js`: add `case "actionName":` in the `on("action", ...)` handler. `playing` is true only while flying and not paused.
3. Mention the key in the hint in `src/index.html` and the controls text in `src/ui/screens.js`.

## 9. A new sound

`src/core/audio.js`: build it from `tone(f1, f2, duration, volume, wave)` and `nz(duration, filterFreq, volume)`,
and call it from the system that needs it. Mute and pause are handled for you. Sound is switched on and off only from the pause menu.

## 10. A new event and a listener

1. `emit("name", payload)` where it happens (the sim layer).
2. Add `name  payload  description` to the list at the top of `src/util/events.js`.
3. Listen with `on("name", handler)` wherever it is needed. Listeners must not import the emitter.

## 11. Story and scripted missions (new system)

There is no story system yet. Recommended shape, so it fits the current design:

- `src/data/story.js`: the chapters as data. Each step has an `id`, a `when` event (`"docked"`, `"pirate-killed"`, ...),
  an optional condition, the text to show, and an optional reward.
- `src/sim/story.js`: subscribes with `on(...)`, advances the player's step, shows text with `msg()`,
  and pays rewards through the profile. Keep its imports to `util/events.js`, `data/`, and `state/` so it can be tested without any 3D.
- Saved progress: a new `profile.story = { step: 0, flags: {} }`. That is a save change:
  default in `newProfile`, validate in `sanitizeProfile`, bump `SAVE_VERSION`.
- Show it: a "Log" tab (recipe 7) that lists unlocked entries.
- Test: build a state, `emit` the events in order, check the step advances (`tests/story.test.mjs`).
- Keep it separate from `profile.mission`. That slot holds the one active contract.

## 12. Seeded sectors and daily challenges (needs one cleanup first)

Some randomness ignores the seed. See "Known gaps" in ARCHITECTURE.md. First replace the
`Math.random()` calls in `sim/ai.js`, `sim/combat.js` and `sim/asteroids.js` with `random()` from `util/rng.js`,
then call `setSeed(n)` at the start of a run.

## 13. Tuning only

Change numbers in `src/data/`. Run `npm test`, rebuild, and play for a minute.

**Top speed and turn rate** belong to the thrusters, in `src/data/modules.js`
(`thruster_basic` today: `spd: 150`, `turn: 1.2`). `sim/drive.js` turns the fitted module into
`state.drive`, and the flight model and the chase camera read only that. To make a ship
faster, fit a different thruster module and do not put a raw speed in `sim/player.js`.

There is **no hull speed any more**: `SHIPS` has no `spd`/`turn` fields, and a ship whose
thruster bay is empty cannot move or turn at all (`driveOf()` gives 0 / 0 and
`hasDrive(state.drive)` is false). Keep it that way — the bays are what make a ship fly, and
`npm test` fails if a hull grows a speed of its own again. When hulls should handle
differently, add a multiplier in `sim/drive.js` on top of the thruster's numbers.

**Flight feel** is in the `FLIGHT` table at the top of `src/data/ships.js`:

| Field | What it does | Today |
| --- | --- | --- |
| `turn` | multiplier on the drive's turn rate | `0.7` (30% slower than the raw stat) |
| `strafe` | A/D speed, as a fraction of the drive's `spd` | `0.3` |
| `lift` | Space/C speed, as a fraction of the drive's `spd` | `0.3` |
| `reverse` | S (throttle below zero), as a fraction of the drive's `spd` | `0.3` |

**Camera position** is in `src/data/camera.js`, and is the only thing that decides how far
behind the ship the view sits:

| Field | What it does | Today |
| --- | --- | --- |
| `base` | distance behind the ship when it is standing still | `11` |
| `fast` | distance at full forward speed (throttle 1 plus boost) | `17` |
| `reverse` | distance at maximum reverse thrust | `10.5` |

The distance is linear in speed between those three points and is hard-capped at both ends, so
a faster ship cannot push the camera further back. The speed the trail compares against is the
fitted drive's `spd`, so it stays right when you change thrusters. Want the view tighter overall? Lower all
three. Want it to pull back more under boost? Raise `fast`. `npm test` checks that
`reverse < base < fast` and that the trail never doubles back.

Forward thrust and the Shift boost are **not** in this table: they are the drive's `spd` and
`2 x spd`, and they are the only directions that reach full speed. To make turning heavier
still, lower `turn` (0.6 = 40% slower). To give the ship stronger manoeuvring thrusters, raise
`strafe` / `lift` / `reverse` toward `1`.

## 14. A new sector (data + small code)

Sectors live in `src/data/sectors.js`. Each entry has `n` name, `d` description, `sn` arrival
point, and three flags: `st` has the outpost, `fd` has the asteroid field, `foes` allows
raiders. `SECTOR_IDS` is the order M warps through.

1. Add an entry to `SECTORS` and its id to `SECTOR_IDS` (where you put it in the list is where
   M goes next). `npm test` checks the fields and the warp cycle.
2. That is enough for an empty sector: the player arrives at `sn` and sees only stars.
3. If it needs its own scenery, build it into that sector's group in the render layer:
   `sectorGroup(id).add(mesh)`. Do not add scenery straight to `scene`, or it shows up in
   every sector. Only the starting sector has the outpost and planet today.
4. Anything that assumes the outpost is at the origin must check `st` first, the way
   `sim/player.js`, `sim/session.js`, `sim/targeting.js` and `ui/hud.js` do.
5. Rocks: `FIELD_SECTOR` in `sim/world.js` decides which sector owns the asteroid field, and
   `state.world.asteroids` only ever holds the current sector's rocks (they are parked
   otherwise). A second field therefore means a per-sector field list, not a second constant.
6. Do not make a second sector the start unless it has `st: true`: you dock there on boot.
7. The warp itself is timed by `WARP` in the same file and about two seconds long. The
   visuals follow those numbers: the 3D streaks (`render/warpfx.js`) and the overlay
   (`ui/warpflash.js`) read `state.warp.fx` and `state.warp.flash` every frame, so there are
   no durations to change anywhere else. Keep the overlay to plain gradients; a masked
   gradient across the whole screen halves the frame rate.
8. `WARP_COAST.steer` is how long the ship takes to stop turning once M is pressed, and
   `warpSteerEase(t)` in the same file is the curve (1 -> 0). The throttle is released
   instantly, so the speed bleeds off through the normal drag model in `sim/player.js`.

## 15. A new module group on the Outfitting screen (data only)

The Outfitting screen draws one card per entry in `MODULE_GROUPS`
(`src/data/outfitting.js`): a heading, a `filled / bays` count, one bay box per slot,
and the group's description. The list is split in half around the 3D ship, so the first
half sits on the left and the rest on the right. Nothing else needs to change.

1. Add `{ k, n, d, slots }` to `MODULE_GROUPS`: short id, name, one line about what the
   group decides, and how many bays. `npm test` fails if a field is missing, an id repeats,
   or a count is not a whole number of at least one.
2. Want a different number of bays on a big hull later? `slotsFor(g, shipId)` in the same
   file is the one place that decides it; the screen already asks through it.
3. The card look is `.mod` in `styles.css`. Every group uses it, so a new group matches
   the others without new CSS.

**Paint bays** are the same idea and live in the same file, as `APPEARANCE_SLOTS`
(`{ k, n }`). They are drawn by `appearanceHtml()` in `ui/screens.js`, always sit last in the
right-hand column under the hull group, and are clickable like module bays: the click rule is
`togglePaintPicker` in `ui/picker.js`, and the rectangle under the card is
`paintPickerHtml()`. It shows **No colours in storage** because no paint exists yet.

When paints arrive they need: a table of paints, a store in the save (the way
`profile.modules` holds spare parts), the list of stored colours drawn as squares inside
`paintPickerHtml`, a fitted paint per channel, and the counts in `appearanceHtml`. That is
save-format work, so bump `SAVE_VERSION` and add a migration as usual.

**Bay counts are per hull.** `SHIP_LAYOUTS` in the same file gives each hull its own
numbers; every hull is a copy of the Wasp's today. `layoutFor(id)` and `slotsFor(g, id)`
are the only readers, and a test fails if a hull is missing a group.

**Fitted modules** are saved in `profile.loadout[shipId][groupId]`, one entry per bay
(`null` = empty), written by `src/state/profile.js`. The power parts are fitted already;
see recipe 16 for adding another module, and recipe 17 for letting the player swap one.

## 16. A new module (data + the stat it feeds)

Modules live in `src/data/modules.js`:

```js
power_basic: { g: "power", n: "Basic powerplant", d: "Standard reactor.", mjps: 10 },
cell_basic:  { g: "cell",  n: "Basic power cell",  d: "Standard storage bank.", mj: 100 },
```

`g` is the module group it fits (`data/outfitting.js`), and the rest of the fields are the
stat that group uses: `mjps` for a powerplant, `mj` for a power cell, `spd`/`turn`/`draw`/
`boost`/`ign` for a thruster (top speed, turn rate, MJ/s while flying, extra MJ/s while the boost
burns, and the flat MJ slug spent when the boost lights), and `sh`/`regen`/`delay`/`draw`/`chg` for shields
(points held, points a second while recharging, the seconds without a hit before recharging
starts again, MJ/s used while they are up, and the extra MJ/s while they are filling). `npm test` checks the group exists, the
name and description are there, and the stat is a positive number.

1. Add the entry. Nothing appears in the world until it is fitted (see recipe 17), and the
   Outfitting screen already names any module found in a bay.
2. A hull is delivered with `STOCK_FIT` (`data/modules.js`): group id -> module ids in bay
   order. Put the module there to make it standard issue, or in a Hangar purchase later.
3. Make the stat do something. Power is done: `sim/power.js` sums `mjps` and `mj` into
   `state.power`, and `ui/hud.js` draws it. A new kind of stat needs its own system the same
   way: read the fitted modules, keep the result in `state.*`, and let the UI read that.
   A module that *uses* power rather than making it reports its demand with
   `setDraw("<name>", mjps)` (`sim/power.js`) and asks `hasPower()` before it does its work, the
   way the thrusters do in `sim/player.js` and the shields in `sim/shield.js`.
4. If the module changes a number the ship already has (top speed, hull, shields), do not
   write it into `SHIPS`; compute the effective value where it is used so removing the
   module puts the ship back the way it was. Shields are the worked example: `sim/shield.js`
   turns the module into `state.shield`, and with the bay empty the ship simply has none.

5. **Special kinds of shield.** A shield that behaves differently (for example one that keeps
   trickling back even under fire, at a reduced rate) is a new entry in `MODULES` with an extra
   field, say `live: 3` for points a second while being hit. `updateShield()` in
   `sim/shield.js` reads that field when it is there; the recharge delay, the cap and the HUD
   bar need no changes. Do not patch `sim/player.js` for it.

## 17. A module shop (the next step; fitting is already done)

Fitting and storage work: `sim/fitting.js` moves parts between `profile.loadout` and
`profile.modules`, and the Outfitting bays are clickable. What is missing is a way to
**obtain** a part, so storage today only holds what you have taken off a hull.

1. **Price.** Add `price` to the module entries in `data/modules.js`. The basic pair can
   stay at 0, meaning standard issue.
2. **Buy.** A function in `sim/economy.js` next to `buyWeapon`: check credits, take the
   money, `S.modules.push(id)`. Nothing else: the picker will show it the next time a bay
   of that group is opened.
3. **Show it.** A shop section listing `MODULES` grouped by `g`, with name, the stat and
   the price, and a `data-a="mb"` button per module. `ui/screens.js` for the markup,
   `ui/menu.js` `ACTIONS` for the click. `ui/screens.js` already has `moduleStat(m)` for
   the one-line number.
4. **Storage limits** if you want them: cap `profile.modules.length` in
   `sim/economy.js` and in `sanitizeProfile`, and show the count in the panel.
5. **Do it one group at a time.** The power group is the one with parts in it, so start
   there: buy a better powerplant, fit it, watch the HUD figure change.
