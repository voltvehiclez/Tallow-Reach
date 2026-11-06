# Working with an AI assistant on Tallow Reach

## Starting a new chat

1. Download the latest project zip and attach it to the new chat.
2. Paste the **Starter prompt** below, then describe what you want.

The zip contains everything the assistant needs: the source code, the data files, the tests, and the guides in `docs/`. Don't attach `node_modules` (it is excluded from the zip anyway).

If a chat has a file size limit, you can delete the `game/` and `reference/` folders from the zip first. The assistant never needs them, because `game/tallow-reach.html` is rebuilt from `src/`.

If the chat can't open zip files, paste these in order: `docs/ARCHITECTURE.md`, `docs/HOW_TO_ADD.md`, the `README.md` of the folder you want changed, then the files the assistant asks for.

## Starter prompt (paste this first in any new chat)

```
I'm building a 3D space sim called Tallow Reach. I can't code myself, so
please give me complete files or exact find-and-replace edits, with full
file paths.

The attached zip is the whole project. Before changing anything, read:
- docs/ARCHITECTURE.md (layers, where things live, conventions, known gaps)
- docs/HOW_TO_ADD.md (step-by-step recipes; use the one that matches my request)
- docs/CHANGELOG.md (what earlier chats changed: the newest entries, then a one-line index of
  every older one; open docs/CHANGELOG_ARCHIVE.md only if the index shows something relevant)
- the README.md in each src/ folder you will touch, and the file(s) relevant to my request

Ground rules:
- Keep to the existing structure. Tuning numbers go in src/data/.
- Don't add npm dependencies. Plain ES modules only.
- Keep the save format backward-compatible. If you change saved data,
  bump SAVE_VERSION in src/state/profile.js and add a migration.
- Use the event bus (src/util/events.js) to connect systems rather than
  importing between them.
- Don't change behaviour I didn't ask about.
- Run `npm test` mentally or tell me which tests to add.
- Never edit game/tallow-reach.html. It is generated. End every reply that
  changes src/ by telling me to run `npm run build` (and `npm test`).
- Add a short entry at the top of docs/CHANGELOG.md for every change, and
  include it in the files you give me. If it then has more than 15 full
  entries, move the oldest to docs/CHANGELOG_ARCHIVE.md until 10 remain,
  add an index line for each, and include both files. Never delete history.

Reply with:
1. A short plan (which files change, and why)
2. The changes, one file at a time
3. Step-by-step testing instructions for me, written for a non-coder
4. Anything that might break and how I would notice
```

## Feature request template

Fill in the blanks. Plain language is fine.

```
FEATURE: <name>

WHAT THE PLAYER SEES/DOES:
<describe it as a player would, e.g. "When I destroy a pirate carrying
a reactor core, a gold beacon appears and I get 500 cr if I bring it home">

WHY (optional):
<the gameplay goal, e.g. "I want a reason to take risky contracts">

RULES AND NUMBERS:
<costs, rewards, ranges, timings. If unsure, say "pick sensible values
and put them in src/data/ so I can tune them">

SAVE DATA:
<does progress need to be remembered between sessions? yes / no / unsure>

DONE WHEN:
- <observable check 1, e.g. "the Shop lists the new item for 2,000 cr">
- <observable check 2>
```

## Good habits

- **One feature per request.** Smaller changes are easier to test and easier to undo.
- **Ask for a plan first** on anything big: "Give me a plan before any code."
- **Ask for a handoff at the end of a long chat:** "Rewrite docs/HANDOFF.md for the next chat." It replaces the memory the next chat will not have.
- **Keep the zip fresh.** After each round of changes, download a new zip, so the next chat starts from the latest code.
- **Report bugs the same way:** what you did, what you expected, what happened, and a screenshot if you can.

## Example

```
FEATURE: Daily contract board reset

WHAT THE PLAYER SEES/DOES:
The contract board changes every real-world day, so everyone gets the same
offers on a given date, and I can't just refresh until I get easy ones.

RULES AND NUMBERS:
Use today's date as the seed. Keep the Refresh button, but limit it to
3 refreshes per day.

SAVE DATA:
yes. Remember the date and refresh count.

DONE WHEN:
- Closing and reopening the game on the same day shows the same offers.
- The Refresh button stops working after 3 uses and shows a message.
- The next day the offers change.
```

## Notes for the developer

- The seeded RNG (`src/util/rng.js`, `setSeed`) and the contract generators already accept a random source, so a daily contract board is a small change. Seeding pirates, loot and asteroids needs a cleanup first (see "Known gaps" in `docs/ARCHITECTURE.md`).
- `npm test` runs the unit tests. Tests for new save fields belong in `tests/`.
