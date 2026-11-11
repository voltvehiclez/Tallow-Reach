# Tallow Reach: vision and scope

> **What this file is.** The stable answer to "what are we making?". It is written by the owner
> (who does not code) and kept by whichever AI is working on the project. It changes only when the
> owner changes their mind. **How** the code gets there is in [TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md);
> **in what order** is in [ROADMAP.md](ROADMAP.md). What exists today is in [HANDOFF.md](HANDOFF.md).
>
> If a request from the owner conflicts with this file, say so and ask. If this file is silent
> on something, pick the option in "Open design questions" marked *default* and tell the owner.

## In one paragraph

Tallow Reach is a browser 3D space sim (three.js, one built HTML file). You fly ships you outfit
module by module, mine, fight, trade and loot across a large starmap, with **permanent loss on
death** (you lose your ship and what it carried), so the same sector is easy early and brutal late.
It has an **open world**, a **story campaign** that plays first, and **host-run co-op** where
friends join your world by a link. Content is meant to keep growing for a long time, so the code is
organised so that most new content is **data, not code**.

## Design pillars

1. **High risk, high reward.** Dying costs you the ship and its hold. The deeper you go, the more
   it pays and the more it can cost. This is what makes the game replayable.
2. **Everything is a module.** Ships are hulls with bays; thrusters, shields, guns, power, hull are
   modules. Progress is mostly finding and fitting better parts. (Already true today.)
3. **Chill by default.** Mining with a friend after work on a laptop should be a valid way to play.
   Joining must be one link, no accounts, no setup.
4. **Content scales through data.** A new enemy, item, module, ship, sector type, encounter or
   mission should be a new entry in a data file plus, at most, a small piece of new behaviour.
5. **Don't police players.** No anti-cheat effort. If someone cheats they only spoil their own game.

## The three parts of the game

### 1. Open world (the majority of the game; built first)

- A **starmap** of **systems** laid out as an **organic 2D web**: scattered positions and explicit
  connections, with dead ends, two-link systems and junctions rather than a square grid. **100+
  systems** is the target. A system groups **pockets**: flyable areas of space named after their main
  point of interest. You are always in a pocket, never "in" the system itself.
- The starting system is **Meridian System**. Its first two pockets are **Meridian Station**
  (the station and asteroid belt; internal id `reach`, formerly shown as Tallow Reach) and
  **Kestrel Hollow** (internal id `hollow`, still empty). More pockets can be added to a system;
  code must never assume a system has exactly two.
- **Meridian Station** is the home base (station, shop, hangar, storage). It is a station feature
  inside its pocket, not a separate flyable child place. The in-game station label is **Meridian
  Station** (formerly Meridian Outpost).
- Within an open-world system, warp freely to **any pocket** by default. The main galaxy still uses
  explicit gate routes; a future route-requiring instance can opt into `intraSystem: "links"` as data.
  Each system's zoomed chart has a visual-only central **star (95%) or black hole (5%)**, with pockets
  spread around it. Its proper name is the system name without the generic suffix (Meridian System →
  **Meridian**) and is permanently labelled below the body with `(Star)` or `(Black hole)` on a second row.
  The core is not a pocket or warp destination for now.
- Pockets contain a mix of **encounters** (friendly and hostile), **resources** (asteroids, salvage)
  and **loot**. The list of things that can appear is meant to grow indefinitely.
- **Instanced places** are *not* on the map. You reach them through **wormholes**, which can occur
  naturally or be spawned by the player. They are generated when you enter and are the hardest,
  most rewarding content. The same place model supports them; no fixed two-level hierarchy is
  assumed.
- **Difficulty** generally rises with distance from Meridian, with seeded variation, but the actual
  content of a system decides how dangerous it is. A far system may be deliberately easy. Risk versus
  reward is the main source of replayability.
- **Death** = the ship and its whole hold are gone for good (today's rule; the recovery fee and the
  loaned Wasp remain).

### 2. Campaign (built after the open world is working)

- The fiction: **you start in the campaign**. When you finish it you become a **free agent** and
  are released into the open world.
- **At least 10 story missions**, and the system must be **modular** so missions can be added or
  slotted in between later without rewriting anything.
- Campaign missions use the **same assets and mechanics** as the open world, only more structured
  and scripted.
- After finishing, **any mission can be replayed in any order**, for **modest rewards** (credits
  and the like) that carry over into the open world.

### 3. Multiplayer (host-run co-op; designed for from now, built last)

- **You host your own open world; others join by a link.** Joining must be smooth and easy, no
  account or server setup for the players. The use case: two colleagues on laptops, mining asteroids
  together in a relaxed way.
- Loot and inventory gained in someone else's world can be **brought back to your own world** when
  you leave theirs, so you keep progressing in other people's worlds.
- **Trading between players** (simple; "nothing crazy").
- No anti-cheat (pillar 5).

## Not planned

- Anti-cheat, accounts, matchmaking, or dedicated servers.
- A large persistent shared universe (every world is hosted by one player).
- Mobile support. Desktop browser with keyboard and mouse.

## Open design questions

These need the owner's decision eventually. Each has a **default** an AI may assume (and must
mention) until the owner decides. Record the decision here when made, and delete the question.

| # | Question | Default until decided |
| --- | --- | --- |
| 5 | **Wormholes.** What does it take to spawn one, and can you leave an instance with loot at any time? | A consumable item opens one; you can always leave through the entry wormhole; dying inside loses everything, as everywhere. |
| 6 | **Whose ship do guests fly in a host's world?** | Their **own** ship and hold, brought with them (so the risk is real). What they gain stays in their own save, and returns to their own world automatically. |
| 7 | **Guests and the host's station.** Can a guest dock at the host's Meridian, shop and repair? | Yes, with the host's prices. A guest's *storage* stays in their own save. |
| 8 | **Campaign ships.** Do campaign missions use your own ship or a ship the story gives you? | The story gives a fixed ship per mission (keeps missions balanced and replayable). |
| 9 | **Pausing in co-op.** | Pause only exists in single player; in co-op the game keeps running. |
| 10 | **Joining technology** (how a link connects two browsers without a server). | Decided at the multiplayer step, not now. See TARGET_ARCHITECTURE.md. It may need to relax the "no new dependencies" rule. |

## Decisions made

- **2026-11-10 — Step 12 place content and memory (owner):** generated pockets are filled immediately, not deferred. Use a slow default respawn of roughly 5–10 simulation minutes; paused simulation must not advance it. Asteroid memory keeps a slow timer for now, but `respawn-place` events may force or override it later. The trader proof is a dockable station feature that reuses existing `SHOPS`; independent station storage remains future work.

- **2026-11-08 — sparse, clearer starmap (owner):** gate lines should be straight and should not pass through unrelated systems;
  outer systems should need at least 10 jumps, and route lists should show all stops that fit, with arrows
  only when necessary. Apply the new connections to existing saves: if an old generated gate pocket is
  removed, recover to a safe ordinary pocket in the same system without losing character/cargo. This
  explicitly supersedes the earlier instruction to preserve the original gate connections below.

- **2026-11-08 — step 11B system-map travel and central bodies (owner):** open-world systems allow
  **warp to any pocket within the same system** by default, without a forced internal route. Remove the
  internal blue lines on the **sub-system map only**; the main galaxy keeps explicit gate routes. Provide
  a data opt-out (`intraSystem: "links"`) for future temporary instanced systems that require routes.
  Each system gets a central **star (95%) or black hole (5%)**, with pockets spread around it like a star
  system. Keep the existing chart style and gate connections: a gate to Duskdrift still exits to Duskdrift.
  The central body is **visual only and not warpable** for now (warping near it may be considered later).
  Its name is permanently labelled below the body with the type in parentheses; the name is the system's
  proper name (**Meridian System → Meridian**). Native hover tooltips on pockets/central bodies are removed,
  but click popups stay. Galaxy pan is bounded to 0.5–1 screen pixels per pointer pixel, increasing gently when zoomed out; system core
  graphics scale with zoom. Gate pocket names avoid orange stubs/peer labels, and neighbouring-system labels
  are clickable travel targets for the reciprocal gate pocket. This supersedes the earlier internal-line,
  local-direct-link-only and hover-only-core requirements below, not the gate rules. Core kind/name and chart
  geometry are regenerated, never added to compact v16 saves.

- **2026-11-08 — step 11B starmap UI follow-up (owner, superseded in part by the decision above):** after reviewing the first 11B chart ("the map
  looks ok"), the owner asked for four changes: **zooming in on a system dot opens a system pocket map**;
  that map shows **pocket-to-pocket lines** plus a **gate exit line pointing out toward the connected
  neighbouring system**; **right-clicking a pocket opens a clickable “Warp to” popup** and the right-panel
  warp buttons are removed; the right panel is a **compact overview** (system name, current pocket, plain
  pocket rows) with no scrolling or extra per-row info. Pocket layout is derived/deterministic and never
  saved; save v16 and the existing travel/cost/requirement recheck in `startWarp` are unchanged.

- **2026-11-08 — step 11B starmap interaction and saved worlds (owner-approved slice):** **M opens a
  clickable 2D chart** instead of warping immediately. It shows visible systems, the current location,
  gate connections and any selected system's full pocket list; only a legal hop starts the existing
  warp sequence (the later owner decision above makes local hops free by default). Single-player map pauses the simulation; a future hosted co-op
  world keeps running. Save **v16** stores the galaxy seed plus compact discovery/visit records, not
  generated geography; v15 and older migrate, and a removed pocket recovers to the safe home station
  without losing character/cargo. This supersedes the temporary M-cycling note below.

- **2026-11-08 — step 11 starmap and travel (owner):** the map is an **organic 2D web**, not a square
  grid. Systems have scattered positions and explicit connections; some are dead ends, some have two
  neighbours, some are junctions. The original slice required a **directly connected pocket** for every
  hop; the later system-map decision above relaxes this within free open-world systems, while cross-system
  gate hops remain explicit. Travel costs nothing for now. A **gate pocket** has exactly one external peer: a gate pocket in a
  neighbouring system. Each system has one gate pocket per neighbouring system, plus an ordinary
  pocket that connects inward to those gates. Meridian keeps **Meridian Station** and **Kestrel Hollow**
  unchanged and gains separate new gate pockets; Kestrel Hollow is not a gate. Generated systems are
  empty placeholders for now. The whole map is visible through a configurable visibility policy (no
  hard-coded permanent no-fog). Difficulty is distance-from-Meridian guidance with seeded variation;
  actual content decides danger, so far systems may be easy. The construction must stay modular:
  moving a system, deleting a pocket, promoting a pocket to a gate, adding a route or replacing the
  generator are data/registry edits, not map/UI/warp rewrites. Future fuel, proximity-activated gates
  and supercruise/warp-space travel are explicitly not implemented yet.
- **2026-11-08 — universe grouping and names (owner):** the map level is a **system**; a flyable
  area is a **pocket**, named after its main point of interest. You are always in a pocket, never
  in a system itself. The starting system is **Meridian System**; its first pockets are **Meridian
  Station** (station + asteroid belt, internal id `reach`) and **Kestrel Hollow** (internal id
  `hollow`). A system may have any number of pockets. M cycled the current system's pockets
  temporarily; step 11B replaces that with the clickable starmap/pocket chooser. Generic words live
  in `src/data/terms.js` (`mapNode: "system"`, `flyable: "pocket"`), each changeable in one line.
  Meridian is a station feature inside its pocket, not a child place; the in-game station label is
  **Meridian Station**. Internal place ids and old saves/export codes keep working.
- **2026-11-08 — logging out mid-flight (owner, supersedes the arrival-point rule above):** you come
  back **where you logged out** — the same pocket, the exact spot and heading. The owner's reason:
  pockets may become large, and being sent back to the pocket entry every time you quit would be
  tedious. The **arrival point stays as the fallback** for older saves, a damaged position, or a ship
  that cannot move. Default taken where the owner did not choose: shields and boost return **as you
  left them** (quitting is not a free repair) but the ship loads **stationary**. Save v15.
