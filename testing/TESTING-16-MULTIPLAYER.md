# Testing step 16 slice 3: the connection (host, join, chat, the player list)

This is the slice where two browsers can **open a world, join it, and talk**. Nothing a pilot owns
crosses the wire yet: no ship, no credits, no cargo. That is on purpose — it means a bug here can
fail to connect, and cannot cost you anything.

**Rewritten 2026-11-21 after the first playtest.** What changed for you: there is now **one
multiplayer screen** with three blocks (your name, host your world, join a friend's world), it is
reachable from the **title screen** as well as from the pause card, and it will not let you turn
multiplayer on without a username.

You need **two windows** on one machine, or two machines. A phone on the same wifi works as the
second window (a hotspot or mobile data usually works too).

## Before you start

1. Run `npm run build`, then `npm test`. Both must pass. Then open the built
   `game/tallow-reach.html` (or the dev server, `node serve.mjs`).
2. Both windows: **Open World** from the title screen (multiplayer is open world only — the campaign
   is single player).

## Part 1 — the screen and the username (one window)

1. On the title screen, before clicking Open World: press **Join Multiplayer World**.
   The multiplayer screen opens. It should show **Your name**, **Host your world** and
   **Join a friend's world**.
2. Leave the name empty and try to turn **Open Multiplayer** on. It must **not** turn on: the switch
   is greyed out, and if you click where it is, it says *"Type a username first…"*. **This is the
   bug that is fixed** — no username, no world, no silent nothing.
3. Type a username (say `Ada`). The switch becomes usable.
4. Click the switch. It reads **On**, and under it a **Join link** appears with a **Copy link**
   button. Click **Copy link**; it should say *Copied.* (If the browser refuses the clipboard, the
   text is selected for you and the screen says so.)
5. Press **Close**, then **Open World**, and press **P**. The pause card now has **Open Multiplayer**
   with a one-line state under it (*"Hosting — waiting for your friend."*). Pressing it opens the same
   screen. Press **Resume**.

## Part 2 — host, then join (two windows)

1. **Window A** (the host): **Join Multiplayer World** (title) or Pause > **Open Multiplayer**, a
   username, **Open Multiplayer: On**, then **Copy link**.
2. **Window B** (the guest): **Join Multiplayer World** on the title, type a **different** username,
   and paste the link into **Paste the link your friend sent**. Press **Join**.
   - The guest does **not** turn the host switch on. Joining and hosting are separate blocks now.
   - A full URL, or just `?join=w-…#…`, both work. A stray sentence around the link is fine.
3. Window B joins the open world on its own (it asks nothing), and the panel's status line under the
   cards should read **Connected**.

**What "working" looks like**

- **Window A**: the chat line **"Bo joined."** and the guest's name in **Who is here**.
- **Window B**: **"Joined Ada's world."**
- Both windows say **Connected**.

**If it does not connect**

- Give it ~20 seconds. The free relays are public and occasionally slow; the status line names what
  it is waiting for.
- Then try the fallback, which now really is a fallback:
  1. **Window A**: under the link, press **No broker? Paste codes**. An **offer code** appears and
     **stays on screen**. Press **Copy offer code** and send it to Window B.
  2. **Window B**: paste that code into the **same** paste box (it takes `TRJOIN:` codes too) and
     press **Join**. An **answer code** appears; press **Copy answer code** and send it back.
  3. **Window A**: paste the answer into **Their answer code** and press **Connect**.
  - The **Connect** button only exists once an offer has been made, so the old *"Make a fresh offer
    first"* message should be impossible to reach.

## Part 3 — chat

1. In either window, press **Enter**. A chat box opens at the **bottom left**, with the players listed
   above it.
2. Type a message and press **Enter**. It appears in both windows, under the sender's name, and the
   box clears.
3. **If nobody is connected** and you press Enter, the line stays in the box and a red sentence says
   **"Not sent — no other pilot is connected yet."** That sentence is the fix for *"the text just sits
   there"*: it should never be silent again.
4. **The important one:** while the box is open, type `wasdqaex` — the ship must **not** move, fire or
   change speed. Letters go into the message.
5. Press **Escape**. The box closes and the normal keys work again (try W — the ship accelerates).
6. Open the box again, press **Escape**, and confirm the pause card did **not** open.
7. While the multiplayer screen is open, flight keys must not reach the ship either.

## Part 4 — a hosted world, and the pause card

1. With both windows connected, **Window A** presses **P**. The card opens with **Open Multiplayer**
   showing the hosted state. **Resume** returns you to the flight.
2. Stop hosting (**Open Multiplayer** → switch **Off**). The line says **"Your world is closed."** and
   the link disappears. Chat then says **"Not sent…"** if you try to speak.
3. **Window B** presses **Leave** on the same screen. Its chat box goes away.

## Part 5 — things to try to break

- Open the host's link in a **third** window **by pasting it into the address bar** of the built page.
  The game asks "Join a multiplayer world with this link?" — **Cancel** must do nothing at all, and
  the link must not be offered again after a reload.
- Paste a join link with **no username set yet**: the game says the link is waiting; press **Join
  Multiplayer World** and the link should already be in the paste box.
- With a campaign act running, try a join link: the game says multiplayer is open world only.
- Try to host while your pilot is visiting somebody (`away`): it is refused with a sentence, and the
  switch goes back to **Off**.

## What is deliberately still missing (do not report as a bug)

- **No remote ship.** A guest is a name in the list, not a ship you can see or shoot.
- **No pilot travelling.** Credits, cargo and ships stay home; nothing is taken or given.
- **No trading, no "View docked players".**
- **A reload loses the connection.** Rejoining is slice 5.
- **Names are for show.** Two players with the same name are separate connections; the `*`/`**`
  suffixes arrive with slice 4.

## If something goes wrong, what to send back

The line under the panel is the useful thing: it names the state (`finding`, `connected`, `lost`) and,
when it failed, why. Copy that sentence, plus which of the steps above stopped working, and whether
the link path or the code path was the one you tried.
