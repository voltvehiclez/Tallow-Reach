# Testing step 16 slice 3: the connection (one link, chat, the player list)

This is the slice where two browsers can **open a world, join it, and talk**. Nothing a pilot owns
crosses the wire yet: no ship, no credits, no cargo. That is on purpose — it means a bug here can
fail to connect, and cannot cost you anything.

You need **two windows** on one machine, or two machines. A phone on the same wifi works as the
second window (a hotspot or mobile data usually works too).

## Before you start

1. Run `npm run build`, then `npm test`. Both must pass. Then open the built
   `game/tallow-reach.html` (or the dev server, `node serve.mjs`).
2. In **both** windows: **Open World** from the title screen, so you are in the open world (not a
   campaign act — multiplayer is open world only).

## Part 1 — the switch and the name (one window)

1. Press **P** (or **Escape**) to open the pause card.
2. Find **Open Multiplayer** at the bottom of the card. It should read **Off**.
3. Type a username, then click the switch. It reads **On**, and a **Join link** appears.
4. Click **Copy link**. It should say **Copied**.
   - If the browser asks for clipboard permission, allow it. If it refuses, the button says
     *Select it, then copy* and the text is selected for you.
5. Close the card (**Resume**). The world should go back to running.

## Part 2 — host, then join (two windows)

1. **Window A** (the host): pause, make sure **Open Multiplayer: On** and the link is copied.
2. **Window B** (the guest): pause, type a **different** username, turn the switch **On**, paste the
   link into **Paste the host's link or code**, and press **Join**.
3. Watch the line under the panel in both windows. Within a few seconds it should say it is
   connecting, then connected.

**What "working" looks like**

- **Window A** gets a chat line: **"<name> joined."** and the guest's name appears in the panel's list.
- **Window B** gets **"Joined <host>'s world."**
- Both panels show the same list of players.

**If it does not connect**

- Give it ~20 seconds. The free relays are public and occasionally slow; the line under the panel
  says what it is waiting for.
- Try the fallback: in **Window A**, click **No broker? Paste codes**. An **offer code** appears;
  copy it into **Window B**'s paste box and press **Use a paste code**. Window B then shows an
  **answer code**: copy that back into **Window A**'s "Paste their answer code" and press
  **Connect**.

## Part 3 — chat

1. In either window, press **Enter**. A chat box should open at the **bottom left**, with the players
   listed above it.
2. Type a message and press **Enter**. It appears in both windows, under the sender's name.
3. **The important one:** while the box is open, type `wasdqaex` — the ship must **not** move, fire
   or change speed. Letters go into the message.
4. Press **Escape**. The box closes, and the normal keys work again (try W — the ship accelerates).
5. Open the box again, press **Escape**, and confirm the pause card did **not** open.

## Part 4 — a hosted world never pauses

1. With both windows connected, **Window A** presses **P**. The pause card opens — but the world
   behind it keeps running (watch a station's lights, or the clock: the world does not freeze).
2. Press **P** again to close the card. Nothing should jump or skip in an odd way.
3. In **Window B**, do the same. The world keeps running there too.
4. Stop hosting (turn **Open Multiplayer: Off**, or press **Leave** in the guest window). Pause
   behaves as before: **P** freezes the world again.

## Part 5 — leaving, and the two things to try to break

- Close **Window B**'s tab. Window A's panel should list the guest as gone (or stop showing it) and
  the chat should still work with nobody there (it will refuse to send — that is correct).
- Open the host's link in a **third** window **by pasting it into the address bar** of the built
  page. The game should ask "Join a multiplayer world with this link?" — **Cancel** must do nothing
  at all, and the link should not be offered again after a reload.
- While a campaign act is loaded, paste a join link: the game should say multiplayer is open world
  only.

## What is deliberately still missing (do not report as a bug)

- **No remote ship.** A guest is a name in the list, not a ship you can see or shoot.
- **No pilot travelling.** Credits, cargo and ships stay home; nothing is taken or given.
- **No trading, no "View docked players".**
- **A reload loses the connection.** Rejoining is slice 5.
- **Names are for show.** Two players with the same name are not confused with each other by the
  game (they are separate connections), but the `*`/`**` suffixes arrive with slice 4.

## If something goes wrong, what to send back

The line under the Open Multiplayer panel is the useful thing: it names the state
(`finding`, `connected`, `lost`) and, when it failed, why. Copy that sentence, plus which of the
steps above stopped working.
