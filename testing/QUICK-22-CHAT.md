# Quick test: playtest 22 (10 minutes)

**Build `2026-11-24f`.** You need **two** browser windows with separate saves: one normal window and one
incognito/private window. A **third** window (a second private window, or another browser) is what proves
the big fix — if you only have two, do Part B with a friend or skip to Part C.

If a step does not match, send me the step number and **Copy details** from both machines.

## Before you start

1. Download the zip, unzip it, and open **`game/tallow-reach.html`** in each window (that one file is the
   whole game — no server needed).
2. Every window: type a username on the title screen (3+ characters).

## Part A — the chat stops taking the screen (3 min)

3. **Host:** **Open World** → **P** (pause) → **Open Multiplayer** → switch multiplayer **on** →
   **Copy link**. Close the panel and fly.
4. **Guest:** title → **Join Multiplayer World** → paste the link → **Join** → **Bring my pilot**, then
   **Enter** the world.
5. **Host: press Enter.** The chat opens. **What you should see:**
   - On the right: **Players**, with **Pin** in a small button beside the heading at the top. The column
     is narrow now — the gap between "Players" and Pin is a few pixels, not a band of empty space.
   - **Pin is an outline**: amber text, transparent inside. Press it: it fills **solid amber with black
     text** and still says **Pin** (never "Pinned"). Names in the column are the same size as before,
     and get shorter with "…" instead of making the column wider.
6. **Host: press Escape** (or click back into the game) **while pinned.** The box stays (that is what
   pinning is for) and the **Pin button and the players list both disappear** — only the lines remain,
   using the full width down to the text edge. **Press Enter** again: both come back, Pin still filled.
   Press **Pin** once to unpin it.
7. **Guest: say something** (`Enter`, type, `Enter`). On the **host**, the chat opens **by itself**:
   lines only — **no Pin button, no players list, no empty strip** to the right of the text.
8. **Count it:** the box should stay up for about **12 seconds** after the last line, then go. Send a line
   **yourself** and watch your own box: also about 12 seconds from your own line.

## Part B — two guests, one link (4 min) — the big one

9. Send the **same link** to the second guest (window 3). Paste it, **Join**, **Bring my pilot**, enter
   the world.
10. **What you should see:** both guests are in, **nobody is kicked**. On the host, **Enter** → the
    players list shows **three** rows (host + both guests). On guest 1, nothing changed — its chat still
    works and it is still flying.
11. **Guest 1: say something.** Host sees it. **Guest 2: say something.** Host sees that too. Host says
    something: **both** guests see it.
12. **Guest 1: refresh the page** (F5), then join the same link again. It must be let in as the **same
    pilot** — no "That link has already been used, or it was copied wrongly".
13. If a guest has **two windows of the same browser** open on the same link, the older one is retired
    with "This pilot was opened in another window" — **that is intended** (one window per pilot). Two
    different browsers/private windows are two different pilots.

## Part C — no player cap, and nothing broken (2 min)

14. Bring a third guest if you can (another machine on the same link). Three guests, no refusal, and the
    players list keeps counting.
15. **Pin, then let it sit** for a minute while you fly: the chat stays, and new lines keep arriving.
    Unpin it and leave the chat alone: it hides itself and stays hidden until somebody speaks.
16. Fly for a minute with the chat closed. The view is not disturbed by a strip or a button.

## What to report

- The step number that looked wrong, on **which** window.
- For a connection problem: **P → Open multiplayer → Copy details** on both machines.
- Anything that says "already been used" — with the exact wording and which window.
