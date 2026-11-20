// Authored flight courses for story ships. A course is a fixed point in the
// pocket plus legs a pilot can follow: each leg turns, climbs and runs for a
// length at a speed, and may light the boost. Nothing here is saved — a course is
// rebuilt from this data whenever it starts.
//
// A course has phases (the campaign lesson uses `lesson` then `chase`). Each
// phase has its own fixed start and heading, so "back to the beginning" always
// means the same point in space.
//
//   start    [x, y, z] in pocket space where the phase begins
//   heading  degrees around Y from the ship's forward axis
//   legs     length (m), speed (m/s), optional turn/climb in degrees, boost
//
// `phase: "lesson"` is the default when a spawn names only the course.

export const FLIGHT_COURSES = {
  "m01-range": {
    n: "Korr's training run",
    // Clear of the station and the training field, high enough to see the range.
    start: [0, 160, 2200],
    lesson: {
      heading: 0,
      legs: [
        { length: 500, speed: 55, turn: 0, climb: 0 },
        { length: 450, speed: 55, turn: 35, climb: 3 },
        { length: 400, speed: 55, turn: -30, climb: -3 },
        { length: 450, speed: 55, turn: -25, climb: 0 },
      ],
    },
    // The high-speed chase: a fixed start, just over ten kilometres of course,
    // with the boost lit on the long straights so the pilot has to work.
    chase: {
      heading: 20,
      start: [400, 240, 3200],
      legs: [
        // A slow first leg: enough time to spool up from the form-up before the
        // chase gets fast.
        { length: 900, speed: 95, turn: 0, climb: 0 },
        { length: 900, speed: 175, turn: 18, climb: 2 },
        { length: 900, speed: 185, turn: -14, climb: -2 },
        { length: 1000, speed: 190, turn: 10, climb: 3, boost: true },
        { length: 900, speed: 175, turn: -22, climb: -3 },
        { length: 900, speed: 180, turn: 12, climb: 0 },
        { length: 1000, speed: 195, turn: -8, climb: 2, boost: true },
        { length: 900, speed: 180, turn: 20, climb: -2 },
        { length: 900, speed: 185, turn: -16, climb: 2 },
        { length: 900, speed: 190, turn: 6, climb: -3, boost: true },
        { length: 900, speed: 180, turn: 14, climb: 3 },
        { length: 900, speed: 185, turn: -10, climb: -2 },
      ],
    },
  },
};

export const DEFAULT_COURSE_PHASE = "lesson";

export const courseDef = id => FLIGHT_COURSES[id] || null;
