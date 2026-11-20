// Campaign mission 01: the cadet's first flight.
// Captain Dane Korr takes the graduate out to the training range, then lets the
// cadet prove the basics alone before the first real contact finds them.

import { briefing, mission, radio } from "../missions/templates.js";
import { CAMPAIGN_HOME_POCKET } from "./galaxy.js";

const place = CAMPAIGN_HOME_POCKET;
const captain = "Captain Dane Korr";
const portrait = "captain-dane-korr";

export const M01_FIRST_SORTIE = mission({
  id: "campaign.m01-first-sortie",
  title: "First Sortie",
  credits: 50,
  fixedShip: "wasp",
  offeredAt: place,
  origin: place,
  steps: [
    briefing({
      id: "graduation",
      speaker: captain,
      portrait,
      place,
      objective: "Hear Captain Dane Korr's graduation briefing.",
      lines: [
        "Graduated, eh? Good. The school finally trusts you with a Wasp where everyone can see it.",
        "I am not going to hold your hand the whole way out. I will fly the first pass, you keep me on your six, and then we see what you can do alone.",
      ],
    }),
    {
      id: "launch-order",
      kind: "script",
      place,
      requiresFlying: true,
      objective: "Launch and join Captain Dane Korr on the training range.",
      action: {
        kind: "spawn-ship",
        place,
        enemy: "captain_korr",
        count: 1,
        spawnDist: [600, 700],
      },
    },
    radio({
      id: "first-pass",
      speaker: captain,
      portrait,
      place,
      objective: "Listen to Captain Dane Korr's flight briefing.",
      lines: [
        "Throttle is W and S. Mouse steers. Space and C move you up and down, and Q and E roll when the nose needs correcting.",
        "Shift is boost. Use it when you have to catch up, not because it sounds clever on the radio.",
        "Stay on my tail. When you have the picture, I will put some drones in front of you.",
      ],
    }),
    {
      id: "follow-korr",
      kind: "survive",
      place,
      count: 5,
      objective: "Follow Captain Dane Korr through the first flight pass.",
    },
    {
      id: "spawn-gunnery-drones",
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
        // The drones are runtime objects; a quit, reload or death wipes the
        // wave. `respawn` lets the runner top the wave back up to what the
        // kill objective still needs when the pilot re-enters the school.
        respawn: true,
      },
    },
    {
      id: "gunnery-drones",
      kind: "kill",
      place,
      enemy: "practice_drone",
      count: 2,
      objective: "Shoot down both practice drones.",
    },
    radio({
      id: "solo-orders",
      speaker: captain,
      portrait,
      place,
      objective: "Listen to Captain Dane Korr's solo training orders.",
      lines: [
        "That was passable. Now fly the short course without me in your mirror.",
        "Two more drones will stand in for anything that decides it owns the range. Take them apart and make the Wasp yours.",
        "Check your shield, hull, power and missiles on the HUD if your attention starts wandering. Those are the numbers that keep you in one piece.",
      ],
    }),
    {
      id: "spawn-solo-drones",
      kind: "script",
      place,
      requiresFlying: true,
      objective: "Run the solo course and shoot down both practice drones.",
      action: {
        kind: "spawn-wave",
        place,
        enemy: "practice_drone",
        count: 2,
        spawnDist: [600, 750],
        // The drones are runtime objects; a quit, reload or death wipes the
        // wave. `respawn` lets the runner top the wave back up to what the
        // kill objective still needs when the pilot re-enters the school.
        respawn: true,
      },
    },
    {
      id: "solo-drill",
      kind: "parallel",
      place,
      objective: "Run the solo course and shoot down both practice drones.",
      steps: [
        {
          id: "solo-course",
          kind: "survive",
          place,
          count: 5,
          objective: "Run the solo course.",
        },
        {
          id: "solo-practice-drones",
          kind: "kill",
          place,
          enemy: "practice_drone",
          count: 2,
          objective: "Shoot down both practice drones.",
        },
      ],
    },
    radio({
      id: "ambush-warning",
      speaker: captain,
      portrait,
      place,
      objective: "Answer Captain Dane Korr.",
      lines: [
        "Clean work. I told the school you would not embarrass me.",
        "One last check before I sign your certificate —",
      ],
    }),
    {
      id: "pirate-ambush",
      kind: "script",
      place,
      requiresFlying: true,
      objective: "Stay flying through the pirate ambush.",
      action: {
        kind: "spawn-wave",
        place,
        enemy: "raider",
        count: 2,
        spawnDist: [600, 750],
        respawn: true,
      },
    },
    {
      id: "defeat-ambush",
      kind: "kill",
      place,
      enemy: "raider",
      count: 2,
      objective: "Defeat the pirates.",
    },
    radio({
      id: "sortie-complete",
      speaker: captain,
      portrait,
      place,
      objective: "Hear Captain Dane Korr's final report.",
      lines: [
        "Contacts down. I heard the whole thing from over here.",
        "You are cleared for the next sortie. Go home, collect your pay, and try not to scare the school on the way in.",
      ],
    }),
  ],
});
