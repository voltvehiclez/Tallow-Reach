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
2. Check current-only values and percentages below (full Shield: 10 HP then 100% on Wasp).
   Shield/Hull show HP; Boost shows U; Power shows MJ.
   Power usage should sit under its MJ/percentage readings; text gaps match the tracks.
   Check the throttle bar at 0%, half and full. Speed remains readable below it.
   Boost and take some shield/hull damage: columns drain/refill vertically; readings
   agree. Without a shield/boost pool, its column is empty and reads 0 / 0%.
3. Tap and release Left Alt: mouse orbits and wheel zooms. Tap again to return.
   Hold it: keyboard repeat must not flicker the camera.
4. Open inventory/map, pause, or switch browser tabs during orbit: camera exits
   cleanly. Test the layout at your usual window size and a smaller window.

## Slice 2 — navigation, aiming and motion (implemented: items 2, 10, 11; playtest pending)

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

## Slice 1 follow-up — boost ignition and weapon strip

1. Start at low throttle, tap Shift and release before ignition: no jump to 100%.
   Hold until the ignition sound and flat MJ debit: throttle now jumps to 100%.
   Repeat without enough ignition MJ: it must not jump. Normal throttle control
   still works while boost is held after ignition.
2. Fit cannon/mining beam in primary bays 1/2; use keys 1/2 and left click.
   Verify icon, cyan selection and fired weapon match Outfitting order. Select an
   empty slot 3–5: no weapon fires and no automatic fallback occurs.
3. Fit missiles in the first secondary bay, press 6 and right click. Its orange
   selection is independent of the primary. Select an empty 7–0 slot: no launch.
   The code supports additional secondary bays without adding bays to current ships.
4. Click hotbar boxes: selection works without firing. Check shared missile ammo on
   its icon and no redundant weapon line at top-right. Reload: both selections persist.
5. Compare the compact strip at normal and narrow window sizes: it fits BETWEEN Hull
   and Power, above throttle. Column pairs are farther apart but otherwise unchanged.
   Check number/icon/ammo readability and click selection. Remaining batch slices are pending.

### Monochrome/position follow-up

- Weapon boxes sit 20px lower, with square corners, white active borders and grey
  inactive slots/labels. Bank headings have selected weapon names beneath; missiles
  show ammo, non-ammo weapons show no ammo line. Check long names at smaller widths.
- Top-left: bold white system, regular white current pocket, no icon; route beneath.
  Warp to another pocket/system to check both names. Instances must not claim Meridian.
- Bottom-left instructions are gone; main-menu help still describes controls.

Square-slot follow-up: confirm equal box width/height, a divider only as tall as the slot row, white PRIMARY/SECONDARY and grey weapon names. Meter appearance should be unchanged, only farther apart.

Framing follow-up: check headings sit close to slots, status tracks are centred under unmoved labels with matching frames/8px gaps, and speed appears inside the throttle box. Boost/fire/take damage to confirm the framed readings remain legible. Speed physics is unchanged here; pushed-speed correction remains slice 2.

Signed-throttle follow-up: try -100%, -50%, 0%, +50%, +100%. Reverse should show a minus sign and same-blue striped fill growing from the right; forward is solid from the left. Check the raised throttle box, uniform status-column widths, usage centred under Power/Boost, and names 2px closer to unchanged bank headings.

Select fitted and empty primary/secondary bays via keys and clicks: slot labels update without centre-screen equipped/empty messages. Check bank headings sit 2px farther inward; grey names stay fixed.

Check the new finned missile outline against the reference. Dock, acquire missile lock, approach a wormhole and mine: shared prompts should appear white above the weapon strip, mining progress beneath prompts, without overlapping slot headings. Check both bank headings align with the name edges.

Check Shield/Hull/Power/Boost labels, bars and numeric readouts share the centre of each grey frame. Frames, 28px track widths and text sizes must remain unchanged.

## Slice 2 quick playtest

1. Lower HUD: all slots, columns, throttle, prompts and mining bar are 18px lower,
   with their relative spacing unchanged. Missile outline points straight upwards.
2. Press N in flight: scroll through the live pocket list (including far-away rocks,
   stations, planets/scenery where present, hostiles, cargo, rifts/gates/caches and
   projectiles). No range cap. N or Close hides it; it is read-only and flight continues.
   Move to a new pocket while open: entries should change, not retain old objects.
3. Lock a moving hostile with F and select a cannon: white circle leads the target.
   Match its movement and the lead shrinks; select a beam/empty slot or unlock and it
   disappears. Offscreen or unreachable targets must not show a misleading lead.
4. At zero throttle, let a Meridian moving arm/ring push the ship: speed should rise
   while being displaced. Warp/reload should not produce a huge teleport-speed spike.

Save remains v21. Slices 3–5 are still pending; no shop/inventory/mission changes here.

Slice 2 repair playtest: refresh the preview, press N twice (opens/closes without error), and hold N (no repeated toggles). Close/turn past a locked moving hostile with a cannon: lead should move with the rendered target, not jump at tick boundaries. Check all four grey stat frames end at the same height as the throttle border; horizontal positions and sizes are unchanged.

Confirm throttle and weapon strip share a horizontal centre; throttle size/height remain unchanged.

Pocket-list follow-up: at 720p or taller check at least 35 single-line rows with Filters collapsed. Tick/untick categories and reload: choices persist, including all-off. Try all three sort buttons twice. Click an enemy, rock, station and gate/cache; F lock marker should appear, and clicking the same target releases it. Removed entities must not leave a stale lock. Mouse movement/clicks must not steer/fire while browsing; close with N/Esc and steering resumes without a stale turn. Objectives should be hidden behind the list and return on close. Check bank-heading tops align with grey-frame tops and the gap above throttle matches the 6px lateral gap.

### N-panel & HUD transparency finish (2026-11-18)

1. Launch into flight: confirm the N pocket panel starts completely hidden and top-right credits/hold/missions show normally.
2. Press **N** to open the pocket list, then press **N** again: it disappears cleanly and credits/missions return. Re-open with **N**, click **Close · N**: it disappears cleanly. Re-open with **N**, open **Filters**, tick a checkbox, then press **N**: it still closes immediately. Also verify **Esc** closes it without pausing.
3. With **N** open, check the faint grey horizontal separator lines between rows and confirm rows remain tight single-line 16px height (35+ rows at 720p with Filters collapsed).
4. Click several objects (station, asteroid, asteroid field, hostile) and also lock/unlock with **F**: the entire selected row (name, type and km distance) is outlined immediately in a crisp white rectangle; clicking the selected row again or destroying the target clears the outline.
5. Turn the camera past Meridian Station, a planet or an asteroid field: check that the **N** panel, the ten weapon-slot boxes and the four grey Shield/Hull/Power/Boost status frames all have matching slight transparency while the coloured Shield, Hull, Power and Boost meter fills remain solid.
6. Check forward, zero and reverse throttle over bright scenery: the dark throttle background is slightly transparent while its dark-slate tone, border, forward solid blue fill, reverse striped blue fill and text stay crisp.
