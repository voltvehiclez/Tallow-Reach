# How to add things to Tallow Reach

> **These recipes describe the code as it is today.** Several will change during the refactor in
> [REFACTOR_PLAN.md](REFACTOR_PLAN.md): enemies (recipe 6) became data in step 1, loot in step 3,
> items in step 4; shops (4, 17) became data in step 5; places (14) in steps 10 to 12; missions and
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
whole outpost, because there is one station; since step 10 a station feature names
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
`spawnEnemy(id, pos)` and runs the behaviour its `ai` field names. Since refactor step 7a a hostile
is **plain data** (`sim/enemy.js`), and `render/views.js` builds its model from the def's `col` and
`scale` (`mkShip(col, scale, true)` in `render/models.js`). **You never write mesh code for an
enemy**: a new type is a data entry, and it is drawn automatically.

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
   The raider uses `chase`. Move an enemy with `enemyPos(e)` for its position and `turnEnemy(e,
   target, k)` to point it — never a mesh: an enemy has none (step 7a).
5. What it **drops** is its `loot` field: a table id from `src/data/loot.js`. See recipe 18.
5. A new faction is one entry in `src/data/factions.js` (`n` name, `d` description).
6. Test it: `tests/enemies.test.mjs` spawns enemies headlessly (`tests/headless.mjs` runs sim code
   with the screen and sound stubbed out), and `tests/headless-sim.test.mjs` flies one for 600
   ticks. Copy either test to check a second type quickly.

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
3. `src/sim/…`: read the acting player's `controls.<field>` where the rule lives. Until
   step 8c is complete, `state.player` / `state.controls` are compatibility aliases for the local
   player, not independent global records.
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
   A listener in `render/` is how drawing follows the sim: `render/views.js` listens for
   `enemy-spawned` / `enemy-removed` (step 7a) and for `entity-spawned` / `entity-removed`, which
   `sim/entity.js` emits for every bullet, missile, crate, spark and rock (step 7b).

`sfx` is the worked example (step 6a): the sim emits it at eleven places, and `core/audio.js`
subscribes once. Payloads should carry **ids and plain numbers**, not objects with behaviour — that
is what lets a listener (sound, a mission, a network snapshot) work without knowing the emitter.

## 11. Story and scripted missions

Step 13a/13b provides the shared foundation. A mission file under `src/data/missions/` is plain data
with `{ id, title, kind: "contract" | "story", requires, steps, rewards, fails }`; it names ids but
never imports simulation or rendering code. Active records live in `profile.missions`, and
`sim/missions.js` advances the current step from events. The runner supports contract objectives
`kill`, `mine`, `collect`, `reach`, `deliver` and `survive`, plus story `dialogue`, `script`, `wait`,
`flags` and `parallel` steps. Dialogue choices can set remembered `profile.flags` and jump to a named
step; scripts can request a wave/ship, set saved per-place state, give/take an item, play a sound or
warp a pilot. The old singular `profile.mission` property is only a non-enumerable compatibility view
of the first active mission; do not build new code around it.

To add a contract, edit `src/data/missions/contracts.js`: add its type, generator, one-line wording,
and a template step, then expose it through the contract board facade in `src/sim/contracts.js`.
Preserve compact compatibility fields if old saves or UI callers need them. To add a story mission,
add a data record with `kind: "story"`; use named step ids for `next`/`then`/`else`/choice targets,
keep all story text, portrait ids, log guidance and action ids in the data file, and declare `fails.on`
plus an outcome for death, sector departure or timeout when needed. `The Border Signal` in
`src/data/missions/story.js` is the worked example. Add headless event tests beside
`tests/step13b-missions.test.mjs`, a screen test beside `tests/step13c-ui.test.mjs`, plus a save test if
the shape changes. The generic 13c presentation lives in `src/ui/missionlog.js`; do not put mission
names, dialogue or branch text in that UI module.

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

## 14. A new pocket or system (data only)

Places live in `src/data/places.js`. A **system** is a non-flyable grouping record
`{ id, kind: "system", n, parent: null }`. A **pocket** is a flyable place
`{ id, kind: "pocket", def, parent, n, d, enter, leave }`; `def` names an entry in `PLACE_DEFS`,
`parent` is the system it belongs to, and `enter.pos` is the arrival point. Generic player-facing
nouns live in `src/data/terms.js` (`mapNode`, `flyable`); proper names live on the place records.

1. Add the pocket to `PLACES` with `parent` set to its system id. A default `intraSystem: "free"` system
   can warp to it without an internal link; a route-only (`intraSystem: "links"`) system needs a connected
   internal link in `PLACE_LINKS` or `GALAXY_OVERRIDES.links`. The zoomed system map draws every pocket and
   the compact right panel lists their names; there is no fixed pocket count. Generation fails plainly if
   the new pocket is unreachable under its system's policy. `npm test` checks fields and connectivity.
2. Point `def` at `PLACE_DEFS.empty` for empty space, or copy `PLACE_DEFS.meridian` and edit its
   features. A definition is a list of features: `station` (position, keep-out, dock range/speed,
   launch point, shop id), `asteroidField` (position, radius, height, count, ore table, respawn,
   rock sizes, salvage spread), `spawner` (enemy id, anchor feature, distances, interval, chance,
   count) and `planet` (scenery position/radius/colour/spin). The generic loader (`sim/places.js`)
   builds the entities; `render/scene.js` builds station/planet scenery from the same definition.
3. The station is a **feature inside a pocket**, not a child place. Its `shop` names a `SHOPS` entry
   (`data/shops.js`); the station heading and dock prompt use the feature's `n`.
4. Do not hard-code positions in sim/render code. Read `featureOf(placeId, kind)` /
   `featuresOf(placeId, kind)` / `featureById(placeId, featureId)`. Entities live in per-place
   containers (`placeWorld(id)` in `state/state.js`); `state.world` is only the local pilot's alias.
5. A new system is one `kind: "system"` record; give it pockets with `parent` set to its id. The
   starting pocket is `DEFAULT_PLACE` and must contain a station feature (you dock there on boot).
6. The warp itself is timed by `WARP` in `data/sectors.js` and about two seconds long. The visuals
   follow those numbers: the 3D streaks (`render/warpfx.js`) and the overlay (`ui/warpflash.js`) read
   the local pilot's `state.warp.fx` / `state.warp.flash` every frame. Keep the overlay to plain
   gradients; a masked gradient across the whole screen halves the frame rate.
7. `WARP_COAST.steer` is how long the ship takes to stop turning once a warp starts, and
   `warpSteerEase(t)` is the curve (1 -> 0). The throttle is released instantly, so the speed bleeds
   off through the normal drag model in `sim/player.js`.
8. Internal place ids are save ids (`world.place`). Keep existing ids stable; old saves and export
   codes migrate through `sanitizeWorld`/`prepareGalaxySave`. Deleting a pocket that a save was in
   recovers the pilot to the home station without losing character/cargo.

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

## 19. A new kind of thing in the world (a new entity kind)

Everything that flies, drifts or pops in the world is a **record** (refactor steps 7a and 7b), not a
mesh: an enemy, a bullet, a missile, a crate, a spark, a rock, the player's ship. A new kind is
therefore three small pieces and no scene code in `sim/`.

1. **The record.** Give it `{ id, kind: "<kind>", pos, quat, ... }` and the fields its rules need.
   Positions and rotations are three.js maths types — that is allowed — but **no mesh, material or
   scene**: `tests/layers.test.mjs` fails if a `sim/` file's code names one.
2. **Into and out of the world.** Add it to an array in `state.world` with `addEntity(list, e)`, take
   it out with `dropEntity(list, e)`, empty a list with `clearEntities(list)` — all in
   `src/sim/entity.js`. Those are the only places that emit `entity-spawned` / `entity-removed`, and
   they hand out ids from `src/util/ids.js` (a counter, so spawning never disturbs the seeded random
   sequence). If docking or warping should clear it, add the list to `clearTransient()` or
   `clearWorldObjects()` in `src/sim/world.js`.
3. **The drawing.** Register the kind in `src/render/views.js` with `registerEntityView`:
   supply `list` (returns its current world array), `build` (returns its mesh with its initial pose),
   `update` (copies the record to the mesh each frame), and `remove` (disposes resources owned by
   that mesh; use `noCleanup` for shared resources). The registry attaches and removes the mesh
   and reconciles missed events; do not add another switch or edit the common view machinery.
   Copy from the record; never write back into it or read `matrixWorld` outside `render/`.
4. **Test it.** `tests/headless-fight.test.mjs` is the model: drive the real sim with no browser and
   assert on `state`. If the thing is drawn, add its kind to the list in `tests/layers.test.mjs`
   (the test that checks `render/views.js` knows every kind) and a mesh count to
   `tests/views.test.mjs`.

## 20. Edit the starmap web and travel rules (steps 11A/11B)

The live M key opens `src/ui/starmap.js`. The resolved web and travel rules are data-driven:
`data/galaxy.js` holds tuning and author overrides, `sim/galaxy.js` resolves/validates the web,
`sim/galaxy-session.js` installs the saved seed as the live place catalog, and `sim/travel.js` answers
direct-hop questions for both the chart and `startWarp`. Edit data/registries, not the map screen or
warp animation.

**Move a system.** In `GALAXY_OVERRIDES.places` in `src/data/galaxy.js`:

```js
places: { "sys-004": { pos: [180, -260] } },
```

Ids, pockets and routes stay stable; the system position and derived tier guidance change. The UI may
nudge the displayed dot away from unrelated straight edges, without changing the authored position.

**Move a pocket on its system's zoomed-in map.** Add a 2D `mapPos` (map units, not flight coordinates):

```js
places: { "hollow": { mapPos: [-130, 90] } },
```

Without `mapPos`, `systemPocketLayout` leaves the centre to the visual star/black hole, spreads ordinary
pockets around it at `systemMap.ordinaryRadius`, and places gates farther out at `gateRadius` toward their
peer system. A stable seed/system-id hash rotates each orbit; authored positions remain fixed obstacles.
An authored gate `mapPos` moves the dot but its exit stub still points toward the peer. Layout is derived
and never saved.

**Choose local travel rules.** `GALAXY.travel.intraSystem` defaults to `"free"`: any pocket in the same
system is a legal free warp, including a gate. Cross-system travel still needs the exact enabled gate link.
For a future route-only temporary instance, author the system with:

```js
places: { "sys-004": { intraSystem: "links" } },
```

Keep/add connected internal links for every pocket in that system. The opt-out restores internal route
lines on its system map and the normal enabled/mode/cost/requirement checks for local hops. It does not
remove gate lines from the main galaxy. Free local hops ignore optional internal-link restrictions and
costs; put cross-system restrictions on the gate link. Validation and `findRoute` understand both policies.

**Author a central star/black hole.** Each system gets an independent seeded core roll: the default
`systemMap.blackHoleChance: 0.05` means 5% black holes / 95% stars, not an exact quota. The core's name strips
the generic `term("mapNode")` suffix case-insensitively (Meridian System → Meridian; Duskdrift stays Duskdrift).
To override it, patch the system, not the pocket table:

```js
places: { "sys-004": { core: { kind: "blackHole", n: "Emberfall" } } },
```

Use `kind: "star"` or `"blackHole"`; omit `n` to derive the proper name. Invalid kinds fail validation.
The core is a focusable SVG image with a permanent two-line name/type label, not a `data-pocket` target, button, link endpoint
or saved place. Warping to/near it is not implemented. Core rolls do not consume the generator or gameplay
RNG streams, so existing system/pocket/link ids and v16 saves stay stable.

**Delete a pocket.** Add its id to `GALAXY_OVERRIDES.removedPlaces`. Every link naming it is pruned.
If the deletion disconnects the web or leaves a gate without its one peer, generation fails with a
plain validation error instead of shipping a broken map. A save that was in the deleted pocket
recovers to the home station with the whole character/cargo intact.

**Promote a pocket to a gate.** Patch its `role: "gate"` and add one `kind: "gate"` link naming its
peer pocket in another system. The peer must also be a gate pocket and may have no other external gate
link. Keep an internal link from the system's ordinary pocket to the gate for the route-only opt-out;
free systems can already reach it, but retaining the link makes a later policy change safe.

**Place a station near a generated gate.** By default, a friendly trader selected by a gate template is
removed from that gate's resolved features and gets a generated `${gateId}-station` pocket with an internal
link to the system hub. Generated trader features and station pockets receive stable varied names from
`GALAXY.stationNameStyles`; the generator avoids duplicates, while an authored station `n` remains unchanged.
To deliberately co-locate a station in a gate pocket, add an explicit station feature through the pocket
override's `features`/`extraFeatures` array, or set `allowStation: true` or `stationPlacement: "gate"`; those
are author choices and are not detached.

**Add an alternative route.** Add a link record to `GALAXY_OVERRIDES.links` (or `PLACE_LINKS` in
`src/data/places.js` for authored pockets): `{ id, kind, a, b, mode: "warp", cost: {}, requires: [],
enabled: true }`. `kind` is `internal` inside one system or `gate` between two gate pockets. Internal
lines are drawn only in a links-policy system; gate lines remain explicit on the galaxy in either policy.

**Chart interaction.** On the galaxy web, click a system to select it; scroll up / press **+** past
`map.systemEntryZoom`, or double-click the dot, to open its pocket map. **Back to galaxy** or scrolling out
at the fitted system view returns. In the pocket map, click/right-click a pocket dot or neighbouring-system
gate label (or focus it and press Enter/Space/Shift+F10) for the **Warp to** popup; only a legal hop gets the
button. Double-clicking the gate pocket or its neighbouring-system label opens that peer system map directly.
A gate-neighbour label quotes the reciprocal gate pocket, never the remote system/core. The right panel
is a read-only overview, not a travel button list. The central body keeps a permanent name/type label and
cannot open a warp popup. Native hover tooltips are absent from pockets/core; click popups remain. The compact
panel must not gain fixed-count rows, per-row metadata or scrolling.

**Change generation or chart settings.** Edit `GALAXY` in `src/data/galaxy.js`: `systemCount`,
`graph.maxNeighbors`, `graph.depthRadiusFraction`, `graph.extraChance`, `layout`, `difficulty`, `visibility.mode`, `travel` defaults, `map`
(padding, screen-pixel radii, zoom limits/step, `panSpeed`, `systemEntryZoom`, `transitionMs`, popup `context`) and
`systemMap` (padding, pocket radius, ordinary/gate orbital radii, exit length, minimum separation, zoom
limits, `blackHoleChance`, map-unit `coreRadius`/`blackHoleRadius`, `coreLabelOffset`, `coreLabelLineHeight`, `labelGap`).
To replace the layout algorithm, register a function in `GALAXY_GENERATORS` (`src/sim/galaxy.js`) with the
same `(seed, tuning, rng)` contract and name it in `GALAXY.generator`. The resolved record contract stays
the same, so travel rules and the map UI do not change. Changing graph links may remove old generated gate
pockets: `prepareGalaxySave` uses the retained v1 generator to recover those saves in their original system.

**Change visibility.** `visibility.mode: "all"` shows the whole web. `"discovered"` uses the compact
`world.galaxy.knowledge` flags; home is always discovered/visited and each local arrival records a
visit. Add a new policy to `VISIBILITY_POLICIES` rather than hard-coded fog in the UI.

**Future costs/requirements.** Keep defaults in `GALAXY.travel` and per-route overrides on links.
Register a requirement handler in `TRAVEL_REQUIREMENTS` (`src/sim/travel.js`) as
`({ req, link, from, to, context }) => true | "refusal reason"`. The chart and warp pass the same
pilot/profile/world context. These checks apply to gate links and to internal links in route-only systems;
default free local warp has no link cost/requirement. Costs are returned as plain data; until a cost handler is implemented,
`startWarp` refuses any non-empty cost rather than silently charging or ignoring it. Fuel, gate
activation and supercruise are not implemented yet.

**Saves.** v18 stores only `{ seed, knowledge }` for generated geography in `world.galaxy`, plus
`world.destination` and positive remaining simulation-second entries in `world.placeMemory`. Boot, slot
load and import call `prepareGalaxySave(raw)` before `applySave`; it regenerates the seed, validates ids
against that live catalog and recovers removed pockets. Never save generated systems/pockets/links, core
assignments or chart geometry.

Run `npm test` (`tests/step11a-galaxy.test.mjs` and `tests/step11b-starmap.test.mjs`) after any edit.
They check determinism, reachability, one-peer gates, move/delete/promote examples, visibility, tier
guidance, live catalog lookup, map interaction, direct-hop refusal, pause and save migration/recovery.

## 21. Add a place-template encounter (Step 12)

Generated pocket content is data. Do not add a new `if (placeId === ...)` branch to a sim file.
The current registries are `src/data/place-templates.js` and `src/data/encounters.js`.

**Add another instance of an existing encounter kind.** Add an entry to `ENCOUNTERS` in
`src/data/encounters.js`, then reference its id in a template tier in `PLACE_TEMPLATES`:

```js
// src/data/encounters.js
rescue_cache: {
  kind: "resourceCache",
  n: "Rescue cache",
  d: "A sealed emergency cache.",
  item: "cobalt",
  count: [2, 5],
  respawnSec: 420,
},

// src/data/place-templates.js
frontier: {
  // ...existing fields...
  tiers: {
    1: ["hostile_patrol", "resource_cache", "rescue_cache"],
    2: ["hostile_patrol", "derelict", "rescue_cache"],
    3: ["hostile_patrol", "derelict", "resource_cache", "rescue_cache"],
  },
},
```

Use the fields belonging to the kind:

- `hostilePatrol`: `enemy`, `faction`, `count`, `interval`, `chance`, `nearRadius`,
  `farFromStation`, `spawnDist`, `maxActive`, `once`, `respawnSec`.
- `friendlyTrader`: `shop` must be an existing id in `src/data/shops.js`; `station` contains the
  dock/launch tuning. The station feature receives a stable `${placeId}:${featureId}` inventory key;
  it reuses the named shop's rows/economy but never another station's stock.
- `derelict`: `loot` must be a `kind: "drops"` table in `src/data/loot.js`.
- `resourceCache`: `item` must be a real `ITEMS` id and `count` is an inclusive `[min, max]` range.

A template's `tiers` table is selected by the highest tier not above the pocket's derived tier. Add
positions to `encounterPositions` when the default placement is not suitable. Asteroid fields use
`stable: true`, `respawnSec` and a field `id`; stable slots are stored as keys such as `field:3` in
`world.placeMemory`.

The existing generic code handles every instance of these four kinds: `placeDef()` expands the
features, `sim/ai.js` spawns patrols, `sim/encounters.js` builds static loot, and
`sim/place-memory.js` decrements cooldowns in simulation seconds. `emit("respawn-place", { placeId,
kind, id })` is the event hook for a future story or world event to force one cooldown early. Run
`npm test`; `tests/content.test.mjs` checks every encounter/template/loot/shop/item reference and
`tests/step12-places.test.mjs` checks generated filling, hunt behavior, persistence, pause safety and
forced respawn.
