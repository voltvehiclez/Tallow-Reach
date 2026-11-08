# Changelog

Newest first. Every AI session adds a short entry when it changes the project, so the
next assistant (which has no memory of earlier chats) can see what happened and why.

Entry format: date, a one-line title, then what changed, which files, and anything
the next person must know (save version, rebuild needed, known issues).

**How this file stays a useful size**

- This file holds the newest entries in full, then the **Older entries** index at the bottom:
  one line for every entry that has been moved to [CHANGELOG_ARCHIVE.md](CHANGELOG_ARCHIVE.md).
  Read the entries here and the index; open the archive only when the index shows something
  relevant to the task (the archive has the full text, nothing was shortened).
- **Rule:** when this file holds more than 15 full entries, move the oldest ones to the top of
  the archive (word for word, newest first) until 10 remain, and add one index line for each
  entry moved, at the top of the index. Do this in the same change that adds the new entry.
- Never delete an entry. History is only ever moved.

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

---

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

## Older entries (index; full text in [CHANGELOG_ARCHIVE.md](CHANGELOG_ARCHIVE.md))

- 2026-11-07: Inventory Sell quantity uses a game-styled popover
- 2026-11-07: Inventory Sell asks how many units to sell
- 2026-11-07: Inventory grids use five narrower, shorter slots per row
- 2026-11-07: Inventory grids keep their size when empty, and moves no longer show status text
- 2026-11-07: Station and ship item grids scroll independently after three rows
- 2026-11-07: Right-click inventory menu can sell a cargo stack
- 2026-11-07: Inventory tile text restored to the more readable size
- 2026-11-07: Inventory item tiles tightened to reduce empty space
- 2026-11-07: Inventory tiles move one item on click and a stack on Shift-click
- 2026-11-07: Inventory contents displayed as a compact grid
- 2026-11-07: Lateral, vertical and reverse thrust increased to 60%
- 2026-11-07: Boost works from any throttle and press snaps throttle to full forward
- 2026-11-06: HANDOFF.md rewritten to match the project as it is now (docs only)
- 2026-11-06: Docs scale: old changelog entries move to an archive (docs only)
- 2026-11-06: Inventory — the station and every ship have room in m³, and you can buy more than one module
- 2026-11-06: Handoff note brought up to date (docs only)
- 2026-11-06: Repairs and missile restock moved into Outfitting
- 2026-11-06: Ship switcher above the 3D viewer; the berth count is gone
- 2026-11-06: Whole numbers in the top-left readouts; labels recoloured to match their bars
- 2026-11-06: Numbers on the shield and hull bars — and the units are "Shield HP" / "Hull HP" everywhere
- 2026-11-06: Asteroid collision damage scaled to the 10-point hull
- 2026-11-06: The hull is a module — "Basic hull", 10 hit points, no module fitted means none
- 2026-11-06: The missile launcher is a module — "Basic missiles", 8 damage, 12 cap, 4 s reload — and the beam shows its rate
- 2026-11-06: All hulls are the same ship apart from the hold — and the hold is measured in m³
- 2026-11-06: The beam bar moves under the mining hint, only while cutting — and an ore-secured chime
- 2026-11-06: Beam progress resets the moment contact is lost; beam bar in the HUD; module names in the UI
- 2026-11-06: The mining beam is a module — "Basic mining beam", one ore per 4 s of contact
- 2026-11-06: "Empty weapon slot" now covers an empty cannon slot too
- 2026-11-06: Keys 1 and 2 now cycle the primary slots; key 2 with no beam is the "Empty weapon slot"
- 2026-11-06: Pressing 2 with no mining beam fitted no longer shows a message
- 2026-11-06: Twin-linked bolts fire from the fixed nose hardpoints (one per side)
- 2026-11-06: Basic cannons fire two bolts per shot again (twin-linked barrels)
- 2026-11-06: Basic cannons are a module you can fit in either primary bay; raiders are Newbie Raiders with 10 hull
- 2026-11-06: The boost tank has numbers: 10 units, 2 a second out, 1 a second back
- 2026-11-06: Shield power made simple: a flat 2 MJ/s, and shields bleed when it is not there
- 2026-11-06: Shields cost power: 1 MJ/s up, 2 MJ/s while recharging
- 2026-11-06: Smaller shield numbers: 10 points, 1 a second, 1 damage a shot
- 2026-11-06: Shields are a module now; pirate cannons do 10 a shot
- 2026-11-06: Lighting the boost costs a flat 20 MJ; refilling the meter is free
- 2026-11-06: Thrusters use power, and a dry cell winds the speed down
- 2026-11-06: "Equip thrusters to move" warns you when a dead ship ignores the controls
- 2026-11-06: No thrusters means no movement, no turning and no boost
- 2026-11-06: Paint bays are clickable, and show an empty colour store
- 2026-11-06: Fix: the Appearance bays lost their boxes
- 2026-11-06: Basic thrusters, and every hull flies like the Wasp
- 2026-11-06: Click a bay to fit a module, or unequip one into storage
- 2026-11-06: Basic powerplant and power cell, with a power bar in flight
- 2026-11-06: Powerplant talks in MJ/s, not MW
- 2026-11-06: Appearance card under the Hull bay
- 2026-11-06: Outfitting screen with a 3D ship viewer
- 2026-11-05: The chase camera stops running away at speed
- 2026-11-05: Flight feels heavier: slower turn, weak side/reverse thrusters
- 2026-11-05: Warp lets the ship coast and unwind, instead of freezing it
- 2026-11-05: Fix: no rotation when warping
- 2026-11-05: Warp animation, warp sound, and a two-second warp
- 2026-11-05: Second sector, warp on M
- 2026-11-05: Project tidy for growth (no gameplay change)
- 2026-11-05: Pause menu and mute
- 0.2.0: Baseline
