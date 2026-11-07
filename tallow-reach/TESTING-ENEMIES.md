# Testing: enemies (refactor step 1)

**What this proves:** the raider is now an entry in a data file instead of code inside the game,
and it still behaves exactly as it did.

Do this after `npm test` (101 tests) and `npm run build`, with the game open. Use a save you do not
mind losing, or make one first with an **old save** loaded, to check old saves still work.

## A. The raider is unchanged (5 min)

1. Open **Contracts**, accept a **hunt** contract. It must read **"Destroy N pirate raiders"**
   (the same wording as before).
2. Launch and fly out past the asteroid field (about 2 km out) and wait. Raiders come in from
   about 800–1000 m away, close in fast, then circle you.
3. Target one with **F**. The marker must read **Newbie Raider 100%**.
4. Shoot it with the cannons (left click). It dies after about 10 hits, explodes, and drops
   **1–2 salvage crates**; sometimes a blue **reactor core** crate instead of one of them.
5. Check the contract progress went up by **one** for that kill (press **Esc** / open the panel
   and look at the active contract).
6. Let a raider shoot you: your **Shield HP** goes first, then **Hull HP**. Its shots still do
   **1 damage**.

If all of that is true, nothing about the enemy changed.

## B. The numbers really live in a data file (2 min, optional but it is the point of the step)

1. In the project folder, open `src/data/enemies.js` in any text editor.
2. Find the `raider` entry and change `hp: 10` to `hp: 30`. Save the file.
3. Run `npm run build`, reopen the game, and shoot a raider: it now takes about 30 hits.
4. Change `n: "Newbie Raider"` to `n: "Scrap Hound"` and save. Build and look at the **F** target
   marker: it says **Scrap Hound**.
5. Change `col: 0x3a2420` to `col: 0x2a4a8a` and the enemy is blue.
6. **Put all three back** (`hp: 10`, `n: "Newbie Raider"`, `col: 0x3a2420`), save and run
   `npm run build` again.

That is the whole point of the step: an enemy is an entry, not code. Never edit `src/sim/ai.js`
for numbers.

## C. Nothing else moved (optional)

Run [TESTING-BASELINE.md](TESTING-BASELINE.md) if you want the full whole-game check. It should
pass exactly as it did before this step.

## What to send back

Anything that differs from the list above, with what you did and what you saw. If A passes and you
did not do B or C, that is enough to accept the step.
