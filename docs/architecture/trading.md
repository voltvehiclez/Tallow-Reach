# Trading between docked pilots (step 16, slice 6)

*Last checked: 2026-11-24. **Designed, not built — and built LAST** (owner's order 2026-11-24:
7 → 8 → 6). The decisions are the owner's (their answers, 2026-11-24); the file names
and code facts are this tree's. Slice list: [../REFACTOR_PLAN.md](../REFACTOR_PLAN.md).*

Trading is last for two reasons. It needs both pilots looking at the **same station** and each
other's screen, which is slice 8's job; and it needs a **real "docked" presence**, which step 16 does
not have yet — `net/session.js` admits a guest with `docked: false`, and its presence rows carry a
name, not a place. Slice 6 therefore starts by making presence say **where a pilot is docked**.

## Where it lives: the station panel

- A new **Trade** button in the right-hand station panel, beside **Base** and **Saves**, in the same
  theme and behaviour as those buttons (`ui/screens.js` `TABS`, `ui/left-panel.js`
  `selectRightTab` — a new right tab).
- Pressing it shows **Docked pilots** in that right-hand panel, under the Base/Saves buttons: one row
  per pilot docked at **this** station, **your own row included**. The name sits on the left of the
  row, a **Trade** button on the right.
- **Your own row has no Trade button** — trading with yourself is not a thing.
- A pilot alone at a station sees only its own name, and no Trade buttons at all.
- **Stations only, and docked only** (owner, 2026-11-24: *"Trade can initially only be done in
  stations"*). No trading in flight, at a rift, or between two stations.

## Opening a trade

- Pressing another pilot's **Trade** opens the trade window in the **left-hand big panel** — where
  Outfitting and Shop already live — and it **opens on the other pilot's screen by itself**: that
  pilot does not open a menu first.
- The window has a **close button in its top right**. Closing cancels the trade **for both** pilots.
- **Undocking cancels it** for both. So does anything else that ends being docked there (travel,
  death, a lost connection): docking is the condition the trade stands on.

## The two halves

- The window is split in two: **the other pilot's half on the left, yours on the right**, always,
  from each pilot's own screen — the sides swap per viewer, so "mine" is always on the right.
- Each half is a **grid in the inventory theme**, reusing the Inventory screen's cells and drag
  (`ui/screens.js` `inventoryHtml`, `ui/menu.js` `finishStationDrag`): clicking or dragging moves a
  thing **only into your own half**. Nothing can be dropped on the other pilot's side.
- **Items** go in from **your ship's hold and from the station's own storage** — any items in
  station (owner, 2026-11-24). The half therefore shows both sources, and each stack remembers
  which container it came from, because they are not the same place: a held item lives in the
  pilot's inventory (`sim/inventory.js`); a station item is that station's stock
  (`world.stationStores[…]`; a guest's live in its suitcase lockers). **Ships** go in too: the
  **ship names in the ships list become clickable and draggable** for exactly this (the `Base`
  tab's list). A ship **carries its fit and its cargo**, and **the ship you are piloting cannot be
  offered** (owner, 2026-11-24).
- **Credits:** a small **Add credits** button inside your half adds an amount to the offer.
- Either pilot may add, remove or change anything in their own half freely while the window is open.

## Confirming, and the anti-scam rule

- **Two confirm buttons at the bottom of the window**, one per half. Each pilot confirms its own
  half; the exchange runs once **both** are confirmed.
- **An edit invalidates a confirmation.** The owner's reason: *"This is to prevent scamming"* — a
  pilot must not be able to change what it is giving after the other side has agreed to it.
- **Any edit clears BOTH confirms** (owner, 2026-11-24) — not only the editor's. That is the only
  rule that stops the scam, because a pilot that had already confirmed does not re-read the other
  half. Both pilots must confirm again.
- The same rule covers **credits**: changing the amount after a confirm is an edit like any other.

## Executing the swap

- The **host** executes it. It is the only writer of the world, and the two halves are **offers**,
  never commands (principle 7).
- Space is checked **first, for both sides at once**:
  - **items** need room in the receiving pilot's **station storage** — `sim/inventory.js` `spaceFor`,
    against `world.stationStores[`${placeId}:${featureId}`]`;
  - **ships** need a free **hangar slot** at that station — `sim/economy.js` `hangarCap`
    (`base.hangar + 1`, upgradeable in the Base tab).
- **If either side lacks room the trade fails and nothing moves:** every offer returns to where it
  came from, credits stay put, and both pilots are told why in words (never a silent no, L41).
- The swap is **one step**: items, ships (with fit and cargo) and credits change hands together, or
  not at all.

### The custody wrinkle a build must not miss

A guest's station storage is **its own, and it travels in the suitcase**: `net/custody.js` `checkOut`
lifts every station stock into `lockers` (each stack remembering its `origin`) and leaves the stations
empty, and `checkIn` puts them back at home. In the host's world, `world.stationStores` is the
**host's** storage. So "received items land in the current docked station" means:

- the **host** receives into its own `world.stationStores` at that station — ordinary world state;
- a **guest** must receive into the lockers of its visiting record (`world.guests[…].bundle.lockers`),
  with `station` and `origin` set to this station's key, so the goods ride home in the suitcase.
  Writing them into the host's station stores instead would silently give the **host** the guest's
  items.

The same is true in reverse for **offers**: a guest's station-storage items are in those lockers, so
putting one up for trade takes it out of the lockers, and cancelling the trade puts it back with its
`origin` intact.

That route needs no new save shape: suitcase lockers already carry item, count, station and origin,
and the guest's suitcase is what the host writes back every `NET.snapshotSec` anyway.

## What slice 6 has to build

1. **Docked presence, first.** Presence rows carry `docked` and the station key, written by `sim/` and
   reported over the bus; the `docked: false` in `net/session.js` and the guest-side stand-in go away.
   Without an honest "who is docked here", there is no docked list.
2. **Wire kinds** for the trade — open, update, confirm, cancel — each in `net/protocol.js` `KINDS`
   with its `LIMITS` cap, cleaned by `cleanMessage` **on send and on read**; the host relays between
   the two pilots and holds the authoritative offers.
3. **The UI:** the `Trade` right tab (the list) and the trade window as a left panel, following
   `ui/screens.js` / `ui/left-panel.js` and the popover, notice and drag conventions in
   [ui-and-screens.md](ui-and-screens.md). The halves reuse the inventory grid over **two sources**
   (ship hold + this station's storage); the ships list gains draggable rows; **Add credits** is a
   small number field and a button.
4. **The exchange** (host side, `sim/`): take both offers, check capacity on both sides, swap
   atomically, emit one bus event, and say why in words on failure. No partial move, ever.
5. **Save:** nothing new on the host's own side, and a guest's received items/ships/credits ride in
   the suitcase it is already synced into — so `SAVE_VERSION` does not move for slice 6.

## Known gaps this first version accepts

- **Stations only.** The owner's word is "initially", so a later change may extend it.
- **Exactly two pilots.** No third-party or group trading.
- **No accept step.** The window opening is the invitation and the close button is the refusal
  (owner: *"the trade UI just pops up for the affected player"*).
- **No partial stack amounts beyond what the inventory grid already offers** — a build detail, not a
  design decision.

## Settled 2026-11-24

Both details this file once left open are the owner's answers: **any edit clears both confirms**,
and **a half takes any items in station as well as the ship's hold**.
