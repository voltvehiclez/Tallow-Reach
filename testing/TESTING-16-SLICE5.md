# Testing step 16 slice 5: crashes and reconnects

This slice is about the ugly moments: **your friend's browser closes**, **your pilot is in their
world**, and **the copy of your pilot** that comes home. Nothing new is drawn in space.

**Build: `2026-11-24a`** — both machines. If one screen shows a different build string (title card,
or Pause > Open Multiplayer > Connection details), they are not running the same file.

You need **two browsers** with separate saves: one normal window and one incognito/private window is
easiest.

**Save version is still 29.** Nothing new is saved by this slice, so an old save loads exactly as
before.

---

## What this slice is **not** (please do not report these)

- **Still no visiting ship on screen** — one hull is drawn (slices 7–8).
- **No trading** (slice 6), so a guest cannot change anything it owns in the friend's world yet.
  That is why item 4 below cannot be seen with your eyes yet.
- **No client-side prediction, no remote controls** (slice 8).

---

## Part 0 — The two-minute set-up

1. Both browsers: open the game, type a username on the title screen.
2. **Host**: **Open World** > **P** (pause) > **Open Multiplayer** > switch multiplayer **on** >
   **Copy link**. (If the room looks empty, wait ~12 seconds: an offer code appears by itself.)
3. **Guest**: title > **Join Multiplayer World** > paste the link > **Join** > **Bring my pilot**.

**What to check (unchanged from slice 4):** on the guest, the notice says the pilot is on its way, and
the pilot is now away — its own galaxy is paused.

## Part 1 — The host's browser closes: "Your pilot is safe"

1. On the **host**, **close the browser window completely** (not the tab — the whole browser).
2. Look at the **guest** screen. Within a few seconds the title screen should appear with a card:

   > **Your pilot is safe** — *The connection to Ada's world dropped…*
   > **Wait**   **Go home**

**What to check:**

- The card says the pilot is **safe** and still in the friend's world. That is true: nothing about
  your save has changed.
- The card has exactly **two** buttons, both full width: **Wait** and **Go home**. It is not possible
  to get stuck on it.
- Press **Wait**. It closes, the ordinary menu comes back, and a sentence says the game is waiting.
  Your pilot is **still away** (open the card again by pressing **Open World** — it reappears only if
  a newer copy is waiting, which is the playtest-18 rule and still true).
- Now the important half: press **Open World**, and on the card press **Go home**. Your pilot comes
  home: credits, ships, holds, hull, lockers.

*If **Go home** ever refuses or the card has no way off it, stop and tell me — that is the class of
bug this slice exists to prevent.*

## Part 2 — The host comes back (this is the new reconnect)

This is the feature nobody could test before: **the room is kept**, so a friend whose browser
crashed can reopen the same world and be met again without anybody retyping a link.

1. Set up again: host hosts, guest joins, **Bring my pilot**.
2. On the **host**, close the browser. On the guest, the **Your pilot is safe** card appears — press
   **Wait** (so the card goes and you are on the menu).
3. On the **host**, start the game again and get back into the same **Open World**, then
   **P > Open Multiplayer > switch on** (same world, so the same link keeps working).
4. Watch the **guest** for up to ~30 seconds.

**What to check:**

- A sentence on the guest appears: *"Ada's world is back. Your pilot is still there…"* — and the
  guest is connected again (Pause > Open Multiplayer shows the world id and a connected state).
- The **host's** players list (chat column, **Enter**) shows the visitor again, docked, with the same
  name.
- The guest's pilot is **still away**; its save is untouched. Pressing **Open World** on the guest
  still works and the away card appears only for a newer copy.

*If the guest sits on "looking for" for a minute with no sentence, press **Copy details** on both
machines and send both blocks.*

## Part 3 — A closed tab is a clean goodbye

1. Set up again (host + guest with the pilot away), and have the **host** look at the players list
   (**Enter** opens chat, which lists who is here).
2. On the **guest**, **close the tab** (or the whole browser) without pressing anything.
3. On the **host**, watch the list and the chat.

**What to check:**

- The visitor's row goes **at once** (a second or two), and the chat says *"Bo left."*
- On the host, **P > Open Multiplayer > Connection details** does not keep claiming the visitor is
  here.

**Then the reverse:** while the guest is still connected and the pilot is away, use the guest's
**Pause > Open Multiplayer > Leave** (or the switch). The host's list should drop it at once too, and
the guest should be told nothing was lost.

## Part 4 — One window per pilot

A pilot must live in **one window**. Your own save is one save, so two tabs of the same browser both
look like the same pilot.

1. Join and bring the pilot, as in part 0.
2. In the **same browser as the guest** (the same profile — not incognito), open the game in a
   **second tab** and join the same link.
3. Look at the **first** tab.

**What to check:**

- The first tab says: *"This pilot was opened in another window, which has it now."* and its
  multiplayer session stops.
- **Nothing is lost**: the pilot is still away, its save is unchanged, and the second tab is the one
  that is connected.
- The **host** still lists **one** visitor (not two), and its ship did not disappear from the world.

## Part 5 — The copy that comes home is the newest one

**You cannot see this one with your eyes yet** — a guest cannot change anything it owns inside a
friend's world until trading (slice 6) and its own flying (slices 7–8). Before this slice the host
never actually wrote your pilot back, so a visit could only ever return the copy you arrived with;
now the host checks the pilot every two seconds and writes back what it really became. It is proven
by `tests/multiplayer-slice5.test.mjs`.

What you **can** check today is that nothing regressed: come home after a normal visit and compare
one number you noted before you left (credits, one cargo stack, one station locker). It must be the
same stack, **once** — never doubled, never missing.

## Part 6 — The usual safety net

- Load an **old save** (Saves tab, or one of the codes in `TEST-OLD-CODES.txt`): it must open
  unchanged, and the game must say nothing about multiplayer.
- Play [TESTING-BASELINE.md](TESTING-BASELINE.md) once.

---

## Reporting

For anything to do with a save, tell me **what you did, what you expected, what happened**, plus
**the item and the two amounts** (before and after). Press **Copy details** on both machines for
connection problems and send both blocks.

---

## For the next assistant

- **Tests: 1039 green** (was 1030). New: `tests/multiplayer-slice5.test.mjs` (9, two live sessions
  on the in-memory wire). Two existing tests were corrected for the new rules, not weakened: the
  protocol's list of kinds (`bye`), and one test's injected hello, which now describes a second
  window (a takeover) and so must come from the guest's own peer.
- **The hole this slice found:** `writeBack` (slice 4) had **no caller** — `noteGuestChanged` was
  never called by anything — so the host never sent a newer copy back. `syncGuests` (every
  `NET.snapshotSec`) fixes it. See LESSONS L42.
- **Deliberate decisions:** losing the host keeps the session alive (the room is the only way back);
  the menu keeps that one session, and only for a guest whose pilot is away; Go home is the same
  `bringPilotHomeAtMenu` the away card uses; a takeover stops the older session **quietly** so the
  host does not mark the pilot gone.
- **Not built, by plan:** trading (6), drawing the visitor (7), the guest's own screen following the
  host (8), dedicated servers (17).
