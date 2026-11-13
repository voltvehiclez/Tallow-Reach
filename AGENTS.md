# Instructions for AI coding assistants (any model)

You are working on **Tallow Reach**, a three.js browser space sim. The owner **does not code**: you
are their programmer. Several different AI assistants work on this project in separate chats, and
none of you remembers earlier chats. **The docs are the memory.**

Before you change anything, read:

1. `docs/HANDOFF.md`: where the game is now, the owner's standing rules, and a table saying which docs to
   read for which task. **Do not read every doc**; read what your task needs.
2. `docs/LESSONS.md`: classes of bug earlier chats hit, so you do not repeat them.
3. For missions, dialogue or triggers: `docs/MISSION_RULES.md` (mandatory).
4. The matching recipe in `docs/recipes/` (index: `docs/HOW_TO_ADD.md`) and the `README.md` of each `src/`
   folder you will touch. The newest entries of `docs/CHANGELOG.md` show what earlier chats changed.

When the owner reports a bug: reproduce it as a failing test, fix the root cause for the whole class, extend the
test, and add or update an entry in `docs/LESSONS.md`.

Non-negotiables (full list in `docs/HANDOFF.md`): plain ES modules and no new npm dependencies;
tuning numbers in `src/data/`; connect systems with the event bus; keep saves backward-compatible
(bump `SAVE_VERSION`, add a migration); do not change behaviour that was not asked for; never edit
`game/tallow-reach.html` (generated); add a `docs/CHANGELOG.md` entry for every change (it holds at most 10 full entries: move the oldest to
`docs/CHANGELOG_ARCHIVE.md` with an index line, never delete); deliver
complete files with full paths; end every reply that changes `src/` by telling the owner to run
`npm run build` and `npm test`. If you cannot run them, say so plainly.

Before writing or changing any mission, dialogue or trigger, read `docs/MISSION_RULES.md`. Missions must
behave the way they would in real life; build them from `src/data/missions/templates.js`, and make sure
`npm test` (the mission linter and invariant tests) passes.
