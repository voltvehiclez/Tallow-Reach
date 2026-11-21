# First Sortie — every line the pilot reads

The act is `campaign.m01-first-sortie` in `src/data/campaign/m01.js`. This file is a
reading copy of every word it shows, in the order it shows them, so the wording can be
reviewed (or rewritten) in one place. **The data file is the source of truth**: when you
change a line here, change the same string in `m01.js` at the step named below, then run
`npm test` (a few strings are asserted by `tests/campaign-slices.test.mjs`).

Speaker for the whole sortie: **Captain Dane Korr** — portrait slot `captain-dane-korr`.
The two strangers are one voice, **Unmarked pilot**, portrait `unmarked-pilot`.

Cards: a docked briefing shows one line per card with a **Continue** button
(**Close** on the last line) and a `1 / 3` counter. A radio call plays while flying, one
line at a time, and advances itself (the small `…` marker); it never needs a dock.
Under the objective in the top-right HUD, a control lesson also draws its hold bar
(e.g. `Ctrl — brake to a stop` over a bar that fills to `100%` in one second).

---

## 1. Graduation briefing — at Korr Flight School (docked)

Step `graduation`, `kind: dialogue`, `requiresDock: true`. Objective shown under the act:
*Hear Captain Dane Korr's briefing at Korr Flight School.*

1. "So the school finally let you off the leash. A Wasp, a full tank, and a captain who would rather be flying than talking."
2. "No ceremony. Launch, form up on my wing and do what I say. Fly well and you will be home before the range lights cool."
3. "One more thing — the school shop is shut until your certificate is signed. Nothing on those shelves is for sale today. Say your goodbyes and get to your ship."

## 2. Launch — no dialogue

Step `launch-order`: objective *Launch and form up on Captain Dane Korr.* Nothing is said;
Dane's ship appears 600–700 m away and waits.

## 3. The control lesson — radio calls from Dane

Each call is a `radio` step (`requiresDock: false`) with the objective *Listen to Captain
Dane Korr.*, followed by a `control` step the pilot completes by holding the control for
one second. The hold bar is labelled from `src/data/missions/rules.js`.

**Throttle** — step `brief-throttle`
- "First, the throttle. W eases it forward. One second of it is all this lesson asks."
- "Then Ctrl — the brake. Learn that one before anything else. A pilot who cannot stop is not flying, they are falling with style."

Step `learn-throttle`: *Throttle forward with W.* — bar `W — throttle forward`.

**Brake** — step `brief-brake`
- "Now stop. Hold Ctrl and the throttle bleeds off until the Wasp is sitting still."
- "Whatever happens out here, that key always works. Use it the moment you are unsure."

Step `learn-brake`: *Brake to a stop with Ctrl.* — bar `Ctrl — brake to a stop`.

**Reverse** — step `brief-reverse`
- "S is reverse: it pulls the throttle back past zero. Short taps — you are not trying to fly backwards across the range."

Step `learn-throttle-back`: *Pull the throttle back with S.* — bar `S — throttle back`.

**Steering** — step `brief-steer`
- "Now the nose. The mouse steers. Small movements — the Wasp is quicker than anything you flew at the school."

Step `learn-steer`: *Steer with the mouse.* — bar `Mouse — steer`.

**Strafe** — step `brief-strafe`
- "A strafes left, D strafes right. Slide sideways without turning the nose."

Steps `learn-strafe-left` (*Strafe left with A.*, bar `A — strafe left`) and
`learn-strafe-right` (*Strafe right with D.*, bar `D — strafe right`).

**Lift** — step `brief-lift`
- "Space lifts you, C drops you. Do not fight the drift — correct it."

Steps `learn-rise` (*Rise with Space.*, bar `Space — rise`) and `learn-drop`
(*Drop with C.*, bar `C — drop`).

**Roll** — step `brief-roll`
- "Q rolls left, E rolls right. Roll when the nose needs to go somewhere the mouse cannot reach."

Steps `learn-roll-left` (*Roll left with Q.*, bar `Q — roll left`) and
`learn-roll-right` (*Roll right with E.*, bar `E — roll right`).

**Boost** — step `brief-boost`
- "Last one. Shift is boost. It burns your power, and it is the only way you will stay with me."

Step `learn-boost`: *Boost with Shift.* — bar `Shift — boost`.

### Falling behind during a lesson

Every lesson step carries `maxGap: 1100`. Drift further than 1.1 km from Dane and he says
the lesson reset line, flies back to the start of the leg, and the same objective repeats:

> "That is not passable. We will do it again — follow me back to the start."

(`RESET_LINE` at the top of `m01.js`, shared by all the `learn(...)` steps.)

## 4. The run — course orders, then ten kilometres

Step `chase-intro`, a radio call:
1. "That is every control you own. Now come to my wing — close, within 300 m — and we will start the run."
2. "Ten kilometres, and I will not be gentle. If you fall behind I start again; you do not get to fail this one, you get to repeat it."

Step `chase` — objective *Stay with Captain Dane Korr through the ten-kilometre run.*
While the pilot is still closing to 300 m the HUD rule reads *"Close to within 300 m of
Dane to start the run."*; once the run is live it reads *"Stay within 1 km of Dane for the
whole course to pass."*

Optional objective (100 cr bonus), shown under the objective while the run is live:
*Stay within 500 m of Captain Dane Korr through the ten-kilometre run.*
HUD bonus line: *Bonus: within 500 m · now NNN m* (turns red past 500 m).

**Falling more than 1 km behind** is not a failure — Dane says:

> "You are too slow. Follow me back to the start and we will run it again."

and the run restarts from the fixed start of `m01-range`.

## 5. The gunnery pass — Dane watches, and does not shoot

Step `drone-brief`, radio:
1. "Not bad. Now the gunnery pass: two drones in front of you."
2. "I will watch from clear air. Put them down."

Steps `spawn-drones` / `drone-drill` — objective *Shoot down both practice drones.*
Two `practice_drone` targets, 600–750 m out, restored if a reload wipes them. **The pilot
does this alone:** Dane is on `actorRole: "observe"` and his guns stay cold. He only opens
fire in the ambush.

## 6. The ambush — Dane fights, the strangers talk

Step `ambush-warning`, radio from Dane:
1. "Hold on. Those are not school drones."
2. "Two ships, guns live, inbound hot. I do not recognise the hulls — and nobody flies this range without a school transponder."
3. "I will keep one busy. You take the other. Do not let them split us."

Step `ambush-taunt`, radio from the **Unmarked pilot**:
1. "Korr's newest cadet. We bought the school's whole flight schedule, so spare us the brave face."
2. "Cut your engines and hand over the Wasp. Refuse, and we will take it out of the debris."

Steps `spawn-ambush` / `defeat-ambush` — objective *Defeat both attackers.* Two `raider`
hulls, 700–900 m out, replaced if they are lost. Dane is on `actorRole: "guard"`: this is
the only point in the act where he fires, and his rounds are the pilot's own basic-cannon
orange (they do no damage — he is a story actor, not a kill credit).

The word "raider" never appears on screen; nobody in the scene knows who they are.

## 7. Success

Step `sortie-complete`, radio:
1. "Both down. I saw the whole pass."
2. "I still do not know who they were. School business, out here, with guns hot — we will find out. Not today."
3. "That is your first sortie, cadet. Get back to the school and collect your pay — and try to make the landing look deliberate."

Then the act-complete card: title **First Sortie**, line *Paid 50 cr.*, detail
*"The campaign continues from the chapter menu."*

## 8. Failure and system strings

The Wasp destroyed — the **MISSION FAILED** card (`src/data/campaign/m01.js`, `fails.message`;
also the small alert popup, which reads the same string):

> "Your Wasp was destroyed."

The card's detail line: *"This act has no checkpoints yet, so it restarts from the top."*
Buttons: **Start from the beginning**, **Return to campaign menu**.
The alert popup (top of the screen, auto-dismisses) reads **Mission failed: First Sortie**
followed by the same sentence and *Click to dismiss*.

Losing the bonus is not a failure; it shows an **Optional objective failed** notice with the
objective text and *Click to dismiss*.

---

## Where to edit

| Words | File |
| --- | --- |
| All of the above | `src/data/campaign/m01.js` (steps named above) |
| Lesson reset line | `m01.js`, `const RESET_LINE` |
| Control names on the hold bar | `src/data/missions/rules.js`, `MISSION_CONTROLS[...].label` |
| Failure sentence | `m01.js`, `fails.message` |
| Act-complete / failed card wording and buttons | `src/ui/campaign.js` |
| Alert popup wording | `src/ui/missionlog.js`, `failureNoticeHtml` |
| HUD rule and bonus lines | `src/ui/mission-hud.js` |
