# Architecture: UI and screens: outpost actions, screens, mission screens

> Part of the code-architecture docs; the index and the layers are in [ARCHITECTURE.md](../ARCHITECTURE.md).
> This describes the code **as it is now**. When a change replaces a rule, rewrite it here.

## Conventions

- **Outpost actions** are functions in `ACTIONS` in `ui/menu.js`. A button carries
  `data-a="actionName"` and optionally `data-b="argument"`. After each click the panel
  re-renders and the game autosaves.
- **Economy and contract functions** change `state.profile` and may return a message
  string, which the panel shows as a green toast.
- **Screens are pure functions** that return an HTML string from the current state.
  They never change state.

## Known gaps

These are real, current limits. None of them is a bug in play today.

- **Mission screens are built in 13c, pending the owner browser pass.** Step 13a closes the old
  one-contract structural gap: `profile.missions` can hold several data missions, and
  `sim/missions.js` advances their objective steps from gameplay events. Step 13b adds data-only story
  dialogue/choices, scripts, waits, flags/branches, parallel objectives and configured failures;
  `story.js` contains the worked example. Each step may carry a spoiler-safe player-facing `objective`
  separate from compatibility/internal `log` text; `ui/missionlog.js` renders the docked Mission log tab
  and live dialogue panel without moving story text into UI code. Contract tiers remain fixed at 1 to 3
  (`generateContract` in `sim/contracts.js`, definitions in `data/missions/contracts.js`).
- **Muting is not saved.** Sound starts on every time the game opens.
