# Recipe 7: A new outpost screen

> One of the step-by-step recipes indexed in [HOW_TO_ADD.md](../HOW_TO_ADD.md). Read the checklist there first.
> Kind of work: tab.


1. `src/ui/screens.js`: add `["x", "Name"]` to `TABS`, write `function nameHtml(ui)` that returns an HTML string, and list it in `SCREENS` under the same key.
2. Buttons in that HTML carry `data-a="actionName"` and optionally `data-b="argument"`.
3. `src/ui/menu.js`: add each action to `ACTIONS`. It can call a sim function and `toast("message")`.
4. If the screen shows saved data, see "Save compatibility".
