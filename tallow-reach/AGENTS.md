# Instructions for AI coding assistants (any model)

You are working on **Tallow Reach**, a three.js browser space sim. The owner **does not code**: you
are their programmer. Several different AI assistants work on this project in separate chats, and
none of you remembers earlier chats. **The docs are the memory.**

Before you change anything, read, in this order:

1. `docs/HANDOFF.md` : where the game is now, the owner's standing ground rules, how to test.
2. `docs/VISION.md` : the game being built (open world, campaign, co-op).
3. `docs/ROADMAP.md` : what is done, what is next.
4. `docs/ARCHITECTURE.md` (the code as it is) and `docs/TARGET_ARCHITECTURE.md` (where it must go).
5. `docs/HOW_TO_ADD.md` (recipes), the top of `docs/CHANGELOG.md`, and the `README.md` of each
   `src/` folder you will touch.

If the owner asks for a numbered **refactor step**, follow `docs/REFACTOR_PLAN.md`.

Non-negotiables (full list in `docs/HANDOFF.md`): plain ES modules and no new npm dependencies;
tuning numbers in `src/data/`; connect systems with the event bus; keep saves backward-compatible
(bump `SAVE_VERSION`, add a migration); do not change behaviour that was not asked for; never edit
`game/tallow-reach.html` (generated); add a `docs/CHANGELOG.md` entry for every change; deliver
complete files with full paths; end every reply that changes `src/` by telling the owner to run
`npm run build` and `npm test`. If you cannot run them, say so plainly.
