# Playtest — step 16, slice 8c & full guest parity: the host's world on the guest's screen

**Build: `2026-11-27h`** — both machines. Check it in **Connection details** (or the title card / chat line); two machines on different builds cannot be trusted to agree about anything.

*Includes all updates from `2026-11-27a` through `2026-11-27h`: station/inventory/fitting/contracts/missions (`b`), per-host `visitState` relog persistence + HUD speed (`c`), `G` dock/relog HUD fix (`d`), mining beam/rocks/host keepalive (`e`), 240 Hz stream/Hermite turn smoothing (`f`), paused-tab audio keepalive + fast cannon bolts (`g`), and full guest parity for F/N/missile locks, `J` route jump, rifts/instances/shared caches, wormholes, galaxy/shops & destination auto-clear (`h`).*

*In 8b your keys made the host's hull move, but you were still flying in your own galaxy. In 8c your screen becomes the host's world: your ship is driven by what the host says, your own galaxy is frozen behind you, and you can go home to it.*

---

## Part 0 — The two-minute set-up (same as 8b)

1. **Host**: open the game, **Multiplayer** → **Host your world** → copy the link.
2. **Guest**: open the game, **Multiplayer** → paste the link → **Join**, wait for **100%**.
3. **Guest**: press **Bring my pilot**. On the host: *"Acey arrived at Meridian Station."*
4. **Host**: stay docked or undock — either is fine for this slice.

---

## Part 1 — Your screen is the host's world

1. **Host**: note where you are (system and pocket — e.g., Meridian `reach`, Kestrel `hollow`).
2. **Guest**: look at the **pause card** and the **starmap** background.

**What to check:**

- The guest's **place label** and sky are now the host's pocket where *your* ship is — not your home galaxy's pocket. Flying the host to another pocket (warp there) does **not** drag the guest with it.
- The guest's **HUD is its own ship** — hull/shield numbers are yours, not the host's.
- Host's and guest's **galaxy maps still list their own systems**? No — guest should see host's pockets it can warp to.

*If guest still sees its own starting pocket's sky after Bring my pilot, 8c has not taken.*

## Part 2 — Your ship is driven by the host

1. **Guest**: press **W** and hold, steer with mouse.
2. **Host**: watch the guest's hull.

**What to check:**

- Guest's ship **moves on the guest's screen** with no local simulation — its `state.place`, position and rotation come from the host's snapshots (same 24 Hz stream as 8a).
- Let go: guest ship **coasts** and slows as before — but now guest sees the host's place scenery, not its own.
- Shoot with host's guns at guest's hull: both screens' hull bars agree.

## Part 3 — Warp freely

1. **Guest**: open **Starmap** (**M**), pick a system/pocket you can reach, press **Warp**.
2. **Host**: watch.

**What to check:**

- Guest's starmap **Warp** sends a request to the host; host validates the route (`travelQuote`) and starts `startWarp` for the guest's pilot. Guest sees the **cut to the new pocket** on next snapshot (no warp flash yet — a cut is expected).
- Host's own warp does **not** move the guest — each pilot warps alone.
- A guest trying to warp while **docked or warping already** is refused silently (host re-checks `docked`/`warp`).

## Part 4 — Dock freely

1. **Guest**: fly to a station, press **G** (dock).
2. **Host**: watch.

**What to check:**

- Guest's **G** sends a `dock` request; host runs `tryDock` for that pilot when in range. On the next snapshot the guest's screen flips to docked: the station view and the panel open, the reticle is gone — the same flow as a local dock.
- The panel shows **the guest's own ship's hangar and Inventory** (the visiting pilot's suitcase: its hull, its fit, its hold) with **Launch** on its own button. **Launch** asks the host to launch the visitor — the ship leaves on the host's sim, the panel closes when the snapshot flips.
- Pressing **W** while docked keeps you docked — guests launch only when you press **Launch** (`2026-11-27a`, fixing stray inputs re-launching docked guests).
- The camera snaps immediately across dock and launch transitions (no slow pan from station to space).
- A guest far from any station pressing **G** does nothing — host rejects it.
- **A docked hull is not visible to anyone** — inside the station, every screen (owner, 2026-11-26).

## Part 4b — Death and recovery

1. Have a hostiles-on or friendly-fire scenario, or a rock strike: let the guest's hull reach zero.

**What to check:**

- The guest's ship **recovers at its home station** (Meridian for a first-time joiner) **docked**, with the ordinary death rules: lost hold gone with the hull, `RECOVERY_FEE` (150 cr, capped by credits) charged, the home-hangar fallback or a lent Wasp. The explosion happens where the ship stood; the suitcase write-back carries it home.
- The screen opens on the stranded-station card with the reason in chat (`mp-guest-recovered`).
- If the guest is on an empty home pocket, the home station is Meridian regardless of where the death happened.

## Part 4c — Boost, camera shake, engine glow

1. **Guest**: boost (**Left Shift**) and fly.

**What to check:**

- The camera shakes on boost as it does single-player — shake now rides the wire as amplitude (`SHIP_FIELDS.shake`), decaying on the host's clock.
- The ship's flame lengthens on boost, on both screens.
- Smoothing at high refresh (165–240 Hz) comes from the 100 ms interpolation window; deeper smoothing (client-side prediction) is slice **8d**, not this one.

## Part 5 — Host warps, rifts don't bleed

1. **Host**: warp to another pocket; if a **rift** is nearby press **R** to enter.

**What to check:**

- Guest **stays** where it was — host's warp is a cut for the host only, not a teleport for the guest.
- Host entering a **rift/instance** does **not** move the guest or change guest's sky — rifts are per-pilot pockets.

## Part 6 — Go home

1. **Guest**: **P** → **Open Multiplayer** → **Go home** (or title → **Bring pilot home** after leaving).

**What to check:**

- Guest's **place and sky return** to where it was before visiting — own galaxy stashed but not stepped, now restored (including your own shops, wormholes, and route destination).
- Guest's ship is again **locally simulated** (flight, power, etc.) — W flies it locally, and zero `_net` entities remain in any pocket.
- No save change while visiting: `SAVE_VERSION` stays **29** (8c is runtime views only).

## Part 7 — Station actions, fitting, contracts & story isolation (`2026-11-27b`–`d`)

1. **Guest**: dock (**G**), move/split/stack items in Inventory, equip/unequip in Outfitting, buy/sell or buy a hull in Shipyard, accept a contract from Mission Board, and use a consumable from Cargo (**I**).
2. Complete or advance the guest's contract; check host's HUD and missions.

**What to check:**

- All station drag/click/split/buy/equip/launch actions stick cleanly; ship speed reads `0 m/s` while docked and matches live forward/reverse/boost/warp speed in flight.
- Guest mission spawns, kills, and HUD highlights stay isolated to the guest (host sees ambient kills without stealing guest mission ownership).
- Disconnect abruptly or close guest tab, rejoin via the same link (**Bring my pilot**), and also test rejoining **while undocked**: guest keeps its per-host `visitState` (credits, ship, missions, board, pocket, and HUD/reticle).

## Part 8 — Mining beam, asteroids, 240 Hz smoothing & background host (`2026-11-27e`–`g`)

1. **Guest**: mine a ferrite rock with the mining beam, fire cannons at speed, and test on a high-refresh monitor if available.
2. **Host**: open the **Pause** menu (**P**) and switch to another browser tab (even muted) while the guest flies and shoots.

**What to check:**

- Guest's mining beam renders cleanly, rock shrinks/depletes on both screens, `#bm` progress bar fills, and ore chimes play on gain (rock collisions work in remote pockets).
- Guest's ship motion, camera boost shake/FOV, curved high-speed turns, and fast `900 m/s` cannon bolts glide smoothly without 24 Hz snapping or `1000 ms` pauses.
- Switching tabs on the host (even with Pause open) does **not** stall the guest down to `1 Hz` updates.

## Part 9 — Full guest parity: target locks, `J` route jump, rifts/caches, wormholes & starmap (`2026-11-27h`)

1. **Targeting & missiles**: on guest, press **F** or pick an enemy/pilot in **N** list, and fire a missile; also verify neither pilot can missile-lock a docked pilot.
2. **Starmap & route jump (`J`)**: open **M**, plot a multi-hop route to another system/pocket (e.g. `hollow`), close **M**, press **J** repeatedly to jump along the route, and test a blocked/invalid warp.
3. **Rift & shared `CACHE`**: on guest, open/enter a rift (**R**), fight guardians, inspect the HUD countdown clock, open the unlocked cache (**R**), shift-click/move/take items, close the cache, and exit via the gate (plus check host cannot see guest's rift and dying in a rift recovers without breaking host's pocket).
4. **Wormholes & galaxy**: confirm host's galaxy/shops/wormholes appear on guest while visiting, test a wormhole pocket, and verify reaching a plotted destination auto-clears the starmap destination marker (`place-changed`).

---

## If you see nothing

- **Guest still in own galaxy?** You must have pressed **Bring my pilot** — a plain Join only looks, it does not freeze your home pilot or bring you into host world.
- **Warp button does nothing?** Host checks `campaignTravelRefusal` and `travelQuote` — same rules as local warp (direct link, not docked, not dead). Try a nearer pocket.
- **Dock won't work?** You must be within dock range — same as local docking. Check you are in host's pocket with a station.
- **Guest sees the sky, the shots and the enemies.** Bullets, missiles, crates, fx **and enemies** are **sent** to the guest as `entities` (one message per pocket a visitor occupies, 24 Hz, and the hidden-tab keepalive) and drawn as host-confirmed views; the guest never simulates them. Enemies are drawn, lockable (F and the missile cone), move and shoot exactly as they do single-player — their damage lands on the host's record and shows up as the guest's own hull bar. The **mining beam and its ore chime** ride the wire (`2026-11-26b`): the beam, `mineFrac` progress and the `ore-gained` sound are the host's record verbatim, the same as a single-player world. A guest's own cannon/missile/lock/hit/boost **sounds** are re-played from `SHIP_FIELDS` event counters the moment they advance.
- **Place didn't change on guest warp?** Guest warp is host-authoritative; host must accept it. Check host's screen for the *warp engaged* message — if host refused, guest stays.

## What to report

**What you did, what you expected, what happened** — and which screen (host or guest) and whether guest was docked at the time. Build string on each machine is first useful fact.
