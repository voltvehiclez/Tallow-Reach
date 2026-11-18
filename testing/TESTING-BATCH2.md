# Feature batch 2 — slices and playtests

## Slice 1 — flight UI (items 1, 12)

Implemented; owner playtest pending. Save v21 unchanged.

- All meters are bottom-up columns: Shield/Hull on the left, Power/Boost on the right.
  Hull keeps the previous inner-left X position; Power takes the previous Boost position.
  Both pairs have a tight matching gap. Numeric readings remain. Route stays top-left.
- Left Alt toggles orbit view. Key release/repeat does not toggle it. Blur, modal
  opening, pause, docking and warp reset it through the existing/reset paths.

Quick playtest:
1. Launch: confirm Shield / Hull — open centre — Power / Boost ordering, short labels
   and matching tight gaps. Check that Power drains vertically and retains its MJ reading.
2. Boost and take some shield/hull damage: columns drain/refill vertically; readings
   agree. Without a shield/boost pool, its column is empty and reads none.
3. Tap and release Left Alt: mouse orbits and wheel zooms. Tap again to return.
   Hold it: keyboard repeat must not flicker the camera.
4. Open inventory/map, pause, or switch browser tabs during orbit: camera exits
   cleanly. Test the layout at your usual window size and a smaller window.

## Slice 2 — navigation, aiming and motion (pending: items 2, 10, 11)

- N opens a clean list of every object in the current pocket. Keep detection/range
  filtering extensible for future ship/module sensors, but no range restriction now.
- Locked-enemy lead indicator for cannon/non-hitscan weapons, using enemy motion and
  projectile speed; not a misleading lead marker for hitscan beams.
- Speed must reflect displacement from moving-object pushes (including Meridian rings),
  without treating teleport/warp transitions as ordinary flight velocity.

## Slice 3 — shop, ships and assets (pending: items 3, 4, 5, 6)

- My Assets subtab in both station and flight inventory: browse stations containing
  owned stored items or hangared ships, then compact item/ship lists.
- Shop: compact one-line collapsible Ships, Modules, Ores, Loot groups; Modules has
  each module family (powerplants, cells, shields, primaries, secondaries, hulls, etc.).
  Every stocked item row has Buy at right and Buy Amount popup; support future ore/loot stock.
- Ships bought through Shop, not item inventory; stored/selected via Outfitting.
  Remove the separate Hangar UI. Need deliberate station-local ship ownership/save review.
- Right-click ship in Shop/Outfitting: unfitted hull HP, cargo and unique bonuses.
  Wasp: no bonus. Prospector: Wasp hull HP and 2x mining speed.
  Bulwark: 1.5x damage for all weapons. Keep fitting separate from base stats.

## Slice 4 — inventory interaction (pending: item 9)

- Left click picks up a stack; drop into any slot of any accessible open inventory,
  with persistent sorting. Right click while holding places one item in selected slot.
- Context menu Take Amount uses a quantity selector, putting that quantity in the
  held stack. Shift-left-click still transfers the whole stack.
- Stack All on every inventory UI. Review slot/stack save representation, cancellation,
  closing overlays and transaction safety so items cannot be lost or duplicated.

## Slice 5 — missions and station contract boards (pending: items 7, 8)

- Station mission-log progress for item requirements reflects currently available items,
  including reductions after selling/discarding/transferring; not historical acquisition.
- Each station has its own ten-minute contract refresh cooldown. Completing every
  contract does not bypass the cooldown; other stations remain independently available.
- Read MISSION_RULES before changes. Decide/preserve timer persistence across reloads;
  document which time basis is used and test anti-reroll bypasses.

Give a short playtest after each implemented slice. Do not label pending slices complete.
