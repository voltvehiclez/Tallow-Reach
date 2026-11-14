# Architecture: UI and screens: outpost actions, screens, mission screens

> Part of the code-architecture docs; the index and the layers are in [ARCHITECTURE.md](../ARCHITECTURE.md).
> This describes the code **as it is now**. When a change replaces a rule, rewrite it here.

## Conventions

- **Outpost actions** are functions in `ACTIONS` in `ui/menu.js`. A button carries
  `data-a="actionName"` and optionally `data-b="argument"`. After each click the panel
  re-renders and the game autosaves.
- **Economy and contract functions** change `state.profile` and may return a message
  string. The panel **never renders it**: routine confirmations ("Sold 3 items for 90 cr.",
  "Contract accepted. Launch when ready.", "Basic Power Plant moved to storage.") say nothing —
  the redrawn panel already shows the result — and anything the pilot must read appears in
  `ui/notice.js`'s fixed `#panel-notice` (role="status", click to dismiss, 7 s), which cannot move
  the screen. It is centred (`left: 50%` + `translateX(-50%)`) and `placeNotice()` measures the flight
  message line (`#msg`, `top: 14%` — "Empty weapon slot" on an empty weapon switch, or the warp name)
  on every notice, putting the notice 12 px under its bottom edge — never over it. When the HUD is
  hidden (docked or on the title screen) the same band is worked out from the viewport height. A
  resize re-measures. CSS carries `top: 16%` as the pre-script default. `isRoutineReply` is the list of silent replies; an unrecognised message is shown, so a
  refusal is never swallowed. Do not put a message back inside the panel.
- **Screens are pure functions** that return an HTML string from the current state.
  They never change state.
- **Overlay availability is one rule, in `ui/overlays.js`.** `canPause()` and
  `canOpenStarmap()` answer whether the pause card and the starmap may open: both are
  available **anywhere in the open world, a station included**, because a docked pilot may
  pause or plot a route (warping still needs a launch, and the chart says "Docked: launch to
  warp." on its chart panel). Only the title screen, the pause overlay itself, a dead pilot or a
  warp in progress refuses. Do not copy a `!docked` condition into a key handler instead.
- **The pointer follows the reticle.** The canvas hides the system pointer for mouse-look flight, since the HUD draws
  its own reticle (`#cur`); `ui/hud.js` `setReticle()` hides the HUD and adds `body.no-reticle` together, so on the title
  screen and while docked the real pointer is back and never disappears over the empty screen beside the panel.
- **Inventory tiles have three item actions, all behind a right-click.** Click moves one, Shift-click moves the
  stack; right-click opens **Use** (only for an item with a `use` field, `sim/consumables.js` `canUse`), **Sell**
  (a quantity box) and **Discard ×N**. Discard is a two-step popover shared by the
  station panel and the flight card (`ui/discard.js`): how many, then "Are you sure you want to discard 3 Ferrite?",
  and only that second click trashes — with `sim/inventory.js` `discardItem(where, id, n)`. Mission items are refused
  by `data/items.js` `canDiscard`, because a beacon or parcel cannot be found again.
- **The flight inventory is a modal of its own** (`ui/cargo.js`): press **I** in space and the ship's
  hold opens in a wider (880 px) read-only card built by `screens.js` `cargoHtml()` — the station
  Inventory tab's tiles with no moves and no selling, laid out **7 across and 5 rows down** and with no
  explanatory sub-line. `canOpenCargo()` refuses while docked (the station panel has an Inventory tab;
  there, I just switches to it), on the title screen, while dead, warping or paused, and over the
  starmap. Opening it releases flight input; the world keeps running behind it, sound included. Esc
  closes it; P closes it and opens the pause card. A tile's label says **USE** for an item with a `use`
  field and **ORE** or **MOD** otherwise (`screens.js` `invRow`), and **Use** runs that item's declared
  action (`sim/consumables.js` `useItem`): it spends exactly one unit and only when the action worked,
  shows the returned sentence as a notice, closes the card on success and redraws it on a refusal.
- **The pause card's order is fixed** (`pauseOverlayHtml()`): Resume is the first control and
  Exit to main menu the last, with the sound switch between them. Exiting saves the resume
  point, returns to the title screen and fades every looping sound to silence
  (`core/audio.js` `fadeToSilence`, on the `main-menu` event), because the simulation stops
  behind the title and would otherwise keep the engine droning.
- **Offers are station-specific; your missions travel with you.** The Mission log and the Contracts tab list
  **every active mission** at every station, with its progress and next objective, so a job taken at Meridian can be
  watched at Galereach; only the hand-in is bound to one station (elsewhere the button names it and is disabled, and
  Abandon stays available so nothing is stuck). **Offers** are per station: the story missions this station gives out
  (`missionOfferStation`: `offeredAt`, else the hand-in station, else home — one station by default, never everywhere,
  and an unknown `offeredAt` offers the mission nowhere rather than moving it), and the contract board (`boardAt`). A
  station with no active missions simply says "No active missions here.": the screens do not explain that work is filed
  elsewhere. Contract boards are per station too (`sim/contracts.js`
  `boardAt(placeId, world)`): `world.board` stays the home station's list so old saves keep theirs,
  other stations get `world.boards[placeId]`, generated on first look, so refreshing or accepting at
  one counter never touches another's offers.
- **Buttons address missions by id, not by list position.** The docked panels draw a filtered
  selection, so `data-b` carries `mission.id` for `drop`/`done` (a position would hit the wrong record
  as soon as another station's mission is active). `ui/menu.js` passes the argument through as-is.
- **A station-contact dialogue is read-only away from its station.** The card names the station ("Return to
  Meridian Station to continue talking.") and offers no Continue/choice buttons; the runner refuses the same click
  (`missionAtItsStation`). In-field dialogue is unaffected.
- **The docked panel redraws when a mission changes.** It is HTML built when opened: any mission event
  makes `ui/missionlog.js` emit `mission-ui-refresh`, and `ui/menu.js` redraws the visible panel (it
  ignores the event while the panel is hidden or on the title). Without that, closing the last
  dialogue line left the card offering **Abandon** while the cargo was already aboard.
- **The title screen draws its own scene** (`render/menuview.js`): the home station turning with
  its planet behind it, on the camera path in `data/camera.js` (`MENU_CAMERA`, `menuPose`). It is
  built from `DEFAULT_PLACE` features only and never reads the live world, so the background is
  the same every time instead of the last game view. `main.js` renders it while `state.ui.intro`.

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
