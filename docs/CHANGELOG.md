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

## 2026-11-16: The frame edges are gently stretched — the edge-compression lens (owner's panel 2)

Owner, after rejecting narrow FOV: bodies and sky points read as ovals at the frame's edge because rectilinear projection magnifies the periphery (about 2.2x at our edge; EVE measures about 1.45x there; StarMade on 16:9 measures about 1.18x). This implements the full-frame re-map both AIs proposed, with the numbers checked and the implementation fixed where the preview's claims didn't hold — including a centre-stretch on windows not in 16:9 and a source-coverage bug that clamped the frame rim (the blurry border and too-tall edge planets). **Save version unchanged (v21)**; rebuild needed (`npm run build`, then `npm test`). With `REMAP.on = false`, the stock pipeline renders byte-for-byte. Owner rejected the look during playtest (too distorted); this branch now builds with `REMAP.on = false` so the stock pipeline renders. The lens code remains in the tree behind the knob; ROADMAP stays unticked.

- **One pass fixes world and sky together.** The flight scene renders into a wider rectilinear render target and a full-screen shader re-draws it through a blend of the rectilinear and stereographic projections, `G(a) = (1−s)·tan a + s·2·tan(a/2)` per axis shared by shader and HUD via `src/render/remapmath.js` (no three.js), with per-axis normalisers (`axisNorms`) so the centre maps at the same scale on both axes on any window shape. The frame's edge lands exactly at `REMAP.edge`; the skybox is scene geometry under this pass, so the nebula is corrected by the same amount — no sky/world drift, no repainting, no art changes.
- **Honest geometry of the knob.** Keeping today's on-axis zoom exactly while widening the frame is impossible for this curve family, so the centre zoom dips by a fixed factor instead: `strength`/`edge` in `src/data/camera.js` choose it (default `0.75` / `38°`: zoom −1.6%, oval factor 1.06 @20°, 1.20 @35°, 1.24 at the edge — EVE measures 1.21; vfov 76°; ~1.3x pixels). `0.6`/`46.5°` is the wide "panel 2" look (zoom −25%, oval factor 1.26 @35°, vfov 93°, ~2.3x pixels); `0.9`/`41°` is balanced (zoom −8%, oval factor ~1.20 at the edge, vfov 82°, ~1.6x pixels). A body dead-centre is drawn with exact horizontal/vertical pixel parity in a square or portrait window as well as 16:9. The curve is separable, not a conformal 2-D projection: at the left/right rim a small body reads wider than tall; at the top/bottom rim it still reads taller than wide (same sign as rectilinear, smaller magnitude).
- **Why not the cubic the preview implied:** the first version compressed too hard — mid-frame circles flipped to taller-than-wide (oval factor 0.79). The blend is the stable shape; `tests/remap.test.mjs` pins the centre parity at every aspect, the monotonicity, the round trip, and the per-axis coverage guarantee.
- **Stock-camera 45° test (owner request, after the lens rejection).** The stock vertical FOV is now `BASE_FOV = 45` (`data/camera.js`) and the chase distances were pulled back by tan(35°)/tan(22.5°) ≈ 1.69 (`CAMERA`: idle 18.6, flat-out 28.7, reverse 17.8) so the ship keeps the same on-screen size while the view compresses. Boost/warp widening keys off `BASE_FOV`. Not playtested; judge by reload.
- **Coverage, not clamp.** The first build checked `G(alpha)` in the coverage test instead of `tan(alpha)`, so the outermost pixels sampled clamped edge texels — the blurry frame border and the horizontally-squashed edge planets (which then read too tall). `sourceHalfTanB()` now solves the inverse projection on both axes and the test checks `tan(alpha)`; the shader still clamps only as a last-ditch guard.
- **Cost and fallbacks.** MSAA where WebGL2 + pixel ratio 1; otherwise the supersampled source carries edges. Render targets recreate on resize. `REMAP.on = false` restores the stock pipeline byte-for-byte (plain render, old HUD maths, old +4/+16 warp FOV widening). The crash fallback still renders plainly; title screen, docking orbit, pause frame (shared pass), Outfitting viewer and the starmap are unaffected. Boost/warp FOV widening is disabled in lens mode — the warp streaks and flash carry the speed feel instead (the lens cannot widen past its source coverage).
- **HUD stays aligned.** `mark()` and `coneRadiusPx()` in `src/ui/hud.js` project through the same curve when the lens is on (off-screen marker pinning unchanged); `tests/remap.test.mjs` covers the curve, the centre parity, the per-axis coverage guarantee for any aspect, and the small-angle limit of the lock ring.

Files: `src/render/remapmath.js` (new), `src/render/remap.js` (new), `src/data/camera.js` (`REMAP`, `BASE_FOV`, `CAMERA` distances), `src/render/camera.js`, `src/render/scene.js`, `src/main.js`, `src/ui/hud.js`, `src/render/README.md`, `tests/remap.test.mjs` (new, 9 tests), `docs/CHANGELOG.md`, `docs/CHANGELOG_ARCHIVE.md`, `game/tallow-reach.html`. **658/658 pass**; build green.

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

## 2026-11-15: Big moving parts are solid, and a wormhole pocket is really there after a reload

Two owner bug reports, both fixed at the level they live at rather than at the symptom.

Owner, on collision: "Meridian station arms that connect to the ring have no collision box. I think its good if
collision boxes are more accurate to the model by default. Obviously dont go completely crazy with collision box
accuracy if it causes performance issues." And then the rule that set the design: **"the way you integrate this needs
to be foundational so that big moving parts on structures have collision boxes by default. Very tiny details its ok
if they dont have collision box, try to make collision boxes as accurate as possible by default while having a
reasonable performance consideration."**

**No save change (v21).** `npm test` **633/633**, `npm run build` 3002 KB.

- **Why the arms had no collider.** They were tagged `noclip.spin`, and not by mistake: a collider is a *bake*, a
  bake is a snapshot, and a snapshot of a turning part is wrong the moment it turns. Meridian's arms are 180 m long
  at 0.1 rad/s, so a still hitbox is **144 m** away from the drawn arm inside a minute. Baking several copies
  through the turn is the other wrong answer: fat between copies, and N× the triangles forever.
- **The foundation: live colliders for moving parts.** A part named `spin` now bakes its soup **once in its own
  space** and carries `mover = { pos, quat, scale, object }`; `render/scene.js` refreshes that from the part's world
  matrix each frame (`refreshMover`), and `sim/colliders.js` carries the query into the part's space instead of
  carrying triangles out — the same trick asteroid soups already used. Exact at every angle, no re-bake, no extra
  triangles; a frame's cost for a mover is one `decompose()`. Both `collideSphereAt` (ships) and `segmentColliderHit`
  (weapons) understand movers, so the arms are solid to the hull **and** to every weapon, per the rule shipped earlier
  today. Small decoration (the twelve warning lights) stays `noclip` — the owner's exception.
- **A real bug fell out of this: `closestPointTriangle` was wrong for most hits.** Its face-interior branch was
  guarded by a triple product that is **identically zero**, so every query landing inside a triangle reported
  *vertex A* as the closest point. Penetration was then measured from a far corner and the push-out normal pointed
  at it. That affected ship-vs-scenery and ship-vs-rock everywhere, not just the arms; a box's broad flat face is
  exactly where it showed. Fixed, with two tests that compare the push-out against the real analytic surface
  distance. Flight feel is unchanged (`SHIP_RADIUS` still 4) — hulls are simply pushed out along the right normal now.
- **The wormhole bug: the pocket was never loaded, so its rocks were never there.** Owner: "Going inside a simple
  wormhole and exiting the game in the wormhole… open game again and go through the exit wormhole and you get back
  to the simple wormhole pocket in normal space. This causes the debris around the wormhole in normal space
  invisible, wormhole is visible though. The debris are visible again when you warp out and back into the simple
  wormhole pocket." `loadPlace` only fills a place when the container is not loaded — and on a normal visit that
  runs. But a pilot who quit **inside** the run is put straight back into the run by the load, so the pocket they
  came through is never visited and nothing ever builds it. `leaveInstance` → `sendPilotsHome` then returned them
  to a pocket with no world behind it: the door is rebuilt from the place definition either way, so it was visible,
  while the asteroid field (which lives in the world) was empty and therefore invisible. **Fix:** `sendPilotsHome`
  loads the place it sends the pilot back to. Idempotent, so the ordinary path is unchanged.
- **Files:** `src/render/collideModel.js`, `src/render/scene.js`, `src/render/models.js`, `src/sim/colliders.js`,
  `src/sim/instances.js`, `docs/GLB_MODELS.md`, two new tests below.
- **Tests:** new `tests/moving-colliders.test.mjs` (11) — the hitbox is exactly on the arms at 24 spin phases and
  clear between them, the soup is never rebuilt, a full turn does not drift it, ships are pushed out along the
  part's own normal, the station's still parts keep their 840 triangles, the arms add 48 (not 48× samples), and the
  source guard that the arms are still named `spin`. New `tests/wormhole-reload-return.test.mjs` (3) — quit in the
  run, reload, exit, and the pocket's field matches a fresh visit exactly (it was 0 rocks before the fix).
- **Not playtested.** The owner's own flight is the only visual check; both fixes are headless-verified only.

Files: `src/render/collideModel.js`, `src/render/scene.js`, `src/render/models.js`, `src/sim/colliders.js`,
`src/sim/instances.js`, `tests/moving-colliders.test.mjs` (new), `tests/wormhole-reload-return.test.mjs` (new),
`docs/GLB_MODELS.md`, `docs/CHANGELOG.md`, `docs/CHANGELOG_ARCHIVE.md`, `docs/HANDOFF.md`, `docs/LESSONS.md`,
`game/tallow-reach.html`.

## 2026-11-15: Every weapon stops on a collider — shots no longer pass through the station

Owner: "collision boxes that are not no-clipable stop all types of weapons / projectiles in a logical way. So all
cannons, missiles etc should impact when hitting a collision box. I notice if I shoot meridian station with cannons it
goes through it. Not sure how it works with asteroids but make sure the hit boxes stop them so its realistic."
**No save change (v21).** `npm test` **619/619**, `npm run build` 2999 KB.

- **The bug:** `updateBullets` tested hostiles (a sphere), then rocks (a distance-to-centre circle), and **never looked at
  a place's colliders at all**. A station had nothing to hit, so every shot passed through it. Enemy fire had the same
  hole in reverse — and because bolts stopped on a rock's *bounding circle* rather than its mesh, a shot could also die
  on empty space beside a lumpy one.
- **The fix, in `sim/colliders.js`:** `sweepColliders` / `segmentColliderHit` / `segmentRockHit` walk the **segment a
  projectile covered that tick** (Möller–Trumbore, two-sided) across the place's colliders and the rock soups, and return
  the nearest hit with its fraction along the path. Sweeping rather than sampling the end point matters: a 900 m/s bolt
  covers 15 m a tick, so a station spoke or a small rock can sit entirely between two ticks. Unit checks: a thin sheet
  between two ticks is caught; the nearest of two colliders wins regardless of list order; a rock is transformed into
  model space rather than every vertex out.
- **Bolt rule, in order:** a hostile's hull, then the scenery and rocks, then the pilot's hull for a hostile's shot. The
  wall is checked for both sides, because a wall is a wall whoever fired. A shot that meets scenery dies **at the impact
  point** with a spark, and damages nothing — scenery has no hull points.
- **Missiles** sweep the same swath and burst on scenery and rocks instead of sailing through. **The mining beam** is
  blocked too: a station wall between the ship and the rock stops the cut, the beam is drawn to the wall, and `beamT`
  does not advance, so a rock cannot be mined through a station.
- **The owner's exact case is a test.** `tests/projectile-collision.test.mjs` builds Meridian Station's real geometry
  (ring, hub, base, dock box; the four `noclip.spin` spokes correctly excluded), and checks a bolt down the station's axis
  stops on the hub, one at the ring hits the ring, and shots 400 m clear or 200 m above fly on.
- **`noclip` and `collide: false` still let projectiles through**, which is what they are for: only clipping colliders
  stop a weapon. That is asserted, not assumed.
- **Balance effect, measured rather than assumed:** the Meridian belt is sparse — of 24 lines out from the station, one
  meets a rock within 4 km — so combat does not become a corridor. Enemy fire can now be blocked by a rock when the pilot
  takes cover behind one, which is the realism the owner asked for.
- **One golden fixture re-recorded** (`tests/fixtures/step8b-combat-lifecycle.json`) and the reason is written into the
  test file. Every player position, heading, velocity, power reading, cooldown, missile, ore count, credit and docked
  flag is byte-identical; what changed is that shots stop at the rock and the pilot keeps the shields the raider's fire
  used to take **by passing through that same rock** (10 instead of falling to 0), so hull stays 10 and saved hp is 1, not
  0.6. Its three narrative assertions (mined ore, a missile launched, died and docked) all still hold.

---

## 2026-11-15: The skies are cube maps — six 2048 faces each, no distortion and no seams

The owner: "the skyboxes look a bit distorted and also a little bit blurry since im using 4k monitor. Make the Skybox
generator be a box, ie 6 square faces forming a cube. So remove the equirectangular ones we have now. Generate new ones
that replace the current ones." He asked for at least 4096 per face, was shown the cost (4096 = 100.7 Mpx, ~1.7–2.8 MB,
384 MB of GPU memory, 10–13 min a sky), and **chose 2048** (`--face` is still one flag away). **No save change (v21).**
`npm test` **610/610**, `npm run build` 2997 KB (was 3016 KB — smaller, with six times the pixel density where it counts).

- **The tool writes cube maps now.** `tools/skybox/skybox.py` builds the soft layers **once on a sphere in direction
  space** (`SOFT_FACE_WIDTHS = 2.0` face widths, i.e. the same texel density the old panorama had, so the looks did not
  change), then cuts six faces out of it with a 2× supersampled box filter. Every layer is a function of the direction a
  pixel looks in, never of a face's x/y, so the faces agree at their edges by construction — no margins, no per-face
  special cases, one face in memory at a time (~3 GB). One exposure for all six faces; stars placed once in direction
  space and thinned by the dust; `finish_face` tone-maps and dithers each face.
- **The seam check is new and honest.** `cube_seam_error` walks all 24 edges: for an edge pixel of a face it computes
  the direction with `face_dirs` and samples the neighbouring face through `CUBE_NEIGHBOURS`. Measured on the three
  installed skies: **worst edge 0.66/255** (a smooth sky reads ~0 here, so this is a sharp test, not a rubber stamp).
  A smoke test at 1024 per face on a smooth field reads 1.81/0.43/0.22 at face 64/256/512 and trends to 0.
- **CLI:** `--face`/`--face-size` replaces `--size` (1024 for a smoke test, 2048 the default, 4096 on the owner's word,
  8192 the ceiling); a spec's `face` key replaces `size`. `make` takes about **4½ minutes** per sky at 2048.
- **Three skies regenerated from their existing recipes**, same ids and same looks, at 2048 per face:
  `normal_space` (258 KB), `rift_chaos` (470 KB), `wormhole_grey` (279 KB) — **~1 MB for the whole set**, and the built
  page got 19 KB *smaller*. Each install wrote six faces to `src/assets/skyboxes/<id>/`, the recipe, and the registry
  lines. `tests/skybox.test.mjs` now checks six square faces per sky, six imports, one array entry in cube order.
- **The game draws a box.** `SKIES.cube` in `render/scene.js` replaces `shattered`, `panorama` and `shroud`
  (all three are **gone**, with `SHATTERED_URLS` and the imports of the owner's panoramas): a `BoxGeometry` with six
  face materials, `BackSide`, unlit, no depth write, no mipmaps, one linear filter — the same treatment the panoramas
  had. The shell no longer spins: a star pattern turning under a fixed ship reads as the ship drifting.
- **`src/render/cubemap.js` is new, and it fixed a real bug.** `BoxGeometry` groups its faces in cube order but frames
  **+Y and -Y the other way up**, so the top and bottom faces would have arrived upside down. The new file holds
  `CUBE_FACES`, `CUBE_FACE_FLIP` and `orientFace`, and `tests/skybox.test.mjs` reads `FACE_AXES` out of the generator,
  rebuilds `BoxGeometry`'s frames with three.js, and proves each flip necessary and no flip redundant. (A single
  `CubeTexture` would have needed `envMap` and a shader hook in three r128; six plain textures is the same picture
  with nothing to go wrong.)
- **Vocabulary is one word.** `SKY_KINDS = ["cube"]`, `DEFAULT_SKY.kind = "cube"`, five templates say `kind: "cube"`.
  `data/skyboxes.js` lines carry `face` instead of `size`.
- **The owner's three panoramas are kept as history** (`src/assets/sky-*.webp`, unused, recorded in
  `src/assets/README.md`); nothing draws them any more and **do not delete them without his word**.
- Docs: recipe 24, `tools/skybox/README.md` (how the cube is made, the face-size rule, the never-hand-flip rule),
  `src/assets`, `src/data` and `src/render` READMEs, LESSONS L24.
- **Needs the owner's playtest:** the numbers say seamless and the preview sheets look like the approved skies, but no
  browser exists in the sandbox — only his 4K screen can confirm "sharp and undistorted".

---

## 2026-11-15: Every sky is a generated skybox now — normal space, rifts and wormholes, and the starfield is gone

The owner picked the skies and asked for three things in one go: normal space wears the sky we kept earlier, rifts get
a black-and-teal chaotic one, wormholes a dark grey one, and "remove the existing starfield. This is because our
previously generated skybox already has some stars baked in it. I might re-add star fields in the future but not now."
**No save change (v21).** `npm test` **604/604**, `npm run build` 3016 KB (was 2466 KB).

- **Three skies installed** with the tool (recipe 24), each `OK: dark, seamless and within budget`:
  `normal_space` (140 KB, preset `void`, seed 3 — the sky the owner kept on 2026-11-15, re-made under its final name),
  `rift_chaos` (239 KB, preset `maelstrom`, seed 23, turbulence 1.2, wisps 0.9, dust 1.0/0.85/1.5 — black space torn
  open by chaotic teal gas), `wormhole_grey` (173 KB, preset `ash`, seed 5, `very_dark`, saturation 0.7 — dark grey, no
  purple cast). Recipes in `tools/skybox/specs/`.
- **Normal space is a sky, not a template.** New `DEFAULT_SKY = { kind: "panorama", skybox: "normal_space", shards: 0,
  starfield: false }` in `data/places.js`; `render/scene.js` uses `placeAt(id).sky || DEFAULT_SKY`, so every ordinary
  pocket wears it and a place may still override it. **The starfield is off:** `STARFIELD = { enabled: false }` keeps the
  geometry and the per-frame follow, `showPlace` shows it only for a sky that says `starfield: true`, and
  `menuview.js` clones it only when the switch is on — nothing draws two sets of stars. Re-adding star fields later is
  that one flag plus a `starfield: true` on whichever sky wants them.
- **Rifts and wormholes re-skinned.** Both rift templates now wear `rift_chaos` (the deep rift keeps its 40 shards and its
  deeper damage; the owner asked for one rift look, so it no longer wears `variant: "deep"`), and all three `wh_*`
  simple-wormhole templates wear `wormhole_grey` instead of `shroud`.
- **`skyFor(def)`** in `scene.js` drops a sky nothing can draw — a `panorama` whose skybox id is not installed — so a
  typo costs a background and never the place (and `npm test` names it).
- **The tool gained `remove`** (`skybox.py remove <id>`): it deletes the image, the recipe and both registry lines, in
  that order, because `src/assets/skyboxes/` is the tool's folder. The duplicate `teal_black_test` was removed with it
  (the same picture as `normal_space`, and the build would have inlined the same sky twice).
- **Not restructured, deliberately.** The owner asked about file structure and then ruled it out: "skyboxes aren't part
  of refactor plan, also isn't 14d a part for wormhole systems" — correct on both counts, so nothing moved. The three
  owner panoramas in `src/assets/` stay where they are (no template names two of them; `sky-deeprift` only as
  `SKIES.shattered`'s fallback) and `src/assets/README.md` says so.
- **Tests:** `tests/skybox.test.mjs` now checks `DEFAULT_SKY` as well as every template (a skybox only normal space names
  would otherwise be unchecked) and adds "normal space wears a generated sky, and the drawn starfield is off", which reads
  `showPlace`'s own expression so writer and reader cannot drift apart (L19). `tests/step14c-wormholes.test.mjs` now
  expects the generated grey sky on the far side.
- Files: `src/assets/skyboxes/*.webp`, `tools/skybox/specs/*.json`, `tools/skybox/skybox.py`, `tools/skybox/README.md`,
  `src/data/skyboxes.js`, `src/render/skyboxes.js`, `src/data/places.js`, `src/data/instances.js`, `src/render/scene.js`,
  `src/render/menuview.js`, `tests/skybox.test.mjs`, `tests/step14c-wormholes.test.mjs`, the folder READMEs,
  `src/assets/README.md`, `game/tallow-reach.html`.

---


## 2026-11-15: Kept for later — a black-and-teal sky, installed but worn by no place yet

The owner asked to see the new skybox generator make a 4K sky: "black and teal highlights of nebula, few stars",
then picked the picture and said "keep it for later". **No save change. `npm run build` and `npm test` needed**
(the page grows by about 140 KB). **No place wears it**, so the game looks exactly as before.

- **Installed:** `teal_black_test` — "Teal Black (kept for later)", preset `void`, seed `3`, 4096×2048 WebP,
  **140 KB**, report `OK: dark, seamless and within budget` (mean brightness 0.040, seam 0.50/255, 4760 stars).
  Registered by the tool in `src/data/skyboxes.js` and `src/render/skyboxes.js` (the GENERATED lines only) and
  covered by `tests/skybox.test.mjs` like any other sky.
- **Recipe kept** at `tools/skybox/specs/teal_black_test.json`: `mood very_dark`, gas `#2cb4c2`/`#1f78a6`,
  `stars.density 0.14`, `stars.halos 0.5`, `nebula.amount 1.15`, `nebula.coverage 0.5`, `dust.amount 0.9`,
  `dust.coverage 0.45`, `dust.rim 1.35`. Re-make it exactly with
  `python3 tools/skybox/skybox.py make teal_black_test --spec tools/skybox/specs/teal_black_test.json --install`.
- **To use it later**, no re-render needed: put `sky: { kind: "panorama", skybox: "teal_black_test", shards: 0 }`
  on an instance template (`data/instances.js`, recipes 22 and 24). `shards` is how many broken rocks drift in
  front of it; 0 suits an empty-pocket look.
- The preview/test folder `skybox-out/` is scratch and intentionally not committed (recipe 24 rule).

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

## Older entries (index; full text in [CHANGELOG_ARCHIVE.md](CHANGELOG_ARCHIVE.md))
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
