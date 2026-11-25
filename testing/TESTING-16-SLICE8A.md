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

**Build: `2026-11-25a`** — both machines. If one screen shows a different build string (title card,
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
- **No names over hulls, no target lock on a friend** (step 16 debt, *player presentation*).
- **No trading** (slice 6, which comes last).
- **No damage, no kills, no prediction** (8d and later).

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

## If you see nothing

- **Was it a "Bring my pilot", or only a Join?** Joining looks around; it does not put the pilot in
  the world. Only **Bring my pilot** makes a body to draw.
- **Are you in the visitor's pocket?** A hull is drawn only in the pocket your screen is showing.
  The notice names the station it arrived at; if that is not the pocket you are in, fly there (or
  warp to that system on **M**).
- **Look at the launch point, not inside the station.** The hull is parked where ships appear when
  they launch — ahead of the station's face, not in the docking bay.
- **Both builds `2026-11-25a`?** Compare the title card or **Connection details**.
- **Too dark?** A dark hull against a dark sky at 200 m is hard to see from the docked camera; undock
  and approach.

## What to report

For anything that fails: **what you did, what you expected, what happened**. Screenshots help most
when they show both windows. Last time the three useful facts were the build string on each machine,
whether the visitor's name was in the host's player list, and what the host's message line said last.
