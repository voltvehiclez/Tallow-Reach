# Testing playtest 18: the away card, the menu, and the username box

**Build: `2026-11-23h`.** The away card prints its build at the bottom — if it does not say
`2026-11-23h`, you are on an older download and these checks will look wrong.

Two machines, or one window plus a private window. Host on one, guest on the other.

---

## 1. The main menu is the main menu again

1. Load the game with a pilot that is **away** (from a previous visit).
   **Expect: the ordinary main menu.** Username box, Campaign, Open World, Join Multiplayer World.
   **No** "Your pilot is in ..." card.
2. Press **Open World**.
   **Expect:** your own world opens. No card, no popup.

## 2. The card appears only when a newer copy is waiting

1. Guest joins the host's world, presses **Bring my pilot** (so the pilot really travels).
2. On the host, have the pilot **earn something** — sell an item, or take a contract that pays —
   so the copy on the host is ahead of the copy the guest holds.
   Wait ~5 seconds for the host to send the newer copy back.
3. On the guest: **Escape → Main menu**, then press **Open World**.
   **Expect:** the card *"Your pilot is in <host>'s world"*, **not** the world.
4. Press **Bring pilot home**.
   **Expect:** *"Your pilot is home."* and the ordinary menu. Press **Open World** again —
   **this time your world opens**, with the credits/items the pilot earned at your friend's.
5. Check one more thing: your **missions, story flags and station progress are unchanged** — the
   pilot came home with its belongings, not with somebody else's story.

## 3. No card when nothing is waiting (the trap from last time)

1. Guest joins the host's world and presses **Bring my pilot**, then **does nothing** there —
   no trading, no repairs, no contracts.
2. Guest: **Escape → Main menu → Open World**.
   **Expect:** **the card does NOT appear.** Your own world simply opens.

> If the card shows up here, it is being raised for nothing and the rule is wrong. Tell me.

## 4. Leaving a friend's world lands you somewhere ordinary

1. Guest is visiting. Press **Pause (P) → Open Multiplayer → the switch (reads On)**, or **Leave**.
   **Expect:** *"Left your friend's world."*
2. Close the screen, press **Escape → Exit to main menu**.
   **Expect: the ordinary menu.** Not the card.
3. Press **Open World**.
   **Expect:** your own world opens (see 2/3 above for the one case where the card is correct).

## 5. Rejoin is gone; joining is the menu's door

1. Look at the away card (raise it as in section 2).
   **Expect** exactly **two** buttons, full width: **Bring pilot home** and **Main menu**. No Rejoin.
2. Press **Main menu**. **Expect** the ordinary menu.
3. To go back to your friend's world: **Join Multiplayer World**, paste the link, **Join**.

## 6. The username box on the main menu

1. Look at the main menu.
   **Expect:** one box showing just **your name**, centred, no "Username:" label — the same width
   as Campaign / Open World underneath. Empty, it shows *your name* faintly in the middle.
2. Clear it, then press **Join Multiplayer World**.
   **Expect:** a popup asking for a username (at least 3 characters).

## 7. (Still worth a check) the switch without a username

1. Fresh browser, no username. **Open World → pause (P) → Open Multiplayer.**
2. Press the **Multiplayer: Off** switch.
   **Expect:** a popup saying you need a username, and that the box is on the main menu.

---

## What to report back

- Which section, and what you saw instead of the **Expect** line.
- The build string at the bottom of the away card (or in **More details** on the multiplayer
  screen), if anything looks older than it should.
