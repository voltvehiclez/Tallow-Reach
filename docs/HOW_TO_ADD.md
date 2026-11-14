# How to add things to Tallow Reach

> **These recipes describe the code as it is today.** Several will change during the refactor in
> [REFACTOR_PLAN.md](REFACTOR_PLAN.md): enemies (recipe 6) became data in step 1, loot in step 3,
> items in step 4; shops (4, 17) became data in step 5; places (14) in steps 10 to 12; missions and
> story (3, 11) in steps 13 to 15. A step that changes a recipe must rewrite it in the same change.
> If a recipe here says "do the refactor first", check [ROADMAP.md](ROADMAP.md) to see whether that
> step is done.


Step-by-step recipes for the common kinds of change. Read
[ARCHITECTURE.md](ARCHITECTURE.md) first for the layers and conventions.

Each recipe says how much work it really is:

- **Data only**: edit a table, nothing else.
- **Data + small code**: a table entry plus a few lines elsewhere.
- **New system**: new files. Do these one at a time.

`npm test` checks the data tables (`tests/content.test.mjs`), so a missing field or a
forgotten second place usually fails the tests with a message saying what to fix.

---

## Before every change (checklist)

1. Read the `README.md` in each `src/` folder you will touch.
2. Make the change in `src/`. Never edit `game/tallow-reach.html` (it is generated).
3. Did the saved data change? Follow "Save compatibility" in ARCHITECTURE.md.
4. Add or update a test if the change has rules that can break.
5. Add a short entry at the top of `docs/CHANGELOG.md`. If that leaves more than 10 full entries in
   it, move the oldest ones to `docs/CHANGELOG_ARCHIVE.md` so 10 remain, and add one index
   line for each at the top of the "Older entries" list (see "Keeping the docs scalable" in
   ARCHITECTURE.md). Never delete history.
6. Tell the user to run `npm run build` and `npm test`, and give them test steps.

---

## The recipes

Open only the recipe you need. Each one is a separate file in `docs/recipes/`; the numbers are stable
(other docs refer to "recipe 11" and so on), and new recipes get the next number.

| # | Recipe | Kind of work |
| --- | --- | --- |
| 1 | [A new ship](recipes/01-a-new-ship.md) | data only |
| 2 | [A new item: ore, salvage, mission object or trade good](recipes/02-a-new-item-ore-salvage-mission.md) | data only |
| 3 | [A new contract type](recipes/03-a-new-contract-type.md) | data + small code |
| 4 | [Something a shop sells, or a new trader](recipes/04-something-a-shop-sells-or-a.md) | data only |
| 5 | [A new base module](recipes/05-a-new-base-module.md) | data + small code |
| 6 | [A new enemy type](recipes/06-a-new-enemy-type.md) | data only, plus at most one behaviour function |
| 7 | [A new outpost screen](recipes/07-a-new-outpost-screen.md) | tab |
| 8 | [A new key binding, a new control, or an in-flight action](recipes/08-a-new-key-binding-a-new.md) |  |
| 9 | [A new sound](recipes/09-a-new-sound.md) | data + two lines |
| 10 | [A new event and a listener](recipes/10-a-new-event-and-a-listener.md) |  |
| 11 | [Story and scripted missions](recipes/11-story-and-scripted-missions.md) |  |
| 12 | [Seeded sectors and daily challenges](recipes/12-seeded-sectors-and-daily-challenges.md) |  |
| 13 | [Tuning only](recipes/13-tuning-only.md) |  |
| 14 | [A new pocket or system](recipes/14-a-new-pocket-or-system.md) | data only |
| 15 | [A new module group on the Outfitting screen](recipes/15-a-new-module-group-on-the.md) | data only |
| 16 | [A new module](recipes/16-a-new-module.md) | data + the stat it feeds |
| 17 | [A better part: a new tier of module, on sale](recipes/17-a-better-part-a-new-tier.md) | data only |
| 18 | [What something drops, or what a rock is made of](recipes/18-what-something-drops-or-what-a.md) | data only |
| 19 | [A new kind of thing in the world](recipes/19-a-new-kind-of-thing-in.md) | a new entity kind |
| 20 | [Edit the starmap web and travel rules](recipes/20-edit-the-starmap-web-and-travel.md) | steps 11A/11B |
| 21 | [Add a place-template encounter](recipes/21-add-a-place-template-encounter.md) | Step 12 |
| 22 | [A new rift, instance or wormhole run](recipes/22-a-new-rift-or-instance.md) | data only; a new rule or sky kind needs one function |
