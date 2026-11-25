# Playtest — step 16, slice 8b's three reports

**Build: `2026-11-25f`** — both machines. Check it in **Connection details** (or the title card). A guest
and a host on different builds cannot be trusted to agree about anything.

Slice 8b itself passed: *"controls work, I can see that on the host pc I can make via the guest controls
the ship moves, rolls, shoots etc."* This build fixes the three things that flight turned up. Everything
else about 8b is unchanged — the guest still sees its **own** galaxy (8c) and its own ship is not
predicted yet (8d).

---

## 1 — A repaired pilot comes back repaired

*Was: repair your hull at home, rejoin, and the ship was still damaged — and the host was told "this
world kept its own".*

1. **Host** hosts, **guest** joins, **Bring my pilot**, and the guest takes some hull damage in flight
   (any rock will do).
2. **Guest**: **P** → **Open Multiplayer** → **Bring pilot home**.
3. **Guest**: open your own open world and **repair the hull** (station → **Repair**, as usual).
   Confirm the hull bar is full again *before* rejoining.
4. **Guest**: join the same link again, **Bring my pilot**.
5. **Host**: look at the friend's hull (the **F** lock shows its bars) and the chat.

**What to check:**

- The friend's ship arrives **with the repaired hull** — full, not the damage it had two minutes ago.
- The chat says the pilot **arrived**. Nothing says *"newer in this world than the copy that arrived;
  this world kept its own"*.
- Leave and rejoin once more without repairing anything: the copy still round-trips and nothing is lost.

**Worth trying while you are here:** buy something at a station at home (a module, some cargo) before
rejoining. It should be there on the host's screen too — same rule, one fix.

## 2 — The friend's hull is sharp while it flies

*Was: with the guest moving, any yaw or pitch by the host turned its hull and, most of all, its name tag
into a blur — worse the faster the guest flew. Only at high refresh rates.*

1. **Guest** joins, **Bring my pilot**, and flies at speed (boost, then a hard turn).
2. **Host**: keep the friend's hull on screen and **yaw and pitch slowly**, the way you would while
   tracking it.
3. Do the same with a nearby **NPC ship** and compare.

**What to check:**

- The friend's hull and its name tag stay **as sharp as an NPC's** — no smear, no double image, no
  stuttering shadow behind the model, at any speed.
- The only lag left is the honest one: the hull is drawn about **100 ms** behind where the guest pressed
  a key. That is the stream, not a blur.

## 3 — The chat can be read with the mouse

*Was: opening the chat with Enter and trying to select a line closed the box.*

1. **Enter** to open the chat (any session; a friend in the room helps).
2. **Drag across the conversation** to select a line or two, then **Ctrl+C**.
3. **Paste** into the reply field (or anywhere else) — the text comes out whole.
4. Click somewhere in the game world, then **Enter** again, and press **Esc**.

**What to check:**

- Selecting text in the conversation **does not close the box**, and a line that arrives while you are
  dragging does not wipe the selection.
- **Esc** while a selection is up closes the chat (it should not open the pause card).
- Clicking back **into the game** with an empty field closes the box, as before — and a half-written
  sentence still survives a stray click.
- A **glance** at a line that arrived by itself, and a **pinned** box, are readouts: their text is not
  selectable. Only the box you opened with Enter is.

---

## If something is wrong

- **The pilot still arrives damaged?** Check both builds say `2026-11-25f`, and that the repair was
  finished **before** pressing **Bring my pilot**. Then report: was the *guest's* own hull bar full at
  home when the pilot left?
- **Still blurry?** Say which screen you were watching and roughly how far away the friend's ship was.
  A blur that only appears beyond a few kilometres would be a different cause.
- **The chat closes on a click?** Say where the click was (the lines, the field, the game) and whether
  the box was pinned.

## What to report

**What you did, what you expected, what happened**, and the build string on **both** machines.
For anything about the hull, say which screen you were looking at (yours or the friend's). Screenshots
of both windows help most.
