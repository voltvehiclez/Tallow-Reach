# 15 — Campaign: chapters, acts and the First Sortie

The campaign lives in the same browser save as the open world, but it has **its own galaxy, its own
progress and its own pilot**. The open world's ships, credits and cargo never appear in the campaign.
This guide checks the campaign screen (chapter boxes → acts), the act boundaries, dialogue pacing, the
failure screen, and First Sortie from briefing to the accomplished card, including the post-playtest fixes
(orange wingman fire, one-second lessons, the 500 m run bonus, ferrite scenery and the ambush reveal).

Before you start: play `TESTING-BASELINE.md`, load an **old** save (a v26 or earlier export code from
`TEST-OLD-CODES.txt`) and confirm it still opens in the **Open World**. Then this guide, from the main menu.

## 1. The campaign screen: chapter boxes

1. Main menu → **Campaign**, and listen: the screen is **quiet** (a soft station pad at most), with no
   loud engine or low drone humming under it.
2. The **big left window** shows **chapter boxes three to a row** (smaller than before: three fit where two
   did), not a list of headings: *Chapter 1: Auric Reach* (Open) and three **Coming soon** boxes — Chapter 2,
   3 and 4 — each with a **blurred** placeholder and **no chapter name**. The narrow right panel has the
   header, progress and **Back**; **no act button is visible yet**.
3. Click one of the **Coming soon** chapters: the heading says *Chapter N*, the note says *This chapter is
   not written yet*, and every act box is a blurred **Coming soon** with no act name. **← All chapters**
   returns to the chapter boxes.
4. Click **Chapter 1**: six act boxes in one grid — *Act 1: First Sortie* (**Begin**) and five **Coming
   soon** acts, all blurred and unnamed. Only the first is playable.
5. Click **Act 1**. You start **docked at Korr Flight Academy** in **Auric Reach**, in a stock Wasp with
   **600 cr** — not with the open world's fleet or credits, even if you have millions there.
6. The right **Missions** tab lists only campaign progress (no offers, no contract board). The left
   **Mission log** shows First Sortie and its objective.
7. Try the **Home** button in the station screens: it is not clickable in the campaign.
8. Open the **Shop**. Korr Flight Academy has **no stock** during the sortie (it says so; nothing is for sale).
9. Try **Launch** while the graduation briefing is still being read: it is disabled with
   *Finish the conversation first*. Finish the dialogue (or let it time out line by line) and Launch works.

## 2. The flight lesson: one second per control

10. Undock. Dane Korr's Wasp is already out there (~600–700 m). It is a **Wasp with the regular Wasp colour
   scheme**, and its engine glow is **blue** and grows when he boosts.
11. Press **F** on him: he is selectable like any other ship. Your weapons do not damage him.
12. The briefing is a radio call, not a click-through: each line stays up for its reading time
    (about 1.5 s plus 1 s per 12 characters) and then advances itself. There is **no Continue in space**.
13. **Top-right objective**, exactly where open-world contracts and story missions sit: *First Sortie:
    <objective>* in the top-right block with the credits and hold. Nothing is drawn in the top-left corner
    any more.
14. Learn the controls, one call at a time. Each lesson is a **one-second hold** and each finishes the
    moment the bar reaches **100%**: **W** throttle forward, then **Ctrl** — *brake to a stop* — then **S**,
    **mouse** steer, **A**, **D**, **Space**, **C**, **Q**, **E**, **Shift** boost.
15. On a control step a **small bar** appears directly under the objective, on its own line: the control's
    name (`W — throttle forward`, `Ctrl — brake to a stop`, `Q — roll left`) above a **full-width track**
    with the percentage at its right-hand end. Hold the key: the track fills smoothly from the left, reads
    **50%** halfway and **100%** when the hold counts. Let go early and it drains. If you see the name but no
    bar (or a bar with no width), the objective's generic `#tr .hud-mission small` rule has won again —
    see `docs/architecture/campaign-acts.md`, "Control lessons and chases".
16. **Q and E:** Q must complete *Roll left with Q* and E *Roll right with E*. (They were swapped in the
    previous build: Q completed the roll-right objective.)
17. The brake (Ctrl) is taught **second**, on purpose: a new pilot can always stop the Wasp before
    anything that can drift them off the range. Confirm W is taught first and Ctrl second in that order.
18. No optional objective is shown during the lesson: the bonus belongs to the run (step 22).

## 3. The run, the ferrite field, the drones and the ambush

19. When every control is learned he says *"come to my wing — close, within 300 m — and we will start the
    run."* Fly to him: he waits at the fixed start and the run **does not begin** until you are within
    **300 m**. The line under the objective reads *Close to within 300 m of Dane to start the run.*
20. Once you form up he starts the **ten-kilometre course**; the line under the objective switches to
    *Stay within 1 km of Dane for the whole course to pass.*, with the bonus line under it. He is fast and
    boosts on the straights, but the first leg is slow enough to join from a standing start.
21. The course is dressed with **ferrite rock**: eight clusters of drifting ferrite in many sizes (a few
    giants) along both sides of the line. They are scenery with real collision — do not fly into them.
22. Watch Dane: he **steers around the clusters** and never clips a rock. The flown line itself stays clear
    (about 400 m of open air to the nearest rock).
23. **Bonus / distance line under the objective** while the run is live: *Bonus: within 500 m · now 312 m*,
    with your **live distance in metres**. Pass 500 m once and the bonus is lost (**+100 cr** gone), but the
    **live distance counter stays on screen** (*Distance to Dane: now NNN m*) so you can still judge the
    1 km pass mark. The bonus is **not** judged during the form-up, so being far away before the run starts
    costs nothing.
24. Fall more than about **1 km** behind and Dane **slows to a stop** (instead of pulling a sudden 180),
    says *"You need to keep closer to pass. Let's do it again — follow me back to the start."*, and once he
    finishes speaking he turns and returns to the **fixed start point** so the run can be redone. This never
    fails the act and is separate from the 500 m bonus.
25. Finish the course and he calls the gunnery pass. It comes in **two waves**. The first pair of
    **Practice Drones** appears; he **observes from a distance** (he circles you, he does not fly ahead of
    you any more). The objective reads *Destroy both practice drones with your primary weapon.*
26. Shoot both drones down with the **primary bank** (**1**–**5** select a bay, **LMB** fires; pick wrecks
    up with **F**). **Dane does not fire** at the drones: the gunnery pass is your test, and his guns stay
    cold until the ambush.
27. A **second pair** of drones then appears for the **secondary bank**: he explains that **6**–**0** select
    your secondary bays, that the starter Wasp carries **basic missiles** there, and that you hold a target
    inside the aiming ring until the lock tone sounds and then **Right Click** to launch. The objective
    reads *Destroy both practice drones with your secondary weapon.* Kill both with missiles. (If you empty
    the rack with nothing still in flight, the act tops the missiles back up so the drill cannot stall.)
28. As the second wave goes down, **two unmarked ships warp in** and begin **flying in a circle around Dane
    and your ship** without shooting. Dane spots them and says only that they are *not school drones* and that
    he does not recognise the hulls — he never calls them raiders, and neither does the objective text.
29. **The strangers introduce themselves**: *"Korr's newest cadet… Cut your engines and hand over the Wasp."*
    While they talk, they keep circling you and Dane, and **neither they nor Dane shoot** — unless you open
    fire on them mid-dialogue, in which case they **pre-emptively switch into aggressive AI** and attack at
    once.
30. Once their threat finishes, both attackers **switch into aggressive AI** and attack, and Dane **opens fire
    at them too**. His rounds are **orange, the same colour as your basic cannons** (not red), and still do
    **0 damage** — you have to finish them. Destroy both attackers.

## 4. The accomplished card, the failure card and the way out

31. After Dane's final report the objective is **Dock at Korr Flight Academy**: fly back and dock (**G**).
    Only then — not when the last attacker dies — the simulation stops and a big **MISSION ACCOMPLISHED**
    card appears with what was paid (50 cr, plus the 100 cr bonus if you kept within 500 m). **Return to campaign menu**
    takes you back to the chapter boxes; the act is marked complete and offers **Replay**.
32. **Blank-menu check (the Act 1 bug):** finish the act, then leave the act by the *other* route: press
    **Esc** → **Exit to main menu** (or return to the campaign screen and press **Back**). The title screen
    must show **Campaign** and **Open World** with its controls list — never an empty dark screen. The end
    card must not be left covering the menu.
33. Play the act again from a failed state: start First Sortie, then get yourself **destroyed** in flight.
    A **MISSION FAILED** card stops the world and says *Your Wasp was destroyed.*
    It offers **Start from the beginning** and, because First Sortie deliberately has **no checkpoints**,
    no checkpoint button. **Start from the beginning** restarts the act from the station briefing.
34. (Checkpoint framework, for a future act: a step marked `checkpoint: true` adds a **Start from last
    checkpoint** button that puts you back on that step with its progress cleared.)

## 5. Boundaries, docking and reloads

35. In flight, press **M** and try to warp out of the pocket: you are refused with
    *You do not have permission to leave this pocket.* The campaign never lets you wander off unless an act
    says so.
36. During the lesson or the run, dock at Korr Flight Academy (**G**). Docking is **allowed** (no destroy
    objective is live), and it **does not reset** the act: Dane stays where he was, the lesson keeps its
    progress, and undocking puts you back in the same objective.
37. During the drone pass or the ambush, try to dock: you are refused with
    *You cannot dock while the act's enemies are still out there.*
38. Quit to the main menu mid-act and press **Campaign**: the screen opens on the chapter boxes; open
    Chapter 1 and the act offers **Resume** and picks up where you left off. Dane is re-created from the
    act's own `spawn-ship` script if he had vanished, and the unmet drone/attacker waves are re-armed
    (never duplicated).
39. **Restart act** lives in the pause menu (**Esc**) while an act is running; it starts the act clean.

## 6. Two pilots, one save

40. Finish or leave back to the menu, switch to **Open World**: your fleet, credits and cargo are exactly
    as they were — the campaign pilot is a separate record.
41. In the campaign, open **Inventory**: only the campaign's Wasp is yours there, with an empty hold.
42. Export the campaign save to a **TR1:** code and re-import it. You return to the campaign with its
    completions intact.
43. **Reset** (Saves tab) wipes **both** modes — the button says "Wipe credits, ships, base and contracts",
    and it now does exactly that: a fresh 600 cr pilot in whichever mode you pressed it from, and the other
    mode is fresh too when you next enter it.
44. An old save (v26 or earlier) opens in the **Open World**; the **Campaign** button starts a fresh campaign
    beside it, keeping any campaign completions it already recorded.

## 7. Objective markers and highlights

45. In First Sortie, the two drone waves glow **amber** on the HUD: the drone labels carry a glowing
    border and their rows in the **N** list glow too. The same is true of the raiders once they turn hostile,
    and of **Korr Flight Academy** when the sortie is ready to hand in.
46. Check the same in the open world: accept a **contract** (or a story mission) and confirm the objectives
    glow in that mission's own colour — **ice blue** for a contract, **amber** for a story mission. A hunt
    target glows when it spawns; a salvage or delivery crate glows even when it is far away (**outside the old
    900 m crate range**); a mining contract glows its field or its rocks. Stations that take the hand-in glow
    when it is time to fly back.
47. A mission that needs you somewhere else shows a **Waypoint** label on the HUD edge in the mission's
    colour. On the ten-kilometre run, **Course start** marks where Dane is waiting until you form up.

## 8. The words

48. Every line First Sortie says — the graduation briefing, each control call with its objective and hold
    label, the run's orders and both reset lines, the gunnery pass, the ambush (Dane's and the strangers'),
    the final report, the failure sentence and the card buttons — is collected in
    [../docs/FIRST-SORTIE-DIALOGUE.md](../docs/FIRST-SORTIE-DIALOGUE.md). Read it before playtesting and
    note any wording you want changed against the step it names; the strings themselves live in
    `src/data/campaign/m01.js`. Nothing else in the act should say anything the document does not list.

## 9. Round 5: flight model, navigation, small batch (2026-11-21)

49. **Turning feels a third slower** — every ship, yours and theirs (`FLIGHT.turn` 0.7 → 0.525). Dogfights
    and the course run should feel lazier to turn; top speeds are unchanged.
50. **NPCs fly like ships now:** drones, raiders and Dane accelerate, brake and boost with the same maths
    you do (stock-Wasp numbers). Dane takes seconds to brake at the ambush standoff instead of stopping
    dead; on the fast course legs he boosts past 150 m/s. Nothing should teleport, snap-turn or slide
    sideways without strafing.
51. Fly the whole First Sortie end to end: the final objective after Dane's report is **Dock at Korr
    Flight Academy** — the card appears only when you dock there, and the academy (not Dane) is what
    glows for that step. Dane glows only while you are meant to form up on him.
52. **N panel:** header reads Pocket objects – Filters – Close · N; Distance sort is at the far right.
    The seven preset boxes: tick some filters, click a ＋ box to save them; click the preset to re-apply;
    edit filters with a preset selected and it updates itself; right-click a preset for Rename/Reset.
    Reload the page — presets survive (they are in the save now).
53. With a kind filtered **off** in the N panel, its floating labels disappear too (the object is still
    F-selectable when you look at it, and an F-lock always shows its label). Rocks never show labels.
    Asteroid-belt labels should read as fewer, bigger fields on the First Sortie chart. Marker labels no
    longer jitter as the distance ticks between 900 m and 1000 m.
54. **Outfitting:** drag a module and drop it anywhere in the left Outfitting box (not on a bay) — it
    fits the left-most empty bay of its group. Dropping on a specific bay still picks that bay.
55. The main-menu backdrop planet is now an Earth-like world (greenish-grey continents). Generated
    planets elsewhere may have changed class — that is expected, nothing is saved per-planet.
56. **Reset** in Saves now wipes both modes for real: press it in either mode and both the campaign and
    the open world start fresh (600 cr, one Wasp).

57. **Starmap objective glow:** with Border Signal accepted and the briefing done, open the big starmap —
    the Meridian system is ringed in the mission colour; zoom into Meridian and Kestrel Hollow is ringed.
    Warp to Kestrel Hollow: both rings are gone. Warp out again: they return. The same should hold for a
    contract's destination pocket/system (ice blue) and for the First Sortie hand-in back at the academy.
58. **Ambush face-off:** during the ambush parley the two strangers' labels and target locks read
    **Unmarked** in neutral grey. When the talk ends (or you shoot first) they become **Newbie Raider**
    in red and open fire as before.
