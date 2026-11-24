# Quick test: step 16 slice 5 (10 minutes)

**Build `2026-11-24b`.** Two browsers with separate saves: one normal window, one incognito/private
window. Everything below is the new behaviour; if a step does not match, send me the step number and
**Copy details** from both machines.

## Before you start

1. Download the zip for the branch, unzip it, and open **`game/tallow-reach.html`** in both browsers
   (that one file is the whole game — no server needed).
2. Both windows: type a username on the title screen (3+ characters).

## Part A — the connection works (2 min)

3. **Window 1 (host):** **Open World** → **P** (pause) → **Open Multiplayer** → switch multiplayer
   **on** → **Copy link**. If the room looks empty, wait ~12 s for an offer code.
4. **Window 2 (guest):** title → **Join Multiplayer World** → paste the link → **Join** →
   **Bring my pilot**. Wait for the notice that the pilot is on its way.
5. **Check:** the guest's own world is now paused (the pilot is away); the host's players list
   (**Enter** opens chat) shows the visitor. On the guest, **P → Open multiplayer** no longer offers
   **Enter the world** — it says your own galaxy is paused and how to get the pilot home.

## Part B — the bit this build is about (3 min)

6. **Host: close the whole browser window.**
7. **Guest: watch it.** Within a few seconds you should be on the **main menu** with:

   > **Lost connection to host** — one button: **Main menu**

8. **Check:** one button, full width. Press it → the ordinary menu (Open World / Campaign / Join
   Multiplayer World). Your pilot is **not** lost, and it is **not** in your own world either: press
   **Open World** and you *always* get the *"Your pilot is in Ada's world"* card with **Bring pilot
   home**, whether or not anything changed over there. **Main menu** on the card leaves everything as
   it was.
9. **Check the save:** press **Bring pilot home** on the card. Your credits, hold and station
   lockers come back — the same numbers, **once** each — and **Open World** then opens your world.

## Part C — rejoin, and a closed tab (3 min)

10. **Host:** start the game, open the same **Open World**, **P → Open Multiplayer** → switch **on**.
    *(The old link keeps working — same world.)*
11. **Guest:** **Join Multiplayer World** → paste the **same link** → **Join**.
    **Check:** the chat says *"Joined Ada's world."*, the host lists you again, and your pilot is still
    away — no question, nothing doubled. **No red refusal** (if you see *"that link has already been
    used"*, that is the bug: stop and tell me).
12. **Guest:** with the pilot away, **close the tab**.
    **Check (host):** the visitor's row and the chat drop it within a second or two (*"Bo left."*).

## Part C2 — the chat hides itself (1 min)

12b. **Guest:** press **Enter**, send one line, and wait. **Check:** the box goes after about seven
     seconds. Send another, press **Pin** in the box, wait. **Check:** it stays, and the button reads
     **Pinned**; unpin it and it goes again.

## Part D — the 30-second version of "you keep playing" (1 min)

13. Everything you did before this build must still work: one quick **Open World** flight, land at a
    station, open the **Shop**, buy nothing, come back out. If the game plays normally, the slice has
    not broken anything.

---

**What I need if something goes wrong:** the part number, what you expected, what you saw, and
**Copy details** from both machines. For anything about cargo or credits: the item and the two numbers.
