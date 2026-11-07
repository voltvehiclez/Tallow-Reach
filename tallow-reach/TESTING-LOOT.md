# Testing: loot (refactor step 3)

**What this proves:** what an enemy drops and what a rock is made of is now data, and the drops
themselves are unchanged.

Do this after `npm test` (118 tests) and `npm run build`. Nothing here is new to click — the point is
that it feels the same.

## A. Drops are unchanged (5 min)

1. Accept any contract, launch, and fly out to the asteroid field.
2. Kill **Newbie Raiders** until you have killed about ten of them.
3. For each kill you should see **1 or 2 brown salvage crates** — roughly half the kills give two.
4. About **one kill in ten** leaves a **blue reactor core crate** instead of a brown one, lying
   right where the ship exploded.
5. Fly into crates: the message says **Picked up Salvage** (brown) or **Picked up Reactor core**
   (blue), and your hold fills up. With a full hold you get **Cargo hold full** instead.
6. Target a crate with **F**: the marker reads **crate** or **reactor core**, as before.

## B. Rocks are unchanged (2 min)

1. Look at the rocks in the field, target a few with **F**.
2. The marker names the ore (**Ferrite**, **Cobalt** or **Voidite** rock). Most should be ferrite,
   some cobalt, and voidite is the rare one.
3. Mine one with the beam: the ore that banks is the type on the marker, and selling it at the
   outpost pays the same as before.

## C. Salvage contracts still work (1 min)

1. Accept a **salvage** contract, launch: crates are waiting in the field where they always were.
2. Pick them up; the contract progress goes up by one per crate.

## D. The drops really are data (2 min, optional — this is the point of the step)

1. Open `src/data/loot.js` in a text editor.
2. In the `raider` table, change the core line's `w: 0.1` to `w: 1`. Save.
3. Run `npm run build`, reopen the game, kill a raider: **every** kill now leaves a core crate.
4. Change the ore line `{ i: "ferrite", w: 62 }` to `w: 0` and rebuild: every rock is cobalt or
   voidite.
5. **Put both back** (`w: 0.1` and `w: 62`), save, and `npm run build` again.

## What to send back

Anything that differs from the list above, with what you did and what you saw. If A and B pass,
the step is accepted even if you skip C and D.
