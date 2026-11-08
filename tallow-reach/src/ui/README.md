# src/ui: HUD, outpost screens, pause menu

Reads `state`, calls sim actions. No game rules here.

| File | What it does |
|---|---|
| `hud.js` | In-flight HUD (ignores hurt events for other players): bars, cargo and contract readout, lock ring, markers, and the beam progress bar with percentage (small, directly under the "left in rock" hint, shown only while the beam is cutting). Hints persist until the next sim tick so high-refresh screens do not flicker. |
| `screens.js` | HTML for the intro and each outpost tab. Pure functions of state. `TABS` and `SCREENS` list the tabs. The Shop tab draws whatever `shopList(OUTPOST_SHOP)` returns from `data/shops.js` — its rows, prices and "N left" — so a new row is a data edit. The Inventory tab shows the station's store above one ship's hold (arrows browse the ships; `viewedShip()`), each in a compact grid of clickable item tiles with m³. Click moves one item, Shift-click moves the whole stack, and right-click opens item actions such as Sell. Selling opens a small in-game box beside the selected item to enter a quantity, defaulting to the full stack. Each hold uses a fixed 5-by-5 slot field with a three-row viewport; both grids scroll independently, even when mostly empty. |
| `menu.js` | The outpost panel: `ACTIONS` (one function per button, `data-a` name) and the click handler. |
| `picker.js` | Which Outfitting bay picker is open: `toggleModulePicker`, `togglePaintPicker`. Pure, one at a time, tested in `tests/picker.test.mjs`. |
| `outfitting.js` | The Outfitting tab's 3D window: mounts the ship canvas into `#shipview` after every panel redraw, wires drag/zoom, draws one frame per game frame. |
| `pause.js` | The pause overlay: PAUSED title, resume hint, sound on/off switch, Resume button. |
| `warpflash.js` | The warp vignette and white-out. Two gradients, updated from `state.warp` each frame. |

Rules:
- Buttons carry `data-a` (action name) and optional `data-b` (argument). The Shop's Buy button is
  `data-a="wb" data-b="shopId:itemId"`. The panel re-renders and autosaves after each click.
- Styling lives in `src/styles.css` (labelled sections; the pause menu has its own).
- New tab: `docs/HOW_TO_ADD.md` recipe 7.
- Inventory buttons carry `data-a="mv"` with `data-b="kind:id:dir:n"` (kind `c` goods or `m` module — only what the tile shows, since one `moveItem` moves either — dir `s` station to the ship shown or `t` back, n a count or `all`). The tiles come from `itemsAt(place)` in `sim/inventory.js`, which lists goods in catalogue order and then spare modules in the order they arrived.
- A bay opens a picker: `data-a="slot"` (module, `data-b` is `group:bay`) or `data-a="paint"` (paint, `data-b` is the paint id). The rule lives in `picker.js`.
