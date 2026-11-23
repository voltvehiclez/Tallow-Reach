# Quick playtest — slice 4 (build 2026-11-23a)

10 minutes. Two browsers (one normal, one incognito). Everything below is a thing to **look at**, not just press.

## Get the build

1. Download the .zip (link in chat).
2. Unzip it. Open the folder `game/` and **double-click `tallow-reach.html`**. That's the whole game — one file, no install.

## Part 1 — host (5 min)

1. Type a username. Press **Open World**.
2. Press **P** → **Open Multiplayer** → switch multiplayer **on**.
3. You have a join link. Copy it.

## Part 2 — guest: join, then bring the pilot

1. Other browser: username → **Join Multiplayer World** → paste the link → **Join**.
2. **Before you press anything else**, quit to the title screen. You should get the **normal menu** — because joining alone does not move your pilot. Go back in.
3. Press **Bring my pilot**.

**Look for:** a notice saying your pilot is on its way. Press it a second time — it should say the pilot is already here and send nothing.

### The number that matters

On the **host**, dock (press **G**) and note the **station stock** for one item. The guest's lockers should be there — the same stacks, **moved, not new ones**. Write the number down.

## Part 3 — the one to test properly

1. **Close the host's browser completely.**
2. Guest: quit to the **title screen**.
3. You should now see a **card**: *"Your pilot is in Ada's world"* with **Rejoin** and **Bring pilot home**.
4. Press **Bring pilot home**.

**Look for:** the card disappears, the normal menu returns, and your credits / hold / station lockers are all back — **the same number you wrote down in part 2**. Not double, not short.

## Part 4 — the four things this build fixes (2 minutes)

1. **Close the guest's browser (don't press Leave).** On the host: the name should vanish from the players
   list, the chat should say *"Bo left."*, and if the guest had brought its pilot, its ship should go.
2. **Guest: join the same world again** with a fresh link. It should get in — before this build it was
   refused, because its old record still held the previous token.
3. **Guest rejoins with the pilot still away.** You should stay on the title card with a message, *not*
   be dropped into your own world.
4. **Test Ship** (buy it at Meridian's shop): it should be the new model — centred in the frame, no
   offset shadow of a camera.

## Two extras worth 30 seconds

- On the card, press **Open World** *first* without bringing the pilot home. It should refuse and keep you on the card, not put you in a cockpit.
- If you have a lot of cargo (a holdful), try bringing the pilot with it. Over 256 KB is refused **in words** and your pilot stays home with everything.

## Don't report these — they're the next slices

- **You cannot see your friend's ship.** The visiting pilot is real, docked and simulated, but the screen still draws one hull (slice 7/8).
- No crash/reconnect screens (slice 5), no trading (slice 6).

## If something's wrong

Tell me the **item, the amount before, and the amount after**. I can reproduce the arithmetic from three numbers; "cargo looks wrong" I cannot.
