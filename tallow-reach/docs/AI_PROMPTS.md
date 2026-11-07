# Working with an AI assistant on Tallow Reach

## Starting a new chat

This project is worked on by **different AI assistants** (Claude, ChatGPT, Gemini, Codex, Cursor...),
one chat at a time. None of them remembers anything: the docs in this folder are the only memory.
Every prompt below is written so any model can follow it.

1. Download the latest project zip and attach it to the new chat.
2. Paste the **Starter prompt** below, then describe what you want (a feature, a bug, or a
   **refactor step**, see further down).

The zip contains everything the assistant needs: the source code, the data files, the tests, and the guides in `docs/`. Don't attach `node_modules` (it is excluded from the zip anyway).

If a chat has a file size limit, you can delete the `game/` and `reference/` folders from the zip first. The assistant never needs them, because `game/tallow-reach.html` is rebuilt from `src/`.

If the chat can't open zip files, paste these in order: `docs/ARCHITECTURE.md`, `docs/HOW_TO_ADD.md`, the `README.md` of the folder you want changed, then the files the assistant asks for.

## Starter prompt (paste this first in any new chat)

```
I'm building a 3D space sim called Tallow Reach. I can't code myself, so
please give me complete files or exact find-and-replace edits, with full
file paths. Different AI assistants work on this project in separate chats and
none of you remembers earlier chats: the docs are the memory, so read them.

The attached zip is the whole project. Before changing anything, read:
- docs/HANDOFF.md (where the game is right now, and the standing rules)
- docs/VISION.md (the game I'm making: open world, campaign, co-op)
- docs/ROADMAP.md (what is done and what is next) and docs/TARGET_ARCHITECTURE.md
  (where the code is heading; build toward it, never deepen a listed "debt")
- docs/ARCHITECTURE.md (layers, where things live, conventions, known gaps)
- docs/HOW_TO_ADD.md (step-by-step recipes; use the one that matches my request)
- docs/CHANGELOG.md (what earlier chats changed: the newest entries, then a one-line index of
  every older one; open docs/CHANGELOG_ARCHIVE.md only if the index shows something relevant)
- the README.md in each src/ folder you will touch, and the file(s) relevant to my request

Ground rules:
- Keep the existing folders and conventions. Tuning numbers go in src/data/.
  Restructuring happens only as a numbered step in docs/REFACTOR_PLAN.md.
- Don't add npm dependencies. Plain ES modules only. The one planned exception is a small networking library for multiplayer, which will be added only at the multiplayer step in docs/REFACTOR_PLAN.md. If an AI thinks any other library is needed, it must stop, explain why, and ask me first.
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

If you cannot run `npm install`, `npm run build` or `npm test` in this chat, say so
plainly and tell me exactly what to run, rather than guessing the result.
At the end of a long chat, rewrite docs/HANDOFF.md and update docs/ROADMAP.md.

Reply with:
1. A short plan (which files change, and why)
2. The changes, one file at a time
3. Step-by-step testing instructions for me, written for a non-coder
4. Anything that might break and how I would notice
```

## Refactor step prompt (paste after the starter prompt)

The plan for reorganising the code is in `docs/REFACTOR_PLAN.md` (15 steps). Do them in order, one
per chat. Replace `<N>` and the title.

```
Do refactor step <N> ("<title>") from docs/REFACTOR_PLAN.md.
First read docs/VISION.md, docs/TARGET_ARCHITECTURE.md, docs/ROADMAP.md and the step itself.
This is a refactor: the game must play exactly the same afterwards.
Plan first, in plain language: what changes, whether to split it into slices that can each be
played, and which of my open questions in VISION.md you need answered. Then wait for my OK.
```

After the AI delivers: `npm run build`, `npm test`, play `TESTING-BASELINE.md` plus the step's own
checklist, load an old save. If it passes, zip the project as your new baseline.

## Content request prompt (after refactor Milestone A)

```
Add content, data only if possible: <what, in plain words>.
Use the registries in src/data/ (enemies, items, loot, modules, ships, shops). Don't change engine
code unless it is unavoidable; if it is, say why first. Add or update tests so npm test proves the
new entries are complete. Pick sensible numbers, put them in src/data/ and list them for me to tune.
```

## Using more than one AI

- **One chat edits the project at a time**, and always starts from the **latest zip**.
- Any AI can do any step. If a model cannot read zips or run commands, paste the docs and files it
  asks for and ask it for full files; you run the build and tests yourself.
- A model that says "tests pass" without being able to run them is guessing. Run `npm test` yourself.
- Reviewing: you can give one AI's change to another AI and ask "review this against
  docs/ARCHITECTURE.md and docs/TARGET_ARCHITECTURE.md; list rule violations only".
- The root files `AGENTS.md` and `CLAUDE.md` point tools that read them automatically
  (Codex, Claude Code, Cursor...) at these same docs.

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
