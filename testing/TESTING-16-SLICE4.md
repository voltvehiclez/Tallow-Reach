# Testing step 16 slice 4: Bring my pilot, sync, and Go home

This is the slice where **something of yours actually crosses the wire**. Your pilot — its ship, its
hold, its credits and its station lockers — travels to your friend's galaxy, and comes home again.

**Read this first, because it changes how you play:** joining a friend's world and **travelling** to
it are now two separate presses. Joining only lets you look around and talk. **Bring my pilot** is
what actually moves your ship and cargo. That is deliberate: your own galaxy pauses while your pilot
is away, and a player who only wants to chat should not have their world stopped for it.

**Build: `2026-11-23a`** — both machines. If the two builds differ, the join is refused in words,
which is itself a thing worth checking (step 0 below).

You need **two browsers** (or two machines) and two names. Easiest: one window, one incognito/private
window — they have separate saves.

---

## What this slice is **not**

Please do not report these as bugs — they are the next slices, by plan:

- **You cannot see your friend's ship on your screen yet**, and they cannot see yours. The visiting
  pilot is *real* — it is docked, it is simulated, it can be traded with later — but the renderer
  still draws only one hull. Drawing a visiting ship is slice 7/8.
- **Your screen does not follow your friend's galaxy** while your pilot is away. Coming home is a
  menu card (see part 3), not a cockpit view of their world.
- **No trading yet** (slice 6), **no crash/reconnect screens yet** (slice 5).

---

## Part 1 — Host a world (5 minutes)

1. Open the game. On the title screen, type a username (at least 3 characters).
2. Press **Campaign** or **Open World** to get into your own world.
3. Press **P** (pause) > **Open Multiplayer**. Switch multiplayer **on**.
4. You now have a join link. If the room looks empty, **wait ~12 seconds** — the screen will make
   an offer code by itself. Use whichever route worked for you last time (link, or code pair).

**What to check:** the host's screen should say your world is open, and nothing about a pilot —
the host is not going anywhere. The host's own pilot stays exactly where it is.

## Part 2 — Guest: join, then *bring the pilot*

1. In the second browser, title screen > username > **Join Multiplayer World**.
2. Paste the link (or the offer/answer codes) and **Join**.
3. Once you are in the room, the Join block shows a **Bring my pilot** button. Press it.

**What to check — this is the heart of the slice:**

- **Before** you press Bring my pilot: your pilot is still at home. Quit to the title screen and you
  get the ordinary menu, not the away card. (This is the "joining is not travelling" rule.)
- **The moment you press it**, a notice appears and your pilot is packed. A suitcase too big for the
  wire (256 KB) is **refused in words** and your pilot stays home with everything — nothing is
  truncated and nothing is lost.
- Press **Bring my pilot** a second time: it says your pilot is already here, and does not send a
  second ship.

### The important one: nothing is copied

This is the test that matters most, because it is the bug this build found twice.

1. On the **host**, open the station (press **G** near a station) and look at the **station stock**.
   The guest's lockers should now be in the host's stations — the same stacks, moved, not new ones.
2. On the **guest**, your own credit balance and hold should look unchanged in amount — you took it
   with you, it did not get duplicated.
3. On the **host**, sell or buy nothing for now. Just note the numbers.

*If any stack appears in two places at once, or a number doubles, stop and tell me — that is exactly
the class of bug this slice is built to prevent.*

## Part 3 — Bring the pilot home, with the host offline

The plan says Go home must work **from the suitcase with the host offline**, so test it that way:

1. **Close the host's browser completely.** The guest's screen will say the host left.
2. On the guest, quit to the **title screen**.
3. Instead of the ordinary menu you should now see a **card**: *"Your pilot is in Ada's world"* with
   two buttons — **Rejoin** and **Bring pilot home**.
4. Press **Bring pilot home**.

**What to check:**

- The card disappears and the normal menu comes back.
- Your **credits**, your **hold** and your **station lockers** are all back — every stack, exactly
  once. Check a number you noted in part 2.
- Your home stations' stocks are back to what they were before you left, **not double**.

**Also worth a try:** on the title card, press **Open World** first without bringing the pilot home.
It should refuse and keep you on the card rather than putting you in a cockpit with a frozen pilot.

## Part 4 — Sync: does the host see what you did?

1. With the pilot away, note what the host's world showed for your pilot (credits, cargo).
2. The host should receive an updated copy of your pilot about **two seconds** after it changes —
   that is the `rev` bump. You cannot see this directly yet; what you *can* check is part 3: when
   you come home, do you still have everything you had, correctly?

**If a stack is lost or doubled on the way home, that is the most valuable bug you can report.**

---

## Reporting

Press **Copy details** on both machines if anything fails to connect, and send both blocks. For
anything to do with cargo, tell me **the item, the amount before, and the amount after** — I can
reproduce the arithmetic from three numbers, but not from "cargo looks wrong".

---

## For the next assistant

- **Tests:** 1003 green. New files: `tests/multiplayer-carry.test.mjs` (11),
  `tests/multiplayer-visitors.test.mjs` (8), `tests/multiplayer-bring-pilot.test.mjs` (7), plus 1
  added to `multiplayer-custody` and 1 to `multiplayer-connection`.
- **Two slice-1 bugs were fixed here**, both "items copied" bugs (LESSONS L15):
  `custody.hostProfile` emptied every guest's hold because it sanitized a profile with no `v`; and
  `checkOut`'s emptied station stocks never reached the live save because the session's `saveKit.write`
  is deliberately narrow (guest list + world id only). A guest's own save now goes through a separate
  `saveKit.install`, which installs a whole mode save; the host's narrow `write` is unchanged.
- **Deliberate scope decision:** joining does not pack the pilot. `Bring my pilot` does. The plan
  quotes it as an action, so it is one.
- **Not built, by plan:** drawing a visiting ship (slice 7/8), the guest's screen following the
  host's pocket (8c), crashes/reconnects (5), trading (6).
