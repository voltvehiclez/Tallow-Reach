# 15 — Campaign scaffolding: the Dane Korr tutorial (M01)

Step 15 adds a **Campaign** mode that lives in the same browser save as the open world but keeps its own
galaxy and progress. The two modes share your pilot (fleet, credits, cargo, loadout) and nothing else.
This guide checks that the modes stay separate and that M01 — the flight-school tutorial — can be played
from briefing to reward.

Before you start: play `TESTING-BASELINE.md`, load an **old** save (a v25 or earlier export code from
`TEST-OLD-CODES.txt`) and confirm it still opens in the **Open World**. Then this guide, from the main menu.

## 1. Getting in and out

1. On the main menu press **Campaign**. You arrive docked at **Korr Flight School** in **Auric Reach**.
2. Press **M**. The map shows only the Auric Reach system (seed `240515`); it has no link to the open world.
   Press **Esc**/**M** to close.
3. Dock, open the **Missions** tab (right panel). It lists **Campaign missions**; **First Sortie** is marked
   *Next campaign mission* with a **Begin** button. There is no contract board in campaign mode.
4. Switch back to the open world from the main menu (**Open World**). Everything there is as you left it.
   Switching does not move, heal or refit anything.

## 2. Accepting M01 (First Sortie)

5. Back in **Campaign**, press **Begin**. Expect the toast *Campaign mission accepted.*
6. Open the **Missions** tab again: First Sortie is now your active mission, all other offers stay locked.
7. Open the left **Mission log** window. The graduation briefing names **Captain Dane Korr**. Click through
   his two lines with **Continue**.
8. Open **Inventory**: you are flying the **Wasp** (granted for this mission, wherever you were docked).
   Other owned hulls are untouched.

## 3. The sortie

9. Undock and fly. Dane Korr's hull joins the training range (a large, unmistakable ship, ~600–700 m away).
   Try locking him with **F**: he is friendly and cannot be locked or damaged.
10. A radio briefing about throttle/mouse/boost appears in the mission dialogue card. Read it, press **Continue**.
11. Fly on his tail for about five seconds ("first pass"). Then two **Practice Drones** spawn ahead of you.
    They show as ordinary targets; shoot both down (**LMB**).
12. Korr's solo orders arrive automatically. Two more drones spawn; run the course: **survive ~5 seconds and
    destroy both drones** (both must be done — watch the counters in the mission log).
    - Pick the drones up with **F**; they take about three cannon hits each.
    - **W** throttle, **S** reverse, **mouse** steer, **Shift** boost — exactly what the briefing says.
13. Korr cuts in: "One last check—". Two pirate **Raiders** spawn (red, hostile, they shoot back).
    Use cover, shields and boost; destroy both.
14. The final radio lines play; the mission log shows every objective complete.

## 4. Hand-in and rewards

15. Dock at **Korr Flight School** (**G**). Open the **Mission log**; First Sortie shows a **Collect reward**
    button (or **Collect at Korr Flight School** until you dock). Press it: expect **Paid 50 cr.**
16. Open **Inventory**: credits are +50. Open the right **Missions** tab: First Sortie reads
    **Completed · Replayable**.
17. Quit to the main menu (**Esc** → save/quit as usual), then re-enter **Campaign**. Completion persists;
    the mission stays replayable with the **Replay** button. Replaying it grants no extra fixed hull.
18. Finish all of M01 again via Replay, then re-check the list: still only M01, still exactly one completion
    recorded (no duplicate completion, no free-agent flip — finishing the campaign currently does nothing
    extra **by design**).

## 5. Dual-mode save behaviour

19. In **Campaign**, check the slot list on the menu: your slot shows **Campaign** with your credits/ships
    and loads back into campaign mode.
20. In **Open World**, the same slot list shows **Open world**. The two halves never mix places, missions,
    flags or progress.
21. Export the campaign save to a **TR1:** code and re-import it (**Esc** → Export/Import). The world you
    return to is the campaign, with M01's progress intact.
22. **Reset** in the campaign (menu → Reset → Yes): only the campaign half restarts (Korr Flight School,
    completion cleared); your fleet, credits, cargo and the open world are untouched.
23. Interrupt mid-mission: accept M01, fly the first pass, then quit to menu and re-enter **Campaign**.
    The mission is still active with the same progress. Waves are re-armed to match what is still owed: the
    `respawn: true` spawn actions re-top the practice-drone/raider waves when you arrive or undock, so a quit
    mid-fight never strands you behind an unfinishable objective — living members keep their health and are
    never duplicated, only the missing number is spawned. (Quitting while docked re-arms on your next undock.)
24. An **old v25-or-earlier** save (from `TEST-OLD-CODES.txt`) loads straight into the **Open World**;
    the **Campaign** button starts a fresh campaign beside it.

## Known limits (expected)

- Only M01 exists; after it the tab says more sorties are being written. There is no completion reward,
  unlock or free-agent switch — campaign completion currently does **nothing** beyond recording the completion.
- Replay pays the 50 cr again but records the completion only once.
- The campaign has no contract board and no rifts/wormholes.
