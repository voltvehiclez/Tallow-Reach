# src/ui: HUD, outpost screens, pause menu

Reads `state`, calls sim actions. No game rules here.

| File | What it does |
|---|---|
| `hud.js` | In-flight HUD: bars, cargo and contract readout, lock ring, markers, and the beam progress bar with percentage (small, directly under the "left in rock" hint, shown only while the beam is cutting). |
| `screens.js` | HTML for the intro and each outpost tab. Pure functions of state. `TABS` and `SCREENS` list the tabs. The Inventory tab shows the station's store above one ship's hold (arrows browse the ships; `viewedShip()`), each with its m³ and per-row move buttons. |
| `menu.js` | The outpost panel: `ACTIONS` (one function per button, `data-a` name) and the click handler. |
| `picker.js` | Which Outfitting bay picker is open: `toggleModulePicker`, `togglePaintPicker`. Pure, one at a time, tested in `tests/picker.test.mjs`. |
| `outfitting.js` | The Outfitting tab's 3D window: mounts the ship canvas into `#shipview` after every panel redraw, wires drag/zoom, draws one frame per game frame. |
| `pause.js` | The pause overlay: PAUSED title, resume hint, sound on/off switch, Resume button. |
| `warpflash.js` | The warp vignette and white-out. Two gradients, updated from `state.warp` each frame. |

Rules:
- Buttons carry `data-a` (action name) and optional `data-b` (argument). The panel re-renders and autosaves after each click.
- Styling lives in `src/styles.css` (labelled sections; the pause menu has its own).
- New tab: `docs/HOW_TO_ADD.md` recipe 7.
- Inventory buttons carry `data-a="mv"` with `data-b="kind:id:dir:n"` (kind `c` ore or `m` module, dir `s` station to the ship shown or `t` back, n a count or `all`).
- A bay opens a picker: `data-a="slot"` (module, `data-b` is `group:bay`) or `data-a="paint"` (paint, `data-b` is the paint id). The rule lives in `picker.js`.
