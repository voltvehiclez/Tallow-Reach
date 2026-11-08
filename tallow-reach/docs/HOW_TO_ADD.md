# How to add things to Tallow Reach

> **These recipes describe the code as it is today.** Several will change during the refactor in
> [REFACTOR_PLAN.md](REFACTOR_PLAN.md): enemies (recipe 6) became data in step 1, loot in step 3,
> items in step 4; shops (4, 17) became data in step 5; sectors (14) in steps 10 to 12; missions and
> story (3, 11) in steps 13 to 15. A step that changes a recipe must rewrite it in the same change.
> If a recipe here says "do the refactor first", check [ROADMAP.md](ROADMAP.md) to see whether that
> step is done.


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
5. Add a short entry at the top of `docs/CHANGELOG.md`. If that leaves more than 15 full entries in
   it, move the oldest ones to `docs/CHANGELOG_ARCHIVE.md` until 10 remain, and add one index
   line for each at the top of the "Older entries" list (see "Keeping the docs scalable" in
   ARCHITECTURE.md). Never delete history.
6. Tell the user to run `npm run build` and `npm test`, and give them test steps.

---

## 1. A new ship (data only)

File: `src/data/ships.js`. Copy an existing entry and give it a new key. All of these
fields are required (the test checks them): `n d cargo dmg mine sc price col`.
Every hull is the same ship apart from its `cargo` (the hold, in m³: one cargo unit = 1 m³) —
`dmg`, `mine`, `sc` and `price` are the same on all of them and a test enforces it. Hull HP
come from the fitted hull module (`hull_basic`, `sim/hull.js`), not from the hull.
Ship-specific bonuses will come later as new hull attributes.

The Hangar, the purchase rules, repairs and saves all read `SHIPS`, so the new ship
appears automatically. It uses the standard hull model coloured by `col` and sized by `sc`.

Optional: a visible add-on (like the Prospector's drill) goes in `buildPlayerShip(id)` in
`src/render/models.js`.

## 2. A new item: ore, salvage or a trade good (data only)

Every item lives in `ITEMS` in `src/data/items.js`. One line is all it takes:

```js
voidglass: { n: "Void glass", cat: "salvage", v: 120, vol: 2 },
```

- `n` name (the screens use it everywhere), `cat` one of `ITEM_CATEGORIES` (`ore`, `salvage`,
  `module`, `ammo`, `consumable`, `trade`), `v` credits a unit sells for (leave it out and the item
  cannot be sold at all — every sellable item has one), `vol` m³ a unit takes up (1 if you leave it out), `st` most that fit in one stack
  (no limit if you leave it out — nothing uses a limit yet).
- Holds, the station's storage, moving, selling, the Base screen, the Inventory tab and the save all
  read the catalogue, so nothing else changes. Old saves simply have none of it, and `npm test`
  checks the entry is complete.

**Nothing appears in the world on its own.** To make the new item findable:

- *Ore in rocks*: add a weighted line to the `asteroid` table in `src/data/loot.js` (recipe 18), and
  give the ore a glow colour in `spawnAsteroid()` in `src/sim/asteroids.js` — that one line is the
  only place a rock's colour is chosen.
- *Loot from kills*: add a line to a table in `src/data/loot.js` (recipe 18).
- *Mine contracts for a new ore*: add its id to `MINE_ORES` in `src/data/contracts.js`.
- *Sold at the station*: add a row to Meridian in `src/data/shops.js` (recipe 4).

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

Making the thing *exist in the world* is separate code. A hunt contract names the enemy it
wants with `e` in `data/contracts.js` and the spawner in `sim/ai.js` brings that enemy in.
Salvage crates are placed in `launch()` in `sim/session.js`.

Which events can drive progress: `mined`, `pickup`, `enemy-killed`, `docked`, `launched`
(payloads are listed at the top of `src/util/events.js`).

## 4. Something a shop sells, or a new trader (data only)

Shops are data: `src/data/shops.js`. Nothing in the screen or the sim names a row, so a new
line is a new thing for sale. `npm test` (`tests/shops.test.mjs`) checks every row names a real
item and has a price.

**A row at Meridian** — add one line to `SHOPS.meridian.stock`:

```js
{
  id: "power_basic",         // must exist in data/items.js (a module: stats in data/modules.js)
  price: 1,                  // credits for one
  n: "Basic powerplant",     // the row's name on screen
  d: "Power. Standard reactor: 10 MJ/s for the whole ship.",   // the small print
},
```

- The order in the file is the order on screen, and every row appears exactly once. There is no
  second "already owned" list: a part the ship flies with is either on sale or not mentioned.
- `Takes N m³.` and `You own N.` are worked out for you from the catalogue.
- A module has to be fitted before it does anything, so buying one puts it in the station's
  inventory (the Inventory tab moves it to a ship, Outfitting fits it).
- Two shops can price the same part differently: the price is on the row, not the item.

**Make a row run out.** Add `max`, and the screen shows `N left`, greys out at zero, and buying
is refused:

```js
{ id: "core", price: 500, n: "Reactor core", d: "Salvage. Worth a fortune to the right buyer.", max: 3 },
```

How much is left is **session state** (`state.shops`), not saved, and starts again from `max`.
`setShopStock(shopId, itemId, n)` in `sim/economy.js` is the hook a restock timer, a restock
event or a random roll calls later. Restocking itself is deliberately not built yet.

**Hide the "You own N" count** on a part every hull is delivered with: add `own: false`
(the count would include the stock fit of hulls the player has not bought).

**A second trader or station.** Add an entry to `SHOPS` with its own `n`, `d` and `stock`, then
point the counter at it. Today `OUTPOST_SHOP` in `data/shops.js` names Meridian's shop for the
whole outpost, because there is one station; when sectors become data (step 10) a sector will name
its shop and `ui/screens.js` passes that id to `shopList()`. `shopList(id)` and
`buyItem(id, itemId)` already take a shop id, so a trader needs data only.

**What a purchase does** — `buyItem(shopId, itemId, qty = 1)` in `sim/economy.js`: it checks the
shop, the row, the credits, what is left and the station's room, then takes the money and stores
the items through `sim/inventory.js` (one place writes stocks). A module with `ammo` in
`data/modules.js` (the missile pod, `ammo: 8`) tops the ship's rack up to that many, never down.

## 5. A new base module (data + small code)

1. `src/data/station.js`: add the module to `BASE_MODULES` (`n d max cost`) and give it a
   starting level in `BASE_DEFAULT`.
2. `src/state/profile.js`: add it to the `s.base = { ... }` block in `sanitizeProfile` so the
   level survives saving. Raise `SAVE_VERSION` and add a "Version history" line.
3. Give it an effect. The Base screen and `upgradeBase()` are generic, but a module does
   nothing until some rule reads its level (as `storageCap()` and `valueOf()` in `sim/economy.js` do).
4. The content test fails if step 2 is forgotten.

## 6. A new enemy type (data only, plus at most one behaviour function)

An enemy is an entry in `src/data/enemies.js`. The sim (`sim/ai.js`) spawns it with
`spawnEnemy(id, pos)`, builds its model with the def's `col` and `scale` (`mkShip(col, scale, true)`
in `render/models.js`), and runs the behaviour its `ai` field names.

1. Copy the `raider` entry in `src/data/enemies.js` and change what you want: `n` name,
   `pl` plural name (used in contract wording), `hp` Hull HP, `col` colour, `scale` size,
   `f` faction, `spdFar`/`spdNear`/`spdOrbit`/`circleAt` how it closes and circles, the ranges,
   `fireDelay`/`fireGap`/`dmg`/`bspd` for its gun, `spawnDist` how far away it appears.
2. Give it a **new** id (the key). `npm test` (`tests/content.test.mjs`) fails if a field is
   missing or its `f` is not a faction in `src/data/factions.js`.
3. Make it appear. Today the spawner at the bottom of `updateEnemies` (`sim/ai.js`) brings in the
   enemy a hunt contract names (`e` in `src/data/contracts.js`) and wandering raiders. Sector
   encounter tables (refactor step 12) will place enemies by data; until then, spawning a new type
   means a line in that spawner.
4. A **new kind of behaviour** (not just new numbers) is `AI_BEHAVIOURS` in `sim/ai.js`: one
   function `(e, def, toTarget, dist, dt)` that moves `e`, then name it in the def's `ai` field.
   The raider uses `chase`.
5. What it **drops** is its `loot` field: a table id from `src/data/loot.js`. See recipe 18.
5. A new faction is one entry in `src/data/factions.js` (`n` name, `d` description).
6. Test it: `tests/enemies.test.mjs` spawns enemies headlessly (`tests/headless.mjs` runs sim code
   with the screen and sound stubbed out). Copy that test to check a second type quickly.

## 7. A new outpost screen (tab)

1. `src/ui/screens.js`: add `["x", "Name"]` to `TABS`, write `function nameHtml(ui)` that returns an HTML string, and list it in `SCREENS` under the same key.
2. Buttons in that HTML carry `data-a="actionName"` and optionally `data-b="argument"`.
3. `src/ui/menu.js`: add each action to `ACTIONS`. It can call a sim function and `toast("message")`.
4. If the screen shows saved data, see "Save compatibility".

## 8. A new key binding, a new control, or an in-flight action

There are two kinds of input, and they are added differently.

**a) A one-off press** (dock, warp, pause, switch weapon):

1. `src/core/input.js`: add `KeyX: "actionName"` to `BINDINGS`.
2. `src/main.js`: add `case "actionName":` in the `on("action", ...)` handler. `playing` is true only while flying and not paused.
3. Mention the key in the hint in `src/index.html` and the controls text in `src/ui/screens.js`.

**b) A control held while flying** (throttle, strafe, fire, boost, brake...): this is the sim's
input, so it goes through the control record and **never through a key code in `src/sim/`**.

1. `src/state/controls.js`: add the field to `neutralControls()` (an axis starts at 0, a held flag
   at `false`) and describe it in the comment at the top of the file. **If you add an axis, the
   sim reads the number; do not read `keys` in `sim/`.** Renaming or removing a field is a change
   to the co-op contract — say so in `docs/REFACTOR_PLAN.md` step 6/8 as well.
2. `src/core/input.js`: add the key to `HELD`, pointing at that field
   (`KeyR: { axis: "lift", amount: 1 }`, or `{ flag: "boost" }`). `syncControls()` fills the record
   from the held keys after every change, so there is no other wiring.
3. `src/sim/…`: read `state.controls.<field>` where the rule lives.
4. `tests/layers.test.mjs` will fail if a `sim/` file mentions `keys`/`pointer`, or if `HELD` sets a
   field the record does not have — that is the check, not an obstacle.

## 9. A new sound (data + two lines)

The sim never plays a sound. It says **what happened**; `src/core/audio.js` decides what that
sounds like. Two steps, always both:

1. **`src/core/audio.js`**: add an entry to `SFX`, named however you like
   (`"cannon"`, `"ore-gained"`). Build it from `tone(f1, f2, duration, volume, wave)` and
   `nz(duration, filterFreq, volume)`. An entry is `rest => { ... }`, so a sound can depend on the
   moment: `explosion: ({ count }) => { if (count > 10) nz(1.2, 500, 0.5); }` only rumbles for big
   bursts, and `"warp-charge": ({ dur }) => warpCharge(dur)` follows the warp's own length.
2. **Where it happens, in `src/sim/`**: `emit("sfx", { name: "cannon" })`, plus any extra fields the
   entry reads (`{ name: "explosion", count }`). Sound is in the sim's vocabulary, not its imports.

`tests/layers.test.mjs` checks both directions: a sound the sim emits must have an `SFX` entry, and
an `SFX` entry must be emitted somewhere. It also fails if a `src/sim/` file imports
`core/audio.js`, so never call `tone()`/`nz()` from the sim.

Mute and pause are handled inside `tone()`/`nz()`. Sound is switched on and off only from the pause
menu. Sounds a *screen* makes (buttons, hovers) are not game sounds: they call `uiSound()` /
`hoverSound()` directly from `ui/`.

## 10. A new event and a listener

1. `emit("name", payload)` where it happens (the sim layer).
2. Add `name  payload  description` to the list at the top of `src/util/events.js`.
3. Listen with `on("name", handler)` wherever it is needed. Listeners must not import the emitter.

`sfx` is the worked example (step 6a): the sim emits it at eleven places, and `core/audio.js`
subscribes once. Payloads should carry **ids and plain numbers**, not objects with behaviour — that
is what lets a listener (sound, a mission, a network snapshot) work without knowing the emitter.

## 11. Story and scripted missions (new system)

There is no story system yet. Recommended shape, so it fits the current design:

- `src/data/story.js`: the chapters as data. Each step has an `id`, a `when` event (`"docked"`, `"enemy-killed"`, ...),
  an optional condition, the text to show, and an optional reward.
- `src/sim/story.js`: subscribes with `on(...)`, advances the player's step, shows text with `msg()`,
  and pays rewards through the profile. Keep its imports to `util/events.js`, `data/`, and `state/` so it can be tested without any 3D.
- Saved progress: a new `profile.story = { step: 0, flags: {} }`. That is a save change:
  default in `newProfile`, validate in `sanitizeProfile`, bump `SAVE_VERSION`.
- Show it: a "Log" tab (recipe 7) that lists unlocked entries.
- Test: build a state, `emit` the events in order, check the step advances (`tests/story.test.mjs`).
- Keep it separate from `profile.mission`. That slot holds the one active contract.

## 12. Seeded sectors and daily challenges

All gameplay randomness already goes through `util/rng.js` (refactor step 2), so this is now just
using it:

1. Call `setSeed(n)` at the start of a run to make the whole game reproducible, and
   `setSeed(null)` to go back to ordinary play.
2. For anything that must regenerate from its own seed — a sector, a wormhole instance, a daily
   challenge — build a generator with `makeRng(seed)` and pass it in. Do **not** use the shared
   `random()` for that: it depends on how many dice the rest of the game rolled first, so the same
   sector seed would give a different sector in a different run.
3. `tests/rng.test.mjs` fails and names the file and line if anything in `src/sim/` or `src/data/`
   calls `Math.random()` directly. `R(a, b)` from `util/math.js` is the shared stream in a range.

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
see recipe 16 for adding another module and recipe 17 for putting one on sale.

## 16. A new module (data + the stat it feeds)

Modules live in `src/data/modules.js`:

```js
power_basic: { g: "power", n: "Basic powerplant", d: "Standard reactor.", mjps: 10 },
cell_basic:  { g: "cell",  n: "Basic power cell",  d: "Standard storage bank.", mj: 100 },
```

`g` is the module group it fits (`data/outfitting.js`), and the rest of the fields are the
stat that group uses: `mjps` for a powerplant, `mj` for a power cell, `spd`/`turn`/`draw`/
`boost`/`ign` for a thruster (top speed, turn rate, MJ/s while flying, extra MJ/s while the boost
burns, the flat MJ slug spent when the boost lights) plus `bmax`/`buse`/`bfill` for its boost tank
(units held, units a second burned while boosting, units a second refilled), and `sh`/`regen`/`delay`/`draw`/`drain` for shields
(Shield HP held, Shield HP a second while recharging, the seconds without a hit before recharging
starts again, the flat MJ/s they use while up, and the Shield HP a second they lose when the ship
cannot supply that), and `dmg`/`rate`/`bspd`/`draw` for a gun in a `primary` bay (damage a shot,
shots a second per barrel, bullet speed, MJ/s while the trigger is held) plus an optional `barrels`
for linked barrels fired side by side on every shot (default 1), and `period`/`range`/`draw` for a
beam in a `primary` bay (seconds of uninterrupted contact per ore before the hull's mine multiplier,
metres it reaches, MJ/s while cutting). Every module also needs `vol`, the m³ it takes up in a
ship's hold or in the station's storage (a whole number, at least 1). `npm test` checks the group
exists, the name and description are there, the volume is set, and the stat is a positive number.

1. Add the entry to `MODULES` — **and one line to `ITEMS` in `src/data/items.js`**:
   `beam_basic: { cat: "module", v: 540 }`. The `v` is what a **spare** one sells for: 60% of its
   shop price, never below 1 credit (a test checks the two agree, so set both together). A module is an item before it is a part, which is what lets it be
   carried, stored and moved like anything else; its name, volume and stats stay in `MODULES`.
   `npm test` names any module that has no item entry. Nothing appears in the world until it is
   fitted the usual way, and the Outfitting screen already names any module found in a bay.
2. A hull is delivered with `STOCK_FIT` (`data/modules.js`): group id -> module ids in bay
   order. Put the module there to make it standard issue, or in a Hangar purchase later.
3. Make the stat do something. Power is done: `sim/power.js` sums `mjps` and `mj` into
   `state.power`, and `ui/hud.js` draws it. A new kind of stat needs its own system the same
   way: read the fitted modules, keep the result in `state.*`, and let the UI read that.
   A module that *uses* power rather than making it reports its demand with
   `setDraw("<name>", mjps)` (`sim/power.js`) and asks `hasPower()` before it does its work, the
   way the thrusters do in `sim/player.js`, the shields in `sim/shield.js` and the guns in
   `sim/weapons.js`. A new name must also be added to `state.power.use` (see `state.js`).
4. If the module changes a number the ship already has (top speed, hull, shields), do not
   write it into `SHIPS`; compute the effective value where it is used so removing the
   module puts the ship back the way it was. Shields are the worked example: `sim/shield.js`
   turns the module into `state.shield`, and with the bay empty the ship simply has none.

5. **More primary weapons.** `cannon_basic` is the worked example of a gun: give the entry
   `dmg`, `rate`, `bspd` and `draw` (plus `barrels` if it fires linked bolts side by side) and
   `sim/guns.js` picks it up with no code change, because
   it reads every module in the `primary` group that has a `dmg`. Put it in `STOCK_FIT.primary`
   to make it standard issue, and it can go in either primary bay. A gun that behaves
   differently (burst fire, a shot that costs a slug of energy) needs its own field and a line
   in `updatePrimary()` in `sim/weapons.js`; nothing outside that file changes.

6. **Special kinds of shield.** A shield that behaves differently (for example one that keeps
   trickling back even under fire, at a reduced rate) is a new entry in `MODULES` with an extra
   field, say `live: 3` for Shield HP a second while being hit. `updateShield()` in
   `sim/shield.js` reads that field when it is there; the recharge delay, the cap and the HUD
   bar need no changes. Do not patch `sim/player.js` for it.

## 17. A better part: a new tier of module, on sale (data only)

This was "a module shop" before refactor step 5. The shop exists now, so a better powerplant, a
second cannon or a new shield is one data file plus one shop row — no code.

1. **The part.** Add it to `MODULES` in `src/data/modules.js`, copying the basic entry and
   changing the numbers: same `g` (the bay group it fits), a new `vol`, `n`, `d`, and the stat
   that group uses (`mjps`, `mj`; thruster `spd`/`turn` and its power appetite; shield
   `sh`/`regen`/`delay`/`draw`/`drain`; hull `hp`; primary `dmg`/`rate`/`bspd`/`draw`/`barrels`;
   beam `period`/`range`/`draw`; secondary `dmg`/`cap`/`cd`, plus `ammo` if buying it should hand
   out missiles). A module may only carry the stats its group uses.
2. **The item.** Add `id: { cat: "module" }` to `ITEMS` in `src/data/items.js`. `npm test` names
   the module if you forget: a part you cannot carry is not a part.
3. **The sale.** Add a row to Meridian in `src/data/shops.js` (recipe 4). Add `max` if the shop
   should only have a few.
4. **Nothing else.** The picker lists it in the right bay automatically (`ui/screens.js`,
   `sim/fitting.js`), `moduleStat()` gives the one-line number in the bay, and the systems that
   read the module (`sim/power.js`, `drive.js`, `shield.js`, `hull.js`, `guns.js`) already read
   the fields.

`npm test` then checks the tables agree (`tests/content.test.mjs`) and the row is complete
(`tests/shops.test.mjs`). Anything a hull's combat or mining multiplier would scale is 1 on every
hull today: do not put per-hull bonuses on a part.

## 18. What something drops, or what a rock is made of (data only)

Loot is data (`src/data/loot.js`), rolled by the pure `src/sim/loot.js`. Nothing about a drop is
written in the game code.

A table is one of two kinds:

- **`kind: "drops"`** — every line is rolled on its own. `w` is the chance (0 to 1, default 1 =
  always), `c` is `[min, max]` how many, and `j` is how far the crate scatters (default 8 m, `0` =
  exactly on the wreck). Used for enemies.
- **`kind: "pick"`** — exactly one line is chosen, weighted by `w`. Used for the ore a rock is made
  of.

Steps:

1. Add or edit an entry in `LOOT_TABLES` in `src/data/loot.js`. Every `i` must be an item id from
   `src/data/items.js` (a new item first: recipe 2).
2. Point an enemy at it with `loot: "<table id>"` in `src/data/enemies.js`.
3. For a brand-new table used by something else (a crate in the field, an encounter), call
   `rollLoot("<table id>")` for drops or `pickLoot("<table id>")` for a single weighted pick. Both
   use the seeded random source, so a run repeats.
4. `npm test` checks every item id, every weight and the odds of every table (`tests/loot.test.mjs`
   rolls each table 10,000 times), so a typo or a missing item fails the tests, not the game.

Today: a killed raider drops one or two salvage crates (50/50) and a reactor core on one kill in
ten; a rock is about 62% ferrite, 30% cobalt, 8% voidite.
