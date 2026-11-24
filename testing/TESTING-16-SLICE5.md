# Testing step 16 slice 5: crashes and reconnects

This slice is about the ugly moments: **the host's game closes**, **the connection to it goes away**,
**your pilot is in that world**, and **a closed tab**. Nothing new is drawn in space.

**Build: `2026-11-24c`** — both machines. If one screen shows a different build string (title card, or
Pause > Open Multiplayer > Connection details), they are not running the same file.

You need **two browsers** with separate saves: one normal window and one incognito/private window is
easiest.

**Save version is still 29.** Nothing new is saved by this slice, so an old save loads exactly as
before.

---

## What this slice is **not** (please do not report these)

- **Still no visiting ship on screen** — one hull is drawn (slices 7–8).
- **No trading** (slice 6), so a guest cannot change anything it owns in the friend's world yet, and
  you cannot watch the host's copy of your pilot change with your eyes (part 6).
- **No client-side prediction, no remote controls** (slice 8).

---

## Part 0 — The two-minute set-up

1. Both browsers: open the game, type a username on the title screen.
2. **Host**: **Open World** > **P** (pause) > **Open Multiplayer** > switch multiplayer **on** >
   **Copy link**. (If the room looks empty, wait ~12 seconds: an offer code appears by itself.)
3. **Guest**: title > **Join Multiplayer World** > paste the link > **Join** > **Bring my pilot**.

**What to check (unchanged from slice 4):** the guest's notice says the pilot is on its way, and the
pilot is now away — its own galaxy is paused. See part 3 for how that shows up now.

## Part 1 — The host's game closes: back to the menu, with a prompt

This is the new rule, in the owner's words: *"returned to the main menu with a prompt saying something
like lost connection to host. Dismissing this returns you to main menu. Like Minecraft."*

1. On the **host**, **close the browser window completely** (not the tab — the whole browser).
2. Look at the **guest** screen. Within a few seconds it should be back at the **main menu**, showing
   a prompt:

   > **Lost connection to host**
   > *The host closed the game.* You are back at the main menu.
   > **Main menu**

**What to check:**

- You are on the **main menu**, not left sitting in a world you are no longer connected to.
- The prompt has **exactly one** button, full width: **Main menu**. There is no way to get stuck on
  it, and nothing on it changes your save.
- Press it. The ordinary menu is underneath: "Open World", "Campaign", "Join Multiplayer World".
- **Nothing about your pilot has changed.** Press **Open World**: you get the *"Your pilot is in
  Ada's world"* card if that world holds a newer copy of it (part 3), or your own world if it does
  not. Either way your pilot, ship, cargo and lockers are not lost.

**Try the other way too:** instead of closing the whole browser, **kill the connection** while the
guest is playing — turn the host's wifi off for ~30 seconds. The guest should get the same prompt
within about half a minute. That is the "the guest loses connection to the host" half, and it is new:
before this build the guest would just sit there believing it was still connected.

## Part 2 — Rejoin: the server already has your last version

The owner's rule: *"when reconnecting to the server after a disconnect your pilot's last version is
already on the server."* So a rejoin **catches you up**; it does not upload an old copy over the new
one.

1. With the guest back on the menu (part 1 done), on the **host**: start the game, get into the same
   **Open World** again, and switch multiplayer on (**P > Open Multiplayer**).
2. On the **guest**: **Join Multiplayer World** > paste the **same link** > **Join**.

**What to check:**

- You are welcomed back: the chat says *"Joined Ada's world."*, and the host's players list has your
  pilot again (press **Enter** on the host).
- Your pilot is **still away** (its own galaxy is paused), exactly as it was.
- **No refusal.** If you see *"That link has already been used, or it was copied wrongly"*, that is
  the bug this part is for — send me the block from **Copy details** on both machines.
- Nothing is doubled and nothing is asked: the pilot did not come home and go back, it just resumed.

## Part 3 — Your own world is paused, and the card is how it comes back

This is the one that changed most, so please do it even if nothing else looks different.

1. On the **guest**, while the pilot is away, press **P > Open multiplayer**. Look at the join box.
2. Then leave the visit (**Leave** on that panel, or **Exit to main menu** at the bottom of the pause
   card), and from the **menu** press **Open World**.
3. Do it a second time later, after the friend's world has been left alone for a while.

**What to check:**

- The multiplayer panel **no longer offers Enter the world** while the pilot is away. It says your
  own galaxy is paused where you left it, and that **Leave**, then **Open World** on the menu, brings
  the pilot home.
- **Every** press of **Open World** now shows this card — whichever machine, however long you were
  away, whether or not anything changed in your friend's world:

  > **Your pilot is in Ada's world** — **Bring pilot home** / **Main menu**

  *(It no longer has a "newer" or "nothing changed" line: **Bring pilot home always takes the
  latest version from that world**, however little looks different — a hull parked at a different
  station, a stack a little lighter, a module swapped. That is the owner's rule for this build.)*
- **Main menu** takes you to the ordinary menu, and your pilot is still away — nothing is decided.
- **Open World** never drops you into your own world with the pilot away. That is bug A3: if it does,
  tell me what you pressed.
- Press **Bring pilot home** with the host still closed. The card goes, the ordinary menu comes back,
  a sentence says your pilot is home — **and now Open World opens your world**.
- **Even a visit where nothing happened comes home.** Do part 3 once after a visit where you did
  nothing at all in your friend's world: the card still appears, and **Bring pilot home** still
  works. There is no version of it that says "both copies are the same" any more.
- Your **credits**, your **hold** and your **station lockers** are back — every stack exactly once.
  Check a number you noted before you left.
- Your home stations' stocks are back to what they were before you left, **not double**.

## Part 3b — The chat takes itself away

1. On the **guest**, press **Enter** and send one line. Wait, watching the box.
2. Send another line and press the **Pin** button in the chat box while it is up. Wait again.
3. With the box pinned, press **Enter**, type a few words and do **not** send them. Wait, then press
   **Pin** again (it should read **Pinned** while on) and watch.

**What to check:**

- After a line, the box stays about **seven seconds** and then goes. No press needed.
- A line arriving from your friend brings it back, and it goes again seven seconds later.
- **Pinned**, it stays up until you unpin it — and the button's word changes, so you can see which
  state you are in.
- A half-written line keeps it up; it does not vanish under your fingers.
- Opening the pause card or the title screen still hides it, as before.

## Part 4 — A closed tab is a clean goodbye

1. Set up again (host + guest with the pilot away), and have the **host** look at the players list
   (**Enter** opens chat, which lists who is here).
2. On the **guest**, **close the tab** without pressing anything.
3. On the **host**, watch the list and the chat.

**What to check:**

- The visitor's row goes **at once** (a second or two), and the chat says *"Bo left."*
- On the host, **P > Open multiplayer > Connection details** does not keep claiming the visitor is
  here.

**Then the reverse:** while the guest is connected and the pilot is away, use the guest's **P > Open
multiplayer > Leave** (or the switch). The host's list should drop it at once too.

## Part 5 — One window per pilot

A pilot must live in **one window**. Your own save is one save, so two tabs of the same browser both
look like the same pilot.

1. Join and bring the pilot, as in part 0.
2. In the **same browser as the guest** (the same profile — not incognito), open the game in a
   **second tab** and join the same link.
3. Look at the **first** tab.

**What to check:**

- The first tab says: *"This pilot was opened in another window, which has it now."* and its session
  stops.
- **Nothing is lost**: the pilot is still away, its save is unchanged, and the second tab is the one
  that is connected.
- The **host** still lists **one** visitor (not two), and its ship did not disappear from the world.

## Part 6 — The copy that comes home is the newest one

**You cannot see this one with your eyes yet** — a guest cannot change anything it owns inside a
friend's world until trading (slice 6) and its own flying (slices 7–8). Before this slice the host
never actually wrote your pilot back, so a visit could only ever return the copy you arrived with; now
the host checks the pilot every two seconds and writes back what it really became. It is proven by
`tests/multiplayer-slice5.test.mjs`.

What you **can** check today is that nothing regressed: come home after a normal visit and compare one
number you noted before you left (credits, one cargo stack, one station locker). It must be the same
stack, **once** — never doubled, never missing.

## Part 7 — The usual safety net

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

- **Tests: 1040 green** (was 1030 before the slice). New: `tests/multiplayer-slice5.test.mjs`
  (10 tests, two live sessions on the in-memory wire). Two existing tests were corrected for the new
  rules, not weakened: the protocol's list of kinds (`bye`), and one test's injected hello, which now
  describes a second window (a takeover) and so must come from the guest's own peer.
- **The hole this slice found in slice 4:** `writeBack` had **no caller** — `noteGuestChanged` was
  never called by anything — so the host never sent a newer copy back. `syncGuests` (every
  `NET.snapshotSec`) fixes it. LESSONS L43.
- **The hole the owner's clarification found:** the copy a guest keeps is the **host's** copy, and a
  host keeps no token, so a rejoin in a fresh session (a closed tab, a lost connection) was refused
  as *"that link has already been used"*. `sendCarryMessage` now fills the secret from `away.token`.
  LESSONS L44.
- **Deliberate decisions:** a lost host ends the room (the owner's Minecraft rule) — so the earlier
  "keep the room and meet a returning host without a link" idea is gone, and `mp-host-back` with it;
  a lost connection returns the player to the menu **whoever they are** (a looker-around lost a
  connection too, and the prompt asks no question about a save); the prompt's one button changes
  nothing but the prompt; the pilot's save is never touched by a loss.
- **Not built, by plan:** trading (6), drawing the visitor (7), the guest's own screen following the
  host (8), dedicated servers (17).
