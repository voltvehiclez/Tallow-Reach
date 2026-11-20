# 15 — Campaign: chapters, acts and the First Sortie

The campaign lives in the same browser save as the open world, but it has **its own galaxy, its own
progress and its own pilot**. The open world's ships, credits and cargo never appear in the campaign.
This guide checks the campaign screen, the act boundaries, dialogue pacing, the failure screen, and
First Sortie from briefing to the accomplished card.

Before you start: play `TESTING-BASELINE.md`, load an **old** save (a v26 or earlier export code from
`TEST-OLD-CODES.txt`) and confirm it still opens in the **Open World**. Then this guide, from the main menu.

## 1. Chapters and acts

1. Main menu → **Campaign**. You see **Chapter 1** and its acts; **Act 1 — First Sortie** is the only
   available one. There is no Accept, no Abandon and no job board.
2. Click the act. You start **docked at Korr Flight School** in **Auric Reach**, in a stock Wasp with
   **600 cr** — not with the open world's fleet or credits, even if you have millions there.
3. The right **Missions** tab lists only campaign progress (no offers, no contract board). The left
   **Mission log** shows First Sortie and its objective.
4. Try the **Home** button in the station screens: it is not clickable in the campaign.
5. Open the **Shop**. Korr Flight School has **no stock** during the sortie (it says so; nothing is for sale).
6. Try **Launch** while the graduation briefing is still being read: it is disabled with
   *Finish the conversation first*. Finish the dialogue (or let it time out line by line) and Launch works.

## 2. The flight lesson

7. Undock. Dane Korr's Wasp is already out there (~600–700 m). It is a **Wasp with the regular Wasp colour
   scheme**, and its engine glow is **blue** and grows when he boosts.
8. Press **F** on him: he is selectable like any other ship. Your weapons do not damage him.
9. The briefing is a radio call, not a click-through: each line stays up for its reading time
   (about 1.5 s plus 1 s per 12 characters) and then advances itself. There is **no Continue in space**.
10. Learn the controls, one call at a time. Each counts once you hold it for about **3 seconds**:
    **W** throttle forward, **S** throttle back, **mouse** steer, **A** strafe left, **D** strafe right,
    **Space** rise, **C** drop, **Q** roll left, **E** roll right, **Shift** boost.
    The mission log shows the optional objective *Keep within 350 m of Captain Dane Korr*.
11. Stay close through the whole lesson and the optional objective is earned (**+100 cr** on top of the
    mission's 50 cr). Drift more than 350 m once and it is marked failed; the lesson itself continues.
12. If you fall more than about **1 km** behind during the lesson or the chase, Dane says
    *"That is not passable. We will do it again — follow me back to the start."* (or the chase line), flies
    back to the **fixed start point** and that same objective is redone. This never fails the act.

## 3. The chase, the drones and the ambush

13. When every control is learned he calls the run: a **ten-kilometre course** from a fixed point in space.
    He is fast and boosts on the straights. Stay within 1 km or the reset above happens.
14. Finish the course and he calls the gunnery pass. Two **Practice Drones** appear; he **observes from a
    distance** (he circles you, he does not fly ahead of you any more).
15. Shoot both drones down (**LMB**, pick them up with **F**).
16. He spots contacts: raiders, **"This is not a drill — defend yourself!"** Two pirates spawn and shoot back.
    Dane **fires at them too**, but his basic cannons do **0 damage** — you have to finish them.
17. Destroy both raiders.

## 4. The accomplished card and the failure card

18. When the last objective completes, the simulation stops and a big **MISSION ACCOMPLISHED** card appears
    with what was paid (50 cr, plus the 100 cr bonus if you kept the optional). There is no free roaming after
    an act: **Return to campaign menu** takes you back to Chapter 1. The act is marked complete.
19. Play the act again from a failed state: start First Sortie, then get yourself **destroyed** in flight.
    A **MISSION FAILED** card stops the world and says *Your Wasp was destroyed. The sortie is over.*
    It offers **Start from the beginning** and, because First Sortie deliberately has **no checkpoints**,
    no checkpoint button. **Start from the beginning** restarts the act from the station briefing.
20. (Checkpoint framework, for a future act: a step marked `checkpoint: true` adds a **Start from last
    checkpoint** button that puts you back on that step with its progress cleared.)

## 5. Boundaries, docking and reloads

21. In flight, press **M** and try to warp out of the pocket: you are refused with
    *You do not have permission to leave this pocket.* The campaign never lets you wander off unless an act
    says so.
22. During the lesson or the chase, dock at Korr Flight School (**G**). Docking is **allowed** (no destroy
    objective is live), and it **does not reset** the act: Dane stays where he was, the lesson keeps its
    progress, and undocking puts you back in the same objective.
23. During the drone pass or the raider fight, try to dock: you are refused with
    *You cannot dock while the act's enemies are still out there.*
24. Quit to the main menu mid-act and press **Campaign**: the screen offers **Resume Act 1** and you pick up
    where you left off. Dane is re-created from the act's own `spawn-ship` script if he had vanished, and the
    unmet drone/raider waves are re-armed (never duplicated).
25. **Restart act** lives in the pause menu (**Esc**) while an act is running; it starts the act clean.

## 6. Two pilots, one save

26. Finish or abandon back to the menu, switch to **Open World**: your fleet, credits and cargo are exactly
    as they were — the campaign pilot is a separate record.
27. In the campaign, open **Inventory**: only the campaign's Wasp is yours there, with an empty hold.
28. Export the campaign save to a **TR1:** code and re-import it. You return to the campaign with its
    completions intact.
29. **Reset** in the campaign restarts only the campaign half: a fresh 600 cr pilot at Korr Flight School with
    completion cleared. The open world is untouched.
30. An old save (v26 or earlier) opens in the **Open World**; the **Campaign** button starts a fresh campaign
    beside it, keeping any campaign completions it already recorded.

## Known limits (expected)

- Only M01 exists; after it the chapter says more sorties are being written.
- The act pays its reward automatically — there is no hand-in button in the campaign.
- Checkpoints are framework-only for now: a hidden test mission proves the mechanism, and First Sortie has none.
- The campaign has no contract board, no shop stock at the school and no rifts/wormholes.
