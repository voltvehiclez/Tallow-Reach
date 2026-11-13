# Recipe 15: A new module group on the Outfitting screen

> One of the step-by-step recipes indexed in [HOW_TO_ADD.md](../HOW_TO_ADD.md). Read the checklist there first.
> Kind of work: data only.


The Outfitting screen draws one card per entry in `MODULE_GROUPS`
(`src/data/outfitting.js`): a heading, a `filled / bays` count, one bay box per slot,
and the group's description. The list is split in half around the 3D ship, so the first
half sits on the left and the rest on the right. Nothing else needs to change.

1. Add `{ k, n, d, slots }` to `MODULE_GROUPS`: short id, name, one line about what the
   group decides, and how many bays. `npm test` fails if a field is missing, an id repeats,
   or a count is not a whole number of at least one.
2. Want a different number of bays on a big hull later? `slotsFor(g, shipId)` in the same
   file is the one place that decides it; the screen already asks through it.
3. The card look is `.mod` in `styles.css`. Every group uses it, so a new group matches
   the others without new CSS.

**Paint bays** are the same idea and live in the same file, as `APPEARANCE_SLOTS`
(`{ k, n }`). They are drawn by `appearanceHtml()` in `ui/screens.js`, always sit last in the
right-hand column under the hull group, and are clickable like module bays: the click rule is
`togglePaintPicker` in `ui/picker.js`, and the rectangle under the card is
`paintPickerHtml()`. It shows **No colours in storage** because no paint exists yet.

When paints arrive they need: a table of paints, a store in the save (the way
`profile.modules` holds spare parts), the list of stored colours drawn as squares inside
`paintPickerHtml`, a fitted paint per channel, and the counts in `appearanceHtml`. That is
save-format work, so bump `SAVE_VERSION` and add a migration as usual.

**Bay counts are per hull.** `SHIP_LAYOUTS` in the same file gives each hull its own
numbers; every hull is a copy of the Wasp's today. `layoutFor(id)` and `slotsFor(g, id)`
are the only readers, and a test fails if a hull is missing a group.

**Fitted modules** are saved in `profile.loadout[shipId][groupId]`, one entry per bay
(`null` = empty), written by `src/state/profile.js`. The power parts are fitted already;
see recipe 16 for adding another module and recipe 17 for putting one on sale.
