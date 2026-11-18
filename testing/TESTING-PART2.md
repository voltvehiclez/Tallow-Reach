# Part 2 and follow-up playtest

Owner approved the navigation icons and Home Station control. Follow-up visual/audio checks pending.

1. **F target:** place a small rock in front of a large one. Put the white centre dot anywhere on
   the small rock's visible surface and press F: it should select the small rock, not the big one.
   Aim beyond its edge to select the rear rock; F on the same target still unlocks. Missile corner
   animation and selected-enemy priority should remain unchanged.
2. **Mission log:** check several active missions. Cards should be tighter, with actions beside
   the header and a short next-step line. Click Details (also Tab + Enter) to read the full next
   step and dialogue, then collapse it. Progress, hand-in/reward and Abandon must still work.
3. **Outfitting:** open the tab or reset the preview. The initial view should show front, top and
   left. Check drag, zoom and idle rotation still work.
4. **Home/loaner (disposable save):** set another station as home, reload, then lose your only
   ship elsewhere while still holding plenty of credits. You should dock at home with a fitted
   Wasp and be able to launch. Repeat with a spare owned hull: use that hull, no extra free Wasp.
   Ship ownership is currently global; this change does not add per-station ship storage.
5. **Preserved Part 2:** verify approved blue current icons/orange dotted rings and orange
   shape-preserving destinations (right-hand pocket icon in routes); mechanical latch/vent/thump
   on undock; Base modules/storage/refinery stats only, cargo controls in Inventory.

Save stays v21. Old saves default to Meridian; missing/temporary homes fall back safely.
Run `npm run build` and `npm test`, then play `game/tallow-reach.html`.
