# Testing step 16 slice 7: the visiting pilot is on the map

Slice 4 made your friend's pilot a real, docked ship inside your world; you just could not **see**
it. This slice puts it on the map: on the **system (pocket) map**, the visitor's name is drawn under
the pocket it is standing in, in amber, and the right-hand panel gains a **Visiting pilots** line.
No ship is drawn in space yet — that is slice 8.

**Build: `2026-11-24g`** — both machines. If one screen shows a different build string (title card, or
Pause > Open Multiplayer > Connection details), they are not running the same file.

You need **two browsers** with separate saves: one normal window and one incognito/private window is
easiest.

**Save version is still 29.** This slice saves nothing new, so an old save loads exactly as before.

---

## What this slice is **not** (please do not report these)

- **No ship is drawn in space** (slice 8). The visitor is a name on the map, not a hull on the glass.
- **The guest's own screen does not show your world yet** (slice 8), so a guest sees no blip: it is the
  only pilot in the world its screen is drawing.
- **No trading** (slice 6, which now comes **last**; see the note at the end).
- A pilot is only **drawn** on the map of the system it is standing in. If it arrives in another
  system (it lands at *its own* home station), the **Visiting pilots** row in the panel names that
  system; select it to see the blip under the pocket.

---

## Part 0 — The two-minute set-up

1. Both browsers: open the game, type a username on the title screen.
2. **Host**: **Open World** > **P** (pause) > **Open Multiplayer** > switch multiplayer **on** >
   **Copy link**.
3. **Guest**: title > **Join Multiplayer World** > paste the link > **Join** > **Bring my pilot**.
4. On the **host**, press **M** (the starmap).

**What to check:** the map opens on the host's own system. The guest lands at **its own home station**,
which by default is **Meridian Station** — also where a fresh pilot starts, so with two fresh saves
both pilots are in the same place. If the host has flown elsewhere, the guest is still at Meridian:
the **Visiting pilots** row in the panel names the system to open (Part 1).

## Part 1 — The name is under the pocket

1. On the **host**, read the right-hand panel's **Visiting pilots** row. It names the pocket the guest
   is in and, in brackets, the system — click that system (or click the host's own system dot) so the
   **pocket map** is showing.
2. Find the guest's pocket. With two fresh saves it is the host's own pocket, marked *You are here*.

**What to check:**

- Under the pocket's own name there is a line in **amber**: **· Acey** (the guest's name, with a small
  dot in front). If the pocket is the host's own, the order is the pocket name, *(You are here)*, then
  the pilot; at any other pocket the pilot is the line straight under the name. If the guest's name is
  the same as the host's it will carry a star (`Acey*`), exactly as in the chat.
- The right-hand panel has a line **Visiting pilots Acey · Meridian Station (Meridian System)** — always,
  whichever system is selected, and it names the system so a pilot that arrived elsewhere is findable.
- The name is **not** a separate pin elsewhere on the map: it belongs to the pocket the pilot is
  standing in.
- Nothing else changed: travel, routes, missions and the *You are here* line work exactly as before.

## Part 2 — Two visitors, two rows

1. With the first guest still in, open a **third** browser window (another incognito window) and join
   with the same link: paste it, **Join**, **Bring my pilot**, using a different username.
2. On the **host**, open the system both guests are in (the panel names it).

**What to check:**

- **Two** amber rows under the pocket name, in alphabetical order (`· Acey`, `· Bex`), and both names
  in the panel line. They keep their order each time the map is redrawn.
- Each visitor's record is a separate pilot (playtest 22's rule): two names, not one name twice.

## Part 3 — A pilot that goes home takes its name with it

1. On the **second guest**, **leave** the world (Pause > Open Multiplayer > **Leave**, or close its
   window).
2. On the **host**, look at the map **without clicking anything**: the map repaints itself when a
   pilot arrives or leaves, so the row should go while you watch.

**What to check:**

- That pilot's amber row is **gone**, in the panel too.
- The remaining guest's row is untouched.
- If the host's own ship is the only pilot left, the map looks exactly as it did in single player.

## Part 4 — The map is a view, not a second copy

1. On the host, **warp** to another pocket in the same system (warping closes the map itself).
2. Press **M** to open it again.

**What to check:**

- The visitor's name stays under **its** pocket (Meridian), not under the pocket the host flew to.
- *You are here* follows the host.
- The visitor's name never moves on its own while the guest is not flying (it arrived docked, and
  only trading or slice 8 will let it undock).

---

## A note on the order of the remaining work

The owner moved trading to **last** on 2026-11-24, because trading needs both players to see the same
station: the order is now **slice 7 (this) → slice 8 (one world, two screens) → slice 6 (trading)**.
So "no trading yet" is expected, not a missing piece of this slice.
