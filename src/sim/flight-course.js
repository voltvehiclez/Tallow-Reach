// Turns an authored flight course (src/data/flight-courses.js) into waypoints in
// a pocket. Pure: no screen, no time, no state. A story ship owns one of these
// while it leads a lesson or a chase, and "go back to the beginning" is simply a
// new course built from the same phase start.

import { V, UP } from "../util/math.js";
import { courseDef, DEFAULT_COURSE_PHASE } from "../data/flight-courses.js";

const DEG = Math.PI / 180;

/** Build the waypoints of one phase. Returns null when the course/phase is unknown. */
export function buildCourse(courseId, phase = DEFAULT_COURSE_PHASE) {
  const def = courseDef(courseId);
  const spec = def?.[phase] || def?.[DEFAULT_COURSE_PHASE];
  if (!def || !spec) return null;
  const heading = (Number(spec.heading) || 0) * DEG;
  const start = V(...(spec.start || def.start));
  let dir = V(0, 0, -1).applyAxisAngle(UP, heading).normalize();
  const pos = start.clone();
  const points = [];
  let total = 0;
  for (const leg of spec.legs || []) {
    const length = Math.max(1, Number(leg.length) || 1);
    dir = dir.clone().applyAxisAngle(UP, (Number(leg.turn) || 0) * DEG).normalize();
    const step = dir.clone().multiplyScalar(length);
    step.y += Math.tan((Number(leg.climb) || 0) * DEG) * length;
    pos.add(step);
    total += length;
    points.push({
      pos: pos.clone(),
      length,
      speed: Math.max(1, Number(leg.speed) || 100),
      boost: leg.boost === true,
    });
  }
  return {
    id: courseId,
    phase,
    start,
    heading,
    points,
    total,
    index: 0,
    travelled: 0,
    mode: "return",   // fly to the phase start, wait for the pilot, then run
    done: false,
    boosting: false,
  };
}

/** Begin the course at its own start (used when a story beat hands it over). */
export function startCourseAtBeginning(courseId, phase = DEFAULT_COURSE_PHASE) {
  const course = buildCourse(courseId, phase);
  if (course) course.mode = "return";
  return course;
}

/** True once the ship has flown every authored leg. */
export const courseFinished = course => !!course && (course.done || course.index >= course.points.length);

/** Distance along the course still to fly, in metres. */
export const courseRemaining = course => {
  if (!course) return 0;
  let left = 0;
  for (let i = course.index; i < course.points.length; i++) left += course.points[i].length;
  return left;
};
