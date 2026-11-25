# Testing step 16 slice 8a: the second hull appears

Your friend's pilot has been a real ship inside your world since slice 4 — docked, simulated, and
named on the map since slice 7 — but **nothing was drawn for it**. This slice draws it: when a
friend brings its pilot into your world, you see **a second hull in space**, parked at the station
it arrived at.

The other half of the slice is the pipe that will carry that picture both ways: your screen now
sends where every pilot is, 24 times a second, and a guest's screen buffers those snapshots and
smooths them. You only *see* that half once your screens are in the same pocket (slice 8c), so this
guide proves it with the host's side, which needs no wire at all, plus a check that nothing on the
guest's screen has gone strange.

**Build: `2026-11-25d`** — both machines. If one screen shows a different build string (title card,
or Pause > **Open Multiplayer** > **Connection details**), they are not running the same file.

You need **two browsers** with separate saves: one normal window and one incognito/private window is
easiest.

**Save version is still 29.** This slice saves nothing new.

---

## What this slice is **not** (please do not report these)

- **Your friend's hull does not move.** There are no controls on the wire yet (slice 8b): the
  visiting pilot is docked where it arrived, so its hull is parked. A still hull is the point.
- **The guest's screen still shows its own galaxy** (slice 8c), so a guest usually sees no friend in
  its sky. Nothing to look for there yet.
- **No trading** (slice 6, which comes last).
- **A friend cannot be hit, killed or predicted** (8d and later). Locking one is fine — it is a target
  marker, not a weapon: missiles still only lock a hostile.
- **Names over hulls and a lock on a friend are now built** (playtest 23) — see Part 6.

---

## Part 0 — The two-minute set-up

1. Both browsers: open the game, type a username on the title screen.
2. **Host**: **Open World** > **P** (pause) > **Open Multiplayer** > switch multiplayer **on** >
   **Copy link**.
3. **Guest**: title > **Join Multiplayer World** > paste the link > **Join** > **Bring my pilot**.
4. On the **host**, close the pause card and read the message line: it should say **Acey arrived at
   Meridian Station** (the same notice as before this slice).

**What to check:** the notice is unchanged. This slice changed no words on any screen.

## Part 1 — The hull, on the host's screen

The visitor arrives **docked at its own home station** — **Meridian Station** for a fresh save — and
a docked visitor is drawn **parked at that station's launch point** (the spot 200 m out that a ship
appears at when it launches).

1. On the **host**, be in the same pocket as the visitor (with two fresh saves you already are: both
   pilots start at Meridian).
2. Look out from the station: undock (**Launch**), then turn and look back at the launch point ahead
   of the station. If you were already flying, fly back to Meridian and look near the station.

**What to check:**

- **A second ship**, sitting still, about 200 m off the station: that is your friend's pilot.
- It is the **friend's own hull** — if the guest's last ship was a Prospector and yours is a Wasp,
  you see a Prospector. Change nothing to make this happen; it is what the suitcase already carried.
- Its engine glow is dim (throttle zero, and it is parked).
- **Your own ship is still exactly as it was** — one model of yours, one of theirs. If you see two
  copies of *your* ship, say so: that would mean the local hull is being drawn twice.

## Part 2 — It comes and goes with the friend

1. On the **guest**, press **P** > **Open Multiplayer** > **Bring pilot home** (or **Go home**).
2. On the **host**, look again at the station: the extra hull is **gone**. The message line said
   **Acey left.**
3. On the **guest**, join again with the same link and press **Bring my pilot**.
4. On the **host**: the hull is **back**, in the same place.

**What to check:** no ghost hulls, no duplicates, and the host's own game keeps running through all
of it (a hosted world never pauses).

## Part 3 — Two visitors, two hulls

Only if a third browser (or a friend) is handy.

1. Open the same link in a **third** browser, type a different username, **Join**, **Bring my pilot**.
2. On the **host**: **two** parked hulls, not one, and they do not sit exactly on top of each other
   (a visitor lands at its own home station, so a pilot from another system arrives elsewhere — in
   that case look for its hull in *that* pocket, not at Meridian).
3. Close the third browser. The host's list drops it, and one hull goes with it.

## Part 4 — The guest's screen is quiet

1. On the **guest**, fly around for a minute: launch, warp, dock.
2. On the **host**, watch the guest's hull while the guest flies. **It does not move** — the guest's
   flying happens in its own world until 8b — and that is expected.
3. On the **guest**, check nothing has changed: your own ship is drawn once, the HUD is normal, no
   stutter, no second ship of your own, no crash, and the message line says nothing new.

**What to check:** the guest's screen must be *exactly* as it was before this slice. If a hull
appears in the guest's sky, it will be the host's — only if you are in the same pocket, which the
slice does not arrange (8c does).

## Part 5 — The old behaviour still holds

1. Chat (**Enter**) still works both ways.
2. **Pause** on the host still does not stop the world; the pause card is a settings panel.
3. Close the host's browser while the guest is in its world: the guest lands on the main menu with
   **Lost connection to host**, as slice 5 made it.
4. **Bring pilot home** still brings credits, ships and cargo back (slice 4).

---

## Part 6 — Playtest 23: the two bugs you reported, retested

These were the two reports from the last playtest. Both are fixed (first in `2026-11-25b`, then again in **`2026-11-25c`**), and this part
is the retest — please do it in this order, because the second one needs a rejoin.

### 6a — Your friend's ship can be selected, and it has a name and bars

On the **host**, in the same pocket as the visiting pilot (Part 0/1):

1. Look at the friend's hull. It now wears **its pilot's name** above it, like any other ship.
2. Put the white centre dot **on the hull** and press **F**.
3. Press **F** again to release it, and again to take it back.

**What to check:**

- The lock marker carries **the pilot's name** (in this guide, *Acey*) — not "Ship", not a guest id.
- Under the name are **two bars: shield and hull**, with percentages, exactly as a hostile's lock has.

4. Press **N** and find **Acey** in the list, under the type **(Ship)**.
5. Click that row: the same lock is taken. Click it again: it is released.

**What to check:** a friend's row behaves like every other row, including the highlighted selection.

6. (If a friend is at the keyboard) ask them to move — nothing moves yet, that is 8b — so use **N** →
   *Acey* → **F** targets the row instead. **F** on a *distant* friend's hull still works if the dot
   is close to it: the lock assists, the same way it does for a hostile.

### 6b — Leaving and rejoining the same link now always works

This is the one that used to fail at **85%**, with *"The link has already been used, or it was copied
wrongly."*

1. **Guest**: **Bring my pilot** and stay in the world for **half a minute** (this matters — the old
   bug needed the host to write the visitor's copy back at least once, which happens a few seconds in).
2. **Guest**: **P** > **Open Multiplayer** > **Bring pilot home**. **Host**: the hull goes and the
   line says *Acey left.*
3. **Guest**: **Join Multiplayer World** > **the same link** > **Join** > **Bring my pilot**.
4. Do 2 and 3 **twice more**, and once leave by simply **closing the guest's tab**.

**What to check:**

- The handshake reaches **100%** every time — no 85% stop, ever.
- **Bring my pilot** never answers with *"The link has already been used…"*.
- After each rejoin the host sees **one** hull and **one** *Acey* in the player list, not two.
- Chat still works after a rejoin, in both directions.

If a rejoin is still refused, please say **which step** and **what the message line said** — that
sentence is the most useful thing in the report.

---

## Part 7 — Playtest 23, second round: the stuck browser and the hull you can touch

Two more reports from the last playtest, both fixed in **`2026-11-25c`**. Part 7a is the one that
matters most: it is the browser that was **still** locked out, and it should heal itself.

### 7a — The browser that was stuck can come back on the same link

Use the **same browser** you used when it failed — the old one, not a new one. **Do not ask the host
for a new link.**

1. **Host**: open the world as usual and leave it open.
2. **Old guest browser**: **Join Multiplayer World** > **the same link as before** > **Bring my pilot**.
3. If it still says *"That link has already been used…"*: **do it once more**. A refusal now ends the
   attempt cleanly instead of spinning — you get the host's sentence and nothing else to wait for.

**What to check:**

- The handshake reaches **100%** and the world opens; the pilot is there.
- On the **host**, one line appears in the chat: *"…'s saved link had been damaged by an older build.
  It has been repaired, and that pilot can join this world normally from now on."* — once is normal.
- **Leave and rejoin a second time**: no repair line this time (nothing left to repair), and it joins.
- **Bring my pilot** works after that rejoin: your credits, ships and cargo come home.

### 7b — A visiting ship is solid and takes damage

You asked for this one directly: *every ship takes damage and is collidable in Tallow Reach unless
specified otherwise*. Do it on the **host's** screen, in the same pocket as the visiting hull.

1. Undock, fly at the friend's hull at speed and hit it head-on.
2. Shoot it: put the dot on it and fire the guns.
3. Fire a **missile** at it (lock it first, then the missile key).

**What to check:**

- **Flying into it:** you are pushed aside and slowed, and your **shields drop** (then hull). The
  friend's hull takes the same hit — ask them, or watch the bars on the **F** lock.
- **Shooting it:** the bolts stop **on** the hull instead of passing through, and its shield/hull bars
  (**F** lock) drop. A missile bursts on it.
- **A slow nudge** (under about 25 m/s) separates the two ships and hurts nobody — that is the rock rule.
- **Destroying it:** when its hull reaches zero the hull disappears from both screens and the chat says
  *"…'s ship was destroyed in this world. Its pilot is safe in its suitcase — go home to fly it again."*

**Do not report:** that the destroyed pilot cannot respawn in that world. Recovery is not built yet
(it is the next slice's debt) — coming home and bringing the pilot again is the way back, and that is
what the line says. Also do not report that the visitor cannot fly: controls are 8b.

---

## Part 8 — The N list's Ship filter shows every ship

Your report: *"the filter in N tab for Ships shows ALL ships. Both player ships and ALL npc ships.
Right now cant see the guest in the N tab."* The Ship box already carried every **NPC** ship; the
missing row was the **pilot**, because the list skipped docked pilots and a visitor is docked for its
whole visit (it cannot fly yet — that is 8b).

1. On the **host**, with a friend in the world (Part 0/1), press **N**.
2. Tick **Ship** and leave the other boxes alone (there are preset buttons too, if you prefer).
3. Look for the friend's name in the list, e.g. **Acey (Ship)**.
4. Click that row, then click it again. Press **N** or **Escape** to close.

**What to check:**

- The friend appears as **Acey (Ship)** — the pilot's name, not an id — even though they are parked at
  the station and cannot move.
- Clicking the row takes the pilot lock, with **hull/shield bars**; a second click releases it.
- With **only Ship** ticked, everything that is a ship is still there: raiders, freighters, and the
  friend. Nothing that is not a ship (rocks, cargo, stations) appears.
- On the **guest's** screen, **N** → **Ship** lists the **host's** ship too.

---

## If you see nothing

- **Was it a "Bring my pilot", or only a Join?** Joining looks around; it does not put the pilot in
  the world. Only **Bring my pilot** makes a body to draw.
- **Are you in the visitor's pocket?** A hull is drawn only in the pocket your screen is showing.
  The notice names the station it arrived at; if that is not the pocket you are in, fly there (or
  warp to that system on **M**).
- **Look at the launch point, not inside the station.** The hull is parked where ships appear when
  they launch — ahead of the station's face, not in the docking bay.
- **Both builds `2026-11-25d`?** Compare the title card or **Connection details**.
- **Too dark?** A dark hull against a dark sky at 200 m is hard to see from the docked camera; undock
  and approach.
- **No bars on the lock?** They belong to the *pilot* lock (Part 6a). Check the build string first:
  `2026-11-25a` has no pilot lock at all.

## What to report

For anything that fails: **what you did, what you expected, what happened**. Screenshots help most
when they show both windows. Last time the three useful facts were the build string on each machine,
whether the visitor's name was in the host's player list, and what the host's message line said last.
