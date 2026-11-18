# Feature batch Part 1: targeting and missiles

Build/test: `npm run build` and `npm test`. Open the game or refresh the preview.
Only request items **4–7** are included; other requested features remain pending.

1. **F switching:** aim at enemy A and press F; aim at B and press F once. The
   selected marker should switch directly to B. Press F again on B to release it.
   Lock again, then look into empty space and press F: it should release.
2. **Other targets:** repeat with a rock or station. Selecting the same station
   twice must release it. Crates, rift doors and gates should remain selectable.
3. **Target label:** no "Locked" prefix/acquired message. A selected NPC has two
   left-aligned bars above its name: blue shield above white hull, each with a
   percentage on the right. Turn until the target leaves the view: only its
   name/health rectangle should stay at the edge, not the small targeting square. Current NPCs have no
   shields, so blue is empty. Damage should shorten the white bar. No giant panels.
4. **Missile progress:** equip a launcher and keep an enemy inside the cone. Corners
   start much farther out, then move inward; the bar and percentage grow to 100%.
   Look away or leave range: progress should reset appropriately.
5. **Priority:** F-select an enemy slightly off-centre but inside the missile cone.
   While acquiring, allow another ship to cross the centre. Progress must stay on
   the selected enemy. F-select a different enemy: acquisition starts fresh for it.
6. **Cleanup:** destroy the target, warp, dock or remove the launcher. No stale
   progress graphic should remain. Each pilot's selections are independent.

Pending Part 2: map/current/destination icons; compact mission log; mechanical
undock sound; Base-tab cleanup; Set Home Station and death-respawn persistence.
