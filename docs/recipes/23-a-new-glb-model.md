# Recipe 23: Adding or replacing a 3D model with a `.glb`

> One of the step-by-step recipes indexed in [HOW_TO_ADD.md](../HOW_TO_ADD.md). Read the checklist there first.
> Kind of work: **drop-in asset** — no code changes.

Everything the game draws can be drawn from your `.glb` instead of the built-in mesh. The full
authoring reference (keys, units, node names, collision rules) is [../GLB_MODELS.md](../GLB_MODELS.md);
this recipe is the checklist.

1. **Export Binary glTF (`.glb`)** from your tool (Blender: *File → Export → glTF 2.0 → Binary*).
   Keep it modest: every `.glb` is inlined as a data URL into the single built page. A 1–5 MB model is
   fine; 50 MB is not.
2. **Name it after its key** and put it in `src/assets/models/`. The key decides what it replaces:
   `ship.<class>.glb` (per ship class), `station.glb`, `planet.glb` (unit sphere!), `enemy.<defId>.glb`,
   `asteroid.glb`, `bullet.glb`, `missile.glb`, `crate.glb`, `fx.glb`, `cache.glb`, `anomaly.glb`,
   `wormhole.glb`, `beam.glb`. See the key table in [../GLB_MODELS.md](../GLB_MODELS.md) — especially
   the **scale contract** of each key (a unit-sphere planet, a metres-sized station).
3. **Tag the special nodes** (case-insensitive): `spin` / `spin-*` for parts that should rotate about Y
   (rotationally symmetric only, or tag them `noclip`), `eng` / `eng-*` for engine glows stretched by
   throttle, `noclip` / `noclip.*` for anything the pilot should fly through (glow shells, auras).
   Collision is the drawn triangles — `noclip` and `collide: false` in place data are the only opt-outs.
4. **Build and test.** `npm run build` regenerates `src/render/model-manifest.js` from whatever is in
   `src/assets/models/`; the built-in model for that key is replaced, everyone else is untouched.
   `npm test` must stay green; then playtest: does it sit flush (no invisible wall, nothing to fall
   through)? If the collision is wrong, the fix is in the model or the tags — never a hardcoded sphere.
5. **Deleting the file restores the built-in model** on the next build. The built-in models are never
   removed from the code, so keep them working: if you change one's geometry, the fallback changes with it.

**Known edges:** one `station.glb` skins every station; one `asteroid.glb` replaces all six rock lumps
(and all rock hulls); broken files only log `[models] …` at boot and fall back. Save version is
unaffected by any of this.
