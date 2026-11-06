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

## Older entries (index; full text in [CHANGELOG_ARCHIVE.md](CHANGELOG_ARCHIVE.md))

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
