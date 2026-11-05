# How to add things to Tallow Reach

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
5. Add a short entry at the top of `docs/CHANGELOG.md`.
6. Tell the user to run `npm run build` and `npm test`, and give them test steps.

---

## 1. A new ship (data only)

File: `src/data/ships.js`. Copy an existing entry and give it a new key. All of these
fields are required (the test checks them): `n d spd cargo hull sh dmg mine turn sc price col`.

The Hangar, the purchase rules, repairs and saves all read `SHIPS`, so the new ship
appears automatically. It uses the standard hull model coloured by `col` and sized by `sc`.

Optional: a visible add-on (like the Prospector's drill) goes in `buildPlayerShip(id)` in
`src/render/models.js`.

## 2. A new cargo item or ore

- **Item that is only sold or carried** (data only): add it to `ITEM` in `src/data/items.js`
  (`n` name, `v` value). Cargo, storage, the Base screen and saves pick it up. Old saves
  load with 0 of it.
- **Something that has to be found.** Items do not appear on their own:
  - *Ore in asteroids*: `spawnAsteroid()` in `src/sim/asteroids.js` chooses the ore from a roll
    and sets the glow colour. Add a band to both.
  - *Loot in crates*: `updateCrates()` in `src/sim/combat.js` gives `salv` or `core` only.
  - *Mine contracts for the new ore*: add it to `MINE_ORES` in `src/data/contracts.js`.

## 3. A new contract type (data + small code)

Contracts count progress through events. Example: "Recover N reactor cores".

1. `src/data/contracts.js`
   - add `"cores"` to `CONTRACT_TYPES`
   - add a generator to `CONTRACT` that returns `{ n, r }` (count and reward in credits)
   - add a line to `DESCRIBE` (see the code below)
2. `src/sim/contracts.js`: add a listener at the bottom (see the code below).
3. The board, the saved-game loader and the Contracts screen read the list, so no other file needs the type.

```js
// src/data/contracts.js
export const CONTRACT_TYPES = ["mine", "hunt", "salvage", "cores"];
// ... inside CONTRACT:
cores: tier => {
  const n = 1 + tier;
  return { n, r: n * 400 + 100 * tier };
},
// ... inside DESCRIBE:
cores: m => `Recover ${m.n} reactor cores`,

// src/sim/contracts.js (bottom of the file)
on("pickup", ({ item }) => progress("cores", () => item === "core"));
```

Making the thing *exist in the world* is separate code. Hunt contracts get raiders from
the spawner in `sim/ai.js`. Salvage crates are placed in `launch()` in `sim/session.js`.

Which events can drive progress: `mined`, `pickup`, `pirate-killed`, `docked`, `launched`
(payloads are listed at the top of `src/util/events.js`).

## 4. A new shop weapon (data + real code)

Adding to `SHOP_WEAPONS` in `src/data/weapons.js` makes it appear in the Shop and be
purchasable, but **it will not do anything** until code uses it:

- `buyWeapon()` in `sim/economy.js` has a message for the beam and the missile launcher only
- firing and switching are in `sim/weapons.js` (`setWeapon`, the primary and missile updates)
- the HUD line in `ui/hud.js` names the equipped weapon
- the weapon flag lives in `profile.wp`; `sanitizeProfile` keeps unknown flags

Plan it as a small system: data entry, flag, firing code, HUD text, test.

## 5. A new base module (data + small code)

1. `src/data/station.js`: add the module to `BASE_MODULES` (`n d max cost`) and give it a
   starting level in `BASE_DEFAULT`.
2. `src/state/profile.js`: add it to the `s.base = { ... }` block in `sanitizeProfile` so the
   level survives saving. Raise `SAVE_VERSION` and add a "Version history" line.
3. Give it an effect. The Base screen and `upgradeBase()` are generic, but a module does
   nothing until some rule reads its level (as `storageCap()` and `valueOf()` in `sim/economy.js` do).
4. The content test fails if step 2 is forgotten.

## 6. A new enemy type (new system, do the refactor first)

Today there is one raider and its numbers sit inside `sim/ai.js`.

1. Create `src/data/enemies.js` with a table like `ENEMY = { pirate: { hp: 70, hpPerTier: 25, speedFar: 125, ... } }`
   and move the constants from the top of `sim/ai.js` and from `spawnPirate` into it. Behaviour must not change. Test by playing a hunt contract.
2. Give each spawned enemy a `kind` field and read its numbers from `ENEMY[kind]`.
3. Emit `emit("pirate-killed", { kind })` from `killHostile` in `sim/combat.js` and add the payload to the event list in `util/events.js`.
4. Add the new type to the table, and a spawn rule in the spawner at the bottom of `updateEnemies`.
5. Models: `mkShip(color, scale, foe)` in `render/models.js`.

## 7. A new outpost screen (tab)

1. `src/ui/screens.js`: add `["x", "Name"]` to `TABS`, write `function nameHtml(ui)` that returns an HTML string, and list it in `SCREENS` under the same key.
2. Buttons in that HTML carry `data-a="actionName"` and optionally `data-b="argument"`.
3. `src/ui/menu.js`: add each action to `ACTIONS`. It can call a sim function and `toast("message")`.
4. If the screen shows saved data, see "Save compatibility".

## 8. A new key binding or in-flight action

1. `src/core/input.js`: add `KeyX: "actionName"` to `BINDINGS`.
2. `src/main.js`: add `case "actionName":` in the `on("action", ...)` handler. `playing` is true only while flying and not paused.
3. Mention the key in the hint in `src/index.html` and the controls text in `src/ui/screens.js`.

## 9. A new sound

`src/core/audio.js`: build it from `tone(f1, f2, duration, volume, wave)` and `nz(duration, filterFreq, volume)`,
and call it from the system that needs it. Mute and pause are handled for you. Sound is switched on and off only from the pause menu.

## 10. A new event and a listener

1. `emit("name", payload)` where it happens (the sim layer).
2. Add `name  payload  description` to the list at the top of `src/util/events.js`.
3. Listen with `on("name", handler)` wherever it is needed. Listeners must not import the emitter.

## 11. Story and scripted missions (new system)

There is no story system yet. Recommended shape, so it fits the current design:

- `src/data/story.js`: the chapters as data. Each step has an `id`, a `when` event (`"docked"`, `"pirate-killed"`, ...),
  an optional condition, the text to show, and an optional reward.
- `src/sim/story.js`: subscribes with `on(...)`, advances the player's step, shows text with `msg()`,
  and pays rewards through the profile. Keep its imports to `util/events.js`, `data/`, and `state/` so it can be tested without any 3D.
- Saved progress: a new `profile.story = { step: 0, flags: {} }`. That is a save change:
  default in `newProfile`, validate in `sanitizeProfile`, bump `SAVE_VERSION`.
- Show it: a "Log" tab (recipe 7) that lists unlocked entries.
- Test: build a state, `emit` the events in order, check the step advances (`tests/story.test.mjs`).
- Keep it separate from `profile.mission`. That slot holds the one active contract.

## 12. Seeded sectors and daily challenges (needs one cleanup first)

Some randomness ignores the seed. See "Known gaps" in ARCHITECTURE.md. First replace the
`Math.random()` calls in `sim/ai.js`, `sim/combat.js` and `sim/asteroids.js` with `random()` from `util/rng.js`,
then call `setSeed(n)` at the start of a run.

## 13. Tuning only

Change numbers in `src/data/`. Run `npm test`, rebuild, and play for a minute.
