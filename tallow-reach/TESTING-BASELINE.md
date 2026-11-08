# Testing: the 10-minute "is the whole game still fine?" check

Use this **before** you start a refactor step (to know the game works) and **after** it (to
prove nothing changed). It covers every system the game has today. If a step adds a feature, the
AI also gives you a step-specific checklist; this one is the safety net underneath.

**Setup:** in the project folder run `npm install` (once), then `npm test` (should say all tests
pass; the number is in `docs/HANDOFF.md`) and `npm run build`. Open `game/tallow-reach.html`. If the
intro shows, click **Enter the hangar**. Use a **new game** (Saves tab) the first time, and keep a
second run with an **old save** to check old saves still load.

Write down anything odd with what you did, what you expected and what happened. Send that to the AI.

## A. Launch and fly (2 min)

1. Click **Contracts**, accept any contract, then launch. You appear 200 m from the outpost
   looking at the asteroid field. The top-left shows **Shield HP**, **Hull HP** and **Boost**, and
   the bottom centre shows the power block.
2. Mouse steers; **W** speeds up, **S** slows, **X** stops, **A/D** strafe, **Space/C** up/down,
   **Q/E** roll, **Shift** boost. The ship should feel heavy and smooth, the same as before.
3. Hold **Left Alt** and move the mouse: the free camera orbits. Release: it returns.
4. Press **P**: the pause menu opens and the game freezes. Press **P** again: it resumes.

## B. Mine and fight (3 min)

1. Fly to the asteroid field (about 2 km away). Press **F** near a rock to target it.
2. If you own the mining beam, press **2**, aim at a rock and hold left click: a bar fills and an
   ore is banked every 4 seconds (a chime plays). Press **1** to go back to the cannons.
3. Wait for a **Newbie Raider** (a dark ship). Target it with **F**, shoot it with left click.
   It dies after about 10 hits; crates drop. Fly into a crate to pick it up.
4. Get shot a few times: Shield HP drops first, then Hull HP.
5. If you own missiles: hold the target inside the dashed ring until it locks, right click.

**Sounding right (step 6a).** The game should sound exactly as it did. Ten sounds, and each one
should arrive at the moment described — nothing missing, nothing doubled:

| What you do | What you hear |
| --- | --- |
| Left click with cannons fitted | a short falling blip, about three a second |
| **Shift** boost igniting (a full tank) | a soft exhaust gulp, once |
| An ore banked while mining | a rising three-note chime, once per ore |
| Fly into a loot crate | a quick two-note pickup pip |
| Take a hit from a raider | a sharp noise burst, once per hit |
| A raider fires close to you | a low sawtooth zap, from them, not you |
| A ship or rock explodes | a rumble — loud ones only; small puffs are silent |
| Missile lock completes | two pips, a beat apart |
| Right click to launch a missile | a hiss and a falling growl |
| Press **M** to warp | a rising whine, then an arrival slam and shimmer |

Mute (**P**, then the sound button) still silences all of it.

**Still flying the same (step 6b).** The controls were re-wired so the game reads a *control record*
instead of the keyboard directly. Every key must still do exactly what it did — this is the check:

| Key or mouse | Must do |
| --- | --- |
| **W** / **S** | throttle up / down (the bar-less feel is unchanged: heavy, smooth) |
| **X** | throttle snaps to zero |
| **Ctrl** (held) | throttle bleeds off |
| **A** / **D** | strafe left / right |
| **Space** / **C** | lift up / down |
| **Q** / **E** | roll left / right |
| **Shift** | boost (snaps the throttle to full once, then the tank drains) |
| Mouse | steers; **Left Alt** + mouse orbits the camera and releasing returns it |
| Left click | guns (or the beam, on slot 2) |
| Right click | missiles, and the dashed lock ring must be the **same size as before** |

Two things worth a close look, because they are the parts that genuinely moved:

1. **The missile lock ring.** Fit a missile launcher, point at a raider until it locks: the dashed
   ring should be exactly the size it was, and it should still disappear while warping. Try it in a
   **small browser window** and a maximised one — the ring scales with the window, as before.
2. **Free camera.** Hold **Left Alt**, orbit, let go. Then hold **Left Alt** and resize the window,
   or click into another window while a key is held: the ship must **stop** responding when the
   window loses focus (a small improvement — before, a held key could stick).

## C. Warp (1 min)

1. Press **M**: about two seconds of warp effect, then the message names the new sector
   (Kestrel Hollow, empty). Press **M** again to come back to Tallow Reach.

## D. Dock, sell, repair, fit (3 min)

1. Fly back within 300 m of the outpost and press **G**. The outpost panel opens.
2. **Inventory** tab: ore you mined is in the ship's hold; move it to the station and sell it
   (right click a stack, **Sell**). Credits go up.
3. **Contracts**: finish a contract if you completed one; you are paid.
4. **Outfitting**: the 3D ship shows; click a bay, swap a module, click again to unequip it and
   see it in storage.
5. **Shop**: buy something cheap (if you have the credits). **Base**: look only.
6. **Hangar**: check the ship list.

## E. Saves (1 min)

1. **Saves** tab: save to slot 1. Reload the browser page, then load slot 1. Credits, ship and
   fitted modules are as you left them.
2. Click **Export**, copy the code, load it again with the import box.
3. Load an **old save** from before the step (if you have one): it loads, nothing is missing.

## F. Lose a ship (optional, 1 min)

Take the hull module off in Outfitting, launch, and let a raider shoot you once: the ship is
destroyed, cargo is lost, a recovery fee is charged, and you are back at the outpost in another ship.

**Pass:** every item above behaves as written, and `npm test` is green.
