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

## 2026-11-16: Wider 4 km belts, restored Meridian, quieter planets and circular sky markers

Owner requested wider belts with the nearest surface ~4 km from central arrival,
unchanged height and similar density. Meridian arc: inner 4 km, width 2 km,
938 rocks, height ±280 m. Dedicated arcs: inner 4 km, width 2.75 km, height
±420 m; counts scale by annular area. Taper and non-overlap packing remain.

Meridian explicitly selects its original pre-rework 90 m ring/four-spoke model.
Commerce rings use original grey/amber colours with uniform lights; top cap base
now touches the core top (y=90), rather than clipping through it. Industrial
refineries lose the detached bottom slab. Planets use solid class colours with
lighting/atmosphere, no low-resolution procedural surface maps (generator retained
unused for future work). Local planets shrink from ~105° to ~36° angular diameter
and sit below the horizontal arrival view. Distant planet bodies remain coloured
spheres. Pocket/belt PointsMaterial markers discard corners in their shaders so
they are circular, not square. Menu still has its planet and generated sky.

Files: `src/data/{places,stations}.js`, `src/sim/galaxy.js`,
`src/render/{models,systemsky}.js`, render README, pocket-density and new visual
regression tests, generated HTML, handoff and lessons. **Save stays v21**.
`npm run build` passes; **658/658 tests pass**. Owner preview pending;
larger belts have more rocks, so check performance as well as appearance.

Follow-up: owner requested planets 30% bigger and back in line with the main POI,
plus less-perfect belt contours and occasional strays. Local planet radius now
0.338 of sky depth (was 0.26), elevation zero, aligned with the POI/arrival heading.
Planet arrivals face the local field's horizontal direction when present. Belt
contours have seeded multi-wave inner/width variation; inner shifts only outward
so the ~4 km clearance stays safe. ~3.5% of slots become outer strays, 250–800 m
beyond the local band, still at the same height and with non-overlap spacing.
Tapered tips, rock counts and stable slot planning remain. Tuning lives in new
`src/data/scenery.js`; changes also touch `sim/asteroids.js`, `sim/galaxy.js`,
`render/systemsky.js`, density/visual tests and generated HTML. Save v21;
`npm run build` passes; **659/659 tests pass**. Updated visual/performance preview still pending.

Second preview follow-up: owner approved planet elevation but wanted another 30%
size increase and a much more visible belt-tip falloff. Planet sky radius is now
0.4394 (was 0.338), with distance/elevation/POI alignment unchanged. Arc density
now follows a full-length sine-squared falloff from the populated middle to a
1% weight at each tip, instead of a short end taper with a 12% floor. Actual
packed-rock tests require the outermost two 10% sectors combined to contain less
than one fifth of the equal-width central sector. Counts, height, clearance,
irregular contours, strays and collision spacing stay unchanged. Files:
`data/scenery.js`, `sim/asteroids.js`, density/visual tests, generated HTML and
handoff. Save v21; `npm run build` passes; **659/659 tests pass**. Owner preview pending.

Third preview follow-up: owner requested half overall belt density, stronger
thinning from the C middle, and atmosphere shells one third as thick. Meridian
now has 469 rocks; dedicated belt count scaling halved from 0.56 to 0.28 (same
footprint/height). Arc weighting is sine-to-the-fourth with a 0.2% tip floor,
rather than sine-squared with a 1% floor. Strays and non-overlap rules remain.
Atmospheres scale the shell's excess radius by 1/3, never the surface radius;
applied to system-sky planets, authored/menu planets, GLB atmosphere fallback,
and distant-planet halo extent. Surface size, elevation and colours unchanged.
Files: `data/{places,scenery}.js`, `sim/galaxy.js`, `render/{models,systemsky}.js`,
density/visual tests, generated HTML and handoff. Save v21. `npm run build` passes;
**660/660 tests pass**. Owner preview pending.

Marker follow-up: arc-field HUD labels now sit halfway through the band at the
angular midpoint of the populated C (opposite its opening), using the seeded
contour at that angle. The field origin and central warp arrival do not move.
Ordinary field markers remain at their centres. Files: `sim/asteroids.js`,
`ui/hud.js`, `tests/pocket-density.test.mjs`, generated HTML and handoff.
Save v21; build green; **661/661 tests pass**. Owner preview pending.

## 2026-11-16: Flatter, lighter belts with naturally thinning edges

Owner approved the C arcs, then requested 30% less height, confirmed 20% LESS
density, and gradual thinning toward both tips. Meridian's centre-height range
is now ±280 m (was ±400); dedicated belts ±420 m (was ±600). Counts scale by
0.7 × 0.8 = 0.56 so reducing height does not inadvertently INCREASE volume
density: Meridian has 420 rocks; generated belts 392–532. Arc-tip density uses
a smoothstep taper over the outer quarter of each end, down to 12% placement
weight at the tips; the broad middle remains populated. The ~2 km clear centre,
non-overlap bounds, giant sizes and stable slot planning remain unchanged.

Ordinary template fields (including secondary/extended fields) and planet fields
are 25% wider, with quadratic radial falloff from weight 1 at the centre to 0.3
at the edge. Counts stay similar: the larger footprint offsets the falloff,
keeping central density approximately as before. Smaller-field heights unchanged.
Both stable and ad-hoc spawns apply the same density profiles.

Files: `src/data/{places,place-templates}.js`, `src/sim/{asteroids,galaxy}.js`,
`tests/pocket-density.test.mjs`, generated HTML and handoff. **Save stays v21**.
`npm run build` green; **655/655 tests pass**, including profile symmetry,
actual arc-tip thinning, field widening, spacing and arrival-clearance tests.
Updated taper visuals still need owner preview.

## 2026-11-16: C-shaped belts, central arrivals and non-intersecting asteroids

Owner: make belts a tightly packed big C, arrive in the middle with the nearest
asteroid about 2 km away; Meridian should feel surrounded rather than one blob.
Meridian now has a 270-degree, 750-rock arc around [0, 0, 600], surrounding the
station while keeping a clear approach opening. Dedicated belts have 700–950
rocks in seeded-orientation 270-degree arcs. Arrivals are the arc centre, facing
the populated side. Inner clearance is measured to conservative rock surfaces,
not centres; tests check the nearest surface is 2.0–2.2 km away.

Largest-first deterministic packing uses bounds of the actual built-in lumpy
geometry and nonuniform scale, with 20 m extra spacing. All stable slots across
all fields are reserved, including mined slots, so reload/respawn order cannot
shift neighbours. A bounded layout cache avoids rebuilding each slot. Overfull
custom fields omit unplaceable slots after finite retries, never force overlap.
Giants remain, at lower frequency to leave room for dense smaller rocks. These
bounds cover built-in shapes; custom GLB overrides need separate bounds review.
Rift clearance now respects the C opening rather than treating it as a solid ball;
secondary-field cooldown respawns resolve the correct field. Meridian's launch
heading is preserved using an explicit field focus.

Files: `src/data/{places,place-templates}.js`, `src/sim/{galaxy,asteroids,places,instances}.js`,
`tests/pocket-density.test.mjs`, generated HTML and handoff. **Save stays v21**.
`npm run build` green; **653/653 tests pass**. Owner visual/performance preview
still required. Existing field slot cooldowns remain keyed by field id and slot.

## 2026-11-16: Denser pockets, close warp-ins and massive asteroids

Owner preview: overall good, but pockets were too spread out and rocks too small.
Restored Meridian's original 70-rock field at [1800, 200, -1500], radius 700 m;
five connected 90-rock sections extend it ~6.4 km outward (520 rocks total).
Dedicated belts now chain 5–7 dense sections, each 750–1000 m radius and roughly
65–120 rocks. Frontiers regain dense local fields with outward extensions or a
second field; trade/outpost/planet fields and encounter positions move closer.
Stations arrive at roughly 650–1200 m plus small jitter; fields arrive 500–800 m
outside their first section. Seeded facing and planet approaches remain intact.
Rare low-poly giants mix with normal rocks: radii 180–400 m in frontier fields,
180–360 m in Meridian extensions, 200–500 m in dedicated belts. Independent
size RNG preserves ordinary stable slots; existing shapes/collision are reused.

Files: `src/data/{places,place-templates}.js`, `src/sim/{galaxy,asteroids}.js`,
`tests/pocket-density.test.mjs`, loader test and combat fixture (only original
launch quaternions restored), generated HTML and handoff. **Save stays v21.**
`npm run build` passes; **652/652 tests pass**. Visual density and frame-rate
still need owner preview.

## 2026-11-16: The generated universe rework — vast EVE-like pockets, seeded planets, dedicated belts, four station classes

Owner: "Let's do a real variety pass on the generated universe … asteroid belts should be their own dedicated pockets …
makes 100–1000 km planets … 1–4 seeded planets per system … four station classes … EVE-like scale …" **Save version
unchanged (v21)**; rebuild needed (`npm run build`, then `npm test`). NOT playtested yet — built low-poly first for
owner preview; heavy shader/texture polish waits for that preview.

- **Pockets are vast and EVE-like, and every pocket is different.** Frontier/trade-lane/outpost templates were
  rescaled to kilometres-wide spreads (a frontier belt can be 6.8–14.4 km radius; trade lanes and outposts vary or
  lose their field entirely) with seeded per-pocket variation (`varyTemplateFeatures` in `data/place-templates.js`):
  position, radius, rock count, two-separated-fields rolls, and encounter positions rolled per pocket. Meridian is
  vast too (the home field sits ~16 km out at radius 3.6 km); it keeps only a small home-field convenience.
- **Ambient static loot is gone.** Generated pockets no longer declare derelict/resource-cache raw-crate features;
  kill drops, hostile drops, mission drops, recovery contracts and authored mission crates are untouched. Existing
  save placeMemory migrates untouched (v21).
- **Dedicated belt pockets.** 1–3 per system, named `<System> - Asteroid belt N`, each its own **`role: "belt"`** pocket
  on its own map annulus (`beltRadius`/`beltSpread`), 34–182 rocks with a seeded lean/rich roll, fields 7.8–18.3 km
  radius, with tier-scaled one-shot hostile patrols (chance/wanderers/count scale with the system's advisory tier).
  Internal hub↔belt links keep them warpable (and reachable in a `links`-policy system); map icon is three ochre dots.
- **Seeded planets.** 1–4 per system (all systems, black holes included), named `<Core proper name>-b`…`-e` after the
  core proper name (never `-a`). Four classes — rocky, ice, gas giant, volcanic — with per-class radius (~110–1000 km),
  palette, atmosphere, spin, orbit-rock counts and rock ore tables (`data/planets.js`, `data/loot.js`). Each planet is a
  warpable low-orbit pocket with some orbit-rock fields; it renders as a true-angular-size body elsewhere in the system
  (`systemsky.js`, AU-based) and as a dominating sky backdrop inside its own pocket (procedural maps in
  `render/planetmaps.js`, Lambert day/night shading, additive atmosphere shell). Positions are fixed — no orbits, no
  artificial boundary anywhere. Planets also get internal hub↔planet links and a ring+disc map icon.
- **Stations: four classes with real silhouettes.** `commerce` (spun ring), `industrial` (foundry tower stack),
  `military` (octagonal citadel), `mining` (excavation platform with drill arm), chosen by place id hash; generated
  station names are class-weighted (`data/stations.js`). Built-ins today; `station.<class>.glb` (then `station.glb`)
  overrides later — drop-in, no code changes.
- **Warp-in is fixed, seeded and unique per pocket:** generally 3–8 km from the pocket's main POI on a line facing it
  (belts/planets face their field/approach direction; station pockets face their station; empty pockets face the
  star/black hole). Computed once at resolve time (`finalizeArrivals` in `sim/galaxy.js`), carried on the place record
  (`enter.pos`/`enter.face`); `sim/sectors.js` applies the face on arrival.
- **The menu wears the normal-space generated skybox** (in addition to its station/planet composition; the planet is a
  fixed in-scene class world now — planets are pockets, not scenery). **The title keeps its planet backdrop** (owner).
- **Map:** belt/planet annuli and icons; `minZoom` semantics unchanged (1 = system fit; zooming out from fit exits to
  the galaxy). **Save stays v21.** **649/649 tests pass** (the 8b fixture was re-recorded: launch heading follows the
  moved home field; several tests were updated to the vast world; the static-encounter machinery is now tested with an
  ad-hoc authored record since generated pockets no longer emit one).

Files: `src/data/planets.js` (new), `src/data/stations.js` (new), `src/render/planetmaps.js` (new), `src/data/place-templates.js`,
`src/data/places.js`, `src/data/galaxy.js`, `src/data/loot.js`, `src/sim/galaxy.js`, `src/sim/sectors.js`, `src/render/systemsky.js`,
`src/render/models.js`, `src/render/menuview.js`, `src/ui/starmap.js`, `src/styles.css`,
`tests/fixtures/step8b-combat-lifecycle.json`, `tests/single-player-combat-8b.test.mjs`, `tests/content.test.mjs`,
`tests/step11b-starmap.test.mjs`, `tests/step12-places.test.mjs`, `tests/step14-instances.test.mjs`,
`src/data/README.md`, `src/render/README.md`, `game/tallow-reach.html`.

Known follow-ups: true-scale AU flight is a later decision (planets are warp-gated today; the sky's AU math is
distance-correct); 3 km-wide fields will need the frame budget/graphics-settings pass before texture work; station/planet
GLB drops; playtest not done yet (owner 2026-11-16 build).

---

## 2026-11-16: The edge-compression lens is removed

Owner: "oh remove the lense thing i wont use it in the future" — after saying the current view looks good. The experiment is deleted, not merely disabled: `src/render/remap.js`, `src/render/remapmath.js` and `tests/remap.test.mjs` are gone; `main.js` renders the flight/pause paths with `renderer.render(scene, camera)` directly; `render/camera.js` widens FOV on boost/warp unconditionally again; the HUD lock ring and marker project through the stock projection only; the `src/render/README.md` lens rows are gone. The current look is the stock horizontal-85° + aspect-derived vertical camera. **Save version unchanged (v21)**; rebuild needed (`npm run build`, then `npm test`). ROADMAP stays unticked until a formal playtest tick.

Files: `src/render/remap.js` (removed), `src/render/remapmath.js` (removed), `tests/remap.test.mjs` (removed), `src/main.js`, `src/render/camera.js`, `src/render/README.md`, `src/data/camera.js`, `src/ui/hud.js`, `docs/HANDOFF.md`, `docs/CHANGELOG.md`, `docs/CHANGELOG_ARCHIVE.md`, `game/tallow-reach.html`. **649/649 pass** (9 remap tests deleted with the code); build green.


---

## 2026-11-16: The frame edges are gently stretched — the edge-compression lens (owner's panel 2)

Owner, after rejecting narrow FOV: bodies and sky points read as ovals at the frame's edge because rectilinear projection magnifies the periphery (about 2.2x at our edge; EVE measures about 1.45x there; StarMade on 16:9 measures about 1.18x). This implements the full-frame re-map both AIs proposed, with the numbers checked and the implementation fixed where the preview's claims didn't hold — including a centre-stretch on windows not in 16:9 and a source-coverage bug that clamped the frame rim (the blurry border and too-tall edge planets). **Save version unchanged (v21)**; rebuild needed (`npm run build`, then `npm test`). With `REMAP.on = false`, the stock pipeline renders byte-for-byte. Owner rejected the look during playtest (too distorted); this branch now builds with `REMAP.on = false` so the stock pipeline renders. The lens code remains in the tree behind the knob; ROADMAP stays unticked.

- **One pass fixes world and sky together.** The flight scene renders into a wider rectilinear render target and a full-screen shader re-draws it through a blend of the rectilinear and stereographic projections, `G(a) = (1−s)·tan a + s·2·tan(a/2)` per axis shared by shader and HUD via `src/render/remapmath.js` (no three.js), with per-axis normalisers (`axisNorms`) so the centre maps at the same scale on both axes on any window shape. The frame's edge lands exactly at `REMAP.edge`; the skybox is scene geometry under this pass, so the nebula is corrected by the same amount — no sky/world drift, no repainting, no art changes.
- **Honest geometry of the knob.** Keeping today's on-axis zoom exactly while widening the frame is impossible for this curve family, so the centre zoom dips by a fixed factor instead: `strength`/`edge` in `src/data/camera.js` choose it (default `0.75` / `38°`: zoom −1.6%, oval factor 1.06 @20°, 1.20 @35°, 1.24 at the edge — EVE measures 1.21; vfov 76°; ~1.3x pixels). `0.6`/`46.5°` is the wide "panel 2" look (zoom −25%, oval factor 1.26 @35°, vfov 93°, ~2.3x pixels); `0.9`/`41°` is balanced (zoom −8%, oval factor ~1.20 at the edge, vfov 82°, ~1.6x pixels). A body dead-centre is drawn with exact horizontal/vertical pixel parity in a square or portrait window as well as 16:9. The curve is separable, not a conformal 2-D projection: at the left/right rim a small body reads wider than tall; at the top/bottom rim it still reads taller than wide (same sign as rectilinear, smaller magnitude).
- **Why not the cubic the preview implied:** the first version compressed too hard — mid-frame circles flipped to taller-than-wide (oval factor 0.79). The blend is the stable shape; `tests/remap.test.mjs` pins the centre parity at every aspect, the monotonicity, the round trip, and the per-axis coverage guarantee.
- **Stock-camera horizontal-85° test (owner request).** The horizontal FOV is now fixed at `BASE_HFOV = 85` (`data/camera.js`); the vertical FOV is derived from the window aspect (`verticalFovForAspect`, ≈54.54° on 16:9 — essentially the 55° trial with an explicit horizontal target). Chase distances were pulled back for 16:9 by tan(35°)/tan(27.268°) ≈ 1.358 (`CAMERA`: idle 14.9, flat-out 23.1, reverse 14.3) so the ship keeps the same on-screen size. On non-16:9 windows the vertical FOV changes while the camera distance stays static, so framing differences are expected. Boost/warp widening keys off `verticalFovForAspect(camera.aspect)`. Not playtested; judge by reload.
- **Coverage, not clamp.** The first build checked `G(alpha)` in the coverage test instead of `tan(alpha)`, so the outermost pixels sampled clamped edge texels — the blurry frame border and the horizontally-squashed edge planets (which then read too tall). `sourceHalfTanB()` now solves the inverse projection on both axes and the test checks `tan(alpha)`; the shader still clamps only as a last-ditch guard.
- **Cost and fallbacks.** MSAA where WebGL2 + pixel ratio 1; otherwise the supersampled source carries edges. Render targets recreate on resize. `REMAP.on = false` restores the stock pipeline byte-for-byte (plain render, old HUD maths, old +4/+16 warp FOV widening). The crash fallback still renders plainly; title screen, docking orbit, pause frame (shared pass), Outfitting viewer and the starmap are unaffected. Boost/warp FOV widening is disabled in lens mode — the warp streaks and flash carry the speed feel instead (the lens cannot widen past its source coverage).
- **HUD stays aligned.** `mark()` and `coneRadiusPx()` in `src/ui/hud.js` project through the same curve when the lens is on (off-screen marker pinning unchanged); `tests/remap.test.mjs` covers the curve, the centre parity, the per-axis coverage guarantee for any aspect, and the small-angle limit of the lock ring.

Files: `src/render/remapmath.js` (new), `src/render/remap.js` (new), `src/data/camera.js` (`REMAP`, `BASE_HFOV`, `verticalFovForAspect`, `CAMERA` distances), `src/render/camera.js`, `src/render/scene.js`, `src/main.js`, `src/ui/hud.js`, `src/render/README.md`, `tests/remap.test.mjs` (new, 9 tests), `docs/CHANGELOG.md`, `docs/CHANGELOG_ARCHIVE.md`, `game/tallow-reach.html`. **658/658 pass**; build green.

---

## 2026-11-16: The system sky passed its playtest

Owner: "good, play test so far passed" (2026-11-16) — the system-space work from the previous entry is confirmed:
star/black hole visible and correctly placed, dots, per-pocket lighting, per-system sizes. Docs-only status change; no
code moved. HANDOFF and the ROADMAP current position and log line now say the playtest passed; 14c remains ticked. Save
version unchanged (**v21**); `npm run build` and `npm test` re-run green.

---

## 2026-11-16: System space — AUs, a true 3D position for every pocket, and a sky that shows the system you're in

Owner: "All pockets in a system should have a type of 3d position in x, y, z. This is to prepare the game for a
potential feature in the future if i make warping within a system more dynamic by putting you in a so called 'warp
space' … Another reason is so that the skybox will now have another layer that is dependant on the 3d position of the
pocket and celestials." Owner's playtests of everything pending (14c, cube-map skies, collision damage, Test Ship,
both bug rounds) **passed**; 14c is ticked in ROADMAP. **Save version unchanged (v21)**; rebuild needed (`npm run
build`, then `npm test`). NOT playtested yet.

- **Pockets have 3D AU positions, derived — never saved.** `systemSpatialLayout(world, systemId)` in `sim/galaxy.js`
  lifts the same deterministic layout the 2D pocket map uses into AUs (1 AU = 150 million km): map `x` → AU `x`, map
  `y` → AU `z`, and a tiny seeded height per pocket inside `±heightAmplitudeAu` (1.2 AU) so bodies don't ride one
  line; an authored `mapHeight` wins the roll (the owner's future manual-height path). The map stays 2D and unchanged;
  no save shape changes. Runtime-registered wormhole pockets are included via their authored `mapPos`, like their
  siblings. Snapshot: systems are measured in AUs — flying inside a pocket never meaningfully moves it in the system.
- **Systems have their own size, and it's dynamic.** Each system rolls a stable seeded multiplier in [0.6, 1.6]
  (`systemScale`, hashed from seed + system id) on `auPerMapUnit` (0.05) — that is the one fixed conversion; some
  systems come out compact, some vast, and each keeps its own. A system's outer boundary (`radiusAu`) is simply its
  farthest pocket from the core, so adding a farther pocket makes the system bigger by itself. No field is stored.
- **The sky has a system layer now (`render/systemsky.js`).** Every ordinary pocket of a system — including a spawned
  simple wormhole's pocket — hangs the system's star/black hole in its true direction and every sibling pocket as a
  barely-visible dot. The body renders as a real 3D sphere at the sky's depth with an additive halo: it cannot be
  flown to (the sky follows the camera), and its apparent size is its set AU size over the flying pocket's distance
  (`star.radiusAu` 0.16 / `blackHole.radiusAu` 0.1) — closer pocket → bigger body, compact system → bigger sun.
  Black hole: dimmer, slight orange tint; stars are one look, with room for shades later. Instances (rifts, the far
  side of a wormhole) are in no system and keep their own skies, unchanged.
- **The light always comes from the body you can see.** `showPlace` re-aims the one DirectionalLight per pocket from
  the star/black hole direction; black hole light is dimmer (1.35 vs 2.1) and orange-tinted. Instances get the old
  default back; hemisphere light unchanged.
- **Tests:** new `tests/system-spatial.test.mjs` (9) pins the derivation (heights inside the band, map↔3D lift, scale
  bounds and stability, boundary growth, origin-centred body, star/blackHole core, runtime wormhole inject, tuning
  validation). **649/649 pass**; build 3008 KB.
- **Not done, deliberately:** the warp-space flight itself (step TBD), star shades, authored per-system scale
  override, per-pocket authored heights beyond the `mapHeight` hook, lighting from a raised body on the 2D map
  (map stays 2D).

Files: `src/data/galaxy.js`, `src/sim/galaxy.js`, `src/render/systemsky.js` (new), `src/render/scene.js`, `tests/system-spatial.test.mjs` (new), `src/render/README.md`, `src/sim/README.md`, `src/data/README.md`, `testing/TESTING-SYSTEM-SKY.md` (new), `docs/architecture/world-and-map.md`, `docs/architecture/simulation-and-rendering.md`, `docs/HANDOFF.md`, `docs/ROADMAP.md`, `docs/CHANGELOG.md`, `docs/CHANGELOG_ARCHIVE.md`, `game/tallow-reach.html`.

---

## 2026-11-15: Hitting the station hurts again — solid means collision damage, by default

Owner: "Collision damage is gone from the meridian station. Everything that is solid should apply collision damage
unless otherwise specific. Asteroids still apply collision damage correctly."

Exactly right, and it was one default. A rock's collider carries `damage: 1` (hardcoded in `collideRockAt`), so rocks
always hurt. Scenery went the other way: `colliderFromObject` took `damage = 0`, `scene.js` passed
`f.collideDmg ?? 0`, and `player.js` gated on `hit.damage > 0` then multiplied by the factor — so a factor of 0
zeroed the damage and the condition skipped it. Every station, planet and cave had been a free bounce since the
model-fitted collision work, and **no test checked it either way**, which is why it survived three sessions.

**No save change (v21).** `npm test` **640/640**, `npm run build` 3002 KB.

- **The rule is now the owner's rule: solid means `damage: 1`, the same factor a rock uses.** Fly into Meridian above
  25 m/s and it costs `speed * 0.015 * damage` — shields first, exactly the rock rate, measured. The 25 m/s threshold
  is unchanged (drifting into a station is still free).
- **Opt-outs are data, not defaults.** `collideDmg: 0` makes a surface solid but harmless (a bounce), `collideDmg: 2`
  makes one hurt twice as much, `collide: false` still means no collider at all. Default `1` in both
  `colliderFromObject` and `scene.js`.
- **Hostiles obey the same rule.** `ai.js` used to bounce raiders off scenery for free while a rock hurt them; scenery
  now damages them through the same `enemy-rammed` event with `byPlayer: null`, so it is an environmental kill that
  credits no pilot and settles every kill objective the same way a rock kill does. The rock path's 25 m/s gate is
  kept for both.
- **A test-prop lesson, not a game bug:** a *single flat triangle* is a bad stand-in for a wall — a 4.8 m hull can
  straddle a zero-thickness plane between two ticks and register nothing. Real scenery is closed geometry and every
  Meridian part is thick enough (thinnest 2 m, so a 4.8 m hull overlaps it from 3.8 m away). The new hostile test
  builds a closed slab.
- **Files:** `src/render/collideModel.js`, `src/render/scene.js`, `src/sim/player.js`, `src/sim/ai.js`, docs.
- **Tests:** new `tests/collision-damage.test.mjs` (6) — the bake defaults to 1 for still parts and movers, flying
  into the station costs hull, the cost is the rock rate scaled by the factor, `collideDmg: 0` bounces for free,
  slow contact is still free, and a rock and a station cost the same for the same approach. `tests/enemy-collision.test.mjs`
  gains one (scenery damages a hostile, `collideDmg: 0` does not). Two of these were checked to FAIL with the old
  default restored.
- **Not playtested.** Headless only; the owner's own flight is the visual check.

Files: `src/render/collideModel.js`, `src/render/scene.js`, `src/sim/player.js`, `src/sim/ai.js`,
`tests/collision-damage.test.mjs` (new), `tests/enemy-collision.test.mjs`, `docs/GLB_MODELS.md`, `docs/HANDOFF.md`,
`docs/CHANGELOG.md`, `docs/CHANGELOG_ARCHIVE.md`, `game/tallow-reach.html`.

## Older entries (index; full text in [CHANGELOG_ARCHIVE.md](CHANGELOG_ARCHIVE.md))

- 2026-11-15: Big moving parts are solid, and a wormhole pocket is really there after a reload

- 2026-11-15: Every weapon stops on a collider — shots no longer pass through the station

- 2026-11-15: The skies are cube maps — six 2048 faces each, no distortion and no seams

- 2026-11-15: Every sky is a generated skybox now — normal space, rifts and wormholes, and the starfield is gone
- 2026-11-15: Kept for later — a black-and-teal sky, installed but worn by no place yet
- 2026-11-15: A skybox generator, so every new instance can have a dark, realistic 4K sky
- 2026-11-15: The Test Ship — a 1-credit hull with 100× Hull HP and 10× damage, flown with the owner's GLB
- 2026-11-14: Models and collision are real models now — drop-in `.glb` files, hulls flush with the drawing
- 2026-11-14: Two owner bugs, part two — the Sell/Discard confirm sits with the cursor, and hunt contracts clear the area they were taken in
- 2026-11-14: Three owner-reported bugs — the Alt camera locks to the hull, one primary fires at a time, no tags over the menu
- 2026-11-14: The rift wears real space too — the deep rift its own sky
- 2026-11-14: Real space inside a simple wormhole — the pocket wears the system's sky
- 2026-11-14: Slice 14c built — simple wormholes spawn themselves, and save v21
- 2026-11-14: The sky loses its lines, and opening a loot card leaves the ship still
- 2026-11-14: Rift revisions after the playtest — the cache is a trade, every run is 20 minutes, and the sky has no stars
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
