# src/ui: HUD, outpost screens, pause menu

Reads `state`, calls sim actions. No game rules here.

| File | What it does |
|---|---|
| `hud.js` | In-flight HUD: bars, cargo and contract readout, lock ring, markers. |
| `screens.js` | HTML for the intro and each outpost tab. Pure functions of state. `TABS` and `SCREENS` list the tabs. |
| `menu.js` | The outpost panel: `ACTIONS` (one function per button, `data-a` name) and the click handler. |
| `pause.js` | The pause overlay: PAUSED title, resume hint, sound on/off switch, Resume button. |

Rules:
- Buttons carry `data-a` (action name) and optional `data-b` (argument). The panel re-renders and autosaves after each click.
- Styling lives in `src/styles.css` (labelled sections; the pause menu has its own).
- New tab: `docs/HOW_TO_ADD.md` recipe 7.
