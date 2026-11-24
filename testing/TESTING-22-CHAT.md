# Playtest 22 — two guests at once, and a chat that stays out of the way

**Build `2026-11-24f`.** Save version **29**, unchanged: the new per-browser identity lives in the
browser's own settings (`tr_mp`), not in a save, so an existing save loads exactly as it did.

Two things are being tested here, and they are worth testing separately:

- **The big one:** two friends on the **same join link** must both be in the world at the same time, and
  neither may be thrown out; a friend who refreshes must be let back in as the same pilot.
- **The small ones:** the chat's right-hand column (Pin, players) is now visible only while you are
  actually typing, so a line arriving by itself shows the lines and nothing else.

## What changed, in the owner's words

> "If a second guest player joins, first guest is kicked out and this error message comes on if first
> guest tries to join again with 'That link has already been used, or it was copied wrongly'."

That was **not** a player limit. A join link carries one secret per world, and the guest was using that
shared secret as its own identity — so two friends looked like one pilot, and the host's (correct)
one-window-per-pilot rule retired the first to make room. Each browser now makes its own pilot identity
once, keeps it, and sends it; the link only says **where** it may be used. `docs/LESSONS.md` L47 has the
full account.

> "i want unlimited players. The limit is the host's computer and connection speed, and tolerable lag."

`NET.maxGuests` went from 4 to 100 and is now documented as a valve against a runaway room, not a rule of
the game. The players strip names the first ten and then says `+N more`, so the HUD does not grow with the
room.

> "Increase time open to 12 seconds." · "when you sent a message yourself the chat should be also visible
> for 12 seconds since the message was sent." · "Make it so that it always says 'Pin', and make the button
> solid yellow with black text if pinned and transparent with yellow text if non pinned." · "the player
> column needs to be less wide … reducing the gap between Players and Pin. Keep name size the same." ·
> "when chat is auto opened when someone or yourself writes, the pin button shouldn't be there and the
> right edge of the text box should wrap close to the right most part of the chat so no space is wasted."

---

## Setup

1. Download the zip and unzip it. Open **`game/tallow-reach.html`** — that one file is the whole game.
2. **Window 1 (host):** a normal window with your usual save.
3. **Window 2 (guest 1):** an incognito/private window — its own save, its own pilot.
4. **Window 3 (guest 2):** a *second* private window, or a different browser entirely. This is what the
   build is about; a second window of the **same** private window is the *same* pilot by design and will
   be retired with "This pilot was opened in another window".
5. All three: type a username on the title screen (3+ characters).

---

## Part A — the host offers a world

6. **Host:** **Open World** → fly a moment → **P** (pause) → **Open Multiplayer** → switch multiplayer
   **on**. If the room is quiet, wait up to ~12 s for the offer code. Press **Copy link**.
7. Paste the link into a note. **Both guests will use this one link** — that is the point.

**Pass:** the panel shows the link and the players list, and the host's chat (**Enter**) says the host is
alone.

## Part B — guest 1 arrives

8. **Guest 1:** title → **Join Multiplayer World** → paste the link → **Join** → **Bring my pilot** →
   **Enter** the world. Expect the notice that this is your own galaxy for now (drawing your friend's is
   slice 7).
9. **Host: Enter.** The chat opens with Pin and Players; the list shows the host and guest 1.
10. **Guest 1: Enter, type "one", Enter.** It appears on the host. The host's chat opens by itself if it
    had gone away.

**Pass:** the line arrives, and guest 1's own chat also stays up ~12 s after its own line.

## Part C — guest 2, the same link (the fix)

11. **Guest 2:** title → **Join Multiplayer World** → paste **the same link** → **Join** → **Bring my
    pilot** → **Enter** the world.
12. **Look at guest 1 immediately.** It must still be flying, with its chat working. It must **not** show
    anything about the pilot being opened elsewhere, and it must **not** be sent to a menu.

**Pass:** three pilots, no refusal. If guest 1 is retired, the fix failed — send me **Copy details** from
guest 1 and from the host.

13. **Host: Enter** → the players list has **three** rows (host, guest 1, guest 2), each a name you
    recognise.
14. **Each guest says a line.** Both guests' lines appear on the host, and the host's line appears on
    **both** guests.

**Pass:** a room of three talks in all directions.

## Part D — a refresh must not lock anybody out

15. **Guest 1: refresh the page** (F5). Join the same link again (**Join** → **Bring my pilot**).
16. **Pass:** guest 1 is let in as the **same pilot** again. There must be no *"That link has already
    been used, or it was copied wrongly."* On the host, the players list still shows **three** rows, not
    four.

## Part E — one pilot, one window (unchanged on purpose)

17. On **guest 2**, open a second window of the **same** browser profile (not a new private window) and
    join the same link.
18. **Pass:** the newer window gets in, and the **older** one is told *"This pilot was opened in another
    window, which has it now."* and stops. This is the rule that stops two windows from flying one save;
    it is supposed to stay.

## Part F — the chat's column

19. **Host: Enter.** Look at the right side:
    - **Players** sits in a narrow column with **Pin** in a small button beside its heading, at the top.
      The gap between them is a few pixels, not a band; names are the same size as before and get shorter
      with `…` rather than widening the column.
    - **Pin is outlined** (amber text, transparent fill) and says **Pin**.
20. **Press Pin.** It fills **solid amber with black text** and still says **Pin**. The box stays open
    while you fly and while lines arrive.
21. **Press Escape (or click back into the flight view).** The lines stay (pinned) and the **Pin button
    and the players list both go**. The text now runs to the chat's own right edge — no dead strip.
22. **Press Enter.** Pin and Players come back, Pin still filled. Press Pin to unpin.

**Pass:** every step above matches, and the words on the button are always "Pin".

## Part G — a line arriving is quiet

23. **Host: unpin, press Escape** so the chat is gone. Ask a guest to say something.
24. **Pass:** the host's chat appears with the **lines only** — no Pin, no players list, no empty strip on
    the right — and takes itself away **about twelve seconds** later.
25. **Host: Enter, type, Enter** (your own line). The box stays for about **twelve seconds** from your own
    line, then goes.

## Part H — a busy room (optional, if you have the machines)

26. Add a third guest. Everything above still holds; if the players list has more than ten names, the last
    row says `+N more` instead of growing.

---

## What cannot be tested here

- **Your friend's world on your screen** is slice 7; a guest still stands in its own galaxy with a notice
  saying so, exactly as in `2026-11-24d`.
- **Lag** in a big room is the host's machine; nothing in the game limits it, which is the owner's call.
  If a room of three is smooth and a room of six is not, that is the hardware, and worth telling me as a
  measurement (how many pilots, what the host's machine is).
- The invitation is still not *checked* when a browser joins the room (a browser that knows the world id
  can join without the link). That is step 17's job and is recorded in `src/net/README.md`.

## If something is wrong

Send: the **step number**, **which window**, and **Copy details** from both the host and the affected
guest. For a wrong wording, paste the sentence exactly — the message names the object that failed, and
that is usually the whole diagnosis.
