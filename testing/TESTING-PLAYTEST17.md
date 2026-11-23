# Testing playtest 17: the join box, the card's door, and Bring pilot home

**Build: `2026-11-23g`.** Both machines, or one window plus a private window.

> **Check the build first.** The away card now prints its build at the bottom, and the
> multiplayer screen's **More details** prints it at the top. If either says anything other than
> **`2026-11-23g`**, the browser is running an older download — that, and not the code, is what
> made the card look like a dead end with a small "Main menu" box. Re-download, and check again.

Your five points, all in one build. Two were bugs I made, one was a message that made no sense,
one is now a deliberate placeholder, and one was your design and is now the design.

---

## 1. Join: the box stays, and asks

1. Host: **Multiplayer → on → Copy link**.
2. Guest: paste the link → **Join**.
3. **Expect:** the screen **does not** disappear into a world. The same box now says
   *"Connected to Ada's world. Choose what to do:"* with:

   - **Bring my pilot**
   - **Enter the world without my pilot**

4. Press **Bring my pilot**. **Expect:** *"Your pilot is on its way"*, and the box now offers
   **Enter the world**.
5. Press **Enter the world**. **Expect:** you load into your own galaxy, connected, chat live.

> There is no floating prompt in the corner any more. It was a workaround for the join screen
> closing; your ordering removed the cause, so it is gone.

### The other path

Join again (or Rejoin) and press **Enter the world without my pilot** straight away. **Expect:**
you are in your own galaxy, connected, and your pilot is **still at home** — go to the title and you
get the ordinary menu, not the away card.

## 2. The away card has a door

1. With your pilot away, go to the title. **Expect:** the away card.
2. **Expect** three buttons of the **same size**, one under another, filling the panel:
   **Rejoin**, **Bring pilot home**, **Main menu**. No small box hanging on the left.
3. Press **Main menu**. **Expect:** the ordinary menu appears. Your pilot is **still away** — the
   card comes back if you leave to a world and return to the title.
4. **Expect** nothing about your save changed: the pilot did not come home, and it did not leave.

## 2b. No username: the switch answers instead of doing nothing

1. Open **Open World → pause (P) → Open Multiplayer**, on a browser with **no username** set.
2. Press the **Multiplayer: Off** switch.
3. **Expect:** a popup: *"You need a username before multiplayer can be turned on…"*, and it says
   the username box is on the **main menu**. The switch stays **Off**.
4. Press **Exit to main menu** (bottom of the pause card), type a username at the top of the menu,
   come back in through the pause card. **Expect:** the switch works and opens your world.

## 3. Bring pilot home works from the card, with the host closed

1. **Close the host's browser completely.**
2. On the guest, title → away card → **Bring pilot home**.
3. **Expect:** your pilot is home, main menu, credits/hold/lockers exactly as they were.
4. If it still says anything about "bring it home from the card first", that is the bug from last
   round and I want the sentence.

## 4. Rejoin with the host gone

1. Host closed, on the away card, press **Rejoin**.
2. **Expect:** *"Ada is not there — their game is closed. Bring your pilot home below, or try again
   once they are back."* — not *"Connection cancelled"*.

## 5. What is still NOT shared (by design, this build)

Both players are in **their own** worlds; you share chat, the player list, and the pilot's save. You
will not see each other's ship. The wire has no position messages at all — that is slice 8
(the guest receiving the host's world), and slice 7 (the host seeing your visiting ship) comes first
because it is cheap and visible.

**That is what "Enter the world" is a placeholder for.** It loads your own galaxy so the UI is
testable.

---

## Report as bugs

- The join box vanishing into a world again.
- The card with no **Main menu**.
- **Bring pilot home** saying anything other than success with the host closed.
- A locker stack doubled or missing after coming home.
