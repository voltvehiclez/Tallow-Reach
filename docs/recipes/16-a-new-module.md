# Recipe 16: A new module

> One of the step-by-step recipes indexed in [HOW_TO_ADD.md](../HOW_TO_ADD.md). Read the checklist there first.
> Kind of work: data + the stat it feeds.


Modules live in `src/data/modules.js`:

```js
power_basic: { g: "power", n: "Basic powerplant", d: "Standard reactor.", mjps: 10 },
cell_basic:  { g: "cell",  n: "Basic power cell",  d: "Standard storage bank.", mj: 100 },
```

`g` is the module group it fits (`data/outfitting.js`), and the rest of the fields are the
stat that group uses: `mjps` for a powerplant, `mj` for a power cell, `spd`/`turn`/`draw`/
`boost`/`ign` for a thruster (top speed, turn rate, MJ/s while flying, extra MJ/s while the boost
burns, the flat MJ slug spent when the boost lights) plus `bmax`/`buse`/`bfill` for its boost tank
(units held, units a second burned while boosting, units a second refilled), and `sh`/`regen`/`delay`/`draw`/`drain` for shields
(Shield HP held, Shield HP a second while recharging, the seconds without a hit before recharging
starts again, the flat MJ/s they use while up, and the Shield HP a second they lose when the ship
cannot supply that), and `dmg`/`rate`/`bspd`/`draw` for a gun in a `primary` bay (damage a shot,
shots a second per barrel, bullet speed, MJ/s while the trigger is held) plus an optional `barrels`
for linked barrels fired side by side on every shot (default 1), and `period`/`range`/`draw` for a
beam in a `primary` bay (seconds of uninterrupted contact per ore before the hull's mine multiplier,
metres it reaches, MJ/s while cutting). Every module also needs `vol`, the m³ it takes up in a
ship's hold or in the station's storage (a whole number, at least 1). `npm test` checks the group
exists, the name and description are there, the volume is set, and the stat is a positive number.

1. Add the entry to `MODULES` — **and one line to `ITEMS` in `src/data/items.js`**:
   `beam_basic: { cat: "module", v: 540 }`. The `v` is what a **spare** one sells for: 60% of its
   shop price, never below 1 credit (a test checks the two agree, so set both together). A module is an item before it is a part, which is what lets it be
   carried, stored and moved like anything else; its name, volume and stats stay in `MODULES`.
   `npm test` names any module that has no item entry. Nothing appears in the world until it is
   fitted the usual way, and the Outfitting screen already names any module found in a bay.
2. A hull is delivered with `STOCK_FIT` (`data/modules.js`): group id -> module ids in bay
   order. Put the module there to make it standard issue, or in a Hangar purchase later.
3. Make the stat do something. Power is done: `sim/power.js` sums `mjps` and `mj` into
   `state.power`, and `ui/hud.js` draws it. A new kind of stat needs its own system the same
   way: read the fitted modules, keep the result in `state.*`, and let the UI read that.
   A module that *uses* power rather than making it reports its demand with
   `setDraw("<name>", mjps)` (`sim/power.js`) and asks `hasPower()` before it does its work, the
   way the thrusters do in `sim/player.js`, the shields in `sim/shield.js` and the guns in
   `sim/weapons.js`. A new name must also be added to `state.power.use` (see `state.js`).
4. If the module changes a number the ship already has (top speed, hull, shields), do not
   write it into `SHIPS`; compute the effective value where it is used so removing the
   module puts the ship back the way it was. Shields are the worked example: `sim/shield.js`
   turns the module into `state.shield`, and with the bay empty the ship simply has none.

5. **More primary weapons.** `cannon_basic` is the worked example of a gun: give the entry
   `dmg`, `rate`, `bspd` and `draw` (plus `barrels` if it fires linked bolts side by side) and
   `sim/guns.js` picks it up with no code change, because
   it reads every module in the `primary` group that has a `dmg`. Put it in `STOCK_FIT.primary`
   to make it standard issue, and it can go in either primary bay. A gun that behaves
   differently (burst fire, a shot that costs a slug of energy) needs its own field and a line
   in `updatePrimary()` in `sim/weapons.js`; nothing outside that file changes.

6. **Special kinds of shield.** A shield that behaves differently (for example one that keeps
   trickling back even under fire, at a reduced rate) is a new entry in `MODULES` with an extra
   field, say `live: 3` for Shield HP a second while being hit. `updateShield()` in
   `sim/shield.js` reads that field when it is there; the recharge delay, the cap and the HUD
   bar need no changes. Do not patch `sim/player.js` for it.
