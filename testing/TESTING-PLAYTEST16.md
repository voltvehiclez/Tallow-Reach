# Testing playtest 16: the pilot follows you into your friend's world

**Build: `2026-11-23d`.** Unzip on **both** machines and open `game/tallow-reach.html`. The build
id is on the multiplayer screen — if the two differ, note it.

You reported two things, and they had the same cause:

1. Joining a friend's world **joined you straight in** and the **Bring my pilot** prompt was never
   offered — you played a whole session with no pilot in it.
2. **Open World** afterwards did not warn you either; it went straight in.

### What was wrong

The **Bring my pilot** button lived on the *join screen*. Joining successfully **closes that screen
and enters the world** — so the button was destroyed by the very thing it was supposed to follow.
It was never on screen at the moment you needed it. And when you clicked it fast enough to beat the
join, it won the race: it packed your pilot, then the world-loading code saw an away pilot and bailed
out to the away card.

**Open World** had a different bug: it tried to bring your pilot home *silently* on the way in, and
carried on regardless. Your instruction: refuse, and leave the card up.

**Rejoin** connected (the host's list showed your name) but left you on the card with a sentence —
so a rejoin that worked looked exactly like one that did not.

---

## The test, in order

### 1. The prompt now appears inside the world

1. Host PC: **Multiplayer → on → Copy link**.
2. Laptop: paste the link → **Join**.
3. **Expect:** you drop into their world as before, **and** a card appears in the **bottom right**
   saying *Bring my pilot*, with **Not now** underneath it.
4. Press **Not now**. **Expect:** the card goes and the world keeps running. You are just looking
   around; your own galaxy is **not** paused and your pilot has not travelled.

> The card is not a modal on purpose — looking around and chatting without travelling is allowed.

### 2. The press must actually work

1. Join again (or press **Rejoin** — see step 4).
2. Press **Bring my pilot**.
3. **Expect:** *"Your pilot is on its way"*, and the card **disappears by itself**. That is the
   signal the pilot really crossed.
4. Host's player list: your name should stay there.

### 3. Open World refuses while your pilot is away

1. Go back to the title (pause → Main menu).
2. **Expect:** the away card — *"Your pilot is in Ada's world"*.
3. If you can get behind it, press **Open World**. **Expect:** it does **not** open; it says
   *"Your pilot is in your friend's world. Bring it home from the card first."* and the card stays.

### 4. Rejoin must show you something

1. On the away card, press **Rejoin**.
2. **Expect:** you reconnect **and the multiplayer screen opens** on top, showing the players and the
   chat, with *"Rejoined Ada's world"* on it.
3. **Expect:** the host's list shows your name again. Nothing about your own galaxy started.
4. Press **Leave** on that screen — you are back on the card, still visiting.

### 5. Coming home still works (the playtest-15 fix, re-checked)

1. Away card → **Bring pilot home**.
2. **Expect:** main menu, pilot home, station lockers back exactly once.

---

## What "correct" looks like, in one line

**Joining shows you the world and asks; Open World refuses while you are away; Rejoin opens
something you can see.** If any of those three is not true, tell me which step and what the screen
said — the sentence is the useful part.

**Do not press Reset.** Nothing in this playtest needs it.
