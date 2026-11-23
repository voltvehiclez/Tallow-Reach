# Testing playtest 15: the away card, coming home, and Rejoin

**Build: `2026-11-23c`.** Unzip the new download and open `game/tallow-reach.html` on **both**
machines. The build id is on the multiplayer screen — if the two differ, note it.

You reported a laptop that:

1. opened straight onto the **"Your pilot is in a friend's world"** card,
2. hit **"Your pilot's save could not be read, so it cannot come home yet"** on **Bring pilot home**,
3. hit **"Your pilot is already visiting another world, bring it home first"** on **Rejoin**,
4. and stayed stuck there through a refresh — in both Brave and Chrome.

All four were the same two mistakes, and neither had anything to do with your laptop, your
browsers, or the network. **Your save was fine the whole time.** Nothing was lost.

---

## What was actually wrong (plain language)

- The button that brings your pilot home was asking for a **different kind of record** than the one
  the title screen keeps. It got "nothing" back, and reported that as "your save could not be read".
  It could not have worked on any machine, in any browser, ever.
- The **Rejoin** button asked to reconnect to the world your pilot is *already in*, and was refused
  by the rule that stops a pilot being in two worlds at once. It was refusing the thing it exists for.
- **Bring pilot home** disconnected you *first* and opened the suitcase *second*. So when it failed,
  you lost the connection too — which is why the laptop vanished from the host's players list while
  the card stayed.

---

## The test, in order

You need the **host PC** and the **laptop**. Use the *same* browser on each if you can, so a browser
difference cannot be mistaken for a bug.

### 0. The laptop is already stuck — this build should release it

1. On the laptop, open the new build. You will probably still be on the away card.
2. Press **Bring pilot home**.
3. **Expect:** it works, and the card goes away — you are at the main menu, with your ship, credits
   and cargo as they were before the visit.

That alone is the headline fix. Everything below is the rest of the round trip.

### 1. Host, then guest

1. Host PC: **Multiplayer → turn it on → Copy link**.
2. Laptop: paste the link → **Join**. Look around. **Expect:** you are in, and your own pilot is
   **not** frozen (you can still see your own galaxy when you go back to the menu).
3. Laptop: press **Bring my pilot**. **Expect:** a line saying your pilot is on its way, and the host's
   player list keeps your name.

### 2. Leave the laptop alone for a minute, then refresh it

1. Refresh the laptop. **Expect:** the away card, naming the host's world. That is correct — the pilot
   really is visiting.
2. Press **Rejoin**. **Expect:** you reconnect, and the card does **not** say "bring it home first".
   This is the button that used to contradict itself.

### 3. Come home, properly

1. Go back to the title (pause → Main menu, or refresh).
2. Press **Bring pilot home**. **Expect:** your pilot is home, at the main menu, with a sentence naming
   the host.
3. **Check your station lockers** — every stack you left at your station should be there, once. If a
   stack was bought in the host's world, it comes home to the station it came from (or waits at
   Meridian if your world has no such station).
4. **Expect:** the host's player list drops your row within a few seconds. That is correct: the pilot
   left the world on purpose.

### 4. The thing that must not break

Join the host's world again and press **Bring my pilot home** *without* ever pressing **Bring my
pilot**. **Expect:** it still lets you go — a pilot that never travelled is already home, and the card
must never trap you for that.

---

## If something is still wrong

The message matters more than the symptom this time. Tell me **the exact sentence** the screen shows,
and which of these you pressed:

- **Bring pilot home** → *"Your pilot's save could not be read"* means the shape bug is back.
- **Rejoin** → *"already visiting another world"* means the guard is back.
- Anything about **the host** or **the relay** is a different, real network problem — paste the
  Connection details panel from **More details**.

Do **not** press Reset. Nothing in this playtest needs it.
