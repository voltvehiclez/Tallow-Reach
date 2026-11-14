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
- **Rule:** this file holds **at most 10 full entries**. When adding an entry leaves more than 10, move the
  oldest ones to the top of the archive (word for word, newest first) so exactly 10 remain, and add one index
  line for each entry moved, at the top of the index. Do this in the same change that adds the new entry.
  `tests/docs.test.mjs` fails if there are more than 10, or if the index and the archive disagree.
- Never delete an entry. History is only ever moved.

---

## 2026-11-14: Slice 14c built — simple wormholes spawn themselves, and save v21

Owner, 2026-11-14, spelling out the natural-wormhole model: a pocket spawns itself in normal space, its 20 minutes run
from the pocket's spawn, running out only collapses the way in, and the far side is always escapable through a
**Stable wormhole** with no clock. The build is **save v21** (v20 → v21 migration, unchanged storage keys, old-save test).
**Not playtested yet — ROADMAP 14c stays unticked and the slice is a draft until the owner passes it**
(`testing/TESTING-14C-WORMHOLES.md`). Rebuild needed (`npm run build`, then `npm test`).

- **How many, where.** A **standing population of 75** simple wormholes in the universe at all times, **never more than 3 per system** (`WORMHOLE_SPAWN`). A fresh universe (or a legacy fill from an old save) rolls each one's remaining clock at random between 0 and 20 minutes so the sky never cycles in sync; **every replacement that pops up after an expiry gets the full 20 minutes**. When one expires, a replacement spawns somewhere else. No spawn notice — the marker on the system's map is all the warning there is.
- **The pocket** is a registered place (like a rift instance, through `registerWormholePlace`): a skybox, interesting asteroid formations, and a centre **grey dark sphere** the pilot can lock — "Simple Wormhole", greyish radiance, colder than a rift (`views.js` `buildSimpleWormhole`; new `shroud` sky in `SKY_KINDS` with `SKIES.shroud` in `render/scene.js`). It hangs on that system's map at a fixed dot derived from its seed, warps like any other pocket, and carries **20 minutes from pocket spawn, saved in `world.wormholes`** (id, parent system, seed, template, remaining clock).
- **The far side** is a site from `WORMHOLE_SITE_POOL`: **wh_smugglers** (smugglers and a freighter hauling illegal goods — destroy them), **wh_mining** (a lumenite belt — a new `mine-ore` objective kind, `ore: "lumenite"`, need 4, no hostiles, no cache), **wh_hive** (a guardian hive — good loot, **no cache**). Each site is `reentrant`: leave at any time through the always-open **Stable wormhole** (no clock, never locked); come back until the 20 minutes are spent. Objective and rewards are one-time per wormhole (the run is saved; `mined` progress is captured in `world.instances`).
- **Expiry fires `collapse` only** — the entry fades in normal space, the Stable wormhole remains usable, and nothing `kill`-s, ever. A collapsed pocket lingers only while the pilot is in it or in its run; otherwise it despawns at once (proposed rule, not owner-approved yet). A replacement pops up elsewhere either way.
- **Data the slice adds:** items `lumenite` (ore, v150) and `contraband` (trade, v220, ordinary cargo — no legality system); enemies `smuggler` (its own hostile so hunt contracts never pay for it), `freighter` ("Smuggling Freighter") and `hiveguardian`; loot `wh_rock`, `smuggler`, `freighter`, `hiveguardian`; the `mine-ore` entry in `OBJECTIVE_KINDS`; `{groups: [...]}` for compatible wave declarations (backwards compatible with the single-`{enemy,count}` form); `waveGroups()` normaliser in `data/instances.js`.
- **Save v21.** `SAVE_VERSION = 21`; `world.instances` runs keep their `mined` progress; a new `cleanWormholes` keeps `world.wormholes` honest (id re-derivable from seed, parent must be a system of this galaxy, template must be a real re-enterable site, clock kept). A saved wormhole pocket rebuilds before validation the same way a saved run site does. **step 15 is v22.** Old-save tests cover the migration; `step14-instances.test.mjs` re-derives wormhole records and templates.
- **Open questions for the owner** (asked in the playtest guide / next round): equal-weight site pool; contraband as ordinary cargo; the countdown's visibility (starmap tooltip? HUD?); spawn-eligibility (home system? uncharted?); what happens to a collapsed pocket nobody sees; whether the door is lockable only for a lock, not a trigger.

Files: `src/data/instances.js`, `src/data/items.js`, `src/data/loot.js`, `src/data/enemies.js`, `src/data/places.js`, `src/state/state.js`, `src/state/profile.js`, `src/sim/wormholes.js` (new), `src/sim/instances.js`, `src/sim/session.js`, `src/sim/step.js`, `src/sim/galaxy-session.js`, `src/main.js`, `src/util/events.js`, `src/render/views.js`, `src/render/scene.js` and the folder READMEs, `tests/step14-instances.test.mjs`, `tests/step14c-wormholes.test.mjs` (new), `testing/TESTING-14C-WORMHOLES.md` (new), docs (`HANDOFF.md`, `ROADMAP.md`, `CHANGELOG.md`, `CHANGELOG_ARCHIVE.md`).

## 2026-11-14: The sky loses its lines, and opening a loot card leaves the ship still

Owner, on the round-two build: "Works well. 2 things." — the painted cracks and filaments in the rift sky read as
**odd lines** across an otherwise good sky ("important the skybox looks realistic/professional"), and opening a loot
cache left the ship flying: WASD still thrust and the mouse still turned it. **Save version unchanged (v20)**; rebuild
needed (`npm run build`, then `npm test`).

- **`render/sky.js` strokes nothing any more.** `skyWisps` and `skyCracks` are gone, and with them the templates'
  `cracks` palette colour (dropped from both templates in `data/instances.js` and from recipe 22's example). The
  generators are now `skyVeils`, `skyClouds`, a new `skyCores` (small bright knots — the hearts a real nebula piles its
  light into, so the sky keeps its structure with no line in it) and a new `skyGrain`: six thousand single pixels under
  four hundredths of alpha, an invisible dither that stops the dark gradients banding into contour lines on an 8-bit
  screen. The sky texture in `render/scene.js` also drops mipmaps, because a mip level that cannot wrap the seam is a
  line of its own. `tests/sky.test.mjs` (10) now asserts the painter makes zero strokes and starts no path at all.
- **A loot surface freezes the ship.** `core/input.js` funnels the three modal surfaces (chart, flight card, rift
  trade) through one `modalSurface()` — the trade had been missing from the hand-written gate, which was the whole bug
  — so thrust, strafe, lift, roll, boost, fire and the mouse steer all read zero while one is open; and a new
  `holdShip()` in `sim/pilot.js` kills the ship's carry and throttle the moment `ui/cache.js` or `ui/cargo.js` opens,
  because zeroed controls alone still coast. Closing hands back a ship at rest. `tests/ui-cache.test.mjs` grew a sixth
  test that holds W and pushes the mouse against an open trade and watches the ship not move one metre.
- **Docs:** TESTING-14 §2/§5/§5b, VISION, ROADMAP (14a/14b ticked on the owner's "works well"), HANDOFF, the
  render/data/core/ui/sim READMEs and recipe 22 all lose their fractures and gain the freeze.
- **Tests:** 557/0 (`tests/sky.test.mjs` 10, `tests/ui-cache.test.mjs` 6). Build 810 KB.

Files: `src/render/sky.js`, `src/render/scene.js`, `src/data/instances.js`, `src/core/input.js`, `src/sim/pilot.js`,
`src/ui/cache.js`, `src/ui/cargo.js`, `tests/sky.test.mjs`, `tests/ui-cache.test.mjs`, and the docs above.

---

## 2026-11-14: Rift revisions after the playtest — the cache is a trade, every run is 20 minutes, and the sky has no stars

The owner came back from the PR #20 build with the mid-rift logout fix **confirmed working** ("can now log out mid
rift and returns fine") and three more asks. All three are built. `npm test` → **556 tests, 0 fail**
(`tests/step14-instances.test.mjs` 23, new `tests/ui-cache.test.mjs` 5, `tests/sky.test.mjs` rewritten to 10).
**Save version unchanged (v20)**: a canister's stock is still saved inside `world.instances` in the stack list slice
14b defined — only its live shape changed, and `restoreInstance` reads the old shape straight back.

- **Twenty minutes is the default clock (ask 1: "rifts default time is 20 minutes unless specified").**
  `RIFT.defaultLifetimeSec` (1200) in `data/instances.js`; `createInstance` uses it whenever a template does not
  declare `lifetimeSec`, and a declared `lifetimeSec: 0` still means "no clock of its own". Both rift templates had
  their `lifetimeSec` removed, so **a Deep rift is 20 minutes too** — what makes it deep is its wave, its debris and
  its prize, not its time. The new step14 test "a run is 20 minutes unless its template says otherwise" pins the
  default, a declared clock and the 0 case.
- **The cache is a trade panel, not an auto-loot (ask 2: "your inventory ui + cache inventory ui … clicking and shift
  clicking moves items in between exactly like ship inv and station inv", ship on the left, cache off to the right).**
  `openCache` — which moved stacks into the hold one press at a time — is gone. In its place: `openCacheTrade`,
  `tradeCacheItem(dir, id, n)`, `closeCacheTrade` and `cacheTradeRecord` in `sim/instances.js`, and a new
  `src/ui/cache.js` modal: **R** beside an unlocked canister opens a card with the ship's hold on the left and the
  canister on the right (`.cache-cols` in `styles.css`), in exactly the station Inventory tab's tiles; a click moves
  one, Shift-click moves the whole stack, in **either direction**; right-click offers **Use / Stow all / Discard** in
  the hold and **Take all** on a canister tile. This works because a canister's stock became an ordinary
  `{ itemId: count }` stock map: `sim/inventory.js` grew a third container key, `CACHE`, resolved to the open run's
  canister (`stockOf`, an unbounded `capacityOf`, `nameOf`), so `moveItem`, `spaceFor` and `itemsAt` reach it
  unchanged — and the saved `[{ i, c }]` shape is converted in `captureInstances` and `restoreInstance`, so no save
  migration was needed. An emptied canister still drops out of the world (and comes back if something is stowed into
  it), a full hold loses nothing and says so as a notice, and a sealed canister refuses to trade at all. In
  `main.js`, **R** again, **Esc** and **P** put the trade away; flight input is released while it is open but the run
  — clock included — keeps running, like the flight inventory card.
- **The sky is darker and less orange, with no stars, a nebula and shattered asteroids (ask 3).** `render/sky.js`
  rewritten: `skyStars` is gone for good; the generators are now `skyVeils` (enormous faint washes spread over the
  *sphere* — the nebula's body), `skyClouds` (the band's light and its dust lanes, in two passes), `skyWisps` (blurred
  filaments inside the band) and `skyCracks`. Both palettes in `data/instances.js` are near-black bases with two cold
  lights (`glow` plus a new `veil`: violet/teal for an ordinary rift, indigo/magenta and dimmer for a deep one), and
  the only warm colour left in an ordinary rift's sky is the fracture hairline — a deep rift's fractures are pale
  violet. `render/scene.js` gives the drifting shards a cold rock material with a breath of the nebula's own light
  and spreads more of them (30 / 40, near and far) against the painted sky. `tests/sky.test.mjs` is rewritten (10
  tests): determinism, per-template palette, sphere-uniform veils, an explicit "nothing in the picture could be a
  star" check (no star generator exported, no fill smaller than a wash), and luminance/hue guards that pin every
  rift's sky dark and non-amber.
- Docs: the cache and clock paragraphs of `src/sim/README.md`, `src/data/README.md`, `src/render/README.md`,
  `docs/architecture/content-data.md`, `docs/recipes/22` and `docs/REFACTOR_PLAN.md` rewritten for the trade; a new
  owner-decision entry at the top of `docs/VISION.md`; `testing/TESTING-14-RIFTS.md` §5 is now the trade checklist,
  with a new §5b for the sky and a 20:00 clock check. **ROADMAP 14a/14b stay unticked**: they wait for the owner's
  playtest of this build.

---

## 2026-11-14: Step 14 owner playtest — four bugs, four fixes (the run you quit is the run you come back to)

The owner flew slices 14a + 14b and reported four bugs. All four are fixed. `npm test` → **546 tests,
0 fail** (new `tests/sky.test.mjs` 7, new `tests/crash.test.mjs` 8, `tests/step14-instances.test.mjs`
now 21); `npm run build` → 803 KB. **Save version unchanged (v20)**: nothing a save stores changed
shape, only what a run puts in the world and which place a save may name.

- **Quitting mid-rift came back as "That pocket no longer exists" (bug 2).** `prepareGalaxySave`
  (`src/sim/galaxy-session.js`) decided the save's place was a pocket that had been removed whenever
  the id was not among the galaxy's pockets — which is always true of a run's id — so it moved the
  save home, nulled `resume` and armed the recovery notice, out of the run the pilot was standing in.
  A run the save's own `world.instances` carries is now a place the save may name: `missingPocket`
  skips ids owned by a saved run, and the browser boot path (autosave → `prepareGalaxySave` →
  `applySave` → `resumeFromSave`) comes back inside the rift at the same spot with the same clock,
  exactly like logging out in space. Test 20 walks that boot path with a stand-in `localStorage` and
  fails without the fix.
- **The rift's hostiles were "Newbie Raiders" (bug 3).** The wave was four `raider`s with the
  template's 1.6 / 1.5 multiplier on them, so the target lock read the tutorial hostile's name and a
  raider hunt contract was paid by a rift run. They are two entries of their own now —
  `riftguardian` (16 Hull HP, 1.5 damage a shot, ember hull) and `deepguardian` (22 / 2, void violet)
  in `src/data/enemies.js`, faction `rift` in `src/data/factions.js`, with their own drop tables in
  `src/data/loot.js` — and both templates' `difficulty` is 1 / 1, because the numbers are authored on
  the hostile instead of inflated onto a borrowed one. The fight is numerically what the owner
  playtested; the lock reads **Rift Guardian**, and test 21 asserts four dead guardians do not move a
  raider contract.
- **The rift's sky read as triangles (bug 4).** `SKIES.shattered` was an inverted shell of flat panels
  with one shade each, which is exactly what it looks like. It is painted now: new `src/render/sky.js`
  paints one canvas — a near-black base in the template's own colour, a faint band of its glow with
  dust lanes through it, 3200 stars spread over the sphere with a few bright ones, and wandering
  forking fractures with a dark lip and a burning edge — and `scene.js` wraps it around the inside of
  an unlit sphere, so no facet of anything shows and the shards drifting inside are rock shapes, not
  tetrahedra. The generators are pure and take their roll function, so `tests/sky.test.mjs` checks the
  whole picture against a recording canvas, and one seed paints one sky exactly.
- **The crash the pilot could not see (bug 1).** The console line the owner pasted
  (`e.n.replace is not a function`) is in no build this repo has ever produced — every `.replace` in
  the game is wrapped in `String(... ?? "")` and the committed bundle has no member-expression
  `.replace` at all — so it came from a stale build (a tab left open across rebuilds, or an older
  zip). What the report exposed is the shape of the failure: a frame that throws leaves the loop
  running but stops drawing, so the last good picture freezes with a live game behind it. `main.js`
  now catches a broken frame, draws anyway and reports through new `src/ui/crash.js`, which puts the
  error's own first line on screen in a card; `installCrashNotice()` catches anything else the browser
  reports as uncaught (a listener, a timer, a promise). A repeat is counted, not listed, and the card
  says how much it left out. If anything still breaks, the pilot can now read what.

---

## 2026-11-14: Step 14a feedback built — a rift you can see, lock and open — and slice 14b, a run that survives a quit

The owner playtested slice 14a and returned six items; all six are built, plus slice **14b**.
`npm test` → **529 tests, 0 fail** (`tests/step14-instances.test.mjs` is now 19); `npm run build` → 799 KB.
**Save version v20** (from v19): `world.instances` keeps the run a pilot is inside, so logging out mid-rift
comes back mid-rift. v19 and older saves have no runs and load unchanged.

- **The anomaly (items 1 and 5).** `render/views.js` grew one shared pair, `buildAnomaly` / `updateAnomaly`,
  and it draws **both** the door a pilot opens (`kind: "rift"`) and the way out inside (`kind: "gate"`):
  a dark spherical core, a bright eye, an additive aura and a flare at 1.5×, shimmering from
  `performance.now()` with a per-entity phase, plus sealed shells while it is locked. The way out is now an
  entity of its own — `placeWorld(id).gates`, `record.gate`, `record.exitPos` — always visible from arrival,
  F-lockable, and locked until the instance's own exit rules are met. Data: a template's
  `exit { n, pos, r, requires }` (the exit is a place in the world, not the point the pilot arrived at).
- **A sky of somewhere else (item 4).** `render/scene.js` exports a `SKIES` registry; `SKIES.shattered`
  builds an inverted icosahedron shell of dark panels with glowing fracture lines through them and shards
  drifting inside it, carried with the camera by `updateScenery`, and `showPlace` hides the ordinary
  starfield while a place has a sky of its own. A template declares `sky { kind, col, glow, cracks, shards }`
  and `SKY_KINDS` in `data/instances.js` is the vocabulary. **Both rift templates lost their `planet`
  feature**: a rift is not the space outside it, so nothing in one is copied from a pocket.
  `forgetPlace(id)` frees an instance's scenery and sky for good when its run ends, and `main.js`
  (`instance-closed`) now also calls `showPlace(state.place)` — leaving a rift used to leave the pilot
  looking at an empty scene with no stars.
- **F locks all three, and the HUD says what each is (item 2).** `sim/targeting.js` lock kinds grew `"r"`
  (rift door), `"g"` (way out, labelled `(sealed)` / `(open)`) and `"k"` (canister, `(locked)` / `(open)`),
  and `ui/hud.js` marks rifts, gates and canisters at all times — pinned to the edge of the screen when they
  are behind the pilot, with their distance — so the way in and the way out cannot be lost.
- **The prize is a canister you open with R (item 3).** `openCache(record, player, profile)` is exported from
  `sim/instances.js`: it moves the canister's stacks into the pilot's **own** hold one unit at a time, so a
  full hold takes what fits and is told how much is left (`Make room and press R again`). Every refusal is a
  sentence the pilot sees — still sealed (with the objective's own words), empty, no room — and a success says
  what came aboard. `completeObjective` now **unlocks** the canister instead of spilling crates, and
  `render/views.js` draws it as a canister (body, two caps, two bands, a lamp that is red while sealed and
  green once open). Data: `cache { n, loot, pos, r }` and `RIFT.cacheRange` (60 m).
- **Slice 14b: a run survives a quit (item 6).** `world.instances` (v20) keeps one entry per live run:
  template, seed, tier, remaining lifetime, `warned`, whether the objective is met, the canister's remaining
  stock and open flag, and the entry spot the pilot is put back at when they leave. `captureInstances()`
  (`state/state.js`) writes it from `currentSave()`; `captureResume()` no longer redirects a save made inside
  a run to the pocket; `enterPlace` now writes an instance id into `world.place` and `destroyInstance` writes
  the pocket back on the way out. `restoreInstances()` and `populateInstances()` (`sim/instances.js`) rebuild
  a saved run — record, place registration, then guardians, canister and gate — and are called from
  `resumeFromSave()`, with `restoreInstances()` also called at boot in `main.js` before `loadPlace`, because a
  place has to exist before anything can load it. `cleanInstanceRuns` (`state/profile.js`) drops any run whose
  id `instanceIdFor` would not produce, and a `world.place` that is then nowhere sends the pilot home.
  Deliberate and documented: the wave comes back at **full strength** (a save carries the run, not each
  guardian's damage), and an emptied canister stays empty, so reloading can never farm a prize twice.
- **Files.** `src/data/instances.js`, `src/state/{profile,state}.js`, `src/sim/{instances,places,session,targeting,world}.js`,
  `src/render/{scene,views}.js`, `src/ui/hud.js`, `src/main.js`, `tests/{step14-instances,layers,step9-save,step10-save,
  step11b-starmap,step12-places,step13-missions,step13c-ui,resume-spot,shops,station-inventory}.test.mjs`,
  `docs/{HANDOFF,ROADMAP}.md`, `docs/recipes/22-a-new-rift-or-instance.md`, `testing/TESTING-14-RIFTS.md`,
  the `src/*/README.md` files touched, and `docs/architecture/{world-and-map,content-data}.md`.
- **Next.** Slice **14c** simple wormholes (save v21: a pocket that spawns itself inside a charted system,
  20 minutes from spawn, `collapse` on expiry, re-enterable until its timer ends, objective and locked
  canister strictly one-time), then **14d** wormhole systems in uncharted space, then step 15 the campaign (v22).

---

## 2026-11-14: Step 14a built — a rift you carry, an instance you fly into, and a cache that stays locked

`npm test` → **523 tests, 0 fail** (14 new: 13 for the instance rules, one for the two new views);
`npm run build` → 789 KB. **Save version unchanged
(v19)**: in this slice an instance is session runtime, so a save made inside one comes back to the pocket it
was opened from and the spot the pilot entered at. Slice 14b saves the run itself.

- **NEW `src/sim/instances.js`** — the whole runtime. `rollRiftTemplate` (weighted, seeded),
  `createInstance`, `riftClearance`, `openRift` (a door at the ship), `enterRift` / `leaveInstance` /
  `riftAction` (**R** only, at close range, never by contact), `objectiveDone`, `exitDenial`,
  `instanceTimeLeft` / `instanceWarning` / `expireInstance` / `updateInstances` / `updateRifts`,
  `destroyInstance`, and the registries `OBJECTIVES`, `EXIT_REQUIREMENTS` and `EXPIRY_OUTCOMES`. Everything
  a template can say is looked up in a registry, and every registry **fails shut**: an unknown objective is
  never done, an unknown exit rule refuses with "The way out cannot be checked (…)", and an unknown expiry
  outcome still puts the pilot out of the place rather than trapping them in a dead one.
- **NEW `src/sim/consumables.js`** — `USE_ACTIONS`, `canUse`, `useItem`. A handler returns `{ text }` when it
  worked or a sentence when it did not; exactly **one** unit is consumed, and only on success. `spawn-rift` is
  the first action: it refuses while docked, inside an instance, or too close to anything, and passes the
  clearance sentence through word for word.
- **The locked cache** (LESSONS L6): it hangs in the instance from the moment the pilot arrives, as an entity
  of its own. When the objective is met it is replaced by ordinary crates that spill where it hung and are
  collected one at a time — nothing enters a hold by side effect, and one seed spills the same crates in the
  same places.
- **Seeded throughout**: `instanceIdFor(template, seed)` names the place, `streamRng(seed, 1)` lays out the
  wave and `streamRng(seed, 2)` the cache, so one seed is one instance — same rocks, same guardians, same
  reward — and an instance writes no `world.placeMemory` at all. `Math.random()` appears nowhere in `sim/`.
- **Harder than the map**: `sim/ai.js` multiplies a hostile's hp and damage by `instanceAt(place).difficulty`
  (1.6 / 1.5 for `guardian_rift`, 2.2 / 2 for `deep_rift`). The declared wave spawns with `encounter: null`,
  so it writes no place memory and cannot trip a mission's wave-clear trigger.
- **The clock**: `lifetimeSec` of unpaused simulation seconds from entry, `warnSec` 60 of warning, then the
  template's declared outcome. `kill` stamps `state.deathNotice` with the template's own sentence, despawns
  the run and its door, and lets the ordinary death rules finish (ship and whole hold gone, recovery fee,
  loaned Wasp, docked in the pocket it was opened from). `collapse` only fades the door and dooms the outer
  pocket (`doomOrigin`, which 14c reads): the instance stays open, its exit keeps working and nobody is ever
  forced out or killed by a wormhole's clock.
- **Dying inside a run**: `sim/session.js` `die()` now emits `dying` before it removes anything, and
  `sim/instances.js` listens — the run despawns at once and the pilot is put back at their entry spot, so the
  ordinary death rules apply unchanged whatever killed them.
- **Views, input, HUD, cards**: `render/views.js` draws the `rift` and `cache` kinds from their records with
  shared geometry and materials (eight entity kinds now); `core/input.js` binds `KeyR: "rift"` and `main.js`
  dispatches it only while playing and not warping; `ui/hud.js` `instanceHtml` shows the authored objective,
  the `mm:ss` countdown and the exit line (open, or the template's refusal); `ui/cargo.js` offers **Use**
  above **Discard** in flight; `ui/screens.js` labels a consumable's tile **USE** and words its line by
  category; `index.html` and the intro screen's controls list both mention **R**.
- **Content and shops**: `rift_basic` is back on Meridian's shelf at **10 cr**, described in the shop's own
  words (item `v: 6`, so selling follows the 60 % rule); `data/loot.js` gains `rift_rock`, `rift_cache` and
  `rift_cache_deep`.
- **NEW `tests/step14-instances.test.mjs`** (13 tests): every template is complete and every word it uses is
  in a registry; the weighted roll and its refusals; seeded determinism and the absence of a `placeMemory`
  trace; the four clearance margins; one use and one door per seed; **R** in and out at range with the sealed
  exit refusing in the template's words; the cache's spill; leaving returns the pilot to the exact entry spot
  with everything aboard; both expiry outcomes; a death by shot inside a run; fail-closed unknown rules;
  `destroyInstance` and `resetPlaces`. `tests/views.test.mjs` gains one more: a real door and a cache
  record each get exactly one mesh, drawn at the radius and the position their records declare, and both
  meshes go when `clearWorldObjects()` takes the records.
- **Fixed while testing**: `captureResume()` spread a `{ pos, quat }` of `Vector3`s into the resume point
  instead of arrays, which would have saved garbage for anybody inside an instance; and `expireInstance()`
  now emits `instance-expired` **before** the outcome runs, so a listener still sees the instance registered
  (a `kill` destroyed it first and the event had nothing left to look at). The way out also offers itself the
  way a door does: within `RIFT.exitRange` the prompt says "Press R to leave through …", or the refusal while
  it is sealed.
- **Docs**: NEW `testing/TESTING-14-RIFTS.md` (owner playtest, listed in `testing/README.md`), NEW
  `docs/recipes/22-a-new-rift-or-instance.md` (indexed in `docs/HOW_TO_ADD.md`), `docs/HANDOFF.md` rewritten,
  `docs/ROADMAP.md` step 14a status, `src/sim/README.md` and `src/data/README.md`.
- **Not in this slice**: saving a run (14b), simple wormholes and their self-spawning pockets (14c),
  uncharted wormhole systems (14d), and the campaign (15).

Files: `src/sim/instances.js` (new), `src/sim/consumables.js` (new), `src/sim/{session,places,world,ai,step}.js`,
`src/state/state.js`, `src/data/{instances,items,loot,shops}.js`, `src/render/views.js`, `src/core/input.js`,
`src/main.js`, `src/index.html`, `src/ui/{hud,cargo,screens}.js`, `src/util/events.js`,
`tests/step14-instances.test.mjs` (new), `tests/{layers,views,shops,content,enemies}.test.mjs`, `src/sim/README.md`,
`src/data/README.md`, `src/{render,core,ui}/README.md`, `docs/{HANDOFF,ROADMAP,HOW_TO_ADD,ARCHITECTURE,CHANGELOG}.md`,
`docs/architecture/{world-and-map,content-data,ui-and-screens}.md`,
`docs/recipes/22-a-new-rift-or-instance.md`, `testing/{TESTING-14-RIFTS,README}.md`.

---

## 2026-11-14: Step 14 groundwork — instance templates as data, and the owner's wormhole model recorded

No game behaviour changed yet: everything below is data, docs and empty runtime hooks that nothing reads. **Save
version unchanged (v19)**, but `src/` changed, so rebuild (`npm run build`) and re-run `npm test`.

- **Owner clarification (fourth round, 2026-11-14).** Natural wormholes come in two kinds that share one machinery. A
  **simple wormhole** is a pocket that spawns itself in normal space: warp to it like any pocket, the wormhole hangs
  there as an object, press **R** close to it and enter one instanced pocket isolated from the rest of space with an
  objective of its own. Its **20 minutes run from the moment the pocket spawns**, not from entry. Running out fades the
  wormhole object and dooms the outer pocket — it leaves the map when you warp off, then despawns. The way out inside is
  a **Stable wormhole** with no clock of its own: nobody is ever forced out or killed by it, and leaving after the
  collapse returns you to an empty pocket. A **wormhole system** (later slice, now **14d**) is entered the same way, but
  its far side is a system in uncharted space — off the existing starmap, **persistent and saved** like any other
  system, with dynamic wormhole pockets on the same timer (a new one spawns so you can always get out) and a map button
  to view normal space and come back. Rifts are unchanged: they still **kill** on expiry.
- `docs/VISION.md`: the step 14 decision rewritten for that model — the two wormhole kinds, the two clock anchors, and
  `collapse` replacing the third round's `eject` (nothing forces a pilot out of a wormhole, so there is nothing to
  eject from). Slices are now 14a rift, 14b saved run, 14c simple wormholes, 14d wormhole systems.
- `docs/REFACTOR_PLAN.md`: step 14's 14c bullet rewritten — it is no longer "data only", because a self-spawning
  pocket, its timer and its despawn are real machinery — and a 14d bullet added. `docs/TARGET_ARCHITECTURE.md` gains a
  **Wormhole** paragraph beside **Instance**. `docs/ROADMAP.md`: table rows 14c/14d, current position, log line.
- **NEW `src/data/instances.js`** — the whole template vocabulary, with no behaviour in it (a weighted roll is
  behaviour and belongs to `sim/instances.js`, the way `data/loot.js` is rolled by `sim/loot.js`): `RIFT`
  (`enterRange` 200, `exitRange` 220, `warnSec` 60, and `clearance` — 1000 m from a station, an asteroid field's
  edge or a planet's surface, 150 m from any single rock), `OBJECTIVE_KINDS`, `EXIT_REQUIREMENT_TYPES`,
  `EXPIRY_OUTCOME_TYPES` (`kill`, `collapse`), two instance templates (`guardian_rift`: tier 4, 1200 s,
  `{hp 1.6, dmg 1.5}`, four guardians, sealed exit, locked cache; `deep_rift`: tier 6, 1500 s, `{hp 2.2, dmg 2}`,
  six guardians, richer cache), `RIFTS.basic` as a weighted template pool, and `instanceIdFor(templateId, seed)` so
  one seed is always one instance.
- `src/data/places.js`: a runtime **instance place registry** — `registerInstancePlace`, `unregisterInstancePlace`,
  `clearInstancePlaces`, `isInstancePlace`. An instance resolves through the ordinary `placeAt`/`placeDef` path
  (its `features` come from its template) but stays out of `pocketsIn`, so it can never appear on a map, and
  `setPlaceCatalog` drops every instance when a world is installed. The merged catalog is built **lazily**: reading
  `PLACES` at import time is a reference error, and the first `npm test` after this change said so (51 files failed).
- `src/state/state.js`: `state.instances` (a Map, session runtime only in 14a), `instanceAt`, `insideInstance`,
  `clearInstances`; `resetPlaces` clears them; every place container gains `rifts` and `caches` entity lists; and
  `captureResume` records the spot a rift was entered from instead of a spot inside an instance that is not saved yet,
  so a save inside a rift returns the pilot to the pocket it was opened from. Slice 14b replaces that with the run.
- `src/data/items.js`: the first consumable — `rift_basic` (10 cr, `use: "spawn-rift"`, `rift: "basic"`) plus the
  `itemUse`/`itemRift` readers. `src/data/loot.js`: `rift_rock` (richer ore) and the two cache tables
  `rift_cache` / `rift_cache_deep`. `src/data/README.md`: the row for `instances.js` (`tests/docs.test.mjs`
  requires one).
- **Deliberately not added yet:** the `rift_basic` shop row. The **Use** action behind it (`sim/consumables.js`,
  `sim/instances.js`, the right-click menu entry, the **R** binding, the rift and cache views) is what slice 14a
  builds next, and an item you can buy but cannot use would be a silent failure.
- This entry **supersedes** the first 2026-11-14 entry above on three points: instances **are** saved (14b, v20),
  expiry outcomes are **per template**, and the natural-wormhole outcome is `collapse` — not the second round's
  `eject`, and not the first round's "instances are never saved".
- Next: slice **14a** — `sim/instances.js` (create/enter/leave/expire, the objective and exit registries, the locked
  cache), `sim/consumables.js` (`useItem` plus `USE_ACTIONS`), the rift and cache entities and their views, the
  **R** binding, the shop row, `tests/step14-instances.test.mjs` and `testing/TESTING-14-RIFTS.md`.

Files: `src/data/instances.js` (new), `src/data/places.js`, `src/data/items.js`, `src/data/loot.js`,
`src/data/README.md`, `src/state/state.js`, `docs/VISION.md`, `docs/REFACTOR_PLAN.md`,
`docs/TARGET_ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/CHANGELOG.md`.

---

## 2026-11-14: VISION records the owner's step 14 rift decisions; open question 5 is closed

Docs only: no code changed, no rebuild needed, **save version unchanged (v19)**. The owner answered step 14's blocking
question, so the decision is written down before any code exists — the docs are the memory across chats.

- `docs/VISION.md`: open question 5 deleted, and a **"2026-11-14 — Step 14: rifts, instances and how you may leave
  one"** decision added. A spawned wormhole is a **rift**; the first is a **Basic rift** at 10 cr, used by
  right-clicking it in the in-flight ship inventory, opening where the ship is and refused unless the ship is 1 km clear
  of a station, an asteroid field's edge or a planet's surface (150 m from a single rock). Natural wormholes are
  map-visible, warpable and time limited. Entering and leaving is a close-range **R** press, never contact. Whether an
  instance may be left is **data on the instance**: the Basic rift stays shut until its objective is done. A spawned
  rift is one use. Instances are never saved — a checkpoint on entry, no autosave inside, a save on the way out — so
  reloading mid-rift returns the pilot to the entry point with none of that run's loot.
- Its "Instanced places" bullet now names rifts and points at the decision.
- Next: build slice **14a** (the Basic rift) once the owner says go. Natural wormholes are slice **14b** and will need
  save **v20**, which makes step 15 (campaign) v21; the ROADMAP table will be renumbered in that change.

---

## 2026-11-14: The owner confirmed the pending mission playtests; nothing is waiting now

Docs only: no code changed, no rebuild needed, **save version unchanged (v19)**. The owner reported that the work built
on 2026-11-13 passed in the browser — station-scoped mission offers with the docked-panel redraw, the contract delivery
wording, recovery contracts spawning and counting their own crates — together with the death-and-missions playtest guide.

- `docs/ROADMAP.md`: "Current position" rewritten so it says no playtest is pending, a log line added for 2026-11-14,
  "Last checked" moved to 2026-11-14.
- `testing/TESTING-DEATH-AND-MISSIONS.md` moved to `testing/passed/`; both tables in `testing/README.md` updated.
- `docs/HANDOFF.md`: "Last checked" 2026-11-14, plus one line saying nothing is waiting on a playtest.
- This file: its oldest full entry moved word for word to `docs/CHANGELOG_ARCHIVE.md` with an index line, so exactly ten
  full entries remain here.
- Next: refactor step 14 (instanced places and wormholes). The owner has answered VISION open question 5 — spawnable
  wormholes are **rifts**, sold as a "Basic rift" for 10 cr, used by right-clicking it in the in-flight ship inventory,
  spawning where the ship is at least 1 km from any large structure; natural wormholes appear on pocket maps and are
  time-limited; a rift may declare criteria that must be met before it can be left. The step is planned before any code.

---

## 2026-11-13: A recovery contract recovers its own crates, and the space is left clean

Owner request: "recovery missions require you to recover all the crates the mission generates … lists progress of
recovery in the ship ui and mission log as 'x out of y crates recovered'. Those must then be specific to the specific
mission … you must recover each mission's own individual crates", and "to complete the mission you need the right
number of items and are consumed upon hand in … must clear the space of the mission specific in space crates."
**Save version unchanged (v19)** — `slot` is additive and older drop records stay slot-less; rebuild needed
(`npm run build`, then `npm test`).

- **Each crate belongs to one contract (`data/missions/contracts.js`).** The salvage step carries `owned: true`, so the
  runner counts a pickup for a contract only when the crate carries that mission's id (`objectiveMatches`,
  `missionPickupMatches`). Accepting "Recover 3" and "Recover 6" at once now needs all nine of their own crates: another
  contract's crates, and loose Salvage from a wreck, move nothing.
- **The field (`sim/session.js`).** `ensureSalvageCrates` runs on every launch and puts one persistent crate in the
  asteroid field for each crate a contract still needs. The crates are persistent and tagged, so a warp, a dock or a
  reload keeps them, and a crate already collected is never spawned again.
- **Several crates of one item (`sim/combat.js`).** A drop record used to be keyed by mission + item, which allowed only
  one crate per mission. Records now carry a `slot` (`nextMissionCrateSlot` hands out the next free one), and spawn,
  drift, pickup, save and restore all match on it. `state/profile.js` keeps `slot` in the saved world and dedupes by it.
- **Wording (`sim/missions.js`, `ui/hud.js`, `ui/missionlog.js`).** `missionRecoveryText` says "2 out of 3 crates
  recovered": the HUD shows it under the contract line while flying, and the docked card uses it in place of "Objective
  progress: 0 of 3". This supersedes the previous entry's salvage wording — the no-tally rule now covers **mine** only.
- **Hand-in is unchanged in kind, stricter in fact.** Objectives done (each crate recovered from space) plus `n` Salvage
  in the station or the hold; `consumeDelivery` takes them and pays. Any Salvage pays, because the recovered crates are
  ordinary cargo, and the items are consumed on the spot.
- **The space is left clean.** Handing in a contract (or abandoning it) already ran `clearMissionContents`; it now drops
  that mission's crates from every pocket and deletes their saved records, so nothing respawns when the pocket loads
  again. Tested with an extra crate still floating when the pilot hands in.
- **Tests:** new `tests/mission-recovery-crates.test.mjs` (spawn counts and slots, per-contract counting, hand-in
  consumption and cleanup, abandon cleanup, save round trip) and a per-contract counting test in
  `tests/step13-missions.test.mjs`; the guest-pickup test now spawns its own contract's crate. **509 tests / 0 failures.**
- **Docs:** `docs/MISSION_RULES.md` (recovery-contract paragraph, trimmed to stay inside its size cap), `src/sim/README.md`,
  `src/ui/README.md`, `testing/TESTING-BASELINE.md`.

---

---

## Older entries (index; full text in [CHANGELOG_ARCHIVE.md](CHANGELOG_ARCHIVE.md))

- 2026-11-13: Contract guidance says where the cargo goes, not how much is aboard
- 2026-11-13: Notices hang just below the flight message line
- 2026-11-13: Right-click Discard everywhere — how many, then "are you sure?"
- 2026-11-13: Press I in space to read the ship's inventory, and the chart no longer stops the clock
- 2026-11-13: Your missions follow you; only the offers and the hand-in stay at a station
- 2026-11-13: No message line that moves the menu, and no "filed at another station" note
- 2026-11-13: A story mission is offered at one station, and only there
- 2026-11-13: Missions belong to the station that filed them, and the docked panel redraws itself
- 2026-11-13: Overlays everywhere in the open world, a quiet exit to the menu, and a cinematic title view
- 2026-11-13: Every mission and contract is handed in at one named station
- 2026-11-13: Dying hands you a complete spare Wasp that can be fitted again
- 2026-11-13: A mission is accomplished by its hand-in, not by its last step; contract wording and colours
- 2026-11-13: Dying no longer fails missions by default; "Mission failed" notice in the HUD
- 2026-11-13: Docs consistency pass for multi-AI handoffs, changelog capped at 10 entries
- 2026-11-13: Docs restructure, LESSONS.md, docs check test, duplicate-mission guard
- 2026-11-13: Step 13d: mission rules, linter, templates and invariant tests
- 2026-11-10: Name the Border Signal object and consume story hand-ins
- 2026-11-10: Make Border Signal's beacon a persistent physical drop
- 2026-11-10: Make Border Signal handoffs resource-safe
- 2026-11-10: Clean up abandoned mission content and gate dialogue
- 2026-11-10: Remove unexplained mission progress counters
- 2026-11-10: Keep mission objectives spoiler-safe
- 2026-11-10: Show player-facing mission objectives in the flight HUD
- 2026-11-10: Stabilize story mission completion and scripted hand-offs
- 2026-11-10: Add pause exit and split the main menu actions
- 2026-11-10: Advance Border Signal after its mission wave
- 2026-11-10: Build Step 13c mission screens
- 2026-11-10: Require mining ore hand-in before contract payout
- 2026-11-10: Restore Destroy contract progress readout
- 2026-11-10: Start Step 13b story mission runtime
- 2026-11-10: Simplify exact pocket route titles
- 2026-11-10: Require salvage delivery before paying recover contracts
- 2026-11-10: Show every active mission in the flight HUD
- 2026-11-10: Start Step 13 mission framework with data-driven contracts
- 2026-11-10: Simplify map markers and current-location labels
- 2026-11-10: Refine destination marker rings and icon scale
- 2026-11-10: Mark destination completion and remove HUD route scrolling
- 2026-11-10: Add route markers and instant galaxy selection
- 2026-11-10: Clarify pocket menus, labels and exact route destinations
- 2026-11-10: Make local route lines solid and pocket menus right-click-only
- 2026-11-10: Preserve real double-click navigation on starmap dots
- 2026-11-10: Vary station names and clarify routed gate navigation
- 2026-11-10: Refine system-map exits and separate generated station pockets
- 2026-11-10: Give every dockable station local persistent inventory
- 2026-11-10: Build Step 12 encounter templates and persistent place memory
- 2026-11-08: Wrap destination names and show local route hops
- 2026-11-08: Remember route destinations across relogs
- 2026-11-08: Remove destination diamond
- 2026-11-08: Mark the route destination and simplify the starmap list
- 2026-11-08: Add route arrows to the flight HUD
- 2026-11-08: Simplify the flight route to system names
- 2026-11-08: Set exact pocket destinations
- 2026-11-08: Clearer, sparser starmap and adaptive route list
- 2026-11-08: Straight starmap lines with attached endpoints
- 2026-11-08: Show the active route in flight
- 2026-11-08: Group route pockets by system and mark the current area
- 2026-11-08: Compact flight route with journey progress
- 2026-11-08: Plot system destinations and jump the route with J
- 2026-11-08: Remember starmap view across closing and travel
- 2026-11-08: Align newly fired cannon visuals with the interpolated hull
- 2026-11-08: Tame galaxy chart drag speed
- 2026-11-08: Step 11B starmap refinements — permanent core labels, zoom-scaled pan/cores, clickable gate neighbours (owner playtest pending)
- 2026-11-08: Step 11B system-map follow-up — free local warp and named central bodies (owner playtest pending)
- 2026-11-08: Step 11B starmap UI follow-up — zoomed system maps, right-click warp, compact overview (owner playtest pending)
- 2026-11-08: Step 11B — clickable starmap, direct-hop travel and save v16 (owner playtest pending)
- 2026-11-08: Step 11A owner playtest passed — full project backup
- 2026-11-08: Step 11A owner playtest guide and live browser preview
- 2026-11-08: Step 11A — organic starmap web, one-peer gates and editable travel rules
- 2026-11-08: Autosave every 30 seconds instead of 15
- 2026-11-08: Come back where you logged out — save v15
- 2026-11-08: Step 10 complete and ticked — owner playtest passed
- 2026-11-08: Step 10 playtest fixes — sound, start screen and loading a save
- 2026-11-08: Step 10 built — place definitions (systems and pockets), save v14
- 2026-11-08: Fix high-refresh (240 Hz) ship blur via between-tick render interpolation
- 2026-11-08: Step 9 complete and ticked — Milestone B reached
- 2026-11-08: Step 8a ticked; step 8b player records and controls
- 2026-11-08: Step 8 slices documented
- 2026-11-08: Step 8a — fixed simulation tick (playtest pending)
- 2026-11-08: Step 7d complete and ticked
- 2026-11-08: Step 7d — entity view registry cleanup
- 2026-11-08: Step 7c and step 7 complete and ticked
- 2026-11-08: Refactor step 7c — hull view and render-free simulation
- 2026-11-08: Step 7b complete and closed (docs only, no code change)
- 2026-11-08: Refactor step 7b — bullets, missiles, crates and particles become data
- 2026-11-08: Step 7a ticked (docs only, no code change)
- 2026-11-08: Refactor step 7a — a hostile becomes data; the mesh becomes a view
- 2026-11-08: Step 6 ticked in full (docs only, no code change)
- 2026-11-08: Refactor step 6b — the sim stops reading the keyboard (step 6 done)
- 2026-11-08: Refactor step 6a — the sim stops playing sounds itself
- 2026-11-07: Recorded what is and is not per-shop about shops (docs only)
- 2026-11-07: Spare modules can be sold (60% of the shop price)
- 2026-11-07: Shop fix — the cannons are listed once, as "Basic cannons"
- 2026-11-07: Refactor step 5 — shops and prices from data (plus a visible Shop change)
- 2026-11-07: Refactor step 4 — the item catalogue and one inventory per place (save v12)
- 2026-11-07: Refactor step 3 — loot tables (drops and ore mix are data)
- 2026-11-07: Refactor step 2 — seeded randomness everywhere
- 2026-11-07: Refactor step 1 — enemies are data (enemy registry, `enemy-killed` event)
- 2026-11-07: Vision, target architecture, roadmap and refactor plan (docs only, no code change)
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
- 2026-11-08: Step 8 ticked; step 9 split saves (v13) and per-pilot rules — playtest pending
- 2026-11-08: Step 8c owner playtest passed
- 2026-11-08: Step 8c scoped implementation complete — playtest pending
- 2026-11-08: Step 8c in progress — explicit flight, shields and damage
- 2026-11-08: Step 8c started — player-specific transforms and launches
- 2026-11-08: Step 8b complete and ticked
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
