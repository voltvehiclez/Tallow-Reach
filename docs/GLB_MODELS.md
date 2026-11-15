# GLB models — drop-in replacements and flush collision

> The authoring reference for `.glb` files and model-fitted collision. The step-by-step checklist
> is [recipes/23](recipes/23-a-new-glb-model.md). Read the checklist in [HOW_TO_ADD.md](HOW_TO_ADD.md) first.

Every drawn thing in the game can be drawn from a `.glb` instead of its built-in geometry, and every
solid thing is collided against the triangles that are actually drawn. Both are additive: **when no
`.glb` exists for a key, everything is exactly as it was before this system landed.**

## Dropping a model in

1. Export a **binary glTF (`.glb`)** from your tool. Blender: *File → Export → glTF 2.0 → Binary (.glb)*.
2. Name it exactly `<key>.glb` and put it in `src/assets/models/` (see the key table below).
3. Run `npm run build`. `build.mjs` regenerates `src/render/model-manifest.js` from whatever is in
   `src/assets/models/` — data URLs inlined, same pattern as the skybox artwork, so the sandboxed
   preview never resolves an external path. A fresh checkout has an empty folder and an empty manifest.
4. Run `npm test`. Done. No code changes, no new dependencies.

If the file is missing, unreadable or invalid, the game logs `[models] "<key>" failed to load; using the
built-in model.` once at boot and uses the built-in model — a broken asset never breaks boot.
`loadedModelKeys()` / `failedModelKeys()` in `render/gltf.js` say what happened.

## The keys

| Key (file name) | Replaces | Scale contract | Notes |
| --- | --- | --- | --- |
| `ship.<class>` | the built-in hull of that ship class (`wasp`, `prospector`, … — the `SHIPS` keys in `src/data/ships.js`) | authored at any size; gets the class's `sc` multiplier | node named `eng` drives the engine glow (below) |
| `planet` | the backdrop planet (all planets; one shared file) | **authored as a unit sphere (radius 1)**, scaled to the feature's `radius` at build | the atmosphere shell stays procedural (it is tagged `noclip` internally) |
| `station` | Meridian Station and trader/encounter stations | authored in **metres**, placed at the feature's `pos`, not scaled | the ring must be rotationally symmetric about Y (below) to stay flush with its collider |
| `enemy.<defId>` | a hostile's hull (`raider`, … — the `ENEMIES` keys in `src/data/enemies.js`) | authored at any size; gets the def's `scale` multiplier | pirate tint is baked into your file |
| `asteroid` | all six built-in rock lumps | authored at unit rock size (the built-ins sit at radius ≈ 1); scaled per rock | its triangles also become the rock collider — see below |
| `bullet`, `missile` | the bolts and missiles | authored to the built-ins' length along **Z** (bullet ≈ 5 m, missile ≈ 3 m) | not scaled at runtime |
| `crate` | the loot crate | ≈ 3 m across (the built-in octahedron) | the core/salvage glow seam is lost — bake it |
| `fx` | the spark/particle | ≈ 1.2 m box; uniformly scaled by the particle's size | materials are cloned per burst so opacity can fade |
| `cache` | the locked cache | scaled to the record's `r` (default 9) | the sealed/unsealed lamps are absent on a GLB — your model owns its state look |
| `anomaly` / `wormhole` | the rift / the simple wormhole | scaled to the record's `r` (default 20 / 30) | the procedural breathing animation is skipped for GLB doors |
| `beam` | the mining beam | unit height along **Y**, origin at the centre, ≈ 0.3 m radius | stretched to length at runtime; orient along Y |

**Forward is −Z** everywhere (ships, missiles, bolts). The player's hull, pirates, rocks, cites and
stations all follow the built-ins' convention.

## Node-name conventions

Names are matched case-insensitively at build/instantiate time; anything not listed is drawn as-is.

| Name pattern | Meaning |
| --- | --- |
| `spin` / `spin-*` | rotated around **Y**. Station rings: baked collider stays flush **only if the part is rotationally symmetric about Y** (a torus ring is; spokes are not — the built-in spokes and their bulbs are tagged `noclip` for exactly this reason). Planet spin rate comes from the feature (`spin`, radians/second, visual only); station spin is 0.1. |
| `eng` / `eng-*` | engine glow. Its **Z** scale is driven each frame by throttle (and boost) from whatever length you authored (the authored scale is remembered on `userData.engZ0`). The built-in boxes are 1. |
| `noclip` / `noclip-*` / `noclip.*` | **drawn, but no collision triangles.** Glow shells, auras, decorative vanes, the ring's spokes/lights. The only opt-out from model-fitted collision, short of `collide: false` in data. |

## Collision — fitted to the model, everywhere

Collision is triangle-soup, in plain data (`src/sim/colliders.js`), with an
Ericson closest-point-on-triangle solve. There is one code path for procedural and GLB geometry alike:

- **Rocks** — one soup per built-in shape; the drawn mesh is built from the *same* floats, so the hull is
  identical to the lump you see. `asteroid.glb` replaces both mesh and soup (all shapes, one file;
  per-rock scale/rotation still apply). Broadphase is the soup's bounding sphere; rocks at 18–70 m cost
  nothing until they are close. Missiles die on the same hull. Hitting one above 25 m/s costs a point of
  hull per 0.015 of speed, same rule as before.
- **Station / planet / future scenery** — the collider is baked from the *built* model at build time,
  in world space (`render/collideModel.js`), registered per place id, and cleared when the place is torn
  down. The station's torus ring, hub cylinder and docking arm are all solid (the ring spins but is
  rotationally symmetric, so the static bake is exact); atmosphere shells are tagged `noclip` and fly-through.
  Planets are solid now (they used to be walk-through). Scenery hits never damage the hull — they bounce it.
- **The ship** — a 4 m sphere (`SHIP_RADIUS`), unchanged for flight feel.
- **Data opt-outs** (the only others): a place feature may say `collide: false` (pure decoration,
  e.g. a hologram) or `collideDmg: <n>` (hull damage factor on hit; default `0` for scenery).
- **Authoring opt-out:** a node named `noclip*` (see table). Reach for this only for things the pilot
  should fly through — never to dodge collision for a hull.
- **The cave test:** a big rock cave is just scenery — author the cave as one `station.glb`-style
  feature (or a place feature with its own key and a `colliderFromObject` registration) and its
  interior walls collide exactly as drawn, with no new code. Hundreds of thousands of triangles are
  fine: broadphase rejects distant triangles by bounding sphere per model.

### The spinning-part rule

A collider is baked once, at build orientation. A part named `spin` therefore keeps its build-time
shape for physics: **spin parts must be rotationally symmetric about the spin axis** (rings, tori,
cylinders), or be tagged `noclip` if they are decorative. An asymmetric spinning hull cannot be
represented by a static bake — tag it `noclip` and put a static collision proxy behind it.

## What a `.glb` cannot change

- No new systems, no animation system, no morph targets: baked vertices only, plus `spin`/`eng` conventions.
- No per-place station skins: one `station.glb` replaces all stations. Per-place variation is future work.
- Colour swaps per variant (enemy tints, ore glows) are baked or lost — the built-ins' emissive seam is gone with them.
- GLB does not bypass the sim's `collide: false` handling — both are honoured, no exceptions.

## Known limits (honest ones)

- Enemy ships do collide (since the owner's ram-damage request): hulls are solid for the pilot, each other, rocks and scenery. Ships ricochet; a hit above 25 m/s relative speed costs both sides 0.015 hull per m/s (shields first for the pilot; hostiles have none). Rock hits on a hostile damage it and credit no pilot's kill stat, but every kill objective on every mission or contract is cause-agnostic — an environmental kill settles it wherever it lives (rock, another ship, the pilot; story wave-clear waits included; only the pocket the objective names gates hunts); friendly enemy-vs-enemy contact costs no hull, by design. The hostile collider is a sphere (4 m × the def's `scale`), **not** the drawn mesh — an enemy `.glb` replaces the drawing only, so a highly irregular model will still sweep a sphere.
- Sphere-vs-soup is exact for smooth hulls and slightly conservative for concave ones; the broadphase
  means it is cheap, but a 1-million-triangle cave may want a coarser collision proxy authored as a
  separate `noclip`-inverted mesh — ask the owner before adding BVH code.
- If profiling ever shows triangle tests hurting, the fix is a bounds grid per soup, not a new collision rule.

*Last checked: 2026-11-14.*
