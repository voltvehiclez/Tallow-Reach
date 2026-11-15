# Skybox generator: dark, realistic 4K space for Tallow Reach

**If the owner asks for a new sky, a new instance, rift or wormhole, or "a different background": use this tool.
Never paint a sky in code, never download or hand-draw one, never edit `src/assets/skyboxes/` or the two
GENERATED blocks by hand.** This tool makes the picture, saves its recipe, and registers it in the game.

One command makes a 4096×2048 equirectangular WebP: a near-black sky with a luminous nebula, dark dust clouds
silhouetted in front of it, realistic stars (many faint, few bright, real colours, hidden by the dust) and an
optional Milky Way band. It is **auto-exposed to a dark mood, seamless at the edges, dithered (no banding) and
checked** before it is allowed into the game. About 40 seconds, 400 KB per sky.

Needs Python 3 with `numpy` and `Pillow` (`pip install numpy pillow`). On Windows use `py` or `python` for `python3`.
Run everything **from the project folder** (the one with `package.json`).

## The 5-step workflow (do exactly this)

```
1. python3 tools/skybox/skybox.py presets                       # pick a look (table below)
2. python3 tools/skybox/skybox.py make crimson_pit --preset ember --preview
3. read the report it prints: the last line must say "OK: ..." . If you can look at images, open
   skybox-out/crimson_pit.preview.jpg (whole sky + four pilot's-eye views) and check it looks good
4. python3 tools/skybox/skybox.py make crimson_pit --preset ember --install      # same command + --install
5. use it (below), then:  npm run build  and  npm test
```

Step 2 writes only to `./skybox-out/` (safe to repeat, delete it whenever). Step 4 copies the image into
`src/assets/skyboxes/`, saves the recipe to `tools/skybox/specs/crimson_pit.json` and registers it in
`src/data/skyboxes.js` and `src/render/skyboxes.js`. **The same name + preset + seed always gives the same sky.**

### Using the sky in a place or instance

In `src/data/instances.js`, on the template (recipe 22), set:

```js
sky: { kind: "panorama", skybox: "crimson_pit", shards: 30 },
```

`skybox` is the name you made; `shards` is how many broken rocks drift in front of it (0 for none). The rock picks up a
breath of the nebula's colour on its own. Then add a `docs/CHANGELOG.md` entry (see `docs/recipes/24-a-new-skybox.md`).

## What the owner says -> what you run

| The owner asks for | Start from | Add (optional) |
| --- | --- | --- |
| dark, empty, lonely, deep space | `--preset void` | |
| menacing, torn, dramatic, a rift | `--preset maelstrom` | `--set nebula.turbulence=1.1` for more chaos |
| hellish, fiery, burning, demonic | `--preset ember` | never make it bright orange: keep the preset's palette |
| mysterious, dreamy, magical | `--preset violet_veil` | |
| dead, grey, desolate, wormhole-like | `--preset ash` | |
| realistic, natural, "real" space, a galaxy | `--preset milky_way` | `--set band.strength=1.2` |
| cold, blue, young stars, clusters | `--preset cobalt_cluster` | |
| eerie, alien, toxic, green | `--preset emerald_mist` | |
| "a different one of the same kind" | same preset | a new `--seed 7` (any whole number) |
| a colour that is not in a preset | closest preset | `--palette "#d04a1c,#6a1c5a"` (1 to 4 colours, `#rrggbb`) |
| "darker" / "brighter" | same command | `--mood very_dark` (or `black`) / `--mood dark` (the default). Do not go brighter than `dark` unless the owner asks: this is **dark** space |
| "more stars" / "fewer stars" | | `--set stars.density=1.8` / `0.4` |
| "more nebula" / "emptier" | | `--set nebula.coverage=0.8` / `0.25` |
| "more dust clouds / darker lanes" | | `--set dust.amount=1 --set dust.coverage=0.8` |
| "more glow at the edges of the clouds" | | `--set dust.rim=1.4` |
| "a bright glowing centre" | | `--set nebula.cores=3` |
| "a Milky Way band across the sky" | | `--set band.strength=1 --set band.tilt=30` |
| "sharper / more detailed on my 4K screen" | | `--size 8192` (see the warnings below) |

Every knob, its range and its meaning is listed by `python3 tools/skybox/skybox.py presets` and in the `DEFAULTS` table
at the top of `skybox.py`. Out-of-range numbers are clamped, never fatal. An unknown key stops with the list of valid keys.

## Names, seeds, and re-making

- Name: lowercase letters, digits and `_`, starting with a letter: `crimson_pit`, `wormhole_grey`, `deep_rift_2`.
- Re-make an installed sky exactly: `python3 tools/skybox/skybox.py make crimson_pit --spec tools/skybox/specs/crimson_pit.json --install`.
- Change an installed sky: re-run `make` with the same name and new options plus `--install`; it overwrites that one sky.
- See what is installed: `python3 tools/skybox/skybox.py list`.
- Check any image the owner supplies: `python3 tools/skybox/skybox.py check path/to/image.webp`.

## The report, and what to do about a WARNING

`make` always prints a report. It must end with `OK: dark, seamless and within budget`. If it prints `WARNING:` lines the
tool **refuses to install** unless you add `--force`; do not add `--force` to get past a warning, fix the cause:

| WARNING | Fix |
| --- | --- |
| too bright for 'dark' space / more than 2% of the sky is bright | use `--mood dark` or `very_dark`; lower `--set nebula.amount=0.8` |
| almost pure black | raise `--set nebula.amount=1.1` and `--set nebula.coverage=0.5` |
| visible seam at the left/right edge | this is a bug in the tool: stop and tell the owner, do not install |
| file is N KB (over budget) | `--quality 85`, or `--set grain=0.6`; every skybox is inlined into the one-file game |

## Rules that keep the sky good

- **Dark is the point.** The owner wants dark, realistic space: the default `--mood dark` is already brighter than the
  deep rift. The tool enforces the brightness, so a sky cannot come out bright by accident.
- **No lines.** The owner rejected skies with painted lines or fabric-like swirls. This tool makes none; do not add
  overlays, borders, fractures or filament lines to its output.
- **Do not edit the output image** (no cropping, filters, resizing). To change a sky, change the recipe and re-make.
- **One look per place.** Do not install a dozen variants "to pick from": render previews into `skybox-out/`, install
  only the one that is used. Each installed sky adds about 400 KB to `game/tallow-reach.html`.
- **8192 (8K) skies** need about 3 GB of RAM, take several minutes and add 1 to 2 MB each to the game. Use only if the
  owner asks for more sharpness, and tell them the file got bigger. 4096 is the default and the standard.
- Never run the tool with `--install` while a previous build is mid-way; build afterwards with `npm run build`.

## If something goes wrong

| Symptom | Cause | Fix |
| --- | --- | --- |
| `No module named numpy` / `PIL` | missing libraries | `pip install numpy pillow` |
| `unknown preset` | typo | `python3 tools/skybox/skybox.py presets` |
| `--set x.y: unknown key` | typo | the error prints every valid key |
| `lost its BEGIN/END GENERATED markers` | someone hand-edited a registry file | restore `src/data/skyboxes.js` / `src/render/skyboxes.js` from git or the last zip, then install again |
| `npm test` says a skybox has no image / import / recipe | files were deleted or edited by hand | re-make it with `--spec tools/skybox/specs/<name>.json --install` |
| the sky in the game is the old teal one | the template's `skybox` name is not installed (a typo falls back to the rift sky) | `python3 tools/skybox/skybox.py list`; `npm test` names the bad template |
| out of memory at `--size 8192` | not enough RAM | use the default 4096 |

## How it works (only if you need to change the tool)

All of it is in `skybox.py`, top to bottom: spec and presets, colour helpers, 3D gradient noise, then `build_sky`
(warp field, regions, gas, mist, hot cores, dust, optional galactic band, star-density map), `make_star_layer`
(power-law brightness, blackbody colour, equal-area placement, sub-pixel gaussian PSFs stretched for the
equirectangular projection), `finish` (bloom, auto-exposure to the mood, ACES tone map, dither), then `report`,
`view`/`make_preview`, `install` and the command line. Every layer is a function of the **direction** a pixel looks in,
never of its x/y, which is why there is no seam and no pole pinching. Soft layers are computed at half resolution and
upscaled; fine texture and stars are computed at full resolution. Presets live in `presets.json`; `tests/skybox.test.mjs`
checks that file and the installed skyboxes. Adding a look = a new entry in `presets.json` (+ a row in the table above).
