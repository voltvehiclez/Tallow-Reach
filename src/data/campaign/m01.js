// Campaign mission 01: the cadet's first flight.
//
// The act is a lesson in a straight line. Captain Dane Korr leads, the cadet
// follows and the controls are learned by doing them: the throttle, the mouse,
// strafe, lift, roll and finally boost. Then he runs a ten-kilometre course that
// the cadet has to keep up with, watches a drone pass, and joins the ambush.
//
// Failing to keep up is never a mission failure: the cadet is told, Korr flies
// back to the fixed start of the course and that same objective is flown again.
// Losing the Wasp is a real failure (the failed screen offers the beginning;
// this act has no checkpoints).
//
// The optional objective pays a bonus for staying close through the lesson. It
// can be lost, but it can never fail the act.

import { briefing, mission, radio } from "../missions/templates.js";
import { CAMPAIGN_HOME_POCKET } from "./galaxy.js";

const place = CAMPAIGN_HOME_POCKET;
const captain = "Captain Dane Korr";
const portrait = "captain-dane-korr";

// The course data (`src/data/flight-courses.js`) owns the fixed starts; the act
// only names which phase it is on.
const follow = {
  actor: "captain_korr",
  actorRole: "lead",
  course: "m01-range",
};

const RESET_LINE = "That is not passable. We will do it again — follow me back to the start.";

/** One control to learn: hold it for about three seconds and it counts. */
const learn = (id, control, objective) => ({
  id,
  kind: "control",
  place,
  control,
  hold: 3,
  group: "lesson",
  maxGap: 1100,
  resetLine: RESET_LINE,
  ...follow,
  objective,
});

export const M01_FIRST_SORTIE = mission({
  id: "campaign.m01-first-sortie",
  title: "First Sortie",
  credits: 50,
  fixedShip: "wasp",
  offeredAt: place,
  origin: place,
  // A destroyed Wasp ends the sortie. The failed screen restarts the act.
  fails: {
    on: ["player-dead"],
    action: "keep",
    message: "Your Wasp was destroyed. The sortie is over.",
  },
  // Bonus only: staying close through the lesson. Losing it costs credits and
  // nothing else.
  optional: [
    {
      id: "stay-with-korr",
      kind: "stay-within",
      actor: "captain_korr",
      metres: 350,
      during: "lesson",
      bonus: 100,
      objective: "Keep within 350 m of Captain Dane Korr through the control lesson.",
    },
  ],
  steps: [
    briefing({
      id: "graduation",
      speaker: captain,
      portrait,
      place,
      objective: "Hear Captain Dane Korr's briefing at Korr Flight School.",
      lines: [
        "So the school finally let you off the leash. A Wasp, a full tank, and a captain who would rather be flying than talking.",
        "No ceremony. Launch, form up on my wing and do what I say. Fly well and you will be home before the range lights cool.",
        "One more thing — the school shop is shut until your certificate is signed. Nothing on those shelves is for sale today. Say your goodbyes and get to your ship.",
      ],
    }),
    {
      id: "launch-order",
      kind: "script",
      place,
      requiresFlying: true,
      objective: "Launch and form up on Captain Dane Korr.",
      action: {
        kind: "spawn-ship",
        place,
        enemy: "captain_korr",
        count: 1,
        spawnDist: [600, 700],
        // A story actor, not a target: the runner brings him back if he ever
        // vanishes (a reload, a re-entry), and his course starts where the data
        // says it does.
        respawn: true,
        story: true,
        role: "lead",
        course: "m01-range",
        phase: "lesson",
      },
    },
    radio({
      id: "brief-throttle",
      speaker: captain,
      portrait,
      place,
      group: "lesson",
      objective: "Listen to Captain Dane Korr.",
      lines: [
        "First, the throttle. W eases it forward, S pulls it back. Hold one until the Wasp answers you.",
        "And keep me in sight. I am not going to fly circles waiting for you.",
      ],
    }),
    learn("learn-throttle", "throttle-forward", "Throttle forward with W."),
    learn("learn-throttle-back", "throttle-back", "Pull the throttle back with S."),
    radio({
      id: "brief-steer",
      speaker: captain,
      portrait,
      place,
      group: "lesson",
      objective: "Listen to Captain Dane Korr.",
      lines: [
        "Now the nose. The mouse steers. Small movements — the Wasp is quicker than anything you flew at the school.",
      ],
    }),
    learn("learn-steer", "steer", "Steer with the mouse."),
    radio({
      id: "brief-strafe",
      speaker: captain,
      portrait,
      place,
      group: "lesson",
      objective: "Listen to Captain Dane Korr.",
      lines: [
        "A strafes left, D strafes right. Slide sideways without turning the nose.",
      ],
    }),
    learn("learn-strafe-left", "strafe-left", "Strafe left with A."),
    learn("learn-strafe-right", "strafe-right", "Strafe right with D."),
    radio({
      id: "brief-lift",
      speaker: captain,
      portrait,
      place,
      group: "lesson",
      objective: "Listen to Captain Dane Korr.",
      lines: [
        "Space lifts you, C drops you. Do not fight the drift — correct it.",
      ],
    }),
    learn("learn-rise", "lift-up", "Rise with Space."),
    learn("learn-drop", "lift-down", "Drop with C."),
    radio({
      id: "brief-roll",
      speaker: captain,
      portrait,
      place,
      group: "lesson",
      objective: "Listen to Captain Dane Korr.",
      lines: [
        "Q rolls left, E rolls right. Roll when the nose needs to go somewhere the mouse cannot reach.",
      ],
    }),
    learn("learn-roll-left", "roll-left", "Roll left with Q."),
    learn("learn-roll-right", "roll-right", "Roll right with E."),
    radio({
      id: "brief-boost",
      speaker: captain,
      portrait,
      place,
      group: "lesson",
      objective: "Listen to Captain Dane Korr.",
      lines: [
        "Last one. Shift is boost. It burns your power, and it is the only way you will stay with me.",
      ],
    }),
    learn("learn-boost", "boost", "Boost with Shift."),
    radio({
      id: "chase-intro",
      speaker: captain,
      portrait,
      place,
      objective: "Hear Captain Dane Korr's course orders.",
      lines: [
        "That is every control you own. Now the run: ten kilometres, and I will not be gentle.",
        "If you fall behind, I start again. You do not get to fail this one — you get to repeat it.",
      ],
    }),
    {
      id: "chase",
      kind: "chase",
      place,
      group: "chase",
      follow: "captain_korr",
      actor: "captain_korr",
      actorRole: "lead",
      course: "m01-range",
      coursePhase: "chase",
      distance: 10000,
      maxGap: 1000,
      objective: "Stay with Captain Dane Korr through the ten-kilometre run.",
      resetLine: "You are too slow. Follow me back to the start and we will run it again.",
    },
    radio({
      id: "drone-brief",
      speaker: captain,
      portrait,
      place,
      actor: "captain_korr",
      actorRole: "observe",
      objective: "Hear Captain Dane Korr's gunnery orders.",
      lines: [
        "Not bad. Now the gunnery pass: two drones in front of you.",
        "I will watch from clear air. Put them down.",
      ],
    }),
    {
      id: "spawn-drones",
      kind: "script",
      place,
      requiresFlying: true,
      objective: "Shoot down both practice drones.",
      action: {
        kind: "spawn-wave",
        place,
        enemy: "practice_drone",
        count: 2,
        spawnDist: [600, 750],
        // The drones are runtime objects; a reload or a dock wipes them, and the
        // runner tops the wave back up to what the kill objective still needs.
        respawn: true,
      },
    },
    {
      id: "drone-drill",
      kind: "kill",
      place,
      enemy: "practice_drone",
      count: 2,
      actor: "captain_korr",
      actorRole: "observe",
      objective: "Shoot down both practice drones.",
    },
    radio({
      id: "ambush-warning",
      speaker: captain,
      portrait,
      place,
      objective: "Answer Captain Dane Korr.",
      lines: [
        "Hold on. Those are not school drones.",
        "Two raiders, inbound hot with guns live. This is not a drill — defend yourself!",
        "I will keep them busy. You finish them.",
      ],
    }),
    {
      id: "spawn-ambush",
      kind: "script",
      place,
      requiresFlying: true,
      objective: "Defeat both raiders.",
      action: {
        kind: "spawn-wave",
        place,
        enemy: "raider",
        count: 2,
        spawnDist: [700, 900],
        respawn: true,
      },
    },
    {
      id: "defeat-ambush",
      kind: "kill",
      place,
      enemy: "raider",
      count: 2,
      actor: "captain_korr",
      actorRole: "guard",
      objective: "Defeat both raiders.",
    },
    radio({
      id: "sortie-complete",
      speaker: captain,
      portrait,
      place,
      objective: "Hear Captain Dane Korr's final report.",
      lines: [
        "Both down. I saw the whole pass.",
        "That is your first sortie, cadet. Get back to the school and collect your pay — and try to make the landing look deliberate.",
      ],
    }),
  ],
});
