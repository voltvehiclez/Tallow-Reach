# Changelog archive

Older entries moved here from [CHANGELOG.md](CHANGELOG.md), word for word, newest first.
You do not need to read this file for every task. `CHANGELOG.md` has a one-line index of everything
in here: open this file only when the index shows an entry that matters to what you are changing
(why a rule exists, how a save version was migrated, what a past fix was).

When entries are moved out of `CHANGELOG.md`, paste them directly under this paragraph so the
newest stay first.

---

## 2026-11-08: Refactor step 6b — the sim stops reading the keyboard (step 6 done)

- **Why:** with 6a the sim no longer played sound; it still read the keyboard and the mouse
  directly (`keys.KeyW`, `pointer.x` in `sim/player.js`, `sim/weapons.js` and `sim/sectors.js`), and
  `sim/weapons.js` even measured the missile lock ring in **screen pixels**. That is the thing that
  makes a second player impossible: a guest's controls arrive from the network, not from a keyboard.
- **New `state.controls`** (`src/state/controls.js`): one plain record per pilot —
  `steer {x,y}`, `roll`, `thrust`, `strafe`, `lift`, `stop`, `brake`, `boost`, `fire`, `sec`.
  `core/input.js` owns the key table (`HELD`) and rebuilds the record after every key or mouse
  change; the sim reads it and never sees a key code. **No `src/sim/` file imports `core/` any
  more**, which is what "step 6 done" means. The shape is the co-op contract: step 8 puts it on a
  per-player record, step 16 fills a guest's copy.
- **The missile lock ring moved to the screen.** The sim now reports the cone in **degrees**
  (`state.flight.coneAngle`), and `coneRadiusPx()` in `ui/hud.js` turns that into pixels with the
  camera's field of view and the window height. Checked against the old formula at 0, 1, 10, 20, 30
  and 45 degrees: identical to the last digit (20 deg on a 60-degree camera at 900 px is
  283.68672218631417 px, before and after). The sim no longer reads `innerHeight`.
- **Two small cleanups in passing**, both verified to change nothing: the stored
  `state.flight.gunsOn` flag is gone (it was only ever read inside `sim/weapons.js`, where it is now
  a local; a stale copy on a shared record would mislead co-op), and losing window focus now clears
  held keys as well as releasing the free camera, so a ship cannot keep thrusting while the player
  is in another window.
- **New tests (`tests/layers.test.mjs` is 14 now):** no `sim/` file may import `core/` at all, none
  may mention `keys`/`pointer`, `HELD` may only set fields the record has, the record's exact field
  list is pinned, each record owns its own `steer` object, and the ring's pixel maths is checked.
  `tests/content.test.mjs` gained the new source strings for the two guards it already had.
- **Proof it plays identically.** A probe drove one scripted session through the previous commit
  (setting `keys`/`pointer`) and this tree (setting `state.controls`), with real three.js maths and a
  per-frame fingerprint of position, rotation, velocity, throttle, boost tank, Shield HP, Hull HP,
  power draw, gun cooldowns, beam state, entity counts and warp state: **1010 of 1010 frames
  identical.** The session covered throttle, steer, roll, strafe, lift, brake, stop, boost ignition,
  six volleys, 6 seconds of mining, secondary fire and a warp with the stick easing out.
- **No save change** (`SAVE_VERSION` stays 12) and no gameplay, balance or UI change.
- **Tests:** 155 pass (was 150).
- Files: `src/state/controls.js` (new), `src/state/state.js`, `src/core/input.js`,
  `src/sim/player.js`, `src/sim/weapons.js`, `src/sim/sectors.js`, `src/ui/hud.js`,
  `src/ui/pause.js`, `src/main.js`, `tests/layers.test.mjs`, `tests/content.test.mjs`,
  `src/core/README.md`, `src/sim/README.md`, `docs/ARCHITECTURE.md`, `docs/TARGET_ARCHITECTURE.md`
  (the debt row now names only `render/`), `docs/HOW_TO_ADD.md` (recipe 8 rewritten: one-off keys
  vs held controls), `docs/ROADMAP.md` (6a ticked, 6b logged), `TESTING-BASELINE.md`, this changelog.
  Run `npm run build` and `npm test`.

---

## 2026-11-08: Refactor step 6a — the sim stops playing sounds itself

- **Why:** the biggest structural debt in `docs/TARGET_ARCHITECTURE.md` is `src/sim/` importing the
  screen, the speakers and the keyboard. Step 6 splits it in two, and this is the sound half (6a).
  Eleven places in `src/sim/` called the synthesiser directly (`tone()`, `nz()`, `oreGained()`,
  `warpCharge()`, `warpBurst()`), so no test could run the sim without a browser, and a co-op host
  could never decide which machine should hear a boom.
- **New event `sfx { name, ...rest }`.** The sim now says *what happened*; `core/audio.js` decides
  what that sounds like. `src/sim/{weapons,player,combat,ai,effects,sectors}.js` no longer import
  `core/audio.js` at all. Extra fields carry the moment's own numbers:
  `{ name: "explosion", count }` (still only rumbling above 10 particles) and
  `{ name: "warp-charge", dur }` (the warp's own charge length).
- **`SFX` table in `src/core/audio.js`** holds one entry per sound, and these eleven names are what
  the sim emits: `cannon`, `ore-gained`, `missile-lock`, `missile-fire`, `boost`, `hit`, `pickup`,
  `enemy-fire`, `explosion`, `warp-charge`, `warp-burst`. One listener, `on("sfx", playSfx)`, plays
  them. **Every waveform, frequency, duration and volume is copied unchanged** — this is a wiring
  change, not a sound change.
- **Deliberately not hung on existing gameplay events.** It would be tidier to play the ore chime
  from the `mined` event and the pickup pip from `pickup`, but the sim intends the chime to fire
  **once per ore the beam secures**, while the `mined` event fires once per ore that actually lands
  in the hold (`weapons.js`: `emit("sfx", { name: "ore-gained" })` sits above the `while` loop that
  emits `mined`). They are not the same moment, and a design that assumed they were would have
  quietly coupled a sound to a cargo rule. *(Correction, same day: an earlier draft of this entry
  justified the choice with "mining with a full hold chimes but emits no `mined`". The owner pointed
  out that the beam never cuts when the hold is full — `updatePrimary` says "Cargo hold full" and
  returns before the cutting branch — so that case does not arise. The separation is still right;
  the example was wrong.)* Each `sfx` sits at the exact old call site, so the sounds are 1:1 with
  before.
- **New `tests/layers.test.mjs` (9 tests):** imports are parsed statement by statement, so a
  side-effect import cannot swallow the next one. It fails if any `src/sim/` file imports
  `core/audio.js`, `core/input.js` (that line is deleted in 6b) or `ui/`, holds a shrinking
  allow-list of `sim/` files that may still import `render/` (step 7 empties it) and checks the
  allow-lists only name files that really do that import. It also checks both directions between
  the names the sim emits and `SFX`, and that playing a sound with no audio context never throws.
  All three deliberate breakages (re-importing audio, a typo'd name, a stale allow-list entry)
  were caught.
- **Proof it plays identically.** A probe bundled the previous commit and this tree, ran one
  scripted session through both with a recording Web Audio context (a fake `window.AudioContext`
  logging every node, envelope, start/stop and the delayed `setTimeout` chimes), and compared the
  result: **671 log lines identical**, the same 55 oscillators, 19 noise bursts and 11 delayed
  pips, covering all eleven sounds.
- **No save change** (`SAVE_VERSION` stays 12) and no gameplay, balance or UI change.
- **Tests:** 150 pass (was 141).
- Files: `src/util/events.js`, `src/core/audio.js`, `src/sim/weapons.js`, `src/sim/player.js`,
  `src/sim/combat.js`, `src/sim/ai.js`, `src/sim/effects.js`, `src/sim/sectors.js`,
  `tests/layers.test.mjs` (new), `TESTING-BASELINE.md` (a by-ear table), `src/core/README.md`,
  `src/sim/README.md`, `docs/ARCHITECTURE.md`, `docs/TARGET_ARCHITECTURE.md` (the debt row now
  names only 6b/7), `docs/HOW_TO_ADD.md` (recipes 9 and 10 rewritten), `docs/ROADMAP.md` (steps 4
  and 5 ticked after the owner's playtest; step 6a logged), this changelog.
  Run `npm run build` and `npm test`.

---

## 2026-11-07: Recorded what is and is not per-shop about shops (docs only)

- **Why:** the owner asked whether the game can hold more than one **independent** shop (for
  example a trader in Kestrel Hollow beside Meridian's). A probe answered it, and the answer is worth
  keeping so the next session does not re-derive or, worse, pre-empt it.
- **What holds up:** shops are independent as content — `SHOPS` entries with their own heading,
  rows, prices and `max` limits, addressed by `shopId`, with limited stock keyed per shop
  (`"shopId:itemId"`), so two shops never share a shelf.
- **What does not (yet):** the *destination*. Every purchase lands in the one place `STATION`
  (`profile.store`) and room is checked there, so a shop in another sector would deliver into — and
  be blocked by — Meridian's storage. The probe showed exactly that: independent prices and stock,
  both purchases in one `profile.store`, and a full station refusing the other shop's sale.
- **Owner's decision, recorded:** other stations will have **their own independent inventory**. The
  route is written into the new known gap in `docs/ARCHITECTURE.md`: named places in
  `sim/inventory.js`, their stock saved with the world (step 9), and the sector naming its station and
  shop (`OUTPOST_SHOP` becomes a sector field, step 10).
- **No code, no save change.** `SAVE_VERSION` stays 12; tests unaffected (141 still pass).
- Files: `docs/ARCHITECTURE.md` (known gap), this changelog.

---

## 2026-11-07: Spare modules can be sold (60% of the shop price)

- **Why:** the game treated a module as unsellable. `canSell(id)` is `itemValue(id) > 0` and a
  module's catalogue entry was only `{ cat: "module" }`, so every selling path skipped parts: the
  Inventory's right-click **Sell** was greyed out on a MOD tile ("Modules cannot be sold; only
  cargo has a sell value"), and the Base tab's **Sell hold / Sell stored** quietly sold only ore and
  salvage. A part you took off a hull was dead weight.
- **The owner's rule:** a spare module sells for **60% of its shop price**, never below 1 credit —
  the beam **540** (of 900), the missile pod **900** (of 1500), the six standard parts **1** each
  (60% of 1 would round to nothing, and then they could not be sold again). The values are data, in
  `ITEMS[<module>].v` in `src/data/items.js`, and a test fails if a shop price and its sell value
  stop agreeing (`Math.max(1, Math.floor(price * 0.6))`).
- **Changed:** `sim/economy.js` — `sellHold()` and `sellStored()` count and sell goods **and** spare
  parts, and return a message (`Sold 4 items for 1270 cr.`, or `Nothing in the hold can be sold.`);
  `sellInventoryItem()` no longer says "Only cargo can be sold."  `ui/menu.js` — right-click **Sell**
  is offered whenever the item has a value, the box is titled with the item's name
  (`SELL BASIC MINING BEAM`) instead of "Sell cargo", and the two Base buttons now report their
  result in the toast. `ui/screens.js` — the Base tab's sell buttons look at everything with a value
  (and say so), and the Inventory blurb mentions selling.
- **What is still not for sale:** a module **fitted in a bay** — it is in no stock, so no selling
  path can reach it, and a test pins that. Missiles loaded in a launcher are not cargo either.
- **No save change.** Sell values come from the catalogue, not the save; `SAVE_VERSION` stays 12.
- **Tests:** 141 pass (was 132). New `tests/selling.test.mjs` (9 tests): every sellable item is worth
  whole credits, a part sells at 60% of its shop price from a hold or the station, refusals change
  nothing, the refinery bonus applies to parts, whole-hold and whole-station sales take the parts,
  the "nothing to sell" messages, a fitted part is never sold, and source guards on the old
  "cargo only" rules. `tests/content.test.mjs` gained the price↔value rule.
- Files: `src/data/items.js`, `src/sim/economy.js`, `src/ui/screens.js`, `src/ui/menu.js`,
  `tests/selling.test.mjs` (new), `tests/content.test.mjs`, `TESTING-SELLING.md` (new),
  `src/data/README.md`, `src/sim/README.md`, `docs/ARCHITECTURE.md`, `docs/HANDOFF.md`,
  `docs/HOW_TO_ADD.md` (recipes 2 and 16), this changelog. Run `npm run build` and `npm test`.

---

## 2026-11-07: Shop fix — the cannons are listed once, as "Basic cannons"

- **Why:** the Shop showed the cannons twice. The first line, **Autocannons — Primary. Standard
  issue. — Owned**, was typed into the old shop screen and came through step 5 as a `kit` list of
  "standard-issue" lines; step 5's own change then put **Basic cannons** in the stock at 1 cr. The
  game has only one cannon module (`cannon_basic`, "Basic cannons"), so one of the two lines was
  wrong — and "Autocannons" named a part that does not exist.
- **Changed:** `src/data/shops.js` loses its `kit` list, and `shopHtml()` in `src/ui/screens.js`
  no longer draws one. A stock row is now the **only** way a part appears on the shop screen, so
  the same part cannot be listed twice. The Shop's first two rows (the beam and the missiles) are
  unchanged, word for word.
- **Nothing else changes:** the same eight parts are for sale at the same prices (beam 900 cr,
  missile pod 1500 cr, the six standard parts 1 cr each), and buying, selling, saves and flight are
  untouched. Save version stays 12.
- **When more cannon types exist** they are new `MODULES` entries plus a shop row each (recipe 17):
  one row per cannon, no extra list.
- **Tests:** 131 pass. `tests/shops.test.mjs` now fails if a shop has a `kit` list or if any item
  appears in a shop's stock twice.
- Files: `src/data/shops.js`, `src/ui/screens.js`, `tests/shops.test.mjs`, `TESTING-SHOPS.md`,
  `src/data/README.md`, `docs/ARCHITECTURE.md`, `docs/HOW_TO_ADD.md` (recipe 4), `docs/ROADMAP.md`,
  this changelog. Run `npm run build` and `npm test`.

---

## 2026-11-07: Refactor step 5 — shops and prices from data (plus a visible Shop change)

- **Why:** the Shop was hard-wired. `SHOP_WEAPONS` in `data/weapons.js` held two rows, `buyWeapon()`
  in `sim/economy.js` knew those two keys by name, and `shopHtml()` even had a third row
  ("Autocannons — Owned") typed into the markup. A second trader, or a station selling a spare
  powerplant, needed code in three files.
- **New:** `src/data/shops.js` — `SHOPS`: per shop, a heading (`n`), its line of explanation (`d`),
  `kit` (standard-issue parts, shown as "Owned", not sold) and `stock` (one row per item: `id`,
  `price`, how the row is worded `n`/`d`, and optionally `max`). Meridian is the first entry and
  sells what it sold before. One generic `buyItem(shopId, itemId, qty = 1)` in `sim/economy.js`
  replaces `buyWeapon`, plus `shopList(shopId)` (what the Shop tab draws) and `shopStock()`/
  `setShopStock()` (see stock below).
- **Visible change the owner asked for:** six rows added at **1 cr** each — `power_basic`,
  `cell_basic`, `thruster_basic`, `shield_basic`, `cannon_basic`, `hull_basic` — so a pilot who takes
  a standard part off a hull, or loses one with a ship, can always buy it back. The beam stays 900 cr
  and the missile pod 1500 cr. Those six rows are marked `own: false`, so they do not show
  "You own N" (that count includes the stock fit of hulls you have not bought).
- **Stock rules:** no `max` means the shop never runs out — every Meridian row today. A row with
  `max: 5` shows "N left", greys out at zero, and `buyItem()` refuses when it is gone. How much is
  left lives in **session state** (`state.shops`), never in the save, and starts again from `max`.
  `setShopStock(shopId, itemId, n)` is the one hook a restock timer, a restock event or a random roll
  will call later; nothing calls it today. Restocking is deliberately unfinished, not forgotten.
- **The 8 starter missiles moved to the item:** `missile_basic` has `ammo: 8` in `data/modules.js`
  (the save's clamp was already reading `MODULES.missile_basic.cap`), so a purchase tops the rack up
  to 8 and never takes missiles away. `SHOP_WEAPONS` is deleted.
- **Changed:** `sim/economy.js` (the generic purchase; a module is still bought into the station's
  inventory through `sim/inventory.js`, whose `buyItem` gained a quantity argument),
  `ui/screens.js` (`shopHtml()` draws from `shopList()`/`shopDef()`), `ui/menu.js` (the Buy button
  passes `shopId:itemId`), `state/state.js` (`shops: {}`), `data/weapons.js` (now only `MISSILE`).
- **Nothing else plays differently.** An old-vs-new probe ran the same 19-step session through the
  previous commit and this one (buy beam and missiles, move one to a hold, fit a beam in an empty
  bay, unequip a powerplant, store the hold, load, sell the hold, sell the station, repair, buy a
  ship, upgrade the base, restock missiles): **credits, every stock, every hold, every loadout, the
  base levels and every message were identical**, and the Contracts, Hangar, Outfitting, Inventory,
  Base and Saves tabs render byte-identical HTML. On the Shop tab the two old rows are unchanged,
  word for word and in the same order, with the Launch button still last; the only differences are
  the six new rows and the invisible `data-b` now naming shop and item.
- **Save version unchanged (12).** Nothing saved changed.
- **Tests:** 131 pass (was 121). New `tests/shops.test.mjs` (10 tests): every row is complete and
  names a real item, Meridian's prices and its "Autocannons" line, the beam/missile messages and
  missile top-up, refusals that change nothing, the six 1-credit parts and quantity purchases, what
  `shopList()` hands the screen, a temporary limited shop that sells out and is restocked through
  `setShopStock()`, stock never reaching the save, and source guards proving the tabs read `SHOPS`.
  The old `SHOP_WEAPONS` assertions moved out of `content.test.mjs` into it.
- Files: `src/data/shops.js` (new), `src/data/weapons.js`, `src/data/modules.js`, `src/sim/economy.js`,
  `src/sim/inventory.js`, `src/state/state.js`, `src/ui/screens.js`, `src/ui/menu.js`,
  `tests/shops.test.mjs` (new), `tests/content.test.mjs`, `tests/inventory.test.mjs`,
  `TESTING-SHOPS.md` (new), this changelog and the docs listed in the step. Run `npm run build` and
  `npm test`.

---

## 2026-11-07: Refactor step 4 — the item catalogue and one inventory per place (save v12)

- **Why:** the game knew five cargo types by name. `data/items.js` built a fixed object with a key
  per ore (`emptyCargo()`), the save named those keys by hand, spare modules were a separate list,
  and every system that touched cargo looped over the same `KEYS` array. A sixth item — a trade
  good, a second salvage type, ammo — meant editing the sim, the save and the screens.
- **New:** one catalogue, `ITEMS` in `src/data/items.js`, with a category (`ore`, `salvage`,
  `module`, `ammo`, `consumable`, `trade`), a sell value, a volume in m³ and a stack rule. Every
  module is an item entry too (`beam_basic: { cat: "module" }`) whose name, volume and stats stay in
  `data/modules.js`, so nothing is written twice. Code reads it through the helpers only
  (`itemName`, `itemVol`, `itemValue`, `canSell`, `itemStack`, `isModule`, `isItem`).
- **Save version 12.** A place (`profile.store`, `profile.holds[id]`) is one stock,
  `{ itemId: count }`, instead of goods in one object plus a `modules` list — and `profile.modules`
  is gone. Old saves convert on load: the old lists are poured in, zero counts are dropped, unknown
  ids and negative counts are still cleaned. `tests/saves/v11-real.json` is a genuine v11 save
  (written by the code before this step) and a test converts it.
- **Changed:** `sim/inventory.js` (`moveItem` replaces `moveCargo` and `moveModule`; new `addItem`,
  `takeItem`, `countOf`, `itemsAt`, `unitsOf`, `buyItem`, and `valueOf`, which moved here so it can
  be tested without the screen), `sim/fitting.js` (bays are fitted from the one stock),
  `sim/economy.js` (store, load and sell read the catalogue; selling or storing now touches only
  goods, so spare parts are never swept away), `sim/combat.js` and `sim/weapons.js` (a picked-up
  crate or a mined ore is `addItem(...)`), `ui/screens.js` and `ui/menu.js` (one tile list per place,
  the same ORE/MOD tiles, arrows and Sell box).
- **Nothing plays differently.** A throwaway probe ran the same 29-step session through the previous
  commit and this one, with the screen and the speakers stubbed: buying 3 beams and 2 missiles, a
  refused purchase, 11 cannons into a hold that only takes 10, ore across, fitting a beam, a bad bay,
  unequipping a powerplant, buying and switching ships, storing, loading, selling the hold, selling
  the station, selling part of a stack, and what the station is worth. **Credits, every stock, the
  m³ in use and every fitted bay were identical after every step**; the Inventory, Shop and Base tabs
  also render byte-identical HTML (10,332 characters). One wording change: buying an id that does
  not exist says "Unknown item." instead of "Unknown module." — no screen can reach it.
- **Tests:** 121 pass (was 118). `tests/inventory.test.mjs` now covers the v11 conversion, the
  registry (a test adds a temporary item and watches it be carried, moved, listed and sold), and a
  source guard: no file may read `profile.cargo`/`profile.modules` or import a fixed list of item
  keys again.

---

## 2026-11-07: Refactor step 3 — loot tables (drops and ore mix are data)

- **Why:** the two drop rules were written inside the game code — one or two salvage crates and a
  10% core in `sim/combat.js`, the ore mix in `sim/asteroids.js` — so a new drop, a second enemy's
  loot or a new rock type meant editing the sim. Now both are tables.
- **New:** `src/data/loot.js` (`LOOT_TABLES`, two kinds: `drops` — a line per drop with a chance `w`,
  a count range `c` and a scatter `j`; and `pick` — one weighted choice, for a rock's ore) and
  `src/sim/loot.js` (`rollLoot(id, rng)`, `pickLoot(id, rng)`, pure and tested). The raider table is
  today's rule exactly: `salv` 1–2 at 100%, `core` 1 at 10% dropped on the wreck; the asteroid table
  is ferrite 62 / cobalt 30 / voidite 8.
- **Changed:** `src/data/enemies.js` gains `loot: "raider"`; the enemy record carries it
  (`src/sim/ai.js`), `killHostile` rolls the table instead of hard-coding crates, `spawnAsteroid`
  takes its ore from the table, and a crate in the world now carries **which item it holds**
  (`{ m, t, item }`) instead of a `core` flag — `src/sim/targeting.js` reads that for its label, so
  the marker still says "crate" / "reactor core".
- **Nothing plays differently.** Checked against `main` before this step, both versions running on
  the same substituted `Math.random`: **50,000 rocks gave an identical ore sequence**, and 200,000
  kills each gave the same odds — one crate 49.80% vs 49.96%, two crates 50.20% vs 50.04%, a core
  10.02% vs 9.85%, and in both versions every core landed exactly on the wreck. One honest detail:
  the 50/50 crate count now maps a low die to *one* crate where the old code mapped it to *two*, so
  individual kills can swap 1↔2 crates while the odds are unchanged. Matching that would have meant
  writing the count range backwards in the data, which is worse than the invisible difference.
- **New:** `tests/loot.test.mjs` (9 tests, rolls each table 10,000 times and checks the odds,
  determinism, a 0% line never dropping, an unknown table giving nothing, and that adding a drop is
  a data edit) and `TESTING-LOOT.md`. `tests/content.test.mjs` now checks every loot table: real item
  ids, sane weights and ranges, every enemy's table exists, and the raider/asteroid numbers pinned.
- **Also:** `tests/rng.test.mjs` followed the crate change (`c.core` → `c.item`).
- **Saves:** none; still version 11, no migration.
- **Tests:** 118 pass (108 before).
- Files: `src/data/loot.js`, `src/sim/loot.js`, `src/data/enemies.js`, `src/sim/ai.js`,
  `src/sim/combat.js`, `src/sim/asteroids.js`, `src/sim/targeting.js`, `tests/loot.test.mjs`,
  `tests/content.test.mjs`, `tests/rng.test.mjs`, `TESTING-LOOT.md`, `src/data/README.md`,
  `src/sim/README.md`, `docs/ARCHITECTURE.md`, `docs/TARGET_ARCHITECTURE.md` (closed debt removed),
  `docs/HOW_TO_ADD.md` (recipe 18 added), `docs/HANDOFF.md`, `docs/ROADMAP.md`, this changelog.
  Run `npm run build` and `npm test`.

---

## 2026-11-07: Refactor step 2 — seeded randomness everywhere

- **Why:** "same seed, same run" is the foundation for generated sectors, wormhole instances and
  co-op. Six rolls in the simulation still called `Math.random()` directly, so seeding never covered
  the whole game.
- **Changed:** `src/util/rng.js` now owns everything: `makeRng(seed)` is a new independent generator
  (same seed, same sequence, forever), `setSeed(n)` installs it for the whole game, `setSeed(null)`
  goes back to `Math.random`, and `random()` reads `Math.random` at call time when unseeded.
- **Changed:** the six direct rolls now go through `random()` — the raider's circling direction and
  the two wander-spawn dice (`src/sim/ai.js`), the 1-or-2 crates and the 10% core (`src/sim/combat.js`),
  and a rock's ore type (`src/sim/asteroids.js`). Same number of rolls, same order, same odds.
- **New:** `tests/rng.test.mjs` — fails and names the file and line if `Math.random` appears anywhere
  in `src/sim/` or `src/data/`; checks `makeRng` repeatability, range and independence from the shared
  stream; and runs the real spawn, loot and asteroid code headlessly to prove `setSeed(1)` twice gives
  the identical run.
- **Nothing plays differently.** The old code (commit `75498f8`) and the new code were run side by side
  with a substituted `Math.random`: 70 asteroid rocks (ore type, size, ore amount), 60 simulated
  seconds of raiders with the hunt spawner and every bullet, and 40 kills of loot rolls all came out
  identical.
- **Rule for next time:** never call `Math.random()` in `src/sim/` or `src/data/` — use `random()`, or
  `makeRng(seed)` when a thing must regenerate from its own seed. Written into `ARCHITECTURE.md`,
  `src/sim/README.md` and `src/util/README.md`.
- **Saves:** no change; still version 11, no migration.
- **Tests:** 108 pass (101 before).
- Files: `src/util/rng.js`, `src/sim/ai.js`, `src/sim/combat.js`, `src/sim/asteroids.js`,
  `tests/rng.test.mjs`, `src/util/README.md`, `src/sim/README.md`, `docs/ARCHITECTURE.md`,
  `docs/TARGET_ARCHITECTURE.md` (closed debt removed), `docs/HOW_TO_ADD.md` (recipe 12 rewritten),
  `docs/HANDOFF.md`, `docs/ROADMAP.md`, this changelog. Run `npm run build` and `npm test`.

---

## 2026-11-07: Refactor step 1 — enemies are data (enemy registry, `enemy-killed` event)

- **Why:** the Newbie Raider's numbers were written inside `sim/ai.js`, so a second enemy meant
  editing game code. Now an enemy is one entry in `src/data/enemies.js`, which is the first piece of
  Milestone A (content becomes data-only additions).
- **New:** `src/data/enemies.js` (`ENEMIES`, the `raider` entry with exactly today's numbers: name,
  plural name, 10 Hull HP, colour, scale, faction, `chase` behaviour, close/near/orbit speeds,
  circling distance, fire/lost/hear ranges, first-shot delay, shot gap, 1 damage, 520 m/s bolt, spawn
  distance; plus `DEFAULT_ENEMY` and `enemyDef()`), `src/data/factions.js` (`FACTIONS`: `pirates`),
  `tests/headless.mjs` (runs `src/sim/` code in a test with the screen and sound stubbed out — no new
  package, it uses the esbuild the build already needs), `tests/enemies.test.mjs`, `TESTING-ENEMIES.md`.
- **Changed:** `src/sim/ai.js` — `spawnPirate(p)` is now `spawnEnemy(id, pos)`; the model, record
  (`def`, `n`, `f`, `hp`, `mx`, fire timer) and the shot all read the def, and the behaviour comes
  from `AI_BEHAVIOURS` (one entry, `chase`). `src/sim/combat.js` emits
  `enemy-killed { def, faction }`; `src/util/events.js` lists it; `src/sim/contracts.js` counts only
  the enemy a hunt contract names; `src/data/contracts.js` stores that id (`e`) and builds the wording
  from the def's plural name, so it still reads "Destroy 3 pirate raiders".
- **Nothing plays differently.** The same numbers were copied, not retuned, and the old and new
  `sim/ai.js` were run side by side for 60 simulated seconds in three situations (a lone raider, the
  wandering spawner, a hunt contract): enemy positions, Hull HP, fire timers and every bullet's
  position and damage matched step for step. Hunt contracts still count raiders only. Contract text,
  rewards, the lock marker ("Newbie Raider 100%") and loot are unchanged.
- **Saves:** no change; save version still 11, no migration. A hunt contract saved by an older
  version has no enemy id, so it keeps its old wording and still counts any hostile.
- **Tests:** 101 pass (94 before; two `content.test.mjs` source-guards were replaced by real
  enemy-table checks, and six headless enemy tests are new).
- **Roadmap:** steps 0 and 1 ticked 2026-11-07 (the owner played this build; old save with a
  Prospector loaded unchanged).
- Files: `src/data/enemies.js`, `src/data/factions.js`, `src/sim/ai.js`, `src/sim/combat.js`,
  `src/sim/contracts.js`, `src/data/contracts.js`, `src/util/events.js`, `tests/headless.mjs`,
  `tests/enemies.test.mjs`, `tests/content.test.mjs`, `TESTING-ENEMIES.md`, `src/data/README.md`,
  `src/sim/README.md`, `docs/ARCHITECTURE.md`, `docs/TARGET_ARCHITECTURE.md` (two closed debts
  removed), `docs/HOW_TO_ADD.md` (recipe 6 rewritten), `docs/HANDOFF.md`, this changelog.
  Run `npm run build` and `npm test`.

## 2026-11-07: Vision, target architecture, roadmap and refactor plan (docs only, no code change)

- **Why:** the owner's plan is much bigger than the code's shape (100+ sector starmap, wormhole
  instances, a story campaign, host-run co-op) and several different AI assistants will work on it.
  The docs now say what the game is, where it is heading, in what order, and how to get there safely.
- **New:** `docs/VISION.md` (scope, design pillars, open design questions with defaults),
  `docs/TARGET_ARCHITECTURE.md` (eight principles, data model, save split, multiplayer model, a
  "Debt today" table with evidence), `docs/ROADMAP.md` (status of every step, content to add and when),
  `docs/REFACTOR_PLAN.md` (15 behaviour-preserving steps in 4 milestones, each with goal, work, "done
  when", save version and how the owner runs it), `TESTING-BASELINE.md` (a 10-minute whole-game
  click-through), root `AGENTS.md` and `CLAUDE.md` (pointers for tools that read them).
- **Changed:** `docs/HANDOFF.md` (big picture, reading order, "keep the structure" now means keep
  folders and conventions, restructure only through numbered steps), `docs/ARCHITECTURE.md` (reading
  order, the `sim/` imports `render/`+`core/` exception stated honestly), `docs/AI_PROMPTS.md`
  (model-agnostic starter prompt, refactor-step prompt, content prompt, using several AIs),
  `docs/HOW_TO_ADD.md` (note on which recipes change), `README.md` (links).
- **Housekeeping:** this file had 24 full entries (the limit is 15). The 15 oldest were moved
  word for word to `CHANGELOG_ARCHIVE.md` and indexed below; 10 plus this one remain.
- No source, data, test or save change; save version still 11. No rebuild needed.

## 2026-11-07: Inventory Sell quantity uses a game-styled popover

- Replaced the browser-owned quantity prompt with a small in-game box positioned beside the
  selected inventory tile. It contains the quantity field (prefilled with the stack size),
  inline validation, and Sell/Cancel buttons. No other inventory layout changed.
- Files: `src/ui/menu.js`, `src/styles.css`, `tests/inventory.test.mjs`, this changelog.
  Save version unchanged. Run `npm run build` and `npm test`.

## 2026-11-07: Inventory Sell asks how many units to sell

- Choosing Sell on a cargo stack now opens a quantity prompt, prefilled with the whole stack
  count. Enter any whole number from 1 to the stack size to sell that partial or full amount;
  cancelling leaves the stack unchanged. Existing prices and refinery bonus still apply.
- Files: `src/ui/menu.js`, `src/ui/screens.js`, `src/sim/economy.js`, `src/ui/README.md`,
  `tests/inventory.test.mjs`, this changelog. Save version unchanged. Run `npm run build` and `npm test`.

## 2026-11-07: Inventory grids use five narrower, shorter slots per row

- Set both inventory grids to exactly five columns, with narrower tiles and a 68px tile/row
  height. The 25-slot minimum gives five rows by default; each additional item beyond 25
  naturally adds a row. The three-row scroll viewport and independent scrolling are retained.
- Files: `src/styles.css`, `tests/inventory.test.mjs`, this changelog. Save data unchanged.
  Run `npm run build` and `npm test`.

## 2026-11-07: Inventory grids keep their size when empty, and moves no longer show status text

- Each hold now always renders a 5-by-5 slot field with a fixed three-row viewport, so empty
  slots preserve the inventory window size and scrolling can be tested even with fewer items.
  Station and ship grids scroll independently. Moving items clears/suppresses the "Moved ..."
  status message; other actions are unchanged.
- Files: `src/ui/screens.js`, `src/ui/menu.js`, `src/styles.css`, `src/ui/README.md`,
  `tests/inventory.test.mjs`, this changelog. Save version unchanged. Run `npm run build` and `npm test`.

## 2026-11-07: Station and ship item grids scroll independently after three rows

- Both inventory grids now show up to three full rows at once and scroll within their own
  window when they contain more. This keeps the station and selected ship hold independently
  browsable without changing the surrounding Inventory layout or other screens.
- Files: `src/styles.css`, `src/ui/README.md`, `tests/inventory.test.mjs`, this changelog.
  Save version unchanged. Run `npm run build` and `npm test`.

## 2026-11-07: Right-click inventory menu can sell a cargo stack

- Right-click an inventory tile to open an extensible context menu. Its first action is Sell,
  which sells that cargo type's whole stack from the station or selected ship hold using the
  existing item prices and refinery bonus. Modules show Sell disabled because they have no
  existing resale value. No inventory/save format changes.
- Files: `src/ui/screens.js`, `src/ui/menu.js`, `src/styles.css`, `src/sim/economy.js`,
  `src/ui/README.md`, `tests/inventory.test.mjs`, this changelog. Run `npm run build` and `npm test`.

## 2026-11-07: Inventory tile text restored to the more readable size

- Raised item names from 11px to 12px and volume labels from 9px to 10px, restoring their
  previous readable sizes while keeping the more compact tile layout.
- Files: `src/styles.css`, this changelog. Run `npm run build` and `npm test`.

## 2026-11-07: Inventory item tiles tightened to reduce empty space

- Reduced each tile's minimum height, padding, typography and spacing, and fit more columns
  across the panel. No inventory behavior or data changed.
- Files: `src/styles.css`, this changelog. Run `npm run build` and `npm test`.

## 2026-11-07: Inventory tiles move one item on click and a stack on Shift-click

- Removed the two small move buttons from every tile. Clicking a tile moves one item;
  Shift-clicking it moves the whole stack. Tiles are slightly shorter to fit more items.
  The inventory data and capacity rules are unchanged.
- Files: `src/ui/screens.js`, `src/ui/menu.js`, `src/styles.css`, `src/ui/README.md`,
  `tests/inventory.test.mjs`, this changelog. Save version unchanged. Run `npm run build` and `npm test`.

---

## 2026-11-07: Inventory contents displayed as a compact grid

- Replaced the long per-item row list in both the station and ship inventories with compact,
  responsive item tiles showing category, quantity, volume and the existing move-one/move-all
  controls. Inventory data and movement actions are unchanged.
- Files: `src/ui/screens.js`, `src/styles.css`, `src/ui/README.md`, `tests/inventory.test.mjs`,
  this changelog. Save version unchanged. Run `npm run build` and `npm test`.

## 2026-11-07: Lateral, vertical and reverse thrust increased to 60%

- Doubled `FLIGHT.strafe`, `FLIGHT.lift` and `FLIGHT.reverse` from 0.3 to 0.6. Forward
  thrust and turn are unchanged. No save data change.
- Files: `src/data/ships.js`, `tests/content.test.mjs`, this changelog. Rebuild and test.

## 2026-11-07: Boost works from any throttle and press snaps throttle to full forward

- Boost no longer requires positive throttle; when active it adds forward acceleration only,
  so it never boosts the ship backward even if throttle is in reverse.
- A fresh Shift press sets throttle to +100% once. Holding boost does not lock the throttle,
  so the pilot can change it while boosting. Existing throttle-to-speed behavior is otherwise
  unchanged. Save version unchanged; no migration needed.
- Files: `src/sim/player.js`, this changelog. Run `npm run build` and `npm test`.

## 2026-11-06: HANDOFF.md rewritten to match the project as it is now (docs only)

- **Why:** the header and a few lines were out of date. It said the built file in the zip predated the
  inventory work (the zip has no built game; the user builds it themselves), gave a workspace path and a
  GitHub address nobody could confirm, and told the assistant to deliver a zip and open the built game
  with `present_file`.
- **Now it says:** save version 11 and 94 tests (counted from `tests/`), that the user builds on their own
  computer, that the inventory has not yet been checked in the real game, how to deliver (complete files,
  full paths, non-coder test steps), the archive rule for the changelog, that this file is rewritten and
  not appended to, and that big features (the planned storyline and missions) are planned first and built
  in small playable slices. The module table, the knobs table, the module pattern and the known gaps were
  checked against `data/modules.js`, `data/ships.js`, `data/sectors.js`, `data/weapons.js` and
  `data/station.js` and are unchanged.
- No code, data or save change. Save version unchanged (11). No rebuild needed.
- Files: `docs/HANDOFF.md`, this changelog.

## 2026-11-06: Docs scale: old changelog entries move to an archive (docs only)

- **`docs/CHANGELOG.md` now keeps only the newest entries in full** (10 at the time of this change). Older
  entries were moved, word for word, into the new `docs/CHANGELOG_ARCHIVE.md`, so nothing was lost.
- **An "Older entries" index at the bottom of the changelog lists every archived entry in one line**
  (date and title), so a new session still knows everything that has been done without reading
  it all. Open the archive only when the index shows something relevant to the task.
- **A written rule for the future:** when the changelog holds more than 15 full entries, move the
  oldest ones to the archive until 10 remain, and add one index line for each one moved
  (see the top of this file and "Keeping the docs scalable" in `ARCHITECTURE.md`).
- Reading order, the checklist in `HOW_TO_ADD.md`, the starter prompt in `AI_PROMPTS.md`, `HANDOFF.md`
  and the READMEs now mention the archive and the index.
- No code, data or save change. Save version unchanged (11). No rebuild needed.
- Files: `docs/CHANGELOG.md`, `docs/CHANGELOG_ARCHIVE.md` (new), `docs/ARCHITECTURE.md`,
  `docs/HOW_TO_ADD.md`, `docs/AI_PROMPTS.md`, `docs/HANDOFF.md`, `README.md`.


## 2026-11-06: Inventory — the station and every ship have room in m³, and you can buy more than one module

- **Why you could only buy one module:** the Shop hid the Buy button as soon as `ownsModule()` was
  true, so a second beam or launcher could never be bought. The shop now always offers Buy (and says
  `You own N`); the only limit is room.
- **New Inventory tab** (between Outfitting and Shop): the **station** on top (ore and modules, with
  `used / room m³`), then the hold of one ship below it, with arrows to step through every ship in the
  hangar (the arrows only change which hold you are looking at, not which ship you fly). Each row
  has `1` and `all` buttons that move that item between the station and the ship shown, limited by
  room at the destination.
- **Everything is in m³.** Ore is 1 m³ a unit (`ITEM_VOL`), each module has a `vol`
  (powerplant 3, cell 3, thrusters 4, shields 3, cannons 2, beam 2, hull 4, missiles 2 — tuning
  in `data/modules.js`). The station holds `250 x Storage bay level` m³; a hold is the hull's size
  (Wasp 20, Bulwark 30, Prospector 70). Ore and modules share the room. Fitted modules take none.
- **Purchases go to the station** (`buyModule`), as many as you like while there is room; a full
  station refuses the sale and charges nothing. **Outfitting fits from the station's modules**: the
  picker shows one square per kind with a count (`Basic cannons x3`). Taking a part off a ship (or
  swapping one) needs room in the station and says so if there is none.
- **Each ship now has its own hold** (`profile.holds[shipId] = { cargo, modules }`). Cargo stays in the
  ship it is in: switching ships no longer carries it along, so the old "Store your cargo first"
  refusal is gone. Mining and crate pickup fill the flown ship's hold, and the HUD `Hold x/y m³`
  now counts carried modules too. A destroyed ship takes its hold with it. The Base screen's
  Store hold / Load stored / Sell hold act on the ship being flown and only on ore.
- **Save version 11.** Saves from before 11 hand their single `cargo` to the ship they were
  flying; other ships start with an empty hold; the station's ore and modules are unchanged.
  Importing and loading old codes works (tests cover it).
- Behaviour you may notice: the missiles that come with the launcher (8) are only given when you
  carry fewer than 8; a second launcher does not top you up.
- New `sim/inventory.js` (pure, no 3D). Files: `data/items.js`, `data/modules.js`, `state/profile.js`,
  `state/state.js` (`ui.invShip`), `sim/inventory.js`, `sim/economy.js`, `sim/fitting.js`,
  `sim/session.js`, `sim/combat.js`, `sim/weapons.js`, `ui/screens.js`, `ui/menu.js`, `styles.css`,
  docs, READMEs, tests (new `tests/inventory.test.mjs`; the prototype-save test now expects the
  hold). **94 tests**, run against a stand-in for three.js because it could not be installed
  there — run `npm test` yourself. `npm run build` needed (not built in that session).


## 2026-11-06: Handoff note brought up to date (docs only)

- `docs/HANDOFF.md` was out of date: its header said save version 7, 64 tests and 581 KB while
  the body said version 10, and it left out the hull module, the missile launcher, the Services
  box and the ship switcher. The outer `HANDOFF.md` also still said 22 tests, 559 KB and that
  `ships.js` holds the Wasp's speed. Rewritten to match the code: save version 10, 81 tests
  (counted from `tests/`), a 587 KB build, all eight modules, current known gaps.
- No code, data or save change. No rebuild needed.
- Files: `docs/HANDOFF.md`, this changelog.


## 2026-11-06: Repairs and missile restock moved into Outfitting

- **The Hangar's "Hull repairs" list is gone.** Repairing now happens in
  Outfitting, in a **Services** box below the 3D viewer: one row, acting on the
  ship currently shown in the viewer — `Hull HP N%`, an `Intact`/`Repair N cr`
  button (same cost curve, same behaviour, same toast).
- **The Shop's "Missile stock" row is gone.** The **Missile restock** row sits
  in the same Services box: `N of cap loaded`, restocks up to the capacity of
  the launcher fitted to the ship in the viewer for 35 cr per missile. Hidden
  when no launcher is fitted.
- The Services box re-reads the selected ship on every render, so switching
  ships with the arrows updates the repair cost and the restock row.
- Save version unchanged (10). Tests: **81 passing** (1 new guard).
  `npm run build` needed.
- Files: `ui/screens.js`, `styles.css`, docs (ARCHITECTURE, TESTING-OUTFITTING), tests.


## 2026-11-06: Ship switcher above the 3D viewer; the berth count is gone

- **Outfitting shows a switcher above the 3D viewer** (left/right arrows with
  the ship's name and `N of M in the hangar` in the middle). It cycles through
  the ships you own, wrap-around, the same selection the Hangar's Fly button
  makes — cargo is respected, so a ship that cannot hold what you carry is
  refused with the same message the Fly button shows. With one ship the arrows
  are disabled. The viewer re-fits the new hull on the next frame.
- **The Hangar's `Berths 2/3` line is removed**; the buy limit that fed it
  still applies and is still enforced on the Buy buttons.
- Tests: **80 passing** (1 new guard). Save version unchanged (10).
  `npm run build` needed.
- Files: `ui/screens.js`, `ui/menu.js`, `styles.css`, docs, tests.


## 2026-11-06: Whole numbers in the top-left readouts; labels recoloured to match their bars

- **The Shield HP / Hull HP / Boost numbers are whole numbers now**
  (`${Math.round(...)}`), matching the bars' coarse granularity.
- **Each top-left label takes its bar's colour** — Shield HP in `--ice`,
  Hull HP in `--ink`, Boost in `--amber` — so the three blocks are
  distinguishable at a glance.
- Save version unchanged (10). `npm run build` needed.
- Files: `index.html`, `styles.css`, `ui/hud.js`.


## 2026-11-06: Numbers on the shield and hull bars — and the units are "Shield HP" / "Hull HP" everywhere

- **The shield and hull bars in the HUD show numbers like boost does**: bottom-left labels
  now read `Shield HP 7.2 / 10` and `Hull HP 10.0 / 10` style — each on one line with its
  reading beside it (the same flex-label treatment as the boost bar; both bars were plain
  labels before). A ship with no shield/hull module reads `none`, like boost with no tank.
- **"Shield HP" and "Hull HP" are the unit names everywhere**: the HUD labels, the bay stat
  lines in Outfitting (`10 Shield HP` / `10 Hull HP`), the shop and Hangar rows, the repairs
  screen, the module data and descriptions, and the user docs (TESTING-OUTFITTING, ARCHITECTURE,
  HOW_TO_ADD, HANDOFF, READMEs). Historical CHANGELOG entries are left as they were written.
- Tests: **79 passing** (1 new guard). Save version unchanged (10). `npm run build` needed.
- Files: `index.html`, `ui/hud.js`, `ui/screens.js`, `data/modules.js`, `data/outfitting.js`,
  `data/ships.js`, `sim/*.js` (comments), `state/*.js` (comments), docs, tests.


## 2026-11-06: Asteroid collision damage scaled to the 10-point hull

- Hull points are 10 now (the hull is a module), so a collision that used to take a tenth of
  the old 100-point bar was effectively removing the ship outright. Asteroid collisions
  (`speed * 0.15`, threshold 25 m/s, same as always) now deal `speed * 0.015` — the same
  proportion of the hull as before, 1/10th the damage. The speed threshold is unchanged.
- Files: `sim/player.js`. Save version unchanged (10). Tests: **78 passing**. `npm run build`
  needed.


## 2026-11-06: The hull is a module — "Basic hull", 10 hit points, no module fitted means none

- **New hull module: `hull_basic` ("Basic hull")**, 10 hit points, standard issue in every
  hull bay (the bay existed but could hold nothing). Hit points work exactly like shield
  points — the fitted module decides how many the ship has (`sim/hull.js`, read from
  `MODULES[id].hp`), and **no hull module fitted means no hit points at all**: `P.hull` is 0
  and the first hit that reaches the hull emits `player-dead` — a one-shot kill, exactly the
  "fly without shields" rule. Shields, if fitted, still absorb their hits first.
- **Hit points no longer come from `SHIPS[].hull`** — the stat is gone from the data, from
  repairs (`economy.repairCost` now reads the fitted module's `hp`), from the Hangar row
  (`Hull 10` is the fitted amount) and from the tests; a hull with no module shows `Hull 0`.
- **Damage is never forgotten and never given for free.** The hull fraction lives in
  `profile.hp[ship]`, stamped on every hull hit in `hurt()` and on dock, so a fit change, a
  hangar visit or a ship switch keeps the damage taken — unfitting the hull at the outpost
  drops the ship to 0 points, and fitting it back restores the fraction (never a free repair;
  topping it up stays the paid Hangar repair). `refreshHull()` is called wherever
  `refreshShield()` is.
- **Save version 10.** Saves from before 10 get `hull_basic` fitted into their hull bays
  (like the thrusters, shields and cannons before it — the bay was unfillable); a v10 save
  where the player emptied the bay stays hull-less. Existing ships effectively go from
  100 HP to 10 HP, and saved `hp` fractions carry over, so a damaged ship is equally damaged.
- **Outfitting** shows `10 hull` under the bay name like other modules; `hit points` are not
  affected by the flat power bill, and `FLIGHT` is untouched.
- Files: `data/modules.js` (`hull_basic`, `STOCK_FIT.hull`), `data/ships.js` (stat removed),
  `sim/hull.js` (new), `sim/player.js` (`setShip`, placeholder, `hurt()` stamps the fraction),
  `sim/session.js`, `sim/economy.js`, `sim/fitting.js`, `ui/hud.js` (bar guard), `ui/screens.js`
  (stat line + Hangar row), `main.js`, `ui/menu.js`, `state/profile.js` (v10), tests
  (**78 passing**, 3 new), READMEs, docs. `npm run build` needed.


## 2026-11-06: The missile launcher is a module — "Basic missiles", 8 damage, 12 cap, 4 s reload — and the beam shows its rate

- **The shop missile launcher is gone; Basic missiles (`missile_basic`) is a module now**,
  in the `secondary` group, bought for the same 1500 cr (the row reads *Owned* once bought,
  and buying still includes 8 missiles). Fit it in the Secondary weapons bay like any other
  module. It works exactly like the old launcher — right click, the dashed lock cone, MISSILE
  LOCK, homing, 7 s life — with three changes: **8 damage per missile** (was 80), a
  **12-missile capacity** (unchanged) and **4 seconds between launches** (was 0.9 s). The
  stock is still refilled at the Shop (35 cr per missile), and the restock row now appears
  when a launcher is fitted, capped by it.
- The missile's flight and lock-on mechanics moved conceptually into the launcher module;
  what stays in `data/weapons.js` is the missile itself plus the ammunition price
  (`MISSILE`) and the Shop rows (`SHOP_WEAPONS`). `sim/guns.js` gained `missilesOf()` and
  `refreshGuns()` now also sets `state.missiles`; a fired missile carries its module's damage,
  so a mid-flight fit change cannot alter what is already in the air.
- **Save version 9.** Saves from before 9 whose owner had bought the launcher get one
  `missile_basic` in storage instead (not auto-fitted; their carried missiles stay, clamped
  to 12). The whole `profile.wp` object left the save — ownership of both formerly flagged
  weapons is now the module's presence.
- **The Outfitting bay shows the beam's mining rate**: **0.25 m³/s** under `Basic mining beam`
  (one ore = 1 m³, one ore per 4 s of contact), the same stat line other modules get. The
  missiles bay shows `8 dmg, 12 cap, 4 s reload`.
- Files: `data/modules.js` (`missile_basic`), `data/weapons.js`, `state/profile.js` (v9),
  `sim/guns.js` (`missilesOf`), `state/state.js`, `sim/weapons.js`, `sim/economy.js`,
  `ui/screens.js` (stat lines, shop rows), `ui/hud.js`, READMEs, docs, tests (**75 passing**,
  3 new). `npm run build` needed.


## 2026-11-06: All hulls are the same ship apart from the hold — and the hold is measured in m³

- **Wasp, Prospector and Bulwark now have identical stats.** Hull 100, gun damage ×1, mining
  rate ×1 (the Prospector's ×2.3 is gone — no more ≈1.7 s ores), model scale 1 and price
  600 cr on every hull. The only remaining difference is the hold, which is why the hold was
  kept: **Wasp 20 m³, Bulwark 30 m³, Prospector 70 m³**. One cargo unit = 1 m³.
  Colours and the per-hull add-on meshes (the Prospector's drill, the Bulwark's plates) are
  kept, so the hulls remain visually distinct. Ship-specific bonuses arrive later; a test
  pins the everything-but-the-hold identity.
- **Holds are shown in m³**: the HUD readout (`Hold 12/20 m³`), the Hangar rows and the
  Cargo and storage panel. 1 unit of cargo occupies 1 m³, for every item type.
- Save version unchanged (8) — no saved-data shape changed. Repair costs drop for owners
  of the big hulls (hull 100 across the board); `hp` fractions persist, so damage carries
  over correctly.
- Files: `data/ships.js`, `ui/hud.js`, `ui/screens.js`, READMEs/docs, tests (**72 passing**,
  1 new). `npm run build` needed.


---


## 2026-11-06: The beam bar moves under the mining hint, only while cutting — and an ore-secured chime

- **The beam progress bar is smaller, moved, and shows only while mining.** It now sits
  directly under the amber "… left in rock" hint (top 62%) — the text that already tells you
  what the rock holds — is 150 px wide with a 4 px bar and 11 px labels, and is visible only
  while the beam is actually cutting (`state.flight.beamOn`). It was bottom centre above the
  power block and visible whenever the beam slot was selected with a beam fitted.
- **A satisfying chime when an ore banks.** `oreGained()` in `core/audio.js` — a warm
  ascending D5–A5–D6 — plays the moment a beam cycle completes (progress hits 100%), on top of
  the existing hold-capacity rules.
- Files: `src/index.html` (`#bm` after `#pr`), `styles.css` (`#bm`), `ui/hud.js` (visibility
  condition), `core/audio.js` (`oreGained`), `sim/weapons.js` (calls it), READMEs, docs.
- Save version unchanged (8). Tests: **71 passing**. `npm run build` needed.


## 2026-11-06: Beam progress resets the moment contact is lost; beam bar in the HUD; module names in the UI

- **The 2-second grace is gone.** The instant the beam stops cutting — ship off the rock,
  trigger released, mine out of reach, cargo full, or not enough power — the progress toward
  the next ore is lost straight away (`state.flight.beamT` → 0, one "Beam contact lost — the
  ore starts again" message). `state.flight.beamIdle` and the `BEAM_RESET` constant are gone,
  and a test guards the immediate reset. Dock/launch/fit/warp still clear the count.
- **New beam progress bar in the HUD.** Bottom centre, above the power readout: the fitted
  beam's name and the percentage on the right (`Basic mining beam … 37%`), filling toward the
  next ore. Shown only while the beam slot is selected and a beam is fitted.
- **The primary line and the equip toast take the modules' own names.** `moduleListName()` in
  `sim/guns.js` builds them — `Basic cannons` with one gun, `Basic cannons x2` with both bays
  (same module), `Basic mining beam` in the beam slot, `A + B` for a mixed pair — and the HUD
  and `setWeapon` share it, so they can never disagree. The hardcoded `Cannons` /
  `Mining beam` / `Cannons equipped` / `Mining beam equipped` strings are gone; the shop row
  for the beam now reads **Basic mining beam** (it buys exactly that module).
- Files: `ui/hud.js` (bar + primary line), `src/index.html` (`#bm`), `styles.css` (`#bm`
  block, mirrors `#pw`), `sim/guns.js` (`moduleListName`), `sim/weapons.js`, `state/state.js`,
  `sim/sectors.js`, `data/weapons.js`, READMEs, tests.
- Save version unchanged (8). Tests: **71 passing** (2 new). `npm run build` needed.


## 2026-11-06: The mining beam is a module — "Basic mining beam", one ore per 4 s of contact

- **Replaces the old mining beam outright.** Same Shop slot and price (900 cr), but buying it
  now drops a `beam_basic` module into storage (the row reads *Owned* once it is somewhere you
  own, fitted or in storage). The `wp.beam` flag is gone from the save.
- **Fits either primary bay**, like a gun — Outfitting, fit it in a bay. **Key 2** selects the
  beam slot; with no beam fitted the slot is the `Empty weapon slot` and left click does nothing.
- **One ore per 4 seconds of uninterrupted contact** with the rock (scaled by the hull's `mine`
  multiplier, so the Prospector cuts faster). The ore banks per completed 4-second cycle; the
  rock depletes one ore at a time and disappears when dry.
- **Two seconds off the rock and the count toward the next ore resets.** Contact is timed per
  frame (`state.flight.beamT` / `beamIdle`); taking off the target for more than 2 s discards
  the in-progress ore with the message "Beam contact lost — the ore starts again". A fit
  change, dock/launch, load or warp clears the count too.
- **2 MJ/s while cutting** — reported as `setDraw("beam", …)` with a new `state.power.use.beam`,
  gated by `hasPower()`, and drawn only while actually mining (not with the slot merely
  selected, not without a rock in reach) — the same rules the guns follow.
- **Save version 8.** Saves from before 8 whose `wp.beam` was set (players who had bought the
  beam) get one `beam_basic` in storage on load — **not auto-fitted**; fit it once and carry on.
  Re-importing an old code cannot double-grant. The `beam` flag is dropped from the save.
- Files: `data/modules.js` (`beam_basic`), `data/weapons.js` (beam leaves weapon data; the
  shop row gains a `module` field), `sim/guns.js` (`beamsOf`, refreshes `state.beams`),
  `sim/weapons.js` (beam rewrite), `sim/sectors.js` (warp clears the count),
  `sim/economy.js` (shop purchase → module storage), `sim/fitting.js` (`ownsModule`),
  `state/state.js` (`flight.beamT`/`beamIdle`, `beams`, `power.use.beam`), `ui/hud.js` (slot
  line), `ui/screens.js` (shop *Owned* check), `state/profile.js` (v8 + migration),
  plus docs and tests.
- Behaviour note: the beam and the guns can coexist in the two primary bays; key 1/2 decides
  which left click fires. If two beams are fitted, the first bay's beam is the one that cuts.
- Tests: **70 passing** (4 new). `npm run build` needed.
- Known limit: the beam has no dedicated progress bar; the mining hum tracks the rock's
  remaining ore as before, and an interrupted count is only visible via the reset message.


## 2026-11-06: "Empty weapon slot" now covers an empty cannon slot too

- **One wording for every empty primary slot.** With every primary bay empty, the top-right
  HUD line now reads `Empty weapon slot` (it said `No guns` before), and pressing 1 toasts
  `Empty weapon slot` instead of `Cannons equipped`. The slot behaves the same as the empty
  beam slot: left click does nothing, and the HUD and toast agree with each other.
- Unchanged: `Cannons` / `Cannons x2` with guns fitted, `Mining beam` with the beam bought,
  and left click firing only in a filled slot.
- Files: `src/ui/hud.js` (the primary line), `src/sim/weapons.js` (`setWeapon` toast),
  `tests/content.test.mjs` (guard: the old wording is gone), `TESTING-OUTFITTING.md`.
- Save version unchanged (7). Tests: 66 passing. `npm run build` needed.


## 2026-11-06: Keys 1 and 2 now cycle the primary slots; key 2 with no beam is the "Empty weapon slot"

- **Pressing 2 selects the beam slot even with no mining beam bought.** The centre-screen
  message says **"Empty weapon slot"** (instead of refusing the switch or naming a weapon
  you do not have), the top-right HUD line reads `Empty weapon slot`, and **left click does
  nothing** in that slot — the guns only answer in the cannon slot, the beam only with the
  beam bought. Key 1 switches back to the cannon slot at any time.
- **Cycling model**: 1 = cannon slot (whatever the primary bays are fitted with — already
  symmetric: with no guns fitted it shows `No guns` and left click does nothing), 2 = mining
  beam slot (`Mining beam` once bought, `Empty weapon slot` until then).
- **Buying the beam** flips the slot to the beam without any extra step; the selected slot is
  saved as before (`pw` stays "beam" in a save, same as always) — no save change (still v7).
- Files: `src/sim/weapons.js` (`setWeapon` cycles slots unconditionally), `src/ui/hud.js`
  (the primary line names the empty slot), `tests/content.test.mjs` (wording guard).
- Behaviour change from the two earlier today entries: pressing 2 with no beam is no longer
  silent — it equips the empty beam slot and switches the HUD line with it.
- Tests: 66 passing. `npm run build` needed.


## 2026-11-06: Pressing 2 with no mining beam fitted no longer shows a message

- **Switching to an unavailable primary weapon is now silent.** Pressing 2 with no mining
  beam bought simply does nothing and says nothing, instead of toasting "No mining beam
  installed. Buy one in the station shop." The `"Cannons equipped"` / `"Mining beam equipped"`
  confirmations and every other message are unchanged; the beam still cannot be equipped
  until it is bought.
- Files: `src/sim/weapons.js` (`setWeapon`).
- Save version unchanged (7). Tests: 65 passing. `npm run build` needed.


## 2026-11-06: Twin-linked bolts fire from the fixed nose hardpoints (one per side)

- **Follow-up to the twin-linked cannons below**: the two bolts no longer straddle the gun's
  bay mount (both came from the same side of the nose). A multi-barrel gun now fires from the
  **fixed nose hardpoints at -1.8 m and +1.8 m**, one bolt per side — the pre-module cannon
  layout. `BARREL_SPACING` in `sim/weapons.js` is now 3.6 m; single barrels still fire from
  their bay mount (`-1.8 + 3.6 * i`).
- Positions are the same whichever primary bay the gun sits in. Two twin-linked guns fitted at
  once (impossible today — one `cannon_basic` exists and nothing sells parts yet) would each
  fire their own pair from the same hardpoints.
- Rate, power draw, damage and the `barrels` stat are unchanged. No save change (still v7).
- Files: `sim/weapons.js` (hardpoint rule + comment), `docs/ARCHITECTURE.md`.
- Tests: 65 passing. `npm run build` needed.


## 2026-11-06: Basic cannons fire two bolts per shot again (twin-linked barrels)

- **`cannon_basic` links two barrels** (`barrels: 2` on the module): one trigger pull now puts
  **two bolts** downrange, side by side (0.9 m apart, `BARREL_SPACING` in `sim/weapons.js`),
  straddling the gun's own mount — the way the cannons fired before they became a module.
  One gun in the first primary bay is enough for the pair of bolts.
- **Same fire rate, per barrel**: 3 shots a second per barrel, on the gun's own `1 / rate`
  cooldown as before. **Same power draw**: 2 MJ/s a gun while the trigger is held, however
  many bolts come out (the `guns` share in `state.power.use` counts guns, not bolts).
- **Damage per bolt unchanged** at 1 (before the hull's `dmg` multiplier), so a pair is 2
  damage per shot per gun; a Newbie Raider (10 hull) drops in about two seconds of fire from
  the stock fit. No behaviour change when both primary bays are filled: each fitted gun fires
  its own linked pair (four bolts a volley).
- **Outfitting bay shows it**: the stat line for the cannon reads `1 dmg x2, 3/s`.
- Files: `data/modules.js` (`barrels` + `rate` noted per barrel), `sim/guns.js` (carries
  `barrels`, default 1), `sim/weapons.js` (one bolt per barrel, `BARREL_SPACING`),
  `ui/screens.js` (`moduleStat` shows x2), docs (`ARCHITECTURE.md`, `HOW_TO_ADD.md` recipe 16,
  folder READMEs) and tests updated.
- **Save version unchanged (7).** `barrels` is a module stat, not saved data.
- Tests: 65 passing (2 new guard assertions plus the fire-loop rule). `npm run build` needed.


## 2026-11-06: Basic cannons are a module you can fit in either primary bay; raiders are Newbie Raiders with 10 hull

- **Basic cannons are now a module** (`cannon_basic`, group `primary`): **1 damage a shot, 3
  shots a second, 2 MJ/s while the trigger is held**, 900 m/s bolts. Every hull is delivered with
  one in the first primary bay; the second bay starts empty. The same gun works in **either**
  bay — the bay only decides which barrel the shot leaves from — and both bays firing means two
  guns on their own 1/3-second cooldowns, 4 MJ/s while the trigger is down.
- **Left click still fires the primary.** Keys 1 and 2 still switch between cannons and the
  mining beam; the fitted guns are what actually shoot. An empty pair of primary bays means left
  click does nothing and costs nothing.
- **Guns draw power like everything else.** They report `setDraw("guns", …)`, so the power
  readout climbs by 2 MJ/s a gun while firing and drops back when you let go; with no power left
  they stop firing rather than draining a dead cell.
- **The flight HUD's primary line counts the guns.** Top right it reads `Cannons`, `Cannons x2`
  when both bays are filled, or `No guns` when they are empty (and `Mining beam` after key 2).
- **Pirate raiders are now "Newbie Raiders"** and have **10 hull points, no shields** — three
  seconds of cannon fire from the stock Wasp. The target lock and the HUD read the name instead
  of "hostile NN%", so a lock now says `Locked Newbie Raider 100%`. The 70 + 25-per-tier hit
  points are gone: every raider is the same 10-point hull now.
- **Files:** `data/modules.js` (`cannon_basic`, `STOCK_FIT.primary`), `data/weapons.js`
  (`PRIMARY.cannon` removed — guns are modules), `sim/guns.js` (**new**: `gunsOf`, `refreshGuns`),
  `sim/weapons.js` (per-gun cooldowns and barrels, the 2 MJ/s draw, `hasPower` gate),
  `state/state.js` (`state.guns`, `flight.gunCd`, `flight.gunsOn`, `power.use.guns`),
  `sim/{fitting,session,economy,power}.js` and `ui/menu.js` refresh the guns wherever the drive
  and shields are refreshed, `sim/ai.js` (`RAIDER` constant), `sim/targeting.js` (`lockName`),
  `ui/screens.js` (`moduleStat` shows `1 dmg, 3/s`), `ui/hud.js` (the primary line counts the
  guns).
- **Save version 7.** Older saves gain a basic cannon in their first primary bay (empty bays
  stay empty if the save is already v7).
- Tests: 64 passing (4 new: the cannon figures, either-bay gunnery, the version-7 migration, the
  Newbie Raider). `npm run build` needed (581 KB).
- Verified headless: 3 bolts a second and 1 damage each, 2 MJ/s a gun (4 with two guns), guns
  stop at 5.0 s on a 10 MJ cell with one gun and 2.5 s with two, no power means no shots, no gun
  means no draw, and `spawnPirate` makes a 10 HP "Newbie Raider" with no shield pool.


## 2026-11-06: The boost tank has numbers: 10 units, 2 a second out, 1 a second back

- **The boost bar is now a fuel tank measured in units.** Basic thrusters hold **10 units**,
  burn **2 a second** while boosting (about five seconds from full to the reserve) and refill at
  **1 a second** when you let go. Mechanically nothing changed: the ignition still costs a flat
  20 MJ, filling the tank is still free, and the boost still doubles the drive.
- **The numbers are on the module** (`bmax: 10`, `buse: 2`, `bfill: 1` on `thruster_basic`), so a
  future thruster can carry a bigger tank or a thirstier boost without touching code — the same
  pattern as speed, turn and the power draw.
- **The HUD shows it.** The Boost line, top left, now reads like `Boost 8.4 / 10` beside the bar,
  so you can see the exact fuel as well as roughly how full it is. With no thrusters fitted it
  reads `none`.
- The old invisible numbers (a 0–100 meter, 28 a second out and 10 a second back) are gone;
  `state.drive` carries the tank, `sim/drive.js` sizes it (`P.enMax`), and the outpost fills it on
  launch.
- Files: `data/modules.js`, `sim/drive.js` (`driveOf`, `refreshDrive`), `sim/player.js` (burn and
  refill from the drive, small reserve before the boost will light), `sim/session.js` (full tank
  on launch), `ui/hud.js`, `src/index.html`, `styles.css` (the Boost reading).
- Tests: one new (the tank figures on the module and in the drive) plus the drive-shape
  expectations → **60 passing**. No save change: still version 6. `npm run build` needed (580 KB).
- Verified headless: launch 10.0 / 10, boosting 8 → 6 → 4 → 2 a second, boost cut out at 4.78 s
  with 0.5 left, refill 0.5 → 5.5 over five seconds, and no boost under 0.5 units.


## 2026-11-06: Shield power made simple: a flat 2 MJ/s, and shields bleed when it is not there

- **Shields now draw a straight 2 MJ/s all the time** while a shield module is fitted — full,
  filling or under fire, it is the same bill. The 1/2 split is gone, so `chg` is off the module
  and `draw: 2` replaces it.
- **If the ship cannot supply that 2 MJ/s** (powerplant gone and cells flat), the shields stop
  holding themselves together: they **discharge at 1 point a second** (`drain: 1`) down to 0, and
  **stay at 0** until the ship can pay again. Then the normal rule applies — the 4 second lull,
  then 1 point a second back.
- HUD with the basic fit: **2 MJ/s** parked, **4** flying, **5** boosting, **4** while shields
  fill after a fight, **2** with the shields pulled out.
- Files: `data/modules.js` (`draw: 2`, `drain: 1`, `chg` removed), `sim/shield.js`
  (`shieldDraw(shield)` is now flat, `updateShield` discharges when `hasPower()` says no).
- Tests: the shield power tests were rewritten and a discharge test added → **59 passing**.
  No save change: still version 6. `npm run build` needed (579 KB).


## 2026-11-06: Shields cost power: 1 MJ/s up, 2 MJ/s while recharging

- **Basic shields draw 1 MJ/s whenever they are fitted and up**, and **2 MJ/s in total while they
  are actually recharging**. Full shields still cost their 1 MJ/s; the extra 1 only applies while
  points are going back in.
- **The power bill is now a sum.** `state.power` gained `use: { drive, shield }` and
  `sim/power.js` gained `setDraw(system, mjps)`: the thrusters and the shields each report their
  own figure once a frame, and `draw` (what the HUD shows and `hasPower()` checks) is the total.
  A third consumer later is one more name in `use` and one `setDraw()` call.
- **The numbers live on the module** (`draw: 1`, `chg: 1` on `shield_basic`), so a better shield
  can be thirstier without touching code, the way thrusters already work.
- **No power, no recharge**: if the ship cannot pay the bill (no powerplant and empty cells) the
  shields hold where they are instead of filling, exactly as the thrusters lose thrust. They
  still show their standing 1 MJ/s of demand, the same way the drive shows its 2.
- Files: `data/modules.js`, `sim/shield.js` (`shieldDraw`, `updateShield` charges the ship),
  `sim/power.js` (`setDraw`, `refreshPower` clears both shares), `sim/player.js` (drive share),
  `state/state.js` (`power.use`).
- With the basic fit the HUD now reads **1 MJ/s** parked, **3** flying, **4** boosting, and **4**
  while flying with shields filling.
- Tests: 2 new (`shieldDraw`, and the power bill following the shields) plus rescaled
  expectations → **58 passing**. No save change: still version 6. `npm run build` needed
  (579 KB).


## 2026-11-06: Smaller shield numbers: 10 points, 1 a second, 1 damage a shot

Everything shield-related is divided by ten, so the numbers are easy to read at a glance.

- **Basic shields: 10 points** (was 100) and **1 point a second** (was 10). The 4 second lull
  before recharging, and the rule that any hit restarts it, are unchanged.
- **Pirate cannons do 1 damage a shot** (was 10), in `sim/ai.js`, so a fight against basic
  shields still takes the same number of hits: ten to strip the shields, then the hull.
- The shield bar in flight therefore moves a tenth at a time; with a cell-like cap of 10 it
  refills from empty in about ten quiet seconds.
- Tests rescaled to match (shield rules, the module figures, the pirate damage guard) →
  **56 passing**. No save change: still version 6. `npm run build` needed (579 KB).


## 2026-11-06: Shields are a module now; pirate cannons do 10 a shot

- **New module: `shield_basic` ("Basic shields")**, fitted to every hull from the start and
  fittable in the shield bay that was already in the Outfitting layout. It holds **100 shield
  points**, recharges at **10 points a second**, and will not start recharging until the ship has
  gone **4 seconds without being hit**. Any hit inside that lull restarts the clock, so the
  recharge is off for as long as somebody is shooting at you.
- **Shields are no longer a hull stat.** `SHIPS` lost its `sh` field (and the Hangar row no
  longer quotes a shield figure); `sim/shield.js` turns the fitted module into `state.shield`
  (`cap`, `regen`, `delay`) and `P.shMax`. No shield module means no shields: every hit goes
  straight to the hull.
- **Pirate cannons now do 10 damage a shot** (was 7), in `sim/ai.js`. Against basic shields that
  is ten hits to strip them, then ten more for a Wasp's hull.
- **Save version 6.** Saves from v5 or older have an empty shield bay because the group did not
  exist then, so they are retrofitted with basic shields on load (same rule the thrusters got in
  v5). A v6 save where the player really took the shields out stays shieldless. `cleanLoadouts`
  now keeps a list of groups added after a save's version instead of one flag per group.
- Files: `data/modules.js` (`shield_basic`, `STOCK_FIT.shield`), new `sim/shield.js`
  (`shieldOf`, `refreshShield`, `updateShield`), `state/state.js` (`state.shield`),
  `state/profile.js` (v6 + retrofit), `sim/player.js` (no shield stats on the ship, recharge
  moved out of `flight()`), `main.js`, `sim/fitting.js`, `sim/session.js`, `sim/economy.js`,
  `ui/menu.js` (refresh on dock/fit/ship change/load), `ui/hud.js` (bar copes with no shields),
  `ui/screens.js` (`100 shields` in the bay, Hangar row without a shield figure), `sim/ai.js`.
- **Special shields later:** a module that recharges even under fire is one more field read by
  `updateShield()` (for example `live` for a reduced under-fire rate). Nothing outside
  `sim/shield.js` needs to change for that.
- Verified headless: ten 10-damage hits took 100 → 0 shields with the hull untouched, hit 11
  took 10 hull; with a hit at t=0 the shields sat still at 90 through 3.9 s and were full again
  by 5 s; with the bay empty a 10-damage hit cost exactly 10 hull.
- Tests: 3 new files' worth — shield rules (`tests/shield.test.mjs`, 6 tests), the module and
  stock fit, the v5 → v6 retrofit, the pirate damage figure, and equip/unequip moving `P.shMax`
  → **56 passing**. `npm run build` needed (579 KB).


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

