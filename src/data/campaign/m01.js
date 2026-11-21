// Campaign mission 01: the cadet's first flight.
//
// The act is a lesson in a straight line. Captain Dane Korr leads, the cadet
// follows and the controls are learned by doing them: the throttle, the brake,
// reverse, the mouse, strafe, lift, roll and finally boost. Each hold is one
// second, so the lesson is learned by flying it, not by waiting on a timer.
// Then he runs a ten-kilometre course through the ferrite field that the cadet
// has to keep up with, watches a drone pass, and joins the ambush.
//
// Failing to keep up is never a mission failure: the cadet is told, Korr flies
// back to the fixed start of the course and that same objective is flown again.
// Losing the Wasp is a real failure (the failed screen offers the beginning;
// this act has no checkpoints).
//
// The optional objective pays a bonus for staying close through the ten-kilometre
// run. It can be lost, but it can never fail the act.

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

const RESET_LINE = "You need to keep closer to pass. Let's do it again — follow me back to the start.";

/** One control to learn: hold it for a second and it counts. The HUD draws the
 *  hold as a percentage bar, so one second is a full bar. */
const learn = (id, control, objective) => ({
  id,
  kind: "control",
  place,
  control,
  hold: 1,
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
    message: "Your Wasp was destroyed.",
  },
  // Bonus only: staying close through the ten-kilometre run. Five hundred metres
  // is the authored pass mark; the run's own 1 km reset is a separate, harder
  // rule. Losing the bonus costs credits and nothing else.
  optional: [
    {
      id: "stay-with-korr",
      kind: "stay-within",
      actor: "captain_korr",
      metres: 500,
      during: "chase",
      bonus: 100,
      objective: "Stay within 500 m of Captain Dane Korr through the ten-kilometre run.",
    },
  ],
  steps: [
    briefing({
      id: "graduation",
      speaker: captain,
      portrait,
      place,
      objective: "Hear Captain Dane Korr's briefing at Korr Flight Academy.",
      lines: [
        "So the academy finally let you off the leash. A Wasp, a full tank, and a captain who would rather be flying than talking.",
        "No ceremony. Launch, form up on my wing and do what I say. Fly well and you will be home before the range lights cool.",
        "One more thing — the academy shop is shut until your certificate is signed. Nothing on those shelves is for sale today. Say your goodbyes and get to your ship.",
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
        "First, the throttle — W pushes you forward.",
      ],
    }),
    learn("learn-throttle", "throttle-forward", "Throttle forward with W."),
    radio({
      id: "brief-brake",
      speaker: captain,
      portrait,
      place,
      group: "lesson",
      objective: "Listen to Captain Dane Korr.",
      lines: [
        "Now hold Ctrl to brake to a stop.",
      ],
    }),
    learn("learn-brake", "brake", "Brake to a stop with Ctrl."),
    radio({
      id: "brief-reverse",
      speaker: captain,
      portrait,
      place,
      group: "lesson",
      objective: "Listen to Captain Dane Korr.",
      lines: [
        "S pulls the throttle into reverse.",
      ],
    }),
    learn("learn-throttle-back", "throttle-back", "Pull the throttle back with S."),
    radio({
      id: "brief-steer",
      speaker: captain,
      portrait,
      place,
      group: "lesson",
      objective: "Listen to Captain Dane Korr.",
      lines: [
        "The mouse steers. Small movements — the Wasp is quicker than anything you flew at the academy.",
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
        "A strafes left, D strafes right.",
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
        "Space lifts you, C drops you.",
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
        "Q rolls left, E rolls right.",
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
        "Last one — Shift is boost. You will need it to stay with me.",
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
        "That is every control you own. Now come to my wing — close, within 300 m — and we will start the run.",
        "Ten kilometres, and I will not be gentle. If you fall behind I start again; you do not get to fail this one, you get to repeat it.",
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
      // The run only starts once the pilot is back on his wing: after the control
      // lesson a pilot may be a kilometre away, and chasing a ship already at speed
      // is not a lesson, it is a punishment.
      gather: 300,
      distance: 10000,
      maxGap: 1000,
      speaker: captain,
      portrait,
      objective: "Stay with Captain Dane Korr through the ten-kilometre run.",
      resetLine: "You need to keep closer to pass. Let's do it again — follow me back to the start.",
    },
    {
      id: "spawn-drones",
      kind: "script",
      place,
      requiresFlying: true,
      objective: "Destroy both practice drones with your primary weapon.",
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
    radio({
      id: "drone-brief",
      speaker: captain,
      portrait,
      place,
      allowCombat: true,
      actor: "captain_korr",
      actorRole: "observe",
      objective: "Hear Captain Dane Korr's primary weapon orders.",
      lines: [
        "Not bad. Now the gunnery pass: two practice drones are out in front of you.",
        "Keys 1 to 5 select your primary weapon bays. Your basic cannons are in slot 1 — aim at the lead pip and hold Left Click to fire.",
        "I will watch from clear air. Destroy both drones with your primary weapon.",
      ],
    }),
    {
      id: "drone-drill",
      kind: "kill",
      place,
      enemy: "practice_drone",
      count: 2,
      actor: "captain_korr",
      actorRole: "observe",
      objective: "Destroy both practice drones with your primary weapon.",
    },
    {
      id: "spawn-missile-drones",
      kind: "script",
      place,
      requiresFlying: true,
      objective: "Destroy both practice drones with your secondary weapon.",
      action: {
        kind: "spawn-wave",
        place,
        enemy: "practice_drone",
        count: 2,
        spawnDist: [600, 750],
        respawn: true,
      },
    },
    radio({
      id: "missile-brief",
      speaker: captain,
      portrait,
      place,
      allowCombat: true,
      actor: "captain_korr",
      actorRole: "observe",
      objective: "Hear Captain Dane Korr's secondary weapon orders.",
      lines: [
        "Good shooting. Second wave is on the range — now for your secondary weapons.",
        "Keys 6 to 0 select your secondary bays, where your basic missiles are fitted. Hold a target inside the aiming ring until the lock tone sounds, then press Right Click to launch.",
        "Destroy this wave with your secondary weapon.",
      ],
    }),
    {
      id: "missile-drill",
      kind: "kill",
      place,
      enemy: "practice_drone",
      count: 2,
      actor: "captain_korr",
      actorRole: "observe",
      objective: "Destroy both practice drones with your secondary weapon.",
    },
    // Neither Dane nor the cadet knows who these two are. They warp in as Dane
    // spots them and circle both ships while they make their demand; Dane holds
    // his fire until the threat is finished, and opening fire early provokes them
    // into attacking at once.
    {
      id: "spawn-ambush",
      kind: "script",
      place,
      requiresFlying: true,
      objective: "Answer Captain Dane Korr.",
      action: {
        kind: "spawn-wave",
        place,
        enemy: "raider",
        count: 2,
        spawnDist: [650, 800],
        role: "prowl",
        warpIn: true,
        respawn: true,
      },
    },
    radio({
      id: "ambush-warning",
      speaker: captain,
      portrait,
      place,
      allowCombat: true,
      actor: "captain_korr",
      actorRole: "observe",
      objective: "Answer Captain Dane Korr.",
      lines: [
        "Hold on. Those are not academy drones.",
        "Two ships, guns live, inbound hot. I do not recognise the hulls — and nobody flies this range without an academy transponder.",
      ],
    }),
    radio({
      id: "ambush-taunt",
      speaker: "Unmarked pilot",
      portrait: "unmarked-pilot",
      place,
      allowCombat: true,
      actor: "captain_korr",
      actorRole: "observe",
      objective: "Hear the strangers out.",
      lines: [
        "Korr's newest cadet. We bought the academy's whole flight schedule, so spare us the brave face.",
        "Cut your engines and hand over the Wasp. Refuse, and we will take it out of the debris.",
      ],
    }),
    {
      id: "defeat-ambush",
      kind: "kill",
      place,
      enemy: "raider",
      count: 2,
      actor: "captain_korr",
      actorRole: "guard",
      objective: "Defeat both attackers.",
    },
    radio({
      id: "sortie-complete",
      speaker: captain,
      portrait,
      place,
      objective: "Hear Captain Dane Korr's final report.",
      lines: [
        "Both down. I saw the whole pass.",
        "I still do not know who they were. Academy business, out here, with guns hot — we will find out. Not today.",
        "That is your first sortie, cadet. Get back to the academy, dock, and collect your pay — and try to make the landing look deliberate.",
      ],
    }),
    {
      id: "dock-at-academy",
      kind: "dock",
      place,
      objective: "Dock at Korr Flight Academy.",
    },
  ],
});
