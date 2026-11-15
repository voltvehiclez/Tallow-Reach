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

## 2026-11-15: A skybox generator, so every new instance can have a dark, realistic 4K sky

**No save change. `npm run build` and `npm test` needed.** No skybox is installed yet, so the game looks exactly as before.

- **`tools/skybox/skybox.py`** (Python, numpy + Pillow; not part of the game bundle) renders a 4096×2048 equirectangular
  WebP in about 40 s and ~400 KB: luminous nebula gas, a mist behind it, dark dust clouds in front (rim-lit where thin,
  ragged fractal edges), hot cores, an optional Milky Way band, and stars with a power-law brightness spread, blackbody
  colours and equal-area placement (stretched correctly for the projection; dust hides them). Every layer is a function of
  view direction, so there is no seam and no pole pinching. It bloom-filters, **auto-exposes to a mood** (`black`,
  `very_dark`, `dark` default, `dim`; the owner wants dark space), tone-maps, dithers, and prints a report that must say OK.
  `--install` refuses on any warning. Eight looks in `tools/skybox/presets.json`: void, maelstrom, ember, violet_veil, ash,
  milky_way, cobalt_cluster, emerald_mist. `--preview` writes a contact sheet with four 70-degree pilot's-eye views.
- **Game side:** new sky kind `panorama` (`sky: { kind: "panorama", skybox: "<id>", shards: 30 }`) in `data/instances.js`
  `SKY_KINDS`; `SKIES.panorama` in `render/scene.js` reuses `SKIES.shattered` (it now takes an optional `{ url, tint }`
  override, behaviour for the existing skies unchanged). New `src/data/skyboxes.js` (data) and `src/render/skyboxes.js`
  (image imports), both with `GENERATED` blocks the tool maintains. Verified in headless Chromium with the real scene code.
- **For AI assistants:** `tools/skybox/README.md` (workflow, "owner says -> run this" table, warnings), **recipe 24** (23 was
  taken by the GLB-model recipe), a line in `AGENTS.md` and `HANDOFF.md`. `tests/skybox.test.mjs` guards manifest, image (2:1,
  size, budget), import, recipe and the template's skybox name, and the presets file.
- Known: 4096 wide is about 0.09 degrees per pixel, so on a 4K monitor at the 70-degree camera the sky is magnified about 2.4
  times; `--size 8192` is the sharper option (about 3 GB RAM, bigger game file). Do not commit the tool's `skybox-out/` folder.

---

## 2026-11-15: The Test Ship — a 1-credit hull with 100× Hull HP and 10× damage, flown with the owner's GLB

Owner: "make a new ship available in the Hangar that costs 1 credit. It is called 'Test Ship'. It has 100x hp of wasp, 10x multiplier to all damage output. Same slot layout as wasp. Same default slots come with it when you buy it already fitted. It will use this 3d model called heavyfighter.glb in my google drive." **Save version unchanged (v21)**; rebuild needed (`npm run build` — the page grows to ~19 MB — then `npm test`). NOT playtested yet.

- **The hull.** `SHIPS.testship` — "Test Ship", 1 cr, `cargo: 20` (the Wasp's hold), `dmg: 10`, `mine: 1`, `sc: 1`, `hpMul: 100`, `col: 0x8a6d3b`. Same slot layout as the Wasp (`SHIP_LAYOUTS.testship`; the content test's Wasp-layout assertion passes as-is) and the same hold. `DEFAULT_SHIP` stays `wasp`. It is the one deliberate exception to "every hull is the same ship apart from its hold" — the content test carves it out by name and pins its price/dmg/hpMul. The hangar lists it automatically (all screens read `SHIPS`); buying costs 1 cr, goes through `addShipRecords`, and delivers the same stock fit the Wasp gets — arriving **already fitted**, exactly as asked. Old saves backfill `loadout.testship` with the stock fit on load, like every known hull (the two save-fixture tests were updated to expect it; no fixture semantics changed).
- **100× Hull HP.** A new hull attribute, `hpMul`: `effectiveHullOf` multiplies whatever the fitted hull module grants (`hullOf` returns raw module HP) — `hull_basic` (10) → **1000 Hull HP** on the flying ship. `P.hullSpec`/`hullMax`/`hull` all reflect it; the Hangar stat line and repair costs use the same effective HP.
- **10× damage output.** `guns` already multiplied by the hull's `dmg` (`sim/weapons.js`); `launchMissile` now multiplies the fitted launcher's damage the same way, so **guns and missiles** hit ten times harder. The mining beam deals no damage, and collision/ram damage is physics, not output — deliberately not scaled.
- **Compressed model replacement:** owner supplied `heavyfighter-compressed.glb` (180,916 bytes, MD5 `983f20487d3b5840033a6d15d77b2896`), replacing the original at `src/assets/models/ship.testship.glb`. Same authored bounds and node axes; `modelYaw`, `modelLength`, centring and camera padding remain unchanged. Required Draco geometry uses the existing three.js glTF JS decoder, embedded with its Apache 2.0 license (no new npm dependency or external fetch). WebP textures are supported by GLTFLoader. The standalone page is now ~2.33 MB rather than ~19.2 MB. An offline decoder test reads the actual GLB and verifies decoded bounds against the original. Visual owner check still pending.
- **Immediate title screen:** start the render loop without waiting for GLBs; defer background model decoding until after a title paint opportunity. Open World waits on that same promise, disables repeat clicks and shows “Loading models…” if needed. Built-in title scenery is used while imports prepare; model failures retain the existing fallback. The embedded download size is unchanged. Scheduler regression coverage pins paint-before-load and gameplay readiness.
- **Camera playtest tuning:** Test Ship adds `cameraPadding: 1.2` to the automatic size-based framing: chase distance/height and orbit range are 20% farther out than before. Wasp and other hulls remain unchanged. Regression test pins the multiplier.
- **Universal third-person framing:** chase distance and height now scale by the actual fitted model bounding-diagonal ratio to the Wasp (all three dimensions count, including GLB import corrections). Wasp remains exactly 1× at every speed; free-orbit starting distance and zoom limits use the same ratio. Measurements are cached per template pair, not recomputed during thrust animation. No physics or FOV changes. Added regression coverage for smaller/larger/wider models.
- **Playtest correction:** the imported model faced right and was tiny. Optional per-hull visual import settings now rotate its +X nose to −Z, centre its bounds, and fit it to 14.8925 m length (115% of the Wasp). Flight scale, mounts and physics are unchanged; both flight and Outfitting use the same builder. Regression coverage checks direction, centring and relative size.
- **The model.** `heavyfighter.glb` from the owner's Google Drive (md5 `20fc5e2664c5665c13a547a6ff0d14f2`, 13,233,164 bytes) was fetched through the Drive connector (the `download_file` call stages binary files into the workspace) into `src/assets/models/ship.testship.glb`. `buildPlayerShip` draws it exactly like the built-ins (`ship.<class>` key; `.glb` replaces the built-in silhouette, `sc: 1`). **This is the first `.glb` ever committed to the repo** — the "no binary assets in the repo" convention for models is amended for this one owner-supplied file. `game/tallow-reach.html` is now ~19.2 MB (~17.6 MB of it is this model as a data URL); the built-in fallback still works if the file ever disappears (the Wasp silhouette in `col`).
- **Tests.** New `tests/test-ship.test.mjs` pins the acceptance criteria (price 1, hold parity, layout parity, stock fit on buy, 1000 Hull HP, effective-HP repair costs, 10× missile damage, `DEFAULT_SHIP` unchanged); `tests/content.test.mjs` carves out the exception by name; save-migration fixtures updated. **598/598 pass**; build green. New harbour smoke, in Node: buy at 1 cr → `ships` gains `testship`, `cr` 100 → 99, loadout equals `stockFor('testship')`, `hullMax` 1000, missile `dmg` 80 vs the Wasp's 8.

Files: `src/assets/decoders/` (decoder, license, README), `tests/compressed-model.test.mjs`, `src/render/gltf.js`, `src/render/menuview.js`, `src/ui/menu.js`, `src/ui/README.md`, `src/main.js`, `src/render/camera.js`, `src/render/models.js`, `src/render/README.md`, `tests/ship-model-fit.test.mjs`, `docs/LESSONS.md`, `src/assets/models/ship.testship.glb` (new), `src/data/ships.js`, `src/data/outfitting.js`, `src/data/mounts.js`, `src/sim/economy.js`, `src/ui/screens.js`, `src/sim/hull.js`, `src/sim/missile.js`, `src/render/model-manifest.js` (regenerated), `tests/test-ship.test.mjs` (new), `tests/content.test.mjs`, `tests/step9-save.test.mjs`, `tests/step11b-starmap.test.mjs`, `docs/GLB_MODELS.md`, `docs/recipes/01-a-new-ship.md`, `src/sim/README.md`, `src/data/README.md`, `docs/HANDOFF.md`, `docs/CHANGELOG.md`, `docs/CHANGELOG_ARCHIVE.md`, `game/tallow-reach.html`.

---

## 2026-11-14: Models and collision are real models now — drop-in `.glb` files, hulls flush with the drawing

Owner: every object in the game should accept a `.glb` when one exists (hardcoded model otherwise), and collision should sit flush with the actual 3D model for all objects — Meridian Station can no longer be one big ball: the rings and the inner cylinder must be reachable and touchable. Complex future objects (a big rock cave) are in scope. **Save version unchanged (v21)**; rebuild needed (`npm run build`, then `npm test`). NOT playtested yet.

- **Drop-in `.glb` replacements, zero ceremony.** Put `<key>.glb` into `src/assets/models/` and rebuild; `build.mjs` regenerates `src/render/model-manifest.js` (data URLs inlined, no runtime path ever resolves) and the built-in model for that key is replaced — never duplicated. No `.glb` for a key, nothing changes, fallback is byte-identical to before. Preload failures only log `[models] ... using the built-in model`. The whole path (byte-extraction from the built page → `GLTFLoader` parse → collider bake) was smoke-tested with a generated `station.glb`: 20 triangles baked, collision detected deep penetration, correctly ignored a far-away probe. Keys: `ship.<class>`, `planet`, `station`, `enemy.<defId>`, `asteroid`, `bullet`, `missile`, `crate`, `fx`, `cache`, `anomaly`, `wormhole`, `beam` — see [GLB_MODELS.md](GLB_MODELS.md) for the authoring conventions (units, `spin`/`eng`/`noclip` node names, scale contracts, the unit-sphere planet rule).
- **Collision is now the drawn mesh, everywhere.** Rocks collide as their actual lumps (one soup per built-in shape — the mesh is built from the same floats; `asteroid.glb` replaces both), station/planet colliders are baked from the built model at build time (planet atmosphere shell and the ring's decorative spokes/lights are `noclip` — the ring itself, being rotationally symmetric, stays solid), missiles die against the rock's mesh, the hull stays a 4 m sphere, and the data's `keepout:` field is gone (the station has no invisible wall any more — the ring is the wall, and you can fly through the axis). Scenery rebuilds replace their own colliders (`feature#index` ids); `forgetPlace` clears them. `collide: false` / `collideDmg` on a feature are the only data opt-outs, `noclip` in the model the only mesh opt-out.
- **Tests:** `tests/two-player-sim.test.mjs` rock collision now builds a real rock record; the views tests serve the built-in fallback (headless registers no `.glb`); the FX fade test disposes GLB-clamped materials once each. Docs added: [GLB_MODELS.md](GLB_MODELS.md), recipe 23; src folder READMEs list the new files. **578/578 pass**; build green. Rider: enemy-vs-world collision is still absent (as before) — see the doc's known limits.

Files: `src/assets/models/` (new, empty), `src/render/gltf.js`, `src/render/collideModel.js`, `src/render/model-manifest.js`, `src/render/models.js`, `src/render/views.js`, `src/render/scene.js`, `src/render/menuview.js`, `src/sim/colliders.js`, `src/sim/player.js`, `src/sim/missile.js`, `src/data/places.js`, `src/data/encounters.js`, `src/data/place-templates.js`, `build.mjs`, `src/main.js`, `tests/headless.mjs`, `tests/views.test.mjs`, `tests/two-player-sim.test.mjs`, `tests/step12-places.test.mjs`, `docs/GLB_MODELS.md` (new), `docs/recipes/23-a-new-glb-model.md` (new), `docs/HOW_TO_ADD.md`, `docs/architecture/simulation-and-rendering.md`, `game/tallow-reach.html`.

---

## 2026-11-14: Two owner bugs, part two — the Sell/Discard confirm sits with the cursor, and hunt contracts clear the area they were taken in

Owner: "Right click sell & discard button – adjust placement of the sell /discard ui so that you barely have to move the mouse to the right to hit the sell/discard button." The first pass anchored the popover beside the cursor but left the Sell/Discard button in a footer row — far below the mouse; the owner came back with a picture: the confirm is ~120 px down. **Save version unchanged (v21)**; rebuild needed (`npm run build`, then `npm test`). NOT playtested yet.

- **The popover's action row is in the popover's header, under the title.** `SELL BASIC POWER CELL` sits on its own line with the **Sell** / **Cancel** buttons in a row directly beneath it, on every resolution and zoom (`inv-sell-head` in `styles.css` is now a fixed column — the wrap decided differently per panel width; the owner approved the stacked layout), in every copy of the sell/discard popover — the station's (`ui/menu.js`), the flight card's and the rift cache's shared `discard.js`, both discard steps included. Long titles wrap with `overflow-wrap`, and the popover is 248 px wide. Both flows anchor vertically with one rule (`popoverAnchorFor`, clicked-entry centre − 44px); with the stacked header the confirm row lands right on the mouse's line. **Accepting a hunt no longer pays for anywhere in the universe.** The kill step carries the pocket the board was read at (`step.place`, enforced by `objectiveMatches`), so raiders elsewhere do not count; the objective sentence is rewritten at acceptance to say where to fight — `Destroy {remaining} {enemy} near the {field} ({place}).` ("near the Asteroid field (Meridian Station)." at home; "near the Trade-lane asteroid field (Galedrift Expanse)." in a generated trade lane; a field-less pocket says "in {pocket}."). The name comes from the same `asteroidField` feature the spawner reads. Hunts accepted before this change keep the old any-place rule; no save migration.
- **Tests:** new `tests/hunt-place.test.mjs` (Meridian field naming and gating, generated trade-lane naming, field-less fallback); `tests/step13-missions.test.mjs` scopes its hunt to the place the kill events carry. **578/578 pass**; build green.

Files: `src/ui/menu.js`, `src/ui/discard.js`, `src/styles.css`, `src/sim/missions.js`, `tests/hunt-place.test.mjs` (new), `tests/step13-missions.test.mjs`, `game/tallow-reach.html`.

---

## 2026-11-14: Three owner-reported bugs — the Alt camera locks to the hull, one primary fires at a time, no tags over the menu

Owner, on the step-14 round: three bugs. **Save version unchanged (v21)**; rebuild needed (`npm run build`, then `npm test`). NOT playtested yet.

- **Bug 1 — the Alt free camera now locks its up vector to the ship.** With Alt held the mouse orbits and the wheel zooms (unchanged), but the view rolls with the hull: roll with E/Q and the ship holds still in frame while the world turns around it, instead of the old world-up lookAt that let the ship spin under a level camera. New `faceUp` in `util/math.js`; used by the free-cam branch of `chaseView` (`render/camera.js`). The non-Alt chase view is untouched. Alt-chords (`Alt+E` and friends) are now `preventDefault()`ed in `core/input.js` so the browser's own menu does not pop during the free camera (owner confirmed 2026-11-14; Chrome's reserved menu keys cannot be overruled).
- **Bug 2 — exactly one primary weapon fires, the selected one.** Keys **1 and 2 now select primary bay 1 and primary bay 2**; left click fires only the module in the selected bay (a gun from that bay, or the beam fitted there). A second fitted cannon stays silent until its slot is selected; an empty selected bay fires nothing. `profile.pw` stores the selection as `"1"`/`"2"` and migrates old saves in place: legacy `"cannon"`/`"beam"` map to the first bay of the flown ship holding that kind of module (falling back to the other kind, then bay one) — no version bump, v21 saves load cleanly. HUD shows the slot number next to the weapon (`1: Basic cannons`); the equip toast names the module of the slot pressed; `primarySlotIndex` in `sim/weapons.js` is the one place that folds legacy values. Guests get the same rule.
- **Bug round also swallows Alt-chords before the browser can act on them** (`core/input.js`): any `Alt+<letter>` keydown/keyup gets `preventDefault()`, so holding Alt to orbit in free cam no longer pops the browser's own menu in browsers that honour it (Firefox, Edge, Safari — and Chrome for chords it does not reserve; Chrome's own menu keys such as Alt+E/Alt+F on Windows are owned by the browser and cannot be overruled). Owner confirmed working 2026-11-14.
- **Bug 3 — no world-space tags over the main menu.** The markers live outside `#hud` (`#mk`), so the menu's `main-menu` event hid the HUD but left the last drawn set — "Trade lane asteroid field", hostiles, crates — floating on the title screen. `setReticle` now hides/shows the marker container together with the HUD (docking and the pause-equivalent paths hide them too; `drawMarkers` redraws on the next flight frame).
- **Tests:** new `tests/primary-slots.test.mjs` (selection, empty bay, legacy migration); `content.test.mjs` source guards updated to the slot model; `player-weapons`, `headless-fight`, `step9-local-only`, `step9-save`, `single-player-combat-8b`, `profile`, `content` updated to the new `pw` values. **575/575 pass**; build green.

Files: `src/util/math.js`, `src/render/camera.js`, `src/ui/hud.js`, `src/core/input.js`, `src/main.js`, `src/sim/weapons.js`, `src/sim/guns.js` (comments), `src/state/profile.js`, `src/state/state.js`, `src/index.html`, `tests/primary-slots.test.mjs` (new), `tests/content.test.mjs`, `tests/player-weapons.test.mjs`, `tests/profile.test.mjs`, `tests/single-player-combat-8b.test.mjs`, `tests/step9-local-only.test.mjs`, `tests/step9-save.test.mjs`, `tests/headless-fight.test.mjs`, `docs/CHANGELOG.md`, `docs/CHANGELOG_ARCHIVE.md`, `game/tallow-reach.html`.

---

## 2026-11-14: The rift wears real space too — the deep rift its own sky

Owner, after the wormhole sky landed and a first pass at the rift one: "Sorry, here is an image for rift, here is an image for deeprift." Two owner-provided panoramas (2880×1440 equirect WebPs), shipped **byte-for-byte**: `rift.webp` (232 KB, a teal maelstrom) and `deeprift.webp` (69 KB, near-black with one sable cluster). **Save version unchanged (v21)**; rebuild needed (`npm run build`, then `npm test`). NOT playtested — ROADMAP stays unticked.

- **`SKIES.shattered` is no longer painted.** It wraps the owner's rift panorama around the inside of the same sphere, seen from the back, one linear filter, no mips — every star where the owner put it. The broken rock still drifts inside it (owner, round three: "shattered asteroids in the background skybox"), lit with a breath of the nebula's teal.
- **The deep rift is its own image, not a dimmer copy.** `data/instances.js` picks it with `sky.variant: "deep"` on `deep_rift` (shards 40); the ordinary `guardian_rift` wears the rift sky at full presence (shards 30, no `variant`). `sky.variant` is the only colour-adjacent key a template carries besides `kind` and `shards` — no palette, no multiplier, nothing to tune.
- **`col`, `glow`, `veil` are gone from the rift templates** — they fed the painter, and no template needs them any more. `render/sky.js` is now **unused at runtime**: it survives only for `tests/sky.test.mjs`; deleting both is the owner's call.
- **Tests:** `tests/step14-instances.test.mjs` pins the rift sky's shape — declared kind, integer `shards`, the deep rift (and only the deep rift) declares `variant: "deep"`, and nothing else. 571/571 pass overall; the build inlines both panoramas as data URLs.
- **Docs:** `src/render/README.md`, `src/assets/README.md`, `testing/TESTING-14-RIFTS.md`, `docs/HANDOFF.md`.

Files: `src/assets/sky-rift.webp` (new), `src/assets/sky-deeprift.webp` (new), `src/render/scene.js`, `src/data/instances.js`, `src/render/README.md`, `src/render/sky.js`, `src/assets/README.md`, `testing/TESTING-14-RIFTS.md`, `tests/step14-instances.test.mjs`, `docs/HANDOFF.md`, `docs/CHANGELOG.md`, `docs/CHANGELOG_ARCHIVE.md`, `game/tallow-reach.html`.

## 2026-11-14: Real space inside a simple wormhole — the pocket wears the system's sky

Owner, looking at the 14c build: "Im not too happy with the skyboxes of both rifts and wormholes … they look almost like coloured fabric. I want them to look like genuine space / fantasy in high quality, Im using a 4k monitor." This round covers the **simple wormhole only**; the rift sky comes next. **Save version unchanged (v21)**; rebuild needed (`npm run build`, then `npm test`). NOT playtested yet — ROADMAP 14c stays unticked.

- **The pocket is the system's own space, always** (owner, 2026-11-14: "since we are still in the same solar system. This should always be the case"). The spawned pocket no longer declares a `sky` at all (`sim/wormholes.js` `pocketRecord`, `WORMHOLE_POCKET`): `render/scene.js` shows the ordinary starfield, exactly like every sibling pocket. Map dot, formations, lock, clock — unchanged.
- **The far side is real space.** `SKIES.shroud` is no longer painted: it wraps the owner's reference panorama — a **dark-grey nebula with few stars** (2880×1440 equirect WebP, q90, ~168 KB) — around the inside of the same sphere, seen from the back, one linear filter, no mips, no painter in between. An equirect image is exactly what a sphere's UV unwrap is, so it hangs level with no seam math at all. The panorama rides inside the single-file build as a base64 data URL (`src/assets/sky-shroud.webp`; `build.mjs` gained an esbuild `.webp → dataurl` loader) — no external asset path ever resolves.
- **`shroud` carries no colour data any more**: the three site templates (`wh_smugglers`, `wh_mining`, `wh_hive`) are `{ kind: "shroud" }` and `WORMHOLE_POCKET` lost its palette. The painter (`render/sky.js`) and the `shattered` rift sky are untouched.
- **Docs/tests:** `tests/step14c-wormholes.test.mjs` gained "the pocket is the system's own space; only the far side is somewhere else" (14/14 there, **571/571** overall); `src/render/README.md`, `data/instances.js` comments and the playtest guide describe both skies. **Open:** the rift (`shattered`) sky still reads as coloured fabric to the owner — next round.

Files: `src/assets/sky-shroud.webp` (new), `build.mjs`, `src/render/scene.js`, `src/sim/wormholes.js`, `src/data/instances.js`, `src/render/README.md`, `testing/TESTING-14C-WORMHOLES.md`, `tests/step14c-wormholes.test.mjs`, docs (`CHANGELOG.md`, `CHANGELOG_ARCHIVE.md`), `game/tallow-reach.html`.

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

---

## Older entries (index; full text in [CHANGELOG_ARCHIVE.md](CHANGELOG_ARCHIVE.md))
- 2026-11-14: Step 14 owner playtest — four bugs, four fixes (the run you quit is the run you come back to)
- 2026-11-14: Enemies are solid — rams damage both ships, rocks kill hostiles, and one falsy detour is fixed
- 2026-11-14: Step 14a feedback built — a rift you can see, lock and open — and slice 14b, a run that survives a quit
- 2026-11-14: Step 14a built — a rift you carry, an instance you fly into, and a cache that stays locked
- 2026-11-14: Step 14 groundwork — instance templates as data, and the owner's wormhole model recorded
- 2026-11-14: VISION records the owner's step 14 rift decisions; open question 5 is closed
- 2026-11-14: The owner confirmed the pending mission playtests; nothing is waiting now
- 2026-11-13: A recovery contract recovers its own crates, and the space is left clean

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
