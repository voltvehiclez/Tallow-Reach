# Testing step 16 slice 3: the connection (host, join, chat, the player list)

This is the slice where two browsers can **open a world, join it, and talk**. Nothing a pilot owns
crosses the wire yet: no ship, no credits, no cargo. That is on purpose — it means a bug here can
fail to connect, and cannot cost you anything.

**Rewritten again after your third playtest (2026-11-21, two machines).** New in this build: the
guest repeats its hello until the host answers (a connection that takes seconds still works), the
first Join press no longer needs a second one, and the guest's **Current players** list includes the
host. If two machines still cannot see each other after ~12 seconds, the game says which failure it
is — read that sentence.

**Second playtest changes:** What changed for you:

- **Joining is the main menu's job, hosting is the pause card's.** *Join Multiplayer World* on the
  title screen shows only the join box; *Open Multiplayer* in the pause card shows only the host
  switch, the link and the codes.
- **No username, no switch** — still true everywhere.
- **A world with a session no longer pauses** when you press P (you or your guest).
- **A duplicate name gets a star**: if you are `Acey` and a guest is also `Acey`, the guest becomes
  `Acey*`, the next `Acey**`, and the guest is told in chat.
- **The chat box has a compact player list on its right**, and it can be opened and typed in with
  nobody else connected (it keeps a log you can scroll).

You need **two windows** on one machine, or two machines. A phone on the same wifi works as the
second window (a hotspot or mobile data usually works too).

## Before you start

1. Run `npm run build`, then `npm test`. Both must pass. Then open the built
   `game/tallow-reach.html` (or the dev server, `node serve.mjs`).
2. Both windows: **Open World** from the title screen (multiplayer is open world only — the campaign
   is single player).

## Part 1 — the screen and the username (one window)

1. On the title screen, before clicking Open World: press **Join Multiplayer World**.
   The screen opens showing **Your name** and **Join a friend's world** — and **no host switch**
   (hosting is the pause card's job now).
2. Leave the name empty and try to press **Join**. It must not join: it says *"Type a username
   first…"* and nothing is attempted.
3. Type a username (say `Ada`), press **Close**, then **Open World**.
4. Press **P**. The pause card has **Open Multiplayer** with a one-line state under it. Press it: this
   screen shows the **host switch** and **no join box**.
5. Press the switch. It reads **On**, and a **Join link** appears with **Copy link**. Click it; it
   says *Copied.* (If the browser refuses, the text is selected — press Ctrl+C.)
6. **The pause bug:** this time, with the world on, press **P** and leave the card open for ~10
   seconds. Your ship must not drift, fire or turn, and the world behind the card must **keep
   running** (watch a station's lights, or a ship moving). Press **Resume**.

## Part 2 — host, then join (two windows)

1. **Window A** (the host): **Open World**, then **P** > **Open Multiplayer**, a username,
   **Open Multiplayer: On**, then **Copy link**.
2. **Window B** (the guest): **Join Multiplayer World** on the **title** (it does not work from the
   pause card now — that screen has no join box), type a username, and paste the link into
   **Paste the link your friend sent**. Press **Join**.
   - The guest does **not** turn the host switch on. Joining and hosting are separate blocks now.
   - A full URL, or just `?join=w-…#…`, both work. A stray sentence around the link is fine.
3. Window B joins the open world on its own (it asks nothing), and the panel's status line under the
   cards should read **Connected**.
4. **Two machines:** the same steps, but on the *host's* PC press **Copy link** and carry the text to
   the laptop by any means (pastebin, email, chat). A guest that has not been admitted within ~12
   seconds now says so: *"No answer from the host yet…"* means the browsers found each other but
   messages are not getting through (a strict router); *"Nobody is hosting the world in that link
   yet"* means the host's switch is off. Both are worth telling me about — include the sentence.

**What "working" looks like**

- **Window A**: the chat line **"Bo joined."** and the guest's name under **Current players**.
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

## Part 3 — chat (both roles, and alone)

1. In **either** window (host **and** guest — the guest could not type before this build), press
   **Enter**. A chat box opens at the **bottom left**, about twice as tall as before: the lines and
   the input on the left, a compact **Current players** column on the right with one small row per
   pilot — **you first, then the host, then every guest** (both windows must list everybody).
2. Type a message and press **Enter**. It appears in both windows under the sender's name, and the
   box clears. The guest's line must be attributed to the guest's name.
3. **With nobody connected** (host, nobody has joined yet): open the box and type. The line appears on
   your screen and a sentence says **"Only you are here so far — nobody else will see this."** Press
   Enter a few times and scroll the box up: the earlier lines are still there.
4. **The important one:** while the box is open, type `wasdqaex` — the ship must **not** move, fire or
   change speed. Letters go into the message.
5. Press **Escape**. The box closes and the normal keys work again (try W — the ship accelerates).
6. Open the box again, press **Escape**, and confirm the pause card did **not** open.
7. While the multiplayer screen is open, flight keys must not reach the ship either.

## Part 4 — a hosted world, and the pause card

1. With both windows connected, **Window A** presses **P**. The card opens with **Open Multiplayer**
   showing the hosted state, and the world behind it **keeps running** — that was the playtest-2 bug.
   **Resume** returns you to the flight.
2. Stop hosting (**Open Multiplayer** → switch **Off**). The line says **"Your world is closed."** and
   the link disappears. Chat then says **"Not sent…"** if you try to speak.
3. **Window B** presses **Leave** on the same screen. Its chat box goes away.

## Part 5 — the same name twice

1. Give the host the name `Acey` and have the guest join as `Acey` too, from a fresh world (or rename
   the guest before joining).
2. The guest's chat should say **"You are Acey* here — the host already has a Acey."**, the host's
   list should show `Acey*`, and every line the guest types must be signed `Acey*`.
3. A third window joining as `Acey` becomes `Acey**`.

## Part 6 — things to try to break

- Open the host's link in a **third** window **by pasting it into the address bar** of the built page.
  The game asks "Join a multiplayer world with this link?" — **Cancel** must do nothing at all, and
  the link must not be offered again after a reload.
- Paste a join link with **no username set yet**: the game says the link is waiting; press **Join
  Multiplayer World** and the link should already be in the paste box.
- With a campaign act running, try a join link: the game says multiplayer is open world only.
- Try to host while your pilot is visiting somebody (`away`): it is refused with a sentence, and the
  switch goes back to **Off**.
- While hosting, press **P** > **Exit to main menu**: the room must close (the pause card's line says
  *Off* next time) — hosting is something you do while flying your own world.
- Open the pause card while connected and try to join from there: there is no join box, and the screen
  names the main menu if you press Join anyway.

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
