# 15 — Campaign: chapters, acts and the First Sortie

The campaign lives in the same browser save as the open world, but it has **its own galaxy, its own
progress and its own pilot**. The open world's ships, credits and cargo never appear in the campaign.
This guide checks the campaign screen (chapter boxes → acts), the act boundaries, dialogue pacing, the
failure screen, and First Sortie from briefing to the accomplished card, including the post-playtest fixes
(orange wingman fire, one-second lessons, the 500 m run bonus, ferrite scenery and the ambush reveal).

Before you start: play `TESTING-BASELINE.md`, load an **old** save (a v26 or earlier export code from
`TEST-OLD-CODES.txt`) and confirm it still opens in the **Open World**. Then this guide, from the main menu.

## 1. The campaign screen: chapter boxes

1. Main menu → **Campaign**. The **big left window** shows large **chapter boxes**, not a list of
   headings: *Chapter 1: Auric Reach* (Open) and *Chapter 2: The Kestrel Line*, *Chapter 3: Hollow
   Ground*, *Chapter 4: The Reach Answers* (Locked · coming later). The narrow right panel has the header,
   progress and **Back**; **no act button is visible yet**.
2. Click **Chapter 2** (a locked chapter): its act boxes open, every one of them locked and marked
   *Planned · not written yet*. **← All chapters** returns to the chapter boxes.
3. Click **Chapter 1**: six act boxes — *Act 1: First Sortie* (**Begin**) and five locked planned acts.
   Only the first is playable.
4. Click **Act 1**. You start **docked at Korr Flight School** in **Auric Reach**, in a stock Wasp with
   **600 cr** — not with the open world's fleet or credits, even if you have millions there.
5. The right **Missions** tab lists only campaign progress (no offers, no contract board). The left
   **Mission log** shows First Sortie and its objective.
6. Try the **Home** button in the station screens: it is not clickable in the campaign.
7. Open the **Shop**. Korr Flight School has **no stock** during the sortie (it says so; nothing is for sale).
8. Try **Launch** while the graduation briefing is still being read: it is disabled with
   *Finish the conversation first*. Finish the dialogue (or let it time out line by line) and Launch works.

## 2. The flight lesson: one second per control

9. Undock. Dane Korr's Wasp is already out there (~600–700 m). It is a **Wasp with the regular Wasp colour
   scheme**, and its engine glow is **blue** and grows when he boosts.
10. Press **F** on him: he is selectable like any other ship. Your weapons do not damage him.
11. The briefing is a radio call, not a click-through: each line stays up for its reading time
    (about 1.5 s plus 1 s per 12 characters) and then advances itself. There is **no Continue in space**.
12. **Top-left tracker**: the act's current objective sits under the location block, in the top-left
    corner. There is no duplicate of it in the top-right list any more.
13. Learn the controls, one call at a time. Each lesson is a **one-second hold** and each finishes the
    moment the bar reaches **100%**: **W** throttle forward, then **Ctrl** — *brake to a stop* — then **S**,
    **mouse** steer, **A**, **D**, **Space**, **C**, **Q**, **E**, **Shift** boost.
14. On a control step a **small percentage bar** appears under the objective. Hold the key: it fills
    smoothly, reads 50% halfway and **100%** when the hold counts. Let go early and the bar drains.
15. The brake (Ctrl) is taught **second**, on purpose: a new pilot can always stop the Wasp before
    anything that can drift them off the range. Confirm W is taught first and Ctrl second in that order.
16. No optional objective is shown during the lesson: the bonus belongs to the run (step 20).

## 3. The run, the ferrite field, the drones and the ambush

17. When every control is learned he calls the run: a **ten-kilometre course** from a fixed point in space.
    He is fast and boosts on the straights.
18. The course is dressed with **ferrite rock**: eight clusters of drifting ferrite in many sizes (a few
    giants) along both sides of the line. They are scenery with real collision — do not fly into them.
19. Watch Dane: he **steers around the clusters** and never clips a rock. The flown line itself stays clear
    (about 400 m of open air to the nearest rock).
20. **Top-right `Bonus` chip** while the run is live: *Stay within 500 m of Captain Dane Korr through the
    ten-kilometre run*, with your **live distance in metres**. Under 500 m it reads light green; over it,
    red. Pass 500 m once and the bonus is lost for good (**+100 cr** gone); the run itself continues.
21. Fall more than about **1 km** behind and Dane says *"You are too slow. Follow me back to the start and
    we will run it again."*: he returns to the **fixed start point** and the run is redone. This never fails
    the act and is separate from the 500 m bonus.
22. Finish the course and he calls the gunnery pass. Two **Practice Drones** appear; he **observes from a
    distance** (he circles you, he does not fly ahead of you any more).
23. Shoot both drones down (**LMB**, pick them up with **F**).
24. He spots contacts and says only that they are *not school drones* and that he does not recognise the
    hulls — he never calls them raiders, and neither does the objective text.
25. **The strangers introduce themselves**: *"Korr's newest cadet… Cut your engines and hand over the Wasp."*
    Two unmarked ships appear and shoot back — nothing in the scene tells you who they are.
26. Dane **fires at them too**. His rounds are **orange, the same colour as your cannons** (not red), and
    still do **0 damage** — you have to finish them. Destroy both attackers.

## 4. The accomplished card, the failure card and the way out

27. When the last objective completes, the simulation stops and a big **MISSION ACCOMPLISHED** card appears
    with what was paid (50 cr, plus the 100 cr bonus if you kept within 500 m). **Return to campaign menu**
    takes you back to the chapter boxes; the act is marked complete and offers **Replay**.
28. **Blank-menu check (the Act 1 bug):** finish the act, then leave the act by the *other* route: press
    **Esc** → **Exit to main menu** (or return to the campaign screen and press **Back**). The title screen
    must show **Campaign** and **Open World** with its controls list — never an empty dark screen. The end
    card must not be left covering the menu.
29. Play the act again from a failed state: start First Sortie, then get yourself **destroyed** in flight.
    A **MISSION FAILED** card stops the world and says *Your Wasp was destroyed. The sortie is over.*
    It offers **Start from the beginning** and, because First Sortie deliberately has **no checkpoints**,
    no checkpoint button. **Start from the beginning** restarts the act from the station briefing.
30. (Checkpoint framework, for a future act: a step marked `checkpoint: true` adds a **Start from last
    checkpoint** button that puts you back on that step with its progress cleared.)

## 5. Boundaries, docking and reloads

31. In flight, press **M** and try to warp out of the pocket: you are refused with
    *You do not have permission to leave this pocket.* The campaign never lets you wander off unless an act
    says so.
32. During the lesson or the run, dock at Korr Flight School (**G**). Docking is **allowed** (no destroy
    objective is live), and it **does not reset** the act: Dane stays where he was, the lesson keeps its
    progress, and undocking puts you back in the same objective.
33. During the drone pass or the ambush, try to dock: you are refused with
    *You cannot dock while the act's enemies are still out there.*
34. Quit to the main menu mid-act and press **Campaign**: the screen opens on the chapter boxes; open
    Chapter 1 and the act offers **Resume** and picks up where you left off. Dane is re-created from the
    act's own `spawn-ship` script if he had vanished, and the unmet drone/attacker waves are re-armed
    (never duplicated).
35. **Restart act** lives in the pause menu (**Esc**) while an act is running; it starts the act clean.

## 6. Two pilots, one save

36. Finish or leave back to the menu, switch to **Open World**: your fleet, credits and cargo are exactly
    as they were — the campaign pilot is a separate record.
37. In the campaign, open **Inventory**: only the campaign's Wasp is yours there, with an empty hold.
38. Export the campaign save to a **TR1:** code and re-import it. You return to the campaign with its
    completions intact.
39. **Reset** in the campaign restarts only the campaign half: a fresh 600 cr pilot at Korr Flight School with
    completion cleared. The open world is untouched.
40. An old save (v26 or earlier) opens in the **Open World**; the **Campaign** button starts a fresh campaign
    beside it, keeping any campaign completions it already recorded.
