# Playtest — step 16, slice 8b: the guest's controls reach its ship

**Build: `2026-11-25e`** — both machines. Check it in **Connection details** (or the title card); two
machines on different builds cannot be trusted to agree about anything.

*Read this before you start: in this slice the guest still sees **its own galaxy**, not yours. Slice 8c
is what puts your world on their screen, and slice 8d is what makes their own ship behave under their
own hands. So the thing to watch in **8b** is the **host's** screen: a friend's hull that used to sit
parked at its station now **launches and flies when they press the keys**.*

---

## Part 0 — The two-minute set-up (same as 8a)

1. **Host**: open the game, **Multiplayer** → **Host your world** → copy the link.
2. **Guest**: open the game, **Multiplayer** → paste the link → **Join**, wait for **100%**.
3. **Guest**: press **Bring my pilot**. On the host: *"Acey arrived at Meridian Station."*
4. **Host**: undock (**G** at the station) and stay in the pocket the visitor is parked in.

---

## Part 1 — The friend's hull launches

1. **Guest**: press **W** and hold it for a second or two.
2. **Host**: watch the parked hull.

**What to check:**

- The friend's hull **leaves the launch point** and moves away — nose first, with its engine glow.
- It keeps answering: the guest steers with the **mouse**, rolls with **Q**/**E**, boosts with
  **Shift**, and the hull on your screen does the same, about a tenth of a second behind.
- Let go of the keys: the hull **coasts** and slows, as your own ship does when you let go.

**Do not report:** that the guest cannot see your world, that their own screen shows their own galaxy,
or that their ship on their screen does not match. All three are the next two slices (8c, 8d).

## Part 2 — It stops when the guest stops

1. **Guest**: fly at speed, then **close the tab**.
2. **Host**: watch what the hull does.

**What to check:** a tab closed the ordinary way says goodbye, so the hull **goes at once** with a line
saying the pilot left. That is correct — nothing to report.

3. Then try the harder case: **Guest**: cut the connection instead of closing (turn the machine's Wi-Fi
   off, or force-quit the browser), with the ship at speed.
4. **Host**: watch for about half a second (the hull should not keep firing or hold its throttle into
   a rock — it coasts), and then for the loss of the peer.

**What to check:** a guest that simply **vanishes** is asked for nothing after about **0.4 s**, so the
hull coasts rather than flying on; the host then says the guest is gone (the visiting row and the chat)
and the hull is removed. No hull should keep thrusting forever after its pilot has disappeared.

## Part 3 — It is still a ship like any other

1. **Host**: shoot the flying visitor with the guns, then try a missile.
2. **Guest**: press **fire** (left mouse) while flying.

**What to check:**

- Your shots **stop on it** and its **shield/hull bars drop** on the **F** lock (playtest 23's rule).
- The guest's own **fire** puts bullets into your world — they come out of **its** nose and go where
  **it** is looking, not along your ship's nose. You will see the bolts, the muzzle flash and the hits.
- Ram it at speed: both hulls knock apart and both take damage, as before.

## Part 4 — Leaving and coming back still works

1. **Guest**: **P** → **Open Multiplayer** → **Bring pilot home**.
2. **Guest**: join the same link again, **Bring my pilot**.
3. **Guest**: press **W** again.

**What to check:** the hull **arrives parked** at the station again (a fresh arrival — it does not
resume mid-flight), and it **launches again** on the first key press. No error, no ghost hull, and the
pilot still comes home with everything it had.

---

## If you see nothing

- **Guest's keys do nothing on the host's screen?** Check both builds say `2026-11-25e`, and that the
  guest pressed **Bring my pilot** — a plain **Join** puts nobody in the world.
- **The friend's hull does not launch?** It launches on the first *asking* (thrust, strafe, lift, roll,
  boost or fire). Wiggling the mouse alone is a steer, which also counts — but a key that is not held
  when the message goes out asks for nothing.
- **The hull jumps or stutters?** It is drawn ~100 ms behind, interpolated, exactly as in 8a. A jump is
  a launch, a warp or a respawn.
- **The hull vanishes when the guest closes the tab?** Expected — a clean close says goodbye. The
  coasting behaviour in Part 2 needs a cut connection, not a closed tab.
- **The hull will not dock again?** Correct for this slice: a guest has no way to ask for a docking
  yet, so a launched visitor flies until it goes home. Docking, death and respawn are later work.

## What to report

**What you did, what you expected, what happened** — and, for anything about movement, *which* screen
you were looking at (yours or theirs) and whether the guest's keys were held at the time. Screenshots
of both windows help most. The build string on each machine is the first useful fact.
