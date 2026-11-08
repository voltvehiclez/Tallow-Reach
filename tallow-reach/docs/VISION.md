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

- A **starmap** of **systems** laid out as a **2D grid**, like the map in FTL. **100+ systems**
  is the target. A system groups **pockets**: flyable areas of space named after their main point
  of interest. You are always in a pocket, never "in" the system itself.
- The starting system is **Meridian System**. Its first two pockets are **Meridian Station**
  (the station and asteroid belt; internal id `reach`, formerly shown as Tallow Reach) and
  **Kestrel Hollow** (internal id `hollow`, still empty). More pockets can be added to a system;
  code must never assume a system has exactly two.
- **Meridian Station** is the home base (station, shop, hangar, storage). It is a station feature
  inside its pocket, not a separate flyable child place. The in-game station label is **Meridian
  Station** (formerly Meridian Outpost).
- Pockets contain a mix of **encounters** (friendly and hostile), **resources** (asteroids, salvage)
  and **loot**. The list of things that can appear is meant to grow indefinitely.
- **Instanced places** are *not* on the map. You reach them through **wormholes**, which can occur
  naturally or be spawned by the player. They are generated when you enter and are the hardest,
  most rewarding content. The same place model supports them; no fixed two-level hierarchy is
  assumed.
- **Difficulty** rises steeply: the start is easy, the far map and the wormholes are not. Risk
  versus reward is the main source of replayability.
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
| 1 | **Starmap travel rules.** Can you warp to any sector, or only to adjacent ones? Does a warp cost something (fuel, a charge, time)? | Adjacent sectors only. A warp costs a consumable (fuel), so mining has a purpose. |
| 2 | **Map knowledge.** Is the whole map visible from the start, or do you discover it? | Fog: Meridian and its neighbours are known; sectors reveal as you reach or scan them. |
| 3 | **What sets a sector's difficulty?** | Its distance from Meridian on the grid (a "tier"), plus a bit of random variation. |
| 4 | **Do sectors remember what you did?** (rocks mined out, enemies killed, crates taken) | Yes for map sectors, saved with the world; resources and encounters slowly respawn. Instanced sectors are forgotten when you leave. |
| 5 | **Wormholes.** What does it take to spawn one, and can you leave an instance with loot at any time? | A consumable item opens one; you can always leave through the entry wormhole; dying inside loses everything, as everywhere. |
| 6 | **Whose ship do guests fly in a host's world?** | Their **own** ship and hold, brought with them (so the risk is real). What they gain stays in their own save, and returns to their own world automatically. |
| 7 | **Guests and the host's station.** Can a guest dock at the host's Meridian, shop and repair? | Yes, with the host's prices. A guest's *storage* stays in their own save. |
| 8 | **Campaign ships.** Do campaign missions use your own ship or a ship the story gives you? | The story gives a fixed ship per mission (keeps missions balanced and replayable). |
| 9 | **Pausing in co-op.** | Pause only exists in single player; in co-op the game keeps running. |
| 10 | **Joining technology** (how a link connects two browsers without a server). | Decided at the multiplayer step, not now. See TARGET_ARCHITECTURE.md. It may need to relax the "no new dependencies" rule. |
| 11 | **What goes in Kestrel Hollow and later pockets/systems?** | Kestrel Hollow stays empty until the owner adds content. New pockets are data entries under a system; the place model allows deeper optional parents later without assuming a fixed depth. |

## Decisions made

- **2026-11-08 — universe grouping and names (owner):** the map level is a **system**; a flyable
  area is a **pocket**, named after its main point of interest. You are always in a pocket, never
  in a system itself. The starting system is **Meridian System**; its first pockets are **Meridian
  Station** (station + asteroid belt, internal id `reach`) and **Kestrel Hollow** (internal id
  `hollow`). A system may have any number of pockets. M cycles the current system's pockets for
  now; choosing among many pockets and the 100+ system starmap come in step 11. Generic words live
  in `src/data/terms.js` (`mapNode: "system"`, `flyable: "pocket"`), each changeable in one line.
  Meridian is a station feature inside its pocket, not a child place; the in-game station label is
  **Meridian Station**. Internal place ids and old saves/export codes keep working.
- **2026-11-08 — logging out mid-flight (owner, supersedes the arrival-point rule above):** you come
  back **where you logged out** — the same pocket, the exact spot and heading. The owner's reason:
  pockets may become large, and being sent back to the pocket entry every time you quit would be
  tedious. The **arrival point stays as the fallback** for older saves, a damaged position, or a ship
  that cannot move. Default taken where the owner did not choose: shields and boost return **as you
  left them** (quitting is not a free repair) but the ship loads **stationary**. Save v15.
