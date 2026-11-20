// The campaign's chapters and acts, in playing order. A chapter is one box on the
// campaign screen; an act is one authored mission the pilot plays from start to
// finish. Adding an act later is one record here plus its mission file — the
// campaign screen, the unlock order and the restart rules all read this list.
//
//   id       stable id, used by saves and by the campaign screen
//   n        the name the pilot sees
//   d        one spoiler-safe line about the act
//   mission  the campaign mission id (src/data/campaign/m01.js)
//   planned  a box that exists but cannot be played yet: it is drawn locked, so
//            the shape of the campaign is visible before it is written
//
// An act is available when every earlier act is finished, or when it is the one
// currently in progress. There is no "offered at a station" rule in campaign
// mode: the chapter menu is where an act starts.
//
// Only acts with a `mission` are playable order; the `planned` ones are scenery
// for the menu and never enter CAMPAIGN_ACTS, so they cannot be started, saved or
// counted as progress.

export const CAMPAIGN_CHAPTERS = Object.freeze([
  Object.freeze({
    id: "chapter-1",
    n: "Chapter 1: Auric Reach",
    d: "Flight school, a captain who expects better, and the first people who want you dead.",
    acts: Object.freeze([
      Object.freeze({
        id: "act-1",
        n: "Act 1: First Sortie",
        d: "Graduate, learn the Wasp, and survive your first real contact.",
        mission: "campaign.m01-first-sortie",
      }),
      Object.freeze({ id: "act-2", n: "Act 2: The Ferrite Run", d: "Fly the range with a hold full of ore and a schedule to keep.", planned: true }),
      Object.freeze({ id: "act-3", n: "Act 3: Range Patrol", d: "Keep the school's lanes clear of anything that is not a school ship.", planned: true }),
      Object.freeze({ id: "act-4", n: "Act 4: Night Watch", d: "Stand a watch on the dark side of the range.", planned: true }),
      Object.freeze({ id: "act-5", n: "Act 5: The Debris Field", d: "Something is hiding in the wreckage of an old hauler.", planned: true }),
      Object.freeze({ id: "act-6", n: "Act 6: Graduation", d: "Earn the certificate Korr keeps refusing to sign.", planned: true }),
    ]),
  }),
  Object.freeze({
    id: "chapter-2",
    n: "Chapter 2: The Kestrel Line",
    d: "A trade route with too many quiet gaps, and a captain with a past on it.",
    planned: true,
    acts: Object.freeze([
      Object.freeze({ id: "act-1", n: "Act 1: Freight", d: "Run cargo where the escorts do not go.", planned: true }),
      Object.freeze({ id: "act-2", n: "Act 2: Toll", d: "Someone is charging for passage on a lane nobody owns.", planned: true }),
      Object.freeze({ id: "act-3", n: "Act 3: The Kestrel", d: "Find the hull the line is named for.", planned: true }),
      Object.freeze({ id: "act-4", n: "Act 4: Old Debts", d: "Korr's name is on a manifest he never signed.", planned: true }),
    ]),
  }),
  Object.freeze({
    id: "chapter-3",
    n: "Chapter 3: Hollow Ground",
    d: "An empty pocket, an empty station, and a beacon that should not be broadcasting.",
    planned: true,
    acts: Object.freeze([
      Object.freeze({ id: "act-1", n: "Act 1: The Beacon", d: "Answer a signal from a place nobody lives.", planned: true }),
      Object.freeze({ id: "act-2", n: "Act 2: Cold Rooms", d: "Search a station that has been dark for years.", planned: true }),
      Object.freeze({ id: "act-3", n: "Act 3: Whoever Was Here", d: "Learn who left, and what they left behind.", planned: true }),
    ]),
  }),
  Object.freeze({
    id: "chapter-4",
    n: "Chapter 4: The Reach Answers",
    d: "Every name from the earlier chapters comes back at once.",
    planned: true,
    acts: Object.freeze([
      Object.freeze({ id: "act-1", n: "Act 1: Recall", d: "The school calls every pilot home.", planned: true }),
      Object.freeze({ id: "act-2", n: "Act 2: The Long Line", d: "Hold a line you cannot see the end of.", planned: true }),
      Object.freeze({ id: "act-3", n: "Act 3: Auric", d: "The star, the range, and what the school was really for.", planned: true }),
    ]),
  }),
]);

/** Every playable act, flattened in playing order, each carrying its chapter. */
export const CAMPAIGN_ACTS = Object.freeze(
  CAMPAIGN_CHAPTERS.flatMap(chapter =>
    chapter.acts
      .filter(act => typeof act.mission === "string" && act.mission.length > 0)
      .map(act => Object.freeze({ ...act, chapterId: chapter.id, chapterName: chapter.n })),
  ),
);

/** A chapter's planned boxes: drawn locked, never started. */
export const plannedActs = chapter =>
  (chapter?.acts || []).filter(act => typeof act.mission !== "string" || !act.mission);
