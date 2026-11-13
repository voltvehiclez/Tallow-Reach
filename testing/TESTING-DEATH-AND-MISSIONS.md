# Playtest: dying and missions

What changed: dying no longer fails a mission by itself. A mission fails on death only if its own story says so, or if you
were carrying its mission-only item (a parcel, the Border Signal beacon). A failure shows a red "Mission failed" notice at the
top of the screen, in flight and on the docked screen, saying which mission failed and why.

Play `TESTING-BASELINE.md` first, then these. Add `?testmissions` to the end of the game's address for the test missions.

- [ ] **Death with no mission item.** Start "Test: Radio relay" (or accept a contract) and get destroyed (let raiders kill
      you). Expected: you are docked with your usual death message, and the mission is still in the Mission log, still
      Active. No red notice.
- [ ] **Death carrying the parcel.** Start "Test: Parcel run", load the parcel at the dock, fly out and get destroyed.
      Expected: a red notice "Mission failed: Test: Parcel run" with "Your ship was destroyed and the Parcel it carried was
      lost." The mission is gone from the log and can be started again from the beginning.
- [ ] **Death before loading the parcel.** Start "Test: Parcel run" but die before loading the parcel. Expected: the mission
      carries on, no notice.
- [ ] **A mission that wants you to fail.** Start "Test: Ambush run" and get destroyed. Expected: a red notice "Mission
      failed: Test: Ambush run" with "The ambush run was lost because the ship was destroyed."
- [ ] **Border Signal.** Die while it is active, before you pick up the beacon. Expected: it carries on. Pick up the beacon
      and die. Expected: the red notice, and the mission can be restarted.
- [ ] **The notice.** It stays up for 15 seconds or until you click it. Abandoning a mission yourself shows no notice.
- [ ] **Old save.** Load an old save that has the Border Signal active: dying no longer fails it.
